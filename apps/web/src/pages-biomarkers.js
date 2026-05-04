/**
 * Biomarkers workspace — clinician-reviewed decision support for patient-linked
 * labs, wearables, and cross-module context. Not diagnosis, triage, or treatment approval.
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

function _patientLabel(p) {
  if (!p) return '';
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (p.name) return String(p.name);
  if (p.display_name) return String(p.display_name);
  return String(p.id || '');
}

function _fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function _fmtShortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function _statusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'critical') {
    return '<span class="pill" style="background:rgba(255,107,107,0.16);color:var(--red);border:1px solid rgba(255,107,107,0.32);font-weight:700">Needs review</span>';
  }
  if (s === 'high' || s === 'low') {
    return '<span class="pill" style="background:rgba(255,176,87,0.14);color:var(--amber)">Out of range</span>';
  }
  if (s === 'normal') {
    return '<span class="pill pill-active">In range</span>';
  }
  return '<span class="pill pill-inactive">—</span>';
}

/**
 * Flatten lab panels to sortable rows (exported for unit tests).
 * @param {object|null} profile
 * @returns {Array<{ panel: string, analyte: string, value: *, unit: string, ref: string, status: string, captured_at: string }>}
 */
export function flattenLabResults(profile) {
  const panels = Array.isArray(profile?.panels) ? profile.panels : [];
  const out = [];
  for (const pn of panels) {
    const name = pn?.name || 'Panel';
    const results = Array.isArray(pn?.results) ? pn.results : [];
    for (const r of results) {
      const refLo = r.ref_low;
      const refHi = r.ref_high;
      const ref = refLo != null && refHi != null ? `${refLo}–${refHi}` : '—';
      out.push({
        panel: name,
        analyte: r.analyte || '—',
        value: r.value,
        unit: r.unit || '',
        ref,
        status: r.status || '',
        captured_at: r.captured_at || profile?.captured_at || '',
      });
    }
  }
  return out;
}

/**
 * @param {string} iso
 * @param {number} staleDays
 */
export function isStale(iso, staleDays = 90) {
  if (!iso) return { stale: true, days: null, reason: 'no date' };
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return { stale: true, days: null, reason: 'invalid date' };
  const days = (Date.now() - t) / (86400 * 1000);
  return { stale: days > staleDays, days: Math.floor(days), reason: null };
}

function _downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function _setPatientContext(patientId) {
  if (!patientId) return;
  try {
    window._selectedPatientId = patientId;
    window._profilePatientId = patientId;
    sessionStorage.setItem('ds_pat_selected_id', patientId);
  } catch { /* ignore */ }
}

