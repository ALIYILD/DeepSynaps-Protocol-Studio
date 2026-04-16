// Unit tests for the centralized scoring engine.
// Run via: npm test -- scoring-engine

import { describe, it, expect } from 'vitest';
import {
  SCORING_RULES,
  computeRawScore,
  interpretScore,
  interpretSubscale,
  scoreAssessment,
  highestSafety,
  classifyTrend,
  normalizeScaleId,
  getScoringRule,
} from './scoring-engine.js';

describe('scoring-engine: normalizeScaleId', () => {
  it('canonicalizes common aliases', () => {
    expect(normalizeScaleId('phq9')).toBe('PHQ-9');
    expect(normalizeScaleId('PHQ-9')).toBe('PHQ-9');
    expect(normalizeScaleId('gad7')).toBe('GAD-7');
    expect(normalizeScaleId('PCL5')).toBe('PCL-5');
    expect(normalizeScaleId('DASS21')).toBe('DASS-21');
  });

  it('returns empty string for null input', () => {
    expect(normalizeScaleId(null)).toBe('');
    expect(normalizeScaleId(undefined)).toBe('');
  });
});

describe('scoring-engine: PHQ-9', () => {
  it('sums a complete assessment correctly', () => {
    const values = [1, 2, 1, 0, 2, 1, 0, 1, 0];  // sum = 8
    const result = computeRawScore('PHQ-9', values);
    expect(result.complete).toBe(true);
    expect(result.raw).toBe(8);
    expect(result.missingItems).toEqual([]);
  });

  it('interprets a score of 8 as mild', () => {
    const interp = interpretScore('PHQ-9', 8);
    expect(interp.label).toBe('Mild');
    expect(interp.severity).toBe('mild');
  });

  it('interprets a score of 15 as moderately severe', () => {
    const interp = interpretScore('PHQ-9', 15);
    expect(interp.label).toBe('Moderately Severe');
    expect(interp.severity).toBe('severe');
  });

  it('flags item 9 when ≥ 1 (suicidal ideation)', () => {
    const values = [0, 0, 0, 0, 0, 0, 0, 0, 1];
    const result = scoreAssessment('PHQ-9', values);
    expect(result.safety.length).toBe(1);
    expect(result.safety[0].severity).toBe('warn');
    expect(result.safety[0].message).toMatch(/self-harm/i);
  });

  it('escalates item 9 to critical when ≥ 2', () => {
    const values = [1, 1, 1, 1, 1, 1, 1, 1, 3];
    const result = scoreAssessment('PHQ-9', values);
    expect(result.safety[0].severity).toBe('critical');
  });

  it('marks incomplete when an item is missing', () => {
    const values = [1, 1, null, 1, 1, 1, 1, 1, 1];
    const result = computeRawScore('PHQ-9', values);
    expect(result.complete).toBe(false);
    expect(result.missingItems).toContain(3);
    expect(result.raw).toBeNull();
  });

  it('clamps out-of-range values to [0,3]', () => {
    const values = [5, -1, 1, 1, 1, 1, 1, 1, 1];
    const result = computeRawScore('PHQ-9', values);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    // clamped 5→3, -1→0
    expect(result.raw).toBe(3 + 0 + 1 + 1 + 1 + 1 + 1 + 1 + 1);
  });
});

describe('scoring-engine: GAD-7', () => {
  it('totals 7 ones = 7 (mild)', () => {
    const result = scoreAssessment('GAD-7', [1, 1, 1, 1, 1, 1, 1]);
    expect(result.raw).toBe(7);
    expect(result.interpretation.severity).toBe('mild');
  });

  it('totals 21 = severe', () => {
    const result = scoreAssessment('GAD-7', [3, 3, 3, 3, 3, 3, 3]);
    expect(result.raw).toBe(21);
    expect(result.interpretation.severity).toBe('severe');
  });
});

