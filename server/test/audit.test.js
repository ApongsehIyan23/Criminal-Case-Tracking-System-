const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { Client } = require('pg');
const { setup, appUrl } = require('./helpers');
const { csvCell } = require('../src/routes/admin/auditLogs');

describe('audit logs, pagination and CSV export', () => {
  let ctx;
  let admin;
  const SEEDED = 2300; // more than two export batches
  before(async () => {
    ctx = await setup();
    // Several rows share a timestamp to exercise the export cursor tie-break.
    await ctx.owner.query(
      `INSERT INTO audit_logs (actor_email, actor_role, action_type, details, created_at)
       SELECT 'seed' || g || '@ccts.test', 'SYSTEM', 'DATABASE_BACKUP', jsonb_build_object('n', g),
              timestamptz '2026-01-10 10:00:00+01' + make_interval(secs => g / 3)
         FROM generate_series(1, $1) g`, [SEEDED]);
    await ctx.owner.query(
      `INSERT INTO audit_logs (actor_email, actor_role, action_type, details, created_at) VALUES
        ('=cmd@ccts.test', 'ANONYMOUS', 'USER_LOGIN_FAILED', '{"note":"Éléonore 100%_done"}', '2026-02-01 00:30:00+01'),
        ('late@ccts.test', 'ANONYMOUS', 'USER_LOGIN_FAILED', NULL, '2026-02-01 23:59:00+01'),
        ('next@ccts.test', 'ANONYMOUS', 'USER_LOGIN_FAILED', NULL, '2026-02-02 00:00:00+01')`);
    admin = ctx.as(await ctx.login());
  });
  after(() => ctx.close());

  const csvLines = (res) => res.text.replace(/^﻿/, '').trim().split('\r\n');

  describe('append-only', () => {
    test('the application role cannot update, delete or truncate', async () => {
      const app = new Client({ connectionString: appUrl });
      await app.connect();
      try {
        for (const sql of [
          `UPDATE audit_logs SET actor_email = 'x'`,
          'DELETE FROM audit_logs',
          'TRUNCATE audit_logs',
          'ALTER TABLE audit_logs ADD COLUMN x int',
          'DROP TABLE audit_logs',
          `DELETE FROM users WHERE email = 'nobody'`,
          'DELETE FROM criminal_case_files',
        ]) {
          await assert.rejects(app.query(sql), { code: '42501' }, sql);
        }
        await app.query(`INSERT INTO audit_logs (actor_email, actor_role, action_type)
                         VALUES ('SYSTEM', 'SYSTEM', 'USER_LOGOUT')`);
        assert.ok((await app.query('SELECT count(*) FROM audit_logs')).rowCount);
      } finally {
        await app.end();
      }
    });

    test('the API exposes no route that changes audit logs', async () => {
      const id = (await ctx.owner.query('SELECT log_id FROM audit_logs LIMIT 1')).rows[0].log_id;
      for (const method of ['post', 'put', 'patch', 'delete']) {
        for (const url of ['/api/admin/audit-logs', `/api/admin/audit-logs/${id}`, '/api/admin/audit-logs/export']) {
          assert.strictEqual((await admin[method](url)).status, 404, `${method} ${url}`);
        }
      }
    });

    test('the health check confirms the protection', async () => {
      const res = await admin.get('/api/admin/system/health');
      assert.strictEqual(res.body.checks.find((c) => c.name === 'auditProtection').ok, true);
    });

    test('re-running the migration is safe and keeps the data', async () => {
      const { migrate } = require('../scripts/migrate');
      const { ownerUrl } = require('./helpers');
      const before = (await ctx.owner.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n;
      await migrate({ ownerUrl, appUrl, log: () => {} });
      assert.strictEqual((await ctx.owner.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n, before);
      const tables = await ctx.owner.query(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`);
      assert.strictEqual(tables.rows[0].n, 13);
    });
  });

  describe('Pattern B pagination', () => {
    test('audit logs default to 5 per page, newest first', async () => {
      const res = await admin.get('/api/admin/audit-logs?actionType=DATABASE_BACKUP');
      assert.strictEqual(res.body.pageSize, 5);
      assert.strictEqual(res.body.items.length, 5);
      assert.strictEqual(res.body.total, SEEDED);
      assert.strictEqual(res.body.totalPages, SEEDED / 5);
      const times = res.body.items.map((i) => i.createdAt);
      assert.deepStrictEqual(times, [...times].sort().reverse());
    });

    test('accepts only 5, 10 or 20 and handles the last page', async () => {
      const base = '/api/admin/audit-logs?actionType=USER_LOGIN_FAILED';
      assert.strictEqual((await admin.get(`${base}&pageSize=20`)).body.pageSize, 20);
      assert.strictEqual((await admin.get(`${base}&pageSize=999`)).body.pageSize, 5);
      assert.strictEqual((await admin.get(`${base}&page=-4`)).body.page, 1);
      assert.strictEqual((await admin.get(`${base}&page=2`)).body.items.length, 0);
    });

    test('a snapshot time keeps pages stable while new entries arrive', async () => {
      const first = await admin.get('/api/admin/audit-logs');
      const asOf = encodeURIComponent(first.body.asOf);
      const second = await admin.get(`/api/admin/audit-logs?page=2&asOf=${asOf}`);
      assert.strictEqual(second.body.total, first.body.total);
      const ids = new Set(first.body.items.map((i) => i.logId));
      assert.ok(second.body.items.every((i) => !ids.has(i.logId)));
    });

    test('the user directory paginates 5 per page', async () => {
      await ctx.owner.query(
        `INSERT INTO users (email, full_name, role)
         SELECT 'u' || g || '@ccts.test', 'User ' || g, 'EXAMINING_MAGISTRATE' FROM generate_series(1, 11) g`);
      const first = await admin.get('/api/admin/users');
      assert.deepStrictEqual(
        [first.body.items.length, first.body.total, first.body.totalPages], [5, 12, 3]);
      const last = await admin.get('/api/admin/users?page=3');
      assert.strictEqual(last.body.items.length, 2);
      assert.ok(!JSON.stringify(first.body).includes('password'));
    });

    test('the user directory searches by name, email or role and filters by status', async () => {
      const get = async (q) => (await admin.get(`/api/admin/users?${q}`)).body;
      const all = await get('');
      assert.strictEqual(all.counts.ALL, 12);
      assert.strictEqual(all.counts.INVITATION_PENDING, 11);
      assert.strictEqual((await get('search=u11%40ccts')).total, 1);
      assert.strictEqual((await get('search=User+3')).total, 1);
      // Role names match in English and in French.
      assert.strictEqual((await get('search=examining')).total, 11);
      assert.strictEqual((await get(`search=${encodeURIComponent('juge d')}`)).total, 11);
      assert.strictEqual((await get('search=%25')).total, 0);
      const active = await get('status=ACTIVE');
      assert.deepStrictEqual([active.total, active.counts.ALL], [1, 12]);
      assert.strictEqual((await admin.get('/api/admin/users?status=X')).status, 400);
      assert.ok(await ctx.auditCount('USER_DIRECTORY_SEARCHED'));
    });
  });

  describe('filters', () => {
    test('searches text literally, including French characters and wildcards', async () => {
      const accented = await admin.get(`/api/admin/audit-logs?search=${encodeURIComponent('éléonore')}&actionType=USER_LOGIN_FAILED`);
      assert.strictEqual(accented.body.total, 1);
      const literal = await admin.get(`/api/admin/audit-logs?search=${encodeURIComponent('100%_done')}&actionType=USER_LOGIN_FAILED`);
      assert.strictEqual(literal.body.total, 1);
    });

    test('date filters are inclusive whole days in Cameroon time', async () => {
      const res = await admin.get('/api/admin/audit-logs?from=2026-02-01&to=2026-02-01');
      assert.strictEqual(res.body.total, 2);
    });

    test('rejects bad filters', async () => {
      for (const query of ['from=2026-02-30', 'to=yesterday', 'from=2026-03-01&to=2026-02-01', 'actionType=NOPE']) {
        assert.strictEqual((await admin.get(`/api/admin/audit-logs?${query}`)).status, 400, query);
      }
    });
  });

  describe('CSV export', () => {
    test('contains the whole filtered set, not just the visible page', async () => {
      const res = await admin.get('/api/admin/audit-logs/export?actionType=DATABASE_BACKUP&page=1&pageSize=5');
      assert.strictEqual(res.status, 200);
      assert.match(res.headers['content-type'], /text\/csv/);
      assert.match(res.headers['content-disposition'], /attachment/);
      const lines = csvLines(res);
      assert.strictEqual(lines.length, SEEDED + 1);
      assert.strictEqual(new Set(lines.slice(1).map((l) => l.split(',').at(-1))).size, SEEDED);
      assert.ok((await ctx.auditCount('AUDIT_LOG_EXPORTED')) >= 1);
    });

    test('applies search and date filters and translates headers', async () => {
      const res = await admin.get('/api/admin/audit-logs/export?from=2026-02-01&to=2026-02-01&lang=FR');
      const lines = csvLines(res);
      assert.strictEqual(lines.length, 3);
      assert.ok(lines[0].includes('Horodatage'));
      assert.ok(res.text.includes('Éléonore'));
      assert.ok(res.text.includes(`"'=cmd@ccts.test"`));
    });

    test('neutralises spreadsheet formulas and escapes quotes', () => {
      assert.strictEqual(csvCell('+1'), `"'+1"`);
      assert.strictEqual(csvCell('@x'), `"'@x"`);
      assert.strictEqual(csvCell('say "hi", ok'), '"say ""hi"", ok"');
      assert.strictEqual(csvCell(null), '""');
    });
  });
});
