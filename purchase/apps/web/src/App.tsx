import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { RequireAuth } from './auth/auth';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { ContractsPage } from './pages/ContractsPage';
import { ContractPage } from './pages/ContractPage';
import { ContractFormPage } from './pages/ContractFormPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { ShortfallPage } from './pages/ShortfallPage';
import { SearchPage } from './pages/SearchPage';
import { AccountPage } from './pages/AccountPage';

// Важчі розділи (графіки, адміністрування) вантажаться окремими частинами.
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const AuditPage = lazy(() => import('./pages/AuditPage').then((m) => ({ default: m.AuditPage })));

const EDIT = ['admin', 'editor'] as const;

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/contracts" replace />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/contracts/new" element={<RequireAuth roles={[...EDIT]}><ContractFormPage /></RequireAuth>} />
          <Route path="/contracts/:id" element={<ContractPage />} />
          <Route path="/contracts/:id/edit" element={<RequireAuth roles={[...EDIT]}><ContractFormPage /></RequireAuth>} />
          <Route path="/contracts/:id/deliveries/new" element={<RequireAuth roles={[...EDIT]}><DeliveryPage /></RequireAuth>} />
          <Route path="/contracts/:id/shortfall" element={<RequireAuth roles={[...EDIT]}><ShortfallPage /></RequireAuth>} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin/users" element={<RequireAuth roles={['admin']}><UsersPage /></RequireAuth>} />
          <Route path="/admin/audit" element={<RequireAuth roles={['admin']}><AuditPage /></RequireAuth>} />
          <Route path="*" element={<div className="panel empty">Сторінку не знайдено. <Link to="/contracts">До списку договорів</Link></div>} />
        </Route>
      </Routes>
    </Suspense>
  );
}
