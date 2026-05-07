// ─────────────────────────────────────────────────────────────────────────────
// qeeg-clinical-workbench.test.js
//
// Tests for the 7 Clinical Intelligence Workbench frontend modules
// (Migration 048).
//
// Run: npm run test:unit
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

const safety = await import('./qeeg-safety-cockpit.js');
const redflags = await import('./qeeg-red-flags.js');
const normative = await import('./qeeg-normative-card.js');
const protocol = await import('./qeeg-protocol-fit.js');
const review = await import('./qeeg-clinician-review.js');
const patient = await import('./qeeg-patient-report.js');
const timeline = await import('./qeeg-timeline.js');

// ── Safety Cockpit ───────────────────────────────────────────────────────────

test('renderSafetyCockpit returns empty string for null', () => {
  assert.equal(safety.renderSafetyCockpit(null), '');
});

test('renderSafetyCockpit renders checks and status', () => {
  const html = safety.renderSafetyCockpit({
    checks: [
      { name: 'Duration', value: '300 s', threshold: '>= 120 s', passed: true },
      { name: 'Sample Rate', value: '256 Hz', threshold: '>= 128 Hz', passed: true },
    ],
    red_flags: [],
    overall_status: 'VALID_FOR_REVIEW',
    disclaimer: 'Decision-support only.',
  });
  assert.ok(html.includes('VALID FOR REVIEW'));
  assert.ok(html.includes('Duration'));
  assert.ok(html.includes('Decision-support only.'));
});

test('renderSafetyCockpit renders red flags', () => {
  const html = safety.renderSafetyCockpit({
    checks: [],
    red_flags: [{ severity: 'HIGH', category: 'Epileptiform', message: 'Sharp waves detected' }],
    overall_status: 'LIMITED_QUALITY',
    disclaimer: '',
  });
  assert.ok(html.includes('LIMITED QUALITY'));
  assert.ok(html.includes('Sharp waves detected'));
});

// ── Red Flags ────────────────────────────────────────────────────────────────

test('renderRedFlags returns empty string for null', () => {
  assert.equal(redflags.renderRedFlags(null), '');
});

test('renderRedFlags renders summary and table', () => {
  const html = redflags.renderRedFlags({
    flags: [
      { severity: 'HIGH', category: 'Signal', message: 'Poor quality', recommendation: 'Re-record' },
    ],
    flag_count: 1,
    high_severity_count: 1,
    disclaimer: 'Check clinically.',
  });
  assert.ok(html.includes('Total Flags'));
  assert.ok(html.includes('High Severity'));
  assert.ok(html.includes('Poor quality'));
  assert.ok(html.includes('Re-record'));
});

// ── Normative Model Card ─────────────────────────────────────────────────────

test('renderNormativeModelCard returns empty string for null', () => {
  assert.equal(normative.renderNormativeModelCard(null), '');
});

test('renderNormativeModelCard renders metadata', () => {
  const html = normative.renderNormativeModelCard({
    normative_db_name: 'DeepSynaps Normative',
    normative_db_version: 'v2.1',
    age_range: '18–65',
    eyes_condition_compatible: true,
    complete: true,
    limitations: ['Demographic mismatch possible.'],
  });
  assert.ok(html.includes('DeepSynaps Normative'));
  assert.ok(html.includes('v2.1'));
  assert.ok(html.includes('Complete'));
});

test('renderNormativeModelCard renders toy status with visible clinical caveat and OOD warning', () => {
  const html = normative.renderNormativeModelCard({
    status: 'toy',
    normative_db_name: 'ToyCsvNormDB',
    normative_db_version: 'toy-0.1',
    age_range: '18-65',
    complete: false,
    clinical_caveat: 'Toy norms are for engineering validation only and are not suitable for clinical interpretation.',
    ood_warning: 'Patient demographics fall outside the reference cohort.',
    limitations: ['Fixture dataset only.'],
  });
  assert.ok(html.includes('Toy / Non-Clinical'));
  assert.ok(html.includes('Clinical Caveat'));
  assert.ok(html.includes('engineering validation only'));
  assert.ok(html.includes('Out-of-Distribution Warning'));
  assert.ok(html.includes('outside the reference cohort'));
  assert.ok(html.includes('<td>toy</td>'));
});

