import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { rememberedEmail } from '../lib/rememberedEmail';
import { useDraft } from '../lib/useDraft';
import { Field, FormError, Icon, PasswordField } from './ui';

export default function LoginForm() {
  const { t } = useLanguage();
  const { login } = useAuth();
  // The email survives a refresh; the password is never stored.
  const [email, setEmail] = useDraft('login.email', rememberedEmail.get);
  const [remember, setRemember] = useState(() => Boolean(rememberedEmail.get()));
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const problems = {};
    if (!email.trim()) problems.email = 'EMAIL_REQUIRED';
    if (!password) problems.password = 'PASSWORD_REQUIRED';
    setFields(problems);
    setFormError(null);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      await login(email, password);
      rememberedEmail.set(remember ? email.trim() : '');
    } catch (error) {
      setFields(error.fields || {});
      setFormError(error.code || 'SERVER_ERROR');
      setBusy(false);
    }
  }

  function toggleRemember(checked) {
    setRemember(checked);
    // Unticking forgets the stored address at once.
    if (!checked) rememberedEmail.set('');
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="mb-5">
        <Field label={t('login.email')} error={fields.email} required>
          {(props) => <input {...props} type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} />}
        </Field>
      </div>
      <div className="mb-4">
        <PasswordField label={t('login.password')} error={fields.password} autoComplete="current-password" required
          value={password} onChange={setPassword} />
      </div>
      {formError !== 'VALIDATION_FAILED' && <FormError code={formError} className="mb-4" />}
      <div className="mb-6 flex items-center justify-between gap-4 text-sm text-[#1a1a1a]">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[#1a1a1a]" checked={remember}
            onChange={(e) => toggleRemember(e.target.checked)} />
          {t('login.remember')}
        </label>
        <Link to="/forgot-password" state={{ email: email.trim() }} className="font-medium hover:text-[#4a5568]">
          {t('login.forgot')}
        </Link>
      </div>
      <button type="submit" className="auth-button" disabled={busy}>
        {busy && <Icon name="spinner fa-spin" />}
        {t('login.submit')}
      </button>
    </form>
  );
}
