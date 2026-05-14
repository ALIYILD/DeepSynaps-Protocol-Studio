// ─────────────────────────────────────────────────────────────────────────────
// pages-research-evidence.js — Clinician evidence & governance workspace
// Combines live corpus metrics (when API + ingest available), bundled registry
// rollups, and brokered search — not autonomous clinical decision-making.
// Indexed corpus totals come from GET /api/v1/evidence/status — never hard-coded.
// ─────────────────────────────────────────────────────────────────────────────

import { tag, spinner } from './helpers.js';
import { api } from './api.js';
import { currentUser } from './auth.js';
import {
  EVIDENCE_TOTAL_PAPERS, EVIDENCE_TOTAL_TRIALS, EVIDENCE_TOTAL_META,
  EVIDENCE_SOURCES, CONDITION_EVIDENCE, EVIDENCE_SUMMARY,
  EVIDENCE_GRADES, MODALITY_CONDITION_EVIDENCE_MATRIX, KEY_REFERENCES_2024_2025,
  getTopConditionsByPaperCount, searchEvidenceByKeyword,
} from './evidence-dataset.js';
import { getEvidenceUiStats } from './evidence-ui-live.js';
import { renderLiveEvidencePanel } from './live-evidence.js';
import { loadResearchBundleWorkspace } from './research-bundle-workspace.js';
import { renderClinicalDisclaimer, renderModuleClinicalDisclaimer } from './clinical-disclaimer.js';
import {
  CONDITION_REGISTRY, ASSESSMENT_REGISTRY, PROTOCOL_REGISTRY,
  DEVICE_REGISTRY, BRAIN_TARGET_REGISTRY,
} from './registries.js';

/* ── tiny helpers ──────────────────────────────────────────────────────────── */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmt = n => Number(n).toLocaleString();
const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
const pct = (n, total) => total ? ((n / total) * 100).toFixed(1) : '0';

/* condition category from CONDITION_REGISTRY (id→cat lookup) */
const _condCatMap = {};
for (const c of CONDITION_REGISTRY) _condCatMap[c.id] = c;

/* map evidence-dataset conditionId → registry id (normalize slug) */
function _regLookup(condId) {
  // evidence-dataset uses full slugs like 'major-depressive-disorder'
  // registry uses short ids like 'mdd'. Build a name-based fallback.
  if (_condCatMap[condId]) return _condCatMap[condId];
  const slug = condId.toLowerCase();
  for (const c of CONDITION_REGISTRY) {
    if (c.name && c.name.toLowerCase().replace(/[\s/]+/g, '-').replace(/[^a-z0-9-]/g, '') === slug) return c;
  }
  return null;
}

/* ── bar helper (pure CSS) ─────────────────────────────────────────────────── */
function hBar(label, value, maxVal, color) {
  const w = maxVal ? Math.max(2, (value / maxVal) * 100) : 0;
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
    <span style="min-width:140px;font-size:12px;color:var(--text-secondary);text-align:right;white-space:nowrap">${esc(label)}</span>
    <div style="flex:1;height:20px;background:var(--surface-2);border-radius:4px;overflow:hidden">
      <div style="width:${w.toFixed(1)}%;height:100%;background:${color};border-radius:4px;transition:width .3s"></div>
    </div>
    <span style="min-width:50px;font-size:11px;color:var(--text-tertiary);font-variant-numeric:tabular-nums">${fmt(value)}</span>
  </div>`;
}

/* ── grade color ───────────────────────────────────────────────────────────── */
const GRADE_CLR = { A: '#2dd4bf', B: '#60a5fa', C: '#fbbf24', D: '#f97316', E: '#ef4444', N: '#ef4444' };

/* ── full GRADE evidence legend (A/B/C/D/N) ───────────────────────────────── */
const GRADE_LEGEND = {
  A: { label: 'Strong', color: '#2dd4bf', desc: 'Multiple RCTs, consistent, low heterogeneity (I\u00b2<50%), low risk of bias' },
  B: { label: 'Moderate', color: '#60a5fa', desc: 'Some RCTs, mostly consistent, minor methodological concerns' },
  C: { label: 'Limited', color: '#fbbf24', desc: 'Few RCTs, small samples, high heterogeneity, methodological limitations' },
  D: { label: 'Emerging', color: '#f97316', desc: 'Preliminary/pilot studies, case series, mechanistic rationale only' },
  N: { label: 'Negative', color: '#ef4444', desc: 'Probably-blinded outcomes show no clinically meaningful benefit' },
};

function _gradeLegendHtml() {
  const items = Object.entries(GRADE_LEGEND).map(([k, v]) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;margin-bottom:4px">` +
    `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${v.color}"></span>` +
    `<span style="font-size:10px;font-weight:600;color:var(--text-secondary)">${esc(k)}</span>` +
    `<span style="font-size:10px;color:var(--text-tertiary)">${esc(v.label)}</span></span>`
  );
  return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${items.join('')}</div>`;
}

/* ── FDA status indicator helpers ──────────────────────────────────────────── */
function _fdaIndicator(fda, fdaYear) {
  if (fda === 'approved') return `<span title="FDA Approved${fdaYear ? ' ' + fdaYear : ''}" style="font-size:11px;color:#fbbf24;font-weight:700">\u2605</span>`;
  if (fda === 'cleared') return `<span title="FDA Cleared${fdaYear ? ' ' + fdaYear : ''}" style="font-size:11px;color:#60a5fa;font-weight:700">\u25cf</span>`;
  return '';
}

/* ── SMD tooltip helper ────────────────────────────────────────────────────── */
function _smdTooltip(grade, smd, ci, nStudies) {
  const parts = [];
  if (grade) parts.push(`Grade ${grade}`);
  if (smd) parts.push(`SMD ${smd}`);
  if (ci) parts.push(ci);
  if (nStudies) parts.push(`${nStudies} studies`);
  return parts.join(' \u00b7 ') || 'Evidence grade only';
}

/* ── honest neurofeedback disclosure banner ────────────────────────────────── */
function _neurofeedbackDisclosureHtml() {
  return (
    '<div class="ch-card" style="margin-bottom:14px;padding:12px 16px;border-left:3px solid var(--rose);background:rgba(244,63,94,0.06)">' +
    '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55">' +
    '<strong style="color:var(--rose)">Evidence Disclosure \u2014 Neurofeedback for ADHD</strong><br>' +
    'The largest meta-analysis to date (JAMA Psychiatry 2024, Janvier ME et al.; 38 RCTs, n=2,472) ' +
    'found <strong>probably-blinded SMD = 0.04</strong> \u2014 no clinically meaningful benefit. ' +
    'Standard (non-blinded) SMD was 0.21, suggesting performance/confounding bias. ' +
    'This is a NEGATIVE (Grade N) finding in the GRADE framework.' +
    '</div></div>'
  );
}

/* ── Key 2024-2025 landmark references panel ───────────────────────────────── */
function _renderKeyReferences2024_2025() {
  const rows = KEY_REFERENCES_2024_2025.map((ref) => {
    const gradeColor = EVIDENCE_GRADES[ref.gradeImpact]?.color || 'var(--text-tertiary)';
    const nLabel = ref.nStudies && ref.nPatients ? `${ref.nStudies} studies, n=${ref.nPatients.toLocaleString()}`
      : ref.nStudies ? `${ref.nStudies} studies`
      : ref.nPatients ? `n=${ref.nPatients.toLocaleString()}`
      : '';
    return (
      '<tr style="border-bottom:1px solid var(--border)">' +
      `<td style="padding:8px 10px;font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap">${esc(ref.citation)}</td>` +
      `<td style="padding:8px 10px;font-size:12px;color:var(--text-secondary)">${esc(ref.title)}</td>` +
      `<td style="padding:8px 10px;font-size:11px;color:var(--text-tertiary)">${esc(ref.journal)}</td>` +
      `<td style="padding:8px 10px;font-size:11px;color:var(--text-tertiary)">${esc(ref.modality)} \u2192 ${esc(ref.condition)}</td>` +
      `<td style="padding:8px 10px;font-size:11px;white-space:nowrap">${nLabel ? `<span style="font-size:10px;color:var(--text-tertiary)">${esc(nLabel)}</span>` : ''}</td>` +
      `<td style="padding:8px 10px;font-size:11px;color:var(--text-secondary);max-width:240px">${esc(ref.keyFinding)}</td>` +
      `<td style="padding:8px 10px"><span style="display:inline-block;padding:2px 6px;font-size:10px;font-weight:700;border-radius:3px;background:${gradeColor};color:#0b1220">${esc(ref.gradeImpact)}</span></td>` +
      '</tr>'
    );
  }).join('');

  return (
    '<div class="ch-card" style="margin-top:16px;padding:16px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
    '<div style="font-size:14px;font-weight:700;color:var(--text-primary)">Key 2024\u20132025 Findings</div>' +
    '<span style="font-size:11px;color:var(--text-tertiary)">Landmark studies from the evidence research roadmap</span>' +
    '</div>' +
    '<div style="overflow-x:auto">' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    '<thead><tr style="border-bottom:2px solid var(--border)">' +
    '<th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left">Citation</th>' +
    '<th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left">Title</th>' +
    '<th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left">Journal</th>' +
    '<th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left">Modality \u2192 Condition</th>' +
    '<th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left">Scale</th>' +
    '<th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left">Key Finding</th>' +
    '<th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left">Grade</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>' +
    '<p style="font-size:11px;color:var(--text-tertiary);margin-top:10px">' +
    'GRADE impact: how this study affects the evidence grade for the modality-condition pair. ' +
    '<em>Not a diagnosis or treatment recommendation. Clinician review required.</em>' +
    '</p></div>'
  );
}
let _liveEvidenceUiStats = null;

function _resDemoBuild() {
  try {
    return !!(import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_DEMO === '1');
  } catch {
    return false;
  }
}

/** Clinical disclaimer — mandated on Evidence Research page at mount (Class A requirement) */
function _resClinicalDisclaimerBanner() {
  return renderClinicalDisclaimer();
}

/** Governance + safety framing — shown on key tabs */
function _resGovernanceBanner() {
  return (
    '<div class="ch-card" role="region" aria-label="Evidence governance notice" style="margin-bottom:14px;border-left:3px solid var(--amber);background:rgba(245,158,11,0.06);padding:12px 14px">' +
    '<div style="font-size:12.5px;line-height:1.55;color:var(--text-secondary)">' +
    '<strong style="color:var(--amber)">Research Evidence.</strong> ' +
    'This is a controlled preview evidence workspace. It supports literature review, evidence grading, and governance workflows only. ' +
    'It does not diagnose, prescribe, approve treatment, triage emergencies, or act autonomously. ' +
    'Evidence summaries require clinician review against current literature, device labelling, patient suitability, and local policy.' +
    '</div>' +
    '<div style="font-size:12.5px;line-height:1.55;color:var(--text-secondary);margin-top:10px">' +
    'Bundled registry rollups are for navigation and preview context. They are not a substitute for verified primary literature retrieval.' +
    '</div>' +
    '<div style="font-size:12.5px;line-height:1.55;color:var(--text-secondary);margin-top:10px">' +
    'Regulatory clearance is not the same as clinical efficacy, and adjacent-condition evidence does not automatically imply indication-specific suitability.' +
    '</div></div>'
  );
}

/** When live corpus counts are unavailable — honest degraded mode (hidden when status confirms indexed ingest) */
function _resBundledDegradedBanner(stats) {
  if (stats?.indexedCorpusAvailable) return '';
  if (stats?.live) return '';
  const previewMsg =
    stats?.evidenceStatusReachable && !stats?.indexedCorpusAvailable
      ? '<strong style="color:var(--rose)">Indexed evidence corpus unavailable in this preview environment.</strong> ' +
        '<code style="font-size:10px">GET /api/v1/evidence/status</code> reported zero papers/trials/devices or the ingest is empty. ' +
        'Bundled registry approximations below are for navigation only — not verified search results.'
      : '<strong style="color:var(--rose)">Live evidence service unavailable.</strong> ' +
        'Showing bundled registry approximations for navigation only.';
  return (
    '<div class="ch-card" role="status" aria-live="polite" style="margin-bottom:14px;border-left:3px solid var(--rose);background:rgba(244,63,94,0.06);padding:10px 14px">' +
    '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' +
    previewMsg +
    '</div></div>'
  );
}

/** Labels live API vs bundled demo/registry fallback for transparency */
function _resSourceStrip(stats) {
  const demo = _resDemoBuild();
  const idx = !!(stats && stats.indexedCorpusAvailable);
  const apiLive = !!(stats && stats.live);
  const st = Number(stats?.statusTotalPapers || 0);
  const modeLabel = idx
    ? 'Indexed evidence corpus connected — ~' +
      fmt(st || stats?.totalPapers || 0) +
      ' papers reported by GET /api/v1/evidence/status (search uses GET /api/v1/evidence/papers)'
    : apiLive
      ? 'Live evidence service (aggregated counts from API)'
      : 'Bundled registry approximation — connect API + ingest for authoritative totals';
  const liveBadge = idx
    ? '<span style="margin-left:8px;padding:2px 8px;border-radius:999px;background:rgba(45,212,191,0.22);color:var(--teal);font-size:11px;font-weight:700">Indexed DB</span>'
    : apiLive
      ? '<span style="margin-left:8px;padding:2px 8px;border-radius:999px;background:rgba(45,212,191,0.18);color:var(--teal);font-size:11px;font-weight:700">Live API</span>'
      : '<span style="margin-left:8px;padding:2px 8px;border-radius:999px;background:var(--surface-2);color:var(--text-secondary);font-size:11px;font-weight:600">Bundled registry</span>';
  const demoNote = demo
    ? '<span style="margin-left:8px;padding:2px 8px;border-radius:999px;background:rgba(245,158,11,0.15);color:var(--amber);font-size:11px;font-weight:600">Demo / preview build</span>'
    : '';
  const offlineNote =
    !apiLive && stats?.evidenceStatusRejected
      ? '<span style="margin-left:8px;font-size:11px;color:var(--text-tertiary)">Offline fallback</span>'
      : '';
  return (
    '<div class="ch-card" style="padding:10px 14px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">' +
    '<div style="font-size:12px;color:var(--text-secondary)">' +
    '<strong style="color:var(--text-primary)">Source mode:</strong> ' + esc(modeLabel) + liveBadge + demoNote + offlineNote +
    '</div>' +
    '<div style="font-size:11px;color:var(--text-tertiary);max-width:420px;text-align:right">' +
    'Evidence grades describe literature summaries in this workspace — not automatic clinical grades. ' +
    'See <code style="font-size:10px">docs/protocol-evidence-governance-policy.md</code>.' +
    '</div>' +
    '</div>'
  );
}

/** Shared header: governance + degraded notice + source strip; optional module shortcuts */
function _resWorkspaceHeader(liveEvidence, { shortcuts = false } = {}) {
  return (
    _resClinicalDisclaimerBanner() +
    renderModuleClinicalDisclaimer('evidence', { compact: true, marginBottom: 14 }) +
    _resGovernanceBanner() +
    _resBundledDegradedBanner(liveEvidence) +
    _resSourceStrip(liveEvidence) +
    (shortcuts ? _resWorkbenchShortcuts() : '')
  );
}

/** Quick navigation to linked Clinical OS modules (draft/review contexts only) */
function _resWorkbenchShortcuts() {
  const role = currentUser?.role || '';
  const patientOk = role && role !== 'patient';
  return (
    '<div class="ch-card" style="padding:14px 16px;margin-bottom:16px">' +
    '<div style="font-weight:600;margin-bottom:10px;font-size:14px">Linked workspaces</div>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px;line-height:1.5">' +
    'Open related tools for <strong>draft</strong> protocols, handbook drafts, and planning — never as automatic approval from this page.</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'protocol-studio\')">Protocol Studio</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'handbooks-v2\')">Handbooks</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'brainmap-v2\')">Brain Map Planner</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'assessments-v2\')">Assessments</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'documents-v2\')">Documents</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'clinician-inbox\')">Inbox</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'schedule-v2\')">Schedule</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'deeptwin\')">DeepTwin</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'qeeg-launcher\')">qEEG</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'mri-analysis\')">MRI</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'video-assessments\')">Video</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'wearables\')">Biometrics</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'text-analyzer\')">Text</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'live-session\')">Virtual Care</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'biomarkers\')">Biomarkers</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'labs-analyzer\')">Labs</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'medication-analyzer\')">Medication</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'nutrition-analyzer\')">Nutrition</button>' +
    (patientOk
      ? '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'patients-v2\')">Patients</button>'
      : '<span style="font-size:11px;color:var(--text-tertiary);align-self:center">Patient roster requires clinician context.</span>') +
    '</div></div>'
  );
}
let _researchBundleState = {
  loaded: false,
  loading: null,
  summary: null,
  coverageRows: [],
  templates: [],
  exactProtocols: [],
  safetySignals: [],
  evidenceGraph: [],
  adjunctSummary: null,
  adjunctPapers: [],
  adjunctReviewTables: null,
};
const _researchConditionDetailCache = new Map();

function _reSlug(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function _reNormalizeLabel(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase() === 'tdcs') return 'tDCS';
  if (raw.toLowerCase() === 'tacs') return 'tACS';
  if (raw.toLowerCase() === 'trns') return 'tRNS';
  if (raw.toLowerCase() === 'tfus') return 'tFUS';
  if (raw.toLowerCase() === 'rtms') return 'rTMS';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

function _reSignalTitle(signal) {
  return (
    (signal.safety_signal_tags || []).concat(signal.contraindication_signal_tags || []).join(', ')
    || signal.title
    || signal.example_titles
    || 'Safety signal'
  );
}

function _tierToGradeLabel(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'high') return 'A';
  if (raw === 'moderate_high') return 'B';
  if (raw === 'moderate') return 'C';
  if (raw === 'low') return 'D';
  if (raw.includes('low')) return 'D';
  if (raw.includes('preclinical') || raw.includes('contextual') || raw.includes('unspecified')) return 'E';
  return raw.toUpperCase();
}

async function _ensureResearchConditionDetail(slug) {
  const key = String(slug || '').trim();
  if (!key) return null;
  if (_researchConditionDetailCache.has(key)) return _researchConditionDetailCache.get(key);
  const promise = api.getResearchCondition(key).catch(() => null);
  _researchConditionDetailCache.set(key, promise);
  return promise;
}

async function _ensureResearchBundleData() {
  if (_researchBundleState.loaded) return _researchBundleState;
  if (_researchBundleState.loading) return _researchBundleState.loading;
  _researchBundleState.loading = (async () => {
    try {
      const data = await loadResearchBundleWorkspace({
        summaryLimit: 12,
        coverageLimit: 24,
        templateLimit: 24,
        exactProtocolLimit: 24,
        safetyLimit: 40,
        evidenceGraphLimit: 24,
      });
      _researchBundleState.summary = data.summary || null;
      _researchBundleState.coverageRows = data.coverageRows || [];
      _researchBundleState.templates = data.templates || [];
      _researchBundleState.exactProtocols = data.exactProtocols || [];
      _researchBundleState.safetySignals = data.safetySignals || [];
      _researchBundleState.evidenceGraph = data.evidenceGraph || [];
      _researchBundleState.adjunctSummary = data.adjunctSummary || null;
      _researchBundleState.adjunctPapers = data.adjunctPapers || [];
      _researchBundleState.adjunctReviewTables = data.adjunctReviewTables || null;
      _researchBundleState.loaded = !!data.live;
    } finally {
      _researchBundleState.loading = null;
    }
    return _researchBundleState;
  })();
  return _researchBundleState.loading;
}

/* ── lazy-loaded protocol data (shared by search + review tabs) ─────────── */
let _protosAll = [], _condsAll = [], _devsAll = [];
let _protoDataLoaded = false;
async function _ensureProtoData() {
  if (_protoDataLoaded) return;
  try {
    const pd = await import('./protocols-data.js');
    _protosAll = pd.PROTOCOL_LIBRARY || [];
    _condsAll  = pd.CONDITIONS       || [];
    _devsAll   = pd.DEVICES          || [];
  } catch {}
  _protoDataLoaded = true;
}

/* ── tab meta ──────────────────────────────────────────────────────────────── */
const TAB_META = {
  overview:    { label: 'Overview',                   color: 'var(--teal)'   },
  indications: { label: 'Indications (Live DB)',      color: 'var(--teal)'   },
  conditions:  { label: 'Conditions & Comorbidity',   color: 'var(--blue)'   },
  assessments: { label: 'Assessments & Scales',       color: 'var(--violet)' },
  protocols:   { label: 'Protocols & Devices',        color: 'var(--green)'  },
  neuro:       { label: 'Brain Targets & Biomarkers', color: 'var(--rose)'   },
  adjunct:     { label: 'Labs / Meds / Diet',         color: 'var(--cyan,var(--teal))' },
  aiml:        { label: 'AI/ML & Psychotherapies',    color: 'var(--amber)'  },
  search:      { label: 'Live Indexed Evidence Search',            color: 'var(--cyan,var(--teal))' },
  review:      { label: 'Needs Review',               color: 'var(--amber)'  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   pgResearchEvidence — main export
   ══════════════════════════════════════════════════════════════════════════════ */
export async function pgResearchEvidence(setTopbar, navigate) {
  const tab = window._resEvidenceTab || 'overview';
  window._resEvidenceTab = tab;
  const el = document.getElementById('content');
  const liveEvidence = await getEvidenceUiStats({
    fallbackSummary: EVIDENCE_SUMMARY,
    fallbackConditionCount: CONDITION_EVIDENCE.length,
    fallbackMetaAnalyses: EVIDENCE_TOTAL_META,
  });
  _liveEvidenceUiStats = liveEvidence;

  const papersBadgeText = liveEvidence.totalPapers
    ? `${fmtK(liveEvidence.totalPapers)} papers indexed`
    : 'Evidence corpus';
  const papersBadgeTitle = liveEvidence.indexedCorpusAvailable
    ? 'Indexed evidence database connected — paper count from GET /api/v1/evidence/status. Use Live Indexed Evidence Search for live FTS over this ingest.'
    : liveEvidence.live
      ? 'Live evidence index aggregate for this session when API + ingest are connected.'
      : 'Bundled corpus metadata / fallback — not guaranteed live database totals.';
  setTopbar('Research Evidence',
    `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--surface-2);color:var(--text-secondary);font-weight:600;border:1px solid var(--border)" title="${esc(papersBadgeTitle)}">${esc(papersBadgeText)}</span>`);

  /* ── tab bar ─────────────────────────────────────────────────────────────── */
  function tabBar() {
    return Object.entries(TAB_META).map(([id, m]) =>
      '<button role="tab" aria-selected="' + (tab === id) + '" tabindex="' + (tab === id ? '0' : '-1') + '"' +
      ' class="ch-tab' + (tab === id ? ' ch-tab--active' : '') + '"' +
      (tab === id ? ' style="--tab-color:' + m.color + '"' : '') +
      ` onclick="window._resEvidenceTab='${id}';window._nav('research-evidence')">${esc(m.label)}</button>`
    ).join('');
  }

  /* ── search state ────────────────────────────────────────────────────────── */
  window._reSearch = window._reSearch || {};
  window._reFilter = window._reFilter || {};
  window._reExpand = window._reExpand || {};
  window._reSort   = window._reSort || {};

  const q    = (window._reSearch[tab] || '').toLowerCase();
  const filt = window._reFilter[tab] || 'All';
  const sort = window._reSort[tab] || 'papers';

  function sInput(placeholder) {
    return `<div style="position:relative;max-width:280px;flex:1 1 220px">
      <input type="search" placeholder="${esc(placeholder)}" class="ph-search-input"
        value="${esc(window._reSearch[tab] || '')}"
        oninput="window._reSearch['${tab}']=this.value;clearTimeout(window._reSTmr);window._reSTmr=setTimeout(()=>window._nav('research-evidence'),200)">
      <svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    </div>`;
  }

  function pills(values, active) {
    return values.map(v =>
      `<button class="reg-domain-pill${v === active ? ' active' : ''}"
        aria-pressed="${v === active}"
        onclick="window._reFilter['${esc(tab)}']='${esc(v)}';window._nav('research-evidence')">${esc(v)}</button>`
    ).join('');
  }

  function sortBtn(key, label) {
    const active = sort === key;
    return `<button style="padding:2px 8px;font-size:11px;border-radius:4px;border:1px solid var(--border);background:${active ? 'var(--teal)' : 'transparent'};color:${active ? '#fff' : 'var(--text-secondary)'};cursor:pointer"
      onclick="window._reSort['${tab}']='${key}';window._nav('research-evidence')">${label}${active ? ' ▼' : ''}</button>`;
  }

  /* ── shell ───────────────────────────────────────────────────────────────── */
  el.innerHTML = '<div class="ch-shell"><div class="ch-tab-bar" role="tablist" aria-label="Research Evidence sections">' +
    tabBar() + '</div><div class="ch-body" id="re-body">' + spinner() + '</div></div>';

  const body = document.getElementById('re-body');

  /* ── render per tab ──────────────────────────────────────────────────────── */
  if (tab === 'overview')         await renderOverview(body, liveEvidence);
  else if (tab === 'indications') await renderIndicationsSpine(body);
  else if (tab === 'conditions')  await renderConditions(body, q, filt, sort, sInput, pills, sortBtn);
  else if (tab === 'assessments') await renderAssessments(body, q, filt, sInput, pills);
  else if (tab === 'protocols')   await renderProtocols(body, q, sInput);
  else if (tab === 'neuro')       await renderNeuro(body, q, filt, sInput, pills);
  else if (tab === 'adjunct')     await renderAdjunctEvidence(body, q, sInput);
  else if (tab === 'aiml')        await renderAIML(body, q, sInput);
  else if (tab === 'search')      await renderEvidenceSearch(body);
  else if (tab === 'review')      await renderNeedsReview(body);
}


/* ══════════════════════════════════════════════════════════════════════════════
   Evidence Database card (Library Hub homepage one-click entry)

   Surfaces the live indications spine (29 indications · 184k+ papers · 1.3k
   trials · 35+ cleared devices) as a single homepage card so clinicians can
   reach the Indications (Live DB) tab in one click, instead of hunting for a
   tab in the bar. Uses the same `evidenceIndicationsSummary()` source that
   powers the spine itself, so counts always match.

   Honest empty state: if `evidenceIndicationsSummary` rejects (auth, 503, or
   the evidence DB is not ingested), the card shows a neutral "open page to
   retry" affordance — never fabricated numbers.
   ══════════════════════════════════════════════════════════════════════════════ */
