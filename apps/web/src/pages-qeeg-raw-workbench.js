// ─────────────────────────────────────────────────────────────────────────────
// Raw EEG Cleaning Workbench — clinical EEG workstation (WinEEG / EDFbrowser
// visual style: white background, black traces, light grey grid).
//
// Decision-support only. Original raw EEG is never overwritten — every
// cleaning action lives in a separate cleaning version with full audit
// trail. AI artefact suggestions require clinician confirmation before any
// cleaning is applied.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │ Top: ← Back · patient/session · controls · Save · Re-run · ?       │
//   ├──────────┬───────────────────────────────────┬───────────────────────┤
//   │ Channel  │     White EEG canvas              │   Right panel        │
//   │  rail    │     Black traces                  │   (collapsible)      │
//   │          │     Light grey grid               │   Cleaning · AI ·   │
//   │          │     Pale-blue selected row        │   Examples · etc.   │
//   │          │     Red overlay on rejected       │                     │
//   ├──────────┴───────────────────────────────────┴───────────────────────┤
//   │ Bottom: time | window | selected | Δamp | bad | rej | retain | ver │
//   └──────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';

export const DEFAULT_CHANNELS = [
  'Fp1-Av','Fp2-Av','F7-Av','F3-Av','Fz-Av','F4-Av','F8-Av',
  'T3-Av','C3-Av','Cz-Av','C4-Av','T4-Av',
  'T5-Av','P3-Av','Pz-Av','P4-Av','T6-Av',
  'O1-Av','O2-Av','ECG'
];

const SPEEDS = [15, 30, 60];
const GAINS = [25, 50, 100, 200];
const LOW_CUTS = [0.1, 0.3, 0.5, 1];
const HIGH_CUTS = [30, 45, 50, 70, 100];
const NOTCHES = ['Off', '50 Hz', '60 Hz', '45–55 Hz'];
const MONTAGES = ['Referential', 'Bipolar longitudinal', 'Bipolar transverse', 'Average reference', 'Laplacian'];
const VIEW_MODES = ['Raw', 'Cleaned', 'Overlay'];
const TIMEBASES = [5, 10, 15, 30];

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
  ['←/→', 'Previous / next time window'],
  ['↑/↓', 'Previous / next channel'],
  ['+ / −', 'Zoom in / out'],
  ['B', 'Mark selected channel as bad'],
  ['S', 'Mark current segment as bad'],
  ['A', 'Add annotation'],
  ['Cmd/Ctrl+S', 'Save cleaning version'],
  ['Z', 'Undo'],
  ['Shift+Z', 'Redo'],
  ['Space', 'Play / pause scroll'],
  ['R', 'Reset view'],
  ['Esc', 'Back / exit confirmation'],
  ['?', 'Show shortcuts'],
];

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
  const baseFreqAlpha = 9.5 + (channelIndex % 5) * 0.2;
  const baseFreqBeta = 18 + (channelIndex % 7);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let v = Math.sin(2 * Math.PI * baseFreqAlpha * t) * 18
          + Math.sin(2 * Math.PI * baseFreqBeta * t) * 6
          + (Math.random() - 0.5) * 14;
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
    lowCut: 0.5,
    highCut: 50,
    notch: '50 Hz',
    montage: 'Referential',
    viewMode: 'Raw',
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
    rightTab: 'cleaning',
    rightCollapsed: false,
    saveStatus: 'idle',
    metadata: null,
    ica: null,
    rawCleanedSummary: null,
    isDirty: false,
    pendingNav: null,
    rerunDoneNotice: null,
  };

  // Browser navigation guard for unsaved edits.
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
  attachTopBar(state, navigate);
  attachChannelRail(state);
  attachRightPanel(state);
  attachStatusBar(state);
  attachKeyboard(state, navigate);

  await loadAll(state);
  redrawCanvas(state);
  renderRightPanel(state);
  renderStatusBar(state);
  renderRerunNotice(state);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────

function workbenchShell(state) {
  return `
  <style>${clinicalCss()}</style>
  <div class="qwb-root qwb-clinical" data-testid="qwb-root">
    ${topBar(state)}
    <div class="qwb-body">
      ${channelRailHtml(state)}
      <div id="qwb-canvas-wrap" class="qwb-canvas-wrap">
        <div id="qwb-immutable-banner" class="qwb-immutable-notice">
          Original raw EEG preserved · Decision-support only
        </div>
        <canvas id="qwb-canvas" class="qwb-canvas-el"></canvas>
        <div id="qwb-rerun-notice" class="qwb-rerun-notice" style="display:none"></div>
      </div>
      ${rightPanelHtml(state)}
    </div>
    ${bottomBar(state)}
    ${shortcutsModal(state)}
    ${unsavedModal(state)}
  </div>`;
}

