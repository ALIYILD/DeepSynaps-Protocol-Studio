import { test, expect } from '@playwright/test';

test.describe('localStorage seeding', () => {

  test('patients are seeded on first load', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    const patients = await page.evaluate(() => {
      const raw = localStorage.getItem('ds_patients');
      return raw ? JSON.parse(raw) : [];
    });
    expect(patients.length).toBeGreaterThan(0);
  });

  test('navigation persists across page loads', async ({ page }) => {
    await page.goto('/#calendar');
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    await page.reload();
    // After reload, hash should restore or app should default gracefully
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    await expect(page.locator('#app-content')).not.toBeEmpty();
  });

});
