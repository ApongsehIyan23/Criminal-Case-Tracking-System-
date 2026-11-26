import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { FormError, Icon, Notice, PasswordField } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api, query } from '../lib/api';

export default function Activate() {
  const { t, setLanguage } = useLanguage();
  const { leave } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [invitation, setInvitation] = useState({ state: 'checking' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fields, setFields] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const verified = useRef(null);

  useEffect(() => {
    // Verify once per token, so the audit log records one entry.
    if (verified.current === token) return;
    verified.current = token;
    api.get(`/auth/invitations/verify${query({ token })}`, { auth: false })
      .then((data) => {
        setLanguage(data.preferredLanguage);
        setInvitation({ state: 'valid', ...data });
      })
      .catch((error) => setInvitation({ state: error.code === 'INVITATION_INVALID' ? 'invalid' : 'error', code: error.code }));
  }, [token, setLanguage]);

  async function submit(event) {
    event.preventDefault();
    const problems = {};
    if (password.length < 8) problems.password = 'PASSWORD_TOO_SHORT';
    if (password !== confirmPassword) problems.confirmPassword = 'PASSWORDS_DO_NOT_MATCH';
    setFields(problems);
    setFormError(null);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      await api.post('/auth/activate', { token, password, confirmPassword }, { auth: false });
      leave(); // never continue into another account's session
      navigate('/login', { replace: true, state: { activated: true } });
    } catch (error) {
      if (error.code === 'INVITATION_INVALID') setInvitation({ state: 'invalid' });
      setFields(error.fields);
      setFormError(error.code);
      setBusy(false);
    }
  }

  const toggle = () => setVisible((current) => !current);

  return (
    <AuthShell wide title={t('activate.title')} leading={(
      <Link className="text-action" to="/login">
        <Icon name="arrow-left" className="mr-1.5" />{t('activate.toLogin')}
      </Link>
    )}>
      {invitation.state === 'checking' && <p className="text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>}
      {invitation.state === 'invalid' && <Notice>{t('activate.invalid')}</Notice>}
      {invitation.state === 'error' && (
        <>
          <FormError code={invitation.code} />
          <button type="button" className="button-secondary mt-4 w-full" onClick={() => window.location.reload()}>
            <Icon name="rotate-right" />{t('common.retry')}
          </button>
        </>
      )}
      {invitation.state === 'valid' && (
        <form onSubmit={submit} noValidate>
          <div className="border border-neutral-300 bg-neutral-50 p-4 text-sm font-medium">
            {t('activate.welcome', { name: invitation.fullName, email: invitation.email })}
          </div>
          <input type="email" autoComplete="username" value={invitation.email} readOnly hidden />
          <div className="mt-6 space-y-5">
            <div>
              <PasswordField label={t('activate.password')} error={fields.password} autoComplete="new-password"
                value={password} onChange={setPassword} visible={visible} onToggle={toggle} />
              {!fields.password && <p className="mt-1.5 text-xs text-neutral-500">{t('activate.hint')}</p>}
            </div>
            <PasswordField label={t('activate.confirm')} error={fields.confirmPassword} autoComplete="new-password"
              value={confirmPassword} onChange={setConfirmPassword} visible={visible} />
          </div>
          {formError !== 'VALIDATION_FAILED' && <FormError code={formError} className="mt-3" />}
          <button type="submit" className="button-primary mt-7 w-full" disabled={busy}>
            <Icon name={busy ? 'spinner fa-spin' : 'user-check'} />{t('activate.submit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
