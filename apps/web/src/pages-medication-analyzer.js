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

function _severityPill(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'severe' || s === 'major' || s === 'critical') {
    return '<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Severe</span>';
  }
  if (s === 'moderate' || s === 'amber') {
    return '<span class="pill pill-pending">Moderate</span>';
  }
  if (s === 'mild' || s === 'minor') {
    return '<span class="pill pill-review">Mild</span>';
  }
  if (s === 'none' || s === 'green' || s === 'clear') {
    return '<span class="pill pill-active">Clear</span>';
  }
  return '<span class="pill pill-inactive">Unknown</span>';
}

function _severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'severe' || s === 'major' || s === 'critical') return 'var(--red)';
  if (s === 'moderate' || s === 'amber') return 'var(--amber)';
  if (s === 'mild' || s === 'minor') return 'var(--blue)';
  return 'var(--green)';
}

function _skeletonChips(n = 6) {
  const chip = '<span style="display:inline-block;width:120px;height:22px;border-radius:11px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'We couldn’t reach the medication safety check right now.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t reach the medication safety check right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">${esc(retryLabel)}</button>
  </div>`;
}

function _emptyLogCard() {
  return `<div style="max-width:520px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No interaction checks yet</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
      The interaction log fills as clinicians review patient medications. Open a patient to record their meds and run a check.
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="ma-go-patients" style="min-height:44px">Open patients</button>
  </div>`;
}

function _emptyMedsCard(patientName) {
  return `<div style="margin:14px 0;padding:18px 20px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02);text-align:center">
    <div style="font-weight:600;margin-bottom:6px">No medications recorded for ${esc(patientName || 'this patient')}</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Add the patient’s current regimen below to enable interaction checks.</div>
    <button type="button" class="btn btn-primary btn-sm" data-action="focus-add" style="min-height:44px">Add a medication</button>
  </div>`;
}

function _renderInteractionLog(items) {
  if (!Array.isArray(items) || !items.length) return _emptyLogCard();
  const rows = items.map((it) => {
    const when = it.created_at ? new Date(it.created_at).toLocaleString() : '—';
    const meds = Array.isArray(it.medications_checked) ? it.medications_checked.join(', ') : '—';
    const sev = it.severity_summary || 'none';
    const interactions = Array.isArray(it.interactions_found) ? it.interactions_found.length : 0;
    const action = interactions > 0
      ? `${interactions} interaction${interactions === 1 ? '' : 's'} flagged`
      : 'No interactions';
    return `<tr data-patient-id="${esc(it.patient_id)}" tabindex="0" role="button"
      style="cursor:pointer;min-height:44px"
      onmouseover="this.style.background='rgba(255,255,255,.03)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-tertiary);white-space:nowrap">${esc(when)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500">${esc(it.patient_name || it.patient_id || 'Unknown')}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(meds)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);text-align:center">${_severityPill(sev)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(action)}</td>
    </tr>`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px">
      <thead><tr>
        <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">When</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Patient</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Medications checked</th>
        <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Severity</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Action</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _renderMedRow(m) {
  const meta = [m.dose, m.frequency, m.route].filter(Boolean).join(' · ');
  const sub = [m.prescriber ? `Prescriber: ${m.prescriber}` : '', m.started_at ? `Started ${m.started_at.slice(0, 10)}` : '']
    .filter(Boolean).join(' · ');
  return `<li data-med-id="${esc(m.id)}" style="display:flex;justify-content:space-between;gap:12px;padding:12px;border-bottom:1px solid var(--border);min-height:44px;align-items:flex-start">
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px">${esc(m.name || 'Unnamed medication')}${m.generic_name ? ` <span style="color:var(--text-tertiary);font-weight:400">(${esc(m.generic_name)})</span>` : ''}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(meta || '—')}</div>
      ${sub ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(sub)}</div>` : ''}
    </div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="remove-med" data-med-id="${esc(m.id)}" style="min-height:44px;color:var(--red)">Remove</button>
  </li>`;
}

function _renderMedList(meds, patientName) {
  if (!Array.isArray(meds) || !meds.length) return _emptyMedsCard(patientName);
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <ul style="list-style:none;margin:0;padding:0">${meds.map(_renderMedRow).join('')}</ul>
  </div>`;
}

function _renderAddForm() {
  return `<form data-add-med-form style="margin-top:14px;padding:14px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02);display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Name
      <input class="form-control" name="name" required placeholder="e.g. Sertraline" style="min-height:44px">
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Dose
      <input class="form-control" name="dose" placeholder="e.g. 100 mg" style="min-height:44px">
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Frequency
      <input class="form-control" name="frequency" placeholder="e.g. once daily" style="min-height:44px">
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Route
      <input class="form-control" name="route" placeholder="e.g. PO" style="min-height:44px">
    </label>
    <div style="grid-column:1 / -1;display:flex;gap:8px;justify-content:flex-end">
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Add medication</button>
    </div>
  </form>`;
}

function _renderInteractionResults(result) {
  if (!result) return '';
  const interactions = Array.isArray(result.interactions) ? result.interactions : [];
  if (!interactions.length) {
    return `<div style="margin-top:14px;padding:14px;border:1px solid rgba(74,222,128,0.25);background:rgba(74,222,128,0.06);border-radius:12px">
      <div style="font-weight:600;color:var(--green);margin-bottom:4px">No interactions detected</div>
      <div style="font-size:12px;color:var(--text-secondary)">Checked ${esc((result.medications_checked || []).join(', ') || '—')}. Always confirm against your local formulary.</div>
    </div>`;
  }
  const cards = interactions.map((it) => {
    const sev = String(it.severity || '').toLowerCase();
    const color = _severityColor(sev);
    const drugs = Array.isArray(it.drugs) ? it.drugs.join(' + ') : '—';
    return `<div style="padding:14px;border:1px solid ${color};background:rgba(255,255,255,.02);border-radius:12px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="font-weight:600;font-size:13px">${esc(drugs)}</div>
        <div>${_severityPill(sev)}</div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${esc(it.description || '')}</div>
      ${it.recommendation ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px"><strong style="color:var(--text-secondary)">Recommendation:</strong> ${esc(it.recommendation)}</div>` : ''}
    </div>`;
  }).join('');
  return `<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-size:12px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Interaction findings (${interactions.length})</div>
    ${cards}
  </div>`;
}

function _renderPatientDetail(patient, meds, lastResult) {
  const name = patient?.name || patient?.patient_name || 'Patient';
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0 14px">
      <div style="font-size:12px;color:var(--text-tertiary)">${esc(meds.length)} active medication${meds.length === 1 ? '' : 's'}</div>
      <button type="button" class="btn btn-primary btn-sm" data-action="check-interactions" ${meds.length < 2 ? 'disabled' : ''} style="min-height:44px" title="${meds.length < 2 ? 'Add at least 2 medications to check interactions' : ''}">Check interactions</button>
    </div>
    <div data-med-list-slot>${_renderMedList(meds, name)}</div>
    ${_renderAddForm()}
    <div data-interaction-results>${_renderInteractionResults(lastResult)}</div>`;
}

function _normaliseMedList(resp) {
  if (Array.isArray(resp?.items)) return resp.items;
  if (Array.isArray(resp?.medications)) return resp.medications;
  if (Array.isArray(resp)) return resp;
  return [];
}

function _normaliseLog(resp) {
  if (Array.isArray(resp?.items)) return resp.items;
  if (Array.isArray(resp)) return resp;
  return [];
}

function _enrichLogWithNames(items) {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  return items.map((it) => {
    if (it.patient_name) return it;
    const match = personas.find((p) => p.id === it.patient_id);
    return { ...it, patient_name: match ? match.name : it.patient_id };
  });
}

export async function pgMedicationAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Medication Analyzer',
      subtitle: 'Polypharmacy safety · interaction screening',
    });
  } catch {
    try { setTopbar('Medication Analyzer', 'Polypharmacy safety'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let view = 'log';
  let logCache = null;
  let activePatientId = null;
  let activePatientName = '';
  let medsCache = [];
  let lastInteractionResult = null;
  let usingFixtures = false;

  el.innerHTML = `
    <div class="ds-medication-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="ma-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Interaction findings are heuristic screens, not a substitute for a pharmacist review. Always confirm against your local formulary before prescribing.
      </div>
      <div id="ma-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="ma-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('ma-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function setBreadcrumb() {
    const bc = $('ma-breadcrumb');
    if (!bc) return;
    if (view === 'log') {
      bc.innerHTML = `<span style="font-weight:600">Clinic interaction log</span>`;
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="ma-back" style="min-height:44px">← Back to log</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('ma-back')?.addEventListener('click', () => { view = 'log'; lastInteractionResult = null; render(); });
    }
  }

  function _openPatient(pid, pname) {
    activePatientId = pid;
    activePatientName = pname || pid;
    lastInteractionResult = null;
    view = 'patient';
    render();
  }

  async function loadLog() {
    const body = $('ma-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(5)}
    </div>`;
    try {
      const resp = await api.getMedicationInteractionLog();
      let items = _normaliseLog(resp);
      if (items.length === 0 && isDemoSession()) {
        items = ANALYZER_DEMO_FIXTURES.medication.interaction_log;
        usingFixtures = true;
      } else {
        usingFixtures = false;
      }
      logCache = _enrichLogWithNames(items);
    } catch (e) {
      if (isDemoSession()) {
        logCache = _enrichLogWithNames(ANALYZER_DEMO_FIXTURES.medication.interaction_log);
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadLog);
        return;
      }
    }
    _syncDemoBanner();
    body.innerHTML = _renderInteractionLog(logCache);
    body.querySelector('#ma-go-patients')?.addEventListener('click', () => {
      try { navigate?.('patients-v2'); } catch {}
    });
    body.querySelectorAll('tr[data-patient-id]').forEach((tr) => {
      const pid = tr.getAttribute('data-patient-id');
      const pname = tr.querySelector('td:nth-child(2)')?.textContent || pid;
      const open = () => _openPatient(pid, pname);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
  }

  async function loadPatient() {
    const body = $('ma-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(4)}
    </div>`;
    try {
      const resp = await api.getPatientMedications(activePatientId);
      let meds = _normaliseMedList(resp);
      if (meds.length === 0 && isDemoSession()) {
        meds = ANALYZER_DEMO_FIXTURES.medication.patient_medications(activePatientId);
        usingFixtures = true;
      }
      medsCache = meds;
    } catch (e) {
      if (isDemoSession()) {
        medsCache = ANALYZER_DEMO_FIXTURES.medication.patient_medications(activePatientId);
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
        return;
      }
    }
    _syncDemoBanner();
    body.innerHTML = _renderPatientDetail({ name: activePatientName }, medsCache, lastInteractionResult);
    wirePatientDetail();
  }

  function _refreshMedListInPlace() {
    const body = $('ma-body');
    if (!body) return;
    const slot = body.querySelector('[data-med-list-slot]');
    if (slot) slot.innerHTML = _renderMedList(medsCache, activePatientName);
    const btn = body.querySelector('[data-action="check-interactions"]');
    if (btn) btn.disabled = medsCache.length < 2;
    wireMedRows();
  }

  function wireMedRows() {
    const body = $('ma-body');
    body?.querySelectorAll('[data-action="remove-med"]').forEach((b) => {
      b.addEventListener('click', async () => {
        const mid = b.getAttribute('data-med-id');
        if (!mid) return;
        b.disabled = true;
        b.textContent = 'Removing…';
        try {
          if (!usingFixtures) {
            await api.removeMedication(activePatientId, mid);
          }
          medsCache = medsCache.filter((m) => m.id !== mid);
          _refreshMedListInPlace();
        } catch (e) {
          b.disabled = false;
          b.textContent = 'Remove';
          alert((e && e.message) || String(e));
        }
      });
    });
    body?.querySelector('[data-action="focus-add"]')?.addEventListener('click', () => {
      body.querySelector('[data-add-med-form] input[name="name"]')?.focus();
    });
  }

  function wirePatientDetail() {
    const body = $('ma-body');
    if (!body) return;

    wireMedRows();

    body.querySelector('[data-add-med-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const fd = new FormData(form);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        dose: String(fd.get('dose') || '').trim() || null,
        frequency: String(fd.get('frequency') || '').trim() || null,
        route: String(fd.get('route') || '').trim() || null,
      };
      if (!payload.name) {
        form.querySelector('input[name="name"]')?.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Adding…';
      try {
        let added;
        if (usingFixtures) {
          added = {
            id: `demo-med-${Date.now()}`,
            patient_id: activePatientId,
            ...payload,
            active: true,
          };
        } else {
          added = await api.addMedication(activePatientId, payload);
        }
        medsCache = [...medsCache, added];
        form.reset();
        _refreshMedListInPlace();
      } catch (e) {
        alert((e && e.message) || String(e));
      } finally {
        submit.disabled = false;
        submit.textContent = 'Add medication';
      }
    });

    body.querySelector('[data-action="check-interactions"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Checking…';
      const names = medsCache.map((m) => m.name).filter(Boolean);
      try {
        if (usingFixtures) {
          lastInteractionResult = ANALYZER_DEMO_FIXTURES.medication.check_interactions(activePatientId, names);
        } else {
          lastInteractionResult = await api.checkInteractions(names, activePatientId);
        }
      } catch (e) {
        if (isDemoSession()) {
          lastInteractionResult = ANALYZER_DEMO_FIXTURES.medication.check_interactions(activePatientId, names);
          usingFixtures = true;
          _syncDemoBanner();
        } else {
          alert((e && e.message) || String(e));
          btn.disabled = false;
          btn.textContent = old;
          return;
        }
      }
      btn.disabled = medsCache.length < 2;
      btn.textContent = old;
      const slot = body.querySelector('[data-interaction-results]');
      if (slot) slot.innerHTML = _renderInteractionResults(lastInteractionResult);
    });
  }

  function render() {
    setBreadcrumb();
    if (view === 'log') loadLog();
    else loadPatient();
  }

  render();
}

export default { pgMedicationAnalyzer };
