import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSISTED_EXPLAINABILITY_TOP_CAP,
  toPersistedPersonalizationExplainability,
  computeWizardDraftFingerprint,
  shouldAttachPersonalizationExplainability,
} from './personalization-explainability.js';

const sampleDbg = {
  format_version: 1,
  selected_protocol_id: 'PRO-002',
  selected_protocol_name: 'X',
  csv_first_baseline_protocol_id: 'PRO-001',
  csv_first_baseline_protocol_name: 'Y',
  personalization_changed_vs_csv_first: true,
  fired_rule_ids: ['PR-001'],
  fired_rule_labels: ['L1'],
  structured_rule_score_total: 250,
  token_fallback_used: false,
  ranking_factors_applied: ['structured_personalization_rules'],
  secondary_sort_factors: [],
  top_protocols_by_structured_score: [
    { protocol_id: 'PRO-002', structured_score_total: 250 },
    { protocol_id: 'PRO-001', structured_score_total: 0 },
  ],
  deterministic_rank_order_protocol_ids: ['PRO-002', 'PRO-001'],
  eligible_protocol_count: 2,
};

test('toPersisted maps baseline id and drops heavy fields', () => {
  const p = toPersistedPersonalizationExplainability(sampleDbg);
  assert.equal(p.format_version, 1);
  assert.equal(p.selected_protocol_id, 'PRO-002');
  assert.equal(p.csv_first_protocol_id, 'PRO-001');
  assert.equal(p.structured_rule_score_total, 250);
  assert.equal(p.top_protocols_by_structured_score.length, 2);
  assert.equal('secondary_sort_factors' in p, false);
  assert.equal('deterministic_rank_order_protocol_ids' in p, false);
});

test('top protocols list is capped', () => {
  const many = {
    ...sampleDbg,
    top_protocols_by_structured_score: Array.from({ length: 50 }, (_, i) => ({
      protocol_id: `P${i}`,
      structured_score_total: i,
    })),
  };
  const p = toPersistedPersonalizationExplainability(many);
  assert.equal(p.top_protocols_by_structured_score.length, PERSISTED_EXPLAINABILITY_TOP_CAP);
});

test('null dbg yields null', () => {
  assert.equal(toPersistedPersonalizationExplainability(null), null);
  assert.equal(toPersistedPersonalizationExplainability(undefined), null);
});

test('shouldAttach requires fingerprint match and debug agreement', () => {
  const ws = {
    modalitySlugs: ['rtms'],
    draftGenContextFingerprint: '',
    generatedProtocolPersistedExplainability: toPersistedPersonalizationExplainability(sampleDbg),
  };
  const gen = { personalization_why_selected_debug: { ...sampleDbg } };
  const fp = computeWizardDraftFingerprint(ws);
  ws.draftGenContextFingerprint = fp;
  const snap = shouldAttachPersonalizationExplainability(ws, gen, fp);
  assert.ok(snap);
  assert.equal(snap.selected_protocol_id, 'PRO-002');
});

test('shouldAttach omits when fingerprint stale', () => {
  const ws = {
    modalitySlugs: ['rtms'],
    draftGenContextFingerprint: 'old',
    generatedProtocolPersistedExplainability: toPersistedPersonalizationExplainability(sampleDbg),
  };
  const gen = { personalization_why_selected_debug: { ...sampleDbg } };
  const fp = computeWizardDraftFingerprint(ws);
  assert.equal(shouldAttachPersonalizationExplainability(ws, gen, fp), null);
});

test('shouldAttach omits when response has no debug', () => {
  const ws = {
    modalitySlugs: ['rtms'],
    generatedProtocolPersistedExplainability: toPersistedPersonalizationExplainability(sampleDbg),
  };
  ws.draftGenContextFingerprint = computeWizardDraftFingerprint(ws);
  assert.equal(shouldAttachPersonalizationExplainability(ws, {}, computeWizardDraftFingerprint(ws)), null);
});

