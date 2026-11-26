import { useCallback, useEffect, useState } from 'react';
import Pagination from '../../components/Pagination';
import { FormError, Icon, Notice } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api, query } from '../../lib/api';
import InviteForm from './InviteForm';

const STATUS_ICONS = { INVITATION_PENDING: 'envelope', ACTIVE: 'circle-check', SUSPENDED: 'ban' };

export default function UsersTab() {
  const { t } = useLanguage();
  const [view, setView] = useState({ page: 1, pageSize: 5, version: 0 });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [resending, setResending] = useState(null);

  useEffect(() => {
    let current = true;
    api.get(`/admin/users${query({ page: view.page, pageSize: view.pageSize })}`)
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [view]);

  const showNewest = useCallback(() => setView((v) => ({ ...v, page: 1, version: v.version + 1 })), []);

  async function resend(user) {
    setResending(user.userId);
    setNotice(null);
    setError(null);
    try {
      const result = await api.post(`/admin/users/${user.userId}/resend-invitation`);
      setNotice({ key: result.emailSent ? 'users.resent' : 'users.resendFailed', email: user.email });
      setView((v) => ({ ...v, version: v.version + 1 }));
    } catch (e) {
      setError(e.code);
    } finally {
      setResending(null);
    }
  }

  return (
    <div className="space-y-4">
      <InviteForm onCreated={showNewest} />
      <section className="card p-0">
        <div className="border-b border-neutral-300 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="address-book" />{t('users.title')}</h2>
        </div>
        <div className="space-y-2 px-5 pt-4 empty:pt-0">
          <FormError code={error} />
          {notice && <Notice icon="paper-plane">{t(notice.key, { email: notice.email })}</Notice>}
        </div>
        {!data ? (!error && <p className="p-5"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>{['name', 'email', 'role', 'unit', 'status', 'actions'].map((c) => <th key={c} className="th">{t(`users.${c}`)}</th>)}</tr>
                </thead>
                <tbody>
                  {data.items.map((user) => {
                    const pending = user.status === 'INVITATION_PENDING';
                    const expired = pending && user.invitationExpiresAt && new Date(user.invitationExpiresAt) <= new Date();
                    return (
                      <tr key={user.userId}>
                        <td className="td">{user.fullName}</td>
                        <td className="td">{user.email}</td>
                        <td className="td">{t(`roles.${user.role}`)}</td>
                        <td className="td">{user.unitName || '—'}</td>
                        <td className="td">
                          <span className="pill"><Icon name={STATUS_ICONS[user.status]} />{t(`status.${user.status}`)}</span>
                          {expired && <span className="pill ml-1"><Icon name="clock" />{t('users.linkExpired')}</span>}
                        </td>
                        <td className="td">
                          {pending && (
                            <button type="button" className="text-action" disabled={resending === user.userId} onClick={() => resend(user)}>
                              <Icon name={resending === user.userId ? 'spinner fa-spin' : 'paper-plane'} />{t('users.resend')}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {data.items.length === 0 && <tr><td className="td text-center" colSpan={6}>{t('users.empty')}</td></tr>}
                </tbody>
              </table>
            </div>
            <Pagination page={view.page} pageSize={view.pageSize} total={data.total}
              onPageChange={(page) => setView((v) => ({ ...v, page }))}
              onPageSizeChange={(pageSize) => setView((v) => ({ ...v, page: 1, pageSize }))} />
          </>
        )}
      </section>
    </div>
  );
}
