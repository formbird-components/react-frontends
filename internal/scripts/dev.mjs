// pnpm dev: fieldtec-web on this app's own configuration, then this app on Vite (http://localhost:5191).
//
// The configuration is server/config/react-internal.json in the fieldtec-web checkout, rewritten
// from development.json on each start: the internal-5 database and Elasticsearch index, port 3003,
// Redis database 4, avl data in fieldtec-avl, and email/password sign-in only (no SSO).
// (fieldtec-web's own internal-5.json is left alone: it searches the formbird index.)
// See @react-frontends/shared/dev (shared/dev/start.mjs) for what it does and its settings
// (FIELDTEC_WEB, FIELDTEC_CONFIG, FIELDTEC_URL, PORT, ALLOWED_HOSTS).

import path from 'node:path';
import { startDev } from '@react-frontends/shared/dev';

await startDev({
  appRoot: path.resolve(import.meta.dirname, '..'),
  ownConfig: { name: 'react-internal', db: 'internal-5', indexName: 'internal-5', port: 3003, redisDatabase: 4, avlDb: 'fieldtec-avl' },
});
