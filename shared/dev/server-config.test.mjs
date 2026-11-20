import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OWNER_KEY, ownershipProblem, ownServerConfig, writeOwnServerConfig } from './server-config.mjs';

const development = {
  port: 3000,
  dataServices: {
    default: { providerName: 'mongodb', db: 'formbird', host: 'localhost' },
    systemTypeComponent: { providerName: 'mongodb', db: 'formbird', host: 'localhost' },
    avl: { providerName: 'mongodb', db: 'fieldtec-avl', host: 'localhost' },
  },
  elasticsearch: { host: '127.0.0.1:9200', indexName: 'formbird' },
  authenticationProviders: [{ name: 'sso' }],
  keycloakAdmin: { url: 'x' },
  scim: { scimProvisioningToken: 't' },
  redis: { host: '127.0.0.1', port: 6379 },
};

const options = { name: 'react-internal', db: 'internal-5', port: 3003, redisDatabase: 4, avlDb: 'fieldtec-avl' };

/** A fake fieldtec-web checkout with development.json, its log config, and maybe more configs. */
function checkout(configs = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'fieldtec-'));
  mkdirSync(path.join(root, 'server/config'), { recursive: true });
  const all = { development, development_log: { log: true }, ...configs };
  for (const [name, value] of Object.entries(all)) writeFileSync(path.join(root, 'server/config', `${name}.json`), JSON.stringify(value));
  return root;
}

describe('ownServerConfig', () => {
  it('points the app config at its database, index, port and Redis database, with local sign-in only', () => {
    const config = ownServerConfig(development, options);
    expect(config.dataServices.default.db).toBe('internal-5');
    expect(config.dataServices.systemTypeComponent.db).toBe('internal-5');
    expect(config.dataServices.avl.db).toBe('fieldtec-avl');
    expect(config.elasticsearch).toEqual({ host: '127.0.0.1:9200', indexName: 'internal-5' });
    expect(config.port).toBe(3003);
    expect(config.redis).toEqual({ host: '127.0.0.1', port: 6379, databaseNumber: 4 });
    expect(config).not.toHaveProperty('authenticationProviders');
    expect(config).not.toHaveProperty('keycloakAdmin');
    expect(config.scim).toEqual({ scimProvisioningToken: 't', enabled: false });
    expect(config[OWNER_KEY]).toMatch(/react-internal/);
    // development.json itself is untouched.
    expect(development.dataServices.default.db).toBe('formbird');
    expect(development).toHaveProperty('authenticationProviders');
  });

  it('keeps the avl database unless given, and can use another index', () => {
    const config = ownServerConfig({ ...development, dataServices: { ...development.dataServices, avl: { db: 'other-avl' } } }, { ...options, avlDb: undefined, indexName: 'idx' });
    expect(config.dataServices.avl.db).toBe('other-avl');
    expect(config.elasticsearch.indexName).toBe('idx');
  });
});

describe('writeOwnServerConfig', () => {
  it('writes the config and its log config, and rewrites its own', () => {
    const root = checkout();
    const file = writeOwnServerConfig(root, options);
    expect(JSON.parse(readFileSync(file, 'utf8')).dataServices.default.db).toBe('internal-5');
    expect(JSON.parse(readFileSync(path.join(root, 'server/config/react-internal_log.json'), 'utf8'))).toEqual({ log: true });
    expect(() => writeOwnServerConfig(root, { ...options, port: 3004 })).not.toThrow();
    expect(JSON.parse(readFileSync(file, 'utf8')).port).toBe(3004);
  });

  it("never overwrites a config it didn't write, or fieldtec-web's own", () => {
    const root = checkout({ 'internal-5': { port: 3000 } });
    expect(() => writeOwnServerConfig(root, { ...options, name: 'internal-5' })).toThrow(/wasn't written by/);
    expect(JSON.parse(readFileSync(path.join(root, 'server/config/internal-5.json'), 'utf8'))).toEqual({ port: 3000 });
    expect(ownershipProblem(root, 'development')).toMatch(/fieldtec-web's own/);
    expect(ownershipProblem(root, 'react-internal_log')).toMatch(/isn't a config name/);
    expect(ownershipProblem(root, '../evil')).toMatch(/isn't a config name/);
  });
});