function clinicalCss() {
  // Single concentrated stylesheet so the workbench keeps a clinical look
  // regardless of the host theme. Class names are stable contracts that the
  // node-test suite asserts on.
  return `
    .qwb-clinical {
      position:fixed; inset:0; z-index:9000;
      display:flex; flex-direction:column;
      background:#ffffff; color:#1a1a1a;
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      font-size: 12px; line-height:1.3;
    }
    .qwb-topbar {
      display:flex; align-items:center; gap:12px;
      padding: 6px 12px;
      background:#f7f7f8; border-bottom:1px solid #cfd4da;
      height:46px; flex-shrink:0;
    }
    .qwb-back-cluster {
      display:flex; align-items:center; gap:8px;
      padding-right:12px; border-right:1px solid #d8dde3;
      min-width:0;
    }
    .qwb-back-btn {
      background:#ffffff; color:#1c4a8a;
      border:1px solid #b6c4d6; border-radius:4px;
      padding:5px 10px; font-size:12px; font-weight:600;
      cursor:pointer;
    }
    .qwb-back-btn:hover { background:#eef3fa; }
    .qwb-context {
      display:flex; flex-direction:column; gap:0; line-height:1.15;
    }
    .qwb-context-line { font-size:11px; color:#3a4150; }
    .qwb-context-meta { font-size:10px; color:#6b7280; }
    .qwb-controls { display:flex; align-items:center; gap:10px; flex-wrap:wrap; flex:1; min-width:0; }
    .qwb-ctrl { display:flex; align-items:center; gap:4px; font-size:11px; color:#3a4150; }
    .qwb-ctrl select {
      background:#ffffff; color:#1a1a1a;
      border:1px solid #b6c4d6; border-radius:3px;
      padding:3px 6px; font-size:12px;
    }
    .qwb-actions { display:flex; align-items:center; gap:6px; }
    .qwb-btn {
      background:#ffffff; color:#1a1a1a;
      border:1px solid #b6c4d6; border-radius:4px;
      padding:5px 10px; font-size:11px; font-weight:500;
      cursor:pointer;
    }
    .qwb-btn:hover { background:#f0f4f9; border-color:#92a3bb; }
    .qwb-btn-primary {
      background:#1c4a8a; color:#ffffff; border-color:#1c4a8a; font-weight:600;
    }
    .qwb-btn-primary:hover { background:#15396b; border-color:#15396b; }
    .qwb-help-btn {
      background:#eef3fa; color:#1c4a8a; border:1px solid #b6c4d6;
      border-radius:50%; width:26px; height:26px; padding:0;
      font-weight:700; font-size:13px; cursor:pointer;
    }
    .qwb-body { flex:1; display:flex; min-height:0; overflow:hidden; }
    .qwb-rail {
      width:130px; flex-shrink:0;
      background:#ffffff; border-right:1px solid #d8dde3;
      overflow-y:auto;
    }
    .qwb-rail-header {
      padding:8px 10px; font-size:10px; font-weight:700;
      letter-spacing:0.5px; text-transform:uppercase;
      color:#6b7280; border-bottom:1px solid #e6ebf2;
      background:#f7f7f8;
    }
    .qwb-ch {
      padding:6px 10px; border-bottom:1px solid #eff2f6;
      cursor:pointer; display:flex; flex-direction:column; gap:2px;
      color:#1a1a1a; background:#ffffff;
    }
    .qwb-ch.sel { background:#e8f0fb; color:#0c2f5c; }
    .qwb-ch.bad .qwb-ch-label { color:#b21f2d; font-weight:700; }
    .qwb-ch.hidden { color:#aab1bc; }
    .qwb-ch-label { font-size:12px; font-weight:600; }
    .qwb-ch-meta { font-size:10px; color:#6b7280; }
    .qwb-canvas-wrap {
      flex:1; position:relative;
      background:#ffffff;
      border-right:1px solid #d8dde3;
      overflow:hidden;
    }
    .qwb-canvas-el { display:block; width:100%; height:100%; background:#ffffff; }
    .qwb-immutable-notice {
      position:absolute; top:8px; right:8px;
      background:#ffffff; border:1px solid #cfd4da;
      padding:4px 8px; border-radius:3px;
      font-size:10px; color:#3a4150; z-index:5;
    }
    .qwb-rerun-notice {
      position:absolute; left:50%; top:14px; transform:translateX(-50%);
      background:#e8f0fb; border:1px solid #1c4a8a; color:#0c2f5c;
      padding:8px 14px; border-radius:4px; font-size:12px; z-index:6;
      box-shadow: 0 2px 8px rgba(28,74,138,0.10);
    }
    .qwb-right {
      width:360px; flex-shrink:0;
      background:#ffffff; border-left:1px solid #d8dde3;
      display:flex; flex-direction:column;
      transition: width 0.18s ease;
    }
    .qwb-right.collapsed { width:36px; }
    .qwb-right-toggle {
      width:36px; height:36px; padding:0; cursor:pointer;
      background:#f7f7f8; color:#3a4150;
      border:none; border-bottom:1px solid #d8dde3;
      font-size:14px; font-weight:700;
    }
    .qwb-right-tabs { display:flex; border-bottom:1px solid #d8dde3; background:#f7f7f8; }
    .qwb-tab {
      flex:1; padding:8px 4px;
      background:transparent; color:#6b7280;
      border:none; border-bottom:2px solid transparent;
      font-size:11px; font-weight:600; cursor:pointer;
    }
    .qwb-tab.active { color:#1c4a8a; border-bottom-color:#1c4a8a; background:#ffffff; }
    .qwb-right-body { flex:1; overflow-y:auto; padding:12px; }
    .qwb-bottombar {
      height:28px; flex-shrink:0;
      display:flex; align-items:center; gap:14px;
      padding:0 12px;
      background:#f7f7f8; border-top:1px solid #cfd4da;
      font-size:11px; color:#3a4150;
      font-family: 'SF Mono', ui-monospace, Menlo, monospace;
    }
    .qwb-bottombar .qwb-st-save { margin-left:auto; }
    .qwb-bottombar .qwb-dirty { color:#b27500; font-weight:600; }
    .qwb-modal-backdrop {
      position:fixed; inset:0; background:rgba(20,30,50,0.45);
      display:none; align-items:center; justify-content:center; z-index:9999;
    }
    .qwb-modal {
      background:#ffffff; color:#1a1a1a;
      border:1px solid #cfd4da; border-radius:6px;
      padding:20px; min-width:340px; max-width:520px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.18);
    }
    .qwb-modal h3 { margin:0 0 12px 0; font-size:15px; }
    .qwb-modal table { width:100%; font-size:12px; border-collapse:collapse; }
    .qwb-modal td { padding:4px 8px; }
    .qwb-section-label {
      font-size:10px; color:#6b7280; text-transform:uppercase;
      letter-spacing:0.5px; margin: 12px 0 6px 0; font-weight:700;
    }
    .qwb-card {
      border:1px solid #d8dde3; border-radius:4px; padding:10px;
      margin-bottom:8px; background:#ffffff;
    }
    .qwb-ai-banner {
      padding:8px 10px; background:#fff7e6;
      border:1px solid #d8a72a; border-radius:4px;
      font-size:11px; color:#7a4f00; margin-bottom:12px;
    }
    .qwb-safety-footer {
      margin-top:12px; padding:10px; background:#f0f4f9;
      border:1px solid #cfd4da; border-radius:4px;
      font-size:11px; color:#3a4150; line-height:1.5;
    }
  `;
}