export async function _renderEvidenceDbCard() {
  let summary = null;
  let summaryError = null;
  try {
    summary = await api.evidenceIndicationsSummary();
  } catch (err) {
    summaryError = err;
  }

  const navAttr =
    'onclick="window._resEvidenceTab=\'indications\';window._nav(\'research-evidence\')"';
  const cardOuter = (inner) => (
    '<div class="ch-card" role="button" tabindex="0" data-testid="evidence-db-card" ' +
    'aria-label="Open Indications (Live DB) tab" ' +
    navAttr +
    ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window._resEvidenceTab=\'indications\';window._nav(\'research-evidence\')}" ' +
    'style="padding:14px 16px;margin-bottom:14px;border-left:3px solid var(--teal);' +
    'cursor:pointer;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between">' +
    inner +
    '</div>'
  );

  if (summaryError || !Array.isArray(summary)) {
    const inner = (
      '<div style="flex:1 1 280px">' +
      '<div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Evidence Database</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' +
      'Evidence DB unavailable — open page to retry.' +
      '</div></div>' +
      '<div><span class="btn btn-sm btn-ghost" aria-hidden="true">Open Indications →</span></div>'
    );
    return cardOuter(inner);
  }

  if (summary.length === 0) {
    const inner = (
      '<div style="flex:1 1 280px">' +
      '<div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Evidence Database</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' +
      'No indications curated yet — open page to seed the spine.' +
      '</div></div>' +
      '<div><span class="btn btn-sm btn-ghost" aria-hidden="true">Open Indications →</span></div>'
    );
    return cardOuter(inner);
  }

  const indCount = summary.length;
  const totalPapers  = summary.reduce((s, r) => s + Number(r.paper_count  || 0), 0);
  const totalTrials  = summary.reduce((s, r) => s + Number(r.trial_count  || 0), 0);
  const totalDevices = summary.reduce((s, r) => s + Number(r.device_count || 0), 0);

  // Honest pluralisation; counts come straight from the evidence DB and are
  // never fabricated. fmtK() rolls 184,000 → "184K" the same way the spine
  // does, so subtitle and detail page agree.
  const subtitle = (
    `${fmt(indCount)} indication${indCount === 1 ? '' : 's'} · ` +
    `${fmtK(totalPapers)} paper${totalPapers === 1 ? '' : 's'} · ` +
    `${fmt(totalTrials)} trial${totalTrials === 1 ? '' : 's'} · ` +
    `${fmt(totalDevices)} cleared device${totalDevices === 1 ? '' : 's'}`
  );

  const inner = (
    '<div style="flex:1 1 280px">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
    '<div style="font-size:14px;font-weight:700;color:var(--text-primary)">Evidence Database</div>' +
    '<span style="padding:2px 8px;border-radius:10px;background:rgba(45,212,191,0.18);color:var(--teal);font-size:10px;font-weight:700;letter-spacing:0.3px">LIVE DB</span>' +
    '</div>' +
    `<div style="font-size:12px;color:var(--text-secondary);line-height:1.5" data-testid="evidence-db-card-subtitle">${esc(subtitle)}</div>` +
    '<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Source: <code>GET /api/v1/evidence/indications/summary</code></div>' +
    '</div>' +
    '<div><span class="btn btn-sm btn-ghost" aria-hidden="true">Open Indications →</span></div>'
  );
  return cardOuter(inner);
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 1 — Overview
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderOverview(body, liveEvidence = null) {
  await _ensureResearchBundleData();
  const terminalSnapshot = await api.evidenceTerminalSnapshot({ graphLimit: 14, safetyLimit: 8 }).catch(() => null);
  const S = EVIDENCE_SUMMARY;
  const liveSummary = _researchBundleState.summary || null;
  const top10 = Array.isArray(liveEvidence?.topConditions) && liveEvidence.topConditions.length
    ? liveEvidence.topConditions.slice(0, 10).map((row) => ({
        conditionId: row.key,
        paperCount: Number(row.count) || 0,
      }))
    : getTopConditionsByPaperCount(10);

  /* KPI strip — modality count uses registry when live distribution empty */
  const modalityKeys = Object.keys(liveEvidence?.modalityDistribution || {});
  const modalityKpi = modalityKeys.length
    ? modalityKeys.length
    : Object.keys(S.modalityDistribution || {}).length;
  const kpiUseBundled = !liveEvidence?.indexedCorpusAvailable && !liveEvidence?.live;
  const kpiPapers = liveEvidence?.totalPapers || EVIDENCE_TOTAL_PAPERS;
  const kpiTrials = liveEvidence?.totalTrials || EVIDENCE_TOTAL_TRIALS;
  const kpiMeta = liveEvidence?.totalMetaAnalyses || EVIDENCE_TOTAL_META;
  const kpis = [
    {
      val: fmtK(kpiPapers),
      label: 'Papers (index)',
      sub: kpiUseBundled ? 'Bundled corpus metadata' : 'Live aggregate when API connected',
      color: 'var(--teal)',
    },
    {
      val: fmtK(kpiTrials),
      label: 'Clinical Trials',
      sub: kpiUseBundled ? 'Bundled rollup' : 'From evidence index',
      color: 'var(--blue)',
    },
    {
      val: fmtK(kpiMeta),
      label: 'Meta-analyses',
      sub: kpiUseBundled ? 'Bundled rollup' : 'From research summary',
      color: 'var(--violet)',
    },
    {
      val: liveEvidence?.totalConditions || S.totalConditions,
      label: 'Conditions (registry)',
      sub: 'Registry scope — not a diagnosis list',
      color: 'var(--rose)',
    },
    {
      val: modalityKpi,
      label: 'Modalities tracked',
      sub: kpiUseBundled ? 'Bundled distribution' : 'Live modality distribution',
      color: 'var(--amber)',
    },
  ];
  let kpiHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:12px">';
  for (const k of kpis) {
    kpiHtml += `<div class="ch-card" style="text-align:center;padding:16px 12px">
      <div style="font-size:28px;font-weight:700;color:${k.color};font-variant-numeric:tabular-nums">${k.val}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${k.label}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;line-height:1.35">${esc(k.sub)}</div>
    </div>`;
  }
  kpiHtml += '</div>';
  kpiHtml +=
    '<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 18px;line-height:1.45">' +
    (kpiUseBundled
      ? 'These KPIs use bundled corpus metadata for orientation — not real-time database totals or verified primary counts.'
      : 'These KPIs reflect aggregated evidence-service counts when the indexed corpus and API are reachable.') +
    '</p>';

  /* sources strip */
  let srcHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">';
  for (const s of (liveEvidence?.sources?.length ? liveEvidence.sources : EVIDENCE_SOURCES)) {
    srcHtml += `<span style="padding:3px 10px;font-size:11px;border-radius:12px;background:var(--surface-2);color:var(--text-secondary)">${esc(s)}</span>`;
  }
  srcHtml += '</div>';

  /* Wearables ↔ biometrics evidence bridge (Studio wiring) */
  const wearBridge =
    '<div class="ch-card" style="padding:16px;margin-bottom:16px;border-left:3px solid var(--teal)">' +
    '<div style="font-weight:600;margin-bottom:8px">Wearables &amp; passive sensing</div>' +
    '<p style="font-size:13px;color:var(--text-secondary);margin:0 0 10px;line-height:1.5">' +
    'Patient <strong>Devices &amp; Wearables</strong> can surface ranked citations via the same evidence-intelligence layer as this dashboard ' +
    (liveEvidence?.indexedCorpusAvailable
      ? '(deterministic retrieval over the indexed corpus — <strong>' +
        fmt(liveEvidence.statusTotalPapers || liveEvidence.totalPapers) +
        '</strong> papers reported by <code style="font-size:11px">/api/v1/evidence/status</code> in this deployment). '
      : liveEvidence?.live
        ? '(deterministic retrieval over the indexed corpus — on the order of <strong>' +
          fmt(liveEvidence.totalPapers || EVIDENCE_TOTAL_PAPERS) +
          '</strong> papers when the live evidence database matches this aggregate). '
        : '(the <strong>' +
          fmt(EVIDENCE_TOTAL_PAPERS) +
          '</strong> figure is bundled corpus metadata for typical studio scale — not a live query result for this session). ') +
    'Biometric <em>correlation</em> readouts are associational evidence summaries only — not autonomous diagnosis or treatment guidance.' +
    '</p>' +
    (currentUser && currentUser.role === 'patient'
      ? '<button type="button" class="btn btn-ghost btn-sm" onclick="window._nav(\'patient-wearables\')">Open Devices &amp; Wearables</button>'
      : '<span style="font-size:12px;color:var(--text-tertiary)">Clinicians: review citations under patient wearable summaries in the clinical workspace.</span>') +
    '</div>';

  /* year distribution */
  const yd = S.yearDistribution;
  const ydMax = Math.max(...Object.values(yd));
  let yearHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Publication Year Distribution</div>';
  for (const [yr, cnt] of Object.entries(yd).sort(([a], [b]) => (a === 'pre-2020' ? -1 : b === 'pre-2020' ? 1 : a.localeCompare(b)))) {
    yearHtml += hBar(yr, cnt, ydMax, 'var(--teal)');
  }
  yearHtml += '</div>';

  /* evidence grade distribution */
  const gd = Object.keys(liveEvidence?.gradeDistribution || {}).length ? liveEvidence.gradeDistribution : S.gradeDistribution;
  const gdMax = Math.max(...Object.values(gd));
  let gradeHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Evidence Grade Distribution</div>' +
    '<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 12px;line-height:1.45">Grades summarize literature in this workspace (A–E scale). They require clinician review — see governance policy. They are not automatic prescription or treatment grades.</p>';
  for (const [g, cnt] of Object.entries(gd)) {
    gradeHtml += hBar('Grade ' + g, cnt, gdMax, GRADE_CLR[g] || 'var(--teal)');
  }
  gradeHtml += '</div>';

  /* modality distribution */
  const md = Object.keys(liveEvidence?.modalityDistribution || {}).length ? liveEvidence.modalityDistribution : S.modalityDistribution;
  const mdEntries = Object.entries(md).sort(([, a], [, b]) => b - a);
  const mdMax = mdEntries[0]?.[1] || 1;
  let modHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Top Modalities by Paper Count</div>';
  for (const [m, cnt] of mdEntries) {
    modHtml += hBar(m, cnt, mdMax, 'var(--violet)');
  }
  modHtml += '</div>';

  /* top conditions */
  const tcMax = top10[0]?.paperCount || 1;
  let tcHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Top 10 Conditions by Paper Count</div>';
  for (const c of top10) {
    const label = c.conditionId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    tcHtml += hBar(label, c.paperCount, tcMax, 'var(--blue)');
  }
  tcHtml += '</div>';

  let liveLinksHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Top Evidence Links</div>';
  const topLinks = Array.isArray(liveSummary?.top_evidence_links) ? liveSummary.top_evidence_links.slice(0, 8) : [];
  liveLinksHtml += topLinks.length
    ? topLinks.map((row) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600">${esc(_reNormalizeLabel(row.modality || 'Modality'))}${row.indication ? ' · ' + esc(_reNormalizeLabel(row.indication)) : ''}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(row.target || 'Target')} · ${fmt(row.paper_count || 0)} papers · ${fmt(row.citation_sum || 0)} citations</div>
      </div>`).join('')
    : '<div style="font-size:12px;color:var(--text-tertiary)">No live evidence-link rows available.</div>';
  liveLinksHtml += '</div>';

  let liveTemplateHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Top Protocol Templates</div>';
  const topTemplates = Array.isArray(liveSummary?.top_protocol_templates) ? liveSummary.top_protocol_templates.slice(0, 8) : [];
  liveTemplateHtml += topTemplates.length
    ? topTemplates.map((row) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600">${esc(_reNormalizeLabel(row.modality || 'Modality'))}${row.indication ? ' · ' + esc(_reNormalizeLabel(row.indication)) : ''}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(row.target || 'Target')} · ${fmt(row.paper_count || 0)} papers · support ${fmt(Math.round(row.template_support_score || 0))}</div>
      </div>`).join('')
    : '<div style="font-size:12px;color:var(--text-tertiary)">No live protocol-template rows available.</div>';
  liveTemplateHtml += '</div>';

  let liveSafetyHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Recent Safety Signals</div>';
  const recentSafety = Array.isArray(liveSummary?.recent_safety_signals) ? liveSummary.recent_safety_signals.slice(0, 8) : [];
  liveSafetyHtml += recentSafety.length
    ? recentSafety.map((row) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600">${esc(row.title || 'Safety signal')}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(_reNormalizeLabel(row.primary_modality || 'Modality'))}${row.year ? ' · ' + esc(row.year) : ''}${row.evidence_tier ? ' · tier ' + esc(row.evidence_tier) : ''}</div>
      </div>`).join('')
    : '<div style="font-size:12px;color:var(--text-tertiary)">No recent safety rows available.</div>';
  liveSafetyHtml += '</div>';

  /* Evidence Database one-click card — live counts from
     /api/v1/evidence/indications/summary; navigates to Indications tab. */
  const evidenceDbCardHtml = await _renderEvidenceDbCard();
  const terminalDeck = terminalSnapshot
    ? _reRenderTerminalMetricCards(terminalSnapshot) + _reRenderTerminalExplorer(terminalSnapshot)
    : '<div class="ch-card" style="padding:14px;margin-bottom:16px;border-left:3px solid var(--rose)"><div style="font-size:13px;font-weight:600;color:var(--rose);margin-bottom:6px">Neuromodulation Evidence Terminal unavailable</div><div style="font-size:12px;color:var(--text-secondary);line-height:1.55">The live terminal snapshot could not be loaded. Bundled orientation panels remain available below, but they are not authoritative search output.</div></div>';

  /* Neurofeedback disclosure banner */
  const nfDisclosureHtml = _neurofeedbackDisclosureHtml();

  /* Key 2024-2025 Findings panel */
  const keyRefsHtml = _renderKeyReferences2024_2025();

  /* Condition × Modality Heatmap */
  const heatmapHtml = _renderConditionModalityHeatmap(conditions, S);

  /* Trial Timeline */
  const timelineHtml = _renderTrialTimeline(S);

  /* two-column layout for charts */
  body.innerHTML =
    _resWorkspaceHeader(liveEvidence, { shortcuts: true }) +
    evidenceDbCardHtml +
    terminalDeck +
    kpiHtml + srcHtml + wearBridge +
    nfDisclosureHtml +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px">' +
    // merged from main: 90f0484e/bf505698 intent: live evidence-link, template, and safety panels
    yearHtml + gradeHtml + modHtml + tcHtml + liveLinksHtml + liveTemplateHtml + liveSafetyHtml +
    '</div>' +
    heatmapHtml +
    keyRefsHtml +
    timelineHtml +
    '<p style="font-size:11px;color:var(--text-tertiary);margin-top:12px">Grade and year distributions use bundled registry approximations when the live API is unavailable — use <strong>Live Indexed Evidence Search</strong> for verified primary literature retrieval.</p>';
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 2 — Conditions & Comorbidity
   ══════════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   FEATURE: Condition × Modality Heatmap
   ══════════════════════════════════════════════════════════════════════════════ */
function _renderConditionModalityHeatmap(conditions, S) {
  if (!conditions || conditions.length === 0) return '';

  // Modality column order (must align with MODALITY_CONDITION_EVIDENCE_MATRIX keys)
  const modalities = ['rTMS', 'tDCS', 'tACS', 'tRNS', 'NF'];
  const modalityLabels = { rTMS: 'rTMS', tDCS: 'tDCS', tACS: 'tACS', tRNS: 'tRNS', NF: 'Neurofeedback' };
  const modalityMatrixKeys = { rTMS: 'rTMS', tDCS: 'tDCS', tACS: 'tACS', tRNS: 'tRNS', NF: 'NF' };

  // Build a lookup from condition slug → matrix row
  const matrixMap = new Map();
  for (const row of MODALITY_CONDITION_EVIDENCE_MATRIX) {
    matrixMap.set(row.condition, row);
  }

  // Top conditions — try to use matrix-mapped conditions first, then fall back to registry
  const topConditions = MODALITY_CONDITION_EVIDENCE_MATRIX.slice(0, 12);

  // GRADE color from EVIDENCE_GRADES
  const _gradeBg = (grade) => {
    const g = String(grade || '').toUpperCase();
    return EVIDENCE_GRADES[g]?.color || 'transparent';
  };
  const _gradeLabel = (grade) => {
    const g = String(grade || '').toUpperCase();
    return EVIDENCE_GRADES[g]?.label || '\u2014';
  };

  let rows = '';
  for (const cond of topConditions) {
    let cells = '';
    for (const mod of modalities) {
      const mk = modalityMatrixKeys[mod] || mod;
      const cellData = cond[mk] || {};
      const grade = cellData.grade || 'D';
      const bg = _gradeBg(grade);
      const isNeg = grade === 'N';
      const fdaInd = _fdaIndicator(cellData.fda, cellData.fdaYear);
      const tooltip = _smdTooltip(grade, cellData.smd, cellData.ci, cellData.nStudies);
      const gradeLabel = _gradeLabel(grade);
      const textColor = isNeg ? '#fff' : (grade === 'A' || grade === 'B') ? '#0b1220' : '#0b1220';
      cells += `<td style="padding:6px 8px;text-align:center;border:1px solid var(--border-subtle);background:${bg};cursor:default;position:relative" title="${esc(tooltip)}">` +
        `<span style="font-weight:700;font-size:11px;color:${textColor}">${esc(grade)}</span>` +
        (fdaInd ? `<span style="margin-left:3px">${fdaInd}</span>` : '') +
        `<div style="font-size:9px;color:${textColor};opacity:0.85;margin-top:1px">${esc(gradeLabel)}</div>` +
        `</td>`;
    }
    rows += `<tr><td style="padding:6px 10px;font-size:12px;font-weight:600;color:var(--text-primary);border:1px solid var(--border-subtle);white-space:nowrap">${esc(cond.conditionLabel)}</td>${cells}</tr>`;
  }

  const headerCells = modalities.map(m =>
    `<th style="padding:6px 8px;font-size:11px;font-weight:700;color:var(--text-secondary);border:1px solid var(--border-subtle);text-align:center;min-width:72px">${esc(modalityLabels[m] || m)}</th>`
  ).join('');

  return (
    '<div class="ch-card" style="margin-top:16px;padding:16px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
    '<div style="font-size:14px;font-weight:700;color:var(--text-primary)">Condition × Modality Evidence Heatmap</div>' +
    '<span style="font-size:11px;color:var(--text-tertiary)">GRADE evidence level (A=Strong, N=Negative)</span>' +
    '</div>' +
    '<div style="overflow-x:auto">' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    '<thead><tr><th style="padding:6px 10px;font-size:11px;font-weight:700;color:var(--text-secondary);border:1px solid var(--border-subtle);text-align:left">Condition</th>' + headerCells + '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>' +
    '<div style="display:flex;align-items:center;gap:12px;margin-top:10px;font-size:11px;color:var(--text-tertiary);flex-wrap:wrap">' +
    '<span><strong>GRADE:</strong></span>' +
    '<span style="display:inline-block;width:12px;height:12px;background:#16a34a;border-radius:2px"></span> A Strong' +
    '<span style="display:inline-block;width:12px;height:12px;background:#3b82f6;border-radius:2px"></span> B Moderate' +
    '<span style="display:inline-block;width:12px;height:12px;background:#f59e0b;border-radius:2px"></span> C Limited' +
    '<span style="display:inline-block;width:12px;height:12px;background:#f97316;border-radius:2px"></span> D Emerging' +
    '<span style="display:inline-block;width:12px;height:12px;background:#ef4444;border-radius:2px"></span> N Negative' +
    '<span style="margin-left:8px">|</span>' +
    '<span style="font-size:11px;color:#fbbf16;font-weight:700">\u2605</span> FDA Approved' +
    '<span style="font-size:11px;color:#60a5fa;font-weight:700">\u25cf</span> FDA Cleared' +
    '</div>' +
    '<p style="font-size:11px;color:var(--text-tertiary);margin-top:8px">' +
    'Hover cells for pooled SMD / confidence intervals. \u2605=approved \u25cf=cleared. ' +
    'Evidence grades from 2024\u20132025 meta-analytic consensus. ' +
    '<em>Not a diagnosis or treatment recommendation.</em>' +
    '</p></div>'
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   FEATURE: Trial Timeline
   ══════════════════════════════════════════════════════════════════════════════ */
function _renderTrialTimeline(S) {
  const trials = S && S.trials ? S.trials.slice(0, 20) : [];
  if (trials.length === 0) return '';

  // Sort by year descending
  const sorted = [...trials].sort((a, b) => (b.year || 0) - (a.year || 0));

  let items = '';
  let lastYear = null;
  for (const t of sorted) {
    const year = t.year || 'Unknown';
    const yearLabel = year !== lastYear ? `<div style="font-size:11px;font-weight:700;color:var(--text-tertiary);margin:12px 0 4px;padding-left:28px;border-left:2px solid var(--border-subtle)">${year}</div>` : '';
    lastYear = year;
    const title = esc(t.brief_title || t.official_title || t.nct_id || 'Unnamed Trial');
    const phase = t.phase ? `<span class="lib-tag" style="margin-left:6px">${esc(t.phase)}</span>` : '';
    const status = t.overall_status ? `<span class="lib-tag" style="margin-left:4px;background:${t.overall_status === 'COMPLETED' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'};color:${t.overall_status === 'COMPLETED' ? 'var(--emerald)' : 'var(--amber)'}">${esc(t.overall_status)}</span>` : '';
    const condition = t.condition ? `<span style="font-size:11px;color:var(--text-secondary)">${esc(t.condition)}</span>` : '';
    items += yearLabel +
      '<div style="display:flex;align-items:flex-start;gap:10px;padding:6px 0 6px 28px;border-left:2px solid var(--border-subtle);position:relative">' +
      '<div style="position:absolute;left:-5px;top:10px;width:8px;height:8px;border-radius:50%;background:var(--teal);border:2px solid var(--bg-primary)"></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + title + '">' + title + phase + status + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:2px">' + condition +
      (t.enrollment ? `<span style="font-size:11px;color:var(--text-tertiary)">${fmt(t.enrollment)} enrolled</span>` : '') +
      '</div></div></div>';
  }

  return (
    '<div class="ch-card" style="margin-top:16px;padding:16px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
    '<div style="font-size:14px;font-weight:700;color:var(--text-primary)">Clinical Trial Timeline</div>' +
    '<span style="font-size:11px;color:var(--text-tertiary)">Latest 20 trials from registry</span>' +
    '</div>' +
    items +
    '<p style="font-size:11px;color:var(--text-tertiary);margin-top:12px">' +
    '<em>Trial statuses and enrollment are sourced from ClinicalTrials.gov and registry bundles. Verify current status at clinicaltrials.gov before citing.</em>' +
    '</p></div>'
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   FEATURE: Saved Searches
   ══════════════════════════════════════════════════════════════════════════════ */
function _renderSavedSearches() {
  const saved = JSON.parse(localStorage.getItem('_reSavedSearches') || '[]');
  if (!saved.length) return '';

  const items = saved.map((s, i) =>
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-subtle)">' +
    '<div style="font-size:12px;color:var(--text-primary);cursor:pointer" onclick="window._reLoadSavedSearch(' + i + ')" title="Click to rerun this search">' +
    '<strong>' + esc(s.q || '(empty query)') + '</strong>' +
    (s.indication ? ' · <span style="color:var(--text-secondary)">' + esc(s.indication) + '</span>' : '') +
    (s.grade ? ' · Grade ' + esc(s.grade) : '') +
    '</div>' +
    '<div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">' + esc(s.date || '') +
    ' <button onclick="window._reDeleteSavedSearch(' + i + ')" style="background:none;border:none;color:var(--rose);cursor:pointer;font-size:11px;margin-left:8px" title="Remove">×</button></div>' +
    '</div>'
  ).join('');

  return (
    '<div class="ch-card" style="margin-top:16px;padding:16px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
    '<div style="font-size:14px;font-weight:700;color:var(--text-primary)">Saved Searches</div>' +
    '<button class="btn btn-sm btn-ghost" onclick="window._reClearSavedSearches()">Clear All</button>' +
    '</div>' + items + '</div>'
  );
}

window._reSaveSearchFromUI = function() {
  const q = document.getElementById('lib-ext-q')?.value || '';
  const source = document.getElementById('re-ev-search-source')?.value || '';
  const grade = document.getElementById('re-ev-filter-grade')?.value || '';
  const oaOnly = document.getElementById('re-ev-oa-only')?.checked || false;
  window._reSaveSearch(q, source, grade, oaOnly);
  // Refresh saved searches panel
  const panel = document.getElementById('re-ev-saved-searches');
  if (panel) panel.innerHTML = _renderSavedSearches();
  // Show brief confirmation
  const btn = event?.target;
  if (btn) { btn.textContent = 'Saved!'; setTimeout(() => btn.textContent = 'Save', 1500); }
};

window._reSaveSearch = function(q, indication, grade, oaOnly) {
  const saved = JSON.parse(localStorage.getItem('_reSavedSearches') || '[]');
  const entry = { q, indication, grade, oa_only: oaOnly, date: new Date().toLocaleString() };
  // Don't duplicate exact same search
  const dupIndex = saved.findIndex(s => s.q === q && s.indication === indication && s.grade === grade);
  if (dupIndex >= 0) saved.splice(dupIndex, 1);
  saved.unshift(entry);
  if (saved.length > 20) saved.pop(); // keep last 20
  localStorage.setItem('_reSavedSearches', JSON.stringify(saved));
};

window._reLoadSavedSearch = function(index) {
  const saved = JSON.parse(localStorage.getItem('_reSavedSearches') || '[]');
  const s = saved[index]; if (!s) return;
  window._reSearchQ = s.q || '';
  window._reSearchIndication = s.indication || '';
  window._reSearchGrade = s.grade || '';
  window._reSearchOA = s.oa_only || false;
  // Trigger search refresh
  const evt = new Event('_reRerunSearch');
  window.dispatchEvent(evt);
};

window._reDeleteSavedSearch = function(index) {
  const saved = JSON.parse(localStorage.getItem('_reSavedSearches') || '[]');
  saved.splice(index, 1);
  localStorage.setItem('_reSavedSearches', JSON.stringify(saved));
  // Refresh UI
  const evt = new Event('_reRefreshSavedSearches');
  window.dispatchEvent(evt);
};

window._reClearSavedSearches = function() {
  localStorage.removeItem('_reSavedSearches');
  const evt = new Event('_reRefreshSavedSearches');
  window.dispatchEvent(evt);
};

// Event listeners for saved search refresh
window.addEventListener('_reRefreshSavedSearches', function() {
  const panel = document.getElementById('re-ev-saved-searches');
  if (panel) panel.innerHTML = _renderSavedSearches();
});
window.addEventListener('_reRerunSearch', function() {
  // Refresh search inputs from saved search state
  const qEl = document.getElementById('lib-ext-q');
  if (qEl && window._reSearchQ !== undefined) qEl.value = window._reSearchQ;
  const indEl = document.getElementById('re-ev-search-source');
  if (indEl && window._reSearchIndication !== undefined) indEl.value = window._reSearchIndication;
  const gradeEl = document.getElementById('re-ev-filter-grade');
  if (gradeEl && window._reSearchGrade !== undefined) gradeEl.value = window._reSearchGrade;
  const oaEl = document.getElementById('re-ev-oa-only');
  if (oaEl && window._reSearchOA !== undefined) oaEl.checked = window._reSearchOA;
  // Trigger search
  window._libUnifiedEvidenceSearch();
});

async function renderConditions(body, q, filt, sort, sInput, pills, sortBtn) {
  const cats = ['All', 'Mood', 'Anxiety', 'OCD Spectrum', 'Trauma', 'ADHD', 'Autism',
    'Pain', 'Sleep', 'Neurological', 'Substance', 'Eating', 'Comorbid', 'Other'];

  let liveRows = [];
  try {
    liveRows = await api.listResearchConditions();
  } catch {}

  /* merge live condition rows + registry metadata, fallback to static */
  let rows = liveRows.length ? liveRows.map((row) => {
    const reg = _regLookup(row.condition_slug) || _regLookup(row.condition_label || '');
    const topSafety = Array.isArray(row.top_safety_signals) ? row.top_safety_signals : [];
    return {
      conditionId: row.condition_slug,
      name: row.condition_label || row.condition_slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      icd10: reg?.icd10 || '',
      cat: reg?.cat || (row.condition_slug.includes('comorbid') ? 'Comorbid' : 'Other'),
      ev: reg?.ev || '',
      paperCount: Number(row.research_paper_count || 0),
      rctCount: 0,
      metaAnalysisCount: 0,
      systematicReviewCount: 0,
      topJournals: [],
      priorityModalities: Array.isArray(row.priority_modalities) ? row.priority_modalities : [],
      topSafetySignals: topSafety,
      live: true,
    };
  }) : CONDITION_EVIDENCE.map(ev => {
    const reg = _regLookup(ev.conditionId);
    return {
      ...ev,
      name: reg?.name || ev.conditionId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      icd10: reg?.icd10 || '',
      cat: reg?.cat || (ev.conditionId.includes('comorbid') ? 'Comorbid' : 'Other'),
      ev: reg?.ev || '',
      live: false,
    };
  });

  /* filter by category */
  if (filt !== 'All') {
    if (filt === 'Comorbid') rows = rows.filter(r => r.conditionId.includes('comorbid'));
    else rows = rows.filter(r => r.cat === filt);
  }

  /* search */
  if (q) rows = rows.filter(r => (r.name + ' ' + r.icd10 + ' ' + r.cat + ' ' + r.conditionId).toLowerCase().includes(q));

  /* sort */
  if (sort === 'papers')   rows.sort((a, b) => b.paperCount - a.paperCount);
  else if (sort === 'rcts') rows.sort((a, b) => (b.rctCount || 0) - (a.rctCount || 0));
  else if (sort === 'meta') rows.sort((a, b) => (b.metaAnalysisCount || 0) - (a.metaAnalysisCount || 0));
  else if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));

  const expandedRows = rows.filter((r) => window._reExpand[r.conditionId]).slice(0, 8);
  const expandedDetails = new Map(
    await Promise.all(expandedRows.map(async (r) => [r.conditionId, await _ensureResearchConditionDetail(r.conditionId)]))
  );

  /* toolbar */
  let html = _resWorkspaceHeader(_liveEvidenceUiStats) +
    '<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 12px;line-height:1.45">Expand rows for registry context; use Live Indexed Evidence Search for verified primary citations.</p>' +
    `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">
    ${sInput('Search conditions...')}
    <div style="display:flex;flex-wrap:wrap;gap:4px">${pills(cats, filt)}</div>
  </div>`;

  /* sort buttons */
  html += `<div style="display:flex;gap:6px;margin-bottom:12px;align-items:center">
    <span style="font-size:11px;color:var(--text-tertiary)">Sort:</span>
    ${sortBtn('papers', 'Papers')}${sortBtn('rcts', 'RCTs')}${sortBtn('meta', 'Meta')}${sortBtn('name', 'A-Z')}
  </div>`;

  /* table */
  html += '<div class="ch-card" style="overflow-x:auto;padding:0">';
  html += '<table style="width:100%;font-size:12px;border-collapse:collapse">';
  html += '<thead><tr style="text-align:left;color:var(--text-tertiary);background:var(--surface-2)"><th style="padding:8px">Condition</th><th style="padding:8px">ICD-10</th><th style="padding:8px">Category</th><th style="padding:8px;text-align:right">Papers</th><th style="padding:8px;text-align:right">RCTs</th><th style="padding:8px;text-align:right">Meta</th><th style="padding:8px;text-align:right">SR</th><th style="padding:8px">Grade</th><th style="padding:8px">Top Journal</th></tr></thead><tbody>';

  for (const r of rows) {
    const expanded = window._reExpand[r.conditionId];
    const gradeBg = GRADE_CLR[r.ev] || 'var(--surface-2)';
    html += `<tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''" onclick="window._reExpand['${esc(r.conditionId)}']=!window._reExpand['${esc(r.conditionId)}'];window._nav('research-evidence')">
      <td style="padding:8px;font-weight:500">${esc(r.name)} ${expanded ? '▾' : '▸'}</td>
      <td style="padding:8px;color:var(--text-tertiary)">${esc(r.icd10)}</td>
      <td style="padding:8px"><span style="padding:2px 8px;font-size:10px;border-radius:8px;background:var(--surface-2);color:var(--text-secondary)">${esc(r.cat)}</span></td>
      <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fmt(r.paperCount)}</td>
      <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums">${fmt(r.rctCount || 0)}</td>
      <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums">${fmt(r.metaAnalysisCount || 0)}</td>
      <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums">${fmt(r.systematicReviewCount || 0)}</td>
      <td style="padding:8px"><span style="display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;border-radius:8px;background:${gradeBg};color:#fff">${esc(r.ev || '—')}</span></td>
      <td style="padding:8px;font-size:11px;color:var(--text-tertiary)">${esc((r.topJournals || [])[0] || '')}</td>
    </tr>`;

    const detail = expanded ? expandedDetails.get(r.conditionId) : null;
    if (expanded && detail) {
      const stats = detail.research_stats || {};
      const topModalities = Array.isArray(stats.modalities) ? stats.modalities.slice(0, 4) : [];
      const topStudies = Array.isArray(stats.study_types) ? stats.study_types.slice(0, 4) : [];
      const repPapers = Array.isArray(detail.representative_papers) ? detail.representative_papers.slice(0, 5) : [];
      const safety = Array.isArray(detail.safety_signals) ? detail.safety_signals.slice(0, 4) : [];
      const protocolNotes = Array.isArray(detail.protocol_personalization_notes) ? detail.protocol_personalization_notes.slice(0, 3) : [];
      html += `<tr><td colspan="9" style="padding:0 8px 12px 24px;background:var(--surface-1,var(--bg))">
        <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5;margin:8px 0">
          Live registry context. Use <button type="button" class="btn btn-ghost btn-xs" onclick="window._resEvidenceTab='search';window._nav('research-evidence')">Live Indexed Evidence Search</button>
          for verified primary citations — links and identifiers below render only when returned by the API.
        </div>
        <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin:8px 0 10px">Live Condition Detail</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:10px">
          <div style="padding:10px;border:1px solid var(--border);border-radius:8px">
            <div style="font-size:10px;color:var(--text-tertiary)">Research stats</div>
            <div style="font-size:12px;margin-top:4px">${fmt(stats.total_papers || 0)} papers · ${fmt(stats.open_access_papers || 0)} OA · ${esc(stats.year_min || '—')}–${esc(stats.year_max || '—')}</div>
          </div>
          <div style="padding:10px;border:1px solid var(--border);border-radius:8px">
            <div style="font-size:10px;color:var(--text-tertiary)">Top modalities</div>
            <div style="font-size:12px;margin-top:4px">${topModalities.map((m) => `${esc(_reNormalizeLabel(m.label || ''))} (${fmt(m.count || 0)})`).join(' · ') || '—'}</div>
          </div>
          <div style="padding:10px;border:1px solid var(--border);border-radius:8px">
            <div style="font-size:10px;color:var(--text-tertiary)">Top study types</div>
            <div style="font-size:12px;margin-top:4px">${topStudies.map((s) => `${esc(_reNormalizeLabel(s.label || ''))} (${fmt(s.count || 0)})`).join(' · ') || '—'}</div>
          </div>
          <div style="padding:10px;border:1px solid var(--border);border-radius:8px">
            <div style="font-size:10px;color:var(--text-tertiary)">Safety signals</div>
            <div style="font-size:12px;margin-top:4px">${safety.map((s) => `${esc(_reNormalizeLabel(s.signal || ''))} (${fmt(s.count || 0)})`).join(' · ') || '—'}</div>
          </div>
        </div>`;
      if (protocolNotes.length) {
        html += `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px">${protocolNotes.map(esc).join(' · ')}</div>`;
      }
      html += `<div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin:8px 0 6px">Representative Papers (${repPapers.length})</div>`;
      for (const p of repPapers) {
        html += `<div style="padding:6px 0;border-bottom:1px solid var(--border-light,var(--border))">
          <div style="font-size:12px;font-weight:500">${esc(p.title)}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${p.year ? esc(p.year) + ' · ' : ''}${p.journal ? '<em>' + esc(p.journal) + '</em> · ' : ''}${p.study_type ? esc(_reNormalizeLabel(p.study_type)) + ' · ' : ''}${p.citation_count != null ? fmt(p.citation_count) + ' citations' : ''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
            ${p.record_url ? `<a href="${esc(p.record_url)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal)">Record ↗</a>` : ''}
            ${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal)">DOI</a>` : ''}
            ${p.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal)">PubMed</a>` : ''}
          </div>
        </div>`;
      }
      html += '</td></tr>';
    } else if (expanded && r.recentHighImpact?.length) {
      html += `<tr><td colspan="9" style="padding:0 8px 12px 24px;background:var(--surface-1,var(--bg))">
        <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin:8px 0 6px">Recent High-Impact Papers (${r.recentHighImpact.length})</div>`;
      for (const p of r.recentHighImpact) {
        html += `<div style="padding:6px 0;border-bottom:1px solid var(--border-light,var(--border))">
          <div style="font-size:12px;font-weight:500">${esc(p.title)}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(p.authors)} &middot; ${p.year} &middot; <em>${esc(p.journal)}</em> &middot; ${fmt(p.citations)} citations</div>
          ${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal)">DOI: ${esc(p.doi)}</a>` : ''}
        </div>`;
      }
      html += '</td></tr>';
    }
  }

  html += '</tbody></table></div>';
  html += `<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Showing ${rows.length} of ${(liveRows.length || CONDITION_EVIDENCE.length)} conditions</div>`;
  body.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 3 — Assessments & Scales
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderAssessments(body, q, filt, sInput, pills) {
  const domains = ['All', ...new Set(ASSESSMENT_REGISTRY.map(a => a.domain).filter(Boolean))];

  let rows = [...ASSESSMENT_REGISTRY];
  if (filt !== 'All') rows = rows.filter(a => a.domain === filt);
  if (q) rows = rows.filter(a => (a.name + ' ' + a.id + ' ' + a.domain + ' ' + (a.conditions || []).join(' ')).toLowerCase().includes(q));

  const expandedRows = rows.filter((a) => window._reExpand['a_' + a.id]).slice(0, 8);
  const assessmentEvidence = new Map(
    await Promise.all(expandedRows.map(async (a) => {
      const indication = Array.isArray(a.conditions) && a.conditions.length ? a.conditions[0] : undefined;
      const [papersRes, graphRes] = await Promise.allSettled([
        api.searchResearchPapers?.({
          q: a.name,
          indication,
          ranking_mode: 'clinical',
          limit: 4,
        }),
        api.listResearchEvidenceGraph?.({
          indication,
          limit: 4,
        }),
      ]);
      return [a.id, {
        papers: papersRes.status === 'fulfilled' && Array.isArray(papersRes.value) ? papersRes.value : [],
        graph: graphRes.status === 'fulfilled' && Array.isArray(graphRes.value) ? graphRes.value : [],
      }];
    }))
  );

  /* toolbar */
  let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px">
    ${sInput('Search assessments...')}
    <div style="display:flex;flex-wrap:wrap;gap:4px">${pills(domains, filt)}</div>
  </div>`;

  /* card grid */
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">';
  for (const a of rows) {
    const condCount = (a.conditions || []).length;
    const expanded = window._reExpand['a_' + a.id];
    const evBg = GRADE_CLR[a.ev] || 'var(--surface-2)';
    html += `<div class="ch-card" style="padding:14px;cursor:pointer" onclick="window._reExpand['a_${esc(a.id)}']=!window._reExpand['a_${esc(a.id)}'];window._nav('research-evidence')">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
        <div style="font-weight:600;font-size:14px">${esc(a.name)}</div>
        <span style="padding:2px 8px;font-size:10px;font-weight:700;border-radius:8px;background:${evBg};color:#fff">${esc(a.ev || '—')}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
        <span style="padding:2px 8px;font-size:10px;border-radius:8px;background:var(--violet);color:#fff">${esc(a.domain)}</span>
        <span style="padding:2px 8px;font-size:10px;border-radius:8px;background:var(--surface-2);color:var(--text-secondary)">${esc(a.type)}</span>
      </div>
      <div style="display:flex;gap:16px;font-size:11px;color:var(--text-tertiary)">
        <span>${a.items} items</span>
        <span>${a.mins} min</span>
        <span>${condCount} condition${condCount !== 1 ? 's' : ''}</span>
        ${a.freq ? `<span>${esc(a.freq)}</span>` : ''}
      </div>`;

    if (expanded) {
      const live = assessmentEvidence.get(a.id) || { papers: [], graph: [] };
      html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:12px">`;
      if (a.scoring) html += `<div style="margin-bottom:6px"><strong>Scoring:</strong> ${esc(a.scoring)}</div>`;
      if (a.conditions?.length) {
        html += `<div style="margin-bottom:6px"><strong>Linked Conditions:</strong></div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">`;
        for (const cid of a.conditions) {
          const cReg = CONDITION_REGISTRY.find(c => c.id === cid);
          html += `<span style="padding:2px 8px;font-size:10px;border-radius:8px;background:var(--surface-2);color:var(--text-secondary)">${esc(cReg?.name || cid)}</span>`;
        }
        html += '</div>';
      }
      if (a.link) html += `<div style="margin-top:6px"><a href="${esc(a.link)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--teal)">Reference &rarr;</a></div>`;
      if (live.graph.length) {
        html += `<div style="margin-top:10px"><strong>Live Live Evidence Graph Links:</strong></div>`;
        html += live.graph.map((row) => `<div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">${esc(_reNormalizeLabel(row.modality || 'Modality'))}${row.indication ? ' · ' + esc(_reNormalizeLabel(row.indication)) : ''}${row.target ? ' · ' + esc(row.target) : ''}${row.paper_count != null ? ' · ' + fmt(row.paper_count) + ' papers' : ''}</div>`).join('');
      }
      if (live.papers.length) {
        html += `<div style="margin-top:10px"><strong>Live Papers:</strong></div>`;
        html += live.papers.map((p) => `<div style="padding:8px 0;border-bottom:1px solid var(--border-light,var(--border))">
          <div style="font-size:12px;font-weight:500">${esc(p.title || '(untitled)')}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(p.authors || '')}${p.year ? ' · ' + esc(p.year) : ''}${p.journal ? ' · ' + '<em>' + esc(p.journal) + '</em>' : ''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px">
            ${p.record_url ? `<a href="${esc(p.record_url)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal)">Open</a>` : ''}
            ${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal)">DOI</a>` : ''}
            ${p.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal)">PubMed</a>` : ''}
          </div>
        </div>`).join('');
      }
      html += '</div>';
    }

    html += '</div>';
  }
  html += '</div>';
  html += `<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Showing ${rows.length} of ${ASSESSMENT_REGISTRY.length} assessments</div>`;
  body.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 4 — Protocols & Devices
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderProtocols(body, q, sInput) {
  await _ensureResearchBundleData();
  const protoSourceNote = _researchBundleState.loaded
    ? '<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 12px;line-height:1.45"><span style="padding:2px 8px;border-radius:999px;background:rgba(45,212,191,0.12);color:var(--teal);font-size:10px;font-weight:700;margin-right:8px">Live bundle</span>Protocol templates, coverage, safety, and evidence-graph rows below are served from the neuromodulation research API when available.</p>'
    : '<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 12px;line-height:1.45"><span style="padding:2px 8px;border-radius:999px;background:var(--surface-2);font-size:10px;font-weight:700;margin-right:8px">Registry fallback</span>Templates and devices use bundled registry data — live coverage/safety panels appear only when the research bundle API returns rows.</p>';
  // merged from main: bf505698 intent: live FDA device fetch for Devices section
  let liveDevices = [];
  try {
    liveDevices = await api.searchEvidenceDevices?.({ limit: 60 });
  } catch {}
  let html = _resWorkspaceHeader(_liveEvidenceUiStats) + protoSourceNote + sInput('Search protocols, devices, modalities...') + '<div style="margin-bottom:16px"></div>';

  /* ── Section A: Protocol Templates ────────────────────────────────────────── */
  const liveProtoRows = _researchBundleState.loaded
    ? (_researchBundleState.exactProtocols.length ? _researchBundleState.exactProtocols : _researchBundleState.templates).map((row, idx) => ({
        id: row.id || `live-proto-${idx}`,
        name: row.name || [row.modality, row.indication, row.target].filter(Boolean).join(' — ') || 'Live protocol template',
        condition: _reNormalizeLabel(row.indication || row.condition || row.condition_label || ''),
        modality: _reNormalizeLabel(row.modality || row.primary_modality || ''),
        target: row.target || row.target_label || row.region || '',
        freq: row.freq || row.frequency || row.top_parameter_tags || row.example_titles || 'Live parameters available',
        intensity: row.intensity || row.intensity_range || row.top_parameter_tags || 'See evidence row',
        sessions: Number(row.paper_count || row.session_count || row.example_count || 0),
        ev: String(row.evidence_tier || row.evidence_grade || row.grade || '').replace(/^EV-?/i, '').toUpperCase() || 'B',
        onLabel: row.on_label ?? row.is_on_label ?? false,
      }))
    : [];
  let protos = liveProtoRows.length ? liveProtoRows : [...PROTOCOL_REGISTRY];
  if (q) protos = protos.filter(p => (p.name + ' ' + p.condition + ' ' + p.modality + ' ' + p.target).toLowerCase().includes(q));

  html += '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><div style="font-weight:600;font-size:14px">Protocol Templates (' + protos.length + ')</div>' +
    (_researchBundleState.loaded
      ? '<span style="font-size:11px;color:var(--text-tertiary)">Live research bundle templates and exact protocols</span>'
      : '<span style="font-size:11px;color:var(--text-tertiary)">Registry fallback</span>') +
    '</div>';
  html += '<div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse">';
  html += '<thead><tr style="text-align:left;color:var(--text-tertiary);background:var(--surface-2)"><th style="padding:6px 8px">Protocol</th><th style="padding:6px 8px">Condition</th><th style="padding:6px 8px">Modality</th><th style="padding:6px 8px">Target</th><th style="padding:6px 8px">Frequency</th><th style="padding:6px 8px">Intensity</th><th style="padding:6px 8px;text-align:right">Sessions</th><th style="padding:6px 8px">Evidence</th><th style="padding:6px 8px">Label</th></tr></thead><tbody>';
  for (const p of protos) {
    const evBg = GRADE_CLR[p.ev] || 'var(--surface-2)';
    html += `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px;font-weight:500">${esc(p.name)}</td>
      <td style="padding:6px 8px">${esc(p.condition)}</td>
      <td style="padding:6px 8px"><span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--violet);color:#fff">${esc(p.modality)}</span></td>
      <td style="padding:6px 8px;font-family:monospace;font-size:11px">${esc(p.target)}</td>
      <td style="padding:6px 8px;font-size:11px">${esc(p.freq)}</td>
      <td style="padding:6px 8px;font-size:11px">${esc(p.intensity)}</td>
      <td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums">${p.sessions}</td>
      <td style="padding:6px 8px"><span style="padding:2px 8px;font-size:10px;font-weight:700;border-radius:8px;background:${evBg};color:#fff">${esc(p.ev)}</span></td>
      <td style="padding:6px 8px">${p.onLabel ? '<span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--teal);color:#fff">On-label</span>' : '<span style="font-size:10px;color:var(--text-tertiary)">Off-label</span>'}</td>
    </tr>`;
  }
  html += '</tbody></table></div></div>';

  /* ── Section B: Devices ───────────────────────────────────────────────────── */
  let devs = (Array.isArray(liveDevices) && liveDevices.length)
    ? liveDevices.map((d, idx) => ({
        id: `live-device-${idx}`,
        name: d.trade_name || d.applicant || d.number || 'Indexed device',
        mfr: d.applicant || 'Indexed evidence DB',
        modality: d.kind ? d.kind.toUpperCase() : 'FDA',
        type: d.product_code || d.kind || 'device',
        clearance: d.kind ? `FDA ${String(d.kind).toUpperCase()}` : 'FDA',
        homeClinic: d.number || '',
        region: d.decision_date || '',
        indication: d.number || '',
        notes: d.decision_date ? `Decision date ${d.decision_date}` : '',
      }))
    : [...DEVICE_REGISTRY];
  if (q) devs = devs.filter(d => (d.name + ' ' + d.mfr + ' ' + d.modality + ' ' + d.indication + ' ' + (d.type || '')).toLowerCase().includes(q));

  html += '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Devices (' + devs.length + ')</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">';
  for (const d of devs) {
    html += `<div style="border:1px solid var(--border);border-radius:8px;padding:12px">
      <div style="font-weight:600;font-size:13px;margin-bottom:4px">${esc(d.name)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">${esc(d.mfr)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        <span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--violet);color:#fff">${esc(d.modality)}</span>
        <span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--surface-2);color:var(--text-secondary)">${esc(d.type)}</span>
        <span style="padding:2px 6px;font-size:10px;border-radius:6px;background:${d.clearance?.includes('FDA') ? 'var(--teal)' : 'var(--amber)'};color:#fff">${esc(d.clearance)}</span>
        <span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--surface-2);color:var(--text-secondary)">${esc(d.homeClinic || d.region)}</span>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:6px"><strong>Indication:</strong> ${esc(d.indication)}</div>
      ${d.notes ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">${esc(d.notes)}</div>` : ''}
    </div>`;
  }
  html += '</div></div>';

  /* ── Section C: Modality Overview ─────────────────────────────────────────── */
  const md = Object.keys(_liveEvidenceUiStats?.modalityDistribution || {}).length
    ? _liveEvidenceUiStats.modalityDistribution
    : EVIDENCE_SUMMARY.modalityDistribution;
  const mdEntries = Object.entries(md).sort(([, a], [, b]) => b - a);
  const mdMax = mdEntries[0]?.[1] || 1;
  html += '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Modality Research Volume</div>';
  for (const [m, cnt] of mdEntries) {
    html += hBar(m, cnt, mdMax, 'var(--green)');
  }
  html += '</div>';

  if (_researchBundleState.loaded && (_researchBundleState.coverageRows.length || _researchBundleState.safetySignals.length || _researchBundleState.evidenceGraph.length)) {
    const coverageRows = _researchBundleState.coverageRows
      .filter((row) => !q || ([
        row.condition,
        row.modality,
        row.gap,
        row.primary_target,
      ].join(' ').toLowerCase().includes(q)))
      .slice(0, 10);
    const safetyRows = _researchBundleState.safetySignals
      .filter((row) => !q || ([
        row.primary_modality,
        ...(row.indication_tags || []),
        ...(row.safety_signal_tags || []),
        ...(row.contraindication_signal_tags || []),
      ].join(' ').toLowerCase().includes(q)))
      .slice(0, 6);
    const graphRows = _researchBundleState.evidenceGraph
      .filter((row) => !q || ([
        row.target,
        row.modality,
        row.indication,
      ].join(' ').toLowerCase().includes(q)))
      .slice(0, 6);

    html += '<p style="font-size:11px;color:var(--text-tertiary);margin:12px 0;line-height:1.45">Panels below are <strong>live bundle</strong> slices from the API — not static registry cards.</p>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">';
    html += '<div class="ch-card" style="padding:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Live Coverage Watch</div>' +
      (coverageRows.length
        ? coverageRows.map((row) => {
            const gapColor = row.gap && row.gap !== 'None' ? 'var(--amber)' : 'var(--teal)';
            return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
                <div style="font-size:12px;font-weight:600">${esc(_reNormalizeLabel(row.modality))} — ${esc(_reNormalizeLabel(row.condition))}</div>
                <span style="padding:2px 8px;font-size:10px;border-radius:999px;background:${gapColor}22;color:${gapColor};border:1px solid ${gapColor}55">${esc(row.gap || 'Covered')}</span>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${fmt(row.paper_count || 0)} papers · coverage ${esc(row.coverage ?? 0)}%${row.primary_target ? ' · target ' + esc(row.primary_target) : ''}</div>
            </div>`;
          }).join('')
        : '<div style="font-size:12px;color:var(--text-tertiary)">No live coverage rows available.</div>') +
      '</div>';
    html += '<div class="ch-card" style="padding:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Live Safety Signals</div>' +
      (safetyRows.length
        ? safetyRows.map((row) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:12px;font-weight:600">${esc(_reNormalizeLabel(row.primary_modality || 'Modality'))}${row.indication_tags?.length ? ' · ' + esc(row.indication_tags.slice(0, 2).join(' · ')) : ''}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(_reSignalTitle(row))}</div>
          </div>`).join('')
        : '<div style="font-size:12px;color:var(--text-tertiary)">No live safety signals available.</div>') +
      '</div>';
    html += '<div class="ch-card" style="padding:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Evidence relationship summary (bundle)</div>' +
      (graphRows.length
        ? graphRows.map((row) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:12px;font-weight:600">${esc(_reNormalizeLabel(row.modality || 'Modality'))}${row.indication ? ' · ' + esc(_reNormalizeLabel(row.indication)) : ''}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(row.target || row.target_label || 'Target link')}${row.paper_count != null ? ' · ' + fmt(row.paper_count) + ' papers' : ''}${row.citation_sum != null ? ' · ' + fmt(row.citation_sum) + ' citations' : ''}${row.year_min || row.year_max ? ' · ' + esc(row.year_min || '—') + '–' + esc(row.year_max || '—') : ''}</div>
          </div>`).join('')
        : '<div style="font-size:12px;color:var(--text-tertiary)">No live evidence-graph rows available.</div>') +
      '</div>';
    html += '</div>';
  }

  body.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 5 — Brain Targets & Biomarkers
   ══════════════════════════════════════════════════════════════════════════════ */
