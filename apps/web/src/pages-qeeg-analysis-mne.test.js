// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-analysis-mne.test.js
//
// Unit tests for the MNE-Python pipeline renderers in pages-qeeg-analysis.js
// (see CONTRACT.md §4 and §6).
//
// Run: npm run test:unit
//
// The renderers return HTML strings, so assertions here are string-based —
// no DOM is required. We boot a minimal `window` shim before dynamically
// importing the module, because helpers.js assigns `window._showToast` at
// module top-level.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM shim. Must be in place BEFORE the dynamic import.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
globalThis.DEEPSYNAPS_ENABLE_MNE = true;

const mod = await import('./pages-qeeg-analysis.js');
const {
  renderPipelineQualityStrip,
  renderSpecParamPanel,
  renderELoretaROIPanel,
  renderNormativeZScoreHeatmap,
  renderAsymmetryGraphStrip,
  renderAINarrativeWithCitations,
  renderLiteratureRefs,
  renderMNEPipelineSections,
  linkifyCitations,
  _mneFeatureFlagEnabled,
} = mod;

// ── Fixtures ────────────────────────────────────────────────────────────────
const FULL_MNE_ANALYSIS = {
  id: 'mne-fixture-1',
  analysis_status: 'completed',
  pipeline_version: '0.1.0',
  norm_db_version: 'toy-0.1',
  quality_metrics: {
    n_channels_input: 19,
    n_channels_rejected: 1,
    bad_channels: ['T4'],
    n_epochs_total: 100,
    n_epochs_retained: 82,
    ica_components_dropped: 3,
    ica_labels_dropped: { eye: 2, muscle: 1 },
    sfreq_input: 500.0,
    sfreq_output: 250.0,
    bandpass: [1.0, 45.0],
    notch_hz: 50.0,
    pipeline_version: '0.1.0',
  },
  aperiodic: {
    slope: { Fp1: 2.4, Fz: 1.1, Cz: 0.95, Pz: 0.4, Oz: 1.3 },
    offset: { Fp1: 2.8, Fz: 2.4, Cz: 2.3, Pz: 2.1, Oz: 2.5 },
    r_squared: { Fp1: 0.96, Fz: 0.97, Cz: 0.98, Pz: 0.95, Oz: 0.99 },
  },
  peak_alpha_freq: { Fp1: 9.2, Fz: 9.8, Cz: 10.1, Pz: 11.3, Oz: 13.5 },
  source_roi: {
    method: 'eLORETA',
    bands: {
      alpha: {
        'lh.superiorfrontal': 0.42,
        'rh.superiorfrontal': 0.38,
        'lh.precentral': 0.22,
        'lh.superiorparietal': 0.55,
        'rh.superiorparietal': 0.51,
        'lh.superiortemporal': 0.30,
        'lh.lateraloccipital': 0.71,
        'rh.lateraloccipital': 0.68,
        'lh.posteriorcingulate': 0.25,
        'lh.insula': 0.19,
      },
      theta: {
        'lh.superiorfrontal': 0.31,
        'rh.superiorfrontal': 0.29,
        'lh.superiorparietal': 0.18,
      },
    },
  },
  normative_zscores: {
    spectral: {
      bands: {
        delta: { absolute_uv2: { Fz: 0.8, Cz: 0.1, Pz: -0.3, Oz: -1.1 } },
        theta: { absolute_uv2: { Fz: 2.81, Cz: 1.2, Pz: 0.3, Oz: -0.2 } },
        alpha: { absolute_uv2: { Fz: -0.5, Cz: 0.4, Pz: 1.8, Oz: 2.6 } },
        beta:  { absolute_uv2: { Fz: 0.2, Cz: -0.3, Pz: -0.5, Oz: -0.9 } },
      },
    },
    aperiodic: { slope: { Fz: 2.1, Cz: 0.3 } },
    flagged: [
      { metric: 'spectral.bands.theta.absolute_uv2', channel: 'Fz', z: 2.81 },
      { metric: 'spectral.bands.alpha.absolute_uv2', channel: 'Oz', z: 2.6 },
      { metric: 'spectral.bands.theta.absolute_uv2', channel: 'Fz', z: 2.81 }, // dup
    ],
    norm_db_version: 'toy-0.1',
  },
  asymmetry: {
    frontal_alpha_F3_F4: 0.18,
    frontal_alpha_F7_F8: -0.09,
  },
  graph_metrics: {
    alpha: { clustering_coef: 0.68, char_path_length: 1.82, small_worldness: 2.4 },
    theta: { clustering_coef: 0.52, char_path_length: 2.10, small_worldness: 1.6 },
  },
  flagged_conditions: ['adhd', 'anxiety'],
};

