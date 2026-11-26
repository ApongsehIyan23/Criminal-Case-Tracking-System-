// Read-only view: it offers search, filters, paging and export, and nothing that edits.
import { useEffect, useState } from 'react';
import Pagination from '../../components/Pagination';
import { Field, FormError, Icon, PageHeader } from '../../components/ui';
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
    <section>
      <PageHeader title={t('audit.title')}
        badge={<span className="status"><Icon name="lock" className="mr-1.5" />{t('audit.readOnly')}</span>}>
        <button type="button" className="button-secondary"
          onClick={() => setView((v) => ({ ...v, page: 1, asOf: '', version: v.version + 1 }))}>
          <Icon name="rotate-right" />{t('common.refresh')}
        </button>
        <button type="button" className="button-primary" disabled={exporting} onClick={exportCsv}>
          <Icon name={exporting ? 'spinner fa-spin' : 'file-export'} />{t(exporting ? 'audit.exporting' : 'audit.export')}
        </button>
      </PageHeader>
      <div className="mt-7 grid grid-cols-[minmax(260px,1fr)_210px_160px_160px] items-start gap-4 border border-neutral-300 bg-white p-4">
        <Field label={t('audit.search')} leading={<Icon name="magnifying-glass" />}>
          {(props) => <input {...props} type="search" maxLength={200} placeholder={t('audit.searchHint')}
            value={filters.search} onChange={change('search')} />}
        </Field>
        <Field label={<><Icon name="filter" className="mr-1.5" />{t('audit.action')}</>} error={fieldErrors.actionType}>
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
      <FormError code={error} className="mt-3" />
      {!data ? (!error && <p className="mt-5 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>) : (
        <div className="mt-5 border border-neutral-300 bg-white">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>{['time', 'actor', 'action', 'caseId', 'details', 'ip'].map((c) => <th key={c}>{t(`audit.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {data.items.map((log) => (
                  <tr key={log.logId}>
                    <td className="whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td>
                      <div>{log.actorEmail}</div>
                      <div className="text-xs text-neutral-500">{t(`roles.${log.actorRole}`)}</div>
                    </td>
                    <td><span className="status" title={log.actionType}>{t(`actions.${log.actionType}`)}</span></td>
                    <td className="font-mono text-xs">{log.caseId || '—'}</td>
                    <td className="min-w-[260px] max-w-sm break-all font-mono text-xs">{log.details ? JSON.stringify(log.details) : '—'}</td>
                    <td>{log.ipAddress || '—'}</td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-neutral-500">{t('audit.empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={view.page} pageSize={view.pageSize} total={data.total} items="logs"
            onPageChange={(page) => goTo({ page })}
            onPageSizeChange={(pageSize) => goTo({ page: 1, pageSize })} />
        </div>
      )}
    </section>
  );
}
