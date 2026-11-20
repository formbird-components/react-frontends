// `pnpm dev` for an app: fieldtec-web (the backend) and the app (Vite) together.
//
// 1. fieldtec-web, run from its checkout with a server config:
//    - an existing one by name (`config`; its `port` is the backend's), or
//    - the app's own (`ownConfig`), rewritten from development.json on each start (server-config.mjs).
//    If something already answers on that port, it is used as is. Its output goes to the terminal
//    (dimmed, "[fieldtec-web]") and to <app>/logs/fieldtec-web.log.
// 2. The app on Vite, proxying /api and /auth to that backend (vite.config.ts reads FIELDTEC_URL).
// Ctrl+C (or SIGTERM) stops both (fieldtec-web only if this started it, and with SIGINT: on SIGTERM
// fieldtec-web saves an "error document" to its database).
//
// Settings (environment variables):
//   FIELDTEC_WEB     the fieldtec-web checkout (default: the nearest fieldtec-web folder beside the
//                    app's repo or beside a folder above it, e.g. ~/git/fieldtec-web)
//   FIELDTEC_CONFIG  run this existing server/config/<name>.json instead (never written)
//   FIELDTEC_URL     use a backend that is already running elsewhere; start nothing
//   PORT             the app's port (vite.config.ts; not passed on to fieldtec-web, which would take it)
//   ALLOWED_HOSTS    more host names to accept (comma-separated; *.coder.formbird.com is allowed)
//
//   // <app>/scripts/dev.mjs
//   import { startDev } from '@react-frontends/shared/dev';
//   await startDev({ appRoot: path.resolve(import.meta.dirname, '..'), config: 'solid-fleet' });

import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { configFile, findFieldtec, readConfig, writeOwnServerConfig } from './server-config.mjs';

export { findFieldtec, ownServerConfig, writeOwnServerConfig } from './server-config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dim = (text) => `\x1b[2m${text}\x1b[22m`;
const bold = (text) => `\x1b[1m${text}\x1b[22m`;
const say = (text) => console.log(`${bold('[dev]')} ${text}`);

const answers = (url) =>
  fetch(url, { signal: AbortSignal.timeout(3000) }).then(
    () => true,
    () => false,
  );

/**
 * @typedef {object} DevOptions
 * @property {string} appRoot - The app's folder (vite.config.ts; logs/ go here)
 * @property {string} [config] - An existing fieldtec-web config to run (server/config/<config>.json)
 * @property {string} [missingConfigHint] - Added to the error when that config doesn't exist (how to create it)
 * @property {import('./server-config.mjs').OwnConfig} [ownConfig] - The app's own config, written on each start
 * @property {number} [timeoutMs] - How long fieldtec-web may take to answer (default 180 s)
 */

/**
 * Starts fieldtec-web (unless one answers already) and the app's Vite dev server; resolves once
 * both are up. Ctrl+C (or SIGTERM) stops what it started.
 * @param {DevOptions} o
 */
