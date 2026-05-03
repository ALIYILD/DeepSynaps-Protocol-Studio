/**
 * Logic-only tests for Treatment Sessions Analyzer safety copy and outcome parsing.
 * Run: node --test src/pages-treatment-sessions-analyzer.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _parsePrimaryOutcome, _summarizeOutcomeScores, _completionPct } from './pages-treatment-sessions-analyzer.js';

test('_parsePrimaryOutcome reads summaries[].measurements', () => {
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
  const o = _parsePrimaryOutcome(resp);
  assert.deepEqual(o.scores, [18, 14]);
  assert.equal(o.scale, 'PHQ-9');
  assert.ok(o.ruleNote.includes('Requires clinician'));
});

test('_parsePrimaryOutcome handles empty summaries', () => {
  const o = _parsePrimaryOutcome({ summaries: [] });
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
