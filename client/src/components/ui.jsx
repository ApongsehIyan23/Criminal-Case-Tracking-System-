import { useEffect, useId, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export const Icon = ({ name, className = '' }) => <i className={`fa-solid fa-${name} ${className}`} aria-hidden="true" />;

// A labelled field with its inline validation message. `children` receives the
// props that connect the control to the label and the error. `leading` and
// `trailing` sit inside the control.
export function Field({ label, error, leading, trailing, required, children }) {
  const { t } = useLanguage();
  const id = useId();
  const describedBy = error ? `${id}-error` : undefined;
  return (
    <div>
      {/* The asterisk is drawn by CSS, so it is not part of the field's name. */}
      <label htmlFor={id} className={`field-label ${required ? 'field-required' : ''}`}>{label}</label>
      <div className="relative">
        {leading && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-500">{leading}</span>}
        {children({
          id,
          className: `input ${leading ? 'pl-9' : ''} ${trailing ? 'pr-16' : ''}`,
          'aria-invalid': Boolean(error),
          'aria-required': required || undefined,
          'aria-describedby': describedBy,
        })}
        {trailing && <span className="absolute inset-y-0 right-2 flex items-center">{trailing}</span>}
      </div>
      {error && <p id={describedBy} role="alert" className="mt-1.5 text-sm text-red-700">{t(`errors.${error}`)}</p>}
    </div>
  );
}

export function PasswordField({ label, error, value, onChange, autoComplete, visible, onToggle, required }) {
  const { t } = useLanguage();
  const [own, setOwn] = useState(false);
  // Two fields can share one toggle by passing `visible`.
  const shown = visible ?? own;
  const toggle = visible === undefined ? () => setOwn(!own) : onToggle;
  return (
    <Field label={label} error={error} required={required} trailing={toggle && (
      <button type="button" className="text-xs font-medium underline" onClick={toggle}>
        {t(shown ? 'common.hide' : 'common.show')}
      </button>
    )}>
      {(props) => <input {...props} type={shown ? 'text' : 'password'} autoComplete={autoComplete} value={value}
        onChange={(event) => onChange(event.target.value)} />}
    </Field>
  );
}

// Title row at the top of a view, with its main actions on the right.
export function PageHeader({ title, badge, children }) {
  return (
    <div className="flex items-start justify-between gap-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {badge}
      </div>
      {children && <div className="flex gap-3">{children}</div>}
    </div>
  );
}

// A message in neutral colors, optionally dismissable.
export function Notice({ title, onClose, className = '', children }) {
  const { t } = useLanguage();
  return (
    <div role="status" className={`flex items-start justify-between gap-4 border border-neutral-400 bg-white px-4 py-3 text-sm ${className}`}>
      <div>{title && <strong>{title}: </strong>}{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
          <Icon name="xmark" />
        </button>
      )}
    </div>
  );
}

export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onDone, 3500);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;
  return (
    <div role="status" className="fixed bottom-6 right-6 z-50 max-w-sm border border-neutral-400 bg-neutral-950 px-4 py-3 text-sm text-white shadow-lg">
      {message}
    </div>
  );
}

// A form-level error, such as a wrong password.
export function FormError({ code, className = '' }) {
  const { t } = useLanguage();
  if (!code) return null;
  return <p role="alert" className={`text-sm text-red-700 ${className}`}>{t(`errors.${code}`)}</p>;
}

export function LanguageSwitcher({ onChange }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div role="group" aria-label={t('language.label')} className="inline-flex items-center rounded border border-neutral-300 bg-white p-0.5 text-xs font-semibold">
      <Icon name="globe" className="ml-2 mr-1 text-neutral-500" />
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
  );
}
