// ─────────────────────────────────────────────────────────────────────────────
// raw-data-clean-and-export.spec.ts — Raw Data tab + embedded workbench smoke
//
// The qEEG Analyzer **Raw Data** tab mounts the full-page Raw EEG Workbench
// (`pages-qeeg-raw-workbench.js`). Older Phase-7 tests targeted the legacy
// inline viewer (`pages-qeeg-raw.js`) with `#quality-scorecard` and
// `#eeg-artifacts-*` controls; those elements are not present in the embedded
// workbench. This file asserts stable workbench contracts instead.
//
// Workstation routes remain mocked so the tab can load without a live API.
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect, type Page } from '@playwright/test';

// ── 1. Auth seed ─────────────────────────────────────────────────────────────

async function seedAuth(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('ds_access_token', 'mock-rd-token');
      localStorage.setItem('ds_refresh_token', 'mock-rd-refresh');
      localStorage.setItem('ds_onboarding_done', '1');
    } catch (_e) { /* ignore */ }
  });
  await page.route('**/api/v1/auth/me', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'rd-clinician', email: 'rd@test.com',
        display_name: 'Dr. RD', role: 'clinician',
      }),
    });
  });
}

/**
 * Land on the qEEG Analyzer Raw Data tab in demo mode (embedded workbench).
 */
async function landOnRawDataTab(page: Page, opts: { realToken?: boolean } = {}) {
  await page.goto('/');
  await page.waitForFunction(
    () => typeof (window as unknown as { demoLogin?: unknown }).demoLogin === 'function',
    { timeout: 15000 },
  );
  await page.evaluate(async () => {
    await (window as unknown as { demoLogin: (t: string) => Promise<void> }).demoLogin('clinician-demo-token');
  });
  await page.waitForTimeout(2000);
  if (opts.realToken) {
    await page.evaluate(() => {
      try { localStorage.setItem('ds_access_token', 'mock-rd-real-token'); } catch (_e) {}
    });
  }
  await page.evaluate(() => {
    (window as unknown as { _qeegSelectedId?: string })._qeegSelectedId = 'demo';
    (window as unknown as { _qeegTab?: string })._qeegTab = 'raw';
    const nav = (window as unknown as { _nav?: (id: string) => void })._nav;
    if (typeof nav === 'function') nav('qeeg-analysis');
    else { window.location.hash = '#/qeeg-analysis'; }
  });
}

// ── 2. API mocks (best-effort; demo path may not hit all routes) ────────────

const PROPOSED_AUTOSCAN = {
  run_id: 'autoscan-run-smoke',
  proposal: {
    bad_channels: [{ channel: 'T3', reason: 'flat-line', confidence: 0.9 }],
    bad_segments: [{ t_start: 12.0, t_end: 14.5, reason: 'movement', confidence: 0.81 }],
  },
  proposed_at: '2026-05-01T00:00:00Z',
};

async function mockRawWorkstationRoutes(page: Page) {
  await page.route(/\/auto-scan(\?|$)/, (route) => {
    if (route.request().method() === 'POST') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PROPOSED_AUTOSCAN),
      });
      return;
    }
    void route.continue();
  });
  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() === 'OPTIONS') {
      void route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    void route.continue();
  });
}

// ── 3. Tests ─────────────────────────────────────────────────────────────────

test.describe('Raw Data — embedded workbench smoke', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await mockRawWorkstationRoutes(page);
  });

  test('Raw Data tab mounts workbench shell, trace area, and clinical safety strip', async ({ page }) => {
    await landOnRawDataTab(page, { realToken: true });

    const root = page.locator('[data-testid="qwb-root"]');
    await expect(root).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-testid="qwb-trace"]')).toBeVisible();
    await expect(page.locator('#qwb-immutable-banner')).toBeVisible();
    await expect(page.locator('#qwb-immutable-banner')).toContainText(/Original raw EEG preserved/);
    await expect(page.locator('#qwb-immutable-banner')).toContainText(/Decision-support only/);
  });

  test('? key opens the keyboard shortcuts modal', async ({ page }) => {
    await landOnRawDataTab(page, { realToken: true });

    await expect(page.locator('[data-testid="qwb-root"]')).toBeVisible({ timeout: 20000 });

    await page.keyboard.press('?');
    const modal = page.locator('[data-testid="qwb-shortcuts-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.locator('h3')).toContainText('Keyboard shortcuts');
  });

  test('toolbar help (?) button opens the same shortcuts modal', async ({ page }) => {
    await landOnRawDataTab(page, { realToken: true });

    await expect(page.locator('[data-testid="qwb-root"]')).toBeVisible({ timeout: 20000 });

    await page.locator('[data-testid="qwb-help"]').click();
    const modal = page.locator('[data-testid="qwb-shortcuts-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });
});
