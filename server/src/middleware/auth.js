const { ApiError } = require('../errors');
const { logAudit } = require('../services/audit');
const { verifyToken } = require('../services/session');

const bearerToken = (req) => /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1] || null;

const actorFrom = (row) => ({ userId: row.user_id, email: row.email, role: row.role });

// Records the end of a session once. A newer sign-in or a continued session by the
// same user is left alone.
async function endExpiredSession(db, session, ip) {
  await db.transaction(async (client) => {
    const ended = await client.query(
      `UPDATE users SET last_activity_at = NULL
        WHERE user_id = $1 AND last_activity_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM audit_logs
                           WHERE actor_id = $1 AND action_type IN ('USER_LOGIN','SESSION_EXTENDED')
                             AND created_at >= to_timestamp($2) + interval '1 second')
        RETURNING user_id, email, role`,
      [session.sub, session.iat],
    );
    if (ended.rowCount) {
      await logAudit(client, { actor: actorFrom(ended.rows[0]), actionType: 'SESSION_EXPIRED', ip });
    }
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
      await endExpiredSession(db, verifyToken(token, config.jwtSecret, { ignoreExpiration: true }), req.ip);
      throw new ApiError(401, 'SESSION_EXPIRED');
    }

    // The token fixes when the session ends; it is never renewed. This also rejects
    // logged-out and suspended accounts. Role and status come from the database.
    const active = await db.query(
      `UPDATE users SET last_activity_at = now()
        WHERE user_id = $1 AND status = 'ACTIVE' AND last_activity_at IS NOT NULL
        RETURNING user_id, email, role, full_name, preferred_language`,
      [payload.sub],
    );
    if (!active.rowCount) throw new ApiError(401, 'SESSION_EXPIRED');

    const row = active.rows[0];
    req.user = { ...actorFrom(row), fullName: row.full_name, preferredLanguage: row.preferred_language };
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

module.exports = { createAuthMiddleware, endExpiredSession, bearerToken };
