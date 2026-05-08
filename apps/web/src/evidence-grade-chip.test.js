import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEvidenceGradeMeta,
  renderEvidenceGradeChip,
  renderEvidenceGradeLegend,
} from './evidence-grade-chip.js';

test('getEvidenceGradeMeta returns the canonical chip for STRONG_FDA_CLEARED', function () {
  const m = getEvidenceGradeMeta('STRONG_FDA_CLEARED');
  assert.equal(m.label, 'EV-A');
  assert.match(m.fullLabel, /FDA cleared/);
  assert.ok(m.tooltip.length > 10);
});

test('getEvidenceGradeMeta defaults unknown grade to research-heuristic (never null)', function () {
  const m = getEvidenceGradeMeta('SOMETHING_NEW');
  assert.equal(m.label, 'Research');
  assert.match(m.fullLabel, /unknown grade/i);
});

test('getEvidenceGradeMeta tolerates non-string input', function () {
  assert.equal(getEvidenceGradeMeta(null).label, 'Research');
  assert.equal(getEvidenceGradeMeta(undefined).label, 'Research');
  assert.equal(getEvidenceGradeMeta(42).label, 'Research');
});

test('renderEvidenceGradeChip emits canonical chip HTML', function () {
  const html = renderEvidenceGradeChip('STRONG_FDA_CLEARED');
  assert.match(html, /class="ds-evidence-chip"/);
  assert.match(html, /EV-A/);
  assert.match(html, /title="FDA-cleared/);
});

test('renderEvidenceGradeChip full=true uses long label', function () {
  const html = renderEvidenceGradeChip('STRONG_FDA_CLEARED', { full: true });
  assert.match(html, /FDA cleared/);
});

test('NOT_SUPPORTED_DO_NOT_SURFACE renders a hard-warn chip', function () {
  const html = renderEvidenceGradeChip('NOT_SUPPORTED_DO_NOT_SURFACE');
  assert.match(html, /NOT SUPPORTED/);
  // Hard-warn copy lives in the tooltip; full label is shown when full=true.
  const fullHtml = renderEvidenceGradeChip('NOT_SUPPORTED_DO_NOT_SURFACE', { full: true });
  assert.match(fullHtml, /do not use clinically/i);
});

test('renderEvidenceGradeLegend emits one chip per unique grade in the list', function () {
  const html = renderEvidenceGradeLegend([
    { evidence_grade: 'STRONG_FDA_CLEARED' },
    { evidence_grade: 'STRONG_FDA_CLEARED' },
    { evidence_grade: 'WEAK_OFF_LABEL_FOR_ANXIETY' },
    { evidence_grade: 'MODERATE_NO_RCT_OPEN_LABEL_LARGE_SERIES' },
    { evidence_grade: null },
    null,
  ]);
  // 3 unique grades → 3 chips, deduplicated. Counting only the chip class
  // not the row wrapper.
  const matches = html.match(/class="ds-evidence-chip"/g) || [];
  assert.equal(matches.length, 3);
});

test('renderEvidenceGradeLegend returns empty string for empty / malformed input', function () {
  assert.equal(renderEvidenceGradeLegend([]), '');
  assert.equal(renderEvidenceGradeLegend(null), '');
  assert.equal(renderEvidenceGradeLegend('nope'), '');
  assert.equal(renderEvidenceGradeLegend([{}]), '');
});

test('renderEvidenceGradeChip escapes potentially-injected payload', function () {
  // The grade key is fixed-set, but defensive-test the tooltip path anyway —
  // we don't want a future contributor to extend the meta dict with raw HTML
  // and get an XSS sink.
  const m = getEvidenceGradeMeta('FDA_CLEARED_AID_CONTESTED');
  // Embedded tooltip should not contain raw <script>
  assert.equal(/<script/i.test(m.tooltip), false);
});
