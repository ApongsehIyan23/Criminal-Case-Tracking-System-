// The Active Case Files Register: status tabs, search, sorting, filters and pages.
// All of them are applied by the server across the whole register.
import { useEffect, useState } from 'react';
import { pageNumbers, PAGE_SIZES } from '../../components/Pagination';
import { FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api, query } from '../../lib/api';
import { useServerNow } from '../../lib/custody';
import { useDraft } from '../../lib/useDraft';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from './register/icons';
import { DEFAULT_VIEW } from './register/options';
import Table from './register/Table';
import Toolbar from './register/Toolbar';

function Pages({ page, totalPages, onChange }) {
  const { t } = useLanguage();
  const arrow = 'register-page !text-[#9ca3af]';
  return (
    <nav aria-label={t('pagination.label')} className="flex items-center justify-center gap-1 border-t border-[#e5e7eb] px-5 py-4">
      <button type="button" className={arrow} aria-label={t('pagination.previous')} disabled={page <= 1}
        onClick={() => onChange(page - 1)}>
        <ChevronLeftIcon />
      </button>
      {pageNumbers(page, totalPages).map((n) => (typeof n === 'number' ? (
        <button key={n} type="button" className="register-page" aria-current={n === page ? 'page' : undefined}
          aria-label={t('pagination.page', { page: n })} onClick={() => onChange(n)}>
          {n}
        </button>
      ) : <span key={n} className="px-1 text-[#9ca3af]">…</span>))}
      <button type="button" className={arrow} aria-label={t('pagination.next')} disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}>
        <ChevronRightIcon />
      </button>
    </nav>
  );
}

export default function CaseRegister({ version }) {
  const { t } = useLanguage();
  const [stored, setView] = useDraft('police.register', DEFAULT_VIEW);
  // A view saved before a setting existed takes its default.
  const view = { ...DEFAULT_VIEW, ...stored };
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

  // Search after a short pause in typing.
  useEffect(() => {
    if (search.trim() === view.search.trim()) return undefined;
    const timer = setTimeout(() => update({ search }), 350);
    return () => clearTimeout(timer);
  }, [search, view.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const { search: applied, status, record, custody, sort, dir, page, pageSize } = view;
  useEffect(() => {
    let current = true;
    api.get(`/cases${query({ search: applied.trim(), status, record, custody, sort, dir, page, pageSize })}`)
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [applied, status, record, custody, sort, dir, page, pageSize, version]);

  function type(value) {
    setSearch(value);
    // The typed text is kept at once, so a refresh cannot lose it.
    setView((v) => ({ ...v, draft: value }));
  }

  // A column header switches between ascending and descending.
  const sortBy = (column) => update({ sort: column, dir: sort === column && dir === 'asc' ? 'desc' : 'asc' });

  return (
    <div className="register flex flex-1 flex-col">
      <Toolbar view={view} counts={data?.counts} update={update} />
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3f4f6] px-5 py-3.5">
          <label className="register-search">
            <SearchIcon />
            <input type="search" maxLength={200} value={search} aria-label={t('register.search')}
              placeholder={t('register.searchHint')} onChange={(event) => type(event.target.value)} />
          </label>
          <div className="flex items-center gap-4 text-[13px] text-[#6b7280]">
            {selected.length > 0 && (
              <span role="status" className="flex items-center gap-2">
                {t('register.selected', { count: selected.length })}
                <button type="button" className="font-medium text-[#374151] underline" onClick={() => setSelected([])}>
                  {t('register.clear')}
                </button>
              </span>
            )}
            <label className="flex items-center gap-1.5">
              {t('register.showing')}
              <select aria-label={t('pagination.rows')} value={pageSize}
                className="rounded border border-[#d1d5db] bg-white px-1.5 py-0.5 text-[13px] text-[#374151]"
                onChange={(event) => update({ pageSize: Number(event.target.value) })}>
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <span data-testid="results">
                {t('register.of')} <strong className="text-[#374151]">{t('register.results', { total: data?.total ?? '…' })}</strong>
              </span>
            </label>
          </div>
        </div>
        <FormError code={error} className="px-5 py-3" />
        <div className="flex-1 overflow-x-auto">
          {data ? <Table items={data.items} view={view} now={now} selected={selected} onSelect={setSelected} onSort={sortBy} />
            : (!error && <p className="p-5 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>)}
        </div>
        <Pages page={page} totalPages={data?.totalPages || 1}
          onChange={(next) => { setSelected([]); setView((v) => ({ ...v, page: next })); }} />
      </div>
    </div>
  );
}
