/**
 * Pure-logic tests for the Patient Dashboard helper functions.
 *
 * These mirror the helpers exported by pages-patient.js so the rendering
 * code stays thin — none of these tests touch the DOM, so they run under
 * plain `node --test`.
 *
 * Run from apps/web/:
 *   node --test src/patient-dashboard-wiring.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCountdown,
  phaseLabel,
  outcomeGoalMarker,
  groupOutcomesByTemplate,
} from './patient-dashboard-helpers.js';

// ── computeCountdown ─────────────────────────────────────────────────────────

test('computeCountdown: null/undefined next → null', () => {
  assert.equal(computeCountdown(null), null);
  assert.equal(computeCountdown(undefined), null);
});

test('computeCountdown: invalid date → null', () => {
  assert.equal(computeCountdown('not a date'), null);
});

test('computeCountdown: "Today" when <= now', () => {
  const now = Date.parse('2026-04-19T10:00:00Z');
  const r = computeCountdown('2026-04-19T09:00:00Z', now);
  assert.equal(r.label, 'Today');
  assert.equal(r.days, 0);
});

test('computeCountdown: "Tomorrow" for ~1 day out', () => {
  const now = Date.parse('2026-04-19T10:00:00Z');
  const r = computeCountdown('2026-04-20T10:00:00Z', now);
  assert.equal(r.days, 1);
  assert.equal(r.label, 'Tomorrow');
});

test('computeCountdown: "In N days" for >1 day', () => {
  const now = Date.parse('2026-04-19T10:00:00Z');
  const r = computeCountdown('2026-04-25T10:00:00Z', now);
  assert.equal(r.days, 6);
  assert.equal(r.label, 'In 6 days');
});

// ── phaseLabel ───────────────────────────────────────────────────────────────

test('phaseLabel: null/0 → "Getting started"', () => {
  assert.equal(phaseLabel(null), 'Getting started');
  assert.equal(phaseLabel(0),    'Getting started');
});
test('phaseLabel: thresholds (1/20/50/80/99/100)', () => {
  assert.equal(phaseLabel(1),   'Early treatment');
  assert.equal(phaseLabel(20),  'Early treatment');
  assert.equal(phaseLabel(21),  'Active treatment');
  assert.equal(phaseLabel(50),  'Active treatment');
  assert.equal(phaseLabel(51),  'Consolidation');
  assert.equal(phaseLabel(80),  'Consolidation');
  assert.equal(phaseLabel(99),  'Final phase');
  assert.equal(phaseLabel(100), 'Complete');
});

// ── outcomeGoalMarker ────────────────────────────────────────────────────────

test('outcomeGoalMarker: PHQ-9 uses goal ≤5, down-scale', () => {
  const gm = outcomeGoalMarker({ template_name: 'PHQ-9', score_numeric: 9 });
  assert.equal(gm.goal, 5);
  assert.equal(gm.down, true);
  // fill = (27-9)/27 → 67%
  assert.equal(gm.fillPct, 67);
  // marker = (27-5)/27 → 81%
  assert.equal(gm.markerPct, 81);
});

test('outcomeGoalMarker: GAD-7 uses goal ≤4', () => {
  const gm = outcomeGoalMarker({ template_name: 'GAD-7', score_numeric: 7 });
  assert.equal(gm.goal, 4);
  assert.equal(gm.down, true);
  assert.equal(gm.maxRange, 21);
});

test('outcomeGoalMarker: PSQI uses goal ≤5', () => {
  const gm = outcomeGoalMarker({ template_name: 'Sleep PSQI', score_numeric: 8 });
  assert.equal(gm.goal, 5);
  assert.equal(gm.down, true);
});

test('outcomeGoalMarker: unknown scale derives goal from baseline (≈half)', () => {
  const gm = outcomeGoalMarker(
    { template_name: 'Homework', score_numeric: 60 },
    { template_name: 'Homework', score_numeric: 80 },
  );
  assert.equal(gm.goal, 40); // round(80 * 0.5)
});

test('outcomeGoalMarker: clamps fill to 0..100', () => {
  const gm = outcomeGoalMarker({ template_name: 'PHQ-9', score_numeric: 999 });
  assert.equal(gm.fillPct >= 0 && gm.fillPct <= 100, true);
});

// ── groupOutcomesByTemplate ──────────────────────────────────────────────────

test('groupOutcomesByTemplate: empty or non-array → []', () => {
  assert.deepEqual(groupOutcomesByTemplate(null), []);
  assert.deepEqual(groupOutcomesByTemplate([]),   []);
});

test('groupOutcomesByTemplate: groups and sorts by most-recent latest', () => {
  const outcomes = [
    { template_name: 'PHQ-9', score_numeric: 15, administered_at: '2026-03-01T10:00:00Z' },
    { template_name: 'PHQ-9', score_numeric: 12, administered_at: '2026-03-15T10:00:00Z' },
    { template_name: 'PHQ-9', score_numeric:  9, administered_at: '2026-04-10T10:00:00Z' },
    { template_name: 'GAD-7', score_numeric:  8, administered_at: '2026-04-12T10:00:00Z' },
    { template_name: 'GAD-7', score_numeric:  7, administered_at: '2026-04-18T10:00:00Z' },
    { template_name: 'PSQI',  score_numeric:  9, administered_at: '2026-04-01T10:00:00Z' },
  ];
  const groups = groupOutcomesByTemplate(outcomes, 4);
  assert.equal(groups.length, 3);
  // Most-recent-latest first: GAD-7 (4/18), PHQ-9 (4/10), PSQI (4/01)
  assert.equal(groups[0].template_name, 'GAD-7');
  assert.equal(groups[0].latest.score_numeric,   7);
  assert.equal(groups[0].baseline.score_numeric, 8);
  assert.equal(groups[1].template_name, 'PHQ-9');
  assert.equal(groups[1].latest.score_numeric,   9);
  assert.equal(groups[1].baseline.score_numeric, 15);
});

test('groupOutcomesByTemplate: respects limit', () => {
  const outcomes = [
    { template_name: 'A', score_numeric: 1, administered_at: '2026-04-01' },
    { template_name: 'B', score_numeric: 1, administered_at: '2026-04-02' },
    { template_name: 'C', score_numeric: 1, administered_at: '2026-04-03' },
    { template_name: 'D', score_numeric: 1, administered_at: '2026-04-04' },
    { template_name: 'E', score_numeric: 1, administered_at: '2026-04-05' },
  ];
  const groups = groupOutcomesByTemplate(outcomes, 2);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].template_name, 'E');
  assert.equal(groups[1].template_name, 'D');
});

test('groupOutcomesByTemplate: drops entries with no template_name', () => {
  const outcomes = [
    { template_name: '', score_numeric: 1, administered_at: '2026-04-01' },
    { template_name: 'X', score_numeric: 2, administered_at: '2026-04-02' },
  ];
  const groups = groupOutcomesByTemplate(outcomes);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].template_name, 'X');
});
