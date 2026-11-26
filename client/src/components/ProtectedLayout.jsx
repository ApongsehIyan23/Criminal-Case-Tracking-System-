import { Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../context/AuthContext';
import { CustodySyncProvider } from '../context/CustodySyncContext';
import { useLanguage } from '../context/LanguageContext';
import ReauthModal from './ReauthModal';
import TopNav from './TopNav';
import { Icon } from './ui';

export default function ProtectedLayout({ role, children }) {
  const { status, user } = useAuth();
  const { t } = useLanguage();

  if (status === 'loading') {
    return <p className="p-8 text-center"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>;
  }
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;

  const locked = status === 'expired';
  return (
    <>
      {/* Keyed by user: resuming keeps form contents, another account starts clean. */}
      <div key={user.userId} inert={locked}>
        <TopNav />
        <CustodySyncProvider active={!locked}>{children}</CustodySyncProvider>
      </div>
      {locked && <ReauthModal />}
    </>
  );
}
