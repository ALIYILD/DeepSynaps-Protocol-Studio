// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-analysis.js — qEEG Analyzer (Clinic Portal)
//
// Tabs:
//   1. Patient & Upload — patient clinical info + EDF/BDF/EEG upload
//   2. Analysis         — spectral results + topographic heatmaps
//   3. AI Report        — AI interpretation + clinician review
//   4. Compare          — pre/post comparison
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js';
import { renderTopoHeatmap, renderConnectivityMatrix, renderConnectivityBrainMap } from './brain-map-svg.js';
import { emptyState } from './helpers.js';

// ── XSS escape ───────────────────────────────────────────────────────────────
function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Shared helpers ───────────────────────────────────────────────────────────
function spinner(msg) {
  return '<div style="display:flex;align-items:center;gap:8px;padding:24px;color:var(--text-secondary)">'
    + '<span class="spinner"></span>' + esc(msg || 'Loading...') + '</div>';
}

function card(title, body, extra) {
  return '<div class="ds-card">'
    + (title ? '<div class="ds-card__header"><h3>' + esc(title) + '</h3>' + (extra || '') + '</div>' : '')
    + '<div class="ds-card__body">' + body + '</div></div>';
}

function badge(text, color) {
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:'
    + (color || 'var(--blue)') + '20;color:' + (color || 'var(--blue)') + '">' + esc(text) + '</span>';
}

const BAND_COLORS = {
  delta: '#42a5f5', theta: '#7e57c2', alpha: '#66bb6a',
  beta: '#ffa726', high_beta: '#ef5350', gamma: '#ec407a',
};

const TAB_META = {
  patient:   { label: 'Patient & Upload',  color: 'var(--blue)' },
  analysis:  { label: 'Analysis',          color: 'var(--teal)' },
  report:    { label: 'AI Report',         color: 'var(--violet)' },
  compare:   { label: 'Compare',           color: 'var(--amber)' },
};

// ── Demo Mode ────────────────────────────────────────────────────────────────
function _isDemoMode() {
  return import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1';
}

function _demoBanner() {
  return '<div style="background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.2);border-radius:8px;padding:8px 14px;margin-bottom:12px;font-size:12px;color:var(--amber);display:flex;align-items:center;gap:8px">'
    + '<span>&#x1F4CB;</span> Sample data shown for demonstration purposes. Upload a real EDF file for actual analysis.</div>';
}

/* 19 standard 10-20 channels */
var _DCH = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','O2'];

/* Build per-channel band power data from compact arrays (realistic eyes-closed distribution) */
function _buildDemoBandPowers() {
  var pcts = {
    delta:     [30,29,28,25,22,25,28,26,22,20,22,25,22,18,16,18,22,15,15],
    theta:     [18,17,15,18,22,17,15,14,16,20,15,14,12,13,14,13,12,11,11],
    alpha:     [15,16,13,18,16,19,14,18,25,22,26,19,28,35,38,36,29,42,41],
    beta:      [20,21,22,20,19,20,22,21,19,18,19,21,18,17,16,17,18,16,17],
    high_beta: [10,10,13,12,13,12,13,13,12,13,12,13,12,10,10,10,12,10,10],
    gamma:     [7, 7, 9, 7, 8, 7, 8, 8, 6, 7, 6, 8, 8, 7, 6, 6, 7, 6, 6],
  };
  var bands = {};
  Object.keys(pcts).forEach(function (band) {
    var channels = {};
    _DCH.forEach(function (ch, i) { channels[ch] = { relative_pct: pcts[band][i] }; });
    bands[band] = { channels: channels };
  });
  return bands;
}

var DEMO_QEEG_ANALYSIS = {
  id: 'demo',
  analysis_status: 'completed',
  original_filename: 'demo_eyes_closed.edf',
  channels_used: 19,
  channel_count: 19,
  sample_rate_hz: 256,
  recording_duration_sec: 600,
  eyes_condition: 'closed',
  analyzed_at: new Date().toISOString(),
  band_powers: {
    bands: _buildDemoBandPowers(),
    derived_ratios: {
      theta_beta_ratio: 3.82,
      delta_alpha_ratio: 1.41,
      alpha_peak_frequency_hz: 9.24,
      frontal_alpha_asymmetry: 0.18,
    },
  },
  artifact_rejection: { epochs_total: 300, epochs_kept: 278, flat_channels: [] },
  advanced_analyses: {
    meta: { total: 25, completed: 25, failed: 0, duration_sec: 42 },
    results: {
      u_shape: { status: 'ok', label: 'U-Shape Analysis', category: 'spectral', duration_ms: 820,
        summary: 'U-shape spectral pattern detected in 12/19 channels, consistent with normal cortical maturation.',
        data: { mean_u_score: 0.74, u_shape_present_count: 12, total_channels: 19 } },
      fooof_decomposition: { status: 'ok', label: 'FOOOF Decomposition', category: 'spectral', duration_ms: 3200,
        summary: 'Mean aperiodic exponent 1.42; 2-3 peaks per channel typical.',
        data: { mean_aperiodic_exponent: 1.42,
          channels: {
            Fp1: { aperiodic_exponent: 1.51, n_peaks: 2, r_squared: 0.96 },
            F3:  { aperiodic_exponent: 1.45, n_peaks: 3, r_squared: 0.97 },
            Fz:  { aperiodic_exponent: 1.38, n_peaks: 2, r_squared: 0.95 },
            C3:  { aperiodic_exponent: 1.35, n_peaks: 2, r_squared: 0.98 },
            Cz:  { aperiodic_exponent: 1.40, n_peaks: 3, r_squared: 0.96 },
            P3:  { aperiodic_exponent: 1.32, n_peaks: 2, r_squared: 0.97 },
            O1:  { aperiodic_exponent: 1.28, n_peaks: 3, r_squared: 0.98 },
            O2:  { aperiodic_exponent: 1.30, n_peaks: 3, r_squared: 0.97 },
          } } },
      spectral_edge_frequency: { status: 'ok', label: 'Spectral Edge Frequency', category: 'spectral', duration_ms: 450,
        summary: 'SEF50 at 10.8 Hz and SEF95 at 24.3 Hz within normal limits.',
        data: { mean_sef50_hz: 10.8, mean_sef95_hz: 24.3 } },
      band_peak_frequencies: { status: 'ok', label: 'Band Peak Frequencies', category: 'spectral', duration_ms: 380,
        summary: 'Alpha peak at 9.24 Hz (low-normal range).',
        data: { mean_alpha_peak_hz: 9.24 } },
      wavelet_decomposition: { status: 'ok', label: 'Wavelet Decomposition', category: 'spectral', duration_ms: 2100,
        summary: 'CWT-based energy distribution consistent with FFT-derived band powers.',
        data: { band_summary: { delta: 18.4, theta: 12.6, alpha: 28.9, beta: 22.1, high_beta: 11.3, gamma: 6.7 } } },
      full_asymmetry_matrix: { status: 'ok', label: 'Full Asymmetry Matrix', category: 'asymmetry', duration_ms: 620,
        summary: 'Left frontal alpha asymmetry (FAA 0.18) notable; other pairs within normal range.',
        data: { pairs: {
          'Fp1-Fp2': { delta: 0.06, theta: -0.05, alpha: -0.08, beta: 0.07, high_beta: -0.04, gamma: 0.03 },
          'F3-F4':   { delta: -0.05, theta: 0.08, alpha: 0.18, beta: -0.03, high_beta: 0.02, gamma: 0.01 },
          'C3-C4':   { delta: -0.02, theta: -0.04, alpha: 0.06, beta: 0.03, high_beta: -0.01, gamma: 0.02 },
          'P3-P4':   { delta: 0.03, theta: 0.01, alpha: -0.04, beta: -0.02, high_beta: 0.01, gamma: -0.01 },
          'O1-O2':   { delta: 0.01, theta: -0.02, alpha: 0.03, beta: -0.01, high_beta: 0.02, gamma: 0.01 },
          'T3-T4':   { delta: -0.08, theta: 0.05, alpha: -0.11, beta: 0.06, high_beta: -0.03, gamma: 0.02 },
          'T5-T6':   { delta: 0.04, theta: -0.03, alpha: 0.07, beta: -0.04, high_beta: 0.02, gamma: -0.01 },
          'F7-F8':   { delta: -0.03, theta: 0.02, alpha: 0.05, beta: -0.06, high_beta: 0.03, gamma: -0.02 },
        } } },
      frontal_alpha_dominance: { status: 'ok', label: 'Frontal Alpha Dominance', category: 'asymmetry', duration_ms: 310,
        summary: 'Left frontal dominance; FAA 0.18 suggesting relative right hypoactivation.',
        data: { overall_dominance: 'left', mean_faa: 0.18 } },
      delta_dominance: { status: 'ok', label: 'Delta Dominance Analysis', category: 'asymmetry', duration_ms: 280,
        summary: 'No significant lateralized delta patterns found.',
        data: { lateralized_pairs: 0 } },
      regional_asymmetry_severity: { status: 'ok', label: 'Regional Asymmetry Severity', category: 'asymmetry', duration_ms: 350,
        summary: 'Mild frontal asymmetry; other regions within normal limits.',
        data: { overall_severity: 'mild',
          regions: { frontal: { severity: 'mild' }, central: { severity: 'normal' }, parietal: { severity: 'normal' }, occipital: { severity: 'normal' }, temporal: { severity: 'normal' } } } },
      coherence_matrix: { status: 'ok', label: 'Coherence Matrix', category: 'connectivity', duration_ms: 4500,
        summary: 'Alpha coherence shows expected posterior-to-anterior gradient with intact interhemispheric connectivity.',
        data: {
          channels: ['F3','F4','C3','C4','P3','P4','O1','O2'],
          bands: { alpha: [
            [1.00,0.72,0.65,0.48,0.35,0.32,0.22,0.20],
            [0.72,1.00,0.47,0.66,0.31,0.36,0.21,0.23],
            [0.65,0.47,1.00,0.58,0.62,0.45,0.38,0.35],
            [0.48,0.66,0.58,1.00,0.44,0.63,0.34,0.39],
            [0.35,0.31,0.62,0.44,1.00,0.71,0.68,0.55],
            [0.32,0.36,0.45,0.63,0.71,1.00,0.54,0.69],
            [0.22,0.21,0.38,0.34,0.68,0.54,1.00,0.78],
            [0.20,0.23,0.35,0.39,0.55,0.69,0.78,1.00],
          ] } } },
      disconnection_flags: { status: 'ok', label: 'Disconnection Flags', category: 'connectivity', duration_ms: 890,
        summary: '3 pairs flagged for low coherence; primarily long-range connections.',
        data: { flagged_count: 3, total_pairs_checked: 171,
          flags: [
            { ch1: 'Fp1', ch2: 'O2', band: 'alpha', coherence: 0.12 },
            { ch1: 'F7', ch2: 'T6', band: 'beta', coherence: 0.14 },
            { ch1: 'Fp2', ch2: 'O1', band: 'alpha', coherence: 0.15 },
          ] } },
      pli_icoh: { status: 'ok', label: 'PLI / iCoh', category: 'connectivity', duration_ms: 2800,
        summary: 'Mean alpha PLI 0.28 indicates moderate phase synchronization.',
        data: { mean_pli: 0.28, total_pairs: 171 } },
      wpli: { status: 'ok', label: 'Weighted PLI', category: 'connectivity', duration_ms: 3100,
        summary: 'wPLI values consistent with PLI, confirming functional connectivity pattern.',
        data: { bands: {
          delta: { mean_wpli: 0.18 }, theta: { mean_wpli: 0.22 },
          alpha: { mean_wpli: 0.31 }, beta: { mean_wpli: 0.15 },
        } } },
      ica_decomposition: { status: 'ok', label: 'ICA Decomposition', category: 'connectivity', duration_ms: 5200,
        summary: '14 brain components, 5 artifact components identified.',
        data: { brain_components: 14, artifact_components: 5, n_components: 19,
          type_counts: { brain_cortical: 11, brain_subcortical: 3, eye_blink: 2, eye_movement: 1, muscle: 2 } } },
      entropy_analysis: { status: 'ok', label: 'Entropy Analysis', category: 'complexity', duration_ms: 1800,
        summary: 'Mean sample entropy 1.52 within normal range; no abnormal regularity.',
        data: { mean_sample_entropy: 1.52, segment_duration_sec: 10 } },
      fractal_lz: { status: 'ok', label: 'Fractal / Lempel-Ziv Complexity', category: 'complexity', duration_ms: 2400,
        summary: 'Higuchi FD 1.62 and LZ complexity 0.71 suggest normal cortical complexity.',
        data: { mean_higuchi_fd: 1.62, mean_lempel_ziv: 0.71 } },
      multiscale_entropy: { status: 'ok', label: 'Multiscale Entropy', category: 'complexity', duration_ms: 3600,
        summary: 'Complexity index 4.82; healthy cross-scale entropy dynamics.',
        data: { mean_complexity_index: 4.82 } },
      higuchi_fd_detailed: { status: 'ok', label: 'Higuchi FD Detailed', category: 'complexity', duration_ms: 1400,
        summary: 'Dominant classification: normal complexity across all regions.',
        data: { dominant_classification: 'normal' } },
      small_world_index: { status: 'ok', label: 'Small World Index', category: 'network', duration_ms: 1600,
        summary: 'Small-world index 2.4 confirms small-world network topology.',
        data: { small_world_index: 2.4, clustering_coefficient: 0.68, path_length: 1.82, density: 0.35 } },
      graph_theoretic_indices: { status: 'ok', label: 'Graph Theoretic Indices', category: 'network', duration_ms: 2200,
        summary: 'Network efficiency 0.58; Cz and Pz identified as hub nodes.',
        data: { global: { mean_clustering: 0.64, global_efficiency: 0.58, mean_degree: 6.2 }, hubs: ['Cz', 'Pz', 'C3'] } },
      microstate_analysis: { status: 'ok', label: 'Microstate Analysis', category: 'microstate', duration_ms: 4100,
        summary: 'Four canonical microstates (A-D) account for 78% GEV.',
        data: { gev: 0.78,
          classes: {
            A: { coverage_pct: 22.1, mean_duration_ms: 68, occurrence_per_sec: 3.2 },
            B: { coverage_pct: 24.5, mean_duration_ms: 72, occurrence_per_sec: 3.4 },
            C: { coverage_pct: 18.3, mean_duration_ms: 58, occurrence_per_sec: 3.1 },
            D: { coverage_pct: 13.1, mean_duration_ms: 52, occurrence_per_sec: 2.5 },
          } } },
      iapf_plasticity: { status: 'ok', label: 'IAPF & Plasticity Index', category: 'clinical', duration_ms: 680,
        summary: 'Posterior IAPF 9.24 Hz (low-normal); global mean 9.08 Hz.',
        data: { posterior_iapf_hz: 9.24, mean_iapf_hz: 9.08 } },
      tbr_screening: { status: 'ok', label: 'TBR Screening Map', category: 'clinical', duration_ms: 420,
        summary: 'Theta/Beta ratio 3.82 at Fz (borderline elevated). Frontal TBR distribution suggests mild attentional dysregulation. Clinical threshold for ADHD consideration is 4.5.' },
      alpha_asymmetry_index: { status: 'ok', label: 'Alpha Asymmetry Index', category: 'clinical', duration_ms: 350,
        summary: 'Composite alpha asymmetry index 0.14 (mild left-dominant). F3-F4 pair shows strongest asymmetry (0.18). Pattern consistent with withdrawal-related affective style.' },
      cordance: { status: 'ok', label: 'Cordance Analysis', category: 'clinical', duration_ms: 580,
        summary: 'Prefrontal theta cordance mildly elevated. Literature suggests potential predictor of antidepressant response. Posterior alpha cordance within normal limits.' },
    },
  },
};

