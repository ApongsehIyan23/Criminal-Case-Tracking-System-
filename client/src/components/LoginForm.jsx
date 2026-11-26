import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Field, FormError, Icon, PasswordField } from './ui';

export default function LoginForm() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
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
    } catch (error) {
      setFields(error.fields || {});
      setFormError(error.code || 'SERVER_ERROR');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="space-y-5">
        <Field label={t('login.email')} error={fields.email}>
          {(props) => <input {...props} type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <PasswordField label={t('login.password')} error={fields.password} autoComplete="current-password"
          value={password} onChange={setPassword} />
      </div>
      {formError !== 'VALIDATION_FAILED' && <FormError code={formError} className="mt-3" />}
      <button type="submit" className="button-primary mt-6 w-full" disabled={busy}>
        <Icon name={busy ? 'spinner fa-spin' : 'right-to-bracket'} />
        {t('login.submit')}
      </button>
    </form>
  );
}
