// Patient Analytics — Bloomberg-style data terminal per patient.
// Ported from the design at /Desktop/pateints analytics into vanilla DOM.
// Two entry points:
//   pgPatientAnalyticsCohort(setTopbar) — cohort view used by Patients > Analytics tab
//   pgPatientAnalyticsDetail(setTopbar, patientId) — per-patient terminal,
//     opened from a row click, deep-linked from URL, or DeepTwin tile.

import { DEMO_PATIENT_ROSTER, demoPtFromRoster } from './patient-dashboard-helpers.js';
import { api } from './api.js';
import {
  EvidenceChip,
  PatientEvidenceTab,
  createEvidenceQueryForTarget,
  initEvidenceDrawer,
  openEvidenceDrawer,
  wireEvidenceChips,
} from './evidence-intelligence.js';
import { emptyPatientEvidenceContext, loadPatientEvidenceContext } from './patient-evidence-context.js';

function emptyAnalyticsEvidenceContext(patientId = '') {
  return emptyPatientEvidenceContext(patientId);
}

async function loadAnalyticsEvidenceContext(patientId) {
  return loadPatientEvidenceContext(patientId, { fetchReports: true });
}

// ── Demo telemetry generators ────────────────────────────────────────────────
// Deterministic pseudo-random so the same patient renders the same view
// across re-renders without a backend. Hashing on patient id keeps each
// demo patient's curves visibly different.
function _seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
function _hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function buildPatientTelemetry(p) {
  const seed = _hash(p.id || 'demo');
  const rand = _seededRand(seed);
  const phqStart = 18 + Math.floor(rand() * 8);   // 18–25
  const gadStart = 14 + Math.floor(rand() * 6);   // 14–19
  const phqEnd   = 5 + Math.floor(rand() * 6);    // 5–10
  const gadEnd   = 6 + Math.floor(rand() * 5);    // 6–10
  const days = 98;
  const lerp = (a, b, t) => a + (b - a) * t;
  const seriesPHQ = [], seriesGAD = [], seriesHRV = [], seriesSleep = [], seriesMood = [];
  for (let i = 0; i < days; i++) {
    const t = i / (days - 1);
    seriesPHQ.push(Math.max(4, lerp(phqStart, phqEnd, t) + Math.sin(i / 4) * 0.6 + (rand() - 0.5) * 0.5));
    seriesGAD.push(Math.max(4, lerp(gadStart, gadEnd, t) + Math.cos(i / 3) * 0.5 + (rand() - 0.5) * 0.5));
    seriesHRV.push(38 + i * 0.18 + Math.sin(i / 5) * 4 + (rand() - 0.5) * 2);
    seriesSleep.push(Math.min(7.6, 5.2 + i * 0.025) + Math.sin(i / 6) * 0.5 + (rand() - 0.5) * 0.4);
    seriesMood.push(Math.min(8.5, 3.0 + i * 0.04 + Math.sin(i / 3.5) * 0.7 + (rand() - 0.5) * 0.5));
  }
  // Timeline events
  const ev = [];
  for (let w = 1; w < 14; w++) {
    for (let d = 0; d < 5; d++) {
      const day = w * 7 + d;
      if (day > 97) continue;
      const ok = !(w === 4 && d === 2) && !(w === 9 && d === 1);
      ev.push({ day, lane: 'session', type: ok ? 'session-ok' : 'session-miss',
                label: ok ? `${p.primary_modality || 'tDCS'} 2.0mA · 30 min` : 'Missed session' });
    }
  }
  for (let w = 0; w < 14; w++) {
    ev.push({ day: w * 7,     lane: 'assessment', type: 'phq9', label: `PHQ-9 ${Math.round(seriesPHQ[w*7])}` });
    ev.push({ day: w * 7 + 1, lane: 'assessment', type: 'gad7', label: `GAD-7 ${Math.round(seriesGAD[w*7+1] || 8)}` });
  }
  ev.push({ day: 2,  lane: 'report', type: 'qeeg', label: 'qEEG baseline' });
  ev.push({ day: 30, lane: 'report', type: 'qeeg', label: 'qEEG mid-course' });
  ev.push({ day: 75, lane: 'report', type: 'qeeg', label: 'qEEG follow-up' });
  ev.push({ day: 1,  lane: 'report', type: 'mri',  label: 'MRI structural' });
  ev.push({ day: 60, lane: 'report', type: 'mri',  label: 'fMRI task' });
  ev.push({ day: 0,  lane: 'medication', type: 'med-start',  label: 'Sertraline 100mg start' });
  ev.push({ day: 42, lane: 'medication', type: 'med-change', label: 'Sertraline → 150mg' });
  ev.push({ day: 14, lane: 'medication', type: 'med-prn',    label: 'Lorazepam 0.5mg PRN' });
  ev.push({ day: 11, lane: 'alert', type: 'alert-low', label: 'HRV drop -22%', severity: 'low' });
  ev.push({ day: 28, lane: 'alert', type: 'alert-med', label: 'C-SSRS flag', severity: 'medium' });
  ev.push({ day: 56, lane: 'alert', type: 'alert-low', label: 'Sleep latency >90min', severity: 'low' });
  ev.push({ day: 5,  lane: 'life', type: 'life', label: 'Stressor: Job change' });
  ev.push({ day: 33, lane: 'life', type: 'life', label: 'Therapy goal milestone' });
  ev.push({ day: 70, lane: 'life', type: 'life', label: 'Travel — out of region 4d' });
  ev.push({ day: 35, lane: 'twin', type: 'twin-sim', label: 'DeepTwin sim · rTMS' });
  ev.push({ day: 65, lane: 'twin', type: 'twin-sim', label: 'DeepTwin sim · combo' });
  ev.push({ day: 92, lane: 'twin', type: 'twin-sim', label: 'DeepTwin sim · taper' });

  const sessionsTotal = 38;
  const sessionsCompleted = 29 + (seed % 6);
  return {
    seriesPHQ, seriesGAD, seriesHRV, seriesSleep, seriesMood, events: ev,
    sessionsTotal, sessionsCompleted,
    phqStart, phqEnd, gadStart, gadEnd,
    riskScore: (0.20 + (seed % 100) / 600).toFixed(2),
    adherence: 80 + (seed % 16),
  };
}

