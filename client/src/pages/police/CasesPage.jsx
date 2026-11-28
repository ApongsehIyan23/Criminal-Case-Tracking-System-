import { useCustodySync } from '../../context/CustodySyncContext';
import { useLanguage } from '../../context/LanguageContext';
import CaseRegister from './CaseRegister';

// The register fills the screen, so the page title is for screen readers only.
export default function CasesPage() {
  const { t } = useLanguage();
  const { version } = useCustodySync();
  return (
    <section className="register-screen flex flex-col">
      <h1 className="sr-only">{t('sidebar.cases')}</h1>
      <CaseRegister version={version} />
    </section>
  );
}
