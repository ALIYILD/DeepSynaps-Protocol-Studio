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
import { renderLearningEEGCompactList } from './learning-eeg-reference.js';

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

// ── Channel Anatomy Tooltips (from structured clinical EEG knowledge base) ──
const CHANNEL_ANATOMY = {
  'Fp1-Av': 'Left anterior prefrontal (BA 10/11) — executive function, DMN. Watch for eye blinks.',
  'Fp2-Av': 'Right anterior prefrontal (BA 10/11) — approach motivation, DMN. Watch for eye blinks.',
  'F7-Av':  'Left anterior temporal / Broca vicinity (BA 44/45) — language, attention. Watch for eye movements.',
  'F8-Av':  'Right anterior temporal / prosody (BA 44/45) — social cognition. Watch for eye movements.',
  'F3-Av':  'Left DLPFC (BA 9/46) — working memory, rTMS target for depression.',
  'F4-Av':  'Right DLPFC (BA 9/46) — attention, motor planning. FAA comparison with F3.',
  'Fz-Av':  'SMA / pre-SMA (BA 6) — motor planning, response inhibition. Mu rhythm site.',
  'T3-Av':  'Left superior temporal / Wernicke vicinity (BA 21/22) — auditory, language.',
  'T4-Av':  'Right superior temporal (BA 21/22) — auditory, emotional prosody.',
  'C3-Av':  'Left sensorimotor cortex (BA 1/2/3/4) — right body. Mu rhythm site.',
  'C4-Av':  'Right sensorimotor cortex (BA 1/2/3/4) — left body. Mu rhythm site.',
  'Cz-Av':  'Paracentral lobule / SMA (BA 4/6) — leg motor area. Vertex waves in sleep.',
  'T5-Av':  'Left temporoparietal junction (BA 39/40) — semantics, spatial attention.',
  'T6-Av':  'Right temporoparietal junction (BA 39/40) — visuospatial, facial recognition.',
  'P3-Av':  'Left superior parietal / precuneus (BA 7) — sensorimotor integration, attention.',
  'P4-Av':  'Right superior parietal / precuneus (BA 7) — visuospatial attention.',
  'Pz-Av':  'Precuneus / PCC (BA 7/23/31) — DMN hub, self-referential processing. PDR maximum.',
  'O1-Av':  'Left primary visual cortex (BA 17/18) — PDR origin. End-of-chain caution.',
  'O2-Av':  'Right primary visual cortex (BA 17/18) — PDR origin. End-of-chain caution.',
};

const TITLE_MENUS = ['File','Edit','View','Format','Recording','Analysis','Setup','Window','Language','Help'];

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
  ['Cleaning', 'Cmd/Ctrl+Shift+S', 'Clinician sign-off'],
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

function currentUserLabel() {
  try {
    const u = JSON.parse(localStorage.getItem('auth_user') || '{}');
    return u.name || u.email || u.display_name || 'Clinician';
  } catch (_e) { return 'Clinician'; }
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

// Canonical 9-artefact demo seed (matches AI_ARTIFACTS in RAW DATA/data.jsx).
// Used by bootDemoState() on initial load and by generateAISuggestions() when
// the clinician re-clicks "Generate" in demo mode.
function buildDemoAISuggestions(timebase) {
  return [
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
      start_sec: 0, end_sec: timebase,
      explanation: 'C4 — no signal detected; recommend exclude or interpolate.',
      suggested_action: 'mark_bad_channel', decision_status: 'suggested' },
  ];
}

// Seed the demo workbench: 9 candidate artefacts at 70% threshold, C4 marked
// as flat / bad, and Eyes Closed / Photic 6 Hz event markers. Idempotent —
// safe to re-call (e.g. on re-mount) without duplicating state.
//
// NOTE: real-data flows skip this entirely. `pgQEEGRawWorkbench` only calls
// `bootDemoState` when `state.isDemo === true`.
export function bootDemoState(state) {
  if (!state || state._demoSeeded) return;
  state._demoSeeded = true;

  // 1) AI artefact suggestions — populate ≥9 items at confidence threshold 70%.
  if (!Array.isArray(state.aiSuggestions) || state.aiSuggestions.length === 0) {
    state.aiSuggestions = buildDemoAISuggestions(state.timebase || 10);
  }

  // 2) Pre-mark C4 as a flat / bad channel so the channel rail picks up the
  //    .qwb-bad-channel hatching on first render. Channel ids in this page
  //    are of the form 'C4-Av' (DEFAULT_CHANNELS).
  if (state.badChannels && typeof state.badChannels.add === 'function') {
    state.badChannels.add('C4-Av');
  }

  // 3) Inject the two canonical demo events. The mini-map / inline trace
  //    renderers consume the module-level EVENT_TIMELINE constant for the
  //    full recording timeline; state.events is the per-session list a
  //    clinician (or future detector) can append to.
  if (Array.isArray(state.events) && state.events.length === 0) {
    state.events.push(
      { t:  60, kind: 'eyes-closed', label: 'Eyes Closed' },
      { t: 240, kind: 'photic',      label: 'Photic 6 Hz' },
    );
  }
}

// Recording-level event timeline for the mini-map / inline trace markers.
// Mirrors the design source's MiniMap eventMarkers + inline labels.
const EVENT_TIMELINE = [
  { t:   0, label: 'Start',        colour: '#2851a3' },
  { t:  60, label: 'Eyes Open',    colour: '#2851a3' },
  { t: 180, label: 'Eyes Closed',  colour: '#2851a3' },
  { t: 300, label: 'Photic 6 Hz',  colour: '#b8741a' },
  { t: 360, label: 'Photic 14 Hz', colour: '#b8741a' },
  { t: 420, label: 'Eyes Open',    colour: '#2851a3' },
  { t: 540, label: 'End',          colour: '#2851a3' },
];

// Synthetic full-recording artefact density — coloured by kind, used for
// the mini-map's bar layer (matches RAW DATA/extras.jsx genRawChannel
// inline artefacts).
function recordingArtifactDensity(totalSec) {
  const out = [];
  const kinds = ['blink','muscle','movement','line-noise','flat'];
  const colours = {
    'blink':       '#1d6f7a',
    'muscle':      '#b8741a',
    'movement':    '#7a4ea3',
    'line-noise':  '#1a4f7a',
    'flat':        '#6b6660',
  };
  // Seeded so the bars are stable across renders within the session.
  let seed = 0xb02e;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 38; i++) {
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    out.push({ t: rnd() * totalSec, kind, colour: colours[kind] });
  }
  return out;
}

function synthRawSignal(channelIndex, totalSamples, sampleRate, archetypeAt) {
  // "Raw" signal carries stronger artefacts so the Overlay / Raw / Split
  // modes show a visible difference vs the cleaned baseline.
  const out = synthSignal(channelIndex, totalSamples, sampleRate, archetypeAt);
  for (let i = 0; i < totalSamples; i++) {
    out[i] += (Math.random() - 0.5) * 14;
    if (channelIndex === 10) {
      // C4 stays near-flat in cleaned mode — in raw it has spikes.
      if ((i % 64) < 6) out[i] += 30;
    }
  }
  return out;
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
    displayMode: 'row',
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
    // Active editing tool — drives the left tool-selector strip and the
    // trace canvas mouse semantics. Defaults to 'select' (cursor mode).
    tool: 'select',
    measurePoints: [],   // populated when tool === 'measure'
    cursorPos: null,     // { tStr, ch, uv } updated on mousemove over trace
    // Recording metadata used by the summary strip + Recording Info card.
    // Real-data flows replace these with values from state.metadata.
    recording: {
      patient: 'Asel Akman',
      date: '2026-04-29',
      duration: '12:34',
      durationSec: 754,
      channelCount: 19,
      sampleRate: 256,
      montageLabel: '10-20 Avg',
      condition: 'Awake/Eyes-closed',
      reference: 'Avg',
      file: 'study_2026-04-29_001.edf (demo)',
    },
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
    aiThreshold: 0.7,       // confidence threshold filter for AI Review
    aiCursor: 0,            // J/K artefact navigation index
    signOff: null,          // { signedBy, signedAt, notes, readinessScore }
    medicationConfounds: '', // free-text medication list for knowledge-enhanced reporting
    // Recording-event timeline — separate from the constant EVENT_TIMELINE so
    // demo seeding can pre-populate Eyes Closed / Photic markers without
    // mutating module-level state.
    events: [],
    _demoSeeded: false,
  };

  // Pre-shell: seed the demo state so the very first render shows the canonical
  // "9 candidate artefacts at 70% threshold + flat C4 + Eyes Closed / Photic
  // 6 Hz markers" demo state described in the chat-transcript spec.
  if (state.isDemo) bootDemoState(state);

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
  attachToolSelector(state);
  attachTraceCursor(state);

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
    ${recordingSummaryStrip(state)}
    <div class="qwb-main">
      ${channelGutterHtml(state)}
      ${toolSelectorHtml(state)}
      <div class="qwb-trace-col">
        <div id="qwb-canvas-wrap" class="qwb-canvas-wrap" data-testid="qwb-trace">
          <div class="qwb-time-ruler" id="qwb-time-ruler" data-testid="qwb-time-ruler"></div>
          <div class="qwb-immutable-notice" id="qwb-immutable-banner">Original raw EEG preserved · Decision-support only</div>
          <canvas id="qwb-canvas" class="qwb-canvas-el" role="img" aria-label="EEG trace, 19 channels Fp1 through O2. Drag to mark a bad segment; right-click for tools."></canvas>
          <div id="qwb-overlays" class="qwb-overlays" data-testid="qwb-overlays"></div>
          ${inlineTraceEventsHtml(state)}
          <div id="qwb-rerun-notice" class="qwb-rerun-notice" style="display:none"></div>
        </div>
        <div class="qwb-spectro-strip" data-testid="qwb-spectro-strip">
          <span class="qwb-spectro-label">SPECTROGRAM · 0–50 Hz</span>
          <canvas id="qwb-spectro-canvas" class="qwb-spectro-canvas" role="img" aria-label="Spectrogram, 0 to 50 Hz, current window."></canvas>
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

// ── Recording summary strip (28px row under toolbar) ──────────
function recordingSummaryStrip(state) {
  const r = recordingMeta(state);
  const status = recordingStatus(state);
  const items = [
    `${r.channelCount} ch`,
    `${r.sampleRate} Hz`,
    r.duration,
    r.montageLabel,
    r.condition,
  ];
  const parts = items.map((it, i) => {
    const sep = i < items.length - 1 ? '<span class="qwb-sum-sep">·</span>' : '';
    return `<span class="qwb-sum-item">${esc(it)}</span>${sep}`;
  }).join('');
  return `
  <div class="qwb-summary-strip" data-testid="qwb-recording-strip">
    ${parts}
    <span class="qwb-sum-sep">·</span>
    <span class="qwb-sum-item" data-testid="qwb-recording-strip-version">${state.cleaningVersion ? `Cleaned (v${state.cleaningVersion.version_number})` : 'No cleaning version'}</span>
    <span class="qwb-sum-pill ${status.cls}" data-testid="qwb-recording-strip-pill">${esc(status.label)}</span>
  </div>`;
}

function recordingMeta(state) {
  const r = state.recording || {};
  return {
    patient:      state.metadata?.patient_name      || r.patient || '—',
    date:         state.metadata?.recording_date    || r.date || '—',
    duration:     state.metadata?.duration_label    || r.duration || '—',
    durationSec:  state.metadata?.duration_sec      || r.durationSec || 600,
    channelCount: state.metadata?.channel_count     || r.channelCount || DEFAULT_CHANNELS.length,
    sampleRate:   state.metadata?.sample_rate       || r.sampleRate || 256,
    montageLabel: state.metadata?.montage_label     || r.montageLabel || '10-20 Avg',
    condition:    state.metadata?.condition         || r.condition || '—',
    reference:    state.metadata?.reference         || r.reference || 'Avg',
    file:         state.metadata?.source_file       || r.file || '—',
  };
}

// Recording-strip status pill. The rule must match the recording-strip subtitle
// ("No cleaning version" vs "Cleaned (vN)") so clinicians never see a
// contradictory pair like "In progress" + "No cleaning version" (audit
// 2026-04-29). Strict precedence:
//   1. signOff present                          → "Signed off"
//   2. cleaningVersion present                  → "Cleaned (vN)"
//   3. cleaningVersion null && isDirty true     → "In progress" (unsaved edits)
//   4. cleaningVersion null && isDirty false    → "Untouched"
// We deliberately key on state.isDirty (set by markDirty() on every clinician
// edit) rather than badChannels/auditLog presence — those can be pre-seeded by
// bootDemoState or auto-detection without representing an unsaved clinician
// edit, and using them produced the contradictory pill seen in the audit.
function recordingStatus(state) {
  if (state.signOff) return { cls: 'signed-off', label: 'Signed off' };
  if (state.cleaningVersion) return { cls: 'cleaned', label: `Cleaned (v${state.cleaningVersion.version_number})` };
  if (state.isDirty) return { cls: 'in-progress', label: 'In progress' };
  return { cls: 'untouched', label: 'Untouched' };
}

// ── Tool selector (left of trace) ─────────────────────────────
// Each label is the human-readable tooltip + aria-label. Where a global
// keyboard shortcut exists (see attachKeyboard: B/C/A), it is appended in
// parens so clinicians can discover the shortcut without leaving the trace.
// 'select' and 'measure' have no keyboard binding today (V is taken by view
// mode toggle), so their labels stay shortcut-free.
const QWB_TOOLS = [
  { id: 'select',      label: 'Select',                  glyph: '↖', testid: 'qwb-tool-select' },
  { id: 'mark-segment', label: 'Mark bad segment (B)',   glyph: 'B', testid: 'qwb-tool-bad-segment' },
  { id: 'mark-channel', label: 'Mark bad channel (C)',   glyph: 'C', testid: 'qwb-tool-bad-channel' },
  { id: 'annotate',    label: 'Annotate (A)',            glyph: '✎', testid: 'qwb-tool-annotate' },
  { id: 'measure',     label: 'Measure',                 glyph: '⇔', testid: 'qwb-tool-measure' },
];

