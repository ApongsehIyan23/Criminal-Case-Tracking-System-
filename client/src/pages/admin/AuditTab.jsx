// Read-only view: it offers search, filters, paging and export, and nothing that edits.
import { useEffect, useState } from 'react';
import Pagination from '../../components/Pagination';
import { Field, FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api, query } from '../../lib/api';

const NO_FILTERS = { search: '', actionType: '', from: '', to: '' };

export default function AuditTab() {
  const { t, language, formatDateTime } = useLanguage();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [view, setView] = useState({ filters: NO_FILTERS, page: 1, pageSize: 5, asOf: '', version: 0 });
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
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      setFieldErrors(e.fields || {});
      setError(e.code || 'SERVER_ERROR');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon name="clipboard-list" />{t('audit.title')}
          <span className="pill"><Icon name="lock" />{t('audit.readOnly')}</span>
        </h2>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setView((v) => ({ ...v, page: 1, asOf: '', version: v.version + 1 }))}>
            <Icon name="rotate-right" />{t('common.refresh')}
          </button>
          <button type="button" className="btn btn-primary" disabled={exporting} onClick={exportCsv}>
            <Icon name={exporting ? 'spinner fa-spin' : 'file-csv'} />{t(exporting ? 'audit.exporting' : 'audit.export')}
          </button>
        </div>
      </div>
      <div className="grid gap-3 border-b border-neutral-300 bg-neutral-50 p-5 md:grid-cols-4">
        <Field label={<><Icon name="magnifying-glass" /> {t('audit.search')}</>} hint={t('audit.searchHint')}>
          {(props) => <input {...props} type="search" maxLength={200} value={filters.search} onChange={change('search')} />}
        </Field>
        <Field label={t('audit.action')} error={fieldErrors.actionType}>
          {(props) => (
            <select {...props} value={filters.actionType} onChange={change('actionType')}>
              <option value="">{t('audit.allActions')}</option>
              {actionTypes.map((type) => <option key={type} value={type}>{t(`actions.${type}`)}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('audit.from')} error={fieldErrors.from}>
          {(props) => <input {...props} type="date" value={filters.from} onChange={change('from')} />}
        </Field>
        <Field label={t('audit.to')} error={fieldErrors.to}>
          {(props) => <input {...props} type="date" value={filters.to} onChange={change('to')} />}
        </Field>
      </div>
      <div className="px-5 pt-4 empty:pt-0">
        <FormError code={error} />
      </div>
      {!data ? (!error && <p className="p-5"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>{['time', 'actor', 'action', 'caseId', 'details', 'ip'].map((c) => <th key={c} className="th">{t(`audit.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {data.items.map((log) => (
                  <tr key={log.logId}>
                    <td className="td whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td className="td">
                      <div>{log.actorEmail}</div>
                      <div className="text-xs text-neutral-600">{t(`roles.${log.actorRole}`)}</div>
                    </td>
                    <td className="td"><span className="pill" title={log.actionType}>{t(`actions.${log.actionType}`)}</span></td>
                    <td className="td">{log.caseId || '—'}</td>
                    <td className="td max-w-sm break-words align-top font-mono text-xs">{log.details ? JSON.stringify(log.details) : '—'}</td>
                    <td className="td">{log.ipAddress || '—'}</td>
                  </tr>
                ))}
                {data.items.length === 0 && <tr><td className="td text-center" colSpan={6}>{t('audit.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={view.page} pageSize={view.pageSize} total={data.total}
            onPageChange={(page) => goTo({ page })}
            onPageSizeChange={(pageSize) => goTo({ page: 1, pageSize })} />
        </>
      )}
    </section>
  );
}
