// The Incoming Transmitted Cases Queue: review tabs with counts, search, sorting,
// a custody filter and pages. All of them are applied by the server.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircleIcon, ClockIcon, EnvelopeIcon, FilterIcon, InspectIcon, SortIcon,
} from '../../components/table/icons';
import Menu, { MenuHeading, MenuItem } from '../../components/table/Menu';
import {
  Badge, CenteredPages, GridTable, ResultsSummary, SearchBox, SelectAll, TabBar,
} from '../../components/table/parts';
import { FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api, query } from '../../lib/api';
import { formatRemaining, isUrgent, useServerNow } from '../../lib/custody';
import { useDraft } from '../../lib/useDraft';
import { CUSTODY_FILTERS } from '../police/register/options';

const DEFAULT_VIEW = { search: '', status: '', custody: '', sort: 'priority', dir: 'asc', page: 1, pageSize: 5 };

// [value, translation key, icon]
const TABS = [['', 'all', EnvelopeIcon], ['PENDING', 'pending', ClockIcon], ['ISSUED', 'reviewed', CheckCircleIcon]];

// [translation key, sort, direction]
const SORT_CHOICES = [
  ['magistrate.sorts.priority', 'priority', 'asc'],
  ['magistrate.sorts.newest', 'transmitted', 'desc'],
  ['magistrate.sorts.oldest', 'transmitted', 'asc'],
  ['register.sorts.caseAsc', 'caseId', 'asc'],
  ['register.sorts.caseDesc', 'caseId', 'desc'],
  ['register.sorts.mostEvidence', 'evidence', 'desc'],
];

const TEMPLATE = '36px minmax(130px,1fr) minmax(180px,1.5fr) minmax(140px,1fr) minmax(150px,1.2fr) '
  + 'minmax(80px,0.6fr) minmax(140px,1fr) minmax(110px,0.8fr) minmax(90px,0.7fr)';
// The columns' smallest widths and the 20px padding on each side.
const MIN_WIDTH = 1096;
const COLUMNS = ['caseId', 'station', 'incident', 'suspect', 'evidence', 'transmittedAt', 'review', 'actions'];
const REVIEW_COLORS = { PENDING: 'bg-[#fef3c7] text-[#b45309]', ISSUED: 'bg-[#dcfce7] text-[#15803d]' };

