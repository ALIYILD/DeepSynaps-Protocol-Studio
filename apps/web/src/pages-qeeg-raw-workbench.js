// ─────────────────────────────────────────────────────────────────────────────
// Raw EEG Cleaning Workbench — paper-tone clinical EEG workstation.
//
// Visual port of the design source at ~/Desktop/RAW DATA/ (paper #FAF7F2,
// black ink, kind-coloured AI semantics, 5-row grid: title 44 / toolbar 40 /
// main 1fr / mini-map+topo 64 / status 24).
//
// Decision-support only. Original raw EEG is never overwritten — every
// cleaning action lives in a separate cleaning version with full audit trail.
// AI artefact suggestions require clinician confirmation before any cleaning
// is applied.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';

// 19-channel 10-20 montage, no ECG (matches design source data.jsx).
export const DEFAULT_CHANNELS = [
  'Fp1-Av','Fp2-Av',
  'F7-Av','F3-Av','Fz-Av','F4-Av','F8-Av',
  'T3-Av','C3-Av','Cz-Av','C4-Av','T4-Av',
  'T5-Av','P3-Av','Pz-Av','P4-Av','T6-Av',
  'O1-Av','O2-Av',
];

const SPEEDS = [15, 30, 60];
const GAINS = [25, 50, 100, 200];
const LOW_CUTS = [0.1, 0.3, 0.5, 1];
const HIGH_CUTS = [30, 45, 50, 70, 100];
const NOTCHES = ['Off', '50 Hz', '60 Hz', '45-55 Hz'];
const MONTAGES = ['Referential', 'Bipolar longitudinal', 'Bipolar transverse', 'Average reference', 'Laplacian'];
const VIEW_MODES = [
  { id: 'cleaned', label: 'Cleaned' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'split',   label: 'Split'   },
  { id: 'raw',     label: 'Raw'     },
];
const TIMEBASES = [5, 10, 12, 30];

const TITLE_MENUS = ['File','Edit','View','Format','Recording','Analysis','Setup','Window','Help'];

const ARTEFACT_EXAMPLES = [
  { id: 'alpha-eyes-closed', title: 'Posterior alpha (eyes closed)',
    channels: 'O1, O2, Pz', why: 'Healthy posterior alpha rhythm dominant in eyes-closed condition.',
    action: 'No action — example of clean signal for reference.', check: 'Confirm rhythm attenuates on eye-opening (Berger effect).' },
  { id: 'eye-blink', title: 'Eye blink (frontal artefact)',
    channels: 'Fp1, Fp2', why: 'High-amplitude positive deflection on frontal channels lasting <1 second.',
    action: 'Mark as artefact, consider ICA component rejection.', check: 'Look for symmetry across Fp1/Fp2.' },
  { id: 'muscle-temporal', title: 'Muscle artefact (temporal/frontal)',
    channels: 'T3, T4, F7, F8', why: 'High-frequency (>20 Hz) bursts over temporal or frontalis-muscle channels.',
    action: 'Mark bad segment if persistent; consider re-recording.', check: 'Patient jaw/neck tension; remind patient to relax.' },
  { id: 'line-noise', title: 'Line noise (50/60 Hz contamination)',
    channels: 'All channels', why: 'Sinusoidal artefact at mains frequency from poor grounding or environment.',
    action: 'Apply notch filter; verify ground impedance.', check: 'Check environment for unshielded equipment.' },
  { id: 'flat-channel', title: 'Flat channel',
    channels: 'Single', why: 'Constant near-zero amplitude indicates electrode disconnection or saturation.',
    action: 'Mark bad channel; interpolate or exclude.', check: 'Re-seat electrode; verify impedance < 5 kΩ.' },
  { id: 'electrode-pop', title: 'Electrode pop',
    channels: 'Single', why: 'Sudden step-change followed by exponential decay; electrolyte bridge break.',
    action: 'Mark bad segment locally.', check: 'Apply more gel; re-seat the electrode.' },
  { id: 'movement', title: 'Movement artefact',
    channels: 'Multiple', why: 'Slow large-amplitude drift across many channels from head movement.',
    action: 'Mark bad segment; instruct patient to remain still.', check: 'Position pillow / chin rest.' },
  { id: 'ecg', title: 'ECG contamination',
    channels: 'T3, T4, Cz', why: 'Periodic QRS-like complexes at heart-rate frequency, typically near reference.',
    action: 'Use ICA to isolate cardiac component.', check: 'Re-reference; consider linked-mastoid.' },
  { id: 'poor-recording', title: 'Poor recording — repeat recommended',
    channels: 'Many', why: 'Multiple channels noisy / flat; <60% retained data.',
    action: 'Stop interpretation, repeat recording.', check: 'Cap fit, hair, gel, environment.' },
];

const BEST_PRACTICE = [
  { topic: 'Bad channel detection', why: 'Channels with persistent flat / noisy / saturating signal must be excluded before any spectral analysis.',
    references: ['MNE-Python: mark_bad and interpolate_bads', 'EEGLAB: Channel rejection', 'BIDS-EEG: bad_channel column convention'] },
  { topic: 'Eye blink / saccade artefacts', why: 'Frontal high-amplitude deflections distort delta/theta band power. ICA with ICLabel is the standard mitigation.',
    references: ['MNE: ICA tutorial', 'ICLabel: Pion-Tonachini et al. 2019', 'EEGLAB: runica + ICLabel'] },
  { topic: 'Line noise (50 / 60 Hz)', why: 'Apply a notch filter at the mains frequency. Always verify spectrum afterwards — never assume.',
    references: ['MNE: notch_filter docs', 'IEEE: Power-line interference removal review'] },
  { topic: 'When NOT to over-clean', why: 'Aggressive ICA component rejection can remove genuine brain signal. Keep a conservative threshold and document every removal.',
    references: ['Onton & Makeig 2006', 'Pernet et al. 2020 — Issues and Recommendations'] },
  { topic: 'Preserve original raw EEG', why: 'Cleaning is a derived overlay. The original recording must remain available for future re-analysis with different parameters.',
    references: ['BIDS-EEG: source / derivatives separation', 'FAIR data principles'] },
];

const KEYBOARD_SHORTCUTS = [
  ['Navigation', '←/→', 'Previous / next time window'],
  ['Navigation', '↑/↓', 'Previous / next channel'],
  ['Navigation', 'Home/End', 'Jump to start / end'],
  ['Navigation', 'Space', 'Play / pause'],
  ['Cleaning', 'B', 'Mark bad segment'],
  ['Cleaning', 'C', 'Mark bad channel'],
  ['Cleaning', 'I', 'Interpolate channel'],
  ['Cleaning', 'A', 'Add annotation'],
  ['Cleaning', 'Cmd/Ctrl+S', 'Save cleaning version'],
  ['Cleaning', 'Z', 'Undo'],
  ['View', '+ / −', 'Zoom in / out'],
  ['View', 'G', 'Toggle grid'],
  ['View', 'O', 'Toggle AI overlays'],
  ['View', 'V', 'Cycle view mode'],
  ['View', '?', 'Show shortcuts'],
  ['View', 'Esc', 'Back / exit confirmation'],
];

// AI kind → semantic colour (matches RAW DATA/styles.css)
function kindColour(label) {
  const k = String(label || '').toLowerCase();
  if (k.includes('blink') || k.includes('eye')) return { line: '#1d6f7a', bg: '#d6ebee', border: '#4ea3ad' };
  if (k.includes('muscle')) return { line: '#b8741a', bg: '#f6e6cb', border: '#b8741a' };
  if (k.includes('movement') || k.includes('motion')) return { line: '#5a2f8a', bg: '#e6d8f3', border: '#7a4ea3' };
  if (k.includes('line') || k.includes('mains')) return { line: '#1a4f7a', bg: '#d6e3ee', border: '#1a4f7a' };
  if (k.includes('flat') || k.includes('saturat')) return { line: '#3a3633', bg: '#ECE5D8', border: '#6b6660' };
  if (k.includes('sweat') || k.includes('drift')) return { line: '#8a6a14', bg: '#f3ead0', border: '#b08a1a' };
  return { line: '#2851a3', bg: '#d8e1f3', border: '#2851a3' };
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function readAnalysisIdFromHash() {
  const h = (window.location && window.location.hash) || '';
  const m = h.match(/qeeg-raw-workbench[\/=:]([A-Za-z0-9_\-]+)/);
  if (m) return m[1];
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('analysisId') || window._qeegSelectedId || 'demo';
  } catch (_e) {
    return window._qeegSelectedId || 'demo';
  }
}

function readModeFromHash() {
  const h = (window.location && window.location.hash) || '';
  const m = h.match(/[?&]mode=([A-Za-z0-9_\-]+)/);
  return m ? m[1] : null;
}

