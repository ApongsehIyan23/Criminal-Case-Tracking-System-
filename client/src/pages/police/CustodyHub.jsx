// Pattern A: portrait custody cards, three per page, least time remaining first.
import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { CUSTODY_MS, formatRemaining, isUrgent, remainingMs, useServerNow } from '../../lib/custody';
import { useDraft } from '../../lib/useDraft';

const PER_PAGE = 3;
const STEP = 'button-secondary h-8 px-2.5 text-xs disabled:bg-neutral-50 disabled:text-neutral-400';
const ROUND = 'flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 bg-white text-xs hover:bg-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400';
const CHIP = 'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold';

function CustodyCard({ item, now, onUpload }) {
  const { t } = useLanguage();
  const urgent = isUrgent(item.expiresAt, now);
  const expired = remainingMs(item.expiresAt, now) === 0;
  const progress = Math.min(100, Math.max(3, ((CUSTODY_MS - remainingMs(item.expiresAt, now)) / CUSTODY_MS) * 100));
  const transmitted = item.status !== 'IN_INVESTIGATION';
  const metrics = [
    ['remaining', formatRemaining(item.expiresAt, now), `font-mono tabular-nums ${urgent ? 'text-red-500' : ''}`],
    ['evidence', t('custody.fileCount', { count: item.evidenceCount }), ''],
    ['participants', t('custody.loggedCount', { count: item.participantCount }), ''],
  ];

  return (
    <article data-testid="custody-card" className="flex min-h-[430px] flex-col overflow-hidden rounded border border-neutral-300 bg-white">
      <div className={`h-14 shrink-0 border-b border-t-2 border-neutral-300 bg-[#F1F5F9] ${urgent ? 'border-t-red-500' : 'border-t-neutral-700'}`}>
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="font-mono text-[10px] font-semibold tracking-wide text-neutral-600">{item.caseId}</span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white">
            <div className={`h-full rounded-full ${urgent ? 'bg-red-500' : 'bg-neutral-700'}`} style={{ width: `${progress}%` }} />
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
            <Icon name={urgent ? 'triangle-exclamation' : 'stopwatch'} className={urgent ? 'text-red-500' : 'text-neutral-500'} />
          </div>
          <p className="mt-1 truncate text-[11px] text-neutral-600">{t('custody.nid')}: {item.nationalId} | {item.unitName}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5 px-4">
        <span className={`${CHIP} ${urgent ? 'border-red-300 text-red-500' : 'border-neutral-300 text-neutral-600'}`}>
          <Icon name={urgent ? 'triangle-exclamation' : 'stopwatch'} />
          {t(expired ? 'custody.expired' : urgent ? 'custody.underTwoHours' : 'custody.badge')}
        </span>
        <span className={`${CHIP} border-neutral-300 text-neutral-600`}>
          <Icon name="envelope" />{t(item.alertSent ? 'custody.alertSent' : 'custody.alertStandby')}
        </span>
        <span className={`${CHIP} border-neutral-300 text-neutral-600`}>
          <Icon name={transmitted ? 'lock' : 'folder-open'} />{t(`caseStatus.${item.status}`)}
        </span>
      </div>

      <p className="mt-4 line-clamp-2 min-h-10 px-4 text-sm font-medium leading-5 text-neutral-900">
        {item.narrative ? `${item.incidentTitle} — ${item.narrative}` : item.incidentTitle}
      </p>

      <div className="mx-4 mt-4 grid grid-cols-3 divide-x divide-neutral-300 rounded bg-[#F8FAFC] py-3">
        {metrics.map(([key, value, style]) => (
          <div key={key} className="px-2 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{t(`custody.${key}`)}</div>
            <div className={`mt-1 whitespace-nowrap text-sm font-bold text-neutral-900 ${style}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-neutral-200 px-4 py-3">
        {transmitted ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-200 px-3 text-xs font-semibold text-neutral-600">
            <Icon name="check" />{t('custody.transmitted')}
          </span>
        ) : (
          <Link className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-900 px-3 text-xs font-semibold text-white hover:bg-neutral-700"
            to={`/police/cases/${item.caseId}`} state={{ transmit: true }}>
            <Icon name="paper-plane" />{t('custody.transmit')}
          </Link>
        )}
        <Link className="inline-flex h-8 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs font-semibold hover:bg-neutral-100"
          to={`/police/cases/${item.caseId}`}>
          {t('police.openCase')}
        </Link>
        <div className="ml-auto flex gap-1.5">
          <button type="button" className={ROUND} disabled={transmitted} onClick={() => onUpload(item.caseId)}
            aria-label={`${t('custody.quickUpload')}: ${item.caseId}`} title={t('custody.quickUpload')}>
            <Icon name="cloud-arrow-up" />
          </button>
          <Link className={ROUND} to={`/police/cases/${item.caseId}?tab=audit`}
            aria-label={`${t('custody.viewAudit')}: ${item.caseId}`} title={t('custody.viewAudit')}>
            <Icon name="clock-rotate-left" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function CustodyHub({ data, onUpload }) {
  const { t } = useLanguage();
  const now = useServerNow(data?.serverNow);
  const [page, setPage] = useDraft('police.custodyPage', 0);
  const items = data?.custody || [];
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const current = data ? Math.min(page, pages - 1) : page;
  const start = current * PER_PAGE;

  return (
    <div className="mt-7 border border-neutral-400 bg-white">
      <div className="flex items-center justify-between gap-6 border-b border-neutral-300 px-5 py-4">
        <div className="flex items-center gap-3">
          <Icon name="stopwatch" className="text-lg" />
          <div>
            <h2 className="font-semibold">{t('custody.hub')}</h2>
            <p className="mt-0.5 text-sm text-neutral-500">{t('custody.hubIntro')}</p>
          </div>
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
      {/* Always three columns, so a lone card keeps one third of the width. */}
      <div className="grid grid-cols-3 gap-4 bg-neutral-50 p-4">
        {items.slice(start, start + PER_PAGE).map((item) => (
          <CustodyCard key={item.timerId} item={item} now={now} onUpload={onUpload} />
        ))}
        {data && !items.length && <p className="col-span-3 py-8 text-center text-sm text-neutral-500">{t('custody.none')}</p>}
        {!data && <p className="col-span-3 py-8 text-center text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>}
      </div>
    </div>
  );
}
