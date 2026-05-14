// ─────────────────────────────────────────────────────────────────────────────
// pages-multimodal-fusion.js — Multimodal Fusion Dashboard (Clinical Portal)
//
// Displays a unified, fused view of 7 patient data modalities:
//   Video/Movement, Voice, Text, Wearable, Biomarkers, Assessments, Digital Phenotyping
//
// Sections:
//   1. Safety banner          — clinical decision-support disclaimer
//   2. Fusion score gauge     — overall fused score (0-100) with conic-gradient
//   3. Trajectory indicator   — trend arrow with confidence
//   4. Modality cards (7)     — score, confidence bar, evidence badge, provenance
//   5. Risk flags panel       — expandable severity-graded flags
//   6. Correlation matrix     — 7×7 heatmap of cross-modal correlations
//   7. Timeline chart         — SVG line chart of modality scores over time
//   8. Evidence summary       — grade distribution + footer disclaimer
//
// Data source: GET /api/v1/multimodal-fusion/patient/{patientId}/fuse
// Route:       /patients/:patientId/multimodal-fusion
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';
import { cardWrap, spinner, emptyState, evidenceBadge } from './helpers.js';

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function esc(v) { return v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtNum(n, d = 1) { return n == null ? '\u2014' : Number(n).toFixed(d); }
function fmtInt(n) { return n == null ? '\u2014' : Math.round(n).toLocaleString(); }
function fmtPct(n) { return n == null ? '\u2014' : `${Math.round(Number(n) * 100)}%`; }
function fmtDate(iso) {
  if (!iso) return '\u2014';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return iso; }
}

/** Score → color: green >70, amber 50-70, red <50 */
function scoreColor(s) {
  const n = Number(s);
  if (Number.isNaN(n)) return '#94a3b8';
  if (n >= 70) return '#22c55e';
  if (n >= 50) return '#f59e0b';
  return '#ef4444';
}

function scoreBg(s) {
  const n = Number(s);
  if (Number.isNaN(n)) return 'rgba(148,163,184,0.08)';
  if (n >= 70) return 'rgba(34,197,94,0.08)';
  if (n >= 50) return 'rgba(245,158,11,0.08)';
  return 'rgba(239,68,68,0.08)';
}

function severityColor(sev) {
  const map = { high: '#dc2626', moderate: '#f59e0b', low: '#3b82f6', info: '#64748b' };
  return map[sev] || '#64748b';
}
function severityBg(sev) {
  const map = { high: 'rgba(220,38,38,0.08)', moderate: 'rgba(245,158,11,0.08)', low: 'rgba(59,130,246,0.08)', info: 'rgba(100,116,139,0.08)' };
  return map[sev] || 'rgba(100,116,139,0.08)';
}

/** Evidence grade → badge letter */
function gradeLetter(g) {
  if (!g) return 'D';
  const s = String(g).toUpperCase();
  if (s.startsWith('EV-')) return s.replace('EV-', '');
  if (/^[ABCD]$/.test(s)) return s;
  return 'D';
}

/** Provenance label → styled pill */
function provenancePill(p) {
  const map = {
    measured: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', label: 'Measured' },
    inferred: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'Inferred' },
    proxy:    { bg: 'rgba(168,85,247,0.1)', color: '#a855f7', label: 'Proxy' },
  };
  const s = map[String(p).toLowerCase()] || map.proxy;
  return `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${s.bg};color:${s.color}">${esc(s.label)}</span>`;
}

/** Trajectory arrow */
function trajectoryArrow(dir) {
  const map = { improving: '↑', declining: '↓', stable: '→', fluctuating: '~' };
  return map[dir] || '→';
}

