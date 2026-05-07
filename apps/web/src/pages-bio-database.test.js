import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBioReviewScope,
  bioNormalizeArray,
  buildBioAnalyzerModel,
  buildBioReviewHandoffSummary,
  buildBioScopeFormHints,
  filterBioRowsForReviewScope,
} from './pages-bio-database.js';

test('bioNormalizeArray unwraps common API list shapes', () => {
  assert.deepEqual(bioNormalizeArray({ items: [{ id: 1 }] }), [{ id: 1 }]);
  assert.deepEqual(bioNormalizeArray({ rows: [{ id: 2 }] }), [{ id: 2 }]);
  assert.deepEqual(bioNormalizeArray({ results: [{ id: 3 }] }), [{ id: 3 }]);
  assert.deepEqual(bioNormalizeArray(null), []);
});

test('buildBioAnalyzerModel detects recency and exposure review cues', () => {
  const stale = new Date(Date.now() - 220 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    catalog: [{ name: 'Vitamin D' }, { name: 'TSH' }, { name: 'Ferritin' }],
    substances: [
      { name: 'Clonazepam', status: 'active', started_at: stale },
      { name: 'Methylphenidate', status: 'active', started_at: stale },
    ],
    labs: [{ name: 'CBC', flag: 'critical', collected_at: stale, notes: 'Needs confirmation' }],
    reviewNotes: { note: 'Reviewed.', updatedAt: stale },
  });
  assert.equal(model.staleLabs, true);
  assert.equal(model.staleSubstances, true);
  assert.equal(model.exposures.sedating, 1);
  assert.equal(model.exposures.activating, 1);
  assert.ok(model.findings.some((item) => item.id === 'critical-labs'));
  assert.equal(model.reviewNotes.note, 'Reviewed.');
});

test('buildBioAnalyzerModel maps acknowledgement state onto findings', () => {
  const stale = new Date(Date.now() - 220 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    labs: [{ name: 'CBC', flag: 'critical', collected_at: stale }],
    findingAcks: { 'critical-labs': { acknowledged: true, acknowledgedAt: stale } },
  });
  const finding = model.findings.find((item) => item.id === 'critical-labs');
  assert.ok(finding);
  assert.equal(finding.acknowledged, true);
  assert.equal(finding.acknowledgedAt, stale);
});

test('buildBioAnalyzerModel groups repeated analyte trends', () => {
  const now = new Date();
  const first = new Date(now.getTime() - 12 * 86400000).toISOString();
  const second = new Date(now.getTime() - 2 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    labs: [
      { name: 'Ferritin', collected_at: first, value_numeric: 20, unit: 'ng/mL', flag: 'abnormal' },
      { name: 'Ferritin', collected_at: second, value_numeric: 35, unit: 'ng/mL', flag: 'normal' },
    ],
  });
  assert.equal(model.repeatedLabTrends.length, 1);
  assert.equal(model.repeatedLabTrends[0].analyte, 'Ferritin');
  assert.equal(model.repeatedLabTrends[0].direction, 'up');
});

test('buildBioAnalyzerModel emits protocol cautions for meds and biomarker confounders', () => {
  const stale = new Date(Date.now() - 220 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    catalog: [{ name: 'Vitamin D' }, { name: 'TSH' }, { name: 'Ferritin' }],
    substances: [
      { name: 'Clonazepam', status: 'active', started_at: stale },
      { name: 'Methylphenidate', status: 'active', started_at: stale },
    ],
    labs: [
      { name: 'TSH', flag: 'abnormal', collected_at: stale, value_numeric: 7.1 },
      { name: 'Ferritin', flag: 'abnormal', collected_at: stale, value_numeric: 12 },
    ],
  });
  const cautionIds = new Set(model.protocolCautions.map((item) => item.id));
  assert.ok(cautionIds.has('benzo-caution'));
  assert.ok(cautionIds.has('stimulant-caution'));
  assert.ok(cautionIds.has('thyroid-caution'));
  assert.ok(cautionIds.has('biomarker-caution'));
});

