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

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Click a demo-login button and wait for the authenticated shell. */
async function demoLoginAs(page: Page, token: string) {
  // Clear previous session
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch {}
  });
  await page.goto('/');
  await page.waitForSelector('#public-shell, body', { timeout: 15000 });

  // Trigger the demo login via the global demoLogin function
  await page.evaluate((t) => (window as any).demoLogin(t), token);

  // Wait for the app shell to appear (demo login has a 4s API timeout)
  await page.waitForSelector('#app-shell', { timeout: 12000 });
}

/** Collect JS errors during a page action. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// ── 1. Public shell loads ──────────────────────────────────────────────────────

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

// ── 2. Patient demo journey ────────────────────────────────────────────────────

test('patient demo login renders patient view', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'patient-demo-token');

  // Patient shell or patient-specific content should be visible
  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  // Should not show raw JS errors in page
  expect(body).not.toMatch(/Cannot read properties|undefined is not a function/i);
  expect(errors).toEqual([]);
});

// ── 3. Clinician demo journey ──────────────────────────────────────────────────

test('clinician demo login renders clinician dashboard', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'clinician-demo-token');

  // App shell should be rendered with sidebar
  const shell = page.locator('#app-shell');
  await expect(shell).toBeVisible({ timeout: 8000 });

  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

// ── 4. Settings / AI Status renders ────────────────────────────────────────────

test('settings AI status tab renders feature list', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'clinician-demo-token');

  // Navigate to AI status via hash routing
  await page.evaluate(() => (window as any)._nav?.('practice', { tab: 'ai-status' }));
  await page.waitForTimeout(1500);

  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  // Should not crash
  expect(body).not.toMatch(/Cannot read properties|undefined is not a function/i);
  expect(errors).toEqual([]);
});

// ── 5. DeepTwin placeholder wording ────────────────────────────────────────────

test('DeepTwin page shows demo/placeholder content', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'clinician-demo-token');

  await page.evaluate(() => (window as any)._nav?.('deeptwin'));
  await page.waitForTimeout(2000);

  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  // Must not claim real AI prediction
  expect(body).not.toMatch(/clinically validated prediction|FDA.approved|guaranteed outcome/i);
  expect(errors).toEqual([]);
});

// ── 6. No page-level JS errors during smoke journeys ───────────────────────────

test('multi-page navigation produces no JS errors', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'clinician-demo-token');

  // Navigate through several key pages
  const pages = ['dashboard', 'qeeg', 'deeptwin', 'protocols', 'patients'];
  for (const p of pages) {
    await page.evaluate((dest) => (window as any)._nav?.(dest), p);
    await page.waitForTimeout(1000);
  }

  // No uncaught JS errors should have occurred
  expect(errors).toEqual([]);
});
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

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Click a demo-login button and wait for the authenticated shell. */
async function demoLoginAs(page: Page, token: string) {
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch {}
  });
  await page.goto('/');
  await page.waitForSelector('#public-shell, body', { timeout: 15000 });

  // Trigger the demo login via the global demoLogin function
  await page.evaluate((t) => (window as any).demoLogin(t), token);

  // Wait for the app shell to appear (demo login has a 4s API timeout)
  await page.waitForSelector('#app-shell.visible, #patient-shell.visible', { timeout: 12000 });
}

/** Collect JS errors during a page action. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// ── 1. Public shell loads ──────────────────────────────────────────────────────

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

// ── 2. Patient demo journey ────────────────────────────────────────────────────

test('patient demo login renders patient view', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'patient-demo-token');

  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  expect(body).not.toMatch(/Cannot read properties|undefined is not a function/i);
  expect(errors).toEqual([]);
});

// ── 3. Clinician demo journey ──────────────────────────────────────────────────

test('clinician demo login renders clinician dashboard', async ({ page }) => {
  const errors = collectErrors(page);
  await demoLoginAs(page, 'clinician-demo-token');

  const shell = page.locator('#app-shell');
  await expect(shell).toBeVisible({ timeout: 8000 });

  const body = await page.locator('body').textContent();
  expect(body?.length).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

// ── 4. Settings / AI Status renders ────────────────────────────────────────────

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

// ── 5. DeepTwin placeholder wording ────────────────────────────────────────────

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

// ── 6. No page-level JS errors during smoke journeys ───────────────────────────

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
