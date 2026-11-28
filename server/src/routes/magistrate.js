// Examining magistrate: analytics, the incoming queue and the split-screen review.
// Magistrates see only cases that the police have transmitted.
const crypto = require('crypto');
const express = require('express');
const { CUSTODY_URGENT_HOURS, EVIDENCE_LIMIT_BYTES } = require('../constants');
const { ApiError } = require('../errors');
const { parsePagination, pageEnvelope } = require('../pagination');
const { logAudit } = require('../services/audit');
const { objectKeyFrom } = require('../services/upload');
const { isUuid } = require('../validation');
const queries = require('./cases/queries');
const { CUSTODY_FILTERS } = require('./cases/register');

const VISIBLE = "c.status IN ('TRANSMITTED_TO_MAGISTRATE','MANDATE_ISSUED')";
const REVIEW_STATUS = { PENDING: 'TRANSMITTED_TO_MAGISTRATE', ISSUED: 'MANDATE_ISSUED' };

// Queue orders, written with fixed SQL only. By default cases awaiting review come
// first: least custody time remaining, then those without custody by oldest
// transmission. Completed cases follow.
const PRIORITY = `(q.status = 'MANDATE_ISSUED'), q."custodyExpiresAt" ASC NULLS LAST, q."transmittedAt" ASC, q."caseId"`;
const QUEUE_SORTS = {
  priority: () => PRIORITY,
  transmitted: (dir) => `q."transmittedAt" ${dir}, q."caseId"`,
  caseId: (dir) => `q."caseId" ${dir}`,
  evidence: (dir) => `q."evidenceCount" ${dir}, q."caseId"`,
};

