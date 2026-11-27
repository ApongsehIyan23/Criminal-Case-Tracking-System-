// Sidebar navigation, expanded (240px) or icon-only (56px). Every command of the
// workspace is here: pages, language, session timer, help, log out and profile.
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { api, tokenStore } from '../../lib/api';
import { formatCountdown, useSessionCountdown } from '../../lib/useSessionCountdown';
import HelpPanel from '../HelpPanel';
import {
  Avatar, CasesIcon, ChevronRight, ClockIcon, CollapseIcon, DashboardIcon, EvidenceIcon, GlobeIcon,
  HelpIcon, LogOutIcon, Logo, NewCaseIcon,
} from './icons';

const STORAGE_KEY = 'ccts.sidebar';
const ROW = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm';
const SQUARE = 'my-0.5 flex h-10 w-10 items-center justify-center rounded-[10px]';
const FOCUS = 'focus-visible:!outline-white';

// One row: a link when `to` is given, otherwise a button.
function NavItem({ collapsed, icon: ItemIcon, label, to, active, onClick, children, ...rest }) {
  const tone = active
    ? 'bg-white font-medium text-[#1a1a1a]'
    : `hover:bg-white/10 ${collapsed ? 'text-white/55' : 'text-white/75'}`;
  const props = {
    className: `${collapsed ? SQUARE : ROW} ${tone} ${FOCUS}`,
    title: collapsed ? label : undefined,
    'aria-label': collapsed ? label : undefined,
    ...rest,
  };
  const content = (
    <>
      <ItemIcon size={collapsed ? 18 : 16} active={active} />
      {!collapsed && (children || label)}
    </>
  );
  return to
    ? <Link to={to} aria-current={active ? 'page' : undefined} {...props}>{content}</Link>
    : <button type="button" onClick={onClick} {...props}>{content}</button>;
}

function Section({ collapsed, label, children }) {
  if (collapsed) return <div className="flex flex-col items-center">{children}</div>;
  return (
    <div className="px-3 py-1">
      {label && <p className="px-1 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.5px] text-white/40">{label}</p>}
      {children}
    </div>
  );
}

function SessionItem({ collapsed }) {
  const { t } = useLanguage();
  const { timeout } = useAuth();
  const time = formatCountdown(useSessionCountdown(tokenStore.deadline(), timeout));
  return (
    <div role="timer" aria-label={t('nav.session')} title={t('nav.session')}
      className={collapsed
        ? 'my-0.5 flex w-12 flex-col items-center gap-0.5 py-1.5 text-white/55'
        : `${ROW} text-white/75`}>
      <ClockIcon size={collapsed ? 18 : 16} />
      <span className={`tabular-nums ${collapsed ? 'text-[10px]' : ''}`}>{time}</span>
    </div>
  );
}

function LanguageItem({ collapsed }) {
  const { language, setLanguage, t } = useLanguage();
  const choose = (code) => {
    setLanguage(code);
    // Remembered on the account for emails and the next sign-in.
    api.patch('/auth/language', { language: code }).catch(() => {});
  };
  const other = language === 'EN' ? 'FR' : 'EN';

  if (collapsed) {
    return <NavItem collapsed icon={GlobeIcon} label={`${t('language.label')}: ${language} → ${other}`} onClick={() => choose(other)} />;
  }
  return (
    <div role="group" aria-label={t('language.label')} className={`${ROW} text-white/75`}>
      <GlobeIcon />
      <span className="flex items-center gap-1.5">
        {['EN', 'FR'].map((code) => (
          <button key={code} type="button" aria-pressed={language === code} title={t(`language.${code}`)}
            onClick={() => choose(code)}
            className={`rounded px-1.5 py-0.5 ${FOCUS} ${language === code
              ? 'bg-white text-[11px] font-semibold text-[#1a1a1a]' : 'text-xs text-white/40 hover:text-white'}`}>
            {code}
          </button>
        ))}
      </span>
    </div>
  );
}

