// The case being entered, and the checks for each step. The server repeats every
// check when the case is saved.
export const STEPS = ['incident', 'narrative', 'participants', 'review'];
export const PARTICIPANT_ROLES = ['SUSPECT', 'VICTIM', 'WITNESS'];
export const MAX_PARTICIPANTS = 50;
const MAX_NARRATIVE = 20000;

export const person = () => ({
  key: crypto.randomUUID(), role: 'SUSPECT', fullName: '', nationalId: '', phone: '', detained: false,
});

export const emptyCase = () => ({
  incidentTitle: '', offenseCategoryId: '', incidentDatetime: '', originatingUnitId: '', narrative: '',
  participants: [person()],
});

// Entered times are Cameroon local time (UTC+1, no daylight saving).
export const withZone = (local) => `${local}:00+01:00`;

function checkIncident(form) {
  const fields = {};
  if (!form.incidentTitle.trim()) fields.incidentTitle = 'INCIDENT_TITLE_REQUIRED';
  if (!form.offenseCategoryId) fields.offenseCategoryId = 'OFFENSE_REQUIRED';
  if (!form.incidentDatetime) fields.incidentDatetime = 'INCIDENT_DATE_REQUIRED';
  else if (Date.parse(withZone(form.incidentDatetime)) > Date.now() + 5 * 60 * 1000) {
    fields.incidentDatetime = 'INCIDENT_DATE_IN_FUTURE';
  }
  if (!form.originatingUnitId) fields.originatingUnitId = 'STATION_REQUIRED';
  return { fields, rows: {} };
}

function checkNarrative(form) {
  return { fields: form.narrative.length > MAX_NARRATIVE ? { narrative: 'NARRATIVE_TOO_LONG' } : {}, rows: {} };
}

function checkParticipants(form) {
  const rows = {};
  const seen = new Set();
  form.participants.forEach((p) => {
    const problems = {};
    const nationalId = p.nationalId.trim().toUpperCase();
    if (!p.fullName.trim()) problems.fullName = 'PARTICIPANT_NAME_REQUIRED';
    if (p.role === 'SUSPECT' && p.detained && !nationalId) problems.nationalId = 'CUSTODY_ID_REQUIRED';
    if (nationalId) {
      if (seen.has(`${p.role}:${nationalId}`)) problems.nationalId = 'DUPLICATE_PARTICIPANT';
      seen.add(`${p.role}:${nationalId}`);
    }
    if (Object.keys(problems).length) rows[p.key] = problems;
  });
  return { fields: form.participants.length ? {} : { participants: 'PARTICIPANT_REQUIRED' }, rows };
}

const CHECKS = [checkIncident, checkNarrative, checkParticipants];

export const hasProblems = ({ fields, rows }) => Object.keys(fields).length > 0 || Object.keys(rows).length > 0;

// `step` counts from 1; the review step has no fields of its own.
export const checkStep = (step, form) => CHECKS[step - 1]?.(form) || { fields: {}, rows: {} };

const NARRATIVE_FIELDS = ['narrative'];
const PARTICIPANT_FIELDS = ['participants'];

// The first step that shows one of these problems, or null.
export function stepWithProblem({ fields = {}, rows = {} }) {
  const names = Object.keys(fields);
  if (names.some((n) => !NARRATIVE_FIELDS.includes(n) && !PARTICIPANT_FIELDS.includes(n))) return 1;
  if (names.some((n) => NARRATIVE_FIELDS.includes(n))) return 2;
  if (names.length || Object.keys(rows).length) return 3;
  return null;
}
