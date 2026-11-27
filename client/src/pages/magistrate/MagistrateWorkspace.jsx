import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import Dashboard from './Dashboard';
import Review from './Review';

export default function MagistrateWorkspace() {
  const { t } = useLanguage();
  return (
    <>
      <nav className="border-b border-neutral-300 bg-white px-6">
        <Link to="/magistrate" className="inline-flex border-b-2 border-neutral-900 py-4 text-sm font-semibold">
          <Icon name="inbox" className="mr-2" />{t('magistrate.section')}
        </Link>
      </nav>
      <main className="mx-auto max-w-[1540px] p-7">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="cases/:caseId" element={<Review />} />
          <Route path="*" element={<Navigate to="/magistrate" replace />} />
        </Routes>
      </main>
    </>
  );
}
