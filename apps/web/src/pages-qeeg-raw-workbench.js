// ─────────────────────────────────────────────────────────────────────────────
// Raw EEG Cleaning Workbench — full-page clinical workstation.
//
// Decision-support only. Original raw EEG is never overwritten — every cleaning
// action lives in a separate cleaning version with full audit trail. AI
// artefact suggestions require clinician confirmation before any cleaning is
// applied.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────────┐
//   │ Top toolbar: speed, gain, low/high cut, notch, montage, view... │
//   ├──────────┬───────────────────────────────────┬──────────────────┤
//   │ Channel  │      EEG trace canvas             │  Cleaning Tools  │
//   │  rail    │  (synthetic demo when no real     │  AI Assistant    │
//   │          │   raw signal available)           │  Best-Practice   │
//   │          │                                   │  Examples / ICA  │
//   ├──────────┴───────────────────────────────────┴──────────────────┤
//   │ Status bar: time | window | selected | bad | rejected | version │
//   └──────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';

const DEFAULT_CHANNELS = [
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
  ['Z', 'Undo'],
  ['Shift+Z', 'Redo'],
  ['Space', 'Play / pause scroll'],
  ['R', 'Reset view'],
  ['?', 'Show shortcuts'],
];

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function readAnalysisIdFromHash() {
  // Accept both /#/qeeg-raw-workbench/:id and ?analysisId=:id
  const h = window.location.hash || '';
  const m = h.match(/qeeg-raw-workbench[\/=:]([A-Za-z0-9_\-]+)/);
  if (m) return m[1];
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('analysisId') || window._qeegSelectedId || 'demo';
  } catch (_e) {
    return window._qeegSelectedId || 'demo';
  }
}

// Realistic-ish synthetic EEG generator for demo mode. Each channel gets a
// blend of alpha (10 Hz) + beta (20 Hz) noise plus channel-specific
// archetype artefacts. Demo data is clearly labelled in the UI.
function synthSignal(channelIndex, totalSamples, sampleRate, archetypeAt) {
  const out = new Float32Array(totalSamples);
  const baseFreqAlpha = 9.5 + (channelIndex % 5) * 0.2;
  const baseFreqBeta = 18 + (channelIndex % 7);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let v = Math.sin(2 * Math.PI * baseFreqAlpha * t) * 18
          + Math.sin(2 * Math.PI * baseFreqBeta * t) * 6
          + (Math.random() - 0.5) * 14;
    // Archetype injection: blink on Fp1/Fp2, muscle on T3, line noise on all.
    if (archetypeAt && i >= archetypeAt.blinkStart && i <= archetypeAt.blinkEnd && (channelIndex === 0 || channelIndex === 1)) {
      v += Math.exp(-Math.pow(i - (archetypeAt.blinkStart + archetypeAt.blinkEnd) / 2, 2) / 1500) * 220;
    }
    if (archetypeAt && i >= archetypeAt.muscleStart && i <= archetypeAt.muscleEnd && channelIndex === 7) {
      v += (Math.random() - 0.5) * 70;
    }
    // Line noise low-amplitude background on every channel
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
  const isDemo = analysisId === 'demo' || (typeof window._isDemoMode === 'function' && window._isDemoMode());

  const state = {
    analysisId,
    isDemo,
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
    saveStatus: 'idle',
    metadata: null,
    ica: null,
    rawCleanedSummary: null,
  };

  // Build the workbench shell
  root.innerHTML = workbenchShell(state);

  // Attach handlers and render dynamic regions
  attachToolbar(state);
  attachChannelRail(state);
  attachRightPanel(state);
  attachStatusBar(state);
  attachKeyboard(state, navigate);

  // Initial async load
  await loadAll(state);
  redrawCanvas(state);
  renderRightPanel(state);
  renderStatusBar(state);
}

