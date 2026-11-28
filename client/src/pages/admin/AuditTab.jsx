// Read-only view: it offers search, filters, paging and export, and nothing that edits.
import { useEffect, useId, useState } from 'react';
import { ExportIcon, LockIcon, RefreshIcon, SearchIcon } from '../../components/table/icons';
import { Badge, GridTable, RangePages } from '../../components/table/parts';
import { FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api, query } from '../../lib/api';
import { saveBlob } from '../../lib/files';
import { useDraft } from '../../lib/useDraft';

const NO_FILTERS = { search: '', actionType: '', from: '', to: '' };

const TEMPLATE = 'minmax(140px,1fr) minmax(180px,1.4fr) minmax(170px,1.3fr) minmax(140px,0.7fr) '
  + 'minmax(160px,1.2fr) minmax(130px,1fr)';
// The columns' smallest widths and the 20px padding on each side.
const MIN_WIDTH = 960;
const COLUMNS = ['time', 'actor', 'action', 'caseId', 'details', 'ip'];

// A labelled filter. `children` receives the props that tie the control to its
// label and its error message.
function Filter({ label, error, className, children }) {
  const { t } = useLanguage();
  const id = useId();
  const describedBy = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="table-label">{label}</label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error && <p id={describedBy} role="alert" className="mt-1.5 text-xs text-red-700">{t(`errors.${error}`)}</p>}
    </div>
  );
}

const none = <span className="text-[#9ca3af]">–</span>;

export default function AuditTab() {
  const { t, language, formatDateTime } = useLanguage();
  const [filters, setFilters] = useDraft('admin.audit.filters', NO_FILTERS);
  const [view, setView] = useState(() => ({ filters, page: 1, pageSize: 5, asOf: '', version: 0 }));
  const [data, setData] = useState(null);
  const [actionTypes, setActionTypes] = useState([]);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get('/admin/audit-logs/action-types').then((r) => setActionTypes(r.actionTypes)).catch(() => {});
  }, []);

  // Any filter change returns to page 1. Typing is debounced.
  useEffect(() => {
    if (filters === view.filters) return undefined;
    const timer = setTimeout(
      () => setView((v) => ({ ...v, filters, page: 1, asOf: '' })),
      filters.search === view.filters.search ? 0 : 350,
    );
    return () => clearTimeout(timer);
  }, [filters, view.filters]);

  useEffect(() => {
    let current = true;
    const { filters: applied, page, pageSize, asOf } = view;
    api.get(`/admin/audit-logs${query({ ...applied, page, pageSize, asOf })}`)
      .then((result) => {
        if (!current) return;
        setData(result);
        setError(null);
        setFieldErrors({});
      })
      .catch((e) => {
        if (!current) return;
        setFieldErrors(e.fields);
        setError(e.code);
        setData(null);
      });
    return () => { current = false; };
  }, [view]);

  // Later pages reuse the first response's snapshot time, so rows do not shift.
  const goTo = (changes) => setView((v) => ({ ...v, asOf: data?.asOf || v.asOf, ...changes }));
  const change = (field) => (event) => setFilters({ ...filters, [field]: event.target.value });

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await api.download(`/admin/audit-logs/export${query({ ...filters, lang: language })}`);
      saveBlob(blob, filename);
    } catch (e) {
      setFieldErrors(e.fields || {});
      setError(e.code || 'SERVER_ERROR');
    } finally {
      setExporting(false);
    }
  }

  const rows = (data?.items || []).map((log) => ({
    key: log.logId,
    cells: [
      formatDateTime(log.createdAt),
      <>
        <p className="font-semibold text-[#1a1a1a]">{log.actorEmail}</p>
        <p className="mt-0.5 text-[11px] text-[#9ca3af]">{t(`roles.${log.actorRole}`)}</p>
      </>,
      <span title={log.actionType}
        className="inline-block rounded-md border border-[#e5e7eb] bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-medium">
        {t(`actions.${log.actionType}`)}
      </span>,
      log.caseId ? <span className="whitespace-nowrap">{log.caseId}</span> : none,
      log.details
        ? <span className="table-mono break-all text-xs text-[#6b7280]">{JSON.stringify(log.details)}</span>
        : none,
      log.ipAddress ? <span className="table-mono">{log.ipAddress}</span> : none,
    ],
  }));

  return (
    <section className="register">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[13px] font-semibold text-[#1a1a1a]">{t('audit.title')}</h1>
          <Badge colors="bg-[#f3f4f6] text-[#6b7280]">
            <span className="flex items-center gap-1"><LockIcon />{t('audit.readOnly')}</span>
          </Badge>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" className="register-button"
            onClick={() => setView((v) => ({ ...v, page: 1, asOf: '', version: v.version + 1 }))}>
            <RefreshIcon />{t('common.refresh')}
          </button>
          <button type="button" className="table-button-dark" disabled={exporting} onClick={exportCsv}>
            {exporting ? <Icon name="spinner fa-spin" /> : <ExportIcon />}{t(exporting ? 'audit.exporting' : 'audit.export')}
          </button>
        </div>
      </div>
      <div className="table-card">
        <div className="flex flex-wrap items-start gap-4 border-b border-[#f3f4f6] px-5 py-3.5">
          <Filter label={t('audit.search')} className="min-w-[260px] flex-1">
            {(props) => (
              <div className="register-search !w-full">
                <SearchIcon />
                <input {...props} type="search" maxLength={200} placeholder={t('audit.searchHint')}
                  value={filters.search} onChange={change('search')} />
              </div>
            )}
          </Filter>
          <Filter label={t('audit.action')} error={fieldErrors.actionType}>
            {(props) => (
              <select {...props} className="table-field min-w-[140px] max-w-[260px]" value={filters.actionType}
                onChange={change('actionType')}>
                <option value="">{t('audit.allActions')}</option>
                {actionTypes.map((type) => <option key={type} value={type}>{t(`actions.${type}`)}</option>)}
              </select>
            )}
          </Filter>
          <Filter label={t('audit.from')} error={fieldErrors.from}>
            {(props) => <input {...props} type="date" className="table-field min-w-[130px]" value={filters.from} onChange={change('from')} />}
          </Filter>
          <Filter label={t('audit.to')} error={fieldErrors.to}>
            {(props) => <input {...props} type="date" className="table-field min-w-[130px]" value={filters.to} onChange={change('to')} />}
          </Filter>
        </div>
        <FormError code={error} className="px-5 py-3" />
        {!data ? (!error && <p className="p-5 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>) : (
          <>
            <GridTable label={t('audit.title')} template={TEMPLATE} minWidth={MIN_WIDTH}
              columns={COLUMNS.map((c) => [c, t(`audit.${c}`)])} rows={rows} empty={t('audit.empty')} />
            <RangePages page={view.page} pageSize={view.pageSize} total={data.total} items="logs"
              onPageChange={(page) => goTo({ page })}
              onPageSizeChange={(pageSize) => goTo({ page: 1, pageSize })} />
          </>
        )}
      </div>
    </section>
  );
}
