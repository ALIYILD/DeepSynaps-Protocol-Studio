/**
 * Labs / Blood Biomarkers Analyzer — structured review, trends, safety, multimodal context.
 *
 * GET  /api/v1/labs/analyzer/patient/{id}
 * POST /api/v1/labs/analyzer/patient/{id}/recompute
 * POST /api/v1/labs/analyzer/patient/{id}/annotation
 * POST /api/v1/labs/analyzer/patient/{id}/review-note
 * GET  /api/v1/labs/analyzer/patient/{id}/audit
 */

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

function _skeletonBlock() {
  return `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
    <div style="display:grid;gap:10px">
      ${Array.from({ length: 4 }, () => '<div style="height:18px;border-radius:9px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></div>').join('')}
    </div>
  </div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'Could not load labs analyzer.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load the labs workspace.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">${esc(retryLabel)}</button>
  </div>`;
}

function _pillUrgency(u) {
  const s = String(u || '').toLowerCase();
  if (s === 'emergent' || s === 'urgent') {
    return '<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Urgent</span>';
  }
  return '<span class="pill pill-pending">Monitor</span>';
}

function _renderSnapshot(snap) {
  if (!snap) return '';
  const conf = [
    snap.completeness_pct != null
      ? `<div><strong>Panel completeness</strong> — ${esc(String(Math.round(Number(snap.completeness_pct) * 100)))}%</div>`
      : '',
    (snap.missing_core_analytes || []).length
      ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Missing: ${esc((snap.missing_core_analytes || []).join(', '))}</div>`
      : '',
  ].filter(Boolean).join('');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px">
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px">
      <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Abnormal domains</div>
      <div style="font-size:22px;font-weight:700">${esc(String(snap.abnormal_domain_count ?? 0))}</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px">
      <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Med safety flags</div>
      <div style="font-size:22px;font-weight:700">${esc(String(snap.medication_safety_flag_count ?? 0))}</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px;grid-column:1/-1">
      <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Top confounds (other analyzers)</div>
      <ul style="margin:6px 0 0 16px;font-size:12px;color:var(--text-secondary);line-height:1.45">
        ${(snap.top_confound_warnings || []).slice(0, 4).map((w) => `<li>${esc(w)}</li>`).join('') || '<li style="color:var(--text-tertiary)">None flagged</li>'}
      </ul>
    </div>
  </div>
  ${conf ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;line-height:1.5">${conf}</div>` : ''}
  <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:8px">
    <strong style="color:var(--text-primary)">Rollups</strong> — Inflammation: ${esc(snap.inflammation_summary || '—')} · Metabolic: ${esc(snap.metabolic_summary || '—')} · Endocrine: ${esc(snap.endocrine_summary || '—')}
  </div>`;
}

function _renderDomains(domains) {
  const rows = (domains || []).map((d) => `<tr>
    <td style="padding:8px;border-bottom:1px solid var(--border);font-weight:600">${esc(d.domain)}</td>
    <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(d.headline)}</td>
    <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${esc(d.status)}</td>
  </tr>`).join('');
  return `<div style="overflow:auto;border:1px solid var(--border);border-radius:12px">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:520px">
      <thead><tr>
        <th style="padding:8px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Domain</th>
        <th style="padding:8px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Summary</th>
        <th style="padding:8px;text-align:center;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Status</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="3" style="padding:12px;color:var(--text-tertiary)">No domain summaries</td></tr>'}</tbody>
    </table>
  </div>`;
}

function _renderResults(results) {
  const rows = (results || []).map((r) => {
    const val = r.value_numeric != null ? String(r.value_numeric) : esc(r.value_text || '—');
    const ref = r.reference_range
      ? `${r.reference_range.low ?? '—'}–${r.reference_range.high ?? '—'}`
      : '—';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid var(--border)">${esc(r.analyte_display_name)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border)">${val} ${esc(r.unit_ucum || '')}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-tertiary)">${esc(ref)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border)">${esc(r.abnormality_direction)}</td>
    </tr>`;
  }).join('');
  return `<div style="overflow:auto;margin-top:14px;border:1px solid var(--border);border-radius:12px">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px">
      <thead><tr>
        <th style="padding:8px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Analyte</th>
        <th style="padding:8px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Value</th>
        <th style="padding:8px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Ref</th>
        <th style="padding:8px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Flag</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _renderCritical(alerts) {
  if (!Array.isArray(alerts) || !alerts.length) {
    return '<div style="font-size:12px;color:var(--text-tertiary);padding:8px">No critical-band alerts on this payload.</div>';
  }
  return alerts.map((a) => `<div style="padding:12px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
    <div>
      <div style="font-weight:600;font-size:13px">${esc(a.analyte_display_name)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.45">${esc(a.message_clinical)}</div>
    </div>
    <div>${_pillUrgency(a.escalation_level)}</div>
  </div>`).join('');
}

function _renderInterpretations(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<div style="font-size:12px;color:var(--text-tertiary)">No structured interpretations — add labs or widen panel.</div>';
  }
  return items.map((it) => `<div style="padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:rgba(255,255,255,.02)">
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.4px">${esc(it.category)} · ${esc(it.interpretation_type)}</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;line-height:1.5">${esc(it.summary)}</div>
    ${(it.caveats || []).length ? `<div style="font-size:11px;color:var(--amber);margin-top:6px">${esc((it.caveats || []).join(' '))}</div>` : ''}
  </div>`).join('');
}

function _renderMultimodal(links) {
  const rows = (links || []).map((l) => `<tr data-nav="${esc(l.target_page)}" tabindex="0" role="link"
    style="cursor:pointer"
    onmouseover="this.style.background='rgba(255,255,255,.03)'"
    onmouseout="this.style.background='transparent'">
    <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:600">${esc(l.label)}</td>
    <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(l.rationale)}</td>
  </tr>`).join('');
  return `<div style="overflow:auto;border:1px solid var(--border);border-radius:12px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _renderRecommendations(items) {
  return (items || []).map((r) => `<div style="padding:12px;border-left:3px solid var(--violet,#9b7fff);background:rgba(155,127,255,0.06);border-radius:0 10px 10px 0;margin-bottom:8px">
    <div style="font-size:11px;color:var(--text-tertiary)">${esc(r.type)} · ${esc(r.priority)}</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.5">${esc(r.text)}</div>
  </div>`).join('') || '<div style="font-size:12px;color:var(--text-tertiary)">No recommendations</div>';
}

