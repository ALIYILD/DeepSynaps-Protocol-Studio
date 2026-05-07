/**
 * Logic-only tests for Treatment Sessions Analyzer safety copy and outcome parsing.
 * Run: node --test src/pages-treatment-sessions-analyzer.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canUseTreatmentSessionsAnalyzerWorkspace,
  _parseOutcomeSummaries,
  _summarizeOutcomeScores,
  _completionPct,
  _renderSignoffQueue,
  _renderAuditTeaser,
} from './pages-treatment-sessions-analyzer.js';

test('canUseTreatmentSessionsAnalyzerWorkspace allows clinician-like roles only', () => {
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace('clinician'), true);
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace(' clinic-admin '), true);
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace('TECHNICIAN'), true);
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace('resident'), true);
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace('reviewer'), true);
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace('patient'), false);
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace('guest'), false);
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace(''), false);
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace(null), false);
});

test('canUseTreatmentSessionsAnalyzerWorkspace can preserve demo previews with missing role only when opted in', () => {
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace('', { allowUnknown: true }), true);
  assert.equal(canUseTreatmentSessionsAnalyzerWorkspace('patient', { allowUnknown: true }), false);
});

test('_parseOutcomeSummaries reads first scale and pickSeries', () => {
  const resp = {
    course_id: 'c1',
    summaries: [
      {
        template_id: 'PHQ-9',
        template_title: 'PHQ-9',
        measurements: [
          { score_numeric: 18, administered_at: '2026-01-01T00:00:00Z' },
          { score_numeric: 14, administered_at: '2026-02-01T00:00:00Z' },
        ],
      },
    ],
    responder: true,
  };
  const o = _parseOutcomeSummaries(resp);
  assert.deepEqual(o.scores, [18, 14]);
  assert.equal(o.scale, 'PHQ-9');
  assert.ok(o.ruleNote.includes('Requires clinician'));
  const g = o.pickSeries('PHQ-9');
  assert.deepEqual(g.scores, [18, 14]);
});

test('_parseOutcomeSummaries pickSeries switches between instruments', () => {
  const resp = {
    summaries: [
      {
        template_id: 'PHQ-9',
        template_title: 'PHQ-9',
        measurements: [{ score_numeric: 10 }, { score_numeric: 9 }],
      },
      {
        template_id: 'GAD-7',
        template_title: 'GAD-7',
        measurements: [{ score_numeric: 12 }, { score_numeric: 8 }],
      },
    ],
  };
  const o = _parseOutcomeSummaries(resp);
  assert.equal(o.all_series.length, 2);
  assert.deepEqual(o.pickSeries('GAD-7').scores, [12, 8]);
  assert.deepEqual(o.pickSeries('PHQ-9').scores, [10, 9]);
});

test('_parseOutcomeSummaries handles empty summaries', () => {
  const o = _parseOutcomeSummaries({ summaries: [] });
  assert.deepEqual(o.scores, []);
  assert.equal(o.summariesCount, 0);
});

test('_summarizeOutcomeScores is neutral directional labels only', () => {
  assert.equal(_summarizeOutcomeScores([10, 8]), 'down');
  assert.equal(_summarizeOutcomeScores([8, 10]), 'up');
  assert.equal(_summarizeOutcomeScores([10, 10]), 'flat');
});

test('_completionPct respects planned sessions', () => {
  assert.equal(_completionPct({ planned_sessions_total: 10 }, { sessions_delivered: 5 }), 50);
  assert.equal(_completionPct({ planned_sessions_total: 0 }, {}), null);
});

test('_renderSignoffQueue hides bulk sign-off action when role policy disallows it', () => {
  const unsigned = [{ session_number: 2, scheduled_at: '2026-02-01T09:30:00Z', modality: 'TMS' }];
  const denied = _renderSignoffQueue(unsigned, { canSignAll: false });
  assert.ok(denied.includes('authorised clinical staff role'));
  assert.ok(!denied.includes('data-action="sign-all"'));

  const allowed = _renderSignoffQueue(unsigned, { canSignAll: true });
  assert.ok(allowed.includes('data-action="sign-all"'));
});

test('_renderAuditTeaser distinguishes empty audit history from endpoint failure', () => {
  const empty = _renderAuditTeaser([], false, false);
  const unavailable = _renderAuditTeaser([], false, true);

  assert.match(empty, /No audit events were returned for this course/i);
  assert.doesNotMatch(empty, /could not be loaded from the backend/i);

  assert.match(unavailable, /could not be loaded from the backend right now/i);
  assert.doesNotMatch(unavailable, /No audit events were returned for this course/i);
});
