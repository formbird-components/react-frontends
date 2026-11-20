// pnpm dev: fieldtec-web on this app's own configuration, then this app on Vite (http://localhost:5191).
//
// The configuration is server/config/react-internal.json in the fieldtec-web checkout, rewritten
// from development.json on each start (scripts/config.mjs): the react-internal-demo database and
// index made by pnpm db:setup (or INTERNAL_DB), port 3003, Redis database 4, avl data in
// fieldtec-avl, and email/password sign-in only (no SSO).
// See @react-frontends/shared/dev (shared/dev/start.mjs) for what it does and its settings
// (FIELDTEC_WEB, FIELDTEC_CONFIG, FIELDTEC_URL, PORT, ALLOWED_HOSTS).

import path from 'node:path';
import { startDev } from '@react-frontends/shared/dev';
import { ownConfig } from './config.mjs';

await startDev({ appRoot: path.resolve(import.meta.dirname, '..'), ownConfig });
