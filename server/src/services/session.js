// A session is a JWT that ends 15 minutes after sign-in and is never renewed.
// Logout and expiry also clear users.last_activity_at.
const jwt = require('jsonwebtoken');
const { SESSION_MINUTES } = require('../constants');

const signToken = (userId, secret) =>
  jwt.sign({}, secret, { subject: userId, expiresIn: `${SESSION_MINUTES}m`, algorithm: 'HS256' });

const verifyToken = (token, secret, options = {}) =>
  jwt.verify(token, secret, { algorithms: ['HS256'], ...options });

module.exports = { signToken, verifyToken };