function renderAdjunctEvidenceSection(q, { standalone = false } = {}) {
  const adjunctSummary = _researchBundleState.adjunctSummary || {};
  const adjunctReviewTables = _researchBundleState.adjunctReviewTables || {};
  const reviewConditions = Array.isArray(adjunctReviewTables.conditions)
    ? adjunctReviewTables.conditions.filter((row) => Array.isArray(row.rows) && row.rows.length)
    : [];
  const adjunctRows = (_researchBundleState.adjunctPapers || [])
    .filter((row) => !q || ([
      row.title,
      row.journal,
      row.primary_modality,
      ...(row.adjunct_topic_labels || []),
      ...(row.adjunct_terms || []),
      ...(row.indication_tags || []),
    ].join(' ').toLowerCase().includes(q)))
    .slice(0, standalone ? 12 : 8);

  let html = '';
  if (standalone) {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:16px">';
    html += `<div class="ch-card" style="padding:16px">
      <div style="font-size:24px;font-weight:700;color:var(--teal)">${fmt(adjunctSummary.paper_count || 0)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Adjunct Evidence Papers</div>
    </div>`;
    html += `<div class="ch-card" style="padding:16px">
      <div style="font-size:24px;font-weight:700;color:var(--blue)">${fmt((adjunctSummary.top_domains || []).length || 0)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Evidence Domains</div>
    </div>`;
    html += `<div class="ch-card" style="padding:16px">
      <div style="font-size:24px;font-weight:700;color:var(--violet)">${fmt(reviewConditions.length)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Condition Review Tables</div>
    </div>`;
    html += '</div>';
  }

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:16px">';
  html += `<div class="ch-card" style="padding:16px">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px">
      <div style="font-weight:600;font-size:14px">Adjunct Evidence Slice</div>
      <span style="padding:2px 8px;font-size:10px;border-radius:999px;background:var(--rose);color:#fff">${fmt(adjunctSummary.paper_count || 0)} papers</span>
    </div>
    <div style="font-size:11px;color:var(--text-tertiary)">Includes medications, blood tests, biomarkers, supplements, vitamins, and diet papers that can act as neuromodulation confounders or response modifiers.</div>
  </div>`;
  html += `<div class="ch-card" style="padding:16px">
    <div style="font-weight:600;font-size:14px;margin-bottom:10px">Top Topics</div>
    ${(adjunctSummary.top_topics || []).slice(0, standalone ? 8 : 6).map((row) => `<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div style="font-size:12px;font-weight:600">${esc(row.key)}</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">${fmt(row.count)} linked papers</div></div>`).join('') || '<div style="font-size:12px;color:var(--text-tertiary)">No topic summaries available.</div>'}
  </div>`;
  html += `<div class="ch-card" style="padding:16px">
    <div style="font-weight:600;font-size:14px;margin-bottom:10px">Example Papers</div>
    ${adjunctRows.length
      ? adjunctRows.map((row) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;font-weight:600">${esc(row.title || 'Untitled paper')}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc((row.adjunct_topic_labels || []).slice(0, 3).join(' · ') || (row.adjunct_terms || []).slice(0, 3).join(' · ') || 'Adjunct evidence')}${row.year ? ' · ' + esc(row.year) : ''}</div>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--text-tertiary)">No adjunct papers matched the current search.</div>'}
  </div>`;
  html += '</div>';

  if (reviewConditions.length) {
    html += '<div class="ch-card" style="padding:16px;margin-top:16px">';
    html += '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:12px">';
    html += '<div style="font-weight:600;font-size:14px">Condition Review Tables</div>';
    html += `<div style="font-size:11px;color:var(--text-tertiary)">Focused on depression, OCD, ADHD, pain, and epilepsy review workflows.</div>`;
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">';
    html += reviewConditions.map((condition) => `<div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2)">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">${esc(condition.condition_label || condition.condition_slug || 'Condition')}</div>
      ${(condition.rows || []).map((row) => `<div style="padding:10px 0;border-top:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div style="font-size:12px;font-weight:600">${esc(row.topic_label || 'Topic')}</div>
          <span style="padding:2px 6px;font-size:10px;border-radius:999px;background:var(--blue);color:#fff">${fmt(row.paper_count || 0)} papers</span>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(_reNormalizeLabel(row.domain || 'general'))}${row.latest_year ? ` · latest ${esc(row.latest_year)}` : ''}${row.citation_sum ? ` · ${fmt(row.citation_sum)} citations` : ''}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:5px">${esc((row.top_relation_signal_tags || []).map((tag) => tag.key).join(' · ') || 'No relation tags captured')}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:5px">${esc((row.example_titles || []).slice(0, 2).join(' | ') || 'No example titles available')}</div>
      </div>`).join('')}
    </div>`).join('');
    html += '</div></div>';
  }

  return html;
}

async function renderNeuro(body, q, filt, sInput, pills) {
  await _ensureResearchBundleData();
  const lobes = ['All', ...new Set(BRAIN_TARGET_REGISTRY.map(t => t.lobe).filter(Boolean))];

  let rows = [...BRAIN_TARGET_REGISTRY];
  if (filt !== 'All') rows = rows.filter(t => t.lobe === filt);
  if (q) rows = rows.filter(t => (t.label + ' ' + t.region + ' ' + t.function + ' ' + t.clinical + ' ' + t.site10_20).toLowerCase().includes(q));

  const expandedRows = rows.filter((t) => window._reExpand['n_' + t.id]).slice(0, 8);
  const liveTargetEvidence = new Map(
    await Promise.all(expandedRows.map(async (t) => {
      const targetNeedle = t.label || t.id || t.site10_20 || '';
      const [graphRes, papersRes, templateRes] = await Promise.allSettled([
        api.listResearchEvidenceGraph?.({ target: targetNeedle, limit: 6 }),
        api.searchResearchPapers?.({ target: targetNeedle, ranking_mode: 'clinical', limit: 4 }),
        api.listResearchProtocolTemplates?.({ limit: 6 }),
      ]);
      const graph = graphRes.status === 'fulfilled' && Array.isArray(graphRes.value) ? graphRes.value : [];
      const papers = papersRes.status === 'fulfilled' && Array.isArray(papersRes.value) ? papersRes.value : [];
      const templates = templateRes.status === 'fulfilled' && Array.isArray(templateRes.value) ? templateRes.value.filter((row) =>
        String(row.target || '').toLowerCase().includes(String(targetNeedle).toLowerCase())
      ).slice(0, 4) : [];
      return [t.id, { graph, papers, templates }];
    }))
  );

  let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px">
    ${sInput('Search brain targets...')}
    <div style="display:flex;flex-wrap:wrap;gap:4px">${pills(lobes, filt)}</div>
  </div>`;

  /* table */
  html += '<div class="ch-card" style="overflow-x:auto;padding:0">';
  html += '<table style="width:100%;font-size:12px;border-collapse:collapse">';
  html += '<thead><tr style="text-align:left;color:var(--text-tertiary);background:var(--surface-2)"><th style="padding:8px">Target</th><th style="padding:8px">10-20</th><th style="padding:8px">10-10</th><th style="padding:8px">Lobe</th><th style="padding:8px">BA</th><th style="padding:8px">Function</th><th style="padding:8px">Clinical Indications</th></tr></thead><tbody>';

  for (const t of rows) {
    const expanded = window._reExpand['n_' + t.id];
    html += `<tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''" onclick="window._reExpand['n_${esc(t.id)}']=!window._reExpand['n_${esc(t.id)}'];window._nav('research-evidence')">
      <td style="padding:8px;font-weight:600;white-space:nowrap">${esc(t.label)} ${expanded ? '▾' : '▸'}</td>
      <td style="padding:8px;font-family:monospace">${esc(t.site10_20)}</td>
      <td style="padding:8px;font-family:monospace">${esc(t.site10_10)}</td>
      <td style="padding:8px"><span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--rose);color:#fff">${esc(t.lobe)}</span></td>
      <td style="padding:8px;font-family:monospace;font-size:11px">${esc(t.ba)}</td>
      <td style="padding:8px;font-size:11px;max-width:220px">${esc(t.function)}</td>
      <td style="padding:8px;font-size:11px;max-width:220px">${esc(t.clinical)}</td>
    </tr>`;

    if (expanded) {
      /* find linked protocols and conditions */
      const linkedProtos = PROTOCOL_REGISTRY.filter(p => {
        const tgt = (p.target || '').toLowerCase();
        return tgt.includes(t.site10_20?.toLowerCase()) || tgt.includes(t.id?.toLowerCase());
      });
      const linkedConds = CONDITION_REGISTRY.filter(c =>
        (c.targets || []).some(tgt => tgt === t.site10_20 || tgt === t.id)
      );
      const live = liveTargetEvidence.get(t.id) || { graph: [], papers: [], templates: [] };

      html += `<tr><td colspan="7" style="padding:8px 8px 12px 24px;background:var(--surface-1,var(--bg));font-size:12px">
        <div style="font-weight:500;margin-bottom:4px">Region: ${esc(t.region)}</div>`;
      if (linkedProtos.length) {
        html += '<div style="margin-top:6px"><strong>Linked Protocols:</strong> ' + linkedProtos.map(p => `<span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--green);color:#fff;margin:2px">${esc(p.name)}</span>`).join('') + '</div>';
      }
      if (linkedConds.length) {
        html += '<div style="margin-top:6px"><strong>Linked Conditions:</strong> ' + linkedConds.map(c => `<span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--blue);color:#fff;margin:2px">${esc(c.name)}</span>`).join('') + '</div>';
      }
      if (live.graph.length) {
        html += '<div style="margin-top:8px"><strong>Live Evidence Graph:</strong></div>';
        html += live.graph.map((row) => `<div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">${esc(_reNormalizeLabel(row.modality || 'Modality'))}${row.indication ? ' · ' + esc(_reNormalizeLabel(row.indication)) : ''}${row.paper_count != null ? ' · ' + fmt(row.paper_count) + ' papers' : ''}${row.citation_sum != null ? ' · ' + fmt(row.citation_sum) + ' citations' : ''}</div>`).join('');
      }
      if (live.templates.length) {
        html += '<div style="margin-top:8px"><strong>Live Protocol Templates:</strong> ' + live.templates.map((row) => `<span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--violet);color:#fff;margin:2px">${esc(_reNormalizeLabel(row.modality || 'Protocol'))}${row.indication ? ' · ' + esc(_reNormalizeLabel(row.indication)) : ''}</span>`).join('') + '</div>';
      }
      if (live.papers.length) {
        html += '<div style="margin-top:8px"><strong>Live Papers:</strong></div>';
        html += live.papers.map((p) => `<div style="padding:8px 0;border-bottom:1px solid var(--border-light,var(--border))">
          <div style="font-size:12px;font-weight:500">${esc(p.title || '(untitled)')}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(p.authors || '')}${p.year ? ' · ' + esc(p.year) : ''}${p.journal ? ' · ' + '<em>' + esc(p.journal) + '</em>' : ''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px">
            ${p.record_url ? `<a href="${esc(p.record_url)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal)">Open</a>` : ''}
            ${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal)">DOI</a>` : ''}
            ${p.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal)">PubMed</a>` : ''}
          </div>
        </div>`).join('');
      }
      html += '</td></tr>';
    }
  }

  html += '</tbody></table></div>';
  html += `<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Showing ${rows.length} of ${BRAIN_TARGET_REGISTRY.length} brain targets</div>`;

  if (_researchBundleState.adjunctSummary || _researchBundleState.adjunctPapers.length) {
    html += renderAdjunctEvidenceSection(q);
  }

  body.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 6 — Labs / Meds / Diet
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderAdjunctEvidence(body, q, sInput) {
  await _ensureResearchBundleData();

  let html = _resWorkspaceHeader(_liveEvidenceUiStats) +
    '<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 14px;line-height:1.55;border-left:3px solid var(--cyan,var(--teal));padding-left:12px">' +
    '<strong style="color:var(--text-secondary)">Adjunct evidence only.</strong> Labs, medications, diet, and biomarker papers here describe modifiers and confounders — not neuromodulation indication suitability by themselves. Adjunct evidence requires clinician review alongside protocol indication, device labelling, and patient factors.' +
    '</p>' +
    `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px">
    ${sInput('Search labs, medications, supplements, vitamins, and diet evidence...')}
  </div>`;

  if (_researchBundleState.adjunctSummary || _researchBundleState.adjunctPapers.length) {
    html += renderAdjunctEvidenceSection(q, { standalone: true });
  } else {
    html += `<div class="ch-card" style="padding:16px">
      <div style="font-weight:600;font-size:14px;margin-bottom:8px">Adjunct Evidence Unavailable</div>
      <div style="font-size:12px;color:var(--text-tertiary)">No live adjunct bundle rows returned from the research API for this session — this is not an empty evidence verdict on adjunct topics. Connect the neuromodulation research ingest or try later.</div>
    </div>`;
  }

  body.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 7 — AI/ML & Psychotherapies
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderAIML(body, q, sInput) {
  const aiKeywords  = ['machine learning', 'artificial intelligence', 'deep learning', 'neural network', 'predictive model', 'classifier', 'biomarker prediction'];
  const psyKeywords = ['psychotherapy', 'cbt', 'cognitive behav', 'exposure', 'erp', 'mindfulness', 'behavioural activation', 'behavioral activation', 'therapy augment'];

  async function gatherLive(keywords) {
    const results = [];
    const seen = new Set();
    const batches = await Promise.allSettled(
      keywords.map((kw) => api.searchResearchPapers?.({
        q: kw,
        ranking_mode: 'clinical',
        limit: 8,
      }))
    );
    for (const batch of batches) {
      const rows = batch.status === 'fulfilled' && Array.isArray(batch.value) ? batch.value : [];
      for (const r of rows) {
        const key = r.paper_key || r.doi || r.pmid || r.title;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        results.push(r);
      }
    }
    return results;
  }

  let aiPapers = [];
  let psyPapers = [];
  try {
    [aiPapers, psyPapers] = await Promise.all([
      gatherLive(aiKeywords),
      gatherLive(psyKeywords),
    ]);
  } catch {}

  if (!aiPapers.length && !psyPapers.length) {
    const gatherFallback = (keywords) => {
      const results = [];
      const seen = new Set();
      for (const kw of keywords) {
        for (const r of searchEvidenceByKeyword(kw)) {
          const key = r.doi || r.title;
          if (!seen.has(key)) { seen.add(key); results.push(r); }
        }
      }
      return results;
    };
    aiPapers = gatherFallback(aiKeywords);
    psyPapers = gatherFallback(psyKeywords);
  }

  if (q) {
    aiPapers  = aiPapers.filter(p => (String(p.title || '') + ' ' + String(p.authors || '') + ' ' + String(p.journal || '') + ' ' + String(p.conditionId || '') + ' ' + String((p.indication_tags || []).join(' '))).toLowerCase().includes(q));
    psyPapers = psyPapers.filter(p => (String(p.title || '') + ' ' + String(p.authors || '') + ' ' + String(p.journal || '') + ' ' + String(p.conditionId || '') + ' ' + String((p.indication_tags || []).join(' '))).toLowerCase().includes(q));
  }

  function paperCard(p) {
    const condLabel = (p.conditionId || p.indication_tags?.[0] || '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '';
    const doiHref = p.doi ? `https://doi.org/${p.doi}` : '';
    const pubmedHref = p.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/` : '';
    const openHref = p.record_url || '';
    const cites = p.citations ?? p.citation_count ?? 0;
    const summary = p.research_summary || '';
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border-light,var(--border))">
      <div style="font-size:12px;font-weight:500">${esc(p.title)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(p.authors || '')} ${p.authors ? '&middot;' : ''} ${p.year || ''} ${p.year ? '&middot;' : ''} <em>${esc(p.journal || '')}</em> ${cites ? '&middot; ' + fmt(cites) + ' citations' : ''}</div>
      ${summary ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:6px;line-height:1.45">${esc(summary.length > 180 ? summary.slice(0, 180) + '…' : summary)}</div>` : ''}
      <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
        <span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--blue);color:#fff">${esc(condLabel)}</span>
        ${p.primary_modality ? `<span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--surface-2);color:var(--text-secondary)">${esc(_reNormalizeLabel(p.primary_modality))}</span>` : ''}
        ${openHref ? `<a href="${esc(openHref)}" target="_blank" rel="noopener" style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--surface-2);color:var(--teal);text-decoration:none">Open</a>` : ''}
        ${doiHref ? `<a href="${esc(doiHref)}" target="_blank" rel="noopener" style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--surface-2);color:var(--teal);text-decoration:none">DOI</a>` : ''}
        ${pubmedHref ? `<a href="${esc(pubmedHref)}" target="_blank" rel="noopener" style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--surface-2);color:var(--teal);text-decoration:none">PubMed</a>` : ''}
      </div>
    </div>`;
  }

  let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px">
    ${sInput('Search AI/ML & psychotherapy papers...')}
  </div>`;

  /* AI/ML section */
  html += `<div class="ch-card" style="padding:16px;margin-bottom:16px">
    <div style="font-weight:600;font-size:14px;margin-bottom:4px">AI / Machine Learning in Neuromodulation</div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px">${aiPapers.length} papers found across ${new Set(aiPapers.map(p => p.conditionId)).size} conditions</div>
    ${aiPapers.length ? aiPapers.map(paperCard).join('') : '<div style="color:var(--text-tertiary);font-size:12px">No matching papers found.</div>'}
  </div>`;

  /* Psychotherapies section */
  html += `<div class="ch-card" style="padding:16px;margin-bottom:16px">
    <div style="font-weight:600;font-size:14px;margin-bottom:4px">Psychotherapy + Neuromodulation Combinations</div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px">${psyPapers.length} papers found across ${new Set(psyPapers.map(p => p.conditionId)).size} conditions</div>
    ${psyPapers.length ? psyPapers.map(paperCard).join('') : '<div style="color:var(--text-tertiary);font-size:12px">No matching papers found.</div>'}
  </div>`;

  /* summary KPIs */
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
    <div class="ch-card" style="padding:14px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:var(--amber)">${aiPapers.length}</div>
      <div style="font-size:11px;color:var(--text-secondary)">AI/ML Papers</div>
    </div>
    <div class="ch-card" style="padding:14px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:var(--violet)">${psyPapers.length}</div>
      <div style="font-size:11px;color:var(--text-secondary)">Psychotherapy Papers</div>
    </div>
    <div class="ch-card" style="padding:14px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:var(--teal)">${new Set([...aiPapers, ...psyPapers].map(p => p.conditionId)).size}</div>
      <div style="font-size:11px;color:var(--text-secondary)">Conditions Covered</div>
    </div>
  </div>`;

  body.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════════════════
   Live Indexed Evidence Search — synonym expansion (transparent FTS hints; does not fabricate)
   ══════════════════════════════════════════════════════════════════════════════ */
const _EV_TOKEN_SYNONYMS = {
  depression: ['depression', 'MDD', 'depressive', '"major depressive disorder"'],
  mdd: ['MDD', 'depression', 'depressive'],
  rtms: ['rTMS', 'RTMS', 'repetitive', 'TMS', '"repetitive transcranial magnetic stimulation"'],
  tms: ['TMS', 'transcranial', 'magnetic', '"transcranial magnetic stimulation"'],
  tdcs: ['tDCS', 'transcranial', 'direct', 'current', '"transcranial direct current stimulation"'],
  tacs: ['tACS'],
  trns: ['tRNS'],
  tfus: ['tFUS', 'focused', 'ultrasound'],
  tps: ['TPS', 'pulse', 'stimulation', '"transcranial pulse stimulation"'],
  asd: ['ASD', 'autism', 'spectrum', '"autism spectrum disorder"'],
  adhd: ['ADHD', 'attention', 'deficit', 'hyperactivity', '"attention deficit hyperactivity disorder"'],
  ocd: ['OCD', 'obsessive', 'compulsive'],
  anxiety: ['anxiety', 'GAD', 'anxious'],
  alzheimer: ['Alzheimer', 'dementia', '"Alzheimer disease"', '"Alzheimer\'s disease"'],
  alzheimers: ['Alzheimer', 'dementia'],
  neurofeedback: ['neurofeedback', 'EEG', 'biofeedback', '"EEG biofeedback"'],
  qeeg: ['qEEG', 'EEG', 'quantitative'],
  mri: ['MRI', 'neuroimaging', 'resonance'],
  ces: ['CES', 'cranial', 'electrical', '"cranial electrotherapy stimulation"'],
  pbm: ['PBM', 'photobiomodulation', 'laser'],
  pain: ['pain', 'chronic', 'nociceptive', 'neuropathic'],
  chronic: ['chronic', 'persistent'],
  fibromyalgia: ['fibromyalgia', 'widespread'],
  migraine: ['migraine', 'headache'],
  stroke: ['stroke', 'cerebrovascular'],
  parkinson: ['Parkinson', 'PD'],
  epilepsy: ['epilepsy', 'seizure'],
  insomnia: ['insomnia', 'sleep'],
  ptsd: ['PTSD', 'trauma'],
  tinnitus: ['tinnitus'],
};

function _reExpandEvidenceSearchQuery(raw) {
  let working = String(raw || '').trim();
  const noteParts = [];
  if (/\bchronic\s+pain\b/i.test(working)) {
    noteParts.push('chronic pain ↔ chronic pain OR neuropathic pain (FTS OR-group)');
  }
  const tokens = working.split(/\s+/).filter(Boolean);
  const groups = tokens.map((tok) => {
    const norm = tok.toLowerCase().replace(/[^a-z0-9]/g, '');
    const syn = _EV_TOKEN_SYNONYMS[norm];
    if (syn && syn.length) {
      const uniq = [...new Set(syn)].slice(0, 8);
      noteParts.push(`${tok} → ${uniq.join(', ')}`);
      return '(' + uniq.map((t) => (/\s/.test(t) ? `"${t.replace(/"/g, '')}"` : t)).join(' OR ') + ')';
    }
    return tok.replace(/["']/g, '');
  });
  return {
    fts: groups.join(' '),
    notes: noteParts.length ? 'Expanded query terms used for retrieval: ' + noteParts.join(' · ') : '',
  };
}

