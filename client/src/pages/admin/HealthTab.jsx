import { useCallback, useEffect, useState } from 'react';
import { FormError, Icon, Notice, PageHeader, Toast } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';

export default function HealthTab() {
  const { t, formatDateTime } = useLanguage();
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const [backups, setBackups] = useState(null);
  const [backupError, setBackupError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const closeNotice = useCallback(() => setNotice(null), []);

  const loadHealth = useCallback(() => api.get('/admin/system/health')
    .then((data) => { setHealth(data); setHealthError(null); })
    .catch((e) => { setHealth(null); setHealthError(e.code); }), []);

  const loadBackups = useCallback(() => api.get('/admin/system/backups')
    .then((data) => setBackups(data.items))
    .catch((e) => setBackupError({ code: e.code })), []);

  useEffect(() => { loadHealth(); loadBackups(); }, [loadHealth, loadBackups]);

  async function backup() {
    setBusy(true);
    setBackupError(null);
    setNotice(null);
    try {
      const result = await api.post('/admin/system/backups');
      setNotice(result.status === 'COMPLETED' ? 'backups.created' : 'backups.started');
    } catch (e) {
      setBackupError({ code: e.code });
    } finally {
      await loadBackups();
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader title={t('admin.tabs.health')} />

      <div className="mt-7 flex items-center justify-between">
        <h2 className="font-semibold">{t('health.title')}</h2>
        <button type="button" className="button-secondary" onClick={loadHealth}>
          <Icon name="rotate-right" />{t('common.refresh')}
        </button>
      </div>
      <FormError code={healthError} className="mt-3" />
      {health && (
        <>
          <Notice className="mt-3">{t(health.healthy ? 'health.healthy' : 'health.unhealthy')}</Notice>
          <div className="mt-3 grid grid-cols-3 gap-4">
            {health.checks.map((check) => (
              <article key={check.name} className="border border-neutral-300 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-sm font-semibold leading-5">{t(`health.${check.name}`)}</h3>
                  <span className="status">{t(check.ok ? 'health.ok' : 'health.problem')}</span>
                </div>
                <div className="mt-5 flex justify-between gap-3 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
                  <span>{t('health.checkedAt', { time: formatDateTime(health.checkedAt) })}</span>
                  {check.latencyMs !== undefined && (
                    <strong className="text-neutral-900">{t('health.latency', { ms: check.latencyMs })}</strong>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-600">
            {t('health.uptime', { minutes: Math.floor(health.uptimeSeconds / 60) })}
          </p>
        </>
      )}

      <div className="mt-7 border border-neutral-300 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-300 p-5">
          <h2 className="font-semibold">{t('backups.title')}</h2>
          <div className="flex gap-3">
            <button type="button" className="button-secondary" onClick={loadBackups}>
              <Icon name="rotate-right" />{t('common.refresh')}
            </button>
            <button type="button" className="button-primary" disabled={busy} onClick={backup}>
              <Icon name={busy ? 'spinner fa-spin' : 'database'} />{t(busy ? 'backups.running' : 'backups.trigger')}
            </button>
          </div>
        </div>
        {backupError && <Notice className="mx-5 mt-4">{t(`errors.${backupError.code}`)}</Notice>}
        {backups && (
          <div className="overflow-x-auto p-5">
            <table>
              <thead>
                <tr>{['time', 'name', 'by', 'status'].map((c) => <th key={c}>{t(`backups.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {backups.map((item) => (
                  <tr key={item.backupId}>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td className="font-mono text-xs">{item.snapshotName}</td>
                    <td>{item.triggeredBy || '—'}</td>
                    <td><span className="status">{t(`backups.${item.status}`)}</span></td>
                  </tr>
                ))}
                {backups.length === 0 && (
                  <tr><td colSpan={4} className="py-10 text-center text-neutral-500">{t('backups.empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Toast message={notice && t(notice)} onDone={closeNotice} />
    </section>
  );
}
