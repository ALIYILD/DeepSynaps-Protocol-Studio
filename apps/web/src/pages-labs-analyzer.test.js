/**
 * Labs Analyzer — role gate + safety copy regression (clinician-oriented workspace).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLabsAnalyzerPatientContext,
  labsClinicEmptyStateHtml,
  labsWorkspaceAllowedForRole,
  LABS_ANALYZER_ROLE_ORDER,
  resolveLabsAnalyzerPatientId,
} from './pages-labs-analyzer.js';

test('labsWorkspaceAllowedForRole requires clinician or admin', () => {
  assert.equal(labsWorkspaceAllowedForRole('clinician'), true);
  assert.equal(labsWorkspaceAllowedForRole('admin'), true);
  assert.equal(labsWorkspaceAllowedForRole('reviewer'), false);
  assert.equal(labsWorkspaceAllowedForRole('technician'), false);
  assert.equal(labsWorkspaceAllowedForRole('patient'), false);
  assert.equal(labsWorkspaceAllowedForRole('guest'), false);
});

test('LABS_ANALYZER_ROLE_ORDER is ordered for future use', () => {
  assert.ok(LABS_ANALYZER_ROLE_ORDER.clinician > LABS_ANALYZER_ROLE_ORDER.patient);
});

test('resolveLabsAnalyzerPatientId prefers selected patient then profile fallback', () => {
  assert.equal(resolveLabsAnalyzerPatientId({ _selectedPatientId: 'pt-selected', _profilePatientId: 'pt-profile' }), 'pt-selected');
  assert.equal(resolveLabsAnalyzerPatientId({ _profilePatientId: 'pt-profile' }), 'pt-profile');
  assert.equal(resolveLabsAnalyzerPatientId({}), '');
});

test('applyLabsAnalyzerPatientContext seeds linked workflow patient context', () => {
  const win = {};
  applyLabsAnalyzerPatientContext('deeptwin', 'pt-55', win);
  assert.equal(win._selectedPatientId, 'pt-55');
  assert.equal(win._profilePatientId, 'pt-55');
  assert.equal(win._deeptwinPatientId, 'pt-55');
});

test('demo fixtures: labs flags do not contain raw medication dose instructions', async () => {
  const { ANALYZER_DEMO_FIXTURES } = await import('./demo-fixtures-analyzers.js');
  const p = ANALYZER_DEMO_FIXTURES.labs.patient_profile('demo-pt-samantha-li');
  const text = JSON.stringify(p.flags || []);
  assert.equal(text.includes('cholecalciferol'), false, 'no supplement dosing in demo');
  assert.equal(text.includes('600 mg'), false, 'no mg dosing instructions in demo');
});

test('labs empty-state copy distinguishes supported-empty from unsupported backend', () => {
  const supported = labsClinicEmptyStateHtml({ unsupportedLiveSummary: false });
  const unsupported = labsClinicEmptyStateHtml({ unsupportedLiveSummary: true });
  assert.match(supported, /returned no patient rows/i);
  assert.doesNotMatch(supported, /does not currently have a live clinic-summary backend feed/i);
  assert.match(unsupported, /backend feed is unavailable on this environment/i);
});
