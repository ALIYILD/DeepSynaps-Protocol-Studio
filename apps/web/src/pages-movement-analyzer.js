/**
 * Movement Analyzer — multimodal motor biomarker workspace (decision-support).
 *
 * API:
 *   GET  /api/v1/movement/analyzer/patient/{patient_id}
 *   POST /api/v1/movement/analyzer/patient/{patient_id}/recompute
 *   POST /api/v1/movement/analyzer/patient/{patient_id}/annotation
 *   GET  /api/v1/movement/analyzer/patient/{patient_id}/audit
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import {
  ANALYZER_DEMO_FIXTURES,
  DEMO_FIXTURE_BANNER_HTML,
} from './demo-fixtures-analyzers.js';
import { buildMovementAnalyzerDemoPayload } from './demo-fixtures-movement-analyzer.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _pct(x) {
  if (x == null || Number.isNaN(Number(x))) return '—';
  return `${Math.round(Number(x) * 100)}%`;
}

function _concernPill(concern) {
  const c = String(concern || '').toLowerCase();
  if (c === 'worsening') return '<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Worsening</span>';
  if (c === 'improving') return '<span class="pill pill-active">Improving</span>';
  if (c === 'stable') return '<span class="pill pill-review">Stable</span>';
  return '<span class="pill pill-inactive">Unclear</span>';
}

function _snapCards(payload) {
  const snap = payload?.snapshot || {};
  const axes = snap.axes || {};
  const order = [
    ['tremor', 'Tremor burden'],
    ['gait', 'Gait / mobility'],
    ['bradykinesia', 'Bradykinesia'],
    ['dyskinesia', 'Dyskinesia / fluctuation'],
    ['posture_balance', 'Posture / balance'],
    ['activity', 'Activity'],
  ];
  const cells = order.map(([key, label]) => {
    const ax = axes[key] || {};
    const lvl = esc(ax.level || ax.label || '—');
    const conf = ax.confidence != null ? _pct(ax.confidence) : '—';
    return `<div style="padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-tertiary);margin-bottom:6px">${esc(label)}</div>
      <div style="font-weight:600;font-size:13px;margin-bottom:4px">${lvl}</div>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.4">${esc(ax.label || '')}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px">Confidence: ${conf}</div>
    </div>`;
  }).join('');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">${cells}</div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:14px;font-size:12px">
      <span style="color:var(--text-tertiary)">Overall:</span> ${_concernPill(snap.overall_concern)}
      <span style="color:var(--text-tertiary)">Completeness:</span> <strong>${_pct(snap.data_completeness)}</strong>
      <span style="color:var(--text-tertiary)">Review confidence:</span> <strong>${_pct(snap.overall_confidence)}</strong>
    </div>`;
}

function _sourcesPanel(sources) {
  const rows = (Array.isArray(sources) ? sources : []).map((s) => {
    const mod = esc(s.source_modality || '—');
    const comp = s.completeness_0_1 != null ? _pct(s.completeness_0_1) : '—';
    const conf = s.confidence != null ? _pct(s.confidence) : '—';
    const qc = Array.isArray(s.qc_flags) && s.qc_flags.length
      ? esc(s.qc_flags.join(', '))
      : '—';
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px">${mod}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(s.upstream_analyzer || '')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:11px">${comp}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:11px">${conf}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-tertiary)">${qc}</td>
    </tr>`;
  }).join('');
  return `<div style="overflow:auto;border:1px solid var(--border);border-radius:12px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr>
        <th style="text-align:left;padding:8px 10px;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Modality</th>
        <th style="text-align:left;padding:8px 10px;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Source</th>
        <th style="text-align:left;padding:8px 10px;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Coverage</th>
        <th style="text-align:left;padding:8px 10px;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Conf.</th>
        <th style="text-align:left;padding:8px 10px;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">QC</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="padding:12px;color:var(--text-tertiary)">No sources</td></tr>'}</tbody>
    </table>
  </div>`;
}

function _domainsPanel(domains) {
  if (!domains || typeof domains !== 'object') return '<p style="color:var(--text-tertiary);font-size:12px">No domain metrics.</p>';
  const blocks = Object.entries(domains).map(([dom, rows]) => {
    const list = (Array.isArray(rows) ? rows : []).map((r) => {
      const val = r.value != null ? `${esc(String(r.value))} ${esc(r.unit || '')}` : '—';
      return `<li style="margin-bottom:8px;font-size:12px;line-height:1.45">
        <strong>${esc(r.metric_key || '')}</strong> · ${val}
        ${r.note ? `<span style="color:var(--text-secondary)"> — ${esc(r.note)}</span>` : ''}
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">Completeness ${_pct(r.completeness)} · Confidence ${_pct(r.confidence)}</div>
      </li>`;
    }).join('');
    return `<div style="margin-bottom:14px">
      <div style="font-weight:600;font-size:12px;margin-bottom:6px;text-transform:capitalize">${esc(dom.replace(/_/g, ' '))}</div>
      <ul style="margin:0;padding-left:18px">${list || '<li style="color:var(--text-tertiary)">No metrics</li>'}</ul>
    </div>`;
  }).join('');
  return blocks;
}

function _flagsPanel(flags, evidence) {
  const evMap = new Map((Array.isArray(evidence) ? evidence : []).map((e) => [e.id, e]));
  const items = (Array.isArray(flags) ? flags : []).map((f) => {
    const evIds = Array.isArray(f.evidence_link_ids) ? f.evidence_link_ids : [];
    const evSnippets = evIds.map((id) => evMap.get(id)).filter(Boolean);
    const evHtml = evSnippets.length
      ? `<div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(155,127,255,0.06);font-size:11px;line-height:1.45">
          ${evSnippets.map((e) => `<div style="margin-bottom:6px"><strong>${esc(e.title || '')}</strong> — ${esc(e.snippet || '')}</div>`).join('')}
        </div>`
      : '';
    return `<div style="padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;background:var(--bg-card)">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div style="font-weight:600;font-size:13px">${esc(f.title || '')}</div>
        <span class="pill pill-pending" style="font-size:10px">${esc(f.urgency || 'routine')}</span>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;line-height:1.45">${esc(f.detail || '')}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px">Confidence ${_pct(f.confidence)} · ${esc(f.movement_domain || '')}</div>
      ${evHtml}
    </div>`;
  }).join('');
  return items || '<p style="font-size:12px;color:var(--text-tertiary)">No automated flags for this patient.</p>';
}

function _multimodalPanel(links, navigate) {
  const rows = (Array.isArray(links) ? links : []).map((l) => {
    const id = esc(l.analyzer_id || '');
    return `<button type="button" class="btn btn-ghost btn-sm" data-nav-page="${id}" style="min-height:44px;text-align:left">
      <span style="font-weight:600">${esc(l.label || l.analyzer_id)}</span>
      <span style="display:block;font-size:11px;color:var(--text-secondary);font-weight:400">${esc(l.relation || '')}</span>
    </button>`;
  }).join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:8px">${rows || '<span style="font-size:12px;color:var(--text-tertiary)">No links</span>'}</div>`;
}

function _auditPanel(items) {
  const rows = (Array.isArray(items) ? items : []).map((a) => `<tr>
    <td style="padding:8px;font-size:11px;color:var(--text-tertiary);white-space:nowrap">${esc(a.created_at || '')}</td>
    <td style="padding:8px;font-size:12px">${esc(a.action || '')}</td>
    <td style="padding:8px;font-size:11px;color:var(--text-secondary)">${esc(a.actor_id || '—')}</td>
  </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>
      <th style="text-align:left;padding:8px;font-size:10px;color:var(--text-tertiary)">When</th>
      <th style="text-align:left;padding:8px;font-size:10px;color:var(--text-tertiary)">Action</th>
      <th style="text-align:left;padding:8px;font-size:10px;color:var(--text-tertiary)">Actor</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="3" style="padding:8px;color:var(--text-tertiary)">No audit entries yet.</td></tr>'}</tbody>
  </table>`;
}

function _errorCard(msg) {
  const safe = esc(msg || 'Unable to load Movement Analyzer.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry">Try again</button>
  </div>`;
}

export async function pgMovementAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Movement Analyzer',
      subtitle: 'Motor biomarkers • multimodal • longitudinal context',
    });
  } catch {
    try { setTopbar('Movement Analyzer', 'Motor biomarkers'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let patientList = [];
  let activePatientId = null;
  let activePatientName = '';
  let payloadCache = null;
  let usingFixtures = false;

  el.innerHTML = `
    <div class="ds-movement-analyzer-shell" style="max-width:960px;margin:0 auto;padding:16px 20px 48px">
      <div id="ma-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support only.</strong>
        Does not replace in-person neurological examination or validated rating scales. All outputs require clinician judgment.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px">
        <label style="font-size:12px;color:var(--text-tertiary);display:flex;align-items:center;gap:8px">
          Patient
          <select id="ma-patient-select" class="form-control" style="min-width:220px;min-height:44px"></select>
        </label>
        <button type="button" class="btn btn-primary btn-sm" id="ma-load" style="min-height:44px">Load workspace</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ma-recompute" style="min-height:44px">Recompute</button>
      </div>
      <div id="ma-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('ma-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  async function loadPatientList() {
    try {
      const res = await api.listPatients({ limit: 200 });
      patientList = res?.items || (Array.isArray(res) ? res : []) || [];
      if ((!patientList || patientList.length === 0) && isDemoSession()) {
        patientList = ANALYZER_DEMO_FIXTURES.patients || [];
        usingFixtures = true;
      }
    } catch {
      if (isDemoSession()) {
        patientList = ANALYZER_DEMO_FIXTURES.patients || [];
        usingFixtures = true;
      } else {
        patientList = [];
      }
    }
    const sel = $('ma-patient-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select a patient…</option>'
      + patientList.map((p) => {
        const id = p.id || p.patient_id;
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
          || p.name
          || id;
        return `<option value="${esc(id)}">${esc(name)}</option>`;
      }).join('');
    _syncDemoBanner();
  }

  function wireMultimodal(navigate, root) {
    root?.querySelectorAll('[data-nav-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.getAttribute('data-nav-page');
        if (page) try { navigate?.(page); } catch {}
      });
    });
  }

  function renderPayload(payload) {
    const body = $('ma-body');
    if (!body) return;
    const disclaimer = esc(payload.clinical_disclaimer || '');
    const interp = payload.clinical_interpretation || {};
    const hyp = Array.isArray(interp.hypotheses) ? interp.hypotheses : [];
    const hypHtml = hyp.map((h) => `<div style="padding:10px;border-left:3px solid rgba(155,127,255,0.5);margin-bottom:8px;font-size:12px;line-height:1.5">
      <div style="font-weight:600;margin-bottom:4px">${esc(h.kind || '')} · ${_pct(h.confidence)}</div>
      <div style="color:var(--text-secondary)">${esc(h.statement || '')}</div>
      ${h.caveat ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(h.caveat)}</div>` : ''}
    </div>`).join('');

    body.innerHTML = `
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px">${disclaimer}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;line-height:1.5">${esc(payload.snapshot?.phenotype_summary || '')}</div>

      <section style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Movement snapshot</h3>
        ${_snapCards(payload)}
      </section>

      <section style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Signal sources</h3>
        ${_sourcesPanel(payload.signal_sources)}
      </section>

      <section style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Domains</h3>
        ${_domainsPanel(payload.domains)}
      </section>

      <section style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Trend & baseline</h3>
        ${payload.baseline
      ? `<div style="font-size:12px;line-height:1.5;color:var(--text-secondary)">
            Baseline window: ${esc(payload.baseline.window_used?.start || '')} → ${esc(payload.baseline.window_used?.end || '')}.
            Method: ${esc(payload.baseline.method || '')} · ${_pct(payload.baseline.confidence)}
          </div>`
      : '<p style="font-size:12px;color:var(--text-tertiary)">Baseline not yet established for this patient.</p>'}
        ${Array.isArray(payload.deviations) && payload.deviations.length
      ? `<ul style="margin:10px 0 0;padding-left:18px;font-size:12px">${payload.deviations.map((d) => `<li>${esc(d.domain)} — ${esc(d.direction || '')} (${_pct(d.confidence)})</li>`).join('')}</ul>`
      : ''}
      </section>

      <section style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Interpretation support</h3>
        ${hypHtml || `<p style="font-size:12px;color:var(--text-secondary)">${esc(interp.summary || '')}</p>`}
      </section>

      <section style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Flags & evidence</h3>
        ${_flagsPanel(payload.flags, payload.evidence_links)}
      </section>

      <section style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Recommendations</h3>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.5">
          ${(Array.isArray(payload.recommendations) ? payload.recommendations : []).map((r) => `<li style="margin-bottom:6px"><strong>${esc(r.kind || '')}</strong> — ${esc(r.rationale || '')} <span style="color:var(--text-tertiary)">(${esc(r.priority || '')})</span></li>`).join('') || '<li style="color:var(--text-tertiary)">None</li>'}
        </ul>
      </section>

      <section style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Multimodal connections</h3>
        <div id="ma-multi-slot">${_multimodalPanel(payload.multimodal_links, navigate)}</div>
      </section>

      <section style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Clinician note</h3>
        <form id="ma-note-form" style="display:flex;flex-direction:column;gap:8px;max-width:520px">
          <textarea class="form-control" name="note" rows="3" placeholder="Add a chart-ready note (audited)…" style="min-height:88px"></textarea>
          <button type="submit" class="btn btn-primary btn-sm" style="align-self:flex-start;min-height:44px">Save note</button>
        </form>
      </section>

      <section>
        <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Audit trail</h3>
        <div style="border:1px solid var(--border);border-radius:12px;padding:8px;background:var(--bg-card)">
          ${_auditPanel(payload.audit_tail)}
        </div>
      </section>
    `;

    wireMultimodal(navigate, body);
    body.querySelector('#ma-note-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!activePatientId) return;
      const fd = new FormData(ev.currentTarget);
      const note = String(fd.get('note') || '').trim();
      if (!note) return;
      const btn = ev.currentTarget.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        if (usingFixtures && isDemoSession()) {
          /* no-op */
        } else {
          await api.annotateMovementAnalyzer(activePatientId, { note });
        }
        ev.currentTarget.reset();
        await refreshWorkspace(false);
      } catch (e) {
        alert((e && e.message) || String(e));
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function refreshWorkspace(showSkeleton = true) {
    const body = $('ma-body');
    if (!activePatientId) {
      if (body) body.innerHTML = '<p style="color:var(--text-tertiary);font-size:13px">Select a patient to load the movement workspace.</p>';
      return;
    }
    if (showSkeleton && body) {
      body.innerHTML = '<div style="padding:24px;color:var(--text-tertiary)">Loading…</div>';
    }
    try {
      let data = await api.getMovementAnalyzer(activePatientId);
      if ((!data || !data.patient_id) && isDemoSession()) {
        data = buildMovementAnalyzerDemoPayload(activePatientId);
        data.audit_tail = [];
        usingFixtures = true;
      } else if (data?.demo && isDemoSession()) {
        usingFixtures = true;
      }
      payloadCache = data;
      _syncDemoBanner();
      renderPayload(data);
    } catch (e) {
      if (isDemoSession()) {
        const data = buildMovementAnalyzerDemoPayload(activePatientId);
        usingFixtures = true;
        _syncDemoBanner();
        renderPayload(data);
        return;
      }
      if (body) body.innerHTML = _errorCard((e && e.message) || String(e));
      body?.querySelector('[data-action="retry"]')?.addEventListener('click', () => refreshWorkspace());
    }
  }

  $('ma-load')?.addEventListener('click', () => {
    const sel = $('ma-patient-select');
    activePatientId = sel?.value || '';
    const opt = sel?.selectedOptions?.[0];
    activePatientName = opt ? opt.textContent : '';
    refreshWorkspace();
  });

  $('ma-recompute')?.addEventListener('click', async () => {
    if (!activePatientId) {
      $('ma-load')?.click();
      return;
    }
    const btn = $('ma-recompute');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Recomputing…';
    }
    try {
      if (usingFixtures && isDemoSession()) {
        payloadCache = buildMovementAnalyzerDemoPayload(activePatientId);
        renderPayload(payloadCache);
      } else {
        await api.recomputeMovementAnalyzer(activePatientId, { reason: 'manual_ui' });
        await refreshWorkspace(false);
      }
    } catch (e) {
      alert((e && e.message) || String(e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Recompute';
      }
    }
  });

  await loadPatientList();
  _syncDemoBanner();
  $('ma-body').innerHTML = '<p style="color:var(--text-tertiary);font-size:13px">Select a patient and tap <strong>Load workspace</strong>.</p>';
}

export default { pgMovementAnalyzer };
