import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BaseStyles } from '@primer/react';
import '@primer/primitives/dist/css/functional/themes/light.css';
import '@primer/primitives/dist/css/functional/themes/dark.css';
import './styles/app.css';
import App from './App';
import { ColorModeProvider } from './context/ColorModeProvider';
import { ConnectionProvider } from './context/ConnectionProvider';
import { ToastProvider } from './context/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorModeProvider>
      <BaseStyles>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <ConnectionProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </ConnectionProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </BaseStyles>
    </ColorModeProvider>
  </StrictMode>,
);
