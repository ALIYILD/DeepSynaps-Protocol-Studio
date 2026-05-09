// tests for pages-conditions.js (Condition Backlog Tracker helpers)
// We test the module-internal helpers by extracting them from the built HTML
// output of stub condition data.  No real DOM needed for these tests.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// ── Stub globalThis.document before importing the module ────────────────────
// pages-conditions.js calls document.getElementById at runtime (inside event
// handlers, not at module scope) so we only need a minimal shim that prevents
// the import from throwing.
let savedDocument;
before(() => {
  savedDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => null,
    createElement: (tag) => ({ tag, href: '', download: '', click() {}, style: {} }),
    head: { appendChild() {} },
  };
  // localStorage shim (used by condition-packages.js helpers)
  if (!globalThis.localStorage) {
    globalThis.localStorage = {
      _store: {},
      getItem(k) { return this._store[k] ?? null; },
      setItem(k, v) { this._store[k] = v; },
      removeItem(k) { delete this._store[k]; },
    };
  }
  // URL.createObjectURL / revokeObjectURL used by _cbExportCSV
  globalThis.URL = globalThis.URL || {};
  globalThis.URL.createObjectURL = globalThis.URL.createObjectURL || (() => 'blob:mock');
  globalThis.URL.revokeObjectURL = globalThis.URL.revokeObjectURL || (() => {});
  globalThis.Blob = globalThis.Blob || class MockBlob { constructor(parts, opts) { this.parts = parts; this.type = opts?.type || ''; } };
});

after(() => {
  globalThis.document = savedDocument;
});

// Import after shims are in place
const {
  CONDITION_PACKAGES,
  PRIORITY_TIERS,
  STATUS_DIMENSIONS,
  calcCompletionPct,
  calcCompletionScore,
  getSummaryStats,
  getMergedStatus,
  getPackagesByTier,
  getPackagesByCategory,
} = await import('./condition-packages.js');

describe('CONDITION_PACKAGES registry', () => {
  it('contains at least 50 condition packages', () => {
    assert.ok(Array.isArray(CONDITION_PACKAGES));
    assert.ok(CONDITION_PACKAGES.length >= 50, `Expected ≥50 packages, got ${CONDITION_PACKAGES.length}`);
  });

  it('every package has required fields: id, label, tier, icd10, status', () => {
    for (const pkg of CONDITION_PACKAGES) {
      assert.ok(typeof pkg.id === 'string' && pkg.id.length > 0, `Missing id on ${JSON.stringify(pkg)}`);
      assert.ok(typeof pkg.label === 'string', `Missing label on ${pkg.id}`);
      assert.ok([1, 2, 3, 4].includes(pkg.tier), `Bad tier on ${pkg.id}: ${pkg.tier}`);
      assert.ok(typeof pkg.icd10 === 'string', `Missing icd10 on ${pkg.id}`);
      assert.ok(typeof pkg.status === 'object', `Missing status object on ${pkg.id}`);
    }
  });

  it('every package status has all 6 STATUS_DIMENSIONS keys', () => {
    const dimIds = STATUS_DIMENSIONS.map(d => d.id);
    for (const pkg of CONDITION_PACKAGES) {
      for (const dim of dimIds) {
        assert.ok(
          dim in pkg.status,
          `Package ${pkg.id} is missing status.${dim}`,
        );
      }
    }
  });
});

describe('PRIORITY_TIERS', () => {
  it('defines tiers 1–4 with label, color, and bg', () => {
    for (const tier of [1, 2, 3, 4]) {
      assert.ok(PRIORITY_TIERS[tier], `Missing tier ${tier}`);
      assert.ok(PRIORITY_TIERS[tier].label, `Tier ${tier} missing label`);
      assert.ok(PRIORITY_TIERS[tier].color, `Tier ${tier} missing color`);
      assert.ok(PRIORITY_TIERS[tier].bg, `Tier ${tier} missing bg`);
    }
  });

  it('Tier 1 is Core, Tier 4 is Research', () => {
    assert.strictEqual(PRIORITY_TIERS[1].label, 'Core');
    assert.strictEqual(PRIORITY_TIERS[4].label, 'Research');
  });
});

