/**
 * Live preview smoke tests.
 *
 * Run against the deployed Netlify preview (no API mocks, no local dev server).
 * The app's built-in demo-mode shim handles API absence by returning
 * synthetic empty responses, so pages render without a backend.
 *
 * Usage:
 *   PLAYWRIGHT_BASE_URL=https://deepsynaps-studio-preview.netlify.app \
 *     npx playwright test e2e/smoke-live-preview.spec.ts
 */
import { test, expect, Page } from '@playwright/test';

// Helpers

/** Click a demo-login button and wait for the authenticated shell. */
async function demoLoginAs(page: Page, token: string) {
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch {}
  });
  await page.goto('/');
  await page.waitForSelector('#public-shell, body', { timeout: 15000 });
  await page.waitForFunction(
    () => typeof (window as any).demoLogin === 'function',
    { timeout: 10000 },
  );
  await page.evaluate(async (t) => {
    await (window as any).demoLogin(t);
  }, token);

  // Patient and clinician previews expose different root shells after login.
  await page.waitForSelector('#app-shell.visible, #patient-shell.visible', { timeout: 12000 });
}

/** Collect JS errors during a page action. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('public app shell loads without JS errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch {}
  });
  await page.goto('/');
  await page.waitForSelector('#public-shell', { timeout: 15000 });

  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('patient demo login renders patient view', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'patient-demo-token');

  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  expect(body).not.toMatch(/Cannot read properties|undefined is not a function/i);
  expect(errors).toEqual([]);
});

test('clinician demo login renders clinician dashboard', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'clinician-demo-token');

  const shell = page.locator('#app-shell');
  await expect(shell).toBeVisible({ timeout: 8000 });

  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('settings AI status tab renders', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'clinician-demo-token');

  await page.evaluate(() => (window as any)._nav?.('practice', { tab: 'ai-status' }));
  await page.waitForTimeout(1500);

  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  expect(body).not.toMatch(/Cannot read properties|undefined is not a function/i);
  expect(errors).toEqual([]);
});

test('DeepTwin page shows demo content without false AI claims', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'clinician-demo-token');

  await page.evaluate(() => (window as any)._nav?.('deeptwin'));
  await page.waitForTimeout(2000);

  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  expect(body).not.toMatch(/clinically validated prediction|FDA.approved|guaranteed outcome/i);
  expect(errors).toEqual([]);
});

test('multi-page navigation produces no JS errors', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'clinician-demo-token');

  const destinations = ['dashboard', 'qeeg', 'deeptwin', 'protocols', 'patients'];
  for (const dest of destinations) {
    await page.evaluate((d) => (window as any)._nav?.(d), dest);
    await page.waitForTimeout(1000);
  }

  expect(errors).toEqual([]);
});
