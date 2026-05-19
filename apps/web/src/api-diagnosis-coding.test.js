import test from 'node:test';
import assert from 'node:assert/strict';

function installLocalStorageStub() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  });
}

function stubFetch(response) {
  let capturedUrl = null;
  let capturedOpts = null;
  globalThis.fetch = async (url, opts = {}) => {
    capturedUrl = url;
    capturedOpts = opts;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => response,
    };
  };
  return () => ({ url: capturedUrl, opts: capturedOpts });
}

test('diagnosisCodingSources GETs /api/v1/diagnosis/sources', async () => {
  installLocalStorageStub();
  const captured = stubFetch({
    category: 'diagnosis_coding',
    expected_total: 5,
    sources: [],
    decision_support_disclaimer: 'Decision support only.',
    generated_at: '2026-05-19T00:00:00Z',
  });
  const { api } = await import('./api.js');
  const res = await api.diagnosisCodingSources();
  const { url, opts } = captured();
  assert.equal(url, 'http://127.0.0.1:8000/api/v1/diagnosis/sources');
  assert.notEqual(opts?.method, 'POST');
  assert.equal(res.category, 'diagnosis_coding');
  assert.equal(res.expected_total, 5);
  assert.ok(res.decision_support_disclaimer);
});

test('diagnosisNormalize POSTs to /api/v1/diagnosis/normalize with body', async () => {
  installLocalStorageStub();
  const captured = stubFetch({
    input_term: 'F33.2',
    detected_coding_system: 'icd10',
    matches: [],
    matches_by_source: {},
    source_status: {},
    warnings: [],
    decision_support_disclaimer: 'Not a diagnosis assertion.',
    generated_at: '2026-05-19T00:00:00Z',
  });
  const { api } = await import('./api.js');
  const payload = { term: 'F33.2', limit: 5 };
  const res = await api.diagnosisNormalize(payload);
  const { url, opts } = captured();
  assert.equal(url, 'http://127.0.0.1:8000/api/v1/diagnosis/normalize');
  assert.equal(opts?.method, 'POST');
  assert.equal(JSON.parse(opts?.body).term, 'F33.2');
  assert.equal(JSON.parse(opts?.body).limit, 5);
  assert.equal(res.input_term, 'F33.2');
  assert.ok(res.decision_support_disclaimer);
});

test('diagnosisQueryExpansion POSTs to /api/v1/diagnosis/query-expansion', async () => {
  installLocalStorageStub();
  const captured = stubFetch({
    condition: 'depression',
    normalized_terms: ['depression'],
    synonyms: [],
    mappings: {},
    evidence_search_terms: ['depression'],
    source_status: {},
    warnings: [],
    decision_support_disclaimer: 'Terminology expansion, not equivalence.',
    generated_at: '2026-05-19T00:00:00Z',
  });
  const { api } = await import('./api.js');
  const res = await api.diagnosisQueryExpansion({
    condition: 'depression',
    target_workflow: 'evidence',
  });
  const { url, opts } = captured();
  assert.equal(url, 'http://127.0.0.1:8000/api/v1/diagnosis/query-expansion');
  assert.equal(opts?.method, 'POST');
  assert.equal(JSON.parse(opts?.body).target_workflow, 'evidence');
  assert.deepEqual(res.evidence_search_terms, ['depression']);
});

test('diagnosisEligibilityContext returns coverage_determined=false and disclaimer', async () => {
  installLocalStorageStub();
  const captured = stubFetch({
    diagnosis_code: 'F33.2',
    modality: 'rTMS',
    jurisdiction: 'UK',
    payer: 'NHS',
    coding_match: null,
    possible_indication_context: [],
    required_evidence_references: [],
    missing_sources: ['umls'],
    status: 'context_only',
    coverage_determined: false,
    warnings: [],
    decision_support_disclaimer:
      'Eligibility context is informational. Not a coverage decision.',
    generated_at: '2026-05-19T00:00:00Z',
  });
  const { api } = await import('./api.js');
  const res = await api.diagnosisEligibilityContext({
    diagnosis_code: 'F33.2',
    modality: 'rTMS',
    jurisdiction: 'UK',
    payer: 'NHS',
  });
  const { url, opts } = captured();
  assert.equal(url, 'http://127.0.0.1:8000/api/v1/diagnosis/eligibility-context');
  assert.equal(opts?.method, 'POST');
  assert.equal(res.coverage_determined, false);
  assert.equal(res.status, 'context_only');
  // Contract pin: client must never re-interpret the response as a coverage
  // decision; presence of disclaimer is required for the UI to render it.
  assert.match(res.decision_support_disclaimer, /coverage/i);
});

test('diagnosisNormalize on empty payload still issues a POST (server handles empty input)', async () => {
  installLocalStorageStub();
  const captured = stubFetch({
    input_term: '',
    matches: [],
    matches_by_source: {},
    source_status: {},
    warnings: ['Empty input term — no normalization possible.'],
    decision_support_disclaimer: 'Not a diagnosis assertion.',
    generated_at: '2026-05-19T00:00:00Z',
  });
  const { api } = await import('./api.js');
  await api.diagnosisNormalize();
  const { opts } = captured();
  assert.equal(opts?.method, 'POST');
  assert.equal(opts?.body, '{}');
});
