import { test, expect, Page } from '@playwright/test';

function mockAuth(page: Page) {
  page.addInitScript(() => {
    localStorage.setItem('ds_onboarding_complete', 'true');
    localStorage.setItem('ds_onboarding_done', '1');
    sessionStorage.setItem('ds_pat_selected_id', 'bio-e2e-patient');
  });
  page.route('**/api/v1/auth/demo-login', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'bio-access-token',
        refresh_token: 'bio-refresh-token',
        user: {
          id: 'bio-test-user',
          email: 'bio@test.com',
          display_name: 'Dr. Bio',
          role: 'clinician',
          package_id: 'clinician_pro',
        },
      }),
    });
  });
  page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'bio-test-user',
        email: 'bio@test.com',
        display_name: 'Dr. Bio',
        role: 'clinician',
        package_id: 'clinician_pro',
      }),
    });
  });
}

function mockBioApis(page: Page) {
  const patientId = 'bio-e2e-patient';
  const patient = {
    id: patientId,
    patient_id: patientId,
    first_name: 'Bianca',
    last_name: 'Tester',
    display_name: 'Bianca Tester',
    primary_modality: 'tms',
    primary_condition: 'Depression',
    mrn: 'BIO-100',
    email: 'bianca@example.com',
  };
  const summary = {
    patient: {
      name: 'Bianca Tester',
      display_name: 'Bianca Tester',
      mrn: 'BIO-100',
      email: 'bianca@example.com',
      primary_condition: 'Depression',
      primary_modality: 'tms',
    },
    substances_count: 1,
    active_substance_count: 1,
    labs_count: 1,
    abnormal_lab_count: 1,
  };
  const catalog = [
    { id: 'cat-sertraline', item_type: 'medication', type: 'medication', category: 'medication', name: 'Sertraline', label: 'Sertraline' },
    { id: 'cat-vitd', item_type: 'biomarker', type: 'biomarker', category: 'bio', name: 'Vitamin D', label: 'Vitamin D' },
  ];
  const state = {
    substances: [
      {
        id: 'sub-1',
        substance_id: 'sub-1',
        name: 'Sertraline',
        substance_name: 'Sertraline',
        type: 'medication',
        kind: 'medication',
        status: 'active',
        dose: '50 mg',
        started_at: '2026-04-01T00:00:00Z',
        notes: 'Initial dose',
      },
    ],
    labs: [
      {
        id: 'lab-1',
        lab_id: 'lab-1',
        lab_name: 'Vitamin D',
        name: 'Vitamin D',
        value_numeric: 20,
        value_text: '20',
        unit: 'ng/mL',
        reference_range_text: '30 - 100',
        abnormal_flag: 'low',
        source_lab: 'Quest',
        collected_at: '2026-04-20T09:00:00Z',
        notes: 'Low baseline',
      },
    ],
  };

  page.route('**/api/v1/evidence/stats', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
  page.route('**/api/v1/notifications/stream**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  page.route(`**/api/v1/patients/${patientId}`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(patient) });
  });
  page.route(`**/api/v1/bio/patients/${patientId}/summary`, (route) => {
    summary.substances_count = state.substances.length;
    summary.active_substance_count = state.substances.filter((item) => item.status === 'active').length;
    summary.labs_count = state.labs.length;
    summary.abnormal_lab_count = state.labs.filter((item) => item.abnormal_flag && item.abnormal_flag !== 'normal').length;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summary) });
  });
  page.route('**/api/v1/bio/catalog**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: catalog, total: catalog.length }) });
  });
  page.route(`**/api/v1/bio/patients/${patientId}/substances`, async (route, request) => {
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: state.substances, total: state.substances.length }) });
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"unexpected method"}' });
  });
  page.route(`**/api/v1/bio/patients/${patientId}/substances/*`, async (route, request) => {
    if (request.method() === 'PUT') {
      const payload = request.postDataJSON();
      state.substances[0] = {
        ...state.substances[0],
        name: payload.name,
        substance_name: payload.name,
        type: payload.substance_type,
        kind: payload.substance_type,
        status: payload.status,
        dose: payload.dose,
        started_at: payload.started_at ? `${payload.started_at}T00:00:00Z` : '',
        notes: payload.notes,
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.substances[0]) });
    }
    if (request.method() === 'DELETE') {
      state.substances.splice(0, 1);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"unexpected method"}' });
  });
  page.route(`**/api/v1/bio/patients/${patientId}/labs`, async (route, request) => {
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: state.labs, total: state.labs.length }) });
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"unexpected method"}' });
  });
  page.route(`**/api/v1/bio/patients/${patientId}/labs/*`, async (route, request) => {
    if (request.method() === 'PUT') {
      const payload = request.postDataJSON();
      state.labs[0] = {
        ...state.labs[0],
        lab_name: payload.lab_name,
        name: payload.lab_name,
        value_numeric: payload.value_numeric,
        value_text: payload.value_text,
        unit: payload.unit,
        reference_range_text: payload.reference_range_text,
        abnormal_flag: payload.abnormal_flag,
        source_lab: payload.source_lab,
        collected_at: payload.collected_at ? `${payload.collected_at}T00:00:00Z` : state.labs[0].collected_at,
        notes: payload.notes,
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.labs[0]) });
    }
    if (request.method() === 'DELETE') {
      state.labs.splice(0, 1);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"unexpected method"}' });
  });
}

