// ─────────────────────────────────────────────────────────────────────────────
// qeeg-brain-map-faa-rename.test.js
//
// Regression test for the QEEG evidence-citation audit (2026-04-30) follow-up:
// the user-facing indicator label for `brain_balance` was renamed from
// "Brain Balance" to "Frontal Alpha Asymmetry (FAA)" because the underlying
// construct is FAA — which has research-grade support but is NOT regulatory-
// cleared. The contract dict key `brain_balance` is intentionally unchanged
// (see deepsynaps-qeeg-evidence-gaps.md).
//
// This test guards against accidental regressions of either side of that rule:
//   1. The old "Brain Balance" label MUST NOT reappear in rendered HTML.
//   2. The new "Frontal Alpha Asymmetry" label MUST appear.
//   3. The payload key `brain_balance` MUST remain consumable as-is.
//
// Run via the apps/web test:unit script (node --test, NOT vitest — see
// deepsynaps-web-test-runner-node-test.md).
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { getElementById: function () { return null; } };
}

const tpl = await import('./qeeg-brain-map-template.js');
const patient = await import('./qeeg-patient-report.js');

function indicatorsPayload() {
  return {
    tbr: { value: 4.1, unit: 'ratio', percentile: 77.8, band: 'balanced' },
    occipital_paf: { value: 8.8, unit: 'Hz', percentile: 22.2, band: 'balanced' },
    alpha_reactivity: { value: 1.4, unit: 'EO/EC', percentile: 35.0, band: 'balanced' },
    brain_balance: { value: 0.1, unit: 'laterality', percentile: 41.7, band: 'balanced' },
    ai_brain_age: { value: 9.3, unit: 'years', percentile: null, band: null },
  };
}

test('renderIndicatorGrid: brain_balance card uses FAA label, not "Brain Balance"', function () {
  var html = tpl.renderIndicatorGrid(indicatorsPayload());
  assert.match(html, /Frontal Alpha Asymmetry/, 'expected FAA label to appear');
  assert.match(html, /FAA/, 'expected the (FAA) abbreviation in the label');
  assert.equal(
    /Brain Balance/.test(html),
    false,
    'old "Brain Balance" UI label must not appear in rendered indicator grid'
  );
});

test('renderIndicatorGrid: brain_balance contract field key still renders the card', function () {
  // Contract stability: the payload key `brain_balance` is non-negotiable.
  // Confirm the renderer reads it and surfaces the value (0.1) and percentile.
  var html = tpl.renderIndicatorGrid(indicatorsPayload());
  assert.match(html, /0\.1/, 'expected indicator value 0.1 to render');
  assert.match(html, /41\.7%ile/, 'expected indicator percentile 41.7%ile to render');
});

test('renderIndicatorGrid: omits FAA card if brain_balance is missing (still no old label)', function () {
  var html = tpl.renderIndicatorGrid({
    tbr: { value: 4.1, unit: 'ratio', percentile: 77.8, band: 'balanced' },
  });
  // Card label is rendered for all 5 slots (with em-dash placeholder for missing data).
  // The FAA label must still appear; the old label must not.
  assert.match(html, /Frontal Alpha Asymmetry/);
  assert.equal(/Brain Balance/.test(html), false);
});

test('patient renderer: FAA label appears, "Brain Balance" does not', function () {
  // Smoke-test the full patient renderer, not just the helper, to make sure
  // no other surface re-introduces the old label.
  var report = {
    header: { client_name: 'Demo Patient', sex: 'F', age_years: 30 },
    indicators: indicatorsPayload(),
    brain_function_score: { score_0_100: 60.0, formula_version: 'phase0_placeholder_v1', scatter_dots: [] },
    lobe_summary: {
      frontal: { lt_percentile: 50, rt_percentile: 50, lt_band: 'balanced', rt_band: 'balanced' },
      temporal: { lt_percentile: 50, rt_percentile: 50, lt_band: 'balanced', rt_band: 'balanced' },
      parietal: { lt_percentile: 50, rt_percentile: 50, lt_band: 'balanced', rt_band: 'balanced' },
      occipital: { lt_percentile: 50, rt_percentile: 50, lt_band: 'balanced', rt_band: 'balanced' },
    },
    source_map: { topomap_url: null, dk_roi_zscores: [] },
    dk_atlas: [],
    ai_narrative: { executive_summary: '', findings: [], protocol_recommendations: [], citations: [] },
    quality: { n_clean_epochs: 80, channels_used: [], qc_flags: [], confidence: {}, method_provenance: {}, limitations: [] },
    provenance: { schema_version: '1.0.0', pipeline_version: '0.5.0', norm_db_version: 'v1', file_hash: 'a'.repeat(64), generated_at: '2026-04-30T09:00:00Z' },
    disclaimer: 'Research and wellness use only. This brain map summary is informational and is not a medical diagnosis or treatment recommendation. Discuss any findings with a qualified clinician.',
  };
  var html = patient.renderPatientReport(report);
  assert.match(html, /Frontal Alpha Asymmetry/);
  assert.equal(
    /Brain Balance/.test(html),
    false,
    'patient report must not contain the old "Brain Balance" label'
  );
});
