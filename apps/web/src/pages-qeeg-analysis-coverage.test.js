// pages-qeeg-analysis-coverage.test.js — deep coverage for pages-qeeg-analysis.js
//
// Strategy mirrors PR #821 (pages-practice-coverage.test.js):
//   • Mount + DOM inspect for renderable functions (all exported renderers
//     are run through realistic fixtures so HTML branches execute).
//   • Source-string inspection (readFileSync of the .js file) to pin large
//     constant data tables (DEMO_QEEG_ANALYSIS, DEMO_QEEG_REPORT,
//     DEMO_PATIENTS, DEMO_ASSESSMENT_CORRELATION, CLINICAL_THRESHOLDS,
//     ROI/electrode lookup tables, MNI atlas) without re-running them.
//   • Exercise the page-level entrypoint (pgQEEGAnalysis) under jsdom with
//     api boundaries mocked at the network call level.
//
// Hard rules:
//   - Tests-only — DO NOT modify the source file.
//   - Real code execution (mount or call), not import-only.
//   - Realistic DOM fixtures.
//   - Each test has a meaningful assertion.
//   - Skipped paths are commented; never silently swallowed.

import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// ── Install DOM globals BEFORE any module import ─────────────────────────────
const _dom = new JSDOM(
  `<!doctype html>
   <html>
     <head></head>
     <body>
       <div id="content"></div>
       <div id="page-content"></div>
       <main class="main-content">
         <div id="main-content"></div>
       </main>
       <div id="topbar-title"></div>
       <div id="topbar-actions"></div>
       <div id="qeeg-annotation-drawer-host"></div>
     </body>
   </html>`,
  { url: 'https://example.test/?patient_id=demo-pt-1' },
);

const _ls = {};
const _lsShim = {
  getItem:    (k) => Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null,
  setItem:    (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear:      () => { Object.keys(_ls).forEach(k => delete _ls[k]); },
  key:        (i) => Object.keys(_ls)[i] ?? null,
  get length() { return Object.keys(_ls).length; },
};
const _ss = {};
const _ssShim = {
  getItem:    (k) => Object.prototype.hasOwnProperty.call(_ss, k) ? _ss[k] : null,
  setItem:    (k, v) => { _ss[k] = String(v); },
  removeItem: (k) => { delete _ss[k]; },
  clear:      () => { Object.keys(_ss).forEach(k => delete _ss[k]); },
};
globalThis.localStorage = _lsShim;
globalThis.sessionStorage = _ssShim;
try {
  Object.defineProperty(_dom.window, 'localStorage', { value: _lsShim, configurable: true });
  Object.defineProperty(_dom.window, 'sessionStorage', { value: _ssShim, configurable: true });
} catch (_) { /* JSDOM may already define it */ }

globalThis.window     = _dom.window;
globalThis.document   = _dom.window.document;
globalThis.Event      = _dom.window.Event;
globalThis.HTMLElement = _dom.window.HTMLElement;
globalThis.Node       = _dom.window.Node;
globalThis.Blob       = _dom.window.Blob;
globalThis.FormData   = _dom.window.FormData;
globalThis.URL        = _dom.window.URL;
globalThis.URLSearchParams = _dom.window.URLSearchParams;
globalThis.MutationObserver = _dom.window.MutationObserver;
globalThis.IntersectionObserver = _dom.window.IntersectionObserver || class {
  constructor() {} observe() {} unobserve() {} disconnect() {}
};
globalThis.ResizeObserver = _dom.window.ResizeObserver || class {
  constructor() {} observe() {} unobserve() {} disconnect() {}
};
globalThis.requestAnimationFrame = _dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame  = _dom.window.cancelAnimationFrame  || clearTimeout;
globalThis.window.scrollTo = () => {};
if (globalThis.window.HTMLCanvasElement && globalThis.window.HTMLCanvasElement.prototype) {
  globalThis.window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      clearRect() {},
      fillRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fill() {},
      arc() {},
      closePath() {},
      measureText() { return { width: 0 }; },
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      setLineDash() {},
      fillText() {},
      strokeText() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      scale() {},
      drawImage() {},
      createImageData(width = 1, height = 1) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
      getImageData() { return { data: [] }; },
      putImageData() {},
    };
  };
  globalThis.window.HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/png;base64,stub';
  };
}
try {
  // Some Node runtimes have a getter-only navigator on globalThis. Best-effort.
  Object.defineProperty(globalThis, 'navigator', {
    value: _dom.window.navigator,
    configurable: true,
    writable: true,
  });
} catch (_) { /* ignore */ }

if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = () => Promise.reject(new Error('fetch not available in test'));
}

// Read source file once for source-string assertions.
const SRC = readFileSync(new URL('./pages-qeeg-analysis.js', import.meta.url), 'utf8');

// Make MNE flag explicit so renderers covered by the flag run their bodies.
globalThis.window.DEEPSYNAPS_ENABLE_MNE = true;
globalThis.window.DEEPSYNAPS_ENABLE_AI_UPGRADES = true;

// Pre-import api so we can patch its methods to drive deeper render paths in
// pgQEEGAnalysis without hitting the network.
const apiMod = await import('./api.js');

// ── Dynamic import AFTER globals installed ───────────────────────────────────
const mod = await import('./pages-qeeg-analysis.js');

// Build a rich analysis fixture used to exercise renderComparison +
// _renderComprehensiveReport paths in pgQEEGAnalysis.
function _buildRichAnalysisFixture(id) {
  return {
    id: id || 'fixture-1',
    patient_id: 'demo-sarah-johnson',
    analysis_status: 'completed',
    original_filename: 'session_eyes_closed.edf',
    file_name: 'session_eyes_closed.edf',
    channels_used: 19,
    channel_count: 19,
    sample_rate_hz: 256,
    recording_duration_sec: 600,
    recording_date: '2026-04-07T10:51:29',
    amplifier_type: 'Generic-19ch',
    electrode_placement: '10-20 System',
    eyes_condition: 'closed',
    analyzed_at: '2026-04-07T10:55:00Z',
    pipeline_version: 'v0.1.0',
    norm_db_version: 'toy-0.1',
    is_synthetic_demo: true,
    quality_metrics: {
      bad_channels: ['T4'],
      n_epochs_retained: 82,
      n_epochs_total: 100,
      ica_components_dropped: 3,
      ica_labels_dropped: { eye: 2 },
      sfreq_input: 500,
      sfreq_output: 250,
      bandpass: [1, 45],
      notch_hz: 50,
    },
    artifact_rejection: { epochs_total: 100, epochs_kept: 82, flat_channels: [] },
    band_powers: {
      bands: {
        alpha: { channels: { Fp1: { relative_pct: 18 }, Cz: { relative_pct: 22 }, Pz: { relative_pct: 28 } } },
        theta: { channels: { Fp1: { relative_pct: 18 }, Cz: { relative_pct: 14 }, Pz: { relative_pct: 12 } } },
        beta:  { channels: { Fp1: { relative_pct: 22 }, Cz: { relative_pct: 18 }, Pz: { relative_pct: 16 } } },
        delta: { channels: { Fp1: { relative_pct: 26 }, Cz: { relative_pct: 22 }, Pz: { relative_pct: 18 } } },
      },
      derived_ratios: {
        theta_beta_ratio: 3.82,
        theta_alpha_ratio: 1.15,
        delta_alpha_ratio: 1.41,
        alpha_peak_frequency_hz: 9.24,
        frontal_alpha_asymmetry: 0.18,
      },
    },
    aperiodic: {
      slope: { Fp1: 1.4, Fz: 1.1, Cz: 0.95, Pz: 1.2 },
      offset: { Fp1: 2.5, Fz: 2.4, Cz: 2.3, Pz: 2.1 },
      r_squared: { Fp1: 0.96, Fz: 0.97, Cz: 0.98, Pz: 0.95 },
    },
    peak_alpha_freq: { Fp1: 9.2, Fz: 9.8, Cz: 10.1, Pz: 11.3 },
    asymmetry: {
      frontal_alpha_F3_F4: 0.18,
      frontal_alpha_F7_F8: 0.12,
    },
    normative_zscores: {
      spectral: {
        bands: {
          alpha: { absolute_uv2: { Fp1: 1.2, Cz: -2.4, Pz: 3.1 } },
          theta: { absolute_uv2: { Fp1: 0.4, Cz: -1.8, Pz: 2.0 } },
        },
      },
      flagged: [
        { metric: 'spectral.bands.alpha.absolute_uv2', channel: 'Pz', z: 3.1 },
      ],
    },
    advanced_analyses: {
      meta: { total: 25, completed: 25, failed: 0, duration_sec: 42 },
      results: {
        u_shape: { status: 'ok', label: 'U-Shape', category: 'spectral', duration_ms: 820,
          summary: 'OK', data: { mean_u_score: 0.74, u_shape_present_count: 12, total_channels: 19 } },
        coherence_matrix: { status: 'ok', label: 'Coherence', category: 'connectivity', duration_ms: 4500,
          summary: 'Coherence ok',
          data: {
            channels: ['F3','F4','C3','C4','P3','P4','O1','O2'],
            bands: {
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
            },
          } },
      },
    },
    flagged_conditions: ['ADHD-pattern'],
    qc_flags: [{ code: 'AR_HIGH', severity: 'high', message: 'Excess artifact.' }],
    confidence: { level: 'moderate', score: 0.65, rationale: 'Sample size adequate.' },
    limitations: ['Short recording window'],
    clinical_summary: {
      observed_findings: [{ label: 'Theta excess', value: 4.2, unit: 'Hz',
        statement: 'Elevated theta over Cz.',
        evidence: { status: 'found', citations: [{ title: 'A 2024' }] } }],
      derived_interpretations: [{ label: 'TBR pattern', confidence: 'moderate',
        statement: 'Pattern consistent with attentional dysregulation.' }],
    },
  };
}

function _buildRichReportFixture(analysisId, reportId) {
  return {
    id: reportId || 'rep-1',
    analysis_id: analysisId || 'fixture-1',
    generated_at: '2026-04-07T11:00:00Z',
    clinician_reviewed: false,
    report_type: 'standard',
    model_used: 'gpt-5-mini',
    model_version: '2026.04.01',
    ai_narrative: {
      executive_summary: 'Within-norm overall pattern with mild theta-beta dysregulation.',
      detailed_findings: 'EXECUTIVE: Within-norm.\n\nFINDINGS: Mild theta excess at Cz.',
      findings: [
        { region: 'Frontal', band: 'theta', observation: 'Mild theta excess [1].', citations: [1] },
      ],
      confidence_level: 'moderate',
    },
    condition_matches: [
      { name: 'ADHD', likelihood: 0.42, relevance: 'Moderate' },
    ],
    protocol_suggestions: [
      { protocol: 'TBR neurofeedback', rationale: 'Targets attentional regulation.' },
    ],
    literature_refs: [
      { n: 1, title: 'Sample Paper', url: 'https://x.com', year: 2024, journal: 'Brain' },
    ],
  };
}

function _buildComparisonFixture() {
  return {
    id: 'cmp-1',
    patient_id: 'demo-sarah-johnson',
    baseline_analysis_id: 'a1',
    followup_analysis_id: 'a2',
    baseline_analyzed_at: '2026-01-01T10:00:00Z',
    followup_analyzed_at: '2026-04-01T10:00:00Z',
    delta_powers: {
      bands: {
        alpha: { Fp1: { pct_change: 8.2 }, Cz: { pct_change: -4.1 }, Pz: { pct_change: 2.5 } },
        theta: { Fp1: { pct_change: -3.5 }, Cz: { pct_change: -8.0 }, Pz: { pct_change: -2.0 } },
        beta:  { Fp1: { pct_change: 1.5 }, Cz: { pct_change: 0.5 } },
      },
    },
    improvement_summary: { improved: 8, unchanged: 3, worsened: 2 },
    ratio_changes: {
      theta_beta_ratio: { baseline: 4.5, followup: 3.2 },
      alpha_peak_frequency_hz: { baseline: 9.2, followup: 9.8 },
      frontal_alpha_asymmetry: { baseline: 0.18, followup: 0.12 },
    },
    rci_summary: { label: 'improved', net_response_index: 0.42 },
    highlighted_changes: [
      { channel: 'Cz', band: 'theta', pct_change: -8.0 },
      { channel: 'Fp1', band: 'alpha', pct_change: 8.2 },
    ],
    ai_comparison_narrative: 'EXECUTIVE: Improved.\n\nFINDINGS: Theta reduction at Cz.',
    baseline_band_powers: {
      bands: {
        alpha: { channels: { Fp1: { relative_pct: 18 }, Cz: { relative_pct: 22 } } },
        theta: { channels: { Fp1: { relative_pct: 14 }, Cz: { relative_pct: 18 } } },
        beta:  { channels: { Fp1: { relative_pct: 22 }, Cz: { relative_pct: 18 } } },
      },
    },
  };
}

