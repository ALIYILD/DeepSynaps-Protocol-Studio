// ─────────────────────────────────────────────────────────────────────────────
// qeeg-brain-map-template.test.js
//
// Tests for the Phase-1 patient + clinician renderers and the shared section
// helpers. Validates that:
//   - the template helpers escape user input
//   - the patient + clinician renderers consume the QEEGBrainMapReport contract
//     from Phase 0
//   - regulatory copy never includes "diagnosis"/"diagnostic"/"treatment
//     recommendation" (except inside the "not a medical diagnosis" disclaimer
//     phrase)
//   - the legacy `{content: ...}` shape still renders for backwards compat
//
// Run: npm run test:unit
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  // Minimal DOM shim so mount* functions don't blow up on import
  globalThis.document = { getElementById: function () { return null; } };
}

const tpl = await import('./qeeg-brain-map-template.js');
const patient = await import('./qeeg-patient-report.js');
const clinician = await import('./qeeg-clinician-report.js');

// ── Fixture: a minimal but contract-shaped QEEGBrainMapReport payload ───────

function fixtureReport(overrides) {
  var dk = [];
  var rois = ['rostralmiddlefrontal', 'superiorfrontal', 'precuneus', 'lateraloccipital'];
  var lobes = { rostralmiddlefrontal: 'frontal', superiorfrontal: 'frontal', precuneus: 'parietal', lateraloccipital: 'occipital' };
  var codes = { rostralmiddlefrontal: 'F5', superiorfrontal: 'F7', precuneus: 'P5', lateraloccipital: 'O1' };
  rois.forEach(function (roi) {
    ['lh', 'rh'].forEach(function (h) {
      dk.push({
        code: codes[roi], roi: roi, name: roi.replace(/([A-Z])/g, ' $1'),
        lobe: lobes[roi], hemisphere: h,
        lt_percentile: h === 'lh' ? 47.6 : null,
        rt_percentile: h === 'rh' ? 46.4 : null,
        z_score: h === 'lh' ? -0.8 : 0.3,
        functions: ['Working memory and execution.'],
        decline_symptoms: ['Poor concentration.'],
      });
    });
  });
  var report = {
    header: { client_name: 'Demo Patient', sex: 'M', dob: '2018-05-20', age_years: 7.4, eeg_acquisition_date: '2025-10-13', eyes_condition: 'eyes_closed' },
    indicators: {
      tbr: { value: 4.1, unit: 'ratio', percentile: 77.8, band: 'balanced' },
      occipital_paf: { value: 8.8, unit: 'Hz', percentile: 22.2, band: 'balanced' },
      alpha_reactivity: { value: 1.4, unit: 'EO/EC', percentile: 35.0, band: 'balanced' },
      brain_balance: { value: 0.12, unit: 'laterality', percentile: 41.7, band: 'balanced' },
      ai_brain_age: { value: 9.3, unit: 'years', percentile: null, band: null },
    },
    brain_function_score: { score_0_100: 59.1, formula_version: 'phase0_placeholder_v1', scatter_dots: [] },
    lobe_summary: {
      frontal: { lt_percentile: 47.6, rt_percentile: 46.4, lt_band: 'balanced', rt_band: 'balanced' },
      temporal: { lt_percentile: 50.5, rt_percentile: 52.5, lt_band: 'balanced', rt_band: 'balanced' },
      parietal: { lt_percentile: 75.2, rt_percentile: 76.9, lt_band: 'balanced', rt_band: 'balanced' },
      occipital: { lt_percentile: 66.1, rt_percentile: 57.8, lt_band: 'balanced', rt_band: 'balanced' },
    },
    source_map: { topomap_url: '/static/topomaps/abc.png', dk_roi_zscores: [] },
    dk_atlas: dk,
    ai_narrative: {
      executive_summary: 'Within typical range overall.',
      findings: [{ description: 'adhd_pattern_watch', severity: 'watch', related_rois: [] }],
      protocol_recommendations: [],
      citations: [{ pmid: '12345', doi: '10.1000/xyz', title: 'Sample paper', year: 2024 }],
    },
    quality: {
      n_clean_epochs: 84,
      channels_used: ['Fp1', 'Fp2', 'F3', 'F4'],
      qc_flags: [],
      confidence: { global: 0.78 },
      method_provenance: { ica: 'picard', n_components: '0.99' },
      limitations: ['template fsaverage source model'],
    },
    provenance: { schema_version: '1.0.0', pipeline_version: '0.5.0', norm_db_version: 'lemip+hbn-v1', file_hash: 'a'.repeat(64), generated_at: '2026-04-30T09:00:00Z' },
    disclaimer: 'Research and wellness use only. This brain map summary is informational and is not a medical diagnosis or treatment recommendation. Discuss any findings with a qualified clinician.',
  };
  return Object.assign(report, overrides || {});
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _stripDisclaimerPhrase(html) {
  // Remove the regulatory phrase "not a medical diagnosis" so subsequent
  // greps for the bare word "diagnosis" don't false-positive on it.
  return html.replace(/not a medical diagnosis or treatment recommendation/gi, '');
}

// ── Template helper tests ───────────────────────────────────────────────────

test('esc escapes ampersand and angle brackets', function () {
  assert.equal(tpl.esc('<script>&"'), '&lt;script&gt;&amp;&quot;');
  assert.equal(tpl.esc(null), '');
});

test('fmtPct rounds and appends suffix', function () {
  assert.equal(tpl.fmtPct(75.2345), '75.2%ile');
  assert.equal(tpl.fmtPct(null), '—');
});

test('fmtZ formats with leading sign', function () {
  assert.equal(tpl.fmtZ(1.234), '+1.23');
  assert.equal(tpl.fmtZ(-0.5), '-0.50');
  assert.equal(tpl.fmtZ(null), '—');
});

test('renderBrainMapHeader includes patient meta', function () {
  var html = tpl.renderBrainMapHeader({ client_name: 'Test', sex: 'F', age_years: 25, eeg_acquisition_date: '2025-01-01', eyes_condition: 'eyes_closed' }, { variant: 'patient' });
  assert.match(html, /Brain Function Mapping/);
  assert.match(html, /Test/);
  assert.match(html, /25\.0/);
  assert.match(html, /eyes closed/);
});

test('renderIndicatorGrid renders all 5 indicator cards', function () {
  var html = tpl.renderIndicatorGrid(fixtureReport().indicators);
  assert.match(html, /Frontal Lobe Development/);
  assert.match(html, /Information Processing Speed/);
  assert.match(html, /Alpha Wave Reactivity/);
  // The "Brain Balance" indicator was renamed to "Frontal Alpha Asymmetry (FAA)"
  // per the QEEG evidence-citation audit (2026-04-30). The contract field
  // `brain_balance` is unchanged; only the user-facing label moved.
  assert.match(html, /Frontal Alpha Asymmetry/);
  assert.equal(/Brain Balance/.test(html), false, 'old "Brain Balance" UI label must not appear');
  assert.match(html, /AI Brain Development Age/);
});

test('renderLobeTable renders 4 lobes with L/R percentiles', function () {
  var html = tpl.renderLobeTable(fixtureReport().lobe_summary);
  ['Frontal', 'Temporal', 'Parietal', 'Occipital'].forEach(function (l) {
    assert.match(html, new RegExp(l));
  });
  assert.match(html, /75\.2%ile/); // parietal lt
});

test('renderAllLobeSections groups regions by lobe and merges hemispheres', function () {
  var html = tpl.renderAllLobeSections(fixtureReport().dk_atlas);
  assert.match(html, /Frontal Lobe/);
  assert.match(html, /Parietal Lobe/);
  assert.match(html, /Occipital Lobe/);
  assert.match(html, /F5/);
  assert.match(html, /Working memory/);
});

test('renderCitations links PMIDs and DOIs', function () {
  var html = tpl.renderCitations([{ pmid: '12345', title: 'Sample' }, { doi: '10.1/x', title: 'Other' }]);
  assert.match(html, /pubmed\.ncbi\.nlm\.nih\.gov\/12345/);
  assert.match(html, /doi\.org\/10\.1/);
});

test('renderDisclaimer always contains the regulatory phrase', function () {
  var html = tpl.renderDisclaimer(fixtureReport(), 'patient');
  assert.match(html, /not a medical diagnosis/i);
  assert.match(html, /research and wellness/i);
});

test('emptyState renders without errors', function () {
  var html = tpl.emptyState('No data');
  assert.match(html, /No data/);
});

// ── Patient renderer ─────────────────────────────────────────────────────────

test('renderPatientReport renders all sections of the contract', function () {
  var html = patient.renderPatientReport(fixtureReport());
  assert.match(html, /Brain Function Mapping/);                // header
  assert.match(html, /Frontal Lobe Development/);              // indicators
  assert.match(html, /Brain Source Image/);                    // source map
  assert.match(html, /Brain Activity by Hemisphere/);          // lobe table
  assert.match(html, /Standardized Brain Function Score/);     // BFS
  assert.match(html, /Frontal Lobe/);                          // lobe section
  assert.match(html, /Parietal Lobe/);
  assert.match(html, /Occipital Lobe/);
  assert.match(html, /59\.1/);                                  // BFS value
  assert.match(html, /Disclaimer/);
});

test('renderPatientReport empty state when no report passed', function () {
  var html = patient.renderPatientReport(null);
  assert.match(html, /No brain map yet/);
});

test('renderPatientReport falls back to legacy {content} shape', function () {
  var legacy = {
    content: { executive_summary: 'Legacy summary', findings: [{ description: 'old finding' }] },
    disclaimer: 'Research and wellness use only. Not a medical diagnosis or treatment recommendation.',
  };
  var html = patient.renderPatientReport(legacy);
  assert.match(html, /Legacy summary/);
  assert.match(html, /old finding/);
});

test('renderPatientReport unwraps a stringified report_payload', function () {
  var report = { report_payload: JSON.stringify(fixtureReport()) };
  var html = patient.renderPatientReport(report);
  assert.match(html, /Demo Patient/);
});

test('renderPatientReport prefers patient-facing payload over mixed clinician payload', function () {
  var mixed = fixtureReport({
    ai_narrative: {
      executive_summary: 'Clinician summary should not win.',
      findings: [{ description: 'clinician finding', clinician_only: true }],
    },
    patient_facing_report: {
      content: {
        executive_summary: 'Patient-safe summary.',
        findings: [{ description: 'patient-safe finding' }],
      },
      disclaimer: 'Patient-safe disclaimer.',
    },
    raw_review_handoff: { bad_channels: ['Fp1'] },
    local_grounding: { anchors: ['internal'] },
  });
  var html = patient.renderPatientReport(mixed);
  assert.match(html, /Patient-safe summary/);
  assert.match(html, /patient-safe finding/);
  assert.doesNotMatch(html, /Clinician summary should not win/);
  assert.doesNotMatch(html, /Fp1/);
});

test('renderPatientReport strips clinician-only findings from mixed payloads', function () {
  var html = patient.renderPatientReport({
    patient_facing_payload: {
      content: {
        executive_summary: 'Summary here.',
        findings: [
          { description: 'Patient-safe finding' },
          { description: 'Clinician-only finding', clinician_only: true },
        ],
      },
      disclaimer: 'For info only.',
    },
  });
  assert.match(html, /Patient-safe finding/);
  assert.doesNotMatch(html, /Clinician-only finding/);
});

test('patient report contains no banned regulatory terms', function () {
  var html = _stripDisclaimerPhrase(patient.renderPatientReport(fixtureReport()));
  assert.equal(/\bdiagnosis\b/i.test(html), false, 'patient report contains "diagnosis"');
  assert.equal(/\bdiagnostic\b/i.test(html), false, 'patient report contains "diagnostic"');
  assert.equal(/\btreatment recommendation\b/i.test(html), false, 'patient report contains "treatment recommendation"');
  assert.equal(/\bcure\b/i.test(html), false, 'patient report contains "cure"');
});

// ── Clinician renderer ───────────────────────────────────────────────────────

test('renderClinicianReport renders DK atlas table + provenance + citations', function () {
  var html = clinician.renderClinicianReport(fixtureReport());
  assert.match(html, /qEEG Brain Map — Clinician Review/);
  assert.match(html, /DK Atlas — 68 ROI z-scores/);
  assert.match(html, /Method &amp; Provenance/);
  assert.match(html, /Schema version/);
  assert.match(html, /Citations/);
  assert.match(html, /pubmed\.ncbi\.nlm\.nih\.gov/);
  assert.match(html, /Confidence/);
  assert.match(html, /global/);
});

test('clinician report contains no banned regulatory terms', function () {
  var html = _stripDisclaimerPhrase(clinician.renderClinicianReport(fixtureReport()));
  assert.equal(/\bdiagnosis\b/i.test(html), false, 'clinician report contains "diagnosis"');
  assert.equal(/\bdiagnostic\b/i.test(html), false, 'clinician report contains "diagnostic"');
  assert.equal(/\btreatment recommendation\b/i.test(html), false, 'clinician report contains "treatment recommendation"');
});

test('renderClinicianReport empty state when payload missing', function () {
  var html = clinician.renderClinicianReport(null);
  assert.match(html, /No brain map report available/);
});