function topBar(state) {
  const sel = (id, opts, val, label) => `
    <label class="qwb-ctrl">
      <span>${label}</span>
      <select id="${id}">
        ${opts.map(o => `<option value="${esc(o)}" ${String(o)===String(val)?'selected':''}>${esc(o)}</option>`).join('')}
      </select>
    </label>`;
  return `
  <div class="qwb-topbar" id="qwb-topbar">
    <div class="qwb-back-cluster" id="qwb-back-cluster">
      <button class="qwb-back-btn" id="qwb-back" data-testid="qwb-back-analyzer">← Back to qEEG Analyzer</button>
      <button class="qwb-btn" id="qwb-back-patient" data-testid="qwb-back-patient">Back to Patient</button>
      <div class="qwb-context" id="qwb-context">
        <span class="qwb-context-line" id="qwb-ctx-id">Analysis: <code>${esc((state.analysisId||'').slice(0, 12))}</code>${state.isDemo ? ' · DEMO' : ''}</span>
        <span class="qwb-context-meta" id="qwb-ctx-version">No cleaning version</span>
      </div>
    </div>
    <div class="qwb-controls">
      ${sel('qwb-speed', SPEEDS.map(s=>`${s} mm/s`), `${state.speed} mm/s`, 'Speed')}
      ${sel('qwb-gain', GAINS.map(g=>`${g} µV/cm`), `${state.gain} µV/cm`, 'Gain')}
      ${sel('qwb-lowcut', LOW_CUTS.map(c=>`${c} Hz`), `${state.lowCut} Hz`, 'Low cut')}
      ${sel('qwb-highcut', HIGH_CUTS.map(c=>`${c} Hz`), `${state.highCut} Hz`, 'High cut')}
      ${sel('qwb-notch', NOTCHES, state.notch, 'Notch')}
      ${sel('qwb-montage', MONTAGES, state.montage, 'Montage')}
      ${sel('qwb-view', VIEW_MODES, state.viewMode, 'View')}
      ${sel('qwb-timebase', TIMEBASES.map(t=>`${t} s`), `${state.timebase} s`, 'Timebase')}
    </div>
    <div class="qwb-actions">
      <button class="qwb-btn" id="qwb-baseline-reset">Reset baseline</button>
      <button class="qwb-btn" id="qwb-reset-view">Reset view</button>
      <button class="qwb-btn qwb-btn-primary" id="qwb-save" data-testid="qwb-save">Save Cleaning Version</button>
      <button class="qwb-btn qwb-btn-primary" id="qwb-rerun" data-testid="qwb-rerun">Re-run qEEG Analysis</button>
      <button class="qwb-btn" id="qwb-compare">Raw vs Cleaned</button>
      <button class="qwb-btn" id="qwb-return-report" data-testid="qwb-return-report">Return to qEEG Report</button>
      <button class="qwb-help-btn" id="qwb-shortcuts" title="Shortcuts (?)" data-testid="qwb-help">?</button>
    </div>
  </div>`;
}

