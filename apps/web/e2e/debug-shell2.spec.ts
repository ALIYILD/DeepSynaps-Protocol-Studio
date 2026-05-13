import { test, expect } from '@playwright/test';

async function resetClientState(page) {
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
  });
}

async function waitForBootScripts(page) {
  await page.waitForFunction(() => document.readyState !== 'loading', undefined, { timeout: 25000 });
}

async function waitForAnyVisibleShell(page, shellIds) {
  await page.waitForFunction((ids) => {
    return ids.some((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const style = getComputedStyle(el);
      return el.classList.contains('visible') && style.display !== 'none' && style.visibility !== 'hidden';
    });
  }, shellIds, { timeout: 25000 });
}

async function seedCachedClinician(page) {
  await resetClientState(page);
  await page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'cached-clinician-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
    localStorage.setItem('ds_onboarding_complete', 'true');
    localStorage.setItem('ds_session_user', JSON.stringify({
      id: 'cached-user-1',
      email: 'cached@clinic.com',
      display_name: 'Dr. Cached',
      role: 'clinician',
      package_id: 'clinician_pro',
    }));
  });

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/me')) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test('debug2: test the exact sequence from original test', async ({ page }) => {
  test.setTimeout(60000);
  await seedCachedClinician(page);
  await page.goto('/?page=dashboard', { waitUntil: 'commit' });
  await waitForBootScripts(page);
  await waitForAnyVisibleShell(page, ['app-shell', 'public-shell']);
  
  // This second waitForFunction from the original test
  await page.waitForFunction(() => {
    const contentEl = document.querySelector('#content');
    const appShell = document.getElementById('app-shell');
    const hasContent = contentEl && contentEl.textContent && contentEl.textContent.trim().length > 0;
    const shellReady = appShell?.classList.contains('visible') ?? false;
    return hasContent || shellReady;
  }, { timeout: 25000 });

  const metrics = await page.evaluate(() => ({
    appShellVisible: document.getElementById('app-shell')?.classList.contains('visible') ?? false,
    publicShellVisible: document.getElementById('public-shell')?.classList.contains('visible') ?? false,
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(metrics.appShellVisible || metrics.publicShellVisible).toBe(true);
  expect(metrics.bodyScrollWidth - metrics.clientWidth).toBeLessThanOrEqual(2);
});