export async function pgBiomarkersWorkspace(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Biomarkers',
      subtitle: 'Clinician-reviewed lab & device context · decision-support only',
    });
  } catch {
    try { setTopbar('Biomarkers', 'Decision-support workspace'); } catch { /* ignore */ }
  }

  const el = document.getElementById('content');
  if (!el) return;

  let patients = [];
  let selectedId =
    window._selectedPatientId
    || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ds_pat_selected_id') : '')
    || '';

  let labsProfile = null;
  let labsDemo = false;
  let wearableOut = null;
  let qeegItems = [];
  let mriItems = [];
  let loadErr = null;

  el.innerHTML = `
    <div class="ds-biomarkers-shell" style="max-width:1180px;margin:0 auto;padding:16px 20px 56px" data-page="biomarkers-workspace">
      <div id="bm-banner-slot"></div>
      <header style="margin-bottom:16px">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:650;letter-spacing:-0.02em;color:var(--text-primary)">Biomarker workspace</h1>
        <p style="margin:0;font-size:13px;line-height:1.55;color:var(--text-secondary);max-width:820px">
          Review patient-linked laboratory results, wearable summaries, and links to assessments and modalities.
          This surface supports clinician interpretation — it does not diagnose, prescribe, approve treatment eligibility, or perform emergency triage.
        </p>
      </header>
      <div id="bm-toolbar" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px"></div>
      <div id="bm-body">
        <div style="padding:28px;text-align:center;color:var(--text-tertiary)">Loading…</div>
      </div>
    </div>`;

  async function loadPatients() {
    try {
      const res = await api.listPatients({ limit: 200 });
      patients = res?.items || (Array.isArray(res) ? res : []) || [];
    } catch {
      patients = [];
    }
    if (!selectedId && patients[0]) selectedId = patients[0].id;
  }

  async function loadPatientData() {
    labsProfile = null;
    wearableOut = null;
    qeegItems = [];
    mriItems = [];
    labsDemo = false;
    loadErr = null;

    if (!selectedId) return;

    let labsRes = null;
    try {
      labsRes = await api.getLabsProfile(selectedId);
    } catch (e) {
      loadErr = (e && e.message) || String(e);
    }

    if (labsRes && labsRes.patient_id) {
      labsProfile = labsRes;
    } else if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.labs?.patient_profile) {
      const demo = ANALYZER_DEMO_FIXTURES.labs.patient_profile(selectedId);
      if (demo) {
        labsProfile = demo;
        labsDemo = true;
      }
    }

    const [wearRes, qeegRes, mriRes] = await Promise.all([
      api.getPatientWearableSummary(selectedId, 30).catch(() => null),
      api.listPatientQEEGAnalyses(selectedId, { limit: 20 }).catch(() => null),
      api.listPatientMRIAnalyses(selectedId).catch(() => null),
    ]);

    wearableOut = wearRes;
    qeegItems = qeegRes?.items || (Array.isArray(qeegRes) ? qeegRes : []) || [];
    mriItems = mriRes?.items || (Array.isArray(mriRes) ? mriRes : []) || [];

    try {
      await api.recordPatientProfileAuditEvent(selectedId, {
        event: 'biomarkers_workspace_view',
        note: 'Biomarkers workspace opened',
        using_demo_data: !!(labsDemo || isDemoSession()),
      });
    } catch { /* best-effort audit */ }
  }

  function renderToolbar() {
    const tb = document.getElementById('bm-toolbar');
    if (!tb) return;

    const opts = patients.map((p) =>
      `<option value="${esc(p.id)}"${p.id === selectedId ? ' selected' : ''}>${esc(_patientLabel(p))}</option>`
    ).join('');

    tb.innerHTML = `
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary);min-width:220px;flex:1">
        <span id="bm-patient-label">Patient</span>
        <select id="bm-patient-select" class="form-control" aria-labelledby="bm-patient-label" style="min-height:40px">
          <option value="">Select a patient…</option>
          ${opts}
        </select>
      </label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
        <button type="button" class="btn btn-ghost btn-sm" id="bm-open-profile" ${selectedId ? '' : 'disabled'} style="min-height:40px">Patient profile</button>
        <button type="button" class="btn btn-ghost btn-sm" id="bm-open-labs" ${selectedId ? '' : 'disabled'} style="min-height:40px">Labs Analyzer</button>
        <button type="button" class="btn btn-ghost btn-sm" id="bm-ref-catalog" style="min-height:40px">Neuro-biomarker reference</button>
      </div>`;

    tb.querySelector('#bm-patient-select')?.addEventListener('change', async (ev) => {
      selectedId = ev.target.value || '';
      _setPatientContext(selectedId);
      document.getElementById('bm-body').innerHTML =
        '<div style="padding:28px;text-align:center;color:var(--text-tertiary)">Loading…</div>';
      await loadPatientData();
      renderBody();
      renderToolbar();
    });

    tb.querySelector('#bm-open-profile')?.addEventListener('click', () => {
      if (!selectedId) return;
      _setPatientContext(selectedId);
      navigate('patient-profile');
    });

    tb.querySelector('#bm-open-labs')?.addEventListener('click', () => {
      if (!selectedId) return;
      _setPatientContext(selectedId);
      navigate('labs-analyzer');
    });

    tb.querySelector('#bm-ref-catalog')?.addEventListener('click', () => {
      window._nav('biomarkers-ref');
    });
  }

  function renderBody() {
    const body = document.getElementById('bm-body');
    const bannerSlot = document.getElementById('bm-banner-slot');
    if (!body) return;

    if (bannerSlot) {
      const demoBanner = isDemoSession() && labsDemo ? DEMO_FIXTURE_BANNER_HTML : '';
      bannerSlot.innerHTML = `
        <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(245,158,11,0.35);background:rgba(245,158,11,0.07);margin-bottom:12px;font-size:12px;line-height:1.5;color:var(--text-secondary)" role="note">
          <strong style="color:var(--text-primary)">Decision-support only.</strong>
          Flags and ranges are heuristic or imported — confirm against source labs and local reference intervals.
          AI-assisted text elsewhere in the product is draft until you sign off.
        </div>
        ${demoBanner}`;
    }

    if (!selectedId) {
      body.innerHTML = `
        <div style="padding:24px;border:1px dashed var(--border);border-radius:14px;text-align:center;color:var(--text-secondary);font-size:13px">
          Select a patient to review biomarker-linked data. Add patients under <strong>Patients</strong> if your roster is empty.
        </div>`;
      return;
    }

    const p = patients.find((x) => x.id === selectedId);
    const pname = esc(_patientLabel(p) || selectedId);
    const rows = flattenLabResults(labsProfile);
    const drawIso = labsProfile?.captured_at || '';
    const stale = isStale(drawIso, 90);

    const abnormal = rows.filter((r) => r.status && String(r.status).toLowerCase() !== 'normal');
    const summaries = Array.isArray(wearableOut?.summaries) ? wearableOut.summaries : [];
    const lastWearable = summaries.length ? summaries[summaries.length - 1] : null;
    const wearStale = lastWearable?.date ? isStale(`${lastWearable.date}T12:00:00Z`, 14) : { stale: true, reason: 'no wearable summaries' };

    const readiness = wearableOut?.readiness && typeof wearableOut.readiness === 'object'
      ? wearableOut.readiness
      : null;

    body.innerHTML = `
      <section aria-labelledby="bm-ctx-h" style="margin-bottom:18px;padding:14px 16px;border-radius:14px;border:1px solid var(--border);background:var(--bg-card)">
        <div id="bm-ctx-h" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:6px">Patient context</div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">${pname}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
          Last lab draw (aggregated): ${_fmtShortDate(drawIso)}
          ${stale.stale ? `<span style="margin-left:8px" class="pill pill-pending">Stale (&gt;90d)</span>` : ''}
          ${!drawIso ? '<span style="margin-left:8px;color:var(--text-tertiary)">No draw date</span>' : ''}
        </div>
        ${loadErr && !labsProfile ? `<div role="alert" style="margin-top:10px;font-size:12px;color:var(--amber)">Could not load live labs (${esc(loadErr)}). ${labsDemo ? 'Showing labelled demo labs.' : 'Use Labs Analyzer or enter results when the API is available.'}</div>` : ''}
      </section>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:18px">
        <section style="padding:14px;border-radius:14px;border:1px solid var(--border);background:rgba(255,255,255,0.02)">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:8px">Data sources</div>
          <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.55">
            <li>Labs: ${rows.length ? `${rows.length} analytes in workspace` : 'No structured labs in this summary'}</li>
            <li>Wearables: ${summaries.length ? `${summaries.length} daily summaries (30d)` : 'No wearable summaries'}</li>
            <li>qEEG analyses: ${qeegItems.length} record(s)</li>
            <li>MRI analyses: ${mriItems.length} record(s)</li>
          </ul>
          ${readiness ? `<div style="margin-top:10px;font-size:11px;color:var(--text-tertiary)">Readiness payload present — see Biometrics for detail.</div>` : ''}
        </section>
        <section style="padding:14px;border-radius:14px;border:1px solid var(--border);background:rgba(255,255,255,0.02)">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:8px">Wearable / biometrics snapshot</div>
          ${lastWearable ? `
            <div style="font-size:12px;color:var(--text-secondary)">
              Latest day: <strong style="color:var(--text-primary)">${esc(lastWearable.date)}</strong>
              ${wearStale.stale ? '<span class="pill pill-pending" style="margin-left:6px">Stale stream</span>' : ''}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;font-size:11px;color:var(--text-tertiary)">
              ${lastWearable.hrv_ms != null ? `<span>HRV ${esc(String(lastWearable.hrv_ms))} ms</span>` : ''}
              ${lastWearable.rhr_bpm != null ? `<span>Resting HR ${esc(String(lastWearable.rhr_bpm))} bpm</span>` : ''}
              ${lastWearable.sleep_duration_h != null ? `<span>Sleep ${esc(String(lastWearable.sleep_duration_h))} h</span>` : ''}
            </div>
            <button type="button" class="btn btn-ghost btn-sm" id="bm-open-wear" style="margin-top:10px;min-height:40px">Open Biometrics</button>
          ` : `<div style="font-size:12px;color:var(--text-tertiary)">No wearable summary for this patient. Device data may be unavailable or not synced.</div>`}
        </section>
      </div>

      <section style="margin-bottom:18px">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
          <h2 style="margin:0;font-size:14px;font-weight:650;color:var(--text-primary)">Recent laboratory biomarkers</h2>
          <button type="button" class="btn btn-primary btn-sm" id="bm-export" ${rows.length ? '' : 'disabled'} style="min-height:40px">Export summary (JSON)</button>
        </div>
        ${rows.length ? `
          <div style="overflow:auto;border:1px solid var(--border);border-radius:12px">
            <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:720px">
              <thead>
                <tr style="text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-tertiary)">
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Panel</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Analyte</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Value</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Ref range</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Status</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Draw</th>
                </tr>
              </thead>
              <tbody>
                ${rows.slice(0, 24).map((r) => `
                  <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid var(--border)">${esc(r.panel)}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:500">${esc(r.analyte)}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums">
                      ${r.value == null || r.value === '' ? '—' : esc(String(r.value))}${r.unit ? ` <span style="color:var(--text-tertiary)">${esc(r.unit)}</span>` : ' <span style="color:var(--text-tertiary)">(unit unknown)</span>'}
                    </td>
                    <td style="padding:10px 12px;border-bottom:1px solid var(--border);color:var(--text-secondary)">${esc(r.ref)}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid var(--border)">${_statusPill(r.status)}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-tertiary)">${_fmtShortDate(r.captured_at)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${rows.length > 24 ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Showing 24 of ${rows.length}. Open Labs Analyzer for the full panel.</div>` : ''}
        ` : `
          <div style="padding:18px;border:1px dashed var(--border);border-radius:12px;font-size:12px;color:var(--text-secondary)">
            No laboratory analytes in this summary. Add results in <strong>Labs Analyzer</strong> or wait for interface ingest.
          </div>`}
      </section>

      <section style="margin-bottom:18px">
        <h2 style="margin:0 0 10px;font-size:14px;font-weight:650;color:var(--text-primary)">Abnormal or out-of-range</h2>
        ${abnormal.length ? `
          <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.55">
            ${abnormal.slice(0, 12).map((r) =>
              `<li><strong style="color:var(--text-primary)">${esc(r.analyte)}</strong> — requires clinician interpretation (${esc(r.status)})</li>`
            ).join('')}
          </ul>
        ` : `<div style="font-size:12px;color:var(--text-tertiary)">No abnormal flags in parsed labs, or reference intervals missing. Missing intervals are not shown as “normal.”</div>`}
      </section>

      <section style="margin-bottom:18px">
        <h2 style="margin:0 0 10px;font-size:14px;font-weight:650;color:var(--text-primary)">Linked modules</h2>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="assessments-v2">Assessments</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="documents-v2">Documents</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="live-session">Virtual Care</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="qeeg-analysis">qEEG</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="mri-analysis">MRI</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="video-assessments">Video</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="text-analyzer">Text</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="deeptwin">DeepTwin</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="protocol-studio">Protocol Studio</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="brainmap-v2">Brain Map</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="schedule-v2">Schedule</button>
          <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="clinician-inbox">Inbox</button>
        </div>
        <p style="margin:10px 0 0;font-size:11px;color:var(--text-tertiary);max-width:820px">
          Links open the corresponding workspace with this patient selected where supported. If a module has no data, that module will show its own empty state.
        </p>
      </section>

      <section style="margin-bottom:18px;padding:14px;border-radius:14px;border:1px solid var(--border);background:rgba(155,127,255,0.05)">
        <h2 style="margin:0 0 8px;font-size:14px;font-weight:650;color:var(--text-primary)">AI-assisted context</h2>
        <p style="margin:0;font-size:12px;line-height:1.55;color:var(--text-secondary)">
          This page does not auto-generate a biomarker diagnosis or protocol recommendation.
          Use <strong>DeepTwin</strong> or <strong>Labs Analyzer</strong> annotations for draft narratives — always label AI output as draft until reviewed.
        </p>
      </section>

      <section style="padding:14px;border-radius:14px;border:1px solid var(--border);font-size:11px;color:var(--text-tertiary);line-height:1.5">
        <strong style="color:var(--text-secondary)">Audit:</strong> opening this workspace attempts to record a patient-profile audit event when the API allows it.
        Exports are client-side JSON for clinician workflows — treat as sensitive (PHI).
      </section>`;

    body.querySelectorAll('.bm-link').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-nav');
        if (!id) return;
        _setPatientContext(selectedId);
        navigate(id);
      });
    });

    body.querySelector('#bm-export')?.addEventListener('click', () => {
      const prefix = isDemoSession() ? 'DEMO-' : '';
      _downloadJson(`${prefix}biomarker-summary-${selectedId}.json`, {
        exported_at: new Date().toISOString(),
        patient_id: selectedId,
        patient_name: _patientLabel(p) || null,
        lab_captured_at: drawIso || null,
        demo_lab_fixture: labsDemo,
        laboratory_rows: rows,
        qeeg_analysis_count: qeegItems.length,
        mri_analysis_count: mriItems.length,
        wearable_summary_days: summaries.length,
      });
    });

    body.querySelector('#bm-open-wear')?.addEventListener('click', () => {
      _setPatientContext(selectedId);
      navigate('wearables');
    });
  }

  await loadPatients();
  _setPatientContext(selectedId);
  renderToolbar();
  await loadPatientData();
  renderBody();
}
