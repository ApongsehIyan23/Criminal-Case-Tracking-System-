import { useCallback, useEffect, useState } from 'react';
import { FormError, Icon, Notice } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';

const STATUS_ICONS = { STARTED: 'spinner', COMPLETED: 'circle-check', FAILED: 'circle-xmark' };

export default function HealthTab() {
  const { t, formatDateTime } = useLanguage();
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const [backups, setBackups] = useState(null);
  const [backupError, setBackupError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

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
    <div className="space-y-4">
      <section className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="heart-pulse" />{t('health.title')}</h2>
          <button type="button" className="btn" onClick={loadHealth}><Icon name="rotate-right" />{t('common.refresh')}</button>
        </div>
        <div className="p-5">
          <FormError code={healthError} />
          {health && (
            <>
              <Notice icon={health.healthy ? 'circle-check' : 'triangle-exclamation'}>
                {t(health.healthy ? 'health.healthy' : 'health.unhealthy')}
              </Notice>
              <ul className="mt-3 divide-y divide-neutral-200">
                {health.checks.map((check) => (
                  <li key={check.name} className="flex items-center justify-between py-2 text-sm">
                    <span>{t(`health.${check.name}`)}</span>
                    <span className="flex items-center gap-2">
                      {check.latencyMs !== undefined && <span className="text-neutral-600">{t('health.latency', { ms: check.latencyMs })}</span>}
                      <span className="pill"><Icon name={check.ok ? 'check' : 'triangle-exclamation'} />{t(check.ok ? 'health.ok' : 'health.problem')}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-neutral-600">
                {t('health.uptime', { minutes: Math.floor(health.uptimeSeconds / 60) })} · {t('health.checkedAt', { time: formatDateTime(health.checkedAt) })}
              </p>
            </>
          )}
        </div>
      </section>

      <section className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="database" />{t('backups.title')}</h2>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={loadBackups}><Icon name="rotate-right" />{t('common.refresh')}</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={backup}>
              <Icon name={busy ? 'spinner fa-spin' : 'floppy-disk'} />{t(busy ? 'backups.running' : 'backups.trigger')}
            </button>
          </div>
        </div>
        <div className="space-y-2 px-5 pt-4 empty:pt-0">
          {notice && <Notice icon="circle-check">{t(notice)}</Notice>}
          {backupError && (
            <Notice icon="triangle-exclamation">
              <p>{t(`errors.${backupError.code}`)}</p>
            </Notice>
          )}
        </div>
        {backups && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>{['time', 'name', 'by', 'status'].map((c) => <th key={c} className="th">{t(`backups.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {backups.map((item) => (
                  <tr key={item.backupId}>
                    <td className="td">{formatDateTime(item.createdAt)}</td>
                    <td className="td">{item.snapshotName}</td>
                    <td className="td">{item.triggeredBy || '—'}</td>
                    <td className="td"><span className="pill"><Icon name={STATUS_ICONS[item.status]} />{t(`backups.${item.status}`)}</span></td>
                  </tr>
                ))}
                {backups.length === 0 && <tr><td className="td text-center" colSpan={4}>{t('backups.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
