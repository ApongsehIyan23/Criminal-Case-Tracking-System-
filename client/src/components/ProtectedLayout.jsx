import { Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../context/AuthContext';
import { CustodySyncProvider } from '../context/CustodySyncContext';
import { useLanguage } from '../context/LanguageContext';
import { SessionProvider } from '../context/SessionContext';
import SessionTimeoutModal from './session/SessionTimeoutModal';
import TopNav from './TopNav';
import { Icon } from './ui';

export default function ProtectedLayout({ role, sidebar: SidebarNav, children }) {
  const { status, user } = useAuth();
  const { t } = useLanguage();

  if (status === 'loading') {
    return <p className="p-8 text-center"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>;
  }
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;

  const locked = status === 'expired';
  return (
    <SessionProvider>
      {/* Keyed by user, so another account starts clean. */}
      <div key={user.userId} inert={locked}>
        {SidebarNav ? (
          <div className="flex min-h-screen">
            <SidebarNav />
            <div className="min-w-0 flex-1">
              <CustodySyncProvider active={!locked}>{children}</CustodySyncProvider>
            </div>
          </div>
        ) : (
          <>
            <TopNav />
            <CustodySyncProvider active={!locked}>{children}</CustodySyncProvider>
          </>
        )}
      </div>
      {locked && <SessionTimeoutModal />}
    </SessionProvider>
  );
}
