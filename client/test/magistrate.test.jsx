import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from '../src/App';

const JUDGE = {
  userId: 'm1', email: 'judge@ccts.test', fullName: 'Judge', role: 'EXAMINING_MAGISTRATE', preferredLanguage: 'EN',
};
const NOW = '2026-11-01T10:00:00.000Z';
const later = (hours) => new Date(Date.parse(NOW) + hours * 3600000).toISOString();
const CASE = 'CM-MFD-2026-0001';

const card = (n) => ({
  timerId: `t${n}`, caseId: `CM-MFD-2026-000${n}`, suspectName: `Suspect ${n}`, nationalId: `ID${n}`, unitName: 'Station',
  incidentTitle: 'Theft', status: 'TRANSMITTED_TO_MAGISTRATE', expiresAt: later(n * 0.3), alertSent: true,
  evidenceCount: 0, participantCount: 1,
});

const review = (extra = {}) => ({
  case: {
    caseId: CASE, incidentTitle: 'Theft', status: 'TRANSMITTED_TO_MAGISTRATE', offenseEn: 'Theft', offenseFr: 'Vol',
    incidentDatetime: NOW, unitName: 'Station', createdBy: 'Officer', createdByEmail: 'o@ccts.test',
  },
  participants: [{
    participantId: 'p1', role: 'SUSPECT', fullName: 'Jean Test', nationalId: 'T1', isDetained: true,
    timerStatus: 'ACTIVE', expiresAt: later(5), needsRuling: true,
  }],
  evidence: [], mandates: [], trail: [], documentLimitBytes: 512000, serverNow: NOW, ...extra,
});

