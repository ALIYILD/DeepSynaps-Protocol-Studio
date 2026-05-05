/**
 * Unit tests for qeeg-upload-workflow.js
 *
 * Tests cover: file validation, intake validation, utility functions,
 * step gating logic, and render function output.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

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
const { _test } = mod;

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

test('_validateFile accepts valid VHDR file', () => {
  const file = { name: 'session.vhdr', size: 256 };
  const result = _test._validateFile(file);
  assert.equal(result.valid, true);
});

test('_validateFile rejects unsupported extension', () => {
  const file = { name: 'photo.jpg', size: 1024 };
  const result = _test._validateFile(file);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Unsupported format'));
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

// ── resetUploadWorkflow ───────────────────────────────────────────────────────

test('resetUploadWorkflow clears state without throwing', () => {
  assert.doesNotThrow(() => mod.resetUploadWorkflow());
});
