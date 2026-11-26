import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import AuditTab from './AuditTab';
import HealthTab from './HealthTab';
import UsersTab from './UsersTab';

const TABS = [
  { id: 'users', icon: 'users-gear', Panel: UsersTab },
  { id: 'audit', icon: 'clipboard-list', Panel: AuditTab },
  { id: 'health', icon: 'heart-pulse', Panel: HealthTab },
];

export default function AdminConsole() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const active = TABS.some((tab) => tab.id === params.get('tab')) ? params.get('tab') : 'users';
  // A tab is mounted on first visit and then kept, so its form input survives tab changes.
  const [visited, setVisited] = useState(() => new Set([active]));
  if (!visited.has(active)) setVisited(new Set([...visited, active]));

  return (
    <>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">{t('admin.console')}</h1>
      <div role="tablist" className="mb-4 flex flex-wrap gap-7 border-b border-neutral-300">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" id={`tab-${tab.id}`} aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`flex items-center gap-2 border-b-2 py-4 text-sm font-medium ${
              active === tab.id ? 'border-neutral-900 text-neutral-950' : 'border-transparent text-neutral-500 hover:text-neutral-900'}`}
            onClick={() => setParams({ tab: tab.id })}>
            <Icon name={tab.icon} />{t(`admin.tabs.${tab.id}`)}
          </button>
        ))}
      </div>
      {TABS.filter((tab) => visited.has(tab.id)).map(({ id, Panel }) => (
        <div key={id} role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={active !== id}>
          <Panel />
        </div>
      ))}
    </>
  );
}
