import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Field, FormError, Icon } from './ui';

export default function LoginForm({ initialEmail = '', onSuccess }) {
  const { t } = useLanguage();
  const { login } = useAuth();
  const [email, setEmail] = useState(initialEmail);
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
      const result = await login(email, password);
      onSuccess?.(result);
    } catch (error) {
      setFields(error.fields || {});
      setFormError(error.code || 'SERVER_ERROR');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label={t('login.email')} error={fields.email}>
        {(props) => <input {...props} type="email" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label={t('login.password')} error={fields.password}>
        {(props) => <input {...props} type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      {formError !== 'VALIDATION_FAILED' && <FormError code={formError} />}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        <Icon name={busy ? 'spinner fa-spin' : 'right-to-bracket'} />
        {t('login.submit')}
      </button>
    </form>
  );
}