function _renderAudit(audit) {
  const items = Array.isArray(audit?.items) ? audit.items : [];
  if (!items.length) return '<div style="font-size:12px;color:var(--text-tertiary)">No audit events yet.</div>';
  return `<ul style="list-style:none;margin:0;padding:0">${items.map((it) => `<li style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between;gap:8px">
    <span><strong>${esc(it.event_type)}</strong> ${it.payload?.note ? `— ${esc(String(it.payload.note).slice(0, 120))}` : ''}</span>
    <span style="color:var(--text-tertiary);white-space:nowrap">${it.timestamp ? esc(new Date(it.timestamp).toLocaleString()) : '—'}</span>
  </li>`).join('')}</ul>`;
}

export async function pgLabsAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Labs · Blood Biomarkers',
      subtitle: 'Structured review, trends, safety monitoring, multimodal context',
    });
  } catch {
    try { setTopbar('Labs Analyzer', 'Blood biomarkers'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let roster = [];
  let activePatientId = null;
  let activePatientName = '';
  let payload = null;
  let audit = null;
  let usingFixtures = false;

  el.innerHTML = `
    <div class="ds-labs-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="la-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support only.</strong>
        This workspace does not diagnose. Abnormal flags, trends, and “possible contributor” lines are hypotheses — clinician judgment and local protocols prevail.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px">
        <label style="font-size:11px;color:var(--text-tertiary);display:flex;flex-direction:column;gap:4px">Patient
          <select id="la-patient-select" class="form-control" style="min-width:220px;min-height:44px"></select>
        </label>
        <button type="button" class="btn btn-primary btn-sm" id="la-load" style="min-height:44px;margin-top:18px">Load workspace</button>
        <button type="button" class="btn btn-ghost btn-sm" id="la-recompute" style="min-height:44px;margin-top:18px" disabled>Recompute</button>
      </div>
      <div id="la-body">${_skeletonBlock()}</div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('la-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  async function loadRoster() {
    const sel = $('la-patient-select');
    if (!sel) return;
    const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
    try {
      const resp = await api.listPatients({ limit: 80 });
      roster = Array.isArray(resp?.items) ? resp.items : (Array.isArray(resp) ? resp : []);
      if (!roster.length && isDemoSession()) {
        roster = personas.map((p) => ({ id: p.id, first_name: p.name.split(' ')[0], last_name: p.name.split(' ').slice(1).join(' ') }));
        usingFixtures = true;
      }
    } catch {
      roster = personas.map((p) => ({ id: p.id, first_name: p.name.split(' ')[0], last_name: p.name.split(' ').slice(1).join(' ') }));
      usingFixtures = isDemoSession();
    }
    sel.innerHTML = `<option value="">Select a patient…</option>${roster.map((p) => {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.id;
      return `<option value="${esc(p.id)}">${esc(name)}</option>`;
    }).join('')}`;
    _syncDemoBanner();
  }

  function wireMultimodalTable() {
    const body = $('la-body');
    if (!body) return;
    body.querySelectorAll('tr[data-nav]').forEach((tr) => {
      const go = () => {
        const id = tr.getAttribute('data-nav');
        if (id) try { navigate?.(id); } catch {}
      };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
      });
    });
  }

  async function loadPayload() {
    const body = $('la-body');
    if (!body || !activePatientId) return;
    body.innerHTML = _skeletonBlock();
    $('la-recompute').disabled = true;
    try {
      payload = await api.getLabsAnalyzerPayload(activePatientId);
      audit = await api.getLabsAnalyzerAudit(activePatientId).catch(() => ({ items: [] }));
      usingFixtures = false;
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.labs?.payload) {
        payload = ANALYZER_DEMO_FIXTURES.labs.payload(activePatientId);
        audit = ANALYZER_DEMO_FIXTURES.labs.audit(activePatientId);
        usingFixtures = true;
      } else {
        body.innerHTML = _errorCard((e && e.message) || String(e));
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPayload);
        return;
      }
    }

    const snap = payload.lab_snapshot;
    const gen = payload.generated_at
      ? `Generated ${new Date(payload.generated_at).toLocaleString()}`
      : '';
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <div style="font-size:12px;color:var(--text-tertiary)">${esc(gen)} · Schema ${esc(payload.schema_version || '')}</div>
        <div style="font-size:11px;color:var(--text-tertiary);max-width:420px;line-height:1.4">${esc(payload.disclaimer_short || '')}</div>
      </div>
      <div style="font-weight:600;font-size:13px;margin:14px 0 8px">Lab snapshot</div>
      ${_renderSnapshot(snap)}
      <div style="font-weight:600;font-size:13px;margin:14px 0 8px">Domains</div>
      ${_renderDomains(payload.domain_summaries)}
      <div style="font-weight:600;font-size:13px;margin:14px 0 8px">Critical alerts</div>
      ${_renderCritical(payload.critical_alerts)}
      <div style="font-weight:600;font-size:13px;margin:14px 0 8px">Results</div>
      ${_renderResults(payload.results)}
      <div style="font-weight:600;font-size:13px;margin:14px 0 8px">Clinical interpretation (hypotheses)</div>
      ${_renderInterpretations(payload.interpretations)}
      <div style="font-weight:600;font-size:13px;margin:14px 0 8px">Multimodal connections</div>
      ${_renderMultimodal(payload.multimodal_links)}
      <div style="font-weight:600;font-size:13px;margin:14px 0 8px">Recommendations</div>
      ${_renderRecommendations(payload.recommendations)}
      <div style="font-weight:600;font-size:13px;margin:14px 0 8px">Audit trail</div>
      <div id="la-audit-panel" style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px">${_renderAudit(audit)}</div>
      <div style="margin-top:14px;padding:12px;border:1px dashed var(--border);border-radius:12px">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px">Review note</div>
        <textarea id="la-note" class="form-control" rows="2" placeholder="Add a chart-ready note (audited)…" style="width:100%;min-height:44px"></textarea>
        <button type="button" class="btn btn-primary btn-sm" id="la-save-note" style="margin-top:8px;min-height:44px">Save note</button>
      </div>`;

    $('la-recompute').disabled = false;
    _syncDemoBanner();
    wireMultimodalTable();

    $('la-save-note')?.addEventListener('click', async () => {
      const ta = $('la-note');
      const text = (ta && ta.value || '').trim();
      if (!text) return;
      try {
        await api.postLabsReviewNote(activePatientId, { note: text });
        ta.value = '';
        audit = await api.getLabsAnalyzerAudit(activePatientId).catch(() => audit);
        const panel = document.getElementById('la-audit-panel');
        if (panel) panel.innerHTML = _renderAudit(audit);
      } catch (err) {
        window._announce?.(`Could not save note: ${(err && err.message) || err}`, true);
      }
    });
  }

  await loadRoster();

  $('la-patient-select')?.addEventListener('change', (ev) => {
    const id = ev.target.value;
    activePatientId = id || null;
    const opt = ev.target.selectedOptions && ev.target.selectedOptions[0];
    activePatientName = opt ? opt.textContent : '';
  });

  $('la-load')?.addEventListener('click', () => {
    if (!activePatientId) return;
    loadPayload();
  });

  $('la-recompute')?.addEventListener('click', async () => {
    if (!activePatientId) return;
    const btn = $('la-recompute');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Recomputing…';
    try {
      payload = await api.recomputeLabsAnalyzer(activePatientId, { reason: 'manual' });
      audit = await api.getLabsAnalyzerAudit(activePatientId).catch(() => audit);
      await loadPayload();
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.labs?.payload) {
        payload = ANALYZER_DEMO_FIXTURES.labs.payload(activePatientId);
        audit = ANALYZER_DEMO_FIXTURES.labs.audit(activePatientId);
        usingFixtures = true;
        await loadPayload();
      } else {
        window._announce?.((e && e.message) || String(e), true);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  });

  if (roster.length === 1) {
    activePatientId = roster[0].id;
    activePatientName = [roster[0].first_name, roster[0].last_name].filter(Boolean).join(' ');
    const sel = $('la-patient-select');
    if (sel) sel.value = activePatientId;
    loadPayload();
  }
}
