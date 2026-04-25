import { api } from './api.js';
import { spinner } from './helpers.js';

const MODALITIES = [
  { id: 'qeeg_raw', label: 'qEEG raw' },
  { id: 'qeeg_features', label: 'qEEG features' },
  { id: 'mri_structural', label: 'MRI structural' },
  { id: 'fmri', label: 'fMRI' },
  { id: 'wearables', label: 'Wearables' },
  { id: 'in_clinic_therapy', label: 'In-clinic therapy logs' },
  { id: 'home_therapy', label: 'Home therapy logs' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'assessments', label: 'Assessments' },
  { id: 'ehr_text', label: 'EHR text' },
];

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function _getSelectedPatientId() {
  return window._selectedPatientId || window._profilePatientId || sessionStorage.getItem('ds_pat_selected_id') || '';
}

function _defaultSelection() {
  return ['qeeg_features', 'assessments', 'wearables'];
}

function _ensurePatientOrPrompt() {
  const id = _getSelectedPatientId();
  if (id) return id;
  if (window._showToast) window._showToast('Select a patient first.', 'warning');
  else alert('Select a patient first.');
  window._nav('patients-v2');
  return '';
}

function _injectStylesOnce() {
  if (window.__deeptwinStylesInjected) return;
  window.__deeptwinStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .dt-grid{display:grid;grid-template-columns:380px 1fr;gap:14px}
    .dt-chkcol{display:flex;flex-direction:column;gap:8px}
    .dt-chkrow{display:flex;gap:10px;align-items:center;font-size:13px;color:var(--text)}
    .dt-chkrow input{accent-color:var(--teal)}
    .dt-select,.dt-input{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:10px 12px;font-size:13px}
    .dt-seg{border:1px solid var(--border);background:var(--surface-1);color:var(--text);border-radius:999px;padding:8px 12px;font-size:12.5px}
    .dt-seg.active{border-color:rgba(0,212,188,.55);box-shadow:0 0 0 3px rgba(0,212,188,.10)}
    .dt-mono{font-family:var(--font-mono,'JetBrains Mono',monospace)}
    .dt-json{margin:0;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;padding:12px;overflow:auto;max-height:420px;font-size:11.5px}
  `;
  document.head.appendChild(style);
}

function _render(setTopbar) {
  const el = document.getElementById('content');
  const patientId = _getSelectedPatientId();
  const selected = (window._deeptwin_modalities || (window._deeptwin_modalities = _defaultSelection())).slice();
  const mode = window._deeptwin_mode || 'prediction';
  const combine = window._deeptwin_combine || 'all_selected';
  const protoId = window._deeptwin_protocol_id || 'proto_default';

  setTopbar?.({
    title: 'Deeptwin',
    subtitle: patientId ? `Patient: ${patientId}` : 'Select a patient to run analyses',
    actions: [
      { label: 'Patients', onClick: () => window._nav('patients-v2') },
      { label: 'Patient Profile', onClick: () => { if (patientId) { window._selectedPatientId = patientId; window._profilePatientId = patientId; window._nav('patient-profile'); } } },
    ],
  });

  const modalityList = MODALITIES.map(m => `
    <label class="dt-chkrow">
      <input type="checkbox" ${selected.includes(m.id) ? 'checked' : ''} onchange="window._deeptwinToggleModality('${_esc(m.id)}', this.checked)" />
      <span>${_esc(m.label)}</span>
    </label>
  `).join('');

  el.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding:18px 18px 32px">
      <div class="card" style="padding:16px 16px 10px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
          <div>
            <div style="font-size:13px;color:var(--text-tertiary)">Decision-support only</div>
            <div style="font-size:18px;font-weight:650;margin-top:2px">Choose data, combine, analyze, simulate</div>
            <div style="font-size:12.5px;color:var(--text-tertiary);margin-top:6px;max-width:860px">
              Clinicians choose modalities (text, video, audio, qEEG, MRI, wearables, device logs), run correlation/prediction/causation analyses, then simulate protocol changes.
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-ghost btn-sm" onclick="window._deeptwinPickPatient()">Select patient</button>
            <button class="btn btn-primary btn-sm" onclick="window._deeptwinRun()">Run</button>
          </div>
        </div>
      </div>

      <div class="dt-grid" style="margin-top:14px">
        <div class="card" style="padding:14px">
          <div style="font-weight:650;margin-bottom:8px">Data to include</div>
          <div class="dt-chkcol">${modalityList}</div>
          <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
            <div style="font-weight:650;margin-bottom:8px">Combine strategy</div>
            <select class="dt-select" onchange="window._deeptwinSetCombine(this.value)">
              <option value="all_selected" ${combine==='all_selected'?'selected':''}>All selected (equal weight)</option>
              <option value="minimal_viable" ${combine==='minimal_viable'?'selected':''}>Minimal viable (qEEG + assessments + wearables)</option>
              <option value="custom_weights" ${combine==='custom_weights'?'selected':''}>Custom weights (advanced)</option>
            </select>
          </div>
        </div>

        <div>
          <div class="card" style="padding:14px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <div style="font-weight:650">Analysis</div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button class="dt-seg ${mode==='correlation'?'active':''}" onclick="window._deeptwinSetMode('correlation')">Correlation</button>
                <button class="dt-seg ${mode==='prediction'?'active':''}" onclick="window._deeptwinSetMode('prediction')">Prediction</button>
                <button class="dt-seg ${mode==='causation'?'active':''}" onclick="window._deeptwinSetMode('causation')">Causation</button>
              </div>
            </div>
            <div id="deeptwin-results" style="margin-top:12px">
              <div style="color:var(--text-tertiary);font-size:12.5px">Run Deeptwin to see results.</div>
            </div>
          </div>

          <div class="card" style="padding:14px;margin-top:14px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <div style="font-weight:650">Protocol simulation (autoresearch-backed)</div>
              <div style="display:flex;gap:8px;align-items:center">
                <input class="dt-input" style="width:220px" value="${_esc(protoId)}" placeholder="protocol_id"
                  oninput="window._deeptwin_protocol_id=this.value" />
                <button class="btn btn-ghost btn-sm" onclick="window._deeptwinSimulate()">Simulate</button>
              </div>
            </div>
            <div id="deeptwin-sim" style="margin-top:10px"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function _renderResults(data) {
  const box = document.getElementById('deeptwin-results');
  if (!box) return;
  box.innerHTML = `<pre class="dt-json">${_esc(JSON.stringify(data || {}, null, 2))}</pre>`;
}

function _renderSim(data) {
  const box = document.getElementById('deeptwin-sim');
  if (!box) return;
  box.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:6px">Engine: <span class="dt-mono">${_esc(data.engine?.name || 'unknown')}</span></div>
    <pre class="dt-json">${_esc(JSON.stringify(data.outputs || {}, null, 2))}</pre>`;
}

