import { useCallback, useEffect, useState } from 'react';
import Pagination from '../../components/Pagination';
import { FormError, Icon, Notice, PageHeader, Toast } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api, query } from '../../lib/api';
import { useDraft } from '../../lib/useDraft';
import InviteModal from './InviteModal';

export default function UsersTab() {
  const { t } = useLanguage();
  const [view, setView] = useDraft('admin.users', { page: 1, pageSize: 5, version: 0 });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useDraft('admin.invite.open', false);
  const [banner, setBanner] = useState(null);
  const [toast, setToast] = useState(null);
  const [resending, setResending] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    let current = true;
    api.get(`/admin/users${query({ page: view.page, pageSize: view.pageSize })}`)
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [view]);

  function created(results) {
    const failed = results.filter((r) => !r.emailSent).map((r) => r.email);
    setBanner(failed.length
      ? { key: 'invite.partial', values: { emails: failed.join(', ') } }
      : { key: 'invite.success', values: { count: results.length } });
    setCreating(false);
    setView((v) => ({ ...v, page: 1, version: v.version + 1 }));
  }

  async function resend(user) {
    setResending(user.userId);
    setBanner(null);
    setError(null);
    try {
      const result = await api.post(`/admin/users/${user.userId}/resend-invitation`);
      if (result.emailSent) setToast({ email: user.email });
      else setBanner({ key: 'users.resendFailed', values: { email: user.email } });
      setView((v) => ({ ...v, version: v.version + 1 }));
    } catch (e) {
      setError(e.code);
    } finally {
      setResending(null);
    }
  }

  return (
    <section>
      {banner && (
        <Notice className="mb-5" title={t('common.confirmation')} onClose={() => setBanner(null)}>
          {t(banner.key, banner.values)}
        </Notice>
      )}
      <PageHeader title={t('admin.tabs.users')}>
        <button type="button" className="button-primary" onClick={() => setCreating(true)}>
          <Icon name="user-plus" />{t('invite.open')}
        </button>
      </PageHeader>

      <div className="mt-7 border border-neutral-300 bg-white">
        <div className="border-b border-neutral-300 px-5 py-4">
          <h2 className="font-semibold">{t('users.title')}</h2>
          <FormError code={error} className="mt-2" />
        </div>
        {!data ? (!error && <p className="p-5 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>) : (
          <>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>{['name', 'email', 'role', 'unit', 'status', 'actions'].map((c) => <th key={c}>{t(`users.${c}`)}</th>)}</tr>
                </thead>
                <tbody>
                  {data.items.map((user) => {
                    const pending = user.status === 'INVITATION_PENDING';
                    const expired = pending && user.invitationExpiresAt && new Date(user.invitationExpiresAt) <= new Date();
                    return (
                      <tr key={user.userId}>
                        <td className="font-medium">{user.fullName}</td>
                        <td>{user.email}</td>
                        <td>{t(`roles.${user.role}`)}</td>
                        <td>{user.unitName || '—'}</td>
                        <td>
                          <span className="status">{t(`status.${user.status}`)}</span>
                          {expired && <span className="status ml-1">{t('users.linkExpired')}</span>}
                        </td>
                        <td>
                          {pending ? (
                            <button type="button" className="text-action whitespace-nowrap" disabled={resending === user.userId}
                              onClick={() => resend(user)}>
                              {t('users.resend')}
                            </button>
                          ) : <span className="text-neutral-400">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {data.items.length === 0 && (
                    <tr><td colSpan={6} className="py-10 text-center text-neutral-500">{t('users.empty')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={view.page} pageSize={view.pageSize} total={data.total} items="users"
              onPageChange={(page) => setView((v) => ({ ...v, page }))}
              onPageSizeChange={(pageSize) => setView((v) => ({ ...v, page: 1, pageSize }))} />
          </>
        )}
      </div>

      {creating && <InviteModal onClose={() => setCreating(false)} onCreated={created} />}
      <Toast message={toast && t('users.resent', toast)} onDone={closeToast} />
    </section>
  );
}
