// qeeg-analysis-normative-engine.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECORDING_CONDITION_OPTIONS,
  resolveRecordingConditionFromMetadata,
  resolveRecordingConditionForAnalysis,
  renderRecordingConditionPanel,
  buildDemoNormativeModelCard,
  normativeEngineStorageKey,
} from './qeeg-analysis-normative-engine.js';

test('RECORDING_CONDITION_OPTIONS lists four canonical states', () => {
  assert.equal(RECORDING_CONDITION_OPTIONS.length, 4);
  assert.ok(RECORDING_CONDITION_OPTIONS.some((o) => o.value === 'eyes_closed'));
  assert.ok(RECORDING_CONDITION_OPTIONS.some((o) => o.value === 'unknown'));
});

test('resolveRecordingConditionFromMetadata maps common upload strings', () => {
  assert.equal(resolveRecordingConditionFromMetadata('closed'), 'eyes_closed');
  assert.equal(resolveRecordingConditionFromMetadata('eyes_closed'), 'eyes_closed');
  assert.equal(resolveRecordingConditionFromMetadata('open'), 'eyes_open');
  assert.equal(resolveRecordingConditionFromMetadata('task'), 'task');
  assert.equal(resolveRecordingConditionFromMetadata(''), 'unknown');
  assert.equal(resolveRecordingConditionFromMetadata(null), 'unknown');
});

test('recording condition panel states override is browser-only, not server-persisted', () => {
  var html = renderRecordingConditionPanel({ eyes_condition: 'closed' }, 'a2');
  assert.match(html, /Not saved to the server/i);
  assert.match(html, /sessionStorage/i);
});

test('buildDemoNormativeModelCard labels demo provider and review cues', () => {
  var card = buildDemoNormativeModelCard({ eyes_condition: 'closed', norm_db_version: 'toy-0.1' });
  assert.equal(card.recording_condition, 'eyes_closed');
  assert.equal(card.normative_provider.type, 'demo');
  assert.equal(card.normative_provider.clinical_use, false);
  assert.ok(card.limitations.some(function (l) { return /review cue/i.test(l); }));
});

test('normativeEngineStorageKey is stable per analysis', () => {
  assert.equal(normativeEngineStorageKey('x'), 'ds_qeeg_recording_condition_x');
});

test('resolveRecordingConditionForAnalysis prefers session override when set', () => {
  if (typeof globalThis.sessionStorage === 'undefined') {
    globalThis.sessionStorage = { _m: {},
      getItem(k) { return this._m[k] || null; },
      setItem(k, v) { this._m[k] = v; },
      removeItem(k) { delete this._m[k]; },
    };
  }
  sessionStorage.setItem(normativeEngineStorageKey('z9'), 'eyes_open');
  var r = resolveRecordingConditionForAnalysis({ eyes_condition: 'closed' }, 'z9');
  assert.equal(r, 'eyes_open');
  sessionStorage.removeItem(normativeEngineStorageKey('z9'));
});