test('renderNormativeModelCard renders configured status and compatibility metadata', () => {
  const html = normative.renderNormativeModelCard({
    status: 'configured',
    normative_db_name: 'Clinic Norm Bank',
    normative_db_version: '2026.04',
    age_range: '12-80',
    eyes_condition_compatible: false,
    montage_compatible: true,
    zscore_method: 'age-stratified z',
    confidence_interval: '95%',
    complete: true,
    limitations: [],
  });
  assert.ok(html.includes('Configured'));
  assert.ok(html.includes('Clinic Norm Bank'));
  assert.ok(html.includes('2026.04'));
  assert.ok(html.includes('No'));
  assert.ok(html.includes('Yes'));
  assert.ok(html.includes('age-stratified z'));
  assert.ok(html.includes('95%'));
});

test('renderNormativeModelCard renders unavailable status with truthful caveat language', () => {
  const html = normative.renderNormativeModelCard({
    status: 'unavailable',
    normative_db_name: '—',
    complete: false,
    clinical_caveat: 'Normative comparison is unavailable for this recording; review raw features and acquisition quality before interpreting deviations.',
    limitations: ['Age/sex metadata missing.'],
  });
  assert.ok(html.includes('Norms Unavailable'));
  assert.ok(html.includes('unavailable'));
  assert.ok(html.includes('Clinical Caveat'));
  assert.ok(html.includes('review raw features and acquisition quality'));
  assert.ok(html.includes('Age/sex metadata missing.'));
});

