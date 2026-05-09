// tests for assessment-forms.js
// Pins the clinical correctness of severity bands, question counts,
// max-score values, safety-critical flags, and the SCALE_TO_FORM_KEY registry.
// No DOM required.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ASSESSMENT_FORMS,
  SUPPORTED_FORMS,
  SCALE_TO_FORM_KEY,
  getAssessmentConfig,
} from './assessment-forms.js';

// ── Registry completeness ─────────────────────────────────────────────────────

describe('ASSESSMENT_FORMS registry', () => {
  it('contains all 12 expected scales', () => {
    const expected = ['phq9','gad7','phq2','gad2','pcl5','isi','dass21','madrs','hdrs','bprs','ymrs','cssrs'];
    for (const key of expected) {
      assert.ok(key in ASSESSMENT_FORMS, `Missing scale: ${key}`);
    }
    assert.strictEqual(Object.keys(ASSESSMENT_FORMS).length, expected.length);
  });

  it('every entry has required shape fields', () => {
    for (const [key, cfg] of Object.entries(ASSESSMENT_FORMS)) {
      assert.ok(typeof cfg.formKey === 'string', `${key}: missing formKey`);
      assert.ok(typeof cfg.templateId === 'string', `${key}: missing templateId`);
      assert.ok(typeof cfg.header === 'string' && cfg.header.length > 0, `${key}: missing header`);
      assert.ok(Array.isArray(cfg.questions) && cfg.questions.length > 0, `${key}: empty questions`);
      assert.ok(Array.isArray(cfg.options) && cfg.options.length > 0, `${key}: empty options`);
      assert.ok(typeof cfg.maxScore === 'number', `${key}: missing maxScore`);
      assert.ok(typeof cfg.severityFn === 'function', `${key}: missing severityFn`);
    }
  });
});

// ── Question counts ───────────────────────────────────────────────────────────

describe('question counts', () => {
  it('PHQ-9 has exactly 9 questions', () => {
    assert.strictEqual(ASSESSMENT_FORMS.phq9.questions.length, 9);
  });
  it('GAD-7 has exactly 7 questions', () => {
    assert.strictEqual(ASSESSMENT_FORMS.gad7.questions.length, 7);
  });
  it('PHQ-2 has exactly 2 questions (first 2 of PHQ-9)', () => {
    assert.strictEqual(ASSESSMENT_FORMS.phq2.questions.length, 2);
    assert.strictEqual(ASSESSMENT_FORMS.phq2.questions[0], ASSESSMENT_FORMS.phq9.questions[0]);
  });
  it('GAD-2 has exactly 2 questions (first 2 of GAD-7)', () => {
    assert.strictEqual(ASSESSMENT_FORMS.gad2.questions.length, 2);
    assert.strictEqual(ASSESSMENT_FORMS.gad2.questions[0], ASSESSMENT_FORMS.gad7.questions[0]);
  });
  it('PCL-5 has exactly 20 questions', () => {
    assert.strictEqual(ASSESSMENT_FORMS.pcl5.questions.length, 20);
  });
  it('DASS-21 has exactly 21 questions', () => {
    assert.strictEqual(ASSESSMENT_FORMS.dass21.questions.length, 21);
  });
  it('BPRS has exactly 18 questions', () => {
    assert.strictEqual(ASSESSMENT_FORMS.bprs.questions.length, 18);
  });
  it('YMRS has exactly 11 questions', () => {
    assert.strictEqual(ASSESSMENT_FORMS.ymrs.questions.length, 11);
  });
  it('C-SSRS has exactly 6 questions', () => {
    assert.strictEqual(ASSESSMENT_FORMS.cssrs.questions.length, 6);
  });
});

// ── Max scores ────────────────────────────────────────────────────────────────

