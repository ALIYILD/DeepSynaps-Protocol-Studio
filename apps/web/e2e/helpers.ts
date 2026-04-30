import { Page } from '@playwright/test';

export const TEST_CREDENTIALS = {
  clinician: { email: 'test@clinic.com', password: 'testpass123' },
  patient: { email: 'patient@test.com', password: 'testpass123' },
};

export async function loginAs(page: Page, role: 'clinician' | 'patient') {
  const creds = TEST_CREDENTIALS[role];
  await page.goto('/');
  // Wait for public shell or login form
  await page.waitForSelector('#public-shell, #login-form, input[type="email"]', { timeout: 10000 });

  // If already logged in, logout first
  const appShell = page.locator('#app-shell');
  if (await appShell.isVisible()) {
    await page.evaluate(() => {
      localStorage.clear();
      window.location.reload();
    });
    await page.waitForSelector('#public-shell', { timeout: 10000 });
  }

  // Fill login form
  await page.fill('input[type="email"], input[name="email"], #login-email', creds.email);
  await page.fill('input[type="password"], input[name="password"], #login-password', creds.password);
  await page.click('button[type="submit"], .btn-primary:has-text("Sign In"), .btn-primary:has-text("Login")');
}

export async function waitForNav(page: Page, pageId: string) {
  // Wait for the content to render for a given page
  await page.waitForFunction(
    (id) => (window as any).currentPage === id || document.querySelector(`[data-page="${id}"]`) !== null,
    pageId,
    { timeout: 10000 }
  );
}

export async function mockApiSuccess(page: Page) {
  // Intercept API calls and return mock data for offline testing
  await page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-1',
        email: 'test@clinic.com',
        display_name: 'Dr. Test User',
        role: 'clinician',
      }),
    });
  });

  await page.route('**/api/v1/patients', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'p1', first_name: 'Alice', last_name: 'Smith', primary_condition: 'ADHD', created_at: new Date().toISOString() },
          { id: 'p2', first_name: 'Bob', last_name: 'Jones', primary_condition: 'Anxiety', created_at: new Date().toISOString() },
        ]),
      });
    } else {
      route.continue();
    }
  });

  await page.route('**/api/v1/treatment-courses**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/auth/login', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        user: { id: 'test-user-1', email: 'test@clinic.com', display_name: 'Dr. Test', role: 'clinician' },
      }),
    });
  });
}

export async function setAuthToken(page: Page, role: 'clinician' | 'patient' = 'clinician') {
  // Inject mock auth state directly into localStorage to skip login UI.
  // Sets BOTH the legacy `ds_onboarding_done` and the canonical
  // `ds_onboarding_complete` flag so this helper works against builds
  // before AND after the PR #4 onboarding-key migration.
  await page.addInitScript((r) => {
    localStorage.setItem('ds_access_token', 'mock-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
    localStorage.setItem('ds_onboarding_complete', 'true');
  }, role);
}
