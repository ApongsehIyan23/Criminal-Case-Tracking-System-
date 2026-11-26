// Secure evidence upload: multipart in, type and size checked, hashed, encrypted, stored.
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { EVIDENCE_CATEGORIES, EVIDENCE_LIMIT_BYTES } = require('../../constants');
const { ApiError } = require('../../errors');
const { logAudit } = require('../../services/audit');

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

const receive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: EVIDENCE_LIMIT_BYTES, files: 1, fields: 5, fieldSize: 1000 },
  defParamCharset: 'utf8',
}).single('file');

const parseMultipart = (req, res) => new Promise((resolve, reject) => {
  receive(req, res, (err) => {
    if (!err) return resolve();
    if (err.code === 'LIMIT_FILE_SIZE') return reject(new ApiError(413, 'EVIDENCE_LIMIT_EXCEEDED'));
    return reject(new ApiError(400, 'BAD_UPLOAD'));
  });
});

function createUploadHandler({ db, storage }) {
  return async (req, res) => {
    const { caseId } = req.params;
    const reject = async (error) => {
      await logAudit(db, {
        actor: req.user, actionType: 'EVIDENCE_UPLOAD_REJECTED', ip: req.ip,
        caseId: (await db.query('SELECT case_id FROM criminal_case_files WHERE case_id = $1', [caseId])).rows[0]?.case_id || null,
        details: { requestedCase: caseId, reason: error.code, fileName: req.file ? cleanName(req.file.originalname) : null },
      });
      throw error;
    };

    try {
      await parseMultipart(req, res);
      const category = req.body?.category;
      const fields = {};
      if (!EVIDENCE_CATEGORIES.includes(category)) fields.category = 'CATEGORY_REQUIRED';
      if (!req.file) fields.file = 'FILE_REQUIRED';
      if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_FAILED', { fields });

      const fileName = cleanName(req.file.originalname);
      const type = detectType(req.file.buffer, fileName);
      if (!type) throw new ApiError(400, 'VALIDATION_FAILED', { fields: { file: 'FILE_TYPE_NOT_ALLOWED' } });
      if (!storage.configured) throw new ApiError(503, 'STORAGE_NOT_CONFIGURED');

      const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      const evidence = await db.transaction(async (client) => {
        // Locking the case serialises uploads, so the size limit holds, and blocks
        // a transmission from happening half-way through.
        const found = await client.query(
          'SELECT status FROM criminal_case_files WHERE case_id = $1 FOR UPDATE', [caseId]);
        if (!found.rowCount) throw new ApiError(404, 'CASE_NOT_FOUND');
        if (found.rows[0].status !== 'IN_INVESTIGATION') throw new ApiError(409, 'CASE_LOCKED');

        const used = Number((await client.query(
          'SELECT coalesce(sum(file_size_bytes), 0) AS used FROM digital_evidence WHERE case_id = $1', [caseId],
        )).rows[0].used);
        if (used + req.file.size > EVIDENCE_LIMIT_BYTES) {
          throw new ApiError(413, 'EVIDENCE_LIMIT_EXCEEDED', { remainingBytes: Math.max(0, EVIDENCE_LIMIT_BYTES - used) });
        }

        const evidenceId = crypto.randomUUID();
        let url;
        try {
          url = await storage.put(`evidence/${caseId}/${evidenceId}`, req.file.buffer);
        } catch (err) {
          console.error(`Evidence storage failed: ${err.message}`);
          throw new ApiError(502, 'STORAGE_FAILED');
        }
        // Scanning is not built yet, so a file is never marked as passed.
        const inserted = await client.query(
          `INSERT INTO digital_evidence (evidence_id, case_id, category, file_name, mime_type, file_size_bytes,
                                         storage_url, sha256_hash, virus_scan_status, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
           RETURNING evidence_id AS "evidenceId", category, file_name AS "fileName",
                     file_size_bytes::int AS "fileSizeBytes", sha256_hash AS "sha256",
                     virus_scan_status AS "virusScanStatus", uploaded_at AS "uploadedAt"`,
          [evidenceId, caseId, category, fileName, type.mime, req.file.size, url, hash, req.user.userId],
        );
        await client.query('UPDATE criminal_case_files SET updated_at = now() WHERE case_id = $1', [caseId]);
        await logAudit(client, {
          actor: req.user, actionType: 'EVIDENCE_UPLOADED', caseId, ip: req.ip,
          details: { evidenceId, category, fileName, sizeBytes: req.file.size, sha256: hash },
        });
        return inserted.rows[0];
      });
      res.status(201).json(evidence);
    } catch (error) {
      if (error instanceof ApiError) await reject(error);
      throw error;
    }
  };
}

module.exports = { createUploadHandler, detectType };
