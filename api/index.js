// Vercel serverless entry point: every /api request is handled by the Express app.
const { createServer } = require('../server/src/server');

module.exports = createServer().app;