var DEMO_QEEG_REPORT = {
  id: 'demo-report',
  ai_narrative: {
    summary: 'This eyes-closed qEEG recording from a 19-channel 10-20 montage reveals a mildly atypical spectral profile. '
      + 'Alpha peak frequency at 9.24 Hz falls in the low-normal range with dominant posterior alpha distribution (O1: 42%, O2: 41%). '
      + 'Frontal theta is mildly elevated at Fz (22%), yielding a borderline theta/beta ratio of 3.82 (clinical threshold 4.5). '
      + 'Left frontal alpha asymmetry (FAA 0.18) may indicate relative right frontal hypoactivation, a pattern associated with withdrawal-related affective styles. '
      + 'Overall cortical complexity and connectivity measures are within normal limits.',
    detailed_findings: 'SPECTRAL ANALYSIS:\n'
      + 'Delta band power shows expected frontal predominance (Fp1: 30%, Fp2: 29%) with appropriate posterior attenuation (O1: 15%, O2: 15%). '
      + 'No focal delta abnormalities suggestive of structural lesions.\n\n'
      + 'Theta band demonstrates mild frontal-central elevation, particularly at Fz (22%) and Cz (20%). This midline theta excess is consistent with attentional processing demands '
      + 'and may correlate with subjective concentration difficulties. The theta/beta ratio of 3.82 at Fz is approaching the clinical significance threshold of 4.5.\n\n'
      + 'Alpha band shows healthy posterior dominance with robust occipital alpha (O1: 42%, O2: 41%). The alpha peak frequency of 9.24 Hz is in the low-normal range. '
      + 'Frontal alpha asymmetry (F3-F4 pair: 0.18) suggests relative left-sided alpha excess, corresponding to reduced left frontal activation.\n\n'
      + 'Beta and high-beta distributions are within normal limits with appropriate frontal weighting. No excessive beta activity suggestive of anxiety or medication effects.\n\n'
      + 'CONNECTIVITY:\n'
      + 'Alpha coherence shows an expected posterior-to-anterior gradient. Three long-range pairs (Fp1-O2, F7-T6, Fp2-O1) show reduced coherence, '
      + 'which is developmentally normal. Small-world index of 2.4 confirms intact network topology.\n\n'
      + 'COMPLEXITY:\n'
      + 'Sample entropy (1.52), Higuchi fractal dimension (1.62), and Lempel-Ziv complexity (0.71) are all within normal ranges, '
      + 'indicating healthy cortical dynamics without pathological regularity or excessive randomness.\n\n'
      + 'CLINICAL IMPRESSION:\n'
      + 'The combination of mild frontal theta excess, borderline TBR, and left frontal alpha asymmetry suggests a profile consistent with '
      + 'mild attentional and mood-related dysregulation. These findings warrant clinical correlation with presenting symptoms.',
  },
  condition_matches: [
    { condition: 'Major Depressive Disorder', confidence: 0.68 },
    { condition: 'Generalized Anxiety Disorder', confidence: 0.52 },
    { condition: 'ADHD - Combined Type', confidence: 0.48 },
    { condition: 'Mild Cognitive Impairment', confidence: 0.35 },
  ],
  protocol_suggestions: [
    { protocol: 'rTMS - Left DLPFC (10 Hz)', rationale: 'Grade A evidence for MDD. Left frontal alpha asymmetry supports targeting left DLPFC to increase excitability and normalize frontal activation patterns.' },
    { protocol: 'tDCS - Bifrontal Montage (2 mA)', rationale: 'Grade B evidence. Anodal left DLPFC / cathodal right DLPFC may address both mood-related asymmetry and attentional theta excess.' },
    { protocol: 'Neurofeedback - SMR/Theta Protocol', rationale: 'Grade B evidence. Enhance SMR (12-15 Hz) at Cz while inhibiting frontal theta at Fz to improve attention and reduce rumination.' },
  ],
  clinician_reviewed: false,
  clinician_amendments: '',
};

/* Build comparison delta powers from compact arrays */
function _buildDemoDeltas() {
  var changes = {
    delta:     [-2.1,-1.8,-1.5,-3.2,-4.1,-3.0,-1.6,-1.2,-2.8,-3.5,-2.6,-1.3,-1.0,-1.5,-2.0,-1.4,-1.1,-0.8,-0.9],
    theta:     [-8.2,-7.5,-5.1,-9.8,-12.5,-9.2,-5.3,-4.1,-6.8,-8.3,-6.1,-4.0,-3.2,-4.5,-5.1,-4.3,-3.0,-2.5,-2.8],
    alpha:     [3.1,2.8,1.5,5.2,4.0,5.8,1.8,3.5,6.2,5.1,6.8,3.8,7.5,10.1,11.2,10.5,7.8,8.2,7.5],
    beta:      [1.2,1.5,2.1,0.8,-0.5,0.6,2.0,1.8,0.5,-0.2,0.3,1.6,0.8,-0.3,-0.8,-0.4,0.5,-1.0,-0.8],
    high_beta: [2.5,3.1,1.8,1.2,0.8,1.0,1.9,2.2,0.5,0.3,0.4,2.0,1.5,0.2,-0.1,0.1,1.2,-0.5,-0.3],
    gamma:     [0.5,0.8,1.2,0.3,-0.2,0.1,0.8,0.5,-0.1,-0.3,-0.2,0.6,0.4,-0.1,-0.3,-0.1,0.3,-0.4,-0.3],
  };
  var bands = {};
  Object.keys(changes).forEach(function (band) {
    var chData = {};
    _DCH.forEach(function (ch, i) { chData[ch] = { pct_change: changes[band][i] }; });
    bands[band] = chData;
  });
  return { bands: bands };
}