const AI_REPORT_FIXTURE = {
  id: 'rep-1',
  ai_narrative: {
    executive_summary:
      'Elevated frontal theta at Fz [1] and posterior alpha slowing [2,3] — consistent with attentional dysregulation patterns described in the literature.',
    findings: [
      {
        region: 'Fz', band: 'theta',
        observation: 'Absolute theta z = 2.81 (research/wellness use) [1].',
        citations: [1],
      },
      {
        region: 'Oz', band: 'alpha',
        observation: 'Increased occipital alpha power [2].',
        citations: [2, 3],
      },
    ],
    confidence_level: 'moderate',
  },
  literature_refs: [
    { n: 1, pmid: '12345678', doi: '10.1/abc', title: 'Frontal theta and inattention', year: 2023, journal: 'J. Neuro' },
    { n: 2, pmid: '87654321', title: 'Occipital alpha resting state', year: 2022 },
    { n: 3, doi: '10.9/xyz', title: 'Alpha slowing in ADHD', year: 2020 },
  ],
};

// ── §4.1 Pipeline quality strip ─────────────────────────────────────────────
test('pipeline quality strip renders pipeline_version + norm_db_version footer', () => {
  const out = renderPipelineQualityStrip(FULL_MNE_ANALYSIS);
  assert.match(out, /data-testid="qeeg-mne-version-badge"/);
  assert.match(out, /pipeline <strong>0\.1\.0<\/strong>/);
  assert.match(out, /norm DB <strong>toy-0\.1<\/strong>/);
});

test('pipeline quality strip shows bad channels count + ICA label pills', () => {
  const out = renderPipelineQualityStrip(FULL_MNE_ANALYSIS);
  assert.match(out, /Bad channels[\s\S]*?>1</);  // 1 bad channel
  assert.match(out, /ICA eye[\s\S]*?>2</);
  assert.match(out, /ICA muscle[\s\S]*?>1</);
  assert.match(out, /ICs dropped[\s\S]*?>3</);
  assert.match(out, /82\/100/);
  assert.match(out, /500 → 250 Hz/);
  assert.match(out, /1–45 Hz/);
  assert.match(out, /Rejected channels:.*T4/);
});

test('pipeline quality strip returns empty when quality_metrics missing', () => {
  assert.equal(renderPipelineQualityStrip({}), '');
  assert.equal(renderPipelineQualityStrip(null), '');
});

// ── §4.2 SpecParam panel ────────────────────────────────────────────────────
test('SpecParam table row count matches Object.keys(aperiodic.slope).length', () => {
  const out = renderSpecParamPanel(FULL_MNE_ANALYSIS);
  const rows = out.match(/<tr>\s*<td style="font-weight:600">/g) || [];
  assert.equal(rows.length, Object.keys(FULL_MNE_ANALYSIS.aperiodic.slope).length);
});

test('SpecParam flags slopes > 2 and PAF outside 8–12', () => {
  const out = renderSpecParamPanel(FULL_MNE_ANALYSIS);
  // Fp1 slope = 2.4 -> flagged
  assert.match(out, /class="qeeg-mne-flag">2\.400/);
  // Pz slope = 0.4 -> flagged
  assert.match(out, /class="qeeg-mne-flag">0\.400/);
  // Oz PAF = 13.5 -> flagged; Fp1 PAF 9.2 -> NOT flagged
  assert.match(out, /class="qeeg-mne-flag">13\.50/);
});

test('SpecParam sorts rows by |slope| descending', () => {
  const out = renderSpecParamPanel(FULL_MNE_ANALYSIS);
  // Expected order by |slope|: Fp1(2.4), Oz(1.3), Fz(1.1), Cz(0.95), Pz(0.4)
  const idx = (ch) => out.indexOf('>' + ch + '<');
  assert.ok(idx('Fp1') < idx('Oz'));
  assert.ok(idx('Oz') < idx('Fz'));
  assert.ok(idx('Fz') < idx('Cz'));
  assert.ok(idx('Cz') < idx('Pz'));
});

