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
