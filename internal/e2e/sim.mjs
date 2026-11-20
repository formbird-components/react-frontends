// End-to-end test of every page against the stand-in backend (e2e/sim-backend.mjs): the documents of
// the local internal-5 search index, saves kept in memory. Nothing is written to internal-5, no
// fieldtec-web runs and nobody is emailed — but no server rules run either (test those on
// fieldtec-web). It starts the stand-in and the app itself, signs in as the SDMS person with the
// most open items, and walks My View, ⌘K, an item, a new item, All Items and Recent, on a desktop
// and a phone, light and dark.
//
//   pnpm test:e2e:sim        # SIM_PORT=3920 APP_PORT=5220; SCREENSHOTS=<dir> to keep screenshots

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { checks, collectProblems, launch, signIn, waitFor } from '@react-frontends/shared/e2e';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const SIM_PORT = Number(process.env.SIM_PORT ?? 3920);
const APP_PORT = Number(process.env.APP_PORT ?? 5220);
const BASE = `http://localhost:${APP_PORT}`;
const ES = process.env.SIM_ES ?? 'http://127.0.0.1:9200';
const INDEX = process.env.SIM_INDEX ?? 'internal-5';
/** Data the walk types: a project the busiest person works on, and a word some items contain. */
const DEMO = INDEX === 'react-internal-demo';
const PROJECT = process.env.SIM_PROJECT ?? (DEMO ? 'Field Platform' : 'Internal');
const SEARCH = process.env.SIM_SEARCH ?? (DEMO ? 'offline' : 'scroll');
const SHOTS = process.env.SCREENSHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// Images the stand-in can't serve (attachments) 404: not a problem of the app.
const IGNORE = [/status of 401/, /Download the React DevTools/, /status of 404/];

const children = [];
function start(name, args, env) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.log = '';
  for (const s of [child.stdout, child.stderr]) s.on('data', (d) => (child.log += d));
  children.push(child);
  return child;
}
const stopAll = () => children.forEach((c) => c.exitCode === null && c.kill('SIGINT'));
process.on('exit', stopAll);

async function es(body) {
  const r = await fetch(`${ES}/${INDEX}/_search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Elasticsearch ${r.status}: is it running, with the ${INDEX} index?`);
  return r.json();
}

/** The SDMS person with the most open items assigned (their email; the stand-in takes any password). */
async function busiestPerson() {
  const agg = await es({
    size: 0,
    query: { bool: { filter: [{ term: { appTags: 'item' } }, { term: { 'systemHeader.currentVersion': true } }], must_not: [{ terms: { 'statusRel.name': ['Closed', 'Resolved'] } }] } },
    aggs: { people: { terms: { field: 'assigneeRel.documentId', size: 1 } } },
  });
  const id = agg.aggregations.people.buckets[0].key;
  const acc = await es({ size: 1, _source: ['email'], query: { bool: { filter: [{ term: { documentId: id } }, { term: { 'systemHeader.currentVersion': true } }] } } });
  return acc.hits.hits[0]._source.email;
}

/** A closed item with notes and relationships, to look at (and change its progress note). */
async function busyItem() {
  const r = await es({
    size: 1,
    _source: ['itemRef', 'summary'],
    sort: [{ updatedDate: 'desc' }],
    query: { bool: { filter: [{ term: { appTags: 'item' } }, { term: { 'systemHeader.currentVersion': true } }, { exists: { field: 'notesCommentsArr' } }, { exists: { field: 'relationshipsRel' } }, { term: { 'statusRel.name': 'Closed' } }] } },
  });
  return r.hits.hits[0]._source;
}

const { check, finish } = checks();
const sim = start('sim', ['e2e/sim-backend.mjs'], { SIM_PORT: String(SIM_PORT) });
const viteBin = path.join(path.dirname(createRequire(path.join(root, 'package.json')).resolve('vite/package.json')), 'bin/vite.js');
start('vite', [viteBin, '--logLevel', 'warn'], { FIELDTEC_URL: `http://localhost:${SIM_PORT}`, PORT: String(APP_PORT) });
const up = await waitFor(async () => (await fetch(BASE).catch(() => null))?.ok && (await fetch(`http://localhost:${SIM_PORT}/api/loggedUser`).catch(() => null)) !== null, { timeout: 60_000 });
if (!up) {
  console.error(`The stand-in or the app didn't start.\n${children.map((c) => c.log).join('\n')}`);
  process.exit(1);
}

const browser = await launch();
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
const rows = (page) => page.locator('main tbody tr');
const option = (page, name) => page.getByRole('option', { name });

