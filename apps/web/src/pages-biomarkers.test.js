/**
 * Unit tests for Biomarkers workspace helpers (pure logic).
 * Run: node --test src/pages-biomarkers.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenLabResults, isStale } from './pages-biomarkers.js';

test('flattenLabResults maps panels to rows with ref range', () => {
  const rows = flattenLabResults({
    captured_at: '2026-01-10T12:00:00Z',
    panels: [
      {
        name: 'CMP',
        results: [
          { analyte: 'Na', value: 140, unit: 'mmol/L', ref_low: 135, ref_high: 145, status: 'normal', captured_at: '2026-01-10T12:00:00Z' },
        ],
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].analyte, 'Na');
  assert.equal(rows[0].ref, '135–145');
  assert.equal(rows[0].panel, 'CMP');
});

test('flattenLabResults empty when no panels', () => {
  assert.deepEqual(flattenLabResults(null), []);
  assert.deepEqual(flattenLabResults({ panels: [] }), []);
});

test('isStale returns true when older than threshold', () => {
  const old = new Date(Date.now() - 120 * 86400000).toISOString();
  const r = isStale(old, 90);
  assert.equal(r.stale, true);
  assert.ok(r.days >= 90);
});

test('isStale false for recent date', () => {
  const recent = new Date(Date.now() - 10 * 86400000).toISOString();
  const r = isStale(recent, 90);
  assert.equal(r.stale, false);
});

test('isStale true when iso missing', () => {
  const r = isStale('', 90);
  assert.equal(r.stale, true);
  assert.equal(r.reason, 'no date');
});
