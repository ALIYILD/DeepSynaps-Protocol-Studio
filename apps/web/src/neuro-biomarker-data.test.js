// Tests for neuro-biomarker-data.js
// Pins: data-only module structure, required clinical metadata fields, caveats
// present, evidence refs, conditions arrays, and interventions arrays.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NEURO_BIOMARKER_REFERENCE } from './neuro-biomarker-data.js';

describe('NEURO_BIOMARKER_REFERENCE top-level structure', () => {
  it('exports an array of category groups', () => {
    assert.ok(Array.isArray(NEURO_BIOMARKER_REFERENCE), 'must be an array');
    assert.ok(NEURO_BIOMARKER_REFERENCE.length > 0, 'must be non-empty');
  });

  it('every category has id, title, tone, and markers array', () => {
    for (const cat of NEURO_BIOMARKER_REFERENCE) {
      assert.ok(typeof cat.id === 'string' && cat.id.length > 0, `category.id must be a string: ${JSON.stringify(cat.id)}`);
      assert.ok(typeof cat.title === 'string' && cat.title.length > 0, `category.title required: ${cat.id}`);
      assert.ok(typeof cat.tone === 'string' && cat.tone.startsWith('#'), `category.tone must be a hex color: ${cat.id}`);
      assert.ok(Array.isArray(cat.markers) && cat.markers.length > 0, `category.markers must be non-empty: ${cat.id}`);
    }
  });

  it('every marker has the required clinical metadata fields', () => {
    const REQUIRED = ['id', 'name', 'notation', 'measures', 'site', 'refRange', 'acquisition', 'elevated', 'reduced'];
    for (const cat of NEURO_BIOMARKER_REFERENCE) {
      for (const m of cat.markers) {
        for (const field of REQUIRED) {
          assert.ok(
            typeof m[field] === 'string' && m[field].length > 0,
            `marker ${m.id || '?'} (in ${cat.id}) missing required field: ${field}`,
          );
        }
      }
    }
  });

  it('every marker has at least one caveat (clinical safety)', () => {
    for (const cat of NEURO_BIOMARKER_REFERENCE) {
      for (const m of cat.markers) {
        assert.ok(
          Array.isArray(m.caveats) && m.caveats.length > 0,
          `marker ${m.id} must have at least one caveat`,
        );
      }
    }
  });

  it('every marker has at least one condition and one intervention', () => {
    for (const cat of NEURO_BIOMARKER_REFERENCE) {
      for (const m of cat.markers) {
        assert.ok(
          Array.isArray(m.conditions) && m.conditions.length > 0,
          `marker ${m.id} must have at least one condition`,
        );
        assert.ok(
          Array.isArray(m.interventions) && m.interventions.length > 0,
          `marker ${m.id} must have at least one intervention`,
        );
      }
    }
  });

  it('every marker has an evidence field with a ref count string', () => {
    for (const cat of NEURO_BIOMARKER_REFERENCE) {
      for (const m of cat.markers) {
        assert.ok(
          typeof m.evidence === 'string' && /\d+/.test(m.evidence),
          `marker ${m.id} evidence must be a string containing a number`,
        );
      }
    }
  });
});

describe('NEURO_BIOMARKER_REFERENCE known categories present', () => {
  it('includes spectral-asymmetry category with FAA marker', () => {
    const sa = NEURO_BIOMARKER_REFERENCE.find((c) => c.id === 'spectral-asymmetry');
    assert.ok(sa, 'spectral-asymmetry category must exist');
    const faa = sa.markers.find((m) => m.id === 'faa');
    assert.ok(faa, 'FAA marker must exist');
    assert.ok(faa.measures.toLowerCase().includes('hemispheric'), 'FAA measures should describe hemispheric balance');
  });

  it('includes network-connectivity category', () => {
    const nc = NEURO_BIOMARKER_REFERENCE.find((c) => c.id === 'network-connectivity');
    assert.ok(nc, 'network-connectivity category must exist');
  });

  it('includes erp category with P300 amplitude and latency markers', () => {
    const erp = NEURO_BIOMARKER_REFERENCE.find((c) => c.id === 'erp');
    assert.ok(erp, 'erp category must exist');
    const p300a = erp.markers.find((m) => m.id === 'p300-amp');
    const p300l = erp.markers.find((m) => m.id === 'p300-lat');
    assert.ok(p300a, 'P300 amplitude marker must exist');
    assert.ok(p300l, 'P300 latency marker must exist');
  });

  it('includes autonomic-cardiac category with RMSSD and SDNN', () => {
    const ac = NEURO_BIOMARKER_REFERENCE.find((c) => c.id === 'autonomic-cardiac');
    assert.ok(ac, 'autonomic-cardiac category must exist');
    assert.ok(ac.markers.find((m) => m.id === 'rmssd'), 'RMSSD must be present');
    assert.ok(ac.markers.find((m) => m.id === 'sdnn'), 'SDNN must be present');
  });

  it('all marker ids are unique across the entire reference', () => {
    const ids = NEURO_BIOMARKER_REFERENCE.flatMap((c) => c.markers.map((m) => m.id));
    const unique = new Set(ids);
    assert.strictEqual(ids.length, unique.size, 'all marker ids must be globally unique');
  });
});
