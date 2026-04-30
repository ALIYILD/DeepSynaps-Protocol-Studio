/**
 * Demo-mode page diagnostic — walks the live preview as a demo clinician
 * and reports which pages render cleanly vs which throw "Something went wrong".
 *
 * Run with:
 *   PLAYWRIGHT_BASE_URL=https://deepsynaps-studio-preview.netlify.app \
 *     npx playwright test e2e/99-demo-page-diagnostic.spec.ts --reporter=list
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://deepsynaps-studio-preview.netlify.app';

const PAGES = [
  { id: 'dashboard',           hash: 'dashboard' },
  { id: 'qeeg-analysis',       hash: 'qeeg-analysis' },
  { id: 'mri-analysis',        hash: 'mri-analysis' },
  { id: 'deeptwin',            hash: 'deeptwin' },
  { id: 'brain-twin',          hash: 'brain-twin' },
  { id: 'protocols',           hash: 'protocols' },
  { id: 'patients',            hash: 'patients' },
  { id: 'clinical-hub',        hash: 'clinical-hub' },
  { id: 'clinical-trials',     hash: 'clinical-trials' },
  { id: 'clinical-notes',      hash: 'clinical-notes' },
  { id: 'courses',             hash: 'courses' },
  { id: 'assessments',         hash: 'assessments' },
  { id: 'assessments-hub',     hash: 'assessments-hub' },
  { id: 'research-v2',         hash: 'research-v2' },
  { id: 'research-evidence',   hash: 'research-evidence' },
  { id: 'biomarkers',          hash: 'biomarkers' },
  { id: 'brain-map-planner',   hash: 'brain-map-planner' },
  { id: 'monitor',             hash: 'monitor' },
  { id: 'documents-hub',       hash: 'documents-hub' },
  { id: 'calendar',            hash: 'calendar' },
  { id: 'careteam',            hash: 'careteam' },
  { id: 'billing',             hash: 'billing' },
  { id: 'clinic-settings',     hash: 'clinic-settings' },
  { id: 'admin',               hash: 'admin' },
];

test('demo clinician: walk every page + report errors', async ({ page }) => {
  test.setTimeout(240000);
  const consoleErrors: string[] = [];
  const networkFails: string[] = [];

  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('response', r => {
    if (r.status() >= 500) networkFails.push(`${r.status()} ${r.url()}`);
  });

  // 1. Land on home
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof (window as any).demoLogin === 'function', { timeout: 10000 });

  // 2. Demo-login via the real entry point so bootUser() activates app shell.
  await page.evaluate(async () => {
    await (window as any).demoLogin('clinician-demo-token');
  });
  await page.waitForTimeout(5000); // demoLogin races real backend (4s timeout) then offline fallback

  // 3. Walk each page
  const results: Record<string, {
    title: string;
    hasSomethingWrong: boolean;
    bodySnippet: string;
    consoleErrCount: number;
    networkFailCount: number;
  }> = {};

  for (const p of PAGES) {
    consoleErrors.length = 0;
    networkFails.length = 0;
    await page.goto(`${BASE}/?page=${p.hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500); // let async fetches settle
    const body = await page.locator('#content').first().innerText().catch(() => '');
    const title = await page.title();
    const hasSomethingWrong = /something went wrong|something broke/i.test(body);
    results[p.id] = {
      title,
      hasSomethingWrong,
      bodySnippet: body.slice(0, 200).replace(/\s+/g, ' ').trim(),
      consoleErrCount: consoleErrors.length,
      networkFailCount: networkFails.length,
    };
    if (consoleErrors.length) {
      console.log(`\n--- ${p.id}: console errors ---`);
      consoleErrors.slice(0, 3).forEach(e => console.log('  ' + e.slice(0, 200)));
    }
    if (networkFails.length) {
      console.log(`\n--- ${p.id}: 5xx responses ---`);
      networkFails.slice(0, 3).forEach(e => console.log('  ' + e));
    }
  }

  console.log('\n\n=== PAGE DIAGNOSTIC SUMMARY ===');
  for (const [id, r] of Object.entries(results)) {
    const flag = r.hasSomethingWrong ? '❌ ERROR' : '✓ ok';
    console.log(`${flag.padEnd(10)} ${id.padEnd(20)} cons:${r.consoleErrCount} 5xx:${r.networkFailCount} | ${r.bodySnippet}`);
  }
});
