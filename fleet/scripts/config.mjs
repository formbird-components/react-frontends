// This app's own fieldtec-web config (server/config/react-fleet.json), used by pnpm dev and
// pnpm db:setup: its own database and index, port and Redis database, so it never shares data,
// sessions or cached rules with the Solid fleet demo.

/** See OwnConfig in @react-frontends/shared (dev/server-config.mjs). */
export const ownConfig = { name: 'react-fleet', db: 'react-fleet-demo', port: 3006, redisDatabase: 7 };

/** The app's dev server port (vite.config.ts reads PORT; this is its default). */
export const APP_PORT = 5190;
