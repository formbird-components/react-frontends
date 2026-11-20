// End-to-end smoke test against a running app (`pnpm dev`, or BASE=…): signed out, every address
// shows the sign-in page without errors. With SDMS_EMAIL and SDMS_PASSWORD set, it also signs in
// and opens every page the menu offers. Browser, sign-in, console checks: @react-frontends/shared/e2e.
//
//   pnpm test:e2e            # BASE=http://localhost:5191, CHROME=/usr/bin/google-chrome
import { checks, collectProblems, launch, requireApp, signIn, visit } from '@react-frontends/shared/e2e';

const BASE = process.env.BASE ?? 'http://localhost:5191';
const EMAIL = process.env.SDMS_EMAIL;
const PASSWORD = process.env.SDMS_PASSWORD;

await requireApp(BASE);
const { check, finish } = checks();
const browser = await launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Australia/Sydney' });
  const page = await context.newPage();
  const problems = collectProblems(page);

  console.log('Signed out');
  for (const path of ['/', '/my-view', '/items/new']) {
    problems.length = 0;
    await visit(page, `${BASE}${path}`, 300);
    const onLogin = new URL(page.url()).pathname === '/login';
    const form = (await page.locator('#email').count()) && (await page.locator('#password').count());
    check(`${path} shows the sign-in page`, onLogin && form && !problems.length, problems.join(' | ') || page.url());
  }
  check('the page is titled SDMS', (await page.title()) === 'SDMS', await page.title());

  if (EMAIL && PASSWORD) {
    console.log(`Signed in (${EMAIL})`);
    check('signing in lands on /my-view', (await signIn(page, { base: BASE, email: EMAIL, password: PASSWORD })) && new URL(page.url()).pathname === '/my-view', page.url());
    await page.locator('nav[aria-label=Main] a').first().waitFor({ timeout: 20000 });
    const links = await page.locator('nav[aria-label=Main] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    check('the menu offers pages', links.length > 0, JSON.stringify(links));
    for (const href of [...links, '/items/new']) {
      problems.length = 0;
      await visit(page, `${BASE}${href}`);
      const missing = await page.getByText("This page doesn't exist").count();
      check(`${href} renders`, !missing && !problems.length, problems.join(' | ') || (missing ? 'not found' : ''));
    }
  } else {
    console.log('(Set SDMS_EMAIL and SDMS_PASSWORD to also check the pages signed in.)');
  }
  await context.close();
} catch (error) {
  check('ran to completion', false, error.stack);
} finally {
  await browser.close();
}
finish();
