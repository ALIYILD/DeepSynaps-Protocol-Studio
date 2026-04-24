// ─────────────────────────────────────────────────────────────────────────────
// pages-research-evidence.js — Research Evidence Interactive Dashboard
// 87,000 papers · 53 conditions · 13 modalities · 24 assessments · 18 devices
// ─────────────────────────────────────────────────────────────────────────────

import { tag, spinner } from './helpers.js';
import {
  EVIDENCE_TOTAL_PAPERS, EVIDENCE_TOTAL_TRIALS, EVIDENCE_TOTAL_META,
  EVIDENCE_SOURCES, CONDITION_EVIDENCE, EVIDENCE_SUMMARY,
  getTopConditionsByPaperCount, searchEvidenceByKeyword,
} from './evidence-dataset.js';
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

/* ── tab meta ──────────────────────────────────────────────────────────────── */
const TAB_META = {
  overview:    { label: 'Overview',                   color: 'var(--teal)'   },
  conditions:  { label: 'Conditions & Comorbidity',   color: 'var(--blue)'   },
  assessments: { label: 'Assessments & Scales',       color: 'var(--violet)' },
  protocols:   { label: 'Protocols & Devices',        color: 'var(--green)'  },
  neuro:       { label: 'Brain Targets & Biomarkers', color: 'var(--rose)'   },
  aiml:        { label: 'AI/ML & Psychotherapies',    color: 'var(--amber)'  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   pgResearchEvidence — main export
   ══════════════════════════════════════════════════════════════════════════════ */
export async function pgResearchEvidence(setTopbar, navigate) {
  const tab = window._resEvidenceTab || 'overview';
  window._resEvidenceTab = tab;
  const el = document.getElementById('content');

  setTopbar('Research Evidence',
    '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--teal);color:#fff;font-weight:600">87K Papers</span>');

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
        onclick="window._reFilter['${tab}']='${esc(v)}';window._nav('research-evidence')">${esc(v)}</button>`
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
  if (tab === 'overview')         renderOverview(body);
  else if (tab === 'conditions')  renderConditions(body, q, filt, sort, sInput, pills, sortBtn);
  else if (tab === 'assessments') renderAssessments(body, q, filt, sInput, pills);
  else if (tab === 'protocols')   renderProtocols(body, q, sInput);
  else if (tab === 'neuro')       renderNeuro(body, q, filt, sInput, pills);
  else if (tab === 'aiml')        renderAIML(body, q, sInput);
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 1 — Overview
   ══════════════════════════════════════════════════════════════════════════════ */
function renderOverview(body) {
  const S = EVIDENCE_SUMMARY;
  const top10 = getTopConditionsByPaperCount(10);

  /* KPI strip */
  const kpis = [
    { val: fmtK(EVIDENCE_TOTAL_PAPERS), label: 'Papers', color: 'var(--teal)' },
    { val: fmtK(EVIDENCE_TOTAL_TRIALS), label: 'Clinical Trials', color: 'var(--blue)' },
    { val: fmtK(EVIDENCE_TOTAL_META),   label: 'Meta-analyses', color: 'var(--violet)' },
    { val: S.totalConditions,            label: 'Conditions', color: 'var(--rose)' },
    { val: S.totalDevices,               label: 'Modalities', color: 'var(--amber)' },
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
  for (const s of EVIDENCE_SOURCES) {
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
  const gd = S.gradeDistribution;
  const gdMax = Math.max(...Object.values(gd));
  let gradeHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Evidence Grade Distribution</div>';
  for (const [g, cnt] of Object.entries(gd)) {
    gradeHtml += hBar('Grade ' + g, cnt, gdMax, GRADE_CLR[g] || 'var(--teal)');
  }
  gradeHtml += '</div>';

  /* modality distribution */
  const md = S.modalityDistribution;
  const mdEntries = Object.entries(md).sort(([, a], [, b]) => b - a);
  const mdMax = mdEntries[0]?.[1] || 1;
  let modHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Top Modalities by Paper Count</div>';
  for (const [m, cnt] of mdEntries) {
    modHtml += hBar(m, cnt, mdMax, 'var(--violet)');
  }
  modHtml += '</div>';

  /* top journals */
  let jrnlHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Top Publishing Journals</div>';
  jrnlHtml += '<table style="width:100%;font-size:12px;border-collapse:collapse">';
  jrnlHtml += '<thead><tr style="text-align:left;color:var(--text-tertiary);border-bottom:1px solid var(--border)"><th style="padding:6px 8px">Journal</th><th style="padding:6px 8px;text-align:right">Papers</th><th style="padding:6px 8px;text-align:right">Impact Factor</th></tr></thead><tbody>';
  for (const j of S.topPublishingJournals) {
    jrnlHtml += `<tr style="border-bottom:1px solid var(--border-light,var(--border))"><td style="padding:6px 8px">${esc(j.name)}</td><td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums">${fmt(j.papers)}</td><td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums">${j.impactFactor}</td></tr>`;
  }
  jrnlHtml += '</tbody></table></div>';

  /* top conditions */
  const tcMax = top10[0]?.paperCount || 1;
  let tcHtml = '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Top 10 Conditions by Paper Count</div>';
  for (const c of top10) {
    const label = c.conditionId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    tcHtml += hBar(label, c.paperCount, tcMax, 'var(--blue)');
  }
  tcHtml += '</div>';

  /* two-column layout for charts */
  body.innerHTML = kpiHtml + srcHtml +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px">' +
    yearHtml + gradeHtml + modHtml + tcHtml + jrnlHtml +
    '</div>';
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 2 — Conditions & Comorbidity
   ══════════════════════════════════════════════════════════════════════════════ */
function renderConditions(body, q, filt, sort, sInput, pills, sortBtn) {
  const cats = ['All', 'Mood', 'Anxiety', 'OCD Spectrum', 'Trauma', 'ADHD', 'Autism',
    'Pain', 'Sleep', 'Neurological', 'Substance', 'Eating', 'Comorbid', 'Other'];

  /* merge evidence data + registry metadata */
  let rows = CONDITION_EVIDENCE.map(ev => {
    const reg = _regLookup(ev.conditionId);
    return {
      ...ev,
      name: reg?.name || ev.conditionId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      icd10: reg?.icd10 || '',
      cat: reg?.cat || (ev.conditionId.includes('comorbid') ? 'Comorbid' : 'Other'),
      ev: reg?.ev || '',
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
  else if (sort === 'rcts') rows.sort((a, b) => b.rctCount - a.rctCount);
  else if (sort === 'meta') rows.sort((a, b) => b.metaAnalysisCount - a.metaAnalysisCount);
  else if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));

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
      <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums">${fmt(r.rctCount)}</td>
      <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums">${fmt(r.metaAnalysisCount)}</td>
      <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums">${fmt(r.systematicReviewCount)}</td>
      <td style="padding:8px"><span style="display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;border-radius:8px;background:${gradeBg};color:#fff">${esc(r.ev || '—')}</span></td>
      <td style="padding:8px;font-size:11px;color:var(--text-tertiary)">${esc((r.topJournals || [])[0] || '')}</td>
    </tr>`;

    /* expanded detail — recent high-impact papers */
    if (expanded && r.recentHighImpact?.length) {
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
  html += `<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Showing ${rows.length} of ${CONDITION_EVIDENCE.length} conditions</div>`;
  body.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 3 — Assessments & Scales
   ══════════════════════════════════════════════════════════════════════════════ */
function renderAssessments(body, q, filt, sInput, pills) {
  const domains = ['All', ...new Set(ASSESSMENT_REGISTRY.map(a => a.domain).filter(Boolean))];

  let rows = [...ASSESSMENT_REGISTRY];
  if (filt !== 'All') rows = rows.filter(a => a.domain === filt);
  if (q) rows = rows.filter(a => (a.name + ' ' + a.id + ' ' + a.domain + ' ' + (a.conditions || []).join(' ')).toLowerCase().includes(q));

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
function renderProtocols(body, q, sInput) {
  let html = sInput('Search protocols, devices, modalities...') + '<div style="margin-bottom:16px"></div>';

  /* ── Section A: Protocol Templates ────────────────────────────────────────── */
  let protos = [...PROTOCOL_REGISTRY];
  if (q) protos = protos.filter(p => (p.name + ' ' + p.condition + ' ' + p.modality + ' ' + p.target).toLowerCase().includes(q));

  html += '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Protocol Templates (' + protos.length + ')</div>';
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
  let devs = [...DEVICE_REGISTRY];
  if (q) devs = devs.filter(d => (d.name + ' ' + d.mfr + ' ' + d.modality + ' ' + d.indication).toLowerCase().includes(q));

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
  const md = EVIDENCE_SUMMARY.modalityDistribution;
  const mdEntries = Object.entries(md).sort(([, a], [, b]) => b - a);
  const mdMax = mdEntries[0]?.[1] || 1;
  html += '<div class="ch-card" style="padding:16px;margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px;font-size:14px">Modality Research Volume</div>';
  for (const [m, cnt] of mdEntries) {
    html += hBar(m, cnt, mdMax, 'var(--green)');
  }
  html += '</div>';

  body.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 5 — Brain Targets & Biomarkers
   ══════════════════════════════════════════════════════════════════════════════ */
function renderNeuro(body, q, filt, sInput, pills) {
  const lobes = ['All', ...new Set(BRAIN_TARGET_REGISTRY.map(t => t.lobe).filter(Boolean))];

  let rows = [...BRAIN_TARGET_REGISTRY];
  if (filt !== 'All') rows = rows.filter(t => t.lobe === filt);
  if (q) rows = rows.filter(t => (t.label + ' ' + t.region + ' ' + t.function + ' ' + t.clinical + ' ' + t.site10_20).toLowerCase().includes(q));

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

      html += `<tr><td colspan="7" style="padding:8px 8px 12px 24px;background:var(--surface-1,var(--bg));font-size:12px">
        <div style="font-weight:500;margin-bottom:4px">Region: ${esc(t.region)}</div>`;
      if (linkedProtos.length) {
        html += '<div style="margin-top:6px"><strong>Linked Protocols:</strong> ' + linkedProtos.map(p => `<span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--green);color:#fff;margin:2px">${esc(p.name)}</span>`).join('') + '</div>';
      }
      if (linkedConds.length) {
        html += '<div style="margin-top:6px"><strong>Linked Conditions:</strong> ' + linkedConds.map(c => `<span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--blue);color:#fff;margin:2px">${esc(c.name)}</span>`).join('') + '</div>';
      }
      html += '</td></tr>';
    }
  }

  html += '</tbody></table></div>';
  html += `<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Showing ${rows.length} of ${BRAIN_TARGET_REGISTRY.length} brain targets</div>`;
  body.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════════════════════
   TAB 6 — AI/ML & Psychotherapies
   ══════════════════════════════════════════════════════════════════════════════ */
function renderAIML(body, q, sInput) {
  /* keyword searches across recentHighImpact */
  const aiKeywords  = ['machine learning', 'artificial intelligence', 'deep learning', 'neural network', 'predictive model', 'classifier', 'biomarker prediction'];
  const psyKeywords = ['psychotherapy', 'cbt', 'cognitive behav', 'exposure', 'erp', 'mindfulness', 'behavioural activation', 'behavioral activation', 'therapy augment'];

  function gather(keywords) {
    const results = [];
    const seen = new Set();
    for (const kw of keywords) {
      for (const r of searchEvidenceByKeyword(kw)) {
        const key = r.doi || r.title;
        if (!seen.has(key)) { seen.add(key); results.push(r); }
      }
    }
    return results;
  }

  let aiPapers  = gather(aiKeywords);
  let psyPapers = gather(psyKeywords);

  if (q) {
    aiPapers  = aiPapers.filter(p => (p.title + ' ' + p.authors + ' ' + p.journal + ' ' + p.conditionId).toLowerCase().includes(q));
    psyPapers = psyPapers.filter(p => (p.title + ' ' + p.authors + ' ' + p.journal + ' ' + p.conditionId).toLowerCase().includes(q));
  }

  function paperCard(p) {
    const condLabel = p.conditionId?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '';
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border-light,var(--border))">
      <div style="font-size:12px;font-weight:500">${esc(p.title)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(p.authors)} &middot; ${p.year} &middot; <em>${esc(p.journal)}</em> &middot; ${fmt(p.citations)} citations</div>
      <div style="display:flex;gap:4px;margin-top:4px">
        <span style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--blue);color:#fff">${esc(condLabel)}</span>
        ${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener" style="padding:2px 6px;font-size:10px;border-radius:6px;background:var(--surface-2);color:var(--teal);text-decoration:none">DOI</a>` : ''}
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
