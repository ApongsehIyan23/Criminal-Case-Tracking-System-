const express = require('express');
const { ApiError } = require('../../errors');
const { logAudit } = require('../../services/audit');

const HISTORY_LIMIT = 10;

function createSystemRouter({ db, mailer, neon, storage }) {
  const router = express.Router();

  router.get('/health', async (req, res) => {
    const checks = [];
    const started = process.hrtime.bigint();
    await db.query('SELECT 1');
    checks.push({
      name: 'database',
      ok: true,
      latencyMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
    });
    const audit = await db.query(
      `SELECT NOT (has_table_privilege(current_user, 'audit_logs', 'UPDATE')
                OR has_table_privilege(current_user, 'audit_logs', 'DELETE')
                OR has_table_privilege(current_user, 'audit_logs', 'TRUNCATE')) AS ok`,
    );
    checks.push({ name: 'auditProtection', ok: audit.rows[0].ok });
    // The last three report configuration only; they do not contact the provider.
    checks.push({ name: 'email', ok: mailer.configured });
    checks.push({ name: 'backups', ok: neon.configured });
    checks.push({ name: 'storage', ok: storage.configured });

    await logAudit(db, { actor: req.user, actionType: 'SYSTEM_HEALTH_VIEWED', ip: req.ip });
    res.json({
      healthy: checks.every((c) => c.ok),
      checks,
      uptimeSeconds: Math.round(process.uptime()),
      checkedAt: new Date().toISOString(),
    });
  });

  // Snapshots finish asynchronously; unfinished ones are re-checked when history is read.
  async function refreshStarted() {
    const started = await db.query(`SELECT backup_id, notes FROM database_backups WHERE status = 'STARTED'`);
    for (const row of started.rows) {
      let notes;
      try {
        notes = JSON.parse(row.notes);
      } catch {
        continue;
      }
      if (!notes?.operationIds?.length) continue;
      try {
        const statuses = await Promise.all(notes.operationIds.map((id) => neon.operationStatus(id)));
        let status = null;
        if (statuses.every((s) => s === 'finished' || s === 'skipped')) status = 'COMPLETED';
        else if (statuses.some((s) => ['failed', 'error', 'cancelled'].includes(s))) status = 'FAILED';
        if (status) await db.query('UPDATE database_backups SET status = $2 WHERE backup_id = $1', [row.backup_id, status]);
      } catch (err) {
        console.error(`Could not refresh backup status: ${err.message}`);
      }
    }
  }

  const BACKUP_SELECT = `
    SELECT b.backup_id AS "backupId", b.status, b.notes, b.created_at AS "createdAt",
           u.email AS "triggeredBy"
      FROM database_backups b LEFT JOIN users u ON u.user_id = b.triggered_by`;

  const present = (row) => {
    let notes = {};
    try {
      notes = JSON.parse(row.notes) || {};
    } catch { /* history rows without structured notes */ }
    const { notes: _raw, ...rest } = row;
    return { ...rest, snapshotName: notes.name || null, snapshotId: notes.snapshotId || null, error: notes.error || null };
  };

  router.get('/backups', async (req, res) => {
    await refreshStarted();
    const rows = await db.query(`${BACKUP_SELECT} ORDER BY b.created_at DESC LIMIT ${HISTORY_LIMIT}`);
    await logAudit(db, { actor: req.user, actionType: 'BACKUP_HISTORY_VIEWED', ip: req.ip });
    res.json({ items: rows.rows.map(present) });
  });

  router.post('/backups', async (req, res) => {
    const name = `ccts-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const inserted = await db.query(
      `INSERT INTO database_backups (triggered_by, status, notes) VALUES ($1, 'STARTED', $2) RETURNING backup_id`,
      [req.user.userId, JSON.stringify({ name })],
    );
    const backupId = inserted.rows[0].backup_id;

    const finish = async (status, notes, actionType) =>
      db.transaction(async (client) => {
        await client.query('UPDATE database_backups SET status = $2, notes = $3 WHERE backup_id = $1', [
          backupId, status, JSON.stringify(notes),
        ]);
        await logAudit(client, { actor: req.user, actionType, details: { backupId, ...notes }, ip: req.ip });
      });

    let snapshot;
    try {
      snapshot = await neon.createSnapshot(name);
    } catch (err) {
      await finish('FAILED', { name, error: err.message }, 'DATABASE_BACKUP_FAILED');
      throw new ApiError(502, err.code || 'BACKUP_FAILED', { reason: err.message });
    }
    const status = snapshot.operationIds.length ? 'STARTED' : 'COMPLETED';
    await finish(status, { name, ...snapshot }, 'DATABASE_BACKUP');

    const row = await db.query(`${BACKUP_SELECT} WHERE b.backup_id = $1`, [backupId]);
    res.status(201).json(present(row.rows[0]));
  });

  return router;
}

module.exports = { createSystemRouter };
