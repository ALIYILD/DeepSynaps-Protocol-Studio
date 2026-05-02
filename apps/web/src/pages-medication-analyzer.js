/**
 * Medication Analyzer — structured medication review, adherence context, and
 * safety / confound analysis (decision-support only; not autonomous management).
 */
import { api } from './api.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DISCLAIMER = 'Decision-support only. Does not prescribe, adjust doses, or replace '
  + 'pharmacy systems or clinician judgment. For research: version rulesets, retain source '
  + 'records, and use this output as an adjunct to—not a substitute for—pharmacist and '
  + 'primary medication reconciliation. Interaction checks use a limited in-product rule set '
  + 'and are not exhaustive.';

function _snapCard(label, value, sub) {
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 14px">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-tertiary);margin-bottom:4px">${esc(label)}</div>
    <div style="font-weight:700;font-size:16px;color:var(--text-primary)">${esc(value)}</div>
    ${sub ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${sub}</div>` : ''}
  </div>`;
}

function _renderSnapshot(snap) {
  if (!snap) return '<div style="color:var(--text-tertiary)">No snapshot data.</div>';
  const poly = snap.polypharmacy || {};
  const adh = snap.adherence || {};
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
    ${_snapCard('Active medications', String((snap.active_medications || []).length), null)}
    ${_snapCard('Polypharmacy (actives)', String(poly.active_count ?? '—'), poly.risk_band ? `band: ${poly.risk_band}` : '')}
    ${_snapCard('Interaction flags', String(snap.interaction_flag_count ?? 0), snap.interaction_severity_summary ? `max: ${snap.interaction_severity_summary}` : '')}
    ${_snapCard('Neuromod cautions', String(snap.neuromodulation_flag_count ?? 0), null)}
    ${_snapCard('Adherence (heuristic)', adh.value != null ? `${Math.round(adh.value * 100)}%` : '—', adh.trend || '')}
  </div>`;
}

function _renderRegulatoryDisclosures(rd) {
  if (!rd || typeof rd !== 'object') {
    return '<div style="color:var(--text-tertiary);font-size:12px">No regulatory block in payload.</div>';
  }
  const lim = Array.isArray(rd.limitations) ? rd.limitations : [];
  const nif = Array.isArray(rd.not_intended_for) ? rd.not_intended_for : [];
  return `<div style="font-size:12px;line-height:1.55;color:var(--text-secondary)">
    <p style="margin:0 0 8px"><strong style="color:var(--text-primary)">Intended use (CDS):</strong> ${esc(rd.intended_use || '—')}</p>
    <p style="margin:0 0 8px"><strong style="color:var(--text-primary)">Not for:</strong> ${esc(nif.join(' · ') || '—')}</p>
    <p style="margin:0 0 8px"><strong style="color:var(--text-primary)">Evidence basis:</strong> ${esc(rd.evidence_basis || '—')}</p>
    ${lim.length ? `<ul style="margin:8px 0 0 18px;padding:0">${lim.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

function _renderTimeline(events) {
  if (!events || !events.length) {
    return '<div style="color:var(--text-tertiary);font-size:12px">No timeline events (add annotations via API or future UI).</div>';
  }
  const rows = events.slice(-40).map((e) => {
    const t = esc(e.event_type || 'event');
    const when = esc(e.occurred_at || '');
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span style="color:var(--text-tertiary)">${when}</span> · <strong>${t}</strong>
      ${e.payload && Object.keys(e.payload).length ? `<div style="color:var(--text-secondary);margin-top:4px">${esc(JSON.stringify(e.payload))}</div>` : ''}
    </div>`;
  });
  return `<div>${rows.join('')}</div>`;
}

function _listSection(title, items, render) {
  if (!items || !items.length) {
    return `<details style="margin-bottom:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
      <summary style="cursor:pointer;padding:12px 14px;font-weight:600">${esc(title)}</summary>
      <div style="padding:0 14px 14px;font-size:12px;color:var(--text-tertiary)">No items.</div>
    </details>`;
  }
  return `<details open style="margin-bottom:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
    <summary style="cursor:pointer;padding:12px 14px;font-weight:600">${esc(title)} <span style="color:var(--text-tertiary);font-weight:500">(${items.length})</span></summary>
    <div style="padding:0 14px 14px;font-size:12px;line-height:1.5">${items.map(render).join('')}</div>
  </details>`;
}

