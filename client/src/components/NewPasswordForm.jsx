// Password and confirmation, used to activate an account and to reset a password.
// `onSubmit` receives both values and throws the API error if it is refused.
import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { FormError, Icon, PasswordField } from './ui';

export default function NewPasswordForm({ email, submitLabel, onSubmit }) {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fields, setFields] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

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
      await onSubmit({ password, confirmPassword });
    } catch (error) {
      setFields(error.fields || {});
      setFormError(error.code || 'SERVER_ERROR');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {/* Lets password managers file the new password under the right account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <div className="mb-5">
        <PasswordField label={t('activate.password')} error={fields.password} autoComplete="new-password" required
          value={password} onChange={setPassword} visible={visible} onToggle={() => setVisible(!visible)} />
        {!fields.password && <p className="mt-1.5 text-xs text-neutral-500">{t('activate.hint')}</p>}
      </div>
      <div className="mb-6">
        <PasswordField label={t('activate.confirm')} error={fields.confirmPassword} autoComplete="new-password" required
          value={confirmPassword} onChange={setConfirmPassword} visible={visible} />
      </div>
      {formError !== 'VALIDATION_FAILED' && <FormError code={formError} className="mb-4" />}
      <button type="submit" className="auth-button" disabled={busy}>
        {busy && <Icon name="spinner fa-spin" />}
        {submitLabel}
      </button>
    </form>
  );
}
