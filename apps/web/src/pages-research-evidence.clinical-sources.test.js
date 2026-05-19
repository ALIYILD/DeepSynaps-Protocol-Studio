/**
 * Slice D — Cat3 clinical-sources panel honesty contract.
 *
 * Pure-renderer tests for the panel that surfaces the 12 external + 1
 * internal Category-3 clinical-evidence source lifecycle on the
 * Research Evidence page. These tests do not touch the network — they
 * pass synthetic payloads (and `null`) directly to the renderer.
 *
 * Run: node --test src/pages-research-evidence.clinical-sources.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLINICAL_SOURCE_STATE_PRESENTATION,
  CLINICAL_SOURCES_UNAVAILABLE_NOTICE,
  renderClinicalSourcesPanel,
} from './pages-research-evidence.js';


// ── 1. Honest fallback when endpoint is not deployed ────────────────────────

test('renders honest fallback when endpointAvailable=false', () => {
  const html = renderClinicalSourcesPanel(null, { endpointAvailable: false });
  assert.match(html, /clinical-sources-unavailable/);
  assert.ok(html.includes('Source-status panel not available on this build'));
  // Must NOT show any fabricated source rows.
  assert.equal(html.includes('Live</span>'), false);
});

test('renders honest fallback when payload missing internal_source', () => {
  const html = renderClinicalSourcesPanel({ external_sources: [] }, { endpointAvailable: true });
  assert.match(html, /clinical-sources-unavailable/);
});

test('renders honest fallback when payload missing external_sources array', () => {
  const html = renderClinicalSourcesPanel({ internal_source: { display_name: 'X' } }, { endpointAvailable: true });
  assert.match(html, /clinical-sources-unavailable/);
});


// ── 2. Full render with 13-source payload ───────────────────────────────────

const _makeSource = (overrides = {}) => Object.assign({
  key: 'pubmed',
  display_name: 'PubMed',
  category: 'clinical_evidence',
  is_internal: false,
  lifecycle_state: 'healthy',
  requires_subscription: false,
  requires_credentials: false,
  endpoint: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
  license_type: 'NCBI-terms',
  notes: 'Live adapter.',
}, overrides);

const _makePayload = () => ({
  generated_at: '2026-05-19T08:30:00Z',
  decision_support_disclaimer: 'Decision support only. Not diagnosis, not prescription. Clinician must verify source data.',
  internal_source: _makeSource({
    key: 'internal_evidence_db',
    display_name: 'DeepSynaps Evidence Database',
    is_internal: true,
    endpoint: null,
    license_type: 'internal',
    notes: 'Indexed corpus: 184670 papers, 1279 trials.',
  }),
  external_sources: [
    _makeSource({ key: 'pubmed', display_name: 'PubMed', lifecycle_state: 'healthy' }),
    _makeSource({ key: 'cochrane', display_name: 'Cochrane Library', lifecycle_state: 'disabled', requires_subscription: true }),
    _makeSource({ key: 'crossref', display_name: 'CrossRef', lifecycle_state: 'catalogued' }),
    _makeSource({ key: 'acp_journal_club', display_name: 'ACP Journal Club', lifecycle_state: 'disabled', requires_subscription: true }),
  ],
  summary: { total: 5, internal_total: 1, external_total: 4 },
});

test('renders all source rows when payload is well-formed', () => {
  const html = renderClinicalSourcesPanel(_makePayload(), { endpointAvailable: true });
  assert.ok(html.includes('DeepSynaps Evidence Database'));
  assert.ok(html.includes('PubMed'));
  assert.ok(html.includes('Cochrane Library'));
  assert.ok(html.includes('CrossRef'));
  assert.ok(html.includes('ACP Journal Club'));
});

test('decision-support disclaimer renders verbatim', () => {
  const payload = _makePayload();
  const html = renderClinicalSourcesPanel(payload, { endpointAvailable: true });
  assert.match(html, /clinical-sources-disclaimer/);
  assert.ok(html.includes(payload.decision_support_disclaimer));
});

test('internal source rendered with INTERNAL badge', () => {
  const html = renderClinicalSourcesPanel(_makePayload(), { endpointAvailable: true });
  // The internal badge text is rendered uppercase via CSS but the source
  // literal is "Internal"; assert on the literal.
  assert.ok(html.includes('>Internal<'));
});

test('subscription sources render the Subscription badge', () => {
  const html = renderClinicalSourcesPanel(_makePayload(), { endpointAvailable: true });
  assert.ok(html.includes('>Subscription<'));
});

test('subscription source labeled "Disabled" never reported as "Live"', () => {
  // The catalogued-only adapter contract: a subscription source without
  // credentials must NEVER reach the user as healthy/Live. Defense in
  // depth at the render layer.
  const payload = _makePayload();
  const html = renderClinicalSourcesPanel(payload, { endpointAvailable: true });
  // Find the Cochrane block specifically.
  const cochraneIdx = html.indexOf('Cochrane Library');
  assert.ok(cochraneIdx > -1);
  const cochraneSlice = html.slice(cochraneIdx, cochraneIdx + 600);
  assert.equal(cochraneSlice.includes('>Live<'), false, 'Cochrane should not show Live badge');
  assert.ok(cochraneSlice.includes('>Disabled<'), 'Cochrane should show Disabled badge');
});


// ── 3. Constants contract ───────────────────────────────────────────────────

test('CLINICAL_SOURCE_STATE_PRESENTATION covers every documented state', () => {
  // These keys are part of the HTTP contract with apps/api/.../lifecycle.py.
  const required = ['healthy', 'registered', 'catalogued', 'degraded', 'disabled', 'unavailable', 'unknown'];
  for (const key of required) {
    assert.ok(CLINICAL_SOURCE_STATE_PRESENTATION[key], `Missing presentation for state: ${key}`);
    assert.ok(CLINICAL_SOURCE_STATE_PRESENTATION[key].label, `Missing label for state: ${key}`);
    assert.ok(CLINICAL_SOURCE_STATE_PRESENTATION[key].tone, `Missing tone for state: ${key}`);
  }
});

test('CLINICAL_SOURCES_UNAVAILABLE_NOTICE never claims live state', () => {
  // Honesty: when the endpoint is absent we must not imply that sources
  // are unavailable as a class — only the unified-lifecycle view is.
  assert.match(CLINICAL_SOURCES_UNAVAILABLE_NOTICE, /not available on this build/i);
  assert.match(CLINICAL_SOURCES_UNAVAILABLE_NOTICE, /still queryable/i);
});

test('unavailable notice avoids forbidden marketing language', () => {
  const forbidden = ['proven', 'guaranteed', 'recommended protocol', 'best treatment', 'safe and effective', 'no risk']; // governance-allow: fixture list — audit asserts absence in active UI copy
  const haystack = CLINICAL_SOURCES_UNAVAILABLE_NOTICE.toLowerCase();
  for (const word of forbidden) {
    assert.equal(haystack.includes(word), false, `Found forbidden term: ${word}`);
  }
});
