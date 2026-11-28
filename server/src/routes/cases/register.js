// The Active Case Files Register: search, status tabs with counts, filters,
// sorting and pages. Only the fixed fragments below ever reach the SQL text.
const { CASE_STATUSES, CUSTODY_URGENT_HOURS } = require('../../constants');
const { ApiError } = require('../../errors');
const { parsePagination, pageEnvelope } = require('../../pagination');
const { OPEN_TIMERS, SUMMARY_COLUMNS } = require('./queries');

// A suspect of the case is still in custody.
const openTimer = (extra = '') => `EXISTS (
  SELECT 1 FROM custody_countdown_timers t JOIN case_participants p USING (participant_id)
   WHERE p.case_id = c.case_id AND t.status IN ${OPEN_TIMERS}${extra})`;

// Closed once every required ruling is issued and no custody timer is still open.
const CLOSED = `(c.status = 'MANDATE_ISSUED' AND NOT ${openTimer()})`;
const RECORD = `CASE WHEN ${CLOSED} THEN 'CLOSED' ELSE 'ACTIVE' END`;

const RECORD_FILTERS = { ACTIVE: `NOT ${CLOSED}`, CLOSED };
const CUSTODY_FILTERS = {
  IN_CUSTODY: openTimer(),
  URGENT: openTimer(` AND t.current_expires_at < now() + interval '${CUSTODY_URGENT_HOURS} hours'`),
  NONE: `NOT ${openTimer()}`,
};
// Names of selected columns.
const SORTS = {
  created: '"createdAt"', caseId: '"caseId"', timer: '"custodyExpiresAt"', evidence: '"evidenceCount"', record: 'record',
};

function parseRegister(query) {
  const text = (value) => (typeof value === 'string' ? value : '');
  const view = {
    search: text(query.search).trim().slice(0, 200),
    status: text(query.status),
    record: text(query.record),
    custody: text(query.custody),
    sort: text(query.sort) || 'created',
    dir: text(query.dir) || 'desc',
  };
  const known = (value, list) => !value || Object.hasOwn(list, value);
  if ((view.status && !CASE_STATUSES.includes(view.status)) || !known(view.record, RECORD_FILTERS)
    || !known(view.custody, CUSTODY_FILTERS) || !Object.hasOwn(SORTS, view.sort) || !['asc', 'desc'].includes(view.dir)) {
    throw new ApiError(400, 'VALIDATION_FAILED');
  }
  return { ...view, ...parsePagination(query) };
}

async function listRegister(db, { search, status, record, custody, sort, dir, page, pageSize, offset }) {
  const params = [];
  const clauses = ['TRUE'];
  if (search) {
    const p = `$${params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`)}`;
    clauses.push(`(c.case_id ILIKE ${p} OR c.incident_title ILIKE ${p} OR c.narrative ILIKE ${p}
      OR o.label_en ILIKE ${p} OR o.label_fr ILIKE ${p}
      OR EXISTS (SELECT 1 FROM case_participants p JOIN persons s USING (person_id)
                  WHERE p.case_id = c.case_id AND (s.full_name ILIKE ${p} OR s.national_id ILIKE ${p})))`);
  }
  if (record) clauses.push(RECORD_FILTERS[record]);
  if (custody) clauses.push(CUSTODY_FILTERS[custody]);
  const from = () => `FROM criminal_case_files c
    JOIN organizational_units u ON u.unit_id = c.originating_unit_id
    JOIN offense_categories o ON o.offense_category_id = c.offense_category_id
   WHERE ${clauses.join(' AND ')}`;

  // Tab counts follow the search and filters, but not the chosen tab.
  const countSql = `SELECT c.status, count(*)::int AS n ${from()} GROUP BY c.status`;
  const countParams = [...params];
  if (status) clauses.push(`c.status = $${params.push(status)}`);

  const [rows, grouped] = await Promise.all([
    db.query(
      `SELECT ${SUMMARY_COLUMNS}, c.created_at AS "createdAt", ${RECORD} AS record ${from()}
        ORDER BY ${SORTS[sort]} ${dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, "caseId" DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]),
    db.query(countSql, countParams),
  ]);
  const counts = Object.fromEntries(CASE_STATUSES.map((name) => [name, 0]));
  grouped.rows.forEach((row) => { counts[row.status] = row.n; });
  counts.ALL = grouped.rows.reduce((total, row) => total + row.n, 0);
  return { ...pageEnvelope(rows.rows, counts[status || 'ALL'], page, pageSize), counts };
}

module.exports = { parseRegister, listRegister };