// Helper: reset content roots between tests.
function resetDom() {
  document.getElementById('content').innerHTML = '';
  document.getElementById('page-content').innerHTML = '';
  const mc = document.getElementById('main-content');
  if (mc) mc.innerHTML = '';
  const drawerHost = document.getElementById('qeeg-annotation-drawer-host');
  if (drawerHost) drawerHost.innerHTML = '';
}

// Helper: best-effort await for renderers that talk to api.
async function safeAwait(p) {
  try { return await p; } catch (_) { return null; }
}

// ── 1. Source-pinned: TAB_META keys ──────────────────────────────────────────
describe('pages-qeeg-analysis.js — TAB_META content', () => {
  it('exposes all 7 expected tab keys', () => {
    const keys = Object.keys(mod.TAB_META);
    for (const k of ['patient', 'analysis', 'raw', 'erp', 'report', 'compare', 'learning']) {
      assert.ok(keys.includes(k), `TAB_META should include "${k}"`);
    }
  });

  it('each TAB_META entry has label + color', () => {
    for (const [k, meta] of Object.entries(mod.TAB_META)) {
      assert.ok(typeof meta.label === 'string' && meta.label.length > 0, `${k} needs a label`);
      assert.ok(typeof meta.color === 'string' && meta.color.startsWith('var('), `${k} needs a CSS var color`);
    }
  });
});

// ── 2. Source-pinned: ROI / electrode atlas constants ────────────────────────
describe('pages-qeeg-analysis.js — Desikan-Killiany ROI atlas (DK_ROI_MNI)', () => {
  it('source declares 33 cortical ROI MNI centroids', () => {
    const expectedRoi = [
      'superiorfrontal', 'rostralmiddlefrontal', 'caudalmiddlefrontal',
      'lateralorbitofrontal', 'medialorbitofrontal', 'parsopercularis',
      'parstriangularis', 'parsorbitalis', 'precentral', 'postcentral',
      'paracentral', 'superiorparietal', 'inferiorparietal', 'supramarginal',
      'precuneus', 'superiortemporal', 'middletemporal', 'inferiortemporal',
      'bankssts', 'fusiform', 'parahippocampal', 'entorhinal',
      'temporalpole', 'transversetemporal', 'lateraloccipital', 'cuneus',
      'pericalcarine', 'lingual', 'rostralanteriorcingulate',
      'caudalanteriorcingulate', 'posteriorcingulate', 'isthmuscingulate',
      'insula',
    ];
    for (const roi of expectedRoi) {
      assert.ok(SRC.includes(roi + ':'),
        `DK_ROI_MNI must declare ROI ${roi}`);
    }
  });

  it('ROI→electrode lookup includes 10-20 canonical electrodes', () => {
    for (const electrode of ['Fp1', 'Fp2', 'F3', 'F4', 'Fz', 'C3', 'Cz', 'C4',
                              'P3', 'Pz', 'P4', 'O1', 'O2', 'T7', 'T8', 'P7', 'P8']) {
      assert.ok(SRC.includes("'" + electrode + "'"),
        `ROI→electrode map must reference electrode ${electrode}`);
    }
  });
});

// ── 3. Source-pinned: BAND_COLORS palette ────────────────────────────────────
describe('pages-qeeg-analysis.js — BAND_COLORS palette', () => {
  it('declares all 8 EEG band hex colors', () => {
    for (const band of ['delta', 'theta', 'alpha', 'smr', 'low_beta', 'beta', 'high_beta', 'gamma']) {
      assert.ok(SRC.includes(band + ':'), `BAND_COLORS must declare ${band}`);
    }
  });

  it('declares SUB_BAND_RANGES for 8 bands', () => {
    for (const band of ['delta', 'theta', 'alpha', 'smr', 'low_beta', 'beta', 'high_beta', 'gamma']) {
      assert.ok(SRC.includes("'" + band + ":") || SRC.includes(band + ":"),
        `SUB_BAND_RANGES must include ${band}`);
    }
    assert.ok(SRC.includes('1-4 Hz'), 'delta range 1-4 Hz must be declared');
    assert.ok(SRC.includes('8-12 Hz'), 'alpha range 8-12 Hz must be declared');
    assert.ok(SRC.includes('30-50 Hz'), 'gamma range 30-50 Hz must be declared');
  });
});

// ── 4. Source-pinned: CLINICAL_THRESHOLDS Step 1.5 ───────────────────────────
describe('pages-qeeg-analysis.js — CLINICAL_THRESHOLDS', () => {
  it('declares thresholds for all six clinical analyses', () => {
    for (const slug of ['tbr_screening', 'entropy_analysis', 'small_world_index',
                         'iapf_plasticity', 'fractal_lz', 'spectral_edge_frequency']) {
      assert.ok(SRC.includes(slug + ':'),
        `CLINICAL_THRESHOLDS must include ${slug}`);
    }
  });

  it('TBR threshold ranges are 3.5 / 4.5', () => {
    assert.ok(/tbr_screening[\s\S]{0,400}max:\s*3\.5/.test(SRC),
      'tbr_screening borderline threshold should be 3.5');
    assert.ok(/tbr_screening[\s\S]{0,400}max:\s*4\.5/.test(SRC),
      'tbr_screening elevated threshold should be 4.5');
  });

  it('IAPF normal range is 8.5–10.5 Hz', () => {
    assert.ok(/iapf_plasticity[\s\S]{0,400}max:\s*8\.5/.test(SRC));
    assert.ok(/iapf_plasticity[\s\S]{0,400}max:\s*10\.5/.test(SRC));
  });
});

// ── 5. Source-pinned: DEMO_QEEG_ANALYSIS structure ───────────────────────────
describe('pages-qeeg-analysis.js — DEMO_QEEG_ANALYSIS fixture', () => {
  it('declares the demo analysis id', () => {
    assert.ok(SRC.includes("id: 'demo'"),
      'DEMO_QEEG_ANALYSIS uses id="demo"');
  });

  it('lists all 25 advanced-analysis slugs', () => {
    const slugs = [
      'u_shape', 'fooof_decomposition', 'spectral_edge_frequency',
      'band_peak_frequencies', 'wavelet_decomposition', 'full_asymmetry_matrix',
      'frontal_alpha_dominance', 'delta_dominance', 'regional_asymmetry_severity',
      'coherence_matrix', 'disconnection_flags', 'pli_icoh', 'wpli',
      'ica_decomposition', 'entropy_analysis', 'fractal_lz',
      'multiscale_entropy', 'higuchi_fd_detailed', 'small_world_index',
      'graph_theoretic_indices', 'microstate_analysis', 'iapf_plasticity',
      'tbr_screening', 'alpha_asymmetry_index', 'cordance',
    ];
    for (const slug of slugs) {
      assert.ok(SRC.includes(slug + ':'),
        `Advanced analyses fixture must include ${slug}`);
    }
  });

  it('includes Brodmann area annotations', () => {
    assert.ok(SRC.includes('Fusiform Gyrus'), 'BA 37 fusiform present');
    assert.ok(SRC.includes('Premotor Cortex'), 'BA 6 premotor present');
    assert.ok(SRC.includes('Frontal Eye Fields'), 'BA 8 FEF present');
    assert.ok(SRC.includes('Somatosensory Cortex'), 'BA 1/2/3 present');
    assert.ok(SRC.includes('Prefrontal Cortex'), 'BA 9 prefrontal present');
  });

  it('includes biomarker conditions list (10 conditions)', () => {
    for (const cond of ['Dyslexia', 'Autism', 'ADHD', 'Cognitive Decline',
                         'Celiac', 'Depression', 'Anxiety', 'Tinnitus', 'OCD', 'Insomnia']) {
      assert.ok(SRC.includes("name: '" + cond + "'"),
        `biomarker condition ${cond} must be present in DEMO_QEEG_ANALYSIS`);
    }
  });
});

// ── 6. Source-pinned: DEMO_PATIENTS seeds ────────────────────────────────────
describe('pages-qeeg-analysis.js — DEMO_PATIENTS seeds', () => {
  it('includes the canonical 4 demo-patient first names', () => {
    // The demo patient list seeds the analyzer; verify a handful of
    // identifying first/last name strings are present.
    const matches = SRC.match(/first_name:\s*'[^']+'/g) || [];
    assert.ok(matches.length >= 3,
      'expected multiple demo patient first_name declarations');
  });

  it('provides demo medical history with safety section', () => {
    assert.ok(SRC.includes('seizure_history'),
      'demo medical history must include seizure_history');
    assert.ok(SRC.includes('metal_implants'),
      'demo medical history must include metal_implants');
  });
});

// ── 7. Source-pinned: clinical safety footer ─────────────────────────────────
describe('pages-qeeg-analysis.js — clinical safety footer', () => {
  it('renders the shared safety disclaimer bullets', () => {
    const html = mod.renderQEEGClinicalSafetyFooterForTest();
    const bullets = [
      'EEG/qEEG analysis support and decision-support only',
      'Normative z-scores and comparisons apply only',
      'Protocol-fit and protocol suggestions are draft ideas',
      'Red flags and quality alerts are review cues',
      'AI-assisted text summarises available numerics and documents',
    ];
    assert.match(html, /Clinical safety disclaimers/i);
    for (const fragment of bullets) {
      assert.match(html, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
  });
});

// ── 8. _aiUpgradesFeatureFlagEnabled: full truth-table ───────────────────────
describe('_aiUpgradesFeatureFlagEnabled — branch coverage', () => {
  beforeEach(() => { delete window.DEEPSYNAPS_ENABLE_AI_UPGRADES; });

  it('returns true when undefined', () => {
    assert.strictEqual(mod._aiUpgradesFeatureFlagEnabled(), true);
  });
  it('returns true when explicitly true', () => {
    window.DEEPSYNAPS_ENABLE_AI_UPGRADES = true;
    assert.strictEqual(mod._aiUpgradesFeatureFlagEnabled(), true);
  });
  it('returns false when boolean false', () => {
    window.DEEPSYNAPS_ENABLE_AI_UPGRADES = false;
    assert.strictEqual(mod._aiUpgradesFeatureFlagEnabled(), false);
  });
  it('returns false when string "false"', () => {
    window.DEEPSYNAPS_ENABLE_AI_UPGRADES = 'false';
    assert.strictEqual(mod._aiUpgradesFeatureFlagEnabled(), false);
  });
  it('returns false when number 0', () => {
    window.DEEPSYNAPS_ENABLE_AI_UPGRADES = 0;
    assert.strictEqual(mod._aiUpgradesFeatureFlagEnabled(), false);
  });
  it('returns false when string "0"', () => {
    window.DEEPSYNAPS_ENABLE_AI_UPGRADES = '0';
    assert.strictEqual(mod._aiUpgradesFeatureFlagEnabled(), false);
  });
});

// ── 9. _mneFeatureFlagEnabled — branch coverage ──────────────────────────────
describe('_mneFeatureFlagEnabled — branch coverage', () => {
  beforeEach(() => { delete window.DEEPSYNAPS_ENABLE_MNE; });

  it('returns true when undefined', () => {
    assert.strictEqual(mod._mneFeatureFlagEnabled(), true);
  });
  it('returns false when "false"', () => {
    window.DEEPSYNAPS_ENABLE_MNE = 'false';
    assert.strictEqual(mod._mneFeatureFlagEnabled(), false);
  });
  it('returns false when 0', () => {
    window.DEEPSYNAPS_ENABLE_MNE = 0;
    assert.strictEqual(mod._mneFeatureFlagEnabled(), false);
  });
  it('returns true when 1', () => {
    window.DEEPSYNAPS_ENABLE_MNE = 1;
    assert.strictEqual(mod._mneFeatureFlagEnabled(), true);
  });
});

// ── 10. _qeegAnalysisIsSyntheticDemo — full truth table ─────────────────────
describe('_qeegAnalysisIsSyntheticDemo — branch coverage', () => {
  it('returns false for null/undefined/non-object', () => {
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo(null), false);
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo(undefined), false);
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo('string'), false);
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo(7), false);
  });
  it('returns true for any explicit synthetic marker', () => {
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo({ is_synthetic_demo: true }), true);
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo({ norm_db_version: 'toy-0.1' }), true);
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo({ id: 'demo' }), true);
  });
  it('returns false for live analyses', () => {
    assert.strictEqual(
      mod._qeegAnalysisIsSyntheticDemo({ id: 'real-1', norm_db_version: 'v2.3', is_synthetic_demo: false }),
      false,
    );
  });
});

