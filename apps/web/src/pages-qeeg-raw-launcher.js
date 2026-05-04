// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-raw-launcher.js
//
// Intake page for the Raw EEG Cleaning Workbench. Replaces the old behaviour
// where clicking "Raw Data" routed straight to the synthetic demo. The new
// flow:
//
//   /#/qeeg-raw-workbench               → this launcher (pick patient + file)
//   /#/qeeg-raw-workbench/<analysisId>  → existing workbench (pages-qeeg-raw-workbench.js)
//   /#/qeeg-raw-workbench/demo          → workbench in synthetic demo mode (preserved)
//
// The launcher itself surfaces three paths so a clinician can:
//   1) Pick an existing patient + an existing recording → open that recording.
//   2) Pick a patient and upload a new EDF → workbench opens once persisted.
//   3) Skip both, open synthetic demo data (for tour / training).
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';
import { showToast } from './helpers.js';

const PAGE_ID = 'qeeg-raw-workbench';

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toISOString().slice(0, 10);
  } catch (_e) {
    return raw;
  }
}

function _patientLabel(p) {
  if (!p) return '';
  return p.name || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.id || '';
}

function _patientList(state) {
  const q = (state.patientQuery || '').trim().toLowerCase();
  let items = state.patients || [];
  if (q) {
    items = items.filter(p => {
      const label = _patientLabel(p).toLowerCase();
      const id = String(p.id || '').toLowerCase();
      return label.includes(q) || id.includes(q);
    });
  }
  return items.slice(0, 8);
}

function _recordCard(rec, selectedId) {
  const id = rec.analysis_id || rec.id || rec.qeeg_record_id;
  const date = _fmtDate(rec.created_at || rec.recorded_at || rec.captured_at);
  const status = rec.analysis_status || rec.status || 'ready';
  const channels = rec.channels || rec.channel_count || rec.n_channels || '—';
  const duration = rec.duration_seconds
    ? `${Math.round(rec.duration_seconds / 60)}m`
    : (rec.duration || '—');
  const isSelected = id === selectedId;
  return `
    <button
      class="qrl-record${isSelected ? ' qrl-record-selected' : ''}"
      data-action="select-record"
      data-id="${esc(id)}"
      type="button"
      aria-pressed="${isSelected}">
      <div class="qrl-record-row">
        <span class="qrl-record-label">${esc(rec.session_label || rec.label || rec.title || `Recording ${id}`)}</span>
        <span class="qrl-record-status qrl-status-${esc(status)}">${esc(status)}</span>
      </div>
      <div class="qrl-record-meta">
        <span>${esc(date)}</span>
        <span>·</span>
        <span>${esc(channels)} ch</span>
        <span>·</span>
        <span>${esc(duration)}</span>
      </div>
    </button>
  `;
}