function _reFilterCuratedLiterature(items, rawQ) {
  const ql = String(rawQ || '').trim().toLowerCase();
  if (!ql || ql.length < 2) return [];
  return (items || []).filter((p) => {
    const blob = [p.title, p.authors, p.journal, p.condition, p.study_type].filter(Boolean).join(' ').toLowerCase();
    return blob.includes(ql);
  });
}

function _reDedupeKey(rec, prefix) {
  const pmid = rec.pmid != null && String(rec.pmid).trim() ? String(rec.pmid).trim() : '';
  if (pmid) return 'pmid:' + pmid;
  const doi = rec.doi != null && String(rec.doi).trim() ? String(rec.doi).trim().toLowerCase() : '';
  if (doi) return 'doi:' + doi;
  if (rec.id != null && rec.id !== '') return 'id:' + String(rec.id);
  const t = (rec.title || '').trim().toLowerCase().slice(0, 160);
  const y = rec.year != null ? String(rec.year) : '';
  if (t) return 'ty:' + t + '|' + y;
  return (prefix || 'nk') + ':' + Math.random().toString(36).slice(2);
}

const _RE_EVIDENCE_BASKET_KEY = 'ds_evidence_terminal_basket';

function _reSparklineSvg(values, { width = 160, height = 40, stroke = '#3ee0c5' } = {}) {
  const nums = (values || []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (nums.length < 2) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><text x="${width / 2}" y="${Math.round(height / 2)}" text-anchor="middle" font-size="9" fill="var(--text-tertiary)">Insufficient data</text></svg>`;
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(1, max - min);
  const points = nums.map((value, idx) => {
    const x = nums.length === 1 ? width / 2 : (idx / (nums.length - 1)) * (width - 8) + 4;
    const y = height - 4 - (((value - min) / span) * (height - 12));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><line x1="0" y1="${height - 4}" x2="${width}" y2="${height - 4}" stroke="rgba(148,163,184,0.28)" stroke-width="1"/></svg>`;
}

function _reSafetyTone(tag) {
  const raw = String(tag || '').toLowerCase();
  if (/contra|seiz|mania|suicid|bleed|implant|pregnan|psychosis|serious/.test(raw)) return { fg: 'var(--rose)', bg: 'rgba(244,63,94,0.12)', bd: 'rgba(244,63,94,0.28)' };
  if (/headache|skin|pain|fatigue|dizz|monitor|watch|irritat|sleep/.test(raw)) return { fg: 'var(--amber)', bg: 'rgba(245,158,11,0.12)', bd: 'rgba(245,158,11,0.26)' };
  return { fg: 'var(--text-secondary)', bg: 'var(--surface-2)', bd: 'var(--border)' };
}

function _reSafetyLabel(label) {
  const tone = _reSafetyTone(label);
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:${tone.bg};border:1px solid ${tone.bd};color:${tone.fg};font-size:10px;font-weight:600">${esc(label)}</span>`;
}

// BUG-FIX-003: Render 3-state access status from explicit backend field.
// Never infer OA status from URL patterns.
function renderAccessStatus(paper) {
  if (paper.access_status === 'open_access')
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:rgba(20,184,166,0.14);border:1px solid rgba(20,184,166,0.35);color:var(--teal);font-size:10px;font-weight:600">Open Access</span>';
  if (paper.access_status === 'restricted')
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.28);color:var(--rose);font-size:10px;font-weight:600">Restricted</span>';
  return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);color:var(--text-secondary);font-size:10px;font-weight:600">Access Unknown</span>';
}

