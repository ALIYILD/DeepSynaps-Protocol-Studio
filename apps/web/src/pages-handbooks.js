// ── DeepSynaps Handbooks · design-v2 (Phase 9) ────────────────────────────────
// Three-pane clinical knowledge base: collections rail · reading pane · TOC.
// Merges the handbook library that previously lived in Protocol Hub with
// Safety/Ops + Training collections per the design-v2 merge map (§11).
// ─────────────────────────────────────────────────────────────────────────────

import { HANDBOOK_DATA } from './handbooks-data.js';
import { CONDITION_REGISTRY, PROTOCOL_REGISTRY, DEVICE_REGISTRY } from './registries.js';
import { api } from './api.js';
import { currentUser } from './auth.js';

// ── AI Handbook generator: state, mappings, helpers ──────────────────────────
// Per-session cache of generated handbooks keyed by `${condId}|${modality}|${proto}|${device}|${kind}`.
const _aiCache = {};
// Per-condition selector state so switching off and back preserves choices.
const _aiSel = {};

// Frontend condition id → backend `Condition_Name` (clinical dataset CSV).
// Listed only when the registry display name differs from the CSV row.
const _BACKEND_COND = {
  mdd: 'Major Depressive Disorder',
  trd: 'Treatment-Resistant Depression',
  bpd: 'Bipolar Depression',
  ppd: 'Postpartum Depression',
  sad: 'Seasonal Affective Disorder',
  pdd: 'Dysthymia / Persistent Depressive Disorder',
  gad: 'Generalized Anxiety Disorder',
  panic: 'Panic Disorder',
  'social-anx': 'Social Anxiety Disorder',
  ocd: 'Obsessive-Compulsive Disorder',
  ptsd: 'PTSD',
  cptsd: 'PTSD',
  'asd-trauma': 'PTSD',
  'adhd-i': 'ADHD',
  'adhd-hi': 'ADHD',
  'adhd-c': 'ADHD',
  asd: 'Autism Spectrum Disorder',
  aud: 'Alcohol Use Disorder',
  'nic-dep': 'Smoking Cessation',
  oud: 'Opioid Withdrawal',
  cud: 'Substance Use Disorder',
  insomnia: 'Insomnia',
  hypersomn: 'Hypersomnia / Narcolepsy',
  'pain-neuro': 'Neuropathic Pain',
  'pain-msk': 'Chronic Pain / Fibromyalgia',
  fibro: 'Chronic Pain / Fibromyalgia',
  migraine: 'Migraine',
  tinnitus: 'Tinnitus',
  'stroke-mtr': 'Stroke Rehabilitation',
  'stroke-aph': 'Stroke Rehabilitation',
  tbi: 'Cognitive Impairment / TBI',
  alzheimer: "Alzheimer's Disease / Dementia",
  'vasc-dem': "Alzheimer's Disease / Dementia",
  parkinsons: "Parkinson's Disease",
  ms: 'Multiple Sclerosis — Fatigue',
  epilepsy: 'Epilepsy',
  'essential-t': 'Essential Tremor',
  dystonia: 'Dystonia',
  tourette: 'Tics / Tourette Syndrome',
  'long-covid': 'Long COVID Fatigue',
  'bpd-psy': 'Borderline Personality Disorder',
  schizo: 'Schizophrenia (Negative Symptoms / AVH)',
  'schizo-aff': 'Schizophrenia (Negative Symptoms / AVH)',
  fep: 'Schizophrenia (Negative Symptoms / AVH)',
  anorexia: 'Eating Disorders',
  bulimia: 'Eating Disorders',
  bed: 'Eating Disorders',
};

// Fuzzy mappings for OCD-spectrum / anxiety-umbrella conditions with no exact CSV row.
const _BACKEND_COND_FUZZY = {
  bdd: 'Obsessive-Compulsive Disorder',
  hoarding: 'Obsessive-Compulsive Disorder',
  trich: 'Obsessive-Compulsive Disorder',
  'specific-ph': 'Generalized Anxiety Disorder',
  agoraphobia: 'Panic Disorder',
  // fnd: deliberately omitted — no clinically appropriate proxy
};

function _backendConditionFor(cond) {
  if (_BACKEND_COND[cond.id]) return { name: _BACKEND_COND[cond.id], fuzzy: false };
  if (_BACKEND_COND_FUZZY[cond.id]) return { name: _BACKEND_COND_FUZZY[cond.id], fuzzy: true };
  return { name: cond.name, fuzzy: false, unmapped: true };
}

function _modalityForBackend(label) {
  if (!label) return 'TMS';
  const l = label.toLowerCase();
  if (l.includes('itbs')) return 'iTBS';
  if (l.includes('rtms') || l.includes('tms')) return 'TMS';
  if (l.includes('tdcs')) return 'tDCS';
  if (l.includes('tacs')) return 'tACS';
  if (l.includes('tavns') || (l.includes('vns') && l.includes('aur'))) return 'taVNS';
  if (l.includes('vns')) return 'VNS';
  if (l.includes('dbs')) return 'DBS';
  if (l.includes('ces')) return 'CES';
  if (l.includes('pbm')) return 'PBM';
  if (l.includes('neurofeedback') || l.includes('nfb')) return 'Neurofeedback';
  if (l.includes('tps')) return 'TPS';
  return label;
}

function _modalityMatches(deviceModality, sel) {
  if (!deviceModality || !sel) return false;
  const a = deviceModality.toLowerCase();
  const b = sel.toLowerCase();
  if (a === b) return true;
  const parts = (s) => s.split(/[\/,]/).map(x => x.trim()).filter(Boolean);
  const ap = parts(a), bp = parts(b);
  return ap.some(x => bp.includes(x));
}

function _aiSelFor(cond) {
  const id = cond.id;
  if (!_aiSel[id]) {
    const protos = PROTOCOL_REGISTRY.filter(p => p.condition === id);
    const modality = (cond.modalities && cond.modalities[0]) || 'TMS/rTMS';
    const protoId  = protos.length ? protos[0].id : '';
    const devices  = DEVICE_REGISTRY.filter(d => _modalityMatches(d.modality, modality));
    const deviceId = devices.length ? devices[0].id : '';
    _aiSel[id] = { modality, protoId, deviceId, kind: 'clinician_handbook' };
  }
  return _aiSel[id];
}

function _canGenerate() {
  const role = (currentUser && currentUser.role) || 'guest';
  return role === 'clinician' || role === 'admin';
}

