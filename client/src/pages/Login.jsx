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

  return (
    <AuthShell title={t('login.title')}>
      {state?.activated && <Notice icon="circle-check">{t('login.activated')}</Notice>}
      {status === 'expired' && <Notice icon="clock">{t('login.expired')}</Notice>}
      <LoginForm />
    </AuthShell>
  );
}
