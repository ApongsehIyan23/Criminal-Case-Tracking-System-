// Creates one ACTIVE System Administrator from environment values.
// An existing account with the same email is left untouched.
const bcrypt = require('bcrypt');
const { Client } = require('pg');
require('../src/loadEnv');
const { BCRYPT_COST } = require('../src/constants');
const { logAudit, SYSTEM_ACTOR } = require('../src/services/audit');
const { isValidEmail, passwordProblem } = require('../src/validation');

async function seedAdmin({ ownerUrl, email, password, fullName, log = console.log }) {
  if (!ownerUrl) throw new Error('MIGRATION_DATABASE_URL must be set.');
  const normalized = String(email || '').trim().toLowerCase();
  if (!isValidEmail(normalized)) throw new Error('SEED_ADMIN_EMAIL must be a valid email address.');
  if (passwordProblem(password)) throw new Error('SEED_ADMIN_PASSWORD must be 8 to 72 characters.');
  if (!String(fullName || '').trim()) throw new Error('SEED_ADMIN_FULL_NAME must be set.');

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, status)
       VALUES ($1, $2, $3, 'SYSTEM_ADMINISTRATOR', 'ACTIVE')
       ON CONFLICT (email) DO NOTHING RETURNING user_id`,
      [normalized, await bcrypt.hash(password, BCRYPT_COST), fullName.trim()],
    );
    if (inserted.rowCount) {
      await logAudit(client, {
        actor: SYSTEM_ACTOR,
        actionType: 'ADMIN_ACCOUNT_SEEDED',
        details: { userId: inserted.rows[0].user_id, email: normalized },
      });
      log(`Created System Administrator ${normalized}.`);
    } else {
      log(`An account for ${normalized} already exists. Nothing changed.`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

module.exports = { seedAdmin };

if (require.main === module) {
  seedAdmin({
    ownerUrl: process.env.MIGRATION_DATABASE_URL,
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    fullName: process.env.SEED_ADMIN_FULL_NAME,
  }).catch((err) => {
    console.error(`Admin seed failed: ${err.message}`);
    process.exit(1);
  });
}
