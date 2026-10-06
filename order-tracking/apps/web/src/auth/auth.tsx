import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, Me, Role } from '@order-tracking/shared';
import { api, ApiError, setUnauthorizedHandler } from '../lib/api';
import { Loading } from '../components/ui';

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<Me>;
  logout: () => Promise<void>;
  /** Чи має поточний користувач одну з ролей */
  can: (...roles: Role[]) => boolean;
  /** Чи може змінювати дані (admin, editor) */
  canEdit: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

const ME_KEY = ['me'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data: me = null, isPending } = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  // Сесія скінчилась посеред роботи → очищаємо кеш і показуємо вхід.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (qc.getQueryData(ME_KEY)) qc.setQueryData(ME_KEY, null);
    });
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  const loginMut = useMutation({ mutationFn: api.login });
  const value: AuthState = {
    me,
    loading: isPending,
    login: async (input) => {
      const m = await loginMut.mutateAsync(input);
      qc.clear();
      qc.setQueryData(ME_KEY, m);
      return m;
    },
    logout: async () => {
      try {
        await api.logout();
      } finally {
        qc.clear();
        qc.setQueryData(ME_KEY, null);
      }
    },
    can: (...roles) => !!me && roles.includes(me.role),
    canEdit: !!me && me.role !== 'viewer',
    isAdmin: me?.role === 'admin',
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Пускає лише автентифікованих (і, за потреби, з потрібною роллю). */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!me) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />;
  }
  if (roles && !roles.includes(me.role)) {
    return <div className="panel empty">Недостатньо прав для цього розділу.</div>;
  }
  return <>{children}</>;
}

/** Показує вміст лише для вказаних ролей. */
export function Can({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...roles) ? <>{children}</> : null;
}

export function useLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return async () => {
    await logout();
    navigate('/login', { replace: true });
  };
}