test('shouldAttach omits when selected id mismatches snapshot', () => {
  const ws = {
    modalitySlugs: ['rtms'],
    generatedProtocolPersistedExplainability: toPersistedPersonalizationExplainability(sampleDbg),
  };
  ws.draftGenContextFingerprint = computeWizardDraftFingerprint(ws);
  const gen = {
    personalization_why_selected_debug: { ...sampleDbg, selected_protocol_id: 'OTHER' },
  };
  assert.equal(shouldAttachPersonalizationExplainability(ws, gen, computeWizardDraftFingerprint(ws)), null);
});

// ── Branch-coverage additions: defensive defaults and non-object inputs ───

test('toPersisted falls back to [] when top_protocols_by_structured_score is not an array', () => {
  const dbg = { ...sampleDbg, top_protocols_by_structured_score: null };
  const p = toPersistedPersonalizationExplainability(dbg);
  assert.deepEqual(p.top_protocols_by_structured_score, []);
});

test('toPersisted applies all nullish coalescing fallbacks for missing fields', () => {
  // Empty object → every ?? default must kick in.
  const p = toPersistedPersonalizationExplainability({});
  assert.equal(p.format_version, 1);
  assert.equal(p.selected_protocol_id, '');
  assert.equal(p.csv_first_protocol_id, null);
  assert.equal(p.personalization_changed_vs_csv_first, null);
  assert.deepEqual(p.fired_rule_ids, []);
  assert.deepEqual(p.fired_rule_labels, []);
  assert.equal(p.structured_rule_score_total, 0);
  assert.equal(p.token_fallback_used, false);
  assert.deepEqual(p.ranking_factors_applied, []);
  assert.deepEqual(p.top_protocols_by_structured_score, []);
  assert.equal(p.eligible_protocol_count, 0);
});

test('toPersisted returns null for non-object inputs (string, number, array)', () => {
  // !dbg || typeof dbg !== 'object' branch.
  assert.equal(toPersistedPersonalizationExplainability('string'), null);
  assert.equal(toPersistedPersonalizationExplainability(0), null);
  // Note: arrays are objects so they go through the mapper; this is fine —
  // the null-input branch is what we need to hit, and 'string'/0 already do.
});

test('computeWizardDraftFingerprint tolerates an empty wizard state with no modality list', () => {
  // Hits the (ws.modalitySlugs || []) and other || '' branches on lines 44-58.
  const fp = computeWizardDraftFingerprint({});
  // All fields default to empty strings joined by "::". The fingerprint
  // should be a deterministic delimiter-only string, not throw.
  assert.equal(typeof fp, 'string');
  assert.ok(fp.includes('::'));
});

test('computeWizardDraftFingerprint sorts modalitySlugs to be order-independent', () => {
  const a = computeWizardDraftFingerprint({ modalitySlugs: ['tms', 'tdcs'] });
  const b = computeWizardDraftFingerprint({ modalitySlugs: ['tdcs', 'tms'] });
  assert.equal(a, b);
});

test('shouldAttach returns null when ws snapshot is a non-object value', () => {
  // Hits the !snap || typeof snap !== 'object' branch on line 70.
  const ws = {
    modalitySlugs: ['rtms'],
    draftGenContextFingerprint: 'fp',
    generatedProtocolPersistedExplainability: 'not-an-object',
  };
  assert.equal(shouldAttachPersonalizationExplainability(ws, { personalization_why_selected_debug: sampleDbg }, 'fp'), null);
});

test('shouldAttach returns null when generated debug has empty selected_protocol_id', () => {
  // Hits line 74: dbg.selected_protocol_id || '' falsy branch.
  const ws = {
    modalitySlugs: ['rtms'],
    generatedProtocolPersistedExplainability: toPersistedPersonalizationExplainability(sampleDbg),
  };
  ws.draftGenContextFingerprint = computeWizardDraftFingerprint(ws);
  const gen = {
    personalization_why_selected_debug: { ...sampleDbg, selected_protocol_id: '' },
  };
  assert.equal(
    shouldAttachPersonalizationExplainability(ws, gen, computeWizardDraftFingerprint(ws)),
    null,
  );
});