var DEMO_QEEG_COMPARISON = {
  id: 'demo-comparison',
  improvement_summary: { improved: 8, unchanged: 7, worsened: 2 },
  ai_comparison_narrative: 'Follow-up qEEG recorded after 20 sessions of combined rTMS and neurofeedback treatment shows notable improvements in key biomarkers. '
    + 'Frontal theta power decreased significantly at Fz (-12.5%) and Cz (-8.3%), bringing the theta/beta ratio from 3.82 to 3.34, well below the clinical concern threshold. '
    + 'Posterior alpha power increased at O1 (+8.2%) and O2 (+7.5%), with the most pronounced gains at Pz (+11.2%) and P3 (+10.1%), suggesting improved cortical efficiency and attentional regulation. '
    + 'Frontal alpha asymmetry normalized from 0.18 to 0.09, indicating improved bilateral frontal activation balance. '
    + 'Mild increases in high-beta at frontal sites (Fp1: +2.5%, Fp2: +3.1%) should be monitored in subsequent recordings. '
    + 'Overall, 8 of 17 measured parameters improved, 7 remained stable, and 2 showed minor elevation. '
    + 'Clinical re-evaluation is recommended to correlate these neurophysiological improvements with symptomatic changes.',
  delta_powers: _buildDemoDeltas(),
};

/* Entry for the patient tab analyses list */
var DEMO_ANALYSIS_ENTRY = {
  id: 'demo', analysis_status: 'completed', original_filename: 'demo_eyes_closed.edf',
  channels_used: 19, sample_rate_hz: 256, eyes_condition: 'closed',
  analyzed_at: new Date().toISOString(),
};

// ── Module-scoped caches ─────────────────────────────────────────────────────
let _patients = [];
let _patient = null;
let _medHistory = null;
let _analyses = [];
let _collapsedSections = { medications: true, neurological: true, lifestyle: true };

function renderTabBar(activeTab) {
  return '<div class="ch-tab-bar" style="margin-bottom:20px">' +
    Object.entries(TAB_META).map(function (entry) {
      const id = entry[0], m = entry[1];
      const active = activeTab === id;
      return '<button class="ch-tab' + (active ? ' ch-tab--active' : '') + '"'
        + (active ? ' style="--tab-color:' + m.color + '"' : '')
        + ' onclick="window._qeegTab=\'' + id + '\';window._nav(\'qeeg-analysis\')">'
        + esc(m.label) + '</button>';
    }).join('') + '</div>';
}

// ── Patient Selector ─────────────────────────────────────────────────────────

function renderPatientSelector(patients, selectedId) {
  const selected = selectedId ? patients.find(function (p) { return p.id === selectedId; }) : null;
  const displayName = selected ? esc((selected.first_name || '') + ' ' + (selected.last_name || '')) : '';

  return '<div style="position:relative;margin-bottom:16px" id="qeeg-patient-selector">'
    + '<label style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Patient</label>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<input type="text" id="qeeg-patient-search" class="form-control" '
    + 'placeholder="Search patients by name..." '
    + 'value="' + displayName + '" '
    + 'autocomplete="off" '
    + 'style="flex:1">'
    + (selectedId ? '<button class="btn btn-sm btn-outline" onclick="window._qeegClearPatient()" title="Clear selection" style="padding:4px 8px">&times;</button>' : '')
    + '</div>'
    + '<div id="qeeg-patient-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:240px;overflow-y:auto;background:var(--surface-2);border:1px solid rgba(255,255,255,0.1);border-radius:8px;z-index:100;margin-top:4px;box-shadow:0 8px 24px rgba(0,0,0,0.4)"></div>'
    + '</div>';
}

function initPatientSelector() {
  const input = document.getElementById('qeeg-patient-search');
  const dropdown = document.getElementById('qeeg-patient-dropdown');
  if (!input || !dropdown) return;

  input.addEventListener('focus', function () {
    if (!window._qeegPatientId) showDropdown('');
  });

  input.addEventListener('input', function () {
    showDropdown(input.value);
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#qeeg-patient-selector')) {
      dropdown.style.display = 'none';
      // Restore display name if we have a selected patient
      if (window._qeegPatientId && _patient) {
        input.value = (_patient.first_name || '') + ' ' + (_patient.last_name || '');
      }
    }
  });

  function showDropdown(query) {
    const q = (query || '').toLowerCase().trim();
    const filtered = _patients.filter(function (p) {
      const name = ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase();
      return !q || name.indexOf(q) !== -1;
    }).slice(0, 20);

    if (!filtered.length) {
      dropdown.innerHTML = '<div style="padding:12px;color:var(--text-tertiary);font-size:13px">No patients found</div>';
    } else {
      dropdown.innerHTML = filtered.map(function (p) {
        const initials = ((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || '');
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04)" '
          + 'onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" '
          + 'onmouseout="this.style.background=\'transparent\'" '
          + 'onclick="window._qeegSelectPatient(\'' + p.id + '\')">'
          + '<div style="width:32px;height:32px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">' + esc(initials.toUpperCase()) + '</div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc((p.first_name || '') + ' ' + (p.last_name || '')) + '</div>'
          + '<div style="font-size:11px;color:var(--text-tertiary)">' + esc(p.primary_condition || 'No condition') + (p.dob ? ' | ' + esc(p.dob) : '') + '</div>'
          + '</div></div>';
      }).join('');
    }
    dropdown.style.display = 'block';
  }
}

// ── Patient Clinical Info (Read-Only) ────────────────────────────────────────

function renderClinicalInfo(patient, medHistory) {
  if (!patient) return '';
  const s = (medHistory && medHistory.sections) || {};

  // Demographics strip
  let html = '<div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">'
    + '<div style="flex:1;min-width:160px">'
    + '<div style="font-size:18px;font-weight:700">' + esc((patient.first_name || '') + ' ' + (patient.last_name || '')) + '</div>'
    + '<div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">'
    + (patient.dob ? 'DOB: ' + esc(patient.dob) : '')
    + (patient.gender ? ' | ' + esc(patient.gender) : '')
    + '</div></div>';
  if (patient.primary_condition) {
    html += '<div>' + badge(patient.primary_condition, 'var(--blue)') + '</div>';
  }
  html += '</div>';

  // Check if medical history exists
  if (!medHistory || !medHistory.sections || Object.keys(medHistory.sections).length === 0) {
    html += '<div style="text-align:center;padding:24px;color:var(--text-tertiary);font-size:13px;border:1px dashed rgba(255,255,255,0.1);border-radius:8px">'
      + 'No medical history recorded for this patient.<br>'
      + '<a href="#" onclick="window._nav(\'patients-hub\');return false" style="color:var(--blue);font-size:12px">Go to Patient Hub to add medical history</a>'
      + '</div>';
    return html;
  }

  // Clinical sections
  const sections = [
    { id: 'presenting', label: 'Presenting Symptoms', icon: '!', color: 'var(--blue)', fields: ['chief_complaint', 'symptom_onset', 'severity', 'functional_impact', 'patient_goals'], fieldLabels: { chief_complaint: 'Chief Complaint', symptom_onset: 'Onset', severity: 'Severity', functional_impact: 'Functional Impact', patient_goals: 'Patient Goals' } },
    { id: 'diagnoses', label: 'Diagnoses', icon: 'Dx', color: 'var(--teal)', fields: ['primary_dx', 'secondary_dx', 'working_dx', 'dx_notes'], fieldLabels: { primary_dx: 'Primary Diagnosis', secondary_dx: 'Secondary Diagnoses', working_dx: 'Working Diagnosis', dx_notes: 'Notes' } },
    { id: 'safety', label: 'Safety / Contraindications', icon: '!!', color: 'var(--red)', accent: true, fields: ['seizure_history', 'seizure_meds', 'seizure_risk', 'metal_implants', 'pacemaker', 'pregnancy', 'photosensitivity', 'prior_ae_neuromod', 'contra_notes', 'contra_cleared'], fieldLabels: { seizure_history: 'Seizure History', seizure_meds: 'Seizure Medications', seizure_risk: 'Seizure Risk', metal_implants: 'Metal Implants', pacemaker: 'Pacemaker/ICD', pregnancy: 'Pregnancy', photosensitivity: 'Photosensitivity', prior_ae_neuromod: 'Prior AE Neuromod', contra_notes: 'Contraindication Notes', contra_cleared: 'Cleared Status' } },
    { id: 'medications', label: 'Medications & Supplements', icon: 'Rx', color: 'var(--violet)', fields: ['current_meds', 'supplements', 'past_meds', 'med_interactions'], fieldLabels: { current_meds: 'Current Medications', supplements: 'Supplements', past_meds: 'Past Medications', med_interactions: 'Interactions' } },
    { id: 'neurological', label: 'Neurological & Medical History', icon: 'N', color: 'var(--amber)', fields: ['neuro_conditions', 'brain_injury', 'neuro_tests', 'chronic_conditions', 'surgeries'], fieldLabels: { neuro_conditions: 'Neurological Conditions', brain_injury: 'Brain Injury', neuro_tests: 'Neuro Tests', chronic_conditions: 'Chronic Conditions', surgeries: 'Surgeries' } },
    { id: 'lifestyle', label: 'Lifestyle & Functional', icon: 'L', color: 'var(--green)', fields: ['sleep_quality', 'sleep_hours', 'alcohol', 'tobacco', 'cannabis', 'other_substances', 'occupation', 'activity_level'], fieldLabels: { sleep_quality: 'Sleep Quality', sleep_hours: 'Sleep Hours', alcohol: 'Alcohol', tobacco: 'Tobacco', cannabis: 'Cannabis', other_substances: 'Other Substances', occupation: 'Occupation', activity_level: 'Activity Level' } },
  ];

  sections.forEach(function (sec) {
    const data = s[sec.id] || {};
    // Check if section has any data
    const hasData = sec.fields.some(function (f) { return data[f] && String(data[f]).trim(); });
    if (!hasData && sec.id !== 'safety') return; // Always show safety

    const collapsed = _collapsedSections[sec.id] || false;
    const borderStyle = sec.accent ? 'border-left:3px solid ' + sec.color + ';' : '';

    html += '<div class="ds-card" style="margin-bottom:8px;' + borderStyle + '">'
      + '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none" '
      + 'onclick="window._qeegToggleSection(\'' + sec.id + '\')">'
      + '<span style="width:24px;height:24px;border-radius:6px;background:' + sec.color + '20;color:' + sec.color + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800">' + sec.icon + '</span>'
      + '<span style="flex:1;font-weight:600;font-size:13px">' + esc(sec.label) + '</span>'
      + '<span style="color:var(--text-tertiary);font-size:11px">' + (collapsed ? '+' : '-') + '</span>'
      + '</div>';

    if (!collapsed) {
      html += '<div style="padding:4px 14px 12px;display:grid;grid-template-columns:1fr;gap:6px">';
      sec.fields.forEach(function (f) {
        const val = data[f];
        if (!val || !String(val).trim()) return;
        html += '<div>'
          + '<div style="font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.4px;margin-bottom:1px">' + esc(sec.fieldLabels[f] || f) + '</div>'
          + '<div style="font-size:13px;color:var(--text-primary);white-space:pre-wrap;line-height:1.5">' + esc(val) + '</div>'
          + '</div>';
      });
      if (!hasData) {
        html += '<div style="font-size:12px;color:var(--text-tertiary);font-style:italic">No data recorded</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  });

  return html;
}

// ── Upload Area ──────────────────────────────────────────────────────────────

function renderUploadArea(patientId) {
  return card('Upload EDF / BDF / EEG File',
    '<div id="qeeg-dropzone" class="qeeg-dropzone">'
    + '<div class="qeeg-dropzone__icon">&#x1F4C2;</div>'
    + '<div style="color:var(--text-secondary);font-size:13px;margin-bottom:4px">Drag & drop an EDF, BDF, or EEG file here, or click to browse</div>'
    + '<input type="file" id="qeeg-file-input" accept=".edf,.bdf,.eeg" style="display:none">'
    + '<div class="qeeg-dropzone__fields">'
    + '<div><label class="form-label" style="display:block;margin-bottom:4px">Eyes Condition</label>'
    + '<select id="qeeg-eyes" class="form-control" style="width:100%;font-size:12px">'
    + '<option value="closed">Closed</option><option value="open">Open</option></select></div>'
    + '<div><label class="form-label" style="display:block;margin-bottom:4px">Equipment</label>'
    + '<input type="text" id="qeeg-equipment" class="form-control" placeholder="e.g. NeuroGuide" style="width:100%;font-size:12px"></div>'
    + '<div><label class="form-label" style="display:block;margin-bottom:4px">Recording Date</label>'
    + '<input type="date" id="qeeg-rec-date" class="form-control" style="width:100%;font-size:12px"></div>'
    + '</div>'
    + '<div id="qeeg-upload-status" style="margin-top:12px"></div>'
    + '</div>'
  );
}

function initUploadHandlers(patientId) {
  const dropzone = document.getElementById('qeeg-dropzone');
  const fileInput = document.getElementById('qeeg-file-input');
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', function (e) {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'OPTION') return;
    fileInput.click();
  });
  dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('qeeg-dropzone--dragover'); });
  dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('qeeg-dropzone--dragover'); });
  dropzone.addEventListener('drop', function (e) {
    e.preventDefault(); dropzone.classList.remove('qeeg-dropzone--dragover');
    if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files[0], patientId);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length) handleUpload(fileInput.files[0], patientId);
  });
}

