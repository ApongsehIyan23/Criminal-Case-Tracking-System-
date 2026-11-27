// Card and close button shared by the two session dialogs (from the design).
import { useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';

export const PRIMARY = 'rounded-[10px] bg-[#1a2035] px-6 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-[#2a3045] disabled:opacity-60';
export const OUTLINE = 'rounded-[10px] border border-[#d1d5db] px-6 py-3.5 text-[15px] font-medium text-[#1a2035] transition-colors hover:bg-gray-50';

export default function ModalCard({ backdrop, titleId, onClose, className = '', children }) {
  const { t } = useLanguage();
  const card = useRef(null);
  // The dialog itself takes focus, so stray typing cannot press a button.
  useEffect(() => { card.current?.focus(); }, []);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${backdrop}`}>
      <div ref={card} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby={titleId}
        className={`relative w-[460px] max-w-full rounded-2xl bg-white px-10 pb-9 pt-10 font-['Inter_Variable',Inter,sans-serif] shadow-[0_4px_24px_rgba(0,0,0,0.08)] outline-none ${className}`}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-[#8b95a5] hover:text-[#4a5568]"
          aria-label={t('common.close')} title={t('common.close')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
