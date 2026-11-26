// Confirms the storage settings work: writes a small encrypted test object and reads it back.
require('../src/loadEnv');
const crypto = require('crypto');
const { loadConfig } = require('../src/config');
const { createStorage } = require('../src/services/storage');

async function main() {
  const storage = createStorage(loadConfig());
  if (!storage.configured) {
    throw new Error('Set STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, '
      + 'STORAGE_BUCKET and EVIDENCE_ENCRYPTION_KEY (32 random bytes, base64) in server/.env.');
  }
  const sample = crypto.randomBytes(256);
  await storage.put('health/storage-check', sample);
  if (!(await storage.get('health/storage-check')).equals(sample)) throw new Error('The file read back differs.');
  console.log('Evidence storage works: encrypted upload and download succeeded.');
}

main().catch((err) => {
  console.error(`Storage check failed: ${err.message}`);
  process.exit(1);
});
