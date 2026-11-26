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

app.listen(config.port, (err) => {
  // Express passes startup failures, such as a port already in use, to this callback.
  if (err) {
    console.error(`CCTS API could not start: ${err.message}`);
    process.exit(1);
  }
  console.log(`CCTS API listening on http://localhost:${config.port}`);
});