async function handleUpload(file, patientId) {
  const statusEl = document.getElementById('qeeg-upload-status');
  if (!patientId) {
    if (statusEl) statusEl.innerHTML = '<div style="color:var(--red);font-size:13px">Please select a patient first.</div>';
    return;
  }
  // Client-side validation
  const ext = (file.name || '').split('.').pop().toLowerCase();
  if (!['edf', 'bdf', 'eeg'].includes(ext)) {
    if (statusEl) statusEl.innerHTML = '<div style="color:var(--red);font-size:13px">Invalid file type. Accepted: .edf, .bdf, .eeg</div>';
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    if (statusEl) statusEl.innerHTML = '<div style="color:var(--red);font-size:13px">File too large. Maximum: 100 MB</div>';
    return;
  }

  if (statusEl) statusEl.innerHTML = spinner('Uploading ' + esc(file.name) + '...');
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('patient_id', patientId);
    const eyes = document.getElementById('qeeg-eyes')?.value || 'closed';
    fd.append('eyes_condition', eyes);
    const equipment = document.getElementById('qeeg-equipment')?.value;
    if (equipment) fd.append('equipment', equipment);
    const recDate = document.getElementById('qeeg-rec-date')?.value;
    if (recDate) fd.append('recording_date', recDate);

    const result = await api.uploadQEEGAnalysis(fd);
    if (statusEl) statusEl.innerHTML = '<div style="color:var(--green);font-size:13px">Uploaded successfully! '
      + badge('pending', 'var(--amber)')
      + ' <a href="#" onclick="window._qeegSelectedId=\'' + result.id + '\';window._qeegTab=\'analysis\';window._nav(\'qeeg-analysis\');return false" style="color:var(--blue);margin-left:8px">Go to Analysis tab to run spectral analysis</a></div>';
    // Refresh analyses list
    refreshAnalysesList(patientId);
  } catch (err) {
    if (statusEl) statusEl.innerHTML = '<div style="color:var(--red);font-size:13px">Upload failed: ' + esc(err.message || err) + '</div>';
  }
}

async function refreshAnalysesList(patientId) {
  try {
    const resp = await api.listPatientQEEGAnalyses(patientId);
    _analyses = (resp && resp.items) || (Array.isArray(resp) ? resp : []);
    const listEl = document.getElementById('qeeg-analyses-list');
    if (listEl) listEl.innerHTML = renderAnalysisList(_analyses);
  } catch (_) { /* silent */ }
}

// ── Analysis List ────────────────────────────────────────────────────────────

function renderAnalysisList(analyses) {
  if (!analyses.length) return '<div style="color:var(--text-tertiary);font-size:13px;padding:8px">No analyses found. Upload an EDF file above.</div>';
  let html = '';
  analyses.forEach(function (a) {
    const status = a.analysis_status || 'pending';
    const statusColor = status === 'completed' ? 'var(--green)' : status === 'failed' ? 'var(--red)' : 'var(--amber)';
    html += '<div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:background .15s" '
      + 'onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.03)\'" '
      + 'onclick="window._qeegSelectedId=\'' + a.id + '\';window._qeegTab=\'analysis\';window._nav(\'qeeg-analysis\')">'
      + '<div style="min-width:0;flex:1">'
      + '<div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.original_filename || 'EDF File') + '</div>'
      + '<div style="font-size:11px;color:var(--text-tertiary)">'
      + (a.channels_used || a.channel_count || '?') + ' ch'
      + (a.sample_rate_hz ? ', ' + a.sample_rate_hz + ' Hz' : '')
      + (a.eyes_condition ? ' | ' + esc(a.eyes_condition) : '')
      + (a.analyzed_at ? ' | ' + new Date(a.analyzed_at).toLocaleDateString() : '')
      + '</div></div>'
      + '<div style="margin-left:8px">' + badge(status, statusColor) + '</div></div>';
  });
  return html;
}

// ── Main page function ───────────────────────────────────────────────────────

