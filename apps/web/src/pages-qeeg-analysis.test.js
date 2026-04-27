/**
 * Tests for the qEEG Analyzer renderer + upload/poll helpers.
 *
 * Run from apps/web/:
 *   node --test src/pages-qeeg-analysis.test.js
 *
 * Pure-logic tests — no DOM assertions. We feed fixture payloads through the
 * exported render* functions and check for expected substrings. This is the
 * same style used in the other apps/web/src/*.test.js files.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDkRoi,
  groupRoisByLobe,
  zscoreCellStyle,
  slopeColor,
  pafColor,
  isLegacyAnalysis,
  perChannelBandPowers,
  pollAnalysisUntilDone,
  renderQualityStrip,
  renderSpecParam,
  renderSourceRoi,
  renderZscoreHeatmap,
  renderAsymmetryGraph,
  renderAiNarrative,
  renderAnalyzerDetail,
  renderComparison,
  buildSurveyFromForm,
  isEdfLikeFile,
} from './pages-qeeg-analysis.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function fullContractAnalysis() {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    patient_id: 'p1',
    analysis_status: 'completed',
    recording_date: '2026-04-20',
    eyes_condition: 'eyes_closed',
    pipeline_version: '0.1.0',
    norm_db_version: 'toy-0.1',
    band_powers: {
      bands: {
        alpha: { channels: {
          Fp1: { absolute_uv2: 3.1 },
          Fp2: { absolute_uv2: 3.4 },
          Fz:  { absolute_uv2: 5.2 },
        } },
        beta: { channels: {
          Fp1: { absolute_uv2: 1.1 },
          Fp2: { absolute_uv2: 1.0 },
          Fz:  { absolute_uv2: 1.8 },
        } },
      },
    },
    aperiodic: {
      slope: { Fp1: -1.2, Fp2: -3.1, Fz: -0.3 },
      offset: { Fp1: 0.9, Fp2: 1.0, Fz: 0.4 },
      r_squared: { Fp1: 0.93, Fp2: 0.88, Fz: 0.77 },
    },
    peak_alpha_freq: { Fp1: 10.1, Fp2: 8.4, Fz: null },
    asymmetry: {
      frontal_alpha_F3_F4: 0.08,
      frontal_alpha_F7_F8: -0.02,
    },
    graph_metrics: {
      alpha: { clustering_coef: 0.52, char_path_length: 1.8, small_worldness: 1.12 },
      beta:  { clustering_coef: 0.41, char_path_length: 2.0, small_worldness: 1.05 },
    },
    source_roi: {
      method: 'eLORETA',
      roi_band_power: {
        alpha: {
          'lh-superiorfrontal': 4.2,
          'rh-superiorfrontal': 4.1,
          'lh-lateraloccipital': 2.1,
          'lh-superiortemporal': 1.9,
          'lh-insula': 0.8,
          'lh-rostralanteriorcingulate': 1.2,
        },
      },
    },
    normative_zscores: {
      spectral: {
        bands: {
          alpha: { absolute_uv2: { Fp1: -0.4, Fp2: 2.81, Fz: 1.97 } },
          beta:  { absolute_uv2: { Fp1: 0.5, Fp2: -2.65, Fz: 0.1 } },
        },
      },
      flagged: [
        { metric: 'spectral.bands.alpha.absolute_uv2', channel: 'Fp2', z: 2.81 },
        { metric: 'spectral.bands.beta.absolute_uv2',  channel: 'Fp2', z: -2.65 },
      ],
      norm_db_version: 'toy-0.1',
    },
    quality_metrics: {
      n_channels_input: 19,
      n_channels_rejected: 2,
      bad_channels: ['T3', 'Oz'],
      n_epochs_total: 120,
      n_epochs_retained: 110,
      ica_components_dropped: 3,
      ica_labels_dropped: { eye: 2, muscle: 1 },
      sfreq_input: 500,
      sfreq_output: 250,
      bandpass: [1.0, 45.0],
      notch_hz: 50,
      pipeline_version: '0.1.0',
    },
  };
}

function legacyAnalysis() {
  return {
    id: 'aaaa-bbbb',
    analysis_status: 'completed',
    delta_power: 1.2,
    theta_power: 3.4,
    alpha_power: 5.6,
    beta_power: 2.1,
    gamma_power: 0.8,
  };
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

test('classifyDkRoi maps left/right DK ROIs into lobes', () => {
  assert.equal(classifyDkRoi('lh-superiorfrontal'), 'frontal');
  assert.equal(classifyDkRoi('rh-superiorfrontal'), 'frontal');
  assert.equal(classifyDkRoi('lh-lateraloccipital'), 'occipital');
  assert.equal(classifyDkRoi('rh-insula'), 'insular');
  assert.equal(classifyDkRoi('rostralanteriorcingulate'), 'cingulate');
  assert.equal(classifyDkRoi('completely-bogus-roi'), null);
  assert.equal(classifyDkRoi(null), null);
});

test('groupRoisByLobe sorts per-lobe descending by value', () => {
  const grouped = groupRoisByLobe({
    'lh-superiorfrontal': 4.0,
    'lh-rostralmiddlefrontal': 6.2,
    'lh-lateraloccipital': 1.1,
    'bogus': 0.5,
  });
  assert.equal(grouped.frontal.length, 2);
  assert.equal(grouped.frontal[0].value, 6.2);
  assert.equal(grouped.occipital.length, 1);
  assert.equal(grouped.other.length, 1);
});

test('zscoreCellStyle: thresholds colour correctly', () => {
  const strong = zscoreCellStyle(3.0);
  assert.ok(/220, 38, 38/.test(strong.bg));
  const mild = zscoreCellStyle(2.0);
  assert.ok(/248, 113, 113/.test(mild.bg));
  const neg = zscoreCellStyle(-2.8);
  assert.ok(/37, 99, 235/.test(neg.bg));
  const neutral = zscoreCellStyle(0.1);
  assert.ok(/148, 163, 184/.test(neutral.bg));
  const missing = zscoreCellStyle(null);
  assert.ok(missing.bg.includes('--border'));
});

test('slopeColor: green inside −2.5 … −0.5, red outside', () => {
  assert.equal(slopeColor(-1.2), 'var(--green)');
  assert.equal(slopeColor(-3.0), 'var(--red)');
  assert.equal(slopeColor(-0.2), 'var(--red)');
  assert.equal(slopeColor(null), 'var(--text-tertiary)');
});

test('pafColor: green within 9–11 Hz, amber otherwise', () => {
  assert.equal(pafColor(10.1), 'var(--green)');
  assert.equal(pafColor(8.4), 'var(--amber)');
  assert.equal(pafColor(null), 'var(--text-tertiary)');
});

test('isLegacyAnalysis: distinguishes the two payload shapes', () => {
  assert.equal(isLegacyAnalysis(legacyAnalysis()), true);
  assert.equal(isLegacyAnalysis(fullContractAnalysis()), false);
  assert.equal(isLegacyAnalysis(null), true);
});

test('perChannelBandPowers pulls absolute_uv2 from band_powers.bands', () => {
  const chVals = perChannelBandPowers(fullContractAnalysis());
  assert.equal(chVals.Fp1.alpha, 3.1);
  assert.equal(chVals.Fz.beta, 1.8);
  assert.equal(Object.keys(chVals).sort().join(','), 'Fp1,Fp2,Fz');
});

test('perChannelBandPowers returns {} when only legacy globals exist', () => {
  assert.deepEqual(perChannelBandPowers(legacyAnalysis()), {});
});

// ── Panel render ─────────────────────────────────────────────────────────────

test('renderQualityStrip: includes bad channels, label bars and version badges', () => {
  const html = renderQualityStrip(fullContractAnalysis());
  assert.match(html, /T3/);
  assert.match(html, /Oz/);
  assert.match(html, /eye/);
  assert.match(html, /muscle/);
  assert.match(html, /110/);
  assert.match(html, /250 Hz/);
  assert.match(html, /pipeline 0\.1\.0/);
  assert.match(html, /norm-db toy-0\.1/);
  assert.match(html, /research \/ wellness use/);
});

test('renderQualityStrip: returns empty string when quality_metrics is null', () => {
  assert.equal(renderQualityStrip({}), '');
  assert.equal(renderQualityStrip(null), '');
});

test('renderSpecParam: emits a row per channel with slope and PAF', () => {
  const html = renderSpecParam(fullContractAnalysis());
  assert.match(html, /<td[^>]*>Fp1<\/td>/);
  assert.match(html, /<td[^>]*>Fp2<\/td>/);
  assert.match(html, /10\.10 Hz/);
  // channel Fz had PAF null — rendered as em-dash in a td
  assert.match(html, /Fz[\s\S]*?&mdash;|Fz[\s\S]*?—/);
});

test('renderSpecParam: null input yields empty string', () => {
  assert.equal(renderSpecParam({}), '');
});

test('renderSourceRoi: renders band tabs and groups ROIs by lobe', () => {
  const html = renderSourceRoi(fullContractAnalysis());
  assert.match(html, /qeeg-roi-tab/);
  assert.match(html, /frontal/);
  assert.match(html, /occipital/);
  assert.match(html, /insular/);
  assert.match(html, /cingulate/);
  assert.match(html, /method: eLORETA/);
});

test('renderSourceRoi: null source_roi returns empty string', () => {
  assert.equal(renderSourceRoi({}), '');
});

test('renderZscoreHeatmap: channel × band grid with tooltip', () => {
  const html = renderZscoreHeatmap(fullContractAnalysis());
  // Contains both channels
  assert.match(html, /Fp1/);
  assert.match(html, /Fp2/);
  // Contains the flag metric path in a title attribute
  assert.match(html, /title="[^"]*spectral\.bands\.alpha\.absolute_uv2[^"]*"/);
  // Contains a legend
  assert.match(html, /z ≥ 2\.58/);
});

test('renderAsymmetryGraph: shows FAA values and hint when positive', () => {
  const html = renderAsymmetryGraph(fullContractAnalysis());
  assert.match(html, /Frontal alpha asymmetry/);
  assert.match(html, /F3 · F4/);
  assert.match(html, /0\.080/);
  assert.match(html, /left hypoactivation/);
  assert.match(html, /Graph metrics/);
  assert.match(html, /clustering/);
  assert.match(html, /small-worldness/);
});

test('renderAiNarrative: Generate button disabled until status=completed', () => {
  const running = renderAiNarrative(null, { analysis_status: 'processing' });
  assert.match(running, /data-action="generate-ai"[^>]*disabled/);
  assert.match(running, /Available once analysis is completed/);

  const completed = renderAiNarrative(null, { analysis_status: 'completed' });
  assert.doesNotMatch(completed, /data-action="generate-ai"[^>]*disabled/);
});

test('renderAiNarrative: citations link to pubmed/doi', () => {
  const ai = {
    ai_narrative: {
      executive_summary: 'Some summary',
      findings: [{ region: 'frontal', observation: 'Alpha asymmetry', citations: [1, 2] }],
      confidence_level: 'moderate',
      disclaimer: 'For clinical reference only.',
    },
    literature_refs: [
      { n: 1, pmid: '12345', title: 'Alpha-asymmetry paper', year: 2024, url: 'https://pubmed.ncbi.nlm.nih.gov/12345/' },
      { n: 2, doi: '10.1000/abc', title: 'Second paper', year: 2022 },
    ],
    model_used: 'claude-3',
    prompt_hash: 'abc123',
  };
  const html = renderAiNarrative(ai, { analysis_status: 'completed' });
  assert.match(html, /Alpha-asymmetry paper/);
  assert.match(html, /pubmed\.ncbi\.nlm\.nih\.gov\/12345/);
  assert.match(html, /doi\.org\/10\.1000/);
  assert.match(html, /confidence: moderate/);
  assert.match(html, /model: claude-3/);
  assert.match(html, /prompt: abc123/);
  assert.match(html, /qeeg-cite/);
});

// ── Full-panel integration ──────────────────────────────────────────────────

test('renderAnalyzerDetail: full payload renders all six advanced sections', () => {
  const html = renderAnalyzerDetail(fullContractAnalysis(), null);
  assert.match(html, /data-section="quality"/);
  assert.match(html, /data-section="specparam"/);
  assert.match(html, /data-section="source-roi"/);
  assert.match(html, /data-section="zscores"/);
  assert.match(html, /data-section="asymmetry-graph"/);
  assert.match(html, /data-section="ai-narrative"/);
  assert.match(html, /data-section="band-power"/);
  assert.doesNotMatch(html, /legacy record — only band power available/);
});

test('renderAnalyzerDetail: legacy payload shows band-power only and a legacy ribbon', () => {
  const html = renderAnalyzerDetail(legacyAnalysis(), null);
  assert.match(html, /data-section="band-power"/);
  assert.doesNotMatch(html, /data-section="quality"/);
  assert.doesNotMatch(html, /data-section="specparam"/);
  assert.doesNotMatch(html, /data-section="source-roi"/);
  assert.doesNotMatch(html, /data-section="zscores"/);
  assert.doesNotMatch(html, /data-section="asymmetry-graph"/);
  // AI panel is rendered as an action shell even for legacy (button disabled).
  assert.match(html, /data-section="ai-narrative"/);
  assert.match(html, /legacy record — only band power available/);
});

test('renderAnalyzerDetail: failed status shows the error panel', () => {
  const html = renderAnalyzerDetail(
    { id: 'x', analysis_status: 'failed', analysis_error: 'Boom!' },
    null,
  );
  assert.match(html, /Analysis failed/);
  assert.match(html, /Boom!/);
});

test('renderAnalyzerDetail: must not use forbidden "diagnosis" language', () => {
  const html = renderAnalyzerDetail(fullContractAnalysis(), null);
  assert.doesNotMatch(html, /\bdiagnosis\b/i);
  assert.doesNotMatch(html, /\bdiagnostic\b/i);
  assert.doesNotMatch(html, /treatment recommendation/i);
});

// ── Polling ──────────────────────────────────────────────────────────────────

test('pollAnalysisUntilDone: stops on completed without extra calls', async () => {
  const calls = [];
  const apiClient = {
    async getQEEGAnalysis(id) {
      calls.push(id);
      // Completed on the first call.
      return { id, analysis_status: 'completed' };
    },
  };
  const out = await pollAnalysisUntilDone('a1', apiClient, { sleep: async () => {} });
  assert.equal(out.analysis_status, 'completed');
  assert.equal(calls.length, 1);
});

test('pollAnalysisUntilDone: stops on failed', async () => {
  let calls = 0;
  const apiClient = {
    async getQEEGAnalysis() {
      calls += 1;
      return { analysis_status: calls < 2 ? 'processing' : 'failed', analysis_error: 'oops' };
    },
  };
  const out = await pollAnalysisUntilDone('a1', apiClient, {
    sleep: async () => {},
    intervalMs: 1,
  });
  assert.equal(out.analysis_status, 'failed');
  assert.equal(calls, 2);
});

test('pollAnalysisUntilDone: timeout throws', async () => {
  const apiClient = {
    async getQEEGAnalysis() {
      return { analysis_status: 'processing' };
    },
  };
  let t = 0;
  await assert.rejects(
    () => pollAnalysisUntilDone('a1', apiClient, {
      sleep: async () => {},
      intervalMs: 1,
      timeoutMs: 5,
      now: () => { t += 10; return t; },
    }),
    (e) => e.code === 'polling_timeout',
  );
});

// ── File detection helper ───────────────────────────────────────────────────

test('isEdfLikeFile: accepts canonical raw EEG extensions', () => {
  ['a.edf', 'x.EDF', 'sample.bdf', 'r.vhdr', 'mount.fif', 'e.set'].forEach((n) => {
    assert.ok(isEdfLikeFile(n), n);
  });
  assert.ok(!isEdfLikeFile('readings.csv'));
  assert.ok(!isEdfLikeFile('notes.txt'));
  assert.ok(!isEdfLikeFile(null));
});

test('buildSurveyFromForm: returns empty object when document is absent', () => {
  const out = buildSurveyFromForm(null);
  assert.deepEqual(out, {});
});

test('buildSurveyFromForm: reads declared ids via provided doc', () => {
  const fakeDoc = {
    _vals: { 'qr-eyes': 'eyes_closed', 'qr-device': 'Mitsar', 'qr-channels': '19', 'qr-notes': 'hi' },
    getElementById(id) {
      const v = this._vals[id];
      return v === undefined ? null : { value: v };
    },
  };
  const out = buildSurveyFromForm(fakeDoc);
  assert.equal(out.eyes_condition, 'eyes_closed');
  assert.equal(out.eeg_device, 'Mitsar');
  assert.equal(out.channels, 19);
  assert.equal(out.notes, 'hi');
});

// ── Comparison render ───────────────────────────────────────────────────────

test('renderComparison: formats deltas and narrative', () => {
  const cmp = {
    delta_powers: { alpha: 0.8, beta: -0.2 },
    improvement_summary: { overall: 'mild improvement' },
    ai_comparison_narrative: 'Clear rebound in alpha.',
  };
  const html = renderComparison(cmp);
  assert.match(html, /\+0\.80/);
  assert.match(html, /-0\.20/);
  assert.match(html, /mild improvement/);
  assert.match(html, /Clear rebound in alpha\./);
});
