// What an app's end-to-end smoke test needs: system Chrome through Playwright, signing in, console
// problems that matter (not the expected ones), checks with a summary, and waiting.
//
//   import { checks, collectProblems, launch, requireApp, signIn } from '@react-frontends/shared/e2e';
//   const BASE = process.env.BASE ?? 'http://localhost:5190';
//   await requireApp(BASE);
//   const { check, finish } = checks();
//   const browser = await launch();
//   …
//   finish(); // prints "n/m checks passed" and exits 1 when any failed

import { chromium } from 'playwright';

/**
 * Console messages that aren't problems:
 * - the session probe before signing in answers 401;
 * - React's DevTools suggestion;
 * - headless Chrome's software WebGL logs performance notes while drawing maps.
 */
export const IGNORED_CONSOLE = [/status of 401/, /Download the React DevTools/, /GL Driver Message|GPU stall due to ReadPixels/];

/**
 * System Chrome (CHROME, default /usr/bin/google-chrome), headless.
 * @param {import('playwright').LaunchOptions} [options]
 */
export function launch(options = {}) {
  return chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'], ...options });
}

/** Exits with a message unless the app answers at `base`. */
export async function requireApp(base, hint = 'start it with pnpm dev') {
  const up = await fetch(base).then(
    (r) => r.ok,
    () => false,
  );
  if (!up) {
    console.error(`The app isn't running at ${base}: ${hint}.`);
    process.exit(1);
  }
}

/**
 * Errors and warnings the page logs (and uncaught errors), except the ignored ones. The array
 * fills as they happen; empty it (`problems.length = 0`) between pages.
 * @param {import('playwright').Page} page
 * @param {RegExp[]} [ignore]
 * @returns {string[]}
 */
export function collectProblems(page, ignore = IGNORED_CONSOLE) {
  const problems = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !ignore.some((r) => r.test(m.text())) && problems.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

/**
 * Signs in on the sign-in page (its #email and #password fields) and waits to leave it.
 * @param {import('playwright').Page} page
 * @param {{ base: string, email: string, password: string, loginPath?: string, timeout?: number }} o
 * @returns {Promise<boolean>} Whether the page left the sign-in page
 */
export async function signIn(page, { base, email, password, loginPath = '/login', timeout = 20_000 }) {
  if (new URL(page.url()).pathname !== loginPath) await page.goto(`${base}${loginPath}`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  return page.waitForURL((u) => u.pathname !== loginPath, { timeout }).then(
    () => true,
    () => false,
  );
}

/**
 * Opens a page and lets it settle (network idle, then `settle` ms for late renders).
 * @param {import('playwright').Page} page
 */
export async function visit(page, url, settle = 1200) {
  await page.goto(url, { waitUntil: 'networkidle' });
  if (settle) await page.waitForTimeout(settle);
}

/** Waits until `condition()` is truthy (polling), or the timeout; returns whether it became true. */
export async function waitFor(condition, { timeout = 10_000, interval = 250 } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    if (await condition()) return true;
    if (Date.now() > until) return false;
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** Checks printed as they run (✓/✗ with the detail of a failure), and a summary. */
export function checks() {
  const results = [];
  return {
    check(name, ok, detail = '') {
      results.push(!!ok);
      console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : `\n      ${String(detail).slice(0, 500)}`}`);
      return !!ok;
    },
    /** Prints "n/m checks passed" and exits (1 when any failed). */
    finish() {
      const passed = results.filter(Boolean).length;
      console.log(`\n${passed}/${results.length} checks passed`);
      process.exit(passed === results.length ? 0 : 1);
    },
  };
}
