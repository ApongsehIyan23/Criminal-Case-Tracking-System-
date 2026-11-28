// Building blocks shared by the data tables: the case register, the incoming
// queue, the audit log and the user directory.
import { useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from './icons';

export const PAGE_SIZES = [5, 10, 20];

// Current page with its neighbours, plus the first and last page.
export function pageNumbers(page, totalPages) {
  const wanted = [1, page - 1, page, page + 1, totalPages].filter((n) => n >= 1 && n <= totalPages);
  const sorted = [...new Set(wanted)].sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1] > 1 ? [`gap-${n}`, n] : [n]));
}

// `tabs` are [value, label, Icon]. Counts are keyed by value, with 'ALL' for ''.
export function TabBar({ label, tabs, value, counts, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-6">
      {tabs.map(([tab, name, TabIcon]) => {
        const active = value === tab;
        return (
          <button key={tab} type="button" aria-pressed={active} onClick={() => onChange(tab)}
            className={`flex items-center gap-1.5 border-b-2 pb-0.5 ${
              active ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#374151] opacity-60 hover:opacity-100'}`}>
            <TabIcon />
            <span className={`text-[13px] ${active ? 'font-semibold' : 'font-medium'}`}>{name}</span>
            {' '}
            <span className={`rounded-[10px] px-[7px] py-px text-[11px] ${
              active ? 'bg-[#1a1a1a] font-semibold text-white' : 'bg-[#f3f4f6] font-medium text-[#374151]'}`}>
              {counts ? counts[tab || 'ALL'] : '…'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// `wide` makes room for a longer placeholder.
export function SearchBox({ label, placeholder, value, onChange, wide }) {
  return (
    <label className={`register-search ${wide ? '!w-[320px]' : ''}`}>
      <SearchIcon />
      <input type="search" maxLength={200} value={value} aria-label={label} placeholder={placeholder} title={placeholder}
        onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function PageSizeSelect({ value, onChange }) {
  const { t } = useLanguage();
  return (
    <select aria-label={t('pagination.rows')} value={value}
      className="rounded border border-[#d1d5db] bg-white px-1.5 py-0.5 text-[13px] text-[#374151]"
      onChange={(event) => onChange(Number(event.target.value))}>
      {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
    </select>
  );
}

// "Showing [5] of 8 results", with the number of selected rows beside it.
export function ResultsSummary({ pageSize, total, onPageSizeChange, selected = 0, onClear }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-4 text-[13px] text-[#6b7280]">
      {selected > 0 && (
        <span role="status" className="flex items-center gap-2">
          {t('register.selected', { count: selected })}
          <button type="button" className="font-medium text-[#374151] underline" onClick={onClear}>
            {t('register.clear')}
          </button>
        </span>
      )}
      <span className="flex items-center gap-1.5">
        {t('register.showing')}
        <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
        <span data-testid="results">
          {t('register.of')} <strong className="text-[#374151]">{total}</strong>
        </span>
      </span>
    </div>
  );
}

function PageButtons({ page, totalPages, onChange }) {
  const { t } = useLanguage();
  const arrow = 'register-page !text-[#9ca3af]';
  return (
    <>
      <button type="button" className={arrow} aria-label={t('pagination.previous')} disabled={page <= 1}
        onClick={() => onChange(page - 1)}>
        <ChevronLeftIcon />
      </button>
      {pageNumbers(page, totalPages).map((n) => (typeof n === 'number' ? (
        <button key={n} type="button" className="register-page" aria-current={n === page ? 'page' : undefined}
          aria-label={t('pagination.page', { page: n })} onClick={() => onChange(n)}>
          {n}
        </button>
      ) : <span key={n} className="flex h-8 w-8 items-center justify-center text-[13px] text-[#9ca3af]">…</span>))}
      <button type="button" className={arrow} aria-label={t('pagination.next')} disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}>
        <ChevronRightIcon />
      </button>
    </>
  );
}

// Page buttons centred under the table.
export function CenteredPages(props) {
  const { t } = useLanguage();
  return (
    <nav aria-label={t('pagination.label')} className="flex items-center justify-center gap-1 border-t border-[#e5e7eb] px-5 py-4">
      <PageButtons {...props} />
    </nav>
  );
}

// "Showing 1–5 of 384 logs · Rows per page" on the left, page buttons on the
// right. `items` names what is being counted.
export function RangePages({ page, pageSize, total, items, onPageChange, onPageSizeChange }) {
  const { t } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total);
  const end = Math.min(page * pageSize, total);
  return (
    <nav aria-label={t('pagination.label')}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] px-5 py-4">
      <div className="flex items-center gap-1.5 text-[13px] text-[#6b7280]">
        <span data-testid="range">
          {t('pagination.showing', { start, end })}{' '}
          <strong className="text-[#374151]">{total} {t(`pagination.items.${items}`)}</strong>
        </span>
        <span aria-hidden="true">·</span>
        {t('pagination.rows')}
        <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
      </div>
      <div className="flex gap-1">
        <PageButtons page={page} totalPages={totalPages} onChange={onPageChange} />
      </div>
    </nav>
  );
}

export const Badge = ({ colors, children }) => (
  <span className={`inline-block rounded-xl px-2.5 py-[3px] text-[11px] font-medium ${colors}`}>{children}</span>
);

export function SelectAll({ checked, partly, disabled, onChange, label }) {
  const box = useRef(null);
  useEffect(() => { box.current.indeterminate = partly; }, [partly]);
  return (
    <input ref={box} type="checkbox" className="register-check" aria-label={label} checked={checked}
      disabled={disabled} onChange={onChange} />
  );
}

// A table laid out on the design's grid template. `columns` are [id, header] and
// each row is { key, cells }. It scrolls sideways below `minWidth`.
export function GridTable({ label, template, minWidth, columns, rows, empty }) {
  const style = { gridTemplateColumns: template };
  return (
    <div className="overflow-x-auto">
      <div role="table" aria-label={label} className="grid-table" style={{ minWidth }}>
        <div role="rowgroup">
          <div role="row" className="grid-row grid-head" style={style}>
            {columns.map(([id, header]) => <div role="columnheader" key={id}>{header}</div>)}
          </div>
        </div>
        <div role="rowgroup" className="grid-body">
          {rows.map((row) => (
            <div role="row" key={row.key} className="grid-row" style={style}>
              {row.cells.map((cell, index) => <div role="cell" key={columns[index][0]}>{cell}</div>)}
            </div>
          ))}
          {!rows.length && (
            <div role="row" className="grid-row">
              <div role="cell" aria-colspan={columns.length} className="!py-16 text-center !text-[#6b7280]">{empty}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
