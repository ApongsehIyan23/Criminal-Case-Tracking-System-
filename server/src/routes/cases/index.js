// Judicial police case routes. There is deliberately no route that deletes a case.
const express = require('express');
const { CASE_STATUSES, EVIDENCE_LIMIT_BYTES } = require('../../constants');
const { ApiError } = require('../../errors');
const { parsePagination, pageEnvelope } = require('../../pagination');
const { logAudit } = require('../../services/audit');
const { createUploadHandler } = require('./evidence');
const { createCaseHandler } = require('./intake');

const CASE_ID = /^CM-MFD-\d{4}-\d{4,}$/;
const TRAIL_LIMIT = 200;

const SUMMARY_COLUMNS = `
  c.case_id AS "caseId", c.incident_title AS "incidentTitle", c.narrative, c.status,
  u.unit_name AS "unitName",
  (SELECT count(*)::int FROM digital_evidence e WHERE e.case_id = c.case_id) AS "evidenceCount",
  (SELECT count(*)::int FROM case_participants p WHERE p.case_id = c.case_id) AS "participantCount",
  (SELECT coalesce(json_agg(s.full_name ORDER BY s.full_name), '[]')
     FROM case_participants p JOIN persons s USING (person_id)
    WHERE p.case_id = c.case_id AND p.role = 'SUSPECT') AS suspects,
  (SELECT min(t.current_expires_at)
     FROM custody_countdown_timers t JOIN case_participants p USING (participant_id)
    WHERE p.case_id = c.case_id AND t.status IN ('ACTIVE','EXTENDED','EXPIRED')) AS "custodyExpiresAt"`;

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
      db.query(
        `SELECT t.timer_id AS "timerId", t.status AS "timerStatus", t.started_at AS "startedAt",
                t.current_expires_at AS "expiresAt", s.full_name AS "suspectName", s.national_id AS "nationalId",
                EXISTS (SELECT 1 FROM notifications_log n WHERE n.case_id = c.case_id
                          AND n.notification_type = 'CUSTODY_EXPIRY_WARNING'
                          AND n.payload->>'timerId' = t.timer_id::text) AS "alertSent",
                ${SUMMARY_COLUMNS}
           FROM custody_countdown_timers t
           JOIN case_participants cp USING (participant_id)
           JOIN persons s ON s.person_id = cp.person_id
           JOIN criminal_case_files c ON c.case_id = cp.case_id
           JOIN organizational_units u ON u.unit_id = c.originating_unit_id
          WHERE t.status IN ('ACTIVE','EXTENDED','EXPIRED')
          ORDER BY t.current_expires_at, c.case_id, s.full_name`,
      ),
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

  // Active Case Files Register: search plus status filter, paginated.
  router.get('/', async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status && !CASE_STATUSES.includes(status)) throw new ApiError(400, 'VALIDATION_FAILED');
    const { page, pageSize, offset } = parsePagination(req.query);

    const params = [];
    const clauses = ['TRUE'];
    if (search) {
      const p = `$${params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`)}`;
      clauses.push(`(c.case_id ILIKE ${p} OR c.incident_title ILIKE ${p} OR c.narrative ILIKE ${p}
        OR o.label_en ILIKE ${p} OR o.label_fr ILIKE ${p}
        OR EXISTS (SELECT 1 FROM case_participants p JOIN persons s USING (person_id)
                    WHERE p.case_id = c.case_id AND (s.full_name ILIKE ${p} OR s.national_id ILIKE ${p})))`);
    }
    if (status) clauses.push(`c.status = $${params.push(status)}`);
    const from = `FROM criminal_case_files c
      JOIN organizational_units u ON u.unit_id = c.originating_unit_id
      JOIN offense_categories o ON o.offense_category_id = c.offense_category_id
     WHERE ${clauses.join(' AND ')}`;

    const [rows, count] = await Promise.all([
      db.query(
        `SELECT ${SUMMARY_COLUMNS} ${from} ORDER BY c.created_at DESC, c.case_id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset]),
      db.query(`SELECT count(*)::int AS total ${from}`, params),
    ]);
    await logAudit(db, {
      actor: req.user,
      actionType: search || status ? 'CASE_SEARCHED' : 'CASE_REGISTER_VIEWED',
      details: { ...(search ? { search } : {}), ...(status ? { status } : {}), page, pageSize },
      ip: req.ip,
    });
    res.json({ ...pageEnvelope(rows.rows, count.rows[0].total, page, pageSize), serverNow: serverNow() });
  });

  router.post('/', createCaseHandler({ db }));

  router.param('caseId', (req, res, next, caseId) => {
    next(CASE_ID.test(caseId) ? undefined : new ApiError(404, 'CASE_NOT_FOUND'));
  });

  async function findCase(caseId) {
    const found = await db.query(
      `SELECT c.case_id AS "caseId", c.incident_title AS "incidentTitle", c.narrative, c.status,
              c.incident_datetime AS "incidentDatetime", c.created_at AS "createdAt",
              c.transmitted_at AS "transmittedAt", o.label_en AS "offenseEn", o.label_fr AS "offenseFr",
              u.unit_name AS "unitName", creator.full_name AS "createdBy"
         FROM criminal_case_files c
         JOIN offense_categories o ON o.offense_category_id = c.offense_category_id
         JOIN organizational_units u ON u.unit_id = c.originating_unit_id
         JOIN users creator ON creator.user_id = c.created_by
        WHERE c.case_id = $1`, [caseId]);
    if (!found.rowCount) throw new ApiError(404, 'CASE_NOT_FOUND');
    return found.rows[0];
  }

  const participantsOf = (caseId) => db.query(
    `SELECT p.participant_id AS "participantId", p.role, p.is_detained AS "isDetained", s.full_name AS "fullName",
            s.national_id AS "nationalId", s.phone_number AS "phone", t.timer_id AS "timerId",
            t.status AS "timerStatus", t.started_at AS "startedAt",
            t.statutory_expires_at AS "statutoryExpiresAt", t.current_expires_at AS "expiresAt"
       FROM case_participants p
       JOIN persons s USING (person_id)
       LEFT JOIN custody_countdown_timers t USING (participant_id)
      WHERE p.case_id = $1
      ORDER BY array_position(ARRAY['SUSPECT','VICTIM','WITNESS']::text[], p.role::text), s.full_name`, [caseId]);

  const evidenceOf = (caseId) => db.query(
    `SELECT e.evidence_id AS "evidenceId", e.category, e.file_name AS "fileName",
            e.file_size_bytes::int AS "fileSizeBytes", e.sha256_hash AS "sha256",
            e.virus_scan_status AS "virusScanStatus", e.is_locked AS "isLocked",
            e.uploaded_at AS "uploadedAt", u.email AS "uploadedBy"
       FROM digital_evidence e JOIN users u ON u.user_id = e.uploaded_by
      WHERE e.case_id = $1 ORDER BY e.uploaded_at, e.file_name`, [caseId]);

  // The case docket. Opening it is itself recorded.
  router.get('/:caseId', async (req, res) => {
    const { caseId } = req.params;
    await custody.sync();
    const caseFile = await findCase(caseId);
    await logAudit(db, { actor: req.user, actionType: 'CASE_ACCESSED', caseId, ip: req.ip });
    const [participants, evidence, mandate, alerts, trail] = await Promise.all([
      participantsOf(caseId),
      evidenceOf(caseId),
      db.query(
        `SELECT m.decision, m.ruling_notes AS "rulingNotes", m.issued_at AS "issuedAt",
                m.signed_document_name AS "signedDocumentName", u.full_name AS "issuedBy"
           FROM judicial_mandates m JOIN users u ON u.user_id = m.issued_by WHERE m.case_id = $1`, [caseId]),
      db.query(
        `SELECT notification_id AS "notificationId", channel, recipient_address AS "recipient",
                delivery_status AS "deliveryStatus", created_at AS "createdAt", sent_at AS "sentAt"
           FROM notifications_log
          WHERE case_id = $1 AND notification_type = 'CUSTODY_EXPIRY_WARNING'
          ORDER BY created_at, recipient_address, channel`, [caseId]),
      db.query(
        `SELECT log_id AS "logId", created_at AS "createdAt", actor_email AS "actorEmail",
                actor_role AS "actorRole", action_type AS "actionType"
           FROM audit_logs WHERE case_id = $1 ORDER BY created_at DESC, log_id DESC LIMIT ${TRAIL_LIMIT}`, [caseId]),
    ]);
    res.json({
      case: caseFile,
      participants: participants.rows,
      evidence: evidence.rows,
      evidenceLimitBytes: EVIDENCE_LIMIT_BYTES,
      mandate: mandate.rows[0] || null,
      alerts: alerts.rows,
      trail: trail.rows,
      serverNow: serverNow(),
    });
  });

  router.post('/:caseId/evidence', createUploadHandler({ db, storage }));

  router.get('/:caseId/transmission-review', async (req, res) => {
    const { caseId } = req.params;
    const caseFile = await findCase(caseId);
    if (caseFile.status !== 'IN_INVESTIGATION') throw new ApiError(409, 'CASE_ALREADY_TRANSMITTED');
    const [participants, evidence] = await Promise.all([participantsOf(caseId), evidenceOf(caseId)]);
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
