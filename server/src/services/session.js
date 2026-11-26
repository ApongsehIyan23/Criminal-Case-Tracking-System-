// Sessions are a 15-minute sliding JWT plus users.last_activity_at, which is
// compared against the database clock. Logout and expiry clear last_activity_at.
const jwt = require('jsonwebtoken');
const { SESSION_MINUTES } = require('../constants');

const signToken = (userId, secret) =>
  jwt.sign({}, secret, { subject: userId, expiresIn: `${SESSION_MINUTES}m`, algorithm: 'HS256' });

const verifyToken = (token, secret, options = {}) =>
  jwt.verify(token, secret, { algorithms: ['HS256'], ...options });

module.exports = { signToken, verifyToken };