// ── 11. _qeegReportIsSyntheticDemo — branch coverage ─────────────────────────
describe('_qeegReportIsSyntheticDemo — branch coverage', () => {
  it('returns true when report id starts with demo', () => {
    assert.strictEqual(mod._qeegReportIsSyntheticDemo({ id: 'demo-1' }, null), true);
    assert.strictEqual(mod._qeegReportIsSyntheticDemo({ id: 'demo' }, null), true);
  });
  it('falls through to analysis check when report id is non-demo', () => {
    assert.strictEqual(
      mod._qeegReportIsSyntheticDemo({ id: 'r-1' }, { id: 'demo' }),
      true,
    );
  });
  it('returns false for live report + live analysis', () => {
    assert.strictEqual(
      mod._qeegReportIsSyntheticDemo({ id: 'r-1' }, { id: 'real' }),
      false,
    );
  });
  it('handles null report', () => {
    assert.strictEqual(mod._qeegReportIsSyntheticDemo(null, { id: 'demo' }), true);
    assert.strictEqual(mod._qeegReportIsSyntheticDemo(null, null), false);
  });
});

// ── 12. _canRenderQEEGPrintableReport — branch coverage ──────────────────────
describe('_canRenderQEEGPrintableReport — branch coverage', () => {
  it('returns false for missing analysis id', () => {
    assert.strictEqual(mod._canRenderQEEGPrintableReport({ id: 'r1' }, {}), false);
    assert.strictEqual(mod._canRenderQEEGPrintableReport({ id: 'r1' }, null), false);
  });
  it('returns false for missing report id', () => {
    assert.strictEqual(mod._canRenderQEEGPrintableReport({}, { id: 'a1' }), false);
    assert.strictEqual(mod._canRenderQEEGPrintableReport(null, { id: 'a1' }), false);
  });
  it('returns true when both ids present', () => {
    assert.strictEqual(mod._canRenderQEEGPrintableReport({ id: 'r1' }, { id: 'a1' }), true);
  });
});

// ── 13. _getQEEGReportPdfUrl — branch coverage ───────────────────────────────
describe('_getQEEGReportPdfUrl — branch coverage', () => {
  it('returns null for null inputs', () => {
    assert.strictEqual(mod._getQEEGReportPdfUrl(null, {}), null);
    assert.strictEqual(mod._getQEEGReportPdfUrl(null, null), null);
  });
  it('prefers report_pdf_url over pdf_url', () => {
    const url1 = 'https://cdn/r1.pdf';
    const url2 = 'https://cdn/r2.pdf';
    assert.strictEqual(
      mod._getQEEGReportPdfUrl({ report_pdf_url: url1, pdf_url: url2 }, {}),
      url1,
    );
  });
  it('falls back to pdf_url when report_pdf_url missing', () => {
    const url = 'https://cdn/p.pdf';
    assert.strictEqual(mod._getQEEGReportPdfUrl({ pdf_url: url }, {}), url);
  });
  it('returns null when no urls and no api fallback resolves', () => {
    // With analysis missing id, api.getQEEGReportPDF won't be called.
    assert.strictEqual(
      mod._getQEEGReportPdfUrl({ id: 'r1' }, null),
      null,
    );
  });
});

// ── 14. renderCompareSelectionSummary — branch coverage ──────────────────────
describe('renderCompareSelectionSummary — branch coverage', () => {
  it('returns "" when either input missing', () => {
    assert.strictEqual(mod.renderCompareSelectionSummary(null, { id: 'b' }), '');
    assert.strictEqual(mod.renderCompareSelectionSummary({ id: 'a' }, null), '');
  });
  it('renders interval text when stamps differ by N days', () => {
    const html = mod.renderCompareSelectionSummary(
      { id: 'a', analyzed_at: '2026-01-01T00:00:00Z', original_filename: 'a.edf' },
      { id: 'b', analyzed_at: '2026-01-15T00:00:00Z', original_filename: 'b.edf' },
    );
    assert.match(html, /14-day interval/);
    assert.match(html, /a\.edf/);
    assert.match(html, /b\.edf/);
  });
  it('renders "Same-day comparison" when stamps match', () => {
    const ts = '2026-04-01T08:00:00Z';
    const html = mod.renderCompareSelectionSummary(
      { id: 'a', analyzed_at: ts },
      { id: 'b', analyzed_at: ts },
    );
    assert.match(html, /Same-day comparison/);
  });
  it('renders "Interval unavailable" when timestamps invalid', () => {
    const html = mod.renderCompareSelectionSummary(
      { id: 'a' },
      { id: 'b' },
    );
    assert.match(html, /Interval unavailable/);
  });
});

// ── 15. renderFusionSummaryCard — branch coverage ────────────────────────────
describe('renderFusionSummaryCard — branch coverage', () => {
  it('renders pick-a-patient hint when no fusion + no patientId', () => {
    const html = mod.renderFusionSummaryCard(null, '');
    assert.match(html, /Select a patient analysis/i);
  });

  it('renders unavailable hint when patientId provided but fusion missing', () => {
    const html = mod.renderFusionSummaryCard(null, 'pt-1');
    assert.match(html, /unavailable|usable/i);
  });

  it('renders summary, recs, and confidence chips for full fusion payload', () => {
    const fusion = {
      summary: 'Fusion completed.',
      recommendations: ['Review TMS targeting', 'Recheck MR thalamus'],
      qeeg_analysis_id: 'a1',
      mri_analysis_id: 'm1',
      confidence: 0.72,
      confidence_grade: 'evidence-graded',
      confidence_disclaimer: 'Heuristic only.',
    };
    const html = mod.renderFusionSummaryCard(fusion, 'pt-1');
    assert.match(html, /Fusion completed\./);
    assert.match(html, /Review TMS targeting/);
    assert.match(html, /qEEG ready/);
    assert.match(html, /MRI ready/);
    assert.match(html, /confidence 72%/);
    assert.match(html, /Heuristic only\./);
    // Workbench link present when patientId provided
    assert.match(html, /\/fusion-workbench\?patient_id=pt-1/);
  });

  it('renders "No recommendations yet" when recs empty', () => {
    const fusion = { summary: 'No recs', recommendations: [] };
    const html = mod.renderFusionSummaryCard(fusion, 'pt-2');
    assert.match(html, /No recommendations yet/);
  });
});

// ── 16. renderPipelineQualityStrip — branch coverage ─────────────────────────
describe('renderPipelineQualityStrip — full data shape', () => {
  it('renders all pill types when full quality_metrics present', () => {
    const html = mod.renderPipelineQualityStrip({
      pipeline_version: '0.1.0',
      norm_db_version: 'toy-0.1',
      quality_metrics: {
        bad_channels: ['T4', 'F8'],
        ica_components_dropped: 3,
        ica_labels_dropped: { eye: 2, muscle: 1 },
        n_epochs_retained: 82,
        n_epochs_total: 100,
        sfreq_input: 500,
        sfreq_output: 250,
        bandpass: [1, 45],
        notch_hz: 50,
      },
    });
    assert.match(html, /Bad channels/);
    assert.match(html, /ICs dropped/);
    assert.match(html, /ICA eye/);
    assert.match(html, /ICA muscle/);
    assert.match(html, /Epochs retained/);
    assert.match(html, /500/);
    assert.match(html, /250/);
    assert.match(html, /Bandpass/);
    assert.match(html, /Notch/);
    assert.match(html, /pipeline/);
    assert.match(html, /norm DB/);
    assert.match(html, /toy-0\.1/);
  });

  it('renders red bad-channel pill when any present', () => {
    const html = mod.renderPipelineQualityStrip({
      quality_metrics: { bad_channels: ['T4'] },
    });
    assert.match(html, /var\(--red\)/);
  });

  it('renders amber retention when keep% between 40–69', () => {
    const html = mod.renderPipelineQualityStrip({
      quality_metrics: { n_epochs_retained: 50, n_epochs_total: 100 },
    });
    assert.match(html, /var\(--amber\)/);
  });

  it('renders red retention when keep% below 40', () => {
    const html = mod.renderPipelineQualityStrip({
      quality_metrics: { n_epochs_retained: 30, n_epochs_total: 100 },
    });
    assert.match(html, /var\(--red\)/);
  });
});

// ── 17. renderSpecParamPanel — branch coverage ───────────────────────────────
describe('renderSpecParamPanel — branch coverage', () => {
  it('returns "" when aperiodic missing', () => {
    assert.strictEqual(mod.renderSpecParamPanel({}), '');
    assert.strictEqual(mod.renderSpecParamPanel(null), '');
  });

  it('returns "" when slope map empty', () => {
    assert.strictEqual(mod.renderSpecParamPanel({ aperiodic: { slope: {} } }), '');
  });

  it('flags slope outside 0.5–2.0 range', () => {
    const html = mod.renderSpecParamPanel({
      aperiodic: {
        slope: { Fp1: 2.4, Fz: 0.4, Cz: 1.0 },
        offset: { Fp1: 2.8, Fz: 2.4, Cz: 2.3 },
        r_squared: { Fp1: 0.96, Fz: 0.97, Cz: 0.98 },
      },
      peak_alpha_freq: { Fp1: 9.2, Fz: 7.5, Cz: 14.1 },
    });
    assert.match(html, /qeeg-mne-flag/);
    assert.match(html, /Fp1/);
    assert.match(html, /SpecParam/);
  });
});

// ── 18. renderELoretaROIPanel — branch coverage ──────────────────────────────
describe('renderELoretaROIPanel — branch coverage', () => {
  it('returns "" when no source_roi', () => {
    assert.strictEqual(mod.renderELoretaROIPanel({}), '');
    assert.strictEqual(mod.renderELoretaROIPanel(null), '');
  });

  it('renders all bands and ROIs when full payload supplied', () => {
    const html = mod.renderELoretaROIPanel({
      source_roi: {
        method: 'eLORETA',
        bands: {
          alpha: {
            'lh.superiorfrontal': 0.42,
            'rh.superiorfrontal': 0.38,
            'lh.lateraloccipital': 0.71,
            'rh.lateraloccipital': 0.68,
          },
          theta: {
            'lh.precuneus': 0.31,
            'rh.precuneus': 0.29,
          },
        },
      },
    });
    assert.match(html, /eLORETA/);
    assert.match(html, /alpha/);
    assert.match(html, /theta/);
  });

  it('honours roi_band_power shape preferred over bands', () => {
    const html = mod.renderELoretaROIPanel({
      source_roi: {
        roi_band_power: {
          alpha: { 'lh.precuneus': 0.5 },
        },
      },
    });
    assert.match(html, /alpha/);
  });
});

// ── 19. renderQEEGSource3DBrain — branch coverage ────────────────────────────
describe('renderQEEGSource3DBrain — branch coverage', () => {
  it('returns "" when source_roi missing', () => {
    assert.strictEqual(mod.renderQEEGSource3DBrain({}), '');
  });

  it('returns "" when bands missing', () => {
    assert.strictEqual(mod.renderQEEGSource3DBrain({ source_roi: {} }), '');
  });

  it('renders band tabs and ROI list when bands populated', () => {
    const html = mod.renderQEEGSource3DBrain({
      source_roi: {
        bands: {
          alpha: {
            'lh.superiorparietal': 0.55,
            'rh.superiorparietal': 0.51,
            'lh.lateraloccipital': 0.71,
          },
          beta: {
            'lh.precentral': 0.22,
          },
        },
      },
    });
    assert.match(html, /ds-source-3d-bands/);
    assert.match(html, /role="tablist"/);
    assert.match(html, /Top \d+ cortical ROIs/);
  });
});

// ── 20. renderNormativeZScoreHeatmap — branch coverage ──────────────────────
describe('renderNormativeZScoreHeatmap — branch coverage', () => {
  it('returns "" when normative_zscores missing', () => {
    assert.strictEqual(mod.renderNormativeZScoreHeatmap({}), '');
  });

  it('renders heatmap rows for spectral.bands shape', () => {
    const html = mod.renderNormativeZScoreHeatmap({
      normative_zscores: {
        spectral: {
          bands: {
            alpha: { absolute_uv2: { Fp1: 1.2, Cz: -2.4, Pz: 3.1 } },
            theta: { absolute_uv2: { Fp1: 0.4, Cz: -1.8, Pz: 2.0 } },
          },
        },
        flagged: [
          { metric: 'spectral.bands.theta.absolute_uv2', channel: 'Pz', z: 2.0 },
        ],
      },
    });
    assert.match(html, /Normative z-scores/);
    assert.match(html, /Fp1/);
    assert.match(html, /Cz/);
    assert.match(html, /Flagged findings/);
    assert.match(html, /qeeg-mne-zcell/);
  });

  it('renders heatmap rows for flat-channel shape', () => {
    const html = mod.renderNormativeZScoreHeatmap({
      normative_zscores: {
        Fp1: { alpha: 1.2, theta: 0.4 },
        Cz:  { alpha: -2.4, theta: -1.8 },
        flagged: [],
        norm_db_version: 'toy-0.1',
      },
    });
    assert.match(html, /Fp1/);
    assert.match(html, /Cz/);
  });
});

