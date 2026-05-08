import { test, expect, Page } from '@playwright/test';

function mockAuth(page: Page) {
  page.addInitScript(() => {
    localStorage.setItem('ds_onboarding_complete', 'true');
  });
  page.route('**/api/v1/auth/demo-login', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        // Use a non-demo token so apiFetch does not short-circuit to the
        // synthetic demo shim (we want to exercise the scheduling API fallbacks
        // and error handling honestly in E2E).
        access_token: 'clinician-e2e-token',
        refresh_token: 'mock-refresh',
        user: {
          id: 'sched-user',
          email: 'sched@test.com',
          display_name: 'Dr. Schedule',
          role: 'clinician',
          package_id: 'clinician_pro',
        },
      }),
    });
  });
  page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'sched-user', email: 'sched@test.com', display_name: 'Dr. Schedule', role: 'clinician', package_id: 'clinician_pro' }) });
  });
  page.route('**/api/v1/sessions**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  page.route('**/api/v1/patients**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { id: 'pt-001', first_name: 'Test', last_name: 'Patient' },
          { id: 'pt-002', first_name: 'Second', last_name: 'Patient' },
        ],
      }),
    });
  });
  page.route('**/api/v1/reception/referrals**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  page.route('**/api/v1/staff-schedule**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  page.route('**/api/v1/rooms**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  page.route('**/api/v1/schedule-types**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
}

function mockAuthSessionsFail(page: Page) {
  mockAuth(page);
  page.unroute('**/api/v1/sessions**').catch(() => {});
  page.route('**/api/v1/sessions**', (route) => {
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'internal_error', message: 'boom' }) });
  });
}

async function navToScheduling(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).demoLogin === 'function');
  await page.evaluate(async () => {
    localStorage.setItem('ds_onboarding_complete', 'true');
    await (window as any).demoLogin('clinician-e2e-token');
    // Ensure clinician-capable role is available to non-React pages that
    // consult localStorage directly for gates (scheduling hub).
    localStorage.setItem('ds_user', JSON.stringify({
      id: 'sched-user',
      email: 'sched@test.com',
      display_name: 'Dr. Schedule',
      role: 'clinician',
      package_id: 'clinician_pro',
    }));
  });
  await expect(page.locator('#app-shell')).toHaveClass(/visible/);
  await page.waitForFunction(() => {
    const content = document.getElementById('content');
    return !!content && (content.textContent || '').trim().length > 0;
  });
  await page.evaluate(async () => {
    await (window as any)._nav('scheduling-hub');
  });
  await expect(page.locator('#content .dv2s-shell')).toBeVisible();
}

test.describe('Scheduling go-live', () => {
  test('scheduling page loads without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    mockAuth(page);
    await navToScheduling(page);
    const content = await page.locator('#content').textContent();
    expect(content).toContain('Calendar');
    await expect(page.locator('[data-testid="ds-schedule-demo-banner"]')).toBeVisible();
    const fatal = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('net::ERR'));
    expect(fatal).toHaveLength(0);
  });

  test('sessions API failure does not seed demo schedule', async ({ page }) => {
    mockAuthSessionsFail(page);
    await navToScheduling(page);
    await expect(page.locator('[data-testid="ds-schedule-demo-banner"]')).toHaveCount(0);
    await expect(page.locator('#content')).toContainText('Live schedule data unavailable');
  });

  test('view controls switch without crash', async ({ page }) => {
    mockAuth(page);
    await navToScheduling(page);
    await page.locator('.dv2s-view button[data-view="day"]').click();
    await expect(page.locator('.dv2s-view button.is-active')).toContainText('Day');
    await page.locator('.dv2s-view button[data-view="month"]').click();
    await expect(page.locator('.dv2s-view button.is-active')).toContainText('Month');
  });

  test('calendar navigation controls work', async ({ page }) => {
    mockAuth(page);
    await navToScheduling(page);
    const range = page.locator('.dv2s-range').first();
    const label1 = await range.textContent();
    await page.locator('.dv2s-nav-btn').last().click();
    await expect(range).not.toHaveText(label1 || '');
    const label2 = await range.textContent();
    expect(label2).not.toBe(label1);
  });

  test('new booking wizard opens with patient step', async ({ page }) => {
    mockAuth(page);
    await navToScheduling(page);
    await page.evaluate(() => (window as any)._schedNewBookingIntent());
    await expect(page.locator('.dv2s-modal')).toBeVisible();
    await expect(page.locator('.dv2s-modal')).toContainText('New booking');
    await expect(page.locator('.dv2s-modal')).toContainText('Search patient');
    await expect(page.locator('.dv2s-modal')).toContainText('create new patient');
  });
});
