// pnpm dev: fieldtec-web on this app's own configuration, then this app on Vite (http://localhost:5190).
//
// The configuration is server/config/react-fleet.json in the fieldtec-web checkout, rewritten from
// development.json on each start: the react-fleet-demo database and index (created by
// pnpm db:setup), port 3006, Redis database 7 (scripts/config.mjs).
// See @react-frontends/shared/dev (shared/dev/start.mjs) for what it does and its settings
// (FIELDTEC_WEB, FIELDTEC_CONFIG, FIELDTEC_URL, PORT, ALLOWED_HOSTS).

import path from 'node:path';
import { startDev } from '@react-frontends/shared/dev';
import { ownConfig } from './config.mjs';

await startDev({ appRoot: path.resolve(import.meta.dirname, '..'), ownConfig });
