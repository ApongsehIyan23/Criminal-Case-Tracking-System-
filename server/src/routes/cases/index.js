// Judicial police case routes. There is deliberately no route that deletes a case.
const express = require('express');
const { EVIDENCE_LIMIT_BYTES } = require('../../constants');
const { ApiError } = require('../../errors');
const { logAudit } = require('../../services/audit');
const { createUploadHandler } = require('./evidence');
const { createCaseHandler } = require('./intake');
const queries = require('./queries');
const { listRegister, parseRegister } = require('./register');

function createCaseRouter({ db, storage, custody }) {
  const router = express.Router();
  const serverNow = () => new Date().toISOString();

  router.get('/reference', async (req, res) => {
    const [offenses, units, officer] = await Promise.all([
      db.query(`SELECT offense_category_id AS "offenseCategoryId", label_en AS "labelEn", label_fr AS "labelFr",
                       penal_code_ref AS "penalCodeRef"
                  FROM offense_categories WHERE is_active ORDER BY label_en`),
      db.query(`SELECT unit_id AS "unitId", unit_name AS "unitName" FROM organizational_units
                 WHERE unit_type IN ('COMMISSARIAT','GENDARMERIE') ORDER BY unit_name`),
      db.query('SELECT organizational_unit_id AS "unitId" FROM users WHERE user_id = $1', [req.user.userId]),
    ]);
    res.json({ offenses: offenses.rows, units: units.rows, officerUnitId: officer.rows[0]?.unitId || null });
  });

  // Custody countdown cards, one per detained suspect, least time remaining first.
  router.get('/dashboard', async (req, res) => {
    await custody.sync();
    const [cards, totals] = await Promise.all([
      db.query(`${queries.CUSTODY_CARDS} ORDER BY t.current_expires_at, c.case_id, s.full_name`),
      db.query('SELECT count(*)::int AS total FROM criminal_case_files'),
    ]);
    await logAudit(db, { actor: req.user, actionType: 'DASHBOARD_VIEWED', ip: req.ip });
    res.json({ custody: cards.rows, totalCases: totals.rows[0].total, serverNow: serverNow() });
  });

  // Cases still open to evidence, for the quick upload dialog.
  router.get('/open', async (req, res) => {
    const rows = await db.query(
      `SELECT case_id AS "caseId", incident_title AS "incidentTitle" FROM criminal_case_files
        WHERE status = 'IN_INVESTIGATION' ORDER BY created_at DESC LIMIT 500`);
    res.json({ items: rows.rows });
  });

  // Active Case Files Register.
  router.get('/', async (req, res) => {
    const view = parseRegister(req.query);
    const result = await listRegister(db, view);
    const { search, status, record, custody, sort, dir, page, pageSize } = view;
    const chosen = Object.fromEntries(Object.entries({ search, status, record, custody }).filter(([, v]) => v));
    await logAudit(db, {
      actor: req.user,
      actionType: Object.keys(chosen).length ? 'CASE_SEARCHED' : 'CASE_REGISTER_VIEWED',
      details: { ...chosen, sort, dir, page, pageSize },
      ip: req.ip,
    });
    res.json({ ...result, serverNow: serverNow() });
  });

  router.post('/', createCaseHandler({ db }));

  router.param('caseId', queries.caseIdParam);

  // The case docket. Opening it is itself recorded.
  router.get('/:caseId', async (req, res) => {
    const { caseId } = req.params;
    await custody.sync();
    const caseFile = await queries.findCase(db, caseId);
    await logAudit(db, { actor: req.user, actionType: 'CASE_ACCESSED', caseId, ip: req.ip });
    const [participants, evidence, mandates, alerts, trail] = await Promise.all([
      queries.participantsOf(db, caseId),
      queries.evidenceOf(db, caseId),
      queries.mandatesOf(db, caseId),
      queries.alertsOf(db, caseId),
      queries.trailOf(db, caseId),
    ]);
    res.json({
      case: caseFile,
      participants: participants.rows,
      evidence: evidence.rows,
      evidenceLimitBytes: EVIDENCE_LIMIT_BYTES,
      mandates: mandates.rows,
      alerts: alerts.rows,
      trail: trail.rows,
      serverNow: serverNow(),
    });
  });

  router.post('/:caseId/evidence', createUploadHandler({ db, storage }));

  router.get('/:caseId/transmission-review', async (req, res) => {
    const { caseId } = req.params;
    const caseFile = await queries.findCase(db, caseId);
    if (caseFile.status !== 'IN_INVESTIGATION') throw new ApiError(409, 'CASE_ALREADY_TRANSMITTED');
    const [participants, evidence] = await Promise.all([queries.participantsOf(db, caseId), queries.evidenceOf(db, caseId)]);
    await logAudit(db, { actor: req.user, actionType: 'TRANSMISSION_REVIEW_OPENED', caseId, ip: req.ip });
    res.json({ case: caseFile, participants: participants.rows, evidence: evidence.rows, serverNow: serverNow() });
  });

  router.post('/:caseId/transmit', async (req, res) => {
    const { caseId } = req.params;
    const result = await db.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE criminal_case_files
            SET status = 'TRANSMITTED_TO_MAGISTRATE', transmitted_at = now(), transmitted_by = $2, updated_at = now()
          WHERE case_id = $1 AND status = 'IN_INVESTIGATION'
          RETURNING case_id AS "caseId", status, transmitted_at AS "transmittedAt"`,
        [caseId, req.user.userId]);
      if (!updated.rowCount) {
        const exists = await client.query('SELECT 1 FROM criminal_case_files WHERE case_id = $1', [caseId]);
        throw exists.rowCount ? new ApiError(409, 'CASE_ALREADY_TRANSMITTED') : new ApiError(404, 'CASE_NOT_FOUND');
      }
      const locked = await client.query('UPDATE digital_evidence SET is_locked = TRUE WHERE case_id = $1', [caseId]);
      await logAudit(client, {
        actor: req.user, actionType: 'CASE_TRANSMITTED', caseId, ip: req.ip,
        details: { evidenceLocked: locked.rowCount },
      });
      return updated.rows[0];
    });
    res.json(result);
  });

  return router;
}

module.exports = { createCaseRouter };
