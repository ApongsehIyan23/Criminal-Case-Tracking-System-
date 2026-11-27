// Binding judicial rulings: one per suspect, written once and never changed.
const crypto = require('crypto');
const express = require('express');
const { ROLES, MANDATE_DECISIONS, EXTENSION_HOURS } = require('../../constants');
const { ApiError } = require('../../errors');
const { logAudit } = require('../../services/audit');
const { detectType, cleanName, fileReceiver, objectKeyFrom } = require('../../services/upload');
const { isUuid } = require('../../validation');
const { CASE_ID, RULING_TARGET, caseIdParam } = require('./queries');

const MAX_NOTES = 10000;
const receive = fileReceiver('document', 'DOCUMENT_TOO_LARGE');
const OPEN = ['ACTIVE', 'EXTENDED', 'EXPIRED'];

function parseRuling(req) {
  const ruling = {
    participantId: typeof req.body?.participantId === 'string' ? req.body.participantId : '',
    decision: req.body?.decision,
    rulingNotes: typeof req.body?.rulingNotes === 'string' ? req.body.rulingNotes.trim() : '',
    document: null,
  };
  const fields = {};
  if (!isUuid(ruling.participantId)) fields.participantId = 'SUSPECT_REQUIRED';
  if (!MANDATE_DECISIONS.includes(ruling.decision)) fields.decision = 'DECISION_REQUIRED';
  if (!ruling.rulingNotes) fields.rulingNotes = 'RULING_NOTES_REQUIRED';
  else if (ruling.rulingNotes.length > MAX_NOTES) fields.rulingNotes = 'RULING_NOTES_TOO_LONG';
  if (req.file) {
    const fileName = cleanName(req.file.originalname);
    const type = detectType(req.file.buffer, fileName);
    if (!type) fields.document = 'FILE_TYPE_NOT_ALLOWED';
    else ruling.document = { fileName, mime: type.mime, buffer: req.file.buffer };
  }
  if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_FAILED', { fields });
  return ruling;
}

async function issue(client, { caseId, ruling, user, ip, storage }) {
  // Locking the case serialises rulings on it.
  const found = await client.query('SELECT status FROM criminal_case_files WHERE case_id = $1 FOR UPDATE', [caseId]);
  if (!found.rowCount) throw new ApiError(404, 'CASE_NOT_FOUND');
  if (found.rows[0].status === 'IN_INVESTIGATION') throw new ApiError(409, 'CASE_NOT_TRANSMITTED');
  if (found.rows[0].status === 'MANDATE_ISSUED') throw new ApiError(409, 'CASE_ALREADY_RULED');

  const target = await client.query(
    `SELECT p.participant_id, EXISTS (SELECT 1 FROM judicial_mandates m WHERE m.participant_id = p.participant_id) AS ruled
       FROM case_participants p
      WHERE p.case_id = $1 AND p.participant_id = $2 AND ${RULING_TARGET}`,
    [caseId, ruling.participantId]);
  if (!target.rowCount) throw new ApiError(400, 'VALIDATION_FAILED', { fields: { participantId: 'SUSPECT_REQUIRED' } });
  if (target.rows[0].ruled) throw new ApiError(409, 'SUSPECT_ALREADY_RULED');

  const timer = (await client.query(
    `SELECT timer_id, status, current_expires_at FROM custody_countdown_timers
      WHERE participant_id = $1 FOR UPDATE`, [ruling.participantId])).rows[0];
  const inCustody = timer && OPEN.includes(timer.status);
  if (ruling.decision === 'EXTEND_CUSTODY' && !inCustody) {
    throw new ApiError(400, 'VALIDATION_FAILED', { fields: { decision: 'EXTENSION_NEEDS_CUSTODY' } });
  }

  const mandateId = crypto.randomUUID();
  let documentUrl = null;
  if (ruling.document) {
    if (!storage.configured) throw new ApiError(503, 'STORAGE_NOT_CONFIGURED');
    try {
      documentUrl = await storage.put(`mandates/${caseId}/${mandateId}`, ruling.document.buffer);
    } catch (err) {
      console.error(`Signed document storage failed: ${err.message}`);
      throw new ApiError(502, 'STORAGE_FAILED');
    }
  }

  const inserted = await client.query(
    `INSERT INTO judicial_mandates (mandate_id, case_id, participant_id, decision, ruling_notes,
                                    signed_document_name, signed_document_url, issued_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING mandate_id AS "mandateId", decision, issued_at AS "issuedAt"`,
    [mandateId, caseId, ruling.participantId, ruling.decision, ruling.rulingNotes,
      ruling.document?.fileName || null, documentUrl, user.userId]);

  // statutory_expires_at is the fixed legal record and is never touched.
  let newDeadline = null;
  if (inCustody) {
    const status = { RELEASE: 'RELEASED', EXTEND_CUSTODY: 'EXTENDED', PRE_TRIAL_DETENTION: 'TRANSFERRED' }[ruling.decision];
    const hours = ruling.decision === 'EXTEND_CUSTODY' ? EXTENSION_HOURS : 0;
    newDeadline = (await client.query(
      `UPDATE custody_countdown_timers
          SET status = $2, current_expires_at = current_expires_at + make_interval(hours => $3), updated_at = now()
        WHERE timer_id = $1 RETURNING current_expires_at`,
      [timer.timer_id, status, hours])).rows[0].current_expires_at;
  }

  const outstanding = await client.query(
    `SELECT count(*)::int AS n FROM case_participants p
      WHERE p.case_id = $1 AND ${RULING_TARGET}
        AND NOT EXISTS (SELECT 1 FROM judicial_mandates m WHERE m.participant_id = p.participant_id)`, [caseId]);
  const remaining = outstanding.rows[0].n;
  const caseStatus = remaining ? 'TRANSMITTED_TO_MAGISTRATE' : 'MANDATE_ISSUED';
  await client.query('UPDATE criminal_case_files SET status = $2, updated_at = now() WHERE case_id = $1',
    [caseId, caseStatus]);

  await logAudit(client, {
    actor: user, actionType: 'MANDATE_ISSUED', caseId, ip,
    details: {
      mandateId,
      participantId: ruling.participantId,
      decision: ruling.decision,
      documentSha256: ruling.document
        ? crypto.createHash('sha256').update(ruling.document.buffer).digest('hex') : null,
      previousDeadline: inCustody ? timer.current_expires_at : null,
      newDeadline: ruling.decision === 'EXTEND_CUSTODY' ? newDeadline : null,
      caseStatus,
    },
  });
  return { ...inserted.rows[0], caseStatus, remainingRulings: remaining };
}