export async function pgMedicationAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Medication Analyzer',
      subtitle: 'Regimen review · adherence context · safety & confounds',
    });
  } catch {
    try { setTopbar('Medication Analyzer', 'Regimen & safety context'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  el.innerHTML = `
    <div class="ds-med-analyzer-shell" style="max-width:1040px;margin:0 auto;padding:16px 20px 48px" data-testid="medication-analyzer-page">
      <div style="padding:14px 16px;border-radius:12px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.09);margin-bottom:18px;font-size:12px;line-height:1.5;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong> ${esc(DISCLAIMER)}
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-bottom:16px">
        <div style="font-weight:700;margin-bottom:8px">Patient</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
          <input id="ma-patient-id" class="form-control" style="max-width:420px;flex:1;min-width:200px" placeholder="Patient UUID (from chart or roster)" />
          <button type="button" class="btn btn-primary" id="ma-load">Load analyzer</button>
          <button type="button" class="btn btn-ghost" id="ma-recompute">Recompute</button>
        </div>
        <div id="ma-status" style="margin-top:10px;font-size:12px;color:var(--text-tertiary)"></div>
      </div>
      <div id="ma-body" style="display:none">
        <h2 style="font-size:15px;font-weight:700;margin:0 0 12px">Medication snapshot</h2>
        <div id="ma-snapshot" style="margin-bottom:20px"></div>
        <details style="margin-bottom:16px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:600">Research / IRB & algorithm disclosure</summary>
          <div id="ma-research" style="padding:0 14px 14px"></div>
        </details>
        <h2 style="font-size:15px;font-weight:700;margin:0 0 12px">Medication timeline (derived + saved annotations)</h2>
        <div id="ma-timeline" style="margin-bottom:20px"></div>
        <h2 style="font-size:15px;font-weight:700;margin:0 0 12px">Safety & interactions</h2>
        <div id="ma-safety"></div>
        <h2 style="font-size:15px;font-weight:700;margin:16px 0 12px">Possible confounds (biomarker / symptom context)</h2>
        <div id="ma-confounds"></div>
        <h2 style="font-size:15px;font-weight:700;margin:16px 0 12px">Recommended review actions</h2>
        <div id="ma-recs"></div>
        <details style="margin-top:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:600">Persisted review notes & audit (server)</summary>
          <div id="ma-audit-strip" style="padding:0 14px 14px;font-size:12px;color:var(--text-secondary)"></div>
        </details>
        <div style="margin-top:16px;font-size:11px;color:var(--text-tertiary)">
          <span id="ma-audit-ref"></span>
        </div>
      </div>
    </div>`;

  const statusEl = () => document.getElementById('ma-status');
  const bodyEl = () => document.getElementById('ma-body');

  function renderPayload(data) {
    document.getElementById('ma-research').innerHTML = _renderRegulatoryDisclosures(data.regulatory_disclosures);
    document.getElementById('ma-timeline').innerHTML = _renderTimeline(data.timeline || []);
    document.getElementById('ma-snapshot').innerHTML = _renderSnapshot(data.snapshot);
    document.getElementById('ma-safety').innerHTML = _listSection(
      'Alerts',
      data.safety_alerts || [],
      (a) => `<div style="margin-bottom:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,.02);border:1px solid var(--border)">
        <div style="font-weight:600">${esc(a.title || 'Alert')}</div>
        <div style="color:var(--text-secondary);margin-top:4px">${esc(a.detail || '')}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px">${esc(a.severity || '')} · ${esc(a.category || '')}</div>
      </div>`
    );
    document.getElementById('ma-confounds').innerHTML = _listSection(
      'Confounds',
      data.confounds || [],
      (c) => `<div style="margin-bottom:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,.02);border:1px solid var(--border)">
        <div style="font-weight:600">${esc(c.domain || 'general')} — ${esc(c.strength || 'possible')}</div>
        <div style="color:var(--text-secondary);margin-top:4px">${esc(c.explanation || '')}</div>
      </div>`
    );
    document.getElementById('ma-recs').innerHTML = _listSection(
      'Actions',
      data.recommendations || [],
      (r) => `<div style="margin-bottom:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,.02);border:1px solid var(--border)">
        <div style="font-weight:600">${esc(r.title || '')}</div>
        <div style="color:var(--text-secondary);margin-top:4px">${esc(r.rationale || '')}</div>
      </div>`
    );
    const ar = document.getElementById('ma-audit-ref');
    if (ar) ar.textContent = data.audit_ref ? `Audit ref: ${data.audit_ref}` : '';
    bodyEl().style.display = 'block';
  }

  async function loadAuditStrip(pid) {
    const strip = document.getElementById('ma-audit-strip');
    if (!strip) return;
    strip.textContent = 'Loading audit…';
    try {
      const j = await api.medicationAnalyzerAudit(pid);
      const nNotes = (j.review_notes || []).length;
      const nAud = (j.entries || []).length;
      strip.innerHTML = `<div>${esc(String(nNotes))} saved review note(s) · ${esc(String(nAud))} analyzer audit row(s) on server.</div>`;
    } catch (e) {
      strip.textContent = esc(e.message || String(e));
    }
  }

  async function load() {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    if (!pid) {
      statusEl().textContent = 'Enter a patient id.';
      return;
    }
    statusEl().textContent = 'Loading…';
    try {
      const data = await api.medicationAnalyzerPayload(pid);
      renderPayload(data);
      await loadAuditStrip(pid);
      statusEl().textContent = `Loaded · generated ${data.generated_at || ''}`;
    } catch (e) {
      statusEl().textContent = e.message || String(e);
      bodyEl().style.display = 'none';
    }
  }

  document.getElementById('ma-load')?.addEventListener('click', load);
  document.getElementById('ma-recompute')?.addEventListener('click', async () => {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    if (!pid) {
      statusEl().textContent = 'Enter a patient id.';
      return;
    }
    statusEl().textContent = 'Recomputing…';
    try {
      await api.medicationAnalyzerRecompute(pid, { force: true });
      await load();
    } catch (e) {
      statusEl().textContent = e.message || String(e);
    }
  });

  document.getElementById('ma-patient-id')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') load();
  });
}

export default { pgMedicationAnalyzer };
