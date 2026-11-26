// Case initiation and participant registration.
const { CUSTODY_HOURS, PARTICIPANT_ROLES, TIME_ZONE, MAX_PARTICIPANTS } = require('../../constants');
const { ApiError } = require('../../errors');
const { logAudit } = require('../../services/audit');
const { isUuid } = require('../../validation');

const CUSTODY_ID_MESSAGE = 'Suspect National ID is required to initiate a custody timer';

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function parseCase(body) {
  const data = {
    incidentTitle: text(body?.incidentTitle),
    offenseCategoryId: text(body?.offenseCategoryId),
    incidentDatetime: text(body?.incidentDatetime),
    originatingUnitId: text(body?.originatingUnitId),
    narrative: text(body?.narrative),
  };
  const fields = {};
  if (!data.incidentTitle) fields.incidentTitle = 'INCIDENT_TITLE_REQUIRED';
  else if (data.incidentTitle.length > 200) fields.incidentTitle = 'INCIDENT_TITLE_TOO_LONG';
  if (!isUuid(data.offenseCategoryId)) fields.offenseCategoryId = 'OFFENSE_REQUIRED';
  if (!isUuid(data.originatingUnitId)) fields.originatingUnitId = 'STATION_REQUIRED';
  if (data.narrative.length > 20000) fields.narrative = 'NARRATIVE_TOO_LONG';
  // An explicit offset is required so the time cannot shift with the server's zone.
  const when = /(Z|[+-]\d{2}:\d{2})$/.test(data.incidentDatetime) ? new Date(data.incidentDatetime) : null;
  if (!when || Number.isNaN(when.getTime())) fields.incidentDatetime = 'INCIDENT_DATE_REQUIRED';
  else if (when.getTime() > Date.now() + 5 * 60 * 1000) fields.incidentDatetime = 'INCIDENT_DATE_IN_FUTURE';

  const input = Array.isArray(body?.participants) ? body.participants : [];
  if (!input.length) fields.participants = 'PARTICIPANT_REQUIRED';
  if (input.length > MAX_PARTICIPANTS) fields.participants = 'TOO_MANY_PARTICIPANTS';

  const seen = new Set();
  const rows = [];
  const participants = input.slice(0, MAX_PARTICIPANTS).map((item, index) => {
    const person = {
      role: item?.role,
      fullName: text(item?.fullName),
      nationalId: text(item?.nationalId).toUpperCase() || null,
      phone: text(item?.phone) || null,
      detained: item?.role === 'SUSPECT' && item?.detained === true,
    };
    const errors = {};
    if (!PARTICIPANT_ROLES.includes(person.role)) errors.role = 'PARTICIPANT_ROLE_REQUIRED';
    if (!person.fullName) errors.fullName = 'PARTICIPANT_NAME_REQUIRED';
    else if (person.fullName.length > 150) errors.fullName = 'FULL_NAME_TOO_LONG';
    if (person.detained && !person.nationalId) errors.nationalId = 'CUSTODY_ID_REQUIRED';
    else if (person.nationalId && person.nationalId.length > 30) errors.nationalId = 'NATIONAL_ID_TOO_LONG';
    if (person.phone && person.phone.length > 25) errors.phone = 'PHONE_TOO_LONG';
    if (person.nationalId) {
      const identity = `${person.role}:${person.nationalId}`;
      if (seen.has(identity)) errors.nationalId = 'DUPLICATE_PARTICIPANT';
      seen.add(identity);
    }
    if (Object.keys(errors).length) rows.push({ index, errors });
    return person;
  });

  if (Object.keys(fields).length || rows.length) {
    const custodyIdMissing = rows.some((row) => row.errors.nationalId === 'CUSTODY_ID_REQUIRED');
    throw new ApiError(400, 'VALIDATION_FAILED', {
      fields,
      rows,
      ...(custodyIdMissing ? { message: CUSTODY_ID_MESSAGE } : {}),
    });
  }
  return { ...data, participants };
}

// Next printed number for the year. The advisory lock serialises concurrent saves.
async function nextCaseId(client) {
  const year = (await client.query(`SELECT to_char(now() AT TIME ZONE '${TIME_ZONE}', 'YYYY') AS year`)).rows[0].year;
  const prefix = `CM-MFD-${year}-`;
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [prefix]);
  const last = await client.query(
    `SELECT coalesce(max(substring(case_id FROM ${prefix.length + 1})::int), 0) AS n
       FROM criminal_case_files WHERE case_id LIKE $1`,
    [`${prefix}%`],
  );
  return `${prefix}${String(last.rows[0].n + 1).padStart(4, '0')}`;
}

