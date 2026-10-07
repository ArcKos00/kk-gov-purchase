import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler } from './api';
import { LoadError, Loading } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { ContractsPage } from './pages/ContractsPage';
import { ContractPage } from './pages/ContractPage';
import { ContractFormPage } from './pages/ContractFormPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { ShortfallPage } from './pages/ShortfallPage';

export function App() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity });

  // Сесія скінчилась посеред роботи — повертаємось на форму входу.
  useEffect(() => setUnauthorizedHandler(() => queryClient.setQueryData(['me'], null)), [queryClient]);

  if (me.isPending) return <main className="wrap"><Loading /></main>;
  if (me.error) return <main className="wrap"><LoadError error={me.error} /></main>;
  if (!me.data) return <LoginPage />;
  return <Shell username={me.data.username} />;
}

function Shell({ username }: { username: string }) {
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(['me'], null);
    },
  });

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link to="/contracts" className="brand">Облік замовлень</Link>
          <nav className="nav">
            <NavLink to="/contracts" end className="btn">Замовлення</NavLink>
            <NavLink to="/contracts/new" className="btn primary">+ Нове замовлення</NavLink>
            <span className="user small muted">{username}</span>
            <button type="button" className="btn" onClick={() => logout.mutate()} disabled={logout.isPending}>Вийти</button>
          </nav>
        </div>
      </header>
      <main className="wrap">
        {flash && <div className="alert ok" role="status" key={location.key}>{flash}</div>}
        <Routes>
          <Route path="/" element={<ContractsPage />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/contracts/new" element={<ContractFormPage />} />
          <Route path="/contracts/:id" element={<ContractPage />} />
          <Route path="/contracts/:id/edit" element={<ContractFormPage />} />
          <Route path="/contracts/:id/deliveries/new" element={<DeliveryPage />} />
          <Route path="/contracts/:id/shortfall" element={<ShortfallPage />} />
          <Route path="*" element={<div className="panel empty">Сторінку не знайдено. <Link to="/contracts">До списку</Link></div>} />
        </Routes>
      </main>
    </>
  );
}
