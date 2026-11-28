const { Client } = require('pg');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');
const { createStorage } = require('../src/services/storage');
const { migrate } = require('../scripts/migrate');
const { seedAdmin } = require('../scripts/seedAdmin');
const { seedReference } = require('../scripts/seedReference');

const ownerUrl = process.env.TEST_DATABASE_URL;
if (!ownerUrl) throw new Error('Run the tests with "npm test".');

const appUrl = (() => {
  const url = new URL(ownerUrl);
  url.username = 'ccts_app_test';
  url.password = 'ccts-test-password';
  return url.toString();
})();

const ADMIN = { email: 'admin@ccts.test', password: 'Admin-password-123', fullName: 'Test Administrator' };
const silent = () => {};

// A fresh schema, an app wired to the restricted role, and fake external services.
async function setup() {
  const owner = new Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ ownerUrl, appUrl, log: silent });
  await seedReference({ ownerUrl, log: silent });
  await seedAdmin({ ownerUrl, ...ADMIN, log: silent });

  const sent = [];
  const mailer = { configured: true, failNext: false, async send(message) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Simulated SendGrid outage');
    }
    sent.push(message);
  } };
  const neon = {
    configured: true,
    nextError: null,
    pending: [],
    operationState: 'finished',
    async createSnapshot() {
      if (this.nextError) throw this.nextError;
      return { snapshotId: 'snap-test', branchId: 'br-test', operationIds: this.pending };
    },
    async operationStatus() { return this.operationState; },
  };

  const db = createDb(appUrl);
  const config = { jwtSecret: 'test-secret-that-is-at-least-32-characters', appBaseUrl: 'http://app.test', resetResponseMs: 0 };
  // The real storage service (and its encryption) over an in-memory bucket.
  const bucket = new Map();
  const s3 = {
    failNext: false,
    async send(command) {
      if (this.failNext) {
        this.failNext = false;
        throw new Error('Simulated storage outage');
      }
      const { Key, Body } = command.input;
      if (command.constructor.name === 'PutObjectCommand') {
        bucket.set(Key, Body);
        return {};
      }
      return { Body: { transformToByteArray: async () => bucket.get(Key) } };
    },
  };
  const storage = createStorage({
    storageBucket: 'test-bucket', evidenceKey: Buffer.alloc(32, 7).toString('base64'),
  }, s3);
  const app = createApp({ db, config, mailer, neon, storage });
  const api = request(app);

  const login = async (email = ADMIN.email, password = ADMIN.password) => {
    const res = await api.post('/api/auth/login').send({ email, password });
    if (res.status !== 200) throw new Error(`Login failed: ${res.status} ${res.body.error}`);
    return res.body.token;
  };
  const as = (token) => ({
    get: (url) => api.get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => api.post(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => api.patch(url).set('Authorization', `Bearer ${token}`),
    put: (url) => api.put(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => api.delete(url).set('Authorization', `Bearer ${token}`),
  });
  const tokenFrom = (message) => /activate\?token=([0-9a-f]{64})/.exec(message.text)[1];
  const auditCount = async (actionType) =>
    (await owner.query('SELECT count(*)::int AS n FROM audit_logs WHERE action_type = $1', [actionType])).rows[0].n;

  return {
    owner, db, app, api, config, mailer, neon, storage, s3, bucket, sent, login, as, tokenFrom, auditCount,
    async close() {
      await db.close();
      await owner.end();
    },
  };
}

module.exports = { setup, ADMIN, ownerUrl, appUrl };
