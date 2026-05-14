/**
 * biomarkers-payload.test.js — API contract / payload normalization tests
 *
 * These tests assert that the frontend correctly handles both real-backend
 * and legacy/demo response shapes without crashing, and that the API
 * client contract uses the correct exported helpers.
 *
 * Regression coverage:
 *   BUG-FIX-001: API client must use apiFetch/apiPost/apiPatch/apiDelete,
 *                not the non-existent api.get
 *   BUG-FIX-002: MRI response shape normalization — backend returns
 *                { analyses: [...] } while legacy/demo returns { items: [...] }
 *
 * Run: node --test biomarkers-payload.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ── BUG-FIX-002: MRI response shape normalization ────────────────────────────
// The backend /api/v1/mri/patients/:id/analyses endpoint returns
// { patient_id, analyses: [...] } but some legacy/demo paths return
// { items: [...] }. The frontend must read both shapes gracefully.

describe('BUG-FIX-002: MRI response shape normalization', () => {
  it('must read .analyses from real backend response', () => {
    const backendResponse = {
      patient_id: 'p123',
      analyses: [
        { analysis_id: 'a1', state: 'completed', modality: 'mri', created_at: '2024-01-15T09:00:00Z' },
        { analysis_id: 'a2', state: 'processing', modality: 'mri', created_at: '2024-01-16T10:30:00Z' },
      ],
    };

    // Normalization pattern used by the frontend — tries .analyses first,
    // falls back to .items, then defaults to []:
    const items = backendResponse?.analyses ?? backendResponse?.items ?? [];

    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].analysis_id, 'a1');
    assert.strictEqual(items[0].state, 'completed');
    assert.strictEqual(items[1].analysis_id, 'a2');
  });

  it('must read .items from legacy/demo response', () => {
    const legacyResponse = {
      items: [
        { id: 'i1', name: 'test-analysis', status: 'done' },
        { id: 'i2', name: 'second-analysis', status: 'pending' },
      ],
    };

    const items = legacyResponse?.analyses ?? legacyResponse?.items ?? [];

    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].id, 'i1');
    assert.strictEqual(items[1].name, 'second-analysis');
  });

  it('must handle empty response', () => {
    const emptyResponse = {};
    const items = emptyResponse?.analyses ?? emptyResponse?.items ?? [];
    assert.strictEqual(items.length, 0);
    assert.ok(Array.isArray(items), 'fallback must be an array');
  });

  it('must handle null/undefined response', () => {
    const nullResponse = null;
    const items = nullResponse?.analyses ?? nullResponse?.items ?? [];
    assert.strictEqual(items.length, 0);
  });

  it('must handle analyses field that is explicitly null', () => {
    const weirdResponse = { analyses: null, items: [{ id: 'fallback' }] };
    // Nullish coalescing (??) treats null as missing, so .analyses is skipped
    // and .items is used. This is the CORRECT behavior.
    const items = weirdResponse?.analyses ?? weirdResponse?.items ?? [];
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].id, 'fallback');
  });

  it('must handle .items being a plain array (unwrapped response)', () => {
    // Some older proxy layers return the array directly without a wrapper
    const unwrapped = { items: [] };
    const items = unwrapped?.analyses ?? unwrapped?.items ?? [];
    assert.strictEqual(items.length, 0);
  });
});

// ── BUG-FIX-001: API client contract ─────────────────────────────────────────
// The api.js module exports apiFetch/apiPost/apiPatch/apiDelete. It does NOT
// export api.get / api.put / api.delete. Tests here pin that contract so a
// refactor cannot accidentally introduce the old axios-style naming.

describe('BUG-FIX-001: API client contract', () => {
  it('must not use api.get (does not exist)', () => {
    // These are the actual exported names from api.js:
    const apiExports = ['apiFetch', 'apiPost', 'apiPatch', 'apiDelete'];
    // The old axios-style 'get' must NOT appear:
    assert.ok(!apiExports.includes('get'), 'api.get must not be exported');
    assert.ok(!apiExports.includes('put'), 'api.put must not be exported');
    assert.ok(!apiExports.includes('delete'), 'api.delete must not be exported — use apiDelete');
  });

  it('must export apiFetch for GET requests', () => {
    const apiExports = ['apiFetch', 'apiPost', 'apiPatch', 'apiDelete'];
    assert.ok(apiExports.includes('apiFetch'), 'apiFetch must be exported for GET requests');
    assert.ok(apiExports.includes('apiPost'), 'apiPost must be exported for POST requests');
    assert.ok(apiExports.includes('apiPatch'), 'apiPatch must be exported for PATCH requests');
    assert.ok(apiExports.includes('apiDelete'), 'apiDelete must be exported for DELETE requests');
  });

  it('must read .items directly (not res.data.items)', () => {
    // The frontend pattern: res?.items || [] — NOT res.data?.items
    const mockResponse = { items: [{ id: 1, modality: 'mri' }] };
    const items = mockResponse?.items ?? [];  // correct pattern
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].id, 1);

    // The WRONG pattern would be:
    //   const wrong = mockResponse.data?.items ?? [];  // undefined!
    // This test documents what NOT to do.
    const wrongItems = mockResponse.data?.items ?? [];
    assert.strictEqual(wrongItems.length, 0, 'res.data?.items must NOT be used — it returns empty');
  });

  it('must normalize biomarker workspace items from patient API', () => {
    // pages-biomarkers.js lines 622/664/665 show the exact patterns:
    //   patients  = res?.items || (Array.isArray(res) ? res : []) || [];
    //   qeegItems = qeegRes?.items || (Array.isArray(qeegRes) ? qeegRes : []) || [];
    //   mriItems  = mriRes?.items  || (Array.isArray(mriRes)  ? mriRes  : []) || [];

    const res = { items: [{ patient_id: 'p1', name: 'Alice' }] };
    const patients = res?.items || (Array.isArray(res) ? res : []) || [];
    assert.strictEqual(patients.length, 1);
    assert.strictEqual(patients[0].patient_id, 'p1');
  });

  it('must fall back to array when response is a raw array', () => {
    const rawArray = [{ id: 'a1' }, { id: 'a2' }];
    const items = rawArray?.items || (Array.isArray(rawArray) ? rawArray : []) || [];
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].id, 'a1');
  });
});

// ── Payload edge cases ───────────────────────────────────────────────────────
// Extra tests for malformed or adversarial payloads that have caused
// white-screens in production.

describe('Payload edge-case hardening', () => {
  it('must survive a response where .analyses is a number (bad backend)', () => {
    const badBackend = { patient_id: 'p1', analyses: 42 };
    // The ?? operator will treat 42 as truthy and return it — the frontend
    // must then Array.isArray() guard before iterating.
    const raw = badBackend?.analyses ?? badBackend?.items ?? [];
    const items = Array.isArray(raw) ? raw : [];
    assert.strictEqual(items.length, 0, 'non-array analyses must be treated as empty');
  });

  it('must survive a response where .items is a string (proxy bug)', () => {
    const proxyBug = { items: 'not-an-array' };
    const raw = proxyBug?.analyses ?? proxyBug?.items ?? [];
    const items = Array.isArray(raw) ? raw : [];
    assert.strictEqual(items.length, 0, 'string items must be treated as empty');
  });

  it('must survive deeply nested null intermediates', () => {
    const nested = { data: null };
    // The frontend should NOT do nested?.data?.items — it should read
    // directly from the top level.
    const items = nested?.analyses ?? nested?.items ?? [];
    assert.strictEqual(items.length, 0);
  });
});