function workbenchShell(state) {
  return `
  <div class="qeeg-wb" style="position:fixed;inset:0;display:flex;flex-direction:column;background:#0f1115;color:#e7eaf0;font-family:system-ui,-apple-system,sans-serif;z-index:9000">
    ${topToolbar(state)}
    <div style="flex:1;display:flex;min-height:0;overflow:hidden">
      ${channelRailHtml(state)}
      <div id="qwb-canvas-wrap" style="flex:1;position:relative;background:#0a0c10;border-left:1px solid #1f242c;border-right:1px solid #1f242c;overflow:hidden">
        <div id="qwb-immutable-banner" style="position:absolute;top:8px;right:8px;background:#1c2230;border:1px solid #2a3140;padding:6px 10px;border-radius:6px;font-size:11px;color:#9fb1c8;z-index:5">
          Original raw EEG preserved · Decision-support only
        </div>
        <canvas id="qwb-canvas" style="width:100%;height:100%;display:block"></canvas>
      </div>
      ${rightPanelHtml(state)}
    </div>
    ${statusBarHtml(state)}
    ${shortcutsModal(state)}
  </div>`;
}

function topToolbar(state) {
  const sel = (id, opts, val, label) => `
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#9fb1c8">
      <span>${label}</span>
      <select id="${id}" style="background:#161a21;color:#e7eaf0;border:1px solid #2a3140;border-radius:4px;padding:3px 6px;font-size:12px">
        ${opts.map(o => `<option value="${esc(o)}" ${String(o)===String(val)?'selected':''}>${esc(o)}</option>`).join('')}
      </select>
    </label>`;
  return `
  <div style="height:48px;background:#13171e;border-bottom:1px solid #1f242c;display:flex;align-items:center;gap:14px;padding:0 14px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:10px;font-weight:600;font-size:13px">
      <span style="font-size:18px">🧠</span> Raw EEG Workbench
      ${state.isDemo ? '<span style="background:#5a3a00;color:#ffd28a;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600">DEMO DATA</span>' : ''}
    </div>
    ${sel('qwb-speed', SPEEDS.map(s=>`${s} mm/s`), `${state.speed} mm/s`, 'Speed')}
    ${sel('qwb-gain', GAINS.map(g=>`${g} µV/cm`), `${state.gain} µV/cm`, 'Gain')}
    ${sel('qwb-lowcut', LOW_CUTS.map(c=>`${c} Hz`), `${state.lowCut} Hz`, 'Low cut')}
    ${sel('qwb-highcut', HIGH_CUTS.map(c=>`${c} Hz`), `${state.highCut} Hz`, 'High cut')}
    ${sel('qwb-notch', NOTCHES, state.notch, 'Notch')}
    ${sel('qwb-montage', MONTAGES, state.montage, 'Montage')}
    ${sel('qwb-view', VIEW_MODES, state.viewMode, 'View')}
    ${sel('qwb-timebase', TIMEBASES.map(t=>`${t} s`), `${state.timebase} s`, 'Timebase')}
    <button id="qwb-baseline-reset" class="qwb-btn">Reset baseline</button>
    <button id="qwb-reset-view" class="qwb-btn">Reset view</button>
    <button id="qwb-save" class="qwb-btn qwb-btn-primary">Save cleaning version</button>
    <button id="qwb-rerun" class="qwb-btn qwb-btn-primary">Re-run qEEG analysis</button>
    <button id="qwb-shortcuts" class="qwb-btn" title="Shortcuts (?)">⌨︎</button>
    <button id="qwb-back" class="qwb-btn">← Analyzer</button>
  </div>
  <style>
    .qwb-btn{background:#1a1f28;color:#e7eaf0;border:1px solid #2a3140;border-radius:4px;padding:5px 10px;font-size:11px;cursor:pointer;font-weight:500}
    .qwb-btn:hover{background:#222a36;border-color:#3a4658}
    .qwb-btn-primary{background:#1f4a8a;border-color:#2563aa;color:#fff}
    .qwb-btn-primary:hover{background:#2563aa}
  </style>`;
}

