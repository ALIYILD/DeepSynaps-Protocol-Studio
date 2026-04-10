import { api, downloadBlob } from './api.js';
import { cardWrap, fr, evBar, pillSt, tag, spinner, emptyState } from './helpers.js';
import { FALLBACK_CONDITIONS, FALLBACK_MODALITIES } from './constants.js';

// ── Evidence Library ──────────────────────────────────────────────────────────
export async function pgEvidence(setTopbar) {
  setTopbar('Evidence Library', '');
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [];
  try {
    const res = await api.listEvidence();
    items = res?.items || [];
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load evidence library: ${e.message}</div>`;
    return;
  }

  // Build modality options from data
  const modalitySet = new Set(items.map(e => e.modality).filter(Boolean));

  el.innerHTML = `
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <input class="form-control" id="ev-search" placeholder="Search conditions, modalities, summaries…" style="flex:1;min-width:200px" oninput="window.filterEvidence()">
    <select class="form-control" id="ev-level" style="width:auto" onchange="window.filterEvidence()">
      <option value="">All Evidence Levels</option>
      <option value="A" style="color:#00d4bc;background:#0a1628">Grade A — Strong RCT</option>
      <option value="B" style="color:#4a9eff;background:#0a1628">Grade B — Moderate</option>
      <option value="C" style="color:#f59e0b;background:#0a1628">Grade C — Emerging</option>
      <option value="D" style="color:#f87171;background:#0a1628">Grade D — Limited</option>
    </select>
    <select class="form-control" id="ev-modality" style="width:auto" onchange="window.filterEvidence()">
      <option value="">All Modalities</option>
      ${[...modalitySet].sort().map(m => `<option value="${m}">${m}</option>`).join('')}
    </select>
  </div>
  <div id="ev-count" style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:10px">${items.length} evidence records</div>
  <div id="ev-body">
    ${items.length === 0
      ? emptyState('◈', 'No evidence records loaded. Start the backend to load clinical data.')
      : renderEvidenceTable(items)}
  </div>`;

  window._evidenceData = items;

  window.filterEvidence = function() {
    const q   = document.getElementById('ev-search')?.value.toLowerCase() || '';
    const lvl = document.getElementById('ev-level')?.value || '';
    const mod = document.getElementById('ev-modality')?.value || '';
    const filtered = (window._evidenceData || []).filter(e => {
      const matchQ = !q || (e.title || '').toLowerCase().includes(q)
        || (e.condition || '').toLowerCase().includes(q)
        || (e.modality || '').toLowerCase().includes(q)
        || (e.summary || '').toLowerCase().includes(q)
        || (e.symptom_cluster || '').toLowerCase().includes(q);
      const matchL = !lvl || (e.evidence_level || '').includes(lvl);
      const matchM = !mod || (e.modality || '') === mod;
      return matchQ && matchL && matchM;
    });
    const body  = document.getElementById('ev-body');
    const count = document.getElementById('ev-count');
    if (count) count.textContent = `${filtered.length} of ${(window._evidenceData||[]).length} evidence records`;
    if (body) body.innerHTML = filtered.length === 0 ? emptyState('◈', 'No records match filter.') : renderEvidenceTable(filtered);
  };
}

function renderEvidenceTable(items) {
  return cardWrap(`Evidence Records (${items.length})`, `
    <div style="display:flex;flex-direction:column;gap:0">
      ${items.map((e, idx) => {
        const evColor = e.evidence_level === 'A' ? 'var(--teal)' : e.evidence_level === 'B' ? '#60a5fa' : 'var(--amber)';
        return `
        <div id="ev-row-${idx}" style="border-bottom:1px solid var(--border);transition:background var(--transition)">
          <div class="ev-row-header" style="display:flex;align-items:center;gap:10px;padding:10px 4px;cursor:pointer;flex-wrap:wrap"
               onclick="window._toggleEvidence(${idx})"
               onmouseover="this.querySelector('.ev-view-link').style.opacity='1';this.closest('#ev-row-${idx}').style.background='rgba(255,255,255,0.02)'"
               onmouseout="this.querySelector('.ev-view-link').style.opacity='0';this.closest('#ev-row-${idx}').style.background=''">
            <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;background:${evColor}22;color:${evColor};flex-shrink:0">EV-${e.evidence_level || '?'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:12.5px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.title || e.condition || '—'}</div>
              <div style="font-size:11px;color:var(--text-tertiary)">${e.condition || ''} ${e.symptom_cluster ? '· ' + e.symptom_cluster : ''}</div>
            </div>
            <span class="tag" style="flex-shrink:0">${e.modality || '—'}</span>
            <span style="font-size:11px;color:var(--text-tertiary);flex-shrink:0">${e.regulatory_status || ''}</span>
            <span class="ev-view-link" style="font-size:11px;color:var(--teal);flex-shrink:0;opacity:0;transition:opacity 0.15s;white-space:nowrap" onclick="event.stopPropagation();window._toggleEvidence(${idx})">View study →</span>
            <span style="color:var(--text-tertiary);font-size:13px;flex-shrink:0" id="ev-chevron-${idx}">›</span>
          </div>
          <div id="ev-expand-${idx}" style="display:none;padding:12px 4px 16px;border-top:1px solid var(--border)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;font-size:12px">
              ${[
                ['Condition',     e.condition || '—'],
                ['Symptom Cluster', e.symptom_cluster || '—'],
                ['Modality',      e.modality || '—'],
                ['Evidence Level', `EV-${e.evidence_level || '?'}`],
                ['Regulatory',    e.regulatory_status || '—'],
                ['Setting',       e.setting || '—'],
              ].map(([k, v]) => `<div><span style="color:var(--text-tertiary)">${k}:</span> <span style="color:var(--text-primary)">${v}</span></div>`).join('')}
            </div>
            ${e.summary ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.65;margin-bottom:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:var(--radius-sm)">${e.summary}</div>` : ''}
            ${e.reference || e.doi ? `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px">
              ${e.reference ? `<div>Reference: ${e.reference}</div>` : ''}
              ${e.doi ? `<div>DOI: <span class="mono">${e.doi}</span></div>` : ''}
            </div>` : ''}
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm" onclick="window._nav('protocols-registry')">Find Protocols →</button>
              ${e.modality ? `<button class="btn btn-sm" onclick="window._nav('devices')">Device Registry →</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `);
}

window._toggleEvidence = function(idx) {
  const panel = document.getElementById(`ev-expand-${idx}`);
  const chev  = document.getElementById(`ev-chevron-${idx}`);
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : '';
  if (chev) chev.textContent = open ? '›' : '↓';
  if (chev) chev.style.transform = open ? '' : 'rotate(0deg)';
};

// ── Device Registry ───────────────────────────────────────────────────────────
export async function pgDevices(setTopbar) {
  setTopbar('Device Registry', `<button class="btn btn-ghost btn-sm">Export</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [];
  try {
    const res = await api.listDevices();
    items = res?.items || [];
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load device registry: ${e.message}</div>`;
    return;
  }

  el.innerHTML = `
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <input class="form-control" id="dev-search" placeholder="Search devices, manufacturers…" style="flex:1" oninput="window.filterDevices()">
    <select class="form-control" id="dev-modality" style="width:auto" onchange="window.filterDevices()">
      <option value="">All Modalities</option>
      <option>tDCS</option><option>TMS</option><option>taVNS</option><option>CES</option><option>Neurofeedback</option><option>TPS</option>
    </select>
  </div>
  <div id="dev-body">
    ${items.length === 0
      ? emptyState('◇', 'No devices loaded. Start the backend to load registry data.')
      : renderDeviceGrid(items)}
  </div>`;

  window._devicesData = items;

  window.filterDevices = function() {
    const q = document.getElementById('dev-search').value.toLowerCase();
    const mod = document.getElementById('dev-modality').value;
    const filtered = (window._devicesData || []).filter(d => {
      const matchQ = !q || (d.name || '').toLowerCase().includes(q) || (d.manufacturer || '').toLowerCase().includes(q);
      const matchM = !mod || (d.modality || '').toLowerCase().includes(mod.toLowerCase());
      return matchQ && matchM;
    });
    const body = document.getElementById('dev-body');
    if (body) body.innerHTML = filtered.length === 0 ? emptyState('◇', 'No devices match filter.') : renderDeviceGrid(filtered);
  };
}

function renderDeviceGrid(items) {
  return `<div class="g3">
    ${items.map((d, idx) => {
      const isCertified = d.regulatory_status && (
        d.regulatory_status.toLowerCase().includes('fda') ||
        d.regulatory_status.toLowerCase().includes('ce mark') ||
        d.regulatory_status.toLowerCase().includes('approved') ||
        d.regulatory_status.toLowerCase().includes('cleared')
      );
      return `<div class="card" style="margin-bottom:0;transition:border-color var(--transition)" onmouseover="this.style.borderColor='var(--border-teal)'" onmouseout="this.style.borderColor='var(--border)'">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
            <div>
              <div style="font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-primary)">${d.name || '—'}</div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${d.manufacturer || '—'}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
              <span class="tag">${d.modality || '—'}</span>
              ${isCertified ? '<span style="font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;background:rgba(74,222,128,0.12);color:var(--green);white-space:nowrap">✓ Certified</span>' : ''}
            </div>
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.55;margin-bottom:12px">${(d.summary || '—').slice(0, 100)}${(d.summary || '').length > 100 ? '…' : ''}</div>
          ${d.regulatory_status ? `<div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:8px">Regulatory: ${d.regulatory_status}</div>` : ''}
          ${d.channels ? fr('Channels', String(d.channels)) : ''}
          ${d.use_type ? `<div style="margin-top:8px">${tag(d.use_type)}</div>` : ''}
          ${d.best_for?.length ? `<div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">Best for: ${d.best_for.join(', ')}</div>` : ''}
          <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
            <button class="btn btn-sm" style="font-size:10.5px;width:100%" onclick="(function(){const s=document.getElementById('dev-specs-${idx}');if(s){s.style.display=s.style.display==='none'?'':'none';this.textContent=s.style.display==='none'?'Show specs':'Hide specs';}}).call(this)">Show specs</button>
            <div id="dev-specs-${idx}" style="display:none;margin-top:10px">
              <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);font-weight:600;margin-bottom:8px">Specifications</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11.5px">
                ${d.max_intensity_ma != null ? `<div><span style="color:var(--text-tertiary)">Max intensity:</span> <span style="color:var(--text-primary);font-family:var(--font-mono)">${d.max_intensity_ma} mA</span></div>` : ''}
                ${d.frequency_hz_range ? `<div><span style="color:var(--text-tertiary)">Frequency:</span> <span style="color:var(--text-primary);font-family:var(--font-mono)">${d.frequency_hz_range} Hz</span></div>` : ''}
                ${d.pulse_width_us != null ? `<div><span style="color:var(--text-tertiary)">Pulse width:</span> <span style="color:var(--text-primary);font-family:var(--font-mono)">${d.pulse_width_us} µs</span></div>` : ''}
                ${d.channels ? `<div><span style="color:var(--text-tertiary)">Channels:</span> <span style="color:var(--text-primary);font-family:var(--font-mono)">${d.channels}</span></div>` : ''}
                ${!d.max_intensity_ma && !d.frequency_hz_range && !d.pulse_width_us && !d.channels ? '<div style="color:var(--text-tertiary);font-style:italic;grid-column:1/-1">Detailed specs not available</div>' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── Brain Regions ─────────────────────────────────────────────────────────────
export async function pgBrainRegions(setTopbar) {
  setTopbar('Brain Regions', `<button class="btn btn-ghost btn-sm">Export</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [];
  try {
    const res = await api.listBrainRegions();
    items = res?.items || [];
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load brain regions: ${e.message}</div>`;
    return;
  }

  el.innerHTML = `
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <input class="form-control" id="br-search" placeholder="Search regions, functions, conditions…" style="flex:1" oninput="window.filterBrainRegions()">
    <select class="form-control" id="br-lobe" style="width:auto" onchange="window.filterBrainRegions()">
      <option value="">All Lobes</option>
      <option>Frontal</option><option>Parietal</option><option>Temporal</option><option>Occipital</option><option>Subcortical</option>
    </select>
  </div>
  <div id="br-body">
    ${items.length === 0
      ? emptyState('◎', 'No brain region data loaded.')
      : renderBrainRegionTable(items)}
  </div>`;

  window._brainRegionsData = items;

  window.filterBrainRegions = function() {
    const q = document.getElementById('br-search').value.toLowerCase();
    const lobe = document.getElementById('br-lobe').value.toLowerCase();
    const filtered = (window._brainRegionsData || []).filter(r => {
      const matchQ = !q || (r.name || '').toLowerCase().includes(q) || (r.primary_functions || []).join(' ').toLowerCase().includes(q);
      const matchL = !lobe || (r.lobe || '').toLowerCase().includes(lobe);
      return matchQ && matchL;
    });
    const body = document.getElementById('br-body');
    if (body) body.innerHTML = filtered.length === 0 ? emptyState('◎', 'No regions match filter.') : renderBrainRegionTable(filtered);
  };
}

function renderBrainRegionTable(items) {
  return cardWrap(`Brain Regions (${items.length})`, `<div style="overflow-x:auto">
    <table class="ds-table">
      <thead><tr>
        <th>Region</th><th>Lobe</th><th>EEG Position</th><th>Primary Functions</th><th>Key Conditions</th><th>Targetable</th>
      </tr></thead>
      <tbody>
        ${items.map(r => `<tr>
          <td>
            <div style="font-weight:500">${r.name || '—'}</div>
            ${r.abbreviation ? `<div style="font-size:10.5px;color:var(--teal);font-family:var(--font-mono)">${r.abbreviation}</div>` : ''}
          </td>
          <td style="color:var(--text-secondary)">${r.lobe || '—'}</td>
          <td class="mono" style="color:var(--blue)">${r.eeg_position_10_20 || '—'}</td>
          <td style="font-size:11.5px;color:var(--text-secondary)">${(r.primary_functions || []).slice(0, 2).join(', ') || '—'}</td>
          <td style="font-size:11.5px">${(r.key_conditions || []).slice(0, 2).map(c => tag(c)).join('')}</td>
          <td>${(r.targetable_modalities || []).slice(0, 3).map(m => `<span class="tag" style="color:var(--teal)">${m}</span>`).join('')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`);
}

// ── qEEG Maps ─────────────────────────────────────────────────────────────────
export async function pgQEEGMaps(setTopbar) {
  setTopbar('qEEG Reference Maps', `<button class="btn btn-ghost btn-sm">Export</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let biomarkers = [], conditionMap = [];
  try {
    const [bRes, cRes] = await Promise.all([api.listQEEGBiomarkers(), api.listQEEGConditionMap()]);
    biomarkers = bRes?.items || [];
    conditionMap = cRes?.items || [];
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load qEEG data: ${e.message}</div>`;
    return;
  }

  el.innerHTML = `
  <div class="tab-bar">
    <button class="tab-btn active" id="qeeg-tab-bio" onclick="window.switchQEEGTab('biomarkers')">Biomarkers (${biomarkers.length})</button>
    <button class="tab-btn" id="qeeg-tab-map" onclick="window.switchQEEGTab('conditionmap')">Condition Map (${conditionMap.length})</button>
  </div>
  <div id="qeeg-biomarkers-view">
    ${biomarkers.length === 0
      ? emptyState('◫', 'No qEEG biomarker data loaded.')
      : cardWrap('qEEG Biomarkers', `<div style="overflow-x:auto"><table class="ds-table">
        <thead><tr><th>Biomarker</th><th>Band</th><th>Region</th><th>Clinical Significance</th><th>Associated Conditions</th></tr></thead>
        <tbody>${biomarkers.map(b => `<tr>
          <td style="font-weight:500">${b.name || b.id || '—'}</td>
          <td><span class="tag">${b.band || '—'}</span></td>
          <td class="mono" style="color:var(--blue)">${b.region || '—'}</td>
          <td style="font-size:11.5px;color:var(--text-secondary)">${b.clinical_significance || b.description || '—'}</td>
          <td>${(b.associated_conditions || []).slice(0, 3).map(c => tag(c)).join('')}</td>
        </tr>`).join('')}</tbody>
      </table></div>`)}
  </div>
  <div id="qeeg-conditionmap-view" style="display:none">
    ${conditionMap.length === 0
      ? emptyState('◫', 'No qEEG condition map data loaded.')
      : cardWrap('qEEG Condition Maps', `<div style="overflow-x:auto"><table class="ds-table">
        <thead><tr><th>Condition</th><th>Expected Pattern</th><th>Target Region</th><th>Recommended Modality</th></tr></thead>
        <tbody>${conditionMap.map(c => `<tr>
          <td style="font-weight:500">${c.condition || c.name || '—'}</td>
          <td style="font-size:11.5px;color:var(--text-secondary)">${c.expected_pattern || c.pattern || '—'}</td>
          <td class="mono" style="color:var(--blue)">${c.target_region || '—'}</td>
          <td><span class="tag">${c.recommended_modality || c.modality || '—'}</span></td>
        </tr>`).join('')}</tbody>
      </table></div>`)}
  </div>`;

  window.switchQEEGTab = function(tab) {
    document.getElementById('qeeg-biomarkers-view').style.display = tab === 'biomarkers' ? '' : 'none';
    document.getElementById('qeeg-conditionmap-view').style.display = tab === 'conditionmap' ? '' : 'none';
    document.getElementById('qeeg-tab-bio').classList.toggle('active', tab === 'biomarkers');
    document.getElementById('qeeg-tab-map').classList.toggle('active', tab === 'conditionmap');
  };
}

// ── Handbooks ─────────────────────────────────────────────────────────────────
export function pgHandbooks(setTopbar) {
  setTopbar('Handbooks & Guides', `<button class="btn btn-ghost btn-sm">My Generated</button>`);
  return `
  <div class="notice notice-info" style="margin-bottom:20px">Generate evidence-based handbooks, patient guides, and clinician SOPs. Requires clinician role.</div>

  <div class="g2" style="margin-bottom:24px">
    ${[
      { title: 'tDCS Clinical Protocol Manual', desc: 'Comprehensive clinical reference covering transcranial Direct Current Stimulation protocols, montage selection, parameter ranges, and monitoring requirements.', icon: '◧', color: 'var(--blue)' },
      { title: 'TMS Safety Guidelines', desc: 'Evidence-based safety guidelines for Transcranial Magnetic Stimulation including contraindications, screening procedures, and emergency protocols.', icon: '◱', color: 'var(--amber)' },
      { title: 'Adverse Event Reporting Procedures', desc: 'Standard operating procedures for identifying, documenting and escalating adverse events during neuromodulation therapy.', icon: '⚠', color: 'var(--red)' },
      { title: 'Patient Consent Templates', desc: 'Compliant informed consent documentation templates for off-label and on-label neuromodulation treatments.', icon: '◉', color: 'var(--green)' },
    ].map(h => `<div class="card" style="margin-bottom:0;display:flex;align-items:center;gap:16px;padding:16px 20px">
      <div style="width:44px;height:44px;border-radius:10px;background:${h.color}18;border:1px solid ${h.color}44;display:flex;align-items:center;justify-content:center;font-size:18px;color:${h.color};flex-shrink:0">${h.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${h.title}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">${h.desc}</div>
      </div>
      <button class="btn btn-sm" style="flex-shrink:0" onclick="window._nav('handbooks')">Open →</button>
    </div>`).join('')}
  </div>

  <div class="g3" style="margin-bottom:24px">
    ${[
      { kind: 'clinician_handbook', icon: '📋', t: 'Clinician Handbook', d: 'Full clinical handbook with protocol, evidence base, monitoring, and safety guidelines.', color: 'var(--blue)' },
      { kind: 'patient_guide', icon: '📄', t: 'Patient Guide', d: 'Patient-facing guide explaining the treatment, what to expect, and home care instructions.', color: 'var(--teal)' },
      { kind: 'technician_sop', icon: '🔧', t: 'Technician SOP', d: 'Standard operating procedure for clinic technicians administering the protocol.', color: 'var(--violet)' },
    ].map(h => `<div class="card" style="margin-bottom:0;cursor:pointer;transition:border-color var(--transition)" onmouseover="this.style.borderColor='var(--border-teal)'" onmouseout="this.style.borderColor='var(--border)'">
      <div class="card-body">
        <div style="font-size:28px;margin-bottom:12px">${h.icon}</div>
        <div style="font-family:var(--font-display);font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px">${h.t}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.55;margin-bottom:16px">${h.d}</div>
        <button class="btn btn-sm btn-primary" onclick="window.showHandbookForm('${h.kind}')">Generate →</button>
      </div>
    </div>`).join('')}
  </div>

  <div id="handbook-form" style="display:none">
    ${cardWrap('Generate Handbook', `
      <div class="g2">
        <div>
          <div class="form-group"><label class="form-label">Handbook Type</label>
            <select id="hb-kind" class="form-control">
              <option value="clinician_handbook">Clinician Handbook</option>
              <option value="patient_guide">Patient Guide</option>
              <option value="technician_sop">Technician SOP</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Condition</label>
            <select id="hb-condition" class="form-control">
              <option>Major Depressive Disorder</option><option>ADHD</option><option>Anxiety / GAD</option>
              <option>PTSD</option><option>Chronic Pain</option><option>Parkinson's Disease</option>
              <option>Post-Stroke Rehabilitation</option><option>Insomnia</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Modality</label>
            <select id="hb-modality" class="form-control">
              <option>tDCS</option><option>TMS / rTMS</option><option>taVNS</option>
              <option>CES</option><option>Neurofeedback</option><option>TPS</option>
            </select>
          </div>
        </div>
        <div>
          <div class="notice notice-info" style="margin-bottom:14px">Generated handbooks are evidence-based and include all clinical disclaimers required for professional use.</div>
          <div id="hb-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:10px"></div>
          <div style="display:flex;gap:8px">
            <button class="btn" onclick="document.getElementById('handbook-form').style.display='none'">Cancel</button>
            <button class="btn btn-primary" id="hb-gen-btn" onclick="window.generateHandbook()">Generate Handbook ✦</button>
          </div>
          <div id="hb-result" style="margin-top:16px"></div>
        </div>
      </div>
    `)}
  </div>`;

}

export function bindHandbooks() {
  window.showHandbookForm = function(kind) {
    document.getElementById('handbook-form').style.display = '';
    if (kind) document.getElementById('hb-kind').value = kind;
  };

  window.generateHandbook = async function() {
    const btn = document.getElementById('hb-gen-btn');
    const errEl = document.getElementById('hb-error');
    const resultEl = document.getElementById('hb-result');
    if (!errEl || !resultEl) return;
    errEl.style.display = 'none';
    if (btn) btn.disabled = true;
    resultEl.innerHTML = `<div class="spinner">${Array.from({length:5},(_,i)=>`<div class="ai-dot" style="animation-delay:${i*.12}s"></div>`).join('')}</div>`;
    try {
      const kind = document.getElementById('hb-kind').value;
      const condition = document.getElementById('hb-condition').value;
      const modality = document.getElementById('hb-modality').value;
      const res = await api.generateHandbook({ handbook_kind: kind, condition, modality });
      const doc = res?.document;
      resultEl.innerHTML = cardWrap('Generated Handbook', `
        <div style="font-size:12.5px;font-weight:600;color:var(--text-primary);margin-bottom:8px">${doc?.title || 'Handbook'}</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin-bottom:14px;max-height:200px;overflow-y:auto">${doc?.content || doc?.summary || 'Handbook generated.'}</div>
        <button class="btn btn-primary btn-sm" onclick="window.downloadHandbook('${kind}','${condition}','${modality}')">Download DOCX</button>
      `);
      window.downloadHandbook = async (k, c, m) => {
        try {
          const payload = { condition_name: c, modality_name: m, device_name: '' };
          const blob = k === 'patient_guide'
            ? await api.exportPatientGuideDocx(payload)
            : await api.exportHandbookDocx(payload);
          downloadBlob(blob, `${k}-${c.replace(/\s/g, '-')}-${m}.docx`);
        } catch (e) {
          const errEl2 = document.getElementById('hb-error');
          if (errEl2) { errEl2.textContent = e.message || 'Download failed.'; errEl2.style.display = ''; }
        }
      };
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = '';
      resultEl.innerHTML = '';
    }
    if (btn) btn.disabled = false;
  };
}

// ── Audit Trail ───────────────────────────────────────────────────────────────
export async function pgAuditTrail(setTopbar) {
  setTopbar('Audit Trail', `<button class="btn btn-ghost btn-sm">Export CSV</button>`);
  const el = document.getElementById('content');
  el.innerHTML = `<div class="spinner">${Array.from({length:5},(_,i)=>`<div class="ai-dot" style="animation-delay:${i*.12}s"></div>`).join('')}</div>`;

  let items = [];
  try {
    const res = await api.auditTrail();
    items = res?.items || [];
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load audit trail: ${e.message}</div>`;
    return;
  }

  el.innerHTML = items.length === 0
    ? emptyState('◧', 'No audit events recorded yet.')
    : cardWrap(`Audit Events (${items.length})`, `<div style="overflow-x:auto"><table class="ds-table">
      <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Target Type</th><th>Target ID</th><th>Note</th></tr></thead>
      <tbody>${items.map(e => `<tr>
        <td class="mono" style="color:var(--text-tertiary);white-space:nowrap">${e.created_at?.split('T').join(' ').split('.')[0] || '—'}</td>
        <td style="font-size:11.5px">${e.role || '—'}</td>
        <td><span class="tag">${e.action || '—'}</span></td>
        <td style="color:var(--text-secondary)">${e.target_type || '—'}</td>
        <td class="mono" style="font-size:11px;color:var(--text-tertiary)">${e.target_id || '—'}</td>
        <td style="font-size:11.5px;color:var(--text-secondary)">${e.note || '—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`);
}

// ── Pricing ───────────────────────────────────────────────────────────────────
export async function pgPricing(setTopbar) {
  setTopbar('Plans & Pricing', '');
  const el = document.getElementById('content');
  el.innerHTML = `<div class="spinner">${Array.from({length:5},(_,i)=>`<div class="ai-dot" style="animation-delay:${i*.12}s"></div>`).join('')}</div>`;

  let packages = [];
  try {
    const res = await api.paymentConfig();
    packages = res?.packages || [];
  } catch {}

  const fallbackPackages = packages.length > 0 ? packages : [
    { id: 'explorer', name: 'Explorer', price: 'Free', description: 'Evidence library, device registry (read-only)', features: ['Evidence library', 'Device registry', 'Brain regions reference'] },
    { id: 'resident', name: 'Resident / Fellow', price: '$99/mo', description: 'Protocol generation, assessment builder, DOCX export', features: ['Full evidence library', 'Protocol generation (EV-A/B)', 'Assessment builder', 'Handbook generation', 'PDF export'] },
    { id: 'clinician', name: 'Clinician Pro', price: '$199/mo', description: 'Full platform access, patient management, case summaries', features: ['All Resident features', 'Patient management (CRM)', 'AI case summaries', 'DOCX export', 'Audit trail', 'Chat assistant'] },
    { id: 'clinic', name: 'Clinic Team', price: '$699/mo', description: 'Multi-seat team access, team review queue', features: ['All Clinician Pro features', 'Up to 10 seats', 'Team review queue', 'Team audit trail', 'Basic white-label'] },
    { id: 'enterprise', name: 'Enterprise', price: 'Custom', description: 'Unlimited seats, API access, full white-label', features: ['All Clinic Team features', 'Unlimited seats', 'API access', 'Full white-label', 'Dedicated support'] },
  ];

  el.innerHTML = `
  <div style="text-align:center;margin-bottom:32px">
    <div style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Plans & Pricing</div>
    <div style="font-size:13px;color:var(--text-secondary)">Choose the plan that fits your practice.</div>
  </div>
  <div class="g3" style="margin-bottom:24px">
    ${fallbackPackages.slice(0, 3).map((p, i) => `<div class="card" style="margin-bottom:0;${i === 2 ? 'border-color:var(--border-teal);background:linear-gradient(135deg,rgba(0,212,188,0.04),rgba(74,158,255,0.04))' : ''}">
      <div class="card-body">
        <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${p.name || p.id}</div>
        <div style="font-family:var(--font-display);font-size:24px;font-weight:700;color:var(--teal);margin-bottom:8px">${p.price || p.amount || '—'}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;line-height:1.55">${p.description || ''}</div>
        <div style="margin-bottom:16px">
          ${(p.features || []).map(f => `<div style="font-size:12px;color:var(--text-secondary);padding:4px 0;display:flex;gap:8px;align-items:center"><span style="color:var(--green)">✓</span>${f}</div>`).join('')}
        </div>
        <button class="btn ${i === 2 ? 'btn-primary' : ''}" style="width:100%" onclick="window.subscribe('${p.id}')">
          ${p.price === 'Free' ? 'Current Plan' : 'Subscribe →'}
        </button>
      </div>
    </div>`).join('')}
  </div>
  ${fallbackPackages.length > 3 ? `<div class="g2">
    ${fallbackPackages.slice(3).map(p => `<div class="card" style="margin-bottom:0">
      <div class="card-body" style="display:flex;align-items:center;gap:16px">
        <div style="flex:1">
          <div style="font-family:var(--font-display);font-size:14px;font-weight:600;color:var(--text-primary)">${p.name}</div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-top:3px">${p.description}</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--teal)">${p.price}</div>
          <button class="btn btn-sm btn-primary" style="margin-top:8px" onclick="window.subscribe('${p.id}')">Subscribe →</button>
        </div>
      </div>
    </div>`).join('')}
  </div>` : ''}`;

  window.subscribe = async function(pkg) {
    if (pkg === 'explorer') return;
    try {
      const res = await api.createCheckout(pkg);
      if (res?.checkout_url) window.location.href = res.checkout_url;
    } catch (e) {
      const b = document.createElement('div');
      b.className = 'notice notice-warn';
      b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
      b.textContent = e.message || 'Checkout unavailable.';
      document.body.appendChild(b); setTimeout(() => b.remove(), 5000);
    }
  };
}
