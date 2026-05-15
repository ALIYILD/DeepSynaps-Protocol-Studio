/**
 * Batch sign-status merge logic for clinic table (no per-session N+1).
 * Run: node --test src/pages-intervention-analyzer-batch.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _mergeBatchSignIntoRows, _mergeBatchUnavailable } from './pages-intervention-analyzer.js';

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

// ---------------------------------------------------------------------------
// Performance path: batch merge must not allocate per-row N+1
// ---------------------------------------------------------------------------

test('_mergeBatchSignIntoRows handles empty batch without throwing', () => {
  const rows = [
    { course_id: 'c1', patient_id: 'p1', signed_count: null, unsigned_count: null, signoff_unknown: true },
  ];
  const out = _mergeBatchSignIntoRows(rows, { items: [] });
  assert.equal(out[0].signoff_unknown, true);
  assert.equal(out[0].sign_batch_unavailable, false);
});

test('_mergeBatchSignIntoRows is pure: does not mutate input rows', () => {
  const rows = [
    { course_id: 'c1', signed_count: null, unsigned_count: null, signoff_unknown: true },
  ];
  const originalSignedCount = rows[0].signed_count;
  const batch = { items: [{ course_id: 'c1', session_id: 's1', sign_status: 'signed' }] };
  _mergeBatchSignIntoRows(rows, batch);
  assert.equal(rows[0].signed_count, originalSignedCount, 'Input row was mutated');
});

test('_mergeBatchSignIntoRows flags partial when batch total < session count', () => {
  const rows = [
    { course_id: 'c1', patient_id: 'p1', signed_count: null, unsigned_count: null, signoff_unknown: true, completed: 5 },
  ];
  const batch = {
    items: [
      { course_id: 'c1', session_id: 's1', sign_status: 'signed' },
      { course_id: 'c1', session_id: 's2', sign_status: 'pending' },
    ],
  };
  const out = _mergeBatchSignIntoRows(rows, batch);
  assert.equal(out[0].sign_batch_partial, true);
});

test('_mergeBatchSignIntoRows aggregates multiple courses', () => {
  const rows = [
    { course_id: 'c1', patient_id: 'p1', signed_count: null, unsigned_count: null, signoff_unknown: true, completed: 2 },
    { course_id: 'c2', patient_id: 'p2', signed_count: null, unsigned_count: null, signoff_unknown: true, completed: 2 },
  ];
  const batch = {
    items: [
      { course_id: 'c1', session_id: 's1', sign_status: 'signed' },
      { course_id: 'c2', session_id: 's3', sign_status: 'signed' },
      { course_id: 'c2', session_id: 's4', sign_status: 'pending' },
    ],
  };
  const out = _mergeBatchSignIntoRows(rows, batch);
  assert.equal(out[0].signed_count, 1);
  assert.equal(out[0].unsigned_count, 0);
  assert.equal(out[1].signed_count, 1);
  assert.equal(out[1].unsigned_count, 1);
});

test('_mergeBatchUnavailable resets all sign state flags consistently', () => {
  const rows = [
    { course_id: 'c1', signed_count: 3, unsigned_count: 1, signoff_unknown: false, sign_batch_partial: true },
  ];
  const out = _mergeBatchUnavailable(rows);
  assert.equal(out[0].signoff_unknown, true);
  assert.equal(out[0].sign_batch_unavailable, true);
  assert.equal(out[0].sign_batch_partial, false);
});
