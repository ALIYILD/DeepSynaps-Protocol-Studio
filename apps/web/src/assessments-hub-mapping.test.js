/**
 * Unit tests for assessments-hub-mapping.js (Assessments v2 queue mapping).
 * Run: node --test src/assessments-hub-mapping.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessmentDetailIdFromRow,
  assessmentsSampleQueueAllowed,
  DEMO_ASSESSMENTS_BANNER_MARK,
  mapApiAssessmentToQueueRow,
} from './assessments-hub-mapping.js';

const REG = [{ id: 'PHQ-9', abbr: 'PHQ-9', max: 27 }];

test('mapApiAssessmentToQueueRow: uses template_id, PHQ item9 red flag, reviewed_at', () => {
  const row = mapApiAssessmentToQueueRow(
    {
      id: 'a1',
      patient_id: 'p1',
      template_id: 'PHQ-9',
      scale_id: 'PHQ-9',
      status: 'completed',
      score: '12',
      score_numeric: 12,
      severity_label: 'Moderate',
      data: { items: [1, 1, 1, 1, 1, 1, 1, 1, 2] },
      reviewed_at: '2026-01-01T00:00:00Z',
      due_date: '2030-01-01',
    },
    0,
    null,
    REG,
  );
  assert.equal(row.backendId, 'a1');
  assert.equal(row.patientId, 'p1');
  assert.equal(row.item9, 2);
  assert.equal(row.redflag, true);
  assert.equal(row.reviewed, true);
  assert.equal(row.sendLabel, 'Open');
});

test('mapApiAssessmentToQueueRow: draft status → Continue', () => {
  const row = mapApiAssessmentToQueueRow(
    {
      id: 'd1',
      patient_id: 'p2',
      template_id: 'GAD-7',
      scale_id: 'GAD-7',
      status: 'draft',
      score_numeric: null,
      data: {},
    },
    1,
    null,
    [{ id: 'GAD-7', max: 21 }],
  );
  assert.equal(row.sendLabel, 'Continue');
  assert.equal(row.redflag, false);
});

test('assessmentDetailIdFromRow: strips be- prefix', () => {
  assert.equal(assessmentDetailIdFromRow({ id: 'be-uuid-1', backendId: 'uuid-1' }), 'uuid-1');
  assert.equal(assessmentDetailIdFromRow({ id: 'as-3' }), 'as-3');
});

test('assessmentsSampleQueueAllowed: VITE demo build without token allows sample queue (dev/preview UI)', () => {
  const r = assessmentsSampleQueueAllowed({ DEV: true, VITE_ENABLE_DEMO: '0' }, null);
  assert.equal(r.allowed, true);
  assert.equal(r.mode, 'vite_demo_build');
});

test('assessmentsSampleQueueAllowed: demo token always allows (with or without build flag)', () => {
  const r = assessmentsSampleQueueAllowed({ DEV: false, VITE_ENABLE_DEMO: '0' }, 'abc-demo-token');
  assert.equal(r.allowed, true);
  assert.equal(r.mode, 'demo_token');
});

test('assessmentsSampleQueueAllowed: production build + real JWT disallows mock queue', () => {
  const r = assessmentsSampleQueueAllowed(
    { DEV: false, VITE_ENABLE_DEMO: '0' },
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIn0.sig',
  );
  assert.equal(r.allowed, false);
  assert.equal(r.mode, null);
});

test('DEMO_ASSESSMENTS_BANNER_MARK: fixed copy for UI labelling', () => {
  assert.equal(
    DEMO_ASSESSMENTS_BANNER_MARK,
    'Demo assessment data — not real patient data',
  );
});