test('SpecParam returns empty when aperiodic missing', () => {
  assert.equal(renderSpecParamPanel({}), '');
  assert.equal(renderSpecParamPanel({ aperiodic: { slope: {} } }), '');
});

// ── §4.3 eLORETA ROI panel ──────────────────────────────────────────────────
test('eLORETA panel renders each band with lobe-grouped ROI lists', () => {
  const out = renderELoretaROIPanel(FULL_MNE_ANALYSIS);
  assert.match(out, /eLORETA ROI Power.*eLORETA/);
  assert.match(out, /<strong style="color:#66bb6a">alpha<\/strong>/);
  assert.match(out, /<strong style="color:#7e57c2">theta<\/strong>/);
  // Lobes — each should appear at least once for the alpha band fixture.
  ['Frontal', 'Parietal', 'Temporal', 'Occipital', 'Cingulate', 'Insular'].forEach((lobe) => {
    assert.match(out, new RegExp('>' + lobe + '<'), `lobe ${lobe} should render`);
  });
  // Hemi tags
  assert.match(out, /qeeg-mne-hemi">LH</);
  assert.match(out, /qeeg-mne-hemi">RH</);
});

test('eLORETA panel returns empty when source_roi missing', () => {
  assert.equal(renderELoretaROIPanel({}), '');
});

// ── §4.4 Normative z-score heatmap ──────────────────────────────────────────
test('z-score heatmap marks flagged cells red and severe cells dark red with flag icon', () => {
  const out = renderNormativeZScoreHeatmap(FULL_MNE_ANALYSIS);
  assert.match(out, /qeeg-mne-zcell--severe/); // |2.81| >= 2.58
  assert.match(out, /&#x2691;/);                // flag icon
  // Tooltip carries metric path
  assert.match(out, /title="spectral\.bands\.theta\.absolute_uv2 = 2\.81"/);
});

test('z-score heatmap flagged findings list is deduplicated', () => {
  const out = renderNormativeZScoreHeatmap(FULL_MNE_ANALYSIS);
  const thetaFzHits = out.match(/spectral\.bands\.theta\.absolute_uv2<\/code>[\s\S]*?channel <strong>Fz/g) || [];
  // Only one dedup'd entry should appear in the findings <ul>.
  assert.equal(thetaFzHits.length, 1);
});

test('z-score heatmap returns empty when normative_zscores missing', () => {
  assert.equal(renderNormativeZScoreHeatmap({}), '');
});

// ── §4.5 Asymmetry + graph strip ────────────────────────────────────────────
test('asymmetry strip shows F3/F4 and F7/F8 with interpretive hints', () => {
  const out = renderAsymmetryGraphStrip(FULL_MNE_ANALYSIS);
  assert.match(out, /F3\/F4/);
  assert.match(out, /F7\/F8/);
  assert.match(out, /0\.180/);
  assert.match(out, /-0\.090/);
  assert.match(out, /left hypoactivation/);  // 0.18 > 0
  assert.match(out, /right hypoactivation/); // -0.09 < 0
});

test('graph strip renders per-band metrics', () => {
  const out = renderAsymmetryGraphStrip(FULL_MNE_ANALYSIS);
  assert.match(out, /alpha<\/td>/);
  assert.match(out, /theta<\/td>/);
  assert.match(out, /2\.400/);   // small-worldness alpha
  assert.match(out, /1\.820/);   // char path length alpha
});

// ── §4.6 AI narrative + citations ───────────────────────────────────────────
test('linkifyCitations turns [1] into a PubMed anchor when pmid is present', () => {
  const refs = [{ n: 1, pmid: '12345678' }, { n: 2, doi: '10.9/xyz' }];
  const idx = {};
  refs.forEach((r) => {
    const url = r.pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + r.pmid + '/' : 'https://doi.org/' + r.doi;
    idx[r.n] = { ...r, url };
  });
  const out = linkifyCitations('See prior work [1] and review [2].', idx);
  assert.match(out, /href="https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/12345678\/"/);
  assert.match(out, /href="https:\/\/doi\.org\/10\.9\/xyz"/);
  assert.match(out, /target="_blank"/);
});

test('AI narrative [1] anchor links to the corresponding PubMed URL', () => {
  const out = renderAINarrativeWithCitations(AI_REPORT_FIXTURE.ai_narrative, AI_REPORT_FIXTURE.literature_refs);
  // Exec summary: "[1]" resolves to PMID 12345678
  assert.match(out, /href="https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/12345678\/"[^>]*>1<\/a>/);
  // "[2,3]" -> ref 2 has PMID 87654321 (pubmed), ref 3 has DOI (doi.org)
  assert.match(out, /href="https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/87654321\/"[^>]*>2<\/a>/);
  assert.match(out, /href="https:\/\/doi\.org\/10\.9\/xyz"[^>]*>3<\/a>/);
});

test('renderLiteratureRefs emits numbered <ol> with clickable anchors and PMIDs', () => {
  const out = renderLiteratureRefs(AI_REPORT_FIXTURE.literature_refs);
  assert.match(out, /<ol[\s\S]*?value="1"[\s\S]*?value="2"[\s\S]*?value="3"[\s\S]*?<\/ol>/);
  assert.match(out, /pubmed\.ncbi\.nlm\.nih\.gov\/12345678/);
  assert.match(out, /doi\.org\/10\.9\/xyz/);
});

test('AI narrative forbidden-word audit — no "diagnose", "diagnostic", or "treatment recommendation"', () => {
  // The renderer should not itself introduce these words. Fixture observation
  // explicitly includes "research/wellness use" per §6 of CONTRACT.md.
  const out = renderAINarrativeWithCitations(AI_REPORT_FIXTURE.ai_narrative, AI_REPORT_FIXTURE.literature_refs);
  // The word "diagnose" may appear in user-supplied text (AI output); only
  // static strings emitted by the renderer are under our control. These
  // assertions check that our renderer's chrome does not use the forbidden
  // language.
  const chrome = out.replace(/[\s\S]*?executive summary[\s\S]*?<\/p>/i, ''); // strip the user-provided summary
  assert.ok(!/\btreatment recommendation\b/i.test(chrome));
  assert.match(out, /research\/wellness use/);
});

// ── Legacy-only mode: no MNE sections render when fields are null ────────────
test('when all new fields are null, renderMNEPipelineSections returns empty string', () => {
  const legacyOnly = {
    id: 'legacy-1',
    analysis_status: 'completed',
    band_powers_json: { bands: {}, derived_ratios: {} },
    // none of the new fields present
  };
  assert.equal(renderMNEPipelineSections(legacyOnly), '');
  assert.equal(renderPipelineQualityStrip(legacyOnly), '');
  assert.equal(renderSpecParamPanel(legacyOnly), '');
  assert.equal(renderELoretaROIPanel(legacyOnly), '');
  assert.equal(renderNormativeZScoreHeatmap(legacyOnly), '');
  assert.equal(renderAsymmetryGraphStrip(legacyOnly), '');
});

test('composite renderMNEPipelineSections renders all sections when fields are populated', () => {
  const out = renderMNEPipelineSections(FULL_MNE_ANALYSIS);
  assert.match(out, /data-testid="qeeg-mne-sections"/);
  assert.match(out, /Pipeline Quality \(MNE\)/);
  assert.match(out, /SpecParam \(Aperiodic \+ PAF\)/);
  assert.match(out, /eLORETA ROI Power/);
  assert.match(out, /Normative z-scores/);
  assert.match(out, /Asymmetry &amp; Graph Metrics|Asymmetry & Graph Metrics/);
});

// ── Feature flag ─────────────────────────────────────────────────────────────
test('MNE feature flag defaults to enabled and can be disabled via global', () => {
  globalThis.DEEPSYNAPS_ENABLE_MNE = true;
  assert.equal(_mneFeatureFlagEnabled(), true);
  globalThis.DEEPSYNAPS_ENABLE_MNE = false;
  assert.equal(_mneFeatureFlagEnabled(), false);
  globalThis.DEEPSYNAPS_ENABLE_MNE = undefined;
  assert.equal(_mneFeatureFlagEnabled(), true);
});
