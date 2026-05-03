/**
 * Unit tests for clinical-dashboard-helpers.js
 *
 * Run from apps/web/: node --test src/clinical-dashboard-helpers.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRiskTrafficPatientName } from './clinical-dashboard-helpers.js';

test('resolveRiskTrafficPatientName prefers patient_name from API', () => {
  assert.equal(
    resolveRiskTrafficPatientName({ patient_name: 'Sam Li', patient_id: 'p1' }, {}),
    'Sam Li',
  );
});

test('resolveRiskTrafficPatientName falls back to roster map', () => {
  assert.equal(
    resolveRiskTrafficPatientName(
      { patient_id: 'p1' },
      { p1: { first_name: 'Sam', last_name: 'Li' } },
    ),
    'Sam Li',
  );
});

test('resolveRiskTrafficPatientName falls back to id when no roster row', () => {
  assert.equal(resolveRiskTrafficPatientName({ patient_id: 'p99' }, {}), 'p99');
});

test('resolveRiskTrafficPatientName handles missing id', () => {
  assert.equal(resolveRiskTrafficPatientName({}, {}), 'Patient');
});
