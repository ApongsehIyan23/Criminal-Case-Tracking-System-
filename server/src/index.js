// Local development server.
const { createServer } = require('./server');

const { app, config } = createServer();

app.listen(config.port, (err) => {
  // Express passes startup failures, such as a port already in use, to this callback.
  if (err) {
    console.error(`CCTS API could not start: ${err.message}`);
    process.exit(1);
  }
  console.log(`CCTS API listening on http://localhost:${config.port}`);
});