// ── Static reference panels ─────────────────────────────────────────────────
const QEEG_BANDS = [
  { name: 'Delta', value: 18.4, baseline: 22.1, color: '#8B7DFF' },
  { name: 'Theta', value: 14.2, baseline: 18.8, color: '#5BB6FF' },
  { name: 'Alpha', value: 31.8, baseline: 24.6, color: '#3EE0C5' },
  { name: 'Beta',  value: 26.5, baseline: 22.0, color: '#F6B23C' },
  { name: 'Gamma', value:  9.1, baseline: 12.5, color: '#FF6B8B' },
];
const QEEG_REGIONS = [
  { name: 'L-DLPFC', asym:  0.18 },
  { name: 'R-DLPFC', asym: -0.04 },
  { name: 'ACC',     asym:  0.09 },
  { name: 'Insula',  asym: -0.02 },
  { name: 'Hippocampus', asym: 0.12 },
  { name: 'Amygdala',    asym: -0.21 },
];
const MRI_FINDINGS = [
  { region: 'Hippocampus L', current: 3.79, unit: 'cm³', delta: +2.2 },
  { region: 'Hippocampus R', current: 3.74, unit: 'cm³', delta: +1.6 },
  { region: 'ACC volume',    current: 5.01, unit: 'cm³', delta: +1.8 },
  { region: 'Amygdala vol',  current: 1.74, unit: 'cm³', delta: -2.2 },
];
const MEDICATIONS = [
  { name: 'Sertraline', dose: '150 mg',   schedule: 'Daily AM', adherence: 96, status: 'active', trend: 'stable' },
  { name: 'Lorazepam',  dose: '0.5 mg',   schedule: 'PRN',      adherence: 100, status: 'as-needed', trend: 'decreasing' },
  { name: 'Melatonin',  dose: '3 mg',     schedule: '21:30',    adherence: 88,  status: 'active',    trend: 'stable' },
  { name: 'Vitamin D₃', dose: '2000 IU',  schedule: 'Daily',    adherence: 78,  status: 'active',    trend: 'stable' },
];
const ASSESSMENTS_DEF = [
  { code: 'PHQ-9',  threshold: 10, dir: 'down-good' },
  { code: 'GAD-7',  threshold: 10, dir: 'down-good' },
  { code: 'C-SSRS', threshold:  1, dir: 'down-good', current: 0,  baseline: 2  },
  { code: 'QIDS',   threshold: 11, dir: 'down-good', current: 6,  baseline: 18 },
  { code: 'MADRS',  threshold: 20, dir: 'down-good', current: 12, baseline: 32 },
  { code: 'WHO-5',  threshold: 50, dir: 'up-good',   current: 64, baseline: 28 },
  { code: 'PSQI',   threshold:  5, dir: 'down-good', current: 6,  baseline: 14 },
  { code: 'ISI',    threshold:  8, dir: 'down-good', current: 8,  baseline: 18 },
];
const SCREEN_USAGE = [
  { app: 'Social',       hours: 1.2, baseline: 3.4, color: '#FF6B8B' },
  { app: 'Messaging',    hours: 0.9, baseline: 1.1, color: '#5BB6FF' },
  { app: 'News',         hours: 0.4, baseline: 1.6, color: '#F6B23C' },
  { app: 'Productivity', hours: 2.8, baseline: 1.4, color: '#3EE0C5' },
  { app: 'Therapy app',  hours: 0.6, baseline: 0.1, color: '#8B7DFF' },
  { app: 'Other',        hours: 0.5, baseline: 0.7, color: '#9BAEC2' },
];
const VOICE_FEATURES = [
  { name: 'Pitch range (Hz)',    current: 142, dir: 'up' },
  { name: 'Speech rate (wpm)',   current: 138, dir: 'up' },
  { name: 'Pause ratio',         current: 0.18, dir: 'down' },
];
const TEXT_SENTIMENT = [
  { day: 0,  valence: -0.62, arousal: 0.42 }, { day: 14, valence: -0.41, arousal: 0.38 },
  { day: 28, valence: -0.18, arousal: 0.31 }, { day: 42, valence:  0.04, arousal: 0.26 },
  { day: 56, valence:  0.22, arousal: 0.21 }, { day: 70, valence:  0.31, arousal: 0.18 },
  { day: 84, valence:  0.44, arousal: 0.16 }, { day: 95, valence:  0.51, arousal: 0.14 },
];
const CORRELATIONS_LABELS = ['PHQ-9','GAD-7','HRV','Sleep','Adher.','Voice','Steps','Social'];
const CORRELATIONS_MATRIX = [
  [ 1.00, 0.78,-0.61,-0.52,-0.34,-0.71,-0.42, 0.58],
  [ 0.78, 1.00,-0.49,-0.44,-0.28,-0.55,-0.31, 0.46],
  [-0.61,-0.49, 1.00, 0.67, 0.41, 0.62, 0.51,-0.34],
  [-0.52,-0.44, 0.67, 1.00, 0.39, 0.48, 0.42,-0.30],
  [-0.34,-0.28, 0.41, 0.39, 1.00, 0.32, 0.51,-0.21],
  [-0.71,-0.55, 0.62, 0.48, 0.32, 1.00, 0.39,-0.42],
  [-0.42,-0.31, 0.51, 0.42, 0.51, 0.39, 1.00,-0.18],
  [ 0.58, 0.46,-0.34,-0.30,-0.21,-0.42,-0.18, 1.00],
];
const PREDICTIONS = [
  { modality: 'tDCS - Continue',         remission: 0.62, weeks: 4, confidence: 0.78, evidence: { targetName: 'protocol_ranking', label: '3 reviews + 8 cohorts', count: 27, level: 'high', modality: 'tdcs', intervention: 'tdcs' } },
  { modality: 'rTMS DLPFC',              remission: 0.74, weeks: 4, confidence: 0.71, evidence: { targetName: 'protocol_ranking', label: 'High evidence', count: 34, level: 'high', modality: 'rtms', intervention: 'rtms' } },
  { modality: 'tFUS subgenual ACC',      remission: 0.69, weeks: 6, confidence: 0.62, evidence: { targetName: 'protocol_ranking', label: 'Moderate evidence', count: 12, level: 'moderate', modality: 'tfus', intervention: 'tfus' } },
  { modality: 'Combo tDCS + CBT',        remission: 0.78, weeks: 6, confidence: 0.74, evidence: { targetName: 'protocol_ranking', label: '27 papers', count: 27, level: 'high', modality: 'tdcs', intervention: 'cbt' } },
  { modality: 'Taper to maintenance',    remission: 0.51, weeks: 8, confidence: 0.69, evidence: { targetName: 'protocol_ranking', label: '9 papers', count: 9, level: 'moderate', modality: 'neuromodulation' } },
];
const HOME_TASKS = [
  { name: 'Morning mindfulness',  count: 24, expected: 28 },
  { name: 'Mood log',             count: 91, expected: 98 },
  { name: 'CBT thought record',   count: 12, expected: 14 },
  { name: 'Walk ≥ 4000 steps',    count: 71, expected: 90 },
];
const LOCATIONS = { homePct: 64, workPct: 22, communityPct: 11, otherPct: 3,
                    uniqueLocations30d: 24, travelKm30d: 198 };

// ── Tiny utilities ──────────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function initials(p) {
  return ((p.first_name || '').charAt(0) + (p.last_name || '').charAt(0)).toUpperCase() || 'PT';
}
function avatarColor(p) {
  const palette = ['#8B7DFF','#3EE0C5','#5BB6FF','#F6B23C','#FF6B8B','#B6E66A'];
  return palette[_hash(p.id || '') % palette.length];
}

// ── SVG primitives (return strings) ─────────────────────────────────────────
function svgSparkline(data, { width = 120, height = 32, stroke = 'var(--teal)', fill = true, strokeWidth = 1.4 } = {}) {
  const min = Math.min(...data); const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = 1 + (i / (data.length - 1)) * (width - 2);
    const y = (height - 1) - ((v - min) / range) * (height - 2);
    return [x, y];
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const id = 'sk-' + Math.random().toString(36).slice(2, 8);
  const area = `${path} L${pts[pts.length-1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${fill ? `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${stroke}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/>
    </linearGradient></defs><path d="${area}" fill="url(#${id})"/>` : ''}
    <path d="${path}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function svgHeadMap(regions, size = 130) {
  const placements = {
    'L-DLPFC': [0.32, 0.30], 'R-DLPFC': [0.68, 0.30], 'ACC': [0.50, 0.42],
    'Insula':  [0.50, 0.55], 'Hippocampus': [0.50, 0.70], 'Amygdala': [0.43, 0.62],
  };
  const colorFor = (a) => a > 0.10 ? '#3EE0C5' : a > 0 ? '#5BB6FF' : a > -0.10 ? '#F6B23C' : '#FF6B8B';
  const grads = regions.map((r, i) =>
    `<radialGradient id="hd-${i}"><stop offset="0%" stop-color="${colorFor(r.asym)}" stop-opacity="0.9"/><stop offset="100%" stop-color="${colorFor(r.asym)}" stop-opacity="0"/></radialGradient>`).join('');
  const spots = regions.map((r, i) => {
    const p = placements[r.name]; if (!p) return '';
    return `<circle cx="${p[0]*100}" cy="${p[1]*100}" r="14" fill="url(#hd-${i})"/>
            <circle cx="${p[0]*100}" cy="${p[1]*100}" r="2" fill="${colorFor(r.asym)}"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">
    <defs>${grads}<radialGradient id="hd-bg"><stop offset="0%" stop-color="#1A2738"/><stop offset="100%" stop-color="#0E1722"/></radialGradient></defs>
    <circle cx="50" cy="50" r="44" fill="url(#hd-bg)" stroke="rgba(255,255,255,0.18)" stroke-width="0.6"/>
    <path d="M 47 6 L 50 1 L 53 6" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.6"/>
    <ellipse cx="6"  cy="50" rx="3" ry="6" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
    <ellipse cx="94" cy="50" rx="3" ry="6" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
    <line x1="50" y1="6" x2="50" y2="94" stroke="rgba(255,255,255,0.05)"/>
    <line x1="6" y1="50" x2="94" y2="50" stroke="rgba(255,255,255,0.05)"/>
    ${spots}
  </svg>`;
}

function svgDonut(segments, { size = 90, thickness = 11, centerLabel = '', centerSub = '' } = {}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((a, b) => a + b.value, 0) || 1;
  let offset = 0;
  const arcs = segments.map(s => {
    const len = (s.value / sum) * c;
    const out = `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thickness}" stroke-dasharray="${len.toFixed(2)} ${(c-len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
    offset += len;
    return out;
  }).join('');
  return `<div class="pa-donut" style="position:relative;width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${thickness}"/>
      ${arcs}
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      ${centerLabel ? `<div style="font-family:var(--font-mono);font-size:${size*0.20}px;font-weight:600;color:var(--text-primary)">${esc(centerLabel)}</div>` : ''}
      ${centerSub ? `<div class="pa-overline">${esc(centerSub)}</div>` : ''}
    </div>
  </div>`;
}

