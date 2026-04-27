import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppShell';
import Dashboard from './pages/Dashboard';
import Readiness from './pages/Readiness';
import Workflow from './pages/Workflow';
import Ideas from './pages/Ideas';
import Drafts from './pages/Drafts';
import CalendarPage from './pages/Calendar';
import Images from './pages/Images';
import ImageEdit from './pages/ImageEdit';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/readiness" element={<Readiness />} />
        <Route path="/workflow" element={<Workflow />} />
        <Route path="/ideas" element={<Ideas />} />
        <Route path="/drafts" element={<Drafts />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/images" element={<Images />} />
        <Route path="/image-edit" element={<ImageEdit />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
