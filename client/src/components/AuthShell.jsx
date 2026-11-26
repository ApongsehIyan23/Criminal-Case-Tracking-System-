import { useLanguage } from '../context/LanguageContext';
import { LanguageSwitcher } from './ui';

// Layout shared by the sign-in and activation screens.
export default function AuthShell({ title, children }) {
  const { t } = useLanguage();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold">{t('app.short')}</span>
          <LanguageSwitcher />
        </div>
        <div className="card space-y-5 p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
