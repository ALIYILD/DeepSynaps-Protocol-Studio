// Smoke tests for pages-patient-analytics.js
//
// PR #840 (Clinical data infrastructure foundation, 2026-05-10) rewrote
// this page from a "Bloomberg-style" widget grid (widgetQeeg / widgetMri
// / widgetPredictions / renderHeader …) into a read-only clinical
// analytics dashboard that fetches summary, timeline, audit log, and
// signals from /api/v1/patients/:id/analytics/* and renders
// loading / error / empty / loaded states.
//
// The previous DS_EVIDENCE_TEST_EXPORTS-based widget tests pinned that
// deleted shape and crashed at import time on `node --test`. This file
// replaces them with shape-only smoke tests against the actual current
// surface. Behavioural coverage of pgPatientAnalyticsDetail render
// branches lives in pages-patient-analytics.evidence.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pgPatientAnalytics,
  pgPatientAnalyticsDetail,
  _analyticsData,
  _loading,
  _errors,
} from './pages-patient-analytics.js';

test('pgPatientAnalytics is an async function', () => {
  assert.equal(typeof pgPatientAnalytics, 'function');
  assert.equal(pgPatientAnalytics.constructor.name, 'AsyncFunction');
});

test('pgPatientAnalyticsDetail is an async function', () => {
  assert.equal(typeof pgPatientAnalyticsDetail, 'function');
  assert.equal(pgPatientAnalyticsDetail.constructor.name, 'AsyncFunction');
});

test('module state exposes the four analytics slices for tests', () => {
  // The page tracks four parallel async fetches (summary / timeline /
  // auditLog / signals). Test-only exports let coverage suites observe
  // loading / error transitions without DOM scraping.
  for (const slice of ['summary', 'timeline', 'auditLog', 'signals']) {
    assert.ok(slice in _analyticsData, `_analyticsData.${slice} should be declared`);
    assert.ok(slice in _loading, `_loading.${slice} should be declared`);
    assert.ok(slice in _errors, `_errors.${slice} should be declared`);
  }
});