function svgStackBar(segments, width = 180, height = 6) {
  const sum = segments.reduce((a, b) => a + b.value, 0) || 1;
  let acc = 0;
  const rects = segments.map((s, i) => {
    const w = (s.value / sum) * width;
    const r = `<rect x="${acc.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="${s.color}" rx="${i === 0 ? 4 : 0}"/>`;
    acc += w;
    return r;
  }).join('');
  return `<svg width="${width}" height="${height}">${rects}</svg>`;
}

// Layered timeline SVG
function buildTimeline(tel) {
  const totalDays = 98, today = 95;
  const labelCol = 130, padR = 14, fullW = 1180;
  const innerW = fullW - labelCol - padR;
  const dayX = (d) => labelCol + (d / totalDays) * innerW;
  const lanes = [
    { id: 'phq',       label: 'PHQ-9 / GAD-7',       h: 86 },
    { id: 'biometric', label: 'HRV · Sleep · Mood',  h: 76 },
    { id: 'session',   label: 'Sessions',            h: 32 },
    { id: 'medication',label: 'Medications',         h: 28 },
    { id: 'report',    label: 'Reports & scans',     h: 28 },
    { id: 'twin',      label: 'DeepTwin runs',       h: 28 },
    { id: 'alert',     label: 'Alerts',              h: 28 },
    { id: 'life',      label: 'Life events',         h: 28 },
  ];
  const totalH = lanes.reduce((a, l) => a + l.h + 8, 0) + 50;

  // axis ticks
  let svg = `<svg width="100%" height="${totalH}" viewBox="0 0 ${fullW} ${totalH}" preserveAspectRatio="none" style="display:block">`;
  for (let w = 0; w < 15; w++) {
    const x = dayX(w * 7);
    svg += `<line x1="${x}" y1="20" x2="${x}" y2="${totalH-18}" stroke="rgba(255,255,255,0.04)"/>`;
    svg += `<text x="${x}" y="14" text-anchor="middle" font-family="var(--font-mono)" font-size="9" fill="var(--text-tertiary)">W${w+1}</text>`;
  }
  // today
  svg += `<line x1="${dayX(today)}" y1="20" x2="${dayX(today)}" y2="${totalH-18}" stroke="var(--teal)" stroke-opacity="0.5" stroke-dasharray="3 3"/>`;
  svg += `<rect x="${dayX(today)-18}" y="4" width="36" height="13" rx="3" fill="var(--teal)" opacity="0.18"/>`;
  svg += `<text x="${dayX(today)}" y="13" text-anchor="middle" font-size="9" font-weight="600" fill="var(--teal)" font-family="var(--font-mono)">TODAY</text>`;

  let yCursor = 26;
  for (const lane of lanes) {
    const top = yCursor;
    yCursor += lane.h + 8;
    svg += `<text x="12" y="${top+14}" font-size="10" font-weight="500" fill="var(--text-secondary)">${esc(lane.label)}</text>`;
    svg += `<rect x="${labelCol}" y="${top}" width="${innerW}" height="${lane.h}" rx="6" fill="rgba(255,255,255,0.012)" stroke="rgba(255,255,255,0.04)"/>`;

    if (lane.id === 'phq') {
      const max = 24, min = 0;
      const yFor = (v) => top + 6 + (1 - (v - min) / (max - min)) * (lane.h - 12);
      const phqPath = tel.seriesPHQ.map((v, i) => `${i === 0 ? 'M' : 'L'}${dayX(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
      const gadPath = tel.seriesGAD.map((v, i) => `${i === 0 ? 'M' : 'L'}${dayX(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
      svg += `<line x1="${labelCol}" x2="${labelCol+innerW}" y1="${yFor(15)}" y2="${yFor(15)}" stroke="rgba(255,107,139,0.18)" stroke-dasharray="2 3"/>`;
      svg += `<line x1="${labelCol}" x2="${labelCol+innerW}" y1="${yFor(10)}" y2="${yFor(10)}" stroke="rgba(246,178,60,0.18)" stroke-dasharray="2 3"/>`;
      svg += `<line x1="${labelCol}" x2="${labelCol+innerW}" y1="${yFor(5)}"  y2="${yFor(5)}"  stroke="rgba(62,224,197,0.18)" stroke-dasharray="2 3"/>`;
      svg += `<text x="${labelCol+innerW-4}" y="${yFor(15)-2}" text-anchor="end" font-size="8" fill="rgba(255,107,139,0.6)" font-family="var(--font-mono)">moderate-severe</text>`;
      svg += `<text x="${labelCol+innerW-4}" y="${yFor(5)-2}" text-anchor="end" font-size="8" fill="rgba(62,224,197,0.6)" font-family="var(--font-mono)">remission</text>`;
      svg += `<path d="${phqPath} L${dayX(tel.seriesPHQ.length-1)},${top+lane.h-2} L${dayX(0)},${top+lane.h-2} Z" fill="#FF6B8B" fill-opacity="0.06"/>`;
      svg += `<path d="${phqPath}" fill="none" stroke="#FF6B8B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      svg += `<path d="${gadPath}" fill="none" stroke="#F6B23C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      svg += `<circle cx="${dayX(tel.seriesPHQ.length-1)}" cy="${yFor(tel.seriesPHQ.at(-1))}" r="3.5" fill="#FF6B8B"/>`;
      svg += `<circle cx="${dayX(tel.seriesGAD.length-1)}" cy="${yFor(tel.seriesGAD.at(-1))}" r="3.5" fill="#F6B23C"/>`;
    }
    if (lane.id === 'biometric') {
      const drawLine = (data, color, opacity) => {
        const min = Math.min(...data), max = Math.max(...data);
        const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${dayX(i).toFixed(1)},${(top + 6 + (1 - (v - min)/(max-min || 1)) * (lane.h - 14)).toFixed(1)}`).join(' ');
        return `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.4" opacity="${opacity}"/>`;
      };
      svg += drawLine(tel.seriesHRV,   '#3EE0C5', 0.9);
      svg += drawLine(tel.seriesSleep, '#5BB6FF', 0.7);
      svg += drawLine(tel.seriesMood,  '#8B7DFF', 0.7);
    }
    const evs = tel.events.filter(e => e.lane === lane.id);
    const cy = top + lane.h / 2;
    for (const e of evs) {
      const x = dayX(e.day);
      if (lane.id === 'session') {
        const ok = e.type === 'session-ok';
        svg += `<rect x="${x-1.2}" y="${top+6}" width="2.4" height="${lane.h-12}" rx="1" fill="${ok ? '#3EE0C5' : '#FF6B8B'}" opacity="${ok ? 0.85 : 1}"><title>${esc(e.label)}</title></rect>`;
      } else if (lane.id === 'medication') {
        if (e.type === 'med-start') svg += `<polygon points="${x},${cy-5} ${x+5},${cy} ${x},${cy+5} ${x-5},${cy}" fill="#8B7DFF"><title>${esc(e.label)}</title></polygon>`;
        else if (e.type === 'med-change') svg += `<rect x="${x-3}" y="${cy-3}" width="6" height="6" rx="1.5" fill="#8B7DFF" stroke="#fff" stroke-width="0.5"><title>${esc(e.label)}</title></rect>`;
        else svg += `<circle cx="${x}" cy="${cy}" r="2.5" fill="#8B7DFF" opacity="0.6"><title>${esc(e.label)}</title></circle>`;
      } else if (lane.id === 'report') {
        svg += `<rect x="${x-3.5}" y="${cy-4}" width="7" height="8" rx="1" fill="#5BB6FF" opacity="0.85"><title>${esc(e.label)}</title></rect>`;
      } else if (lane.id === 'twin') {
        svg += `<circle cx="${x}" cy="${cy}" r="6" fill="none" stroke="#3EE0C5" stroke-width="1" opacity="0.4"/><circle cx="${x}" cy="${cy}" r="3" fill="#3EE0C5"><title>${esc(e.label)}</title></circle>`;
      } else if (lane.id === 'alert') {
        const c = e.severity === 'medium' ? '#FF6B8B' : '#F6B23C';
        svg += `<polygon points="${x},${cy-5} ${x+5},${cy+4} ${x-5},${cy+4}" fill="${c}"><title>${esc(e.label)}</title></polygon>`;
      } else if (lane.id === 'life') {
        svg += `<circle cx="${x}" cy="${cy}" r="3" fill="none" stroke="rgba(155,174,194,0.9)" stroke-width="1"><title>${esc(e.label)}</title></circle>`;
      }
    }
  }
  // bottom labels
  const dateLabels = ['Jan 14','Jan 28','Feb 11','Feb 25','Mar 11','Mar 25','Apr 08','Apr 22'];
  dateLabels.forEach((l, i) => {
    svg += `<text x="${dayX(i*14)}" y="${totalH-4}" text-anchor="middle" font-size="9" fill="var(--text-tertiary)" font-family="var(--font-mono)">${l}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

// ── Widget bodies ───────────────────────────────────────────────────────────
function widgetBio(tel) {
  const tiles = [
    { label: 'HRV (rMSSD)',  val: '54',  unit: 'ms',  delta: '+42%', color: '#3EE0C5', series: tel.seriesHRV.slice(-30) },
    { label: 'Sleep',        val: '7.4', unit: 'h',   delta: '+2.2h', color: '#5BB6FF', series: tel.seriesSleep.slice(-30) },
    { label: 'Resting HR',   val: '62',  unit: 'bpm', delta: '−7',    color: '#FF6B8B', series: tel.seriesHRV.slice(-30).map(v => 80 - (v - 38) * 0.5) },
    { label: 'Steps (avg)',  val: '6.4', unit: 'k',   delta: '+38%',  color: '#B6E66A', series: tel.seriesMood.slice(-30).map(v => 4000 + v * 400) },
    { label: 'Stress',       val: '32',  unit: '/100', delta: '−28',  color: '#F6B23C', series: tel.seriesPHQ.slice(-30).map(v => v * 4) },
    { label: 'SpO₂',         val: '97.8', unit: '%',  delta: 'stable', color: '#8B7DFF', series: Array(30).fill(0).map((_, i) => 96 + Math.sin(i/3) * 0.8) },
  ];
  return `<div class="pa-bio-grid">${tiles.map(t => `
    <div class="pa-bio-tile">
      <div class="pa-overline">${esc(t.label)}</div>
      <div class="pa-bio-tile-row">
        <span class="pa-bio-val">${t.val}</span>
        <span class="pa-bio-unit">${t.unit}</span>
        <span class="pa-bio-delta" style="color:${t.color}">${t.delta}</span>
      </div>
      ${svgSparkline(t.series, { width: 140, height: 22, stroke: t.color, strokeWidth: 1.2 })}
    </div>`).join('')}</div>`;
}

function evidenceChipHtml(patientId, targetName, contextType, label, count, level, featureSummary = []) {
  const query = createEvidenceQueryForTarget({
    patientId,
    targetName,
    contextType,
    featureSummary,
  });
  return EvidenceChip({
    count,
    evidenceLevel: level,
    label,
    compact: true,
    query,
  });
}

function widgetQeeg(_tel, patientId) {
  const max = 40;
  const bars = QEEG_BANDS.map(b => `
    <div class="pa-band-row">
      <span class="pa-band-name">${b.name}</span>
      <div class="pa-band-track">
        <div class="pa-band-fill" style="width:${(b.value/max)*100}%;background:${b.color}"></div>
        <div class="pa-band-baseline" style="left:${(b.baseline/max)*100}%"></div>
      </div>
      <span class="pa-band-val">${b.value}%</span>
    </div>`).join('');
  const chip = evidenceChipHtml(patientId, 'frontal_alpha_asymmetry', 'biomarker', 'High evidence', 27, 'high', [
    { name: 'Frontal alpha asymmetry', value: '+0.18', modality: 'qEEG', direction: 'elevated', contribution: 0.32 },
  ]);
  return `<div class="pa-qeeg-row">
    ${svgHeadMap(QEEG_REGIONS, 130)}
    <div class="pa-qeeg-bars">${bars}<div class="pa-qeeg-note">Frontal alpha asymmetry +0.18 -> improving ${chip}</div></div>
  </div>`;
}

function widgetMri(_tel, patientId) {
  const slice = `<svg width="100%" height="100%" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid meet">
    <ellipse cx="100" cy="45" rx="78" ry="38" fill="none" stroke="rgba(91,182,255,0.4)" stroke-width="0.7"/>
    <path d="M 30 45 Q 50 20 100 22 Q 150 20 170 45" fill="none" stroke="rgba(91,182,255,0.3)" stroke-width="0.5"/>
    <path d="M 30 45 Q 50 70 100 68 Q 150 70 170 45" fill="none" stroke="rgba(91,182,255,0.3)" stroke-width="0.5"/>
    <line x1="100" y1="22" x2="100" y2="68" stroke="rgba(91,182,255,0.18)"/>
    <circle cx="68" cy="38" r="5" fill="rgba(62,224,197,0.5)"/><circle cx="68" cy="38" r="2" fill="#3EE0C5"/>
    <circle cx="132" cy="38" r="5" fill="rgba(62,224,197,0.4)"/><circle cx="132" cy="38" r="2" fill="#3EE0C5"/>
    <circle cx="100" cy="55" r="4" fill="rgba(255,107,139,0.4)"/><circle cx="100" cy="55" r="1.6" fill="#FF6B8B"/>
    <line x1="0" y1="50" x2="200" y2="50" stroke="rgba(91,182,255,0.18)" stroke-dasharray="2 3"/>
    <text x="195" y="84" font-size="6" fill="rgba(255,255,255,0.4)" text-anchor="end" font-family="var(--font-mono)">3T · T1 · axial</text>
  </svg>`;
  const rows = MRI_FINDINGS.map((f, idx) => `
    <div class="pa-mri-row">
      <span class="pa-mri-region">${esc(f.region)}</span>
      <span class="pa-mri-val">${f.current}${f.unit}</span>
      <span class="pa-mri-delta" style="color:${f.delta>0?'#3EE0C5':'#FF6B8B'}">${f.delta>0?'+':''}${f.delta}%</span>
      ${idx < 2 ? evidenceChipHtml(patientId, 'hippocampal_atrophy', 'biomarker', idx === 0 ? 'MCI support' : 'MRI evidence', 18, 'moderate', [
        { name: f.region, value: `${f.current}${f.unit}`, modality: 'MRI', direction: f.delta > 0 ? 'above prior' : 'below prior', contribution: 0.26 },
      ]) : ''}
    </div>`).join('');
  return `<div class="pa-mri-slice">${slice}</div><div class="pa-mri-list">${rows}</div>`;
}

function widgetAssessments(tel) {
  const items = ASSESSMENTS_DEF.map(a => {
    let current = a.current, baseline = a.baseline;
    if (a.code === 'PHQ-9') { current = Math.round(tel.seriesPHQ.at(-1)); baseline = Math.round(tel.phqStart); }
    if (a.code === 'GAD-7') { current = Math.round(tel.seriesGAD.at(-1)); baseline = Math.round(tel.gadStart); }
    const isUp = a.dir === 'up-good';
    const max = Math.max(baseline, current);
    const curW = (current / max) * 100;
    const baseW = (baseline / max) * 100;
    const good = (isUp && current >= a.threshold) || (!isUp && current <= a.threshold);
    return `<div class="pa-assess">
      <div class="pa-assess-row">
        <span class="pa-assess-code">${a.code}</span>
        <span class="pa-assess-cur" style="color:${good?'#3EE0C5':'#F6B23C'}">${current}</span>
        <span class="pa-assess-base">was ${baseline}</span>
      </div>
      <div class="pa-assess-bar">
        <div class="pa-assess-bar-base" style="width:${baseW}%"></div>
        <div class="pa-assess-bar-cur"  style="width:${curW}%;background:${good?'#3EE0C5':'#F6B23C'}"></div>
      </div>
    </div>`;
  }).join('');
  return `<div class="pa-assess-grid">${items}</div>`;
}

function widgetMeds() {
  return `<div class="pa-meds">${MEDICATIONS.map((m, i) => `
    <div class="pa-med-row${i < MEDICATIONS.length - 1 ? ' bordered' : ''}">
      <div class="pa-med-ico">💊</div>
      <div class="pa-med-info">
        <div class="pa-med-name">${esc(m.name)} <span class="pa-med-dose">${esc(m.dose)}</span></div>
        <div class="pa-med-sched">${esc(m.schedule)} · ${esc(m.status)}</div>
      </div>
      <div class="pa-med-adh">
        <div class="pa-med-pct" style="color:${m.adherence>=90?'#3EE0C5':'#F6B23C'}">${m.adherence}%</div>
        <div class="pa-med-trend">${esc(m.trend)}</div>
      </div>
    </div>`).join('')}</div>`;
}

function widgetTherapy() {
  const tasks = HOME_TASKS.map(t => {
    const pct = (t.count / t.expected) * 100;
    const c = pct >= 85 ? '#3EE0C5' : pct >= 65 ? '#F6B23C' : '#FF6B8B';
    return `<div class="pa-th-row">
      <span class="pa-th-name">${esc(t.name)}</span>
      <div class="pa-th-bar"><div style="width:${pct}%;background:${c}"></div></div>
      <span class="pa-th-count">${t.count}/${t.expected}</span>
    </div>`;
  }).join('');
  return `<div class="pa-th-summary">
      <div class="pa-th-card"><div class="pa-overline">HOME TASKS</div><div class="pa-th-row2"><span class="pa-th-big">284</span><span class="pa-th-pct">87%</span></div><div class="pa-th-sub">of 328 expected</div></div>
      <div class="pa-th-card"><div class="pa-overline">CLINIC SESSIONS</div><div class="pa-th-row2"><span class="pa-th-big">12/14</span><span class="pa-th-pct">CBT</span></div><div class="pa-th-sub">2 missed · last Apr 24</div></div>
    </div>${tasks}`;
}

function widgetScreen() {
  const total = SCREEN_USAGE.reduce((a, b) => a + b.hours, 0);
  const list = SCREEN_USAGE.map(s => `
    <div class="pa-sc-row">
      <span class="pa-sc-dot" style="background:${s.color}"></span>
      <span class="pa-sc-name">${esc(s.app)}</span>
      <span class="pa-sc-h">${s.hours}h</span>
      <span class="pa-sc-delta" style="color:${s.hours<s.baseline?'#3EE0C5':'#F6B23C'}">${s.hours<s.baseline?'↓':'↑'}${Math.abs(s.hours-s.baseline).toFixed(1)}h</span>
    </div>`).join('');
  return `<div class="pa-screen">
    ${svgDonut(SCREEN_USAGE.map(s => ({ value: s.hours, color: s.color })), { size: 94, thickness: 11, centerLabel: total.toFixed(1) + 'h', centerSub: 'DAILY AVG' })}
    <div class="pa-screen-list">${list}</div>
  </div>`;
}

function widgetVoice(_tel, patientId) {
  const bars = Array.from({ length: 50 }).map((_, i) => {
    const h = 6 + Math.abs(Math.sin(i * 0.7) * 12 + Math.cos(i * 0.3) * 6);
    return `<rect x="${i*4}" y="${18 - h/2}" width="2" height="${h}" rx="1" fill="#8B7DFF" opacity="${(0.4 + (i / 50) * 0.5).toFixed(2)}"/>`;
  }).join('');
  const rows = VOICE_FEATURES.map(v => `
    <div class="pa-voice-row">
      <span class="pa-voice-name">${esc(v.name)}</span>
      <span class="pa-voice-cur">${v.current}</span>
      <span class="pa-voice-arrow">↗</span>
    </div>`).join('');
  return `<div class="ds-evidence-card-head">${evidenceChipHtml(patientId, 'voice_affect', 'multimodal_summary', 'Voice evidence', 14, 'moderate', [
      { name: 'Pause ratio', value: '0.18', modality: 'Voice', direction: 'down', contribution: 0.18 },
    ])}</div>
    <svg width="100%" height="36" viewBox="0 0 200 36" preserveAspectRatio="none">${bars}</svg>
    <div class="pa-voice-list">${rows}</div>`;
}

function widgetVideo(_tel, patientId) {
  const emotions = [
    { name: 'Neutral',  v: 38, c: '#9BAEC2' }, { name: 'Calm',    v: 28, c: '#3EE0C5' },
    { name: 'Engaged',  v: 18, c: '#5BB6FF' }, { name: 'Sad',     v:  9, c: '#8B7DFF' },
    { name: 'Anxious',  v:  7, c: '#F6B23C' },
  ];
  return `<div class="ds-evidence-card-head">${evidenceChipHtml(patientId, 'video_affect', 'multimodal_summary', 'Affect evidence', 11, 'moderate', [
      { name: 'Facial affect', value: 'Calm/engaged 46%', modality: 'Video', direction: 'protective', contribution: 0.16 },
    ])}</div>
    <div class="pa-video-frame">
      <svg width="100%" height="100%" viewBox="0 0 200 50">
        <ellipse cx="100" cy="25" rx="22" ry="18" fill="none" stroke="rgba(255,107,139,0.3)" stroke-width="0.6"/>
        <circle cx="92" cy="20" r="0.8" fill="#FF6B8B"/><circle cx="108" cy="20" r="0.8" fill="#FF6B8B"/>
        <circle cx="100" cy="28" r="0.8" fill="#FF6B8B"/><circle cx="94" cy="33" r="0.8" fill="#FF6B8B"/><circle cx="106" cy="33" r="0.8" fill="#FF6B8B"/>
        <text x="6" y="44" font-size="6" fill="var(--text-tertiary)" font-family="var(--font-mono)">SESSION 31 · 0:24:18</text>
        <text x="194" y="10" text-anchor="end" font-size="6" fill="#3EE0C5" font-family="var(--font-mono)">68 fps · 64 landmarks</text>
      </svg>
    </div>
    ${svgStackBar(emotions.map(e => ({ value: e.v, color: e.c })), 180, 6)}
    <div class="pa-video-legend">${emotions.slice(0,4).map(e => `<span><span class="pa-dot" style="background:${e.c}"></span>${e.name} ${e.v}%</span>`).join('')}</div>`;
}

function widgetText(_tel, patientId) {
  const w = 200, h = 68, p = { l: 4, r: 4, t: 4, b: 4 };
  const points = TEXT_SENTIMENT.map((d, i) => ({
    x: p.l + (i / (TEXT_SENTIMENT.length - 1)) * (w - p.l - p.r),
    valence: d.valence + 1, arousal: d.arousal,
  }));
  const yMax = 1.6;
  const yFor = (v) => p.t + (1 - v / yMax) * (h - p.t - p.b);
  const valencePath = points.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${yFor(q.valence).toFixed(1)}`).join(' ');
  const arousalPath = points.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${yFor(q.arousal).toFixed(1)}`).join(' ');
  return `<div class="ds-evidence-card-head">${evidenceChipHtml(patientId, 'text_sentiment', 'multimodal_summary', 'Text evidence', 19, 'moderate', [
      { name: 'Anxious language ratio', value: '-62%', modality: 'Text', direction: 'improving', contribution: 0.22 },
    ])}</div>
  <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="${valencePath} L${points.at(-1).x},${h-p.b} L${points[0].x},${h-p.b} Z" fill="#5BB6FF" fill-opacity="0.08"/>
    <path d="${valencePath}" fill="none" stroke="#5BB6FF" stroke-width="1.5"/>
    <path d="${arousalPath}" fill="none" stroke="#FF6B8B" stroke-width="1.5"/>
  </svg>
  <div class="pa-text-note">Valence trending <strong style="color:#3EE0C5">+0.51</strong> · anxious-language ratio <strong style="color:#3EE0C5">−62%</strong></div>`;
}

function widgetLocation() {
  return `<div class="pa-loc">
    ${svgDonut([
      { value: LOCATIONS.homePct,      color: '#3EE0C5' },
      { value: LOCATIONS.workPct,      color: '#5BB6FF' },
      { value: LOCATIONS.communityPct, color: '#8B7DFF' },
      { value: LOCATIONS.otherPct,     color: '#9BAEC2' },
    ], { size: 70, thickness: 9, centerLabel: LOCATIONS.homePct + '%', centerSub: 'HOME' })}
    <div class="pa-loc-note">${LOCATIONS.uniqueLocations30d} unique locations · ${LOCATIONS.travelKm30d} km · 30d</div>
  </div>`;
}

function widgetCorrelation() {
  const cell = 16, off = 50;
  const labels = CORRELATIONS_LABELS;
  const colorFor = (v) => v > 0 ? `rgba(62,224,197,${Math.abs(v).toFixed(2)})` : `rgba(255,107,139,${Math.abs(v).toFixed(2)})`;
  const w = labels.length * cell + off;
  const h = labels.length * cell + off;
  let s = `<svg width="${w}" height="${h}">`;
  labels.forEach((l, i) => {
    s += `<text x="48" y="${off + i * cell + cell * 0.7}" text-anchor="end" font-size="8" fill="var(--text-tertiary)">${l}</text>`;
    s += `<text x="${off + i * cell + cell/2}" y="42" text-anchor="middle" font-size="8" fill="var(--text-tertiary)" transform="rotate(-30 ${off + i*cell + cell/2} 42)">${l}</text>`;
  });
  CORRELATIONS_MATRIX.forEach((row, i) => row.forEach((v, j) => {
    s += `<rect x="${off + j*cell}" y="${off + i*cell}" width="${cell-1}" height="${cell-1}" rx="1.5" fill="${colorFor(v)}"/>`;
  }));
  s += `</svg>`;
  return s;
}

function widgetPredictions(_tel, patientId) {
  return `<div class="pa-pred">${PREDICTIONS.map((p, i) => {
    const top = i === 3;
    const targetName = i === 1 ? 'protocol_ranking' : 'depression_risk';
    return `<div class="pa-pred-row${top ? ' top' : ''}">
      ${top ? '<span class="pa-pred-spark">✦</span>' : ''}
      <span class="pa-pred-mod">${esc(p.modality)}</span>
      <span class="pa-overline" style="font-size:8px">REM</span>
      <div class="pa-pred-bar"><div style="width:${(p.remission*100).toFixed(0)}%"></div></div>
      <span class="pa-pred-pct">${(p.remission*100).toFixed(0)}%</span>
      <span class="pa-pred-conf">±${((1-p.confidence)*100).toFixed(0)}% · ${p.weeks}w</span>
      ${evidenceChipHtml(patientId, targetName, i === 1 ? 'recommendation' : 'prediction', top ? '3 reviews + 8 cohorts' : 'High evidence', top ? 31 : 27, top ? 'high' : 'moderate', [
        { name: p.modality, value: `${(p.remission*100).toFixed(0)}% remission`, modality: 'DeepTwin', direction: 'supports', contribution: p.confidence },
      ])}
    </div>`;
  }).join('')}</div>`;
}

function widgetEhr(context = null) {
  const live = !!context?.live;
  const latestReportTitle = context?.latestReport?.title || context?.latestReport?.report_title || null;
  return `<div class="pa-ehr">
    <div><span>EMR preview</span><span>${live ? 'Epic sample feed + live evidence context' : 'Epic sample feed'}</span></div>
    <div><span>Last sample refresh</span><span class="mono">14m ago</span></div>
    <div><span>Saved citations</span><span>${context?.savedCitationCount ?? 0}</span></div>
    <div><span>Evidence highlights</span><span>${context?.highlightCount ?? 0}</span></div>
    <div><span>Reports available</span><span>${context?.reportCount ?? 0}</span></div>
    <div><span>Latest report</span><span>${latestReportTitle ? esc(latestReportTitle) : 'No saved report yet'}</span></div>
    <div><span>Documents</span><span>132</span></div>
    <div><span>Lab panels</span><span>14</span></div>
    <div><span>Allergies</span><span style="color:#F6B23C">Penicillin</span></div>
    <div><span>Insurance</span><span>Aetna PPO</span></div>
  </div>`;
}

const WIDGETS = [
  { id: 'biometrics',  title: 'Biometrics & Wearables',  icon: '❤',  source: 'Apple Watch · Oura · Whoop', col: 'span 4', h: 220, body: widgetBio,         color: '#3EE0C5' },
  { id: 'predictions', title: 'Predictions',             icon: '✦',  source: 'DeepTwin engine',           col: 'span 4', h: 220, body: widgetPredictions, ai: true, color: '#3EE0C5' },
  { id: 'qeeg',        title: 'qEEG',                    icon: '〰', source: '32-channel · 256Hz',        col: 'span 4', h: 220, body: widgetQeeg,  ai: true, color: '#8B7DFF' },
  { id: 'assessments', title: 'Assessments',             icon: '📋', source: '8 active scales',           col: 'span 3', h: 200, body: widgetAssessments,    color: '#FF6B8B' },
  { id: 'mri',         title: 'MRI / Imaging',           icon: '🧠', source: '3T structural · fMRI',      col: 'span 3', h: 200, body: widgetMri,  ai: true, color: '#5BB6FF' },
  { id: 'therapy',     title: 'Therapy adherence',       icon: '🏠', source: 'Home + clinic',             col: 'span 3', h: 200, body: () => widgetTherapy(), color: '#3EE0C5' },
  { id: 'medications', title: 'Medications',             icon: '💊', source: '4 active · 1 PRN',          col: 'span 3', h: 200, body: () => widgetMeds(),    color: '#8B7DFF' },
  { id: 'screen',      title: 'Screen & digital phenotype', icon: '📱', source: 'Passive sensing',         col: 'span 3', h: 180, body: () => widgetScreen(),  color: '#F6B23C' },
  { id: 'correlation', title: 'Correlation matrix',      icon: '⫶',  source: 'All signals',               col: 'span 3', h: 180, body: () => widgetCorrelation(), ai: true, color: '#3EE0C5' },
  { id: 'voice',       title: 'Voice & speech',          icon: '🎤', source: 'Daily 90s sample',           col: 'span 2', h: 180, body: widgetVoice,  ai: true, color: '#8B7DFF' },
  { id: 'video',       title: 'Video / facial affect',   icon: '🎥', source: 'Session capture',           col: 'span 2', h: 180, body: widgetVideo, ai: true, color: '#FF6B8B' },
  { id: 'text',        title: 'Text sentiment',          icon: '💬', source: 'Journals + chat',           col: 'span 2', h: 180, body: widgetText,  ai: true, color: '#5BB6FF' },
  { id: 'location',    title: 'Location & mobility',     icon: '📍', source: 'GPS · activity',            col: 'span 3', h: 140, body: () => widgetLocation(), color: '#B6E66A' },
  { id: 'ehr',         title: 'EMR & medical records',   icon: '📄', source: 'Preview: Epic sample feed', col: 'span 3', h: 140, body: (context) => widgetEhr(context),  color: '#9BAEC2' },
];

function renderWidget(w, body) {
  return `<div class="pa-widget" style="grid-column:${w.col};min-height:${w.h}px">
    <div class="pa-widget-head">
      <div class="pa-widget-ico" style="color:${w.color};border-color:color-mix(in oklab, ${w.color} 24%, transparent);background:color-mix(in oklab, ${w.color} 12%, transparent)">${w.icon}</div>
      <div class="pa-widget-title-wrap">
        <div class="pa-widget-title">${esc(w.title)}${w.ai ? ' <span class="pa-ai-chip">AI</span>' : ''}</div>
        <div class="pa-overline">${esc(w.source)}</div>
      </div>
      <button class="pa-widget-btn" data-pa-action="report" data-pa-widget="${w.id}" title="Generate report">📄 Report</button>
    </div>
    <div class="pa-widget-body">${body}</div>
  </div>`;
}

// ── Patient header strip ────────────────────────────────────────────────────
function renderHeader(p, tel, activeTab = 'analytics', context = null) {
  const phqDelta = Math.round(tel.seriesPHQ[tel.seriesPHQ.length - 1] - tel.phqStart);
  return `<div class="pa-header">
    <div class="pa-header-tabs">
      ${['Overview','Analytics','Evidence','Sessions','Notes','Documents','Protocols','Devices'].map((l) =>
        `<button class="pa-tab${l.toLowerCase() === activeTab ? ' is-active' : ''}" data-pa-tab="${l.toLowerCase()}">${l}</button>`).join('')}
    </div>
    <div class="pa-header-id">
      <div class="pa-header-avatar" style="background:${avatarColor(p)}">${initials(p)}</div>
      <div class="pa-header-name">
        <div class="pa-header-name-row">
          <h1>${esc((p.first_name||'') + ' ' + (p.last_name||''))}</h1>
          <span class="pa-chip pa-chip-sky">DEMO PATIENT</span>
          ${context?.live ? '<span class="pa-chip pa-chip-mint">LIVE EVIDENCE</span>' : ''}
          ${tel.seriesPHQ[tel.seriesPHQ.length - 1] <= 10 ? '<span class="pa-chip pa-chip-mint">RESPONDER</span>' : ''}
          <span class="pa-chip pa-chip-amber">2 ALERTS</span>
        </div>
        <div class="pa-header-meta">
          <span><span class="muted">MRN</span> <span class="mono">${esc('MRN-' + (_hash(p.id||'') % 99999))}</span></span>
          <span class="muted">•</span>
          <span>${esc(p.primary_condition || '—')}</span>
          <span class="muted">•</span>
          <span><span class="muted">Protocol</span> <span style="color:#3EE0C5">${esc(p.primary_modality || '—')}</span></span>
        </div>
      </div>
      <div class="pa-header-actions">
        <button class="btn btn-sm" data-pa-action="reports">Reports</button>
        <button class="btn btn-primary btn-sm" data-pa-action="open-deeptwin">🧠 Open DeepTwin →</button>
      </div>
    </div>
    <div class="pa-strip">
      ${stripStat('Course week', '13/14', '↑ 92% complete', '#3EE0C5')}
      ${stripStat('Sessions', `${tel.sessionsCompleted}/${tel.sessionsTotal}`, '2 missed', '#3EE0C5')}
      ${stripStat('PHQ-9 Delta', `${phqDelta}`, `${tel.phqStart} -> ${Math.round(tel.seriesPHQ[tel.seriesPHQ.length - 1])}`, '#3EE0C5')}
      ${stripStat('Adherence', tel.adherence + '%', '30-day', '#3EE0C5')}
      ${stripStat('Evidence highlights', String(context?.highlightCount ?? 0), context?.live ? 'Live patient evidence' : 'Unavailable', '#5BB6FF')}
      ${stripStat('Saved citations', String(context?.savedCitationCount ?? 0), context?.live ? 'Report-ready evidence' : 'Unavailable', '#8B7DFF')}
      ${stripStat('Reports', String(context?.reportCount ?? 0), context?.latestReport ? (context.latestReport.title || context.latestReport.report_title || 'Latest report saved') : 'No saved reports', '#B6E66A')}
      ${stripStat('Risk index', String(tel.riskScore), '↓ low', '#F6B23C')}
      ${stripStat('Last session', 'Yesterday', '09:14 · 30 min', 'var(--text-primary)')}
      ${stripStat('Next session', 'Tomorrow', '09:00 · ' + esc(p.primary_modality || 'tDCS'), '#5BB6FF')}
    </div>
  </div>`;
}
function stripStat(label, value, sub, color) {
  return `<div class="pa-strip-stat">
    <div class="pa-overline"><span class="pa-strip-dot" style="background:${color}"></span>${esc(label)}</div>
    <div class="pa-strip-val mono">${esc(value)}</div>
    <div class="pa-strip-sub">${esc(sub)}</div>
  </div>`;
}

function renderTimelineHero(tel) {
  return `<div class="pa-timeline">
    <div class="pa-timeline-head">
      <div>
        <div class="pa-overline">PATIENT JOURNEY · 14 WEEKS</div>
        <div class="pa-timeline-title">
          <h2>Layered timeline — every signal in one view</h2>
          <span class="pa-timeline-sub">Jan 14 → today · 14 weeks · ${tel.sessionsCompleted} sessions logged</span>
        </div>
      </div>
      <div class="pa-timeline-actions">
        ${['7d','30d','90d','All'].map((l, i) => `<button class="pa-pill${i===3?' is-active':''}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="pa-timeline-svg">${buildTimeline(tel)}</div>
    <div class="pa-timeline-legend">
      ${['#FF6B8B PHQ-9','#F6B23C GAD-7','#3EE0C5 HRV','#5BB6FF Sleep','#8B7DFF Mood'].map(s => {
        const [c, l] = s.split(' ');
        return `<span><span class="pa-legend-dash" style="background:${c}"></span>${l}</span>`;
      }).join('')}
      <span class="pa-timeline-ai">✦ AI-detected: 3 inflection points · 2 strong correlations</span>
    </div>
  </div>`;
}

function renderEvidenceContextBanner(context) {
  if (!context?.live) {
    return `<div style="margin-bottom:14px;padding:12px 14px;border:1px solid rgba(245,158,11,0.28);border-radius:12px;background:rgba(245,158,11,0.08);font-size:12px;line-height:1.5;color:var(--text-secondary)">
      Demo telemetry preview only. This page does not currently have verified live evidence or saved report context for this patient.
    </div>`;
  }
  return `<div style="margin-bottom:14px;padding:12px 14px;border:1px solid rgba(62,224,197,0.22);border-radius:12px;background:rgba(62,224,197,0.08);font-size:12px;line-height:1.5;color:var(--text-secondary)">
    <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between">
      <div>
        <strong style="color:var(--text-primary)">Mixed-source patient analytics.</strong>
        Telemetry widgets remain preview/sample data, but evidence highlights, saved citations, and report availability below are loaded from the live patient evidence/report store.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px 14px">
        <span><strong style="color:var(--text-primary)">${context.highlightCount}</strong> evidence highlights</span>
        <span><strong style="color:var(--text-primary)">${context.savedCitationCount}</strong> saved citations</span>
        <span><strong style="color:var(--text-primary)">${context.reportCount}</strong> saved reports</span>
        <span><strong style="color:var(--text-primary)">${context.reportCitationCount}</strong> report citations</span>
      </div>
    </div>
    ${context.phenotypeTags.length ? `<div style="margin-top:8px;color:var(--text-tertiary)">Phenotype tags: ${esc(context.phenotypeTags.slice(0, 6).join(' · '))}</div>` : ''}
  </div>`;
}

// ── Cohort tab body (shown when no specific patient selected) ───────────────
export async function pgPatientAnalyticsCohort(setTopbar) {
  const el = document.getElementById('content');
  setTopbar('Patients', '');

  const roster = DEMO_PATIENT_ROSTER;
  const tabs = `<div class="d2p7-tab-bar">
    <button class="ch-tab" onclick="window._patientHubTab='patients';window._nav('patients-hub')">Patients</button>
    <button class="ch-tab ch-tab--active" style="--tab-color:var(--teal)">Analytics</button>
    <button class="ch-tab" onclick="window._patientHubTab='alerts';window._nav('patients-hub')">Alerts</button>
    <button class="ch-tab" onclick="window._patientHubTab='reports';window._nav('patients-hub')">Reports</button>
  </div>`;

  const cohortKpis = `
    <div class="ch-kpi-strip">
      <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">−6.2</div><div class="ch-kpi-label">Mean PHQ-9 Δ</div></div>
      <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">64%</div><div class="ch-kpi-label">Response rate</div></div>
      <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">78%</div><div class="ch-kpi-label">Avg adherence</div></div>
      <div class="ch-kpi-card" style="--kpi-color:var(--violet)"><div class="ch-kpi-val">${roster.length}</div><div class="ch-kpi-label">Active patients</div></div>
    </div>`;

  const rows = roster.map(p => {
    const tel = buildPatientTelemetry(p);
    const phqEnd = Math.round(tel.seriesPHQ.at(-1));
    const phqStart = Math.round(tel.phqStart);
    const responder = phqEnd <= 10 || (phqStart - phqEnd) >= 5;
    return `<div class="pa-cohort-row" data-pa-patient="${esc(p.id)}" role="button" tabindex="0">
      <div class="pa-cohort-id">
        <div class="pa-cohort-av" style="background:${avatarColor(p)}">${initials(p)}</div>
        <div>
          <div class="pa-cohort-name">${esc(p.first_name + ' ' + p.last_name)}</div>
          <div class="pa-cohort-cond">${esc(p.primary_condition || '')} · ${esc(p.primary_modality || '')}</div>
        </div>
      </div>
      <div class="pa-cohort-spark">${svgSparkline(tel.seriesPHQ, { width: 140, height: 28, stroke: '#FF6B8B', strokeWidth: 1.4 })}</div>
      <div class="pa-cohort-phq mono">${phqStart} → ${phqEnd}</div>
      <div class="pa-cohort-adh mono" style="color:${tel.adherence>=85?'#3EE0C5':'#F6B23C'}">${tel.adherence}%</div>
      <div class="pa-cohort-status">${responder ? '<span class="chip green">Responder</span>' : '<span class="chip">Tracking</span>'}</div>
      <div class="pa-cohort-cta">
        <button class="btn btn-sm" data-pa-cohort-cta="${esc(p.id)}">Open analytics →</button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="ch-shell">
    ${tabs}
    <div class="ch-body">
      ${cohortKpis}
      <div class="ch-card">
        <div class="ch-card-hd"><span class="ch-card-title">Patient analytics — click any row for the full data terminal</span></div>
        <div class="pa-cohort">
          <div class="pa-cohort-head">
            <div>Patient</div><div>14-week PHQ-9 trajectory</div><div>Δ baseline</div><div>Adherence</div><div>Status</div><div></div>
          </div>
          ${rows}
        </div>
      </div>
    </div>
  </div>`;

  // wire row clicks
  el.querySelectorAll('.pa-cohort-row').forEach(row => {
    const pid = row.getAttribute('data-pa-patient');
    const open = () => { window._paPatientId = pid; window._nav('patient-analytics'); };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  el.querySelectorAll('[data-pa-cohort-cta]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window._paPatientId = btn.getAttribute('data-pa-cohort-cta');
      window._nav('patient-analytics');
    });
  });
}

// ── Per-patient terminal ────────────────────────────────────────────────────
export async function pgPatientAnalyticsDetail(setTopbar, patientId) {
  const el = document.getElementById('content');
  const id = patientId || window._paPatientId || (DEMO_PATIENT_ROSTER[0] && DEMO_PATIENT_ROSTER[0].id);
  const p = demoPtFromRoster(id) || DEMO_PATIENT_ROSTER[0];
  const tel = buildPatientTelemetry(p);
  const evidenceContext = await loadAnalyticsEvidenceContext(id).catch(() => emptyAnalyticsEvidenceContext(id));

  setTopbar(`${p.first_name} ${p.last_name}`,
    `<button class="btn btn-sm" onclick="window._patientHubTab='analytics';window._nav('patients-hub')">← All patients</button>` +
    `<button class="btn btn-primary btn-sm" onclick="window._selectedPatientId='${esc(id)}';window._profilePatientId='${esc(id)}';try{sessionStorage.setItem('ds_pat_selected_id','${esc(id)}')}catch(e){};window._nav('deeptwin')" style="margin-left:6px">🧠 Open DeepTwin →</button>`
  );

  const activeTab = window._paActiveTab || 'analytics';
  const header = renderHeader(p, tel, activeTab, evidenceContext);
  const timeline = renderTimelineHero(tel);
  const grid = WIDGETS.map(w => renderWidget(w, w.id === 'ehr' ? w.body(evidenceContext) : w.body(tel, id))).join('');
  const evidenceTab = PatientEvidenceTab(evidenceContext.overview || { patientId: id });

  el.innerHTML = `<div class="pa-shell">
    ${header}
    <div class="pa-body" style="${activeTab === 'analytics' ? '' : 'display:none'}">
      ${renderEvidenceContextBanner(evidenceContext)}
      ${timeline}
      <div class="pa-grid-head">
        <div class="pa-overline">DOMAIN GRID</div>
        <div class="pa-grid-rule"></div>
        <span class="pa-grid-count">${WIDGETS.length} panels · click any to drill in</span>
      </div>
      <div class="pa-grid">${grid}</div>
    </div>
    <div class="pa-body" style="${activeTab === 'evidence' ? '' : 'display:none'}">
      ${evidenceTab}
    </div>
    <footer class="pa-foot">
      <span class="mono">DeepSynaps Studio · v3.2.1</span>
      <span>·</span>
      <span>HIPAA · GDPR · 21 CFR Part 11</span>
      <span style="flex:1"></span>
      <span>Last sample refresh 4m ago</span>
      <span>·</span>
      <span class="pa-foot-live"><span class="pa-foot-dot"></span> ${evidenceContext.live ? 'Telemetry preview · evidence context live' : 'Demo preview'}</span>
    </footer>
  </div>`;

  initEvidenceDrawer({ patientId: id, onOpenFullTab: () => {
    window._paActiveTab = 'evidence';
    window._nav('patient-analytics');
  }});
  wireEvidenceChips(el, {
    onOpen: (query) => openEvidenceDrawer(query),
  });

  // Actions
  el.querySelectorAll('[data-pa-action="open-deeptwin"]').forEach(b =>
    b.addEventListener('click', () => {
      window._selectedPatientId = id;
      window._profilePatientId = id;
      try { sessionStorage.setItem('ds_pat_selected_id', id); } catch {}
      window._nav('deeptwin');
    }));
  el.querySelectorAll('[data-pa-action="reports"]').forEach(b =>
    b.addEventListener('click', () => { window._patientHubTab = 'reports'; window._nav('patients-hub'); }));
  el.querySelectorAll('[data-pa-action="report"]').forEach(b =>
    b.addEventListener('click', () => {
      window._patientHubTab = 'reports';
      window._dsToast?.({ title: 'Reports Hub', body: 'Open the reports hub to generate or review patient reports.', severity: 'info' });
      window._nav('patients-hub');
    }));
  el.querySelectorAll('[data-pa-tab]').forEach(t => t.addEventListener('click', () => {
    const which = t.getAttribute('data-pa-tab');
    if (which === 'analytics' || which === 'evidence') {
      window._paActiveTab = which;
      window._nav('patient-analytics');
      return;
    }
    window._profilePatientId = id;
    window._nav('patient-profile');
  }));
}

export const DS_EVIDENCE_TEST_EXPORTS = {
  evidenceChipHtml,
  renderHeader,
  widgetPredictions,
  widgetQeeg,
  widgetMri,
  widgetVoice,
  widgetVideo,
  widgetText,
};