// ── Tokens (with fallbacks to existing vars) ─────────────────────────────────
const T = {
  bg:         'var(--dv2-bg-base, var(--bg-base, #04121c))',
  panel:      'var(--dv2-bg-panel, var(--bg-panel, #0a1d29))',
  surface:    'var(--dv2-bg-surface, var(--bg-surface, rgba(255,255,255,0.04)))',
  border:     'var(--dv2-border, var(--border, rgba(255,255,255,0.08)))',
  text1:      'var(--dv2-text-primary, var(--text-primary, #e2e8f0))',
  text2:      'var(--dv2-text-secondary, var(--text-secondary, #94a3b8))',
  text3:      'var(--dv2-text-tertiary, var(--text-tertiary, #64748b))',
  teal:       'var(--dv2-teal, var(--teal, #00d4bc))',
  blue:       'var(--dv2-blue, var(--blue, #4a9eff))',
  amber:      'var(--dv2-amber, var(--amber, #ffb547))',
  rose:       'var(--dv2-rose, var(--rose, #ff6b9d))',
  violet:     'var(--dv2-violet, var(--violet, #9b7fff))',
  fdisp:      'var(--dv2-font-display, var(--font-display, "Outfit", system-ui, sans-serif))',
  fbody:      'var(--dv2-font-body, var(--font-body, "DM Sans", system-ui, sans-serif))',
  fmono:      'var(--dv2-font-mono, var(--font-mono, "JetBrains Mono", ui-monospace, monospace))',
  rmd:        'var(--dv2-radius-md, 8px)',
  rsm:        'var(--dv2-radius-sm, 6px)',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function slug(s) {
  return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
function initials(name) {
  const parts = String(name||'').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '··';
  return ((parts[0][0]||'') + (parts[parts.length-1][0]||'')).toUpperCase();
}
function readTime(text) {
  const w = String(text||'').split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(w / 220));
}
function gradeColor(g) {
  return g === 'A' ? T.teal : g === 'B' ? T.blue : g === 'C' ? T.violet : T.amber;
}
function gradeBadge(g) {
  const grade = (g||'D').toUpperCase();
  const c = gradeColor(grade);
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-family:${T.fmono};font-size:10px;font-weight:700;color:${c};border:1px solid ${c};letter-spacing:0.04em">GRADE ${esc(grade)}</span>`;
}
function statusDot(status) {
  const map = { ok: T.teal, current: T.teal, review: T.amber, due: T.amber, overdue: T.rose, draft: T.text3 };
  const c = map[status] || T.text3;
  return `<span style="width:6px;height:6px;border-radius:50%;background:${c};flex-shrink:0;display:inline-block"></span>`;
}

// ── Page-level state ─────────────────────────────────────────────────────────
let _id      = null;          // currently-open handbook id
let _query   = '';            // left-rail filter
let _section = null;          // active TOC section id
let _el      = null;          // root container

// ── Build collections from data ──────────────────────────────────────────────
// Combine real HANDBOOK_DATA-backed entries (conditions + protocols) with the
// canonical Safety/Ops + Training documents from the prototype's left rail.
function buildEntries() {
  const out = [];
  // Condition handbooks
  for (const c of CONDITION_REGISTRY) {
    const hb = HANDBOOK_DATA[c.id];
    if (!hb) continue;
    out.push({
      id: c.id,
      kind: 'condition',
      title: c.name,
      subtitle: `${c.icd10 || ''} · ${c.cat || ''}`,
      collection: c.cat || 'Other',
      data: hb,
      reg: c,
    });
  }
  // Protocol handbooks
  for (const p of PROTOCOL_REGISTRY) {
    const hb = HANDBOOK_DATA[p.id];
    if (!hb) continue;
    const cond = CONDITION_REGISTRY.find(cc => cc.id === p.condition);
    out.push({
      id: p.id,
      kind: 'protocol',
      title: hb.name || p.name,
      subtitle: `${p.modality || ''} · ${p.condition || ''}`,
      collection: cond?.cat || 'Protocols',
      data: hb,
      reg: p,
    });
  }
  // Pseudo collections from prototype: Safety & Ops + Training
  const ops = [
    { id: 'ops-safety-screen',  title: 'Pre-session safety screen',  version: 'v1.8' },
    { id: 'ops-ae-response',    title: 'Adverse event response',     version: 'v2.1' },
    { id: 'ops-contra-matrix',  title: 'Contraindications matrix',   version: 'v4.0' },
    { id: 'ops-device-clean',   title: 'Device cleaning & sparing',  version: 'v2.2' },
    { id: 'ops-electrode-prep', title: 'Electrode preparation',      version: 'v1.5' },
    { id: 'ops-escalation',     title: 'Incident escalation tree',   version: 'v1.2' },
  ];
  const train = [
    { id: 'train-30day',   title: 'Clinician 30-day plan',   version: 'v2.0' },
    { id: 'train-1020',    title: '10-20 placement primer',  version: 'v1.4' },
    { id: 'train-app',     title: 'Patient app walkthrough', version: 'draft' },
  ];
  for (const o of ops) out.push({ id: o.id, kind: 'ops',     title: o.title, subtitle: o.version, collection: 'Safety & Ops', version: o.version });
  for (const t of train) out.push({ id: t.id, kind: 'train',  title: t.title, subtitle: t.version, collection: 'Training',     version: t.version });
  return out;
}

// ── AI Handbook section ──────────────────────────────────────────────────────
// Renders modality/protocol/device/audience selectors plus a Generate button.
// On generate, calls /api/v1/handbooks/generate and renders the structured
// HandbookDocument (overview → eligibility → setup → workflow → safety →
// troubleshooting → escalation → docs → outcomes/discharge → references).
function aiHandbookSection(cond) {
  return {
    id: 'ai-handbook',
    title: 'AI handbook (generated from evidence)',
    render: () => {
      const sel = _aiSelFor(cond);
      const protos = PROTOCOL_REGISTRY.filter(p => p.condition === cond.id);
      const devices = DEVICE_REGISTRY.filter(d => _modalityMatches(d.modality, sel.modality));
      const cacheKey = `${cond.id}|${sel.modality}|${sel.protoId}|${sel.deviceId}|${sel.kind}`;
      const gen = _aiCache[cacheKey];
      const proto = sel.protoId ? protos.find(p => p.id === sel.protoId) : null;
      const device = sel.deviceId ? devices.find(d => d.id === sel.deviceId) : null;
      const mapped = _backendConditionFor(cond);
      const allowed = _canGenerate();

      const opt = (v, l, on) => `<option value="${esc(v)}"${on?' selected':''}>${esc(l)}</option>`;
      const selectStyle = `padding:6px 10px;border-radius:${T.rsm};background:${T.surface};color:${T.text1};border:1px solid ${T.border};font-size:12px;font-family:inherit;min-width:180px`;

      const selRow = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:0 0 12px">
          <label style="display:flex;flex-direction:column;gap:3px;font-size:9.5px;color:${T.text3};text-transform:uppercase;letter-spacing:0.06em;font-family:${T.fmono};font-weight:600">Modality
            <select onchange="window._hbAiSet('modality', this.value)" style="${selectStyle}">
              ${(cond.modalities||[]).map(m => opt(m, m, m === sel.modality)).join('')}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:9.5px;color:${T.text3};text-transform:uppercase;letter-spacing:0.06em;font-family:${T.fmono};font-weight:600">Protocol
            <select onchange="window._hbAiSet('protoId', this.value)" style="${selectStyle}">
              ${opt('', protos.length ? '— No specific protocol —' : 'No registered protocols', !sel.protoId)}
              ${protos.map(p => opt(p.id, `${p.name} (${p.modality})`, p.id === sel.protoId)).join('')}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:9.5px;color:${T.text3};text-transform:uppercase;letter-spacing:0.06em;font-family:${T.fmono};font-weight:600">Device
            <select onchange="window._hbAiSet('deviceId', this.value)" style="${selectStyle}">
              ${opt('', devices.length ? '— Any device —' : 'No matching devices', !sel.deviceId)}
              ${devices.map(d => opt(d.id, `${d.name} · ${d.clearance}`, d.id === sel.deviceId)).join('')}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:9.5px;color:${T.text3};text-transform:uppercase;letter-spacing:0.06em;font-family:${T.fmono};font-weight:600">Audience
            <select onchange="window._hbAiSet('kind', this.value)" style="${selectStyle}">
              ${[['clinician_handbook','Clinician Handbook'],['patient_guide','Patient Guide'],['technician_sop','Technician SOP']]
                .map(([v,l]) => opt(v, l, v === sel.kind)).join('')}
            </select>
          </label>
        </div>`;

      const button = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <button id="hb-ai-gen" onclick="window._hbAiGenerate()" ${allowed ? '' : 'disabled'}
            style="padding:7px 16px;border-radius:${T.rsm};font-size:12px;font-weight:700;background:${allowed ? T.teal : T.surface};color:${allowed ? '#04121c' : T.text3};border:none;cursor:${allowed ? 'pointer' : 'not-allowed'};font-family:inherit">
            ${gen ? '↻ Regenerate from evidence' : '✦ Generate handbook'}
          </button>
          <span id="hb-ai-status" style="font-size:11px;color:${T.text3};font-family:${T.fmono}">${
            !allowed
              ? 'Generation requires a clinician or admin role.'
              : (gen ? 'Generated · cached for this session.' : 'Backend draws from imported clinical dataset.')
          }</span>
        </div>`;

      const coverageHint = mapped.unmapped
        ? `<div style="margin:10px 0 0;padding:9px 12px;background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.32);border-radius:${T.rsm};font-size:11.5px;color:${T.amber};line-height:1.5">
            Not yet in the imported clinical dataset. Curated sections below remain authoritative; generation will return a coverage error.
          </div>`
        : mapped.fuzzy
        ? `<div style="margin:10px 0 0;padding:9px 12px;background:rgba(74,158,255,0.08);border:1px solid rgba(74,158,255,0.32);border-radius:${T.rsm};font-size:11.5px;color:${T.blue};line-height:1.5">
            Generated content will be synthesised from a related dataset row: <strong>${esc(mapped.name)}</strong>. Apply clinical judgement.
          </div>`
        : '';

      const intro = `<p style="margin:0 0 14px;color:${T.text2}">Pick a modality + (optional) protocol and device, then generate a structured handbook from the imported clinical dataset.</p>`;

      if (!gen) {
        return `${intro}${selRow}${button}${coverageHint}`;
      }

      const d = gen.document || gen;
      const list = (items) => Array.isArray(items) && items.length
        ? `<ul style="margin:8px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:6px;color:${T.text2};line-height:1.55">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
        : `<p style="color:${T.text3}">No data.</p>`;
      const numList = (items) => Array.isArray(items) && items.length
        ? `<ol style="margin:8px 0 0;padding-left:22px;display:flex;flex-direction:column;gap:7px;color:${T.text2};line-height:1.55">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ol>`
        : `<p style="color:${T.text3}">No data.</p>`;
      const sub = (title, body) => `<h3 style="font-family:${T.fdisp};font-size:14px;font-weight:600;color:${T.text1};margin:18px 0 4px">${esc(title)}</h3>${body}`;

      // Build dynamic discharge / outcomes notes from the curated condition assessments
      // and escalation triggers — this gives the clinician a clear next-step workflow.
      const dischargeNotes = [];
      if ((cond.assessments || []).includes('drs')) dischargeNotes.push('Run Discharge Readiness Screen (DRS) before final session.');
      if ((cond.assessments || []).includes('wpc')) dischargeNotes.push('Compare final scores with weekly progress check (WPC) trajectory.');
      dischargeNotes.push('Schedule follow-up at 4 and 12 weeks post-course; document remission/response status.');
      const hb = entry => entry; // placeholder; we use cond directly below
      const escTrigger = HANDBOOK_DATA[cond.id]?.escalation;
      if (escTrigger) dischargeNotes.push('Re-screen against escalation triggers: ' + escTrigger);

      const docChecklist = [
        'Document baseline assessment scores (' + ((cond.assessments||[]).map(a => a.toUpperCase()).join(', ') || 'per condition standard') + ').',
        'Record motor threshold / dosing parameters at session 1' + (proto ? ` (target ${proto.target}, ${proto.intensity})` : '') + '.',
        'Log per-session tolerability via SES + STC.',
        'Capture weekly progress (WPC) and any AE reports in patient chart.',
        device ? `Record device serial / lot for ${device.name} per ${device.clearance} traceability.` : 'Record device identifier per clinic SOP.',
      ];

      return `
        ${intro}${selRow}${button}${coverageHint}
        <div style="margin-top:18px;padding:18px 18px 4px;border-radius:${T.rmd};background:${T.bg};border:1px solid rgba(0,212,188,0.32)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;font-family:${T.fmono};font-size:10px;color:${T.teal};text-transform:uppercase;letter-spacing:0.06em;font-weight:700">
            AI · ${esc(d.document_type || sel.kind)} · ${esc(sel.modality)}${proto ? ' · ' + esc(proto.name) : ''}${device ? ' · ' + esc(device.name) : ''}
          </div>
          <h3 style="font-family:${T.fdisp};font-size:18px;font-weight:600;margin:0 0 8px;color:${T.text1}">${esc(d.title || 'Generated handbook')}</h3>
          ${d.overview ? `<p style="margin:0 0 6px;color:${T.text2}">${esc(d.overview)}</p>` : ''}
          ${sub('Patient selection / eligibility', list(d.eligibility))}
          ${proto ? sub('Protocol parameters', paramTable([
            ['Target', proto.target || '—'],
            ['Frequency', proto.freq || '—'],
            ['Intensity', proto.intensity || '—'],
            ['Sessions', `${proto.sessions||'—'} (${proto.sessPerWeek||'?'}×/wk)`],
            ['Duration', proto.duration || '—'],
            ['Laterality', proto.laterality || '—'],
          ])) : ''}
          ${device ? sub('Device profile', `
            <div style="font-size:13px;color:${T.text2};line-height:1.55;padding:12px 14px;background:${T.panel};border:1px solid ${T.border};border-radius:${T.rsm};margin-top:8px">
              <div><strong style="color:${T.text1}">${esc(device.name)}</strong> — ${esc(device.mfr)}</div>
              <div>${esc(device.type)} · ${esc(device.clearance)} · ${esc(device.region)}</div>
              ${device.notes ? `<div style="margin-top:4px;color:${T.text3}">${esc(device.notes)}</div>` : ''}
            </div>`) : ''}
          ${sub('Initial assessment & setup', numList(d.setup))}
          ${sub('Session workflow / protocol application', numList(d.session_workflow))}
          ${sub('Safety / contraindications', list(d.safety))}
          ${sub('Monitoring & troubleshooting', list(d.troubleshooting))}
          ${sub('Escalation pathways', list(d.escalation))}
          ${sub('Documentation checklist', list(docChecklist))}
          ${sub('Outcomes review & discharge', list(dischargeNotes))}
          ${Array.isArray(d.references) && d.references.length ? sub('References', `
            <ul style="margin:8px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:6px">
              ${d.references.map(r => `<li><a href="${esc(r)}" target="_blank" rel="noopener" style="color:${T.teal};word-break:break-all">${esc(r)}</a></li>`).join('')}
            </ul>`) : ''}
          ${(gen.disclaimers && (gen.disclaimers.protocol || gen.disclaimers.governance || gen.disclaimers.off_label)) ? `
            <div style="margin:14px 0 14px;padding:10px 12px;background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.32);border-radius:${T.rsm};font-size:11.5px;color:${T.amber};line-height:1.55">
              ${[gen.disclaimers.protocol, gen.disclaimers.governance, gen.disclaimers.off_label].filter(Boolean).map(esc).join('<br/>')}
            </div>` : '<div style="height:8px"></div>'}
        </div>`;
    },
  };
}

// ── Section model: turn raw HANDBOOK_DATA into a normalised section list ─────
// Each section has { id, num, title, render() -> string } and is what powers
// both the center reading pane and the right-rail TOC.
function sectionsFor(entry) {
  if (!entry || !entry.data) return [];
  const d = entry.data;

  // Condition handbooks (rich free-text)
  if (entry.kind === 'condition') {
    const cond = entry.reg;
    const evGrade = (cond?.ev || 'C').toUpperCase();
    const sections = [];

    // AI Handbook generator goes first so clinicians see it on entry.
    sections.push(aiHandbookSection(cond));

    if (d.epidemiology || cond) sections.push({
      id: 'overview',
      title: 'Overview & ICD',
      render: () => `
        <p>${esc(d.epidemiology || 'Epidemiology data not on file.')}</p>
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px;font-family:${T.fmono};font-size:11px;color:${T.text3}">
          <span>ICD-10 · <strong style="color:${T.text1}">${esc(cond?.icd10 || '—')}</strong></span>
          <span>Category · <strong style="color:${T.text1}">${esc(cond?.cat || '—')}</strong></span>
          <span>Evidence · <strong style="color:${gradeColor(evGrade)}">Grade ${esc(evGrade)}</strong></span>
        </div>`,
    });

    if (d.neuroBasis) sections.push({
      id: 'neuro',
      title: 'Neurobiological basis',
      render: () => `<p>${esc(d.neuroBasis)}</p>`,
    });

    // Montage / parameter table — synthesised from registry where available
    if ((cond?.modalities||[]).length || (cond?.targets||[]).length) sections.push({
      id: 'montage',
      title: 'Montage & parameters',
      render: () => paramTable([
        ['Modality',  (cond.modalities||['—']).join(' · ')],
        ['Target',    (cond.targets||['—']).join(' · ')],
        ['Assessments', (cond.assessments||['—']).map(a=>a.toUpperCase()).join(' · ')],
        ['On-label',  (cond.onLabel||['Off-label']).join(' · ')],
      ]),
    });

    if (d.responseData) sections.push({
      id: 'response',
      title: 'Expected response',
      render: () => `<p>${esc(d.responseData)}</p>`,
    });

    if (d.timeline) sections.push({
      id: 'timeline',
      title: 'Treatment timeline',
      render: () => `<p>${esc(d.timeline)}</p>`,
    });

    if ((d.selfCare||[]).length) sections.push({
      id: 'checklist',
      title: 'Pre-session checklist',
      render: () => checklistBlock(entry.id, d.selfCare),
    });

    if (d.escalation) sections.push({
      id: 'stops',
      title: 'Stop rules & escalation',
      render: () => calloutCritical('Escalate immediately', d.escalation),
    });

    if (d.techSetup) sections.push({
      id: 'tech',
      title: 'Technician setup notes',
      render: () => `<p>${esc(d.techSetup)}</p>`,
    });

    if (d.patientExplain) sections.push({
      id: 'patient',
      title: 'Patient explanation',
      render: () => `<p>${esc(d.patientExplain)}</p>`,
    });

    if ((d.faq||[]).length) sections.push({
      id: 'faq',
      title: 'Frequently asked questions',
      render: () => (d.faq||[]).map(f => `
        <div style="margin-bottom:14px">
          <div style="font-weight:600;color:${T.text1};margin-bottom:4px">${esc(f.q)}</div>
          <div style="color:${T.text2}">${esc(f.a)}</div>
        </div>`).join(''),
    });

    if (d.homeNote) sections.push({
      id: 'home',
      title: 'Home-use programme',
      render: () => `<p>${esc(d.homeNote)}</p>`,
    });

    sections.push({
      id: 'evidence',
      title: 'Evidence base',
      render: () => evidenceCards(entry, evGrade, d.responseData),
    });

    sections.push({
      id: 'related',
      title: 'Related handbooks',
      render: () => relatedCards(entry),
    });

    return sections.map((s,i) => ({ ...s, num: String(i+1).padStart(2,'0') }));
  }

  // Protocol handbooks (structured arrays)
  if (entry.kind === 'protocol') {
    const p = entry.reg;
    const evGrade = (p?.ev || 'C').toUpperCase();
    const sections = [];

    sections.push({
      id: 'indications',
      title: 'Indications & eligibility',
      render: () => `
        <p>Canonical clinic protocol for <strong>${esc(d.condition || '—')}</strong> using <strong>${esc(d.modality || '—')}</strong> at target <span style="font-family:${T.fmono};color:${T.teal}">${esc(d.target || '—')}</span>.</p>
        ${p?.notes ? `<p style="color:${T.amber}">${esc(p.notes)}</p>` : ''}`,
    });

    if (p) sections.push({
      id: 'montage',
      title: 'Montage & parameters',
      render: () => paramTable([
        ['Modality',    p.modality || '—'],
        ['Target',      p.target || '—'],
        ['Frequency',   p.freq || '—'],
        ['Intensity',   p.intensity || '—'],
        ['Duration',    p.duration || '—'],
        ['Sessions',    `${p.sessions||'—'} (${p.sessPerWeek||'?'}×/week)`],
        ['Laterality',  p.laterality || '—'],
      ]),
    });

    if ((d.setup||[]).length) sections.push({
      id: 'setup',
      title: 'Setup & implementation',
      render: () => stepsBlock(d.setup),
    });

    if ((d.sessionWorkflow||[]).length) sections.push({
      id: 'procedure',
      title: 'Session procedure',
      render: () => stepsBlock(d.sessionWorkflow),
    });

    if ((d.contraindications||[]).length) sections.push({
      id: 'stops',
      title: 'Contraindications & stop rules',
      render: () => `
        ${calloutCritical('Hard stops — pause protocol, page on-call', 'Screen all patients against the criteria below before initiating this protocol.')}
        <ul style="margin:14px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:8px;color:${T.rose}">
          ${(d.contraindications||[]).map(c=>`<li><span style="color:${T.text2}">${esc(c)}</span></li>`).join('')}
        </ul>`,
    });

    sections.push({
      id: 'checklist',
      title: 'Pre-session checklist',
      render: () => checklistBlock(entry.id, [
        'Confirm identity with two identifiers (name + DOB or MRN)',
        'Safety screen current within last 30 days',
        'No active contraindication — implant, pregnancy, seizure',
        'Skin inspection documented, grade ≤ 1',
        'Impedance < 5 kΩ per channel at steady state',
        'Emergency stop within reach of clinician and patient',
        'PHQ-2 / mood check captured before stim start',
        'Post-session debrief — re-grade skin + side-effect elicit',
      ]),
    });

    if (d.expectedResponse) sections.push({
      id: 'response',
      title: 'Expected response',
      render: () => `<p>${esc(d.expectedResponse)}</p>`,
    });

    if (d.monitoring) sections.push({
      id: 'monitoring',
      title: 'Monitoring & assessments',
      render: () => `<p>${esc(d.monitoring)}</p>`,
    });

    if (d.followUp) sections.push({
      id: 'followup',
      title: 'Follow-up & discharge',
      render: () => `<p>${esc(d.followUp)}</p>`,
    });

    sections.push({
      id: 'evidence',
      title: 'Evidence base',
      render: () => evidenceCards(entry, evGrade, d.expectedResponse),
    });

    sections.push({
      id: 'related',
      title: 'Related handbooks',
      render: () => relatedCards(entry),
    });

    return sections.map((s,i) => ({ ...s, num: String(i+1).padStart(2,'0') }));
  }

  // Static Safety/Ops + Training stubs (no rich data behind them yet)
  const stub = OPS_STUBS[entry.id] || TRAIN_STUBS[entry.id] || { intro: 'This handbook is being authored. Contact the clinical director for the latest signed copy.', items: [] };
  const sections = [
    { id: 'overview', title: 'Overview', render: () => `<p>${esc(stub.intro)}</p>` },
  ];
  if ((stub.items||[]).length) sections.push({
    id: 'checklist', title: 'Operating checklist',
    render: () => checklistBlock(entry.id, stub.items),
  });
  sections.push({ id: 'evidence', title: 'Evidence & policy', render: () => evidenceCards(entry, 'B', stub.intro) });
  sections.push({ id: 'related',  title: 'Related handbooks',  render: () => relatedCards(entry) });
  return sections.map((s,i)=>({ ...s, num: String(i+1).padStart(2,'0') }));
}

const OPS_STUBS = {
  'ops-safety-screen':  { intro: 'Pre-session safety screen — administered before every stimulation visit. Must be current within 30 days.', items: ['Confirm no cranial implant or active seizure disorder', 'Confirm no pregnancy (stimulation modalities)', 'Confirm no metal foreign bodies in head', 'Verify mood baseline and C-SSRS at session start', 'Document baseline HR / BP'] },
  'ops-ae-response':    { intro: 'Standard adverse-event response tree — triage, escalation, paging, post-event documentation.', items: ['Stop stimulation immediately', 'Stay with patient, secure airway, monitor vitals', 'Page on-call clinician', 'Complete AE incident form within 24h', 'Schedule governance review at next sitting'] },
  'ops-contra-matrix':  { intro: 'Master contraindications matrix across all stimulation modalities. Cross-referenced from every protocol handbook.', items: [] },
  'ops-device-clean':   { intro: 'Device cleaning, sparing and storage SOP. Applies to all clinic-owned stimulation hardware.', items: ['Wipe electrodes with 70% isopropyl after every use', 'Discard sponges after single patient session', 'Quarterly impedance calibration', 'Annual third-party safety inspection'] },
  'ops-electrode-prep': { intro: 'Electrode preparation & saline standard — 6 mL of 0.9% saline per pad, fitted under 10-20 cap.', items: [] },
  'ops-escalation':     { intro: 'Incident escalation tree — who pages whom, when, and how the report is logged.', items: [] },
};
const TRAIN_STUBS = {
  'train-30day': { intro: 'New-clinician 30-day onboarding — week-by-week competency milestones, supervised sessions, sign-off forms.', items: ['Week 1 · Shadow 5 sessions', 'Week 2 · Co-deliver 5 sessions', 'Week 3 · Lead under supervision', 'Week 4 · Competency sign-off by clinical director'] },
  'train-1020':  { intro: '10-20 EEG placement primer — landmark measurement, cap fitting, target verification.', items: [] },
  'train-app':   { intro: 'Patient app walkthrough — onboarding flow, mood diary, exercise prescription, telehealth handoff.', items: [] },
};

// ── Rich block helpers ───────────────────────────────────────────────────────
function paramTable(rows) {
  return `
    <table style="width:100%;border-collapse:separate;border-spacing:0;margin:8px 0 0;border:1px solid ${T.border};border-radius:${T.rmd};overflow:hidden;font-size:13px;font-family:${T.fmono}">
      <thead><tr>
        <th style="text-align:left;padding:10px 14px;background:${T.panel};font-size:10.5px;font-weight:700;color:${T.text3};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${T.border}">Parameter</th>
        <th style="text-align:left;padding:10px 14px;background:${T.panel};font-size:10.5px;font-weight:700;color:${T.text3};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${T.border}">Value</th>
      </tr></thead>
      <tbody>
        ${rows.map((r,i)=>`<tr>
          <td style="padding:11px 14px;border-bottom:${i===rows.length-1?'0':`1px solid ${T.border}`};color:${T.text1};font-weight:600">${esc(r[0])}</td>
          <td style="padding:11px 14px;border-bottom:${i===rows.length-1?'0':`1px solid ${T.border}`};color:${T.teal}">${esc(r[1])}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function stepsBlock(items) {
  return `<div style="margin:8px 0 0;display:flex;flex-direction:column;gap:10px">
    ${items.map((step,i)=>`
      <div style="display:grid;grid-template-columns:36px 1fr;gap:14px;padding:14px 16px;background:${T.panel};border:1px solid ${T.border};border-radius:${T.rmd}">
        <div style="width:30px;height:30px;border-radius:50%;background:rgba(0,212,188,0.12);color:${T.teal};font-family:${T.fmono};font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center">${i+1}</div>
        <div style="font-size:13.5px;color:${T.text2};line-height:1.55">${esc(step)}</div>
      </div>`).join('')}
  </div>`;
}

function calloutCritical(title, body) {
  return `<div style="display:grid;grid-template-columns:auto 1fr;gap:14px;padding:14px 18px;border-radius:${T.rmd};margin:8px 0 0;border:1px solid rgba(255,107,157,0.32);background:rgba(255,107,157,0.06)">
    <div style="width:28px;height:28px;border-radius:50%;background:${T.rose};color:#04121c;display:flex;align-items:center;justify-content:center;font-weight:700;font-family:${T.fmono}">⛔</div>
    <div>
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${T.rose};margin-bottom:4px">${esc(title)}</div>
      <div style="color:${T.text1};font-size:14px;line-height:1.55">${esc(body)}</div>
    </div>
  </div>`;
}

function calloutTLDR(body) {
  return `<div style="display:grid;grid-template-columns:auto 1fr;gap:14px;padding:14px 18px;border-radius:${T.rmd};margin:0 0 22px;border:1px solid rgba(0,212,188,0.28);background:rgba(0,212,188,0.05)">
    <div style="width:28px;height:28px;border-radius:50%;background:${T.teal};color:#04121c;display:flex;align-items:center;justify-content:center;font-weight:700;font-family:${T.fmono}">⚡</div>
    <div>
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${T.teal};margin-bottom:4px">TL;DR · the 60-second version</div>
      <div style="color:${T.text1};font-size:14px;line-height:1.55">${esc(body)}</div>
    </div>
  </div>`;
}

function checklistBlock(entryId, items) {
  if (!items || !items.length) return `<p style="color:${T.text3}">No checklist on file.</p>`;
  const key = `ds_handbook_checklist_${entryId}`;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) { saved = {}; }
  return `<div style="margin:8px 0 0;border-top:1px solid ${T.border}">
    ${items.map((item,i)=>{
      const checked = !!saved[i];
      return `
        <label style="display:flex;align-items:flex-start;gap:12px;padding:10px 4px;border-bottom:1px solid ${T.border};font-size:14px;color:${T.text2};line-height:1.5;cursor:pointer">
          <input type="checkbox" ${checked?'checked':''} data-cl-key="${esc(key)}" data-cl-idx="${i}" style="margin-top:3px;accent-color:${T.teal};width:15px;height:15px;cursor:pointer;flex-shrink:0" onchange="window._hbToggleCheck(this)" />
          <span style="flex:1${checked?`;color:${T.text3};text-decoration:line-through`:''}"><strong style="color:${checked?T.text3:T.text1};font-weight:600">${esc(item)}</strong></span>
        </label>`;
    }).join('')}
  </div>`;
}

function evidenceCards(entry, grade, summary) {
  const cards = [
    { grade, title: `${entry.title} — primary evidence`, body: summary || 'See clinic governance ledger for the full citation list.', cite: `${entry.kind === 'protocol' ? 'Clinic SOP-' + slug(entry.id).toUpperCase() : 'Handbook ' + entry.id} · primary source.` },
    { grade: gradeStep(grade, 1), title: 'Supporting meta-analysis', body: 'Pooled clinical outcomes across DeepSynaps clinic network. Updated quarterly.', cite: 'Internal meta-analysis · Q1 2026.' },
    { grade: gradeStep(grade, 2), title: 'Real-world clinic outcomes', body: 'Clinic-level outcome registry for this indication.', cite: 'Outcomes registry · live.' },
  ];
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:8px 0 0">
    ${cards.map((c,i)=>`
      <div data-ev-cite="${esc(c.cite)}" data-ev-title="${esc(c.title)}" onclick="window._hbCite(this)"
           style="padding:14px 16px;background:${T.panel};border:1px solid ${T.border};border-radius:${T.rmd};cursor:pointer;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          ${gradeBadge(c.grade)}
          <span style="font-family:${T.fmono};font-size:10px;color:${T.text3}">SRC #${i+1}</span>
        </div>
        <div style="font-family:${T.fdisp};font-size:14px;font-weight:600;color:${T.text1};line-height:1.3">${esc(c.title)}</div>
        <div style="font-size:12px;color:${T.text2};line-height:1.5">${esc(c.body)}</div>
      </div>`).join('')}
  </div>`;
}
function gradeStep(g, n) {
  const order = ['A','B','C','D'];
  const idx = Math.min(order.length - 1, Math.max(0, order.indexOf((g||'C').toUpperCase()) + n));
  return order[idx];
}

function relatedCards(entry) {
  const related = [];
  if (entry.kind === 'condition') {
    const protos = PROTOCOL_REGISTRY.filter(p => p.condition === entry.id).slice(0, 4);
    for (const p of protos) related.push({ kind: 'PROTOCOL', title: HANDBOOK_DATA[p.id]?.name || p.name, meta: `${p.modality||''} · ${p.target||''}`, id: p.id });
  } else if (entry.kind === 'protocol') {
    const cond = CONDITION_REGISTRY.find(c => c.id === entry.reg?.condition);
    if (cond) related.push({ kind: 'CONDITION', title: cond.name, meta: `${cond.icd10||''} · ${cond.cat||''}`, id: cond.id });
    related.push({ kind: 'SAFETY', title: 'Pre-session safety screen', meta: 'required before every run', id: 'ops-safety-screen' });
    related.push({ kind: 'OPS', title: 'Electrode preparation & saline SOP', meta: '6 mL per pad · 0.9 % saline', id: 'ops-electrode-prep' });
    related.push({ kind: 'OPS', title: 'Adverse event response tree', meta: 'triage + on-call paging', id: 'ops-ae-response' });
  } else {
    related.push({ kind: 'SAFETY', title: 'Pre-session safety screen', meta: 'required before every run', id: 'ops-safety-screen' });
    related.push({ kind: 'OPS', title: 'Contraindications matrix', meta: 'cross-modality', id: 'ops-contra-matrix' });
  }
  if (!related.length) return `<p style="color:${T.text3}">No cross-links yet.</p>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:8px 0 0">
    ${related.map(r=>`
      <div onclick="window._hbOpen('${esc(r.id)}')" style="padding:14px 16px;background:${T.panel};border:1px solid ${T.border};border-radius:${T.rmd};cursor:pointer;transition:border-color .1s" onmouseover="this.style.borderColor='rgba(0,212,188,0.35)'" onmouseout="this.style.borderColor='${T.border}'">
        <div style="font-family:${T.fmono};font-size:9.5px;color:${T.text3};text-transform:uppercase;letter-spacing:0.06em;font-weight:600">${esc(r.kind)}</div>
        <div style="font-family:${T.fdisp};font-size:14px;font-weight:600;color:${T.text1};margin-top:4px;line-height:1.3">${esc(r.title)}</div>
        <div style="font-family:${T.fmono};font-size:10.5px;color:${T.text3};margin-top:8px">${esc(r.meta)}</div>
      </div>`).join('')}
  </div>`;
}

// ── Left rail: collections tree ──────────────────────────────────────────────
function renderLeftRail(entries) {
  const q = _query.trim().toLowerCase();
  const favs = new Set(_loadFavs());
  const visible = entries.filter(e => {
    // Text query
    if (q && !(
      e.title.toLowerCase().includes(q) ||
      e.subtitle.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.collection.toLowerCase().includes(q)
    )) return false;
    // Modality filter — only applies to entries with a declared modality
    if (_fModality !== 'All') {
      if (!(e.modalities || []).some(m => _modalityMatches(m, _fModality))) return false;
    }
    // Protocol filter — matches by protocol id
    if (_fProtocol !== 'All') {
      if (!(e.protocolIds || []).includes(_fProtocol)) return false;
    }
    // Device filter — match against any device whose modality fits any modality on this entry
    if (_fDevice !== 'All') {
      const d = DEVICE_REGISTRY.find(x => x.id === _fDevice);
      if (!d) return false;
      if (!(e.modalities || []).some(m => _modalityMatches(d.modality, m))) return false;
    }
    // Favourites-only
    if (_favOnly && !favs.has(e.id)) return false;
    return true;
  });

  // Pinned = first 3 condition entries (canonical examples) + active doc if not present
  const pinnedIds = new Set(['mdd', 'ops-safety-screen', 'ops-ae-response']);
  if (_id) pinnedIds.add(_id);
  const pinned = visible.filter(e => pinnedIds.has(e.id)).slice(0, 4);

  // Group remainder by collection
  const groups = new Map();
  for (const e of visible) {
    if (pinnedIds.has(e.id)) continue;
    if (!groups.has(e.collection)) groups.set(e.collection, []);
    groups.get(e.collection).push(e);
  }
  // Stable order: clinical conditions first (registry cat order), then Safety & Ops, then Training
  const catOrder = [...new Set(CONDITION_REGISTRY.map(c => c.cat))];
  const collectionOrder = [...catOrder, 'Protocols', 'Safety & Ops', 'Training'];
  const ordered = collectionOrder.filter(c => groups.has(c)).map(c => [c, groups.get(c)]);
  // Append any leftover collections we didn't anticipate
  for (const [k,v] of groups) if (!collectionOrder.includes(k)) ordered.push([k,v]);

  function row(e) {
    const active = e.id === _id ? `background:rgba(0,212,188,0.07);color:${T.text1};border-left-color:${T.teal}` : '';
    const status = e.kind === 'ops' || e.kind === 'train' ? (e.version === 'draft' ? 'draft' : 'ok') : 'ok';
    const meta = e.kind === 'condition' ? (e.reg?.icd10 || '') : e.kind === 'protocol' ? (e.reg?.modality || '') : (e.version || '');
    const isFav = favs.has(e.id);
    return `<div onclick="window._hbOpen('${esc(e.id)}')"
      style="padding:6px 8px 6px 18px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12px;color:${T.text2};border-left:2px solid transparent;line-height:1.35;${active}">
      ${statusDot(status)}
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${esc(e.title)}</span>
      <span style="font-size:9.5px;color:${T.text3};font-family:${T.fmono};flex-shrink:0">${esc(meta)}</span>
      <button aria-label="${isFav ? 'Unfavourite' : 'Favourite'}" onclick="event.stopPropagation(); window._hbToggleFav('${esc(e.id)}')"
        style="background:transparent;border:0;cursor:pointer;padding:0 2px;color:${isFav ? T.amber : T.text3};font-size:13px;line-height:1;flex-shrink:0">${isFav ? '★' : '☆'}</button>
    </div>`;
  }

  function group(title, items, count) {
    if (!items.length) return '';
    return `
      <div style="padding:11px 14px 5px;font-size:9.5px;text-transform:uppercase;letter-spacing:0.08em;color:${T.text3};font-weight:600;display:flex;align-items:center;gap:6px;font-family:${T.fmono}">
        ${esc(title)} <span style="margin-left:auto;color:${T.text3}">${count}</span>
      </div>
      ${items.map(row).join('')}`;
  }

  // Build facet option lists from real entries (entries = full set, not filtered).
  const allModalities = [...new Set(entries.flatMap(e => e.modalities || []))].filter(Boolean).sort();
  const allProtocolIds = [...new Set(entries.flatMap(e => e.protocolIds || []))].filter(Boolean);
  const allDevices = [...new Set(DEVICE_REGISTRY.map(d => d.id))].filter(Boolean);

  const selStyle = `flex:1;min-width:0;padding:5px 7px;border-radius:${T.rsm};background:${T.surface};color:${T.text1};border:1px solid ${T.border};font-size:11px;font-family:inherit;box-sizing:border-box`;
  const facetRow = `
    <div style="display:flex;gap:6px;margin-top:8px">
      <select onchange="window._hbSetFacet('modality', this.value)" style="${selStyle}" title="Filter by modality">
        <option value="All"${_fModality==='All'?' selected':''}>Any modality</option>
        ${allModalities.map(m => `<option value="${esc(m)}"${m===_fModality?' selected':''}>${esc(m)}</option>`).join('')}
      </select>
      <select onchange="window._hbSetFacet('protocol', this.value)" style="${selStyle}" title="Filter by protocol">
        <option value="All"${_fProtocol==='All'?' selected':''}>Any protocol</option>
        ${allProtocolIds.map(pid => {
          const p = PROTOCOL_REGISTRY.find(x => x.id === pid);
          return `<option value="${esc(pid)}"${pid===_fProtocol?' selected':''}>${esc(p?.name || pid)}</option>`;
        }).join('')}
      </select>
    </div>
    <div style="display:flex;gap:6px;margin-top:6px">
      <select onchange="window._hbSetFacet('device', this.value)" style="${selStyle}" title="Filter by device">
        <option value="All"${_fDevice==='All'?' selected':''}>Any device</option>
        ${allDevices.map(did => {
          const d = DEVICE_REGISTRY.find(x => x.id === did);
          return `<option value="${esc(did)}"${did===_fDevice?' selected':''}>${esc((d?.name || did) + ' · ' + (d?.modality || ''))}</option>`;
        }).join('')}
      </select>
      <button onclick="window._hbToggleFavOnly()"
        title="${_favOnly ? 'Show all' : 'Favourites only'}"
        style="padding:5px 10px;border-radius:${T.rsm};background:${_favOnly ? 'rgba(255,181,71,0.12)' : T.surface};border:1px solid ${_favOnly ? T.amber : T.border};color:${_favOnly ? T.amber : T.text2};font-size:11px;cursor:pointer;font-family:inherit;flex-shrink:0">${_favOnly ? '★ Favs' : '☆ All'}</button>
    </div>
    ${(_fModality!=='All' || _fProtocol!=='All' || _fDevice!=='All' || _favOnly) ? `
      <button onclick="window._hbResetFacets()" style="margin-top:6px;padding:3px 8px;border-radius:${T.rsm};background:transparent;border:1px solid ${T.border};color:${T.text3};font-size:10.5px;cursor:pointer;font-family:${T.fmono}">× Reset filters</button>
    ` : ''}`;

  return `
    <aside style="border:1px solid ${T.border};border-radius:${T.rmd};background:${T.panel};display:flex;flex-direction:column;overflow:hidden;position:sticky;top:0;align-self:start;max-height:calc(100vh - 120px)">
      <div style="padding:14px 14px 10px;border-bottom:1px solid ${T.border}">
        <div style="position:relative">
          <input id="hb-filter" placeholder="Filter handbooks…  ( / )" value="${esc(_query)}"
            oninput="window._hbFilter(this.value)"
            style="width:100%;padding:7px 10px;background:${T.surface};border:1px solid ${T.border};border-radius:${T.rsm};font-size:11.5px;color:${T.text1};font-family:inherit;box-sizing:border-box" />
        </div>
        ${facetRow}
      </div>
      <div style="flex:1;overflow-y:auto;padding:4px 0 16px">
        ${group('Pinned', pinned, pinned.length)}
        ${ordered.map(([cat, items]) => group(cat, items, items.length)).join('')}
        ${visible.length === 0 ? `<div style="padding:22px 14px;color:${T.text3};font-size:11.5px">No handbooks match.</div>` : ''}
      </div>
    </aside>`;
}

// ── Center reading pane ──────────────────────────────────────────────────────
function renderCenter(entry, sections) {
  if (!entry) {
    // Build a welcoming overview: one "suggested" card per collection + the
    // total per-collection count. Clicking a suggestion opens that handbook.
    const entries = buildEntries();
    const byCat = new Map();
    for (const e of entries) {
      if (!byCat.has(e.collection)) byCat.set(e.collection, []);
      byCat.get(e.collection).push(e);
    }
    const catOrder = [...new Set(CONDITION_REGISTRY.map(c => c.cat))];
    const ordered = [...catOrder, 'Protocols', 'Safety & Ops', 'Training']
      .filter(c => byCat.has(c))
      .map(c => [c, byCat.get(c)]);
    for (const [k, v] of byCat) if (!ordered.find(([x]) => x === k)) ordered.push([k, v]);

    const cards = ordered.slice(0, 9).map(([cat, items]) => {
      const sample = items[0];
      return `<button onclick="window._hbOpen('${esc(sample.id)}')"
        style="text-align:left;padding:14px 16px;border-radius:${T.rmd};background:${T.panel};border:1px solid ${T.border};cursor:pointer;font-family:inherit;display:flex;flex-direction:column;gap:5px;transition:border-color 0.15s"
        onmouseover="this.style.borderColor='${T.teal}'" onmouseout="this.style.borderColor='${T.border}'">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.08em;color:${T.text3};font-family:${T.fmono};font-weight:600;display:flex;align-items:center;justify-content:space-between">
          <span>${esc(cat)}</span>
          <span style="color:${T.text3};font-weight:500">${items.length} doc${items.length===1?'':'s'}</span>
        </div>
        <div style="font-size:14px;color:${T.text1};font-weight:600;font-family:${T.fdisp}">${esc(sample.title)}</div>
        <div style="font-size:11.5px;color:${T.text3};overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(sample.subtitle || '')}</div>
      </button>`;
    }).join('');

    const total = entries.length;
    return `<section style="border:1px solid ${T.border};border-radius:${T.rmd};background:${T.panel};padding:42px clamp(20px, 4vw, 56px);min-height:calc(100vh - 180px);overflow-y:auto;max-height:calc(100vh - 120px)">
      <div style="max-width:900px;margin:0 auto">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${T.teal};font-family:${T.fmono};font-weight:600;margin-bottom:8px">Handbooks · ${total} documents</div>
        <h1 style="font-family:${T.fdisp};font-size:32px;font-weight:600;letter-spacing:-0.02em;margin:0 0 8px;color:${T.text1}">Clinical knowledge base</h1>
        <p style="font-size:14.5px;color:${T.text2};line-height:1.6;margin:0 0 20px;max-width:640px">Condition and protocol handbooks, safety SOPs, and training materials — each ready to read, generate a tailored draft from evidence, or export to DOCX. Pick any document from the left rail, or start from one of the collections below.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 28px">
          <button onclick="document.getElementById('hb-filter')?.focus()" style="padding:8px 14px;border-radius:${T.rsm};font-size:12px;font-weight:600;color:${T.teal};background:rgba(0,212,188,0.08);border:1px solid rgba(0,212,188,0.32);cursor:pointer;font-family:inherit">⌕ Search all (press <kbd style="font-family:${T.fmono};background:${T.surface};border:1px solid ${T.border};border-radius:3px;padding:1px 5px;font-size:10.5px">/</kbd>)</button>
          <button onclick="window._hbOpen('mdd')" style="padding:8px 14px;border-radius:${T.rsm};font-size:12px;color:${T.text2};background:${T.surface};border:1px solid ${T.border};cursor:pointer;font-family:inherit">Jump to MDD · flagship condition</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:12px">${cards}</div>
      </div>
    </section>`;
  }

  const version = entry.version || 'v1.0';
  const minutes = readTime(JSON.stringify(entry.data || {}));
  const tldr = (entry.data?.responseData || entry.data?.expectedResponse || entry.data?.patientExplain || `Canonical clinic handbook for ${entry.title}.`);

  const heroTag = entry.kind === 'protocol' ? 'Protocol handbook' : entry.kind === 'condition' ? 'Condition handbook' : 'Operations handbook';
  const sopNum = `SOP-${(entry.id||'').toUpperCase().slice(0,8)}`;
  const isFav = _isFav(entry.id);
  // DOCX export backend only supports condition / protocol entries — Ops / Training
  // have no clinical-dataset row. Disable the export button in those cases so the
  // UI doesn't lie about the capability.
  const docxDisabled = entry.kind !== 'condition' && entry.kind !== 'protocol';

  return `<section style="border:1px solid ${T.border};border-radius:${T.rmd};background:${T.panel};display:flex;flex-direction:column;overflow:hidden;min-width:0">
    <header style="padding:10px 22px;border-bottom:1px solid ${T.border};background:${T.bg};display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:${T.text3};font-weight:500;font-family:${T.fmono}">
        <span>${esc(heroTag)}</span><span style="opacity:.4">/</span>
        <span>${esc(entry.collection || '—')}</span><span style="opacity:.4">/</span>
        <strong style="color:${T.text1};font-weight:600">${esc(entry.title)}</strong>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button onclick="window._hbToggleFav('${esc(entry.id)}')" title="${isFav ? 'Remove from favourites' : 'Add to favourites'}"
          style="padding:5px 11px;border-radius:5px;font-size:11px;color:${isFav ? T.amber : T.text2};background:transparent;border:1px solid ${isFav ? T.amber : T.border};cursor:pointer;font-family:inherit">${isFav ? '★ Favourited' : '☆ Favourite'}</button>
        <button id="hb-export-docx-btn" onclick="window._hbExportDocx('${esc(entry.id)}')" ${docxDisabled ? 'disabled' : ''}
          style="padding:5px 11px;border-radius:5px;font-size:11px;color:${docxDisabled ? T.text3 : T.text2};background:transparent;border:1px solid ${T.border};cursor:${docxDisabled ? 'not-allowed' : 'pointer'};font-family:inherit"
          title="${docxDisabled ? 'DOCX export is only available for condition and protocol handbooks.' : 'Export as Word document'}">⬇ DOCX</button>
        <button onclick="window._hbPrint()" style="padding:5px 11px;border-radius:5px;font-size:11px;color:${T.text2};background:transparent;border:1px solid ${T.border};cursor:pointer;font-family:inherit">↗ Print</button>
      </div>
    </header>
    <div id="hb-reading-pane" style="flex:1;overflow-y:auto;padding:0;max-height:calc(100vh - 180px)">
      <article style="max-width:min(900px, 100%);margin:0 auto;padding:42px clamp(20px, 5vw, 56px) 96px;font-family:${T.fbody};color:${T.text2};line-height:1.65;font-size:15px">
        <div style="display:inline-flex;align-items:center;gap:7px;padding:4px 10px;background:rgba(0,212,188,0.08);border:1px solid rgba(0,212,188,0.22);border-radius:999px;font-size:10.5px;color:${T.teal};font-weight:600;letter-spacing:0.04em;font-family:${T.fmono};text-transform:uppercase">
          <span style="background:${T.teal};color:#04121c;padding:1px 5px;border-radius:3px;font-weight:700">${esc(sopNum)}</span>${esc(heroTag)}
        </div>
        <h1 style="font-family:${T.fdisp};font-size:38px;font-weight:600;letter-spacing:-0.025em;line-height:1.1;margin:14px 0 10px;color:${T.text1};text-wrap:balance">${esc(entry.title)}</h1>
        <p style="font-size:16px;color:${T.text2};line-height:1.55;max-width:620px;margin:0">${esc(entry.subtitle)}</p>
        <div style="display:flex;align-items:center;gap:18px;margin-top:20px;padding:12px 0;border-top:1px solid ${T.border};border-bottom:1px solid ${T.border};font-size:11px;color:${T.text3};font-family:${T.fmono};flex-wrap:wrap">
          <span>Version <strong style="color:${T.text1}">${esc(version)}</strong></span>
          <span>${esc(String(minutes))} min read</span>
          <span style="margin-left:auto;display:inline-flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:50%;background:${T.text3}"></span>Governance review: not yet wired</span>
        </div>

        <div style="margin-top:28px">
          ${calloutTLDR(tldr)}

          ${sections.map(s => `
            <h2 id="hb-${esc(s.id)}" style="font-family:${T.fdisp};font-size:21px;font-weight:600;letter-spacing:-0.015em;color:${T.text1};margin:38px 0 12px;scroll-margin-top:24px;display:flex;align-items:center;gap:12px">
              <span style="font-family:${T.fmono};font-size:11px;color:${T.text3};background:${T.surface};padding:3px 8px;border-radius:4px;font-weight:600;letter-spacing:0.04em">${esc(s.num)}</span>
              ${esc(s.title)}
            </h2>
            <div>${s.render()}</div>
          `).join('')}
        </div>
      </article>
    </div>
  </section>`;
}

// ── Right rail: TOC + meta + history + contributors + back-refs ──────────────
function renderRightRail(entry, sections) {
  if (!entry) {
    return `<aside style="border:1px solid ${T.border};border-radius:${T.rmd};background:${T.panel};padding:18px;color:${T.text3};font-size:12px;position:sticky;top:0;align-self:start">No handbook open.</aside>`;
  }

  const version = entry.version || 'v1.0';
  const reviewStatus = 'Unassigned';
  const reviewColor = T.text3;

  // Back-references are real (derived from the protocol registry); governance
  // sign-offs and per-handbook revision history are not yet wired to a service.
  const protocolRefCount = entry.kind === 'condition'
    ? PROTOCOL_REGISTRY.filter(p => p.condition === entry.id).length
    : 0;

  return `<aside style="border:1px solid ${T.border};border-radius:${T.rmd};background:${T.panel};display:flex;flex-direction:column;overflow:hidden;position:sticky;top:0;align-self:start;max-height:calc(100vh - 120px)">
    <div style="flex:1;overflow-y:auto">
      <div style="padding:16px;border-bottom:1px solid ${T.border}">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.08em;color:${T.text3};font-weight:600;margin-bottom:10px;font-family:${T.fmono}">On this page</div>
        <nav id="hb-toc" style="display:flex;flex-direction:column">
          ${sections.map(s => `
            <a href="#hb-${esc(s.id)}" data-toc="${esc(s.id)}" onclick="window._hbScroll(event,'${esc(s.id)}')"
               style="padding:5px 0 5px 10px;border-left:2px solid transparent;font-size:11.5px;color:${_section===s.id?T.text1:T.text3};text-decoration:none;line-height:1.4;font-weight:${_section===s.id?'600':'400'};border-left-color:${_section===s.id?T.teal:'transparent'}">
              ${esc(s.num)} ${esc(s.title)}
            </a>`).join('')}
        </nav>
      </div>

      <div style="padding:16px;border-bottom:1px solid ${T.border}">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.08em;color:${T.text3};font-weight:600;margin-bottom:10px;font-family:${T.fmono};display:flex;align-items:center;justify-content:space-between">
          Review status
          <span style="font-family:${T.fmono};font-size:9.5px;color:${reviewColor};border:1px solid ${reviewColor};padding:1px 7px;border-radius:999px">● ${esc(reviewStatus)}</span>
        </div>
        <div style="font-size:11px;color:${T.text3};line-height:1.5">
          Governance sign-off is not yet wired to handbooks. Owner, reviewer, and due dates will appear here once the review queue is connected.
        </div>
      </div>

      <div style="padding:16px;border-bottom:1px solid ${T.border}">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.08em;color:${T.text3};font-weight:600;margin-bottom:10px;font-family:${T.fmono};display:flex;align-items:center;justify-content:space-between">
          Version history <span style="color:${T.text3};font-weight:500">${esc(version)}</span>
        </div>
        <div style="font-size:11px;color:${T.text3};line-height:1.5">
          No revision history on file. Handbook revisions will appear here after the content service goes live.
        </div>
      </div>

      <div style="padding:16px;border-bottom:1px solid ${T.border}">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.08em;color:${T.text3};font-weight:600;margin-bottom:10px;font-family:${T.fmono}">Contributors</div>
        <div style="font-size:11px;color:${T.text3};line-height:1.5">No contributor list on file yet.</div>
      </div>

      <div style="padding:16px">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.08em;color:${T.text3};font-weight:600;margin-bottom:10px;font-family:${T.fmono};display:flex;align-items:center;justify-content:space-between">
          Back-references <span style="color:${T.text3};font-weight:500">${protocolRefCount}</span>
        </div>
        ${protocolRefCount > 0
          ? `<button onclick="window._hbToast('Back-references','${protocolRefCount} linked record${protocolRefCount===1?'':'s'} in the protocol registry.')"
              style="width:100%;padding:8px 10px;border-radius:6px;font-size:11.5px;color:${T.text2};background:${T.surface};border:1px solid ${T.border};cursor:pointer;font-family:inherit;text-align:left">
              → Linked to ${protocolRefCount} ${entry.kind==='condition' ? 'protocol' + (protocolRefCount===1?'':'s') : 'record' + (protocolRefCount===1?'':'s')}
            </button>`
          : `<div style="font-size:11px;color:${T.text3};line-height:1.5">No back-references in the registry for this handbook.</div>`}
      </div>
    </div>
  </aside>`;
}

// ── Render orchestrator ──────────────────────────────────────────────────────
function render() {
  if (!_el) return;
  const entries = buildEntries();
  // First render: pick the first available entry (or 'mdd')
  if (!_id) {
    const initial = entries.find(e => e.id === 'mdd') || entries[0];
    _id = initial?.id || null;
  }
  const entry = entries.find(e => e.id === _id) || null;
  const sections = entry ? sectionsFor(entry) : [];
  if (entry && sections.length && !_section) _section = sections[0].id;

  _el.innerHTML = `
    <div style="background:${T.bg};min-height:100%;padding:16px;font-family:${T.fbody};color:${T.text1}">
      <div style="display:grid;grid-template-columns:240px 1fr 280px;gap:16px;align-items:flex-start">
        ${renderLeftRail(entries)}
        ${renderCenter(entry, sections)}
        ${renderRightRail(entry, sections)}
      </div>
    </div>`;

  // Wire scroll-spy on the reading pane to highlight active TOC item
  const pane = document.getElementById('hb-reading-pane');
  if (pane && sections.length) {
    pane.addEventListener('scroll', () => {
      const top = pane.getBoundingClientRect().top;
      let active = sections[0].id;
      for (const s of sections) {
        const el = document.getElementById(`hb-${s.id}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top - top < 80) active = s.id;
      }
      if (active !== _section) {
        _section = active;
        const tocLinks = document.querySelectorAll('#hb-toc a[data-toc]');
        tocLinks.forEach(a => {
          const isActive = a.getAttribute('data-toc') === _section;
          a.style.color = isActive ? T.text1 : T.text3;
          a.style.fontWeight = isActive ? '600' : '400';
          a.style.borderLeftColor = isActive ? T.teal : 'transparent';
        });
      }
    }, { passive: true });
  }
}

// ── Public entry point ───────────────────────────────────────────────────────
export async function pgHandbooks(setTopbar /*, navigate */) {
  if (typeof setTopbar === 'function') {
    setTopbar('Handbooks', `<span style="font-size:0.8rem;color:${T.text2};align-self:center">Clinical knowledge base · 65 documents</span>`);
  }
  _el = document.getElementById('content');
  if (!_el) return;

  _id = null;
  _query = '';
  _section = null;

  // Window-scoped handlers (string event handlers are the page convention)
  window._hbOpen = (id) => { _id = id; _section = null; render(); };
  const _repaintRail = () => {
    const entries = buildEntries();
    const left = _el.querySelector(':scope > div > div > aside:first-of-type');
    if (left && left.parentElement) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderLeftRail(entries);
      left.replaceWith(tmp.firstElementChild);
    }
  };
  window._hbFilter = (v) => {
    _query = v || '';
    _repaintRail();
    // Keep input focus on the filter input after repaint so typing is uninterrupted.
    const f = document.getElementById('hb-filter');
    if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (_) {} }
  };
  window._hbSetFacet = (field, value) => {
    if (field === 'modality') _fModality = value || 'All';
    else if (field === 'protocol') _fProtocol = value || 'All';
    else if (field === 'device') _fDevice = value || 'All';
    _repaintRail();
  };
  window._hbToggleFavOnly = () => { _favOnly = !_favOnly; _repaintRail(); };
  window._hbResetFacets = () => {
    _fModality = 'All'; _fProtocol = 'All'; _fDevice = 'All'; _favOnly = false;
    _repaintRail();
  };
  window._hbToggleFav = (id) => { _toggleFav(id); render(); };
  window._hbScroll = (ev, secId) => {
    if (ev?.preventDefault) ev.preventDefault();
    const el = document.getElementById(`hb-${secId}`);
    const pane = document.getElementById('hb-reading-pane');
    if (el && pane) {
      const top = el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 16;
      pane.scrollTo({ top, behavior: 'smooth' });
      _section = secId;
    }
  };
  window._hbToggleCheck = (input) => {
    const key = input?.dataset?.clKey;
    const idx = parseInt(input?.dataset?.clIdx || '-1', 10);
    if (!key || idx < 0) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) { saved = {}; }
    if (input.checked) saved[idx] = true; else delete saved[idx];
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch (_) { /* quota */ }
    const span = input.parentElement?.querySelector('span');
    if (span) {
      span.style.color = input.checked ? T.text3 : '';
      span.style.textDecoration = input.checked ? 'line-through' : '';
      const strong = span.querySelector('strong');
      if (strong) strong.style.color = input.checked ? T.text3 : T.text1;
    }
  };
  window._hbCite = (card) => {
    const title = card?.dataset?.evTitle || 'Citation';
    const cite  = card?.dataset?.evCite  || 'No citation on file.';
    if (typeof window._dsToast === 'function') {
      window._dsToast({ title, body: cite, severity: 'info' });
    } else {
      console.info('[handbook citation]', title, cite);
    }
  };
  window._hbToast = (title, body) => {
    if (typeof window._dsToast === 'function') window._dsToast({ title, body, severity: 'info' });
    else console.info('[handbook]', title, body);
  };
  window._hbPrint = () => { try { window.print(); } catch (_) { /* noop */ } };

  // ── DOCX export — posts current handbook to /api/v1/export/handbook-docx ────
  // Works with or without an AI-generated cache. When the entry has been
  // generated in-session (via the AI handbook section), the generated
  // document is sent; otherwise the server assembles from curated sources.
  window._hbExportDocx = async (entryId) => {
    if (!entryId) return;
    const btn = document.getElementById('hb-export-docx-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⬇ …'; }
    // The backend ExportHandbookDocxRequest schema expects
    //   { condition_name, modality_name, device_name }
    // and re-runs the clinical-dataset generator; the AI-generated cache is
    // discarded server-side, so we do not ship it.
    const cond = (CONDITION_REGISTRY || []).find(c => c.id === entryId);
    const prot = (PROTOCOL_REGISTRY || []).find(p => p.id === entryId);
    const parentCond = prot ? (CONDITION_REGISTRY || []).find(c => c.id === prot.condition) : null;
    if (!cond && !parentCond) {
      if (btn) { btn.disabled = false; btn.textContent = '⬇ DOCX'; }
      window._dsToast?.({ title: 'Export unavailable', body: 'Ops / training handbooks are not yet wired to the DOCX backend.', severity: 'warn' });
      return;
    }
    const mapped = cond ? _backendConditionFor(cond) : _backendConditionFor(parentCond);
    const sel = _aiSel[entryId] || {};
    const modalityRaw = sel.modality || prot?.modality || (cond?.modalities || [])[0] || 'TMS/rTMS';
    const modality = _modalityForBackend(modalityRaw);
    const deviceObj = sel.deviceId ? DEVICE_REGISTRY.find(d => d.id === sel.deviceId) : null;
    try {
      const blob = await api.exportHandbookDocx({
        condition_name: mapped.name,
        modality_name: modality,
        device_name: deviceObj ? deviceObj.name : '',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'handbook-' + String(entryId).toLowerCase() + '.docx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      window._dsToast?.({ title: 'Exported', body: mapped.name + ' · handbook.docx', severity: 'info' });
    } catch (e) {
      window._dsToast?.({ title: 'Export failed', body: (e?.body?.message || e?.message || 'Backend error'), severity: 'error' });
    }
    if (btn) { btn.disabled = false; btn.textContent = '⬇ DOCX'; }
  };

  // ── Keyboard shortcuts — /, Esc, j, k, ? ───────────────────────────────────
  // `/` focus search; `Esc` clear + blur when focused; `j`/`k` step through
  // the currently-visible rail entries; `?` show help toast. Input fields are
  // skipped except the `/` binding (which opens/focuses search intentionally).
  if (!window._hbKbInstalled) {
    window._hbKbInstalled = true;
    document.addEventListener('keydown', (ev) => {
      if (!document.querySelector('#hb-filter')) return; // not on Handbooks page
      const inField = ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'SELECT' || ev.target.isContentEditable);
      if (ev.key === '/' && !inField) {
        ev.preventDefault();
        const f = document.getElementById('hb-filter');
        if (f) { f.focus(); f.select?.(); }
        return;
      }
      if (ev.key === 'Escape' && ev.target?.id === 'hb-filter') {
        ev.target.value = '';
        window._hbFilter('');
        ev.target.blur();
        return;
      }
      if ((ev.key === 'j' || ev.key === 'k') && !inField) {
        ev.preventDefault();
        const rail = document.querySelectorAll('aside [onclick^="window._hbOpen"]');
        if (!rail.length) return;
        const ids = Array.from(rail).map(el => {
          const m = String(el.getAttribute('onclick') || '').match(/_hbOpen\('([^']+)'/);
          return m ? m[1] : null;
        }).filter(Boolean);
        const cur = ids.indexOf(_id);
        const next = ev.key === 'j' ? Math.min(ids.length - 1, cur + 1) : Math.max(0, cur - 1);
        const pick = ids[cur < 0 ? 0 : next];
        if (pick) window._hbOpen(pick);
        return;
      }
      if (ev.key === '?' && !inField) {
        ev.preventDefault();
        window._dsToast?.({ title: 'Handbook shortcuts', body: '/ focus search · Esc clear · j next · k previous · ? this help', severity: 'info' });
      }
    });
  }

  // Resolve the "effective condition" for the currently-open entry. For a
  // condition handbook this is the condition itself; for a protocol handbook
  // we follow the protocol's `condition` field back to the condition registry.
  const _effectiveCondition = () => {
    if (!_id) return null;
    const cond = CONDITION_REGISTRY.find(c => c.id === _id);
    if (cond) return cond;
    const prot = PROTOCOL_REGISTRY.find(p => p.id === _id);
    if (prot) return CONDITION_REGISTRY.find(c => c.id === prot.condition) || null;
    return null;
  };

  // ── AI Handbook handlers ───────────────────────────────────────────────────
  window._hbAiSet = (field, value) => {
    const cond = _effectiveCondition();
    if (!cond) return;
    const sel = _aiSelFor(cond);
    sel[field] = value;
    if (field === 'modality') {
      const protos = PROTOCOL_REGISTRY.filter(p => p.condition === cond.id);
      const devices = DEVICE_REGISTRY.filter(d => _modalityMatches(d.modality, value));
      sel.deviceId = devices.length ? devices[0].id : '';
      const protoStillValid = protos.find(p => p.id === sel.protoId && _modalityMatches(p.modality, value));
      if (!protoStillValid) {
        const newProto = protos.find(p => _modalityMatches(p.modality, value));
        sel.protoId = newProto ? newProto.id : '';
      }
    }
    _section = 'ai-handbook';
    render();
  };

  window._hbAiGenerate = async () => {
    if (!_canGenerate()) {
      window._dsToast?.({ title: 'Permission required', body: 'Handbook generation needs clinician or admin role.', severity: 'warn' });
      return;
    }
    const cond = _effectiveCondition();
    if (!cond) return;
    const sel = _aiSelFor(cond);
    const cacheKey = `${cond.id}|${sel.modality}|${sel.protoId}|${sel.deviceId}|${sel.kind}`;
    const btn  = document.getElementById('hb-ai-gen');
    const stat = document.getElementById('hb-ai-status');
    if (btn)  btn.disabled = true;
    if (stat) stat.textContent = 'Generating from clinical dataset…';
    try {
      const mapped = _backendConditionFor(cond);
      const deviceObj = sel.deviceId ? DEVICE_REGISTRY.find(d => d.id === sel.deviceId) : null;
      const res = await api.generateHandbook({
        handbook_kind: sel.kind,
        condition: mapped.name,
        modality: _modalityForBackend(sel.modality),
        device: deviceObj ? deviceObj.name : '',
      });
      _aiCache[cacheKey] = {
        document: res?.document || res,
        disclaimers: res?.disclaimers,
        modality: sel.modality,
        protoId: sel.protoId,
        deviceId: sel.deviceId,
        kind: sel.kind,
        ts: Date.now(),
      };
      window._dsToast?.({ title: 'Handbook generated', body: cond.name + ' · ' + sel.modality, severity: 'ok' });
    } catch (e) {
      const msg = e?.body?.message || e?.message || 'Backend error';
      if (stat) stat.textContent = 'Failed: ' + msg;
      window._dsToast?.({ title: 'Generate failed', body: msg, severity: 'warn' });
      if (btn) btn.disabled = false;
      return;
    }
    _section = 'ai-handbook';
    render();
  };

  render();
}