function _reReadEvidenceBasket() {
  try {
    const raw = localStorage.getItem(_RE_EVIDENCE_BASKET_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function _reWriteEvidenceBasket(items) {
  try {
    localStorage.setItem(_RE_EVIDENCE_BASKET_KEY, JSON.stringify((items || []).slice(0, 30)));
  } catch {}
}

function _reRememberEvidenceRecord(raw, sourceType) {
  const key = _reDedupeKey(raw, sourceType || 'paper');
  if (typeof window !== 'undefined') {
    window._reEvidenceBasketCache = window._reEvidenceBasketCache || {};
    window._reEvidenceBasketCache[key] = {
      key,
      id: raw.id ?? null,
      title: raw.title || '(untitled)',
      year: raw.year ?? '',
      journal: raw.journal || '',
      pmid: raw.pmid || '',
      doi: raw.doi || '',
      sourceType: sourceType || 'indexed',
    };
  }
  return key;
}

function _reRenderEvidenceBasketPanel(hostId = 're-evidence-basket-panel') {
  const host = document.getElementById(hostId);
  if (!host) return;
  const items = _reReadEvidenceBasket();
  host.innerHTML = items.length
    ? '<div style="display:grid;gap:8px">' +
        items.map((item) => (
          '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)">' +
            '<div>' +
              '<div style="font-size:12px;font-weight:600;color:var(--text-primary)">' + esc(item.title) + '</div>' +
              '<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:3px">' + esc([item.year, item.journal, item.pmid ? `PMID ${item.pmid}` : '', item.doi ? 'DOI' : '', item.sourceType].filter(Boolean).join(' · ')) + '</div>' +
            '</div>' +
            '<button type="button" class="btn btn-ghost btn-xs" onclick="window._reToggleEvidenceBasket(\'' + esc(item.key) + '\')">Remove</button>' +
          '</div>'
        )).join('') +
      '</div>'
    : '<div class="ch-empty" style="padding:18px 0">Basket is empty. Add papers from search or indication detail for a quick clinician review set.</div>';
}

function _reRenderTerminalResultsTable(rows) {
  if (!rows.length) {
    return '<div class="ch-empty" style="padding:18px 0">Run a search to populate the evidence terminal table.</div>';
  }
  return '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px">' +
    '<thead><tr style="text-align:left;background:var(--surface-2);color:var(--text-tertiary)">' +
      '<th style="padding:8px 10px">Paper</th>' +
      '<th style="padding:8px 10px">Source</th>' +
      '<th style="padding:8px 10px">Year</th>' +
      '<th style="padding:8px 10px">Design</th>' +
      '<th style="padding:8px 10px">Access</th>' +
      '<th style="padding:8px 10px">Action</th>' +
    '</tr></thead><tbody>' +
    rows.slice(0, 12).map((row) => {
      const basketKey = _reRememberEvidenceRecord(row, row.__sourceType || 'indexed');
      const basketItems = _reReadEvidenceBasket();
      const inBasket = basketItems.some((item) => item.key === basketKey);
      return '<tr style="border-top:1px solid var(--border)">' +
        '<td style="padding:9px 10px;min-width:280px"><div style="font-weight:600;color:var(--text-primary)">' + esc(row.title || '(untitled)') + '</div><div style="font-size:10px;color:var(--text-tertiary);margin-top:3px">' + esc(row.journal || 'Journal unavailable') + '</div></td>' +
        '<td style="padding:9px 10px">' + esc(row.__sourceLabel || row.__sourceType || 'indexed') + '</td>' +
        '<td style="padding:9px 10px">' + esc(row.year || '—') + '</td>' +
        '<td style="padding:9px 10px">' + esc(row.study_design || row.study_type_normalized || row.study_type || '—') + '</td>' +
        '<td style="padding:9px 10px">' + renderAccessStatus(row) + '</td>' +
        '<td style="padding:9px 10px"><button type="button" class="btn btn-ghost btn-xs" onclick="window._reToggleEvidenceBasket(\'' + esc(basketKey) + '\')">' + (inBasket ? 'Remove' : 'Basket') + '</button></td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';
}

function _reRenderTerminalMetricCards(snapshot) {
  const status = snapshot?.status || {};
  const summary = snapshot?.summary || {};
  const indications = Array.isArray(snapshot?.indications) ? snapshot.indications : [];
  const graph = Array.isArray(snapshot?.evidenceGraph) ? snapshot.evidenceGraph : [];
  const countsSeries = [
    Number(status.total_papers || 0),
    Number(summary.paper_count || 0),
    graph.reduce((sum, row) => sum + Number(row.paper_count || 0), 0),
    indications.reduce((sum, row) => sum + Number(row.paper_count || 0), 0),
  ].filter((value) => Number.isFinite(value) && value >= 0);
  const topSignalTags = (snapshot?.safetySignals || []).slice(0, 4).flatMap((row) => (row.safety_signal_tags || []).slice(0, 2)).filter(Boolean);
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">' +
    `<div class="ch-card" style="padding:16px"><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em">Indexed papers</div><div style="font-size:28px;font-weight:700;color:var(--teal);margin-top:4px">${fmt(Number(status.total_papers || 0))}</div><div style="font-size:11px;color:var(--text-secondary);margin-top:6px">Live count from <code style="font-size:10px">/api/v1/evidence/status</code></div>${_reSparklineSvg(countsSeries, { stroke: '#3ee0c5' })}</div>` +
    `<div class="ch-card" style="padding:16px"><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em">Curated indications</div><div style="font-size:28px;font-weight:700;color:var(--blue);margin-top:4px">${fmt(indications.length)}</div><div style="font-size:11px;color:var(--text-secondary);margin-top:6px">Live indication explorer scope</div></div>` +
    // BUG-FIX-004: Show honest trial count + separate link-count detail.
    // trial_indication_links is a junction-table count, NOT the trial count.
    `<div class="ch-card" style="padding:16px"><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em">Trials / devices</div><div style="font-size:28px;font-weight:700;color:var(--violet);margin-top:4px">${fmt(Number(status.total_trials || 0))} / ${fmt(Number(status.total_fda || 0))}</div><div style="font-size:11px;color:var(--text-secondary);margin-top:6px">Trials: ${fmt(Number(status.total_trials || 0))} <span style="color:var(--text-tertiary)">(linked to ${fmt(Number(status.trial_indication_links || 0))} indications)</span></div></div>` +
    `<div class="ch-card" style="padding:16px"><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em">Safety watch</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${topSignalTags.length ? topSignalTags.map(_reSafetyLabel).join('') : '<span style="font-size:11px;color:var(--text-tertiary)">No live safety tags returned.</span>'}</div></div>` +
  '</div>';
}

function _reRenderTerminalExplorer(snapshot) {
  const indications = Array.isArray(snapshot?.indications) ? snapshot.indications.slice(0, 8) : [];
  const graphRows = Array.isArray(snapshot?.evidenceGraph) ? snapshot.evidenceGraph.slice(0, 6) : [];
  const safetyRows = Array.isArray(snapshot?.safetySignals) ? snapshot.safetySignals.slice(0, 6) : [];
  return '<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:14px;margin-bottom:16px">' +
    '<div class="ch-card" style="padding:16px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px"><div style="font-weight:600">Indication explorer</div><span style="font-size:11px;color:var(--text-tertiary)">Top live rows</span></div>' +
      (indications.length
        ? indications.map((row) => '<button type="button" onclick="window._resEvidenceTab=\'indications\';window._reIndicationSlug=\'' + esc(row.slug) + '\';window._nav(\'research-evidence\')" style="width:100%;text-align:left;padding:9px 10px;margin-bottom:8px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--text-primary)"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong style="font-size:12px">' + esc(row.label || row.slug) + '</strong>' + _computedGradeBadge(row.computed_evidence_grade) + '</div><div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">' + esc([row.modality, `${fmt(row.paper_count || 0)} papers`, `${fmt(row.trial_count || 0)} trials`].filter(Boolean).join(' · ')) + '</div></button>').join('')
        : '<div class="ch-empty" style="padding:18px 0">Indication summary unavailable.</div>') +
    '</div>' +
    '<div class="ch-card" style="padding:16px"><div style="font-weight:600;margin-bottom:10px">Relationship map</div>' +
      (graphRows.length
        ? graphRows.map((row) => '<div style="padding:9px 0;border-top:1px solid var(--border)"><div style="font-size:12px;font-weight:600">' + esc(_reNormalizeLabel(row.modality || 'Modality')) + (row.indication ? ' · ' + esc(_reNormalizeLabel(row.indication)) : '') + '</div><div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">' + esc(row.target || 'Target unavailable') + ' · ' + fmt(row.paper_count || 0) + ' papers · ' + fmt(row.citation_sum || 0) + ' cites</div></div>').join('')
        : '<div class="ch-empty" style="padding:18px 0">No graph rows returned.</div>') +
    '</div>' +
    '<div class="ch-card" style="padding:16px"><div style="font-weight:600;margin-bottom:10px">Safety labels</div>' +
      (safetyRows.length
        ? safetyRows.map((row) => '<div style="padding:9px 0;border-top:1px solid var(--border)"><div style="font-size:12px;font-weight:600">' + esc(_reNormalizeLabel(row.primary_modality || 'Modality')) + '</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' + ((row.safety_signal_tags || []).slice(0, 3).concat((row.contraindication_signal_tags || []).slice(0, 2))).filter(Boolean).map(_reSafetyLabel).join('') + '</div></div>').join('')
        : '<div class="ch-empty" style="padding:18px 0">No safety signal rows returned.</div>') +
    '</div>' +
  '</div>';
}

/** Shared doctor-facing evidence card — never fabricates links or abstracts. */
function renderEvidenceResultCard(raw, sourceType, opts = {}) {
  const badgeMap = {
    indexed: { label: 'Indexed DB', bg: 'rgba(45,212,191,0.14)', fg: 'var(--teal)', bd: 'rgba(45,212,191,0.35)' },
    brokered: { label: 'Brokered search', bg: 'rgba(245,158,11,0.14)', fg: 'var(--amber)', bd: 'rgba(245,158,11,0.3)' },
    curated: { label: 'Curated library', bg: 'rgba(139,92,246,0.14)', fg: 'var(--violet)', bd: 'rgba(139,92,246,0.35)' },
    bundled: { label: 'Bundled registry context', bg: 'var(--surface-2)', fg: 'var(--text-secondary)', bd: 'var(--border)' },
    research: { label: 'Research bundle (ranked)', bg: 'rgba(59,130,246,0.12)', fg: 'var(--blue)', bd: 'rgba(59,130,246,0.28)' },
  };
  const b = badgeMap[sourceType] || badgeMap.indexed;
  const title = raw.title || '(untitled)';
  const year = raw.year != null && raw.year !== '' ? raw.year : '';
  const journal = raw.journal || '';

  let authorLine = '';
  if (Array.isArray(raw.authors)) {
    const a = raw.authors.filter(Boolean);
    if (a.length) {
      const head = a.slice(0, 3).join(', ');
      authorLine = a.length > 3 ? head + ' +' + (a.length - 3) + ' more' : head;
    }
  } else if (typeof raw.authors === 'string' && raw.authors.trim()) {
    authorLine = raw.authors.trim();
  }
  if (!authorLine) authorLine = 'Authors unavailable';

  const modalities = Array.isArray(raw.modalities) ? raw.modalities.filter(Boolean).slice(0, 8) : [];
  const conds = Array.isArray(raw.conditions) ? raw.conditions.filter(Boolean).slice(0, 8) : [];
  const condExtra = raw.condition ? [raw.condition] : [];
  const pubTypes = (raw.pub_types || []).slice(0, 4);
  const studyDesign = raw.study_design || raw.study_type_normalized || raw.study_type || '';
  const evGrade = raw.evidence_grade || raw.evidence_tier || '';
  const sampleSize = raw.sample_size != null && raw.sample_size !== '' ? raw.sample_size : null;
  const effectDir = raw.effect_direction || '';
  const outcome = raw.primary_outcome_measure || '';

  const absRaw = (raw.abstract || raw.snippet || raw.research_summary || '').trim();
  const snip = absRaw
    ? esc(absRaw.slice(0, 420)) + (absRaw.length > 420 ? '…' : '')
    : '<span style="font-size:11px;color:var(--text-tertiary)">Abstract unavailable from this record</span>';

  const pmid = raw.pmid ? String(raw.pmid).trim() : '';
  const doi = raw.doi ? String(raw.doi).trim() : '';
  const openUrl = ((raw.oa_url || raw.url || '') + '').trim();
  const europe = (raw.europe_pmc_url || '').trim();
  let oax = raw.openalex_id ? String(raw.openalex_id).trim() : '';
  let openalexUrl = '';
  if (oax) {
    if (/^https?:\/\//i.test(oax)) openalexUrl = oax;
    else openalexUrl = 'https://openalex.org/' + oax.replace(/^https?:\/\/openalex\.org\//i, '');
  }

  const links = [];
  if (openUrl) {
    links.push('<a class="ch-btn-sm" target="_blank" rel="noopener noreferrer" href="' + esc(openUrl) + '">Open ↗</a>');
  }
  if (doi) {
    links.push('<a class="ch-btn-sm" target="_blank" rel="noopener noreferrer" href="https://doi.org/' + esc(doi) + '">DOI</a>');
  }
  if (pmid) {
    links.push('<a class="ch-btn-sm" target="_blank" rel="noopener noreferrer" href="https://pubmed.ncbi.nlm.nih.gov/' + esc(pmid) + '/">PubMed</a>');
  }
  if (europe) {
    links.push('<a class="ch-btn-sm" target="_blank" rel="noopener noreferrer" href="' + esc(europe) + '">Europe PMC</a>');
  }
  if (openalexUrl) {
    links.push('<a class="ch-btn-sm" target="_blank" rel="noopener noreferrer" href="' + esc(openalexUrl) + '">OpenAlex</a>');
  }

  const linkRow =
    links.length > 0
      ? links.join('')
      : '<span style="font-size:11px;color:var(--text-tertiary)">No direct link available from this record.</span>';

  const chips = [];
  modalities.forEach((m) => chips.push('<span class="lib-tag">' + esc(m) + '</span>'));
  conds.forEach((c) => chips.push('<span class="lib-tag">' + esc(c) + '</span>'));
  condExtra.forEach((c) => chips.push('<span class="lib-tag">' + esc(c) + '</span>'));
  pubTypes.forEach((t) => chips.push('<span class="lib-tag">' + esc(t) + '</span>'));
  if (studyDesign) chips.push('<span class="lib-tag">' + esc(studyDesign) + '</span>');
  if (evGrade) {
    chips.push('<span class="lib-tag">' + esc(String(evGrade).replace(/^EV-?/i, '')) + '</span>');
  }
  if (sampleSize != null) chips.push('<span class="lib-tag">n=' + esc(String(sampleSize)) + '</span>');
  if (effectDir) chips.push('<span class="lib-tag">' + esc(effectDir) + '</span>');
  if (outcome) {
    const om = String(outcome);
    chips.push('<span class="lib-tag" title="' + esc(om) + '">' + esc(om.slice(0, 48)) + (om.length > 48 ? '…' : '') + '</span>');
  }
  if (raw.is_oa || raw.open_access_flag) {
    chips.push('<span class="lib-tag" title="Open-access flag from ingest">OA</span>');
  }

  let trustRow = '';
  if (sourceType === 'brokered') {
    trustRow =
      '<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:6px">Trust: <b>' +
      esc(raw.source_trust || '—') +
      '</b> · Status: <b>' +
      esc(raw.review_status || '—') +
      '</b></div>';
  }

  const pid = Number(raw.id);
  const showPromote =
    (sourceType === 'indexed' || sourceType === 'brokered') && Number.isFinite(pid) && opts.promote !== false;
  const basketKey = _reRememberEvidenceRecord(raw, sourceType);
  const inBasket = _reReadEvidenceBasket().some((item) => item.key === basketKey);
  const promoteHtml = showPromote
    ? '<button class="ch-btn-sm ch-btn-teal" onclick="window._libPromoteExternal(' +
      pid +
      ',\'' +
      esc(title).replace(/'/g, "\\'") +
      '\')">Promote to Library</button>' +
      '<label class="ch-btn-sm" style="display:inline-flex;gap:4px;align-items:center;cursor:pointer"><input type="checkbox" class="lib-ai-pick" value="' +
      pid +
      '" style="margin:0"> AI draft</label>'
    : '';
  const basketHtml =
    opts.basket === false
      ? ''
      : '<button class="ch-btn-sm" onclick="window._reToggleEvidenceBasket(\'' + esc(basketKey) + '\')">' +
        (inBasket ? 'Remove from basket' : 'Add to basket') +
        '</button>';

  return (
    '<div class="lib-card lib-card--review">' +
    '<div class="lib-card-top">' +
    '<span class="lib-card-name">' +
    esc(title) +
    '</span>' +
    '<span class="lib-badge" style="background:' +
    b.bg +
    ';color:' +
    b.fg +
    ';border:1px solid ' +
    b.bd +
    '">' +
    esc(b.label) +
    '</span>' +
    '</div>' +
    '<div class="lib-card-meta">' +
    (year !== '' && year != null ? '<span class="lib-tag">' + esc(year) + '</span>' : '') +
    (journal ? '<span class="lib-tag">' + esc(journal) + '</span>' : '') +
    '</div>' +
    '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;line-height:1.35">' +
    esc(authorLine) +
    '</div>' +
    (chips.length ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">' + chips.join('') + '</div>' : '') +
    trustRow +
    '<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;line-height:1.45">' +
    snip +
    '</div>' +
    '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">' +
    linkRow +
    basketHtml +
    promoteHtml +
    '</div>' +
    '</div>'
  );
}

function _reEvidenceSearchErrorHtml(prefix, e) {
  const code = e?.status;
  let msg = e?.message || 'Unknown error';
  if (code === 401) msg = 'Sign in as clinical staff to search the evidence service.';
  if (code === 403) msg = 'Your role cannot access this evidence search action.';
  if (code === 503) msg = 'Evidence service unavailable. Try again later or use bundled registry context.';
  if (!code && (e?.name === 'TypeError' || /fetch|network|failed/i.test(String(msg)))) {
    msg =
      'Live evidence service unreachable. Bundled rollups are still available for navigation, but they are not verified search results.';
  }
  return (
    '<div class="ch-card" style="padding:12px;margin-bottom:12px;border-left:3px solid var(--rose)">' +
    '<strong>' +
    esc(prefix) +
    '</strong> — ' +
    esc(msg) +
    '</div>'
  );
}

function _reEmptyVerifiedEvidenceHtml() {
  return (
    '<div class="ch-empty" style="line-height:1.55">' +
    '<div style="margin-bottom:10px">No verified results found for this query in the connected evidence sources.</div>' +
    '<ul style="font-size:12px;color:var(--text-tertiary);margin:0;padding-left:18px">' +
    '<li>Broaden the query or remove filters.</li>' +
    '<li>Try a condition synonym (e.g. MDD, depression) or modality-only (e.g. rTMS).</li>' +
    '<li>Confirm the indexed evidence corpus is connected (status banner above).</li>' +
    '<li>If the corpus shows unavailable, try brokered or curated sources from the selector.</li>' +
    '<li>Try <strong>Curated library</strong> source if you have promoted papers.</li>' +
    '</ul></div>'
  );
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 7 — Live Indexed Evidence Search (migrated from Library Hub)
   Unified indexed corpus + brokered search · promote-to-library · AI summarization · curated lib
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderEvidenceSearch(body) {
  await _ensureProtoData();
  const defaultSearch = String(window._reEvidencePrefill || window._reSearch?.search || '').trim();

  const kpi = (color, value, label, title) =>
    `<div class="ch-kpi-card" style="--kpi-color:${color}"${title ? ` title="${esc(title)}"` : ''}>` +
    `<div class="ch-kpi-val">${esc(value)}</div><div class="ch-kpi-label">${esc(label)}</div></div>`;

  function gradeBadge(grade) {
    const g = String(grade || '').toUpperCase().replace('EV-', '');
    if (!g) return '<span class="lib-tag" title="Evidence grade not recorded">Grade: —</span>';
    const color = { A: 'var(--teal)', B: 'var(--blue)', C: 'var(--amber)', D: 'var(--rose)', E: 'var(--text-tertiary)' }[g] || 'var(--text-tertiary)';
    return `<span class="lib-badge" style="background:${color}22;color:${color};border:1px solid ${color}55" title="Highest reviewed evidence grade">Grade ${esc(g)}</span>`;
  }

  /* ── parallel API fetch ──────────────────────────────────────────────── */
  // merged from main: bf505698 intent: keep evidenceIndications fetch alongside HEAD's evidenceStatus
  let overview = null, conditions = [], curatedLitItems = [], evidenceIndications = [];
  const [ovRes, litRes, evStatusRes, indRes] = await Promise.allSettled([
    api.libraryOverview(),
    api.listLiterature(),
    api.evidenceStatus(),
    api.evidenceIndications?.(),
  ]);
  if (ovRes.status === 'fulfilled') overview = ovRes.value;
  if (litRes.status === 'fulfilled') curatedLitItems = litRes.value?.items || [];
  window._reCuratedLitSnapshot = curatedLitItems;
  const evStatusPayload = evStatusRes.status === 'fulfilled' ? evStatusRes.value : null;
  const indexedPaperCount = Number(evStatusPayload?.total_papers || 0);
  conditions = overview?.conditions || [];
  if (indRes.status === 'fulfilled' && Array.isArray(indRes.value)) evidenceIndications = indRes.value;
  const corpusStatusBanner =
    indexedPaperCount > 0
      ? '<div class="ch-card" style="margin-bottom:14px;padding:12px 16px;border-left:3px solid var(--teal);background:rgba(45,212,191,0.06)">' +
        '<strong style="color:var(--teal)">Indexed evidence corpus available.</strong> ' +
        '<span style="font-size:12px;color:var(--text-secondary)">~' +
        fmt(indexedPaperCount) +
        ' papers reported by <code style="font-size:11px">GET /api/v1/evidence/status</code> — live count for this deployment, not the bundled orientation rollup.</span>' +
        '</div>'
      : '<div class="ch-card" style="margin-bottom:14px;padding:12px 16px;border-left:3px solid var(--amber);background:rgba(245,158,11,0.06)">' +
        '<strong style="color:var(--amber)">Indexed evidence corpus unavailable.</strong> ' +
        '<span style="font-size:12px;color:var(--text-secondary)">Showing available fallback sources only. Do not claim the bundled corpus rollup as live indexed search results.</span>' +
        '</div>';
  const libraryAuthNote =
    ovRes.status === 'rejected' || litRes.status === 'rejected'
      ? '<div class="ch-card" role="note" style="margin-bottom:14px;padding:12px 14px;border-left:3px solid var(--amber);font-size:12px;color:var(--text-secondary)">' +
        '<strong>Library overview unavailable.</strong> Sign in as a clinician to load curated library totals, or continue with brokered search when the API is reachable. No evidence record has been changed.' +
        '</div>'
      : '';

  window._reLiveEvidenceState = window._reLiveEvidenceState || {
    filters: { q: '', indication: '', grade: '', oa_only: false },
    lastResults: [],
    lastGraph: [],
    lastTrials: [],
    lastDevices: [],
    lastRanked: [],
    detail: null,
  };
  const state = window._reLiveEvidenceState;

  const condOptions = ['<option value="">— All indications —</option>']
    .concat((evidenceIndications.length ? evidenceIndications : conditions).map(c => {
      const value = c.slug || c.id || '';
      const label = c.label || c.name || c.condition_label || value;
      const modality = c.modality ? ` · ${c.modality}` : '';
      return '<option value="' + esc(value) + '">' + esc(label + modality) + '</option>';
    }))
    .join('');
  const curatedCount = curatedLitItems.length;
  const evDbAvailable = overview?.evidence_db_available;
  const _totalEvPapers = _liveEvidenceUiStats?.totalPapers || EVIDENCE_SUMMARY?.totalPapers || 0;
  const _totalEvTrials = _liveEvidenceUiStats?.totalTrials || EVIDENCE_SUMMARY?.totalTrials || 0;
  const _totalEvFda = _liveEvidenceUiStats?.totalFda || 0;
  const indexedPapersDisplay = _totalEvPapers ? fmtK(_totalEvPapers) : '—';
  const curatedRollupDisplay = overview?.curated_paper_count != null ? fmtK(overview.curated_paper_count) : indexedPapersDisplay;

  function linkBtn(href, label, tone = '') {
    if (!href) return '';
    const style = tone ? ` style="${tone}"` : '';
    return `<a class="ch-btn-sm" target="_blank" rel="noopener noreferrer" href="${esc(href)}"${style}>${esc(label)}</a>`;
  }

  function paperLinks(paper) {
    const links = [];
    if (paper?.oa_url) links.push(linkBtn(paper.oa_url, 'Open PDF'));
    if (paper?.doi) links.push(linkBtn(`https://doi.org/${paper.doi}`, 'DOI'));
    if (paper?.pmid) links.push(linkBtn(`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`, 'PubMed'));
    if (paper?.europe_pmc_url) links.push(linkBtn(paper.europe_pmc_url, 'Europe PMC'));
    return links.join('');
  }

  function paperSummary(paper) {
    const bits = [];
    const authors = Array.isArray(paper?.authors) ? paper.authors.filter(Boolean) : [];
    if (authors.length) bits.push(esc(authors.length > 4 ? `${authors[0]} et al.` : authors.join(', ')));
    if (paper?.year) bits.push(esc(paper.year));
    if (paper?.journal) bits.push('<em>' + esc(paper.journal) + '</em>');
    if (paper?.cited_by_count != null) bits.push(`${fmt(paper.cited_by_count)} cites`);
    return bits.join(' · ') || 'Metadata unavailable';
  }

  function paperTags(paper) {
    const tags = [];
    if (paper?.study_design) tags.push(`<span class="lib-tag">${esc(paper.study_design)}</span>`);
    if (paper?.effect_direction) tags.push(`<span class="lib-tag">${esc(paper.effect_direction)}</span>`);
    if (Array.isArray(paper?.modalities)) {
      for (const modality of paper.modalities.slice(0, 2)) tags.push(`<span class="lib-tag">${esc(_reNormalizeLabel(modality))}</span>`);
    }
    if (Array.isArray(paper?.conditions)) {
      for (const condition of paper.conditions.slice(0, 2)) tags.push(`<span class="lib-tag">${esc(_reNormalizeLabel(condition))}</span>`);
    }
    return tags.join('');
  }

  function resultCard(paper) {
    const abstract = String(paper?.abstract || '').trim();
    const abstractPreview = abstract
      ? (abstract.length > 280 ? abstract.slice(0, 280) + '…' : abstract)
      : '';
    return (
      '<article class="lib-card lib-card--review">' +
        '<div class="lib-card-top">' +
          '<span class="lib-card-name">' + esc(paper?.title || '(untitled)') + '</span>' +
          (paper?.is_oa ? '<span class="lib-badge" style="background:rgba(20,184,166,0.14);color:var(--teal);border:1px solid rgba(20,184,166,0.35)">Open access</span>' : '') +
        '</div>' +
        '<div class="lib-card-meta">' +
          (paper?.year ? '<span class="lib-tag">' + esc(paper.year) + '</span>' : '') +
          (paper?.journal ? '<span class="lib-tag">' + esc(paper.journal) + '</span>' : '') +
          (paper?.pub_types?.[0] ? '<span class="lib-tag">' + esc(paper.pub_types[0]) + '</span>' : '') +
          (paper?.pmid ? '<span class="lib-tag">PMID ' + esc(paper.pmid) + '</span>' : '') +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + paperSummary(paper) + '</div>' +
        (paperTags(paper) ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + paperTags(paper) + '</div>' : '') +
        (abstractPreview ? '<div style="font-size:12px;line-height:1.5;color:var(--text-secondary);margin-top:8px">' + esc(abstractPreview) + '</div>' : '') +
        '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">' +
          paperLinks(paper) +
          '<button class="ch-btn-sm ch-btn-teal" onclick="window._reShowEvidenceDetail(' + Number(paper.id) + ')">Details</button>' +
          '<button class="ch-btn-sm" onclick="window._rePromoteEvidencePaper(' + Number(paper.id) + ')">Promote to Library</button>' +
          '<label class="ch-btn-sm" style="display:inline-flex;gap:4px;align-items:center;cursor:pointer"><input type="checkbox" class="re-ev-pick" value="' + Number(paper.id) + '" style="margin:0"> AI draft</label>' +
        '</div>' +
      '</article>'
    );
  }

  function rankedPaperCard(paper) {
    const links = [];
    if (paper?.record_url) links.push(linkBtn(paper.record_url, 'Open record'));
    if (paper?.doi) links.push(linkBtn(`https://doi.org/${paper.doi}`, 'DOI'));
    if (paper?.pmid) links.push(linkBtn(`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`, 'PubMed'));
    const summary = String(paper?.research_summary || '').trim();
    return (
      '<article class="lib-card lib-card--evidence">' +
        '<div class="lib-card-top">' +
          '<span class="lib-card-name">' + esc(paper?.title || '(untitled)') + '</span>' +
          (paper?.evidence_tier ? gradeBadge(paper.evidence_tier) : '') +
        '</div>' +
        '<div class="lib-card-meta">' +
          (paper?.year ? '<span class="lib-tag">' + esc(paper.year) + '</span>' : '') +
          (paper?.journal ? '<span class="lib-tag">' + esc(paper.journal) + '</span>' : '') +
          (paper?.study_type_normalized ? '<span class="lib-tag">' + esc(paper.study_type_normalized) + '</span>' : '') +
          (paper?.primary_modality ? '<span class="lib-tag">' + esc(_reNormalizeLabel(paper.primary_modality)) + '</span>' : '') +
        '</div>' +
        (paper?.authors ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + esc(paper.authors) + '</div>' : '') +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--text-tertiary);margin-top:6px">' +
          '<span>Priority ' + esc(paper.priority_score || 0) + '</span>' +
          '<span>Confidence ' + esc(paper.paper_confidence_score || 0) + '</span>' +
          '<span>Trials ' + esc(paper.trial_match_count || 0) + '</span>' +
          '<span>FDA ' + esc(paper.fda_match_count || 0) + '</span>' +
        '</div>' +
        (summary ? '<div style="font-size:12px;line-height:1.5;color:var(--text-secondary);margin-top:8px">' + esc(summary.length > 220 ? summary.slice(0, 220) + '…' : summary) + '</div>' : '') +
        (links.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + links.join('') + '</div>' : '') +
      '</article>'
    );
  }

  function renderContextPanel(graphRows, trials, devices, rankedRows = []) {
    const graphHtml = graphRows.length
      ? graphRows.map((row) => (
          '<div style="padding:10px 0;border-bottom:1px solid var(--border)">' +
            '<div style="font-size:12px;font-weight:600">' +
              esc(_reNormalizeLabel(row.modality || 'Modality')) +
              (row.indication ? ' · ' + esc(_reNormalizeLabel(row.indication)) : '') +
            '</div>' +
            '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' +
              esc(row.target || 'Target') +
              (row.paper_count != null ? ' · ' + fmt(row.paper_count) + ' papers' : '') +
              (row.year_min || row.year_max ? ` · ${esc(row.year_min || '—')}–${esc(row.year_max || '—')}` : '') +
            '</div>' +
          '</div>'
        )).join('')
      : '<div class="ch-empty" style="padding:10px 0">No graph rows matched the current search scope.</div>';
    const trialHtml = trials.length
      ? trials.map((row) => (
          '<div style="padding:10px 0;border-bottom:1px solid var(--border)">' +
            '<div style="font-size:12px;font-weight:600">' + esc(row.title || row.nct_id || 'Trial') + '</div>' +
            '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' +
              esc(row.nct_id || '') +
              (row.status ? ' · ' + esc(row.status) : '') +
              (row.phase ? ' · ' + esc(row.phase) : '') +
            '</div>' +
          '</div>'
        )).join('')
      : '<div class="ch-empty" style="padding:10px 0">No trial rows matched the current scope.</div>';
    const deviceHtml = devices.length
      ? devices.map((row) => (
          '<div style="padding:10px 0;border-bottom:1px solid var(--border)">' +
            '<div style="font-size:12px;font-weight:600">' + esc(row.trade_name || row.applicant || row.number || 'Device') + '</div>' +
            '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' +
              esc((row.kind || '').toUpperCase()) +
              (row.number ? ' · ' + esc(row.number) : '') +
              (row.decision_date ? ' · ' + esc(row.decision_date) : '') +
            '</div>' +
          '</div>'
        )).join('')
      : '<div class="ch-empty" style="padding:10px 0">No FDA device rows matched the current scope.</div>';
    const rankedHtml = rankedRows.length
      ? rankedRows.map(rankedPaperCard).join('')
      : '<div class="ch-empty" style="padding:10px 0">No ranked research-paper rows matched the current scope.</div>';

    return '' +
      '<div class="ch-card" style="margin-bottom:16px">' +
        '<div class="ch-card-hd"><span class="ch-card-title">Ranked Research Context</span></div>' +
        '<div style="padding:0 16px 16px">' + rankedHtml + '</div>' +
      '</div>' +
      '<div class="ch-card" style="margin-bottom:16px">' +
        '<div class="ch-card-hd"><span class="ch-card-title">Live Evidence Graph Links</span></div>' +
        '<div style="padding:0 16px 16px">' + graphHtml + '</div>' +
      '</div>' +
      '<div class="ch-card" style="margin-bottom:16px">' +
        '<div class="ch-card-hd"><span class="ch-card-title">Trial Signals</span></div>' +
        '<div style="padding:0 16px 16px">' + trialHtml + '</div>' +
      '</div>' +
      '<div class="ch-card">' +
        '<div class="ch-card-hd"><span class="ch-card-title">FDA Device Signals</span></div>' +
        '<div style="padding:0 16px 16px">' + deviceHtml + '</div>' +
      '</div>';
  }

  function renderDetailPanel(detail) {
    if (!detail) {
      return '<div class="ch-empty" style="padding:24px 16px">Select a paper to inspect abstract, methods, and outbound links.</div>';
    }
    const abstract = String(detail.abstract || '').trim();
    return (
      '<div class="ch-card">' +
        '<div class="ch-card-hd"><span class="ch-card-title">Paper Detail</span></div>' +
        '<div style="padding:14px 16px">' +
          '<div style="font-size:15px;font-weight:700;line-height:1.4">' + esc(detail.title || '(untitled)') + '</div>' +
          '<div style="font-size:11.5px;color:var(--text-tertiary);margin-top:6px">' + paperSummary(detail) + '</div>' +
          (paperTags(detail) ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + paperTags(detail) + '</div>' : '') +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">' + paperLinks(detail) + '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px">' +
            '<div style="padding:10px;border:1px solid var(--border);border-radius:8px"><div style="font-size:10px;color:var(--text-tertiary)">Primary outcome</div><div style="font-size:12px;margin-top:4px">' + esc(detail.primary_outcome_measure || '—') + '</div></div>' +
            '<div style="padding:10px;border:1px solid var(--border);border-radius:8px"><div style="font-size:10px;color:var(--text-tertiary)">Sample size</div><div style="font-size:12px;margin-top:4px">' + esc(detail.sample_size || '—') + '</div></div>' +
            '<div style="padding:10px;border:1px solid var(--border);border-radius:8px"><div style="font-size:10px;color:var(--text-tertiary)">Study design</div><div style="font-size:12px;margin-top:4px">' + esc(detail.study_design || '—') + '</div></div>' +
            '<div style="padding:10px;border:1px solid var(--border);border-radius:8px"><div style="font-size:10px;color:var(--text-tertiary)">Effect direction</div><div style="font-size:12px;margin-top:4px">' + esc(detail.effect_direction || '—') + '</div></div>' +
          '</div>' +
          '<div style="margin-top:14px">' +
            '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Abstract</div>' +
            '<div style="white-space:pre-wrap;font-size:12.5px;line-height:1.6;color:var(--text-secondary)">' + esc(abstract || 'Abstract unavailable for this record.') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ── window handlers ─────────────────────────────────────────────────── */
  window._reRenderSearchPanels = () => {
    const detailHost = document.getElementById('re-ev-paper-detail');
    if (detailHost) detailHost.innerHTML = renderDetailPanel(window._reDetailData || null);
    _reRenderEvidenceBasketPanel();
  };
  window._reToggleEvidenceBasket = (key) => {
    const cache = window._reEvidenceBasketCache || {};
    const next = _reReadEvidenceBasket();
    const idx = next.findIndex((item) => item.key === key);
    if (idx >= 0) next.splice(idx, 1);
    else if (cache[key]) next.unshift(cache[key]);
    _reWriteEvidenceBasket(next);
    window._reRenderSearchPanels?.();
  };
  window._reShowEvidenceDetail = async (paperId) => {
    try {
      const detail = await api.evidenceTerminalPaper(paperId);
      // Render detail panel — implementation in parent/caller
      window._reDetailData = detail;
      if (window._reRenderSearchPanels) {
        window._reRenderSearchPanels();
      }
    } catch (e) {
      const code = e?.status;
      let msg = e?.message || 'Unknown error';
      if (code === 401) msg = 'Sign in as a clinician to view paper details.';
      if (code === 404) msg = 'Paper not found.';
      window._dsToast?.({ title: 'Detail fetch failed', body: msg, severity: 'error' });
    }
  };
  window._rePromoteEvidencePaper = async (paperId) => {
    try {
      await api.promoteEvidencePaper(paperId);
      window._dsToast?.({ title: 'Promoted to library', body: `Paper #${paperId}`, severity: 'success' });
    } catch (e) {
      const code = e?.status;
      let msg = e?.message || 'Unknown error';
      if (code === 401) msg = 'Sign in as a clinician to promote papers.';
      if (code === 403) msg = 'Your role cannot promote papers (clinician required).';
      if (code === 503) msg = 'Evidence index unavailable — promotion cannot complete.';
      window._dsToast?.({ title: 'Promote failed', body: msg, severity: 'error' });
    }
  };
  window._libPromoteExternal = async (paperId, title) => {
    try {
      await api.promoteEvidencePaper(paperId);
      window._dsToast?.({ title: 'Promoted to library', body: String(title || '').slice(0, 80), severity: 'success' });
    } catch (e) {
      const code = e?.status;
      let msg = e?.message || 'Unknown error';
      if (code === 401) msg = 'Sign in as a clinician to promote papers.';
      if (code === 403) msg = 'Your role cannot promote papers (clinician required).';
      if (code === 503) msg = 'Evidence index unavailable — promotion cannot complete.';
      window._dsToast?.({ title: 'Promote failed', body: msg, severity: 'error' });
    }
  };
  window._reRunEvSearchChip = (q) => {
    const el = document.getElementById('lib-ext-q');
    if (el) el.value = q;
    window._libUnifiedEvidenceSearch();
  };

  window._reExploreGraphQuery = (q) => {
    const el = document.getElementById('lib-ext-q');
    if (el) el.value = String(q || '');
    const sel = document.getElementById('re-ev-search-source');
    if (sel) sel.value = 'indexed';
    window._libUnifiedEvidenceSearch?.();
  };

  window._reRefreshEvidenceSearchPanels = async (fts, rawQ, indexedOk) => {
    const graphHost = document.getElementById('re-ev-evidence-relationship-panel');
    const tdHost = document.getElementById('re-ev-trials-devices');
    if (graphHost) {
      graphHost.innerHTML =
        '<div style="padding:16px;text-align:center">' + spinner() + '</div>';
      try {
        const rows = await api.listResearchEvidenceGraph({ limit: 48 });
        const qlow = String(rawQ || '').toLowerCase();
        const parts = qlow.split(/\s+/).filter((w) => w.length > 2);
        const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
          if (!parts.length) return true;
          const blob = [row.indication, row.modality, row.target].join(' ').toLowerCase();
          return parts.some((p) => blob.includes(p));
        }).slice(0, 14);
        if (!filtered.length) {
          graphHost.innerHTML =
            '<div class="ch-empty" style="font-size:12px">No evidence-graph rows matched this query. Try broader keywords or check the neuromodulation research bundle.</div>';
        } else {
          graphHost.innerHTML =
            '<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 12px;line-height:1.45"><strong>Evidence relationship summary.</strong> Graph weights are literature-index summaries, not clinical recommendations.</p>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">' +
            filtered
              .map((row) => {
                const exploreQ = [row.modality, row.indication].filter(Boolean).join(' ').trim();
                return (
                  '<div class="ch-card" style="padding:12px;font-size:12px">' +
                  '<div style="font-weight:600;margin-bottom:6px">' +
                  esc(_reNormalizeLabel(row.modality || '—')) +
                  ' · ' +
                  esc(_reNormalizeLabel(row.indication || '—')) +
                  (row.target ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + esc(row.target) + '</div>' : '') +
                  '</div>' +
                  '<div style="color:var(--text-tertiary);font-size:11px;line-height:1.45">' +
                  fmt(row.paper_count || 0) +
                  ' papers · citations Σ ' +
                  fmt(row.citation_sum || 0) +
                  ' · weight Σ ' +
                  fmt(row.evidence_weight_sum || 0) +
                  ' · OA ' +
                  fmt(row.open_access_count || 0) +
                  (row.year_min != null && row.year_max != null
                    ? ' · years ' + esc(String(row.year_min)) + '–' + esc(String(row.year_max))
                    : '') +
                  '</div>' +
                  (row.top_study_types
                    ? '<div style="margin-top:6px;font-size:10px;color:var(--text-tertiary)">Study types: ' +
                      esc(String(row.top_study_types).slice(0, 140)) +
                      (String(row.top_study_types).length > 140 ? '…' : '') +
                      '</div>'
                    : '') +
                  (row.top_safety_tags
                    ? '<div style="margin-top:4px;font-size:10px;color:var(--rose)">Safety tags: ' +
                      esc(String(row.top_safety_tags).slice(0, 140)) +
                      '</div>'
                    : '') +
                  '<div style="margin-top:8px">' +
                  '<button type="button" class="btn btn-ghost btn-xs" onclick="window._reExploreGraphQuery(' +
                  JSON.stringify(exploreQ || rawQ) +
                  ')">Explore papers</button>' +
                  '</div>' +
                  '</div>'
                );
              })
              .join('') +
            '</div>';
        }
      } catch {
        graphHost.innerHTML =
          '<div class="ch-empty" style="font-size:12px">Evidence graph API unavailable (research bundle or session). This panel is not a treatment recommendation.</div>';
      }
    }
    if (tdHost) {
      if (!indexedOk) {
        tdHost.innerHTML =
          '<div class="ch-card" style="padding:12px;font-size:12px;color:var(--text-secondary)">Trials/devices search is not connected in this preview (indexed corpus unavailable).</div>';
        return;
      }
      if (!fts || String(fts).trim().length < 2) {
        tdHost.innerHTML =
          '<div class="ch-empty" style="font-size:11px">Enter a search query to load related trials/device corpus rows.</div>';
        return;
      }
      tdHost.innerHTML = '<div style="padding:12px;text-align:center">' + spinner() + '</div>';
      try {
        const [tRes, dRes] = await Promise.allSettled([
          api.searchEvidenceTrials({ q: String(fts || '').slice(0, 160), limit: 8 }),
          api.searchEvidenceDevices({ limit: 8 }),
        ]);
        const trials = tRes.status === 'fulfilled' && Array.isArray(tRes.value) ? tRes.value : [];
        const devices = dRes.status === 'fulfilled' && Array.isArray(dRes.value) ? dRes.value : [];
        tdHost.innerHTML =
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">' +
          '<div class="ch-card" style="padding:12px"><strong style="font-size:12px">Related trials (corpus)</strong>' +
          '<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;line-height:1.45">' +
          (trials.length
            ? trials
                .slice(0, 6)
                .map(
                  (t) =>
                    '<div style="margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:8px">' +
                    '<div style="font-weight:600;font-size:12px">' +
                    esc(t.title || t.nct_id || 'Trial') +
                    '</div>' +
                    '<div style="font-size:10px;color:var(--text-tertiary)">' +
                    esc(t.nct_id || '') +
                    ' · ' +
                    esc(t.status || '') +
                    '</div></div>',
                )
                .join('')
            : '<span style="color:var(--text-tertiary)">No trial rows returned for this query.</span>') +
          '</div></div>' +
          '<div class="ch-card" style="padding:12px"><strong style="font-size:12px">FDA device records (corpus)</strong>' +
          '<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;line-height:1.45">' +
          (devices.length
            ? devices
                .slice(0, 6)
                .map(
                  (d) =>
                    '<div style="margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:8px">' +
                    '<div style="font-weight:600;font-size:12px">' +
                    esc(d.trade_name || d.number || 'Device') +
                    '</div>' +
                    '<div style="font-size:10px;color:var(--text-tertiary)">' +
                    esc(d.kind || '') +
                    ' · ' +
                    esc(d.number || '') +
                    '</div></div>',
                )
                .join('')
            : '<span style="color:var(--text-tertiary)">No device rows returned.</span>') +
          '</div></div>' +
          '</div>';
      } catch {
        tdHost.innerHTML =
          '<div class="ch-empty" style="font-size:12px">Trials/devices lookup failed. Verify clinician session and evidence API.</div>';
      }
    }
  };

  window._libUnifiedEvidenceSearch = async () => {
    const input = document.getElementById('lib-ext-q');
    const sourceSel = document.getElementById('re-ev-search-source');
    const cSel = document.getElementById('lib-ext-cond');
    const out = document.getElementById('re-ev-search-results');
    const noteEl = document.getElementById('re-ev-expanded-note');
    if (!input || !out) return;
    const rawQ = (input.value || '').trim();
    if (rawQ.length < 2) {
      out.innerHTML = '<div class="ch-empty">Type at least 2 characters.</div>';
      return;
    }
    const { fts, notes } = _reExpandEvidenceSearchQuery(rawQ);
    if (noteEl) {
      noteEl.innerHTML = notes
        ? '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px;line-height:1.45">' + esc(notes) + '</div>'
        : '';
    }
    out.innerHTML =
      '<div style="padding:24px;text-align:center">' +
      spinner() +
      '<div style="margin-top:12px;font-size:12px;color:var(--text-secondary)">Searching evidence sources…</div></div>';

    const readEvSearchFilters = () => {
      const modEl = document.getElementById('re-ev-filter-modality');
      const gradeEl = document.getElementById('re-ev-filter-grade');
      const yMin = document.getElementById('re-ev-year-min');
      const yMax = document.getElementById('re-ev-year-max');
      const oaEl = document.getElementById('re-ev-oa-only');
      const absEl = document.getElementById('re-ev-has-abstract');
      const condTok = document.getElementById('re-ev-condition-token');
      const modality = (modEl?.value || '').trim();
      const grade = (gradeEl?.value || '').trim();
      let year_min = yMin?.value ? parseInt(yMin.value, 10) : '';
      let year_max = yMax?.value ? parseInt(yMax.value, 10) : '';
      if (year_min !== '' && (year_min < 1900 || year_min > 2100)) year_min = '';
      if (year_max !== '' && (year_max < 1900 || year_max > 2100)) year_max = '';
      const oa_only = !!(oaEl?.checked);
      const has_abstract = absEl?.checked === true ? true : undefined;
      const condition = (condTok?.value || '').trim();
      return { modality, grade, year_min, year_max, oa_only, has_abstract, condition };
    };

    const source = sourceSel ? sourceSel.value : 'all';
    const conditionId = cSel?.value || null;
    const curatedSnap = window._reCuratedLitSnapshot || [];
    const chunks = [];
    const seen = new Set();
    const ixUnavailable = indexedPaperCount <= 0;

    const pushAiToolbar = () =>
      '<div style="display:flex;gap:8px;align-items:center;margin:14px 0;flex-wrap:wrap">' +
      '<button type="button" class="ch-btn-sm ch-btn-teal" onclick="window._libAiDraft()">✦ Summarise selected</button>' +
      '<span style="font-size:11px;color:var(--text-tertiary)">AI-assisted draft only — clinician review required.</span>' +
      '</div>' +
      '<div id="lib-ai-draft-panel"></div>';

    const filters = readEvSearchFilters();

    try {
      const terminalSearch = await api.evidenceTerminalSearch({
        q: fts,
        source,
        conditionId: conditionId || '',
        indication: conditionId || '',
        modality: filters.modality || '',
        grade: filters.grade || '',
        oa_only: filters.oa_only,
        year_min: filters.year_min === '' ? '' : filters.year_min,
        year_max: filters.year_max === '' ? '' : filters.year_max,
        has_abstract: filters.has_abstract,
        condition: filters.condition || '',
        limit: 48,
        graphLimit: 14,
        trialLimit: 8,
        deviceLimit: 8,
        rankedLimit: 14,
      });
      const indexedRows = Array.isArray(terminalSearch?.indexed) ? terminalSearch.indexed : [];
      const brokeredPayload = terminalSearch?.brokered || { items: [] };
      const brokeredItemsRaw = Array.isArray(brokeredPayload?.items) ? brokeredPayload.items : [];
      const graphRows = Array.isArray(terminalSearch?.evidenceGraph) ? terminalSearch.evidenceGraph : [];
      const trials = Array.isArray(terminalSearch?.trials) ? terminalSearch.trials : [];
      const devices = Array.isArray(terminalSearch?.devices) ? terminalSearch.devices : [];
      const rankedRows = Array.isArray(terminalSearch?.ranked) ? terminalSearch.ranked : [];

      if (ixUnavailable && (source === 'all' || source === 'indexed')) {
        chunks.push(
          '<div class="ch-card" style="margin-bottom:12px;padding:12px 14px;border-left:3px solid var(--amber);background:rgba(245,158,11,0.06);font-size:12px;color:var(--text-secondary)">' +
            '<strong style="color:var(--amber)">Indexed evidence corpus unavailable in this preview environment.</strong> ' +
            'Search results may be limited to brokered or curated fallback sources. Corpus availability is read from <code style="font-size:10px">GET /api/v1/evidence/status</code> — not hard-coded.</div>',
        );
      }

      if (source === 'indexed' && ixUnavailable) {
        chunks.push(
          '<div class="ch-empty" style="margin-bottom:12px">Indexed corpus search requires a non-empty evidence database on the API host (<code style="font-size:10px">EVIDENCE_DB_PATH</code>).</div>',
        );
      } else if (source === 'all' || source === 'indexed') {
        if (terminalSearch?.errors?.indexed) {
          chunks.push(_reEvidenceSearchErrorHtml('Indexed corpus search', terminalSearch.errors.indexed));
        } else {
          indexedRows.forEach((p) => seen.add(_reDedupeKey(p, 'ix')));
          if (indexedRows.length) {
            chunks.push(
              '<div style="font-size:12px;font-weight:600;margin:12px 0 8px;color:var(--text-secondary)">' +
                '<span class="lib-badge" style="background:rgba(45,212,191,0.15);color:var(--teal);border:1px solid rgba(45,212,191,0.35)">Indexed DB</span> · ' +
                indexedRows.length +
                ' result(s)</div>' +
                '<div class="lib-grid">' +
                indexedRows.map((p) => renderEvidenceResultCard(p, 'indexed')).join('') +
                '</div>',
            );
          } else if (source === 'indexed') {
            chunks.push(_reEmptyVerifiedEvidenceHtml());
          }
        }
      }

      if (source === 'all' || source === 'brokered') {
        if (terminalSearch?.errors?.brokered) {
          chunks.push(_reEvidenceSearchErrorHtml('Brokered literature search', terminalSearch.errors.brokered));
        } else {
          const items = brokeredItemsRaw.filter((r) => {
            const k = _reDedupeKey(r, 'br');
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          if (items.length) {
            chunks.push(
              '<div class="lib-trust-banner" role="note" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);padding:10px 14px;border-radius:8px;font-size:12px;margin:16px 0 12px">' +
                '<b style="color:var(--amber)">Brokered external literature service</b> — ' +
                esc(brokeredPayload.notice || '') +
                '<br><span style="opacity:0.75">Provenance: ' +
                esc(brokeredPayload.provenance || '—') +
                ' · Last checked: ' +
                esc((brokeredPayload.last_checked_at || '').slice(0, 19)) +
                '</span></div>',
            );
            chunks.push(
              '<div style="font-size:12px;font-weight:600;margin:8px 0;color:var(--text-secondary)">' +
                '<span class="lib-badge" style="background:rgba(245,158,11,0.14);color:var(--amber)">Brokered search</span> · ' +
                items.length +
                ' result(s)</div>',
            );
            chunks.push('<div class="lib-grid">' + items.map((r) => renderEvidenceResultCard(r, 'brokered')).join('') + '</div>');
          } else if (source === 'brokered') {
            chunks.push(_reEmptyVerifiedEvidenceHtml());
          }
        }
      }

      if (source === 'all' || source === 'curated') {
        const curatedHits = _reFilterCuratedLiterature(curatedSnap, rawQ).filter((p) => {
          const k = _reDedupeKey(
            {
              ...p,
              id: p.id ?? p.pmid ?? p.doi ?? p.title,
              pmid: p.pmid,
              doi: p.doi,
              title: p.title,
              year: p.year,
            },
            'cu',
          );
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        if (curatedHits.length) {
          chunks.push(
            '<div style="font-size:12px;font-weight:600;margin:16px 0 8px;color:var(--text-secondary)">' +
              '<span class="lib-badge" style="background:rgba(139,92,246,0.14);color:var(--violet)">Curated library</span> · ' +
              curatedHits.length +
              ' match(es)</div>',
          );
          chunks.push(
            '<div class="lib-grid">' +
              curatedHits
                .slice(0, 40)
                .map((p) =>
                  renderEvidenceResultCard(
                    {
                      title: p.title,
                      year: p.year,
                      journal: p.journal,
                      authors:
                        typeof p.authors === 'string'
                          ? p.authors
                          : Array.isArray(p.authors)
                            ? p.authors.join(', ')
                            : '',
                      abstract: p.abstract,
                      pmid: p.pmid,
                      doi: p.doi,
                      oa_url: p.oa_url,
                      url: p.url,
                      condition: p.condition,
                      study_type: p.study_type,
                      evidence_grade: p.evidence_grade,
                      pub_types: p.study_type ? [p.study_type] : [],
                    },
                    'curated',
                    { promote: false },
                  ),
                )
                .join('') +
              '</div>',
          );
        } else if (source === 'curated') {
          chunks.push(
            '<div class="ch-empty">No curated library records matched this query. Promote papers from indexed results first.</div>',
          );
        }
      }

      const htmlOut = chunks.join('');
      const hasGrid = htmlOut.includes('lib-grid');
      const hasErr = htmlOut.includes('border-left:3px solid var(--rose)');
      if (!hasGrid && !hasErr) {
        out.innerHTML = _reEmptyVerifiedEvidenceHtml();
      } else {
        out.innerHTML = htmlOut + (hasGrid ? pushAiToolbar() : '');
      }
      const terminalTableHost = document.getElementById('re-ev-terminal-table');
      if (terminalTableHost) {
        const terminalRows = []
          .concat(indexedRows.map((row) => ({ ...row, __sourceType: 'indexed', __sourceLabel: 'Indexed DB' })))
          .concat(brokeredItemsRaw.map((row) => ({ ...row, __sourceType: 'brokered', __sourceLabel: 'Brokered search' })))
          .concat(rankedRows.map((row) => ({
            id: row.id,
            title: row.title,
            journal: row.journal,
            year: row.year,
            pmid: row.pmid,
            doi: row.doi,
            study_design: row.study_type_normalized,
            is_oa: row.open_access_flag,
            __sourceType: 'research',
            __sourceLabel: 'Research bundle',
          })));
        terminalTableHost.innerHTML = _reRenderTerminalResultsTable(terminalRows);
      }

      const rankedHost = document.getElementById('re-ev-ranked-results');
      if (rankedHost) {
        if (terminalSearch?.errors?.ranked) {
          rankedHost.innerHTML =
            '<div class="ch-empty" style="font-size:11px">Research ranked papers API unavailable.</div>';
        } else if (!rankedRows.length) {
          rankedHost.innerHTML =
            '<div class="ch-empty" style="font-size:11px">No neuromodulation bundle ranked rows for this query (bundle may be offline).</div>';
        } else {
          rankedHost.innerHTML =
            '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px;line-height:1.45"><strong>Ranked research view</strong> (neuromodulation CSV bundle) — optional orientation only; primary physician search remains SQLite FTS above.</div>' +
            '<div class="lib-grid">' +
            rankedRows
              .map((row) =>
                renderEvidenceResultCard(
                  {
                    title: row.title,
                    year: row.year,
                    journal: row.journal,
                    authors: row.authors,
                    doi: row.doi,
                    pmid: row.pmid,
                    modalities: row.canonical_modalities || (row.primary_modality ? [row.primary_modality] : []),
                    conditions: row.indication_tags || [],
                    study_design: row.study_type_normalized,
                    evidence_grade: row.evidence_tier,
                    abstract: row.research_summary,
                    open_access_flag: row.open_access_flag,
                    is_oa: row.open_access_flag,
                    oa_url: row.record_url,
                    url: row.record_url,
                  },
                  'research',
                  { promote: false },
                ),
              )
              .join('') +
            '</div>';
        }
      }

      const graphHost = document.getElementById('re-ev-evidence-relationship-panel');
      if (graphHost) {
        if (terminalSearch?.errors?.evidenceGraph) {
          graphHost.innerHTML =
            '<div class="ch-empty" style="font-size:12px">Evidence graph API unavailable (research bundle or session). This panel is not a treatment recommendation.</div>';
        } else if (!graphRows.length) {
          graphHost.innerHTML =
            '<div class="ch-empty" style="font-size:12px">No evidence-graph rows matched this query. Try broader keywords or check the neuromodulation research bundle.</div>';
        } else {
          graphHost.innerHTML =
            '<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 12px;line-height:1.45"><strong>Evidence relationship summary.</strong> Graph weights are literature-index summaries, not clinical recommendations.</p>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">' +
            graphRows.map((row) => {
              const exploreQ = [row.modality, row.indication].filter(Boolean).join(' ').trim();
              return '<div class="ch-card" style="padding:12px;font-size:12px">' +
                '<div style="font-weight:600;margin-bottom:6px">' +
                esc(_reNormalizeLabel(row.modality || '—')) +
                ' · ' +
                esc(_reNormalizeLabel(row.indication || '—')) +
                (row.target ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + esc(row.target) + '</div>' : '') +
                '</div>' +
                '<div style="color:var(--text-tertiary);font-size:11px;line-height:1.45">' +
                fmt(row.paper_count || 0) +
                ' papers · citations Σ ' +
                fmt(row.citation_sum || 0) +
                ' · weight Σ ' +
                fmt(row.evidence_weight_sum || 0) +
                ' · OA ' +
                fmt(row.open_access_count || 0) +
                (row.year_min != null && row.year_max != null ? ' · years ' + esc(String(row.year_min)) + '–' + esc(String(row.year_max)) : '') +
                '</div>' +
                (row.top_study_types ? '<div style="margin-top:6px;font-size:10px;color:var(--text-tertiary)">Study types: ' + esc(String(row.top_study_types).slice(0, 140)) + (String(row.top_study_types).length > 140 ? '…' : '') + '</div>' : '') +
                (row.top_safety_tags ? '<div style="margin-top:4px;font-size:10px;color:var(--rose)">Safety tags: ' + esc(String(row.top_safety_tags).slice(0, 140)) + '</div>' : '') +
                '<div style="margin-top:8px"><button type="button" class="btn btn-ghost btn-xs" onclick="window._reExploreGraphQuery(' + JSON.stringify(exploreQ || rawQ) + ')">Explore papers</button></div>' +
                '</div>';
            }).join('') +
            '</div>';
        }
      }
      const tdHost = document.getElementById('re-ev-trials-devices');
      if (tdHost) {
        if (!indexedPaperCount) {
          tdHost.innerHTML =
            '<div class="ch-card" style="padding:12px;font-size:12px;color:var(--text-secondary)">Trials/devices search is not connected in this preview (indexed corpus unavailable).</div>';
        } else if (terminalSearch?.errors?.trials || terminalSearch?.errors?.devices) {
          tdHost.innerHTML =
            '<div class="ch-empty" style="font-size:12px">Trials/devices lookup failed. Verify clinician session and evidence API.</div>';
        } else if (!fts || String(fts).trim().length < 2) {
          tdHost.innerHTML =
            '<div class="ch-empty" style="font-size:11px">Enter a search query to load related trials/device corpus rows.</div>';
        } else {
          tdHost.innerHTML =
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">' +
            '<div class="ch-card" style="padding:12px"><strong style="font-size:12px">Related trials (corpus)</strong>' +
            '<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;line-height:1.45">' +
            (trials.length
              ? trials.slice(0, 6).map((t) => '<div style="margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:8px"><div style="font-weight:600;font-size:12px">' + esc(t.title || t.nct_id || 'Trial') + '</div><div style="font-size:10px;color:var(--text-tertiary)">' + esc(t.nct_id || '') + ' · ' + esc(t.status || '') + '</div></div>').join('')
              : '<span style="color:var(--text-tertiary)">No trial rows returned for this query.</span>') +
            '</div></div>' +
            '<div class="ch-card" style="padding:12px"><strong style="font-size:12px">FDA device records (corpus)</strong>' +
            '<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;line-height:1.45">' +
            (devices.length
              ? devices.slice(0, 6).map((d) => '<div style="margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:8px"><div style="font-weight:600;font-size:12px">' + esc(d.trade_name || d.number || 'Device') + '</div><div style="font-size:10px;color:var(--text-tertiary)">' + esc(d.kind || '') + ' · ' + esc(d.number || '') + '</div></div>').join('')
              : '<span style="color:var(--text-tertiary)">No device rows returned.</span>') +
            '</div></div>' +
            '</div>';
        }
      }
      window._reDetailData = null;
      window._reRenderSearchPanels?.();
    } catch (e) {
      out.innerHTML = _reEvidenceSearchErrorHtml('Evidence search', e);
    }
  };
  window._libExternalSearch = window._libUnifiedEvidenceSearch;
  window._libAiDraft = async () => {
    const picks = Array.from(document.querySelectorAll('.lib-ai-pick:checked')).map(n => Number(n.value)).filter(Boolean);
    const panel = document.getElementById('lib-ai-draft-panel');
    if (!panel) return;
    if (!picks.length) { panel.innerHTML = '<div class="ch-empty">Select at least one paper with the AI draft checkbox.</div>'; return; }
    panel.innerHTML = spinner();
    try {
      const res = await api.librarySummarizeEvidence({ paper_ids: picks });
      const cites = (res?.source_citations || []).map(c =>
        '<li style="margin-bottom:3px">[#' + Number(c.paper_id) + '] ' + esc(c.title || '') + ' — ' + esc(c.journal || '') + ' ' + esc(c.year || '') + '</li>'
      ).join('');
      panel.innerHTML =
        '<div class="ch-card" style="border-left:3px solid var(--violet)">' +
          '<div class="ch-card-hd"><span class="ch-card-title">AI Evidence Draft</span>' +
            '<span class="lib-badge" style="background:rgba(139,92,246,0.14);color:var(--violet);border:1px solid rgba(139,92,246,0.3)">DRAFT · AI generated</span>' +
          '</div>' +
          '<div style="padding:14px 16px">' +
            '<div style="white-space:pre-wrap;font-size:13px;line-height:1.55">' + esc(res?.draft_text || '') + '</div>' +
            '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">' +
              '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Source citations (' + (res?.source_paper_ids?.length || 0) + ')</div>' +
              '<ul style="font-size:11.5px;color:var(--text-secondary);padding-left:18px;margin:0">' + cites + '</ul>' +
            '</div>' +
            '<div style="margin-top:12px;font-size:11px;color:var(--amber);background:rgba(245,158,11,0.08);padding:8px 10px;border-radius:6px">' +
              esc(res?.reviewer_notice || 'Draft must be reviewed by a clinician before clinical use.') +
            '</div>' +
          '</div>' +
        '</div>';
    } catch (e) {
      const code = e?.status;
      let msg = e?.message || 'chat service unavailable';
      if (code === 401 || code === 403) msg = 'Sign in as a clinician to generate AI-assisted drafts.';
      if (code === 503) msg = 'Evidence DB or AI provider unavailable — draft cannot be generated.';
      if (code === 404) msg = 'Selected papers were not found in the evidence index.';
      panel.innerHTML =
        '<div class="ch-empty" style="color:var(--red)">AI-assisted draft unavailable: ' + esc(msg) + '</div>' +
        '<p style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Drafts cite ingested abstracts only — they are not systematic reviews unless explicitly produced as such elsewhere.</p>';
    }
  };

  /* ── HTML ─────────────────────────────────────────────────────────────── */
  const exampleQueries = [
    'depression rTMS',
    'ASD tDCS',
    'ADHD neurofeedback',
    'chronic pain TPS',
    'Alzheimer TPS',
    'anxiety tDCS',
    'OCD rTMS',
  ];
  const exampleChipRow =
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;align-items:center">' +
    '<span style="font-size:11px;color:var(--text-tertiary)">Example queries:</span>' +
    exampleQueries
      .map(
        (q) =>
          '<button type="button" class="btn btn-ghost btn-xs" onclick="window._reRunEvSearchChip(' +
          JSON.stringify(q) +
          ')">' +
          esc(q) +
          '</button>',
      )
      .join('') +
    '</div>';

  let html =
    _resWorkspaceHeader(_liveEvidenceUiStats, { shortcuts: true }) +
    libraryAuthNote +
    corpusStatusBanner +
    /* B4: Agent Brain status mount — degrades gracefully when provider not configured.
       mountAgentBrainStatus() is injected by agent-brain-status.js if present. */
    '<div id="agent-brain-status" aria-live="polite" style="margin-bottom:12px"></div>' +
    '<div id="re-live-evidence-host" style="margin-bottom:16px"></div>' +
    '<div class="ch-card" style="margin-bottom:16px;padding:14px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">' +
      '<div style="font-size:12px;color:var(--text-secondary)"><strong>Research export summary</strong> — clinician-only; audits on server.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
        '<button type="button" id="re-export-summary-btn" class="btn btn-ghost btn-sm" onclick="window._resExportEvidenceSummary && window._resExportEvidenceSummary()">Request export summary</button>' +
        '<span id="re-export-summary-status" style="font-size:11px;color:var(--text-tertiary);max-width:280px"></span>' +
      '</div>' +
    '</div>' +
    '<div class="ch-kpi-strip" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-bottom:16px">' +
      kpi('var(--teal)',   curatedRollupDisplay, 'Indexed / curated papers', 'Library overview when signed in; else corpus aggregate from /api/v1/evidence/status') +
      kpi('var(--blue)',   overview?.curated_trial_count != null ? fmt(overview.curated_trial_count) : fmt(_totalEvTrials), 'Trials (rollup)') +
      kpi('var(--blue)',   fmt(_totalEvFda), 'FDA devices') +
      kpi('var(--rose)',   _liveEvidenceUiStats?.totalMetaAnalyses || EVIDENCE_SUMMARY?.totalMetaAnalyses || 0, 'Meta-analyses') +
      kpi('var(--violet)', curatedCount, 'Your library', 'Per-clinician promoted papers') +
      kpi('var(--amber)',  _liveEvidenceUiStats?.totalConditions || CONDITION_EVIDENCE.length, 'Conditions covered') +
      kpi('var(--teal)',   evDbAvailable ? 'Online' : 'Unavailable', 'Evidence index reachability') +
    '</div>' +
    /* Unified evidence search */
    '<div class="ch-card" style="margin-bottom:16px">' +
      '<div class="ch-card-hd"><span class="ch-card-title">Live Indexed Evidence Search</span>' +
        '<span class="lib-badge" style="background:rgba(59,130,246,0.12);color:var(--blue);border:1px solid rgba(59,130,246,0.25)">Corpus + brokered + curated</span>' +
      '</div>' +
      '<div style="padding:14px 16px 10px;font-size:12px;color:var(--text-secondary);line-height:1.55;border-bottom:1px solid var(--border)">' +
        '<strong>Evidence governance.</strong> This page can search the connected evidence corpus when the evidence DB is available. ' +
        'Source badges show whether results are from the live indexed corpus, brokered literature search, or curated library — not bundled registry rollups as verified citations.' +
      '</div>' +
      exampleChipRow +
      '<div style="padding:8px 16px 12px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">' +
        '<div style="min-width:200px;flex:1">' +
          '<label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px" for="re-ev-search-source">Search source</label>' +
          '<select id="re-ev-search-source" class="ph-search-input" style="width:100%">' +
          '<option value="all">All available sources</option>' +
          '<option value="indexed">Evidence DB / indexed corpus</option>' +
          '<option value="brokered">Live brokered search (library router)</option>' +
          '<option value="curated">Curated library only</option>' +
          '</select></div>' +
        '<div style="flex:2;min-width:240px"><label class="sr-only" for="lib-ext-q">Query</label>' +
          '<label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px" for="lib-ext-q">Query</label>' +
          '<input id="lib-ext-q" type="search" value="' + esc(defaultSearch) + '" placeholder="e.g. depression rTMS, ASD tDCS, ADHD neurofeedback" class="ph-search-input" style="width:100%">' +
        '</div>' +
        '<div style="flex:1;min-width:180px"><label class="sr-only" for="lib-ext-cond">Condition scope</label>' +
          '<label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px" for="lib-ext-cond">Condition filter (brokered)</label>' +
          '<select id="lib-ext-cond" class="ph-search-input" style="width:100%">' + condOptions + '</select>' +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-sm" onclick="window._libUnifiedEvidenceSearch()">Search</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="window._reSaveSearchFromUI()" title="Save this search for quick access later">Save</button>' +
      '</div>' +
      '<div style="padding:10px 16px 12px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;border-top:1px solid var(--border)">' +
        '<div style="min-width:140px">' +
          '<label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px" for="re-ev-filter-modality">Modality filter (indexed)</label>' +
          '<select id="re-ev-filter-modality" class="ph-search-input" style="width:100%">' +
          '<option value="">All</option>' +
          '<option value="tms">rTMS / TMS</option>' +
          '<option value="tdcs">tDCS</option>' +
          '<option value="tfus">tFUS</option>' +
          '<option value="tacs">tACS</option>' +
          '<option value="tvns">taVNS</option>' +
          '<option value="dbs">DBS</option>' +
          '<option value="scs">SCS</option>' +
          '</select></div>' +
        '<div style="min-width:108px">' +
          '<label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px" for="re-ev-filter-grade">Grade A–E</label>' +
          '<select id="re-ev-filter-grade" class="ph-search-input" style="width:100%">' +
          '<option value="">All</option>' +
          '<option value="A">A</option><option value="B">B</option><option value="C">C</option>' +
          '<option value="D">D</option><option value="E">E</option>' +
          '</select></div>' +
        '<div style="min-width:76px">' +
          '<label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px" for="re-ev-year-min">Year from</label>' +
          '<input id="re-ev-year-min" type="number" min="1900" max="2100" placeholder="min" class="ph-search-input" style="width:100%">' +
        '</div>' +
        '<div style="min-width:76px">' +
          '<label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px" for="re-ev-year-max">Year to</label>' +
          '<input id="re-ev-year-max" type="number" min="1900" max="2100" placeholder="max" class="ph-search-input" style="width:100%">' +
        '</div>' +
        '<label style="font-size:11px;color:var(--text-secondary);display:flex;gap:6px;align-items:center;margin-top:18px;cursor:pointer;white-space:nowrap">' +
          '<input id="re-ev-oa-only" type="checkbox"> OA only</label>' +
        '<label style="font-size:11px;color:var(--text-secondary);display:flex;gap:6px;align-items:center;margin-top:18px;cursor:pointer;white-space:nowrap">' +
          '<input id="re-ev-has-abstract" type="checkbox"> Has abstract</label>' +
        '<div style="flex:1;min-width:180px">' +
          '<label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px" for="re-ev-condition-token">Condition token (indexed JSON)</label>' +
          '<input id="re-ev-condition-token" type="text" class="ph-search-input" style="width:100%" placeholder="e.g. mdd, asd (optional)">' +
        '</div>' +
      '</div>' +
      '<div id="re-ev-expanded-note" style="padding:0 16px"></div>' +
      '<div style="padding:8px 16px 12px;font-size:11px;color:var(--text-tertiary);line-height:1.5">' +
        '<strong>Indexed corpus:</strong> <code style="font-size:10px">GET /api/v1/evidence/papers</code> (clinician auth). ' +
        '<strong>Brokered:</strong> <code style="font-size:10px">POST /api/v1/library/external-search</code> — server-side FTS over the ingest; never browser PubMed scraping. ' +
        '<strong>Curated:</strong> your promoted library rows (filtered in-browser). Filters apply to the indexed SQLite path; links render only when returned by the API.' +
      '</div>' +
      '<div style="padding:0 16px 12px">' +
        '<div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--text-secondary)">Evidence relationship summary</div>' +
        '<div id="re-ev-evidence-relationship-panel" style="margin-bottom:14px;min-height:40px;font-size:12px;color:var(--text-tertiary)">Loading graph summary…</div>' +
        '<div style="font-weight:600;font-size:13px;margin:8px 0;color:var(--text-secondary)">Related trials/devices signals</div>' +
        '<div id="re-ev-trials-devices" style="margin-bottom:14px;min-height:40px;font-size:12px;color:var(--text-tertiary)">Trials/devices appear after you run a search query.</div>' +
        '<details style="margin-top:8px"><summary style="font-size:12px;cursor:pointer;color:var(--text-secondary)">Optional ranked research view (neuromodulation bundle)</summary>' +
        '<div id="re-ev-ranked-results" style="margin-top:10px;min-height:28px;font-size:12px;color:var(--text-tertiary)"></div></details>' +
      '</div>' +
      '<div id="re-ev-saved-searches" style="padding:0 16px 12px">' + _renderSavedSearches() + '</div>' +
      '<div style="padding:0 16px 16px">' +
        '<div class="ch-card" style="padding:14px;margin-bottom:12px;background:linear-gradient(135deg,rgba(15,23,42,0.32),rgba(15,23,42,0.08))">' +
          '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><div style="font-weight:600;font-size:13px;color:var(--text-primary)">Terminal result table</div><div style="font-size:11px;color:var(--text-tertiary)">Dense cross-source index for quick review and basket curation</div></div>' +
          '<div id="re-ev-terminal-table"></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,.8fr);gap:12px">' +
          '<div id="re-ev-paper-detail"></div>' +
          '<div class="ch-card" style="padding:14px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px"><div style="font-weight:600;font-size:13px">Evidence basket</div><div style="font-size:11px;color:var(--text-tertiary)">Local only</div></div><div style="font-size:11px;color:var(--text-tertiary);line-height:1.45;margin-bottom:10px">Stored in browser localStorage for quick synthesis. It is not shared, audited, or a clinical approval list.</div><div id="re-evidence-basket-panel"></div></div>' +
        '</div>' +
      '</div>' +
      '<div id="re-ev-search-results" style="padding:0 16px 16px;min-height:48px"></div>' +
    '</div>' +
    /* Curated library */
    '<div class="ch-card">' +
      '<div class="ch-card-hd"><span class="ch-card-title">Your curated library (' + curatedCount + ')</span>' +
        '<span style="font-size:11px;color:var(--text-tertiary)">Promoted & manually-added papers</span>' +
      '</div>' +
      (curatedCount
        ? '<div class="lib-grid">' + curatedLitItems.slice(0, 60).map(p => (
            '<article class="lib-card lib-card--evidence" aria-label="' + esc(p.title) + '">' +
              '<div class="lib-card-top">' +
                '<span class="lib-card-name">' + esc(p.title) + '</span>' +
                (p.evidence_grade ? gradeBadge(p.evidence_grade) : '') +
              '</div>' +
              '<div class="lib-card-meta">' +
                (p.year ? '<span class="lib-tag">' + esc(p.year) + '</span>' : '') +
                (p.journal ? '<span class="lib-tag">' + esc(p.journal) + '</span>' : '') +
                (p.study_type ? '<span class="lib-tag">' + esc(p.study_type) + '</span>' : '') +
                (p.condition ? '<span class="lib-tag">' + esc(p.condition) + '</span>' : '') +
              '</div>' +
              (p.authors ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + esc(p.authors) + '</div>' : '') +
              (p.url ? '<div style="margin-top:8px"><a class="ch-btn-sm" target="_blank" rel="noopener noreferrer" href="' + esc(p.url) + '">Open ↗</a></div>' : '') +
            '</article>'
          )).join('') + '</div>'
        : '<div class="ch-empty" style="padding:30px 16px">Your curated library is empty. Run a search above and click <b>Promote to Library</b> on relevant results.</div>') +
    '</div>';

  body.innerHTML = html;

  const condSel = document.getElementById('lib-ext-cond');
  if (condSel) condSel.value = state.filters.indication || '';
  const gradeSel = document.getElementById('re-ev-filter-grade');
  if (gradeSel) gradeSel.value = state.filters.grade || '';
  const searchInput = document.getElementById('lib-ext-q');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window._libUnifiedEvidenceSearch?.();
    });
  }

  const liveHost = document.getElementById('re-live-evidence-host');
  if (liveHost) {
    try {
      await renderLiveEvidencePanel(liveHost, { compact: true });
    } catch {
      liveHost.innerHTML =
        '<div class="ch-card" role="alert" style="padding:14px;font-size:13px;color:var(--text-secondary)">' +
        '<strong>Live indexed search unavailable</strong> in this session (offline, guest, or evidence DB not ingested). ' +
        'Use brokered search below when signed in, or deploy the evidence pipeline.</div>';
    }
  }

  window._reRenderSearchPanels?.();

  // B4: Mount Agent Brain status widget if available (degrades gracefully).
  const agentBrainMount = document.getElementById('agent-brain-status');
  if (agentBrainMount && typeof window.mountAgentBrainStatus === 'function') {
    try {
      window.mountAgentBrainStatus(agentBrainMount, { page: 'evidence', providers: ['assessment'] });
    } catch {}
  }

  if (defaultSearch) {
    window._reSearch = window._reSearch || {};
    window._reSearch.search = defaultSearch;
    window._reEvidencePrefill = null;
    const _input = document.getElementById('lib-ext-q');
    if (_input) {
      try { _input.focus(); _input.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    }
    try { window._libUnifiedEvidenceSearch?.(); } catch {}
  }
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 8 — Needs Review (migrated from Library Hub)
   Unreviewed protocol triage · Literature Watch queue
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderNeedsReview(body) {
  await _ensureProtoData();
  await _ensureResearchBundleData();

  const kpi = (color, value, label, title) =>
    `<div class="ch-kpi-card" style="--kpi-color:${color}"${title ? ` title="${esc(title)}"` : ''}>` +
    `<div class="ch-kpi-val">${esc(value)}</div><div class="ch-kpi-label">${esc(label)}</div></div>`;

  function gradeBadge(grade) {
    const g = String(grade || '').toUpperCase().replace('EV-', '');
    if (!g) return '<span class="lib-tag" title="Evidence grade not recorded">Grade: —</span>';
    const color = { A: 'var(--teal)', B: 'var(--blue)', C: 'var(--amber)', D: 'var(--rose)', E: 'var(--text-tertiary)' }[g] || 'var(--text-tertiary)';
    return `<span class="lib-badge" style="background:${color}22;color:${color};border:1px solid ${color}55" title="Highest reviewed evidence grade">Grade ${esc(g)}</span>`;
  }

  /* ── identify protocols needing review ──────────────────────────────── */
  const _legacyNeedsReviewRows = _protosAll.filter(p =>
    (Array.isArray(p.governance) && p.governance.includes('unreviewed')) ||
    (typeof p.notes === 'string' && /verify/i.test(p.notes))
  );

  /* ── literature watch snapshot ──────────────────────────────────────── */
  if (window._litWatchData === undefined) {
    window._litWatchData = null;
    try {
      const _lwResp = await fetch('/literature-watch.json', { cache: 'no-cache' });
      if (_lwResp.ok) window._litWatchData = await _lwResp.json();
    } catch {}
  }
  const _litSnap  = window._litWatchData || null;
  const _litQueue = (_litSnap && Array.isArray(_litSnap.pending_queue)) ? _litSnap.pending_queue : [];

  /* ── literature paper action handler ────────────────────────────────── */
  window._litPaperAction = async (action, pmid) => {
    const entry = { pmid, action, ts: new Date().toISOString() };
    const label = action === 'mark-relevant'
      ? 'Marked relevant'
      : action === 'promote'
        ? 'Promoted to references'
        : action === 'not-relevant'
          ? 'Marked not relevant'
          : action;
    try {
      await api.curateLiteraturePaper(pmid, action);
    } catch (e) {
      const msg = e?.body?.message || e?.message || 'Backend error';
      window._dsToast?.({ title: 'Curation failed', body: 'PMID ' + pmid + ' · ' + msg, severity: 'error' });
      return;
    }
    try {
      const raw = localStorage.getItem('ds_lit_verdicts') || '[]';
      const arr = JSON.parse(raw);
      arr.push(entry);
      localStorage.setItem('ds_lit_verdicts', JSON.stringify(arr.slice(-500)));
    } catch {}
    try { window.dispatchEvent(new CustomEvent('ds:literature-verdict', { detail: entry })); } catch {}
    window._dsToast?.({ title: label, body: 'PMID ' + pmid, severity: 'success' });
  };

  /* ── build review rows ──────────────────────────────────────────────── */
  const legacyRows = _legacyNeedsReviewRows.map(p => {
    const gov = Array.isArray(p.governance) ? p.governance : [];
    const isUnreviewed = gov.includes('unreviewed');
    const hasVerify = typeof p.notes === 'string' && /verify/i.test(p.notes);
    let reason = '—', reasonColor = 'var(--text-tertiary)';
    if (isUnreviewed && hasVerify) { reason = 'Unreviewed + verify params'; reasonColor = 'var(--rose)'; }
    else if (isUnreviewed)          { reason = 'Unreviewed';                 reasonColor = 'var(--amber)'; }
    else if (hasVerify)             { reason = 'Verify parameters';          reasonColor = 'var(--blue)'; }
    const cond = _condsAll.find(c => c.id === p.conditionId);
    const dev  = _devsAll.find(d => d.id === p.device);
    const topCite = Array.isArray(p.references) && p.references.length ? p.references[0] : '—';
    return { p, gov, isUnreviewed, hasVerify, reason, reasonColor, cond, dev, topCite };
  });
  const liveRows = _researchBundleState.loaded
    ? _researchBundleState.coverageRows
        .filter((row) => row.gap && row.gap !== 'None')
        .map((row, idx) => {
          const modalitySlug = _reSlug(row.modality);
          const conditionSlug = _reSlug(row.condition);
          const matchedTemplate = _researchBundleState.templates.find((tpl) =>
            _reSlug(tpl.modality) === modalitySlug && _reSlug(tpl.indication) === conditionSlug
          );
          const matchedSignals = _researchBundleState.safetySignals.filter((signal) => {
            const indicationHit = (signal.indication_tags || []).some((tag) => _reSlug(tag) === conditionSlug);
            const modalityHit = (signal.canonical_modalities || []).some((tag) => _reSlug(tag) === modalitySlug)
              || _reSlug(signal.primary_modality) === modalitySlug;
            return indicationHit && modalityHit;
          });
          const topCite = matchedTemplate?.example_titles || matchedSignals[0]?.title || matchedSignals[0]?.example_titles || row.primary_target || 'Live coverage row';
          const ev = String(matchedTemplate?.evidence_tier || row.evidence_tier || row.grade || '').replace(/^EV-?/i, '').toUpperCase();
          return {
            p: {
              id: matchedTemplate?.id || `live-review-${idx}`,
              name: [row.modality, row.condition, row.primary_target].filter(Boolean).join(' — ') || `${row.modality} — ${row.condition}`,
              device: row.modality || '',
              conditionId: row.condition || '',
              evidenceGrade: ev,
            },
            gov: matchedSignals.length ? ['safety-review'] : ['coverage-review'],
            isUnreviewed: row.gap !== 'None',
            hasVerify: matchedSignals.length > 0,
            reason: matchedSignals.length ? `${row.gap} + safety signal` : row.gap,
            reasonColor: matchedSignals.length ? 'var(--rose)' : row.paper_count < 10 ? 'var(--amber)' : 'var(--blue)',
            cond: { label: row.condition },
            dev: { label: _reNormalizeLabel(row.modality) },
            topCite,
          };
        })
    : [];
  const rows = liveRows.length ? liveRows : legacyRows;

  const filtQ = (window._reSearch?.review || '').toLowerCase();
  const filtered = !filtQ ? rows : rows.filter(r =>
    (r.p.name || '').toLowerCase().includes(filtQ) ||
    (r.cond?.label || r.p.conditionId || '').toLowerCase().includes(filtQ) ||
    (r.dev?.label || r.p.device || '').toLowerCase().includes(filtQ) ||
    (r.topCite || '').toLowerCase().includes(filtQ) ||
    (r.reason || '').toLowerCase().includes(filtQ)
  );

  const totalUnreviewed = rows.filter(r => r.isUnreviewed).length;
  const totalVerify     = rows.filter(r => r.hasVerify).length;
  const gradeABHighPri  = rows.filter(r => r.isUnreviewed && ['A','B'].includes(String(r.p.evidenceGrade || '').toUpperCase())).length;
  const pendingPapers   = _litQueue.length;
  const _totalEvPapers  = _liveEvidenceUiStats?.totalPapers || EVIDENCE_SUMMARY?.totalPapers || 0;
  const _totalProtocols = liveRows.length || _protosAll.length;
  const reviewCaption = liveRows.length
    ? 'Live protocol coverage and safety triage from the neuromodulation evidence bundle'
    : 'Legacy protocol governance fallback from the curated local library';

  /* ── Section 1: Protocols requiring review ──────────────────────────── */
  const sInput = '<div style="position:relative;max-width:280px;flex:1 1 220px">' +
    '<label class="sr-only" for="re-nr-search">Search</label>' +
    '<input id="re-nr-search" type="search" placeholder="Search name, condition, device, citation…" class="ph-search-input"' +
    ' value="' + esc(window._reSearch?.review || '') + '"' +
    ' oninput="window._reSearch=window._reSearch||{};window._reSearch.review=this.value;clearTimeout(window._reSTmr);window._reSTmr=setTimeout(()=>window._nav(\'research-evidence\'),180)">' +
    '<svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div>';

  const protosSection =
    '<div class="ch-card">' +
      '<div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">' +
        '<span class="ch-card-title">Protocols requiring review (' + filtered.length + (filtered.length !== rows.length ? ' of ' + rows.length : '') + ')</span>' +
        '<span style="font-size:11px;color:var(--text-tertiary)">' + reviewCaption + '</span>' +
        sInput +
      '</div>' +
      (!rows.length
        ? '<div class="ch-empty" style="padding:30px 16px">No protocols currently flagged as unreviewed or verify-needed. All drafts have been cleared.</div>'
        : !filtered.length
          ? '<div class="ch-empty" style="padding:30px 16px">No protocols match your search.</div>'
          : '<div class="lib-grid">' + filtered.map(r => {
              const p = r.p;
              const evG = String(p.evidenceGrade || '').toUpperCase();
              return (
                '<article class="lib-card lib-card--review" aria-label="' + esc(p.name || 'Protocol') + '">' +
                  '<div class="lib-card-top">' +
                    '<span class="lib-card-name">' + esc(p.name || 'Protocol') + '</span>' +
                    gradeBadge(p.evidenceGrade) +
                  '</div>' +
                  '<div class="lib-card-meta">' +
                    (r.dev?.label ? '<span class="lib-tag" title="Modality / device">' + esc(r.dev.label) + '</span>' : (p.device ? '<span class="lib-tag">' + esc(p.device) + '</span>' : '')) +
                    (p.subtype ? '<span class="lib-tag">' + esc(p.subtype) + '</span>' : '') +
                    (r.cond?.label ? '<span class="lib-tag" title="Condition">' + esc(r.cond.label) + '</span>' : (p.conditionId ? '<span class="lib-tag">' + esc(p.conditionId) + '</span>' : '')) +
                    '<span class="lib-tag" style="color:' + r.reasonColor + ';border:1px solid ' + r.reasonColor + '55" title="Why this protocol is in the review queue">' + esc(r.reason) + '</span>' +
                    (r.gov.length ? '<span class="lib-tag" style="color:var(--text-tertiary)" title="Governance flags">' + esc(r.gov.join(' · ')) + '</span>' : '') +
                  '</div>' +
                  '<div class="lib-features">' +
                    '<div class="lib-feature lib-feature--indication" title="Top citation">📄 ' + esc(String(r.topCite).slice(0, 140)) + (String(r.topCite).length > 140 ? '…' : '') + '</div>' +
                  '</div>' +
                  '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' +
                    '<button class="ch-btn-sm ch-btn-teal" onclick="window._protDetailId=\'' + esc(p.id || '') + '\';window._nav(\'protocol-detail\')" title="Open protocol detail to review, edit, or promote">Review →</button>' +
                    (evG === 'A' || evG === 'B'
                      ? '<span class="lib-badge" style="background:rgba(20,184,166,0.14);color:var(--teal);border:1px solid rgba(20,184,166,0.3)" title="High-priority: strong evidence awaiting review">Priority</span>'
                      : '') +
                  '</div>' +
                '</article>'
              );
            }).join('') + '</div>') +
    '</div>';

  /* ── Section 2: Literature Watch triage queue ───────────────────────── */
  const protoChip = (pid) =>
    '<button class="lib-tag" title="Open protocol detail for ' + esc(pid) + '"' +
    ' style="cursor:pointer;color:var(--teal);border:1px solid rgba(20,184,166,0.35)"' +
    ' onclick="window._protDetailId=\'' + esc(pid) + '\';window._nav(\'protocol-detail\')">' +
    esc(pid) + '</button>';

  const paperRow = (paper) => {
    const pmid = String(paper.pmid || '');
    const title = String(paper.title || '(untitled)');
    const titleTrim = title.length > 120 ? title.slice(0, 120) + '…' : title;
    const authors = paper.authors || '—';
    const metaBits = [];
    if (authors) metaBits.push(esc(authors));
    if (paper.year) metaBits.push(esc(paper.year));
    if (paper.journal) metaBits.push('<i>' + esc(paper.journal) + '</i>');
    const chips = Array.isArray(paper.protocol_ids) ? paper.protocol_ids.map(protoChip).join(' ') : '';
    const seen = paper.first_seen_at ? esc(String(paper.first_seen_at).slice(0, 10)) : '—';
    return (
      '<article class="lib-card lib-card--literature" aria-label="' + esc(titleTrim) + '">' +
        '<div class="lib-card-top">' +
          '<span class="lib-card-name" title="' + esc(title) + '">' + esc(titleTrim) + '</span>' +
          '<span class="lib-badge" style="background:rgba(139,92,246,0.14);color:var(--violet);border:1px solid rgba(139,92,246,0.35)" title="PubMed ID">PMID ' + esc(pmid) + '</span>' +
        '</div>' +
        '<div class="lib-card-meta" style="color:var(--text-tertiary)">' + metaBits.join(' · ') + '</div>' +
        (chips ? '<div class="lib-card-meta" style="margin-top:4px">Linked protocols: ' + chips + '</div>' : '') +
        '<div class="lib-features">' +
          '<div class="lib-feature lib-feature--indication" style="color:var(--text-tertiary)" title="When Literature Watch first saw this paper">⏱ First seen ' + seen + '</div>' +
        '</div>' +
        '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' +
          '<button class="ch-btn-sm ch-btn-teal" title="Flag this paper as worth a closer review" onclick="window._litPaperAction(\'mark-relevant\', \'' + esc(pmid) + '\')">Mark relevant</button>' +
          '<button class="ch-btn-sm" title="Promote this paper to formal protocol references" onclick="window._litPaperAction(\'promote\', \'' + esc(pmid) + '\')">Promote to references</button>' +
          '<button class="ch-btn-sm" title="Exclude this paper from future surfacing" onclick="window._litPaperAction(\'not-relevant\', \'' + esc(pmid) + '\')">Not relevant</button>' +
        '</div>' +
      '</article>'
    );
  };

  const emptyLitMsg = !_litSnap
    ? 'No new literature found yet. Run <code>python services/evidence-pipeline/literature_watch_cron.py</code> or wait for the nightly cron at 03:00.'
    : 'Pending queue is empty. All recent papers have been triaged.';
  const generatedStamp = _litSnap && _litSnap.generated_at
    ? '<span style="font-size:11px;color:var(--text-tertiary)">Snapshot: ' + esc(String(_litSnap.generated_at).replace('T',' ').slice(0,16)) + ' UTC</span>'
    : '';

  const papersSection =
    '<div class="ch-card" style="margin-top:18px">' +
      '<div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">' +
        '<span class="ch-card-title">New literature awaiting triage (last 30 days)</span>' +
        generatedStamp +
        '<span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">Deduped by PMID across protocols · cap 200</span>' +
      '</div>' +
      '<p style="font-size:11px;color:var(--text-tertiary);padding:0 16px 8px;margin:0;line-height:1.45">Local verdict log (when shown in-browser) is stored in this browser only via localStorage for UX continuity — it is not a substitute for server audit records.</p>' +
      (!_litQueue.length
        ? '<div class="ch-empty" style="padding:30px 16px">' + emptyLitMsg + '</div>'
        : '<div class="lib-grid">' + _litQueue.map(paperRow).join('') + '</div>') +
    '</div>';

  /* ── compose ────────────────────────────────────────────────────────── */
  body.innerHTML =
    '<div class="ch-card" role="note" style="border-left:3px solid var(--amber);padding:12px 16px;margin-bottom:14px;background:rgba(245,158,11,0.06)">' +
      '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55">' +
        '<b style="color:var(--amber)">Disclaimer.</b> These protocols and papers were drafted from literature and are ' +
        '<b>NOT approved for clinical use</b> until a clinician reviews each one. Click <b>Review →</b> on a protocol card, ' +
        'or use the triage buttons on a paper row.' +
      '</div>' +
    '</div>' +
    '<div class="ch-kpi-strip" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-bottom:16px">' +
      kpi('var(--amber)',  totalUnreviewed, 'Unreviewed', 'governance array contains "unreviewed"') +
      kpi('var(--blue)',   totalVerify,     'Verify flags', 'notes field mentions "verify"') +
      kpi('var(--teal)',   gradeABHighPri,  'Grade A/B priority', 'Highest clinical priority — strong evidence awaiting review') +
      kpi('var(--violet)', pendingPapers,   'Pending papers', 'Cross-protocol literature_watch rows (verdict=pending)') +
      kpi('var(--rose)',   _totalProtocols, 'Tracked rows', liveRows.length ? 'Live protocol coverage rows with unresolved gaps' : 'From curated neuromodulation evidence library') +
      kpi('var(--teal)',   fmtK(_totalEvPapers), 'Evidence base', _totalEvPapers.toLocaleString() + ' papers indexed across ' + (_liveEvidenceUiStats?.totalConditions || CONDITION_EVIDENCE.length) + ' conditions') +
    '</div>' +
    protosSection +
    papersSection;
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB — Indications (live evidence DB spine)
   ──────────────────────────────────────────────────────────────────────────────
   Wires `pages-research-evidence` to the per-indication endpoints added in
   `apps/api/app/routers/evidence_router.py` (PR feat/evidence-ui-wiring).
   The list is the navigation spine; selecting a slug fans out to a single
   `/indications/{slug}/detail` call which returns header + top papers + top
   trials + curated devices + high-confidence protocols.

   Honest empty states:
   * If `/indications/summary` 503s, the panel shows the connection error.
   * If a slug has zero curated papers (paper_indications empty), the detail
     view shows a 'no curated papers yet — fall back to FTS' empty state and
     a one-click search button instead of fabricating counts.
   ══════════════════════════════════════════════════════════════════════════════ */

const _GRADE_COLOR_MAP = { A: '#22c55e', B: '#84cc16', C: '#eab308', D: '#f97316', E: '#ef4444' };

function _gradeBadge(grade) {
  if (!grade) return '';
  const c = _GRADE_COLOR_MAP[String(grade).toUpperCase()] || 'var(--text-tertiary)';
  return `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;background:${c};color:#0b1220;letter-spacing:0.5px">EV-${esc(String(grade).toUpperCase())}</span>`;
}

/* _computedGradeBadge — coloured pill for the DB-computed A-E grade.
 * Rubric: A>=200p+10t+5d | B>=100p+1d | C>=30p | D>=5p | E<5p.
 * Hover tooltip explains the grade without leaving the page.
 */
const _COMPUTED_GRADE_TOOLTIP = {
  A: 'Grade A: >=200 routed papers, >=10 trials, >=5 cleared devices. Strong evidence + regulatory + replication.',
  B: 'Grade B: >=100 papers, >=1 cleared device. Mainstream evidence with at least one regulatory pathway.',
  C: 'Grade C: >=30 papers. Active research area; off-label or investigational. Not yet mainstream.',
  D: 'Grade D: >=5 papers. Emerging indication; pilot studies only. IRB/ethics required for clinical use.',
  E: 'Grade E: <5 papers in the curated corpus. Speculative / very early-stage.',
};
const _RUBRIC_HINT = 'Rubric: A>=200p+10t+5d | B>=100p+1d | C>=30p | D>=5p | E<5p. Recomputed nightly from junction-table counts.';

function _computedGradeBadge(grade) {
  if (!grade) return '';
  const g = String(grade).toUpperCase();
  const c = _GRADE_COLOR_MAP[g] || '#6b7280';
  const tip = (_COMPUTED_GRADE_TOOLTIP[g] || 'Dynamic grade (A-E) computed from paper/trial/device counts.') + ' ' + _RUBRIC_HINT;
  return (
    '<span class="ds-computed-grade-chip" ' +
    'title="' + esc(tip) + '" ' +
    'style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;' +
    'padding:2px 7px;border-radius:99px;letter-spacing:0.04em;' +
    'background:' + c + '22;border:1px solid ' + c + '77;color:' + c + ';line-height:1.4">' +
    '<span style="font-size:9px;opacity:0.75">DB</span>' +
    esc(g) +
    '</span>'
  );
}

function _paperLink(paper) {
  // Prefer a stable canonical link in priority order:
  //   1. open-access URL (free PDF or HTML)
  //   2. DOI resolver
  //   3. PubMed ID
  //   4. Europe PMC URL (if migrated DB has it)
  if (paper.oa_url) return paper.oa_url;
  if (paper.doi) return `https://doi.org/${paper.doi}`;
  if (paper.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`;
  if (paper.europe_pmc_url) return paper.europe_pmc_url;
  return null;
}

function _renderPaperRow(paper) {
  const link = _paperLink(paper);
  const titleHtml = link
    ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" style="color:var(--text-primary);text-decoration:none;font-weight:600">${esc(paper.title || '(untitled)')}</a>`
    : `<span style="color:var(--text-primary);font-weight:600">${esc(paper.title || '(untitled)')}</span>`;
  const journal = paper.journal ? esc(paper.journal) : '';
  const year = paper.year ? esc(String(paper.year)) : '';
  const cites = paper.cited_by_count != null ? `${fmt(paper.cited_by_count)} cites` : '';
  const oa = paper.is_oa ? '<span style="font-size:10px;color:#2dd4bf;font-weight:700">OPEN</span>' : '';
  const meta = [journal, year, cites, oa].filter(Boolean).join(' · ');
  // Evidence-linked identifier chips (PMID / DOI hyperlinks — only shown when present)
  const pmid = paper.pmid ? String(paper.pmid).trim() : '';
  const doi  = paper.doi  ? String(paper.doi).trim()  : '';
  const idChips = [];
  if (pmid) idChips.push(
    `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(pmid)}/" target="_blank" rel="noopener noreferrer" ` +
    `style="font-size:10px;color:var(--teal);text-decoration:none;padding:1px 5px;border-radius:3px;border:1px solid rgba(45,212,191,0.4)">` +
    `PMID ${esc(pmid)}</a>`
  );
  if (doi) idChips.push(
    `<a href="https://doi.org/${esc(doi)}" target="_blank" rel="noopener noreferrer" ` +
    `style="font-size:10px;color:var(--teal);text-decoration:none;padding:1px 5px;border-radius:3px;border:1px solid rgba(45,212,191,0.4)">` +
    `DOI ↗</a>`
  );
  const idRow = idChips.length
    ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${idChips.join('')}</div>`
    : `<div style="margin-top:4px;font-size:10px;color:var(--text-tertiary);font-style:italic">No direct identifier — clinician judgment required for source verification.</div>`;
  return (
    '<div style="padding:10px 12px;border-bottom:1px solid var(--border)">' +
    `<div style="margin-bottom:4px">${titleHtml}</div>` +
    `<div style="font-size:11px;color:var(--text-tertiary)">${meta}</div>` +
    idRow +
    '</div>'
  );
}

function _renderTrialRow(trial) {
  const link = trial.nct_id
    ? `https://clinicaltrials.gov/study/${esc(trial.nct_id)}`
    : null;
  const titleHtml = link
    ? `<a href="${link}" target="_blank" rel="noopener noreferrer" style="color:var(--text-primary);text-decoration:none;font-weight:600">${esc(trial.title || '(untitled trial)')}</a>`
    : `<span style="color:var(--text-primary);font-weight:600">${esc(trial.title || '(untitled trial)')}</span>`;
  const meta = [
    trial.nct_id ? esc(trial.nct_id) : '',
    trial.phase ? esc(trial.phase) : '',
    trial.status ? esc(trial.status) : '',
    trial.enrollment ? `n=${esc(String(trial.enrollment))}` : '',
  ].filter(Boolean).join(' · ');
  return (
    '<div style="padding:10px 12px;border-bottom:1px solid var(--border)">' +
    `<div style="margin-bottom:4px">${titleHtml}</div>` +
    `<div style="font-size:11px;color:var(--text-tertiary)">${meta}</div>` +
    '</div>'
  );
}

function _renderDeviceRow(device) {
  const link = device.kind === '510k'
    ? `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${esc(device.number)}`
    : device.kind === 'pma'
      ? `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=${esc(device.number)}`
      : null;
  const titleHtml = link
    ? `<a href="${link}" target="_blank" rel="noopener noreferrer" style="color:var(--text-primary);text-decoration:none;font-weight:600">${esc(device.trade_name || device.applicant || device.number)}</a>`
    : `<span style="color:var(--text-primary);font-weight:600">${esc(device.trade_name || device.applicant || device.number)}</span>`;
  const meta = [
    device.kind ? esc(device.kind.toUpperCase()) : '',
    device.number ? esc(device.number) : '',
    device.applicant ? esc(device.applicant) : '',
    device.decision_date ? esc(device.decision_date) : '',
  ].filter(Boolean).join(' · ');
  return (
    '<div style="padding:8px 12px;border-bottom:1px solid var(--border)">' +
    `<div style="margin-bottom:2px">${titleHtml}</div>` +
    `<div style="font-size:11px;color:var(--text-tertiary)">${meta}</div>` +
    '</div>'
  );
}

function _renderProtocolRow(p) {
  const params = [
    p.modality ? `modality=${esc(p.modality)}` : '',
    p.target_anatomy ? `target=${esc(p.target_anatomy)}` : '',
    p.frequency_hz != null ? `${esc(String(p.frequency_hz))} Hz` : '',
    p.amplitude_mA != null ? `${esc(String(p.amplitude_mA))} mA` : '',
    p.total_sessions != null ? `${esc(String(p.total_sessions))} sessions` : '',
  ].filter(Boolean).join(' · ');
  const sourceLink = p.source_type === 'ctgov'
    ? `https://clinicaltrials.gov/study/${esc(p.source_id)}`
    : null;
  const sourceHtml = sourceLink
    ? `<a href="${sourceLink}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--teal);text-decoration:none">${esc(p.source_id)}</a>`
    : `<span style="font-size:11px;color:var(--text-tertiary)">${esc(p.source_id)}</span>`;
  const confColor = p.confidence === 'high' ? '#2dd4bf'
    : p.confidence === 'medium' ? '#fbbf24'
    : '#94a3b8';
  return (
    '<div style="padding:10px 12px;border-bottom:1px solid var(--border)">' +
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">` +
    `<span style="font-weight:600;color:var(--text-primary)">${esc(p.arm_label || '(unlabelled arm)')}</span>` +
    `<span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;background:${confColor};color:#0b1220">${esc((p.confidence || 'low').toUpperCase())}</span>` +
    `</div>` +
    `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:2px">${params || '(no parameters extracted)'}</div>` +
    `<div>${sourceHtml}</div>` +
    '</div>'
  );
}

function _renderSpineSidebar(rows, selectedSlug) {
  return (
    '<div style="display:flex;flex-direction:column;gap:2px;max-height:560px;overflow-y:auto">' +
    rows.map((row) => {
      const isSel = row.slug === selectedSlug;
      const counts = `${fmt(row.paper_count)}p · ${fmt(row.trial_count)}t · ${fmt(row.device_count)}d`;
      return (
        `<button type="button"` +
        ` onclick="window._reIndicationSlug='${esc(row.slug)}';window._nav('research-evidence')"` +
        ` style="text-align:left;padding:8px 10px;border-radius:6px;border:1px solid ${isSel ? 'var(--teal)' : 'transparent'};` +
        `background:${isSel ? 'rgba(45,212,191,0.08)' : 'transparent'};cursor:pointer;color:var(--text-primary);` +
        `display:flex;flex-direction:column;gap:2px">` +
        `<span style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600">` +
        `${_computedGradeBadge(row.computed_evidence_grade)}<span>${esc(row.label)}</span></span>` +
        `<span style="font-size:10px;color:var(--text-tertiary)">${esc(row.modality)} · ${counts}</span>` +
        '</button>'
      );
    }).join('') +
    '</div>'
  );
}

/**
 * Evidence-linked claims strip for indication detail.
 * Shows top PMID/DOI hyperlinks from curated papers.
 * When no papers are linked, renders an honest "no evidence — clinician judgment required" notice.
 * This function never fabricates identifiers.
 */
function _renderEvidenceLinkedClaims(papers, slug) {
  // Collect up to 5 papers that have at least one citable identifier (PMID or DOI)
  const linked = [];
  for (const p of papers) {
    if (linked.length >= 5) break;
    const pmid = p.pmid ? String(p.pmid).trim() : '';
    const doi  = p.doi  ? String(p.doi).trim()  : '';
    if (pmid || doi) linked.push({ title: p.title || '(untitled)', pmid, doi });
  }
  if (linked.length === 0) {
    return (
      '<div class="ch-card" role="note" aria-label="Evidence-linked claims" ' +
      'style="padding:10px 14px;margin-bottom:12px;border-left:3px solid var(--text-tertiary);background:rgba(148,163,184,0.06)">' +
      '<div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Evidence-linked claims</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);line-height:1.55">' +
      '<strong style="color:var(--text-secondary)">No evidence — clinician judgment required.</strong> ' +
      `No papers with citable PMID or DOI are currently linked to <code>${esc(slug)}</code> in the curated evidence DB. ` +
      'Clinicians must independently retrieve and appraise primary literature before any clinical decision.' +
      '</div></div>'
    );
  }
  const chips = linked.map((p) => {
    const idParts = [];
    if (p.pmid) idParts.push(
      `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" target="_blank" rel="noopener noreferrer" ` +
      `style="font-size:10px;color:var(--teal);text-decoration:none;padding:1px 5px;border-radius:3px;border:1px solid rgba(45,212,191,0.4)">PMID ${esc(p.pmid)}</a>`
    );
    if (p.doi) idParts.push(
      `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener noreferrer" ` +
      `style="font-size:10px;color:var(--teal);text-decoration:none;padding:1px 5px;border-radius:3px;border:1px solid rgba(45,212,191,0.4)">DOI ↗</a>`
    );
    return (
      '<div style="margin-bottom:4px">' +
      `<span style="font-size:11.5px;color:var(--text-secondary)">${esc(p.title.slice(0, 80))}${p.title.length > 80 ? '…' : ''}</span> ` +
      idParts.join(' ') +
      '</div>'
    );
  }).join('');
  return (
    '<div class="ch-card" role="note" aria-label="Evidence-linked claims" ' +
    'style="padding:10px 14px;margin-bottom:12px;border-left:3px solid rgba(45,212,191,0.5);background:rgba(45,212,191,0.04)">' +
    '<div style="font-size:11px;font-weight:600;color:var(--teal);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Evidence-linked claims</div>' +
    '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:6px">Top cited papers with verifiable identifiers (PMID / DOI). These are pointers to primary literature — clinician review required.</div>' +
    chips +
    '</div>'
  );
}

function _renderDetailSection(title, rows, renderFn, emptyMsg, count) {
  const headerCount = count != null ? ` <span style="font-size:11px;color:var(--text-tertiary);font-weight:500">(${fmt(count)})</span>` : '';
  if (!rows || rows.length === 0) {
    return (
      '<div class="ch-card" style="padding:0;margin-bottom:12px">' +
      `<div style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">${esc(title)}${headerCount}</div>` +
      `<div style="padding:14px;font-size:12px;color:var(--text-tertiary);font-style:italic">${esc(emptyMsg)}</div>` +
      '</div>'
    );
  }
  return (
    '<div class="ch-card" style="padding:0;margin-bottom:12px">' +
    `<div style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">${esc(title)}${headerCount}</div>` +
    rows.map(renderFn).join('') +
    '</div>'
  );
}

async function renderIndicationsSpine(body) {
  body.innerHTML = spinner();

  let indications = [];
  let summaryError = null;
  try {
    indications = await api.evidenceIndicationsSummary();
  } catch (err) {
    summaryError = err;
  }

  if (summaryError || !Array.isArray(indications)) {
    body.innerHTML = (
      '<div class="ch-card" role="status" style="padding:14px;border-left:3px solid var(--rose);background:rgba(244,63,94,0.06)">' +
      '<div style="font-size:13px;font-weight:600;color:var(--rose);margin-bottom:6px">Indications spine unavailable</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);line-height:1.55">' +
      'GET <code>/api/v1/evidence/indications/summary</code> failed. ' +
      'The evidence DB may not be ingested in this environment yet, or your session lacks clinician role. ' +
      'See <code>services/evidence-pipeline/README.md</code> for ingest instructions.' +
      '</div></div>'
    );
    return;
  }

  if (indications.length === 0) {
    body.innerHTML = (
      '<div class="ch-card" style="padding:14px">' +
      '<div style="font-size:13px;font-weight:600;margin-bottom:6px">No indications curated yet</div>' +
      '<div style="font-size:12px;color:var(--text-tertiary)">' +
      'The evidence DB is reachable but no indications have been seeded. ' +
      'Run <code>python3 services/evidence-pipeline/indications_seed.py</code>.' +
      '</div></div>'
    );
    return;
  }

  // Default selection: first slug with non-zero papers, fallback to first.
  const defaultSlug = (indications.find((r) => Number(r.paper_count) > 0) || indications[0]).slug;
  const selectedSlug = window._reIndicationSlug || defaultSlug;
  window._reIndicationSlug = selectedSlug;

  const totalPapers = indications.reduce((s, r) => s + Number(r.paper_count || 0), 0);
  const totalTrials = indications.reduce((s, r) => s + Number(r.trial_count || 0), 0);
  const totalDevices = indications.reduce((s, r) => s + Number(r.device_count || 0), 0);
  const totalProtocols = indications.reduce((s, r) => s + Number(r.protocol_count || 0), 0);

  const summaryBar = (
    '<div class="ch-card" style="padding:10px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:18px;align-items:center">' +
    `<div><span style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px">Indications</span> <span style="font-size:18px;font-weight:700;margin-left:6px">${fmt(indications.length)}</span></div>` +
    `<div><span style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px">Papers</span> <span style="font-size:18px;font-weight:700;margin-left:6px">${fmt(totalPapers)}</span></div>` +
    `<div><span style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px">Trials</span> <span style="font-size:18px;font-weight:700;margin-left:6px">${fmt(totalTrials)}</span></div>` +
    `<div><span style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px">Devices</span> <span style="font-size:18px;font-weight:700;margin-left:6px">${fmt(totalDevices)}</span></div>` +
    `<div><span style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px">Protocols</span> <span style="font-size:18px;font-weight:700;margin-left:6px">${fmt(totalProtocols)}</span></div>` +
    '<div style="margin-left:auto;font-size:11px;color:var(--text-tertiary)">Source: <code>GET /api/v1/evidence/indications/summary</code></div>' +
    '</div>'
  );

  const sidebarHtml = _renderSpineSidebar(indications, selectedSlug);

  body.innerHTML = (
    summaryBar +
    '<div style="display:grid;grid-template-columns:280px 1fr;gap:14px;align-items:flex-start">' +
    `<aside class="ch-card" style="padding:10px">${sidebarHtml}</aside>` +
    '<section id="re-indication-detail">' + spinner() + '</section>' +
    '</div>'
  );

  const detailEl = document.getElementById('re-indication-detail');

  let detail = null;
  let detailError = null;
  let terminalDetail = null;
  try {
    terminalDetail = await api.evidenceTerminalIndication(selectedSlug, {
      paperLimit: 10,
      trialLimit: 5,
      protocolLimit: 5,
      safetyLimit: 6,
    });
    detail = terminalDetail?.detail || null;
    detailError = terminalDetail?.errors?.detail || null;
  } catch (err) {
    detailError = err;
  }

  if (detailError) {
    detailEl.innerHTML = (
      '<div class="ch-card" style="padding:14px;border-left:3px solid var(--rose)">' +
      `<div style="font-size:13px;font-weight:600;color:var(--rose);margin-bottom:6px">Failed to load detail for ${esc(selectedSlug)}</div>` +
      '<div style="font-size:12px;color:var(--text-secondary)">' + esc(String(detailError?.message || detailError)) + '</div>' +
      '</div>'
    );
    return;
  }

  const ind = detail.indication;
  const detailSafety = Array.isArray(terminalDetail?.safetySignals) ? terminalDetail.safetySignals.slice(0, 4) : [];
  const detailGraph = Array.isArray(terminalDetail?.evidenceGraph) ? terminalDetail.evidenceGraph.slice(0, 4) : [];
  const headerHtml = (
    '<div class="ch-card" style="padding:14px;margin-bottom:12px;display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">' +
    '<div style="flex:1 1 280px">' +
    `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">` +
    `${_computedGradeBadge(ind.computed_evidence_grade)}` +
    `${ind.evidence_grade ? '<span title="Clinician-curated grade (may differ from DB-computed)">' + _gradeBadge(ind.evidence_grade) + '<span style="font-size:9px;color:var(--text-tertiary);margin-left:2px">(curated)</span></span>' : ''}` +
    `<span style="font-size:18px;font-weight:700;color:var(--text-primary)">${esc(ind.label)}</span></div>` +
    `<div style="font-size:12px;color:var(--text-secondary)">${esc(ind.modality)} → ${esc(ind.condition)}</div>` +
    (ind.regulatory ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Regulatory: ${esc(ind.regulatory)}</div>` : '') +
    '</div>' +
    '<div style="display:flex;gap:14px;flex-wrap:wrap">' +
    `<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Papers</div><div style="font-size:18px;font-weight:700">${fmt(ind.paper_count)}</div></div>` +
    `<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Trials</div><div style="font-size:18px;font-weight:700">${fmt(ind.trial_count)}</div></div>` +
    `<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Devices</div><div style="font-size:18px;font-weight:700">${fmt(ind.device_count)}</div></div>` +
    `<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Protocols</div><div style="font-size:18px;font-weight:700">${fmt(ind.protocol_count)}</div></div>` +
    '</div>' +
    '</div>'
  );
  const terminalMetaHtml =
    '<div class="ch-card" style="padding:14px;margin-bottom:12px">' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">' +
        '<div><div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Safety labels</div>' +
          (detailSafety.length
            ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + detailSafety.flatMap((row) => ((row.safety_signal_tags || []).slice(0, 2)).concat((row.contraindication_signal_tags || []).slice(0, 1))).filter(Boolean).slice(0, 6).map(_reSafetyLabel).join('') + '</div>'
            : '<div style="font-size:11px;color:var(--text-tertiary)">No live safety rows returned for this indication.</div>') +
        '</div>' +
        '<div><div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Evidence map</div>' +
          (detailGraph.length
            ? detailGraph.map((row) => '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">' + esc(row.target || 'Target unavailable') + ' · ' + fmt(row.paper_count || 0) + ' papers · ' + fmt(row.citation_sum || 0) + ' cites</div>').join('')
            : '<div style="font-size:11px;color:var(--text-tertiary)">No graph summary returned.</div>') +
        '</div>' +
      '</div>' +
    '</div>';

  // Evidence-linked claims strip — top PMID/DOI from curated papers; honest empty if none
  const evidenceLinkedClaimsHtml = _renderEvidenceLinkedClaims(detail.papers || [], selectedSlug);

  const fallbackBanner = detail.fts_fallback
    ? (
        '<div class="ch-card" role="status" aria-live="polite" style="padding:10px 14px;margin-bottom:12px;border-left:3px solid var(--amber);background:rgba(245,158,11,0.06)">' +
        '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55">' +
        '<strong style="color:var(--amber)">No evidence — clinician judgment required.</strong> ' +
        `No curated papers have been linked to <code>${esc(selectedSlug)}</code> in the evidence DB yet. ` +
        'The <code>paper_indications</code> junction is empty for this indication; ' +
        'the curation pipeline has not run for this slug. ' +
        'Clinician judgment and independent primary literature retrieval are required before any clinical action. ' +
        '<button type="button" class="btn btn-ghost btn-xs" ' +
        `onclick="window._resEvidenceTab='search';window._nav('research-evidence')">` +
        'Search indexed corpus instead</button>' +
        '</div></div>'
      )
    : '';

  const papersHtml = _renderDetailSection(
    'Top papers',
    detail.papers,
    _renderPaperRow,
    'No curated papers — try the FTS search tab.',
    detail.papers ? detail.papers.length : 0,
  );
  const trialsHtml = _renderDetailSection(
    'Top trials',
    detail.trials,
    _renderTrialRow,
    'No trials linked yet for this indication.',
    detail.trials ? detail.trials.length : 0,
  );
  const devicesHtml = _renderDetailSection(
    'FDA-cleared devices',
    detail.devices,
    _renderDeviceRow,
    'No FDA-cleared devices linked to this indication via device_indications.',
    detail.devices ? detail.devices.length : 0,
  );
  const protocolsHtml = _renderDetailSection(
    'High-confidence protocols',
    detail.protocols,
    _renderProtocolRow,
    'No structured protocols extracted yet for this indication. Run extract_protocols.py to populate.',
    detail.protocols ? detail.protocols.length : 0,
  );

  detailEl.innerHTML = headerHtml + terminalMetaHtml + evidenceLinkedClaimsHtml + fallbackBanner + papersHtml + trialsHtml + devicesHtml + protocolsHtml;
}

export { renderEvidenceResultCard, _reExpandEvidenceSearchQuery, _reDedupeKey, renderIndicationsSpine };
