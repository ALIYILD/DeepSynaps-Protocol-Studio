/**
 * Batch sign-status merge logic for clinic table (no per-session N+1).
 * Run: node --test src/pages-treatment-sessions-analyzer-batch.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _mergeBatchSignIntoRows, _mergeBatchUnavailable } from './pages-treatment-sessions-analyzer.js';

test('_mergeBatchSignIntoRows counts signed vs pending from batch items', () => {
  const rows = [
    {
      course_id: 'c1',
      patient_id: 'p1',
      signed_count: null,
      unsigned_count: null,
      signoff_unknown: true,
      completed: 2,
    },
  ];
  const batch = {
    items: [
      { course_id: 'c1', session_id: 's1', sign_status: 'signed' },
      { course_id: 'c1', session_id: 's2', sign_status: 'pending' },
    ],
  };
  const out = _mergeBatchSignIntoRows(rows, batch);
  assert.equal(out[0].signed_count, 1);
  assert.equal(out[0].unsigned_count, 1);
  assert.equal(out[0].signoff_unknown, false);
  assert.equal(out[0].sign_batch_partial, false);
});

test('_mergeBatchUnavailable marks unknown without inferring reviewed', () => {
  const rows = [{ course_id: 'c1', signed_count: 1, unsigned_count: 0, signoff_unknown: false }];
  const out = _mergeBatchUnavailable(rows);
  assert.equal(out[0].sign_batch_unavailable, true);
  assert.equal(out[0].signoff_unknown, true);
});