describe('maxScore values', () => {
  it('PHQ-9 maxScore is 27 (9 items × 3)', () => {
    assert.strictEqual(ASSESSMENT_FORMS.phq9.maxScore, 27);
  });
  it('GAD-7 maxScore is 21 (7 items × 3)', () => {
    assert.strictEqual(ASSESSMENT_FORMS.gad7.maxScore, 21);
  });
  it('PCL-5 maxScore is 80 (20 items × 4)', () => {
    assert.strictEqual(ASSESSMENT_FORMS.pcl5.maxScore, 80);
  });
  it('MADRS maxScore is 60 (10 items × 6)', () => {
    assert.strictEqual(ASSESSMENT_FORMS.madrs.maxScore, 60);
  });
  it('HDRS maxScore is 68 (17 items × 4, simplified)', () => {
    assert.strictEqual(ASSESSMENT_FORMS.hdrs.maxScore, 68);
  });
  it('YMRS maxScore is 44 (11 items × 4, simplified)', () => {
    assert.strictEqual(ASSESSMENT_FORMS.ymrs.maxScore, 44);
  });
  it('BPRS maxScore is 126 (18 items × 7)', () => {
    assert.strictEqual(ASSESSMENT_FORMS.bprs.maxScore, 126);
  });
});

// ── Severity bands ────────────────────────────────────────────────────────────

describe('PHQ-9 severity bands', () => {
  const fn = ASSESSMENT_FORMS.phq9.severityFn;
  it('score 0 → Minimal, green', () => {
    const r = fn(0);
    assert.strictEqual(r.label, 'Minimal');
    assert.strictEqual(r.color, 'var(--green)');
  });
  it('score 5 → Mild', () => {
    assert.strictEqual(fn(5).label, 'Mild');
  });
  it('score 10 → Moderate', () => {
    assert.strictEqual(fn(10).label, 'Moderate');
  });
  it('score 15 → Moderately severe', () => {
    assert.strictEqual(fn(15).label, 'Moderately severe');
  });
  it('score 20 → Severe, #ff6b6b', () => {
    const r = fn(20);
    assert.strictEqual(r.label, 'Severe');
    assert.strictEqual(r.color, '#ff6b6b');
  });
});

describe('PCL-5 severity bands', () => {
  const fn = ASSESSMENT_FORMS.pcl5.severityFn;
  it('score 32 → Below threshold, green', () => {
    const r = fn(32);
    assert.strictEqual(r.label, 'Below threshold');
    assert.strictEqual(r.color, 'var(--green)');
  });
  it('score 33 → Probable PTSD, #ff6b6b', () => {
    const r = fn(33);
    assert.strictEqual(r.label, 'Probable PTSD');
    assert.strictEqual(r.color, '#ff6b6b');
  });
});

describe('C-SSRS safety triage', () => {
  const fn = ASSESSMENT_FORMS.cssrs.severityFn;
  it('all-No answers → Negative screen, green', () => {
    const r = fn(0, [0, 0, 0, 0, 0, 0]);
    assert.strictEqual(r.label, 'Negative screen');
    assert.strictEqual(r.color, 'var(--green)');
  });
  it('only item 1 Yes → LOW risk, teal', () => {
    const r = fn(1, [1, 0, 0, 0, 0, 0]);
    assert.ok(r.label.includes('LOW risk'), `Expected LOW risk, got: ${r.label}`);
    assert.strictEqual(r.color, 'var(--teal)');
  });
  it('items 2–3 positive → MODERATE risk, amber', () => {
    const r = fn(2, [0, 1, 1, 0, 0, 0]);
    assert.ok(r.label.includes('MODERATE risk'), `Expected MODERATE risk, got: ${r.label}`);
    assert.strictEqual(r.color, 'var(--amber)');
  });
  it('item 4 positive → HIGH risk, #ff6b6b', () => {
    const r = fn(1, [0, 0, 0, 1, 0, 0]);
    assert.ok(r.label.includes('HIGH risk'), `Expected HIGH risk, got: ${r.label}`);
    assert.strictEqual(r.color, '#ff6b6b');
  });
  it('HIGH risk label contains "immediate safety plan required"', () => {
    const r = fn(5, [1, 1, 1, 1, 1, 1]);
    assert.ok(
      r.label.includes('immediate safety plan required'),
      `Expected safety plan wording, got: ${r.label}`,
    );
  });
  it('falls back to scalar threshold when no answers array is provided', () => {
    // score ≥ 3 → elevated risk
    const r = fn(3);
    assert.ok(r.label.includes('Elevated risk'), `Expected Elevated risk, got: ${r.label}`);
  });
});

