// Pattern A: transmitted cases with under two hours of custody left, three per page.
import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { CUSTODY_MS, formatRemaining, remainingMs, useServerNow } from '../../lib/custody';
import { useDraft } from '../../lib/useDraft';

const PER_PAGE = 3;
const STEP = 'button-secondary h-8 px-2.5 text-xs disabled:bg-neutral-50 disabled:text-neutral-400';
const CHIP = 'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold';
const PILL = 'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold';

function UrgentCard({ item, now }) {
  const { t } = useLanguage();
  const expired = remainingMs(item.expiresAt, now) === 0;
  const progress = Math.min(100, Math.max(3, ((CUSTODY_MS - remainingMs(item.expiresAt, now)) / CUSTODY_MS) * 100));
  const ruled = item.status === 'MANDATE_ISSUED';
  const link = `/magistrate/cases/${item.caseId}`;
  const metrics = [
    ['remaining', formatRemaining(item.expiresAt, now), 'font-mono tabular-nums text-red-500'],
    ['evidence', t('custody.fileCount', { count: item.evidenceCount }), ''],
    ['participants', t('custody.loggedCount', { count: item.participantCount }), ''],
  ];
  return (
    <article data-testid="urgent-card" className="flex min-h-[430px] flex-col overflow-hidden rounded border border-neutral-300 bg-white">
      <div className="h-14 shrink-0 border-b border-t-2 border-b-neutral-300 border-t-red-500 bg-[#F1F5F9]">
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="font-mono text-[10px] font-semibold tracking-wide text-neutral-600">{item.caseId}</span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-red-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 px-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-neutral-700 text-base text-white">
          <Icon name="user-lock" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-bold text-neutral-950">{item.suspectName}</h3>
            <Icon name="triangle-exclamation" className="text-red-500" />
          </div>
          <p className="mt-1 truncate text-[11px] text-neutral-600">{t('custody.nid')}: {item.nationalId} | {item.unitName}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2.5 px-4">
        <span className={`${CHIP} border-red-300 text-red-500`}>
          <Icon name="triangle-exclamation" />{t(expired ? 'custody.expired' : 'custody.underTwoHours')}
        </span>
        <span className={`${CHIP} border-neutral-300 text-neutral-600`}>
          <Icon name="envelope" />{t(item.alertSent ? 'custody.alertSent' : 'custody.alertStandby')}
        </span>
        <span className={`${CHIP} border-neutral-300 text-neutral-600`}>
          <Icon name={ruled ? 'gavel' : 'hourglass-half'} />{t(ruled ? 'magistrate.review.ISSUED' : 'magistrate.review.PENDING')}
        </span>
      </div>
      <p className="mt-4 line-clamp-2 min-h-10 px-4 text-sm font-medium leading-5 text-neutral-900">
        {item.narrative ? `${item.incidentTitle} — ${item.narrative}` : item.incidentTitle}
      </p>
      <div className="mx-4 mt-4 grid grid-cols-3 divide-x divide-neutral-300 rounded bg-[#F8FAFC] py-3">
        {metrics.map(([key, value, style]) => (
          <div key={key} className="px-2 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{t(`custody.${key}`)}</div>
            <div className={`mt-1 whitespace-nowrap text-sm font-bold ${style}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-neutral-200 px-4 py-3">
        <Link className={`${PILL} bg-neutral-900 text-white hover:bg-neutral-700`} to={link}>
          <Icon name="eye" />{t('magistrate.inspect')}
        </Link>
        {!ruled && (
          <Link className={`${PILL} border border-neutral-300 bg-white hover:bg-neutral-100`} to={`${link}?focus=mandate`}>
            <Icon name="gavel" />{t('magistrate.issueMandate')}
          </Link>
        )}
        <Link className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 bg-white text-xs hover:bg-neutral-100"
          to={`${link}?focus=audit`} aria-label={`${t('custody.viewAudit')}: ${item.caseId}`} title={t('custody.viewAudit')}>
          <Icon name="clock-rotate-left" />
        </Link>
      </div>
    </article>
  );
}

export default function UrgentPanel({ data }) {
  const { t } = useLanguage();
  const now = useServerNow(data?.serverNow);
  const [page, setPage] = useDraft('magistrate.urgentPage', 0);
  const items = data?.urgent || [];
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const current = data ? Math.min(page, pages - 1) : page;
  const start = current * PER_PAGE;

  return (
    <section className="mt-7 border border-neutral-400 bg-white">
      <div className="flex items-center justify-between gap-6 border-b border-neutral-300 px-5 py-4">
        <div>
          <h2 className="font-semibold"><Icon name="triangle-exclamation" className="mr-2" />{t('magistrate.urgentTitle')}</h2>
          <p className="mt-1 text-sm text-neutral-500">{t('magistrate.urgentIntro')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 whitespace-nowrap text-xs font-medium text-neutral-600">
            {t('custody.showing', {
              start: items.length ? start + 1 : 0, end: Math.min(start + PER_PAGE, items.length), total: items.length,
            })}
          </span>
          <button type="button" className={STEP} disabled={current === 0} onClick={() => setPage(current - 1)}>
            <Icon name="chevron-left" />{t('pagination.previous')}
          </button>
          <button type="button" className={STEP} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            {t('pagination.next')}<Icon name="chevron-right" />
          </button>
        </div>
      </div>
      {items.length ? (
        <div className="grid grid-cols-3 gap-4 bg-neutral-50 p-4">
          {items.slice(start, start + PER_PAGE).map((item) => <UrgentCard key={item.timerId} item={item} now={now} />)}
        </div>
      ) : <p className="p-6 text-sm text-neutral-500">{data ? t('magistrate.noUrgent') : t('common.loading')}</p>}
    </section>
  );
}
