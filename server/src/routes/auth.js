const crypto = require('crypto');
const bcrypt = require('bcrypt');
const express = require('express');
const { BCRYPT_COST, HOME_BY_ROLE, SESSION_MINUTES } = require('../constants');
const { ApiError } = require('../errors');
const { bearerToken, endExpiredSession } = require('../middleware/auth');
const { logAudit, ANONYMOUS_ACTOR } = require('../services/audit');
const { signToken, verifyToken } = require('../services/session');
const { passwordProblem } = require('../validation');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
// Compared against when there is no account, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_COST);

// The browser countdown may reach zero slightly before the server's token expires.
const EXPIRY_TOLERANCE_SECONDS = 60;

const publicUser = (u) => ({
  userId: u.userId,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  preferredLanguage: u.preferredLanguage,
});

const PENDING_INVITATION_SQL = `
  SELECT i.invitation_id, u.user_id, u.email, u.full_name, u.role, u.preferred_language
    FROM account_invitations i JOIN users u USING (user_id)
   WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > now()
     AND u.status = 'INVITATION_PENDING'`;

function createAuthRouter({ db, config, auth }) {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const fields = {};
    if (!email) fields.email = 'EMAIL_REQUIRED';
    if (!password) fields.password = 'PASSWORD_REQUIRED';
    if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_FAILED', { fields });

    const found = await db.query(
      `SELECT user_id, email, password_hash, full_name, role, status, preferred_language
         FROM users WHERE email = $1`,
      [email],
    );
    const user = found.rows[0];
    const matches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

    const fail = async (status, code, reason) => {
      await logAudit(db, {
        actor: ANONYMOUS_ACTOR,
        actionType: 'USER_LOGIN_FAILED',
        details: { attemptedEmail: email.slice(0, 255), reason },
        ip: req.ip,
      });
      throw new ApiError(status, code);
    };
    if (!user || !user.password_hash || !matches) await fail(401, 'INVALID_CREDENTIALS', 'BAD_CREDENTIALS');
    if (user.status !== 'ACTIVE') await fail(403, 'ACCOUNT_NOT_ACTIVE', user.status);

    const session = {
      userId: user.user_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      preferredLanguage: user.preferred_language,
    };
    await db.transaction(async (client) => {
      await client.query('UPDATE users SET last_activity_at = now() WHERE user_id = $1', [user.user_id]);
      await logAudit(client, { actor: session, actionType: 'USER_LOGIN', ip: req.ip });
    });

    res.json({
      token: signToken(user.user_id, config.jwtSecret),
      user: publicUser(session),
      redirectTo: HOME_BY_ROLE[user.role],
      sessionMinutes: SESSION_MINUTES,
    });
  });

  router.get('/me', auth.authenticate, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  router.post('/logout', auth.authenticate, async (req, res) => {
    await db.transaction(async (client) => {
      await client.query('UPDATE users SET last_activity_at = NULL WHERE user_id = $1', [req.user.userId]);
      await logAudit(client, { actor: req.user, actionType: 'USER_LOGOUT', ip: req.ip });
    });
    res.status(204).end();
  });

  // Called when the browser countdown reaches zero. Accepts an expired token.
  router.post('/session-expired', async (req, res) => {
    let session;
    try {
      session = verifyToken(bearerToken(req) || '', config.jwtSecret, { ignoreExpiration: true });
    } catch {
      throw new ApiError(401, 'NOT_AUTHENTICATED');
    }
    if (session.exp - Date.now() / 1000 <= EXPIRY_TOLERANCE_SECONDS) {
      await endExpiredSession(db, session, req.ip);
    }
    res.status(204).end();
  });

  router.patch('/language', auth.authenticate, async (req, res) => {
    const language = req.body?.language;
    if (!['EN', 'FR'].includes(language)) throw new ApiError(400, 'VALIDATION_FAILED');
    if (language !== req.user.preferredLanguage) {
      await db.transaction(async (client) => {
        await client.query(
          'UPDATE users SET preferred_language = $2, updated_at = now() WHERE user_id = $1',
          [req.user.userId, language],
        );
        await logAudit(client, { actor: req.user, actionType: 'LANGUAGE_CHANGED', details: { language }, ip: req.ip });
      });
    }
    res.status(204).end();
  });

  router.get('/invitations/verify', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const found = token ? await db.query(PENDING_INVITATION_SQL, [sha256(token)]) : { rows: [] };
    const invitation = found.rows[0];
    if (!invitation) {
      await logAudit(db, {
        actor: ANONYMOUS_ACTOR,
        actionType: 'ACTIVATION_FAILED',
        details: { stage: 'VERIFY' },
        ip: req.ip,
      });
      throw new ApiError(400, 'INVITATION_INVALID');
    }
    await logAudit(db, {
      actor: ANONYMOUS_ACTOR,
      actionType: 'INVITATION_VERIFIED',
      details: { userId: invitation.user_id, email: invitation.email },
      ip: req.ip,
    });
    res.json({
      email: invitation.email,
      fullName: invitation.full_name,
      preferredLanguage: invitation.preferred_language,
    });
  });

  router.post('/activate', async (req, res) => {
    const { token, password, confirmPassword } = req.body || {};
    const fields = {};
    const problem = passwordProblem(password);
    if (problem) fields.password = problem;
    if (password !== confirmPassword) fields.confirmPassword = 'PASSWORDS_DO_NOT_MATCH';
    if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_FAILED', { fields });
    if (typeof token !== 'string' || !token) throw new ApiError(400, 'INVITATION_INVALID');

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const activated = await db.transaction(async (client) => {
      // Row lock makes the token single-use even under concurrent requests.
      const found = await client.query(`${PENDING_INVITATION_SQL} FOR UPDATE`, [sha256(token)]);
      const invitation = found.rows[0];
      if (!invitation) return false;
      await client.query(
        `UPDATE users SET password_hash = $2, status = 'ACTIVE', updated_at = now() WHERE user_id = $1`,
        [invitation.user_id, passwordHash],
      );
      await client.query('UPDATE account_invitations SET used_at = now() WHERE invitation_id = $1', [
        invitation.invitation_id,
      ]);
      await logAudit(client, {
        actor: { userId: invitation.user_id, email: invitation.email, role: invitation.role },
        actionType: 'ACCOUNT_ACTIVATED',
        ip: req.ip,
      });
      return true;
    });

    if (!activated) {
      await logAudit(db, {
        actor: ANONYMOUS_ACTOR,
        actionType: 'ACTIVATION_FAILED',
        details: { stage: 'ACTIVATE' },
        ip: req.ip,
      });
      throw new ApiError(400, 'INVITATION_INVALID');
    }
    // No session is issued: the user signs in from the login screen.
    res.json({ activated: true, redirectTo: '/login' });
  });

  return router;
}

module.exports = { createAuthRouter };
