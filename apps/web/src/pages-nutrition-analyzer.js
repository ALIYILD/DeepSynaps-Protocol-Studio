import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _statusKey(s) {
  return String(s || '').toLowerCase();
}

function _statusPill(status) {
  const s = _statusKey(status);
  if (s === 'critical') {
    return '<span class="pill" style="background:rgba(255,107,107,0.16);color:var(--red);border:1px solid rgba(255,107,107,0.32);font-weight:700">⚠ Critical</span>';
  }
  if (s === 'high') {
    return '<span class="pill" style="background:rgba(255,176,87,0.14);color:var(--amber);border:1px solid rgba(255,176,87,0.30)">High</span>';
  }
  if (s === 'low') {
    return '<span class="pill" style="background:rgba(96,165,250,0.12);color:var(--blue);border:1px solid rgba(96,165,250,0.25)">Low</span>';
  }
  if (s === 'normal') {
    return '<span class="pill pill-active">Normal</span>';
  }
  return '<span class="pill pill-inactive">—</span>';
}

function _severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return 'var(--red)';
  if (s === 'major')    return 'var(--amber)';
  if (s === 'monitor')  return 'var(--blue)';
  return 'var(--text-secondary)';
}

function _severityPill(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return '<span class="pill" style="background:rgba(255,107,107,0.14);color:var(--red);border:1px solid rgba(255,107,107,0.30);font-weight:700">⚠ Critical</span>';
  if (s === 'major')    return '<span class="pill pill-pending">Major</span>';
  if (s === 'monitor')  return '<span class="pill" style="background:rgba(96,165,250,0.10);color:var(--blue);border:1px solid rgba(96,165,250,0.25)">Monitor</span>';
  return '<span class="pill pill-inactive">—</span>';
}

function _flagPill(label, status) {
  const s = _statusKey(status);
  const color = s === 'high' ? 'var(--amber)' : s === 'low' ? 'var(--blue)' : 'var(--text-secondary)';
  const bg = s === 'high' ? 'rgba(255,176,87,0.14)' : s === 'low' ? 'rgba(96,165,250,0.10)' : 'rgba(255,255,255,0.04)';
  const border = s === 'high' ? 'rgba(255,176,87,0.30)' : s === 'low' ? 'rgba(96,165,250,0.25)' : 'var(--border)';
  return `<span class="pill" style="background:${bg};color:${color};border:1px solid ${border};font-size:10.5px;padding:2px 8px;min-height:24px">${esc(label)}</span>`;
}

function _skeletonChips(n = 5) {
  const chip = '<span style="display:inline-block;width:120px;height:24px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _errorCard(message) {
  const safe = esc(message || '');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load the nutrition profile right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">Try again</button>
  </div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No nutrition logs recorded yet.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
      Patients log diet via the mobile companion app, or enter intake from a patient detail page to populate this summary.
    </div>
  </div>`;
}

function _sparkline(history) {
  if (!Array.isArray(history) || history.length < 2) {
    return `<svg viewBox="0 0 120 32" width="120" height="32" style="display:block" aria-hidden="true"></svg>`;
  }
  const w = 120;
  const h = 32;
  const pad = 2;
  let min = Math.min(...history);
  let max = Math.max(...history);
  if (min === max) { min -= 1; max += 1; }
  const step = (w - pad * 2) / (history.length - 1);
  const coords = history.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastIdx = history.length - 1;
  const lx = pad + lastIdx * step;
  const ly = h - pad - ((history[lastIdx] - min) / (max - min)) * (h - pad * 2);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;color:var(--text-secondary)" role="img" aria-label="Last ${history.length} days of intake">
    <polyline fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="1.8" fill="currentColor"/>
  </svg>`;
}

