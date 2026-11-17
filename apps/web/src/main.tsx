import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { Security } from './Security';
// Теми К-2 (сабмодуль packages/k2-styles): світла, темна і пісочна («Койот»).
import '../../../packages/k2-styles/css/themes/light.css';
import '../../../packages/k2-styles/css/themes/dark.css';
import '../../../packages/k2-styles/css/themes/sand.css';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Безпековий шаблон К-2 (водяний знак, заборона друку) — поза App і роутером: на всіх сторінках */}
      <Security />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
