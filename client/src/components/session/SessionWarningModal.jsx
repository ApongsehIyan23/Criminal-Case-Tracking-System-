// Shown while there is still time: continue (restarts the 15 minutes) or log out.
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatCountdown } from '../../lib/useSessionCountdown';
import { FormError } from '../ui';
import ModalCard, { OUTLINE, PRIMARY } from './ModalCard';

export default function SessionWarningModal({ remaining }) {
  const { t } = useLanguage();
  const { extend, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // The close button means the same as "Continue session".
  async function keepGoing() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await extend();
    } catch (e) {
      setError(e.code || 'SERVER_ERROR');
      setBusy(false);
    }
  }

  return (
    <ModalCard backdrop="bg-black/30" titleId="session-warning" onClose={keepGoing}>
      <h2 id="session-warning" className="mb-4 text-xl font-bold text-[#1a2035]">{t('session.warningTitle')}</h2>
      <p className="mb-6 text-[15px] leading-relaxed text-[#6b7280]">{t('session.warningBody')}</p>
      <div className="mb-7 text-center">
        <span data-testid="warning-countdown" className="text-4xl font-bold tabular-nums tracking-[2px] text-[#1a2035]">
          {formatCountdown(remaining)}
        </span>
      </div>
      <FormError code={error} className="mb-4 text-center" />
      <div className="flex gap-4">
        <button type="button" className={`flex-1 ${OUTLINE}`} onClick={logout}>{t('session.logoutNow')}</button>
        <button type="button" className={`flex-1 ${PRIMARY}`} disabled={busy} onClick={keepGoing}>{t('session.continue')}</button>
      </div>
    </ModalCard>
  );
}
