const { SESSION_MINUTES } = require('../constants');
const { ApiError } = require('../errors');
const { logAudit } = require('../services/audit');
const { signToken, verifyToken } = require('../services/session');

const bearerToken = (req) => /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1] || null;

const actorFrom = (row) => ({ userId: row.user_id, email: row.email, role: row.role });

// Ends a session that has been idle for at least `minutes`. Clearing and logging
// happen together, so each expiry is recorded exactly once.
async function expireIfIdle(db, userId, minutes, ip) {
  return db.transaction(async (client) => {
    const expired = await client.query(
      `UPDATE users SET last_activity_at = NULL
        WHERE user_id = $1 AND last_activity_at <= now() - make_interval(mins => $2)
        RETURNING user_id, email, role`,
      [userId, minutes],
    );
    if (expired.rowCount) {
      await logAudit(client, { actor: actorFrom(expired.rows[0]), actionType: 'SESSION_EXPIRED', ip });
    }
    return expired.rowCount > 0;
  });
}

function createAuthMiddleware({ db, config }) {
  async function authenticate(req, res, next) {
    const token = bearerToken(req);
    if (!token) throw new ApiError(401, 'NOT_AUTHENTICATED');

    let payload;
    try {
      payload = verifyToken(token, config.jwtSecret);
    } catch (err) {
      if (err.name !== 'TokenExpiredError') throw new ApiError(401, 'NOT_AUTHENTICATED');
      const { sub } = verifyToken(token, config.jwtSecret, { ignoreExpiration: true });
      await expireIfIdle(db, sub, SESSION_MINUTES, req.ip);
      throw new ApiError(401, 'SESSION_EXPIRED');
    }

    // Checks the inactivity window and records this activity in one statement.
    // Role and status come from the database, never from the token.
    const active = await db.query(
      `UPDATE users SET last_activity_at = now()
        WHERE user_id = $1 AND status = 'ACTIVE'
          AND last_activity_at > now() - make_interval(mins => $2)
        RETURNING user_id, email, role, full_name, preferred_language`,
      [payload.sub, SESSION_MINUTES],
    );
    if (!active.rowCount) {
      await expireIfIdle(db, payload.sub, SESSION_MINUTES, req.ip);
      throw new ApiError(401, 'SESSION_EXPIRED');
    }

    const row = active.rows[0];
    req.user = { ...actorFrom(row), fullName: row.full_name, preferredLanguage: row.preferred_language };
    res.set('X-Session-Token', signToken(row.user_id, config.jwtSecret));
    next();
  }

  const requireRole = (...roles) => async (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      await logAudit(db, {
        actor: req.user,
        actionType: 'ACCESS_DENIED',
        details: { method: req.method, path: req.originalUrl.split('?')[0] },
        ip: req.ip,
      });
      throw new ApiError(403, 'FORBIDDEN');
    }
    next();
  };

  return { authenticate, requireRole };
}

module.exports = { createAuthMiddleware, expireIfIdle, bearerToken };
