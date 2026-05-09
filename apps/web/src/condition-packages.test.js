// Tests for condition-packages.js
// Pins: PRIORITY_TIERS, STATUS_DIMENSIONS, CONDITION_PACKAGES data integrity,
// PACKAGES_BY_ID lookup, and all exported helper functions.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  PRIORITY_TIERS,
  STATUS_DIMENSIONS,
  CONDITION_PACKAGES,
  PACKAGES_BY_ID,
  getPackagesByTier,
  getPackagesByCategory,
  getPackageStatus,
  calcCompletionScore,
  calcCompletionPct,
  getSummaryStats,
  getMergedStatus,
} from './condition-packages.js';

describe('condition-packages — PRIORITY_TIERS', () => {
  it('has exactly 4 tiers (1–4)', () => {
    assert.deepStrictEqual(Object.keys(PRIORITY_TIERS).map(Number).sort((a, b) => a - b), [1, 2, 3, 4]);
  });

  it('tier 1 label is Core and color is the red hex', () => {
    assert.strictEqual(PRIORITY_TIERS[1].label, 'Core');
    assert.strictEqual(PRIORITY_TIERS[1].color, '#ef4444');
  });

  it('tier 4 label is Research', () => {
    assert.strictEqual(PRIORITY_TIERS[4].label, 'Research');
  });
});

describe('condition-packages — STATUS_DIMENSIONS', () => {
  it('has exactly 6 dimensions', () => {
    assert.strictEqual(STATUS_DIMENSIONS.length, 6);
  });

  it('dimension ids are the canonical six', () => {
    const ids = STATUS_DIMENSIONS.map(d => d.id);
    assert.deepStrictEqual(ids, ['schema', 'protocols', 'assessments', 'handbook', 'patientView', 'qaComplete']);
  });
});

