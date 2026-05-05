/**
 * Behavior-level unit tests for the Assessments v2 queue hydration helper.
 *
 * Run:
 *   node --test src/assessments-v2-queue.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateAssessmentsQueueV2 } from './assessments-v2-queue.js';

test('v2 success with rows returns source=v2 and no demo flag', async () => {
  const res = await hydrateAssessmentsQueueV2({
    loadV2Queue: async () => ({ items: [{ id: 'a1' }] }),
    loadLegacyQueue: async () => { throw new Error('should not be called'); },
    loadDemoRows: async () => [{ id: 'demo-1' }],
    allowDemoFallback: true,
  });
  assert.equal(res.source, 'v2');
  assert.equal(res.demo, false);
  assert.equal(res.rows.length, 1);
  assert.equal(Array.isArray(res.warnings), true);
  assert.equal(Array.isArray(res.errors), true);
});

test('v2 empty falls back to demo when allowed (preserves current product rule)', async () => {
  const res = await hydrateAssessmentsQueueV2({
    loadV2Queue: async () => ({ items: [] }),
    loadLegacyQueue: async () => ({ items: [] }),
    loadDemoRows: async () => [{ id: 'demo-1' }],
    allowDemoFallback: true,
  });
  assert.equal(res.source, 'demo');
  assert.equal(res.demo, true);
  assert.equal(res.rows.length, 1);
  assert.ok(res.warnings.includes('v2_empty'));
  assert.ok(res.warnings.includes('legacy_empty'));
});

test('v2 error falls back to legacy when legacy returns rows', async () => {
  const res = await hydrateAssessmentsQueueV2({
    loadV2Queue: async () => { throw new Error('v2 down'); },
    loadLegacyQueue: async () => ({ items: [{ id: 'l1' }] }),
    loadDemoRows: async () => [{ id: 'demo-1' }],
    allowDemoFallback: true,
  });
  assert.equal(res.source, 'legacy');
  assert.equal(res.demo, false);
  assert.equal(res.rows[0].id, 'l1');
  assert.ok(res.errors.some((e) => e.startsWith('v2_error:')));
});

test('legacy error falls back to demo when allowed', async () => {
  const res = await hydrateAssessmentsQueueV2({
    loadV2Queue: async () => ({ items: [] }),
    loadLegacyQueue: async () => { throw new Error('legacy down'); },
    loadDemoRows: async () => [{ id: 'demo-1' }],
    allowDemoFallback: true,
  });
  assert.equal(res.source, 'demo');
  assert.equal(res.demo, true);
  assert.ok(res.errors.some((e) => e.startsWith('legacy_error:')));
});

test('when demo fallback is disallowed, returns empty with errors/warnings', async () => {
  const res = await hydrateAssessmentsQueueV2({
    loadV2Queue: async () => ({ items: [] }),
    loadLegacyQueue: async () => ({ items: [] }),
    loadDemoRows: async () => [{ id: 'demo-1' }],
    allowDemoFallback: false,
  });
  // When demo fallback is disallowed, we return empty rows and warn.
  assert.equal(res.rows.length, 0);
  assert.equal(res.demo, false);
  assert.ok(res.warnings.includes('no_demo_fallback'));
});

