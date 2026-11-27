// The Active Case Files Register: search first, with a status filter.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Pagination from '../../components/Pagination';
import { FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api, query } from '../../lib/api';
import { formatRemaining, isUrgent, useServerNow } from '../../lib/custody';
import { useDraft } from '../../lib/useDraft';

const STATUSES = ['IN_INVESTIGATION', 'TRANSMITTED_TO_MAGISTRATE', 'MANDATE_ISSUED'];
const COLUMNS = ['caseId', 'summary', 'suspects', 'timer', 'evidence', 'status', 'actions'];

export default function CaseRegister({ version }) {
  const { t } = useLanguage();
  const [view, setView] = useDraft('police.register', { search: '', status: '', page: 1, pageSize: 5 });
  const [search, setSearch] = useState(view.draft ?? view.search);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const now = useServerNow(data?.serverNow);

  // Search after a short pause in typing, returning to page 1.
  useEffect(() => {
    if (search.trim() === view.search.trim()) return undefined;
    const timer = setTimeout(() => setView((v) => ({ ...v, search, page: 1 })), 350);
    return () => clearTimeout(timer);
  }, [search, view.search, setView]);

  const { search: applied, status, page, pageSize } = view;
  useEffect(() => {
    let current = true;
    api.get(`/cases${query({ search: applied.trim(), status, page, pageSize })}`)
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [applied, status, page, pageSize, version]);

  function type(value) {
    setSearch(value);
    // The typed text is kept at once, so a refresh cannot lose it.
    setView((v) => ({ ...v, draft: value }));
  }

  return (
    <div className="mt-7 border border-neutral-300 bg-white">
      <div className="flex items-end justify-between gap-5 border-b border-neutral-300 p-5">
        <h2 className="pb-2 font-semibold">{t('register.title')}</h2>
        <div className="flex items-end gap-3">
          <label>
            <span className="mb-1.5 block text-xs font-medium">{t('register.search')}</span>
            <span className="relative block">
              <Icon name="magnifying-glass" className="absolute left-3 top-3 text-neutral-500" />
              <input type="search" className="input w-72 pl-9" maxLength={200} value={search}
                placeholder={t('register.searchHint')} onChange={(event) => type(event.target.value)} />
            </span>
          </label>
        </div>
      </div>
        <div>
          <div className="flex justify-end border-b border-neutral-300 bg-neutral-50 px-5 py-3">
            <label>
              <span className="mb-1.5 block text-xs font-medium"><Icon name="filter" className="mr-1.5" />{t('register.status')}</span>
              <select className="input w-60" value={status}
                onChange={(event) => setView((v) => ({ ...v, status: event.target.value, page: 1 }))}>
                <option value="">{t('register.all')}</option>
                {STATUSES.map((value) => <option key={value} value={value}>{t(`caseStatus.${value}`)}</option>)}
              </select>
            </label>
          </div>
          <FormError code={error} className="px-5 py-3" />
          {!data ? (!error && <p className="p-5 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>) : (
            <>
              <div className="overflow-x-auto">
                <table>
                  <thead><tr>{COLUMNS.map((c) => <th key={c}>{t(`register.columns.${c}`)}</th>)}</tr></thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.caseId}>
                        <td className="whitespace-nowrap font-mono text-xs font-semibold">{item.caseId}</td>
                        <td className="min-w-56 font-medium">{item.incidentTitle}</td>
                        <td>{item.suspects.join(', ') || '—'}</td>
                        <td className={`whitespace-nowrap font-mono ${item.custodyExpiresAt && isUrgent(item.custodyExpiresAt, now) ? 'font-semibold text-red-500' : ''}`}>
                          {item.custodyExpiresAt ? formatRemaining(item.custodyExpiresAt, now) : t('custody.notInCustody')}
                        </td>
                        <td>{item.evidenceCount}</td>
                        <td><span className="status">{t(`caseStatus.${item.status}`)}</span></td>
                        <td><Link className="text-action whitespace-nowrap" to={`/police/cases/${item.caseId}`}>{t('police.openCase')}</Link></td>
                      </tr>
                    ))}
                    {!data.items.length && (
                      <tr><td colSpan={COLUMNS.length} className="py-10 text-center text-neutral-500">{t('register.empty')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={pageSize} total={data.total} items="cases"
                onPageChange={(next) => setView((v) => ({ ...v, page: next }))}
                onPageSizeChange={(size) => setView((v) => ({ ...v, pageSize: size, page: 1 }))} />
            </>
          )}
        </div>
    </div>
  );
}