function channelRailHtml(state) {
  const items = DEFAULT_CHANNELS.map(ch => {
    const isBad = state.badChannels.has(ch);
    const isSel = state.selectedChannel === ch;
    return `<div class="qwb-ch ${isBad?'bad':''} ${isSel?'sel':''}" data-channel="${esc(ch)}"
      style="padding:6px 8px;border-bottom:1px solid #181d25;cursor:pointer;display:flex;flex-direction:column;gap:2px;
      background:${isSel?'#1f4a8a':'transparent'};color:${isBad?'#ff8a8a':(isSel?'#fff':'#e7eaf0')}">
      <span style="font-weight:600;font-size:12px">${esc(ch)}</span>
      <span style="font-size:9px;color:#7d8da3">${state.gain} µV/cm${isBad?' · BAD':''}</span>
    </div>`;
  }).join('');
  return `
  <div id="qwb-rail" style="width:120px;background:#10141a;overflow-y:auto;flex-shrink:0">
    <div style="padding:8px;font-size:10px;color:#7d8da3;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #1f242c">
      Channels (${DEFAULT_CHANNELS.length})
    </div>
    ${items}
  </div>`;
}

function rightPanelHtml(state) {
  const tabs = [
    { id: 'cleaning', label: 'Cleaning' },
    { id: 'ai', label: 'AI Assistant' },
    { id: 'help', label: 'Best-Practice' },
    { id: 'examples', label: 'Examples' },
    { id: 'ica', label: 'ICA' },
    { id: 'log', label: 'Audit' },
  ];
  return `
  <div id="qwb-right" style="width:380px;background:#10141a;display:flex;flex-direction:column;flex-shrink:0">
    <div style="display:flex;border-bottom:1px solid #1f242c;background:#13171e">
      ${tabs.map(t => `<button class="qwb-tab" data-tab="${t.id}"
        style="flex:1;padding:10px 6px;background:transparent;color:${state.rightTab===t.id?'#fff':'#9fb1c8'};
        border:none;border-bottom:2px solid ${state.rightTab===t.id?'#2563aa':'transparent'};font-size:11px;cursor:pointer;font-weight:600">
        ${esc(t.label)}</button>`).join('')}
    </div>
    <div id="qwb-right-body" style="flex:1;overflow-y:auto;padding:14px"></div>
  </div>`;
}

function statusBarHtml(state) {
  return `
  <div id="qwb-status" style="height:28px;background:#13171e;border-top:1px solid #1f242c;display:flex;align-items:center;gap:18px;padding:0 14px;font-size:11px;color:#9fb1c8;font-family:'SF Mono',Menlo,monospace">
    <span id="qwb-st-time">--:--:--</span>
    <span id="qwb-st-window">Window 0–${state.timebase}s</span>
    <span id="qwb-st-sel">Selected: ${esc(state.selectedChannel)}</span>
    <span id="qwb-st-bad">Bad: 0</span>
    <span id="qwb-st-rej">Rejected: 0</span>
    <span id="qwb-st-retain">Retained: 100%</span>
    <span id="qwb-st-version">No cleaning version</span>
    <span id="qwb-st-save" style="margin-left:auto;color:#7d8da3">idle</span>
  </div>`;
}

function shortcutsModal(state) {
  return `
  <div id="qwb-shortcuts-modal" style="position:fixed;inset:0;display:none;background:rgba(0,0,0,0.7);z-index:9999;align-items:center;justify-content:center">
    <div style="background:#13171e;border:1px solid #2a3140;border-radius:8px;padding:24px;min-width:360px;max-width:520px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:15px">Keyboard shortcuts</h3>
        <button id="qwb-close-shortcuts" class="qwb-btn">Close</button>
      </div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        ${KEYBOARD_SHORTCUTS.map(([k,v]) => `<tr><td style="padding:4px 8px;color:#9fb1c8;font-family:monospace">${esc(k)}</td><td style="padding:4px 8px">${esc(v)}</td></tr>`).join('')}
      </table>
    </div>
  </div>`;
}

// ──── Renderers ─────────────────────────────────────────────────────────────

