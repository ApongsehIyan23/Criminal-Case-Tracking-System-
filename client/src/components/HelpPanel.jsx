import { useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from './ui';

// Slide-over help for the signed-in role. The page underneath stays as it was.
export default function HelpPanel({ role, onClose }) {
  const { t } = useLanguage();
  const closeButton = useRef(null);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={t('help.title')}
        className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-neutral-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="circle-question" />{t('help.title')}</h2>
          <button ref={closeButton} type="button" className="btn" onClick={onClose}>
            <Icon name="xmark" />{t('common.close')}
          </button>
        </div>
        <p className="mb-3 text-sm text-neutral-600">{t(`roles.${role}`)}</p>
        {t(`help.${role}`).map(([question, answer]) => (
          <details key={question} className="border-b border-neutral-200 py-3">
            <summary className="cursor-pointer text-sm font-medium">{question}</summary>
            <p className="mt-2 text-sm text-neutral-700">{answer}</p>
          </details>
        ))}
      </aside>
    </div>
  );
}