function _wireHandlers(setTopbar) {
  window._deeptwinPickPatient = function() {
    if (window._showToast) window._showToast('Pick a patient from Patients, then return to Deeptwin.', 'info');
    window._nav('patients-v2');
  };

  window._deeptwinToggleModality = function(id, checked) {
    const cur = new Set(window._deeptwin_modalities || _defaultSelection());
    if (checked) cur.add(id); else cur.delete(id);
    window._deeptwin_modalities = Array.from(cur);
  };

  window._deeptwinSetMode = function(m) {
    window._deeptwin_mode = m;
    _render(setTopbar);
  };

  window._deeptwinSetCombine = function(v) {
    window._deeptwin_combine = v;
  };

  window._deeptwinRun = async function() {
    const patient_id = _ensurePatientOrPrompt();
    if (!patient_id) return;
    const resEl = document.getElementById('deeptwin-results');
    if (resEl) resEl.innerHTML = spinner();
    try {
      const mode = window._deeptwin_mode || 'prediction';
      const payload = {
        patient_id,
        modalities: (window._deeptwin_modalities || _defaultSelection()).slice(),
        combine: window._deeptwin_combine || 'all_selected',
        analysis_modes: [mode],
      };
      const data = await api.deeptwinAnalyze(payload);
      _renderResults(data);
    } catch (e) {
      if (resEl) resEl.innerHTML = `<div style="color:var(--red);font-size:12.5px">Deeptwin failed: ${_esc(e.message || e)}</div>`;
    }
  };

  window._deeptwinSimulate = async function() {
    const patient_id = _ensurePatientOrPrompt();
    if (!patient_id) return;
    const box = document.getElementById('deeptwin-sim');
    if (box) box.innerHTML = spinner();
    try {
      const payload = {
        patient_id,
        protocol_id: window._deeptwin_protocol_id || 'proto_default',
        horizon_days: 90,
        modalities: (window._deeptwin_modalities || _defaultSelection()).slice(),
      };
      const data = await api.deeptwinSimulate(payload);
      _renderSim(data);
    } catch (e) {
      if (box) box.innerHTML = `<div style="color:var(--red);font-size:12.5px">Simulation failed: ${_esc(e.message || e)}</div>`;
    }
  };
}

export async function pgDeeptwin(setTopbar, navigate) {
  _injectStylesOnce();
  window._deeptwinNavigate = navigate;
  _wireHandlers(setTopbar);
  _render(setTopbar);
}