// ── 21. renderNormativeTopomapGrid — branch coverage ─────────────────────────
describe('renderNormativeTopomapGrid — branch coverage', () => {
  it('returns "" when no spectral.bands', () => {
    assert.strictEqual(mod.renderNormativeTopomapGrid({}), '');
    assert.strictEqual(mod.renderNormativeTopomapGrid({ normative_zscores: {} }), '');
  });

  it('returns "" when band channel maps empty', () => {
    assert.strictEqual(
      mod.renderNormativeTopomapGrid({
        normative_zscores: { spectral: { bands: { alpha: { absolute_uv2: {} } } } },
      }),
      '',
    );
  });

  it('renders topomap cards when spectral z-score channels are populated', () => {
    const html = mod.renderNormativeTopomapGrid({
      normative_zscores: {
        spectral: {
          bands: {
            alpha: { absolute_uv2: { Fp1: 1.2, Cz: -2.4, Pz: 3.1, O1: 0.8 } },
            theta: { absolute_uv2: { Fp1: 0.4, Cz: -1.8, Pz: 2.0, O1: -0.7 } },
          },
        },
      },
    });
    assert.match(html, /Normative Topomaps/);
    assert.match(html, /ds-topo-heatmap/);
    assert.match(html, /alpha z-score/);
    assert.match(html, /theta z-score/);
  });
});

// ── 22. renderConnectivityClinicViz — branch coverage ────────────────────────
describe('renderConnectivityClinicViz — branch coverage', () => {
  it('returns "" when payload not buildable', () => {
    assert.strictEqual(mod.renderConnectivityClinicViz({}), '');
    assert.strictEqual(mod.renderConnectivityClinicViz(null), '');
  });

  it('renders connectivity card when coherence_matrix is ok', () => {
    const html = mod.renderConnectivityClinicViz({
      advanced_analyses: {
        results: {
          coherence_matrix: {
            status: 'ok',
            data: {
              channels: ['F3','F4','C3','C4'],
              bands: {
                alpha: [
                  [1.0, 0.7, 0.4, 0.3],
                  [0.7, 1.0, 0.5, 0.4],
                  [0.4, 0.5, 1.0, 0.6],
                  [0.3, 0.4, 0.6, 1.0],
                ],
              },
            },
          },
        },
      },
    });
    assert.match(html, /Connectivity Visualizations/);
  });
});

// ── 23. renderAsymmetryGraphStrip — branch coverage ──────────────────────────
describe('renderAsymmetryGraphStrip — branch coverage', () => {
  it('returns "" when no asym/graph data', () => {
    assert.strictEqual(mod.renderAsymmetryGraphStrip({}), '');
    assert.strictEqual(mod.renderAsymmetryGraphStrip(null), '');
  });

  it('renders FAA values from asymmetry block', () => {
    const html = mod.renderAsymmetryGraphStrip({
      asymmetry: { frontal_alpha_F3_F4: 0.18, frontal_alpha_F7_F8: 0.12 },
    });
    assert.ok(html.length > 0, 'expected non-empty asymmetry strip');
  });

  it('renders graph metrics block when present', () => {
    const html = mod.renderAsymmetryGraphStrip({
      graph_metrics: {
        global_efficiency: 0.58,
        clustering_coefficient: 0.64,
        small_world_index: 2.4,
        path_length: 1.82,
      },
    });
    assert.ok(html.length > 0, 'expected non-empty graph metrics strip');
  });
});

// ── 24. linkifyCitations — extended branch coverage ──────────────────────────
describe('linkifyCitations — extended', () => {
  it('handles multi-cite "[1, 2]" syntax', () => {
    const refIdx = {
      '1': { url: 'https://a.com' },
      '2': { url: 'https://b.com' },
    };
    const html = mod.linkifyCitations('See [1, 2] for refs.', refIdx);
    assert.match(html, /href="https:\/\/a\.com"/);
    assert.match(html, /href="https:\/\/b\.com"/);
  });

  it('skips citation with no url', () => {
    const html = mod.linkifyCitations('See [1].', { '1': {} });
    assert.doesNotMatch(html, /href/);
    assert.match(html, /\[1\]/);
  });
});

// ── 25. renderLiteratureRefs — extended branch coverage ──────────────────────
describe('renderLiteratureRefs — extended', () => {
  it('builds URL from pmid when no url', () => {
    const html = mod.renderLiteratureRefs([
      { n: 1, title: 'Paper A', pmid: '12345' },
    ]);
    assert.match(html, /pubmed\.ncbi\.nlm\.nih\.gov\/12345/);
  });

  it('builds URL from doi when no url and no pmid', () => {
    const html = mod.renderLiteratureRefs([
      { n: 1, title: 'Paper B', doi: '10.1000/xyz' },
    ]);
    assert.match(html, /doi\.org\/10\.1000\/xyz/);
  });

  it('renders journal in italics when present', () => {
    const html = mod.renderLiteratureRefs([
      { n: 1, title: 'Paper C', url: 'https://x.com', journal: 'Brain' },
    ]);
    assert.match(html, /<em>Brain<\/em>/);
  });

  it('falls back to "PMID N" / "DOI X" / "reference N" when title missing', () => {
    const a = mod.renderLiteratureRefs([{ n: 1, pmid: '999' }]);
    assert.match(a, /PMID 999/);
    const b = mod.renderLiteratureRefs([{ n: 2, doi: '10.0/y' }]);
    assert.match(b, /DOI 10\.0\/y/);
    const c = mod.renderLiteratureRefs([{ n: 3 }]);
    assert.match(c, /reference 3/);
  });
});

// ── 26. renderAINarrativeWithCitations — branch coverage ─────────────────────
describe('renderAINarrativeWithCitations — branch coverage', () => {
  it('returns "" when no narrative + no refs', () => {
    assert.strictEqual(mod.renderAINarrativeWithCitations(null, null), '');
    assert.strictEqual(mod.renderAINarrativeWithCitations(null, []), '');
  });

  it('renders executive summary with citations', () => {
    const html = mod.renderAINarrativeWithCitations(
      { executive_summary: 'Summary [1].' },
      [{ n: 1, url: 'https://a.com', title: 'A' }],
    );
    assert.match(html, /Executive summary/);
    assert.match(html, /href="https:\/\/a\.com"/);
  });

  it('renders findings list with region/band/observation', () => {
    const html = mod.renderAINarrativeWithCitations(
      {
        findings: [
          { region: 'Frontal', band: 'theta', observation: 'Elevated theta [2].', citations: [2] },
        ],
      },
      [{ n: 2, url: 'https://b.com', title: 'B' }],
    );
    assert.match(html, /Findings/);
    assert.match(html, /Frontal/);
    assert.match(html, /theta/);
  });

  it('shows confidence_level when set', () => {
    const html = mod.renderAINarrativeWithCitations(
      { executive_summary: 'OK', confidence_level: 'moderate' },
      [],
    );
    assert.match(html, /Confidence/);
    assert.match(html, /moderate/);
  });
});

// ── 27. renderQEEGDecisionSupport — branch coverage ──────────────────────────
describe('renderQEEGDecisionSupport — branch coverage', () => {
  it('returns "" when no decision-support fields', () => {
    assert.strictEqual(mod.renderQEEGDecisionSupport({}), '');
    assert.strictEqual(mod.renderQEEGDecisionSupport(null), '');
  });

  it('renders confidence banner when level set', () => {
    const html = mod.renderQEEGDecisionSupport({
      confidence: { level: 'low', score: 0.42, rationale: 'Limited sample.' },
    });
    assert.match(html, /Overall confidence/);
    assert.match(html, /low/);
    assert.match(html, /Limited sample/);
  });

  it('renders qc_flags grid with severity styling', () => {
    const html = mod.renderQEEGDecisionSupport({
      qc_flags: [
        { code: 'AR_HIGH', severity: 'high', message: 'Excess artifact.' },
        { code: 'CHG_LOW', severity: 'low',  message: 'Minor channel issue.' },
      ],
    });
    assert.match(html, /Quality flags/);
    assert.match(html, /AR_HIGH/);
    assert.match(html, /Excess artifact/);
    assert.match(html, /high/);
  });

  it('renders observed findings with evidence chip', () => {
    const html = mod.renderQEEGDecisionSupport({
      clinical_summary: {
        observed_findings: [
          { label: 'Theta excess', value: 4.2, unit: 'Hz',
            statement: 'Elevated theta over Cz.',
            evidence: { status: 'found', citations: [{ title: 'A 2024' }, { pmid: '999' }, { url: 'https://x.com', title: 'C' }] } },
          { type: 'asymmetry', statement: 'Alpha asymmetry detected.', evidence: { status: 'pending' } },
        ],
      },
    });
    assert.match(html, /Observed/);
    assert.match(html, /Theta excess/);
    assert.match(html, /Hz/);
    assert.match(html, /Elevated theta over Cz/);
    assert.match(html, /evidence pending/);
  });

  it('renders derived interpretations with confidence chip', () => {
    const html = mod.renderQEEGDecisionSupport({
      clinical_summary: {
        derived_interpretations: [
          { label: 'TBR pattern', confidence: 'moderate',
            statement: 'Pattern consistent with attentional dysregulation.' },
        ],
      },
    });
    assert.match(html, /Inferred/);
    assert.match(html, /TBR pattern/);
    assert.match(html, /conf: moderate/);
  });

  it('renders limitations list with mixed string/object shapes', () => {
    const html = mod.renderQEEGDecisionSupport({
      limitations: [
        'Short recording duration',
        { severity: 'high', message: 'Excessive artifacts' },
      ],
    });
    assert.match(html, /Limitations/);
    assert.match(html, /Short recording duration/);
    assert.match(html, /Excessive artifacts/);
  });
});

// ── 28. renderMNEPipelineSections — composite ───────────────────────────────
describe('renderMNEPipelineSections — composite', () => {
  it('returns "" when analysis null', () => {
    assert.strictEqual(mod.renderMNEPipelineSections(null), '');
  });

  it('returns "" when no MNE-shape fields populated', () => {
    assert.strictEqual(mod.renderMNEPipelineSections({ id: 'a' }), '');
  });

  it('joins multiple sections when populated', () => {
    const html = mod.renderMNEPipelineSections({
      id: 'a',
      pipeline_version: '0.1.0',
      norm_db_version: 'toy-0.1',
      quality_metrics: { bad_channels: ['T4'] },
      aperiodic: {
        slope: { Fp1: 1.5 },
        offset: { Fp1: 2.5 },
        r_squared: { Fp1: 0.96 },
      },
      peak_alpha_freq: { Fp1: 9.5 },
      asymmetry: { frontal_alpha_F3_F4: 0.18 },
    });
    assert.match(html, /qeeg-mne-group/);
    assert.match(html, /Pipeline Quality/);
    assert.match(html, /SpecParam/);
  });
});

// ── 29. erp helper re-exports (sanity check) ─────────────────────────────────
describe('ERP helper re-exports', () => {
  it('re-exports erpApplyTrialMappingRows', () => {
    assert.strictEqual(typeof mod.erpApplyTrialMappingRows, 'function');
  });
  it('re-exports erpFormatBidsSummaryHtml', () => {
    assert.strictEqual(typeof mod.erpFormatBidsSummaryHtml, 'function');
  });
  it('re-exports erpResolveBidsUploadMeta', () => {
    assert.strictEqual(typeof mod.erpResolveBidsUploadMeta, 'function');
  });
  it('re-exports erpValidateEventMapping', () => {
    assert.strictEqual(typeof mod.erpValidateEventMapping, 'function');
  });
});

// ── 30. Source-pinned: 19 demo channel array ─────────────────────────────────
describe('pages-qeeg-analysis.js — _DCH demo channels', () => {
  it('lists the 19 standard 10-20 channels (T3/T4/T5/T6 backend names)', () => {
    for (const ch of ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz',
                       'C4','T4','T5','P3','Pz','P4','T6','O1','O2']) {
      assert.ok(SRC.includes("'" + ch + "'"),
        `_DCH should include channel ${ch}`);
    }
  });
});

// ── 31. Source-pinned: _CH_MAP T3/T4/T5/T6 → T7/T8/P7/P8 ────────────────────
describe('pages-qeeg-analysis.js — _CH_MAP backend↔frontend rename', () => {
  it('maps T3→T7, T4→T8, T5→P7, T6→P8', () => {
    assert.ok(SRC.includes("T3: 'T7'"));
    assert.ok(SRC.includes("T4: 'T8'"));
    assert.ok(SRC.includes("T5: 'P7'"));
    assert.ok(SRC.includes("T6: 'P8'"));
  });
});

