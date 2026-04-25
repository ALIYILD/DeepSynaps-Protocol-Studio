import { api } from './api.js';
import { spinner } from './helpers.js';

// Brain Twin (clinician-facing) v0 implementation
// This page is a rebranded successor to the legacy Deeptwin page ID.
// It preserves the existing "analyze/simulate" wiring while the full Brain Twin
// surfaces (/clinical/brain-twin/:patient_id, /admin/learning-loop) are implemented.

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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  if (window.__brainTwinStylesInjected) return;
  window.__brainTwinStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .bt-grid{display:grid;grid-template-columns:380px 1fr;gap:14px}
    .bt-chkcol{display:flex;flex-direction:column;gap:8px}
    .bt-chkrow{display:flex;gap:10px;align-items:center;font-size:13px;color:var(--text)}
    .bt-chkrow input{accent-color:var(--teal)}
    .bt-select,.bt-input{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:10px 12px;font-size:13px}
    .bt-seg{border:1px solid var(--border);background:var(--surface-1);color:var(--text);border-radius:999px;padding:8px 12px;font-size:12.5px}
    .bt-seg.active{border-color:rgba(0,212,188,.55);box-shadow:0 0 0 3px rgba(0,212,188,.10)}
    .bt-mono{font-family:var(--font-mono,'JetBrains Mono',monospace)}
    .bt-json{margin:0;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;padding:12px;overflow:auto;max-height:420px;font-size:11.5px}
  `;
  document.head.appendChild(style);
}

function _render(setTopbar) {
  const el = document.getElementById('content');
  const patientId = _getSelectedPatientId();
  const selected = (window._brain_twin_modalities || (window._brain_twin_modalities = _defaultSelection())).slice();
  const mode = window._brain_twin_mode || 'prediction';
  const combine = window._brain_twin_combine || 'all_selected';
  const protoId = window._brain_twin_protocol_id || 'proto_default';

  setTopbar?.({
    title: 'Brain Twin',
    subtitle: patientId ? `Patient: ${patientId}` : 'Select a patient to run analyses',
    actions: [
      { label: 'Patients', onClick: () => window._nav('patients-v2') },
      { label: 'Patient Profile', onClick: () => { if (patientId) { window._selectedPatientId = patientId; window._profilePatientId = patientId; window._nav('patient-profile'); } } },
    ],
  });

  const modalityList = MODALITIES.map(m => `
    <label class="bt-chkrow">
      <input type="checkbox" ${selected.includes(m.id) ? 'checked' : ''} onchange="window._brainTwinToggleModality('${_esc(m.id)}', this.checked)" />
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
            <button class="btn btn-ghost btn-sm" onclick="window._brainTwinPickPatient()">Select patient</button>
            <button class="btn btn-primary btn-sm" onclick="window._brainTwinRun()">Run</button>
          </div>
        </div>
      </div>

      <div class="bt-grid" style="margin-top:14px">
        <div class="card" style="padding:14px">
          <div style="font-weight:650;margin-bottom:8px">Data to include</div>
          <div class="bt-chkcol">${modalityList}</div>
          <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
            <div style="font-weight:650;margin-bottom:8px">Combine strategy</div>
            <select class="bt-select" onchange="window._brainTwinSetCombine(this.value)">
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
                <button class="bt-seg ${mode==='correlation'?'active':''}" onclick="window._brainTwinSetMode('correlation')">Correlation</button>
                <button class="bt-seg ${mode==='prediction'?'active':''}" onclick="window._brainTwinSetMode('prediction')">Prediction</button>
                <button class="bt-seg ${mode==='causation'?'active':''}" onclick="window._brainTwinSetMode('causation')">Causation</button>
              </div>
            </div>
            <div id="brain-twin-results" style="margin-top:12px">
              <div style="color:var(--text-tertiary);font-size:12.5px">Run Brain Twin to see results.</div>
            </div>
          </div>

          <div class="card" style="padding:14px;margin-top:14px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <div style="font-weight:650">Protocol simulation (autoresearch-backed)</div>
              <div style="display:flex;gap:8px;align-items:center">
                <input class="bt-input" style="width:220px" value="${_esc(protoId)}" placeholder="protocol_id"
                  oninput="window._brain_twin_protocol_id=this.value" />
                <button class="btn btn-ghost btn-sm" onclick="window._brainTwinSimulate()">Simulate</button>
              </div>
            </div>
            <div id="brain-twin-sim" style="margin-top:10px"></div>
          </div>

          <div class="card" style="padding:14px;margin-top:14px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <div style="font-weight:650">Evidence (87k-paper index)</div>
              <div style="display:flex;gap:8px;align-items:center">
                <input id="brain-twin-evidence-q" class="bt-input" style="width:320px" placeholder="Ask for evidence (e.g., rtms depression left dlPFC parameters)" />
                <button class="btn btn-ghost btn-sm" onclick="window._brainTwinEvidence()">Fetch</button>
              </div>
            </div>
            <div style="font-size:12px;color:var(--text-tertiary);margin-top:8px">
              Evidence is context for clinician review. It does not directly change predictions at runtime.
            </div>
            <div id="brain-twin-evidence" style="margin-top:10px"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function _renderResults(data) {
  const box = document.getElementById('brain-twin-results');
  if (!box) return;
  box.innerHTML = `<pre class="bt-json">${_esc(JSON.stringify(data || {}, null, 2))}</pre>`;
}

