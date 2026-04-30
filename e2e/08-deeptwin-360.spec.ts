import { test, expect, Page } from '@playwright/test';

function mockAuth(page: Page) {
  page.addInitScript(() => {
    localStorage.setItem('ds_access_token', 'mock-dt360-token');
    localStorage.setItem('ds_refresh_token', 'mock-refresh');
    sessionStorage.setItem('ds_pat_selected_id', 'pat-360-e2e');
    sessionStorage.setItem('ds_dt_active_tab', '360');
  });
  page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'dt360-user', email: 'dt360@test.com',
        display_name: 'Dr. 360', role: 'clinician', package_id: 'clinician_pro',
      }),
    }),
  );
}

function mock360Payload(): unknown {
  const domains = [
    { key: 'identity', label: 'Identity / demographics', status: 'available', record_count: 1, last_updated: '2026-04-30T00:00:00Z', summary: 'Alice Doe', warnings: [], source_links: [], upload_links: [] },
    { key: 'diagnosis', label: 'Diagnosis / phenotype', status: 'available', record_count: 2, last_updated: null, summary: 'ADHD · 1 secondary', warnings: [], source_links: [], upload_links: [] },
    { key: 'symptoms_goals', label: 'Symptoms / goals', status: 'partial', record_count: 1, last_updated: null, summary: 'Intake notes on file.', warnings: [], source_links: [], upload_links: [] },
    { key: 'assessments', label: 'Assessments', status: 'missing', record_count: 0, last_updated: null, summary: 'No assessment scores on file.', warnings: ['Sparse assessment history (<5 in lifetime).'], source_links: [], upload_links: [{ label: 'Submit assessment', href: '/patients/x/assessments/new', kind: 'assessment' }] },
    { key: 'qeeg', label: 'EEG / qEEG', status: 'missing', record_count: 0, last_updated: null, summary: 'No qEEG records on file.', warnings: [], source_links: [], upload_links: [{ label: 'Upload qEEG', href: '/qeeg-analysis', kind: 'qeeg' }] },
    { key: 'mri', label: 'MRI / imaging', status: 'missing', record_count: 0, last_updated: null, summary: 'No MRI analyses on file.', warnings: [], source_links: [], upload_links: [{ label: 'Upload MRI', href: '/mri-analysis', kind: 'mri' }] },
    { key: 'video', label: 'Video', status: 'missing', record_count: 0, last_updated: null, summary: 'No video analyses on file.', warnings: [], source_links: [], upload_links: [] },
    { key: 'voice', label: 'Voice', status: 'missing', record_count: 0, last_updated: null, summary: 'No voice analyses on file.', warnings: [], source_links: [], upload_links: [] },
    { key: 'text', label: 'Text / language', status: 'missing', record_count: 0, last_updated: null, summary: 'No journal or message text on file.', warnings: [], source_links: [], upload_links: [] },
    { key: 'biometrics', label: 'Biometrics', status: 'missing', record_count: 0, last_updated: null, summary: 'No biometric observations on file.', warnings: [], source_links: [], upload_links: [] },
    { key: 'wearables', label: 'Wearables', status: 'missing', record_count: 0, last_updated: null, summary: 'No wearable daily summaries on file.', warnings: [], source_links: [], upload_links: [] },
    { key: 'cognitive_tasks', label: 'Cognitive tasks', status: 'unavailable', record_count: 0, last_updated: null, summary: 'No cognitive-task ingestion path in the platform yet.', warnings: ['Domain is structurally unavailable, not data-missing.'], source_links: [], upload_links: [] },
    { key: 'medications', label: 'Medication / supplements', status: 'missing', record_count: 0, last_updated: null, summary: 'No medications on file.', warnings: [], source_links: [], upload_links: [] },
    { key: 'labs', label: 'Labs / blood biomarkers', status: 'unavailable', record_count: 0, last_updated: null, summary: 'No labs/biomarker ingestion path in the platform yet.', warnings: [], source_links: [], upload_links: [] },
    { key: 'treatment_sessions', label: 'Treatment sessions', status: 'missing', record_count: 0, last_updated: null, summary: 'No treatment sessions on file.', warnings: [], source_links: [], upload_links: [] },
    { key: 'safety_flags', label: 'Adverse events / safety flags', status: 'missing', record_count: 0, last_updated: null, summary: 'No adverse events or safety flags on file.', warnings: [], source_links: [], upload_links: [] },
    { key: 'lifestyle', label: 'Lifestyle / sleep / diet', status: 'missing', record_count: 0, last_updated: null, summary: 'No lifestyle / sleep observations available; diet not ingested.', warnings: [], source_links: [], upload_links: [] },
    { key: 'environment', label: 'Environment', status: 'unavailable', record_count: 0, last_updated: null, summary: 'No environmental-context ingestion path in the platform yet.', warnings: [], source_links: [], upload_links: [] },
    { key: 'caregiver_reports', label: 'Family / teacher / caregiver reports', status: 'unavailable', record_count: 0, last_updated: null, summary: 'No family/teacher/caregiver-report ingestion path yet.', warnings: [], source_links: [], upload_links: [] },
    { key: 'clinical_documents', label: 'Clinical documents', status: 'partial', record_count: 0, last_updated: null, summary: 'Document templates exist; per-patient generated documents not yet aggregated here.', warnings: [], source_links: [], upload_links: [] },
    { key: 'outcomes', label: 'Outcomes', status: 'missing', record_count: 0, last_updated: null, summary: 'No outcome series or events on file.', warnings: [], source_links: [], upload_links: [] },
    { key: 'twin_predictions', label: 'DeepTwin predictions and confidence', status: 'partial', record_count: 0, last_updated: null, summary: 'DeepTwin predictions are model-estimated and uncalibrated.', warnings: ['DeepTwin model is currently a deterministic placeholder; no validated outcome calibration.'], source_links: [], upload_links: [] },
  ];
  return {
    patient_id: 'pat-360-e2e',
    generated_at: '2026-04-30T00:00:00Z',
    patient_summary: { name: 'Alice Doe', age: 33, diagnosis: ['ADHD'], phenotype: [], primary_goals: [], risk_level: 'unknown' },
    completeness: { score: 0.114, available_domains: 2, partial_domains: 3, missing_domains: 13, high_priority_missing: ['qeeg', 'assessments'] },
    safety: { adverse_events: [], contraindications: [], red_flags: [], medication_confounds: [] },
    domains,
    timeline: [],
    correlations: [],
    outcomes: { series_count: 0, event_count: 0, summary: 'No outcomes on file.' },
    prediction_confidence: {
      status: 'placeholder', real_ai: false, confidence: null,
      confidence_label: 'Not calibrated',
      summary: 'Decision-support only. Requires clinician review.',
      drivers: [],
      limitations: ['No validated outcome dataset bound to this engine.'],
    },
    clinician_notes: [],
    review: { reviewed: false, reviewed_by: null, reviewed_at: null },
    disclaimer: 'Decision-support only. Requires clinician review. Correlation does not imply causation.',
  };
}