function channelRailHtml(state) {
  const items = DEFAULT_CHANNELS.map(ch => {
    const isBad = state.badChannels.has(ch);
    const isSel = state.selectedChannel === ch;
    return `<div class="qwb-ch ${isBad?'bad':''} ${isSel?'sel':''}" data-channel="${esc(ch)}">
      <span class="qwb-ch-label">${esc(ch)}${isBad?' ⚠':''}</span>
      <span class="qwb-ch-meta">${state.gain} µV/cm${isBad?' · BAD':''}</span>
    </div>`;
  }).join('');
  return `
  <div id="qwb-rail" class="qwb-rail" data-testid="qwb-rail">
    <div class="qwb-rail-header">Channels (${DEFAULT_CHANNELS.length})</div>
    ${items}
  </div>`;
}

function rightPanelHtml(state) {
  const tabs = [
    { id: 'cleaning', label: 'Cleaning' },
    { id: 'ai', label: 'AI Review' },
    { id: 'help', label: 'Best-Practice' },
    { id: 'examples', label: 'Examples' },
    { id: 'ica', label: 'ICA' },
    { id: 'log', label: 'Audit' },
  ];
  return `
  <aside id="qwb-right" class="qwb-right ${state.rightCollapsed ? 'collapsed' : ''}" data-testid="qwb-right">
    <button class="qwb-right-toggle" id="qwb-right-toggle" data-testid="qwb-right-toggle"
      title="${state.rightCollapsed ? 'Expand panel' : 'Collapse panel'}">
      ${state.rightCollapsed ? '◀' : '▶'}
    </button>
    <div class="qwb-right-tabs" id="qwb-right-tabs" ${state.rightCollapsed ? 'style="display:none"' : ''}>
      ${tabs.map(t => `<button class="qwb-tab ${state.rightTab===t.id?'active':''}" data-tab="${t.id}">${esc(t.label)}</button>`).join('')}
    </div>
    <div id="qwb-right-body" class="qwb-right-body" ${state.rightCollapsed ? 'style="display:none"' : ''}></div>
  </aside>`;
}

function bottomBar(state) {
  return `
  <div id="qwb-status" class="qwb-bottombar" data-testid="qwb-status">
    <span id="qwb-st-time">--:--:--</span>
    <span id="qwb-st-window">Window 0–${state.timebase}s</span>
    <span id="qwb-st-sel">Selected: ${esc(state.selectedChannel)}</span>
    <span id="qwb-st-amp">Δamp: —</span>
    <span id="qwb-st-bad">Bad: 0</span>
    <span id="qwb-st-rej">Rejected: 0</span>
    <span id="qwb-st-retain">Retained: 100%</span>
    <span id="qwb-st-version">No cleaning version</span>
    <span id="qwb-st-save" class="qwb-st-save">idle</span>
  </div>`;
}

