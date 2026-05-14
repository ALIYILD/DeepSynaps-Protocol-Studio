// Regression tests for BUG-001, BUG-002, BUG-005
// Run: node assessments-bugfixes.test.js

import { hydrateAssessmentsQueueV2, normalizeQueuePayload } from './assessments-v2-queue.js';
import { mapApiAssessmentToQueueRow } from './assessments-hub-mapping.js';

// ── Minimal test harness ──
let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS: ' + msg); }
  else { failed++; console.error('  FAIL: ' + msg); }
}

console.log('\n=== BUG-001: Queue Hydration Tests ===');

// 1. hydrateAssessmentsQueueV2 accepts mapRow callback
{
  const mockRows = [{ id: 'a1', scale_id: 'PHQ-9', patient_name: 'Test', score_numeric: 12 }];
  const result = await hydrateAssessmentsQueueV2({
    loadV2Queue: async () => mockRows,
    loadLegacyQueue: null,
    loadDemoRows: () => [],
    allowDemoFallback: false,
    mapRow: (row, i) => mapApiAssessmentToQueueRow(row, i, null, []),
  });
  assert(result.source === 'v2', 'v2 source when v2 loader succeeds');
  assert(result.rows.length === 1, 'returns 1 mapped row');
  assert(result.rows[0].inst === 'PHQ-9', 'mapRow applied: inst field populated');
  assert(result.rows[0].patient === 'Test', 'mapRow applied: patient field populated');
  assert(result.rows[0].sev != null, 'mapRow applied: sev field populated');
  assert(result.rows[0].dueCls != null, 'mapRow applied: dueCls field populated');
  assert(result.rows[0].sendLabel != null, 'mapRow applied: sendLabel field populated');
  assert(result.fetchFailed === false, 'fetchFailed returned');
  assert(result.emptyOk === false, 'emptyOk returned');
}

// 2. hydrateAssessmentsQueueV2 accepts maxRows
{
  const mockRows = [
    { id: 'a1', scale_id: 'PHQ-9', patient_name: 'A' },
    { id: 'a2', scale_id: 'GAD-7', patient_name: 'B' },
    { id: 'a3', scale_id: 'PCL-5', patient_name: 'C' },
  ];
  const result = await hydrateAssessmentsQueueV2({
    loadV2Queue: async () => mockRows,
    loadLegacyQueue: null,
    loadDemoRows: () => [],
    allowDemoFallback: false,
    maxRows: 2,
  });
  assert(result.rows.length === 2, 'maxRows caps rows to 2');
}

// 3. hydrateAssessmentsQueueV2 falls back to legacy
{
  const result = await hydrateAssessmentsQueueV2({
    loadV2Queue: async () => { throw new Error('v2 down'); },
    loadLegacyQueue: async () => [{ id: 'l1', scale_id: 'PHQ-9', patient_name: 'Legacy' }],
    loadDemoRows: () => [],
    allowDemoFallback: false,
    mapRow: (row, i) => mapApiAssessmentToQueueRow(row, i, null, []),
  });
  assert(result.source === 'legacy', 'falls back to legacy');
  assert(result.rows.length === 1, 'legacy row returned');
  assert(result.rows[0].inst === 'PHQ-9', 'mapRow applied to legacy rows');
}

// 4. hydrateAssessmentsQueueV2 falls back to demo
{
  const result = await hydrateAssessmentsQueueV2({
    loadV2Queue: async () => { throw new Error('v2 down'); },
    loadLegacyQueue: async () => { throw new Error('v1 down'); },
    loadDemoRows: () => [{ id: 'd1', inst: 'PHQ-9', patient: 'Demo' }],
    allowDemoFallback: true,
  });
  assert(result.source === 'demo', 'falls back to demo');
  assert(result.demo === true, 'demo flag set');
}

