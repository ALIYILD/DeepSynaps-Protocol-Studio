/**
 * Unit tests for qeeg-upload-workflow.js
 *
 * Tests cover: file validation, intake validation, utility functions,
 * step gating logic, and render function output.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// The module uses `import { api, downloadBlob } from './api.js'` and
// `import { emptyState, showToast } from './helpers.js'` which require
// a mock environment. We use the _test export for pure functions.

// Mock minimal browser globals before importing the module
globalThis.window = globalThis.window || { addEventListener: () => {}, removeEventListener: () => {} };
globalThis.document = globalThis.document || { getElementById: () => null, createElement: () => ({}), addEventListener: () => {}, removeEventListener: () => {}, hidden: false };
globalThis.localStorage = (() => {
  const store = {};
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
})();
globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
globalThis.FormData = class { append() {} };

const mod = await import('./qeeg-upload-workflow.js');
const { api } = await import('./api.js');
const { _test } = mod;

const originalGlobals = {
  window: globalThis.window,
  document: globalThis.document,
  localStorage: globalThis.localStorage,
  URL: globalThis.URL,
  FormData: globalThis.FormData,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
};

const originalApi = {};
for (const key of [
  'listPatientQEEGAnalyses',
  'createPatient',
  'listQEEGAnalysisReports',
  'getQEEGPrintableReport',
  'generateQEEGAIReport',
  'getQEEGAnalysisStatus',
]) {
  originalApi[key] = api[key];
}

function restoreApi() {
  for (const [key, value] of Object.entries(originalApi)) api[key] = value;
}

function createWorkflowDom() {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'https://example.test/workflow' },
  );
  const store = {};
  const lsShim = {
    getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
  Object.defineProperty(dom.window, 'localStorage', {
    configurable: true,
    value: lsShim,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = lsShim;
  globalThis.URL = {
    createObjectURL: () => 'blob:mock-report',
    revokeObjectURL: () => {},
  };
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  globalThis.FormData = class {
    constructor() { this.entries = []; }
    append(key, value) { this.entries.push([key, value]); }
  };
  return { dom, container: dom.window.document.getElementById('root'), localStorage: lsShim };
}

function restoreGlobals() {
  globalThis.window = originalGlobals.window;
  globalThis.document = originalGlobals.document;
  globalThis.localStorage = originalGlobals.localStorage;
  globalThis.URL = originalGlobals.URL;
  globalThis.FormData = originalGlobals.FormData;
  globalThis.requestAnimationFrame = originalGlobals.requestAnimationFrame;
  globalThis.cancelAnimationFrame = originalGlobals.cancelAnimationFrame;
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function installWorkflowApi() {
  api.listPatientQEEGAnalyses = async () => ({
    items: [
      { id: 'analysis-ready', status: 'completed', original_filename: 'ready.edf', created_at: '2026-05-09T10:00:00Z' },
      { id: 'analysis-running', status: 'processing', original_filename: 'running.edf', created_at: '2026-05-09T09:00:00Z' },
    ],
  });
  api.createPatient = async (payload) => ({
    id: 'patient-created',
    first_name: payload.first_name,
    last_name: payload.last_name,
    dob: payload.dob || '1990-01-01',
    gender: payload.gender || 'female',
    primary_condition: payload.primary_condition || 'ADHD',
  });
  api.listQEEGAnalysisReports = async () => ({ items: [{ id: 'report-1' }] });
  api.getQEEGPrintableReport = async () => new Blob(['%PDF-demo'], { type: 'application/pdf' });
  api.generateQEEGAIReport = async () => ({ ok: true });
  api.getQEEGAnalysisStatus = async () => ({ status: 'completed', progress_pct: 100, step: 'done' });
}

// ── _validateFile ─────────────────────────────────────────────────────────────

test('_validateFile accepts valid EDF file', () => {
  const file = { name: 'recording.edf', size: 50 * 1024 * 1024 };
  const result = _test._validateFile(file);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('_validateFile accepts valid BDF file', () => {
  const file = { name: 'data.bdf', size: 1024 };
  const result = _test._validateFile(file);
  assert.equal(result.valid, true);
});

test('_validateFile accepts valid FIF file', () => {
  const file = { name: 'session.fif', size: 256 };
  const result = _test._validateFile(file);
  assert.equal(result.valid, true);
});

test('_validateFile accepts valid BrainVision bundle files', () => {
  for (const name of ['bundle.vhdr', 'bundle.vmrk', 'bundle.eeg']) {
    const result = _test._validateFile({ name, size: 2048 });
    assert.equal(result.valid, true, `Expected ${name} to be valid`);
  }
});

test('_validateFile accepts valid EEGLAB export files', () => {
  for (const name of ['session.set', 'session.fdt']) {
    const result = _test._validateFile({ name, size: 2048 });
    assert.equal(result.valid, true, `Expected ${name} to be valid`);
  }
});

test('_validateFile rejects unsupported extension', () => {
  const file = { name: 'photo.jpg', size: 1024 };
  const result = _test._validateFile(file);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Unsupported standalone format'));
});

test('_validateFile rejects file exceeding 100MB', () => {
  const file = { name: 'huge.edf', size: 150 * 1024 * 1024 };
  const result = _test._validateFile(file);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Exceeds 100 MB'));
});

test('_validateFile rejects empty file', () => {
  const file = { name: 'empty.edf', size: 0 };
  const result = _test._validateFile(file);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Empty file'));
});

test('_validateFile collects multiple errors', () => {
  const file = { name: 'bad.pdf', size: 0 };
  const result = _test._validateFile(file);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 2);
});

test('_validateFile accepts all supported extensions', () => {
  _test.ACCEPTED_EXTENSIONS.forEach(ext => {
    const file = { name: 'test' + ext, size: 1024 };
    const result = _test._validateFile(file);
    assert.equal(result.valid, true, `Expected ${ext} to be valid`);
  });
});

// ── _computeAge ───────────────────────────────────────────────────────────────

test('_computeAge returns age for valid DOB', () => {
  const year = new Date().getFullYear();
  const age = _test._computeAge((year - 30) + '-06-15');
  // Could be 29 or 30 depending on current date
  assert.ok(age >= 29 && age <= 30, `Expected ~30, got ${age}`);
});

test('_computeAge returns empty string for null DOB', () => {
  assert.equal(_test._computeAge(null), '');
  assert.equal(_test._computeAge(''), '');
});

test('_computeAge returns empty string for invalid DOB', () => {
  assert.equal(_test._computeAge('not-a-date'), '');
});

// ── _humanSize ────────────────────────────────────────────────────────────────

test('_humanSize formats bytes correctly', () => {
  assert.equal(_test._humanSize(500), '500 B');
  assert.equal(_test._humanSize(1024), '1.0 KB');
  assert.equal(_test._humanSize(1536), '1.5 KB');
  assert.equal(_test._humanSize(1024 * 1024), '1.0 MB');
  assert.equal(_test._humanSize(52428800), '50.0 MB');
});

// ── _emptyIntake ──────────────────────────────────────────────────────────────

test('_emptyIntake returns valid draft structure', () => {
  const intake = _test._emptyIntake();
  assert.ok(intake.demographics);
  assert.ok(intake.symptoms);
  assert.ok(intake.diagnoses);
  assert.ok(Array.isArray(intake.medications));
  assert.ok(intake.notes);
  assert.equal(intake.demographics.sex, '');
  assert.equal(intake.symptoms.chief_complaint, '');
  assert.equal(intake.diagnoses.primary_dx, '');
});

// ── _validateIntakeRequired ───────────────────────────────────────────────────

test('_validateIntakeRequired reports all missing fields on empty intake', () => {
  // The module's internal state starts empty, so validation should fail
  const result = _test._validateIntakeRequired();
  assert.equal(result.valid, false);
  assert.ok(result.missing.length === 3);
  assert.ok(result.missing.some(m => m.includes('Sex')));
  assert.ok(result.missing.some(m => m.includes('Chief complaint')));
  assert.ok(result.missing.some(m => m.includes('Primary diagnosis')));
});

// ── _canGoToStep ──────────────────────────────────────────────────────────────

test('_canGoToStep: step 1 always accessible', () => {
  assert.equal(_test._canGoToStep(1), true);
});

test('_canGoToStep: step 2+ requires patient (fails when no patient)', () => {
  // Module state has no patient by default
  assert.equal(_test._canGoToStep(2), false);
  // Step 3 also requires patient (intake is optional)
  assert.equal(_test._canGoToStep(3), false);
});

// ── _friendlyErrorMessage ─────────────────────────────────────────────────────

test('_friendlyErrorMessage returns network error message', () => {
  const msg = _test._friendlyErrorMessage(new Error('Failed to fetch'));
  assert.ok(msg.includes('Network error'));
});

test('_friendlyErrorMessage returns session expired for 401', () => {
  const msg = _test._friendlyErrorMessage(new Error('401 Unauthorized'));
  assert.ok(msg.includes('Session expired'));
});

test('_friendlyErrorMessage returns server error for 500', () => {
  const msg = _test._friendlyErrorMessage(new Error('500 Internal Server Error'));
  assert.ok(msg.includes('Server error'));
});

test('_friendlyErrorMessage handles null/undefined gracefully', () => {
  const msg = _test._friendlyErrorMessage(null);
  assert.ok(msg.includes('unexpected error'));
});

test('_friendlyErrorMessage passes through unknown errors', () => {
  const msg = _test._friendlyErrorMessage(new Error('Something weird'));
  assert.equal(msg, 'Something weird');
});

// ── PIPELINE_STAGES ───────────────────────────────────────────────────────────

test('PIPELINE_STAGES has expected count and structure', () => {
  assert.equal(_test.PIPELINE_STAGES.length, 7);
  assert.equal(_test.PIPELINE_STAGES[0].id, 'queued');
  assert.equal(_test.PIPELINE_STAGES[6].id, 'ready');
  _test.PIPELINE_STAGES.forEach(s => {
    assert.ok(s.id, 'stage must have id');
    assert.ok(s.label, 'stage must have label');
  });
});

// ── _conditionToEnum ──────────────────────────────────────────────────────────

test('_conditionToEnum maps Eyes Open to awake_eo', () => {
  assert.equal(_test._conditionToEnum('Eyes Open'), 'awake_eo');
});

test('_conditionToEnum maps Eyes Closed to awake_ec', () => {
  assert.equal(_test._conditionToEnum('Eyes Closed'), 'awake_ec');
});

test('_conditionToEnum maps known conditions correctly', () => {
  assert.equal(_test._conditionToEnum('Task'), 'task');
  assert.equal(_test._conditionToEnum('Hyperventilation'), 'hyperventilation');
  assert.equal(_test._conditionToEnum('Photic'), 'photic');
  assert.equal(_test._conditionToEnum('Sleep'), 'sleep');
  assert.equal(_test._conditionToEnum('Custom'), 'custom');
});

test('_conditionToEnum falls back to lowercase snake_case for unknown', () => {
  assert.equal(_test._conditionToEnum('Some Custom Condition'), 'some_custom_condition');
});

test('CONDITION_TO_BACKEND_ENUM has 7 entries', () => {
  assert.equal(Object.keys(_test.CONDITION_TO_BACKEND_ENUM).length, 7);
});

// ── renderUploadWorkflow ──────────────────────────────────────────────────────

test('renderUploadWorkflow returns HTML string', () => {
  const html = mod.renderUploadWorkflow({ patientId: null, patients: [], analyses: [] });
  assert.equal(typeof html, 'string');
  assert.ok(html.includes('uw-root'));
  assert.ok(html.includes('qeeg-uw-stepper'));
});

test('renderUploadWorkflow shows step 1 content when no patient', () => {
  const html = mod.renderUploadWorkflow({ patientId: null, patients: [], analyses: [] });
  assert.ok(html.includes('Select a Patient'));
  assert.ok(html.includes('data-uw-action="search-input"'));
});

test('renderUploadWorkflow shows patient card when patient provided', () => {
  const html = mod.renderUploadWorkflow({
    patientId: 'p1',
    patient: { id: 'p1', first_name: 'Jane', last_name: 'Doe', dob: '1990-01-01', gender: 'female' },
    patients: [{ id: 'p1', first_name: 'Jane', last_name: 'Doe', dob: '1990-01-01', gender: 'female' }],
    analyses: [],
  });
  assert.ok(html.includes('Jane'));
  assert.ok(html.includes('Doe'));
});

test('renderUploadWorkflow advertises real EEG bundle formats', () => {
  mod.resetUploadWorkflow();
  const { localStorage } = createWorkflowDom();
  localStorage.setItem('qeeg_intake_draft_p1_step', '3');
  const html = mod.renderUploadWorkflow({
    patientId: 'p1',
    patient: { id: 'p1', first_name: 'Jane', last_name: 'Doe', dob: '1990-01-01', gender: 'female' },
    patients: [{ id: 'p1', first_name: 'Jane', last_name: 'Doe', dob: '1990-01-01', gender: 'female' }],
    analyses: [],
  });
  assert.match(html, /BrainVision bundle/i);
  assert.match(html, /\.vhdr \+ \.vmrk \+ \.eeg/i);
  assert.match(html, /\.set \+ \.fdt/i);
  assert.match(html, /\.fif/i);
  assert.match(html, /Clinical import checklist/i);
});

// ── resetUploadWorkflow ───────────────────────────────────────────────────────

test('resetUploadWorkflow clears state without throwing', () => {
  assert.doesNotThrow(() => mod.resetUploadWorkflow());
});

test('mountUploadWorkflow supports keyboard overlays, patient search/select, and intake transitions', async () => {
  restoreApi();
  installWorkflowApi();
  const { dom, container } = createWorkflowDom();
  mod.resetUploadWorkflow();

  const selected = [];
  window._qeegSelectPatient = (id) => selected.push(id);

  const patients = [
    { id: 'demo-patient-1', first_name: 'Demo', last_name: 'Patient', dob: '1992-05-05', gender: 'female', is_demo: true, primary_condition: 'TBI' },
    { id: 'pt-1', first_name: 'Jane', last_name: 'Doe', dob: '1988-04-04', gender: 'female', primary_condition: 'ADHD' },
  ];

  container.innerHTML = mod.renderUploadWorkflow({ patientId: null, patients, analyses: [] });
  mod.mountUploadWorkflow(container);

  container.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: '?', bubbles: true }));
  assert.ok(container.innerHTML.includes('Keyboard Shortcuts'));
  container.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(!container.innerHTML.includes('Keyboard Shortcuts'));

  const search = container.querySelector('#uw-patient-search');
  search.value = 'ja';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await sleep(350);
  container.querySelector('[data-uw-action="select-patient"][data-uw-id="pt-1"]').click();
  await sleep(0);

  assert.deepEqual(selected, ['pt-1']);
  assert.ok(container.innerHTML.includes('Pre-QEEG Scan Intake'));

  container.querySelector('[data-uw-action="mark-intake-complete"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('Upload EEG Files'));

  container.querySelector('[data-uw-action="go-step"][data-uw-step="2"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('Unlock &amp; Edit'));
  container.querySelector('[data-uw-action="unlock-intake"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('Mark Complete'));

  mod.resetUploadWorkflow();
  restoreGlobals();
});

test('mountUploadWorkflow supports patient creation, drag-drop uploads, and demo pipeline transitions', async () => {
  restoreApi();
  installWorkflowApi();
  const { dom, container } = createWorkflowDom();
  mod.resetUploadWorkflow();

  const patients = [
    { id: 'demo-patient-1', first_name: 'Demo', last_name: 'Patient', dob: '1992-05-05', gender: 'female', is_demo: true, primary_condition: 'TBI' },
  ];

  container.innerHTML = mod.renderUploadWorkflow({ patientId: null, patients, analyses: [] });
  mod.mountUploadWorkflow(container);

  container.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'n', bubbles: true }));
  assert.ok(container.innerHTML.includes('New Patient'));
  container.querySelector('#uw-new-fname').value = 'Ava';
  container.querySelector('#uw-new-lname').value = 'Stone';
  container.querySelector('[data-uw-action="create-patient-submit"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('Ava Stone'));

  container.querySelector('[data-uw-action="go-step"][data-uw-step="1"]').click();
  await sleep(0);
  container.innerHTML = mod.renderUploadWorkflow({ patientId: null, patients, analyses: [] });
  container.querySelector('[data-uw-action="select-patient"][data-uw-id="demo-patient-1"]').click();
  await sleep(0);
  container.querySelector('[data-uw-action="go-step"][data-uw-step="3"]').click();
  await sleep(0);

  const dropzone = container.querySelector('[data-uw-action="dropzone-click"]');
  const dragOver = new dom.window.Event('dragover', { bubbles: true, cancelable: true });
  Object.defineProperty(dragOver, 'dataTransfer', { value: { dropEffect: '', files: [] } });
  dropzone.dispatchEvent(dragOver);
  assert.ok(dropzone.classList.contains('qeeg-uw-dropzone--dragover'));

  const dropEvent = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(dropEvent, 'dataTransfer', {
    value: {
      files: [
        { name: 'session.edf', size: 1024 },
        { name: 'bad.txt', size: 512 },
      ],
    },
  });
  dropzone.dispatchEvent(dropEvent);
  await sleep(0);

  assert.ok(container.innerHTML.includes('session.edf'));
  assert.ok(container.innerHTML.includes('Unsupported standalone format'));

  const conditionSelect = container.querySelector('[data-uw-action="condition-tag"]');
  conditionSelect.value = 'Task';
  conditionSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  container.querySelector('[data-uw-action="batch-upload"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('Confirm Analysis Submission'));
  container.querySelector('[data-uw-action="cancel-confirm"]').click();
  await sleep(0);
  container.querySelector('[data-uw-action="batch-upload"]').click();
  await sleep(0);
  container.querySelector('[data-uw-action="confirm-upload"]').click();
  await sleep(1200);

  assert.ok(container.innerHTML.includes('Analysis Pipeline'));
  assert.ok(container.innerHTML.includes('Artifact Removal') || container.innerHTML.includes('Queued'));

  mod.resetUploadWorkflow();
  restoreGlobals();
});

test('mountUploadWorkflow covers reports, pipeline retries, pdf viewer actions, and visibility/network handlers', async () => {
  restoreApi();
  installWorkflowApi();
  const { dom, container } = createWorkflowDom();
  mod.resetUploadWorkflow();

  const patients = [
    { id: 'pt-2', first_name: 'Morgan', last_name: 'Reed', dob: '1985-02-02', gender: 'male', primary_condition: 'Depression' },
  ];
  const analyses = [
    { id: 'analysis-ready', status: 'completed', original_filename: 'ready.edf', created_at: '2026-05-09T10:00:00Z' },
    { id: 'analysis-running', status: 'processing', original_filename: 'running.edf', created_at: '2026-05-09T09:00:00Z' },
    { id: 'analysis-failed', status: 'failed', original_filename: 'failed.edf', created_at: '2026-05-09T08:00:00Z' },
  ];

  container.innerHTML = mod.renderUploadWorkflow({
    patientId: 'demo-patient-2',
    patient: { id: 'demo-patient-2', first_name: 'Morgan', last_name: 'Reed', dob: '1985-02-02', gender: 'male', primary_condition: 'Depression' },
    patients,
    analyses,
  });
  mod.mountUploadWorkflow(container);

  container.querySelector('[data-uw-action="go-step"][data-uw-step="4"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('Scan History'));
  container.querySelector('[data-uw-action="view-report"][data-uw-id="analysis-ready"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('Load Report PDF'));
  container.querySelector('[data-uw-action="load-pdf"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('qEEG Report'));

  const iframe = container.querySelector('#uw-report-frame');
  const frameWindow = { printCalled: false, print() { this.printCalled = true; } };
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    value: frameWindow,
  });
  const anchorClicks = [];
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = originalCreateElement(tag);
    if (tag === 'a') {
      el.click = () => anchorClicks.push({ href: el.href, download: el.download });
    }
    return el;
  };
  const viewer = container.querySelector('.qeeg-uw-pdf-viewer');
  let fullscreenCalls = 0;
  viewer.requestFullscreen = () => { fullscreenCalls += 1; return Promise.resolve(); };
  document.fullscreenElement = null;
  document.exitFullscreen = () => { fullscreenCalls += 10; };

  container.querySelector('[data-uw-action="print-report"]').click();
  container.querySelector('[data-uw-action="fullscreen-report"]').click();
  container.querySelector('[data-uw-action="download-from-viewer"]').click();
  assert.equal(frameWindow.printCalled, true);
  assert.equal(fullscreenCalls, 1);
  assert.equal(anchorClicks.length, 1);

  document.createElement = originalCreateElement;

  container.querySelector('[data-uw-action="go-step"][data-uw-step="4"]').click();
  await sleep(0);
  container.querySelector('[data-uw-action="view-pipeline"][data-uw-id="analysis-running"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('Analysis Pipeline'));
  const toggleLogs = container.querySelector('[data-uw-action="toggle-logs"]');
  if (toggleLogs) toggleLogs.click();
  await sleep(0);

  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new dom.window.Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new dom.window.Event('visibilitychange'));
  window.dispatchEvent(new dom.window.Event('offline'));
  window.dispatchEvent(new dom.window.Event('online'));

  container.innerHTML = mod.renderUploadWorkflow({
    patientId: 'demo-patient-2',
    patient: { id: 'demo-patient-2', first_name: 'Morgan', last_name: 'Reed', dob: '1985-02-02', gender: 'male', primary_condition: 'Depression' },
    patients,
    analyses,
  });
  container.querySelector('[data-uw-action="go-step"][data-uw-step="2"]').click();
  await sleep(0);
  container.querySelector('[data-uw-action="intake-subtab"][data-uw-tab="medications"]').click();
  await sleep(0);
  container.querySelector('[data-uw-action="intake-med-add"]').click();
  await sleep(0);
  const medRemove = container.querySelector('[data-uw-action="intake-med-remove"]');
  if (medRemove) medRemove.click();
  await sleep(0);

  mod.resetUploadWorkflow();
  restoreGlobals();
});

test('mountUploadWorkflow covers close and clear flows, symptom and medication editing, empty reports, and demo report generation', async () => {
  restoreApi();
  installWorkflowApi();
  const { dom, container } = createWorkflowDom();
  mod.resetUploadWorkflow();

  const patients = [
    { id: 'demo-patient-9', first_name: 'Iris', last_name: 'Vale', dob: '1994-03-03', gender: 'female', is_demo: true, primary_condition: 'Anxiety' },
  ];

  container.innerHTML = mod.renderUploadWorkflow({ patientId: null, patients, analyses: [] });
  mod.mountUploadWorkflow(container);

  container.querySelector('[data-uw-action="create-patient-open"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('New Patient'));
  container.querySelector('[data-uw-action="create-patient-close"]').click();
  await sleep(0);
  assert.equal(container.querySelector('.qeeg-uw-slideover'), null);

  container.querySelector('[data-uw-action="select-patient"][data-uw-id="demo-patient-9"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('Pre-QEEG Scan Intake'));
  container.querySelector('[data-uw-action="go-step"][data-uw-step="1"]').click();
  await sleep(0);
  const clearBtn = container.querySelector('[data-uw-action="clear-patient"]');
  if (clearBtn) clearBtn.click();
  await sleep(0);
  container.innerHTML = mod.renderUploadWorkflow({ patientId: null, patients, analyses: [] });
  container.querySelector('[data-uw-action="select-patient"][data-uw-id="demo-patient-9"]').click();
  await sleep(0);

  container.querySelector('[data-uw-action="intake-subtab"][data-uw-tab="symptoms"]').click();
  await sleep(0);
  const symptom = container.querySelector('[data-uw-action="intake-symptom-check"]');
  symptom.click();
  await sleep(0);
  const severity = container.querySelector('[data-uw-action="intake-symptom-severity"]');
  severity.value = '7';
  severity.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await sleep(0);
  assert.ok(container.innerHTML.includes('Severity:'));

  container.querySelector('[data-uw-action="intake-subtab"][data-uw-tab="medications"]').click();
  await sleep(0);
  container.querySelector('[data-uw-action="intake-med-add"]').click();
  await sleep(0);
  const medInput = container.querySelector('[data-uw-action="intake-med"][data-uw-field="name"]');
  medInput.value = 'Sertraline';
  medInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await sleep(0);
  const medRemove = container.querySelector('[data-uw-action="intake-med-remove"]');
  if (medRemove) medRemove.click();
  await sleep(0);

  container.innerHTML = mod.renderUploadWorkflow({
    patientId: 'pt-empty',
    patient: { id: 'pt-empty', first_name: 'Nina', last_name: 'Rowe', dob: '1990-01-01', gender: 'female', primary_condition: 'ADHD' },
    patients,
    analyses: [],
  });
  container.querySelector('[data-uw-action="go-step"][data-uw-step="4"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('No analyses yet'));

  container.innerHTML = mod.renderUploadWorkflow({
    patientId: 'demo-patient-9',
    patient: { id: 'demo-patient-9', first_name: 'Iris', last_name: 'Vale', dob: '1994-03-03', gender: 'female', is_demo: true, primary_condition: 'Anxiety' },
    patients,
    analyses: [],
  });
  container.querySelector('[data-uw-action="go-step"][data-uw-step="3"]').click();
  await sleep(0);

  const dropEvent = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(dropEvent, 'dataTransfer', {
    value: { files: [{ name: 'demo-report.edf', size: 1024 }] },
  });
  container.querySelector('[data-uw-action="dropzone-click"]').dispatchEvent(dropEvent);
  await sleep(0);
  container.querySelector('[data-uw-action="batch-upload"]').click();
  await sleep(0);
  container.querySelector('[data-uw-action="confirm-upload"]').click();
  await sleep(1200);

  container.querySelector('[data-uw-action="go-step"][data-uw-step="6"]').click();
  await sleep(0);
  assert.ok(container.innerHTML.includes('Load Report PDF'));
  container.querySelector('[data-uw-action="generate-report"]').click();
  await sleep(2200);
  assert.ok(container.innerHTML.includes('qEEG Report'));

  mod.resetUploadWorkflow();
  restoreGlobals();
});
