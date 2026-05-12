import { test, expect } from '@playwright/test';

async function resetClientState(page) {
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
  });
}

async function waitForShellState(page, shellId) {
  await page.waitForFunction((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    const style = getComputedStyle(el);
    return el.classList.contains('visible') && style.display !== 'none' && style.visibility !== 'hidden';
  }, shellId, { timeout: 25000 });
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

async function waitForNonEmpty(page, selector) {
  await page.waitForFunction((target) => {
    const el = document.querySelector(target);
    return !!el && !!el.textContent && el.textContent.trim().length > 0;
  }, selector, { timeout: 25000 });
}

async function waitForBootScripts(page) {
  await page.waitForFunction(() => document.readyState !== 'loading', undefined, { timeout: 25000 });
}

async function seedClinician(page) {
  await resetClientState(page);
  await page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'clinician-demo-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
    localStorage.setItem('ds_onboarding_complete', 'true');
  });

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/auth/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'responsive-user-1',
          email: 'responsive@clinic.com',
          display_name: 'Dr. Responsive',
          role: 'clinician',
          package_id: 'clinician_pro',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
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

test.describe('responsive shell smoke', () => {
  test('public landing page stays within the viewport', async ({ page }) => {
    test.setTimeout(60000);
    await resetClientState(page);
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();

      if (url.includes('/auth/me')) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'unauthenticated' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_papers: 0,
          trials: 0,
          indications: 0,
        }),
      });
    });

    await page.goto('/', { waitUntil: 'commit' });
    await waitForBootScripts(page);
    await waitForShellState(page, 'public-shell');

    const metrics = await page.evaluate(() => {
      const shell = document.getElementById('public-shell');
      const body = document.body;
      const doc = document.documentElement;
      return {
        shellVisible: !!shell,
        bodyOverflowX: getComputedStyle(body).overflowX,
        scrollWidth: Math.max(body.scrollWidth, doc.scrollWidth),
        clientWidth: doc.clientWidth,
      };
    });

    expect(metrics.shellVisible).toBe(true);
    expect(metrics.bodyOverflowX).not.toBe('scroll');
    expect(metrics.scrollWidth - metrics.clientWidth).toBeLessThanOrEqual(2);
  });

  test('authenticated app shell renders without horizontal overflow', async ({ page }) => {
    test.setTimeout(60000);
    await seedClinician(page);
    await page.goto('/?page=patients-v2', { waitUntil: 'commit' });
    await waitForBootScripts(page);
    await waitForShellState(page, 'app-shell');
    await page.waitForSelector('#content', { timeout: 12000 });

    const metrics = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      const content = document.getElementById('content');
      const topbar = document.getElementById('topbar');
      const rootStyle = getComputedStyle(document.documentElement);
      const contentRect = content?.getBoundingClientRect();
      const topbarRect = topbar?.getBoundingClientRect();
      return {
        sidebarVisible: !!sidebar && getComputedStyle(sidebar).display !== 'none',
        bodyScrollWidth: document.body.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        contentRight: contentRect?.right ?? 0,
        topbarRight: topbarRect?.right ?? 0,
        viewportWidth: window.innerWidth,
      };
    });

    expect(metrics.bodyScrollWidth - metrics.clientWidth).toBeLessThanOrEqual(2);
    expect(metrics.contentRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.topbarRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  });

  test('cached clinician session survives auth bootstrap network failure', async ({ page }) => {
    test.setTimeout(60000);
    await seedCachedClinician(page);
    await page.goto('/?page=dashboard', { waitUntil: 'commit' });
    await waitForBootScripts(page);
    await waitForAnyVisibleShell(page, ['app-shell', 'public-shell']);
    await waitForNonEmpty(page, '#content');

    await expect(page.locator('#user-name')).toContainText('Dr. Cached');

    const metrics = await page.evaluate(() => ({
      shellVisible: document.getElementById('app-shell')?.classList.contains('visible') ?? false,
      sidebarVisible: document.getElementById('sidebar')?.classList.contains('visible') ?? false,
      bodyScrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(metrics.shellVisible).toBe(true);
    expect(metrics.sidebarVisible).toBe(true);
    expect(metrics.bodyScrollWidth - metrics.clientWidth).toBeLessThanOrEqual(2);
  });
});