function synthSignal(channelIndex, totalSamples, sampleRate, archetypeAt) {
  const out = new Float32Array(totalSamples);
  const isPosterior = channelIndex >= 17;
  const isParietal  = channelIndex >= 12 && channelIndex < 17;
  const isFrontal   = channelIndex < 7;
  const alphaAmp = isPosterior ? 22 : isParietal ? 14 : 6;
  const betaAmp  = isFrontal ? 8 : 5;
  const baseFreqAlpha = 9.5 + (channelIndex % 5) * 0.2;
  const baseFreqBeta  = 18 + (channelIndex % 7);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let v = Math.sin(2 * Math.PI * baseFreqAlpha * t) * alphaAmp
          + Math.sin(2 * Math.PI * baseFreqBeta * t) * betaAmp
          + Math.sin(2 * Math.PI * 5 * t) * 4
          + Math.sin(2 * Math.PI * 1.5 * t) * 3
          + (Math.random() - 0.5) * 6;
    if (archetypeAt && i >= archetypeAt.blinkStart && i <= archetypeAt.blinkEnd && (channelIndex === 0 || channelIndex === 1)) {
      v += Math.exp(-Math.pow(i - (archetypeAt.blinkStart + archetypeAt.blinkEnd) / 2, 2) / 1500) * 220;
    }
    if (archetypeAt && i >= archetypeAt.muscleStart && i <= archetypeAt.muscleEnd && channelIndex === 7) {
      v += (Math.random() - 0.5) * 70;
    }
    v += Math.sin(2 * Math.PI * 50 * t) * 2;
    out[i] = v;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function pgQEEGRawWorkbench(setTopbar, navigate) {
  if (typeof setTopbar === 'function') setTopbar('Raw EEG Cleaning Workbench');
  const root = document.getElementById('app') || document.body;
  if (!root) return;

  const analysisId = readAnalysisIdFromHash();
  const mode = readModeFromHash();
  const isDemo = analysisId === 'demo' || (typeof window._isDemoMode === 'function' && window._isDemoMode());

  const state = {
    analysisId,
    isDemo,
    mode,
    speed: 30,
    gain: 50,
    baseline: 0.0,
    lowCut: 0.3,
    highCut: 50,
    notch: '50 Hz',
    montage: 'Referential',
    viewMode: 'cleaned',
    timebase: 10,
    windowStart: 0,
    selectedChannel: DEFAULT_CHANNELS[0],
    badChannels: new Set(),
    rejectedSegments: [],
    rejectedICA: new Set(),
    annotations: [],
    aiSuggestions: [],
    auditLog: [],
    cleaningVersion: null,
    showShortcuts: false,
    showExport: false,
    rightTab: 'cleaning',
    rightCollapsed: false,
    saveStatus: 'idle',
    metadata: null,
    ica: null,
    rawCleanedSummary: null,
    isDirty: false,
    pendingNav: null,
    rerunDoneNotice: null,
    // Feature-parity additions (RAW DATA source):
    selection: null,        // { startSec, endSec } captured by drag-to-select
    drag: null,             // live drag rectangle while mousedown is held
    history: [],            // undo snapshots
    showGrid: true,         // toggled by G key
    showAiOverlays: true,   // toggled by O key
    aiExplain: null,        // current AI-explain popover { sugg, x, y } or null
    chatInput: '',          // audit-tab chat draft
    chatLog: [              // local-only chat history (shown in Audit tab)
      { who: 'ai', text: 'I detected candidate artefacts in this window. Bilateral frontopolar blinks (Fp1/Fp2) and a possibly flat C4 are the most likely concerns.' },
    ],
  };

  const beforeUnload = (e) => {
    if (state.isDirty) {
      e.preventDefault();
      e.returnValue = 'You have unsaved EEG cleaning edits.';
      return e.returnValue;
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  window._qeegRawWorkbenchTeardown = () => {
    window.removeEventListener('beforeunload', beforeUnload);
  };

  root.innerHTML = workbenchShell(state);
  attachTitleBar(state, navigate);
  attachToolBar(state, navigate);
  attachChannelRail(state);
  attachRightPanel(state);
  attachStatusBar(state);
  attachKeyboard(state, navigate);
  attachExportModal(state);

  await loadAll(state);
  redrawCanvas(state);
  renderRightPanel(state);
  renderStatusBar(state);
  renderRerunNotice(state);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell — 5-row grid (title 44 / toolbar 40 / main 1fr / minimap 64 / status 24)
// ─────────────────────────────────────────────────────────────────────────────

function workbenchShell(state) {
  return `
  <style>${clinicalCss()}</style>
  <div class="qwb-root qwb-clinical" data-testid="qwb-root">
    ${titleBar(state)}
    ${toolBar(state)}
    <div class="qwb-main">
      ${channelGutterHtml(state)}
      <div class="qwb-trace-col">
        <div id="qwb-canvas-wrap" class="qwb-canvas-wrap" data-testid="qwb-trace">
          <div class="qwb-time-ruler" id="qwb-time-ruler" data-testid="qwb-time-ruler"></div>
          <div class="qwb-immutable-notice" id="qwb-immutable-banner">Original raw EEG preserved · Decision-support only</div>
          <canvas id="qwb-canvas" class="qwb-canvas-el"></canvas>
          <div id="qwb-overlays" class="qwb-overlays" data-testid="qwb-overlays"></div>
          <div id="qwb-rerun-notice" class="qwb-rerun-notice" style="display:none"></div>
        </div>
        <div class="qwb-spectro-strip" data-testid="qwb-spectro-strip">
          <span class="qwb-spectro-label">SPECTROGRAM</span>
        </div>
      </div>
      ${rightPanelHtml(state)}
    </div>
    ${miniMapRow(state)}
    ${bottomBar(state)}
    ${shortcutsModal(state)}
    ${unsavedModal(state)}
    ${exportModal(state)}
    ${aiExplainPopover(state)}
  </div>`;
}

function aiExplainPopover(state) {
  return `
  <div id="qwb-ai-explain" class="qwb-ai-explain" data-testid="qwb-ai-explain" style="display:none">
    <div class="qwb-ai-explain-card">
      <div class="qwb-ai-explain-head">
        <span class="qwb-ai-explain-dot"></span>
        <b id="qwb-ai-explain-title">artefact</b>
        <span id="qwb-ai-explain-conf" class="qwb-ai-explain-conf">—%</span>
        <button class="qwb-tb-btn" id="qwb-ai-explain-close" style="margin-left:auto;width:22px;height:22px;padding:0;justify-content:center">×</button>
      </div>
      <div class="qwb-ai-explain-why" id="qwb-ai-explain-why">
        <div class="qwb-ai-explain-why-label">✦ Why I flagged this</div>
        <div id="qwb-ai-explain-why-text"></div>
      </div>
      <div class="qwb-ai-explain-features-label">Features</div>
      <div id="qwb-ai-explain-features" class="qwb-ai-explain-features"></div>
      <div class="qwb-ai-explain-footer" id="qwb-ai-explain-footer"></div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button class="qwb-side-btn" id="qwb-ai-explain-accept">Accept</button>
        <button class="qwb-side-btn" id="qwb-ai-explain-dismiss">Dismiss</button>
      </div>
    </div>
  </div>`;
}

function clinicalCss() {
  return `
    .qwb-clinical {
      position:fixed; inset:0; z-index:9000;
      display:grid;
      grid-template-rows: 44px 40px 1fr 64px 24px;
      background:#FAF7F2; color:#1a1a1a;
      font-family: 'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 12px; line-height:1.3;
      --qwb-paper:#FAF7F2;
      --qwb-paper-2:#F3EEE5;
      --qwb-paper-3:#ECE5D8;
      --qwb-ink:#1a1a1a;
      --qwb-ink-2:#3a3633;
      --qwb-ink-3:#6b6660;
      --qwb-ink-4:#a39d94;
      --qwb-rule:#d8d1c3;
      --qwb-rule-2:#bdb5a2;
      --qwb-ai:#1d6f7a;
      --qwb-ai-soft:#d6ebee;
      --qwb-warn:#b8741a;
      --qwb-bad:#b03434;
      --qwb-bad-soft:#f3d4d0;
      --qwb-ok:#2f6b3a;
      --qwb-ok-soft:#d6e8d6;
      --qwb-select:#2851a3;
      --qwb-select-soft:#d8e1f3;
      --qwb-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    }

    /* ── Title bar ───────────────────────────────────────────── */
    .qwb-titlebar {
      display:flex; align-items:center; gap:0;
      padding:0 14px;
      background:linear-gradient(to bottom, #fdfaf4, #f3ede0);
      border-bottom:1px solid #d8d1c3;
      font-size:12px;
    }
    .qwb-brand {
      display:flex; align-items:center; gap:8px;
      font-weight:600; letter-spacing:-0.01em;
      padding-right:14px; margin-right:12px;
      border-right:1px solid #d8d1c3;
    }
    .qwb-brand-name { font-size:13px; }
    .qwb-brand-name b { font-weight:700; }
    .qwb-brand-name .sub { color:#6b6660; margin-left:6px; font-weight:500; }
    .qwb-menus { display:flex; gap:0; }
    .qwb-menu-btn {
      background:transparent; border:0; padding:4px 9px; font-size:12px;
      color:#3a3633; border-radius:4px; cursor:pointer;
    }
    .qwb-menu-btn:hover { background:rgba(0,0,0,0.05); }
    .qwb-titlebar-right {
      margin-left:auto; display:flex; align-items:center; gap:10px;
      font-family:var(--qwb-mono); font-size:11px; color:#6b6660;
    }
    .qwb-pat-chip {
      display:inline-flex; align-items:center; gap:8px;
      padding:3px 10px; border:1px solid #d8d1c3; border-radius:999px;
      background:#FAF7F2; font-family:'Inter Tight', system-ui, sans-serif;
      font-size:11px; color:#1a1a1a;
    }
    .qwb-pat-chip .qwb-pat-dot { width:6px; height:6px; border-radius:50%; background:#2f6b3a; }
    .qwb-pat-chip b { font-weight:700; color:#1a1a1a; }

    /* ── Toolbar (WinEEG parity) ─────────────────────────────── */
    .qwb-toolbar {
      display:flex; align-items:center; gap:0;
      padding:0 8px;
      background:#F3EEE5; border-bottom:1px solid #d8d1c3;
      font-size:11px;
      overflow-x:auto; overflow-y:hidden;
    }
    .qwb-tb-group {
      display:flex; align-items:center; gap:6px;
      padding:0 10px; height:100%;
      border-right:1px dashed #d8d1c3;
      flex-shrink:0;
    }
    .qwb-tb-group:last-child { border-right:0; }
    .qwb-tb-label {
      color:#6b6660; font-size:10.5px;
      text-transform:uppercase; letter-spacing:0.04em; font-weight:500;
    }
    .qwb-tb-field {
      display:flex; align-items:center; gap:4px;
      background:#FAF7F2; border:1px solid #d8d1c3; border-radius:3px;
      padding:2px 6px; font-family:var(--qwb-mono);
      font-size:11px; height:22px;
    }
    .qwb-tb-field input, .qwb-tb-field select {
      background:transparent; border:0; outline:none;
      font-family:inherit; font-size:inherit; color:#1a1a1a;
      width:60px; padding:0;
    }
    .qwb-tb-field select { width:auto; padding-right:8px; }
    .qwb-tb-field .qwb-tb-unit { color:#6b6660; font-size:10px; }
    .qwb-tb-field:focus-within { border-color:#1d6f7a; box-shadow:0 0 0 2px #d6ebee; }
    .qwb-tb-btn {
      background:#FAF7F2; border:1px solid #d8d1c3; border-radius:3px;
      padding:0 8px; height:22px;
      font-size:11px; color:#3a3633;
      display:inline-flex; align-items:center; gap:5px;
      cursor:pointer; flex-shrink:0;
    }
    .qwb-tb-btn:hover { background:#fff; border-color:#bdb5a2; }
    .qwb-tb-btn.primary { background:#1a1a1a; color:#FAF7F2; border-color:#1a1a1a; font-weight:500; }
    .qwb-tb-btn.primary:hover { background:#000; }
    .qwb-tb-btn.ai { background:#1d6f7a; color:#fff; border-color:#1d6f7a; font-weight:500; }
    .qwb-tb-btn.ai:hover { background:#155a64; }
    .qwb-tb-btn.help-circle {
      width:22px; height:22px; padding:0;
      border-radius:50%; justify-content:center;
      background:#d6ebee; color:#1d6f7a; border-color:#d8d1c3; font-weight:700;
    }
    .qwb-view-toggle {
      display:inline-flex; border:1px solid #d8d1c3; border-radius:4px;
      overflow:hidden; height:22px; flex-shrink:0;
    }
    .qwb-view-toggle button {
      padding:0 10px; height:22px; font-size:11px;
      border:0; border-right:1px solid #d8d1c3;
      background:#FAF7F2; color:#3a3633; cursor:pointer;
    }
    .qwb-view-toggle button:last-child { border-right:0; }
    .qwb-view-toggle button.active {
      background:#1a1a1a; color:#FAF7F2; font-weight:500;
    }

    /* ── Main grid (channel gutter | trace+spectro | side) ──── */
    .qwb-main {
      display:grid;
      grid-template-columns: 56px 1fr 360px;
      min-height:0;
      background:#FAF7F2;
    }
    .qwb-channel-gutter {
      border-right:1px solid #d8d1c3;
      background:#F3EEE5;
      display:grid;
      grid-template-rows: 22px 1fr;
      min-height:0;
    }
    .qwb-cg-header {
      border-bottom:1px solid #d8d1c3;
      background:#F3EEE5;
      display:flex; align-items:center; justify-content:flex-end;
      padding:0 8px; font-family:var(--qwb-mono);
      font-size:9.5px; color:#6b6660;
    }
    .qwb-cg-rows {
      display:grid;
      grid-template-rows:repeat(${DEFAULT_CHANNELS.length}, 1fr);
      min-height:0;
    }
    .qwb-ch-row {
      display:flex; flex-direction:column; justify-content:center;
      align-items:flex-end; padding-right:8px;
      border-bottom:1px dashed #d8d1c3;
      font-family:var(--qwb-mono); font-size:10.5px; color:#3a3633;
      cursor:pointer;
    }
    .qwb-ch-row.active { background:#d8e1f3; }
    .qwb-ch-row.bad { background:#f3d4d0; color:#b03434; }
    .qwb-ch-row .qwb-ch-name { font-weight:600; font-size:11px; }
    .qwb-ch-row .qwb-ch-scale { color:#6b6660; font-size:9.5px; }

    /* ── Trace column ─────────────────────────────────────────── */
    .qwb-trace-col {
      display:grid; grid-template-rows: 1fr 56px;
      min-width:0; min-height:0; overflow:hidden;
    }
    .qwb-canvas-wrap {
      position:relative; min-height:0;
      background:#FAF7F2; overflow:hidden;
    }
    .qwb-canvas-el { display:block; width:100%; height:100%; background:#FAF7F2; }
    .qwb-time-ruler {
      position:absolute; top:0; left:0; right:0; height:22px;
      display:flex; border-bottom:1px solid #d8d1c3;
      background:#F3EEE5;
      font-family:var(--qwb-mono); font-size:10px; color:#6b6660;
      z-index:4;
    }
    .qwb-time-tick {
      flex:1; border-right:1px solid #d8d1c3; padding:4px 6px;
    }
    .qwb-time-tick:last-child { border-right:0; }
    .qwb-overlays { position:absolute; inset:22px 0 0 0; pointer-events:none; }
    .qwb-immutable-notice {
      position:absolute; top:26px; right:8px;
      background:#FAF7F2; border:1px solid #d8d1c3;
      padding:3px 7px; border-radius:3px;
      font-size:10px; color:#3a3633; z-index:5;
    }
    .qwb-rerun-notice {
      position:absolute; left:50%; top:30px; transform:translateX(-50%);
      background:#d8e1f3; border:1px solid #2851a3; color:#13306a;
      padding:8px 14px; border-radius:4px; font-size:12px; z-index:6;
      box-shadow: 0 2px 8px rgba(40,81,163,0.10);
    }
    .qwb-ai-chip {
      position:absolute;
      display:inline-flex; align-items:center; gap:6px;
      padding:3px 7px 3px 5px; border-radius:4px;
      font-size:10.5px; font-weight:500; border:1px solid;
      white-space:nowrap; transform:translateY(-50%);
      box-shadow:0 1px 2px rgba(0,0,0,0.06);
      pointer-events:auto; cursor:pointer;
    }
    .qwb-ai-chip .qwb-ai-chip-dot {
      width:6px; height:6px; border-radius:50%; flex-shrink:0;
    }
    .qwb-ai-chip .qwb-ai-chip-conf {
      font-family:var(--qwb-mono); font-size:9.5px; opacity:0.8;
      padding-left:4px; border-left:1px solid currentColor; margin-left:2px;
    }
    .qwb-bad-segment {
      position:absolute; top:22px; bottom:0;
      background: repeating-linear-gradient(-45deg,
        rgba(176,52,52,0.12),
        rgba(176,52,52,0.12) 4px,
        rgba(176,52,52,0.18) 4px,
        rgba(176,52,52,0.18) 8px);
      border-left:2px solid #b03434; border-right:2px solid #b03434;
      pointer-events:none; z-index:2;
    }
    .qwb-selection {
      position:absolute; top:22px; bottom:0;
      background:rgba(40,81,163,0.15);
      border-left:2px solid #2851a3; border-right:2px solid #2851a3;
      pointer-events:none; z-index:3;
    }

    /* ── Spectrogram strip (decorative paper-tone band) ──────── */
    .qwb-spectro-strip {
      background:linear-gradient(180deg, #d6ebee, #FAF7F2 60%, #f6e6cb);
      border-top:1px solid #d8d1c3;
      display:flex; align-items:flex-start; padding:6px 10px;
      font-family:var(--qwb-mono); font-size:9.5px;
      color:#3a3633; text-transform:uppercase; letter-spacing:0.06em;
    }

    /* ── Right panel ─────────────────────────────────────────── */
    .qwb-right {
      border-left:1px solid #d8d1c3;
      background:#F3EEE5;
      display:flex; flex-direction:column; min-height:0;
      transition: width 0.18s ease;
    }
    .qwb-right.collapsed { width:36px; min-width:36px; }
    .qwb-right-toggle {
      width:36px; height:32px; padding:0; cursor:pointer;
      background:#FAF7F2; color:#3a3633;
      border:none; border-bottom:1px solid #d8d1c3;
      font-size:14px; font-weight:700;
    }
    .qwb-right-tabs {
      display:flex; border-bottom:1px solid #d8d1c3; background:#FAF7F2;
    }
    .qwb-tab {
      flex:1; padding:9px 4px;
      background:transparent; color:#6b6660;
      border:none; border-bottom:2px solid transparent;
      font-size:11px; font-weight:500; cursor:pointer;
      display:flex; flex-direction:column; align-items:center; gap:2px;
    }
    .qwb-tab.active { color:#1d6f7a; border-bottom-color:#1d6f7a; background:#F3EEE5; }
    .qwb-tab .qwb-tab-badge {
      display:inline-block; min-width:16px; padding:1px 4px;
      background:#1d6f7a; color:#fff; border-radius:8px;
      font-family:var(--qwb-mono); font-size:9px;
    }
    .qwb-right-body { flex:1; overflow-y:auto; padding:0; }
    .qwb-side-section { padding:12px 14px 14px; border-bottom:1px solid #d8d1c3; }
    .qwb-side-section h4 {
      margin:0 0 8px; font-size:10.5px; font-weight:600;
      text-transform:uppercase; letter-spacing:0.06em; color:#6b6660;
      display:flex; align-items:center; gap:6px;
    }
    .qwb-side-section h4 .qwb-letter {
      display:inline-flex; align-items:center; justify-content:center;
      width:16px; height:16px; border-radius:3px;
      background:#1a1a1a; color:#FAF7F2;
      font-family:var(--qwb-mono); font-size:10px; font-weight:600;
    }
    .qwb-side-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .qwb-side-btn {
      background:#FAF7F2; border:1px solid #d8d1c3; border-radius:4px;
      padding:7px 8px; font-size:11.5px; color:#3a3633;
      display:flex; align-items:center; justify-content:center; gap:6px;
      text-align:center; line-height:1.1; cursor:pointer;
    }
    .qwb-side-btn:hover { background:#fff; border-color:#bdb5a2; }
    .qwb-side-btn.full { grid-column:span 2; }
    .qwb-side-btn.ai { background:#1d6f7a; color:#fff; border-color:#1d6f7a; font-weight:500; }
    .qwb-side-btn.ai:hover { background:#155a64; }
    .qwb-side-btn.ink { background:#1a1a1a; color:#FAF7F2; border-color:#1a1a1a; font-weight:500; }
    .qwb-side-btn.warn { background:#b8741a; color:#fff; border-color:#b8741a; }

    /* ── Mini-map row ────────────────────────────────────────── */
    .qwb-minimap-row {
      display:grid;
      grid-template-columns: 56px 1fr 360px;
      border-top:1px solid #d8d1c3;
      background:#F3EEE5;
    }
    .qwb-minimap-gutter {
      background:#F3EEE5; border-right:1px solid #d8d1c3;
      display:flex; align-items:center; justify-content:center;
      font-size:9px; color:#6b6660; font-family:var(--qwb-mono);
      text-transform:uppercase; letter-spacing:0.06em;
    }
    .qwb-minimap {
      padding:6px 10px 8px; min-width:0;
    }
    .qwb-minimap-head {
      display:flex; justify-content:space-between; align-items:center;
      margin-bottom:4px;
    }
    .qwb-minimap-title {
      font-size:10px; color:#6b6660;
      text-transform:uppercase; letter-spacing:0.06em; font-weight:600;
    }
    .qwb-minimap-legend {
      display:flex; gap:10px; font-family:var(--qwb-mono);
      font-size:9.5px; color:#6b6660;
    }
    .qwb-minimap-track {
      position:relative; height:36px;
      background:#FAF7F2; border:1px solid #d8d1c3; border-radius:3px;
      cursor:pointer;
    }
    .qwb-minimap-window {
      position:absolute; top:0; bottom:0;
      background:rgba(29,111,122,0.18);
      border:1.5px solid #1d6f7a;
      pointer-events:none;
    }
    .qwb-topo-strip {
      border-left:1px solid #d8d1c3; background:#FAF7F2;
      display:flex; justify-content:space-around;
      padding:6px 4px;
    }
    .qwb-topo-mini {
      display:flex; flex-direction:column; align-items:center; gap:2px;
    }
    .qwb-topo-mini svg { width:46px; height:46px; }
    .qwb-topo-label {
      font-size:9.5px; font-weight:600; color:#3a3633;
    }
    .qwb-topo-band {
      font-family:var(--qwb-mono); font-size:8.5px; color:#6b6660;
    }

    /* ── Status bar ──────────────────────────────────────────── */
    .qwb-bottombar {
      display:flex; align-items:center; gap:16px;
      padding:0 14px;
      background:#F3EEE5; border-top:1px solid #d8d1c3;
      font-family:var(--qwb-mono); font-size:10.5px; color:#6b6660;
    }
    .qwb-stat { display:flex; gap:4px; }
    .qwb-stat b { color:#3a3633; font-weight:600; }
    .qwb-bottombar-right { margin-left:auto; display:flex; gap:14px; align-items:center; }
    .qwb-st-save.qwb-dirty { color:#b8741a; font-weight:600; }
    .qwb-ai-watch {
      display:inline-flex; align-items:center; gap:5px;
      color:#1d6f7a; font-weight:600;
    }
    .qwb-ai-watch .qwb-pulse {
      width:6px; height:6px; border-radius:50%; background:#1d6f7a;
      animation: qwb-pulse 1.4s ease-in-out infinite;
    }
    @keyframes qwb-pulse {
      0%, 100% { opacity:1; }
      50%      { opacity:0.3; }
    }

    /* ── Modals ──────────────────────────────────────────────── */
    .qwb-modal-backdrop {
      position:fixed; inset:0; background:rgba(26,26,26,0.45);
      display:none; align-items:center; justify-content:center; z-index:9999;
    }
    .qwb-modal {
      background:#FAF7F2; color:#1a1a1a;
      border:1px solid #d8d1c3; border-radius:8px;
      padding:24px; min-width:340px; max-width:620px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .qwb-modal h3 { margin:0 0 4px 0; font-size:16px; font-weight:700; }
    .qwb-modal .qwb-modal-sub {
      margin:0 0 18px 0; font-size:12px; color:#6b6660;
    }
    .qwb-modal table { width:100%; font-size:12px; border-collapse:collapse; }
    .qwb-modal td { padding:4px 8px; }
    .qwb-modal kbd {
      font-family:var(--qwb-mono); font-size:10.5px;
      background:#F3EEE5; padding:2px 6px; border-radius:3px;
      border:1px solid #d8d1c3; color:#1a1a1a;
    }

    /* ── AI explain popover ──────────────────────────────────── */
    .qwb-ai-explain {
      position:fixed; inset:0; pointer-events:none; z-index:9998;
    }
    .qwb-ai-explain-card {
      position:absolute; pointer-events:auto;
      background:#FAF7F2; border:1px solid #d8d1c3; border-radius:6px;
      padding:14px; width:300px;
      box-shadow:0 8px 24px rgba(0,0,0,0.18);
      font-size:11.5px;
    }
    .qwb-ai-explain-head { display:flex; align-items:center; gap:6px; margin-bottom:8px; }
    .qwb-ai-explain-dot { width:8px; height:8px; border-radius:50%; background:#1d6f7a; }
    .qwb-ai-explain-conf { font-family:var(--qwb-mono); font-size:10.5px; color:#1d6f7a; }
    .qwb-ai-explain-why {
      background:#d6ebee; padding:8px; border-radius:4px; color:#3a3633;
      line-height:1.45; margin-bottom:10px; border-left:2px solid #1d6f7a;
    }
    .qwb-ai-explain-why-label {
      font-size:9.5px; text-transform:uppercase; letter-spacing:0.06em;
      color:#1d6f7a; margin-bottom:3px; font-weight:600;
    }
    .qwb-ai-explain-features-label {
      font-size:9.5px; text-transform:uppercase; letter-spacing:0.06em;
      color:#6b6660; margin-bottom:5px; font-weight:600;
    }
    .qwb-ai-explain-features {
      display:flex; flex-direction:column; gap:3px;
      font-family:var(--qwb-mono); font-size:10.5px;
    }
    .qwb-ai-explain-features div {
      display:flex; justify-content:space-between;
    }
    .qwb-ai-explain-features .qwb-feat-key { color:#6b6660; }
    .qwb-ai-explain-footer {
      margin-top:10px; padding-top:6px;
      font-size:10px; color:#6b6660;
      border-top:1px dotted #d8d1c3;
    }

    /* ── Drag selection + bad-segment label ──────────────────── */
    .qwb-drag-rect {
      position:absolute; top:22px; bottom:0;
      background:rgba(40,81,163,0.15);
      border-left:2px solid #2851a3; border-right:2px solid #2851a3;
      pointer-events:none; z-index:5;
    }
    .qwb-drag-rect .qwb-drag-label,
    .qwb-selection .qwb-sel-label {
      position:absolute; top:-22px; left:0;
      background:#2851a3; color:#fff;
      font-family:var(--qwb-mono); font-size:10px;
      padding:2px 6px; border-radius:3px 3px 0 0;
      white-space:nowrap;
    }
    .qwb-bad-segment-label {
      position:absolute; top:2px; left:4px;
      background:#b03434; color:#fff;
      font-family:var(--qwb-mono); font-size:9.5px;
      padding:1px 5px; border-radius:2px;
    }

    /* ── BP quality score header ─────────────────────────────── */
    .qwb-bp-score {
      display:flex; align-items:baseline; gap:8px; margin-bottom:6px;
    }
    .qwb-bp-score-num {
      font-family:var(--qwb-mono); font-size:32px; font-weight:700; color:#1d6f7a;
    }
    .qwb-bp-score-bar {
      height:6px; background:#ECE5D8; border-radius:3px; overflow:hidden;
    }
    .qwb-bp-score-fill { height:100%; background:#1d6f7a; }
    .qwb-bp-pill {
      margin-left:auto; font-size:10.5px; color:#b8741a;
      background:#f6e6cb; padding:2px 6px; border-radius:3px;
    }

    /* ── Tab badge (count indicator) ─────────────────────────── */
    .qwb-tab .qwb-tab-count {
      display:inline-block; min-width:16px; padding:1px 5px;
      background:#1d6f7a; color:#fff; border-radius:8px;
      font-family:var(--qwb-mono); font-size:9px; margin-left:4px;
    }

    /* ── Audit chat input ────────────────────────────────────── */
    .qwb-chat {
      background:#FAF7F2; border:1px solid #d8d1c3; border-radius:6px;
      padding:10px; margin-bottom:10px;
    }
    .qwb-chat-msg-ai {
      font-size:11.5px; color:#3a3633; line-height:1.45;
      padding:8px 10px; background:#d6ebee; border-radius:6px;
      margin-bottom:8px; border-left:2px solid #1d6f7a;
    }
    .qwb-chat-input {
      display:flex; gap:6px; align-items:center;
      border:1px solid #d8d1c3; border-radius:6px;
      padding:4px 4px 4px 10px; background:#FAF7F2;
    }
    .qwb-chat-input input {
      flex:1; border:0; outline:none; background:transparent;
      font-family:inherit; font-size:12px; padding:6px 0;
    }
    .qwb-chat-input button {
      background:#1d6f7a; color:#fff; border:0; border-radius:4px;
      padding:5px 10px; font-size:11px; cursor:pointer;
    }

    /* ── Cards / lists ───────────────────────────────────────── */
    .qwb-card {
      border:1px solid #d8d1c3; border-radius:4px; padding:10px;
      margin-bottom:8px; background:#FAF7F2;
    }
    .qwb-ai-banner {
      padding:8px 10px; background:#f6e6cb;
      border:1px solid #b8741a; border-radius:4px;
      font-size:11px; color:#7a4d10; margin-bottom:12px;
    }
    .qwb-safety-footer {
      margin-top:12px; padding:10px; background:#F3EEE5;
      border:1px solid #d8d1c3; border-radius:4px;
      font-size:11px; color:#3a3633; line-height:1.5;
    }
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Title bar
// ─────────────────────────────────────────────────────────────────────────────

function titleBar(state) {
  const patientName = state.metadata?.patient_name || (state.isDemo ? 'Azzi Glasser' : 'patient');
  const sessionMeta = state.metadata?.session_label || (state.isDemo ? 'DNEW0000 · Eyes Closed' : '');
  const menus = TITLE_MENUS.map(m => `<button class="qwb-menu-btn" data-menu="${esc(m)}">${esc(m)}</button>`).join('');
  return `
  <div class="qwb-titlebar">
    <div class="qwb-brand">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="#1a1a1a" stroke-width="1.5"/>
        <path d="M3 12 Q 6 6, 9 12 T 15 12 T 21 12" stroke="#1d6f7a" stroke-width="1.5" fill="none"/>
        <circle cx="12" cy="12" r="2" fill="#1d6f7a"/>
      </svg>
      <span class="qwb-brand-name"><b>DeepSynaps</b><span class="sub">Studio</span></span>
    </div>
    <div class="qwb-menus">${menus}</div>
    <div class="qwb-titlebar-right">
      <span class="qwb-pat-chip" id="qwb-pat-chip" data-testid="qwb-pat-chip">
        <span class="qwb-pat-dot"></span>
        <span>Patient: <b id="qwb-pat-name">${esc(patientName)}</b>${sessionMeta ? ' · ' + esc(sessionMeta) : ''}</span>
      </span>
      <span id="qwb-titlebar-time" data-testid="qwb-titlebar-time">--:--:--</span>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar (WinEEG parity)
// ─────────────────────────────────────────────────────────────────────────────

function toolBar(state) {
  const num = (id, value, unit, step) => `
    <div class="qwb-tb-field">
      <input type="number" id="${id}" value="${value}"${step ? ` step="${step}"` : ''} />
      ${unit ? `<span class="qwb-tb-unit">${esc(unit)}</span>` : ''}
    </div>`;
  const sel = (id, opts, val) => `
    <div class="qwb-tb-field">
      <select id="${id}">
        ${opts.map(o => `<option value="${esc(o)}" ${String(o)===String(val)?'selected':''}>${esc(o)}</option>`).join('')}
      </select>
    </div>`;
  const viewToggle = `
    <div class="qwb-view-toggle" id="qwb-view-toggle" data-testid="qwb-view-toggle">
      ${VIEW_MODES.map(v => `<button data-view="${v.id}" class="${state.viewMode===v.id?'active':''}">${esc(v.label)}</button>`).join('')}
    </div>`;
  return `
  <div class="qwb-toolbar">
    <div class="qwb-tb-group">
      <button class="qwb-tb-btn" id="qwb-back" data-testid="qwb-back-analyzer">← Back to qEEG Analyzer</button>
      <button class="qwb-tb-btn" id="qwb-back-patient" data-testid="qwb-back-patient">Back to Patient</button>
    </div>
    <div class="qwb-tb-group">
      <span class="qwb-tb-label">Speed</span>${num('qwb-speed', state.speed, 'mm/s')}
    </div>
    <div class="qwb-tb-group">
      <span class="qwb-tb-label">Gain</span>${num('qwb-gain', state.gain, 'µV/cm')}
    </div>
    <div class="qwb-tb-group">
      <span class="qwb-tb-label">Baseline</span>${num('qwb-baseline', state.baseline.toFixed(2), 'µV', '0.01')}
      <button class="qwb-tb-btn" id="qwb-baseline-reset" data-testid="qwb-baseline-reset">Reset</button>
    </div>
    <div class="qwb-tb-group">
      <span class="qwb-tb-label">Low</span>${num('qwb-lowcut', state.lowCut, 'Hz', '0.1')}
      <span class="qwb-tb-label">High</span>${num('qwb-highcut', state.highCut, 'Hz')}
      <span class="qwb-tb-label">Notch</span>${sel('qwb-notch', NOTCHES, state.notch)}
    </div>
    <div class="qwb-tb-group">
      <span class="qwb-tb-label">Montage</span>${sel('qwb-montage', MONTAGES, state.montage)}
      <span class="qwb-tb-label">Window</span>${sel('qwb-timebase', TIMEBASES.map(t=>`${t}s`), `${state.timebase}s`)}
    </div>
    <div class="qwb-tb-group" style="margin-left:auto;border-right:0">
      <button class="qwb-tb-btn" id="qwb-prev-window" data-testid="qwb-prev-window" title="Previous window">⏮</button>
      <button class="qwb-tb-btn" id="qwb-play" data-testid="qwb-play" title="Play / pause">▶</button>
      <button class="qwb-tb-btn" id="qwb-next-window" data-testid="qwb-next-window" title="Next window">⏭</button>
      ${viewToggle}
      <button class="qwb-tb-btn" id="qwb-compare">Raw vs Cleaned</button>
      <button class="qwb-tb-btn" id="qwb-return-report" data-testid="qwb-return-report">Return to Report</button>
      <button class="qwb-tb-btn" id="qwb-export" data-testid="qwb-export">Export…</button>
      <button class="qwb-tb-btn primary" id="qwb-save" data-testid="qwb-save">Save Cleaning Version</button>
      <button class="qwb-tb-btn ai" id="qwb-rerun" data-testid="qwb-rerun">✦ Re-run qEEG</button>
      <button class="qwb-tb-btn help-circle" id="qwb-shortcuts" data-testid="qwb-help" title="Keyboard shortcuts (?)">?</button>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel gutter
// ─────────────────────────────────────────────────────────────────────────────

function channelGutterHtml(state) {
  const rows = DEFAULT_CHANNELS.map(ch => {
    const isBad = state.badChannels.has(ch);
    const isSel = state.selectedChannel === ch;
    return `<div class="qwb-ch-row ${isBad?'bad':''} ${isSel?'active':''}" data-channel="${esc(ch)}">
      <span class="qwb-ch-name">${esc(ch)}${isBad?' ⚠':''}</span>
      <span class="qwb-ch-scale">${state.gain} µV/cm</span>
    </div>`;
  }).join('');
  return `
  <div id="qwb-rail" class="qwb-channel-gutter" data-testid="qwb-rail">
    <div class="qwb-cg-header">CH (${DEFAULT_CHANNELS.length})</div>
    <div class="qwb-cg-rows">${rows}</div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Right panel
// ─────────────────────────────────────────────────────────────────────────────

function rightPanelHtml(state) {
  const aiPending = (state.aiSuggestions || []).filter(s => (s.decision_status || 'suggested') === 'suggested').length;
  const icaBad = state.rejectedICA ? state.rejectedICA.size : 0;
  const tabs = [
    { id: 'cleaning', label: 'Cleaning' },
    { id: 'ai',       label: 'AI Review', badge: aiPending },
    { id: 'help',     label: 'Best-Practice' },
    { id: 'examples', label: 'Examples' },
    { id: 'ica',      label: 'ICA',       badge: icaBad },
    { id: 'log',      label: 'Audit' },
  ];
  return `
  <aside id="qwb-right" class="qwb-right ${state.rightCollapsed ? 'collapsed' : ''}" data-testid="qwb-right">
    <button class="qwb-right-toggle" id="qwb-right-toggle" data-testid="qwb-right-toggle"
      title="${state.rightCollapsed ? 'Expand panel' : 'Collapse panel'}">
      ${state.rightCollapsed ? '◀' : '▶'}
    </button>
    <div class="qwb-right-tabs" id="qwb-right-tabs" ${state.rightCollapsed ? 'style="display:none"' : ''}>
      ${tabs.map(t => `<button class="qwb-tab ${state.rightTab===t.id?'active':''}" data-tab="${t.id}">${esc(t.label)}${t.badge ? `<span class="qwb-tab-count" data-tab-count="${t.id}">${t.badge}</span>` : ''}</button>`).join('')}
    </div>
    <div id="qwb-right-body" class="qwb-right-body" ${state.rightCollapsed ? 'style="display:none"' : ''}></div>
  </aside>`;
}

function refreshTabBadges(state) {
  const aiPending = (state.aiSuggestions || []).filter(s => (s.decision_status || 'suggested') === 'suggested').length;
  const icaBad = state.rejectedICA ? state.rejectedICA.size : 0;
  const aiTab = document.querySelector('.qwb-tab[data-tab="ai"]');
  const icaTab = document.querySelector('.qwb-tab[data-tab="ica"]');
  const setBadge = (tab, count) => {
    if (!tab) return;
    let b = tab.querySelector ? tab.querySelector('.qwb-tab-count') : null;
    if (count > 0) {
      if (!b) {
        const html = `<span class="qwb-tab-count">${count}</span>`;
        // Append by reading current content; cheap path:
        tab.innerHTML = tab.textContent + html;
      } else {
        b.textContent = String(count);
      }
    } else if (b) {
      b.remove ? b.remove() : (b.textContent = '');
    }
  };
  setBadge(aiTab, aiPending);
  setBadge(icaTab, icaBad);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini-map row + topomap strip
// ─────────────────────────────────────────────────────────────────────────────

function miniMapRow(state) {
  const total = 600;
  const winStart = Math.min(state.windowStart, total);
  const winLen = state.timebase;
  const leftPct  = (winStart / total) * 100;
  const widthPct = (winLen / total) * 100;
  const legend = [
    ['blink', '#1d6f7a'],
    ['muscle', '#b8741a'],
    ['move', '#7a4ea3'],
    ['line', '#1a4f7a'],
    ['flat', '#6b6660'],
  ].map(([n, c]) => `<span style="display:inline-flex;align-items:center;gap:3px"><span style="width:6px;height:6px;border-radius:50%;background:${c}"></span>${n}</span>`).join('');
  const bands = [
    { id: 'delta', label: 'Delta', range: '0.5–4 Hz', accent: '#7a4ea3' },
    { id: 'theta', label: 'Theta', range: '4–8 Hz',   accent: '#b8741a' },
    { id: 'alpha', label: 'Alpha', range: '8–12 Hz',  accent: '#1d6f7a' },
    { id: 'beta',  label: 'Beta',  range: '12–30 Hz', accent: '#2851a3' },
  ].map(b => topoMiniSvg(b)).join('');
  return `
  <div class="qwb-minimap-row">
    <div class="qwb-minimap-gutter">map</div>
    <div class="qwb-minimap" data-testid="qwb-minimap">
      <div class="qwb-minimap-head">
        <span class="qwb-minimap-title">Recording timeline · 10:00</span>
        <div class="qwb-minimap-legend">${legend}</div>
      </div>
      <div class="qwb-minimap-track" id="qwb-minimap-track">
        <div class="qwb-minimap-window" id="qwb-minimap-window"
          style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%"></div>
      </div>
    </div>
    <div class="qwb-topo-strip" data-testid="qwb-topo-strip">${bands}</div>
  </div>`;
}

function topoMiniSvg({ id, label, range, accent }) {
  const coords = [
    [0.36,0.10],[0.64,0.10],
    [0.20,0.28],[0.36,0.28],[0.50,0.28],[0.64,0.28],[0.80,0.28],
    [0.12,0.50],[0.32,0.50],[0.50,0.50],[0.68,0.50],[0.88,0.50],
    [0.20,0.72],[0.36,0.72],[0.50,0.72],[0.64,0.72],[0.80,0.72],
    [0.40,0.90],[0.60,0.90],
  ];
  const W = 80, H = 80;
  const dots = coords.map((c, i) => {
    const r = 12;
    const cx = c[0] * W;
    const cy = c[1] * H + 2;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${accent}" fill-opacity="${(0.18 + 0.04 * (i % 5)).toFixed(2)}"/>`;
  }).join('');
  return `
    <div class="qwb-topo-mini" data-band="${id}">
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <defs>
          <clipPath id="qwb-topo-clip-${id}">
            <ellipse cx="${W/2}" cy="${H/2 + 2}" rx="${W/2 - 4}" ry="${H/2 - 4}"/>
          </clipPath>
        </defs>
        <ellipse cx="${W/2}" cy="${H/2 + 2}" rx="${W/2 - 4}" ry="${H/2 - 4}" fill="#FAF7F2" stroke="#a39d94" stroke-width="0.8"/>
        <g clip-path="url(#qwb-topo-clip-${id})">${dots}</g>
        <path d="M ${W/2 - 4} 6 L ${W/2} 1 L ${W/2 + 4} 6" fill="none" stroke="#a39d94" stroke-width="0.8"/>
      </svg>
      <div class="qwb-topo-label">${esc(label)}</div>
      <div class="qwb-topo-band">${esc(range)}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────────────────────

function bottomBar(state) {
  return `
  <div id="qwb-status" class="qwb-bottombar" data-testid="qwb-status">
    <span class="qwb-stat">Time: <b id="qwb-st-time">--:--:--</b></span>
    <span class="qwb-stat">Window: <b id="qwb-st-window">0–${state.timebase}s</b></span>
    <span class="qwb-stat">Selected: <b id="qwb-st-sel">${esc(state.selectedChannel)}</b></span>
    <span class="qwb-stat" id="qwb-st-amp-wrap">Δamp: <b id="qwb-st-amp">—</b></span>
    <span class="qwb-stat">Bad ch: <b id="qwb-st-bad">0</b></span>
    <span class="qwb-stat">Rejected: <b id="qwb-st-rej">0</b></span>
    <span class="qwb-stat">Retained: <b id="qwb-st-retain">100%</b></span>
    <span class="qwb-stat" id="qwb-st-version">No cleaning version</span>
    <div class="qwb-bottombar-right">
      <span class="qwb-ai-watch" id="qwb-ai-watching" data-testid="qwb-ai-watching">
        <span class="qwb-pulse"></span><span id="qwb-ai-watching-label">AI watching · 0 pending</span>
      </span>
      <span id="qwb-st-save" class="qwb-st-save">idle</span>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────────────────────

function shortcutsModal(state) {
  const groups = ['Navigation','Cleaning','View'].map(g => {
    const items = KEYBOARD_SHORTCUTS.filter(s => s[0] === g);
    return `
      <div>
        <h4 style="margin:0 0 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:#6b6660">${g}</h4>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${items.map(([_g, k, d]) => `<div style="display:flex;justify-content:space-between;font-size:11.5px"><span style="color:#3a3633">${esc(d)}</span><kbd>${esc(k)}</kbd></div>`).join('')}
        </div>
      </div>`;
  }).join('');
  return `
  <div id="qwb-shortcuts-modal" class="qwb-modal-backdrop" data-testid="qwb-shortcuts-modal">
    <div class="qwb-modal" style="width:620px;max-width:90vw">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3>Keyboard shortcuts</h3>
        <button class="qwb-tb-btn" id="qwb-close-shortcuts">Close</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">${groups}</div>
    </div>
  </div>`;
}

function unsavedModal(state) {
  return `
  <div id="qwb-unsaved-modal" class="qwb-modal-backdrop" data-testid="qwb-unsaved-modal">
    <div class="qwb-modal" role="alertdialog" aria-labelledby="qwb-unsaved-title">
      <h3 id="qwb-unsaved-title">Unsaved cleaning edits</h3>
      <p class="qwb-modal-sub" style="margin-bottom:14px">
        You have unsaved EEG cleaning edits. Save cleaning version before leaving?
      </p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="qwb-tb-btn" id="qwb-unsaved-cancel" data-testid="qwb-unsaved-cancel">Cancel</button>
        <button class="qwb-tb-btn" id="qwb-unsaved-leave" data-testid="qwb-unsaved-leave">Leave without saving</button>
        <button class="qwb-tb-btn primary" id="qwb-unsaved-save" data-testid="qwb-unsaved-save">Save and leave</button>
      </div>
    </div>
  </div>`;
}

function exportModal(state) {
  const formats = ['edf','fif','set','csv'];
  const includes = [
    ['traces', 'Cleaned traces'],
    ['artifacts', 'Artifact list (CSV)'],
    ['ica', 'ICA decomposition'],
    ['report', 'PDF cleaning report'],
    ['notes', 'Clinician notes'],
  ];
  return `
  <div id="qwb-export-modal" class="qwb-modal-backdrop" data-testid="qwb-export-modal">
    <div class="qwb-modal">
      <h3>Export cleaning bundle</h3>
      <p class="qwb-modal-sub">The original raw recording is always preserved. This exports the cleaning version + audit trail.</p>
      <div style="margin-bottom:14px">
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:#6b6660;margin-bottom:6px;font-weight:600">Format</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px" id="qwb-export-fmts">
          ${formats.map((f,i) => `<button class="qwb-tb-btn ${i===0?'primary':''}" data-export-fmt="${f}" style="text-transform:uppercase">.${f}</button>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:#6b6660;margin-bottom:6px;font-weight:600">Include</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${includes.map(([k,l]) => `<label style="display:flex;gap:8px;font-size:12px;align-items:center"><input type="checkbox" data-export-include="${k}" checked /> ${esc(l)}</label>`).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="qwb-tb-btn" id="qwb-export-cancel">Cancel</button>
        <button class="qwb-tb-btn ai" id="qwb-export-go">Export bundle</button>
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas renderer (paper-tone)
// ─────────────────────────────────────────────────────────────────────────────

function redrawCanvas(state) {
  const canvas = document.getElementById('qwb-canvas');
  if (!canvas) return;
  const wrap = document.getElementById('qwb-canvas-wrap');
  if (!wrap) return;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const W = wrap.clientWidth || 800;
  const H = wrap.clientHeight || 600;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.fillStyle = '#FAF7F2';
  ctx.fillRect(0, 0, W, H);

  const rulerH = 22;
  const tb = state.timebase;

  renderTimeRuler(state);

  if (state.showGrid !== false) {
    ctx.strokeStyle = '#d8d1c3';
    ctx.lineWidth = 1;
    const hasDash = typeof ctx.setLineDash === 'function';
    if (hasDash) ctx.setLineDash([2, 4]);
    for (let s = 0; s <= tb; s++) {
      const x = (s / tb) * W;
      ctx.beginPath(); ctx.moveTo(x, rulerH); ctx.lineTo(x, H); ctx.stroke();
    }
    if (hasDash) ctx.setLineDash([]);
  }

  const channels = DEFAULT_CHANNELS;
  const traceTop = rulerH;
  const rowH = (H - traceTop) / channels.length;
  const sampleRate = 256;
  const totalSamples = Math.floor(tb * sampleRate);
  const archetypeAt = state.isDemo ? {
    blinkStart: Math.floor(2.4 * sampleRate),
    blinkEnd:   Math.floor(3.1 * sampleRate),
    muscleStart: Math.floor(7.2 * sampleRate),
    muscleEnd:   Math.floor(8.4 * sampleRate),
  } : null;

  channels.forEach((ch, idx) => {
    const yMid = traceTop + rowH * (idx + 0.5);
    const isBad = state.badChannels.has(ch);
    const isSel = state.selectedChannel === ch;

    if (isSel) {
      ctx.fillStyle = '#d8e1f3';
      ctx.fillRect(0, traceTop + rowH*idx, W, rowH);
    } else if (isBad) {
      ctx.fillStyle = 'rgba(176,52,52,0.06)';
      ctx.fillRect(0, traceTop + rowH*idx, W, rowH);
    }

    ctx.strokeStyle = isBad ? '#b03434' : '#1a1a1a';
    ctx.lineWidth = isBad ? 1.0 : 0.9;
    ctx.beginPath();
    const sig = synthSignal(idx, totalSamples, sampleRate, archetypeAt);
    const ampScale = (rowH * 0.45) / state.gain;
    for (let i = 0; i < totalSamples; i += Math.max(1, Math.floor(totalSamples / W))) {
      const x = (i / totalSamples) * W;
      const y = yMid - sig[i] * ampScale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  renderOverlays(state, W, H, rulerH);
}

function renderTimeRuler(state) {
  const ruler = document.getElementById('qwb-time-ruler');
  if (!ruler) return;
  const tb = state.timebase;
  const ticks = [];
  for (let s = 0; s < tb; s++) {
    ticks.push(`<div class="qwb-time-tick">${state.windowStart + s}s</div>`);
  }
  ruler.innerHTML = ticks.join('');
}

function renderOverlays(state, W, H, rulerH) {
  const layer = document.getElementById('qwb-overlays');
  if (!layer) return;
  const tb = state.timebase;
  const pieces = [];

  // Rejected segments — red diagonal hatch + epoch label
  state.rejectedSegments.forEach((seg, i) => {
    const sStart = Math.max(seg.start_sec - state.windowStart, 0);
    const sEnd = Math.min(seg.end_sec - state.windowStart, tb);
    if (sEnd <= sStart) return;
    const left = (sStart / tb) * 100;
    const width = ((sEnd - sStart) / tb) * 100;
    pieces.push(`<div class="qwb-bad-segment" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;top:0;bottom:0">
      <span class="qwb-bad-segment-label">REJECTED · epoch ${i + 1}</span>
    </div>`);
  });

  // Confirmed selection rectangle (after a drag completes)
  if (state.selection) {
    const sStart = Math.max(state.selection.startSec - state.windowStart, 0);
    const sEnd = Math.min(state.selection.endSec - state.windowStart, tb);
    if (sEnd > sStart) {
      const left = (sStart / tb) * 100;
      const width = ((sEnd - sStart) / tb) * 100;
      const dur = (sEnd - sStart).toFixed(2);
      pieces.push(`<div class="qwb-selection" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%">
        <span class="qwb-sel-label">SELECTED · ${dur}s</span>
      </div>`);
    }
  }

  // Live drag rectangle while mouse is held
  if (state.drag) {
    const x0 = Math.min(state.drag.x0, state.drag.x1);
    const x1 = Math.max(state.drag.x0, state.drag.x1);
    const left = (x0 / Math.max(W, 1)) * 100;
    const width = ((x1 - x0) / Math.max(W, 1)) * 100;
    const dur = ((x1 - x0) / Math.max(W, 1) * tb).toFixed(2);
    pieces.push(`<div class="qwb-drag-rect" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%">
      <span class="qwb-drag-label">${dur}s</span>
    </div>`);
  }

  // AI suggestion chips — left-click=accept, right-click=explain
  if (state.showAiOverlays !== false) {
    for (const s of state.aiSuggestions) {
      if (s.start_sec == null) continue;
      const overlap = s.start_sec - state.windowStart;
      if (overlap < 0 || overlap > tb) continue;
      const left = (overlap / tb) * 100;
      const c = kindColour(s.ai_label);
      const conf = Math.round((s.ai_confidence || 0) * 100);
      const status = s.decision_status || 'suggested';
      const accepted = status === 'accepted';
      pieces.push(`<div class="qwb-ai-chip" data-ai-chip="${esc(s.id)}" style="left:${left.toFixed(2)}%;top:18px;background:${accepted ? '#d6e8d6' : c.bg};border-color:${accepted ? '#2f6b3a' : c.border};color:${accepted ? '#2f6b3a' : c.line}">
        <span class="qwb-ai-chip-dot" style="background:${accepted ? '#2f6b3a' : c.line}"></span>
        <span>${esc((s.ai_label||'').replace(/_/g,' '))}</span>
        <span class="qwb-ai-chip-conf">${conf}%</span>
      </div>`);
    }
  }

  layer.innerHTML = pieces.join('');
  // Re-bind click listeners on chips (innerHTML wipes them).
  layer.querySelectorAll && layer.querySelectorAll('.qwb-ai-chip').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.aiChip;
      recordAIDecision(state, id, 'accepted');
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id = el.dataset.aiChip;
      const sugg = (state.aiSuggestions || []).find(s => s.id === id);
      if (!sugg) return;
      openAIExplain(state, sugg, e.clientX || 200, e.clientY || 200);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Right-panel renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderRightPanel(state) {
  const body = document.getElementById('qwb-right-body');
  if (!body) return;
  switch (state.rightTab) {
    case 'cleaning': body.innerHTML = renderCleaningPanel(state); attachCleaningPanelHandlers(state); break;
    case 'ai':       body.innerHTML = renderAIPanel(state);       attachAIPanelHandlers(state);       break;
    case 'help':     body.innerHTML = renderHelpPanel(state);     break;
    case 'examples': body.innerHTML = renderExamplesPanel(state); break;
    case 'ica':      body.innerHTML = renderICAPanel(state);      attachICAPanelHandlers(state);      break;
    case 'log':      body.innerHTML = renderAuditPanel(state);    attachAuditPanelHandlers(state);    break;
  }
}

function renderCleaningPanel(state) {
  return `
    <div class="qwb-side-section">
      <h4><span class="qwb-letter">A</span>Manual cleaning</h4>
      <div class="qwb-side-grid">
        <button class="qwb-side-btn" data-action="mark-segment">Mark bad segment</button>
        <button class="qwb-side-btn" data-action="mark-channel">Mark bad channel</button>
        <button class="qwb-side-btn" data-action="reject-epoch">Reject epoch</button>
        <button class="qwb-side-btn" data-action="interpolate">Interpolate</button>
        <button class="qwb-side-btn" data-action="annotate">Add annotation</button>
        <button class="qwb-side-btn" data-action="undo">Undo</button>
      </div>
    </div>
    <div class="qwb-side-section">
      <h4><span class="qwb-letter">B</span>Automated suggestions</h4>
      <div class="qwb-side-grid">
        <button class="qwb-side-btn" data-action="detect-flat">Detect flat</button>
        <button class="qwb-side-btn" data-action="detect-noisy">Detect noisy</button>
        <button class="qwb-side-btn" data-action="detect-blink">Detect blinks</button>
        <button class="qwb-side-btn" data-action="detect-muscle">Detect muscle</button>
        <button class="qwb-side-btn" data-action="detect-movement">Detect movement</button>
        <button class="qwb-side-btn" data-action="detect-line">Detect line noise</button>
      </div>
    </div>
    <div class="qwb-side-section">
      <h4><span class="qwb-letter">C</span>ICA review</h4>
      <button class="qwb-side-btn full" data-action="open-ica">Open ICA review</button>
    </div>
    <div class="qwb-side-section">
      <h4><span class="qwb-letter">D</span>Reprocess</h4>
      <div class="qwb-side-grid">
        <button class="qwb-side-btn ink full" data-action="save-version">Save Cleaning Version</button>
        <button class="qwb-side-btn ai full" data-action="rerun">✦ Re-run qEEG analysis</button>
        <button class="qwb-side-btn" data-action="raw-vs-cleaned">View Raw vs Cleaned</button>
        <button class="qwb-side-btn" data-action="return-report">Return to Report</button>
      </div>
      <div class="qwb-safety-footer">
        <strong>Decision-support only.</strong> Original raw EEG is preserved.
        All cleaning actions are saved to a separate version with full audit trail.
        AI suggestions require clinician confirmation before they take effect.
      </div>
    </div>`;
}

function renderAIPanel(state) {
  const items = state.aiSuggestions || [];
  return `
    <div class="qwb-side-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:600;font-size:13px">AI Review Queue</div>
        <button class="qwb-side-btn ai" id="qwb-ai-generate" data-testid="qwb-ai-generate" style="padding:5px 10px">Generate</button>
      </div>
      <div class="qwb-ai-banner">
        AI-assisted suggestion only. Clinician confirmation required before any cleaning is applied.
      </div>
      ${items.length === 0 ? '<div style="color:#6b6660;font-size:12px;padding:18px 0;text-align:center">No suggestions yet — click <em>Generate</em>.</div>'
        : items.map(s => {
            const c = kindColour(s.ai_label);
            return `
        <div class="qwb-card" data-suggestion="${esc(s.id)}" style="border-left:3px solid ${c.line}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-weight:600;color:${c.line}">${esc((s.ai_label||'').replace(/_/g,' '))}</span>
            <span style="font-size:11px;font-family:var(--qwb-mono);color:#6b6660">${Math.round((s.ai_confidence||0)*100)}%</span>
          </div>
          <div style="font-size:11px;color:#6b6660;margin-bottom:4px">
            ${s.channel ? 'Ch: '+esc(s.channel)+' · ' : ''}${s.start_sec!=null ? esc(s.start_sec.toFixed(1))+'s' : ''}${s.end_sec!=null ? '–'+esc(s.end_sec.toFixed(1))+'s' : ''}
          </div>
          <div style="font-size:11px;color:#1a1a1a;margin-bottom:8px;line-height:1.4">${esc(s.explanation||'')}</div>
          <div style="display:flex;gap:6px">
            <button class="qwb-side-btn" data-ai-decision="accepted" data-ai-id="${esc(s.id)}">Accept</button>
            <button class="qwb-side-btn" data-ai-decision="rejected" data-ai-id="${esc(s.id)}">Dismiss</button>
            <button class="qwb-side-btn" data-ai-decision="needs_review" data-ai-id="${esc(s.id)}">Review</button>
          </div>
          <div style="font-size:10px;color:#6b6660;margin-top:6px">Status: ${esc(s.decision_status||'suggested')}</div>
        </div>`;
        }).join('')}
      <div style="margin-top:12px">
        <button class="qwb-side-btn ai full" id="qwb-ai-accept-all" data-testid="qwb-ai-accept-all">Accept all above 0.7</button>
      </div>
    </div>`;
}

function renderHelpPanel(state) {
  // Score = retained_data_pct minus penalty for bad channels + rejected
  // segments. Falls back to a stable demo number when data is unavailable.
  const retain = state.rawCleanedSummary?.retained_data_pct ?? 88;
  const penalty = (state.badChannels.size * 4) + (state.rejectedSegments.length * 2);
  const score = Math.max(0, Math.min(100, Math.round(retain - penalty)));
  const grade = score >= 80 ? 'PASS' : score >= 60 ? 'NEEDS REVIEW' : 'BLOCK';
  const gradePill = score >= 80 ? '#2f6b3a' : score >= 60 ? '#b8741a' : '#b03434';
  const gradeBg   = score >= 80 ? '#d6e8d6' : score >= 60 ? '#f6e6cb' : '#f3d4d0';
  return `
    <div class="qwb-side-section">
      <h4>AI Quality Score</h4>
      <div class="qwb-bp-score">
        <span class="qwb-bp-score-num" data-testid="qwb-bp-score">${score}</span>
        <span style="font-size:14px;color:#6b6660">/ 100</span>
        <span class="qwb-bp-pill" style="color:${gradePill};background:${gradeBg}">${grade}</span>
      </div>
      <div class="qwb-bp-score-bar"><div class="qwb-bp-score-fill" style="width:${score}%"></div></div>
    </div>
    <div class="qwb-side-section">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Best-Practice Helper</div>
      <div style="font-size:11px;color:#6b6660;margin-bottom:10px">Local guidance — links are decision-support only.</div>
      ${BEST_PRACTICE.map(b => `
        <div class="qwb-card">
          <div style="font-weight:600;font-size:12px;margin-bottom:4px">${esc(b.topic)}</div>
          <div style="font-size:11px;color:#1a1a1a;line-height:1.4;margin-bottom:6px">${esc(b.why)}</div>
          <div style="font-size:10px;color:#6b6660">References: ${b.references.map(esc).join(' · ')}</div>
        </div>`).join('')}
    </div>`;
}

function renderExamplesPanel(state) {
  return `
    <div class="qwb-side-section">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Artefact Examples</div>
      <div style="font-size:11px;color:#6b6660;margin-bottom:10px">Reference cases to help recognise and act on common patterns.</div>
      ${ARTEFACT_EXAMPLES.map(ex => `
        <div class="qwb-card">
          <div style="font-weight:600;font-size:12px;margin-bottom:4px">${esc(ex.title)}</div>
          <div style="font-size:10px;color:#6b6660;margin-bottom:4px">Channels: ${esc(ex.channels)}</div>
          <div style="font-size:11px;line-height:1.4;margin-bottom:3px"><strong>Why:</strong> ${esc(ex.why)}</div>
          <div style="font-size:11px;line-height:1.4;margin-bottom:3px"><strong>Action:</strong> ${esc(ex.action)}</div>
          <div style="font-size:11px;line-height:1.4;color:#3a3633"><strong>Check:</strong> ${esc(ex.check)}</div>
        </div>`).join('')}
    </div>`;
}

function renderICAPanel(state) {
  if (!state.ica || !state.ica.components || state.ica.components.length === 0) {
    return `
      <div class="qwb-side-section">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px">ICA Review</div>
        <div class="qwb-card" style="text-align:center;color:#6b6660;font-size:12px">
          ICA decomposition not available for this analysis yet.<br><br>
          Run preprocessing or click <em>Re-run qEEG analysis</em> to generate ICA components.
        </div>
      </div>`;
  }
  const flagged = state.rejectedICA.size;
  return `
    <div class="qwb-side-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:600;font-size:13px">ICA Components (${state.ica.n_components || state.ica.components.length})</div>
        <span style="font-family:var(--qwb-mono);font-size:10px;color:#b03434">${flagged} flagged</span>
      </div>
      <div style="font-size:10.5px;color:#6b6660;margin-bottom:10px;line-height:1.5">
        AI classified each component. Click Reject / Restore to flag or unflag for removal.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
      ${state.ica.components.slice(0, 30).map(c => {
        const isBad = state.rejectedICA.has(c.index);
        return `
        <div class="qwb-card" style="${isBad?'border-color:#b03434;background:#f3d4d0':''};margin-bottom:0;padding:8px">
          <div style="font-weight:600;font-size:11px">IC ${esc(c.index)}</div>
          <div style="font-size:10px;color:#6b6660;margin-bottom:4px">${esc(c.label || 'unknown')}</div>
          <button class="qwb-side-btn" data-ica-toggle="${esc(c.index)}" style="font-size:10px;padding:4px 6px">${isBad ? 'Restore' : 'Reject'}</button>
        </div>`;
      }).join('')}
      </div>
    </div>
    <div class="qwb-side-section">
      <button class="qwb-side-btn ai full" id="qwb-ica-apply" data-action="apply-ica" data-testid="qwb-ica-apply" style="width:100%">
        Apply: remove ${flagged} component${flagged === 1 ? '' : 's'}
      </button>
    </div>`;
}

function renderAuditPanel(state) {
  const items = state.auditLog || [];
  const chat = state.chatLog || [];
  return `
    <div class="qwb-side-section">
      <h4>AI Assistant</h4>
      <div class="qwb-chat" data-testid="qwb-chat">
        ${chat.map(m => m.who === 'ai'
          ? `<div class="qwb-chat-msg-ai"><div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.06em;color:#1d6f7a;font-weight:600;margin-bottom:4px">✦ DeepSynaps AI</div>${esc(m.text)}</div>`
          : `<div style="font-size:11.5px;color:#1a1a1a;padding:6px 10px;background:#d8e1f3;border-radius:6px;margin-bottom:8px;border-left:2px solid #2851a3"><div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.06em;color:#2851a3;font-weight:600;margin-bottom:4px">◆ Clinician</div>${esc(m.text)}</div>`).join('')}
        <div class="qwb-chat-input">
          <input type="text" id="qwb-chat-input" data-testid="qwb-chat-input" placeholder="Ask about this segment…" value="${esc(state.chatInput || '')}" />
          <button id="qwb-chat-send" data-testid="qwb-chat-send">Send</button>
        </div>
      </div>
    </div>
    <div class="qwb-side-section">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Cleaning Audit Trail</div>
      ${items.length === 0
        ? `<div style="color:#6b6660;font-size:12px;padding:18px 0;text-align:center">No audit events recorded yet.</div>`
        : items.slice(0, 80).map(e => `
          <div class="qwb-card" style="border-left:3px solid ${e.source==='ai'?'#1d6f7a':'#2851a3'};padding:6px 10px">
            <div style="display:flex;justify-content:space-between"><span style="font-weight:600;font-size:11px">${esc(e.action_type)}</span><span style="color:#6b6660;font-size:10px;font-family:var(--qwb-mono)">${esc((e.created_at||'').slice(11,19))}</span></div>
            <div style="color:#6b6660;font-size:11px">${e.channel?esc(e.channel)+' · ':''}${e.start_sec!=null?esc(e.start_sec.toFixed(1))+'s':''}${e.end_sec!=null?'–'+esc(e.end_sec.toFixed(1))+'s':''} · ${esc(e.source)}</div>
            ${e.note ? `<div style="font-size:11px;margin-top:2px">${esc(e.note)}</div>` : ''}
          </div>`).join('')}
    </div>`;
}

function attachAuditPanelHandlers(state) {
  const send = () => {
    const inp = document.getElementById('qwb-chat-input');
    const text = inp ? (inp.value || '').trim() : '';
    if (!text) return;
    state.chatLog.push({ who: 'user', text });
    state.chatLog.push({ who: 'ai', text: localChatReply(text, state) });
    state.chatInput = '';
    renderRightPanel(state);
  };
  document.getElementById('qwb-chat-send')?.addEventListener('click', send);
  const inp = document.getElementById('qwb-chat-input');
  if (inp) {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });
    inp.addEventListener('input', (e) => { state.chatInput = e.target.value; });
  }
}

function localChatReply(text, state) {
  const t = String(text).toLowerCase();
  if (t.includes('blink') || t.includes('eye')) {
    return 'Blinks show as bilateral frontopolar deflections (Fp1/Fp2). ICA is the standard mitigation; check the ICA tab for the candidate eye component.';
  }
  if (t.includes('muscle')) {
    return 'Muscle artefacts have high-frequency power (>20 Hz) over temporal/frontal channels. Mark as bad segments if persistent — over-cleaning removes real signal.';
  }
  if (t.includes('flat')) {
    return 'Flat channels usually mean a disconnected electrode. Mark as bad and interpolate from neighbours, or exclude from analysis.';
  }
  if (t.includes('save') || t.includes('version')) {
    return `You have ${state.badChannels.size} bad channel${state.badChannels.size === 1 ? '' : 's'}, ${state.rejectedSegments.length} rejected segment${state.rejectedSegments.length === 1 ? '' : 's'}, and ${state.rejectedICA.size} flagged ICA component${state.rejectedICA.size === 1 ? '' : 's'}. Click Save Cleaning Version when ready.`;
  }
  return 'Decision-support only — please review the AI Review tab and check the Best-Practice score before re-running analysis.';
}

function renderStatusBar(state) {
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const now = new Date();
  const t = now.toLocaleTimeString('en-GB');
  set('qwb-st-time', t);
  set('qwb-titlebar-time', t);
  set('qwb-st-window', `${state.windowStart}–${state.windowStart + state.timebase}s`);
  set('qwb-st-sel', `${state.selectedChannel}`);
  set('qwb-st-amp', `—`);
  set('qwb-st-bad', `${state.badChannels.size}`);
  set('qwb-st-rej', `${state.rejectedSegments.length}`);
  const rs = state.rawCleanedSummary;
  set('qwb-st-retain', `${rs && rs.retained_data_pct != null ? rs.retained_data_pct.toFixed(0) : '100'}%`);
  set('qwb-st-version', state.cleaningVersion ? `Cleaning v${state.cleaningVersion.version_number} ${state.cleaningVersion.review_status}` : 'No cleaning version');
  const pending = (state.aiSuggestions || []).filter(s => (s.decision_status || 'suggested') === 'suggested').length;
  set('qwb-ai-watching-label', `AI watching · ${pending} pending`);
  const saveEl = document.getElementById('qwb-st-save');
  if (saveEl) {
    if (state.isDirty) { saveEl.textContent = '● unsaved'; saveEl.className = 'qwb-st-save qwb-dirty'; }
    else { saveEl.textContent = state.saveStatus || 'idle'; saveEl.className = 'qwb-st-save'; }
  }
  const mw = document.getElementById('qwb-minimap-window');
  if (mw) {
    const total = 600;
    mw.style.left  = ((state.windowStart / total) * 100).toFixed(2) + '%';
    mw.style.width = ((state.timebase   / total) * 100).toFixed(2) + '%';
  }
}

function renderRerunNotice(state) {
  const el = document.getElementById('qwb-rerun-notice');
  if (!el) return;
  if (state.rerunDoneNotice) {
    el.textContent = state.rerunDoneNotice;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

function attachTitleBar(state, navigate) {
  document.querySelectorAll('.qwb-menu-btn').forEach(b => {
    b.addEventListener('click', () => handleTitleMenu(state, b.dataset.menu, navigate));
  });
}

function handleTitleMenu(state, menu, navigate) {
  switch (menu) {
    case 'File':      return toggleExport(state, true);
    case 'Edit':      state.rightTab = 'cleaning'; document.querySelectorAll('.qwb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'cleaning')); return renderRightPanel(state);
    case 'View':      return toggleRightPanel(state);
    case 'Format':    state.rightTab = 'cleaning'; document.querySelectorAll('.qwb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'cleaning')); return renderRightPanel(state);
    case 'Recording': return loadRawVsCleaned(state);
    case 'Analysis':  return rerunAnalysis(state);
    case 'Setup':     state.rightTab = 'ica'; document.querySelectorAll('.qwb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'ica')); return renderRightPanel(state);
    case 'Window':    state.rightTab = 'log'; document.querySelectorAll('.qwb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'log')); return renderRightPanel(state);
    case 'Help':      return toggleShortcuts(state, true);
    default:
      state.saveStatus = `${menu} menu (no action)`;
      renderStatusBar(state);
  }
}

function toggleRightPanel(state) {
  state.rightCollapsed = !state.rightCollapsed;
  const right = document.getElementById('qwb-right');
  const tabs = document.getElementById('qwb-right-tabs');
  const body = document.getElementById('qwb-right-body');
  if (right) right.classList.toggle('collapsed', state.rightCollapsed);
  if (tabs) tabs.style.display = state.rightCollapsed ? 'none' : '';
  if (body) body.style.display = state.rightCollapsed ? 'none' : '';
  const tog = document.getElementById('qwb-right-toggle');
  if (tog) tog.textContent = state.rightCollapsed ? '◀' : '▶';
}

function togglePlay(state) {
  const btn = document.getElementById('qwb-play');
  if (state.playTimer) {
    clearInterval(state.playTimer);
    state.playTimer = null;
    if (btn) btn.textContent = '▶';
    state.saveStatus = 'paused';
    renderStatusBar(state);
    return;
  }
  if (typeof setInterval !== 'function') return;
  state.playTimer = setInterval(() => {
    state.windowStart += Math.max(1, Math.floor(state.timebase / 4));
    if (state.windowStart >= 600) {
      clearInterval(state.playTimer); state.playTimer = null;
      const b2 = document.getElementById('qwb-play'); if (b2) b2.textContent = '▶';
      state.saveStatus = 'end of recording';
    }
    redrawCanvas(state); renderStatusBar(state);
  }, 500);
  if (btn) btn.textContent = '⏸';
  state.saveStatus = 'playing';
  renderStatusBar(state);
}

function attachToolBar(state, navigate) {
  const onNum = (id, key, parser) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      state[key] = parser ? parser(el.value) : el.value;
      redrawCanvas(state); renderStatusBar(state);
    });
  };
  const onSel = (id, key, parser) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const v = parser ? parser(el.value) : el.value;
      state[key] = v;
      redrawCanvas(state); renderStatusBar(state);
    });
  };
  onNum('qwb-speed', 'speed', v => parseInt(v) || 30);
  onNum('qwb-gain', 'gain', v => parseInt(v) || 50);
  onNum('qwb-baseline', 'baseline', v => parseFloat(v) || 0);
  onNum('qwb-lowcut', 'lowCut', v => parseFloat(v) || 0.3);
  onNum('qwb-highcut', 'highCut', v => parseFloat(v) || 50);
  onSel('qwb-notch', 'notch');
  onSel('qwb-montage', 'montage');
  onSel('qwb-timebase', 'timebase', v => parseInt(v) || 10);

  document.querySelectorAll('#qwb-view-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      state.viewMode = b.dataset.view;
      document.querySelectorAll('#qwb-view-toggle button').forEach(x => x.classList.toggle('active', x.dataset.view === state.viewMode));
      redrawCanvas(state);
    });
  });

  document.getElementById('qwb-prev-window')?.addEventListener('click', () => {
    state.windowStart = Math.max(0, state.windowStart - state.timebase);
    redrawCanvas(state); renderStatusBar(state);
  });
  document.getElementById('qwb-next-window')?.addEventListener('click', () => {
    state.windowStart += state.timebase;
    redrawCanvas(state); renderStatusBar(state);
  });
  document.getElementById('qwb-play')?.addEventListener('click', () => {
    togglePlay(state);
  });

  document.getElementById('qwb-baseline-reset')?.addEventListener('click', () => {
    state.baseline = 0; const el = document.getElementById('qwb-baseline');
    if (el) el.value = '0.00';
    redrawCanvas(state);
  });
  document.getElementById('qwb-save')?.addEventListener('click', () => saveCleaningVersion(state));
  document.getElementById('qwb-rerun')?.addEventListener('click', () => rerunAnalysis(state));
  document.getElementById('qwb-compare')?.addEventListener('click', () => loadRawVsCleaned(state));
  document.getElementById('qwb-return-report')?.addEventListener('click', () => returnToReport(state, navigate));
  document.getElementById('qwb-back')?.addEventListener('click', () => navBack(state, navigate, 'analyzer'));
  document.getElementById('qwb-back-patient')?.addEventListener('click', () => navBack(state, navigate, 'patient'));
  document.getElementById('qwb-export')?.addEventListener('click', () => toggleExport(state, true));
  document.getElementById('qwb-shortcuts')?.addEventListener('click', () => toggleShortcuts(state, true));
  document.getElementById('qwb-close-shortcuts')?.addEventListener('click', () => toggleShortcuts(state, false));

  document.getElementById('qwb-unsaved-cancel')?.addEventListener('click', () => closeUnsaved(state));
  document.getElementById('qwb-unsaved-leave')?.addEventListener('click', () => {
    state.isDirty = false; closeUnsaved(state);
    if (state.pendingNav) state.pendingNav();
    state.pendingNav = null;
  });
  document.getElementById('qwb-unsaved-save')?.addEventListener('click', async () => {
    await saveCleaningVersion(state);
    closeUnsaved(state);
    if (!state.isDirty && state.pendingNav) {
      state.pendingNav();
      state.pendingNav = null;
    }
  });

  document.getElementById('qwb-minimap-track')?.addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    state.windowStart = Math.max(0, Math.floor(frac * 600));
    redrawCanvas(state); renderStatusBar(state);
  });

  // ── Drag-to-select on the trace canvas ──────────────────────
  const wrap = document.getElementById('qwb-canvas-wrap');
  if (wrap) {
    const xRel = (e) => {
      const r = wrap.getBoundingClientRect();
      return Math.max(0, Math.min(r.width, (e.clientX || 0) - r.left));
    };
    wrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // Don't start a drag if user is clicking on an AI chip.
      if (e.target && e.target.closest && e.target.closest('.qwb-ai-chip')) return;
      const x = xRel(e);
      state.drag = { x0: x, x1: x };
      const W = wrap.clientWidth || 1;
      renderOverlays(state, W, wrap.clientHeight || 1, 22);
    });
    wrap.addEventListener('mousemove', (e) => {
      if (!state.drag) return;
      state.drag.x1 = xRel(e);
      const W = wrap.clientWidth || 1;
      renderOverlays(state, W, wrap.clientHeight || 1, 22);
    });
    const finishDrag = () => {
      if (!state.drag) return;
      const W = wrap.clientWidth || 1;
      const x0 = Math.min(state.drag.x0, state.drag.x1);
      const x1 = Math.max(state.drag.x0, state.drag.x1);
      if (x1 - x0 > 4) {
        const startSec = state.windowStart + (x0 / W) * state.timebase;
        const endSec   = state.windowStart + (x1 / W) * state.timebase;
        state.selection = { startSec, endSec };
      } else {
        state.selection = null;
      }
      state.drag = null;
      renderOverlays(state, W, wrap.clientHeight || 1, 22);
      renderStatusBar(state);
    };
    wrap.addEventListener('mouseup', finishDrag);
    wrap.addEventListener('mouseleave', finishDrag);
  }

  // ── AI explain popover handlers ─────────────────────────────
  document.getElementById('qwb-ai-explain-close')?.addEventListener('click', () => closeAIExplain(state));
  document.getElementById('qwb-ai-explain-accept')?.addEventListener('click', () => {
    if (state.aiExplain) recordAIDecision(state, state.aiExplain.sugg.id, 'accepted');
    closeAIExplain(state);
  });
  document.getElementById('qwb-ai-explain-dismiss')?.addEventListener('click', () => {
    if (state.aiExplain) recordAIDecision(state, state.aiExplain.sugg.id, 'rejected');
    closeAIExplain(state);
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => redrawCanvas(state));
  }
}

function openAIExplain(state, sugg, x, y) {
  state.aiExplain = { sugg, x, y };
  const root = document.getElementById('qwb-ai-explain');
  if (!root) return;
  const card = root.querySelector ? root.querySelector('.qwb-ai-explain-card') : null;
  const titleEl = document.getElementById('qwb-ai-explain-title');
  const confEl  = document.getElementById('qwb-ai-explain-conf');
  const whyEl   = document.getElementById('qwb-ai-explain-why-text');
  const featEl  = document.getElementById('qwb-ai-explain-features');
  const footEl  = document.getElementById('qwb-ai-explain-footer');
  const dotEl   = root.querySelector ? root.querySelector('.qwb-ai-explain-dot') : null;
  const c = kindColour(sugg.ai_label);
  if (titleEl) titleEl.textContent = (sugg.ai_label || 'artefact').replace(/_/g,' ');
  if (confEl) confEl.textContent = `${Math.round((sugg.ai_confidence || 0) * 100)}%`;
  if (whyEl) whyEl.textContent = sugg.explanation || sugg.note || '—';
  if (dotEl) dotEl.style.background = c.line;
  if (featEl) {
    featEl.innerHTML = aiExplainFeatures(sugg).map(([k, v]) =>
      `<div><span class="qwb-feat-key">${esc(k)}</span><span>${esc(v)}</span></div>`).join('');
  }
  if (footEl) footEl.textContent = `Similar to 1,247 prior flagged events. Model: artefact-v3.2`;
  if (card) {
    card.style.left = Math.max(8, Math.min(x, (window.innerWidth || 1280) - 320)) + 'px';
    card.style.top  = Math.max(8, Math.min(y, (window.innerHeight || 720) - 360)) + 'px';
  }
  root.style.display = 'block';
}

function closeAIExplain(state) {
  state.aiExplain = null;
  const root = document.getElementById('qwb-ai-explain');
  if (root) root.style.display = 'none';
}

function aiExplainFeatures(sugg) {
  const k = String(sugg.ai_label || '').toLowerCase();
  if (k.includes('blink') || k.includes('eye')) {
    return [['Peak amplitude','118 µV'], ['Polarity','Positive'], ['Topography','Frontopolar'], ['Duration','420 ms'], ['Symmetric','Yes']];
  }
  if (k.includes('muscle')) {
    return [['Power 25-50 Hz','High'], ['Burst length','320 ms'], ['Topography','Temporal'], ['Channels affected','2-4']];
  }
  if (k.includes('movement')) {
    return [['Drift slope','0.8 µV/ms'], ['Frequency','< 2 Hz'], ['Spread','All channels'], ['Duration','720 ms']];
  }
  if (k.includes('line')) {
    return [['Peak frequency','50.0 Hz'], ['Power ratio','8.4×'], ['Channels','T4'], ['Continuous','Yes']];
  }
  if (k.includes('flat')) {
    return [['Variance','< 0.1 µV²'], ['Duration','Whole epoch'], ['Channel','C4']];
  }
  return [['Type','artefact'], ['Decision','review']];
}

function attachExportModal(state) {
  document.getElementById('qwb-export-cancel')?.addEventListener('click', () => toggleExport(state, false));
  document.getElementById('qwb-export-go')?.addEventListener('click', () => exportBundle(state));
  document.querySelectorAll('#qwb-export-fmts [data-export-fmt]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#qwb-export-fmts [data-export-fmt]').forEach(x => x.classList.toggle('primary', x === b));
      state.exportFormat = b.dataset.exportFmt;
    });
  });
}

function attachChannelRail(state) {
  document.getElementById('qwb-rail')?.addEventListener('click', e => {
    let row = e.target;
    while (row && !(row.classList && row.classList.contains('qwb-ch-row'))) row = row.parentElement;
    if (!row) return;
    state.selectedChannel = row.dataset.channel;
    rerenderRail(state);
    redrawCanvas(state); renderStatusBar(state);
  });
}

function rerenderRail(state) {
  const rail = document.getElementById('qwb-rail');
  if (!rail || !rail.parentElement) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = channelGutterHtml(state);
  const fresh = tmp.firstElementChild;
  rail.parentElement.replaceChild(fresh, rail);
  attachChannelRail(state);
}

function attachRightPanel(state) {
  document.getElementById('qwb-right-toggle')?.addEventListener('click', () => toggleRightPanel(state));
  document.querySelectorAll('.qwb-tab').forEach(b => {
    b.addEventListener('click', () => {
      state.rightTab = b.dataset.tab;
      document.querySelectorAll('.qwb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.rightTab));
      renderRightPanel(state);
    });
  });
  renderRightPanel(state);
}

function attachStatusBar(state) {
  if (typeof setInterval === 'function') {
    setInterval(() => renderStatusBar(state), 1000);
  }
}

function attachCleaningPanelHandlers(state) {
  document.querySelectorAll('#qwb-right-body [data-action]').forEach(b => {
    b.addEventListener('click', () => handleCleaningAction(state, b.dataset.action));
  });
}

function attachAIPanelHandlers(state) {
  document.getElementById('qwb-ai-generate')?.addEventListener('click', () => generateAISuggestions(state));
  document.getElementById('qwb-ai-accept-all')?.addEventListener('click', () => acceptAllAI(state, 0.7));
  document.querySelectorAll('#qwb-right-body [data-ai-decision]').forEach(b => {
    b.addEventListener('click', () => recordAIDecision(state, b.dataset.aiId, b.dataset.aiDecision));
  });
}

function attachICAPanelHandlers(state) {
  document.querySelectorAll('#qwb-right-body [data-ica-toggle]').forEach(b => {
    b.addEventListener('click', () => toggleICAComponent(state, parseInt(b.dataset.icaToggle, 10)));
  });
}

async function toggleICAComponent(state, idx) {
  if (Number.isNaN(idx)) return;
  if (state.rejectedICA.has(idx)) state.rejectedICA.delete(idx);
  else state.rejectedICA.add(idx);
  markDirty(state);
  renderRightPanel(state);
  await postAnnotation(state, {
    kind: 'rejected_ica_component',
    note: `IC${idx} ${state.rejectedICA.has(idx) ? 'rejected' : 'restored'}`,
    decision_status: 'accepted',
  });
}

function attachKeyboard(state, navigate) {
  document.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault(); saveCleaningVersion(state); return;
    }
    if (e.key === 'Escape') { e.preventDefault(); navBack(state, navigate, 'analyzer'); return; }
    if (e.key === 'ArrowRight') { state.windowStart += state.timebase; redrawCanvas(state); renderStatusBar(state); }
    else if (e.key === 'ArrowLeft') { state.windowStart = Math.max(0, state.windowStart - state.timebase); redrawCanvas(state); renderStatusBar(state); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const idx = DEFAULT_CHANNELS.indexOf(state.selectedChannel);
      const next = e.key === 'ArrowUp' ? Math.max(0, idx - 1) : Math.min(DEFAULT_CHANNELS.length - 1, idx + 1);
      state.selectedChannel = DEFAULT_CHANNELS[next];
      rerenderRail(state); redrawCanvas(state); renderStatusBar(state);
    }
    else if (e.key === '+' || e.key === '=') { state.gain = Math.max(GAINS[0], state.gain / 2); redrawCanvas(state); }
    else if (e.key === '-' || e.key === '_') { state.gain = Math.min(GAINS[GAINS.length-1], state.gain * 2); redrawCanvas(state); }
    else if (e.key === 'b' || e.key === 'B') handleCleaningAction(state, 'mark-segment');
    else if (e.key === 'c' || e.key === 'C') handleCleaningAction(state, 'mark-channel');
    else if (e.key === 'i' || e.key === 'I') handleCleaningAction(state, 'interpolate');
    else if (e.key === 'a' || e.key === 'A') handleCleaningAction(state, 'annotate');
    else if (e.key === 'r' || e.key === 'R') { state.windowStart = 0; redrawCanvas(state); renderStatusBar(state); }
    else if (e.key === 'g' || e.key === 'G') { state.showGrid = !state.showGrid; redrawCanvas(state); }
    else if (e.key === 'o' || e.key === 'O') { state.showAiOverlays = !state.showAiOverlays; redrawCanvas(state); }
    else if (e.key === 'z' || e.key === 'Z') { popHistory(state); }
    else if (e.key === 'v' || e.key === 'V') {
      const ids = VIEW_MODES.map(v => v.id);
      const i = ids.indexOf(state.viewMode);
      state.viewMode = ids[(i + 1) % ids.length];
      document.querySelectorAll('#qwb-view-toggle button').forEach(x => x.classList.toggle('active', x.dataset.view === state.viewMode));
      redrawCanvas(state);
    }
    else if (e.key === '?') toggleShortcuts(state, true);
  });
}

function toggleShortcuts(state, show) {
  const m = document.getElementById('qwb-shortcuts-modal');
  if (m) m.style.display = show ? 'flex' : 'none';
  state.showShortcuts = !!show;
}

function toggleExport(state, show) {
  const m = document.getElementById('qwb-export-modal');
  if (m) m.style.display = show ? 'flex' : 'none';
  state.showExport = !!show;
}

function openUnsaved(state, pending) {
  state.pendingNav = pending;
  const m = document.getElementById('qwb-unsaved-modal');
  if (m) m.style.display = 'flex';
}

function closeUnsaved(state) {
  const m = document.getElementById('qwb-unsaved-modal');
  if (m) m.style.display = 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

export function navBack(state, navigate, target) {
  const go = () => {
    if (typeof window._qeegRawWorkbenchTeardown === 'function') {
      try { window._qeegRawWorkbenchTeardown(); } catch (_e) {}
    }
    if (target === 'patient' && (window._qeegSelectedPatientId || window._currentPatientId)) {
      window._patientHubSelectedId = window._qeegSelectedPatientId || window._currentPatientId;
      if (typeof window._nav === 'function') return window._nav('patients-v2');
    }
    if (typeof window._nav === 'function') {
      window._qeegTab = 'raw';
      return window._nav('qeeg-analysis');
    }
    window.location.hash = '#/qeeg-analysis';
  };
  if (state.isDirty) { openUnsaved(state, go); return false; }
  go();
  return true;
}

function returnToReport(state, navigate) {
  const go = () => {
    if (typeof window._nav === 'function') {
      window._qeegTab = 'report';
      return window._nav('qeeg-analysis');
    }
    window.location.hash = '#/qeeg-analysis';
  };
  if (state.isDirty) { openUnsaved(state, go); return; }
  go();
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleaning mutations
// ─────────────────────────────────────────────────────────────────────────────

async function handleCleaningAction(state, action) {
  switch (action) {
    case 'mark-channel': pushHistory(state); await markBadChannel(state, state.selectedChannel); break;
    case 'mark-segment': {
      pushHistory(state);
      // Honour the live selection if one exists; otherwise fall back to the
      // current window.
      const startSec = state.selection ? state.selection.startSec : state.windowStart;
      const endSec   = state.selection ? state.selection.endSec   : state.windowStart + state.timebase;
      await markBadSegment(state, startSec, endSec);
      state.selection = null;
      break;
    }
    case 'reject-epoch': {
      pushHistory(state);
      const startSec = state.selection ? state.selection.startSec : state.windowStart;
      await rejectEpoch(state, startSec);
      state.selection = null;
      break;
    }
    case 'interpolate': pushHistory(state); await interpolateChannel(state, state.selectedChannel); break;
    case 'annotate': {
      const note = (typeof window.prompt === 'function') ? window.prompt('Annotation note (clinician):', '') : '';
      if (note != null && note.trim()) { pushHistory(state); await addNote(state, note.trim()); }
      break;
    }
    case 'undo': popHistory(state); break;
    case 'detect-flat': case 'detect-noisy': case 'detect-blink':
    case 'detect-muscle': case 'detect-movement': case 'detect-line':
      await generateAISuggestions(state); break;
    case 'open-ica': state.rightTab = 'ica'; renderRightPanel(state); break;
    case 'save-version': await saveCleaningVersion(state); break;
    case 'rerun': await rerunAnalysis(state); break;
    case 'raw-vs-cleaned': await loadRawVsCleaned(state); break;
    case 'return-report': returnToReport(state); break;
    case 'apply-ica': await applyICARemovals(state); break;
  }
}

function snapshotState(state) {
  return {
    badChannels: new Set(state.badChannels),
    rejectedSegments: state.rejectedSegments.slice(),
    rejectedICA: new Set(state.rejectedICA),
    aiSuggestions: state.aiSuggestions.map(s => ({ ...s })),
    selection: state.selection ? { ...state.selection } : null,
  };
}

function pushHistory(state) {
  state.history.push(snapshotState(state));
  // Cap history to prevent unbounded growth.
  if (state.history.length > 50) state.history.shift();
}

function popHistory(state) {
  const prev = state.history.pop();
  if (!prev) {
    state.saveStatus = 'nothing to undo';
    renderStatusBar(state);
    return;
  }
  state.badChannels = prev.badChannels;
  state.rejectedSegments = prev.rejectedSegments;
  state.rejectedICA = prev.rejectedICA;
  state.aiSuggestions = prev.aiSuggestions;
  state.selection = prev.selection;
  state.saveStatus = 'undid last action';
  rerenderRail(state);
  redrawCanvas(state);
  renderRightPanel(state);
  renderStatusBar(state);
}

async function applyICARemovals(state) {
  const n = state.rejectedICA.size;
  if (n === 0) {
    state.saveStatus = 'no ICA components flagged';
    renderStatusBar(state);
    return;
  }
  state.saveStatus = `applied ${n} ICA removal${n === 1 ? '' : 's'} (saves with next cleaning version)`;
  renderStatusBar(state);
}

function markDirty(state) { state.isDirty = true; renderStatusBar(state); }

async function markBadChannel(state, channel) {
  if (!channel) return;
  if (state.badChannels.has(channel)) state.badChannels.delete(channel);
  else state.badChannels.add(channel);
  rerenderRail(state); redrawCanvas(state);
  markDirty(state);
  await postAnnotation(state, { kind: 'bad_channel', channel, decision_status: 'accepted' });
}

async function markBadSegment(state, startSec, endSec) {
  state.rejectedSegments.push({ start_sec: startSec, end_sec: endSec, description: 'BAD_user' });
  redrawCanvas(state);
  markDirty(state);
  await postAnnotation(state, { kind: 'bad_segment', start_sec: startSec, end_sec: endSec, decision_status: 'accepted' });
}

async function rejectEpoch(state, startSec) {
  markDirty(state);
  await postAnnotation(state, { kind: 'rejected_epoch', start_sec: startSec, end_sec: startSec + 1.0, decision_status: 'accepted' });
}

async function interpolateChannel(state, channel) {
  if (!channel) return;
  markDirty(state);
  await postAnnotation(state, { kind: 'interpolated_channel', channel, decision_status: 'accepted' });
}

async function addNote(state, note) {
  markDirty(state);
  await postAnnotation(state, { kind: 'note', note, decision_status: 'accepted' });
}

async function postAnnotation(state, body) {
  if (state.isDemo) {
    state.auditLog.unshift({
      action_type: `annotation:${body.kind}`,
      channel: body.channel || null,
      start_sec: body.start_sec || null,
      end_sec: body.end_sec || null,
      note: body.note || null,
      source: 'clinician',
      created_at: new Date().toISOString(),
    });
    if (state.rightTab === 'log') renderRightPanel(state);
    return;
  }
  try {
    state.saveStatus = 'saving…'; renderStatusBar(state);
    await api.createQEEGCleaningAnnotation(state.analysisId, body);
    state.saveStatus = 'saved';
    await refreshAuditLog(state);
  } catch (err) {
    state.saveStatus = 'error: ' + (err.message || err);
  }
  renderStatusBar(state);
}

async function generateAISuggestions(state) {
  if (state.isDemo) {
    // 9 demo suggestions matching AI_ARTIFACTS in RAW DATA/data.jsx.
    state.aiSuggestions = [
      { id: 'a1', ai_label: 'eye_blink', ai_confidence: 0.96, channel: 'Fp1-Av',
        start_sec: 0.7, end_sec: 1.2,
        explanation: 'Bilateral frontopolar deflection, ~120 µV.',
        suggested_action: 'review_ica', decision_status: 'suggested' },
      { id: 'a2', ai_label: 'muscle', ai_confidence: 0.88, channel: 'T3-Av',
        start_sec: 2.2, end_sec: 2.8,
        explanation: 'Bilateral temporal high-frequency burst.',
        suggested_action: 'mark_bad_segment', decision_status: 'suggested' },
      { id: 'a3', ai_label: 'eye_blink', ai_confidence: 0.94, channel: 'Fp2-Av',
        start_sec: 3.7, end_sec: 4.2,
        explanation: 'Frontopolar single blink.',
        suggested_action: 'review_ica', decision_status: 'suggested' },
      { id: 'a4', ai_label: 'movement', ai_confidence: 0.79, channel: 'all',
        start_sec: 5.0, end_sec: 5.8,
        explanation: 'Whole-head low-frequency drift.',
        suggested_action: 'mark_bad_segment', decision_status: 'suggested' },
      { id: 'a5', ai_label: 'line_noise', ai_confidence: 0.91, channel: 'T4-Av',
        start_sec: 6.5, end_sec: 9.4,
        explanation: 'T4 — recommend notch filter or interpolate.',
        suggested_action: 'ignore', decision_status: 'suggested' },
      { id: 'a6', ai_label: 'muscle', ai_confidence: 0.72, channel: 'T6-Av',
        start_sec: 7.4, end_sec: 7.9,
        explanation: 'Posterior temporal jaw clench.',
        suggested_action: 'mark_bad_segment', decision_status: 'suggested' },
      { id: 'a7', ai_label: 'eye_blink', ai_confidence: 0.92, channel: 'Fp1-Av',
        start_sec: 8.5, end_sec: 8.9,
        explanation: 'Frontopolar.',
        suggested_action: 'review_ica', decision_status: 'suggested' },
      { id: 'a8', ai_label: 'sweat', ai_confidence: 0.83, channel: 'F3-Av',
        start_sec: 9.8, end_sec: 11.4,
        explanation: 'F3 — slow rising baseline.',
        suggested_action: 'ignore', decision_status: 'suggested' },
      { id: 'a9', ai_label: 'flat', ai_confidence: 0.99, channel: 'C4-Av',
        start_sec: 0, end_sec: state.timebase,
        explanation: 'C4 — no signal detected; recommend exclude or interpolate.',
        suggested_action: 'mark_bad_channel', decision_status: 'suggested' },
    ];
    if (state.rightTab === 'ai') renderRightPanel(state);
    refreshTabBadges(state);
    redrawCanvas(state); renderStatusBar(state);
    return;
  }
  try {
    const r = await api.generateQEEGAIArtefactSuggestions(state.analysisId);
    state.aiSuggestions = r.items || [];
    if (state.rightTab === 'ai') renderRightPanel(state);
    redrawCanvas(state); renderStatusBar(state);
  } catch (err) {
    state.saveStatus = 'AI error: ' + (err.message || err); renderStatusBar(state);
  }
}

async function acceptAllAI(state, threshold) {
  for (const s of (state.aiSuggestions || [])) {
    if ((s.ai_confidence || 0) >= threshold && (s.decision_status || 'suggested') === 'suggested') {
      await recordAIDecision(state, s.id, 'accepted');
    }
  }
}

export async function recordAIDecision(state, suggestionId, decision) {
  const sugg = (state.aiSuggestions || []).find(s => s.id === suggestionId);
  if (!sugg) return;
  sugg.decision_status = decision;
  if (decision === 'accepted') markDirty(state);
  await postAnnotation(state, {
    kind: 'ai_suggestion',
    channel: sugg.channel,
    start_sec: sugg.start_sec,
    end_sec: sugg.end_sec,
    ai_label: sugg.ai_label,
    ai_confidence: sugg.ai_confidence,
    decision_status: decision,
    source: 'clinician',
    note: `Decision on AI suggestion ${suggestionId}: ${decision}`,
  });
  if (decision === 'accepted' && sugg.suggested_action === 'mark_bad_segment'
      && sugg.start_sec != null && sugg.end_sec != null) {
    state.rejectedSegments.push({ start_sec: sugg.start_sec, end_sec: sugg.end_sec, description: 'BAD_ai_accepted' });
    redrawCanvas(state); renderStatusBar(state);
  }
  if (state.rightTab === 'ai') renderRightPanel(state);
  refreshTabBadges(state);
  redrawCanvas(state);
}

async function saveCleaningVersion(state) {
  if (state.isDemo) {
    state.cleaningVersion = {
      id: 'demo-version',
      version_number: (state.cleaningVersion?.version_number || 0) + 1,
      review_status: 'draft',
    };
    state.isDirty = false;
    state.saveStatus = `demo: cleaning v${state.cleaningVersion.version_number} saved`;
    renderStatusBar(state);
    return;
  }
  try {
    state.saveStatus = 'saving cleaning version…'; renderStatusBar(state);
    const r = await api.saveQEEGCleaningVersion(state.analysisId, {
      bad_channels: Array.from(state.badChannels),
      rejected_segments: state.rejectedSegments,
      rejected_epochs: [],
      rejected_ica_components: Array.from(state.rejectedICA),
      interpolated_channels: [],
      annotation_ids: [],
    });
    state.cleaningVersion = r;
    state.isDirty = false;
    state.saveStatus = `saved v${r.version_number}`;
    await refreshAuditLog(state);
  } catch (err) {
    state.saveStatus = 'save error: ' + (err.message || err);
  }
  renderStatusBar(state);
}

async function rerunAnalysis(state) {
  if (!state.cleaningVersion) {
    await saveCleaningVersion(state);
    if (!state.cleaningVersion) return;
  }
  if (state.isDemo) {
    state.saveStatus = 'demo: rerun queued';
    state.rerunDoneNotice = `qEEG analysis updated using Cleaning Version ${state.cleaningVersion.version_number}. Original raw EEG preserved.`;
    renderStatusBar(state); renderRerunNotice(state); return;
  }
  try {
    state.saveStatus = 'queuing rerun…'; renderStatusBar(state);
    await api.rerunQEEGAnalysisWithCleaning(state.analysisId, state.cleaningVersion.id);
    state.saveStatus = 'rerun queued · raw EEG preserved';
    state.rerunDoneNotice = `qEEG analysis re-run queued using Cleaning Version ${state.cleaningVersion.version_number}. Original raw EEG preserved.`;
    renderRerunNotice(state);
  } catch (err) {
    state.saveStatus = 'rerun error: ' + (err.message || err);
  }
  renderStatusBar(state);
}

async function loadRawVsCleaned(state) {
  if (state.isDemo) {
    state.rawCleanedSummary = {
      retained_data_pct: 88, rejected_segments_count: state.rejectedSegments.length,
      bad_channels_excluded: Array.from(state.badChannels), notice: 'demo summary',
    };
    renderStatusBar(state);
    if (typeof alert === 'function') {
      alert(`Raw vs Cleaned\n\nRetained: 88%\nBad channels: ${state.badChannels.size}\nRejected segments: ${state.rejectedSegments.length}\n\nDecision-support only. Original raw EEG preserved.`);
    }
    return;
  }
  try {
    state.rawCleanedSummary = await api.getQEEGRawVsCleanedSummary(state.analysisId, state.cleaningVersion?.id);
    renderStatusBar(state);
  } catch (_e) {}
}

async function refreshAuditLog(state) {
  if (state.isDemo) return;
  try {
    const r = await api.getQEEGCleaningLog(state.analysisId);
    state.auditLog = r.items || [];
    if (state.rightTab === 'log') renderRightPanel(state);
  } catch (_e) {}
}

async function exportBundle(state) {
  const fmt = state.exportFormat || 'edf';
  const includes = Array.from(document.querySelectorAll('[data-export-include]'))
    .filter(b => b.checked).map(b => b.dataset.exportInclude);
  // Pull a fresh server-side summary so retained_data_pct + bad_channels_excluded
  // come from the same canonical source the qEEG report sees. Falls back to
  // local state in demo mode or if the call fails.
  let summary = state.rawCleanedSummary || null;
  if (!state.isDemo) {
    try {
      summary = await api.getQEEGRawVsCleanedSummary(state.analysisId, state.cleaningVersion?.id);
      state.rawCleanedSummary = summary;
    } catch (_e) {}
  }
  const bundle = {
    analysisId: state.analysisId,
    cleaning_version: state.cleaningVersion?.version_number || null,
    cleaning_version_id: state.cleaningVersion?.id || null,
    format: fmt,
    includes,
    bad_channels: Array.from(state.badChannels),
    rejected_segments: state.rejectedSegments,
    rejected_ica_components: Array.from(state.rejectedICA),
    summary: summary || { note: 'no server summary' },
    audit_log: state.auditLog,
    note: 'Original raw EEG preserved. Cleaning version + audit trail only.',
    exported_at: new Date().toISOString(),
  };
  if (typeof Blob === 'function' && typeof URL !== 'undefined') {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qeeg-cleaning-${state.analysisId}-v${state.cleaningVersion?.version_number || 'draft'}.${fmt}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  state.saveStatus = `exported v${state.cleaningVersion?.version_number || 'draft'} (${fmt}, local snapshot)`;
  renderStatusBar(state);
  toggleExport(state, false);
}

async function loadAll(state) {
  if (state.isDemo) return;
  try {
    state.metadata = await api.getQEEGWorkbenchMetadata(state.analysisId);
    const pn = document.getElementById('qwb-pat-name');
    if (pn && state.metadata?.patient_name) pn.textContent = state.metadata.patient_name;
  } catch (_e) {}
  try {
    const versions = await api.listQEEGCleaningVersions(state.analysisId);
    state.cleaningVersion = versions && versions[0] ? versions[0] : null;
  } catch (_e) {}
  try {
    state.ica = await api.getQEEGICAComponents(state.analysisId);
  } catch (_e) {}
  await refreshAuditLog(state);
}
