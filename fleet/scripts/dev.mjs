// pnpm dev: fieldtec-web with the fleet demo's configuration (server/config/solid-fleet.json: port
// 3001, the solidjs-fleet-demo database, Redis db 2), then this app on Vite (http://localhost:5190).
// See @react-frontends/shared/dev (shared/dev/start.mjs) for what it does and its settings
// (FIELDTEC_WEB, FIELDTEC_CONFIG, FIELDTEC_URL, PORT, ALLOWED_HOSTS).

import path from 'node:path';
import { startDev } from '@react-frontends/shared/dev';

await startDev({
  appRoot: path.resolve(import.meta.dirname, '..'),
  config: 'solid-fleet',
  missingConfigHint: "It is written by the fleet demo's setup: in solidjs-components-fleet, run pnpm db:setup (see README.md).",
});
