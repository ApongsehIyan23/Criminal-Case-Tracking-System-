// Shown once the session has ended. The backdrop is opaque so nothing from the
// previous session can be read on a shared computer.
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import ModalCard, { PRIMARY } from './ModalCard';

export default function SessionTimeoutModal() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  // After signing in again, the same user returns to this page.
  const toLogin = () => navigate('/login', { state: { from: `${pathname}${search}`, userId: user.userId } });

  return (
    <ModalCard backdrop="bg-neutral-100" titleId="session-ended" onClose={toLogin} className="text-center">
      <div className="mb-4 flex justify-center">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="24" cy="24" r="22" stroke="#8b95a5" strokeWidth="2" />
          <text x="24" y="30" textAnchor="middle" fill="#8b95a5" fontSize="24" fontWeight="600">!</text>
        </svg>
      </div>
      <h2 id="session-ended" className="mb-2 text-2xl font-semibold text-[#2d3748]">{t('session.endedTitle')}</h2>
      <p className="mb-7 text-[15px] text-[#6b7280]">{t('session.endedBody')}</p>
      <button type="button" className={`w-full ${PRIMARY}`} onClick={toLogin}>{t('session.login')}</button>
    </ModalCard>
  );
}
