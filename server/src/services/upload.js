// Shared handling for uploaded files: evidence and signed judgments.
const path = require('path');
const multer = require('multer');
const { ApiError } = require('../errors');
const { EVIDENCE_LIMIT_BYTES } = require('../constants');

// The file's first bytes decide its type; the browser's claim is not trusted.
const FILE_TYPES = [
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'], signature: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', extensions: ['.png'], signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', extensions: ['.pdf'], signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

function detectType(buffer, fileName) {
  const extension = path.extname(fileName).toLowerCase();
  return FILE_TYPES.find((type) => type.extensions.includes(extension)
    && type.signature.every((byte, i) => buffer[i] === byte));
}

const cleanName = (name) => path.basename(String(name).replace(/\\/g, '/'))
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .trim()
  .slice(-255);

// Reads one multipart file from `field` into memory. Non-multipart requests pass through.
function fileReceiver(field, tooLargeCode) {
  const receive = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: EVIDENCE_LIMIT_BYTES, files: 1, fields: 5, fieldSize: 50000 },
    defParamCharset: 'utf8',
  }).single(field);

  return (req, res) => new Promise((resolve, reject) => {
    receive(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === 'LIMIT_FILE_SIZE') return reject(new ApiError(413, tooLargeCode));
      return reject(new ApiError(400, 'BAD_UPLOAD'));
    });
  });
}

const objectKeyFrom = (storageUrl) => storageUrl.replace(/^s3:\/\/[^/]+\//, '');

module.exports = { detectType, cleanName, fileReceiver, objectKeyFrom };
