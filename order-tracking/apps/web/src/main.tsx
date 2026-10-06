import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { ApiError } from './lib/api';
import { AuthProvider } from './auth/auth';
import { ToastProvider } from './components/toast';
import { ConfirmProvider } from './components/dialog';
import { App } from './App';
import './components/theme';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx не повторюємо (немає прав / не знайдено / сесія скінчилась)
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
