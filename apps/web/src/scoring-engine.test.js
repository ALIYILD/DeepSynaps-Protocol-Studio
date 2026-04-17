/**
 * Unit tests: centralized scoring engine (Node built-in test runner).
 *
 * Covers PHQ-9 scoring + safety, GAD-7, DASS-21 subscales with multiplier,
 * PCL-5 cluster subscales, C-SSRS safety escalation, trend classification,
 * and licensing metadata.
 *
 * Run as part of `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCORING_RULES,
  computeRawScore,
  interpretScore,
  interpretSubscale,
  scoreAssessment,
  highestSafety,
  classifyTrend,
  normalizeScaleId,
  getScoringRule,
} from './scoring-engine.js';

// ── normalizeScaleId ────────────────────────────────────────────────────────

test('normalizeScaleId canonicalizes common aliases', () => {
  assert.equal(normalizeScaleId('phq9'), 'PHQ-9');
  assert.equal(normalizeScaleId('PHQ-9'), 'PHQ-9');
  assert.equal(normalizeScaleId('gad7'), 'GAD-7');
  assert.equal(normalizeScaleId('PCL5'), 'PCL-5');
  assert.equal(normalizeScaleId('DASS21'), 'DASS-21');
});

test('normalizeScaleId returns empty string for null input', () => {
  assert.equal(normalizeScaleId(null), '');
  assert.equal(normalizeScaleId(undefined), '');
});

// ── PHQ-9 ───────────────────────────────────────────────────────────────────

test('PHQ-9 sums a complete assessment correctly', () => {
  const values = [1, 2, 1, 0, 2, 1, 0, 1, 0]; // 8
  const result = computeRawScore('PHQ-9', values);
  assert.equal(result.complete, true);
  assert.equal(result.raw, 8);
  assert.deepEqual(result.missingItems, []);
});

test('PHQ-9 interprets score 8 as mild', () => {
  const interp = interpretScore('PHQ-9', 8);
  assert.equal(interp.label, 'Mild');
  assert.equal(interp.severity, 'mild');
});

test('PHQ-9 interprets score 15 as moderately severe', () => {
  const interp = interpretScore('PHQ-9', 15);
  assert.equal(interp.label, 'Moderately Severe');
  assert.equal(interp.severity, 'severe');
});

test('PHQ-9 flags item 9 ≥ 1 (suicidal ideation)', () => {
  const values = [0, 0, 0, 0, 0, 0, 0, 0, 1];
  const result = scoreAssessment('PHQ-9', values);
  assert.equal(result.safety.length, 1);
  assert.equal(result.safety[0].severity, 'warn');
  assert.match(result.safety[0].message, /self-harm/i);
});

test('PHQ-9 escalates item 9 to critical when ≥ 2', () => {
  const values = [1, 1, 1, 1, 1, 1, 1, 1, 3];
  const result = scoreAssessment('PHQ-9', values);
  assert.equal(result.safety[0].severity, 'critical');
});

test('PHQ-9 marks incomplete when an item is missing', () => {
  const values = [1, 1, null, 1, 1, 1, 1, 1, 1];
  const result = computeRawScore('PHQ-9', values);
  assert.equal(result.complete, false);
  assert.ok(result.missingItems.includes(3));
  assert.equal(result.raw, null);
});

test('PHQ-9 clamps out-of-range values to [0,3]', () => {
  const values = [5, -1, 1, 1, 1, 1, 1, 1, 1];
  const result = computeRawScore('PHQ-9', values);
  assert.ok(result.warnings.length >= 1);
  // 5→3, -1→0, rest seven 1s
  assert.equal(result.raw, 3 + 0 + 1 + 1 + 1 + 1 + 1 + 1 + 1);
});

// ── GAD-7 ───────────────────────────────────────────────────────────────────

test('GAD-7 totals seven ones = 7 (mild)', () => {
  const result = scoreAssessment('GAD-7', [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(result.raw, 7);
  assert.equal(result.interpretation.severity, 'mild');
});

test('GAD-7 totals 21 = severe', () => {
  const result = scoreAssessment('GAD-7', [3, 3, 3, 3, 3, 3, 3]);
  assert.equal(result.raw, 21);
  assert.equal(result.interpretation.severity, 'severe');
});

// ── DASS-21 subscales ───────────────────────────────────────────────────────

test('DASS-21 computes three subscale sums with x2 multiplier', () => {
  const v = new Array(21).fill(0);
  [3, 5, 10, 13, 16, 17, 21].forEach((i) => { v[i - 1] = 1; });
  [2, 4, 7, 9, 15, 19, 20].forEach((i) => { v[i - 1] = 2; });
  [1, 6, 8, 11, 12, 14, 18].forEach((i) => { v[i - 1] = 1; });
  const result = scoreAssessment('DASS-21', v);
  assert.equal(result.subscales.depression, 14);   // 7 × 1 × 2
  assert.equal(result.subscales.anxiety, 28);      // 7 × 2 × 2
  assert.equal(result.subscales.stress, 14);       // 7 × 1 × 2
  assert.equal(interpretSubscale('DASS-21', 'depression', 14).label, 'Moderate');
  assert.equal(interpretSubscale('DASS-21', 'anxiety', 28).severity, 'critical');
  assert.equal(interpretSubscale('DASS-21', 'stress', 14).label, 'Normal');
});

// ── PCL-5 cluster subscales ─────────────────────────────────────────────────

test('PCL-5 computes four cluster subscales and total', () => {
  const values = new Array(20).fill(2);
  const result = scoreAssessment('PCL-5', values);
  assert.equal(result.raw, 40);
  assert.equal(result.subscales.intrusion, 10);         // 5 × 2
  assert.equal(result.subscales.avoidance, 4);          // 2 × 2
  assert.equal(result.subscales.cognitions_mood, 14);   // 7 × 2
  assert.equal(result.subscales.arousal, 12);           // 6 × 2
  assert.equal(result.interpretation.severity, 'severe');
});

// ── C-SSRS safety ───────────────────────────────────────────────────────────

test('C-SSRS score 0 → no ideation, no safety flag', () => {
  const r = scoreAssessment('C-SSRS', [0]);
  assert.equal(r.interpretation.label, 'No Ideation');
  assert.equal(r.safety.length, 0);
});

test('C-SSRS score 3 → active ideation (warn)', () => {
  const r = scoreAssessment('C-SSRS', [3]);
  assert.equal(r.safety[0].severity, 'warn');
  assert.equal(r.interpretation.severity, 'severe');
});

test('C-SSRS score 5 → behavior (critical)', () => {
  const r = scoreAssessment('C-SSRS', [5]);
  assert.equal(r.safety[0].severity, 'critical');
  assert.equal(r.interpretation.severity, 'critical');
});

// ── Licensing metadata ──────────────────────────────────────────────────────

test('SCORING_RULES marks PHQ-9 as public_domain', () => {
  assert.equal(SCORING_RULES['PHQ-9'].licensing, 'public_domain');
});

test('SCORING_RULES marks ISI as licensed', () => {
  assert.equal(SCORING_RULES['ISI'].licensing, 'licensed');
});

test('SCORING_RULES marks C-SSRS as restricted', () => {
  assert.equal(SCORING_RULES['C-SSRS'].licensing, 'restricted');
});

// ── classifyTrend ───────────────────────────────────────────────────────────

test('classifyTrend: ≥ 50% reduction from baseline is remission', () => {
  assert.equal(classifyTrend('PHQ-9', [20, 8]), 'remission');
});

test('classifyTrend: 20–50% reduction is improving', () => {
  assert.equal(classifyTrend('PHQ-9', [20, 15]), 'improving');
});

test('classifyTrend: worsening when score grows', () => {
  assert.equal(classifyTrend('PHQ-9', [10, 18]), 'worsening');
});

test('classifyTrend: single point is insufficient_data', () => {
  assert.equal(classifyTrend('PHQ-9', [10]), 'insufficient_data');
});

// ── highestSafety ───────────────────────────────────────────────────────────

test('highestSafety returns the most severe flag', () => {
  const r = {
    safety: [
      { severity: 'warn', message: 'a' },
      { severity: 'critical', message: 'b' },
      { severity: 'info', message: 'c' },
    ],
  };
  assert.equal(highestSafety(r).severity, 'critical');
  assert.equal(highestSafety(r).message, 'b');
});

test('highestSafety returns null when there are no flags', () => {
  assert.equal(highestSafety({ safety: [] }), null);
});

// ── Unknown scale ───────────────────────────────────────────────────────────

test('computeRawScore on unknown scale returns null raw and a warning', () => {
  const r = computeRawScore('NOT-A-REAL-SCALE', [1, 2, 3]);
  assert.equal(r.raw, null);
  assert.ok(r.warnings.length > 0);
});

test('getScoringRule returns null for an unknown scale', () => {
  assert.equal(getScoringRule('FAKE'), null);
});