export async function pgQEEGAnalysis(setTopbar, navigate) {
  const tab = window._qeegTab || 'patient';
  window._qeegTab = tab;
  const el = document.getElementById('content');

  setTopbar('qEEG Analyzer', '');

  // Load patients list (cached)
  if (!_patients.length) {
    try {
      const resp = await api.listPatients();
      _patients = Array.isArray(resp) ? resp : (resp && resp.items ? resp.items : []);
    } catch (_) { _patients = []; }
  }

  // Load patient data if selected
  const patientId = window._qeegPatientId || null;
  if (patientId && (!_patient || _patient.id !== patientId)) {
    try {
      const [p, mh, aResp] = await Promise.all([
        api.getPatient(patientId),
        api.getPatientMedicalHistory(patientId),
        api.listPatientQEEGAnalyses(patientId).catch(function () { return { items: [] }; }),
      ]);
      _patient = p;
      _medHistory = mh;
      _analyses = (aResp && aResp.items) || (Array.isArray(aResp) ? aResp : []);
    } catch (_) {
      _patient = null; _medHistory = null; _analyses = [];
    }
  } else if (!patientId) {
    _patient = null; _medHistory = null; _analyses = [];
  }

  // Register global handlers
  window._qeegSelectPatient = async function (pid) {
    window._qeegPatientId = pid;
    window._qeegSelectedId = null;
    window._qeegComparisonId = null;
    _patient = null; _medHistory = null; _analyses = [];
    window._nav('qeeg-analysis');
  };
  window._qeegClearPatient = function () {
    window._qeegPatientId = null;
    window._qeegSelectedId = null;
    window._qeegComparisonId = null;
    _patient = null; _medHistory = null; _analyses = [];
    window._nav('qeeg-analysis');
  };
  window._qeegToggleSection = function (sectionId) {
    _collapsedSections[sectionId] = !_collapsedSections[sectionId];
    const infoEl = document.getElementById('qeeg-clinical-info');
    if (infoEl && _patient) {
      infoEl.innerHTML = renderClinicalInfo(_patient, _medHistory);
    }
  };

  // Build page shell
  let pageHtml = '<div class="ch-shell">';
  pageHtml += '<div class="qeeg-hero">'
    + '<div class="qeeg-hero__icon">&#x1F9E0;</div>'
    + '<div><div class="qeeg-hero__title">qEEG Analyzer</div>'
    + '<div class="qeeg-hero__sub">Spectral analysis &middot; AI interpretation &middot; Pre/post comparison</div></div>'
    + '</div>';
  pageHtml += renderPatientSelector(_patients, patientId);
  pageHtml += renderTabBar(tab);
  pageHtml += '<div id="qeeg-tab-content"></div>';
  pageHtml += '</div>';
  el.innerHTML = pageHtml;

  // Init patient selector
  initPatientSelector();

  const tabEl = document.getElementById('qeeg-tab-content');

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 1: PATIENT & UPLOAD
  // ══════════════════════════════════════════════════════════════════════════
  if (tab === 'patient') {
    if (!patientId) {
      var patEmptyHtml = emptyState('&#x1F9E0;', 'Select a Patient to Begin', 'Use the search box above to find and select a patient, then upload their EEG recording for analysis.');
      if (_isDemoMode()) {
        patEmptyHtml += '<div style="text-align:center;margin-top:-8px;padding-bottom:16px">'
          + '<button class="btn btn-primary btn-sm" onclick="window._qeegSelectedId=\'demo\';window._qeegTab=\'analysis\';window._nav(\'qeeg-analysis\')">View Sample Analysis</button></div>';
      }
      tabEl.innerHTML = patEmptyHtml;
      return;
    }

    tabEl.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" id="qeeg-patient-grid">'
      + '<div id="qeeg-clinical-info">' + spinner('Loading clinical info...') + '</div>'
      + '<div id="qeeg-upload-col">' + spinner() + '</div>'
      + '</div>';

    // Render clinical info
    const infoEl = document.getElementById('qeeg-clinical-info');
    if (infoEl) infoEl.innerHTML = renderClinicalInfo(_patient, _medHistory);

    // Render upload + analyses
    const uploadCol = document.getElementById('qeeg-upload-col');
    if (uploadCol) {
      var displayAnalyses = _analyses.length === 0 && _isDemoMode() ? [DEMO_ANALYSIS_ENTRY] : _analyses;
      uploadCol.innerHTML = renderUploadArea(patientId)
        + '<div style="margin-top:16px"><h4 style="font-size:14px;font-weight:600;margin:0 0 8px">Recent Analyses</h4>'
        + '<div id="qeeg-analyses-list">' + renderAnalysisList(displayAnalyses) + '</div></div>';
    }

    initUploadHandlers(patientId);

    // Responsive: stack on narrow screens
    const grid = document.getElementById('qeeg-patient-grid');
    if (grid && window.innerWidth < 900) {
      grid.style.gridTemplateColumns = '1fr';
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 2: ANALYSIS
  // ══════════════════════════════════════════════════════════════════════════
  if (tab === 'analysis') {
    const analysisId = window._qeegSelectedId;
    if (!analysisId) {
      var analysisEmptyHtml = emptyState('&#x1F4CA;', 'No Analysis Selected', 'Select an analysis from the Patient & Upload tab to view results.', 'Go to Patient & Upload', "window._qeegTab='patient';window._nav('qeeg-analysis')");
      if (_isDemoMode()) {
        analysisEmptyHtml += '<div style="text-align:center;margin-top:-8px;padding-bottom:16px">'
          + '<button class="btn btn-outline btn-sm" onclick="window._qeegSelectedId=\'demo\';window._nav(\'qeeg-analysis\')">View Sample Analysis</button></div>';
      }
      tabEl.innerHTML = analysisEmptyHtml;
      return;
    }

    tabEl.innerHTML = spinner('Loading analysis...');

    try {
      var data;
      if (analysisId === 'demo' && _isDemoMode()) {
        data = DEMO_QEEG_ANALYSIS;
      } else {
        data = await api.getQEEGAnalysis(analysisId);
      }

      // If pending — show manual trigger
      if (data.analysis_status === 'pending') {
        tabEl.innerHTML = card('Analysis Pending',
          '<div style="text-align:center;padding:24px">'
          + '<div style="margin-bottom:12px">' + badge('pending', 'var(--amber)') + '</div>'
          + '<div style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">File uploaded: <strong>' + esc(data.original_filename || 'EDF') + '</strong></div>'
          + '<button class="btn btn-primary" id="qeeg-run-btn">Run Spectral Analysis</button>'
          + '<div id="qeeg-analyze-status" style="margin-top:12px"></div></div>'
        );
        const runBtn = document.getElementById('qeeg-run-btn');
        if (runBtn) {
          runBtn.addEventListener('click', async function () {
            runBtn.disabled = true;
            const st = document.getElementById('qeeg-analyze-status');
            if (st) st.innerHTML = spinner('Running spectral analysis...');
            try {
              await api.analyzeQEEG(analysisId);
              window._nav('qeeg-analysis'); // Reload to show results
            } catch (err) {
              if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Error: ' + esc(err.message || err) + '</div>';
              runBtn.disabled = false;
            }
          });
        }
        return;
      }

      // If processing — show polling spinner
      if (data.analysis_status === 'processing') {
        tabEl.innerHTML = '<div style="text-align:center;padding:48px">'
          + spinner('Analysis in progress... This usually takes a few seconds.')
          + '</div>';
        setTimeout(function () { window._nav('qeeg-analysis'); }, 3000);
        return;
      }

      // If failed
      if (data.analysis_status === 'failed') {
        tabEl.innerHTML = card('Analysis Failed',
          '<div style="color:var(--red);padding:12px">'
          + '<div style="margin-bottom:8px">' + badge('failed', 'var(--red)') + '</div>'
          + '<div style="font-size:13px">' + esc(data.analysis_error || 'Unknown error') + '</div></div>'
        );
        return;
      }

      // Completed — show full results
      const bp = data.band_powers || data.band_powers_json || {};
      const bands = bp.bands || {};
      const ratios = bp.derived_ratios || {};
      const artifact = data.artifact_rejection || data.artifact_rejection_json || {};

      let html = '';

      // Status strip
      html += '<div class="qeeg-status-strip">'
        + badge('completed', 'var(--green)')
        + '<span>'
        + esc(data.original_filename || '') + ' | '
        + (data.channels_used || data.channel_count || 0) + ' channels, '
        + (data.sample_rate_hz || 0) + ' Hz, '
        + ((data.recording_duration_sec || data.duration_sec || 0) / 60).toFixed(1) + ' min'
        + (data.eyes_condition ? ' | eyes ' + esc(data.eyes_condition) : '')
        + '</span></div>';

      // Derived ratios
      if (ratios && Object.keys(ratios).length) {
        const ratioCards = [
          { key: 'theta_beta_ratio', label: 'Theta/Beta Ratio', ref: '> 4.5 elevated (ADHD marker)', color: 'var(--violet)' },
          { key: 'delta_alpha_ratio', label: 'Delta/Alpha Ratio', ref: '> 2.0 elevated (TBI marker)', color: 'var(--blue)' },
          { key: 'alpha_peak_frequency_hz', label: 'Alpha Peak (Hz)', ref: '8-12 Hz normal, < 8 Hz slowing', color: 'var(--teal)' },
          { key: 'frontal_alpha_asymmetry', label: 'Frontal Asymmetry', ref: '|FAA| > 0.2 significant', color: 'var(--amber)' },
        ];
        let ratioHtml = '<div class="ch-kpi-strip">';
        ratioCards.forEach(function (r) {
          const val = ratios[r.key];
          if (val === undefined || val === null) return;
          ratioHtml += '<div class="ch-kpi-card" style="--kpi-color:' + r.color + '">'
            + '<div class="ch-kpi-val">' + (typeof val === 'number' ? val.toFixed(2) : esc(val)) + '</div>'
            + '<div class="ch-kpi-label">' + esc(r.label) + '</div>'
            + '<div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;font-style:italic">' + esc(r.ref) + '</div></div>';
        });
        ratioHtml += '</div>';
        html += card('Derived Clinical Ratios', ratioHtml);
      }

      // Topographic heatmaps
      if (bands && Object.keys(bands).length) {
        let topoHtml = '<div class="qeeg-band-grid">';
        Object.keys(bands).forEach(function (bandName) {
          const channelData = bands[bandName]?.channels || {};
          const powerMap = {};
          Object.entries(channelData).forEach(function (entry) {
            powerMap[entry[0]] = entry[1].relative_pct || 0;
          });
          topoHtml += '<div style="text-align:center">'
            + renderTopoHeatmap(powerMap, { band: bandName, unit: '%', size: 180, colorScale: 'warm' })
            + '</div>';
        });
        topoHtml += '</div>';
        html += card('Topographic Maps (Relative Power %)', topoHtml);
      }

      // Band power table
      if (bands && Object.keys(bands).length) {
        let tableHtml = '<div style="overflow-x:auto"><table class="ds-table" style="width:100%;font-size:12px"><thead><tr><th>Channel</th>';
        const bandNames = Object.keys(bands);
        bandNames.forEach(function (b) {
          tableHtml += '<th style="color:' + (BAND_COLORS[b] || '#fff') + '">' + esc(b) + '</th>';
        });
        tableHtml += '</tr></thead><tbody>';
        const chSet = new Set();
        bandNames.forEach(function (b) { Object.keys(bands[b]?.channels || {}).forEach(function (ch) { chSet.add(ch); }); });
        Array.from(chSet).sort().forEach(function (ch) {
          tableHtml += '<tr><td style="font-weight:600">' + esc(ch) + '</td>';
          bandNames.forEach(function (b) {
            const v = bands[b]?.channels?.[ch]?.relative_pct;
            tableHtml += '<td>' + (v !== undefined ? v.toFixed(1) + '%' : '-') + '</td>';
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table></div>';
        html += card('Band Power Distribution', tableHtml);
      }

      // Artifact rejection
      if (artifact && artifact.epochs_total) {
        html += card('Artifact Rejection',
          '<div style="font-size:13px;color:var(--text-secondary)">'
          + 'Epochs: ' + artifact.epochs_kept + '/' + artifact.epochs_total + ' kept ('
          + ((artifact.epochs_kept / artifact.epochs_total * 100) || 0).toFixed(0) + '%)'
          + (artifact.flat_channels && artifact.flat_channels.length ? ' | Flat channels: ' + artifact.flat_channels.map(esc).join(', ') : '')
          + '</div>'
        );
      }

      // Action buttons
      var compareAction = (analysisId === 'demo' && _isDemoMode())
        ? "window._qeegComparisonId='demo';window._qeegTab='compare';window._nav('qeeg-analysis')"
        : "window._qeegTab='compare';window._nav('qeeg-analysis')";
      html += '<div style="display:flex;gap:12px;justify-content:center;margin-top:16px">'
        + '<button class="btn btn-primary" onclick="window._qeegTab=\'report\';window._nav(\'qeeg-analysis\')">Generate AI Report</button>'
        + '<button class="btn btn-outline" onclick="' + compareAction + '">Compare with Another</button>'
        + '</div>';

      // ── Advanced Analyses Section ───────────────────────────────────────
      html += _renderAdvancedAnalyses(data, analysisId);

      if (analysisId === 'demo' && _isDemoMode()) {
        html = _demoBanner() + html;
      }
      tabEl.innerHTML = html;

      // Bind advanced analyses button
      setTimeout(function () {
        var runBtn = document.getElementById('qeeg-run-advanced-btn');
        if (runBtn) {
          runBtn.addEventListener('click', async function () {
            runBtn.disabled = true;
            runBtn.textContent = 'Running 25 analyses...';
            try {
              var result = await api.runAdvancedQEEGAnalyses(analysisId);
              // Re-render tab with updated data
              window._nav('qeeg-analysis');
            } catch (e) {
              runBtn.disabled = false;
              runBtn.textContent = 'Run Advanced Analyses';
              var errEl = document.getElementById('qeeg-advanced-error');
              if (errEl) errEl.innerHTML = '<div style="color:var(--red);padding:8px;font-size:13px">Error: ' + esc(e.message || e) + '</div>';
            }
          });
        }
        // Collapsible group toggles
        document.querySelectorAll('.qeeg-adv-group-toggle').forEach(function (toggle) {
          toggle.addEventListener('click', function () {
            var body = toggle.nextElementSibling;
            var arrow = toggle.querySelector('.qeeg-adv-arrow');
            if (body) {
              var isCollapsed = body.classList.contains('qeeg-adv-category__body--collapsed');
              body.classList.toggle('qeeg-adv-category__body--collapsed');
              if (arrow) arrow.classList.toggle('qeeg-adv-arrow--collapsed');
            }
          });
        });
      }, 50);
    } catch (err) {
      tabEl.innerHTML = '<div style="color:var(--red);padding:24px">Failed to load analysis: ' + esc(err.message || err) + '</div>';
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 3: AI REPORT
  // ══════════════════════════════════════════════════════════════════════════
  if (tab === 'report') {
    const analysisId = window._qeegSelectedId;
    if (!analysisId) {
      var reportEmptyHtml = emptyState('&#x1F4DD;', 'No Analysis Selected', 'Select an analysis first to generate an AI report.', 'Go to Patient & Upload', "window._qeegTab='patient';window._nav('qeeg-analysis')");
      if (_isDemoMode()) {
        reportEmptyHtml += '<div style="text-align:center;margin-top:-8px;padding-bottom:16px">'
          + '<button class="btn btn-outline btn-sm" onclick="window._qeegSelectedId=\'demo\';window._qeegTab=\'report\';window._nav(\'qeeg-analysis\')">View Sample Report</button></div>';
      }
      tabEl.innerHTML = reportEmptyHtml;
      return;
    }

    tabEl.innerHTML = spinner('Loading reports...');

    try {
      let reports = [];
      try {
        const rData = await api.listQEEGAnalysisReports(analysisId);
        reports = Array.isArray(rData) ? rData : (rData?.reports || []);
      } catch (_) { /* no reports yet */ }

      // Demo mode fallback when no reports available
      if (reports.length === 0 && _isDemoMode() && analysisId === 'demo') {
        reports = [DEMO_QEEG_REPORT];
      }

      if (reports.length === 0) {
        tabEl.innerHTML = card('Generate AI Interpretation',
          '<div style="text-align:center;padding:24px">'
          + '<p style="color:var(--text-secondary);margin-bottom:16px;font-size:13px">No AI report has been generated for this analysis yet.</p>'
          + '<button class="btn btn-primary" id="qeeg-gen-report-btn">Generate AI Report</button>'
          + '<div id="qeeg-gen-status" style="margin-top:12px"></div></div>'
        );
        const btn = document.getElementById('qeeg-gen-report-btn');
        if (btn) {
          btn.addEventListener('click', async function () {
            btn.disabled = true;
            const st = document.getElementById('qeeg-gen-status');
            if (st) st.innerHTML = spinner('Generating AI interpretation...');
            try {
              await api.generateQEEGAIReport(analysisId, { report_type: 'standard' });
              window._qeegTab = 'report';
              window._nav('qeeg-analysis');
            } catch (err) {
              if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Error: ' + esc(err.message || err) + '</div>';
              btn.disabled = false;
            }
          });
        }
        return;
      }

      // Display latest report
      const report = reports[0];
      const narrative = report.ai_narrative || report.ai_narrative_json || {};
      const conditions = report.condition_matches || report.condition_matches_json || [];
      const suggestions = report.protocol_suggestions || report.protocol_suggestions_json || [];

      let html = '';

      // Executive summary
      if (narrative.summary) {
        html += card('Executive Summary', '<div class="qeeg-narrative qeeg-narrative--summary">' + esc(narrative.summary) + '</div>');
      }

      // Detailed findings
      if (narrative.detailed_findings) {
        html += card('Detailed Findings', '<div class="qeeg-narrative qeeg-narrative--findings">' + esc(narrative.detailed_findings) + '</div>');
      }

      // Condition matches
      if (conditions.length) {
        let condHtml = '<div style="display:flex;flex-direction:column;gap:8px">';
        conditions.forEach(function (c) {
          const conf = (c.confidence || 0);
          const pct = Math.round(conf * 100);
          const barColor = conf > 0.7 ? 'var(--red)' : conf > 0.4 ? 'var(--amber)' : 'var(--blue)';
          condHtml += '<div style="display:flex;align-items:center;gap:12px">'
            + '<div style="width:160px;font-weight:600;font-size:13px">' + esc(c.condition || c.name || 'Unknown') + '</div>'
            + '<div style="flex:1;background:rgba(255,255,255,0.06);border-radius:4px;height:20px;position:relative">'
            + '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width .3s"></div>'
            + '<span style="position:absolute;right:8px;top:2px;font-size:11px;color:var(--text-primary)">' + pct + '%</span></div></div>';
        });
        condHtml += '</div>';
        html += card('Condition Pattern Matches', condHtml);
      }

      // Protocol suggestions
      if (suggestions.length) {
        let sugHtml = '<ul style="margin:0;padding-left:20px">';
        suggestions.forEach(function (s) {
          sugHtml += '<li style="margin-bottom:8px;font-size:13px;color:var(--text-secondary)">'
            + '<strong>' + esc(s.protocol || s.title || '') + '</strong>'
            + (s.rationale ? ': ' + esc(s.rationale) : '') + '</li>';
        });
        sugHtml += '</ul>';
        html += card('Protocol Suggestions', sugHtml);
      }

      // Clinician review
      html += card('Clinician Review',
        '<div style="padding:8px">'
        + (report.clinician_reviewed
          ? '<div style="margin-bottom:8px">' + badge('Reviewed', 'var(--green)') + '</div>'
          : '<div style="margin-bottom:8px">' + badge('Pending Review', 'var(--amber)') + '</div>')
        + '<textarea id="qeeg-amendments" class="form-control" rows="3" placeholder="Add clinical amendments or notes...">'
        + esc(report.clinician_amendments || '') + '</textarea>'
        + '<div style="margin-top:8px;text-align:right">'
        + '<button class="btn btn-sm btn-outline" id="qeeg-save-review">Save & Mark Reviewed</button></div>'
        + '<div id="qeeg-review-status" style="margin-top:8px"></div></div>'
      );

      if (analysisId === 'demo' && _isDemoMode()) {
        html = _demoBanner() + html;
      }
      tabEl.innerHTML = html;

      // Review handler
      const reviewBtn = document.getElementById('qeeg-save-review');
      if (reviewBtn) {
        reviewBtn.addEventListener('click', async function () {
          const amendments = document.getElementById('qeeg-amendments')?.value || '';
          const st = document.getElementById('qeeg-review-status');
          reviewBtn.disabled = true;
          try {
            await api.amendQEEGReport(report.id, { clinician_reviewed: true, clinician_amendments: amendments });
            if (st) st.innerHTML = '<div style="color:var(--green);font-size:13px">Review saved successfully.</div>';
          } catch (err) {
            if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Error: ' + esc(err.message || err) + '</div>';
            reviewBtn.disabled = false;
          }
        });
      }
    } catch (err) {
      tabEl.innerHTML = '<div style="color:var(--red);padding:24px">Failed to load report: ' + esc(err.message || err) + '</div>';
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 4: COMPARE
  // ══════════════════════════════════════════════════════════════════════════
  if (tab === 'compare') {
    // If comparison already loaded, show results
    if (window._qeegComparisonId) {
      tabEl.innerHTML = spinner('Loading comparison...');
      try {
        var comp;
        if (window._qeegComparisonId === 'demo' && _isDemoMode()) {
          comp = DEMO_QEEG_COMPARISON;
        } else {
          comp = await api.getQEEGComparison(window._qeegComparisonId);
        }
        var compHtml = renderComparison(comp)
          + '<div style="text-align:center;margin-top:16px"><button class="btn btn-outline btn-sm" onclick="window._qeegComparisonId=null;window._nav(\'qeeg-analysis\')">New Comparison</button></div>';
        if (window._qeegComparisonId === 'demo' && _isDemoMode()) {
          compHtml = _demoBanner() + compHtml;
        }
        tabEl.innerHTML = compHtml;
      } catch (err) {
        tabEl.innerHTML = '<div style="color:var(--red);padding:24px">Failed: ' + esc(err.message || err) + '</div>';
      }
      return;
    }

    if (!patientId) {
      var compareEmptyHtml = '<div style="text-align:center;padding:48px;color:var(--text-tertiary)">Select a patient first.</div>';
      if (_isDemoMode()) {
        compareEmptyHtml += '<div style="text-align:center;padding-bottom:16px">'
          + '<button class="btn btn-outline btn-sm" onclick="window._qeegComparisonId=\'demo\';window._nav(\'qeeg-analysis\')">View Sample Comparison</button></div>';
      }
      tabEl.innerHTML = compareEmptyHtml;
      return;
    }

    // Load completed analyses for dropdowns
    const completedAnalyses = _analyses.filter(function (a) { return a.analysis_status === 'completed'; });
    if (completedAnalyses.length < 2) {
      tabEl.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text-tertiary)">'
        + '<div style="font-size:14px;margin-bottom:8px">At least 2 completed analyses are needed for comparison.</div>'
        + '<div style="font-size:13px">Current completed: ' + completedAnalyses.length + '</div></div>';
      return;
    }

    // Build comparison form with dropdowns
    function optionsList(exclude) {
      return completedAnalyses.map(function (a) {
        if (a.id === exclude) return '';
        return '<option value="' + a.id + '">' + esc(a.original_filename || 'EDF') + ' (' + (a.analyzed_at ? new Date(a.analyzed_at).toLocaleDateString() : 'N/A') + ')</option>';
      }).join('');
    }

    tabEl.innerHTML = card('Create Pre/Post Comparison',
      '<div style="padding:8px">'
      + '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">Compare a baseline qEEG analysis with a follow-up to track treatment progress.</p>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">'
      + '<div><label style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;display:block;margin-bottom:4px">Baseline Analysis</label>'
      + '<select id="qeeg-baseline-sel" class="form-control"><option value="">Select baseline...</option>' + optionsList('') + '</select></div>'
      + '<div><label style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;display:block;margin-bottom:4px">Follow-up Analysis</label>'
      + '<select id="qeeg-followup-sel" class="form-control"><option value="">Select follow-up...</option>' + optionsList('') + '</select></div></div>'
      + '<div style="text-align:center"><button class="btn btn-primary" id="qeeg-compare-btn">Compare</button></div>'
      + '<div id="qeeg-compare-status" style="margin-top:12px"></div></div>'
    );

    const cmpBtn = document.getElementById('qeeg-compare-btn');
    if (cmpBtn) {
      cmpBtn.addEventListener('click', async function () {
        const baseId = document.getElementById('qeeg-baseline-sel')?.value;
        const followId = document.getElementById('qeeg-followup-sel')?.value;
        const st = document.getElementById('qeeg-compare-status');
        if (!baseId || !followId) {
          if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Both analyses must be selected.</div>';
          return;
        }
        if (baseId === followId) {
          if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Baseline and follow-up must be different analyses.</div>';
          return;
        }
        cmpBtn.disabled = true;
        if (st) st.innerHTML = spinner('Computing comparison...');
        try {
          const result = await api.createQEEGComparison({ baseline_id: baseId, followup_id: followId });
          window._qeegComparisonId = result.id;
          window._nav('qeeg-analysis');
        } catch (err) {
          if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Error: ' + esc(err.message || err) + '</div>';
          cmpBtn.disabled = false;
        }
      });
    }
    return;
  }
}

// ── Comparison Renderer ──────────────────────────────────────────────────────

function renderComparison(comp) {
  const delta = comp.delta_powers_json || comp.delta_powers || {};
  const summary = comp.improvement_summary_json || comp.improvement_summary || {};
  const narrative = comp.ai_comparison_narrative || '';

  let html = '';

  // Summary stats
  if (summary.improved !== undefined) {
    html += card('Improvement Summary',
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(3,1fr)">'
      + '<div class="ch-kpi-card" style="--kpi-color:var(--green)">'
      + '<div class="ch-kpi-val">' + (summary.improved || 0) + '</div>'
      + '<div class="ch-kpi-label">Improved</div></div>'
      + '<div class="ch-kpi-card" style="--kpi-color:var(--amber)">'
      + '<div class="ch-kpi-val">' + (summary.unchanged || 0) + '</div>'
      + '<div class="ch-kpi-label">Unchanged</div></div>'
      + '<div class="ch-kpi-card" style="--kpi-color:var(--red)">'
      + '<div class="ch-kpi-val">' + (summary.worsened || 0) + '</div>'
      + '<div class="ch-kpi-label">Worsened</div></div></div>'
    );
  }

  // AI narrative
  if (narrative) {
    html += card('AI Comparison Narrative',
      '<div class="qeeg-narrative">' + esc(narrative) + '</div>'
    );
  }

  // Delta power changes table
  if (delta && delta.bands) {
    const bandNames = Object.keys(delta.bands);
    let tableHtml = '<div style="overflow-x:auto"><table class="ds-table" style="width:100%;font-size:12px"><thead><tr><th>Channel</th>';
    bandNames.forEach(function (b) {
      tableHtml += '<th style="color:' + (BAND_COLORS[b] || '#fff') + '">' + esc(b) + '</th>';
    });
    tableHtml += '</tr></thead><tbody>';
    const chSet = new Set();
    bandNames.forEach(function (b) {
      Object.keys(delta.bands[b] || {}).forEach(function (ch) { chSet.add(ch); });
    });
    Array.from(chSet).sort().forEach(function (ch) {
      tableHtml += '<tr><td style="font-weight:600">' + esc(ch) + '</td>';
      bandNames.forEach(function (b) {
        const d = delta.bands[b]?.[ch];
        if (d && d.pct_change !== undefined) {
          const pct = d.pct_change;
          const color = pct > 5 ? 'var(--red)' : pct < -5 ? 'var(--green)' : 'var(--text-secondary)';
          const arrow = pct > 0 ? '+' : '';
          tableHtml += '<td style="color:' + color + '">' + arrow + pct.toFixed(1) + '%</td>';
        } else {
          tableHtml += '<td>-</td>';
        }
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table></div>';
    html += card('Power Changes (Follow-up vs Baseline)', tableHtml);
  }

  return html;
}

// ── Channel name mapping: backend T3/T4/T5/T6 -> frontend T7/T8/P7/P8 ──────
var _CH_MAP = { T3: 'T7', T4: 'T8', T5: 'P7', T6: 'P8' };
function mapCh(ch) { return _CH_MAP[ch] || ch; }

// ── Advanced Analyses Renderer ───────────────────────────────────────────────

function _renderAdvancedAnalyses(data, analysisId) {
  var adv = data.advanced_analyses;
  var html = '<div class="qeeg-section-divider"></div>';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
    + '<span style="font-size:18px">&#x1F52C;</span>'
    + '<h3 style="margin:0;font-size:16px;color:var(--text-primary)">Advanced Analyses (25)</h3></div>';

  if (!adv || !adv.results || Object.keys(adv.results).length === 0) {
    html += '<div style="text-align:center;padding:32px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px dashed rgba(255,255,255,0.1)">'
      + '<div style="font-size:28px;margin-bottom:8px;opacity:0.5">&#x2699;</div>'
      + '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:14px">Run 25 advanced analyses including connectivity, complexity, microstates, and more.</p>'
      + '<button class="btn btn-primary" id="qeeg-run-advanced-btn">Run Advanced Analyses</button>'
      + '<div id="qeeg-advanced-error"></div></div></div>';
    return html;
  }

  // Meta summary
  var meta = adv.meta || {};
  html += '<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center">'
    + badge(meta.completed + '/' + meta.total + ' completed', 'var(--green)')
    + (meta.failed > 0 ? badge(meta.failed + ' failed', 'var(--red)') : '')
    + badge(meta.duration_sec + 's', 'var(--blue)')
    + '<button class="btn btn-sm btn-outline" id="qeeg-run-advanced-btn" style="margin-left:auto">Re-run</button>'
    + '</div><div id="qeeg-advanced-error"></div>';

  // Group results by category
  var categories = {};
  var catOrder = ['spectral', 'asymmetry', 'connectivity', 'complexity', 'network', 'microstate', 'clinical'];
  var catLabels = {
    spectral: 'Spectral Analyses', asymmetry: 'Asymmetry Analyses',
    connectivity: 'Connectivity Analyses', complexity: 'Complexity Analyses',
    network: 'Network Analyses', microstate: 'Microstate Analysis',
    clinical: 'Clinical Analyses',
  };
  var catColors = {
    spectral: 'var(--blue)', asymmetry: 'var(--amber)', connectivity: 'var(--teal)',
    complexity: 'var(--violet)', network: 'var(--rose)', microstate: 'var(--green)',
    clinical: 'var(--red)',
  };
  var catIcons = {
    spectral: '&#x1F4CA;', asymmetry: '&#x2696;', connectivity: '&#x1F517;',
    complexity: '&#x1F9E9;', network: '&#x1F578;', microstate: '&#x26A1;',
    clinical: '&#x1F3E5;',
  };

  Object.keys(adv.results).forEach(function (slug) {
    var r = adv.results[slug];
    var cat = r.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ slug: slug, result: r });
  });

  catOrder.forEach(function (cat) {
    var items = categories[cat];
    if (!items || !items.length) return;

    var okCount = items.filter(function (i) { return i.result.status === 'ok'; }).length;
    var color = catColors[cat] || 'var(--teal)';
    html += '<div class="qeeg-adv-category" style="--cat-color:' + color + '">'
      + '<div class="qeeg-adv-category__header qeeg-adv-group-toggle">'
      + '<span class="qeeg-adv-arrow">&#x25BC;</span>'
      + '<span class="qeeg-adv-category__icon">' + (catIcons[cat] || '&#x2699;') + '</span>'
      + '<span class="qeeg-adv-category__title">' + esc(catLabels[cat] || cat) + '</span>'
      + '<span class="qeeg-adv-category__count">' + okCount + '/' + items.length + '</span>'
      + '</div>'
      + '<div class="qeeg-adv-category__body">';

    items.forEach(function (item) {
      html += _renderSingleAnalysis(item.slug, item.result);
    });

    html += '</div></div>';
  });

  html += '</div>';
  return html;
}


function _renderSingleAnalysis(slug, r) {
  var statusColor = r.status === 'ok' ? 'var(--green)' : 'var(--red)';
  var html = '<div class="qeeg-adv-item">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
    + badge(r.status, statusColor)
    + '<strong style="font-size:13px">' + esc(r.label) + '</strong>'
    + '<span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">' + (r.duration_ms || 0) + 'ms</span>'
    + '</div>';

  if (r.status === 'error') {
    html += '<div style="font-size:12px;color:var(--red)">' + esc(r.error || 'Unknown error') + '</div>';
    return html + '</div>';
  }

  if (r.summary) {
    html += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;font-style:italic">' + esc(r.summary) + '</div>';
  }

  var d = r.data || {};

  // Slug-specific renderers
  if (slug === 'u_shape') {
    html += _renderMetricGrid([
      { label: 'Mean U-Score', value: d.mean_u_score },
      { label: 'U-Shape Channels', value: (d.u_shape_present_count || 0) + '/' + (d.total_channels || 0) },
    ]);
  } else if (slug === 'fooof_decomposition') {
    html += _renderMetricGrid([
      { label: 'Mean 1/f Exponent', value: d.mean_aperiodic_exponent },
    ]);
    if (d.channels) html += _renderChannelTable(d.channels, ['aperiodic_exponent', 'n_peaks', 'r_squared']);
  } else if (slug === 'spectral_edge_frequency') {
    html += _renderMetricGrid([
      { label: 'Mean SEF50', value: d.mean_sef50_hz, unit: 'Hz' },
      { label: 'Mean SEF95', value: d.mean_sef95_hz, unit: 'Hz' },
    ]);
  } else if (slug === 'band_peak_frequencies') {
    html += _renderMetricGrid([
      { label: 'Mean Alpha Peak', value: d.mean_alpha_peak_hz, unit: 'Hz' },
    ]);
  } else if (slug === 'full_asymmetry_matrix') {
    if (d.pairs) html += _renderAsymmetryTable(d.pairs);
  } else if (slug === 'frontal_alpha_dominance') {
    html += _renderMetricGrid([
      { label: 'Overall Dominance', value: d.overall_dominance },
      { label: 'Mean FAA', value: d.mean_faa },
    ]);
  } else if (slug === 'delta_dominance') {
    html += _renderMetricGrid([
      { label: 'Lateralized Pairs', value: d.lateralized_pairs },
    ]);
  } else if (slug === 'regional_asymmetry_severity') {
    html += _renderMetricGrid([
      { label: 'Overall Severity', value: d.overall_severity },
    ]);
    if (d.regions) {
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">';
      Object.keys(d.regions).forEach(function (reg) {
        var sev = d.regions[reg].severity;
        var sevColor = sev === 'severe' ? 'var(--red)' : sev === 'moderate' ? 'var(--amber)' : sev === 'mild' ? '#ffd54f' : 'var(--green)';
        html += badge(reg + ': ' + sev, sevColor);
      });
      html += '</div>';
    }
  } else if (slug === 'coherence_matrix') {
    if (d.channels && d.bands) {
      var alphaMat = d.bands.alpha;
      if (alphaMat) {
        html += '<div style="overflow-x:auto;margin-top:8px">'
          + renderConnectivityMatrix(alphaMat, d.channels, { band: 'alpha coherence', size: 340 })
          + '</div>';
      }
    }
  } else if (slug === 'disconnection_flags') {
    html += _renderMetricGrid([
      { label: 'Flagged Pairs', value: d.flagged_count },
      { label: 'Total Checked', value: d.total_pairs_checked },
    ]);
    if (d.flags && d.flags.length) {
      html += '<div style="max-height:120px;overflow-y:auto;margin-top:8px;font-size:12px">';
      d.flags.slice(0, 10).forEach(function (f) {
        html += '<div style="padding:2px 0;color:var(--text-secondary)">' + esc(f.ch1) + ' - ' + esc(f.ch2) + ' (' + esc(f.band) + '): ' + f.coherence + '</div>';
      });
      if (d.flags.length > 10) html += '<div style="color:var(--text-tertiary)">... and ' + (d.flags.length - 10) + ' more</div>';
      html += '</div>';
    }
  } else if (slug === 'pli_icoh') {
    html += _renderMetricGrid([
      { label: 'Mean Alpha PLI', value: d.mean_pli },
      { label: 'Total Pairs', value: d.total_pairs },
    ]);
  } else if (slug === 'wpli') {
    if (d.bands) {
      var wpliMetrics = [];
      Object.keys(d.bands).forEach(function (b) {
        wpliMetrics.push({ label: b + ' wPLI', value: d.bands[b].mean_wpli });
      });
      html += _renderMetricGrid(wpliMetrics);
    }
  } else if (slug === 'entropy_analysis') {
    html += _renderMetricGrid([
      { label: 'Mean Sample Entropy', value: d.mean_sample_entropy },
      { label: 'Segment Duration', value: d.segment_duration_sec, unit: 's' },
    ]);
  } else if (slug === 'fractal_lz') {
    html += _renderMetricGrid([
      { label: 'Mean Higuchi FD', value: d.mean_higuchi_fd },
      { label: 'Mean Lempel-Ziv', value: d.mean_lempel_ziv },
    ]);
  } else if (slug === 'multiscale_entropy') {
    html += _renderMetricGrid([
      { label: 'Mean Complexity Index', value: d.mean_complexity_index },
    ]);
  } else if (slug === 'higuchi_fd_detailed') {
    html += _renderMetricGrid([
      { label: 'Dominant Complexity', value: d.dominant_classification },
    ]);
  } else if (slug === 'small_world_index') {
    html += _renderMetricGrid([
      { label: 'SW Index', value: d.small_world_index },
      { label: 'Clustering Coeff', value: d.clustering_coefficient },
      { label: 'Path Length', value: d.path_length },
      { label: 'Density', value: d.density },
    ]);
  } else if (slug === 'graph_theoretic_indices') {
    var g = d.global || {};
    html += _renderMetricGrid([
      { label: 'Mean Clustering', value: g.mean_clustering },
      { label: 'Efficiency', value: g.global_efficiency },
      { label: 'Mean Degree', value: g.mean_degree },
    ]);
    if (d.hubs && d.hubs.length) {
      html += '<div style="margin-top:4px;font-size:12px;color:var(--text-secondary)">Hub nodes: ' + d.hubs.map(mapCh).map(esc).join(', ') + '</div>';
    }
  } else if (slug === 'microstate_analysis') {
    html += _renderMetricGrid([
      { label: 'GEV', value: d.gev != null ? (d.gev * 100).toFixed(1) + '%' : '-' },
    ]);
    if (d.classes) {
      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px">';
      ['A', 'B', 'C', 'D'].forEach(function (cls) {
        var c = d.classes[cls];
        if (!c) return;
        html += '<div style="text-align:center;background:rgba(255,255,255,0.04);border-radius:6px;padding:8px">'
          + '<div style="font-size:18px;font-weight:700;color:var(--text-primary)">' + cls + '</div>'
          + '<div style="font-size:10px;color:var(--text-tertiary)">' + c.coverage_pct + '% coverage</div>'
          + '<div style="font-size:10px;color:var(--text-tertiary)">' + c.mean_duration_ms + 'ms</div>'
          + '<div style="font-size:10px;color:var(--text-tertiary)">' + c.occurrence_per_sec + '/s</div></div>';
      });
      html += '</div>';
    }
  } else if (slug === 'iapf_plasticity') {
    html += _renderMetricGrid([
      { label: 'Posterior IAPF', value: d.posterior_iapf_hz, unit: 'Hz' },
      { label: 'Global Mean IAPF', value: d.mean_iapf_hz, unit: 'Hz' },
    ]);
  } else if (slug === 'wavelet_decomposition') {
    if (d.band_summary) {
      var wMetrics = [];
      Object.keys(d.band_summary).forEach(function (b) {
        wMetrics.push({ label: b, value: d.band_summary[b], unit: 'uV\u00B2' });
      });
      html += _renderMetricGrid(wMetrics);
    }
  } else if (slug === 'ica_decomposition') {
    html += _renderMetricGrid([
      { label: 'Brain Components', value: d.brain_components },
      { label: 'Artifact Components', value: d.artifact_components },
      { label: 'Total', value: d.n_components },
    ]);
    if (d.type_counts) {
      html += '<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">';
      Object.keys(d.type_counts).forEach(function (t) {
        html += badge(t + ': ' + d.type_counts[t], t.startsWith('brain') ? 'var(--green)' : 'var(--amber)');
      });
      html += '</div>';
    }
  }

  return html + '</div>';
}


function _renderMetricGrid(metrics) {
  var html = '<div class="qeeg-metric-grid">';
  metrics.forEach(function (m) {
    var val = m.value;
    var display = val != null ? (typeof val === 'number' ? val.toFixed(val < 10 ? 3 : 1) : String(val)) : '-';
    html += '<div class="qeeg-metric">'
      + '<div class="qeeg-metric__val">' + esc(display) + (m.unit ? '<span class="qeeg-metric__unit"> ' + esc(m.unit) + '</span>' : '') + '</div>'
      + '<div class="qeeg-metric__label">' + esc(m.label) + '</div></div>';
  });
  return html + '</div>';
}


function _renderChannelTable(channels, fields) {
  var chNames = Object.keys(channels).sort();
  if (!chNames.length || !fields.length) return '';
  var html = '<div style="max-height:200px;overflow-y:auto;margin-top:8px"><table class="ds-table" style="width:100%;font-size:11px"><thead><tr><th>Ch</th>';
  fields.forEach(function (f) { html += '<th>' + esc(f) + '</th>'; });
  html += '</tr></thead><tbody>';
  chNames.forEach(function (ch) {
    var d = channels[ch];
    if (!d || d.error) return;
    html += '<tr><td style="font-weight:600">' + esc(mapCh(ch)) + '</td>';
    fields.forEach(function (f) {
      var v = d[f];
      html += '<td>' + (v != null ? (typeof v === 'number' ? v.toFixed(3) : esc(String(v))) : '-') + '</td>';
    });
    html += '</tr>';
  });
  return html + '</tbody></table></div>';
}


function _renderAsymmetryTable(pairs) {
  var pairNames = Object.keys(pairs);
  if (!pairNames.length) return '';
  var bandNames = Object.keys(pairs[pairNames[0]] || {});
  var html = '<div style="max-height:200px;overflow-y:auto;margin-top:8px"><table class="ds-table" style="width:100%;font-size:11px"><thead><tr><th>Pair</th>';
  bandNames.forEach(function (b) { html += '<th style="color:' + (BAND_COLORS[b] || '#fff') + '">' + esc(b) + '</th>'; });
  html += '</tr></thead><tbody>';
  pairNames.forEach(function (pair) {
    html += '<tr><td style="font-weight:600">' + esc(pair) + '</td>';
    bandNames.forEach(function (b) {
      var v = pairs[pair][b];
      var color = Math.abs(v) > 0.2 ? 'var(--amber)' : 'var(--text-secondary)';
      html += '<td style="color:' + color + '">' + (v != null ? v.toFixed(3) : '-') + '</td>';
    });
    html += '</tr>';
  });
  return html + '</tbody></table></div>';
}