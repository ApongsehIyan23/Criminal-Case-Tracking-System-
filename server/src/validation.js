const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything beyond this

const isValidEmail = (value) => typeof value === 'string' && value.length <= 255 && EMAIL_RE.test(value);
const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return 'PASSWORD_TOO_SHORT';
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return 'PASSWORD_TOO_LONG';
  return null;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) && value >= '1900-01-01';
}

module.exports = { isValidEmail, isUuid, isValidDate, passwordProblem };