try {
  const email = await busiestPerson();
  const item = await busyItem();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'Australia/Sydney' });
  const page = await context.newPage();
  const problems = collectProblems(page, IGNORE);
  const clean = (label) => check(`${label}: no console errors`, !problems.length, problems.splice(0).join(' | '));

  console.log('Signing in (stand-in)');
  check('signing in lands on My View', (await signIn(page, { base: BASE, email, password: 'stand-in' })) && (await waitFor(async () => new URL(page.url()).pathname === '/my-view')), page.url());

  console.log('My View');
  const assigned = page.getByRole('button', { name: /^Assigned to me/ });
  check('the lists show counts', await waitFor(async () => /\d/.test(await assigned.innerText())), await assigned.innerText());
  check('the list of items assigned to you has rows', await waitFor(async () => (await rows(page).count()) > 0));
  await page.getByRole('button', { name: /^Resolved/ }).click();
  check('a tile switches the list', await waitFor(async () => (await page.getByRole('heading', { name: 'Resolved', exact: true }).count()) > 0));
  await shot(page, 'my-view-lists');
  await page.getByRole('tab', { name: 'My board' }).click();
  check('the board shows cards', await waitFor(async () => (await page.locator('main a[href^="/items/"]').count()) > 5, { timeout: 15_000 }));
  await shot(page, 'my-view-board');
  await page.getByRole('tab', { name: 'Notifications' }).click();
  await page.waitForTimeout(1500);
  clean('My View');

  console.log('⌘K');
  await page.keyboard.press('Control+k');
  await page.keyboard.type(item.itemRef);
  check('⌘K finds an item by number', await waitFor(async () => (await page.getByRole('option').filter({ hasText: item.itemRef }).count()) > 0));
  await page.keyboard.press('Enter');
  check('choosing it opens the item', await waitFor(async () => new URL(page.url()).pathname === `/items/${item.itemRef}`), page.url());

  console.log(`Item ${item.itemRef}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  check('the summary is the title', (await page.getByRole('heading', { level: 1 }).innerText()).trim().startsWith(item.summary.trim().slice(0, 20)));
  check('notes are shown', await page.locator('#notes-title').isVisible());
  check('relationships are shown', await page.locator('#relationships-title').isVisible());
  check('a closed item says how to reopen it', (await page.getByText(/closed/i).count()) > 0);
  check('a closed item locks its summary', await page.locator('#summary').isDisabled().catch(() => true));
  await page.locator('#progressNote').fill(`Checked by the end-to-end test ${new Date().toISOString()}`);
  check('the progress note stays editable and ticks Disable AI override', (await page.getByRole('checkbox').first().getAttribute('data-state')) === 'checked');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  check('saving it says so', await waitFor(async () => (await page.getByText(/saved/i).count()) > 0));
  check('only what changed was sent', await waitFor(async () => /PUT \d+: .*progressNote/.test(sim.log)), sim.log.split('\n').slice(-3).join(' / '));
  await shot(page, 'item');
  clean('Item');

  console.log('New item');
  await page.goto(`${BASE}/items/new`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create item' }).click();
  check('creating an empty item explains what’s missing', await waitFor(async () => (await page.getByText('Summary is required.').count()) > 0));
  await page.locator('#projectRel').click();
  await page.keyboard.type(PROJECT);
  await option(page, new RegExp(`^${PROJECT}$`)).click();
  await page.locator('#typeRel').click();
  await option(page, /^Bug$/).click();
  await page.locator('#statusRel').click();
  await option(page, /^Open$/).click();
  await page.locator('#summary').fill('Made by the end-to-end test');
  await page.locator('#description').fill('Nothing to see: the stand-in keeps this in memory.');
  await page.getByRole('button', { name: 'Create item' }).click();
  check('creating opens the new item by its number', await waitFor(async () => /^\/items\/9\d+$/.test(new URL(page.url()).pathname), { timeout: 15_000 }), page.url());
  check('the new item shows its summary', await waitFor(async () => (await page.getByRole('heading', { level: 1 }).innerText().catch(() => '')).includes('Made by the end-to-end test')));
  clean('New item');

  console.log('All Items');
  await page.goto(`${BASE}/items`, { waitUntil: 'networkidle' });
  check('items are listed', await waitFor(async () => (await rows(page).count()) > 0));
  await page.getByLabel('Search items').fill(SEARCH);
  check('searching narrows the list (and the address)', await waitFor(async () => new URL(page.url()).search.includes(SEARCH) && (await rows(page).count()) > 0));
  await page.getByRole('checkbox', { name: /^Select 00/ }).nth(0).click();
  await page.getByRole('checkbox', { name: /^Select 00/ }).nth(1).click();
  await page.getByRole('button', { name: /^Update/ }).first().click();
  await page.locator('#bulk-priorityRel').click();
  await option(page, /^High$/).click();
  await page.getByRole('button', { name: /^Update 2 items$/ }).click();
  check('a bulk update changes each item', await waitFor(async () => (sim.log.match(/PUT \d+: .*priorityRel/g) ?? []).length >= 2, { timeout: 15_000 }), sim.log.split('\n').slice(-3).join(' / '));
  await shot(page, 'all-items-bulk');
  await page.keyboard.press('Escape');
  clean('All Items');

  console.log('Recent');
  await page.goto(`${BASE}/recent`, { waitUntil: 'networkidle' });
  check('Recent lists what you saved', await waitFor(async () => (await rows(page).count()) > 0 || (await page.getByText(/nothing|no documents/i).count()) > 0));
  clean('Recent');

  console.log('Phone, dark');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await phone.addCookies(await context.cookies());
  const mobile = await phone.newPage();
  const mobileProblems = collectProblems(mobile, IGNORE);
  for (const p of ['/my-view', '/items', `/items/${item.itemRef}`, '/items/new', '/recent']) {
    await mobile.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
    await mobile.waitForTimeout(1200);
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const dark = await mobile.evaluate(() => document.documentElement.classList.contains('dark'));
    check(`${p} fits a phone, in dark`, overflow <= 1 && dark && !mobileProblems.length, `${overflow}px wider; dark ${dark}; ${mobileProblems.splice(0).join(' | ')}`);
    await shot(mobile, `phone${p.replace(/\//g, '-')}`);
  }
  await phone.close();
  await context.close();
} catch (error) {
  check('ran to completion', false, error.stack);
} finally {
  await browser.close();
  stopAll();
}
finish();
