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

  if (status === 'active') return <Navigate to={homeFor(user.role)} replace />;

  const message = (state?.activated && t('login.activated')) || (status === 'expired' && t('login.expired'));

  return (
    <AuthShell title={t('login.title')}
      banner={message && <Notice className="mb-4" title={t('common.confirmation')}>{message}</Notice>}>
      <LoginForm />
    </AuthShell>
  );
}