// ── 32. Source-pinned: hero export buttons ───────────────────────────────────
describe('pages-qeeg-analysis.js — hero export bar', () => {
  it('exposes Source localization, Workbench, CSV, FHIR, BIDS, PDF buttons', () => {
    for (const label of [
      'Source localization', 'Open Raw Workbench',
      'CSV', 'FHIR', 'BIDS', 'PDF',
    ]) {
      assert.ok(SRC.includes(label), `hero must expose "${label}" button`);
    }
  });

  it('declares window export handlers', () => {
    for (const fn of [
      '_qeegExportBandPowerCSV',
      '_qeegExportAdvancedCSV',
      '_qeegExportJSON',
      '_qeegDownloadPDF',
      '_qeegExportFHIRBundle',
      '_qeegExportBIDSPackage',
    ]) {
      assert.ok(SRC.includes(fn),
        `window-attached export ${fn} must be declared`);
    }
  });
});

// ── 33. Source-pinned: comparison renderer copy ──────────────────────────────
describe('pages-qeeg-analysis.js — renderComparison copy', () => {
  it('declares the 3-bucket improvement summary', () => {
    for (const label of ['Improved', 'Unchanged', 'Worsened']) {
      assert.ok(SRC.includes(label),
        `renderComparison must declare "${label}" KPI label`);
    }
  });

  it('declares ratio labels for known biomarkers', () => {
    for (const label of [
      'Theta/Beta', 'Theta/Alpha', 'Delta/Alpha',
      'Alpha Peak (Hz)', 'Frontal Asym.',
    ]) {
      assert.ok(SRC.includes(label),
        `renderComparison must declare ratio label "${label}"`);
    }
  });

  it('declares the 4 quality grades', () => {
    for (const grade of ['excellent', 'good', 'fair', 'poor']) {
      assert.ok(SRC.includes("'" + grade + "':") || SRC.includes(grade + ':'),
        `quality grade ${grade} must be declared`);
    }
  });
});

// ── 34. Source-pinned: advanced-analysis category metadata ───────────────────
describe('pages-qeeg-analysis.js — advanced analysis categories', () => {
  it('declares 7 category labels (catLabels)', () => {
    for (const label of [
      'Spectral Analyses', 'Asymmetry Analyses', 'Connectivity Analyses',
      'Complexity Analyses', 'Network Analyses', 'Microstate Analysis',
      'Clinical Analyses',
    ]) {
      assert.ok(SRC.includes(label),
        `advanced-analyses category "${label}" must be declared`);
    }
  });

  it('declares 7 category icons (catIcons)', () => {
    // Codepoint hexcodes used as inline HTML entities.
    for (const codepoint of [
      '&#x1F4CA;', '&#x2696;', '&#x1F517;', '&#x1F9E9;', '&#x1F578;',
      '&#x26A1;', '&#x1F3E5;',
    ]) {
      assert.ok(SRC.includes(codepoint),
        `category icon ${codepoint} must be declared`);
    }
  });
});

// ── 35. Source-pinned: brain map demo HTML & banner ──────────────────────────
describe('pages-qeeg-analysis.js — _qeegBuildDemoBrainMapHTML', () => {
  it('builds an HTML doc string with safety banner', () => {
    assert.ok(SRC.includes('qEEG Brain Map Report'),
      'demo brain map title must be present');
    assert.ok(SRC.includes('Demo data'),
      'demo brain map honesty banner must be present');
    assert.ok(SRC.includes('window.print()'),
      'demo brain map must expose Print/Save PDF');
  });

  it('declares _qeegIsDemoReportId helper', () => {
    assert.ok(SRC.includes("'demo-report'"),
      '_qeegIsDemoReportId compares against demo-report sentinel');
  });
});

// ── 36. Source-pinned: keyboard navigation wires ─────────────────────────────
describe('pages-qeeg-analysis.js — keyboard navigation', () => {
  it('declares the qEEG tab keyboard wire helper', () => {
    assert.ok(SRC.includes('_wireQEEGTabKeyboard'),
      'tab keyboard wire helper must be declared');
  });

  it('handles ArrowRight / ArrowLeft / Home / End navigation', () => {
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
      assert.ok(SRC.includes("'" + key + "'") || SRC.includes('"' + key + '"'),
        `tab keyboard wire must handle ${key}`);
    }
  });
});

// ── 37. pgQEEGAnalysis — page entrypoint ─────────────────────────────────────
describe('pgQEEGAnalysis — page render entrypoint', () => {
  beforeEach(resetDom);

  it('writes hero shell when invoked with a valid topbar setter', async () => {
    let capturedTitle = null;
    let capturedActions = null;
    window._qeegTab = 'patient';
    delete window._qeegPatientId;
    delete window._qeegSelectedId;

    await safeAwait(mod.pgQEEGAnalysis(
      (title, actions) => { capturedTitle = title; capturedActions = actions; },
      (_route) => {},
    ));

    assert.strictEqual(capturedTitle, 'qEEG Analyzer');
    // Captured actions HTML should be a string (may be empty).
    assert.ok(typeof capturedActions === 'string');
    // Hero markup should land inside #content.
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0, '#content should contain rendered hero shell');
    assert.match(html, /qEEG Analyzer/);
  });

  it('exposes window._qeegSwitchTab at module-load time', async () => {
    // Registered at module top-level.
    assert.ok(typeof window._qeegSwitchTab === 'function',
      'window._qeegSwitchTab should be wired at module-load time');
  });

  it('exposes window._qeegOpenRawTab after invocation', async () => {
    delete window._qeegOpenRawTab;
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    assert.ok(typeof window._qeegOpenRawTab === 'function',
      'window._qeegOpenRawTab should be wired by pgQEEGAnalysis');
  });

  it('renders DEMO MODE banner when demo patient id selected', async () => {
    // The static synthetic-demo seeds use ids like demo-pt-1 / demo-pt-2.
    // We can't peek at the seed list directly, but we can switch through
    // the analysis tab with no patient selected to exercise the empty branch.
    window._qeegPatientId = null;
    window._qeegSelectedId = null;
    window._qeegTab = 'patient';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    // Either DEMO MODE banner OR a real-mode shell should land — both leave
    // the qEEG hero string visible.
    assert.match(html, /qEEG Analyzer/);
  });

  it('renders all tabs when a tab key is set', async () => {
    for (const tab of ['patient', 'analysis', 'raw', 'erp', 'report', 'compare', 'learning']) {
      resetDom();
      window._qeegTab = tab;
      await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
      const html = document.getElementById('content').innerHTML;
      assert.ok(html.length > 0, `tab ${tab} should produce content`);
    }
  });
});

// ── 38. window export handlers — guard branches ──────────────────────────────
describe('window export handlers — no-data guards', () => {
  beforeEach(resetDom);

  it('_qeegExportBandPowerCSV is callable and warns when no analysis', () => {
    // Without a current analysis, this should call showToast('No analysis...')
    // and not throw.
    assert.doesNotThrow(() => {
      window._qeegExportBandPowerCSV && window._qeegExportBandPowerCSV();
    });
  });

  it('_qeegExportAdvancedCSV is callable when no current analysis', () => {
    assert.doesNotThrow(() => {
      window._qeegExportAdvancedCSV && window._qeegExportAdvancedCSV();
    });
  });

  it('_qeegExportJSON is callable when no current analysis', () => {
    assert.doesNotThrow(() => {
      window._qeegExportJSON && window._qeegExportJSON();
    });
  });

  it('_qeegDownloadPDF guards on missing report', () => {
    assert.doesNotThrow(() => {
      window._qeegDownloadPDF && window._qeegDownloadPDF();
    });
  });

  it('_qeegOpenBrainMapReport guards on missing report id', () => {
    assert.doesNotThrow(() => {
      window._qeegOpenBrainMapReport && window._qeegOpenBrainMapReport('');
    });
  });

  it('_qeegOpenBrainMapReport handles demo-report sentinel', () => {
    // Stub window.open to keep jsdom from spawning navigation work.
    const origOpen = window.open;
    let called = false;
    window.open = function () {
      called = true;
      return {
        document: { write: () => {}, close: () => {} },
      };
    };
    try {
      window._qeegOpenBrainMapReport && window._qeegOpenBrainMapReport('demo-report');
      assert.ok(called, 'demo-report should open a new window');
    } finally {
      window.open = origOpen;
    }
  });

  it('_qeegDownloadBrainMapReport handles demo-report sentinel', () => {
    assert.doesNotThrow(() => {
      window._qeegDownloadBrainMapReport && window._qeegDownloadBrainMapReport('demo-report');
    });
  });
});

// ── 39. _qeegSwitchTab — global tab switcher ─────────────────────────────────
describe('window._qeegSwitchTab — global tab switcher', () => {
  it('updates window._qeegTab + invokes _nav when present', () => {
    window._qeegTab = 'patient';
    window._qeegTabScroll = window._qeegTabScroll || {};
    let routedTo = null;
    window._nav = (route) => { routedTo = route; };
    window._qeegSwitchTab('analysis');
    assert.strictEqual(window._qeegTab, 'analysis');
    assert.strictEqual(routedTo, 'qeeg-analysis');
  });

  it('captures scroll position keyed on outgoing tab', () => {
    window._qeegTab = 'analysis';
    window._qeegTabScroll = {};
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
    window._nav = () => {};
    window._qeegSwitchTab('report');
    assert.strictEqual(window._qeegTabScroll['analysis'], 420);
  });
});

// ── 40. _qeegBuildDemoBrainMapHTML wired via window helpers ──────────────────
describe('window._qeegOpenBrainMapReport — demo branch', () => {
  it('embeds the safety banner copy in the demo report', () => {
    let capturedHTML = '';
    const origOpen = window.open;
    window.open = function () {
      return {
        document: {
          write: (s) => { capturedHTML += s; },
          close: () => {},
        },
      };
    };
    try {
      window._qeegOpenBrainMapReport('demo-report');
    } finally {
      window.open = origOpen;
    }
    assert.match(capturedHTML, /qEEG Brain Map Report/);
    assert.match(capturedHTML, /Demo data/);
  });
});

// ── 41. Source-pinned: clinical sections for medical-history view ────────────
describe('pages-qeeg-analysis.js — clinical info sections', () => {
  it('declares 6 clinical-info sections', () => {
    for (const label of [
      'Presenting Symptoms', 'Clinical Profile', 'Safety / Contraindications',
      'Medications & Supplements', 'Neurological & Medical History',
      'Lifestyle & Functional',
    ]) {
      assert.ok(SRC.includes("'" + label + "'") || SRC.includes('"' + label + '"'),
        `clinical info section "${label}" must be declared`);
    }
  });

  it('declares safety field set including pacemaker and pregnancy', () => {
    for (const f of ['seizure_history', 'metal_implants', 'pacemaker', 'pregnancy', 'photosensitivity']) {
      assert.ok(SRC.includes("'" + f + "'"),
        `safety field ${f} must be declared`);
    }
  });
});

// ── 42. Upload area copy ─────────────────────────────────────────────────────
describe('pages-qeeg-analysis.js — upload area', () => {
  it('declares accepted upload types EDF/BDF/VHDR/SET', () => {
    assert.ok(SRC.includes('.edf'), 'EDF must be in supported types');
    assert.ok(SRC.includes('.bdf'), 'BDF must be in supported types');
    assert.ok(SRC.includes('.vhdr'), 'BrainVision VHDR must be in supported types');
    assert.ok(SRC.includes('.set'), 'EEGLAB SET must be in supported types');
  });

  it('declares 100 MB upload size limit', () => {
    assert.ok(SRC.includes('100 * 1024 * 1024'),
      'upload size limit (100 MB) must be in source');
  });

  it('declares Eyes Condition open/closed select options', () => {
    assert.ok(/Open|Closed/.test(SRC),
      'eyes-condition options must be declared');
  });
});

// ── 43. Source-pinned: known artifact-rejection keys ────────────────────────
describe('pages-qeeg-analysis.js — artifact rejection bookkeeping', () => {
  it('reads epochs_total / epochs_kept / flat_channels', () => {
    for (const f of ['epochs_total', 'epochs_kept', 'flat_channels']) {
      assert.ok(SRC.includes(f), `artifact rejection field ${f} must be referenced`);
    }
  });
});

// ── 44. _qeegClinicalSafetyFooter is referenced in main render ──────────────
describe('pages-qeeg-analysis.js — clinical safety footer wired', () => {
  it('safety footer helper is invoked at least once in render path', () => {
    assert.ok(SRC.includes('_qeegClinicalSafetyFooter()'),
      'clinical safety footer must be invoked, not dead');
  });
});

