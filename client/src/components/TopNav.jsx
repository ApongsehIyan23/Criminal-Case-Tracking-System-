import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';
import { formatCountdown, useInactivity } from '../lib/useInactivity';
import HelpPanel from './HelpPanel';
import { Icon, LanguageSwitcher } from './ui';

function SessionCountdown() {
  const { t } = useLanguage();
  const { timeout } = useAuth();
  const heartbeat = useCallback(() => { api.post('/auth/activity').catch(() => {}); }, []);
  const remaining = useInactivity({ onTimeout: timeout, onHeartbeat: heartbeat });
  return (
    <span className="pill" role="timer">
      <Icon name="hourglass-half" />
      {t('nav.session')} <span className="font-mono tabular-nums">{formatCountdown(remaining)}</span>
    </span>
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
    <header className="sticky top-0 z-20 border-b border-neutral-300 bg-white">
      <div className="flex h-16 flex-wrap items-center gap-5 px-6 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight">{t('app.title')}</p>
        </div>
        <LanguageSwitcher onChange={saveLanguage} />
        {status === 'active' && (
          <div className="flex items-center gap-2 border-l border-neutral-300 pl-5">
            <SessionCountdown />
          </div>
        )}
        <button type="button" className="btn" onClick={() => setHelpOpen(true)}>
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
        <button type="button" className="btn" onClick={logout}>
          <Icon name="right-from-bracket" />{t('nav.logout')}
        </button>
      </div>
      {helpOpen && <HelpPanel role={user.role} onClose={closeHelp} />}
    </header>
  );
}
