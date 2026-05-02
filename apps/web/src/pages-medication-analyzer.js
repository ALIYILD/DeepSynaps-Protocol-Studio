/**
 * Medication Analyzer — structured medication review, adherence context, and
 * safety / confound analysis (decision-support only; not autonomous management).
 */
import { api } from './api.js';
import { EVIDENCE_TOTAL_PAPERS } from './evidence-dataset.js';

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
    return '<div style="color:var(--text-tertiary);font-size:12px">No timeline events yet — add one below or enter meds on the patient chart.</div>';
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

function _renderReviewNotes(notes) {
  const list = Array.isArray(notes) ? notes : [];
  if (!list.length) {
    return '<div style="color:var(--text-tertiary);font-size:12px">No saved notes yet.</div>';
  }
  return `<div style="font-size:12px;line-height:1.5">${list.map((n) => {
    const when = esc(n.created_at || '');
    const txt = esc(n.note_text || '');
    return `<div style="margin-bottom:12px;padding:10px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.02)">
      <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">${when}</div>
      <div style="color:var(--text-secondary);white-space:pre-wrap">${txt}</div>
    </div>`;
  }).join('')}</div>`;
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

function _initPatientIdFromUrl() {
  try {
    const sp = new URLSearchParams(window.location.search || '');
    return sp.get('patient_id') || sp.get('patient') || '';
  } catch {
    return '';
  }
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

  /** @type {object|null} */
  let lastAnalyzerPayload = null;

  el.innerHTML = `
    <div class="ds-med-analyzer-shell" style="max-width:1040px;margin:0 auto;padding:16px 20px 48px" data-testid="medication-analyzer-page">
      <div style="padding:14px 16px;border-radius:12px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.09);margin-bottom:18px;font-size:12px;line-height:1.5;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong> ${esc(DISCLAIMER)}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;align-items:center;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:var(--bg-card)">
        <span style="font-size:11px;color:var(--text-tertiary);margin-right:4px">Evidence & literature</span>
        <button type="button" class="btn btn-ghost btn-sm" id="ma-open-research-evidence" title="87K curated papers — medication / neuromodulation context">Research Evidence (${EVIDENCE_TOTAL_PAPERS.toLocaleString()} papers)</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ma-open-literature" title="Evidence library">Literature</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;align-items:center;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:var(--bg-card)">
        <span style="font-size:11px;color:var(--text-tertiary);margin-right:4px">Studio</span>
        <button type="button" class="btn btn-ghost btn-sm" id="ma-nav-dashboard">Dashboard</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ma-nav-patients">Patients</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ma-nav-monitor">Biometrics</button>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-bottom:16px">
        <div style="font-weight:700;margin-bottom:8px">Patient</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
          <input id="ma-patient-id" class="form-control" style="max-width:420px;flex:1;min-width:200px" placeholder="Patient UUID (from chart or roster)" />
          <button type="button" class="btn btn-primary" id="ma-load">Load analyzer</button>
          <button type="button" class="btn btn-ghost" id="ma-recompute">Recompute</button>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px;line-height:1.45">
          Deep link: append <code style="font-size:10px">?patient_id=&lt;uuid&gt;</code> to pre-fill the field.
        </div>
        <div id="ma-status" style="margin-top:10px;font-size:12px;color:var(--text-tertiary)"></div>
      </div>
      <div id="ma-body" style="display:none">
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center">
          <span style="font-size:11px;color:var(--text-tertiary);margin-right:4px">Patient & analyzers</span>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-open-profile" disabled title="Open patient chart">Patient profile</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-open-analytics" disabled title="Bloomberg-style multimodal terminal">Patient analytics</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-open-deeptwin" disabled title="360° fused context">DeepTwin</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-open-risk-full" disabled title="Full Risk Analyzer with overrides">Risk Analyzer</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-open-qeeg" disabled title="Resting EEG / spectral analysis">qEEG Analyzer</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-open-mri" disabled title="Structural MRI pipeline — patient field prefilled when possible">MRI Analyzer</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-open-text" title="Medication entities from clinical notes">Text Analyzer</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-open-voice" title="Voice biomarkers (sedation / fatigue context)">Voice Analyzer</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-open-biomarkers" title="Neuro-biomarker reference (medication caveats)">Biomarker reference</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-open-irb" disabled title="Download JSON for IRB / appendix">Export IRB JSON</button>
        </div>
        <div id="ma-risk-panel" style="display:none;margin-bottom:16px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.02)"></div>
        <h2 style="font-size:15px;font-weight:700;margin:0 0 12px">Medication snapshot</h2>
        <div id="ma-snapshot" style="margin-bottom:20px"></div>
        <details style="margin-bottom:16px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:600">Research / IRB & algorithm disclosure</summary>
          <div id="ma-research" style="padding:0 14px 14px"></div>
        </details>
        <h2 style="font-size:15px;font-weight:700;margin:0 0 12px">Medication timeline (derived + saved annotations)</h2>
        <div id="ma-timeline" style="margin-bottom:16px"></div>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:20px">
          <div style="font-weight:600;margin-bottom:10px;font-size:13px">Add timeline annotation</div>
          <div style="display:grid;gap:10px;grid-template-columns:1fr 1fr">
            <div>
              <label style="display:block;font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Event type</label>
              <select id="ma-te-type" class="form-control">
                <option value="side_effect_report">Side-effect report</option>
                <option value="missed_dose">Missed dose</option>
                <option value="dose_change_external">Dose change (external/EHR)</option>
                <option value="symptom_change">Symptom change</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Occurred at (ISO)</label>
              <input id="ma-te-when" class="form-control" placeholder="2026-05-01T14:00:00Z" />
            </div>
          </div>
          <label style="display:block;font-size:11px;color:var(--text-tertiary);margin:10px 0 4px">Detail (optional)</label>
          <textarea id="ma-te-detail" class="form-control" rows="2" placeholder="Brief note — persisted for research audit"></textarea>
          <button type="button" class="btn btn-primary btn-sm" id="ma-te-save" style="margin-top:10px">Save annotation</button>
          <span id="ma-te-status" style="margin-left:10px;font-size:12px;color:var(--text-tertiary)"></span>
        </div>
        <h2 style="font-size:15px;font-weight:700;margin:0 0 12px">Safety & interactions</h2>
        <div id="ma-safety"></div>
        <h2 style="font-size:15px;font-weight:700;margin:16px 0 12px">Possible confounds (biomarker / symptom context)</h2>
        <div id="ma-confounds"></div>
        <h2 style="font-size:15px;font-weight:700;margin:16px 0 12px">Recommended review actions</h2>
        <div id="ma-recs"></div>
        <h2 style="font-size:15px;font-weight:700;margin:20px 0 12px">Clinician review notes (persisted)</h2>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:16px">
          <label style="display:block;font-size:11px;color:var(--text-tertiary);margin-bottom:4px">New note</label>
          <textarea id="ma-note-text" class="form-control" rows="3" placeholder="Documentation for chart review, IRB, or handoff — not a prescription"></textarea>
          <button type="button" class="btn btn-primary btn-sm" id="ma-note-save" style="margin-top:10px">Save note</button>
          <span id="ma-note-status" style="margin-left:10px;font-size:12px;color:var(--text-tertiary)"></span>
        </div>
        <div id="ma-notes-list" style="margin-bottom:20px"></div>
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

  async function applyPayload(data) {
    renderPayload(data);
    await loadAuditStrip(document.getElementById('ma-patient-id')?.value?.trim());
    await loadRiskPanel(document.getElementById('ma-patient-id')?.value?.trim());
  }

  function renderPayload(data) {
    lastAnalyzerPayload = data;
    ['ma-open-profile', 'ma-open-analytics', 'ma-open-deeptwin', 'ma-open-risk-full',
      'ma-open-qeeg', 'ma-open-mri', 'ma-open-irb'].forEach((id) => {
      document.getElementById(id)?.removeAttribute('disabled');
    });
    document.getElementById('ma-snapshot').innerHTML = _renderSnapshot(data.snapshot);
    document.getElementById('ma-research').innerHTML = _renderRegulatoryDisclosures(data.regulatory_disclosures);
    document.getElementById('ma-timeline').innerHTML = _renderTimeline(data.timeline || []);
    const nl = document.getElementById('ma-notes-list');
    if (nl) nl.innerHTML = _renderReviewNotes(data.persisted_review_notes);
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

  async function loadRiskPanel(pid) {
    const panel = document.getElementById('ma-risk-panel');
    if (!panel || !pid) return;
    panel.style.display = 'block';
    panel.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">Loading Risk Analyzer summary…</div>';
    try {
      const rp = await api.getPatientRiskProfile(pid);
      const cats = Array.isArray(rp.categories) ? rp.categories : [];
      const rows = cats.slice(0, 12).map((c) => {
        const lvl = esc(c.level || c.computed_level || '');
        const lab = esc(c.label || c.category || '');
        return `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
          <span>${lab}</span><span style="font-weight:600">${lvl}</span>
        </div>`;
      }).join('');
      panel.innerHTML = `
        <div style="font-weight:600;font-size:13px;margin-bottom:8px">Risk Analyzer (traffic lights)</div>
        <div style="max-height:220px;overflow:auto">${rows || '<div style="color:var(--text-tertiary);font-size:12px">No categories returned.</div>'}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Uses GET /api/v1/risk/patient — medication-related categories may update after Rx changes.</div>`;
    } catch {
      panel.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">Risk profile unavailable (offline demo, permissions, or API error). Open Patient analytics or Profile when online.</div>';
    }
  }

  async function loadAuditStrip(pid) {
    const strip = document.getElementById('ma-audit-strip');
    if (!strip || !pid) return;
    strip.textContent = 'Loading audit…';
    try {
      const j = await api.medicationAnalyzerAudit(pid);
      const nNotes = (j.review_notes || []).length;
      const nAud = (j.entries || []).length;
      const recent = (j.entries || []).slice(0, 6).map((e) => {
        const act = esc(e.action || '');
        const at = esc(e.at || '');
        return `<div style="padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--text-tertiary)">${at}</span> · ${act}</div>`;
      }).join('');
      strip.innerHTML = `<div style="margin-bottom:10px">${esc(String(nNotes))} saved review note(s) · ${esc(String(nAud))} analyzer audit row(s)</div>`
        + (recent ? `<div style="max-height:160px;overflow:auto">${recent}</div>` : '');
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
      await loadRiskPanel(pid);
      statusEl().textContent = `Loaded · generated ${data.generated_at || ''}`;
    } catch (e) {
      statusEl().textContent = e.message || String(e);
      bodyEl().style.display = 'none';
    }
  }

  const seedPid = _initPatientIdFromUrl();
  if (seedPid && document.getElementById('ma-patient-id')) {
    document.getElementById('ma-patient-id').value = seedPid;
    load();
  }

  document.getElementById('ma-open-profile')?.addEventListener('click', () => {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    if (!pid) return;
    try {
      window.openPatient?.(pid);
      sessionStorage.setItem('ds_pat_selected_id', pid);
    } catch {}
    window._selectedPatientId = pid;
    window._profilePatientId = pid;
    navigate('patient-profile');
  });
  document.getElementById('ma-open-analytics')?.addEventListener('click', () => {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    if (!pid) return;
    window._paPatientId = pid;
    navigate('patient-analytics');
  });
  document.getElementById('ma-open-deeptwin')?.addEventListener('click', () => {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    if (!pid) return;
    window._selectedPatientId = pid;
    window._profilePatientId = pid;
    try { sessionStorage.setItem('ds_pat_selected_id', pid); } catch {}
    navigate('deeptwin');
  });
  document.getElementById('ma-open-research-evidence')?.addEventListener('click', () => {
    try { window._resEvidenceTab = 'search'; } catch {}
    navigate('research-evidence');
  });
  document.getElementById('ma-open-literature')?.addEventListener('click', () => {
    navigate('literature');
  });
  document.getElementById('ma-nav-dashboard')?.addEventListener('click', () => {
    navigate('home');
  });
  document.getElementById('ma-nav-patients')?.addEventListener('click', () => {
    navigate('patients-v2');
  });
  document.getElementById('ma-nav-monitor')?.addEventListener('click', () => {
    navigate('wearables');
  });
  document.getElementById('ma-open-risk-full')?.addEventListener('click', () => {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    if (!pid) {
      window._dsToast?.({ title: 'Patient id', body: 'Load a patient first.', severity: 'info' });
      return;
    }
    window._riskAnalyzerPatientId = pid;
    navigate('risk-analyzer');
  });
  document.getElementById('ma-open-qeeg')?.addEventListener('click', () => {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    if (!pid) {
      window._dsToast?.({ title: 'Patient id', body: 'Load a patient first.', severity: 'info' });
      return;
    }
    window._selectedPatientId = pid;
    window._profilePatientId = pid;
    try { sessionStorage.setItem('ds_pat_selected_id', pid); } catch {}
    window._qeegSelectedId = null;
    navigate('qeeg-analysis');
  });
  document.getElementById('ma-open-mri')?.addEventListener('click', () => {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    if (!pid) {
      window._dsToast?.({ title: 'Patient id', body: 'Load a patient first.', severity: 'info' });
      return;
    }
    try { sessionStorage.setItem('ds_mri_prefill_patient_id', pid); } catch {}
    navigate('mri-analysis');
  });
  document.getElementById('ma-open-text')?.addEventListener('click', () => {
    navigate('text-analyzer');
  });
  document.getElementById('ma-open-voice')?.addEventListener('click', () => {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    if (pid) {
      try { window._deeptwinPatientId = pid; } catch {}
    }
    navigate('voice-analyzer');
  });
  document.getElementById('ma-open-biomarkers')?.addEventListener('click', () => {
    navigate('biomarkers');
  });

  document.getElementById('ma-open-irb')?.addEventListener('click', () => {
    if (!lastAnalyzerPayload) return;
    const bundle = {
      export_kind: 'medication_analyzer_irb_appendix',
      exported_at: new Date().toISOString(),
      patient_id: lastAnalyzerPayload.patient_id,
      audit_ref: lastAnalyzerPayload.audit_ref,
      schema_version: lastAnalyzerPayload.schema_version,
      generated_at: lastAnalyzerPayload.generated_at,
      regulatory_disclosures: lastAnalyzerPayload.regulatory_disclosures,
      provenance: lastAnalyzerPayload.provenance,
      snapshot: lastAnalyzerPayload.snapshot,
      timeline: lastAnalyzerPayload.timeline,
      adherence: lastAnalyzerPayload.adherence,
      safety_alerts: lastAnalyzerPayload.safety_alerts,
      confounds: lastAnalyzerPayload.confounds,
      recommendations: lastAnalyzerPayload.recommendations,
      persisted_review_notes: lastAnalyzerPayload.persisted_review_notes,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const safeId = String(lastAnalyzerPayload.patient_id || 'patient').replace(/[^a-z0-9_-]/gi, '_').slice(0, 36);
    a.href = URL.createObjectURL(blob);
    a.download = `medication-analyzer-irb-${safeId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    window._dsToast?.({ title: 'Export ready', body: 'IRB appendix JSON downloaded.', severity: 'info' });
  });

  document.getElementById('ma-load')?.addEventListener('click', load);
  document.getElementById('ma-note-save')?.addEventListener('click', async () => {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    const txt = document.getElementById('ma-note-text')?.value?.trim();
    const st = document.getElementById('ma-note-status');
    if (!pid) { if (st) st.textContent = 'Enter patient id.'; return; }
    if (!txt) { if (st) st.textContent = 'Enter note text.'; return; }
    if (st) st.textContent = 'Saving…';
    try {
      const res = await api.medicationAnalyzerReviewNote(pid, {
        note_text: txt,
        linked_recommendation_ids: [],
      });
      document.getElementById('ma-note-text').value = '';
      if (res.full_payload) {
        await applyPayload(res.full_payload);
      } else {
        await load();
      }
      if (st) st.textContent = 'Saved.';
    } catch (e) {
      if (st) st.textContent = esc(e.message || String(e));
    }
  });

  document.getElementById('ma-te-save')?.addEventListener('click', async () => {
    const pid = document.getElementById('ma-patient-id')?.value?.trim();
    const type = document.getElementById('ma-te-type')?.value || 'other';
    let when = document.getElementById('ma-te-when')?.value?.trim();
    const detail = document.getElementById('ma-te-detail')?.value?.trim();
    const st = document.getElementById('ma-te-status');
    if (!pid) { if (st) st.textContent = 'Load patient first.'; return; }
    if (!when) {
      try {
        when = new Date().toISOString();
        document.getElementById('ma-te-when').value = when;
      } catch {
        when = '';
      }
    }
    if (st) st.textContent = 'Saving…';
    try {
      const res = await api.medicationAnalyzerTimelineEvent(pid, {
        event_type: type,
        occurred_at: when,
        payload: detail ? { detail } : {},
      });
      document.getElementById('ma-te-detail').value = '';
      if (res.full_payload) {
        await applyPayload(res.full_payload);
      } else {
        await load();
      }
      if (st) st.textContent = 'Saved.';
    } catch (e) {
      if (st) st.textContent = esc(e.message || String(e));
    }
  });

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