function mock360Apis(page: Page) {
  page.route('**/api/v1/deeptwin/patients/**/dashboard', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(mock360Payload()),
    }),
  );
  // Other deeptwin endpoints used by the overview tab — we don't need them to
  // succeed for the 360 test, but stubbing prevents 401 noise.
  page.route('**/api/v1/deeptwin/**', (route) => {
    if (route.request().url().endsWith('/dashboard')) return;
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test.describe('DeepTwin 360 dashboard', () => {
  test('opens 22-domain matrix with safety + prediction wording', async ({ page }) => {
    mockAuth(page);
    mock360Apis(page);
    await page.goto('/?p=deeptwin');

    // Wait for either the route or the tab strip to render.
    await page.waitForSelector('.dt360-grid, .dt-tabs', { timeout: 15000 });

    // 1. Open the 360 tab if we're not on it already.
    const tabBtn = page.locator('button[data-dt-tab="360"]');
    if (await tabBtn.count()) await tabBtn.first().click();
    await page.waitForSelector('.dt360-grid', { timeout: 8000 });

    // 2. Verify the 22-domain matrix is visible.
    const cards = page.locator('.dt360-card');
    await expect(cards).toHaveCount(22);

    // 3. Safety card visible at the top.
    await expect(page.locator('.dt360-top-card', { hasText: 'Safety / risk flags' })).toBeVisible();

    // 4. Prediction panel shows decision-support / clinician-review wording.
    const pred = page.locator('.dt360-bottom', { hasText: 'DeepTwin prediction & confidence' });
    await expect(pred).toBeVisible();
    await expect(pred).toContainText(/decision-support/i);
    await expect(pred).toContainText(/clinician review/i);
    await expect(pred).toContainText(/Not calibrated/i);

    // 5. Footer carries the standard caution language.
    const footer = page.locator('.dt360-footer');
    await expect(footer).toContainText(/Decision-support only/i);
    await expect(footer).toContainText(/Correlation does not imply causation/i);
  });
});
