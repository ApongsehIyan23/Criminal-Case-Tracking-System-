const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Client } = require('pg');
const { setup, appUrl } = require('./helpers');

const PASSWORD = 'Officer-password-123';
const png = (size = 2000) => Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(size - 8)]);
const HOUR = 3600000;

describe('examining magistrate', () => {
  let ctx;
  let officer;
  let judge;
  let reference;
  let nationalId = 0;

  before(async () => {
    ctx = await setup();
    const hash = await bcrypt.hash(PASSWORD, 12);
    for (const [email, role] of [
      ['officer@ccts.test', 'JUDICIAL_POLICE_OFFICER'], ['judge@ccts.test', 'EXAMINING_MAGISTRATE'],
    ]) {
      await ctx.owner.query(
        `INSERT INTO users (email, password_hash, full_name, role, status) VALUES ($1,$2,$1,$3,'ACTIVE')`,
        [email, hash, role]);
    }
    officer = ctx.as(await ctx.login('officer@ccts.test', PASSWORD));
    judge = ctx.as(await ctx.login('judge@ccts.test', PASSWORD));
    reference = (await officer.get('/api/cases/reference')).body;
  });
  after(() => ctx.close());

  const rows = async (sql, params) => (await ctx.owner.query(sql, params)).rows;

  // Creates a case with `detained` suspects in custody, optionally transmitted.
  async function makeCase({ detained = 1, free = 0, hours = null, transmit = true, file = false, title = 'Theft' } = {}) {
    const person = (isDetained) => {
      nationalId += 1;
      return { role: 'SUSPECT', fullName: `Suspect ${nationalId}`, nationalId: `N-${nationalId}`, detained: isDetained };
    };
    const participants = [
      ...Array.from({ length: detained }, () => person(true)),
      ...Array.from({ length: free }, () => person(false)),
      { role: 'VICTIM', fullName: 'Victim' },
    ];
    const created = await officer.post('/api/cases').send({
      incidentTitle: title, offenseCategoryId: reference.offenses[0].offenseCategoryId,
      originatingUnitId: reference.units[0].unitId, incidentDatetime: '2026-01-15T14:30:00+01:00', participants,
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    const { caseId } = created.body;
    if (file) {
      await officer.post(`/api/cases/${caseId}/evidence`).field('category', 'CRIME_SCENE_PHOTO')
        .attach('file', file, 'scene.png');
    }
    if (hours !== null) {
      await ctx.owner.query(
        `UPDATE custody_countdown_timers SET current_expires_at = now() + make_interval(secs => $2)
          WHERE participant_id IN (SELECT participant_id FROM case_participants WHERE case_id = $1)`,
        [caseId, Math.round(hours * 3600)]);
    }
    if (transmit) assert.strictEqual((await officer.post(`/api/cases/${caseId}/transmit`)).status, 200);
    const people = await rows(
      `SELECT participant_id, is_detained FROM case_participants WHERE case_id = $1 AND role = 'SUSPECT'
        ORDER BY is_detained DESC, participant_id`, [caseId]);
    return { caseId, suspects: people.map((p) => p.participant_id) };
  }

  const rule = (caseId, participantId, decision = 'RELEASE', rulingNotes = 'Motifs / reasons') => judge
    .post(`/api/cases/${caseId}/mandate`).send({ participantId, decision, rulingNotes });
  const timerOf = async (participantId) => (await rows(
    `SELECT status, current_expires_at AS expires, statutory_expires_at AS statutory
       FROM custody_countdown_timers WHERE participant_id = $1`, [participantId]))[0];
  const statusOf = async (caseId) => (await rows(
    'SELECT status FROM criminal_case_files WHERE case_id = $1', [caseId]))[0].status;
  const auditFor = async (caseId, action) => (await rows(
    'SELECT details FROM audit_logs WHERE case_id = $1 AND action_type = $2', [caseId, action]));

  describe('analytics and queue', () => {
    const cases = {};
    before(async () => {
      cases.later = await makeCase({ hours: 20, title: 'Later deadline' });
      cases.none = await makeCase({ detained: 0, free: 1, title: 'Nobody detained' });
      cases.urgent = await makeCase({ hours: 1, title: 'Urgent héritage' });
      cases.expired = await makeCase({ hours: -1, title: 'Passed deadline' });
      cases.soon = await makeCase({ hours: 5, title: 'Soon' });
      cases.second = await makeCase({ detained: 0, free: 1, title: 'Nobody detained later' });
      cases.hidden = await makeCase({ hours: 0.5, transmit: false, title: 'Still with police' });
      cases.done = await makeCase({ hours: 30, title: 'Completed' });
      await rule(cases.done.caseId, cases.done.suspects[0]);
      await ctx.owner.query(
        `UPDATE criminal_case_files c SET transmitted_at = m.issued_at - interval '3 hours'
           FROM judicial_mandates m WHERE m.case_id = c.case_id AND c.case_id = $1`, [cases.done.caseId]);
    });

    test('counts pending review, urgent alerts, turnaround and mandates', async () => {
      const { body } = await judge.get('/api/magistrate/dashboard');
      assert.strictEqual(body.kpis.pendingReview, 6);
      assert.strictEqual(body.kpis.urgentCustody, 2);
      assert.strictEqual(body.kpis.mandatesIssued, 1);
      assert.strictEqual(Math.round(body.kpis.averageTurnaroundSeconds), 3 * 3600);
      assert.deepStrictEqual(body.urgent.map((u) => u.caseId), [cases.expired.caseId, cases.urgent.caseId]);
      assert.strictEqual(await ctx.auditCount('MAGISTRATE_DASHBOARD_VIEWED'), 1);
    });

    test('sorts urgent custody first and paginates 5 per page', async () => {
      const first = (await judge.get('/api/magistrate/queue')).body;
      assert.deepStrictEqual([first.pageSize, first.total, first.totalPages, first.items.length], [5, 7, 2, 5]);
      const second = (await judge.get('/api/magistrate/queue?page=2')).body;
      assert.deepStrictEqual([...first.items, ...second.items].map((c) => c.incidentTitle), [
        'Passed deadline', 'Urgent héritage', 'Soon', 'Later deadline',
        'Nobody detained', 'Nobody detained later', 'Completed',
      ]);
      assert.ok(first.items[0].leadSuspect);
      assert.strictEqual((await judge.get('/api/magistrate/queue?pageSize=10')).body.items.length, 7);
    });

    test('searches and filters, never showing untransmitted cases', async () => {
      const find = async (q) => (await judge.get(`/api/magistrate/queue?${q}`)).body.total;
      assert.strictEqual(await find(`search=${encodeURIComponent('héritage')}`), 1);
      assert.strictEqual(await find('search=Still+with+police'), 0);
      assert.strictEqual(await find('status=ISSUED'), 1);
      assert.strictEqual(await find('status=PENDING'), 6);
      assert.strictEqual((await judge.get('/api/magistrate/queue?status=X')).status, 400);
      assert.strictEqual((await judge.get(`/api/magistrate/cases/${cases.hidden.caseId}`)).status, 404);
    });

    test('counts each review tab, filters by custody and sorts', async () => {
      const get = async (q) => (await judge.get(`/api/magistrate/queue?pageSize=20&${q}`)).body;
      assert.deepStrictEqual((await get('')).counts, { ALL: 7, PENDING: 6, ISSUED: 1 });
      const reviewed = await get('status=ISSUED');
      assert.deepStrictEqual(reviewed.counts, { ALL: 7, PENDING: 6, ISSUED: 1 });
      assert.ok(reviewed.items[0].createdAt);
      assert.deepStrictEqual((await get('search=Nobody')).counts, { ALL: 2, PENDING: 2, ISSUED: 0 });
      assert.deepStrictEqual((await get('custody=URGENT')).items.map((c) => c.incidentTitle),
        ['Passed deadline', 'Urgent héritage']);
      const ids = (await get('sort=caseId&dir=desc')).items.map((c) => c.caseId);
      assert.deepStrictEqual(ids, [...ids].sort().reverse());
      for (const bad of ['custody=X', 'sort=narrative', 'dir=sideways', 'status=constructor']) {
        assert.strictEqual((await judge.get(`/api/magistrate/queue?${bad}`)).status, 400, bad);
      }
    });
  });

  describe('split-screen review', () => {
    test('logs CASE_ACCESSED when a case is opened', async () => {
      const { caseId } = await makeCase({ file: png() });
      const before = (await auditFor(caseId, 'CASE_ACCESSED')).length;
      const res = await judge.get(`/api/magistrate/cases/${caseId}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual((await auditFor(caseId, 'CASE_ACCESSED')).length, before + 1);
      assert.strictEqual(res.body.evidence[0].virusScanStatus, 'PENDING');
      assert.ok(res.body.evidence[0].uploadedBy && res.body.evidence[0].sha256);
      assert.ok(res.body.trail.length);
    });

    test('returns the original evidence file and records the access', async () => {
      const file = png(3000);
      const { caseId } = await makeCase({ file });
      const { evidence } = (await judge.get(`/api/magistrate/cases/${caseId}`)).body;
      const url = `/api/magistrate/cases/${caseId}/evidence/${evidence[0].evidenceId}/content`;
      const res = await judge.get(url).buffer(true);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'image/png');
      assert.deepStrictEqual(res.body, file);
      assert.strictEqual((await auditFor(caseId, 'EVIDENCE_ACCESSED')).length, 1);
      assert.strictEqual((await officer.get(url)).status, 403);

      const [saved] = await rows('SELECT storage_url FROM digital_evidence WHERE case_id = $1', [caseId]);
      const stored = ctx.bucket.get(saved.storage_url.replace('s3://test-bucket/', ''));
      stored[stored.length - 1] ^= 1;
      const broken = await judge.get(url);
      assert.strictEqual(broken.body.error, 'EVIDENCE_INTEGRITY_FAILED');
      assert.strictEqual((await auditFor(caseId, 'EVIDENCE_INTEGRITY_FAILED')).length, 1);
    });
  });

  describe('mandates', () => {
    test('blocks a missing decision, empty notes or no suspect', async () => {
      const { caseId, suspects } = await makeCase();
      for (const [body, field] of [
        [{ participantId: suspects[0], rulingNotes: 'x' }, 'decision'],
        [{ participantId: suspects[0], decision: 'ACQUIT', rulingNotes: 'x' }, 'decision'],
        [{ participantId: suspects[0], decision: 'RELEASE', rulingNotes: '   ' }, 'rulingNotes'],
        [{ decision: 'RELEASE', rulingNotes: 'x' }, 'participantId'],
        [{ participantId: crypto.randomUUID(), decision: 'RELEASE', rulingNotes: 'x' }, 'participantId'],
      ]) {
        const res = await judge.post(`/api/cases/${caseId}/mandate`).send(body);
        assert.strictEqual(res.status, 400, JSON.stringify(res.body));
        assert.ok(res.body.fields[field], field);
      }
      assert.strictEqual((await rows('SELECT 1 FROM judicial_mandates WHERE case_id = $1', [caseId])).length, 0);
      assert.strictEqual(await statusOf(caseId), 'TRANSMITTED_TO_MAGISTRATE');
      assert.ok((await auditFor(caseId, 'MANDATE_REJECTED')).length >= 5);
    });

    for (const [decision, status, shift] of [
      ['RELEASE', 'RELEASED', 0], ['EXTEND_CUSTODY', 'EXTENDED', 48], ['PRE_TRIAL_DETENTION', 'TRANSFERRED', 0],
    ]) {
      test(`${decision} updates the timer and completes the case`, async () => {
        const { caseId, suspects } = await makeCase({ hours: 3 });
        const previous = await timerOf(suspects[0]);
        const res = await rule(caseId, suspects[0], decision);
        assert.strictEqual(res.status, 201, JSON.stringify(res.body));
        assert.strictEqual(res.body.caseStatus, 'MANDATE_ISSUED');
        const timer = await timerOf(suspects[0]);
        assert.strictEqual(timer.status, status);
        assert.strictEqual(timer.expires - previous.expires, shift * HOUR);
        assert.deepStrictEqual(timer.statutory, previous.statutory, 'the statutory record never moves');
        assert.strictEqual(await statusOf(caseId), 'MANDATE_ISSUED');
        const [log] = await auditFor(caseId, 'MANDATE_ISSUED');
        assert.strictEqual(log.details.decision, decision);
      });
    }

    test('rules each detained suspect separately; the last ruling completes the case', async () => {
      const { caseId, suspects } = await makeCase({ detained: 2, free: 1, hours: 4 });
      const [first, second, atLarge] = suspects;
      assert.strictEqual((await rule(caseId, atLarge)).status, 400, 'only detained suspects need a ruling');
      const one = await rule(caseId, first, 'PRE_TRIAL_DETENTION');
      assert.deepStrictEqual([one.body.caseStatus, one.body.remainingRulings], ['TRANSMITTED_TO_MAGISTRATE', 1]);
      assert.strictEqual((await timerOf(second)).status, 'ACTIVE');
      assert.strictEqual((await rule(caseId, first)).body.error, 'SUSPECT_ALREADY_RULED');
      const two = await rule(caseId, second, 'RELEASE');
      assert.strictEqual(two.body.caseStatus, 'MANDATE_ISSUED');
      assert.strictEqual((await rule(caseId, second)).body.error, 'CASE_ALREADY_RULED');
    });

    test('allows only one ruling when two arrive together', async () => {
      const { caseId, suspects } = await makeCase();
      const results = await Promise.all([rule(caseId, suspects[0]), rule(caseId, suspects[0], 'EXTEND_CUSTODY')]);
      assert.deepStrictEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.strictEqual((await rows('SELECT 1 FROM judicial_mandates WHERE case_id = $1', [caseId])).length, 1);
    });

    test('without custody, a suspect can be ruled on but not extended', async () => {
      const { caseId, suspects } = await makeCase({ detained: 0, free: 1 });
      const extend = await rule(caseId, suspects[0], 'EXTEND_CUSTODY');
      assert.strictEqual(extend.body.fields.decision, 'EXTENSION_NEEDS_CUSTODY');
      assert.strictEqual((await rule(caseId, suspects[0], 'RELEASE')).body.caseStatus, 'MANDATE_ISSUED');
    });

    test('refuses untransmitted cases and other roles', async () => {
      const { caseId, suspects } = await makeCase({ transmit: false });
      assert.strictEqual((await rule(caseId, suspects[0])).body.error, 'CASE_NOT_TRANSMITTED');
      for (const actor of [officer, ctx.as(await ctx.login())]) {
        const res = await actor.post(`/api/cases/${caseId}/mandate`)
          .send({ participantId: suspects[0], decision: 'RELEASE', rulingNotes: 'x' });
        assert.strictEqual(res.status, 403);
      }
      for (const url of ['/api/magistrate/dashboard', '/api/magistrate/queue']) {
        assert.strictEqual((await officer.get(url)).status, 403);
      }
      assert.strictEqual((await judge.get('/api/cases')).status, 403);
    });

    test('shows the signed mandate on the police docket, with its document', async () => {
      const { caseId, suspects } = await makeCase();
      const signed = Buffer.from('%PDF-1.7\nsigned judgment');
      const issued = await judge.post(`/api/cases/${caseId}/mandate`)
        .field('participantId', suspects[0]).field('decision', 'RELEASE')
        .field('rulingNotes', 'Libération immédiate ordonnée.').attach('document', signed, 'jugement signé.pdf');
      assert.strictEqual(issued.status, 201, JSON.stringify(issued.body));

      const docket = (await officer.get(`/api/cases/${caseId}`)).body;
      assert.strictEqual(docket.case.status, 'MANDATE_ISSUED');
      const [mandate] = docket.mandates;
      assert.strictEqual(mandate.decision, 'RELEASE');
      assert.strictEqual(mandate.rulingNotes, 'Libération immédiate ordonnée.');
      assert.strictEqual(mandate.issuedBy, 'judge@ccts.test');
      assert.strictEqual(mandate.signedDocumentName, 'jugement signé.pdf');
      const download = await officer.get(`/api/cases/${caseId}/mandates/${mandate.mandateId}/document`)
        .buffer(true).parse((res, done) => {
          const parts = [];
          res.on('data', (c) => parts.push(c));
          res.on('end', () => done(null, Buffer.concat(parts)));
        });
      assert.deepStrictEqual(download.body, signed);
      assert.strictEqual((await auditFor(caseId, 'SIGNED_DOCUMENT_ACCESSED')).length, 1);

      const bad = await makeCase();
      const refused = await judge.post(`/api/cases/${bad.caseId}/mandate`)
        .field('participantId', bad.suspects[0]).field('decision', 'RELEASE').field('rulingNotes', 'x')
        .attach('document', Buffer.from('MZ'), 'virus.pdf');
      assert.strictEqual(refused.body.fields.document, 'FILE_TYPE_NOT_ALLOWED');
    });

    test('a signed record cannot be changed or deleted by the application', async () => {
      const app = new Client({ connectionString: appUrl });
      await app.connect();
      try {
        for (const sql of [`UPDATE judicial_mandates SET decision = 'RELEASE'`, 'DELETE FROM judicial_mandates']) {
          await assert.rejects(app.query(sql), { code: '42501' }, sql);
        }
      } finally {
        await app.end();
      }
      const { caseId } = await makeCase();
      for (const method of ['put', 'patch', 'delete']) {
        assert.ok([403, 404].includes((await judge[method](`/api/cases/${caseId}/mandate`)).status), method);
      }
    });
  });
});
