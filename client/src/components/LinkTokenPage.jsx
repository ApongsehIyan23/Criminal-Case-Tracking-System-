// A page opened from an emailed one-time link (activation or password reset):
// checks the token, then asks for the new password.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { api, query } from '../lib/api';
import AuthShell from './AuthShell';
import { BackToLogin } from './BackToLogin';
import { FormError, Icon } from './ui';

export default function LinkTokenPage({ title, verifyPath, invalidCode, invalid, children }) {
  const { t, setLanguage } = useLanguage();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [link, setLink] = useState({ state: 'checking' });
  const verified = useRef(null);

  useEffect(() => {
    // Verify once per token, so the audit log records one entry.
    if (verified.current === token) return;
    verified.current = token;
    api.get(`${verifyPath}${query({ token })}`, { auth: false })
      .then((data) => {
        setLanguage(data.preferredLanguage);
        setLink({ state: 'valid', ...data });
      })
      .catch((error) => setLink({ state: error.code === invalidCode ? 'invalid' : 'error', code: error.code }));
  }, [token, verifyPath, invalidCode, setLanguage]);

  return (
    <AuthShell title={title}>
      {link.state === 'checking' && <p className="text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>}
      {link.state === 'invalid' && <div role="status" className="text-sm leading-relaxed text-[#1a1a1a]">{invalid}</div>}
      {link.state === 'error' && (
        <>
          <FormError code={link.code} className="mb-4" />
          <button type="button" className="auth-button" onClick={() => window.location.reload()}>
            {t('common.retry')}
          </button>
        </>
      )}
      {link.state === 'valid' && children({ ...link, token, markInvalid: () => setLink({ state: 'invalid' }) })}
      <BackToLogin />
    </AuthShell>
  );
}