function _renderSim(data) {
  const box = document.getElementById('brain-twin-sim');
  if (!box) return;
  box.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:6px">Engine: <span class="bt-mono">${_esc(data.engine?.name || 'unknown')}</span></div>
    <pre class="bt-json">${_esc(JSON.stringify(data.outputs || {}, null, 2))}</pre>`;
}

function _renderEvidence(data) {
  const box = document.getElementById('brain-twin-evidence');
  if (!box) return;
  const papers = (data?.papers || []).slice(0, 10);
  if (!papers.length) {
    const note = (data?.notes || []).join(' ');
    box.innerHTML = `<div style="color:var(--text-tertiary);font-size:12.5px">No evidence results. ${_esc(note)}</div>`;
    return;
  }
  const items = papers.map(p => {
    const title = p.title || '(untitled)';
    const year = p.year ? ` (${p.year})` : '';
    const url = p.record_url || p.oa_url || '';
    const meta = [
      p.journal ? `Journal: ${p.journal}` : null,
      p.doi ? `DOI: ${p.doi}` : null,
      p.pmid ? `PMID: ${p.pmid}` : null,
      typeof p.citation_count === 'number' ? `Citations: ${p.citation_count}` : null,
      p.evidence_tier ? `Tier: ${p.evidence_tier}` : null,
    ].filter(Boolean).join(' · ');
    return `
      <div style="padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02);margin-bottom:10px">
        <div style="font-weight:650">${_esc(title)}${_esc(year)}</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">${_esc(meta)}</div>
        ${url ? `<div style="margin-top:6px"><a href="${_esc(url)}" target="_blank" rel="noreferrer" style="font-size:12.5px">Open source</a></div>` : ''}
      </div>
    `;
  }).join('');
  const header = `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px">
      <div style="font-weight:650">Evidence (87k-paper index)</div>
      <div class="bt-mono" style="font-size:11px;color:var(--text-tertiary)">trace_id: ${_esc(data.trace_id || '—')}</div>
    </div>`;
  box.innerHTML = header + items;
}

function _wireHandlers(setTopbar) {
  window._brainTwinPickPatient = function() {
    if (window._showToast) window._showToast('Pick a patient from Patients, then return to Brain Twin.', 'info');
    window._nav('patients-v2');
  };

  window._brainTwinToggleModality = function(id, checked) {
    const cur = new Set(window._brain_twin_modalities || _defaultSelection());
    if (checked) cur.add(id); else cur.delete(id);
    window._brain_twin_modalities = Array.from(cur);
  };

  window._brainTwinSetMode = function(m) {
    window._brain_twin_mode = m;
    _render(setTopbar);
  };

  window._brainTwinSetCombine = function(v) {
    window._brain_twin_combine = v;
  };

  window._brainTwinRun = async function() {
    const patient_id = _ensurePatientOrPrompt();
    if (!patient_id) return;
    const resEl = document.getElementById('brain-twin-results');
    if (resEl) resEl.innerHTML = spinner();
    try {
      const mode = window._brain_twin_mode || 'prediction';
      const payload = {
        patient_id,
        modalities: (window._brain_twin_modalities || _defaultSelection()).slice(),
        combine: window._brain_twin_combine || 'all_selected',
        analysis_modes: [mode],
      };
      const data = await api.brainTwinAnalyze(payload);
      _renderResults(data);
    } catch (e) {
      if (resEl) resEl.innerHTML = `<div style="color:var(--red);font-size:12.5px">Brain Twin failed: ${_esc(e.message || e)}</div>`;
    }
  };

  window._brainTwinSimulate = async function() {
    const patient_id = _ensurePatientOrPrompt();
    if (!patient_id) return;
    const box = document.getElementById('brain-twin-sim');
    if (box) box.innerHTML = spinner();
    try {
      const payload = {
        patient_id,
        protocol_id: window._brain_twin_protocol_id || 'proto_default',
        horizon_days: 90,
        modalities: (window._brain_twin_modalities || _defaultSelection()).slice(),
      };
      const data = await api.brainTwinSimulate(payload);
      _renderSim(data);
    } catch (e) {
      if (box) box.innerHTML = `<div style="color:var(--red);font-size:12.5px">Simulation failed: ${_esc(e.message || e)}</div>`;
    }
  };

  window._brainTwinEvidence = async function() {
    const patient_id = _ensurePatientOrPrompt();
    if (!patient_id) return;
    const box = document.getElementById('brain-twin-evidence');
    if (box) box.innerHTML = spinner();
    try {
      const qEl = document.getElementById('brain-twin-evidence-q');
      const question = (qEl?.value || '').trim() || 'protocol evidence';
      const payload = {
        patient_id,
        question,
        modalities: (window._brain_twin_modalities || _defaultSelection()).slice(),
        analysis_mode: window._brain_twin_mode || 'prediction',
        ranking_mode: 'clinical',
        limit: 8,
      };
      const data = await api.brainTwinEvidence(payload);
      _renderEvidence(data);
    } catch (e) {
      if (box) box.innerHTML = `<div style="color:var(--red);font-size:12.5px">Evidence failed: ${_esc(e.message || e)}</div>`;
    }
  };
}

export async function pgBrainTwin(setTopbar, navigate) {
  _injectStylesOnce();
  window._brainTwinNavigate = navigate;
  _wireHandlers(setTopbar);
  _render(setTopbar);
}