// Mounted before the police routes; each route here declares who may use it.
function createMandateRouter({ db, storage, auth }) {
  const router = express.Router();
  router.param('caseId', caseIdParam);

  router.post('/:caseId/mandate', auth.requireRole(ROLES.MAGISTRATE), async (req, res) => {
    const { caseId } = req.params;
    try {
      await receive(req, res);
      const ruling = parseRuling(req);
      const result = await db.transaction((client) => issue(client, { caseId, ruling, user: req.user, ip: req.ip, storage }));
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof ApiError) {
        const known = CASE_ID.test(caseId)
          && (await db.query('SELECT 1 FROM criminal_case_files WHERE case_id = $1', [caseId])).rowCount;
        await logAudit(db, {
          actor: req.user, actionType: 'MANDATE_REJECTED', caseId: known ? caseId : null, ip: req.ip,
          details: { requestedCase: caseId, reason: error.code },
        });
      }
      throw error;
    }
  });

  router.get('/:caseId/mandates/:mandateId/document',
    auth.requireRole(ROLES.MAGISTRATE, ROLES.POLICE), async (req, res) => {
      const { caseId, mandateId } = req.params;
      const found = isUuid(mandateId) ? await db.query(
        `SELECT signed_document_name AS name, signed_document_url AS url FROM judicial_mandates
          WHERE case_id = $1 AND mandate_id = $2 AND signed_document_url IS NOT NULL`, [caseId, mandateId]) : null;
      if (!found?.rowCount) throw new ApiError(404, 'DOCUMENT_NOT_FOUND');
      let content;
      try {
        content = await storage.get(objectKeyFrom(found.rows[0].url));
      } catch (err) {
        console.error(`Signed document read failed: ${err.message}`);
        throw new ApiError(502, 'STORAGE_FAILED');
      }
      await logAudit(db, {
        actor: req.user, actionType: 'SIGNED_DOCUMENT_ACCESSED', caseId, ip: req.ip, details: { mandateId },
      });
      res.attachment(found.rows[0].name);
      res.send(content);
    });

  return router;
}

module.exports = { createMandateRouter };