async function openBioDatabase(page: Page) {
  await page.goto('/#/bio-database/bio-e2e-patient');
  await page.waitForFunction(() => typeof (window as any).demoLogin === 'function');
  await page.evaluate(async () => {
    localStorage.setItem('ds_onboarding_complete', 'true');
    localStorage.setItem('ds_onboarding_done', '1');
    await (window as any).demoLogin('bio-e2e-token');
    (window as any)._selectedPatientId = 'bio-e2e-patient';
    (window as any)._profilePatientId = 'bio-e2e-patient';
    sessionStorage.setItem('ds_pat_selected_id', 'bio-e2e-patient');
  });
  await expect(page.locator('#content .bio-db-page')).toBeVisible();
  await expect(page.locator('#content')).toContainText('Bianca Tester');
}

test.describe('Bio database live edit workflow', () => {
  test('substance and lab entries edit in place in the browser', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    mockAuth(page);
    mockBioApis(page);
    await openBioDatabase(page);

    const substancesPanel = page.locator('section.bio-db-panel').filter({ hasText: 'Substances' }).first();
    await substancesPanel.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page.locator('#bio-substance-name')).toHaveValue('Sertraline');
    await page.locator('#bio-substance-dose').fill('75 mg');
    await page.locator('#bio-substance-notes').fill('Dose increased after review');
    await page.locator('#bio-substance-started-at').fill('2026-04-02');
    await substancesPanel.getByRole('button', { name: 'Save substance changes' }).click();
    await expect(substancesPanel).toContainText('75 mg');
    await expect(substancesPanel).toContainText('Dose increased after review');
    await expect(substancesPanel).toContainText('Started 2026-04-02');

    const labsPanel = page.locator('section.bio-db-panel').filter({ hasText: 'Lab results' }).first();
    await labsPanel.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page.locator('#bio-lab-name')).toHaveValue('Vitamin D');
    await page.locator('#bio-lab-value').fill('28');
    await page.locator('#bio-lab-source-lab').fill('Labcorp');
    await page.locator('#bio-lab-notes').fill('Improving after supplementation');
    await labsPanel.getByRole('button', { name: 'Save lab changes' }).click();
    await expect(labsPanel).toContainText('28 ng/mL');
    await expect(labsPanel).toContainText('Source Labcorp');
    await expect(labsPanel).toContainText('Improving after supplementation');

    const fatal = errors.filter((e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'));
    expect(fatal).toHaveLength(0);
  });
});
