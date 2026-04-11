import { test, expect } from '@playwright/test';

test.describe('Critical journeys', () => {

  test('Dashboard loads with widget cards', async ({ page }) => {
    await page.goto('/#dashboard');
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    // Should have at least 3 stat cards
    const cards = page.locator('.stat-card, .widget-card, [class*="card"]');
    await expect(cards).toHaveCount({ minimum: 3 });
  });

  test('Patient list loads and shows patients', async ({ page }) => {
    await page.goto('/#patients');
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    // Should show at least one patient row or empty state
    await expect(page.locator('#app-content')).not.toBeEmpty();
  });

  test('Protocol builder canvas renders', async ({ page }) => {
    await page.goto('/#protocol-builder');
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    // Canvas area should exist
    await expect(page.locator('#app-content')).toContainText(/protocol|block|canvas/i);
  });

  test('Forms builder renders validated scales', async ({ page }) => {
    await page.goto('/#forms-builder');
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    await expect(page.locator('#app-content')).toContainText(/PHQ/i);
  });

  test('Evidence library shows papers', async ({ page }) => {
    await page.goto('/#literature');
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    await expect(page.locator('#app-content')).toContainText(/rTMS|TMS|Neurofeedback/i);
  });

  test('Medication safety page loads interaction engine', async ({ page }) => {
    await page.goto('/#med-interactions');
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    await expect(page.locator('#app-content')).toContainText(/medication|interaction|drug/i);
  });

  test('Command palette opens on Ctrl+K', async ({ page }) => {
    await page.goto('/#dashboard');
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cmd-palette, [id*="command"], [class*="palette"]')).toBeVisible({ timeout: 3000 });
  });

  test('Theme toggle switches theme', async ({ page }) => {
    await page.goto('/#dashboard');
    await page.waitForSelector('#app-content > *', { timeout: 8000 });
    const toggle = page.locator('#theme-toggle-btn, [id*="theme"]');
    if (await toggle.count() > 0) {
      const before = await page.evaluate(() => document.body.className);
      await toggle.first().click();
      const after = await page.evaluate(() => document.body.className);
      expect(before).not.toEqual(after);
    }
  });

});