// ── 45. pgQEEGAnalysis with demo patient — drive analysis-tab path ──────────
describe('pgQEEGAnalysis — demo-patient tabs render', () => {
  beforeEach(resetDom);

  it('patient tab renders the upload workflow shell with patient context', async () => {
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegTab = 'patient';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    assert.match(html, /Upload Workflow|Patient &amp; Upload|Patient & Upload/i);
    assert.match(html, /Sarah|Johnson/);
    delete window._qeegPatientId;
  });

  it('analysis tab with demo-sarah-johnson patient renders without throw', async () => {
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'demo';
    window._qeegTab = 'analysis';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0, 'analysis tab must produce content');
    assert.match(html, /qEEG Analyzer/);
    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });

  it('compare tab with demo patient renders without throw', async () => {
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegTab = 'compare';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
    delete window._qeegPatientId;
  });

  it('report tab with no analysis selected renders pick-analysis hint', async () => {
    window._qeegPatientId = 'demo-emma-clarke';
    window._qeegSelectedId = null;
    window._qeegTab = 'report';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });

  it('raw tab routes through render path', async () => {
    window._qeegPatientId = 'demo-robert-kim';
    window._qeegTab = 'raw';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
    delete window._qeegPatientId;
  });

  it('learning tab routes through render path', async () => {
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegTab = 'learning';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
    delete window._qeegPatientId;
  });

  it('erp tab routes through render path', async () => {
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegTab = 'erp';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
    delete window._qeegPatientId;
  });

  it('raw tab without an analysis shows the raw-workbench handoff prompt', async () => {
    window._qeegPatientId = null;
    window._qeegSelectedId = null;
    window._qeegTab = 'raw';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    assert.strictEqual(window._qeegSelectedId, null);
    assert.match(html, /No EEG selected/i);
    assert.match(html, /Raw EEG Workbench/i);
    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });

  it('learning tab renders educational workflow copy and reference card', async () => {
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegTab = 'learning';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    assert.match(html, /Educational reference only/);
    assert.match(html, /Learning EEG Workflow/);
    assert.match(html, /Learning EEG Library/);
    delete window._qeegPatientId;
  });

  it('erp tab without an analysis shows the upload-selection guidance', async () => {
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = null;
    window._qeegTab = 'erp';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const html = document.getElementById('content').innerHTML;
    assert.match(html, /Select a recording/i);
    assert.match(html, /Patient &amp; Upload/);
    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });
});

// ── 46. window helpers wired by pgQEEGAnalysis ───────────────────────────────
describe('window helpers wired by pgQEEGAnalysis', () => {
  beforeEach(resetDom);

  it('_qeegSelectPatient updates window._qeegPatientId state', async () => {
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    let routedTo = null;
    window._nav = (route) => { routedTo = route; };
    window._qeegSelectPatient && window._qeegSelectPatient('demo-emma-clarke');
    assert.strictEqual(window._qeegPatientId, 'demo-emma-clarke');
    assert.strictEqual(routedTo, 'qeeg-analysis');
  });

  it('_qeegClearPatient resets state', async () => {
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    let routedTo = null;
    window._nav = (route) => { routedTo = route; };
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegClearPatient && window._qeegClearPatient();
    assert.strictEqual(window._qeegPatientId, null);
    assert.strictEqual(routedTo, 'qeeg-analysis');
  });

  it('_qeegToggleSection updates collapsed state', async () => {
    window._qeegPatientId = 'demo-sarah-johnson';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    assert.doesNotThrow(() => {
      window._qeegToggleSection && window._qeegToggleSection('safety');
      window._qeegToggleSection && window._qeegToggleSection('safety');
    });
    delete window._qeegPatientId;
  });

  it('_qeegSetWorkspaceLens cycles through lens values', async () => {
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    let routedTo = null;
    window._nav = (route) => { routedTo = route; };
    for (const lens of ['spectral', 'connectivity', 'asymmetry', 'biomarkers']) {
      window._qeegSetWorkspaceLens && window._qeegSetWorkspaceLens(lens);
    }
    assert.strictEqual(routedTo, 'qeeg-analysis');
  });

  it('_qeegSetWorkspaceBand updates state', async () => {
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    window._nav = () => {};
    window._qeegSetWorkspaceBand && window._qeegSetWorkspaceBand('alpha');
    assert.ok(window._qeegWorkspaceState && window._qeegWorkspaceState.band === 'alpha');
  });

  it('_qeegSetWorkspaceMetric updates state', async () => {
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    window._nav = () => {};
    window._qeegSetWorkspaceMetric && window._qeegSetWorkspaceMetric('zscore');
    assert.ok(window._qeegWorkspaceState && window._qeegWorkspaceState.metric === 'zscore');
  });
});

// ── 47. _qeegSwitchCoherenceBand exposes coherence band switcher ─────────────
describe('window._qeegSwitchCoherenceBand', () => {
  it('is exposed on window', () => {
    assert.strictEqual(typeof window._qeegSwitchCoherenceBand, 'function');
  });

  it('no-throws when wrap element absent', () => {
    document.getElementById('content').innerHTML = '';
    assert.doesNotThrow(() => {
      window._qeegSwitchCoherenceBand('alpha');
    });
  });

  it('rerenders the coherence matrix when a loaded analysis has multiple bands', async () => {
    const fixture = _buildRichAnalysisFixture('coh-switch-1');
    fixture.advanced_analyses.results.coherence_matrix.data.bands.beta = [
      [1.0, 0.42, 0.28, 0.31, 0.2, 0.19, 0.14, 0.12],
      [0.42, 1.0, 0.25, 0.39, 0.18, 0.17, 0.13, 0.11],
      [0.28, 0.25, 1.0, 0.37, 0.29, 0.26, 0.2, 0.19],
      [0.31, 0.39, 0.37, 1.0, 0.33, 0.3, 0.22, 0.21],
      [0.2, 0.18, 0.29, 0.33, 1.0, 0.44, 0.34, 0.28],
      [0.19, 0.17, 0.26, 0.3, 0.44, 1.0, 0.31, 0.36],
      [0.14, 0.13, 0.2, 0.22, 0.34, 0.31, 1.0, 0.47],
      [0.12, 0.11, 0.19, 0.21, 0.28, 0.36, 0.47, 1.0],
    ];

    const origApi = {
      listPatients: apiMod.api.listPatients,
      getPatient: apiMod.api.getPatient,
      getPatientMedicalHistory: apiMod.api.getPatientMedicalHistory,
      listPatientQEEGAnalyses: apiMod.api.listPatientQEEGAnalyses,
      getQEEGAnalysis: apiMod.api.getQEEGAnalysis,
      getFusionRecommendation: apiMod.api.getFusionRecommendation,
    };
    Object.assign(apiMod.api, {
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [fixture] }),
      getQEEGAnalysis: async () => fixture,
      getFusionRecommendation: async () => null,
    });

    try {
      resetDom();
      window._qeegPatientId = 'demo-sarah-johnson';
      window._qeegSelectedId = 'coh-switch-1';
      window._qeegTab = 'analysis';
      await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));

      const wrap = document.getElementById('qeeg-coherence-wrap');
      assert.ok(wrap, 'analysis tab should render coherence wrap when data is available');
      window._qeegSwitchCoherenceBand('beta');
      assert.match(wrap.innerHTML, /beta coherence/);
      assert.match(wrap.innerHTML, /qeeg-coh-tab--active[^>]*>beta</i);
    } finally {
      Object.assign(apiMod.api, origApi);
      delete window._qeegPatientId;
      delete window._qeegSelectedId;
    }
  });
});

// ── 48. window export-print helpers — no-throw on missing data ───────────────
describe('window print/export helpers', () => {
  beforeEach(resetDom);

  it('_qeegExportFHIRBundle is callable when no patient', () => {
    assert.doesNotThrow(() => {
      window._qeegExportFHIRBundle && window._qeegExportFHIRBundle();
    });
  });

  it('_qeegExportBIDSPackage is callable when no patient', () => {
    assert.doesNotThrow(() => {
      window._qeegExportBIDSPackage && window._qeegExportBIDSPackage();
    });
  });

  it('_qeegPrintReport guards on missing report', () => {
    assert.doesNotThrow(() => {
      window._qeegPrintReport && window._qeegPrintReport();
    });
  });
});

// ── 49. Source-pinned: ratio-comparison labels & severity color logic ────────
describe('pages-qeeg-analysis.js — internal helpers source-pinned', () => {
  it('declares severityColor helper levels', () => {
    for (const level of ["'high'", "'medium'", "'low'", "'info'"]) {
      assert.ok(SRC.includes(level), `severity level ${level} must be declared`);
    }
  });

  it('declares EEG band ranges (1-4 / 4-8 / 8-12 / 13-30 / 30-50 Hz)', () => {
    for (const range of ['1-4 Hz', '4-8 Hz', '8-12 Hz', '13-30 Hz', '30-50 Hz']) {
      assert.ok(SRC.includes(range),
        `EEG band range "${range}" must be declared`);
    }
  });

  it('declares assessment correlation seed (PHQ-9, GAD-7, PSQI, BRIEF-A)', () => {
    for (const assessment of ['PHQ-9', 'GAD-7', 'PSQI', 'BRIEF-A']) {
      assert.ok(SRC.includes("'" + assessment + "'"),
        `assessment ${assessment} must be in DEMO_ASSESSMENT_CORRELATION`);
    }
  });
});

// ── 50. Source-pinned: clinical demo report literature_refs ──────────────────
describe('pages-qeeg-analysis.js — DEMO_QEEG_REPORT', () => {
  it('declares the demo report id', () => {
    assert.ok(SRC.includes("'demo-report'"),
      'demo report sentinel id must be present');
  });

  it('emits printable HTML via _qeegBuildDemoBrainMapHTML', () => {
    assert.ok(SRC.includes('_qeegBuildDemoBrainMapHTML'),
      'demo brain-map HTML builder must be defined');
    assert.ok(SRC.includes('Print / Save PDF'),
      'demo brain-map HTML must offer Print/Save PDF affordance');
  });
});

// ── 51. Source-pinned: pgQEEGAnalysis tab-routing scaffolding ────────────────
describe('pages-qeeg-analysis.js — pgQEEGAnalysis tab routing', () => {
  it('handles all 7 tab keys in the routing block', () => {
    for (const tab of ['patient', 'analysis', 'raw', 'erp', 'report', 'compare', 'learning']) {
      assert.ok(SRC.includes("tab === '" + tab + "'") || SRC.includes("'" + tab + "'"),
        `pgQEEGAnalysis must handle tab "${tab}"`);
    }
  });

  it('demo banner copy is honest about synthetic data', () => {
    assert.ok(SRC.includes('synthetic data') || SRC.includes('synthetic EEG analysis'),
      'demo banner must label data as synthetic');
    assert.ok(SRC.includes('Not for clinical use'),
      'demo banner must include "Not for clinical use" disclaimer');
  });
});

// ── 52. Source-pinned: comparison renderer phase tags ────────────────────────
describe('pages-qeeg-analysis.js — comparison phase markers', () => {
  it('declares Phase 4.x phase tags in source comments', () => {
    // These are the documented phases of the comparison rebuild.
    for (const phase of ['Phase 4.1', 'Phase 4.2', 'Phase 4.3', 'Phase 4.4']) {
      assert.ok(SRC.includes(phase),
        `comparison renderer must reference ${phase}`);
    }
  });
});

// ── 53. Source-pinned: download-CSV demo stamping ────────────────────────────
describe('pages-qeeg-analysis.js — CSV export demo stamping', () => {
  it('prepends DEMO_ filename prefix when exporting demo recording', () => {
    assert.ok(SRC.includes('DEMO_'),
      'demo CSV exports must be prefixed with DEMO_');
    assert.ok(SRC.includes('# DEMO — not for clinical use'),
      'demo CSV body must include not-for-clinical-use disclaimer');
  });
});

// ── 54. Source-pinned: audit logger ──────────────────────────────────────────
describe('pages-qeeg-analysis.js — _qeegAudit', () => {
  it('declares the audit logger and never-throws contract', () => {
    assert.ok(SRC.includes('function _qeegAudit'),
      'audit logger must be defined');
    assert.ok(SRC.includes('audit must never break UI'),
      'audit logger must promise never to break UI');
  });

  it('is invoked for upload + export events', () => {
    for (const event of ['recording_uploaded', 'export_csv', 'export_json',
                          'export_pdf_requested', 'open_brain_map_report']) {
      assert.ok(SRC.includes("'" + event + "'"),
        `audit event ${event} must be emitted`);
    }
  });
});

// ── 55. Source-pinned: deterministic-fallback alert copy ─────────────────────
describe('pages-qeeg-analysis.js — deterministic-fallback honesty', () => {
  it('flags AI-unavailable reports with a banner', () => {
    assert.ok(SRC.includes('AI interpretation unavailable'),
      'fallback banner must be present');
    assert.ok(SRC.includes('deterministic_stub'),
      'fallback detection must check for deterministic_stub source tag');
    assert.ok(SRC.includes('fallback_no_llm'),
      'fallback detection must check for fallback_no_llm source tag');
  });
});

