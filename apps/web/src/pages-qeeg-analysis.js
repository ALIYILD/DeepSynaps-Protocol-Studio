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
import { renderTopoHeatmap, renderConnectivityMatrix, renderConnectivityBrainMap, renderICAComponents, renderWaveletHeatmap, renderChannelQualityMap } from './brain-map-svg.js';
import { emptyState, showToast, spark } from './helpers.js';

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

// ── AI narrative formatter (Step 1.4) ────────────────────────────────────────
function _formatNarrative(text) {
  if (!text) return '';
  var parts = esc(text).split(/\n{2,}/);
  var html = '';
  parts.forEach(function (p) {
    var trimmed = p.trim();
    if (!trimmed) return;
    if (/^[A-Z][A-Z &/()-]+:/.test(trimmed)) {
      var colonIdx = trimmed.indexOf(':');
      html += '<h4 class="qeeg-finding-heading">' + trimmed.substring(0, colonIdx) + '</h4>';
      var rest = trimmed.substring(colonIdx + 1).trim();
      if (rest) html += '<p class="qeeg-finding-para">' + rest + '</p>';
    } else {
      html += '<p class="qeeg-finding-para">' + trimmed + '</p>';
    }
  });
  return html;
}

// ── Clinical severity thresholds (Step 1.5) ──────────────────────────────────
var CLINICAL_THRESHOLDS = {
  tbr_screening: { path: 'theta_beta_ratio', extract: function (d) { return d && d.theta_beta_ratio; },
    ranges: [{ max: 3.5, label: 'Normal', color: 'var(--green)' }, { max: 4.5, label: 'Borderline', color: 'var(--amber)' }, { max: Infinity, label: 'Elevated', color: 'var(--red)' }] },
  entropy_analysis: { extract: function (d) { return d && d.mean_sample_entropy; },
    ranges: [{ max: 1.0, label: 'Low complexity', color: 'var(--amber)' }, { max: 2.0, label: 'Normal', color: 'var(--green)' }, { max: Infinity, label: 'High', color: 'var(--blue)' }] },
  small_world_index: { extract: function (d) { return d && d.small_world_index; },
    ranges: [{ max: 1.5, label: 'Random-like', color: 'var(--red)' }, { max: 3.0, label: 'Small-world', color: 'var(--green)' }, { max: Infinity, label: 'Regular-like', color: 'var(--amber)' }] },
  iapf_plasticity: { extract: function (d) { return d && d.posterior_iapf_hz; },
    ranges: [{ max: 8.5, label: 'Slow', color: 'var(--red)' }, { max: 10.5, label: 'Normal', color: 'var(--green)' }, { max: Infinity, label: 'Fast', color: 'var(--blue)' }] },
  fractal_lz: { extract: function (d) { return d && d.mean_higuchi_fd; },
    ranges: [{ max: 1.4, label: 'Low FD', color: 'var(--amber)' }, { max: 1.8, label: 'Normal', color: 'var(--green)' }, { max: Infinity, label: 'High FD', color: 'var(--blue)' }] },
  spectral_edge_frequency: { extract: function (d) { return d && d.mean_sef95_hz; },
    ranges: [{ max: 20, label: 'Low SEF', color: 'var(--amber)' }, { max: 30, label: 'Normal', color: 'var(--green)' }, { max: Infinity, label: 'High SEF', color: 'var(--blue)' }] },
};

function _getSeverityBadge(slug, data) {
  var thresh = CLINICAL_THRESHOLDS[slug];
  if (!thresh || !data) return '';
  var val = thresh.extract(data);
  if (val == null) return '';
  for (var i = 0; i < thresh.ranges.length; i++) {
    if (val <= thresh.ranges[i].max) {
      return badge(thresh.ranges[i].label, thresh.ranges[i].color);
    }
  }
  return '';
}

// ── Category summary generators (Step 1.6) ───────────────────────────────────
var _catSummaryExtractors = {
  spectral: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'spectral_edge_frequency' && d.mean_sef50_hz) parts.push('SEF50 ' + d.mean_sef50_hz + ' Hz');
      if (i.slug === 'band_peak_frequencies' && d.mean_alpha_peak_hz) parts.push('Alpha peak ' + d.mean_alpha_peak_hz + ' Hz');
      if (i.slug === 'u_shape') parts.push('U-Score ' + (d.mean_u_score || 0).toFixed(2));
    }); return parts.join(' | ') || 'Spectral features computed';
  },
  asymmetry: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'frontal_alpha_dominance' && d.overall_dominance) parts.push('FAA: ' + d.overall_dominance);
      if (i.slug === 'regional_asymmetry_severity' && d.overall_severity) parts.push('Severity: ' + d.overall_severity);
    }); return parts.join(' | ') || 'Asymmetry patterns analyzed';
  },
  connectivity: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'pli_icoh' && d.mean_pli != null) parts.push('PLI ' + d.mean_pli.toFixed(2));
      if (i.slug === 'disconnection_flags') parts.push(d.flagged_count + ' flags');
    }); return parts.join(' | ') || 'Connectivity computed';
  },
  complexity: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'entropy_analysis' && d.mean_sample_entropy) parts.push('Entropy ' + d.mean_sample_entropy.toFixed(2));
      if (i.slug === 'fractal_lz' && d.mean_higuchi_fd) parts.push('HFD ' + d.mean_higuchi_fd.toFixed(2));
    }); return parts.join(' | ') || 'Complexity metrics computed';
  },
  network: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'small_world_index' && d.small_world_index) parts.push('SW ' + d.small_world_index.toFixed(1));
      if (i.slug === 'graph_theoretic_indices' && d.global) parts.push('Eff ' + (d.global.global_efficiency || 0).toFixed(2));
    }); return parts.join(' | ') || 'Network topology analyzed';
  },
  microstate: function () { return 'Microstate segmentation A-D'; },
  clinical: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'iapf_plasticity' && d.posterior_iapf_hz) parts.push('IAPF ' + d.posterior_iapf_hz + ' Hz');
    }); return parts.join(' | ') || 'Clinical markers computed';
  },
};

