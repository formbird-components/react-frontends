// Everything an app's pages rely on, around its router: the theme, TanStack Query, the session,
// tooltips and toasts.

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { SessionProvider } from '../data/session';
import { ThemeProvider, useTheme } from '../theme';
import { TooltipProvider } from '../ui';

function Toasts() {
  const { dark } = useTheme();
  return <Toaster theme={dark ? 'dark' : 'light'} position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />;
}

/**
 * @param client - The app's query client (createQueryClient())
 * @param themeKey - Where the theme choice is kept (localStorage), e.g. "fleet-theme"
 */
export function AppProviders({ client, themeKey, children }: { client: QueryClient; themeKey: string; children: ReactNode }) {
  return (
    <ThemeProvider storageKey={themeKey}>
      <QueryClientProvider client={client}>
        <SessionProvider>
          <TooltipProvider>
            {children}
            <Toasts />
          </TooltipProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
