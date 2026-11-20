// fieldtec-web server configs (server/config/<name>.json): finding the checkout, reading a config,
// and writing the one config an app owns.
//
// An app that owns a config has it rewritten from fieldtec-web's development.json on each start:
// the same Mongo, Elasticsearch and Redis hosts, with the app's database, index, port and Redis
// database, and local email/password sign-in only (no SSO providers). Nothing else is ever written:
// a config by that name that this code didn't write is left alone (and the start refused).

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The key marking a config as written here (and so safe to rewrite). */
export const OWNER_KEY = '_writtenBy';

/** Config names an app may not own: fieldtec-web's own. */
const RESERVED = new Set(['development', 'development_master', 'development_redis', 'master', 'test', 'production', 'default', 'prod']);

/**
 * The fieldtec-web checkout: FIELDTEC_WEB, or a fieldtec-web folder beside `from` or beside a
 * folder above it (e.g. ~/git/fieldtec-web for ~/git/react-frontends/fleet).
 * @param {string} from - Where to start looking (the app's folder)
 * @returns {string | undefined}
 */
export function findFieldtec(from) {
  if (process.env.FIELDTEC_WEB) return path.resolve(process.env.FIELDTEC_WEB);
  for (let dir = path.dirname(from); path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'fieldtec-web');
    if (existsSync(path.join(candidate, 'server/config'))) return candidate;
  }
  return undefined;
}

export const configFile = (fieldtec, name) => path.join(fieldtec, 'server/config', `${name}.json`);

export const readConfig = (file) => JSON.parse(readFileSync(file, 'utf8'));

/**
 * @typedef {object} OwnConfig
 * @property {string} name - server/config/<name>.json (e.g. "react-internal")
 * @property {string} db - The Mongo database of the default and systemTypeComponent data services
 * @property {string} [indexName] - The Elasticsearch index (default: `db`)
 * @property {number} port - fieldtec-web's port
 * @property {number} redisDatabase - Its own Redis database (sessions and cached templates don't mix with other apps')
 * @property {string} [avlDb] - The avl data service's database (default: development.json's)
 */

/**
 * The config an app owns, made from fieldtec-web's development config.
 * @param {Record<string, any>} development - development.json
 * @param {OwnConfig} o
 * @returns {Record<string, any>}
 */
export function ownServerConfig(development, { name, db, indexName = db, port, redisDatabase, avlDb }) {
  const config = structuredClone(development);
  for (const service of ['default', 'systemTypeComponent']) {
    if (config.dataServices?.[service]) config.dataServices[service].db = db;
  }
  if (avlDb !== undefined && config.dataServices?.avl) config.dataServices.avl.db = avlDb;
  config.elasticsearch = { ...config.elasticsearch, indexName };
  config.port = port;
  if (config.redis) config.redis = { ...config.redis, databaseNumber: redisDatabase };
  // People sign in with the passwords stored in the database.
  delete config.authenticationProviders;
  delete config.keycloakAdmin;
  if (config.scim && typeof config.scim === 'object') config.scim.enabled = false;
  config[OWNER_KEY] = `@react-frontends/shared (${name}): rewritten from development.json each time the app's pnpm dev starts; edit the app's scripts/dev.mjs, not this file.`;
  return config;
}

/**
 * Why an app can't own a config by this name (or undefined when it can).
 * @param {string} fieldtec - The fieldtec-web checkout
 * @param {string} name
 */
export function ownershipProblem(fieldtec, name) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) return `"${name}" isn't a config name an app can own (letters, digits and dashes).`;
  if (RESERVED.has(name)) return `server/config/${name}.json is fieldtec-web's own config.`;
  const file = configFile(fieldtec, name);
  if (!existsSync(file)) return undefined;
  let existing;
  try {
    existing = readConfig(file);
  } catch {
    return `${file} exists and isn't JSON this code wrote.`;
  }
  if (!existing?.[OWNER_KEY]) return `${file} exists and wasn't written by this app's pnpm dev, so it is left alone.`;
  return undefined;
}

/**
 * Writes server/config/<name>.json from development.json (and copies development_log.json to
 * <name>_log.json). Refuses a name the app doesn't own.
 * @param {string} fieldtec - The fieldtec-web checkout
 * @param {OwnConfig} o
 * @returns {string} The config file written
 */
export function writeOwnServerConfig(fieldtec, o) {
  const problem = ownershipProblem(fieldtec, o.name);
  if (problem) throw new Error(`${problem} Pick another name for the app's own config.`);
  const development = configFile(fieldtec, 'development');
  if (!existsSync(development)) throw new Error(`${development} is missing: is ${fieldtec} a fieldtec-web checkout?`);
  const file = configFile(fieldtec, o.name);
  writeFileSync(file, `${JSON.stringify(ownServerConfig(readConfig(development), o), null, 4)}\n`);
  copyFileSync(path.join(fieldtec, 'server/config/development_log.json'), path.join(fieldtec, 'server/config', `${o.name}_log.json`));
  return file;
}
