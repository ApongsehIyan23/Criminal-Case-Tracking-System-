import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from '../src/App';

const OFFICER = {
  userId: 'p1', email: 'officer@ccts.test', fullName: 'Paul Officer',
  role: 'JUDICIAL_POLICE_OFFICER', preferredLanguage: 'EN',
};
const NOW = '2026-11-01T10:00:00.000Z';
const later = (hours) => new Date(Date.parse(NOW) + hours * 3600000).toISOString();

const card = (n, hours) => ({
  timerId: `t${n}`, caseId: `CM-MFD-2026-000${n}`, suspectName: `Suspect ${n}`, nationalId: `ID${n}`, unitName: 'Station',
  incidentTitle: 'Theft', narrative: null, status: 'IN_INVESTIGATION', timerStatus: 'ACTIVE', expiresAt: later(hours),
  alertSent: false, evidenceCount: 0, participantCount: 1,
});

const docket = (status = 'IN_INVESTIGATION', mandate = null) => ({
  case: {
    caseId: 'CM-MFD-2026-0001', incidentTitle: 'Theft', status, offenseEn: 'Theft', offenseFr: 'Vol',
    incidentDatetime: NOW, unitName: 'Station', createdBy: 'Paul', narrative: 'Story',
  },
  participants: [], evidence: [], evidenceLimitBytes: 512000, mandates: mandate ? [{ mandateId: 'm1', suspectName: 'S', ...mandate }] : [],
  alerts: [], trail: [], serverNow: NOW,
});

function mockApi(overrides = {}) {
  const calls = [];
  const routes = {
    'GET /api/auth/me': { user: OFFICER },
    'GET /api/notifications': { items: [] },
    'GET /api/cases/dashboard': { custody: [card(1, 1.5), card(2, 10), card(3, 20), card(4, 30)], totalCases: 7, serverNow: NOW },
    'GET /api/cases': { items: [], total: 7, serverNow: NOW },
    'GET /api/cases/reference': {
      offenses: [{ offenseCategoryId: 'o1', labelEn: 'Theft', labelFr: 'Vol' }],
      units: [{ unitId: 'u1', unitName: 'Central Station' }], officerUnitId: 'u1',
    },
    ...overrides,
  };
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const key = `${options.method} ${url.split('?')[0]}`;
    calls.push({ key, url, body: options.body });
    const { status = 200, ...body } = routes[key] || {};
    return new Response(JSON.stringify(body), { status });
  }));
  return calls;
}

const signIn = () => {
  sessionStorage.setItem('ccts.token', 'token');
  sessionStorage.setItem('ccts.deadline', String(Date.now() + 900000));
};
const open = (path) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
const button = (name) => screen.getByRole('button', { name });
const type = (label, value, index = 0) => fireEvent.change(screen.getAllByLabelText(label)[index], { target: { value } });

afterEach(() => vi.unstubAllGlobals());

