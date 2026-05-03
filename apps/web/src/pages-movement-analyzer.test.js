/**
 * Movement Analyzer — routing helpers and audit merge behavior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzerIdToNavPage,
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
