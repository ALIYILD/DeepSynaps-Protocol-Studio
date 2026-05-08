// Frontend defence-in-depth filter for QEEG protocol suggestions.
// Mirrors the backend `test_qeeg_evidence_gating.py` contract. See
// qeeg-protocol-suggestion-filter.js header for context.
import test from 'node:test';
import assert from 'node:assert/strict';

import { filterGatedSuggestions } from './qeeg-protocol-suggestion-filter.js';

test('filterGatedSuggestions strips entries with enabled: false', function () {
  const out = filterGatedSuggestions([
    { pattern: 'lateraloccipital_bilateral_deficit', modality: 'tDCS', target: 'O1/O2', enabled: false },
    { pattern: 'rostralmiddlefrontal_lh_deficit', modality: 'rTMS', target: 'left DLPFC', enabled: true },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].target, 'left DLPFC');
});

test('filterGatedSuggestions strips entries with NOT_SUPPORTED_DO_NOT_SURFACE evidence grade', function () {
  const out = filterGatedSuggestions([
    { modality: 'tACS', target: 'Pz', evidence_grade: 'NOT_SUPPORTED_DO_NOT_SURFACE' },
    { modality: 'rTMS', target: 'DMPFC', evidence_grade: 'MODERATE_NO_RCT_OPEN_LABEL_LARGE_SERIES' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].target, 'DMPFC');
});

test('filterGatedSuggestions strips tDCS-O1/O2 and tACS-Pz by mapping fingerprint', function () {
  // Belt-and-suspenders: even if a future regression forgets to set
  // enabled/evidence_grade, the hardcoded mapping fingerprints catch them.
  const out = filterGatedSuggestions([
    { modality: 'tDCS', target: 'O1/O2' },
    { modality: 'tACS', target: 'Pz' },
    { pattern: 'lateraloccipital_bilateral_deficit' },
    { pattern: 'precuneus_bilateral_excess' },
    { modality: 'rTMS', target: 'left DLPFC' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].target, 'left DLPFC');
});

test('filterGatedSuggestions tolerates malformed input', function () {
  assert.deepEqual(filterGatedSuggestions(null), []);
  assert.deepEqual(filterGatedSuggestions(undefined), []);
  assert.deepEqual(filterGatedSuggestions('not an array'), []);
  assert.deepEqual(filterGatedSuggestions([null, undefined, 'string', 42]), []);
});

test('filterGatedSuggestions preserves order of valid entries', function () {
  const valid = [
    { id: 'a', modality: 'rTMS', target: 'left DLPFC' },
    { id: 'b', modality: 'rTMS', target: 'right DLPFC' },
    { id: 'c', modality: 'rTMS', target: 'DMPFC' },
  ];
  const out = filterGatedSuggestions(valid);
  assert.deepEqual(out.map(function (s) { return s.id; }), ['a', 'b', 'c']);
});
