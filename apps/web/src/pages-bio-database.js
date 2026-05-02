import { api } from './api.js';
import { currentUser } from './auth.js';
import { emptyState, showToast } from './helpers.js';

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function bioResolvePatientId() {
  try {
    return window._selectedPatientId
      || window._profilePatientId
      || sessionStorage.getItem('ds_pat_selected_id')
      || '';
  } catch (_) {
    return window._selectedPatientId || window._profilePatientId || '';
  }
}

export function bioNormalizeArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function _canSeedCatalog() {
  const role = String(currentUser?.role || '').toLowerCase();
  return role === 'admin' || role === 'clinician' || role === 'supervisor';
}

function _contentEl() {
  return document.getElementById('content') || document.getElementById('main-content');
}

function _injectStylesOnce() {
  if (window.__bioDatabaseStylesInjected) return;
  window.__bioDatabaseStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .bio-db-page{max-width:1320px;margin:0 auto;padding:18px 18px 36px}
    .bio-db-stack{display:grid;gap:14px}
    .bio-db-context,.bio-db-card,.bio-db-panel{background:var(--surface-1);border:1px solid var(--border);border-radius:16px}
    .bio-db-context,.bio-db-card{padding:16px 18px}
    .bio-db-panel{padding:16px}
    .bio-db-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:8px}
    .bio-db-title{font-size:26px;font-weight:750;color:var(--text);margin:0}
    .bio-db-subtitle{font-size:13px;line-height:1.7;color:var(--text-secondary);margin-top:8px}
    .bio-db-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .bio-db-stat{padding:14px 16px}
    .bio-db-stat-value{font-size:28px;font-weight:800;color:var(--text)}
    .bio-db-stat-label{font-size:12px;color:var(--text-secondary);margin-top:6px}
    .bio-db-layout{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .bio-db-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
    .bio-db-panel-title{font-size:17px;font-weight:700;color:var(--text);margin:0}
    .bio-db-panel-note{font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.6}
    .bio-db-form{display:grid;gap:10px;margin-bottom:14px}
    .bio-db-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .bio-db-field{display:grid;gap:6px}
    .bio-db-field span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary)}
    .bio-db-input,.bio-db-select,.bio-db-textarea{width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:10px 12px;font-size:13px}
    .bio-db-textarea{min-height:78px;resize:vertical}
    .bio-db-list{display:grid;gap:10px}
    .bio-db-row{padding:12px 14px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,0.02)}
    .bio-db-row-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .bio-db-row-title{font-size:14px;font-weight:700;color:var(--text)}
    .bio-db-row-sub{font-size:12px;color:var(--text-secondary);margin-top:3px}
    .bio-db-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .bio-db-pill{font-size:11px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,0.06);color:var(--text-secondary);border:1px solid rgba(255,255,255,0.08)}
    .bio-db-warning{padding:12px 14px;border-radius:12px;border:1px solid rgba(255,181,71,0.2);background:rgba(255,181,71,0.08);color:var(--amber);font-size:12.5px;line-height:1.6}
    .bio-db-error{padding:12px 14px;border-radius:12px;border:1px solid rgba(255,107,107,0.22);background:rgba(255,107,107,0.08);color:var(--red);font-size:12.5px;line-height:1.6}
    .bio-db-empty{padding:20px 10px;text-align:center;color:var(--text-tertiary);font-size:12.5px}
    .bio-db-actions{display:flex;gap:8px;flex-wrap:wrap}
    @media (max-width:1100px){.bio-db-layout,.bio-db-summary,.bio-db-form-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

const STATE = {
  patientId: '',
  patient: null,
  summary: null,
  catalog: [],
  substances: [],
  labs: [],
  loadError: '',
  loading: false,
  busy: false,
};

let _navigateRef = null;
let _setTopbarRef = null;

function _patientLabel() {
  const patient = STATE.patient || {};
  const summaryPatient = STATE.summary?.patient || {};
  return patient.display_name
    || patient.name
    || summaryPatient.display_name
    || summaryPatient.name
    || STATE.patientId
    || 'Selected patient';
}

function _patientSubtitle() {
  const patient = STATE.patient || {};
  const summaryPatient = STATE.summary?.patient || {};
  const bits = [
    patient.mrn || summaryPatient.mrn,
    patient.email || summaryPatient.email,
    patient.primary_condition || summaryPatient.primary_condition,
  ].filter(Boolean);
  return bits.join(' · ');
}

function _catalogSummary() {
  const items = bioNormalizeArray(STATE.catalog);
  const substanceItems = items.filter((item) => {
    const kind = String(item?.item_type || item?.type || item?.category || '').toLowerCase();
    return kind.includes('med') || kind.includes('supp') || kind.includes('vit') || kind.includes('substance');
  });
  const labItems = items.filter((item) => {
    const kind = String(item?.item_type || item?.type || item?.category || '').toLowerCase();
    return kind.includes('lab') || kind.includes('bio');
  });
  return { total: items.length, substances: substanceItems, labs: labItems };
}

function _counts() {
  const summary = STATE.summary || {};
  const substances = bioNormalizeArray(STATE.substances);
  const labs = bioNormalizeArray(STATE.labs);
  const activeSubstances = substances.filter((item) => {
    const status = String(item?.status || item?.state || '').toLowerCase();
    return status === 'active' || status === 'current';
  }).length;
  const abnormalLabs = labs.filter((item) => {
    const flag = String(item?.flag || item?.status || item?.abnormal_flag || '').toLowerCase();
    return flag === 'abnormal' || flag === 'high' || flag === 'low' || flag === 'critical' || flag === 'out_of_range';
  }).length;
  return {
    substances: Number(summary.substance_count ?? summary.substances_count ?? substances.length),
    activeSubstances: Number(summary.active_substance_count ?? activeSubstances),
    labs: Number(summary.lab_count ?? summary.labs_count ?? labs.length),
    abnormalLabs: Number(summary.abnormal_lab_count ?? abnormalLabs),
  };
}

function _catalogOptions(items) {
  return items.map((item) => {
    const id = item?.id || item?.catalog_item_id || item?.slug || item?.name;
    const label = item?.name || item?.label || item?.title || id;
    return `<option value="${esc(id)}">${esc(label)}</option>`;
  }).join('');
}

function _renderRowMeta(bits) {
  const clean = bits.filter(Boolean);
  if (!clean.length) return '';
  return `<div class="bio-db-meta">${clean.map((bit) => `<span class="bio-db-pill">${esc(bit)}</span>`).join('')}</div>`;
}

function _substanceId(item) {
  return item?.id || item?.substance_id || item?.patient_substance_id || '';
}

function _labId(item) {
  return item?.id || item?.lab_id || item?.patient_lab_result_id || '';
}

function _renderSubstancesPanel() {
  const catalog = _catalogSummary().substances;
  const rows = bioNormalizeArray(STATE.substances);
  return `<section class="bio-db-panel">
    <div class="bio-db-panel-head">
      <div>
        <h2 class="bio-db-panel-title">Substances</h2>
        <div class="bio-db-panel-note">Medications, supplements, vitamins, and other tracked substances relevant to neuromodulation review.</div>
      </div>
      <div class="bio-db-actions">
        ${_canSeedCatalog() ? `<button class="btn btn-ghost btn-sm" onclick="window._bioSeedCatalog()" ${STATE.busy ? 'disabled' : ''}>Seed catalog</button>` : ''}
      </div>
    </div>
    <form class="bio-db-form" onsubmit="window._bioSubmitSubstance(event)">
      <div class="bio-db-form-grid">
        <label class="bio-db-field"><span>Catalog match</span><select id="bio-substance-catalog" class="bio-db-select"><option value="">Optional catalog item</option>${_catalogOptions(catalog)}</select></label>
        <label class="bio-db-field"><span>Type</span><select id="bio-substance-kind" class="bio-db-select"><option value="medication">Medication</option><option value="supplement">Supplement</option><option value="vitamin">Vitamin</option><option value="other">Other</option></select></label>
        <label class="bio-db-field"><span>Name</span><input id="bio-substance-name" class="bio-db-input" placeholder="Sertraline, magnesium glycinate, vitamin D3" required></label>
        <label class="bio-db-field"><span>Status</span><select id="bio-substance-status" class="bio-db-select"><option value="active">Active</option><option value="paused">Paused</option><option value="stopped">Stopped</option></select></label>
        <label class="bio-db-field"><span>Dose</span><input id="bio-substance-dose" class="bio-db-input" placeholder="50 mg daily"></label>
        <label class="bio-db-field"><span>Started at</span><input id="bio-substance-started-at" class="bio-db-input" type="date"></label>
      </div>
      <label class="bio-db-field"><span>Notes</span><textarea id="bio-substance-notes" class="bio-db-textarea" placeholder="Reason, response, adherence issues, seizure-threshold relevance"></textarea></label>
      <div class="bio-db-actions"><button class="btn btn-primary btn-sm" type="submit" ${STATE.busy ? 'disabled' : ''}>Add substance</button></div>
    </form>
    <div class="bio-db-list">
      ${rows.length ? rows.map((item) => {
        const id = _substanceId(item);
        const title = item?.name || item?.substance_name || item?.catalog_name || 'Untitled substance';
        const subtitle = [
          item?.kind || item?.type || item?.category,
          item?.status || item?.state,
        ].filter(Boolean).join(' · ');
        return `<div class="bio-db-row">
          <div class="bio-db-row-head">
            <div>
              <div class="bio-db-row-title">${esc(title)}</div>
              <div class="bio-db-row-sub">${esc(subtitle || 'Patient substance')}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="window._bioDeleteSubstance('${esc(id)}')" ${STATE.busy || !id ? 'disabled' : ''}>Delete</button>
          </div>
          ${_renderRowMeta([
            item?.dose,
            item?.started_at ? `Started ${String(item.started_at).slice(0, 10)}` : '',
            item?.catalog_item_id ? `Catalog ${item.catalog_item_id}` : '',
          ])}
          ${item?.notes ? `<div class="bio-db-panel-note" style="margin-top:10px">${esc(item.notes)}</div>` : ''}
        </div>`;
      }).join('') : '<div class="bio-db-empty">No substances recorded for this patient yet.</div>'}
    </div>
  </section>`;
}

function _renderLabsPanel() {
  const catalog = _catalogSummary().labs;
  const rows = bioNormalizeArray(STATE.labs);
  return `<section class="bio-db-panel">
    <div class="bio-db-panel-head">
      <div>
        <h2 class="bio-db-panel-title">Lab results</h2>
        <div class="bio-db-panel-note">Track blood tests and biomarker results that may influence protocol planning, safety, or response interpretation.</div>
      </div>
      <div class="bio-db-actions">
        ${_canSeedCatalog() ? `<button class="btn btn-ghost btn-sm" onclick="window._bioSeedCatalog()" ${STATE.busy ? 'disabled' : ''}>Seed catalog</button>` : ''}
      </div>
    </div>
    <form class="bio-db-form" onsubmit="window._bioSubmitLab(event)">
      <div class="bio-db-form-grid">
        <label class="bio-db-field"><span>Catalog match</span><select id="bio-lab-catalog" class="bio-db-select"><option value="">Optional catalog item</option>${_catalogOptions(catalog)}</select></label>
        <label class="bio-db-field"><span>Flag</span><select id="bio-lab-flag" class="bio-db-select"><option value="normal">Normal</option><option value="abnormal">Abnormal</option><option value="critical">Critical</option><option value="unknown">Unknown</option></select></label>
        <label class="bio-db-field"><span>Test name</span><input id="bio-lab-name" class="bio-db-input" placeholder="Ferritin, vitamin D, TSH, hs-CRP" required></label>
        <label class="bio-db-field"><span>Collected at</span><input id="bio-lab-collected-at" class="bio-db-input" type="date"></label>
        <label class="bio-db-field"><span>Value</span><input id="bio-lab-value" class="bio-db-input" placeholder="32"></label>
        <label class="bio-db-field"><span>Unit</span><input id="bio-lab-unit" class="bio-db-input" placeholder="ng/mL"></label>
      </div>
      <label class="bio-db-field"><span>Reference range / notes</span><textarea id="bio-lab-notes" class="bio-db-textarea" placeholder="Reference range, fasting status, lab source, interpretation note"></textarea></label>
      <div class="bio-db-actions"><button class="btn btn-primary btn-sm" type="submit" ${STATE.busy ? 'disabled' : ''}>Add lab result</button></div>
    </form>
    <div class="bio-db-list">
      ${rows.length ? rows.map((item) => {
        const id = _labId(item);
        const title = item?.name || item?.test_name || item?.biomarker_name || item?.catalog_name || 'Untitled lab';
        const value = [item?.value, item?.unit].filter(Boolean).join(' ');
        const subtitle = [
          item?.flag || item?.status || item?.abnormal_flag,
          item?.collected_at ? String(item.collected_at).slice(0, 10) : '',
        ].filter(Boolean).join(' · ');
        return `<div class="bio-db-row">
          <div class="bio-db-row-head">
            <div>
              <div class="bio-db-row-title">${esc(title)}</div>
              <div class="bio-db-row-sub">${esc(subtitle || 'Patient lab result')}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="window._bioDeleteLab('${esc(id)}')" ${STATE.busy || !id ? 'disabled' : ''}>Delete</button>
          </div>
          ${_renderRowMeta([
            value,
            item?.reference_range || item?.reference || '',
            item?.catalog_item_id ? `Catalog ${item.catalog_item_id}` : '',
          ])}
          ${item?.notes ? `<div class="bio-db-panel-note" style="margin-top:10px">${esc(item.notes)}</div>` : ''}
        </div>`;
      }).join('') : '<div class="bio-db-empty">No lab results recorded for this patient yet.</div>'}
    </div>
  </section>`;
}

function _renderPage() {
  const el = _contentEl();
  if (!el) return;
  const counts = _counts();
  const catalogInfo = _catalogSummary();
  const patientLabel = _patientLabel();
  const patientSubtitle = _patientSubtitle();
  el.innerHTML = `<div class="bio-db-page">
    <div class="bio-db-stack">
      <section class="bio-db-context">
        <div class="bio-db-eyebrow">Patient bio context</div>
        <h1 class="bio-db-title">${esc(patientLabel)}</h1>
        <div class="bio-db-subtitle">
          ${esc(patientSubtitle || 'Use this page to capture substances and lab signals that can confound, contextualize, or support neuromodulation decisions.')}
        </div>
      </section>
      ${STATE.loadError ? `<div class="bio-db-error">${esc(STATE.loadError)}</div>` : ''}
      ${!catalogInfo.total && _canSeedCatalog() ? `<div class="bio-db-warning">The bio catalog is empty. Seed it to preload common medications, supplements, vitamins, labs, and biomarkers.</div>` : ''}
      <section class="bio-db-summary">
        <div class="bio-db-card bio-db-stat"><div class="bio-db-stat-value">${counts.substances}</div><div class="bio-db-stat-label">Tracked substances</div></div>
        <div class="bio-db-card bio-db-stat"><div class="bio-db-stat-value">${counts.activeSubstances}</div><div class="bio-db-stat-label">Active substances</div></div>
        <div class="bio-db-card bio-db-stat"><div class="bio-db-stat-value">${counts.labs}</div><div class="bio-db-stat-label">Lab results</div></div>
        <div class="bio-db-card bio-db-stat"><div class="bio-db-stat-value">${counts.abnormalLabs}</div><div class="bio-db-stat-label">Flagged labs</div></div>
      </section>
      <div class="bio-db-layout">
        ${_renderSubstancesPanel()}
        ${_renderLabsPanel()}
      </div>
    </div>
  </div>`;
}

function _setTopbar() {
  const subtitle = STATE.patientId
    ? `${_patientLabel()}${STATE.patientId ? ` · ${STATE.patientId}` : ''}`
    : 'Open from a patient context';
  const actions = [
    '<button class="btn btn-ghost btn-sm" onclick="window._bioRefresh?.()">Refresh</button>',
  ];
  if (STATE.patientId && _navigateRef) {
    actions.push(
      '<button class="btn btn-ghost btn-sm" onclick="window._bioOpenPatientProfile?.()">Patient Profile</button>'
    );
  }
  if (_canSeedCatalog()) {
    actions.push(
      '<button class="btn btn-primary btn-sm" onclick="window._bioSeedCatalog?.()">Seed Catalog</button>'
    );
  }
  _setTopbarRef?.('Bio Database', `<span style="font-size:12px;color:var(--text-tertiary);margin-right:10px">${esc(subtitle)}</span>${actions.join('')}`);
}

async function _loadData() {
  STATE.loading = true;
  STATE.loadError = '';
  _setTopbar();
  const patientId = STATE.patientId;
  const requests = await Promise.allSettled([
    api.getPatient(patientId),
    api.getPatientBioSummary(patientId),
    api.listBioCatalog(),
    api.listPatientBioSubstances(patientId),
    api.listPatientBioLabs(patientId),
  ]);
  const [patientRes, summaryRes, catalogRes, substancesRes, labsRes] = requests;
  if (patientRes.status === 'fulfilled') STATE.patient = patientRes.value || null;
  if (summaryRes.status === 'fulfilled') STATE.summary = summaryRes.value || null;
  if (catalogRes.status === 'fulfilled') STATE.catalog = bioNormalizeArray(catalogRes.value);
  if (substancesRes.status === 'fulfilled') STATE.substances = bioNormalizeArray(substancesRes.value);
  if (labsRes.status === 'fulfilled') STATE.labs = bioNormalizeArray(labsRes.value);
  const failures = requests.filter((res) => res.status === 'rejected');
  if (failures.length === requests.length) {
    STATE.loadError = failures[0]?.reason?.message || 'Bio database could not be loaded right now.';
  } else if (failures.length) {
    STATE.loadError = 'Some bio data could not be loaded. Available sections are still shown.';
  }
  STATE.loading = false;
  _setTopbar();
  _renderPage();
}

function _readInput(id) {
  return document.getElementById(id)?.value?.trim?.() || '';
}

async function _withBusy(work) {
  STATE.busy = true;
  _renderPage();
  try {
    await work();
  } finally {
    STATE.busy = false;
    _renderPage();
  }
}

async function _submitSubstance(event) {
  event?.preventDefault?.();
  if (!STATE.patientId) return;
  const name = _readInput('bio-substance-name');
  if (!name) {
    showToast('Substance name is required.', 'warning');
    return;
  }
  const payload = {
    catalog_item_id: _readInput('bio-substance-catalog') || null,
    substance_type: _readInput('bio-substance-kind') || 'medication',
    name,
    status: _readInput('bio-substance-status') || 'active',
    dose: _readInput('bio-substance-dose') || null,
    started_at: _readInput('bio-substance-started-at') || null,
    notes: _readInput('bio-substance-notes') || null,
  };
  await _withBusy(async () => {
    try {
      await api.createPatientBioSubstance(STATE.patientId, payload);
      showToast('Substance saved.', 'success');
      await _loadData();
    } catch (err) {
      showToast('Could not save substance: ' + (err?.message || 'unknown error'), 'error');
    }
  });
}

async function _submitLab(event) {
  event?.preventDefault?.();
  if (!STATE.patientId) return;
  const name = _readInput('bio-lab-name');
  if (!name) {
    showToast('Lab test name is required.', 'warning');
    return;
  }
  const payload = {
    catalog_item_id: _readInput('bio-lab-catalog') || null,
    lab_name: name,
    value_text: _readInput('bio-lab-value') || null,
    value_numeric: Number.isFinite(Number(_readInput('bio-lab-value'))) ? Number(_readInput('bio-lab-value')) : null,
    unit: _readInput('bio-lab-unit') || null,
    abnormal_flag: _readInput('bio-lab-flag') || 'unknown',
    collected_at: _readInput('bio-lab-collected-at') || null,
    reference_range_text: null,
    source_lab: null,
    notes: _readInput('bio-lab-notes') || null,
  };
  await _withBusy(async () => {
    try {
      await api.createPatientBioLab(STATE.patientId, payload);
      showToast('Lab result saved.', 'success');
      await _loadData();
    } catch (err) {
      showToast('Could not save lab result: ' + (err?.message || 'unknown error'), 'error');
    }
  });
}

async function _deleteSubstance(id) {
  if (!STATE.patientId || !id) return;
  if (!window.confirm('Delete this substance entry?')) return;
  await _withBusy(async () => {
    try {
      await api.deletePatientBioSubstance(STATE.patientId, id);
      showToast('Substance deleted.', 'success');
      await _loadData();
    } catch (err) {
      showToast('Could not delete substance: ' + (err?.message || 'unknown error'), 'error');
    }
  });
}

async function _deleteLab(id) {
  if (!STATE.patientId || !id) return;
  if (!window.confirm('Delete this lab result?')) return;
  await _withBusy(async () => {
    try {
      await api.deletePatientBioLab(STATE.patientId, id);
      showToast('Lab result deleted.', 'success');
      await _loadData();
    } catch (err) {
      showToast('Could not delete lab result: ' + (err?.message || 'unknown error'), 'error');
    }
  });
}

async function _seedCatalog() {
  if (!_canSeedCatalog()) return;
  await _withBusy(async () => {
    try {
      await api.seedBioCatalog();
      showToast('Bio catalog seeded.', 'success');
      await _loadData();
    } catch (err) {
      showToast('Could not seed bio catalog: ' + (err?.message || 'unknown error'), 'error');
    }
  });
}

function _installHandlers() {
  window._bioRefresh = () => _loadData();
  window._bioOpenPatientProfile = () => {
    if (!STATE.patientId || !_navigateRef) return;
    window._selectedPatientId = STATE.patientId;
    window._profilePatientId = STATE.patientId;
    _navigateRef('patient-profile');
  };
  window._bioSubmitSubstance = (event) => _submitSubstance(event);
  window._bioSubmitLab = (event) => _submitLab(event);
  window._bioDeleteSubstance = (id) => _deleteSubstance(id);
  window._bioDeleteLab = (id) => _deleteLab(id);
  window._bioSeedCatalog = () => _seedCatalog();
}

export async function pgBioDatabase(setTopbar, navigate) {
  _injectStylesOnce();
  _installHandlers();
  _setTopbarRef = setTopbar;
  _navigateRef = navigate;
  STATE.patientId = bioResolvePatientId();
  STATE.patient = null;
  STATE.summary = null;
  STATE.catalog = [];
  STATE.substances = [];
  STATE.labs = [];
  STATE.loadError = '';
  _setTopbar();
  const el = _contentEl();
  if (!el) return;
  if (!STATE.patientId) {
    el.innerHTML = emptyState('🧪', 'Bio Database needs a patient context', 'Open this page from a patient profile, roster, or patient-aware workspace.');
    return;
  }
  el.innerHTML = '<div style="padding:36px;text-align:center;color:var(--text-tertiary)">Loading bio database…</div>';
  await _loadData();
}
