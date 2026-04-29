import { test, expect } from '@playwright/test';

const ROUTES = [
  'dashboard',
  'patients',
  'courses',
  'protocol-builder',
  'messaging',
  'calendar',
  'billing',
  'clinical-notes',
  'decision-support',
  'session-monitor',
  'outcome-prediction',
  'rules-engine',
  'ai-note-assistant',
  'forms-builder',
  'med-interactions',
  'consent-automation',
  'evidence-builder',
  'literature',
  'irb-manager',
  'data-export',
  'trial-enrollment',
  'clinic-analytics',
  'protocol-marketplace',
  'benchmark-library',
  'report-builder',
  'device-management',
  'quality-assurance',
  'staff-scheduling',
  'clinic-settings',
  'reminders',
  'wearables',
  'insurance-verification',
  'permissions',
  'multi-site',
  'guardian-portal',
  'pt-outcomes',
];

// Inject mock auth token before page load so the app boots authenticated
async function mockAuth(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'mock-nav-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
  });
  // Mock the /me endpoint so the app doesn't clear the token on failed fetch
  await page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'nav-test-user',
        email: 'nav@test.com',
        display_name: 'Nav Tester',
        role: 'clinician',
        package_id: 'clinician_pro',
      }),
    });
  });
  // Catch-all: mock all other API calls to return empty arrays
  await page.route('**/api/v1/**', (route) => {
    if (route.request().url().includes('/auth/me')) {
      route.fallback();
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test.describe('Navigation — all routes load', () => {
  for (const route of ROUTES) {
    test(`route: ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await mockAuth(page);
      await page.goto(`/#${route}`);
      // Wait for the app to settle: either app-shell or public-shell should be in DOM.
      // Some routes redirect or load heavy async modules; we just verify no JS errors.
      await page.waitForSelector('#app-shell, #public-shell', { state: 'attached', timeout: 15000 });
      await page.waitForTimeout(500);
      const relevantErrors = errors.filter(e =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('net::ERR') &&
        !e.includes('404')
      );
      expect(relevantErrors).toHaveLength(0);
    });
  }
});
