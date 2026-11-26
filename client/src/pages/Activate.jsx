import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { Field, FormError, Icon, Notice } from '../components/ui';
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

  return (
    <AuthShell title={t('activate.title')}>
      {invitation.state === 'checking' && <p><Icon name="spinner fa-spin" /> {t('common.loading')}</p>}
      {invitation.state === 'invalid' && (
        <>
          <Notice icon="link-slash">{t('activate.invalid')}</Notice>
          <Link className="btn w-full" to="/login"><Icon name="right-to-bracket" />{t('activate.toLogin')}</Link>
        </>
      )}
      {invitation.state === 'error' && (
        <>
          <FormError code={invitation.code} />
          <button type="button" className="btn w-full" onClick={() => window.location.reload()}>
            <Icon name="rotate-right" />{t('common.retry')}
          </button>
        </>
      )}
      {invitation.state === 'valid' && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <p className="text-sm">{t('activate.welcome', { name: invitation.fullName, email: invitation.email })}</p>
          <input type="email" autoComplete="username" value={invitation.email} readOnly hidden />
          <Field label={t('activate.password')} hint={t('activate.hint')} error={fields.password}>
            {(props) => <input {...props} type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Field label={t('activate.confirm')} error={fields.confirmPassword}>
            {(props) => <input {...props} type="password" autoComplete="new-password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} />}
          </Field>
          {formError !== 'VALIDATION_FAILED' && <FormError code={formError} />}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            <Icon name={busy ? 'spinner fa-spin' : 'user-check'} />{t('activate.submit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
