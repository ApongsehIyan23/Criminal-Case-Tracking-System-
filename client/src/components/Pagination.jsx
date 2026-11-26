import { useLanguage } from '../context/LanguageContext';
import { Icon } from './ui';

export const PAGE_SIZES = [5, 10, 20];

// Current page with its neighbours, plus the first and last page.
export function pageNumbers(page, totalPages) {
  const wanted = [1, page - 1, page, page + 1, totalPages].filter((n) => n >= 1 && n <= totalPages);
  const sorted = [...new Set(wanted)].sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1] > 1 ? [`gap-${n}`, n] : [n]));
}

// Pattern B table footer.
export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const { t } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total);
  const end = Math.min(page * pageSize, total);

  return (
    <nav aria-label={t('pagination.label')}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-300 bg-neutral-50 px-5 py-3 text-sm">
      <div className="flex items-center gap-4">
        <span data-testid="range" className="text-xs font-medium text-neutral-600">{t('pagination.range', { start, end, total })}</span>
        <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
          {t('pagination.rows')}
          <select
            className="h-8 rounded border border-neutral-300 bg-white px-2 text-xs text-neutral-900"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" className="btn h-8 px-2.5 text-xs" disabled={page <= 1} onClick={() => onPageChange(page - 1)}
          aria-label={t('pagination.previous')} title={t('pagination.previous')}>
          <Icon name="chevron-left" />
        </button>
        {pageNumbers(page, totalPages).map((n) => (typeof n === 'number' ? (
          <button key={n} type="button"
            className={`h-8 min-w-8 rounded border px-2 text-xs font-semibold ${
              n === page ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'}`}
            aria-current={n === page ? 'page' : undefined} aria-label={t('pagination.page', { page: n })}
            onClick={() => onPageChange(n)}>
            {n}
          </button>
        ) : <span key={n} className="px-1 text-neutral-400">…</span>))}
        <button type="button" className="btn h-8 px-2.5 text-xs" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}
          aria-label={t('pagination.next')} title={t('pagination.next')}>
          <Icon name="chevron-right" />
        </button>
      </div>
    </nav>
  );
}
