// ─────────────────────────────────────────────────────────────────────────────
// pages-mri-analysis.test.js
//
// Unit tests for the MRI Analyzer page renderers (pages-mri-analysis.js).
// The renderers return HTML strings, so assertions are string-based — no full
// DOM is required, but helpers.js touches `window` at module load, so we
// install a minimal window shim first.
//
// Run: npm run test:unit   (or: node --test src/pages-mri-analysis.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM shim — MUST be installed before the dynamic import because
// helpers.js registers window._showToast at module top-level.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
// Document stub: renderFullView + pgMRIAnalysis only use document.getElementById
// and addEventListener; tests that assert on HTML strings don't require a DOM.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
    body: { appendChild() {} },
  };
}
// Feature flag on by default (test covers off-path separately below).
globalThis.DEEPSYNAPS_ENABLE_MRI_ANALYZER = true;

const mod = await import('./pages-mri-analysis.js');
const {
  pgMRIAnalysis,
  renderTargetCard,
  renderGlassBrain,
  renderMedRAGPanel,
  renderMedRAGRow,
  renderFullView,
  renderPipelineProgress,
  renderRegulatoryFooter,
  REGULATORY_FOOTER_TEXT,
  DEMO_MRI_REPORT,
  _modalityBadgeClass,
  _resetMRIState,
  _getMRIState,
  _INTERNALS,
  renderMRISafetyCockpit,
  renderMRIRedFlags,
  renderMRIAtlasModelCard,
  renderMRIProtocolGovernance,
  renderMRIClinicianReview,
  renderMRIPatientReport,
  renderMRIRegistrationQA,
  renderMRIPhiAudit,
} = mod;

// ── Fixtures ────────────────────────────────────────────────────────────────
function mkTarget(overrides) {
  return Object.assign({
    target_id: 'T1',
    modality: 'rtms',
    condition: 'mdd',
    region_name: 'Left DLPFC',
    mni_xyz: [-40, 40, 30],
    method: 'F3_Beam_projection',
    method_reference_dois: ['10.1016/foo'],
    suggested_parameters: { protocol: 'iTBS', sessions: 30 },
    supporting_paper_ids_from_medrag: [1234],
    confidence: 'high',
  }, overrides || {});
}

// ═════════════════════════════════════════════════════════════════════════════
// _modalityBadgeClass — one class per modality, rose for *_personalised
// ═════════════════════════════════════════════════════════════════════════════
test('renderTargetCard emits the correct modality badge class for supported modalities', () => {
  const pairs = [
    ['tps',  'ds-mri-badge-tps'],
    ['tfus', 'ds-mri-badge-tfus'],
    // Unknown modalities return empty string (no badge class)
    ['rtms', ''],
    ['tdcs', ''],
    ['tacs', ''],
    // personalised — should override modality colour with rose.
    ['rtms_personalised_is_a_method', 'ds-mri-badge-personalised'],
  ];
  for (const [m, expected] of pairs) {
    const t = m.endsWith('_is_a_method')
      ? mkTarget({ modality: 'rtms', method: 'sgACC_anticorrelation_personalised' })
      : mkTarget({ modality: m });
    assert.equal(_modalityBadgeClass(t), expected, `modality=${m} → ${expected}`);
    const html = renderTargetCard(t, 'aid-x');
    if (expected) {
      assert.match(html, new RegExp(expected), `card HTML for ${m} should contain ${expected}`);
    }
  }
});

test('rose pulsing dot appears when method ends with "_personalised"', () => {
  const personalised = mkTarget({ method: 'sgACC_anticorrelation_personalised' });
  const plain        = mkTarget({ method: 'F3_Beam_projection' });
  assert.match(renderTargetCard(personalised, 'aid'), /ds-mri-pulsing-dot/);
  assert.ok(!/ds-mri-pulsing-dot/.test(renderTargetCard(plain, 'aid')),
    'non-personalised target should NOT emit a pulsing dot');
});

