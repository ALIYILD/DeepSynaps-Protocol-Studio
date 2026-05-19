/**
 * Unit tests for Biomarkers workspace helpers (pure logic).
 * Run: node --test src/pages-biomarkers.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  flattenLabResults,
  isStale,
  BIOMARKERS_LINKED_MODULES,
  CURATED_REFERENCE_LITERATURE_ANCHORS,
  CURATED_REFERENCE_PANEL_LABEL,
  CURATED_REFERENCE_PANEL_CAPTION,
  CURATED_REFERENCE_CARD_PILL_TITLE,
  buildBiomarkerEvidenceSearchQuery,
  pivotToLiveEvidenceSearch,
  parseBiomarkerSites,
  guessBiomarkerWaveformBand,
} from './pages-biomarkers.js';
import { NEURO_BIOMARKER_REFERENCE } from './neuro-biomarker-data.js';
import { isDemoSession } from './demo-session.js';

test('flattenLabResults maps panels to rows with ref range', () => {
  const rows = flattenLabResults({
    captured_at: '2026-01-10T12:00:00Z',
    panels: [
      {
        name: 'CMP',
        results: [
          { analyte: 'Na', value: 140, unit: 'mmol/L', ref_low: 135, ref_high: 145, status: 'normal', captured_at: '2026-01-10T12:00:00Z' },
        ],
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].analyte, 'Na');
  assert.equal(rows[0].ref, '135–145');
  assert.equal(rows[0].panel, 'CMP');
});

test('flattenLabResults empty when no panels', () => {
  assert.deepEqual(flattenLabResults(null), []);
  assert.deepEqual(flattenLabResults({ panels: [] }), []);
});

test('isStale returns true when older than threshold', () => {
  const old = new Date(Date.now() - 120 * 86400000).toISOString();
  const r = isStale(old, 90);
  assert.equal(r.stale, true);
  assert.ok(r.days >= 90);
});

test('isStale false for recent date', () => {
  const recent = new Date(Date.now() - 10 * 86400000).toISOString();
  const r = isStale(recent, 90);
  assert.equal(r.stale, false);
});

test('isStale true when iso missing', () => {
  const r = isStale('', 90);
  assert.equal(r.stale, true);
  assert.equal(r.reason, 'no date');
});

test('BIOMARKERS_LINKED_MODULES wires known SPA routes', () => {
  assert.ok(BIOMARKERS_LINKED_MODULES.length >= 8);
  for (const m of BIOMARKERS_LINKED_MODULES) {
    assert.ok(m.route && typeof m.route === 'string');
    assert.ok(m.label);
    assert.match(m.route, /^[a-z0-9-]+$/);
  }
  const routes = new Set(BIOMARKERS_LINKED_MODULES.map((x) => x.route));
  assert.equal(routes.size, BIOMARKERS_LINKED_MODULES.length);
});

test('CURATED_REFERENCE_LITERATURE_ANCHORS is documented static index', () => {
  assert.equal(typeof CURATED_REFERENCE_LITERATURE_ANCHORS, 'number');
  assert.ok(CURATED_REFERENCE_LITERATURE_ANCHORS >= 1000);
});

test('parseBiomarkerSites extracts valid 10-20 tokens', () => {
  assert.deepEqual(parseBiomarkerSites('F3, F4 (linked mastoids)'), ['F3', 'F4']);
  assert.deepEqual(parseBiomarkerSites('Cz primarily'), ['Cz']);
  assert.deepEqual(parseBiomarkerSites('no valid electrode tokens here xyz'), []);
});

test('guessBiomarkerWaveformBand heuristic is stable for FAA', () => {
  const group = NEURO_BIOMARKER_REFERENCE.find((g) => g.id === 'spectral-asymmetry');
  assert.ok(group);
  const marker = group.markers.find((x) => x.id === 'faa');
  assert.ok(marker);
  assert.equal(guessBiomarkerWaveformBand(marker, group), 'alpha');
});

test('production JWT never qualifies as demo session even if demo flag on', () => {
  assert.equal(
    isDemoSession({ env: { VITE_ENABLE_DEMO: '1', DEV: false }, token: 'eyJhbGciOi.real-production-token' }),
    false
  );
});

test('demo token suffix activates demo session when flag on', () => {
  assert.equal(
    isDemoSession({ env: { VITE_ENABLE_DEMO: '1', DEV: false }, token: 'offline-demo-demo-token' }),
    true
  );
});

// ── Slice D2: biomarker → live evidence pivot ───────────────────────────────

test('buildBiomarkerEvidenceSearchQuery strips parenthetical abbreviations', () => {
  const q = buildBiomarkerEvidenceSearchQuery({
    name: 'Frontal Alpha Asymmetry (FAA)',
    conditions: ['MDD', 'Anxiety'],
  });
  assert.equal(q, 'Frontal Alpha Asymmetry MDD Anxiety');
});

test('buildBiomarkerEvidenceSearchQuery includes first two conditions only', () => {
  const q = buildBiomarkerEvidenceSearchQuery({
    name: 'Peak Alpha Frequency',
    conditions: ['MCI', "Alzheimer's", 'Post-concussion', 'TBI', 'Cognitive aging'],
  });
  assert.equal(q, "Peak Alpha Frequency MCI Alzheimer's");
});

test('buildBiomarkerEvidenceSearchQuery falls back to name alone when no conditions', () => {
  const q = buildBiomarkerEvidenceSearchQuery({
    name: 'Theta/Beta Ratio (TBR)',
    conditions: [],
  });
  assert.equal(q, 'Theta/Beta Ratio');
});

test('buildBiomarkerEvidenceSearchQuery returns empty string for missing input', () => {
  assert.equal(buildBiomarkerEvidenceSearchQuery(null), '');
  assert.equal(buildBiomarkerEvidenceSearchQuery(undefined), '');
  assert.equal(buildBiomarkerEvidenceSearchQuery({}), '');
  assert.equal(buildBiomarkerEvidenceSearchQuery({ name: '   ' }), '');
});

test('buildBiomarkerEvidenceSearchQuery ignores non-string conditions defensively', () => {
  const q = buildBiomarkerEvidenceSearchQuery({
    name: 'Hemoglobin',
    conditions: [null, undefined, 42, 'Depression', { x: 1 }, 'Fatigue'],
  });
  assert.equal(q, 'Hemoglobin Depression Fatigue');
});

test('pivotToLiveEvidenceSearch sets the documented prefill hooks', () => {
  // The Research Evidence page reads `window._reEvidencePrefill` and
  // `window._reSearch.search` at line 2279 of pages-research-evidence.js
  // — those are the stable contract. Lock them in.
  const navCalls = [];
  const fakeWindow = {
    _nav: (route) => navCalls.push(route),
  };
  globalThis.window = fakeWindow;
  try {
    const ok = pivotToLiveEvidenceSearch({
      name: 'Frontal Alpha Asymmetry (FAA)',
      conditions: ['MDD'],
    });
    assert.equal(ok, true);
    assert.equal(fakeWindow._reEvidencePrefill, 'Frontal Alpha Asymmetry MDD');
    assert.equal(fakeWindow._reSearch.search, 'Frontal Alpha Asymmetry MDD');
    assert.equal(fakeWindow._resEvidenceTab, 'search');
    assert.deepEqual(navCalls, ['research-evidence']);
  } finally {
    delete globalThis.window;
  }
});

test('pivotToLiveEvidenceSearch returns false when the marker yields no query', () => {
  const fakeWindow = { _nav: () => { throw new Error('should not be called'); } };
  globalThis.window = fakeWindow;
  try {
    assert.equal(pivotToLiveEvidenceSearch(null), false);
    assert.equal(pivotToLiveEvidenceSearch({}), false);
    // No prefill should have been written.
    assert.equal('_reEvidencePrefill' in fakeWindow, false);
  } finally {
    delete globalThis.window;
  }
});

// ── Slice E: honest curated-reference copy ──────────────────────────────────

test('CURATED_REFERENCE_PANEL_LABEL is the honest per-marker label', () => {
  assert.equal(CURATED_REFERENCE_PANEL_LABEL, 'Curated reference count');
  assert.match(CURATED_REFERENCE_PANEL_LABEL, /curated/i);
});

test('CURATED_REFERENCE_PANEL_CAPTION says the count is not live', () => {
  assert.match(CURATED_REFERENCE_PANEL_CAPTION, /not a live/i);
  assert.match(CURATED_REFERENCE_PANEL_CAPTION, /editorial snapshot/i);
});

test('CURATED_REFERENCE_CARD_PILL_TITLE explains pill provenance', () => {
  assert.match(CURATED_REFERENCE_CARD_PILL_TITLE, /curated/i);
  assert.match(CURATED_REFERENCE_CARD_PILL_TITLE, /not a live/i);
});

test('curated-reference copy avoids forbidden marketing language', () => {
  // Forbidden-phrase fixture for the audit invariant. Kept on a single
  // line so the per-line ``governance-allow:`` marker covers every
  // phrase. See apps/web/src/governance-language-audit.test.js for the
  // walker that consumes the marker.
  const forbidden = ['proven', 'guaranteed', 'recommended protocol', 'best treatment', 'safe and effective', 'no risk']; // governance-allow: fixture list — audit asserts absence in active UI copy
  const haystack = [
    CURATED_REFERENCE_PANEL_LABEL,
    CURATED_REFERENCE_PANEL_CAPTION,
    CURATED_REFERENCE_CARD_PILL_TITLE,
  ].join(' ').toLowerCase();
  for (const word of forbidden) {
    assert.equal(haystack.includes(word.toLowerCase()), false, `Found forbidden term: ${word}`);
  }
});
