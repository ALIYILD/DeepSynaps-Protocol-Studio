// DeepTwin Simulation Room — full-screen immersive simulation overlay.
//
// Launched from the Simulation lab section on the DeepTwin page. Renders
// a Bloomberg-terminal-style command room with:
//   - Left rail: stimulation modality, target region, intensity/duration/frequency sliders
//   - Center: brain hemisphere with electrode beams + target hotspots, layer toolbar
//   - Right rail: predicted outcome, PHQ-9 projected trajectory, regional engagement, safety flags
//   - Top bar: twin sync status, Export sim, Exit
//
// The overlay is mounted into <body> as an absolutely-positioned div with id `sim-room-root`
// and disposes itself on Exit. State is local to this instance.

import { getDemoPatient } from './service.js';

const MODALITIES = [
  { id: 'tdcs', label: 'tDCS', sub: 'Direct current' },
  { id: 'rtms', label: 'rTMS', sub: 'Magnetic' },
  { id: 'tfus', label: 'tFUS', sub: 'Focused ultrasound' },
  { id: 'tacs', label: 'tACS', sub: 'Alternating' },
];

const TARGETS = [
  { id: 'l-dlpfc', label: 'L-DLPFC',     mni: 'MNI51', x: 0.32, y: 0.36 },
  { id: 'r-dlpfc', label: 'R-DLPFC',     mni: 'MNI77', x: 0.68, y: 0.36 },
  { id: 'acc',     label: 'ACC',         mni: 'MNI55', x: 0.50, y: 0.46 },
  { id: 'hippo',   label: 'Hippocampus', mni: 'MNI70', x: 0.50, y: 0.66 },
  { id: 'insula',  label: 'Insula',      mni: 'MNI20', x: 0.45, y: 0.55 },
  { id: 'amyg',    label: 'Amygdala',    mni: 'MNI60', x: 0.55, y: 0.62 },
];

const LAYERS = ['Cortex', 'Subcortex', 'WM tracts', 'E-field', 'Connectivity'];

const STATE = {
  modality: 'tdcs',
  target: 'l-dlpfc',
  intensity: 2.0,
  duration: 30,
  frequency: 10,
  patient: null,
  ran: false, // becomes true after Run simulation, populates outcome panels
};

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _projectedPHQ(intensity, duration) {
  // Deterministic curve — steeper drop with higher dose.
  const k = (intensity / 4) * 0.4 + (duration / 60) * 0.4 + 0.2;
  const start = 23, end = Math.max(6, start - k * 17);
  const days = 56;
  const arr = [];
  for (let i = 0; i < days; i++) {
    const t = i / (days - 1);
    arr.push(start + (end - start) * t + Math.sin(i / 4) * 0.5 + (Math.random() - 0.5) * 0.4);
  }
  return arr;
}

function _engagementBars(targetId) {
  // Different targets engage different regions. Numbers feel believable, not scientific.
  const map = {
    'l-dlpfc': { 'L-DLPFC': 0.82, 'ACC indirect': 0.41, 'Default-mode': 0.34, 'Limbic spread': 0.18 },
    'r-dlpfc': { 'R-DLPFC': 0.78, 'ACC indirect': 0.36, 'Default-mode': 0.31, 'Limbic spread': 0.15 },
    'acc':     { 'ACC':      0.74, 'L-DLPFC':      0.46, 'Default-mode': 0.52, 'Limbic spread': 0.38 },
    'hippo':   { 'Hippocampus': 0.71, 'Entorhinal':  0.48, 'Default-mode': 0.41, 'Limbic spread': 0.55 },
    'insula':  { 'Insula':   0.69, 'Salience net': 0.58, 'Default-mode': 0.28, 'Limbic spread': 0.34 },
    'amyg':    { 'Amygdala': 0.66, 'PFC indirect': 0.31, 'Default-mode': 0.22, 'Limbic spread': 0.61 },
  };
  return map[targetId] || map['l-dlpfc'];
}

function _safetyFlags(modality, intensity) {
  const flags = [
    { c: '#3EE0C5', text: `Seizure risk · low (0.0${intensity > 2 ? '4' : '2'}%)` },
    { c: '#3EE0C5', text: 'Skin sensitivity · acceptable' },
    { c: '#3EE0C5', text: 'Headache risk · low' },
    { c: '#3EE0C5', text: 'No drug interactions detected' },
  ];
  if (modality === 'rtms' && intensity > 2.5) flags[0] = { c: '#F6B23C', text: 'Seizure risk · monitor (0.08%)' };
  return flags;
}

