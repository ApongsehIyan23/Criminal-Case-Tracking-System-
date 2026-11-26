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
    <div className="fixed inset-0 z-40 bg-black/20"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label={t('help.title')}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-neutral-400 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-300 p-5">
          <div>
            <h2 className="text-lg font-semibold"><Icon name="circle-question" className="mr-2" />{t('help.title')}</h2>
            <p className="mt-1 text-xs text-neutral-500">{t(`roles.${role}`)}</p>
          </div>
          <button ref={closeButton} type="button" className="text-xl" onClick={onClose}
            aria-label={t('common.close')} title={t('common.close')}>
            <Icon name="xmark" />
          </button>
        </div>
        <div className="space-y-7 overflow-y-auto p-6">
          {t(`help.${role}`).map(([question, answer], index) => (
            <section key={question}>
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full border border-neutral-400 text-sm font-semibold">{index + 1}</div>
              <h3 className="font-semibold">{question}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{answer}</p>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