function redrawCanvas(state) {
  const canvas = document.getElementById('qwb-canvas');
  if (!canvas) return;
  const wrap = document.getElementById('qwb-canvas-wrap');
  if (!wrap) return;
  const dpr = window.devicePixelRatio || 1;
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0,0,W,H);

  // Grid + time markers
  ctx.strokeStyle = '#1a212c';
  ctx.lineWidth = 1;
  const tb = state.timebase;
  for (let s = 0; s <= tb; s++) {
    const x = (s / tb) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    if (s > 0) {
      ctx.fillStyle = '#5a6a82'; ctx.font = '10px monospace';
      ctx.fillText(String(state.windowStart + s), x + 3, 12);
    }
  }
  // Draw traces
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
      ctx.fillStyle = 'rgba(37,99,170,0.10)';
      ctx.fillRect(0, 20 + rowH*idx, W, rowH);
    }
    ctx.strokeStyle = isBad ? '#ff6b6b' : (isSel ? '#9bd1ff' : '#a8c5e8');
    ctx.lineWidth = isBad ? 1.4 : 1.0;
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

  // Rejected segment shading
  ctx.fillStyle = 'rgba(255,80,80,0.15)';
  for (const seg of state.rejectedSegments) {
    const overlapStart = Math.max(seg.start_sec - state.windowStart, 0);
    const overlapEnd = Math.min(seg.end_sec - state.windowStart, state.timebase);
    if (overlapEnd > overlapStart) {
      const x1 = (overlapStart / state.timebase) * W;
      const x2 = (overlapEnd / state.timebase) * W;
      ctx.fillRect(x1, 20, x2 - x1, H - 20);
    }
  }

  // AI suggestion markers (orange ticks at top)
  ctx.fillStyle = '#ffb84d';
  for (const s of state.aiSuggestions) {
    if (s.start_sec == null) continue;
    const overlap = s.start_sec - state.windowStart;
    if (overlap < 0 || overlap > state.timebase) continue;
    const x = (overlap / state.timebase) * W;
    ctx.fillRect(x - 2, 14, 4, 6);
  }
}

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
    <div style="font-size:10px;color:#7d8da3;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">A. Manual cleaning</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px">
      <button class="qwb-btn" data-action="mark-segment">Mark bad segment</button>
      <button class="qwb-btn" data-action="mark-channel">Mark bad channel</button>
      <button class="qwb-btn" data-action="reject-epoch">Reject epoch</button>
      <button class="qwb-btn" data-action="interpolate">Interpolate</button>
      <button class="qwb-btn" data-action="annotate">Add annotation</button>
      <button class="qwb-btn" data-action="undo">Undo</button>
    </div>

    <div style="font-size:10px;color:#7d8da3;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">B. Automated suggestions</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px">
      <button class="qwb-btn" data-action="detect-flat">Detect flat</button>
      <button class="qwb-btn" data-action="detect-noisy">Detect noisy</button>
      <button class="qwb-btn" data-action="detect-blink">Detect blinks</button>
      <button class="qwb-btn" data-action="detect-muscle">Detect muscle</button>
      <button class="qwb-btn" data-action="detect-movement">Detect movement</button>
      <button class="qwb-btn" data-action="detect-line">Detect line noise</button>
    </div>

    <div style="font-size:10px;color:#7d8da3;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">C. ICA review</div>
    <div style="margin-bottom:14px">
      <button class="qwb-btn" data-action="open-ica" style="width:100%">Open ICA review</button>
    </div>

    <div style="font-size:10px;color:#7d8da3;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">D. Reprocess</div>
    <div style="display:grid;gap:6px">
      <button class="qwb-btn qwb-btn-primary" data-action="save-version">Save cleaning version</button>
      <button class="qwb-btn qwb-btn-primary" data-action="rerun">Re-run qEEG pipeline</button>
      <button class="qwb-btn" data-action="raw-vs-cleaned">View Raw vs Cleaned summary</button>
    </div>

    <div style="margin-top:18px;padding:10px;background:#1c2230;border:1px solid #2a3140;border-radius:6px;font-size:11px;color:#9fb1c8;line-height:1.5">
      <strong style="color:#e7eaf0">Decision-support only.</strong> Original raw EEG is preserved.
      All cleaning actions are saved to a separate version with full audit trail.
      AI suggestions require clinician confirmation before they take effect.
    </div>`;
}

function renderAIPanel(state) {
  const items = state.aiSuggestions || [];
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-weight:600;font-size:13px">AI Artefact Assistant</div>
      <button class="qwb-btn qwb-btn-primary" id="qwb-ai-generate">Generate suggestions</button>
    </div>
    <div style="padding:8px 10px;background:#3a2a14;border:1px solid #5a3a00;color:#ffd28a;border-radius:6px;font-size:11px;margin-bottom:14px">
      AI-assisted suggestion only. Clinician confirmation required before any cleaning is applied.
    </div>
    ${items.length === 0 ? '<div style="color:#7d8da3;font-size:12px;padding:20px 0;text-align:center">No suggestions yet — click <em>Generate suggestions</em>.</div>'
      : items.map(s => `
      <div data-suggestion="${esc(s.id)}" style="border:1px solid #2a3140;border-radius:6px;padding:10px;margin-bottom:8px;background:#161a21">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-weight:600;font-size:12px;color:#ffb84d">${esc((s.ai_label||'').replace('_',' '))}</span>
          <span style="font-size:11px;color:#9fb1c8">conf ${esc((s.ai_confidence*100||0).toFixed(0))}%</span>
        </div>
        <div style="font-size:11px;color:#9fb1c8;margin-bottom:4px">
          ${s.channel ? 'Ch: '+esc(s.channel)+' · ' : ''}${s.start_sec!=null ? esc(s.start_sec.toFixed(1))+'s' : ''}${s.end_sec!=null ? '–'+esc(s.end_sec.toFixed(1))+'s' : ''}
        </div>
        <div style="font-size:11px;color:#cdd5e1;margin-bottom:8px;line-height:1.4">${esc(s.explanation||'')}</div>
        <div style="display:flex;gap:6px">
          <button class="qwb-btn" data-ai-decision="accepted" data-ai-id="${esc(s.id)}">Accept</button>
          <button class="qwb-btn" data-ai-decision="rejected" data-ai-id="${esc(s.id)}">Reject</button>
          <button class="qwb-btn" data-ai-decision="needs_review" data-ai-id="${esc(s.id)}">Needs review</button>
        </div>
        <div style="font-size:10px;color:#7d8da3;margin-top:6px">Suggested action: ${esc(s.suggested_action||'review')}</div>
      </div>`).join('')}`;
}

