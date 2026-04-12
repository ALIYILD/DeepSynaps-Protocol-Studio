// ── DeepSynaps Handbook Pages ─────────────────────────────────────────────────
// Handbook browser + template renderer for 53 conditions (7 types each)
// and 12 protocols (6 sections each). Template engine combines compact data
// from handbooks-data.js with registry metadata from registries.js.
// ─────────────────────────────────────────────────────────────────────────────

import { HANDBOOK_DATA } from './handbooks-data.js';
import { CONDITION_REGISTRY, PROTOCOL_REGISTRY } from './registries.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function evBadge(ev) {
  const color = ev === 'A' ? '#22c55e' : ev === 'B' ? '#f59e0b' : '#64748b';
  return `<span style="padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;background:${color}20;color:${color};border:1px solid ${color}40">Ev-${esc(ev)}</span>`;
}

function onLabelBadge(proto) {
  if (!proto.onLabel) return '';
  return `<span style="padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;background:#3b82f620;color:#60a5fa;border:1px solid #3b82f640">On-Label</span>`;
}

function flagBadge(flag) {
  const labels = { 'seizure-check':'⚠ Seizure Screen', 'pregnancy-check':'⚠ Pregnancy Check', 'implant-check':'⚠ Implant Check', 'cardiac-check':'⚠ Cardiac Check' };
  return `<span style="padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;background:#ef444420;color:#f87171;border:1px solid #ef444440">${esc(labels[flag]||flag)}</span>`;
}

function chip(label, active, handler) {
  const bg  = active ? 'var(--accent,#6366f1)' : 'var(--surface-2,rgba(255,255,255,.06))';
  const col = active ? '#fff' : 'var(--text-secondary,#94a3b8)';
  return `<button style="padding:4px 13px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${bg};color:${col};border:1px solid ${active?'transparent':'var(--border,rgba(255,255,255,.1))'};cursor:pointer;white-space:nowrap" onclick="${handler}">${esc(label)}</button>`;
}

function tab(label, i, active) {
  const bg  = active ? 'var(--accent,#6366f1)' : 'transparent';
  const col = active ? '#fff' : 'var(--text-secondary,#94a3b8)';
  const bdr = active ? 'var(--accent,#6366f1)' : 'var(--border,rgba(255,255,255,.1))';
  return `<button style="padding:7px 15px;border-radius:8px;font-size:0.78rem;font-weight:600;background:${bg};color:${col};border:1px solid ${bdr};cursor:pointer;white-space:nowrap" onclick="window._hbTab(${i})">${esc(label)}</button>`;
}

function docSection(title, body) {
  return `<div style="margin-bottom:22px">
    <h3 style="font-size:0.85rem;font-weight:700;color:var(--text-secondary,#94a3b8);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">${esc(title)}</h3>
    <div style="font-size:0.88rem;color:var(--text-primary,#e2e8f0);line-height:1.7">${body}</div>
  </div>`;
}

function numberedList(items) {
  if (!items || !items.length) return '<p style="color:var(--text-tertiary,#64748b)">No data available.</p>';
  return `<ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px">${items.map(i=>`<li style="line-height:1.6">${esc(i)}</li>`).join('')}</ol>`;
}

function bulletList(items) {
  if (!items || !items.length) return '<p style="color:var(--text-tertiary,#64748b)">No data available.</p>';
  return `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${items.map(i=>`<li style="line-height:1.6">${esc(i)}</li>`).join('')}</ul>`;
}

function dangerList(items) {
  if (!items || !items.length) return '<p style="color:var(--text-tertiary,#64748b)">No contraindications on file.</p>';
  return `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${items.map(i=>`<li style="color:#f87171;line-height:1.6">${esc(i)}</li>`).join('')}</ul>`;
}

// ── Page-level state ──────────────────────────────────────────────────────────

let _view   = 'index';  // 'index' | 'condition' | 'protocol'
let _id     = null;
let _tab    = 0;
let _query  = '';
let _cat    = 'All';
let _el     = null;

// ── Condition Handbook Template ───────────────────────────────────────────────

const COND_TABS = ['Clinician Handbook','Patient Handbook','Protocol Reference','Technician SOP','Treatment Guide','Home-Use Guide','Safety & Escalation'];

