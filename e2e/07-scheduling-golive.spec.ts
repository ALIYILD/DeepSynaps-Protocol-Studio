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
        access_token: 'clinician-demo-token',
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

async function navToScheduling(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).demoLogin === 'function');
  await page.evaluate(async () => {
    localStorage.setItem('ds_onboarding_complete', 'true');
    await (window as any).demoLogin('clinician-demo-token');
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
    expect(content).toContain('Appointments');
    await expect(page.locator('[data-testid="ds-schedule-demo-banner"]')).toBeVisible();
    const fatal = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('net::ERR'));
    expect(fatal).toHaveLength(0);
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