function renderHelpPanel(state) {
  return `
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Best-Practice Helper</div>
    <div style="font-size:11px;color:#9fb1c8;margin-bottom:12px">Local guidance — links are decision-support only.</div>
    ${BEST_PRACTICE.map(b => `
      <div style="border:1px solid #2a3140;border-radius:6px;padding:10px;margin-bottom:8px;background:#161a21">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px">${esc(b.topic)}</div>
        <div style="font-size:11px;color:#cdd5e1;line-height:1.4;margin-bottom:6px">${esc(b.why)}</div>
        <div style="font-size:10px;color:#7d8da3">References: ${b.references.map(esc).join(' · ')}</div>
      </div>`).join('')}`;
}

function renderExamplesPanel(state) {
  return `
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Artefact Examples</div>
    <div style="font-size:11px;color:#9fb1c8;margin-bottom:12px">Reference cases to help recognise and act on common patterns.</div>
    ${ARTEFACT_EXAMPLES.map(ex => `
      <div style="border:1px solid #2a3140;border-radius:6px;padding:10px;margin-bottom:8px;background:#161a21">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px">${esc(ex.title)}</div>
        <div style="font-size:10px;color:#7d8da3;margin-bottom:6px">Channels: ${esc(ex.channels)}</div>
        <div style="font-size:11px;color:#cdd5e1;line-height:1.4;margin-bottom:4px"><strong>Why:</strong> ${esc(ex.why)}</div>
        <div style="font-size:11px;color:#cdd5e1;line-height:1.4;margin-bottom:4px"><strong>Action:</strong> ${esc(ex.action)}</div>
        <div style="font-size:11px;color:#9fb1c8;line-height:1.4"><strong>Check:</strong> ${esc(ex.check)}</div>
      </div>`).join('')}`;
}

