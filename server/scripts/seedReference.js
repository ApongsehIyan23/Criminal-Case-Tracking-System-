// Loads the approved sample units and offense categories. Safe to run more than once.
const { Client } = require('pg');
require('../src/loadEnv');
const { organizationalUnits, offenseCategories } = require('../db/seeds/reference');

async function seedReference({ ownerUrl, log = console.log }) {
  if (!ownerUrl) throw new Error('MIGRATION_DATABASE_URL must be set.');
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    for (const unit of organizationalUnits) {
      await client.query(
        `INSERT INTO organizational_units (unit_code, unit_name, unit_type)
         VALUES ($1, $2, $3) ON CONFLICT (unit_code) DO NOTHING`,
        unit,
      );
    }
    for (const offense of offenseCategories) {
      await client.query(
        `INSERT INTO offense_categories (code, label_en, label_fr, penal_code_ref)
         VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
        offense,
      );
    }
    log(`Reference data ready: ${organizationalUnits.length} units, ${offenseCategories.length} offense categories.`);
  } finally {
    await client.end();
  }
}

module.exports = { seedReference };

if (require.main === module) {
  seedReference({ ownerUrl: process.env.MIGRATION_DATABASE_URL }).catch((err) => {
    console.error(`Reference seed failed: ${err.message}`);
    process.exit(1);
  });
}