describe('scoring-engine: DASS-21 subscales', () => {
  it('computes three subscale sums with x2 multiplier', () => {
    // Construct: depression items (3,5,10,13,16,17,21) = all 1s → sum 7 × 2 = 14
    // anxiety items (2,4,7,9,15,19,20) = all 2s → sum 14 × 2 = 28
    // stress items (1,6,8,11,12,14,18) = all 1s → sum 7 × 2 = 14
    const v = new Array(21).fill(0);
    // depression items
    [3, 5, 10, 13, 16, 17, 21].forEach((i) => { v[i - 1] = 1; });
    [2, 4, 7, 9, 15, 19, 20].forEach((i) => { v[i - 1] = 2; });
    [1, 6, 8, 11, 12, 14, 18].forEach((i) => { v[i - 1] = 1; });
    const result = scoreAssessment('DASS-21', v);
    expect(result.subscales.depression).toBe(14);
    expect(result.subscales.anxiety).toBe(28);
    expect(result.subscales.stress).toBe(14);
    // Interpretations per DASS-21 manual
    expect(interpretSubscale('DASS-21', 'depression', 14).label).toBe('Moderate');
    expect(interpretSubscale('DASS-21', 'anxiety', 28).severity).toBe('critical');
    expect(interpretSubscale('DASS-21', 'stress', 14).label).toBe('Normal');
  });
});

describe('scoring-engine: PCL-5 cluster subscales', () => {
  it('computes four cluster subscales and total', () => {
    const values = new Array(20).fill(2);  // all twos → 40 total
    const result = scoreAssessment('PCL-5', values);
    expect(result.raw).toBe(40);
    expect(result.subscales.intrusion).toBe(10);   // 5 × 2
    expect(result.subscales.avoidance).toBe(4);    // 2 × 2
    expect(result.subscales.cognitions_mood).toBe(14);  // 7 × 2
    expect(result.subscales.arousal).toBe(12);     // 6 × 2
    expect(result.interpretation.severity).toBe('severe');
  });
});

describe('scoring-engine: C-SSRS safety', () => {
  it('score 0 → no ideation', () => {
    const r = scoreAssessment('C-SSRS', [0]);
    expect(r.interpretation.label).toBe('No Ideation');
    expect(r.safety.length).toBe(0);
  });

  it('score 3 → active ideation (warn)', () => {
    const r = scoreAssessment('C-SSRS', [3]);
    expect(r.safety[0].severity).toBe('warn');
    expect(r.interpretation.severity).toBe('severe');
  });

  it('score 5 → behavior (critical)', () => {
    const r = scoreAssessment('C-SSRS', [5]);
    expect(r.safety[0].severity).toBe('critical');
    expect(r.interpretation.severity).toBe('critical');
  });
});

describe('scoring-engine: licensing metadata', () => {
  it('marks PHQ-9 as public domain', () => {
    expect(SCORING_RULES['PHQ-9'].licensing).toBe('public_domain');
  });

  it('marks ISI as licensed', () => {
    expect(SCORING_RULES['ISI'].licensing).toBe('licensed');
  });

  it('marks C-SSRS as restricted', () => {
    expect(SCORING_RULES['C-SSRS'].licensing).toBe('restricted');
  });
});

describe('scoring-engine: classifyTrend', () => {
  it('50%+ reduction from baseline is remission', () => {
    expect(classifyTrend('PHQ-9', [20, 8])).toBe('remission');
  });
  it('20-50% reduction is improving', () => {
    expect(classifyTrend('PHQ-9', [20, 15])).toBe('improving');
  });
  it('worsening when score grows', () => {
    expect(classifyTrend('PHQ-9', [10, 18])).toBe('worsening');
  });
  it('single point is insufficient_data', () => {
    expect(classifyTrend('PHQ-9', [10])).toBe('insufficient_data');
  });
});

describe('scoring-engine: highestSafety', () => {
  it('returns the most severe flag from a result set', () => {
    const r = {
      safety: [
        { severity: 'warn', message: 'a' },
        { severity: 'critical', message: 'b' },
        { severity: 'info', message: 'c' },
      ],
    };
    expect(highestSafety(r).severity).toBe('critical');
    expect(highestSafety(r).message).toBe('b');
  });

  it('returns null when there are no flags', () => {
    expect(highestSafety({ safety: [] })).toBeNull();
  });
});

describe('scoring-engine: unknown scale', () => {
  it('returns a null raw with a warning', () => {
    const r = computeRawScore('NOT-A-REAL-SCALE', [1, 2, 3]);
    expect(r.raw).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('getScoringRule returns null', () => {
    expect(getScoringRule('FAKE')).toBeNull();
  });
});
