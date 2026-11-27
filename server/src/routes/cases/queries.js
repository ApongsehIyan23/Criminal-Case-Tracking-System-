// Case reads shared by the police docket and the magistrate review.
const { ApiError } = require('../../errors');

const CASE_ID = /^CM-MFD-\d{4}-\d{4,}$/;
const TRAIL_LIMIT = 200;
const OPEN_TIMERS = "('ACTIVE','EXTENDED','EXPIRED')";

// Who a ruling is owed to: the detained suspects, or every suspect when nobody was detained.
const RULING_TARGET = `p.role = 'SUSPECT' AND (p.is_detained OR NOT EXISTS (
  SELECT 1 FROM case_participants d WHERE d.case_id = p.case_id AND d.is_detained))`;

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
    WHERE p.case_id = c.case_id AND t.status IN ${OPEN_TIMERS}) AS "custodyExpiresAt"`;

// One card per suspect still in custody. Callers add the WHERE clause.
const CUSTODY_CARDS = `
  SELECT t.timer_id AS "timerId", t.status AS "timerStatus", t.started_at AS "startedAt",
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
   WHERE t.status IN ${OPEN_TIMERS}`;

const caseIdParam = (req, res, next, caseId) => {
  next(CASE_ID.test(caseId) ? undefined : new ApiError(404, 'CASE_NOT_FOUND'));
};

async function findCase(db, caseId) {
  const found = await db.query(
    `SELECT c.case_id AS "caseId", c.incident_title AS "incidentTitle", c.narrative, c.status,
            c.incident_datetime AS "incidentDatetime", c.created_at AS "createdAt",
            c.transmitted_at AS "transmittedAt", o.label_en AS "offenseEn", o.label_fr AS "offenseFr",
            u.unit_name AS "unitName", creator.full_name AS "createdBy", creator.email AS "createdByEmail"
       FROM criminal_case_files c
       JOIN offense_categories o ON o.offense_category_id = c.offense_category_id
       JOIN organizational_units u ON u.unit_id = c.originating_unit_id
       JOIN users creator ON creator.user_id = c.created_by
      WHERE c.case_id = $1`, [caseId]);
  if (!found.rowCount) throw new ApiError(404, 'CASE_NOT_FOUND');
  return found.rows[0];
}

const participantsOf = (db, caseId) => db.query(
  `SELECT p.participant_id AS "participantId", p.role, p.is_detained AS "isDetained", s.full_name AS "fullName",
          s.national_id AS "nationalId", s.phone_number AS "phone", t.timer_id AS "timerId",
          t.status AS "timerStatus", t.started_at AS "startedAt",
          t.statutory_expires_at AS "statutoryExpiresAt", t.current_expires_at AS "expiresAt",
          (${RULING_TARGET}) AS "needsRuling"
     FROM case_participants p
     JOIN persons s USING (person_id)
     LEFT JOIN custody_countdown_timers t USING (participant_id)
    WHERE p.case_id = $1
    ORDER BY array_position(ARRAY['SUSPECT','VICTIM','WITNESS']::text[], p.role::text), s.full_name`, [caseId]);

const evidenceOf = (db, caseId) => db.query(
  `SELECT e.evidence_id AS "evidenceId", e.category, e.file_name AS "fileName", e.mime_type AS "mimeType",
          e.file_size_bytes::int AS "fileSizeBytes", e.sha256_hash AS "sha256",
          e.virus_scan_status AS "virusScanStatus", e.is_locked AS "isLocked",
          e.uploaded_at AS "uploadedAt", u.email AS "uploadedBy"
     FROM digital_evidence e JOIN users u ON u.user_id = e.uploaded_by
    WHERE e.case_id = $1 ORDER BY e.uploaded_at, e.file_name`, [caseId]);

const mandatesOf = (db, caseId) => db.query(
  `SELECT m.mandate_id AS "mandateId", m.participant_id AS "participantId", s.full_name AS "suspectName",
          m.decision, m.ruling_notes AS "rulingNotes", m.issued_at AS "issuedAt",
          m.signed_document_name AS "signedDocumentName", u.full_name AS "issuedBy"
     FROM judicial_mandates m
     JOIN users u ON u.user_id = m.issued_by
     JOIN case_participants p ON p.participant_id = m.participant_id
     JOIN persons s ON s.person_id = p.person_id
    WHERE m.case_id = $1 ORDER BY m.issued_at, s.full_name`, [caseId]);

const alertsOf = (db, caseId) => db.query(
  `SELECT notification_id AS "notificationId", channel, recipient_address AS "recipient",
          delivery_status AS "deliveryStatus", created_at AS "createdAt", sent_at AS "sentAt"
     FROM notifications_log
    WHERE case_id = $1 AND notification_type = 'CUSTODY_EXPIRY_WARNING'
    ORDER BY created_at, recipient_address, channel`, [caseId]);

const trailOf = (db, caseId) => db.query(
  `SELECT log_id AS "logId", created_at AS "createdAt", actor_email AS "actorEmail",
          actor_role AS "actorRole", action_type AS "actionType"
     FROM audit_logs WHERE case_id = $1 ORDER BY created_at DESC, log_id DESC LIMIT ${TRAIL_LIMIT}`, [caseId]);

module.exports = {
  CASE_ID, OPEN_TIMERS, RULING_TARGET, SUMMARY_COLUMNS, CUSTODY_CARDS,
  caseIdParam, findCase, participantsOf, evidenceOf, mandatesOf, alertsOf, trailOf,
};
