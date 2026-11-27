// M1: analytics, urgent custody alerts (Pattern A) and the incoming queue (Pattern B).
import { useEffect, useState } from 'react';
import CustodyAlerts from '../../components/CustodyAlerts';
import { FormError, Icon, PageHeader } from '../../components/ui';
import { useCustodySync } from '../../context/CustodySyncContext';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import Queue from './Queue';
import UrgentPanel from './UrgentPanel';

export default function Dashboard() {
  const { t } = useLanguage();
  const { version } = useCustodySync();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let current = true;
    api.get('/magistrate/dashboard')
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [version]);

  const kpis = data?.kpis;
  const turnaround = (seconds) => {
    if (seconds === null || seconds === undefined) return '—';
    const minutes = Math.round(seconds / 60);
    return t('magistrate.duration', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  };
  const cards = [
    ['pendingReview', 'inbox', kpis?.pendingReview],
    ['urgentCustody', 'triangle-exclamation', kpis?.urgentCustody],
    ['turnaround', 'chart-line', kpis && turnaround(kpis.averageTurnaroundSeconds)],
    ['mandatesIssued', 'gavel', kpis?.mandatesIssued],
  ];

  return (
    <section>
      <CustodyAlerts linkTo={(item) => (item.caseStatus === 'IN_INVESTIGATION' ? null : `/magistrate/cases/${item.caseId}`)} />
      <PageHeader title={t('magistrate.dashboard')} />
      <FormError code={error} className="mt-3" />
      <div className="mt-7 grid grid-cols-4 gap-4">
        {cards.map(([key, icon, value]) => {
          const alarm = key === 'urgentCustody' && value > 0;
          return (
            <article key={key} data-testid={`kpi-${key}`} className={`border bg-white p-5 ${alarm ? 'border-red-500' : 'border-neutral-300'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-600">{t(`magistrate.kpi.${key}`)}</span>
                <Icon name={icon} className={alarm ? 'text-red-500' : 'text-neutral-500'} />
              </div>
              <div className={`mt-3 text-2xl font-semibold ${alarm ? 'text-red-500' : ''}`}>{value ?? '…'}</div>
            </article>
          );
        })}
      </div>
      <UrgentPanel data={data} />
      <Queue version={version} />
    </section>
  );
}
