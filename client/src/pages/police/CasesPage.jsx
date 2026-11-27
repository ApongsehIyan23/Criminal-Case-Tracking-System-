import { PageHeader } from '../../components/ui';
import { useCustodySync } from '../../context/CustodySyncContext';
import { useLanguage } from '../../context/LanguageContext';
import CaseRegister from './CaseRegister';

export default function CasesPage() {
  const { t } = useLanguage();
  const { version } = useCustodySync();
  return (
    <section>
      <PageHeader title={t('sidebar.cases')} />
      <CaseRegister version={version} />
    </section>
  );
}
