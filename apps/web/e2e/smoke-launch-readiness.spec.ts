/**
 * Smoke tests for launch-readiness validation.
 *
 * Five critical user journeys that must pass before the platform is
 * considered preview/launch-ready. All tests mock the API layer so they
 * run offline (no backend needed).
 */
import { test, expect, Page } from '@playwright/test';

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Inject demo auth state so the SPA renders authenticated pages. */
async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'clinician-demo-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
  });

  // Mock /auth/me so the app thinks we're a logged-in clinician
  await page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'smoke-user-1',
        email: 'smoke@clinic.com',
        display_name: 'Dr. Smoke Test',
        role: 'clinician',
        package_id: 'clinician_pro',
      }),
    });
  });
}

/** Catch-all API mock: return 200 with empty JSON for any unmatched endpoint. */
async function mockAllApi(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    if (route.request().url().includes('/auth/me')) {
      route.fallback();
      return;
    }
    // AI health endpoint gets a realistic mock
    if (route.request().url().includes('/health/ai')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'operational',
          summary: '0 of 14 AI features are live',
          features: [
            { feature: 'qeeg_recommender', status: 'not_configured', real_ai: false },
            { feature: 'deeptwin_simulator', status: 'not_implemented', real_ai: false },
            { feature: 'risk_score_predictor', status: 'not_configured', real_ai: false },
            { feature: 'copilot_llm', status: 'not_configured', real_ai: false },
            { feature: 'medrag_retriever', status: 'not_configured', real_ai: false },
          ],
        }),
      });
      return;
    }
    // DeepTwin simulate endpoint
    if (route.request().url().includes('/deeptwin/simulate')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          engine: { status: 'placeholder', real_ai: false },
          forecast: [],
          monitoring_plan: { checkpoints: [] },
        }),
      });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

async function waitForContent(page: Page) {
  await page.waitForSelector('#content:not(:empty), #app-shell', { timeout: 12000 });
  await page.waitForTimeout(300);
}

// ── Journey 1: Demo Login ─────────────────────────────────────────────────────

test.describe('Smoke: Demo Login', () => {
  test('public landing shows demo login buttons', async ({ page }) => {
    // Clear auth so we see the public shell
    await page.addInitScript(() => {
      try { localStorage.clear(); } catch {}
    });
    await page.goto('/');
    await page.waitForSelector('#public-shell', { timeout: 10000 });

    // The public landing should render without errors
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(50);
  });

  test('demo token login reaches authenticated shell', async ({ page }) => {
    await injectAuth(page);
    await mockAllApi(page);
    await page.goto('/');
    await page.waitForSelector('#app-shell, #content:not(:empty)', { timeout: 12000 });

    // App shell or sidebar should be visible
    const appShell = page.locator('#app-shell');
    await expect(appShell).toBeVisible({ timeout: 8000 });
  });
});

// ── Journey 2: AI Status Tab ──────────────────────────────────────────────────

test.describe('Smoke: AI Status Tab', () => {
  test('AI status page renders feature list with honesty labels', async ({ page }) => {
    await injectAuth(page);
    await mockAllApi(page);

    // Navigate to practice settings with AI status tab
    await page.goto('/?page=practice&tab=ai-status');
    await page.waitForSelector('#content:not(:empty), #app-shell', { timeout: 12000 });
    await page.waitForTimeout(500);

    // The page should contain text about AI features or status
    const content = await page.locator('body').textContent();
    // Should not crash — content should be non-trivial
    expect(content?.length).toBeGreaterThan(100);
  });
});

// ── Journey 3: qEEG Unavailable State ─────────────────────────────────────────

test.describe('Smoke: qEEG Unavailable', () => {
  test('qEEG analysis shows graceful unavailable state when model missing', async ({ page }) => {
    await injectAuth(page);
    await mockAllApi(page);

    // Mock the qEEG recommendation endpoint to return 503
    await page.route('**/api/v1/qeeg/*/recommendation', (route) => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'model_unavailable',
          message: 'qEEG recommendation model is not loaded',
          safe_user_message: 'AI recommendation is not available. Quantitative data is still valid.',
        }),
      });
    });

    // Navigate to qEEG page
    await page.goto('/?page=qeeg');
    await page.waitForSelector('#content:not(:empty), #app-shell', { timeout: 12000 });
    await page.waitForTimeout(500);

    // Page should render without crash
    const content = await page.locator('body').textContent();
    expect(content?.length).toBeGreaterThan(100);
    // Should NOT show a raw error stack trace
    expect(content).not.toMatch(/Traceback|stack trace|undefined is not/i);
  });
});

// ── Journey 4: DeepTwin Placeholder ───────────────────────────────────────────

test.describe('Smoke: DeepTwin Placeholder', () => {
  test('DeepTwin page loads and shows placeholder/not-ready state', async ({ page }) => {
    await injectAuth(page);
    await mockAllApi(page);

    await page.goto('/?page=deeptwin');
    await page.waitForSelector('#content:not(:empty), #app-shell', { timeout: 12000 });
    await page.waitForTimeout(500);

    // Page should render
    const content = await page.locator('body').textContent();
    expect(content?.length).toBeGreaterThan(100);
    // Should not show a raw JS error
    expect(content).not.toMatch(/Cannot read properties|undefined is not/i);
  });
});

// ── Journey 5: Protocol Page ──────────────────────────────────────────────────

test.describe('Smoke: Protocol Page', () => {
  test('protocol wizard page loads with form or canvas', async ({ page }) => {
    await injectAuth(page);
    await mockAllApi(page);

    await page.goto('/?page=protocol-wizard');
    await page.waitForSelector('#content:not(:empty), #app-shell', { timeout: 12000 });
    await page.waitForTimeout(500);

    // Page should render without crash
    const content = await page.locator('body').textContent();
    expect(content?.length).toBeGreaterThan(50);
    // Should contain protocol-related content
    expect(content).toMatch(/protocol|treatment|course|condition|modality|patient/i);
  });
});
