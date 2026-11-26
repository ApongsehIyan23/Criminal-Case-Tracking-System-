// Neon snapshot API. Snapshots are never deleted from here.
const BASE_URL = 'https://console.neon.tech/api/v2';

class NeonError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function createNeonClient({ neonApiKey, neonProjectId, neonBranchId }, fetchImpl = fetch) {
  const configured = Boolean(neonApiKey && neonProjectId);
  const project = `/projects/${encodeURIComponent(neonProjectId)}`;

  async function request(method, path) {
    let response;
    try {
      response = await fetchImpl(`${BASE_URL}${path}`, {
        method,
        headers: { Authorization: `Bearer ${neonApiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      throw new NeonError('BACKUP_SERVICE_UNREACHABLE', `Could not reach the Neon API: ${err.message}`);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body.message || `Neon API returned HTTP ${response.status}`;
      const code = /snapshot/i.test(message) && /limit/i.test(message) ? 'SNAPSHOT_LIMIT_REACHED' : 'BACKUP_FAILED';
      throw new NeonError(code, message);
    }
    return body;
  }

  async function defaultBranchId() {
    if (neonBranchId) return neonBranchId;
    const { branches = [] } = await request('GET', `${project}/branches`);
    const branch = branches.find((b) => b.default);
    if (!branch) throw new NeonError('BACKUP_FAILED', 'No default branch found in the Neon project.');
    return branch.id;
  }

  return {
    configured,
    async createSnapshot(name) {
      if (!configured) throw new NeonError('BACKUP_NOT_CONFIGURED', 'NEON_API_KEY and NEON_PROJECT_ID are not set.');
      const branchId = await defaultBranchId();
      const body = await request(
        'POST',
        `${project}/branches/${encodeURIComponent(branchId)}/snapshot?name=${encodeURIComponent(name)}`,
      );
      return {
        snapshotId: body.snapshot?.id || null,
        branchId,
        operationIds: (body.operations || []).filter((o) => o.status !== 'finished').map((o) => o.id),
      };
    },
    async operationStatus(operationId) {
      const body = await request('GET', `${project}/operations/${encodeURIComponent(operationId)}`);
      return body.operation?.status;
    },
  };
}

module.exports = { createNeonClient, NeonError };
