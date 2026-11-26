const { createApp } = require('./app');
const { loadConfig } = require('./config');
const { createDb } = require('./db');
const { createSendgridMailer } = require('./services/email');
const { createNeonClient } = require('./services/neon');

const config = loadConfig();
const app = createApp({
  db: createDb(config.databaseUrl),
  config,
  mailer: createSendgridMailer(config),
  neon: createNeonClient(config),
});

app.listen(config.port, () => console.log(`CCTS API listening on http://localhost:${config.port}`));