describe('MADRS severity bands', () => {
  const fn = ASSESSMENT_FORMS.madrs.severityFn;
  it('score 0 → Normal', () => { assert.strictEqual(fn(0).label, 'Normal'); });
  it('score 10 → Mild', () => { assert.strictEqual(fn(10).label, 'Mild'); });
  it('score 25 → Moderate', () => { assert.strictEqual(fn(25).label, 'Moderate'); });
  it('score 40 → Severe, #ff6b6b', () => {
    const r = fn(40);
    assert.strictEqual(r.label, 'Severe');
    assert.strictEqual(r.color, '#ff6b6b');
  });
});

// ── clinicianRated and safetyCritical flags ────────────────────────────────────

describe('clinician-rated and safety-critical flags', () => {
  it('MADRS, HDRS, BPRS, YMRS, C-SSRS are clinicianRated: true', () => {
    for (const key of ['madrs', 'hdrs', 'bprs', 'ymrs', 'cssrs']) {
      assert.strictEqual(ASSESSMENT_FORMS[key].clinicianRated, true, `${key} should be clinicianRated`);
    }
  });

  it('PHQ-9, GAD-7, PCL-5 are NOT clinicianRated', () => {
    for (const key of ['phq9', 'gad7', 'pcl5']) {
      assert.ok(!ASSESSMENT_FORMS[key].clinicianRated, `${key} should NOT be clinicianRated`);
    }
  });

  it('C-SSRS is safetyCritical: true', () => {
    assert.strictEqual(ASSESSMENT_FORMS.cssrs.safetyCritical, true);
  });

  it('PHQ-9 is NOT safetyCritical', () => {
    assert.ok(!ASSESSMENT_FORMS.phq9.safetyCritical);
  });
});

// ── SCALE_TO_FORM_KEY mapping ─────────────────────────────────────────────────

describe('SCALE_TO_FORM_KEY', () => {
  it('maps "PHQ-9" → "phq9"', () => {
    assert.strictEqual(SCALE_TO_FORM_KEY['PHQ-9'], 'phq9');
  });
  it('maps "HAM-D" → "hdrs" (alias)', () => {
    assert.strictEqual(SCALE_TO_FORM_KEY['HAM-D'], 'hdrs');
  });
  it('maps "C-SSRS" → "cssrs"', () => {
    assert.strictEqual(SCALE_TO_FORM_KEY['C-SSRS'], 'cssrs');
  });
  it('maps "MADRS" → "madrs"', () => {
    assert.strictEqual(SCALE_TO_FORM_KEY['MADRS'], 'madrs');
  });
});

// ── getAssessmentConfig helper ────────────────────────────────────────────────

describe('getAssessmentConfig', () => {
  it('returns the correct config for a valid formKey', () => {
    const cfg = getAssessmentConfig('phq9');
    assert.ok(cfg !== null);
    assert.strictEqual(cfg.templateId, 'PHQ-9');
  });

  it('returns null for an unknown formKey', () => {
    assert.strictEqual(getAssessmentConfig('unknown-scale'), null);
  });
});

// ── SUPPORTED_FORMS ───────────────────────────────────────────────────────────

describe('SUPPORTED_FORMS', () => {
  it('includes all 12 scale keys', () => {
    const expected = ['phq9','gad7','phq2','gad2','pcl5','isi','dass21','madrs','hdrs','bprs','ymrs','cssrs'];
    for (const k of expected) {
      assert.strictEqual(SUPPORTED_FORMS[k], true, `SUPPORTED_FORMS missing ${k}`);
    }
  });

  it('is frozen (immutable)', () => {
    assert.ok(Object.isFrozen(SUPPORTED_FORMS));
  });
});
