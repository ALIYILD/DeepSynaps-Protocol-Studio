import { test, expect, Page } from '@playwright/test';

async function mockAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'mock-fusion-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    localStorage.setItem('ds_onboarding_done', '1');
  });

  await page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'fusion-test-user',
        email: 'fusion@test.com',
        display_name: 'Dr. Fusion Tester',
        role: 'clinician',
        package_id: 'clinician_pro',
      }),
    });
  });

  await page.route('**/api/v1/**', (route) => {
    if (route.request().url().includes('/auth/me')) {
      route.fallback();
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
}

function mockFusionApis(page: Page) {
  // Patients list
  page.route('**/api/v1/patients**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'patient-fusion-1',
          first_name: 'Alice',
          last_name: 'Smith',
          primary_condition: 'Depression',
          created_at: new Date().toISOString(),
        },
      ]),
    });
  });

  // Fusion cases for patient
  page.route('**/api/v1/fusion/cases**', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'fusion-case-1',
            patient_id: 'patient-fusion-1',
            report_state: 'FUSION_DRAFT_AI',
            summary: 'qEEG and MRI findings are largely concordant.',
            confidence: 0.72,
            confidence_grade: 'heuristic',
            source_qeeg_state: 'REVIEWED',
            source_mri_state: 'MRI_REVIEWED',
            radiology_review_required: false,
            mri_registration_confidence: 'high',
            created_at: new Date().toISOString(),
          },
        ]),
      });
    } else {
      route.continue();
    }
  });

  // Single fusion case
  page.route('**/api/v1/fusion/cases/*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'fusion-case-1',
        patient_id: 'patient-fusion-1',
        report_state: 'FUSION_DRAFT_AI',
        summary: 'qEEG and MRI findings are largely concordant.',
        confidence: 0.72,
        confidence_grade: 'heuristic',
        source_qeeg_state: 'REVIEWED',
        source_mri_state: 'MRI_REVIEWED',
        radiology_review_required: false,
        mri_registration_confidence: 'high',
        created_at: new Date().toISOString(),
      }),
    });
  });

  // Safety cockpit
  page.route('**/api/v1/fusion/cases/*/safety-cockpit**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        blocked: false,
        warnings: [],
        reasons: [],
        next_steps: [],
      }),
    });
  });

  // Patient report
  page.route('**/api/v1/fusion/cases/*/patient-report**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        patient_id_hash: 'sha256:abc123',
        summary: 'Decision-support summary.',
        confidence: 0.72,
        confidence_grade: 'heuristic',
        claims: [],
        limitations: [],
        disclaimer: 'This report is decision-support only.',
        decision_support_only: true,
      }),
    });
  });

  // Agreement
  page.route('**/api/v1/fusion/cases/*/agreement**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        topics: [
          { topic: 'condition', qeeg: 'Depression', mri: 'Depression', agreement: 'agree' },
        ],
      }),
    });
  });

  // Protocol fusion
  page.route('**/api/v1/fusion/cases/*/protocol-fusion**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recommendation: 'tDCS F3-F4',
        merged_targets: [],
        conflicts: [],
      }),
    });
  });

  // Audit
  page.route('**/api/v1/fusion/cases/*/audit**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Findings review
  page.route('**/api/v1/fusion/cases/*/findings/*/review**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  // Export
  page.route('**/api/v1/fusion/cases/*/export**', (route) => {
    route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'Not signed' }) });
  });
}

test.describe('Fusion Workbench', () => {
  test('Fusion case loads with patient context', async ({ page }) => {
    await mockAuth(page);
    mockFusionApis(page);

    await page.goto('/#fusion-workbench?patient_id=patient-fusion-1');
    await page.waitForSelector('#content:not(:empty), #app-shell', { timeout: 10000 });
    await page.waitForTimeout(300);

    await expect(page.locator('body')).not.toBeEmpty();
    const content = await page.locator('body').textContent();
    expect(content).toMatch(/fusion|concordant|agreement|protocol|MRI|qEEG/i);
  });

  test('Source review status renders', async ({ page }) => {
    await mockAuth(page);
    mockFusionApis(page);

    await page.goto('/#fusion-workbench?patient_id=patient-fusion-1');
    await page.waitForSelector('#content:not(:empty), #app-shell', { timeout: 10000 });
    await page.waitForTimeout(300);

    const content = await page.locator('body').textContent();
    expect(content).toMatch(/qEEG|MRI|review|registration confidence/i);
  });

  test('Safety cockpit shows all-clear', async ({ page }) => {
    await mockAuth(page);
    mockFusionApis(page);

    await page.goto('/#fusion-workbench?patient_id=patient-fusion-1');
    await page.waitForSelector('#content:not(:empty), #app-shell', { timeout: 10000 });
    await page.waitForTimeout(300);

    const content = await page.locator('#app-shell').textContent();
    expect(content).not.toMatch(/BLOCKED|cannot proceed|critical error/i);
  });
});
