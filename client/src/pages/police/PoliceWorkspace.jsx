import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import Dashboard from './Dashboard';
import Docket from './Docket';
import NewCase from './NewCase';

export default function PoliceWorkspace() {
  const { t } = useLanguage();
  return (
    <>
      <nav className="border-b border-neutral-300 bg-white px-6">
        <Link to="/police" className="inline-flex border-b-2 border-neutral-900 py-4 text-sm font-semibold">
          <Icon name="folder-open" className="mr-2" />{t('police.section')}
        </Link>
      </nav>
      <main className="mx-auto max-w-[1440px] p-7">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="cases/new" element={<NewCase />} />
          <Route path="cases/:caseId" element={<Docket />} />
          <Route path="*" element={<Navigate to="/police" replace />} />
        </Routes>
      </main>
    </>
  );
}
