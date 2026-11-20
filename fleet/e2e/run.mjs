// End-to-end smoke test of the app against a running backend: signs in as each kind of person,
// opens every page their menu offers, and checks that it renders without errors. Needs the fleet
// demo on fieldtec-web (http://localhost:3006) and this app (`pnpm dev`, or BASE=…).
// Browser, sign-in, console checks: @react-frontends/shared/e2e.
//
//   pnpm test:e2e            # BASE=http://localhost:5190, CHROME=/usr/bin/google-chrome
import { checks, collectProblems, launch, requireApp, visit } from '@react-frontends/shared/e2e';

const BASE = process.env.BASE ?? 'http://localhost:5190';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Fleet1234!';
const PEOPLE = [
  ['olivia.bennett@example.com', 'Administrator', '/overview'],
  ['marcus.reid@example.com', 'Asset Manager', '/overview'],
  ['priya.shah@example.com', 'Supervisor', '/workshop'],
  ['tom.nguyen@example.com', 'Technician', '/workshop'],
  ['grace.kim@example.com', 'Operator', '/checks'],
  ['sofia.russo@example.com', 'Driver', '/bookings'],
];

await requireApp(BASE);
const { check, finish } = checks();
const browser = await launch();
try {
  for (const [email, role, home] of PEOPLE) {
    console.log(`${role} (${email})`);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Australia/Sydney' });
    const page = await context.newPage();
    const problems = collectProblems(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check('signed out, the app shows the sign-in page', new URL(page.url()).pathname === '/login');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.click('button[type=submit]');
    // Signing in goes to /, which sends each kind of person to their own start page.
    const landed = await page.waitForURL((u) => u.pathname === home, { timeout: 20000 }).then(() => true, () => false);
    check(`signing in lands on ${home}`, landed, page.url());
    await page.locator('nav[aria-label=Main] a').first().waitFor({ timeout: 20000 });
    const links = await page.locator('nav[aria-label=Main] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    check('the menu offers pages', links.length > 0, JSON.stringify(links));
    for (const href of links) {
      problems.length = 0;
      await visit(page, `${BASE}${href}`);
      const placeholder = await page.getByText('Coming soon').count();
      const missing = await page.getByText("This page doesn't exist").count();
      check(`${href} renders`, !placeholder && !missing && !problems.length, problems.join(' | ') || (placeholder ? 'placeholder' : missing ? 'not found' : ''));
    }
    await context.close();
  }
} catch (error) {
  check('ran to completion', false, error.stack);
} finally {
  await browser.close();
}
finish();
