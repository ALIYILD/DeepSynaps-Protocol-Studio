// ─────────────────────────────────────────────────────────────────────────────
// evidence-dataset.test.js — Wave-3 large-file pin (PR 74/N)
//
// Pins public exports of evidence-dataset.js:
//   * Version / total constants
//   * CONDITION_EVIDENCE shape and provenance
//   * EVIDENCE_SUMMARY aggregates
//   * getConditionEvidence, getTopConditionsByPaperCount,
//     searchEvidenceByKeyword, getEvidenceByCategory
//   * Safety: no unverified citations surfaced (recentHighImpact stripped)
//   * Wording: "decision-support, not diagnostic" (no fake-value language)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVIDENCE_DATASET_VERSION,
  EVIDENCE_TOTAL_PAPERS,
  EVIDENCE_TOTAL_TRIALS,
  EVIDENCE_TOTAL_META,
  EVIDENCE_SOURCES,
  CONDITION_EVIDENCE,
  EVIDENCE_SUMMARY,
  getConditionEvidence,
  getTopConditionsByPaperCount,
  searchEvidenceByKeyword,
  getEvidenceByCategory,
} from './evidence-dataset.js';

describe('evidence-dataset — module constants', () => {
  it('EVIDENCE_DATASET_VERSION is a date-like string', () => {
    assert.ok(typeof EVIDENCE_DATASET_VERSION === 'string');
    assert.ok(/\d{4}-\d{2}-\d{2}/.test(EVIDENCE_DATASET_VERSION));
  });

  it('EVIDENCE_TOTAL_PAPERS is a large positive integer', () => {
    assert.ok(Number.isInteger(EVIDENCE_TOTAL_PAPERS));
    assert.ok(EVIDENCE_TOTAL_PAPERS > 100000, `expected > 100 000, got ${EVIDENCE_TOTAL_PAPERS}`);
  });

  it('EVIDENCE_TOTAL_TRIALS is positive', () => {
    assert.ok(Number.isInteger(EVIDENCE_TOTAL_TRIALS));
    assert.ok(EVIDENCE_TOTAL_TRIALS > 0);
  });

  it('EVIDENCE_TOTAL_META is positive', () => {
    assert.ok(Number.isInteger(EVIDENCE_TOTAL_META));
    assert.ok(EVIDENCE_TOTAL_META > 0);
  });

  it('EVIDENCE_SOURCES contains at least PubMed and Cochrane', () => {
    assert.ok(Array.isArray(EVIDENCE_SOURCES));
    assert.ok(EVIDENCE_SOURCES.includes('PubMed'));
    assert.ok(EVIDENCE_SOURCES.includes('Cochrane'));
  });
});

describe('evidence-dataset — CONDITION_EVIDENCE shape', () => {
  it('is a non-empty array', () => {
    assert.ok(Array.isArray(CONDITION_EVIDENCE));
    assert.ok(CONDITION_EVIDENCE.length >= 30, `expected >= 30 conditions, got ${CONDITION_EVIDENCE.length}`);
  });

  it('every entry has conditionId, paperCount, rctCount, metaAnalysisCount, trialCount', () => {
    for (const row of CONDITION_EVIDENCE) {
      assert.ok(typeof row.conditionId === 'string' && row.conditionId.length > 0,
        `missing conditionId on row: ${JSON.stringify(row).slice(0, 80)}`);
      assert.ok(Number.isInteger(row.paperCount) && row.paperCount > 0,
        `invalid paperCount on ${row.conditionId}`);
      assert.ok(Number.isInteger(row.rctCount),
        `missing rctCount on ${row.conditionId}`);
      assert.ok(Number.isInteger(row.metaAnalysisCount),
        `missing metaAnalysisCount on ${row.conditionId}`);
      assert.ok(Number.isInteger(row.trialCount),
        `missing trialCount on ${row.conditionId}`);
    }
  });

  it('no conditionId is duplicated', () => {
    const ids = CONDITION_EVIDENCE.map((r) => r.conditionId);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length, 'duplicate conditionId detected');
  });

  it('recentHighImpact is stripped (empty arrays) — no unverified citations', () => {
    for (const row of CONDITION_EVIDENCE) {
      assert.ok(!Array.isArray(row.recentHighImpact) || row.recentHighImpact.length === 0,
        `recentHighImpact must be empty on ${row.conditionId} — unverified citations must not surface`);
    }
  });

  it('rctCount <= paperCount for all conditions', () => {
    for (const row of CONDITION_EVIDENCE) {
      assert.ok(row.rctCount <= row.paperCount,
        `rctCount (${row.rctCount}) > paperCount (${row.paperCount}) on ${row.conditionId}`);
    }
  });

  it('includes major-depressive-disorder with substantial RCT base', () => {
    const mdd = CONDITION_EVIDENCE.find((r) => r.conditionId === 'major-depressive-disorder');
    assert.ok(mdd, 'MDD entry missing');
    assert.ok(mdd.rctCount >= 100, `expected >= 100 RCTs for MDD, got ${mdd.rctCount}`);
  });
});