describe('P1 dashboard', () => {
  test('Pattern A: three custody cards per page, red only under 2 hours', async () => {
    signIn();
    const calls = mockApi();
    open('/police');
    const cards = await screen.findAllByTestId('custody-card');
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText('Expires < 2h')).toBeInTheDocument();
    expect(cards[0].innerHTML).toContain('text-red-500');
    expect(cards[1].innerHTML).not.toContain('red-');
    fireEvent.click(button('Next'));
    expect(screen.getAllByTestId('custody-card')).toHaveLength(1);
    expect(screen.getByText('Showing 4–4 of 4')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /api/custody/sync')).toBe(true);
  });

  test('offers its actions only in the sidebar', async () => {
    signIn();
    const calls = mockApi();
    open('/police');
    const main = within(await screen.findByRole('main'));
    await main.findAllByTestId('custody-card');
    expect(main.queryByRole('button', { name: 'Upload Evidence' })).not.toBeInTheDocument();
    expect(main.queryByRole('link', { name: 'Log New Case' })).not.toBeInTheDocument();
    const sidebar = within(screen.getByRole('complementary'));
    expect(sidebar.getByRole('link', { name: 'Log New Case' })).toBeInTheDocument();
    expect(sidebar.getByRole('link', { name: 'Evidence' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(calls.some((c) => c.key === 'GET /api/cases')).toBe(false);
  });

  test('a custody card still opens the quick upload dialog', async () => {
    signIn();
    mockApi({ 'GET /api/cases/open': { items: [] } });
    open('/police');
    fireEvent.click(await screen.findByRole('button', { name: 'Quick evidence upload: CM-MFD-2026-0001' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Cases page', () => {
  test('searches the register and returns to page 1', async () => {
    signIn();
    const calls = mockApi();
    open('/police/cases');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(calls.at(-1).url).toContain('page=2'));
    type('Search cases', 'vol');
    await waitFor(() => expect(calls.at(-1).url).toContain('search=vol&page=1'));
  });
});

describe('sidebar navigation', () => {
  const sidebar = () => within(screen.getByRole('complementary'));
  const current = () => sidebar().getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    .map((l) => l.textContent || l.getAttribute('aria-label'));
  const start = async () => {
    signIn();
    const calls = mockApi({
      'GET /api/cases/open': { items: [{ caseId: 'CM-MFD-2026-0001', incidentTitle: 'Theft' }] },
      'GET /api/cases/CM-MFD-2026-0001': docket(),
      'PATCH /api/auth/language': {},
      'POST /api/auth/logout': {},
    });
    open('/police');
    await screen.findByRole('complementary');
    return calls;
  };

  test('each entry shows its page and is the only one highlighted', async () => {
    await start();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    for (const [entry, heading] of [
      ['Cases', 'Cases'], ['Evidence', 'Evidence'], ['Log New Case', 'Digital Case Initiation'], ['Dashboard', 'Case Dashboard'],
    ]) {
      fireEvent.click(sidebar().getByRole('link', { name: entry }));
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      expect(current()).toEqual([entry]);
    }
  });

  test('the Evidence page uploads to the chosen case', async () => {
    await start();
    fireEvent.click(sidebar().getByRole('link', { name: 'Evidence' }));
    await screen.findByRole('option', { name: /CM-MFD-2026-0001/ });
    type('Active case', 'CM-MFD-2026-0001');
    expect(await screen.findByRole('button', { name: 'Upload File' })).toBeInTheDocument();
  });

  test('collapses to icons, remembers it, and keeps every command', async () => {
    await start();
    fireEvent.click(sidebar().getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-collapsed', 'true');
    expect(localStorage.getItem('ccts.sidebar')).toBe('collapsed');
    for (const name of ['Dashboard', 'Cases', 'Evidence', 'Log New Case']) {
      expect(sidebar().getByRole('link', { name })).toBeInTheDocument();
    }
    for (const name of ['Help and FAQ', 'Log Out', 'Expand sidebar']) {
      expect(sidebar().getByRole('button', { name })).toBeInTheDocument();
    }
    expect(sidebar().getByRole('timer')).toHaveTextContent(/1[45]:\d\d/);
    fireEvent.click(sidebar().getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-collapsed', 'false');
  });

  test('language, help, profile and log out work from the sidebar', async () => {
    const calls = await start();
    fireEvent.click(sidebar().getByRole('button', { name: /Signed in as/ }));
    expect(sidebar().getByText('officer@ccts.test')).toBeInTheDocument();
    fireEvent.click(sidebar().getByRole('button', { name: 'Help and FAQ' }));
    expect(screen.getByRole('dialog', { name: 'Help and FAQ' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(sidebar().getByRole('button', { name: 'FR' }));
    expect(sidebar().getByRole('link', { name: 'Affaires' })).toBeInTheDocument();
    fireEvent.click(sidebar().getByRole('button', { name: 'Se déconnecter' }));
    await screen.findByRole('heading', { name: 'Connexion' });
    expect(calls.some((c) => c.key === 'POST /api/auth/logout')).toBe(true);
  });
});

describe('P2 case initiation', () => {
  test('blocks a detained suspect without an ID using the exact message', async () => {
    signIn();
    const calls = mockApi();
    open('/police/cases/new');
    await screen.findByLabelText('Incident Title');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button('Save & Create Case Docket'));
    expect(screen.getByText('Suspect National ID is required to initiate a custody timer')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /api/cases')).toBe(false);
  });

  test('keeps everything typed across a page refresh', async () => {
    signIn();
    mockApi();
    const first = open('/police/cases/new');
    await screen.findByLabelText('Incident Title');
    type('Incident Title', 'Market theft');
    type('Incident Narrative', 'Sac volé');
    type('Full Name', 'Jean Doe');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button('Add Another Participant'));
    type('Full Name', 'Rose', 1);
    first.unmount();

    open('/police/cases/new');
   await screen.findByLabelText('Incident Title');
    expect(await screen.findByDisplayValue('Market theft')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sac volé')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Full Name').map((i) => i.value)).toEqual(['Jean Doe', 'Rose']);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('cancel discards the draft, and logging out clears all drafts', async () => {
    signIn();
    mockApi({ 'POST /api/auth/logout': {} });
    open('/police/cases/new');
    await screen.findByLabelText('Incident Title');
    type('Incident Title', 'Temporary');
    fireEvent.click(button('Cancel'));
    await screen.findByRole('heading', { name: 'Case Dashboard' });
    fireEvent.click(within(screen.getByRole('complementary')).getByRole('link', { name: 'Log New Case' }));
    expect(screen.getByLabelText('Incident Title')).toHaveValue('');
    type('Incident Title', 'Again');
    fireEvent.click(button('Log Out'));
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(Object.keys(sessionStorage).filter((k) => k.includes('.p1.'))).toEqual([]);
  });

  test('passwords are never stored, and another user does not see drafts', async () => {
    sessionStorage.setItem('ccts.draft.someone.police.newCase', '{"incidentTitle":"secret"}');
    mockApi({ 'POST /api/auth/login': { token: 't', sessionMinutes: 15, user: OFFICER } });
    open('/login');
    type('Email', 'officer@ccts.test');
    type('Password', 'Very-secret-123');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('Very-secret-123');
    fireEvent.click(button('Log in'));
    await screen.findByRole('heading', { name: 'Case Dashboard' });
    expect(sessionStorage.getItem('ccts.draft.someone.police.newCase')).toBeNull();
    expect(sessionStorage.getItem('ccts.draft.guest.login.email')).toBeNull();
  });
});

describe('P3 docket', () => {
  test('shows four tabs and opens the review before transmitting', async () => {
    signIn();
    const calls = mockApi({
      'GET /api/cases/CM-MFD-2026-0001': docket(),
      'GET /api/cases/CM-MFD-2026-0001/transmission-review': docket(),
      'POST /api/cases/CM-MFD-2026-0001/transmit': {},
    });
    open('/police/cases/CM-MFD-2026-0001');
    expect(await screen.findAllByRole('tab')).toHaveLength(4);
    fireEvent.click(button('Transmit Case to Magistrate'));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm & Transmit' });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(calls.some((c) => c.key.endsWith('/transmit'))).toBe(false);
    fireEvent.click(confirm);
    expect(await screen.findByText('The case was transmitted to the examining magistrate.')).toBeInTheDocument();
  });

  test('a transmitted case is read-only and shows the returned ruling', async () => {
    signIn();
    mockApi({
      'GET /api/cases/CM-MFD-2026-0001': docket('MANDATE_ISSUED', {
        decision: 'RELEASE', rulingNotes: 'Libération ordonnée', issuedBy: 'Judge', issuedAt: NOW,
      }),
    });
    open('/police/cases/CM-MFD-2026-0001?tab=evidence');
    expect(await screen.findByText('Returned Judicial Mandate Ruling')).toBeInTheDocument();
    expect(screen.getByText('Libération ordonnée')).toBeInTheDocument();
    expect(screen.getByText('Evidence locked after transmission')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upload|Transmit/ })).not.toBeInTheDocument();
  });
});
