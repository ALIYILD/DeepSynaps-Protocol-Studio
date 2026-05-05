import { test, expect, Page } from '@playwright/test';

async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'clinician-demo-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
  });

  await page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'smoke-user-1',
        email: 'smoke@clinic.com',
        display_name: 'Dr. Smoke Test',
        role: 'clinician',
        package_id: 'clinician_pro',
      }),
    });
  });
}

async function mockAllApi(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    if (route.request().url().includes('/auth/me')) {
      route.fallback();
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('Assessments v2 loads and renders key panels', async ({ page }) => {
  const errors = collectErrors(page);
  await injectAuth(page);
  await mockAllApi(page);

  await page.goto('/?page=assessments-v2');
  await page.waitForSelector('[data-testid="assessments-v2-root"]', { timeout: 15000 });

  await expect(page.locator('[data-testid="assessments-safety-banner"]')).toBeVisible();
  await expect(page.locator('[data-testid="assessments-queue-tab"]')).toBeVisible();
  await expect(page.locator('[data-testid="assessments-library-tab"]')).toBeVisible();
  await expect(page.locator('[data-testid="assessments-condition-map-tab"]')).toBeVisible();

  // Default tab is queue; should render queue container even if empty.
  await expect(page.locator('[data-testid="assessments-queue"]')).toBeVisible();

  // Switch to library tab and ensure library container renders.
  await page.locator('[data-testid="assessments-library-tab"]').click();
  await page.waitForTimeout(250);
  await expect(page.locator('[data-testid="assessments-library"]')).toBeVisible();

  // Condition map tab (cohort) must mount a stable container.
  await page.locator('[data-testid="assessments-condition-map-tab"]').click();
  await page.waitForTimeout(250);
  await expect(page.locator('[data-testid="assessments-condition-map"]')).toBeVisible();

  expect(errors).toEqual([]);
});

