// Public-site test: every nav/footer link goes somewhere real, the mobile menu works, the status page runs.
//   APP_URL=http://localhost:3000 node site.e2e.mjs
import { chromium } from 'playwright-core';
import { APP_URL, executablePath } from './lib.mjs';

let failures = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.log(`  FAIL  ${name}\n        ${String(err.message || err).split('\n')[0]}`); }
};

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await desktop.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  await step('Products scrolls to the features section', async () => {
    await desktop.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Products' }).click();
    await desktop.waitForURL(/#features$/);
    if (!(await desktop.locator('#features').isVisible())) throw new Error('#features not visible');
  });
  await step('Solutions scrolls to the solutions section', async () => {
    await desktop.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Solutions' }).click();
    await desktop.waitForURL(/#solutions$/);
    await desktop.getByText('Made for the way you meet').waitFor();
  });
  await step('Pricing scrolls to the pricing section', async () => {
    await desktop.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pricing' }).click();
    await desktop.waitForURL(/#pricing$/);
    await desktop.getByText('Simple pricing').waitFor();
  });
  for (const [label, url, heading] of [
    ['Resources', /\/help$/, 'Help & resources'],
  ]) {
    await step(`${label} opens the help page`, async () => {
      await desktop.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await desktop.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label }).click();
      await desktop.waitForURL(url);
      await desktop.getByRole('heading', { name: heading }).waitFor();
    });
  }
  for (const [label, url, heading] of [
    ['Privacy', /\/privacy$/, 'Privacy'],
    ['Terms', /\/terms$/, 'Terms of use'],
    ['Status', /\/status$/, 'Service status'],
  ]) {
    await step(`footer "${label}" opens its own page`, async () => {
      await desktop.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await desktop.locator('footer').getByRole('link', { name: label }).click();
      await desktop.waitForURL(url);
      await desktop.getByRole('heading', { name: heading, exact: true }).waitFor();
    });
  }
  await step('status page runs its live checks and shows a result for each', async () => {
    await desktop.goto(`${APP_URL}/status`, { waitUntil: 'domcontentloaded' });
    await desktop.locator('[data-testid="status-Meeting server"]').waitFor();
    await desktop.waitForFunction(() => !document.body.innerText.includes('Checking…'), null, { timeout: 70_000 });
  });
  await step('landing page no longer makes false claims', async () => {
    await desktop.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    const text = await desktop.locator('body').innerText();
    for (const bad of ['End-to-end encryption', 'up to 100', '1080p', 'automatic calendar invites']) {
      if (text.toLowerCase().includes(bad.toLowerCase())) throw new Error(`still says "${bad}"`);
    }
  });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await step('mobile: menu button opens a menu whose links work, and it closes again', async () => {
    await phone.locator('[data-testid=mobile-menu]').waitFor({ state: 'detached' });
    await phone.locator('[data-testid=mobile-menu-button]').click();
    await phone.locator('[data-testid=mobile-menu]').waitFor();
    await phone.locator('[data-testid=mobile-menu]').getByRole('link', { name: 'Resources' }).click();
    await phone.waitForURL(/\/help$/);
    await phone.locator('[data-testid=mobile-menu-button]').click();
    await phone.locator('[data-testid=mobile-menu-button]').click();
    await phone.locator('[data-testid=mobile-menu]').waitFor({ state: 'detached' });
  });
  await step('mobile: no horizontal scroll on landing or help', async () => {
    for (const path of ['/', '/help', '/status']) {
      await phone.goto(`${APP_URL}${path}`, { waitUntil: 'domcontentloaded' });
      const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) throw new Error(`${path} is ${overflow}px too wide`);
    }
  });
} finally {
  await browser.close();
}
console.log(failures === 0 ? '\nALL SITE STEPS PASSED' : `\n${failures} STEP(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
