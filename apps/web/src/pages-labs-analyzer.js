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

function _statusRowTint(status) {
  const s = _statusKey(status);
  if (s === 'critical') return 'background:rgba(255,107,107,0.06)';
  if (s === 'high')     return 'background:rgba(255,176,87,0.05)';
  if (s === 'low')      return 'background:rgba(96,165,250,0.05)';
  return '';
}

function _topFlagPill(label, status) {
  if (!label) return '<span style="color:var(--text-tertiary)">—</span>';
  const s = _statusKey(status);
  const color = s === 'critical' ? 'var(--red)'
    : s === 'high' ? 'var(--amber)'
    : s === 'low' ? 'var(--blue)'
    : 'var(--text-secondary)';
  const prefix = s === 'critical' ? '⚠ ' : '';
  return `<span style="color:${color};font-weight:${s === 'critical' ? 700 : 500}">${prefix}${esc(label)}</span>`;
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

function _trendArrow(prev, curr) {
  if (prev == null || curr == null) return '<span style="color:var(--text-tertiary)" title="No prior result">·</span>';
  const delta = curr - prev;
  const tol = Math.max(0.05 * Math.abs(prev || 1), 0.05);
  if (Math.abs(delta) < tol) return '<span title="Stable" style="color:var(--text-tertiary)">→</span>';
  if (delta > 0) return '<span title="Rising" style="color:var(--amber)">↑</span>';
  return '<span title="Falling" style="color:var(--blue)">↓</span>';
}

function _skeletonChips(n = 5) {
  const chip = '<span style="display:inline-block;width:120px;height:24px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _errorCard(message) {
  const safe = esc(message || '');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load lab results right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">Try again</button>
  </div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No lab results recorded yet.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
      Upload a panel from a patient detail page or wait for the next HL7 ingest to populate this summary.
    </div>
  </div>`;
}

function _priorSeriesFor(prior, analyte) {
  if (!Array.isArray(prior)) return [];
  return prior
    .filter((p) => p && p.analyte === analyte && typeof p.value === 'number')
    .slice()
    .sort((a, b) => String(a.captured_at || '').localeCompare(String(b.captured_at || '')));
}

function _sparkline(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return `<svg viewBox="0 0 120 32" width="120" height="32" style="display:block" aria-hidden="true"></svg>`;
  }
  const w = 120;
  const h = 32;
  const pad = 2;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - ((p.value - min) / (max - min)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = points[points.length - 1];
  const lx = pad + (points.length - 1) * step;
  const ly = h - pad - ((last.value - min) / (max - min)) * (h - pad * 2);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;color:var(--text-secondary)" role="img" aria-label="Trend across ${points.length} captures">
    <polyline fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="1.8" fill="currentColor"/>
  </svg>`;
}

function _renderClinicTable(rows, sortKey, sortDir) {
  if (!Array.isArray(rows) || !rows.length) return _emptyClinicCard();
  const dir = sortDir === 'asc' ? 1 : -1;
  const sevRank = (r) => (r?.critical_count || 0) * 100 + (r?.abnormal_count || 0);

  const sorted = rows.slice();
  sorted.sort((a, b) => {
    if (sortKey === 'name') return String(a.patient_name || '').localeCompare(String(b.patient_name || '')) * dir;
    if (sortKey === 'captured_at') return String(a.captured_at || '').localeCompare(String(b.captured_at || '')) * dir;
    if (sortKey === 'abnormal') return (sevRank(b) - sevRank(a)) * (dir === 1 ? 1 : -1);
    return 0;
  });

  const sortInd = (k) => k === sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const th = (key, label, align = 'left') =>
    `<th data-sort-key="${esc(key)}" title="Sort by ${esc(label)}" style="padding:8px 8px;text-align:${align};font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);cursor:pointer;user-select:none">${esc(label)}${sortInd(key)}</th>`;

  const head = `<tr>
    ${th('name', 'Patient')}
    ${th('captured_at', 'Last draw')}
    ${th('abnormal', 'Abnormal', 'center')}
    <th style="padding:8px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Top flag</th>
    <th style="padding:8px 8px;text-align:right;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)"></th>
  </tr>`;

  const body = sorted.map((p) => {
    const when = p.captured_at ? new Date(p.captured_at).toLocaleDateString() : '—';
    const abnormal = p.abnormal_count || 0;
    const critical = p.critical_count || 0;
    const abCell = critical
      ? `<span style="color:var(--red);font-weight:700">${critical} crit</span><span style="color:var(--text-tertiary)"> · ${abnormal} total</span>`
      : abnormal
        ? `<span style="color:var(--amber);font-weight:600">${abnormal}</span>`
        : `<span style="color:var(--green);font-weight:500">0</span>`;
    return `<tr data-patient-id="${esc(p.patient_id)}" tabindex="0" role="button" style="cursor:pointer;min-height:44px"
      onmouseover="this.style.background='rgba(255,255,255,.03)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500">${esc(p.patient_name || 'Unknown')}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(when)}</td>
      <td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border);font-size:12px">${abCell}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px">${_topFlagPill(p.top_flag_label, p.top_flag_status)}</td>
      <td style="padding:10px;text-align:right;border-bottom:1px solid var(--border)">
        <button type="button" class="btn btn-ghost btn-sm" data-action="open-patient" data-patient-id="${esc(p.patient_id)}" style="min-height:44px">View</button>
      </td>
    </tr>`;
  }).join('');

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function _renderPanelCard(panel, prior, expandedKey) {
  const results = Array.isArray(panel?.results) ? panel.results : [];
  if (!results.length) return '';
  const rows = results.map((r) => {
    const k = `${panel.name}::${r.analyte}`;
    const series = _priorSeriesFor(prior, r.analyte);
    const valTxt = (r.value == null || r.value === '') ? '—' : `${esc(r.value)}${r.unit ? ` <span style="color:var(--text-tertiary);font-size:11px">${esc(r.unit)}</span>` : ''}`;
    const refTxt = (r.ref_low != null && r.ref_high != null) ? `${esc(r.ref_low)}–${esc(r.ref_high)}` : '—';
    const tint = _statusRowTint(r.status);
    const noteRow = r.note
      ? `<tr><td colspan="4" style="padding:0 12px 8px 12px;font-size:11px;color:var(--text-tertiary);font-style:italic;${tint}">${esc(r.note)}</td></tr>`
      : '';
    const isOpen = expandedKey === k;
    const sparkRow = isOpen
      ? `<tr><td colspan="4" style="padding:8px 12px 12px 12px;${tint}">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="font-size:11px;color:var(--text-tertiary)">Trend (${series.length} draw${series.length === 1 ? '' : 's'})</div>
            ${_sparkline(series)}
            ${series.length >= 2 ? _trendArrow(series[series.length - 2].value, series[series.length - 1].value) : ''}
          </div>
        </td></tr>`
      : '';
    return `<tr data-result-toggle="${esc(k)}" tabindex="0" role="button" style="cursor:pointer;${tint}"
        onmouseover="this.style.filter='brightness(1.06)'"
        onmouseout="this.style.filter='none'">
        <td style="padding:10px 12px;border-top:1px solid var(--border);font-weight:500;font-size:12px">${esc(r.analyte)}</td>
        <td style="padding:10px 12px;border-top:1px solid var(--border);font-size:12px;font-variant-numeric:tabular-nums">${valTxt}</td>
        <td style="padding:10px 12px;border-top:1px solid var(--border);font-size:11px;color:var(--text-secondary);font-variant-numeric:tabular-nums">${refTxt}</td>
        <td style="padding:10px 12px;border-top:1px solid var(--border);text-align:right">${_statusPill(r.status)}</td>
      </tr>${noteRow}${sparkRow}`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)">${esc(panel.name)}</div>
    <table style="width:100%;border-collapse:collapse">
      <tbody>${rows}</tbody>
    </table>
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

function _renderFlagsPanel(flags) {
  const list = Array.isArray(flags) ? flags : [];
  if (!list.length) return '';
  const cards = list.map((f) => {
    const color = _severityColor(f.severity);
    return `<div style="padding:14px;border:1px solid ${color};background:rgba(255,255,255,.02);border-radius:12px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="font-weight:600;font-size:13px">${esc(f.analyte || 'Flag')}</div>
        <div>${_severityPill(f.severity)}</div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${esc(f.mechanism || '')}</div>
      ${f.recommendation ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px"><strong style="color:var(--text-secondary)">Recommendation:</strong> ${esc(f.recommendation)}</div>` : ''}
      ${_renderRefPills(f.references)}
    </div>`;
  }).join('');
  return `<div data-flags-section style="display:flex;flex-direction:column;gap:10px">
    <div style="font-size:12px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Clinical flags</div>
    ${cards}
  </div>`;
}

function _renderAddResultForm() {
  return `<form data-result-form style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-weight:600;font-size:13px">Add lab result</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Panel
        <input name="panel" class="form-control" placeholder="e.g. CBC" required style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Analyte
        <input name="analyte" class="form-control" placeholder="e.g. Hemoglobin" required style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Value
        <input name="value" type="number" step="any" class="form-control" required style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Unit
        <input name="unit" class="form-control" placeholder="g/dL" style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Ref low
        <input name="ref_low" type="number" step="any" class="form-control" style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Ref high
        <input name="ref_high" type="number" step="any" class="form-control" style="min-height:36px"/>
      </label>
    </div>
    <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Add result</button>
    </div>
  </form>`;
}

function _renderAnnotationForm() {
  return `<form data-annotation-form style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-weight:600;font-size:13px">Add annotation</div>
    <textarea name="note" class="form-control" rows="2" placeholder="Note on this panel (e.g. interpretation, context, plan)…" style="min-height:64px;width:100%"></textarea>
    <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Save annotation</button>
    </div>
  </form>`;
}

function _renderReviewNoteForm() {
  return `<form data-review-form style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-weight:600;font-size:13px">Sign clinical review</div>
    <textarea name="note" class="form-control" rows="2" placeholder="Sign-off note (visible in audit trail as a clinician review)…" style="min-height:64px;width:100%"></textarea>
    <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Sign review</button>
    </div>
  </form>`;
}

function _renderAuditPanel(audit) {
  const items = Array.isArray(audit?.items) ? audit.items : [];
  if (!items.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Audit trail</div>
      <div style="font-size:12px;color:var(--text-tertiary)">No recomputes, annotations, or reviews recorded yet.</div>
    </div>`;
  }
  const sorted = items.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const tagFor = (k) => {
    const kind = String(k || 'event').toLowerCase();
    if (kind === 'recompute')   return '<span class="pill pill-inactive" style="font-size:10px;padding:2px 8px">Recompute</span>';
    if (kind === 'annotation')  return '<span class="pill pill-active" style="font-size:10px;padding:2px 8px">Annotation</span>';
    if (kind === 'review-note') return '<span class="pill" style="font-size:10px;padding:2px 8px;background:rgba(155,127,255,0.10);color:var(--violet,#9b7fff);border:1px solid rgba(155,127,255,0.30)">Review</span>';
    if (kind === 'result-add')  return '<span class="pill pill-pending" style="font-size:10px;padding:2px 8px">Result added</span>';
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
  const captured = profile?.captured_at ? new Date(profile.captured_at).toLocaleString() : 'No draw recorded.';
  const panels = Array.isArray(profile?.panels) ? profile.panels : [];
  const panelCards = panels.map((pn) => _renderPanelCard(pn, profile?.prior_results, expandedKey)).join('');
  const flags = _renderFlagsPanel(profile?.flags);
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0 14px;flex-wrap:wrap">
      <div style="font-size:12px;color:var(--text-tertiary)">Last draw: ${esc(captured)}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="recompute" style="min-height:44px">Recompute</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">${panelCards || '<div style="color:var(--text-tertiary);font-size:12px">No panels reported.</div>'}</div>
    ${flags ? `<div style="margin-top:18px">${flags}</div>` : ''}
    <div style="margin-top:18px;display:grid;grid-template-columns:1fr;gap:14px">
      ${_renderAddResultForm()}
      ${_renderAnnotationForm()}
      ${_renderReviewNoteForm()}
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
  const allResults = (p?.panels || []).flatMap((pn) => pn.results || []);
  const abnormal = allResults.filter((r) => r.status && r.status !== 'normal');
  const top = abnormal.find((r) => r.status === 'critical') || abnormal[0] || null;
  return {
    patient_id: p.patient_id,
    patient_name: p.patient_name,
    captured_at: p.captured_at,
    abnormal_count: abnormal.length,
    critical_count: abnormal.filter((r) => r.status === 'critical').length,
    top_flag_label: top ? `${top.analyte} ${top.value} ${top.unit || ''} — ${top.status}` : '',
    top_flag_status: top?.status || null,
  };
}

async function _loadClinicSummary() {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  const ids = personas.map((p) => p.id);
  const results = await Promise.all(
    ids.map((pid) => api.getLabsProfile(pid).then((r) => r).catch(() => null))
  );
  const patients = [];
  results.forEach((r) => {
    if (r && r.patient_id) patients.push(_summariseProfileForClinic(_enrichPatientName(r)));
  });
  return { patients };
}

export async function pgLabsAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Labs Analyzer',
      subtitle: 'Blood biomarkers · psych-med + neuromodulation safety windows',
    });
  } catch {
    try { setTopbar('Labs Analyzer', 'Blood biomarkers'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let view = 'clinic';
  let summaryCache = null;
  let activePatientId = null;
  let activePatientName = '';
  let profileCache = null;
  let auditCache = null;
  let sortKey = 'abnormal';
  let sortDir = 'desc';
  let usingFixtures = false;
  let expandedKey = '';

  el.innerHTML = `
    <div class="ds-labs-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="lb-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Lab flags surface safety windows that overlap psychiatric prescribing and neuromodulation — lithium trough, INR for ECT-day risk, TSH for treatment-resistant depression, eGFR for renal-cleared agents. Ranges are heuristic; always confirm against your local lab’s reference intervals.
      </div>
      <div id="lb-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="lb-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('lb-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function setBreadcrumb() {
    const bc = $('lb-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Clinic labs summary</span>`;
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="lb-back" style="min-height:44px">← Back to clinic</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('lb-back')?.addEventListener('click', () => {
        view = 'clinic';
        expandedKey = '';
        render();
      });
    }
  }

  async function loadClinic() {
    const body = $('lb-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    try {
      summaryCache = await _loadClinicSummary();
      if ((!summaryCache || !summaryCache.patients?.length) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.labs) {
        summaryCache = ANALYZER_DEMO_FIXTURES.labs.clinic_summary();
        usingFixtures = true;
      } else if (summaryCache && summaryCache.patients?.length) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.labs) {
        summaryCache = ANALYZER_DEMO_FIXTURES.labs.clinic_summary();
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
    const body = $('lb-body');
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
    const body = $('lb-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    try {
      const [profile, audit] = await Promise.all([
        api.getLabsProfile(activePatientId),
        api.getLabsAudit(activePatientId).catch(() => ({ items: [] })),
      ]);
      profileCache = profile;
      auditCache = audit;
      if ((!profile || !Array.isArray(profile.panels)) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.labs) {
        profileCache = ANALYZER_DEMO_FIXTURES.labs.patient_profile(activePatientId);
        auditCache = ANALYZER_DEMO_FIXTURES.labs.patient_audit(activePatientId);
        usingFixtures = true;
      } else if (profileCache) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.labs) {
        profileCache = ANALYZER_DEMO_FIXTURES.labs.patient_profile(activePatientId);
        auditCache = ANALYZER_DEMO_FIXTURES.labs.patient_audit(activePatientId);
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
    const body = $('lb-body');
    if (!body) return;
    body.innerHTML = _renderPatientDetail(profileCache, auditCache, expandedKey);
    wirePatientDetail();
  }

  function wirePatientDetail() {
    const body = $('lb-body');
    if (!body) return;

    body.querySelectorAll('[data-result-toggle]').forEach((row) => {
      const k = row.getAttribute('data-result-toggle');
      const toggle = () => {
        expandedKey = expandedKey === k ? '' : k;
        _rerenderPatient();
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
      });
    });

    body.querySelectorAll('[data-flags-section] [data-action="open-evidence"]').forEach((b) => {
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
          await api.recomputeLabs(activePatientId);
        }
        await loadPatient();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = old;
        body.insertAdjacentHTML('afterbegin', _errorCard((e && e.message) || String(e)));
      }
    });

    body.querySelector('[data-result-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const errSlot = form.querySelector('[data-form-error]');
      if (errSlot) errSlot.textContent = '';
      const fd = new FormData(form);
      const payload = {
        panel:    String(fd.get('panel') || '').trim(),
        analyte:  String(fd.get('analyte') || '').trim(),
        value:    Number(fd.get('value')),
        unit:     String(fd.get('unit') || '').trim() || null,
        ref_low:  fd.get('ref_low') !== '' ? Number(fd.get('ref_low')) : null,
        ref_high: fd.get('ref_high') !== '' ? Number(fd.get('ref_high')) : null,
      };
      if (!payload.panel || !payload.analyte || !Number.isFinite(payload.value)) {
        if (errSlot) errSlot.textContent = 'Panel, analyte and a numeric value are required.';
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Adding…';
      try {
        if (usingFixtures) {
          const status = (payload.ref_low != null && payload.value < payload.ref_low) ? 'low'
            : (payload.ref_high != null && payload.value > payload.ref_high) ? 'high'
            : 'normal';
          const newResult = {
            analyte: payload.analyte,
            value: payload.value,
            unit: payload.unit || '',
            ref_low: payload.ref_low,
            ref_high: payload.ref_high,
            status,
            captured_at: new Date().toISOString(),
          };
          const panels = Array.isArray(profileCache?.panels) ? profileCache.panels.slice() : [];
          const idx = panels.findIndex((pn) => String(pn.name).toLowerCase() === payload.panel.toLowerCase());
          if (idx >= 0) {
            panels[idx] = { ...panels[idx], results: [...(panels[idx].results || []), newResult] };
          } else {
            panels.push({ name: payload.panel, results: [newResult] });
          }
          profileCache = { ...(profileCache || {}), panels, captured_at: newResult.captured_at };
          const auditAdd = {
            id: `demo-lab-aud-${Date.now()}`,
            kind: 'result-add',
            actor: 'Dr. A. Yildirim',
            message: `Added ${newResult.analyte} ${newResult.value} ${newResult.unit || ''}`.trim(),
            created_at: newResult.captured_at,
          };
          auditCache = { ...(auditCache || {}), items: [auditAdd, ...(auditCache?.items || [])] };
        } else {
          await api.addLabResult(activePatientId, payload);
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
          submit.textContent = 'Add result';
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
            id: `demo-lab-aud-${Date.now()}`,
            kind: 'annotation',
            actor: 'Dr. A. Yildirim',
            message: note,
            created_at: new Date().toISOString(),
          };
        } else {
          added = await api.addLabsAnnotation(activePatientId, { message: note });
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

    body.querySelector('[data-review-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const errSlot = form.querySelector('[data-form-error]');
      if (errSlot) errSlot.textContent = '';
      const note = String(new FormData(form).get('note') || '').trim();
      if (!note) {
        if (errSlot) errSlot.textContent = 'Add a sign-off note before signing.';
        form.querySelector('textarea')?.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Signing…';
      try {
        let added;
        if (usingFixtures) {
          added = {
            id: `demo-lab-aud-${Date.now()}`,
            kind: 'review-note',
            actor: 'Dr. A. Yildirim',
            message: note,
            created_at: new Date().toISOString(),
          };
        } else {
          added = await api.addLabsReviewNote(activePatientId, { message: note });
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
          submit.textContent = 'Sign review';
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

export default { pgLabsAnalyzer };
