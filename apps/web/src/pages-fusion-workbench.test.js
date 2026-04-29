import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
    body: { appendChild() {} },
  };
}

const wb = await import('./pages-fusion-workbench.js');

const sampleCase = {
  id: 'fc-1',
  patient_id: 'p1',
  report_state: 'FUSION_DRAFT_AI',
  summary: 'Dual-modality fusion available.',
  confidence: 0.72,
  confidence_grade: 'heuristic',
  qeeg_analysis_id: 'q1',
  mri_analysis_id: 'm1',
  assessment_ids_json: '[]',
  course_ids_json: '[]',
  modality_agreement: {
    overall_status: 'agreement',
    score: 0.75,
    items: [
      { topic: 'condition', qeeg_position: 'Depression', mri_position: 'Depression', status: 'AGREE', severity: 'info', recommendation: 'Both modalities converge.' },
      { topic: 'protocol_target', qeeg_position: 'DLPFC', mri_position: 'DLPFC', status: 'AGREE', severity: 'info', recommendation: 'Use MRI-guided coordinates.' },
    ],
  },
  protocol_fusion: {
    fusion_status: 'merged',
    recommendation: 'Use MRI-guided coordinates with qEEG-informed parameters.',
    qeeg_protocol: { target_region: 'DLPFC', parameters: { frequency_hz: 10 } },
    mri_target: { region: 'DLPFC', coordinates: { x: 1, y: 2, z: 3 } },
    off_label: false,
    evidence_grade: 'heuristic',
  },
  explainability: {
    top_modalities: [{ modality: 'qEEG', weight: 0.5 }, { modality: 'MRI', weight: 0.5 }],
    missing_data_notes: ['Modality assessments missing.'],
    cautions: ['Decision-support only.'],
  },
  safety_cockpit: { overall_status: 'safe', warnings: [] },
  red_flags: [],
  patient_facing_report: {
    patient_id_hash: 'sha256:abc123',
    summary: 'Dual-modality fusion available.',
    claims: [{ claim_type: 'OBSERVED', text: 'Both modalities agree on DLPFC targeting.' }],
    disclaimer: 'Decision-support only.',
  },
};

const sampleAudits = [
  { id: 'a1', action: 'create', actor_id: 'dr.smith', actor_role: 'clinician', previous_state: null, new_state: 'FUSION_DRAFT_AI', note: 'Created', created_at: '2024-01-01T00:00:00Z' },
];

// ── Case Selector ────────────────────────────────────────────────────────────

test('renderCaseSelector shows dropdown when cases exist', () => {
  const html = wb.renderCaseSelector([{ id: 'fc-1', report_state: 'FUSION_DRAFT_AI', confidence: 0.7 }], 'fc-1');
  assert.match(html, /Select a fusion case/);
  assert.match(html, /fc-1/);
});

test('renderCaseSelector shows empty message when no cases', () => {
  const html = wb.renderCaseSelector([], null);
  assert.match(html, /No fusion cases yet/);
});

// ── Modality Status Bar ──────────────────────────────────────────────────────

