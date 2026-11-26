import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LoginForm from './LoginForm';
import { Icon, LanguageSwitcher, Notice } from './ui';

// Blocking and opaque: nothing from the previous session can be read behind it.
export default function ReauthModal() {
  const { t } = useLanguage();
  const { leave } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-100 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="reauth-title" className="card w-full max-w-md space-y-4">
        <div className="flex justify-end"><LanguageSwitcher /></div>
        <h2 id="reauth-title" className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="lock" />{t('reauth.title')}
        </h2>
        <Notice icon="clock">{t('reauth.body')}</Notice>
        <LoginForm />
        <button type="button" className="btn w-full" onClick={() => { leave(); navigate('/login'); }}>
          <Icon name="arrow-left" />{t('reauth.leave')}
        </button>
      </div>
    </div>
  );
}