export default function Queue({ version }) {
  const { t, language, formatDateTime } = useLanguage();
  const [stored, setView] = useDraft('magistrate.queue', DEFAULT_VIEW);
  // A view saved before a setting existed takes its default.
  const view = { ...DEFAULT_VIEW, ...stored };
  // What is in the box; applied to the query after a short pause.
  const [search, setSearch] = useState(view.draft ?? view.search);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const now = useServerNow(data?.serverNow);

  // Every change to what is listed returns to page 1 and clears the selection.
  const update = (changes) => {
    setSelected([]);
    setView((v) => ({ ...v, page: 1, ...changes }));
  };

  useEffect(() => {
    if (search.trim() === view.search.trim()) return undefined;
    const timer = setTimeout(() => update({ search }), 350);
    return () => clearTimeout(timer);
  }, [search, view.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const { search: applied, status, custody, sort, dir, page, pageSize } = view;
  useEffect(() => {
    let current = true;
    api.get(`/magistrate/queue${query({ search: applied.trim(), status, custody, sort, dir, page, pageSize })}`)
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [applied, status, custody, sort, dir, page, pageSize, version]);

  function type(value) {
    setSearch(value);
    // The typed text is kept at once, so a refresh cannot lose it.
    setView((v) => ({ ...v, draft: value }));
  }

  const created = new Intl.DateTimeFormat(language === 'FR' ? 'fr-FR' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Douala' });
  const items = data?.items || [];
  const ids = items.map((item) => item.caseId);
  const chosen = ids.filter((id) => selected.includes(id)).length;
  const toggle = (id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const columns = [
    ['select', <SelectAll key="all" label={t('register.selectAll')} checked={ids.length > 0 && chosen === ids.length}
      partly={chosen > 0 && chosen < ids.length} disabled={!ids.length}
      onChange={() => setSelected(chosen === ids.length ? [] : ids)} />],
    ...COLUMNS.map((c) => [c, t(`magistrate.columns.${c}`)]),
  ];

  const rows = items.map((item) => {
    const review = item.status === 'MANDATE_ISSUED' ? 'ISSUED' : 'PENDING';
    const urgent = item.custodyExpiresAt && isUrgent(item.custodyExpiresAt, now);
    return {
      key: item.caseId,
      cells: [
        <input type="checkbox" className="register-check" aria-label={t('register.select', { caseId: item.caseId })}
          checked={selected.includes(item.caseId)} onChange={() => toggle(item.caseId)} />,
        <>
          <p className="whitespace-nowrap font-semibold text-[#1a1a1a]">{item.caseId}</p>
          <p className="mt-0.5 text-[11px] text-[#9ca3af]">{created.format(new Date(item.createdAt))}</p>
        </>,
        item.unitName,
        <span className="font-semibold text-[#1a1a1a]">{item.incidentTitle}</span>,
        <>
          <p>{item.leadSuspect || '—'}</p>
          {/* Red is kept for deadlines under 2 hours. */}
          <p className={`mt-0.5 text-xs ${item.custodyExpiresAt ? 'table-mono font-semibold' : ''} ${urgent ? 'text-[#dc2626]' : ''}`}
            title={urgent ? t('custody.urgent') : undefined}>
            {item.custodyExpiresAt ? formatRemaining(item.custodyExpiresAt, now) : '—'}
          </p>
        </>,
        item.evidenceCount,
        formatDateTime(item.transmittedAt),
        <Badge colors={REVIEW_COLORS[review]}>{t(`magistrate.queueStatus.${review}`)}</Badge>,
        <Link className="table-link flex w-fit items-center gap-1 whitespace-nowrap" to={`/magistrate/cases/${item.caseId}`}>
          <InspectIcon />{t('magistrate.inspectShort')}
        </Link>,
      ],
    };
  });

  return (
    <section className="register mt-7" aria-labelledby="queue-title">
      <h2 id="queue-title" className="sr-only">{t('magistrate.queue')}</h2>
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
        <TabBar label={t('magistrate.reviewStatus')} value={status} counts={data?.counts}
          onChange={(next) => update({ status: next })}
          tabs={TABS.map(([value, name, TabIcon]) => [value, t(`magistrate.tabs.${name}`), TabIcon])} />
        <div className="flex items-center gap-2.5">
          <Menu buttonClassName="register-button" button={<><SortIcon />{t('register.sort')}</>}>
            {(close) => SORT_CHOICES.map(([name, nextSort, nextDir]) => (
              <MenuItem key={name} checked={sort === nextSort && dir === nextDir}
                onSelect={() => { update({ sort: nextSort, dir: nextDir }); close(); }}>
                {t(name)}
              </MenuItem>
            ))}
          </Menu>
          <Menu buttonClassName="register-button" button={(
            <>
              <FilterIcon />{t('register.filter')}
              {custody && (
                <span className="rounded-[10px] bg-[#1a1a1a] px-[7px] py-px text-[11px] font-semibold text-white">1</span>
              )}
            </>
          )}>
            {(close) => (
              <>
                <MenuHeading>{t('register.custodyFilter')}</MenuHeading>
                {CUSTODY_FILTERS.map(([name, value]) => (
                  <MenuItem key={name} checked={custody === value} onSelect={() => { update({ custody: value }); close(); }}>
                    {t(`register.custodies.${name}`)}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        </div>
      </div>
      <div className="table-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3f4f6] px-5 py-3.5">
          <SearchBox label={t('register.search')} placeholder={t('register.searchHint')} value={search} onChange={type} />
          <ResultsSummary pageSize={pageSize} total={t('magistrate.results', { total: data?.total ?? '…' })}
            onPageSizeChange={(size) => update({ pageSize: size })} selected={selected.length}
            onClear={() => setSelected([])} />
        </div>
        <FormError code={error} className="px-5 py-3" />
        {data ? (
          <GridTable label={t('magistrate.queue')} template={TEMPLATE} minWidth={MIN_WIDTH}
            columns={columns} rows={rows} empty={t('magistrate.noQueue')} />
        ) : (!error && <p className="p-5 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>)}
        <CenteredPages page={page} totalPages={data?.totalPages || 1}
          onChange={(next) => { setSelected([]); setView((v) => ({ ...v, page: next })); }} />
      </div>
    </section>
  );
}