test('renderModalityStatusBar shows ready badges for available modalities', () => {
  const html = wb.renderModalityStatusBar(sampleCase);
  assert.match(html, /qEEG/);
  assert.match(html, /MRI/);
  assert.match(html, /&#10003;/);
});

// ── Safety Cockpit ───────────────────────────────────────────────────────────

test('renderSafetyCockpit shows safe when no flags', () => {
  const html = wb.renderSafetyCockpit(sampleCase);
  assert.match(html, /No safety flags/);
});

test('renderSafetyCockpit shows red flags and warnings', () => {
  const caseWithFlags = {
    ...sampleCase,
    red_flags: [{ code: 'EPILEPTIFORM', message: 'Spikes detected' }],
    safety_cockpit: { warnings: ['Stale data warning.'] },
  };
  const html = wb.renderSafetyCockpit(caseWithFlags);
  assert.match(html, /EPILEPTIFORM/);
  assert.match(html, /Stale data warning/);
});

// ── Agreement Dashboard ──────────────────────────────────────────────────────

test('renderAgreementDashboard shows table with AGREE pills', () => {
  const html = wb.renderAgreementDashboard(sampleCase);
  assert.match(html, /condition/);
  assert.match(html, /AGREE/);
  assert.match(html, /Both modalities converge/);
});

test('renderAgreementDashboard shows empty message when no items', () => {
  const html = wb.renderAgreementDashboard({ modality_agreement: { items: [] } });
  assert.match(html, /No agreement data/);
});

// ── Protocol Fusion Panel ────────────────────────────────────────────────────

test('renderProtocolFusionPanel shows qEEG, MRI, and fusion cards', () => {
  const html = wb.renderProtocolFusionPanel(sampleCase);
  assert.match(html, /qEEG Protocol/);
  assert.match(html, /MRI Target/);
  assert.match(html, /Fusion Result/);
  assert.match(html, /DLPFC/);
  assert.match(html, /merged/);
});

// ── AI Summary ───────────────────────────────────────────────────────────────

test('renderAiSummary shows summary and confidence gauge', () => {
  const html = wb.renderAiSummary(sampleCase);
  assert.match(html, /Dual-modality fusion available/);
  assert.match(html, /72%/);
  assert.match(html, /Decision-support only/);
});

// ── Explainability ───────────────────────────────────────────────────────────

test('renderExplainability shows modalities, missing data, cautions', () => {
  const html = wb.renderExplainability(sampleCase);
  assert.match(html, /qEEG/);
  assert.match(html, /MRI/);
  assert.match(html, /Missing Data/);
  assert.match(html, /Cautions/);
});

// ── Review Actions ───────────────────────────────────────────────────────────

test('renderReviewActions shows state badge and buttons for DRAFT_AI', () => {
  const html = wb.renderReviewActions(sampleCase);
  assert.match(html, /DRAFT AI/);
  assert.match(html, /Send for Review/);
  assert.match(html, /Archive/);
});

test('renderReviewActions shows Sign Off for APPROVED state', () => {
  const caseApproved = { ...sampleCase, report_state: 'FUSION_APPROVED', reviewer_id: 'dr.smith' };
  const html = wb.renderReviewActions(caseApproved);
  assert.match(html, /APPROVED/);
  assert.match(html, /Sign Off/);
  assert.match(html, /Reviewed by dr.smith/);
});

test('renderReviewActions shows no buttons for ARCHIVED', () => {
  const caseArchived = { ...sampleCase, report_state: 'FUSION_ARCHIVED' };
  const html = wb.renderReviewActions(caseArchived);
  assert.match(html, /ARCHIVED/);
  assert.doesNotMatch(html, /Send for Review/);
  assert.doesNotMatch(html, /Sign Off/);
});

// ── Patient-Facing Preview ───────────────────────────────────────────────────

test('renderPatientFacingPreview shows sanitized report', () => {
  const html = wb.renderPatientFacingPreview(sampleCase);
  assert.match(html, /sha256:abc123/);
  assert.match(html, /OBSERVED/);
  assert.match(html, /Decision-support only/);
});

// ── Audit Trail ──────────────────────────────────────────────────────────────

test('renderAuditTrail shows table when audits exist', () => {
  const html = wb.renderAuditTrail(sampleAudits);
  assert.match(html, /create/);
  assert.match(html, /dr.smith/);
  assert.match(html, /FUSION_DRAFT_AI/);
});

test('renderAuditTrail shows empty message when no audits', () => {
  const html = wb.renderAuditTrail([]);
  assert.match(html, /No audit entries/);
});

// ── Composite renderer ───────────────────────────────────────────────────────

test('renderFusionWorkbench shows all sections when caseData provided', () => {
  const html = wb.renderFusionWorkbench(sampleCase, sampleAudits, [sampleCase], 'fc-1');
  assert.match(html, /Fusion Cases/);
  assert.match(html, /Modality Status/);
  assert.match(html, /Safety Cockpit/);
  assert.match(html, /Agreement Dashboard/);
  assert.match(html, /Protocol Fusion/);
  assert.match(html, /AI Summary/);
  assert.match(html, /Explainability/);
  assert.match(html, /Review Actions/);
  assert.match(html, /Patient-Facing Preview/);
  assert.match(html, /Audit Trail/);
});

test('renderFusionWorkbench shows placeholder when no caseData', () => {
  const html = wb.renderFusionWorkbench(null, [], [sampleCase], null);
  assert.match(html, /Select or create a fusion case/);
});

// ── XSS safety ───────────────────────────────────────────────────────────────

test('XSS escape in all dynamic content', () => {
  const malicious = { ...sampleCase, summary: '<script>alert(1)</script>' };
  const html = wb.renderAiSummary(malicious);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