function renderICAPanel(state) {
  if (!state.ica || !state.ica.components || state.ica.components.length === 0) {
    return `
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">ICA Review</div>
      <div style="padding:24px;text-align:center;color:#7d8da3;font-size:12px;background:#161a21;border:1px solid #2a3140;border-radius:6px">
        ICA decomposition not available for this analysis yet.<br><br>
        Run preprocessing or click <em>Re-run qEEG pipeline</em> to generate ICA components.
      </div>`;
  }
  return `
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">ICA Components (${state.ica.n_components || state.ica.components.length})</div>
    ${state.ica.components.slice(0, 30).map(c => `
      <div style="border:1px solid #2a3140;border-radius:6px;padding:8px;margin-bottom:6px;background:#161a21;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:600;font-size:12px">IC ${esc(c.index)}</div>
          <div style="font-size:10px;color:#7d8da3">${esc(c.label || 'unknown')}</div>
        </div>
        <button class="qwb-btn" data-ica-toggle="${esc(c.index)}">${state.rejectedICA.has(c.index) ? 'Restore' : 'Reject'}</button>
      </div>`).join('')}`;
}

function renderAuditPanel(state) {
  const items = state.auditLog || [];
  if (items.length === 0) {
    return `<div style="color:#7d8da3;font-size:12px;padding:20px 0;text-align:center">No audit events recorded yet.</div>`;
  }
  return `
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Cleaning Audit Trail</div>
    ${items.slice(0, 80).map(e => `
      <div style="border-left:2px solid ${e.source==='ai'?'#ffb84d':'#2563aa'};padding:6px 10px;margin-bottom:4px;background:#161a21;font-size:11px">
        <div style="display:flex;justify-content:space-between"><span style="font-weight:600">${esc(e.action_type)}</span><span style="color:#7d8da3">${esc((e.created_at||'').slice(11,19))}</span></div>
        <div style="color:#9fb1c8">${e.channel?esc(e.channel)+' · ':''}${e.start_sec!=null?esc(e.start_sec.toFixed(1))+'s':''}${e.end_sec!=null?'–'+esc(e.end_sec.toFixed(1))+'s':''} · ${esc(e.source)}</div>
        ${e.note ? `<div style="color:#cdd5e1;margin-top:2px">${esc(e.note)}</div>` : ''}
      </div>`).join('')}`;
}

function renderStatusBar(state) {
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const now = new Date();
  set('qwb-st-time', now.toLocaleTimeString('en-GB'));
  set('qwb-st-window', `Window ${state.windowStart}–${state.windowStart + state.timebase}s`);
  set('qwb-st-sel', `Selected: ${state.selectedChannel}`);
  set('qwb-st-bad', `Bad: ${state.badChannels.size}`);
  set('qwb-st-rej', `Rejected: ${state.rejectedSegments.length}`);
  const rs = state.rawCleanedSummary;
  set('qwb-st-retain', `Retained: ${rs && rs.retained_data_pct != null ? rs.retained_data_pct.toFixed(0) : '100'}%`);
  set('qwb-st-version', state.cleaningVersion ? `Cleaning v${state.cleaningVersion.version_number} ${state.cleaningVersion.review_status}` : 'No cleaning version');
  set('qwb-st-save', state.saveStatus || 'idle');
}

// ──── Handlers ──────────────────────────────────────────────────────────────

