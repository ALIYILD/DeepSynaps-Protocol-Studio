import { test, expect, Page } from '@playwright/test';

async function mockAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'mock-wb-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
  });
  await page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'wb-clinician', email: 'wb@test.com', display_name: 'Dr. WB', role: 'clinician' }),
    });
  });
  await page.route('**/api/v1/**', (route) => {
    if (route.request().url().includes('/auth/me')) { route.fallback(); return; }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
}

test.describe('qEEG Raw Workbench', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('page loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    expect(errors.filter(e => !e.includes('ResizeObserver') && !e.includes('source map'))).toEqual([]);
  });

  test('mark bad channel toggles and updates status', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    const initial = parseInt((await page.locator('#qwb-st-bad').textContent()) || '0', 10);
    await page.click('[data-channel="Fp1-Av"]');
    await page.click('button[data-action="mark-channel"]');
    await expect(page.locator('[data-channel="Fp1-Av"]')).toHaveClass(/bad/);
    await expect(page.locator('#qwb-st-bad')).toHaveText(String(initial + 1));
    await page.click('button[data-action="mark-channel"]');
    await expect(page.locator('#qwb-st-bad')).toHaveText(String(initial));
  });

  test('undo restores prior state', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    const initial = parseInt((await page.locator('#qwb-st-bad').textContent()) || '0', 10);
    await page.click('[data-channel="Fp1-Av"]');
    await page.click('button[data-action="mark-channel"]');
    await expect(page.locator('#qwb-st-bad')).toHaveText(String(initial + 1));
    await page.click('button[data-action="undo"]');
    await expect(page.locator('#qwb-st-bad')).toHaveText(String(initial));
  });

  test('detector buttons create AI suggestions', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    await page.click('.qwb-tab[data-tab="ai"]');
    const before = await page.locator('.qwb-card[data-suggestion]').count();
    await page.click('button[data-action="detect-blink"]');
    await page.waitForTimeout(300);
    await expect(async () => {
      const after = await page.locator('.qwb-card[data-suggestion]').count();
      expect(after).toBeGreaterThan(before);
    }).toPass({ timeout: 5000 });
  });

  test('accept AI suggestion updates counts', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    await page.click('button[data-action="detect-blink"]');
    await page.waitForTimeout(300);
    await page.click('.qwb-tab[data-tab="ai"]');
    const firstCard = page.locator('.qwb-card[data-suggestion]').first();
    await firstCard.locator('button[data-ai-decision="accepted"]').click();
    await expect(firstCard).toContainText('Status: accepted');
  });

  test('raw/cleaned/overlay/split modes switch', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    for (const mode of ['raw', 'cleaned', 'overlay', 'split']) {
      await page.click(`#qwb-view-toggle button[data-view="${mode}"]`);
      await expect(page.locator(`#qwb-view-toggle button[data-view="${mode}"]`)).toHaveClass(/active/);
    }
  });

  test('save cleaning version updates status', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    // Make a change
    await page.click('[data-channel="Fp1-Av"]');
    await page.click('button[data-action="mark-channel"]');
    await expect(page.locator('#qwb-st-save')).toContainText('unsaved');
    // Save
    await page.click('#qwb-save');
    await page.waitForTimeout(500);
    await expect(page.locator('#qwb-st-save')).not.toContainText('unsaved');
  });

  test('export modal opens and cancels', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    await page.click('#qwb-export');
    await expect(page.locator('#qwb-export-modal')).toBeVisible();
    await page.click('#qwb-export-cancel');
    await expect(page.locator('#qwb-export-modal')).toBeHidden();
  });

  test('re-run qEEG shows notice', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    await page.click('#qwb-rerun');
    await page.waitForTimeout(500);
    await expect(page.locator('#qwb-rerun-notice')).toBeVisible();
  });

  test('AI assistant returns grounded response', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    await page.click('.qwb-tab[data-tab="log"]');
    await page.fill('#qwb-chat-input', 'Why is C4 flagged?');
    await page.click('#qwb-chat-send');
    await expect(page.locator('.qwb-chat-msg-ai').last()).toContainText('C4', { timeout: 5000 });
  });

  test('display modes row/stack/butterfly switch', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    for (const mode of ['row', 'stack', 'butterfly']) {
      await page.click(`#qwb-display-toggle button[data-display="${mode}"]`);
      await expect(page.locator(`#qwb-display-toggle button[data-display="${mode}"]`)).toHaveClass(/active/);
    }
  });

  test('clinician sign-off records and shows in status bar', async ({ page }) => {
    await page.goto('/#/qeeg-raw-workbench/demo');
    await page.waitForSelector('#qwb-canvas', { timeout: 10000 });
    // Ensure Cleaning tab is open
    await page.click('.qwb-tab[data-tab="cleaning"]');
    // Open sign-off modal
    await page.click('#qwb-open-signoff');
    await expect(page.locator('#qwb-signoff-modal')).toBeVisible();
    // Fill notes
    await page.fill('#qwb-signoff-notes', 'Reviewed and approved for reporting.');
    // Confirm sign-off
    await page.click('#qwb-signoff-confirm');
    await expect(page.locator('#qwb-signoff-modal')).toBeHidden();
    // Status bar should show signed off
    await expect(page.locator('#qwb-st-signoff')).toContainText('Signed off');
    // Cleaning panel should show signed-off card
    await expect(page.locator('#qwb-right-body')).toContainText('Signed off');
  });
});
