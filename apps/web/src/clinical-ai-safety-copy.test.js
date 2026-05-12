// clinical-ai-safety-copy.test.js — PR 1 safety registry contract
import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('./clinical-ai-safety-copy.js');

const REQUIRED = [
  'AI_DECISION_SUPPORT_DISCLAIMER',
  'DEMO_SYNTHETIC_DATA_DISCLAIMER',
  'CLINICIAN_REVIEW_REQUIRED_COPY',
  'NOT_DIAGNOSTIC_COPY',
  'NOT_TREATMENT_APPROVAL_COPY',
  'RAW_EEG_VERIFICATION_REQUIRED_COPY',
  'RED_FLAGS_ARE_REVIEW_CUES_COPY',
  'PROTOCOL_SUGGESTIONS_ARE_DRAFT_COPY',
  'NORMATIVE_DATABASE_LIMITATION_COPY',
  'NORMATIVE_COMPARISON_REQUIRES_CONDITION_COPY',
  'RESEARCH_ONLY_FEATURE_COPY',
  'SEIZURE_TREND_RESEARCH_ONLY_COPY',
  'CANONICAL_RESEARCH_WELLNESS_DISCLAIMER',
  'QEEG_ANALYZER_SAFETY_FOOTER_BULLETS',
];

test('clinical-ai-safety-copy exports all required string constants', () => {
  REQUIRED.forEach((name) => {
    assert.ok(typeof mod[name] === 'string' || Array.isArray(mod[name]), name + ' must be exported');
  });
  assert.ok(Array.isArray(mod.QEEG_ANALYZER_SAFETY_FOOTER_BULLETS));
  assert.ok(mod.QEEG_ANALYZER_SAFETY_FOOTER_BULLETS.length >= 6);
  assert.match(mod.CANONICAL_RESEARCH_WELLNESS_DISCLAIMER, /not a medical diagnosis/i);
  assert.match(mod.SEIZURE_TREND_RESEARCH_ONLY_COPY, /seizure detection/i);
});