test('buildBioAnalyzerModel emits TMS-specific cautions', () => {
  const stale = new Date(Date.now() - 220 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    patient: { primary_modality: 'tms' },
    substances: [{ name: 'Clonazepam', status: 'active', started_at: stale }],
    labs: [{ name: 'TSH', flag: 'abnormal', collected_at: stale, value_numeric: 6.2 }],
  });
  const cautionIds = new Set(model.protocolCautions.map((item) => item.id));
  assert.equal(model.modality, 'tms');
  assert.ok(cautionIds.has('tms-benzo-caution'));
  assert.ok(cautionIds.has('tms-biomarker-caution'));
});

test('buildBioAnalyzerModel emits tDCS-specific cautions', () => {
  const stale = new Date(Date.now() - 220 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    patient: { primary_modality: 'tdcs' },
    substances: [{ name: 'Methylphenidate', status: 'active', started_at: stale }],
    labs: [{ name: 'Magnesium', flag: 'abnormal', collected_at: stale, value_numeric: 1.3 }],
  });
  const cautionIds = new Set(model.protocolCautions.map((item) => item.id));
  assert.equal(model.modality, 'tdcs');
  assert.ok(cautionIds.has('tdcs-electrolyte-caution'));
  assert.ok(cautionIds.has('tdcs-stimulant-caution'));
});

test('buildBioAnalyzerModel emits neurofeedback-specific cautions', () => {
  const stale = new Date(Date.now() - 220 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    patient: { primary_modality: 'neurofeedback' },
    substances: [{ name: 'Diazepam', status: 'active', started_at: stale }],
    labs: [],
  });
  const cautionIds = new Set(model.protocolCautions.map((item) => item.id));
  assert.equal(model.modality, 'neurofeedback');
  assert.ok(cautionIds.has('nf-sedation-caution'));
  assert.ok(cautionIds.has('nf-stale-labs-caution'));
});

test('buildBioAnalyzerModel generates sequenced action plan and review summary', () => {
  const stale = new Date(Date.now() - 220 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    patient: { primary_modality: 'tms' },
    catalog: [{ name: 'Vitamin D' }, { name: 'TSH' }, { name: 'Ferritin' }],
    substances: [{ name: 'Clonazepam', status: 'active', started_at: stale }],
    labs: [{ name: 'TSH', flag: 'critical', collected_at: stale, value_numeric: 6.9 }],
    findingAcks: { 'critical-labs': { acknowledged: true, acknowledgedAt: stale } },
  });
  assert.equal(model.reviewSummary.totalFindings >= 3, true);
  assert.equal(model.reviewSummary.acknowledgedFindings >= 1, true);
  assert.equal(model.reviewSummary.unacknowledgedFindings >= 1, true);
  assert.equal(model.actionPlan.length >= 3, true);
  assert.equal(model.actionPlan[0].id, 'plan-confirm-critical-labs');
  assert.ok(model.actionPlan.some((item) => item.id === 'plan-refresh-baseline-labs'));
  assert.ok(model.actionPlan.some((item) => item.id === 'plan-modality-tms'));
});

test('buildBioAnalyzerModel derives range-based lab interpretation from source fields', () => {
  const recent = new Date(Date.now() - 5 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    labs: [
      { name: 'TSH', collected_at: recent, value_numeric: 7.2, unit: 'mIU/L', reference_range_text: '0.4 - 4.5', source_lab: 'Quest' },
      { name: 'Magnesium', collected_at: recent, value_numeric: 2.1, unit: 'ng/mL', reference_range_text: '1.7 - 2.2', source_lab: 'LabCorp' },
    ],
  });
  const findingIds = new Set(model.findings.map((item) => item.id));
  const cautionIds = new Set(model.protocolCautions.map((item) => item.id));
  const actionIds = new Set(model.actionPlan.map((item) => item.id));
  const tshInsight = model.labInsights.find((item) => item.name === 'TSH');
  const magnesiumInsight = model.labInsights.find((item) => item.name === 'Magnesium');
  assert.ok(tshInsight);
  assert.equal(tshInsight.inferredStatus, 'high');
  assert.match(tshInsight.rangeReason, /above reference high 4.5/);
  assert.equal(tshInsight.sourceLab, 'Quest');
  assert.ok(magnesiumInsight);
  assert.equal(magnesiumInsight.unitMismatch, true);
  assert.ok(findingIds.has('reference-range-review'));
  assert.ok(findingIds.has('unit-mismatch-review'));
  assert.ok(cautionIds.has('lab-unit-caution'));
  assert.ok(actionIds.has('plan-verify-lab-units'));
});

