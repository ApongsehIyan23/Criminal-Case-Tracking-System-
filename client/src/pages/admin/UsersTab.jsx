// The user directory: status tabs with counts, search and pages, all applied by
// the server, with account creation and invitation resending.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircleIcon, ClockIcon, PeopleIcon, PersonPlusIcon } from '../../components/table/icons';
import { Badge, GridTable, RangePages, ResultsSummary, SearchBox, TabBar } from '../../components/table/parts';
import { FormError, Icon, Notice, Toast } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api, query } from '../../lib/api';
import { useDraft } from '../../lib/useDraft';
import InviteModal from './InviteModal';

const DEFAULT_VIEW = { search: '', status: '', page: 1, pageSize: 5, version: 0 };

// [value, translation key, icon]
const TABS = [['', 'all', PeopleIcon], ['ACTIVE', 'active', CheckCircleIcon], ['INVITATION_PENDING', 'pending', ClockIcon]];

const TEMPLATE = 'minmax(110px,0.8fr) minmax(180px,1.3fr) minmax(140px,1fr) minmax(260px,2fr) '
  + 'minmax(140px,1fr) minmax(120px,0.8fr)';
// The columns' smallest widths and the 20px padding on each side.
const MIN_WIDTH = 990;
const COLUMNS = ['name', 'email', 'role', 'unit', 'status', 'actions'];

const STATUS_COLORS = {
  ACTIVE: 'bg-[#dcfce7] text-[#15803d]',
  INVITATION_PENDING: 'bg-[#fef3c7] text-[#b45309]',
  SUSPENDED: 'bg-[#f3f4f6] text-[#374151]',
};

export default function UsersTab() {
  const { t } = useLanguage();
  const [stored, setView] = useDraft('admin.users', DEFAULT_VIEW);
  // A view saved before a setting existed takes its default.
  const view = { ...DEFAULT_VIEW, ...stored };
  // What is in the box; applied to the query after a short pause.
  const [search, setSearch] = useState(view.draft ?? view.search);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useDraft('admin.invite.open', false);
  const [banner, setBanner] = useState(null);
  const [toast, setToast] = useState(null);
  const [resending, setResending] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);

  // Every change to what is listed returns to page 1.
  const update = (changes) => setView((v) => ({ ...v, page: 1, ...changes }));

  useEffect(() => {
    if (search.trim() === view.search.trim()) return undefined;
    const timer = setTimeout(() => update({ search }), 350);
    return () => clearTimeout(timer);
  }, [search, view.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const { search: applied, status, page, pageSize, version } = view;
  useEffect(() => {
    let current = true;
    api.get(`/admin/users${query({ search: applied.trim(), status, page, pageSize })}`)
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [applied, status, page, pageSize, version]);

  function type(value) {
    setSearch(value);
    // The typed text is kept at once, so a refresh cannot lose it.
    setView((v) => ({ ...v, draft: value }));
  }

  function created(results) {
    const failed = results.filter((r) => !r.emailSent).map((r) => r.email);
    setBanner(failed.length
      ? { key: 'invite.partial', values: { emails: failed.join(', ') } }
      : { key: 'invite.success', values: { count: results.length } });
    setCreating(false);
    // Show the whole directory, where the new accounts come first.
    setSearch('');
    setView((v) => ({ ...v, search: '', draft: '', status: '', page: 1, version: (v.version || 0) + 1 }));
  }

  async function resend(user) {
    setResending(user.userId);
    setBanner(null);
    setError(null);
    try {
      const result = await api.post(`/admin/users/${user.userId}/resend-invitation`);
      if (result.emailSent) setToast({ email: user.email });
      else setBanner({ key: 'users.resendFailed', values: { email: user.email } });
      setView((v) => ({ ...v, version: (v.version || 0) + 1 }));
    } catch (e) {
      setError(e.code);
    } finally {
      setResending(null);
    }
  }

  const rows = (data?.items || []).map((user) => {
    const pending = user.status === 'INVITATION_PENDING';
    const expired = pending && user.invitationExpiresAt && new Date(user.invitationExpiresAt) <= new Date();
    return {
      key: user.userId,
      cells: [
        <span className="font-semibold text-[#1a1a1a]">{user.fullName}</span>,
        <span className="text-[#2563eb]">{user.email}</span>,
        t(`roles.${user.role}`),
        user.unitName || '—',
        <div className="flex flex-wrap gap-1.5">
          <Badge colors={STATUS_COLORS[user.status]}>{t(`status.${user.status}`)}</Badge>
          {expired && <Badge colors="bg-[#fef2f2] text-[#dc2626]">{t('users.linkExpired')}</Badge>}
        </div>,
        pending ? (
          <button type="button" className="table-link text-left underline" disabled={resending === user.userId}
            onClick={() => resend(user)}>
            {t('users.resend')}
          </button>
        ) : <span className="text-[#9ca3af]">—</span>,
      ],
    };
  });

  const resize = (size) => update({ pageSize: size });

  return (
    <section className="register">
      {banner && (
        <Notice className="mb-5" title={t('common.confirmation')} onClose={() => setBanner(null)}>
          {t(banner.key, banner.values)}
        </Notice>
      )}
      <h1 className="sr-only">{t('users.title')}</h1>
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
        <TabBar label={t('users.status')} value={status} counts={data?.counts}
          onChange={(next) => update({ status: next })}
          tabs={TABS.map(([value, name, TabIcon]) => [value, t(`users.tabs.${name}`), TabIcon])} />
        <button type="button" className="table-button-dark !gap-1.5 !px-4" onClick={() => setCreating(true)}>
          <PersonPlusIcon />{t('invite.open')}
        </button>
      </div>

      <div className="table-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3f4f6] px-5 py-3.5">
          <SearchBox wide label={t('users.searchLabel')} placeholder={t('users.searchHint')} value={search} onChange={type} />
          <ResultsSummary pageSize={pageSize} total={t('users.count', { total: data?.total ?? '…' })}
            onPageSizeChange={resize} />
        </div>
        <FormError code={error} className="px-5 py-3" />
        {!data ? (!error && <p className="p-5 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>) : (
          <>
            <GridTable label={t('users.title')} template={TEMPLATE} minWidth={MIN_WIDTH}
              columns={COLUMNS.map((c) => [c, t(`users.${c}`)])} rows={rows} empty={t('users.empty')} />
            <RangePages page={page} pageSize={pageSize} total={data.total} items="users"
              onPageChange={(next) => setView((v) => ({ ...v, page: next }))}
              onPageSizeChange={resize} />
          </>
        )}
      </div>

      {creating && <InviteModal onClose={() => setCreating(false)} onCreated={created} />}
      <Toast message={toast && t('users.resent', toast)} onDone={closeToast} />
    </section>
  );
}
