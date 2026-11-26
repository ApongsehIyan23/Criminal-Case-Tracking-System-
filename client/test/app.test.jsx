import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from '../src/App';
import en from '../src/i18n/en';
import fr from '../src/i18n/fr';

const ADMIN = {
  userId: 'u1', email: 'admin@ccts.test', fullName: 'Ada Admin',
  role: 'SYSTEM_ADMINISTRATOR', preferredLanguage: 'EN',
};

// A fake API: routes are matched on "METHOD /path" without the query string.
function mockApi(overrides = {}) {
  const calls = [];
  const routes = {
    'GET /api/auth/me': { user: ADMIN },
    'GET /api/admin/units': { units: [] },
    'GET /api/admin/users': (url) => {
      const params = new URL(url, 'http://x').searchParams;
      return { items: [], total: 12, page: Number(params.get('page')), pageSize: Number(params.get('pageSize')) };
    },
    'GET /api/admin/audit-logs/action-types': { actionTypes: ['USER_LOGIN'] },
    'GET /api/admin/audit-logs': {
      items: [{
        logId: 'l1', createdAt: '2026-11-01T10:00:00Z', actorEmail: 'admin@ccts.test',
        actorRole: 'SYSTEM_ADMINISTRATOR', actionType: 'USER_LOGIN', caseId: null, details: null, ipAddress: '127.0.0.1',
      }],
      total: 40, asOf: '2026-11-01 10:00:00+00',
    },
    ...overrides,
  };
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const key = `${options.method} ${url.split('?')[0]}`;
    calls.push({ key, url });
    let route = routes[key];
    if (typeof route === 'function') route = route(url);
    const { status = 200, ...body } = route || {};
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  }));
  return calls;
}

const open = (path) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
const signedIn = () => sessionStorage.setItem('ccts.token', 'token');
const button = (name) => screen.getByRole('button', { name });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('translations', () => {
  test('English and French define exactly the same keys', () => {
    const keys = (node, prefix = '') => Object.entries(node).flatMap(([k, v]) => (
      v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(fr).sort()).toEqual(keys(en).sort());
  });
});

describe('sign in and routing', () => {
  test('shows plain-language validation for empty fields', () => {
    mockApi();
    open('/login');
    fireEvent.click(button('Sign in'));
    expect(screen.getByText('Enter an email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
  });

  test('routes an anonymous visitor to sign in', () => {
    mockApi();
    open('/admin');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  test('sends a user to their own dashboard when they open another role', async () => {
    signedIn();
    mockApi({ 'GET /api/auth/me': { user: { ...ADMIN, role: 'JUDICIAL_POLICE_OFFICER' } } });
    open('/admin');
    expect(await screen.findByRole('heading', { name: 'Judicial Police dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});

describe('activation', () => {
  const invitation = { email: 'new@ccts.test', fullName: 'New User', preferredLanguage: 'EN' };

  test('shows the exact mismatch message', async () => {
    mockApi({ 'GET /api/auth/invitations/verify': invitation });
    open('/activate?token=abc');
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'Password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Password-999' } });
    fireEvent.click(button('Activate account'));
    expect(screen.getByText('Passwords do not match. Please enter the same password in both fields')).toBeInTheDocument();
  });

  test('returns to sign in with a confirmation banner and no session', async () => {
    mockApi({ 'GET /api/auth/invitations/verify': invitation, 'POST /api/auth/activate': { activated: true } });
    open('/activate?token=abc');
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'Password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Password-123' } });
    fireEvent.click(button('Activate account'));
    expect(await screen.findByText(en.login.activated)).toBeInTheDocument();
    expect(sessionStorage.getItem('ccts.token')).toBeNull();
  });
});

describe('administration console', () => {
  test('keeps typed values when the language or tab changes', async () => {
    signedIn();
    mockApi({ 'PATCH /api/auth/language': { status: 204 } });
    open('/admin');
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Marie Ngo' } });
    fireEvent.click(button('Add another account'));
    expect(screen.getAllByLabelText('Full name')).toHaveLength(2);

    fireEvent.click(button('FR'));
    expect(screen.getAllByLabelText('Nom complet')[0]).toHaveValue('Marie Ngo');
    fireEvent.click(screen.getByRole('tab', { name: "Journal d'audit global" }));
    fireEvent.click(screen.getByRole('tab', { name: 'Utilisateurs et accès' }));
    expect(screen.getAllByLabelText('Nom complet')[0]).toHaveValue('Marie Ngo');
  });

  test('Pattern B: 5 rows by default, page controls, and a size change returns to page 1', async () => {
    signedIn();
    const calls = mockApi();
    open('/admin');
    expect(await screen.findByText('1–5 of 12')).toBeInTheDocument();
    fireEvent.click(button('Page 3'));
    expect(await screen.findByText('11–12 of 12')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '10' } });
    expect(await screen.findByText('1–10 of 12')).toBeInTheDocument();
    expect(calls.at(-1).url).toContain('page=1&pageSize=10');
  });

  test('the audit view has no edit or delete controls', async () => {
    signedIn();
    mockApi();
    open('/admin?tab=audit');
    const table = await screen.findByRole('table');
    expect(within(table).queryAllByRole('button')).toHaveLength(0);
    expect(within(table).queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /edit|delete|remove/i })).not.toBeInTheDocument();
  });

  test('a filter change returns the audit log to page 1', async () => {
    signedIn();
    const calls = mockApi();
    open('/admin?tab=audit');
    fireEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(calls.at(-1).url).toContain('page=2'));
    expect(calls.at(-1).url).toContain('asOf=');
    fireEvent.change(screen.getByLabelText('Action type'), { target: { value: 'USER_LOGIN' } });
    await waitFor(() => expect(calls.at(-1).url).toContain('actionType=USER_LOGIN&page=1'));
    expect(calls.at(-1).url).not.toContain('asOf=');
  });
});

describe('15-minute session countdown', () => {
  const start = async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signedIn();
    const calls = mockApi({
      'POST /api/auth/activity': { status: 204 },
      'POST /api/auth/session-expired': { status: 204 },
    });
    open('/admin');
    await screen.findByRole('timer');
    return calls;
  };
  const wait = (minutes) => act(() => vi.advanceTimersByTimeAsync(minutes * 60 * 1000));

  test('counts down, resets on interaction and tells the server', async () => {
    const calls = await start();
    expect(screen.getByRole('timer')).toHaveTextContent('15:00');
    await wait(5);
    expect(screen.getByRole('timer')).toHaveTextContent(/(10:00|09:5\d)/);
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('timer')).toHaveTextContent('15:00');
    expect(calls.some((c) => c.key === 'POST /api/auth/activity')).toBe(true);
  });

  test('locks the screen at zero and requires signing in again', async () => {
    const calls = await start();
    await wait(15.1);
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(sessionStorage.getItem('ccts.token')).toBeNull();
    expect(calls.some((c) => c.key === 'POST /api/auth/session-expired')).toBe(true);
    // Interaction after expiry does not unlock anything.
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