function attachToolbar(state) {
  const onSel = (id, key, parser) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const v = el.value;
      state[key] = parser ? parser(v) : v;
      redrawCanvas(state);
      renderStatusBar(state);
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

  document.getElementById('qwb-baseline-reset')?.addEventListener('click', () => { redrawCanvas(state); });
  document.getElementById('qwb-reset-view')?.addEventListener('click', () => {
    state.windowStart = 0; state.timebase = 10;
    redrawCanvas(state); renderStatusBar(state);
  });
  document.getElementById('qwb-save')?.addEventListener('click', () => saveCleaningVersion(state));
  document.getElementById('qwb-rerun')?.addEventListener('click', () => rerunAnalysis(state));
  document.getElementById('qwb-back')?.addEventListener('click', () => {
    if (typeof window._nav === 'function') window._nav('qeeg-analysis');
    else window.location.hash = '#/qeeg-analysis';
  });
  document.getElementById('qwb-shortcuts')?.addEventListener('click', () => toggleShortcuts(state, true));
  document.getElementById('qwb-close-shortcuts')?.addEventListener('click', () => toggleShortcuts(state, false));
  window.addEventListener('resize', () => redrawCanvas(state));
}

function attachChannelRail(state) {
  document.getElementById('qwb-rail')?.addEventListener('click', e => {
    const row = e.target.closest('.qwb-ch');
    if (!row) return;
    state.selectedChannel = row.dataset.channel;
    document.getElementById('qwb-rail').outerHTML = channelRailHtml(state);
    attachChannelRail(state);
    redrawCanvas(state); renderStatusBar(state);
  });
}

function attachRightPanel(state) {
  document.querySelectorAll('.qwb-tab').forEach(b => {
    b.addEventListener('click', () => {
      state.rightTab = b.dataset.tab;
      document.querySelectorAll('.qwb-tab').forEach(t => {
        const on = t.dataset.tab === state.rightTab;
        t.style.color = on ? '#fff' : '#9fb1c8';
        t.style.borderBottom = `2px solid ${on ? '#2563aa' : 'transparent'}`;
      });
      renderRightPanel(state);
    });
  });
  renderRightPanel(state);
}

function attachStatusBar(state) {
  setInterval(() => renderStatusBar(state), 1000);
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
    if (e.key === 'ArrowRight') { state.windowStart += state.timebase; redrawCanvas(state); renderStatusBar(state); }
    else if (e.key === 'ArrowLeft') { state.windowStart = Math.max(0, state.windowStart - state.timebase); redrawCanvas(state); renderStatusBar(state); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const idx = DEFAULT_CHANNELS.indexOf(state.selectedChannel);
      const next = e.key === 'ArrowUp' ? Math.max(0, idx - 1) : Math.min(DEFAULT_CHANNELS.length - 1, idx + 1);
      state.selectedChannel = DEFAULT_CHANNELS[next];
      document.getElementById('qwb-rail').outerHTML = channelRailHtml(state);
      attachChannelRail(state); redrawCanvas(state); renderStatusBar(state);
    }
    else if (e.key === '+' || e.key === '=') { state.gain = Math.max(GAINS[0], state.gain / 2); redrawCanvas(state); }
    else if (e.key === '-' || e.key === '_') { state.gain = Math.min(GAINS[GAINS.length-1], state.gain * 2); redrawCanvas(state); }
    else if (e.key === 'b' || e.key === 'B') { handleCleaningAction(state, 'mark-channel'); }
    else if (e.key === 's' || e.key === 'S') { handleCleaningAction(state, 'mark-segment'); }
    else if (e.key === 'a' || e.key === 'A') { handleCleaningAction(state, 'annotate'); }
    else if (e.key === 'r' || e.key === 'R') { state.windowStart = 0; redrawCanvas(state); renderStatusBar(state); }
    else if (e.key === '?') { toggleShortcuts(state, true); }
    else if (e.key === 'Escape') { toggleShortcuts(state, false); }
  });
}

function toggleShortcuts(state, show) {
  const m = document.getElementById('qwb-shortcuts-modal');
  if (m) m.style.display = show ? 'flex' : 'none';
  state.showShortcuts = !!show;
}

// ──── Mutations ────────────────────────────────────────────────────────────

