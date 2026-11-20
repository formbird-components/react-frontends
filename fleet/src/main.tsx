import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { configureApi } from '@react-frontends/shared/api';
import { createQueryClient } from '@react-frontends/shared/data';
import { AppProviders } from '@react-frontends/shared/shell';
import { router } from '@/app/router';
import './index.css';

configureApi({ serverName: 'fleet' });
const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders client={queryClient} themeKey="fleet-theme">
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