test('buildBioAnalyzerModel emits analyte-specific threshold signals', () => {
  const recent = new Date(Date.now() - 5 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    labs: [
      { name: 'Ferritin', collected_at: recent, value_numeric: 18, unit: 'ng/mL', reference_range_text: '15 - 150' },
      { name: 'Vitamin D', collected_at: recent, value_numeric: 16, unit: 'ng/mL', reference_range_text: '30 - 100' },
      { name: 'hs-CRP', collected_at: recent, value_numeric: 4.8, unit: 'mg/L', reference_range_text: '0 - 3' },
      { name: 'Vitamin B12', collected_at: recent, value_numeric: 240, unit: 'pg/mL', reference_range_text: '200 - 900' },
    ],
  });
  const thresholdIds = new Set(model.thresholdSignals.map((item) => item.id));
  const findingIds = new Set(model.findings.map((item) => item.id));
  const cautionIds = new Set(model.protocolCautions.map((item) => item.id));
  assert.ok(thresholdIds.has('ferritin-low'));
  assert.ok(thresholdIds.has('vitamin-d-deficient'));
  assert.ok(thresholdIds.has('inflammation-elevated'));
  assert.ok(thresholdIds.has('b12-low'));
  assert.ok(findingIds.has('threshold-ferritin-low'));
  assert.ok(findingIds.has('threshold-vitamin-d-deficient'));
  assert.ok(cautionIds.has('ferritin-caution'));
  assert.ok(cautionIds.has('vitamin-d-caution'));
  assert.ok(cautionIds.has('inflammation-caution'));
  assert.ok(cautionIds.has('b12-caution'));
});

test('applyBioReviewScope narrows analyzer content for lab cleanup', () => {
  const stale = new Date(Date.now() - 220 * 86400000).toISOString();
  const model = buildBioAnalyzerModel({
    patient: { primary_modality: 'tdcs' },
    catalog: [{ name: 'Vitamin D' }, { name: 'TSH' }, { name: 'Ferritin' }],
    substances: [
      { name: 'Clonazepam', status: 'active', started_at: stale },
      { name: 'Methylphenidate', status: 'active', started_at: stale },
    ],
    labs: [
      { name: 'TSH', collected_at: stale, value_numeric: 7.2, unit: 'mIU/L', reference_range_text: '0.4 - 4.5' },
      { name: 'Magnesium', collected_at: stale, value_numeric: 2.1, unit: 'ng/mL', reference_range_text: '1.7 - 2.2' },
    ],
  });
  const scoped = applyBioReviewScope(model, 'labs');
  assert.equal(scoped.reviewScopeId, 'labs');
  assert.equal(scoped.reviewScopeLabel, 'Lab cleanup');
  assert.equal(scoped.findings.some((item) => item.id === 'sedating-exposure'), false);
  assert.equal(scoped.findings.some((item) => item.id === 'unit-mismatch-review'), true);
  assert.equal(scoped.protocolCautions.some((item) => item.id === 'lab-unit-caution'), true);
  assert.equal(scoped.repeatedLabTrends.length, model.repeatedLabTrends.length);
  assert.equal(scoped.labInsights.length, model.labInsights.length);
});