function shortcutsModal(state) {
  return `
  <div id="qwb-shortcuts-modal" class="qwb-modal-backdrop" data-testid="qwb-shortcuts-modal">
    <div class="qwb-modal">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3>Keyboard shortcuts</h3>
        <button class="qwb-btn" id="qwb-close-shortcuts">Close</button>
      </div>
      <table>
        ${KEYBOARD_SHORTCUTS.map(([k,v]) => `<tr><td style="color:#6b7280;font-family:'SF Mono',monospace">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
      </table>
    </div>
  </div>`;
}

function unsavedModal(state) {
  return `
  <div id="qwb-unsaved-modal" class="qwb-modal-backdrop" data-testid="qwb-unsaved-modal">
    <div class="qwb-modal" role="alertdialog" aria-labelledby="qwb-unsaved-title">
      <h3 id="qwb-unsaved-title">Unsaved cleaning edits</h3>
      <p style="font-size:12px;color:#3a4150;line-height:1.5;margin:0 0 14px 0">
        You have unsaved EEG cleaning edits. Save cleaning version before leaving?
      </p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="qwb-btn" id="qwb-unsaved-cancel" data-testid="qwb-unsaved-cancel">Cancel</button>
        <button class="qwb-btn" id="qwb-unsaved-leave" data-testid="qwb-unsaved-leave">Leave without saving</button>
        <button class="qwb-btn qwb-btn-primary" id="qwb-unsaved-save" data-testid="qwb-unsaved-save">Save and leave</button>
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas renderer (clinical white / black / grey)
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

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Light grey grid + grey time markers
  const tb = state.timebase;
  ctx.strokeStyle = '#eef0f3';
  ctx.lineWidth = 1;
  for (let s = 0; s <= tb; s++) {
    const x = (s / tb) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    if (s > 0) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(String(state.windowStart + s), x + 3, 12);
    }
  }

  // Pale-blue selected row + traces
  const channels = DEFAULT_CHANNELS;
  const rowH = (H - 20) / channels.length;
  const sampleRate = 256;
  const totalSamples = Math.floor(tb * sampleRate);
  const archetypeAt = state.isDemo ? {
    blinkStart: Math.floor(2.4 * sampleRate),
    blinkEnd: Math.floor(3.1 * sampleRate),
    muscleStart: Math.floor(7.2 * sampleRate),
    muscleEnd: Math.floor(8.4 * sampleRate),
  } : null;

  channels.forEach((ch, idx) => {
    const yMid = 20 + rowH * (idx + 0.5);
    const isBad = state.badChannels.has(ch);
    const isSel = state.selectedChannel === ch;

    if (isSel) {
      ctx.fillStyle = '#e8f0fb';
      ctx.fillRect(0, 20 + rowH*idx, W, rowH);
    }
    // Black trace; bad-channel traces in muted red
    ctx.strokeStyle = isBad ? '#b21f2d' : '#000000';
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

  // Rejected segments — transparent red overlay
  ctx.fillStyle = 'rgba(178,31,45,0.10)';
  for (const seg of state.rejectedSegments) {
    const overlapStart = Math.max(seg.start_sec - state.windowStart, 0);
    const overlapEnd = Math.min(seg.end_sec - state.windowStart, state.timebase);
    if (overlapEnd > overlapStart) {
      const x1 = (overlapStart / state.timebase) * W;
      const x2 = (overlapEnd / state.timebase) * W;
      ctx.fillRect(x1, 20, x2 - x1, H - 20);
    }
  }

  // AI suggestion markers — small amber ticks at top
  ctx.fillStyle = '#d8a72a';
  for (const s of state.aiSuggestions) {
    if (s.start_sec == null) continue;
    const overlap = s.start_sec - state.windowStart;
    if (overlap < 0 || overlap > state.timebase) continue;
    const x = (overlap / state.timebase) * W;
    ctx.fillRect(x - 2, 14, 4, 6);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Right panel renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderRightPanel(state) {
  const body = document.getElementById('qwb-right-body');
  if (!body) return;
  switch (state.rightTab) {
    case 'cleaning': body.innerHTML = renderCleaningPanel(state); attachCleaningPanelHandlers(state); break;
    case 'ai':       body.innerHTML = renderAIPanel(state);       attachAIPanelHandlers(state);       break;
    case 'help':     body.innerHTML = renderHelpPanel(state);     break;
    case 'examples': body.innerHTML = renderExamplesPanel(state); break;
    case 'ica':      body.innerHTML = renderICAPanel(state);      break;
    case 'log':      body.innerHTML = renderAuditPanel(state);    break;
  }
}

function renderCleaningPanel(state) {
  return `
    <div class="qwb-section-label">A. Manual cleaning</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <button class="qwb-btn" data-action="mark-segment">Mark bad segment</button>
      <button class="qwb-btn" data-action="mark-channel">Mark bad channel</button>
      <button class="qwb-btn" data-action="reject-epoch">Reject epoch</button>
      <button class="qwb-btn" data-action="interpolate">Interpolate</button>
      <button class="qwb-btn" data-action="annotate">Add annotation</button>
      <button class="qwb-btn" data-action="undo">Undo</button>
    </div>

    <div class="qwb-section-label">B. Automated suggestions</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <button class="qwb-btn" data-action="detect-flat">Detect flat</button>
      <button class="qwb-btn" data-action="detect-noisy">Detect noisy</button>
      <button class="qwb-btn" data-action="detect-blink">Detect blinks</button>
      <button class="qwb-btn" data-action="detect-muscle">Detect muscle</button>
      <button class="qwb-btn" data-action="detect-movement">Detect movement</button>
      <button class="qwb-btn" data-action="detect-line">Detect line noise</button>
    </div>

    <div class="qwb-section-label">C. ICA review</div>
    <button class="qwb-btn" data-action="open-ica" style="width:100%">Open ICA review</button>

    <div class="qwb-section-label">D. Reprocess (next steps)</div>
    <div style="display:grid;gap:6px">
      <button class="qwb-btn qwb-btn-primary" data-action="save-version">Save Cleaning Version</button>
      <button class="qwb-btn qwb-btn-primary" data-action="rerun">Re-run qEEG Analysis</button>
      <button class="qwb-btn" data-action="raw-vs-cleaned">View Raw vs Cleaned</button>
      <button class="qwb-btn" data-action="return-report">Return to qEEG Report</button>
    </div>

    <div class="qwb-safety-footer">
      <strong>Decision-support only.</strong> Original raw EEG is preserved.
      All cleaning actions are saved to a separate version with full audit trail.
      AI suggestions require clinician confirmation before they take effect.
    </div>`;
}

function renderAIPanel(state) {
  const items = state.aiSuggestions || [];
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:600;font-size:13px">AI Review Queue</div>
      <button class="qwb-btn qwb-btn-primary" id="qwb-ai-generate">Generate suggestions</button>
    </div>
    <div class="qwb-ai-banner">
      AI-assisted suggestion only. Clinician confirmation required before any cleaning is applied.
    </div>
    ${items.length === 0 ? '<div style="color:#6b7280;font-size:12px;padding:18px 0;text-align:center">No suggestions yet — click <em>Generate suggestions</em>.</div>'
      : items.map(s => `
      <div class="qwb-card" data-suggestion="${esc(s.id)}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-weight:600;color:#7a4f00">${esc((s.ai_label||'').replace('_',' '))}</span>
          <span style="font-size:11px;color:#6b7280">conf ${esc((s.ai_confidence*100||0).toFixed(0))}%</span>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:4px">
          ${s.channel ? 'Ch: '+esc(s.channel)+' · ' : ''}${s.start_sec!=null ? esc(s.start_sec.toFixed(1))+'s' : ''}${s.end_sec!=null ? '–'+esc(s.end_sec.toFixed(1))+'s' : ''}
        </div>
        <div style="font-size:11px;color:#1a1a1a;margin-bottom:8px;line-height:1.4">${esc(s.explanation||'')}</div>
        <div style="display:flex;gap:6px">
          <button class="qwb-btn" data-ai-decision="accepted" data-ai-id="${esc(s.id)}">Accept</button>
          <button class="qwb-btn" data-ai-decision="rejected" data-ai-id="${esc(s.id)}">Reject</button>
          <button class="qwb-btn" data-ai-decision="needs_review" data-ai-id="${esc(s.id)}">Needs review</button>
        </div>
        <div style="font-size:10px;color:#6b7280;margin-top:6px">Suggested action: ${esc(s.suggested_action||'review')} · status: ${esc(s.decision_status||'suggested')}</div>
      </div>`).join('')}`;
}

function renderHelpPanel(state) {
  return `
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Best-Practice Helper</div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:10px">Local guidance — links are decision-support only.</div>
    ${BEST_PRACTICE.map(b => `
      <div class="qwb-card">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px">${esc(b.topic)}</div>
        <div style="font-size:11px;color:#1a1a1a;line-height:1.4;margin-bottom:6px">${esc(b.why)}</div>
        <div style="font-size:10px;color:#6b7280">References: ${b.references.map(esc).join(' · ')}</div>
      </div>`).join('')}`;
}

function renderExamplesPanel(state) {
  return `
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Artefact Examples</div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:10px">Reference cases to help recognise and act on common patterns.</div>
    ${ARTEFACT_EXAMPLES.map(ex => `
      <div class="qwb-card">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px">${esc(ex.title)}</div>
        <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Channels: ${esc(ex.channels)}</div>
        <div style="font-size:11px;line-height:1.4;margin-bottom:3px"><strong>Why:</strong> ${esc(ex.why)}</div>
        <div style="font-size:11px;line-height:1.4;margin-bottom:3px"><strong>Action:</strong> ${esc(ex.action)}</div>
        <div style="font-size:11px;line-height:1.4;color:#3a4150"><strong>Check:</strong> ${esc(ex.check)}</div>
      </div>`).join('')}`;
}

function renderICAPanel(state) {
  if (!state.ica || !state.ica.components || state.ica.components.length === 0) {
    return `
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">ICA Review</div>
      <div class="qwb-card" style="text-align:center;color:#6b7280;font-size:12px">
        ICA decomposition not available for this analysis yet.<br><br>
        Run preprocessing or click <em>Re-run qEEG analysis</em> to generate ICA components.
      </div>`;
  }
  return `
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">ICA Components (${state.ica.n_components || state.ica.components.length})</div>
    ${state.ica.components.slice(0, 30).map(c => `
      <div class="qwb-card" style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:600;font-size:12px">IC ${esc(c.index)}</div>
          <div style="font-size:10px;color:#6b7280">${esc(c.label || 'unknown')}</div>
        </div>
        <button class="qwb-btn" data-ica-toggle="${esc(c.index)}">${state.rejectedICA.has(c.index) ? 'Restore' : 'Reject'}</button>
      </div>`).join('')}`;
}

function renderAuditPanel(state) {
  const items = state.auditLog || [];
  if (items.length === 0) {
    return `<div style="color:#6b7280;font-size:12px;padding:18px 0;text-align:center">No audit events recorded yet.</div>`;
  }
  return `
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Cleaning Audit Trail</div>
    ${items.slice(0, 80).map(e => `
      <div class="qwb-card" style="border-left:3px solid ${e.source==='ai'?'#d8a72a':'#1c4a8a'};padding:6px 10px">
        <div style="display:flex;justify-content:space-between"><span style="font-weight:600;font-size:11px">${esc(e.action_type)}</span><span style="color:#6b7280;font-size:10px">${esc((e.created_at||'').slice(11,19))}</span></div>
        <div style="color:#6b7280;font-size:11px">${e.channel?esc(e.channel)+' · ':''}${e.start_sec!=null?esc(e.start_sec.toFixed(1))+'s':''}${e.end_sec!=null?'–'+esc(e.end_sec.toFixed(1))+'s':''} · ${esc(e.source)}</div>
        ${e.note ? `<div style="font-size:11px;margin-top:2px">${esc(e.note)}</div>` : ''}
      </div>`).join('')}`;
}

function renderStatusBar(state) {
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const now = new Date();
  set('qwb-st-time', now.toLocaleTimeString('en-GB'));
  set('qwb-st-window', `Window ${state.windowStart}–${state.windowStart + state.timebase}s`);
  set('qwb-st-sel', `Selected: ${state.selectedChannel}`);
  set('qwb-st-amp', `Δamp: —`);
  set('qwb-st-bad', `Bad: ${state.badChannels.size}`);
  set('qwb-st-rej', `Rejected: ${state.rejectedSegments.length}`);
  const rs = state.rawCleanedSummary;
  set('qwb-st-retain', `Retained: ${rs && rs.retained_data_pct != null ? rs.retained_data_pct.toFixed(0) : '100'}%`);
  set('qwb-st-version', state.cleaningVersion ? `Cleaning v${state.cleaningVersion.version_number} ${state.cleaningVersion.review_status}` : 'No cleaning version');
  const saveEl = document.getElementById('qwb-st-save');
  if (saveEl) {
    if (state.isDirty) { saveEl.textContent = '● unsaved edits'; saveEl.className = 'qwb-st-save qwb-dirty'; }
    else { saveEl.textContent = state.saveStatus || 'idle'; saveEl.className = 'qwb-st-save'; }
  }
  const ctxVer = document.getElementById('qwb-ctx-version');
  if (ctxVer) ctxVer.textContent = state.cleaningVersion
    ? `Cleaning v${state.cleaningVersion.version_number}`
    : 'No cleaning version';
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

function attachTopBar(state, navigate) {
  const onSel = (id, key, parser) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      state[key] = parser ? parser(el.value) : el.value;
      redrawCanvas(state); renderStatusBar(state);
    });
  };
  onSel('qwb-speed', 'speed', v => parseInt(v));
  onSel('qwb-gain', 'gain', v => parseInt(v));
  onSel('qwb-lowcut', 'lowCut', v => parseFloat(v));
  onSel('qwb-highcut', 'highCut', v => parseFloat(v));
  onSel('qwb-notch', 'notch');
  onSel('qwb-montage', 'montage');
  onSel('qwb-view', 'viewMode');
  onSel('qwb-timebase', 'timebase', v => parseInt(v));

  document.getElementById('qwb-baseline-reset')?.addEventListener('click', () => redrawCanvas(state));
  document.getElementById('qwb-reset-view')?.addEventListener('click', () => {
    state.windowStart = 0; state.timebase = 10;
    redrawCanvas(state); renderStatusBar(state);
  });
  document.getElementById('qwb-save')?.addEventListener('click', () => saveCleaningVersion(state));
  document.getElementById('qwb-rerun')?.addEventListener('click', () => rerunAnalysis(state));
  document.getElementById('qwb-compare')?.addEventListener('click', () => loadRawVsCleaned(state));
  document.getElementById('qwb-return-report')?.addEventListener('click', () => returnToReport(state, navigate));
  document.getElementById('qwb-back')?.addEventListener('click', () => navBack(state, navigate, 'analyzer'));
  document.getElementById('qwb-back-patient')?.addEventListener('click', () => navBack(state, navigate, 'patient'));

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

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => redrawCanvas(state));
  }
}

function attachChannelRail(state) {
  document.getElementById('qwb-rail')?.addEventListener('click', e => {
    let row = e.target;
    while (row && !(row.classList && row.classList.contains('qwb-ch'))) row = row.parentElement;
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
  tmp.innerHTML = channelRailHtml(state);
  const fresh = tmp.firstElementChild;
  rail.parentElement.replaceChild(fresh, rail);
  attachChannelRail(state);
}

function attachRightPanel(state) {
  document.getElementById('qwb-right-toggle')?.addEventListener('click', () => {
    state.rightCollapsed = !state.rightCollapsed;
    const right = document.getElementById('qwb-right');
    const tabs = document.getElementById('qwb-right-tabs');
    const body = document.getElementById('qwb-right-body');
    if (right) right.classList.toggle('collapsed', state.rightCollapsed);
    if (tabs) tabs.style.display = state.rightCollapsed ? 'none' : '';
    if (body) body.style.display = state.rightCollapsed ? 'none' : '';
    const tog = document.getElementById('qwb-right-toggle');
    if (tog) tog.textContent = state.rightCollapsed ? '◀' : '▶';
  });
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
  document.querySelectorAll('#qwb-right-body [data-ai-decision]').forEach(b => {
    b.addEventListener('click', () => recordAIDecision(state, b.dataset.aiId, b.dataset.aiDecision));
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
    else if (e.key === 'b' || e.key === 'B') handleCleaningAction(state, 'mark-channel');
    else if (e.key === 's' || e.key === 'S') handleCleaningAction(state, 'mark-segment');
    else if (e.key === 'a' || e.key === 'A') handleCleaningAction(state, 'annotate');
    else if (e.key === 'r' || e.key === 'R') { state.windowStart = 0; redrawCanvas(state); renderStatusBar(state); }
    else if (e.key === '?') toggleShortcuts(state, true);
  });
}

function toggleShortcuts(state, show) {
  const m = document.getElementById('qwb-shortcuts-modal');
  if (m) m.style.display = show ? 'flex' : 'none';
  state.showShortcuts = !!show;
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
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

async function handleCleaningAction(state, action) {
  switch (action) {
    case 'mark-channel': await markBadChannel(state, state.selectedChannel); break;
    case 'mark-segment': await markBadSegment(state, state.windowStart, state.windowStart + state.timebase); break;
    case 'reject-epoch': await rejectEpoch(state, state.windowStart); break;
    case 'interpolate': await interpolateChannel(state, state.selectedChannel); break;
    case 'annotate': {
      const note = (typeof window.prompt === 'function') ? window.prompt('Annotation note (clinician):', '') : '';
      if (note != null && note.trim()) await addNote(state, note.trim());
      break;
    }
    case 'undo': state.saveStatus = 'undo not yet wired'; renderStatusBar(state); break;
    case 'detect-flat': case 'detect-noisy': case 'detect-blink':
    case 'detect-muscle': case 'detect-movement': case 'detect-line':
      await generateAISuggestions(state); break;
    case 'open-ica': state.rightTab = 'ica'; renderRightPanel(state); break;
    case 'save-version': await saveCleaningVersion(state); break;
    case 'rerun': await rerunAnalysis(state); break;
    case 'raw-vs-cleaned': await loadRawVsCleaned(state); break;
    case 'return-report': returnToReport(state); break;
  }
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
    state.aiSuggestions = [
      { id: 'demo-1', ai_label: 'eye_blink', ai_confidence: 0.78, channel: 'Fp1-Av',
        start_sec: 2.4, end_sec: 3.1,
        explanation: 'Frontal high-amplitude deflection lasting <1s consistent with eye-blink artefact.',
        suggested_action: 'review_ica', decision_status: 'suggested' },
      { id: 'demo-2', ai_label: 'muscle', ai_confidence: 0.65, channel: 'T3-Av',
        start_sec: 7.2, end_sec: 8.4,
        explanation: 'High-frequency burst over temporal channel suggests muscle contamination.',
        suggested_action: 'mark_bad_segment', decision_status: 'suggested' },
      { id: 'demo-3', ai_label: 'line_noise', ai_confidence: 0.55, channel: null,
        start_sec: 0, end_sec: null,
        explanation: 'Narrow spectral peak near power-line frequency. Confirm notch filter is active.',
        suggested_action: 'ignore', decision_status: 'suggested' },
    ];
    if (state.rightTab === 'ai') renderRightPanel(state);
    return;
  }
  try {
    const r = await api.generateQEEGAIArtefactSuggestions(state.analysisId);
    state.aiSuggestions = r.items || [];
    if (state.rightTab === 'ai') renderRightPanel(state);
  } catch (err) {
    state.saveStatus = 'AI error: ' + (err.message || err); renderStatusBar(state);
  }
}

async function recordAIDecision(state, suggestionId, decision) {
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

async function loadAll(state) {
  if (state.isDemo) return;
  try {
    state.metadata = await api.getQEEGWorkbenchMetadata(state.analysisId);
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