function createMagistrateRouter({ db, storage, custody }) {
  const router = express.Router();
  const serverNow = () => new Date().toISOString();

  router.get('/dashboard', async (req, res) => {
    await custody.sync();
    const [totals, urgent] = await Promise.all([
      db.query(
        `SELECT
           (SELECT count(*)::int FROM criminal_case_files WHERE status = 'TRANSMITTED_TO_MAGISTRATE') AS "pendingReview",
           (SELECT count(*)::int FROM judicial_mandates) AS "mandatesIssued",
           -- From transmission to the ruling that completed the case.
           (SELECT extract(epoch FROM avg(done.issued_at - c.transmitted_at))::float8
              FROM criminal_case_files c
              JOIN (SELECT case_id, max(issued_at) AS issued_at FROM judicial_mandates GROUP BY case_id) done USING (case_id)
             WHERE c.status = 'MANDATE_ISSUED') AS "averageTurnaroundSeconds"`),
      db.query(
        `${queries.CUSTODY_CARDS} AND ${VISIBLE}
            AND t.current_expires_at < now() + make_interval(hours => $1)
          ORDER BY t.current_expires_at, c.case_id, s.full_name`, [CUSTODY_URGENT_HOURS]),
    ]);
    await logAudit(db, { actor: req.user, actionType: 'MAGISTRATE_DASHBOARD_VIEWED', ip: req.ip });
    res.json({
      kpis: { ...totals.rows[0], urgentCustody: urgent.rows.length },
      urgent: urgent.rows,
      serverNow: serverNow(),
    });
  });

  router.get('/queue', async (req, res) => {
    await custody.sync();
    const text = (value) => (typeof value === 'string' ? value : '');
    const search = text(req.query.search).trim().slice(0, 200);
    const status = text(req.query.status);
    const inCustody = text(req.query.custody);
    const sort = text(req.query.sort) || 'priority';
    const dir = text(req.query.dir) || 'asc';
    if ((status && !Object.hasOwn(REVIEW_STATUS, status))
      || (inCustody && !Object.hasOwn(CUSTODY_FILTERS, inCustody))
      || !Object.hasOwn(QUEUE_SORTS, sort) || !['asc', 'desc'].includes(dir)) {
      throw new ApiError(400, 'VALIDATION_FAILED');
    }
    const { page, pageSize, offset } = parsePagination(req.query);

    const params = [];
    const clauses = [VISIBLE];
    if (search) {
      const p = `$${params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`)}`;
      clauses.push(`(c.case_id ILIKE ${p} OR c.incident_title ILIKE ${p} OR c.narrative ILIKE ${p}
        OR u.unit_name ILIKE ${p}
        OR EXISTS (SELECT 1 FROM case_participants p JOIN persons s USING (person_id)
                    WHERE p.case_id = c.case_id AND (s.full_name ILIKE ${p} OR s.national_id ILIKE ${p})))`);
    }
    if (inCustody) clauses.push(CUSTODY_FILTERS[inCustody]);
    const from = () => `FROM criminal_case_files c
      JOIN organizational_units u ON u.unit_id = c.originating_unit_id
     WHERE ${clauses.join(' AND ')}`;

    // Tab counts follow the search and filter, but not the chosen tab.
    const countSql = `SELECT c.status, count(*)::int AS n ${from()} GROUP BY c.status`;
    const countParams = [...params];
    if (status) clauses.push(`c.status = $${params.push(REVIEW_STATUS[status])}`);

    const [rows, grouped] = await Promise.all([
      db.query(
        `SELECT * FROM (
           SELECT ${queries.SUMMARY_COLUMNS}, c.created_at AS "createdAt", c.transmitted_at AS "transmittedAt",
                  (SELECT s.full_name FROM case_participants p
                     JOIN persons s USING (person_id)
                     LEFT JOIN custody_countdown_timers t USING (participant_id)
                    WHERE p.case_id = c.case_id AND p.role = 'SUSPECT'
                    ORDER BY (t.status IN ${queries.OPEN_TIMERS}) DESC NULLS LAST, t.current_expires_at, s.full_name
                    LIMIT 1) AS "leadSuspect"
             ${from()}
         ) q
         ORDER BY ${QUEUE_SORTS[sort](dir === 'asc' ? 'ASC' : 'DESC')}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset]),
      db.query(countSql, countParams),
    ]);
    const counts = Object.fromEntries(Object.entries(REVIEW_STATUS)
      .map(([name, value]) => [name, grouped.rows.find((row) => row.status === value)?.n || 0]));
    counts.ALL = counts.PENDING + counts.ISSUED;
    const filters = {
      ...(search ? { search } : {}), ...(status ? { status } : {}), ...(inCustody ? { custody: inCustody } : {}),
    };
    await logAudit(db, {
      actor: req.user,
      actionType: Object.keys(filters).length ? 'CASE_SEARCHED' : 'CASE_QUEUE_VIEWED',
      details: { ...filters, page, pageSize },
      ip: req.ip,
    });
    res.json({
      ...pageEnvelope(rows.rows, counts[status || 'ALL'], page, pageSize), counts, serverNow: serverNow(),
    });
  });

  router.param('caseId', queries.caseIdParam);

  async function transmittedCase(caseId) {
    const file = await queries.findCase(db, caseId);
    if (file.status === 'IN_INVESTIGATION') throw new ApiError(404, 'CASE_NOT_FOUND');
    return file;
  }

  // Split-screen review. Opening it is itself recorded.
  router.get('/cases/:caseId', async (req, res) => {
    const { caseId } = req.params;
    await custody.sync();
    const file = await transmittedCase(caseId);
    await logAudit(db, { actor: req.user, actionType: 'CASE_ACCESSED', caseId, ip: req.ip });
    const [participants, evidence, mandates, trail] = await Promise.all([
      queries.participantsOf(db, caseId),
      queries.evidenceOf(db, caseId),
      queries.mandatesOf(db, caseId),
      queries.trailOf(db, caseId),
    ]);
    res.json({
      case: file,
      participants: participants.rows,
      evidence: evidence.rows,
      mandates: mandates.rows,
      trail: trail.rows,
      documentLimitBytes: EVIDENCE_LIMIT_BYTES,
      serverNow: serverNow(),
    });
  });

  // Decrypts one evidence file and proves it is the file that was uploaded.
  router.get('/cases/:caseId/evidence/:evidenceId/content', async (req, res) => {
    const { caseId, evidenceId } = req.params;
    await transmittedCase(caseId);
    const found = isUuid(evidenceId) ? await db.query(
      `SELECT file_name, mime_type, storage_url, sha256_hash FROM digital_evidence
        WHERE case_id = $1 AND evidence_id = $2`, [caseId, evidenceId]) : null;
    if (!found?.rowCount) throw new ApiError(404, 'EVIDENCE_NOT_FOUND');
    const file = found.rows[0];
    if (!storage.configured) throw new ApiError(503, 'STORAGE_NOT_CONFIGURED');

    const broken = async () => {
      await logAudit(db, {
        actor: req.user, actionType: 'EVIDENCE_INTEGRITY_FAILED', caseId, ip: req.ip, details: { evidenceId },
      });
      throw new ApiError(409, 'EVIDENCE_INTEGRITY_FAILED');
    };
    let content;
    try {
      content = await storage.get(objectKeyFrom(file.storage_url));
    } catch (err) {
      console.error(`Evidence read failed: ${err.message}`);
      // Node reports a failed authentication tag this way: the stored bytes changed.
      if (/authenticate data|Not an encrypted/i.test(err.message)) await broken();
      throw new ApiError(502, 'STORAGE_READ_FAILED');
    }
    if (crypto.createHash('sha256').update(content).digest('hex') !== file.sha256_hash) await broken();

    await logAudit(db, {
      actor: req.user, actionType: 'EVIDENCE_ACCESSED', caseId, ip: req.ip, details: { evidenceId },
    });
    res.attachment(file.file_name);
    res.set('Content-Type', file.mime_type);
    res.send(content);
  });

  return router;
}

module.exports = { createMagistrateRouter };
