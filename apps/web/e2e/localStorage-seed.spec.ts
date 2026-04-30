import { test, expect, Page } from '@playwright/test';

async function mockAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'mock-ls-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
  });
  await page.route('**/api/v1/**', (route) => {
    if (route.request().url().includes('/auth/me')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'ls-test-user',
          email: 'ls@test.com',
          display_name: 'LS Tester',
          role: 'clinician',
          package_id: 'clinician_pro',
        }),
      });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
}

test.describe('localStorage seeding', () => {

  test('patients are seeded when med-interactions page loads', async ({ page }) => {
    // ds_patients is seeded inside pgMedInteractionChecker, not on app root load.
    // Navigate to med-interactions to trigger seeding.
    await mockAuth(page);
    await page.goto('/');
    await page.waitForSelector('#content:not(:empty)', { timeout: 10000 });
    // Navigate to the page that seeds patients
    await page.evaluate(() => (window as any)._nav('med-interactions'));
    await page.waitForSelector('#content:not(:empty)', { timeout: 10000 });
    await page.waitForTimeout(300);
    const patients = await page.evaluate(() => {
      const raw = localStorage.getItem('ds_patients');
      return raw ? JSON.parse(raw) : [];
    });
    expect(patients.length).toBeGreaterThan(0);
  });

  test('navigation persists across page loads', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/#calendar');
    await page.waitForSelector('#content:not(:empty)', { timeout: 10000 });
    await page.reload();
    // mockAuth needs to be re-applied after reload — use addInitScript (already set)
    await page.waitForSelector('#content:not(:empty)', { timeout: 10000 });
    await expect(page.locator('#content')).not.toBeEmpty();
  });

});
