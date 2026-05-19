/**
 * Slice D3 — federated-search UI honesty contract.
 *
 * Pure-renderer tests. No DOM mock, no network. Synthetic payloads
 * passed directly to ``renderFederatedSearchPanel``.
 *
 * Run: node --test src/research-evidence-federated-search.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEDERATED_SEARCH_UNAVAILABLE_NOTICE,
  FEDERATED_SOURCE_STATE_PRESENTATION,
  renderFederatedSearchPanel,
} from './research-evidence-federated-search.js';


// ── 1. Endpoint-unavailable fallback ────────────────────────────────────────

test('renders honest fallback when endpointAvailable=false', () => {
  const html = renderFederatedSearchPanel(null, { endpointAvailable: false });
  assert.match(html, /federated-search-unavailable/);
  assert.ok(html.includes('Federated search is not available on this build'));
  // Must NOT show any fabricated source rows.
  assert.equal(html.includes('Live</span>'), false);
  assert.equal(html.includes('data-testid="federated-result"'), false);
});

test('renders fallback when response is missing source_status', () => {
  const html = renderFederatedSearchPanel(
    { internal_results: [], external_results: [] },
    { endpointAvailable: true },
  );
  assert.match(html, /federated-search-unavailable/);
});


// ── 2. Full render ──────────────────────────────────────────────────────────

const _makeResponse = (overrides = {}) => Object.assign({
  query: 'rTMS depression',
  generated_at: '2026-05-19T13:00:00Z',
  decision_support_disclaimer: 'Decision support only. Not diagnosis, not prescription. Clinician must verify.',
  internal_results: [
    {
      source: 'internal_evidence_db',
      doi: '10.1/INT.A',
      pmid: '111',
      title: 'Internal paper A',
      authors: ['Alice', 'Bob'],
      year: 2022,
      journal: 'JCN',
      url: 'https://example.test/A',
    },
  ],
  external_results: [
    {
      source: 'pubmed',
      doi: '10.2/EXT.A',
      pmid: '222',
      title: 'External paper A',
      authors: ['Carol'],
      year: 2023,
      journal: 'Lancet',
      url: 'https://example.test/B',
    },
  ],
  deduplication_summary: { internal_in: 1, external_in: 1, external_kept: 1, total_after_dedup: 2 },
  source_status: [
    {
      key: 'internal_evidence_db',
      display_name: 'DeepSynaps Evidence Database',
      is_internal: true,
      requires_subscription: false,
      result_count: 1,
      status: 'ok',
      message: null,
      latency_ms: null,
    },
    {
      key: 'pubmed',
      display_name: 'PubMed',
      is_internal: false,
      requires_subscription: false,
      result_count: 1,
      status: 'ok',
      message: 'PubMed returned 1 matches.',
      latency_ms: 87,
    },
    {
      key: 'cochrane',
      display_name: 'Cochrane Library',
      is_internal: false,
      requires_subscription: true,
      result_count: 0,
      status: 'catalogued',
      message: 'No live transport.',
      latency_ms: null,
    },
  ],
  warnings: [],
  limit_applied: 25,
}, overrides);

test('renders both internal and external result sections separately', () => {
  const html = renderFederatedSearchPanel(_makeResponse(), { endpointAvailable: true });
  assert.ok(html.includes('Internal corpus (1)'));
  assert.ok(html.includes('External sources (1)'));
  // Each row carries its source via data-source for downstream e2e tooling.
  assert.match(html, /data-source="internal_evidence_db"/);
  assert.match(html, /data-source="pubmed"/);
});

test('decision-support disclaimer renders verbatim', () => {
  const resp = _makeResponse();
  const html = renderFederatedSearchPanel(resp, { endpointAvailable: true });
  assert.match(html, /federated-search-disclaimer/);
  assert.ok(html.includes(resp.decision_support_disclaimer));
});

test('internal source rendered with INTERNAL badge', () => {
  const html = renderFederatedSearchPanel(_makeResponse(), { endpointAvailable: true });
  assert.ok(html.includes('>Internal<'));
});

test('subscription source rendered with SUBSCRIPTION badge', () => {
  const html = renderFederatedSearchPanel(_makeResponse(), { endpointAvailable: true });
  assert.ok(html.includes('>Subscription<'));
});

test('catalogued subscription source never shows Live badge', () => {
  // The defense-in-depth contract from PRs #1061 and #1078: a
  // subscription source without credentials must NEVER reach the user
  // as healthy/Live, even if some upstream signal said otherwise.
  const html = renderFederatedSearchPanel(_makeResponse(), { endpointAvailable: true });
  const cochraneIdx = html.indexOf('Cochrane Library');
  assert.ok(cochraneIdx > -1);
  const cochraneSlice = html.slice(cochraneIdx, cochraneIdx + 600);
  assert.equal(cochraneSlice.includes('>Live<'), false, 'Cochrane should not show Live badge');
  assert.ok(cochraneSlice.includes('>Catalogued<'), 'Cochrane should show Catalogued badge');
});


// ── 3. Empty envelope ──────────────────────────────────────────────────────

test('empty envelope renders explicit clinical-safety notice', () => {
  const resp = _makeResponse({
    internal_results: [],
    external_results: [],
  });
  const html = renderFederatedSearchPanel(resp, { endpointAvailable: true });
  assert.match(html, /federated-search-empty/);
  assert.ok(html.includes('Do NOT interpret an empty envelope'));
});


// ── 4. Warnings + per-source error states ──────────────────────────────────

test('warnings array is surfaced when present', () => {
  const resp = _makeResponse({
    warnings: ['Truncated external_results to limit=10.'],
  });
  const html = renderFederatedSearchPanel(resp, { endpointAvailable: true });
  assert.match(html, /federated-search-warnings/);
  assert.ok(html.includes('Truncated external_results'));
});

test('error and timeout statuses render with their tones', () => {
  const resp = _makeResponse({
    source_status: [
      { key: 'pubmed', display_name: 'PubMed', is_internal: false, requires_subscription: false, result_count: 0, status: 'error', message: 'simulated', latency_ms: null },
      { key: 'trip', display_name: 'Trip', is_internal: false, requires_subscription: false, result_count: 0, status: 'timeout', message: 'slow', latency_ms: null },
    ],
    internal_results: [],
    external_results: [],
  });
  const html = renderFederatedSearchPanel(resp, { endpointAvailable: true });
  assert.ok(html.includes('>Error<'));
  assert.ok(html.includes('>Timeout<'));
});


// ── 5. Constants contract ───────────────────────────────────────────────────

test('FEDERATED_SOURCE_STATE_PRESENTATION covers every emitted status', () => {
  // Keys must mirror SourceStatus.status emitted by
  // apps/api/app/services/evidence_federation.py.
  const required = ['ok', 'catalogued', 'disabled', 'error', 'timeout', 'missing', 'degraded', 'unavailable', 'unknown'];
  for (const key of required) {
    assert.ok(FEDERATED_SOURCE_STATE_PRESENTATION[key], `Missing presentation for state: ${key}`);
    assert.ok(FEDERATED_SOURCE_STATE_PRESENTATION[key].label);
    assert.ok(FEDERATED_SOURCE_STATE_PRESENTATION[key].tone);
  }
});

test('unavailable notice avoids forbidden marketing language', () => {
  // governance-allow: list intentionally contains forbidden phrases as
  // the audit fixture this very test asserts against.
  const forbidden = ['proven', 'guaranteed', 'best treatment', 'safe and effective', 'no risk'];
  const haystack = FEDERATED_SEARCH_UNAVAILABLE_NOTICE.toLowerCase();
  for (const word of forbidden) {
    assert.equal(haystack.includes(word), false, `Found forbidden term: ${word}`);
  }
});

test('unavailable notice does not falsely claim sources are unreachable as a class', () => {
  // The endpoint may be missing in this build but the per-source search
  // tabs below still work. The notice must say so.
  assert.match(FEDERATED_SEARCH_UNAVAILABLE_NOTICE, /not available on this build/i);
  assert.match(FEDERATED_SEARCH_UNAVAILABLE_NOTICE, /remain functional/i);
});