test('buildBioReviewHandoffSummary reflects narrowed review scope', () => {
  const stale = new Date(Date.now() - 220 * 86400000).toISOString();
  const scoped = applyBioReviewScope(buildBioAnalyzerModel({
    patient: { primary_modality: 'tms' },
    substances: [{ name: 'Clonazepam', status: 'active', started_at: stale }],
    labs: [{ name: 'TSH', flag: 'critical', collected_at: stale, value_numeric: 6.9 }],
    reviewNotes: { note: 'Prioritize med reconciliation.', updatedAt: stale },
  }), 'meds');
  const summary = buildBioReviewHandoffSummary({
    patientLabel: 'Example Patient',
    patientSubtitle: 'MRN-7',
    patientId: 'pt-7',
    model: scoped,
  });
  assert.match(summary, /Review scope: Med reconciliation/);
  assert.match(summary, /Patient: Example Patient · MRN-7/);
  assert.match(summary, /Sedating exposure present/);
  assert.doesNotMatch(summary, /Critical lab flags need clinician confirmation/);
  assert.match(summary, /Prioritize med reconciliation\./);
});

test('filterBioRowsForReviewScope narrows raw rows for meds and labs views', () => {
  const rows = {
    substances: [
      { name: 'Clonazepam', status: 'active' },
      { name: 'Fish Oil', status: 'stopped' },
      { name: 'Methylphenidate', status: 'paused' },
    ],
    labs: [
      { name: 'CBC', flag: 'normal', value_numeric: 1.2, reference_range_text: '0.5 - 2.0', unit: 'x10' },
      { name: 'TSH', flag: 'abnormal', value_numeric: 7.0, reference_range_text: '0.4 - 4.5', unit: 'mIU/L' },
      { name: 'Magnesium', flag: 'normal', value_numeric: 2.1, reference_range_text: '1.7 - 2.2', unit: 'ng/mL' },
    ],
  };

  const medsScoped = filterBioRowsForReviewScope({ scopeId: 'meds', ...rows });
  assert.deepEqual(medsScoped.substances.map((item) => item.name), ['Clonazepam', 'Methylphenidate']);
  assert.equal(medsScoped.labs.length, 3);

  const labsScoped = filterBioRowsForReviewScope({ scopeId: 'labs', ...rows });
  assert.deepEqual(labsScoped.labs.map((item) => item.name), ['TSH', 'Magnesium']);
  assert.equal(labsScoped.substances.length, 3);

  const protocolScoped = filterBioRowsForReviewScope({ scopeId: 'protocol', ...rows });
  assert.deepEqual(protocolScoped.substances.map((item) => item.name), ['Clonazepam', 'Methylphenidate']);
  assert.deepEqual(protocolScoped.labs.map((item) => item.name), ['TSH']);
});

test('buildBioScopeFormHints adds scope-aware defaults and cleanup warnings', () => {
  const hints = buildBioScopeFormHints({
    scopeId: 'labs',
    labs: [
      { name: 'TSH', flag: 'abnormal', value_numeric: 7.0, unit: 'mIU/L', reference_range_text: '', source_lab: '' },
      { name: 'CBC', flag: 'normal', value_numeric: 1.2, reference_range_text: '0.5 - 2.0', source_lab: 'Quest' },
    ],
  });
  assert.equal(hints.scopeId, 'labs');
  assert.match(hints.labHelperText, /structured source data/);
  assert.match(hints.labReferencePlaceholder, /Required for cleanup/);
  assert.match(hints.labSourcePlaceholder, /Required for cleanup/);
  assert.match(hints.labWarning, /1 scoped lab missing reference range/);
  assert.match(hints.labWarning, /1 scoped lab missing source lab/);

  const medHints = buildBioScopeFormHints({ scopeId: 'meds' });
  assert.equal(medHints.substanceStatusDefault, 'active');
  assert.match(medHints.substanceHelperText, /refreshing the active list/);
  assert.match(medHints.substanceNotesPlaceholder, /last confirmed date/);
});
