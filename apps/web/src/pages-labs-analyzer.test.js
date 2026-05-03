/**
 * Labs Analyzer — role gate + safety copy regression (clinician-oriented workspace).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { labsWorkspaceAllowedForRole, LABS_ANALYZER_ROLE_ORDER } from './pages-labs-analyzer.js';

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

test('demo fixtures: labs flags do not contain raw medication dose instructions', async () => {
  const { ANALYZER_DEMO_FIXTURES } = await import('./demo-fixtures-analyzers.js');
  const p = ANALYZER_DEMO_FIXTURES.labs.patient_profile('demo-pt-samantha-li');
  const text = JSON.stringify(p.flags || []);
  assert.equal(text.includes('cholecalciferol'), false, 'no supplement dosing in demo');
  assert.equal(text.includes('600 mg'), false, 'no mg dosing instructions in demo');
});