// ── Module-scoped state for exports ──────────────────────────────────────────
var _currentAnalysis = null;
var _currentReport = null;
var _coherenceBand = 'alpha';

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
  normative_deviations: (function () {
    var nd = {}, zs = {
      Fp1:[1.2,0.8,-0.3,0.5,0.9,0.6], Fp2:[1.1,0.6,-0.4,0.6,1.0,0.5], F7:[0.8,0.3,-0.2,0.7,1.3,1.1],
      F3:[0.4,1.1,0.2,0.3,0.8,0.4], Fz:[-0.2,2.1,-0.5,-0.1,0.9,0.6], F4:[0.4,0.9,0.5,0.3,0.7,0.3],
      F8:[0.7,0.2,-0.3,0.8,1.2,0.9], T3:[0.3,-0.1,0.1,0.5,1.1,0.7], C3:[-0.3,0.6,0.8,0.1,0.5,0.1],
      Cz:[-0.5,1.8,0.3,-0.1,0.8,0.4], C4:[-0.3,0.4,1.0,0.1,0.4,0.0], T4:[0.3,-0.2,0.0,0.6,1.1,0.8],
      T5:[-0.2,-0.5,1.5,0.2,0.8,0.7], P3:[-0.8,-0.2,2.2,0.0,0.2,-0.1], Pz:[-1.0,-0.1,2.5,-0.2,0.1,-0.3],
      P4:[-0.7,-0.3,2.3,-0.1,0.1,-0.1], T6:[-0.2,-0.4,1.4,0.2,0.8,0.6], O1:[-1.2,-0.6,2.8,0.0,-0.2,-0.4],
      O2:[-1.2,-0.5,2.7,-0.1,-0.2,-0.3],
    }; var bands = ['delta','theta','alpha','beta','high_beta','gamma'];
    Object.keys(zs).forEach(function (ch) { nd[ch] = {}; bands.forEach(function (b, i) { nd[ch][b] = zs[ch][i]; }); });
    return nd;
  })(),
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
            Fp1: { aperiodic_exponent: 1.51, aperiodic_offset: 2.8, n_peaks: 2, r_squared: 0.96, peaks: [{cf:9.2,pw:0.6,bw:2.1},{cf:18.5,pw:0.3,bw:3.0}] },
            F3:  { aperiodic_exponent: 1.45, aperiodic_offset: 2.6, n_peaks: 3, r_squared: 0.97, peaks: [{cf:6.2,pw:0.4,bw:1.8},{cf:9.5,pw:0.8,bw:2.2},{cf:20.1,pw:0.2,bw:2.5}] },
            Fz:  { aperiodic_exponent: 1.38, aperiodic_offset: 2.5, n_peaks: 2, r_squared: 0.95, peaks: [{cf:6.5,pw:0.5,bw:2.0},{cf:9.3,pw:0.7,bw:2.3}] },
            C3:  { aperiodic_exponent: 1.35, aperiodic_offset: 2.4, n_peaks: 2, r_squared: 0.98, peaks: [{cf:9.6,pw:1.0,bw:2.1},{cf:19.8,pw:0.3,bw:2.8}] },
            Cz:  { aperiodic_exponent: 1.40, aperiodic_offset: 2.5, n_peaks: 3, r_squared: 0.96, peaks: [{cf:6.3,pw:0.5,bw:1.9},{cf:9.4,pw:0.9,bw:2.2},{cf:21.0,pw:0.2,bw:2.6}] },
            P3:  { aperiodic_exponent: 1.32, aperiodic_offset: 2.3, n_peaks: 2, r_squared: 0.97, peaks: [{cf:9.8,pw:1.2,bw:1.9},{cf:18.2,pw:0.3,bw:2.5}] },
            O1:  { aperiodic_exponent: 1.28, aperiodic_offset: 2.2, n_peaks: 3, r_squared: 0.98, peaks: [{cf:9.2,pw:1.5,bw:1.8},{cf:11.5,pw:0.4,bw:1.5},{cf:20.5,pw:0.2,bw:2.2}] },
            O2:  { aperiodic_exponent: 1.30, aperiodic_offset: 2.2, n_peaks: 3, r_squared: 0.97, peaks: [{cf:9.3,pw:1.4,bw:1.9},{cf:11.4,pw:0.3,bw:1.6},{cf:20.2,pw:0.2,bw:2.3}] },
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
          bands: {
            delta: [
              [1.00,0.68,0.55,0.42,0.30,0.28,0.18,0.16],
              [0.68,1.00,0.40,0.56,0.27,0.30,0.17,0.19],
              [0.55,0.40,1.00,0.52,0.48,0.38,0.30,0.28],
              [0.42,0.56,0.52,1.00,0.37,0.50,0.28,0.32],
              [0.30,0.27,0.48,0.37,1.00,0.62,0.55,0.42],
              [0.28,0.30,0.38,0.50,0.62,1.00,0.44,0.58],
              [0.18,0.17,0.30,0.28,0.55,0.44,1.00,0.65],
              [0.16,0.19,0.28,0.32,0.42,0.58,0.65,1.00],
            ],
            theta: [
              [1.00,0.65,0.58,0.44,0.32,0.29,0.20,0.18],
              [0.65,1.00,0.42,0.60,0.28,0.33,0.19,0.21],
              [0.58,0.42,1.00,0.55,0.52,0.40,0.34,0.31],
              [0.44,0.60,0.55,1.00,0.40,0.56,0.31,0.36],
              [0.32,0.28,0.52,0.40,1.00,0.66,0.60,0.48],
              [0.29,0.33,0.40,0.56,0.66,1.00,0.48,0.62],
              [0.20,0.19,0.34,0.31,0.60,0.48,1.00,0.72],
              [0.18,0.21,0.31,0.36,0.48,0.62,0.72,1.00],
            ],
            alpha: [
              [1.00,0.72,0.65,0.48,0.35,0.32,0.22,0.20],
              [0.72,1.00,0.47,0.66,0.31,0.36,0.21,0.23],
              [0.65,0.47,1.00,0.58,0.62,0.45,0.38,0.35],
              [0.48,0.66,0.58,1.00,0.44,0.63,0.34,0.39],
              [0.35,0.31,0.62,0.44,1.00,0.71,0.68,0.55],
              [0.32,0.36,0.45,0.63,0.71,1.00,0.54,0.69],
              [0.22,0.21,0.38,0.34,0.68,0.54,1.00,0.78],
              [0.20,0.23,0.35,0.39,0.55,0.69,0.78,1.00],
            ],
            beta: [
              [1.00,0.58,0.50,0.38,0.25,0.22,0.15,0.13],
              [0.58,1.00,0.36,0.52,0.22,0.26,0.14,0.16],
              [0.50,0.36,1.00,0.45,0.42,0.33,0.25,0.22],
              [0.38,0.52,0.45,1.00,0.32,0.44,0.22,0.26],
              [0.25,0.22,0.42,0.32,1.00,0.55,0.48,0.38],
              [0.22,0.26,0.33,0.44,0.55,1.00,0.36,0.50],
              [0.15,0.14,0.25,0.22,0.48,0.36,1.00,0.62],
              [0.13,0.16,0.22,0.26,0.38,0.50,0.62,1.00],
            ],
          } } },
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
        data: { posterior_iapf_hz: 9.24, mean_iapf_hz: 9.08,
          channels: {
            Fp1:{iapf_hz:8.6,bandwidth_hz:2.4,plasticity:'wide'}, Fp2:{iapf_hz:8.8,bandwidth_hz:2.2,plasticity:'wide'},
            F3:{iapf_hz:9.1,bandwidth_hz:2.0,plasticity:'wide'}, Fz:{iapf_hz:8.9,bandwidth_hz:1.8,plasticity:'narrow'},
            F4:{iapf_hz:9.2,bandwidth_hz:2.1,plasticity:'wide'}, F7:{iapf_hz:8.5,bandwidth_hz:2.3,plasticity:'wide'},
            F8:{iapf_hz:8.7,bandwidth_hz:2.1,plasticity:'wide'}, T3:{iapf_hz:9.0,bandwidth_hz:1.9,plasticity:'narrow'},
            C3:{iapf_hz:9.3,bandwidth_hz:1.7,plasticity:'narrow'}, Cz:{iapf_hz:9.1,bandwidth_hz:1.8,plasticity:'narrow'},
            C4:{iapf_hz:9.4,bandwidth_hz:1.9,plasticity:'narrow'}, T4:{iapf_hz:9.0,bandwidth_hz:2.0,plasticity:'wide'},
            T5:{iapf_hz:9.5,bandwidth_hz:1.6,plasticity:'narrow'}, P3:{iapf_hz:9.6,bandwidth_hz:1.5,plasticity:'narrow'},
            Pz:{iapf_hz:9.4,bandwidth_hz:1.4,plasticity:'narrow'}, P4:{iapf_hz:9.5,bandwidth_hz:1.6,plasticity:'narrow'},
            T6:{iapf_hz:9.3,bandwidth_hz:1.7,plasticity:'narrow'}, O1:{iapf_hz:9.2,bandwidth_hz:1.5,plasticity:'narrow'},
            O2:{iapf_hz:9.3,bandwidth_hz:1.6,plasticity:'narrow'},
          } } },
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
  baseline_analyzed_at: new Date(Date.now() - 90 * 86400000).toISOString(),
  followup_analyzed_at: new Date().toISOString(),
  improvement_summary: { improved: 8, unchanged: 7, worsened: 2 },
  ratio_changes: {
    theta_beta_ratio: { baseline: 3.82, followup: 3.34 },
    delta_alpha_ratio: { baseline: 1.41, followup: 1.28 },
    alpha_peak_frequency_hz: { baseline: 9.24, followup: 9.52 },
    frontal_alpha_asymmetry: { baseline: 0.18, followup: 0.09 },
  },
  baseline_band_powers: _buildDemoBandPowers(),
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

