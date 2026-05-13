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
  console.log(`[Test] Checking for visible shells: ${shellIds.join(', ')}`);
  await page.waitForFunction((ids) => {
    const results = ids.map(id => {
      const el = document.getElementById(id);
      if (!el) return { id, found: false };
      const style = getComputedStyle(el);
      const isVisible = el.classList.contains('visible') && style.display !== 'none' && style.visibility !== 'hidden';
      console.log(`[DOM] ${id}: found=${true}, visible=${isVisible}, classList=${el.className}, display=${style.display}, visibility=${style.visibility}`);
      return { id, found: true, isVisible };
    });
    const any = results.some(r => r.isVisible);
    console.log(`[DOM] Any visible: ${any}, results: ${JSON.stringify(results)}`);
    return any;
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
      console.log('[Route] Aborting /auth/me');
      await route.abort();
      return;
    }

    console.log(`[Route] Fulfilling ${url}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test('debug: cached clinician session bootstrap', async ({ page }) => {
  test.setTimeout(60000);
  console.log('[Test] Starting seedCachedClinician');
  await seedCachedClinician(page);
  
  console.log('[Test] Navigating to dashboard');
  await page.goto('/?page=dashboard', { waitUntil: 'commit' });
  
  console.log('[Test] Waiting for boot scripts');
  await waitForBootScripts(page);
  
  console.log('[Test] Waiting for any visible shell');
  try {
    await waitForAnyVisibleShell(page, ['app-shell', 'public-shell']);
    console.log('[Test] Shell became visible!');
  } catch (e) {
    console.log('[Test] Shell visibility wait failed:', e.message);
    
    // Debug: Check current DOM state
    const state = await page.evaluate(() => ({
      appShell: {
        exists: !!document.getElementById('app-shell'),
        className: document.getElementById('app-shell')?.className,
        visible: document.getElementById('app-shell')?.classList.contains('visible'),
        display: getComputedStyle(document.getElementById('app-shell') || {}).display,
        visibility: getComputedStyle(document.getElementById('app-shell') || {}).visibility,
      },
      publicShell: {
        exists: !!document.getElementById('public-shell'),
        className: document.getElementById('public-shell')?.className,
        visible: document.getElementById('public-shell')?.classList.contains('visible'),
        display: getComputedStyle(document.getElementById('public-shell') || {}).display,
        visibility: getComputedStyle(document.getElementById('public-shell') || {}).visibility,
      },
      loginOverlay: {
        exists: !!document.getElementById('login-overlay'),
        className: document.getElementById('login-overlay')?.className,
        visible: document.getElementById('login-overlay')?.classList.contains('visible'),
      },
      currentUser: (window as any).currentUser,
      isAuthenticated: (window as any)._isAuthenticated?.(),
      readyState: document.readyState,
    }));
    console.log('[DOM] Final state:', JSON.stringify(state, null, 2));
    throw e;
  }
});