describe('evidence-dataset — EVIDENCE_SUMMARY', () => {
  it('totalPapers matches EVIDENCE_TOTAL_PAPERS', () => {
    assert.strictEqual(EVIDENCE_SUMMARY.totalPapers, EVIDENCE_TOTAL_PAPERS);
  });

  it('totalConditions is a positive integer', () => {
    assert.ok(Number.isInteger(EVIDENCE_SUMMARY.totalConditions));
    assert.ok(EVIDENCE_SUMMARY.totalConditions > 0);
  });

  it('gradeDistribution has keys A through E with positive values', () => {
    const grades = EVIDENCE_SUMMARY.gradeDistribution;
    for (const g of ['A', 'B', 'C', 'D', 'E']) {
      assert.ok(Number.isInteger(grades[g]) && grades[g] > 0,
        `grade ${g} missing or zero`);
    }
  });

  it('modalityDistribution includes TMS / rTMS and tDCS', () => {
    const md = EVIDENCE_SUMMARY.modalityDistribution;
    assert.ok(md['TMS / rTMS'] > 0);
    assert.ok(md['tDCS'] > 0);
  });

  it('topPublishingJournals is an empty array (no fake rankings)', () => {
    assert.ok(Array.isArray(EVIDENCE_SUMMARY.topPublishingJournals));
    assert.strictEqual(EVIDENCE_SUMMARY.topPublishingJournals.length, 0,
      'topPublishingJournals must be empty — no static fake journal rankings');
  });
});

describe('getConditionEvidence', () => {
  it('returns the correct row for a known conditionId', () => {
    const row = getConditionEvidence('ptsd');
    assert.ok(row, 'expected ptsd row');
    assert.strictEqual(row.conditionId, 'ptsd');
  });

  it('returns null for unknown conditionId', () => {
    assert.strictEqual(getConditionEvidence('totally-unknown-xyz'), null);
  });

  it('returns null for empty string', () => {
    assert.strictEqual(getConditionEvidence(''), null);
  });
});

describe('getTopConditionsByPaperCount', () => {
  it('returns at most limit entries', () => {
    const top5 = getTopConditionsByPaperCount(5);
    assert.strictEqual(top5.length, 5);
  });

  it('returns sorted descending by paperCount', () => {
    const top = getTopConditionsByPaperCount(10);
    for (let i = 1; i < top.length; i++) {
      assert.ok(top[i - 1].paperCount >= top[i].paperCount,
        `order broken at index ${i}: ${top[i-1].paperCount} < ${top[i].paperCount}`);
    }
  });

  it('default limit is 10', () => {
    const top = getTopConditionsByPaperCount();
    assert.strictEqual(top.length, 10);
  });

  it('does not mutate CONDITION_EVIDENCE order', () => {
    const originalFirst = CONDITION_EVIDENCE[0].conditionId;
    getTopConditionsByPaperCount(5);
    assert.strictEqual(CONDITION_EVIDENCE[0].conditionId, originalFirst);
  });
});

describe('searchEvidenceByKeyword', () => {
  it('returns empty array for empty query', () => {
    assert.deepStrictEqual(searchEvidenceByKeyword(''), []);
  });

  it('returns empty array for null query', () => {
    assert.deepStrictEqual(searchEvidenceByKeyword(null), []);
  });

  it('returns empty array when recentHighImpact is stripped', () => {
    // After the strip loop, all recentHighImpact arrays are empty
    // so keyword search across them should always return []
    const results = searchEvidenceByKeyword('depression');
    assert.ok(Array.isArray(results));
    assert.strictEqual(results.length, 0,
      'searchEvidenceByKeyword must return [] when recentHighImpact is stripped — no unverified citations');
  });
});

describe('getEvidenceByCategory', () => {
  it('returns an object with conditionId keys', () => {
    const cats = getEvidenceByCategory();
    assert.ok(typeof cats === 'object');
    assert.ok(Object.keys(cats).length > 0);
  });

  it('each category has paperCount, rctCount, conditions >= 1', () => {
    const cats = getEvidenceByCategory();
    for (const [id, cat] of Object.entries(cats)) {
      assert.ok(Number.isInteger(cat.paperCount) && cat.paperCount > 0,
        `invalid paperCount in category ${id}`);
      assert.ok(Number.isInteger(cat.conditions) && cat.conditions >= 1,
        `conditions must be >= 1 in category ${id}`);
    }
  });
});
