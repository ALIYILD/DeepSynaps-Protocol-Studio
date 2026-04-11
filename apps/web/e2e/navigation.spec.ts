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
function mockAuth(page: import('@playwright/test').Page) {
  page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'mock-nav-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
  });
  // Mock the /me endpoint so the app doesn't clear the token on failed fetch
  page.route('**/api/v1/auth/me', (route) => {
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
  page.route('**/api/v1/**', (route) => {
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
      mockAuth(page);
      await page.goto(`/#${route}`);
      // The app renders into #content (inside #app-shell). Wait for it to be non-empty.
      await page.waitForSelector('#content:not(:empty)', { timeout: 10000 });
      await page.waitForTimeout(300);
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
