// A session is a JWT that ends 15 minutes after it is issued. It is issued at
// sign-in, and again only when the user chooses "Continue session".
// Logout and expiry also clear users.last_activity_at. A password change ends
// every earlier session, because each token carries a stamp of the password.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { SESSION_MINUTES } = require('../constants');

const passwordStamp = (passwordHash, secret) =>
  crypto.createHmac('sha256', secret).update(`session:${passwordHash}`).digest('base64url').slice(0, 22);

const signToken = (userId, secret, passwordHash) =>
  jwt.sign({ pv: passwordStamp(passwordHash, secret) }, secret,
    { subject: userId, expiresIn: `${SESSION_MINUTES}m`, algorithm: 'HS256' });

const verifyToken = (token, secret, options = {}) =>
  jwt.verify(token, secret, { algorithms: ['HS256'], ...options });

module.exports = { signToken, verifyToken, passwordStamp };
