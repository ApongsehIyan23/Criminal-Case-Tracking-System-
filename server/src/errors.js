// Errors carry a stable code; the client translates it into English or French.
class ApiError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

module.exports = { ApiError };