describe('condition-packages — CONDITION_PACKAGES integrity', () => {
  it('contains 54 conditions', () => {
    assert.strictEqual(CONDITION_PACKAGES.length, 54);
  });

  it('every package has required fields: id, label, tier, status', () => {
    for (const pkg of CONDITION_PACKAGES) {
      assert.ok(typeof pkg.id === 'string' && pkg.id.length > 0, `id missing: ${JSON.stringify(pkg)}`);
      assert.ok(typeof pkg.label === 'string' && pkg.label.length > 0, `label missing: ${pkg.id}`);
      assert.ok(typeof pkg.tier === 'number', `tier missing: ${pkg.id}`);
      assert.ok(pkg.status && typeof pkg.status === 'object', `status missing: ${pkg.id}`);
    }
  });

  it('every tier value is 1–4', () => {
    for (const pkg of CONDITION_PACKAGES) {
      assert.ok([1, 2, 3, 4].includes(pkg.tier), `unexpected tier ${pkg.tier} on ${pkg.id}`);
    }
  });

  it('MDD has 9 protocols and is tier 1', () => {
    const mdd = CONDITION_PACKAGES.find(p => p.id === 'major-depressive-disorder');
    assert.ok(mdd);
    assert.strictEqual(mdd.tier, 1);
    assert.strictEqual(mdd.protocols.length, 9);
  });

  it('ADHD-Combined is the only fully qaComplete=true package in tier 1 list alongside ADHD-Inattentive', () => {
    const adhdc = CONDITION_PACKAGES.find(p => p.id === 'adhd-combined');
    const adhi  = CONDITION_PACKAGES.find(p => p.id === 'adhd-inattentive');
    assert.strictEqual(adhdc.status.qaComplete, true);
    assert.strictEqual(adhi.status.qaComplete, true);
    assert.strictEqual(adhdc.status.patientView, true);
  });

  it('ids are all unique', () => {
    const ids = CONDITION_PACKAGES.map(p => p.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });
});

describe('condition-packages — PACKAGES_BY_ID', () => {
  it('keys count equals CONDITION_PACKAGES length', () => {
    assert.strictEqual(Object.keys(PACKAGES_BY_ID).length, CONDITION_PACKAGES.length);
  });

  it('looks up ocd correctly', () => {
    const ocd = PACKAGES_BY_ID['ocd'];
    assert.ok(ocd);
    assert.strictEqual(ocd.icd10, 'F42');
  });
});

describe('condition-packages — getPackagesByTier', () => {
  it('tier 1 returns 10 packages', () => {
    assert.strictEqual(getPackagesByTier(1).length, 10);
  });

  it('tier 4 returns only tier-4 entries', () => {
    const t4 = getPackagesByTier(4);
    assert.ok(t4.length > 0);
    assert.ok(t4.every(p => p.tier === 4));
  });
});

describe('condition-packages — getPackagesByCategory', () => {
  it('Depressive Disorders contains MDD', () => {
    const dd = getPackagesByCategory('Depressive Disorders');
    assert.ok(dd.some(p => p.id === 'major-depressive-disorder'));
  });

  it('unknown category returns empty array', () => {
    assert.deepStrictEqual(getPackagesByCategory('Not A Category'), []);
  });
});

describe('condition-packages — getPackageStatus', () => {
  it('returns status for insomnia', () => {
    const s = getPackageStatus('insomnia');
    assert.ok(s);
    assert.strictEqual(s.schema, true);
  });

  it('returns null for unknown id', () => {
    assert.strictEqual(getPackageStatus('does-not-exist'), null);
  });
});

describe('condition-packages — calcCompletionScore', () => {
  it('ADHD-Combined (all true) scores 6 out of 6', () => {
    const pkg = PACKAGES_BY_ID['adhd-combined'];
    assert.strictEqual(calcCompletionScore(pkg), 6);
  });

  it('partial status contributes 0.5', () => {
    // MDD: schema=true, protocols=true, assessments=true, handbook=true, patientView='partial', qaComplete=false
    const pkg = PACKAGES_BY_ID['major-depressive-disorder'];
    // expected: 4 × 1 + 1 × 0.5 + 0 = 4.5
    assert.strictEqual(calcCompletionScore(pkg), 4.5);
  });

  it('score is 0 for a synthesised all-false package', () => {
    const fake = { status: { schema: false, protocols: false, assessments: false, handbook: false, patientView: false, qaComplete: false } };
    assert.strictEqual(calcCompletionScore(fake), 0);
  });
});

describe('condition-packages — calcCompletionPct', () => {
  it('returns 100 for ADHD-Combined', () => {
    assert.strictEqual(calcCompletionPct(PACKAGES_BY_ID['adhd-combined']), 100);
  });

  it('result is in range 0–100', () => {
    for (const pkg of CONDITION_PACKAGES) {
      const pct = calcCompletionPct(pkg);
      assert.ok(pct >= 0 && pct <= 100, `out of range: ${pkg.id} → ${pct}`);
    }
  });
});

describe('condition-packages — getSummaryStats', () => {
  it('total equals CONDITION_PACKAGES length', () => {
    const s = getSummaryStats();
    assert.strictEqual(s.total, CONDITION_PACKAGES.length);
  });

  it('qaComplete count is exactly 2 (ADHD-C and ADHD-I)', () => {
    const s = getSummaryStats();
    assert.strictEqual(s.qaComplete, 2);
  });

  it('schemaReady equals total (every package has schema=true)', () => {
    const s = getSummaryStats();
    assert.strictEqual(s.schemaReady, s.total);
  });
});

describe('condition-packages — getMergedStatus', () => {
  it('overrides win over base status', () => {
    const pkg = PACKAGES_BY_ID['major-depressive-disorder'];
    const overrides = { 'major-depressive-disorder': { qaComplete: true } };
    const merged = getMergedStatus(pkg, overrides);
    assert.strictEqual(merged.qaComplete, true);
    assert.strictEqual(merged.schema, true); // untouched
  });

  it('empty overrides returns original status unchanged', () => {
    const pkg = PACKAGES_BY_ID['ocd'];
    const merged = getMergedStatus(pkg, {});
    assert.deepStrictEqual(merged, pkg.status);
  });
});
