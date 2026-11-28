// Password reset links. The token is signed with a key made from the account's
// current password hash, so it needs no table: it stops working as soon as the
// password changes (single use) or after PASSWORD_RESET_MINUTES. The separate key
// also means it can never be used as a session token.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PASSWORD_RESET_MINUTES } = require('../constants');
const { isUuid } = require('../validation');

const resetKey = (passwordHash, secret) =>
  crypto.createHmac('sha256', secret).update(`password-reset:${passwordHash}`).digest('hex');

const signResetToken = (user, secret) => jwt.sign({}, resetKey(user.password_hash, secret),
  { subject: user.user_id, expiresIn: `${PASSWORD_RESET_MINUTES}m`, algorithm: 'HS256' });

// Returns the active account the token belongs to, or null. With `lock`, the row
// stays locked until the transaction ends, so a link cannot be used twice at once.
async function findResetUser(db, token, secret, { lock = false } = {}) {
  const userId = typeof token === 'string' ? jwt.decode(token)?.sub : null;
  if (!isUuid(userId)) return null;
  const found = await db.query(
    `SELECT user_id, email, password_hash, full_name, role, preferred_language
       FROM users WHERE user_id = $1 AND status = 'ACTIVE' AND password_hash IS NOT NULL${lock ? ' FOR UPDATE' : ''}`,
    [userId],
  );
  const user = found.rows[0];
  if (!user) return null;
  try {
    jwt.verify(token, resetKey(user.password_hash, secret), { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  return user;
}

module.exports = { signResetToken, findResetUser };
