// A Vite config for an app on fieldtec-web. The app is served by Vite; fieldtec-web is the backend.
// Vite proxies fieldtec-web's routes (/api, /auth) so the app and the API share one origin:
// fieldtec-web's session cookie then works without CORS.
//
//   // vite.config.ts
//   import { appConfig } from '@react-frontends/shared/vite';
//   export default appConfig({ root: import.meta.dirname, port: 5190, backend: 'http://localhost:3001' });
//
// Environment: FIELDTEC_URL (the backend; `pnpm dev` sets it), PORT (the app's port), ALLOWED_HOSTS
// (more host names the dev server answers, comma-separated; Coder's forwarded ports are allowed),
// APP_BASE (the path the built app is served under, e.g. /react-fleet/ behind the demo portal; the
// router and the API client follow it: BASE_PATH in @react-frontends/shared/api).

import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { mergeConfig } from 'vite';

/** Packages there must be one copy of (two Reacts, routers or query clients break the app). */
export const DEDUPE = ['react', 'react-dom', 'react-router', '@tanstack/react-query', 'sonner'];

/**
 * @param {import('./index.d.mts').AppConfigOptions} o
 * @returns {import('vite').UserConfig}
 */
export function appConfig({ root, port, backend, config = {} }) {
  const target = process.env.FIELDTEC_URL ?? backend;
  const proxy = Object.fromEntries(['/api', '/auth'].map((route) => [route, { target, changeOrigin: false }]));
  // Hosts the dev server answers besides localhost: Coder's forwarded ports (<port>--…coder.formbird.com),
  // and any in ALLOWED_HOSTS (comma-separated).
  const allowedHosts = ['.coder.formbird.com', ...(process.env.ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)];
  const appPort = Number(process.env.PORT ?? port);
  return mergeConfig(
    {
      root,
      base: process.env.APP_BASE ?? '/',
      plugins: [react(), tailwindcss()],
      resolve: { alias: { '@': path.resolve(root, 'src') }, dedupe: DEDUPE },
      server: { port: appPort, strictPort: true, allowedHosts, proxy },
      preview: { port: appPort, strictPort: true, allowedHosts, proxy },
    },
    config,
  );
}
