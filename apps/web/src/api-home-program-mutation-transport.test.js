import test from 'node:test';
import assert from 'node:assert/strict';

import { HOME_PROGRAM_MUTATION_OUTCOMES, parseHomeProgramTaskMutationResponse } from './home-program-task-sync.js';

function ensureLocalStorage() {
  if (globalThis.localStorage) return;
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

function makeHeaders(map) {
  return {
    get: (k) => map[k] ?? map[k?.toLowerCase?.()] ?? null,
  };
}

test('mutateHomeProgramTask captures Deprecation header on legacy_put_create', async () => {
  ensureLocalStorage();
  const mockFetch = async () => ({
    status: 200,
    ok: true,
    headers: makeHeaders({
      'X-DS-Home-Task-Legacy-Put-Create': 'true',
      'Deprecation': 'behavior="put-create"',
    }),
    json: async () => ({
      id: 'htask-legacy',
      patientId: 'pt-001',
      createDisposition: 'legacy_put_create',
      serverTaskId: '550e8400-e29b-41d4-a716-446655440000',
      serverRevision: 1,
    }),
  });
  const { api } = await import('./api.js');
  const { data, transport } = await api._homeProgramTaskMutationFetch('/api/v1/home-program-tasks', {
    method: 'POST',
    body: JSON.stringify({ id: 'htask-legacy', patientId: 'pt-001' }),
    _fetch: mockFetch,
  });
  const parsed = parseHomeProgramTaskMutationResponse(data, transport);
    assert.equal(parsed.outcome, HOME_PROGRAM_MUTATION_OUTCOMES.LEGACY_PUT_CREATE);
    assert.equal(parsed.deprecation.legacyPutCreate, true);
    assert.equal(parsed.deprecation.deprecationHeader, 'behavior="put-create"');
});

test('mutateHomeProgramTask handles normal update with no deprecation headers', async () => {
  ensureLocalStorage();
  const mockFetch = async () => ({
    status: 200,
    ok: true,
    headers: makeHeaders({}),
    json: async () => ({
      id: 'htask-1',
      patientId: 'pt-001',
      serverTaskId: '550e8400-e29b-41d4-a716-446655440000',
      serverRevision: 2,
      title: 'v2',
    }),
  });
  const { api } = await import('./api.js');
  const { data, transport } = await api._homeProgramTaskMutationFetch('/api/v1/home-program-tasks/htask-1', {
    method: 'PUT',
    body: JSON.stringify({ id: 'htask-1', patientId: 'pt-001' }),
    _fetch: mockFetch,
  });
  const parsed = parseHomeProgramTaskMutationResponse(data, transport);
    assert.equal(parsed.outcome, HOME_PROGRAM_MUTATION_OUTCOMES.UPDATED);
    assert.equal(parsed.deprecation.legacyPutCreate, false);
    assert.equal(parsed.deprecation.deprecationHeader, null);
});