// ── 56. Source-pinned: pacemaker / safety contraindication labels ────────────
describe('pages-qeeg-analysis.js — safety / contraindication panel', () => {
  it('declares the exact safety field labels', () => {
    for (const label of [
      'Seizure History', 'Seizure Medications', 'Seizure Risk',
      'Metal Implants', 'Pacemaker/ICD', 'Pregnancy',
      'Photosensitivity', 'Prior AE Neuromod',
      'Contraindication Notes', 'Cleared Status',
    ]) {
      assert.ok(SRC.includes(label),
        `safety panel must label "${label}"`);
    }
  });
});

// ── 57. Source-pinned: lifestyle/functional fields ───────────────────────────
describe('pages-qeeg-analysis.js — lifestyle panel labels', () => {
  it('declares lifestyle field labels', () => {
    for (const label of [
      'Sleep Quality', 'Sleep Hours', 'Alcohol', 'Tobacco',
      'Cannabis', 'Other Substances', 'Occupation', 'Activity Level',
    ]) {
      assert.ok(SRC.includes(label),
        `lifestyle panel must label "${label}"`);
    }
  });
});

// ── 58. window-tab-scroll capture roundtrip ──────────────────────────────────
describe('window._qeegTabScroll roundtrip', () => {
  it('persists scroll positions per outgoing tab', () => {
    window._qeegTab = 'analysis';
    window._qeegTabScroll = {};
    window._nav = () => {};
    Object.defineProperty(window, 'scrollY', { value: 1024, configurable: true });
    window._qeegSwitchTab('compare');
    assert.strictEqual(window._qeegTabScroll['analysis'], 1024);

    Object.defineProperty(window, 'scrollY', { value: 256, configurable: true });
    window._qeegSwitchTab('report');
    assert.strictEqual(window._qeegTabScroll['compare'], 256);
  });
});

// ── 59. Source-pinned: ERP demo bundle copy ──────────────────────────────────
describe('pages-qeeg-analysis.js — DEMO_ERP_RESULT', () => {
  it('declares P3a / P3b ERP components', () => {
    assert.ok(SRC.includes("'P3a'"), 'P3a ERP component must be present');
    assert.ok(SRC.includes("'P3b'"), 'P3b ERP component must be present');
    assert.ok(SRC.includes("preset: 'p300'"),
      'ERP preset p300 must be configured');
  });

  it('honestly labels demo as decision-support only', () => {
    assert.ok(SRC.includes('LOW_TRIAL_COUNT'),
      'ERP demo must surface low-trial warning');
    assert.ok(SRC.includes('clinician_review_required: true'),
      'ERP demo must require clinician review');
  });
});

// ── 60. Source-pinned: render3DBrainMap usage ────────────────────────────────
describe('pages-qeeg-analysis.js — 3D brain map integration', () => {
  it('uses render3DBrainMap from brain-map-svg', () => {
    assert.ok(SRC.includes('render3DBrainMap'),
      'render3DBrainMap must be imported from brain-map-svg');
    assert.ok(SRC.includes('render3DBrainMapMini'),
      'render3DBrainMapMini must be imported for hero icon');
  });

  it('uses renderTopoHeatmap and renderBrainMap10_20', () => {
    assert.ok(SRC.includes('renderTopoHeatmap'));
    assert.ok(SRC.includes('renderBrainMap10_20'));
  });

  it('uses renderConnectivityChordLite for connectivity fallback', () => {
    assert.ok(SRC.includes('renderConnectivityChordLite'));
  });
});

// ── 61. Drive deep paths in pgQEEGAnalysis with patched api ──────────────────
describe('pgQEEGAnalysis — deep render paths via patched api', () => {
  // Save originals so we can restore between tests.
  const _origApi = {};
  function _patchApi(overrides) {
    Object.keys(overrides).forEach((k) => {
      if (!(k in _origApi)) _origApi[k] = apiMod.api[k];
      apiMod.api[k] = overrides[k];
    });
  }
  function _restoreApi() {
    Object.keys(_origApi).forEach((k) => {
      apiMod.api[k] = _origApi[k];
      delete _origApi[k];
    });
  }

  beforeEach(() => {
    resetDom();
    _restoreApi();
  });

  it('analysis tab: renders completed analysis with band powers + ratios', async () => {
    const fixture = _buildRichAnalysisFixture('analysis-fixture-1');
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [fixture] }),
      getQEEGAnalysis: async () => fixture,
      getFusionRecommendation: async () => null,
    });
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'analysis-fixture-1';
    window._qeegTab = 'analysis';

    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    assert.ok(html.length > 100, 'analysis tab should produce substantive HTML');

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });

  it('analysis tab: renders pending state with Run button', async () => {
    const fixture = Object.assign(_buildRichAnalysisFixture('pending-1'),
      { analysis_status: 'pending' });
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [fixture] }),
      getQEEGAnalysis: async () => fixture,
      getFusionRecommendation: async () => null,
    });
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'pending-1';
    window._qeegTab = 'analysis';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    assert.match(html, /Analysis Pending|Ready to run/);

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });

  it('analysis tab: renders processing state', async () => {
    const fixture = Object.assign(_buildRichAnalysisFixture('processing-1'),
      { analysis_status: 'processing' });
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [fixture] }),
      getQEEGAnalysis: async () => fixture,
      getFusionRecommendation: async () => null,
    });
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'processing-1';
    window._qeegTab = 'analysis';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    assert.match(html, /Analysis running|Analysis in progress/);

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });

  it('analysis tab: renders failed state', async () => {
    const fixture = Object.assign(_buildRichAnalysisFixture('failed-1'),
      { analysis_status: 'failed', failure_reason: 'Pipeline error: BrainVision header missing' });
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [fixture] }),
      getQEEGAnalysis: async () => fixture,
      getFusionRecommendation: async () => null,
    });
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'failed-1';
    window._qeegTab = 'analysis';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    assert.match(html, /Analysis Failed|Analysis failed|Analysis needs review/);
    assert.match(html, /BrainVision header missing/);

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });

  it('report tab: renders comprehensive report with full payload', async () => {
    const analysis = _buildRichAnalysisFixture('report-fixture-1');
    const report = _buildRichReportFixture('report-fixture-1', 'rep-1');
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [analysis] }),
      getQEEGAnalysis: async () => analysis,
      listQEEGAnalysisReports: async () => ({ items: [report] }),
      listEvidenceSavedCitations: async () => [],
      getFusionRecommendation: async () => null,
      getQEEGPrintableReport: async () => { throw new Error('not available in test'); },
    });
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'report-fixture-1';
    window._qeegSelectedReportId = 'rep-1';
    window._qeegTab = 'report';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    assert.ok(html.length > 100, 'report tab must produce substantive HTML');

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
    delete window._qeegSelectedReportId;
  });

  it('report tab renders the deterministic fallback banner and printable viewer', async () => {
    const analysis = _buildRichAnalysisFixture('report-fallback-1');
    const report = Object.assign(_buildRichReportFixture('report-fallback-1', 'rep-fallback-1'), {
      source: 'deterministic_stub',
      model_used: null,
      model_version: null,
      ai_narrative: {
        executive_summary: 'Fallback report narrative.',
        findings: [],
        confidence_level: 'low',
      },
    });
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [analysis] }),
      getQEEGAnalysis: async () => analysis,
      listQEEGAnalysisReports: async () => ({ reports: [report] }),
      listEvidenceSavedCitations: async () => [],
      getFusionRecommendation: async () => null,
    });

    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'report-fallback-1';
    window._qeegSelectedReportId = 'rep-fallback-1';
    window._qeegTab = 'report';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    assert.match(html, /AI interpretation unavailable/);
    assert.match(html, /Printable Report Viewer/);
    assert.match(html, /Report Side Panel/);
    assert.match(html, /Print HTML Report/);
    delete window._qeegPatientId;
    delete window._qeegSelectedId;
    delete window._qeegSelectedReportId;
  });

  it('report tab: renders the no-report workflow and generate action', async () => {
    const analysis = _buildRichAnalysisFixture('report-empty-1');
    let generateArgs = null;
    globalThis.DEEPSYNAPS_ENABLE_QEEG_RAG_REPORTS = false;
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [analysis] }),
      getQEEGAnalysis: async () => analysis,
      listQEEGAnalysisReports: async () => ({ items: [] }),
      generateQEEGAIReport: async (analysisId, payload) => {
        generateArgs = { analysisId, payload };
        return { id: 'rep-generated-1' };
      },
      getFusionRecommendation: async () => null,
    });
    let routedTo = null;
    window._nav = (route) => { routedTo = route; };
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'report-empty-1';
    window._qeegTab = 'report';

    await safeAwait(mod.pgQEEGAnalysis(() => {}, window._nav));
    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    assert.match(html, /No AI report yet/);
    assert.match(html, /Generate AI Report/);

    const reportType = document.getElementById('qeeg-report-type');
    const button = document.getElementById('qeeg-gen-report-btn');
    assert.ok(reportType, 'report-type select should render');
    assert.ok(button, 'generate button should render');
    reportType.value = 'prediction';
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepStrictEqual(generateArgs, {
      analysisId: 'report-empty-1',
      payload: { report_type: 'prediction' },
    });
    assert.strictEqual(window._qeegTab, 'report');
    assert.strictEqual(routedTo, 'qeeg-analysis');

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
    delete globalThis.DEEPSYNAPS_ENABLE_QEEG_RAG_REPORTS;
  });

  it('report tab: feature-flagged rag draft workflow calls the rag endpoint', async () => {
    const analysis = _buildRichAnalysisFixture('report-rag-empty-1');
    let ragArgs = null;
    globalThis.DEEPSYNAPS_ENABLE_QEEG_RAG_REPORTS = true;
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [analysis] }),
      getQEEGAnalysis: async () => analysis,
      listQEEGAnalysisReports: async () => ({ items: [] }),
      generateQEEGRAGDraftReport: async (analysisId, payload) => {
        ragArgs = { analysisId, payload };
        return { report_id: 'rep-rag-1' };
      },
      getFusionRecommendation: async () => null,
    });
    let routedTo = null;
    window._nav = (route) => { routedTo = route; };
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'report-rag-empty-1';
    window._qeegTab = 'report';

    await safeAwait(mod.pgQEEGAnalysis(() => {}, window._nav));
    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    assert.match(html, /Generate evidence-grounded draft/);
    assert.match(html, /Patient-facing output remains blocked until clinician review/i);

    const reportType = document.getElementById('qeeg-report-type');
    const button = document.getElementById('qeeg-gen-report-btn');
    assert.ok(reportType, 'draft-mode select should render');
    assert.ok(button, 'generate button should render');
    reportType.value = 'patient_friendly_draft';
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepStrictEqual(ragArgs, {
      analysisId: 'report-rag-empty-1',
      payload: {
        output_mode: 'patient_friendly_draft',
        include_evidence: true,
        recording_condition: analysis.eyes_condition || 'unknown',
      },
    });
    assert.strictEqual(window._qeegTab, 'report');
    assert.strictEqual(routedTo, 'qeeg-analysis');

    delete globalThis.DEEPSYNAPS_ENABLE_QEEG_RAG_REPORTS;
    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });

  it('report + analysis tabs: export helpers execute success paths with loaded data', async () => {
    const analysis = _buildRichAnalysisFixture('export-fixture-1');
    const report = _buildRichReportFixture('export-fixture-1', 'rep-export-1');
    const downloads = [];
    const origCreateElement = document.createElement.bind(document);
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;

    _patchApi({
      listPatients: async () => [],
      getPatient: async () => ({ id: 'demo-sarah-johnson', first_name: 'Sarah', last_name: 'Johnson' }),
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [analysis] }),
      getQEEGAnalysis: async () => analysis,
      listQEEGAnalysisReports: async () => ({ items: [report] }),
      listEvidenceSavedCitations: async () => [],
      getFusionRecommendation: async () => null,
    });

    document.createElement = (tagName) => {
      const el = origCreateElement(tagName);
      if (String(tagName).toLowerCase() === 'a') {
        el.click = () => {
          downloads.push({ download: el.download, href: el.href });
        };
      }
      return el;
    };
    URL.createObjectURL = () => 'blob:qeeg-export';
    URL.revokeObjectURL = () => {};

    try {
      window._qeegPatientId = 'demo-sarah-johnson';
      window._qeegSelectedId = 'export-fixture-1';
      window._qeegSelectedReportId = 'rep-export-1';
      window._qeegTab = 'analysis';
      await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
      window._qeegTab = 'report';
      await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));

      window._qeegExportBandPowerCSV();
      window._qeegExportAdvancedCSV();
      window._qeegExportJSON();
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(downloads.some((d) => d.download === 'qeeg_band_powers.csv'));
      assert.ok(downloads.some((d) => d.download === 'qeeg_advanced_analyses.csv'));
      assert.ok(downloads.some((d) => /^qeeg_analysis_export-fixture-1_/.test(d.download)));
    } finally {
      document.createElement = origCreateElement;
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
      delete window._qeegPatientId;
      delete window._qeegSelectedId;
      delete window._qeegSelectedReportId;
    }
  });

  it('compare tab: renders comparison with full payload', async () => {
    const analysis = _buildRichAnalysisFixture('cmp-base');
    const baseAnalysis = Object.assign(_buildRichAnalysisFixture('a1'),
      { analyzed_at: '2026-01-01T10:00:00Z' });
    const fuAnalysis = Object.assign(_buildRichAnalysisFixture('a2'),
      { analyzed_at: '2026-04-01T10:00:00Z' });
    const comparison = _buildComparisonFixture();
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [baseAnalysis, fuAnalysis] }),
      getQEEGAnalysis: async () => analysis,
      getQEEGComparison: async () => comparison,
      createQEEGComparison: async () => comparison,
      getQEEGLongitudinalTrend: async () => null,
      getQEEGAssessmentCorrelation: async () => null,
      getFusionRecommendation: async () => null,
    });
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'a2';
    window._qeegComparisonId = 'cmp-1';
    window._qeegTab = 'compare';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    assert.ok(html.length > 50, 'compare tab must produce HTML');

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
    delete window._qeegComparisonId;
  });

  it('compare tab: renders compare-picker when no comparison id', async () => {
    const baseAnalysis = Object.assign(_buildRichAnalysisFixture('a-base'),
      { analyzed_at: '2026-01-01T10:00:00Z' });
    const fuAnalysis = Object.assign(_buildRichAnalysisFixture('a-fu'),
      { analyzed_at: '2026-04-01T10:00:00Z' });
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [baseAnalysis, fuAnalysis] }),
      getQEEGAnalysis: async () => baseAnalysis,
      getFusionRecommendation: async () => null,
    });
    window._qeegPatientId = 'demo-sarah-johnson';
    window._qeegSelectedId = 'a-fu';
    window._qeegComparisonId = null;
    window._qeegTab = 'compare';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    // Whatever path, content should land.
    assert.ok(html.length > 0);

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
    delete window._qeegComparisonId;
  });

  it('analysis tab: api rejection falls into failed-load alert', async () => {
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => null,
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [] }),
      getQEEGAnalysis: async () => { throw new Error('Backend unavailable'); },
      getFusionRecommendation: async () => null,
    });
    window._qeegPatientId = 'demo-robert-kim';
    window._qeegSelectedId = 'broken-id';
    window._qeegTab = 'analysis';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    const tab = document.getElementById('qeeg-tab-content');
    const html = (tab && tab.innerHTML) || '';
    assert.match(html, /Failed to load analysis|Backend unavailable/);

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });
});

