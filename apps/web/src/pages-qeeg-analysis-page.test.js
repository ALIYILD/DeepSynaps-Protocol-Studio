import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
    addEventListener() {},
    body: { appendChild() {} },
  };
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}
if (typeof globalThis.window.open !== 'function') {
  globalThis.window.open = function () {};
}

const { api } = await import('./api.js');
const mod = await import('./pages-qeeg-analysis.js');
const { pgQEEGAnalysis, _getQEEGReportPdfUrl, renderCompareSelectionSummary } = mod;

function createFakeElement(id, registry) {
  let html = '';
  return {
    id,
    value: '',
    files: [],
    style: {},
    classList: { add() {}, remove() {} },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    click() {},
    focus() {},
    closest() { return null; },
    set innerHTML(value) {
      html = String(value || '');
      registerIdsFromHtml(html, registry);
    },
    get innerHTML() {
      return html;
    },
  };
}

function registerIdsFromHtml(html, registry) {
  const matches = html.matchAll(/id="([^"]+)"/g);
  for (const match of matches) {
    const id = match[1];
    if (!registry.has(id)) {
      registry.set(id, createFakeElement(id, registry));
    }
  }
}

function installFakeDom() {
  const registry = new Map();
  registry.set('content', createFakeElement('content', registry));
  const documentStub = {
    body: { appendChild() {} },
    addEventListener() {},
    createElement() {
      return createFakeElement('', registry);
    },
    getElementById(id) {
      return registry.get(id) || null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  globalThis.document = documentStub;
  globalThis.window.document = documentStub;
  globalThis.window.innerWidth = 1280;
  return {
    content: registry.get('content'),
    get(id) {
      return registry.get(id) || null;
    },
  };
}

async function withStubbedApi(overrides, run) {
  const originals = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = api[key];
    api[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      api[key] = value;
    }
  }
}

function installPageGlobals() {
  globalThis.window._qeegPatientId = null;
  globalThis.window._qeegSelectedId = null;
  globalThis.window._qeegComparisonId = null;
  globalThis.window._qeegTab = 'patient';
  globalThis.window._selectedPatientId = null;
  globalThis.window._profilePatientId = null;
  globalThis.window._nav = function () {};
  globalThis.window.DEEPSYNAPS_ENABLE_AI_UPGRADES = false;
  globalThis.window.DEEPSYNAPS_ENABLE_MNE = true;
}

test('patient tab inherits active app patient context when qEEG scope is unset', async () => {
  const dom = installFakeDom();
  installPageGlobals();
  globalThis.window._qeegPatientId = undefined;
  globalThis.window._qeegTab = 'patient';
  globalThis.window._selectedPatientId = 'patient-ctx';

  const patient = {
    id: 'patient-ctx',
    first_name: 'Grace',
    last_name: 'Hopper',
    primary_condition: 'Attention',
    dob: '1985-12-09',
    gender: 'F',
  };

  await withStubbedApi({
    listPatients: async () => [patient],
    getPatient: async () => patient,
    getPatientMedicalHistory: async () => ({ sections: {} }),
    listPatientQEEGAnalyses: async () => ({ items: [] }),
  }, async () => {
    await pgQEEGAnalysis(function () {}, function () {});
  });

  assert.equal(globalThis.window._qeegPatientId, 'patient-ctx');
  assert.ok(dom.get('qeeg-upload-col'), 'upload column should render for inherited patient context');
});

test('patient tab renders broader upload copy and analyzer stack card', async () => {
  const dom = installFakeDom();
  installPageGlobals();
  globalThis.window._qeegTab = 'patient';
  globalThis.window._qeegPatientId = 'patient-1';

  const patient = {
    id: 'patient-1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    primary_condition: 'Attention',
    dob: '1990-12-10',
    gender: 'F',
  };

  await withStubbedApi({
    listPatients: async () => [patient],
    getPatient: async () => patient,
    getPatientMedicalHistory: async () => ({ sections: {} }),
    listPatientQEEGAnalyses: async () => ({
      items: [{
        id: 'analysis-1',
        analysis_status: 'completed',
        created_at: '2026-04-20T10:00:00Z',
        quality_metrics: { n_epochs_retained: 10, n_epochs_total: 12 },
        connectivity_json: { alpha: {} },
        advanced_analyses: { meta: { completed: 5 }, results: { coherence_matrix: { status: 'ok' } } },
        reports_count: 1,
      }],
    }),
  }, async () => {
    await pgQEEGAnalysis(function () {}, function () {});
  });

  const uploadCol = dom.get('qeeg-upload-col');
  assert.ok(uploadCol, 'upload column should be rendered');
  assert.match(uploadCol.innerHTML, /Accepted:\s*\.edf, \.bdf, \.vhdr \(BrainVision header\), \.set/);
  assert.match(uploadCol.innerHTML, /accept="\.edf,\.bdf,\.vhdr,\.set"/);
  assert.match(uploadCol.innerHTML, /Analyzer Stack/);
  assert.match(uploadCol.innerHTML, /Supported uploads:/);
  assert.match(uploadCol.innerHTML, /select the <code>\.vhdr<\/code> header file/i);
  assert.match(uploadCol.innerHTML, /Stage 1/);
  assert.match(uploadCol.innerHTML, /BIDS export/);
  assert.match(uploadCol.innerHTML, /Quality QA/);
  assert.match(uploadCol.innerHTML, /Connectivity/);
  assert.match(uploadCol.innerHTML, /Advanced/);
  assert.match(uploadCol.innerHTML, /Report/);
});

test('analysis tab surfaces toolchain overview and staged workflow actions', async () => {
  const dom = installFakeDom();
  installPageGlobals();
  globalThis.window._qeegTab = 'analysis';
  globalThis.window._qeegSelectedId = 'analysis-42';

  const analysis = {
    id: 'analysis-42',
    patient_id: 'patient-42',
    original_filename: 'session-42.edf',
    analysis_status: 'completed',
    analyzed_at: '2026-04-20T10:00:00Z',
    sample_rate_hz: 256,
    channel_count: 19,
    recording_duration_sec: 300,
    eyes_condition: 'closed',
    quality_metrics: { n_epochs_retained: 48, n_epochs_total: 60 },
    band_powers_json: {
      bands: {
        alpha: { channels: { F3: { relative_pct: 16.2 }, F4: { relative_pct: 14.8 } } },
      },
      derived_ratios: { theta_beta_ratio: 3.2 },
    },
    connectivity_json: { alpha: { F3: { F4: 0.41 } } },
    advanced_analyses: { meta: { completed: 8 }, results: { coherence_matrix: { status: 'ok', data: { channels: ['F3', 'F4'], bands: { alpha: [[1, 0.4], [0.4, 1]] } } } } },
    brain_age_json: { predicted_age: 41.2 },
  };

  await withStubbedApi({
    listPatients: async () => [],
    getQEEGAnalysis: async () => analysis,
    getFusionRecommendation: async () => null,
  }, async () => {
    await pgQEEGAnalysis(function () {}, function () {});
  });

  const tab = dom.get('qeeg-tab-content');
  assert.ok(tab, 'analysis tab should be rendered');
  assert.match(tab.innerHTML, /Analysis Overview/);
  assert.match(tab.innerHTML, /MNE-Python/);
  assert.match(tab.innerHTML, /PyPREP/);
  assert.match(tab.innerHTML, /MNE-ICALabel/);
  assert.match(tab.innerHTML, /specparam/);
  assert.match(tab.innerHTML, /Workflow Actions/);
  assert.match(tab.innerHTML, /Preprocess/);
  assert.match(tab.innerHTML, /AI Enrich/);
  assert.match(tab.innerHTML, /Report & Compare/);
});

test('report tab renders report actions and preserves any PDF viewer side panel when present', async () => {
  const dom = installFakeDom();
  installPageGlobals();
  globalThis.window._qeegTab = 'report';
  globalThis.window._qeegSelectedId = 'analysis-9';

  const report = {
    id: 'report-9',
    ai_narrative_json: {
      executive_summary: 'Frontal theta remains elevated [1].',
      findings: [
        { region: 'Fz', band: 'theta', observation: 'Absolute theta remains elevated [1].', citations: [1] },
      ],
      confidence_level: 'moderate',
    },
    literature_refs_json: [
      { n: 1, pmid: '12345678', title: 'Frontal theta reference', year: 2024 },
    ],
    clinician_reviewed: false,
    clinician_amendments: '',
    pdf_url: 'https://example.test/report-9.pdf',
    report_pdf_url: 'https://example.test/report-9.pdf',
    created_at: '2026-04-20T12:00:00Z',
    report_type: 'standard',
  };
  const reportOlder = {
    id: 'report-8',
    ai_narrative_json: { executive_summary: 'Earlier draft.' },
    clinician_reviewed: true,
    created_at: '2026-04-18T09:00:00Z',
    report_type: 'prediction',
  };
  const analysis = {
    id: 'analysis-9',
    patient_id: 'patient-9',
    analyzed_at: '2026-04-20T10:00:00Z',
    sample_rate_hz: 250,
    channel_count: 19,
    recording_duration_sec: 300,
    eyes_condition: 'closed',
    quality_metrics: { n_epochs_retained: 48, n_epochs_total: 60 },
    pipeline_version: 'mne-2.1',
    norm_db_version: 'norm-2026-a',
    band_powers_json: { bands: {}, derived_ratios: {} },
  };

  await withStubbedApi({
    listPatients: async () => [],
    listQEEGAnalysisReports: async () => [reportOlder, report],
    getQEEGAnalysis: async () => analysis,
  }, async () => {
    await pgQEEGAnalysis(function () {}, function () {});
  });

  const tab = dom.get('qeeg-tab-content');
  assert.ok(tab, 'report tab should be rendered');
  assert.match(tab.innerHTML, /Report Versions/);
  assert.match(tab.innerHTML, /v2/);
  assert.match(tab.innerHTML, /v1/);
  assert.match(tab.innerHTML, /Print Report/);
  assert.match(tab.innerHTML, /Download PDF/);
  assert.match(tab.innerHTML, /Frontal theta remains elevated/);

  const hasPdfViewer = /<(iframe|object|embed)\b/i.test(tab.innerHTML) || /application\/pdf/i.test(tab.innerHTML);
  if (hasPdfViewer) {
    assert.match(tab.innerHTML, /(report-9\.pdf|PDF|viewer)/i);
  }
  assert.match(tab.innerHTML, /Retained epochs|Pipeline version|Norm database|Report Side Panel|PDF Viewer/i);
});

test('report PDF helper prefers explicit report URL and falls back to API endpoint', () => {
  const original = api.getQEEGReportPDF;
  api.getQEEGReportPDF = (analysisId, reportId) => `https://api.test/qeeg/${analysisId}/reports/${reportId}.pdf`;
  try {
    assert.equal(
      _getQEEGReportPdfUrl({ report_pdf_url: 'https://cdn.test/report-a.pdf' }, { id: 'analysis-a' }),
      'https://cdn.test/report-a.pdf'
    );
    assert.equal(
      _getQEEGReportPdfUrl({ id: 'report-b' }, { id: 'analysis-b' }),
      'https://api.test/qeeg/analysis-b/reports/report-b.pdf'
    );
    assert.equal(_getQEEGReportPdfUrl({}, {}), null);
  } finally {
    api.getQEEGReportPDF = original;
  }
});

test('compare summary renders chronological baseline and follow-up guidance', () => {
  const html = renderCompareSelectionSummary(
    { id: 'baseline', original_filename: 'baseline.edf', analyzed_at: '2026-01-10T00:00:00Z' },
    { id: 'follow', original_filename: 'followup.edf', analyzed_at: '2026-02-09T00:00:00Z' }
  );

  assert.match(html, /Suggested comparison/);
  // Date formatting is environment-dependent (MM/DD/YYYY vs DD/MM/YYYY).
  assert.match(html, /Baseline:[\s\S]*?baseline\.edf(\s*\((1\/10\/2026|10\/01\/2026)\))?/);
  assert.match(html, /Follow-up:[\s\S]*?followup\.edf(\s*\((2\/9\/2026|09\/02\/2026)\))?/);
  assert.match(html, /30-day interval/);
});

test('compare tab preselects oldest baseline and newest follow-up', async () => {
  const dom = installFakeDom();
  installPageGlobals();
  globalThis.window._qeegTab = 'compare';
  globalThis.window._qeegPatientId = 'patient-22';

  const patient = {
    id: 'patient-22',
    first_name: 'Grace',
    last_name: 'Hopper',
    primary_condition: 'Attention',
    dob: '1985-12-09',
    gender: 'F',
  };

  await withStubbedApi({
    listPatients: async () => [patient],
    getPatient: async () => patient,
    getPatientMedicalHistory: async () => ({ sections: {} }),
    listPatientQEEGAnalyses: async () => ({
      items: [
        { id: 'late', analysis_status: 'completed', original_filename: 'late.edf', analyzed_at: '2026-04-21T10:00:00Z' },
        { id: 'mid', analysis_status: 'completed', original_filename: 'mid.edf', analyzed_at: '2026-03-18T10:00:00Z' },
        { id: 'early', analysis_status: 'completed', original_filename: 'early.edf', analyzed_at: '2026-02-02T10:00:00Z' },
      ],
    }),
  }, async () => {
    await pgQEEGAnalysis(function () {}, function () {});
  });

  const tab = dom.get('qeeg-tab-content');
  assert.ok(tab, 'compare tab should be rendered');
  assert.match(tab.innerHTML, /Suggested comparison/);
  assert.match(tab.innerHTML, /early\.edf/);
  assert.match(tab.innerHTML, /late\.edf/);
  assert.match(tab.innerHTML, /value="early" selected/);
  assert.match(tab.innerHTML, /value="late" selected/);
});
