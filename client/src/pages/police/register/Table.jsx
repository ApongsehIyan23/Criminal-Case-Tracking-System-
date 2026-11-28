import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../context/LanguageContext';
import { formatRemaining, isUrgent } from '../../../lib/custody';
import { DotsIcon, PersonIcon } from '../../../components/table/icons';
import Menu, { MenuItem } from '../../../components/table/Menu';
import { Badge, SelectAll } from '../../../components/table/parts';
import { COLUMNS, TABLE_WIDTH } from './options';

const RECORD_COLORS = { ACTIVE: 'bg-[#fef3c7] text-[#b45309]', CLOSED: 'bg-[#dcfce7] text-[#15803d]' };
const DOCKET_COLORS = {
  IN_INVESTIGATION: 'bg-[#dcfce7] text-[#15803d]',
  TRANSMITTED_TO_MAGISTRATE: 'bg-[#e0f2fe] text-[#0369a1]',
  MANDATE_ISSUED: 'bg-[#ede9fe] text-[#7c3aed]',
};
function RowActions({ item }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const docket = `/police/cases/${item.caseId}`;
  const go = (close, to, options) => { close(false); navigate(to, options); };
  return (
    <Menu label={t('register.actionsFor', { caseId: item.caseId })} button={<DotsIcon />}
      buttonClassName="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#f3f4f6]">
      {(close) => (
        <>
          <MenuItem onSelect={() => go(close, docket)}>{t('police.openCase')}</MenuItem>
          {['evidence', 'custody', 'audit'].map((tab) => (
            <MenuItem key={tab} onSelect={() => go(close, `${docket}?tab=${tab}`)}>{t(`docket.tabs.${tab}`)}</MenuItem>
          ))}
          {item.status === 'IN_INVESTIGATION' && (
            // Opens the review that must be read before a case is transmitted.
            <MenuItem onSelect={() => go(close, docket, { state: { transmit: true } })}>{t('docket.transmit')}</MenuItem>
          )}
        </>
      )}
    </Menu>
  );
}

export default function Table({ items, view, now, selected, onSelect, onSort }) {
  const { t, language } = useLanguage();
  const created = new Intl.DateTimeFormat(language === 'FR' ? 'fr-FR' : 'en-US',
    { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Africa/Douala' });
  const ids = items.map((item) => item.caseId);
  const chosen = ids.filter((id) => selected.includes(id)).length;
  const toggle = (id) => onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <table className="register-table" data-roomy={view.pageSize === 5} style={{ minWidth: TABLE_WIDTH }}>
      <caption className="sr-only">{t('register.title')}</caption>
      <colgroup>
        {COLUMNS.map((c) => <col key={c.id} style={{ width: `${(c.width / TABLE_WIDTH) * 100}%` }} />)}
      </colgroup>
      <thead>
        <tr>
          {COLUMNS.map((column) => {
            if (column.id === 'select') {
              return (
                <th key={column.id}>
                  <SelectAll label={t('register.selectAll')} checked={ids.length > 0 && chosen === ids.length}
                    partly={chosen > 0 && chosen < ids.length} disabled={!ids.length}
                    onChange={() => onSelect(chosen === ids.length ? [] : ids)} />
                </th>
              );
            }
            const sorted = column.sort && view.sort === column.sort ? view.dir : null;
            const name = t(`register.columns.${column.id}`);
            return (
              <th key={column.id} aria-sort={sorted ? `${sorted === 'asc' ? 'ascending' : 'descending'}` : undefined}>
                {column.sort ? (
                  <button type="button" className="flex items-center gap-1 text-left uppercase" onClick={() => onSort(column.sort)}>
                    {name}
                    <span aria-hidden="true" className={sorted ? 'text-[#1a1a1a]' : 'text-[#9ca3af]'}>
                      {(sorted === 'asc' && '↑') || (sorted === 'desc' && '↓') || '↕'}
                    </span>
                  </button>
                ) : name}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const urgent = item.custodyExpiresAt && isUrgent(item.custodyExpiresAt, now);
          const suspects = item.suspects.join(', ') || '—';
          return (
            <tr key={item.caseId}>
              <td>
                <input type="checkbox" className="register-check" aria-label={t('register.select', { caseId: item.caseId })}
                  checked={selected.includes(item.caseId)} onChange={() => toggle(item.caseId)} />
              </td>
              <td>
                <Link className="block whitespace-nowrap text-[13px] font-semibold text-[#1a1a1a] hover:underline"
                  to={`/police/cases/${item.caseId}`}>
                  {item.caseId}
                </Link>
                <p className="mt-0.5 text-[11px] text-[#9ca3af]">
                  {t('register.createdOn', { date: created.format(new Date(item.createdAt)) })}
                </p>
              </td>
              <td>
                <p className="break-words pr-3 text-[13px] font-semibold text-[#1a1a1a]">{item.incidentTitle}</p>
                <p className="mt-0.5 flex items-center gap-1 pr-3 text-[11px] text-[#9ca3af]" title={suspects}>
                  <PersonIcon /><span className="truncate">{suspects}</span>
                </p>
              </td>
              {/* Red is kept for deadlines under 2 hours. */}
              <td className={`register-timer ${urgent ? '!text-[#dc2626]' : ''}`}
                title={urgent ? t('custody.urgent') : undefined}>
                {item.custodyExpiresAt ? formatRemaining(item.custodyExpiresAt, now) : '—'}
              </td>
              <td>{item.evidenceCount}</td>
              <td><Badge colors={RECORD_COLORS[item.record]}>{t(`register.records.${item.record.toLowerCase()}`)}</Badge></td>
              <td><Badge colors={DOCKET_COLORS[item.status]}>{t(`caseStatus.${item.status}`)}</Badge></td>
              <td className="text-center"><RowActions item={item} /></td>
            </tr>
          );
        })}
        {!items.length && (
          <tr><td colSpan={COLUMNS.length} className="!py-16 text-center !text-[#6b7280]">{t('register.empty')}</td></tr>
        )}
      </tbody>
    </table>
  );
}