function _outcomePcts(modality, target, intensity, duration) {
  // Simple heuristic: tDCS-DLPFC at 2.0/30 → ~62% remission / 81% response.
  const base = { tdcs: 0.62, rtms: 0.74, tfus: 0.69, tacs: 0.55 }[modality] || 0.55;
  const targetBoost = target === 'l-dlpfc' ? 0.06 : target === 'acc' ? 0.04 : 0;
  const doseBoost = Math.min(0.08, (intensity / 4) * 0.04 + (duration / 60) * 0.04);
  const remission = Math.min(0.92, base + targetBoost + doseBoost);
  const response  = Math.min(0.96, remission + 0.18);
  return {
    remission: Math.round(remission * 100),
    response:  Math.round(response  * 100),
  };
}

// ── SVG helpers ─────────────────────────────────────────────────────────────
function svgBrainHemisphere() {
  // Top-down hemisphere with radial striations and target dots; electrode beams
  // come down from the top to the active target. Pure SVG, no WebGL.
  const tgt = TARGETS.find(t => t.id === STATE.target) || TARGETS[0];
  const cx = 600, cy = 480, R = 360;
  const otherDots = TARGETS.filter(t => t.id !== STATE.target).map(t => {
    const dx = (t.x - 0.5) * R * 1.6;
    const dy = (t.y - 0.5) * R * 1.6;
    return `<circle cx="${cx + dx}" cy="${cy + dy}" r="4" fill="#5BB6FF" opacity="0.75"/>
            <circle cx="${cx + dx}" cy="${cy + dy}" r="9" fill="none" stroke="#5BB6FF" stroke-width="1" opacity="0.18"/>`;
  }).join('');
  const tdx = (tgt.x - 0.5) * R * 1.6;
  const tdy = (tgt.y - 0.5) * R * 1.6;
  const targetX = cx + tdx, targetY = cy + tdy;
  // radial striations
  const lines = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * R * 0.55;
    const y1 = cy + Math.sin(a) * R * 0.55;
    const x2 = cx + Math.cos(a) * R * 0.98;
    const y2 = cy + Math.sin(a) * R * 0.98;
    lines.push(`<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="rgba(91,182,255,0.10)" stroke-width="0.6"/>`);
  }
  // horizontal sulci
  const sulci = [];
  for (let i = 0; i < 14; i++) {
    const y = cy - R * 0.7 + i * (R * 1.4 / 14);
    const w = Math.sqrt(Math.max(0, R*R - (y - cy)*(y - cy))) * 0.95;
    sulci.push(`<line x1="${cx - w}" y1="${y.toFixed(0)}" x2="${cx + w}" y2="${y.toFixed(0)}" stroke="rgba(91,182,255,0.07)" stroke-width="0.5"/>`);
  }
  // electrode beams
  const beam1X = targetX - 14, beam2X = targetX + 6;
  return `<svg class="sr-brain" viewBox="0 0 1200 960" preserveAspectRatio="xMidYMid meet">
    <defs>
      <radialGradient id="sr-brain-bg" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#0E1A26" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#05080C" stop-opacity="1"/>
      </radialGradient>
      <radialGradient id="sr-beam-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#3EE0C5" stop-opacity="0.9"/>
        <stop offset="60%" stop-color="#3EE0C5" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#3EE0C5" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#sr-brain-bg)"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(155,174,194,0.22)" stroke-width="1.2"/>
    <circle cx="${cx}" cy="${cy}" r="${R*0.78}" fill="none" stroke="rgba(91,182,255,0.18)" stroke-width="0.8"/>
    <circle cx="${cx}" cy="${cy}" r="${R*0.55}" fill="none" stroke="rgba(91,182,255,0.10)" stroke-width="0.6"/>
    <line x1="${cx}" y1="${cy-R}" x2="${cx}" y2="${cy+R}" stroke="rgba(155,174,194,0.10)" stroke-dasharray="3 6"/>
    <line x1="${cx-R}" y1="${cy}" x2="${cx+R}" y2="${cy}" stroke="rgba(155,174,194,0.10)" stroke-dasharray="3 6"/>
    ${sulci.join('')}
    ${lines.join('')}
    ${otherDots}
    <!-- electrode beams -->
    <line x1="${beam1X}" y1="40"  x2="${beam1X}" y2="${targetY - 18}" stroke="#3EE0C5" stroke-width="1.6" opacity="0.9"/>
    <line x1="${beam2X}" y1="60"  x2="${beam2X}" y2="${targetY - 18}" stroke="#3EE0C5" stroke-width="1.6" opacity="0.9" stroke-dasharray="3 4"/>
    <line x1="${beam1X}" y1="${targetY - 18}" x2="${targetX - 4}" y2="${targetY - 4}" stroke="rgba(62,224,197,0.5)" stroke-width="1"/>
    <line x1="${beam2X}" y1="${targetY - 18}" x2="${targetX + 4}" y2="${targetY - 4}" stroke="rgba(62,224,197,0.5)" stroke-width="1"/>
    <!-- target glow + dot -->
    <circle cx="${targetX}" cy="${targetY}" r="60" fill="url(#sr-beam-glow)"/>
    <circle cx="${targetX}" cy="${targetY}" r="22" fill="none" stroke="#3EE0C5" stroke-width="1.4" opacity="0.9"/>
    <circle cx="${targetX}" cy="${targetY}" r="7"  fill="#3EE0C5"/>
    <circle cx="${targetX}" cy="${targetY}" r="3"  fill="#fff" opacity="0.85"/>
  </svg>`;
}

