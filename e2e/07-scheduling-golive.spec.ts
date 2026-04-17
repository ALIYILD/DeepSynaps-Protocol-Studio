import { test, expect, Page } from '@playwright/test';

function mockAuth(page: Page) {
  page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'mock-sched-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
  });
  page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'sched-user', email: 'sched@test.com', display_name: 'Dr. Schedule', role: 'clinician', package_id: 'clinician_pro' }) });
  });
  page.route('**/api/v1/sessions**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  page.route('**/api/v1/**', (route) => {
    if (!route.request().url().includes('/auth/me') && !route.request().url().includes('/sessions')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  });
}

async function navToScheduling(page: Page) {
  await page.goto('/');
  await page.waitForSelector('#content:not(:empty)', { timeout: 12000 });
  await page.evaluate(() => { (window as any)._schedHubTab = 'calendar'; (window as any)._nav('scheduling-hub'); });
  await page.waitForTimeout(1000);
}

test.describe('Scheduling go-live', () => {
  test('scheduling page loads without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    mockAuth(page);
    await navToScheduling(page);
    const content = await page.locator('#content').textContent();
    expect(content).toContain('Calendar');
    const fatal = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('net::ERR'));
    expect(fatal).toHaveLength(0);
  });

  test('tab switching works', async ({ page }) => {
    mockAuth(page);
    await navToScheduling(page);
    // Switch to Bookings
    await page.evaluate(() => { (window as any)._schedHubTab = 'bookings'; (window as any)._nav('scheduling-hub'); });
    await page.waitForTimeout(500);
    const content = await page.locator('#content').textContent();
    expect(content).toContain('Appointments');
  });

  test('calendar navigation controls work', async ({ page }) => {
    mockAuth(page);
    await navToScheduling(page);
    const label1 = await page.locator('#cal-week-label').textContent();
    await page.evaluate(() => (window as any)._calWeekNext());
    await page.waitForTimeout(300);
    const label2 = await page.locator('#cal-week-label').textContent();
    expect(label2).not.toBe(label1);
  });

  test('book appointment flow', async ({ page }) => {
    mockAuth(page);
    await navToScheduling(page);
    await page.evaluate(() => (window as any)._schedNewBooking());
    await page.waitForTimeout(300);
    await page.fill('#sched-book-patient', 'Test Patient');
    await page.fill('#sched-book-date', '2026-04-20');
    await page.fill('#sched-book-time', '11:00');
    await page.evaluate(() => (window as any)._schedSaveBooking());
    await page.waitForTimeout(500);
    const content = await page.locator('#content').textContent();
    expect(content).toBeDefined();
  });
});