function renderConditionTab(cond, hb, tab) {
  const relProtos = PROTOCOL_REGISTRY.filter(p => p.condition === cond.id);

  if (tab === 0) {
    // ── Clinician Handbook ──────────────────────────────────────────────────
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${evBadge(cond.ev)}
        ${cond.onLabel?.length ? `<span style="padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;background:#3b82f620;color:#60a5fa;border:1px solid #3b82f640">On-Label: ${cond.onLabel.map(esc).join(', ')}</span>` : ''}
        ${(cond.flags||[]).map(flagBadge).join('')}
      </div>
      ${docSection('ICD-10 Code', `<code style="background:var(--surface-2,rgba(255,255,255,.06));padding:2px 8px;border-radius:5px;font-family:monospace">${esc(cond.icd10)}</code>`)}
      ${docSection('Epidemiology', esc(hb?.epidemiology || 'Epidemiology data not on file.'))}
      ${docSection('Neurobiological Basis', esc(hb?.neuroBasis || 'Neurobiology data not on file.'))}
      ${docSection('Evidence & Response Data', esc(hb?.responseData || 'Response data not on file.'))}
      ${docSection('Recommended Modalities', bulletList(cond.modalities))}
      ${docSection('Cortical Targets', `<div style="display:flex;gap:6px;flex-wrap:wrap">${(cond.targets||[]).map(t=>`<code style="background:var(--surface-2,rgba(255,255,255,.06));padding:2px 8px;border-radius:5px;font-family:monospace;font-size:0.85rem">${esc(t)}</code>`).join('')}</div>`)}
      ${docSection('Recommended Assessments', `<div style="display:flex;gap:6px;flex-wrap:wrap">${(cond.assessments||[]).map(a=>`<span style="padding:2px 8px;border-radius:6px;font-size:0.78rem;background:var(--surface-2,rgba(255,255,255,.06));border:1px solid var(--border,rgba(255,255,255,.1))">${esc(a.toUpperCase())}</span>`).join('')}</div>`)}
      ${cond.notes ? docSection('Clinical Notes', `<span style="color:var(--amber-400,#fbbf24)">${esc(cond.notes)}</span>`) : ''}
    `;
  }

  if (tab === 1) {
    // ── Patient Handbook ──────────────────────────────────────────────────
    const faq = hb?.faq || [];
    return `
      ${docSection('What Is This Condition?', `<p style="margin:0">${esc(hb?.patientExplain || 'Information not available.')}</p>`)}
      ${docSection('What to Expect — Timeline', `<p style="margin:0">${esc(hb?.timeline || 'Timeline information not available.')}</p>`)}
      ${docSection('Self-Care During Treatment', bulletList(hb?.selfCare || []))}
      ${faq.length ? docSection('Frequently Asked Questions', `
        <div style="display:flex;flex-direction:column;gap:14px">
          ${faq.map(f=>`
            <div>
              <p style="margin:0 0 4px;font-weight:600;color:var(--text-primary,#e2e8f0)">${esc(f.q)}</p>
              <p style="margin:0;color:var(--text-secondary,#94a3b8)">${esc(f.a)}</p>
            </div>
          `).join('')}
        </div>
      `) : ''}
    `;
  }

  if (tab === 2) {
    // ── Protocol Reference ──────────────────────────────────────────────────
    if (!relProtos.length) return `<p style="color:var(--text-tertiary,#64748b)">No standard protocols registered for this condition.</p>`;
    return `
      <div style="display:flex;flex-direction:column;gap:14px">
        ${relProtos.map(p=>`
          <div style="background:var(--surface-1,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-radius:10px;padding:14px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
              <span style="font-weight:700;font-size:0.9rem">${esc(p.name)}</span>
              ${evBadge(p.ev)}
              ${onLabelBadge(p)}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;font-size:0.8rem;color:var(--text-secondary,#94a3b8)">
              <span><b>Modality:</b> ${esc(p.modality)}</span>
              <span><b>Target:</b> ${esc(p.target)}</span>
              <span><b>Frequency:</b> ${esc(p.freq)}</span>
              <span><b>Intensity:</b> ${esc(p.intensity)}</span>
              <span><b>Sessions:</b> ${esc(String(p.sessions))} (${esc(p.sessPerWeek)}x/wk)</span>
              <span><b>Duration:</b> ${esc(p.duration)}</span>
              <span><b>Laterality:</b> ${esc(p.laterality)}</span>
            </div>
            ${p.notes ? `<p style="margin:8px 0 0;font-size:0.8rem;color:var(--amber-400,#fbbf24)">${esc(p.notes)}</p>` : ''}
            ${HANDBOOK_DATA[p.id] ? `<button style="margin-top:10px;padding:5px 13px;border-radius:7px;font-size:0.78rem;font-weight:600;background:var(--accent,#6366f1);color:#fff;border:none;cursor:pointer" onclick="window._hbProtocol('${esc(p.id)}')">Open Protocol Handbook</button>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  if (tab === 3) {
    // ── Technician SOP ──────────────────────────────────────────────────────
    return `
      ${docSection('Technical Setup Notes', `<p style="margin:0">${esc(hb?.techSetup || 'Technical setup notes not on file.')}</p>`)}
      ${docSection('Cortical Targets', `<div style="display:flex;gap:6px;flex-wrap:wrap">${(cond.targets||[]).map(t=>`<code style="background:var(--surface-2,rgba(255,255,255,.06));padding:2px 8px;border-radius:5px;font-family:monospace;font-size:0.85rem">${esc(t)}</code>`).join('')}</div>`)}
      ${docSection('Required Safety Screens', `<div style="display:flex;gap:6px;flex-wrap:wrap">${(cond.flags||[]).length ? (cond.flags||[]).map(flagBadge).join('') : '<span style="color:var(--text-tertiary,#64748b)">No mandatory safety screens flagged.</span>'}</div>`)}
      ${docSection('Modalities Used', bulletList(cond.modalities))}
      ${docSection('Required Assessments', `
        <div style="display:flex;flex-direction:column;gap:6px">
          ${(cond.assessments||[]).map(a=>`<div style="display:flex;align-items:center;gap:8px"><span style="padding:2px 10px;border-radius:6px;font-size:0.78rem;font-family:monospace;background:var(--surface-2,rgba(255,255,255,.06));border:1px solid var(--border,rgba(255,255,255,.1))">${esc(a.toUpperCase())}</span></div>`).join('')}
        </div>
      `)}
      ${relProtos.length ? docSection('Available Protocol Templates', `
        <div style="display:flex;flex-direction:column;gap:6px">
          ${relProtos.map(p=>`<div style="font-size:0.82rem"><span style="color:var(--text-secondary,#94a3b8)">${esc(p.name)}</span> — ${esc(p.modality)}, ${esc(p.target)}, ${esc(String(p.sessions))} sessions</div>`).join('')}
        </div>
      `) : ''}
    `;
  }

  if (tab === 4) {
    // ── Patient Treatment Guide ─────────────────────────────────────────────
    return `
      <div style="background:var(--surface-1,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-radius:10px;padding:16px;margin-bottom:20px">
        <p style="margin:0;font-size:0.9rem;color:var(--text-secondary,#94a3b8)"><b>For Patients:</b> This guide explains your treatment in plain language. Please read it and bring any questions to your next appointment.</p>
      </div>
      ${docSection('Understanding Your Condition', `<p style="margin:0">${esc(hb?.patientExplain || 'Your clinician will explain your condition at your appointment.')}</p>`)}
      ${docSection('Your Treatment Timeline', `<p style="margin:0">${esc(hb?.timeline || 'Your clinician will outline your personalised treatment timeline.')}</p>`)}
      ${docSection('How to Get the Most From Treatment', bulletList(hb?.selfCare || []))}
      ${hb?.faq?.length ? docSection('Questions & Answers', `
        <div style="display:flex;flex-direction:column;gap:14px">
          ${hb.faq.map(f=>`
            <div style="background:var(--surface-2,rgba(255,255,255,.04));border-radius:8px;padding:12px">
              <p style="margin:0 0 5px;font-weight:700">${esc(f.q)}</p>
              <p style="margin:0;color:var(--text-secondary,#94a3b8)">${esc(f.a)}</p>
            </div>
          `).join('')}
        </div>
      `) : ''}
      ${docSection('When to Contact Your Clinic', `<p style="margin:0">${esc(hb?.escalation || 'If you experience any unusual symptoms, contact your clinic immediately.')}</p>`)}
    `;
  }

  if (tab === 5) {
    // ── Home-Use Guide ──────────────────────────────────────────────────────
    const hasHome = hb?.homeNote && hb.homeNote !== null;
    return `
      ${!hasHome ? `
        <div style="background:var(--surface-1,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-radius:10px;padding:16px;margin-bottom:20px">
          <p style="margin:0;color:var(--text-secondary,#94a3b8)">No home-use device protocol is registered for this condition. Home-use guidance below covers general self-care.</p>
        </div>
      ` : docSection('Home Device & Programme', `<p style="margin:0">${esc(hb.homeNote)}</p>`)}
      ${docSection('Daily Self-Care During Treatment Course', bulletList(hb?.selfCare || []))}
      ${docSection('General Home Safety Rules', bulletList([
        'Never adjust device settings without clinician approval.',
        'Stop use and contact your clinic if you experience new symptoms.',
        'Keep a daily symptom and use diary.',
        'Ensure consistent sleep schedules throughout your treatment course.',
        'Avoid alcohol during the treatment course unless clinician advises otherwise.'
      ]))}
    `;
  }

  if (tab === 6) {
    // ── Safety & Escalation ─────────────────────────────────────────────────
    return `
      <div style="background:#ef444415;border:1px solid #ef444440;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0;font-weight:700;color:#f87171;font-size:0.9rem">⚠ Safety & Escalation Protocol — Staff Use</p>
        <p style="margin:6px 0 0;font-size:0.82rem;color:#fca5a5">Review triggers below. If any are met, escalate per clinic policy.</p>
      </div>
      ${docSection('Escalation Triggers', `<p style="margin:0;color:#fca5a5">${esc(hb?.escalation || 'Follow standard clinical escalation procedures. Contact supervising clinician for any unexpected symptom changes.')}</p>`)}
      ${docSection('Required Safety Screens', `<div style="display:flex;gap:6px;flex-wrap:wrap">${(cond.flags||[]).length ? (cond.flags||[]).map(flagBadge).join('') : '<span style="color:var(--text-tertiary,#64748b)">No mandatory safety screens flagged.</span>'}</div>`)}
      ${docSection('Standard Safety Checklist', bulletList([
        'Confirm no metal implants or cardiac devices (unless cleared for specific modality).',
        'Confirm no history of seizure disorder or family history (for TMS/tDCS).',
        'Confirm no active pregnancy (for stimulation modalities).',
        'Verify baseline mood and safety at session start.',
        'Document any adverse events immediately using AE report form.',
        'Monitor for seizure signs throughout TMS session (rare but reportable).',
        'Have emergency contacts and protocols visible at workstation.'
      ]))}
      ${docSection('Emergency Contacts & Procedures', `<p style="margin:0;color:var(--text-secondary,#94a3b8)">Follow your clinic\'s emergency response protocol. Ensure the supervising clinician is contactable during all stimulation sessions. Emergency number should be posted at the treatment station.</p>`)}
    `;
  }

  return '';
}

// ── Protocol Handbook Template ────────────────────────────────────────────────

const PROTO_TABS = ['Implementation','Session Workflow','Contraindications','Expected Response','Monitoring','Follow-up'];

function renderProtocolTab(proto, hb, tab) {
  if (tab === 0) {
    return `
      <div style="background:var(--surface-1,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-radius:10px;padding:14px;margin-bottom:20px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          ${evBadge(proto.ev)}
          ${onLabelBadge(proto)}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;font-size:0.8rem;color:var(--text-secondary,#94a3b8)">
          <span><b>Modality:</b> ${esc(proto.modality)}</span>
          <span><b>Target:</b> ${esc(proto.target)}</span>
          <span><b>Frequency:</b> ${esc(proto.freq)}</span>
          <span><b>Intensity:</b> ${esc(proto.intensity)}</span>
          <span><b>Sessions:</b> ${esc(String(proto.sessions))} (${esc(proto.sessPerWeek)}x/wk)</span>
          <span><b>Duration:</b> ${esc(proto.duration)}</span>
          <span><b>Laterality:</b> ${esc(proto.laterality)}</span>
          <span><b>Condition:</b> ${esc(proto.condition)}</span>
        </div>
        ${proto.notes ? `<p style="margin:8px 0 0;font-size:0.8rem;color:var(--amber-400,#fbbf24)">${esc(proto.notes)}</p>` : ''}
      </div>
      ${docSection('Step-by-Step Implementation', numberedList(hb?.setup || []))}
    `;
  }

  if (tab === 1) {
    return docSection('Session Workflow', numberedList(hb?.sessionWorkflow || []));
  }

  if (tab === 2) {
    return `
      <div style="background:#ef444415;border:1px solid #ef444440;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0;font-weight:700;color:#f87171">⚠ Contraindications</p>
        <p style="margin:6px 0 0;font-size:0.82rem;color:#fca5a5">Screen all patients against the following before initiating this protocol.</p>
      </div>
      ${dangerList(hb?.contraindications || [])}
    `;
  }

  if (tab === 3) {
    return docSection('Expected Response & Evidence', `<p style="margin:0">${esc(hb?.expectedResponse || 'No response data on file.')}</p>`);
  }

  if (tab === 4) {
    return docSection('Monitoring Protocol', `<p style="margin:0">${esc(hb?.monitoring || 'Follow standard clinical monitoring procedures.')}</p>`);
  }

  if (tab === 5) {
    return docSection('Follow-up Plan', `<p style="margin:0">${esc(hb?.followUp || 'Follow standard discharge and follow-up procedures.')}</p>`);
  }

  return '';
}

// ── Handbook Detail View (condition or protocol) ──────────────────────────────

function renderHandbookView(el) {
  const isCondition = _view === 'condition';

  let name, subtitle, tabs, tabContent;

  if (isCondition) {
    const cond = CONDITION_REGISTRY.find(c => c.id === _id);
    if (!cond) { el.innerHTML = '<p style="padding:32px;color:var(--text-tertiary)">Condition not found.</p>'; return; }
    const hb = HANDBOOK_DATA[_id] || {};
    name     = cond.name;
    subtitle = `${cond.icd10} · ${cond.cat}`;
    tabs     = COND_TABS;
    tabContent = renderConditionTab(cond, hb, _tab);
  } else {
    const proto = PROTOCOL_REGISTRY.find(p => p.id === _id);
    if (!proto) { el.innerHTML = '<p style="padding:32px;color:var(--text-tertiary)">Protocol not found.</p>'; return; }
    const hb = HANDBOOK_DATA[_id] || {};
    name     = proto.name;
    subtitle = `${proto.modality} · ${proto.condition}`;
    tabs     = PROTO_TABS;
    tabContent = renderProtocolTab(proto, hb, _tab);
  }

  el.innerHTML = `
    <div style="padding:24px;max-width:1100px;margin:0 auto">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <button style="padding:6px 14px;border-radius:8px;font-size:0.8rem;font-weight:600;background:var(--surface-2,rgba(255,255,255,.06));color:var(--text-secondary,#94a3b8);border:1px solid var(--border,rgba(255,255,255,.1));cursor:pointer" onclick="window._hbBack()">← Back</button>
        <div style="flex:1;min-width:200px">
          <h2 style="margin:0;font-size:1.15rem;font-weight:700">${esc(name)}</h2>
          <p style="margin:3px 0 0;font-size:0.8rem;color:var(--text-tertiary,#64748b)">${esc(subtitle)}</p>
        </div>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px">
        ${tabs.map((t, i) => tab(t, i, i === _tab)).join('')}
      </div>

      <div style="background:var(--surface-1,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-radius:12px;padding:22px">
        ${tabContent}
      </div>
    </div>
  `;
}

// ── Index View ────────────────────────────────────────────────────────────────

function renderIndex(el) {
  const cats = ['All', ...new Set(CONDITION_REGISTRY.map(c => c.cat))];
  const q = _query.toLowerCase();

  const filteredConds = CONDITION_REGISTRY.filter(c => {
    const matchCat = _cat === 'All' || c.cat === _cat;
    const matchQ   = !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || c.icd10.toLowerCase().includes(q) || c.cat.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const filteredProtos = PROTOCOL_REGISTRY.filter(p => {
    if (_cat !== 'All') return false;  // protocols hidden when category filter active
    return !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.condition.toLowerCase().includes(q) || p.modality.toLowerCase().includes(q);
  });

  function condCard(c) {
    const hb = HANDBOOK_DATA[c.id];
    return `
      <div style="background:var(--surface-1,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px;cursor:pointer;transition:border-color .15s" onclick="window._hbCondition('${esc(c.id)}')" onmouseover="this.style.borderColor='var(--accent,#6366f1)'" onmouseout="this.style.borderColor='var(--border,rgba(255,255,255,.1))'">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700;font-size:0.9rem">${esc(c.name)}</span>
          ${evBadge(c.ev)}
        </div>
        <div style="font-size:0.78rem;color:var(--text-tertiary,#64748b)">${esc(c.icd10)} · ${esc(c.cat)}</div>
        ${c.onLabel?.length ? `<div style="font-size:0.76rem;color:#60a5fa">On-Label: ${c.onLabel.map(esc).join(', ')}</div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px">
          ${(c.modalities||[]).slice(0,3).map(m=>`<span style="padding:2px 7px;border-radius:6px;font-size:0.72rem;background:var(--surface-2,rgba(255,255,255,.06));border:1px solid var(--border,rgba(255,255,255,.1))">${esc(m)}</span>`).join('')}
          ${(c.modalities||[]).length > 3 ? `<span style="font-size:0.72rem;color:var(--text-tertiary,#64748b)">+${c.modalities.length-3}</span>` : ''}
        </div>
        <div style="margin-top:4px;font-size:0.72rem;color:var(--accent,#818cf8)">7 handbook types available ${hb ? '· Data complete' : '· Basic data'}</div>
      </div>
    `;
  }

  function protoCard(p) {
    const hb = HANDBOOK_DATA[p.id];
    return `
      <div style="background:var(--surface-1,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px;cursor:pointer;transition:border-color .15s" onclick="window._hbProtocol('${esc(p.id)}')" onmouseover="this.style.borderColor='var(--accent,#6366f1)'" onmouseout="this.style.borderColor='var(--border,rgba(255,255,255,.1))'">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700;font-size:0.9rem">${esc(p.name)}</span>
          ${evBadge(p.ev)}
        </div>
        <div style="font-size:0.78rem;color:var(--text-tertiary,#64748b)">${esc(p.modality)} · ${esc(p.condition)} · ${esc(p.target)}</div>
        <div style="font-size:0.76rem;color:var(--text-secondary,#94a3b8)">${esc(String(p.sessions))} sessions · ${esc(p.duration)} · ${esc(p.laterality)}</div>
        ${p.onLabel ? `<span style="font-size:0.72rem;color:#60a5fa">On-Label / FDA-Cleared</span>` : ''}
        <div style="margin-top:4px;font-size:0.72rem;color:var(--accent,#818cf8)">6 handbook sections ${hb ? '· Data complete' : '· Basic data'}</div>
      </div>
    `;
  }

  const condGrid = filteredConds.length
    ? filteredConds.map(condCard).join('')
    : `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-tertiary,#64748b)">No conditions match your search.</div>`;

  const protoSection = _cat === 'All' ? `
    <div style="margin-top:32px">
      <h3 style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-tertiary,#64748b);margin:0 0 14px">Protocol Handbooks (${filteredProtos.length})</h3>
      <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
        ${filteredProtos.length ? filteredProtos.map(protoCard).join('') : '<div style="text-align:center;padding:32px;color:var(--text-tertiary,#64748b)">No protocols match your search.</div>'}
      </div>
    </div>
  ` : '';

  el.innerHTML = `
    <div style="padding:24px;max-width:1400px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <input type="search" placeholder="Search conditions, protocols…" value="${esc(_query)}"
          style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary,#e2e8f0);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
          oninput="window._hbSearch(this.value)" />
        <span style="font-size:0.8rem;color:var(--text-tertiary,#64748b)">${filteredConds.length} conditions · ${filteredProtos.length} protocols</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px">
        ${cats.map(c => chip(c, c === _cat, `window._hbCat('${esc(c)}')`)).join('')}
      </div>
      <h3 style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-tertiary,#64748b);margin:0 0 14px">Condition Handbooks (${filteredConds.length})</h3>
      <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
        ${condGrid}
      </div>
      ${protoSection}
    </div>
  `;
}

// ── Main Export ───────────────────────────────────────────────────────────────

export async function pgHandbooks(setTopbar) {
  setTopbar('Handbooks', `
    <span style="font-size:0.8rem;color:var(--text-secondary,#94a3b8);align-self:center">53 conditions · 12 protocols · 7 handbook types each</span>
  `);

  _el = document.getElementById('content');
  if (!_el) return;

  // Reset state on each page load
  _view = 'index';
  _id   = null;
  _tab  = 0;
  _query = '';
  _cat   = 'All';

  window._hbBack      = () => { _view = 'index'; _id = null; _tab = 0; renderIndex(_el); };
  window._hbCondition = (id) => { _view = 'condition'; _id = id; _tab = 0; renderHandbookView(_el); };
  window._hbProtocol  = (id) => { _view = 'protocol'; _id = id; _tab = 0; renderHandbookView(_el); };
  window._hbTab       = (i)  => { _tab = i; renderHandbookView(_el); };
  window._hbSearch    = (v)  => { _query = v; renderIndex(_el); };
  window._hbCat       = (v)  => { _cat = v; renderIndex(_el); };

  renderIndex(_el);
}
