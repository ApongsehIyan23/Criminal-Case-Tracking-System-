import { Navigate, useLocation } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import LoginForm from '../components/LoginForm';
import { Notice } from '../components/ui';
import { homeFor, useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Login() {
  const { t } = useLanguage();
  const { status, user } = useAuth();
  const { state } = useLocation();

  if (status === 'active') {
    const home = homeFor(user.role);
    // Back to where the session ended, but only for the same user.
    const resume = state?.userId === user.userId && state?.from?.startsWith(home);
    return <Navigate to={resume ? state.from : home} replace />;
  }

  const message = (state?.activated && t('login.activated'))
    || (state?.passwordReset && t('login.passwordReset'))
    || (status === 'expired' && t('login.expired'));

  return (
    <AuthShell title={t('login.title')} hideTitle
      banner={message && <Notice className="mb-4" title={t('common.confirmation')}>{message}</Notice>}>
      <LoginForm />
    </AuthShell>
  );
}