describe('calcCompletionPct', () => {
  it('returns 100 when all 6 dimensions are true', () => {
    const pkg = {
      status: { schema: true, protocols: true, assessments: true, handbook: true, patientView: true, qaComplete: true },
    };
    assert.strictEqual(calcCompletionPct(pkg), 100);
  });

  it('returns 0 when all dimensions are false', () => {
    const pkg = {
      status: { schema: false, protocols: false, assessments: false, handbook: false, patientView: false, qaComplete: false },
    };
    assert.strictEqual(calcCompletionPct(pkg), 0);
  });

  it('returns a value between 0 and 100 for partial status', () => {
    const pkg = {
      status: { schema: true, protocols: 'partial', assessments: false, handbook: false, patientView: false, qaComplete: false },
    };
    const pct = calcCompletionPct(pkg);
    assert.ok(pct > 0 && pct < 100, `Expected 0<pct<100, got ${pct}`);
  });
});

describe('getMergedStatus', () => {
  it('returns original status when overrides is empty', () => {
    const pkg = CONDITION_PACKAGES[0];
    const merged = getMergedStatus(pkg, {});
    // All dimension values should match original
    for (const dim of STATUS_DIMENSIONS.map(d => d.id)) {
      assert.strictEqual(merged[dim], pkg.status[dim]);
    }
  });

  it('applies a per-dimension override', () => {
    const pkg = CONDITION_PACKAGES[0];
    // Force schema to false even if original is true
    const overrides = { [pkg.id]: { schema: false } };
    const merged = getMergedStatus(pkg, overrides);
    assert.strictEqual(merged.schema, false);
  });
});

describe('getSummaryStats', () => {
  it('returns an object with total matching CONDITION_PACKAGES.length', () => {
    const stats = getSummaryStats();
    assert.strictEqual(stats.total, CONDITION_PACKAGES.length);
  });

  it('qaComplete count is between 0 and total', () => {
    const stats = getSummaryStats();
    assert.ok(stats.qaComplete >= 0, 'qaComplete must be ≥0');
    assert.ok(stats.qaComplete <= stats.total, 'qaComplete must be ≤total');
  });
});

describe('getPackagesByTier', () => {
  it('returns only packages with the matching tier number', () => {
    for (const tier of [1, 2, 3, 4]) {
      const pkgs = getPackagesByTier(tier);
      assert.ok(pkgs.every(p => p.tier === tier), `getPackagesByTier(${tier}) returned a package with wrong tier`);
    }
  });

  it('tier 1 packages exist (Core conditions)', () => {
    assert.ok(getPackagesByTier(1).length > 0, 'Expected at least one Tier-1 (Core) package');
  });
});

describe('getPackagesByCategory', () => {
  it('returns packages that share the given category', () => {
    const first = CONDITION_PACKAGES[0];
    const byCategory = getPackagesByCategory(first.category);
    assert.ok(byCategory.length >= 1);
    assert.ok(byCategory.every(p => p.category === first.category));
  });

  it('returns empty array for an unknown category', () => {
    const result = getPackagesByCategory('__nonexistent__');
    assert.deepStrictEqual(result, []);
  });
});

describe('pgConditionBacklog export', () => {
  it('is exported as an async function from pages-conditions.js', async () => {
    const mod = await import('./pages-conditions.js');
    assert.strictEqual(typeof mod.pgConditionBacklog, 'function');
    // Async function: calling it with a no-op setTopbar when document has no element should not throw
    let threw = false;
    try {
      await mod.pgConditionBacklog(() => {}, () => {});
    } catch {
      threw = true;
    }
    // Should not throw — it just silently returns if no DOM element exists
    assert.ok(!threw, 'pgConditionBacklog should not throw when no DOM element is present');
  });
});
