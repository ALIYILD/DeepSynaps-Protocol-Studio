import { test, expect } from '@playwright/test';

// Patient Health Reports v2 (4-tab page).
//
// Boot pattern mirrors `05-patient-progress.spec.ts` because the 04b spec was
// originally authored without ever running against a real Chromium and the
// "rely on init() to take the patient branch" approach was racy on CI:
//
//   - The clinician landing page is the default render. Init() awaits
//     api.me() inside a 5s Promise.race; if the mock route doesn't resolve
//     before the test calls `_navPatient`, the test races against a public
//     shell that is still mid-render.
//   - On Linux CI the timing happened to fall on the wrong side every time —
//     init's catch branch cleared the token and called `navigatePublic('home')`,
//     leaving `#patient-shell` without `.visible`. `#pt-hr-tabs` was rendered
//     into a hidden ancestor and `toBeVisible()` rightfully reported `hidden`.
//
// The progress-page spec sidesteps this by calling `_previewPatientPortal()`
// to force patient mode synchronously regardless of init's outcome, then
// waiting on `.pth-greeting` to confirm the patient dashboard is ready before
// navigating away. Same pattern here.
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

    // Catch-all mock for the patient-portal namespace. `_fetchPatientReportsBundle`
    // hits at least 6 endpoints under `/api/v1/patient-portal/` (outcomes,
    // assessments, courses, sessions, wearable-summary, reports). Each is
    // race()'d against a 3s soft-timeout in the page; an unmocked endpoint
    // would force the race to wait the full 3s before resolving null and
    // could push the page render past the spec's wait budget.
    await page.route('**/api/v1/patient-portal/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    // Patient reports list — shape matters: the page reads
    // `patientReportsRaw.consent_active` and `.is_demo` to gate Outcomes /
    // Biometrics tabs. Returning a plain array (the patient-portal default)
    // would short-circuit `_consentActive` to true via the null fallback;
    // returning the documented payload exercises the live-server branch.
    await page.route('**/api/v1/reports/patient/me**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], is_demo: false, consent_active: true }),
      });
    });
    // The bell-notifications fetch fires from `_bootPatient` immediately after
    // showPatient() — leaving it unmocked makes the patient shell wait on a
    // hung request before becoming network-idle. Stub it to keep boot snappy.
    await page.route('**/api/v1/notifications/me**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  // Force-boot the patient shell and wait for the dashboard to render. Only
  // returns once `#patient-content` is mounted, so callers can safely call
  // `_navPatient()` without racing init().
  async function bootPatientShell(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const win = window as unknown as {
        _previewPatientPortal?: () => void;
        _bootPatient?: () => void;
      };
      if (win._previewPatientPortal) win._previewPatientPortal();
      else if (win._bootPatient) win._bootPatient();
    });

    // Wait for dashboard to fully render before navigating away. Either the
    // greeting copy or the `#patient-content h1` is a reliable signal.
    await page.waitForSelector('.pth-greeting, #patient-content h1', {
      state: 'visible',
      timeout: 10000,
    });
    await page.waitForTimeout(600);
  }

  test('Health Reports page loads at /#patient-health-reports', async ({ page }) => {
    await bootPatientShell(page);

    await page.evaluate(() => {
      const win = window as unknown as { _navPatient?: (id: string) => void };
      win._navPatient?.('patient-health-reports');
    });

    // The page sets innerHTML to a spinner and then awaits the parallel
    // bundle fetch (capped at 3s per source). Wait for `#pt-hr-tabs` to
    // attach, then assert visibility — `waitForSelector` handles the async
    // render gap that `waitForTimeout` previously papered over.
    const tabs = page.locator('#pt-hr-tabs');
    await page.waitForTimeout(400);
    await expect(tabs).toBeVisible({ timeout: 10000 });
  });

  test('all 4 tab buttons render', async ({ page }) => {
    await bootPatientShell(page);

    await page.evaluate(() => {
      const win = window as unknown as { _navPatient?: (id: string) => void };
      win._navPatient?.('patient-health-reports');
    });

    await page.waitForSelector('#pt-hr-tabs button[data-tab="documents"]', {
      state: 'attached',
      timeout: 10000,
    });

    const buttons = page.locator('#pt-hr-tabs button[data-tab]');
    await expect(buttons).toHaveCount(4);

    for (const id of ['outcomes', 'analyzers', 'biometrics', 'documents']) {
      const btn = page.locator(`#pt-hr-tabs button[data-tab="${id}"]`);
      await expect(btn).toBeVisible();
    }
  });

  test('clicking each tab swaps the active panel', async ({ page }) => {
    await bootPatientShell(page);

    await page.evaluate(() => {
      const win = window as unknown as { _navPatient?: (id: string) => void };
      win._navPatient?.('patient-health-reports');
    });

    await page.waitForTimeout(400);
    await expect(page.locator('#pt-hr-tabs')).toBeVisible({ timeout: 10000 });

    // Outcomes is active by default — its panel renders without `hidden`.
    const outcomesPanel = page.locator('.pt-hr-panel[data-tab="outcomes"]');
    await expect(outcomesPanel).toBeVisible();

    // Click Analyzers — its panel should reveal, others should hide.
    await page.locator('#pt-hr-tabs button[data-tab="analyzers"]').click();
    const analyzersPanel = page.locator('.pt-hr-panel[data-tab="analyzers"]');
    await expect(analyzersPanel).toBeVisible();
    await expect(outcomesPanel).toBeHidden();

    // Click Biometrics.
    await page.locator('#pt-hr-tabs button[data-tab="biometrics"]').click();
    const biometricsPanel = page.locator('.pt-hr-panel[data-tab="biometrics"]');
    await expect(biometricsPanel).toBeVisible();
    await expect(analyzersPanel).toBeHidden();

    // Click Documents.
    await page.locator('#pt-hr-tabs button[data-tab="documents"]').click();
    const documentsPanel = page.locator('.pt-hr-panel[data-tab="documents"]');
    await expect(documentsPanel).toBeVisible();
    await expect(biometricsPanel).toBeHidden();
  });
});