// ═════════════════════════════════════════════════════════════════════════════
// renderGlassBrain — one dot per target in the demo report
// ═════════════════════════════════════════════════════════════════════════════
test('glass-brain SVG contains one dot per target in the demo report', () => {
  const html = renderGlassBrain(DEMO_MRI_REPORT);
  const matches = html.match(/class="ds-mri-glass-dot"/g) || [];
  assert.equal(matches.length, DEMO_MRI_REPORT.stim_targets.length,
    `expected ${DEMO_MRI_REPORT.stim_targets.length} dots, got ${matches.length}`);
  // Each target_id should appear in a <title> or data attr.
  DEMO_MRI_REPORT.stim_targets.forEach((t) => {
    assert.match(html, new RegExp(t.target_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `glass brain should reference ${t.target_id}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MedRAG row rendering
// ═════════════════════════════════════════════════════════════════════════════
test('MedRAG rows render with DOI link + year', () => {
  const row = {
    paper_id: 51907,
    title: 'A paper about sgACC',
    doi: '10.1176/appi.ajp.2021.20101429',
    year: 2021,
    score: 0.91,
    hits: [{ entity: 'sgACC_DLPFC_anticorrelation', relation: 'stim_target_for' }],
  };
  const html = renderMedRAGRow(row);
  assert.match(html, /https:\/\/doi\.org\/10\.1176\/appi\.ajp\.2021\.20101429/);
  assert.match(html, /2021/);
  assert.match(html, /A paper about sgACC/);
  assert.match(html, /stim_target_for/);
  // Score bar at 91%
  assert.match(html, /width:91%/);
});

test('renderMedRAGPanel handles empty + non-empty inputs', () => {
  const empty = renderMedRAGPanel([]);
  assert.match(empty, /No MedRAG results/);
  const populated = renderMedRAGPanel([
    { paper_id: 1, title: 'A', year: 2024, doi: '10.1/a', score: 0.7, hits: [] },
    { paper_id: 2, title: 'B', year: 2023, doi: '10.2/b', score: 0.5, hits: [] },
  ]);
  assert.match(populated, /MedRAG literature \(top 2\)/);
  assert.match(populated, /10\.1\/a/);
  assert.match(populated, /10\.2\/b/);
});

// ═════════════════════════════════════════════════════════════════════════════
// Regulatory footer appears on every view
// ═════════════════════════════════════════════════════════════════════════════
test('regulatory footer appears in every rendered view', () => {
  // 1. Standalone
  const footer = renderRegulatoryFooter();
  assert.match(footer, /Decision-support tool\. Not a medical device\./);
  assert.match(footer, /For neuronavigation planning only\./);

  // 2. Full view without report (empty state)
  const emptyView = renderFullView({ report: null });
  assert.match(emptyView, /ds-mri-footer-regulatory/);
  assert.match(emptyView, /Decision-support tool\. Not a medical device\./);
  assert.match(emptyView, /What appears after run/);

  // 3. Full view with demo report
  const loadedView = renderFullView({ report: DEMO_MRI_REPORT });
  assert.match(loadedView, /ds-mri-footer-regulatory/);
  assert.match(loadedView, /For neuronavigation planning only\./);

  const demoBannerView = renderFullView({ report: DEMO_MRI_REPORT, showDemoBanner: true });
  assert.match(demoBannerView, /data-testid="mri-demo-banner"/);
  assert.match(demoBannerView, /Sample MRI analysis/);

  // 4. The exported constant is identical to the copy in the spec.
  assert.match(REGULATORY_FOOTER_TEXT, /Decision-support tool\. Not a medical device\./);
});

// ═════════════════════════════════════════════════════════════════════════════
// Auto-demo: calling pgMRIAnalysis with VITE_ENABLE_DEMO=1 populates _report
// ═════════════════════════════════════════════════════════════════════════════
test('auto-demo populates _report from DEMO_MRI_REPORT when demo mode is on', async () => {
  _resetMRIState();
  // DEV is auto-true under Vite's test runner; _isDemoMode returns true in
  // that case too. We just need to call pgMRIAnalysis and confirm state.
  const noopTopbar = () => {};
  const noopNav = () => {};
  // The harness' document stub doesn't contain a #content node, so
  // pgMRIAnalysis will exit early after state population — perfect for this
  // assertion.
  await pgMRIAnalysis(noopTopbar, noopNav);

  const state = _getMRIState();
  if (_INTERNALS.isDemoMode()) {
    assert.ok(state.report, 'auto-demo should populate _report');
    assert.equal(state.report.analysis_id, DEMO_MRI_REPORT.analysis_id);
    assert.equal(state.uploadId, 'demo');
    assert.equal(state.jobId, 'demo');
    const fullAfterDemo = renderFullView({ report: state.report });
    assert.match(fullAfterDemo, /data-testid="mri-demo-banner"/,
      'banner when loaded analysis is the canned demo report');
  } else {
    // If env says demo is off, report should remain null.
    assert.equal(state.report, null);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Pipeline progress chip states
// ═════════════════════════════════════════════════════════════════════════════
test('pipeline progress renders all 5 stage pills with appropriate states', () => {
  const all5 = /Ingest[\s\S]*Structural[\s\S]*fMRI[\s\S]*dMRI[\s\S]*Targeting/;
  assert.match(renderPipelineProgress({ stage: 'ingest', state: 'STARTED' }), all5);

  const succeeded = renderPipelineProgress({ stage: 'targeting', state: 'SUCCESS' });
  // All pills must be "done" on terminal success.
  const doneCount = (succeeded.match(/ds-mri-stage-pill--done/g) || []).length;
  assert.equal(doneCount, 5, 'SUCCESS should yield 5 done pills');

  const failed = renderPipelineProgress({ stage: 'fmri', state: 'FAILURE' });
  assert.match(failed, /ds-mri-stage-pill--failed/);
});

test('renderFullView explains pending and failed non-report states', () => {
  const pending = renderFullView({
    report: null,
    status: { stage: 'fmri', state: 'STARTED' },
    patientId: 'DS-2026-000123',
  });
  assert.match(pending, /Results pending/);
  assert.match(pending, /Current stage: <strong>fMRI<\/strong>/);
  assert.match(pending, /Targets, QC, and literature cards will appear here/);

  const failed = renderFullView({
    report: null,
    status: { stage: 'targeting', state: 'FAILURE' },
  });
  assert.match(failed, /Analysis needs attention/);
  assert.match(failed, /The pipeline stopped before a report was generated/);
  assert.match(failed, /Upload a session again to retry the analysis|current upload is still staged/i);
});

// ═════════════════════════════════════════════════════════════════════════════
// Banned-word regex scan: rendered HTML must not contain diagnostic language
// ═════════════════════════════════════════════════════════════════════════════
test('rendered HTML contains no banned clinical-claim words', () => {
  const banned = /\b(diagnose|diagnostic|treatment recommendation|cures)\b/i;
  // We scan the full view both empty and loaded, plus the demo MedRAG panel.
  const fragments = [
    renderFullView({ report: null }),
    renderFullView({ report: DEMO_MRI_REPORT }),
    renderRegulatoryFooter(),
    renderMedRAGPanel(_INTERNALS.synthesiseMedRAG(DEMO_MRI_REPORT)),
    renderGlassBrain(DEMO_MRI_REPORT),
  ];
  for (const html of fragments) {
    assert.ok(!banned.test(html), `banned word found in fragment: ${html.slice(0, 120)}…`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Beta-readiness: pretend buttons must not be rendered
// (regression for cursor/beta-readiness-functional-completion-9a99)
// ═════════════════════════════════════════════════════════════════════════════
test('MRI bottom strip no longer renders pretend Share / Neuronav buttons', () => {
  const view = renderFullView({ report: DEMO_MRI_REPORT });
  assert.ok(!/Share with referring provider/.test(view),
    'Share with referring provider button must be hidden in beta');
  assert.ok(!/Open in Neuronav/.test(view),
    'Open in Neuronav button must be hidden in beta');
  // Real download / annotation actions must still be present.
  assert.match(view, /ds-mri-dl-pdf/);
  assert.match(view, /ds-mri-dl-fhir/);
  assert.match(view, /ds-mri-dl-bids/);
});

test('MRI per-target actions include view overlay and download JSON', () => {
  const html = renderTargetCard(mkTarget(), 'aid-x');
  assert.match(html, /ds-mri-view-overlay/);
  assert.match(html, /ds-mri-download-target/);
});

test('renderFullView with report includes Jump-to-section nav and anchor sections', () => {
  const html = renderFullView({ report: DEMO_MRI_REPORT });
  assert.match(html, /class="ds-mri-sections-nav"/);
  assert.match(html, /data-mri-scroll-to="ds-mri-section-targets"/);
  assert.match(html, /id="ds-mri-section-spatial"/);
  assert.match(html, /id="ds-mri-section-review"/);
});

test('Jump nav omits Brain age when brain-age card is not shown', () => {
  var minimal = Object.assign({}, DEMO_MRI_REPORT);
  minimal.structural = Object.assign({}, DEMO_MRI_REPORT.structural, { brain_age: null });
  const html = renderFullView({ report: minimal });
  assert.ok(!/data-mri-scroll-to="ds-mri-section-brainage"/.test(html),
    'brain-age jump button should not render without brain-age card');
});

// ═════════════════════════════════════════════════════════════════════════════
// Demo report shape (sanity)
// ═════════════════════════════════════════════════════════════════════════════
test('DEMO_MRI_REPORT matches the authoritative sample shape', () => {
  assert.equal(DEMO_MRI_REPORT.analysis_id, '8a7f1c52-2f5d-4b11-9c66-0a1c1bd8c9e3');
  assert.equal(DEMO_MRI_REPORT.patient.patient_id, 'DS-2026-000123');
  assert.equal(DEMO_MRI_REPORT.stim_targets.length, 3);
  assert.equal(DEMO_MRI_REPORT.modalities_present.length, 3);
  // One personalised target, one F3 Beam, one tFUS SCC.
  const methods = DEMO_MRI_REPORT.stim_targets.map((t) => t.method);
  assert.ok(methods.some((m) => m.endsWith('_personalised')));
  assert.ok(methods.includes('F3_Beam_projection'));
  assert.ok(methods.includes('tFUS_SCC_Riis'));
});


// ═════════════════════════════════════════════════════════════════════════════
// Clinical Workbench renderers (migration 053)
// ═════════════════════════════════════════════════════════════════════════════

test('renderMRISafetyCockpit shows overall status and checks', () => {
  const cockpit = {
    checks: [
      { name: 'PHI_SCRUBBED', status: 'PASS', detail: 'No PHI detected' },
      { name: 'MOTION', status: 'FAIL', severity: 'medium', detail: 'Motion > 0.5 mm' },
    ],
    red_flags: [],
    overall_status: 'LIMITED_QUALITY',
    disclaimer: 'Decision-support only.',
  };
  const html = renderMRISafetyCockpit(cockpit);
  assert.match(html, /LIMITED_QUALITY/);
  assert.match(html, /PHI_SCRUBBED/);
  assert.match(html, /Motion/);
  assert.match(html, /No PHI detected/);
});

test('renderMRISafetyCockpit shows PHI warning when PHI check fails', () => {
  const cockpit = {
    checks: [{ name: 'PHI_SCRUBBED', status: 'FAIL', detail: 'Name found' }],
    red_flags: [],
    overall_status: 'REJECTED',
    disclaimer: 'Decision-support only.',
  };
  const html = renderMRISafetyCockpit(cockpit);
  assert.match(html, /Potential PHI detected/);
});

test('renderMRIRedFlags renders severity-colored pills', () => {
  const flags = {
    flags: [
      { title: 'Motion artifact', severity: 'medium', code: 'MOTION_HIGH' },
      { title: 'Incidental finding', severity: 'high', code: 'INCIDENTAL' },
    ],
    flag_count: 2,
    high_severity_count: 1,
    disclaimer: 'Decision-support only.',
  };
  const html = renderMRIRedFlags(flags);
  assert.match(html, /Motion artifact/);
  assert.match(html, /Incidental finding/);
  assert.match(html, /Red Flags \(2\)/);
});

test('renderMRIRedFlags shows empty state when no flags', () => {
  const html = renderMRIRedFlags({ flags: [], flag_count: 0, high_severity_count: 0 });
  assert.match(html, /No red flags detected/);
});

test('renderMRIAtlasModelCard renders metadata rows', () => {
  const meta = {
    template_space: 'MNI152',
    atlas_version: 'Desikan-Killiany',
    registration_method: 'ANTS SyN',
    coordinate_uncertainty_mm: 1.5,
  };
  const html = renderMRIAtlasModelCard(meta);
  assert.match(html, /MNI152/);
  assert.match(html, /Desikan-Killiany/);
  assert.match(html, /ANTS SyN/);
  assert.match(html, /1\.5 mm/);
});

test('renderMRIProtocolGovernance renders per-target cards', () => {
  const plans = [
    {
      anatomical_label: 'Left DLPFC',
      registration_confidence: 'high',
      coordinate_uncertainty_mm: 1.2,
      evidence_grade: 'EV-B',
      off_label_flag: false,
      match_rationale: 'Candidate target for clinician review.',
      contraindications: ['Verify MRI safety screening'],
      required_checks: ['Check implant status'],
    },
  ];
  const html = renderMRIProtocolGovernance(plans);
  assert.match(html, /Left DLPFC/);
  assert.match(html, /Candidate target for clinician review/);
  assert.match(html, /EV-B/);
  assert.match(html, /Verify MRI safety screening/);
  assert.match(html, /Check implant status/);
});

test('renderMRIProtocolGovernance shows off-label badge', () => {
  const plans = [{
    anatomical_label: 'SCC',
    registration_confidence: 'moderate',
    off_label_flag: true,
    match_rationale: 'Candidate target for clinician review.',
    contraindications: [],
    required_checks: [],
  }];
  const html = renderMRIProtocolGovernance(plans);
  assert.match(html, /Off-label/);
});

test('renderMRIClinicianReview shows report state badge', () => {
  const html = renderMRIClinicianReview({ report_state: 'MRI_APPROVED', signed_by: 'dr.smith' });
  assert.match(html, /MRI_APPROVED/);
  assert.match(html, /Signed by dr\.smith/);
});

test('renderMRIClinicianReview blocks approval radiology review warning', () => {
  const html = renderMRIClinicianReview({ report_state: 'MRI_NEEDS_RADIOLOGY_REVIEW' });
  assert.match(html, /MRI_NEEDS_RADIOLOGY_REVIEW/);
  assert.match(html, /Radiology review required/);
});

test('renderMRIPatientReport shows placeholder when unavailable', () => {
  const html = renderMRIPatientReport({});
  assert.match(html, /Patient-facing report will be available/);
});

test('renderMRIPatientReport renders content when available', () => {
  const html = renderMRIPatientReport({ patient_facing_content: { text: 'Your MRI shows normal structure.' } });
  assert.match(html, /Your MRI shows normal structure/);
  assert.match(html, /Decision-support only/);
});

// ═════════════════════════════════════════════════════════════════════════════
// Export gating on bottom strip
// ═════════════════════════════════════════════════════════════════════════════
test('BIDS export button is disabled when report is not approved and signed', () => {
  const view = renderFullView({ report: DEMO_MRI_REPORT });
  const bidsBtn = view.match(/ds-mri-dl-bids[^>]*>/);
  assert.ok(bidsBtn, 'BIDS button should exist');
  assert.ok(/disabled/.test(bidsBtn[0]), 'BIDS button should be disabled when not approved/signed');
});

test('BIDS export button is enabled when report is approved and signed', () => {
  const approvedReport = Object.assign({}, DEMO_MRI_REPORT, {
    report_state: 'MRI_APPROVED',
    signed_by: 'dr.smith',
  });
  const view = renderFullView({ report: approvedReport });
  const bidsBtn = view.match(/ds-mri-dl-bids[^>]*>/);
  assert.ok(bidsBtn, 'BIDS button should exist');
  assert.ok(!/disabled/.test(bidsBtn[0]), 'BIDS button should be enabled when approved and signed');
});

test('BIDS export button is disabled when radiology review is unresolved', () => {
  const report = Object.assign({}, DEMO_MRI_REPORT, {
    report_state: 'MRI_APPROVED',
    signed_by: 'dr.smith',
    red_flags: [{ code: 'RADIOLOGY_REVIEW_REQUIRED', resolved: false }],
  });
  const view = renderFullView({ report });
  const bidsBtn = view.match(/ds-mri-dl-bids[^>]*>/);
  assert.ok(bidsBtn, 'BIDS button should exist');
  assert.ok(/disabled/.test(bidsBtn[0]), 'BIDS button should be disabled when radiology review unresolved');
});


// ═════════════════════════════════════════════════════════════════════════════
// Registration QA panel
// ═════════════════════════════════════════════════════════════════════════════
test('renderMRIRegistrationQA shows allowed status when confidence is high', () => {
  const qa = {
    registration_status: 'ok',
    registration_confidence: 'high',
    atlas_overlap_confidence: 'high',
    target_finalisation_allowed: true,
    target_finalisation_blocked_reasons: [],
    target_drift_warnings: [],
    segmentation_quality: 'good',
  };
  const html = renderMRIRegistrationQA(qa);
  assert.match(html, /Target finalisation allowed/);
  assert.match(html, /high/);
});

test('renderMRIRegistrationQA shows blocked status with reasons when confidence is low', () => {
  const qa = {
    registration_status: 'ok',
    registration_confidence: 'low',
    atlas_overlap_confidence: 'low',
    target_finalisation_allowed: false,
    target_finalisation_blocked_reasons: ['Registration confidence is low', 'Atlas overlap confidence is low'],
    target_drift_warnings: [],
    segmentation_quality: 'good',
  };
  const html = renderMRIRegistrationQA(qa);
  assert.match(html, /Target finalisation blocked/);
  assert.match(html, /Registration confidence is low/);
});

test('renderMRIRegistrationQA warns about target drift', () => {
  const qa = {
    target_drift_warnings: [{ target_id: 'T1', drift_mm: 12.5, severity: 'high' }],
    target_finalisation_allowed: false,
    target_finalisation_blocked_reasons: ['Target drift detected'],
  };
  const html = renderMRIRegistrationQA(qa);
  assert.match(html, /Target drift/);
  assert.match(html, /T1.*12\.5 mm/);
});

// ═════════════════════════════════════════════════════════════════════════════
// PHI / De-identification Audit panel
// ═════════════════════════════════════════════════════════════════════════════
test('renderMRIPhiAudit shows low risk when no PHI detected', () => {
  const audit = {
    risk_level: 'low',
    filename_heuristic: { potential_phi_in_filename: false },
    export_filename: { pseudo_id: 'sub-a1b2c3d4' },
    dicom_tag_scan: { removed_categories: ['PatientName', 'PatientID'], retained_categories: ['Modality'] },
    burned_in_annotation_warning: { detected: false, message: 'Burned-in annotations not automatically detected.' },
    disclaimer: 'Best-effort audit.',
  };
  const html = renderMRIPhiAudit(audit);
  assert.match(html, /Risk: low/);
  assert.match(html, /sub-a1b2c3d4/);
  assert.match(html, /PatientName/);
  assert.match(html, /Burned-in annotations/);
});

test('renderMRIPhiAudit shows high risk when PHI in filename', () => {
  const audit = {
    risk_level: 'high',
    filename_heuristic: { potential_phi_in_filename: true },
    export_filename: { pseudo_id: 'sub-a1b2c3d4' },
    dicom_tag_scan: { removed_categories: [], retained_categories: [] },
    burned_in_annotation_warning: { detected: false, message: 'Check manually.' },
    disclaimer: 'Best-effort audit.',
  };
  const html = renderMRIPhiAudit(audit);
  assert.match(html, /Risk: high/);
  assert.match(html, /Potential PHI detected in original filename/);
});

// ═════════════════════════════════════════════════════════════════════════════
// renderFullView includes new clinical workbench panels
// ═════════════════════════════════════════════════════════════════════════════
test('renderFullView includes safety cockpit, red flags, atlas card, registration QA, PHI audit, clinician review, and patient report panels', () => {
  const view = renderFullView({ report: DEMO_MRI_REPORT });
  assert.match(view, /Safety Cockpit/);
  assert.match(view, /Red Flags/);
  assert.match(view, /Atlas &amp; Model Card/);
  assert.match(view, /Registration QA/);
  assert.match(view, /PHI \/ De-identification Audit/);
  assert.match(view, /Clinician Review/);
  assert.match(view, /Patient Report/);
});
