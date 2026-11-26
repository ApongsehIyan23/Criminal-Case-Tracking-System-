import { useId } from 'react';
import { useLanguage } from '../context/LanguageContext';

export const Icon = ({ name, className = '' }) => <i className={`fa-solid fa-${name} ${className}`} aria-hidden="true" />;

// A labelled field with its inline validation message. `children` receives the
// props that connect the control to the label and the error.
export function Field({ label, error, hint, children }) {
  const { t } = useLanguage();
  const id = useId();
  const describedBy = error ? `${id}-error` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-neutral-800">{label}</label>
      {children({ id, className: 'input', 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && !error && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
      {error && (
        <p id={describedBy} role="alert" className="mt-1 flex items-start gap-1.5 text-sm text-danger">
          <Icon name="circle-exclamation" className="mt-0.5" />
          <span>{t(`errors.${error}`)}</span>
        </p>
      )}
    </div>
  );
}

// General feedback in neutral colors.
export function Notice({ icon = 'circle-info', children }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
      <Icon name={icon} className="mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

// A form-level error, such as a wrong password.
export function FormError({ code }) {
  const { t } = useLanguage();
  if (!code) return null;
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-danger">
      <Icon name="circle-exclamation" className="mt-0.5" />
      <span>{t(`errors.${code}`)}</span>
    </p>
  );
}

export function LanguageSwitcher({ onChange }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div role="group" aria-label={t('language.label')} className="inline-flex items-center rounded border border-neutral-300 bg-white p-0.5 text-xs font-semibold">
      <Icon name="globe" className="mx-1.5 text-neutral-500" />
      <div className="inline-flex overflow-hidden rounded">
        {['EN', 'FR'].map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={language === code}
            title={t(`language.${code}`)}
            className={`rounded px-2.5 py-1.5 ${language === code ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
            onClick={() => {
              setLanguage(code);
              onChange?.(code);
            }}
          >
            {code}
          </button>
        ))}
      </div>
    </div>
  );
}
