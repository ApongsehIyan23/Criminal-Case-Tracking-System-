// Builds the application with its real services. Used by the local server and by Vercel.
const { createApp } = require('./app');
const { loadConfig } = require('./config');
const { createDb } = require('./db');
const { createSendgridMailer } = require('./services/email');
const { createNeonClient } = require('./services/neon');
const { createStorage } = require('./services/storage');

function createServer() {
  const config = loadConfig();
  const app = createApp({
    db: createDb(config.databaseUrl),
    config,
    mailer: createSendgridMailer(config),
    neon: createNeonClient(config),
    storage: createStorage(config),
  });
  return { app, config };
}

module.exports = { createServer };
