// ─────────────────────────────────────────────────────────────────────────────
// pages-research-evidence.js — Research Evidence Interactive Dashboard
// 87,000 papers · 53 conditions · 13 modalities · 24 assessments · 18 devices
// ─────────────────────────────────────────────────────────────────────────────

import { tag, spinner } from './helpers.js';
import { api } from './api.js';
import { currentUser } from './auth.js';
import {
  EVIDENCE_TOTAL_PAPERS, EVIDENCE_TOTAL_TRIALS, EVIDENCE_TOTAL_META,
  EVIDENCE_SOURCES, CONDITION_EVIDENCE, EVIDENCE_SUMMARY,
  getTopConditionsByPaperCount, searchEvidenceByKeyword,
} from './evidence-dataset.js';
import { getEvidenceUiStats } from './evidence-ui-live.js';
import { loadResearchBundleWorkspace } from './research-bundle-workspace.js';
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
const GRADE_CLR = { A: '#2dd4bf', B: '#60a5fa', C: '#fbbf24', D: '#f97316', E: '#ef4444' };
let _liveEvidenceUiStats = null;
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
  conditions:  { label: 'Conditions & Comorbidity',   color: 'var(--blue)'   },
  assessments: { label: 'Assessments & Scales',       color: 'var(--violet)' },
  protocols:   { label: 'Protocols & Devices',        color: 'var(--green)'  },
  neuro:       { label: 'Brain Targets & Biomarkers', color: 'var(--rose)'   },
  adjunct:     { label: 'Labs / Meds / Diet',         color: 'var(--cyan,var(--teal))' },
  aiml:        { label: 'AI/ML & Psychotherapies',    color: 'var(--amber)'  },
  search:      { label: 'Evidence Search',            color: 'var(--cyan,var(--teal))' },
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

  setTopbar('Research Evidence',
    `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--teal);color:#fff;font-weight:600">${esc(fmtK(liveEvidence.totalPapers))} Papers</span>`);

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
   TAB 1 — Overview
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderOverview(body, liveEvidence = null) {
  await _ensureResearchBundleData();
  const S = EVIDENCE_SUMMARY;
  const liveSummary = _researchBundleState.summary || null;
  const top10 = Array.isArray(liveEvidence?.topConditions) && liveEvidence.topConditions.length
    ? liveEvidence.topConditions.slice(0, 10).map((row) => ({
        conditionId: row.key,
        paperCount: Number(row.count) || 0,
      }))
    : getTopConditionsByPaperCount(10);

  /* KPI strip */
  const kpis = [
    { val: fmtK(liveEvidence?.totalPapers || EVIDENCE_TOTAL_PAPERS), label: 'Papers', color: 'var(--teal)' },
    { val: fmtK(liveEvidence?.totalTrials || EVIDENCE_TOTAL_TRIALS), label: 'Clinical Trials', color: 'var(--blue)' },
    { val: fmtK(liveEvidence?.totalMetaAnalyses || EVIDENCE_TOTAL_META), label: 'Meta-analyses', color: 'var(--violet)' },
    { val: liveEvidence?.totalConditions || S.totalConditions, label: 'Conditions', color: 'var(--rose)' },
    { val: Object.keys(liveEvidence?.modalityDistribution || {}).length || S.totalDevices, label: 'Modalities', color: 'var(--amber)' },
  ];
  let kpiHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">';
  for (const k of kpis) {
    kpiHtml += `<div class="ch-card" style="text-align:center;padding:16px 12px">
      <div style="font-size:28px;font-weight:700;color:${k.color};font-variant-numeric:tabular-nums">${k.val}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${k.label}</div>
    </div>`;
  }
  kpiHtml += '</div>';

  /* sources strip */
  let srcHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">';
  for (const s of (liveEvidence?.sources?.length ? liveEvidence.sources : EVIDENCE_SOURCES)) {
    srcHtml += `<span style="padding:3px 10px;font-size:11px;border-radius:12px;background:var(--surface-2);color:var(--text-secondary)">${esc(s)}</span>`;
  }
  srcHtml += '</div>';

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
  let gradeHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Evidence Grade Distribution</div>';
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

  /* two-column layout for charts */
  body.innerHTML = kpiHtml + srcHtml +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px">' +
    yearHtml + gradeHtml + modHtml + tcHtml + liveLinksHtml + liveTemplateHtml + liveSafetyHtml +
    '</div>';
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 2 — Conditions & Comorbidity
   ══════════════════════════════════════════════════════════════════════════════ */
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
  let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">
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
        html += `<div style="margin-top:10px"><strong>Live Evidence Graph Context:</strong></div>`;
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
  let liveDevices = [];
  try {
    liveDevices = await api.searchEvidenceDevices?.({ limit: 60 });
  } catch {}
  let html = sInput('Search protocols, devices, modalities...') + '<div style="margin-bottom:16px"></div>';

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
    html += '<div class="ch-card" style="padding:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Live Evidence Graph Links</div>' +
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

  let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px">
    ${sInput('Search labs, medications, supplements, vitamins, and diet evidence...')}
  </div>`;

  if (_researchBundleState.adjunctSummary || _researchBundleState.adjunctPapers.length) {
    html += renderAdjunctEvidenceSection(q, { standalone: true });
  } else {
    html += `<div class="ch-card" style="padding:16px">
      <div style="font-weight:600;font-size:14px;margin-bottom:8px">Adjunct Evidence Unavailable</div>
      <div style="font-size:12px;color:var(--text-tertiary)">No adjunct evidence bundle is loaded yet for labs, biomarkers, medications, supplements, vitamins, and diet.</div>
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
   TAB 7 — Evidence Search (migrated from Library Hub)
   External brokered search · promote-to-library · AI summarization · curated lib
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderEvidenceSearch(body) {
  await _ensureProtoData();

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
  let overview = null, conditions = [], curatedLitItems = [], evidenceIndications = [];
  const [ovRes, litRes, indRes] = await Promise.allSettled([
    api.libraryOverview(),
    api.listLiterature(),
    api.evidenceIndications?.(),
  ]);
  if (ovRes.status === 'fulfilled') overview = ovRes.value;
  if (litRes.status === 'fulfilled') curatedLitItems = litRes.value?.items || [];
  conditions = overview?.conditions || [];
  if (indRes.status === 'fulfilled' && Array.isArray(indRes.value)) evidenceIndications = indRes.value;

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
  const _totalEvPapers = _liveEvidenceUiStats?.totalPapers || EVIDENCE_SUMMARY?.totalPapers || 87000;
  const _totalEvTrials = _liveEvidenceUiStats?.totalTrials || EVIDENCE_SUMMARY?.totalTrials || 0;
  const _totalEvFda = _liveEvidenceUiStats?.totalFda || 0;

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
        '<div class="ch-card-hd"><span class="ch-card-title">Evidence Graph Context</span></div>' +
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
  window._rePromoteEvidencePaper = async (paperId) => {
    try {
      await api.promoteEvidencePaper(paperId);
      window._dsToast?.({ title: 'Promoted to library', body: `Paper #${paperId}`, severity: 'success' });
    } catch (e) {
      window._dsToast?.({ title: 'Promote failed', body: e?.message || 'Unknown error', severity: 'error' });
    }
  };
  window._reShowEvidenceDetail = async (paperId) => {
    const host = document.getElementById('re-ev-detail');
    if (!host) return;
    host.innerHTML = spinner();
    try {
      const detail = await api.evidencePaperDetail(paperId);
      state.detail = detail || null;
      host.innerHTML = renderDetailPanel(state.detail);
    } catch (e) {
      state.detail = null;
      host.innerHTML = '<div class="ch-empty" style="color:var(--red);padding:24px 16px">Paper detail failed: ' + esc(e?.message || 'service unavailable') + '</div>';
    }
  };
  window._reRunIndexedSearch = async () => {
    const input = document.getElementById('re-ev-q');
    const cSel = document.getElementById('re-ev-cond');
    const gSel = document.getElementById('re-ev-grade');
    const oaCbx = document.getElementById('re-ev-oa');
    const out = document.getElementById('re-ev-results');
    const ctx = document.getElementById('re-ev-context');
    const detailHost = document.getElementById('re-ev-detail');
    if (!input || !cSel || !gSel || !oaCbx || !out || !ctx || !detailHost) return;
    const qv = (input.value || '').trim();
    const indication = cSel.value || '';
    const grade = gSel.value || '';
    const oaOnly = !!oaCbx.checked;
    state.filters = { q: qv, indication, grade, oa_only: oaOnly };
    state.detail = null;
    out.innerHTML = spinner();
    ctx.innerHTML = spinner();
    detailHost.innerHTML = '<div class="ch-empty" style="padding:24px 16px">Select a paper to inspect abstract, methods, and outbound links.</div>';
    if (qv.length < 2 && !indication) {
      out.innerHTML = '<div class="ch-empty" style="padding:24px 16px">Enter at least 2 characters or choose a condition to search the live evidence index.</div>';
      ctx.innerHTML = renderContextPanel([], [], []);
      return;
    }
    try {
      const [papersRes, graphRes, trialsRes, devicesRes, rankedRes] = await Promise.allSettled([
        api.searchEvidencePapers({ q: qv, indication, grade, oa_only: oaOnly, limit: 20 }),
        api.listResearchEvidenceGraph?.({ indication: indication || undefined, limit: 8 }),
        api.searchEvidenceTrials?.({ indication, q: qv, limit: 6 }),
        api.searchEvidenceDevices?.({ indication, limit: 6 }),
        api.searchResearchPapers?.({
          q: qv || undefined,
          indication: indication || undefined,
          evidence_tier: grade || undefined,
          open_access_only: oaOnly,
          ranking_mode: 'clinical',
          limit: 6,
        }),
      ]);
      const papers = papersRes.status === 'fulfilled' && Array.isArray(papersRes.value) ? papersRes.value : [];
      const graphRows = graphRes.status === 'fulfilled' && Array.isArray(graphRes.value) ? graphRes.value : [];
      const trials = trialsRes.status === 'fulfilled' && Array.isArray(trialsRes.value) ? trialsRes.value : [];
      const devices = devicesRes.status === 'fulfilled' && Array.isArray(devicesRes.value) ? devicesRes.value : [];
      const rankedRows = rankedRes.status === 'fulfilled' && Array.isArray(rankedRes.value) ? rankedRes.value : [];
      state.lastResults = papers;
      state.lastGraph = graphRows;
      state.lastTrials = trials;
      state.lastDevices = devices;
      state.lastRanked = rankedRows;
      out.innerHTML = papers.length
        ? '<div class="lib-grid">' + papers.map(resultCard).join('') + '</div>'
        : '<div class="ch-empty" style="padding:24px 16px">No indexed papers matched the current search. Widen filters or try another condition.</div>';
      ctx.innerHTML = renderContextPanel(graphRows, trials, devices, rankedRows);
      if (papers.length) {
        try { window._reShowEvidenceDetail?.(papers[0].id); } catch {}
      }
    } catch (e) {
      out.innerHTML = '<div class="ch-empty" style="color:var(--red);padding:24px 16px">Indexed search failed: ' + esc(e?.message || 'service unavailable') + '</div>';
      ctx.innerHTML = renderContextPanel([], [], [], []);
    }
  };
  window._reSummarizeIndexedEvidence = async () => {
    const picks = Array.from(document.querySelectorAll('.re-ev-pick:checked')).map((n) => Number(n.value)).filter(Boolean);
    const panel = document.getElementById('re-ev-ai-draft');
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
      panel.innerHTML = '<div class="ch-empty" style="color:var(--red)">AI draft failed: ' + esc(e?.message || 'chat service unavailable') + '</div>';
    }
  };

  /* ── HTML ─────────────────────────────────────────────────────────────── */
  let html =
    '<div class="ch-kpi-strip" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-bottom:16px">' +
      kpi('var(--teal)',   overview?.curated_paper_count || fmtK(_totalEvPapers), 'Curated papers', 'Public PubMed/OpenAlex ingest — 87K indexed') +
      kpi('var(--blue)',   overview?.curated_trial_count || fmt(_totalEvTrials), 'Curated trials') +
      kpi('var(--blue)',   fmt(_totalEvFda), 'FDA devices') +
      kpi('var(--rose)',   _liveEvidenceUiStats?.totalMetaAnalyses || EVIDENCE_SUMMARY?.totalMetaAnalyses || 0, 'Meta-analyses') +
      kpi('var(--violet)', curatedCount, 'Your library', 'Per-clinician promoted papers') +
      kpi('var(--amber)',  _liveEvidenceUiStats?.totalConditions || CONDITION_EVIDENCE.length, 'Conditions covered') +
      kpi('var(--teal)',   evDbAvailable ? 'Online' : 'Offline', 'Evidence index') +
    '</div>' +
    /* Live indexed search */
    '<div class="ch-card" style="margin-bottom:16px">' +
      '<div class="ch-card-hd"><span class="ch-card-title">Live Indexed Evidence Search</span>' +
        '<span class="lib-badge" style="background:rgba(20,184,166,0.14);color:var(--teal);border:1px solid rgba(20,184,166,0.3)" title="Searches the indexed evidence DB used by the API">Indexed DB</span>' +
      '</div>' +
      '<div style="padding:14px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
        '<div style="flex:2;min-width:240px"><label class="sr-only" for="re-ev-q">Query</label>' +
          '<input id="re-ev-q" type="search" placeholder="e.g. rTMS dlpfc depression meta-analysis" class="ph-search-input" style="width:100%" value="' + esc(state.filters.q || '') + '">' +
        '</div>' +
        '<div style="flex:1;min-width:180px"><label class="sr-only" for="re-ev-cond">Condition scope</label>' +
          '<select id="re-ev-cond" class="ph-search-input" style="width:100%">' + condOptions + '</select>' +
        '</div>' +
        '<div style="min-width:120px"><label class="sr-only" for="re-ev-grade">Evidence grade</label>' +
          '<select id="re-ev-grade" class="ph-search-input" style="width:100%">' +
            '<option value="">All grades</option>' +
            '<option value="A">Grade A</option>' +
            '<option value="B">Grade B</option>' +
            '<option value="C">Grade C</option>' +
            '<option value="D">Grade D</option>' +
            '<option value="E">Grade E</option>' +
          '</select>' +
        '</div>' +
        '<label class="ch-btn-sm" style="display:inline-flex;gap:6px;align-items:center;cursor:pointer"><input id="re-ev-oa" type="checkbox" style="margin:0"' + (state.filters.oa_only ? ' checked' : '') + '> Open access only</label>' +
        '<button class="btn btn-primary btn-sm" onclick="window._reRunIndexedSearch()">Search</button>' +
      '</div>' +
      '<div style="padding:0 16px 16px;font-size:11px;color:var(--text-tertiary)">' +
        'Results come from the indexed evidence DB behind the API. Each record can expose DOI, PubMed, Europe PMC, and open-access links when available.' +
      '</div>' +
      '<div style="padding:0 16px 16px;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(320px,1fr);gap:16px;align-items:start">' +
        '<div>' +
          '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">' +
            '<button class="ch-btn-sm ch-btn-teal" onclick="window._reSummarizeIndexedEvidence()">✦ Summarise selected</button>' +
            '<span style="font-size:11px;color:var(--text-tertiary)">Search shows title, authors, journal, links, abstract snippets, and promotes directly to the clinician library.</span>' +
          '</div>' +
          '<div id="re-ev-results"></div>' +
          '<div id="re-ev-ai-draft" style="margin-top:16px"></div>' +
        '</div>' +
        '<div>' +
          '<div id="re-ev-context"></div>' +
          '<div id="re-ev-detail" style="margin-top:16px">' + renderDetailPanel(state.detail) + '</div>' +
        '</div>' +
      '</div>' +
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

  const condSel = document.getElementById('re-ev-cond');
  if (condSel) condSel.value = state.filters.indication || '';
  const gradeSel = document.getElementById('re-ev-grade');
  if (gradeSel) gradeSel.value = state.filters.grade || '';
  const searchInput = document.getElementById('re-ev-q');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window._reRunIndexedSearch?.();
    });
  }

  const contextHost = document.getElementById('re-ev-context');
  if (contextHost) contextHost.innerHTML = renderContextPanel(state.lastGraph || [], state.lastTrials || [], state.lastDevices || [], state.lastRanked || []);
  const detailHost = document.getElementById('re-ev-detail');
  if (detailHost) detailHost.innerHTML = renderDetailPanel(state.detail);

  if (window._reEvidencePrefill) {
    const _pref = String(window._reEvidencePrefill || '').trim();
    window._reEvidencePrefill = null;
    const _input = document.getElementById('re-ev-q');
    if (_input && _pref) {
      _input.value = _pref;
      try { _input.focus(); _input.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      try { window._reRunIndexedSearch?.(); } catch {}
    }
  } else if (state.filters.q || state.filters.indication) {
    try { window._reRunIndexedSearch?.(); } catch {}
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
  const _totalEvPapers  = _liveEvidenceUiStats?.totalPapers || EVIDENCE_SUMMARY?.totalPapers || 87000;
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
