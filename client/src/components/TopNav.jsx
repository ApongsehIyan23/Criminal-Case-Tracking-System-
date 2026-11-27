import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSessionRemaining } from '../context/SessionContext';
import { api } from '../lib/api';
import { formatCountdown } from '../lib/useSessionCountdown';
import HelpPanel from './HelpPanel';
import { Icon, LanguageSwitcher } from './ui';

function SessionCountdown() {
  const { t } = useLanguage();
  const remaining = useSessionRemaining();
  return (
    <div role="timer" className="flex items-center gap-2 border-l border-neutral-300 pl-5 text-sm">
      <Icon name="hourglass-half" className="text-neutral-500" />
      <span className="text-neutral-500">{t('nav.session')}</span>
      <span className="w-11 font-mono font-semibold tabular-nums">{formatCountdown(remaining)}</span>
    </div>
  );
}

export default function TopNav() {
  const { t } = useLanguage();
  const { user, logout, status } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // Remembers the choice on the account for emails and the next sign-in.
  const saveLanguage = (language) => { api.patch('/auth/language', { language }).catch(() => {}); };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-neutral-300 bg-white">
        <div className="flex h-16 items-center gap-5 px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{t('app.title')}</p>
          </div>
          <LanguageSwitcher onChange={saveLanguage} />
          {status === 'active' && <SessionCountdown />}
          <button type="button" className="button-secondary h-9" onClick={() => setHelpOpen(true)}>
            <Icon name="circle-question" />{t('nav.help')}
          </button>
          <div className="border-l border-neutral-300 pl-5 text-right" title={user.email}>
            <p className="text-sm font-medium">
              <Icon name="circle-user" className="mr-1.5 text-neutral-500" />
              <span className="sr-only">{t('nav.profile')} </span>
              {user.fullName}
            </p>
            <p className="text-xs text-neutral-500">{t(`roles.${user.role}`)}</p>
          </div>
          <button type="button" className="button-secondary h-9" onClick={logout}>
            <Icon name="right-from-bracket" />{t('nav.logout')}
          </button>
        </div>
      </header>
      {helpOpen && <HelpPanel role={user.role} onClose={closeHelp} />}
    </>
  );
}