function _renderShell(state) {
  const root = document.getElementById('content');
  if (!root) return;

  const patientItems = _patientList(state);
  const selectedPatient = (state.patients || []).find(p => p.id === state.selectedPatientId);
  const records = state.records || [];
  const recordsHtml = records.length
    ? records.map(r => _recordCard(r, state.selectedRecordId)).join('')
    : `<div class="qrl-empty">No recordings yet for this patient. Upload an EDF below.</div>`;
  const canOpen = !!state.selectedRecordId;
  const canUpload = !!state.selectedPatientId && !!state.pendingFile;

  root.innerHTML = `
    <div class="qrl-page" role="main" aria-labelledby="qrl-title">
      <header class="qrl-header">
        <h1 id="qrl-title">Open EEG recording</h1>
        <p class="qrl-sub">Pick a patient and an existing recording, or upload a new EDF. The Raw Cleaning Workbench opens once a recording is selected.</p>
        <p class="qrl-cross" style="font-size:13px;margin-top:14px;max-width:52rem;line-height:1.55;color:#3d3d3d">
          After manual review and cleaning, continue in
          <button type="button" class="qrl-link" data-action="goto-analyzer" style="background:none;border:none;padding:0;font:inherit;color:var(--teal);cursor:pointer;text-decoration:underline">qEEG Analyzer</button>
          for spectral maps, AI interpretation, and reporting on the same recording.
        </p>
      </header>

      <div class="qrl-grid">
        <section class="qrl-card" aria-labelledby="qrl-patient-h">
          <div class="qrl-card-h">
            <h2 id="qrl-patient-h">1. Patient</h2>
            ${selectedPatient ? `<button class="qrl-link" data-action="clear-patient" type="button">Change</button>` : ''}
          </div>
          ${selectedPatient ? `
            <div class="qrl-selected">
              <div class="qrl-selected-name">${esc(_patientLabel(selectedPatient))}</div>
              <div class="qrl-selected-id">${esc(selectedPatient.id || '')}</div>
            </div>
          ` : `
            <label class="qrl-srlabel" for="qrl-patient-search">Search by name or ID</label>
            <input
              id="qrl-patient-search"
              class="qrl-input"
              type="search"
              autocomplete="off"
              placeholder="e.g. Asel Akman"
              value="${esc(state.patientQuery || '')}"
              aria-controls="qrl-patient-list">
            <div id="qrl-patient-list" class="qrl-patient-list" role="listbox" aria-label="Matching patients">
              ${state.patientsLoading ? `<div class="qrl-empty">Loading patients…</div>` : (
                patientItems.length
                  ? patientItems.map(p => `
                      <button
                        class="qrl-patient"
                        data-action="select-patient"
                        data-id="${esc(p.id)}"
                        role="option"
                        type="button">
                        <span class="qrl-patient-name">${esc(_patientLabel(p))}</span>
                        <span class="qrl-patient-id">${esc(p.id || '')}</span>
                      </button>`).join('')
                  : `<div class="qrl-empty">${state.patientQuery ? 'No patients match.' : 'Type to search.'}</div>`
              )}
            </div>
          `}
        </section>

        <section class="qrl-card${selectedPatient ? '' : ' qrl-card-disabled'}" aria-labelledby="qrl-record-h">
          <div class="qrl-card-h">
            <h2 id="qrl-record-h">2. Recording</h2>
            ${state.recordsLoading ? `<span class="qrl-mini">Loading…</span>` : ''}
          </div>
          ${selectedPatient ? `
            <div class="qrl-records" role="listbox" aria-label="Recent recordings">
              ${recordsHtml}
            </div>
            <div class="qrl-or"><span>or upload new</span></div>
            <label class="qrl-upload" for="qrl-file-input" data-state="${state.pendingFile ? 'staged' : 'idle'}">
              <input
                id="qrl-file-input"
                type="file"
                accept=".edf,.bdf,application/octet-stream"
                aria-describedby="qrl-upload-hint">
              <span class="qrl-upload-hint" id="qrl-upload-hint">
                ${state.pendingFile
                  ? `Ready: <strong>${esc(state.pendingFile.name)}</strong> · ${Math.round((state.pendingFile.size || 0) / 1024)} KB`
                  : 'Drop an EDF file or click to choose'}
              </span>
            </label>
          ` : `
            <div class="qrl-empty">Select a patient first.</div>
          `}
        </section>
      </div>

      <div class="qrl-actions">
        <button class="qrl-link qrl-link-muted" data-action="open-demo" type="button">
          Try with synthetic demo data instead →
        </button>
        <div class="qrl-actions-right">
          ${canUpload ? `
            <button class="qrl-btn qrl-btn-secondary" data-action="upload" type="button" ${state.uploading ? 'disabled' : ''}>
              ${state.uploading ? 'Uploading…' : 'Upload + open'}
            </button>` : ''}
          <button class="qrl-btn qrl-btn-primary" data-action="open-record" type="button" ${canOpen ? '' : 'disabled'}>
            Open Workbench
          </button>
        </div>
      </div>
    </div>
  `;
  _wireHandlers(state);
}

function _wireHandlers(state) {
  const root = document.getElementById('content');
  if (!root) return;

  const search = document.getElementById('qrl-patient-search');
  if (search) {
    search.addEventListener('input', (e) => {
      state.patientQuery = e.target.value || '';
      _renderShell(state);
      const next = document.getElementById('qrl-patient-search');
      if (next) {
        next.focus();
        const len = next.value.length;
        try { next.setSelectionRange(len, len); } catch (_e) {}
      }
    });
  }

  root.querySelectorAll('[data-action="select-patient"]').forEach(btn => {
    btn.addEventListener('click', () => _selectPatient(state, btn.dataset.id));
  });

  root.querySelectorAll('[data-action="clear-patient"]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedPatientId = null;
      state.records = [];
      state.selectedRecordId = null;
      state.pendingFile = null;
      state.patientQuery = '';
      _renderShell(state);
    });
  });

  root.querySelectorAll('[data-action="select-record"]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedRecordId = btn.dataset.id;
      _renderShell(state);
    });
  });

  const fileInput = document.getElementById('qrl-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      state.pendingFile = (e.target.files && e.target.files[0]) || null;
      state.selectedRecordId = null;
      _renderShell(state);
    });
  }

  root.querySelectorAll('[data-action="open-record"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.selectedRecordId) return;
      _openWorkbench(state.selectedRecordId);
    });
  });

  root.querySelectorAll('[data-action="upload"]').forEach(btn => {
    btn.addEventListener('click', () => _uploadAndOpen(state));
  });

  root.querySelectorAll('[data-action="open-demo"]').forEach(btn => {
    btn.addEventListener('click', () => _openWorkbench('demo'));
  });

  root.querySelectorAll('[data-action="goto-analyzer"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof window._nav === 'function') window._nav('qeeg-analysis');
      else window.location.hash = '#/qeeg-analysis';
    });
  });
}

