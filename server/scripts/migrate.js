// Runs the schema migration as the database owner, then creates and restricts
// the application role named in DATABASE_URL.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('../src/loadEnv');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

// Tables the application may read, insert and update. It never deletes in this phase.
const MUTABLE_TABLES = [
  'organizational_units', 'offense_categories', 'users', 'account_invitations', 'persons',
  'criminal_case_files', 'case_participants', 'custody_countdown_timers', 'digital_evidence',
  'judicial_mandates', 'notifications_log', 'database_backups',
];

function parseAppRole(databaseUrl) {
  const url = new URL(databaseUrl);
  return { user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
}

async function migrate({ ownerUrl, appUrl, log = console.log }) {
  if (!ownerUrl || !appUrl) {
    throw new Error('MIGRATION_DATABASE_URL and DATABASE_URL must both be set.');
  }
  const appRole = parseAppRole(appUrl);
  if (!appRole.user || !appRole.password) {
    throw new Error('DATABASE_URL must include the application role name and password.');
  }

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const owner = (await client.query('SELECT current_user AS name')).rows[0].name;
    if (owner === appRole.user) {
      throw new Error('DATABASE_URL must use a different role from MIGRATION_DATABASE_URL.');
    }

    await client.query('BEGIN');
    // Serialises concurrent migration runs.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ccts-migrate'))");

    for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      log(`Applied ${file}`);
    }

    const role = client.escapeIdentifier(appRole.user);
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appRole.user]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE ROLE ${role} LOGIN PASSWORD ${client.escapeLiteral(appRole.password)}`);
      log(`Created application role ${appRole.user}`);
    }

    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE ON ${MUTABLE_TABLES.join(', ')} TO ${role}`);
    await client.query('REVOKE ALL ON audit_logs FROM PUBLIC');
    await client.query(`GRANT SELECT, INSERT ON audit_logs TO ${role}`);

    // Fails the migration if the role can still alter history, e.g. through an inherited role.
    const unsafe = await client.query(
      `SELECT has_table_privilege($1, 'audit_logs', 'UPDATE')
           OR has_table_privilege($1, 'audit_logs', 'DELETE')
           OR has_table_privilege($1, 'audit_logs', 'TRUNCATE') AS unsafe`,
      [appRole.user],
    );
    if (unsafe.rows[0].unsafe) {
      throw new Error(
        `Role ${appRole.user} can still modify audit_logs through inherited privileges. `
        + 'Use a role created by this script, not one created in the Neon console.',
      );
    }
    await client.query('COMMIT');
    log('Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate({ ownerUrl: process.env.MIGRATION_DATABASE_URL, appUrl: process.env.DATABASE_URL }).catch((err) => {
    console.error(`Migration failed: ${err.message}`);
    process.exit(1);
  });
}
