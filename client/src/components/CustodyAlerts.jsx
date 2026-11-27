// In-app custody alerts addressed to the signed-in user.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCustodySync } from '../context/CustodySyncContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';
import { formatRemaining, isUrgent, useServerNow } from '../lib/custody';
import { Icon } from './ui';

export default function CustodyAlerts({ linkTo }) {
  const { t } = useLanguage();
  // Reloaded after every custody check, including the first one.
  const { synced } = useCustodySync();
  const [data, setData] = useState(null);
  const now = useServerNow(data?.serverNow);

  useEffect(() => {
    let current = true;
    api.get('/notifications').then((result) => current && setData(result)).catch(() => {});
    return () => { current = false; };
  }, [synced]);

  if (!data?.items?.length) return null;
  return (
    <section aria-label={t('alerts.title')} className="mb-5 border border-neutral-400 bg-white">
      <h2 className="border-b border-neutral-300 px-5 py-3 text-sm font-semibold">
        <Icon name="bell" className="mr-2" />{t('alerts.title')} ({data.items.length})
      </h2>
      <ul className="max-h-40 divide-y divide-neutral-200 overflow-y-auto">
        {data.items.map((item) => {
          const urgent = isUrgent(item.expiresAt, now);
          const passed = new Date(item.expiresAt).getTime() <= now;
          return (
            <li key={item.notificationId} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
              <span>
                <span className="font-mono text-xs font-semibold">{item.caseId}</span>
                <span className="mx-2">{item.suspectName}</span>
                <span className={urgent ? 'font-semibold text-red-500' : 'text-neutral-600'}>
                  <Icon name={urgent ? 'triangle-exclamation' : 'stopwatch'} className="mr-1.5" />
                  {passed ? t('custody.expired') : t('alerts.remaining', { time: formatRemaining(item.expiresAt, now) })}
                </span>
              </span>
              {linkTo?.(item) && <Link className="text-action" to={linkTo(item)}>{t('police.openCase')}</Link>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