function _renderClinicTable(rows, sortKey, sortDir) {
  if (!Array.isArray(rows) || !rows.length) return _emptyClinicCard();
  const dir = sortDir === 'asc' ? 1 : -1;
  const sevRank = (r) => r?.worst_severity === 'critical' ? 3 : (r?.flags?.length ? 2 : 1);

  const sorted = rows.slice();
  sorted.sort((a, b) => {
    if (sortKey === 'name') return String(a.patient_name || '').localeCompare(String(b.patient_name || '')) * dir;
    if (sortKey === 'last_log') return String(a.last_log_day || '').localeCompare(String(b.last_log_day || '')) * dir;
    if (sortKey === 'flags') return (sevRank(b) - sevRank(a)) * (dir === 1 ? 1 : -1);
    if (sortKey === 'adherence') return ((b.adherence_pct || 0) - (a.adherence_pct || 0)) * (dir === 1 ? 1 : -1);
    return 0;
  });

  const sortInd = (k) => k === sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const th = (key, label, align = 'left') =>
    `<th data-sort-key="${esc(key)}" title="Sort by ${esc(label)}" style="padding:8px 8px;text-align:${align};font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);cursor:pointer;user-select:none">${esc(label)}${sortInd(key)}</th>`;

  const head = `<tr>
    ${th('name', 'Patient')}
    ${th('last_log', 'Last log')}
    <th style="padding:8px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Deficit / surfeit flags</th>
    ${th('adherence', 'Adherence', 'center')}
    <th style="padding:8px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Supplements</th>
    <th style="padding:8px 8px;text-align:right;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)"></th>
  </tr>`;

  const body = sorted.map((p) => {
    const when = p.last_log_day ? new Date(p.last_log_day).toLocaleDateString() : '—';
    const flags = Array.isArray(p.flags) ? p.flags : [];
    const flagsHtml = flags.length
      ? flags.map((f) => _flagPill(f.label, f.status)).join(' ')
      : '<span style="color:var(--green);font-size:11px">No flags</span>';
    const adherence = `${Math.round(p.adherence_pct || 0)}%`;
    const sevTint = p.worst_severity === 'critical'
      ? 'border-left:3px solid var(--red)'
      : (flags.length ? 'border-left:3px solid var(--amber)' : 'border-left:3px solid var(--green)');
    return `<tr data-patient-id="${esc(p.patient_id)}" tabindex="0" role="button" style="cursor:pointer;min-height:44px;${sevTint}"
      onmouseover="this.style.background='rgba(255,255,255,.03)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500">${esc(p.patient_name || 'Unknown')}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(when)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;flex-wrap:wrap;gap:4px;min-width:240px">${flagsHtml}</td>
      <td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border);font-size:12px;font-variant-numeric:tabular-nums">${esc(adherence)}</td>
      <td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(p.supplement_count ?? 0)}</td>
      <td style="padding:10px;text-align:right;border-bottom:1px solid var(--border)">
        <button type="button" class="btn btn-ghost btn-sm" data-action="open-patient" data-patient-id="${esc(p.patient_id)}" style="min-height:44px">View</button>
      </td>
    </tr>`;
  }).join('');

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function _macroBarColor(status) {
  const s = _statusKey(status);
  if (s === 'high') return 'var(--amber)';
  if (s === 'low')  return 'var(--blue)';
  return 'var(--green)';
}

function _renderMacrosPanel(macros) {
  const m = macros || {};
  const day = m.day ? new Date(m.day).toLocaleDateString() : 'Today';
  const rows = [
    ['Calories', m.calories, 'kcal'],
    ['Protein',  m.protein,  m.protein?.unit || 'g'],
    ['Carbs',    m.carbs,    m.carbs?.unit || 'g'],
    ['Fat',      m.fat,      m.fat?.unit || 'g'],
    ['Fiber',    m.fiber,    m.fiber?.unit || 'g'],
    ['Sodium',   m.sodium,   m.sodium?.unit || 'mg'],
  ];
  const bars = rows.map(([label, v, unit]) => {
    const intake = v?.intake ?? null;
    const target = v?.target ?? null;
    const status = v?.status || 'normal';
    const pct = (intake != null && target) ? Math.min(140, Math.round((intake / target) * 100)) : 0;
    const fillPct = Math.min(100, pct);
    const overPct = Math.max(0, Math.min(40, pct - 100));
    const color = _macroBarColor(status);
    const valTxt = intake != null ? `${esc(intake)}` : '—';
    const tgtTxt = target != null ? `/ ${esc(target)} ${esc(unit)}` : '';
    return `<div style="display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="font-size:12px;font-weight:500">${esc(label)}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:11px;color:var(--text-tertiary);font-variant-numeric:tabular-nums">${valTxt} ${tgtTxt} (${pct}%)</span>
          ${_statusPill(status)}
        </div>
      </div>
      <div style="height:8px;border-radius:4px;background:rgba(255,255,255,.05);overflow:hidden;position:relative">
        <div style="height:100%;width:${fillPct}%;background:${color};border-radius:4px"></div>
        ${overPct > 0 ? `<div style="position:absolute;top:0;left:${fillPct}%;height:100%;width:${overPct}%;background:repeating-linear-gradient(45deg,var(--red),var(--red) 4px,rgba(255,107,107,0.4) 4px,rgba(255,107,107,0.4) 8px)"></div>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-weight:600;font-size:13px">Macronutrients</div>
      <div style="font-size:11px;color:var(--text-tertiary)">${esc(day)}</div>
    </div>
    ${bars}
  </div>`;
}

function _renderMicrosPanel(micros, expandedKey) {
  const list = Array.isArray(micros) ? micros : [];
  if (!list.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Micronutrients</div>
      <div style="font-size:12px;color:var(--text-tertiary)">No micronutrient data available yet.</div>
    </div>`;
  }
  const head = `<tr>
    <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Nutrient</th>
    <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Intake</th>
    <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">RDI %</th>
    <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Status</th>
  </tr>`;
  const rows = list.map((m) => {
    const isOpen = expandedKey === m.key;
    const status = m.status || 'normal';
    const tint = status === 'high' ? 'background:rgba(255,176,87,0.05)'
      : status === 'low' ? 'background:rgba(96,165,250,0.05)' : '';
    const main = `<tr data-micro-toggle="${esc(m.key)}" tabindex="0" role="button" style="cursor:pointer;${tint}"
        onmouseover="this.style.filter='brightness(1.06)'"
        onmouseout="this.style.filter='none'">
        <td style="padding:10px;border-top:1px solid var(--border);font-weight:500;font-size:12px">${esc(m.label)}</td>
        <td style="padding:10px;border-top:1px solid var(--border);font-size:12px;text-align:right;font-variant-numeric:tabular-nums">${esc(m.intake)}<span style="color:var(--text-tertiary);font-size:11px"> ${esc(m.unit || '')}</span></td>
        <td style="padding:10px;border-top:1px solid var(--border);font-size:12px;text-align:right;font-variant-numeric:tabular-nums">${esc(m.rdi_pct)}%</td>
        <td style="padding:10px;border-top:1px solid var(--border);text-align:right">${_statusPill(status)}</td>
      </tr>`;
    const detail = isOpen ? `<tr><td colspan="4" style="padding:8px 12px 12px 12px;${tint}">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="font-size:11px;color:var(--text-tertiary)">Last 14 days</div>
          ${_sparkline(m.history)}
          <div style="font-size:11px;color:var(--text-tertiary)">RDI: ${esc(m.rdi)} ${esc(m.unit || '')}</div>
        </div>
      </td></tr>` : '';
    return `${main}${detail}`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)">Micronutrients</div>
    <table style="width:100%;border-collapse:collapse">
      <thead>${head}</thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _medsForPatient(patientId) {
  try {
    const meds = ANALYZER_DEMO_FIXTURES?.medication?.patient_medications?.(patientId);
    return Array.isArray(meds) ? meds : [];
  } catch { return []; }
}

function _renderSupplementsPanel(supplements, patientId) {
  const list = Array.isArray(supplements) ? supplements : [];
  const meds = _medsForPatient(patientId);
  const medNames = meds.map((m) => String(m.generic_name || m.name || '').toLowerCase());
  const items = list.length ? list.map((s) => {
    const name = String(s.name || '').toLowerCase();
    const duplicate = medNames.includes(name);
    return `<li style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;min-height:44px;align-items:center">
      <div style="display:flex;flex-direction:column;gap:2px;min-width:200px">
        <div style="font-size:12px;font-weight:500">${esc(s.name)}${duplicate ? ' <span class="pill" style="background:rgba(255,107,107,0.10);color:var(--red);border:1px solid rgba(255,107,107,0.25);font-size:10px;padding:1px 6px;margin-left:6px">⚠ duplicate of prescribed med</span>' : ''}</div>
        <div style="font-size:11px;color:var(--text-tertiary)">${esc(s.dose || '—')} · ${esc(s.frequency || '—')}</div>
        ${s.notes ? `<div style="font-size:11px;color:var(--text-secondary);font-style:italic;margin-top:2px">${esc(s.notes)}</div>` : ''}
      </div>
      <div>${s.active ? '<span class="pill pill-active">Active</span>' : '<span class="pill pill-inactive">Inactive</span>'}</div>
    </li>`;
  }).join('') : `<li style="padding:14px;font-size:12px;color:var(--text-tertiary)">No supplements recorded.</li>`;
  const medsList = meds.length ? meds.map((m) => `<li style="font-size:11px;color:var(--text-tertiary);padding:2px 0">${esc(m.name)} ${esc(m.dose || '')}</li>`).join('') : '<li style="font-size:11px;color:var(--text-tertiary)">No prescribed medications on record.</li>';
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02);display:flex;justify-content:space-between;align-items:center">
      <span>Supplements & meds-as-supplements</span>
      <span style="font-size:11px;color:var(--text-tertiary)">${list.length} active</span>
    </div>
    <ul style="list-style:none;margin:0;padding:0">${items}</ul>
    <div style="padding:10px 14px;border-top:1px solid var(--border);background:rgba(255,255,255,.01)">
      <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Cross-referenced prescribed medications</div>
      <ul style="list-style:none;margin:0;padding:0">${medsList}</ul>
    </div>
  </div>`;
}

function _renderRefPills(refs) {
  if (!Array.isArray(refs) || !refs.length) return '';
  const items = refs.map((r) => {
    const pmid = String(r.pmid || '').trim();
    if (!pmid) return '';
    const meta = [r.year, r.journal].filter(Boolean).join(' · ');
    const title = esc(r.title || '');
    const tooltip = esc([r.title, meta].filter(Boolean).join(' — ') || `PMID ${pmid}`);
    const prefill = esc(`${pmid} ${r.title || ''}`.trim());
    const pubmed = `https://pubmed.ncbi.nlm.nih.gov/${esc(pmid)}/`;
    return `<span style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;margin:2px 8px 2px 0">
      <span style="font-size:11px;color:var(--text-tertiary);max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${tooltip}">${title}${meta ? ` <span style="opacity:.7">(${esc(meta)})</span>` : ''}</span>
      <button type="button" class="pill" data-action="open-evidence" data-prefill="${prefill}"
        title="Search this PMID in the local 87k evidence corpus"
        style="background:rgba(155,127,255,0.10);color:var(--violet,#9b7fff);border:1px solid rgba(155,127,255,0.30);cursor:pointer;font-size:10.5px;min-height:24px;padding:2px 8px">📚 87k evidence</button>
      <a class="pill" href="${pubmed}" target="_blank" rel="noopener noreferrer"
        title="Open PMID ${esc(pmid)} on PubMed (new tab)"
        style="background:rgba(45,212,191,0.10);color:var(--teal);border:1px solid rgba(45,212,191,0.30);text-decoration:none;font-size:10.5px;min-height:24px;padding:2px 8px">🔗 PubMed</a>
    </span>`;
  }).filter(Boolean).join('');
  if (!items) return '';
  return `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.4px">References</div>
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:2px">${items}</div>
  </div>`;
}

function _renderInteractionsPanel(interactions) {
  const list = Array.isArray(interactions) ? interactions : [];
  if (!list.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Diet ↔ medication interactions</div>
      <div style="font-size:12px;color:var(--text-tertiary)">No diet-drug interactions flagged.</div>
    </div>`;
  }
  const cards = list.map((f) => {
    const color = _severityColor(f.severity);
    return `<div style="padding:14px;border:1px solid ${color};background:rgba(255,255,255,.02);border-radius:12px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="font-weight:600;font-size:13px">${esc(f.title || 'Interaction')}</div>
        <div>${_severityPill(f.severity)}</div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${esc(f.mechanism || '')}</div>
      ${f.recommendation ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px"><strong style="color:var(--text-secondary)">Recommendation:</strong> ${esc(f.recommendation)}</div>` : ''}
      ${_renderRefPills(f.references)}
    </div>`;
  }).join('');
  return `<div data-interactions-section style="display:flex;flex-direction:column;gap:10px">
    <div style="font-size:12px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Diet ↔ medication interactions</div>
    ${cards}
  </div>`;
}

function _renderIntakeForm() {
  const today = new Date().toISOString().slice(0, 10);
  return `<form data-intake-form style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-weight:600;font-size:13px">Add intake</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Day
        <input name="log_day" type="date" class="form-control" value="${esc(today)}" required style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Calories (kcal)
        <input name="calories_kcal" type="number" step="any" class="form-control" style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Protein (g)
        <input name="protein_g" type="number" step="any" class="form-control" style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Carbs (g)
        <input name="carbs_g" type="number" step="any" class="form-control" style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Fat (g)
        <input name="fat_g" type="number" step="any" class="form-control" style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Fiber (g)
        <input name="fiber_g" type="number" step="any" class="form-control" style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Sodium (mg)
        <input name="sodium_mg" type="number" step="any" class="form-control" style="min-height:36px"/>
      </label>
    </div>
    <textarea name="notes" class="form-control" rows="2" placeholder="Optional notes (e.g. main meal, supplement taken)…" style="min-height:48px;width:100%"></textarea>
    <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Add intake</button>
    </div>
  </form>`;
}

function _renderAnnotationForm() {
  return `<form data-annotation-form style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-weight:600;font-size:13px">Add annotation</div>
    <textarea name="note" class="form-control" rows="2" placeholder="Clinical note (e.g. counsel on caffeine cap, request food diary, escalate vit-D)…" style="min-height:64px;width:100%"></textarea>
    <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Save annotation</button>
    </div>
  </form>`;
}

function _renderAuditPanel(audit) {
  const items = Array.isArray(audit?.items) ? audit.items : [];
  if (!items.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Audit trail</div>
      <div style="font-size:12px;color:var(--text-tertiary)">No recomputes, intakes, or annotations recorded yet.</div>
    </div>`;
  }
  const sorted = items.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const tagFor = (k) => {
    const kind = String(k || 'event').toLowerCase();
    if (kind === 'recompute')      return '<span class="pill pill-inactive" style="font-size:10px;padding:2px 8px">Recompute</span>';
    if (kind === 'annotation')     return '<span class="pill pill-active" style="font-size:10px;padding:2px 8px">Annotation</span>';
    if (kind === 'diet-log')       return '<span class="pill pill-pending" style="font-size:10px;padding:2px 8px">Intake</span>';
    if (kind === 'supplement-add') return '<span class="pill" style="font-size:10px;padding:2px 8px;background:rgba(155,127,255,0.10);color:var(--violet,#9b7fff);border:1px solid rgba(155,127,255,0.30)">Supplement</span>';
    return '<span class="pill pill-inactive" style="font-size:10px;padding:2px 8px">Event</span>';
  };
  const rows = sorted.map((it) => {
    const when = it.created_at ? new Date(it.created_at).toLocaleString() : '—';
    return `<li style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;flex-direction:column;gap:2px">
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:8px;align-items:center">${tagFor(it.kind)}<span style="color:var(--text-tertiary);font-size:11px">${esc(it.actor || '—')}</span></div>
        <span style="color:var(--text-tertiary);white-space:nowrap;font-size:11px">${esc(when)}</span>
      </div>
      <div style="color:var(--text-secondary);line-height:1.5">${esc(it.message || '')}</div>
    </li>`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Audit trail</div>
    <ul style="list-style:none;margin:0;padding:0">${rows}</ul>
  </div>`;
}

function _renderPatientDetail(profile, audit, expandedKey) {
  const captured = profile?.captured_at ? new Date(profile.captured_at).toLocaleString() : 'No log recorded.';
  const macros = _renderMacrosPanel(profile?.macros);
  const micros = _renderMicrosPanel(profile?.micronutrients, expandedKey);
  const supplements = _renderSupplementsPanel(profile?.supplements, profile?.patient_id);
  const interactions = _renderInteractionsPanel(profile?.interactions);
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0 14px;flex-wrap:wrap">
      <div style="font-size:12px;color:var(--text-tertiary)">Last log: ${esc(captured)}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="recompute" style="min-height:44px">Recompute</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr;gap:14px">
      ${macros}
      ${micros}
      ${supplements}
    </div>
    ${interactions ? `<div style="margin-top:18px">${interactions}</div>` : ''}
    <div style="margin-top:18px;display:grid;grid-template-columns:1fr;gap:14px">
      ${_renderIntakeForm()}
      ${_renderAnnotationForm()}
      ${_renderAuditPanel(audit)}
    </div>`;
}

function _enrichPatientName(p) {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  if (p.patient_name) return p;
  const match = personas.find((x) => x.id === p.patient_id);
  return { ...p, patient_name: match ? match.name : p.patient_id };
}

function _summariseProfileForClinic(p) {
  const flags = [];
  (p.micronutrients || []).forEach((m) => {
    if (m.status === 'low')  flags.push({ label: `${m.label} low`,  status: 'low' });
    if (m.status === 'high') flags.push({ label: `${m.label} high`, status: 'high' });
  });
  const macros = p.macros || {};
  ['fiber', 'sodium'].forEach((k) => {
    const v = macros[k];
    if (v && v.status === 'low')  flags.push({ label: `${k} low`,  status: 'low' });
    if (v && v.status === 'high') flags.push({ label: `${k} high`, status: 'high' });
  });
  const supplementCount = (p.supplements || []).length;
  const log = Array.isArray(p.daily_log) ? p.daily_log : [];
  const lastLogDay = log[0]?.day || (p.captured_at ? p.captured_at.slice(0, 10) : null);
  const adherencePct = log.length ? Math.min(100, Math.round((log.length / 3) * 100)) : 0;
  const critical = (p.interactions || []).some((i) => i.severity === 'critical');
  return {
    patient_id: p.patient_id,
    patient_name: p.patient_name,
    last_log_day: lastLogDay,
    flags: flags.slice(0, 4),
    supplement_count: supplementCount,
    adherence_pct: adherencePct,
    worst_severity: critical ? 'critical' : (flags.length ? 'monitor' : 'green'),
  };
}

async function _loadClinicSummary() {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  const ids = personas.map((p) => p.id);
  const results = await Promise.all(
    ids.map((pid) => api.getNutritionProfile(pid).then((r) => r).catch(() => null))
  );
  const patients = [];
  results.forEach((r) => {
    if (r && r.patient_id) patients.push(_summariseProfileForClinic(_enrichPatientName(r)));
  });
  return { patients };
}

export async function pgNutritionAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Nutrition Analyzer',
      subtitle: 'Diet · supplements · diet-drug interactions',
    });
  } catch {
    try { setTopbar('Nutrition Analyzer', 'Diet · supplements · diet-drug interactions'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let view = 'clinic';
  let summaryCache = null;
  let activePatientId = null;
  let activePatientName = '';
  let profileCache = null;
  let auditCache = null;
  let sortKey = 'flags';
  let sortDir = 'desc';
  let usingFixtures = false;
  let expandedKey = '';

  el.innerHTML = `
    <div class="ds-nutrition-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="nu-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Diet, supplements and micronutrient cover for patients on psychiatric pharmacology and neuromodulation. Flags surface vitamin / mineral deficits that blunt antidepressant response, supplement-drug bleed risk on warfarin / NSAID, and food-drug interactions (vitamin K + warfarin, caffeine + bupropion + rTMS). Decision-support only — confirm against your local prescribing & dietetic policy.
      </div>
      <div id="nu-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="nu-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('nu-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function setBreadcrumb() {
    const bc = $('nu-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Clinic nutrition summary</span>`;
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="nu-back" style="min-height:44px">← Back to clinic</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('nu-back')?.addEventListener('click', () => {
        view = 'clinic';
        expandedKey = '';
        render();
      });
    }
  }

  async function loadClinic() {
    const body = $('nu-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    try {
      summaryCache = await _loadClinicSummary();
      if ((!summaryCache || !summaryCache.patients?.length) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.nutrition) {
        summaryCache = ANALYZER_DEMO_FIXTURES.nutrition.clinic_summary();
        usingFixtures = true;
      } else if (summaryCache && summaryCache.patients?.length) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.nutrition) {
        summaryCache = ANALYZER_DEMO_FIXTURES.nutrition.clinic_summary();
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadClinic);
        return;
      }
    }
    _syncDemoBanner();
    body.innerHTML = _renderClinicTable(summaryCache?.patients || [], sortKey, sortDir);
    body.querySelectorAll('[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const k = th.getAttribute('data-sort-key');
        if (k === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = k; sortDir = k === 'name' ? 'asc' : 'desc'; }
        body.innerHTML = _renderClinicTable(summaryCache?.patients || [], sortKey, sortDir);
        wireClinicRows();
      });
    });
    wireClinicRows();
  }

  function wireClinicRows() {
    const body = $('nu-body');
    body?.querySelectorAll('tr[data-patient-id]').forEach((tr) => {
      const pid = tr.getAttribute('data-patient-id');
      const open = () => {
        const p = (summaryCache?.patients || []).find((x) => x.patient_id === pid);
        activePatientId = pid;
        activePatientName = p?.patient_name || pid;
        view = 'patient';
        expandedKey = '';
        render();
      };
      tr.addEventListener('click', (ev) => {
        if (ev.target?.closest && ev.target.closest('[data-action]')) return;
        open();
      });
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
    body?.querySelectorAll('[data-action="open-patient"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const pid = btn.getAttribute('data-patient-id');
        const p = (summaryCache?.patients || []).find((x) => x.patient_id === pid);
        activePatientId = pid;
        activePatientName = p?.patient_name || pid;
        view = 'patient';
        expandedKey = '';
        render();
      });
    });
  }

  async function loadPatient() {
    const body = $('nu-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    try {
      const [profile, audit] = await Promise.all([
        api.getNutritionProfile(activePatientId),
        api.getNutritionAudit(activePatientId).catch(() => ({ items: [] })),
      ]);
      profileCache = profile;
      auditCache = audit;
      if ((!profile || !profile.macros) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.nutrition) {
        profileCache = ANALYZER_DEMO_FIXTURES.nutrition.patient_profile(activePatientId);
        auditCache = ANALYZER_DEMO_FIXTURES.nutrition.patient_audit(activePatientId);
        usingFixtures = true;
      } else if (profileCache) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.nutrition) {
        profileCache = ANALYZER_DEMO_FIXTURES.nutrition.patient_profile(activePatientId);
        auditCache = ANALYZER_DEMO_FIXTURES.nutrition.patient_audit(activePatientId);
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
        return;
      }
    }
    _syncDemoBanner();
    body.innerHTML = _renderPatientDetail(profileCache, auditCache, expandedKey);
    wirePatientDetail();
  }

  function _rerenderPatient() {
    const body = $('nu-body');
    if (!body) return;
    body.innerHTML = _renderPatientDetail(profileCache, auditCache, expandedKey);
    wirePatientDetail();
  }

  function wirePatientDetail() {
    const body = $('nu-body');
    if (!body) return;

    body.querySelectorAll('[data-micro-toggle]').forEach((row) => {
      const k = row.getAttribute('data-micro-toggle');
      const toggle = () => {
        expandedKey = expandedKey === k ? '' : k;
        _rerenderPatient();
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
      });
    });

    body.querySelectorAll('[data-interactions-section] [data-action="open-evidence"]').forEach((b) => {
      b.addEventListener('click', () => {
        const prefill = b.getAttribute('data-prefill') || '';
        try {
          window._reEvidencePrefill = prefill;
          window._resEvidenceTab = 'search';
        } catch {}
        try { navigate?.('research-evidence'); } catch {}
      });
    });

    body.querySelector('[data-action="recompute"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Recomputing…';
      try {
        if (!usingFixtures) {
          await api.recomputeNutrition(activePatientId);
        }
        await loadPatient();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = old;
        body.insertAdjacentHTML('afterbegin', _errorCard((e && e.message) || String(e)));
      }
    });

    body.querySelector('[data-intake-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const errSlot = form.querySelector('[data-form-error]');
      if (errSlot) errSlot.textContent = '';
      const fd = new FormData(form);
      const day = String(fd.get('log_day') || '').trim();
      if (!day) {
        if (errSlot) errSlot.textContent = 'Day is required.';
        return;
      }
      const numOrNull = (k) => {
        const raw = fd.get(k);
        if (raw === null || raw === '') return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      };
      const payload = {
        log_day: day,
        calories_kcal: numOrNull('calories_kcal'),
        protein_g: numOrNull('protein_g'),
        carbs_g: numOrNull('carbs_g'),
        fat_g: numOrNull('fat_g'),
        fiber_g: numOrNull('fiber_g'),
        sodium_mg: numOrNull('sodium_mg'),
        notes: String(fd.get('notes') || '').trim() || null,
      };
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Adding…';
      try {
        if (usingFixtures) {
          const log = Array.isArray(profileCache?.daily_log) ? profileCache.daily_log.slice() : [];
          log.unshift({
            day: payload.log_day,
            calories_kcal: payload.calories_kcal,
            protein_g: payload.protein_g,
            carbs_g: payload.carbs_g,
            fat_g: payload.fat_g,
            fiber_g: payload.fiber_g,
            sodium_mg: payload.sodium_mg,
          });
          profileCache = { ...(profileCache || {}), daily_log: log, captured_at: new Date().toISOString() };
          const auditAdd = {
            id: `demo-nut-aud-${Date.now()}`,
            kind: 'diet-log',
            actor: 'Dr. A. Yildirim',
            message: `Logged intake for ${payload.log_day}.`,
            created_at: new Date().toISOString(),
          };
          auditCache = { ...(auditCache || {}), items: [auditAdd, ...(auditCache?.items || [])] };
        } else {
          await api.addNutritionIntake(activePatientId, payload);
          await loadPatient();
          return;
        }
        form.reset();
        _rerenderPatient();
      } catch (e) {
        if (errSlot) errSlot.textContent = (e && e.message) || String(e);
      } finally {
        if (submit && submit.isConnected) {
          submit.disabled = false;
          submit.textContent = 'Add intake';
        }
      }
    });

    body.querySelector('[data-annotation-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const errSlot = form.querySelector('[data-form-error]');
      if (errSlot) errSlot.textContent = '';
      const note = String(new FormData(form).get('note') || '').trim();
      if (!note) {
        if (errSlot) errSlot.textContent = 'Add a short clinical note before saving.';
        form.querySelector('textarea')?.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Saving…';
      try {
        let added;
        if (usingFixtures) {
          added = {
            id: `demo-nut-aud-${Date.now()}`,
            kind: 'annotation',
            actor: 'Dr. A. Yildirim',
            message: note,
            created_at: new Date().toISOString(),
          };
        } else {
          added = await api.addNutritionAnnotation(activePatientId, { note });
        }
        const items = Array.isArray(auditCache?.items) ? auditCache.items.slice() : [];
        items.unshift(added);
        auditCache = { ...(auditCache || {}), items };
        form.reset();
        _rerenderPatient();
      } catch (e) {
        if (errSlot) errSlot.textContent = (e && e.message) || String(e);
      } finally {
        if (submit && submit.isConnected) {
          submit.disabled = false;
          submit.textContent = 'Save annotation';
        }
      }
    });
  }

  function render() {
    setBreadcrumb();
    if (view === 'clinic') loadClinic();
    else loadPatient();
  }

  render();
}

export default { pgNutritionAnalyzer };
