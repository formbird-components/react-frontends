// The app is served by Vite; fieldtec-web is the backend, proxied on /api and /auth (one origin, so
// its session cookie works). FIELDTEC_URL picks the backend (default: this app's own fieldtec-web,
// http://localhost:3003); `pnpm dev` (scripts/dev.mjs) starts fieldtec-web and sets it.
// The shared config (@react-frontends/shared/vite) adds React, Tailwind, the `@` alias, ports and hosts.
import { appConfig } from '@react-frontends/shared/vite';
import { defineConfig } from 'vite';

export default defineConfig(
  appConfig({
    root: import.meta.dirname,
    port: 5191,
    backend: 'http://localhost:3003',
    config: {
      // Libraries in their own chunks: they change less often than the app, so browsers keep them cached.
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom', 'react-router'],
              ui: ['radix-ui', 'cmdk', 'sonner', 'lucide-react'],
              query: ['@tanstack/react-query'],
            },
          },
        },
      },
    },
  }),
);
