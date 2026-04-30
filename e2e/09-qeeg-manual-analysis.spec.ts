import { expect, test, Page } from '@playwright/test';

async function bootQeegDemo(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'mock-qeeg-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
  });
  await page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'qeeg-test-user',
        email: 'qeeg@test.com',
        display_name: 'Dr. qEEG',
        role: 'clinician',
        package_id: 'clinician_pro',
      }),
    });
  });
}

test.describe('qEEG Raw Workbench manual analysis smoke', () => {
  test('manual analysis tab opens with required safety and reference sections', async ({ page }) => {
    await bootQeegDemo(page);
    await page.goto('/#/qeeg-raw-workbench/demo');

    await expect(page.getByTestId('qwb-root')).toBeVisible();
    await expect(page.getByTestId('qwb-tab-manual')).toBeVisible();

    await page.getByTestId('qwb-tab-manual').click();

    await expect(page.getByTestId('qwb-manual-analysis')).toBeVisible();
    await expect(page.getByTestId('qwb-manual-signal-quality')).toBeVisible();
    await expect(page.getByTestId('qwb-manual-artifact-panel')).toBeVisible();
    await expect(page.getByTestId('qwb-manual-findings-builder')).toBeVisible();
    await expect(page.getByTestId('qwb-manual-ref-loreta')).toContainText('Not computed in this build');
    await expect(page.getByTestId('qwb-manual-ref-bicoherence')).toContainText('Future module');
    await expect(page.getByTestId('qwb-manual-analysis')).toContainText('Decision-support only');
    await expect(page.getByTestId('qwb-manual-analysis')).toContainText('Clinician review required');
  });

  test('manual analysis exposes artifact and findings actions', async ({ page }) => {
    await bootQeegDemo(page);
    await page.goto('/#/qeeg-raw-workbench/demo');

    await page.getByTestId('qwb-tab-manual').click();

    await expect(page.getByTestId('qwb-manual-artifact-panel').getByRole('button', { name: 'Mark eye blink' })).toBeVisible();
    await expect(page.getByTestId('qwb-manual-artifact-panel').getByRole('button', { name: 'Reject epoch' })).toBeVisible();
    await expect(page.getByTestId('qwb-manual-findings-builder').getByRole('button', { name: 'Add to report' })).toBeVisible();
  });
});
