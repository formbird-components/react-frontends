// This app's own fieldtec-web config (server/config/react-internal.json), used by pnpm dev and
// pnpm db:setup: port 3003, Redis database 4, and its database and index, react-internal-demo
// (made by pnpm db:setup). To run on a real copy of internal-5 instead, set INTERNAL_DB=internal-5
// (pnpm db:setup never writes to it).
// See OwnConfig in @react-frontends/shared (dev/server-config.mjs).

const db = process.env.INTERNAL_DB ?? 'react-internal-demo';

export const ownConfig = { name: 'react-internal', db, indexName: db, port: 3003, redisDatabase: 4, avlDb: 'fieldtec-avl' };

/** The app's dev server port (vite.config.ts reads PORT; this is its default). */
export const APP_PORT = 5191;
