// The token lives in sessionStorage so it disappears when the tab closes,
// which matters on shared station computers.
const TOKEN_KEY = 'ccts.token';
const DEADLINE_KEY = 'ccts.deadline';

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  // The deadline is fixed at sign-in, measured on this computer's own clock.
  set: (token, minutes) => {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(DEADLINE_KEY, String(Date.now() + minutes * 60 * 1000));
  },
  deadline: () => Number(sessionStorage.getItem(DEADLINE_KEY)) || 0,
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(DEADLINE_KEY);
  },
};

export class ApiError extends Error {
  constructor(status, body = {}) {
    super(body.error || 'SERVER_ERROR');
    this.status = status;
    this.code = body.error || 'SERVER_ERROR';
    this.fields = body.fields || {};
    this.rows = body.rows || [];
    this.reason = body.reason;
  }
}

let onSessionLost = () => {};
export const setSessionLostHandler = (handler) => { onSessionLost = handler; };

async function send(method, path, { body, auth = true, keepalive = false } = {}) {
  const token = auth ? tokenStore.get() : null;
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      keepalive,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: 'NETWORK' });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && token && tokenStore.get()) onSessionLost();
    throw new ApiError(response.status, payload);
  }
  return response;
}

const json = async (response) => (response.status === 204 ? null : response.json());

export const api = {
  get: async (path, options) => json(await send('GET', path, options)),
  post: async (path, body, options) => json(await send('POST', path, { ...options, body })),
  patch: async (path, body) => json(await send('PATCH', path, { body })),
  download: async (path) => {
    const response = await send('GET', path);
    const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1];
    return { blob: await response.blob(), filename: name || 'export.csv' };
  },
};

export const query = (params) => {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  ).toString();
  return search ? `?${search}` : '';
};
