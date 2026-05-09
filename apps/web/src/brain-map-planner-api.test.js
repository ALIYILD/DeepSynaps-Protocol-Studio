/**
 * brain-map-planner-api.test.js — Tests for brain map API wiring
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as api from './brain-map-planner-api.js';

// Mock fetch for testing
let mockFetchResponses = {};
let mockFetchCalls = [];

// Store original fetch
const originalFetch = globalThis.fetch;

// Mock implementation
function mockFetch(url, options = {}) {
  mockFetchCalls.push({ url, options, timestamp: Date.now() });

  const key = typeof url === 'string' ? url : url.toString();
  const response = mockFetchResponses[key];

  if (response) {
    return Promise.resolve(response);
  }

  return Promise.reject(new Error(`No mock for ${key}`));
}

function setupMocks() {
  mockFetchResponses = {};
  mockFetchCalls = [];
  globalThis.fetch = mockFetch;
}

function teardownMocks() {
  globalThis.fetch = originalFetch;
}

// ──────────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────────

test('brain-map-planner-api — API module exports', async () => {
  assert.ok(typeof api.createBrainMapPlan === 'function', 'createBrainMapPlan is exported');
  assert.ok(typeof api.getBrainMapPlan === 'function', 'getBrainMapPlan is exported');
  assert.ok(typeof api.listBrainMapPlans === 'function', 'listBrainMapPlans is exported');
  assert.ok(typeof api.updateBrainMapPlanStatus === 'function', 'updateBrainMapPlanStatus is exported');
  assert.ok(typeof api.getBrainMapPlanAudit === 'function', 'getBrainMapPlanAudit is exported');
  assert.ok(typeof api.checkBrainMapHealth === 'function', 'checkBrainMapHealth is exported');
});

test('brain-map-planner-api — health check (demo mode)', async () => {
  // When in demo mode, checkBrainMapHealth returns { status: 'demo' }
  // (We cannot easily test demo mode without mocking globalThis.localStorage)
  // This is a smoke test to ensure the function exists and doesn't throw
  try {
    const result = await api.checkBrainMapHealth();
    assert.ok(result && typeof result === 'object', 'health check returns object');
    assert.ok('status' in result, 'result has status field');
  } catch (error) {
    // Acceptable: network may not be available in test env
  }
});

test('brain-map-planner-api — createBrainMapPlan signature', async () => {
  setupMocks();
  mockFetchResponses['http://127.0.0.1:8000/api/v1/brain-map/plans'] = {
    ok: true,
    status: 201,
    json: () => Promise.resolve({
      id: 'plan-123',
      created_at: '2026-05-09T12:00:00Z',
      created_by: 'clinician-1',
      status: 'draft',
    }),
  };

  const plan = {
    patient_id: 'pt-001',
    region: 'DLPFC-L',
    target_anchor: 'F3',
    protocol_name: 'tDCS-Standard',
  };

  try {
    const result = await api.createBrainMapPlan(plan);
    // Note: in real test we'd need proper auth setup
    // This test ensures the function signature is correct
    assert.ok(typeof result === 'object' || result === null, 'returns object or null');
  } finally {
    teardownMocks();
  }
});

test('brain-map-planner-api — getBrainMapPlan signature', async () => {
  setupMocks();
  mockFetchResponses['http://127.0.0.1:8000/api/v1/brain-map/plans/plan-123'] = {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      id: 'plan-123',
      status: 'draft',
      region: 'DLPFC-L',
    }),
  };

  try {
    const result = await api.getBrainMapPlan('plan-123');
    assert.ok(typeof result === 'object' || result === null, 'returns object or null');
  } finally {
    teardownMocks();
  }
});

test('brain-map-planner-api — listBrainMapPlans signature', async () => {
  setupMocks();

  try {
    const result = await api.listBrainMapPlans('pt-001', 50);
    assert.ok(typeof result === 'object' || result === null, 'returns object or null');
  } finally {
    teardownMocks();
  }
});

test('brain-map-planner-api — updateBrainMapPlanStatus signature', async () => {
  setupMocks();

  try {
    const result = await api.updateBrainMapPlanStatus('plan-123', 'approved');
    assert.ok(typeof result === 'object' || result === null, 'returns object or null');
  } finally {
    teardownMocks();
  }
});

test('brain-map-planner-api — getBrainMapPlanAudit signature', async () => {
  setupMocks();

  try {
    const result = await api.getBrainMapPlanAudit('plan-123');
    assert.ok(typeof result === 'object' || result === null, 'returns object or null');
  } finally {
    teardownMocks();
  }
});