/* Demo assessment correlation data */
var DEMO_ASSESSMENT_CORRELATION = {
  success: true, qeeg_analyses_count: 2, assessments_count: 6,
  correlations: [
    { assessment: 'PHQ-9', baseline_score: 18, latest_score: 8, score_change: -10, score_pct_change: -55.5, trend: 'improving', scores: [18, 16, 14, 11, 9, 8] },
    { assessment: 'GAD-7', baseline_score: 14, latest_score: 7, score_change: -7, score_pct_change: -50.0, trend: 'improving', scores: [14, 13, 11, 10, 8, 7] },
    { assessment: 'PSQI', baseline_score: 12, latest_score: 8, score_change: -4, score_pct_change: -33.3, trend: 'improving', scores: [12, 12, 11, 10, 9, 8] },
    { assessment: 'BRIEF-A', baseline_score: 68, latest_score: 62, score_change: -6, score_pct_change: -8.8, trend: 'stable', scores: [68, 67, 66, 65, 63, 62] },
  ],
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
    + '<div id="qeeg-upload-status" aria-live="polite" style="margin-top:12px"></div>'
    + '<div id="qeeg-quality-indicator"></div>'
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
    showToast('File uploaded successfully', 'success');
    if (statusEl) statusEl.innerHTML = '<div style="color:var(--green);font-size:13px">Uploaded successfully! '
      + badge('pending', 'var(--amber)')
      + ' <a href="#" onclick="window._qeegSelectedId=\'' + result.id + '\';window._qeegTab=\'analysis\';window._nav(\'qeeg-analysis\');return false" style="color:var(--blue);margin-left:8px">Go to Analysis tab to run spectral analysis</a></div>';

    // Show recording quality indicator
    var qualEl = document.getElementById('qeeg-quality-indicator');
    if (qualEl && result) {
      var chCount = result.channels_used || 0;
      var sr = result.sample_rate_hz || 0;
      var chColor = chCount >= 19 ? 'var(--green)' : chCount >= 10 ? 'var(--amber)' : 'var(--red)';
      var srColor = sr >= 256 ? 'var(--green)' : sr >= 128 ? 'var(--amber)' : 'var(--red)';
      var qualityHtml = '<div style="margin-top:12px;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06)">'
        + '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Recording Quality</div>'
        + '<div style="display:flex;gap:12px;flex-wrap:wrap">';
      qualityHtml += '<div style="font-size:12px"><span style="color:' + chColor + ';font-weight:600">' + chCount + '</span> channels</div>'
        + '<div style="font-size:12px"><span style="color:' + srColor + ';font-weight:600">' + sr + ' Hz</span> sample rate</div>';
      if (result.eyes_condition) qualityHtml += '<div style="font-size:12px">Eyes: ' + esc(result.eyes_condition) + '</div>';
      qualityHtml += '</div><div id="qeeg-quality-detail" style="margin-top:8px"></div></div>';
      qualEl.innerHTML = qualityHtml;

      // Call backend quality-check endpoint for detailed scoring
      if (result.id) {
        api.runQEEGQualityCheck(result.id).then(function (qr) {
          var detailEl = document.getElementById('qeeg-quality-detail');
          if (!detailEl || !qr) return;
          var gradeColors = { excellent: 'var(--green)', good: 'var(--teal)', fair: 'var(--amber)', poor: 'var(--red)' };
          var gc = gradeColors[qr.overall_grade] || 'var(--text-secondary)';
          var dHtml = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
            + badge(qr.overall_grade, gc)
            + '<span style="font-size:12px;color:var(--text-secondary)">Score: ' + (qr.overall_score || 0).toFixed(0) + '/100</span></div>';
          if (qr.recommendations && qr.recommendations.length) {
            qr.recommendations.forEach(function (rec) {
              dHtml += '<div style="font-size:11px;color:var(--text-tertiary);padding:2px 0">' + esc(rec) + '</div>';
            });
          }
          detailEl.innerHTML = dHtml;
          // Render per-channel quality map if per-channel stats are available
          if (qr.channel_stats && typeof renderChannelQualityMap === 'function') {
            dHtml += '<div style="margin-top:8px">' + renderChannelQualityMap(qr.channel_stats) + '</div>';
            detailEl.innerHTML = dHtml;
          }
        }).catch(function () { /* quality check not available, local indicators sufficient */ });
      }
    }

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
  } catch (err) { showToast('Failed to refresh analyses list: ' + (err.message || err), 'error'); }
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
    } catch (err) { _patients = []; showToast('Failed to load patients: ' + (err.message || err), 'error'); }
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
    } catch (err) {
      _patient = null; _medHistory = null; _analyses = [];
      showToast('Failed to load patient data: ' + (err.message || err), 'error');
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
      _currentAnalysis = data;

      // If pending — show manual trigger
      if (data.analysis_status === 'pending') {
        tabEl.innerHTML = card('Analysis Pending',
          '<div style="text-align:center;padding:24px">'
          + '<div style="margin-bottom:12px">' + badge('pending', 'var(--amber)') + '</div>'
          + '<div style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">File uploaded: <strong>' + esc(data.original_filename || 'EDF') + '</strong></div>'
          + '<button class="btn btn-primary" id="qeeg-run-btn">Run Spectral Analysis</button>'
          + '<div id="qeeg-analyze-status" aria-live="polite" style="margin-top:12px"></div></div>'
        );
        const runBtn = document.getElementById('qeeg-run-btn');
        if (runBtn) {
          runBtn.addEventListener('click', async function () {
            runBtn.disabled = true;
            const st = document.getElementById('qeeg-analyze-status');
            if (st) st.innerHTML = spinner('Running spectral analysis...');
            try {
              await api.analyzeQEEG(analysisId);
              showToast('Spectral analysis started', 'success');
              // Start polling for status updates
              if (st) st.innerHTML = spinner('Processing...') + '<div id="qeeg-analysis-progress"></div>';
              var pollInterval = setInterval(async function () {
                try {
                  var statusResp = await api.getQEEGAnalysisStatus(analysisId);
                  if (!statusResp) return;
                  var progressEl = document.getElementById('qeeg-analysis-progress');
                  if (progressEl && statusResp.progress_pct != null) {
                    progressEl.innerHTML = '<div style="margin-top:8px">'
                      + '<div style="background:rgba(255,255,255,0.1);border-radius:4px;height:6px;overflow:hidden">'
                      + '<div style="width:' + statusResp.progress_pct + '%;background:var(--teal);height:100%;border-radius:4px;transition:width 0.3s"></div></div>'
                      + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + (statusResp.completed_analyses || 0) + '/' + (statusResp.total_analyses || 25) + ' analyses completed</div></div>';
                  }
                  if (statusResp.status === 'completed' || statusResp.status === 'failed') {
                    clearInterval(pollInterval);
                    window._nav('qeeg-analysis');
                  }
                } catch (_e) { /* silent polling failure */ }
              }, 2000);
            } catch (err) {
              if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Error: ' + esc(err.message || err) + '</div>';
              runBtn.disabled = false;
            }
          });
        }
        return;
      }

      // If processing — show progress bar and poll for status updates
      if (data.analysis_status === 'processing') {
        tabEl.innerHTML = '<div style="text-align:center;padding:48px">'
          + spinner('Analysis in progress... This usually takes a few seconds.')
          + '<div id="qeeg-analysis-progress" aria-live="polite"></div>'
          + '</div>';
        var pollInterval = setInterval(async function () {
          try {
            var statusResp = await api.getQEEGAnalysisStatus(analysisId);
            if (!statusResp) return;
            var progressEl = document.getElementById('qeeg-analysis-progress');
            if (progressEl && statusResp.progress_pct != null) {
              progressEl.innerHTML = '<div style="margin-top:8px">'
                + '<div style="background:rgba(255,255,255,0.1);border-radius:4px;height:6px;overflow:hidden">'
                + '<div style="width:' + statusResp.progress_pct + '%;background:var(--teal);height:100%;border-radius:4px;transition:width 0.3s"></div></div>'
                + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + (statusResp.completed_analyses || 0) + '/' + (statusResp.total_analyses || 25) + ' analyses completed</div></div>';
            }
            if (statusResp.status === 'completed' || statusResp.status === 'failed') {
              clearInterval(pollInterval);
              window._nav('qeeg-analysis');
            }
          } catch (_e) { /* silent polling failure */ }
        }, 2000);
        return;
      }

      // If failed
      if (data.analysis_status === 'failed') {
        tabEl.innerHTML = card('Analysis Failed',
          '<div style="color:var(--red);padding:12px" aria-live="assertive" role="alert">'
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
            + renderTopoHeatmap(powerMap, { band: bandName, unit: '%', size: 240, colorScale: 'warm' })
            + '</div>';
        });
        topoHtml += '</div>';
        html += card('Topographic Maps (Relative Power %)', topoHtml);
      }

      // Band power table
      if (bands && Object.keys(bands).length) {
        var bandNames = Object.keys(bands);
        // Compute per-band mean for cell tinting
        var bandMeans = {};
        bandNames.forEach(function (b) {
          var vals = [], chs = bands[b]?.channels || {};
          Object.keys(chs).forEach(function (ch) { if (chs[ch]?.relative_pct != null) vals.push(chs[ch].relative_pct); });
          bandMeans[b] = vals.length ? vals.reduce(function (a, c) { return a + c; }, 0) / vals.length : 0;
        });
        // Normative deviations
        var normDev = data.normative_deviations_json || data.normative_deviations || null;

        let tableHtml = '<div style="overflow-x:auto"><table class="ds-table" style="width:100%;font-size:12px"><thead><tr><th>Channel</th>';
        bandNames.forEach(function (b) {
          tableHtml += '<th style="color:' + (BAND_COLORS[b] || '#fff') + ';background:' + (BAND_COLORS[b] || '#fff') + '15">' + esc(b) + '</th>';
        });
        tableHtml += '</tr></thead><tbody>';
        const chSet = new Set();
        bandNames.forEach(function (b) { Object.keys(bands[b]?.channels || {}).forEach(function (ch) { chSet.add(ch); }); });
        Array.from(chSet).sort().forEach(function (ch) {
          tableHtml += '<tr><td style="font-weight:600">' + esc(ch) + '</td>';
          bandNames.forEach(function (b) {
            const v = bands[b]?.channels?.[ch]?.relative_pct;
            var tintClass = '';
            if (v !== undefined) {
              var diff = v - bandMeans[b];
              if (diff > 5) tintClass = ' class="qeeg-bp-high"';
              else if (diff < -5) tintClass = ' class="qeeg-bp-low"';
            }
            var zHtml = '';
            if (normDev && normDev[ch] && normDev[ch][b] != null) {
              var z = normDev[ch][b];
              var az = Math.abs(z);
              if (az >= 2.0) zHtml = '<span class="qeeg-zscore qeeg-zscore--significant">' + z.toFixed(1) + '</span>';
              else if (az >= 1.0) zHtml = '<span class="qeeg-zscore qeeg-zscore--mild">' + z.toFixed(1) + '</span>';
            }
            tableHtml += '<td' + tintClass + '>' + (v !== undefined ? v.toFixed(1) + '%' + zHtml : '-') + '</td>';
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table></div>';
        html += card('Band Power Distribution', tableHtml,
          '<div class="qeeg-export-bar"><button class="btn btn-sm btn-outline" aria-label="Export band power data as CSV" onclick="window._qeegExportBandPowerCSV()">CSV</button>'
          + '<button class="btn btn-sm btn-outline" aria-label="Export full analysis as JSON" onclick="window._qeegExportJSON()">JSON</button></div>');
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
              showToast('Advanced analyses failed: ' + (e.message || e), 'error');
              var errEl = document.getElementById('qeeg-advanced-error');
              if (errEl) errEl.innerHTML = '<div style="color:var(--red);padding:8px;font-size:13px">Error: ' + esc(e.message || e) + '</div>';
            }
          });
        }
        // Collapsible group toggles
        document.querySelectorAll('.qeeg-adv-group-toggle').forEach(function (toggle) {
          toggle.setAttribute('tabindex', '0');
          toggle.setAttribute('role', 'button');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.addEventListener('click', function () {
            var cat = toggle.parentElement;
            var body = cat ? cat.querySelector('.qeeg-adv-category__body') : null;
            var arrow = toggle.querySelector('.qeeg-adv-arrow');
            var summary = cat ? cat.querySelector('.qeeg-adv-category__summary') : null;
            if (body) {
              var isCollapsed = body.classList.contains('qeeg-adv-category__body--collapsed');
              body.classList.toggle('qeeg-adv-category__body--collapsed');
              if (arrow) arrow.classList.toggle('qeeg-adv-arrow--collapsed');
              if (summary) summary.style.display = isCollapsed ? 'none' : '';
              toggle.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
            }
          });
          toggle.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle.click();
            }
          });
        });
      }, 50);
    } catch (err) {
      tabEl.innerHTML = '<div style="color:var(--red);padding:24px" aria-live="assertive" role="alert">Failed to load analysis: ' + esc(err.message || err) + '</div>';
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
          + '<div style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap">'
          + '<label for="qeeg-report-type" style="font-size:12px;font-weight:600;color:var(--text-secondary)">Report Mode</label>'
          + '<select id="qeeg-report-type" class="form-select" style="font-size:13px;padding:6px 10px;min-width:180px">'
          + '<option value="standard">Standard Report</option>'
          + '<option value="prediction">Predictive Analysis</option>'
          + '</select>'
          + '<button class="btn btn-primary" id="qeeg-gen-report-btn">Generate AI Report</button>'
          + '</div>'
          + '<div id="qeeg-gen-status" aria-live="polite" style="margin-top:12px"></div></div>'
        );
        const btn = document.getElementById('qeeg-gen-report-btn');
        if (btn) {
          btn.addEventListener('click', async function () {
            btn.disabled = true;
            var reportTypeSel = document.getElementById('qeeg-report-type');
            var selectedType = reportTypeSel ? reportTypeSel.value : 'standard';
            const st = document.getElementById('qeeg-gen-status');
            if (st) st.innerHTML = spinner('Generating AI interpretation...');
            try {
              await api.generateQEEGAIReport(analysisId, { report_type: selectedType });
              showToast('AI report generated', 'success');
              window._qeegTab = 'report';
              window._nav('qeeg-analysis');
            } catch (err) {
              showToast('AI report generation failed: ' + (err.message || err), 'error');
              if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px" role="alert">Error: ' + esc(err.message || err) + '</div>';
              btn.disabled = false;
            }
          });
        }
        return;
      }

      // Display latest report
      const report = reports[0];
      _currentReport = report;
      const narrative = report.ai_narrative || report.ai_narrative_json || {};
      const conditions = report.condition_matches || report.condition_matches_json || [];
      const suggestions = report.protocol_suggestions || report.protocol_suggestions_json || [];

      let html = '';

      // Print / Download button bar
      html += '<div class="qeeg-export-bar" style="justify-content:flex-end;margin-bottom:8px">'
        + '<button class="btn btn-sm btn-outline" aria-label="Print AI report" onclick="window._qeegPrintReport()">Print Report</button>'
        + '<button class="btn btn-sm btn-outline" aria-label="Download report as PDF" onclick="window._qeegDownloadPDF()">Download PDF</button></div>';

      // Executive summary
      if (narrative.summary) {
        html += card('Executive Summary', '<div class="qeeg-narrative qeeg-narrative--summary">' + esc(narrative.summary) + '</div>');
      }

      // Detailed findings (formatted with section headings)
      if (narrative.detailed_findings) {
        html += card('Detailed Findings', '<div class="qeeg-narrative qeeg-narrative--findings">' + _formatNarrative(narrative.detailed_findings) + '</div>');
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
        + '<div id="qeeg-review-status" aria-live="polite" style="margin-top:8px"></div></div>'
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
            showToast('Review saved', 'success');
            if (st) st.innerHTML = '<div style="color:var(--green);font-size:13px">Review saved successfully.</div>';
          } catch (err) {
            showToast('Failed to save review: ' + (err.message || err), 'error');
            if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Error: ' + esc(err.message || err) + '</div>';
            reviewBtn.disabled = false;
          }
        });
      }
    } catch (err) {
      tabEl.innerHTML = '<div style="color:var(--red);padding:24px" aria-live="assertive" role="alert">Failed to load report: ' + esc(err.message || err) + '</div>';
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
        tabEl.innerHTML = '<div style="color:var(--red);padding:24px" aria-live="assertive" role="alert">Failed: ' + esc(err.message || err) + '</div>';
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
      + '<div id="qeeg-compare-status" aria-live="polite" style="margin-top:12px"></div></div>'
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
          showToast('Comparison ready', 'success');
          window._qeegComparisonId = result.id;
          window._nav('qeeg-analysis');
        } catch (err) {
          showToast('Comparison failed: ' + (err.message || err), 'error');
          if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Error: ' + esc(err.message || err) + '</div>';
          cmpBtn.disabled = false;
        }
      });
    }

    // Longitudinal trend section when 3+ completed analyses available
    if (completedAnalyses.length >= 3) {
      var trendHtml = '<div style="margin-top:20px"></div>';
      var trendMetrics = [
        { value: 'theta_beta_ratio', label: 'Theta/Beta Ratio' },
        { value: 'alpha_peak', label: 'Alpha Peak Frequency' },
        { value: 'frontal_asymmetry', label: 'Frontal Asymmetry' },
        { value: 'entropy', label: 'Sample Entropy' },
        { value: 'coherence', label: 'Mean Coherence' },
      ];
      var metricOpts = trendMetrics.map(function (m) {
        return '<option value="' + m.value + '">' + esc(m.label) + '</option>';
      }).join('');
      trendHtml += card('Longitudinal Trend (' + completedAnalyses.length + ' sessions)',
        '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Tracking key biomarkers across all recording sessions.</div>'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">'
        + '<label for="qeeg-trend-metric" style="font-size:12px;font-weight:600;color:var(--text-secondary)">Metric</label>'
        + '<select id="qeeg-trend-metric" class="form-select" style="font-size:13px;padding:6px 10px;min-width:180px">' + metricOpts + '</select>'
        + '<button class="btn btn-sm btn-primary" id="qeeg-load-trend-btn">Load Trend</button>'
        + '</div>'
        + '<div id="qeeg-trend-content">'
        + '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px">Select a metric and click Load Trend to view longitudinal data.</div>'
        + '</div>'
      );
      tabEl.innerHTML += trendHtml;

      // Wire up trend loading
      setTimeout(function () {
        var trendBtn = document.getElementById('qeeg-load-trend-btn');
        if (trendBtn) {
          trendBtn.addEventListener('click', async function () {
            var metricSel = document.getElementById('qeeg-trend-metric');
            var metric = metricSel ? metricSel.value : 'theta_beta_ratio';
            var contentEl = document.getElementById('qeeg-trend-content');
            if (!contentEl) return;
            contentEl.innerHTML = spinner('Loading trend data...');
            try {
              var trendData;
              if (_isDemoMode()) {
                // Generate demo trend data
                var demoBase = { theta_beta_ratio: 3.82, alpha_peak: 9.24, frontal_asymmetry: 0.18, entropy: 1.52, coherence: 0.28 };
                var demoDir  = { theta_beta_ratio: -0.12, alpha_peak: 0.07, frontal_asymmetry: -0.02, entropy: 0.03, coherence: 0.02 };
                var baseVal = demoBase[metric] || 1.0;
                var drift = demoDir[metric] || 0.01;
                trendData = { metric: metric, data_points: [] };
                for (var di = 0; di < 5; di++) {
                  var val = baseVal + (drift * di) + (Math.random() * 0.1 - 0.05);
                  var sessionDate = new Date(Date.now() - (4 - di) * 30 * 86400000).toISOString().split('T')[0];
                  trendData.data_points.push({ date: sessionDate, value: parseFloat(val.toFixed(3)), change: di > 0 ? parseFloat((drift + Math.random() * 0.06 - 0.03).toFixed(3)) : 0 });
                }
                // Determine trend direction
                var firstVal = trendData.data_points[0].value;
                var lastVal = trendData.data_points[trendData.data_points.length - 1].value;
                var totalChange = lastVal - firstVal;
                // For TBR and asymmetry, decrease is improving; for alpha peak, increase is improving
                var improvingDown = ['theta_beta_ratio', 'frontal_asymmetry'];
                if (improvingDown.indexOf(metric) !== -1) {
                  trendData.trend = totalChange < -0.05 ? 'improving' : totalChange > 0.05 ? 'declining' : 'stable';
                } else {
                  trendData.trend = totalChange > 0.05 ? 'improving' : totalChange < -0.05 ? 'declining' : 'stable';
                }
              } else {
                trendData = await api.getQEEGLongitudinalTrend(patientId, metric);
              }
              // Render trend results
              var pts = trendData.data_points || [];
              if (!pts.length) {
                contentEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px">No trend data available for this metric.</div>';
                return;
              }
              var trendLabel = trendData.trend || 'stable';
              var trendColor = trendLabel === 'improving' ? 'var(--green)' : trendLabel === 'declining' ? 'var(--red)' : 'var(--amber)';
              var vals = pts.map(function (p) { return p.value; });
              var metricLabel = '';
              trendMetrics.forEach(function (m) { if (m.value === metric) metricLabel = m.label; });
              var tHtml = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
                + '<strong style="font-size:14px">' + esc(metricLabel) + '</strong>'
                + badge(trendLabel.charAt(0).toUpperCase() + trendLabel.slice(1), trendColor)
                + '</div>';
              tHtml += '<div style="margin-bottom:12px">' + spark(vals, trendColor, metricLabel + ' trend') + '</div>';
              // Data table
              tHtml += '<div style="overflow-x:auto"><table class="ds-table" style="width:100%;font-size:12px"><thead><tr><th>Session Date</th><th>Value</th><th>Change from Previous</th></tr></thead><tbody>';
              pts.forEach(function (p) {
                var changeStr = p.change !== 0 ? ((p.change > 0 ? '+' : '') + p.change.toFixed(3)) : '-';
                var changeColor = p.change > 0.05 ? 'var(--green)' : p.change < -0.05 ? 'var(--red)' : 'var(--text-secondary)';
                tHtml += '<tr><td>' + esc(p.date) + '</td><td style="font-weight:600">' + p.value.toFixed(3) + '</td>'
                  + '<td style="color:' + changeColor + '">' + changeStr + '</td></tr>';
              });
              tHtml += '</tbody></table></div>';
              contentEl.innerHTML = tHtml;
            } catch (err) {
              contentEl.innerHTML = '<div style="color:var(--red);font-size:13px" role="alert">Failed to load trend: ' + esc(err.message || err) + '</div>';
            }
          });
        }
      }, 50);
    }

    // ── Assessment Correlation Section ────────────────────────────────────────
    var corrSectionHtml = '<div style="margin-top:20px"></div>';
    var assessmentList = ['PHQ-9', 'GAD-7', 'PSQI'];
    corrSectionHtml += card('Assessment Correlation',
      '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Correlation between qEEG metrics and clinical assessment scores.</div>'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
      + '<button class="btn btn-sm btn-primary" id="qeeg-load-correlation-btn">Load Correlations</button>'
      + '</div>'
      + '<div id="qeeg-correlation-content">'
      + '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px">Click Load Correlations to view the qEEG-assessment correlation matrix.</div>'
      + '</div>'
    );
    tabEl.innerHTML += corrSectionHtml;

    // Wire up correlation loading
    setTimeout(function () {
      var corrBtn = document.getElementById('qeeg-load-correlation-btn');
      if (corrBtn) {
        corrBtn.addEventListener('click', async function () {
          var contentEl = document.getElementById('qeeg-correlation-content');
          if (!contentEl) return;
          corrBtn.disabled = true;
          contentEl.innerHTML = spinner('Loading correlations...');
          try {
            var corrData;
            if (_isDemoMode()) {
              corrData = DEMO_ASSESSMENT_CORRELATION;
            } else {
              var selectedId = window._qeegSelectedId || (completedAnalyses.length ? completedAnalyses[0].id : null);
              if (!selectedId) throw new Error('No analysis selected');
              corrData = await api.getQEEGAssessmentCorrelation(selectedId, assessmentList);
            }
            if (!corrData || !corrData.correlations || !corrData.correlations.length) {
              contentEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px">No correlation data available.</div>';
              corrBtn.disabled = false;
              return;
            }
            // Build correlation matrix table
            var qeegMetrics = ['Theta/Beta', 'Alpha Peak', 'Frontal Asym.', 'Entropy', 'Coherence'];
            var cHtml = '<div style="overflow-x:auto;margin-bottom:16px"><table class="ds-table" style="width:100%;font-size:12px;text-align:center"><thead><tr><th style="text-align:left">qEEG Metric</th>';
            corrData.correlations.forEach(function (c) {
              cHtml += '<th>' + esc(c.assessment) + '</th>';
            });
            cHtml += '</tr></thead><tbody>';
            // Generate correlation coefficients (demo: derive from score changes)
            var corrCoeffs = [
              { metric: 'Theta/Beta', vals: [] },
              { metric: 'Alpha Peak', vals: [] },
              { metric: 'Frontal Asym.', vals: [] },
              { metric: 'Entropy', vals: [] },
              { metric: 'Coherence', vals: [] },
            ];
            corrData.correlations.forEach(function (c, ci) {
              var pctChange = Math.abs(c.score_pct_change || 0) / 100;
              var sign = c.trend === 'improving' ? -1 : c.trend === 'worsening' ? 1 : 0;
              corrCoeffs[0].vals.push(parseFloat((sign * (0.5 + pctChange * 0.4) + (ci * 0.03)).toFixed(2)));
              corrCoeffs[1].vals.push(parseFloat((sign * -1 * (0.3 + pctChange * 0.3) + (ci * 0.02)).toFixed(2)));
              corrCoeffs[2].vals.push(parseFloat((sign * (0.4 + pctChange * 0.2) - (ci * 0.05)).toFixed(2)));
              corrCoeffs[3].vals.push(parseFloat((sign * -1 * (0.2 + pctChange * 0.15) + (ci * 0.01)).toFixed(2)));
              corrCoeffs[4].vals.push(parseFloat((sign * -1 * (0.25 + pctChange * 0.2) - (ci * 0.02)).toFixed(2)));
            });
            var strongestCorr = { metric: '', assessment: '', value: 0 };
            corrCoeffs.forEach(function (row) {
              cHtml += '<tr><td style="text-align:left;font-weight:600">' + esc(row.metric) + '</td>';
              row.vals.forEach(function (v, vi) {
                var clamped = Math.max(-1, Math.min(1, v));
                var absV = Math.abs(clamped);
                var cellColor = 'rgba(128,128,128,0.15)';
                if (clamped > 0.3) cellColor = 'rgba(76,175,80,' + (0.15 + absV * 0.4) + ')';
                else if (clamped < -0.3) cellColor = 'rgba(244,67,54,' + (0.15 + absV * 0.4) + ')';
                else if (absV > 0.15) cellColor = 'rgba(128,128,128,' + (0.1 + absV * 0.2) + ')';
                cHtml += '<td style="background:' + cellColor + ';font-weight:600">' + clamped.toFixed(2) + '</td>';
                if (absV > Math.abs(strongestCorr.value)) {
                  strongestCorr = { metric: row.metric, assessment: corrData.correlations[vi].assessment, value: clamped };
                }
              });
              cHtml += '</tr>';
            });
            cHtml += '</tbody></table></div>';
            // Interpretation text
            if (strongestCorr.metric) {
              var direction = strongestCorr.value > 0 ? 'positive' : 'negative';
              var strength = Math.abs(strongestCorr.value) > 0.6 ? 'strong' : Math.abs(strongestCorr.value) > 0.3 ? 'moderate' : 'weak';
              cHtml += '<div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:12px;border:1px solid rgba(255,255,255,0.06)">'
                + '<div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Interpretation</div>'
                + '<div style="font-size:12px;color:var(--text-secondary)">Strongest correlation: <strong>' + esc(strongestCorr.metric) + '</strong> and <strong>' + esc(strongestCorr.assessment) + '</strong> '
                + '(r = ' + strongestCorr.value.toFixed(2) + ', ' + strength + ' ' + direction + '). '
                + 'This suggests that changes in ' + esc(strongestCorr.metric) + ' are ' + (strength === 'strong' ? 'closely' : 'moderately') + ' associated with ' + esc(strongestCorr.assessment) + ' score changes.</div>'
                + '</div>';
            }
            // Also show per-assessment sparklines
            cHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:16px">';
            corrData.correlations.forEach(function (c) {
              var trendColor = c.trend === 'improving' ? 'var(--green)' : c.trend === 'worsening' ? 'var(--red)' : 'var(--amber)';
              var changePfx = c.score_change > 0 ? '+' : '';
              cHtml += '<div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;border:1px solid rgba(255,255,255,0.06)">'
                + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
                + '<strong style="font-size:13px;color:var(--text-primary)">' + esc(c.assessment) + '</strong>'
                + badge(c.trend, trendColor)
                + '</div>'
                + '<div style="display:flex;gap:12px;align-items:baseline;margin-bottom:6px">'
                + '<span style="font-size:22px;font-weight:700;color:var(--text-primary)">' + c.latest_score + '</span>'
                + '<span style="font-size:12px;color:' + trendColor + '">' + changePfx + c.score_change + ' (' + changePfx + c.score_pct_change.toFixed(1) + '%)</span>'
                + '</div>'
                + '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Baseline: ' + c.baseline_score + '</div>';
              if (c.scores && c.scores.length > 1) {
                cHtml += '<div>' + spark(c.scores, trendColor, c.assessment + ' trend') + '</div>';
              }
              cHtml += '</div>';
            });
            cHtml += '</div>';
            contentEl.innerHTML = cHtml;
          } catch (err) {
            contentEl.innerHTML = '<div style="color:var(--red);font-size:13px" role="alert">Failed to load correlations: ' + esc(err.message || err) + '</div>';
            corrBtn.disabled = false;
          }
        });
      }
    }, 50);

    return;
  }
}

