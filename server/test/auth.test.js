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

  describe('15-minute session limit', () => {
    const userId = async () => (await ctx.owner.query('SELECT user_id FROM users WHERE email = $1', [ADMIN.email]))
      .rows[0].user_id;
    // A token issued `age` seconds ago for a 15-minute session.
    const tokenAged = async (age) => {
      const iat = Math.floor(Date.now() / 1000) - age;
      return jwt.sign({ iat, exp: iat + 900 }, ctx.config.jwtSecret, { subject: await userId() });
    };
    const backdateLogins = () => ctx.owner.query(
      `UPDATE audit_logs SET created_at = now() - interval '1 hour' WHERE action_type = 'USER_LOGIN'`);

    test('requests do not renew or extend the session', async () => {
      const token = await ctx.login();
      for (const url of ['/api/auth/me', '/api/admin/users']) {
        const res = await ctx.as(token).get(url);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers['x-session-token'], undefined);
      }
      assert.strictEqual((await ctx.as(token).post('/api/auth/activity')).status, 404);
    });

    test('ends 15 minutes after sign-in even for an active user, logged once', async () => {
      await ctx.login();
      await backdateLogins();
      const before = await ctx.auditCount('SESSION_EXPIRED');
      const stale = await tokenAged(901);
      for (let i = 0; i < 2; i += 1) {
        const res = await ctx.as(stale).get('/api/auth/me');
        assert.strictEqual(res.status, 401);
        assert.strictEqual(res.body.error, 'SESSION_EXPIRED');
      }
      await ctx.as(stale).post('/api/auth/session-expired');
      assert.strictEqual(await ctx.auditCount('SESSION_EXPIRED'), before + 1);
    });

    test('the browser timeout call ends only a session that is due', async () => {
      const token = await ctx.login();
      await ctx.as(token).post('/api/auth/session-expired');
      assert.strictEqual((await ctx.as(token).get('/api/auth/me')).status, 200);
      await backdateLogins();
      const before = await ctx.auditCount('SESSION_EXPIRED');
      const due = await tokenAged(870);
      assert.strictEqual((await ctx.as(due).post('/api/auth/session-expired')).status, 204);
      assert.strictEqual((await ctx.as(token).get('/api/auth/me')).status, 401);
      assert.strictEqual(await ctx.auditCount('SESSION_EXPIRED'), before + 1);
    });

    test('an old session expiring leaves a newer sign-in alone', async () => {
      const old = await tokenAged(901);
      const fresh = await ctx.login();
      await ctx.as(old).post('/api/auth/session-expired');
      assert.strictEqual((await ctx.as(fresh).get('/api/auth/me')).status, 200);
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
