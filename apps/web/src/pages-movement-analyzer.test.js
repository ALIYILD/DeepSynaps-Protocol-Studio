/**
 * Movement Analyzer — routing helpers and audit merge behavior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMovementAnalyzerPatientContext,
  analyzerIdToNavPage,
  canUseMovementAnalyzerWorkspace,
  mergeMovementAuditItems,
  esc,
} from './pages-movement-analyzer.js';

test('analyzerIdToNavPage maps backend analyzer ids to nav pages', () => {
  assert.equal(analyzerIdToNavPage('deeptwin'), 'deeptwin');
  assert.equal(analyzerIdToNavPage('clinician-wellness'), 'clinician-wellness');
  assert.equal(analyzerIdToNavPage('wearables'), 'wearables');
  assert.equal(analyzerIdToNavPage('unknown-module'), 'unknown-module');
});

test('mergeMovementAuditItems prefers dedicated audit GET response', () => {
  const profile = { audit_tail: [{ id: 't1', kind: 'annotation', message: 'tail' }] };
  const auditGet = { items: [{ id: 'g1', kind: 'recompute', message: 'get' }] };
  const merged = mergeMovementAuditItems(profile, auditGet);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'g1');
});

test('mergeMovementAuditItems falls back to audit_tail when GET empty', () => {
  const profile = { audit_tail: [{ id: 't1', kind: 'annotation', message: 'tail' }] };
  const merged = mergeMovementAuditItems(profile, { items: [] });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 't1');
});

test('esc escapes HTML', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
});

test('canUseMovementAnalyzerWorkspace allows clinician-like roles only', () => {
  assert.equal(canUseMovementAnalyzerWorkspace('clinician'), true);
  assert.equal(canUseMovementAnalyzerWorkspace('resident'), true);
  assert.equal(canUseMovementAnalyzerWorkspace('patient'), false);
  assert.equal(canUseMovementAnalyzerWorkspace('', { allowUnknown: true }), true);
  assert.equal(canUseMovementAnalyzerWorkspace('', { allowUnknown: false }), false);
});

test('applyMovementAnalyzerPatientContext seeds patient context for linked pages', () => {
  const win = {};
  applyMovementAnalyzerPatientContext('patient-analytics', 'pt-123', win);
  assert.equal(win._profilePatientId, 'pt-123');
  assert.equal(win._selectedPatientId, 'pt-123');
  assert.equal(win._paPatientId, 'pt-123');

  const win2 = {};
  applyMovementAnalyzerPatientContext('deeptwin', 'pt-456', win2);
  assert.equal(win2._deeptwinPatientId, 'pt-456');
});
