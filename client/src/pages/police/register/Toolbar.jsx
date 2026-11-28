// Status tabs with counts, and the Sort and Filter menus.
import { useLanguage } from '../../../context/LanguageContext';
import { BookmarkIcon, CheckCircleIcon, ClockIcon, FilterIcon, FolderIcon, SortIcon } from '../../../components/table/icons';
import Menu, { MenuHeading, MenuItem } from '../../../components/table/Menu';
import { TabBar } from '../../../components/table/parts';
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
      <TabBar label={t('register.status')} value={view.status} counts={counts} onChange={(status) => update({ status })}
        tabs={TABS.map(([status, name, TabIcon]) => [status, t(`register.tabs.${name}`), TabIcon])} />
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
