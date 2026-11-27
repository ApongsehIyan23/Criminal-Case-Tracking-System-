const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { setup } = require('./helpers');

const PASSWORD = 'Officer-password-123';
const MESSAGE = 'Suspect National ID is required to initiate a custody timer';
const png = (size = 1000) => Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(size - 8)]);
const pdf = () => Buffer.from('%PDF-1.7\nstatement');

describe('judicial police', () => {
  let ctx;
  let officer;
  let judgeToken;
  let reference;
  const year = new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Africa/Douala' }).format(new Date());

  before(async () => {
    ctx = await setup();
    const hash = await bcrypt.hash(PASSWORD, 12);
    for (const [email, role, status] of [
      ['officer@ccts.test', 'JUDICIAL_POLICE_OFFICER', 'ACTIVE'],
      ['judge@ccts.test', 'EXAMINING_MAGISTRATE', 'ACTIVE'],
      ['judge2@ccts.test', 'EXAMINING_MAGISTRATE', 'ACTIVE'],
      ['gone@ccts.test', 'EXAMINING_MAGISTRATE', 'SUSPENDED'],
    ]) {
      await ctx.owner.query(
        'INSERT INTO users (email, password_hash, full_name, role, status) VALUES ($1,$2,$1,$3,$4)',
        [email, hash, role, status]);
    }
    officer = ctx.as(await ctx.login('officer@ccts.test', PASSWORD));
    judgeToken = await ctx.login('judge@ccts.test', PASSWORD);
    reference = (await officer.get('/api/cases/reference')).body;
  });
  after(() => ctx.close());

  const rows = async (sql, params) => (await ctx.owner.query(sql, params)).rows;
  const caseBody = (extra = {}) => ({
    incidentTitle: 'Vol au marché Mokolo / Market theft',
    offenseCategoryId: reference.offenses[0].offenseCategoryId,
    originatingUnitId: reference.units[0].unitId,
    incidentDatetime: '2026-01-15T14:30:00+01:00',
    narrative: 'Sac volé près de l’entrée. Bag stolen near the gate.',
    participants: [{ role: 'VICTIM', fullName: 'Rose Abena' }],
    ...extra,
  });
  const suspect = (nationalId, extra = {}) => ({
    role: 'SUSPECT', fullName: `Suspect ${nationalId}`, nationalId, detained: true, ...extra,
  });
  const createCase = async (extra) => {
    const res = await officer.post('/api/cases').send(caseBody(extra));
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    return res.body.caseId;
  };
  const upload = (caseId, buffer, name = 'scene.png', category = 'CRIME_SCENE_PHOTO') => officer
    .post(`/api/cases/${caseId}/evidence`).field('category', category).attach('file', buffer, name);
  const setRemaining = (caseId, interval) => ctx.owner.query(
    `UPDATE custody_countdown_timers SET current_expires_at = now() + $2::interval
      WHERE participant_id IN (SELECT participant_id FROM case_participants WHERE case_id = $1)`,
    [caseId, interval]);
  const actionsFor = async (caseId) => (await rows(
    'SELECT action_type FROM audit_logs WHERE case_id = $1 ORDER BY created_at', [caseId])).map((r) => r.action_type);

  describe('case creation', () => {
    test('numbers cases CM-MFD-YEAR-XXXX in sequence', async () => {
      const first = await createCase();
      const second = await createCase();
      assert.match(first, /^CM-MFD-\d{4}-\d{4}$/);
      assert.strictEqual(first, `CM-MFD-${year}-0001`);
      assert.strictEqual(second, `CM-MFD-${year}-0002`);
    });

    test('concurrent saves never share a number', async () => {
      const ids = await Promise.all(Array.from({ length: 8 }, () => createCase()));
      assert.strictEqual(new Set(ids).size, 8);
    });

    test('blocks a detained suspect without a National ID, with the exact message', async () => {
      const before = (await rows('SELECT count(*)::int AS n FROM criminal_case_files'))[0].n;
      const res = await officer.post('/api/cases').send(caseBody({
        participants: [{ role: 'VICTIM', fullName: 'A' }, suspect('   ', { fullName: 'No Id' })],
      }));
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.message, MESSAGE);
      assert.deepStrictEqual(res.body.rows, [{ index: 1, errors: { nationalId: 'CUSTODY_ID_REQUIRED' } }]);
      assert.strictEqual((await rows('SELECT count(*)::int AS n FROM criminal_case_files'))[0].n, before);
    });

    test('allows a suspect who is not detained to have no ID, without a timer', async () => {
      const res = await officer.post('/api/cases').send(caseBody({
        participants: [{ role: 'SUSPECT', fullName: 'Unknown', detained: false },
          { role: 'WITNESS', fullName: 'W', detained: true }],
      }));
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.custodyTimers, 0);
      const saved = await rows('SELECT is_detained FROM case_participants WHERE case_id = $1', [res.body.caseId]);
      assert.ok(saved.every((p) => p.is_detained === false));
    });

    test('starts each custody timer at exactly started_at plus 48 hours', async () => {
      const caseId = await createCase({ participants: [suspect('CM-111'), suspect('CM-222')] });
      const timers = await rows(
        `SELECT t.status, t.statutory_expires_at - t.started_at = interval '48 hours' AS statutory,
                t.current_expires_at = t.statutory_expires_at AS same,
                t.started_at > now() - interval '1 minute' AS fresh
           FROM custody_countdown_timers t JOIN case_participants p USING (participant_id) WHERE p.case_id = $1`,
        [caseId]);
      assert.strictEqual(timers.length, 2);
      assert.ok(timers.every((t) => t.statutory && t.same && t.fresh && t.status === 'ACTIVE'));
    });

    test('stores each person once and flags a differing name', async () => {
      await createCase({ participants: [suspect('cm-900', { fullName: 'Paul Biloa' })] });
      const res = await officer.post('/api/cases').send(caseBody({
        participants: [suspect('CM-900', { fullName: 'Pol Biloa', phone: '699000000' })],
      }));
      assert.deepStrictEqual(res.body.nameMismatches,
        [{ nationalId: 'CM-900', recordedName: 'Paul Biloa', enteredName: 'Pol Biloa' }]);
      const people = await rows(`SELECT full_name, phone_number FROM persons WHERE national_id = 'CM-900'`);
      assert.deepStrictEqual(people, [{ full_name: 'Paul Biloa', phone_number: '699000000' }]);
    });

    test('validates the incident and participants, saving nothing', async () => {
      const res = await officer.post('/api/cases').send(caseBody({
        incidentTitle: ' ', incidentDatetime: '2099-01-01T00:00:00+01:00', offenseCategoryId: 'x',
        participants: [suspect('D-1'), suspect('d-1'), { role: 'JUDGE', fullName: '' }],
      }));
      assert.strictEqual(res.status, 400);
      assert.deepStrictEqual(Object.keys(res.body.fields).sort(),
        ['incidentDatetime', 'incidentTitle', 'offenseCategoryId']);
      assert.strictEqual(res.body.rows[0].errors.nationalId, 'DUPLICATE_PARTICIPANT');
      assert.ok(res.body.rows[1].errors.role && res.body.rows[1].errors.fullName);
      assert.strictEqual((await officer.post('/api/cases').send(caseBody({ participants: [] }))).status, 400);
    });
  });

  describe('evidence', () => {
    test('records the SHA-256, stores only ciphertext and stays scan pending', async () => {
      const caseId = await createCase();
      const file = png(4000);
      const res = await upload(caseId, file, 'scène du délit.png');
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      const hash = crypto.createHash('sha256').update(file).digest('hex');
      assert.strictEqual(res.body.sha256, hash);
      assert.strictEqual(res.body.virusScanStatus, 'PENDING');
      assert.strictEqual(res.body.fileName, 'scène du délit.png');

      const [saved] = await rows('SELECT * FROM digital_evidence WHERE evidence_id = $1', [res.body.evidenceId]);
      assert.strictEqual(saved.sha256_hash, hash);
      assert.strictEqual(saved.virus_scan_status, 'PENDING');
      assert.strictEqual(saved.is_locked, false);
      const key = saved.storage_url.replace('s3://test-bucket/', '');
      const stored = ctx.bucket.get(key);
      assert.strictEqual(stored.includes(file.subarray(0, 64)), false, 'bucket must not hold the plain file');
      assert.deepStrictEqual(await ctx.storage.get(key), file);

      stored[stored.length - 1] ^= 1;
      await assert.rejects(ctx.storage.get(key), 'tampering must be detected');
    });

    test('accepts JPEG, PNG and PDF only, judged by content', async () => {
      const caseId = await createCase();
      assert.strictEqual((await upload(caseId, pdf(), 'statement.pdf', 'WITNESS_STATEMENT')).status, 201);
      assert.strictEqual((await upload(caseId, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]), 'a.JPG')).status, 201);
      for (const [buffer, name] of [
        [Buffer.from('MZ executable'), 'photo.png'], [png(), 'photo.exe'], [pdf(), 'photo.png'],
        [Buffer.from('<svg/>'), 'x.svg'],
      ]) {
        const res = await upload(caseId, buffer, name);
        assert.strictEqual(res.body.fields?.file, 'FILE_TYPE_NOT_ALLOWED', name);
      }
      const missing = await officer.post(`/api/cases/${caseId}/evidence`).field('category', 'OTHER');
      assert.deepStrictEqual(missing.body.fields, { category: 'CATEGORY_REQUIRED', file: 'FILE_REQUIRED' });
      assert.ok((await actionsFor(caseId)).includes('EVIDENCE_UPLOAD_REJECTED'));
    });

    test('limits the total per case to 500 KB, even for simultaneous uploads', async () => {
      const caseId = await createCase();
      assert.strictEqual((await upload(caseId, png(600 * 1024))).body.error, 'EVIDENCE_LIMIT_EXCEEDED');
      const results = await Promise.all([1, 2, 3].map(() => upload(caseId, png(200 * 1024))));
      assert.deepStrictEqual(results.map((r) => r.status).sort(), [201, 201, 413]);
      assert.strictEqual(results.find((r) => r.status === 413).body.remainingBytes, 100 * 1024);
      assert.strictEqual((await upload(caseId, png(100 * 1024))).status, 201);
      assert.strictEqual((await upload(caseId, png(10))).status, 413);
    });

    test('saves nothing when storage fails', async () => {
      const caseId = await createCase();
      ctx.s3.failNext = true;
      assert.strictEqual((await upload(caseId, png())).body.error, 'STORAGE_FAILED');
      assert.strictEqual((await rows('SELECT 1 FROM digital_evidence WHERE case_id = $1', [caseId])).length, 0);
    });
  });

  describe('transmission', () => {
    test('sets the status, locks evidence and blocks further changes', async () => {
      const caseId = await createCase({ participants: [suspect('CM-333')] });
      await upload(caseId, png());
      const review = await officer.get(`/api/cases/${caseId}/transmission-review`);
      assert.strictEqual(review.body.evidence.length, 1);

      const res = await officer.post(`/api/cases/${caseId}/transmit`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'TRANSMITTED_TO_MAGISTRATE');
      const [saved] = await rows('SELECT * FROM criminal_case_files WHERE case_id = $1', [caseId]);
      assert.ok(saved.transmitted_at && saved.transmitted_by);
      const evidence = await rows('SELECT is_locked FROM digital_evidence WHERE case_id = $1', [caseId]);
      assert.ok(evidence.every((e) => e.is_locked));

      assert.strictEqual((await upload(caseId, png())).body.error, 'CASE_LOCKED');
      assert.strictEqual((await officer.post(`/api/cases/${caseId}/transmit`)).body.error, 'CASE_ALREADY_TRANSMITTED');
      assert.strictEqual((await officer.delete(`/api/cases/${caseId}`)).status, 404);
      assert.strictEqual((await rows(
        `SELECT 1 FROM notifications_log WHERE case_id = $1 AND notification_type = 'VICTIM_TRANSMISSION_SURVEY'`,
        [caseId])).length, 0);

      const actions = await actionsFor(caseId);
      for (const expected of ['CASE_CREATED', 'PARTICIPANT_REGISTERED', 'EVIDENCE_UPLOADED',
        'TRANSMISSION_REVIEW_OPENED', 'CASE_TRANSMITTED', 'EVIDENCE_UPLOAD_REJECTED']) {
        assert.ok(actions.includes(expected), expected);
      }
      assert.strictEqual(actions.filter((a) => a === 'CASE_TRANSMITTED').length, 1);
    });
  });

  describe('custody alerts', () => {
    const alertsFor = (caseId) => rows(
      `SELECT channel, recipient_address, delivery_status FROM notifications_log
        WHERE case_id = $1 AND notification_type = 'CUSTODY_EXPIRY_WARNING'
        ORDER BY recipient_address, channel`, [caseId]);

    test('sends nothing while more than 6 hours remain', async () => {
      const caseId = await createCase({ participants: [suspect('CM-401')] });
      await setRemaining(caseId, '6 hours 5 minutes');
      await officer.post('/api/custody/sync');
      assert.strictEqual((await alertsFor(caseId)).length, 0);
    });

    test('alerts the officer and active magistrates once, however often the app loads', async () => {
      const caseId = await createCase({ participants: [suspect('CM-402')] });
      await setRemaining(caseId, '5 hours');
      const sentBefore = ctx.sent.length;
      const results = await Promise.all(Array.from({ length: 6 }, () => officer.post('/api/custody/sync')));
      await ctx.as(judgeToken).post('/api/custody/sync');
      assert.strictEqual(results.reduce((n, r) => n + r.body.alerted, 0), 1);

      const alerts = await alertsFor(caseId);
      assert.deepStrictEqual(alerts.map((a) => `${a.recipient_address} ${a.channel} ${a.delivery_status}`).sort(), [
        'judge2@ccts.test EMAIL SENT', 'judge2@ccts.test IN_APP DELIVERED',
        'judge@ccts.test EMAIL SENT', 'judge@ccts.test IN_APP DELIVERED',
        'officer@ccts.test EMAIL SENT', 'officer@ccts.test IN_APP DELIVERED',
      ]);
      const mails = ctx.sent.slice(sentBefore);
      assert.strictEqual(mails.length, 3);
      assert.ok(mails.every((m) => m.text.includes(caseId) && !m.text.includes('CM-402')));
      assert.strictEqual((await actionsFor(caseId)).filter((a) => a === 'CUSTODY_ALERT_SENT').length, 1);

      const inbox = await ctx.as(judgeToken).get('/api/notifications');
      assert.strictEqual(inbox.body.items.filter((i) => i.caseId === caseId).length, 1);
    });

    test('retries a failed email later without repeating the others', async () => {
      const caseId = await createCase({ participants: [suspect('CM-403')] });
      await setRemaining(caseId, '1 hour');
      ctx.mailer.failNext = true;
      await officer.post('/api/custody/sync');
      assert.strictEqual((await alertsFor(caseId)).filter((a) => a.delivery_status === 'FAILED').length, 1);
      const sent = ctx.sent.length;
      await officer.post('/api/custody/sync');
      assert.strictEqual(ctx.sent.length, sent, 'waits before retrying');
      await ctx.owner.query(
        `UPDATE notifications_log SET payload = payload || jsonb_build_object('attemptedAt', now() - interval '6 minutes')
          WHERE case_id = $1`, [caseId]);
      await officer.post('/api/custody/sync');
      assert.strictEqual(ctx.sent.length, sent + 1);
      assert.ok((await alertsFor(caseId)).every((a) => a.delivery_status !== 'FAILED'));
      assert.ok((await actionsFor(caseId)).includes('CUSTODY_ALERT_EMAIL_FAILED'));
    });

    test('marks a passed deadline EXPIRED and keeps the statutory record', async () => {
      const caseId = await createCase({ participants: [suspect('CM-404')] });
      await setRemaining(caseId, '-1 minute');
      await officer.post('/api/custody/sync');
      await officer.post('/api/custody/sync');
      const [timer] = await rows(
        `SELECT t.status, t.statutory_expires_at - t.started_at = interval '48 hours' AS intact
           FROM custody_countdown_timers t JOIN case_participants p USING (participant_id) WHERE p.case_id = $1`,
        [caseId]);
      assert.deepStrictEqual(timer, { status: 'EXPIRED', intact: true });
      const actions = await actionsFor(caseId);
      assert.strictEqual(actions.filter((a) => a === 'CUSTODY_EXPIRED').length, 1);
      assert.strictEqual(actions.filter((a) => a === 'CUSTODY_ALERT_SENT').length, 1);
    });
  });

  describe('dashboard, register and docket', () => {
    test('lists custody cards with the least time remaining first', async () => {
      const res = await officer.get('/api/cases/dashboard');
      const times = res.body.custody.map((c) => c.expiresAt);
      assert.ok(times.length >= 4);
      assert.deepStrictEqual(times, [...times].sort());
      assert.strictEqual(res.body.custody[0].timerStatus, 'EXPIRED');
      assert.ok(res.body.serverNow);
    });

    test('searches in English and French, filters and paginates', async () => {
      const caseId = await createCase({ incidentTitle: 'Escroquerie à l’héritage', narrative: 'Forged will' });
      const find = async (search, extra = '') => (await officer
        .get(`/api/cases?search=${encodeURIComponent(search)}${extra}`)).body;
      assert.strictEqual((await find('héritage')).items[0].caseId, caseId);
      assert.strictEqual((await find('forged WILL')).total, 1);
      assert.strictEqual((await find('Paul Biloa')).total, 2);
      assert.strictEqual((await find(caseId)).total, 1);
      assert.strictEqual((await find('%')).total, 0);
      assert.strictEqual((await find('', '&status=TRANSMITTED_TO_MAGISTRATE')).total, 1);
      const page = (await officer.get('/api/cases')).body;
      assert.strictEqual(page.items.length, 5);
      assert.ok(page.total > 5);
      assert.ok((await ctx.auditCount('CASE_SEARCHED')) >= 5);
    });

    test('opening a docket logs access and returns the trail and any mandate', async () => {
      const caseId = await createCase({ participants: [suspect('CM-777')] });
      const before = await officer.get(`/api/cases/${caseId}`);
      assert.deepStrictEqual(before.body.mandates, []);
      assert.ok(before.body.trail.some((t) => t.actionType === 'CASE_ACCESSED'));
      await ctx.owner.query(
        `INSERT INTO judicial_mandates (case_id, participant_id, decision, ruling_notes, issued_by)
         SELECT p.case_id, p.participant_id, 'RELEASE', 'Libération ordonnée', u.user_id
           FROM users u, case_participants p WHERE u.email = 'judge@ccts.test' AND p.case_id = $1`, [caseId]);
      const after = await officer.get(`/api/cases/${caseId}`);
      assert.strictEqual(after.body.mandates[0].decision, 'RELEASE');
      assert.strictEqual((await officer.get('/api/cases/CM-MFD-2026-9999')).status, 404);
      assert.strictEqual((await officer.get('/api/cases/nonsense')).status, 404);
    });

    test('is closed to other roles', async () => {
      for (const token of [judgeToken, await ctx.login()]) {
        for (const [method, url] of [['get', '/api/cases'], ['post', '/api/cases'], ['get', '/api/cases/dashboard'],
          ['post', `/api/cases/CM-MFD-${year}-0001/transmit`]]) {
          assert.strictEqual((await ctx.as(token)[method](url)).status, 403, url);
        }
      }
      assert.strictEqual((await ctx.api.get('/api/cases')).status, 401);
      assert.strictEqual((await ctx.api.get('/api/notifications')).status, 401);
      assert.strictEqual((await ctx.api.post('/api/custody/sync')).status, 401);
    });
  });
});