async function _selectPatient(state, patientId) {
  state.selectedPatientId = patientId;
  state.selectedRecordId = null;
  state.pendingFile = null;
  state.recordsLoading = true;
  state.records = [];
  _renderShell(state);

  // Demo patient — return synthetic demo recordings directly
  const pat = (state.patients || []).find(p => p.id === patientId);
  if (pat && pat._isDemo) {
    state.records = DEMO_RECORDS;
    state.selectedRecordId = 'demo';
    state.recordsLoading = false;
    _renderShell(state);
    return;
  }

  try {
    const res = await api.listQEEGRecords({ patient_id: patientId });
    state.records = (res && (res.items || res.records || res)) || [];
  } catch (_e) {
    state.records = [];
  } finally {
    state.recordsLoading = false;
    _renderShell(state);
  }
}

async function _uploadAndOpen(state) {
  if (!state.pendingFile || !state.selectedPatientId || state.uploading) return;
  state.uploading = true;
  _renderShell(state);
  try {
    const fd = new FormData();
    fd.append('file', state.pendingFile);
    fd.append('patient_id', state.selectedPatientId);
    const res = await api.uploadQEEGAnalysis(fd);
    const id = res && (res.analysis_id || res.id);
    if (!id) throw new Error('Upload returned no analysis id.');
    showToast({ kind: 'success', message: 'Recording uploaded — opening workbench.' });
    _openWorkbench(id);
  } catch (e) {
    showToast({ kind: 'error', message: 'Upload failed: ' + (e && e.message ? e.message : 'unknown error') });
    state.uploading = false;
    _renderShell(state);
  }
}

function _openWorkbench(analysisId) {
  if (!analysisId) return;
  // Set the global so the workbench route handler picks it up
  window._qeegSelectedId = String(analysisId);
  if (typeof window._nav === 'function') {
    window._nav(PAGE_ID);
    return;
  }
  window.location.hash = `#/${PAGE_ID}/${encodeURIComponent(String(analysisId))}`;
}

// ── Demo patient & recording ────────────────────────────────────────────────
const DEMO_PATIENT = {
  id: 'demo-patient-001',
  name: 'Demo Patient (Synthetic)',
  first_name: 'Demo',
  last_name: 'Patient',
  _isDemo: true,
};

const DEMO_RECORDS = [
  {
    analysis_id: 'demo',
    label: 'Synthetic 19-ch EEG — eyes open/closed',
    status: 'ready',
    channels: 19,
    duration_seconds: 120,
    created_at: new Date().toISOString(),
    _isDemo: true,
  },
];

export async function pgQEEGRawLauncher(setTopbar /* , navigate */) {
  if (typeof setTopbar === 'function') setTopbar('Raw EEG — open recording');

  const state = {
    patients: [],
    patientsLoading: true,
    patientQuery: '',
    selectedPatientId: null,
    records: [],
    recordsLoading: false,
    selectedRecordId: null,
    pendingFile: null,
    uploading: false,
  };

  // Pre-select if app exposes a current patient (clinician already deep in a profile).
  const ctxPatient = window._profilePatientId || window._selectedPatientId || null;

  _renderShell(state);

  try {
    const res = await api.listPatients({ limit: 100 });
    state.patients = (res && (res.items || res.patients || res)) || [];
  } catch (_e) {
    state.patients = [];
  } finally {
    state.patientsLoading = false;
  }

  // Inject demo patient when API is unavailable or returned no patients
  if (!state.patients.length) {
    state.patients = [DEMO_PATIENT];
  }

  if (ctxPatient && state.patients.some(p => p.id === ctxPatient)) {
    await _selectPatient(state, ctxPatient);
  } else {
    _renderShell(state);
  }
}
