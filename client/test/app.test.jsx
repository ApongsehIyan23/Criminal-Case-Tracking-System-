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
const signedIn = (minutes = 15) => {
  sessionStorage.setItem('ccts.token', 'token');
  sessionStorage.setItem('ccts.deadline', String(Date.now() + minutes * 60 * 1000));
};
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
    fireEvent.click(button('Log in'));
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
    expect(await screen.findByRole('heading', { name: 'Case Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});

describe('remember me', () => {
  const signIn = (email) => {
    if (email) fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password-123' } });
    fireEvent.click(button('Log in'));
  };
  const routes = { 'POST /api/auth/login': { token: 't', sessionMinutes: 15, user: ADMIN } };

  test('keeps only the email, and only when ticked', async () => {
    mockApi(routes);
    open('/login');
    fireEvent.click(screen.getByLabelText('Remember me'));
    signIn('admin@ccts.test');
    await waitFor(() => expect(localStorage.getItem('ccts.email')).toBe('admin@ccts.test'));
    expect(JSON.stringify({ ...localStorage })).not.toContain('Password-123');
    expect(localStorage.getItem('ccts.token')).toBeNull();
  });

  test('pre-fills the remembered email and forgets it when unticked', () => {
    localStorage.setItem('ccts.email', 'admin@ccts.test');
    mockApi(routes);
    open('/login');
    expect(screen.getByLabelText('Email')).toHaveValue('admin@ccts.test');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Remember me')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Remember me'));
    expect(localStorage.getItem('ccts.email')).toBeNull();
  });

  test('stores nothing when left unticked', async () => {
    mockApi(routes);
    open('/login');
    signIn('admin@ccts.test');
    await screen.findByRole('button', { name: /log out/i });
    expect(localStorage.getItem('ccts.email')).toBeNull();
  });
});

describe('forgot password', () => {
  const account = { email: 'new@ccts.test', fullName: 'New User', preferredLanguage: 'EN' };
  const choose = async (password, confirm = password) => {
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } });
    fireEvent.click(button('Save new password'));
  };

  test('carries the typed email over and confirms without revealing whether it exists', async () => {
    const calls = mockApi({ 'POST /api/auth/forgot-password': { status: 202, requested: true } });
    open('/login');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'someone@ccts.test' } });
    fireEvent.click(screen.getByRole('link', { name: 'Forgot password?' }));
    expect(screen.getByLabelText('Email')).toHaveValue('someone@ccts.test');
    fireEvent.click(button('Send reset link'));
    expect(await screen.findByText(en.forgot.sent)).toBeInTheDocument();
    expect(calls.filter((c) => c.key === 'POST /api/auth/forgot-password')).toHaveLength(1);
  });

  test('asks for an email', () => {
    mockApi();
    open('/forgot-password');
    fireEvent.click(button('Send reset link'));
    expect(screen.getByText('Enter an email address.')).toBeInTheDocument();
  });

  test('saves a new password and returns to sign in with a confirmation', async () => {
    mockApi({ 'GET /api/auth/password-reset/verify': account, 'POST /api/auth/password-reset': { reset: true } });
    open('/reset-password?token=abc');
    await choose('Password-123', 'Password-999');
    expect(screen.getByText('Passwords do not match. Please enter the same password in both fields')).toBeInTheDocument();
    await choose('Password-123');
    expect(await screen.findByText(en.login.passwordReset)).toBeInTheDocument();
    expect(sessionStorage.getItem('ccts.token')).toBeNull();
  });

  test('offers a new link when this one is not valid', async () => {
    mockApi({ 'GET /api/auth/password-reset/verify': { status: 400, error: 'RESET_INVALID' } });
    open('/reset-password?token=old');
    expect(await screen.findByText(en.errors.RESET_INVALID)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Request a new link' }));
    expect(button('Send reset link')).toBeInTheDocument();
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
  test('creates accounts in a dialog, keeping typed values when the language changes', async () => {
    signedIn();
    mockApi({ 'PATCH /api/auth/language': { status: 204 } });
    open('/admin');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Create Account' }));
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Marie Ngo' } });
    fireEvent.click(button('Add another account'));
    expect(screen.getAllByLabelText('Full name')).toHaveLength(2);

    fireEvent.click(button('FR'));
    expect(screen.getAllByLabelText('Nom complet')[0]).toHaveValue('Marie Ngo');
    fireEvent.click(button('Annuler'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('closes the dialog and confirms after sending invitations', async () => {
    signedIn();
    mockApi({ 'POST /api/admin/invitations': { status: 201, created: [{ email: 'm@ccts.test', emailSent: true }] } });
    open('/admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Create Account' }));
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Marie Ngo' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'm@ccts.test' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'EXAMINING_MAGISTRATE' } });
    fireEvent.click(button('Send invitations'));
    expect(await screen.findByText('1 invitation(s) sent.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Pattern B: 5 rows by default, page controls, and a size change returns to page 1', async () => {
    signedIn();
    const calls = mockApi();
    open('/admin');
    const range = (text) => waitFor(() => expect(screen.getByTestId('range')).toHaveTextContent(text));
    await range('Showing 1–5 of 12 users');
    fireEvent.click(button('Page 3'));
    await range('Showing 11–12 of 12 users');
    // The selector above the table and the one under it are the same setting.
    const [above, below] = screen.getAllByLabelText('Rows per page');
    fireEvent.change(below, { target: { value: '10' } });
    await range('Showing 1–10 of 12 users');
    expect(above).toHaveValue('10');
    expect(calls.at(-1).url).toContain('page=1&pageSize=10');
  });

  test('the user directory shows statuses, tab counts and resends an expired invitation', async () => {
    signedIn();
    const user = (extra) => ({ role: 'EXAMINING_MAGISTRATE', unitName: null, ...extra });
    const calls = mockApi({
      'GET /api/admin/users': {
        items: [
          user({ userId: 'a', fullName: 'Active Person', email: 'a@ccts.test', status: 'ACTIVE' }),
          user({
            userId: 'b', fullName: 'Late Person', email: 'b@ccts.test', status: 'INVITATION_PENDING',
            invitationExpiresAt: '2000-01-01T00:00:00Z',
          }),
        ],
        total: 2, counts: { ALL: 2, ACTIVE: 1, INVITATION_PENDING: 1 },
      },
      'POST /api/admin/users/b/resend-invitation': { emailSent: true },
    });
    open('/admin');
    const table = await screen.findByRole('table', { name: 'User directory' });
    const [, active, late] = within(table).getAllByRole('row');
    expect(within(active).getByText('Active')).toBeInTheDocument();
    expect(within(active).queryByRole('button')).not.toBeInTheDocument();
    expect(within(late).getByText('Invitation pending')).toBeInTheDocument();
    expect(within(late).getByText('Link expired')).toBeInTheDocument();
    expect(button('All Users 2')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(late).getByRole('button', { name: 'Resend invitation' }));
    expect(await screen.findByText('A new invitation was sent to b@ccts.test.')).toBeInTheDocument();
    fireEvent.click(button('Pending 1'));
    await waitFor(() => expect(calls.at(-1).url).toContain('status=INVITATION_PENDING&page=1'));
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'late' } });
    await waitFor(() => expect(calls.at(-1).url).toContain('search=late'));
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
  const start = async (minutes) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signedIn(minutes);
    const calls = mockApi({
      'POST /api/auth/session-expired': { status: 204 },
      'POST /api/auth/continue': { token: 'new-token', sessionMinutes: 15 },
      'POST /api/auth/logout': { status: 204 },
      'POST /api/auth/login': { token: 't', sessionMinutes: 15, user: ADMIN },
    });
    open('/admin');
    await screen.findByRole('timer');
    return calls;
  };
  const wait = (minutes) => act(() => vi.advanceTimersByTimeAsync(minutes * 60 * 1000));
  const shows = (pattern) => expect(screen.getByRole('timer')).toHaveTextContent(pattern);

  test('counts down and no interaction resets it', async () => {
    const calls = await start();
    shows(/15:00|14:59/);
    await wait(5);
    for (const event of ['pointerMove', 'pointerDown', 'keyDown', 'wheel', 'touchStart', 'scroll']) {
      fireEvent[event](window);
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Global Audit Logs' }));
    shows(/10:00|09:5\d/);
    expect(calls.some((c) => c.key === 'POST /api/auth/activity')).toBe(false);
  });

  test('continues from the time left after a page reload', async () => {
    await start(4);
    shows(/04:00|03:59/);
  });

  test('warns when 5 minutes remain, not before', async () => {
    await start();
    await wait(9.9);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await wait(0.2);
    const dialog = screen.getByRole('alertdialog', { name: 'You will be logged out soon' });
    expect(within(dialog).getByTestId('warning-countdown')).toHaveTextContent(/0(5:00|4:5\d)/);
  });

  for (const name of ['Continue session', 'Close']) {
    test(`"${name}" starts another 15 minutes`, async () => {
      const calls = await start(4);
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      shows(/15:00|14:59/);
      expect(calls.filter((c) => c.key === 'POST /api/auth/continue')).toHaveLength(1);
    });
  }

  test('"Log out now" signs out at once', async () => {
    const calls = await start(4);
    fireEvent.click(screen.getByRole('button', { name: 'Log out now' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /api/auth/logout')).toBe(true);
  });

  test('at zero shows the timeout dialog, then returns to the same page after sign-in', async () => {
    const calls = await start();
    fireEvent.click(screen.getByRole('tab', { name: 'Global Audit Logs' }));
    await wait(15.1);
    const dialog = screen.getByRole('alertdialog', { name: 'Session Timeout!' });
    expect(sessionStorage.getItem('ccts.token')).toBeNull();
    expect(calls.some((c) => c.key === 'POST /api/auth/session-expired')).toBe(true);
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Login' }));
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'admin@ccts.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password-123' } });
    fireEvent.click(button('Log in'));
    expect(await screen.findByRole('tab', { name: 'Global Audit Logs', selected: true })).toBeInTheDocument();
  });

  for (const [role, path] of [['JUDICIAL_POLICE_OFFICER', '/police'], ['EXAMINING_MAGISTRATE', '/magistrate']]) {
    test(`uses the same dialogs for ${role}`, async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      signedIn(4);
      mockApi({
        'GET /api/auth/me': { user: { ...ADMIN, role } },
        'GET /api/magistrate/dashboard': { kpis: {}, urgent: [] },
        'GET /api/magistrate/queue': { items: [], total: 0 },
      });
      open(path);
      expect(await screen.findByRole('alertdialog', { name: 'You will be logged out soon' })).toBeInTheDocument();
      await wait(4.1);
      expect(screen.getByRole('alertdialog', { name: 'Session Timeout!' })).toBeInTheDocument();
    });
  }
});
