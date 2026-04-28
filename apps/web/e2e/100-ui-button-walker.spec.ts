/**
 * UI Button Walker — beta-readiness sweep.
 *
 * Walks every page in demo-clinician mode, clicks visible buttons inside
 * #content (capped per page), and captures console errors, 5xx network
 * failures, button-click errors, and "Something went wrong" boundaries.
 *
 * Run with:
 *   PLAYWRIGHT_BASE_URL=https://deepsynaps-studio-preview.netlify.app \
 *     npx playwright test e2e/100-ui-button-walker.spec.ts \
 *     --reporter=list --workers=1 --project=chromium
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://deepsynaps-studio-preview.netlify.app';

const PAGES = [
  'dashboard',
  'qeeg-analysis',
  'mri-analysis',
  'deeptwin',
  'brain-twin',
  'protocols',
  'patients',
  'clinical-hub',
  'clinical-trials',
  'clinical-notes',
  'courses',
  'assessments',
  'assessments-hub',
  'research-v2',
  'research-evidence',
  'biomarkers',
  'brain-map-planner',
  'monitor',
  'documents-hub',
  'calendar',
  'careteam',
  'billing',
  'clinic-settings',
  'admin',
];

const MAX_BUTTONS_PER_PAGE = 6;

type PageResult = {
  hasSomethingWentWrong: boolean;
  consoleErrCount: number;
  networkFailCount: number;
  buttonsClicked: number;
  buttonClickErrors: number;
  consoleErrSamples: string[];
  networkFailSamples: string[];
  buttonClickErrSamples: string[];
};

test('demo clinician: walk pages + click buttons', async ({ page }) => {
  test.setTimeout(600000);

  const consoleErrors: string[] = [];
  const networkFails: string[] = [];

  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('response', r => {
    if (r.status() >= 500) networkFails.push(`${r.status()} ${r.url()}`);
  });

  // 1. Land on home + demo-login
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => typeof (window as any).demoLogin === 'function',
    { timeout: 10000 },
  );
  await page.evaluate(async () => {
    await (window as any).demoLogin('clinician-demo-token');
  });
  await page.waitForTimeout(5000);

  const results: Record<string, PageResult> = {};

  for (const id of PAGES) {
    consoleErrors.length = 0;
    networkFails.length = 0;
    const buttonClickErrSamples: string[] = [];
    let buttonsClicked = 0;
    let buttonClickErrors = 0;

    try {
      await page.goto(`${BASE}/?page=${id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    } catch (e: any) {
      buttonClickErrSamples.push(`goto failed: ${e?.message ?? e}`);
    }
    await page.waitForTimeout(2500);

    const body = await page
      .locator('#content')
      .first()
      .innerText()
      .catch(() => '');
    const hasSomethingWentWrong =
      /something went wrong|something broke/i.test(body);

    // Find visible non-disabled buttons inside #content, cap to MAX
    let buttonHandles: any[] = [];
    try {
      const allButtons = page.locator('#content button:not([disabled])');
      const count = await allButtons.count();
      const limit = Math.min(count, MAX_BUTTONS_PER_PAGE * 4); // search wider, filter visible
      for (let i = 0; i < limit && buttonHandles.length < MAX_BUTTONS_PER_PAGE; i++) {
        const btn = allButtons.nth(i);
        const visible = await btn.isVisible().catch(() => false);
        if (visible) buttonHandles.push(btn);
      }
    } catch (e: any) {
      buttonClickErrSamples.push(`button-locate failed: ${e?.message ?? e}`);
    }

    for (const btn of buttonHandles) {
      const label = await btn.innerText().catch(() => '<no-text>');
      try {
        await btn.click({ timeout: 2500, trial: false });
        buttonsClicked += 1;
        await page.waitForTimeout(600);

        // close any modal/overlay/escape so subsequent clicks aren't blocked
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(150);

        // re-check "Something went wrong" after click — abort more clicks if so
        const postBody = await page
          .locator('#content')
          .first()
          .innerText()
          .catch(() => '');
        if (/something went wrong|something broke/i.test(postBody)) {
          buttonClickErrSamples.push(
            `click on "${label.slice(0, 40).trim()}" triggered error boundary`,
          );
          break;
        }
      } catch (e: any) {
        buttonClickErrors += 1;
        if (buttonClickErrSamples.length < 4) {
          buttonClickErrSamples.push(
            `click "${label.slice(0, 40).trim()}": ${(e?.message ?? String(e)).slice(0, 160)}`,
          );
        }
      }
    }

    results[id] = {
      hasSomethingWentWrong,
      consoleErrCount: consoleErrors.length,
      networkFailCount: networkFails.length,
      buttonsClicked,
      buttonClickErrors,
      consoleErrSamples: consoleErrors.slice(0, 3).map(s => s.slice(0, 220)),
      networkFailSamples: networkFails.slice(0, 3),
      buttonClickErrSamples,
    };

    console.log(
      `[${id}] err:${results[id].hasSomethingWentWrong ? 'YES' : 'no'} ` +
        `cons:${results[id].consoleErrCount} 5xx:${results[id].networkFailCount} ` +
        `btnsClicked:${results[id].buttonsClicked} btnErrs:${results[id].buttonClickErrors}`,
    );
    if (results[id].consoleErrSamples.length) {
      results[id].consoleErrSamples.forEach(e =>
        console.log(`  cons> ${e}`),
      );
    }
    if (results[id].buttonClickErrSamples.length) {
      results[id].buttonClickErrSamples.forEach(e =>
        console.log(`  btn>  ${e}`),
      );
    }
  }

  console.log('\n\n=== UI WALKER JSON ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('=== END UI WALKER JSON ===\n');
});
