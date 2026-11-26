// Evidence storage in a private Neon Object Storage bucket (S3 protocol).
// Every object is encrypted here first; the bucket only ever holds ciphertext.
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { parseKey, encrypt, decrypt } = require('./crypto');

function createStorage(config, client = null) {
  const key = parseKey(config.evidenceKey);
  const { storageEndpoint: endpoint, storageRegion: region, storageBucket: bucket } = config;
  const configured = Boolean(
    key && bucket && (client || (endpoint && config.storageAccessKeyId && config.storageSecretAccessKey)),
  );

  const s3 = client || (configured ? new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: config.storageAccessKeyId, secretAccessKey: config.storageSecretAccessKey },
  }) : null);

  const requireConfigured = () => {
    if (!configured) throw new Error('Evidence storage is not configured.');
  };

  return {
    configured,
    /** Encrypts and stores a file. Returns the address recorded in the database. */
    async put(objectKey, plain) {
      requireConfigured();
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: encrypt(plain, key, objectKey),
        ContentType: 'application/octet-stream',
      }));
      return `s3://${bucket}/${objectKey}`;
    },
    /** Fetches and decrypts a stored file. */
    async get(objectKey) {
      requireConfigured();
      const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
      return decrypt(Buffer.from(await result.Body.transformToByteArray()), key, objectKey);
    },
  };
}

module.exports = { createStorage };
