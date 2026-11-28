import { Link, useNavigate } from 'react-router-dom';
import LinkTokenPage from '../components/LinkTokenPage';
import NewPasswordForm from '../components/NewPasswordForm';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';

export default function ResetPassword() {
  const { t } = useLanguage();
  const { leave } = useAuth();
  const navigate = useNavigate();

  return (
    <LinkTokenPage title={t('reset.title')} verifyPath="/auth/password-reset/verify" invalidCode="RESET_INVALID"
      invalid={(
        <>
          <p>{t('errors.RESET_INVALID')}</p>
          <Link to="/forgot-password" className="auth-button mt-5">{t('reset.requestNew')}</Link>
        </>
      )}>
      {({ token, email, markInvalid }) => (
        <>
          <p className="mb-6 text-sm leading-relaxed text-[#6b7280]">{t('reset.intro', { email })}</p>
          <NewPasswordForm email={email} submitLabel={t('reset.submit')} onSubmit={async (values) => {
            try {
              await api.post('/auth/password-reset', { token, ...values }, { auth: false });
            } catch (error) {
              if (error.code === 'RESET_INVALID') markInvalid();
              throw error;
            }
            leave(); // sign in again with the new password
            navigate('/login', { replace: true, state: { passwordReset: true } });
          }} />
        </>
      )}
    </LinkTokenPage>
  );
}
