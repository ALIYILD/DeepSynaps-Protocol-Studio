import { test, expect, Page } from '@playwright/test';

function mockAuth(page: Page) {
  page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'mock-dash-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
  });
  page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'dash-test-user',
        email: 'dash@test.com',
        display_name: 'Dr. Dashboard',
        role: 'clinician',
        package_id: 'clinician_pro',
      }),
    });
  });
}

function mockDashboardAPIs(page: Page, overrides: Record<string, any> = {}) {
  const data = {
    patients: [], courses: [], reviewQueue: [], adverseEvents: [],
    outcomes: null, consents: [], mediaQueue: [], wearableAlerts: null,
    ...overrides,
  };
  page.route('**/api/v1/patients', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: data.patients }) }));
  page.route('**/api/v1/treatment-courses**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: data.courses }) }));
  page.route('**/api/v1/review-queue**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: data.reviewQueue }) }));
  page.route('**/api/v1/adverse-events**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: data.adverseEvents }) }));
  page.route('**/api/v1/outcomes/aggregate**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data.outcomes ?? {}) }));
  page.route('**/api/v1/consent-records**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: data.consents }) }));
  page.route('**/api/v1/media/review-queue**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data.mediaQueue) }));
  page.route('**/api/v1/dashboard/overview**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overrides.overview ?? { is_demo: false, metrics: {}, schedule: [], safety_flags: [], activity_feed: [], system_health: {} }) }));
  page.route('**/api/v1/wearables/clinic/alerts/summary**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data.wearableAlerts ?? {}) }));
  page.route('**/api/v1/**', (route) => {
    if (!route.request().url().includes('/auth/me')) route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function waitForDashboard(page: Page) {
  await page.waitForSelector('#content:not(:empty)', { timeout: 12000 });
  await page.waitForTimeout(500);
}

test.describe('Dashboard go-live: empty state', () => {
  test('renders Get Started card when clinic is empty', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    mockAuth(page);
    page.addInitScript(() => { localStorage.removeItem('ds_setup_dismissed'); localStorage.setItem('ds_onboarding_done', '1'); });
    mockDashboardAPIs(page);
    await page.goto('/');
    await waitForDashboard(page);
    const content = await page.locator('#content').textContent();
    expect(content).toContain('Get started');
    const fatal = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('net::ERR'));
    expect(fatal).toHaveLength(0);
  });
});

test.describe('Dashboard go-live: API failure', () => {
  test('renders error state when all APIs fail', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    mockAuth(page);
    page.addInitScript(() => { localStorage.setItem('ds_onboarding_done', '1'); localStorage.setItem('ds_setup_dismissed', '1'); });
    page.route('**/api/v1/**', (route) => {
      if (route.request().url().includes('/auth/me')) return;
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fail"}' });
    });
    await page.goto('/');
    await waitForDashboard(page);
    const content = await page.locator('#content').textContent();
    expect(content).toContain('Unable to load');
    const fatal = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('net::ERR') && !e.includes('500'));
    expect(fatal).toHaveLength(0);
  });
});

test.describe('Dashboard go-live: KPI correctness', () => {
  test('stat cards show correct counts with populated data', async ({ page }) => {
    mockAuth(page);
    page.addInitScript(() => { localStorage.setItem('ds_onboarding_done', '1'); localStorage.setItem('ds_setup_dismissed', '1'); });
    const patients = [
      { id: 'p1', first_name: 'Alice', last_name: 'Smith' },
      { id: 'p2', first_name: 'Bob', last_name: 'Jones' },
    ];
    const courses = [
      { id: 'c1', patient_id: 'p1', status: 'active', modality_slug: 'rtms', planned_sessions_per_week: 3, sessions_delivered: 5, on_label: true, evidence_grade: 'A' },
      { id: 'c2', patient_id: 'p2', status: 'active', modality_slug: 'tdcs', planned_sessions_per_week: 2, sessions_delivered: 8, on_label: true, evidence_grade: 'B' },
    ];
    const outcomes = { responder_rate_pct: 67.3, assessment_completion_pct: 82.1 };
    mockDashboardAPIs(page, { patients, courses, outcomes });
    await page.goto('/');
    await waitForDashboard(page);
    const content = await page.locator('#content').textContent() || '';
    expect(content).toContain('Active Patients');
    expect(content).toContain('Active Courses');
    expect(content).toContain('67%');
  });
});