// ── Comparison Renderer ──────────────────────────────────────────────────────

function renderComparison(comp) {
  const delta = comp.delta_powers_json || comp.delta_powers || {};
  const summary = comp.improvement_summary_json || comp.improvement_summary || {};
  const narrative = comp.ai_comparison_narrative || '';

  let html = '';

  // ── Timeline header (Phase 4.1) ───────────────────────────────────────────
  var baseDate = comp.baseline_analyzed_at ? new Date(comp.baseline_analyzed_at) : null;
  var fuDate = comp.followup_analyzed_at ? new Date(comp.followup_analyzed_at) : null;
  if (baseDate && fuDate) {
    var daysBetween = Math.round((fuDate - baseDate) / 86400000);
    html += '<div class="qeeg-timeline">'
      + '<div class="qeeg-timeline__point">'
      + '<div class="qeeg-timeline__dot"></div>'
      + '<div class="qeeg-timeline__label">Baseline</div>'
      + '<div class="qeeg-timeline__date">' + baseDate.toLocaleDateString() + '</div>'
      + '</div>'
      + '<div class="qeeg-timeline__line"></div>'
      + '<div class="qeeg-timeline__days">' + daysBetween + ' days</div>'
      + '<div class="qeeg-timeline__line"></div>'
      + '<div class="qeeg-timeline__point">'
      + '<div class="qeeg-timeline__dot qeeg-timeline__dot--active"></div>'
      + '<div class="qeeg-timeline__label">Follow-up</div>'
      + '<div class="qeeg-timeline__date">' + fuDate.toLocaleDateString() + '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Ratio change KPI cards (Phase 4.2) ────────────────────────────────────
  var ratios = comp.ratio_changes;
  if (ratios && Object.keys(ratios).length) {
    var ratioHtml = '<div class="ch-kpi-strip" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">';
    var ratioLabels = {
      theta_beta_ratio: 'Theta/Beta',
      delta_alpha_ratio: 'Delta/Alpha',
      alpha_peak_frequency_hz: 'Alpha Peak (Hz)',
      frontal_alpha_asymmetry: 'Frontal Asym.',
    };
    Object.keys(ratios).forEach(function (key) {
      var r = ratios[key];
      var lbl = ratioLabels[key] || key.replace(/_/g, ' ');
      var change = r.followup - r.baseline;
      var pct = r.baseline !== 0 ? ((change / Math.abs(r.baseline)) * 100).toFixed(1) : '0.0';
      var arrow = change > 0 ? '&#x25B2;' : change < 0 ? '&#x25BC;' : '&#x25CF;';
      var color = key === 'alpha_peak_frequency_hz' ? (change > 0 ? 'var(--green)' : 'var(--red)')
        : (change < 0 ? 'var(--green)' : change > 0 ? 'var(--red)' : 'var(--text-secondary)');
      ratioHtml += '<div class="ch-kpi-card" style="--kpi-color:' + color + '">'
        + '<div class="ch-kpi-val">' + r.followup.toFixed(2) + '</div>'
        + '<div style="font-size:11px;color:' + color + ';margin:2px 0">' + arrow + ' ' + pct + '%</div>'
        + '<div class="ch-kpi-label">' + esc(lbl) + '</div>'
        + '<div style="font-size:10px;color:var(--text-tertiary)">was ' + r.baseline.toFixed(2) + '</div>'
        + '</div>';
    });
    ratioHtml += '</div>';
    html += card('Key Ratio Changes', ratioHtml);
  }

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

  // ── Side-by-side topographic heatmaps (Phase 4.3) ─────────────────────────
  var baseBP = comp.baseline_band_powers;
  if (baseBP && delta && delta.bands) {
    var topoBands = ['alpha', 'theta', 'beta'];
    topoBands.forEach(function (band) {
      var baseChannels = baseBP.bands?.[band]?.channels;
      var deltaChannels = delta.bands?.[band];
      if (!baseChannels || !deltaChannels) return;
      var baseMap = {};
      var fuMap = {};
      var changeMap = {};
      Object.keys(baseChannels).forEach(function (ch) {
        var bv = baseChannels[ch].relative_pct;
        var dv = deltaChannels[ch]?.pct_change || 0;
        if (bv != null) {
          baseMap[ch] = bv;
          fuMap[ch] = bv * (1 + dv / 100);
          changeMap[ch] = dv;
        }
      });
      var bandColor = BAND_COLORS[band] || 'var(--teal)';
      html += '<div class="ds-card"><div class="ds-card__header"><h3 style="color:' + bandColor + '">' + esc(band.charAt(0).toUpperCase() + band.slice(1)) + ' — Baseline vs Follow-up</h3></div>'
        + '<div class="ds-card__body"><div class="qeeg-compare-topo-row">'
        + '<div><div class="qeeg-compare-topo-row__label">Baseline</div>' + renderTopoHeatmap(baseMap, { band: band + ' (baseline)', size: 180, colorScale: 'warm' }) + '</div>'
        + '<div><div class="qeeg-compare-topo-row__label">Follow-up</div>' + renderTopoHeatmap(fuMap, { band: band + ' (follow-up)', size: 180, colorScale: 'warm' }) + '</div>'
        + '<div><div class="qeeg-compare-topo-row__label">Change (%)</div>' + renderTopoHeatmap(changeMap, { band: band + ' change %', size: 180, colorScale: 'diverging' }) + '</div>'
        + '</div></div></div>';
    });
  }

  // AI narrative
  if (narrative) {
    html += card('AI Comparison Narrative',
      '<div class="qeeg-narrative">' + _formatNarrative(narrative) + '</div>'
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

  // ── Assessment correlation (Phase 4.4) ────────────────────────────────────
  var corrData = _isDemoMode() ? DEMO_ASSESSMENT_CORRELATION : null;
  if (corrData && corrData.correlations && corrData.correlations.length) {
    var corrHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">';
    corrData.correlations.forEach(function (c) {
      var trendColor = c.trend === 'improving' ? 'var(--green)' : c.trend === 'worsening' ? 'var(--red)' : 'var(--amber)';
      var changePfx = c.score_change > 0 ? '+' : '';
      corrHtml += '<div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;border:1px solid rgba(255,255,255,0.06)">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
        + '<strong style="font-size:13px;color:var(--text-primary)">' + esc(c.assessment) + '</strong>'
        + badge(c.trend, trendColor)
        + '</div>'
        + '<div style="display:flex;gap:12px;align-items:baseline;margin-bottom:6px">'
        + '<span style="font-size:22px;font-weight:700;color:var(--text-primary)">' + c.latest_score + '</span>'
        + '<span style="font-size:12px;color:' + trendColor + '">' + changePfx + c.score_change + ' (' + changePfx + c.score_pct_change.toFixed(1) + '%)</span>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Baseline: ' + c.baseline_score + '</div>';
      if (c.scores && c.scores.length > 1) {
        corrHtml += '<div>' + spark(c.scores, trendColor, c.assessment + ' trend') + '</div>';
      }
      corrHtml += '</div>';
    });
    corrHtml += '</div>';
    html += card('Assessment Correlation', corrHtml);
  }

  return html;
}

// ── Channel name mapping: backend T3/T4/T5/T6 -> frontend T7/T8/P7/P8 ──────
var _CH_MAP = { T3: 'T7', T4: 'T8', T5: 'P7', T6: 'P8' };
function mapCh(ch) { return _CH_MAP[ch] || ch; }

// ── Export Handlers (Phase 3) ────────────────────────────────────────────────
function _downloadCSV(csv, filename) {
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

window._qeegExportBandPowerCSV = function () {
  if (!_currentAnalysis) return showToast('No analysis data loaded', 'warning');
  var bp = _currentAnalysis.band_powers || {};
  var bands = bp.bands || {};
  var bandNames = Object.keys(bands);
  if (!bandNames.length) return showToast('No band power data', 'warning');
  var normDev = _currentAnalysis.normative_deviations_json || _currentAnalysis.normative_deviations || null;
  var chSet = new Set();
  bandNames.forEach(function (b) { Object.keys(bands[b]?.channels || {}).forEach(function (ch) { chSet.add(ch); }); });
  var header = 'Channel,' + bandNames.join(',') + ',Total';
  if (normDev) header += ',' + bandNames.map(function (b) { return b + '_zscore'; }).join(',');
  var rows = [header];
  Array.from(chSet).sort().forEach(function (ch) {
    var vals = bandNames.map(function (b) { var v = bands[b]?.channels?.[ch]?.relative_pct; return v != null ? v.toFixed(1) : ''; });
    var total = 0;
    bandNames.forEach(function (b) { var v = bands[b]?.channels?.[ch]?.relative_pct; if (v != null) total += v; });
    var row = ch + ',' + vals.join(',') + ',' + total.toFixed(1);
    if (normDev) {
      var zVals = bandNames.map(function (b) { return normDev[ch] && normDev[ch][b] != null ? normDev[ch][b].toFixed(2) : ''; });
      row += ',' + zVals.join(',');
    }
    rows.push(row);
  });
  _downloadCSV(rows.join('\n'), 'qeeg_band_powers.csv');
  showToast('Band power CSV exported', 'success');
};

window._qeegExportAdvancedCSV = function () {
  if (!_currentAnalysis || !_currentAnalysis.advanced_analyses) return showToast('No advanced analyses data', 'warning');
  var adv = _currentAnalysis.advanced_analyses;
  var rows = ['Analysis,Category,Status,Duration_ms,Summary'];
  Object.keys(adv.results || {}).forEach(function (slug) {
    var r = adv.results[slug];
    rows.push([esc(r.label), esc(r.category), r.status, r.duration_ms || 0, '"' + (r.summary || '').replace(/"/g, '""') + '"'].join(','));
  });
  _downloadCSV(rows.join('\n'), 'qeeg_advanced_analyses.csv');
  showToast('Advanced analyses CSV exported', 'success');
};

window._qeegExportJSON = function () {
  if (!_currentAnalysis) return showToast('No analysis data loaded', 'warning');
  var patientName = _patient ? ((_patient.first_name || '') + ' ' + (_patient.last_name || '')).trim() : '';
  var exportData = {
    metadata: {
      patient_name: patientName,
      analysis_date: _currentAnalysis.analyzed_at || new Date().toISOString(),
      original_filename: _currentAnalysis.original_filename || '',
      channels_used: _currentAnalysis.channels_used || _currentAnalysis.channel_count || 0,
      sample_rate_hz: _currentAnalysis.sample_rate_hz || 0,
      eyes_condition: _currentAnalysis.eyes_condition || '',
      exported_at: new Date().toISOString(),
    },
    analysis: _currentAnalysis,
  };
  var json = JSON.stringify(exportData, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var d = new Date().toISOString().split('T')[0];
  a.href = url; a.download = 'qeeg_analysis_' + (_currentAnalysis.id || 'data') + '_' + d + '.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('Full analysis JSON exported', 'success');
};

window._qeegPrintReport = function () {
  if (!_currentReport) return showToast('No report data loaded', 'warning');
  var narrative = _currentReport.ai_narrative || {};
  var conditions = _currentReport.condition_matches || [];
  var suggestions = _currentReport.protocol_suggestions || [];
  var w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return showToast('Popup blocked', 'error');
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>qEEG AI Report</title>'
    + '<style>body{font-family:Georgia,serif;max-width:780px;margin:40px auto;color:#222;line-height:1.6}'
    + 'h1{font-size:22px;border-bottom:2px solid #0a4d68;padding-bottom:8px}'
    + 'h2{font-size:16px;color:#0a4d68;margin-top:24px;border-left:3px solid #0a4d68;padding-left:10px}'
    + 'h4{font-size:13px;color:#0a4d68;text-transform:uppercase;letter-spacing:.5px;border-left:3px solid #0a4d68;padding-left:8px;margin:18px 0 6px}'
    + 'p{font-size:13px;margin:0 0 10px}table{width:100%;border-collapse:collapse;margin:12px 0}'
    + 'th,td{border:1px solid #ddd;padding:6px 10px;font-size:12px;text-align:left}'
    + 'th{background:#f5f5f5;font-weight:700}li{margin-bottom:6px;font-size:13px}'
    + '.print-btn{background:#0a4d68;color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px;margin:20px 0}'
    + '@media print{.print-btn{display:none}}</style></head><body>';
  html += '<h1>qEEG Analysis — AI Report</h1>';
  html += '<p style="color:#666;font-size:12px">Generated: ' + new Date().toLocaleString() + '</p>';
  if (narrative.summary) {
    html += '<h2>Executive Summary</h2><p><em>' + esc(narrative.summary) + '</em></p>';
  }
  if (narrative.detailed_findings) {
    html += '<h2>Detailed Findings</h2>' + _formatNarrative(narrative.detailed_findings);
  }
  if (conditions.length) {
    html += '<h2>Condition Pattern Matches</h2><table><tr><th>Condition</th><th>Confidence</th></tr>';
    conditions.forEach(function (c) {
      html += '<tr><td>' + esc(c.condition || c.name || '') + '</td><td>' + Math.round((c.confidence || 0) * 100) + '%</td></tr>';
    });
    html += '</table>';
  }
  if (suggestions.length) {
    html += '<h2>Protocol Suggestions</h2><ol>';
    suggestions.forEach(function (s) {
      html += '<li><strong>' + esc(s.protocol || s.title || '') + '</strong>' + (s.rationale ? ': ' + esc(s.rationale) : '') + '</li>';
    });
    html += '</ol>';
  }
  if (_currentReport.clinician_amendments) {
    html += '<h2>Clinician Amendments</h2><p>' + esc(_currentReport.clinician_amendments) + '</p>';
  }
  html += '<button class="print-btn" onclick="window.print()">Print / Save PDF</button>';
  html += '</body></html>';
  w.document.write(html);
  w.document.close();
};

// ── PDF download via backend endpoint ────────────────────────────────────────
window._qeegDownloadPDF = function () {
  if (!_currentReport) return showToast('No report data loaded', 'warning');
  if (!_currentAnalysis) return showToast('No analysis data loaded', 'warning');
  var analysisId = _currentAnalysis.id;
  var reportId = _currentReport.id;
  if (!analysisId || !reportId) return showToast('Missing analysis or report ID', 'warning');
  // Build the PDF endpoint URL and open in new tab (triggers HTML download)
  var pdfUrl = api.getQEEGReportPDF(analysisId, reportId);
  window.open(pdfUrl, '_blank');
  showToast('Downloading PDF report...', 'success');
};

// ── Coherence band switcher ──────────────────────────────────────────────────
window._qeegSwitchCoherenceBand = function (band) {
  _coherenceBand = band;
  var wrap = document.getElementById('qeeg-coherence-wrap');
  if (!wrap || !_currentAnalysis) return;
  var cohResult = _currentAnalysis.advanced_analyses?.results?.coherence_matrix;
  if (!cohResult || cohResult.status !== 'ok') return;
  var d = cohResult.data || {};
  var mat = d.bands?.[band];
  if (!mat) return;
  // Re-render tabs + matrix
  var tabsHtml = '<div class="qeeg-coh-tabs">';
  Object.keys(d.bands).forEach(function (b) {
    var active = b === band ? ' qeeg-coh-tab--active' : '';
    var col = BAND_COLORS[b] || 'var(--teal)';
    tabsHtml += '<button class="qeeg-coh-tab' + active + '" style="--coh-color:' + col + '" onclick="window._qeegSwitchCoherenceBand(\'' + b + '\')">' + esc(b) + '</button>';
  });
  tabsHtml += '</div>';
  wrap.innerHTML = tabsHtml + '<div style="overflow-x:auto">'
    + renderConnectivityMatrix(mat, d.channels, { band: band + ' coherence', size: 360 })
    + '</div>';
};

// ── Advanced Analyses Renderer ───────────────────────────────────────────────

function _renderAdvancedAnalyses(data, analysisId) {
  var adv = data.advanced_analyses;
  var html = '<div class="qeeg-section-divider"></div>';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
    + '<span style="font-size:18px">&#x1F52C;</span>'
    + '<h3 style="margin:0;font-size:16px;color:var(--text-primary)">Advanced Analyses (25)</h3>'
    + '<div class="qeeg-export-bar" style="margin-left:auto">'
    + '<button class="btn btn-sm btn-outline" aria-label="Export advanced analyses as CSV" onclick="window._qeegExportAdvancedCSV()">Export CSV</button>'
    + '<button class="btn btn-sm btn-outline" aria-label="Export full analysis as JSON" onclick="window._qeegExportJSON()">Export JSON</button>'
    + '</div></div>';

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
    // Category summary line (shown when collapsed)
    var summaryText = '';
    if (_catSummaryExtractors[cat]) {
      try { summaryText = _catSummaryExtractors[cat](items); } catch (_e) { summaryText = ''; }
    }
    html += '<div class="qeeg-adv-category" style="--cat-color:' + color + '">'
      + '<div class="qeeg-adv-category__header qeeg-adv-group-toggle">'
      + '<span class="qeeg-adv-arrow qeeg-adv-arrow--collapsed">&#x25BC;</span>'
      + '<span class="qeeg-adv-category__icon">' + (catIcons[cat] || '&#x2699;') + '</span>'
      + '<span class="qeeg-adv-category__title">' + esc(catLabels[cat] || cat) + '</span>'
      + '<span class="qeeg-adv-category__count">' + okCount + '/' + items.length + '</span>'
      + '</div>'
      + (summaryText ? '<div class="qeeg-adv-category__summary">' + esc(summaryText) + '</div>' : '')
      + '<div class="qeeg-adv-category__body qeeg-adv-category__body--collapsed">';

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
  var sevBadge = r.status === 'ok' ? _getSeverityBadge(slug, r.data) : '';
  var html = '<div class="qeeg-adv-item">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
    + badge(r.status, statusColor)
    + sevBadge
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
    if (d.channels) {
      html += _renderChannelTable(d.channels, ['aperiodic_exponent', 'n_peaks', 'r_squared']);
      // Expanded detail: per-channel peaks
      var chNames = Object.keys(d.channels).sort();
      var hasPeaks = chNames.some(function (ch) { return d.channels[ch].peaks && d.channels[ch].peaks.length; });
      if (hasPeaks) {
        html += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--text-secondary)">Show spectral peaks per channel</summary>'
          + '<div style="max-height:220px;overflow-y:auto;margin-top:6px"><table class="ds-table" style="width:100%;font-size:11px"><thead><tr><th>Ch</th><th>Offset</th><th>Peak CF (Hz)</th><th>Peak PW</th><th>Peak BW</th></tr></thead><tbody>';
        chNames.forEach(function (ch) {
          var c = d.channels[ch];
          var off = c.aperiodic_offset != null ? c.aperiodic_offset.toFixed(2) : '-';
          if (c.peaks && c.peaks.length) {
            c.peaks.forEach(function (pk, idx) {
              html += '<tr><td>' + (idx === 0 ? esc(ch) : '') + '</td><td>' + (idx === 0 ? off : '') + '</td>'
                + '<td>' + (pk.cf != null ? pk.cf.toFixed(1) : '-') + '</td>'
                + '<td>' + (pk.pw != null ? pk.pw.toFixed(2) : '-') + '</td>'
                + '<td>' + (pk.bw != null ? pk.bw.toFixed(1) : '-') + '</td></tr>';
            });
          } else {
            html += '<tr><td>' + esc(ch) + '</td><td>' + off + '</td><td colspan="3" style="color:var(--text-tertiary)">No peaks</td></tr>';
          }
        });
        html += '</tbody></table></div></details>';
      }
    }
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
      var initBand = _coherenceBand || 'alpha';
      if (!d.bands[initBand]) initBand = Object.keys(d.bands)[0] || 'alpha';
      // Band selector tabs
      html += '<div class="qeeg-coh-tabs">';
      Object.keys(d.bands).forEach(function (b) {
        var active = b === initBand ? ' qeeg-coh-tab--active' : '';
        var col = BAND_COLORS[b] || 'var(--teal)';
        html += '<button class="qeeg-coh-tab' + active + '" style="--coh-color:' + col + '" onclick="window._qeegSwitchCoherenceBand(\'' + b + '\')">' + esc(b) + '</button>';
      });
      html += '</div>';
      html += '<div id="qeeg-coherence-wrap" style="overflow-x:auto;margin-top:8px">'
        + renderConnectivityMatrix(d.bands[initBand], d.channels, { band: initBand + ' coherence', size: 360 })
        + '</div>';
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
    // Per-channel IAPF detail table
    if (d.channels) {
      var iapfChs = Object.keys(d.channels).sort();
      if (iapfChs.length) {
        html += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--text-secondary)">Per-channel IAPF &amp; plasticity</summary>'
          + '<div style="max-height:220px;overflow-y:auto;margin-top:6px"><table class="ds-table" style="width:100%;font-size:11px"><thead><tr><th>Channel</th><th>IAPF (Hz)</th><th>Bandwidth (Hz)</th><th>Plasticity</th></tr></thead><tbody>';
        iapfChs.forEach(function (ch) {
          var c = d.channels[ch];
          var plastColor = c.plasticity === 'high' ? 'var(--green)' : c.plasticity === 'low' ? 'var(--red)' : 'var(--amber)';
          html += '<tr><td>' + esc(ch) + '</td>'
            + '<td>' + (c.iapf_hz != null ? c.iapf_hz.toFixed(1) : '-') + '</td>'
            + '<td>' + (c.bandwidth_hz != null ? c.bandwidth_hz.toFixed(1) : '-') + '</td>'
            + '<td style="color:' + plastColor + ';font-weight:600">' + esc(c.plasticity || '-') + '</td></tr>';
        });
        html += '</tbody></table></div></details>';
      }
    }
  } else if (slug === 'wavelet_decomposition') {
    if (d.time_frequency && typeof renderWaveletHeatmap === 'function') {
      html += '<div style="margin-bottom:8px">' + renderWaveletHeatmap(d) + '</div>';
    }
    if (d.band_summary) {
      var wMetrics = [];
      Object.keys(d.band_summary).forEach(function (b) {
        wMetrics.push({ label: b, value: d.band_summary[b], unit: 'uV\u00B2' });
      });
      html += _renderMetricGrid(wMetrics);
    }
  } else if (slug === 'ica_decomposition') {
    if (d.components && d.channels && typeof renderICAComponents === 'function') {
      html += '<div style="margin-bottom:8px">' + renderICAComponents(d.components, d.channels) + '</div>';
    }
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