/** Confidence bar SVG */
function confidenceBar(pct, opts = {}) {
  const { w = 120, h = 6, color = null } = opts;
  const fill = color || scoreColor(pct * 100);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="vertical-align:middle">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" fill="rgba(255,255,255,0.08)"/>
    <rect x="0" y="0" width="${Math.max(2, Math.round(w * pct))}" height="${h}" rx="${h / 2}" fill="${fill}"/>
  </svg>`;
}

/* ── Module state ──────────────────────────────────────────────────────────── */

let _patientId = null;
let _fusionData = null;
let _loading = false;
let _error = null;
let _expandedFlags = new Set();

/* ── Demo / fallback data ──────────────────────────────────────────────────── */

const MODALITY_CONFIG = [
  {
    id: 'video_movement',
    name: 'Video / Movement',
    icon: '🎥',
    features: [
      { key: 'gait_speed', label: 'Gait Speed', unit: 'm/s' },
      { key: 'tremor',     label: 'Tremor',     unit: 'score' },
      { key: 'posture',    label: 'Posture',    unit: 'score' },
    ],
  },
  {
    id: 'voice',
    name: 'Voice',
    icon: '🎙',
    features: [
      { key: 'cpp',           label: 'CPP',           unit: '' },
      { key: 'speech_rate',   label: 'Speech Rate',   unit: 'wpm' },
      { key: 'pause_duration', label: 'Pause Duration', unit: 's' },
    ],
  },
  {
    id: 'text',
    name: 'Text',
    icon: '📝',
    features: [
      { key: 'clinical_entities', label: 'Clinical Entities', unit: 'count' },
      { key: 'sentiment',         label: 'Sentiment',         unit: 'score' },
    ],
  },
  {
    id: 'wearable',
    name: 'Wearable',
    icon: '⌚',
    features: [
      { key: 'steps',       label: 'Steps',       unit: 'steps' },
      { key: 'sleep',       label: 'Sleep',       unit: 'hrs' },
      { key: 'screen_time', label: 'Screen Time', unit: 'hrs' },
    ],
  },
  {
    id: 'biomarkers',
    name: 'Biomarkers',
    icon: '🔬',
    features: [
      { key: 'ferritin',   label: 'Ferritin',   unit: 'ng/mL' },
      { key: 'vitamin_d',  label: 'Vitamin D',  unit: 'ng/mL' },
      { key: 'tsh',        label: 'TSH',        unit: 'mIU/L' },
    ],
  },
  {
    id: 'assessments',
    name: 'Assessments',
    icon: '📋',
    features: [
      { key: 'phq9', label: 'PHQ-9', unit: '/27' },
      { key: 'gad7', label: 'GAD-7', unit: '/21' },
      { key: 'moca', label: 'MoCA',  unit: '/30' },
    ],
  },
  {
    id: 'digital_phenotyping',
    name: 'Digital Phenotyping',
    icon: '📱',
    features: [
      { key: 'circadian', label: 'Circadian', unit: 'score' },
      { key: 'mobility',  label: 'Mobility',  unit: 'score' },
      { key: 'social',    label: 'Social',    unit: 'score' },
    ],
  },
];

function _demoFusionData(patientId) {
  const modalities = {};
  const config = [
    { id: 'video_movement', score: 72, confidence: 0.85, grade: 'B', provenance: 'measured', features: { gait_speed: 1.12, tremor: 0.3, posture: 0.78 } },
    { id: 'voice', score: 58, confidence: 0.72, grade: 'C', provenance: 'inferred', features: { cpp: 0.65, speech_rate: 142, pause_duration: 2.3 } },
    { id: 'text', score: 81, confidence: 0.90, grade: 'B', provenance: 'measured', features: { clinical_entities: 12, sentiment: 0.72 } },
    { id: 'wearable', score: 65, confidence: 0.88, grade: 'A', provenance: 'measured', features: { steps: 8432, sleep: 7.2, screen_time: 4.5 } },
    { id: 'biomarkers', score: 45, confidence: 0.60, grade: 'C', provenance: 'proxy', features: { ferritin: 180, vitamin_d: 22, tsh: 3.8 } },
    { id: 'assessments', score: 62, confidence: 0.93, grade: 'A', provenance: 'measured', features: { phq9: 9, gad7: 7, moca: 24 } },
    { id: 'digital_phenotyping', score: 55, confidence: 0.68, grade: 'C', provenance: 'inferred', features: { circadian: 0.58, mobility: 0.61, social: 0.52 } },
  ];
  config.forEach(c => { modalities[c.id] = c; });

  const riskFlags = [
    { id: 'rf1', severity: 'moderate', title: 'Elevated PHQ-9 with reduced sleep', description: 'PHQ-9 score of 9 suggests mild depression. Correlated with reduced sleep duration (7.2h, below patient baseline). Recommend follow-up within 1-2 weeks.', evidence: 'PHQ-9 = 9/27 (moderate range) · Sleep avg = 7.2h (↓12% vs baseline)' },
    { id: 'rf2', severity: 'low', title: 'Low vitamin D levels', description: 'Vitamin D level at 22 ng/mL is below the recommended 30 ng/mL threshold. Consider supplementation and recheck in 8-12 weeks.', evidence: 'Vitamin D = 22 ng/mL (reference: 30-50 ng/mL)' },
    { id: 'rf3', severity: 'moderate', title: 'Biomarker-fusion discordance', description: 'Biomarker score (45) is notably lower than other modalities. Ferritin is elevated while Vitamin D is low — pattern consistent with inflammatory process. Correlate with clinical assessment.', evidence: 'Ferritin = 180 ng/mL (↑) · Vitamin D = 22 ng/mL (↓)' },
    { id: 'rf4', severity: 'low', title: 'Reduced social signal in digital phenotyping', description: 'Digital phenotyping social score of 0.52 is below median. May indicate reduced social engagement. Consider follow-up with social functioning questions.', evidence: 'Social score = 0.52 (45th percentile vs reference)' },
  ];

  // 7×7 correlation matrix (upper triangle)
  const corrOrder = ['video_movement', 'voice', 'text', 'wearable', 'biomarkers', 'assessments', 'digital_phenotyping'];
  const correlations = [];
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const val = -0.6 + Math.random() * 1.2; // -0.6 to +0.6
      correlations.push({ m1: corrOrder[i], m2: corrOrder[j], value: +val.toFixed(2) });
    }
  }

  // Timeline (30 days)
  const timeline = [];
  const now = Date.now();
  for (let d = 29; d >= 0; d--) {
    const date = new Date(now - d * 86400000).toISOString().slice(0, 10);
    const point = { date };
    config.forEach(c => {
      const jitter = (Math.random() - 0.5) * 10;
      point[c.id] = Math.max(0, Math.min(100, Math.round(c.score + jitter)));
    });
    timeline.push(point);
  }

  return {
    _demo: true,
    patient_id: patientId || 'demo-patient',
    overall_fusion_score: 62,
    overall_confidence: 0.78,
    trajectory: { direction: 'stable', confidence: 0.82 },
    modalities,
    risk_flags: riskFlags,
    correlations,
    timeline,
    evidence_summary: {
      a_count: 2, b_count: 2, c_count: 3, d_count: 0,
      best_grade: 'A', worst_grade: 'C',
      note: 'Most modalities have moderate-to-good evidence quality. Biomarkers and Digital Phenotyping have lower evidence grades due to proxy/inferred data sources.',
    },
  };
}

/* ── API wrapper (shim until backend endpoint is live) ─────────────────────── */

async function _fetchFusionData(patientId) {
  try {
    if (typeof api.getMultimodalFusion === 'function') {
      return await api.getMultimodalFusion(patientId);
    }
    // Direct fetch fallback
    const resp = await fetch(`${api.API_BASE || ''}/api/v1/multimodal-fusion/patient/${encodeURIComponent(patientId)}/fuse`, {
      headers: api.authHeaders ? api.authHeaders() : {},
    });
    if (resp.ok) return await resp.json();
  } catch { /* API not available */ }
  return null;
}

/* ── Sub-renderers ─────────────────────────────────────────────────────────── */

/** Section 1: Safety banner */
function _renderSafetyBanner() {
  return `<div style="margin-bottom:20px;padding:12px 16px;border-radius:8px;border-left:4px solid #f59e0b;background:rgba(245,158,11,0.08);color:#f59e0b;font-size:13px;line-height:1.5;">
    <strong style="font-weight:700">⚠ Decision-Support Only</strong> — This dashboard is a computational summary across data modalities. It does <em>not</em> replace clinical judgment. All outputs require clinician review before any clinical action.
  </div>`;
}

/** Section 2: Fusion score gauge */
function _renderFusionGauge(data) {
  const score = data?.overall_fusion_score ?? 0;
  const conf = data?.overall_confidence ?? 0;
  const color = scoreColor(score);
  const bg = scoreBg(score);
  const pct = score;
  const dashArray = 2 * Math.PI * 80;
  const dashOffset = dashArray * (1 - pct / 100);

  return `<div style="display:flex;align-items:center;gap:32px;margin-bottom:24px;flex-wrap:wrap;">
    <!-- Gauge -->
    <div style="position:relative;width:200px;height:200px;flex-shrink:0;">
      <svg viewBox="0 0 200 200" width="200" height="200">
        <!-- Background ring -->
        <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="12"/>
        <!-- Confidence ring (outer) -->
        <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="3"
          stroke-dasharray="${2 * Math.PI * 90 * conf} ${2 * Math.PI * 90 * (1 - conf)}"
          stroke-linecap="round" transform="rotate(-90 100 100)" stroke="#3b82f6" opacity="0.4"/>
        <!-- Score arc -->
        <circle cx="100" cy="100" r="80" fill="none" stroke="${color}" stroke-width="12"
          stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"
          stroke-linecap="round" transform="rotate(-90 100 100)" opacity="0.9"/>
      </svg>
      <!-- Center text -->
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
        <div style="font-size:36px;font-weight:800;color:${color};font-family:var(--font-display);line-height:1;">${fmtInt(score)}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Fusion Score</div>
      </div>
    </div>
    <!-- Right side stats -->
    <div style="flex:1;min-width:200px;">
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Overall Confidence</div>
        <div style="display:flex;align-items:center;gap:10px;">
          ${confidenceBar(conf, { w: 200, h: 8, color: '#3b82f6' })}
          <span style="font-size:13px;font-weight:600;color:var(--text-primary);font-family:var(--font-mono);">${fmtPct(conf)}</span>
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Modality Coverage</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${MODALITY_CONFIG.map(m => {
            const md = data?.modalities?.[m.id];
            const hasData = md && md.score != null;
            return `<span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:${hasData ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.08)'};color:${hasData ? '#22c55e' : '#64748b'};">${m.icon} ${esc(m.name)}</span>`;
          }).join('')}
        </div>
      </div>
      ${data?._demo ? `<div style="font-size:11px;color:var(--text-tertiary);font-style:italic;">Showing synthetic data — API endpoint not yet available.</div>` : ''}
    </div>
  </div>`;
}

/** Section 3: Trajectory indicator */
function _renderTrajectory(data) {
  const traj = data?.trajectory || {};
  const dir = traj.direction || 'stable';
  const conf = traj.confidence ?? 0;
  const arrow = trajectoryArrow(dir);
  const color = dir === 'improving' ? '#22c55e' : dir === 'declining' ? '#ef4444' : dir === 'fluctuating' ? '#f59e0b' : '#64748b';
  const label = dir.charAt(0).toUpperCase() + dir.slice(1);

  return `<div style="display:inline-flex;align-items:center;gap:12px;padding:10px 18px;border-radius:10px;background:${scoreBg(dir === 'improving' ? 85 : dir === 'declining' ? 35 : 60)};border:1px solid ${color}33;margin-bottom:24px;">
    <span style="font-size:24px;color:${color};font-weight:700;">${arrow}</span>
    <div>
      <div style="font-size:14px;font-weight:600;color:${color};">${esc(label)}</div>
      <div style="font-size:11px;color:var(--text-secondary);">Confidence ${fmtPct(conf)}</div>
    </div>
  </div>`;
}

/** Section 4: Modality cards */
function _renderModalityCards(data) {
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px;" class="mf-grid">
    ${MODALITY_CONFIG.map(m => {
      const md = data?.modalities?.[m.id] || {};
      const score = md.score ?? null;
      const conf = md.confidence ?? 0;
      const grade = gradeLetter(md.grade);
      const prov = md.provenance || 'proxy';
      const feats = md.features || {};
      const color = scoreColor(score);
      const cardBg = scoreBg(score);

      return `<div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:${cardBg};display:flex;flex-direction:column;gap:12px;min-height:200px;cursor:pointer;transition:box-shadow 0.15s;" onmouseenter="this.style.boxShadow='0 0 0 2px ${color}33'" onmouseleave="this.style.boxShadow='none'">
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:22px;">${m.icon}</span>
            <span style="font-size:14px;font-weight:600;color:var(--text-primary);">${esc(m.name)}</span>
          </div>
          ${provenancePill(prov)}
        </div>
        <!-- Score -->
        <div style="display:flex;align-items:baseline;gap:8px;">
          <span style="font-size:32px;font-weight:800;color:${color};font-family:var(--font-display);line-height:1;">
            ${score != null ? fmtInt(score) : '\u2014'}
          </span>
          <span style="font-size:12px;color:var(--text-secondary);">/100</span>
          ${evidenceBadge(`EV-${grade}`)}
        </div>
        <!-- Confidence bar -->
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;color:var(--text-tertiary);min-width:50px;">Confidence</span>
          ${confidenceBar(conf, { w: 80, h: 5 })}
          <span style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono);">${fmtPct(conf)}</span>
        </div>
        <!-- Key features -->
        <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;flex-direction:column;gap:6px;">
          ${m.features.map(f => {
            const v = feats[f.key];
            return `<div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:11px;color:var(--text-secondary);">${esc(f.label)}</span>
              <span style="font-size:12px;font-weight:600;color:var(--text-primary);font-family:var(--font-mono);">
                ${v != null ? esc(String(v)) : '\u2014'} ${esc(f.unit)}
              </span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/** Section 5: Risk flags panel */
function _renderRiskFlags(data) {
  const flags = data?.risk_flags || [];
  if (flags.length === 0) {
    return `<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:13px;">
      No risk flags identified.
    </div>`;
  }

  return `<div style="display:flex;flex-direction:column;gap:8px;">
    ${flags.map((f, idx) => {
      const isExpanded = _expandedFlags.has(f.id);
      const sevColor = severityColor(f.severity);
      const sevBg = severityBg(f.severity);
      return `<div style="border-radius:8px;border:1px solid var(--border);overflow:hidden;">
        <!-- Header row (always visible) -->
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:${sevBg};cursor:pointer;"
          onclick="window._mfToggleFlag('${f.id}')">
          <span style="font-size:16px;color:${sevColor};flex-shrink:0;">
            ${f.severity === 'high' ? '🔴' : f.severity === 'moderate' ? '🟠' : '🔵'}
          </span>
          <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1;">${esc(f.title)}</span>
          <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:${sevColor}15;color:${sevColor};text-transform:uppercase;letter-spacing:0.5px;">
            ${esc(f.severity)}
          </span>
          <span style="font-size:12px;color:var(--text-tertiary);transition:transform 0.2s;display:inline-block;transform:rotate(${isExpanded ? '90' : '0'}deg);">▶</span>
        </div>
        <!-- Expanded detail -->
        ${isExpanded ? `<div style="padding:14px 16px;background:var(--surface-secondary);border-top:1px solid var(--border);">
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:8px;">${esc(f.description)}</div>
          <div style="font-size:11px;color:var(--text-tertiary);background:var(--surface-primary);padding:8px 10px;border-radius:6px;border:1px solid var(--border);">
            <strong style="color:var(--text-secondary);">Evidence:</strong> ${esc(f.evidence)}
          </div>
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

/** Section 6: Cross-modal correlation matrix */
function _renderCorrelationMatrix(data) {
  const corrOrder = ['video_movement', 'voice', 'text', 'wearable', 'biomarkers', 'assessments', 'digital_phenotyping'];
  const names = corrOrder.map(id => {
    const cfg = MODALITY_CONFIG.find(m => m.id === id);
    return cfg ? cfg.name.split(' ')[0] : id;
  });

  // Build a lookup map
  const corrMap = {};
  (data?.correlations || []).forEach(c => {
    corrMap[`${c.m1}|${c.m2}`] = c.value;
    corrMap[`${c.m2}|${c.m1}`] = c.value;
  });

  function corrColor(val) {
    if (val == null) return '#334155';
    if (val > 0) return `rgba(34,197,94,${Math.min(1, 0.15 + Math.abs(val) * 0.7)})`;
    return `rgba(239,68,68,${Math.min(1, 0.15 + Math.abs(val) * 0.7)})`;
  }
  function corrText(val) {
    if (val == null) return '\u2014';
    return val.toFixed(2);
  }

  return `<div style="overflow-x:auto;">
    <table style="border-collapse:collapse;font-size:11px;">
      <thead>
        <tr>
          <th style="padding:6px 8px;background:transparent;"></th>
          ${names.map(n => `<th style="padding:6px 8px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:10px;">${esc(n)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${corrOrder.map((rowId, ri) => `<tr>
          <td style="padding:6px 8px;font-weight:600;color:var(--text-secondary);font-size:10px;white-space:nowrap;">${esc(names[ri])}</td>
          ${corrOrder.map((colId, ci) => {
            if (ri === ci) {
              return `<td style="padding:0;width:42px;height:42px;text-align:center;background:rgba(255,255,255,0.03);">
                <span style="color:var(--text-tertiary);font-size:10px;">1.0</span>
              </td>`;
            }
            const val = corrMap[`${rowId}|${colId}`];
            return `<td style="padding:0;width:42px;height:42px;text-align:center;background:${corrColor(val)};cursor:help;"
              title="${esc(names[ri])} ↔ ${esc(names[ci])}: ${val != null ? val.toFixed(2) : 'no data'}">
              <span style="font-family:var(--font-mono);font-size:10px;font-weight:600;color:${val != null ? (val > 0 ? '#22c55e' : '#ef4444') : 'var(--text-tertiary)'};">
                ${val != null ? (val > 0 ? '+' : '') + val.toFixed(2) : '\u2014'}
              </span>
            </td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

/** Section 7: Timeline chart */
function _renderTimeline(data) {
  const timeline = data?.timeline || [];
  if (timeline.length < 2) {
    return `<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:13px;">Insufficient timeline data.</div>`;
  }

  const corrOrder = ['video_movement', 'voice', 'text', 'wearable', 'biomarkers', 'assessments', 'digital_phenotyping'];
  const seriesColors = {
    video_movement: '#22c55e',
    voice: '#a855f7',
    text: '#3b82f6',
    wearable: '#06b6d4',
    biomarkers: '#ef4444',
    assessments: '#f59e0b',
    digital_phenotyping: '#ec4899',
  };
  const seriesLabels = {};
  MODALITY_CONFIG.forEach(m => { seriesLabels[m.id] = m.name; });

  const w = 700;
  const h = 220;
  const padL = 40, padR = 10, padT = 10, padB = 30;

  // Y range 0-100
  const yMin = 0, yMax = 100;
  const yRange = yMax - yMin || 1;

  // Grid lines
  const gridLines = [0, 25, 50, 75, 100].map(v => {
    const y = padT + (1 - (v - yMin) / yRange) * (h - padT - padB);
    return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <text x="${padL - 6}" y="${y + 3}" fill="rgba(255,255,255,0.35)" font-size="9" text-anchor="end">${v}</text>`;
  }).join('');

  // Build polylines for each modality
  const polylines = corrOrder.map(key => {
    const vals = timeline.map(t => t[key]).filter(v => v != null);
    if (vals.length < 2) return '';
    const pts = timeline.map((t, i) => {
      const x = padL + (i / (timeline.length - 1)) * (w - padL - padR);
      const v = t[key];
      const y = v != null ? padT + (1 - (v - yMin) / yRange) * (h - padT - padB) : null;
      return y != null ? `${x.toFixed(1)},${y.toFixed(1)}` : '';
    }).filter(Boolean).join(' ');
    const color = seriesColors[key] || '#94a3b8';
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"
      data-series="${key}" style="cursor:pointer;" onclick="window._mfZoomSeries('${key}')"/>`;
  }).join('');

  // X-axis date labels (first, middle, last)
  const xLabels = [0, Math.floor(timeline.length / 2), timeline.length - 1].map(i => {
    const x = padL + (i / (timeline.length - 1)) * (w - padL - padR);
    return `<text x="${x}" y="${h - 8}" fill="rgba(255,255,255,0.35)" font-size="9" text-anchor="middle">${fmtDate(timeline[i]?.date)}</text>`;
  }).join('');

  return `<div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-height:280px;" preserveAspectRatio="xMidYMid meet">
      ${gridLines}
      ${polylines}
      ${xLabels}
    </svg>
    <!-- Legend -->
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;justify-content:center;">
      ${corrOrder.map(key => `
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary);cursor:pointer;padding:3px 8px;border-radius:4px;"
          onmouseenter="window._mfHighlightSeries('${key}')" onmouseleave="window._mfUnhighlightSeries()"
          onclick="window._mfZoomSeries('${key}')">
          <span style="width:10px;height:3px;border-radius:2px;background:${seriesColors[key]}"></span>
          ${esc(seriesLabels[key] || key)}
        </span>
      `).join('')}
    </div>
  </div>`;
}

/** Section 8: Evidence summary */
function _renderEvidenceSummary(data) {
  const es = data?.evidence_summary;
  if (!es) return '';

  const grades = [
    { label: 'A', count: es.a_count || 0, color: '#22c55e', desc: 'High quality (RCTs, systematic reviews)' },
    { label: 'B', count: es.b_count || 0, color: '#3b82f6', desc: 'Moderate (controlled studies)' },
    { label: 'C', count: es.c_count || 0, color: '#f59e0b', desc: 'Limited (case series, expert opinion)' },
    { label: 'D', count: es.d_count || 0, color: '#ef4444', desc: 'Insufficient — use with caution' },
  ];

  return `<div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--surface-secondary);">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-size:16px;">📊</span>
      <span style="font-size:14px;font-weight:600;color:var(--text-primary);">Evidence Summary</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px;">
      ${grades.map(g => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;background:var(--surface-primary);border:1px solid var(--border);">
        ${evidenceBadge(`EV-${g.label}`)}
        <div>
          <div style="font-size:18px;font-weight:700;color:${g.color};font-family:var(--font-display);">${g.count}</div>
          <div style="font-size:10px;color:var(--text-tertiary);">${g.desc}</div>
        </div>
      </div>`).join('')}
    </div>
    ${es.note ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.5;padding:8px 10px;border-radius:6px;background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.12);">
      <strong style="color:var(--blue);">ℹ</strong> ${esc(es.note)}
    </div>` : ''}
    <!-- Final disclaimer -->
    <div style="margin-top:12px;padding:10px 14px;border-radius:6px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);font-size:12px;color:var(--amber);line-height:1.5;">
      <strong>⚠ Clinical Disclaimer:</strong> This is a <em>decision-support tool only</em>. All outputs require review by a qualified clinician. No automated finding should be used as the sole basis for diagnosis, treatment, or clinical action.
    </div>
  </div>`;
}

/* ── Main render ───────────────────────────────────────────────────────────── */

function _render() {
  const container = document.getElementById('content');
  if (!container) return;

  if (_loading) {
    container.innerHTML = `<div style="max-width:1200px;margin:0 auto;padding:40px;text-align:center;">
      ${spinner()}<div style="margin-top:12px;font-size:13px;color:var(--text-secondary);">Loading multimodal fusion data…</div>
    </div>`;
    return;
  }

  if (_error) {
    container.innerHTML = `<div style="max-width:1200px;margin:0 auto;padding:20px;">
      <div style="padding:20px;background:rgba(239,68,68,0.08);border-radius:8px;color:#ef4444;font-size:14px;border:1px solid rgba(239,68,68,0.2);margin-bottom:16px;">
        <strong>Error:</strong> ${esc(_error)}
      </div>
      <button class="btn btn-sm" onclick="window._mfRetryLoad()">Retry</button>
    </div>`;
    return;
  }

  const d = _fusionData;

  container.innerHTML = `<div id="multimodal-fusion-page" style="max-width:1200px;margin:0 auto;padding:20px;background:var(--surface-primary);min-height:100vh;">
    <style>
      @media (max-width: 992px) {
        .mf-grid { grid-template-columns: repeat(2, 1fr) !important; }
      }
      @media (max-width: 640px) {
        .mf-grid { grid-template-columns: 1fr !important; }
      }
      .mf-series-dim { opacity: 0.15 !important; }
      .mf-series-hl { opacity: 1 !important; stroke-width: 3.5 !important; }
    </style>

    <!-- Page header -->
    <h1 style="font-size:20px;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Multimodal Fusion</h1>
    <p style="font-size:12px;color:var(--text-secondary);margin-bottom:20px;">Integrated view across 7 data modalities · Patient ${esc(_patientId || '')}</p>

    <!-- 1. Safety Banner -->
    ${_renderSafetyBanner()}

    <!-- 2. Fusion Score Gauge + 3. Trajectory -->
    <div style="padding:20px;border-radius:10px;border:1px solid var(--border);background:var(--surface-secondary);margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 16px;color:var(--text-primary);">Fusion Overview</h2>
      <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap;">
        ${_renderFusionGauge(d)}
        <div style="flex:1;min-width:200px;">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Trajectory</div>
          ${_renderTrajectory(d)}
        </div>
      </div>
    </div>

    <!-- 4. Modality Cards -->
    <div style="margin-bottom:28px;">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 16px;color:var(--text-primary);">Modality Overview</h2>
      ${_renderModalityCards(d)}
    </div>

    <!-- 5. Risk Flags -->
    <div style="padding:20px;border-radius:10px;border:1px solid var(--border);background:var(--surface-secondary);margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 16px;color:var(--text-primary);">Risk Flags (${(d?.risk_flags || []).length})</h2>
      ${_renderRiskFlags(d)}
    </div>

    <!-- 6. Correlation Matrix -->
    <div style="padding:20px;border-radius:10px;border:1px solid var(--border);background:var(--surface-secondary);margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <h2 style="font-size:16px;font-weight:600;margin:0;color:var(--text-primary);">Cross-Modal Correlation</h2>
        <div style="display:flex;gap:12px;font-size:11px;color:var(--text-secondary);">
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:rgba(34,197,94,0.4);"></span> Positive</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:rgba(239,68,68,0.4);"></span> Negative</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#334155;"></span> No data</span>
        </div>
      </div>
      ${_renderCorrelationMatrix(d)}
    </div>

    <!-- 7. Timeline Chart -->
    <div style="padding:20px;border-radius:10px;border:1px solid var(--border);background:var(--surface-secondary);margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 16px;color:var(--text-primary);">Timeline (30 Days)</h2>
      ${_renderTimeline(d)}
    </div>

    <!-- 8. Evidence Summary -->
    <div style="margin-bottom:40px;">
      ${_renderEvidenceSummary(d)}
    </div>
  </div>`;
}

/* ── Data loading ──────────────────────────────────────────────────────────── */

async function _loadFusionData() {
  if (!_patientId) {
    _error = 'No patient ID provided.';
    _render();
    return;
  }

  _loading = true;
  _render();

  try {
    const data = await _fetchFusionData(_patientId);
    if (data && (data.modalities || data.overall_fusion_score != null)) {
      _fusionData = data;
      _error = null;
    }
  } catch (err) {
    _error = err.message || 'Failed to load fusion data';
  }

  // Demo fallback
  if (!_fusionData) {
    _fusionData = _demoFusionData(_patientId);
    _error = null;
  }

  _loading = false;
  _render();
}

/* ── Interactions ──────────────────────────────────────────────────────────── */

function _toggleFlag(flagId) {
  if (_expandedFlags.has(flagId)) {
    _expandedFlags.delete(flagId);
  } else {
    _expandedFlags.add(flagId);
  }
  _render();
}

function _highlightSeries(seriesKey) {
  const svg = document.querySelector('#multimodal-fusion-page svg');
  if (!svg) return;
  svg.querySelectorAll('polyline[data-series]').forEach(pl => {
    if (pl.getAttribute('data-series') === seriesKey) {
      pl.classList.add('mf-series-hl');
      pl.classList.remove('mf-series-dim');
    } else {
      pl.classList.add('mf-series-dim');
      pl.classList.remove('mf-series-hl');
    }
  });
}

function _unhighlightSeries() {
  const svg = document.querySelector('#multimodal-fusion-page svg');
  if (!svg) return;
  svg.querySelectorAll('polyline[data-series]').forEach(pl => {
    pl.classList.remove('mf-series-dim', 'mf-series-hl');
  });
}

let _zoomedSeries = null;
function _zoomSeries(seriesKey) {
  if (_zoomedSeries === seriesKey) {
    _zoomedSeries = null;
    _unhighlightSeries();
    return;
  }
  _zoomedSeries = seriesKey;
  _highlightSeries(seriesKey);
}

function _retryLoad() {
  _expandedFlags.clear();
  _zoomedSeries = null;
  _loadFusionData();
}

/* ── Wire global handlers ──────────────────────────────────────────────────── */

if (typeof window !== 'undefined') {
  window._mfToggleFlag = _toggleFlag;
  window._mfHighlightSeries = _highlightSeries;
  window._mfUnhighlightSeries = _unhighlightSeries;
  window._mfZoomSeries = _zoomSeries;
  window._mfRetryLoad = _retryLoad;
}

/* ── Page entry point ──────────────────────────────────────────────────────── */

export async function pgMultimodalFusion(patientId) {
  _patientId = patientId;
  _fusionData = null;
  _error = null;
  _loading = false;
  _expandedFlags = new Set();
  _zoomedSeries = null;

  _render();
  await _loadFusionData();
}

// Alternative entry point (for routing systems that pass setTopbar)
export async function pgMultimodalFusionWithTopbar(setTopbar, patientId) {
  if (typeof setTopbar === 'function') {
    setTopbar('Multimodal Fusion', '<span class="monitor-topbar-pill">🧬 Fusion</span>');
  }
  await pgMultimodalFusion(patientId);
}

// Exports for testing
export {
  _fusionData,
  _error,
  _loading,
  _expandedFlags,
  _renderSafetyBanner,
  _renderFusionGauge,
  _renderTrajectory,
  _renderModalityCards,
  _renderRiskFlags,
  _renderCorrelationMatrix,
  _renderEvidenceSummary,
  _render,
  _demoFusionData,
  gradeLetter,
  provenancePill,
  trajectoryArrow,
  confidenceBar,
  scoreColor,
  scoreBg,
  esc,
  fmtPct,
  _toggleFlag,
};
