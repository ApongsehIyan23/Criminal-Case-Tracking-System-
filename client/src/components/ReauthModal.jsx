import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LoginForm from './LoginForm';

// Blocking. The backdrop is opaque, unlike other dialogs, so nothing from the
// previous session can be read on a shared computer.
export default function ReauthModal() {
  const { t } = useLanguage();
  const { leave } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="modal-backdrop z-50 overflow-y-auto bg-neutral-100">
      <div role="alertdialog" aria-modal="true" aria-labelledby="reauth-title"
        className="w-full max-w-md border border-neutral-400 bg-white p-7 shadow-xl">
        <h2 id="reauth-title" className="text-xl font-semibold">{t('reauth.title')}</h2>
        <p className="mb-6 mt-2 text-sm leading-6 text-neutral-600">{t('reauth.body')}</p>
        <LoginForm />
        <button type="button" className="button-secondary mt-3 w-full" onClick={() => { leave(); navigate('/login'); }}>
          {t('reauth.leave')}
        </button>
      </div>
    </div>
  );
}
