// The pages behind the sidebar's navigation entries.
import { Navigate, Route, Routes } from 'react-router-dom';
import CasesPage from './CasesPage';
import Dashboard from './Dashboard';
import Docket from './Docket';
import EvidencePage from './EvidencePage';
import NewCase from './NewCase';

export default function PoliceWorkspace() {
  return (
    <main className="mx-auto max-w-[1440px] p-7">
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="cases" element={<CasesPage />} />
        <Route path="cases/new" element={<NewCase />} />
        <Route path="cases/:caseId" element={<Docket />} />
        <Route path="evidence" element={<EvidencePage />} />
        <Route path="*" element={<Navigate to="/police" replace />} />
      </Routes>
    </main>
  );
}
