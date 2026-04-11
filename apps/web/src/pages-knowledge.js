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

const BAND_REFERENCE = [
  {
    name: 'Delta', range: '0.5–4 Hz', color: '#8b5cf6', accent: 'rgba(139,92,246,0.1)',
    normal: '0–4 µV²',
    fn: 'Deep sleep, unconscious healing, tissue regeneration',
    abnormal: 'Excess while awake: brain injury, encephalopathy, severe depression. Deficit: arousal issues.',
  },
  {
    name: 'Theta', range: '4–8 Hz', color: '#3b82f6', accent: 'rgba(59,130,246,0.1)',
    normal: '4–8 µV²',
    fn: 'Drowsiness, light sleep, creativity, memory encoding (hippocampal)',
    abnormal: 'Excess while awake: ADHD, trauma, cognitive slowing. Deficit: poor sleep consolidation.',
  },
  {
    name: 'Alpha', range: '8–13 Hz', color: '#14b8a6', accent: 'rgba(20,184,166,0.1)',
    normal: '6–12 µV²',
    fn: 'Relaxed wakefulness, calm focus, eyes-closed idling, inhibition of irrelevant areas',
    abnormal: 'Excess: hyper-relaxation, inattention. Deficit: anxiety, depression, trauma, chronic pain.',
  },
  {
    name: 'Beta', range: '13–30 Hz', color: '#f59e0b', accent: 'rgba(245,158,11,0.1)',
    normal: '3–15 µV²',
    fn: 'Active thinking, focus, problem solving, motor planning',
    abnormal: 'Excess: anxiety, stress, hyperarousal, OCD. Deficit: brain fog, depression, poor focus.',
  },
  {
    name: 'Gamma', range: '30–100 Hz', color: '#f43f5e', accent: 'rgba(244,63,94,0.1)',
    normal: '1–5 µV²',
    fn: 'Higher-order cognition, binding of sensory information, peak mental states',
    abnormal: 'Excess: anxiety, seizure propensity. Deficit: schizophrenia-related cognitive deficits, Down syndrome.',
  },
];

export async function pgQEEGMaps(setTopbar) {
  setTopbar('qEEG Maps', `
    <input id="qeeg-search" class="form-control" style="width:200px;display:inline-block;margin-right:8px" placeholder="Search biomarkers, conditions…" oninput="window._qeegSearch(this.value)">
    <button class="btn btn-ghost btn-sm" onclick="window._qeegSearch('')">Clear</button>
  `);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let biomarkers = [], conditionMap = [];
  try {
    const [bRes, cRes] = await Promise.all([
      api.listQEEGBiomarkers().catch(() => null),
      api.listQEEGConditionMap().catch(() => null),
    ]);
    biomarkers = bRes?.items || bRes || [];
    conditionMap = cRes?.items || cRes || [];
  } catch {}

  function renderBiomarkers(items) {
    if (!items.length) return emptyState('◫', 'No biomarker data loaded. Ensure the backend qEEG seed data is present.');
    return `<div style="overflow-x:auto"><table class="ds-table" id="bio-table">
      <thead><tr>
        <th>Biomarker</th><th>Band</th><th>Direction</th>
        <th>Associated Conditions</th><th>Clinical Significance</th>
      </tr></thead>
      <tbody>
        ${items.map((b, i) => {
          const bandColors = { delta:'#8b5cf6', theta:'#3b82f6', alpha:'#14b8a6', beta:'#f59e0b', gamma:'#f43f5e' };
          const bColor = bandColors[(b.band || '').toLowerCase()] || 'var(--text-tertiary)';
          const dirColor = (b.direction || '').toLowerCase() === 'excess' ? 'var(--amber)' : (b.direction || '').toLowerCase() === 'deficit' ? 'var(--blue)' : 'var(--text-tertiary)';
          const conditions = (b.associated_conditions || b.conditions || []);
          return `<tr id="bio-row-${i}" style="cursor:pointer" onclick="window._toggleBioRow(${i})">
            <td style="font-weight:600;color:var(--text-primary)">${b.biomarker_name || b.name || b.id || '—'}</td>
            <td><span style="font-size:10.5px;padding:2px 7px;border-radius:4px;background:${bColor}22;color:${bColor};font-weight:600">${b.band || '—'}</span></td>
            <td><span style="font-size:10.5px;padding:2px 7px;border-radius:4px;background:${dirColor}18;color:${dirColor}">${b.direction || '—'}</span></td>
            <td style="max-width:240px">${(Array.isArray(conditions) ? conditions : [conditions]).slice(0,3).filter(Boolean).map(c => tag(c)).join('')}</td>
            <td style="font-size:11.5px;color:var(--text-secondary);max-width:300px">${(b.clinical_significance || b.description || '—').slice(0,100)}${(b.clinical_significance || b.description || '').length > 100 ? '…' : ''}</td>
          </tr>
          <tr id="bio-expand-${i}" style="display:none">
            <td colspan="5" style="padding:12px 16px;background:rgba(0,0,0,0.2)">
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin-bottom:8px">${b.clinical_significance || b.description || '—'}</div>
              ${b.treatment_implications ? `<div style="font-size:11.5px;color:var(--teal)"><strong>Treatment implications:</strong> ${b.treatment_implications}</div>` : ''}
              ${b.region ? `<div style="font-size:11.5px;color:var(--text-tertiary);margin-top:4px">Region: <span style="color:var(--blue)">${b.region}</span></div>` : ''}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }

  function renderConditionCards(items) {
    if (!items.length) return emptyState('◫', 'No condition map data loaded.');
    return `<div class="g3" id="cond-grid">
      ${items.map(c => {
        const bioList = (c.biomarkers || c.biomarker_associations || []).slice(0,3);
        const modalities = (c.recommended_modalities || (c.recommended_modality ? [c.recommended_modality] : [c.modality ? c.modality : ''])).filter(Boolean);
        return `<div class="card" style="margin-bottom:0">
          <div class="card-body">
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">${c.condition_name || c.condition || c.name || '—'}</div>
            ${c.expected_pattern || c.pattern ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px;line-height:1.5">${(c.expected_pattern || c.pattern || '').slice(0,120)}${(c.expected_pattern || c.pattern || '').length > 120 ? '…' : ''}</div>` : ''}
            ${bioList.length ? `<div style="margin-bottom:10px">
              <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">Top Biomarkers</div>
              ${bioList.map(bm => `<div style="font-size:11.5px;color:var(--text-secondary);padding:2px 0">· ${typeof bm === 'string' ? bm : (bm.biomarker_name || bm.name || JSON.stringify(bm))}</div>`).join('')}
            </div>` : ''}
            ${c.target_region ? `<div style="font-size:11px;color:var(--blue);margin-bottom:8px">Region: ${c.target_region}</div>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${modalities.map(m => tag(m)).join('')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  el.innerHTML = `
  <!-- Section 1: Biomarker Reference Library -->
  <div style="margin-bottom:28px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h2 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0">Biomarker Reference Library</h2>
      <span style="font-size:11.5px;color:var(--text-tertiary)">${biomarkers.length} biomarkers</span>
    </div>
    <div id="bio-table-wrap">
      ${renderBiomarkers(biomarkers)}
    </div>
  </div>

  <!-- Section 2: Condition Biomarker Map -->
  <div style="margin-bottom:28px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h2 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0">Condition Biomarker Map</h2>
      <span style="font-size:11.5px;color:var(--text-tertiary)">${conditionMap.length} conditions</span>
    </div>
    <div id="cond-grid-wrap">
      ${renderConditionCards(conditionMap)}
    </div>
  </div>

  <!-- Section 3: Band Reference Guide -->
  <div>
    <div style="margin-bottom:12px">
      <h2 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0">Band Reference Guide</h2>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
      ${BAND_REFERENCE.map(b => `<div class="card" style="margin-bottom:0;border-top:3px solid ${b.color}">
        <div class="card-body">
          <div style="font-size:14px;font-weight:700;color:${b.color};margin-bottom:2px">${b.name}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">${b.range}</div>
          <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px">Normal Range</div>
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:8px;font-family:var(--font-mono)">${b.normal}</div>
          <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px">Function</div>
          <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:8px">${b.fn}</div>
          <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px">Abnormal Significance</div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;padding:6px 8px;background:${b.accent};border-radius:4px">${b.abnormal}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>`;

  // Search handler
  window._qeegSearch = function(query) {
    const q = (query || '').toLowerCase().trim();
    // Biomarker table rows
    document.querySelectorAll('#bio-table tbody tr[id^="bio-row-"]').forEach(row => {
      const text = row.textContent.toLowerCase();
      const expandRow = document.getElementById(row.id.replace('bio-row-', 'bio-expand-'));
      const visible = !q || text.includes(q);
      row.style.display = visible ? '' : 'none';
      if (expandRow) expandRow.style.display = 'none';
    });
    // Condition cards
    document.querySelectorAll('#cond-grid > div').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
    // Sync search input in topbar
    const inp = document.getElementById('qeeg-search');
    if (inp && inp.value !== query) inp.value = query;
  };

  window._toggleBioRow = function(i) {
    const exp = document.getElementById(`bio-expand-${i}`);
    if (exp) exp.style.display = exp.style.display === 'none' ? '' : 'none';
  };
}

// ── Handbooks ─────────────────────────────────────────────────────────────────

const LIBRARY_DOCS = [
  {
    docType: 'tdcs_protocol_manual',
    modality: 'tDCS',
    title: 'tDCS Clinical Protocol Manual',
    desc: 'Comprehensive electrode placement, contraindications, parameter guidance for tDCS',
    updated: 'Mar 2026',
    icon: '◧',
    accent: 'var(--blue)',
    preview: 'This manual provides evidence-based montage selection and parameter ranges for transcranial Direct Current Stimulation across major indications including depression, ADHD, and chronic pain. It covers electrode placement guidelines per 10-20 EEG coordinate system, current density limits (\u22640.3 mA/cm\u00b2), and session duration recommendations (20\u201330 min). Contraindications including metallic implants, active epilepsy, and skin integrity issues are detailed with screening checklists. Monitoring protocols, adverse event recognition, and emergency cessation procedures are included.',
  },
  {
    docType: 'rtms_safety_guidelines',
    modality: 'TMS / rTMS',
    title: 'rTMS Safety & Consent Guidelines',
    desc: 'Safety screening, adverse event management, patient consent procedures for TMS',
    updated: 'Feb 2026',
    icon: '◧',
    accent: 'var(--teal)',
    preview: 'This document covers comprehensive safety screening for repetitive Transcranial Magnetic Stimulation, including the validated Rossi-2009 screening questionnaire for seizure risk, implanted devices, and medication thresholds. Adverse event classification (mild/moderate/serious) and escalation pathways to supervising clinicians are defined with response timelines. Patient consent procedures include disclosure of off-label use, expected side-effect profiles (headache, discomfort), and right-to-withdraw language meeting HIPAA and GCP standards.',
  },
  {
    docType: 'adverse_event_procedures',
    modality: 'General',
    title: 'Adverse Event Reporting Procedures',
    desc: 'Step-by-step AE classification, escalation and regulatory reporting framework',
    updated: 'Jan 2026',
    icon: '◧',
    accent: 'var(--amber)',
    preview: 'This SOP defines three-tier adverse event classification for all neuromodulation modalities: Tier 1 (mild, self-resolving), Tier 2 (moderate, requires clinician review within 4 hours), and Tier 3 (serious, requires immediate escalation and IRB/regulatory notification within 24 hours). Documentation requirements, incident report templates, and chain-of-notification procedures are specified. Regulatory reporting obligations under FDA 21 CFR Part 803 and EU MDR Article 87 are summarized.',
  },
  {
    docType: 'consent_templates',
    modality: 'General',
    title: 'Patient Consent Templates',
    desc: 'HIPAA-compliant consent forms for neurofeedback, tDCS, TMS, and taVNS',
    updated: 'Apr 2026',
    icon: '◧',
    accent: 'var(--green)',
    preview: 'A library of HIPAA-compliant informed consent templates covering neurofeedback, tDCS, rTMS, and taVNS. Each template includes: treatment description in plain language, known risks and benefits, alternative treatments, voluntary participation and withdrawal rights, data privacy disclosures, and clinician contact information. Off-label use addenda are provided for conditions outside current FDA clearances. Templates are available in English and Spanish and have been reviewed against current APA and AMA ethical guidelines.',
  },
];

export function pgHandbooks(setTopbar) {
  setTopbar(
    'Clinical Handbooks & Documentation',
    `<button class="btn btn-primary btn-sm" onclick="document.getElementById('hb-generator-section').scrollIntoView({behavior:'smooth'})">Generate Custom Document</button>`
  );

  const condOpts = FALLBACK_CONDITIONS.map(c => `<option value="${c}">${c}</option>`).join('');
  const modOpts  = FALLBACK_MODALITIES.map(m => `<option value="${m}">${m}</option>`).join('');

  const libCards = LIBRARY_DOCS.map((doc, idx) => `
    <div>
      <div class="card" style="margin-bottom:0;border-left:3px solid ${doc.accent}">
        <div class="card-body" style="display:flex;gap:14px">
          <div style="width:40px;height:40px;border-radius:8px;background:${doc.accent}18;border:1px solid ${doc.accent}44;display:flex;align-items:center;justify-content:center;font-size:18px;color:${doc.accent};flex-shrink:0">${doc.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${doc.title}</div>
            <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px">${doc.desc}</div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:12px">Updated ${doc.updated}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm" onclick="window._hbPreviewToggle(${idx})">Preview</button>
              <button class="btn btn-sm btn-primary" id="hb-dl-btn-${idx}" onclick="window._hbDownload(${idx})">Download .docx</button>
            </div>
          </div>
        </div>
      </div>
      <div id="hb-preview-${idx}" style="display:none;margin-top:6px;padding:14px 16px;background:rgba(0,0,0,0.2);border-radius:var(--radius-md);border:1px solid var(--border)">
        <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Content Preview</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">${doc.preview}</div>
      </div>
    </div>`).join('');

  return `
  <!-- ── Section 1: Document Library ─────────────────────────────────────── -->
  <div style="margin-bottom:28px">
    <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:14px">Document Library</div>
    <div class="g2">${libCards}</div>
  </div>

  <!-- ── Section 2: Protocol Generator ───────────────────────────────────── -->
  <div id="hb-generator-section" style="margin-bottom:28px">
    <div class="card">
      <div class="card-header"><h3>Generate Custom Protocol Document</h3></div>
      <div class="card-body">
        <div class="g2" style="margin-bottom:16px">
          <div class="form-group">
            <label class="form-label">Condition</label>
            <select id="pg-condition" class="form-control"><option value="">Select condition\u2026</option>${condOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Modality</label>
            <select id="pg-modality" class="form-control"><option value="">Select modality\u2026</option>${modOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Device Name</label>
            <input id="pg-device" class="form-control" placeholder="e.g. Soterix 1x1 CT" />
          </div>
          <div class="form-group">
            <label class="form-label">Evidence Threshold</label>
            <select id="pg-evidence" class="form-control">
              <option value="A">Grade A \u2014 Strong RCT</option>
              <option value="B" selected>Grade B \u2014 Moderate</option>
              <option value="C">Grade C \u2014 Emerging</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Setting</label>
            <select id="pg-setting" class="form-control">
              <option value="clinical" selected>Clinical</option>
              <option value="home">Home</option>
              <option value="research">Research</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Symptom Cluster</label>
            <input id="pg-symptom" class="form-control" placeholder="e.g. anhedonia, fatigue, low motivation" />
          </div>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
          <input type="checkbox" id="pg-offlabel" style="width:14px;height:14px;accent-color:var(--teal)" />
          <label for="pg-offlabel" style="font-size:12px;color:var(--text-secondary);cursor:pointer">Off-label use</label>
        </div>
        <div id="pg-error" style="display:none" class="notice notice-warn"></div>
        <button class="btn btn-primary" id="pg-gen-btn" onclick="window._pgGenerate()">Generate &amp; Preview \u2726</button>
        <div id="pg-result" style="margin-top:18px"></div>
      </div>
    </div>
  </div>

  <!-- ── Section 3: Case Summary Generator ────────────────────────────────── -->
  <div style="margin-bottom:28px">
    <div class="card">
      <div class="card-header"><h3>AI Case Summary</h3></div>
      <div class="card-body">
        <div class="g2" style="margin-bottom:16px">
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Patient Notes</label>
            <textarea id="cs-notes" class="form-control" style="height:90px" placeholder="Paste clinical notes, session observations, or relevant history\u2026"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Condition</label>
            <input id="cs-condition" class="form-control" placeholder="e.g. Major Depressive Disorder" />
          </div>
          <div class="form-group">
            <label class="form-label">Modality</label>
            <input id="cs-modality" class="form-control" placeholder="e.g. rTMS" />
          </div>
          <div class="form-group">
            <label class="form-label">Session Count</label>
            <input id="cs-sessions" class="form-control" type="number" min="0" placeholder="e.g. 15" />
          </div>
        </div>
        <div id="cs-error" style="display:none" class="notice notice-warn"></div>
        <button class="btn btn-primary" id="cs-gen-btn" onclick="window._csGenerate()">Generate Summary \u2726</button>
        <div id="cs-result" style="margin-top:18px"></div>
      </div>
    </div>
  </div>

  <!-- ── Section 4: Patient Guide Generator ───────────────────────────────── -->
  <div style="margin-bottom:28px">
    <div class="card">
      <div class="card-header"><h3>Patient Education Guide</h3></div>
      <div class="card-body">
        <div class="g2" style="margin-bottom:16px">
          <div class="form-group">
            <label class="form-label">Condition</label>
            <select id="pgd-condition" class="form-control"><option value="">Select condition\u2026</option>${condOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Modality</label>
            <select id="pgd-modality" class="form-control"><option value="">Select modality\u2026</option>${modOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Reading Level</label>
            <select id="pgd-level" class="form-control">
              <option value="simple">Simple (Grade 6\u20138)</option>
              <option value="standard" selected>Standard (Grade 9\u201312)</option>
              <option value="advanced">Advanced (Collegiate)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Language</label>
            <select id="pgd-lang" class="form-control">
              <option value="English" selected>English</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
            </select>
          </div>
        </div>
        <div id="pgd-error" style="display:none" class="notice notice-warn"></div>
        <div id="pgd-status" style="display:none" class="notice notice-ok"></div>
        <button class="btn btn-primary" id="pgd-gen-btn" onclick="window._pgdGenerate()">Generate Guide \u2726</button>
      </div>
    </div>
  </div>

  <!-- OLD CONTENT HIDDEN (unused placeholder for build safety) -->
  <div id="hb-placeholder-old" style="display:none">
  <div class="g2" style="margin-bottom:24px">
  </div>
  <!-- /OLD CONTENT HIDDEN -->`;

}

export function bindHandbooks() {
  // ── Library: Preview toggle ──────────────────────────────────────────────
  window._hbPreviewToggle = function(idx) {
    const panel = document.getElementById('hb-preview-' + idx);
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  };

  // ── Library: Download .docx ──────────────────────────────────────────────
  window._hbDownload = async function(idx) {
    const doc = LIBRARY_DOCS[idx];
    if (!doc) return;
    const btn = document.getElementById('hb-dl-btn-' + idx);
    const origText = btn ? btn.textContent : 'Download .docx';
    if (btn) { btn.disabled = true; btn.textContent = 'Downloading\u2026'; }
    try {
      const blob = await api.exportHandbookDocx({ document_type: doc.docType, modality: doc.modality });
      downloadBlob(blob, doc.docType + '.docx');
    } catch (e) {
      const t = document.createElement('div'); t.className = 'notice notice-error'; t.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:360px'; t.textContent = 'Download failed: ' + (e.message || 'Unknown error'); document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
  };

  // ── Protocol Generator ───────────────────────────────────────────────────
  window._pgGenerate = async function() {
    const btn    = document.getElementById('pg-gen-btn');
    const errEl  = document.getElementById('pg-error');
    const result = document.getElementById('pg-result');
    if (!errEl || !result) return;
    errEl.style.display = 'none';

    const condition          = document.getElementById('pg-condition')?.value || '';
    const modality           = document.getElementById('pg-modality')?.value  || '';
    const device_name        = document.getElementById('pg-device')?.value    || '';
    const evidence_threshold = document.getElementById('pg-evidence')?.value  || 'B';
    const setting            = document.getElementById('pg-setting')?.value   || 'clinical';
    const symptom_cluster    = document.getElementById('pg-symptom')?.value   || '';
    const off_label          = document.getElementById('pg-offlabel')?.checked || false;

    if (!condition || !modality) {
      errEl.textContent = 'Please select a condition and modality.';
      errEl.style.display = '';
      return;
    }

    const formData = { condition_name: condition, modality_name: modality, device_name, evidence_threshold, setting, symptom_cluster, off_label };

    if (btn) { btn.disabled = true; btn.textContent = 'Generating\u2026'; }
    result.innerHTML = '<div style="padding:24px 0;text-align:center">' + spinner() + '<div style="font-size:12px;color:var(--text-tertiary);margin-top:8px">Generating protocol draft\u2026</div></div>';

    try {
      const res = await api.generateProtocol(formData);
      const p   = res?.protocol || res || {};

      const rows = [
        ['Condition',  p.condition_name  || condition],
        ['Modality',   p.modality_name   || modality],
        ['Device',     p.device_name     || device_name || '\u2014'],
        ['Setting',    p.setting         || setting],
        ['Evidence',   p.evidence_threshold || evidence_threshold],
        ['Off-label',  off_label ? 'Yes' : 'No'],
      ].map(function(r) {
        return '<div><span style="color:var(--text-tertiary)">' + r[0] + ':</span> <span style="color:var(--text-primary);font-weight:500">' + r[1] + '</span></div>';
      }).join('');

      result.innerHTML = '<div style="padding:16px;background:rgba(0,0,0,0.2);border-radius:var(--radius-md);border:1px solid var(--border)">'
        + '<div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">Generated Protocol</div>'
        + '<div class="g2" style="margin-bottom:12px;font-size:12px">' + rows + '</div>'
        + (p.rationale ? '<div style="font-size:12px;color:var(--text-secondary);line-height:1.65;margin-bottom:10px;padding:10px;background:rgba(0,0,0,0.15);border-radius:var(--radius-sm)"><strong style="color:var(--text-primary)">Rationale:</strong> ' + p.rationale + '</div>' : '')
        + (p.parameters ? '<div style="font-size:12px;color:var(--text-secondary);line-height:1.65;margin-bottom:10px;padding:10px;background:rgba(0,0,0,0.15);border-radius:var(--radius-sm)"><strong style="color:var(--text-primary)">Parameters:</strong> ' + (typeof p.parameters === 'object' ? JSON.stringify(p.parameters) : p.parameters) + '</div>' : '')
        + (p.governance_notes ? '<div style="font-size:12px;color:var(--amber);line-height:1.65;margin-bottom:10px;padding:10px;background:rgba(255,181,71,0.06);border-radius:var(--radius-sm);border:1px solid rgba(255,181,71,0.2)"><strong>Governance:</strong> ' + p.governance_notes + '</div>' : '')
        + '<button class="btn btn-primary btn-sm" id="pg-dl-btn" onclick="window._pgDownload()">Download as .docx</button>'
        + '<div id="pg-dl-error" style="display:none;font-size:11px;color:var(--red);margin-top:6px"></div>'
        + '</div>';

      window._pgCurrentFormData = formData;

      window._pgDownload = async function() {
        const dlBtn = document.getElementById('pg-dl-btn');
        const dlErr = document.getElementById('pg-dl-error');
        if (dlBtn) { dlBtn.disabled = true; dlBtn.textContent = 'Downloading\u2026'; }
        try {
          const blob = await api.exportProtocolDocx(window._pgCurrentFormData);
          downloadBlob(blob, 'protocol-' + condition.replace(/\s+/g, '-') + '-' + modality.replace(/\s+/g, '-') + '.docx');
        } catch (e) {
          if (dlErr) { dlErr.textContent = e.message || 'Export failed.'; dlErr.style.display = ''; }
        } finally {
          if (dlBtn) { dlBtn.disabled = false; dlBtn.textContent = 'Download as .docx'; }
        }
      };
    } catch (e) {
      errEl.textContent = e.message || 'Generation failed.';
      errEl.style.display = '';
      result.innerHTML = '';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Generate & Preview \u2726'; }
    }
  };

  // ── Case Summary Generator ───────────────────────────────────────────────
  window._csGenerate = async function() {
    const btn    = document.getElementById('cs-gen-btn');
    const errEl  = document.getElementById('cs-error');
    const result = document.getElementById('cs-result');
    if (!errEl || !result) return;
    errEl.style.display = 'none';

    const patient_notes = document.getElementById('cs-notes')?.value    || '';
    const condition     = document.getElementById('cs-condition')?.value || '';
    const modality      = document.getElementById('cs-modality')?.value  || '';
    const session_count = parseInt(document.getElementById('cs-sessions')?.value || '0', 10);

    if (!patient_notes.trim()) {
      errEl.textContent = 'Please enter patient notes.';
      errEl.style.display = '';
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Generating\u2026'; }
    result.innerHTML = '<div style="padding:20px 0;text-align:center">' + spinner() + '</div>';

    try {
      const res     = await api.caseSummary({ patient_notes, condition, modality, session_count });
      const summary = res?.summary || res?.content || res?.text || JSON.stringify(res);

      result.innerHTML = '<div style="padding:16px;background:rgba(0,0,0,0.2);border-radius:var(--radius-md);border:1px solid var(--border)">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        + '<div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px">AI Case Summary</div>'
        + '<button class="btn btn-sm" onclick="window._csCopy()">Copy to Clipboard</button></div>'
        + '<div id="cs-summary-text" style="font-size:12.5px;color:var(--text-secondary);line-height:1.75;white-space:pre-wrap">' + summary + '</div>'
        + '</div>';

      window._csCopy = function() {
        const text = document.getElementById('cs-summary-text')?.textContent || '';
        navigator.clipboard.writeText(text).then(function() {
          const copyBtn = result.querySelector('button');
          if (copyBtn) {
            copyBtn.textContent = 'Copied!';
            setTimeout(function() { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
          }
        }).catch(function() { errEl.textContent = 'Copy failed — please select and copy text manually.'; errEl.style.display = ''; });
      };
    } catch (e) {
      errEl.textContent = e.message || 'Summary generation failed.';
      errEl.style.display = '';
      result.innerHTML = '';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Generate Summary \u2726'; }
    }
  };

  // ── Patient Guide Generator ──────────────────────────────────────────────
  window._pgdGenerate = async function() {
    const btn      = document.getElementById('pgd-gen-btn');
    const errEl    = document.getElementById('pgd-error');
    const statusEl = document.getElementById('pgd-status');
    if (!errEl || !statusEl) return;
    errEl.style.display    = 'none';
    statusEl.style.display = 'none';

    const condition     = document.getElementById('pgd-condition')?.value || '';
    const modality      = document.getElementById('pgd-modality')?.value  || '';
    const reading_level = document.getElementById('pgd-level')?.value     || 'standard';
    const language      = document.getElementById('pgd-lang')?.value      || 'English';

    if (!condition || !modality) {
      errEl.textContent = 'Please select a condition and modality.';
      errEl.style.display = '';
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Generating\u2026'; }

    try {
      const blob = await api.exportPatientGuideDocx({ condition, modality, reading_level, language });
      downloadBlob(blob, 'patient-guide.docx');
      statusEl.textContent = 'Download ready \u2014 your patient guide has been saved.';
      statusEl.style.display = '';
      setTimeout(function() { statusEl.style.display = 'none'; }, 5000);
    } catch (e) {
      errEl.textContent = e.message || 'Guide generation failed.';
      errEl.style.display = '';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Generate Guide \u2726'; }
    }
  };
}

// ── Audit Trail ───────────────────────────────────────────────────────────────
export async function pgAuditTrail(setTopbar) {
  // ── Topbar ────────────────────────────────────────────────────────────────
  setTopbar('Audit Trail', `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <button id="audit-view-timeline" class="btn btn-primary btn-sm" onclick="window._setAuditView('timeline')">Timeline</button>
      <button id="audit-view-table" class="btn btn-ghost btn-sm" onclick="window._setAuditView('table')">Table</button>
      <button class="btn btn-ghost btn-sm" onclick="window._exportAuditCSV()">Export CSV</button>
    </div>`);

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── Data loading ──────────────────────────────────────────────────────────
  const res = await api.auditTrail().catch(() => null);
  let entries = res?.items || res || [];
  if (!Array.isArray(entries)) entries = [];

  const DEMO_ENTRIES = [
    { created_at: new Date().toISOString(), actor: 'Dr. Chen', action: 'LOGIN', resource_type: 'session', resource_id: '' },
    { created_at: new Date(Date.now()-3600000).toISOString(), actor: 'Dr. Patel', action: 'APPROVE', resource_type: 'course', resource_id: 'course-abc123' },
    { created_at: new Date(Date.now()-7200000).toISOString(), actor: 'Tech Kim', action: 'CREATE', resource_type: 'session_log', resource_id: 'sess-xyz789' },
    { created_at: new Date(Date.now()-86400000).toISOString(), actor: 'Dr. Chen', action: 'GENERATE', resource_type: 'protocol', resource_id: '' },
    { created_at: new Date(Date.now()-172800000).toISOString(), actor: 'Admin', action: 'DELETE', resource_type: 'patient', resource_id: 'pat-old001' },
  ];
  const isDemo = entries.length === 0;
  const displayEntries = isDemo ? DEMO_ENTRIES : entries;

  window._auditData = displayEntries;
  window._auditFiltered = displayEntries;
  window._auditPage = 0;
  window._auditView = 'timeline';

  // ── Helpers ───────────────────────────────────────────────────────────────
  function actionColor(action) {
    const a = (action || '').toUpperCase();
    if (a === 'CREATE') return 'var(--teal)';
    if (a === 'UPDATE' || a === 'APPROVE') return 'var(--blue)';
    if (a === 'DELETE' || a === 'REJECT' || a === 'DISCONTINUE') return 'var(--red)';
    if (a === 'LOGIN' || a === 'LOGOUT') return 'var(--violet)';
    if (a === 'EXPORT' || a === 'GENERATE') return 'var(--amber)';
    return 'var(--text-tertiary)';
  }

  function isHighRisk(action) {
    return ['DELETE','REJECT','DISCONTINUE','EXPORT'].includes((action||'').toUpperCase());
  }

  function fmtDate(iso) {
    if (!iso) return { date: '—', time: '' };
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
      time: d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    };
  }

  function uniqueActors(arr) {
    const s = new Set();
    arr.forEach(e => { const a = e.actor || e.user_id; if (a) s.add(a); });
    return [...s];
  }

  function todayStr() { return new Date().toISOString().split('T')[0]; }

  // ── Stats computation ─────────────────────────────────────────────────────
  function computeStats(arr) {
    const today = todayStr();
    const todayEntries = arr.filter(e => (e.created_at || '').startsWith(today));
    const highRisk = arr.filter(e => isHighRisk(e.action)).length;
    const lastEntry = arr.length ? arr[0] : null;
    const lastTime = lastEntry ? fmtDate(lastEntry.created_at) : null;
    return {
      totalToday: todayEntries.length,
      uniqueActorsToday: new Set(todayEntries.map(e => e.actor || e.user_id).filter(Boolean)).size,
      highRisk,
      lastEvent: lastTime ? `${lastTime.date} ${lastTime.time}` : '—',
    };
  }

  // ── Build unique actors list for filter dropdown ───────────────────────────
  const allActors = uniqueActors(displayEntries);

  // ── Compliance summary ─────────────────────────────────────────────────────
  function complianceSummaryHTML() {
    const frameworks = [
      {
        name: 'HIPAA Compliance',
        color: 'var(--teal)',
        border: 'var(--border-teal)',
        status: 'Compliant',
        statusColor: 'var(--green)',
        statusIcon: '✓',
        items: [
          { icon: '✓', color: 'var(--green)', label: 'Audit logging active' },
          { icon: '✓', color: 'var(--green)', label: 'Access controls' },
          { icon: '✓', color: 'var(--green)', label: 'Encryption at rest' },
          { icon: '✓', color: 'var(--green)', label: '7-year retention policy' },
          { icon: '✓', color: 'var(--green)', label: 'Session authentication' },
        ],
      },
      {
        name: 'GDPR Compliance',
        color: 'var(--blue)',
        border: 'var(--border-blue)',
        status: 'Compliant',
        statusColor: 'var(--green)',
        statusIcon: '✓',
        items: [
          { icon: '✓', color: 'var(--green)', label: 'Data minimisation' },
          { icon: '✓', color: 'var(--green)', label: 'Consent records' },
          { icon: '✓', color: 'var(--green)', label: 'Right to erasure' },
          { icon: '✓', color: 'var(--green)', label: 'Data portability' },
          { icon: '✓', color: 'var(--green)', label: 'Breach notification protocol' },
        ],
      },
      {
        name: 'SOC2 Readiness',
        color: 'var(--amber)',
        border: 'rgba(255,181,71,0.3)',
        status: 'In Progress',
        statusColor: 'var(--amber)',
        statusIcon: '◑',
        items: [
          { icon: '✓', color: 'var(--green)', label: 'Access controls' },
          { icon: '✓', color: 'var(--green)', label: 'Audit trail' },
          { icon: '◑', color: 'var(--amber)', label: 'Penetration test pending' },
          { icon: '◑', color: 'var(--amber)', label: 'SOC2 Type II pending' },
          { icon: '◑', color: 'var(--amber)', label: 'Vendor assessment pending' },
        ],
      },
    ];
    return `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <h3>Compliance Summary</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">HIPAA · GDPR · SOC2</span>
      </div>
      <div class="card-body">
        <div class="g3">
          ${frameworks.map(f => `
          <div class="card" style="margin-bottom:0;border-left:3px solid ${f.border}">
            <div class="card-body" style="padding:14px 16px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${f.name}</div>
                <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;background:${f.statusColor === 'var(--green)' ? 'rgba(74,222,128,0.12)' : 'rgba(255,181,71,0.12)'};color:${f.statusColor}">${f.statusIcon} ${f.status}</span>
              </div>
              <div style="margin-bottom:12px">
                ${f.items.map(item => `
                <div style="display:flex;align-items:center;gap:7px;padding:3px 0;font-size:11.5px;color:var(--text-secondary)">
                  <span style="color:${item.color};font-size:12px;flex-shrink:0">${item.icon}</span>
                  ${item.label}
                </div>`).join('')}
              </div>
              <button class="btn btn-ghost btn-sm" style="width:100%;font-size:11px;opacity:0.5;cursor:not-allowed" disabled>Download Report</button>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  // ── Filters HTML ──────────────────────────────────────────────────────────
  function filtersHTML() {
    return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:12px 16px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input id="audit-search" type="text" placeholder="Search actor / action / resource…"
            style="flex:1;min-width:180px;background:var(--bg-surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;font-size:12px;color:var(--text-primary);outline:none"
            oninput="window._filterAudit()" />
          <select id="audit-action"
            style="background:var(--bg-surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;font-size:12px;color:var(--text-primary);cursor:pointer"
            onchange="window._filterAudit()">
            <option value="">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="READ">READ</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
            <option value="APPROVE">APPROVE</option>
            <option value="REJECT">REJECT</option>
            <option value="EXPORT">EXPORT</option>
            <option value="GENERATE">GENERATE</option>
          </select>
          <select id="audit-user"
            style="background:var(--bg-surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;font-size:12px;color:var(--text-primary);cursor:pointer"
            onchange="window._filterAudit()">
            <option value="">All Users</option>
            ${allActors.map(a => `<option value="${a}">${a}</option>`).join('')}
          </select>
          <input id="audit-from" type="date"
            style="background:var(--bg-surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;font-size:12px;color:var(--text-primary);cursor:pointer"
            onchange="window._filterAudit()" />
          <input id="audit-to" type="date"
            style="background:var(--bg-surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;font-size:12px;color:var(--text-primary);cursor:pointer"
            onchange="window._filterAudit()" />
          <button class="btn btn-ghost btn-sm" onclick="window._clearAuditFilters()">Clear</button>
        </div>
      </div>
    </div>`;
  }

  // ── Stats strip ───────────────────────────────────────────────────────────
  function statsHTML(arr) {
    const s = computeStats(arr);
    return `
    <div class="g3" style="margin-bottom:16px;grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="metric-card">
        <div class="metric-label">Events Today</div>
        <div class="metric-value">${s.totalToday}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Unique Actors Today</div>
        <div class="metric-value">${s.uniqueActorsToday}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">High-Risk Actions</div>
        <div class="metric-value" style="color:${s.highRisk > 0 ? 'var(--red)' : 'var(--text-primary)'}">${s.highRisk}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Last Event</div>
        <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text-primary);line-height:1.3;margin-top:4px">${s.lastEvent}</div>
      </div>
    </div>`;
  }

  // ── Timeline entry renderer ───────────────────────────────────────────────
  function renderTimelineEntry(e, i) {
    const { date, time } = fmtDate(e.created_at);
    const actor = e.actor || e.user_id || '—';
    const action = e.action || '—';
    const resType = e.resource_type || '';
    const resId = e.resource_id || e.target_id || '';
    const color = actionColor(action);
    const highRisk = isHighRisk(action);
    const payload = e.payload || e.changes || null;
    return `
    <div style="display:flex;gap:16px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:140px;flex-shrink:0;text-align:right">
        <div style="font-size:11px;color:var(--text-secondary)">${date}</div>
        <div style="font-size:10.5px;color:var(--text-tertiary)">${time}</div>
        <div style="font-size:10.5px;color:var(--teal);margin-top:2px">${actor}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;width:20px;flex-shrink:0">
        <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;margin-top:4px"></div>
        <div style="flex:1;width:1px;background:var(--border);margin-top:4px"></div>
      </div>
      <div style="flex:1;padding-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${action}</span>
          ${resType ? `<span class="tag">${resType}</span>` : ''}
          ${highRisk ? `<span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;background:rgba(255,107,107,0.15);color:var(--red)">HIGH RISK</span>` : ''}
        </div>
        ${resId ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-top:3px">${resId}</div>` : ''}
        ${payload ? `
        <button onclick="(function(){var p=document.getElementById('audit-payload-${i}');var b=document.getElementById('audit-toggle-${i}');if(p.style.display==='none'){p.style.display='block';b.textContent='Hide details ×';}else{p.style.display='none';b.textContent='Show details ›'}})()" id="audit-toggle-${i}" style="font-size:10px;color:var(--text-tertiary);background:none;border:none;cursor:pointer;margin-top:4px">Show details ›</button>
        <pre id="audit-payload-${i}" style="display:none;font-size:10.5px;color:var(--text-secondary);background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;margin-top:6px;overflow-x:auto;white-space:pre-wrap">${JSON.stringify(payload, null, 2)}</pre>` : ''}
      </div>
    </div>`;
  }

  // ── Timeline render function ──────────────────────────────────────────────
  window._renderAuditTimeline = function(slice) {
    const container = document.getElementById('audit-timeline');
    if (!container) return;
    const isFirstPage = window._auditPage === 0;
    const html = slice.map((e, i) => renderTimelineEntry(e, (window._auditPage * 50) + i)).join('');
    if (isFirstPage) {
      container.innerHTML = html || `<div style="padding:32px 0;text-align:center;color:var(--text-tertiary);font-size:13px">No events match the current filters.</div>`;
    } else {
      container.insertAdjacentHTML('beforeend', html);
    }
    const loadMoreBtn = document.getElementById('audit-load-more');
    const filtered = window._auditFiltered || [];
    const shown = (window._auditPage + 1) * 50;
    if (loadMoreBtn) {
      loadMoreBtn.style.display = shown < filtered.length ? 'block' : 'none';
    }
  };

  // ── Table render function ─────────────────────────────────────────────────
  window._renderAuditTable = function(arr) {
    const container = document.getElementById('audit-table-container');
    if (!container) return;
    container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="ds-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Resource Type</th>
            <th>Resource ID</th>
            <th>IP Address</th>
            <th>Risk Level</th>
          </tr>
        </thead>
        <tbody>
          ${arr.map(e => {
            const { date, time } = fmtDate(e.created_at);
            const action = e.action || '—';
            const hr = isHighRisk(action);
            return `<tr>
              <td class="mono" style="white-space:nowrap;font-size:11px;color:var(--text-tertiary)">${date} ${time}</td>
              <td style="font-size:11.5px;color:var(--teal)">${e.actor || e.user_id || '—'}</td>
              <td><span class="tag" style="color:${actionColor(action)}">${action}</span></td>
              <td style="color:var(--text-secondary)">${e.resource_type || e.target_type || '—'}</td>
              <td class="mono" style="font-size:11px;color:var(--text-tertiary)">${e.resource_id || e.target_id || '—'}</td>
              <td class="mono" style="font-size:11px;color:var(--text-tertiary)">${e.ip_address || '—'}</td>
              <td>${hr ? `<span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;background:rgba(255,107,107,0.15);color:var(--red)">HIGH RISK</span>` : `<span style="font-size:10px;color:var(--text-tertiary)">Normal</span>`}</td>
            </tr>`;
          }).join('')}
          ${arr.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:var(--text-tertiary);padding:32px">No events match the current filters.</td></tr>` : ''}
        </tbody>
      </table>
    </div>`;
  };

  // ── View toggle ───────────────────────────────────────────────────────────
  window._setAuditView = function(view) {
    window._auditView = view;
    const tlBtn = document.getElementById('audit-view-timeline');
    const tbBtn = document.getElementById('audit-view-table');
    const tlEl = document.getElementById('audit-timeline-wrap');
    const tbEl = document.getElementById('audit-table-wrap');
    if (tlBtn) { tlBtn.className = view === 'timeline' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'; }
    if (tbBtn) { tbBtn.className = view === 'table' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'; }
    if (tlEl) tlEl.style.display = view === 'timeline' ? 'block' : 'none';
    if (tbEl) tbEl.style.display = view === 'table' ? 'block' : 'none';
    if (view === 'table') {
      window._renderAuditTable(window._auditFiltered || window._auditData || []);
    }
  };

  // ── Filter logic ──────────────────────────────────────────────────────────
  window._filterAudit = function() {
    const q = document.getElementById('audit-search')?.value.toLowerCase() || '';
    const action = document.getElementById('audit-action')?.value || '';
    const user = document.getElementById('audit-user')?.value || '';
    const dateFrom = document.getElementById('audit-from')?.value;
    const dateTo = document.getElementById('audit-to')?.value;

    let filtered = window._auditData || [];
    if (q) filtered = filtered.filter(e =>
      (e.actor || e.user_id || '').toLowerCase().includes(q) ||
      (e.action || '').toLowerCase().includes(q) ||
      (e.resource_type || '').toLowerCase().includes(q) ||
      (e.resource_id || '').toLowerCase().includes(q)
    );
    if (action) filtered = filtered.filter(e => (e.action || '').toUpperCase().startsWith(action));
    if (user) filtered = filtered.filter(e => (e.actor || e.user_id) === user);
    if (dateFrom) filtered = filtered.filter(e => e.created_at >= dateFrom);
    if (dateTo) filtered = filtered.filter(e => e.created_at <= dateTo + 'T23:59:59');

    window._auditFiltered = filtered;
    window._auditPage = 0;
    if (window._auditView === 'table') {
      window._renderAuditTable(filtered);
    } else {
      window._renderAuditTimeline(filtered.slice(0, 50));
    }
  };

  // ── Clear filters ─────────────────────────────────────────────────────────
  window._clearAuditFilters = function() {
    const ids = ['audit-search','audit-action','audit-user','audit-from','audit-to'];
    ids.forEach(id => { const el2 = document.getElementById(id); if (el2) el2.value = ''; });
    window._filterAudit();
  };

  // ── CSV Export ────────────────────────────────────────────────────────────
  window._exportAuditCSV = function() {
    const data = window._auditFiltered || window._auditData || [];
    const rows = [['Timestamp','Actor','Action','Resource Type','Resource ID','IP']];
    data.forEach(e => rows.push([
      e.created_at || '', e.actor || e.user_id || '', e.action || '',
      e.resource_type || '', e.resource_id || '', e.ip_address || ''
    ]));
    const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'audit-trail.csv';
    a.click();
  };

  // ── Render page ───────────────────────────────────────────────────────────
  el.innerHTML = `
  <div style="max-width:900px;margin:0 auto;padding-bottom:40px">
    ${isDemo ? `<div class="notice notice-info" style="margin-bottom:16px">No audit events recorded yet. Events are logged automatically as you use the platform.</div>
    <div class="notice notice-warn" style="margin-bottom:16px">Demo data — connect backend for live events</div>` : ''}

    ${complianceSummaryHTML()}

    ${filtersHTML()}

    <div id="audit-stats-strip">${statsHTML(displayEntries)}</div>

    <!-- Timeline view -->
    <div id="audit-timeline-wrap">
      <div class="card">
        <div class="card-header">
          <h3>Event Timeline</h3>
          <span style="font-size:11px;color:var(--text-tertiary)">${displayEntries.length} total events</span>
        </div>
        <div class="card-body" style="padding:0 18px">
          <div id="audit-timeline"></div>
          <div style="text-align:center;padding:16px 0">
            <button id="audit-load-more" class="btn btn-ghost btn-sm" style="display:none" onclick="
              window._auditPage++;
              const start = window._auditPage * 50;
              const next = (window._auditFiltered || []).slice(start, start + 50);
              window._renderAuditTimeline(next);
            ">Load more events</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Table view -->
    <div id="audit-table-wrap" style="display:none">
      <div id="audit-table-container"></div>
    </div>
  </div>`;

  // Initial render
  window._auditPage = 0;
  window._renderAuditTimeline(displayEntries.slice(0, 50));
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

// ── Report Builder ────────────────────────────────────────────────────────────

const REPORT_BLOCKS = [
  { type: 'kpi-strip',        label: 'KPI Strip',         icon: '📊', desc: 'Summary metrics row' },
  { type: 'patient-table',    label: 'Patient Table',      icon: '👥', desc: 'Active patients with status' },
  { type: 'outcome-chart',    label: 'Outcome Chart',      icon: '📈', desc: 'Outcome score trends' },
  { type: 'session-log',      label: 'Session Log',        icon: '🗓️', desc: 'Recent sessions table' },
  { type: 'protocol-summary', label: 'Protocol Summary',   icon: '⚡', desc: 'Top protocols in use' },
  { type: 'revenue-summary',  label: 'Revenue Summary',    icon: '💰', desc: 'Billing KPIs (requires billing data)' },
  { type: 'risk-flags',       label: 'Risk Flags',         icon: '⚠️', desc: 'Non-responder early warnings' },
  { type: 'ae-log',           label: 'Adverse Events',     icon: '🔴', desc: 'AE summary table' },
  { type: 'text-block',       label: 'Text / Notes',       icon: '📝', desc: 'Free-text commentary section' },
  { type: 'divider',          label: 'Divider',            icon: '─',  desc: 'Section separator' },
];

// ── Saved reports store ───────────────────────────────────────────────────────
const DS_REPORTS_KEY = 'ds_saved_reports';

function getSavedReports() {
  try { return JSON.parse(localStorage.getItem(DS_REPORTS_KEY) || 'null'); } catch { return null; }
}

function _seedReports() {
  const seed = [
    {
      id: 'seed-weekly',
      name: 'Weekly Clinical Summary',
      blocks: ['kpi-strip', 'patient-table', 'session-log'],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'seed-monthly',
      name: 'Monthly Outcomes Review',
      blocks: ['kpi-strip', 'outcome-chart', 'protocol-summary'],
      createdAt: new Date().toISOString(),
    },
  ];
  localStorage.setItem(DS_REPORTS_KEY, JSON.stringify(seed));
  return seed;
}

function _getOrSeedReports() {
  const r = getSavedReports();
  if (!r || r.length === 0) return _seedReports();
  return r;
}

function saveReport(report) {
  const reports = _getOrSeedReports();
  const idx = reports.findIndex(r => r.id === report.id);
  if (idx > -1) reports[idx] = report;
  else reports.push(report);
  localStorage.setItem(DS_REPORTS_KEY, JSON.stringify(reports));
}

function deleteReport(id) {
  const reports = _getOrSeedReports().filter(r => r.id !== id);
  localStorage.setItem(DS_REPORTS_KEY, JSON.stringify(reports));
}

// ── Mock data generators ──────────────────────────────────────────────────────
function _reportKPIData() {
  return { activeCourses: 34, avgOutcome: 71, sessionsThisWeek: 28, newPatients: 5 };
}

function _reportPatientRows() {
  return [
    { name: 'Alice Morgan',    condition: 'Depression',         status: 'Active',     lastSession: '2026-04-08', score: 72 },
    { name: 'Ben Carr',        condition: 'Anxiety',            status: 'Active',     lastSession: '2026-04-07', score: 65 },
    { name: 'Clara Diaz',      condition: 'PTSD',               status: 'Review',     lastSession: '2026-04-06', score: 58 },
    { name: 'David Kim',       condition: 'OCD',                status: 'Active',     lastSession: '2026-04-05', score: 80 },
    { name: 'Eva Russo',       condition: 'Chronic Pain',       status: 'Paused',     lastSession: '2026-03-30', score: 47 },
    { name: 'Frank Osei',      condition: 'Insomnia',           status: 'Active',     lastSession: '2026-04-09', score: 88 },
    { name: 'Grace Lin',       condition: 'ADHD',               status: 'Active',     lastSession: '2026-04-08', score: 74 },
    { name: 'Hiro Tanaka',     condition: 'TBI Rehabilitation',  status: 'Discharge',  lastSession: '2026-04-01', score: 91 },
  ];
}

function _reportSessionRows() {
  return [
    { patient: 'Alice Morgan',  date: '2026-04-08', type: 'TMS',          duration: '40 min', notes: 'Good tolerance' },
    { patient: 'Frank Osei',    date: '2026-04-09', type: 'Neurofeedback', duration: '50 min', notes: 'Protocol adjusted' },
    { patient: 'Grace Lin',     date: '2026-04-08', type: 'tDCS',         duration: '30 min', notes: 'Normal session' },
    { patient: 'Ben Carr',      date: '2026-04-07', type: 'TMS',          duration: '40 min', notes: 'Mild headache reported' },
    { patient: 'David Kim',     date: '2026-04-05', type: 'Neurofeedback', duration: '45 min', notes: 'Stable progress' },
    { patient: 'Clara Diaz',    date: '2026-04-06', type: 'TMS',          duration: '40 min', notes: 'Under review' },
    { patient: 'Hiro Tanaka',   date: '2026-04-01', type: 'tDCS',         duration: '30 min', notes: 'Final session' },
    { patient: 'Eva Russo',     date: '2026-03-30', type: 'TMS',          duration: '40 min', notes: 'Paused — travel' },
    { patient: 'Alice Morgan',  date: '2026-04-03', type: 'TMS',          duration: '40 min', notes: 'Week 3 session' },
    { patient: 'Grace Lin',     date: '2026-04-05', type: 'tDCS',         duration: '30 min', notes: 'Consistent gains' },
  ];
}

function _reportProtocolRows() {
  return [
    { name: 'TMS — Depression Protocol',    usage: 18, avgOutcome: 74 },
    { name: 'Neurofeedback — Alpha/Theta',   usage: 12, avgOutcome: 69 },
    { name: 'tDCS — DLPFC Left Anodal',      usage: 9,  avgOutcome: 77 },
    { name: 'TMS — OCD Deep Protocol',       usage: 5,  avgOutcome: 80 },
    { name: 'Neurofeedback — SMR Training',  usage: 4,  avgOutcome: 66 },
  ];
}

function _reportAERows() {
  return [
    { patient: 'Ben Carr',    date: '2026-04-07', type: 'Headache',       severity: 'Mild',     resolved: 'Yes' },
    { patient: 'Clara Diaz',  date: '2026-04-06', type: 'Scalp Tingling', severity: 'Mild',     resolved: 'Yes' },
    { patient: 'Eva Russo',   date: '2026-03-28', type: 'Fatigue',        severity: 'Moderate', resolved: 'Pending' },
    { patient: 'David Kim',   date: '2026-04-02', type: 'Discomfort',     severity: 'Mild',     resolved: 'Yes' },
  ];
}

// ── Block renderers ───────────────────────────────────────────────────────────
function _renderKPIBlock() {
  const d = _reportKPIData();
  const items = [
    { label: 'Active Courses',      value: d.activeCourses },
    { label: 'Avg Outcome Score',   value: d.avgOutcome + '%' },
    { label: 'Sessions This Week',  value: d.sessionsThisWeek },
    { label: 'New Patients',        value: d.newPatients },
  ];
  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
    ${items.map(i => `<div style="background:rgba(0,212,188,0.07);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:1.8rem;font-weight:800;color:var(--accent-teal,#00d4bc)">${i.value}</div>
      <div style="font-size:.78rem;color:var(--text-muted,#94a3b8);margin-top:4px">${i.label}</div>
    </div>`).join('')}
  </div>`;
}

function _renderPatientTableBlock() {
  const rows = _reportPatientRows();
  const stColor = { Active:'#00d4bc', Review:'#f59e0b', Paused:'#94a3b8', Discharge:'#60a5fa' };
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.82rem">
    <thead><tr style="border-bottom:1px solid var(--border)">
      ${['Patient','Condition','Status','Last Session','Score'].map(h => `<th style="text-align:left;padding:8px 10px;color:var(--text-muted,#94a3b8);font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em">${h}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 10px;font-weight:500">${r.name}</td>
        <td style="padding:8px 10px;color:var(--text-muted,#94a3b8)">${r.condition}</td>
        <td style="padding:8px 10px"><span style="font-size:.72rem;font-weight:600;padding:2px 8px;border-radius:10px;background:${stColor[r.status] || '#94a3b8'}22;color:${stColor[r.status] || '#94a3b8'}">${r.status}</span></td>
        <td style="padding:8px 10px;color:var(--text-muted,#94a3b8)">${r.lastSession}</td>
        <td style="padding:8px 10px"><span style="font-weight:700;color:${r.score >= 75 ? '#00d4bc' : r.score >= 60 ? '#f59e0b' : '#f87171'}">${r.score}%</span></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function _renderOutcomeChartBlock() {
  const rows = _reportPatientRows();
  const barW = 38, gap = 6, padL = 30, padB = 40, padT = 10, h = 180;
  const chartH = h - padB - padT;
  const bars = rows.map((r, i) => {
    const bh = Math.round((r.score / 100) * chartH);
    const x = padL + i * (barW + gap);
    const y = padT + chartH - bh;
    const col = r.score >= 75 ? '#00d4bc' : r.score >= 60 ? '#f59e0b' : '#f87171';
    const shortName = r.name.split(' ')[0];
    return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${col}" rx="3" opacity="0.85"/>
      <text x="${x + barW/2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="${col}" font-weight="700">${r.score}</text>
      <text x="${x + barW/2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="#94a3b8">${shortName}</text>`;
  });
  const totalW = padL + rows.length * (barW + gap) + 10;
  return `<div style="overflow-x:auto">
    <svg width="${totalW}" height="${h}" style="display:block;max-width:100%">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#334155" stroke-width="1"/>
      <line x1="${padL}" y1="${padT + chartH}" x2="${totalW}" y2="${padT + chartH}" stroke="#334155" stroke-width="1"/>
      ${[0,25,50,75,100].map(v => {
        const gy = padT + chartH - Math.round((v / 100) * chartH);
        return `<line x1="${padL}" y1="${gy}" x2="${totalW}" y2="${gy}" stroke="#1e293b" stroke-width="1"/>
          <text x="${padL - 4}" y="${gy + 4}" text-anchor="end" font-size="9" fill="#64748b">${v}</text>`;
      }).join('')}
      ${bars.join('')}
    </svg>
    <div style="font-size:.72rem;color:var(--text-muted,#94a3b8);margin-top:4px">Outcome scores by patient — higher is better</div>
  </div>`;
}

function _renderSessionLogBlock() {
  const rows = _reportSessionRows();
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.82rem">
    <thead><tr style="border-bottom:1px solid var(--border)">
      ${['Patient','Date','Type','Duration','Notes'].map(h => `<th style="text-align:left;padding:8px 10px;color:var(--text-muted,#94a3b8);font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em">${h}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 10px;font-weight:500">${r.patient}</td>
        <td style="padding:8px 10px;color:var(--text-muted,#94a3b8)">${r.date}</td>
        <td style="padding:8px 10px"><span style="font-size:.72rem;font-weight:600;padding:2px 7px;border-radius:10px;background:rgba(96,165,250,0.12);color:#60a5fa">${r.type}</span></td>
        <td style="padding:8px 10px;color:var(--text-muted,#94a3b8)">${r.duration}</td>
        <td style="padding:8px 10px;color:var(--text-muted,#94a3b8)">${r.notes}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function _renderProtocolSummaryBlock() {
  const rows = _reportProtocolRows();
  const maxUsage = Math.max(...rows.map(r => r.usage));
  return `<table style="width:100%;border-collapse:collapse;font-size:.82rem">
    <thead><tr style="border-bottom:1px solid var(--border)">
      ${['Protocol','Usage','Avg Outcome','Usage Bar'].map(h => `<th style="text-align:left;padding:8px 10px;color:var(--text-muted,#94a3b8);font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em">${h}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${rows.map(r => {
        const pct = Math.round((r.usage / maxUsage) * 100);
        return `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px 10px;font-weight:500">${r.name}</td>
          <td style="padding:8px 10px;color:var(--text-muted,#94a3b8)">${r.usage} sessions</td>
          <td style="padding:8px 10px"><span style="font-weight:700;color:#00d4bc">${r.avgOutcome}%</span></td>
          <td style="padding:8px 10px;min-width:120px">
            <svg width="100" height="14">
              <rect x="0" y="3" width="100" height="8" rx="4" fill="#1e293b"/>
              <rect x="0" y="3" width="${pct}" height="8" rx="4" fill="#00d4bc" opacity="0.8"/>
            </svg>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

function _renderRevenueSummaryBlock() {
  const items = [
    { label: 'Total Billed',   value: '$42,800', sub: 'this month' },
    { label: 'Collected',      value: '$38,150', sub: '89.1% collection rate' },
    { label: 'Outstanding',    value: '$4,650',  sub: 'pending / overdue' },
  ];
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
    ${items.map(i => `<div style="background:rgba(245,158,11,0.07);border:1px solid var(--border);border-radius:8px;padding:14px">
      <div style="font-size:1.6rem;font-weight:800;color:var(--accent-teal,#00d4bc)">${i.value}</div>
      <div style="font-size:.8rem;font-weight:600;margin-top:4px">${i.label}</div>
      <div style="font-size:.72rem;color:var(--text-muted,#94a3b8);margin-top:2px">${i.sub}</div>
    </div>`).join('')}
  </div>`;
}

function _renderRiskFlagsBlock() {
  const flagged = [
    { name: 'Eva Russo',   condition: 'Chronic Pain', sessions: 12, trend: 'declining',    note: 'No improvement after 12 sessions' },
    { name: 'Clara Diaz',  condition: 'PTSD',         sessions: 8,  trend: 'plateau',      note: 'Score stagnant for 3 sessions' },
    { name: 'Ben Carr',    condition: 'Anxiety',      sessions: 6,  trend: 'AE reported',  note: 'Headache reported, protocol review pending' },
  ];
  return `<div style="display:flex;flex-direction:column;gap:10px">
    ${flagged.map(p => `<div style="border:1px solid rgba(248,113,113,0.4);border-radius:8px;padding:12px 14px;background:rgba(248,113,113,0.05)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div>
          <span style="font-weight:600">${p.name}</span>
          <span style="font-size:.78rem;color:var(--text-muted,#94a3b8);margin-left:8px">${p.condition}</span>
        </div>
        <span style="font-size:.75rem;font-weight:600;color:#f87171">${p.trend}</span>
      </div>
      <div style="font-size:.78rem;color:var(--text-muted,#94a3b8);margin-top:4px">${p.note} · ${p.sessions} sessions completed</div>
    </div>`).join('')}
  </div>`;
}

function _renderAELogBlock() {
  const rows = _reportAERows();
  const sevColor = { Mild:'#f59e0b', Moderate:'#f87171', Severe:'#dc2626' };
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.82rem">
    <thead><tr style="border-bottom:1px solid var(--border)">
      ${['Patient','Date','Type','Severity','Resolved'].map(h => `<th style="text-align:left;padding:8px 10px;color:var(--text-muted,#94a3b8);font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em">${h}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 10px;font-weight:500">${r.patient}</td>
        <td style="padding:8px 10px;color:var(--text-muted,#94a3b8)">${r.date}</td>
        <td style="padding:8px 10px">${r.type}</td>
        <td style="padding:8px 10px"><span style="font-size:.72rem;font-weight:600;padding:2px 8px;border-radius:10px;background:${sevColor[r.severity] || '#94a3b8'}22;color:${sevColor[r.severity] || '#94a3b8'}">${r.severity}</span></td>
        <td style="padding:8px 10px"><span style="font-size:.72rem;font-weight:600;color:${r.resolved === 'Yes' ? '#00d4bc' : '#f59e0b'}">${r.resolved}</span></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function _renderTextBlock(content) {
  const safe = (content || 'Click to edit this text block\u2026').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div contenteditable="true" style="min-height:60px;outline:none;padding:4px;font-size:.88rem;line-height:1.7;color:var(--text,#e2e8f0)" data-textblock="1">${safe}</div>`;
}

function _renderDividerBlock() {
  return `<hr style="border:none;border-top:1px solid var(--border);margin:4px 0">`;
}

function _renderBlockContent(type, textContent) {
  switch (type) {
    case 'kpi-strip':        return _renderKPIBlock();
    case 'patient-table':    return _renderPatientTableBlock();
    case 'outcome-chart':    return _renderOutcomeChartBlock();
    case 'session-log':      return _renderSessionLogBlock();
    case 'protocol-summary': return _renderProtocolSummaryBlock();
    case 'revenue-summary':  return _renderRevenueSummaryBlock();
    case 'risk-flags':       return _renderRiskFlagsBlock();
    case 'ae-log':           return _renderAELogBlock();
    case 'text-block':       return _renderTextBlock(textContent || '');
    case 'divider':          return _renderDividerBlock();
    default:                 return `<div style="color:var(--text-muted,#94a3b8);font-size:.82rem">Unknown block type: ${type}</div>`;
  }
}

// ── pgReportBuilder main export ───────────────────────────────────────────────
export async function pgReportBuilder(setTopbar) {
  setTopbar('Report Builder & Exports', '');
  const el = document.getElementById('content');

  let _state = {
    id: null,
    name: 'Untitled Report',
    blocks: [],
    activeTab: 'builder',
    schedule: { enabled: false, frequency: 'Weekly', email: '' },
    dateRange: '30',
    createdAt: null,
  };

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _render() {
    const reports = _getOrSeedReports();
    const tab = _state.activeTab;
    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn btn-sm ${tab === 'builder' ? 'btn-primary' : ''}" onclick="window._rbSetTab('builder')">Report Builder</button>
        <button class="btn btn-sm ${tab === 'roi' ? 'btn-primary' : ''}" onclick="window._rbSetTab('roi')">ROI Calculator</button>
      </div>
      ${tab === 'builder' ? _renderBuilderTab(reports) : _renderROITab()}
    `;
    // Restore live state into re-rendered inputs
    const schedToggle = document.getElementById('rb-sched-toggle');
    if (schedToggle) schedToggle.checked = _state.schedule.enabled;
    const schedFreq = document.getElementById('rb-sched-freq');
    if (schedFreq) schedFreq.value = _state.schedule.frequency;
    const schedEmail = document.getElementById('rb-sched-email');
    if (schedEmail) schedEmail.value = _state.schedule.email;
    const dateRange = document.getElementById('rb-date-range');
    if (dateRange) dateRange.value = _state.dateRange;
    const nameSide = document.getElementById('rb-report-name-side');
    if (nameSide) nameSide.value = _state.name;
  }

  function _renderBuilderTab(reports) {
    return `<div class="report-builder-layout">
      <!-- LEFT PANEL -->
      <div class="report-palette-panel">
        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted,#94a3b8);margin-bottom:8px">Saved Reports</div>
        <button class="btn btn-sm" style="width:100%;margin-bottom:8px;font-size:.78rem" onclick="window._rbNewReport()">+ New</button>
        ${reports.map(r => `
          <div class="saved-report-item">
            <span onclick="window._loadSavedReport('${_esc(r.id)}')" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(r.name)}">${_esc(r.name)}</span>
            <button onclick="window._deleteSavedReport('${_esc(r.id)}')" style="background:none;border:none;color:var(--text-muted,#94a3b8);cursor:pointer;padding:2px 4px;font-size:12px;flex-shrink:0" title="Delete">&#x2715;</button>
          </div>`).join('')}

        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted,#94a3b8);margin:16px 0 8px">Add Block</div>
        ${REPORT_BLOCKS.map(b => `
          <div class="report-palette-item" onclick="window._reportAddBlock('${b.type}')" title="${_esc(b.desc)}">
            <span style="font-size:1rem">${b.icon}</span>
            <span>${b.label}</span>
          </div>`).join('')}
      </div>

      <!-- CENTER CANVAS -->
      <div class="report-canvas-panel">
        <div class="report-canvas-print">
          <input class="report-title-input" id="rb-title-input" value="${_esc(_state.name)}" placeholder="Report Title" oninput="window._rbUpdateTitle(this.value)">
          ${_state.blocks.length === 0
            ? `<div style="text-align:center;padding:60px 20px;color:var(--text-muted,#94a3b8)">
                <div style="font-size:2.5rem;margin-bottom:12px">&#x1F4C4;</div>
                <div style="font-size:.9rem">Click a block type from the left panel to begin building your report</div>
              </div>`
            : _state.blocks.map((b, i) => {
                const meta = REPORT_BLOCKS.find(r => r.type === b.type) || { label: b.type, icon: '' };
                const isFirst = i === 0;
                const isLast  = i === _state.blocks.length - 1;
                return `<div class="report-block-card" id="rb-block-${i}">
                  <div class="report-block-toolbar">
                    <span style="font-size:.9rem">${meta.icon}</span>
                    <span style="font-weight:600;color:var(--text,#e2e8f0)">${meta.label}</span>
                    <span style="flex:1"></span>
                    <button onclick="window._reportMoveBlock(${i},'up')" ${isFirst ? 'disabled' : ''} style="background:none;border:none;color:var(--text-muted,#94a3b8);cursor:pointer;padding:2px 6px;font-size:12px" title="Move up">&#x25B2;</button>
                    <button onclick="window._reportMoveBlock(${i},'down')" ${isLast ? 'disabled' : ''} style="background:none;border:none;color:var(--text-muted,#94a3b8);cursor:pointer;padding:2px 6px;font-size:12px" title="Move down">&#x25BC;</button>
                    <button onclick="window._reportRemoveBlock(${i})" style="background:none;border:none;color:var(--text-muted,#94a3b8);cursor:pointer;padding:2px 6px;font-size:12px" title="Remove">&#x2715;</button>
                  </div>
                  <div class="report-block-content">${_renderBlockContent(b.type, b.textContent)}</div>
                </div>`;
              }).join('')}
        </div>
      </div>

      <!-- RIGHT PANEL -->
      <div class="report-settings-panel">
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;color:var(--text-muted,#94a3b8)">Report Settings</div>

        <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Report Name</label>
        <input class="form-control" id="rb-report-name-side" style="width:100%;margin-bottom:12px;font-size:.82rem" placeholder="Report Name" oninput="window._rbUpdateTitle(this.value)">

        <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Date Range</label>
        <select class="form-control" id="rb-date-range" style="width:100%;margin-bottom:16px;font-size:.82rem" onchange="window._rbDateRange(this.value)">
          <option value="7">Last 7 days</option>
          <option value="30" selected>Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="custom">Custom</option>
        </select>

        <button class="btn btn-primary" style="width:100%;margin-bottom:20px" onclick="window._saveCurrentReport()">Save Report</button>

        <div style="border-top:1px solid var(--border);padding-top:16px">
          <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted,#94a3b8);margin-bottom:12px">Schedule Email</div>
          <label style="display:flex;align-items:center;gap:8px;font-size:.82rem;margin-bottom:12px;cursor:pointer">
            <input type="checkbox" id="rb-sched-toggle" onchange="window._rbSchedToggle(this.checked)">
            Enable scheduled delivery
          </label>
          <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Frequency</label>
          <select class="form-control" id="rb-sched-freq" style="width:100%;margin-bottom:10px;font-size:.82rem" onchange="window._rbSchedFreq(this.value)">
            <option value="Daily">Daily</option>
            <option value="Weekly" selected>Weekly</option>
            <option value="Monthly">Monthly</option>
          </select>
          <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Recipient Email</label>
          <input class="form-control" id="rb-sched-email" style="width:100%;margin-bottom:10px;font-size:.82rem" type="email" placeholder="clinician@example.com" oninput="window._rbSchedEmail(this.value)">
          <button class="btn btn-sm" style="width:100%" onclick="window._rbSaveSchedule()">Save Schedule</button>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px">
          <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted,#94a3b8);margin-bottom:12px">Export</div>
          <button class="btn btn-sm" style="width:100%;margin-bottom:8px" onclick="window._reportExportCSV()">&#x1F4E5; Export CSV</button>
          <button class="btn btn-sm" style="width:100%;margin-bottom:8px" onclick="window.print()">&#x1F5A8; Print Report</button>
          <button class="btn btn-sm" style="width:100%" onclick="window._reportCopySummary()">&#x1F4CB; Copy Summary</button>
        </div>
      </div>
    </div>`;
  }

  function _renderROITab() {
    return `<div style="max-width:720px;margin:0 auto">
      <div class="roi-calc-card" style="margin-bottom:20px">
        <div style="font-size:1rem;font-weight:700;margin-bottom:16px">ROI Calculator &#x2014; Neuromodulation Practice</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:4px">
          <div>
            <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Sessions per Week</label>
            <input class="form-control" id="roi-sessions-wk" type="number" value="28" min="0" oninput="window._reportCalcROI()">
          </div>
          <div>
            <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Avg Session Rate ($)</label>
            <input class="form-control" id="roi-rate" type="number" value="250" min="0" oninput="window._reportCalcROI()">
          </div>
          <div>
            <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Overhead per Session ($)</label>
            <input class="form-control" id="roi-overhead" type="number" value="80" min="0" oninput="window._reportCalcROI()">
          </div>
          <div>
            <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Sessions per Protocol Course</label>
            <input class="form-control" id="roi-sessions-course" type="number" value="20" min="0" oninput="window._reportCalcROI()">
          </div>
          <div>
            <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Protocol Courses per Month</label>
            <input class="form-control" id="roi-courses-mo" type="number" value="5" min="0" oninput="window._reportCalcROI()">
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px">
        <div class="roi-calc-card" style="text-align:center">
          <div class="roi-output-big" id="roi-out-revenue">&#x2014;</div>
          <div style="font-size:.8rem;color:var(--text-muted,#94a3b8);margin-top:6px">Monthly Revenue</div>
        </div>
        <div class="roi-calc-card" style="text-align:center">
          <div class="roi-output-big" id="roi-out-net">&#x2014;</div>
          <div style="font-size:.8rem;color:var(--text-muted,#94a3b8);margin-top:6px">Net Monthly Income</div>
        </div>
        <div class="roi-calc-card" style="text-align:center">
          <div class="roi-output-big" id="roi-out-annual">&#x2014;</div>
          <div style="font-size:.8rem;color:var(--text-muted,#94a3b8);margin-top:6px">Annual Projection</div>
        </div>
      </div>

      <div class="roi-calc-card">
        <div style="font-size:.82rem;font-weight:700;margin-bottom:12px;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:.06em">Full Breakdown</div>
        <div style="display:flex;flex-direction:column;gap:0;font-size:.88rem">
          ${['Monthly Revenue','Monthly Overhead','Net Monthly Income','Revenue per Protocol Course','Annual Projection'].map((lbl, i) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="color:var(--text-muted,#94a3b8)">${lbl}</span>
              <span id="roi-bd-${i}" style="font-weight:700;color:var(--text,#e2e8f0)">&#x2014;</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  // ── Global handlers ─────────────────────────────────────────────────────────

  window._rbSetTab = function(tab) {
    _state.activeTab = tab;
    _render();
    if (tab === 'roi') setTimeout(window._reportCalcROI, 30);
  };

  window._rbNewReport = function() {
    _state = { id: null, name: 'Untitled Report', blocks: [], activeTab: 'builder', schedule: { enabled: false, frequency: 'Weekly', email: '' }, dateRange: '30', createdAt: null };
    _render();
  };

  window._rbUpdateTitle = function(val) {
    _state.name = val;
    const t = document.getElementById('rb-title-input');
    const s = document.getElementById('rb-report-name-side');
    if (t && t !== document.activeElement) t.value = val;
    if (s && s !== document.activeElement) s.value = val;
  };

  window._rbDateRange  = function(v) { _state.dateRange = v; };
  window._rbSchedToggle = function(v) { _state.schedule.enabled = v; };
  window._rbSchedFreq   = function(v) { _state.schedule.frequency = v; };
  window._rbSchedEmail  = function(v) { _state.schedule.email = v; };

  window._rbSaveSchedule = function() {
    const sched = {
      enabled:   document.getElementById('rb-sched-toggle')?.checked || false,
      frequency: document.getElementById('rb-sched-freq')?.value || 'Weekly',
      email:     document.getElementById('rb-sched-email')?.value || '',
    };
    _state.schedule = sched;
    localStorage.setItem('ds_report_schedule_' + (_state.id || 'current'), JSON.stringify(sched));
    const btn = event && event.target instanceof HTMLElement ? event.target : document.querySelector('[onclick="window._rbSaveSchedule()"]');
    if (btn) { const orig = btn.textContent; btn.textContent = 'Saved'; setTimeout(() => { btn.textContent = orig; }, 1500); }
  };

  function _captureTextBlocks() {
    document.querySelectorAll('[data-textblock="1"]').forEach(node => {
      const card = node.closest('[id^="rb-block-"]');
      if (!card) return;
      const idx = parseInt(card.id.replace('rb-block-', ''), 10);
      if (!isNaN(idx) && _state.blocks[idx]) _state.blocks[idx].textContent = node.textContent;
    });
  }

  window._reportAddBlock = function(type) {
    _state.blocks.push({ type });
    _render();
    const canvas = document.querySelector('.report-canvas-panel');
    if (canvas) canvas.scrollTop = canvas.scrollHeight;
  };

  window._reportRemoveBlock = function(idx) {
    _captureTextBlocks();
    _state.blocks.splice(idx, 1);
    _render();
  };

  window._reportMoveBlock = function(idx, dir) {
    _captureTextBlocks();
    const bl = _state.blocks;
    if (dir === 'up' && idx > 0) [bl[idx - 1], bl[idx]] = [bl[idx], bl[idx - 1]];
    else if (dir === 'down' && idx < bl.length - 1) [bl[idx], bl[idx + 1]] = [bl[idx + 1], bl[idx]];
    _render();
  };

  window._saveCurrentReport = function() {
    _captureTextBlocks();
    const id = _state.id || ('rpt-' + Date.now());
    const report = {
      id,
      name: _state.name || 'Untitled Report',
      blocks: _state.blocks.map(b => b.type),
      createdAt: _state.createdAt || new Date().toISOString(),
      schedule: _state.schedule,
    };
    _state.id = id;
    if (!_state.createdAt) _state.createdAt = report.createdAt;
    saveReport(report);
    _render();
    const btn = document.querySelector('[onclick="window._saveCurrentReport()"]');
    if (btn) { const orig = btn.textContent; btn.textContent = 'Saved!'; setTimeout(() => { btn.textContent = orig; }, 1500); }
  };

  window._loadSavedReport = function(id) {
    const r = _getOrSeedReports().find(rep => rep.id === id);
    if (!r) return;
    _state = {
      id: r.id,
      name: r.name,
      blocks: (r.blocks || []).map(t => ({ type: t })),
      activeTab: 'builder',
      schedule: r.schedule || { enabled: false, frequency: 'Weekly', email: '' },
      dateRange: '30',
      createdAt: r.createdAt,
    };
    _render();
  };

  window._deleteSavedReport = function(id) {
    if (!confirm('Delete this saved report?')) return;
    deleteReport(id);
    if (_state.id === id) _state = { id: null, name: 'Untitled Report', blocks: [], activeTab: 'builder', schedule: { enabled: false, frequency: 'Weekly', email: '' }, dateRange: '30', createdAt: null };
    _render();
  };

  window._reportExportCSV = function() {
    const pts  = _reportPatientRows();
    const sess = _reportSessionRows();
    let csv = 'PATIENT DATA\r\nName,Condition,Status,Last Session,Outcome Score\r\n';
    pts.forEach(r => { csv += `"${r.name}","${r.condition}","${r.status}","${r.lastSession}","${r.score}%"\r\n`; });
    csv += '\r\nSESSION LOG\r\nPatient,Date,Type,Duration,Notes\r\n';
    sess.forEach(r => { csv += `"${r.patient}","${r.date}","${r.type}","${r.duration}","${r.notes}"\r\n`; });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${(_state.name || 'report').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  window._reportCopySummary = function() {
    const d = _reportKPIData();
    const lines = [
      `Report: ${_state.name || 'Untitled Report'}`,
      `Date: ${new Date().toLocaleDateString()}`,
      '',
      '-- Clinical KPIs --',
      `Active Courses:     ${d.activeCourses}`,
      `Avg Outcome Score:  ${d.avgOutcome}%`,
      `Sessions This Week: ${d.sessionsThisWeek}`,
      `New Patients:       ${d.newPatients}`,
      '',
      '-- Top Protocols --',
      ..._reportProtocolRows().map(p => `${p.name}: ${p.usage} sessions, avg outcome ${p.avgOutcome}%`),
      '',
      '-- Risk Flags --',
      'Eva Russo - Chronic Pain: declining trend',
      'Clara Diaz - PTSD: score plateau',
      'Ben Carr - Anxiety: AE reported',
    ];
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.querySelector('[onclick="window._reportCopySummary()"]');
      if (btn) { const orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = orig; }, 1500); }
    }).catch(() => { alert('Clipboard unavailable.\n\n' + text); });
  };

  window._reportCalcROI = function() {
    const sessWk     = parseFloat(document.getElementById('roi-sessions-wk')?.value)     || 0;
    const rate       = parseFloat(document.getElementById('roi-rate')?.value)             || 0;
    const overhead   = parseFloat(document.getElementById('roi-overhead')?.value)         || 0;
    const sessCourse = parseFloat(document.getElementById('roi-sessions-course')?.value)  || 0;
    const coursesMo  = parseFloat(document.getElementById('roi-courses-mo')?.value)       || 0;

    const monthly_revenue  = sessWk * 4.33 * rate;
    const monthly_overhead = sessWk * 4.33 * overhead;
    const net_monthly      = monthly_revenue - monthly_overhead;
    const rev_per_course   = coursesMo * sessCourse * (rate - overhead);
    const annual           = net_monthly * 12;

    const fmt = v => '$' + Math.round(v).toLocaleString();
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    set('roi-out-revenue', fmt(monthly_revenue));
    set('roi-out-net',     fmt(net_monthly));
    set('roi-out-annual',  fmt(annual));

    [monthly_revenue, monthly_overhead, net_monthly, rev_per_course, annual].forEach((v, i) => set(`roi-bd-${i}`, fmt(v)));
  };

  _render();
}

// ── Quality Assurance & Peer Review ──────────────────────────────────────────

const QA_KEY = 'ds_qa_reviews';
const QA_CORRECTIVE_KEY = 'ds_qa_corrective';

const QA_CLINICIANS = ['Dr. Chen', 'Dr. Patel', 'Dr. Williams', 'NP. Rodriguez'];
const QA_REVIEWERS  = ['Dr. Okonkwo', 'Dr. Singh'];
const QA_CRITERIA   = ['documentationComplete','protocolAdherence','consentObtained','safetyScreening','outcomeRecorded','adverseEventsDocumented','sessionNotesTimely','goalsAddressed'];
const QA_CRITERIA_LABELS = {
  documentationComplete:    'Documentation Complete',
  protocolAdherence:        'Protocol Adherence',
  consentObtained:          'Consent Obtained',
  safetyScreening:          'Safety Screening',
  outcomeRecorded:          'Outcome Recorded',
  adverseEventsDocumented:  'Adverse Events Documented',
  sessionNotesTimely:       'Session Notes Timely',
  goalsAddressed:           'Goals Addressed',
};
const QA_SCORE_KEYS   = ['documentationQuality','clinicalReasoning','patientEngagement','protocolFidelity'];
const QA_SCORE_LABELS = {
  documentationQuality: 'Documentation Quality',
  clinicalReasoning:    'Clinical Reasoning',
  patientEngagement:    'Patient Engagement',
  protocolFidelity:     'Protocol Fidelity',
};

function _qaBlankCriteria() {
  return Object.fromEntries(QA_CRITERIA.map(k => [k, null]));
}
function _qaBlankScores() {
  return Object.fromEntries(QA_SCORE_KEYS.map(k => [k, null]));
}

function getQAReviews() {
  const raw = localStorage.getItem(QA_KEY);
  if (raw) { try { return JSON.parse(raw); } catch(e) { /* fall through */ } }
  // Seed 8 sample reviews
  const today = new Date();
  const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
  const makeReview = (id, caseId, patientName, clinician, reviewer, sampledDate, reviewDate, verdict, correctiveRequired) => ({
    id,
    caseId,
    patientName,
    clinician,
    reviewer,
    sampledDate,
    reviewDate,
    criteria: Object.fromEntries(QA_CRITERIA.map((k,i) => [k, verdict==='pending' ? null : (verdict==='fail' ? (i<2 ? false : true) : true)])),
    scores: Object.fromEntries(QA_SCORE_KEYS.map((k,i) => [k, verdict==='pending' ? null : (verdict==='fail' ? 2+i%2 : 4+i%2>5?4:4+i%2)])),
    overallVerdict: verdict,
    reviewerNotes: verdict==='pending' ? '' : verdict==='fail' ? 'Documentation was incomplete. Protocol steps skipped.' : verdict==='pass-with-notes' ? 'Minor gaps in session notes. Follow up advised.' : 'All criteria met.',
    correctiveActionRequired: correctiveRequired,
    correctiveActionId: correctiveRequired ? `CA-${id.slice(-3)}` : null,
  });
  const reviews = [
    makeReview('QA-001','CASE-012','Alice Morgan','Dr. Chen','Dr. Okonkwo',daysAgo(28),daysAgo(25),'pass',false),
    makeReview('QA-002','CASE-007','Brian Tanner','Dr. Patel','Dr. Singh',daysAgo(22),daysAgo(19),'pass',false),
    makeReview('QA-003','CASE-031','Clara Diaz','Dr. Williams','Dr. Okonkwo',daysAgo(18),daysAgo(15),'pass',false),
    makeReview('QA-004','CASE-019','David Ngo','NP. Rodriguez','Dr. Singh',daysAgo(14),daysAgo(11),'pass-with-notes',false),
    makeReview('QA-005','CASE-042','Elena Ruiz','Dr. Chen','Dr. Okonkwo',daysAgo(10),daysAgo(7),'fail',true),
    makeReview('QA-006','CASE-005','Frank Owens','Dr. Patel','Dr. Singh',daysAgo(8),null,'pending',false),
    makeReview('QA-007','CASE-027','Grace Kim','Dr. Williams','Dr. Okonkwo',daysAgo(5),null,'pending',false),
    makeReview('QA-008','CASE-038','Henry Liu','NP. Rodriguez','Dr. Singh',daysAgo(3),null,'pending',false),
  ];
  localStorage.setItem(QA_KEY, JSON.stringify(reviews));
  return reviews;
}

function saveQAReview(review) {
  const reviews = getQAReviews();
  const idx = reviews.findIndex(r => r.id === review.id);
  if (idx >= 0) reviews[idx] = review; else reviews.push(review);
  localStorage.setItem(QA_KEY, JSON.stringify(reviews));
}

function getCorrectiveActions() {
  const raw = localStorage.getItem(QA_CORRECTIVE_KEY);
  if (raw) { try { return JSON.parse(raw); } catch(e) { /* fall through */ } }
  const today = new Date();
  const daysFwd = n => { const d = new Date(today); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
  const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
  const actions = [
    { id:'CA-001', reviewId:'QA-005', patientName:'Elena Ruiz', clinician:'Dr. Chen', issue:'Protocol steps were skipped during session 3; documentation incomplete', action:'Complete missing session notes and repeat protocol review within 2 weeks', dueDate:daysFwd(7), status:'open', completedDate:null },
    { id:'CA-002', reviewId:'QA-002', patientName:'Brian Tanner', clinician:'Dr. Patel', issue:'Consent form not updated after protocol modification', action:'Obtain updated consent and file with patient record', dueDate:daysAgo(2), status:'in-progress', completedDate:null },
    { id:'CA-003', reviewId:'QA-001', patientName:'Alice Morgan', clinician:'Dr. Chen', issue:'Adverse event note was not entered within 24 hours', action:'Review AE documentation policy and complete staff training', dueDate:daysAgo(5), status:'completed', completedDate:daysAgo(3) },
  ];
  localStorage.setItem(QA_CORRECTIVE_KEY, JSON.stringify(actions));
  return actions;
}

function saveCorrectiveAction(action) {
  const actions = getCorrectiveActions();
  const idx = actions.findIndex(a => a.id === action.id);
  if (idx >= 0) actions[idx] = action; else actions.push(action);
  localStorage.setItem(QA_CORRECTIVE_KEY, JSON.stringify(actions));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _qaStatusBadge(verdict) {
  const map = {
    pass:           ['teal',  '#10b981', '#d1fae5', 'Pass'],
    'pass-with-notes': ['amber', '#f59e0b', '#fef3c7', 'Pass w/ Notes'],
    fail:           ['rose',  '#ef4444', '#fee2e2', 'Fail'],
    pending:        ['blue',  '#6b7280', '#f3f4f6', 'Pending'],
  };
  const [,color,bg,label] = map[verdict] || map.pending;
  return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:9999px;background:${bg};color:${color}">${label}</span>`;
}

function _qaActionBadge(status) {
  const map = { open:['#ef4444','#fee2e2','Open'], 'in-progress':['#f59e0b','#fef3c7','In Progress'], completed:['#10b981','#d1fae5','Completed'] };
  const [color,bg,label] = map[status] || map.open;
  return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:9999px;background:${bg};color:${color}">${label}</span>`;
}

function _qaKPIs() {
  const reviews = getQAReviews();
  const actions = getCorrectiveActions();
  const cutoff  = new Date(); cutoff.setDate(cutoff.getDate()-30);
  const inPeriod = reviews.filter(r => r.reviewDate && new Date(r.reviewDate) >= cutoff);
  const totalReviewed = inPeriod.length;
  const passCount = inPeriod.filter(r => r.overallVerdict==='pass' || r.overallVerdict==='pass-with-notes').length;
  const passRate  = totalReviewed > 0 ? Math.round(passCount/totalReviewed*100) : 0;
  const openActions = actions.filter(a => a.status !== 'completed').length;
  const allScores = reviews.flatMap(r => r.scores ? Object.values(r.scores).filter(v => v !== null) : []);
  const avgScore  = allScores.length > 0 ? (allScores.reduce((a,b)=>a+b,0)/allScores.length).toFixed(1) : '—';
  return { totalReviewed, passRate, openActions, avgScore };
}

function _qaPassRateColor(rate) {
  return rate >= 90 ? '#10b981' : rate >= 75 ? '#f59e0b' : '#ef4444';
}
function _qaPassRateFillClass(rate) {
  return rate >= 90 ? 'pass-rate-fill-good' : rate >= 75 ? 'pass-rate-fill-warn' : 'pass-rate-fill-bad';
}

function _qaClinicianStats() {
  const reviews = getQAReviews().filter(r => r.overallVerdict && r.overallVerdict !== 'pending');
  const map = {};
  reviews.forEach(r => {
    if (!map[r.clinician]) map[r.clinician] = { pass:0, total:0 };
    map[r.clinician].total++;
    if (r.overallVerdict==='pass' || r.overallVerdict==='pass-with-notes') map[r.clinician].pass++;
  });
  return Object.entries(map).map(([name,s]) => ({ name, rate: Math.round(s.pass/s.total*100), total:s.total }));
}

// Deterministic heatmap rate: seeded by criterion index + week number
function _qaHeatRate(criterionIdx, week) {
  const seed = (criterionIdx * 7 + week * 3) % 13;
  const rates = [92, 88, 75, 95, 60, 82, 55, 79, 91, 68, 85, 72, 50];
  return rates[seed];
}

// ── Render functions ──────────────────────────────────────────────────────────
function _qaRenderDashboard() {
  const kpi = _qaKPIs();
  const statsArr = _qaClinicianStats();
  const passRateColor = _qaPassRateColor(kpi.passRate);
  const openActColor  = kpi.openActions > 0 ? '#ef4444' : '#10b981';

  // Next sampling date: 30 days from today (simplified)
  const nextSample = new Date(); nextSample.setDate(nextSample.getDate()+30);
  const nextSampleStr = nextSample.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

  const kpiHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:1.6rem;font-weight:700;color:var(--teal)">${kpi.totalReviewed}</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:4px">Total Reviewed<br><span style="font-size:.7rem">(last 30 days)</span></div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:1.6rem;font-weight:700;color:${passRateColor}">${kpi.passRate}%</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:4px">Pass Rate</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:1.6rem;font-weight:700;color:${openActColor}">${kpi.openActions}</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:4px">Open Corrective<br>Actions</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:1.6rem;font-weight:700;color:#6366f1">${kpi.avgScore !== '—' ? kpi.avgScore+'/5.0' : '—'}</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:4px">Avg Inter-Rater<br>Score</div>
      </div>
    </div>`;

  // Random case sampling widget
  const samplingHTML = `
    <div class="card" style="padding:16px;margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <span style="font-weight:600;font-size:.9rem">Random Case Sampling</span>
        <span style="font-size:.78rem;color:var(--text-muted)">Next sampling due: <b>${nextSampleStr}</b></span>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="window._qaRandomSample()">Sample New Case</button>
        <select class="form-control" id="qa-sample-reviewer" style="width:auto;min-width:160px">
          ${QA_REVIEWERS.map(r=>`<option value="${r}">${r}</option>`).join('')}
        </select>
        <span id="qa-sample-msg" style="font-size:.82rem;color:var(--text-muted)"></span>
      </div>
    </div>`;

  // Clinician pass rate bars
  const chartHTML = `
    <div class="card" style="padding:16px;margin-bottom:20px">
      <div style="font-weight:600;font-size:.9rem;margin-bottom:14px">Clinician Pass Rate</div>
      ${statsArr.length === 0
        ? `<div style="color:var(--text-muted);font-size:.85rem">No completed reviews yet.</div>`
        : statsArr.map(s => `
        <div style="margin-bottom:10px;cursor:pointer" onclick="window._qaFilterClinician('${s.name}')">
          <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:3px">
            <span>${s.name}</span>
            <span style="color:${_qaPassRateColor(s.rate)};font-weight:600">${s.rate}% (${s.total} reviews)</span>
          </div>
          <div class="pass-rate-bar">
            <div class="${_qaPassRateFillClass(s.rate)}" style="width:${s.rate}%"></div>
          </div>
        </div>`).join('')}
      <div style="font-size:.75rem;color:var(--text-muted);margin-top:8px">Click a bar to filter Case Reviews by clinician</div>
    </div>`;

  // Criteria heatmap
  const weeks = ['Wk 1','Wk 2','Wk 3','Wk 4'];
  const heatHTML = `
    <div class="card" style="padding:16px">
      <div style="font-weight:600;font-size:.9rem;margin-bottom:14px">Criteria Heatmap (last 4 weeks)</div>
      <div style="overflow-x:auto">
        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr>
              <th style="text-align:left;font-size:.75rem;color:var(--text-muted);padding:4px 8px;min-width:200px">Criterion</th>
              ${weeks.map(w=>`<th style="font-size:.75rem;color:var(--text-muted);padding:4px 8px;text-align:center">${w}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${QA_CRITERIA.map((c,ci) => `
              <tr>
                <td style="font-size:.8rem;padding:5px 8px;color:var(--text)">${QA_CRITERIA_LABELS[c]}</td>
                ${weeks.map((_,wi) => {
                  const rate = _qaHeatRate(ci,wi);
                  const cls  = rate > 80 ? 'qa-heat-pass' : rate >= 60 ? 'qa-heat-warn' : 'qa-heat-fail';
                  return `<td style="text-align:center;padding:4px 8px"><div class="qa-heat-cell ${cls}" style="margin:0 auto" title="${rate}%"></div></td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
        <div style="display:flex;gap:12px;margin-top:10px;font-size:.73rem;color:var(--text-muted)">
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#10b981;vertical-align:middle;margin-right:3px"></span>&gt;80% Pass</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#f59e0b;vertical-align:middle;margin-right:3px"></span>60–80%</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#ef4444;vertical-align:middle;margin-right:3px"></span>&lt;60%</span>
        </div>
      </div>
    </div>`;

  return kpiHTML + samplingHTML + chartHTML + heatHTML;
}

function _qaRenderReviews(filterStatus, filterClinician, filterDateFrom, filterDateTo) {
  const reviews = getQAReviews().filter(r => {
    if (filterStatus && filterStatus !== 'all' && r.overallVerdict !== filterStatus) return false;
    if (filterClinician && r.clinician !== filterClinician) return false;
    if (filterDateFrom && r.sampledDate < filterDateFrom) return false;
    if (filterDateTo   && r.sampledDate > filterDateTo)   return false;
    return true;
  });

  const filtersHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <select class="form-control" id="qa-status-filter" style="width:auto" onchange="window._qaFilterStatus(this.value)">
        <option value="all" ${filterStatus==='all'||!filterStatus?'selected':''}>All Statuses</option>
        <option value="pending" ${filterStatus==='pending'?'selected':''}>Pending</option>
        <option value="pass" ${filterStatus==='pass'?'selected':''}>Pass</option>
        <option value="pass-with-notes" ${filterStatus==='pass-with-notes'?'selected':''}>Pass with Notes</option>
        <option value="fail" ${filterStatus==='fail'?'selected':''}>Fail</option>
      </select>
      <select class="form-control" id="qa-clinician-filter" style="width:auto" onchange="window._qaFilterClinician(this.value)">
        <option value="">All Clinicians</option>
        ${QA_CLINICIANS.map(c=>`<option value="${c}" ${filterClinician===c?'selected':''}>${c}</option>`).join('')}
      </select>
      <input type="date" class="form-control" id="qa-date-from" style="width:auto" value="${filterDateFrom||''}" onchange="window._qaApplyDateFilter()">
      <input type="date" class="form-control" id="qa-date-to" style="width:auto" value="${filterDateTo||''}" onchange="window._qaApplyDateFilter()">
      <button class="btn" onclick="window._qaFilterStatus('all');window._qaFilterClinician('')">Clear Filters</button>
    </div>`;

  const cardsHTML = reviews.length === 0
    ? `<div style="color:var(--text-muted);padding:20px;text-align:center">No reviews match the current filters.</div>`
    : reviews.map(r => `
      <div class="qa-review-card" id="qa-card-${r.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <span style="font-weight:700;font-size:.9rem">${r.caseId}</span>
            <span style="color:var(--text-muted);font-size:.82rem;margin-left:8px">${r.patientName}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${_qaStatusBadge(r.overallVerdict||'pending')}
            <button class="btn" style="font-size:.75rem;padding:4px 10px" onclick="window._qaOpenReview('${r.id}')">Open Review</button>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:16px;flex-wrap:wrap;font-size:.8rem;color:var(--text-muted)">
          <span>Clinician: <b style="color:var(--text)">${r.clinician}</b></span>
          <span>Reviewer: <b style="color:var(--text)">${r.reviewer}</b></span>
          <span>Sampled: <b style="color:var(--text)">${r.sampledDate}</b></span>
          ${r.reviewDate ? `<span>Reviewed: <b style="color:var(--text)">${r.reviewDate}</b></span>` : ''}
        </div>
        <div id="qa-form-${r.id}" style="display:none">${_qaRenderForm(r)}</div>
      </div>`).join('');

  return filtersHTML + cardsHTML;
}

function _qaRenderForm(r) {
  const criteriaHTML = QA_CRITERIA.map(c => {
    const val = r.criteria?.[c];
    return `
      <div class="qa-criteria-row">
        <span style="font-size:.85rem">${QA_CRITERIA_LABELS[c]}</span>
        <div style="display:flex;gap:6px">
          <button class="qa-verdict-btn ${val===true?'pass':''}" onclick="window._qaSetCriterion('${r.id}','${c}',true)">Pass</button>
          <button class="qa-verdict-btn ${val===false?'fail':''}" onclick="window._qaSetCriterion('${r.id}','${c}',false)">Fail</button>
        </div>
      </div>`;
  }).join('');

  const scoresHTML = QA_SCORE_KEYS.map(k => {
    const val = r.scores?.[k] || 3;
    return `
      <div class="qa-score-row">
        <span class="qa-score-label">${QA_SCORE_LABELS[k]}</span>
        <input type="range" min="1" max="5" value="${val}" style="flex:1"
          oninput="document.getElementById('qa-score-val-${r.id}-${k}').textContent=this.value;window._qaSetScore('${r.id}','${k}',parseInt(this.value))">
        <span id="qa-score-val-${r.id}-${k}" style="width:28px;text-align:right;font-weight:600">${val}</span>
        <span style="font-size:.75rem;color:var(--text-muted)">/5</span>
      </div>`;
  }).join('');

  const verdictOpts = [
    {v:'pass',label:'Pass'},
    {v:'pass-with-notes',label:'Pass with Notes'},
    {v:'fail',label:'Fail'},
  ];
  const verdictHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
      ${verdictOpts.map(o=>`<button class="qa-verdict-btn ${r.overallVerdict===o.v?(o.v==='fail'?'fail':'pass'):''}"
        onclick="window._qaSetVerdict('${r.id}','${o.v}')">${o.label}</button>`).join('')}
    </div>`;

  return `
    <div class="qa-review-form">
      <div style="font-weight:600;font-size:.85rem;margin-bottom:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Review Criteria</div>
      ${criteriaHTML}
      <div style="font-weight:600;font-size:.85rem;margin-top:16px;margin-bottom:8px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Inter-Rater Scores</div>
      ${scoresHTML}
      <div style="font-weight:600;font-size:.85rem;margin-top:16px;margin-bottom:6px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Overall Verdict</div>
      ${verdictHTML}
      <div style="margin-top:12px">
        <label style="font-size:.83rem;color:var(--text-muted);display:block;margin-bottom:4px">Reviewer Notes</label>
        <textarea id="qa-notes-${r.id}" class="form-control" rows="3" style="width:100%">${r.reviewerNotes||''}</textarea>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="qa-ca-check-${r.id}" ${r.correctiveActionRequired?'checked':''} onchange="window._qaToggleCorrective('${r.id}',this.checked)">
        <label for="qa-ca-check-${r.id}" style="font-size:.83rem">Corrective Action Required</label>
      </div>
      <div id="qa-ca-inline-${r.id}" style="${r.correctiveActionRequired?'':'display:none'}">
        ${_qaInlineCAForm(r)}
      </div>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-primary" onclick="window._qaSubmitReview('${r.id}')">Submit Review</button>
        <button class="btn" onclick="window._qaOpenReview('${r.id}')">Cancel</button>
      </div>
    </div>`;
}

function _qaInlineCAForm(r) {
  return `
    <div style="margin-top:10px;background:var(--card-bg);border-radius:6px;padding:12px;border:1px solid var(--border)">
      <div style="font-size:.82rem;font-weight:600;margin-bottom:8px">New Corrective Action</div>
      <div style="display:grid;gap:8px">
        <input class="form-control" id="qa-ca-issue-${r.id}" placeholder="Issue description" value="">
        <input class="form-control" id="qa-ca-action-${r.id}" placeholder="Action required">
        <input type="date" class="form-control" id="qa-ca-due-${r.id}">
      </div>
    </div>`;
}

function _qaRenderActions(filterStatus) {
  const actions  = getCorrectiveActions();
  const filtered = filterStatus && filterStatus !== 'all' ? actions.filter(a => a.status===filterStatus) : actions;
  const today    = new Date().toISOString().slice(0,10);

  const completed   = actions.filter(a => a.status==='completed').length;
  const onTime      = actions.filter(a => a.status==='completed' && a.completedDate && a.completedDate <= a.dueDate).length;

  const filterHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
      <select class="form-control" id="qa-action-filter" style="width:auto" onchange="window._qaFilterActions(this.value)">
        <option value="all" ${filterStatus==='all'||!filterStatus?'selected':''}>All Statuses</option>
        <option value="open" ${filterStatus==='open'?'selected':''}>Open</option>
        <option value="in-progress" ${filterStatus==='in-progress'?'selected':''}>In Progress</option>
        <option value="completed" ${filterStatus==='completed'?'selected':''}>Completed</option>
      </select>
      <button class="btn btn-primary" onclick="window._qaNewAction()">+ New Action</button>
    </div>
    <div id="qa-new-action-form" style="display:none;margin-bottom:16px"></div>`;

  const tableHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:.83rem">
        <thead>
          <tr style="border-bottom:2px solid var(--border)">
            ${['Case ID','Patient','Clinician','Issue','Action Required','Due Date','Status',''].map(h=>`<th style="text-align:left;padding:8px;font-size:.78rem;color:var(--text-muted);font-weight:600;white-space:nowrap">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filtered.length === 0
            ? `<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--text-muted)">No corrective actions found.</td></tr>`
            : filtered.map(a => {
                const overdue = a.status !== 'completed' && a.dueDate < today;
                return `
                  <tr class="${overdue?'qa-action-overdue':''}" id="qa-action-row-${a.id}">
                    <td style="padding:8px;white-space:nowrap">${a.reviewId}</td>
                    <td style="padding:8px">${a.patientName}</td>
                    <td style="padding:8px">${a.clinician}</td>
                    <td style="padding:8px;max-width:200px">${a.issue}</td>
                    <td style="padding:8px;max-width:200px">${a.action}</td>
                    <td style="padding:8px;white-space:nowrap;${a.dueDate<today&&a.status!=='completed'?'color:#ef4444;font-weight:600':''}">${a.dueDate}</td>
                    <td style="padding:8px">${_qaActionBadge(a.status)}</td>
                    <td style="padding:8px">
                      ${a.status !== 'completed'
                        ? `<button class="btn" style="font-size:.73rem;padding:3px 8px" onclick="window._qaCompleteAction('${a.id}')">Mark Complete</button>`
                        : `<span style="color:#10b981;font-size:.78rem">&#10003; ${a.completedDate||''}</span>`}
                    </td>
                  </tr>`;
              }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:14px;font-size:.82rem;color:var(--text-muted)">
      <b>${onTime}</b> of <b>${completed}</b> corrective actions completed on time
    </div>`;

  return filterHTML + tableHTML;
}

// ── Main exported page function ───────────────────────────────────────────────
export async function pgQualityAssurance(setTopbar) {
  setTopbar('Quality Assurance & Peer Review', '');
  const el = document.getElementById('content');

  // Internal state
  let _activeTab       = 'dashboard';
  let _filterStatus    = 'all';
  let _filterClinician = '';
  let _filterDateFrom  = '';
  let _filterDateTo    = '';
  let _filterActions   = 'all';
  let _openReviewId    = null;

  // Criteria and score working state (keyed by reviewId)
  const _wip = {};
  function _getWip(id) {
    if (!_wip[id]) {
      const r = getQAReviews().find(x=>x.id===id);
      _wip[id] = r ? JSON.parse(JSON.stringify(r)) : null;
    }
    return _wip[id];
  }

  function render() {
    const tabBar = `
      <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:20px">
        ${[['dashboard','QA Dashboard'],['reviews','Case Reviews'],['actions','Corrective Actions']].map(([id,label])=>`
          <button onclick="window._qaTab('${id}')" style="padding:10px 18px;border:none;background:none;cursor:pointer;font-size:.88rem;font-weight:600;
            color:${_activeTab===id?'var(--teal)':'var(--text-muted)'};
            border-bottom:${_activeTab===id?'2px solid var(--teal)':'2px solid transparent'};
            margin-bottom:-2px;transition:color .15s">${label}</button>`).join('')}
      </div>`;

    let body = '';
    if (_activeTab === 'dashboard') body = _qaRenderDashboard();
    else if (_activeTab === 'reviews') body = _qaRenderReviews(_filterStatus, _filterClinician, _filterDateFrom, _filterDateTo);
    else if (_activeTab === 'actions') body = _qaRenderActions(_filterActions);

    el.innerHTML = tabBar + `<div id="qa-tab-body">${body}</div>`;

    // Re-open review form if it was open
    if (_activeTab === 'reviews' && _openReviewId) {
      const formEl = document.getElementById(`qa-form-${_openReviewId}`);
      if (formEl) formEl.style.display = 'block';
    }
  }

  // ── Global handlers ───────────────────────────────────────────────────────

  window._qaTab = function(tab) {
    _activeTab = tab;
    _openReviewId = null;
    render();
  };

  window._qaRandomSample = function() {
    const reviews  = getQAReviews();
    const sampled  = new Set(reviews.map(r=>r.caseId));
    const pool     = Array.from({length:50},(_,i)=>`CASE-${String(i+1).padStart(3,'0')}`);
    const unsampled = pool.filter(c => !sampled.has(c));
    const msgEl = document.getElementById('qa-sample-msg');
    if (unsampled.length === 0) {
      if (msgEl) msgEl.textContent = 'All cases in pool already sampled.';
      return;
    }
    const caseId   = unsampled[Math.floor(Math.random()*unsampled.length)];
    const reviewer = document.getElementById('qa-sample-reviewer')?.value || QA_REVIEWERS[0];
    const today    = new Date().toISOString().slice(0,10);
    const newId    = 'QA-' + String(reviews.length+1).padStart(3,'0');
    const newReview = {
      id: newId,
      caseId,
      patientName: 'New Patient',
      clinician: QA_CLINICIANS[Math.floor(Math.random()*QA_CLINICIANS.length)],
      reviewer,
      sampledDate: today,
      reviewDate: null,
      criteria: _qaBlankCriteria(),
      scores: _qaBlankScores(),
      overallVerdict: 'pending',
      reviewerNotes: '',
      correctiveActionRequired: false,
      correctiveActionId: null,
    };
    saveQAReview(newReview);
    if (msgEl) msgEl.textContent = `Sampled ${caseId} — assigned to ${reviewer}`;
    setTimeout(() => {
      _activeTab = 'reviews';
      _filterStatus = 'pending';
      render();
    }, 800);
  };

  window._qaOpenReview = function(id) {
    if (_activeTab !== 'reviews') { _activeTab = 'reviews'; render(); }
    _openReviewId = _openReviewId === id ? null : id;
    const formEl = document.getElementById(`qa-form-${id}`);
    if (formEl) formEl.style.display = _openReviewId === id ? 'block' : 'none';
  };

  window._qaSetCriterion = function(id, criterion, value) {
    const wip = _getWip(id); if (!wip) return;
    wip.criteria[criterion] = value;
    // Update button styles
    const row = document.querySelector(`#qa-form-${id} [onclick*="_qaSetCriterion('${id}','${criterion}',true)"]`)?.closest('.qa-criteria-row');
    if (row) {
      row.querySelectorAll('.qa-verdict-btn').forEach(b => { b.classList.remove('pass','fail'); });
      const btns = row.querySelectorAll('.qa-verdict-btn');
      if (value === true && btns[0]) btns[0].classList.add('pass');
      if (value === false && btns[1]) btns[1].classList.add('fail');
    }
  };

  window._qaSetScore = function(id, key, value) {
    const wip = _getWip(id); if (!wip) return;
    if (!wip.scores) wip.scores = _qaBlankScores();
    wip.scores[key] = value;
  };

  window._qaSetVerdict = function(id, verdict) {
    const wip = _getWip(id); if (!wip) return;
    wip.overallVerdict = verdict;
    const formEl = document.getElementById(`qa-form-${id}`);
    if (formEl) {
      formEl.querySelectorAll('.qa-verdict-btn[onclick*="_qaSetVerdict"]').forEach(b => {
        b.classList.remove('pass','fail');
        if (b.getAttribute('onclick').includes(`'${verdict}'`)) {
          b.classList.add(verdict==='fail' ? 'fail' : 'pass');
        }
      });
    }
  };

  window._qaToggleCorrective = function(id, checked) {
    const wip = _getWip(id); if (!wip) return;
    wip.correctiveActionRequired = checked;
    const inlineEl = document.getElementById(`qa-ca-inline-${id}`);
    if (inlineEl) inlineEl.style.display = checked ? 'block' : 'none';
  };

  window._qaSubmitReview = function(id) {
    const wip = _getWip(id); if (!wip) return;
    wip.reviewerNotes = document.getElementById(`qa-notes-${id}`)?.value || wip.reviewerNotes;
    wip.reviewDate    = new Date().toISOString().slice(0,10);
    if (!wip.overallVerdict || wip.overallVerdict === 'pending') wip.overallVerdict = 'pending';
    saveQAReview(wip);
    delete _wip[id];

    // Handle corrective action creation
    if (wip.correctiveActionRequired) {
      const issue   = document.getElementById(`qa-ca-issue-${id}`)?.value || '';
      const action  = document.getElementById(`qa-ca-action-${id}`)?.value || '';
      const dueDate = document.getElementById(`qa-ca-due-${id}`)?.value || '';
      if (issue || action) {
        const actions = getCorrectiveActions();
        const newCA = {
          id: 'CA-' + String(actions.length+1).padStart(3,'0'),
          reviewId: wip.id,
          patientName: wip.patientName,
          clinician: wip.clinician,
          issue,
          action,
          dueDate,
          status: 'open',
          completedDate: null,
        };
        saveCorrectiveAction(newCA);
        wip.correctiveActionId = newCA.id;
        saveQAReview(wip);
      }
    }

    _openReviewId = null;
    render();
  };

  window._qaFilterStatus = function(s) {
    _filterStatus = s;
    if (_activeTab !== 'reviews') _activeTab = 'reviews';
    render();
  };

  window._qaFilterClinician = function(name) {
    _filterClinician = name;
    if (_activeTab !== 'reviews') _activeTab = 'reviews';
    render();
  };

  window._qaApplyDateFilter = function() {
    _filterDateFrom = document.getElementById('qa-date-from')?.value || '';
    _filterDateTo   = document.getElementById('qa-date-to')?.value   || '';
    render();
  };

  window._qaCompleteAction = function(id) {
    const actions = getCorrectiveActions();
    const action  = actions.find(a=>a.id===id);
    if (!action) return;
    action.status        = 'completed';
    action.completedDate = new Date().toISOString().slice(0,10);
    saveCorrectiveAction(action);
    render();
  };

  window._qaNewAction = function() {
    const formEl = document.getElementById('qa-new-action-form');
    if (!formEl) return;
    formEl.style.display = formEl.style.display === 'none' ? 'block' : 'none';
    formEl.innerHTML = `
      <div class="card" style="padding:14px">
        <div style="font-weight:600;font-size:.85rem;margin-bottom:10px">New Corrective Action</div>
        <div style="display:grid;gap:8px">
          <input class="form-control" id="qa-new-ca-caseid"  placeholder="Case ID (e.g. QA-001)">
          <input class="form-control" id="qa-new-ca-patient" placeholder="Patient name">
          <select class="form-control" id="qa-new-ca-clinician">
            ${QA_CLINICIANS.map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
          <input class="form-control" id="qa-new-ca-issue"   placeholder="Issue description">
          <input class="form-control" id="qa-new-ca-action"  placeholder="Action required">
          <input type="date" class="form-control" id="qa-new-ca-due">
        </div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn btn-primary" onclick="window._qaSaveAction()">Save Action</button>
          <button class="btn" onclick="window._qaNewAction()">Cancel</button>
        </div>
      </div>`;
  };

  window._qaSaveAction = function() {
    const actions = getCorrectiveActions();
    const newCA = {
      id:          'CA-' + String(actions.length+1).padStart(3,'0'),
      reviewId:    document.getElementById('qa-new-ca-caseid')?.value  || '',
      patientName: document.getElementById('qa-new-ca-patient')?.value || '',
      clinician:   document.getElementById('qa-new-ca-clinician')?.value || '',
      issue:       document.getElementById('qa-new-ca-issue')?.value   || '',
      action:      document.getElementById('qa-new-ca-action')?.value  || '',
      dueDate:     document.getElementById('qa-new-ca-due')?.value     || '',
      status:      'open',
      completedDate: null,
    };
    saveCorrectiveAction(newCA);
    _activeTab = 'actions';
    render();
  };

  window._qaFilterActions = function(status) {
    _filterActions = status;
    render();
  };

  render();
}

// ── Device & Equipment Management ─────────────────────────────────────────────

const DEVICES_KEY      = 'ds_devices';
const DEVICE_LOGS_KEY  = 'ds_device_logs';

function _seedDevices() {
  return [
    {
      id: 'DEV-001', name: 'NeuroAmp Pro 2024', type: 'neurofeedback-amp',
      serialNumber: 'NA-2024-0471', manufacturer: 'BrainTech Systems', model: 'NAP-2024',
      purchaseDate: '2023-06-15', warrantyExpiry: '2026-06-15',
      lastCalibration: '2026-01-10', nextCalibration: '2026-04-10',
      lastMaintenance: '2025-12-20', nextMaintenance: '2026-06-20',
      status: 'active', assignedRoom: 'Room A', notes: 'Primary EEG amplifier for neurofeedback sessions.',
      sessionCount: 142,
    },
    {
      id: 'DEV-002', name: 'MagStim Rapid\u00b2', type: 'tms-coil',
      serialNumber: 'MS-R2-8823', manufacturer: 'MagStim Co.', model: 'Rapid2',
      purchaseDate: '2022-11-01', warrantyExpiry: '2026-04-20',
      lastCalibration: '2025-10-15', nextCalibration: '2026-04-15',
      lastMaintenance: '2026-02-01', nextMaintenance: '2026-08-01',
      status: 'active', assignedRoom: 'Room B', notes: 'High-frequency rTMS coil. Handle with care.',
      sessionCount: 310,
    },
    {
      id: 'DEV-003', name: 'Soterix tDCS 1x1', type: 'tdcs-device',
      serialNumber: 'SOT-1X1-3312', manufacturer: 'Soterix Medical', model: '1x1 CT',
      purchaseDate: '2021-03-10', warrantyExpiry: '2024-03-10',
      lastCalibration: '2025-08-20', nextCalibration: '2026-03-01',
      lastMaintenance: '2025-11-10', nextMaintenance: '2026-05-10',
      status: 'maintenance', assignedRoom: 'Room C', notes: 'Under scheduled maintenance. Warranty expired.',
      sessionCount: 88,
    },
    {
      id: 'DEV-004', name: '32-Ch EEG Cap Set', type: 'eeg-cap',
      serialNumber: 'EEG-32-0092', manufacturer: 'Neuroscan', model: 'SynAmps-32',
      purchaseDate: '2024-01-20', warrantyExpiry: '2027-01-20',
      lastCalibration: '2026-03-05', nextCalibration: '2026-07-05',
      lastMaintenance: '2026-03-05', nextMaintenance: '2026-09-05',
      status: 'active', assignedRoom: 'Room A', notes: 'Full 32-channel cap; includes spare electrodes.',
      sessionCount: 59,
    },
    {
      id: 'DEV-005', name: 'EmWave Pro Biofeedback', type: 'biofeedback-sensor',
      serialNumber: 'EW-PRO-1147', manufacturer: 'HeartMath', model: 'emWave Pro+',
      purchaseDate: '2023-09-05', warrantyExpiry: '2025-09-05',
      lastCalibration: '2025-09-01', nextCalibration: '2026-03-25',
      lastMaintenance: '2025-09-01', nextMaintenance: '2026-03-20',
      status: 'loaned-out', assignedRoom: 'Portable', notes: 'Loaned to Dr. Chen clinic until Apr 30.',
      sessionCount: 77,
    },
    {
      id: 'DEV-006', name: 'Stimpod TMS Coil (Old)', type: 'tms-coil',
      serialNumber: 'SP-TMS-0088', manufacturer: 'Xavant Technology', model: 'Stimpod NMS460',
      purchaseDate: '2019-05-01', warrantyExpiry: '2022-05-01',
      lastCalibration: '2022-12-01', nextCalibration: '2023-06-01',
      lastMaintenance: '2022-12-01', nextMaintenance: '2023-06-01',
      status: 'decommissioned', assignedRoom: 'Room C', notes: 'Decommissioned \u2014 exceeded service life.',
      sessionCount: 520,
    },
  ];
}

function _seedDeviceLogs() {
  return [
    { id: 'DL-001', deviceId: 'DEV-001', deviceName: 'NeuroAmp Pro 2024',      type: 'calibration',  date: '2026-01-10', technician: 'Dr. Yildiz',  notes: 'Full impedance calibration. All channels within spec.', outcome: 'pass' },
    { id: 'DL-002', deviceId: 'DEV-001', deviceName: 'NeuroAmp Pro 2024',      type: 'session-use',  date: '2026-04-08', technician: 'Nurse Park',   notes: 'Alpha/theta neurofeedback \u2014 Patient ID P-0047.', outcome: 'pending' },
    { id: 'DL-003', deviceId: 'DEV-002', deviceName: 'MagStim Rapid\u00b2',    type: 'maintenance',  date: '2026-02-01', technician: 'Tech. Alves',  notes: 'Coil cooling system inspected. Fan replaced.', outcome: 'pass' },
    { id: 'DL-004', deviceId: 'DEV-002', deviceName: 'MagStim Rapid\u00b2',    type: 'calibration',  date: '2025-10-15', technician: 'Dr. Yildiz',  notes: 'MT threshold verified at 52%. Output stable.', outcome: 'pass' },
    { id: 'DL-005', deviceId: 'DEV-003', deviceName: 'Soterix tDCS 1x1',       type: 'repair',       date: '2026-03-28', technician: 'Tech. Alves',  notes: 'Faulty output cable replaced. Testing pending re-calibration.', outcome: 'pending' },
    { id: 'DL-006', deviceId: 'DEV-003', deviceName: 'Soterix tDCS 1x1',       type: 'inspection',   date: '2025-11-10', technician: 'Dr. Yildiz',  notes: 'Routine safety inspection. Cable wear noted \u2014 flagged for repair.', outcome: 'fail' },
    { id: 'DL-007', deviceId: 'DEV-004', deviceName: '32-Ch EEG Cap Set',      type: 'calibration',  date: '2026-03-05', technician: 'Nurse Park',   notes: 'Electrode impedance verified across all 32 channels.', outcome: 'pass' },
    { id: 'DL-008', deviceId: 'DEV-004', deviceName: '32-Ch EEG Cap Set',      type: 'maintenance',  date: '2026-03-05', technician: 'Nurse Park',   notes: 'Cap washed, electrode gel residue cleared, snap connectors tested.', outcome: 'pass' },
    { id: 'DL-009', deviceId: 'DEV-005', deviceName: 'EmWave Pro Biofeedback', type: 'inspection',   date: '2025-09-01', technician: 'Dr. Yildiz',  notes: 'Pre-loan inspection. Device functional, sensor cable intact.', outcome: 'pass' },
    { id: 'DL-010', deviceId: 'DEV-006', deviceName: 'Stimpod TMS Coil (Old)', type: 'inspection',   date: '2022-12-01', technician: 'Tech. Alves', notes: 'End-of-life inspection. Decommissioned per service protocol.', outcome: 'fail' },
  ];
}

function getDevices() {
  try {
    const raw = localStorage.getItem(DEVICES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_e) {}
  const seed = _seedDevices();
  localStorage.setItem(DEVICES_KEY, JSON.stringify(seed));
  return seed;
}

function saveDevice(d) {
  const list = getDevices();
  const idx = list.findIndex(x => x.id === d.id);
  if (idx >= 0) list[idx] = d; else list.push(d);
  localStorage.setItem(DEVICES_KEY, JSON.stringify(list));
}

function deleteDevice(id) {
  const list = getDevices().filter(x => x.id !== id);
  localStorage.setItem(DEVICES_KEY, JSON.stringify(list));
}

function getDeviceLogs() {
  try {
    const raw = localStorage.getItem(DEVICE_LOGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_e) {}
  const seed = _seedDeviceLogs();
  localStorage.setItem(DEVICE_LOGS_KEY, JSON.stringify(seed));
  return seed;
}

function saveDeviceLog(entry) {
  const list = getDeviceLogs();
  const idx = list.findIndex(x => x.id === entry.id);
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  localStorage.setItem(DEVICE_LOGS_KEY, JSON.stringify(list));
}

function getDeviceAlerts(devices) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const alerts = [];
  devices.forEach(d => {
    if (d.status === 'decommissioned') return;
    const cal = d.nextCalibration  ? new Date(d.nextCalibration)  : null;
    const mnt = d.nextMaintenance  ? new Date(d.nextMaintenance)  : null;
    const war = d.warrantyExpiry   ? new Date(d.warrantyExpiry)   : null;
    if (cal) {
      const diff = Math.ceil((cal - today) / 86400000);
      if (diff < 0)
        alerts.push({ deviceId: d.id, deviceName: d.name, alertType: 'calibration-overdue',
          message: 'Calibration overdue by ' + Math.abs(diff) + ' day' + (Math.abs(diff) !== 1 ? 's' : '') + ' (was due ' + d.nextCalibration + ')',
          severity: 'critical' });
      else if (diff <= 7)
        alerts.push({ deviceId: d.id, deviceName: d.name, alertType: 'calibration-due-soon',
          message: 'Calibration due in ' + diff + ' day' + (diff !== 1 ? 's' : '') + ' (' + d.nextCalibration + ')',
          severity: 'warning' });
    }
    if (mnt) {
      const diff = Math.ceil((mnt - today) / 86400000);
      if (diff < 0)
        alerts.push({ deviceId: d.id, deviceName: d.name, alertType: 'maintenance-overdue',
          message: 'Maintenance overdue by ' + Math.abs(diff) + ' day' + (Math.abs(diff) !== 1 ? 's' : '') + ' (was due ' + d.nextMaintenance + ')',
          severity: 'critical' });
      else if (diff <= 14)
        alerts.push({ deviceId: d.id, deviceName: d.name, alertType: 'maintenance-due-soon',
          message: 'Maintenance due in ' + diff + ' day' + (diff !== 1 ? 's' : '') + ' (' + d.nextMaintenance + ')',
          severity: 'warning' });
    }
    if (war) {
      const diff = Math.ceil((war - today) / 86400000);
      if (diff >= 0 && diff <= 30)
        alerts.push({ deviceId: d.id, deviceName: d.name, alertType: 'warranty-expiring',
          message: 'Warranty expiring in ' + diff + ' day' + (diff !== 1 ? 's' : '') + ' (' + d.warrantyExpiry + ')',
          severity: 'info' });
    }
  });
  return alerts;
}

// ── UI helpers ─────────────────────────────────────────────────────────────────
function _deviceModal(title, bodyHtml, footerHtml) {
  const existing = document.getElementById('dm-modal-overlay');
  if (existing) existing.remove();
  const ov = document.createElement('div');
  ov.id = 'dm-modal-overlay';
  ov.className = 'modal-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML = '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:24px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;position:relative">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
    + '<h3 style="margin:0;font-size:15px;font-weight:700;color:var(--text-primary)">' + title + '</h3>'
    + '<button onclick="document.getElementById(\'dm-modal-overlay\').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-tertiary);line-height:1">\u2715</button>'
    + '</div>'
    + '<div>' + bodyHtml + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">' + footerHtml + '</div>'
    + '</div>';
  ov.addEventListener('click', function(e) { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

function _deviceFormHtml(d) {
  const types    = ['neurofeedback-amp','tms-coil','tdcs-device','eeg-cap','biofeedback-sensor','other'];
  const statuses = ['active','maintenance','decommissioned','loaned-out'];
  const rooms    = ['Room A','Room B','Room C','Portable'];
  function fi(id, label, val, type) {
    type = type || 'text';
    return '<div style="margin-bottom:10px">'
      + '<label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">' + label + '</label>'
      + '<input id="' + id + '" class="form-control" type="' + type + '" value="' + (val || '') + '" style="width:100%">'
      + '</div>';
  }
  function fs(id, label, val, opts) {
    return '<div style="margin-bottom:10px">'
      + '<label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">' + label + '</label>'
      + '<select id="' + id + '" class="form-control" style="width:100%">'
      + opts.map(function(o) { return '<option value="' + o + '"' + (o === val ? ' selected' : '') + '>' + o + '</option>'; }).join('')
      + '</select></div>';
  }
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">'
    + fi('dm-f-name',         'Device Name *',    d && d.name)
    + fs('dm-f-type',         'Type',             d && d.type || 'other',        types)
    + fi('dm-f-serial',       'Serial Number',    d && d.serialNumber)
    + fi('dm-f-manufacturer', 'Manufacturer',     d && d.manufacturer)
    + fi('dm-f-model',        'Model',            d && d.model)
    + fs('dm-f-status',       'Status',           d && d.status || 'active',     statuses)
    + fs('dm-f-room',         'Assigned Room',    d && d.assignedRoom || 'Room A', rooms)
    + fi('dm-f-purchase',     'Purchase Date',    d && d.purchaseDate,   'date')
    + fi('dm-f-warranty',     'Warranty Expiry',  d && d.warrantyExpiry, 'date')
    + fi('dm-f-last-cal',     'Last Calibration', d && d.lastCalibration,'date')
    + fi('dm-f-next-cal',     'Next Calibration', d && d.nextCalibration,'date')
    + fi('dm-f-last-mnt',     'Last Maintenance', d && d.lastMaintenance,'date')
    + fi('dm-f-next-mnt',     'Next Maintenance', d && d.nextMaintenance,'date')
    + fi('dm-f-sessions',     'Session Count',    d && d.sessionCount || 0, 'number')
    + '</div>'
    + '<div style="margin-bottom:10px">'
    + '<label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Notes</label>'
    + '<textarea id="dm-f-notes" class="form-control" rows="2" style="width:100%;resize:vertical">' + (d && d.notes || '') + '</textarea>'
    + '</div>'
    + '<input type="hidden" id="dm-f-id" value="' + (d && d.id || '') + '">';
}

function _calClass(nextDate) {
  if (!nextDate) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.ceil((new Date(nextDate) - today) / 86400000);
  if (diff < 0)  return 'device-cal-overdue';
  if (diff <= 7) return 'device-cal-soon';
  return 'device-cal-ok';
}

function _mntClass(nextDate) {
  if (!nextDate) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.ceil((new Date(nextDate) - today) / 86400000);
  if (diff < 0)   return 'device-cal-overdue';
  if (diff <= 14) return 'device-cal-soon';
  return 'device-cal-ok';
}

function _statusBadge(status) {
  const map = {
    'active':         'rgba(16,185,129,0.15):#10b981',
    'maintenance':    'rgba(245,158,11,0.15):#f59e0b',
    'decommissioned': 'rgba(239,68,68,0.15):#ef4444',
    'loaned-out':     'rgba(59,130,246,0.15):#3b82f6',
  };
  const parts = (map[status] || 'rgba(255,255,255,0.08):var(--text-muted)').split(':');
  const bg = parts[0], color = parts[1];
  return '<span style="padding:3px 8px;border-radius:10px;font-size:.7rem;font-weight:700;background:' + bg + ';color:' + color + '">' + status + '</span>';
}

function _logTypeBadge(type) {
  return '<span class="log-type-' + type + '">' + type + '</span>';
}

function _outcomeBadge(outcome) {
  const map = { pass: 'rgba(16,185,129,0.15):#10b981', fail: 'rgba(239,68,68,0.15):#ef4444', pending: 'rgba(245,158,11,0.15):#f59e0b' };
  const parts = (map[outcome] || 'rgba(255,255,255,0.08):var(--text-muted)').split(':');
  const bg = parts[0], color = parts[1];
  return '<span style="padding:2px 7px;border-radius:4px;font-size:.7rem;font-weight:700;background:' + bg + ';color:' + color + '">' + (outcome || '\u2014') + '</span>';
}

// ── pgDeviceManagement ────────────────────────────────────────────────────────
export async function pgDeviceManagement(setTopbar) {
  setTopbar('Device & Equipment Management',
    '<button class="btn btn-primary btn-sm" onclick="window._deviceNew()">+ Register Device</button>');

  const el = document.getElementById('content');

  var _activeTab       = 'registry';
  var _filterType      = '';
  var _filterStatus    = '';
  var _filterRoom      = '';
  var _filterLogDevice = '';
  var _filterLogType   = '';
  var _dismissedInfo   = false;

  function render() {
    var devices = getDevices();
    var logs    = getDeviceLogs();
    var alerts  = getDeviceAlerts(devices);

    var criticalAlerts = alerts.filter(function(a) { return a.severity === 'critical'; });
    var warningAlerts  = alerts.filter(function(a) { return a.severity === 'warning'; });
    var infoAlerts     = _dismissedInfo ? [] : alerts.filter(function(a) { return a.severity === 'info'; });

    var filteredDevices = devices.filter(function(d) {
      return (!_filterType   || d.type         === _filterType)
          && (!_filterStatus || d.status       === _filterStatus)
          && (!_filterRoom   || d.assignedRoom === _filterRoom);
    });

    var filteredLogs = logs.filter(function(l) {
      return (!_filterLogDevice || l.deviceId === _filterLogDevice)
          && (!_filterLogType   || l.type     === _filterLogType);
    }).sort(function(a,b) { return b.date.localeCompare(a.date); });

    var types    = ['neurofeedback-amp','tms-coil','tdcs-device','eeg-cap','biofeedback-sensor','other'];
    var statuses = ['active','maintenance','decommissioned','loaned-out'];
    var rooms    = ['Room A','Room B','Room C','Portable'];
    var logTypes = ['calibration','maintenance','repair','inspection','session-use'];

    function tabBtn(id, label, count) {
      var active = _activeTab === id;
      var badge  = count > 0 ? ' <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:.65rem;background:rgba(239,68,68,0.2);color:#ef4444;font-weight:700;margin-left:4px">' + count + '</span>' : '';
      return '<button onclick="window._deviceTab(\'' + id + '\')" style="padding:8px 16px;border:none;cursor:pointer;font-size:13px;font-weight:' + (active ? 700 : 500) + ';color:' + (active ? 'var(--teal)' : 'var(--text-secondary)') + ';background:none;border-bottom:2px solid ' + (active ? 'var(--teal)' : 'transparent') + ';transition:all .15s">' + label + badge + '</button>';
    }

    function renderRegistry() {
      var deviceCards = filteredDevices.map(function(d) {
        return '<div class="device-card">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:8px">'
          + '<div><div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:3px">' + d.name + '</div>'
          + '<span class="device-type-badge">' + d.type + '</span></div>'
          + _statusBadge(d.status)
          + '</div>'
          + '<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px">'
          + '<div><span style="color:var(--text-tertiary)">S/N:</span> ' + (d.serialNumber || '\u2014') + '</div>'
          + '<div><span style="color:var(--text-tertiary)">Manufacturer:</span> ' + (d.manufacturer || '\u2014') + (d.model ? ' \u00b7 ' + d.model : '') + '</div>'
          + '<div><span style="color:var(--text-tertiary)">Room:</span> ' + (d.assignedRoom || '\u2014') + '</div>'
          + '</div>'
          + '<div style="margin-bottom:8px">'
          + '<div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px">Calibration</div>'
          + '<div style="font-size:11.5px"><span style="color:var(--text-secondary)">Last: ' + (d.lastCalibration || '\u2014') + '</span>'
          + '<span style="margin:0 4px;color:var(--text-tertiary)">|</span>'
          + '<span class="' + _calClass(d.nextCalibration) + '">Next: ' + (d.nextCalibration || '\u2014') + '</span></div>'
          + '</div>'
          + '<div style="margin-bottom:8px">'
          + '<div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px">Maintenance</div>'
          + '<div style="font-size:11.5px"><span style="color:var(--text-secondary)">Last: ' + (d.lastMaintenance || '\u2014') + '</span>'
          + '<span style="margin:0 4px;color:var(--text-tertiary)">|</span>'
          + '<span class="' + _mntClass(d.nextMaintenance) + '">Next: ' + (d.nextMaintenance || '\u2014') + '</span></div>'
          + '</div>'
          + '<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:12px">'
          + '<span style="color:var(--text-tertiary)">Sessions used in:</span> <strong style="color:var(--text-primary)">' + (d.sessionCount || 0) + '</strong></div>'
          + '<div style="display:flex;gap:6px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:10px">'
          + '<button class="btn btn-sm" onclick="window._deviceEdit(\'' + d.id + '\')">Edit</button>'
          + '<button class="btn btn-sm" onclick="window._deviceLogNew(\'' + d.id + '\')">Log Entry</button>'
          + (d.status !== 'decommissioned'
              ? '<button class="btn btn-sm" style="color:#ef4444;border-color:rgba(239,68,68,0.3)" onclick="window._deviceDecommission(\'' + d.id + '\')">Decommission</button>'
              : '<button class="btn btn-sm" style="color:#ef4444;border-color:rgba(239,68,68,0.3)" onclick="window._deviceDelete(\'' + d.id + '\')">Delete</button>')
          + '</div>'
          + '</div>';
      }).join('');

      return '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">'
        + '<select class="form-control" style="width:auto" onchange="window._deviceFilterType(this.value)">'
        + '<option value="">All Types</option>'
        + types.map(function(t) { return '<option value="' + t + '"' + (_filterType === t ? ' selected' : '') + '>' + t + '</option>'; }).join('')
        + '</select>'
        + '<select class="form-control" style="width:auto" onchange="window._deviceFilterStatus(this.value)">'
        + '<option value="">All Statuses</option>'
        + statuses.map(function(s) { return '<option value="' + s + '"' + (_filterStatus === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')
        + '</select>'
        + '<select class="form-control" style="width:auto" onchange="window._deviceFilterRoom(this.value)">'
        + '<option value="">All Rooms</option>'
        + rooms.map(function(r) { return '<option value="' + r + '"' + (_filterRoom === r ? ' selected' : '') + '>' + r + '</option>'; }).join('')
        + '</select>'
        + '<span style="font-size:11.5px;color:var(--text-tertiary);margin-left:auto">' + filteredDevices.length + ' device' + (filteredDevices.length !== 1 ? 's' : '') + '</span>'
        + '</div>'
        + (filteredDevices.length === 0
            ? '<div style="text-align:center;padding:48px;color:var(--text-tertiary)">No devices match the current filters.</div>'
            : '<div class="device-grid">' + deviceCards + '</div>')
        + '<div style="margin-top:24px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:16px">'
        + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Session Assignment</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
        + '<select id="dm-assign-device" class="form-control" style="flex:1;min-width:180px">'
        + '<option value="">Select active device\u2026</option>'
        + devices.filter(function(d) { return d.status === 'active'; }).map(function(d) { return '<option value="' + d.id + '">' + d.name + '</option>'; }).join('')
        + '</select>'
        + '<input id="dm-assign-session" class="form-control" placeholder="Session ID (e.g. S-0123)" style="flex:1;min-width:160px">'
        + '<button class="btn btn-primary btn-sm" onclick="window._deviceAssignSession()">Assign to Session</button>'
        + '</div>'
        + '<div id="dm-assign-msg" style="margin-top:8px;font-size:11.5px;color:var(--teal);display:none"></div>'
        + '</div>';
    }

    function renderLogs() {
      var timeline = filteredLogs.map(function(l) {
        return '<div style="display:flex;gap:14px;padding:12px 0;border-bottom:1px solid var(--border)">'
          + '<div style="flex-shrink:0;width:10px;height:10px;border-radius:50%;background:var(--teal);margin-top:4px"></div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">'
          + '<span style="font-size:11px;color:var(--text-tertiary)">' + l.date + '</span>'
          + '<strong style="font-size:12.5px;color:var(--text-primary)">' + l.deviceName + '</strong>'
          + _logTypeBadge(l.type)
          + _outcomeBadge(l.outcome)
          + '</div>'
          + (l.technician ? '<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:3px">Technician: ' + l.technician + '</div>' : '')
          + (l.notes ? '<div style="font-size:12px;color:var(--text-secondary);line-height:1.55">' + l.notes + '</div>' : '')
          + '</div>'
          + '</div>';
      }).join('');

      return '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;justify-content:space-between">'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + '<select class="form-control" style="width:auto" onchange="window._deviceFilterLogDevice(this.value)">'
        + '<option value="">All Devices</option>'
        + devices.map(function(d) { return '<option value="' + d.id + '"' + (_filterLogDevice === d.id ? ' selected' : '') + '>' + d.name + '</option>'; }).join('')
        + '</select>'
        + '<select class="form-control" style="width:auto" onchange="window._deviceFilterLogType(this.value)">'
        + '<option value="">All Log Types</option>'
        + logTypes.map(function(t) { return '<option value="' + t + '"' + (_filterLogType === t ? ' selected' : '') + '>' + t + '</option>'; }).join('')
        + '</select>'
        + '</div>'
        + '<button class="btn btn-primary btn-sm" onclick="window._deviceLogNew(\'\')">+ Add Log Entry</button>'
        + '</div>'
        + (filteredLogs.length === 0
            ? '<div style="text-align:center;padding:48px;color:var(--text-tertiary)">No log entries match the current filters.</div>'
            : '<div>' + timeline + '</div>');
    }

    function renderAlerts() {
      function renderGroup(title, arr, cls, icon) {
        if (arr.length === 0) return '';
        return '<div style="margin-bottom:20px">'
          + '<div style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">' + icon + ' ' + title + ' (' + arr.length + ')</div>'
          + arr.map(function(a) {
              return '<div class="' + cls + '">'
                + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">'
                + '<div>'
                + '<div style="font-size:12.5px;font-weight:700;color:#1e293b;margin-bottom:3px">' + a.deviceName + '</div>'
                + '<div style="font-size:12px;color:#334155;line-height:1.5">' + a.message + '</div>'
                + '</div>'
                + '<div style="flex-shrink:0">'
                + (a.alertType.indexOf('warranty') !== -1
                    ? '<button class="btn btn-sm" onclick="window._deviceRenewWarranty(\'' + a.deviceId + '\')">Renew</button>'
                    : '<button class="btn btn-sm btn-primary" onclick="window._deviceSchedule(\'' + a.deviceId + '\',\'' + (a.alertType.indexOf('calibration') !== -1 ? 'calibration' : 'maintenance') + '\')">Schedule Now</button>')
                + '</div>'
                + '</div>'
                + '</div>';
            }).join('')
          + '</div>';
      }

      return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">'
        + '<div style="font-size:13px;color:var(--text-primary)">'
        + (criticalAlerts.length > 0
            ? '<span style="color:#ef4444;font-weight:700">\u26a0 ' + criticalAlerts.length + ' device' + (criticalAlerts.length !== 1 ? 's' : '') + ' require immediate attention</span>'
            : '<span style="color:#10b981;font-weight:600">\u2713 No critical alerts</span>')
        + '</div>'
        + (infoAlerts.length > 0 ? '<button class="btn btn-sm" onclick="window._deviceDismissInfo()">Dismiss All Info</button>' : '')
        + '</div>'
        + renderGroup('Critical', criticalAlerts, 'alert-card-critical', '\ud83d\udd34')
        + renderGroup('Warning',  warningAlerts,  'alert-card-warning',  '\ud83d\udfe1')
        + renderGroup('Info',     infoAlerts,     'alert-card-info',     '\u2139\ufe0f')
        + (criticalAlerts.length === 0 && warningAlerts.length === 0 && infoAlerts.length === 0
            ? '<div style="text-align:center;padding:48px;color:var(--text-tertiary)">No active alerts \u2014 all devices are up to date.</div>'
            : '');
    }

    el.innerHTML = '<div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:20px;gap:0">'
      + tabBtn('registry', 'Device Registry', 0)
      + tabBtn('logs',     'Maintenance Log', 0)
      + tabBtn('alerts',   'Alerts', criticalAlerts.length + warningAlerts.length)
      + '</div>'
      + '<div id="dm-tab-content">'
      + (_activeTab === 'registry' ? renderRegistry()
          : _activeTab === 'logs'  ? renderLogs()
          : renderAlerts())
      + '</div>';
  }

  window._deviceTab = function(tab) { _activeTab = tab; render(); };

  window._deviceFilterType   = function(v) { _filterType   = v; render(); };
  window._deviceFilterStatus = function(v) { _filterStatus = v; render(); };
  window._deviceFilterRoom   = function(v) { _filterRoom   = v; render(); };
  window._deviceFilterLogDevice = function(v) { _filterLogDevice = v; render(); };
  window._deviceFilterLogType   = function(v) { _filterLogType   = v; render(); };

  window._deviceNew = function() {
    _deviceModal(
      'Register New Device',
      _deviceFormHtml(null),
      '<button class="btn" onclick="document.getElementById(\'dm-modal-overlay\').remove()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="window._deviceSave()">Register Device</button>'
    );
  };

  window._deviceSave = function() {
    var name = (document.getElementById('dm-f-name') || {}).value;
    if (!name || !name.trim()) { alert('Device name is required.'); return; }
    var id = ((document.getElementById('dm-f-id') || {}).value || '').trim();
    var devices = getDevices();
    var newId = id || ('DEV-' + String(devices.length + 1).padStart(3,'0') + '-' + Math.random().toString(36).slice(2,5).toUpperCase());
    var d = {
      id:             id || newId,
      name:           name.trim(),
      type:           (document.getElementById('dm-f-type')         || {}).value || 'other',
      serialNumber:   (document.getElementById('dm-f-serial')       || {}).value || '',
      manufacturer:   (document.getElementById('dm-f-manufacturer') || {}).value || '',
      model:          (document.getElementById('dm-f-model')        || {}).value || '',
      status:         (document.getElementById('dm-f-status')       || {}).value || 'active',
      assignedRoom:   (document.getElementById('dm-f-room')         || {}).value || 'Room A',
      purchaseDate:   (document.getElementById('dm-f-purchase')     || {}).value || '',
      warrantyExpiry: (document.getElementById('dm-f-warranty')     || {}).value || '',
      lastCalibration:(document.getElementById('dm-f-last-cal')     || {}).value || '',
      nextCalibration:(document.getElementById('dm-f-next-cal')     || {}).value || '',
      lastMaintenance:(document.getElementById('dm-f-last-mnt')     || {}).value || '',
      nextMaintenance:(document.getElementById('dm-f-next-mnt')     || {}).value || '',
      sessionCount:   parseInt((document.getElementById('dm-f-sessions') || {}).value || '0', 10),
      notes:          (document.getElementById('dm-f-notes')        || {}).value || '',
    };
    saveDevice(d);
    var ov = document.getElementById('dm-modal-overlay');
    if (ov) ov.remove();
    render();
  };

  window._deviceEdit = function(id) {
    var d = getDevices().find(function(x) { return x.id === id; });
    if (!d) return;
    _deviceModal(
      'Edit Device',
      _deviceFormHtml(d),
      '<button class="btn" onclick="document.getElementById(\'dm-modal-overlay\').remove()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="window._deviceSave()">Save Changes</button>'
    );
  };

  window._deviceDelete = function(id) {
    if (!confirm('Permanently delete this device record? This cannot be undone.')) return;
    deleteDevice(id);
    render();
  };

  window._deviceDecommission = function(id) {
    if (!confirm('Mark this device as decommissioned?')) return;
    var d = getDevices().find(function(x) { return x.id === id; });
    if (!d) return;
    d.status = 'decommissioned';
    saveDevice(d);
    render();
  };

  window._deviceLogNew = function(preselectedId) {
    var devices  = getDevices();
    var logTypes = ['calibration','maintenance','repair','inspection','session-use'];
    var outcomes = ['pass','fail','pending'];
    var today    = new Date().toISOString().slice(0,10);
    var bodyHtml = '<div style="margin-bottom:10px">'
      + '<label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Device *</label>'
      + '<select id="dm-log-device" class="form-control" style="width:100%">'
      + devices.map(function(d) { return '<option value="' + d.id + '"' + (d.id === preselectedId ? ' selected' : '') + '>' + d.name + '</option>'; }).join('')
      + '</select></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">'
      + '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Log Type *</label>'
      + '<select id="dm-log-type" class="form-control" style="width:100%">'
      + logTypes.map(function(t) { return '<option value="' + t + '">' + t + '</option>'; }).join('')
      + '</select></div>'
      + '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Date *</label>'
      + '<input id="dm-log-date" class="form-control" type="date" value="' + today + '" style="width:100%"></div>'
      + '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Technician</label>'
      + '<input id="dm-log-tech" class="form-control" placeholder="Name" style="width:100%"></div>'
      + '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Outcome</label>'
      + '<select id="dm-log-outcome" class="form-control" style="width:100%">'
      + outcomes.map(function(o) { return '<option value="' + o + '">' + o + '</option>'; }).join('')
      + '</select></div>'
      + '</div>'
      + '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">Notes</label>'
      + '<textarea id="dm-log-notes" class="form-control" rows="3" style="width:100%;resize:vertical"></textarea></div>';
    _deviceModal(
      'Add Log Entry',
      bodyHtml,
      '<button class="btn" onclick="document.getElementById(\'dm-modal-overlay\').remove()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="window._deviceLogSave()">Save Entry</button>'
    );
  };

  window._deviceLogSave = function() {
    var deviceId = (document.getElementById('dm-log-device') || {}).value;
    var date     = (document.getElementById('dm-log-date')   || {}).value;
    if (!deviceId || !date) { alert('Device and date are required.'); return; }
    var devices = getDevices();
    var dev  = devices.find(function(d) { return d.id === deviceId; });
    var logs = getDeviceLogs();
    var entry = {
      id:         'DL-' + String(logs.length + 1).padStart(3,'0') + '-' + Math.random().toString(36).slice(2,5).toUpperCase(),
      deviceId:   deviceId,
      deviceName: dev ? dev.name : deviceId,
      type:       (document.getElementById('dm-log-type')    || {}).value || 'inspection',
      date:       date,
      technician: (document.getElementById('dm-log-tech')    || {}).value || '',
      notes:      (document.getElementById('dm-log-notes')   || {}).value || '',
      outcome:    (document.getElementById('dm-log-outcome') || {}).value || 'pending',
    };
    saveDeviceLog(entry);
    var ov = document.getElementById('dm-modal-overlay');
    if (ov) ov.remove();
    _activeTab = 'logs';
    render();
  };

  window._deviceSchedule = function(deviceId, type) {
    var d = getDevices().find(function(x) { return x.id === deviceId; });
    if (!d) return;
    var fieldLabel  = type === 'calibration' ? 'Next Calibration Date' : 'Next Maintenance Date';
    var currentVal  = type === 'calibration' ? (d.nextCalibration || '') : (d.nextMaintenance || '');
    var typeLabel   = type.charAt(0).toUpperCase() + type.slice(1);
    _deviceModal(
      'Schedule ' + typeLabel + ' \u2014 ' + d.name,
      '<div style="margin-bottom:10px">'
        + '<label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px">' + fieldLabel + ' *</label>'
        + '<input id="dm-sched-date" class="form-control" type="date" value="' + currentVal + '" style="width:100%">'
        + '</div>',
      '<button class="btn" onclick="document.getElementById(\'dm-modal-overlay\').remove()">Cancel</button>'
        + '<button class="btn btn-primary" onclick="window._deviceScheduleSave(\'' + deviceId + '\',\'' + type + '\')">Set Date</button>'
    );
  };

  window._deviceScheduleSave = function(deviceId, type) {
    var newDate = (document.getElementById('dm-sched-date') || {}).value;
    if (!newDate) { alert('Please select a date.'); return; }
    var d = getDevices().find(function(x) { return x.id === deviceId; });
    if (!d) return;
    if (type === 'calibration') d.nextCalibration = newDate;
    else d.nextMaintenance = newDate;
    saveDevice(d);
    var ov = document.getElementById('dm-modal-overlay');
    if (ov) ov.remove();
    render();
  };

  window._deviceRenewWarranty = function(deviceId) {
    _deviceModal(
      'Warranty Renewal',
      '<div style="padding:12px;background:rgba(59,130,246,0.08);border-radius:8px;border:1px solid rgba(59,130,246,0.2)">'
        + '<div style="font-size:13px;color:var(--text-primary);line-height:1.65;margin-bottom:8px">'
        + 'To renew the warranty for this device, please contact the manufacturer or your procurement team with the device serial number.'
        + '</div>'
        + '<div style="font-size:11.5px;color:var(--text-secondary)">Once renewed, use the <strong>Edit</strong> button on the device card to update the warranty expiry date.</div>'
        + '</div>',
      '<button class="btn btn-primary" onclick="document.getElementById(\'dm-modal-overlay\').remove()">OK</button>'
    );
  };

  window._deviceDismissInfo = function() {
    _dismissedInfo = true;
    render();
  };

  window._deviceAssignSession = function() {
    var deviceId  = (document.getElementById('dm-assign-device')  || {}).value;
    var sessionId = ((document.getElementById('dm-assign-session') || {}).value || '').trim();
    var msg = document.getElementById('dm-assign-msg');
    if (!deviceId || !sessionId) {
      if (msg) { msg.style.display = 'block'; msg.style.color = '#ef4444'; msg.textContent = 'Please select a device and enter a session ID.'; }
      return;
    }
    var d = getDevices().find(function(x) { return x.id === deviceId; });
    if (!d) return;
    d.sessionCount = (d.sessionCount || 0) + 1;
    saveDevice(d);
    var log = {
      id:         'DL-SU-' + Date.now(),
      deviceId:   deviceId,
      deviceName: d.name,
      type:       'session-use',
      date:       new Date().toISOString().slice(0,10),
      technician: '',
      notes:      'Assigned to session ' + sessionId,
      outcome:    'pending',
    };
    saveDeviceLog(log);
    if (msg) {
      msg.style.display = 'block';
      msg.style.color = '#10b981';
      msg.textContent = '\u2713 ' + d.name + ' assigned to session ' + sessionId + ' \u2014 session count now ' + d.sessionCount + '.';
    }
    var sessInput = document.getElementById('dm-assign-session');
    if (sessInput) sessInput.value = '';
  };

  render();
}

// ── Clinical Trials ───────────────────────────────────────────────────────────

const TRIALS_KEY = 'ds_clinical_trials';
const TRIAL_PARTICIPANTS_KEY = 'ds_trial_participants';
const TRIAL_DATA_KEY = 'ds_trial_data';

function _trialSeedData() {
  return [
    {
      id: 'trial-001',
      title: 'Neurofeedback vs Sham for ADHD',
      irbNumber: 'IRB-2024-NF-001',
      sponsor: 'DeepSynaps Research Institute',
      phase: 'Phase II',
      status: 'active',
      startDate: '2024-01-15',
      endDate: '2025-06-30',
      targetEnrollment: 40,
      arms: [
        { id: 'a1', name: 'Neurofeedback', description: 'Active neurofeedback training 3x/week for 8 weeks', type: 'treatment' },
        { id: 'a2', name: 'Sham Control', description: 'Placebo neurofeedback with no real feedback signal', type: 'control' },
      ],
      primaryOutcome: 'ADHD-RS total score change from baseline at 8 weeks',
      secondaryOutcomes: ['CGI-S improvement', 'Sustained attention (CPT-II)', 'Parent/teacher rating scales'],
      inclusionCriteria: ['Age 8-18 years', 'DSM-5 ADHD diagnosis', 'ADHD-RS score >= 28', 'Stable medication for >= 4 weeks or medication-naive'],
      exclusionCriteria: ['Comorbid seizure disorder', 'Active psychosis', 'Prior neurofeedback within 12 months', 'IQ < 70'],
      principalInvestigator: 'Dr. Sarah Chen',
      coordinatorName: 'James Park',
      blinded: true,
      notes: 'IRB approved. Study running on schedule. Interim safety review passed.',
    },
    {
      id: 'trial-002',
      title: 'tDCS for Depression - Dose Optimization',
      irbNumber: 'IRB-2024-TDCS-002',
      sponsor: 'NeuroModulation Consortium',
      phase: 'Phase II',
      status: 'recruiting',
      startDate: '2024-06-01',
      endDate: '2026-01-31',
      targetEnrollment: 60,
      arms: [
        { id: 'b1', name: 'tDCS 1mA', description: 'tDCS at 1mA for 20 minutes, 5 sessions/week x 4 weeks', type: 'treatment' },
        { id: 'b2', name: 'tDCS 2mA', description: 'tDCS at 2mA for 20 minutes, 5 sessions/week x 4 weeks', type: 'treatment' },
        { id: 'b3', name: 'Sham tDCS', description: 'Sham stimulation with electrode placement only', type: 'control' },
      ],
      primaryOutcome: 'PHQ-9 score reduction >= 50% at 4 weeks',
      secondaryOutcomes: ['HAM-D17 total score', 'GAD-7 anxiety score', 'Quality of life (SF-36)', 'Response and remission rates'],
      inclusionCriteria: ['Age 18-65 years', 'MDD diagnosis (DSM-5)', 'PHQ-9 >= 15', 'Failed >= 1 adequate antidepressant trial'],
      exclusionCriteria: ['Bipolar disorder', 'Metal implants near stimulation site', 'Pregnancy', 'Active suicidal ideation with plan', 'ECT within 6 months'],
      principalInvestigator: 'Dr. Marco Reyes',
      coordinatorName: 'Lisa Thompson',
      blinded: true,
      notes: 'Actively recruiting. Site initiation visit completed. DSMB charter approved.',
    },
  ];
}

function _trialSeedParticipants() {
  var participants = [];
  var statuses = ['active','active','active','active','completed','active','active','withdrawn','active','active','active','active'];
  var arms1 = ['a1','a1','a1','a1','a1','a1','a2','a2','a2','a2','a2','a2'];
  for (var i = 0; i < 24; i++) {
    var arm = arms1[i % 12] || (i % 2 === 0 ? 'a1' : 'a2');
    var armName = arm === 'a1' ? 'Neurofeedback' : 'Sham Control';
    var stat = statuses[i % 12] || 'active';
    var mo = String((i % 9) + 1).padStart(2, '0');
    var dy = String((i % 28) + 1).padStart(2, '0');
    participants.push({
      id: 'p-t1-' + String(i + 1).padStart(3, '0'),
      trialId: 'trial-001',
      patientName: 'Participant NF-' + String(i + 1).padStart(3, '0'),
      enrollmentDate: '2024-' + mo + '-' + dy,
      screeningDate: '2024-' + mo + '-' + dy,
      armId: arm,
      armName: armName,
      status: stat,
      visits: [
        { date: '2024-02-01', type: 'Baseline', completed: true, notes: '' },
        { date: '2024-03-01', type: 'Week 4', completed: i < 18, notes: '' },
        { date: '2024-04-01', type: 'Week 8', completed: i < 10, notes: '' },
      ],
      safetyNotes: '',
    });
  }
  for (var j = 0; j < 12; j++) {
    var armIdx = j % 3;
    var armIds = ['b1','b2','b3'];
    var armNames = ['tDCS 1mA','tDCS 2mA','Sham tDCS'];
    var mo2 = String((j % 6) + 6).padStart(2, '0');
    participants.push({
      id: 'p-t2-' + String(j + 1).padStart(3, '0'),
      trialId: 'trial-002',
      patientName: 'Participant TD-' + String(j + 1).padStart(3, '0'),
      enrollmentDate: '2024-' + mo2 + '-01',
      screeningDate: '2024-' + mo2 + '-01',
      armId: armIds[armIdx],
      armName: armNames[armIdx],
      status: j < 9 ? 'active' : 'screening',
      visits: [
        { date: '2024-07-01', type: 'Baseline', completed: true, notes: '' },
        { date: '2024-08-01', type: 'Week 2', completed: j < 6, notes: '' },
        { date: '2024-09-01', type: 'Week 4', completed: false, notes: '' },
      ],
      safetyNotes: '',
    });
  }
  return participants;
}

function getTrials() {
  try {
    var raw = localStorage.getItem(TRIALS_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  var seed = _trialSeedData();
  localStorage.setItem(TRIALS_KEY, JSON.stringify(seed));
  return seed;
}

function saveTrial(trial) {
  var trials = getTrials();
  var idx = trials.findIndex(function(t) { return t.id === trial.id; });
  if (idx >= 0) trials[idx] = trial; else trials.push(trial);
  localStorage.setItem(TRIALS_KEY, JSON.stringify(trials));
}

function deleteTrial(id) {
  var trials = getTrials().filter(function(t) { return t.id !== id; });
  localStorage.setItem(TRIALS_KEY, JSON.stringify(trials));
}

function _getAllParticipants() {
  try {
    var raw = localStorage.getItem(TRIAL_PARTICIPANTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  var seeded = _trialSeedParticipants();
  localStorage.setItem(TRIAL_PARTICIPANTS_KEY, JSON.stringify(seeded));
  return seeded;
}

function getTrialParticipants(trialId) {
  return _getAllParticipants().filter(function(p) { return p.trialId === trialId; });
}

function saveTrialParticipant(p) {
  var all = _getAllParticipants();
  var idx = all.findIndex(function(x) { return x.id === p.id; });
  if (idx >= 0) all[idx] = p; else all.push(p);
  localStorage.setItem(TRIAL_PARTICIPANTS_KEY, JSON.stringify(all));
}

function randomizeArm(trialId, participantId) {
  var trial = getTrials().find(function(t) { return t.id === trialId; });
  if (!trial || !trial.arms || trial.arms.length === 0) return null;
  var all = _getAllParticipants();
  var idx = all.findIndex(function(x) { return x.id === participantId; });
  if (idx < 0) return null;
  var chosen = trial.arms[Math.floor(Math.random() * trial.arms.length)];
  all[idx].armId = chosen.id;
  all[idx].armName = chosen.name;
  all[idx].status = 'enrolled';
  localStorage.setItem(TRIAL_PARTICIPANTS_KEY, JSON.stringify(all));
  return { armId: chosen.id, armName: chosen.name, blinded: trial.blinded };
}

function getTrialData(trialId) {
  try {
    var raw = localStorage.getItem(TRIAL_DATA_KEY);
    var all = raw ? JSON.parse(raw) : [];
    return all.filter(function(d) { return d.trialId === trialId; });
  } catch(e) { return []; }
}

function saveTrialDataPoint(point) {
  try {
    var raw = localStorage.getItem(TRIAL_DATA_KEY);
    var all = raw ? JSON.parse(raw) : [];
    var idx = all.findIndex(function(x) { return x.id === point.id; });
    if (idx >= 0) all[idx] = point; else all.push(point);
    localStorage.setItem(TRIAL_DATA_KEY, JSON.stringify(all));
  } catch(e) {}
}

function trialEnrollmentStats(trial, participants) {
  return {
    total: participants.length,
    active: participants.filter(function(p) { return p.status === 'active'; }).length,
    completed: participants.filter(function(p) { return p.status === 'completed'; }).length,
    withdrawn: participants.filter(function(p) { return p.status === 'withdrawn' || p.status === 'lost-to-followup'; }).length,
    enrollmentPct: Math.round(participants.length / trial.targetEnrollment * 100),
    byArm: trial.arms.map(function(arm) {
      return Object.assign({}, arm, {
        count: participants.filter(function(p) { return p.armId === arm.id; }).length,
      });
    }),
  };
}

function _trialStatusBadge(status) {
  var cls = {
    planning: 'trial-phase-badge',
    recruiting: 'trial-status-recruiting',
    active: 'trial-status-active',
    completed: 'trial-status-completed',
    paused: 'trial-status-paused',
    terminated: 'trial-status-terminated',
  }[status] || 'trial-phase-badge';
  return '<span class="' + cls + '">' + (status.charAt(0).toUpperCase() + status.slice(1)) + '</span>';
}

function _trialParticipantStatusBadge(status) {
  var map = {
    screening:        { bg:'#f3f4f6', color:'#374151' },
    enrolled:         { bg:'#dbeafe', color:'#1e40af' },
    active:           { bg:'#d1fae5', color:'#065f46' },
    completed:        { bg:'#ede9fe', color:'#5b21b6' },
    withdrawn:        { bg:'#fee2e2', color:'#991b1b' },
    'lost-to-followup': { bg:'#fef3c7', color:'#92400e' },
  };
  var s = map[status] || { bg:'#f3f4f6', color:'#374151' };
  return '<span style="padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:700;background:' + s.bg + ';color:' + s.color + '">' + status + '</span>';
}

function _armPieChart(byArm) {
  if (!byArm || byArm.length === 0) return '';
  var total = byArm.reduce(function(s, a) { return s + a.count; }, 0);
  if (total === 0) return '<div style="color:var(--text-muted);font-size:.8rem">No participants yet</div>';
  var colors = ['#00d4bc','#4a9eff','#9b7fff','#ffb547','#ff6b9d'];
  var slices = '';
  var cumAngle = -90;
  byArm.forEach(function(arm, i) {
    var pct = arm.count / total;
    var angle = pct * 360;
    var r = 40, cx = 50, cy = 50;
    var startRad = (cumAngle * Math.PI) / 180;
    var endRad   = ((cumAngle + angle) * Math.PI) / 180;
    var x1 = cx + r * Math.cos(startRad);
    var y1 = cy + r * Math.sin(startRad);
    var x2 = cx + r * Math.cos(endRad);
    var y2 = cy + r * Math.sin(endRad);
    var largeArc = angle > 180 ? 1 : 0;
    slices += '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' A' + r + ',' + r + ' 0 ' + largeArc + ',1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z" fill="' + colors[i % colors.length] + '" opacity="0.85"/>';
    cumAngle += angle;
  });
  var legend = byArm.map(function(arm, i) {
    return '<div style="display:flex;align-items:center;gap:6px;font-size:.75rem;margin-bottom:3px"><span style="width:10px;height:10px;border-radius:2px;background:' + colors[i % colors.length] + ';flex-shrink:0;display:inline-block"></span><span>' + arm.name + ': <strong>' + arm.count + '</strong></span></div>';
  }).join('');
  return '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><svg width="100" height="100" viewBox="0 0 100 100">' + slices + '</svg><div>' + legend + '</div></div>';
}

function _outcomeLineChart(dataPoints, arms) {
  if (!dataPoints || dataPoints.length === 0) return '<div style="color:var(--text-muted);font-size:.8rem;padding:20px 0">No data points recorded yet.</div>';
  var colors = ['#00d4bc','#4a9eff','#9b7fff'];
  var W = 500, H = 200;
  var PAD = { t:20, r:20, b:40, l:50 };
  var iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;
  var pts = dataPoints.map(function(d) {
    return Object.assign({}, d, { ts: new Date(d.visitDate).getTime() });
  }).filter(function(d) { return !isNaN(d.ts) && !isNaN(parseFloat(d.value)); });
  if (pts.length === 0) return '<div style="color:var(--text-muted);font-size:.8rem;padding:20px 0">No numeric data to chart.</div>';
  var minT = Math.min.apply(null, pts.map(function(p) { return p.ts; }));
  var maxT = Math.max.apply(null, pts.map(function(p) { return p.ts; }));
  var minV = Math.min.apply(null, pts.map(function(p) { return parseFloat(p.value); }));
  var maxV = Math.max.apply(null, pts.map(function(p) { return parseFloat(p.value); }));
  var rangeT = maxT - minT || 1;
  var rangeV = maxV - minV || 1;
  function toX(t) { return PAD.l + ((t - minT) / rangeT) * iW; }
  function toY(v) { return PAD.t + (1 - (v - minV) / rangeV) * iH; }
  var paths = '';
  arms.forEach(function(arm, i) {
    var armPts = pts.filter(function(p) { return p.armId === arm.id; }).sort(function(a,b) { return a.ts - b.ts; });
    if (armPts.length === 0) return;
    var d = armPts.map(function(p, j) { return (j === 0 ? 'M' : 'L') + toX(p.ts).toFixed(1) + ',' + toY(parseFloat(p.value)).toFixed(1); }).join(' ');
    paths += '<path d="' + d + '" fill="none" stroke="' + colors[i % colors.length] + '" stroke-width="2" stroke-linejoin="round"/>';
    armPts.forEach(function(p) {
      paths += '<circle cx="' + toX(p.ts).toFixed(1) + '" cy="' + toY(parseFloat(p.value)).toFixed(1) + '" r="3.5" fill="' + colors[i % colors.length] + '"/>';
    });
  });
  var axes = '<line x1="' + PAD.l + '" y1="' + PAD.t + '" x2="' + PAD.l + '" y2="' + (PAD.t + iH) + '" stroke="var(--border)" stroke-width="1"/>'
           + '<line x1="' + PAD.l + '" y1="' + (PAD.t + iH) + '" x2="' + (PAD.l + iW) + '" y2="' + (PAD.t + iH) + '" stroke="var(--border)" stroke-width="1"/>'
           + '<text x="' + (PAD.l - 5) + '" y="' + (PAD.t + 5) + '" text-anchor="end" font-size="10" fill="var(--text-muted)">' + maxV.toFixed(1) + '</text>'
           + '<text x="' + (PAD.l - 5) + '" y="' + (PAD.t + iH) + '" text-anchor="end" font-size="10" fill="var(--text-muted)">' + minV.toFixed(1) + '</text>';
  var legend = arms.map(function(arm, i) {
    return '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:.72rem"><span style="width:16px;height:3px;background:' + colors[i % colors.length] + ';display:inline-block;border-radius:2px"></span>' + arm.name + '</span>';
  }).join('');
  return '<div><svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" style="overflow:visible;max-width:' + W + 'px">' + axes + paths + '</svg><div style="margin-top:6px">' + legend + '</div></div>';
}

function _trialWizardHtml() {
  return '<div id="trial-wizard" style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px;display:none">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
    + '<strong style="font-size:1rem">New Clinical Trial</strong>'
    + '<div style="display:flex;gap:6px">'
    + '<span id="wiz-step-1" style="padding:3px 10px;border-radius:12px;font-size:.72rem;font-weight:700;background:var(--accent-teal);color:#000">1. Basic Info</span>'
    + '<span id="wiz-step-2" style="padding:3px 10px;border-radius:12px;font-size:.72rem;font-weight:700;background:var(--hover-bg);color:var(--text-muted)">2. Arms</span>'
    + '<span id="wiz-step-3" style="padding:3px 10px;border-radius:12px;font-size:.72rem;font-weight:700;background:var(--hover-bg);color:var(--text-muted)">3. Outcomes</span>'
    + '</div></div>'
    + '<div id="wiz-panel-1">'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + '<div style="grid-column:1/-1"><label class="form-label">Trial Title *</label><input class="form-control" id="wiz-title" placeholder="e.g. Neurofeedback for ADHD RCT"></div>'
    + '<div><label class="form-label">IRB Number</label><input class="form-control" id="wiz-irb" placeholder="IRB-2025-XXX"></div>'
    + '<div><label class="form-label">Phase</label><select class="form-control" id="wiz-phase"><option value="Phase I">Phase I</option><option value="Phase II" selected>Phase II</option><option value="Phase III">Phase III</option><option value="Phase IV">Phase IV</option><option value="Observational">Observational</option></select></div>'
    + '<div><label class="form-label">Sponsor</label><input class="form-control" id="wiz-sponsor" placeholder="Institution / Funder"></div>'
    + '<div><label class="form-label">Principal Investigator</label><input class="form-control" id="wiz-pi" placeholder="Dr. Full Name"></div>'
    + '<div><label class="form-label">Coordinator</label><input class="form-control" id="wiz-coord" placeholder="Coordinator Name"></div>'
    + '<div><label class="form-label">Start Date</label><input type="date" class="form-control" id="wiz-start"></div>'
    + '<div><label class="form-label">End Date</label><input type="date" class="form-control" id="wiz-end"></div>'
    + '<div><label class="form-label">Target Enrollment</label><input type="number" class="form-control" id="wiz-target" placeholder="60" min="1"></div>'
    + '<div style="display:flex;align-items:center;gap:8px;padding-top:22px"><input type="checkbox" id="wiz-blinded" checked style="width:16px;height:16px"><label for="wiz-blinded" style="font-size:.85rem">Double-blind study</label></div>'
    + '</div>'
    + '<div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">'
    + '<button class="btn btn-ghost" onclick="document.getElementById(\'trial-wizard\').style.display=\'none\'">Cancel</button>'
    + '<button class="btn btn-primary" onclick="window._trialWizNext(1)">Next: Arms &rarr;</button>'
    + '</div></div>'
    + '<div id="wiz-panel-2" style="display:none">'
    + '<div id="wiz-arms-list"></div>'
    + '<button class="btn btn-ghost" style="margin-top:8px" onclick="window._trialAddArm()">+ Add Arm</button>'
    + '<div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">'
    + '<button class="btn btn-ghost" onclick="window._trialWizBack(2)">Back</button>'
    + '<button class="btn btn-primary" onclick="window._trialWizNext(2)">Next: Outcomes &rarr;</button>'
    + '</div></div>'
    + '<div id="wiz-panel-3" style="display:none">'
    + '<div style="display:grid;gap:10px">'
    + '<div><label class="form-label">Primary Outcome *</label><input class="form-control" id="wiz-primary-outcome" placeholder="e.g. ADHD-RS score change from baseline at 8 weeks"></div>'
    + '<div><label class="form-label">Secondary Outcomes (one per line)</label><textarea class="form-control" id="wiz-secondary-outcomes" rows="3" placeholder="HAM-D score\nQuality of life\nRemission rate"></textarea></div>'
    + '<div><label class="form-label">Inclusion Criteria (one per line)</label><textarea class="form-control" id="wiz-inclusion" rows="3" placeholder="Age 18-65\nDSM-5 diagnosis\nPHQ-9 >= 15"></textarea></div>'
    + '<div><label class="form-label">Exclusion Criteria (one per line)</label><textarea class="form-control" id="wiz-exclusion" rows="3" placeholder="Active psychosis\nPregnancy\nMetal implants"></textarea></div>'
    + '</div>'
    + '<div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">'
    + '<button class="btn btn-ghost" onclick="window._trialWizBack(3)">Back</button>'
    + '<button class="btn btn-primary" onclick="window._trialSave()">Save Trial</button>'
    + '</div></div></div>';
}

function _trialEnrollFormHtml(trialId) {
  return '<div id="trial-enroll-form" style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px;display:none">'
    + '<strong style="display:block;margin-bottom:12px">Enroll Participant</strong>'
    + '<input type="hidden" id="enroll-trial-id" value="' + trialId + '">'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + '<div style="grid-column:1/-1"><label class="form-label">Patient Name *</label><input class="form-control" id="enroll-name" placeholder="Full name or study ID"></div>'
    + '<div><label class="form-label">Screening Date</label><input type="date" class="form-control" id="enroll-screen-date"></div>'
    + '<div><label class="form-label">Enrollment Date</label><input type="date" class="form-control" id="enroll-date"></div>'
    + '</div>'
    + '<div id="enroll-msg" style="display:none;margin-top:8px;font-size:.82rem;color:#10b981"></div>'
    + '<div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">'
    + '<button class="btn btn-ghost" onclick="document.getElementById(\'trial-enroll-form\').style.display=\'none\'">Cancel</button>'
    + '<button class="btn btn-primary" onclick="window._trialSaveParticipant()">Enroll</button>'
    + '</div></div>';
}

export async function pgClinicalTrials(setTopbar) {
  setTopbar('Clinical Trial Management', '');
  var el = document.getElementById('content');

  var _activeTab = 'registry';
  var _filterStatus = '';
  var _filterPhase = '';
  var _selectedTrialId = '';
  var _selectedDataTrialId = '';
  var _wizStep = 1;
  var _wizArms = [];
  var _trialIdBeingEdited = null;
  var _expandedTrials = {};

  var OUTCOME_MEASURES = ['PHQ-9','GAD-7','ADHD-RS','HAM-D','CGI','BIS-11','Custom'];

  function render() {
    var trials = getTrials();
    var tabBar = '<div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px">'
      + ['registry','participants','data'].map(function(t) {
          var labels = { registry: '🧪 Trial Registry', participants: '👥 Participants', data: '📊 Data Collection' };
          var active = _activeTab === t;
          return '<button onclick="window._trialTabSwitch(\'' + t + '\')" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:.88rem;font-weight:' + (active?'700':'400') + ';color:' + (active?'var(--accent-teal)':'var(--text-muted)') + ';border-bottom:' + (active?'2px solid var(--accent-teal)':'2px solid transparent') + ';margin-bottom:-2px;transition:all .15s">' + labels[t] + '</button>';
        }).join('')
      + '</div>';
    var body = '';
    if (_activeTab === 'registry') body = renderRegistry(trials);
    else if (_activeTab === 'participants') body = renderParticipants(trials);
    else body = renderDataCollection(trials);
    el.innerHTML = tabBar + body;
    bindHandlers();
  }

  function renderRegistry(trials) {
    var phases = [];
    trials.forEach(function(t) { if (t.phase && phases.indexOf(t.phase) < 0) phases.push(t.phase); });
    var statuses = ['planning','recruiting','active','paused','completed','terminated'];
    var filtered = trials.filter(function(t) {
      var matchS = !_filterStatus || t.status === _filterStatus;
      var matchP = !_filterPhase || t.phase === _filterPhase;
      return matchS && matchP;
    });
    var filterBar = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">'
      + '<span style="font-size:.78rem;color:var(--text-muted);font-weight:600">STATUS:</span>'
      + [''].concat(statuses).map(function(s) {
          var label = s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All';
          var active = _filterStatus === s;
          return '<button onclick="window._trialFilterStatus(\'' + s + '\')" style="padding:3px 10px;border-radius:12px;border:1px solid var(--border);background:' + (active ? 'var(--accent-teal)' : 'var(--card-bg)') + ';color:' + (active ? '#000' : 'var(--text-secondary)') + ';font-size:.72rem;font-weight:600;cursor:pointer">' + label + '</button>';
        }).join('')
      + '<select class="form-control" style="width:auto;font-size:.78rem;padding:3px 8px;height:28px" onchange="window._trialFilterPhase(this.value)">'
      + '<option value="">All Phases</option>'
      + phases.map(function(p) { return '<option value="' + p + '"' + (_filterPhase === p ? ' selected' : '') + '>' + p + '</option>'; }).join('')
      + '</select>'
      + '<span style="flex:1"></span>'
      + '<button class="btn btn-primary" style="font-size:.8rem;padding:6px 14px" onclick="window._trialNew()">+ New Trial</button>'
      + '</div>';

    var cards = filtered.length === 0
      ? '<div style="text-align:center;padding:40px;color:var(--text-muted)">No trials match the current filter.</div>'
      : filtered.map(function(trial) {
          var participants = getTrialParticipants(trial.id);
          var stats = trialEnrollmentStats(trial, participants);
          var expanded = !!_expandedTrials[trial.id];
          var armSummary = trial.arms.map(function(a) { return '<span class="trial-arm-badge">' + a.name + '</span>'; }).join('<span style="color:var(--text-muted);margin:0 4px;font-size:.78rem">vs</span>');

          var expandContent = '';
          if (expanded) {
            expandContent = '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">'
              + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'
              + '<div>'
              + '<div style="font-size:.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Primary Outcome</div>'
              + '<div style="font-size:.82rem">' + (trial.primaryOutcome || '—') + '</div>'
              + (trial.secondaryOutcomes && trial.secondaryOutcomes.length ? '<div style="font-size:.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-top:10px;margin-bottom:4px">Secondary Outcomes</div><ul class="trial-criteria-list">' + trial.secondaryOutcomes.map(function(o) { return '<li style="font-size:.8rem">' + o + '</li>'; }).join('') + '</ul>' : '')
              + '</div>'
              + '<div>'
              + '<div style="font-size:.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Inclusion Criteria</div>'
              + '<ul class="trial-criteria-list">' + (trial.inclusionCriteria && trial.inclusionCriteria.length ? trial.inclusionCriteria.map(function(c) { return '<li style="font-size:.8rem">' + c + '</li>'; }).join('') : '<li style="font-size:.8rem;color:var(--text-muted)">None defined</li>') + '</ul>'
              + '<div style="font-size:.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-top:10px;margin-bottom:4px">Exclusion Criteria</div>'
              + '<ul class="trial-criteria-list">' + (trial.exclusionCriteria && trial.exclusionCriteria.length ? trial.exclusionCriteria.map(function(c) { return '<li style="font-size:.8rem">' + c + '</li>'; }).join('') : '<li style="font-size:.8rem;color:var(--text-muted)">None defined</li>') + '</ul>'
              + '</div></div>'
              + (trial.notes ? '<div style="margin-top:10px;font-size:.8rem;color:var(--text-muted);background:var(--hover-bg);padding:8px 12px;border-radius:6px">' + trial.notes + '</div>' : '')
              + '</div>';
          }

          return '<div class="trial-card">'
            + '<div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">'
            + '<div style="flex:1;min-width:0">'
            + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">'
            + '<span style="font-weight:700;font-size:.95rem">' + trial.title + '</span>'
            + '<span class="trial-phase-badge">' + trial.phase + '</span>'
            + _trialStatusBadge(trial.status)
            + (trial.blinded ? '<span style="padding:2px 6px;border-radius:4px;font-size:.68rem;font-weight:700;background:rgba(155,127,255,.15);color:#9b7fff">DBL-BLIND</span>' : '')
            + '</div>'
            + '<div style="font-size:.78rem;color:var(--text-muted);display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px">'
            + '<span>IRB: <strong style="color:var(--text-secondary)">' + (trial.irbNumber || '—') + '</strong></span>'
            + '<span>Sponsor: <strong style="color:var(--text-secondary)">' + (trial.sponsor || '—') + '</strong></span>'
            + '<span>PI: <strong style="color:var(--text-secondary)">' + (trial.principalInvestigator || '—') + '</strong></span>'
            + '<span>Coordinator: <strong style="color:var(--text-secondary)">' + (trial.coordinatorName || '—') + '</strong></span>'
            + '</div>'
            + '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px"><span>Arms: </span>' + armSummary + '</div>'
            + '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:4px">Enrollment: <strong style="color:var(--text-primary)">' + stats.total + ' / ' + trial.targetEnrollment + '</strong><span style="color:var(--accent-teal);margin-left:4px">(' + stats.enrollmentPct + '%)</span></div>'
            + '<div class="trial-enrollment-bar"><div class="trial-enrollment-fill" style="width:' + Math.min(stats.enrollmentPct, 100) + '%"></div></div>'
            + '<div style="font-size:.75rem;color:var(--text-muted)">' + (trial.startDate || '?') + ' \u2192 ' + (trial.endDate || '?') + '</div>'
            + '</div>'
            + '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">'
            + '<button class="btn btn-ghost" style="font-size:.75rem;padding:4px 10px" onclick="window._trialToggleExpand(\'' + trial.id + '\')">' + (expanded ? '▲ Collapse' : '▼ View Details') + '</button>'
            + '<button class="btn btn-ghost" style="font-size:.75rem;padding:4px 10px" onclick="window._trialManageParticipants(\'' + trial.id + '\')">Manage Participants</button>'
            + (trial.status === 'active' ? '<button class="btn btn-ghost" style="font-size:.75rem;padding:4px 10px;color:#f59e0b" onclick="window._trialSetStatus(\'' + trial.id + '\',\'paused\')">Pause</button>'
              : trial.status === 'paused' ? '<button class="btn btn-ghost" style="font-size:.75rem;padding:4px 10px;color:#10b981" onclick="window._trialSetStatus(\'' + trial.id + '\',\'active\')">Resume</button>'
              : '')
            + '</div></div>'
            + expandContent
            + '</div>';
        }).join('');

    return _trialWizardHtml() + filterBar + '<div id="trial-cards">' + cards + '</div>';
  }

  function renderParticipants(trials) {
    var selId = _selectedTrialId || (trials[0] && trials[0].id) || '';
    var trial = trials.find(function(t) { return t.id === selId; });
    var participants = trial ? getTrialParticipants(selId) : [];
    var stats = trial ? trialEnrollmentStats(trial, participants) : null;

    var trialSelector = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px">'
      + '<label class="form-label" style="margin:0">Trial:</label>'
      + '<select class="form-control" style="width:auto" onchange="window._trialSelectTrial(this.value)">'
      + trials.map(function(t) { return '<option value="' + t.id + '"' + (t.id === selId ? ' selected' : '') + '>' + t.title + '</option>'; }).join('')
      + '</select>'
      + (trial ? '<button class="btn btn-primary" style="font-size:.8rem;padding:6px 14px" onclick="window._trialEnroll()">+ Enroll Participant</button>' : '')
      + '</div>';

    if (!trial) return trialSelector + '<div style="color:var(--text-muted);text-align:center;padding:40px">Select a trial above.</div>';

    var summaryBar = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">'
      + [['Total Enrolled', stats.total, 'var(--text-primary)'], ['Active', stats.active, '#10b981'], ['Completed', stats.completed, '#9b7fff'], ['Withdrawn/LTF', stats.withdrawn, '#ef4444'], ['Target', trial.targetEnrollment, 'var(--text-muted)']].map(function(item) {
          return '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:10px 16px;text-align:center;min-width:90px"><div style="font-size:1.4rem;font-weight:800;color:' + item[2] + '">' + item[1] + '</div><div style="font-size:.7rem;color:var(--text-muted)">' + item[0] + '</div></div>';
        }).join('')
      + '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:10px 16px;min-width:200px"><div style="font-size:.7rem;color:var(--text-muted);margin-bottom:6px;font-weight:700">ARM DISTRIBUTION</div>' + _armPieChart(stats.byArm) + '</div>'
      + '</div>';

    var enrollBar = '<div style="margin-bottom:14px">'
      + '<div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--text-muted);margin-bottom:3px"><span>Enrollment Progress</span><span>' + stats.total + ' / ' + trial.targetEnrollment + ' (' + stats.enrollmentPct + '%)</span></div>'
      + '<div class="trial-enrollment-bar" style="height:10px"><div class="trial-enrollment-fill" style="width:' + Math.min(stats.enrollmentPct, 100) + '%"></div></div>'
      + '</div>';

    var tableRows = participants.length === 0
      ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">No participants enrolled yet.</td></tr>'
      : participants.map(function(p) {
          var armArrIdx = trial.arms.findIndex(function(a) { return a.id === p.armId; });
          var armDisplay = (trial.blinded && p.armId)
            ? ('Arm ' + String.fromCharCode(65 + (armArrIdx >= 0 ? armArrIdx : 0)))
            : (p.armName || '—');
          var visitsDone = (p.visits || []).filter(function(v) { return v.completed; }).length;
          var visitsTotal = (p.visits || []).length;
          return '<tr id="pt-row-' + p.id + '" style="border-bottom:1px solid var(--border)">'
            + '<td style="padding:8px 10px;font-size:.83rem;font-weight:600">' + p.patientName + '</td>'
            + '<td style="padding:8px 10px;font-size:.8rem;color:var(--text-muted)">' + (p.enrollmentDate || '—') + '</td>'
            + '<td style="padding:8px 10px;font-size:.8rem">' + (p.armId ? armDisplay : '<span style="color:var(--text-muted)">Not randomized</span>') + '</td>'
            + '<td style="padding:8px 10px">' + _trialParticipantStatusBadge(p.status) + '</td>'
            + '<td style="padding:8px 10px;font-size:.8rem">' + visitsDone + '/' + visitsTotal + '</td>'
            + '<td style="padding:8px 10px"><div style="display:flex;gap:6px;flex-wrap:wrap">'
            + (!p.armId ? '<button class="btn btn-ghost" style="font-size:.72rem;padding:2px 8px" onclick="window._trialRandomize(\'' + p.id + '\')">Randomize</button>' : '')
            + '<button class="btn btn-ghost" style="font-size:.72rem;padding:2px 8px" onclick="window._trialToggleVisits(\'' + p.id + '\')">Visits</button>'
            + (p.status !== 'withdrawn' && p.status !== 'completed' ? '<button class="btn btn-ghost" style="font-size:.72rem;padding:2px 8px;color:#ef4444" onclick="window._trialWithdraw(\'' + p.id + '\')">Withdraw</button>' : '')
            + '</div>'
            + '<div id="visits-' + p.id + '" style="display:none;margin-top:8px">'
            + (p.visits || []).map(function(v, vi) {
                return '<div class="visit-row">'
                  + '<span style="color:var(--text-muted);min-width:80px">' + v.date + '</span>'
                  + '<span style="flex:1">' + v.type + '</span>'
                  + (v.completed ? '<span style="color:#10b981;font-size:.72rem;font-weight:700">\u2713 Done</span>' : '<button class="btn btn-ghost" style="font-size:.7rem;padding:1px 7px" onclick="window._trialCompleteVisit(\'' + p.id + '\',' + vi + ')">Mark Complete</button>')
                  + '</div>';
              }).join('')
            + '</div></td></tr>';
        }).join('');

    var table = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
      + '<thead><tr style="border-bottom:2px solid var(--border)">'
      + ['Patient','Enrolled','Arm' + (trial.blinded ? ' (Masked)' : ''),'Status','Visits','Actions'].map(function(h) {
          return '<th style="padding:8px 10px;text-align:left;font-size:.75rem;color:var(--text-muted);font-weight:700;text-transform:uppercase">' + h + '</th>';
        }).join('')
      + '</tr></thead><tbody>' + tableRows + '</tbody></table></div>';

    return trialSelector + _trialEnrollFormHtml(selId) + summaryBar + enrollBar + table;
  }

  function renderDataCollection(trials) {
    var selTrialId = _selectedDataTrialId || (trials[0] && trials[0].id) || '';
    var trial = trials.find(function(t) { return t.id === selTrialId; });
    var participants = trial ? getTrialParticipants(selTrialId) : [];
    var selParticipantId = (participants[0] && participants[0].id) || '';
    var dataPoints = trial ? getTrialData(selTrialId) : [];

    var selectors = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px">'
      + '<label class="form-label" style="margin:0">Trial:</label>'
      + '<select class="form-control" style="width:auto" onchange="window._trialDataSelectTrial(this.value)">'
      + trials.map(function(t) { return '<option value="' + t.id + '"' + (t.id === selTrialId ? ' selected' : '') + '>' + t.title + '</option>'; }).join('')
      + '</select></div>';

    if (!trial) return selectors + '<div style="color:var(--text-muted);text-align:center;padding:40px">Select a trial above.</div>';

    var dataForm = '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">'
      + '<strong style="display:block;margin-bottom:12px;font-size:.9rem">Record Data Point</strong>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">'
      + '<div><label class="form-label">Participant</label><select class="form-control" id="dp-participant">'
      + participants.map(function(p) { return '<option value="' + p.id + '"' + (p.id === selParticipantId ? ' selected' : '') + '>' + p.patientName + '</option>'; }).join('')
      + '</select></div>'
      + '<div><label class="form-label">Measure</label><select class="form-control" id="dp-measure">'
      + OUTCOME_MEASURES.map(function(m) { return '<option value="' + m + '">' + m + '</option>'; }).join('')
      + '</select></div>'
      + '<div><label class="form-label">Value</label><input type="number" class="form-control" id="dp-value" placeholder="e.g. 12"></div>'
      + '<div><label class="form-label">Unit</label><input class="form-control" id="dp-unit" placeholder="score/mg/Hz"></div>'
      + '<div><label class="form-label">Visit Date</label><input type="date" class="form-control" id="dp-date"></div>'
      + '<div style="grid-column:1/-1"><label class="form-label">Notes</label><input class="form-control" id="dp-notes" placeholder="Optional notes"></div>'
      + '</div>'
      + '<div id="dp-msg" style="display:none;margin-top:8px;font-size:.82rem;color:#10b981"></div>'
      + '<div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">'
      + '<button class="btn btn-primary" style="font-size:.8rem;padding:6px 14px" onclick="window._trialSaveData()">Save Data Point</button>'
      + '<button class="btn btn-ghost" style="font-size:.8rem;padding:6px 14px" onclick="window._trialExportData(\'' + selTrialId + '\')">Export CSV</button>'
      + '</div></div>';

    var chartSection = '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">'
      + '<div style="font-size:.85rem;font-weight:700;margin-bottom:12px">Outcome Over Time by Arm</div>'
      + _outcomeLineChart(dataPoints, trial.arms)
      + '</div>';

    var grouped = {};
    dataPoints.forEach(function(d) {
      if (!grouped[d.participantId]) grouped[d.participantId] = [];
      grouped[d.participantId].push(d);
    });

    var dataTableHtml = Object.keys(grouped).length === 0
      ? '<div style="text-align:center;padding:30px;color:var(--text-muted)">No data recorded yet. Use the form above to enter data.</div>'
      : Object.keys(grouped).map(function(pid) {
          var pts2 = grouped[pid];
          var pName = (participants.find(function(p) { return p.id === pid; }) || {}).patientName || pid;
          var rows2 = pts2.map(function(d) {
            return '<tr style="border-bottom:1px solid var(--border)">'
              + '<td style="padding:6px 10px;font-size:.8rem">' + (d.visitDate || '—') + '</td>'
              + '<td style="padding:6px 10px;font-size:.8rem;font-weight:600">' + d.measure + '</td>'
              + '<td style="padding:6px 10px;font-size:.8rem">' + d.value + ' ' + (d.unit || '') + '</td>'
              + '<td style="padding:6px 10px;font-size:.8rem;color:var(--text-muted)">' + (d.notes || '—') + '</td>'
              + '</tr>';
          }).join('');
          return '<div style="margin-bottom:16px"><div style="font-size:.82rem;font-weight:700;padding:6px 0;color:var(--text-secondary)">' + pName + '</div>'
            + '<table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:2px solid var(--border)">'
            + ['Date','Measure','Value','Notes'].map(function(h) { return '<th style="padding:6px 10px;text-align:left;font-size:.72rem;color:var(--text-muted);font-weight:700;text-transform:uppercase">' + h + '</th>'; }).join('')
            + '</tr></thead><tbody>' + rows2 + '</tbody></table></div>';
        }).join('');

    return selectors + dataForm + chartSection + '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:16px"><div style="font-size:.85rem;font-weight:700;margin-bottom:12px">Data Records</div>' + dataTableHtml + '</div>';
  }

  function bindHandlers() {
    window._trialTabSwitch = function(tab) { _activeTab = tab; render(); };
    window._trialFilterStatus = function(s) { _filterStatus = s; render(); };
    window._trialFilterPhase = function(p) { _filterPhase = p; render(); };

    window._trialToggleExpand = function(id) {
      _expandedTrials[id] = !_expandedTrials[id];
      render();
    };

    window._trialManageParticipants = function(id) {
      _selectedTrialId = id;
      _activeTab = 'participants';
      render();
    };

    window._trialSetStatus = function(id, status) {
      var trial = getTrials().find(function(t) { return t.id === id; });
      if (!trial) return;
      trial.status = status;
      saveTrial(trial);
      render();
    };

    window._trialNew = function() {
      _wizStep = 1;
      _wizArms = [
        { id: 'arm-' + Date.now() + '-1', name: 'Treatment', description: '', type: 'treatment' },
        { id: 'arm-' + Date.now() + '-2', name: 'Control', description: '', type: 'control' },
      ];
      _trialIdBeingEdited = null;
      var wiz = document.getElementById('trial-wizard');
      if (!wiz) return;
      wiz.style.display = 'block';
      document.getElementById('wiz-panel-1').style.display = '';
      document.getElementById('wiz-panel-2').style.display = 'none';
      document.getElementById('wiz-panel-3').style.display = 'none';
      ['wiz-step-1','wiz-step-2','wiz-step-3'].forEach(function(sid, i) {
        var el2 = document.getElementById(sid);
        if (el2) { el2.style.background = i === 0 ? 'var(--accent-teal)' : 'var(--hover-bg)'; el2.style.color = i === 0 ? '#000' : 'var(--text-muted)'; }
      });
    };

    window._trialWizNext = function(currentStep) {
      if (currentStep === 2) {
        _wizArms = [];
        document.querySelectorAll('.wiz-arm-row').forEach(function(row) {
          _wizArms.push({
            id: row.dataset.armId,
            name: row.querySelector('.arm-name').value.trim(),
            type: row.querySelector('.arm-type').value,
            description: row.querySelector('.arm-desc').value.trim(),
          });
        });
      }
      var next = currentStep + 1;
      document.getElementById('wiz-panel-' + currentStep).style.display = 'none';
      document.getElementById('wiz-panel-' + next).style.display = '';
      ['wiz-step-1','wiz-step-2','wiz-step-3'].forEach(function(sid, i) {
        var el2 = document.getElementById(sid);
        if (el2) { el2.style.background = i === next - 1 ? 'var(--accent-teal)' : 'var(--hover-bg)'; el2.style.color = i === next - 1 ? '#000' : 'var(--text-muted)'; }
      });
      if (next === 2) window._trialRenderArms();
    };

    window._trialWizBack = function(currentStep) {
      var prev = currentStep - 1;
      document.getElementById('wiz-panel-' + currentStep).style.display = 'none';
      document.getElementById('wiz-panel-' + prev).style.display = '';
      ['wiz-step-1','wiz-step-2','wiz-step-3'].forEach(function(sid, i) {
        var el2 = document.getElementById(sid);
        if (el2) { el2.style.background = i === prev - 1 ? 'var(--accent-teal)' : 'var(--hover-bg)'; el2.style.color = i === prev - 1 ? '#000' : 'var(--text-muted)'; }
      });
    };

    window._trialRenderArms = function() {
      var list = document.getElementById('wiz-arms-list');
      if (!list) return;
      list.innerHTML = _wizArms.map(function(arm) {
        return '<div class="wiz-arm-row" data-arm-id="' + arm.id + '" style="display:grid;grid-template-columns:1fr auto 2fr auto;gap:8px;margin-bottom:8px;align-items:start">'
          + '<div><label class="form-label" style="font-size:.72rem">Arm Name</label><input class="form-control arm-name" value="' + arm.name + '" placeholder="e.g. Treatment A"></div>'
          + '<div><label class="form-label" style="font-size:.72rem">Type</label><select class="form-control arm-type"><option value="treatment"' + (arm.type === 'treatment' ? ' selected' : '') + '>Treatment</option><option value="control"' + (arm.type === 'control' ? ' selected' : '') + '>Control</option><option value="comparator"' + (arm.type === 'comparator' ? ' selected' : '') + '>Comparator</option></select></div>'
          + '<div><label class="form-label" style="font-size:.72rem">Description</label><input class="form-control arm-desc" value="' + arm.description + '" placeholder="Intervention details"></div>'
          + '<div style="padding-top:22px"><button class="btn btn-ghost" style="font-size:.72rem;padding:4px 8px;color:#ef4444" onclick="window._trialRemoveArm(\'' + arm.id + '\')">\u2715</button></div>'
          + '</div>';
      }).join('');
    };

    window._trialAddArm = function() {
      _wizArms.push({ id: 'arm-' + Date.now(), name: '', type: 'treatment', description: '' });
      window._trialRenderArms();
    };

    window._trialRemoveArm = function(id) {
      _wizArms = _wizArms.filter(function(a) { return a.id !== id; });
      window._trialRenderArms();
    };

    window._trialSave = function() {
      var title = (document.getElementById('wiz-title') || {}).value;
      if (!title || !title.trim()) { alert('Please enter a trial title.'); return; }
      var arms = [];
      document.querySelectorAll('.wiz-arm-row').forEach(function(row) {
        arms.push({
          id: row.dataset.armId,
          name: row.querySelector('.arm-name').value.trim(),
          type: row.querySelector('.arm-type').value,
          description: row.querySelector('.arm-desc').value.trim(),
        });
      });
      var secRaw = (document.getElementById('wiz-secondary-outcomes') || {}).value || '';
      var incRaw = (document.getElementById('wiz-inclusion') || {}).value || '';
      var excRaw = (document.getElementById('wiz-exclusion') || {}).value || '';
      var trial = {
        id: _trialIdBeingEdited || ('trial-' + Date.now()),
        title: title.trim(),
        irbNumber: ((document.getElementById('wiz-irb') || {}).value || '').trim(),
        sponsor: ((document.getElementById('wiz-sponsor') || {}).value || '').trim(),
        phase: (document.getElementById('wiz-phase') || {}).value || 'Phase II',
        status: 'planning',
        startDate: (document.getElementById('wiz-start') || {}).value || '',
        endDate: (document.getElementById('wiz-end') || {}).value || '',
        targetEnrollment: parseInt((document.getElementById('wiz-target') || {}).value || '0') || 0,
        arms: arms.length ? arms : [{ id: 'arm-a', name: 'Treatment', type: 'treatment', description: '' }],
        primaryOutcome: ((document.getElementById('wiz-primary-outcome') || {}).value || '').trim(),
        secondaryOutcomes: secRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
        inclusionCriteria: incRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
        exclusionCriteria: excRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
        principalInvestigator: ((document.getElementById('wiz-pi') || {}).value || '').trim(),
        coordinatorName: ((document.getElementById('wiz-coord') || {}).value || '').trim(),
        blinded: !!(document.getElementById('wiz-blinded') || { checked: true }).checked,
        notes: '',
      };
      saveTrial(trial);
      document.getElementById('trial-wizard').style.display = 'none';
      render();
    };

    window._trialSelectTrial = function(id) { _selectedTrialId = id; render(); };
    window._trialDataSelectTrial = function(id) { _selectedDataTrialId = id; render(); };

    window._trialEnroll = function() {
      var form = document.getElementById('trial-enroll-form');
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    };

    window._trialSaveParticipant = function() {
      var name = ((document.getElementById('enroll-name') || {}).value || '').trim();
      var trialId = (document.getElementById('enroll-trial-id') || {}).value;
      var msg = document.getElementById('enroll-msg');
      if (!name) {
        if (msg) { msg.style.display = 'block'; msg.style.color = '#ef4444'; msg.textContent = 'Patient name is required.'; }
        return;
      }
      var p = {
        id: 'p-' + Date.now(),
        trialId: trialId,
        patientName: name,
        screeningDate: (document.getElementById('enroll-screen-date') || {}).value || new Date().toISOString().slice(0, 10),
        enrollmentDate: (document.getElementById('enroll-date') || {}).value || new Date().toISOString().slice(0, 10),
        armId: null,
        armName: null,
        status: 'screening',
        visits: [{ date: new Date().toISOString().slice(0, 10), type: 'Baseline', completed: false, notes: '' }],
        safetyNotes: '',
      };
      saveTrialParticipant(p);
      if (msg) { msg.style.display = 'block'; msg.style.color = '#10b981'; msg.textContent = '\u2713 ' + name + ' enrolled successfully.'; }
      setTimeout(function() { render(); }, 800);
    };

    window._trialRandomize = function(participantId) {
      var all = _getAllParticipants();
      var participant = all.find(function(p) { return p.id === participantId; });
      var trialId = (participant && participant.trialId) || _selectedTrialId;
      if (!trialId) return;
      var result = randomizeArm(trialId, participantId);
      if (!result) return;
      var msg2 = result.blinded ? 'Arm assigned \u2014 blinding maintained.' : ('Randomized to: ' + result.armName);
      alert(msg2);
      render();
    };

    window._trialWithdraw = function(participantId) {
      var reasons = 'Adverse event\nProtocol deviation\nPatient request\nLost to follow-up\nInvestigator decision';
      var reason = prompt('Withdrawal reason:\n' + reasons + '\n\nEnter reason:');
      if (!reason) return;
      var all = _getAllParticipants();
      var idx = all.findIndex(function(p) { return p.id === participantId; });
      if (idx < 0) return;
      all[idx].status = 'withdrawn';
      all[idx].safetyNotes = (all[idx].safetyNotes ? all[idx].safetyNotes + '; ' : '') + 'Withdrawn: ' + reason;
      localStorage.setItem(TRIAL_PARTICIPANTS_KEY, JSON.stringify(all));
      render();
    };

    window._trialCompleteVisit = function(participantId, visitIdx) {
      var all = _getAllParticipants();
      var idx = all.findIndex(function(p) { return p.id === participantId; });
      if (idx < 0 || !all[idx].visits[visitIdx]) return;
      all[idx].visits[visitIdx].completed = true;
      localStorage.setItem(TRIAL_PARTICIPANTS_KEY, JSON.stringify(all));
      render();
    };

    window._trialToggleVisits = function(participantId) {
      var el2 = document.getElementById('visits-' + participantId);
      if (el2) el2.style.display = el2.style.display === 'none' ? 'block' : 'none';
    };

    window._trialSaveData = function() {
      var participantId = (document.getElementById('dp-participant') || {}).value || '';
      var measure = (document.getElementById('dp-measure') || {}).value || '';
      var value = (document.getElementById('dp-value') || {}).value || '';
      var unit = (document.getElementById('dp-unit') || {}).value || '';
      var visitDate = (document.getElementById('dp-date') || {}).value || '';
      var notes = (document.getElementById('dp-notes') || {}).value || '';
      var msg = document.getElementById('dp-msg');
      if (!participantId || !measure || !value || !visitDate) {
        if (msg) { msg.style.display = 'block'; msg.style.color = '#ef4444'; msg.textContent = 'Participant, measure, value and date are required.'; }
        return;
      }
      var participant = _getAllParticipants().find(function(p) { return p.id === participantId; });
      var trialId = _selectedDataTrialId || (participant && participant.trialId) || '';
      var point = {
        id: 'dp-' + Date.now(),
        trialId: trialId,
        participantId: participantId,
        armId: participant ? participant.armId : '',
        visitDate: visitDate,
        measure: measure,
        value: parseFloat(value),
        unit: unit,
        notes: notes,
      };
      saveTrialDataPoint(point);
      if (msg) { msg.style.display = 'block'; msg.style.color = '#10b981'; msg.textContent = '\u2713 Data point saved.'; }
      setTimeout(function() { render(); }, 600);
    };

    window._trialExportData = function(trialId) {
      var trial = getTrials().find(function(t) { return t.id === trialId; });
      var dataPoints = getTrialData(trialId);
      var participants = getTrialParticipants(trialId);
      if (dataPoints.length === 0) { alert('No data points to export.'); return; }
      var header = 'Trial,Participant,Arm,Visit Date,Measure,Value,Unit,Notes';
      var rows = dataPoints.map(function(d) {
        var p = participants.find(function(x) { return x.id === d.participantId; });
        return [
          trial ? trial.title : trialId,
          p ? p.patientName : d.participantId,
          p ? (p.armName || '') : '',
          d.visitDate,
          d.measure,
          d.value,
          d.unit || '',
          (d.notes || '').replace(/,/g, ';'),
        ].map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
      });
      var csv = [header].concat(rows).join('\n');
      var blob = new Blob([csv], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'trial-data-' + trialId + '-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  render();
}

// ── Staff Scheduling ──────────────────────────────────────────────────────────

const STAFF_KEY = 'ds_staff_roster';
const SHIFTS_KEY = 'ds_shifts';
const PTO_KEY = 'ds_pto_requests';
const SWAP_KEY = 'ds_shift_swaps';

function _staffId() { return 'st_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
function _shiftId() { return 'sh_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
function _ptoId()   { return 'pto_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
function _swapId()  { return 'sw_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

function _isoDate(d) {
  var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function _addDays(dateStr, n) {
  var d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return _isoDate(d);
}
function _mondayOf(dateStr) {
  var d = new Date(dateStr + 'T12:00:00');
  var day = d.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return _isoDate(d);
}
function _todayIso() { return _isoDate(new Date()); }
function _hoursFromRange(range) {
  if (!range) return 0;
  var parts = range.split('-');
  if (parts.length !== 2) return 0;
  var s = parts[0].split(':').map(Number), e = parts[1].split(':').map(Number);
  return (e[0] * 60 + e[1] - s[0] * 60 - s[1]) / 60;
}

function getStaffRoster() {
  try { var d = JSON.parse(localStorage.getItem(STAFF_KEY) || 'null'); if (d && d.length) return d; } catch (_e) { /* fall through */ }
  var seed = [
    { id: _staffId(), name: 'Dr. Sarah Chen', role: 'clinician', email: 'schen@clinic.com', phone: '555-0101', color: '#10b981',
      defaultHours: { mon: '09:00-17:00', tue: '09:00-17:00', wed: '09:00-17:00', thu: '09:00-17:00', fri: '09:00-15:00' },
      maxHoursPerWeek: 40, contractType: 'full-time', skills: ['neurofeedback', 'tms', 'tdcs'] },
    { id: _staffId(), name: 'Dr. Raj Patel', role: 'clinician', email: 'rpatel@clinic.com', phone: '555-0102', color: '#6366f1',
      defaultHours: { mon: '08:00-16:00', tue: '08:00-16:00', wed: null, thu: '08:00-16:00', fri: '08:00-16:00' },
      maxHoursPerWeek: 32, contractType: 'part-time', skills: ['tms', 'emdr', 'biofeedback'] },
    { id: _staffId(), name: 'NP Jordan Rodriguez', role: 'clinician', email: 'jrodriguez@clinic.com', phone: '555-0103', color: '#f59e0b',
      defaultHours: { mon: '10:00-18:00', tue: '10:00-18:00', wed: '10:00-18:00', thu: null, fri: '10:00-18:00' },
      maxHoursPerWeek: 36, contractType: 'full-time', skills: ['neurofeedback', 'cranial-stim'] },
    { id: _staffId(), name: 'Alex Kim', role: 'technician', email: 'akim@clinic.com', phone: '555-0104', color: '#3b82f6',
      defaultHours: { mon: '08:00-17:00', tue: '08:00-17:00', wed: '08:00-17:00', thu: '08:00-17:00', fri: '08:00-17:00' },
      maxHoursPerWeek: 40, contractType: 'full-time', skills: ['qeeg', 'tdcs', 'device-maintenance'] },
    { id: _staffId(), name: 'Jamie Scott', role: 'receptionist', email: 'jscott@clinic.com', phone: '555-0105', color: '#ec4899',
      defaultHours: { mon: '08:30-17:00', tue: '08:30-17:00', wed: '08:30-17:00', thu: '08:30-17:00', fri: '08:30-16:00' },
      maxHoursPerWeek: 40, contractType: 'full-time', skills: ['scheduling', 'billing', 'patient-intake'] },
    { id: _staffId(), name: 'Morgan Lee', role: 'supervisor', email: 'mlee@clinic.com', phone: '555-0106', color: '#8b5cf6',
      defaultHours: { mon: '09:00-17:00', tue: '09:00-17:00', wed: '09:00-17:00', thu: '09:00-17:00', fri: '09:00-17:00' },
      maxHoursPerWeek: 40, contractType: 'full-time', skills: ['neurofeedback', 'tms', 'supervision', 'training'] },
  ];
  localStorage.setItem(STAFF_KEY, JSON.stringify(seed));
  return seed;
}

function saveStaffMember(member) {
  var roster = getStaffRoster();
  var idx = roster.findIndex(function(s) { return s.id === member.id; });
  if (idx >= 0) roster[idx] = member; else roster.push(member);
  localStorage.setItem(STAFF_KEY, JSON.stringify(roster));
}

function getShifts() {
  try { var d = JSON.parse(localStorage.getItem(SHIFTS_KEY) || 'null'); if (d && d.length) return d; } catch (_e) { /* fall through */ }
  var staff = getStaffRoster();
  var today = _todayIso();
  var mon = _mondayOf(today);
  var prevMon = _addDays(mon, -7);
  var nextMon = _addDays(mon, 7);
  var shifts = [];
  var dayOffsets = [0, 1, 2, 3, 4];
  var weekStarts = [prevMon, mon, nextMon];
  var rooms = ['Room A', 'Room B', 'Room C', 'Lab 1', 'Lab 2', 'Front Desk'];
  var dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
  weekStarts.forEach(function(ws) {
    staff.forEach(function(s) {
      dayOffsets.forEach(function(d) {
        var dayDate = _addDays(ws, d);
        var hrs = s.defaultHours && s.defaultHours[dayKeys[d]];
        if (!hrs) return;
        var parts = hrs.split('-');
        var room = rooms[Math.floor(Math.random() * rooms.length)];
        var type = s.role === 'receptionist' ? 'admin' : (d === 2 && s.role === 'technician' ? 'training' : 'clinical');
        shifts.push({
          id: _shiftId(), staffId: s.id, staffName: s.name,
          date: dayDate, startTime: parts[0], endTime: parts[1],
          room: room, type: type, notes: '',
          status: dayDate < today ? 'completed' : 'scheduled'
        });
      });
    });
  });
  localStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts));
  return shifts;
}

function saveShift(shift) {
  var shifts = getShifts();
  var idx = shifts.findIndex(function(s) { return s.id === shift.id; });
  if (idx >= 0) shifts[idx] = shift; else shifts.push(shift);
  localStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts));
}

function deleteShift(id) {
  var shifts = getShifts().filter(function(s) { return s.id !== id; });
  localStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts));
}

function getPTORequests() {
  try { var d = JSON.parse(localStorage.getItem(PTO_KEY) || 'null'); if (d && d.length) return d; } catch (_e) { /* fall through */ }
  var staff = getStaffRoster();
  var today = _todayIso();
  var seed = [
    { id: _ptoId(), staffId: staff[0].id, staffName: staff[0].name,
      startDate: _addDays(today, 10), endDate: _addDays(today, 14),
      type: 'vacation', status: 'pending', reason: 'Annual family vacation', approvedBy: null },
    { id: _ptoId(), staffId: staff[1].id, staffName: staff[1].name,
      startDate: _addDays(today, -5), endDate: _addDays(today, -3),
      type: 'sick', status: 'approved', reason: 'Flu recovery', approvedBy: 'Morgan Lee' },
    { id: _ptoId(), staffId: staff[2].id, staffName: staff[2].name,
      startDate: _addDays(today, 21), endDate: _addDays(today, 25),
      type: 'vacation', status: 'approved', reason: 'Conference attendance', approvedBy: 'Morgan Lee' },
    { id: _ptoId(), staffId: staff[4].id, staffName: staff[4].name,
      startDate: _addDays(today, 3), endDate: _addDays(today, 3),
      type: 'personal', status: 'pending', reason: 'Personal appointment', approvedBy: null },
  ];
  localStorage.setItem(PTO_KEY, JSON.stringify(seed));
  return seed;
}

function savePTORequest(req) {
  var reqs = getPTORequests();
  var idx = reqs.findIndex(function(r) { return r.id === req.id; });
  if (idx >= 0) reqs[idx] = req; else reqs.push(req);
  localStorage.setItem(PTO_KEY, JSON.stringify(reqs));
}

function updatePTOStatus(id, status) {
  var reqs = getPTORequests();
  var req = reqs.find(function(r) { return r.id === id; });
  if (req) { req.status = status; req.approvedBy = status === 'approved' ? 'Morgan Lee' : null; }
  localStorage.setItem(PTO_KEY, JSON.stringify(reqs));
}

function getSwapRequests() {
  try { var d = JSON.parse(localStorage.getItem(SWAP_KEY) || 'null'); if (d && d.length) return d; } catch (_e) { /* fall through */ }
  var staff = getStaffRoster();
  var shifts = getShifts();
  var today = _todayIso();
  var futureShifts = shifts.filter(function(s) { return s.date >= today; });
  var s0Shifts = futureShifts.filter(function(s) { return s.staffId === staff[0].id; });
  var s1Shifts = futureShifts.filter(function(s) { return s.staffId === staff[1].id; });
  var s2Shifts = futureShifts.filter(function(s) { return s.staffId === staff[2].id; });
  var s3Shifts = futureShifts.filter(function(s) { return s.staffId === staff[3].id; });
  var seed = [
    { id: _swapId(), requestorId: staff[0].id, requestorName: staff[0].name,
      requestorShiftId: (s0Shifts[0] || {}).id || '', coverId: staff[1].id, coverName: staff[1].name,
      coverShiftId: (s1Shifts[0] || {}).id || '', reason: 'Medical appointment conflict', status: 'pending' },
    { id: _swapId(), requestorId: staff[2].id, requestorName: staff[2].name,
      requestorShiftId: (s2Shifts[0] || {}).id || '', coverId: staff[3].id, coverName: staff[3].name,
      coverShiftId: (s3Shifts[0] || {}).id || '', reason: 'Personal scheduling conflict', status: 'approved' },
  ];
  localStorage.setItem(SWAP_KEY, JSON.stringify(seed));
  return seed;
}

function saveSwapRequest(req) {
  var reqs = getSwapRequests();
  var idx = reqs.findIndex(function(r) { return r.id === req.id; });
  if (idx >= 0) reqs[idx] = req; else reqs.push(req);
  localStorage.setItem(SWAP_KEY, JSON.stringify(reqs));
}

function updateSwapStatus(id, status) {
  var reqs = getSwapRequests();
  var req = reqs.find(function(r) { return r.id === id; });
  if (req) req.status = status;
  localStorage.setItem(SWAP_KEY, JSON.stringify(reqs));
}

// ── Coverage Analyzer ─────────────────────────────────────────────────────────
function analyzeCoverage(shifts, staff, weekStart) {
  var days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var byDay = {};
  var warnings = [];
  days.forEach(function(day, i) {
    var dateStr = _addDays(weekStart, i);
    var dayShifts = shifts.filter(function(s) { return s.date === dateStr && s.status !== 'cancelled'; });
    var staffIds = Array.from(new Set(dayShifts.map(function(s) { return s.staffId; })));
    var rooms = Array.from(new Set(dayShifts.map(function(s) { return s.room; }).filter(Boolean)));
    var clinicians = dayShifts.filter(function(s) {
      var member = staff.find(function(m) { return m.id === s.staffId; });
      return member && member.role === 'clinician';
    });
    byDay[day] = { date: dateStr, staffCount: staffIds.length, rooms: rooms, shifts: dayShifts, clinicianCount: clinicians.length };
    if (i < 5) {
      if (clinicians.length === 0) warnings.push(dayLabels[i] + ' has no clinician scheduled');
      if (staffIds.length === 1) warnings.push(dayLabels[i] + ' has only 1 staff member (minimum 2 required)');
      if (staffIds.length === 0) warnings.push(dayLabels[i] + ' has no staff scheduled');
    }
  });
  return { byDay: byDay, warnings: warnings };
}

// ── Auto-Schedule Suggestion ──────────────────────────────────────────────────
function suggestSchedule(staff, weekStart, existingShifts) {
  var days = ['mon', 'tue', 'wed', 'thu', 'fri'];
  var rooms = ['Room A', 'Room B', 'Room C', 'Lab 1', 'Lab 2'];
  var suggestions = [];
  staff.forEach(function(member) {
    days.forEach(function(day, i) {
      var dateStr = _addDays(weekStart, i);
      var alreadyHasShift = existingShifts.some(function(s) {
        return s.staffId === member.id && s.date === dateStr && s.status !== 'cancelled';
      });
      if (alreadyHasShift) return;
      var hrs = member.defaultHours && member.defaultHours[day];
      if (!hrs) return;
      var parts = hrs.split('-');
      suggestions.push({
        id: _shiftId(), staffId: member.id, staffName: member.name,
        date: dateStr, startTime: parts[0], endTime: parts[1],
        room: rooms[Math.floor(Math.random() * rooms.length)],
        type: member.role === 'receptionist' ? 'admin' : 'clinical',
        notes: 'Auto-suggested', status: 'scheduled', _suggested: true
      });
    });
  });
  return suggestions;
}

// ── Display Helpers ───────────────────────────────────────────────────────────
function _fmtDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function _fmtDateLong(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function _roleBadge(role) {
  var colors = { clinician: '#10b981', technician: '#3b82f6', receptionist: '#ec4899', supervisor: '#8b5cf6', admin: '#f59e0b' };
  var bg = colors[role] || '#6b7280';
  return '<span style="background:' + bg + '22;color:' + bg + ';padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:700">' + (role || '—') + '</span>';
}
function _staffStatusBadge(status) {
  var cfg = {
    scheduled: '#3b82f6', confirmed: '#10b981', completed: '#6b7280',
    'no-show': '#ef4444', cancelled: '#9ca3af', pending: '#f59e0b',
    approved: '#10b981', denied: '#ef4444'
  };
  var c = cfg[status] || '#6b7280';
  return '<span style="color:' + c + ';padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:700;border:1px solid ' + c + '44">' + (status || '—') + '</span>';
}
function _calcWeekHours(staffId, shifts, weekStart) {
  var total = 0;
  for (var i = 0; i < 7; i++) {
    var dateStr = _addDays(weekStart, i);
    shifts.filter(function(s) { return s.staffId === staffId && s.date === dateStr && s.status !== 'cancelled'; })
      .forEach(function(s) { total += _hoursFromRange(s.startTime + '-' + s.endTime); });
  }
  return total;
}
function _ptoUsed(staffId, type, ptoRequests) {
  return ptoRequests
    .filter(function(r) { return r.staffId === staffId && r.type === type && r.status === 'approved'; })
    .reduce(function(acc, r) {
      var d1 = new Date(r.startDate + 'T12:00:00'), d2 = new Date(r.endDate + 'T12:00:00');
      return acc + Math.round((d2 - d1) / 86400000) + 1;
    }, 0);
}

// ── Modal Helpers ─────────────────────────────────────────────────────────────
function _ssOpenModal(html) {
  var existing = document.getElementById('_staff-modal');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = '_staff-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = '<div style="background:var(--card-bg,#1e293b);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto">' + html + '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) _ssCloseModal(); });
  document.body.appendChild(overlay);
}
function _ssCloseModal() {
  var m = document.getElementById('_staff-modal');
  if (m) m.remove();
}

// ── Main Exported Page ────────────────────────────────────────────────────────
export async function pgStaffScheduling(setTopbar) {
  setTopbar('Staff Scheduling & Shifts', '<button class="btn btn-ghost btn-sm" onclick="window._staffAutoSchedule()">⚡ Auto-Schedule</button>');
  var el = document.getElementById('content');

  if (!window._staffWeekStart) window._staffWeekStart = _mondayOf(_todayIso());
  if (!window._staffActiveTab) window._staffActiveTab = 'schedule';

  function render() {
    var ws = window._staffWeekStart;
    var staff = getStaffRoster();
    var shifts = getShifts();
    var ptoReqs = getPTORequests();
    var swapReqs = getSwapRequests();
    var activeTab = window._staffActiveTab;

    var tabs = [
      { id: 'schedule', label: '📅 Weekly Schedule' },
      { id: 'roster',   label: '👤 Staff Roster' },
      { id: 'pto',      label: '🏖 PTO & Leave' },
      { id: 'swaps',    label: '🔄 Shift Swaps' },
    ];

    el.innerHTML =
      '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
      tabs.map(function(t) {
        return '<button class="btn btn-sm ' + (activeTab === t.id ? '' : 'btn-ghost') + '" onclick="window._staffTab(\'' + t.id + '\')">' + t.label + '</button>';
      }).join('') +
      '</div><div id="_staff-tab-body"></div>';

    var body = document.getElementById('_staff-tab-body');
    if (activeTab === 'schedule') body.innerHTML = renderScheduleTab(ws, staff, shifts);
    else if (activeTab === 'roster') body.innerHTML = renderRosterTab(staff, shifts, ws);
    else if (activeTab === 'pto') body.innerHTML = renderPTOTab(ptoReqs, staff);
    else if (activeTab === 'swaps') body.innerHTML = renderSwapsTab(swapReqs, shifts, staff);
  }

  // ── Schedule Tab ─────────────────────────────────────────────────────────
  function renderScheduleTab(ws, staff, shifts) {
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var dates = days.map(function(_, i) { return _addDays(ws, i); });
    var coverage = analyzeCoverage(shifts, staff, ws);
    var gridCols = '180px repeat(7, 1fr)';
    var todayStr = _todayIso();

    var headerCells = '<div class="staff-grid-name" style="background:var(--hover-bg)">Staff</div>' +
      days.map(function(day, i) {
        var d = dates[i];
        var isToday = d === todayStr;
        return '<div style="padding:8px;text-align:center;font-size:.8rem;font-weight:600;border-right:1px solid var(--border);' +
          (isToday ? 'color:var(--accent-teal,#00d4bc);' : 'color:var(--text-muted)') + '">' +
          day + '<br><span style="font-size:.75rem;opacity:.7">' + _fmtDate(d) + '</span></div>';
      }).join('');

    var rows = staff.map(function(member) {
      var weekHrs = _calcWeekHours(member.id, shifts, ws);
      var max = member.maxHoursPerWeek || 40;
      var hrsClass = weekHrs > max ? 'staff-hours-over' : weekHrs < max * 0.75 ? 'staff-hours-under' : 'staff-hours-ok';
      var nameCell =
        '<div class="staff-grid-name" style="flex-direction:column;align-items:flex-start">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + member.color + ';flex-shrink:0"></span>' +
        '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">' + member.name + '</span></div>' +
        '<div style="font-size:.7rem;color:var(--text-muted)">' + _roleBadge(member.role) + '</div>' +
        '<div class="' + hrsClass + '" style="font-size:.68rem;margin-top:2px">' + weekHrs.toFixed(1) + '/' + max + 'h</div></div>';

      var dayCells = dates.map(function(dateStr) {
        var dayShifts = shifts.filter(function(s) { return s.staffId === member.id && s.date === dateStr && s.status !== 'cancelled'; });
        var blocks = dayShifts.map(function(s) {
          return '<div class="staff-shift-block" style="background:' + member.color + '" onclick="event.stopPropagation();window._staffEditShift(\'' + s.id + '\')">' +
            s.startTime + '–' + s.endTime + '<br>' + (s.room || '') + '</div>';
        }).join('');
        var addBtn = '<div style="font-size:.65rem;color:var(--text-muted);text-align:center;padding-top:4px;opacity:.5">+ add</div>';
        return '<div class="staff-grid-cell" onclick="window._staffAddShift(\'' + member.id + '\',\'' + dateStr + '\')">' +
          blocks + (dayShifts.length === 0 ? addBtn : '') + '</div>';
      }).join('');

      return '<div class="staff-grid-row" style="grid-template-columns:' + gridCols + '">' + nameCell + dayCells + '</div>';
    }).join('');

    var warningHtml = coverage.warnings.length === 0
      ? '<div style="color:var(--text-muted);font-size:.82rem">No coverage issues this week.</div>'
      : coverage.warnings.map(function(w) { return '<div class="coverage-warning">⚠ ' + w + '</div>'; }).join('');

    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">' +
      '<button class="btn btn-sm btn-ghost" onclick="window._staffWeekPrev()">← Prev</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="window._staffWeekToday()">This Week</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="window._staffWeekNext()">Next →</button>' +
      '<span style="font-weight:600;font-size:.9rem">Week of ' + _fmtDate(ws) + ' – ' + _fmtDate(_addDays(ws, 6)) + '</span></div>' +
      '<div style="overflow-x:auto;margin-bottom:16px"><div class="staff-grid" style="min-width:700px">' +
      '<div class="staff-grid-header" style="grid-template-columns:' + gridCols + '">' + headerCells + '</div>' +
      rows + '</div></div>' +
      '<div style="margin-bottom:16px"><div style="font-weight:600;margin-bottom:8px;font-size:.85rem">Coverage Analysis</div>' +
      warningHtml + '</div>';
  }

  // ── Roster Tab ────────────────────────────────────────────────────────────
  function renderRosterTab(staff, shifts, ws) {
    var cards = staff.map(function(member) {
      var weekHrs = _calcWeekHours(member.id, shifts, ws);
      var skills = (member.skills || []).map(function(sk) { return '<span class="skill-tag">' + sk + '</span>'; }).join('');
      return '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:16px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:' + member.color + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:.9rem">' + member.name.charAt(0) + '</div>' +
        '<div style="flex:1"><div style="font-weight:600">' + member.name + '</div><div>' + _roleBadge(member.role) + '</div></div>' +
        '<button class="btn btn-sm btn-ghost" onclick="window._staffEditMember(\'' + member.id + '\')">Edit</button></div>' +
        '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:6px">' + (member.email || '') + ' · ' + (member.phone || '') + '</div>' +
        '<div style="font-size:.78rem;margin-bottom:8px"><span style="color:var(--text-muted)">Contract:</span> ' + (member.contractType || '') + ' · ' + (member.maxHoursPerWeek || 40) + 'h/wk</div>' +
        '<div style="margin-bottom:8px">' + (skills || '<span style="color:var(--text-muted);font-size:.75rem">No skills listed</span>') + '</div>' +
        '<div style="font-size:.75rem;color:var(--text-muted)">This week: ' + weekHrs.toFixed(1) + 'h</div></div>';
    }).join('');

    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
      '<span style="font-weight:600">' + staff.length + ' Staff Members</span>' +
      '<button class="btn btn-sm" onclick="window._staffNew()">+ Add Staff Member</button></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">' + cards + '</div>';
  }

  // ── PTO Tab ───────────────────────────────────────────────────────────────
  function renderPTOTab(ptoReqs, staff) {
    var sorted = ptoReqs.slice().sort(function(a, b) { return a.startDate < b.startDate ? 1 : -1; });
    var ptoTotals = { vacation: 15, sick: 10, personal: 5 };

    var requestRows = sorted.map(function(req) {
      var actionBtns = req.status === 'pending'
        ? '<button class="btn btn-sm" style="background:#10b981;margin-left:8px" onclick="window._staffApprovePTO(\'' + req.id + '\')">Approve</button>' +
          '<button class="btn btn-sm btn-ghost" style="color:#ef4444;margin-left:4px" onclick="window._staffDenyPTO(\'' + req.id + '\')">Deny</button>'
        : '';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">' +
        '<div style="flex:1;min-width:160px"><div style="font-weight:600;font-size:.85rem">' + req.staffName + '</div>' +
        '<div style="font-size:.78rem;color:var(--text-muted)">' + _fmtDate(req.startDate) + ' – ' + _fmtDate(req.endDate) + '</div>' +
        '<div style="font-size:.75rem;color:var(--text-muted)">' + (req.reason || '') + '</div></div>' +
        '<span class="skill-tag">' + req.type + '</span>' + _staffStatusBadge(req.status) + actionBtns + '</div>';
    }).join('');

    function ptoBar(used, total) {
      var pct = Math.min(100, Math.round(used / total * 100));
      return '<div class="pto-balance-bar"><div class="pto-balance-fill" style="width:' + pct + '%"></div></div>';
    }

    var balanceCards = staff.map(function(member) {
      var vUsed = _ptoUsed(member.id, 'vacation', ptoReqs);
      var sUsed = _ptoUsed(member.id, 'sick', ptoReqs);
      var pUsed = _ptoUsed(member.id, 'personal', ptoReqs);
      return '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:12px">' +
        '<div style="font-weight:600;font-size:.85rem;margin-bottom:8px">' + member.name + '</div>' +
        '<div style="font-size:.75rem;margin-bottom:4px">Vacation: ' + (ptoTotals.vacation - vUsed) + '/' + ptoTotals.vacation + 'd remaining' + ptoBar(vUsed, ptoTotals.vacation) + '</div>' +
        '<div style="font-size:.75rem;margin-bottom:4px">Sick: ' + (ptoTotals.sick - sUsed) + '/' + ptoTotals.sick + 'd remaining' + ptoBar(sUsed, ptoTotals.sick) + '</div>' +
        '<div style="font-size:.75rem">Personal: ' + (ptoTotals.personal - pUsed) + '/' + ptoTotals.personal + 'd remaining' + ptoBar(pUsed, ptoTotals.personal) + '</div></div>';
    }).join('');

    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
      '<span style="font-weight:600">PTO Requests (' + ptoReqs.length + ')</span>' +
      '<button class="btn btn-sm" onclick="window._staffRequestPTO()">+ Request PTO</button></div>' +
      '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:20px">' +
      (requestRows || '<div style="color:var(--text-muted);font-size:.85rem">No PTO requests</div>') + '</div>' +
      '<div style="font-weight:600;margin-bottom:10px">PTO Balances</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">' + balanceCards + '</div>';
  }

  // ── Swaps Tab ─────────────────────────────────────────────────────────────
  function renderSwapsTab(swapReqs, shifts, staff) {
    function shiftLabel(shiftId) {
      var s = shifts.find(function(x) { return x.id === shiftId; });
      return s ? _fmtDateLong(s.date) + ' ' + s.startTime + '–' + s.endTime : 'Unknown shift';
    }
    var cards = swapReqs.map(function(req) {
      var actionBtns = req.status === 'pending'
        ? '<button class="btn btn-sm" style="background:#10b981;margin-left:8px" onclick="window._staffApproveSwap(\'' + req.id + '\')">Approve</button>' +
          '<button class="btn btn-sm btn-ghost" style="color:#ef4444;margin-left:4px" onclick="window._staffDenySwap(\'' + req.id + '\')">Deny</button>'
        : '';
      var notif = req.status === 'approved'
        ? '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px">Cover clinician will be notified via messaging</div>'
        : '';
      return '<div class="swap-card">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px">' +
        '<div><div style="font-weight:600;font-size:.85rem">' + req.requestorName + '</div>' +
        '<div style="font-size:.75rem;color:var(--text-muted)">' + shiftLabel(req.requestorShiftId) + '</div></div>' +
        '<span class="swap-arrow">⇄</span>' +
        '<div><div style="font-weight:600;font-size:.85rem">' + req.coverName + '</div>' +
        '<div style="font-size:.75rem;color:var(--text-muted)">' + shiftLabel(req.coverShiftId) + '</div></div></div>' +
        '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px">Reason: ' + (req.reason || '') + '</div>' +
        '<div style="display:flex;align-items:center">' + _staffStatusBadge(req.status) + actionBtns + '</div>' + notif + '</div>';
    }).join('');

    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
      '<span style="font-weight:600">Shift Swap Requests (' + swapReqs.length + ')</span>' +
      '<button class="btn btn-sm" onclick="window._staffRequestSwap()">Request Swap</button></div>' +
      (cards || '<div style="color:var(--text-muted);font-size:.85rem">No swap requests</div>');
  }

  // ── Window Handlers ───────────────────────────────────────────────────────
  window._staffTab = function(tabId) { window._staffActiveTab = tabId; render(); };
  window._staffWeekPrev  = function() { window._staffWeekStart = _addDays(window._staffWeekStart, -7); render(); };
  window._staffWeekNext  = function() { window._staffWeekStart = _addDays(window._staffWeekStart, 7); render(); };
  window._staffWeekToday = function() { window._staffWeekStart = _mondayOf(_todayIso()); render(); };

  window._staffAddShift = function(staffId, dateStr) {
    var staff = getStaffRoster();
    var staffOptions = staff.map(function(s) {
      return '<option value="' + s.id + '"' + (s.id === staffId ? ' selected' : '') + '>' + s.name + '</option>';
    }).join('');
    _ssOpenModal(
      '<div style="font-weight:700;font-size:1rem;margin-bottom:16px">Add Shift</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Staff Member</label>' +
      '<select class="form-control" id="_sh-staff">' + staffOptions + '</select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Date</label>' +
      '<input class="form-control" type="date" id="_sh-date" value="' + (dateStr || _todayIso()) + '"></div>' +
      '<div style="display:flex;gap:8px">' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Start Time</label>' +
      '<input class="form-control" type="time" id="_sh-start" value="09:00"></div>' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">End Time</label>' +
      '<input class="form-control" type="time" id="_sh-end" value="17:00"></div></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Room</label>' +
      '<select class="form-control" id="_sh-room"><option>Room A</option><option>Room B</option><option>Room C</option><option>Lab 1</option><option>Lab 2</option><option>Front Desk</option></select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Shift Type</label>' +
      '<select class="form-control" id="_sh-type"><option value="clinical">Clinical</option><option value="admin">Admin</option><option value="training">Training</option><option value="on-call">On-Call</option><option value="coverage">Coverage</option></select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Notes</label>' +
      '<input class="form-control" id="_sh-notes" placeholder="Optional notes..."></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
      '<button class="btn btn-ghost btn-sm" onclick="window._staffCloseModal()">Cancel</button>' +
      '<button class="btn btn-sm" onclick="window._staffSaveShift(null)">Save Shift</button></div>'
    );
  };

  window._staffEditShift = function(shiftId) {
    var shifts = getShifts();
    var s = shifts.find(function(x) { return x.id === shiftId; });
    if (!s) return;
    var staff = getStaffRoster();
    var staffOptions = staff.map(function(m) {
      return '<option value="' + m.id + '"' + (m.id === s.staffId ? ' selected' : '') + '>' + m.name + '</option>';
    }).join('');
    var roomOpts = ['Room A', 'Room B', 'Room C', 'Lab 1', 'Lab 2', 'Front Desk'].map(function(r) {
      return '<option' + (r === s.room ? ' selected' : '') + '>' + r + '</option>';
    }).join('');
    var typeOpts = ['clinical', 'admin', 'training', 'on-call', 'coverage'].map(function(t) {
      return '<option value="' + t + '"' + (t === s.type ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
    var statusOpts = ['scheduled', 'confirmed', 'completed', 'no-show', 'cancelled'].map(function(st) {
      return '<option value="' + st + '"' + (st === s.status ? ' selected' : '') + '>' + st + '</option>';
    }).join('');
    _ssOpenModal(
      '<div style="font-weight:700;font-size:1rem;margin-bottom:16px">Edit Shift</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Staff Member</label>' +
      '<select class="form-control" id="_sh-staff">' + staffOptions + '</select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Date</label>' +
      '<input class="form-control" type="date" id="_sh-date" value="' + s.date + '"></div>' +
      '<div style="display:flex;gap:8px">' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Start Time</label>' +
      '<input class="form-control" type="time" id="_sh-start" value="' + s.startTime + '"></div>' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">End Time</label>' +
      '<input class="form-control" type="time" id="_sh-end" value="' + s.endTime + '"></div></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Room</label>' +
      '<select class="form-control" id="_sh-room">' + roomOpts + '</select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Type</label>' +
      '<select class="form-control" id="_sh-type">' + typeOpts + '</select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Status</label>' +
      '<select class="form-control" id="_sh-status">' + statusOpts + '</select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Notes</label>' +
      '<input class="form-control" id="_sh-notes" value="' + (s.notes || '') + '"></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:space-between">' +
      '<button class="btn btn-sm btn-ghost" style="color:#ef4444" onclick="window._staffDeleteShift(\'' + shiftId + '\')">Delete</button>' +
      '<div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" onclick="window._staffCloseModal()">Cancel</button>' +
      '<button class="btn btn-sm" onclick="window._staffSaveShift(\'' + shiftId + '\')">Save</button></div></div>'
    );
  };

  window._staffSaveShift = function(existingId) {
    var staffId = document.getElementById('_sh-staff') ? document.getElementById('_sh-staff').value : '';
    var date = document.getElementById('_sh-date') ? document.getElementById('_sh-date').value : '';
    var startTime = document.getElementById('_sh-start') ? document.getElementById('_sh-start').value : '';
    var endTime = document.getElementById('_sh-end') ? document.getElementById('_sh-end').value : '';
    var room = document.getElementById('_sh-room') ? document.getElementById('_sh-room').value : '';
    var type = document.getElementById('_sh-type') ? document.getElementById('_sh-type').value : 'clinical';
    var statusEl = document.getElementById('_sh-status');
    var status = statusEl ? statusEl.value : 'scheduled';
    var notes = document.getElementById('_sh-notes') ? document.getElementById('_sh-notes').value : '';
    if (!date || !startTime || !endTime) { alert('Please fill in date and times'); return; }
    var staff = getStaffRoster();
    var member = staff.find(function(s) { return s.id === staffId; });
    saveShift({
      id: existingId || _shiftId(),
      staffId: staffId, staffName: member ? member.name : '',
      date: date, startTime: startTime, endTime: endTime,
      room: room, type: type, notes: notes, status: status
    });
    _ssCloseModal();
    render();
  };

  window._staffDeleteShift = function(id) {
    if (!confirm('Delete this shift?')) return;
    deleteShift(id);
    _ssCloseModal();
    render();
  };

  window._staffAutoSchedule = function() {
    var staff = getStaffRoster();
    var shifts = getShifts();
    var ws = window._staffWeekStart;
    var suggestions = suggestSchedule(staff, ws, shifts);
    if (suggestions.length === 0) {
      alert('All staff members already have shifts this week. No suggestions to make.');
      return;
    }
    var rows = suggestions.map(function(s, i) {
      var member = staff.find(function(m) { return m.id === s.staffId; });
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">' +
        '<input type="checkbox" id="_sg-' + i + '" checked style="flex-shrink:0">' +
        '<div style="flex:1"><span style="font-weight:600">' + s.staffName + '</span> — ' +
        _fmtDateLong(s.date) + ' ' + s.startTime + '–' + s.endTime + ' (' + (s.room || '') + ')' +
        '<span style="margin-left:6px" class="skill-tag">' + s.type + '</span></div>' +
        (member ? '<span style="width:10px;height:10px;border-radius:50%;background:' + member.color + ';display:inline-block;flex-shrink:0"></span>' : '') +
        '</div>';
    }).join('');
    window._staffSuggestedShifts = suggestions;
    _ssOpenModal(
      '<div style="font-weight:700;font-size:1rem;margin-bottom:6px">Auto-Schedule Suggestions</div>' +
      '<div style="font-size:.8rem;color:var(--text-muted);margin-bottom:14px">' + suggestions.length + ' shifts suggested based on default hours</div>' +
      '<div style="max-height:320px;overflow-y:auto">' + rows + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
      '<button class="btn btn-ghost btn-sm" onclick="window._staffCloseModal()">Cancel</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="window._staffApplySchedule(false)">Apply Selected</button>' +
      '<button class="btn btn-sm" onclick="window._staffApplySchedule(true)">Apply All</button></div>'
    );
  };

  window._staffApplySchedule = function(applyAll) {
    var suggestions = window._staffSuggestedShifts || [];
    suggestions.forEach(function(s, i) {
      var cb = document.getElementById('_sg-' + i);
      if (applyAll || (cb && cb.checked)) {
        var copy = Object.assign({}, s);
        delete copy._suggested;
        saveShift(copy);
      }
    });
    _ssCloseModal();
    render();
  };

  window._staffCloseModal = _ssCloseModal;

  window._staffNew = function() {
    var dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
    var dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    var hrsGrid = dayLabels.map(function(day, i) {
      var key = dayKeys[i];
      return '<div><div style="font-size:.7rem;text-align:center;color:var(--text-muted)">' + day + '</div>' +
        '<input class="form-control" id="_sm-hrs-' + key + '" placeholder="09:00-17:00" style="font-size:.7rem;padding:4px"></div>';
    }).join('');
    _ssOpenModal(
      '<div style="font-weight:700;font-size:1rem;margin-bottom:16px">Add Staff Member</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Full Name</label>' +
      '<input class="form-control" id="_sm-name" placeholder="Dr. Full Name"></div>' +
      '<div style="display:flex;gap:8px">' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Role</label>' +
      '<select class="form-control" id="_sm-role"><option value="clinician">Clinician</option><option value="technician">Technician</option>' +
      '<option value="receptionist">Receptionist</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select></div>' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Contract</label>' +
      '<select class="form-control" id="_sm-contract"><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contractor">Contractor</option></select></div></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Email</label>' +
      '<input class="form-control" id="_sm-email" type="email" placeholder="email@clinic.com"></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Phone</label>' +
      '<input class="form-control" id="_sm-phone" placeholder="555-0000"></div>' +
      '<div style="display:flex;gap:8px">' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Max Hours/Week</label>' +
      '<input class="form-control" id="_sm-maxhrs" type="number" value="40" min="1" max="80"></div>' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Color</label>' +
      '<input class="form-control" id="_sm-color" type="color" value="#10b981"></div></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Skills (comma-separated)</label>' +
      '<input class="form-control" id="_sm-skills" placeholder="neurofeedback, tms, qeeg"></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Default Hours (blank = day off)</label>' +
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:4px">' + hrsGrid + '</div></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
      '<button class="btn btn-ghost btn-sm" onclick="window._staffCloseModal()">Cancel</button>' +
      '<button class="btn btn-sm" onclick="window._staffSaveMember(null)">Add Member</button></div>'
    );
  };

  window._staffEditMember = function(memberId) {
    var staff = getStaffRoster();
    var m = staff.find(function(s) { return s.id === memberId; });
    if (!m) return;
    var dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
    var dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    var roleOpts = ['clinician', 'technician', 'receptionist', 'supervisor', 'admin'].map(function(r) {
      return '<option value="' + r + '"' + (r === m.role ? ' selected' : '') + '>' + r + '</option>';
    }).join('');
    var contractOpts = ['full-time', 'part-time', 'contractor'].map(function(c) {
      return '<option value="' + c + '"' + (c === m.contractType ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
    var hrsGrid = dayLabels.map(function(day, i) {
      var key = dayKeys[i];
      var val = (m.defaultHours && m.defaultHours[key]) || '';
      return '<div><div style="font-size:.7rem;text-align:center;color:var(--text-muted)">' + day + '</div>' +
        '<input class="form-control" id="_sm-hrs-' + key + '" value="' + val + '" placeholder="09:00-17:00" style="font-size:.7rem;padding:4px"></div>';
    }).join('');
    _ssOpenModal(
      '<div style="font-weight:700;font-size:1rem;margin-bottom:16px">Edit Staff Member</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Full Name</label>' +
      '<input class="form-control" id="_sm-name" value="' + m.name + '"></div>' +
      '<div style="display:flex;gap:8px">' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Role</label>' +
      '<select class="form-control" id="_sm-role">' + roleOpts + '</select></div>' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Contract</label>' +
      '<select class="form-control" id="_sm-contract">' + contractOpts + '</select></div></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Email</label>' +
      '<input class="form-control" id="_sm-email" type="email" value="' + (m.email || '') + '"></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Phone</label>' +
      '<input class="form-control" id="_sm-phone" value="' + (m.phone || '') + '"></div>' +
      '<div style="display:flex;gap:8px">' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Max Hours/Week</label>' +
      '<input class="form-control" id="_sm-maxhrs" type="number" value="' + (m.maxHoursPerWeek || 40) + '" min="1" max="80"></div>' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Color</label>' +
      '<input class="form-control" id="_sm-color" type="color" value="' + (m.color || '#10b981') + '"></div></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Skills (comma-separated)</label>' +
      '<input class="form-control" id="_sm-skills" value="' + (m.skills || []).join(', ') + '"></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Default Hours (blank = day off)</label>' +
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:4px">' + hrsGrid + '</div></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
      '<button class="btn btn-ghost btn-sm" onclick="window._staffCloseModal()">Cancel</button>' +
      '<button class="btn btn-sm" onclick="window._staffSaveMember(\'' + memberId + '\')">Save</button></div>'
    );
  };

  window._staffSaveMember = function(existingId) {
    var name = (document.getElementById('_sm-name') || {}).value;
    if (!name || !name.trim()) { alert('Name is required'); return; }
    var dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
    var defaultHours = {};
    dayKeys.forEach(function(k) {
      var el = document.getElementById('_sm-hrs-' + k);
      var v = el ? el.value.trim() : '';
      defaultHours[k] = v || null;
    });
    var skillsEl = document.getElementById('_sm-skills');
    var skillsRaw = skillsEl ? skillsEl.value : '';
    saveStaffMember({
      id: existingId || _staffId(),
      name: name.trim(),
      role: (document.getElementById('_sm-role') || {}).value || 'clinician',
      contractType: (document.getElementById('_sm-contract') || {}).value || 'full-time',
      email: (document.getElementById('_sm-email') || {}).value || '',
      phone: (document.getElementById('_sm-phone') || {}).value || '',
      maxHoursPerWeek: parseInt((document.getElementById('_sm-maxhrs') || {}).value || '40', 10),
      color: (document.getElementById('_sm-color') || {}).value || '#10b981',
      skills: skillsRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
      defaultHours: defaultHours,
    });
    _ssCloseModal();
    render();
  };

  window._staffRequestPTO = function() {
    var staff = getStaffRoster();
    var staffOptions = staff.map(function(s) {
      return '<option value="' + s.id + '">' + s.name + '</option>';
    }).join('');
    _ssOpenModal(
      '<div style="font-weight:700;font-size:1rem;margin-bottom:16px">Request PTO</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Staff Member</label>' +
      '<select class="form-control" id="_pto-staff">' + staffOptions + '</select></div>' +
      '<div style="display:flex;gap:8px">' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">Start Date</label>' +
      '<input class="form-control" type="date" id="_pto-start" value="' + _todayIso() + '"></div>' +
      '<div style="flex:1"><label style="font-size:.8rem;color:var(--text-muted)">End Date</label>' +
      '<input class="form-control" type="date" id="_pto-end" value="' + _todayIso() + '"></div></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Type</label>' +
      '<select class="form-control" id="_pto-type"><option value="vacation">Vacation</option><option value="sick">Sick</option>' +
      '<option value="personal">Personal</option><option value="unpaid">Unpaid</option></select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Reason</label>' +
      '<input class="form-control" id="_pto-reason" placeholder="Brief reason..."></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
      '<button class="btn btn-ghost btn-sm" onclick="window._staffCloseModal()">Cancel</button>' +
      '<button class="btn btn-sm" onclick="window._staffSavePTO()">Submit Request</button></div>'
    );
  };

  window._staffSavePTO = function() {
    var staffId = (document.getElementById('_pto-staff') || {}).value;
    var startDate = (document.getElementById('_pto-start') || {}).value;
    var endDate = (document.getElementById('_pto-end') || {}).value;
    var type = (document.getElementById('_pto-type') || {}).value;
    var reason = (document.getElementById('_pto-reason') || {}).value || '';
    if (!startDate || !endDate) { alert('Please select start and end dates'); return; }
    if (endDate < startDate) { alert('End date must be on or after start date'); return; }
    var staff = getStaffRoster();
    var member = staff.find(function(s) { return s.id === staffId; });
    savePTORequest({
      id: _ptoId(), staffId: staffId, staffName: member ? member.name : '',
      startDate: startDate, endDate: endDate, type: type,
      status: 'pending', reason: reason, approvedBy: null
    });
    _ssCloseModal();
    render();
  };

  window._staffApprovePTO = function(id) { updatePTOStatus(id, 'approved'); render(); };
  window._staffDenyPTO    = function(id) { updatePTOStatus(id, 'denied');   render(); };

  window._staffRequestSwap = function() {
    var staff = getStaffRoster();
    var shifts = getShifts();
    var today = _todayIso();
    var futureShifts = shifts.filter(function(s) { return s.date >= today && s.status !== 'cancelled'; });
    var staffOptions = staff.map(function(s) {
      return '<option value="' + s.id + '">' + s.name + '</option>';
    }).join('');

    function shiftOptsFor(staffId) {
      return futureShifts
        .filter(function(s) { return s.staffId === staffId; })
        .map(function(s) { return '<option value="' + s.id + '">' + _fmtDateLong(s.date) + ' ' + s.startTime + '–' + s.endTime + '</option>'; })
        .join('') || '<option value="">No upcoming shifts</option>';
    }

    var firstId = staff[0] ? staff[0].id : '';
    var secondId = staff[1] ? staff[1].id : '';

    _ssOpenModal(
      '<div style="font-weight:700;font-size:1rem;margin-bottom:16px">Request Shift Swap</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Requestor</label>' +
      '<select class="form-control" id="_sw-req" onchange="window._staffRefreshSwapShifts()">' + staffOptions + '</select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Requestor Shift</label>' +
      '<select class="form-control" id="_sw-req-shift">' + shiftOptsFor(firstId) + '</select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Cover Person</label>' +
      '<select class="form-control" id="_sw-cover" onchange="window._staffRefreshSwapShifts()">' + staffOptions + '</select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Cover Shift</label>' +
      '<select class="form-control" id="_sw-cover-shift">' + shiftOptsFor(secondId) + '</select></div>' +
      '<div><label style="font-size:.8rem;color:var(--text-muted)">Reason</label>' +
      '<input class="form-control" id="_sw-reason" placeholder="Reason for swap..."></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
      '<button class="btn btn-ghost btn-sm" onclick="window._staffCloseModal()">Cancel</button>' +
      '<button class="btn btn-sm" onclick="window._staffSaveSwap()">Submit Swap Request</button></div>'
    );

    window._staffRefreshSwapShifts = function() {
      var reqId = (document.getElementById('_sw-req') || {}).value;
      var covId = (document.getElementById('_sw-cover') || {}).value;
      var reqSel = document.getElementById('_sw-req-shift');
      var covSel = document.getElementById('_sw-cover-shift');
      if (reqSel) reqSel.innerHTML = shiftOptsFor(reqId);
      if (covSel) covSel.innerHTML = shiftOptsFor(covId);
    };
  };

  window._staffSaveSwap = function() {
    var requestorId = (document.getElementById('_sw-req') || {}).value;
    var requestorShiftId = (document.getElementById('_sw-req-shift') || {}).value;
    var coverId = (document.getElementById('_sw-cover') || {}).value;
    var coverShiftId = (document.getElementById('_sw-cover-shift') || {}).value;
    var reason = (document.getElementById('_sw-reason') || {}).value || '';
    if (!requestorShiftId || !coverShiftId) { alert('Please select shifts for both parties'); return; }
    var staff = getStaffRoster();
    var reqMember = staff.find(function(s) { return s.id === requestorId; });
    var covMember = staff.find(function(s) { return s.id === coverId; });
    saveSwapRequest({
      id: _swapId(),
      requestorId: requestorId, requestorName: reqMember ? reqMember.name : '',
      requestorShiftId: requestorShiftId,
      coverId: coverId, coverName: covMember ? covMember.name : '',
      coverShiftId: coverShiftId, reason: reason, status: 'pending'
    });
    _ssCloseModal();
    render();
  };

  window._staffApproveSwap = function(id) { updateSwapStatus(id, 'approved'); render(); };
  window._staffDenySwap    = function(id) { updateSwapStatus(id, 'denied');   render(); };

  render();
}

// ── Clinic Analytics Deep-Dive ────────────────────────────────────────────────
export async function pgClinicAnalytics(setTopbar) {
  setTopbar('Clinic Analytics', `
    <button class="btn-secondary" style="font-size:.8rem;padding:5px 12px" onclick="window._caRefresh()">↺ Refresh</button>
    <button class="btn-primary"   style="font-size:.8rem;padding:5px 12px;margin-left:6px" onclick="window._caExport()">⬇ Export CSV</button>
  `);

  // ── Seed constants ────────────────────────────────────────────────────────
  const ANALYTICS_SEED = {
    revenue: [42000,48000,45000,52000,58000,61000,55000,67000,72000,68000,79000,85000],
    funnel: { leads:180, consults:112, intakes:87, active:71, completed:43 },
    clinicians: ['Dr. Patel','Dr. Kim','Dr. Osei','NP Rivera','NP Tanaka'],
    weeklyTargets: 18,
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const HOURS  = ['8am','9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm'];

  // ── Load / seed localStorage ───────────────────────────────────────────────
  function loadData() {
    try {
      const raw = localStorage.getItem('ds_clinic_analytics');
      if (raw) return JSON.parse(raw);
    } catch(_) {}
    return null;
  }

  function seedData() {
    const revenueData = ANALYTICS_SEED.revenue.map((v, i) => ({ month: MONTHS[i], value: v }));

    const funnelData = { ...ANALYTICS_SEED.funnel };

    // 5 clinicians × 4 weeks of session counts
    const clinicianMatrix = ANALYTICS_SEED.clinicians.map(name => {
      const weeks = Array.from({ length: 4 }, (_, w) => {
        const base = 14 + Math.floor(Math.random() * 8);
        return { week: `W${w + 1}`, sessions: base };
      });
      return { name, weeks };
    });

    // 7 days × 12 hours heatmap
    const heatmapData = DAYS.map((day, di) => {
      return HOURS.map((hour, hi) => {
        const isWeekday = di < 5;
        const isPeak = hi >= 2 && hi <= 5; // 10am–2pm
        let base = isWeekday ? (isPeak ? 8 : 4) : 1;
        base = Math.max(0, base + Math.floor(Math.random() * 5) - 1);
        return { day, hour, count: base };
      });
    });

    // Churn breakdown
    const churnData = {
      segments: [
        { label: 'Active',             count: 71,  color: '#10b981' },
        { label: 'Discharged',         count: 43,  color: '#4a9eff' },
        { label: 'Lost to Follow-up',  count: 18,  color: '#ef4444' },
        { label: 'On Hold',            count: 12,  color: '#f59e0b' },
      ],
      atRisk: [
        { name: 'Jordan T.',   lastSess: 52, attendance: 68 },
        { name: 'Morgan L.',   lastSess: 61, attendance: 72 },
        { name: 'Casey M.',    lastSess: 47, attendance: 75 },
        { name: 'Riley P.',    lastSess: 89, attendance: 55 },
        { name: 'Avery S.',    lastSess: 50, attendance: 79 },
      ],
    };

    const data = { revenueData, funnelData, clinicianMatrix, heatmapData, churnData, lastUpdated: new Date().toISOString() };
    localStorage.setItem('ds_clinic_analytics', JSON.stringify(data));
    return data;
  }

  const data = loadData() || seedData();
  window._caData = data;

  // ── SVG helpers ────────────────────────────────────────────────────────────
  function sparkline(values, color, w, h) {
    if (!values || values.length < 2) return '';
    const mn = Math.min(...values), mx = Math.max(...values);
    const range = mx - mn || 1;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - mn) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg width="${w}" height="${h}" style="display:block;overflow:visible"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  // ── KPI cards ──────────────────────────────────────────────────────────────
  function buildKPIRow(d) {
    const rev = d.revenueData;
    const thisMo = rev[rev.length - 1].value;
    const lastMo = rev[rev.length - 2].value;
    const revDelta = (((thisMo - lastMo) / lastMo) * 100).toFixed(1);
    const revUp = thisMo >= lastMo;

    const totalSessions = 247;
    const prevSessions  = 231;
    const sessDelta = (((totalSessions - prevSessions) / prevSessions) * 100).toFixed(1);

    const newPat = 19, prevNewPat = 14;
    const patDelta = (((newPat - prevNewPat) / prevNewPat) * 100).toFixed(1);

    const avgRating = 4.6, prevRating = 4.4;
    const ratingDelta = (avgRating - prevRating).toFixed(1);

    const cancelRate = 8.3, prevCancel = 11.2;
    const cancelDelta = (cancelRate - prevCancel).toFixed(1);

    const revVals = rev.slice(-6).map(r => r.value);
    const sessVals = [195,210,225,231,240,247];
    const patVals  = [9,12,11,14,16,19];
    const ratingVals = [4.2,4.3,4.4,4.5,4.4,4.6];
    const cancelVals = [14,13,12,11.2,9.5,8.3];

    const kpis = [
      { label:'Total Revenue MTD',   value:`$${(thisMo/1000).toFixed(0)}k`, delta:`${revUp?'+':''}${revDelta}% vs last month`,    up:revUp,    spark:sparkline(revVals,'var(--accent-teal)',60,20) },
      { label:'Sessions This Month', value:`${totalSessions}`,              delta:`+${sessDelta}% vs last month`,                  up:true,     spark:sparkline(sessVals,'var(--accent-blue)',60,20) },
      { label:'New Patients',        value:`${newPat}`,                     delta:`+${patDelta}% vs last month`,                   up:true,     spark:sparkline(patVals,'var(--accent-violet)',60,20) },
      { label:'Avg Session Rating',  value:`${avgRating}`,                  delta:`+${ratingDelta} vs last month`,                 up:true,     spark:sparkline(ratingVals,'var(--accent-amber)',60,20) },
      { label:'Cancellation Rate',   value:`${cancelRate}%`,                delta:`${cancelDelta}% vs last month`,                 up:false,    spark:sparkline(cancelVals,'var(--accent-rose)',60,20) },
    ];

    return `<div class="fff-kpi-row">${kpis.map(k => `
      <div class="fff-kpi-card">
        <div class="fff-kpi-label">${k.label}</div>
        <div class="fff-kpi-value">${k.value}</div>
        <div class="fff-kpi-delta ${k.up ? 'up' : 'down'}">${k.delta}</div>
        <div class="fff-kpi-sparkline">${k.spark}</div>
      </div>`).join('')}</div>`;
  }

  // ── Revenue area chart ─────────────────────────────────────────────────────
  function buildRevenueChart(d) {
    const vals = d.revenueData.map(r => r.value);
    const W = 480, H = 160, PAD = { l:48, r:10, t:12, b:28 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const mn = 0, mx = Math.max(...vals) * 1.1;

    function px(i) { return PAD.l + (i / (vals.length - 1)) * cW; }
    function py(v) { return PAD.t + cH - ((v - mn) / (mx - mn)) * cH; }

    // Grid lines
    const gridTicks = [0, 0.25, 0.5, 0.75, 1].map(p => mn + p * (mx - mn));
    const gridLines = gridTicks.map(v => {
      const y = py(v);
      return `<line x1="${PAD.l}" y1="${y.toFixed(1)}" x2="${W - PAD.r}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
              <text x="${PAD.l - 4}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="10">$${(v/1000).toFixed(0)}k</text>`;
    }).join('');

    // Line points
    const linePts = vals.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');

    // Area fill (close path to bottom)
    const areaPath = `M${px(0).toFixed(1)},${py(vals[0]).toFixed(1)} ` +
      vals.map((v, i) => `L${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ') +
      ` L${px(vals.length-1).toFixed(1)},${py(0).toFixed(1)} L${px(0).toFixed(1)},${py(0).toFixed(1)} Z`;

    // Month labels
    const labels = d.revenueData.map((r, i) =>
      `<text x="${px(i).toFixed(1)}" y="${(H - 4).toFixed(1)}" text-anchor="middle" fill="var(--text-muted)" font-size="10">${r.month}</text>`
    ).join('');

    // Hover dots (invisible, revealed on hover via JS)
    const dots = vals.map((v, i) =>
      `<circle class="ca-rev-dot" data-idx="${i}" data-val="${v}" data-mo="${d.revenueData[i].month}"
        cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="4"
        fill="var(--accent-teal)" stroke="var(--bg)" stroke-width="2" opacity="0" style="cursor:pointer"
        onmouseenter="window._caRevHover(event,${i},${v},'${d.revenueData[i].month}')"
        onmouseleave="window._caRevLeave(event,${i})"/>`
    ).join('');

    return `<svg id="ca-rev-svg" width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible">
      <defs>
        <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-teal)" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="var(--accent-teal)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaPath}" fill="url(#rev-grad)"/>
      <polyline points="${linePts}" fill="none" stroke="var(--accent-teal)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${labels}
      ${dots}
    </svg>`;
  }

  // ── Funnel chart ───────────────────────────────────────────────────────────
  function buildFunnelChart(d) {
    const stages = [
      { key:'leads',     label:'Leads',           count:d.funnelData.leads },
      { key:'consults',  label:'Consultations',   count:d.funnelData.consults },
      { key:'intakes',   label:'Intakes',         count:d.funnelData.intakes },
      { key:'active',    label:'Active Patients', count:d.funnelData.active },
      { key:'completed', label:'Completed',       count:d.funnelData.completed },
    ];
    const colors = ['var(--accent-teal)','#4a9eff','var(--accent-violet)','var(--accent-amber)','var(--accent-rose)'];
    const maxCount = stages[0].count;

    return stages.map((s, i) => {
      const pct = ((s.count / maxCount) * 100).toFixed(0);
      const conv = i === 0 ? 100 : ((s.count / stages[i-1].count) * 100).toFixed(0);
      return `<div class="fff-funnel-stage" onclick="window._caFunnelClick('${s.key}','${s.label}',${s.count},${conv})" style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--text-muted);margin-bottom:3px">
          <span style="font-weight:600;color:var(--text)">${s.label}</span>
          <span>${s.count} <span style="color:${colors[i]};font-weight:700">${i===0?'':'↓'+conv+'%'}</span></span>
        </div>
        <div style="background:var(--border);border-radius:4px;height:20px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${colors[i]};border-radius:4px;transition:width .5s;display:flex;align-items:center;padding:0 8px;font-size:.72rem;font-weight:700;color:var(--bg)">${pct}%</div>
        </div>
      </div>`;
    }).join('') + `<div id="ca-funnel-detail" class="fff-detail-panel" style="display:none"></div>`;
  }

  // ── Clinician matrix ───────────────────────────────────────────────────────
  function buildMatrix(d) {
    const target = ANALYTICS_SEED.weeklyTargets;
    const weekHeaders = d.clinicianMatrix[0].weeks.map(w =>
      `<th>${w.week}</th>`
    ).join('');

    const rows = d.clinicianMatrix.map(cl =>
      `<tr>
        <td style="padding:6px 8px;font-size:.82rem;font-weight:600;color:var(--text);white-space:nowrap">${cl.name}</td>
        ${cl.weeks.map(w => {
          const ratio = w.sessions / target;
          const cls = ratio >= 0.9 ? 'green' : ratio >= 0.65 ? 'amber' : 'red';
          return `<td><div class="fff-matrix-cell ${cls}" onclick="window._caMatrixClick('${cl.name}','${w.week}',${w.sessions},${target})">${w.sessions}</div></td>`;
        }).join('')}
      </tr>`
    ).join('');

    return `<div style="overflow-x:auto">
      <table class="fff-matrix-table">
        <thead><tr><th style="text-align:left;padding:6px 8px">Clinician</th>${weekHeaders}<th style="color:var(--text-muted);font-size:.7rem">Target: ${target}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div id="ca-matrix-detail" class="fff-detail-panel" style="display:none"></div>`;
  }

  // ── Heatmap ────────────────────────────────────────────────────────────────
  function buildHeatmap(d) {
    const allCounts = d.heatmapData.flat().map(c => c.count);
    const maxC = Math.max(...allCounts) || 1;

    // Day labels column + 12 hour columns = 13 cols
    const cols = 1 + HOURS.length;
    const gridStyle = `grid-template-columns: 36px repeat(${HOURS.length}, 1fr); grid-template-rows: repeat(${DAYS.length + 1}, auto);`;

    // Hour headers
    const hourHeaders = `<div></div>` + HOURS.map(h =>
      `<div style="text-align:center;font-size:.68rem;color:var(--text-muted);padding-bottom:4px">${h}</div>`
    ).join('');

    // Day rows
    const dayRows = d.heatmapData.map((row, di) => {
      const cells = row.map((cell, hi) => {
        const intensity = cell.count / maxC;
        const alpha = (0.1 + intensity * 0.85).toFixed(2);
        const bg = cell.count === 0
          ? 'var(--border)'
          : `rgba(0,212,188,${alpha})`;
        return `<div class="fff-heatmap-cell fff-heatmap"
          style="height:22px;background:${bg}"
          onclick="window._caHeatClick('${DAYS[di]}','${HOURS[hi]}',${cell.count})"
          title="${DAYS[di]} ${HOURS[hi]}: ${cell.count} sessions"></div>`;
      }).join('');
      return `<div style="display:contents">
        <div style="font-size:.72rem;color:var(--text-muted);display:flex;align-items:center">${DAYS[di]}</div>
        ${cells}
      </div>`;
    }).join('');

    return `<div class="fff-heatmap" style="${gridStyle}">
      ${hourHeaders}
      ${dayRows}
    </div>
    <div id="ca-heat-detail" class="fff-detail-panel" style="display:none;margin-top:8px"></div>`;
  }

  // ── Churn donut ────────────────────────────────────────────────────────────
  function buildChurnDonut(d) {
    const segs = d.churnData.segments;
    const total = segs.reduce((s, x) => s + x.count, 0);
    const R = 60, cx = 90, cy = 80;
    let angle = -Math.PI / 2;
    const arcs = segs.map(seg => {
      const slice = (seg.count / total) * 2 * Math.PI;
      const x1 = cx + R * Math.cos(angle);
      const y1 = cy + R * Math.sin(angle);
      angle += slice;
      const x2 = cx + R * Math.cos(angle);
      const y2 = cy + R * Math.sin(angle);
      const largeArc = slice > Math.PI ? 1 : 0;
      const path = `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${largeArc},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
      return `<path d="${path}" fill="${seg.color}" stroke="var(--bg)" stroke-width="2"
        style="cursor:pointer;transition:opacity .15s"
        onmouseenter="this.style.opacity='.75'"
        onmouseleave="this.style.opacity='1'"
        onclick="window._caChurnSegClick('${seg.label}',${seg.count},${total})"/>`;
    }).join('');

    // Inner hole
    const hole = `<circle cx="${cx}" cy="${cy}" r="36" fill="var(--card-bg)"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="var(--text)" font-size="13" font-weight="800">${total}</text>
      <text x="${cx}" y="${cy+15}" text-anchor="middle" fill="var(--text-muted)" font-size="9">patients</text>`;

    const legend = segs.map(seg =>
      `<div style="display:flex;align-items:center;gap:6px;font-size:.8rem;margin-bottom:4px">
        <div style="width:10px;height:10px;border-radius:2px;background:${seg.color};flex-shrink:0"></div>
        <span style="flex:1;color:var(--text-muted)">${seg.label}</span>
        <span style="font-weight:700;color:var(--text)">${seg.count}</span>
        <span style="color:var(--text-muted);font-size:.72rem">${((seg.count/total)*100).toFixed(0)}%</span>
      </div>`
    ).join('');

    const atRiskRows = d.churnData.atRisk.map(p => {
      const risk = p.attendance < 65 || p.lastSess > 70 ? 'high' : 'medium';
      const riskColor = risk === 'high' ? '#ef4444' : '#f59e0b';
      return `<tr>
        <td>${p.name}</td>
        <td>${p.lastSess} days</td>
        <td><span style="color:${p.attendance<70?'#ef4444':p.attendance<80?'#f59e0b':'#10b981'};font-weight:700">${p.attendance}%</span></td>
        <td><span style="background:${riskColor}22;color:${riskColor};padding:2px 8px;border-radius:4px;font-size:.72rem;font-weight:700">${risk.toUpperCase()}</span></td>
        <td><button class="btn-secondary" style="font-size:.72rem;padding:3px 8px" onclick="window._caSendReEngage('${p.name}')">Send Re-engagement</button></td>
      </tr>`;
    }).join('');

    return `<div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
      <svg width="180" height="160" viewBox="0 0 180 160">${arcs}${hole}</svg>
      <div style="flex:1;min-width:150px;padding-top:8px">${legend}</div>
    </div>
    <div id="ca-churn-seg-detail" class="fff-detail-panel" style="display:none;margin-bottom:10px"></div>
    <div style="font-size:.8rem;font-weight:700;color:var(--text);margin:14px 0 6px">At-Risk Patients (last session &gt;45 days or attendance &lt;80%)</div>
    <div style="overflow-x:auto">
      <table class="fff-churn-table">
        <thead><tr><th>Patient</th><th>Last Session</th><th>Attendance</th><th>Risk</th><th>Action</th></tr></thead>
        <tbody>${atRiskRows}</tbody>
      </table>
    </div>`;
  }

  // ── Render page HTML ───────────────────────────────────────────────────────
  document.getElementById('app-content').innerHTML = `
    <div id="fff-root" style="padding:20px;max-width:1400px;margin:0 auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px">
        <div>
          <h1 style="font-size:1.3rem;font-weight:800;color:var(--text);margin:0">Clinic Analytics</h1>
          <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px">Last updated: ${new Date(data.lastUpdated).toLocaleString()}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="form-control" id="ca-period" style="font-size:.78rem;width:auto" onchange="window._caPeriodChange()">
            <option value="12">Last 12 months</option>
            <option value="6">Last 6 months</option>
            <option value="3">Last 3 months</option>
          </select>
        </div>
      </div>

      <!-- KPI Row -->
      ${buildKPIRow(data)}

      <!-- Charts grid -->
      <div class="fff-analytics-grid">
        <!-- Revenue chart -->
        <div class="fff-chart-card" style="grid-column:1/-1">
          <div class="fff-chart-title">
            <span>Revenue Trend (Month-over-Month)</span>
            <span style="font-size:.75rem;color:var(--text-muted)" id="ca-rev-total">YTD: $${data.revenueData.reduce((s,r)=>s+r.value,0).toLocaleString()}</span>
          </div>
          <div id="ca-rev-chart">${buildRevenueChart(data)}</div>
          <div id="ca-rev-tooltip" class="fff-tooltip" style="display:none"></div>
        </div>

        <!-- Patient acquisition funnel -->
        <div class="fff-chart-card">
          <div class="fff-chart-title">Patient Acquisition Funnel</div>
          <div id="ca-funnel">${buildFunnelChart(data)}</div>
        </div>

        <!-- Clinician productivity matrix -->
        <div class="fff-chart-card">
          <div class="fff-chart-title">
            <span>Clinician Productivity (sessions/week)</span>
            <span style="font-size:.72rem;background:rgba(16,185,129,.15);color:#10b981;padding:2px 8px;border-radius:4px">Target: ${ANALYTICS_SEED.weeklyTargets}/wk</span>
          </div>
          <div id="ca-matrix">${buildMatrix(data)}</div>
        </div>

        <!-- Peak hours heatmap -->
        <div class="fff-chart-card">
          <div class="fff-chart-title">
            <span>Peak Hours Heatmap (sessions/slot)</span>
            <span style="font-size:.72rem;color:var(--text-muted)">Mon–Sun × 8am–7pm</span>
          </div>
          <div id="ca-heatmap">${buildHeatmap(data)}</div>
        </div>

        <!-- Churn analysis (full width) -->
        <div class="fff-chart-card" style="grid-column:1/-1">
          <div class="fff-chart-title">Churn & Patient Status Analysis</div>
          <div id="ca-churn">${buildChurnDonut(data)}</div>
        </div>
      </div>

      <div id="ca-toast" style="display:none;position:fixed;bottom:24px;right:24px;background:var(--accent-teal);color:#000;padding:10px 18px;border-radius:10px;font-size:.85rem;font-weight:700;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.4)"></div>
    </div>
  `;

  // ── Tooltip for revenue chart ──────────────────────────────────────────────
  window._caRevHover = function(evt, idx, val, month) {
    const tt = document.getElementById('ca-rev-tooltip');
    if (!tt) return;
    tt.style.display = 'block';
    tt.innerHTML = `<strong>${month}</strong><br>$${val.toLocaleString()}`;
    tt.style.left = (evt.clientX + 12) + 'px';
    tt.style.top  = (evt.clientY - 36) + 'px';
    // Make dot visible
    const dots = document.querySelectorAll('.ca-rev-dot');
    dots.forEach(d => d.setAttribute('opacity', d.dataset.idx == idx ? '1' : '0'));
  };
  window._caRevLeave = function(evt, idx) {
    const tt = document.getElementById('ca-rev-tooltip');
    if (tt) tt.style.display = 'none';
    const dots = document.querySelectorAll('.ca-rev-dot');
    dots.forEach(d => d.setAttribute('opacity', '0'));
  };

  // Mousemove to keep tooltip near cursor
  document.getElementById('ca-rev-chart')?.addEventListener('mousemove', function(e) {
    const tt = document.getElementById('ca-rev-tooltip');
    if (tt && tt.style.display !== 'none') {
      tt.style.left = (e.clientX + 14) + 'px';
      tt.style.top  = (e.clientY - 38) + 'px';
    }
  });

  // ── Funnel click ───────────────────────────────────────────────────────────
  window._caFunnelClick = function(key, label, count, conv) {
    const panel = document.getElementById('ca-funnel-detail');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none' && panel.dataset.key === key;
    if (isOpen) { panel.style.display = 'none'; return; }
    panel.dataset.key = key;
    panel.style.display = 'block';
    panel.innerHTML = `<strong>${label}</strong> — ${count} patients
      <span style="margin-left:10px;font-size:.78rem;color:var(--text-muted)">Conversion from previous stage: <strong style="color:var(--accent-teal)">${conv}%</strong></span>
      <div style="margin-top:6px;font-size:.78rem;color:var(--text-muted)">
        ${key==='leads'?'Referral sources: 42% physician, 31% self-referred, 27% online'
          :key==='consults'?'Consultation-to-intake gap avg: 6.2 days'
          :key==='intakes'?'Intake completion rate: 97.7%'
          :key==='active'?'Avg sessions completed: 14.3 of 20'
          :'Avg treatment duration: 18.7 weeks'}
      </div>`;
  };

  // ── Matrix click ───────────────────────────────────────────────────────────
  window._caMatrixClick = function(name, week, sessions, target) {
    const panel = document.getElementById('ca-matrix-detail');
    if (!panel) return;
    const key = name + week;
    const isOpen = panel.style.display !== 'none' && panel.dataset.key === key;
    if (isOpen) { panel.style.display = 'none'; return; }
    panel.dataset.key = key;
    panel.style.display = 'block';
    const status = sessions / target >= 0.9 ? 'On target' : sessions / target >= 0.65 ? 'Below target' : 'Significantly below target';
    const statusColor = sessions / target >= 0.9 ? '#10b981' : sessions / target >= 0.65 ? '#f59e0b' : '#ef4444';
    const breakdown = Array.from({length:sessions}, (_,i) => i).slice(0,5).map(i =>
      `<span style="background:var(--border);border-radius:4px;padding:2px 8px;font-size:.75rem">Session ${i+1}</span>`
    ).join(' ');
    panel.innerHTML = `<strong>${name}</strong> — <strong>${week}</strong>
      <span style="margin-left:8px;color:${statusColor};font-weight:700">${status}</span>
      <div style="margin-top:6px;font-size:.78rem;color:var(--text-muted)">
        Sessions completed: <strong style="color:var(--text)">${sessions}</strong> / ${target} target
        (${((sessions/target)*100).toFixed(0)}%)
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${breakdown} ${sessions > 5 ? `<span style="color:var(--text-muted);font-size:.75rem">+${sessions-5} more</span>`:''}</div>`;
  };

  // ── Heatmap click ──────────────────────────────────────────────────────────
  window._caHeatClick = function(day, hour, count) {
    const panel = document.getElementById('ca-heat-detail');
    if (!panel) return;
    const key = day + hour;
    const isOpen = panel.style.display !== 'none' && panel.dataset.key === key;
    if (isOpen) { panel.style.display = 'none'; return; }
    panel.dataset.key = key;
    panel.style.display = 'block';
    const busyLabel = count >= 8 ? 'Peak' : count >= 4 ? 'Moderate' : count >= 1 ? 'Light' : 'Empty';
    const busyColor = count >= 8 ? 'var(--accent-teal)' : count >= 4 ? '#4a9eff' : count >= 1 ? 'var(--accent-amber)' : 'var(--text-muted)';
    panel.innerHTML = `<strong>${day} ${hour}</strong>
      <span style="margin-left:10px;background:${busyColor}22;color:${busyColor};padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:700">${busyLabel}</span>
      <div style="margin-top:5px;font-size:.78rem;color:var(--text-muted)">
        ${count} session${count!==1?'s':''} scheduled this slot &nbsp;·&nbsp;
        ${count > 0 ? `Avg utilisation: ${((count / 12)*100).toFixed(0)}% of room capacity` : 'No sessions scheduled'}
      </div>`;
  };

  // ── Churn segment click ────────────────────────────────────────────────────
  window._caChurnSegClick = function(label, count, total) {
    const panel = document.getElementById('ca-churn-seg-detail');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none' && panel.dataset.label === label;
    if (isOpen) { panel.style.display = 'none'; return; }
    panel.dataset.label = label;
    panel.style.display = 'block';
    const pct = ((count / total) * 100).toFixed(1);
    const notes = {
      'Active': 'Patients currently engaged in active treatment courses.',
      'Discharged': 'Patients who completed their treatment plan and were formally discharged.',
      'Lost to Follow-up': 'Patients who did not respond to 3+ re-engagement attempts over 60 days.',
      'On Hold': 'Patients who paused treatment (insurance, personal, or medical hold).',
    };
    panel.innerHTML = `<strong>${label}</strong> — <strong style="color:var(--accent-teal)">${count}</strong> patients (${pct}% of total)
      <div style="margin-top:5px;font-size:.78rem;color:var(--text-muted)">${notes[label] || ''}</div>`;
  };

  // ── Re-engagement action ────────────────────────────────────────────────────
  window._caSendReEngage = function(name) {
    window._caShowToast(`Re-engagement message queued for ${name}`);
  };

  // ── Toast helper ──────────────────────────────────────────────────────────
  window._caShowToast = function(msg) {
    const t = document.getElementById('ca-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(window._caToastTimer);
    window._caToastTimer = setTimeout(() => { if (t) t.style.display = 'none'; }, 3000);
  };

  // ── Refresh ────────────────────────────────────────────────────────────────
  window._caRefresh = function() {
    if (!document.getElementById('fff-root')) return;
    // Re-seed with slight variation
    const old = loadData() || seedData();
    old.revenueData = old.revenueData.map(r => ({ ...r, value: Math.round(r.value * (0.97 + Math.random() * 0.06)) }));
    old.lastUpdated = new Date().toISOString();
    localStorage.setItem('ds_clinic_analytics', JSON.stringify(old));
    pgClinicAnalytics(setTopbar);
  };

  // ── Period change ──────────────────────────────────────────────────────────
  window._caPeriodChange = function() {
    const sel = document.getElementById('ca-period');
    const n = parseInt(sel?.value || '12', 10);
    const d = loadData() || seedData();
    const sliced = { ...d, revenueData: d.revenueData.slice(-n) };
    const revDiv = document.getElementById('ca-rev-chart');
    const revTotal = document.getElementById('ca-rev-total');
    if (revDiv) revDiv.innerHTML = buildRevenueChart(sliced);
    if (revTotal) revTotal.textContent = `${n === 12 ? 'YTD' : `Last ${n}mo`}: $${sliced.revenueData.reduce((s,r)=>s+r.value,0).toLocaleString()}`;
  };

  // ── Export CSV ────────────────────────────────────────────────────────────
  window._caExport = function() {
    const d = window._caData || loadData();
    if (!d) return;
    const rows = [['Month','Revenue'],...d.revenueData.map(r=>[r.month,r.value])];
    const csv = rows.map(r=>r.join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'clinic-analytics.csv'; a.click();
    URL.revokeObjectURL(url);
    window._caShowToast('CSV exported successfully');
  };

  // ── Self-terminating refresh interval (live-update simulation) ────────────
  const t = setInterval(() => {
    if (!document.getElementById('fff-root')) { clearInterval(t); return; }
    // Silently update last-updated label
    const lbl = document.querySelector('#fff-root > div > div > div > div:last-child');
    // no-op; interval just checks if page is alive
  }, 10000);
}

// ─────────────────────────────────────────────────────────────────────────────
// pgProtocolMarketplace — Protocol Marketplace & Template Sharing
// ─────────────────────────────────────────────────────────────────────────────
export async function pgProtocolMarketplace(setTopbar) {
  setTopbar('Protocol Marketplace', `
    <button class="btn-secondary" style="font-size:.8rem;padding:5px 12px" onclick="window._mpTab('browse')">Browse</button>
    <button class="btn-secondary" style="font-size:.8rem;padding:5px 12px;margin-left:6px" onclick="window._mpTab('published')">My Published</button>
    <button class="btn-primary"   style="font-size:.8rem;padding:5px 12px;margin-left:6px" onclick="window._mpTab('publish')">+ Publish Protocol</button>
  `);

  // ── Seed data ────────────────────────────────────────────────────────────
  const MARKETPLACE_PROTOCOLS = [
    {
      id: 'mp1', name: 'Standard 10Hz rTMS — Left DLPFC Depression', modality: 'TMS',
      conditions: ['Depression'], evidence: 'Level I', rating: 4.8, downloads: 1247, sessions: 30,
      author: 'Dr. M. Hallett', institution: 'NIH', publishDate: '2022-03-15',
      tags: ['depression', 'dlpfc', 'standard', 'evidence-based', 'rTMS'],
      desc: 'Standard 10Hz repetitive TMS applied to the left dorsolateral prefrontal cortex for major depressive disorder. This protocol follows the established FDA-cleared parameters used across landmark RCT studies with robust response rates in treatment-naive and medication-augmentation populations.',
      params: { frequency: '10 Hz', intensity: '120% MT', coilPosition: 'Left DLPFC (F3)', pulsesPerSession: '3000', sessionsPerWeek: '5', totalSessions: '30' },
      refs: [
        'O\'Reardon JP et al. (2007). Efficacy and safety of TMS in acute major depression. Biol Psychiatry 62:1208–1216. (n=301, d=0.55)',
        'George MS et al. (2010). Daily left prefrontal TMS therapy for major depressive disorder. Arch Gen Psychiatry 67:507–516. (n=190, response 14.1% vs 5.1%)',
        'Carpenter LL et al. (2012). Transcranial magnetic stimulation for major depressive disorder. J Clin Psychiatry 73:805–816. (n=307, remission 30.7%)',
      ],
      sessionBreakdown: [
        { n: 1, label: 'Baseline motor threshold determination, coil placement calibration, patient orientation to sensation and safety procedures.' },
        { n: 2, label: 'First therapeutic session at 120% MT, monitor for adverse effects (headache, scalp discomfort). Assess tolerability.' },
        { n: 3, label: 'Continue 3000 pulses at 10 Hz. Patient questionnaire (PHQ-9) administered. Review side effect log.' },
        { n: 4, label: 'Routine treatment. Check coil positioning consistency. Observe any emerging adverse events.' },
        { n: 5, label: 'End of week 1. Re-assess PHQ-9. Discuss early response indicators. Adjust coil placement if needed.' },
        { n: 6, label: 'Week 2 begins. Maintain parameters. Clinical check-in — mood, sleep, energy reviewed.' },
        { n: 10, label: 'Mid-treatment assessment (PHQ-9, GAF). Document any partial response and communicate to prescriber.' },
        { n: 20, label: 'Three-week assessment. Evaluate for early remission vs non-response. Taper planning if remission achieved.' },
        { n: 30, label: 'Final treatment session. Post-treatment PHQ-9, GAF, MADRS. Schedule 1-month follow-up. Discuss maintenance.' },
      ],
      contraindications: ['Ferromagnetic intracranial implants or clips', 'Cochlear implants or implanted electrodes near coil site', 'History of epilepsy or unprovoked seizures', 'Active substance use disorder (alcohol or benzodiazepine withdrawal risk)', 'Pregnancy (relative contraindication)', 'Skull defects at targeted area'],
      outcomes: ['50% response rate (≥50% PHQ-9 reduction) by Week 4–6', 'Remission in 30–33% by end of course', 'Durable response maintained at 6-month follow-up in ~60% of responders', 'Tolerable side-effect profile: mild headache and scalp discomfort in 20% of patients'],
      inclusion: 'Adults 18–70 with MDD (DSM-5), PHQ-9 ≥ 10, ≥ 1 failed antidepressant trial.',
      exclusion: 'Active psychosis, bipolar I, severe personality disorder, or implanted metallic devices.',
      comments: [
        { author: 'Dr. L. Nguyen', institution: 'UCSF', date: '2025-11-03', stars: 5, text: 'Implemented this protocol in our clinic for 2 years. Excellent response rates consistent with published data. Motor threshold calibration step is well-specified.' },
        { author: 'Dr. P. Kaur', institution: 'Mayo Clinic', date: '2025-09-18', stars: 5, text: 'Our team imported this and modified to 3× per week for patients with schedule constraints. Still strong outcomes. The evidence base here is unmatched.' },
        { author: 'NP J. Torres', institution: 'VA Medical Center', date: '2025-07-25', stars: 4, text: 'Works well for veterans with treatment-resistant MDD. I appreciated the detailed contraindication list — saved us catching a cochlear implant case pre-screening.' },
      ],
      ratingDist: [55, 35, 7, 2, 1],
    },
    {
      id: 'mp2', name: 'Deep TMS H1 Coil — OCD Protocol', modality: 'TMS',
      conditions: ['OCD'], evidence: 'Level I', rating: 4.6, downloads: 834, sessions: 29,
      author: 'Dr. A. Zangen', institution: 'Brainsway Research', publishDate: '2021-08-20',
      tags: ['OCD', 'deep-TMS', 'H-coil', 'FDA-cleared'],
      desc: 'FDA-cleared deep TMS protocol using the H1 coil targeting the medial prefrontal cortex and anterior cingulate for OCD. This 29-session accelerated course pairs deep penetrating stimulation with brief symptom provocation before each session to activate OCD neural circuits.',
      params: { frequency: '20 Hz', intensity: '100% MT (H1 coil)', coilPosition: 'mPFC / ACC', pulsesPerSession: '2000 (+ provocation)', sessionsPerWeek: '5 (weeks 1–4) then 3×', totalSessions: '29' },
      refs: [
        'Carmi L et al. (2019). Efficacy and safety of deep TMS for OCD: a prospective multicenter RCT. Am J Psychiatry 176:931–938. (n=94, Y-BOCS –6.0 vs –3.3, p=0.01)',
        'Zangen A et al. (2021). Repetitive deep TMS at two targets reduces OCD severity. Neuropsychopharmacology 46:1900–1907.',
        'Tendler A et al. (2023). Deep TMS with provocation in OCD: long-term outcomes at 1 year post-treatment. Brain Stimul 16:1100–1108.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'Baseline Y-BOCS, H1 coil positioning, motor threshold with H1 coil (higher threshold expected).' },
        { n: 2, label: 'First provocation session: patient engages with individualized OCD symptom provocation script for 30s, then immediate stimulation.' },
        { n: 3, label: 'Continue provocation + stimulation pairs. Monitor anxiety levels pre/post. Adjust provocation intensity if distress excessive.' },
        { n: 5, label: 'End of week 1. Y-BOCS reassessment. Refine provocation stimuli based on patient report.' },
        { n: 15, label: 'Midpoint assessment. Y-BOCS, CGI. Check for partial response and motivate adherence.' },
        { n: 29, label: 'Final session. Y-BOCS, CGI-I, MADRS (comorbid depression). Schedule 4-week follow-up. Consider maintenance schedule.' },
      ],
      contraindications: ['Ferromagnetic cranial implants', 'Prior seizure or epilepsy diagnosis', 'Active suicidal ideation with plan', 'Claustrophobia preventing coil placement tolerance', 'Cardiac pacemakers or implanted defibrillators'],
      outcomes: ['38% responders (≥35% Y-BOCS reduction) vs 11% sham', 'Y-BOCS mean reduction: −6.0 points active vs −3.3 sham', 'Effect maintained at 1-year follow-up in 70% of responders', 'Well tolerated: headache most common adverse event (18%)'],
      inclusion: 'Adults 22+ with OCD (DSM-5), Y-BOCS ≥ 20, ≥ 2 SSRI failures, stable medication ≥ 4 weeks.',
      exclusion: 'Psychotic disorder, bipolar I with active mania, substance dependence, prior brain surgery.',
      comments: [
        { author: 'Dr. R. Bhatt', institution: 'Columbia University', date: '2026-01-10', stars: 5, text: 'The provocation-before-stimulation design is critical and often overlooked by clinicians new to this protocol. Well-documented here.' },
        { author: 'Dr. S. Metzger', institution: 'McLean Hospital', date: '2025-10-22', stars: 4, text: 'Solid protocol. We adapted provocation timing from 30s to 45s for severe cases and saw slightly better engagement.' },
        { author: 'NP K. Walsh', institution: 'Cleveland Clinic', date: '2025-08-05', stars: 5, text: 'Our OCD patients really benefit. The inclusion/exclusion criteria are thorough — reduces screening errors considerably.' },
      ],
      ratingDist: [42, 38, 12, 5, 3],
    },
    {
      id: 'mp3', name: 'Theta Burst Stimulation — Accelerated Depression', modality: 'TMS',
      conditions: ['Depression'], evidence: 'Level I', rating: 4.7, downloads: 921, sessions: 10,
      author: 'Dr. N. Williams', institution: 'Stanford Brain Stimulation Lab', publishDate: '2023-01-12',
      tags: ['TBS', 'accelerated', 'depression', 'iTBS', 'stanford'],
      desc: 'Stanford Accelerated Intelligent Neuromodulation Therapy (SAINT) — an accelerated iTBS protocol delivering 10 sessions per day over 5 days (50 total) for treatment-resistant depression. Targets individualized left DLPFC coordinates via fMRI-guided neuronavigation, achieving remarkable remission rates in days rather than weeks.',
      params: { frequency: 'iTBS (50 Hz bursts at 5 Hz, 600 pulses)', intensity: '90% resting MT', coilPosition: 'Left DLPFC (fMRI-guided subgenual ACC anticorrelated node)', pulsesPerSession: '600 per session × 10/day', sessionsPerWeek: '10 sessions/day × 5 days', totalSessions: '50 sessions / 5 days' },
      refs: [
        'Cole EJ et al. (2022). Stanford neuromodulation therapy (SNT): a double-blind randomized controlled trial. Am J Psychiatry 179:132–141. (n=29, remission 78.6% SNT vs 13.3% sham)',
        'Cole EJ et al. (2020). Stanford accelerated intelligent neuromodulation therapy for treatment-resistant depression. Am J Psychiatry 177:716–726.',
        'Dresler T et al. (2023). Replication of Stanford accelerated iTBS for TRD in European sample. Brain Stimul 16:810–816.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'Day 1: fMRI or EEG-guided coil positioning. Motor threshold. Session 1 of 10 (600 pulses iTBS). Inter-session rest 50 min minimum.' },
        { n: 2, label: 'Day 1 continued: Sessions 2–10. Monitor cumulative fatigue, transient headache. Provide comfort breaks.' },
        { n: 3, label: 'Day 2 (sessions 11–20): PHQ-9 morning assessment. Continue protocol. Mood lift typically first noted Day 2–3.' },
        { n: 4, label: 'Day 3 (sessions 21–30): QIDS assessment. Clinical observation of emerging response or non-response for case discussion.' },
        { n: 5, label: 'Day 4–5 (sessions 31–50): Continue per protocol. Post-treatment MADRS, PHQ-9, BDI at Day 5 completion. Schedule Day 30 follow-up.' },
      ],
      contraindications: ['Standard TMS contraindications apply', 'Prior seizures', 'Active mania or hypomania', 'Inability to tolerate 10-session/day schedule', 'Significant cognitive impairment preventing informed assent throughout'],
      outcomes: ['78.6% remission at 4-week follow-up (vs 13.3% sham in pivotal RCT)', 'Onset of improvement as early as Day 3–4 in many patients', 'Response durable at 1-month follow-up in 90%+ of remitters', 'Accelerated timeline enables treatment of patients in acute depressive crisis'],
      inclusion: 'Adults 22–65 with TRD (≥2 antidepressant failures), MADRS ≥ 28, stable outpatient status.',
      exclusion: 'Active suicidality requiring inpatient level, bipolar I, metallic implants, pregnancy.',
      comments: [
        { author: 'Dr. T. Insel', institution: 'Mindstrong', date: '2026-02-01', stars: 5, text: 'The remission data is extraordinary. We replicated in our private practice with 72% remission in 14 consecutive TRD patients.' },
        { author: 'Dr. O. Castillo', institution: 'UT Southwestern', date: '2025-12-14', stars: 5, text: 'Logistics are the main challenge — 10 sessions in one day requires dedicated space and staff. But outcomes justify the operational investment.' },
        { author: 'Dr. A. Fettes', institution: "Toronto Western", date: '2025-10-03', stars: 4, text: 'We have been running SAINT since 2023. Results are strong. Wish the fMRI guidance requirement were more accessible for smaller clinics.' },
      ],
      ratingDist: [48, 40, 8, 3, 1],
    },
    {
      id: 'mp4', name: 'Alpha/Theta Neurofeedback — PTSD & Trauma', modality: 'Neurofeedback',
      conditions: ['PTSD'], evidence: 'Level II', rating: 4.5, downloads: 612, sessions: 20,
      author: 'Dr. S. Othmer', institution: 'EEG Institute', publishDate: '2020-06-30',
      tags: ['alpha-theta', 'PTSD', 'trauma', 'Peniston', 'neurofeedback'],
      desc: 'The Peniston-Kulkosky alpha/theta protocol for PTSD and trauma-related disorders. Patients train increased alpha (8–12 Hz) and theta (4–8 Hz) amplitude while imagining peaceful states, promoting deep trance-like states associated with uncoupling of traumatic emotional memories. Well-validated for combat veterans and childhood trauma survivors.',
      params: { targetFrequencies: 'Alpha 8–12 Hz reward; Theta 4–8 Hz reward', electrodePlacement: 'Oz (occipital, eyes-closed)', rewardBands: 'Alpha amplitude increase; Theta amplitude increase', inhibitBands: 'Beta > 20 Hz inhibit; EMG inhibit', sessionDuration: '30–40 min', protocolVariant: 'Peniston-Kulkosky (1989/1991)' },
      refs: [
        'Peniston EG & Kulkosky PJ (1991). Alpha/theta brainwave neurofeedback therapy for Vietnam veterans with combat-related PTSD. Med Psychother 4:47–60. (n=29)',
        'Othmer SF & Othmer S (2009). Post traumatic stress disorder — the neurofeedback remedy. Biofeedback 37(1):24–31.',
        'van der Kolk BA et al. (2016). Yoga as an adjunctive treatment for PTSD. J Clin Psychiatry 75:e559–e565.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'History, trauma timeline. CAPS-5 baseline, PCL-5. EEG baseline recording (eyes open/closed). Orient to neurofeedback concept.' },
        { n: 2, label: 'First training session. Establish threshold. Guided relaxation pre-training. Initial alpha/theta training 20 min.' },
        { n: 3, label: 'Deepen protocol, extend to 30 min. Process any post-session experiences (visual imagery, emotional surfacing).' },
        { n: 5, label: 'Mid-early assessment — PCL-5, sleep diary. Many patients report improved sleep by session 5.' },
        { n: 10, label: 'Midpoint PCL-5, nightmare frequency log. Adjust thresholds for increasing alpha amplitude. Introduce trauma-positive scripts.' },
        { n: 20, label: 'Final session. PCL-5, CAPS-5, BDI-II, sleep assessment. Create maintenance plan. Monthly booster sessions recommended.' },
      ],
      contraindications: ['Active psychosis or dissociative disorder (adjust protocol first)', 'Active self-harm or suicidal crisis', 'Substance intoxication during session', 'Severe TBI affecting EEG reliability'],
      outcomes: ['PCL-5 reduction of 15–20 points by session 10', 'Nightmare frequency reduction 60–70% by session 15', 'Improved sleep quality (PSQI) in majority by session 8', 'Sustained improvement at 12-month follow-up in prior studies'],
      inclusion: 'Adults 18+ with PTSD (DSM-5), PCL-5 ≥ 33, cleared for outpatient trauma work.',
      exclusion: 'Active psychosis, severe dissociation without stabilisation, current substance abuse.',
      comments: [
        { author: 'Dr. M. Fisher', institution: 'Trauma Recovery Center', date: '2025-11-20', stars: 5, text: 'We have run this protocol for over 5 years with veterans. The dream imagery reports in sessions 8–12 are remarkable. Strongly recommend experienced facilitation.' },
        { author: 'Dr. Y. Cohen', institution: 'Tel Aviv University', date: '2025-08-12', stars: 4, text: 'Excellent for chronic PTSD. Patients who failed EMDR or CBT often respond well here. Requires significant clinical skill to manage abreactions.' },
        { author: 'NP C. Reyes', institution: 'VA San Diego', date: '2025-06-02', stars: 5, text: 'Changed how I work with combat veterans. The protocol is well-laid-out and the outcome tracking section is thorough.' },
      ],
      ratingDist: [38, 40, 14, 5, 3],
    },
    {
      id: 'mp5', name: 'SMR/Beta Training — ADHD Pediatric Protocol', modality: 'Neurofeedback',
      conditions: ['ADHD'], evidence: 'Level II', rating: 4.4, downloads: 743, sessions: 40,
      author: 'Dr. J. Lubar', institution: 'Univ. of Tennessee', publishDate: '2019-04-10',
      tags: ['SMR', 'beta', 'ADHD', 'pediatric', 'attention'],
      desc: 'The classic Lubar SMR/beta neurofeedback protocol for pediatric ADHD. Rewards sensorimotor rhythm (SMR, 12–15 Hz) at Cz to increase focused attention and reduce hyperactivity, while inhibiting theta (4–8 Hz) associated with inattentiveness. One of the most extensively replicated neurofeedback protocols in clinical literature.',
      params: { targetFrequencies: 'SMR 12–15 Hz reward; Beta 15–18 Hz reward (alternating)', electrodePlacement: 'Cz (central vertex)', rewardBands: 'SMR 12–15 Hz amplitude up; Beta 15–18 Hz amplitude up', inhibitBands: 'Theta 4–8 Hz inhibit; Delta 1–4 Hz inhibit', sessionDuration: '30–45 min', protocolVariant: 'Lubar SMR/theta protocol (standard)' },
      refs: [
        'Lubar JF & Shouse MN (1976). EEG and behavioral changes in a hyperkinetic child concurrent with training of the sensorimotor rhythm. Biofeedback Self Regul 1:293–306.',
        'Arns M et al. (2009). Efficacy of neurofeedback treatment in ADHD: the effects on inattention, impulsivity and hyperactivity. Clin EEG Neurosci 40:180–189. (meta-analysis, ES=0.81)',
        'Gevensleben H et al. (2009). Is neurofeedback an efficacious treatment for ADHD? A randomised controlled clinical trial. J Child Psychol Psychiatry 50:780–789.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'QEEG baseline (eyes open/closed 2 min each). Conners Parent/Teacher scale baseline. Introduce game-based feedback interface.' },
        { n: 2, label: 'First SMR training block (15 min). Child orients to feedback display. Explain reward/inhibit concept in age-appropriate terms.' },
        { n: 5, label: 'Increase session length to 40 min. Parent check-in on home behavior. Introduce cognitive task during second half of session.' },
        { n: 10, label: 'Conners reassessment. Show EEG trend data to parent. Theta/beta ratio comparison to baseline.' },
        { n: 20, label: 'Midpoint comprehensive assessment. Conners, CPRS, VADRS. School report if consented. Adjust protocol if minimal theta reduction observed.' },
        { n: 40, label: 'Final session. QEEG re-record. Conners, VADRS final. Transition to monthly booster plan. Review academic/behavioral outcomes with family.' },
      ],
      contraindications: ['Active seizure disorder (modify thresholds)', 'Very young children (< 6 years) — adapt feedback interface', 'Significant oppositional behavior preventing session engagement', 'Concurrent medication changes within 2 weeks (confounds response assessment)'],
      outcomes: ['Mean Conners ADHD Index reduction of 15–20 points by session 40', 'Theta/beta ratio normalization in 60–70% of completers', 'Durable results at 6-month follow-up without continued sessions', 'Parent-rated attention improvement reported from session 10–15 onward'],
      inclusion: 'Children 6–16, DSM-5 ADHD (any subtype), QEEG showing theta excess or SMR deficit.',
      exclusion: 'Active epilepsy (without neurologist clearance), IQ < 70, ASD with severe behavioral dysregulation.',
      comments: [
        { author: 'Dr. L. Steinberg', institution: "Children's Hospital Philadelphia", date: '2026-01-25', stars: 4, text: 'We have used this as our standard pediatric ADHD protocol for 8 years. The 40-session commitment is long but outcomes are meaningful and durable.' },
        { author: 'Dr. R. Monastra', institution: 'FNS of NY', date: '2025-09-08', stars: 5, text: 'Lubar protocol remains the gold standard for good reason. Our theta/beta normalization rates match published data closely.' },
        { author: 'NP T. Brennan', institution: 'Boston Brain Institute', date: '2025-05-14', stars: 4, text: 'Game-based interfaces improve engagement significantly in 8–12 year olds. I recommend supplementing with a structured reward system to maintain attendance.' },
      ],
      ratingDist: [35, 42, 16, 5, 2],
    },
    {
      id: 'mp6', name: 'Anodal tDCS M1 — Chronic Pain Management', modality: 'tDCS',
      conditions: ['Chronic Pain'], evidence: 'Level II', rating: 4.2, downloads: 418, sessions: 10,
      author: 'Dr. F. Fregni', institution: 'Harvard Medical School', publishDate: '2021-02-18',
      tags: ['tDCS', 'pain', 'M1', 'anodal', 'chronic-pain'],
      desc: 'Anodal tDCS applied to primary motor cortex (M1) contralateral to pain for chronic pain management. Exploits M1 stimulation effects on descending pain modulation pathways and thalamic gating mechanisms. Evidence supports efficacy in fibromyalgia, central sensitization, and musculoskeletal chronic pain syndromes.',
      params: { electrodeMontage: 'Anode C3/C4 (M1 contralateral) / Cathode supraorbital contralateral', currentMa: '2 mA', duration: '20 min', rampTime: '30s on / 30s off', sessions: '10 sessions (5/week × 2 weeks)' },
      refs: [
        'Fregni F et al. (2006). A randomized clinical trial of repetitive TMS and tDCS in fibromyalgia. J Pain 7:400–408.',
        'Riberto M et al. (2011). Efficacy of transcranial direct current stimulation coupled with a multidisciplinary rehabilitation program for the treatment of fibromyalgia. Open Rheumatol J 5:45–50.',
        'Mariano TY et al. (2016). Transcranial direct current stimulation for affective symptoms and functioning in chronic low back pain: a randomized, sham-controlled clinical trial. Pain Med 17:1–10.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'NRS pain baseline (11-point), BPI, PCS. Electrode placement check. Patient education on tingling/itching during ramp.' },
        { n: 2, label: 'First full therapeutic session. NRS pre/post. Monitor skin integrity under electrodes.' },
        { n: 5, label: 'End of week 1. NRS trend review. Any change in medication use noted. Side effects log reviewed.' },
        { n: 10, label: 'Final session. BPI, PCS, PGIC reassessment. Photograph electrode sites. Discuss maintenance interval (monthly booster).' },
      ],
      contraindications: ['Scalp wounds or eczema at electrode sites', 'Metallic intracranial implants', 'Active pregnancy', 'Severe cardiac arrhythmia (implanted device within field)', 'Recent head injury with skull fracture'],
      outcomes: ['NRS pain reduction of 2–3 points by session 10 in fibromyalgia', 'PGIC "much improved" or "very much improved" in ~40% of responders', 'Improved pain catastrophizing (PCS) scores at 4-week follow-up', 'Best outcomes in central sensitisation phenotype'],
      inclusion: 'Adults 18+ with chronic pain ≥ 3 months, NRS ≥ 4, stable medication regimen ≥ 4 weeks.',
      exclusion: 'Pacemaker, implanted brain stimulator, active malignancy at target site.',
      comments: [
        { author: 'Dr. S. Lefaucheur', institution: 'Henri Mondor Hospital', date: '2025-10-15', stars: 4, text: 'Reliable analgesia for central sensitization patients. We add a 30-min physical therapy session immediately post-stimulation which seems to potentiate effects.' },
        { author: 'Dr. A. Vaseghi', institution: 'UCLA Pain Center', date: '2025-07-20', stars: 4, text: 'Good protocol documentation. The NRS pre/post tracking is a useful clinical habit builder. We see 40–50% of patients reporting meaningful relief.' },
        { author: 'PT R. Nakamura', institution: 'Rehabilitation Sciences Institute', date: '2025-04-08', stars: 4, text: 'Works well in combination with manual therapy. Protocol clearly explains electrode placement which prevents errors I often see in community clinics.' },
      ],
      ratingDist: [28, 38, 22, 8, 4],
    },
    {
      id: 'mp7', name: 'Bifrontal tDCS — Treatment-Resistant Depression', modality: 'tDCS',
      conditions: ['Depression'], evidence: 'Level II', rating: 4.3, downloads: 389, sessions: 15,
      author: 'Dr. C. Brunoni', institution: 'USP Brazil', publishDate: '2022-09-05',
      tags: ['tDCS', 'depression', 'bifrontal', 'treatment-resistant'],
      desc: 'Bifrontal tDCS protocol from the SELECT-TDCS and ELECT-TDCS trials for moderate-to-severe depression. Anode over left DLPFC (F3), cathode over right DLPFC (F4). Validated as a standalone antidepressant and as augmentation with sertraline, achieving remission rates comparable to escitalopram in double-blind trials.',
      params: { electrodeMontage: 'Anode F3 (left DLPFC) / Cathode F4 (right DLPFC)', currentMa: '2 mA', duration: '30 min', rampTime: '30s ramp up/down', sessions: '15 sessions (5/week × 3 weeks)' },
      refs: [
        'Brunoni AR et al. (2013). The sertraline vs electrical current therapy for treating depression clinical study (SELECT-TDCS): results of the double-blind, randomized, non-inferiority trial. JAMA Psychiatry 70:383–391.',
        'Brunoni AR et al. (2017). Trial of electrical direct-current therapy versus escitalopram for depression. N Engl J Med 376:2523–2533. (n=245)',
        'Nakamura NS et al. (2023). Optimizing tDCS parameters for treatment-resistant depression: a meta-analysis. Brain Stimul 16:220–234.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'PHQ-9, MADRS baseline. Electrode placement tutorial. Written patient education handout provided. Skin impedance check.' },
        { n: 5, label: 'First week complete. PHQ-9 progress score. Document any sleep changes, energy, or irritability shifts.' },
        { n: 10, label: 'Midpoint MADRS. Review medication interactions (watch serotonergic augmentation effects).' },
        { n: 15, label: 'Final session. PHQ-9, MADRS, WHOQOL-Bref. Discuss response: continue with maintenance monthly, or transition to other modality.' },
      ],
      contraindications: ['Pacemaker or any active implanted electrical device', 'Scalp dermatitis at electrode sites', 'History of mania triggered by antidepressant therapy (relative)', 'Current ECT course'],
      outcomes: ['MADRS reduction ≥ 50% in 40% of patients in ELECT-TDCS trial', 'Remission rate 31% vs 23% escitalopram (non-inferior)', 'Combination with sertraline superior to either alone', 'Home tDCS feasibility demonstrated in multiple trials'],
      inclusion: 'Adults 18–65 with MDD (DSM-5), ≥ 1 failed antidepressant, MADRS ≥ 20.',
      exclusion: 'Bipolar I, active psychosis, ECT within 3 months, metallic cranial implants.',
      comments: [
        { author: 'Dr. E. Moreno', institution: 'Hospital das Clinicas', date: '2026-01-08', stars: 4, text: 'Protocol directly mirrors our ELECT-TDCS trial conditions. Excellent reproducibility in clinic — outcomes match what we published.' },
        { author: 'Dr. J. Brunelin', institution: 'INSERM Lyon', date: '2025-11-17', stars: 5, text: 'The bifrontal montage is ideal for depression. I use this as first-line neuromodulation before considering TMS for appropriate patients.' },
        { author: 'Dr. A. Valiengo', institution: 'IPq São Paulo', date: '2025-09-02', stars: 4, text: 'Strong evidence base and accessible cost makes this a compelling option for resource-limited settings. Home protocol adaptation is the next frontier.' },
      ],
      ratingDist: [30, 40, 20, 7, 3],
    },
    {
      id: 'mp8', name: 'HEG Coherence Training — Migraine & Headache', modality: 'HEG',
      conditions: ['Migraine'], evidence: 'Level III', rating: 4.1, downloads: 267, sessions: 20,
      author: 'Dr. J. Carmen', institution: 'Neurotherapy Center', publishDate: '2018-11-14',
      tags: ['HEG', 'migraine', 'headache', 'frontal', 'coherence'],
      desc: 'Hemoencephalography (HEG) biofeedback targeting prefrontal cortex blood oxygenation for migraine prevention. Patients learn to voluntarily increase frontal HEG signal, building vascular self-regulation in cortical regions implicated in migraine initiation. Effective in reducing migraine frequency and severity with no adverse effects.',
      params: { targetFrequencies: 'HEG ratio increase (prefrontal oxyHb/deoxyHb)', electrodePlacement: 'Fpz (medial prefrontal) primary; Fp1/Fp2 bilateral', rewardBands: 'HEG ratio amplitude uptraining', inhibitBands: 'N/A (HEG not EEG)', sessionDuration: '20–30 min', protocolVariant: 'Near-infrared HEG (nIR-HEG)' },
      refs: [
        'Carmen JA (2004). Passive infrared hemoencephalography: four years and 100 migraineurs. J Neurotherapy 8:23–51.',
        'Hershfield J (2016). HEG neurofeedback for migraine: a retrospective analysis. NeuroRegulation 3:61–70.',
        'Toomim H & Carmen J (2009). Hemoencephalography: photonic measurement and biofeedback of cerebral activity. Biofeedback 37(3):99–104.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'Migraine diary baseline (frequency, intensity, duration, triggers). Sensor placement calibration. Brief HEG orientation.' },
        { n: 2, label: 'First training session. Patient practices "warming forehead" or attention/engagement strategies.' },
        { n: 5, label: 'Review migraine diary. Most patients report first changes in frequency or prodrome awareness by session 5.' },
        { n: 10, label: 'Midpoint migraine diary review. HEG baseline trend chart. Adjust session duration if plateau observed.' },
        { n: 20, label: 'Final session. Migraine diary analysis: frequency, duration, medication use compared to baseline. Self-regulation maintenance plan.' },
      ],
      contraindications: ['Active migraine at time of session (postpone until post-ictal window resolves)', 'Photosensitive epilepsy (LED feedback displays)', 'Scalp psoriasis at sensor site'],
      outcomes: ['50% reduction in migraine frequency in 60–70% of consistent trainees', 'Reduction in migraine medication days per month', 'Improved HEG baseline ratio maintained at 6-month follow-up', 'Patient-reported improvement in prodrome self-awareness'],
      inclusion: 'Adults 16+ with migraine (ICHD-3 criteria), ≥ 4 migraines/month, stable preventive medication.',
      exclusion: 'Medication overuse headache without concurrent taper, severe photophobia affecting sensor tolerance.',
      comments: [
        { author: 'Dr. D. Stauth', institution: 'Portland Neurofeedback', date: '2025-12-20', stars: 4, text: 'HEG for migraine is underutilized. Carmen protocol is well-documented. Patients appreciate the absence of pharmacological side effects.' },
        { author: 'Dr. L. Walker', institution: 'Behavioral Medicine Clinic', date: '2025-08-15', stars: 4, text: 'Good starting point for clinicians new to HEG. Session structure is practical. Consider adding autonomic biofeedback for vascular cases.' },
        { author: 'NP K. Hossain', institution: 'Headache Specialists', date: '2025-05-01', stars: 4, text: 'My migraine patients consistently rate this as their most effective non-drug intervention. A 20-session commitment is needed for durable results.' },
      ],
      ratingDist: [22, 38, 28, 8, 4],
    },
    {
      id: 'mp9', name: 'PEMF Delta Entrainment — Insomnia Protocol', modality: 'PEMF',
      conditions: ['Insomnia'], evidence: 'Level III', rating: 3.9, downloads: 198, sessions: 12,
      author: 'Dr. R. Sandyk', institution: 'NYU Sleep Center', publishDate: '2017-05-22',
      tags: ['PEMF', 'insomnia', 'sleep', 'delta', 'entrainment'],
      desc: 'Pulsed Electromagnetic Field therapy targeting delta frequency entrainment for primary insomnia. Low-intensity PEMF applied via cranial coil delivers 0.5–2 Hz pulsed fields to entrain slow-wave sleep oscillations, reduce sleep onset latency, and enhance deep sleep architecture. Best suited as adjunct to sleep hygiene and CBT-I.',
      params: { frequency: '0.5–2 Hz (delta entrainment)', intensity: '1–5 μT (very low intensity)', coilPosition: 'Bilateral temporal/occipital placement', pulsesPerSession: 'Continuous sinusoidal pulsed field', sessionsPerWeek: '3× per week', totalSessions: '12 sessions over 4 weeks' },
      refs: [
        'Sandyk R (1997). Treatment of insomnia with PEMF in patients with multiple sclerosis. Int J Neurosci 90:65–71.',
        'Pelka RB et al. (2001). Impulse magnetic-field therapy for insomnia: a double-blind, placebo-controlled study. Adv Ther 18:174–180.',
        'Pasche B et al. (1996). Effects of low-energy emission therapy in chronic psychophysiological insomnia. Sleep 19:327–336.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'ISI, PSQI baseline. Sleep diary start. Device placement tutorial. First 20-min delta entrainment session in clinic.' },
        { n: 3, label: 'Review first week sleep diary. Typical first changes: easier sleep onset by session 3–4.' },
        { n: 6, label: 'Mid-protocol ISI reassessment. Actigraphy data review if available. Discuss concurrent sleep hygiene adherence.' },
        { n: 12, label: 'Final session. ISI, PSQI, ESS post-treatment. Sleep diary 4-week summary analysis. Maintenance: 1× weekly home device if available.' },
      ],
      contraindications: ['Implanted electronic medical devices (pacemaker, insulin pump)', 'Pregnancy', 'Active cancer', 'Severe cardiovascular arrhythmia'],
      outcomes: ['ISI reduction of 6–8 points in responders', 'Sleep onset latency reduction of 20–30 min', 'Improved slow-wave sleep % on PSG in small trials', 'No withdrawal effects or dependency reported'],
      inclusion: 'Adults 22+ with chronic insomnia disorder (ICSD-3), ISI ≥ 15, not currently undergoing CBT-I (or as adjunct).',
      exclusion: 'Implanted electronic device, pregnancy, active oncological treatment.',
      comments: [
        { author: 'Dr. C. Drake', institution: 'Henry Ford Sleep Center', date: '2025-09-25', stars: 4, text: 'PEMF delta entrainment is niche but genuinely helpful for patients who reject pharmacology. Best combined with CBT-I in my experience.' },
        { author: 'NP M. Osei', institution: 'Integrative Sleep Medicine', date: '2025-06-10', stars: 4, text: 'Evidence level III is appropriate — this is not yet mainstream. But clinical response in my insomnia group has been encouraging.' },
        { author: 'Dr. A. Sadeh', institution: 'Tel Aviv University Sleep Lab', date: '2025-03-18', stars: 3, text: 'Moderate protocol. The delta entrainment mechanism is plausible. Needs larger RCT before I would use as primary intervention.' },
      ],
      ratingDist: [15, 32, 30, 15, 8],
    },
    {
      id: 'mp10', name: 'Gamma Burst Neurofeedback — Cognitive Enhancement TBI', modality: 'Neurofeedback',
      conditions: ['TBI'], evidence: 'Level II', rating: 4.5, downloads: 334, sessions: 24,
      author: 'Dr. K. Sterman', institution: 'UCLA', publishDate: '2020-10-08',
      tags: ['gamma', 'TBI', 'cognitive', 'neurofeedback', 'rehabilitation'],
      desc: 'Gamma frequency (36–44 Hz) neurofeedback for cognitive rehabilitation post-TBI. Targets disrupted gamma oscillations involved in working memory, attention integration, and sensory binding. Combines gamma uptraining at Fz/FCz with alpha desynchronization to restore corticothalamic coherence disrupted by traumatic injury.',
      params: { targetFrequencies: 'Gamma 36–44 Hz reward; Alpha 8–12 Hz inhibit', electrodePlacement: 'Fz (primary); FCz (secondary protocol)', rewardBands: 'Gamma burst amplitude increase', inhibitBands: 'Alpha 8–12 Hz; Theta 4–7 Hz inhibit', sessionDuration: '35–40 min', protocolVariant: 'Gamma uptraining + LORETA source feedback (advanced variant)' },
      refs: [
        'Thornton KE & Carmody DP (2009). Efficacy of QEEG-guided neurofeedback interventions for academic achievement: effects on memory, attention, processing speed, and mathematics. Appl Psychophysiol Biofeedback 34:105–120.',
        'Schoenberger NE et al. (2001). Flexyx neurotherapy system in the treatment of traumatic brain injury. J Head Trauma Rehabil 16:260–274.',
        'Todder D et al. (2010). Effects of transcranial direct current stimulation and neurofeedback on event-related potentials and memory performance in patients with TBI. J Neurotrauma 27:1827–1835.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'QEEG 19-channel baseline. RBANS cognitive battery, BRIEF-2. Identify primary deficits. Map gamma deficit zones.' },
        { n: 2, label: 'First gamma uptraining session. Emphasize active engagement — passive monitoring yields minimal gamma recruitment.' },
        { n: 6, label: 'Cognitive check-in. Patient/family report on real-world functioning changes. Adjust electrode priority site if indicated.' },
        { n: 12, label: 'Midpoint RBANS. QEEG interim. Typical improvements first seen in working memory and processing speed domains.' },
        { n: 24, label: 'Final QEEG re-record. RBANS full battery. BRIEF-2 final. Functional ADL rating. Discharge summary and maintenance plan.' },
      ],
      contraindications: ['Active psychosis or severe psychiatric comorbidity', 'Seizure disorder without clearance', 'Moderate-severe TBI with <6 months post-injury (allow recovery period)', 'Significant substance abuse confounding cognitive assessment'],
      outcomes: ['RBANS total score improvement of 10–18 points by session 24', 'Working memory index improvement most consistent (attention and delayed memory next)', 'Family and clinician-rated BRIEF-2 improvements in real-world executive function', 'Durable gains at 3-month follow-up in majority of completers'],
      inclusion: 'Adults 16–65, mild-moderate TBI (≥ 6 months post-injury), cognitive complaints, QEEG abnormality.',
      exclusion: 'Acute TBI phase, severe TBI with global cognitive impairment (MMSE < 18), active litigation incentive confound.',
      comments: [
        { author: 'Dr. T. Thornton', institution: 'Applied Neuroscience', date: '2026-02-14', stars: 5, text: 'Gamma uptraining continues to exceed expectations in our TBI population. The QEEG-guided site selection is key — generic protocols miss the individual deficit map.' },
        { author: 'Dr. C. Ayers', institution: 'UCSF Memory Center', date: '2025-10-05', stars: 4, text: 'Cognitive gains are meaningful and functional. The active engagement requirement during sessions is important to communicate to patients upfront.' },
        { author: 'NP F. Okello', institution: 'NeuroRehab Associates', date: '2025-07-22', stars: 5, text: 'My TBI patients consistently rate this as transformative. Combining with occupational therapy in the same week amplifies functional gains.' },
      ],
      ratingDist: [38, 40, 14, 5, 3],
    },
    {
      id: 'mp11', name: 'Multi-modal ADHD — NFB + tDCS Combined', modality: 'Multi-modal',
      conditions: ['ADHD'], evidence: 'Level II', rating: 4.6, downloads: 556, sessions: 20,
      author: 'Dr. T. Ros', institution: 'Geneva Neuroscience', publishDate: '2023-07-19',
      tags: ['multimodal', 'ADHD', 'combined', 'NFB', 'tDCS'],
      desc: 'Combined neurofeedback and tDCS protocol for ADHD in adolescents and adults. tDCS (2 mA, anode F3) is applied for the first 20 minutes concurrent with the start of each NFB session, priming left prefrontal cortex excitability and enhancing the neural plasticity window for subsequent EEG biofeedback training. Synergistic effects exceed either modality alone.',
      params: { targetFrequencies: 'Theta 4–8 Hz inhibit; Beta 15–18 Hz reward (NFB component)', electrodePlacement: 'Fz/Cz (NFB); F3 anode / right supraorbital cathode (tDCS)', rewardBands: 'Beta 15–18 Hz uptraining', inhibitBands: 'Theta 4–8 Hz; EMG inhibit', sessionDuration: '45 min total (20 min concurrent tDCS + NFB; 25 min NFB only)', protocolVariant: 'tDCS priming + NFB (sequential concurrent design)' },
      refs: [
        'Ros T et al. (2016). Tuning pathological brain oscillations with neurofeedback: a systems neuroscience framework. Front Hum Neurosci 10:1–22.',
        'Ditye T et al. (2012). Modulating behavioral inhibition by tDCS combined with cognitive training. Neuropsychologia 50:1372–1379.',
        'Haller S et al. (2019). Multimodal neuromodulation for ADHD: a pilot randomized controlled trial of combined tDCS-NFB. J Atten Disord 25:621–633.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'Baseline QEEG, Conners-3, BRIEF. Setup both tDCS montage and NFB electrodes simultaneously. Explain dual modality rationale to patient.' },
        { n: 2, label: 'First combined session. tDCS starts 2 min before NFB. Monitor comfort — patients may notice mild tingling from tDCS overlapping with NFB display.' },
        { n: 5, label: 'Conners check-in. Parent/self-report on behavioral changes. Most patients notice increased session alertness by session 3–5.' },
        { n: 10, label: 'Mid-protocol Conners-3. EEG theta/beta trend. Discuss with prescriber if medication adjustments are warranted due to improving baseline.' },
        { n: 20, label: 'Final session. QEEG re-record. Conners-3, BRIEF full. Neuropsychological battery if available. Maintenance: monthly booster tDCS-NFB sessions.' },
      ],
      contraindications: ['Cardiac pacemaker (tDCS component)', 'Active seizure disorder', 'Scalp dermatitis at electrode sites', 'Concurrent CNS stimulant medications may require monitoring (additive effect)'],
      outcomes: ['Conners ADHD Index reduction ~25 points by session 20 (superior to NFB alone)', 'Theta/beta ratio normalization in 70% of completers', 'BRIEF GEC score improvement in executive function domain', 'Effect maintained at 6-month follow-up in 80% of responders'],
      inclusion: 'Adolescents 14+ and adults with ADHD (DSM-5), Conners T-score ≥ 65, QEEG theta excess confirmed.',
      exclusion: 'Implanted electrical devices, active seizure, IQ < 75, concurrent moderate-severe depression without treatment.',
      comments: [
        { author: 'Dr. T. Ros', institution: 'Geneva Neuroscience', date: '2025-11-30', stars: 5, text: 'The concurrent tDCS priming window is critical — we found 20 min simultaneous onset outperforms sequential (tDCS then NFB) by a significant margin.' },
        { author: 'Dr. A. Arns', institution: 'Research Institute Brainclinics', date: '2025-09-14', stars: 5, text: 'Multimodal approach is the future of neurofeedback. Combining excitability priming with learning-based feedback makes clinical sense and the data backs it up.' },
        { author: 'NP S. Burke', institution: 'ADHD Treatment Center', date: '2025-07-04', stars: 4, text: 'Operationally complex to set up both devices simultaneously. We created a setup checklist based on this protocol that has reduced our prep time to 8 minutes.' },
      ],
      ratingDist: [44, 38, 12, 4, 2],
    },
    {
      id: 'mp12', name: 'Low-Frequency rTMS Right DLPFC — Anxiety & Panic', modality: 'TMS',
      conditions: ['Anxiety'], evidence: 'Level II', rating: 4.3, downloads: 445, sessions: 20,
      author: 'Dr. M. George', institution: 'MUSC', publishDate: '2021-05-25',
      tags: ['1Hz', 'rTMS', 'anxiety', 'right-DLPFC', 'inhibitory'],
      desc: 'Inhibitory 1 Hz rTMS applied to the right dorsolateral prefrontal cortex for generalized anxiety disorder and panic disorder. The right DLPFC is hyperactive in anxiety states; low-frequency inhibitory TMS normalizes this excitatory imbalance, reducing anxious arousal, worry, and autonomic hyperreactivity through corticolimbic down-regulation.',
      params: { frequency: '1 Hz (inhibitory)', intensity: '110% MT', coilPosition: 'Right DLPFC (F4)', pulsesPerSession: '1200', sessionsPerWeek: '5 (weeks 1–2) then 3× (weeks 3–4)', totalSessions: '20' },
      refs: [
        'Zwanzger P et al. (2009). Effects of inhibitory repetitive TMS in panic disorder. J Neural Transm 116:59–67.',
        'Diefenbach GJ et al. (2016). Feasibility and outcomes of a brief TMS intervention for anxiety. J Affect Disord 189:87–92.',
        'Dilkov D et al. (2017). Repetitive transcranial magnetic stimulation in the treatment of panic disorder. Medicine 96:e7387.',
      ],
      sessionBreakdown: [
        { n: 1, label: 'GAD-7, PDSS, BAI baseline. Right DLPFC F4 motor threshold. Patient education on inhibitory rationale.' },
        { n: 3, label: 'Continue 1 Hz protocol. GAD-7 weekly check. Patients often report reduced resting heart rate and improved sleep within first week.' },
        { n: 5, label: 'End of week 1. Panic diary review (frequency, severity, anticipatory anxiety). Side effect monitoring.' },
        { n: 10, label: 'Midpoint GAD-7, PDSS. Transition to 3× per week. Discuss subjective anxiety changes.' },
        { n: 20, label: 'Final session. GAD-7, PDSS, BAI, PGIC final. Discuss CBT integration if not already concurrent. Maintenance options.' },
      ],
      contraindications: ['Same as all rTMS protocols: metallic cranial implants, prior seizures', 'Active bipolar mania (low-frequency may be less risky but caution advised)', 'Concurrent high-dose benzodiazepine may attenuate response', 'Severe cardiac arrhythmia'],
      outcomes: ['GAD-7 reduction of 6–9 points by session 20', 'Panic attack frequency reduction 60–70% in completers', 'Sustained response at 3-month follow-up without booster in majority', 'Well tolerated: 1 Hz has lower headache rate than high-frequency protocols'],
      inclusion: 'Adults 18+ with GAD or Panic Disorder (DSM-5), GAD-7 ≥ 10, ≥ 1 SSRI/SNRI failure or intolerance.',
      exclusion: 'Active seizure disorder, metallic implants, bipolar I with active mania, severe OCD (consider OCD-specific protocol).',
      comments: [
        { author: 'Dr. M. George', institution: 'MUSC Brain Stimulation', date: '2026-01-22', stars: 5, text: 'We have been refining this protocol for 10 years. The 1 Hz right DLPFC approach is elegant — patients feel calmer within days rather than waiting weeks.' },
        { author: 'Dr. P. Zwanzger', institution: 'kbo-Inn-Salzach-Klinikum', date: '2025-11-05', stars: 4, text: 'Solid anxiety protocol. Particularly useful for patients who cannot tolerate SSRI side effects. Works best alongside concurrent CBT or ACT.' },
        { author: 'Dr. H. Pallanti', institution: 'Albert Einstein College', date: '2025-08-18', stars: 4, text: 'GAD and panic respond meaningfully. I add HRV biofeedback as a home-based complement between sessions for enhanced autonomic benefit.' },
      ],
      ratingDist: [32, 38, 20, 7, 3],
    },
  ];

  const PUBLISHED_SEED = [
    { id: 'pub1', name: 'Custom NFB Protocol — Autism Attention', publishDate: '2025-08-14', downloads: 89, rating: 4.2, status: 'Published', modality: 'Neurofeedback' },
    { id: 'pub2', name: 'tDCS Cerebellar — Balance TBI', publishDate: '2025-10-01', downloads: 43, rating: 3.8, status: 'Under Review', modality: 'tDCS' },
    { id: 'pub3', name: 'SMR Training — Schizophrenia Cognitive', publishDate: '2026-01-05', downloads: 12, rating: 0, status: 'Draft', modality: 'Neurofeedback' },
  ];

  // ── localStorage helpers ─────────────────────────────────────────────────
  function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }

  function getProtocols() {
    const stored = lsGet('ds_marketplace_protocols', null);
    if (!stored) { lsSet('ds_marketplace_protocols', MARKETPLACE_PROTOCOLS); return MARKETPLACE_PROTOCOLS; }
    return stored;
  }
  function getFavorites()  { return lsGet('ds_marketplace_favorites', []); }
  function getImports()    { return lsGet('ds_marketplace_imports', []); }
  function getPublished()  {
    const stored = lsGet('ds_published_protocols', null);
    if (!stored) { lsSet('ds_published_protocols', PUBLISHED_SEED); return PUBLISHED_SEED; }
    return stored;
  }
  function getUserProtocols() { return lsGet('ds_protocols', []); }

  // ── State ─────────────────────────────────────────────────────────────────
  let _activeTab = 'browse';
  let _searchQ = '';
  let _filterModality = 'All';
  let _filterCondition = 'All';
  let _filterEvidence = 'All';
  let _sortBy = 'popular';
  let _myOnly = false;
  let _expandedSessions = {};

  // ── Modality / evidence helpers ───────────────────────────────────────────
  function modalityClass(m) { return 'mod-' + m.replace(/\s+/g, '-'); }
  function evidenceClass(e) {
    if (e === 'Level I')   return 'ev-I';
    if (e === 'Level II')  return 'ev-II';
    if (e === 'Level III') return 'ev-III';
    return 'ev-consensus';
  }
  function evidenceShort(e) {
    if (e === 'Level I')          return 'Level I (RCT)';
    if (e === 'Level II')         return 'Level II';
    if (e === 'Level III')        return 'Level III';
    if (e === 'Expert Consensus') return 'Consensus';
    return e;
  }
  function starsHtml(r) {
    const full = Math.floor(r);
    const half = r - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  // ── Filter + sort protocols ───────────────────────────────────────────────
  function applyFilters(list) {
    let out = [...list];
    if (_searchQ) {
      const q = _searchQ.toLowerCase();
      out = out.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        p.institution.toLowerCase().includes(q) ||
        (p.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (p.conditions || []).some(c => c.toLowerCase().includes(q))
      );
    }
    if (_filterModality !== 'All') out = out.filter(p => p.modality === _filterModality);
    if (_filterCondition !== 'All') out = out.filter(p => (p.conditions || []).includes(_filterCondition));
    if (_filterEvidence !== 'All') {
      const map = {
        'Level I (RCT)': 'Level I', 'Level II (Controlled)': 'Level II',
        'Level III (Case Series)': 'Level III', 'Expert Consensus': 'Expert Consensus',
      };
      out = out.filter(p => p.evidence === (map[_filterEvidence] || _filterEvidence));
    }
    if (_sortBy === 'popular')   out.sort((a,b) => b.downloads - a.downloads);
    if (_sortBy === 'rating')    out.sort((a,b) => b.rating - a.rating);
    if (_sortBy === 'newest')    out.sort((a,b) => (b.publishDate||'').localeCompare(a.publishDate||''));
    if (_sortBy === 'downloads') out.sort((a,b) => b.downloads - a.downloads);
    return out;
  }

  // ── Card HTML ─────────────────────────────────────────────────────────────
  function buildCard(p) {
    const imports = getImports();
    const favs    = getFavorites();
    const isImported = imports.some(i => i.id === p.id);
    const isFav      = favs.includes(p.id);
    const condBadges = (p.conditions || []).map(c =>
      `<span class="kkk-tag" style="background:rgba(74,158,255,.07);border-color:rgba(74,158,255,.15);color:var(--accent-blue)">${c}</span>`
    ).join('');
    const tagBadges = (p.tags || []).slice(0, 4).map(t => `<span class="kkk-tag">${t}</span>`).join('');
    return `
      <div class="kkk-protocol-card modality-${p.modality.replace(/\s+/g,'-')}" id="card-${p.id}">
        ${isImported ? '<div class="kkk-imported-badge">✓ Imported</div>' : ''}
        <div class="kkk-card-header">
          <div class="kkk-card-title">${p.name}</div>
          <span class="kkk-modality-badge ${modalityClass(p.modality)}">${p.modality}</span>
        </div>
        <div class="kkk-card-meta">
          <span class="author">${p.author}</span>
          <span>${p.institution}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${condBadges}
          <span class="kkk-evidence-badge ${evidenceClass(p.evidence)}">${evidenceShort(p.evidence)}</span>
        </div>
        <div class="kkk-star-display">
          <span class="stars">${starsHtml(p.rating)}</span>
          <span class="rating-num">${p.rating.toFixed(1)}</span>
          <span class="dl-count">· ${p.downloads.toLocaleString()} downloads</span>
        </div>
        <div class="kkk-card-stats">
          <span>📋 ${p.sessions} sessions</span>
        </div>
        <div class="kkk-card-desc">${p.desc}</div>
        <div class="kkk-tags">${tagBadges}</div>
        <div class="kkk-card-actions">
          <button class="kkk-btn-preview" onclick="window._mpPreview('${p.id}')">Preview</button>
          <button class="kkk-btn-import ${isImported ? 'imported' : ''}" onclick="window._mpImport('${p.id}')" ${isImported ? 'disabled' : ''}>${isImported ? '✓ Imported' : 'Import'}</button>
          <button class="kkk-btn-fav ${isFav ? 'saved' : ''}" onclick="window._mpToggleFav('${p.id}')" title="${isFav ? 'Remove from favorites' : 'Save to favorites'}">${isFav ? '★' : '☆'}</button>
        </div>
      </div>`;
  }

  // ── Browse tab ────────────────────────────────────────────────────────────
  function buildBrowse() {
    const all = getProtocols();
    const filtered = applyFilters(all);
    const cards = filtered.length
      ? filtered.map(buildCard).join('')
      : `<div class="kkk-empty-state" style="grid-column:1/-1"><div class="ico">🔍</div><h3>No protocols found</h3><p>Try adjusting your search or filter criteria.</p></div>`;
    return `
      <div class="kkk-tab-bar">
        <button class="kkk-tab ${_activeTab==='browse'?'active':''}" onclick="window._mpTab('browse')">Browse Library</button>
        <button class="kkk-tab ${_activeTab==='published'?'active':''}" onclick="window._mpTab('published')">My Published</button>
        <button class="kkk-tab ${_activeTab==='publish'?'active':''}" onclick="window._mpTab('publish')">Publish Protocol</button>
      </div>
      <div class="kkk-results-bar">
        <span>${filtered.length} protocol${filtered.length!==1?'s':''} found</span>
        <select style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:.78rem;padding:4px 8px" onchange="window._mpSort(this.value)">
          <option value="popular" ${_sortBy==='popular'?'selected':''}>Most Popular</option>
          <option value="rating"  ${_sortBy==='rating'?'selected':''}>Highest Rated</option>
          <option value="newest"  ${_sortBy==='newest'?'selected':''}>Newest</option>
          <option value="downloads" ${_sortBy==='downloads'?'selected':''}>Most Downloaded</option>
        </select>
      </div>
      <div class="kkk-card-grid">${cards}</div>`;
  }

  // ── My Published tab ──────────────────────────────────────────────────────
  function buildPublished() {
    const published = getPublished();
    const rows = published.length ? published.map(p => {
      const statusClass = p.status === 'Published' ? 'kkk-status-published' : p.status === 'Draft' ? 'kkk-status-draft' : 'kkk-status-review';
      const ratingDisp  = p.rating > 0 ? `★ ${p.rating.toFixed(1)}` : 'No ratings yet';
      return `
        <div class="kkk-published-row">
          <div class="kkk-published-info">
            <div class="kkk-published-name">${p.name}</div>
            <div class="kkk-published-meta">${p.modality} · Published ${p.publishDate} · ${p.downloads} downloads · ${ratingDisp}</div>
          </div>
          <span class="kkk-status-badge ${statusClass}">${p.status}</span>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="kkk-btn-preview" onclick="window._mpEditPublished('${p.id}')">Edit</button>
            <button class="kkk-btn-fav"     onclick="window._mpUnpublish('${p.id}')">Unpublish</button>
            <button class="kkk-btn-import"  onclick="window._mpViewAnalytics('${p.id}')">Analytics</button>
          </div>
        </div>`;
    }).join('') : `<div class="kkk-empty-state"><div class="ico">📤</div><h3>No published protocols yet</h3><p>Share your clinical protocols with the community from the Publish Protocol tab.</p></div>`;

    return `
      <div class="kkk-tab-bar">
        <button class="kkk-tab ${_activeTab==='browse'?'active':''}" onclick="window._mpTab('browse')">Browse Library</button>
        <button class="kkk-tab ${_activeTab==='published'?'active':''}" onclick="window._mpTab('published')">My Published</button>
        <button class="kkk-tab ${_activeTab==='publish'?'active':''}" onclick="window._mpTab('publish')">Publish Protocol</button>
      </div>
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:16px;color:var(--text)">My Published Protocols</h3>
      ${rows}`;
  }

  // ── Publish tab ───────────────────────────────────────────────────────────
  function buildPublish() {
    const userProts = getUserProtocols();
    const opts = userProts.length
      ? userProts.map(p => `<option value="${p.id || p.name}">${p.name || 'Unnamed Protocol'}</option>`).join('')
      : '<option value="">No protocols in your library yet</option>';
    return `
      <div class="kkk-tab-bar">
        <button class="kkk-tab ${_activeTab==='browse'?'active':''}" onclick="window._mpTab('browse')">Browse Library</button>
        <button class="kkk-tab ${_activeTab==='published'?'active':''}" onclick="window._mpTab('published')">My Published</button>
        <button class="kkk-tab ${_activeTab==='publish'?'active':''}" onclick="window._mpTab('publish')">Publish Protocol</button>
      </div>
      <div style="max-width:640px">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:4px;color:var(--text)">Share a Protocol with the Community</h3>
        <p style="font-size:.84rem;color:var(--text-muted);margin-bottom:20px">Published protocols are reviewed by our clinical team before appearing in the marketplace. Submissions are typically reviewed within 5 business days.</p>
        <div class="kkk-form-row">
          <label>Select Protocol from Your Library</label>
          <select id="pub-select">${opts}</select>
        </div>
        <div class="kkk-form-row">
          <label>Public Description (2–4 sentences)</label>
          <textarea id="pub-desc" rows="3" placeholder="Describe the protocol's clinical application, target population, and key evidence base..."></textarea>
        </div>
        <div class="kkk-form-row">
          <label>Tags (comma-separated)</label>
          <input type="text" id="pub-tags" placeholder="e.g. depression, DLPFC, rTMS, evidence-based">
        </div>
        <div class="kkk-form-row">
          <label>Intended Conditions Treated</label>
          <input type="text" id="pub-conditions" placeholder="e.g. Depression, Anxiety, PTSD">
        </div>
        <div class="kkk-form-row">
          <label>Contraindications</label>
          <textarea id="pub-contra" rows="2" placeholder="List key contraindications, one per line..."></textarea>
        </div>
        <div class="kkk-form-row">
          <label>Evidence Level</label>
          <select id="pub-evidence">
            <option value="Level I">Level I — RCT / Meta-analysis</option>
            <option value="Level II" selected>Level II — Controlled Study</option>
            <option value="Level III">Level III — Case Series / Retrospective</option>
            <option value="Expert Consensus">Expert Consensus</option>
          </select>
        </div>
        <div class="kkk-form-row">
          <label>Evidence References (one per line)</label>
          <textarea id="pub-refs" rows="3" placeholder="Author et al. (Year). Title. Journal vol:pages."></textarea>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn-primary" style="padding:9px 22px" onclick="window._mpSubmitPublish()">Submit for Review</button>
          <button class="btn-secondary" style="padding:9px 16px" onclick="window._mpPreviewPublish()">Preview Submission</button>
        </div>
      </div>`;
  }

  // ── Preview modal ─────────────────────────────────────────────────────────
  function buildPreviewModal(p) {
    const imports = getImports();
    const isImported = imports.some(i => i.id === p.id);

    // Params grid
    const paramEntries = Object.entries(p.params || {});
    const paramGrid = paramEntries.map(([k,v]) => `
      <div class="kkk-param-cell">
        <div class="kkk-param-label">${k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</div>
        <div class="kkk-param-val">${v}</div>
      </div>`).join('');

    // Rating distribution
    const dist = p.ratingDist || [0,0,0,0,0];
    const total = dist.reduce((a,b)=>a+b,0)||1;
    const ratingBars = [5,4,3,2,1].map((star,i) => {
      const count = dist[i] || 0;
      const pct = Math.round((count/total)*100);
      return `
        <div class="kkk-star-bar-row">
          <span style="width:30px;text-align:right;color:var(--text-muted);font-size:.75rem">${star}★</span>
          <div class="kkk-star-bar-track"><div class="kkk-star-bar-fill" style="width:${pct}%"></div></div>
          <span style="width:28px;color:var(--text-muted);font-size:.75rem">${pct}%</span>
        </div>`;
    }).join('');

    // Session breakdown
    const sessions = p.sessionBreakdown || [];
    const visibleSessions = _expandedSessions[p.id] ? sessions : sessions.slice(0,5);
    const sessHtml = visibleSessions.map(s => `
      <div class="kkk-session-row">
        <div class="kkk-session-num">${s.n}</div>
        <div style="flex:1;color:var(--text-muted);line-height:1.5">${s.label}</div>
      </div>`).join('');
    const expandBtn = sessions.length > 5 && !_expandedSessions[p.id]
      ? `<button class="kkk-btn-preview" style="margin-top:10px" onclick="window._mpExpandSessions('${p.id}')">See full protocol (${sessions.length - 5} more sessions)</button>`
      : '';

    // Refs
    const refsHtml = (p.refs||[]).map(r => `<div style="font-size:.8rem;color:var(--text-muted);padding:5px 0;border-bottom:1px solid var(--border);line-height:1.5">${r}</div>`).join('');

    // Contraindications
    const contraHtml = (p.contraindications||[]).map(c=>`<li>${c}</li>`).join('');

    // Outcomes
    const outcomesHtml = (p.outcomes||[]).map(o=>`<div class="kkk-outcome-item">${o}</div>`).join('');

    // Comments
    const commHtml = (p.comments||[]).map(c => `
      <div class="kkk-comment">
        <div class="kkk-comment-header">
          <div>
            <span class="kkk-comment-author">${c.author}</span>
            <span style="color:var(--text-muted);font-size:.75rem;margin-left:6px">${c.institution}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:#f59e0b;font-size:.78rem">${'★'.repeat(c.stars || 5)}</span>
            <span class="kkk-comment-date">${c.date}</span>
          </div>
        </div>
        <div class="kkk-comment-body">${c.text}</div>
      </div>`).join('');

    return `
      <div class="kkk-preview-modal" id="mp-preview-modal" onclick="window._mpClosePreview(event)">
        <div class="kkk-preview-inner">
          <button class="kkk-preview-close" onclick="window._mpClosePreviewBtn()">✕</button>
          <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:6px">
            <span class="kkk-modality-badge ${modalityClass(p.modality)}" style="font-size:.73rem">${p.modality}</span>
            <span class="kkk-evidence-badge ${evidenceClass(p.evidence)}">${evidenceShort(p.evidence)}</span>
          </div>
          <div class="kkk-preview-title">${p.name}</div>
          <div class="kkk-preview-sub">${p.author} · ${p.institution} · Published ${p.publishDate || 'N/A'}</div>

          <div class="kkk-star-display" style="margin-bottom:20px">
            <span class="stars">${starsHtml(p.rating)}</span>
            <span class="rating-num">${p.rating.toFixed(1)}</span>
            <span class="dl-count">· ${p.downloads.toLocaleString()} downloads · ${p.sessions} sessions</span>
          </div>

          <div class="kkk-preview-section">
            <div class="kkk-preview-section-title">Protocol Overview</div>
            <p style="font-size:.84rem;color:var(--text-muted);line-height:1.65;margin:0">${p.desc}</p>
          </div>

          <div class="kkk-preview-section">
            <div class="kkk-preview-section-title">Protocol Parameters</div>
            <div class="kkk-param-grid">${paramGrid}</div>
          </div>

          <div class="kkk-preview-section">
            <div class="kkk-preview-section-title">Evidence Base</div>
            ${refsHtml || '<p style="font-size:.82rem;color:var(--text-muted)">No references provided.</p>'}
          </div>

          <div class="kkk-preview-section">
            <div class="kkk-preview-section-title">Session-by-Session Breakdown</div>
            ${sessHtml}${expandBtn}
          </div>

          <div class="kkk-preview-section">
            <div class="kkk-preview-section-title">Patient Selection</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <div style="font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Inclusion Criteria</div>
                <p style="font-size:.82rem;color:var(--text-muted);margin:0;line-height:1.55">${p.inclusion || 'Not specified'}</p>
              </div>
              <div>
                <div style="font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Exclusion Criteria</div>
                <p style="font-size:.82rem;color:var(--text-muted);margin:0;line-height:1.55">${p.exclusion || 'Not specified'}</p>
              </div>
            </div>
          </div>

          <div class="kkk-preview-section">
            <div class="kkk-preview-section-title">Contraindications</div>
            <ul class="kkk-contra-list">${contraHtml}</ul>
          </div>

          <div class="kkk-preview-section">
            <div class="kkk-preview-section-title">Expected Outcomes</div>
            <div class="kkk-outcome-list">${outcomesHtml}</div>
          </div>

          <div class="kkk-preview-section">
            <div class="kkk-preview-section-title">User Ratings</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start">
              <div style="text-align:center;padding:12px 20px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px">
                <div style="font-size:2.4rem;font-weight:800;color:var(--text);line-height:1">${p.rating.toFixed(1)}</div>
                <div style="color:#f59e0b;font-size:1rem;margin:4px 0">${starsHtml(p.rating)}</div>
                <div style="font-size:.72rem;color:var(--text-muted)">${p.downloads.toLocaleString()} ratings</div>
              </div>
              <div>${ratingBars}</div>
            </div>
          </div>

          <div class="kkk-preview-section">
            <div class="kkk-preview-section-title">Clinician Comments</div>
            ${commHtml}
          </div>

          <div style="padding-top:16px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:center">
            <button class="btn-primary" style="padding:9px 22px" onclick="window._mpImport('${p.id}');window._mpClosePreviewBtn()" ${isImported?'disabled':''}>
              ${isImported ? '✓ Already Imported' : 'Import to My Protocols'}
            </button>
            <button class="kkk-btn-fav" onclick="window._mpToggleFav('${p.id}')" id="mp-modal-fav-${p.id}">
              ${getFavorites().includes(p.id) ? '★ Saved' : '☆ Save to Favorites'}
            </button>
            <span style="font-size:.78rem;color:var(--text-muted);margin-left:auto">${p.sessions} sessions · ${p.conditions?.join(', ')}</span>
          </div>
        </div>
      </div>`;
  }

  // ── Analytics modal ───────────────────────────────────────────────────────
  function buildAnalyticsModal(pub) {
    // 12-week download trend (SVG)
    const weeks = Array.from({length:12},(_,i) => Math.round(pub.downloads * (0.03 + Math.random()*0.14)));
    const mx = Math.max(...weeks,1);
    const W=440, H=80;
    const pts = weeks.map((v,i)=>{
      const x=(i/(weeks.length-1))*(W-20)+10;
      const y=H-((v/mx)*(H-16))-2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const bars = weeks.map((v,i)=>{
      const x=(i/(weeks.length-1))*(W-20)+10;
      const bh=((v/mx)*(H-16));
      return `<rect x="${(x-6).toFixed(1)}" y="${(H-bh-2).toFixed(1)}" width="12" height="${bh.toFixed(1)}" rx="2" fill="rgba(0,212,188,.35)"/>`;
    }).join('');
    const trend = `<svg width="${W}" height="${H}" style="overflow:visible">${bars}<polyline points="${pts}" fill="none" stroke="var(--accent-teal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;

    const cities = [
      {city:'New York', pct:28}, {city:'Los Angeles',pct:21}, {city:'Toronto',pct:17}, {city:'London',pct:14},
    ];
    const condUsage = (pub.modality ? [
      {label:pub.modality,pct:62},{label:'Co-morbid cases',pct:24},{label:'Research use',pct:14}
    ] : []);

    return `
      <div class="kkk-analytics-modal" id="mp-analytics-modal" onclick="window._mpCloseAnalytics(event)">
        <div class="kkk-analytics-inner">
          <button class="kkk-preview-close" onclick="window._mpCloseAnalyticsBtn()" style="top:14px;right:14px">✕</button>
          <h3 style="font-size:1rem;font-weight:800;color:var(--text);margin-bottom:4px;padding-right:40px">${pub.name}</h3>
          <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:20px">${pub.status} · ${pub.downloads} total downloads · ${pub.rating > 0 ? `★ ${pub.rating.toFixed(1)}` : 'No ratings yet'}</p>

          <div style="margin-bottom:20px">
            <div class="kkk-preview-section-title" style="font-size:.7rem;color:var(--accent-teal);font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px">Download Trend (Last 12 Weeks)</div>
            <div style="overflow-x:auto">${trend}</div>
            <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--text-muted);margin-top:4px;padding:0 10px">
              <span>12w ago</span><span>Now</span>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div>
              <div class="kkk-preview-section-title" style="font-size:.7rem;color:var(--accent-teal);font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px">Usage by Condition</div>
              ${condUsage.map(c=>`
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:.8rem">
                  <span style="flex:1;color:var(--text-muted)">${c.label}</span>
                  <div style="width:80px;height:5px;background:var(--bg-secondary);border-radius:3px;overflow:hidden">
                    <div style="width:${c.pct}%;height:100%;background:var(--accent-blue);border-radius:3px"></div>
                  </div>
                  <span style="color:var(--text);font-weight:600;min-width:30px">${c.pct}%</span>
                </div>`).join('')}
            </div>
            <div>
              <div class="kkk-preview-section-title" style="font-size:.7rem;color:var(--accent-teal);font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px">Top Locations</div>
              ${cities.map(c=>`
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:.8rem">
                  <span style="flex:1;color:var(--text-muted)">${c.city}</span>
                  <div style="width:80px;height:5px;background:var(--bg-secondary);border-radius:3px;overflow:hidden">
                    <div style="width:${c.pct}%;height:100%;background:var(--accent-violet);border-radius:3px"></div>
                  </div>
                  <span style="color:var(--text);font-weight:600;min-width:30px">${c.pct}%</span>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function renderMain() {
    const mainEl = document.getElementById('kkk-main');
    if (!mainEl) return;
    if (_activeTab === 'browse')    mainEl.innerHTML = buildBrowse();
    if (_activeTab === 'published') mainEl.innerHTML = buildPublished();
    if (_activeTab === 'publish')   mainEl.innerHTML = buildPublish();
  }

  // ── Sidebar HTML ─────────────────────────────────────────────────────────
  function buildSidebar() {
    return `
      <div class="kkk-filter-group">
        <label>Search</label>
        <input type="text" id="mp-search" placeholder="Protocol name, author, tag…" value="${_searchQ}" oninput="window._mpSearch(this.value)">
      </div>
      <div class="kkk-filter-group">
        <label>Modality</label>
        <select onchange="window._mpFilter('modality',this.value)">
          ${['All','TMS','Neurofeedback','tDCS','Biofeedback','PEMF','HEG','Multi-modal'].map(m=>
            `<option value="${m}" ${_filterModality===m?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="kkk-filter-group">
        <label>Condition</label>
        <select onchange="window._mpFilter('condition',this.value)">
          ${['All','ADHD','Depression','Anxiety','PTSD','OCD','Insomnia','Chronic Pain','TBI','Autism','Migraine','Schizophrenia'].map(c=>
            `<option value="${c}" ${_filterCondition===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="kkk-filter-group">
        <label>Evidence Level</label>
        <select onchange="window._mpFilter('evidence',this.value)">
          ${['All','Level I (RCT)','Level II (Controlled)','Level III (Case Series)','Expert Consensus'].map(e=>
            `<option value="${e}" ${_filterEvidence===e?'selected':''}>${e}</option>`).join('')}
        </select>
      </div>
      <label class="kkk-filter-toggle ${_myOnly?'active':''}" onclick="window._mpToggleMyOnly()">
        <input type="checkbox" ${_myOnly?'checked':''} onclick="event.stopPropagation()"> My Published Protocols
      </label>
      <div style="border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Quick Stats</div>
        ${(() => {
          const all = getProtocols();
          const imps = getImports();
          const favs = getFavorites();
          return `
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="font-size:.8rem;color:var(--text-muted);display:flex;justify-content:space-between"><span>Total Protocols</span><strong style="color:var(--text)">${all.length}</strong></div>
              <div style="font-size:.8rem;color:var(--text-muted);display:flex;justify-content:space-between"><span>Imported</span><strong style="color:var(--accent-teal)">${imps.length}</strong></div>
              <div style="font-size:.8rem;color:var(--text-muted);display:flex;justify-content:space-between"><span>Favorites</span><strong style="color:#f59e0b">${favs.length}</strong></div>
            </div>`;
        })()}
      </div>`;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg, isSuccess = true) {
    let t = document.getElementById('kkk-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'kkk-toast';
      t.className = 'kkk-toast';
      document.body.appendChild(t);
    }
    t.textContent = (isSuccess ? '✓ ' : '⚠ ') + msg;
    t.style.borderColor = isSuccess ? 'rgba(0,212,188,.3)' : 'rgba(245,158,11,.3)';
    t.classList.add('show');
    clearTimeout(window._kkkToastTimer);
    window._kkkToastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ── DOM injection ─────────────────────────────────────────────────────────
  document.getElementById('app-content').innerHTML = `
    <div class="kkk-marketplace-layout" id="kkk-root" style="height:calc(100vh - 64px)">
      <aside class="kkk-sidebar" id="kkk-sidebar">${buildSidebar()}</aside>
      <main class="kkk-main-content" id="kkk-main"></main>
    </div>`;

  renderMain();

  // ── Window handlers ───────────────────────────────────────────────────────

  window._mpTab = function(tab) {
    _activeTab = tab;
    renderMain();
    // Also refresh sidebar stats
    const sb = document.getElementById('kkk-sidebar');
    if (sb) sb.innerHTML = buildSidebar();
  };

  window._mpSearch = function(val) {
    _searchQ = val;
    renderMain();
  };

  window._mpFilter = function(type, val) {
    if (type === 'modality')  _filterModality  = val;
    if (type === 'condition') _filterCondition = val;
    if (type === 'evidence')  _filterEvidence  = val;
    renderMain();
    // Keep sidebar in sync
    const sb = document.getElementById('kkk-sidebar');
    if (sb) sb.innerHTML = buildSidebar();
  };

  window._mpSort = function(val) {
    _sortBy = val;
    renderMain();
  };

  window._mpToggleMyOnly = function() {
    _myOnly = !_myOnly;
    renderMain();
    const sb = document.getElementById('kkk-sidebar');
    if (sb) sb.innerHTML = buildSidebar();
  };

  window._mpPreview = function(id) {
    const protos = getProtocols();
    const p = protos.find(x => x.id === id);
    if (!p) return;
    document.body.insertAdjacentHTML('beforeend', buildPreviewModal(p));
    document.body.style.overflow = 'hidden';
  };

  window._mpClosePreview = function(e) {
    if (e.target.id === 'mp-preview-modal') window._mpClosePreviewBtn();
  };

  window._mpClosePreviewBtn = function() {
    const m = document.getElementById('mp-preview-modal');
    if (m) { m.remove(); document.body.style.overflow = ''; }
  };

  window._mpExpandSessions = function(id) {
    _expandedSessions[id] = true;
    const protos = getProtocols();
    const p = protos.find(x => x.id === id);
    if (!p) return;
    // Rebuild just the session section
    const modal = document.getElementById('mp-preview-modal');
    if (modal) { modal.remove(); document.body.style.overflow = ''; }
    document.body.insertAdjacentHTML('beforeend', buildPreviewModal(p));
    document.body.style.overflow = 'hidden';
  };

  window._mpImport = function(id) {
    const protos = getProtocols();
    const p = protos.find(x => x.id === id);
    if (!p) return;
    const imports = getImports();
    if (imports.some(i => i.id === id)) { showToast('Already imported to your protocols'); return; }
    // Add to import history
    imports.push({ id, name: p.name, importedAt: new Date().toISOString() });
    lsSet('ds_marketplace_imports', imports);
    // Also add to ds_protocols if not present
    const userProts = getUserProtocols();
    if (!userProts.some(u => u.marketplaceId === id || u.name === p.name)) {
      userProts.push({
        id: 'imported_' + id + '_' + Date.now(),
        marketplaceId: id,
        name: p.name,
        modality: p.modality,
        conditions: p.conditions,
        sessions: p.sessions,
        importedFrom: 'marketplace',
        importedAt: new Date().toISOString(),
        params: p.params,
        author: p.author,
        institution: p.institution,
      });
      lsSet('ds_protocols', userProts);
    }
    showToast(`"${p.name}" imported to your protocols`);
    // Refresh card in grid
    const cardEl = document.getElementById('card-' + id);
    if (cardEl) {
      const newCard = document.createElement('div');
      newCard.innerHTML = buildCard(p);
      cardEl.replaceWith(newCard.firstElementChild);
    }
    // Refresh sidebar stats
    const sb = document.getElementById('kkk-sidebar');
    if (sb) sb.innerHTML = buildSidebar();
  };

  window._mpToggleFav = function(id) {
    const favs = getFavorites();
    const idx = favs.indexOf(id);
    if (idx === -1) { favs.push(id); showToast('Saved to favorites'); }
    else { favs.splice(idx, 1); showToast('Removed from favorites', false); }
    lsSet('ds_marketplace_favorites', favs);
    // Update card fav button
    const cardEl = document.getElementById('card-' + id);
    if (cardEl) {
      const btn = cardEl.querySelector('.kkk-btn-fav');
      if (btn) {
        btn.textContent = favs.includes(id) ? '★' : '☆';
        btn.classList.toggle('saved', favs.includes(id));
      }
    }
    // Update modal fav button if open
    const modalFavBtn = document.getElementById('mp-modal-fav-' + id);
    if (modalFavBtn) modalFavBtn.textContent = favs.includes(id) ? '★ Saved' : '☆ Save to Favorites';
    // Refresh sidebar
    const sb = document.getElementById('kkk-sidebar');
    if (sb) sb.innerHTML = buildSidebar();
  };

  window._mpEditPublished = function(id) {
    showToast('Opening editor for published protocol…', true);
  };

  window._mpUnpublish = function(id) {
    const pubs = getPublished();
    const p = pubs.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Unpublish "${p.name}" from the marketplace?`)) return;
    const updated = pubs.map(x => x.id === id ? {...x, status:'Draft'} : x);
    lsSet('ds_published_protocols', updated);
    showToast(`"${p.name}" moved to Draft`);
    renderMain();
  };

  window._mpViewAnalytics = function(id) {
    const pubs = getPublished();
    const p = pubs.find(x => x.id === id);
    if (!p) return;
    document.body.insertAdjacentHTML('beforeend', buildAnalyticsModal(p));
    document.body.style.overflow = 'hidden';
  };

  window._mpCloseAnalytics = function(e) {
    if (e.target.id === 'mp-analytics-modal') window._mpCloseAnalyticsBtn();
  };

  window._mpCloseAnalyticsBtn = function() {
    const m = document.getElementById('mp-analytics-modal');
    if (m) { m.remove(); document.body.style.overflow = ''; }
  };

  window._mpSubmitPublish = function() {
    const desc  = document.getElementById('pub-desc')?.value?.trim();
    const sel   = document.getElementById('pub-select')?.value;
    if (!sel)  { showToast('Please select a protocol from your library', false); return; }
    if (!desc) { showToast('Please add a public description', false); return; }
    const tags      = (document.getElementById('pub-tags')?.value||'').split(',').map(t=>t.trim()).filter(Boolean);
    const conds     = (document.getElementById('pub-conditions')?.value||'').split(',').map(c=>c.trim()).filter(Boolean);
    const contra    = document.getElementById('pub-contra')?.value?.trim();
    const evidence  = document.getElementById('pub-evidence')?.value || 'Level II';
    const refs      = (document.getElementById('pub-refs')?.value||'').split('\n').map(r=>r.trim()).filter(Boolean);
    const pubs = getPublished();
    pubs.push({
      id: 'pub_' + Date.now(),
      name: sel,
      publishDate: new Date().toISOString().slice(0,10),
      downloads: 0,
      rating: 0,
      status: 'Under Review',
      modality: 'Custom',
      desc, tags, conditions: conds, contraindications: contra, evidence, refs,
    });
    lsSet('ds_published_protocols', pubs);
    showToast('Protocol submitted for review');
    _activeTab = 'published';
    renderMain();
    const sb = document.getElementById('kkk-sidebar');
    if (sb) sb.innerHTML = buildSidebar();
  };

  window._mpPreviewPublish = function() {
    const sel  = document.getElementById('pub-select')?.value;
    const desc = document.getElementById('pub-desc')?.value?.trim();
    if (!sel) { showToast('Please select a protocol first', false); return; }
    showToast(`Preview: "${sel}" — ${desc ? desc.slice(0,60)+'…' : 'No description yet'}`, true);
  };

  // Keyboard escape closes modals
  window._mpKeyHandler = function(e) {
    if (e.key === 'Escape') {
      window._mpClosePreviewBtn?.();
      window._mpCloseAnalyticsBtn?.();
    }
  };
  document.addEventListener('keydown', window._mpKeyHandler);
}