export async function startDev({ appRoot, config, missingConfigHint, ownConfig, timeoutMs = 180_000 }) {
  /** The fieldtec-web process this started (stopped on exit, nothing else is). */
  let server;
  let stopping = false;
  const running = () => server && server.exitCode === null && server.signalCode === null;
  // fieldtec-web is stopped with SIGINT (what Ctrl+C sends it), never SIGTERM: on SIGTERM it saves an
  // "error document" to its database (ExpressServer's gracefulExit). It takes up to ~10 s to close.
  const stopServer = async () => {
    if (!running()) return;
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGINT');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 30_000))]);
    if (running()) server.kill('SIGKILL');
  };
  const fail = async (text) => {
    console.error(`${bold('[dev]')} \x1b[31m${text}\x1b[39m`);
    stopping = true;
    await stopServer();
    process.exit(1);
  };
  // Last resort (an uncaught error): don't leave fieldtec-web running without us.
  process.on('exit', () => {
    if (running()) server.kill('SIGINT');
  });

  let backend = process.env.FIELDTEC_URL;
  if (backend) {
    say(`Using the backend at ${backend} (FIELDTEC_URL).`);
  } else {
    const fieldtec = findFieldtec(appRoot);
    if (!fieldtec) return fail('fieldtec-web not found. Check it out beside this repo (e.g. ~/git/fieldtec-web), or set FIELDTEC_WEB or FIELDTEC_URL.');
    // FIELDTEC_CONFIG picks an existing config instead (the app's own is only written under its own name).
    const chosen = process.env.FIELDTEC_CONFIG;
    const own = ownConfig && (!chosen || chosen === ownConfig.name) ? ownConfig : undefined;
    const name = own?.name ?? chosen ?? config;
    if (!name) return fail('No fieldtec-web config: give startDev `config` or `ownConfig`, or set FIELDTEC_CONFIG.');
    const file = configFile(fieldtec, name);
    if (own) {
      try {
        writeOwnServerConfig(fieldtec, own);
      } catch (error) {
        return fail(error.message);
      }
      say(`Wrote ${dim(file)}: database ${own.db}, index ${own.indexName ?? own.db}, Redis database ${own.redisDatabase}, port ${own.port}.`);
    } else if (!existsSync(file)) {
      return fail(`${file} doesn't exist.${!chosen && missingConfigHint ? ` ${missingConfigHint}` : ''}`);
    }
    const port = readConfig(file).port ?? 3000;
    backend = `http://localhost:${port}`;
    if (await answers(backend)) {
      say(`fieldtec-web is already running at ${backend}; using it.`);
    } else {
      if (!existsSync(path.join(fieldtec, 'server/ServerApp.js'))) return fail(`fieldtec-web's server isn't built. Run: (cd ${fieldtec}/projects/server && node build.mjs)`);
      mkdirSync(path.join(appRoot, 'logs'), { recursive: true });
      const logFile = path.join(appRoot, 'logs', 'fieldtec-web.log');
      const logName = path.relative(appRoot, logFile);
      const log = createWriteStream(logFile, { flags: 'w' });
      say(`Starting fieldtec-web (${dim(`${fieldtec}, config ${name}`)}) on ${backend}; its output also goes to ${logName}`);
      // fieldtec-web reads PORT (and would bind to the app's port): it gets its port from the config.
      const { PORT: _appPort, ...env } = process.env;
      server = spawn(process.execPath, ['--require', path.join(here, 'server-deps.cjs'), 'server/ServerApp.js'], {
        cwd: fieldtec,
        env: { ...env, WEB_APP_SERVER: name },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let pending = '';
      const relay = (chunk) => {
        log.write(chunk);
        pending += chunk.toString();
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) console.log(dim(`[fieldtec-web] ${line}`));
      };
      server.stdout.on('data', relay);
      server.stderr.on('data', relay);
      server.on('exit', (code, signal) => {
        if (!stopping) void fail(`fieldtec-web stopped (${signal ? `signal ${signal}` : `exit code ${code}`}). See ${logName}.`);
      });
      const until = Date.now() + timeoutMs;
      while (!(await answers(backend))) {
        if (server.exitCode !== null || server.signalCode !== null) return;
        if (Date.now() > until) return fail(`fieldtec-web didn't answer at ${backend} within ${Math.round(timeoutMs / 60_000)} minutes. See ${logName}.`);
        await new Promise((r) => setTimeout(r, 1000));
      }
      say(`fieldtec-web is up at ${backend}.`);
    }
  }

  // The app, on the app's own Vite. vite.config.ts reads FIELDTEC_URL for its proxy.
  process.env.FIELDTEC_URL = backend;
  const vitePath = createRequire(path.join(appRoot, 'package.json')).resolve('vite');
  const { createServer } = await import(pathToFileURL(vitePath).href);
  let vite;
  try {
    vite = await createServer({ root: appRoot, configFile: path.join(appRoot, 'vite.config.ts') });
    await vite.listen();
  } catch (error) {
    await vite?.close().catch(() => undefined);
    return fail(`The app didn't start: ${error.message}`);
  }
  vite.printUrls();
  say(`API calls (/api, /auth) go to ${backend}. Ctrl+C stops ${server ? 'both' : 'the app'}.`);

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      say('Stopping…');
      await vite.close();
      await stopServer();
      process.exit(0);
    });
  }
}
