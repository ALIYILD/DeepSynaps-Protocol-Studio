// pages-brainmap.js — Brain Map Planner (design-v2 screen 06)
// Standalone top-level page extracted from Protocol Hub per merge-map §06.
// Three tabs: Clinical (default) · Montage · Research.

import { api } from './api.js';
import { renderBrainMap10_20, SITES_10_20 } from './brain-map-svg.js';

// ── Tokens ───────────────────────────────────────────────────────────────────
const T = {
  bg:       'var(--dv2-bg-base, var(--bg-base, #04121c))',
  panel:    'var(--dv2-bg-panel, var(--bg-panel, #0a1d29))',
  surface:  'var(--dv2-bg-surface, var(--bg-surface, rgba(255,255,255,0.04)))',
  surface2: 'var(--dv2-bg-surface-2, rgba(255,255,255,0.07))',
  card:     'var(--dv2-bg-card, rgba(14,22,40,0.8))',
  border:   'var(--dv2-border, var(--border, rgba(255,255,255,0.08)))',
  t1:       'var(--dv2-text-primary, var(--text-primary, #e2e8f0))',
  t2:       'var(--dv2-text-secondary, var(--text-secondary, #94a3b8))',
  t3:       'var(--dv2-text-tertiary, var(--text-tertiary, #64748b))',
  teal:     'var(--dv2-teal, var(--teal, #00d4bc))',
  blue:     'var(--dv2-blue, var(--blue, #4a9eff))',
  amber:    'var(--dv2-amber, var(--amber, #ffb547))',
  rose:     'var(--dv2-rose, var(--rose, #ff6b9d))',
  violet:   'var(--dv2-violet, var(--violet, #9b7fff))',
  fdisp:    'var(--dv2-font-display, var(--font-display, "Outfit", system-ui, sans-serif))',
  fbody:    'var(--dv2-font-body, var(--font-body, "DM Sans", system-ui, sans-serif))',
  fmono:    'var(--dv2-font-mono, "JetBrains Mono", ui-monospace, monospace)',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function _list(v) {
  return String(v || '')
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function _brainMapTargetQuery(code) {
  const raw = String(code || '').toLowerCase();
  if (!raw) return '';
  if (raw.includes('dlpfc')) return 'dlpfc';
  if (raw.includes('m1')) return 'm1';
  if (raw.includes('sma')) return 'sma';
  if (raw.includes('ifg')) return 'ifg';
  if (raw.includes('mpfc')) return 'mpfc';
  if (raw.includes('tpj') || raw.includes('p7') || raw.includes('p8')) return 'tpj';
  return raw.replace(/[^a-z0-9]+/g, '_');
}

function _anchorFromText(value) {
  const text = String(value || '');
  const match = text.match(/\b(AFp?z|Fp1|Fp2|Fpz|AF3|AF4|F3|F4|F7|F8|Fz|FCz|C3|C4|Cz|CP3|CP4|P3|P4|P7|P8|Pz|T7|T8|O1|O2|Oz)\b/i);
  return match ? match[1] : '';
}

function _normalizeAtlas(targets) {
  if (!Array.isArray(targets) || !targets.length) return [];
  const grouped = new Map();
  for (const row of targets) {
    const lobe = row?.lobe || 'Other';
    const items = grouped.get(lobe) || [];
    const abbr = String(row?.abbreviation || row?.name || '').trim();
    const primary = _anchorFromText(row?.eeg_position_10_20) || abbr || 'F3';
    const anchors = _list(row?.eeg_position_10_20);
    const usable = anchors.length ? anchors : [primary];
    for (const rawAnchor of usable.slice(0, 2)) {
      const anchor = _anchorFromText(rawAnchor);
      if (!anchor) continue;
      items.push({
        code: rawAnchor === usable[0] ? abbr || anchor : `${abbr || anchor}-${anchor}`,
        anchor,
        name: rawAnchor === usable[0] ? `${row?.name || abbr}` : `${row?.name || abbr} · ${anchor}`,
        fn: row?.primary_functions || row?.brain_network || '',
        cond: _list(row?.key_conditions),
      });
    }
    grouped.set(lobe, items);
  }
  return Array.from(grouped.entries()).map(([lobe, sites]) => ({ lobe, sites })).filter((group) => group.sites.length);
}

function _normalizeMontages(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows
    .filter((row) => String(row?.modality_id || '').toUpperCase() === 'MOD-003' || /tdcs/i.test(String(row?.modality_name || '')))
    .map((row) => {
      const placement = String(row?.coil_or_electrode_placement || '');
      const anode = _anchorFromText(placement.match(/anode[^;,.]*/i)?.[0]) || _anchorFromText(placement) || 'F3';
      const cathode = _anchorFromText(placement.match(/cathode[^;,.]*/i)?.[0]) || _anchorFromText(placement.split(';').slice(1).join(';')) || 'Fp2';
      return {
        id: row?.protocol_id || `${row?.condition_slug || 'protocol'}-tdcs`,
        title: row?.protocol_name || row?.condition_label || 'tDCS protocol',
        indication: row?.condition_label || row?.condition_slug || '',
        anode,
        cathode,
        targetRegion: _anchorFromText(row?.target_region) || anode,
        grade: String(row?.evidence_grade || '').replace(/^EV-/, '') || 'B',
      };
    })
    .filter((row) => row.anode && row.cathode);
}

function _normalizeEvidence(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((row) => ({
    title: row?.title || 'Untitled paper',
    year: row?.year || null,
    authors: row?.authors || '',
    grade: row?.evidence_tier ? String(row.evidence_tier).charAt(0).toUpperCase() : 'B',
    doi: row?.doi || '',
    delta: row?.research_summary || row?.trial_protocol_parameter_summary || '',
    n: row?.citation_count || null,
  }));
}

// Default state factory
function defaultState() {
  return {
    tab: 'clinical',
    viewMode: '2d',
    anode: 'F3',
    cathode: 'Fp2',
    targetAnchor: 'F3',
    targetRegion: 'DLPFC-L',
    highlights: [],
    currentMA: 2.0,
    durationMin: 20,
    sessions: 20,
    selectedRegion: 'DLPFC-L',
    // derived
    placeMode: 'anode', // anode | cathode | target
  };
}

// ── Static fallback data ─────────────────────────────────────────────────────
// Used when api.listTargets?.() is unavailable.
const TARGET_ATLAS_FALLBACK = [
  { lobe: 'Frontal', sites: [
    { code: 'DLPFC-L', anchor: 'F3',  name: 'DLPFC · Left',      fn: 'executive function · working memory · top-down affect', cond: ['MDD','TRD','OCD','Addiction'] },
    { code: 'DLPFC-R', anchor: 'F4',  name: 'DLPFC · Right',     fn: 'inhibitory control · anxious rumination',                cond: ['GAD','PTSD'] },
    { code: 'mPFC',    anchor: 'Fz',  name: 'mPFC (Fz / FP1)',   fn: 'emotion regulation · default-mode hub',                  cond: ['PTSD','MDD','Addiction'] },
    { code: 'IFG-L',   anchor: 'F7',  name: 'IFG · Broca',       fn: 'speech production · post-stroke aphasia',                cond: ['Aphasia'] },
  ]},
  { lobe: 'Parietal', sites: [
    { code: 'P3',      anchor: 'P3',  name: 'P3',                fn: 'left parietal · attention · sensory integration',        cond: ['Neglect'] },
    { code: 'P4',      anchor: 'P4',  name: 'P4',                fn: 'right parietal · attention reorienting',                 cond: ['Neglect','Tinnitus'] },
    { code: 'Pz',      anchor: 'Pz',  name: 'Pz',                fn: 'midline parietal · cognitive control',                   cond: ['ADHD'] },
  ]},
  { lobe: 'Central', sites: [
    { code: 'C3',      anchor: 'C3',  name: 'C3 · M1-L',         fn: 'left primary motor · pain modulation · motor rehab',    cond: ['Pain','Stroke','Fibromyalgia'] },
    { code: 'C4',      anchor: 'C4',  name: 'C4 · M1-R',         fn: 'right primary motor · contralateral rehab',              cond: ['Pain','Stroke'] },
    { code: 'Cz',      anchor: 'Cz',  name: 'Cz',                fn: 'vertex · generalised cortical excitability',             cond: ['Epilepsy'] },
    { code: 'SMA',     anchor: 'Cz',  name: 'SMA (FCz)',         fn: 'motor planning · response inhibition',                   cond: ['OCD','Tourette'] },
  ]},
  { lobe: 'Temporal', sites: [
    { code: 'T7',      anchor: 'T7',  name: 'T7',                fn: 'left temporal · auditory · language',                    cond: ['Tinnitus','Aphasia'] },
    { code: 'T8',      anchor: 'T8',  name: 'T8',                fn: 'right temporal · auditory · AVH',                        cond: ['Schizophrenia','Tinnitus'] },
    { code: 'P7',      anchor: 'P7',  name: 'P7 · TPJ-L',        fn: 'temporo-parietal · social cognition',                    cond: ['Schizophrenia'] },
    { code: 'P8',      anchor: 'P8',  name: 'P8 · TPJ-R',        fn: 'attention reorienting · tinnitus',                       cond: ['Tinnitus'] },
  ]},
  { lobe: 'Occipital', sites: [
    { code: 'O1',      anchor: 'O1',  name: 'O1',                fn: 'left primary visual',                                    cond: ['Migraine'] },
    { code: 'O2',      anchor: 'O2',  name: 'O2',                fn: 'right primary visual',                                   cond: ['Migraine'] },
    { code: 'V1',      anchor: 'Oz',  name: 'V1 (Oz)',           fn: 'cortical excitability · migraine prophylaxis',          cond: ['Migraine'] },
  ]},
];

const MONTAGE_LIBRARY_FALLBACK = [
  { id: 'mdd-dlpfc-l',    title: 'Anodal L-DLPFC / Cathodal Fp2', indication: 'MDD · TRD',           anode: 'F3', cathode: 'Fp2', targetRegion: 'DLPFC-L', grade: 'A' },
  { id: 'bilateral-dlpfc',title: 'Bilateral DLPFC',              indication: 'MDD · cognitive control', anode: 'F3', cathode: 'F4',  targetRegion: 'DLPFC-B', grade: 'B' },
  { id: 'cathodal-r',     title: 'Cathodal R-DLPFC / Anodal L-Supraorbital', indication: 'Anxious depression', anode: 'Fp1', cathode: 'F4', targetRegion: 'DLPFC-R', grade: 'B' },
  { id: 'm1-pain',        title: 'Anodal M1 / Cathodal Contralateral Supraorbital', indication: 'Chronic pain', anode: 'C3', cathode: 'Fp2', targetRegion: 'M1-L', grade: 'A' },
  { id: 'sma-ocd',        title: 'Cathodal SMA / Anodal Right Deltoid',  indication: 'OCD · Tourette',     anode: 'Cz', cathode: 'Fp1', targetRegion: 'SMA',    grade: 'B' },
  { id: 'tpj-aud',        title: 'Cathodal L-TPJ / Anodal R-Supraorbital', indication: 'Tinnitus · AVH',    anode: 'Fp2', cathode: 'P7', targetRegion: 'TEMPORAL-L', grade: 'C' },
];

const EVIDENCE_FALLBACK = [
  { title: 'tDCS L-DLPFC for treatment-resistant MDD', year: 2021, authors: 'Fregni et al.', grade: 'A', doi: '10.1001/jama.2021.0001', delta: '↓ HAM-D −6.2 vs sham (95% CI −8.1, −4.3)', n: 1092 },
  { title: 'Anodal F3 + cathodal Fp2 · cognitive reappraisal', year: 2019, authors: 'Brunoni et al.', grade: 'B', doi: '10.1016/j.brs.2019.03.005', delta: 'Responder rate 41% vs 22% sham at week 10', n: 245 },
  { title: 'Focal F5 variant · improved DLPFC targeting',      year: 2020, authors: 'Bikson et al.', grade: 'C', doi: '10.1016/j.brs.2020.06.002', delta: '+18% focality vs F3 · modeling study',      n: 32 },
];

const CONTRAINDICATIONS = [
  { id: 'ferro',    label: 'Ferromagnetic implants near electrode site', severity: 'err' },
  { id: 'preg',     label: 'Pregnancy (Tier 2 evidence · clinician discretion)', severity: 'amb' },
  { id: 'lesion',   label: 'Skin lesion or abrasion at electrode site', severity: 'err' },
  { id: 'seizure',  label: 'History of seizures in last 12 months',     severity: 'amb' },
  { id: 'impedance',label: 'Impedance check <5 kΩ both electrodes',     severity: 'ok'  },
];

// ── Page bootstrap ───────────────────────────────────────────────────────────
export async function pgBrainMapPlanner(setTopbar, navigate) {
  if (typeof setTopbar === 'function') {
    setTopbar('Brain Map Planner',
      `<span id="dv2bm-topbar-meta" style="font-size:0.8rem;color:${T.t2};align-self:center">tDCS · 10-20 montage · evidence-graded</span>`);
  }
  const root = document.getElementById('content');
  if (!root) return;

  // Initialise / restore state
  if (!window._bmState) window._bmState = defaultState();
  const S = window._bmState;

  // Data fetch (all endpoints optional, graceful stubs)
  const data = { targets: null, montages: null, evidence: null, efield: null };
  try {
    if (typeof api.listTargets === 'function') data.targets = await api.listTargets();
  } catch (_) { data.targets = null; }
  try {
    if (typeof api.listMontages === 'function') data.montages = await api.listMontages();
  } catch (_) { data.montages = null; }
  try {
    if (typeof api.listProtocolEvidence === 'function') {
      data.evidence = await api.listProtocolEvidence({ target: _brainMapTargetQuery(S.targetRegion), modality: 'tDCS', limit: 8 });
    }
  } catch (_) { data.evidence = null; }

  const liveAtlas = _normalizeAtlas(data.targets);
  const liveMontages = _normalizeMontages(data.montages);
  const liveEvidence = _normalizeEvidence(data.evidence);
  const atlas = liveAtlas.length ? liveAtlas : TARGET_ATLAS_FALLBACK;
  const montages = liveMontages.length ? liveMontages : MONTAGE_LIBRARY_FALLBACK;
  const evidence = liveEvidence.length ? liveEvidence : EVIDENCE_FALLBACK;
  const usingFallback = !(liveAtlas.length && liveMontages.length && liveEvidence.length);
  const topbarMeta = document.getElementById('dv2bm-topbar-meta');
  if (topbarMeta) {
    topbarMeta.textContent = usingFallback
      ? 'tDCS · 10-20 montage · preview fallback data'
      : 'tDCS · 10-20 montage · evidence-graded';
  }

  // Handlers
  window._bmSwitchTab = (tab) => { S.tab = tab; render(root, { atlas, montages, evidence, navigate, usingFallback }); };
  window._bmSelectSite = (code, anchor) => {
    S.selectedRegion = code;
    S.targetRegion   = code;
    S.targetAnchor   = anchor;
    render(root, { atlas, montages, evidence, navigate, usingFallback });
  };
  window._bmApplyRole = (role, anchor) => {
    if (role === 'anode')   S.anode = anchor;
    if (role === 'cathode') S.cathode = anchor;
    if (role === 'target') { S.targetAnchor = anchor; }
    render(root, { atlas, montages, evidence, navigate, usingFallback });
  };
  window._bmSetViewMode = (mode) => { S.viewMode = mode; render(root, { atlas, montages, evidence, navigate, usingFallback }); };
  window._bmSetCurrent = (v) => {
    S.currentMA = clamp(parseFloat(v) || 0.5, 0.5, 2.5);
    const valEl = document.getElementById('dv2bm-current-val');
    if (valEl) valEl.textContent = S.currentMA.toFixed(1) + ' mA';
    renderSafety();
  };
  window._bmSetDuration = (v) => {
    S.durationMin = clamp(parseInt(v,10) || 5, 5, 30);
    const valEl = document.getElementById('dv2bm-duration-val');
    if (valEl) valEl.textContent = S.durationMin + ' min';
  };
  window._bmSetSessions = (v) => {
    S.sessions = clamp(parseInt(v,10) || 1, 1, 40);
    const valEl = document.getElementById('dv2bm-sessions-val');
    if (valEl) valEl.textContent = S.sessions + ' sessions';
  };
  window._bmLoadMontage = (id) => {
    const m = montages.find(x => x.id === id);
    if (!m) return;
    S.anode        = m.anode        || S.anode;
    S.cathode      = m.cathode      || S.cathode;
    S.targetRegion = m.targetRegion || S.targetRegion;
    S.targetAnchor = (atlas.flatMap(g => g.sites).find(s => s.code === S.targetRegion)?.anchor) || m.anode;
    S.tab = 'clinical';
    render(root, { atlas, montages, evidence, navigate, usingFallback });
  };
  window._bmSave = async () => {
    const snapshot = {
      anode: S.anode, cathode: S.cathode, targetRegion: S.targetRegion,
      currentMA: S.currentMA, durationMin: S.durationMin, sessions: S.sessions,
    };
    try {
      if (typeof api.saveMontage === 'function') {
        await api.saveMontage(snapshot);
        toast('Montage saved', `${snapshot.anode} → ${snapshot.cathode} · ${snapshot.currentMA} mA`);
        return;
      }
    } catch (e) {
      toast('Save failed', e?.message || 'Endpoint not available', 'error');
      return;
    }
    toast('Saved locally', 'saveMontage endpoint not wired; kept in session state.');
  };
  window._bmExport = () => {
    const blob = new Blob([JSON.stringify({ state: window._bmState }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `brainmap-${S.targetRegion}-${Date.now()}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  };

  function renderSafety() {
    const box = document.getElementById('dv2bm-safety');
    if (!box) return;
    box.innerHTML = safetyBanners();
  }

  function toast(title, body, severity='info') {
    if (typeof window._dsToast === 'function') window._dsToast({ title, body, severity });
    else console.info('[brainmap]', title, body);
  }

  render(root, { atlas, montages, evidence, navigate, usingFallback });
}

// ── Top-level render ─────────────────────────────────────────────────────────
function render(root, ctx) {
  const S = window._bmState;
  root.innerHTML = `
    ${styleBlock()}
    <div class="dv2bm-wrap">
      ${ctx.usingFallback ? `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;margin-bottom:16px;background:linear-gradient(135deg,rgba(245,158,11,0.14),rgba(217,119,6,0.08));border:1px solid rgba(245,158,11,0.35);border-radius:12px">
        <span style="font-size:15px;color:${T.warn}">⚠</span>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${T.warn}">Preview Fallback Data</div>
          <div style="font-size:11.5px;color:${T.t2};margin-top:3px;line-height:1.45">This Brain Map Planner view is using built-in sample atlas, montage, and evidence rows because live API data is unavailable. Verify everything before clinical use.</div>
        </div>
      </div>` : ''}
      ${tabBar(S.tab)}
      <div class="dv2bm-body">
        ${S.tab === 'clinical' ? renderClinical(ctx) : ''}
        ${S.tab === 'montage'  ? renderMontage(ctx)  : ''}
        ${S.tab === 'research' ? renderResearch(ctx) : ''}
      </div>
    </div>
  `;
}

function tabBar(active) {
  const tab = (id, label, num) =>
    `<button class="dv2bm-tab ${active===id?'active':''}" onclick="window._bmSwitchTab('${id}')">
       <span class="dv2bm-tab-num">${num}</span>${esc(label)}
     </button>`;
  return `
    <div class="dv2bm-tab-bar">
      ${tab('clinical','Clinical','01')}
      ${tab('montage','Montage','02')}
      ${tab('research','Research','03')}
      <div class="dv2bm-tab-spacer"></div>
      <span class="dv2bm-tab-hint">Screen 06 · merge-map</span>
    </div>
  `;
}

// ── CLINICAL TAB ─────────────────────────────────────────────────────────────
function renderClinical(ctx) {
  return `
    <div class="dv2bm-clinical">
      ${leftRail(ctx.atlas)}
      ${centerCanvas()}
      ${rightRail(ctx.evidence)}
    </div>
  `;
}

function leftRail(atlas) {
  const S = window._bmState;
  const group = (g) => `
    <div class="dv2bm-lobe">
      <div class="dv2bm-lobe-head">${esc(g.lobe)}</div>
      ${g.sites.map(s => `
        <div class="dv2bm-region ${S.selectedRegion===s.code?'active':''}"
             onclick="window._bmSelectSite('${esc(s.code)}','${esc(s.anchor)}')">
          <div class="dv2bm-region-dot"></div>
          <div class="dv2bm-region-body">
            <div class="dv2bm-region-name">${esc(s.name)}
              <span class="dv2bm-region-anchor">${esc(s.anchor)}</span>
            </div>
            <div class="dv2bm-region-fn">${esc(s.fn)}</div>
            <div class="dv2bm-region-cond">${(s.cond||[]).map(c => `<span>${esc(c)}</span>`).join('')}</div>
            <div class="dv2bm-region-roles">
              <button onclick="event.stopPropagation();window._bmApplyRole('anode','${esc(s.anchor)}')">Set anode</button>
              <button onclick="event.stopPropagation();window._bmApplyRole('cathode','${esc(s.anchor)}')">Set cathode</button>
              <button onclick="event.stopPropagation();window._bmApplyRole('target','${esc(s.anchor)}')">Set target</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  return `
    <aside class="dv2bm-left">
      <div class="dv2bm-left-head">
        <div class="dv2bm-left-title">Target atlas</div>
        <input class="dv2bm-left-search" placeholder="Region, function, condition…"
               oninput="(function(v){document.querySelectorAll('.dv2bm-region').forEach(el=>{el.style.display=el.innerText.toLowerCase().includes(v.toLowerCase())?'':'none';});})(this.value)"/>
      </div>
      <div class="dv2bm-left-body">
        ${atlas.map(group).join('')}
      </div>
    </aside>
  `;
}

function centerCanvas() {
  const S = window._bmState;
  const canvas = S.viewMode === '2d'
    ? renderBrainMap10_20({
        anode: S.anode,
        cathode: S.cathode,
        targetRegion: S.targetRegion,
        size: 400,
        showZones: true,
        showConnection: true,
        highlightSites: S.highlights,
      })
    : viewPlaceholder(S.viewMode);

  const overlay = S.viewMode === '2d' && S.currentMA ? efieldOverlay(S) : '';

  const modes = [
    { id: '2d',       label: '2D 10-20' },
    { id: '3d',       label: '3D cortex' },
    { id: 'inflated', label: 'Inflated' },
    { id: 'coronal',  label: 'Coronal' },
    { id: 'heatmap',  label: 'E-field heatmap' },
  ];

  const phases = [
    { id: 'ramp-up',   pct: 2.5,  label: 'Ramp ↑ 30 s', color: T.amber },
    { id: 'steady',    pct: 95.0, label: `Steady ${S.currentMA.toFixed(1)} mA · ${S.durationMin} min`, color: T.teal },
    { id: 'ramp-down', pct: 2.5,  label: 'Ramp ↓ 30 s', color: T.amber },
  ];

  return `
    <section class="dv2bm-center">
      <div class="dv2bm-canvas-wrap">
        <div class="dv2bm-canvas-glow"></div>
        <div class="dv2bm-canvas">
          ${canvas}
          ${overlay}
        </div>
        <div class="dv2bm-canvas-legend">
          <span><i style="background:${T.teal}"></i>Anode ${esc(S.anode)}</span>
          <span><i style="background:${T.rose}"></i>Cathode ${esc(S.cathode)}</span>
          <span><i style="background:${T.blue}"></i>Target ${esc(S.targetRegion)}</span>
        </div>
      </div>

      <div class="dv2bm-view-modes">
        ${modes.map(m => `
          <button class="dv2bm-view-pill ${S.viewMode===m.id?'active':''}"
                  onclick="window._bmSetViewMode('${m.id}')">${esc(m.label)}</button>
        `).join('')}
      </div>

      <div class="dv2bm-scrubber">
        <div class="dv2bm-scrub-label">Timeline · session ${window._bmState.durationMin}:30 total</div>
        <div class="dv2bm-scrub-track">
          ${phases.map(p => `
            <div class="dv2bm-scrub-phase" style="flex:${p.pct};background:${p.color}22;border-left:2px solid ${p.color}">
              <span style="color:${p.color}">${esc(p.label)}</span>
            </div>`).join('')}
          <div class="dv2bm-scrub-handle" style="left:45%"></div>
        </div>
      </div>
    </section>
  `;
}

function efieldOverlay(S) {
  // Render subtle radial gradient circles over the anode site position.
  const a = SITES_10_20.find(s => s.id === S.anode);
  if (!a) return '';
  const cx = 200 + a.x * 160;
  const cy = 200 + a.y * 160;
  const intensity = clamp(S.currentMA / 2.5, 0.2, 1.0);
  return `
    <svg class="dv2bm-efield" viewBox="0 0 400 400" width="400" height="400"
         style="position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen">
      <defs>
        <radialGradient id="dv2bm-heat" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stop-color="rgba(255,107,157,${0.55*intensity})"/>
          <stop offset="40%"  stop-color="rgba(255,181,71,${0.35*intensity})"/>
          <stop offset="70%"  stop-color="rgba(74,222,128,${0.18*intensity})"/>
          <stop offset="100%" stop-color="rgba(0,212,188,0)"/>
        </radialGradient>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="120" fill="url(#dv2bm-heat)"/>
    </svg>
  `;
}

function viewPlaceholder(mode) {
  const label = {
    '3d':       '3D cortex rendering',
    'inflated': 'Inflated cortex view',
    'coronal':  'Coronal slice view',
    'heatmap':  'E-field heatmap (standalone)',
  }[mode] || mode;
  return `
    <div class="dv2bm-placeholder">
      <div class="dv2bm-placeholder-icon">◎</div>
      <div class="dv2bm-placeholder-title">${esc(label)}</div>
      <div class="dv2bm-placeholder-sub">Roadmap · early prototype available in Research tab</div>
      <button type="button" class="dv2bm-placeholder-link" style="margin-top:10px;background:transparent;border:1px solid var(--border);color:var(--text-secondary);font-size:12px;padding:6px 12px;border-radius:6px;cursor:pointer" onclick="window._nav?.('research-v2')">Open Research →</button>
    </div>
  `;
}

function rightRail(evidence) {
  const S = window._bmState;
  const currentWarn = S.currentMA > 2.0
    ? `<div class="dv2bm-warn amb"><b>Current &gt; 2 mA</b><span>Moderate risk — confirm patient tolerance and supervised session.</span></div>`
    : `<div class="dv2bm-warn ok"><b>Within safety envelope</b><span>Current density ≈ ${(S.currentMA/35).toFixed(3)} mA/cm² · below 0.08 mA/cm² NIBS limit.</span></div>`;

  return `
    <aside class="dv2bm-right">
      <div class="dv2bm-right-body">

        <div class="dv2bm-group">
          <div class="dv2bm-group-title"><span class="num">01</span>Electrode inventory</div>
          ${electrodeCard('ANODE +',  S.anode,   T.teal)}
          ${electrodeCard('CATHODE −', S.cathode, T.rose)}
          <button class="dv2bm-impedance">✓ Impedance check · both &lt;5 kΩ</button>
        </div>

        <div class="dv2bm-group">
          <div class="dv2bm-group-title"><span class="num">02</span>Stimulation</div>
          <label class="dv2bm-slider-lbl">Current <span id="dv2bm-current-val">${S.currentMA.toFixed(1)} mA</span></label>
          <input type="range" min="0.5" max="2.5" step="0.1" value="${S.currentMA}"
                 oninput="window._bmSetCurrent(this.value)" class="dv2bm-slider"/>
          <label class="dv2bm-slider-lbl">Duration <span id="dv2bm-duration-val">${S.durationMin} min</span></label>
          <input type="range" min="5" max="30" step="1" value="${S.durationMin}"
                 oninput="window._bmSetDuration(this.value)" class="dv2bm-slider"/>
          <label class="dv2bm-slider-lbl">Sessions <span id="dv2bm-sessions-val">${S.sessions} sessions</span></label>
          <input type="range" min="1" max="40" step="1" value="${S.sessions}"
                 oninput="window._bmSetSessions(this.value)" class="dv2bm-slider"/>
        </div>

        <div class="dv2bm-group">
          <div class="dv2bm-group-title"><span class="num">03</span>Safety</div>
          <div id="dv2bm-safety">${safetyBanners()}</div>
        </div>

        <div class="dv2bm-group">
          <div class="dv2bm-group-title"><span class="num">04</span>Evidence · ${esc(S.targetRegion)}</div>
          ${evidence.slice(0,3).map(evidenceCard).join('')}
        </div>

        <div class="dv2bm-group">
          <div class="dv2bm-group-title"><span class="num">05</span>Contraindications</div>
          ${CONTRAINDICATIONS.map(c => `
            <label class="dv2bm-contra">
              <input type="checkbox"/>
              <span class="dv2bm-contra-label ${c.severity}">${esc(c.label)}</span>
            </label>`).join('')}
        </div>

      </div>
      <div class="dv2bm-right-foot">
        <button class="dv2bm-btn ghost" onclick="window._bmExport()">Export JSON</button>
        <button class="dv2bm-btn primary" onclick="window._bmSave()">Save montage →</button>
      </div>
    </aside>
  `;
}

function electrodeCard(label, site, color) {
  return `
    <div class="dv2bm-electrode" style="border-color:${color}44;background:${color}0f">
      <div class="dv2bm-electrode-hd" style="color:${color}">${esc(label)}</div>
      <div class="dv2bm-electrode-site">${esc(site || '—')}</div>
      <div class="dv2bm-electrode-sub">35 cm² · saline-soaked sponge</div>
    </div>
  `;
}

function safetyBanners() {
  const S = window._bmState;
  const warns = [];
  if (S.currentMA > 2.0) {
    warns.push({ s:'amb', t:'Current exceeds 2 mA', b:'Moderate risk · confirm tolerance, supervised setup.' });
  } else {
    warns.push({ s:'ok', t:'Current within envelope', b:`Density ≈ ${(S.currentMA/35).toFixed(3)} mA/cm² · under 0.08 mA/cm² NIBS limit.` });
  }
  if (S.durationMin > 25) {
    warns.push({ s:'amb', t:'Long session', b:'Durations &gt;25 min increase skin irritation risk — refresh saline mid-session.' });
  }
  if (S.sessions > 30) {
    warns.push({ s:'amb', t:'Extended course', b:'Courses &gt;30 sessions outside typical Tier-1 evidence range — document rationale.' });
  }
  return warns.map(w => `
    <div class="dv2bm-warn ${w.s}">
      <b>${esc(w.t)}</b><span>${w.b}</span>
    </div>`).join('');
}

function evidenceCard(e) {
  const gColor = e.grade === 'A' ? T.teal : e.grade === 'B' ? T.blue : e.grade === 'C' ? T.violet : T.amber;
  return `
    <div class="dv2bm-evi" style="border-left-color:${gColor}">
      <div class="dv2bm-evi-hd">
        <span class="dv2bm-evi-title">${esc(e.title)}</span>
        <span class="dv2bm-evi-grade" style="color:${gColor};border-color:${gColor}">${esc(e.grade||'—')}</span>
      </div>
      <div class="dv2bm-evi-meta">${esc(e.authors||'')} · ${esc(String(e.year||''))}${e.n?` · n=${esc(e.n)}`:''}</div>
      ${e.delta ? `<div class="dv2bm-evi-delta">${esc(e.delta)}</div>` : ''}
      ${e.doi   ? `<div class="dv2bm-evi-doi">DOI ${esc(e.doi)}</div>` : ''}
    </div>
  `;
}

// ── MONTAGE TAB ──────────────────────────────────────────────────────────────
function renderMontage(ctx) {
  return `
    <div class="dv2bm-montage">
      <div class="dv2bm-montage-hd">
        <div class="dv2bm-montage-title">Montage library</div>
        <div class="dv2bm-montage-sub">Click a preset to load it into the Clinical planner.</div>
      </div>
      <div class="dv2bm-montage-grid">
        ${ctx.montages.map(m => `
          <div class="dv2bm-montage-card" onclick="window._bmLoadMontage('${esc(m.id)}')">
            <div class="dv2bm-montage-preview">
              ${renderBrainMap10_20({ anode: m.anode, cathode: m.cathode, targetRegion: m.targetRegion, size: 180, showZones: false })}
            </div>
            <div class="dv2bm-montage-body">
              <div class="dv2bm-montage-name">${esc(m.title)}</div>
              <div class="dv2bm-montage-ind">${esc(m.indication)}</div>
              <div class="dv2bm-montage-foot">
                <span>${esc(m.anode)} → ${esc(m.cathode)}</span>
                <span class="dv2bm-montage-grade">Grade ${esc(m.grade)}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ── RESEARCH TAB ─────────────────────────────────────────────────────────────
function renderResearch(ctx) {
  const S = window._bmState;
  const left  = ctx.montages[0];
  const right = ctx.montages[1];
  return `
    <div class="dv2bm-research">
      <div class="dv2bm-research-card dv2bm-research-wide">
        <div class="dv2bm-research-title">E-field simulation</div>
        <div class="dv2bm-research-body">
          Finite-element modeling (ROAST / SimNIBS) is unavailable in this beta build. The current overlay on the Clinical tab is a qualitative heatmap derived from electrode geometry only.
        </div>
      </div>
      <div class="dv2bm-research-card">
        <div class="dv2bm-research-title">Inflated cortex</div>
        ${viewPlaceholder('inflated')}
      </div>
      <div class="dv2bm-research-card dv2bm-research-wide">
        <div class="dv2bm-research-title">Compare montages</div>
        <div class="dv2bm-research-compare">
          <div>
            <div class="dv2bm-compare-head">${esc(left?.title||'—')}</div>
            ${left ? renderBrainMap10_20({ anode: left.anode, cathode: left.cathode, targetRegion: left.targetRegion, size: 260, showZones: false }) : ''}
          </div>
          <div class="dv2bm-compare-vs">vs</div>
          <div>
            <div class="dv2bm-compare-head">${esc(right?.title||'—')}</div>
            ${right ? renderBrainMap10_20({ anode: right.anode, cathode: right.cathode, targetRegion: right.targetRegion, size: 260, showZones: false }) : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Style block ──────────────────────────────────────────────────────────────
function styleBlock() {
  return `
    <style>
      .dv2bm-wrap { display:flex; flex-direction:column; height:100%; background:${T.bg}; color:${T.t1}; font-family:${T.fbody}; }
      .dv2bm-tab-bar { display:flex; align-items:center; gap:6px; padding:10px 18px; border-bottom:1px solid ${T.border}; background:${T.panel}; }
      .dv2bm-tab { display:inline-flex; align-items:center; gap:8px; padding:7px 14px; border-radius:999px; border:1px solid ${T.border}; background:transparent; color:${T.t2}; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
      .dv2bm-tab:hover { color:${T.t1}; border-color:${T.teal}44; }
      .dv2bm-tab.active { background:${T.teal}22; border-color:${T.teal}; color:${T.teal}; }
      .dv2bm-tab-num { font-family:${T.fmono}; font-size:10px; opacity:0.7; }
      .dv2bm-tab-spacer { flex:1; }
      .dv2bm-tab-hint { font-family:${T.fmono}; font-size:10.5px; color:${T.t3}; }

      .dv2bm-body { flex:1; min-height:0; overflow:hidden; display:flex; }
      .dv2bm-clinical { flex:1; display:grid; grid-template-columns:280px 1fr 320px; min-height:0; }
      @media (max-width: 1200px) { .dv2bm-clinical { grid-template-columns:240px 1fr 280px; } }
      @media (max-width: 980px) {
        .dv2bm-clinical { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; overflow:auto; }
        .dv2bm-clinical > :first-child { max-height: 200px; overflow-y: auto; border-right: 0; border-bottom: 1px solid ${T.border}; }
        .dv2bm-clinical > :last-child  { border-left:  0; border-top:    1px solid ${T.border}; }
      }
      @media (max-width: 600px) {
        .dv2bm-clinical > :first-child { max-height: 140px; }
        .dv2bm-research { grid-template-columns: 1fr; padding: 16px; }
      }

      .dv2bm-left { border-right:1px solid ${T.border}; background:${T.panel}; display:flex; flex-direction:column; overflow:hidden; }
      .dv2bm-left-head { padding:14px; border-bottom:1px solid ${T.border}; }
      .dv2bm-left-title { font-family:${T.fdisp}; font-size:12px; font-weight:700; color:${T.t1}; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px; }
      .dv2bm-left-search { width:100%; padding:7px 10px; background:${T.surface}; border:1px solid ${T.border}; border-radius:6px; color:${T.t1}; font-size:11.5px; font-family:inherit; }
      .dv2bm-left-body { flex:1; overflow-y:auto; padding:4px 0 16px; }
      .dv2bm-lobe { margin-top:6px; }
      .dv2bm-lobe-head { padding:11px 14px 5px; font-size:9.5px; text-transform:uppercase; letter-spacing:0.08em; color:${T.t3}; font-weight:700; }
      .dv2bm-region { display:grid; grid-template-columns:10px 1fr; gap:10px; padding:9px 14px; cursor:pointer; border-left:2px solid transparent; }
      .dv2bm-region:hover { background:${T.surface}; }
      .dv2bm-region.active { background:${T.teal}14; border-left-color:${T.teal}; }
      .dv2bm-region-dot { width:8px; height:8px; border-radius:50%; background:${T.t3}; margin-top:6px; }
      .dv2bm-region.active .dv2bm-region-dot { background:${T.teal}; }
      .dv2bm-region-name { font-size:12.5px; font-weight:600; color:${T.t1}; display:flex; justify-content:space-between; gap:8px; }
      .dv2bm-region-anchor { font-family:${T.fmono}; font-size:10px; color:${T.teal}; font-weight:700; }
      .dv2bm-region-fn { font-size:10.5px; color:${T.t3}; margin-top:2px; line-height:1.4; }
      .dv2bm-region-cond { display:flex; flex-wrap:wrap; gap:4px; margin-top:5px; }
      .dv2bm-region-cond span { padding:1px 6px; background:${T.surface}; border-radius:3px; font-size:9.5px; color:${T.t2}; font-family:${T.fmono}; }
      .dv2bm-region-roles { display:flex; gap:4px; margin-top:6px; }
      .dv2bm-region-roles button { padding:2px 6px; border:1px solid ${T.border}; background:transparent; color:${T.t3}; border-radius:4px; font-size:9.5px; font-family:${T.fmono}; cursor:pointer; }
      .dv2bm-region-roles button:hover { color:${T.teal}; border-color:${T.teal}; }

      .dv2bm-center { display:flex; flex-direction:column; min-height:0; padding:16px 20px 12px; background:${T.bg}; }
      .dv2bm-canvas-wrap { flex:1; min-height:0; position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; }
      .dv2bm-canvas-glow { position:absolute; inset:0; background:radial-gradient(ellipse at center, ${T.teal}14 0%, transparent 60%); pointer-events:none; }
      .dv2bm-canvas { position:relative; width:min(400px, 100%); height:auto; aspect-ratio:1; }
      .dv2bm-canvas-legend { margin-top:10px; display:flex; gap:14px; font-size:10px; font-family:${T.fmono}; color:${T.t3}; }
      .dv2bm-canvas-legend i { width:9px; height:9px; border-radius:50%; display:inline-block; margin-right:5px; vertical-align:middle; }
      .dv2bm-view-modes { display:flex; gap:6px; margin-top:10px; justify-content:center; }
      .dv2bm-view-pill { padding:5px 11px; border-radius:999px; border:1px solid ${T.border}; background:transparent; color:${T.t2}; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; }
      .dv2bm-view-pill.active { background:${T.teal}; color:#04121c; border-color:${T.teal}; }
      .dv2bm-view-pill:hover:not(.active) { color:${T.t1}; border-color:${T.teal}66; }

      .dv2bm-scrubber { margin-top:14px; padding:10px 12px; background:${T.panel}; border:1px solid ${T.border}; border-radius:8px; }
      .dv2bm-scrub-label { font-size:10px; font-family:${T.fmono}; color:${T.t3}; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px; }
      .dv2bm-scrub-track { display:flex; height:28px; border-radius:6px; overflow:hidden; position:relative; background:${T.surface}; }
      .dv2bm-scrub-phase { display:flex; align-items:center; justify-content:center; font-size:10px; font-family:${T.fmono}; font-weight:600; letter-spacing:0.02em; overflow:hidden; white-space:nowrap; padding:0 8px; }
      .dv2bm-scrub-handle { position:absolute; top:-3px; bottom:-3px; width:3px; background:${T.teal}; cursor:ew-resize; box-shadow:0 0 10px ${T.teal}; }

      .dv2bm-placeholder { display:flex; flex-direction:column; align-items:center; justify-content:center; height:auto; aspect-ratio:1; width:min(400px, 100%); background:${T.panel}; border:1px dashed ${T.border}; border-radius:12px; }
      .dv2bm-placeholder-icon { font-size:56px; color:${T.t3}; }
      .dv2bm-placeholder-title { font-family:${T.fdisp}; font-size:16px; color:${T.t1}; font-weight:600; margin-top:6px; }
      .dv2bm-placeholder-sub { font-size:11.5px; color:${T.t3}; margin-top:4px; }

      .dv2bm-right { border-left:1px solid ${T.border}; background:${T.panel}; display:flex; flex-direction:column; overflow:hidden; }
      .dv2bm-right-body { flex:1; overflow-y:auto; padding:12px 14px; }
      .dv2bm-group { padding:12px 0; border-bottom:1px solid ${T.border}; }
      .dv2bm-group:last-child { border-bottom:0; }
      .dv2bm-group-title { display:flex; align-items:center; gap:8px; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:${T.t2}; margin-bottom:10px; }
      .dv2bm-group-title .num { font-family:${T.fmono}; color:${T.teal}; background:${T.teal}22; padding:1px 6px; border-radius:4px; font-size:9.5px; }
      .dv2bm-electrode { padding:9px 11px; border:1px solid ${T.border}; border-radius:8px; margin-bottom:6px; }
      .dv2bm-electrode-hd { font-family:${T.fmono}; font-size:9.5px; font-weight:700; letter-spacing:0.06em; }
      .dv2bm-electrode-site { font-family:${T.fdisp}; font-size:17px; font-weight:700; margin-top:3px; color:${T.t1}; }
      .dv2bm-electrode-sub { font-size:10px; color:${T.t3}; font-family:${T.fmono}; margin-top:2px; }
      .dv2bm-impedance { margin-top:4px; width:100%; padding:6px; background:${T.teal}14; color:${T.teal}; border:1px solid ${T.teal}44; border-radius:6px; font-family:${T.fmono}; font-size:10.5px; font-weight:600; cursor:pointer; }

      .dv2bm-slider-lbl { display:flex; justify-content:space-between; font-size:11px; color:${T.t2}; margin:8px 0 4px; font-weight:600; }
      .dv2bm-slider-lbl span { font-family:${T.fmono}; color:${T.teal}; }
      .dv2bm-slider { width:100%; accent-color:${T.teal}; }

      .dv2bm-warn { display:grid; grid-template-columns:1fr; gap:2px; padding:9px 11px; border-radius:6px; font-size:11px; margin-bottom:6px; border:1px solid; line-height:1.45; }
      .dv2bm-warn b { font-size:11.5px; font-weight:700; color:${T.t1}; }
      .dv2bm-warn span { font-size:10.5px; color:${T.t2}; }
      .dv2bm-warn.ok  { border-color:${T.teal}44;  background:${T.teal}0e; }
      .dv2bm-warn.amb { border-color:${T.amber}55; background:${T.amber}10; }
      .dv2bm-warn.err { border-color:${T.rose}55;  background:${T.rose}10; }

      .dv2bm-evi { border-left:3px solid ${T.teal}; background:${T.surface}; border-radius:5px; padding:8px 10px; margin-bottom:7px; }
      .dv2bm-evi-hd { display:flex; justify-content:space-between; gap:8px; }
      .dv2bm-evi-title { font-size:12px; font-weight:600; color:${T.t1}; line-height:1.3; }
      .dv2bm-evi-grade { font-family:${T.fmono}; font-size:10px; font-weight:700; padding:1px 6px; border:1px solid; border-radius:4px; align-self:flex-start; }
      .dv2bm-evi-meta { font-size:10.5px; color:${T.t3}; margin-top:3px; font-family:${T.fmono}; }
      .dv2bm-evi-delta { font-size:11px; color:${T.t2}; margin-top:4px; }
      .dv2bm-evi-doi { font-size:10px; color:${T.t3}; font-family:${T.fmono}; margin-top:3px; }

      .dv2bm-contra { display:grid; grid-template-columns:16px 1fr; gap:8px; padding:5px 0; font-size:11.5px; cursor:pointer; }
      .dv2bm-contra input { accent-color:${T.teal}; margin-top:3px; }
      .dv2bm-contra-label.err { color:${T.rose}; }
      .dv2bm-contra-label.amb { color:${T.amber}; }
      .dv2bm-contra-label.ok  { color:${T.t2}; }

      .dv2bm-right-foot { padding:12px 14px; border-top:1px solid ${T.border}; display:flex; gap:8px; }
      .dv2bm-btn { flex:1; padding:8px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; border:1px solid ${T.border}; }
      .dv2bm-btn.ghost   { background:transparent; color:${T.t2}; }
      .dv2bm-btn.ghost:hover { color:${T.t1}; border-color:${T.teal}66; }
      .dv2bm-btn.primary { background:${T.teal}; color:#04121c; border-color:${T.teal}; }
      .dv2bm-btn.primary:hover { filter:brightness(1.08); }

      .dv2bm-montage { flex:1; overflow-y:auto; padding:22px 28px; }
      .dv2bm-montage-hd { margin-bottom:16px; }
      .dv2bm-montage-title { font-family:${T.fdisp}; font-size:20px; font-weight:700; color:${T.t1}; }
      .dv2bm-montage-sub   { font-size:12px; color:${T.t3}; margin-top:4px; }
      .dv2bm-montage-grid  { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:14px; }
      .dv2bm-montage-card  { background:${T.panel}; border:1px solid ${T.border}; border-radius:10px; cursor:pointer; overflow:hidden; transition:border-color 120ms, transform 120ms; }
      .dv2bm-montage-card:hover { border-color:${T.teal}; transform:translateY(-1px); }
      .dv2bm-montage-preview { display:flex; justify-content:center; padding:10px 0 4px; background:${T.surface}; }
      .dv2bm-montage-body    { padding:10px 12px; }
      .dv2bm-montage-name    { font-family:${T.fdisp}; font-size:13px; font-weight:600; color:${T.t1}; line-height:1.3; }
      .dv2bm-montage-ind     { font-size:11px; color:${T.t3}; margin-top:3px; font-family:${T.fmono}; }
      .dv2bm-montage-foot    { display:flex; justify-content:space-between; margin-top:8px; font-size:10.5px; color:${T.t2}; font-family:${T.fmono}; }
      .dv2bm-montage-grade   { color:${T.teal}; font-weight:700; }

      .dv2bm-research { flex:1; overflow-y:auto; padding:22px 28px; display:grid; grid-template-columns:1fr 1fr; gap:14px; align-content:start; }
      .dv2bm-research-card { background:${T.panel}; border:1px solid ${T.border}; border-radius:10px; padding:16px 18px; }
      .dv2bm-research-wide { grid-column:1/-1; }
      .dv2bm-research-title { font-family:${T.fdisp}; font-size:14px; font-weight:700; color:${T.t1}; margin-bottom:8px; }
      .dv2bm-research-body  { font-size:12.5px; color:${T.t2}; line-height:1.55; }
      .dv2bm-research-compare { display:flex; align-items:center; justify-content:center; gap:14px; }
      .dv2bm-compare-head { font-family:${T.fmono}; font-size:10.5px; color:${T.t3}; text-align:center; margin-bottom:6px; }
      .dv2bm-compare-vs   { font-family:${T.fmono}; font-size:14px; color:${T.teal}; font-weight:700; }
    </style>
  `;
}
