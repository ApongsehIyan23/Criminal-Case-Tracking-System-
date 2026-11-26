import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedLayout from './components/ProtectedLayout';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import Activate from './pages/Activate';
import AdminConsole from './pages/admin/AdminConsole';
import Login from './pages/Login';
import Placeholder from './pages/Placeholder';
import PoliceWorkspace from './pages/police/PoliceWorkspace';

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/activate" element={<Activate />} />
          <Route path="/admin" element={
            <ProtectedLayout role="SYSTEM_ADMINISTRATOR"><AdminConsole /></ProtectedLayout>} />
          <Route path="/police/*" element={
            <ProtectedLayout role="JUDICIAL_POLICE_OFFICER"><PoliceWorkspace /></ProtectedLayout>} />
          <Route path="/magistrate" element={
            <ProtectedLayout role="EXAMINING_MAGISTRATE"><Placeholder area="magistrate" icon="gavel" /></ProtectedLayout>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </LanguageProvider>
  );
}
