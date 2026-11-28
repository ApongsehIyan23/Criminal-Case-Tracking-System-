import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { BackToLogin } from '../components/BackToLogin';
import { Field, FormError, Icon } from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';

export default function ForgotPassword() {
  const { t } = useLanguage();
  const { state } = useLocation();
  const [email, setEmail] = useState(state?.email || '');
  const [fields, setFields] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setFields({});
    setFormError(null);
    if (!email.trim()) {
      setFields({ email: 'EMAIL_REQUIRED' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() }, { auth: false });
      setSent(true);
    } catch (error) {
      setFields(error.fields || {});
      setFormError(error.code || 'SERVER_ERROR');
    }
    setBusy(false);
  }

  return (
    <AuthShell title={t('forgot.title')}>
      {sent ? (
        <div role="status" className="space-y-3 text-sm leading-relaxed text-[#1a1a1a]">
          <p>{t('forgot.sent')}</p>
          <p className="text-[#6b7280]">{t('forgot.sentHelp')}</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="mb-6 text-sm leading-relaxed text-[#6b7280]">{t('forgot.intro')}</p>
          <div className="mb-6">
            <Field label={t('login.email')} error={fields.email} required>
              {(props) => <input {...props} type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} />}
            </Field>
          </div>
          {formError !== 'VALIDATION_FAILED' && <FormError code={formError} className="mb-4" />}
          <button type="submit" className="auth-button" disabled={busy}>
            {busy && <Icon name="spinner fa-spin" />}
            {t('forgot.submit')}
          </button>
        </form>
      )}
      <BackToLogin />
    </AuthShell>
  );
}
