import { useNavigate } from 'react-router-dom';
import LinkTokenPage from '../components/LinkTokenPage';
import NewPasswordForm from '../components/NewPasswordForm';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';

export default function Activate() {
  const { t } = useLanguage();
  const { leave } = useAuth();
  const navigate = useNavigate();

  return (
    <LinkTokenPage title={t('activate.title')} verifyPath="/auth/invitations/verify"
      invalidCode="INVITATION_INVALID" invalid={t('activate.invalid')}>
      {({ token, email, fullName, markInvalid }) => (
        <>
          <p className="mb-6 rounded-[10px] bg-[#f5f5f5] p-4 text-sm font-medium">
            {t('activate.welcome', { name: fullName, email })}
          </p>
          <NewPasswordForm email={email} submitLabel={t('activate.submit')} onSubmit={async (values) => {
            try {
              await api.post('/auth/activate', { token, ...values }, { auth: false });
            } catch (error) {
              if (error.code === 'INVITATION_INVALID') markInvalid();
              throw error;
            }
            leave(); // never continue into another account's session
            navigate('/login', { replace: true, state: { activated: true } });
          }} />
        </>
      )}
    </LinkTokenPage>
  );
}
