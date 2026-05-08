import { test, expect } from '@playwright/test';

test.describe('Patient Health Reports (v2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ds_access_token', 'mock-patient-token');
      localStorage.setItem('ds_onboarding_done', '1');
    });

    await page.route('**/api/v1/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'p1',
          email: 'patient@test.com',
          display_name: 'Alice Smith',
          role: 'patient',
          patient_id: 'pat-1',
        }),
      });
    });

    await page.route('**/api/v1/patient-portal/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/api/v1/reports/patient/me**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], is_demo: false, consent_active: true }),
      });
    });
  });

  test('Health Reports page loads at /#patient-health-reports', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    await page.evaluate(() => (window as any)._navPatient?.('patient-health-reports'));
    await page.waitForTimeout(1500);

    const tabs = page.locator('#pt-hr-tabs');
    await expect(tabs).toBeVisible({ timeout: 5000 });
  });

  test('all 4 tab buttons render', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    await page.evaluate(() => (window as any)._navPatient?.('patient-health-reports'));
    await page.waitForTimeout(1500);

    const buttons = page.locator('#pt-hr-tabs button[data-tab]');
    await expect(buttons).toHaveCount(4);

    for (const id of ['outcomes', 'analyzers', 'biometrics', 'documents']) {
      const btn = page.locator(`#pt-hr-tabs button[data-tab="${id}"]`);
      await expect(btn).toBeVisible();
    }
  });

  test('clicking each tab swaps the active panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    await page.evaluate(() => (window as any)._navPatient?.('patient-health-reports'));
    await page.waitForTimeout(1500);

    // Outcomes is active by default.
    const outcomesPanel = page.locator('.pt-hr-panel[data-tab="outcomes"]');
    await expect(outcomesPanel).toBeVisible();

    // Click Analyzers — its panel should reveal, others should hide.
    await page.locator('#pt-hr-tabs button[data-tab="analyzers"]').click();
    await page.waitForTimeout(200);
    const analyzersPanel = page.locator('.pt-hr-panel[data-tab="analyzers"]');
    await expect(analyzersPanel).toBeVisible();
    await expect(outcomesPanel).toBeHidden();

    // Click Biometrics.
    await page.locator('#pt-hr-tabs button[data-tab="biometrics"]').click();
    await page.waitForTimeout(200);
    const biometricsPanel = page.locator('.pt-hr-panel[data-tab="biometrics"]');
    await expect(biometricsPanel).toBeVisible();
    await expect(analyzersPanel).toBeHidden();

    // Click Documents.
    await page.locator('#pt-hr-tabs button[data-tab="documents"]').click();
    await page.waitForTimeout(200);
    const documentsPanel = page.locator('.pt-hr-panel[data-tab="documents"]');
    await expect(documentsPanel).toBeVisible();
    await expect(biometricsPanel).toBeHidden();
  });
});