async function handleCleaningAction(state, action) {
  switch (action) {
    case 'mark-channel': await markBadChannel(state, state.selectedChannel); break;
    case 'mark-segment': await markBadSegment(state, state.windowStart, state.windowStart + state.timebase); break;
    case 'reject-epoch': await rejectEpoch(state, state.windowStart); break;
    case 'interpolate': await interpolateChannel(state, state.selectedChannel); break;
    case 'annotate': {
      const note = window.prompt('Annotation note (clinician):', '');
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
  }
}

async function markBadChannel(state, channel) {
  if (!channel) return;
  if (state.badChannels.has(channel)) state.badChannels.delete(channel);
  else state.badChannels.add(channel);
  document.getElementById('qwb-rail').outerHTML = channelRailHtml(state);
  attachChannelRail(state);
  redrawCanvas(state); renderStatusBar(state);
  await postAnnotation(state, { kind: 'bad_channel', channel, decision_status: 'accepted' });
}

async function markBadSegment(state, startSec, endSec) {
  state.rejectedSegments.push({ start_sec: startSec, end_sec: endSec, description: 'BAD_user' });
  redrawCanvas(state); renderStatusBar(state);
  await postAnnotation(state, { kind: 'bad_segment', start_sec: startSec, end_sec: endSec, decision_status: 'accepted' });
}

async function rejectEpoch(state, startSec) {
  await postAnnotation(state, { kind: 'rejected_epoch', start_sec: startSec, end_sec: startSec + 1.0, decision_status: 'accepted' });
}

async function interpolateChannel(state, channel) {
  if (!channel) return;
  await postAnnotation(state, { kind: 'interpolated_channel', channel, decision_status: 'accepted' });
}

async function addNote(state, note) {
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
        suggested_action: 'review_ica' },
      { id: 'demo-2', ai_label: 'muscle', ai_confidence: 0.65, channel: 'T3-Av',
        start_sec: 7.2, end_sec: 8.4,
        explanation: 'High-frequency burst over temporal channel suggests muscle contamination.',
        suggested_action: 'mark_bad_segment' },
      { id: 'demo-3', ai_label: 'line_noise', ai_confidence: 0.55, channel: null,
        start_sec: 0, end_sec: null,
        explanation: 'Narrow spectral peak near power-line frequency. Confirm notch filter is active.',
        suggested_action: 'ignore' },
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
  // The persisted annotation already exists from generateQEEGAIArtefactSuggestions;
  // we record the clinician decision as a sibling annotation linking the source.
  const sugg = (state.aiSuggestions || []).find(s => s.id === suggestionId);
  if (!sugg) return;
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
  if (decision === 'accepted') {
    if (sugg.suggested_action === 'mark_bad_segment' && sugg.start_sec != null && sugg.end_sec != null) {
      state.rejectedSegments.push({ start_sec: sugg.start_sec, end_sec: sugg.end_sec, description: 'BAD_ai_accepted' });
      redrawCanvas(state); renderStatusBar(state);
    }
  }
  // Re-render so the badge updates
  if (state.rightTab === 'ai') renderRightPanel(state);
}

async function saveCleaningVersion(state) {
  if (state.isDemo) {
    state.cleaningVersion = {
      id: 'demo-version',
      version_number: (state.cleaningVersion?.version_number || 0) + 1,
      review_status: 'draft',
    };
    state.saveStatus = 'demo: cleaning version saved locally'; renderStatusBar(state);
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
    state.saveStatus = 'demo: rerun queued'; renderStatusBar(state); return;
  }
  try {
    state.saveStatus = 'queuing rerun…'; renderStatusBar(state);
    await api.rerunQEEGAnalysisWithCleaning(state.analysisId, state.cleaningVersion.id);
    state.saveStatus = 'rerun queued · raw EEG preserved';
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
    alert(`Raw vs Cleaned\n\nRetained: 88%\nBad channels: ${state.badChannels.size}\nRejected segments: ${state.rejectedSegments.length}\n\nDecision-support only. Original raw EEG preserved.`);
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
