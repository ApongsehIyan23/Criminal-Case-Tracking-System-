// Layout shared by the sign-in, activation and password screens: the system name
// and language switcher above one rounded card (from the login design).
import { useLanguage } from '../context/LanguageContext';
import { LanguageSwitcher } from './ui';

// `hideTitle` keeps the heading for screen readers only, as on the sign-in card.
export default function AuthShell({ title, hideTitle = false, banner, children }) {
  const { t } = useLanguage();
  return (
    <main className="auth flex min-h-screen items-center justify-center p-6">
      <div className="w-[420px] max-w-full">
        <div className="mb-5 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold leading-snug text-[#1a1a1a]">{t('app.title')}</p>
          <LanguageSwitcher />
        </div>
        {banner}
        <div className="rounded-2xl bg-white px-8 py-9 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
          <h1 className={hideTitle ? 'sr-only' : 'mb-6 text-xl font-bold text-[#1a1a1a]'}>{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
