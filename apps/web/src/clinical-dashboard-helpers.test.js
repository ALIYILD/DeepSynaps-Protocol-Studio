/**
 * Unit tests for clinical-dashboard-helpers.js
 *
 * Run from apps/web/: node --test src/clinical-dashboard-helpers.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRiskTrafficPatientName, shouldSeedDashboardDemo } from './clinical-dashboard-helpers.js';

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

// ── shouldSeedDashboardDemo (production vs preview) ───────────────────────────

test('shouldSeedDashboardDemo: production empty clinic + API OK → no seed', () => {
  assert.equal(
    shouldSeedDashboardDemo({
      emptyClinic: true,
      coreLoadFailed: false,
      viteEnableDemo: false,
      isDev: false,
    }),
    false,
  );
});

test('shouldSeedDashboardDemo: preview empty clinic + API OK + VITE_ENABLE_DEMO → seed', () => {
  assert.equal(
    shouldSeedDashboardDemo({
      emptyClinic: true,
      coreLoadFailed: false,
      viteEnableDemo: true,
      isDev: false,
    }),
    true,
  );
});

test('shouldSeedDashboardDemo: API failure + prod build → no seed', () => {
  assert.equal(
    shouldSeedDashboardDemo({
      emptyClinic: true,
      coreLoadFailed: true,
      viteEnableDemo: false,
      isDev: false,
    }),
    false,
  );
});

test('shouldSeedDashboardDemo: API failure + dev → seed', () => {
  assert.equal(
    shouldSeedDashboardDemo({
      emptyClinic: true,
      coreLoadFailed: true,
      viteEnableDemo: false,
      isDev: true,
    }),
    true,
  );
});

test('shouldSeedDashboardDemo: non-empty → never seed', () => {
  assert.equal(
    shouldSeedDashboardDemo({
      emptyClinic: false,
      coreLoadFailed: true,
      viteEnableDemo: true,
      isDev: true,
    }),
    false,
  );
});
