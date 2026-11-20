// pnpm db:setup: the SDMS demo database for this app (react-internal-demo), and fieldtec-web's
// server/config/react-internal.json pointing at it. Add --reset to replace it.
// The documents are built by demo/build.mjs from demo/catalog.mjs.

import path from 'node:path';
import { setupDatabase } from '@react-frontends/shared/dev/db-setup';
import { buildDemo } from '../demo/build.mjs';
import { APP_PORT, ownConfig } from './config.mjs';

if (ownConfig.db === 'internal-5') {
  console.error('INTERNAL_DB=internal-5 is a real database: pnpm db:setup only creates the demo one.');
  process.exit(1);
}

await setupDatabase({
  title: 'SDMS demo',
  appRoot: path.resolve(import.meta.dirname, '..'),
  ownConfig,
  appPort: APP_PORT,
  build: ({ platform, now, urlRoot }) => buildDemo({ platform, now, urlRoot }),
});
