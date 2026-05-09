// Tests for qeeg-dk-atlas.js — Desikan-Killiany 68-ROI atlas helpers
// Pins: DK_LOBES export, DK_LOBE_MAP coverage, lobeOf(), hemisphereOf(),
//       formatDKLabel(), groupROIsByLobe() shape and sorting.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DK_LOBES,
  DK_LOBE_MAP,
  formatDKLabel,
  hemisphereOf,
  lobeOf,
  groupROIsByLobe,
} from './qeeg-dk-atlas.js';

describe('DK_LOBES', () => {
  it('exports the 6 standard lobe names', () => {
    assert.deepStrictEqual(DK_LOBES, ['frontal', 'parietal', 'temporal', 'occipital', 'cingulate', 'insular']);
  });
});

describe('DK_LOBE_MAP', () => {
  it('contains exactly 34 entries (one per label, not per hemisphere)', () => {
    // 11 frontal + 5 parietal + 9 temporal + 4 occipital + 4 cingulate + 1 insular = 34
    assert.strictEqual(Object.keys(DK_LOBE_MAP).length, 34);
  });

  it('maps "superiorfrontal" to "frontal"', () => {
    assert.strictEqual(DK_LOBE_MAP['superiorfrontal'], 'frontal');
  });

  it('maps "superiorparietal" to "parietal"', () => {
    assert.strictEqual(DK_LOBE_MAP['superiorparietal'], 'parietal');
  });

  it('maps "superiortemporal" to "temporal"', () => {
    assert.strictEqual(DK_LOBE_MAP['superiortemporal'], 'temporal');
  });

  it('maps "lateraloccipital" to "occipital"', () => {
    assert.strictEqual(DK_LOBE_MAP['lateraloccipital'], 'occipital');
  });

  it('maps "rostralanteriorcingulate" to "cingulate"', () => {
    assert.strictEqual(DK_LOBE_MAP['rostralanteriorcingulate'], 'cingulate');
  });

  it('maps "insula" to "insular"', () => {
    assert.strictEqual(DK_LOBE_MAP['insula'], 'insular');
  });
});

describe('lobeOf()', () => {
  it('returns the correct lobe for a bare key', () => {
    assert.strictEqual(lobeOf('precentral'), 'frontal');
  });

  it('strips "lh." prefix before lookup', () => {
    assert.strictEqual(lobeOf('lh.precentral'), 'frontal');
  });

  it('strips "rh." prefix before lookup', () => {
    assert.strictEqual(lobeOf('rh.inferiortemporal'), 'temporal');
  });

  it('strips "left-" prefix before lookup', () => {
    assert.strictEqual(lobeOf('left-insula'), 'insular');
  });

  it('strips "right_" prefix before lookup', () => {
    assert.strictEqual(lobeOf('right_cuneus'), 'occipital');
  });

  it('returns "other" for a label not in DK_LOBE_MAP', () => {
    assert.strictEqual(lobeOf('unknownregion'), 'other');
  });

  it('returns "other" for null/undefined input', () => {
    assert.strictEqual(lobeOf(null), 'other');
    assert.strictEqual(lobeOf(undefined), 'other');
  });
});

describe('hemisphereOf()', () => {
  it('returns "lh" for "lh.superiorfrontal"', () => {
    assert.strictEqual(hemisphereOf('lh.superiorfrontal'), 'lh');
  });

  it('returns "rh" for "rh-insula"', () => {
    assert.strictEqual(hemisphereOf('rh-insula'), 'rh');
  });

  it('returns "lh" for "left_precentral"', () => {
    assert.strictEqual(hemisphereOf('left_precentral'), 'lh');
  });

  it('returns "rh" for "right.cuneus"', () => {
    assert.strictEqual(hemisphereOf('right.cuneus'), 'rh');
  });

  it('returns "" for a bare label with no prefix', () => {
    assert.strictEqual(hemisphereOf('precentral'), '');
  });

  it('returns "" for null input', () => {
    assert.strictEqual(hemisphereOf(null), '');
  });
});

describe('formatDKLabel()', () => {
  it('returns empty string for null input', () => {
    assert.strictEqual(formatDKLabel(null), '');
  });

  it('strips "lh." prefix and title-cases the result', () => {
    const result = formatDKLabel('lh.superiorfrontal');
    assert.strictEqual(result, 'Superiorfrontal');
  });

  it('converts hyphens to spaces', () => {
    const result = formatDKLabel('lh-precentral');
    assert.ok(result.includes(' ') || result === 'Precentral', 'hyphens should become spaces');
  });

  it('title-cases a bare all-lowercase key', () => {
    const result = formatDKLabel('insula');
    assert.strictEqual(result[0], result[0].toUpperCase(), 'first letter must be uppercase');
  });

  it('handles CamelCase keys by inserting spaces', () => {
    const result = formatDKLabel('superiorFrontal');
    assert.ok(result.includes(' '), 'expected space inserted before internal capital');
  });
});

describe('groupROIsByLobe()', () => {
  it('returns all 6 DK lobe keys plus "other" when roiMap is empty', () => {
    const out = groupROIsByLobe({});
    for (const lobe of DK_LOBES) {
      assert.ok(Object.prototype.hasOwnProperty.call(out, lobe), `expected lobe "${lobe}" in output`);
    }
    assert.ok(Object.prototype.hasOwnProperty.call(out, 'other'), 'expected "other" key');
  });

  it('returns empty arrays for all lobes when roiMap is null', () => {
    const out = groupROIsByLobe(null);
    for (const lobe of DK_LOBES) {
      assert.deepStrictEqual(out[lobe], [], `expected empty array for lobe "${lobe}"`);
    }
  });

  it('places a known ROI in the correct lobe bucket', () => {
    const out = groupROIsByLobe({ 'lh.precentral': 0.8, 'rh.insula': 0.5 });
    const frontals = out.frontal;
    assert.ok(frontals.some(r => r.key === 'lh.precentral'), 'lh.precentral must go into frontal');
    const insulars = out.insular;
    assert.ok(insulars.some(r => r.key === 'rh.insula'), 'rh.insula must go into insular');
  });

  it('places an unknown ROI in the "other" bucket', () => {
    const out = groupROIsByLobe({ 'unknown_roi': 0.3 });
    assert.ok(out.other.some(r => r.key === 'unknown_roi'), 'unknown ROI must go into "other"');
  });

  it('populates each entry with key, label, hemi, and value fields', () => {
    const out = groupROIsByLobe({ 'lh.precentral': 1.23 });
    const entry = out.frontal[0];
    assert.ok(entry, 'expected at least one frontal entry');
    assert.strictEqual(entry.key, 'lh.precentral');
    assert.strictEqual(typeof entry.label, 'string');
    assert.strictEqual(entry.hemi, 'lh');
    assert.strictEqual(entry.value, 1.23);
  });

  it('sorts each lobe bucket by value descending', () => {
    const out = groupROIsByLobe({
      'lh.superiorfrontal': 0.2,
      'rh.superiorfrontal': 0.9,
      'lh.precentral': 0.5,
    });
    const values = out.frontal.map(r => r.value);
    for (let i = 1; i < values.length; i++) {
      assert.ok(values[i - 1] >= values[i], 'frontal bucket must be sorted descending by value');
    }
  });
});