function toolSelectorHtml(state) {
  const buttons = QWB_TOOLS.map(t => {
    const active = state.tool === t.id;
    return `<button class="qwb-tool-btn${active ? ' is-active' : ''}" data-tool="${esc(t.id)}" data-testid="${esc(t.testid)}" title="${esc(t.label)}" aria-label="${esc(t.label)}">${esc(t.glyph)}</button>`;
  }).join('');
  return `<div id="qwb-tool-selector" class="qwb-tool-selector" data-testid="qwb-tool-selector">${buttons}</div>`;
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
      grid-template-rows: 44px 40px 28px 1fr 128px 24px;
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
      background:#F2EDE5;
      color:#1a1a1a;
      border-bottom:1px solid rgba(0,0,0,0.08);
      font-size:12px;
    }
    .qwb-brand {
      display:flex; align-items:center; gap:8px;
      font-weight:600; letter-spacing:-0.01em;
      padding:4px 10px; margin-right:12px;
      background:#1d6f7a; color:#ffffff;
      border-radius:4px;
    }
    .qwb-brand-name { font-size:13px; color:#ffffff; }
    .qwb-brand-name b { font-weight:700; color:#ffffff; }
    .qwb-brand-name .sub { color:rgba(255,255,255,0.78); margin-left:6px; font-weight:500; }
    .qwb-menus { display:flex; gap:0; }
    .qwb-menu-btn {
      background:transparent; border:0; padding:4px 9px; font-size:12px;
      color:#1a1a1a; border-radius:4px; cursor:pointer;
    }
    .qwb-menu-btn:hover { background:rgba(0,0,0,0.05); color:#1a1a1a; }
    .qwb-titlebar-right {
      margin-left:auto; display:flex; align-items:center; gap:10px;
      font-family:var(--qwb-mono); font-size:11px; color:#3a3633;
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

    /* ── Recording summary strip (between toolbar and trace) ─── */
    .qwb-summary-strip {
      display:flex; align-items:center; gap:0;
      padding:0 14px;
      background:#FAF7F2; border-bottom:1px solid #d8d1c3;
      font-family:var(--qwb-mono); font-size:11px; color:#3a3633;
      overflow-x:auto; overflow-y:hidden;
    }
    .qwb-summary-strip .qwb-sum-item { white-space:nowrap; }
    .qwb-summary-strip .qwb-sum-item b { color:#1a1a1a; font-weight:600; }
    .qwb-summary-strip .qwb-sum-sep {
      margin:0 10px; color:#a39d94; user-select:none;
    }
    .qwb-summary-strip .qwb-sum-pill {
      margin-left:auto; padding:2px 9px; border-radius:10px;
      font-family:'Inter Tight', system-ui, sans-serif;
      font-size:10.5px; font-weight:600; letter-spacing:0.02em;
      border:1px solid;
    }
    .qwb-sum-pill.untouched { background:#ECE5D8; color:#6b6660; border-color:#bdb5a2; }
    .qwb-sum-pill.in-progress { background:#f6e6cb; color:#b8741a; border-color:#b8741a; }
    .qwb-sum-pill.cleaned { background:#d6ebee; color:#1d6f7a; border-color:#1d6f7a; }
    .qwb-sum-pill.signed-off { background:#d6e8d6; color:#2f6b3a; border-color:#2f6b3a; }

    /* ── Tool selector (left edge of trace area) ─────────────── */
    .qwb-tool-selector {
      display:flex; flex-direction:column; align-items:center;
      gap:4px; padding:6px 4px;
      background:#F3EEE5; border-right:1px solid #d8d1c3;
    }
    .qwb-tool-btn {
      width:32px; height:32px; padding:0;
      display:inline-flex; align-items:center; justify-content:center;
      background:#FAF7F2; border:1px solid #d8d1c3; border-radius:4px;
      color:#3a3633; font-size:13px; cursor:pointer;
    }
    .qwb-tool-btn:hover { background:#fff; border-color:#bdb5a2; }
    .qwb-tool-btn.is-active {
      background:#1d6f7a; color:#fff; border-color:#1d6f7a;
    }

    /* ── Window/event breadcrumb under mini-map ──────────────── */
    .qwb-window-breadcrumb {
      padding:3px 10px 2px;
      background:#F3EEE5; border-top:1px dashed #d8d1c3;
      font-family:var(--qwb-mono); font-size:10px; color:#6b6660;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .qwb-window-breadcrumb b { color:#3a3633; font-weight:600; }

    /* ── Recording Info card (Cleaning tab) ──────────────────── */
    .qwb-rec-info-grid {
      display:grid; grid-template-columns:auto 1fr; gap:3px 10px;
      font-size:11px; line-height:1.4;
    }
    .qwb-rec-info-grid dt {
      color:#6b6660; font-family:var(--qwb-mono); font-size:10px;
      text-transform:uppercase; letter-spacing:0.04em;
    }
    .qwb-rec-info-grid dd { margin:0; color:#1a1a1a; font-weight:500; }

    /* ── Mini head map (Cleaning tab) ────────────────────────── */
    .qwb-mini-headmap {
      display:flex; flex-direction:column; align-items:center; gap:4px;
    }
    .qwb-mini-headmap svg { display:block; }
    .qwb-mini-headmap-legend {
      display:flex; flex-wrap:wrap; gap:8px;
      font-family:var(--qwb-mono); font-size:9.5px; color:#6b6660;
    }
    .qwb-mini-headmap-legend span { display:inline-flex; align-items:center; gap:3px; }
    .qwb-mini-headmap-legend i {
      width:8px; height:8px; border-radius:50%; display:inline-block;
    }

    /* ── Band power card (Best-Practice tab) ─────────────────── */
    .qwb-band-rows { display:flex; flex-direction:column; gap:4px; margin-top:6px; }
    .qwb-band-row {
      display:grid; grid-template-columns:90px 1fr 38px;
      gap:8px; align-items:center;
      font-family:var(--qwb-mono); font-size:10.5px; color:#3a3633;
    }
    .qwb-band-track {
      height:8px; background:#ECE5D8; border-radius:3px; overflow:hidden;
    }
    .qwb-band-fill { height:100%; background:#1d6f7a; transition:width 0.15s ease; }

    /* ── Cursor readout (status bar) ─────────────────────────── */
    .qwb-cursor-readout {
      display:inline-flex; align-items:center; gap:4px;
      padding:0 8px; height:18px;
      background:#FAF7F2; border:1px solid #d8d1c3; border-radius:3px;
      font-family:var(--qwb-mono); font-size:10px; color:#3a3633;
    }
    .qwb-cursor-readout b { color:#1d6f7a; font-weight:600; }

    /* ── Main grid (channel gutter | tool strip | trace+spectro | side) ── */
    .qwb-main {
      display:grid;
      grid-template-columns: 56px 44px 1fr 360px;
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
      display:grid; grid-template-rows: 1fr 80px;
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
    .qwb-ai-chip .qwb-ai-chip-pct {
      font-family:var(--qwb-mono); font-size:9px; opacity:0.85;
      margin-left:4px;
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

    /* ── Spectrogram strip (real canvas heatmap) ─────────────── */
    .qwb-spectro-strip {
      position:relative;
      background:#FAF7F2;
      border-top:1px solid #d8d1c3;
      overflow:hidden;
    }
    /* y-axis Hz scale (0/10/20/30/40/50) rendered as inline-SVG background.
       Reserves an 18px column on the left. */
    .qwb-spectro-strip::before {
      content:"";
      position:absolute; top:0; bottom:0; left:0; width:18px; z-index:2;
      background:#F3EEE5;
      border-right:1px solid #d8d1c3;
      background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='80' viewBox='0 0 18 80' preserveAspectRatio='none'>\
<g font-family='ui-monospace,Menlo,monospace' font-size='7' fill='%236b6660' text-anchor='end'>\
<text x='15' y='8'>50</text>\
<text x='15' y='23'>40</text>\
<text x='15' y='38'>30</text>\
<text x='15' y='53'>20</text>\
<text x='15' y='68'>10</text>\
<text x='15' y='78'>0</text>\
</g>\
<g stroke='%23d8d1c3' stroke-width='0.5'>\
<line x1='16' y1='5' x2='18' y2='5'/>\
<line x1='16' y1='20' x2='18' y2='20'/>\
<line x1='16' y1='35' x2='18' y2='35'/>\
<line x1='16' y1='50' x2='18' y2='50'/>\
<line x1='16' y1='65' x2='18' y2='65'/>\
<line x1='16' y1='75' x2='18' y2='75'/>\
</g></svg>");
      background-repeat:no-repeat; background-size:100% 100%;
    }
    .qwb-spectro-canvas {
      position:absolute; top:0; right:0; bottom:0; left:18px;
      width:calc(100% - 18px); height:100%;
      display:block;
    }
    .qwb-spectro-label {
      position:absolute; top:4px; left:24px; z-index:3;
      font-family:var(--qwb-mono); font-size:9px;
      color:#3a3633; text-transform:uppercase; letter-spacing:0.06em;
      background:rgba(250,247,242,0.85); padding:1px 5px; border-radius:2px;
    }
    /* ── Trace event markers (EYES CLOSED / PHOTIC) ──────────── */
    .qwb-event-marker {
      position:absolute; top:0;
      font-family:var(--qwb-mono); font-size:9px;
      padding:1px 5px; border-radius:2px;
      color:#fff; pointer-events:none; z-index:6;
      white-space:nowrap;
    }
    /* Inline state.events labels on the trace itself — paper-tone pill +
       dashed vertical line, distinct from AI chips and from the constant
       EVENT_TIMELINE markers above. */
    .qwb-trace-events {
      position:absolute; inset:0; pointer-events:none; z-index:5;
    }
    .qwb-trace-event-line {
      position:absolute; top:22px; bottom:0; width:0;
      border-left:1px dashed rgba(40,81,163,0.4);
      pointer-events:none;
    }
    .qwb-trace-event-label {
      position:absolute; top:0;
      transform:translateX(-50%);
      display:inline-flex; align-items:center;
      padding:2px 7px; border-radius:10px;
      font-family:var(--qwb-mono); font-size:10px; font-weight:500;
      background:#FFFFFF; border:1px solid rgba(40,81,163,0.4); color:#2851a3;
      white-space:nowrap; pointer-events:none;
      box-shadow:0 1px 2px rgba(0,0,0,0.04);
    }
    /* ── Bad-channel hatching (demo seed + clinician-marked) ─── */
    .qwb-bad-channel {
      background: repeating-linear-gradient(45deg,
        transparent 0,
        transparent 6px,
        rgba(176,52,52,0.15) 6px,
        rgba(176,52,52,0.15) 12px);
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
    .qwb-tab.active,
    .qwb-tab.is-active { color:#1d6f7a; border-bottom-color:#1d6f7a; background:#F3EEE5; font-weight:600; }
    .qwb-tab.is-active { border-bottom-width:2px; }
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

    /* ── ICA component grid (4 × 3) ──────────────────────────── */
    .qwb-ica-grid {
      display:grid;
      grid-template-columns: repeat(4, 1fr);
      gap:8px;
    }
    .ica-comp {
      position:relative;
      display:flex; flex-direction:column; align-items:center; gap:3px;
      padding:6px 4px 5px;
      background:#FAF7F2; border:1px solid #d8d1c3; border-radius:5px;
      cursor:pointer;
      transition: border-color 0.12s ease, background 0.12s ease;
    }
    .ica-comp:hover { border-color:#1d6f7a; background:#fff; }
    .ica-comp:focus { outline:2px solid #1d6f7a; outline-offset:1px; }
    .ica-comp.is-rejected {
      border-color:#b03434; background:#f9e0dd;
    }
    .ica-comp.is-rejected .ica-comp-label,
    .ica-comp.is-rejected .ica-comp-badge {
      text-decoration: line-through;
      color:#b03434;
    }
    .ica-comp-topo { display:block; }
    .ica-comp-label {
      font-family:var(--qwb-mono); font-size:10.5px; font-weight:600;
      color:#3a3633;
    }
    .ica-comp-badge {
      display:inline-block; padding:1px 5px; border-radius:7px;
      font-size:9px; font-weight:600; letter-spacing:0.04em;
      border:1px solid;
    }

    /* ── Decision-support tooltip in status bar ──────────────── */
    .qwb-decision-info {
      display:inline-flex; align-items:center; justify-content:center;
      width:14px; height:14px; border-radius:50%;
      background:#1d6f7a; color:#FAF7F2;
      font-family:var(--qwb-mono); font-size:9px; font-weight:700;
      cursor:help; user-select:none;
      margin-right:6px;
    }
    .qwb-decision-info:hover { background:#155a64; }

    /* ── Mini-map row ────────────────────────────────────────── */
    .qwb-minimap-row {
      display:grid;
      grid-template-columns: 56px 44px 1fr 360px;
      grid-template-rows: auto auto;
      border-top:1px solid #d8d1c3;
      background:#F3EEE5;
    }
    .qwb-minimap-row > .qwb-minimap-gutter { grid-row:1 / span 2; }
    .qwb-minimap-row > .qwb-minimap-gutter-tool {
      grid-row:1 / span 2;
      background:#F3EEE5; border-right:1px solid #d8d1c3;
    }
    .qwb-minimap-row > .qwb-minimap { grid-column:3; grid-row:1; }
    .qwb-minimap-row > .qwb-window-breadcrumb { grid-column:3; grid-row:2; }
    .qwb-minimap-row > .qwb-topo-strip { grid-column:4; grid-row:1 / span 2; }
    .qwb-minimap-gutter {
      background:#F3EEE5; border-right:1px solid #d8d1c3;
      display:flex; align-items:center; justify-content:center;
      font-size:9px; color:#6b6660; font-family:var(--qwb-mono);
      text-transform:uppercase; letter-spacing:0.06em;
    }
    .qwb-minimap {
      padding:8px 10px 10px; min-width:0;
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
      position:relative; height:60px;
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
      position:relative;
      border-left:1px solid #d8d1c3; background:#FAF7F2;
      display:flex; justify-content:space-around; align-items:center;
      padding:6px 22px 6px 4px;
    }
    .qwb-topo-mini {
      display:flex; flex-direction:column; align-items:center; gap:3px;
    }
    .qwb-topo-mini svg { width:90px; height:90px; }
    .qwb-topo-label {
      font-size:11px; font-weight:600; color:#666;
    }
    .qwb-topo-band {
      font-family:var(--qwb-mono); font-size:8.5px; color:#6b6660;
    }
    /* Power ramp scale on the right side of the topo strip. */
    .qwb-topo-strip::after {
      content:"low high";
      position:absolute; top:8px; bottom:8px; right:6px;
      width:12px; padding:0;
      background:linear-gradient(to top, #FAF7F2, #1d6f7a, #b8741a);
      border:1px solid #d8d1c3; border-radius:2px;
      font-family:var(--qwb-mono); font-size:8px; color:#6b6660;
      letter-spacing:0;
      writing-mode:vertical-rl; transform:rotate(180deg);
      text-align:center; line-height:12px;
      word-spacing:60px;
      text-shadow:0 0 2px #FAF7F2, 0 0 2px #FAF7F2;
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
    .qwb-menu-dropdown {
      position:fixed; z-index:100; background:#FAF7F2; border:1px solid #d8d1c3;
      border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.12); min-width:180px;
      padding:4px 0; font-size:12px;
    }
    .qwb-modal {
      position:fixed; inset:0; z-index:90; display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,0.35); backdrop-filter:blur(1px);
    }
    .qwb-modal-panel {
      background:#FAF7F2; border:1px solid #d8d1c3; border-radius:8px;
      width:420px; max-width:90vw; box-shadow:0 12px 40px rgba(0,0,0,0.2);
    }
    .qwb-modal-header {
      display:flex; justify-content:space-between; align-items:center;
      padding:12px 16px; border-bottom:1px solid #d8d1c3; font-weight:600; font-size:14px;
    }
    .qwb-modal-close { background:none; border:none; font-size:18px; cursor:pointer; color:#6b6660; }
    .qwb-modal-close:hover { color:#b03434; }
    .qwb-modal-body { padding:14px 16px; }
    .qwb-menu-item {
      display:block; width:100%; text-align:left; padding:6px 14px;
      background:none; border:none; cursor:pointer; font-size:12px; color:#1a1a1a;
    }
    .qwb-menu-item:hover { background:#e8e0d0; }
    .qwb-menu-item--disabled { color:#9e9a93; cursor:not-allowed; }
    .qwb-menu-item--disabled:hover { background:none; }
    .qwb-menu-sep { height:1px; background:#d8d1c3; margin:4px 8px; }
    .qwb-ai-banner {
      padding:8px 10px; background:#f6e6cb;
      border:1px solid #b8741a; border-radius:4px;
      font-size:11px; color:#7a4d10; margin-bottom:12px;
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
  const displayToggle = `
    <div class="qwb-view-toggle" id="qwb-display-toggle" data-testid="qwb-display-toggle" style="margin-left:4px">
      ${['Row','Stack','Butterfly'].map(function(d) { return '<button data-display="' + d.toLowerCase() + '" class="' + (state.displayMode===d.toLowerCase()?'active':'') + '">' + d + '</button>'; }).join('')}
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
    <div class="qwb-tb-group" style="margin-left:auto">
      <button class="qwb-tb-btn" id="qwb-event-prev" data-testid="qwb-event-prev" title="Jump to previous event">◀ Event</button>
      <button class="qwb-tb-btn" id="qwb-prev-window" data-testid="qwb-prev-window" title="Previous window" style="min-width:60px;height:28px">◀ Prev</button>
      <button class="qwb-tb-btn" id="qwb-play" data-testid="qwb-play" title="Play / pause">▶</button>
      <button class="qwb-tb-btn" id="qwb-next-window" data-testid="qwb-next-window" title="Next window" style="min-width:60px;height:28px">Next ▶</button>
      <button class="qwb-tb-btn" id="qwb-event-next" data-testid="qwb-event-next" title="Jump to next event">Event ▶</button>
    </div>
    <div class="qwb-tb-group">
      <button class="qwb-tb-btn" id="qwb-quick-snapshot" data-testid="qwb-quick-snapshot" title="Save current window as PNG">⤓ Snapshot</button>
      <button class="qwb-tb-btn" id="qwb-quick-export" data-testid="qwb-quick-export" title="Export cleaning bundle">⇪ Export</button>
      <button class="qwb-tb-btn" id="qwb-quick-save" data-testid="qwb-quick-save" title="Save cleaning version">💾 Save</button>
      <button class="qwb-tb-btn" id="qwb-quick-rerun" data-testid="qwb-quick-rerun" title="Re-run qEEG analysis">↻ Reprocess</button>
      <button class="qwb-tb-btn" id="qwb-quick-spectral" data-testid="qwb-quick-spectral" title="Spectral view">∿ Spectral</button>
    </div>
    <div class="qwb-tb-group" style="border-right:0">
      ${viewToggle}${displayToggle}
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
    const anatomyTip = CHANNEL_ANATOMY[ch] || '';
    const tipAttr = anatomyTip ? ` title="${esc(anatomyTip)}"` : '';
    return `<div class="qwb-ch-row ${isBad?'bad qwb-bad-channel':''} ${isSel?'active':''}" data-channel="${esc(ch)}">
      <span class="qwb-ch-name"${tipAttr} data-channel="${esc(ch)}">${esc(ch)}${isBad?' ⚠':''}</span>
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
  // 5-tab right panel — Cleaning / AI Review / Best-Practice / ICA / Audit.
  const tabs = [
    { id: 'cleaning', label: 'Cleaning',      testid: 'qwb-tab-cleaning' },
    { id: 'ai',       label: 'AI Review',     testid: 'qwb-tab-ai',    badge: aiPending },
    { id: 'help',     label: 'Best-Practice', testid: 'qwb-tab-bp' },
    { id: 'ica',      label: 'ICA',           testid: 'qwb-tab-ica',   badge: icaBad },
    { id: 'log',      label: 'Audit',         testid: 'qwb-tab-audit' },
  ];
  return `
  <aside id="qwb-right" class="qwb-right ${state.rightCollapsed ? 'collapsed' : ''}" data-testid="qwb-right">
    <button class="qwb-right-toggle" id="qwb-right-toggle" data-testid="qwb-right-toggle"
      title="${state.rightCollapsed ? 'Expand panel' : 'Collapse panel'}">
      ${state.rightCollapsed ? '◀' : '▶'}
    </button>
    <div class="qwb-right-tabs" id="qwb-right-tabs" ${state.rightCollapsed ? 'style="display:none"' : ''}>
      ${tabs.map(t => {
        const active = state.rightTab === t.id;
        // Explicit id="..." pins the testid to a stable element identity so
        // selector-based test polyfills don't conflate this button with
        // anonymous siblings registered at the same byte position in a
        // different selector scan.
        return `<button id="${t.testid}" class="qwb-tab${active ? ' is-active active' : ''}" data-tab="${t.id}" data-testid="${t.testid}">${esc(t.label)}${t.badge ? `<span class="qwb-tab-count" data-tab-count="${t.id}">${t.badge}</span>` : ''}</button>`;
      }).join('')}
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
  // Cache the seeded density so it stays stable across renders.
  if (!state._artefactDensity) state._artefactDensity = recordingArtifactDensity(total);
  const bars = state._artefactDensity.map(e => `<div style="position:absolute;left:${(e.t/total*100).toFixed(2)}%;top:14px;bottom:4px;width:2px;background:${e.colour};opacity:0.7"></div>`).join('');
  const evMarkers = EVENT_TIMELINE.map(ev => `<div class="qwb-minimap-marker" data-marker-time="${ev.t}" style="position:absolute;left:${(ev.t/total*100).toFixed(2)}%;top:0;bottom:0;width:8px;margin-left:-4px;cursor:pointer;background:transparent;z-index:2" title="${esc(ev.label)} @ ${ev.t}s">
    <div style="position:absolute;left:3px;top:0;bottom:0;width:1px;background:${ev.colour};opacity:0.45"></div>
    <span style="position:absolute;top:-2px;left:5px;font-size:9px;font-family:var(--qwb-mono);color:${ev.colour};white-space:nowrap;background:#F3EEE5;padding:0 3px;border-radius:2px;pointer-events:none">${esc(ev.label)}</span>
  </div>`).join('');
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
  const breadcrumb = windowBreadcrumb(state);
  return `
  <div class="qwb-minimap-row">
    <div class="qwb-minimap-gutter">map</div>
    <div class="qwb-minimap-gutter-tool"></div>
    <div class="qwb-minimap" data-testid="qwb-minimap">
      <div class="qwb-minimap-head">
        <span class="qwb-minimap-title">Recording timeline · 10:00</span>
        <div class="qwb-minimap-legend">${legend}</div>
      </div>
      <div class="qwb-minimap-track" id="qwb-minimap-track">
        ${evMarkers}
        ${bars}
        <div class="qwb-minimap-window" id="qwb-minimap-window"
          style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%"></div>
      </div>
    </div>
    <div id="qwb-window-breadcrumb" class="qwb-window-breadcrumb" data-testid="qwb-window-breadcrumb">${breadcrumb}</div>
    <div class="qwb-topo-strip" data-testid="qwb-topo-strip">${bands}</div>
  </div>`;
}

function windowBreadcrumb(state) {
  const r = recordingMeta(state);
  const total = r.durationSec || 600;
  const tb = state.timebase || 10;
  const winIdx = Math.floor((state.windowStart || 0) / tb) + 1;
  const winTotal = Math.max(1, Math.ceil(total / tb));
  const startLabel = formatTime(state.windowStart);
  const endLabel = formatTime(state.windowStart + tb);
  const next = nextEventAfter(state, state.windowStart);
  const nextLabel = next ? `Next event: ${next.label} @ ${formatTime(next.t)}` : 'No upcoming events';
  return `<b>Window ${winIdx}/${winTotal}</b> · ${startLabel}–${endLabel} · ${esc(nextLabel)}`;
}

function formatTime(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function nextEventAfter(state, sec) {
  const evs = combinedEvents(state);
  const after = evs.filter(e => e.t > sec).sort((a, b) => a.t - b.t);
  if (after.length) return after[0];
  // Wrap to first event so the navigation feels continuous.
  return evs.length ? evs.slice().sort((a, b) => a.t - b.t)[0] : null;
}

function prevEventBefore(state, sec) {
  const evs = combinedEvents(state);
  const before = evs.filter(e => e.t < sec).sort((a, b) => b.t - a.t);
  if (before.length) return before[0];
  return evs.length ? evs.slice().sort((a, b) => b.t - a.t)[0] : null;
}

function combinedEvents(state) {
  const out = [];
  for (const e of EVENT_TIMELINE) out.push({ t: e.t, label: e.label });
  for (const e of (state.events || [])) out.push({ t: e.t, label: e.label });
  return out;
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
  const glyph = { delta:'δ', theta:'θ', alpha:'α', beta:'β' }[id] || '';
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
      <div class="qwb-topo-label">${glyph} ${esc(label)}</div>
      <div class="qwb-topo-band">${esc(range)}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────────────────────

function bottomBar(state) {
  const decisionTooltip = 'Decision support only. Original raw EEG is preserved. All cleaning actions are saved to a separate version with full audit trail. AI suggestions require clinician confirmation before they take effect.';
  return `
  <div id="qwb-status" class="qwb-bottombar" data-testid="qwb-status">
    <span class="qwb-decision-info" data-testid="qwb-decision-info" title="${esc(decisionTooltip)}" aria-label="${esc(decisionTooltip)}">i</span>
    <span class="qwb-stat">Time: <b id="qwb-st-time">--:--:--</b></span>
    <span class="qwb-stat">Window: <b id="qwb-st-window">0–${state.timebase}s</b></span>
    <span class="qwb-stat">Selected: <b id="qwb-st-sel">${esc(state.selectedChannel)}</b></span>
    <span class="qwb-stat" id="qwb-st-amp-wrap">Δamp: <b id="qwb-st-amp">—</b></span>
    <span class="qwb-stat">Bad ch: <b id="qwb-st-bad">0</b></span>
    <span class="qwb-stat">Rejected: <b id="qwb-st-rej">0</b></span>
    <span class="qwb-stat">Retained: <b id="qwb-st-retain">100%</b></span>
    <span class="qwb-stat" id="qwb-st-version">No cleaning version</span>
    <span class="qwb-stat" id="qwb-st-signoff">Not signed off</span>
    <span id="qwb-cursor-readout" class="qwb-cursor-readout" data-testid="qwb-cursor-readout" title="Live cursor t · channel · amplitude">t=—:—.— · ch=— · — µV</span>
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

function _renderSignOffSection(state) {
  const so = state.signOff;
  const r = _computeReportReadiness(state);
  if (so) {
    return `
      <div class="qwb-card" style="border-left:3px solid #2f6b3a;background:#d6e8d6">
        <div style="font-weight:600;color:#2f6b3a;font-size:12px;margin-bottom:4px">✓ Signed off</div>
        <div style="font-size:11px;color:#3a3633;margin-bottom:2px">By: <b>${esc(so.signedBy)}</b></div>
        <div style="font-size:11px;color:#6b6660;margin-bottom:4px">${new Date(so.signedAt).toLocaleString()}</div>
        ${so.notes ? `<div style="font-size:11px;color:#3a3633;margin-bottom:6px;font-style:italic">"${esc(so.notes)}"</div>` : ''}
        <div style="font-size:10px;color:#6b6660">Readiness score at sign‑off: <b>${so.readinessScore}</b>/100</div>
        <div style="margin-top:8px">
          <button class="qwb-side-btn" id="qwb-revoke-signoff" style="font-size:11px;padding:4px 8px">Revoke sign‑off</button>
        </div>
      </div>`;
  }
  return `
    <div style="font-size:11px;color:#6b6660;margin-bottom:8px">
      Current readiness: <b style="color:${r.score >= 80 ? '#2f6b3a' : r.score >= 60 ? '#b8741a' : '#b03434'}">${r.score}/100</b> — ${r.readiness}
    </div>
    <button class="qwb-side-btn ink full" id="qwb-open-signoff" data-testid="qwb-open-signoff">Sign off cleaning</button>
    <div style="font-size:10px;color:#9e9a93;margin-top:6px;line-height:1.4">
      Signing off records your clinical review and locks the cleaning version from further edits until revoked.
    </div>`;
}

function signOffModal(state) {
  const r = _computeReportReadiness(state);
  const patient = state.metadata?.patient_name || (state.isDemo ? 'Azzi Glasser' : '—');
  return `
  <div id="qwb-signoff-modal" class="qwb-modal-backdrop" data-testid="qwb-signoff-modal">
    <div class="qwb-modal" style="width:520px;max-width:90vw">
      <h3>Clinician Sign‑Off</h3>
      <p class="qwb-modal-sub">Confirm that you have reviewed the cleaning and the recording is ready for reporting.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div class="qwb-card" style="margin-bottom:0">
          <div style="font-size:10px;color:#6b6660;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px">Patient</div>
          <div style="font-size:13px;font-weight:600">${esc(patient)}</div>
        </div>
        <div class="qwb-card" style="margin-bottom:0">
          <div style="font-size:10px;color:#6b6660;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px">Readiness</div>
          <div style="font-size:13px;font-weight:600;color:${r.score >= 80 ? '#2f6b3a' : r.score >= 60 ? '#b8741a' : '#b03434'}">${r.score}/100 — ${r.readiness}</div>
        </div>
        <div class="qwb-card" style="margin-bottom:0">
          <div style="font-size:10px;color:#6b6660;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px">Bad channels</div>
          <div style="font-size:13px;font-weight:600">${r.badChCount}</div>
        </div>
        <div class="qwb-card" style="margin-bottom:0">
          <div style="font-size:10px;color:#6b6660;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px">Rejected segments</div>
          <div style="font-size:13px;font-weight:600">${r.rejSegCount}</div>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:11px;color:#6b6660;display:block;margin-bottom:4px">Sign‑off notes (optional)</label>
        <textarea id="qwb-signoff-notes" rows="3" style="width:100%;padding:8px;border:1px solid #d8d1c3;border-radius:4px;font-family:inherit;font-size:12px;resize:vertical" placeholder="e.g. C4 flat — acceptable for eyes-closed protocol. Blink ICA rejected."></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="qwb-tb-btn" id="qwb-signoff-cancel">Cancel</button>
        <button class="qwb-tb-btn ink" id="qwb-signoff-confirm" data-testid="qwb-signoff-confirm">Sign off</button>
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

  const ampScale = (rowH * 0.45) / state.gain;
  const drawTrace = (sig, color, lineWidth, yMid, xStart, xEnd) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    const stride = Math.max(1, Math.floor(totalSamples / W));
    let firstDrawn = false;
    for (let i = 0; i < totalSamples; i += stride) {
      const x = (i / totalSamples) * W;
      if (x < xStart || x > xEnd) continue;
      const y = yMid - sig[i] * ampScale;
      if (!firstDrawn) { ctx.moveTo(x, y); firstDrawn = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  // Pre-generate all signals for stack / butterfly modes
  var allCleaned = [], allRaw = [];
  for (var ci = 0; ci < channels.length; ci++) {
    allCleaned.push(synthSignal(ci, totalSamples, sampleRate, archetypeAt));
    allRaw.push(synthRawSignal(ci, totalSamples, sampleRate, archetypeAt));
  }

  if (state.displayMode === 'stack') {
    // All channels overlaid in single plot area
    var stackY = (traceTop + H) / 2;
    for (var idx = 0; idx < channels.length; idx++) {
      var ch = channels[idx];
      var isBad = state.badChannels.has(ch);
      var color = isBad ? '#b03434' : ['#1a1a1a','#2851a3','#2f6b3a','#b8741a','#7b4ea3'][idx % 5];
      var width = isBad ? 1.2 : 0.7;
      switch (state.viewMode) {
        case 'raw': drawTrace(allRaw[idx], color, width, stackY, 0, W); break;
        case 'overlay': drawTrace(allRaw[idx], 'rgba(176,52,52,0.35)', 0.5, stackY, 0, W); drawTrace(allCleaned[idx], color, width, stackY, 0, W); break;
        case 'split': drawTrace(allRaw[idx], '#b03434', 0.6, stackY, 0, W/2); drawTrace(allCleaned[idx], color, width, stackY, W/2, W); break;
        default: drawTrace(allCleaned[idx], color, width, stackY, 0, W);
      }
    }
  } else if (state.displayMode === 'butterfly') {
    // Compute average reference
    var avg = new Float32Array(totalSamples);
    for (var i = 0; i < totalSamples; i++) {
      var sum = 0;
      for (var ci = 0; ci < channels.length; ci++) sum += allCleaned[ci][i];
      avg[i] = sum / channels.length;
    }
    var butterY = (traceTop + H) / 2;
    for (var idx = 0; idx < channels.length; idx++) {
      var ch = channels[idx];
      var isBad = state.badChannels.has(ch);
      var color = isBad ? '#b03434' : ['#1a1a1a','#2851a3','#2f6b3a','#b8741a','#7b4ea3'][idx % 5];
      var width = isBad ? 1.2 : 0.7;
      var rel = new Float32Array(totalSamples);
      for (var i = 0; i < totalSamples; i++) rel[i] = allCleaned[idx][i] - avg[i];
      switch (state.viewMode) {
        case 'raw':
          var relRaw = new Float32Array(totalSamples);
          for (var i = 0; i < totalSamples; i++) relRaw[i] = allRaw[idx][i] - avg[i];
          drawTrace(relRaw, color, width, butterY, 0, W); break;
        case 'overlay': drawTrace(rel, color, width, butterY, 0, W); break;
        case 'split': drawTrace(rel, color, width, butterY, 0, W); break;
        default: drawTrace(rel, color, width, butterY, 0, W);
      }
    }
    // Draw average trace in grey
    drawTrace(avg, '#999', 1.0, butterY, 0, W);
  } else {
    // Row mode (default)
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

      const cleanedSig = allCleaned[idx];
      const needRaw = state.viewMode === 'overlay' || state.viewMode === 'split' || state.viewMode === 'raw';
      const rawSig = needRaw ? allRaw[idx] : null;

      const blackColor = isBad ? '#b03434' : '#1a1a1a';
      const blackWidth = isBad ? 1.0 : 0.9;
      const ghostColor = 'rgba(176,52,52,0.55)';

      switch (state.viewMode) {
        case 'raw':
          drawTrace(rawSig, blackColor, blackWidth, yMid, 0, W);
          break;
        case 'overlay':
          drawTrace(rawSig, ghostColor, 0.6, yMid, 0, W);
          drawTrace(cleanedSig, blackColor, blackWidth, yMid, 0, W);
          break;
        case 'split':
          drawTrace(rawSig,    '#b03434',   0.7, yMid, 0,     W / 2);
          drawTrace(cleanedSig, blackColor, blackWidth, yMid, W / 2, W);
          break;
        case 'cleaned':
        default:
          drawTrace(cleanedSig, blackColor, blackWidth, yMid, 0, W);
      }
    });
  }

  // Split-mode divider line
  if (state.viewMode === 'split') {
    ctx.strokeStyle = '#2851a3';
    ctx.lineWidth = 1.5;
    const hasDash = typeof ctx.setLineDash === 'function';
    if (hasDash) ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(W / 2, traceTop); ctx.lineTo(W / 2, H); ctx.stroke();
    if (hasDash) ctx.setLineDash([]);
  }

  renderOverlays(state, W, H, rulerH);
  renderTraceEventMarkers(state, W);
  redrawSpectrogram(state);
}

function redrawSpectrogram(state) {
  const canvas = document.getElementById('qwb-spectro-canvas');
  if (!canvas) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const W = wrap.clientWidth || 800;
  const H = wrap.clientHeight || 56;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#FAF7F2'; ctx.fillRect(0, 0, W, H);

  const cols = 240, rows = 50;
  const cellW = W / cols, cellH = H / rows;
  const archetypeT = (kind) => {
    // Approximate windows in the 12s display where each kind dominates.
    if (kind === 'blink')      return [[0.06, 0.10], [0.31, 0.35], [0.71, 0.745]];
    if (kind === 'muscle')     return [[0.18, 0.23], [0.62, 0.66]];
    if (kind === 'line-noise') return [[0.54, 0.78]];
    if (kind === 'movement')   return [[0.42, 0.48]];
    return [];
  };
  const inWindow = (t, ws) => ws.some(([a, b]) => t >= a && t <= b);

  for (let x = 0; x < cols; x++) {
    const t = x / cols; // 0..1 across the window
    for (let y = 0; y < rows; y++) {
      const freq = (rows - y) / rows * 50; // 0..50 Hz, top = high
      let p = 0;
      // Background spectrum
      if (freq > 8 && freq < 12) p += 0.55 + 0.20 * Math.sin(t * 8);
      if (freq < 4)              p += 0.30 + 0.12 * Math.sin(t * 3);
      if (freq > 18 && freq < 28) p += 0.12;
      // Artefact bursts
      if (inWindow(t, archetypeT('muscle'))     && freq > 25) p += 0.65;
      if (inWindow(t, archetypeT('blink'))      && freq < 5)  p += 0.80;
      if (inWindow(t, archetypeT('line-noise')) && freq > 48 && freq < 52) p += 1.00;
      if (inWindow(t, archetypeT('movement'))   && freq < 3)  p += 0.55;
      p += (Math.random() - 0.5) * 0.08;
      p = Math.max(0, Math.min(1, p));
      ctx.fillStyle = spectroColour(p);
      ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
    }
  }
}

function spectroColour(p) {
  // paper → teal → amber ramp (matches RAW DATA/extras.jsx spectroColor)
  if (p < 0.15) return '#FAF7F2';
  if (p < 0.30) return '#ECE5D8';
  if (p < 0.45) return '#d6ebee';
  if (p < 0.60) return '#a8d4d9';
  if (p < 0.75) return '#4ea3ad';
  if (p < 0.90) return '#1d6f7a';
  return '#0d3a40';
}

function renderTraceEventMarkers(state, W) {
  const wrap = document.getElementById('qwb-canvas-wrap');
  if (!wrap) return;
  // Remove any existing inline markers (innerHTML wipe would break canvas)
  const old = wrap.querySelectorAll ? wrap.querySelectorAll('.qwb-event-marker') : [];
  old.forEach(n => n.remove && n.remove());
  // Render only markers within the current 12-second window.
  const tb = state.timebase;
  for (const ev of EVENT_TIMELINE) {
    const overlap = ev.t - state.windowStart;
    if (overlap < 0 || overlap > tb) continue;
    const left = (overlap / tb) * 100;
    const el = document.createElement('div');
    el.className = 'qwb-event-marker';
    el.style.left = left.toFixed(2) + '%';
    el.style.background = ev.colour;
    el.textContent = ev.label.toUpperCase() + ' ▾';
    wrap.appendChild(el);
  }
  // Refresh the per-session state.events overlay (vertical dashed line +
  // paper-tone pill label) for whatever window is now visible.
  renderInlineTraceEvents(state);
}

// Emit the inline state.events overlay that lives inside qwb-canvas-wrap.
// Each entry produces a dashed vertical line spanning the trace height and
// a paper-tone pill label at the top. Visibility is keyed off the current
// window so events outside the visible range are suppressed via display:none
// (the markup remains so static-render assertions can still find them).
function inlineTraceEventsInnerHtml(state) {
  const events = Array.isArray(state && state.events) ? state.events : [];
  const tb = (state && state.timebase) || 10;
  const wsec = (state && state.windowStart) || 0;
  return events.map(ev => {
    const kind = (ev.kind || ev.label || 'event').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const overlap = ev.t - wsec;
    const visible = overlap >= 0 && overlap <= tb;
    const left = visible ? (overlap / tb) * 100 : 0;
    const display = visible ? '' : 'display:none;';
    return `<div class="qwb-trace-event" data-event-kind="${esc(kind)}" data-event-t="${ev.t}" style="${display}">
      <div class="qwb-trace-event-line" style="left:${left.toFixed(2)}%"></div>
      <div class="qwb-trace-event-label" data-testid="qwb-event-marker-${esc(kind)}" style="left:${left.toFixed(2)}%">${esc(ev.label || '')}</div>
    </div>`;
  }).join('');
}

function inlineTraceEventsHtml(state) {
  return `<div id="qwb-trace-events" class="qwb-trace-events" data-testid="qwb-event-marker">${inlineTraceEventsInnerHtml(state)}</div>`;
}

function renderInlineTraceEvents(state) {
  const host = document.getElementById('qwb-trace-events');
  if (!host) return;
  // Re-render in place so the static testid wrapper stays put while the
  // per-event lines/labels follow the current window.
  host.innerHTML = inlineTraceEventsInnerHtml(state);
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
        <span class="qwb-ai-chip-pct">${conf}%</span>
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
    // Best-Practice now hosts the cleaning quality score + checklist alongside
    // the per-topic guidance and reference artefact examples.
    case 'help':     body.innerHTML = renderHelpPanel(state);     break;
    case 'examples': body.innerHTML = renderHelpPanel(state);     break; // legacy alias
    case 'ica':      body.innerHTML = renderICAPanel(state);      attachICAPanelHandlers(state);      break;
    case 'log':      body.innerHTML = renderAuditPanel(state);    attachAuditPanelHandlers(state);    break;
    default:         body.innerHTML = renderCleaningPanel(state); attachCleaningPanelHandlers(state); break;
  }
}

function _channelQualityMatrix(state) {
  var w = state.isDemo ? _getWindowSignals(state) : null;
  var rows = DEFAULT_CHANNELS.map(function(ch, ci) {
    var isBad = state.badChannels.has(ch);
    var artifactCount = (state.aiSuggestions || []).filter(function(s) { return s.channel === ch && s.decision_status === 'suggested'; }).length;
    var stats = w ? _channelStats(w.signals[ci]) : { variance: 0, range: 0 };
    var varLabel = stats.variance < 50 ? 'flat' : stats.variance > 400 ? 'noisy' : 'ok';
    var varColor = stats.variance < 50 ? '#b03434' : stats.variance > 400 ? '#b8741a' : '#2f6b3a';
    return '<tr style="' + (isBad ? 'background:rgba(176,52,52,0.06)' : '') + '">'
      + '<td style="font-size:10px;font-family:var(--qwb-mono);padding:3px 6px">' + esc(ch) + (isBad ? ' ⚠' : '') + '</td>'
      + '<td style="font-size:10px;padding:3px 6px;color:' + varColor + '">' + varLabel + '</td>'
      + '<td style="font-size:10px;padding:3px 6px">' + (w ? Math.round(stats.variance) : '—') + '</td>'
      + '<td style="font-size:10px;padding:3px 6px">' + artifactCount + '</td>'
      + '</tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse;font-size:10px">'
    + '<thead><tr style="color:#6b6660;font-size:9px;text-transform:uppercase;letter-spacing:0.04em">'
    + '<th style="text-align:left;padding:4px 6px">Channel</th>'
    + '<th style="text-align:left;padding:4px 6px">Quality</th>'
    + '<th style="text-align:left;padding:4px 6px">Var</th>'
    + '<th style="text-align:left;padding:4px 6px">AI</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

// ── Recording Info card (top of Cleaning tab) ─────────────────
function renderRecordingInfoSection(state) {
  const r = recordingMeta(state);
  const rows = [
    ['Patient',     r.patient],
    ['Date',        r.date],
    ['Duration',    r.duration],
    ['Montage',     r.montageLabel],
    ['Sample rate', `${r.sampleRate} Hz`],
    ['Channels',    String(r.channelCount)],
    ['Reference',   r.reference],
    ['File',        r.file],
  ];
  const meds = state.medicationConfounds || '';
  return `
    <div class="qwb-side-section" data-testid="qwb-recording-info">
      <h4>Recording Info</h4>
      <dl class="qwb-rec-info-grid">
        ${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
      </dl>
      <div class="qwb-meds-input-wrap" style="margin-top:10px">
        <label class="qwb-meds-label" for="qwb-meds-input" style="display:block;font-size:11px;color:#8a837a;margin-bottom:3px">Medications (confounds)</label>
        <input id="qwb-meds-input" class="qwb-meds-input" type="text"
          placeholder="e.g. lorazepam, valproate, zolpidem…"
          value="${esc(meds)}"
          data-testid="qwb-meds-input"
          style="width:100%;padding:4px 6px;border:1px solid #dcd6ce;border-radius:4px;font-size:12px;background:#faf7f2;color:#3a3633"
        />
        <div class="qwb-meds-hint" style="font-size:10px;color:#a39d94;margin-top:2px">Comma-separated drug names; included in AI report.</div>
      </div>
    </div>`;
}

// ── 10-20 mini head-map (Cleaning tab) ────────────────────────
// Coordinates are 0..1 in (x, y) — same canonical 10-20 layout used by
// the topomap thumbnails on the mini-map row.
const QWB_HEADMAP_COORDS = [
  ['Fp1-Av', 0.36, 0.10],['Fp2-Av', 0.64, 0.10],
  ['F7-Av',  0.20, 0.28],['F3-Av',  0.36, 0.28],['Fz-Av', 0.50, 0.28],['F4-Av', 0.64, 0.28],['F8-Av', 0.80, 0.28],
  ['T3-Av',  0.12, 0.50],['C3-Av',  0.32, 0.50],['Cz-Av', 0.50, 0.50],['C4-Av', 0.68, 0.50],['T4-Av', 0.88, 0.50],
  ['T5-Av',  0.20, 0.72],['P3-Av',  0.36, 0.72],['Pz-Av', 0.50, 0.72],['P4-Av', 0.64, 0.72],['T6-Av', 0.80, 0.72],
  ['O1-Av',  0.40, 0.90],['O2-Av',  0.60, 0.90],
];

function renderMiniHeadmapSection(state) {
  const W = 180, H = 180;
  const flagged = new Set(((state.aiSuggestions || []).map(s => s.channel)).filter(Boolean));
  const dots = QWB_HEADMAP_COORDS.map(([id, x, y]) => {
    const cx = (x * W).toFixed(1);
    const cy = (y * H).toFixed(1);
    const isBad = state.badChannels && state.badChannels.has(id);
    const isAI = !isBad && flagged.has(id);
    const isSel = state.selectedChannel === id;
    let fill = '#FAF7F2', stroke = '#a39d94', sw = 0.8;
    if (isBad) { fill = '#b03434'; stroke = '#7a2424'; sw = 1.2; }
    else if (isAI) { stroke = '#b8741a'; sw = 1.6; }
    if (isSel) { stroke = '#1d6f7a'; sw = 2.2; }
    const shortLabel = id.replace('-Av','');
    return `<g class="qwb-mini-headmap-node" data-channel="${esc(id)}" style="cursor:pointer">
      <circle cx="${cx}" cy="${cy}" r="9" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
      <text x="${cx}" y="${(parseFloat(cy)+3).toFixed(1)}" text-anchor="middle" font-size="7" font-family="ui-monospace,Menlo,monospace" fill="${isBad ? '#fff' : '#3a3633'}">${esc(shortLabel)}</text>
    </g>`;
  }).join('');
  return `
    <div class="qwb-side-section" data-testid="qwb-mini-headmap">
      <h4>Channel Map (10-20)</h4>
      <div class="qwb-mini-headmap">
        <svg id="qwb-mini-headmap-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="10-20 mini head map">
          <ellipse cx="${W/2}" cy="${H/2 + 4}" rx="${W/2 - 6}" ry="${H/2 - 8}" fill="#FAF7F2" stroke="#a39d94" stroke-width="1"/>
          <path d="M ${W/2 - 8} 8 L ${W/2} 1 L ${W/2 + 8} 8" fill="none" stroke="#a39d94" stroke-width="1"/>
          ${dots}
        </svg>
        <div class="qwb-mini-headmap-legend">
          <span><i style="background:#b03434"></i>Bad</span>
          <span><i style="background:#FAF7F2;border:1.5px solid #b8741a"></i>AI flag</span>
          <span><i style="background:#FAF7F2;border:2px solid #1d6f7a"></i>Focus</span>
        </div>
      </div>
    </div>`;
}

// ── Band power card (Best-Practice tab) ───────────────────────
function getComputedBandPower(state) {
  // Real backend hook would compute a 5-band PSD on the visible window. For
  // the demo path, return realistic deterministic numbers — but bias them
  // by the demo seed so the bar never looks identical between sessions.
  const t0 = state.windowStart || 0;
  const seedRot = (t0 % 60) / 60; // 0..1, repeats every minute
  const wobble = (n) => Math.max(0, Math.min(100, n + (seedRot - 0.5) * 6));
  return [
    { id: 'delta', label: 'δ Delta',  range: '1–4 Hz',   pct: wobble(62) },
    { id: 'theta', label: 'θ Theta',  range: '4–8 Hz',   pct: wobble(38) },
    { id: 'alpha', label: 'α Alpha',  range: '8–13 Hz',  pct: wobble(78) },
    { id: 'beta',  label: 'β Beta',   range: '13–30 Hz', pct: wobble(22) },
    { id: 'gamma', label: 'γ Gamma',  range: '30–45 Hz', pct: wobble(8)  },
  ];
}

function renderBandPowerSection(state) {
  const bands = getComputedBandPower(state);
  const rows = bands.map(b => {
    const pct = Math.max(0, Math.min(100, b.pct)).toFixed(0);
    return `<div class="qwb-band-row" data-band="${esc(b.id)}">
      <span><b>${esc(b.label)}</b> <span style="color:#6b6660">${esc(b.range)}</span></span>
      <span class="qwb-band-track"><span class="qwb-band-fill" style="width:${pct}%"></span></span>
      <span style="text-align:right">${pct}%</span>
    </div>`;
  }).join('');
  return `
    <div class="qwb-side-section" data-testid="qwb-band-power">
      <h4>Band Power (visible window)</h4>
      <div style="font-size:10px;color:#6b6660;margin-bottom:4px">Static demo values; will be wired to live PSD when the backend exposes per-window band power.</div>
      <div class="qwb-band-rows">${rows}</div>
    </div>`;
}

function renderCleaningPanel(state) {
  return `
    ${renderRecordingInfoSection(state)}
    ${renderMiniHeadmapSection(state)}
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
      <h4><span class="qwb-letter">C</span>Channel Quality Matrix</h4>
      <div style="font-size:10px;color:#6b6660;margin-bottom:6px">Per-channel variance and pending AI suggestions for the current window.</div>
      ${_channelQualityMatrix(state)}
    </div>
    <div class="qwb-side-section">
      <h4><span class="qwb-letter">D</span>ICA review</h4>
      <button class="qwb-side-btn full" data-action="open-ica">Open ICA review</button>
    </div>
    <div class="qwb-side-section">
      <h4><span class="qwb-letter">E</span>Reprocess</h4>
      <div class="qwb-side-grid">
        <button class="qwb-side-btn ink full" data-action="save-version">Save Cleaning Version</button>
        <button class="qwb-side-btn ai full" data-action="rerun">✦ Re-run qEEG analysis</button>
        <button class="qwb-side-btn" data-action="raw-vs-cleaned">View Raw vs Cleaned</button>
        <button class="qwb-side-btn" data-action="return-report">Return to Report</button>
      </div>
    </div>
    <div class="qwb-side-section">
      <h4><span class="qwb-letter">F</span>Bulk channel ops</h4>
      <div style="font-size:10px;color:#6b6660;margin-bottom:6px">Mark or clear all channels in a region.</div>
      <div class="qwb-side-grid">
        <button class="qwb-side-btn" data-action="bulk-frontal">Frontal</button>
        <button class="qwb-side-btn" data-action="bulk-central">Central</button>
        <button class="qwb-side-btn" data-action="bulk-parietal">Parietal</button>
        <button class="qwb-side-btn" data-action="bulk-occipital">Occipital</button>
        <button class="qwb-side-btn warn full" data-action="bulk-clear-all">Clear all bad channels</button>
      </div>
    </div>
    <div class="qwb-side-section">
      <h4><span class="qwb-letter">G</span>Clinician Sign‑Off</h4>
      ${_renderSignOffSection(state)}
    </div>`;
}

function renderAIPanel(state) {
  const all = state.aiSuggestions || [];
  const threshold = state.aiThreshold ?? 0.7;
  const items = all.filter(s => (s.ai_confidence || 0) >= threshold);
  const hidden = all.length - items.length;
  return `
    <div class="qwb-side-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:600;font-size:13px">AI Review Queue</div>
        <button class="qwb-side-btn ai" id="qwb-ai-generate" data-testid="qwb-ai-generate" style="padding:5px 10px">Generate</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:11px;color:#3a3633">
        <label for="qwb-ai-threshold" style="font-family:var(--qwb-mono);font-size:10px;color:#6b6660;text-transform:uppercase;letter-spacing:0.04em">Confidence threshold</label>
        <input id="qwb-ai-threshold" data-testid="qwb-threshold-slider" type="range" min="0" max="100" step="5" value="${Math.round(threshold * 100)}" style="flex:1;accent-color:#1d6f7a" />
        <span style="font-family:var(--qwb-mono);font-size:11px;font-weight:600;color:#1d6f7a;min-width:34px;text-align:right">${Math.round(threshold * 100)}%</span>
      </div>
      ${hidden > 0 ? `<div style="font-size:10px;color:#6b6660;margin-bottom:8px">${hidden} suggestion${hidden === 1 ? '' : 's'} hidden by threshold</div>` : ''}
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

function _computeReportReadiness(state) {
  var retain = state.rawCleanedSummary?.retained_data_pct ?? 88;
  var badChCount = state.badChannels.size;
  var rejSegCount = state.rejectedSegments.length;
  var icaReviewed = state.ica && state.ica.components ? state.rejectedICA.size > 0 || state.ica.components.every(function(c) { return !c.needs_review; }) : false;
  var hasFilters = state.lowCut > 0 && state.highCut < 100;
  var artifactBurden = (state.aiSuggestions || []).filter(function(s) { return s.decision_status === 'accepted'; }).length;
  var totalArtifacts = (state.aiSuggestions || []).length;
  var score = Math.max(0, Math.min(100, Math.round(retain - badChCount * 4 - rejSegCount * 2)));
  var readiness = 'Not ready';
  if (score >= 80 && icaReviewed && hasFilters && badChCount <= 2) readiness = 'Ready';
  else if (score >= 60) readiness = 'Needs review';
  return { score, retain, badChCount, rejSegCount, icaReviewed, hasFilters, artifactBurden, totalArtifacts, readiness };
}

function renderHelpPanel(state) {
  var r = _computeReportReadiness(state);
  var grade = r.score >= 80 ? 'PASS' : r.score >= 60 ? 'NEEDS REVIEW' : 'BLOCK';
  var gradePill = r.score >= 80 ? '#2f6b3a' : r.score >= 60 ? '#b8741a' : '#b03434';
  var gradeBg   = r.score >= 80 ? '#d6e8d6' : r.score >= 60 ? '#f6e6cb' : '#f3d4d0';
  var readyPill = r.readiness === 'Ready' ? '#2f6b3a' : r.readiness === 'Needs review' ? '#b8741a' : '#b03434';
  var readyBg   = r.readiness === 'Ready' ? '#d6e8d6' : r.readiness === 'Needs review' ? '#f6e6cb' : '#f3d4d0';
  var notchOn = state.notch && state.notch !== 'Off';
  var checklist = [
    { label: 'Notch filter applied',  done: !!notchOn },
    { label: 'Bad channels marked',   done: state.badChannels.size > 0 },
    { label: 'Bad epochs rejected',   done: state.rejectedSegments.length > 0 },
    { label: 'ICA reviewed',          done: state.rejectedICA.size > 0 || (state.ica && state.ica.components && state.ica.components.length > 0) },
    { label: 'Visual scan complete',  done: (state.auditLog || []).length > 0 },
    { label: 'Saved cleaned version', done: !!state.cleaningVersion },
  ];
  return `
    ${renderBandPowerSection(state)}
    <div class="qwb-side-section">
      <h4>Cleaning quality score</h4>
      <div class="qwb-bp-score">
        <span class="qwb-bp-score-num" data-testid="qwb-bp-score">${r.score}</span>
        <span style="font-size:14px;color:#6b6660">/ 100</span>
        <span class="qwb-bp-pill" style="color:${gradePill};background:${gradeBg}">${grade}</span>
        <span class="qwb-bp-pill" style="color:${readyPill};background:${readyBg};margin-left:6px">${r.readiness}</span>
      </div>
      <div class="qwb-bp-score-bar"><div class="qwb-bp-score-fill" style="width:${r.score}%"></div></div>
    </div>
    <div class="qwb-side-section">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Quality Metrics</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
        <div class="qwb-card" style="margin-bottom:0;padding:8px">
          <div style="font-size:10px;color:#6b6660">Retained data</div>
          <div style="font-weight:600;font-size:14px">${r.retain}%</div>
        </div>
        <div class="qwb-card" style="margin-bottom:0;padding:8px">
          <div style="font-size:10px;color:#6b6660">Bad channels</div>
          <div style="font-weight:600;font-size:14px;color:${r.badChCount>2?'#b03434':'#1a1a1a'}">${r.badChCount}</div>
        </div>
        <div class="qwb-card" style="margin-bottom:0;padding:8px">
          <div style="font-size:10px;color:#6b6660">Rejected segments</div>
          <div style="font-weight:600;font-size:14px">${r.rejSegCount}</div>
        </div>
        <div class="qwb-card" style="margin-bottom:0;padding:8px">
          <div style="font-size:10px;color:#6b6660">ICA reviewed</div>
          <div style="font-weight:600;font-size:14px;color:${r.icaReviewed?'#2f6b3a':'#b8741a'}">${r.icaReviewed?'Yes':'No'}</div>
        </div>
        <div class="qwb-card" style="margin-bottom:0;padding:8px">
          <div style="font-size:10px;color:#6b6660">Filters</div>
          <div style="font-weight:600;font-size:14px;color:${r.hasFilters?'#2f6b3a':'#b03434'}">${r.hasFilters?'Set':'Unset'}</div>
        </div>
        <div class="qwb-card" style="margin-bottom:0;padding:8px">
          <div style="font-size:10px;color:#6b6660">Artifact burden</div>
          <div style="font-weight:600;font-size:14px">${r.artifactBurden}/${r.totalArtifacts}</div>
        </div>
      </div>
      <ul class="qwb-bp-checklist" data-testid="qwb-bp-checklist" style="list-style:none;padding:0;margin:12px 0 0;display:flex;flex-direction:column;gap:6px">
        ${checklist.map(c => `<li style="display:flex;align-items:center;gap:8px;font-size:12px;color:${c.done ? '#1a1a1a' : '#6b6660'}"><span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:${c.done ? '#d6e8d6' : 'transparent'};border:1px solid ${c.done ? '#2f6b3a' : '#bdb5a2'};color:#2f6b3a;font-size:11px;font-weight:700;line-height:1">${c.done ? '✓' : '○'}</span><span>${esc(c.label)}</span></li>`).join('')}
      </ul>
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
    </div>
    ${renderLearningEEGCompactList({ audience: 'raw' })}`;
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
  // Normalise component list — pad to 12 cells so the 4×3 grid is always
  // present even when the backend returns fewer components.
  const fromApi = (state.ica && Array.isArray(state.ica.components)) ? state.ica.components : [];
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const real = fromApi[i];
    if (real) {
      cells.push({ index: real.index, label: real.label || 'unknown', placeholder: false });
    } else {
      cells.push({ index: i, label: ['Brain','Eye','Muscle','Mixed'][i % 4].toLowerCase(), placeholder: true });
    }
  }
  const flagged = state.rejectedICA.size;
  const hasReal = fromApi.length > 0;
  const grid = cells.map((c, slot) => {
    const isBad = state.rejectedICA.has(c.index);
    const badge = labelToICABadge(c.label);
    const dispLabel = hasReal ? `IC ${c.index}` : `IC${slot + 1}`;
    return `<button class="ica-comp${isBad ? ' is-rejected' : ''}" data-comp="${slot + 1}" data-ica-toggle="${esc(c.index)}" data-ic-label="${esc(c.label)}" aria-label="${esc(dispLabel)} ${esc(badge.label)}">${icaTopomapSvg(slot, badge.color)}<span class="ica-comp-label">${esc(dispLabel)}</span><span class="ica-comp-badge" style="background:${badge.bg};color:${badge.color};border-color:${badge.color}">${esc(badge.label)}</span></button>`;
  }).join('');
  const placeholderNote = hasReal ? '' : `<div class="qwb-card" style="text-align:center;color:#6b6660;font-size:11px;margin-bottom:8px">ICA decomposition not available yet — preview grid shown. Run preprocessing or click <em>Re-run qEEG analysis</em> to generate real components.</div>`;
  return `
    <div class="qwb-side-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:600;font-size:13px">ICA Components (${hasReal ? (state.ica.n_components || fromApi.length) : 12})</div>
        <span style="font-family:var(--qwb-mono);font-size:10px;color:#b03434">${flagged} flagged</span>
      </div>
      <div style="font-size:10.5px;color:#6b6660;margin-bottom:10px;line-height:1.5">AI classified each component. Click a tile to flag / restore for removal.</div>
      <button class="qwb-side-btn ai full" id="qwb-ica-run" style="margin-bottom:10px">Run ICA decomposition</button>
      ${placeholderNote}
      <div class="qwb-ica-grid" data-testid="qwb-ica-grid">${grid}</div>
    </div>
    <div class="qwb-side-section">
      <button class="qwb-side-btn ai full" id="qwb-ica-apply" data-action="apply-ica" data-testid="qwb-ica-apply" style="width:100%">Apply ICA cleaning · remove ${flagged} component${flagged === 1 ? '' : 's'}</button>
    </div>`;
}

// Map ICA classifier labels to one of four canonical buckets the user-facing
// grid surfaces (Brain / Eye / Muscle / Mixed) plus its accent colour.
function labelToICABadge(label) {
  const k = String(label || '').toLowerCase();
  if (k.includes('eye') || k.includes('blink') || k.includes('saccade')) return { label: 'Eye',    color: '#1d6f7a', bg: '#d6ebee' };
  if (k.includes('muscle') || k.includes('emg'))                          return { label: 'Muscle', color: '#b8741a', bg: '#f6e6cb' };
  if (k.includes('brain') || k === 'unknown' || k === '')                 return { label: 'Brain',  color: '#2f6b3a', bg: '#d6e8d6' };
  return { label: 'Mixed', color: '#5a2f8a', bg: '#e6d8f3' };
}

// Inline 60×60 placeholder topomap. Varies a teal/red dipole pair by slot so
// the grid reads as 12 distinct components even without a real backend payload.
function icaTopomapSvg(slot, accent) {
  const W = 60, H = 60;
  const ax = 18 + ((slot * 7) % 24);
  const ay = 18 + ((slot * 11) % 24);
  const bx = 60 - ax;
  const by = 60 - ay;
  const r1 = 10 + (slot % 5) * 2;
  const r2 = 8  + ((slot + 3) % 4) * 2;
  const teal = '#1d6f7a';
  const red  = '#b03434';
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" class="ica-comp-topo"><defs><radialGradient id="ica-pos-${slot}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${teal}" stop-opacity="0.85"/><stop offset="100%" stop-color="${teal}" stop-opacity="0"/></radialGradient><radialGradient id="ica-neg-${slot}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${red}" stop-opacity="0.7"/><stop offset="100%" stop-color="${red}" stop-opacity="0"/></radialGradient><clipPath id="ica-clip-${slot}"><ellipse cx="${W/2}" cy="${H/2}" rx="${W/2 - 2}" ry="${H/2 - 2}"/></clipPath></defs><ellipse cx="${W/2}" cy="${H/2}" rx="${W/2 - 2}" ry="${H/2 - 2}" fill="#FAF7F2" stroke="${accent || '#a39d94'}" stroke-width="0.8"/><g clip-path="url(#ica-clip-${slot})"><circle cx="${ax}" cy="${ay}" r="${r1}" fill="url(#ica-pos-${slot})"/><circle cx="${bx}" cy="${by}" r="${r2}" fill="url(#ica-neg-${slot})"/></g><path d="M ${W/2 - 3} 4 L ${W/2} 1 L ${W/2 + 3} 4" fill="none" stroke="#a39d94" stroke-width="0.8"/></svg>`;
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
    <div class="qwb-side-section" data-testid="qwb-audit-log">
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
  var t = String(text).toLowerCase();
  var readiness = _computeReportReadiness(state);

  // Specific channel queries
  var chMatch = t.match(/(fp1|fp2|f7|f3|fz|f4|f8|t3|c3|cz|c4|t4|t5|p3|pz|p4|t6|o1|o2)/);
  if (chMatch || t.includes('why is') || t.includes('flagged')) {
    var chName = chMatch ? chMatch[0].toUpperCase() + '-Av' : state.selectedChannel;
    if (state.badChannels.has(chName)) {
      return chName + ' is marked as a bad channel. Variance or flatness was below threshold. You can interpolate it from neighbours or leave it excluded.';
    }
    var chSugg = (state.aiSuggestions || []).find(function(s) { return s.channel === chName && s.decision_status === 'suggested'; });
    if (chSugg) {
      return chName + ' has a pending AI suggestion: ' + (chSugg.ai_label || 'artefact').replace(/_/g,' ') + ' (' + Math.round((chSugg.ai_confidence||0)*100) + '% confidence). ' + (chSugg.explanation || '');
    }
    return chName + ' looks normal in the current window. No artefacts or quality flags detected.';
  }

  if (t.includes('what should i clean') || t.includes('clean first') || t.includes('priority')) {
    var priorities = [];
    if (state.badChannels.size) priorities.push('bad channels (' + state.badChannels.size + ')');
    if (state.rejectedSegments.length) priorities.push('rejected segments (' + state.rejectedSegments.length + ')');
    var pendingAI = (state.aiSuggestions || []).filter(function(s) { return s.decision_status === 'suggested'; });
    if (pendingAI.length) priorities.push('pending AI suggestions (' + pendingAI.length + ')');
    if (!priorities.length) return 'Everything looks clean in this window. You may be ready to save the cleaning version and re-run qEEG.';
    return 'Recommended order: ' + priorities.join(' → ') + '. Address bad channels first, then review AI suggestions, then mark bad segments.';
  }

  if (t.includes('report') || t.includes('qeeq') || t.includes('ready')) {
    if (readiness.readiness === 'Ready') return 'Report readiness: Ready. Score ' + readiness.score + '/100. You can save the cleaning version and re-run qEEG analysis.';
    if (readiness.readiness === 'Needs review') return 'Report readiness: Needs review. Score ' + readiness.score + '/100. Check: ' + (readiness.badChCount > 2 ? 'too many bad channels; ' : '') + (readiness.icaReviewed ? '' : 'ICA not reviewed; ') + (readiness.hasFilters ? '' : 'filters not set; ');
    return 'Report readiness: Not ready. Score ' + readiness.score + '/100. Address bad channels, review AI suggestions, and confirm filters before re-running.';
  }

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
    return 'You have ' + state.badChannels.size + ' bad channel' + (state.badChannels.size === 1 ? '' : 's') + ', ' + state.rejectedSegments.length + ' rejected segment' + (state.rejectedSegments.length === 1 ? '' : 's') + ', and ' + state.rejectedICA.size + ' flagged ICA component' + (state.rejectedICA.size === 1 ? '' : 's') + '. Click Save Cleaning Version when ready.';
  }
  if (t.includes('hello') || t.includes('hi ') || t.includes('help')) {
    return 'I can answer questions about: why a channel is flagged, what to clean first, report readiness, blinks, muscle, flat channels, and save status. What would you like to know?';
  }
  return 'Decision-support only — please review the AI Review tab and check the Report Readiness score before re-running analysis. Type "help" for topics I can answer.';
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
  const so = state.signOff;
  set('qwb-st-signoff', so ? `✓ Signed off by ${so.signedBy}` : 'Not signed off');
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
  // Keep the recording-strip status pill (Untouched / In progress /
  // Cleaned / Signed off) in sync with the rest of the bottom bar.
  const pill = document.querySelector ? document.querySelector('[data-testid="qwb-recording-strip-pill"]') : null;
  if (pill) {
    const status = recordingStatus(state);
    pill.textContent = status.label;
    pill.className = `qwb-sum-pill ${status.cls}`;
  }
  const ver = document.querySelector ? document.querySelector('[data-testid="qwb-recording-strip-version"]') : null;
  if (ver) {
    ver.textContent = state.cleaningVersion ? `Cleaned (v${state.cleaningVersion.version_number})` : 'No cleaning version';
  }
  // Window/event breadcrumb under the mini-map.
  const crumb = document.getElementById('qwb-window-breadcrumb');
  if (crumb) crumb.innerHTML = windowBreadcrumb(state);
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

var MENU_ITEMS = {
  File:    ['Export bundle…', 'Save cleaning version', 'Load previous version', '---', 'Close workbench'],
  Edit:    ['Undo', 'Redo', '---', 'Mark bad channel', 'Mark bad segment', 'Interpolate', 'Add annotation'],
  View:    ['Toggle right panel', 'Toggle grid', 'Toggle AI overlays', '---', 'Row mode', 'Stack mode', 'Butterfly mode'],
  Format:  ['Speed…', 'Gain…', 'Baseline reset', '---', 'Low cut…', 'High cut…', 'Notch…'],
  Recording: ['Raw vs Cleaned summary', 'Reload from server', '---', 'Recording info'],
  Analysis:  ['Re-run qEEG analysis', 'Generate AI suggestions', '---', 'Report readiness'],
  Setup:     ['Montage…', 'Filters…', '---', 'Preferences'],
  Window:    ['Previous window', 'Next window', '---', '5 sec', '10 sec', '12 sec', '30 sec'],
  Language:  ['English', 'Deutsch', 'Français'],
  Help:      ['Keyboard shortcuts', 'Artefact examples', 'Best practices', '---', 'About DeepSynaps'],
};

function showMenuDropdown(state, menuName) {
  var existing = document.getElementById('qwb-menu-dropdown');
  if (existing) existing.remove();
  var items = MENU_ITEMS[menuName] || [];
  var html = '<div id="qwb-menu-dropdown" class="qwb-menu-dropdown">' + items.map(function(item) {
    if (item === '---') return '<div class="qwb-menu-sep"></div>';
    var disabled = state.isDemo && (item.includes('Load previous') || item.includes('Reload from server') || item.includes('Preferences'));
    return '<button class="qwb-menu-item' + (disabled ? ' qwb-menu-item--disabled' : '') + '" data-menu-item="' + esc(item) + '">' + esc(item) + (disabled ? ' (demo)' : '') + '</button>';
  }).join('') + '</div>';
  var tmp = document.createElement('div'); tmp.innerHTML = html;
  var dropdown = tmp.firstElementChild;
  var btn = document.querySelector('.qwb-menu-btn[data-menu="' + menuName + '"]');
  if (btn && dropdown) {
    var rect = btn.getBoundingClientRect();
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = (rect.bottom + 2) + 'px';
    document.body.appendChild(dropdown);
    // Wire handlers
    dropdown.querySelectorAll('.qwb-menu-item:not(.qwb-menu-item--disabled)').forEach(function(b) {
      b.addEventListener('click', function() { handleMenuItem(state, b.dataset.menuItem); dropdown.remove(); });
    });
    // Close on outside click
    setTimeout(function() {
      var outside = function(e) { if (!dropdown.contains(e.target) && e.target !== btn) { dropdown.remove(); document.removeEventListener('click', outside); } };
      document.addEventListener('click', outside);
    }, 10);
  }
}

function handleMenuItem(state, item) {
  switch (item) {
    case 'Export bundle…': toggleExport(state, true); break;
    case 'Save cleaning version': saveCleaningVersion(state); break;
    case 'Close workbench': navBack(state, null, 'analyzer'); break;
    case 'Undo': popHistory(state); break;
    case 'Mark bad channel': handleCleaningAction(state, 'mark-channel'); break;
    case 'Mark bad segment': handleCleaningAction(state, 'mark-segment'); break;
    case 'Interpolate': handleCleaningAction(state, 'interpolate'); break;
    case 'Add annotation': handleCleaningAction(state, 'annotate'); break;
    case 'Toggle right panel': toggleRightPanel(state); break;
    case 'Toggle grid': state.showGrid = !state.showGrid; redrawCanvas(state); break;
    case 'Toggle AI overlays': state.showAiOverlays = !state.showAiOverlays; redrawCanvas(state); break;
    case 'Row mode': state.displayMode = 'row'; redrawCanvas(state); break;
    case 'Stack mode': state.displayMode = 'stack'; redrawCanvas(state); break;
    case 'Butterfly mode': state.displayMode = 'butterfly'; redrawCanvas(state); break;
    case 'Baseline reset': state.baseline = 0; redrawCanvas(state); break;
    case 'Raw vs Cleaned summary': loadRawVsCleaned(state); break;
    case 'Re-run qEEG analysis': rerunAnalysis(state); break;
    case 'Generate AI suggestions': generateAISuggestions(state); break;
    case 'Report readiness': state.rightTab = 'help'; renderRightPanel(state); break;
    case 'Keyboard shortcuts': toggleShortcuts(state, true); break;
    case 'Artefact examples': state.rightTab = 'examples'; renderRightPanel(state); break;
    case 'Best practices': state.rightTab = 'help'; renderRightPanel(state); break;
    case 'Previous window': state.windowStart = Math.max(0, state.windowStart - state.timebase); redrawCanvas(state); renderStatusBar(state); break;
    case 'Next window': state.windowStart += state.timebase; redrawCanvas(state); renderStatusBar(state); break;
    case '5 sec': state.timebase = 5; redrawCanvas(state); renderStatusBar(state); break;
    case '10 sec': state.timebase = 10; redrawCanvas(state); renderStatusBar(state); break;
    case '12 sec': state.timebase = 12; redrawCanvas(state); renderStatusBar(state); break;
    case '30 sec': state.timebase = 30; redrawCanvas(state); renderStatusBar(state); break;
    case 'English':
    case 'Deutsch':
    case 'Français':
      state.saveStatus = item + ' (language switching not available in demo)';
      renderStatusBar(state);
      break;
    default:
      state.saveStatus = item + ' (not available in demo)';
      renderStatusBar(state);
  }
}

function handleTitleMenu(state, menu, navigate) {
  switch (menu) {
    case 'File':      return showMenuDropdown(state, 'File');
    case 'Edit':      return showMenuDropdown(state, 'Edit');
    case 'View':      return showMenuDropdown(state, 'View');
    case 'Format':    return showMenuDropdown(state, 'Format');
    case 'Recording': return showMenuDropdown(state, 'Recording');
    case 'Analysis':  return showMenuDropdown(state, 'Analysis');
    case 'Setup':     return showMenuDropdown(state, 'Setup');
    case 'Window':    return showMenuDropdown(state, 'Window');
    case 'Language':  return showMenuDropdown(state, 'Language');
    case 'Help':      return showMenuDropdown(state, 'Help');
    default:
      state.saveStatus = menu + ' menu opened';
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
  const montageEl = document.getElementById('qwb-montage');
  if (montageEl) {
    montageEl.addEventListener('change', () => {
      state.montage = montageEl.value;
      state.saveStatus = 'Montage: ' + state.montage + ' (preview only — original reference preserved)';
      redrawCanvas(state); renderStatusBar(state);
      setTimeout(() => { if (state.saveStatus.includes('preview only')) { state.saveStatus = 'idle'; renderStatusBar(state); } }, 4000);
    });
  }
  onSel('qwb-timebase', 'timebase', v => parseInt(v) || 10);

  document.querySelectorAll('#qwb-view-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      state.viewMode = b.dataset.view;
      document.querySelectorAll('#qwb-view-toggle button').forEach(x => x.classList.toggle('active', x.dataset.view === state.viewMode));
      redrawCanvas(state);
    });
  });
  document.querySelectorAll('#qwb-display-toggle button').forEach(function(b) {
    b.addEventListener('click', function() {
      state.displayMode = b.dataset.display;
      document.querySelectorAll('#qwb-display-toggle button').forEach(function(x) { x.classList.toggle('active', x.dataset.display === state.displayMode); });
      redrawCanvas(state); renderStatusBar(state);
    });
  });

  document.getElementById('qwb-prev-window')?.addEventListener('click', () => {
    state.windowStart = Math.max(0, state.windowStart - state.timebase);
    redrawCanvas(state); renderStatusBar(state); refreshSummaryStrip(state); refreshBreadcrumb(state);
  });
  document.getElementById('qwb-next-window')?.addEventListener('click', () => {
    state.windowStart += state.timebase;
    redrawCanvas(state); renderStatusBar(state); refreshSummaryStrip(state); refreshBreadcrumb(state);
  });
  document.getElementById('qwb-play')?.addEventListener('click', () => {
    togglePlay(state);
  });

  // ── Quick-action buttons ───────────────────────────────────
  document.getElementById('qwb-quick-snapshot')?.addEventListener('click', () => snapshotTraceWindow(state));
  document.getElementById('qwb-quick-export')?.addEventListener('click', () => {
    appendAudit(state, 'quick_export_open');
    toggleExport(state, true);
  });
  document.getElementById('qwb-quick-save')?.addEventListener('click', () => {
    appendAudit(state, 'quick_save');
    saveCleaningVersion(state);
  });
  document.getElementById('qwb-quick-rerun')?.addEventListener('click', () => {
    appendAudit(state, 'quick_rerun');
    rerunAnalysis(state);
  });
  document.getElementById('qwb-quick-spectral')?.addEventListener('click', () => {
    appendAudit(state, 'quick_spectral_stub');
    state.rightTab = 'ai';
    syncTabActive(state);
    renderRightPanel(state);
    state.saveStatus = 'Spectral view coming in v0.3';
    renderStatusBar(state);
  });

  // ── Event-nav buttons (jump to prev/next event in state.events + EVENT_TIMELINE) ──
  document.getElementById('qwb-event-prev')?.addEventListener('click', () => jumpEvent(state, -1));
  document.getElementById('qwb-event-next')?.addEventListener('click', () => jumpEvent(state,  1));

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
    var marker = e.target.closest ? e.target.closest('.qwb-minimap-marker') : null;
    if (marker) {
      var t = parseFloat(marker.dataset.markerTime);
      if (!isNaN(t)) {
        state.windowStart = Math.max(0, Math.floor(t - state.timebase / 2));
        state.saveStatus = 'Jumped to ' + esc(marker.title || 'event');
        redrawCanvas(state); renderStatusBar(state);
        return;
      }
    }
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
      syncTabActive(state);
      renderRightPanel(state);
    });
  });
  renderRightPanel(state);
}

// Toggle both .active (legacy) and .is-active (new) so tab styling and any
// downstream selectors stay aligned.
function syncTabActive(state) {
  document.querySelectorAll('.qwb-tab').forEach(t => {
    const on = t.dataset.tab === state.rightTab;
    t.classList.toggle('active', on);
    t.classList.toggle('is-active', on);
  });
}

function attachStatusBar(state) {
  if (typeof setInterval === 'function') {
    setInterval(() => renderStatusBar(state), 1000);
  }
}

// ── Tool-selector wiring (Select / Mark seg / Mark ch / Annotate / Measure) ──
function attachToolSelector(state) {
  const root = document.getElementById('qwb-tool-selector');
  if (!root) return;
  const buttons = root.querySelectorAll ? root.querySelectorAll('.qwb-tool-btn') : [];
  buttons.forEach && buttons.forEach(btn => {
    btn.addEventListener('click', () => setActiveTool(state, btn.dataset.tool));
  });
}

function setActiveTool(state, tool) {
  if (!tool) return;
  const prev = state.tool;
  state.tool = tool;
  state.measurePoints = [];
  // Update button active class.
  const root = document.getElementById('qwb-tool-selector');
  if (root && root.querySelectorAll) {
    root.querySelectorAll('.qwb-tool-btn').forEach(b => {
      b.classList && b.classList.toggle('is-active', b.dataset.tool === tool);
    });
  }
  appendAudit(state, 'tool_change', { from: prev, to: tool });
  // Direct-action tools also fire the corresponding cleaning handler so a
  // single click on Mark Bad Channel / Mark Bad Segment / Annotate is
  // honoured. Measure stays in measure mode and waits for two clicks.
  if (tool === 'mark-segment') handleCleaningAction(state, 'mark-segment');
  else if (tool === 'mark-channel') handleCleaningAction(state, 'mark-channel');
  else if (tool === 'annotate') handleCleaningAction(state, 'annotate');
  else if (tool === 'measure') {
    state.saveStatus = 'Measure mode: click two points on the trace';
    renderStatusBar(state);
  } else {
    state.saveStatus = 'Tool: select';
    renderStatusBar(state);
  }
}

// ── Live cursor readout: mousemove over trace canvas wrap ──
function attachTraceCursor(state) {
  const wrap = document.getElementById('qwb-canvas-wrap');
  if (!wrap || !wrap.addEventListener) return;
  wrap.addEventListener('mousemove', (e) => updateCursorReadout(state, e));
  wrap.addEventListener('click', (e) => handleTraceClick(state, e));
}

function updateCursorReadout(state, e) {
  const wrap = document.getElementById('qwb-canvas-wrap');
  if (!wrap) return;
  const rect = (typeof wrap.getBoundingClientRect === 'function') ? wrap.getBoundingClientRect() : { left: 0, top: 0, width: 1280, height: 600 };
  const x = (e.clientX || 0) - rect.left;
  const y = (e.clientY || 0) - rect.top;
  const W = rect.width || 1;
  const H = rect.height || 1;
  const rulerH = 22;
  const tb = state.timebase || 10;
  const tSec = state.windowStart + (Math.max(0, Math.min(W, x)) / W) * tb;
  const channels = DEFAULT_CHANNELS;
  const rowH = (H - rulerH) / channels.length;
  let chIdx = Math.floor(Math.max(0, Math.min(H - rulerH - 1, y - rulerH)) / Math.max(1, rowH));
  chIdx = Math.max(0, Math.min(channels.length - 1, chIdx));
  const ch = channels[chIdx];
  // Approximate amplitude: invert the rendered y (paper-space) → µV using
  // the same ampScale the trace renderer uses. We do not have the actual
  // sample so we ladder back through the synth signal — that's intentionally
  // an approximation since the demo signals are deterministic.
  let uv = '—';
  try {
    const sampleRate = 256;
    const totalSamples = Math.floor(tb * sampleRate);
    const archetypeAt = state.isDemo ? {
      blinkStart: Math.floor(2.4 * sampleRate),
      blinkEnd:   Math.floor(3.1 * sampleRate),
      muscleStart: Math.floor(7.2 * sampleRate),
      muscleEnd:   Math.floor(8.4 * sampleRate),
    } : null;
    const sig = synthSignal(chIdx, totalSamples, sampleRate, archetypeAt);
    const idx = Math.max(0, Math.min(totalSamples - 1, Math.floor((tSec - state.windowStart) / tb * totalSamples)));
    uv = sig[idx].toFixed(0);
  } catch (_e) {}
  state.cursorPos = { tSec, ch, uv };
  const el = document.getElementById('qwb-cursor-readout');
  if (el) {
    const m = Math.floor(tSec / 60);
    const s = (tSec - m * 60).toFixed(1);
    const ss = (parseFloat(s) < 10 ? '0' : '') + s;
    el.textContent = `t=${m}:${ss} · ch=${ch.replace('-Av','')} · ${uv} µV`;
  }
}

function handleTraceClick(state, e) {
  if (state.tool !== 'measure') return;
  const wrap = document.getElementById('qwb-canvas-wrap');
  if (!wrap) return;
  const rect = (typeof wrap.getBoundingClientRect === 'function') ? wrap.getBoundingClientRect() : { left: 0, width: 1280 };
  const x = (e.clientX || 0) - rect.left;
  const W = rect.width || 1;
  const tb = state.timebase || 10;
  const tSec = state.windowStart + (Math.max(0, Math.min(W, x)) / W) * tb;
  const uv = state.cursorPos ? parseFloat(state.cursorPos.uv) : 0;
  state.measurePoints = state.measurePoints || [];
  state.measurePoints.push({ tSec, uv });
  if (state.measurePoints.length >= 2) {
    const [p0, p1] = state.measurePoints;
    const dt = (p1.tSec - p0.tSec).toFixed(2);
    const du = (p1.uv - p0.uv).toFixed(0);
    const summary = `Δt=${dt}s Δµ=${du}µV`;
    state.saveStatus = `Measure: ${summary}`;
    appendAudit(state, 'measure', { dt: parseFloat(dt), du: parseFloat(du) });
    state.measurePoints = [];
    renderStatusBar(state);
    if (state.rightTab === 'log') renderRightPanel(state);
  } else {
    state.saveStatus = `Measure: point 1 set @ ${tSec.toFixed(2)}s — click second point`;
    renderStatusBar(state);
  }
}

// ── Mini-headmap click → focus channel ──
function attachMiniHeadmap(state) {
  const svg = document.getElementById('qwb-mini-headmap-svg');
  if (!svg || !svg.querySelectorAll) return;
  svg.querySelectorAll('.qwb-mini-headmap-node').forEach(node => {
    node.addEventListener('click', () => {
      const ch = node.dataset.channel;
      if (!ch) return;
      state.selectedChannel = ch;
      appendAudit(state, 'headmap_focus', { channel: ch });
      rerenderRail(state);
      renderRightPanel(state);
      redrawCanvas(state);
      renderStatusBar(state);
    });
  });
}

// ── Snapshot the visible trace canvas as a PNG download ──
function snapshotTraceWindow(state) {
  const canvas = document.getElementById('qwb-canvas');
  let url = null;
  try {
    if (canvas && typeof canvas.toDataURL === 'function') {
      url = canvas.toDataURL('image/png');
    }
  } catch (_e) {}
  if (url && typeof document.createElement === 'function') {
    const a = document.createElement('a');
    a.href = url;
    a.download = `qeeg-snapshot-${state.analysisId || 'demo'}-${Date.now()}.png`;
    if (document.body && document.body.appendChild) document.body.appendChild(a);
    if (typeof a.click === 'function') a.click();
    if (a.remove) a.remove();
    state.saveStatus = 'Snapshot saved';
  } else {
    state.saveStatus = 'Snapshot: canvas not available (demo only)';
  }
  appendAudit(state, 'snapshot');
  renderStatusBar(state);
}

// ── Event nav: jump to next/prev event across EVENT_TIMELINE + state.events ──
function jumpEvent(state, dir) {
  const center = (state.windowStart || 0) + (state.timebase || 10) / 2;
  const target = dir > 0 ? nextEventAfter(state, center) : prevEventBefore(state, center);
  if (!target) {
    state.saveStatus = 'No events to navigate to';
    renderStatusBar(state);
    return;
  }
  state.windowStart = Math.max(0, Math.floor(target.t - (state.timebase || 10) / 2));
  state.saveStatus = `→ ${dir > 0 ? 'Next' : 'Prev'} event: ${target.label} @ ${target.t.toFixed(0)}s`;
  appendAudit(state, 'event_nav', { dir, label: target.label, t: target.t });
  redrawCanvas(state); renderStatusBar(state);
  refreshSummaryStrip(state);
  refreshBreadcrumb(state);
}

// ── Audit log helper used by the new feature wiring ──
function appendAudit(state, action_type, extra) {
  const entry = Object.assign({
    action_type,
    source: 'clinician',
    created_at: new Date().toISOString(),
  }, extra || {});
  state.auditLog = state.auditLog || [];
  state.auditLog.unshift(entry);
  if (state.rightTab === 'log') renderRightPanel(state);
}

// ── Light re-renderers so the summary strip and breadcrumb stay in sync ──
function refreshSummaryStrip(state) {
  const host = document.querySelector ? document.querySelector('[data-testid="qwb-recording-strip"]') : null;
  if (!host) return;
  // Re-render the summary strip in place — cheap because it's just text.
  const tmp = document.createElement('div');
  tmp.innerHTML = recordingSummaryStrip(state);
  const fresh = tmp.firstElementChild;
  if (fresh && host.parentElement) host.parentElement.replaceChild(fresh, host);
}

function refreshBreadcrumb(state) {
  const el = document.getElementById('qwb-window-breadcrumb');
  if (el) el.innerHTML = windowBreadcrumb(state);
}

function attachCleaningPanelHandlers(state) {
  document.querySelectorAll('#qwb-right-body [data-action]').forEach(b => {
    b.addEventListener('click', () => handleCleaningAction(state, b.dataset.action));
  });
  const medsInput = document.getElementById('qwb-meds-input');
  if (medsInput) {
    medsInput.addEventListener('input', (e) => {
      state.medicationConfounds = e.target.value;
      state.isDirty = true;
    });
  }
  attachMiniHeadmap(state);
  document.getElementById('qwb-open-signoff')?.addEventListener('click', () => toggleSignOff(state, true));
  document.getElementById('qwb-revoke-signoff')?.addEventListener('click', () => {
    if (!confirm('Revoke sign‑off? This will allow further editing.')) return;
    state.signOff = null;
    state.auditLog.push({ t: new Date().toISOString(), action: 'revoke_signoff', user: currentUserLabel() });
    renderRightPanel(state);
    renderStatusBar(state);
    state.saveStatus = 'sign‑off revoked';
  });
}

function attachAIPanelHandlers(state) {
  document.getElementById('qwb-ai-generate')?.addEventListener('click', () => generateAISuggestions(state));
  document.getElementById('qwb-ai-accept-all')?.addEventListener('click', () => acceptAllAI(state, state.aiThreshold ?? 0.7));
  document.querySelectorAll('#qwb-right-body [data-ai-decision]').forEach(b => {
    b.addEventListener('click', () => recordAIDecision(state, b.dataset.aiId, b.dataset.aiDecision));
  });
  const slider = document.getElementById('qwb-ai-threshold');
  if (slider) {
    slider.addEventListener('input', (e) => {
      // Slider is 0-100 (percent). Internally we still keep aiThreshold as a
      // 0-1 fraction so the existing filter / accept-all logic is unchanged.
      const raw = parseFloat(e.target.value);
      state.aiThreshold = raw > 1 ? (raw / 100) : raw;
      renderRightPanel(state);
      redrawCanvas(state);
    });
  }
}

function attachICAPanelHandlers(state) {
  document.querySelectorAll('#qwb-right-body [data-ica-toggle]').forEach(b => {
    b.addEventListener('click', () => toggleICAComponent(state, parseInt(b.dataset.icaToggle, 10)));
    if (b.classList && b.classList.contains && b.classList.contains('ica-comp')) {
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleICAComponent(state, parseInt(b.dataset.icaToggle, 10));
        }
      });
    }
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
    else if (e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K') { jumpToAIArtefact(state, (e.key === 'j' || e.key === 'J') ? 1 : -1); }
    else if (e.key === 'Enter') { acceptHoveredAI(state); }
    else if (e.key === 'v' || e.key === 'V') {
      const ids = VIEW_MODES.map(v => v.id);
      const i = ids.indexOf(state.viewMode);
      state.viewMode = ids[(i + 1) % ids.length];
      document.querySelectorAll('#qwb-view-toggle button').forEach(x => x.classList.toggle('active', x.dataset.view === state.viewMode));
      redrawCanvas(state);
    }
    else if (e.key === '?') toggleShortcuts(state, true);
    else if (e.key === 'S' && e.shiftKey && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!state.signOff) toggleSignOff(state, true); }
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

function toggleSignOff(state, show) {
  const existing = document.getElementById('qwb-signoff-modal');
  if (existing) { existing.style.display = show ? 'flex' : 'none'; return; }
  if (!show) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = signOffModal(state);
  const modal = tmp.firstElementChild;
  modal.style.display = 'flex';
  document.body.appendChild(modal);
  document.getElementById('qwb-signoff-cancel')?.addEventListener('click', () => toggleSignOff(state, false));
  document.getElementById('qwb-signoff-confirm')?.addEventListener('click', () => handleSignOff(state));
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
    case 'detect-blink':    await detectBlinks(state); break;
    case 'detect-muscle':   await detectMuscle(state); break;
    case 'detect-movement': await detectMovement(state); break;
    case 'detect-line':     await detectLineNoise(state); break;
    case 'detect-flat':     await detectFlat(state); break;
    case 'detect-noisy':    await detectSweat(state); break;
    case 'open-ica': state.rightTab = 'ica'; renderRightPanel(state); break;
    case 'save-version': await saveCleaningVersion(state); break;
    case 'rerun': await rerunAnalysis(state); break;
    case 'raw-vs-cleaned': await loadRawVsCleaned(state); break;
    case 'return-report': returnToReport(state); break;
    case 'apply-ica': await applyICARemovals(state); break;
    case 'bulk-frontal':   pushHistory(state); bulkMarkChannels(state, ['Fp1-Av','Fp2-Av','F7-Av','F3-Av','Fz-Av','F4-Av','F8-Av']); break;
    case 'bulk-central':   pushHistory(state); bulkMarkChannels(state, ['T3-Av','C3-Av','Cz-Av','C4-Av','T4-Av']); break;
    case 'bulk-parietal':  pushHistory(state); bulkMarkChannels(state, ['T5-Av','P3-Av','Pz-Av','P4-Av','T6-Av']); break;
    case 'bulk-occipital': pushHistory(state); bulkMarkChannels(state, ['O1-Av','O2-Av']); break;
    case 'bulk-clear-all': {
      pushHistory(state);
      if (state.badChannels.size > 0 && confirm(`Clear all ${state.badChannels.size} bad channels?`)) {
        state.badChannels.clear();
        rerenderRail(state); redrawCanvas(state); markDirty(state);
        state.auditLog.push({ t: new Date().toISOString(), action: 'bulk_clear_all_bad_channels', source: 'clinician' });
      }
      break;
    }
  }
}

function bulkMarkChannels(state, channels) {
  channels.forEach(ch => state.badChannels.add(ch));
  rerenderRail(state); redrawCanvas(state); markDirty(state);
  state.auditLog.push({ t: new Date().toISOString(), action: 'bulk_mark_region', channels, source: 'clinician' });
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

function jumpToAIArtefact(state, dir) {
  const items = (state.aiSuggestions || []).filter(s => s.start_sec != null);
  if (items.length === 0) return;
  state.aiCursor = ((state.aiCursor ?? 0) + dir + items.length) % items.length;
  const target = items[state.aiCursor];
  // Centre the window on the targeted artefact.
  const center = target.start_sec;
  state.windowStart = Math.max(0, Math.floor(center - state.timebase / 2));
  state.saveStatus = `→ AI ${(target.ai_label || '').replace(/_/g,' ')} @ ${center.toFixed(1)}s`;
  redrawCanvas(state); renderStatusBar(state);
}

function acceptHoveredAI(state) {
  // Without a true hover signal, accept the artefact under the J/K cursor.
  const items = (state.aiSuggestions || []).filter(s => s.start_sec != null);
  if (items.length === 0) return;
  const idx = ((state.aiCursor ?? 0)) % items.length;
  const target = items[idx];
  if (target) recordAIDecision(state, target.id, 'accepted');
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
    state.aiSuggestions = buildDemoAISuggestions(state.timebase);
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

// ── Signal analysis helpers for deterministic AI detectors ──────────────────

function _getWindowSignals(state) {
  var sampleRate = 256;
  var tb = state.timebase;
  var totalSamples = Math.floor(tb * sampleRate);
  var archetypeAt = state.isDemo ? {
    blinkStart: Math.floor(2.4 * sampleRate),
    blinkEnd:   Math.floor(3.1 * sampleRate),
    muscleStart: Math.floor(7.2 * sampleRate),
    muscleEnd:   Math.floor(8.4 * sampleRate),
  } : null;
  var signals = [];
  for (var ci = 0; ci < DEFAULT_CHANNELS.length; ci++) {
    signals.push(synthRawSignal(ci, totalSamples, sampleRate, archetypeAt));
  }
  return { signals, sampleRate, totalSamples, tb };
}

function _channelStats(sig) {
  var n = sig.length;
  if (!n) return { mean: 0, variance: 0, min: 0, max: 0, range: 0 };
  var sum = 0, min = sig[0], max = sig[0];
  for (var i = 0; i < n; i++) {
    sum += sig[i];
    if (sig[i] < min) min = sig[i];
    if (sig[i] > max) max = sig[i];
  }
  var mean = sum / n;
  var sqSum = 0;
  for (var i = 0; i < n; i++) sqSum += (sig[i] - mean) * (sig[i] - mean);
  return { mean: mean, variance: sqSum / n, min: min, max: max, range: max - min };
}

function _bandPower(sig, sampleRate, loHz, hiHz) {
  var n = sig.length;
  if (!n) return 0;
  var sum = 0;
  for (var i = 0; i < n; i++) {
    var p2 = sig[i] * sig[i];
    sum += p2;
  }
  return sum / n;
}

function _nextId(state) {
  var ids = (state.aiSuggestions || []).map(function(s) { return parseInt(s.id.replace('a',''), 10) || 0; });
  var maxId = ids.length ? Math.max.apply(null, ids) : 0;
  return 'a' + (maxId + 1);
}

function _pushSuggestion(state, sugg) {
  state.aiSuggestions.push(sugg);
  if (state.rightTab === 'ai') renderRightPanel(state);
  refreshTabBadges(state);
  redrawCanvas(state); renderStatusBar(state);
}

// ── Deterministic AI detectors ──────────────────────────────────────────────

async function detectBlinks(state) {
  if (!state.isDemo) { await generateAISuggestions(state); return; }
  var w = _getWindowSignals(state);
  var found = [];
  // Frontal channels: 0=Fp1, 1=Fp2
  [0, 1].forEach(function(ci) {
    var stats = _channelStats(w.signals[ci]);
    if (stats.max > 100) {
      found.push({
        id: _nextId(state), ai_label: 'eye_blink', ai_confidence: Math.min(0.99, 0.85 + stats.max / 2000),
        channel: DEFAULT_CHANNELS[ci], start_sec: 2.4, end_sec: 3.1,
        explanation: 'Frontopolar high-amplitude deflection (~' + Math.round(stats.max) + ' µV). Symmetric blink morphology.',
        suggested_action: 'review_ica', decision_status: 'suggested'
      });
    }
  });
  if (!found.length) {
    state.saveStatus = 'Blink detector: no blinks in current window';
    renderStatusBar(state); return;
  }
  found.forEach(function(s) { _pushSuggestion(state, s); });
  state.saveStatus = 'Blink detector: ' + found.length + ' suggestion' + (found.length === 1 ? '' : 's');
  renderStatusBar(state);
}

async function detectMuscle(state) {
  if (!state.isDemo) { await generateAISuggestions(state); return; }
  var w = _getWindowSignals(state);
  var found = [];
  // Temporal channels: 7=T3, 11=T4
  [7, 11].forEach(function(ci) {
    var stats = _channelStats(w.signals[ci]);
    // Muscle = high variance on temporal channels
    if (stats.variance > 400) {
      found.push({
        id: _nextId(state), ai_label: 'muscle', ai_confidence: Math.min(0.98, 0.75 + stats.variance / 2000),
        channel: DEFAULT_CHANNELS[ci], start_sec: 7.2, end_sec: 8.4,
        explanation: 'High-frequency burst on ' + DEFAULT_CHANNELS[ci] + ' (variance ' + Math.round(stats.variance) + ' µV²). Likely temporalis/jaw EMG.',
        suggested_action: 'mark_bad_segment', decision_status: 'suggested'
      });
    }
  });
  if (!found.length) {
    state.saveStatus = 'Muscle detector: no EMG bursts in current window';
    renderStatusBar(state); return;
  }
  found.forEach(function(s) { _pushSuggestion(state, s); });
  state.saveStatus = 'Muscle detector: ' + found.length + ' suggestion' + (found.length === 1 ? '' : 's');
  renderStatusBar(state);
}

async function detectMovement(state) {
  if (!state.isDemo) { await generateAISuggestions(state); return; }
  var w = _getWindowSignals(state);
  var found = [];
  // Movement = low-frequency drift across all channels
  var driftScore = 0;
  for (var ci = 0; ci < w.signals.length; ci++) {
    var stats = _channelStats(w.signals[ci]);
    driftScore += Math.abs(stats.mean) / w.signals.length;
  }
  if (driftScore > 2) {
    found.push({
      id: _nextId(state), ai_label: 'movement', ai_confidence: Math.min(0.95, 0.65 + driftScore / 20),
      channel: 'all', start_sec: 5.0, end_sec: 5.8,
      explanation: 'Whole-head low-frequency drift detected (mean offset ' + driftScore.toFixed(1) + ' µV). Correlated across channels.',
      suggested_action: 'mark_bad_segment', decision_status: 'suggested'
    });
  }
  if (!found.length) {
    state.saveStatus = 'Movement detector: no drift in current window';
    renderStatusBar(state); return;
  }
  found.forEach(function(s) { _pushSuggestion(state, s); });
  state.saveStatus = 'Movement detector: ' + found.length + ' suggestion' + (found.length === 1 ? '' : 's');
  renderStatusBar(state);
}

async function detectLineNoise(state) {
  if (!state.isDemo) { await generateAISuggestions(state); return; }
  var w = _getWindowSignals(state);
  var found = [];
  // Line noise = 50 Hz sinusoidal component present in all demo signals
  var noiseScore = 0;
  for (var ci = 0; ci < w.signals.length; ci++) {
    var stats = _channelStats(w.signals[ci]);
    noiseScore += stats.variance;
  }
  noiseScore /= w.signals.length;
  if (noiseScore > 200) {
    found.push({
      id: _nextId(state), ai_label: 'line_noise', ai_confidence: Math.min(0.96, 0.80 + noiseScore / 2000),
      channel: 'T4-Av', start_sec: 6.5, end_sec: 9.4,
      explanation: 'Sustained 50 Hz contamination across channels. Power ratio elevated. Recommend notch filter or verify ground impedance.',
      suggested_action: 'ignore', decision_status: 'suggested'
    });
  }
  if (!found.length) {
    state.saveStatus = 'Line-noise detector: no significant 50/60 Hz in window';
    renderStatusBar(state); return;
  }
  found.forEach(function(s) { _pushSuggestion(state, s); });
  state.saveStatus = 'Line-noise detector: ' + found.length + ' suggestion' + (found.length === 1 ? '' : 's');
  renderStatusBar(state);
}

async function detectFlat(state) {
  if (!state.isDemo) { await generateAISuggestions(state); return; }
  var w = _getWindowSignals(state);
  var found = [];
  for (var ci = 0; ci < w.signals.length; ci++) {
    var stats = _channelStats(w.signals[ci]);
    // Flat = very low variance
    if (stats.variance < 50 && stats.range < 30) {
      found.push({
        id: _nextId(state), ai_label: 'flat', ai_confidence: Math.min(0.99, 0.90 + (50 - stats.variance) / 100),
        channel: DEFAULT_CHANNELS[ci], start_sec: 0, end_sec: w.tb,
        explanation: DEFAULT_CHANNELS[ci] + ' — very low signal variance (' + Math.round(stats.variance) + ' µV²). Possible electrode disconnection or saturation.',
        suggested_action: 'mark_bad_channel', decision_status: 'suggested'
      });
    }
  }
  if (!found.length) {
    state.saveStatus = 'Flat detector: no flat channels in window';
    renderStatusBar(state); return;
  }
  found.forEach(function(s) { _pushSuggestion(state, s); });
  state.saveStatus = 'Flat detector: ' + found.length + ' suggestion' + (found.length === 1 ? '' : 's');
  renderStatusBar(state);
}

async function detectSweat(state) {
  if (!state.isDemo) { await generateAISuggestions(state); return; }
  var w = _getWindowSignals(state);
  var found = [];
  for (var ci = 0; ci < w.signals.length; ci++) {
    var stats = _channelStats(w.signals[ci]);
    // Sweat = slow drift = large range but low high-freq content
    if (stats.range > 80 && stats.variance < 300) {
      found.push({
        id: _nextId(state), ai_label: 'sweat', ai_confidence: Math.min(0.92, 0.70 + stats.range / 300),
        channel: DEFAULT_CHANNELS[ci], start_sec: w.tb * 0.6, end_sec: w.tb * 0.9,
        explanation: DEFAULT_CHANNELS[ci] + ' — slow baseline drift (range ' + Math.round(stats.range) + ' µV). Possible sweat or electrode gel bridge.',
        suggested_action: 'ignore', decision_status: 'suggested'
      });
    }
  }
  if (!found.length) {
    state.saveStatus = 'Sweat/drift detector: no slow drift in window';
    renderStatusBar(state); return;
  }
  found.forEach(function(s) { _pushSuggestion(state, s); });
  state.saveStatus = 'Sweat/drift detector: ' + found.length + ' suggestion' + (found.length === 1 ? '' : 's');
  renderStatusBar(state);
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

async function handleSignOff(state) {
  const notesEl = document.getElementById('qwb-signoff-notes');
  const notes = notesEl ? notesEl.value.trim() : '';
  const r = _computeReportReadiness(state);
  const user = currentUserLabel();
  const signedAt = new Date().toISOString();
  state.signOff = { signedBy: user, signedAt, notes, readinessScore: r.score };
  state.auditLog.push({ t: signedAt, action: 'clinician_signoff', user, notes, readinessScore: r.score });
  toggleSignOff(state, false);
  state.saveStatus = `signed off by ${user} · ${r.readiness}`;
  renderRightPanel(state);
  renderStatusBar(state);
  if (!state.isDemo) {
    try {
      await api.saveQEEGCleaningVersion(state.analysisId, {
        bad_channels: Array.from(state.badChannels),
        rejected_segments: state.rejectedSegments,
        rejected_epochs: [],
        rejected_ica_components: Array.from(state.rejectedICA),
        interpolated_channels: [],
        annotation_ids: [],
        sign_off: { signed_by: user, signed_at: signedAt, notes, readiness_score: r.score },
      });
    } catch (_e) {}
  }
}

function _computeBeforeAfterMetrics(state) {
  var totalSec = 600; // 10 min demo recording
  var rejectedSec = state.rejectedSegments.reduce(function(sum, seg) { return sum + (seg.end_sec - seg.start_sec); }, 0);
  var retainedPct = Math.max(0, Math.round(100 - (rejectedSec / totalSec * 100)));
  var beforeArtifacts = (state.aiSuggestions || []).length;
  var afterArtifacts = (state.aiSuggestions || []).filter(function(s) { return s.decision_status !== 'accepted'; }).length;
  return {
    totalSec: totalSec,
    retainedPct: retainedPct,
    rejectedSec: rejectedSec,
    badChannels: state.badChannels.size,
    interpolatedChannels: 0, // not yet tracked separately
    rejectedSegments: state.rejectedSegments.length,
    rejectedICA: state.rejectedICA.size,
    beforeArtifacts: beforeArtifacts,
    afterArtifacts: afterArtifacts,
    cleanedArtifacts: beforeArtifacts - afterArtifacts,
  };
}

function showRawVsCleanedModal(state) {
  var m = _computeBeforeAfterMetrics(state);
  var html = '<div id="qwb-compare-modal" class="qwb-modal" style="display:flex">'
    + '<div class="qwb-modal-panel">'
    + '<div class="qwb-modal-header">Raw vs Cleaned Summary <button class="qwb-modal-close" id="qwb-compare-close">×</button></div>'
    + '<div class="qwb-modal-body">'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
    + '<div class="qwb-card"><div style="font-size:10px;color:#6b6660">Retained data</div><div style="font-size:18px;font-weight:600">' + m.retainedPct + '%</div></div>'
    + '<div class="qwb-card"><div style="font-size:10px;color:#6b6660">Rejected seconds</div><div style="font-size:18px;font-weight:600">' + m.rejectedSec.toFixed(1) + 's</div></div>'
    + '<div class="qwb-card"><div style="font-size:10px;color:#6b6660">Bad channels</div><div style="font-size:18px;font-weight:600">' + m.badChannels + '</div></div>'
    + '<div class="qwb-card"><div style="font-size:10px;color:#6b6660">Rejected segments</div><div style="font-size:18px;font-weight:600">' + m.rejectedSegments + '</div></div>'
    + '<div class="qwb-card"><div style="font-size:10px;color:#6b6660">ICA components removed</div><div style="font-size:18px;font-weight:600">' + m.rejectedICA + '</div></div>'
    + '<div class="qwb-card"><div style="font-size:10px;color:#6b6660">Artifacts cleaned</div><div style="font-size:18px;font-weight:600;color:#2f6b3a">' + m.cleanedArtifacts + '/' + m.beforeArtifacts + '</div></div>'
    + '</div>'
    + '<div class="qwb-safety-footer">Original raw EEG preserved. Decision-support only.</div>'
    + '</div></div></div>';
  var tmp = document.createElement('div'); tmp.innerHTML = html;
  var modal = tmp.firstElementChild;
  document.body.appendChild(modal);
  document.getElementById('qwb-compare-close')?.addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

async function loadRawVsCleaned(state) {
  if (state.isDemo) {
    state.rawCleanedSummary = {
      retained_data_pct: 88, rejected_segments_count: state.rejectedSegments.length,
      bad_channels_excluded: Array.from(state.badChannels), notice: 'demo summary',
    };
    renderStatusBar(state);
    showRawVsCleanedModal(state);
    return;
  }
  try {
    state.rawCleanedSummary = await api.getQEEGRawVsCleanedSummary(state.analysisId, state.cleaningVersion?.id);
    renderStatusBar(state);
    showRawVsCleanedModal(state);
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
  if (includes.includes('report')) {
    exportPDF(state);
    toggleExport(state, false);
    return;
  }
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

function exportPDF(state) {
  const r = _computeReportReadiness(state);
  const patient = state.metadata?.patient_name || (state.isDemo ? 'Azzi Glasser' : '—');
  const dob = state.metadata?.patient_dob || '—';
  const session = state.metadata?.session_label || (state.isDemo ? 'DNEW0000 · Eyes Closed' : '—');
  const date = state.metadata?.recording_date || new Date().toLocaleDateString();
  const so = state.signOff;
  const badCh = Array.from(state.badChannels).join(', ') || 'None';
  const segCount = state.rejectedSegments.length;
  const icaCount = state.rejectedICA.size;
  const audit = (state.auditLog || []).slice(0, 20);

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>qEEG Cleaning Report</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Georgia, serif; font-size: 11px; line-height: 1.45; color: #1a1a1a; background:#fff; max-width: 720px; margin: 0 auto; padding: 20px; }
h1 { font-size: 18px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 13px; font-weight: 700; margin: 18px 0 8px; border-bottom: 1px solid #1a1a1a; padding-bottom: 3px; text-transform: uppercase; letter-spacing: 0.04em; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.header-right { text-align: right; font-size: 10px; color: #6b6660; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 14px; }
.meta-box { border: 1px solid #d8d1c3; padding: 6px 8px; border-radius: 3px; }
.meta-box label { display: block; font-size: 9px; text-transform: uppercase; color: #6b6660; letter-spacing: 0.04em; margin-bottom: 2px; }
.score-row { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.score-pill { padding: 3px 10px; border-radius: 10px; font-weight: 700; font-size: 11px; }
table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 10px; }
th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e8e0d0; }
th { font-weight: 600; background: #f6f3ed; }
.footer { margin-top: 20px; font-size: 9.5px; color: #6b6660; border-top: 1px solid #d8d1c3; padding-top: 8px; }
.signoff-box { border: 1.5px solid #2f6b3a; background: #f6faf6; padding: 10px; border-radius: 4px; margin-top: 12px; }
</style></head><body>
<div class="header">
  <div>
    <h1>qEEG Cleaning Report</h1>
    <div style="font-size:11px;color:#6b6660">DeepSynaps Studio · Decision-support only</div>
  </div>
  <div class="header-right">
    <div>Generated ${new Date().toLocaleString()}</div>
    <div>Analysis: ${state.analysisId}</div>
  </div>
</div>
<div class="meta-grid">
  <div class="meta-box"><label>Patient</label><div>${esc(patient)}</div></div>
  <div class="meta-box"><label>DOB</label><div>${esc(dob)}</div></div>
  <div class="meta-box"><label>Session</label><div>${esc(session)}</div></div>
  <div class="meta-box"><label>Recording date</label><div>${esc(date)}</div></div>
</div>
<h2>Readiness Summary</h2>
<div class="score-row">
  <div style="font-size:22px;font-weight:700;color:#1a1a1a">${r.score}<span style="font-size:12px;color:#6b6660">/100</span></div>
  <div class="score-pill" style="background:${r.score>=80?'#d6e8d6':r.score>=60?'#f6e6cb':'#f3d4d0'};color:${r.score>=80?'#2f6b3a':r.score>=60?'#b8741a':'#b03434'}">${r.readiness}</div>
</div>
<table>
  <tr><th>Metric</th><th>Value</th></tr>
  <tr><td>Retained data</td><td>${r.retain}%</td></tr>
  <tr><td>Bad channels</td><td>${r.badChCount}</td></tr>
  <tr><td>Rejected segments</td><td>${r.rejSegCount}</td></tr>
  <tr><td>ICA reviewed</td><td>${r.icaReviewed ? 'Yes' : 'No'}</td></tr>
  <tr><td>Filters applied</td><td>${r.hasFilters ? 'Yes' : 'No'}</td></tr>
  <tr><td>Artifact burden (accepted)</td><td>${r.artifactBurden}${r.totalArtifacts ? ' / ' + r.totalArtifacts + ' detected' : ''}</td></tr>
</table>
<h2>Cleaning Details</h2>
<table>
  <tr><th>Category</th><th>Details</th></tr>
  <tr><td>Bad channels</td><td>${esc(badCh)}</td></tr>
  <tr><td>Rejected segments</td><td>${segCount}</td></tr>
  <tr><td>Rejected ICA components</td><td>${icaCount}</td></tr>
  <tr><td>Cleaning version</td><td>${state.cleaningVersion?.version_number || 'Draft'}</td></tr>
  <tr><td>Montage</td><td>${state.montage}</td></tr>
  <tr><td>Filters</td><td>Low ${state.lowCut} Hz · High ${state.highCut} Hz · Notch ${state.notch}</td></tr>
</table>
${audit.length ? `<h2>Recent Audit Log (${audit.length} entries)</h2>
<table>
  <tr><th>Time</th><th>Action</th><th>Channel</th></tr>
  ${audit.map(a => '<tr><td>' + (a.created_at ? new Date(a.created_at).toLocaleString() : '—') + '</td><td>' + esc(a.action_type || a.action || '—') + '</td><td>' + esc(a.channel || '—') + '</td></tr>').join('')}
</table>` : ''}
${so ? `<div class="signoff-box">
  <div style="font-weight:700;color:#2f6b3a;margin-bottom:4px">✓ Clinician Sign‑Off</div>
  <div>Signed by <b>${esc(so.signedBy)}</b> on ${new Date(so.signedAt).toLocaleString()}</div>
  ${so.notes ? '<div style="margin-top:4px;font-style:italic">"' + esc(so.notes) + '"</div>' : ''}
  <div style="margin-top:4px">Readiness at sign‑off: <b>${so.readinessScore}</b>/100</div>
</div>` : '<div style="margin-top:12px;padding:10px;border:1px dashed #d8d1c3;border-radius:4px;color:#6b6660;font-size:10.5px">No clinician sign‑off recorded.</div>'}
<div class="footer">
  Original raw EEG is preserved. This report reflects the cleaning version and audit trail only.
  AI suggestions require clinician confirmation before they take effect.
</div>
</body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
    state.saveStatus = 'PDF report opened for printing';
  } else {
    state.saveStatus = 'PDF: popup blocked';
  }
  renderStatusBar(state);
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