test('renderNormativeModelCard escapes caveat and warning content', () => {
  const html = normative.renderNormativeModelCard({
    status: 'toy',
    complete: false,
    clinical_caveat: '<script>alert(1)</script> clinician review required',
    ood_warning: '<b>OOD</b> outside range',
    limitations: [],
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>OOD</b>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; clinician review required'));
  assert.ok(html.includes('&lt;b&gt;OOD&lt;/b&gt; outside range'));
});

// ── Protocol Fit ─────────────────────────────────────────────────────────────

test('renderProtocolFit returns empty string for null', () => {
  assert.equal(protocol.renderProtocolFit(null), '');
});

test('renderProtocolFit renders candidate and cautions', () => {
  const html = protocol.renderProtocolFit({
    pattern_summary: 'Elevated theta, reduced alpha.',
    evidence_grade: 'B',
    off_label_flag: false,
    clinician_reviewed: false,
    candidate_protocol: { name: 'SMR uptraining', description: 'Reward 12–15 Hz at Cz.' },
    contraindications: ['Active seizure disorder'],
    match_rationale: 'Theta/alpha ratio matches SMR responder profile.',
    required_checks: ['Verify seizure history.'],
  });
  assert.ok(html.includes('Elevated theta'));
  assert.ok(html.includes('SMR uptraining'));
  assert.ok(html.includes('Active seizure disorder'));
  assert.ok(html.includes('Verify seizure history.'));
});

// ── Clinician Review ─────────────────────────────────────────────────────────

test('renderClinicianReview returns empty string for null', () => {
  assert.equal(review.renderClinicianReview(null, []), '');
});

test('renderClinicianReview renders state and actions', () => {
  const html = review.renderClinicianReview({
    id: 'r1',
    report_state: 'NEEDS_REVIEW',
    reviewer_id: 'clin_1',
    signed_by: null,
  }, [
    { id: 'f1', finding_text: 'Theta elevation', claim_type: 'OBSERVED', status: 'PENDING', evidence_grade: 'B' },
  ]);
  assert.ok(html.includes('NEEDS_REVIEW'));
  assert.ok(html.includes('Approve'));
  assert.ok(html.includes('Theta elevation'));
});

test('renderClinicianReview shows sign button for approved', () => {
  const html = review.renderClinicianReview({
    id: 'r1',
    report_state: 'APPROVED',
    reviewer_id: 'clin_1',
    signed_by: null,
  }, []);
  assert.ok(html.includes('Sign Report'));
});

test('renderClinicianReview surfaces raw review handoff and claim governance fallback', () => {
  const html = review.renderClinicianReview({
    id: 'r1',
    report_state: 'NEEDS_REVIEW',
    reviewer_id: 'clin_1',
    signed_by: null,
    ai_narrative: {
      raw_review_handoff: {
        cleaning_version_number: 2,
        bad_channels: ['Fp1', 'T7'],
        medication_confounds: ['methylphenidate'],
      },
      local_grounding: {
        source_count: 3,
      },
    },
    claim_governance: [
      { finding_text: 'Theta elevation', claim_type: 'INFERRED', status: 'PENDING', evidence_grade: 'B' },
    ],
  }, []);
  assert.ok(html.includes('Raw Review Handoff'));
  assert.ok(html.includes('Cleaning version v2'));
  assert.ok(html.includes('Fp1, T7'));
  assert.ok(html.includes('methylphenidate'));
  assert.ok(html.includes('Theta elevation'));
  assert.ok(html.includes('Local qEEG Grounding'));
});

// ── Patient Report ───────────────────────────────────────────────────────────

test('renderPatientReport shows not-generated fallback', () => {
  const html = patient.renderPatientReport({ disclaimer: 'Not ready.' });
  assert.ok(html.includes('Not ready.'));
});

test('renderPatientReport renders content', () => {
  const html = patient.renderPatientReport({
    content: {
      executive_summary: 'Summary here.',
      findings: [{ description: 'Finding 1' }],
      protocol_recommendations: [{ name: 'Neurofeedback' }],
    },
    disclaimer: 'For info only.',
  });
  assert.ok(html.includes('Summary here.'));
  assert.ok(html.includes('Finding 1'));
  assert.ok(html.includes('Neurofeedback'));
  assert.ok(html.includes('For info only.'));
});

// ── Timeline ─────────────────────────────────────────────────────────────────

test('renderTimeline shows empty fallback', () => {
  const html = timeline.renderTimeline([]);
  assert.ok(html.includes('No timeline events yet.'));
});

test('renderTimeline renders events sorted', () => {
  const html = timeline.renderTimeline([
    { date: '2024-01-15', event_type: 'qeeg', title: 'Baseline', summary: 'First recording.', status: 'unchanged', source: 'qeeg' },
    { date: '2024-03-10', event_type: 'qeeg', title: 'Follow-up', summary: 'Second recording.', status: 'improved', rci: 1.23, source: 'qeeg' },
  ]);
  assert.ok(html.includes('Baseline'));
  assert.ok(html.includes('Follow-up'));
  assert.ok(html.includes('improved'));
  assert.ok(html.includes('RCI 1.23'));
});

// ── Disclaimer tests ─────────────────────────────────────────────────────────

test('renderSafetyCockpit includes disclaimer when provided', () => {
  const html = safety.renderSafetyCockpit({
    checks: [],
    red_flags: [],
    overall_status: 'VALID_FOR_REVIEW',
    disclaimer: 'Decision-support only.',
  });
  assert.ok(html.includes('Decision-support only.'));
});

test('renderNormativeModelCard includes decision-support disclaimer', () => {
  const html = normative.renderNormativeModelCard({ normative_db_name: 'Test DB', complete: true, limitations: [] });
  assert.ok(html.includes('decision-support information'));
  assert.ok(html.includes('consult your clinician'));
});

test('renderProtocolFit includes decision-support disclaimer', () => {
  const html = protocol.renderProtocolFit({ pattern_summary: 'Test fit', evidence_grade: 'B', off_label_flag: false, clinician_reviewed: false });
  assert.ok(html.includes('decision-support information'));
  assert.ok(html.includes('clinician review'));
});

test('renderTimeline includes decision-support disclaimer', () => {
  const html = timeline.renderTimeline([{ date: '2024-01-15', event_type: 'qeeg', title: 'Baseline', summary: 'First.', status: 'unchanged', source: 'qeeg' }]);
  assert.ok(html.includes('decision-support information'));
});

test('renderPatientReport includes disclaimer even when not in content', () => {
  const html = patient.renderPatientReport({ content: { executive_summary: 'Summary.' } });
  assert.ok(html.includes('informational purposes only'));
});

// ── Edge case: blocked claims in patient report ──────────────────────────────

test('renderPatientReport escapes HTML in content', () => {
  const html = patient.renderPatientReport({ content: { executive_summary: '<script>alert(1)</script>' } });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
