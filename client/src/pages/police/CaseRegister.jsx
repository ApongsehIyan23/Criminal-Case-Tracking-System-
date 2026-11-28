// The Active Case Files Register: status tabs, search, sorting, filters and pages.
// All of them are applied by the server across the whole register.
import { useEffect, useState } from 'react';
import { CenteredPages, ResultsSummary, SearchBox } from '../../components/table/parts';
import { FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api, query } from '../../lib/api';
import { useServerNow } from '../../lib/custody';
import { useDraft } from '../../lib/useDraft';
import { DEFAULT_VIEW } from './register/options';
import Table from './register/Table';
import Toolbar from './register/Toolbar';

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
          <SearchBox label={t('register.search')} placeholder={t('register.searchHint')} value={search} onChange={type} />
          <ResultsSummary pageSize={pageSize} total={t('register.results', { total: data?.total ?? '…' })}
            onPageSizeChange={(size) => update({ pageSize: size })} selected={selected.length}
            onClear={() => setSelected([])} />
        </div>
        <FormError code={error} className="px-5 py-3" />
        <div className="flex-1 overflow-x-auto">
          {data ? <Table items={data.items} view={view} now={now} selected={selected} onSelect={setSelected} onSort={sortBy} />
            : (!error && <p className="p-5 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>)}
        </div>
        <CenteredPages page={page} totalPages={data?.totalPages || 1}
          onChange={(next) => { setSelected([]); setView((v) => ({ ...v, page: next })); }} />
      </div>
    </div>
  );
}
