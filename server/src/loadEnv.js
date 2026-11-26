// Loads server/.env when present. Variables already set in the environment win.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
