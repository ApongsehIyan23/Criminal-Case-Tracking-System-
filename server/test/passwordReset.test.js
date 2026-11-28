const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { setup, ADMIN } = require('./helpers');

describe('forgot password', () => {
  let ctx;
  before(async () => { ctx = await setup(); });
  after(() => ctx.close());

  const request = (email) => ctx.api.post('/api/auth/forgot-password').send({ email });
  const verify = (token) => ctx.api.get(`/api/auth/password-reset/verify?token=${token}`);
  const reset = (token, password, confirmPassword = password) =>
    ctx.api.post('/api/auth/password-reset').send({ token, password, confirmPassword });
  const tokenFrom = (message) => /reset-password\?token=([\w.-]+)/.exec(message.text)[1];
  // A fresh active account with the administrator's password.
  const account = async (email, status = 'ACTIVE') => {
    await ctx.owner.query(
      `INSERT INTO users (email, password_hash, full_name, role, status, preferred_language)
       SELECT $1, password_hash, 'Reset Person', 'EXAMINING_MAGISTRATE', $2, 'FR' FROM users WHERE email = $3`,
      [email, status, ADMIN.email],
    );
    return email;
  };

  test('emails a link, changes the password once, and does not sign in', async () => {
    const email = await account('forgot@ccts.test');
    const oldSession = await ctx.login(email, ADMIN.password);
    const asked = await request('  Forgot@CCTS.test ');
    assert.strictEqual(asked.status, 202);
    assert.deepStrictEqual(asked.body, { requested: true });
    assert.strictEqual(ctx.sent.length, 1);
    const mail = ctx.sent[0];
    assert.strictEqual(mail.to, email);
    assert.ok(mail.text.startsWith('Bonjour'));
    assert.ok(mail.text.includes('http://app.test/reset-password?token='));
    const token = tokenFrom(mail);
    const leaked = await ctx.owner.query('SELECT 1 FROM audit_logs WHERE details::text LIKE $1', [`%${token}%`]);
    assert.strictEqual(leaked.rowCount, 0);

    // A reset link is not a session.
    assert.strictEqual((await ctx.as(token).get('/api/auth/me')).status, 401);
    const checked = await verify(token);
    assert.strictEqual(checked.status, 200);
    assert.strictEqual(checked.body.email, email);

    const done = await reset(token, 'Brand-new-password-1');
    assert.strictEqual(done.status, 200);
    assert.strictEqual(done.body.token, undefined);
    assert.strictEqual((await ctx.as(oldSession).get('/api/auth/me')).status, 401);
    assert.strictEqual((await ctx.api.post('/api/auth/login').send({ email, password: ADMIN.password })).status, 401);
    const newSession = await ctx.login(email, 'Brand-new-password-1');
    assert.strictEqual((await ctx.as(newSession).get('/api/auth/me')).status, 200);
    // The old session stays dead after the new sign-in.
    assert.strictEqual((await ctx.as(oldSession).get('/api/auth/me')).status, 401);

    assert.strictEqual((await verify(token)).body.error, 'RESET_INVALID');
    assert.strictEqual((await reset(token, 'Another-password-2')).body.error, 'RESET_INVALID');
    assert.strictEqual(await ctx.auditCount('PASSWORD_RESET_COMPLETED'), 1);
    assert.strictEqual(await ctx.auditCount('PASSWORD_RESET_LINK_VERIFIED'), 1);
    assert.strictEqual(await ctx.auditCount('PASSWORD_RESET_FAILED'), 2);
  });

  test('answers the same for unknown, suspended and pending accounts, and sends nothing', async () => {
    const before = ctx.sent.length;
    const emails = ['nobody@ccts.test', await account('suspended@ccts.test', 'SUSPENDED'),
      await account('pending@ccts.test', 'INVITATION_PENDING')];
    for (const email of emails) {
      const res = await request(email);
      assert.strictEqual(res.status, 202);
      assert.deepStrictEqual(res.body, { requested: true });
    }
    assert.strictEqual(ctx.sent.length, before);
  });

  test('sends one email per account in two minutes, even for simultaneous requests', async () => {
    const email = await account('repeat@ccts.test');
    const before = ctx.sent.length;
    const results = await Promise.all([1, 2, 3, 4].map(() => request(email)));
    assert.ok(results.every((r) => r.status === 202));
    assert.strictEqual(ctx.sent.length, before + 1);
  });

  test('one link works once under simultaneous use', async () => {
    await request(await account('race-reset@ccts.test'));
    const token = tokenFrom(ctx.sent.at(-1));
    const results = await Promise.all([1, 2, 3].map(() => reset(token, 'Brand-new-password-1')));
    assert.deepStrictEqual(results.map((r) => r.status).sort(), [200, 400, 400]);
  });

  test('rejects expired, forged and malformed links', async () => {
    const email = await account('expired@ccts.test');
    await request(email);
    const { sub } = jwt.decode(tokenFrom(ctx.sent.at(-1)));
    const forged = jwt.sign({}, ctx.config.jwtSecret, { subject: sub, expiresIn: '30m' });
    const { rows } = await ctx.owner.query('SELECT password_hash FROM users WHERE user_id = $1', [sub]);
    const key = require('crypto').createHmac('sha256', ctx.config.jwtSecret)
      .update(`password-reset:${rows[0].password_hash}`).digest('hex');
    const iat = Math.floor(Date.now() / 1000) - 1801;
    const expired = jwt.sign({ iat, exp: iat + 1800 }, key, { subject: sub });
    for (const token of ['', 'abc', forged, expired]) {
      assert.strictEqual((await verify(token)).body.error, 'RESET_INVALID');
      assert.strictEqual((await reset(token, 'Brand-new-password-1')).body.error, 'RESET_INVALID');
    }
  });

  test('validates the email and the new password', async () => {
    assert.deepStrictEqual((await request('')).body.fields, { email: 'EMAIL_REQUIRED' });
    assert.deepStrictEqual((await request('not-an-email')).body.fields, { email: 'EMAIL_INVALID' });
    const weak = await reset('anything', 'short', 'different');
    assert.deepStrictEqual(weak.body.fields,
      { password: 'PASSWORD_TOO_SHORT', confirmPassword: 'PASSWORDS_DO_NOT_MATCH' });
  });

  test('gives the same answer when the email service fails, and records it', async () => {
    const email = await account('outage@ccts.test');
    ctx.mailer.failNext = true;
    const res = await request(email);
    assert.strictEqual(res.status, 202);
    assert.strictEqual(await ctx.auditCount('PASSWORD_RESET_EMAIL_FAILED'), 1);
  });
});