function mockApi(overrides = {}) {
  const calls = [];
  const routes = {
    'GET /api/auth/me': { user: JUDGE },
    'GET /api/notifications': { items: [] },
    'GET /api/magistrate/dashboard': {
      kpis: { pendingReview: 6, urgentCustody: 4, mandatesIssued: 2, averageTurnaroundSeconds: 66240 },
      urgent: [card(1), card(2), card(3), card(4)], serverNow: NOW,
    },
    'GET /api/magistrate/queue': {
      items: [{
        caseId: CASE, incidentTitle: 'Theft', unitName: 'Station', status: 'TRANSMITTED_TO_MAGISTRATE',
        leadSuspect: 'Jean Test', custodyExpiresAt: later(1), evidenceCount: 2, createdAt: NOW, transmittedAt: NOW,
      }],
      total: 12, totalPages: 3, counts: { ALL: 12, PENDING: 9, ISSUED: 3 }, serverNow: NOW,
    },
    [`GET /api/magistrate/cases/${CASE}`]: review(),
    [`POST /api/cases/${CASE}/mandate`]: { status: 201 },
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

const open = (path) => {
  sessionStorage.setItem('ccts.token', 'token');
  sessionStorage.setItem('ccts.deadline', String(Date.now() + 900000));
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
};
const button = (name) => screen.getByRole('button', { name });

afterEach(() => vi.unstubAllGlobals());

describe('M1 dashboard', () => {
  test('shows four KPI cards and three urgent cards per page', async () => {
    mockApi();
    open('/magistrate');
    expect(await screen.findByText('18 hr 24 min')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-pendingReview')).toHaveTextContent('6');
    expect(screen.getByTestId('kpi-mandatesIssued')).toHaveTextContent('2');
    expect(screen.getAllByTestId('urgent-card')).toHaveLength(3);
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    expect(screen.getAllByTestId('urgent-card')).toHaveLength(1);
  });

  const queueCall = (calls) => calls.filter((c) => c.key === 'GET /api/magistrate/queue').at(-1).url;

  test('the queue shows its rows, tab counts and a link to inspect', async () => {
    mockApi();
    open('/magistrate');
    const table = await screen.findByRole('table', { name: 'Incoming Transmitted Cases Queue' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('Jean Test');
    expect(row).toHaveTextContent('01:00:00');
    expect(within(row).getByText('01:00:00')).toHaveClass('text-[#dc2626]');
    expect(within(row).getByText('Pending Review')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Inspect' })).toHaveAttribute('href', `/magistrate/cases/${CASE}`);
    expect(button('All Incoming 12')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Reviewed 3')).toBeInTheDocument();
    expect(screen.getByTestId('results')).toHaveTextContent('of 12 results');
  });

  test('a tab, sort, filter or page size change returns to page 1', async () => {
    const calls = mockApi();
    open('/magistrate');
    fireEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(queueCall(calls)).toContain('page=2'));
    fireEvent.click(button(/^Pending Review/));
    await waitFor(() => expect(queueCall(calls)).toContain('status=PENDING&sort=priority&dir=asc&page=1'));
    fireEvent.click(button('Sort'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Newest transmission' }));
    await waitFor(() => expect(queueCall(calls)).toContain('sort=transmitted&dir=desc&page=1'));
    fireEvent.click(button('Filter'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Under 2 hours' }));
    await waitFor(() => expect(queueCall(calls)).toContain('custody=URGENT'));
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '10' } });
    await waitFor(() => expect(queueCall(calls)).toContain('page=1&pageSize=10'));
  });

  test('rows can be selected and cleared', async () => {
    mockApi();
    open('/magistrate');
    fireEvent.click(await screen.findByLabelText('Select all cases on this page'));
    expect(screen.getByLabelText(`Select case ${CASE}`)).toBeChecked();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(button('Clear'));
    expect(screen.getByLabelText(`Select case ${CASE}`)).not.toBeChecked();
  });
});

describe('M3 mandate panel', () => {
  const notes = () => screen.getByLabelText('Judicial Ruling Notes / Justification');

  test('blocks a missing decision or empty notes', async () => {
    mockApi();
    open(`/magistrate/cases/${CASE}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Issue Digital Mandate' }));
    expect(screen.getByText('Please select a judicial decision before issuing a mandate.')).toBeInTheDocument();
    expect(screen.getByText('Please enter your judicial ruling notes.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('warns that the ruling is binding and sends only after confirmation', async () => {
    const calls = mockApi();
    open(`/magistrate/cases/${CASE}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Release/ }));
    fireEvent.change(notes(), { target: { value: 'Motifs' } });
    fireEvent.click(button('Issue Digital Mandate'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('legally binding');
    expect(dialog).toHaveTextContent('Jean Test');
    expect(calls.some((c) => c.key.startsWith('POST /api/cases'))).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm & Issue Mandate' }));
    expect(await screen.findByText('Judicial mandate issued and synchronized with the police docket.')).toBeInTheDocument();
    const sent = calls.find((c) => c.key === `POST /api/cases/${CASE}/mandate`).body;
    expect([sent.get('participantId'), sent.get('decision'), sent.get('rulingNotes')]).toEqual(['p1', 'RELEASE', 'Motifs']);
  });

  test('keeps the draft ruling across a refresh', async () => {
    mockApi();
    const first = open(`/magistrate/cases/${CASE}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Extend custody/ }));
    fireEvent.change(notes(), { target: { value: 'Half written' } });
    first.unmount();
    open(`/magistrate/cases/${CASE}`);
    expect(await screen.findByDisplayValue('Half written')).toBeInTheDocument();
    expect(button(/^Extend custody/)).toHaveAttribute('aria-pressed', 'true');
  });

  test('an issued ruling is a read-only record', async () => {
    const base = review();
    mockApi({
      [`GET /api/magistrate/cases/${CASE}`]: review({
        case: { ...base.case, status: 'MANDATE_ISSUED' },
        mandates: [{
          mandateId: 'x', participantId: 'p1', suspectName: 'Jean Test', decision: 'RELEASE',
          rulingNotes: 'Done', issuedBy: 'Judge', issuedAt: NOW,
        }],
      }),
    });
    open(`/magistrate/cases/${CASE}`);
    expect(await screen.findByText('Signed Judicial Mandate Record')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Issue Digital Mandate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