// Identity is stored once. A known national ID links to the existing person,
// whose recorded name is never overwritten from another case.
async function upsertPerson(client, person) {
  if (!person.nationalId) {
    const created = await client.query(
      'INSERT INTO persons (full_name, phone_number) VALUES ($1, $2) RETURNING person_id',
      [person.fullName, person.phone],
    );
    return { personId: created.rows[0].person_id };
  }
  const saved = await client.query(
    `INSERT INTO persons (national_id, full_name, phone_number) VALUES ($1, $2, $3)
     ON CONFLICT (national_id) DO UPDATE
        SET phone_number = coalesce(persons.phone_number, excluded.phone_number), updated_at = now()
     RETURNING person_id, full_name`,
    [person.nationalId, person.fullName, person.phone],
  );
  const { person_id: personId, full_name: recordedName } = saved.rows[0];
  const differs = recordedName.toLocaleLowerCase() !== person.fullName.toLocaleLowerCase();
  return {
    personId,
    mismatch: differs ? { nationalId: person.nationalId, recordedName, enteredName: person.fullName } : null,
  };
}

function createCaseHandler({ db }) {
  return async (req, res) => {
    const data = parseCase(req.body);
    const result = await db.transaction(async (client) => {
      const offense = await client.query(
        'SELECT 1 FROM offense_categories WHERE offense_category_id = $1 AND is_active', [data.offenseCategoryId]);
      if (!offense.rowCount) {
        throw new ApiError(400, 'VALIDATION_FAILED', { fields: { offenseCategoryId: 'OFFENSE_REQUIRED' } });
      }
      const unit = await client.query(
        `SELECT 1 FROM organizational_units WHERE unit_id = $1 AND unit_type IN ('COMMISSARIAT','GENDARMERIE')`,
        [data.originatingUnitId]);
      if (!unit.rowCount) {
        throw new ApiError(400, 'VALIDATION_FAILED', { fields: { originatingUnitId: 'STATION_REQUIRED' } });
      }

      const caseId = await nextCaseId(client);
      await client.query(
        `INSERT INTO criminal_case_files
           (case_id, incident_title, offense_category_id, incident_datetime, originating_unit_id, narrative, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [caseId, data.incidentTitle, data.offenseCategoryId, data.incidentDatetime, data.originatingUnitId,
          data.narrative || null, req.user.userId],
      );
      await logAudit(client, {
        actor: req.user, actionType: 'CASE_CREATED', caseId, ip: req.ip,
        details: { participants: data.participants.length },
      });

      const nameMismatches = [];
      let timers = 0;
      // A stable order keeps two concurrent saves from deadlocking on shared people.
      const ordered = [...data.participants].sort((a, b) => String(a.nationalId).localeCompare(String(b.nationalId)));
      for (const person of ordered) {
        const { personId, mismatch } = await upsertPerson(client, person);
        if (mismatch) nameMismatches.push(mismatch);
        const participant = await client.query(
          `INSERT INTO case_participants (case_id, person_id, role, is_detained)
           VALUES ($1, $2, $3, $4) RETURNING participant_id`,
          [caseId, personId, person.role, person.detained],
        );
        const participantId = participant.rows[0].participant_id;
        await logAudit(client, {
          actor: req.user, actionType: 'PARTICIPANT_REGISTERED', caseId, ip: req.ip,
          details: { participantId, role: person.role, detained: person.detained },
        });
        if (person.detained) {
          // now() is fixed within a transaction, so all three times agree exactly.
          await client.query(
            `INSERT INTO custody_countdown_timers (participant_id, started_at, statutory_expires_at, current_expires_at)
             VALUES ($1, now(), now() + make_interval(hours => $2), now() + make_interval(hours => $2))`,
            [participantId, CUSTODY_HOURS],
          );
          timers += 1;
        }
      }
      return { caseId, custodyTimers: timers, nameMismatches };
    });
    res.status(201).json(result);
  };
}

module.exports = { createCaseHandler, parseCase, CUSTODY_ID_MESSAGE };
