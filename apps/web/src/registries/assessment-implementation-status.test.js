/**
 * Implementation vs metadata truth tests (item checklists).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSESS_REGISTRY } from './assess-instruments-registry.js';
import {
  getAssessmentImplementationStatus,
  hasImplementedInlineChecklist,
  checklistImplementationReport,
  buildChecklistAlignmentErrors,
  formatScaleWithImplementationBadgeHtml,
  partitionScalesByImplementationTruth,
  getLegacyRunScoreEntryNoticeHtml,
  getLegacyRunAssessmentMode,
  formatLegacyRunImplementationBadgeHtml,
  routeLegacyRunAssessment,
} from './assessment-implementation-status.js';
import { validateScaleRegistryAgainstAssess } from './scale-registry-alignment.js';

test('PHQ-9 is implemented_item_checklist with shipped ASSESS_REGISTRY', () => {
  const st = getAssessmentImplementationStatus('PHQ-9', ASSESS_REGISTRY);
  assert.equal(st.status, 'implemented_item_checklist');
  assert.equal(hasImplementedInlineChecklist('PHQ-9', ASSESS_REGISTRY), true);
});

test('EPWORTH resolves to ESS implemented checklist', () => {
  const st = getAssessmentImplementationStatus('EPWORTH', ASSESS_REGISTRY);
  assert.equal(st.status, 'implemented_item_checklist');
});

test('MADRS is clinician_entry (no inline)', () => {
  const st = getAssessmentImplementationStatus('MADRS', ASSESS_REGISTRY);
  assert.equal(st.status, 'clinician_entry');
});

test('declared_item_checklist_but_missing_form when metadata promises checklist but inline stripped', () => {
  const broken = ASSESS_REGISTRY.map(r =>
    r.id === 'PHQ-9' ? { ...r, inline: false, questions: [] } : r,
  );
  const st = getAssessmentImplementationStatus('PHQ-9', broken);
  assert.equal(st.status, 'declared_item_checklist_but_missing_form');
  assert.match(
    formatScaleWithImplementationBadgeHtml('PHQ-9', broken),
    /Checklist pending/,
  );
});

test('checklistImplementationReport: no missing forms in repo registry', () => {
  const rep = checklistImplementationReport(ASSESS_REGISTRY);
  assert.deepEqual(
    rep.missingForm,
    [],
    'SCALE_REGISTRY item_checklist+supported_in_app must match ASSESS inline forms: ' + rep.missingForm.join(', '),
  );
  assert.ok(rep.declaredInAppItemChecklist.length >= 1);
  assert.deepEqual(rep.declaredInAppItemChecklist.sort(), rep.implementedInline.sort());
});

test('buildChecklistAlignmentErrors matches validateScaleRegistryAgainstAssess.errors', () => {
  const a = buildChecklistAlignmentErrors(ASSESS_REGISTRY);
  const b = validateScaleRegistryAgainstAssess(ASSESS_REGISTRY);
  assert.deepEqual(a, b.errors);
});

test('partitionScalesByImplementationTruth splits implemented vs numeric', () => {
  const p = partitionScalesByImplementationTruth(['PHQ-9', 'MADRS', 'AUDIT'], ASSESS_REGISTRY);
  assert.ok(p.implementedItemChecklist.includes('PHQ-9'));
  assert.ok(p.clinicianEntry.includes('MADRS'));
  assert.ok(p.numericEntry.includes('AUDIT'));
});

test('alignment errors surface broken PHQ-9 implementation', () => {
  const broken = ASSESS_REGISTRY.map(r =>
    r.id === 'PHQ-9' ? { ...r, inline: false, questions: [] } : r,
  );
  const err = buildChecklistAlignmentErrors(broken);
  assert.ok(err.some(e => e.includes('PHQ-9')));
});

test('legacy Run assessment score notices: empty for implemented + numeric_only', () => {
  assert.equal(getLegacyRunScoreEntryNoticeHtml('implemented_item_checklist'), '');
  assert.equal(getLegacyRunScoreEntryNoticeHtml('numeric_only'), '');
});

test('legacy Run assessment: declared missing form matches hub gap tone', () => {
  const h = getLegacyRunScoreEntryNoticeHtml('declared_item_checklist_but_missing_form');
  assert.match(h, /in-app item form is not implemented yet/i);
  assert.match(h, /notice-warn/);
});

test('legacy Run assessment: not offered in app', () => {
  const h = getLegacyRunScoreEntryNoticeHtml('item_checklist_not_offered_in_app');
  assert.match(h, /not offered as an item-by-item checklist/i);
});

test('legacy Run assessment: clinician_entry', () => {
  const h = getLegacyRunScoreEntryNoticeHtml('clinician_entry');
  assert.match(h, /Clinician-administered/i);
});

test('legacy Run assessment: unknown safe copy', () => {
  const h = getLegacyRunScoreEntryNoticeHtml('unknown');
  assert.match(h, /metadata is incomplete/i);
});

test('legacy Run assessment mode: implemented checklist uses inline routing', () => {
  const m = getLegacyRunAssessmentMode('PHQ-9', ASSESS_REGISTRY);
  assert.equal(m.status, 'implemented_item_checklist');
  assert.equal(m.mode, 'inline_item_checklist');
});

test('legacy Run assessment mode: clinician_entry uses numeric entry routing', () => {
  const m = getLegacyRunAssessmentMode('MADRS', ASSESS_REGISTRY);
  assert.equal(m.status, 'clinician_entry');
  assert.equal(m.mode, 'numeric_entry');
});

test('legacy Run assessment mode: declared missing form routes to numeric entry', () => {
  const broken = ASSESS_REGISTRY.map(r =>
    r.id === 'PHQ-9' ? { ...r, inline: false, questions: [] } : r,
  );
  const m = getLegacyRunAssessmentMode('PHQ-9', broken);
  assert.equal(m.status, 'declared_item_checklist_but_missing_form');
  assert.equal(m.mode, 'numeric_entry');
});

test('legacy Run assessment badges: implemented/pending/clinician/numeric are distinct', () => {
  assert.match(formatLegacyRunImplementationBadgeHtml('implemented_item_checklist'), /Inline/);
  assert.match(formatLegacyRunImplementationBadgeHtml('declared_item_checklist_but_missing_form'), /pending/i);
  assert.match(formatLegacyRunImplementationBadgeHtml('clinician_entry'), /Clinician/);
  assert.match(formatLegacyRunImplementationBadgeHtml('numeric_only'), /Numeric/);
});

test('broken PHQ-9 registry yields declared_item_checklist_but_missing_form for legacy routing', () => {
  const broken = ASSESS_REGISTRY.map(r =>
    r.id === 'PHQ-9' ? { ...r, inline: false, questions: [] } : r,
  );
  assert.equal(
    getAssessmentImplementationStatus('PHQ-9', broken).status,
    'declared_item_checklist_but_missing_form',
  );
  assert.ok(getLegacyRunScoreEntryNoticeHtml('declared_item_checklist_but_missing_form').length > 20);
});

test('routeLegacyRunAssessment: implemented checklist routes to inline', () => {
  const r = routeLegacyRunAssessment('PHQ-9', ASSESS_REGISTRY);
  assert.equal(r.route, 'inline_panel');
  assert.equal(r.status, 'implemented_item_checklist');
  assert.ok(r.instrument && r.instrument.id === 'PHQ-9');
});

test('routeLegacyRunAssessment: clinician_entry routes to score entry', () => {
  const r = routeLegacyRunAssessment('MADRS', ASSESS_REGISTRY);
  assert.equal(r.route, 'score_entry_panel');
  assert.equal(r.status, 'clinician_entry');
});

test('routeLegacyRunAssessment: numeric_only routes to score entry', () => {
  const r = routeLegacyRunAssessment('AUDIT', ASSESS_REGISTRY);
  assert.equal(r.route, 'score_entry_panel');
  assert.equal(r.status, 'numeric_only');
  assert.equal(getLegacyRunScoreEntryNoticeHtml(r.status), '');
});

test('routeLegacyRunAssessment: unknown token routes to score entry', () => {
  const r = routeLegacyRunAssessment('ZZZ_UNKNOWN_999', ASSESS_REGISTRY);
  assert.equal(r.route, 'score_entry_panel');
  assert.equal(r.status, 'unknown');
});

test('routeLegacyRunAssessment: missing implemented form becomes checklist pending', () => {
  const broken = ASSESS_REGISTRY.map(r =>
    r.id === 'PHQ-9' ? { ...r, inline: false, questions: [] } : r,
  );
  const r = routeLegacyRunAssessment('PHQ-9', broken);
  assert.equal(r.route, 'score_entry_panel');
  assert.equal(r.status, 'declared_item_checklist_but_missing_form');
});
