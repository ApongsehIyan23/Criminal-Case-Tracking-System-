// AES-256-GCM encryption of evidence before it leaves the server.
// Layout: "CCE1" | 12-byte IV | 16-byte tag | ciphertext. The object key is
// authenticated too, so an object cannot be swapped with another one unnoticed.
const crypto = require('crypto');

const MAGIC = Buffer.from('CCE1');
const IV_BYTES = 12;
const TAG_BYTES = 16;

function parseKey(base64) {
  const key = Buffer.from(base64 || '', 'base64');
  return key.length === 32 ? key : null;
}

function encrypt(plain, key, context) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

function decrypt(sealed, key, context) {
  if (!sealed.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not an encrypted evidence object.');
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = sealed.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)), decipher.final()]);
}

module.exports = { parseKey, encrypt, decrypt };
