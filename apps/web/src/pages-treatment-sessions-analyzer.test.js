/**
 * Logic-only tests for Treatment Sessions Analyzer safety copy and outcome parsing.
 * Run: node --test src/pages-treatment-sessions-analyzer.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _parseOutcomeSummaries, _summarizeOutcomeScores, _completionPct } from './pages-treatment-sessions-analyzer.js';

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
