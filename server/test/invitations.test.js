const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { setup } = require('./helpers');

describe('invitation flow', () => {
  let ctx;
  let admin;
  let unitId;
  before(async () => {
    ctx = await setup();
    admin = ctx.as(await ctx.login());
    unitId = (await ctx.owner.query(`SELECT unit_id FROM organizational_units WHERE unit_code = 'COM-YDE-C1'`))
      .rows[0].unit_id;
  });
  after(() => ctx.close());

  const account = (email, extra = {}) => ({
    fullName: 'Jeanne Éwané', email, role: 'JUDICIAL_POLICE_OFFICER', ...extra,
  });
  const userCount = async () => (await ctx.owner.query('SELECT count(*)::int AS n FROM users')).rows[0].n;

  test('create, verify, activate, then log in', async () => {
    const created = await admin.post('/api/admin/invitations').send({
      accounts: [
        account('Officer@CCTS.test', { organizationalUnitId: unitId, preferredLanguage: 'FR' }),
        account('magistrate@ccts.test', { role: 'EXAMINING_MAGISTRATE' }),
      ],
    });
    assert.strictEqual(created.status, 201);
    assert.ok(created.body.created.every((c) => c.emailSent));
    assert.strictEqual(ctx.sent.length, 2);
    assert.strictEqual(await ctx.auditCount('ACCOUNT_INVITED'), 2);

    const mail = ctx.sent.find((m) => m.to === 'officer@ccts.test');
    const token = ctx.tokenFrom(mail);
    assert.ok(mail.text.startsWith('Bonjour'));
    assert.ok(mail.text.includes('http://app.test/activate?token='));

    // Only the SHA-256 hash is stored, valid for 24 hours; the raw token appears nowhere.
    const stored = await ctx.owner.query(
      `SELECT i.token_hash, extract(epoch FROM i.expires_at - i.created_at)::int AS ttl
         FROM account_invitations i JOIN users u USING (user_id) WHERE u.email = 'officer@ccts.test'`);
    assert.strictEqual(stored.rows[0].token_hash, crypto.createHash('sha256').update(token).digest('hex'));
    assert.strictEqual(stored.rows[0].ttl, 24 * 3600);
    const leaked = await ctx.owner.query(
      `SELECT 1 FROM audit_logs WHERE details::text LIKE $1
       UNION ALL SELECT 1 FROM notifications_log WHERE payload::text LIKE $1`, [`%${token}%`]);
    assert.strictEqual(leaked.rowCount, 0);
    const notices = await ctx.owner.query('SELECT delivery_status, channel FROM notifications_log');
    assert.ok(notices.rows.every((n) => n.delivery_status === 'SENT' && n.channel === 'EMAIL'));

    assert.strictEqual((await ctx.api.post('/api/auth/login')
      .send({ email: 'officer@ccts.test', password: 'New-password-123' })).status, 401);

    const verified = await ctx.api.get(`/api/auth/invitations/verify?token=${token}`);
    assert.strictEqual(verified.status, 200);
    assert.strictEqual(verified.body.email, 'officer@ccts.test');

    const activated = await ctx.api.post('/api/auth/activate')
      .send({ token, password: 'New-password-123', confirmPassword: 'New-password-123' });
    assert.strictEqual(activated.status, 200);
    assert.strictEqual(activated.body.redirectTo, '/login');
    assert.strictEqual(activated.body.token, undefined, 'activation must not sign the user in');
    assert.strictEqual(await ctx.auditCount('ACCOUNT_ACTIVATED'), 1);

    const login = await ctx.api.post('/api/auth/login')
      .send({ email: 'officer@ccts.test', password: 'New-password-123' });
    assert.strictEqual(login.status, 200);
    assert.strictEqual(login.body.redirectTo, '/police');

    // Single use.
    assert.strictEqual((await ctx.api.get(`/api/auth/invitations/verify?token=${token}`)).status, 400);
    const again = await ctx.api.post('/api/auth/activate')
      .send({ token, password: 'Other-password-1', confirmPassword: 'Other-password-1' });
    assert.strictEqual(again.body.error, 'INVITATION_INVALID');
  });

  test('concurrent activations of one token succeed only once', async () => {
    await admin.post('/api/admin/invitations').send({ accounts: [account('race@ccts.test')] });
    const token = ctx.tokenFrom(ctx.sent.at(-1));
    const body = { token, password: 'New-password-123', confirmPassword: 'New-password-123' };
    const results = await Promise.all([1, 2, 3].map(() => ctx.api.post('/api/auth/activate').send(body)));
    assert.deepStrictEqual(results.map((r) => r.status).sort(), [200, 400, 400]);
  });

  test('activation validates the password', async () => {
    await admin.post('/api/admin/invitations').send({ accounts: [account('weak@ccts.test')] });
    const token = ctx.tokenFrom(ctx.sent.at(-1));
    const mismatch = await ctx.api.post('/api/auth/activate')
      .send({ token, password: 'New-password-123', confirmPassword: 'different-123' });
    assert.strictEqual(mismatch.body.fields.confirmPassword, 'PASSWORDS_DO_NOT_MATCH');
    const short = await ctx.api.post('/api/auth/activate').send({ token, password: 'abc', confirmPassword: 'abc' });
    assert.strictEqual(short.body.fields.password, 'PASSWORD_TOO_SHORT');
    const long = 'é'.repeat(37);
    const tooLong = await ctx.api.post('/api/auth/activate').send({ token, password: long, confirmPassword: long });
    assert.strictEqual(tooLong.body.fields.password, 'PASSWORD_TOO_LONG');
  });

  test('an expired link is rejected', async () => {
    await admin.post('/api/admin/invitations').send({ accounts: [account('late@ccts.test')] });
    const token = ctx.tokenFrom(ctx.sent.at(-1));
    await ctx.owner.query(
      `UPDATE account_invitations SET expires_at = now() - interval '1 second'
        WHERE user_id = (SELECT user_id FROM users WHERE email = 'late@ccts.test')`);
    assert.strictEqual((await ctx.api.get(`/api/auth/invitations/verify?token=${token}`)).status, 400);
  });

  test('resend invalidates the old link, issues a new one and is logged', async () => {
    const created = await admin.post('/api/admin/invitations').send({ accounts: [account('resend@ccts.test')] });
    const { userId } = created.body.created[0];
    const oldToken = ctx.tokenFrom(ctx.sent.at(-1));

    const resent = await admin.post(`/api/admin/users/${userId}/resend-invitation`);
    assert.strictEqual(resent.status, 200);
    const newToken = ctx.tokenFrom(ctx.sent.at(-1));
    assert.notStrictEqual(newToken, oldToken);
    assert.strictEqual((await ctx.api.get(`/api/auth/invitations/verify?token=${oldToken}`)).status, 400);
    assert.strictEqual((await ctx.api.get(`/api/auth/invitations/verify?token=${newToken}`)).status, 200);
    assert.strictEqual(await ctx.auditCount('INVITATION_RESENT'), 1);

    await ctx.api.post('/api/auth/activate')
      .send({ token: newToken, password: 'New-password-123', confirmPassword: 'New-password-123' });
    const afterActive = await admin.post(`/api/admin/users/${userId}/resend-invitation`);
    assert.strictEqual(afterActive.body.error, 'INVITATION_NOT_PENDING');
    assert.strictEqual((await admin.post('/api/admin/users/not-a-uuid/resend-invitation')).status, 404);
  });

  test('a batch with any problem creates nothing', async () => {
    const before = await userCount();
    const mails = ctx.sent.length;
    const invalid = await admin.post('/api/admin/invitations').send({
      accounts: [account('fine@ccts.test'), account('bad-email'), account('fine@ccts.test'), { email: 'x@ccts.test' }],
    });
    assert.strictEqual(invalid.status, 400);
    assert.deepStrictEqual(invalid.body.rows.map((r) => r.index), [1, 2, 3]);

    const duplicate = await admin.post('/api/admin/invitations')
      .send({ accounts: [account('fresh@ccts.test'), account('officer@ccts.test')] });
    assert.strictEqual(duplicate.status, 409);
    assert.strictEqual(duplicate.body.rows[0].errors.email, 'EMAIL_ALREADY_EXISTS');

    // Fails on the second row, after the first insert, so the transaction must roll back.
    const badUnit = await admin.post('/api/admin/invitations').send({
      accounts: [account('first@ccts.test'),
        account('second@ccts.test', { organizationalUnitId: crypto.randomUUID() })],
    });
    assert.strictEqual(badUnit.status, 400);

    assert.strictEqual(await userCount(), before);
    assert.strictEqual(ctx.sent.length, mails);
  });

  test('an email failure keeps the account and reports it for resending', async () => {
    ctx.mailer.failNext = true;
    const res = await admin.post('/api/admin/invitations').send({ accounts: [account('nomail@ccts.test')] });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.created[0].emailSent, false);
    assert.strictEqual(await ctx.auditCount('INVITATION_EMAIL_FAILED'), 1);
    const notice = await ctx.owner.query(
      `SELECT delivery_status FROM notifications_log WHERE recipient_address = 'nomail@ccts.test'`);
    assert.strictEqual(notice.rows[0].delivery_status, 'FAILED');
  });
});
