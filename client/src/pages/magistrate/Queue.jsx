import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Pagination from '../../components/Pagination';
import { FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api, query } from '../../lib/api';
import { formatRemaining, isUrgent, useServerNow } from '../../lib/custody';
import { useDraft } from '../../lib/useDraft';

const COLUMNS = ['caseId', 'station', 'incident', 'suspect', 'evidence', 'transmittedAt', 'review', 'actions'];

export default function Queue({ version }) {
  const { t, formatDateTime } = useLanguage();
  const [view, setView] = useDraft('magistrate.queue', { search: '', status: '', page: 1, pageSize: 5 });
  // What is in the box; applied to the query after a short pause.
  const [search, setSearch] = useState(view.draft ?? view.search);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const now = useServerNow(data?.serverNow);

  useEffect(() => {
    if (search.trim() === view.search.trim()) return undefined;
    const timer = setTimeout(() => setView((v) => ({ ...v, search, page: 1 })), 350);
    return () => clearTimeout(timer);
  }, [search, view.search, setView]);

  const { search: applied, status, page, pageSize } = view;
  useEffect(() => {
    let current = true;
    api.get(`/magistrate/queue${query({ search: applied.trim(), status, page, pageSize })}`)
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [applied, status, page, pageSize, version]);

  return (
    <section className="mt-7 border border-neutral-300 bg-white">
      <div className="flex items-end justify-between gap-6 border-b border-neutral-300 p-5">
        <h2 className="pb-2 font-semibold"><Icon name="inbox" className="mr-2" />{t('magistrate.queue')}</h2>
        <div className="flex gap-3">
          <label>
            <span className="field-label">{t('register.search')}</span>
            <span className="relative block">
              <Icon name="magnifying-glass" className="absolute left-3 top-3 text-neutral-500" />
              <input type="search" className="input w-72 pl-9" maxLength={200} value={search} placeholder={t('register.searchHint')}
                onChange={(event) => {
                  const { value } = event.target;
                  setSearch(value);
                  setView((v) => ({ ...v, draft: value }));
                }} />
            </span>
          </label>
          <label>
            <span className="field-label"><Icon name="filter" className="mr-1.5" />{t('magistrate.reviewStatus')}</span>
            <select className="input w-52" value={status}
              onChange={(event) => setView((v) => ({ ...v, status: event.target.value, page: 1 }))}>
              <option value="">{t('register.all')}</option>
              <option value="PENDING">{t('magistrate.review.PENDING')}</option>
              <option value="ISSUED">{t('magistrate.review.ISSUED')}</option>
            </select>
          </label>
        </div>
      </div>
      <FormError code={error} className="px-5 py-3" />
      {!data ? (!error && <p className="p-5 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>) : (
        <>
          <div className="overflow-x-auto">
            <table className="[&_th]:whitespace-normal">
              <thead><tr>{COLUMNS.map((c) => <th key={c}>{t(`magistrate.columns.${c}`)}</th>)}</tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.caseId}>
                    <td className="whitespace-nowrap font-mono text-xs font-semibold">{item.caseId}</td>
                    <td>{item.unitName}</td>
                    <td className="font-medium">{item.incidentTitle}</td>
                    <td>
                      <div>{item.leadSuspect || '—'}</div>
                      <div className={`mt-1 font-mono text-xs ${item.custodyExpiresAt && isUrgent(item.custodyExpiresAt, now) ? 'font-semibold text-red-500' : 'text-neutral-500'}`}>
                        {item.custodyExpiresAt ? formatRemaining(item.custodyExpiresAt, now) : t('custody.notInCustody')}
                      </div>
                    </td>
                    <td>{item.evidenceCount}</td>
                    <td className="whitespace-nowrap">{formatDateTime(item.transmittedAt)}</td>
                    <td><span className="status">{t(`magistrate.review.${item.status === 'MANDATE_ISSUED' ? 'ISSUED' : 'PENDING'}`)}</span></td>
                    <td>
                      <Link className="text-action whitespace-nowrap" to={`/magistrate/cases/${item.caseId}`}>
                        <Icon name="eye" className="mr-1.5" />{t('magistrate.inspect')}
                      </Link>
                    </td>
                  </tr>
                ))}
                {!data.items.length && (
                  <tr><td colSpan={COLUMNS.length} className="py-10 text-center text-neutral-500">{t('magistrate.noQueue')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={data.total} items="cases"
            onPageChange={(next) => setView((v) => ({ ...v, page: next }))}
            onPageSizeChange={(size) => setView((v) => ({ ...v, pageSize: size, page: 1 }))} />
        </>
      )}
    </section>
  );
}
