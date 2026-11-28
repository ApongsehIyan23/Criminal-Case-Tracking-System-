export const DEFAULT_VIEW = {
  search: '', status: '', record: '', custody: '', sort: 'created', dir: 'desc', page: 1, pageSize: 5,
};

// [translation key, sort, direction]
export const SORT_CHOICES = [
  ['newest', 'created', 'desc'],
  ['oldest', 'created', 'asc'],
  ['caseAsc', 'caseId', 'asc'],
  ['caseDesc', 'caseId', 'desc'],
  ['leastTime', 'timer', 'asc'],
  ['mostEvidence', 'evidence', 'desc'],
  ['activeFirst', 'record', 'asc'],
];

export const RECORD_FILTERS = [['all', ''], ['active', 'ACTIVE'], ['closed', 'CLOSED']];

export const CUSTODY_FILTERS = [['all', ''], ['inCustody', 'IN_CUSTODY'], ['urgent', 'URGENT'], ['none', 'NONE']];

// Column widths of the design, kept in the same proportions at any table width.
// The first and last include the 20px edge padding.
export const COLUMNS = [
  { id: 'select', width: 56 },
  { id: 'caseId', width: 150, sort: 'caseId' },
  { id: 'summary', width: 200 },
  { id: 'timer', width: 160, sort: 'timer' },
  { id: 'evidence', width: 120, sort: 'evidence' },
  { id: 'record', width: 100, sort: 'record' },
  { id: 'status', width: 170 },
  { id: 'actions', width: 90 },
];
export const TABLE_WIDTH = COLUMNS.reduce((total, column) => total + column.width, 0);