function Profile({ collapsed }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`relative ${collapsed ? 'pb-2 pt-2.5' : 'border-t border-white/[0.08]'}`}>
      {open && (
        <div role="region" aria-label={t('nav.profile')}
          className={`absolute z-10 w-56 rounded-lg border border-neutral-300 bg-white p-3 text-[#1a1a1a] shadow-lg ${
            collapsed ? 'bottom-2 left-12' : 'bottom-full left-2 mb-1'}`}>
          <p className="text-xs text-neutral-500">{t('nav.profile')}</p>
          <p className="mt-1 text-sm font-semibold">{user.fullName}</p>
          <p className="break-all text-xs text-neutral-600">{user.email}</p>
          <p className="mt-1 text-xs text-neutral-600">{t(`roles.${user.role}`)}</p>
        </div>
      )}
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        aria-label={`${t('nav.profile')}: ${user.fullName}`}
        className={`flex items-center text-left ${FOCUS} ${collapsed ? 'rounded-full' : 'w-full gap-2.5 px-4 py-3.5'}`}>
        <Avatar />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-white">{user.fullName}</span>
              <span className="block truncate text-[11px] text-white/45">{t(`roles.${user.role}`)}</span>
            </span>
            <ChevronRight />
          </>
        )}
      </button>
    </div>
  );
}

// Which entry is highlighted for the page being shown.
function activeKey(pathname) {
  if (pathname === '/police') return 'dashboard';
  if (pathname.startsWith('/police/cases/new')) return 'logCase';
  if (pathname.startsWith('/police/cases')) return 'cases';
  if (pathname.startsWith('/police/evidence')) return 'evidence';
  return '';
}

const PAGES = [
  { key: 'dashboard', to: '/police', icon: DashboardIcon },
  { key: 'cases', to: '/police/cases', icon: CasesIcon },
  { key: 'evidence', to: '/police/evidence', icon: EvidenceIcon },
  { key: 'logCase', to: '/police/cases/new', icon: NewCaseIcon },
];

export default function Sidebar() {
  const { t } = useLanguage();
  const { user, logout, status } = useAuth();
  const active = activeKey(useLocation().pathname);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'collapsed');
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'expanded'); }, [collapsed]);

  return (
    <>
      <aside data-collapsed={collapsed}
        className={`z-30 shrink-0 self-stretch bg-[#1a1a1a] font-['Inter_Variable',Inter,sans-serif] text-white transition-all duration-200 ${
          collapsed ? 'w-[56px]' : 'w-[240px]'}`}>
        <div className={`sticky top-0 flex h-screen min-h-[600px] flex-col ${collapsed ? 'items-center py-2' : ''}`}>
        {collapsed ? (
          // The icon-only design has no separate toggle, so the logo expands the sidebar.
          <button type="button" className={`pb-4 pt-[10px] ${FOCUS}`} onClick={() => setCollapsed(false)}
            aria-label={t('sidebar.expand')} title={t('sidebar.expand')}>
            <Logo large />
          </button>
        ) : (
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <span className="flex items-center gap-2" title={t('app.title')}>
              <Logo />
              <span className="text-[13px] font-semibold leading-tight">{t('app.short')}</span>
            </span>
            <button type="button" className={`opacity-50 hover:opacity-100 ${FOCUS}`} onClick={() => setCollapsed(true)}
              aria-label={t('sidebar.collapse')} title={t('sidebar.collapse')}>
              <CollapseIcon />
            </button>
          </div>
        )}

        <nav aria-label={t('sidebar.navigation')}>
          <Section collapsed={collapsed} label={t('sidebar.navigation')}>
            {PAGES.map((page) => (
              <NavItem key={page.key} collapsed={collapsed} icon={page.icon} to={page.to}
                active={active === page.key} label={t(`sidebar.${page.key}`)} />
            ))}
          </Section>
        </nav>
        {collapsed && <div className="h-2" />}
        <Section collapsed={collapsed} label={t('language.label')}>
          <LanguageItem collapsed={collapsed} />
        </Section>
        {status === 'active' && (
          <Section collapsed={collapsed} label={t('sidebar.session')}>
            <SessionItem collapsed={collapsed} />
          </Section>
        )}

        <div className="min-h-4 flex-1" />

        <Section collapsed={collapsed}>
          <NavItem collapsed={collapsed} icon={HelpIcon} label={t('nav.help')} onClick={() => setHelpOpen(true)} />
          <NavItem collapsed={collapsed} icon={LogOutIcon} label={t('nav.logout')} onClick={logout} />
        </Section>
        <Profile collapsed={collapsed} />
        </div>
      </aside>
      {helpOpen && <HelpPanel role={user.role} onClose={closeHelp} />}
    </>
  );
}