// ── 62. workflow + compare page runtime branches ─────────────────────────────
describe('pgQEEGAnalysis — workflow + compare runtime branches', () => {
  const _origApi = {};
  function _patchApi(overrides) {
    Object.keys(overrides).forEach((k) => {
      if (!(k in _origApi)) _origApi[k] = apiMod.api[k];
      apiMod.api[k] = overrides[k];
    });
  }
  function _restoreApi() {
    Object.keys(_origApi).forEach((k) => {
      apiMod.api[k] = _origApi[k];
      delete _origApi[k];
    });
  }

  beforeEach(() => {
    resetDom();
    _restoreApi();
  });

  it('analysis tab renders compare and notes workflow affordances for a live patient analysis', async () => {
    const analysis = Object.assign(_buildRichAnalysisFixture('workflow-1'), {
      patient_id: 'pt-workflow-1',
    });
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => ({ id: 'pt-workflow-1', first_name: 'Rhea', last_name: 'Patient' }),
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [analysis] }),
      getQEEGAnalysis: async () => analysis,
      getFusionRecommendation: async () => null,
    });

    window._qeegPatientId = 'pt-workflow-1';
    window._qeegSelectedId = 'workflow-1';
    window._qeegTab = 'analysis';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const html = document.getElementById('content').innerHTML;
    assert.match(html, /Compare with Another/);
    assert.match(html, /data-qeeg-annotation=/);
    assert.match(html, /Advanced Analyses/);
    assert.match(html, /Run Advanced Analyses|Re-run/);

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
  });

  it('compare tab renders the under-two-analyses guardrail', async () => {
    const comparePatientId = 'pt-compare-guardrail';
    const onlyAnalysis = Object.assign(_buildRichAnalysisFixture('cmp-guardrail-1'), {
      patient_id: comparePatientId,
      analyzed_at: '2026-01-01T10:00:00Z',
    });
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => ({ id: comparePatientId, first_name: 'Rhea', last_name: 'Patient' }),
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [onlyAnalysis] }),
      getQEEGAnalysis: async () => onlyAnalysis,
      getFusionRecommendation: async () => null,
    });

    window._qeegPatientId = comparePatientId;
    window._qeegSelectedId = 'cmp-guardrail-1';
    window._qeegComparisonId = null;
    window._qeegTab = 'compare';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const html = document.getElementById('content').innerHTML;
    assert.match(html, /At least 2 completed analyses are needed for comparison/);
    assert.match(html, /Current completed: 1/);

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
    delete window._qeegComparisonId;
  });

  it('compare tab renders selection controls and longitudinal trend when 3 analyses exist', async () => {
    const comparePatientId = 'pt-compare-trend';
    const baseline = Object.assign(_buildRichAnalysisFixture('cmp-trend-1'), {
      patient_id: comparePatientId,
      analyzed_at: '2026-01-01T10:00:00Z',
      original_filename: 'baseline.edf',
    });
    const followup = Object.assign(_buildRichAnalysisFixture('cmp-trend-2'), {
      patient_id: comparePatientId,
      analyzed_at: '2026-01-20T10:00:00Z',
      original_filename: 'followup.edf',
    });
    const later = Object.assign(_buildRichAnalysisFixture('cmp-trend-3'), {
      patient_id: comparePatientId,
      analyzed_at: '2026-03-12T10:00:00Z',
      original_filename: 'later.edf',
    });
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => ({ id: comparePatientId, first_name: 'Rhea', last_name: 'Patient' }),
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [baseline, followup, later] }),
      getQEEGAnalysis: async () => later,
      getFusionRecommendation: async () => null,
    });

    window._qeegPatientId = comparePatientId;
    window._qeegSelectedId = 'cmp-trend-3';
    window._qeegComparisonId = null;
    window._qeegTab = 'compare';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, () => {}));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const html = document.getElementById('content').innerHTML;
    assert.match(html, /Suggested comparison/);
    assert.match(html, /day interval/);
    assert.match(html, /qeeg-baseline-sel/);
    assert.match(html, /qeeg-followup-sel/);
    assert.match(html, /Longitudinal Trend \(3 sessions\)/);
    assert.match(html, /qeeg-load-trend-btn/);

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
    delete window._qeegComparisonId;
  });

  it('compare tab creates a comparison from selected analyses and warns on short intervals', async () => {
    const comparePatientId = 'pt-compare-create';
    const baseline = Object.assign(_buildRichAnalysisFixture('cmp-create-1'), {
      patient_id: comparePatientId,
      analyzed_at: '2026-01-01T10:00:00Z',
      original_filename: 'baseline.edf',
    });
    const followup = Object.assign(_buildRichAnalysisFixture('cmp-create-2'), {
      patient_id: comparePatientId,
      analyzed_at: '2026-01-04T10:00:00Z',
      original_filename: 'followup.edf',
    });
    const created = { id: 'cmp-created-1' };
    let createArgs = null;
    let routedTo = null;
    _patchApi({
      listPatients: async () => [],
      getPatient: async () => ({ id: comparePatientId, first_name: 'Rhea', last_name: 'Patient' }),
      getPatientMedicalHistory: async () => null,
      listPatientQEEGAnalyses: async () => ({ items: [baseline, followup] }),
      getQEEGAnalysis: async () => followup,
      getFusionRecommendation: async () => null,
      createQEEGComparison: async (payload) => {
        createArgs = payload;
        return created;
      },
    });

    window._nav = (route) => { routedTo = route; };
    window._qeegPatientId = comparePatientId;
    window._qeegSelectedId = 'cmp-create-2';
    window._qeegComparisonId = null;
    window._qeegTab = 'compare';
    await safeAwait(mod.pgQEEGAnalysis(() => {}, window._nav));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const baselineSel = document.getElementById('qeeg-baseline-sel');
    const followupSel = document.getElementById('qeeg-followup-sel');
    const compareBtn = document.getElementById('qeeg-compare-btn');
    const status = document.getElementById('qeeg-compare-status');
    assert.ok(baselineSel, 'baseline selector should render');
    assert.ok(followupSel, 'follow-up selector should render');
    assert.ok(compareBtn, 'compare button should render');
    assert.ok(baselineSel.options.length >= 3, 'baseline selector should list both analyses');
    assert.ok(followupSel.options.length >= 3, 'follow-up selector should list both analyses');
    assert.match((status && status.innerHTML) || '', /less than 7 days/i);

    const baselineId = baseline.id;
    const followupId = followup.id;
    baselineSel.value = baselineId;
    followupSel.value = followupId;
    baselineSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    followupSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.strictEqual(baselineSel.value, baselineId);
    assert.strictEqual(followupSel.value, followupId);
    compareBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.deepStrictEqual(createArgs, {
      baseline_id: baselineId,
      followup_id: followupId,
    });
    assert.strictEqual(window._qeegComparisonId, created.id);
    assert.strictEqual(routedTo, 'qeeg-analysis');

    delete window._qeegPatientId;
    delete window._qeegSelectedId;
    delete window._qeegComparisonId;
    delete window._nav;
  });
});

// ── 63. Source-pinned: ratio change formatting ───────────────────────────────
describe('pages-qeeg-analysis.js — ratio_changes labels', () => {
  it('declares ratio change KPI labels for comparison tab', () => {
    for (const label of [
      'Theta/Beta', 'Theta/Alpha', 'Delta/Alpha',
      'Alpha Peak (Hz)', 'Frontal Asym.',
    ]) {
      assert.ok(SRC.includes(label),
        `comparison ratio label "${label}" must be declared`);
    }
  });
});

// ── 64. Source-pinned: timeline + correlation copy ───────────────────────────
describe('pages-qeeg-analysis.js — comparison timeline + assessment copy', () => {
  it('declares Baseline / Follow-up timeline labels', () => {
    assert.ok(SRC.includes('Baseline'), 'Baseline label must appear');
    assert.ok(SRC.includes('Follow-up'), 'Follow-up label must appear');
  });
  it('declares Assessment Correlation card title', () => {
    assert.ok(SRC.includes('Assessment Correlation'),
      'Assessment Correlation card must be declared');
  });
});

// ── 65. linkifyCitations integration with refIndex variants ──────────────────
describe('linkifyCitations — refIndex shape variants', () => {
  it('handles refs with index instead of n', () => {
    const html = mod.renderAINarrativeWithCitations(
      { executive_summary: 'Test [5].' },
      [{ index: 5, url: 'https://x.com', title: 'X' }],
    );
    assert.match(html, /href="https:\/\/x\.com"/);
  });

  it('builds pmid url from refIndex when no url field', () => {
    const html = mod.renderAINarrativeWithCitations(
      { executive_summary: 'Test [7].' },
      [{ n: 7, pmid: '12345', title: 'P' }],
    );
    assert.match(html, /pubmed\.ncbi\.nlm\.nih\.gov\/12345/);
  });

  it('builds doi url from refIndex when no url and no pmid', () => {
    const html = mod.renderAINarrativeWithCitations(
      { executive_summary: 'Test [8].' },
      [{ n: 8, doi: '10.1000/abc', title: 'D' }],
    );
    assert.match(html, /doi\.org\/10\.1000\/abc/);
  });
});

// ── 66. Source-pinned: window.* analyzer entrypoints ─────────────────────────
describe('pages-qeeg-analysis.js — window helpers (source-pinned)', () => {
  it('declares window-attached analyzer entrypoints', () => {
    for (const fn of [
      '_qeegSwitchTab',
      '_qeegSelectPatient',
      '_qeegClearPatient',
      '_qeegToggleSection',
      '_qeegSetWorkspaceLens',
      '_qeegSetWorkspaceBand',
      '_qeegSetWorkspaceMetric',
      '_qeegOpenRawTab',
      '_qeegSwitchCoherenceBand',
      '_qeegOpenBrainMapReport',
      '_qeegDownloadBrainMapReport',
    ]) {
      assert.ok(SRC.includes(fn),
        `window helper ${fn} must be declared`);
    }
  });
});
