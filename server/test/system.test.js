const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const { createNeonClient, NeonError } = require('../src/services/neon');

describe('system health and backups', () => {
  let ctx;
  let admin;
  before(async () => {
    ctx = await setup();
    admin = ctx.as(await ctx.login());
  });
  after(() => ctx.close());

  test('reports health checks', async () => {
    const res = await admin.get('/api/admin/system/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.healthy, true);
    assert.deepStrictEqual(res.body.checks.map((c) => c.name), ['database', 'auditProtection', 'email', 'backups']);
  });

  test('a backup creates a snapshot, records it and logs DATABASE_BACKUP', async () => {
    const res = await admin.post('/api/admin/system/backups');
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, 'COMPLETED');
    assert.strictEqual(res.body.snapshotId, 'snap-test');
    assert.strictEqual(await ctx.auditCount('DATABASE_BACKUP'), 1);
    const history = await admin.get('/api/admin/system/backups');
    assert.strictEqual(history.body.items.length, 1);
  });

  test('an unfinished snapshot stays STARTED until Neon reports it finished', async () => {
    ctx.neon.pending = ['op-1'];
    ctx.neon.operationState = 'running';
    assert.strictEqual((await admin.post('/api/admin/system/backups')).body.status, 'STARTED');
    assert.strictEqual((await admin.get('/api/admin/system/backups')).body.items[0].status, 'STARTED');
    ctx.neon.operationState = 'finished';
    assert.strictEqual((await admin.get('/api/admin/system/backups')).body.items[0].status, 'COMPLETED');
    ctx.neon.pending = [];
  });

  test('a failed backup is recorded as FAILED, never as completed', async () => {
    ctx.neon.nextError = new NeonError('SNAPSHOT_LIMIT_REACHED', 'snapshot limit exceeded');
    const res = await admin.post('/api/admin/system/backups');
    assert.strictEqual(res.status, 502);
    assert.strictEqual(res.body.error, 'SNAPSHOT_LIMIT_REACHED');
    const history = await admin.get('/api/admin/system/backups');
    assert.strictEqual(history.body.items[0].status, 'FAILED');
    assert.strictEqual(await ctx.auditCount('DATABASE_BACKUP_FAILED'), 1);
    ctx.neon.nextError = null;
  });

  test('the Neon client calls the snapshot endpoint on the default branch', async () => {
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push([options.method, url, options.headers.Authorization]);
      const body = url.endsWith('/branches')
        ? { branches: [{ id: 'br-other' }, { id: 'br-main', default: true }] }
        : { snapshot: { id: 'snap-1' }, operations: [{ id: 'op-1', status: 'running' }] };
      return { ok: true, status: 200, json: async () => body };
    };
    const client = createNeonClient({ neonApiKey: 'key', neonProjectId: 'proj', neonBranchId: '' }, fakeFetch);
    const result = await client.createSnapshot('ccts-test');
    assert.deepStrictEqual(result, { snapshotId: 'snap-1', branchId: 'br-main', operationIds: ['op-1'] });
    assert.deepStrictEqual(calls[1], [
      'POST', 'https://console.neon.tech/api/v2/projects/proj/branches/br-main/snapshot?name=ccts-test', 'Bearer key',
    ]);
  });

  test('the Neon client reports a missing configuration', async () => {
    const client = createNeonClient({ neonApiKey: '', neonProjectId: '', neonBranchId: '' });
    await assert.rejects(client.createSnapshot('x'), { code: 'BACKUP_NOT_CONFIGURED' });
  });
});
