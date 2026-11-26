const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { setup, ADMIN } = require('./helpers');

describe('authentication, sessions and RBAC', () => {
  let ctx;
  before(async () => {
    ctx = await setup();
    const hash = await bcrypt.hash('Officer-password-123', 12);
    for (const [email, role, status] of [
      ['police@ccts.test', 'JUDICIAL_POLICE_OFFICER', 'ACTIVE'],
      ['judge@ccts.test', 'EXAMINING_MAGISTRATE', 'ACTIVE'],
      ['suspended@ccts.test', 'JUDICIAL_POLICE_OFFICER', 'SUSPENDED'],
      ['pending@ccts.test', 'JUDICIAL_POLICE_OFFICER', 'INVITATION_PENDING'],
    ]) {
      await ctx.owner.query(
        'INSERT INTO users (email, password_hash, full_name, role, status) VALUES ($1,$2,$1,$3,$4)',
        [email, status === 'INVITATION_PENDING' ? null : hash, role, status],
      );
    }
  });
  after(() => ctx.close());

  const idle = (email, minutes) => ctx.owner.query(
    'UPDATE users SET last_activity_at = now() - make_interval(mins => $2) WHERE email = $1',
    [email, minutes],
  );

  describe('login', () => {
    test('succeeds, issues a 15-minute JWT and routes by role', async () => {
      for (const [email, password, home] of [
        [ADMIN.email, ADMIN.password, '/admin'],
        ['police@ccts.test', 'Officer-password-123', '/police'],
        ['judge@ccts.test', 'Officer-password-123', '/magistrate'],
      ]) {
        const res = await ctx.api.post('/api/auth/login').send({ email: ` ${email.toUpperCase()} `, password });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.redirectTo, home);
        const claims = jwt.verify(res.body.token, ctx.config.jwtSecret);
        assert.strictEqual(claims.exp - claims.iat, 15 * 60);
        assert.ok(!JSON.stringify(res.body).includes('password'));
      }
      assert.strictEqual(await ctx.auditCount('USER_LOGIN'), 3);
    });

    test('stores passwords as bcrypt hashes with cost 12', async () => {
      const row = await ctx.owner.query('SELECT password_hash FROM users WHERE email = $1', [ADMIN.email]);
      assert.match(row.rows[0].password_hash, /^\$2b\$12\$/);
    });

    test('gives the same answer for a wrong password and an unknown email', async () => {
      const wrong = await ctx.api.post('/api/auth/login').send({ email: ADMIN.email, password: 'nope-nope-nope' });
      const unknown = await ctx.api.post('/api/auth/login').send({ email: 'ghost@ccts.test', password: 'nope-nope-nope' });
      for (const res of [wrong, unknown]) {
        assert.strictEqual(res.status, 401);
        assert.deepStrictEqual(res.body, { error: 'INVALID_CREDENTIALS' });
      }
      const logged = await ctx.owner.query(
        `SELECT actor_email, actor_role, details FROM audit_logs WHERE action_type = 'USER_LOGIN_FAILED'`,
      );
      assert.strictEqual(logged.rowCount, 2);
      assert.ok(logged.rows.every((r) => r.actor_email === 'ANONYMOUS' && r.actor_role === 'ANONYMOUS'));
      assert.ok(!JSON.stringify(logged.rows).includes('nope-nope'));
    });

    test('refuses accounts that are not ACTIVE', async () => {
      const suspended = await ctx.api.post('/api/auth/login')
        .send({ email: 'suspended@ccts.test', password: 'Officer-password-123' });
      assert.strictEqual(suspended.status, 403);
      assert.strictEqual(suspended.body.error, 'ACCOUNT_NOT_ACTIVE');
      const pending = await ctx.api.post('/api/auth/login')
        .send({ email: 'pending@ccts.test', password: 'Officer-password-123' });
      assert.strictEqual(pending.status, 401);
    });

    test('reports missing fields', async () => {
      const res = await ctx.api.post('/api/auth/login').send({});
      assert.strictEqual(res.status, 400);
      assert.deepStrictEqual(res.body.fields, { email: 'EMAIL_REQUIRED', password: 'PASSWORD_REQUIRED' });
    });
  });

  describe('15-minute inactivity rule', () => {
    test('allows a request within the window and slides it forward', async () => {
      const token = await ctx.login();
      await idle(ADMIN.email, 14);
      const res = await ctx.as(token).get('/api/auth/me');
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers['x-session-token']);
      const row = await ctx.owner.query(
        `SELECT last_activity_at > now() - interval '1 minute' AS fresh FROM users WHERE email = $1`, [ADMIN.email]);
      assert.strictEqual(row.rows[0].fresh, true);
    });

    test('ends the session after 15 idle minutes and logs it once', async () => {
      const token = await ctx.login();
      const before = await ctx.auditCount('SESSION_EXPIRED');
      await idle(ADMIN.email, 16);
      for (let i = 0; i < 2; i += 1) {
        const res = await ctx.as(token).get('/api/auth/me');
        assert.strictEqual(res.status, 401);
        assert.strictEqual(res.body.error, 'SESSION_EXPIRED');
        assert.strictEqual(res.headers['x-session-token'], undefined);
      }
      assert.strictEqual(await ctx.auditCount('SESSION_EXPIRED'), before + 1);
    });

    test('rejects an expired JWT even if the account was recently active', async () => {
      await ctx.login();
      const id = (await ctx.owner.query('SELECT user_id FROM users WHERE email = $1', [ADMIN.email])).rows[0].user_id;
      const stale = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 5 }, ctx.config.jwtSecret, { subject: id });
      const res = await ctx.as(stale).get('/api/auth/me');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error, 'SESSION_EXPIRED');
    });

    test('the heartbeat keeps a session alive', async () => {
      const token = await ctx.login();
      await idle(ADMIN.email, 14);
      assert.strictEqual((await ctx.as(token).post('/api/auth/activity')).status, 204);
    });

    test('the browser timeout call ends only a session that is really idle', async () => {
      const token = await ctx.login();
      await ctx.as(token).post('/api/auth/session-expired');
      assert.strictEqual((await ctx.as(token).get('/api/auth/me')).status, 200);
      await idle(ADMIN.email, 15);
      assert.strictEqual((await ctx.as(token).post('/api/auth/session-expired')).status, 204);
      assert.strictEqual((await ctx.as(token).get('/api/auth/me')).status, 401);
    });

    test('logout invalidates the session', async () => {
      const token = await ctx.login();
      assert.strictEqual((await ctx.as(token).post('/api/auth/logout')).status, 204);
      assert.strictEqual((await ctx.as(token).get('/api/auth/me')).status, 401);
      assert.ok((await ctx.auditCount('USER_LOGOUT')) >= 1);
    });
  });

  describe('role gating', () => {
    const adminRoutes = [
      ['get', '/api/admin/users'],
      ['get', '/api/admin/units'],
      ['get', '/api/admin/audit-logs'],
      ['get', '/api/admin/audit-logs/export'],
      ['get', '/api/admin/system/health'],
      ['get', '/api/admin/system/backups'],
      ['post', '/api/admin/system/backups'],
      ['post', '/api/admin/invitations'],
    ];

    test('requires authentication on every admin route', async () => {
      for (const [method, url] of adminRoutes) {
        assert.strictEqual((await ctx.api[method](url)).status, 401, `${method} ${url}`);
      }
    });

    test('forbids police officers and magistrates from admin routes', async () => {
      for (const email of ['police@ccts.test', 'judge@ccts.test']) {
        const token = await ctx.login(email, 'Officer-password-123');
        for (const [method, url] of adminRoutes) {
          const res = await ctx.as(token)[method](url);
          assert.strictEqual(res.status, 403, `${email} ${method} ${url}`);
        }
      }
      assert.strictEqual(await ctx.auditCount('ACCESS_DENIED'), adminRoutes.length * 2);
    });

    test('rejects forged tokens and applies role or status changes immediately', async () => {
      const forged = jwt.sign({}, 'another-secret-another-secret-12345', { subject: 'x' });
      assert.strictEqual((await ctx.as(forged).get('/api/admin/users')).status, 401);
      const token = await ctx.login('police@ccts.test', 'Officer-password-123');
      await ctx.owner.query(`UPDATE users SET status = 'SUSPENDED' WHERE email = 'police@ccts.test'`);
      assert.strictEqual((await ctx.as(token).get('/api/auth/me')).status, 401);
    });

    test('lets the administrator in', async () => {
      const token = await ctx.login();
      assert.strictEqual((await ctx.as(token).get('/api/admin/users')).status, 200);
    });
  });
});
