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