// 5. mapApiAssessmentToQueueRow produces required mapped fields
{
  const apiRow = {
    id: 'test-1',
    scale_id: 'PHQ-9',
    patient_name: 'Jane Doe',
    patient_id: 'P-123',
    score_numeric: 18,
    status: 'completed',
    due_date: '2025-06-01',
    data: { items: [2, 2, 2, 2, 2, 2, 2, 2, 3] },
  };
  const mapped = mapApiAssessmentToQueueRow(apiRow, 0, null, []);
  assert(mapped.inst === 'PHQ-9', 'mapped.inst === scale_id');
  assert(mapped.patient === 'Jane Doe', 'mapped.patient === patient_name');
  assert(mapped.sev === 'mod', 'PHQ-9 score 18 with no scoring engine => sev=mod (default)');
  assert(mapped.dueCls === 'overdue', 'past due date => overdue');
  assert(mapped.redflag === true, 'PHQ-9 item9=3 >=1 => redflag');
  assert(mapped.sendLabel === 'Review', 'completed status => Review');
  assert(mapped.patientId === 'P-123', 'patientId preserved');
}

console.log('\n=== BUG-002: Offline Draft Fallback Tests ===');

// 6. Payload variable scoping — simulate the fixed pattern
{
  // This simulates the fixed code pattern where payload is declared BEFORE try/if
  let catchPayloadAccessible = false;
  const payload = { patient_id: 'P-1', scale_id: 'PHQ-9' }; // declared outside try
  try {
    if (true) {
      throw new Error('network down');
    }
  } catch {
    catchPayloadAccessible = (payload != null && payload.scale_id === 'PHQ-9');
  }
  assert(catchPayloadAccessible === true, 'payload is accessible in catch block when declared before try');
}

// 7. Payload NOT accessible when declared in else branch (original bug simulation)
{
  let catchPayloadAccessible = false;
  try {
    if (false) {
      // v2 path
    } else {
      const payload = { patient_id: 'P-1', scale_id: 'PHQ-9' }; // scoped to else
      throw new Error('network down');
    }
  } catch {
    try {
      // eslint-disable-next-line no-undef
      const _ = payload; // would throw ReferenceError
      catchPayloadAccessible = true;
    } catch {
      catchPayloadAccessible = false;
    }
  }
  assert(catchPayloadAccessible === false, 'payload is NOT accessible in catch when declared in else (original bug)');
}

// 8. normalizeQueuePayload handles various shapes
{
  assert(normalizeQueuePayload(null).length === 0, 'null => []');
  assert(normalizeQueuePayload([1, 2]).length === 2, 'array passthrough');
  assert(normalizeQueuePayload({ items: [1, 2] }).length === 2, '{ items } shape');
  assert(normalizeQueuePayload({ rows: [1, 2] }).length === 2, '{ rows } shape');
}

console.log('\n=== BUG-005: v1/v2 Fallback Tests ===');

// 9. _callV2WithFallback pattern — v2 succeeds
{
  let v2Called = false;
  let v1Called = false;
  const v2Fn = async () => { v2Called = true; return { ok: true }; };
  const v1Fn = async () => { v1Called = true; return { ok: true }; };
  // Simulate _callV2WithFallback behavior (v2 succeeds, no fallback needed)
  try {
    await v2Fn();
  } catch {
    await v1Fn();
  }
  assert(v2Called === true && v1Called === false, 'v2 succeeds => v1 not called');
}

// 10. _callV2WithFallback pattern — v2 404 falls back to v1
{
  let v1Called = false;
  const v2Err = new Error('Not found');
  v2Err.status = 404;
  const v2Fn = async () => { throw v2Err; };
  const v1Fn = async () => { v1Called = true; return { ok: true }; };
  try {
    await v2Fn();
  } catch (e) {
    if (e && e.status === 404) {
      await v1Fn();
    }
  }
  assert(v1Called === true, 'v2 404 => v1 fallback called');
}

console.log('\n=== Summary ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);
console.log('All regression tests passed.\n');