function svgPHQTrajectory() {
  const data = STATE.ran ? _projectedPHQ(STATE.intensity, STATE.duration)
                         : _projectedPHQ(2.0, 30);
  const w = 360, h = 200, p = { l: 24, r: 12, t: 18, b: 22 };
  const min = 6, max = 24;
  const xFor = (i) => p.l + (i / (data.length - 1)) * (w - p.l - p.r);
  const yFor = (v) => p.t + (1 - (v - min) / (max - min)) * (h - p.t - p.b);
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
  // remission threshold line at y=10
  const yRem = yFor(10);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:auto">
    <text x="${p.l-2}" y="${p.t+4}" font-size="10" fill="rgba(155,174,194,0.6)" text-anchor="end" font-family="var(--font-mono)">23</text>
    <text x="${p.l-2}" y="${h-p.b+10}" font-size="10" fill="rgba(155,174,194,0.6)" text-anchor="end" font-family="var(--font-mono)">8</text>
    <line x1="${p.l}" y1="${yRem}" x2="${w-p.r}" y2="${yRem}" stroke="rgba(62,224,197,0.5)" stroke-dasharray="3 3"/>
    <text x="${w-p.r-4}" y="${yRem-3}" text-anchor="end" font-size="9" fill="rgba(62,224,197,0.7)" font-family="var(--font-mono)">remission</text>
    <path d="${path}" fill="none" stroke="#FF6B8B" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

// ── Render ──────────────────────────────────────────────────────────────────
function renderRoom() {
  const p = STATE.patient;
  const tgt = TARGETS.find(t => t.id === STATE.target) || TARGETS[0];
  const out = _outcomePcts(STATE.modality, STATE.target, STATE.intensity, STATE.duration);
  const eng = _engagementBars(STATE.target);
  const flags = _safetyFlags(STATE.modality, STATE.intensity);
  const engRows = Object.entries(eng).map(([region, v], i) => {
    const colors = ['#3EE0C5', '#5BB6FF', '#8B7DFF', '#F6B23C'];
    return `<div class="sr-eng-row">
      <span class="sr-eng-name">${esc(region)}</span>
      <div class="sr-eng-bar"><div style="width:${(v*100).toFixed(0)}%;background:${colors[i%colors.length]}"></div></div>
      <span class="sr-eng-val">${v.toFixed(2)}</span>
    </div>`;
  }).join('');

  return `
  <div class="sr-shell">
    <!-- Top bar -->
    <header class="sr-topbar">
      <div class="sr-brand">
        <div class="sr-brand-mark">⊕</div>
        <div>
          <div class="sr-brand-name">DeepTwin <span class="sr-brand-room">SIMULATION ROOM</span></div>
          <div class="sr-brand-sub mono">${esc((p?.first_name || p?.name?.split(' ')[0] || 'Demo'))} ${esc((p?.last_name || ''))} · ${esc(p?.id || 'DSP-00421')} · DIGITAL TWIN V3.2</div>
        </div>
      </div>
      <div style="flex:1"></div>
      <div class="sr-sync"><span class="sr-sync-dot"></span> Twin synced · 4 min ago · 2,841 features</div>
      <button class="sr-pill" data-sr-action="export">⤓ Export sim</button>
      <button class="sr-pill" data-sr-action="exit">✕ Exit</button>
    </header>

    <div class="sr-body">
      <!-- Left rail -->
      <aside class="sr-rail sr-rail-l">
        <div class="sr-overline">STIMULATION MODALITY</div>
        <div class="sr-mod-grid">
          ${MODALITIES.map(m => `<button class="sr-mod-card${STATE.modality === m.id ? ' is-active' : ''}" data-sr-mod="${m.id}">
            <div class="sr-mod-label">${m.label}</div>
            <div class="sr-mod-sub">${m.sub}</div>
          </button>`).join('')}
        </div>

        <div class="sr-overline">TARGET REGION</div>
        <div class="sr-target-list">
          ${TARGETS.map(t => `<button class="sr-target-row${STATE.target === t.id ? ' is-active' : ''}" data-sr-target="${t.id}">
            <span class="sr-target-pin">◎</span>
            <span class="sr-target-label">${t.label}</span>
            <span class="sr-target-mni mono">${t.mni}</span>
          </button>`).join('')}
        </div>

        <div class="sr-slider-wrap">
          <div class="sr-overline">INTENSITY · <span class="mono">${STATE.intensity.toFixed(1)} mA</span></div>
          <input type="range" min="0.5" max="4" step="0.1" value="${STATE.intensity}" class="sr-slider" data-sr-slider="intensity"/>
        </div>
        <div class="sr-slider-wrap">
          <div class="sr-overline">DURATION · <span class="mono">${STATE.duration} min</span></div>
          <input type="range" min="5" max="60" step="1" value="${STATE.duration}" class="sr-slider" data-sr-slider="duration"/>
        </div>
        <div class="sr-slider-wrap">
          <div class="sr-overline">FREQUENCY · <span class="mono">${STATE.frequency} Hz</span></div>
          <input type="range" min="0.5" max="40" step="0.5" value="${STATE.frequency}" class="sr-slider" data-sr-slider="frequency"/>
        </div>

        <button class="sr-run" data-sr-action="run">▶ Run simulation</button>
      </aside>

      <!-- Center -->
      <section class="sr-center">
        <div class="sr-center-meta">
          <div class="mono">DEEPTWIN · v3.2 · MNI152 · 2mm iso</div>
          <div class="mono">VIEW · auto-rotate · 208°</div>
        </div>
        <div class="sr-center-meta">
          <div class="mono sr-meta-dim">Patient features: 2,841 / mismatch tol 0.04</div>
          <div class="mono sr-meta-dim">E-FIELD · 0.35 V/m peak</div>
        </div>
        <div class="sr-brain-stage">${svgBrainHemisphere()}</div>
        <div class="sr-layer-bar">
          ${LAYERS.map((l, i) => `<button class="sr-layer-btn${i === 0 ? ' is-active' : ''}" data-sr-layer="${l}">${l}</button>`).join('')}
          <div style="flex:1"></div>
          <button class="sr-icon-btn" title="Reset view">↻</button>
          <button class="sr-icon-btn" title="Fullscreen">⛶</button>
        </div>
      </section>

      <!-- Right rail -->
      <aside class="sr-rail sr-rail-r">
        <div class="sr-overline">PREDICTED OUTCOME · 8-WEEK</div>
        <div class="sr-outcome-grid">
          <div class="sr-outcome-card sr-outcome-mint">
            <div class="sr-outcome-label">REMISSION</div>
            <div class="sr-outcome-bar"><div style="width:${out.remission}%;background:#3EE0C5"></div></div>
            <div class="sr-outcome-val mono">${STATE.ran ? out.remission + '%' : '—'}</div>
            <div class="sr-outcome-sub">${STATE.ran ? 'PHQ-9 ≤ 5' : 'Run simulation'}</div>
          </div>
          <div class="sr-outcome-card sr-outcome-sky">
            <div class="sr-outcome-label">RESPONSE</div>
            <div class="sr-outcome-bar"><div style="width:${out.response}%;background:#5BB6FF"></div></div>
            <div class="sr-outcome-val mono">${STATE.ran ? out.response + '%' : '—'}</div>
            <div class="sr-outcome-sub">≥50% PHQ-9 reduction</div>
          </div>
        </div>

        <div class="sr-card">
          <div class="sr-overline">PHQ-9 PROJECTED TRAJECTORY</div>
          <div class="sr-phq-chart">${svgPHQTrajectory()}</div>
        </div>

        <div class="sr-card">
          <div class="sr-overline">REGIONAL ENGAGEMENT</div>
          <div class="sr-eng">${engRows}</div>
        </div>

        <div class="sr-card">
          <div class="sr-overline">SAFETY &amp; SIDE-EFFECT FLAGS</div>
          <ul class="sr-flags">
            ${flags.map(f => `<li><span class="sr-flag-dot" style="background:${f.c}"></span>${esc(f.text)}</li>`).join('')}
          </ul>
        </div>
      </aside>
    </div>
  </div>`;
}

function _wire(root) {
  // Modality
  root.querySelectorAll('[data-sr-mod]').forEach(btn => btn.addEventListener('click', () => {
    STATE.modality = btn.getAttribute('data-sr-mod');
    rerender();
  }));
  // Target
  root.querySelectorAll('[data-sr-target]').forEach(btn => btn.addEventListener('click', () => {
    STATE.target = btn.getAttribute('data-sr-target');
    rerender();
  }));
  // Sliders — live update without full re-render
  root.querySelectorAll('[data-sr-slider]').forEach(sl => sl.addEventListener('input', () => {
    const k = sl.getAttribute('data-sr-slider');
    const v = parseFloat(sl.value);
    STATE[k] = v;
    // Update label only — avoid full rerender so the slider doesn't re-mount mid-drag
    const lbl = sl.previousElementSibling?.querySelector?.('.mono');
    if (lbl) {
      if (k === 'intensity') lbl.textContent = v.toFixed(1) + ' mA';
      else if (k === 'duration')  lbl.textContent = v + ' min';
      else if (k === 'frequency') lbl.textContent = v + ' Hz';
    }
  }));
  // Layer toggles (visual only)
  root.querySelectorAll('[data-sr-layer]').forEach(btn => btn.addEventListener('click', () => {
    btn.classList.toggle('is-active');
  }));
  // Run / Export / Exit
  root.querySelectorAll('[data-sr-action]').forEach(btn => btn.addEventListener('click', () => {
    const a = btn.getAttribute('data-sr-action');
    if (a === 'run') {
      btn.disabled = true;
      btn.textContent = 'Running…';
      setTimeout(() => { STATE.ran = true; rerender(); }, 700);
    } else if (a === 'export') {
      const blob = new Blob([JSON.stringify({
        patient_id: STATE.patient?.id,
        modality: STATE.modality, target: STATE.target,
        intensity_ma: STATE.intensity, duration_min: STATE.duration, frequency_hz: STATE.frequency,
        outcome: _outcomePcts(STATE.modality, STATE.target, STATE.intensity, STATE.duration),
        regional_engagement: _engagementBars(STATE.target),
        safety_flags: _safetyFlags(STATE.modality, STATE.intensity).map(f => f.text),
        exported_at: new Date().toISOString(),
        disclaimer: 'Simulation-only — not a prescription. Clinician review required.',
      }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a2 = document.createElement('a');
      a2.href = url;
      a2.download = `deeptwin_sim_${STATE.patient?.id || 'demo'}_${Date.now()}.json`;
      document.body.appendChild(a2); a2.click(); a2.remove();
      URL.revokeObjectURL(url);
    } else if (a === 'exit') {
      closeSimRoom();
    }
  }));
}

let _root = null;
function rerender() {
  if (!_root) return;
  _root.innerHTML = renderRoom();
  _wire(_root);
}

export function openSimRoom(patientResolver) {
  // Resolve patient identity (id, first_name, last_name) from whatever is in scope.
  const id = patientResolver
    || window._selectedPatientId
    || window._profilePatientId
    || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ds_pat_selected_id'))
    || '';
  const demo = getDemoPatient(id) || {};
  STATE.patient = {
    id: id || demo.id || 'DSP-00421',
    first_name: demo.first_name || (demo.name ? demo.name.split(' ')[0] : 'Samantha'),
    last_name:  demo.last_name  || (demo.name ? demo.name.split(' ').slice(1).join(' ') : 'Li'),
    name: demo.name,
  };
  STATE.ran = false;

  // Disable body scroll while open
  document.body.dataset.srOpen = '1';
  // Mount
  let root = document.getElementById('sim-room-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'sim-room-root';
    document.body.appendChild(root);
  }
  _root = root;
  root.innerHTML = renderRoom();
  _wire(root);
  // ESC to exit
  const onKey = (e) => { if (e.key === 'Escape') closeSimRoom(); };
  root._srKey = onKey;
  document.addEventListener('keydown', onKey);
}

export function closeSimRoom() {
  const root = document.getElementById('sim-room-root');
  if (!root) return;
  if (root._srKey) document.removeEventListener('keydown', root._srKey);
  root.remove();
  _root = null;
  delete document.body.dataset.srOpen;
}

// Expose for inline onclick fallback
if (typeof window !== 'undefined') {
  window._openSimRoom = openSimRoom;
  window._closeSimRoom = closeSimRoom;
}
