// `pnpm db:setup` for an app: creates the app's own demo database (Mongo + its Elasticsearch index),
// writes the app's own fieldtec-web config pointing at it, and flushes the app's Redis database.
//
// The documents come from the app (`build`); loading them uses solidjs-components-shared's platform
// package (packages/platform: seed.mjs, services.mjs, documents.mjs), the same loader the Solid demo
// apps use, so solidjs-components must be checked out beside this workspace (or SOLIDJS_COMPONENTS
// set). MongoDB, Elasticsearch and Redis are the ones in fieldtec-web's development.json.
//
//   // <app>/scripts/db-setup.mjs
//   import { setupDatabase } from '@react-frontends/shared/dev/db-setup';
//   await setupDatabase({ title: 'Fleet demo', appRoot, ownConfig, build: ({ platform, now, urlRoot }) => ({ documents, people, password }) });

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { configFile, findFieldtec, readConfig, writeOwnServerConfig } from './server-config.mjs';

const bold = (text) => `\x1b[1m${text}\x1b[22m`;
const ok = (text) => console.log(`   \x1b[32m✓\x1b[0m ${text}`);
function fail(text) {
  console.error(`\n\x1b[31mSetup stopped:\x1b[0m ${text}`);
  process.exit(1);
}

/**
 * The solidjs-components checkout: SOLIDJS_COMPONENTS, or a solidjs-components folder beside `from`
 * or beside a folder above it (e.g. ~/git/solidjs-components for ~/git/react-frontends/fleet).
 * @param {string} from
 * @returns {string | undefined}
 */
export function findSolidComponents(from) {
  if (process.env.SOLIDJS_COMPONENTS) return path.resolve(process.env.SOLIDJS_COMPONENTS);
  for (let dir = path.dirname(from); path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'solidjs-components');
    if (existsSync(path.join(candidate, 'solidjs-components-shared/packages/platform/seed.mjs'))) return candidate;
  }
  return undefined;
}

/**
 * @typedef {object} Demo
 * @property {Record<string, any>[]} documents
 * @property {{ name: string, email: string, role?: string }[]} people
 * @property {string} password
 * @property {Record<string, string>} [urls] - Start pages, relative to the app
 */

/**
 * @typedef {object} SetupOptions
 * @property {string} title - e.g. "SDMS demo"
 * @property {string} appRoot - The app's folder
 * @property {import('./server-config.mjs').OwnConfig} ownConfig - The app's config; its `db` is the database and index created
 * @property {number} appPort - The app's dev port (for the closing hint)
 * @property {(o: { platform: Record<string, any>, solidRoot: string, now: Date, urlRoot: string }) => Demo | Promise<Demo>} build
 *   Builds the documents. `platform` is solidjs-components-shared's packages/platform/documents.mjs.
 */

/**
 * Runs the setup with the command-line options (`--reset`, `--help`).
 * @param {SetupOptions} o
 */
export async function setupDatabase({ title, appRoot, ownConfig, appPort, build }) {
  const db = ownConfig.db;
  const usage = `Usage: pnpm db:setup [--reset]

Creates the ${title} database and Elasticsearch index "${db}", and writes fieldtec-web's
server/config/${ownConfig.name}.json for it (port ${ownConfig.port}, Redis database ${ownConfig.redisDatabase}).

  --reset   replace the database and index if they already exist`;
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return console.log(usage);
  const unknown = args.filter((a) => a !== '--reset');
  if (unknown.length) fail(`Unknown option "${unknown[0]}".\n\n${usage}`);
  const reset = args.includes('--reset');

  let n = 0;
  const step = (text) => console.log(`\n${bold(`${++n}. ${text}`)}`);

  step('Find fieldtec-web and solidjs-components');
  const fieldtec = findFieldtec(appRoot);
  if (!fieldtec) fail('fieldtec-web not found. Check it out beside this workspace (e.g. ~/git/fieldtec-web), or set FIELDTEC_WEB.');
  ok(`fieldtec-web at ${fieldtec}`);
  const solidRoot = findSolidComponents(appRoot);
  if (!solidRoot) fail('solidjs-components not found (its platform package loads the database). Check it out beside this workspace, or set SOLIDJS_COMPONENTS.');
  const platformDir = path.join(solidRoot, 'solidjs-components-shared/packages/platform');
  if (!existsSync(path.join(platformDir, 'node_modules'))) fail(`${platformDir} isn't installed. Run pnpm install in ${path.dirname(path.dirname(platformDir))}.`);
  ok(`solidjs-components at ${solidRoot}`);
  const load = (file) => import(pathToFileURL(path.join(platformDir, file)).href);
  const [services, seed, platform] = await Promise.all([load('services.mjs'), load('seed.mjs'), load('documents.mjs')]);

  step('Check MongoDB, Elasticsearch and Redis');
  const urls = services.serviceUrls(readConfig(configFile(fieldtec, 'development')));
  if (services.PROTECTED_DATABASES.includes(db)) fail(`"${db}" is an existing application database: an app's demo needs its own.`);
  let mongo;
  try {
    mongo = await services.mongoStatus(urls.mongo, db);
  } catch (error) {
    fail(`MongoDB at ${urls.mongo} isn't answering (${services.describeError(error)}).`);
  }
  ok(`MongoDB ${mongo.version} at ${urls.mongo}`);
  if (mongo.documents && !reset) fail(`Database "${db}" already has ${mongo.documents} documents. Run again with --reset to replace it.`);
  try {
    ok(`Elasticsearch ${await services.elasticsearchVersion(urls.es)} at ${urls.es}`);
    await services.redisCommands(urls.redis, [['PING']]);
    ok(`Redis at ${urls.redis} (this app uses database ${ownConfig.redisDatabase})`);
  } catch (error) {
    fail(`${services.describeError(error)}`);
  }

  step(`Write fieldtec-web's server config (server/config/${ownConfig.name}.json)`);
  try {
    ok(`${writeOwnServerConfig(fieldtec, ownConfig)}: database and index "${db}", port ${ownConfig.port}, Redis database ${ownConfig.redisDatabase}`);
  } catch (error) {
    fail(error.message);
  }

  step(mongo.documents ? `Replace database and index "${db}"` : `Create database and index "${db}"`);
  const urlRoot = `http://localhost:${ownConfig.port}`;
  const demo = await build({ platform, solidRoot, now: new Date(), urlRoot });
  console.log(`Built ${demo.documents.length} documents.`);
  try {
    // Flushing the app's Redis database drops the templates and rules a running fieldtec-web cached,
    // and signs everyone out.
    await seed.seedDatabase({ documents: demo.documents, db, mongo: urls.mongo, es: urls.es, reset, redis: urls.redis, redisDb: ownConfig.redisDatabase });
  } catch (error) {
    fail(error.message);
  }

  console.log(`\nSign in with any of these (password for everyone: ${demo.password}):`);
  for (const p of demo.people) console.log(`  ${p.email.padEnd(34)} ${p.name}${p.role ? ` · ${p.role}` : ''}`);
  step('Next');
  console.log(`   pnpm dev   (fieldtec-web on :${ownConfig.port} + the app on http://localhost:${appPort}; restart it if it's running)`);
}
