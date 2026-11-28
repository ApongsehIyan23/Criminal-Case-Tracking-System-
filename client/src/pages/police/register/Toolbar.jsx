// Status tabs with counts, and the Sort and Filter menus.
import { useLanguage } from '../../../context/LanguageContext';
import { BookmarkIcon, CheckCircleIcon, ClockIcon, FilterIcon, FolderIcon, SortIcon } from './icons';
import Menu, { MenuHeading, MenuItem } from './Menu';
import { CUSTODY_FILTERS, RECORD_FILTERS, SORT_CHOICES } from './options';

const TABS = [
  ['', 'all', FolderIcon],
  ['IN_INVESTIGATION', 'investigation', ClockIcon],
  ['TRANSMITTED_TO_MAGISTRATE', 'transmitted', BookmarkIcon],
  ['MANDATE_ISSUED', 'mandate', CheckCircleIcon],
];

export default function Toolbar({ view, counts, update }) {
  const { t } = useLanguage();
  const filters = [view.record, view.custody].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
      <div role="group" aria-label={t('register.status')} className="flex flex-wrap items-center gap-6">
        {TABS.map(([status, name, TabIcon]) => {
          const active = view.status === status;
          return (
            <button key={name} type="button" aria-pressed={active} onClick={() => update({ status })}
              className={`flex items-center gap-1.5 border-b-2 pb-0.5 ${
                active ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#374151] opacity-60 hover:opacity-100'}`}>
              <TabIcon />
              <span className={`text-[13px] ${active ? 'font-semibold' : 'font-medium'}`}>{t(`register.tabs.${name}`)}</span>
              {' '}
              <span className={`rounded-[10px] px-[7px] py-px text-[11px] ${
                active ? 'bg-[#1a1a1a] font-semibold text-white' : 'bg-[#f3f4f6] font-medium text-[#374151]'}`}>
                {counts ? counts[status || 'ALL'] : '…'}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2.5">
        <Menu buttonClassName="register-button" button={<><SortIcon />{t('register.sort')}</>}>
          {(close) => SORT_CHOICES.map(([name, sort, dir]) => (
            <MenuItem key={name} checked={view.sort === sort && view.dir === dir}
              onSelect={() => { update({ sort, dir }); close(); }}>
              {t(`register.sorts.${name}`)}
            </MenuItem>
          ))}
        </Menu>
        <Menu buttonClassName="register-button" button={(
          <>
            <FilterIcon />{t('register.filter')}
            {filters > 0 && (
              <span className="rounded-[10px] bg-[#1a1a1a] px-[7px] py-px text-[11px] font-semibold text-white">{filters}</span>
            )}
          </>
        )}>
          {(close) => (
            <>
              <MenuHeading>{t('register.columns.record')}</MenuHeading>
              {RECORD_FILTERS.map(([name, record]) => (
                <MenuItem key={name} checked={view.record === record} onSelect={() => { update({ record }); close(); }}>
                  {t(`register.records.${name}`)}
                </MenuItem>
              ))}
              <MenuHeading>{t('register.custodyFilter')}</MenuHeading>
              {CUSTODY_FILTERS.map(([name, custody]) => (
                <MenuItem key={name} checked={view.custody === custody} onSelect={() => { update({ custody }); close(); }}>
                  {t(`register.custodies.${name}`)}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}
