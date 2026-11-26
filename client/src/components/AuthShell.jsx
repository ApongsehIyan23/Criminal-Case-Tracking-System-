import { useLanguage } from '../context/LanguageContext';
import { LanguageSwitcher } from './ui';

// Layout shared by the sign-in and activation screens.
export default function AuthShell({ title, leading, wide = false, banner, children }) {
  const { t } = useLanguage();
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'}`}>
        <div className="mb-4 flex items-center justify-between">
          {leading || <span className="text-sm font-semibold">{t('app.short')}</span>}
          <LanguageSwitcher />
        </div>
        {banner}
        <div className="border border-neutral-300 bg-white p-8 shadow-sm">
          <p className="text-sm text-neutral-600">{t('app.title')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
