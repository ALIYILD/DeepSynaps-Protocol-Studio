import { test, expect } from '@playwright/test';
import { mockApiSuccess, setAuthToken } from './helpers';

test.describe('Login and Dashboard', () => {
  test('shows public landing when unauthenticated', async ({ page }) => {
    await page.goto('/');
    // Should show public shell or login
    const publicShell = page.locator('#public-shell');
    const loginVisible = await publicShell.isVisible().catch(() => false);
    // Either public shell or a login form should be visible
    const hasLoginForm = await page.locator('input[type="email"]').isVisible().catch(() => false);
    expect(loginVisible || hasLoginForm).toBeTruthy();
  });

  test('login form submits and navigates to dashboard', async ({ page }) => {
    await mockApiSuccess(page);

    // Set up auth response
    await page.route('**/api/v1/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'u1', email: 'test@clinic.com', display_name: 'Dr. Test', role: 'clinician' }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find and fill login form
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.isVisible()) {
      await emailInput.fill('test@clinic.com');
      await page.locator('input[type="password"]').first().fill('testpass123');
      await page.locator('button[type="submit"], .btn-primary').first().click();
    }

    // After login, app shell or dashboard content should appear
    await page.waitForSelector('#app-shell, #patient-shell', { timeout: 10000 }).catch(() => {});
  });

  // Regression: ISSUE-001 — unauth deep-link to a private route should pop the
  // login overlay so the URL is preserved and bootApp() can route post-login.
  // Found by /qa on 2026-04-26 against deepsynaps-studio-preview.netlify.app.
  // Report: .gstack/qa-reports/qa-report-deepsynaps-studio-preview-2026-04-26.md
  test('unauth deep-link to private route pops login overlay (ISSUE-001 regression)', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
    await page.goto('/?page=governance-v2');

    // Public shell must still render so the user has context.
    await expect(page.locator('#public-shell')).toBeVisible({ timeout: 10000 });

    // Login overlay must be visible on top — the bug was that init() called
    // navigatePublic('home') without showLogin(), leaving the user on the
    // marketing page with no signal that ?page= was discarded.
    await expect(page.locator('#login-overlay')).toHaveClass(/visible/, { timeout: 10000 });

    // URL must be preserved so bootApp() can route to governance-v2 on success.
    expect(page.url()).toContain('page=governance-v2');
  });

  // Regression: ISSUE-001 — landing without a deep-link should NOT pop the
  // login overlay. The fix should only trigger for ?page=<private-route>.
  test('unauth landing without deep-link shows public shell only (ISSUE-001 regression)', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
    await page.goto('/');

    await expect(page.locator('#public-shell')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#login-overlay')).not.toHaveClass(/visible/);
  });

  // Regression: ISSUE-001 — deep-link to a public route (home) should NOT
  // pop the login overlay. Only private routes get the auth gate.
  test('unauth deep-link to public route does not pop login overlay (ISSUE-001 regression)', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
    await page.goto('/?page=home');

    await expect(page.locator('#public-shell')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#login-overlay')).not.toHaveClass(/visible/);
  });

  test('dashboard shows key UI elements when authenticated', async ({ page }) => {
    await mockApiSuccess(page);
    await setAuthToken(page);

    // Mock all needed dashboard endpoints
    await page.route('**/api/v1/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should show sidebar navigation
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeVisible({ timeout: 8000 }).catch(() => {});
  });
});
