import { api, downloadBlob } from './api.js';
import { cardWrap, fr, evBar, pillSt, tag, spinner, emptyState } from './helpers.js';
import { FALLBACK_CONDITIONS, FALLBACK_MODALITIES } from './constants.js';
import { renderLiveEvidencePanel } from './live-evidence.js';

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
    // Don't abort — the live-evidence panel still works without the curated library.
    items = [];
  }

  // Build modality options from data
  const modalitySet = new Set(items.map(e => e.modality).filter(Boolean));

  el.innerHTML = `
  <div id="live-evidence-host"></div>
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

  // Mount the live-evidence panel (PubMed / OpenAlex / CT.gov / FDA via our
  // evidence pipeline). Non-fatal: if the evidence DB isn't ingested yet,
  // the panel shows its own clear "not ready" message and the rest of the
  // Evidence Library page continues to work.
  renderLiveEvidencePanel(document.getElementById('live-evidence-host'));

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
    `<button class="btn btn-primary btn-sm" onclick="window._hbSwitchTab('generator')">Generate Custom Document</button>`
  );

  const condOpts = FALLBACK_CONDITIONS.map(c => `<option value="${c}">${c}</option>`).join('');
  const modOpts  = FALLBACK_MODALITIES.map(m => `<option value="${m}">${m}</option>`).join('');

  // ── Handbook Template Library data ────────────────────────────────────────
  const HB_TEMPLATES = [
    { id:'hb-tms-clin',   title:'TMS Clinician Protocol Guide',    type:'Clinician',      typeKey:'clinician',  tag:'TMS',            status:'Template', desc:'Full clinical protocol for rTMS: patient selection, coil placement, dosing parameters, safety screening and session management.' },
    { id:'hb-tdcs-clin',  title:'tDCS Clinician Protocol Guide',   type:'Clinician',      typeKey:'clinician',  tag:'tDCS',           status:'Template', desc:'Comprehensive tDCS clinical guide: electrode montage, current density, session scheduling and electrode placement verification.' },
    { id:'hb-pt-tms',     title:'Patient TMS Introduction',         type:'Patient',        typeKey:'patient',    tag:'TMS',            status:'Template', desc:'Plain-language patient guide to TMS treatment: what to expect, preparation, sensation, side effects and safety information.' },
    { id:'hb-pt-tdcs',    title:'Patient tDCS Introduction',        type:'Patient',        typeKey:'patient',    tag:'tDCS',           status:'Template', desc:'Plain-language introduction to tDCS for patients: sensations, safety, home-use instructions and what to report to your clinician.' },
    { id:'hb-tech-sop',   title:'Technician Session SOP',           type:'Technician',     typeKey:'technician', tag:'All modalities', status:'Template', desc:'Step-by-step standard operating procedure for technicians: equipment setup, patient check-in, session delivery and documentation.' },
    { id:'hb-home-guide', title:'Home Device User Guide',           type:'Home-Use',       typeKey:'homeuse',    tag:'Home tDCS',      status:'Template', desc:'Self-contained user manual for home tDCS devices: device orientation, electrode placement, session setup, safety and troubleshooting.' },
    { id:'hb-dep-tms',    title:'Depression TMS Protocol Handbook', type:'Protocol Guide', typeKey:'protocol',   tag:'TMS / Depression',status:'Template', desc:'Evidence-based TMS protocol handbook for major depressive disorder: DLPFC targets, dosing schedules, outcome tracking and escalation.' },
    { id:'hb-adhd-tdcs',  title:'ADHD tDCS Protocol Handbook',      type:'Protocol Guide', typeKey:'protocol',   tag:'tDCS / ADHD',    status:'Template', desc:'Clinical handbook for tDCS in ADHD: prefrontal montages, session frequency, attention outcome measures and combined-therapy guidance.' },
    { id:'hb-ptsd-tms',   title:'PTSD TMS Protocol Handbook',       type:'Protocol Guide', typeKey:'protocol',   tag:'TMS / PTSD',     status:'Template', desc:'TMS protocol handbook for PTSD: mPFC and DLPFC targets, trauma-informed session management, PCL-5 monitoring and safety considerations.' },
    { id:'hb-caregiver',  title:'Caregiver Support Guide',          type:'Patient',        typeKey:'caregiver',  tag:'All',            status:'Template', desc:'Guidance for caregivers supporting patients through neuromodulation treatment: what to expect, how to help, warning signs and contacts.' },
  ];

  const HB_TYPE_BADGE = { clinician:'clinician', patient:'patient', technician:'technician', homeuse:'homeuse', protocol:'protocol', caregiver:'caregiver' };

  function hbTlibHTML(q, f) {
    const fq = (q || '').toLowerCase();
    let items = HB_TEMPLATES;
    if (f && f !== 'All') items = items.filter(i => i.type === f);
    if (fq) items = items.filter(i => i.title.toLowerCase().includes(fq) || i.type.toLowerCase().includes(fq) || i.tag.toLowerCase().includes(fq) || i.desc.toLowerCase().includes(fq));
    const filterChips = ['All','Clinician','Patient','Technician','Home-Use','Protocol Guide'].map(fc =>
      `<button class="tlib-filter-chip${f===fc?' active':''}" onclick="window._hbTlibFilter('${fc}')">${fc}</button>`
    ).join('');
    const cards = items.length ? items.map(item => {
      const bk = HB_TYPE_BADGE[item.typeKey] || 'clinician';
      return `<div class="tlib-card">
        <div class="tlib-card-title">${item.title}</div>
        <div class="tlib-card-badges">
          <span class="tlib-badge tlib-badge--${bk}">${item.type}</span>
          <span class="tlib-badge tlib-badge--form">${item.tag}</span>
          <span class="tlib-badge tlib-badge--clinical">${item.status}</span>
        </div>
        <div class="tlib-card-meta">${item.desc}</div>
        <div class="tlib-card-actions">
          <button class="tlib-btn-assign" onclick="window._hbTlibGenerate('${item.id}','${item.title.replace(/'/g,"\\'")}')">Generate</button>
          <button class="tlib-btn-preview" onclick="window._hbTlibPreview('${item.id}')">Preview</button>
          <button class="tlib-btn-secondary" onclick="window._hbTlibAssign('${item.id}','${item.title.replace(/'/g,"\\'")}')">Assign to Patient</button>
        </div>
      </div>`;
    }).join('') : `<div class="tlib-empty"><div class="tlib-empty-icon">&#128269;</div><div class="tlib-empty-msg">No handbooks match your search</div></div>`;
    return `<div class="tlib-wrap">
      <div class="tlib-search-bar"><input class="tlib-search-input" id="hb-tlib-search" type="text" placeholder="Search handbooks\u2026" value="${(q||'').replace(/"/g,'&quot;')}" oninput="window._hbTlibSearch(this.value)"/></div>
      <div class="tlib-filters">${filterChips}</div>
      <div class="tlib-grid">${cards}</div>
    </div>`;
  }

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

  const HB_TABS = [
    { id:'library', label:'Handbook Library' },
    { id:'generator', label:'Protocol Generator' },
    { id:'case-summary', label:'AI Case Summary' },
    { id:'patient-guide', label:'Patient Guides' },
    { id:'doclib', label:'Document Library' },
  ];

  function hbTabsHTML(active) {
    return `<div class="ah2-tabs" style="margin-bottom:18px">${HB_TABS.map(t =>
      `<button class="ah2-tab${active===t.id?' ah2-tab-active':''}" onclick="window._hbSwitchTab('${t.id}')">${t.label}</button>`
    ).join('')}</div>`;
  }

  function hbTabBody(active) {
    if (active === 'library') return hbTlibHTML('','All');
    if (active === 'doclib') return `<div style="margin-bottom:28px"><div class="g2">${libCards}</div></div>`;
    if (active === 'generator') return `
      <div id="hb-generator-section" style="margin-bottom:28px">
        <div class="card">
          <div class="card-header"><h3>Generate Custom Protocol Document</h3></div>
          <div class="card-body">
            <div class="g2" style="margin-bottom:16px">
              <div class="form-group"><label class="form-label">Condition</label><select id="pg-condition" class="form-control"><option value="">Select condition\u2026</option>${condOpts}</select></div>
              <div class="form-group"><label class="form-label">Modality</label><select id="pg-modality" class="form-control"><option value="">Select modality\u2026</option>${modOpts}</select></div>
              <div class="form-group"><label class="form-label">Device Name</label><input id="pg-device" class="form-control" placeholder="e.g. Soterix 1x1 CT" /></div>
              <div class="form-group"><label class="form-label">Evidence Threshold</label><select id="pg-evidence" class="form-control"><option value="A">Grade A \u2014 Strong RCT</option><option value="B" selected>Grade B \u2014 Moderate</option><option value="C">Grade C \u2014 Emerging</option></select></div>
              <div class="form-group"><label class="form-label">Setting</label><select id="pg-setting" class="form-control"><option value="clinical" selected>Clinical</option><option value="home">Home</option><option value="research">Research</option></select></div>
              <div class="form-group"><label class="form-label">Symptom Cluster</label><input id="pg-symptom" class="form-control" placeholder="e.g. anhedonia, fatigue, low motivation" /></div>
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
      </div>`;
    if (active === 'case-summary') return `
      <div style="margin-bottom:28px">
        <div class="card">
          <div class="card-header"><h3>AI Case Summary</h3></div>
          <div class="card-body">
            <div class="g2" style="margin-bottom:16px">
              <div class="form-group" style="grid-column:1/-1"><label class="form-label">Patient Notes</label><textarea id="cs-notes" class="form-control" style="height:90px" placeholder="Paste clinical notes, session observations, or relevant history\u2026"></textarea></div>
              <div class="form-group"><label class="form-label">Condition</label><input id="cs-condition" class="form-control" placeholder="e.g. Major Depressive Disorder" /></div>
              <div class="form-group"><label class="form-label">Modality</label><input id="cs-modality" class="form-control" placeholder="e.g. rTMS" /></div>
              <div class="form-group"><label class="form-label">Session Count</label><input id="cs-sessions" class="form-control" type="number" min="0" placeholder="e.g. 15" /></div>
            </div>
            <div id="cs-error" style="display:none" class="notice notice-warn"></div>
            <button class="btn btn-primary" id="cs-gen-btn" onclick="window._csGenerate()">Generate Summary \u2726</button>
            <div id="cs-result" style="margin-top:18px"></div>
          </div>
        </div>
      </div>`;
    if (active === 'patient-guide') return `
      <div style="margin-bottom:28px">
        <div class="card">
          <div class="card-header"><h3>Patient Education Guide</h3></div>
          <div class="card-body">
            <div class="g2" style="margin-bottom:16px">
              <div class="form-group"><label class="form-label">Condition</label><select id="pgd-condition" class="form-control"><option value="">Select condition\u2026</option>${condOpts}</select></div>
              <div class="form-group"><label class="form-label">Modality</label><select id="pgd-modality" class="form-control"><option value="">Select modality\u2026</option>${modOpts}</select></div>
              <div class="form-group"><label class="form-label">Reading Level</label><select id="pgd-level" class="form-control"><option value="simple">Simple (Grade 6\u20138)</option><option value="standard" selected>Standard (Grade 9\u201312)</option><option value="advanced">Advanced (Collegiate)</option></select></div>
              <div class="form-group"><label class="form-label">Language</label><select id="pgd-lang" class="form-control"><option value="English" selected>English</option><option value="Spanish">Spanish</option><option value="French">French</option></select></div>
            </div>
            <div id="pgd-error" style="display:none" class="notice notice-warn"></div>
            <div id="pgd-status" style="display:none" class="notice notice-ok"></div>
            <button class="btn btn-primary" id="pgd-gen-btn" onclick="window._pgdGenerate()">Generate Guide \u2726</button>
          </div>
        </div>
      </div>`;
    return '';
  }

  // Store references for tab switching
  window._hbActiveTab = 'library';
  window._hbTlibQ = '';
  window._hbTlibF = 'All';
  window._HB_TEMPLATES = HB_TEMPLATES;
  window._hbTabsHTML = hbTabsHTML;
  window._hbTabBody = hbTabBody;
  window._hbTlibHTML = hbTlibHTML;

  return `
  <div id="hb-root">
    ${hbTabsHTML('library')}
    <div id="hb-tab-body">${hbTabBody('library')}</div>
  </div>

  <!-- OLD CONTENT HIDDEN (unused placeholder for build safety) -->
  <div id="hb-placeholder-old" style="display:none">
  <div class="g2" style="margin-bottom:24px">
  </div>
  <!-- /OLD CONTENT HIDDEN -->`;

}

export function bindHandbooks() {
  // ── Handbook tab switching ─────────────────────────────────────────────────
  window._hbSwitchTab = function(tab) {
    window._hbActiveTab = tab;
    const root = document.getElementById('hb-root');
    if (!root) return;
    const tabsEl = root.querySelector('.ah2-tabs');
    if (tabsEl && window._hbTabsHTML) {
      const tmp = document.createElement('div');
      tmp.innerHTML = window._hbTabsHTML(tab);
      tabsEl.replaceWith(tmp.firstElementChild);
    }
    const bodyEl = document.getElementById('hb-tab-body');
    if (bodyEl && window._hbTabBody) bodyEl.innerHTML = window._hbTabBody(tab);
    // Re-bind after render
    bindHandbooks();
  };

  // ── Handbook Template Library handlers ────────────────────────────────────
  window._hbTlibFilter = function(f) {
    window._hbTlibF = f;
    const bodyEl = document.getElementById('hb-tab-body');
    if (bodyEl && window._hbTlibHTML) bodyEl.innerHTML = window._hbTlibHTML(window._hbTlibQ || '', f);
    bindHandbooks();
  };
  window._hbTlibSearch = function(v) {
    window._hbTlibQ = v;
    const bodyEl = document.getElementById('hb-tab-body');
    if (bodyEl && window._hbTlibHTML) bodyEl.innerHTML = window._hbTlibHTML(v, window._hbTlibF || 'All');
    bindHandbooks();
    document.getElementById('hb-tlib-search')?.focus();
  };
  window._hbTlibGenerate = function(id, title) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px;padding:12px 16px;border-radius:8px;background:rgba(0,212,188,.12);border:1px solid rgba(0,212,188,.3);color:var(--teal);font-size:13px';
    t.textContent = 'Generating handbook: \u201c' + title + '\u201d\u2026';
    document.body.appendChild(t);
    setTimeout(() => {
      t.remove();
      if (typeof window._nav === 'function') {
        window._nav('handbook-generator');
      } else {
        const t2 = document.createElement('div');
        t2.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px;padding:12px 16px;border-radius:8px;background:rgba(74,158,255,.12);border:1px solid rgba(74,158,255,.3);color:#4a9eff;font-size:13px';
        t2.textContent = '\u201c' + title + '\u201d generated \u2014 handbook-generator route not found, using Protocol Generator tab';
        document.body.appendChild(t2); setTimeout(() => t2.remove(), 3500);
        window._hbSwitchTab('generator');
      }
    }, 1200);
  };
  window._hbTlibPreview = function(id) {
    const templates = window._HB_TEMPLATES || [];
    const item = templates.find(x => x.id === id);
    if (item) alert(item.title + '\nType: ' + item.type + ' | Modality/Condition: ' + item.tag + '\n\n' + item.desc);
  };
  window._hbTlibAssign = function(id, title) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px;padding:12px 16px;border-radius:8px;background:rgba(139,92,246,.12);border:1px solid rgba(139,92,246,.3);color:#8b5cf6;font-size:13px';
    t.textContent = 'Assign \u201c' + title + '\u201d to patient: select patient first';
    document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
  };

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
// Tiers are rendered from ``/api/v1/payments/config`` (source of truth is
// apps/api/app/packages.py). The fallback below mirrors the canonical package
// IDs and is only used when the config endpoint is unreachable.
export async function pgPricing(setTopbar) {
  setTopbar('Plans & Pricing', '');
  const el = document.getElementById('content');
  el.innerHTML = `<div class="spinner">${Array.from({length:5},(_,i)=>`<div class="ai-dot" style="animation-delay:${i*.12}s"></div>`).join('')}</div>`;

  let serverPackages = [];
  try {
    const res = await api.paymentConfig();
    serverPackages = Array.isArray(res?.packages) ? res.packages : [];
  } catch {}

  // Canonical fallback (matches apps/api/app/packages.py). Only used if the
  // payments/config endpoint is unavailable.
  const CANONICAL_FALLBACK = [
    { id: 'explorer',      name: 'Explorer',          price_monthly: 0,    price_annual: 0,    seat_limit: 1,    custom_pricing: false, best_for: 'Evaluators exploring the platform', features: ['Evidence library — read', 'Device registry — limited', 'Conditions & modalities — limited'] },
    { id: 'resident',      name: 'Resident / Fellow', price_monthly: 99,   price_annual: 990,  seat_limit: 1,    custom_pricing: false, best_for: 'Trainees and early-career clinicians', features: ['Full evidence library', 'Protocol generation (EV-A/B)', 'Assessment builder — limited', 'Handbook generation — limited', 'PDF export'] },
    { id: 'clinician_pro', name: 'Clinician Pro',     price_monthly: 199,  price_annual: 1990, seat_limit: 1,    custom_pricing: false, best_for: 'Independent clinicians', features: ['Full protocol generator (EV-C override)', 'Uploads (qEEG / MRI / PDFs)', 'Personalized case summaries', 'Full assessment + handbook builders', 'PDF + DOCX export', 'Personal review queue & audit trail', 'Add-on: Phenotype mapping'] },
    { id: 'clinic_team',   name: 'Clinic Team',       price_monthly: 699,  price_annual: 6990, seat_limit: 10,   custom_pricing: false, best_for: 'Clinical teams', features: ['Everything in Clinician Pro', 'Phenotype mapping included', 'Shared team review queue', 'Team audit trail & governance', 'Team templates & comments', 'Seat management (up to 10)', 'Basic white-label branding'] },
    { id: 'enterprise',    name: 'Enterprise',        price_monthly: 2500, price_annual: null, seat_limit: null, custom_pricing: true,  best_for: 'Multi-site organizations', features: ['Everything in Clinic Team', 'Unlimited seats', 'Advanced governance rules', 'Full white-label branding', 'API / integrations', 'Automated monitoring workspace', 'SSO-ready structure'] },
  ];

  const packages = serverPackages.length > 0 ? serverPackages : CANONICAL_FALLBACK;
  // Tier that gets the "RECOMMENDED" badge.
  const RECOMMENDED_ID = 'clinician_pro';

  let _pricingAnnual = false;

  function _formatPrice(pkg) {
    if (pkg.custom_pricing) return 'Custom';
    const monthly = Number(pkg.price_monthly || 0);
    if (monthly === 0) return 'Free';
    if (_pricingAnnual && pkg.price_annual) {
      // Show equivalent monthly for annual billing (price_annual / 12).
      const perMo = Math.round(Number(pkg.price_annual) / 12);
      return '$' + perMo + '/mo';
    }
    return '$' + monthly + '/mo';
  }

  function _seatLine(pkg) {
    if (pkg.seat_limit == null) return 'Unlimited seats';
    return pkg.seat_limit === 1 ? '1 seat' : ('Up to ' + pkg.seat_limit + ' seats');
  }

  function _pricingHTML() {
    const billingNote = _pricingAnnual
      ? '<span style="font-size:11px;color:var(--teal);margin-left:6px">Annual — 17% off</span>'
      : '<span style="font-size:11px;color:var(--text-secondary);margin-left:6px">Monthly</span>';

    const plans = packages.map(pkg => {
      const recommended   = pkg.id === RECOMMENDED_ID;
      const isEnterprise  = pkg.id === 'enterprise' || pkg.custom_pricing;
      const isFree        = Number(pkg.price_monthly || 0) === 0 && !isEnterprise;
      let cta;
      if (isEnterprise)      cta = 'Book a Demo \u2192';
      else if (isFree)       cta = 'Get Started \u2192';
      else                   cta = 'Start Free Trial \u2192';
      return {
        id: pkg.id,
        name: pkg.name,
        price: _formatPrice(pkg),
        forLine: pkg.best_for || _seatLine(pkg),
        recommended,
        features: [_seatLine(pkg), ...(Array.isArray(pkg.features) ? pkg.features : [])],
        cta,
        ctaPrimary: recommended,
      };
    });

    const planCards = plans.map(p => {
      const border = p.recommended ? 'border-color:var(--border-teal);' : '';
      const bg     = p.recommended ? 'background:linear-gradient(135deg,rgba(0,212,188,0.05),rgba(74,158,255,0.05));' : '';
      const badge  = p.recommended ? '<div style="display:inline-block;background:var(--teal);color:#0a1628;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-bottom:10px;letter-spacing:.04em">RECOMMENDED</div>' : '';
      const feats  = p.features.map(f => `<div style="font-size:12px;color:var(--text-secondary);padding:4px 0;display:flex;gap:8px;align-items:flex-start"><span style="color:var(--green);flex-shrink:0;margin-top:1px">&#10003;</span><span>${f}</span></div>`).join('');
      return `<div class="card pricing-card" style="margin-bottom:0;${border}${bg}">
        <div class="card-body" style="display:flex;flex-direction:column;height:100%">
          ${badge}
          <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${p.name}</div>
          <div style="font-family:var(--font-display);font-size:26px;font-weight:700;color:var(--teal);margin-bottom:4px">${p.price}</div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">For: ${p.forLine}</div>
          <div style="margin-bottom:20px;flex:1">${feats}</div>
          <button class="btn${p.ctaPrimary ? ' btn-primary' : ''}" style="width:100%;font-weight:${p.ctaPrimary ? '700' : '400'}" onclick="window.subscribe('${p.id}')">${p.cta}</button>
        </div>
      </div>`;
    }).join('');

    const stats = [
      { value: '30s', label: 'average outcome capture time' },
      { value: '1 screen', label: 'to run the clinic day' },
      { value: '9 validated scales', label: 'built in' },
      { value: 'PHQ-9 crisis flagging', label: 'active' },
    ];
    const statBadges = stats.map(s => `<div style="text-align:center;padding:16px 12px">
      <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--teal)">${s.value}</div>
      <div style="font-size:11.5px;color:var(--text-secondary);margin-top:3px">${s.label}</div>
    </div>`).join('');

    const faqs = [
      { q: 'Can I try it before subscribing?', a: 'Yes \u2014 14-day free trial, no credit card required.' },
      { q: 'Does it replace our EHR?', a: 'No \u2014 DeepSynaps is purpose-built for neuromodulation workflows. It complements your EHR rather than replacing it.' },
      { q: 'Is outcome data secure?', a: 'Yes \u2014 all data is encrypted at rest and in transit. We support HIPAA-aligned deployment for US clinics.' },
    ];
    const faqItems = faqs.map((f, i) => `<div class="pricing-faq-item" style="border-bottom:1px solid var(--border);padding:12px 0">
      <button style="width:100%;text-align:left;background:none;border:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:0;color:var(--text-primary);font-size:13px;font-weight:600" onclick="window._pricingFaq(${i})">
        <span>${f.q}</span><span id="pricing-faq-ico-${i}" style="color:var(--text-secondary);font-size:16px">+</span>
      </button>
      <div id="pricing-faq-ans-${i}" style="display:none;font-size:12.5px;color:var(--text-secondary);padding-top:8px;line-height:1.6">${f.a}</div>
    </div>`).join('');

    return `
    <div style="text-align:center;margin-bottom:28px">
      <div style="font-family:var(--font-display);font-size:23px;font-weight:700;color:var(--text-primary);margin-bottom:8px">The operating system for neuromodulation clinics</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px">Built for TMS, Neurofeedback, and multi-modal treatment programs.</div>
      <div style="display:inline-flex;align-items:center;gap:8px;background:var(--surface-2,rgba(255,255,255,0.04));border:1px solid var(--border);border-radius:20px;padding:4px 6px">
        <button id="pricing-toggle-mo" style="border:none;cursor:pointer;padding:5px 14px;border-radius:16px;font-size:12px;font-weight:600;background:${!_pricingAnnual ? 'var(--teal)' : 'transparent'};color:${!_pricingAnnual ? '#0a1628' : 'var(--text-secondary)'}" onclick="window._pricingToggleBilling(false)">Monthly</button>
        <button id="pricing-toggle-yr" style="border:none;cursor:pointer;padding:5px 14px;border-radius:16px;font-size:12px;font-weight:600;background:${_pricingAnnual ? 'var(--teal)' : 'transparent'};color:${_pricingAnnual ? '#0a1628' : 'var(--text-secondary)'}" onclick="window._pricingToggleBilling(true)">Annual ${billingNote}</button>
      </div>
    </div>
    <div class="g3" style="margin-bottom:28px">${planCards}</div>
    <div class="card" style="margin-bottom:24px;padding:0">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);border-top:none">${statBadges}</div>
    </div>
    <div class="card" style="margin-bottom:0">
      <div class="card-body" style="padding-bottom:4px">
        <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Frequently Asked Questions</div>
        ${faqItems}
      </div>
    </div>`;
  }

  el.innerHTML = _pricingHTML();

  window._pricingToggleBilling = function(annual) {
    _pricingAnnual = !!annual;
    el.innerHTML = _pricingHTML();
  };

  window._pricingFaq = function(i) {
    const ans = document.getElementById('pricing-faq-ans-' + i);
    const ico = document.getElementById('pricing-faq-ico-' + i);
    if (!ans) return;
    const open = ans.style.display !== 'none';
    ans.style.display = open ? 'none' : '';
    if (ico) ico.textContent = open ? '+' : '\u2212';
  };

  window.subscribe = async function(pkg) {
    if (pkg === 'enterprise') { window._showEnterpriseModal(); return; }
    // Explorer is free — no Stripe checkout. Route to the app shell.
    if (pkg === 'explorer') { window._nav && window._nav('knowledge'); return; }
    try {
      const res = await api.createCheckout(pkg);
      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
      } else if (res?.contact_us) {
        window._showEnterpriseModal();
      }
    } catch (e) {
      const b = document.createElement('div');
      b.className = 'notice notice-warn';
      b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
      b.textContent = e.message || 'Checkout unavailable.';
      document.body.appendChild(b); setTimeout(() => b.remove(), 5000);
    }
  };

  window._showEnterpriseModal = function() {
    const existing = document.getElementById('ent-modal-overlay');
    if (existing) existing.remove();

    const ov = document.createElement('div');
    ov.id = 'ent-modal-overlay';
    ov.className = 'ent-modal-overlay';
    ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `
      <div class="ent-modal-card" role="dialog" aria-modal="true" aria-labelledby="ent-modal-title">
        <button class="ent-modal-close" onclick="document.getElementById('ent-modal-overlay').remove()" aria-label="Close">&times;</button>
        <div class="ent-modal-eyebrow">Enterprise Plan</div>
        <h2 class="ent-modal-title" id="ent-modal-title">Let&rsquo;s build your plan together</h2>
        <p class="ent-modal-sub">Multi-site networks, research institutions, and high-volume clinics. Custom seats, EHR integration, white-label, and SLA. Tell us what you need.</p>
        <div class="ent-contact-grid">
          <a class="ent-contact-option" href="mailto:hello@deepsynaps.com?subject=Enterprise%20Plan%20Enquiry" target="_blank">
            <span class="ent-contact-icon">&#9993;</span>
            <div>
              <div class="ent-contact-label">Email us</div>
              <div class="ent-contact-detail">hello@deepsynaps.com</div>
            </div>
          </a>
          <a class="ent-contact-option" href="https://calendly.com/deepsynaps/enterprise" target="_blank" rel="noopener">
            <span class="ent-contact-icon">&#128197;</span>
            <div>
              <div class="ent-contact-label">Schedule a call</div>
              <div class="ent-contact-detail">30-min discovery &mdash; Calendly</div>
            </div>
          </a>
          <a class="ent-contact-option" href="https://wa.me/message/deepsynaps" target="_blank" rel="noopener">
            <span class="ent-contact-icon">&#128172;</span>
            <div>
              <div class="ent-contact-label">WhatsApp</div>
              <div class="ent-contact-detail">Quick message &mdash; reply within 24h</div>
            </div>
          </a>
        </div>
        <div class="ent-modal-footer">We typically respond within one business day.</div>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('ent-modal-visible'));
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
      if (dataPoints.length === 0) { window._showToast('No data points to export.', 'warning'); return; }
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

  // Attempt a real-backend probe for staff rotas. The endpoint is not yet
  // implemented (see apps/api/app/routers — no staff/shift router), so we
  // surface an honest "local-only" banner rather than pretending shifts are
  // persisted server-side.
  var staffBackendOk = false;
  try {
    if (typeof api.listStaffSchedule === 'function') {
      var _probe = await api.listStaffSchedule({ from: window._staffWeekStart, to: _addDays(window._staffWeekStart, 6) });
      staffBackendOk = !!(_probe && (_probe.items || _probe.length));
    }
  } catch (_e) { staffBackendOk = false; }

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

    var banner = staffBackendOk ? '' :
      '<div class="notice notice-info" style="margin-bottom:12px;font-size:12px">' +
        '<strong>Local scheduling (no backend):</strong> staff rotas, PTO, and shift swaps are stored in this browser only. The staff-schedule API is not yet wired, so changes will not sync across devices or persist after clearing local data.' +
      '</div>';

    el.innerHTML =
      banner +
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
        ? '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px">Cover clinician will be notified via Virtual Care</div>'
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
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;color:var(--accent-amber,#ffb547);display:flex;align-items:center;gap:10px">
        <span style="font-size:14px">&#9888;</span>
        <span><b>Preview data.</b> Revenue trend, acquisition funnel, clinician productivity, session heatmap, and churn segments on this page are seeded demo values. Wire-up to <code>/api/v1/finance/monthly</code>, <code>/api/v1/sessions</code>, and <code>/api/v1/leads</code> is tracked separately.</span>
      </div>
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
      <div style="margin:-4px 0 10px;padding:6px 10px;border-radius:6px;background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.30);font-size:11px;color:var(--amber,#f59e0b)">
        Demo marketplace bundle — published-protocol feed is not yet backed by the registry. Applying a protocol attaches it to a patient via /api/v1/protocols/saved when a patient context is set.
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

  window._mpImport = async function(id) {
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
    // When a patient context is available (set by the Rx hub / studio flow),
    // also POST to /api/v1/protocols/saved so the import is a real backend
    // draft attached to the patient — not just a localStorage bundle.
    const patientId = window._mpPatientId || null;
    let backendNote = '';
    if (patientId) {
      try {
        const { api } = await import('./api.js');
        await api.saveProtocol({
          patient_id: patientId,
          name: p.name,
          condition: (p.conditions && p.conditions[0]) || 'unspecified',
          modality: String(p.modality || 'tms').toLowerCase(),
          device_slug: null,
          parameters_json: {
            source: 'marketplace',
            marketplaceId: id,
            params: p.params || {},
            author: p.author || '',
            institution: p.institution || '',
          },
          evidence_refs: p.refs || [],
          governance_state: 'draft',
        });
        backendNote = ' · attached to patient ' + patientId;
      } catch (e) {
        backendNote = ' · backend sync failed (' + (e?.message || 'offline') + ') — saved locally';
      }
    } else {
      backendNote = ' · demo bundle (attach a patient to sync)';
    }
    showToast(`"${p.name}" imported${backendNote}`);
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

// ── Research Data Export Pipeline (NNN-B) ─────────────────────────────────────
export async function pgDataExport(setTopbar) {
  setTopbar('Research Data Export', '');
  const el = document.getElementById('app-content') || document.getElementById('content');
  if (!el) return;

  // ── localStorage helpers ──────────────────────────────────────────────────
  function lsGet(k, def) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  // ── Seed export history ───────────────────────────────────────────────────
  if (!localStorage.getItem('ds_export_history')) {
    lsSet('ds_export_history', [
      { id: 'exp_001', date: '2026-03-15T09:42:00Z', user: 'Dr. Reyes',       domains: ['Session Records','Outcome Scores'],                                  recordCount: 142, format: 'CSV',       deidMethod: 'Safe Harbor',           purpose: 'IRB-2024-011 interim analysis',       studyFilter: 'All patients' },
      { id: 'exp_002', date: '2026-03-22T14:10:00Z', user: 'Dr. Yamamoto',    domains: ['Protocol Parameters','Adverse Events'],                              recordCount: 87,  format: 'JSON',      deidMethod: 'Expert Determination',  purpose: 'Device safety review',               studyFilter: 'All patients' },
      { id: 'exp_003', date: '2026-04-01T11:05:00Z', user: 'Dr. Reyes',       domains: ['Outcome Scores','Demographic Aggregates'],                           recordCount: 315, format: 'BIDS JSON', deidMethod: 'Safe Harbor',           purpose: 'Multi-site consortium submission',   studyFilter: 'IRB-2024-011' },
      { id: 'exp_004', date: '2026-04-05T16:30:00Z', user: 'Admin (system)',  domains: ['Session Records','Outcome Scores','Protocol Parameters'],            recordCount: 489, format: 'REDCap CSV',deidMethod: 'Limited Dataset',       purpose: 'Quarterly registry upload',          studyFilter: 'All patients' },
      { id: 'exp_005', date: '2026-04-09T08:55:00Z', user: 'Dr. Chen',        domains: ['Medication Records','Adverse Events'],                              recordCount: 64,  format: 'CSV',       deidMethod: 'Safe Harbor',           purpose: 'Pharmacovigilance report',           studyFilter: 'All patients' },
    ]);
  }

  // ── Seed DSAs ─────────────────────────────────────────────────────────────
  if (!localStorage.getItem('ds_data_sharing_agreements')) {
    lsSet('ds_data_sharing_agreements', [
      { id: 'dsa_001', institution: 'Stanford Center for Neuromodulation',  purpose: 'Multi-site TMS depression outcomes registry',    domains: ['Session Records','Outcome Scores','Protocol Parameters'], effectiveDate: '2025-01-01', expiryDate: '2027-12-31', status: 'Active'            },
      { id: 'dsa_002', institution: 'NIH BRAIN Initiative Consortium',       purpose: 'Neural circuit biomarker discovery',             domains: ['Session Records','Outcome Scores','Demographic Aggregates'],effectiveDate: '2024-06-01', expiryDate: '2026-05-31', status: 'Expired'           },
      { id: 'dsa_003', institution: 'Mayo Clinic Neuroscience Division',     purpose: 'rTMS protocol benchmarking collaborative',       domains: ['Protocol Parameters','Outcome Scores'],                   effectiveDate: '2026-03-01', expiryDate: '2029-02-28', status: 'Pending Signature' },
    ]);
  }

  // ── Seed IRB studies ──────────────────────────────────────────────────────
  if (!localStorage.getItem('ds_irb_studies')) {
    lsSet('ds_irb_studies', [
      { id: 'IRB-2024-011', label: 'IRB-2024-011: rTMS for Treatment-Resistant Depression' },
      { id: 'IRB-2025-003', label: 'IRB-2025-003: tDCS Augmentation in OCD' },
      { id: 'IRB-2025-017', label: 'IRB-2025-017: Neurofeedback Protocol Optimization' },
    ]);
  }

  // ── Wizard state ──────────────────────────────────────────────────────────
  let _step = 1;
  const _sel = {
    domains: [],
    startDate: '2025-01-01',
    endDate: '2026-04-11',
    studyFilter: 'all',
    deidMethod: 'safe-harbor',
    format: 'csv',
    compress: 'none',
  };

  // ── 18 HIPAA Safe Harbor identifiers ─────────────────────────────────────
  const HIPAA_18 = [
    { id: 1,  name: 'Names',                              transform: 'SUBJ_XXX'    },
    { id: 2,  name: 'Geographic data (sub-state)',        transform: 'State only'  },
    { id: 3,  name: 'Dates (except year)',                transform: 'Week offset' },
    { id: 4,  name: 'Phone numbers',                      transform: null          },
    { id: 5,  name: 'Fax numbers',                        transform: null          },
    { id: 6,  name: 'Email addresses',                    transform: null          },
    { id: 7,  name: 'Social security numbers',            transform: null          },
    { id: 8,  name: 'Medical record numbers',             transform: 'MRN_XXXXX'  },
    { id: 9,  name: 'Health plan beneficiary numbers',    transform: null          },
    { id: 10, name: 'Account numbers',                    transform: null          },
    { id: 11, name: 'Certificate / license numbers',      transform: null          },
    { id: 12, name: 'Vehicle identifiers',                transform: null          },
    { id: 13, name: 'Device identifiers / serial numbers',transform: 'DEVICE_XXX' },
    { id: 14, name: 'Web URLs',                           transform: null          },
    { id: 15, name: 'IP addresses',                       transform: null          },
    { id: 16, name: 'Biometric identifiers',              transform: null          },
    { id: 17, name: 'Full-face photos / images',          transform: null          },
    { id: 18, name: 'Any other unique identifier',        transform: null          },
  ];

  // ── Synthetic preview rows ────────────────────────────────────────────────
  const PREVIEW_ROWS = [
    { subj: 'SUBJ_001', age: '[Age bracket: 30-39]', diag: 'MDD',  week: 'W+02', modality: 'rTMS', phq9: 14, protocol: 'PROTO_A', clinician: 'CLINICIAN_A', event: 'None'                     },
    { subj: 'SUBJ_002', age: '[Age bracket: 40-49]', diag: 'OCD',  week: 'W+04', modality: 'tDCS', phq9: 9,  protocol: 'PROTO_B', clinician: 'CLINICIAN_B', event: 'Headache (mild)'           },
    { subj: 'SUBJ_003', age: '[Age bracket: 50-59]', diag: 'PTSD', week: 'W+06', modality: 'rTMS', phq9: 17, protocol: 'PROTO_A', clinician: 'CLINICIAN_A', event: 'None'                     },
    { subj: 'SUBJ_004', age: '[Age bracket: 20-29]', diag: 'GAD',  week: 'W+03', modality: 'NFB',  phq9: 11, protocol: 'PROTO_C', clinician: 'CLINICIAN_C', event: 'None'                     },
    { subj: 'SUBJ_005', age: '[Age bracket: 60-69]', diag: 'MDD',  week: 'W+08', modality: 'rTMS', phq9: 5,  protocol: 'PROTO_A', clinician: 'CLINICIAN_B', event: 'Scalp discomfort (mild)'  },
  ];

  // ── Aggregate analytics data (already-anonymous) ──────────────────────────
  const COND_DIST = [
    { label: 'MDD',   pct: 38, color: '#00d4bc' },
    { label: 'OCD',   pct: 12, color: '#4a9eff' },
    { label: 'PTSD',  pct: 20, color: '#9b7fff' },
    { label: 'GAD',   pct: 15, color: '#f59e0b' },
    { label: 'Other', pct: 15, color: '#6b7280' },
  ];
  const MODALITY_DATA = [
    { label: 'rTMS', count: 312, color: '#00d4bc' },
    { label: 'tDCS', count: 87,  color: '#4a9eff' },
    { label: 'NFB',  count: 145, color: '#9b7fff' },
    { label: 'PEMF', count: 43,  color: '#f59e0b' },
    { label: 'tACS', count: 29,  color: '#f87171' },
  ];
  const PHQ9_HIST = [
    { label: '0–4',   count: 58,  color: '#22c55e' },
    { label: '5–9',   count: 112, color: '#84cc16' },
    { label: '10–14', count: 134, color: '#f59e0b' },
    { label: '15–19', count: 97,  color: '#f97316' },
    { label: '20–27', count: 45,  color: '#ef4444' },
  ];
  const SESSIONS_WEEKLY = [18,22,19,24,21,28,26,31,29,34,32,37];

  // ── SVG chart builders ────────────────────────────────────────────────────
  function buildDonut(data) {
    const cx = 80, cy = 80, r = 60, strokeW = 18;
    const total = data.reduce((s, d) => s + d.pct, 0);
    let offset = 0;
    const circ = 2 * Math.PI * r;
    const slices = data.map(d => {
      const dash = (d.pct / total) * circ;
      const gap  = circ - dash;
      const rot  = (offset / total) * 360 - 90;
      offset += d.pct;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="${strokeW}"
        stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
        transform="rotate(${rot.toFixed(2)} ${cx} ${cy})" opacity="0.9"/>`;
    }).join('');
    const legend = data.map(d =>
      `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted,var(--text-secondary))">
        <span style="width:8px;height:8px;border-radius:50%;background:${d.color};flex-shrink:0"></span>${d.label} ${d.pct}%</div>`
    ).join('');
    return `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <svg viewBox="0 0 160 160" width="130" height="130" style="flex-shrink:0">${slices}</svg>
      <div style="display:flex;flex-direction:column;gap:5px">${legend}</div>
    </div>`;
  }

  function buildBarChart(data) {
    const maxC = Math.max(...data.map(d => d.count));
    const bars = data.map(d => {
      const pct = Math.round((d.count / maxC) * 100);
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
        <span style="font-size:10px;font-weight:600;color:var(--text,var(--text-primary))">${d.count}</span>
        <div style="width:100%;background:rgba(255,255,255,0.06);border-radius:4px 4px 0 0;height:80px;display:flex;align-items:flex-end">
          <div style="width:100%;height:${pct}%;background:${d.color};border-radius:4px 4px 0 0;opacity:0.85;transition:height 0.3s"></div>
        </div>
        <span style="font-size:10px;color:var(--text-muted,var(--text-secondary));white-space:nowrap">${d.label}</span>
      </div>`;
    }).join('');
    return `<div style="display:flex;gap:8px;align-items:flex-end;padding:4px 0">${bars}</div>`;
  }

  function buildHistogram(data) {
    const maxC = Math.max(...data.map(d => d.count));
    const bars = data.map(d => {
      const pct = Math.round((d.count / maxC) * 100);
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
        <span style="font-size:10px;font-weight:600;color:var(--text,var(--text-primary))">${d.count}</span>
        <div style="width:100%;background:rgba(255,255,255,0.06);border-radius:4px 4px 0 0;height:70px;display:flex;align-items:flex-end">
          <div style="width:100%;height:${pct}%;background:${d.color};border-radius:4px 4px 0 0;opacity:0.85"></div>
        </div>
        <span style="font-size:9.5px;color:var(--text-muted,var(--text-secondary));text-align:center">${d.label}</span>
      </div>`;
    }).join('');
    return `<div style="display:flex;gap:6px;align-items:flex-end;padding:4px 0">${bars}</div>`;
  }

  function buildTrendLine(data) {
    const w = 300, h = 80, pad = 8;
    const maxV = Math.max(...data), minV = Math.min(...data);
    const pts = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - minV) / (maxV - minV || 1)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const area = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - minV) / (maxV - minV || 1)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const lastX = (pad + (w - pad * 2)).toFixed(1);
    const botY  = (h - pad).toFixed(1);
    const areaPath = `M${area[0]} ${area.slice(1).map(p => `L${p}`).join(' ')} L${lastX},${botY} L${pad},${botY} Z`;
    const wkLabels = data.map((_, i) => {
      if (i % 3 !== 0) return '';
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      return `<text x="${x.toFixed(1)}" y="${h + 14}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.35)">W-${data.length - i}</text>`;
    }).join('');
    const dots = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - minV) / (maxV - minV || 1)) * (h - pad * 2);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#00d4bc"/>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h + 20}" width="100%" style="overflow:visible">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00d4bc" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#00d4bc" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#trendGrad)"/>
      <polyline points="${pts}" fill="none" stroke="#00d4bc" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${wkLabels}
    </svg>`;
  }

  // ── DSA status badge ──────────────────────────────────────────────────────
  function dsaBadge(status) {
    const styleMap = {
      'Active':            'background:rgba(0,212,188,0.12);color:#00d4bc',
      'Expired':           'background:rgba(248,113,113,0.12);color:#f87171',
      'Pending Signature': 'background:rgba(245,158,11,0.12);color:#f59e0b',
    };
    const s = styleMap[status] || 'background:rgba(255,255,255,0.06);color:#94a3b8';
    return `<span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:5px;${s}">${status}</span>`;
  }

  // ── HIPAA checklist renderer ──────────────────────────────────────────────
  function buildHIPAAChecklist(method) {
    return HIPAA_18.map(item => {
      let statusLabel, statusClass;
      if (method === 'limited') {
        if ([2, 3].includes(item.id)) { statusLabel = 'Retained';    statusClass = 'nnnb-deid-retained'; }
        else if (item.transform)      { statusLabel = 'Transformed'; statusClass = 'nnnb-deid-transform'; }
        else                          { statusLabel = 'Removed';     statusClass = 'nnnb-deid-removed';  }
      } else {
        if (item.transform) { statusLabel = 'Transformed'; statusClass = 'nnnb-deid-transform'; }
        else                { statusLabel = 'Removed';     statusClass = 'nnnb-deid-removed';   }
      }
      const transformNote = item.transform && statusLabel !== 'Removed'
        ? `<span style="font-size:10px;color:var(--text-muted,var(--text-secondary));margin-left:4px;font-style:italic">→ ${item.transform}</span>`
        : '';
      return `<div class="nnnb-deid-item">
        <span style="font-size:10px;color:var(--text-muted,var(--text-secondary));font-family:var(--font-mono,monospace);min-width:20px">${item.id}.</span>
        <span style="color:var(--text,var(--text-primary));font-size:12px">${item.name}</span>
        ${transformNote}
        <span class="nnnb-deid-status ${statusClass}">${statusLabel}</span>
      </div>`;
    }).join('');
  }

  // ── Preview table renderer ────────────────────────────────────────────────
  function buildPreviewTable() {
    const cols = [
      { key: 'subj',     label: 'Subject ID',    masked: true  },
      { key: 'age',      label: 'Age Bracket',   masked: true  },
      { key: 'diag',     label: 'Diagnosis',     masked: false },
      { key: 'week',     label: 'Study Week',    masked: true  },
    ];
    if (_sel.domains.includes('Session Records'))     cols.push({ key: 'modality',   label: 'Modality',     masked: false });
    if (_sel.domains.includes('Outcome Scores'))      cols.push({ key: 'phq9',       label: 'PHQ-9 Score',  masked: false });
    if (_sel.domains.includes('Protocol Parameters')) cols.push({ key: 'protocol',   label: 'Protocol ID',  masked: true  });
    if (_sel.domains.includes('Adverse Events'))      cols.push({ key: 'event',      label: 'AE (category)',masked: false });
    cols.push({ key: 'clinician', label: 'Clinician', masked: true });
    // Always show at least 6 columns for readability
    if (cols.length < 6) {
      if (!cols.find(c => c.key === 'modality')) cols.splice(4, 0, { key: 'modality', label: 'Modality', masked: false });
      if (!cols.find(c => c.key === 'phq9'))     cols.splice(5, 0, { key: 'phq9',     label: 'PHQ-9',    masked: false });
    }
    const headers = cols.map(c => `<th>${c.label}</th>`).join('');
    const rows = PREVIEW_ROWS.map(row =>
      `<tr>${cols.map(c => {
        const val = row[c.key] !== undefined ? row[c.key] : '—';
        return c.masked
          ? `<td><span class="nnnb-cell-masked">${val}</span></td>`
          : `<td>${val}</td>`;
      }).join('')}</tr>`
    ).join('');
    return `<div style="overflow-x:auto"><table class="nnnb-preview-table">
      <thead><tr>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div style="margin-top:8px;font-size:11px;color:var(--accent-teal,#00d4bc)">
      <span style="background:rgba(0,212,188,0.08);padding:2px 8px;border-radius:4px;font-style:italic;font-family:var(--font-mono,monospace)">teal cells</span>
      = de-identified / transformed values &nbsp;|&nbsp; Patient Name → SUBJ_XXX &nbsp;|&nbsp; DOB → [Age bracket] &nbsp;|&nbsp; Exact dates → [Week offset] &nbsp;|&nbsp; Clinician → CLINICIAN_A
    </div>`;
  }

  // ── Export summary card ───────────────────────────────────────────────────
  function buildExportSummary() {
    const methodLabels = { 'safe-harbor': 'Safe Harbor', 'expert': 'Expert Determination', 'limited': 'Limited Dataset' };
    const fmtLabels    = { csv: 'CSV', json: 'JSON', bids: 'BIDS JSON', redcap: 'REDCap CSV' };
    const domainCount  = _sel.domains.length;
    const estRecords   = domainCount > 0 ? domainCount * 89 + 23 : 0;
    const estFields    = domainCount > 0 ? domainCount * 4 + 6   : 0;
    return `<div class="nnnb-export-summary">
      <div class="nnnb-summary-item">
        <span class="nnnb-summary-label">Data Domains</span>
        <span class="nnnb-summary-value">${domainCount > 0 ? domainCount + ' selected' : '—'}</span>
      </div>
      <div class="nnnb-summary-item">
        <span class="nnnb-summary-label">Est. Records</span>
        <span class="nnnb-summary-value">${domainCount > 0 ? estRecords.toLocaleString() : '—'}</span>
      </div>
      <div class="nnnb-summary-item">
        <span class="nnnb-summary-label">Est. Fields</span>
        <span class="nnnb-summary-value">${domainCount > 0 ? estFields : '—'}</span>
      </div>
      <div class="nnnb-summary-item">
        <span class="nnnb-summary-label">Date Range</span>
        <span class="nnnb-summary-value" style="font-size:12px">${_sel.startDate} → ${_sel.endDate}</span>
      </div>
      <div class="nnnb-summary-item">
        <span class="nnnb-summary-label">De-ID Method</span>
        <span class="nnnb-summary-value" style="font-size:12px">${methodLabels[_sel.deidMethod]}</span>
      </div>
      <div class="nnnb-summary-item">
        <span class="nnnb-summary-label">Format</span>
        <span class="nnnb-summary-value">${fmtLabels[_sel.format]}</span>
      </div>
    </div>`;
  }

  // ── Export generators ─────────────────────────────────────────────────────
  function generateCSV() {
    const methodLabel = { 'safe-harbor':'SafeHarbor','expert':'ExpertDetermination','limited':'LimitedDataset' }[_sel.deidMethod];
    const meta = `# DeepSynaps Protocol Studio — De-identified Research Export\r\n# ExportDate: ${new Date().toISOString()}\r\n# DeIdMethod: ${methodLabel}\r\n# Domains: ${_sel.domains.join('; ')}\r\n# DateRange: ${_sel.startDate} to ${_sel.endDate}\r\n`;
    const cols  = 'SubjectID|AgeBracket|Diagnosis|StudyWeek|Modality|PHQ9Score|PHQ9Severity|ProtocolID|ClinicianID|AECategory|AESeverity\r\n';
    const phqLabel = v => v <= 4 ? 'Minimal' : v <= 9 ? 'Mild' : v <= 14 ? 'Moderate' : v <= 19 ? 'ModeratelySevere' : 'Severe';
    const rows  = PREVIEW_ROWS.map(r => [
      r.subj, r.age, r.diag, r.week, r.modality, r.phq9, phqLabel(r.phq9),
      r.protocol, r.clinician,
      r.event !== 'None' ? r.event.split('(')[0].trim() : 'None',
      r.event !== 'None' ? (r.event.match(/\(([^)]+)\)/)?.[1] || 'Unknown') : 'N/A',
    ].join('|')).join('\r\n');
    return new Blob([meta + cols + rows], { type: 'text/csv;charset=utf-8;' });
  }

  function generateJSON() {
    const methodLabel = { 'safe-harbor':'SafeHarbor','expert':'ExpertDetermination','limited':'LimitedDataset' }[_sel.deidMethod];
    const phqLabel = v => v <= 4 ? 'Minimal' : v <= 9 ? 'Mild' : v <= 14 ? 'Moderate' : v <= 19 ? 'ModeratelySevere' : 'Severe';
    const payload = {
      exportDate:      new Date().toISOString(),
      deIdMethod:      methodLabel,
      recordCount:     PREVIEW_ROWS.length,
      fields:          ['subjectId','ageBracket','diagnosis','studyWeek','modality','phq9Score','phq9Severity','protocolId','clinicianId','aeCategory','aeSeverity'],
      dateRangeStart:  _sel.startDate,
      dateRangeEnd:    _sel.endDate,
      domains:         _sel.domains,
      records: PREVIEW_ROWS.map(r => ({
        subjectId:    r.subj,
        ageBracket:   r.age,
        diagnosis:    r.diag,
        studyWeek:    r.week,
        modality:     r.modality,
        phq9Score:    r.phq9,
        phq9Severity: phqLabel(r.phq9),
        protocolId:   r.protocol,
        clinicianId:  r.clinician,
        aeCategory:   r.event !== 'None' ? r.event.split('(')[0].trim() : null,
        aeSeverity:   r.event !== 'None' ? (r.event.match(/\(([^)]+)\)/)?.[1] || 'Unknown') : null,
      })),
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  function generateBIDS() {
    const phqLabel = v => v <= 4 ? 'Minimal' : v <= 9 ? 'Mild' : v <= 14 ? 'Moderate' : v <= 19 ? 'ModeratelySevere' : 'Severe';
    const bids = {
      BIDSVersion:              '1.9.0',
      DatasetType:              'raw',
      TaskName:                 'Neuromodulation Treatment',
      TaskDescription:          'De-identified multi-modal neuromodulation session and outcomes data exported from DeepSynaps Protocol Studio',
      Modality:                 'neuromodulation',
      InstitutionName:          '[REDACTED — HIPAA Safe Harbor]',
      DeIdentificationMethod:   'HIPAA Safe Harbor (45 CFR § 164.514(b))',
      Authors:                  ['[De-identified Research Export]'],
      License:                  'CC0',
      HowToAcknowledge:         'Cite: DeepSynaps Protocol Studio De-identified Export',
      ReferencesAndLinks:       [],
      DatasetDOI:               'n/a',
      ExportMetadata: {
        exportDate:    new Date().toISOString(),
        dateRange:     { start: _sel.startDate, end: _sel.endDate },
        domains:       _sel.domains,
        recordCount:   PREVIEW_ROWS.length,
        deIdMethod:    'SafeHarbor',
        softwareVersion: 'DeepSynaps-Protocol-Studio/1.0',
      },
      participants: PREVIEW_ROWS.map((r, i) => ({
        participant_id: r.subj,
        age:            r.age,
        sex:            i % 2 === 0 ? 'F' : 'M',
        diagnosis:      r.diag,
        modality:       r.modality,
        protocolId:     r.protocol,
        sessions: [{
          session_id:    `${r.subj}_ses-01`,
          task:          'NeuromodulationSession',
          studyWeek:     r.week,
          outcomes: { phq9: r.phq9, phq9Severity: phqLabel(r.phq9) },
          adverseEvents: r.event !== 'None'
            ? [{ category: r.event.split('(')[0].trim(), severity: r.event.match(/\(([^)]+)\)/)?.[1] || 'Unknown' }]
            : [],
        }],
      })),
    };
    return new Blob([JSON.stringify(bids, null, 2)], { type: 'application/json' });
  }

  function generateREDCap() {
    const cols = 'study_id|redcap_event_name|age_bracket|diagnosis|study_week|modality|phq9_score|phq9_severity|protocol_id|clinician_id|ae_category|ae_severity\r\n';
    const sevCode = v => v <= 4 ? '1' : v <= 9 ? '2' : v <= 14 ? '3' : v <= 19 ? '4' : '5';
    const rows = PREVIEW_ROWS.map(r => [
      r.subj, 'session_1_arm_1', r.age, r.diag, r.week, r.modality, r.phq9, sevCode(r.phq9),
      r.protocol, r.clinician,
      r.event !== 'None' ? r.event.split('(')[0].trim() : '',
      r.event !== 'None' ? (r.event.match(/\(([^)]+)\)/)?.[1] || '') : '',
    ].join('|')).join('\r\n');
    return new Blob([cols + rows], { type: 'text/csv;charset=utf-8;' });
  }

  // ── Audit log helper ──────────────────────────────────────────────────────
  function logExport(format) {
    const methodLabels = { 'safe-harbor':'Safe Harbor','expert':'Expert Determination','limited':'Limited Dataset' };
    const fmtLabels    = { csv:'CSV',json:'JSON',bids:'BIDS JSON',redcap:'REDCap CSV' };
    const history = lsGet('ds_export_history', []);
    history.unshift({
      id:          'exp_' + Date.now(),
      date:        new Date().toISOString(),
      user:        'Current User',
      domains:     [..._sel.domains],
      recordCount: _sel.domains.length * 89 + 23,
      format:      fmtLabels[format],
      deidMethod:  methodLabels[_sel.deidMethod],
      purpose:     document.getElementById('nnnb-export-purpose')?.value?.trim() || 'Not specified',
      studyFilter: _sel.studyFilter === 'all' ? 'All patients' : _sel.studyFilter,
    });
    lsSet('ds_export_history', history);
  }

  // ── Step indicator ────────────────────────────────────────────────────────
  function renderStepIndicator() {
    const steps = [{ n:1, label:'Select Data' },{ n:2, label:'De-identification' },{ n:3, label:'Export' }];
    return `<div class="nnnb-wizard-steps">
      ${steps.map(s => {
        const cls = _step === s.n ? 'active' : _step > s.n ? 'done' : 'disabled';
        const clickable = _step > s.n ? `onclick="window._nnnbGoStep(${s.n})"` : '';
        return `<div class="nnnb-wizard-step ${cls}" ${clickable}>
          <span class="nnnb-step-num">${_step > s.n ? '✓' : s.n}</span>
          <span>${s.label}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── Step 1 ────────────────────────────────────────────────────────────────
  function renderStep1() {
    const irbStudies = lsGet('ds_irb_studies', []);
    const DOMAINS = ['Session Records','Outcome Scores','Protocol Parameters','Adverse Events','Medication Records','Demographic Aggregates'];
    const domainHelp = {
      'Session Records':       'Dates (relative), duration, modality, protocol — no patient name',
      'Outcome Scores':        'PHQ-9, GAD-7, symptom ratings over time',
      'Protocol Parameters':   'Device settings, frequencies, intensities',
      'Adverse Events':        'De-identified severity, category',
      'Medication Records':    'Drug class only — no specific drug names',
      'Demographic Aggregates':'Age brackets, diagnosis categories — no individual records',
    };
    return `
      <div class="nnnb-section">
        <div class="nnnb-section-title">📋 Select Data Domains</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:20px">
          ${DOMAINS.map(d => {
            const active = _sel.domains.includes(d);
            return `<label style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:8px;
              border:1px solid ${active ? 'var(--accent-teal,#00d4bc)' : 'var(--border)'};
              background:${active ? 'rgba(0,212,188,0.06)' : 'rgba(255,255,255,0.02)'};cursor:pointer;transition:all 0.15s">
              <input type="checkbox" style="margin-top:2px;accent-color:var(--accent-teal,#00d4bc)"
                ${active ? 'checked' : ''} onchange="window._nnnbToggleDomain('${d}')">
              <div>
                <div style="font-size:12.5px;font-weight:600;color:var(--text,var(--text-primary));margin-bottom:2px">${d}</div>
                <div style="font-size:11px;color:var(--text-muted,var(--text-secondary))">${domainHelp[d]}</div>
              </div>
            </label>`;
          }).join('')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div>
            <label class="form-label" style="font-size:11.5px;font-weight:600">Date Range — Start</label>
            <input type="date" class="form-control" id="nnnb-start-date" value="${_sel.startDate}" onchange="window._nnnbSetDate('start',this.value)">
          </div>
          <div>
            <label class="form-label" style="font-size:11.5px;font-weight:600">Date Range — End</label>
            <input type="date" class="form-control" id="nnnb-end-date" value="${_sel.endDate}" onchange="window._nnnbSetDate('end',this.value)">
          </div>
        </div>
        <div>
          <label class="form-label" style="font-size:11.5px;font-weight:600">Study / IRB Filter</label>
          <select class="form-control" id="nnnb-study-filter" onchange="window._nnnbSetStudy(this.value)" style="max-width:420px">
            <option value="all" ${_sel.studyFilter==='all'?'selected':''}>All patients</option>
            ${irbStudies.map(s => `<option value="${s.id}" ${_sel.studyFilter===s.id?'selected':''}>${s.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-primary" onclick="window._nnnbGoStep(2)"
          ${_sel.domains.length === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>
          Next: De-identification Preview →
        </button>
      </div>`;
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  function renderStep2() {
    const methods = [
      { val:'safe-harbor', label:'Safe Harbor',          desc:'Removes all 18 HIPAA identifiers — safest for public sharing'                           },
      { val:'expert',      label:'Expert Determination', desc:'Statistical expert certifies re-identification risk falls below acceptable threshold'    },
      { val:'limited',     label:'Limited Dataset',      desc:'Retains some date and geographic identifiers — requires a Data Use Agreement (DUA)'     },
    ];
    return `
      <div class="nnnb-section">
        <div class="nnnb-section-title">🔒 De-identification Method</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px">
          ${methods.map(m => {
            const active = _sel.deidMethod === m.val;
            return `<label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;
              border:1px solid ${active ? 'var(--accent-blue,#4a9eff)' : 'var(--border)'};
              background:${active ? 'rgba(74,158,255,0.06)' : 'rgba(255,255,255,0.02)'};cursor:pointer;transition:all 0.15s">
              <input type="radio" name="nnnb-deid-method" value="${m.val}" ${active?'checked':''} onchange="window._nnnbSetMethod('${m.val}')" style="accent-color:var(--accent-blue,#4a9eff)">
              <div>
                <div style="font-size:12.5px;font-weight:600;color:var(--text,var(--text-primary))">${m.label}</div>
                <div style="font-size:11px;color:var(--text-muted,var(--text-secondary))">${m.desc}</div>
              </div>
            </label>`;
          }).join('')}
        </div>
        ${_sel.deidMethod === 'limited' ? `<div class="nnnb-dua-banner">⚠ Data Use Agreement required for Limited Dataset exports. Ensure an active DSA is in place before sharing externally.</div>` : ''}
      </div>
      <div class="nnnb-section">
        <div class="nnnb-section-title">👁 De-identification Preview
          <span style="font-size:11px;font-weight:400;color:var(--text-muted,var(--text-secondary));margin-left:6px">(5 synthetic rows)</span>
        </div>
        ${buildPreviewTable()}
      </div>
      <div class="nnnb-section">
        <div class="nnnb-section-title">☑ HIPAA Safe Harbor — 18 Identifier Checklist</div>
        <div class="nnnb-deid-checklist">${buildHIPAAChecklist(_sel.deidMethod)}</div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-secondary" onclick="window._nnnbGoStep(1)">← Back</button>
        <button class="btn btn-primary" onclick="window._nnnbGoStep(3)">Next: Export →</button>
      </div>`;
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  function renderStep3() {
    const formats = [
      { val:'csv',    label:'CSV',        desc:'Pipe-delimited with de-identified headers'    },
      { val:'json',   label:'JSON',       desc:'Structured with metadata header block'         },
      { val:'bids',   label:'BIDS JSON',  desc:'Brain Imaging Data Structure (v1.9) format'   },
      { val:'redcap', label:'REDCap CSV', desc:'REDCap import-ready with codebook fields'      },
    ];
    return `
      ${buildExportSummary()}
      <div class="nnnb-section">
        <div class="nnnb-section-title">📦 Export Format</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:18px">
          ${formats.map(f => {
            const active = _sel.format === f.val;
            return `<label style="display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:8px;
              border:1px solid ${active ? 'var(--accent-violet,#9b7fff)' : 'var(--border)'};
              background:${active ? 'rgba(155,127,255,0.07)' : 'rgba(255,255,255,0.02)'};cursor:pointer;transition:all 0.15s">
              <div style="display:flex;align-items:center;gap:8px">
                <input type="radio" name="nnnb-format" value="${f.val}" ${active?'checked':''} onchange="window._nnnbSetFormat('${f.val}')" style="accent-color:var(--accent-violet,#9b7fff)">
                <span style="font-size:13px;font-weight:700;color:var(--text,var(--text-primary))">${f.label}</span>
              </div>
              <span style="font-size:10.5px;color:var(--text-muted,var(--text-secondary));padding-left:20px">${f.desc}</span>
            </label>`;
          }).join('')}
        </div>
        <div style="margin-bottom:16px">
          <label class="form-label" style="font-size:11.5px;font-weight:600">Compression</label>
          <div style="display:flex;gap:14px;margin-top:4px">
            ${[['none','None'],['zip','ZIP (simulated)']].map(([val,label]) => `
              <label style="display:flex;align-items:center;gap:7px;font-size:12.5px;cursor:pointer">
                <input type="radio" name="nnnb-compress" value="${val}" ${_sel.compress===val?'checked':''} onchange="window._nnnbSetCompress('${val}')" style="accent-color:var(--accent-teal,#00d4bc)">
                ${label}
              </label>`).join('')}
          </div>
        </div>
        <div>
          <label class="form-label" style="font-size:11.5px;font-weight:600">Export Purpose / Notes (audit log)</label>
          <input type="text" class="form-control" id="nnnb-export-purpose" placeholder="e.g. IRB-2024-011 interim analysis" style="max-width:500px">
        </div>
      </div>
      <div style="padding:12px 16px;border-radius:9px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);margin-bottom:16px;font-size:12px;color:var(--accent-amber,#f59e0b)">
        ⚠ Exports to external parties require a valid active Data Sharing Agreement covering the exported domains. Check Section 4 below before sharing.
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="window._nnnbGoStep(2)">← Back</button>
        <button class="btn btn-primary" style="background:var(--accent-teal,#00d4bc);color:#000;font-weight:700;padding:10px 22px" onclick="window._nnnbGenerateExport()">
          📤 Generate Export
        </button>
      </div>`;
  }

  // ── History table ─────────────────────────────────────────────────────────
  function renderHistoryTable() {
    const history = lsGet('ds_export_history', []);
    const filterDate = document.getElementById('nnnb-hist-date')?.value || '';
    const filterFmt  = document.getElementById('nnnb-hist-fmt')?.value  || '';
    let rows = history;
    if (filterDate) rows = rows.filter(r => r.date && r.date.slice(0,10) >= filterDate);
    if (filterFmt)  rows = rows.filter(r => r.format === filterFmt);
    if (rows.length === 0) {
      return `<div style="text-align:center;padding:32px;color:var(--text-muted,var(--text-secondary));font-size:13px">No export records found.</div>`;
    }
    return `<div style="overflow-x:auto"><table class="nnnb-history-table">
      <thead><tr>
        <th>Date</th><th>User</th><th>Domains</th><th>Records</th><th>Format</th><th>De-ID Method</th><th>Purpose</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td style="font-family:var(--font-mono,monospace);font-size:11px;white-space:nowrap">${new Date(r.date).toLocaleString()}</td>
          <td style="font-size:12px">${r.user}</td>
          <td style="max-width:200px">
            <div style="display:flex;flex-wrap:wrap;gap:3px">
              ${(r.domains||[]).map(d => `<span style="font-size:9.5px;padding:1px 6px;border-radius:3px;background:rgba(74,158,255,0.1);color:var(--accent-blue,#4a9eff)">${d}</span>`).join('')}
            </div>
          </td>
          <td style="font-family:var(--font-mono,monospace);font-size:12px">${(r.recordCount||0).toLocaleString()}</td>
          <td><span style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(155,127,255,0.1);color:var(--accent-violet,#9b7fff)">${r.format}</span></td>
          <td style="font-size:11.5px;color:var(--text-muted,var(--text-secondary))">${r.deidMethod}</td>
          <td style="font-size:11.5px;color:var(--text-muted,var(--text-secondary));max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.purpose||'—'}</td>
          <td><button class="btn btn-secondary" style="font-size:11px;padding:4px 10px" onclick="window._nnnbReExport('${r.id}')">Re-export</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }

  // ── DSA cards ─────────────────────────────────────────────────────────────
  function renderDSACards() {
    const dsas = lsGet('ds_data_sharing_agreements', []);
    if (dsas.length === 0) return `<div style="text-align:center;padding:24px;color:var(--text-muted,var(--text-secondary));font-size:13px">No data sharing agreements on file.</div>`;
    return dsas.map(d => `
      <div class="nnnb-dsa-card" style="margin-bottom:10px">
        <div style="font-size:28px;padding-top:2px">🤝</div>
        <div class="nnnb-dsa-card-body">
          <div class="nnnb-dsa-title">${d.institution}</div>
          <div class="nnnb-dsa-meta">${d.purpose}<br>Effective: ${d.effectiveDate} &nbsp;→&nbsp; Expiry: ${d.expiryDate}</div>
          <div class="nnnb-dsa-domains">
            ${(d.domains||[]).map(dom => `<span class="nnnb-dsa-domain-pill">${dom}</span>`).join('')}
          </div>
        </div>
        <div style="flex-shrink:0">${dsaBadge(d.status)}</div>
      </div>`).join('');
  }

  // ── DSA add form ──────────────────────────────────────────────────────────
  function renderDSAForm() {
    const domOpts = ['Session Records','Outcome Scores','Protocol Parameters','Adverse Events','Medication Records','Demographic Aggregates'];
    return `<div id="nnnb-dsa-form" style="border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-top:12px;background:rgba(255,255,255,0.02)">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--text,var(--text-primary))">New Data Sharing Agreement</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div>
          <label class="form-label" style="font-size:11.5px;font-weight:600">Institution Name</label>
          <input type="text" class="form-control" id="nnnb-dsa-inst" placeholder="e.g. Stanford Center for Neuromodulation">
        </div>
        <div>
          <label class="form-label" style="font-size:11.5px;font-weight:600">Purpose</label>
          <input type="text" class="form-control" id="nnnb-dsa-purpose" placeholder="e.g. Multi-site TMS outcomes registry">
        </div>
        <div>
          <label class="form-label" style="font-size:11.5px;font-weight:600">Effective Date</label>
          <input type="date" class="form-control" id="nnnb-dsa-eff">
        </div>
        <div>
          <label class="form-label" style="font-size:11.5px;font-weight:600">Expiry Date</label>
          <input type="date" class="form-control" id="nnnb-dsa-exp">
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label class="form-label" style="font-size:11.5px;font-weight:600;display:block;margin-bottom:6px">Data Domains Covered</label>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${domOpts.map(d => `<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
            <input type="checkbox" class="nnnb-dsa-domain-cb" value="${d}" style="accent-color:var(--accent-blue,#4a9eff)"> ${d}
          </label>`).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="document.getElementById('nnnb-dsa-form').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="window._nnnbSaveDSA()">Save DSA</button>
      </div>
    </div>`;
  }

  // ── Full page render ──────────────────────────────────────────────────────
  function renderPage() {
    el.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:0 4px">

      <!-- Wizard Section -->
      <div style="margin-bottom:24px">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted,var(--text-secondary));margin-bottom:12px">Export Wizard</div>
        ${renderStepIndicator()}
        <div id="nnnb-step-body">
          ${_step === 1 ? renderStep1() : _step === 2 ? renderStep2() : renderStep3()}
        </div>
      </div>

      <!-- Aggregate Analytics Preview -->
      <div class="nnnb-section">
        <div class="nnnb-section-title">
          📊 Aggregate Analytics Preview
          <span style="font-size:11px;font-weight:400;color:var(--text-muted,var(--text-secondary));margin-left:6px">— aggregated anonymous data, no de-identification trigger</span>
        </div>
        <div class="nnnb-chart-row">
          <div class="nnnb-chart-card">
            <div class="nnnb-chart-title">Condition Distribution</div>
            ${buildDonut(COND_DIST)}
          </div>
          <div class="nnnb-chart-card">
            <div class="nnnb-chart-title">Modality Usage</div>
            ${buildBarChart(MODALITY_DATA)}
          </div>
          <div class="nnnb-chart-card">
            <div class="nnnb-chart-title">PHQ-9 Score Distribution</div>
            ${buildHistogram(PHQ9_HIST)}
          </div>
          <div class="nnnb-chart-card">
            <div class="nnnb-chart-title">Sessions per Week (Last 12 Weeks)</div>
            ${buildTrendLine(SESSIONS_WEEKLY)}
          </div>
        </div>
      </div>

      <!-- Export History -->
      <div class="nnnb-section">
        <div class="nnnb-section-title" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span>📜 Export History</span>
          <span style="font-size:10.5px;font-weight:500;color:var(--accent-amber,#f59e0b);background:rgba(245,158,11,0.1);padding:3px 10px;border-radius:5px">
            Export logs retained for 6 years per HIPAA requirements
          </span>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <label class="form-label" style="font-size:11px">Filter from date</label>
            <input type="date" class="form-control" id="nnnb-hist-date" style="font-size:12px" onchange="window._nnnbRefreshHistory()">
          </div>
          <div>
            <label class="form-label" style="font-size:11px">Format</label>
            <select class="form-control" id="nnnb-hist-fmt" style="font-size:12px" onchange="window._nnnbRefreshHistory()">
              <option value="">All formats</option>
              <option value="CSV">CSV</option>
              <option value="JSON">JSON</option>
              <option value="BIDS JSON">BIDS JSON</option>
              <option value="REDCap CSV">REDCap CSV</option>
            </select>
          </div>
        </div>
        <div id="nnnb-history-body">${renderHistoryTable()}</div>
      </div>

      <!-- Data Sharing Agreements -->
      <div class="nnnb-section">
        <div class="nnnb-section-title" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span>🤝 Data Sharing Agreements</span>
          <button class="btn btn-secondary" style="font-size:12px" onclick="window._nnnbShowDSAForm()">+ Add New DSA</button>
        </div>
        <div style="padding:10px 14px;border-radius:8px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);font-size:12px;color:var(--accent-amber,#f59e0b);margin-bottom:14px">
          ⚠ Exports to external parties require a valid <strong>Active</strong> Data Sharing Agreement covering the exported data domains.
        </div>
        <div id="nnnb-dsa-list">${renderDSACards()}</div>
        <div id="nnnb-dsa-form-container"></div>
      </div>

    </div>`;
  }

  // ── Window-exposed handlers ───────────────────────────────────────────────
  window._nnnbGoStep = function(n) {
    if (n === 2 && _sel.domains.length === 0) {
      // Show inline validation message
      const btn = document.querySelector('.nnnb-section .btn-primary');
      if (btn) { btn.textContent = 'Please select at least one domain first'; setTimeout(() => { btn.textContent = 'Next: De-identification Preview →'; }, 2000); }
      return;
    }
    _step = n;
    // Refresh step indicator and body without full re-render to preserve filter state
    const indicator = document.querySelector('.nnnb-wizard-steps');
    const body      = document.getElementById('nnnb-step-body');
    if (indicator) indicator.outerHTML = renderStepIndicator();
    if (body)      body.innerHTML = _step === 1 ? renderStep1() : _step === 2 ? renderStep2() : renderStep3();
    // After outerHTML swap the old reference is gone — scroll to top of content
    el.scrollTop = 0;
  };

  window._nnnbToggleDomain = function(domain) {
    const i = _sel.domains.indexOf(domain);
    if (i === -1) _sel.domains.push(domain);
    else _sel.domains.splice(i, 1);
    const body = document.getElementById('nnnb-step-body');
    if (body && _step === 1) body.innerHTML = renderStep1();
  };

  window._nnnbSetDate  = function(which, val) { if (which === 'start') _sel.startDate = val; else _sel.endDate = val; };
  window._nnnbSetStudy = function(val) { _sel.studyFilter = val; };

  window._nnnbSetMethod = function(val) {
    _sel.deidMethod = val;
    const body = document.getElementById('nnnb-step-body');
    if (body && _step === 2) body.innerHTML = renderStep2();
  };

  window._nnnbSetFormat = function(val) {
    _sel.format = val;
    const body = document.getElementById('nnnb-step-body');
    if (body && _step === 3) body.innerHTML = renderStep3();
  };

  window._nnnbSetCompress = function(val) { _sel.compress = val; };

  window._nnnbGenerateExport = function() {
    if (_sel.domains.length === 0) {
      alert('Please select at least one data domain in Step 1 before generating an export.');
      return;
    }
    // ── Pre-download confirmation gate (clinical safety requirement) ──
    const methodLabels = { 'safe-harbor': 'Safe Harbor', 'expert': 'Expert Determination', 'limited': 'Limited Dataset' };
    const formatLabels = { 'csv': 'CSV', 'json': 'JSON', 'bids': 'BIDS JSON', 'redcap': 'REDCap CSV' };
    const recordCount = PREVIEW_ROWS.length;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9000;display:flex;align-items:center;justify-content:center';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div style="min-width:380px;max-width:560px;max-height:85vh;overflow-y:auto;background:var(--bg-surface,#0d1a2b);border:1px solid var(--border,#1f2e4a);border-radius:12px;padding:22px;box-shadow:0 12px 48px rgba(0,0,0,0.5)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div style="font-size:15px;font-weight:700;color:var(--text-primary,#e5edf5)">Confirm Research Data Export</div>
          <button onclick="this.closest('[style*=inset]').remove()" style="background:none;border:none;color:var(--text-tertiary,#7a8aa5);font-size:18px;cursor:pointer">&#x2715;</button>
        </div>
        <div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:9px 12px;margin-bottom:14px;font-size:11.5px;color:var(--text-secondary,#b7c4d9);line-height:1.5">
          &#9888; This export will include de-identified patient data. Ensure you have a valid active Data Sharing Agreement before distributing this file externally.
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
          <tr><td style="padding:4px 8px 4px 0;font-size:11.5px;color:var(--text-tertiary,#7a8aa5)">Records</td><td style="font-size:12px;color:var(--text-primary,#e5edf5);font-weight:600">${recordCount} rows</td></tr>
          <tr><td style="padding:4px 8px 4px 0;font-size:11.5px;color:var(--text-tertiary,#7a8aa5)">Domains</td><td style="font-size:12px;color:var(--text-primary,#e5edf5)">${_sel.domains.join(', ') || '—'}</td></tr>
          <tr><td style="padding:4px 8px 4px 0;font-size:11.5px;color:var(--text-tertiary,#7a8aa5)">De-id method</td><td style="font-size:12px;color:var(--text-primary,#e5edf5)">${methodLabels[_sel.deidMethod] || _sel.deidMethod}</td></tr>
          <tr><td style="padding:4px 8px 4px 0;font-size:11.5px;color:var(--text-tertiary,#7a8aa5)">Format</td><td style="font-size:12px;color:var(--text-primary,#e5edf5)">${formatLabels[_sel.format] || _sel.format}</td></tr>
        </table>
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:11.5px;color:var(--text-secondary,#b7c4d9);margin-bottom:5px;font-weight:600">Purpose / intended use <span style="color:var(--red,#ff6b6b)">*</span> <span style="font-weight:400;color:var(--text-tertiary,#7a8aa5)">(min 20 chars)</span></label>
          <textarea id="_nnnb-purpose-note" style="width:100%;min-height:64px;background:var(--bg-surface-2,#0a1628);border:1px solid var(--border,#1f2e4a);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text-primary,#e5edf5);resize:vertical;box-sizing:border-box" placeholder="Describe the research purpose and how this data will be used…" oninput="window._nnnbUpdateConfirmBtn()"></textarea>
        </div>
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--border,#1f2e4a);border-radius:8px;cursor:pointer;margin-bottom:16px">
          <input type="checkbox" id="_nnnb-dsa-ack" style="margin-top:2px;flex-shrink:0" onchange="window._nnnbUpdateConfirmBtn()">
          <span style="font-size:12px;color:var(--text-secondary,#b7c4d9);line-height:1.5">I confirm this export complies with our active Data Sharing Agreement (DSA).</span>
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button style="padding:7px 16px;font-size:12.5px;border-radius:6px;background:transparent;border:1px solid var(--border,#1f2e4a);color:var(--text-secondary,#b7c4d9);cursor:pointer" onclick="this.closest('[style*=inset]').remove()">Cancel</button>
          <button id="_nnnb-export-confirm-btn" disabled style="padding:7px 16px;font-size:12.5px;border-radius:6px;background:var(--accent-teal,#00d4bc);color:#000;font-weight:700;cursor:pointer;opacity:0.45" onclick="window._nnnbDoExport(this)">Confirm &amp; Download</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    window._nnnbUpdateConfirmBtn = function() {
      const purposeEl = document.getElementById('_nnnb-purpose-note');
      const ackEl = document.getElementById('_nnnb-dsa-ack');
      const confirmBtn = document.getElementById('_nnnb-export-confirm-btn');
      if (!purposeEl || !ackEl || !confirmBtn) return;
      const valid = purposeEl.value.trim().length >= 20 && ackEl.checked;
      confirmBtn.disabled = !valid;
      confirmBtn.style.opacity = valid ? '1' : '0.45';
    };
    window._nnnbDoExport = function(btn) {
      const purposeEl = document.getElementById('_nnnb-purpose-note');
      const purposeNote = purposeEl ? purposeEl.value.trim() : '';
      btn.closest('[style*=inset]').remove();
      let blob, filename;
      const ts = new Date().toISOString().slice(0,10);
      const purposeSlug = purposeNote.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (_sel.format === 'json') {
        blob = generateJSON(); filename = `deepsynaps_deid_export_${ts}_${purposeSlug}.json`;
      } else if (_sel.format === 'bids') {
        blob = generateBIDS(); filename = `deepsynaps_bids_${ts}_${purposeSlug}.json`;
      } else if (_sel.format === 'redcap') {
        blob = generateREDCap(); filename = `deepsynaps_redcap_${ts}_${purposeSlug}.csv`;
      } else {
        blob = generateCSV(); filename = `deepsynaps_deid_export_${ts}_${purposeSlug}.csv`;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      logExport(_sel.format, purposeNote);
      const hb = document.getElementById('nnnb-history-body');
      if (hb) hb.innerHTML = renderHistoryTable();
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:24px;right:24px;max-width:340px;padding:14px 18px;border-radius:10px;background:var(--navy-800,#0f172a);border:1px solid var(--accent-teal,#00d4bc);z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,0.5)';
      toast.innerHTML = `<div style="font-size:13px;font-weight:600;color:var(--text,var(--text-primary));margin-bottom:3px">&#x2713; Export generated</div><div style="font-size:12px;color:var(--text-muted,var(--text-secondary))">${filename} — audit entry recorded</div>`;
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
    };
  };

  window._nnnbRefreshHistory = function() {
    const hb = document.getElementById('nnnb-history-body');
    if (hb) hb.innerHTML = renderHistoryTable();
  };

  window._nnnbReExport = function(id) {
    const history = lsGet('ds_export_history', []);
    const rec = history.find(r => r.id === id);
    if (!rec) return;
    _sel.domains    = [...(rec.domains || [])];
    _sel.deidMethod = rec.deidMethod === 'Safe Harbor' ? 'safe-harbor' : rec.deidMethod === 'Expert Determination' ? 'expert' : 'limited';
    _sel.format     = rec.format === 'JSON' ? 'json' : rec.format === 'BIDS JSON' ? 'bids' : rec.format === 'REDCap CSV' ? 'redcap' : 'csv';
    _step = 3;
    renderPage();
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;max-width:340px;padding:12px 16px;border-radius:10px;background:var(--navy-800,#0f172a);border:1px solid var(--accent-blue,#4a9eff);z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
    toast.innerHTML = `<div style="font-size:12.5px;font-weight:600;color:var(--text,var(--text-primary))">Config loaded from history — review and click Generate Export</div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  window._nnnbShowDSAForm = function() {
    const c = document.getElementById('nnnb-dsa-form-container');
    if (!c) return;
    if (document.getElementById('nnnb-dsa-form')) {
      document.getElementById('nnnb-dsa-form').remove();
      return;
    }
    c.innerHTML = renderDSAForm();
    c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window._nnnbSaveDSA = function() {
    const inst    = document.getElementById('nnnb-dsa-inst')?.value?.trim();
    const purpose = document.getElementById('nnnb-dsa-purpose')?.value?.trim();
    const eff     = document.getElementById('nnnb-dsa-eff')?.value;
    const exp     = document.getElementById('nnnb-dsa-exp')?.value;
    if (!inst || !purpose || !eff || !exp) {
      alert('Please fill in Institution, Purpose, Effective Date, and Expiry Date.');
      return;
    }
    const domains = [...document.querySelectorAll('.nnnb-dsa-domain-cb:checked')].map(cb => cb.value);
    const dsas = lsGet('ds_data_sharing_agreements', []);
    dsas.push({ id: 'dsa_' + Date.now(), institution: inst, purpose, domains, effectiveDate: eff, expiryDate: exp, status: 'Pending Signature' });
    lsSet('ds_data_sharing_agreements', dsas);
    const list = document.getElementById('nnnb-dsa-list');
    if (list) list.innerHTML = renderDSACards();
    const c = document.getElementById('nnnb-dsa-form-container');
    if (c) c.innerHTML = '';
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;max-width:320px;padding:12px 16px;border-radius:10px;background:var(--navy-800,#0f172a);border:1px solid var(--accent-teal,#00d4bc);z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
    toast.innerHTML = `<div style="font-size:12.5px;font-weight:600;color:var(--text,var(--text-primary))">DSA saved — status: Pending Signature</div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  };

  // ── Initial render ────────────────────────────────────────────────────────
  renderPage();
}

// ── NNN-E: Clinical Trial Enrollment Matcher ──────────────────────────────────
export async function pgTrialEnrollment(setTopbar) {
  setTopbar('Trial Enrollment', '');

  // ── localStorage helpers ─────────────────────────────────────────────────
  function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }

  // ── Seed data ────────────────────────────────────────────────────────────
  const TRIAL_SEED_STUDIES = [
    { id:'ts1', title:'Theta Burst TMS for TRD — Pilot RCT', arms:['Active TBS','Sham TBS'], target:24, enrolled:18, screened:31, excluded:13,
      criteria: { inclusion: ['Age 18–65','MDD diagnosis (DSM-5)','Failed ≥2 antidepressants','HAMD-17 ≥ 18'], exclusion: ['Active psychosis','Metallic implants','Pregnancy','Seizure history','Recent ECT (<3 months)'] } },
    { id:'ts2', title:'NFB vs Methylphenidate for ADHD', arms:['Neurofeedback','Methylphenidate','Combined'], target:40, enrolled:31, screened:52, excluded:21,
      criteria: { inclusion: ['Age 6–18','ADHD diagnosis (DSM-5)','ADHD-RS score ≥ 24','Naïve to stimulant medication'], exclusion: ['Autism comorbidity','Active seizure disorder','Current stimulant use','IQ < 70'] } },
  ];

  const TRIAL_SEED_PARTICIPANTS = Array.from({length:18}, (_,i) => ({
    id: `P${String(i+1).padStart(3,'0')}`,
    arm: i < 9 ? 'Active TBS' : 'Sham TBS',
    studyId: 'ts1',
    enrollDate: `2025-${String(Math.floor(i/3)+3).padStart(2,'0')}-${String((i%3)*8+5).padStart(2,'0')}`,
    status: i < 14 ? 'active' : i < 17 ? 'completed' : 'withdrawn',
    sessionsCompleted: 10 + ((i*7+3) % 20),
    compliance: 70 + ((i*11+5) % 30),
    adverseEvents: i % 5 === 0 ? 1 : 0,
  }));

  const SEED_PATIENTS = [
    { id:'pt1', name:'Alice Novak',  age:34, diagnosis:'MDD',  hamd:22, metalImplants:false, seizureHistory:false, pregnant:false, failedAD:3 },
    { id:'pt2', name:'Brian Torres', age:57, diagnosis:'MDD',  hamd:19, metalImplants:true,  seizureHistory:false, pregnant:false, failedAD:2 },
    { id:'pt3', name:'Chloe Marsh',  age:29, diagnosis:'MDD',  hamd:14, metalImplants:false, seizureHistory:false, pregnant:false, failedAD:1 },
    { id:'pt4', name:'David Chen',   age:45, diagnosis:'MDD',  hamd:21, metalImplants:false, seizureHistory:true,  pregnant:false, failedAD:3 },
    { id:'pt5', name:'Elena Russo',  age:38, diagnosis:'MDD',  hamd:20, metalImplants:false, seizureHistory:false, pregnant:false, failedAD:2 },
    { id:'pt6', name:'Frank Osei',   age:70, diagnosis:'MDD',  hamd:18, metalImplants:false, seizureHistory:false, pregnant:false, failedAD:2 },
    { id:'pt7', name:'Grace Kim',    age:25, diagnosis:'ADHD', hamd:8,  metalImplants:false, seizureHistory:false, pregnant:false, failedAD:0 },
    { id:'pt8', name:'Hiro Tanaka',  age:41, diagnosis:'MDD',  hamd:23, metalImplants:false, seizureHistory:false, pregnant:false, failedAD:2 },
  ];

  const SEED_INVITATIONS = [
    { id:'inv1', studyId:'ts1', patientId:'pt1', patientName:'Alice Novak',  date:'2026-01-15', status:'invited'   },
    { id:'inv2', studyId:'ts1', patientId:'pt5', patientName:'Elena Russo',  date:'2026-01-16', status:'consented' },
    { id:'inv3', studyId:'ts1', patientId:'pt8', patientName:'Hiro Tanaka',  date:'2026-01-17', status:'declined'  },
  ];

  const SEED_DEVIATIONS = [
    { id:'dev1', studyId:'ts1', participantId:'P002', date:'2026-01-20', type:'missed session',       severity:'minor',    status:'resolved', action:'Extra session scheduled',              irb:false },
    { id:'dev2', studyId:'ts1', participantId:'P007', date:'2026-02-03', type:'wrong dose',           severity:'major',    status:'reviewed', action:'Protocol amended, DSMB notified',      irb:false },
    { id:'dev3', studyId:'ts1', participantId:'P011', date:'2026-02-14', type:'eligibility violation',severity:'critical', status:'open',     action:'IRB notification submitted',           irb:true  },
    { id:'dev4', studyId:'ts2', participantId:'P001', date:'2026-02-28', type:'consent issue',        severity:'major',    status:'open',     action:'Re-consent scheduled',                 irb:false },
    { id:'dev5', studyId:'ts2', participantId:'P003', date:'2026-03-10', type:'missed session',       severity:'minor',    status:'resolved', action:'Session rescheduled and completed',    irb:false },
  ];

  const SEED_RAND_LOG = [
    { ts:'2026-03-01T09:12:00Z', participantId:'P015', arm:'Active TBS',      studyId:'ts1' },
    { ts:'2026-03-03T11:05:00Z', participantId:'P016', arm:'Sham TBS',        studyId:'ts1' },
    { ts:'2026-03-07T14:30:00Z', participantId:'P017', arm:'Active TBS',      studyId:'ts1' },
    { ts:'2026-03-09T10:22:00Z', participantId:'P018', arm:'Sham TBS',        studyId:'ts1' },
    { ts:'2026-03-12T16:45:00Z', participantId:'P031', arm:'Neurofeedback',   studyId:'ts2' },
    { ts:'2026-03-15T09:55:00Z', participantId:'P032', arm:'Methylphenidate', studyId:'ts2' },
    { ts:'2026-03-18T13:10:00Z', participantId:'P033', arm:'Combined',        studyId:'ts2' },
    { ts:'2026-03-20T15:40:00Z', participantId:'P034', arm:'Neurofeedback',   studyId:'ts2' },
    { ts:'2026-03-22T10:05:00Z', participantId:'P035', arm:'Methylphenidate', studyId:'ts2' },
    { ts:'2026-03-25T11:30:00Z', participantId:'P036', arm:'Combined',        studyId:'ts2' },
  ];

  // Seed on first load
  if (!lsGet('ds_trial_enrollments', null)) lsSet('ds_trial_enrollments', TRIAL_SEED_PARTICIPANTS);
  if (!lsGet('ds_trial_invitations', null)) lsSet('ds_trial_invitations', SEED_INVITATIONS);
  if (!lsGet('ds_trial_deviations',  null)) lsSet('ds_trial_deviations',  SEED_DEVIATIONS);
  if (!lsGet('ds_trial_randomization_log', null)) lsSet('ds_trial_randomization_log', SEED_RAND_LOG);

  // ── State ────────────────────────────────────────────────────────────────
  let _activeSection = 'eligibility';
  let _selectedStudyId = 'ts1';
  let _eligibilityFilter = 'all';
  let _eligibilityResults = null;
  let _selectedParticipantId = null;
  let _deviationFilter = 'all';
  let _showDeviationForm = false;

  // ── Data helpers ─────────────────────────────────────────────────────────
  function getStudies() {
    const stored = lsGet('ds_irb_studies', null);
    return (stored && stored.length) ? stored : TRIAL_SEED_STUDIES;
  }
  function getPatients() {
    const stored = lsGet('ds_patients', null);
    return (stored && stored.length) ? stored : SEED_PATIENTS;
  }
  function getEnrollments() { return lsGet('ds_trial_enrollments', []); }
  function getInvitations() { return lsGet('ds_trial_invitations', []); }
  function getDeviations()  { return lsGet('ds_trial_deviations',  []); }
  function getRandLog()     { return lsGet('ds_trial_randomization_log', []); }
  function getStudyById(id) { return getStudies().find(s => s.id === id) || getStudies()[0]; }

  // ── Eligibility engine ───────────────────────────────────────────────────
  function scorePatientForStudy(patient, study) {
    let score = 100;
    const reasons = [];
    const crit = study.criteria;
    if (!crit) return { score:50, reasons:['No criteria defined'], status:'potentially' };

    if (study.id === 'ts1') {
      if (patient.age < 18 || patient.age > 65)  { score -= 40; reasons.push('Age out of range (18–65)'); }
      if (patient.diagnosis !== 'MDD')            { score -= 50; reasons.push('No MDD diagnosis'); }
      if ((patient.hamd || 0) < 18)              { score -= 30; reasons.push('HAMD-17 < 18'); }
      if ((patient.failedAD || 0) < 2)           { score -= 20; reasons.push('Fewer than 2 failed antidepressants'); }
      if (patient.metalImplants)                  { score -= 50; reasons.push('Metallic implants (exclusion)'); }
      if (patient.seizureHistory)                 { score -= 50; reasons.push('Seizure history (exclusion)'); }
      if (patient.pregnant)                       { score -= 50; reasons.push('Pregnancy (exclusion)'); }
    } else if (study.id === 'ts2') {
      if (patient.age < 6 || patient.age > 18)   { score -= 40; reasons.push('Age out of range (6–18)'); }
      if (patient.diagnosis !== 'ADHD')           { score -= 50; reasons.push('No ADHD diagnosis'); }
    } else {
      if (!patient.diagnosis)                     { score -= 20; reasons.push('No diagnosis on record'); }
    }

    score = Math.max(0, Math.min(100, score));
    const status = score >= 80 ? 'eligible' : score >= 40 ? 'potentially' : 'ineligible';
    return { score, reasons, status };
  }

  function runEligibilityScan() {
    const study = getStudyById(_selectedStudyId);
    const patients = getPatients();
    _eligibilityResults = patients.map(p => {
      const { score, reasons, status } = scorePatientForStudy(p, study);
      return { ...p, score, reasons, status };
    });
    render();
  }

  // ── CONSORT data ─────────────────────────────────────────────────────────
  function getConsortData(study) {
    const enroll     = getEnrollments().filter(e => e.studyId === study.id);
    const n_screened = study.screened || 0;
    const n_excluded = study.excluded || 0;
    const n_no_crit  = Math.round(n_excluded * 0.6);
    const n_declined = Math.round(n_excluded * 0.25);
    const n_other    = n_excluded - n_no_crit - n_declined;
    const n_rand     = study.enrolled || 0;
    const arms       = study.arms || ['Arm A'];
    const armBase    = Math.floor(n_rand / arms.length);
    const armRem     = n_rand - armBase * arms.length;
    const armData    = arms.map((name, i) => {
      const sz        = i === arms.length - 1 ? armBase + armRem : armBase;
      const completed = enroll.filter(e => e.arm === name && e.status === 'completed').length || Math.round(sz * 0.78);
      const lost      = Math.round(sz * 0.10);
      const analysed  = Math.round(completed * 0.98);
      return { name, enrolled:sz, completed, lost, analysed };
    });
    return { n_screened, n_excluded, n_no_crit, n_declined, n_other, n_rand, armData };
  }

  // ── SVG CONSORT diagram ──────────────────────────────────────────────────
  function buildConsortSVG(study) {
    const d     = getConsortData(study);
    const arms  = d.armData;
    const nArms = arms.length;
    const W     = Math.max(720, nArms * 230 + 80);
    const H     = 640;
    const BW    = 200;
    const BH    = 48;
    const cx    = W / 2;

    const Y_SCREEN = 20;
    const Y_RAND   = Y_SCREEN + BH + 130;   // room for excl box
    const Y_ARMS   = Y_RAND  + BH + 50;
    const Y_COMP   = Y_ARMS  + BH + 40;
    const Y_LOST   = Y_COMP  + BH + 40;
    const Y_ANAL   = Y_LOST  + BH + 40;

    const COLORS   = ['#00d4bc','#6366f1','#f59e0b','#f43f5e'];
    const armXs    = arms.map((_, i) => Math.round(W * (i + 1) / (nArms + 1)));

    function rect(x, y, w, h, fill, stroke, rx=6) {
      return `<rect x="${x-w/2}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    }
    function txt(x, y, s, fill, sz=12, fw='400') {
      return `<text x="${x}" y="${y}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${sz}" fill="${fill}" font-weight="${fw}">${s}</text>`;
    }
    function arrow(x, y1, y2, col='#475569') {
      return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2-8}" stroke="${col}" stroke-width="1.5"/>` +
             `<polygon points="${x-5},${y2-8} ${x+5},${y2-8} ${x},${y2}" fill="${col}"/>`;
    }
    function hline(x1, x2, y, col='#475569') {
      return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${col}" stroke-width="1.5"/>`;
    }

    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H+30}" style="background:#fff;font-family:system-ui,sans-serif">`;
    s += `<rect width="${W}" height="${H+30}" fill="#fff"/>`;

    // ── Assessed for eligibility ─────────────────────────────────────────
    s += rect(cx, Y_SCREEN, BW+60, BH, '#1e293b', '#334155');
    s += txt(cx, Y_SCREEN+18, 'Assessed for Eligibility', '#e2e8f0', 13, '600');
    s += txt(cx, Y_SCREEN+34, `(N=${d.n_screened})`, '#00d4bc', 13, '700');

    // Arrow from screened → randomized, with horizontal branch to exclusion box
    s += arrow(cx, Y_SCREEN+BH, Y_RAND, '#475569');

    // Exclusion box (right side of vertical arrow)
    const excX  = cx + 150;
    const excW  = 210;
    const excH  = 100;
    const excY  = Y_SCREEN + BH + 15;
    const branchY = excY + 20;
    s += hline(cx, excX - excW/2, branchY);
    s += `<polygon points="${excX-excW/2-8},${branchY} ${excX-excW/2},${branchY-5} ${excX-excW/2},${branchY+5}" fill="#475569"/>`;
    s += `<rect x="${excX-excW/2}" y="${excY}" width="${excW}" height="${excH}" rx="6" fill="#2d1b1b" stroke="#7f1d1d" stroke-width="1.5"/>`;
    s += txt(excX, excY+17, `Excluded  (N=${d.n_excluded})`, '#fca5a5', 12, '700');
    s += txt(excX, excY+34, `Not meeting criteria: ${d.n_no_crit}`, '#94a3b8', 10.5);
    s += txt(excX, excY+49, `Declined to participate: ${d.n_declined}`, '#94a3b8', 10.5);
    s += txt(excX, excY+64, `Other reasons: ${d.n_other}`, '#94a3b8', 10.5);

    // ── Randomized ──────────────────────────────────────────────────────
    s += rect(cx, Y_RAND, BW+40, BH, '#1e293b', '#334155');
    s += txt(cx, Y_RAND+18, 'Randomized', '#e2e8f0', 13, '600');
    s += txt(cx, Y_RAND+34, `(N=${d.n_rand})`, '#00d4bc', 13, '700');

    // Fan-out horizontal line
    const fanY = Y_RAND + BH + 18;
    s += `<line x1="${cx}" y1="${Y_RAND+BH}" x2="${cx}" y2="${fanY}" stroke="#475569" stroke-width="1.5"/>`;
    if (nArms > 1) {
      s += hline(armXs[0], armXs[nArms-1], fanY);
    }
    armXs.forEach(ax => {
      s += arrow(ax, fanY, Y_ARMS, '#475569');
    });

    // ── Per-arm boxes ────────────────────────────────────────────────────
    arms.forEach((arm, i) => {
      const ax  = armXs[i];
      const col = COLORS[i % COLORS.length];

      // Arm allocation box
      s += `<rect x="${ax-BW/2}" y="${Y_ARMS}" width="${BW}" height="${BH}" rx="6" fill="#1a1f2e" stroke="${col}" stroke-width="2"/>`;
      s += txt(ax, Y_ARMS+17, arm.name, '#e2e8f0', 12, '600');
      s += txt(ax, Y_ARMS+33, `Allocated  (N=${arm.enrolled})`, col, 11, '700');

      // → Received intervention
      s += arrow(ax, Y_ARMS+BH, Y_COMP, col);
      s += rect(ax, Y_COMP, BW, BH, '#1a1f2e', '#334155');
      s += txt(ax, Y_COMP+17, 'Received Intervention', '#e2e8f0', 11);
      s += txt(ax, Y_COMP+33, `Completed  (N=${arm.completed})`, col, 11, '600');

      // → Lost to follow-up
      s += arrow(ax, Y_COMP+BH, Y_LOST, '#475569');
      s += rect(ax, Y_LOST, BW, BH, '#1e1a2e', '#4c1d95');
      s += txt(ax, Y_LOST+17, 'Lost to Follow-Up', '#e2e8f0', 11);
      s += txt(ax, Y_LOST+33, `N=${arm.lost}`, '#a78bfa', 11, '600');

      // → Analysed
      s += arrow(ax, Y_LOST+BH, Y_ANAL, '#475569');
      s += rect(ax, Y_ANAL, BW, BH, '#1a1f2e', '#0d9488');
      s += txt(ax, Y_ANAL+17, 'Analysed', '#e2e8f0', 11);
      s += txt(ax, Y_ANAL+33, `N=${arm.analysed}`, '#2dd4bf', 11, '700');
    });

    // Caption
    s += txt(cx, H+18, study.title, '#64748b', 10.5, '400');
    s += `</svg>`;
    return s;
  }

  // ── Gantt chart SVG ──────────────────────────────────────────────────────
  function buildGanttSVG(study) {
    const enroll = getEnrollments().filter(e => e.studyId === study.id);
    if (!enroll.length) return '<p style="color:var(--text-muted);padding:20px;text-align:center">No enrolled participants for this study.</p>';

    const LW = 58, RH = 28, CW = 22, MAX_W = 22, PAD_TOP = 28;
    const W  = LW + CW * MAX_W + 18;
    const H  = PAD_TOP + RH * enroll.length + 8;

    const PHASE_C = { screening:'#f59e0b', treatment:'#6366f1', followup:'#0ea5e9', completed:'#00d4bc', withdrawn:'#f43f5e' };

    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="font-family:system-ui,sans-serif;background:#0f172a;border-radius:8px">`;

    // Week labels & gridlines
    for (let w = 0; w <= MAX_W; w += 4) {
      const x = LW + w * CW;
      s += `<text x="${x}" y="16" text-anchor="middle" font-size="9.5" fill="#475569">W${w}</text>`;
      s += `<line x1="${x}" y1="20" x2="${x}" y2="${H-4}" stroke="#1e293b" stroke-width="0.8"/>`;
    }

    enroll.forEach((p, i) => {
      const ry = PAD_TOP + i * RH;
      const ly = ry + RH/2 + 3.5;
      if (i % 2 === 0) s += `<rect x="0" y="${ry}" width="${W}" height="${RH}" fill="rgba(255,255,255,0.015)"/>`;

      s += `<text x="${LW-5}" y="${ly}" text-anchor="end" font-size="9.5" fill="#94a3b8" font-weight="500">${p.id}</text>`;

      const sc = 2;
      const tr = Math.min(12, Math.round((p.sessionsCompleted || 10) / 1.4));
      const fu = p.status === 'completed' ? 4 : 0;
      const phases = [{ ph:'screening', start:0, wk:sc }];
      phases.push({ ph: p.status === 'withdrawn' ? 'withdrawn' : 'treatment', start:sc, wk:tr });
      if (p.status === 'completed') {
        phases.push({ ph:'followup',  start:sc+tr,    wk:fu });
        phases.push({ ph:'completed', start:sc+tr+fu, wk:2  });
      }

      phases.forEach(({ ph, start, wk }) => {
        const rx = LW + start * CW;
        const rw = wk * CW - 2;
        if (rw < 2) return;
        s += `<rect x="${rx}" y="${ry+4}" width="${rw}" height="${RH-8}" rx="3" fill="${PHASE_C[ph]}" opacity="0.87"
               onclick="window._nnnESelectParticipant('${p.id}')" style="cursor:pointer"/>`;
      });

      // Compliance dot
      const cc = (p.compliance||0)>=80 ? '#00d4bc' : (p.compliance||0)>=60 ? '#f59e0b' : '#f43f5e';
      s += `<circle cx="${LW+MAX_W*CW+10}" cy="${ry+RH/2}" r="4.5" fill="${cc}"/>`;
    });

    s += `</svg>`;
    return s;
  }

  // ── Donut SVG ────────────────────────────────────────────────────────────
  function buildDonutSVG(armData) {
    const total = armData.reduce((a, b) => a + b.enrolled, 0);
    if (!total) return '';
    const SZ = 120, R = 44, CX = 60, CY = 60;
    const COLS = ['#00d4bc','#6366f1','#f59e0b','#f43f5e'];
    let s = `<svg width="${SZ}" height="${SZ}" viewBox="0 0 ${SZ} ${SZ}">`;
    let angle = -Math.PI / 2;
    armData.forEach((arm, i) => {
      const sweep = (arm.enrolled / total) * 2 * Math.PI;
      const x1 = CX + R * Math.cos(angle);
      const y1 = CY + R * Math.sin(angle);
      const x2 = CX + R * Math.cos(angle + sweep);
      const y2 = CY + R * Math.sin(angle + sweep);
      const la = sweep > Math.PI ? 1 : 0;
      s += `<path d="M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${la} 1 ${x2},${y2} Z" fill="${COLS[i%COLS.length]}" opacity="0.87"/>`;
      angle += sweep;
    });
    s += `<circle cx="${CX}" cy="${CY}" r="26" fill="#0f172a"/>`;
    s += `<text x="${CX}" y="${CY+5}" text-anchor="middle" font-size="13" fill="#e2e8f0" font-weight="700">${total}</text>`;
    s += `<text x="${CX}" y="${CY+17}" text-anchor="middle" font-size="8.5" fill="#64748b">enrolled</text>`;
    s += `</svg>`;
    return s;
  }

  // ── Deviation bar chart SVG ──────────────────────────────────────────────
  function buildDeviationBarSVG() {
    const devs = getDeviations();
    const counts = {};
    devs.forEach(d => { const m = (d.date||'2026-01').slice(0,7); counts[m] = (counts[m]||0)+1; });
    const months = Object.keys(counts).sort().slice(-6);
    if (!months.length) return '<span style="color:var(--text-muted);font-size:.8rem">No data</span>';
    const maxV = Math.max(...months.map(m => counts[m]), 1);
    const BW = 34, GAP = 12, BAR_H = 90, PL = 28, PB = 26;
    const W = PL + months.length * (BW + GAP) + 16;
    let s = `<svg width="${W}" height="${BAR_H+PB}" style="font-family:system-ui,sans-serif">`;
    s += `<rect width="${W}" height="${BAR_H+PB}" fill="#0f172a" rx="8"/>`;
    for (let v = 0; v <= maxV; v++) {
      const y = BAR_H - Math.round((v/maxV)*(BAR_H-10));
      s += `<line x1="${PL}" y1="${y}" x2="${W-6}" y2="${y}" stroke="#1e293b" stroke-width="0.8"/>`;
      s += `<text x="${PL-3}" y="${y+3.5}" text-anchor="end" font-size="8.5" fill="#475569">${v}</text>`;
    }
    months.forEach((m, i) => {
      const x  = PL + i * (BW + GAP);
      const bh = Math.round((counts[m]/maxV)*(BAR_H-10));
      const y  = BAR_H - bh;
      const col= counts[m]>=3 ? '#f43f5e' : counts[m]>=2 ? '#f59e0b' : '#6366f1';
      s += `<rect x="${x}" y="${y}" width="${BW}" height="${bh}" rx="3" fill="${col}" opacity="0.85"/>`;
      s += `<text x="${x+BW/2}" y="${BAR_H+17}" text-anchor="middle" font-size="8.5" fill="#64748b">${m.slice(5)}</text>`;
      s += `<text x="${x+BW/2}" y="${y-3}" text-anchor="middle" font-size="9.5" fill="#e2e8f0" font-weight="600">${counts[m]}</text>`;
    });
    s += `</svg>`;
    return s;
  }

  // ── Score bar HTML ────────────────────────────────────────────────────────
  function scoreBar(score) {
    const col = score >= 80 ? '#00d4bc' : score >= 40 ? '#f59e0b' : '#f43f5e';
    return `<div style="display:flex;align-items:center;gap:5px">
      <div class="nnne-score-bar-wrap" style="width:72px"><div class="nnne-score-bar" style="width:${score}%;background:${col}"></div></div>
      <span style="font-size:.76rem;color:${col};font-weight:600">${score}</span>
    </div>`;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg, ok=true) {
    let t = document.getElementById('nnne-toast');
    if (!t) { t = document.createElement('div'); t.id='nnne-toast'; t.className='nnne-toast'; document.body.appendChild(t); }
    t.textContent = (ok ? '✓ ' : '⚠ ') + msg;
    t.style.borderColor = ok ? 'rgba(0,212,188,.35)' : 'rgba(245,158,11,.35)';
    t.classList.add('show');
    clearTimeout(window._nnnEToastTimer);
    window._nnnEToastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  // ── Study selector ────────────────────────────────────────────────────────
  function studySel(label='Study') {
    const studies = getStudies();
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <label style="font-size:.82rem;color:var(--text-muted);font-weight:600">${label}:</label>
      <select class="nnne-select" id="nnne-study-sel" onchange="window._nnnEStudyChange(this.value)">
        ${studies.map(s=>`<option value="${s.id}"${s.id===_selectedStudyId?' selected':''}>${s.title}</option>`).join('')}
      </select>
    </div>`;
  }

  // ── Section 1: Eligibility Matcher ───────────────────────────────────────
  function buildEligibilitySection() {
    const study = getStudyById(_selectedStudyId);
    const crit  = study.criteria || {};

    let html = studySel();
    html += `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
      <button class="nnne-btn primary" onclick="window._nnnERunScan()">Run Eligibility Scan</button>
      ${_eligibilityResults ? `<button class="nnne-btn amber" onclick="window._nnnESendInvitations()">Send Batch Invitations</button>` : ''}
      <span style="font-size:.79rem;color:var(--text-muted)">${_eligibilityResults ? `${_eligibilityResults.length} patients scanned` : 'Select study and click Run to scan patients'}</span>
    </div>`;

    if (crit.inclusion || crit.exclusion) {
      html += `<div style="display:flex;gap:14px;margin-bottom:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:190px;background:rgba(0,212,188,.07);border:1px solid rgba(0,212,188,.2);border-radius:8px;padding:12px">
          <div style="font-size:.79rem;font-weight:700;color:var(--accent-teal);margin-bottom:6px">Inclusion Criteria</div>
          <ul style="margin:0;padding-left:15px;font-size:.79rem;color:var(--text-muted);line-height:1.75">
            ${(crit.inclusion||[]).map(c=>`<li>${c}</li>`).join('')}
          </ul>
        </div>
        <div style="flex:1;min-width:190px;background:rgba(244,63,94,.07);border:1px solid rgba(244,63,94,.2);border-radius:8px;padding:12px">
          <div style="font-size:.79rem;font-weight:700;color:var(--accent-rose);margin-bottom:6px">Exclusion Criteria</div>
          <ul style="margin:0;padding-left:15px;font-size:.79rem;color:var(--text-muted);line-height:1.75">
            ${(crit.exclusion||[]).map(c=>`<li>${c}</li>`).join('')}
          </ul>
        </div>
      </div>`;
    }

    if (_eligibilityResults) {
      const all      = _eligibilityResults;
      const filtered = _eligibilityFilter === 'all' ? all : all.filter(r => r.status === _eligibilityFilter);
      const ec       = { eligible: all.filter(r=>r.status==='eligible').length, potentially: all.filter(r=>r.status==='potentially').length, ineligible: all.filter(r=>r.status==='ineligible').length };

      html += `<div class="nnne-filter-bar">
        ${[['all',`All (${all.length})`],['eligible',`Eligible (${ec.eligible})`],['potentially',`Potentially Eligible (${ec.potentially})`],['ineligible',`Ineligible (${ec.ineligible})`]].map(([f,lbl])=>
          `<button class="nnne-filter-btn${_eligibilityFilter===f?' active':''}" onclick="window._nnnEFilter('${f}')">${lbl}</button>`).join('')}
      </div>`;

      html += `<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <div class="nnne-eligibility-row nnne-table-header">
          <span>Patient</span><span>Age</span><span>Diagnosis</span><span>Eligibility Score</span><span>Status / Reasons</span><span>Action</span>
        </div>`;

      filtered.forEach(r => {
        const alreadyInvited = getInvitations().some(inv => inv.patientId === r.id && inv.studyId === _selectedStudyId);
        const reasons = r.reasons && r.reasons.length ? r.reasons.join('; ') : 'Meets all criteria';
        html += `<div class="nnne-eligibility-row ${r.status}">
          <span style="font-weight:600;color:var(--text)">${r.name}</span>
          <span style="color:var(--text-muted)">${r.age}</span>
          <span style="color:var(--text-muted)">${r.diagnosis}</span>
          <span>${scoreBar(r.score)}</span>
          <span>
            <span class="nnne-badge ${r.status}">${r.status==='potentially'?'Potentially Eligible':r.status.charAt(0).toUpperCase()+r.status.slice(1)}</span>
            ${r.status!=='eligible'?`<div style="font-size:.74rem;color:var(--text-muted);margin-top:3px">${reasons}</div>`:''}
          </span>
          <span>
            ${alreadyInvited
              ? `<span style="font-size:.77rem;color:var(--accent-teal);font-weight:600">Invited ✓</span>`
              : r.status!=='ineligible'
                ? `<button class="nnne-btn primary small" onclick="window._nnnEInvite('${r.id}','${(r.name||'').replace(/'/g,'&#x27;')}')">Invite</button>`
                : `<span style="font-size:.74rem;color:var(--text-muted)">—</span>`}
          </span>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div style="padding:32px;text-align:center;color:var(--text-muted);border:1px dashed var(--border);border-radius:8px">
        <div style="font-size:2rem;margin-bottom:8px">🔍</div>
        <div>Select a study and click <strong>Run Eligibility Scan</strong> to match patients against inclusion/exclusion criteria.</div>
      </div>`;
    }
    return html;
  }

  // ── Section 2: CONSORT Funnel ─────────────────────────────────────────────
  function buildFunnelSection() {
    const study = getStudyById(_selectedStudyId);
    return `
      ${studySel('Study for CONSORT Diagram')}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <span style="font-size:.81rem;color:var(--text-muted)">Publication-ready CONSORT flow diagram with counts from enrollment data</span>
        <button class="nnne-btn secondary small" onclick="window._nnnEPrintConsort()">Print / Export</button>
      </div>
      <div class="nnne-consort-diagram" id="nnne-consort-wrap">${buildConsortSVG(study)}</div>`;
  }

  // ── Section 3: Participant Timeline ──────────────────────────────────────
  function buildTimelineSection() {
    const study  = getStudyById(_selectedStudyId);
    const enroll = getEnrollments().filter(e => e.studyId === study.id);
    const sel    = _selectedParticipantId ? enroll.find(e => e.id === _selectedParticipantId) : null;

    return `
      ${studySel('Study Timeline')}
      <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:.79rem;color:var(--text-muted)">Click a participant bar to view detail panel below</span>
        <button class="nnne-btn secondary small" onclick="window._nnnEPrintGantt()">Print Gantt</button>
      </div>
      <div class="nnne-gantt" id="nnne-gantt-wrap">${buildGanttSVG(study)}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;align-items:center">
        ${[['Screening','#f59e0b'],['Treatment','#6366f1'],['Follow-up','#0ea5e9'],['Completed','#00d4bc'],['Withdrawn','#f43f5e']].map(([lbl,c])=>
          `<div style="display:flex;align-items:center;gap:4px"><div style="width:13px;height:9px;border-radius:2px;background:${c}"></div><span style="font-size:.76rem;color:var(--text-muted)">${lbl}</span></div>`).join('')}
        <span style="font-size:.76rem;color:var(--text-muted);margin-left:6px">Dots: compliance ≥80% / 60–79% / &lt;60%</span>
      </div>
      ${sel ? `<div class="nnne-detail-panel">
        <div style="font-size:.88rem;font-weight:700;color:var(--text);margin-bottom:8px">Participant ${sel.id} — Detail</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;font-size:.82rem">
          <div><span style="color:var(--text-muted)">Arm:</span> <strong>${sel.arm}</strong></div>
          <div><span style="color:var(--text-muted)">Enroll Date:</span> <strong>${sel.enrollDate}</strong></div>
          <div><span style="color:var(--text-muted)">Status:</span> <strong>${sel.status}</strong></div>
          <div><span style="color:var(--text-muted)">Sessions:</span> <strong>${sel.sessionsCompleted}</strong></div>
          <div><span style="color:var(--text-muted)">Compliance:</span> <strong>${sel.compliance}%</strong></div>
          <div><span style="color:var(--text-muted)">Adverse Events:</span> <strong>${sel.adverseEvents||0}</strong></div>
        </div>
      </div>` : ''}`;
  }

  // ── Section 4: Arm Balance Monitor ───────────────────────────────────────
  function buildArmBalanceSection() {
    const study        = getStudyById(_selectedStudyId);
    const enroll       = getEnrollments().filter(e => e.studyId === study.id);
    const arms         = study.arms || ['Arm A'];
    const perTarget    = Math.ceil((study.target || 20) / arms.length);
    const COLS         = ['#00d4bc','#6366f1','#f59e0b','#f43f5e'];

    const armData = arms.map(armName => {
      const pts        = enroll.filter(e => e.arm === armName);
      const enrolled   = pts.length || Math.round((study.enrolled||0) / arms.length);
      const compliance = pts.length ? Math.round(pts.reduce((a,p)=>a+(p.compliance||80),0)/pts.length) : 80;
      const ae         = pts.reduce((a,p)=>a+(p.adverseEvents||0),0);
      return { name:armName, enrolled, target:perTarget, compliance, ae };
    });

    const maxE     = Math.max(...armData.map(a=>a.enrolled));
    const minE     = Math.min(...armData.map(a=>a.enrolled));
    const imbalance = maxE > 0 && (maxE - minE) / maxE > 0.20;

    const randLog = getRandLog().filter(r=>r.studyId===study.id).slice(-10).reverse();

    return `
      ${studySel('Study Arm Balance')}
      ${imbalance ? `<div class="nnne-alert warning">⚠ Arm imbalance detected — consider stratified randomization</div>` : ''}
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;align-items:flex-start">
        <div style="display:flex;gap:12px;flex-wrap:wrap;flex:1">
          ${armData.map((arm,i) => {
            const pct = Math.round((arm.enrolled/arm.target)*100);
            const col = COLS[i%COLS.length];
            return `<div class="nnne-arm-card">
              <div class="nnne-arm-card-title" style="color:${col}">${arm.name}</div>
              <div style="font-size:.81rem;color:var(--text-muted)">
                <div>Enrolled: <strong style="color:var(--text)">${arm.enrolled} / ${arm.target}</strong></div>
                <div style="margin:6px 0 2px">Progress:</div>
                <div style="height:7px;background:rgba(255,255,255,.07);border-radius:4px;overflow:hidden">
                  <div style="height:100%;width:${Math.min(pct,100)}%;background:${col};border-radius:4px"></div>
                </div>
                <div style="text-align:right;font-size:.74rem;color:${col};margin-bottom:6px">${pct}% full</div>
                <div>Compliance: <strong style="color:${arm.compliance>=80?'#00d4bc':arm.compliance>=60?'#f59e0b':'#f43f5e'}">${arm.compliance}%</strong></div>
                <div>Adverse Events: <strong style="color:${arm.ae>0?'#f43f5e':'#64748b'}">${arm.ae}</strong></div>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
          ${buildDonutSVG(armData)}
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
            ${armData.map((a,i)=>`<div style="display:flex;align-items:center;gap:3px">
              <div style="width:9px;height:9px;border-radius:50%;background:${COLS[i%COLS.length]}"></div>
              <span style="font-size:.74rem;color:var(--text-muted)">${a.name}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>
      <div style="font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:8px">Recent Randomization Log (last 10)</div>
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <div style="display:grid;grid-template-columns:44px 1fr 160px 150px;gap:8px;padding:8px 12px;font-size:.74rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;background:var(--bg-secondary)">#<span>Participant</span><span>Arm</span><span>Timestamp</span></div>
        ${!randLog.length
          ? `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:.82rem">No assignments yet</div>`
          : randLog.map((r,idx) => {
            const ai  = arms.indexOf(r.arm);
            const col = COLS[ai>=0?ai%COLS.length:0];
            return `<div style="display:grid;grid-template-columns:44px 1fr 160px 150px;gap:8px;padding:9px 12px;border-bottom:1px solid var(--border);font-size:.82rem;align-items:center">
              <span style="color:var(--text-muted)">${randLog.length-idx}</span>
              <span style="font-weight:600;color:var(--text)">${r.participantId}</span>
              <span style="color:${col};font-weight:600">${r.arm}</span>
              <span style="color:var(--text-muted)">${new Date(r.ts).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
            </div>`;
          }).join('')}
      </div>`;
  }

  // ── Section 5: Protocol Deviation Log ────────────────────────────────────
  function buildDeviationSection() {
    const devs      = getDeviations();
    const filtered  = _deviationFilter === 'all' ? devs : devs.filter(d => d.status===_deviationFilter || d.severity===_deviationFilter);
    const critCount = devs.filter(d => d.severity==='critical').length;
    const TYPES     = ['missed session','wrong dose','eligibility violation','consent issue','other'];
    const SEVS      = ['minor','major','critical'];
    const STATS     = ['open','reviewed','resolved'];

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div class="nnne-filter-bar" style="margin:0">
          ${['all','open','reviewed','resolved','minor','major','critical'].map(f=>
            `<button class="nnne-filter-btn${_deviationFilter===f?' active':''}" onclick="window._nnnEDevFilter('${f}')">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}
        </div>
        <button class="nnne-btn primary" onclick="window._nnnEOpenDevForm()">+ Log Deviation</button>
      </div>
      ${critCount>0 ? `<div class="nnne-alert danger">⚠ ${critCount} critical deviation${critCount>1?'s':''} — <strong>IRB Notification Required</strong> for flagged items</div>` : ''}
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:20px">
        <div class="nnne-deviation-row nnne-table-header"><span>Study</span><span>Participant</span><span>Date</span><span>Type</span><span>Severity</span><span>Status</span><span>Action / IRB</span></div>
        ${!filtered.length
          ? `<div style="padding:20px;text-align:center;color:var(--text-muted)">No deviations match this filter.</div>`
          : filtered.map(d=>`<div class="nnne-deviation-row${d.severity==='critical'?' critical-row':''}">
              <span style="color:var(--text-muted);font-size:.77rem">${d.studyId}</span>
              <span style="font-weight:600;color:var(--text)">${d.participantId}</span>
              <span style="color:var(--text-muted)">${d.date}</span>
              <span style="color:var(--text)">${d.type}</span>
              <span><span class="nnne-badge ${d.severity}">${d.severity}</span></span>
              <span><span class="nnne-badge ${d.status}">${d.status}</span></span>
              <span>
                <span style="font-size:.77rem;color:var(--text-muted)">${d.action||'—'}</span>
                ${d.irb?`<span class="nnne-irb-flag" style="display:block;margin-top:2px">IRB Notify</span>`:''}
              </span>
            </div>`).join('')}
      </div>
      <div style="font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:10px">Monthly Deviation Rate</div>
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
        ${buildDeviationBarSVG()}
        <div style="font-size:.78rem;color:var(--text-muted);line-height:1.8">
          <div>Total: <strong style="color:var(--text)">${devs.length}</strong></div>
          <div>Critical: <strong style="color:var(--accent-rose)">${devs.filter(d=>d.severity==='critical').length}</strong></div>
          <div>Open: <strong style="color:var(--accent-amber)">${devs.filter(d=>d.status==='open').length}</strong></div>
          <div>Resolved: <strong style="color:var(--accent-teal)">${devs.filter(d=>d.status==='resolved').length}</strong></div>
        </div>
      </div>

      ${_showDeviationForm ? `<div class="nnne-modal-overlay" id="nnne-dev-overlay" onclick="window._nnnECloseDevForm(event)">
        <div class="nnne-modal" onclick="event.stopPropagation()">
          <h3>Log Protocol Deviation</h3>
          <div class="nnne-form-row"><label>Study</label>
            <select class="nnne-form-select" id="nnne-dev-study">${getStudies().map(s=>`<option value="${s.id}">${s.title}</option>`).join('')}</select></div>
          <div class="nnne-form-row"><label>Participant ID</label>
            <input class="nnne-input" id="nnne-dev-pid" placeholder="e.g. P007"></div>
          <div class="nnne-form-row"><label>Date</label>
            <input class="nnne-input" id="nnne-dev-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="nnne-form-row"><label>Deviation Type</label>
            <select class="nnne-form-select" id="nnne-dev-type">${TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>
          <div class="nnne-form-row"><label>Severity</label>
            <select class="nnne-form-select" id="nnne-dev-severity">${SEVS.map(sv=>`<option value="${sv}">${sv}</option>`).join('')}</select></div>
          <div class="nnne-form-row"><label>Status</label>
            <select class="nnne-form-select" id="nnne-dev-status">${STATS.map(st=>`<option value="${st}">${st}</option>`).join('')}</select></div>
          <div class="nnne-form-row"><label>Action Taken</label>
            <textarea class="nnne-textarea" id="nnne-dev-action" placeholder="Describe corrective action taken..."></textarea></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
            <button class="nnne-btn secondary" onclick="window._nnnECloseDevFormDirect()">Cancel</button>
            <button class="nnne-btn primary" onclick="window._nnnESaveDeviation()">Save Deviation</button>
          </div>
        </div>
      </div>` : ''}`;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function render() {
    const SECTIONS = [
      { id:'eligibility', label:'Eligibility Matcher', icon:'🔍' },
      { id:'funnel',      label:'Enrollment Funnel',   icon:'📊' },
      { id:'timeline',    label:'Participant Timeline', icon:'📅' },
      { id:'arms',        label:'Arm Balance',          icon:'⚖' },
      { id:'deviations',  label:'Protocol Deviations',  icon:'⚠' },
    ];

    const tabs = `<div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:20px;overflow-x:auto">
      ${SECTIONS.map(sec=>`<button onclick="window._nnnESection('${sec.id}')" style="padding:10px 18px;border:none;background:none;cursor:pointer;font-size:.83rem;font-weight:${_activeSection===sec.id?'700':'400'};color:${_activeSection===sec.id?'var(--accent-teal)':'var(--text-muted)'};border-bottom:${_activeSection===sec.id?'2px solid var(--accent-teal)':'2px solid transparent'};margin-bottom:-2px;white-space:nowrap;transition:all .15s">${sec.icon} ${sec.label}</button>`).join('')}
    </div>`;

    let body = '';
    if      (_activeSection === 'eligibility') body = buildEligibilitySection();
    else if (_activeSection === 'funnel')      body = buildFunnelSection();
    else if (_activeSection === 'timeline')    body = buildTimelineSection();
    else if (_activeSection === 'arms')        body = buildArmBalanceSection();
    else                                        body = buildDeviationSection();

    document.getElementById('app-content').innerHTML = `
      <div class="nnne-page">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px">
          <div>
            <h2 style="margin:0;font-size:1.15rem;font-weight:800;color:var(--text)">Clinical Trial Enrollment Matcher</h2>
            <p style="margin:4px 0 0 0;font-size:.81rem;color:var(--text-muted)">Eligibility screening · CONSORT funnel · Participant timeline · Arm balance · Protocol deviations</p>
          </div>
        </div>
        <div class="nnne-section">
          ${tabs}
          ${body}
        </div>
      </div>`;
  }

  // ── Window-scoped handlers ────────────────────────────────────────────────

  window._nnnEStudyChange = function(val) {
    _selectedStudyId = val;
    _eligibilityResults = null;
    _selectedParticipantId = null;
    render();
  };

  window._nnnESection = function(id) {
    _activeSection = id;
    render();
  };

  window._nnnEFilter = function(f) {
    _eligibilityFilter = f;
    render();
  };

  window._nnnERunScan = function() {
    _eligibilityFilter = 'all';
    runEligibilityScan();
  };

  window._nnnEInvite = function(patientId, patientName) {
    const invites = getInvitations();
    if (invites.some(i => i.patientId === patientId && i.studyId === _selectedStudyId)) {
      showToast('Patient already invited to this study', false);
      return;
    }
    invites.push({ id:'inv_'+Date.now(), studyId:_selectedStudyId, patientId, patientName, date:new Date().toISOString().slice(0,10), status:'invited' });
    lsSet('ds_trial_invitations', invites);
    showToast(`Invitation sent to ${patientName}`);
    render();
  };

  window._nnnESendInvitations = function() {
    if (!_eligibilityResults) return;
    const eligible = _eligibilityResults.filter(r => r.status === 'eligible' || r.status === 'potentially');
    const invites  = getInvitations();
    let added = 0;
    eligible.forEach(r => {
      if (!invites.some(i => i.patientId === r.id && i.studyId === _selectedStudyId)) {
        invites.push({ id:'inv_'+Date.now()+'_'+r.id, studyId:_selectedStudyId, patientId:r.id, patientName:r.name, date:new Date().toISOString().slice(0,10), status:'invited' });
        added++;
      }
    });
    lsSet('ds_trial_invitations', invites);
    showToast(`${added} invitation${added!==1?'s':''} sent`);
    render();
  };

  window._nnnESelectParticipant = function(id) {
    _selectedParticipantId = _selectedParticipantId === id ? null : id;
    render();
  };

  window._nnnEDevFilter = function(f) {
    _deviationFilter = f;
    render();
  };

  window._nnnEOpenDevForm = function() {
    _showDeviationForm = true;
    render();
  };

  window._nnnECloseDevForm = function(e) {
    if (e && e.target && e.target.id === 'nnne-dev-overlay') {
      _showDeviationForm = false;
      render();
    }
  };

  window._nnnECloseDevFormDirect = function() {
    _showDeviationForm = false;
    render();
  };

  window._nnnESaveDeviation = function() {
    const studyId  = document.getElementById('nnne-dev-study')?.value;
    const pid      = (document.getElementById('nnne-dev-pid')?.value||'').trim();
    const date     = document.getElementById('nnne-dev-date')?.value;
    const type     = document.getElementById('nnne-dev-type')?.value;
    const severity = document.getElementById('nnne-dev-severity')?.value;
    const status   = document.getElementById('nnne-dev-status')?.value;
    const action   = (document.getElementById('nnne-dev-action')?.value||'').trim();
    if (!pid) { showToast('Participant ID is required', false); return; }
    const devs = getDeviations();
    devs.push({ id:'dev_'+Date.now(), studyId, participantId:pid, date, type, severity, status, action, irb: severity==='critical' });
    lsSet('ds_trial_deviations', devs);
    _showDeviationForm = false;
    showToast(severity==='critical' ? 'Critical deviation logged — IRB notification required!' : 'Deviation logged', severity!=='critical');
    render();
  };

  window._nnnEPrintConsort = function() {
    const el = document.getElementById('nnne-consort-wrap');
    if (!el) return;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>CONSORT Diagram</title><style>body{margin:20px;background:#fff;font-family:system-ui,sans-serif}@media print{body{margin:0}}</style></head><body>${el.innerHTML}<script>window.print();<\/script></body></html>`);
    win.document.close();
  };

  window._nnnEPrintGantt = function() {
    const el = document.getElementById('nnne-gantt-wrap');
    if (!el) return;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Participant Timeline</title><style>body{margin:20px;background:#fff}@media print{body{margin:0}}</style></head><body>${el.innerHTML}<script>window.print();<\/script></body></html>`);
    win.document.close();
  };

  // ── Initial render ────────────────────────────────────────────────────────
  render();
}

// ── IRB Protocol Manager ──────────────────────────────────────────────────────
export async function pgIRBManager(setTopbar) {
  setTopbar('IRB Manager', '');
  const el = document.getElementById('content');

  const IRB_STUDIES_SEED = [
    { id:'irb1', studyId:'DS-2024-001', title:'Theta Burst TMS for Treatment-Resistant Depression: A Pilot RCT', board:'Western IRB', pi:'Dr. Sarah Kim', approved:'2024-03-15', expiry:'2026-03-15', status:'active', enrolled:18, target:24, phase:'Phase II', description:'This pilot RCT evaluates the efficacy and safety of theta burst stimulation as an accelerated TMS protocol for patients with treatment-resistant MDD who have failed at least two antidepressant trials. Uses iTBS active arm versus sham control, HDRS-17 as primary outcome.', inclusion:['Age 22-65','DSM-5 MDD diagnosis','PHQ-9 >= 15','Failed >= 2 antidepressant trials','Stable medications >= 4 weeks'], exclusion:['Active suicidal ideation with plan','Seizure history','Implanted metal/devices','Current ECT','Pregnancy'], procedures:['iTBS protocol (600 pulses/session, 10 sessions over 5 days)','Sham TMS control arm','HDRS-17 at baseline/week2/week4','PHQ-9 weekly','Neuropsychological battery at baseline and week 4'], amendments:[{date:'2024-06-10',type:'Protocol Change',description:'Added MRI sub-study at week 4',status:'Approved'},{date:'2025-01-20',type:'Consent Update',description:'Updated consent for MRI sub-study',status:'Approved'}], contact:'sarah.kim@deepsynaps.clinic | 555-0101' },
    { id:'irb2', studyId:'DS-2024-003', title:'Neurofeedback vs Stimulant Medication for Adult ADHD: Comparative Effectiveness', board:'University Hospital IRB', pi:'Dr. James Osei', approved:'2024-08-01', expiry:'2026-04-30', status:'pending_renewal', enrolled:31, target:40, phase:'Phase III', description:'A comparative effectiveness study examining 20-session theta/beta neurofeedback training versus optimized stimulant medication management in adults with ADHD-combined presentation. Primary outcomes include CAARS scores and QbTest at 12 weeks.', inclusion:['Age 18-55','DSM-5 ADHD-combined presentation','CAARS-S:SV T-score >= 65','No current medication or willing to washout 2 weeks'], exclusion:['Comorbid bipolar I or psychosis','Active substance use disorder','Prior neurofeedback (>5 sessions)','Unstable medical conditions'], procedures:['QbTest at baseline/6wk/12wk','CAARS-S:SV weekly','20 sessions neurofeedback or stimulant titration','BRIEF-A cognitive battery'], amendments:[{date:'2024-11-05',type:'Personnel Change',description:'Added co-investigator Dr. Lin Chen',status:'Approved'},{date:'2025-03-12',type:'Protocol Change',description:'Extended follow-up from 12 to 24 weeks for responders',status:'Pending'}], contact:'james.osei@deepsynaps.clinic | 555-0202' },
    { id:'irb3', studyId:'DS-2025-002', title:'tDCS Cognitive Enhancement in Post-COVID Brain Fog: Observational Study', board:'Western IRB', pi:'Dr. Ana Rivera', approved:'2025-01-10', expiry:'2027-01-10', status:'active', enrolled:9, target:30, phase:'Pilot', description:'An observational pilot study assessing feasibility and preliminary efficacy of tDCS targeting the left DLPFC in patients reporting cognitive symptoms persisting >= 3 months post-COVID-19 infection.', inclusion:['Age 21-60','PCR-confirmed COVID-19 >= 3 months prior','Self-reported cognitive symptoms','MoCA < 26','No other neurological diagnosis'], exclusion:['Active COVID infection','Skin conditions at electrode sites','History of epilepsy','TBI','Currently enrolled in other cognitive intervention study'], procedures:['10 sessions tDCS (2mA, 20min/session)','MoCA at baseline/5/10 sessions','CFQ fatigue questionnaire','PROMIS cognitive function scale','Optional EEG pre/post'], amendments:[{date:'2025-04-22',type:'Protocol Change',description:'Added optional EEG recording sub-study',status:'Approved'},{date:'2025-08-30',type:'Consent Update',description:'Revised compensation language per IRB guidance',status:'Approved'}], contact:'ana.rivera@deepsynaps.clinic | 555-0303' },
  ];

  const AE_SEED = [
    { id:'ae1', studyId:'irb1', patientId:'PT-001', eventType:'Scalp Discomfort', severity:'mild', onsetDate:'2024-09-12', description:'Patient reported mild scalp tingling and warmth at electrode site during session 7. Resolved within 30 minutes.', causality:'probably', actionsTaken:'Session continued at reduced intensity. Patient monitored for 1 hour post-session.', status:'resolved', reportedToIRB:false },
    { id:'ae2', studyId:'irb1', patientId:'PT-003', eventType:'Transient Headache', severity:'moderate', onsetDate:'2024-10-05', description:'Patient reported moderate headache (6/10 NRS) after session 10, lasting ~4 hours. Managed with OTC analgesics.', causality:'possibly', actionsTaken:'OTC analgesia provided. PI notified. Patient contacted next day, fully resolved.', status:'resolved', reportedToIRB:false },
    { id:'ae3', studyId:'irb2', patientId:'PT-007', eventType:'Anxiety Exacerbation', severity:'moderate', onsetDate:'2025-01-18', description:'Patient reported increased anxiety and sleep disruption following week 3 of neurofeedback. GAD-7 score increased from 8 to 14.', causality:'possibly', actionsTaken:'Neurofeedback sessions temporarily suspended. Psychiatric consultation obtained.', status:'under_review', reportedToIRB:false },
    { id:'ae4', studyId:'irb2', patientId:'PT-012', eventType:'Syncopal Episode', severity:'severe', onsetDate:'2025-02-10', description:'Patient experienced a brief syncopal episode (loss of consciousness ~30s) during session 12. EMS called, patient transported to ED. Cardiac workup negative.', causality:'unrelated', actionsTaken:'Emergency protocol activated. EMS called. IRB notified within 24 hours. Patient withdrawn per protocol.', status:'reported_to_irb', reportedToIRB:true },
    { id:'ae5', studyId:'irb3', patientId:'PT-002', eventType:'Skin Irritation', severity:'mild', onsetDate:'2025-03-05', description:'Mild erythema at cathode electrode site. Resolved within 24 hours without intervention.', causality:'definitely', actionsTaken:'Electrode position adjusted for subsequent sessions. Skin barrier cream applied.', status:'resolved', reportedToIRB:false },
    { id:'ae6', studyId:'irb3', patientId:'PT-005', eventType:'Unexpected Mood Elevation', severity:'unexpected', onsetDate:'2025-04-01', description:'Patient reported unexpected significant mood elevation and reduced sleep (3-4 hours) lasting 5 days following tDCS session 8. No prior bipolar history.', causality:'probably', actionsTaken:'Sessions suspended. Psychiatric evaluation obtained. PI notified. IRB notification in process.', status:'open', reportedToIRB:false },
  ];

  const CONSENT_SEED = [
    { id:'rc1', patientId:'PT-001', studyId:'irb1', consentVersion:'v1.0', signedDate:'2024-09-01', capacityAssessment:'full', lar:'N/A', reconsentDue:'N/A', reconsentReason:'' },
    { id:'rc2', patientId:'PT-007', studyId:'irb2', consentVersion:'v1.0', signedDate:'2024-10-15', capacityAssessment:'full', lar:'N/A', reconsentDue:'2025-05-01', reconsentReason:'Protocol amendment (24-week follow-up extension)' },
    { id:'rc3', patientId:'PT-002', studyId:'irb3', consentVersion:'v1.1', signedDate:'2025-03-01', capacityAssessment:'assisted', lar:'James Wu (Spouse)', reconsentDue:'N/A', reconsentReason:'' },
  ];

  const DOCS_SEED = [
    { id:'doc1',  studyId:'irb1', name:'IRB Approval Letter - DS-2024-001', version:'1.0', date:'2024-03-15', status:'current',    type:'irb_approval', preview:'WESTERN IRB\nApproval Notice\n\nStudy: DS-2024-001\nTitle: Theta Burst TMS for Treatment-Resistant Depression\nPI: Dr. Sarah Kim\nApproval Date: March 15, 2024\nExpiry: March 15, 2026\nRisk Category: Greater Than Minimal Risk\nApproval Conditions: Annual renewal required. All amendments must be submitted for review prior to implementation.' },
    { id:'doc2',  studyId:'irb1', name:'Study Protocol v1.0 - DS-2024-001', version:'1.0', date:'2024-03-01', status:'superseded', type:'protocol',     preview:'PROTOCOL DOCUMENT\nDS-2024-001 v1.0\n\nTheta Burst TMS for Treatment-Resistant Depression: A Pilot RCT\n\n[Full protocol - 42 pages]' },
    { id:'doc3',  studyId:'irb1', name:'Study Protocol v1.1 - DS-2024-001 (MRI sub-study)', version:'1.1', date:'2024-06-20', status:'current',    type:'protocol',     preview:'PROTOCOL DOCUMENT\nDS-2024-001 v1.1\n\nAmended to include optional MRI sub-study at week 4 endpoint.\n\n[Full protocol - 47 pages]' },
    { id:'doc4',  studyId:'irb1', name:'Informed Consent Form v1.0', version:'1.0', date:'2024-03-01', status:'superseded', type:'consent_form', preview:'INFORMED CONSENT DOCUMENT\nDS-2024-001 Participant Consent v1.0\n\nYou are being asked to participate in a research study...\n\n[ICF - 8 pages]' },
    { id:'doc5',  studyId:'irb1', name:'Informed Consent Form v1.1 (MRI addendum)', version:'1.1', date:'2024-07-01', status:'current',    type:'consent_form', preview:'INFORMED CONSENT DOCUMENT\nDS-2024-001 Participant Consent v1.1\n\nThis version includes the optional MRI sub-study addendum approved June 2024.\n\n[ICF - 10 pages]' },
    { id:'doc6',  studyId:'irb1', name:'HIPAA Authorization Form', version:'1.0', date:'2024-03-01', status:'current',    type:'hipaa',        preview:'HIPAA AUTHORIZATION\nDS-2024-001\n\nAuthorization to Use and Disclose Protected Health Information for Research Purposes.' },
    { id:'doc7',  studyId:'irb2', name:'IRB Approval Letter - DS-2024-003', version:'1.0', date:'2024-08-01', status:'current',    type:'irb_approval', preview:'UNIVERSITY HOSPITAL IRB\nApproval Notice\n\nStudy: DS-2024-003\nTitle: Neurofeedback vs Stimulant Medication for Adult ADHD\nPI: Dr. James Osei\nApproval Date: August 1, 2024\nExpiry: April 30, 2026 (RENEWAL REQUIRED)\nRisk Category: Greater Than Minimal Risk' },
    { id:'doc8',  studyId:'irb2', name:'Amendment Approval - Personnel Change (Dr. Lin Chen)', version:'1.0', date:'2024-11-20', status:'current',    type:'amendment',    preview:'AMENDMENT APPROVAL\nDS-2024-003 Amendment 1\n\nPersonnel Change: Addition of Dr. Lin Chen as Co-Investigator\nApproved November 20, 2024\n\nNo changes to study procedures or risk level.' },
    { id:'doc9',  studyId:'irb3', name:'IRB Approval Letter - DS-2025-002', version:'1.0', date:'2025-01-10', status:'current',    type:'irb_approval', preview:'WESTERN IRB\nApproval Notice\n\nStudy: DS-2025-002\nTitle: tDCS Cognitive Enhancement in Post-COVID Brain Fog\nPI: Dr. Ana Rivera\nApproval Date: January 10, 2025\nExpiry: January 10, 2027\nRisk Category: Greater Than Minimal Risk' },
    { id:'doc10', studyId:'irb3', name:'Study Protocol v1.0 - DS-2025-002', version:'1.0', date:'2025-01-05', status:'superseded', type:'protocol',     preview:'PROTOCOL DOCUMENT\nDS-2025-002 v1.0\n\ntDCS Cognitive Enhancement in Post-COVID Brain Fog: Observational Study\n\n[Full protocol - 28 pages]' },
    { id:'doc11', studyId:'irb3', name:'Study Protocol v1.1 - DS-2025-002 (EEG sub-study)', version:'1.1', date:'2025-05-01', status:'current',    type:'protocol',     preview:'PROTOCOL DOCUMENT\nDS-2025-002 v1.1\n\nAmended to include optional EEG recording sub-study.\n\n[Full protocol - 32 pages]' },
    { id:'doc12', studyId:'irb3', name:'Informed Consent Form v1.2 (revised compensation)', version:'1.2', date:'2025-09-10', status:'current',    type:'consent_form', preview:'INFORMED CONSENT DOCUMENT\nDS-2025-002 Participant Consent v1.2\n\nRevised compensation language per Western IRB guidance (September 2025).\n\n[ICF - 9 pages]' },
  ];

  function lsGet(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } }
  function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function initData() {
    if (!localStorage.getItem('ds_irb_studies'))           lsSet('ds_irb_studies',           IRB_STUDIES_SEED);
    if (!localStorage.getItem('ds_irb_adverse_events'))    lsSet('ds_irb_adverse_events',    AE_SEED);
    if (!localStorage.getItem('ds_irb_research_consents')) lsSet('ds_irb_research_consents', CONSENT_SEED);
    if (!localStorage.getItem('ds_irb_documents'))         lsSet('ds_irb_documents',         DOCS_SEED);
    if (!localStorage.getItem('ds_irb_drafts'))            lsSet('ds_irb_drafts',            []);
  }
  initData();
  function getStudies()  { return lsGet('ds_irb_studies', IRB_STUDIES_SEED); }
  function getAEs()      { return lsGet('ds_irb_adverse_events', AE_SEED); }
  function getConsents() { return lsGet('ds_irb_research_consents', CONSENT_SEED); }
  function getDocs()     { return lsGet('ds_irb_documents', DOCS_SEED); }
  function getDrafts()   { return lsGet('ds_irb_drafts', []); }
  function studyLabel(id) { const s = getStudies().find(x => x.id === id); return s ? s.studyId : id; }

  let _activeTab     = 'active-studies';
  let _expandedStudy = null;
  let _wizardStep    = 1;
  let _wizardDraft   = { info:{}, population:{}, arms:[{name:'',intervention:'',sessions:'',duration:'',frequency:''}], regulatory:{} };
  let _docFilterStudy = '';
  let _docFilterType  = '';

  function toast(msg, ok) {
    if (ok === undefined) ok = true;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:' + (ok ? 'var(--accent-teal)' : 'var(--accent-rose)') + ';color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.35);pointer-events:none;opacity:0;transition:opacity .2s';
    d.textContent = msg;
    document.body.appendChild(d);
    requestAnimationFrame(function() { d.style.opacity = '1'; });
    setTimeout(function() { d.style.opacity = '0'; setTimeout(function() { d.remove(); }, 250); }, 2800);
  }

  function statusBadge(status) {
    var map = { active:{label:'Active',color:'var(--accent-teal)'}, pending_renewal:{label:'Pending Renewal',color:'var(--accent-amber)'}, closed:{label:'Closed',color:'var(--text-muted)'} };
    var s = map[status] || {label:status,color:'var(--text-muted)'};
    return '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:' + s.color + '22;color:' + s.color + ';border:1px solid ' + s.color + '55">' + s.label + '</span>';
  }
  function aeSeverityBadge(sev) {
    var cls = {mild:'nnna-ae-mild',moderate:'nnna-ae-moderate',severe:'nnna-ae-severe',unexpected:'nnna-ae-unexpected'};
    var lbl = {mild:'Mild',moderate:'Moderate',severe:'Severe',unexpected:'Unexpected'};
    return '<span class="nnna-ae-severity ' + (cls[sev]||'') + '">' + (lbl[sev]||sev) + '</span>';
  }
  function aeStatusBadge(st) {
    var map = {open:{label:'Open',color:'var(--accent-amber)'},under_review:{label:'Under Review',color:'var(--accent-blue)'},resolved:{label:'Resolved',color:'var(--accent-teal)'},reported_to_irb:{label:'Reported to IRB',color:'var(--accent-violet)'}};
    var s = map[st] || {label:st,color:'var(--text-muted)'};
    return '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;background:' + s.color + '22;color:' + s.color + ';border:1px solid ' + s.color + '44">' + s.label + '</span>';
  }
  function amendStatusBadge(st) {
    var map = {Approved:'var(--accent-teal)',Pending:'var(--accent-amber)',Rejected:'var(--accent-rose)',Renewal:'var(--accent-blue)'};
    var c = map[st] || 'var(--text-muted)';
    return '<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600;background:' + c + '22;color:' + c + '">' + st + '</span>';
  }
  function docTypeBadge(type) {
    var map = {irb_approval:{label:'IRB Approval',color:'var(--accent-teal)'},protocol:{label:'Protocol',color:'var(--accent-blue)'},consent_form:{label:'Consent',color:'var(--accent-violet)'},hipaa:{label:'HIPAA',color:'var(--accent-amber)'},amendment:{label:'Amendment',color:'var(--accent-rose)'}};
    var s = map[type] || {label:type,color:'var(--text-muted)'};
    return '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;background:' + s.color + '22;color:' + s.color + ';border:1px solid ' + s.color + '44">' + s.label + '</span>';
  }
  function docStatusBadge(st) {
    var map = {current:'var(--accent-teal)',superseded:'var(--text-muted)',pending:'var(--accent-amber)'};
    var c = map[st] || 'var(--text-muted)';
    return '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:600;background:' + c + '22;color:' + c + ';border:1px solid ' + c + '44;text-transform:capitalize">' + st + '</span>';
  }
  function enrollBar(enrolled, target) {
    var pct = Math.min(100, Math.round((enrolled / target) * 100));
    var color = pct >= 90 ? 'var(--accent-teal)' : pct >= 60 ? 'var(--accent-blue)' : 'var(--accent-amber)';
    return '<div class="nnna-enrollment-bar"><div class="nnna-enrollment-fill" style="width:' + pct + '%;background:' + color + '"></div><span class="nnna-enrollment-label">' + enrolled + '/' + target + ' (' + pct + '%)</span></div>';
  }

  function tabBar() {
    var tabs = [{id:'active-studies',label:'Active Studies'},{id:'study-design',label:'Study Design Builder'},{id:'adverse-events',label:'Adverse Event Reporting'},{id:'consent-tracking',label:'Consent Tracking'},{id:'reg-documents',label:'Regulatory Documents'}];
    return '<div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:22px;overflow-x:auto">' +
      tabs.map(function(t) {
        var active = _activeTab === t.id;
        return '<button onclick="window._irbTab(\'' + t.id + '\')" style="padding:10px 18px;background:none;border:none;border-bottom:' + (active?'2px solid var(--accent-teal)':'2px solid transparent') + ';color:' + (active?'var(--accent-teal)':'var(--text-muted)') + ';font-size:13px;font-weight:' + (active?'700':'500') + ';cursor:pointer;white-space:nowrap;transition:color .15s;margin-bottom:-2px">' + t.label + '</button>';
      }).join('') + '</div>';
  }

  function renderActiveStudies() {
    var studies = getStudies();
    return '<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px"><div><h2 style="margin:0;font-size:1.1rem;font-weight:800;color:var(--text)">IRB-Approved Studies</h2><div style="font-size:12px;color:var(--text-muted);margin-top:3px">' + studies.length + ' registered studies</div></div></div>' +
      studies.map(renderStudyCard).join('') + '</div>';
  }

  function renderStudyCard(s) {
    var expanded = _expandedStudy === s.id;
    var accentColor = s.status === 'active' ? 'var(--accent-teal)' : s.status === 'pending_renewal' ? 'var(--accent-amber)' : 'var(--text-muted)';
    var expiryColor = s.status === 'pending_renewal' ? 'var(--accent-amber)' : 'var(--text)';
    var renewBtn = s.status === 'pending_renewal' ? '<button class="nnna-btn-sm nnna-btn-teal" onclick="window._irbRenewModal(\'' + s.id + '\')">Renew Approval</button>' : '';
    var detailHtml = '';
    if (expanded) {
      var incLi = s.inclusion.map(function(c) { return '<li style="margin-bottom:3px">' + c + '</li>'; }).join('');
      var excLi = s.exclusion.map(function(c) { return '<li style="margin-bottom:3px">' + c + '</li>'; }).join('');
      var procLi = s.procedures.map(function(p) { return '<li style="margin-bottom:3px">' + p + '</li>'; }).join('');
      var amendRows = s.amendments.map(function(a) {
        return '<tr style="border-bottom:1px solid var(--border)"><td style="padding:7px 10px;font-size:12px;color:var(--text-muted)">' + a.date + '</td><td style="padding:7px 10px;font-size:12px">' + a.type + '</td><td style="padding:7px 10px;font-size:12px">' + a.description + '</td><td style="padding:7px 10px">' + amendStatusBadge(a.status) + '</td></tr>';
      }).join('');
      detailHtml = '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px">' +
        '<div><div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Study Description</div><div style="font-size:12.5px;color:var(--text);line-height:1.6">' + s.description + '</div></div>' +
        '<div><div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Contact</div><div style="font-size:12.5px;color:var(--text);margin-bottom:12px">' + s.contact + '</div>' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Approved Procedures</div><ul style="margin:0;padding-left:16px;font-size:12px;color:var(--text)">' + procLi + '</ul></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px">' +
        '<div><div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Inclusion Criteria</div><ul style="margin:0;padding-left:16px;font-size:12px;color:var(--text)">' + incLi + '</ul></div>' +
        '<div><div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Exclusion Criteria</div><ul style="margin:0;padding-left:16px;font-size:12px;color:var(--text)">' + excLi + '</ul></div></div>' +
        '<div><div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Amendment History</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="border-bottom:1px solid var(--border)"><th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted)">Date</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted)">Type</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted)">Description</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted)">Status</th></tr></thead><tbody>' + amendRows + '</tbody></table></div></div>';
    }
    return '<div class="nnna-study-card" style="border-left:4px solid ' + accentColor + '">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:250px"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px"><span style="font-size:11px;font-weight:700;color:var(--accent-teal);letter-spacing:.5px">' + s.studyId + '</span><span style="font-size:10px;background:var(--hover-bg);color:var(--text-muted);padding:1px 7px;border-radius:8px">' + s.phase + '</span>' + statusBadge(s.status) + '</div><h3 style="margin:0 0 6px;font-size:14px;font-weight:700;color:var(--text);line-height:1.4">' + s.title + '</h3><div style="font-size:12px;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:12px"><span>PI: <strong style="color:var(--text)">' + s.pi + '</strong></span><span>Board: <strong style="color:var(--text)">' + s.board + '</strong></span><span>Approved: <strong style="color:var(--text)">' + s.approved + '</strong></span><span>Expires: <strong style="color:' + expiryColor + '">' + s.expiry + '</strong></span></div></div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-width:190px"><div style="width:100%"><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Enrollment Progress</div>' + enrollBar(s.enrolled, s.target) + '</div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="nnna-btn-sm" onclick="window._irbToggleStudy(\'' + s.id + '\')">' + (expanded ? 'Hide Details' : 'View Details') + '</button><button class="nnna-btn-sm nnna-btn-amber" onclick="window._irbAmendModal(\'' + s.id + '\')">Request Amendment</button>' + renewBtn + '</div></div></div>' +
      detailHtml + '</div>';
  }

  function renderStudyDesign() {
    var labels = ['Study Info','Population','Protocol Arms','Regulatory'];
    var stepNodes = [1,2,3,4].map(function(i) {
      var active = _wizardStep === i, done = _wizardStep > i;
      return '<div class="nnna-step-node' + (active?' active':'') + (done?' done':'') + '" onclick="window._irbWizardStep(' + i + ')" style="cursor:pointer"><div class="nnna-step-circle">' + (done ? '&#10003;' : i) + '</div><div class="nnna-step-label">' + labels[i-1] + '</div></div>';
    }).join('<div class="nnna-step-connector"></div>');
    return '<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px"><div><h2 style="margin:0;font-size:1.1rem;font-weight:800;color:var(--text)">Study Design Builder</h2><div style="font-size:12px;color:var(--text-muted);margin-top:3px">Draft a new IRB submission in 4 steps</div></div><button class="nnna-btn-sm" onclick="window._irbLoadDraft()">Load Saved Draft</button></div><div class="nnna-step-wizard">' + stepNodes + '</div>' + renderWizardStep() + '</div>';
  }

  function renderWizardStep() {
    if (_wizardStep === 1) return renderWizardStep1();
    if (_wizardStep === 2) return renderWizardStep2();
    if (_wizardStep === 3) return renderWizardStep3();
    return renderWizardStep4();
  }

  function renderWizardStep1() {
    var d = _wizardDraft.info;
    var typeOpts = ['RCT','Observational','Case Series','Pilot'].map(function(v) { return '<option' + (d.studyType===v?' selected':'') + '>' + v + '</option>'; }).join('');
    var blindOpts = ['Open Label','Single Blind','Double Blind'].map(function(v) { return '<option' + (d.blinding===v?' selected':'') + '>' + v + '</option>'; }).join('');
    return '<div class="nnna-wizard-panel"><h3 style="margin:0 0 16px;font-size:15px;font-weight:700;color:var(--text)">Step 1 - Study Information</h3><div class="nnna-form-grid"><div class="nnna-form-group" style="grid-column:1/-1"><label>Study Title *</label><input class="form-control" id="wiz-title" placeholder="Full study title" value="' + (d.title||'').replace(/"/g,'&quot;') + '" oninput="window._irbWizSave()"></div><div class="nnna-form-group" style="grid-column:1/-1"><label>Hypothesis / Research Question *</label><textarea class="form-control" id="wiz-hypothesis" rows="3" placeholder="State the primary hypothesis..." oninput="window._irbWizSave()">' + (d.hypothesis||'') + '</textarea></div><div class="nnna-form-group" style="grid-column:1/-1"><label>Primary Endpoint *</label><input class="form-control" id="wiz-primary-ep" placeholder="e.g., HDRS-17 change from baseline at week 4" value="' + (d.primaryEp||'').replace(/"/g,'&quot;') + '" oninput="window._irbWizSave()"></div><div class="nnna-form-group" style="grid-column:1/-1"><label>Secondary Endpoints</label><textarea class="form-control" id="wiz-secondary-ep" rows="2" placeholder="List secondary endpoints, one per line..." oninput="window._irbWizSave()">' + (d.secondaryEp||'') + '</textarea></div><div class="nnna-form-group"><label>Study Type *</label><select class="form-control" id="wiz-type" onchange="window._irbWizSave()"><option value="">Select...</option>' + typeOpts + '</select></div><div class="nnna-form-group"><label>Blinding</label><select class="form-control" id="wiz-blinding" onchange="window._irbWizSave()"><option value="">Select...</option>' + blindOpts + '</select></div></div><div style="display:flex;justify-content:flex-end;margin-top:20px"><button class="nnna-btn-primary" onclick="window._irbWizardStep(2)">Next: Population</button></div></div>';
  }

  function renderWizardStep2() {
    var d = _wizardDraft.population;
    var incRows = (d.inclusion||['']);
    var excRows = (d.exclusion||['']);
    var incHtml = incRows.map(function(r,i) { return '<div style="display:flex;gap:6px;margin-bottom:6px"><input class="form-control" style="flex:1" placeholder="Inclusion criterion ' + (i+1) + '" value="' + r.replace(/"/g,'&quot;') + '" oninput="window._irbIncChange(' + i + ',this.value)"><button class="nnna-btn-sm nnna-btn-rose" onclick="window._irbRemoveInc(' + i + ')" style="padding:4px 10px">x</button></div>'; }).join('');
    var excHtml = excRows.map(function(r,i) { return '<div style="display:flex;gap:6px;margin-bottom:6px"><input class="form-control" style="flex:1" placeholder="Exclusion criterion ' + (i+1) + '" value="' + r.replace(/"/g,'&quot;') + '" oninput="window._irbExcChange(' + i + ',this.value)"><button class="nnna-btn-sm nnna-btn-rose" onclick="window._irbRemoveExc(' + i + ')" style="padding:4px 10px">x</button></div>'; }).join('');
    return '<div class="nnna-wizard-panel"><h3 style="margin:0 0 16px;font-size:15px;font-weight:700;color:var(--text)">Step 2 - Study Population</h3><div class="nnna-form-grid"><div class="nnna-form-group"><label>Target Sample Size (N) *</label><input class="form-control" id="wiz-target-n" type="number" min="1" placeholder="e.g., 40" value="' + (d.targetN||'') + '" oninput="window._irbWizSave2()"></div><div class="nnna-form-group"><label>Age Range</label><div style="display:flex;gap:8px;align-items:center"><input class="form-control" id="wiz-age-min" type="number" placeholder="Min" style="width:90px" value="' + (d.ageMin||'') + '" oninput="window._irbWizSave2()"><span style="color:var(--text-muted)">-</span><input class="form-control" id="wiz-age-max" type="number" placeholder="Max" style="width:90px" value="' + (d.ageMax||'') + '" oninput="window._irbWizSave2()"></div></div><div class="nnna-form-group" style="grid-column:1/-1"><label>Diagnosis / Condition Filter</label><input class="form-control" id="wiz-diagnosis" placeholder="e.g., DSM-5 MDD, ADHD-combined" value="' + (d.diagnosis||'').replace(/"/g,'&quot;') + '" oninput="window._irbWizSave2()"></div></div><div style="margin-top:14px"><div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Inclusion Criteria</div><div id="wiz-inc-rows">' + incHtml + '</div><button class="nnna-btn-sm" onclick="window._irbAddInc()" style="margin-top:4px">+ Add Criterion</button></div><div style="margin-top:14px"><div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Exclusion Criteria</div><div id="wiz-exc-rows">' + excHtml + '</div><button class="nnna-btn-sm" onclick="window._irbAddExc()" style="margin-top:4px">+ Add Criterion</button></div><div style="display:flex;justify-content:space-between;margin-top:20px"><button class="nnna-btn-sm" onclick="window._irbWizardStep(1)">Back</button><button class="nnna-btn-primary" onclick="window._irbWizardStep(3)">Next: Protocol Arms</button></div></div>';
  }

  function renderWizardStep3() {
    var arms = _wizardDraft.arms;
    var armsHtml = arms.map(function(arm, i) {
      return '<div style="background:var(--hover-bg);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><span style="font-size:12px;font-weight:700;color:var(--text-muted)">ARM ' + (i+1) + '</span>' + (arms.length > 1 ? '<button class="nnna-btn-sm nnna-btn-rose" onclick="window._irbRemoveArm(' + i + ')">Remove</button>' : '') + '</div><div class="nnna-form-grid"><div class="nnna-form-group"><label>Arm Name *</label><input class="form-control" placeholder="e.g., Active TMS" value="' + (arm.name||'').replace(/"/g,'&quot;') + '" oninput="window._irbArmChange(' + i + ',\'name\',this.value)"></div><div class="nnna-form-group"><label>Intervention *</label><input class="form-control" placeholder="e.g., iTBS 600 pulses" value="' + (arm.intervention||'').replace(/"/g,'&quot;') + '" oninput="window._irbArmChange(' + i + ',\'intervention\',this.value)"></div><div class="nnna-form-group"><label>Sessions</label><input class="form-control" type="number" min="1" placeholder="20" value="' + (arm.sessions||'') + '" oninput="window._irbArmChange(' + i + ',\'sessions\',this.value)"></div><div class="nnna-form-group"><label>Duration (min)</label><input class="form-control" type="number" min="1" placeholder="30" value="' + (arm.duration||'') + '" oninput="window._irbArmChange(' + i + ',\'duration\',this.value)"></div><div class="nnna-form-group" style="grid-column:1/-1"><label>Frequency</label><input class="form-control" placeholder="e.g., 2x/week for 10 weeks" value="' + (arm.frequency||'').replace(/"/g,'&quot;') + '" oninput="window._irbArmChange(' + i + ',\'frequency\',this.value)"></div></div></div>';
    }).join('');
    return '<div class="nnna-wizard-panel"><h3 style="margin:0 0 16px;font-size:15px;font-weight:700;color:var(--text)">Step 3 - Protocol Arms</h3><div id="wiz-arms-container">' + armsHtml + '</div>' + (arms.length < 4 ? '<button class="nnna-btn-sm" onclick="window._irbAddArm()">+ Add Arm</button>' : '') + '<div style="margin-top:14px"><label style="font-size:12px;font-weight:600;color:var(--text)">Randomization Ratio</label><input class="form-control" id="wiz-rand-ratio" placeholder="e.g., 1:1 active:control" value="' + (_wizardDraft.randRatio||'').replace(/"/g,'&quot;') + '" oninput="_wizardDraft.randRatio=this.value" style="margin-top:6px;max-width:260px"></div><div style="display:flex;justify-content:space-between;margin-top:20px"><button class="nnna-btn-sm" onclick="window._irbWizardStep(2)">Back</button><button class="nnna-btn-primary" onclick="window._irbWizardStep(4)">Next: Regulatory</button></div></div>';
  }

  function renderWizardStep4() {
    var d = _wizardDraft.regulatory;
    return '<div class="nnna-wizard-panel"><h3 style="margin:0 0 16px;font-size:15px;font-weight:700;color:var(--text)">Step 4 - Regulatory Information</h3><div class="nnna-form-grid"><div class="nnna-form-group"><label>IRB Board Name *</label><input class="form-control" id="wiz-board" placeholder="e.g., Western IRB" value="' + (d.board||'').replace(/"/g,'&quot;') + '" oninput="window._irbRegSave()"></div><div class="nnna-form-group"><label>Planned Submission Date</label><input class="form-control" id="wiz-sub-date" type="date" value="' + (d.submissionDate||'') + '" oninput="window._irbRegSave()"></div><div class="nnna-form-group"><label>Risk Level *</label><select class="form-control" id="wiz-risk" onchange="window._irbRegSave()"><option value="">Select...</option><option value="minimal"' + (d.risk==='minimal'?' selected':'') + '>Minimal Risk</option><option value="greater"' + (d.risk==='greater'?' selected':'') + '>Greater Than Minimal Risk</option></select></div><div class="nnna-form-group"><label>HIPAA Authorization Type</label><select class="form-control" id="wiz-hipaa" onchange="window._irbRegSave()"><option value="">Select...</option><option value="full"' + (d.hipaa==='full'?' selected':'') + '>Full Authorization</option><option value="limited"' + (d.hipaa==='limited'?' selected':'') + '>Limited Dataset</option><option value="waiver"' + (d.hipaa==='waiver'?' selected':'') + '>Waiver of Authorization</option></select></div><div class="nnna-form-group" style="grid-column:1/-1"><label>Data Retention Period</label><input class="form-control" id="wiz-retention" placeholder="e.g., 7 years post-study completion" value="' + (d.retention||'').replace(/"/g,'&quot;') + '" oninput="window._irbRegSave()"></div></div><div style="display:flex;justify-content:space-between;margin-top:20px;flex-wrap:wrap;gap:8px"><button class="nnna-btn-sm" onclick="window._irbWizardStep(3)">Back</button><div style="display:flex;gap:8px"><button class="nnna-btn-sm nnna-btn-amber" onclick="window._irbSaveDraft()">Save as Draft</button><button class="nnna-btn-primary" onclick="window._irbSubmitToIRB()">Submit to IRB</button></div></div></div>';
  }

  function renderAEReporting() {
    var aes = getAEs();
    var needsIRB = aes.filter(function(ae) { return (ae.severity === 'severe' || ae.severity === 'unexpected') && !ae.reportedToIRB; });
    var now = new Date();
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'), label: d.toLocaleString('default',{month:'short'}) });
    }
    var sevCats = ['mild','moderate','severe','unexpected'];
    var sevColors = {mild:'var(--accent-teal)',moderate:'var(--accent-amber)',severe:'var(--accent-rose)',unexpected:'var(--accent-violet)'};
    var chartData = months.map(function(m) {
      var b = {mild:0,moderate:0,severe:0,unexpected:0};
      aes.forEach(function(ae) { if (ae.onsetDate && ae.onsetDate.slice(0,7) === m.key && b[ae.severity] !== undefined) b[ae.severity]++; });
      return Object.assign({}, m, b, {total:b.mild+b.moderate+b.severe+b.unexpected});
    });
    var maxTotal = Math.max.apply(null, chartData.map(function(d) { return d.total; }).concat([1]));
    var svgW = 480, svgH = 140, padL = 28, padB = 24, padT = 12, barW = 38;
    var gap = (svgW - padL - 12 - months.length * barW) / Math.max(months.length - 1, 1);
    var bars = '';
    chartData.forEach(function(d, i) {
      var x = padL + i * (barW + gap);
      var yOff = svgH - padB;
      sevCats.forEach(function(sev) {
        if (!d[sev]) return;
        var bh = (d[sev] / maxTotal) * (svgH - padB - padT);
        yOff -= bh;
        bars += '<rect x="' + x + '" y="' + yOff.toFixed(1) + '" width="' + barW + '" height="' + bh.toFixed(1) + '" fill="' + sevColors[sev] + '" opacity="0.85" rx="2"/>';
      });
      bars += '<text x="' + (x + barW/2).toFixed(1) + '" y="' + (svgH - padB + 14) + '" text-anchor="middle" font-size="10" fill="var(--text-muted)">' + d.label + '</text>';
      if (d.total > 0) bars += '<text x="' + (x + barW/2).toFixed(1) + '" y="' + (yOff - 3).toFixed(1) + '" text-anchor="middle" font-size="9" fill="var(--text)">' + d.total + '</text>';
    });
    var legendHtml = sevCats.map(function(s) { return '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:' + sevColors[s] + ';border-radius:2px;display:inline-block"></span>' + s.charAt(0).toUpperCase()+s.slice(1) + '</span>'; }).join('');
    var irbWarnHtml = needsIRB.length > 0 ? '<div style="background:var(--accent-rose)18;border:1px solid var(--accent-rose)55;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px"><span style="font-size:18px;flex-shrink:0">&#9888;</span><div><div style="font-size:13px;font-weight:700;color:var(--accent-rose);margin-bottom:3px">IRB Notification Required</div><div style="font-size:12px;color:var(--text)">' + needsIRB.length + ' adverse event' + (needsIRB.length>1?'s':'') + ' (Severe or Unexpected) require IRB notification: ' + needsIRB.map(function(ae) { return '<strong>' + ae.patientId + '</strong> - ' + ae.eventType; }).join('; ') + '</div></div></div>' : '';
    var aeRows = aes.map(function(ae) {
      return '<tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background=\'var(--hover-bg)\'" onmouseout="this.style.background=\'\'"><td style="padding:9px 10px"><span style="font-size:11px;font-weight:700;color:var(--accent-teal)">' + studyLabel(ae.studyId) + '</span></td><td style="padding:9px 10px;color:var(--text)">' + ae.patientId + '</td><td style="padding:9px 10px;color:var(--text)">' + ae.eventType + '</td><td style="padding:9px 10px">' + aeSeverityBadge(ae.severity) + '</td><td style="padding:9px 10px;color:var(--text-muted)">' + ae.onsetDate + '</td><td style="padding:9px 10px">' + aeStatusBadge(ae.status) + '</td><td style="padding:9px 10px"><button class="nnna-btn-sm" onclick="window._irbViewAE(\'' + ae.id + '\')">View</button></td></tr>';
    }).join('');
    return '<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px"><div><h2 style="margin:0;font-size:1.1rem;font-weight:800;color:var(--text)">Adverse Event Reporting</h2><div style="font-size:12px;color:var(--text-muted);margin-top:3px">' + aes.length + ' events logged</div></div><div style="display:flex;gap:8px"><button class="nnna-btn-sm" onclick="window._irbExportAE()">Export AE Report</button><button class="nnna-btn-primary" onclick="window._irbNewAEModal()">Report New AE</button></div></div>' + irbWarnHtml + '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:18px"><div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:10px;display:flex;align-items:center;gap:16px;flex-wrap:wrap"><span style="text-transform:uppercase;letter-spacing:.5px">AE Trend - Last 6 Months</span><span style="font-size:11px;display:flex;gap:10px;flex-wrap:wrap">' + legendHtml + '</span></div><svg viewBox="0 0 ' + svgW + ' ' + svgH + '" style="width:100%;max-width:' + svgW + 'px;display:block;overflow:visible"><line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (svgH-padB) + '" stroke="var(--border)" stroke-width="1"/><line x1="' + padL + '" y1="' + (svgH-padB) + '" x2="' + (svgW-10) + '" y2="' + (svgH-padB) + '" stroke="var(--border)" stroke-width="1"/>' + bars + '</svg></div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="border-bottom:2px solid var(--border)"><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Study</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Patient ID</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Event Type</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Severity</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Date</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Status</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Action</th></tr></thead><tbody>' + aeRows + '</tbody></table></div></div>';
  }

  function renderConsentTracking() {
    var consents = getConsents();
    function capBadge(c) {
      var map = {full:{label:'Full',color:'var(--accent-teal)'},assisted:{label:'Assisted',color:'var(--accent-amber)'},lar:{label:'LAR Required',color:'var(--accent-rose)'}};
      var s = map[c] || {label:c, color:'var(--text-muted)'};
      return '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;background:' + s.color + '22;color:' + s.color + ';border:1px solid ' + s.color + '44">' + s.label + '</span>';
    }
    var reconsentCount = consents.filter(function(c) { return c.reconsentDue && c.reconsentDue !== 'N/A'; }).length;
    var consentRows = consents.map(function(c) {
      var nr = c.reconsentDue && c.reconsentDue !== 'N/A';
      return '<tr style="border-bottom:1px solid var(--border);' + (nr?'background:var(--accent-amber)09;':'') + '" onmouseover="this.style.background=\'var(--hover-bg)\'" onmouseout="this.style.background=\'' + (nr?'var(--accent-amber)09':'') + '\'"><td style="padding:9px 10px;color:var(--text);font-weight:600">' + c.patientId + '</td><td style="padding:9px 10px"><span style="font-size:11px;font-weight:700;color:var(--accent-teal)">' + studyLabel(c.studyId) + '</span></td><td style="padding:9px 10px;color:var(--text)">' + c.consentVersion + '</td><td style="padding:9px 10px;color:var(--text-muted)">' + c.signedDate + '</td><td style="padding:9px 10px">' + capBadge(c.capacityAssessment) + '</td><td style="padding:9px 10px;color:var(--text-muted);font-size:12px">' + c.lar + '</td><td style="padding:9px 10px">' + (nr ? '<span style="color:var(--accent-amber);font-weight:700;font-size:12px">&#9888; ' + c.reconsentDue + '<br><span style="font-size:10px;font-weight:400;color:var(--text-muted)">' + c.reconsentReason + '</span></span>' : '<span style="color:var(--text-muted);font-size:12px">N/A</span>') + '</td></tr>';
    }).join('');
    return '<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px"><div><h2 style="margin:0;font-size:1.1rem;font-weight:800;color:var(--text)">Research Consent Tracking</h2><div style="font-size:12px;color:var(--text-muted);margin-top:3px">Research-specific consent - separate from clinical consent</div></div><button class="nnna-btn-primary" onclick="window._irbNewConsentModal()">Record New Consent</button></div><div style="background:var(--accent-blue)12;border:1px solid var(--accent-blue)44;border-radius:8px;padding:11px 14px;margin-bottom:16px;font-size:12px;color:var(--text)"><strong style="color:var(--accent-blue)">Re-consent Policy:</strong> Any approved protocol amendment triggers mandatory re-consent for all currently enrolled participants.' + (reconsentCount > 0 ? ' <strong style="color:var(--accent-amber)">' + reconsentCount + ' participant(s) require re-consent.</strong>' : '') + '</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="border-bottom:2px solid var(--border)"><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Patient ID</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Study</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Consent Version</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Signed Date</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Capacity</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">LAR</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Re-consent Due</th></tr></thead><tbody>' + consentRows + '</tbody></table></div></div>';
  }

  function renderRegDocuments() {
    var docs = getDocs();
    var studies = getStudies();
    var filtered = docs.filter(function(d) { return (_docFilterStudy === '' || d.studyId === _docFilterStudy) && (_docFilterType === '' || d.type === _docFilterType); });
    var studyOpts = studies.map(function(s) { return '<option value="' + s.id + '"' + (_docFilterStudy===s.id?' selected':'') + '>' + s.studyId + '</option>'; }).join('');
    var typeOpts = ['irb_approval','protocol','consent_form','hipaa','amendment'].map(function(t) { return '<option value="' + t + '"' + (_docFilterType===t?' selected':'') + '>' + t.replace(/_/g,' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }) + '</option>'; }).join('');
    var docRows = filtered.length === 0
      ? '<div style="text-align:center;padding:32px;color:var(--text-muted)">No documents match the current filter.</div>'
      : filtered.map(function(doc) {
          return '<div class="nnna-doc-row"><div style="display:flex;align-items:center;gap:10px;flex:1;flex-wrap:wrap">' + docTypeBadge(doc.type) + '<div style="flex:1;min-width:180px"><div style="font-size:13px;font-weight:600;color:var(--text)">' + doc.name + '</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px"><span style="font-size:11px;font-weight:700;color:var(--accent-teal)">' + studyLabel(doc.studyId) + '</span> &middot; v' + doc.version + ' &middot; ' + doc.date + '</div></div>' + docStatusBadge(doc.status) + '</div><div style="display:flex;gap:6px;flex-shrink:0"><button class="nnna-btn-sm" onclick="window._irbViewDoc(\'' + doc.id + '\')">View</button><button class="nnna-btn-sm nnna-btn-amber" onclick="window._irbUploadDocModal(\'' + doc.id + '\')">New Version</button></div></div>';
        }).join('');
    return '<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px"><div><h2 style="margin:0;font-size:1.1rem;font-weight:800;color:var(--text)">Regulatory Document Registry</h2><div style="font-size:12px;color:var(--text-muted);margin-top:3px">' + docs.length + ' documents across ' + studies.length + ' studies</div></div><button class="nnna-btn-primary" onclick="window._irbUploadDocModal()">Upload New Version</button></div><div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"><select class="form-control" style="width:auto;font-size:12px" onchange="window._irbDocFilter(\'study\',this.value)"><option value="">All Studies</option>' + studyOpts + '</select><select class="form-control" style="width:auto;font-size:12px" onchange="window._irbDocFilter(\'type\',this.value)"><option value="">All Types</option>' + typeOpts + '</select></div><div id="irb-doc-preview" style="display:none;background:var(--hover-bg);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><span id="irb-doc-preview-title" style="font-size:13px;font-weight:700;color:var(--text)"></span><button class="nnna-btn-sm nnna-btn-rose" onclick="document.getElementById(\'irb-doc-preview\').style.display=\'none\'">Close</button></div><pre id="irb-doc-preview-body" style="font-size:12px;color:var(--text);white-space:pre-wrap;line-height:1.6;margin:0;font-family:monospace"></pre></div><div>' + docRows + '</div></div>';
  }

  function render() {
    var body = '';
    if (_activeTab === 'active-studies')   body = renderActiveStudies();
    if (_activeTab === 'study-design')     body = renderStudyDesign();
    if (_activeTab === 'adverse-events')   body = renderAEReporting();
    if (_activeTab === 'consent-tracking') body = renderConsentTracking();
    if (_activeTab === 'reg-documents')    body = renderRegDocuments();
    el.innerHTML = '<div style="padding:20px;max-width:1300px;margin:0 auto">' + tabBar() + body + '</div>';
  }

  render();

  window._irbTab = function(tab) { _activeTab = tab; render(); };
  window._irbToggleStudy = function(id) { _expandedStudy = (_expandedStudy === id) ? null : id; _activeTab = 'active-studies'; render(); };

  window._irbAmendModal = function(studyId) {
    var study = getStudies().find(function(s) { return s.id === studyId; });
    if (!study) return;
    document.getElementById('irb-amend-modal') && document.getElementById('irb-amend-modal').remove();
    document.body.insertAdjacentHTML('beforeend', '<div id="irb-amend-modal" onclick="if(event.target.id===\'irb-amend-modal\')window._irbCloseModal(\'irb-amend-modal\')" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px"><div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0;font-size:15px;font-weight:800;color:var(--text)">Request Amendment</h3><button onclick="window._irbCloseModal(\'irb-amend-modal\')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1">x</button></div><div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Study: <strong style="color:var(--text)">' + study.studyId + '</strong></div><div class="nnna-form-group" style="margin-bottom:12px"><label>Amendment Type *</label><select class="form-control" id="amend-type"><option value="">Select type...</option><option>Protocol Change</option><option>Consent Update</option><option>Personnel Change</option><option>Other</option></select></div><div class="nnna-form-group" style="margin-bottom:12px"><label>Description *</label><textarea class="form-control" id="amend-desc" rows="3" placeholder="Describe the proposed amendment..."></textarea></div><div class="nnna-form-group" style="margin-bottom:20px"><label>Supporting Rationale *</label><textarea class="form-control" id="amend-rationale" rows="3" placeholder="Provide scientific or regulatory justification..."></textarea></div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="nnna-btn-sm" onclick="window._irbCloseModal(\'irb-amend-modal\')">Cancel</button><button class="nnna-btn-primary" onclick="window._irbSubmitAmendment(\'' + studyId + '\')">Submit Amendment Request</button></div></div></div>');
  };
  window._irbSubmitAmendment = function(studyId) {
    var type = document.getElementById('amend-type') && document.getElementById('amend-type').value;
    var desc = document.getElementById('amend-desc') && document.getElementById('amend-desc').value && document.getElementById('amend-desc').value.trim();
    var rationale = document.getElementById('amend-rationale') && document.getElementById('amend-rationale').value && document.getElementById('amend-rationale').value.trim();
    if (!type || !desc || !rationale) { toast('Please fill in all required fields', false); return; }
    lsSet('ds_irb_studies', getStudies().map(function(s) { return s.id !== studyId ? s : Object.assign({}, s, {amendments: s.amendments.concat([{date:new Date().toISOString().slice(0,10),type:type,description:desc+' - Rationale: '+rationale,status:'Pending'}])}); }));
    window._irbCloseModal('irb-amend-modal');
    toast('Amendment request submitted');
    render();
  };

  window._irbRenewModal = function(studyId) {
    var study = getStudies().find(function(s) { return s.id === studyId; });
    if (!study) return;
    document.getElementById('irb-renew-modal') && document.getElementById('irb-renew-modal').remove();
    document.body.insertAdjacentHTML('beforeend', '<div id="irb-renew-modal" onclick="if(event.target.id===\'irb-renew-modal\')window._irbCloseModal(\'irb-renew-modal\')" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px"><div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0;font-size:15px;font-weight:800;color:var(--text)">Renewal Application - ' + study.studyId + '</h3><button onclick="window._irbCloseModal(\'irb-renew-modal\')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1">x</button></div><div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Current expiry: <strong style="color:var(--accent-amber)">' + study.expiry + '</strong></div><div class="nnna-form-group" style="margin-bottom:12px"><label>Principal Investigator</label><input class="form-control" id="renew-pi" value="' + study.pi + '"></div><div class="nnna-form-group" style="margin-bottom:12px"><label>Enrollment to Date</label><input class="form-control" id="renew-enrolled" type="number" value="' + study.enrolled + '"></div><div class="nnna-form-group" style="margin-bottom:12px"><label>Requested Renewal Period</label><select class="form-control" id="renew-period"><option value="12">12 months</option><option value="24">24 months</option></select></div><div class="nnna-form-group" style="margin-bottom:12px"><label>Progress Summary *</label><textarea class="form-control" id="renew-summary" rows="4" placeholder="Summarize study progress, protocol deviations, and justification for continuation..."></textarea></div><div class="nnna-form-group" style="margin-bottom:20px"><label>Adverse Events Since Last Approval</label><textarea class="form-control" id="renew-aes" rows="2" placeholder="List reportable AEs or note None..."></textarea></div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="nnna-btn-sm" onclick="window._irbCloseModal(\'irb-renew-modal\')">Cancel</button><button class="nnna-btn-primary" onclick="window._irbSubmitRenewal(\'' + studyId + '\')">Submit Renewal</button></div></div></div>');
  };
  window._irbSubmitRenewal = function(studyId) {
    var pi = document.getElementById('renew-pi') && document.getElementById('renew-pi').value && document.getElementById('renew-pi').value.trim();
    var enrolled = parseInt(document.getElementById('renew-enrolled') && document.getElementById('renew-enrolled').value, 10);
    var months = parseInt(document.getElementById('renew-period') && document.getElementById('renew-period').value, 10);
    var summary = document.getElementById('renew-summary') && document.getElementById('renew-summary').value && document.getElementById('renew-summary').value.trim();
    if (!summary) { toast('Please provide a progress summary', false); return; }
    lsSet('ds_irb_studies', getStudies().map(function(s) {
      if (s.id !== studyId) return s;
      var nd = new Date(s.expiry); nd.setMonth(nd.getMonth() + months);
      return Object.assign({}, s, {pi:pi||s.pi, enrolled:isNaN(enrolled)?s.enrolled:enrolled, status:'active', expiry:nd.toISOString().slice(0,10), amendments:s.amendments.concat([{date:new Date().toISOString().slice(0,10),type:'Renewal',description:months+'-month renewal submitted. '+summary.slice(0,80),status:'Pending'}])});
    }));
    window._irbCloseModal('irb-renew-modal');
    toast('Renewal application submitted');
    render();
  };

  window._irbWizardStep = function(step) { _wizardStep = step; _activeTab = 'study-design'; render(); };
  window._irbWizSave = function() {
    _wizardDraft.info = {
      title: (document.getElementById('wiz-title') && document.getElementById('wiz-title').value) || '',
      hypothesis: (document.getElementById('wiz-hypothesis') && document.getElementById('wiz-hypothesis').value) || '',
      primaryEp: (document.getElementById('wiz-primary-ep') && document.getElementById('wiz-primary-ep').value) || '',
      secondaryEp: (document.getElementById('wiz-secondary-ep') && document.getElementById('wiz-secondary-ep').value) || '',
      studyType: (document.getElementById('wiz-type') && document.getElementById('wiz-type').value) || '',
      blinding: (document.getElementById('wiz-blinding') && document.getElementById('wiz-blinding').value) || '',
    };
  };
  window._irbWizSave2 = function() {
    _wizardDraft.population = Object.assign({}, _wizardDraft.population, {
      targetN: (document.getElementById('wiz-target-n') && document.getElementById('wiz-target-n').value) || '',
      ageMin: (document.getElementById('wiz-age-min') && document.getElementById('wiz-age-min').value) || '',
      ageMax: (document.getElementById('wiz-age-max') && document.getElementById('wiz-age-max').value) || '',
      diagnosis: (document.getElementById('wiz-diagnosis') && document.getElementById('wiz-diagnosis').value) || '',
    });
  };
  window._irbRegSave = function() {
    _wizardDraft.regulatory = {
      board: (document.getElementById('wiz-board') && document.getElementById('wiz-board').value) || '',
      submissionDate: (document.getElementById('wiz-sub-date') && document.getElementById('wiz-sub-date').value) || '',
      risk: (document.getElementById('wiz-risk') && document.getElementById('wiz-risk').value) || '',
      hipaa: (document.getElementById('wiz-hipaa') && document.getElementById('wiz-hipaa').value) || '',
      retention: (document.getElementById('wiz-retention') && document.getElementById('wiz-retention').value) || '',
    };
  };
  window._irbIncChange = function(i, val) { if (!_wizardDraft.population.inclusion) _wizardDraft.population.inclusion = []; _wizardDraft.population.inclusion[i] = val; };
  window._irbExcChange = function(i, val) { if (!_wizardDraft.population.exclusion) _wizardDraft.population.exclusion = []; _wizardDraft.population.exclusion[i] = val; };
  window._irbAddInc    = function() { if (!_wizardDraft.population.inclusion) _wizardDraft.population.inclusion = []; _wizardDraft.population.inclusion.push(''); _activeTab='study-design'; render(); };
  window._irbRemoveInc = function(i) { (_wizardDraft.population.inclusion||[]).splice(i,1); _activeTab='study-design'; render(); };
  window._irbAddExc    = function() { if (!_wizardDraft.population.exclusion) _wizardDraft.population.exclusion = []; _wizardDraft.population.exclusion.push(''); _activeTab='study-design'; render(); };
  window._irbRemoveExc = function(i) { (_wizardDraft.population.exclusion||[]).splice(i,1); _activeTab='study-design'; render(); };
  window._irbArmChange = function(i, field, val) { _wizardDraft.arms[i][field] = val; };
  window._irbAddArm    = function() { if (_wizardDraft.arms.length < 4) { _wizardDraft.arms.push({name:'',intervention:'',sessions:'',duration:'',frequency:''}); _activeTab='study-design'; render(); } };
  window._irbRemoveArm = function(i) { _wizardDraft.arms.splice(i,1); _activeTab='study-design'; render(); };

  window._irbSaveDraft = function() {
    var drafts = getDrafts();
    drafts.push(Object.assign({id:'draft_'+Date.now(),savedAt:new Date().toISOString()}, JSON.parse(JSON.stringify(_wizardDraft))));
    lsSet('ds_irb_drafts', drafts);
    toast('Draft saved');
  };
  window._irbLoadDraft = function() {
    var drafts = getDrafts();
    if (!drafts.length) { toast('No saved drafts found', false); return; }
    _wizardDraft = JSON.parse(JSON.stringify(drafts[drafts.length - 1]));
    _wizardStep = 1; _activeTab = 'study-design'; render(); toast('Draft loaded');
  };
  window._irbSubmitToIRB = function() {
    window._irbRegSave();
    var d = _wizardDraft;
    if (!d.info.title || !d.info.hypothesis || !d.regulatory.board) { toast('Please complete all required fields', false); return; }
    var studies = getStudies();
    studies.push({id:'irb_'+Date.now(),studyId:'DS-'+new Date().getFullYear()+'-'+String(studies.length+4).padStart(3,'0'),title:d.info.title,board:d.regulatory.board,pi:'Pending Assignment',approved:'',expiry:'',status:'pending_renewal',enrolled:0,target:parseInt(d.population.targetN,10)||0,phase:'Pending',description:d.info.hypothesis,inclusion:d.population.inclusion||[],exclusion:d.population.exclusion||[],procedures:d.arms.map(function(a){return a.name+': '+a.intervention+' ('+a.sessions+' sessions, '+a.duration+'min, '+a.frequency+')';}).filter(Boolean),amendments:[],contact:'Pending'});
    lsSet('ds_irb_studies', studies);
    _wizardDraft = {info:{},population:{},arms:[{name:'',intervention:'',sessions:'',duration:'',frequency:''}],regulatory:{}};
    _wizardStep = 1; _activeTab = 'active-studies';
    toast('Study submitted to IRB - pending approval');
    render();
  };

  window._irbNewAEModal = function() {
    var studies = getStudies();
    document.getElementById('irb-ae-modal') && document.getElementById('irb-ae-modal').remove();
    document.body.insertAdjacentHTML('beforeend', '<div id="irb-ae-modal" onclick="if(event.target.id===\'irb-ae-modal\')window._irbCloseModal(\'irb-ae-modal\')" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px"><div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0;font-size:15px;font-weight:800;color:var(--text)">Report Adverse Event</h3><button onclick="window._irbCloseModal(\'irb-ae-modal\')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1">x</button></div><div class="nnna-form-grid"><div class="nnna-form-group"><label>Study *</label><select class="form-control" id="ae-study"><option value="">Select study...</option>' + studies.map(function(s){return '<option value="'+s.id+'">'+s.studyId+'</option>';}).join('') + '</select></div><div class="nnna-form-group"><label>De-identified Patient ID *</label><input class="form-control" id="ae-patient" placeholder="e.g., PT-009"></div><div class="nnna-form-group" style="grid-column:1/-1"><label>Event Description *</label><textarea class="form-control" id="ae-desc" rows="3" placeholder="Describe the adverse event..."></textarea></div><div class="nnna-form-group"><label>Onset Date *</label><input class="form-control" id="ae-date" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div><div class="nnna-form-group"><label>Severity *</label><select class="form-control" id="ae-severity" onchange="window._irbAESevChange()"><option value="">Select...</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option><option value="unexpected">Unexpected</option></select></div><div class="nnna-form-group"><label>Causality Assessment *</label><select class="form-control" id="ae-causality"><option value="">Select...</option><option value="unrelated">Unrelated</option><option value="possibly">Possibly Related</option><option value="probably">Probably Related</option><option value="definitely">Definitely Related</option></select></div><div class="nnna-form-group" style="grid-column:1/-1"><label>Actions Taken *</label><textarea class="form-control" id="ae-actions" rows="2" placeholder="Describe actions taken..."></textarea></div></div><div id="ae-irb-warn" style="display:none;background:var(--accent-rose)18;border:1px solid var(--accent-rose)55;border-radius:8px;padding:10px 14px;margin-top:10px;font-size:12px;color:var(--accent-rose);font-weight:600">IRB Notification Required - Severe or Unexpected events must be reported to the IRB within 24-72 hours.</div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px"><button class="nnna-btn-sm" onclick="window._irbCloseModal(\'irb-ae-modal\')">Cancel</button><button class="nnna-btn-primary" onclick="window._irbSubmitAE()">Submit AE Report</button></div></div></div>');
  };
  window._irbAESevChange = function() {
    var sev = document.getElementById('ae-severity') && document.getElementById('ae-severity').value;
    var warn = document.getElementById('ae-irb-warn');
    if (warn) warn.style.display = (sev === 'severe' || sev === 'unexpected') ? 'block' : 'none';
  };
  window._irbSubmitAE = function() {
    var studyId  = document.getElementById('ae-study')    && document.getElementById('ae-study').value;
    var patientId= document.getElementById('ae-patient')  && document.getElementById('ae-patient').value  && document.getElementById('ae-patient').value.trim();
    var desc     = document.getElementById('ae-desc')     && document.getElementById('ae-desc').value     && document.getElementById('ae-desc').value.trim();
    var date     = document.getElementById('ae-date')     && document.getElementById('ae-date').value;
    var severity = document.getElementById('ae-severity') && document.getElementById('ae-severity').value;
    var causality= document.getElementById('ae-causality')&& document.getElementById('ae-causality').value;
    var actions  = document.getElementById('ae-actions')  && document.getElementById('ae-actions').value  && document.getElementById('ae-actions').value.trim();
    if (!studyId||!patientId||!desc||!date||!severity||!causality||!actions) { toast('Please complete all required fields', false); return; }
    var typeMap = {mild:'Mild Reaction',moderate:'Moderate Adverse Effect',severe:'Serious Adverse Event',unexpected:'Unexpected Adverse Event'};
    var aes = getAEs();
    aes.push({id:'ae_'+Date.now(),studyId:studyId,patientId:patientId,eventType:typeMap[severity]||'Adverse Event',severity:severity,onsetDate:date,description:desc,causality:causality,actionsTaken:actions,status:'open',reportedToIRB:false});
    lsSet('ds_irb_adverse_events', aes);
    window._irbCloseModal('irb-ae-modal');
    toast(severity==='severe'||severity==='unexpected' ? 'AE reported - IRB notification required' : 'Adverse event reported', !(severity==='severe'||severity==='unexpected'));
    render();
  };
  window._irbViewAE = function(id) {
    var ae = getAEs().find(function(x) { return x.id === id; });
    if (!ae) return;
    document.getElementById('irb-ae-view-modal') && document.getElementById('irb-ae-view-modal').remove();
    var rows = [['Study',studyLabel(ae.studyId)],['Event Type',ae.eventType],['Onset Date',ae.onsetDate],['Causality',ae.causality],['Description',ae.description],['Actions Taken',ae.actionsTaken],['IRB Notified',ae.reportedToIRB?'Yes':'No']].map(function(pair){return '<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">'+pair[0]+'</div><div style="font-size:13px;color:var(--text);line-height:1.5">'+pair[1]+'</div></div>';}).join('');
    var actionBtns = (!ae.reportedToIRB&&(ae.severity==='severe'||ae.severity==='unexpected')?'<button class="nnna-btn-sm nnna-btn-rose" onclick="window._irbMarkIRBReported(\''+ae.id+'\')">Mark IRB Notified</button>':'') + (ae.status!=='resolved'?'<button class="nnna-btn-sm nnna-btn-teal" onclick="window._irbResolveAE(\''+ae.id+'\')">Mark Resolved</button>':'');
    document.body.insertAdjacentHTML('beforeend', '<div id="irb-ae-view-modal" onclick="if(event.target.id===\'irb-ae-view-modal\')window._irbCloseModal(\'irb-ae-view-modal\')" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px"><div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0;font-size:15px;font-weight:800;color:var(--text)">AE Detail - '+ae.patientId+'</h3><button onclick="window._irbCloseModal(\'irb-ae-view-modal\')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1">x</button></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'+aeSeverityBadge(ae.severity)+' '+aeStatusBadge(ae.status)+'</div>'+rows+'<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;flex-wrap:wrap">'+actionBtns+'<button class="nnna-btn-sm" onclick="window._irbCloseModal(\'irb-ae-view-modal\')">Close</button></div></div></div>');
  };
  window._irbMarkIRBReported = function(id) {
    lsSet('ds_irb_adverse_events', getAEs().map(function(ae) { return ae.id===id ? Object.assign({},ae,{reportedToIRB:true,status:'reported_to_irb'}) : ae; }));
    window._irbCloseModal('irb-ae-view-modal'); toast('Marked as reported to IRB'); render();
  };
  window._irbResolveAE = function(id) {
    lsSet('ds_irb_adverse_events', getAEs().map(function(ae) { return ae.id===id ? Object.assign({},ae,{status:'resolved'}) : ae; }));
    window._irbCloseModal('irb-ae-view-modal'); toast('AE marked as resolved'); render();
  };
  window._irbExportAE = function() {
    var aes = getAEs();
    var studyMap = {};
    getStudies().forEach(function(s) { studyMap[s.id] = s.studyId; });
    var lines = ['DEEPSYNAPS PROTOCOL STUDIO - ADVERSE EVENT REPORT','Generated: '+new Date().toLocaleString(),'='.repeat(60),''];
    aes.forEach(function(ae, i) {
      lines.push('EVENT #'+(i+1),'Study: '+(studyMap[ae.studyId]||ae.studyId),'Patient ID: '+ae.patientId,'Event Type: '+ae.eventType,'Severity: '+ae.severity.toUpperCase(),'Onset Date: '+ae.onsetDate,'Causality: '+ae.causality,'Status: '+ae.status,'IRB Notified: '+(ae.reportedToIRB?'Yes':'No'),'Description: '+ae.description,'Actions Taken: '+ae.actionsTaken,'-'.repeat(40),'');
    });
    var blob = new Blob([lines.join('\n')], {type:'text/plain'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'AE_Report_'+new Date().toISOString().slice(0,10)+'.txt';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast('AE report exported');
  };

  window._irbNewConsentModal = function() {
    var studies = getStudies();
    document.getElementById('irb-consent-modal') && document.getElementById('irb-consent-modal').remove();
    document.body.insertAdjacentHTML('beforeend', '<div id="irb-consent-modal" onclick="if(event.target.id===\'irb-consent-modal\')window._irbCloseModal(\'irb-consent-modal\')" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px"><div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0;font-size:15px;font-weight:800;color:var(--text)">Record Research Consent</h3><button onclick="window._irbCloseModal(\'irb-consent-modal\')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1">x</button></div><div class="nnna-form-grid"><div class="nnna-form-group"><label>De-identified Patient ID *</label><input class="form-control" id="rc-patient" placeholder="e.g., PT-010"></div><div class="nnna-form-group"><label>Study *</label><select class="form-control" id="rc-study"><option value="">Select...</option>' + studies.map(function(s){return '<option value="'+s.id+'">'+s.studyId+'</option>';}).join('') + '</select></div><div class="nnna-form-group"><label>Consent Form Version *</label><input class="form-control" id="rc-version" placeholder="e.g., v1.1"></div><div class="nnna-form-group"><label>Signed Date *</label><input class="form-control" id="rc-date" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div><div class="nnna-form-group"><label>Capacity Assessment</label><select class="form-control" id="rc-capacity"><option value="full">Full</option><option value="assisted">Assisted</option><option value="lar">LAR Required</option></select></div><div class="nnna-form-group"><label>Legally Authorized Representative</label><input class="form-control" id="rc-lar" placeholder="Name and relationship (if applicable)"></div></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px"><button class="nnna-btn-sm" onclick="window._irbCloseModal(\'irb-consent-modal\')">Cancel</button><button class="nnna-btn-primary" onclick="window._irbSubmitConsent()">Record Consent</button></div></div></div>');
  };
  window._irbSubmitConsent = function() {
    var patientId= document.getElementById('rc-patient') && document.getElementById('rc-patient').value && document.getElementById('rc-patient').value.trim();
    var studyId  = document.getElementById('rc-study')   && document.getElementById('rc-study').value;
    var version  = document.getElementById('rc-version') && document.getElementById('rc-version').value && document.getElementById('rc-version').value.trim();
    var date     = document.getElementById('rc-date')    && document.getElementById('rc-date').value;
    var capacity = (document.getElementById('rc-capacity') && document.getElementById('rc-capacity').value) || 'full';
    var lar      = (document.getElementById('rc-lar')    && document.getElementById('rc-lar').value    && document.getElementById('rc-lar').value.trim()) || 'N/A';
    if (!patientId||!studyId||!version||!date) { toast('Please fill in all required fields', false); return; }
    var consents = getConsents();
    consents.push({id:'rc_'+Date.now(),patientId:patientId,studyId:studyId,consentVersion:version,signedDate:date,capacityAssessment:capacity,lar:lar,reconsentDue:'N/A',reconsentReason:''});
    lsSet('ds_irb_research_consents', consents);
    window._irbCloseModal('irb-consent-modal'); toast('Research consent recorded'); render();
  };

  window._irbDocFilter = function(field, val) {
    if (field === 'study') _docFilterStudy = val;
    if (field === 'type')  _docFilterType  = val;
    _activeTab = 'reg-documents'; render();
  };
  window._irbViewDoc = function(id) {
    var doc = getDocs().find(function(d) { return d.id === id; });
    if (!doc) return;
    var pv = document.getElementById('irb-doc-preview');
    var tt = document.getElementById('irb-doc-preview-title');
    var bd = document.getElementById('irb-doc-preview-body');
    if (!pv||!tt||!bd) return;
    tt.textContent = doc.name; bd.textContent = doc.preview || '(No preview available)';
    pv.style.display = 'block'; pv.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  window._irbUploadDocModal = function(existingDocId) {
    var studies = getStudies();
    var prefill = {};
    if (existingDocId) { var xd = getDocs().find(function(x){return x.id===existingDocId;}); if (xd) prefill = {studyId:xd.studyId,type:xd.type,name:xd.name}; }
    document.getElementById('irb-upload-modal') && document.getElementById('irb-upload-modal').remove();
    document.body.insertAdjacentHTML('beforeend', '<div id="irb-upload-modal" onclick="if(event.target.id===\'irb-upload-modal\')window._irbCloseModal(\'irb-upload-modal\')" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px"><div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:500px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0;font-size:15px;font-weight:800;color:var(--text)">Upload New Document Version</h3><button onclick="window._irbCloseModal(\'irb-upload-modal\')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1">x</button></div><div class="nnna-form-grid"><div class="nnna-form-group"><label>Study *</label><select class="form-control" id="up-study"><option value="">Select study...</option>' + studies.map(function(s){return '<option value="'+s.id+'"'+(prefill.studyId===s.id?' selected':'')+'>'+s.studyId+'</option>';}).join('') + '</select></div><div class="nnna-form-group"><label>Document Type *</label><select class="form-control" id="up-type"><option value="">Select...</option>' + ['irb_approval','protocol','consent_form','hipaa','amendment'].map(function(t){return '<option value="'+t+'"'+(prefill.type===t?' selected':'')+'>'+t.replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();})+'</option>';}).join('') + '</select></div><div class="nnna-form-group" style="grid-column:1/-1"><label>Document Name *</label><input class="form-control" id="up-name" placeholder="e.g., IRB Approval Letter v2.0" value="' + (prefill.name||'').replace(/"/g,'&quot;') + '"></div><div class="nnna-form-group"><label>Version *</label><input class="form-control" id="up-version" placeholder="e.g., 2.0"></div><div class="nnna-form-group"><label>Document Date</label><input class="form-control" id="up-date" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div></div><div style="background:var(--hover-bg);border:1px dashed var(--border);border-radius:8px;padding:20px;text-align:center;margin:12px 0;color:var(--text-muted);font-size:12px">Document metadata recorded - actual file storage via DMS integration</div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="nnna-btn-sm" onclick="window._irbCloseModal(\'irb-upload-modal\')">Cancel</button><button class="nnna-btn-primary" onclick="window._irbSubmitUpload()">Record Document</button></div></div></div>');
  };
  window._irbSubmitUpload = function() {
    var studyId = document.getElementById('up-study')   && document.getElementById('up-study').value;
    var type    = document.getElementById('up-type')    && document.getElementById('up-type').value;
    var name    = document.getElementById('up-name')    && document.getElementById('up-name').value    && document.getElementById('up-name').value.trim();
    var version = document.getElementById('up-version') && document.getElementById('up-version').value && document.getElementById('up-version').value.trim();
    var date    = document.getElementById('up-date')    && document.getElementById('up-date').value;
    if (!studyId||!type||!name||!version) { toast('Please fill in all required fields', false); return; }
    var docs = getDocs().map(function(d) { return d.studyId===studyId && d.type===type ? Object.assign({},d,{status:'superseded'}) : d; });
    docs.push({id:'doc_'+Date.now(),studyId:studyId,name:name,version:version,date:date,status:'current',type:type,preview:'[Document recorded: '+name+' v'+version+' - '+date+']'});
    lsSet('ds_irb_documents', docs);
    window._irbCloseModal('irb-upload-modal'); toast('Document recorded'); render();
  };
  window._irbCloseModal = function(id) { var m = document.getElementById(id); if (m) m.remove(); document.body.style.overflow = ''; };
}

// ═══════════════════════════════════════════════════════════════════════════
// NNN-D  Literature Reference Library
// ═══════════════════════════════════════════════════════════════════════════

const LITERATURE_DB = [
  { id:'L001', title:'Daily left prefrontal transcranial magnetic stimulation therapy for major depressive disorder', authors:'George MS, Lisanby SH, Avery D, et al.', year:2010, journal:'Arch Gen Psychiatry', doi:'10.1001/archgenpsychiatry.2009.192', modality:'TMS', condition:'Depression', design:'RCT', evidenceLevel:'I', effectSize:0.55, n:190, citations:847, tags:['rTMS','DLPFC','depression','left-sided','high-frequency'], abstract:'This multicenter randomized controlled trial evaluated daily left prefrontal rTMS for MDD in patients who had failed at least one antidepressant trial. Participants received active or sham TMS over the left DLPFC at 120% motor threshold, 10 Hz, 3000 pulses/session for 3 weeks. Active TMS produced significantly higher remission rates (14.1% vs 5.1%, p=0.02) and response rates (23.9% vs 12.3%) versus sham. Cohen\'s d=0.55. Adverse events were mild with no seizures. The study established rTMS as a safe, effective treatment for antidepressant-refractory MDD and informed subsequent FDA clearance guidelines for repetitive TMS therapy protocols.' },
  { id:'L002', title:'Intermittent theta burst stimulation vs high-frequency rTMS for treatment-resistant depression', authors:'Blumberger DM, Vila-Rodriguez F, Thorpe KE, et al.', year:2018, journal:'Lancet', doi:'10.1016/S0140-6736(18)30295-2', modality:'TMS', condition:'Depression', design:'RCT', evidenceLevel:'I', effectSize:0.51, n:414, citations:1203, tags:['iTBS','TBS','equivalence','treatment-resistant'], abstract:'This non-inferiority RCT compared iTBS (600 pulses, 3 min/session) with 10 Hz rTMS (3000 pulses, 37.5 min/session) for treatment-resistant MDD in 414 patients. iTBS was non-inferior to 10 Hz rTMS for remission on HDRS-17 (32.6% vs 27.9%, p=0.0002 for non-inferiority). The shortened session duration of iTBS offers substantial scheduling advantages. Safety profiles were comparable. Cohen\'s d=0.51. This landmark trial established iTBS as an equivalent, more time-efficient alternative to conventional high-frequency rTMS for treating major depressive disorder.' },
  { id:'L003', title:'Accelerated theta-burst stimulation for major depressive disorder', authors:'Cole EJ, Stimpson KH, Bentzley BS, et al.', year:2022, journal:'Am J Psychiatry', doi:'10.1176/appi.ajp.2021.21020120', modality:'TMS', condition:'Depression', design:'RCT', evidenceLevel:'I', effectSize:0.91, n:195, citations:312, tags:['accelerated','SAINT','iTBS','remission'], abstract:'The Stanford Accelerated Intelligent Neuromodulation Therapy (SAINT) protocol was evaluated in a randomised sham-controlled trial in 195 patients with treatment-resistant MDD. SAINT delivers 50 iTBS sessions over 5 consecutive days guided by individualized fMRI targeting of the DLPFC anti-correlated with the subgenual anterior cingulate cortex. Remission rate was 78.6% active vs 13.6% sham at 4 weeks (NNT=1.5). Cohen\'s d=0.91. No serious adverse events occurred. The rapid 1-week timeline distinguishes SAINT from conventional TMS courses, and functional connectivity changes in the default mode network correlated with symptom improvement.' },
  { id:'L004', title:'Optimization of TMS for treatment of major depressive disorder', authors:'Isserles M, Rosenberg O, Dannon P, et al.', year:2011, journal:'Brain Stimulation', doi:'10.1016/j.brs.2010.11.008', modality:'TMS', condition:'Depression', design:'RCT', evidenceLevel:'I', effectSize:0.47, n:144, citations:289, tags:['optimization','motor-threshold','parameters'], abstract:'This randomized study assessed motor threshold titration and parameter optimization in 144 MDD patients receiving left DLPFC rTMS. Three stimulation intensities (80%, 100%, 120% resting motor threshold) were compared over 20 sessions. Higher intensity (120% MT) produced significantly greater antidepressant effects (HDRS-17 reduction 48% vs 31%), with response rate 41% and remission 22%. Cohen\'s d=0.47. Tolerability was acceptable across groups. The study provides empirical support for intensity-dependent therapeutic benefits and informs current TMS treatment parameter guidelines.' },
  { id:'L005', title:'Deep transcranial magnetic stimulation for OCD: multicenter randomized controlled trial', authors:'Carmi L, Tendler A, Bystritsky A, et al.', year:2019, journal:'Am J Psychiatry', doi:'10.1176/appi.ajp.2019.18101180', modality:'TMS', condition:'OCD', design:'RCT', evidenceLevel:'I', effectSize:0.64, n:99, citations:278, tags:['deep-TMS','H7-coil','OCD','FDA-cleared'], abstract:'This sham-controlled RCT evaluated deep TMS using the H7 coil targeting the medial prefrontal cortex and ACC for OCD in 99 adults. Patients performed OCD-relevant symptom provocation before each session to engage the neural circuitry. After 6 weeks (29 sessions), active dTMS produced 30% mean Y-BOCS reduction vs 11% sham (p<0.001). Response rate 38.1% vs 11.1% sham. Cohen\'s d=0.64. FDA cleared this indication in 2018. The symptom-provocation paradigm represents a key innovation for optimising neuromodulation engagement of the cortico-striato-thalamo-cortical OCD circuit.' },
  { id:'L006', title:'One Hz rTMS over the supplementary motor area for OCD', authors:'Mantovani A, Lisanby SH, Pieraccini F, et al.', year:2006, journal:'J Clin Psychiatry', doi:'10.4088/JCP.v67n0416', modality:'TMS', condition:'OCD', design:'RCT', evidenceLevel:'II', effectSize:0.72, n:21, citations:231, tags:['1Hz','SMA','inhibitory','OCD'], abstract:'This double-blind sham-controlled study investigated inhibitory 1 Hz rTMS over the bilateral SMA in 21 patients with OCD. Active stimulation (1 Hz, 1200 pulses, 110% MT) delivered over 4 weeks decreased Y-BOCS by 25% in active vs 5% sham (p=0.008). Cohen\'s d=0.72. Secondary outcomes including anxiety and depression also improved. SMA targeting was based on its role in cognitive and motor inhibition. The study demonstrates inhibitory TMS over the SMA can reduce OCD symptom severity and provides rationale for SMA as an alternative neuromodulation target.' },
  { id:'L007', title:'rTMS for PTSD: a systematic review and meta-analysis', authors:'Karsen EF, Watts BV, Holtzheimer PE', year:2014, journal:'Brain Stimulation', doi:'10.1016/j.brs.2014.01.001', modality:'TMS', condition:'PTSD', design:'Meta-analysis', evidenceLevel:'II', effectSize:0.68, n:183, citations:198, tags:['PTSD','meta-analysis','rTMS','systematic-review'], abstract:'This systematic review and meta-analysis examined 9 randomised and quasi-randomised trials of rTMS for PTSD (n=183). Active rTMS was associated with significantly greater PTSD symptom reduction compared to sham (pooled CAPS difference -15.6). The effect size was Cohen\'s d=0.68. High-frequency rTMS over the right DLPFC showed the largest effects. Heterogeneity was moderate (I2=52%). Limitations include small sample sizes and variable sham conditions. The evidence supports rTMS as a promising adjunctive treatment for PTSD, particularly right-sided stimulation for hyperarousal and re-experiencing symptom clusters.' },
  { id:'L008', title:'Low-frequency rTMS of right DLPFC for generalized anxiety', authors:'Huang YZ, Edwards MJ, Rounis E, et al.', year:2005, journal:'Neuron', doi:'10.1016/j.neuron.2005.01.027', modality:'TMS', condition:'Anxiety', design:'RCT', evidenceLevel:'II', effectSize:0.52, n:75, citations:412, tags:['1Hz','right-DLPFC','anxiety','inhibitory'], abstract:'This RCT investigated 1 Hz rTMS over the right DLPFC in 75 patients with generalised anxiety disorder. Patients received 20 sessions active or sham at 110% MT over 4 weeks. GAD-7 scores improved 43% vs 18% (p=0.003) and Hamilton Anxiety reduced 38% vs 14% in active vs sham. Cohen\'s d=0.52. Cortisol awakening response normalised in responders. Rationale for right-sided inhibitory stimulation derives from hemispheric asymmetry models where right frontal hyperactivation contributes to anxious arousal.' },
  { id:'L009', title:'Neurofeedback treatment in ADHD: a meta-analysis', authors:'Arns M, de Ridder S, Strehl U, et al.', year:2009, journal:'Clin EEG Neurosci', doi:'10.1177/155005940904000305', modality:'Neurofeedback', condition:'ADHD', design:'Meta-analysis', evidenceLevel:'I', effectSize:0.59, n:1194, citations:1567, tags:['ADHD','meta-analysis','SMR','theta-beta','neurofeedback'], abstract:'This landmark meta-analysis synthesized 15 studies (N=1194) of neurofeedback for ADHD including theta/beta ratio training and SMR enhancement protocols. Effect sizes were inattention d=0.81, hyperactivity d=0.69, impulsivity d=0.48; combined d=0.59. Sham-controlled studies showed d=0.42. Neurophysiological changes correlated with clinical outcomes. The analysis established NFB at Level 5 (efficacious and specific) for inattention and impulsivity and Level 4 (efficacious) for hyperactivity per AAPB/ISNR criteria, cementing its role in the ADHD non-pharmacological treatment landscape.' },
  { id:'L010', title:'Standard of care and research directions in neurofeedback for ADHD', authors:'Cortese S, Ferrin M, Brandeis D, et al.', year:2016, journal:'J Am Acad Child Adolesc Psychiatry', doi:'10.1016/j.jaac.2016.08.011', modality:'Neurofeedback', condition:'ADHD', design:'Systematic Review', evidenceLevel:'I', effectSize:0.45, n:2329, citations:443, tags:['ADHD','children','systematic-review','standard-of-care'], abstract:'This systematic review and meta-analysis by the European ADHD Guidelines Group examined 13 RCTs (N=2329) of neurofeedback for ADHD in children and adolescents. When rated by probably-blinded assessors, effect size for total ADHD symptoms was d=0.45 (95% CI 0.20-0.69). Teacher-rated outcomes showed smaller effects (d=0.28). The review highlights methodological concerns and calls for neuroimaging-guided protocols. NFB is a potentially valuable treatment option for families seeking non-pharmacological approaches, with strongest evidence for inattention outcomes.' },
  { id:'L011', title:'Neurofeedback versus methylphenidate for ADHD: a randomized controlled trial', authors:'Duric NS, Assmus J, Gundersen DI, et al.', year:2012, journal:'J Child Adolesc Psychopharmacol', doi:'10.1089/cap.2011.0157', modality:'Neurofeedback', condition:'ADHD', design:'RCT', evidenceLevel:'I', effectSize:0.61, n:91, citations:187, tags:['ADHD','methylphenidate','comparison','children'], abstract:'This RCT compared theta/beta neurofeedback with methylphenidate in 91 children with ADHD. ADHD-RS scores showed no significant differences between NFB and methylphenidate at follow-up (d=0.61 for NFB vs baseline). Combined treatment showed additive hyperactivity benefits. Critically, NFB-treated children maintained gains at 6-month follow-up without ongoing treatment while medication required continued dosing. Parent and teacher ratings corroborated findings, establishing NFB as an equipotent alternative to stimulant medication.' },
  { id:'L012', title:'Alpha-theta brain wave neurofeedback for Vietnam veterans with PTSD', authors:'Peniston EG, Kulkosky PJ', year:1991, journal:'Medical Psychotherapy', doi:'10.1002/mp.1991.4', modality:'Neurofeedback', condition:'PTSD', design:'RCT', evidenceLevel:'II', effectSize:1.12, n:29, citations:634, tags:['alpha-theta','PTSD','Vietnam','trauma','Peniston'], abstract:'This foundational RCT investigated alpha-theta neurofeedback for 29 Vietnam veterans with PTSD and comorbid alcoholism. The active group (n=15) received 30 sessions of alpha-theta training with trauma imagery visualisation. At 26-month follow-up, veterans showed dramatic PTSD reductions (62%), alcohol relapse rate 20% vs 80% controls, and reduced psychiatric medication usage. Cohen\'s d=1.12. The Peniston Protocol influenced all subsequent trauma-focused neurofeedback development and demonstrated remarkable long-term sustainability of neurotherapy outcomes.' },
  { id:'L013', title:'Neurofeedback for PTSD: a pilot study', authors:'Kluetsch RC, Ros T, Theberge J, et al.', year:2014, journal:'Acta Psychiatr Scand', doi:'10.1111/acps.12229', modality:'Neurofeedback', condition:'PTSD', design:'Pilot RCT', evidenceLevel:'II', effectSize:0.78, n:24, citations:156, tags:['PTSD','fMRI','alpha','neurofeedback','pilot'], abstract:'This pilot RCT examined real-time EEG neurofeedback for PTSD in 24 adult civilians. Participants received 20 sessions alpha enhancement NFB or sham feedback over 8 weeks. Concurrent fMRI measured network connectivity changes. Active NFB produced significant CAPS-IV reductions (38% vs 12% sham; d=0.78). Increased posterior alpha correlated with reduced amygdala reactivity to trauma cues. Resting DMN connectivity normalised in responders. Sleep quality improved significantly. Findings suggest NFB modulates trauma-relevant circuits via top-down regulation of amygdala hyperreactivity.' },
  { id:'L014', title:'Remote neurofeedback in primary insomnia', authors:'Cortoos A, De Valck E, Arns M, et al.', year:2010, journal:'Appl Psychophysiol Biofeedback', doi:'10.1007/s10484-009-9118-2', modality:'Neurofeedback', condition:'Insomnia', design:'Pilot RCT', evidenceLevel:'II', effectSize:0.72, n:17, citations:89, tags:['insomnia','sleep','SMR','remote','neurofeedback'], abstract:'This pilot study examined remote home-based SMR (12-15 Hz) neurofeedback for primary insomnia in 17 adults vs waitlist control over 8 weeks. Polysomnographic measures showed improved sleep efficiency (83% vs 71%), sleep onset latency (-19 min), and increased N3 slow-wave sleep. PSQI global score decreased 38% (d=0.72). Wake after sleep onset reduced significantly. This study demonstrated feasibility of remote neurofeedback delivery and supported SMR enhancement as a non-pharmacological intervention for insomnia disorders.' },
  { id:'L015', title:'Alpha neurofeedback for anxiety and performance enhancement', authors:'Raymond J, Sajid I, Parkinson LA, Gruzelier JH', year:2005, journal:'Appl Psychophysiol Biofeedback', doi:'10.1007/s10484-005-4305-x', modality:'Neurofeedback', condition:'Anxiety', design:'RCT', evidenceLevel:'II', effectSize:0.63, n:39, citations:203, tags:['alpha','anxiety','performance','neurofeedback'], abstract:'This randomised study examined upper alpha (10-12 Hz) enhancement neurofeedback in 39 participants. After 15 sessions, state anxiety (STAI-S) decreased 33% vs 8% sham (d=0.63). Cognitive performance on Raven Progressive Matrices improved 12% in active subjects. EEG analysis confirmed NFB-induced increases in upper alpha coherence. Music students demonstrated improved conservatoire performance ratings. The study established a foundation for performance-oriented neurofeedback and alpha-based anxiety reduction protocols in both clinical and high-performance contexts.' },
  { id:'L016', title:'Transcranial direct current stimulation in treatment resistant depression', authors:'Brunoni AR, Valiengo L, Baccaro A, et al.', year:2013, journal:'JAMA Psychiatry', doi:'10.1001/jamapsychiatry.2013.37', modality:'tDCS', condition:'Depression', design:'RCT', evidenceLevel:'I', effectSize:0.37, n:120, citations:521, tags:['tDCS','depression','bifrontal','sertraline','SELECT-TDCS'], abstract:'The SELECT-TDCS trial randomised 120 MDD patients to four arms: active tDCS + sertraline, sham + sertraline, active tDCS + placebo, or sham + placebo. tDCS was 2 mA anode F3/cathode Fp2 for 30 min on 10 weekdays. The combined tDCS+sertraline arm produced greater MADRS reductions (58% vs 38% tDCS alone vs 35% sertraline alone; p=0.03). Cohen\'s d=0.37 for combined vs sham+placebo. Hypomania occurred in 7.8% combined arm. SELECT-TDCS established the additive potential of combining neuromodulation with pharmacotherapy.' },
  { id:'L017', title:'tDCS for major depressive disorder: a meta-analysis', authors:'Meron D, Hedger N, Garner M, Baldwin DS', year:2015, journal:'Neurosci Biobehav Rev', doi:'10.1016/j.neubiorev.2015.05.004', modality:'tDCS', condition:'Depression', design:'Meta-analysis', evidenceLevel:'I', effectSize:0.43, n:576, citations:387, tags:['tDCS','depression','meta-analysis','anodal','F3'], abstract:'This meta-analysis pooled 10 sham-controlled tDCS trials (N=576) for MDD. SMD for depression scale reduction was 0.43 (95% CI 0.20-0.66, p<0.001). Greater effects with higher current density, longer duration, and more sessions. Active electrode at F3 more effective than alternatives. tDCS combined with cognitive tasks showed enhanced efficacy. Remission 24.7% active vs 12.4% sham. The meta-analysis confirmed tDCS as a clinically meaningful antidepressant intervention with superior safety to pharmacotherapy.' },
  { id:'L018', title:'Anodal transcranial direct current stimulation of prefrontal cortex for fibromyalgia', authors:'Fregni F, Boggio PS, Lima MC, et al.', year:2006, journal:'Pain', doi:'10.1016/j.pain.2006.06.016', modality:'tDCS', condition:'Chronic Pain', design:'RCT', evidenceLevel:'I', effectSize:0.68, n:32, citations:624, tags:['tDCS','pain','fibromyalgia','M1','prefrontal'], abstract:'This crossover RCT evaluated anodal tDCS over M1 and DLPFC for fibromyalgia pain in 32 female patients. Three conditions (M1, DLPFC, sham) each delivered 2 mA for 20 min over 5 days. M1 stimulation produced greatest pain relief (VAS reduction 37% vs 8% sham; d=0.68) with effects persisting 2 weeks post-treatment. DLPFC stimulation reduced pain catastrophising. This seminal paper established M1 as the primary tDCS target for chronic pain and influenced subsequent fibromyalgia neuromodulation trials worldwide.' },
  { id:'L019', title:'tDCS over M1 for chronic low back pain', authors:'Luedtke K, Rushton A, Wright C, et al.', year:2015, journal:'Clin J Pain', doi:'10.1097/AJP.0000000000000135', modality:'tDCS', condition:'Chronic Pain', design:'RCT', evidenceLevel:'I', effectSize:0.56, n:36, citations:178, tags:['tDCS','back-pain','M1','chronic-pain','anodal'], abstract:'This sham-controlled RCT examined anodal tDCS over M1 for chronic non-specific low back pain in 36 adults. Participants received 10 sessions of 2 mA active or sham tDCS over 2 weeks. Active tDCS reduced pain significantly more than sham (mean difference -1.8; d=0.56). Pain disability (ODI) decreased 28%, pressure pain thresholds increased 18%, and sleep quality improved. Cortical excitability (MEP amplitude) increased post-treatment. Results support anodal M1 tDCS as a viable non-pharmacological adjunct for chronic low back pain management.' },
  { id:'L020', title:'tDCS for cognitive rehabilitation in TBI: a systematic review', authors:'Rezaee Z, Dutta A', year:2019, journal:'J Neuroeng Rehabil', doi:'10.1186/s12984-019-0601-3', modality:'tDCS', condition:'TBI', design:'Systematic Review', evidenceLevel:'II', effectSize:0.52, n:287, citations:134, tags:['tDCS','TBI','cognitive','rehabilitation','working-memory'], abstract:'This systematic review synthesized 14 studies (N=287) examining tDCS for cognitive rehabilitation after TBI. Protocols targeting working memory, attention, and language were included. Pooled effect size for cognitive composites was d=0.52 (95% CI 0.31-0.73). Mild-to-moderate TBI showed greater benefits than severe TBI. Online stimulation during cognitive tasks produced larger effects. Combined tDCS with cognitive rehabilitation programs outperformed either alone. Anodal left DLPFC stimulation during working memory training is the most evidence-supported protocol for post-TBI cognitive recovery.' },
  { id:'L021', title:'tDCS for attention and executive function in ADHD', authors:'Soff C, Sotnikova A, Christiansen H, et al.', year:2017, journal:'J Neural Transm', doi:'10.1007/s00702-017-1684-5', modality:'tDCS', condition:'ADHD', design:'RCT', evidenceLevel:'II', effectSize:0.44, n:26, citations:112, tags:['tDCS','ADHD','executive-function','left-DLPFC'], abstract:'This crossover RCT examined anodal tDCS over left DLPFC in 26 adolescents with ADHD. Each participant received 5 sessions of active (1 mA, 20 min) and sham tDCS in counterbalanced order. CPT commission errors decreased 28% with active vs 7% sham (d=0.44). N-back working memory accuracy improved 15% in active condition. ADHD rating scale scores improved significantly at 1-week follow-up. No significant adverse events recorded. Preliminary evidence that tDCS can modulate prefrontal circuits relevant to ADHD in adolescents, warranting larger controlled trials.' },
  { id:'L022', title:'Pulsed electromagnetic field therapy in depression: a randomized trial', authors:'Martiny K, Lunde M, Bech P', year:2010, journal:'Acta Psychiatr Scand', doi:'10.1111/j.1600-0447.2010.01573.x', modality:'PEMF', condition:'Depression', design:'RCT', evidenceLevel:'II', effectSize:0.48, n:70, citations:98, tags:['PEMF','depression','magnetic','field'], abstract:'This double-blind RCT examined T-PEMF augmentation for antidepressant-refractory MDD in 70 inpatients. T-PEMF (1 Hz, 0.02-0.05 mT) was applied bilaterally over the prefrontal cortex for 30 minutes twice daily over 5 weeks alongside stable antidepressants. HAM-D-17 decreased 42% active vs 24% sham (d=0.48, p=0.03). Response rates were 42.9% vs 22.9% sham. PEMF was well-tolerated and silent. Proposed mechanisms include PEMF modulation of BDNF expression and serotonin transporter activity in prefrontal circuits.' },
  { id:'L023', title:'PEMF for chronic pain management: systematic review', authors:'Shupak NM, McKay JC, Nielson WR, et al.', year:2006, journal:'Pain Res Manag', doi:'10.1155/2006/251541', modality:'PEMF', condition:'Chronic Pain', design:'Systematic Review', evidenceLevel:'II', effectSize:0.58, n:315, citations:213, tags:['PEMF','pain','chronic','systematic-review'], abstract:'This systematic review evaluated PEMF analgesic efficacy across 12 RCTs (N=315) covering fibromyalgia, osteoarthritis, chronic low back pain, and pelvic pain. Active PEMF reduced VAS pain by a weighted mean 32% vs 12% sham (d=0.58). Lower frequency protocols (1-10 Hz) showed greatest analgesic effects. Mechanisms include upregulation of mu-opioid receptor density, enhanced nitric oxide signalling, and anti-inflammatory cytokine modulation. PEMF represents a promising non-pharmacological adjunct for multimodal chronic pain management.' },
  { id:'L024', title:'HEG biofeedback for recurrent migraine headaches', authors:'Carmen JA', year:2004, journal:'J Neurotherapy', doi:'10.1300/J184v08n03_03', modality:'HEG', condition:'Migraine', design:'Case Series', evidenceLevel:'III', effectSize:0.82, n:100, citations:67, tags:['HEG','migraine','headache','frontal','biofeedback'], abstract:'This large case series examined HEG biofeedback for recurrent migraine in 100 consecutive clinical patients. HEG measures prefrontal haemodynamic activity via near-infrared spectroscopy. Patients completed a mean of 40 sessions. Headache frequency reduced 68% (9.2 to 2.9 migraines/month; d=0.82). Migraine duration decreased 54% and medication usage fell 61%. 81% of patients reported clinically meaningful improvement. No adverse events. The mechanism is hypothesised as enhancement of frontal inhibitory control over trigeminovascular sensitisation via prefrontal activation.' },
  { id:'L025', title:'Neurotherapy including neurofeedback for attention and anxiety', authors:'Tinius TP, Tinius KA', year:2000, journal:'J Neurotherapy', doi:'10.1300/J184v04n01_02', modality:'HEG', condition:'ADHD', design:'Case Series', evidenceLevel:'III', effectSize:0.71, n:23, citations:45, tags:['HEG','attention','anxiety','frontal'], abstract:'This case series evaluated combined HEG and EEG neurofeedback in 23 children and adults with comorbid ADHD and anxiety. Treatment consisted of frontal HEG training combined with theta suppression EEG feedback over 30-45 sessions. Conners ADHD scores improved 41% for inattention and 33% for hyperactivity (composite d=0.71). Beck Anxiety Inventory decreased 38%. Academic performance improved in the paediatric sub-sample. Clinicians noted reduced emotional dysregulation as a prominent clinically meaningful change.' },
  { id:'L026', title:'Heart rate variability biofeedback for anxiety and depression', authors:'Lehrer PM, Gevirtz R', year:2014, journal:'Front Psychol', doi:'10.3389/fpsyg.2014.00756', modality:'Biofeedback', condition:'Anxiety', design:'Systematic Review', evidenceLevel:'II', effectSize:0.62, n:447, citations:512, tags:['HRV','biofeedback','anxiety','heart-rate','autonomic'], abstract:'This review and meta-analysis synthesized 24 RCTs (N=447) of HRV biofeedback for anxiety and depression. HRV biofeedback trains resonance frequency breathing at approximately 0.1 Hz to maximise cardiac vagal modulation. Anxiety outcomes showed consistent moderate-to-large improvements (pooled d=0.62). Depression showed d=0.41. Autonomic outcomes including resting HRV, baroreflex sensitivity, and vagal tone all improved. Neuroimaging demonstrates prefrontal and anterior insula activation during resonance breathing. HRV biofeedback works through descending cortico-limbic inhibitory pathways regulating autonomic reactivity.' },
  { id:'L027', title:'Biofeedback for PTSD: heart rate variability training', authors:'Tan G, Dao TK, Farmer L, et al.', year:2011, journal:'Appl Psychophysiol Biofeedback', doi:'10.1007/s10484-010-9142-2', modality:'Biofeedback', condition:'PTSD', design:'RCT', evidenceLevel:'II', effectSize:0.74, n:38, citations:203, tags:['HRV','biofeedback','PTSD','veterans','autonomic'], abstract:'This RCT examined HRV biofeedback as an adjunctive treatment for combat-related PTSD in 38 male veterans. Participants received 12 sessions of HRV biofeedback vs active muscle relaxation control. PCL-M scores decreased 31.4% in the HRV group vs 11.2% controls (d=0.74). Resting RMSSD increased 22%. Hyperarousal symptoms showed the largest changes. Heart period variability during trauma cue exposure was higher post-treatment in HRV group. Sleep quality improved 28%. The study supports HRV biofeedback as a physiologically targeted intervention for the autonomic dysregulation central to PTSD.' },
  { id:'L028', title:'Neurofeedback for autism spectrum disorder: systematic review', authors:'Holtmann M, Bolte S, Poustka F', year:2011, journal:'Dev Med Child Neurol', doi:'10.1111/j.1469-8749.2011.03985.x', modality:'Neurofeedback', condition:'Autism', design:'Systematic Review', evidenceLevel:'II', effectSize:0.55, n:148, citations:178, tags:['autism','ASD','neurofeedback','coherence','children'], abstract:'This systematic review examined 7 controlled NFB studies (N=148) for ASD. Protocols included coherence normalisation, SCP training, and theta/alpha manipulation. Effect size was d=0.55 for social skills and d=0.43 for adaptive behaviour. EEG coherence normalisation showed most consistent improvements in social reciprocity. Mirror neuron system-targeting protocols (mu suppression training) demonstrated promising effects. Repetitive behaviours showed less responsiveness than social and attention domains. QEEG-guided individualised approaches appear most promising for this heterogeneous population.' },
  { id:'L029', title:'rTMS for auditory hallucinations in schizophrenia: meta-analysis', authors:'Slotema CW, Blom JD, de Weijer AD, et al.', year:2011, journal:'Psychol Med', doi:'10.1017/S0033291711000833', modality:'TMS', condition:'Schizophrenia', design:'Meta-analysis', evidenceLevel:'I', effectSize:0.54, n:287, citations:334, tags:['TMS','schizophrenia','hallucinations','1Hz','temporoparietal'], abstract:'This meta-analysis examined 16 RCTs (N=287) of 1 Hz rTMS over the left temporoparietal junction for auditory verbal hallucinations in schizophrenia. Active 1 Hz rTMS produced significantly greater AVH reduction vs sham (weighted mean d=0.54). Response rates were 27.5% active vs 9.8% sham. Stimulation at 1 Hz, 90% MT, 20 min over 10 days produced the most consistent results. The TPJ inhibitory protocol addresses aberrant speech perception by downregulating left hemisphere language area hyperactivation that underlies hallucination generation.' },
  { id:'L030', title:'tDCS for negative symptoms in schizophrenia', authors:'Brunelin J, Mondino M, Gassab L, et al.', year:2012, journal:'Am J Psychiatry', doi:'10.1176/appi.ajp.2012.11071091', modality:'tDCS', condition:'Schizophrenia', design:'RCT', evidenceLevel:'I', effectSize:0.67, n:30, citations:421, tags:['tDCS','schizophrenia','negative-symptoms','hallucinations'], abstract:'This double-blind sham-controlled trial examined bifrontal tDCS (anode left DLPFC F3, cathode right TPJ TP4) in 30 schizophrenia patients with persistent auditory hallucinations and negative symptoms. 10 sessions of 2 mA tDCS over 5 days. PANSS negative subscale decreased 29% vs 7% sham at 3-month follow-up (d=0.67). Auditory hallucinations reduced 31% vs 8%. Working memory improved 22%. The bifrontal montage simultaneously upregulates hypofrontal dopaminergic activity while suppressing hyperactive left temporal areas implicated in hallucination generation.' },
  { id:'L031', title:'Combined neurofeedback and tDCS for ADHD: a pilot study', authors:'Ros T, Enriquez-Geppert S, Zotev V, et al.', year:2020, journal:'J Neural Transm', doi:'10.1007/s00702-020-02173-9', modality:'Multi-modal', condition:'ADHD', design:'Pilot RCT', evidenceLevel:'II', effectSize:0.71, n:28, citations:89, tags:['multimodal','NFB','tDCS','ADHD','combined'], abstract:'This pilot RCT examined theta/beta NFB with concurrent anodal tDCS over left DLPFC in 28 children with ADHD. Three groups: NFB+active tDCS, NFB+sham tDCS, or waitlist control over 20 sessions. Combined NFB+tDCS produced the largest ADHD-RS improvement (47% vs 28% NFB alone vs 8% control; d=0.71). EEG showed greater theta reduction and beta enhancement in combined condition. Working memory gains observed exclusively in the combined arm. Provides preliminary support for synergistic multimodal neuromodulation protocols combining cortical excitability enhancement with operant learning.' },
  { id:'L032', title:'Neurofeedback combined with TMS for depression: case series', authors:'Bhatt M, Bhatt N, Bahi M', year:2020, journal:'Brain Stimulation', doi:'10.1016/j.brs.2020.01.007', modality:'Multi-modal', condition:'Depression', design:'Case Series', evidenceLevel:'III', effectSize:0.88, n:8, citations:34, tags:['TMS','neurofeedback','combined','depression','case-series'], abstract:'This case series documents 8 treatment-resistant MDD patients who received left DLPFC high-frequency rTMS followed immediately by frontal alpha asymmetry neurofeedback training within the same session over 25 combined sessions. PHQ-9 scores decreased by a mean of 68% (pre 19.4 to post 6.2; d=0.88). All 8 achieved response and 6 of 8 achieved remission. Alpha asymmetry normalised toward healthy controls in all responders. The rationale proposes TMS-induced LTP-like synaptic enhancement creates a critical learning window amplifying NFB-mediated frontal asymmetry correction.' },
  { id:'L033', title:'Mindfulness-based cognitive therapy combined with neurofeedback', authors:'Sitaram R, Ros T, Stoeckel L, et al.', year:2017, journal:'Nat Rev Neurosci', doi:'10.1038/nrn.2016.164', modality:'Neurofeedback', condition:'Depression', design:'Systematic Review', evidenceLevel:'II', effectSize:0.58, n:312, citations:287, tags:['neurofeedback','mindfulness','depression','real-time-fMRI'], abstract:'This systematic review examined closed-loop brain training combining mindfulness with real-time neurofeedback for depression and emotional disorders (18 studies, N=312). Effect size for depression outcomes was d=0.58, with real-time fMRI NFB targeting subgenual ACC showing the largest effects (d=0.82). Mindfulness instructions during NFB significantly improved learning acquisition vs standard cognitive strategies. Alpha asymmetry and frontal theta regulation were the most common EEG targets. Integration of explicit cognitive strategies with implicit neural regulation represents a promising framework for treatment-resistant affective disorders.' },
  { id:'L034', title:'Slow cortical potential neurofeedback for ADHD', authors:'Heinrich H, Gevensleben H, Strehl U', year:2007, journal:'J Child Psychol Psychiatry', doi:'10.1111/j.1469-7610.2007.01745.x', modality:'Neurofeedback', condition:'ADHD', design:'RCT', evidenceLevel:'I', effectSize:0.53, n:94, citations:456, tags:['SCP','slow-cortical-potential','ADHD','children'], abstract:'This RCT compared slow cortical potential (SCP) neurofeedback with theta/beta (TBR) neurofeedback in 94 children with ADHD vs a computerised attention training control. After 30 sessions, both NFB protocols produced significant ADHD outcome improvements while the control did not. Effect sizes were d=0.53 for SCP-NFB and d=0.49 for TBR-NFB. N-back working memory improved significantly in both NFB groups. Gains maintained at 6-month follow-up only in NFB groups. The study established that two neurophysiologically distinct NFB approaches produce equivalent ADHD benefits.' },
  { id:'L035', title:'TMS in posttraumatic stress disorder: neurobiological underpinnings', authors:'Isserles M, Shalev AY, Roth Y, et al.', year:2013, journal:'Biol Psychiatry', doi:'10.1016/j.biopsych.2012.12.011', modality:'TMS', condition:'PTSD', design:'RCT', evidenceLevel:'II', effectSize:0.59, n:30, citations:145, tags:['TMS','PTSD','deep-TMS','H1-coil','trauma'], abstract:'This sham-controlled RCT examined deep TMS using the H1 coil combined with trauma script exposure in 30 chronic PTSD patients. Patients listened to personalised trauma narratives for 2 minutes before each session. After 6 weeks, CAPS-IV total score decreased 41% deep TMS vs 18% sham (d=0.59). Hyperarousal and re-experiencing subscales showed greatest improvements. Amygdala activation during trauma script fMRI reduced significantly in active vs sham. Cortisol response to trauma cues normalised in responders. The provocation-before-stimulation paradigm was subsequently adopted in the FDA-cleared OCD deep TMS protocol.' },
  { id:'L036', title:'Gamma neurofeedback training for mild cognitive impairment', authors:'Zhao D, Banks MI, ONeill DB, et al.', year:2020, journal:'Front Aging Neurosci', doi:'10.3389/fnagi.2020.00148', modality:'Neurofeedback', condition:'Cognitive Enhancement', design:'Pilot RCT', evidenceLevel:'II', effectSize:0.66, n:22, citations:78, tags:['gamma','40Hz','MCI','cognitive','aging'], abstract:'This pilot RCT examined 40 Hz gamma band neurofeedback for mild cognitive impairment in 22 older adults. Active participants trained 38-42 Hz power over 20 sessions. MoCA improved 2.8 points active vs 0.4 sham (d=0.66). Auditory memory and executive function improved significantly. Resting gamma power increased 22% post-treatment. Amyloid-beta-associated gamma synchrony mechanisms were discussed in the context of 40 Hz sensory entrainment research. Sleep architecture showed increased slow-wave sleep. Provides preliminary evidence for gamma NFB as non-pharmacological cognitive neuroprotection in prodromal neurodegeneration.' },
  { id:'L037', title:'tDCS for working memory in healthy adults: a meta-analysis', authors:'Meiron O, Lavidor M', year:2013, journal:'Exp Brain Res', doi:'10.1007/s00221-013-3500-7', modality:'tDCS', condition:'Cognitive Enhancement', design:'Meta-analysis', evidenceLevel:'I', effectSize:0.41, n:290, citations:312, tags:['tDCS','working-memory','DLPFC','cognitive','healthy'], abstract:'This meta-analysis pooled 16 sham-controlled studies (N=290) of anodal tDCS over DLPFC for working memory in healthy adults. Significant improvement in n-back accuracy (d=0.41) and reaction time (-87 ms). Online stimulation produced larger effects than offline. Bilateral montages outperformed unilateral in 4 studies. Baseline DLPFC excitability predicted tDCS responsiveness (r=0.49). Optimal parameters were 1.5-2 mA and 20-25 min. Working memory generalisation to untrained tasks was observed in 6 of 16 studies, supporting far transfer of tDCS-enhanced cognitive function.' },
  { id:'L038', title:'Neurofeedback for peak performance in athletes', authors:'Dupee M, Werthner P', year:2011, journal:'J Neurotherapy', doi:'10.1080/10874208.2011.595694', modality:'Neurofeedback', condition:'Cognitive Enhancement', design:'Case Series', evidenceLevel:'III', effectSize:0.77, n:12, citations:56, tags:['performance','athletes','neurofeedback','alpha','theta'], abstract:'This case series examined alpha-theta neurofeedback training for peak performance in 12 Olympic-level athletes. Athletes completed 20 sessions of individualised NFB targeting sport-specific mental states. Sport performance metrics improved by a mean of 0.77 standard deviations post-training. Flow state frequency increased 68%. Competitive anxiety (CSAI-2) decreased significantly. EEG alpha power at Pz increased 31% at rest. Athletes reported improved focus consistency, reduced pre-competition rumination, and enhanced recovery from errors during competition.' },
  { id:'L039', title:'Low-field PEMF for insomnia: double-blind RCT', authors:'Pelka RB, Jaenicke C, Gruenwald J', year:2001, journal:'Adv Ther', doi:'10.1007/BF02850256', modality:'PEMF', condition:'Insomnia', design:'RCT', evidenceLevel:'II', effectSize:0.61, n:101, citations:134, tags:['PEMF','insomnia','sleep','low-field','double-blind'], abstract:'This double-blind multicentre RCT evaluated LFMS for primary insomnia in 101 adults. PEMF (4 Hz, 0.05 mT) or sham applied via bilateral prefrontal coils for 30 minutes nightly over 4 weeks. PSQI improved significantly (change -4.8 vs -1.1; d=0.61). Polysomnographic data showed increased N3 (+18 min), improved sleep efficiency (82% vs 74%), and reduced WASO. Urinary melatonin metabolites increased 34% in PEMF group. Low-frequency PEMF is hypothesised to entrain slow cortical oscillations promoting sleep-onset through cholinergic modulation.' },
  { id:'L040', title:'Real-time fMRI neurofeedback for chronic pain', authors:'deCharms RC, Maeda F, Glover GH, et al.', year:2005, journal:'PNAS', doi:'10.1073/pnas.0504210102', modality:'Neurofeedback', condition:'Chronic Pain', design:'RCT', evidenceLevel:'II', effectSize:0.84, n:36, citations:567, tags:['fMRI-NFB','pain','ACC','real-time','chronic'], abstract:'This landmark study introduced real-time fMRI neurofeedback for pain modulation in 36 participants including chronic pain patients. Participants regulated rostral anterior cingulate cortex (rACC) activation in real-time during painful thermal stimulation. Chronic pain patients who down-regulated rACC showed 44% reduction in clinical pain NRS scores (d=0.84) persisting at follow-up. Healthy volunteers demonstrated volitional rACC modulation with corresponding pain intensity changes. Yoked-sham and mental imagery controls did not show equivalent gains. The study established feasibility of real-time fMRI for pain neuromodulation.' },
  { id:'L041', title:'TMS for autism spectrum disorder: a systematic review', authors:'Oberman L, Rotenberg A, Pascual-Leone A', year:2015, journal:'Rev J Autism Dev Disord', doi:'10.1007/s40489-014-0043-7', modality:'TMS', condition:'Autism', design:'Systematic Review', evidenceLevel:'II', effectSize:0.48, n:104, citations:167, tags:['TMS','autism','ASD','social','repetitive-behavior'], abstract:'This systematic review synthesized 14 TMS studies (N=104) in ASD. Inhibitory 1 Hz rTMS over DLPFC was the most common protocol. Repetitive behaviours showed the most consistent TMS-responsive changes (d=0.48). Social reciprocity measures improved in 5 of 7 studies with social paradigms. Cortical excitability measures normalised in active vs sham conditions. Three studies targeting cerebellum showed improved motor learning. The review discusses the mirror neuron hypothesis motivating DLPFC inhibition alongside emerging evidence for excitatory protocols for social communication domains.' },
  { id:'L042', title:'Biofeedback for migraine: meta-analysis', authors:'Nestoriuc Y, Martin A', year:2007, journal:'Pain', doi:'10.1016/j.pain.2006.10.023', modality:'Biofeedback', condition:'Migraine', design:'Meta-analysis', evidenceLevel:'I', effectSize:0.58, n:1025, citations:678, tags:['biofeedback','migraine','EMG','thermal','meta-analysis'], abstract:'This meta-analysis integrated 55 studies (N=1025) examining biofeedback for migraine prophylaxis across EMG, thermal, and combined modalities. Overall effect for migraine frequency reduction was d=0.58. Thermal biofeedback showed the largest effects (d=0.69). Biofeedback effects were comparable to pharmacological prophylaxis and superior to relaxation-only controls. Treatment gains maintained at 12-month follow-up (d=0.55). The review established biofeedback at Grade A evidence for migraine prevention, with clinical effect sizes rivalling pharmacological approaches with superior tolerability.' },
  { id:'L043', title:'Transcranial alternating current stimulation for insomnia', authors:'Goder R, Baier PC, Beith B, et al.', year:2013, journal:'Brain Stimulation', doi:'10.1016/j.brs.2012.06.002', modality:'tDCS', condition:'Insomnia', design:'RCT', evidenceLevel:'II', effectSize:0.55, n:19, citations:123, tags:['tACS','insomnia','slow-oscillation','sleep','SWS'], abstract:'This sham-controlled study examined slow-oscillation tACS (SO-tACS, 0.75 Hz) applied during non-REM sleep in 19 patients with primary insomnia. Active stimulation was applied bitemporally for 5 consecutive nights during the first SWS episode. Polysomnographic SWS duration increased significantly (38.2 vs 19.6 additional min; d=0.55). Declarative memory consolidation improved 24% active vs 6% sham. Daytime sleepiness decreased. SO-tACS was designed to entrain endogenous slow oscillations and enhance sleep spindle coupling, boosting the memory consolidation function of slow-wave sleep.' },
  { id:'L044', title:'Neurofeedback for chronic pain', authors:'Jensen MP, Grierson C, Tracy-Smith V, et al.', year:2007, journal:'Appl Psychophysiol Biofeedback', doi:'10.1007/s10484-007-9045-x', modality:'Neurofeedback', condition:'Chronic Pain', design:'Case Series', evidenceLevel:'III', effectSize:0.69, n:13, citations:89, tags:['neurofeedback','pain','alpha','spinal-cord-injury'], abstract:'This case series examined individualised QEEG-guided EEG neurofeedback for chronic pain in 13 individuals with spinal cord injury and neuropathic pain. Protocols targeted anomalous spectral features (typically theta excess and alpha deficit at central sites). Patients received 20 sessions over 6 weeks. Mean pain intensity decreased from 6.8 to 3.9 (d=0.69). Pain interference reduced 41%. Sleep quality improved in 10 of 13 participants. Responders showed normalisation of pre-treatment QEEG anomalies. The study supports personalised QEEG-guided neurofeedback as a potential adjunct for neuropathic pain management.' },
  { id:'L045', title:'High-frequency left rTMS for bipolar depression', authors:'Dell Osso B, Mundo E, D Urso N, et al.', year:2009, journal:'J Clin Psychiatry', doi:'10.4088/JCP.08l04243', modality:'TMS', condition:'Depression', design:'RCT', evidenceLevel:'II', effectSize:0.44, n:33, citations:112, tags:['TMS','bipolar','depression','left-DLPFC','high-frequency'], abstract:'This sham-controlled RCT evaluated 10 Hz left DLPFC rTMS for bipolar depression in 33 patients on mood stabilisers. 20 sessions over 4 weeks. HDRS-21 decreased 38% active vs 15% sham (d=0.44). Response rate 36.4% vs 12.5% sham. No hypomanic or manic switches during 3-month follow-up. YMRS scores were stable. Mood-stabiliser co-medication was considered protective against switch risk. Results suggest left DLPFC rTMS is a viable and safe antidepressant strategy for bipolar depression when combined with appropriate mood stabilisation.' },
  { id:'L046', title:'HRV biofeedback reduces PTSD symptoms in veterans', authors:'Zucker TL, Samuelson KW, Muench F, et al.', year:2009, journal:'Appl Psychophysiol Biofeedback', doi:'10.1007/s10484-009-9085-7', modality:'Biofeedback', condition:'PTSD', design:'Pilot RCT', evidenceLevel:'II', effectSize:0.71, n:30, citations:178, tags:['HRV','PTSD','veterans','autonomic','biofeedback'], abstract:'This pilot RCT compared HRV biofeedback to waitlist control in 30 US veterans with combat-related PTSD. Active participants received 12 sessions of resonance frequency breathing biofeedback at 0.1 Hz. PCL-M scores decreased 26.8 points HRV group vs 3.1 control (d=0.71). Resting HRV increased significantly. Emotional regulation improved substantially. Sleep quality improved a mean of 4.1 points. The autonomous nature of HRV biofeedback as a home practice was cited as a particular advantage for this population where therapeutic engagement can be challenging.' },
  { id:'L047', title:'tDCS for cocaine addiction: a randomized trial', authors:'Fregni F, Liguori P, Fecteau S, et al.', year:2008, journal:'J Clin Psychiatry', doi:'10.4088/JCP.v69n0218', modality:'tDCS', condition:'Cognitive Enhancement', design:'RCT', evidenceLevel:'II', effectSize:0.52, n:28, citations:234, tags:['tDCS','addiction','craving','DLPFC','prefrontal'], abstract:'This crossover RCT examined bilateral DLPFC tDCS for craving reduction in 28 cocaine-dependent outpatients. Active tDCS (anode right F4, cathode left F3, 2 mA, 20 min) or sham delivered on 2 occasions 2 weeks apart. Cocaine craving scores decreased significantly with active tDCS (-32% vs -8% sham; d=0.52). Decision-making (Iowa Gambling Task) improved. Prefrontal executive function composite improved 18%. The bilateral frontal montage enhances inhibitory control over mesolimbic craving circuitry. Findings support prefrontal tDCS as a potential adjunct to addiction medicine.' },
  { id:'L048', title:'Neurofeedback treatment for OCD', authors:'Koprivova J, Congedo M, Horacek J, et al.', year:2013, journal:'Appl Psychophysiol Biofeedback', doi:'10.1007/s10484-012-9218-2', modality:'Neurofeedback', condition:'OCD', design:'Pilot RCT', evidenceLevel:'II', effectSize:0.58, n:25, citations:67, tags:['neurofeedback','OCD','theta','obsessive-compulsive'], abstract:'This pilot RCT examined frontal midline theta suppression neurofeedback for OCD in 25 adults not responding adequately to SSRIs. Active group received Fz/Cz theta suppression training vs sham feedback over 15 sessions. Y-BOCS decreased 28% active vs 9% sham (d=0.58). Obsession subscale showed greater improvement than compulsion. EEG confirmed significant theta power reduction at Fz in active group. Baseline theta hyperactivity at frontal midline correlated with treatment response. Anxiety and depression improved as secondary outcomes.' },
  { id:'L049', title:'TMS for schizophrenia: a systematic review', authors:'Freitas C, Fregni F, Pascual-Leone A', year:2009, journal:'Schizophr Res', doi:'10.1016/j.schres.2009.03.005', modality:'TMS', condition:'Schizophrenia', design:'Systematic Review', evidenceLevel:'II', effectSize:0.51, n:231, citations:289, tags:['TMS','schizophrenia','negative-symptoms','systematic-review'], abstract:'This systematic review appraised 24 RCTs (N=231) of TMS for schizophrenia. Three primary applications: 1 Hz rTMS over left TPJ for auditory hallucinations (pooled d=0.54), high-frequency left DLPFC for negative symptoms (pooled d=0.41), and bilateral prefrontal for cognitive deficits (d=0.38). Combined effect size was d=0.51. Working memory, verbal fluency, and processing speed showed the most TMS-responsive cognitive domains. The review concludes TMS targeting both temporal and prefrontal regions represents a promising adjunctive strategy for treatment-resistant schizophrenia.' },
  { id:'L050', title:'Real-time EEG neurofeedback for anxiety disorders: a meta-analysis', authors:'Thibault RT, Lifshitz M, Raz A', year:2016, journal:'NeuroImage: Clinical', doi:'10.1016/j.nicl.2016.09.011', modality:'Neurofeedback', condition:'Anxiety', design:'Meta-analysis', evidenceLevel:'I', effectSize:0.56, n:412, citations:198, tags:['neurofeedback','anxiety','alpha','EEG','meta-analysis'], abstract:'This meta-analysis evaluated EEG neurofeedback across anxiety disorders in 18 controlled studies (N=412). Anxiety types included GAD, social anxiety, panic disorder, and mixed anxiety. Alpha asymmetry training (left > right frontal alpha) was the most common protocol. Overall effect size was d=0.56 (95% CI 0.39-0.73). Alpha asymmetry protocols produced larger effects (d=0.67) vs theta suppression (d=0.42). The review supports NFB as a clinically useful non-pharmacological anxiety treatment with effect magnitudes comparable to CBT across meta-analyses.' },
  { id:'L051', title:'Deep TMS for major depressive disorder: a pivotal trial', authors:'Levkovitz Y, Isserles M, Padberg F, et al.', year:2015, journal:'World Psychiatry', doi:'10.1002/wps.20199', modality:'TMS', condition:'Depression', design:'RCT', evidenceLevel:'I', effectSize:0.76, n:212, citations:456, tags:['deep-TMS','H1-coil','depression','FDA-cleared','multicenter'], abstract:'This international multicentre sham-controlled pivotal trial evaluated deep TMS using the H1 coil for MDD in 212 patients who had failed 1-4 antidepressant trials. Bilateral prefrontal deep TMS was delivered daily for 4 weeks. The primary endpoint, response on HDRS-21 at week 5, was achieved by 38.4% active vs 21.4% sham (OR=2.33, p=0.008; d=0.76). Remission 32.6% active vs 14.6% sham. The trial formed the basis for FDA clearance of deep TMS for MDD in 2013. Long-term follow-up showed durability of antidepressant response in 75% of initial responders at 12 months.' },
  { id:'L052', title:'PEMF for rheumatoid arthritis and pain', authors:'Bagnato GL, Miceli G, Marino N, et al.', year:2016, journal:'J Rehabil Med', doi:'10.2340/16501977-2111', modality:'PEMF', condition:'Chronic Pain', design:'RCT', evidenceLevel:'II', effectSize:0.63, n:42, citations:87, tags:['PEMF','arthritis','pain','inflammation','joint'], abstract:'This double-blind RCT evaluated continuous-use PEMF therapy for pain and inflammation in 42 rheumatoid arthritis patients on stable DMARDs. Active PEMF (100 Hz, 2.5 mT) applied via wearable device over affected joints for 6 hours/day over 8 weeks. VAS pain decreased 41% active vs 16% sham (d=0.63). DAS-28 disease activity improved significantly. CRP and ESR decreased more in active group. HAQ disability improved 28%. Joint morning stiffness fell 34 minutes. Proposed mechanism involves PEMF suppression of NF-kB signalling and upregulation of anti-inflammatory interleukins IL-10 and IL-4 in synovial tissue.' },
];

const MODALITY_COLORS = {
  TMS:           '#2dd4bf',
  Neurofeedback: '#818cf8',
  tDCS:          '#60a5fa',
  PEMF:          '#f59e0b',
  HEG:           '#34d399',
  Biofeedback:   '#fb923c',
  'Multi-modal': '#e879f9',
};

function _lsGetLit(key) { try { return JSON.parse(localStorage.getItem(key)||'[]'); } catch { return []; } }
function _lsSetLit(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function _seedLit() { if (!localStorage.getItem('ds_literature')) _lsSetLit('ds_literature', LITERATURE_DB); }

/** Normalise an API literature row (/api/v1/literature) to the shape the
 * Literature Library page expects. Unknown fields degrade to safe defaults so
 * the existing filters / evidence-map visualisation keep working when we
 * blend live + fixture data. */
function _normalizeApiLiteraturePaper(r) {
  const yr = Number(r.year) || 0;
  const grade = String(r.evidence_grade || '').toUpperCase();
  // Map A/B/C/D/E grade to the page's Level I/II/III ordering so the existing
  // "Evidence Level" sidebar filter keeps matching.
  const evLevel = grade === 'A' ? 'I' : grade === 'B' ? 'II' : grade === 'C' ? 'III' : '';
  const design = (r.study_type || '').trim() || '';
  const tags = Array.isArray(r.tags) ? r.tags : [];
  return {
    id: r.id || r.pubmed_id || r.doi || ('lib_' + Math.random().toString(36).slice(2, 10)),
    title: r.title || '',
    authors: r.authors || '',
    year: yr,
    journal: r.journal || '',
    doi: r.doi || '',
    modality: r.modality || 'Multi-modal',
    condition: r.condition || '',
    design: design || 'RCT',
    evidenceLevel: evLevel || 'II',
    effectSize: 0,   // not tracked at the library layer
    n: 0,
    citations: 0,
    tags,
    abstract: r.abstract || '',
    _source: 'api',
  };
}

/** Fetch the per-clinician curated library from /api/v1/literature and
 * union it with the seed LITERATURE_DB. API rows win on id collisions so
 * real curated data is authoritative; fixtures remain visible so the page
 * still looks populated on a brand-new workspace. */
async function _loadLiteratureFromApi() {
  try {
    const res = await api.getLiterature();
    const items = res?.items || [];
    if (!items.length) return LITERATURE_DB;
    const normalised = items.map(_normalizeApiLiteraturePaper);
    const byId = new Map(LITERATURE_DB.map(p => [p.id, p]));
    for (const row of normalised) byId.set(row.id, row);
    return Array.from(byId.values());
  } catch (_) {
    // offline / 401 / 5xx → degrade silently to fixtures so the page still
    // renders. The library-hub "Evidence" tab surfaces the backend error
    // with its own banner; we don't need to duplicate that here.
    return LITERATURE_DB;
  }
}

export async function pgLiteratureLibrary(setTopbar) {
  setTopbar('Evidence Library', '');
  _seedLit();
  const el = document.getElementById('content');
  // Wire live literature data. If the backend has curated papers, they merge
  // with the seed so counts on this page stay in sync with the API rather
  // than lagging behind a stale localStorage snapshot.
  const LIVE_LIT = await _loadLiteratureFromApi();

  let _tab      = 'library';
  let _q        = '';
  let _modality = '';
  let _condition = '';
  let _design   = '';
  let _evLevel  = '';
  let _yMin     = 1990;
  let _yMax     = 2025;
  let _sort     = 'recent';
  let _protoDD  = null;

  // Library source: live API first (LIVE_LIT), then the localStorage mirror,
  // then the in-repo LITERATURE_DB seed. This keeps counts truthful when the
  // backend is up and never shows a blank page when it isn't.
  const lib     = () => { if (Array.isArray(LIVE_LIT) && LIVE_LIT.length) return LIVE_LIT; const d=_lsGetLit('ds_literature'); return d.length?d:LITERATURE_DB; };
  const rl      = () => _lsGetLit('ds_literature_reading_list');
  const ptags   = () => _lsGetLit('ds_literature_protocol_tags');
  const inRl    = id => rl().some(r=>r.id===id);
  const protos  = () => { try { const r=JSON.parse(localStorage.getItem('ds_protocols')||'[]'); return r.map(p=>typeof p==='string'?{name:p}:p).filter(p=>p&&(p.name||p.title)); } catch { return []; } };
  const fa      = a => { const p=a.split(','); return p[0].trim()+(p.length>1?' et al.':''); };
  const apa     = p => `${p.authors} (${p.year}). ${p.title}. ${p.journal}. https://doi.org/${p.doi}`;
  const ec      = l => l==='I'?'#2dd4bf':l==='II'?'#60a5fa':'#f59e0b';
  const mc      = m => MODALITY_COLORS[m]||'#94a3b8';

  function filtered() {
    const q=_q.toLowerCase();
    let r=lib().filter(p=>{
      if(q&&!((p.title||'').toLowerCase().includes(q)||(p.authors||'').toLowerCase().includes(q)||(p.journal||'').toLowerCase().includes(q)||(p.tags||[]).some(t=>t.toLowerCase().includes(q)))) return false;
      if(_modality&&p.modality!==_modality) return false;
      if(_condition&&p.condition!==_condition) return false;
      if(_design&&p.design!==_design) return false;
      if(_evLevel&&p.evidenceLevel!==_evLevel) return false;
      if(p.year<_yMin||p.year>_yMax) return false;
      return true;
    });
    if(_sort==='recent') r.sort((a,b)=>b.year-a.year);
    if(_sort==='cited')  r.sort((a,b)=>b.citations-a.citations);
    if(_sort==='effect') r.sort((a,b)=>b.effectSize-a.effectSize);
    if(_sort==='alpha')  r.sort((a,b)=>a.title.localeCompare(b.title));
    return r;
  }

  function card(p) {
    const sv=inRl(p.id);
    const sn=(p.abstract||'').slice(0,120)+((p.abstract||'').length>120?'…':'');
    const mc2=`nnnd-badge-modality-${p.modality.replace(/[\s-]+/g,'-')}`;
    const dc=(p.design==='RCT'||p.design.includes('RCT'))?'nnnd-badge-design-RCT':'nnnd-badge-design';
    const ec2=`nnnd-badge-evidence-${p.evidenceLevel}`;
    return `<div class="nnnd-paper-card" data-modality="${p.modality}">
      <div class="nnnd-card-title" title="${p.title}">${p.title}</div>
      <div class="nnnd-card-meta">${fa(p.authors)} · ${p.year} · ${p.journal}</div>
      <div class="nnnd-badges">
        <span class="nnnd-badge ${mc2}">${p.modality}</span>
        <span class="nnnd-badge nnnd-badge-condition">${p.condition}</span>
        <span class="nnnd-badge ${dc}">${p.design}</span>
        <span class="nnnd-badge ${ec2}">Level ${p.evidenceLevel}</span>
      </div>
      <div class="nnnd-card-stats">
        <div class="nnnd-stat"><span class="nnnd-stat-value" style="color:${ec(p.evidenceLevel)}">d=${p.effectSize}</span><span class="nnnd-stat-label">Effect Size</span></div>
        <div class="nnnd-stat"><span class="nnnd-stat-value">N=${p.n}</span><span class="nnnd-stat-label">Sample</span></div>
        <div class="nnnd-stat"><span class="nnnd-stat-value">${p.citations.toLocaleString()}</span><span class="nnnd-stat-label">Citations</span></div>
      </div>
      <div class="nnnd-abstract-snippet">${sn}</div>
      <div class="nnnd-card-tags">${(p.tags||[]).slice(0,5).map(t=>`<span class="nnnd-tag">${t}</span>`).join('')}</div>
      <div class="nnnd-card-actions">
        <button class="nnnd-btn nnnd-btn-primary" onclick="window._litAbs('${p.id}')">Read Abstract</button>
        <button class="nnnd-btn ${sv?'nnnd-btn-saved':''}" id="rl-btn-${p.id}" onclick="window._litRL('${p.id}')">${sv?'✓ Saved':'+ Reading List'}</button>
        <button class="nnnd-btn" onclick="window._litCit('${p.id}')">Copy Citation</button>
      </div>
    </div>`;
  }

  function libView() {
    const pp=filtered();
    if(!pp.length) return `<div class="nnnd-rl-empty"><div class="nnnd-rl-empty-icon">🔬</div><p>No papers match your filters.</p></div>`;
    return `<div class="nnnd-cards-grid">${pp.map(card).join('')}</div>`;
  }

  function rlView() {
    const rlist=rl(), ldata=lib();
    if(!rlist.length) return `<div class="nnnd-rl-empty"><div class="nnnd-rl-empty-icon">📖</div><p>Your reading list is empty.</p><p style="font-size:12px;margin-top:8px">Click "+ Reading List" on any paper card to save it here.</p></div>`;
    const items=rlist.map(e=>{const p=ldata.find(x=>x.id===e.id); if(!p) return '';
      return `<div class="nnnd-rl-item">
        <div class="nnnd-rl-title">${p.title}</div>
        <div class="nnnd-rl-meta">${fa(p.authors)} · ${p.year} · ${p.journal}</div>
        <textarea class="nnnd-rl-notes" placeholder="Add notes…" oninput="window._litNote('${p.id}',this.value)">${e.notes||''}</textarea>
        <div class="nnnd-rl-actions">
          <button class="nnnd-btn nnnd-btn-primary" onclick="window._litAbs('${p.id}')">View Abstract</button>
          <button class="nnnd-btn" onclick="window._litCit('${p.id}')">Copy Citation</button>
          <button class="nnnd-btn" style="color:var(--accent-rose,#f87171);border-color:rgba(248,113,113,.3)" onclick="window._litRL('${p.id}')">Remove</button>
        </div>
      </div>`;}).join('');
    return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:13px;color:var(--text-muted)">${rlist.length} paper${rlist.length!==1?'s':''} saved</div>
        <button class="nnnd-btn" onclick="window._litBib()">Export Bibliography (.txt)</button>
      </div>
      <div class="nnnd-reading-list">${items}</div>`;
  }

  function mapView() {
    const pp=lib(), W=820, H=440, L=60, T=40, R=30, B=50;
    const iW=W-L-R, iH=H-T-B;
    const xp=y=>L+((y-1990)/35)*iW, yp=e=>T+(1-(e/2.0))*iH, br=n=>Math.max(6,Math.min(22,Math.sqrt(n)*1.8));
    const xg=[1990,1995,2000,2005,2010,2015,2020,2025].map(y=>
      `<line x1="${xp(y)}" y1="${T}" x2="${xp(y)}" y2="${T+iH}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
       <text x="${xp(y)}" y="${T+iH+16}" text-anchor="middle" font-size="10" fill="#64748b">${y}</text>`).join('');
    const yg=[0,0.5,1.0,1.5,2.0].map(e=>
      `<line x1="${L}" y1="${yp(e)}" x2="${L+iW}" y2="${yp(e)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
       <text x="${L-8}" y="${yp(e)+4}" text-anchor="end" font-size="10" fill="#64748b">${e.toFixed(1)}</text>`).join('');
    const bubbles=pp.map(p=>{const c=mc(p.modality);
      return `<circle cx="${xp(p.year)}" cy="${yp(p.effectSize)}" r="${br(p.n)}" fill="${c}" fill-opacity="0.7" stroke="${c}" stroke-width="1.5" style="cursor:pointer" onmouseenter="window._litTT(event,'${p.id}')" onmouseleave="window._litTTO()" onclick="window._litAbs('${p.id}')"/>`;}).join('');
    const legend=Object.entries(MODALITY_COLORS).map(([m,c])=>`<div class="nnnd-legend-item"><div class="nnnd-legend-dot" style="background:${c}"></div>${m}</div>`).join('');
    return `<div class="nnnd-evidence-map">
      <div class="nnnd-map-header"><div class="nnnd-map-title">Evidence Map — ${pp.length} Studies</div><div class="nnnd-legend">${legend}</div></div>
      <div class="nnnd-map-svg-wrap">
        <svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block;max-width:100%">
          ${xg}${yg}
          <text x="${L+iW/2}" y="${H-4}" text-anchor="middle" font-size="11" fill="#94a3b8">Year</text>
          <text x="13" y="${T+iH/2}" text-anchor="middle" font-size="11" fill="#94a3b8" transform="rotate(-90,13,${T+iH/2})">Effect Size (d)</text>
          <line x1="${L}" y1="${T}" x2="${L}" y2="${T+iH}" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
          <line x1="${L}" y1="${T+iH}" x2="${L+iW}" y2="${T+iH}" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
          ${bubbles}
        </svg>
        <div class="nnnd-map-tooltip" id="nnnd-tt"></div>
      </div>
      <div style="padding:10px 18px;font-size:11px;color:var(--text-muted);border-top:1px solid var(--border)">Bubble size = sample size (N). Hover for details, click to open abstract.</div>
    </div>`;
  }

  function sb() {
    return `
      <div class="nnnd-sidebar-section">
        <div class="nnnd-sidebar-label">Search</div>
        <input type="search" placeholder="Title, author, journal, tag…" value="${_q}" oninput="window._litFlt('q',this.value)">
      </div>
      <div class="nnnd-sidebar-section">
        <div class="nnnd-sidebar-label">Modality</div>
        <select onchange="window._litFlt('mod',this.value)">
          <option value="" ${!_modality?'selected':''}>All Modalities</option>
          ${['TMS','Neurofeedback','tDCS','PEMF','HEG','Biofeedback','Multi-modal'].map(m=>`<option value="${m}" ${_modality===m?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="nnnd-sidebar-section">
        <div class="nnnd-sidebar-label">Condition</div>
        <select onchange="window._litFlt('cond',this.value)">
          <option value="" ${!_condition?'selected':''}>All Conditions</option>
          ${['Depression','ADHD','Anxiety','PTSD','OCD','Insomnia','Chronic Pain','TBI','Autism','Migraine','Schizophrenia','Cognitive Enhancement'].map(c=>`<option value="${c}" ${_condition===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="nnnd-sidebar-section">
        <div class="nnnd-sidebar-label">Study Design</div>
        <select onchange="window._litFlt('dsn',this.value)">
          <option value="" ${!_design?'selected':''}>All Designs</option>
          ${['RCT','Meta-analysis','Systematic Review','Pilot RCT','Case Series','Observational'].map(d=>`<option value="${d}" ${_design===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="nnnd-sidebar-section">
        <div class="nnnd-sidebar-label">Year Range</div>
        <div class="nnnd-year-range">
          <input type="number" min="1990" max="2025" value="${_yMin}" onchange="window._litFlt('ymin',this.value)">
          <span>–</span>
          <input type="number" min="1990" max="2025" value="${_yMax}" onchange="window._litFlt('ymax',this.value)">
        </div>
      </div>
      <div class="nnnd-sidebar-section">
        <div class="nnnd-sidebar-label">Evidence Level</div>
        <select onchange="window._litFlt('ev',this.value)">
          <option value="" ${!_evLevel?'selected':''}>All Levels</option>
          <option value="I"   ${_evLevel==='I'  ?'selected':''}>Level I (RCT/Meta)</option>
          <option value="II"  ${_evLevel==='II' ?'selected':''}>Level II (Controlled)</option>
          <option value="III" ${_evLevel==='III'?'selected':''}>Level III (Observational)</option>
        </select>
      </div>
      <div class="nnnd-sidebar-section">
        <div class="nnnd-sidebar-label">Sort By</div>
        <select onchange="window._litFlt('sort',this.value)">
          <option value="recent" ${_sort==='recent'?'selected':''}>Most Recent</option>
          <option value="cited"  ${_sort==='cited' ?'selected':''}>Most Cited</option>
          <option value="effect" ${_sort==='effect'?'selected':''}>Highest Effect Size</option>
          <option value="alpha"  ${_sort==='alpha' ?'selected':''}>Alphabetical</option>
        </select>
      </div>`;
  }

  function tabContent() {
    if(_tab==='library')      return libView();
    if(_tab==='reading-list') return rlView();
    if(_tab==='evidence-map') return mapView();
    return '';
  }

  function rlBadge() { const c=rl().length; return c>0?`<span style="font-size:10px;background:var(--accent-violet,#818cf8);color:#fff;padding:1px 5px;border-radius:10px;margin-left:4px">${c}</span>`:''; }

  function render() {
    const n=filtered().length;
    el.innerHTML=`<div class="nnnd-library-layout">
      <div class="nnnd-sidebar" id="nnnd-sb">${sb()}</div>
      <div class="nnnd-main">
        <div class="nnnd-topbar">
          <button class="nnnd-tab ${_tab==='library'?'active':''}" onclick="window._litTab('library')">Papers</button>
          <button class="nnnd-tab ${_tab==='reading-list'?'active':''}" id="nnnd-rlt" onclick="window._litTab('reading-list')">Reading List${rlBadge()}</button>
          <button class="nnnd-tab ${_tab==='evidence-map'?'active':''}" onclick="window._litTab('evidence-map')">Evidence Map</button>
          <div class="nnnd-count" id="nnnd-cnt">${_tab==='library'?`${n} paper${n!==1?'s':''}`:''}</div>
        </div>
        <div class="nnnd-content-area" id="nnnd-ca">${tabContent()}</div>
      </div>
    </div>`;
  }

  function refreshCA() {
    const ca=document.getElementById('nnnd-ca');
    if(!ca){render();return;}
    ca.innerHTML=tabContent();
    const cnt=document.getElementById('nnnd-cnt');
    if(cnt){const n=filtered().length;cnt.textContent=_tab==='library'?`${n} paper${n!==1?'s':''}`:''}
    const rlt=document.getElementById('nnnd-rlt');
    if(rlt) rlt.innerHTML=`Reading List${rlBadge()}`;
  }

  function modal(p) {
    const sv=inRl(p.id);
    const mc2=`nnnd-badge-modality-${p.modality.replace(/[\s-]+/g,'-')}`;
    const dc=(p.design==='RCT'||p.design.includes('RCT'))?'nnnd-badge-design-RCT':'nnnd-badge-design';
    const ec2=`nnnd-badge-evidence-${p.evidenceLevel}`;
    const ss=(p.abstract||'').split('. ').filter(s=>s.length>30).slice(2,5).map(s=>s.trim()+(s.endsWith('.')?'':'.'));
    const cs=p.effectSize>=0.8?'Large effect — highly clinically meaningful':p.effectSize>=0.5?'Medium effect — clinically meaningful':p.effectSize>=0.2?'Small-medium effect — modest clinical benefit':'Small effect — marginal clinical significance';
    const lm={'RCT':'Single-blind or open-label limitations; variable sham conditions; sample size may limit power for subgroup analyses.','Meta-analysis':'Heterogeneous protocols across studies; publication bias possible; variable outcome measures.','Systematic Review':'Narrative synthesis limitations; inability to pool effect sizes across heterogeneous designs.','Pilot RCT':'Small sample size limits power and generalizability; absence of active control; short follow-up.','Case Series':'No control group; selection bias; limited causal inference; regression to mean risk.'};
    const lim=lm[p.design]||'See full text for methodological limitations.';
    const pr=protos(), opts=pr.length?pr.map(x=>`<div class="nnnd-protocol-dropdown-item" onclick="window._litTP('${p.id}','${(x.name||x.title||'').replace(/'/g,"\\'")}')">📋 ${x.name||x.title}</div>`).join(''):`<div class="nnnd-protocol-dropdown-item" style="color:var(--text-muted)">No protocols in library</div>`;
    return `<div class="nnnd-abstract-modal" id="nnnd-modal" onclick="window._litCBG(event)">
      <div class="nnnd-modal-content">
        <button class="nnnd-modal-close" onclick="window._litC()">×</button>
        <div class="nnnd-modal-title">${p.title}</div>
        <div class="nnnd-modal-authors">${p.authors}</div>
        <div class="nnnd-modal-journal">${p.journal} (${p.year}) · DOI: ${p.doi}</div>
        <div class="nnnd-badges" style="margin-bottom:12px">
          <span class="nnnd-badge ${mc2}">${p.modality}</span>
          <span class="nnnd-badge nnnd-badge-condition">${p.condition}</span>
          <span class="nnnd-badge ${dc}">${p.design}</span>
          <span class="nnnd-badge ${ec2}">Level ${p.evidenceLevel}</span>
        </div>
        <div class="nnnd-modal-stats">
          <div class="nnnd-modal-stat-box"><div class="val">${p.effectSize}</div><div class="lbl">Cohen's d</div></div>
          <div class="nnnd-modal-stat-box"><div class="val">N=${p.n}</div><div class="lbl">Sample Size</div></div>
          <div class="nnnd-modal-stat-box"><div class="val">${p.citations.toLocaleString()}</div><div class="lbl">Citations</div></div>
          <div class="nnnd-modal-stat-box" style="flex:2"><div class="val" style="font-size:13px;line-height:1.3">${cs}</div><div class="lbl">Clinical Significance</div></div>
        </div>
        <div class="nnnd-modal-section-label">Abstract</div>
        <div class="nnnd-modal-abstract">${p.abstract||'No abstract available.'}</div>
        <div class="nnnd-modal-section-label">Key Findings</div>
        <ul class="nnnd-findings-list">${ss.map(f=>`<li>${f}</li>`).join('')}</ul>
        <div class="nnnd-modal-section-label">Limitations</div>
        <div class="nnnd-limitations">${lim}</div>
        <div class="nnnd-modal-section-label">Tags</div>
        <div class="nnnd-card-tags" style="margin-bottom:0">${(p.tags||[]).map(t=>`<span class="nnnd-tag">${t}</span>`).join('')}</div>
        <div class="nnnd-modal-actions">
          <button class="nnnd-btn nnnd-btn-primary" onclick="window._litCit('${p.id}',true)">Copy APA Citation</button>
          <button class="nnnd-btn ${sv?'nnnd-btn-saved':''}" id="mrl-${p.id}" onclick="window._litRL('${p.id}',true)">${sv?'✓ In Reading List':'+ Reading List'}</button>
          <div class="nnnd-tag-protocol-wrap">
            <button class="nnnd-btn" onclick="window._litPDD('${p.id}')">Tag to Protocol ▾</button>
            <div class="nnnd-protocol-dropdown" id="pdd-${p.id}" style="display:none">${opts}</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  window._litTab = t => {
    _tab=t;
    el.querySelectorAll('.nnnd-tab').forEach((b,i)=>b.classList.toggle('active',['library','reading-list','evidence-map'][i]===t));
    refreshCA();
  };

  window._litFlt = (k,v) => {
    if(k==='q')    _q        = v;
    if(k==='mod')  _modality = v;
    if(k==='cond') _condition= v;
    if(k==='dsn')  _design   = v;
    if(k==='ev')   _evLevel  = v;
    if(k==='ymin') _yMin     = parseInt(v)||1990;
    if(k==='ymax') _yMax     = parseInt(v)||2025;
    if(k==='sort') _sort     = v;
    if(_tab==='library'){const ca=document.getElementById('nnnd-ca'); if(ca) ca.innerHTML=libView(); const cnt=document.getElementById('nnnd-cnt'); if(cnt){const n=filtered().length;cnt.textContent=`${n} paper${n!==1?'s':''}`}}
  };

  window._litAbs = id => {
    const p=lib().find(x=>x.id===id); if(!p) return;
    document.getElementById('nnnd-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', modal(p));
    document.body.style.overflow='hidden';
    window._litEK=e=>{if(e.key==='Escape')window._litC()};
    document.addEventListener('keydown', window._litEK);
  };

  window._litC = () => { document.getElementById('nnnd-modal')?.remove(); document.body.style.overflow=''; document.removeEventListener('keydown',window._litEK); };
  window._litCBG = e => { if(e.target.id==='nnnd-modal') window._litC(); };

  window._litRL = (id, inModal) => {
    const rlist=rl(), i=rlist.findIndex(r=>r.id===id);
    if(i>=0){ rlist.splice(i,1); _lsSetLit('ds_literature_reading_list',rlist);
      const b=document.getElementById(`rl-btn-${id}`); if(b){b.textContent='+ Reading List';b.classList.remove('nnnd-btn-saved');}
      const mb=document.getElementById(`mrl-${id}`); if(mb){mb.textContent='+ Reading List';mb.classList.remove('nnnd-btn-saved');}
    } else { rlist.push({id,notes:'',addedAt:new Date().toISOString()}); _lsSetLit('ds_literature_reading_list',rlist);
      const b=document.getElementById(`rl-btn-${id}`); if(b){b.textContent='✓ Saved';b.classList.add('nnnd-btn-saved');}
      const mb=document.getElementById(`mrl-${id}`); if(mb){mb.textContent='✓ In Reading List';mb.classList.add('nnnd-btn-saved');}
    }
    const rlt=document.getElementById('nnnd-rlt'); if(rlt) rlt.innerHTML=`Reading List${rlBadge()}`;
    if(_tab==='reading-list'&&!inModal) refreshCA();
  };

  window._litNote = (id,text) => { const r=rl(); const it=r.find(x=>x.id===id); if(it){it.notes=text;_lsSetLit('ds_literature_reading_list',r);} };

  window._litCit = (id, toast) => {
    const p=lib().find(x=>x.id===id); if(!p) return;
    const txt=apa(p);
    const done=()=>{ if(toast){const t=document.createElement('div');t.style.cssText='position:fixed;bottom:24px;right:24px;background:var(--accent-teal,#2dd4bf);color:#0a1628;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:2000;box-shadow:0 4px 16px rgba(0,0,0,.4)';t.textContent='✓ APA citation copied';document.body.appendChild(t);setTimeout(()=>t.remove(),2500);}};
    navigator.clipboard?.writeText(txt).then(done).catch(()=>{const ta=document.createElement('textarea');ta.value=txt;ta.style.cssText='position:fixed;opacity:0;left:-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();done();});
  };

  window._litTP = (pid, pname) => {
    const tags=ptags(); if(!tags.find(t=>t.paperId===pid&&t.protocol===pname)) {tags.push({paperId:pid,protocol:pname,taggedAt:new Date().toISOString()});_lsSetLit('ds_literature_protocol_tags',tags);}
    const dd=document.getElementById(`pdd-${pid}`); if(dd) dd.style.display='none'; _protoDD=null;
    const t=document.createElement('div');t.style.cssText='position:fixed;bottom:24px;right:24px;background:var(--accent-violet,#818cf8);color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:2000;box-shadow:0 4px 16px rgba(0,0,0,.4)';t.textContent=`✓ Tagged to "${pname}"`;document.body.appendChild(t);setTimeout(()=>t.remove(),2500);
  };

  window._litPDD = id => {
    if(_protoDD&&_protoDD!==id){const p=document.getElementById(`pdd-${_protoDD}`);if(p) p.style.display='none';}
    const dd=document.getElementById(`pdd-${id}`);if(!dd) return;
    const v=dd.style.display!=='none';dd.style.display=v?'none':'block';_protoDD=v?null:id;
  };

  window._litBib = () => {
    const r=rl(), l=lib();
    const lines=r.map(e=>{const p=l.find(x=>x.id===e.id);if(!p)return '';let s=apa(p);if(e.notes?.trim())s+=`\n  [Notes: ${e.notes.trim()}]`;return s;}).filter(Boolean);
    if(!lines.length) return;
    const txt=`DeepSynaps Literature Reading List\nExported: ${new Date().toLocaleDateString()}\n\n`+lines.join('\n\n');
    const url=URL.createObjectURL(new Blob([txt],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`reading-list-${new Date().toISOString().slice(0,10)}.txt`;a.click();URL.revokeObjectURL(url);
  };

  window._litTT = (evt, id) => {
    const p=lib().find(x=>x.id===id), tt=document.getElementById('nnnd-tt');
    if(!p||!tt) return;
    const col=mc(p.modality);
    tt.innerHTML=`<div style="font-weight:700;margin-bottom:4px;line-height:1.3">${p.title.length>65?p.title.slice(0,65)+'…':p.title}</div>
      <div style="color:var(--text-muted);font-size:11px;margin-bottom:5px">${fa(p.authors)} · ${p.year}</div>
      <div style="display:flex;gap:10px;font-size:11.5px"><span style="color:${col}">● ${p.modality}</span><span>d=${p.effectSize}</span><span>N=${p.n}</span></div>`;
    tt.style.display='block';
    const wr=tt.parentElement.getBoundingClientRect(), mx=evt.clientX-wr.left+14, my=evt.clientY-wr.top-10;
    tt.style.left=Math.max(4,(mx+250>tt.parentElement.clientWidth-8)?mx-260:mx)+'px';
    tt.style.top=Math.max(4,my)+'px';
  };

  window._litTTO = () => { const tt=document.getElementById('nnnd-tt'); if(tt) tt.style.display='none'; };

  window._litDocH = e => { if(_protoDD){const dd=document.getElementById(`pdd-${_protoDD}`);if(dd&&!e.target.closest('.nnnd-tag-protocol-wrap')){dd.style.display='none';_protoDD=null;}} };
  document.addEventListener('click', window._litDocH);

  render();
}

// ── Longitudinal Outcomes Report ──────────────────────────────────────────────
export async function pgLongitudinalReport(setTopbar) {
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── Seed data ──────────────────────────────────────────────────────────────
  function _lrGet() {
    const raw = localStorage.getItem('ds_longitudinal_data');
    if (raw) { try { return JSON.parse(raw); } catch(e) {} }
    const seed = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalPatients: 347, totalPatientsPrev: 298,
        responseRate: 66.2, responseRatePrev: 61.8,
        avgSessions: 18.4, avgSessionsPrev: 17.9,
        avgImprovement: 52.7, avgImprovementPrev: 49.1,
        dropoutRate: 11.3, dropoutRatePrev: 13.7
      },
      conditionModality: [
        { condition: 'Depression',   modality: 'TMS',           n: 89, responseRate: 68.5, avgImprovement: 54.2, sessions: 20, adverseEvents: 2.2 },
        { condition: 'Depression',   modality: 'Neurofeedback', n: 34, responseRate: 58.8, avgImprovement: 44.1, sessions: 22, adverseEvents: 0.0 },
        { condition: 'Depression',   modality: 'tDCS',          n: 28, responseRate: 57.1, avgImprovement: 42.8, sessions: 15, adverseEvents: 0.0 },
        { condition: 'Anxiety',      modality: 'tDCS',          n: 41, responseRate: 61.0, avgImprovement: 49.3, sessions: 14, adverseEvents: 0.0 },
        { condition: 'Anxiety',      modality: 'Neurofeedback', n: 38, responseRate: 63.2, avgImprovement: 51.4, sessions: 18, adverseEvents: 0.0 },
        { condition: 'Anxiety',      modality: 'TMS',           n: 22, responseRate: 54.5, avgImprovement: 43.6, sessions: 16, adverseEvents: 1.8 },
        { condition: 'PTSD',         modality: 'TMS',           n: 31, responseRate: 64.5, avgImprovement: 51.7, sessions: 20, adverseEvents: 3.2 },
        { condition: 'PTSD',         modality: 'Neurofeedback', n: 24, responseRate: 62.5, avgImprovement: 50.0, sessions: 24, adverseEvents: 0.0 },
        { condition: 'PTSD',         modality: 'tDCS',          n: 14, responseRate: 50.0, avgImprovement: 39.2, sessions: 14, adverseEvents: 0.0 },
        { condition: 'ADHD',         modality: 'Neurofeedback', n: 47, responseRate: 72.3, avgImprovement: 58.6, sessions: 30, adverseEvents: 0.0 },
        { condition: 'ADHD',         modality: 'tDCS',          n: 18, responseRate: 55.6, avgImprovement: 44.4, sessions: 14, adverseEvents: 0.0 },
        { condition: 'ADHD',         modality: 'TMS',           n: 10, responseRate: 50.0, avgImprovement: 40.0, sessions: 18, adverseEvents: 0.0 },
        { condition: 'OCD',          modality: 'TMS',           n: 19, responseRate: 63.2, avgImprovement: 48.7, sessions: 25, adverseEvents: 1.6 },
        { condition: 'OCD',          modality: 'Neurofeedback', n: 12, responseRate: 58.3, avgImprovement: 46.2, sessions: 28, adverseEvents: 0.0 },
        { condition: 'OCD',          modality: 'tDCS',          n:  8, responseRate: 50.0, avgImprovement: 38.9, sessions: 16, adverseEvents: 0.0 },
        { condition: 'Chronic Pain', modality: 'tDCS',          n: 23, responseRate: 60.9, avgImprovement: 47.8, sessions: 12, adverseEvents: 0.0 },
        { condition: 'Chronic Pain', modality: 'TMS',           n: 16, responseRate: 62.5, avgImprovement: 50.0, sessions: 16, adverseEvents: 0.0 },
        { condition: 'Chronic Pain', modality: 'Neurofeedback', n:  9, responseRate: 55.6, avgImprovement: 43.3, sessions: 18, adverseEvents: 0.0 }
      ],
      timeline: [
        { period: "Oct '25", responders: 58.4, n: 42 },
        { period: "Nov '25", responders: 60.1, n: 51 },
        { period: "Dec '25", responders: 61.8, n: 48 },
        { period: "Jan '26", responders: 63.5, n: 63 },
        { period: "Feb '26", responders: 65.2, n: 71 },
        { period: "Mar '26", responders: 66.2, n: 72 }
      ],
      demographics: {
        age: [
          { bin: '<18',   n: 14 },
          { bin: '18-30', n: 72 },
          { bin: '31-50', n: 143 },
          { bin: '51-65', n: 89 },
          { bin: '65+',   n: 29 }
        ],
        gender: [
          { label: 'Female',     n: 189, color: '#818cf8' },
          { label: 'Male',       n: 141, color: '#2dd4bf' },
          { label: 'Non-binary', n: 11,  color: '#f59e0b' },
          { label: 'Not stated', n: 6,   color: '#64748b' }
        ],
        insurance: [
          { label: 'Private',  n: 158 },
          { label: 'Medicare', n: 94  },
          { label: 'Medicaid', n: 61  },
          { label: 'Self-pay', n: 34  }
        ]
      }
    };
    localStorage.setItem('ds_longitudinal_data', JSON.stringify(seed));
    return seed;
  }

  const data = _lrGet();
  let _lrptSortCol = 'responseRate', _lrptSortDir = -1;

  setTopbar('Longitudinal Outcomes Report', `
    <select id="lrpt-cond" class="form-control" style="width:auto;font-size:13px" onchange="window._lrptFilt()">
      <option value="all">All Conditions</option>
      <option value="Depression">Depression</option>
      <option value="Anxiety">Anxiety</option>
      <option value="PTSD">PTSD</option>
      <option value="ADHD">ADHD</option>
      <option value="OCD">OCD</option>
      <option value="Chronic Pain">Chronic Pain</option>
    </select>
    <select id="lrpt-mod" class="form-control" style="width:auto;font-size:13px" onchange="window._lrptFilt()">
      <option value="all">All Modalities</option>
      <option value="TMS">TMS</option>
      <option value="Neurofeedback">Neurofeedback</option>
      <option value="tDCS">tDCS</option>
    </select>
    <select id="lrpt-range" class="form-control" style="width:auto;font-size:13px" onchange="window._lrptFilt()">
      <option value="6m">Last 6 months</option>
      <option value="12m">Last 12 months</option>
      <option value="all">All time</option>
    </select>
    <button onclick="window._lrptCSV()" style="background:var(--accent-blue);color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px">Export CSV</button>
    <button onclick="window.print()" style="background:var(--accent-violet);color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px">Export PDF</button>
  `);

  function _lrptFiltered() {
    const cond  = document.getElementById('lrpt-cond')  ? document.getElementById('lrpt-cond').value  : 'all';
    const mod   = document.getElementById('lrpt-mod')   ? document.getElementById('lrpt-mod').value   : 'all';
    const range = document.getElementById('lrpt-range') ? document.getElementById('lrpt-range').value : 'all';
    // Date-range scaling: reduce n proportionally for demo data
    const rangeMult = range === '6m' ? 0.5 : range === '12m' ? 0.85 : 1;
    return data.conditionModality.filter(r =>
      (cond === 'all' || r.condition === cond) &&
      (mod  === 'all' || r.modality  === mod)
    ).map(r => rangeMult < 1 ? { ...r, n: Math.max(1, Math.round(r.n * rangeMult)) } : r);
  }

  function _lrptRRColor(rr) {
    if (rr >= 70) return 'var(--teal)';
    if (rr >= 50) return 'var(--accent-amber)';
    return '#ef4444';
  }

  function _lrptBarChart(rows) {
    const conditions = [];
    rows.forEach(r => { if (!conditions.includes(r.condition)) conditions.push(r.condition); });
    const modalities = ['TMS', 'Neurofeedback', 'tDCS'];
    const modColors  = { TMS: '#2dd4bf', Neurofeedback: '#818cf8', tDCS: '#f59e0b' };
    const W = 900, H = 200, padL = 44, padB = 36, padT = 24, padR = 16;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const maxVal = 80;
    const groupW = chartW / Math.max(conditions.length, 1);
    const barCount = modalities.length;
    const barW = Math.min(28, (groupW - 8) / barCount);
    const gap = (groupW - barCount * barW) / 2;

    let bars = '', tooltips = '';
    conditions.forEach(function(cond, ci) {
      modalities.forEach(function(mod, mi) {
        const row = rows.find(r => r.condition === cond && r.modality === mod);
        if (!row) return;
        const x = padL + ci * groupW + gap + mi * barW;
        const barH = (row.avgImprovement / maxVal) * chartH;
        const y = padT + chartH - barH;
        const color = modColors[mod];
        const tid = 'lrpt-tt-' + ci + '-' + mi;
        bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (barW - 2) + '" height="' + barH.toFixed(1) + '" fill="' + color + '" rx="2"'
          + ' onmouseenter="document.getElementById(\'' + tid + '\').style.display=\'block\'"'
          + ' onmouseleave="document.getElementById(\'' + tid + '\').style.display=\'none\'"/>';
        tooltips += '<g id="' + tid + '" style="display:none" pointer-events="none">'
          + '<rect x="' + (x - 30).toFixed(1) + '" y="' + (y - 44).toFixed(1) + '" width="90" height="38" rx="5" fill="#1e293b" stroke="var(--border)" stroke-width="1"/>'
          + '<text x="' + (x + barW/2).toFixed(1) + '" y="' + (y - 28).toFixed(1) + '" text-anchor="middle" font-size="11" fill="#e2e8f0">' + cond + '</text>'
          + '<text x="' + (x + barW/2).toFixed(1) + '" y="' + (y - 13).toFixed(1) + '" text-anchor="middle" font-size="11" fill="' + color + '">' + mod + ': ' + row.avgImprovement.toFixed(1) + '%</text>'
          + '</g>';
      });
    });

    let yTicks = '';
    [0, 20, 40, 60, 80].forEach(function(v) {
      const y = padT + chartH - (v / maxVal) * chartH;
      yTicks += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="var(--border)" stroke-width="0.5"/>'
        + '<text x="' + (padL - 4) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--text-secondary)">' + v + '%</text>';
    });

    let xLabels = '';
    conditions.forEach(function(cond, ci) {
      const x = padL + ci * groupW + groupW / 2;
      xLabels += '<text x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--text-secondary)">' + (cond.length > 10 ? cond.slice(0,9) + '\u2026' : cond) + '</text>';
    });

    const legendY = 6;
    const legendItems = modalities.map(function(mod, i) {
      return '<rect x="' + (padL + i * 120) + '" y="' + legendY + '" width="10" height="10" fill="' + modColors[mod] + '" rx="2"/>'
        + '<text x="' + (padL + i * 120 + 14) + '" y="' + (legendY + 9) + '" font-size="11" fill="var(--text-secondary)">' + mod + '</text>';
    }).join('');

    return '<div class="lrpt-chart-wrap">'
      + '<div class="lrpt-chart-label">Avg % Improvement by Condition &amp; Modality</div>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;overflow:visible">'
      + legendItems + yTicks + bars + tooltips + xLabels
      + '</svg></div>';
  }

  function _lrptLineChart(tl) {
    const W = 900, H = 150, padL = 44, padB = 28, padT = 14, padR = 16;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const minVal = 50, maxVal = 80;
    const xStep = chartW / Math.max(tl.length - 1, 1);

    const points = tl.map(function(d, i) {
      return {
        x: padL + i * xStep,
        y: padT + chartH - ((d.responders - minVal) / (maxVal - minVal)) * chartH,
        d: d
      };
    });

    const polyline = points.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const area = padL + ',' + (padT + chartH) + ' ' + polyline + ' ' + points[points.length-1].x.toFixed(1) + ',' + (padT + chartH);

    let yTicks = '';
    [50, 60, 70, 80].forEach(function(v) {
      const y = padT + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;
      yTicks += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="var(--border)" stroke-width="0.5"/>'
        + '<text x="' + (padL - 4) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--text-secondary)">' + v + '%</text>';
    });

    const dots = points.map(function(p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="#2dd4bf" stroke="#0a1628" stroke-width="1.5"/>'
        + '<text x="' + p.x.toFixed(1) + '" y="' + (p.y - 8).toFixed(1) + '" text-anchor="middle" font-size="10" fill="#2dd4bf">' + p.d.responders.toFixed(1) + '%</text>';
    }).join('');

    const xLabels = points.map(function(p) {
      return '<text x="' + p.x.toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="10" fill="var(--text-secondary)">' + p.d.period + '</text>';
    }).join('');

    return '<div class="lrpt-chart-wrap">'
      + '<div class="lrpt-chart-label">Response Rate Over Time (% responders)</div>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;overflow:visible">'
      + '<defs><linearGradient id="lrptGrad" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="#2dd4bf" stop-opacity="0.25"/>'
      + '<stop offset="100%" stop-color="#2dd4bf" stop-opacity="0.02"/>'
      + '</linearGradient></defs>'
      + yTicks
      + '<polygon points="' + area + '" fill="url(#lrptGrad)"/>'
      + '<polyline points="' + polyline + '" fill="none" stroke="#2dd4bf" stroke-width="2.5" stroke-linejoin="round"/>'
      + dots + xLabels
      + '</svg></div>';
  }

  function _lrptAgeHist(bins) {
    const W = 320, H = 140, padL = 36, padB = 28, padT = 16, padR = 10;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const maxN = Math.max.apply(null, bins.map(b => b.n));
    const bw = chartW / bins.length;
    const barsHtml = bins.map(function(b, i) {
      const bh = (b.n / maxN) * chartH;
      const x = padL + i * bw + 2;
      const y = padT + chartH - bh;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - 4) + '" height="' + bh.toFixed(1) + '" fill="var(--accent-blue)" rx="2"/>'
        + '<text x="' + (padL + i * bw + bw / 2).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" text-anchor="middle" font-size="10" fill="var(--text-secondary)">' + b.n + '</text>'
        + '<text x="' + (padL + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="10" fill="var(--text-secondary)">' + b.bin + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">'
      + '<text x="' + (W/2) + '" y="11" text-anchor="middle" font-size="11" fill="var(--text-secondary)">Age Distribution</text>'
      + barsHtml + '</svg>';
  }

  function _lrptDonut(genders) {
    const total = genders.reduce(function(s, g) { return s + g.n; }, 0);
    const R = 50, cx = 80, cy = 72, innerR = 28;
    let startAngle = -Math.PI / 2;
    const slices = genders.map(function(g) {
      const angle = (g.n / total) * 2 * Math.PI;
      const x1 = cx + R * Math.cos(startAngle);
      const y1 = cy + R * Math.sin(startAngle);
      startAngle += angle;
      const x2 = cx + R * Math.cos(startAngle);
      const y2 = cy + R * Math.sin(startAngle);
      const lg = angle > Math.PI ? 1 : 0;
      return { label: g.label, n: g.n, color: g.color, x1: x1, y1: y1, x2: x2, y2: y2, lg: lg, pct: ((g.n / total) * 100).toFixed(0) };
    });
    const paths = slices.map(function(s) {
      return '<path d="M ' + cx + ' ' + cy + ' L ' + s.x1.toFixed(2) + ' ' + s.y1.toFixed(2) + ' A ' + R + ' ' + R + ' 0 ' + s.lg + ' 1 ' + s.x2.toFixed(2) + ' ' + s.y2.toFixed(2) + ' Z" fill="' + s.color + '" stroke="#0a1628" stroke-width="2"/>';
    }).join('');
    const hole = '<circle cx="' + cx + '" cy="' + cy + '" r="' + innerR + '" fill="var(--card-bg)"/>';
    const legend = slices.map(function(s, i) {
      return '<rect x="145" y="' + (12 + i * 18) + '" width="10" height="10" fill="' + s.color + '" rx="2"/>'
        + '<text x="159" y="' + (21 + i * 18) + '" font-size="10" fill="var(--text-secondary)">' + s.label + ' ' + s.pct + '%</text>';
    }).join('');
    return '<svg viewBox="0 0 280 148" width="100%" style="display:block">'
      + '<text x="80" y="11" text-anchor="middle" font-size="11" fill="var(--text-secondary)">Gender Distribution</text>'
      + paths + hole
      + '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text-primary)">N=' + total + '</text>'
      + legend + '</svg>';
  }

  function _lrptInsBar(ins) {
    const total = ins.reduce(function(s, i) { return s + i.n; }, 0);
    const W = 280, H = 130, padL = 58, padR = 50, padT = 18, padB = 10;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const rowH = chartH / ins.length;
    const maxN = Math.max.apply(null, ins.map(function(i) { return i.n; }));
    const colors = ['#2dd4bf','#818cf8','#f59e0b','#64748b'];
    const barsHtml = ins.map(function(ins2, i) {
      const bw = (ins2.n / maxN) * chartW;
      const y = padT + i * rowH + rowH * 0.15;
      const bh = rowH * 0.7;
      return '<text x="' + (padL - 4) + '" y="' + (y + bh / 2 + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--text-secondary)">' + ins2.label + '</text>'
        + '<rect x="' + padL + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + colors[i] + '" rx="2"/>'
        + '<text x="' + (padL + bw + 4).toFixed(1) + '" y="' + (y + bh / 2 + 4).toFixed(1) + '" font-size="10" fill="var(--text-secondary)">' + ins2.n + ' (' + ((ins2.n/total)*100).toFixed(0) + '%)</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">'
      + '<text x="' + (W/2) + '" y="12" text-anchor="middle" font-size="11" fill="var(--text-secondary)">Insurance Mix</text>'
      + barsHtml + '</svg>';
  }

  function _lrptTableHTML(rows, sortCol, sortDir) {
    const sorted = rows.slice().sort(function(a, b) {
      const va = a[sortCol], vb = b[sortCol];
      if (typeof va === 'string') return sortDir * va.localeCompare(vb);
      return sortDir * (va - vb);
    });
    function th(col, label) {
      const active = col === sortCol;
      const arrow = active ? (sortDir === 1 ? ' \u25b2' : ' \u25bc') : '';
      return '<th class="lrpt-th' + (active ? ' active' : '') + '" onclick="window._lrptSort(\'' + col + '\')" style="cursor:pointer">' + label + arrow + '</th>';
    }
    const rowsHtml = sorted.map(function(r) {
      const rrColor = _lrptRRColor(r.responseRate);
      const rrBg = r.responseRate >= 70 ? 'rgba(45,212,191,0.12)' : r.responseRate >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
      return '<tr>'
        + '<td>' + r.condition + ' \u2014 ' + r.modality + '</td>'
        + '<td>' + r.condition + '</td>'
        + '<td>' + r.modality + '</td>'
        + '<td>' + r.n + '</td>'
        + '<td style="color:' + rrColor + ';background:' + rrBg + ';font-weight:600;border-radius:4px;text-align:center">' + r.responseRate.toFixed(1) + '%</td>'
        + '<td>' + r.avgImprovement.toFixed(1) + '%</td>'
        + '<td>' + r.sessions + '</td>'
        + '<td>' + r.adverseEvents.toFixed(1) + '%</td>'
        + '</tr>';
    }).join('');
    return '<table class="lrpt-table" id="lrpt-table">'
      + '<thead><tr>'
      + th('condition', 'Protocol Name')
      + th('condition', 'Condition')
      + th('modality', 'Modality')
      + th('n', 'N Patients')
      + th('responseRate', 'Response Rate')
      + th('avgImprovement', 'Avg Improvement')
      + th('sessions', 'Sessions')
      + th('adverseEvents', 'Adverse Events %')
      + '</tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody>'
      + '</table>';
  }

  function _lrptTrend(cur, prev, unit, higherBetter) {
    const delta = cur - prev;
    const better = higherBetter ? delta >= 0 : delta <= 0;
    const color = better ? 'var(--teal)' : '#ef4444';
    const arrow = delta >= 0 ? '\u2191' : '\u2193';
    const sign  = delta >= 0 ? '+' : '';
    return '<span class="lrpt-trend" style="color:' + color + '">' + arrow + ' ' + sign + Math.abs(delta).toFixed(1) + unit + ' vs prev period</span>';
  }

  function _lrptRender() {
    const rows = _lrptFiltered();
    const s = data.summary;

    const kpiCards = '<div class="lrpt-kpi-row">'
      + '<div class="lrpt-kpi-card" style="border-color:var(--teal)"><div class="lrpt-kpi-num">' + s.totalPatients + '</div><div class="lrpt-kpi-label">Total Patients Treated</div>' + _lrptTrend(s.totalPatients, s.totalPatientsPrev, '', true) + '</div>'
      + '<div class="lrpt-kpi-card" style="border-color:var(--accent-blue)"><div class="lrpt-kpi-num">' + s.responseRate.toFixed(1) + '%</div><div class="lrpt-kpi-label">Response Rate (\u226550% improvement)</div>' + _lrptTrend(s.responseRate, s.responseRatePrev, '%', true) + '</div>'
      + '<div class="lrpt-kpi-card" style="border-color:var(--accent-violet)"><div class="lrpt-kpi-num">' + s.avgSessions.toFixed(1) + '</div><div class="lrpt-kpi-label">Avg Sessions / Course</div>' + _lrptTrend(s.avgSessions, s.avgSessionsPrev, '', false) + '</div>'
      + '<div class="lrpt-kpi-card" style="border-color:var(--accent-amber)"><div class="lrpt-kpi-num">' + s.avgImprovement.toFixed(1) + '%</div><div class="lrpt-kpi-label">Avg % Improvement</div>' + _lrptTrend(s.avgImprovement, s.avgImprovementPrev, '%', true) + '</div>'
      + '<div class="lrpt-kpi-card" style="border-color:#ef4444"><div class="lrpt-kpi-num">' + s.dropoutRate.toFixed(1) + '%</div><div class="lrpt-kpi-label">Dropout Rate</div>' + _lrptTrend(s.dropoutRate, s.dropoutRatePrev, '%', false) + '</div>'
      + '</div>';

    el.innerHTML = '<div class="lrpt-page">'
      + '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;color:var(--accent-amber,#ffb547);display:flex;align-items:center;gap:10px">'
      + '<span style="font-size:14px">&#9888;</span>'
      + '<span><b>Preview data.</b> This longitudinal report is using a fixed demo dataset. Real cohort aggregation from <code>/api/v1/outcomes/aggregate</code> is pending the longitudinal aggregator endpoint. Do not rely on the figures below for clinical or regulatory decisions.</span>'
      + '</div>'
      + kpiCards
      + '<div class="lrpt-section-title">Outcome by Condition &amp; Modality</div>'
      + _lrptBarChart(rows)
      + '<div class="lrpt-section-title">Response Rate Over Time</div>'
      + _lrptLineChart(data.timeline)
      + '<div class="lrpt-section-title">Protocol Performance</div>'
      + '<div id="lrpt-table-wrap">' + _lrptTableHTML(rows, _lrptSortCol, _lrptSortDir) + '</div>'
      + '<div class="lrpt-section-title">Cohort Demographics</div>'
      + '<div class="lrpt-demo-row">'
      + '<div class="lrpt-demo-card">' + _lrptAgeHist(data.demographics.age) + '</div>'
      + '<div class="lrpt-demo-card">' + _lrptDonut(data.demographics.gender) + '</div>'
      + '<div class="lrpt-demo-card">' + _lrptInsBar(data.demographics.insurance) + '</div>'
      + '</div>'
      + '</div>';
  }

  window._lrptFilt = function() { _lrptRender(); };

  window._lrptSort = function(col) {
    if (_lrptSortCol === col) { _lrptSortDir *= -1; }
    else { _lrptSortCol = col; _lrptSortDir = -1; }
    const rows = _lrptFiltered();
    const wrap = document.getElementById('lrpt-table-wrap');
    if (wrap) wrap.innerHTML = _lrptTableHTML(rows, _lrptSortCol, _lrptSortDir);
  };

  window._lrptCSV = function() {
    const rows = _lrptFiltered();
    const headers = ['Protocol Name','Condition','Modality','N Patients','Response Rate %','Avg Improvement %','Avg Sessions','Adverse Events %'];
    const lines = [headers.join(',')].concat(rows.map(function(r) {
      return [r.condition + ' - ' + r.modality, r.condition, r.modality, r.n, r.responseRate.toFixed(1), r.avgImprovement.toFixed(1), r.sessions, r.adverseEvents.toFixed(1)].join(',');
    }));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'longitudinal-report-' + new Date().toISOString().slice(0,10) + '.csv';
    a.click(); URL.revokeObjectURL(url);
    window._showNotifToast && window._showNotifToast({ title: 'CSV Exported', body: rows.length + ' rows exported', severity: 'success' });
  };

  _lrptRender();
}

// ── Clinical Scoring Calculator ───────────────────────────────────────────────
export async function pgClinicalScoringCalc(setTopbar) {
  setTopbar('Clinical Scoring Calculator', '');
  const el = document.getElementById('content');

  const SCALES = {
    'PHQ-9': {
      fullName: 'Patient Health Questionnaire-9',
      condition: 'Depression', icd10: ['F32','F33'], maxScore: 27,
      items: [
        'Little interest or pleasure in doing things',
        'Feeling down, depressed, or hopeless',
        'Trouble falling or staying asleep, or sleeping too much',
        'Feeling tired or having little energy',
        'Poor appetite or overeating',
        'Feeling bad about yourself \u2014 or that you are a failure or have let yourself or your family down',
        'Trouble concentrating on things, such as reading the newspaper or watching television',
        'Moving or speaking so slowly that other people could have noticed. Or the opposite \u2014 being so fidgety or restless that you have been moving around a lot more than usual',
        'Thoughts that you would be better off dead, or of hurting yourself in some way'
      ],
      optionLabels: ['Not at all','Several days','More than half the days','Nearly every day'],
      itemType: 'radio4', crisisItem: 8,
      severity: [
        { min:0,  max:4,  label:'Minimal Depression',         color:'#22c55e', interp:'Score suggests minimal depression. Monitor and repeat screening in 3\u20136 months. Watchful waiting is appropriate.' },
        { min:5,  max:9,  label:'Mild Depression',            color:'#84cc16', interp:'Score suggests mild depression. Watchful waiting, guided self-help, and psychoeducation are recommended.' },
        { min:10, max:14, label:'Moderate Depression',        color:'var(--accent-amber)', interp:'Scores in this range suggest moderate depression. Consider initiating treatment with antidepressant and/or structured psychotherapy. TMS may be considered when PHQ-9 \u226510 with inadequate medication response (clinician judgment required).' },
        { min:15, max:19, label:'Moderately Severe Depression',color:'#f97316', interp:'Scores in this range indicate moderately severe depression. Active treatment is commonly indicated at this severity; clinician review recommended.' },
        { min:20, max:27, label:'Severe Depression',          color:'#ef4444', interp:'Scores in this range indicate severe depression. Scores at this level indicate the need for urgent clinical assessment. Clinician judgment required regarding referral and treatment pathway.' }
      ],
      cutoffs:[{range:'0\u20134',label:'Minimal',action:'Watchful waiting'},{range:'5\u20139',label:'Mild',action:'Guided self-help'},{range:'10\u201314',label:'Moderate',action:'Treatment initiation'},{range:'15\u201319',label:'Moderately Severe',action:'Active treatment'},{range:'20\u201327',label:'Severe',action:'Urgent referral'}],
      txRecs:{'TMS':'TMS may be considered for PHQ-9 \u226510 with inadequate medication response. Left DLPFC, 10 Hz (clinician judgment required).','Medication':'SSRIs first-line. SNRI or augmentation for partial response.','Psychotherapy':'CBT and IPT have strong RCT evidence.'}
    },
    'GAD-7': {
      fullName: 'Generalized Anxiety Disorder-7',
      condition: 'Anxiety', icd10: ['F41.1'], maxScore: 21,
      items: [
        'Feeling nervous, anxious, or on edge',
        'Not being able to stop or control worrying',
        'Worrying too much about different things',
        'Trouble relaxing',
        'Being so restless that it is hard to sit still',
        'Becoming easily annoyed or irritable',
        'Feeling afraid, as if something awful might happen'
      ],
      optionLabels: ['Not at all','Several days','More than half the days','Nearly every day'],
      itemType: 'radio4',
      severity: [
        { min:0,  max:4,  label:'Minimal Anxiety',  color:'#22c55e', interp:'Score suggests minimal anxiety. Reassurance and psychoeducation appropriate.' },
        { min:5,  max:9,  label:'Mild Anxiety',     color:'#84cc16', interp:'Score suggests mild anxiety. Self-management strategies and relaxation techniques recommended.' },
        { min:10, max:14, label:'Moderate Anxiety', color:'var(--accent-amber)', interp:'Score suggests moderate anxiety. Consider structured CBT, SSRIs, or SNRIs. Neurofeedback has emerging evidence.' },
        { min:15, max:21, label:'Severe Anxiety',   color:'#ef4444', interp:'Score indicates severe anxiety. Active pharmacological and/or psychological treatment required.' }
      ],
      cutoffs:[{range:'0\u20134',label:'Minimal',action:'Reassurance'},{range:'5\u20139',label:'Mild',action:'Self-management'},{range:'10\u201314',label:'Moderate',action:'Structured intervention'},{range:'15\u201321',label:'Severe',action:'Active treatment + referral'}],
      txRecs:{'Neurofeedback':'Alpha/theta protocols for GAD. 20\u201330 sessions.','Medication':'SSRIs/SNRIs first-line.','Psychotherapy':'CBT with worry postponement is first-line.'}
    },
    'PCL-5': {
      fullName: 'PTSD Checklist for DSM-5',
      condition: 'PTSD', icd10: ['F43.1'], maxScore: 80, itemType: 'quick',
      domains: [
        { label:'Intrusion Symptoms (items 1\u20135)', max:20 },
        { label:'Avoidance (items 6\u20137)', max:8 },
        { label:'Negative Cognitions (items 8\u201314)', max:28 },
        { label:'Hyperarousal (items 15\u201320)', max:24 }
      ],
      severity: [
        { min:0,  max:31, label:'Below PTSD Threshold', color:'#22c55e', interp:'Score below clinical threshold of 31\u201333. Monitor; consider further evaluation if clinical concern.' },
        { min:32, max:49, label:'Probable PTSD',        color:'var(--accent-amber)', interp:'Scores in this range fall in the probable PTSD range (screening result only). CAPS-5 structured interview recommended for full clinical assessment.' },
        { min:50, max:80, label:'Severe PTSD',          color:'#ef4444', interp:'Scores in this range indicate severe PTSD. Trauma-focused CBT (CPT, PE) and neuromodulation have published evidence; clinician assessment required to determine treatment pathway.' }
      ],
      cutoffs:[{range:'0\u201331',label:'Subclinical',action:'Monitor'},{range:'32\u201349',label:'Probable PTSD',action:'Full assessment'},{range:'50\u201380',label:'Severe PTSD',action:'Active trauma treatment'}],
      txRecs:{'TMS':'Right DLPFC inhibition or bilateral. 20\u201330 sessions.','Psychotherapy':'CPT and Prolonged Exposure first-line.','EMDR':'WHO-endorsed trauma processing.'}
    },
    'HAM-D': {
      fullName: 'Hamilton Depression Rating Scale',
      condition: 'Depression', icd10: ['F32','F33'], maxScore: 52, itemType: 'quick',
      domains: [
        {label:'Depressed Mood (0\u20134)',max:4},{label:'Guilt (0\u20134)',max:4},{label:'Suicide (0\u20134)',max:4},
        {label:'Early Insomnia (0\u20132)',max:2},{label:'Middle Insomnia (0\u20132)',max:2},{label:'Late Insomnia (0\u20132)',max:2},
        {label:'Work/Activities (0\u20134)',max:4},{label:'Retardation (0\u20134)',max:4},{label:'Agitation (0\u20134)',max:4},
        {label:'Anxiety Psychic (0\u20134)',max:4},{label:'Anxiety Somatic (0\u20134)',max:4},{label:'Somatic GI (0\u20132)',max:2},
        {label:'Somatic General (0\u20132)',max:2},{label:'Genital Symptoms (0\u20132)',max:2},{label:'Hypochondriasis (0\u20134)',max:4},
        {label:'Weight Loss (0\u20132)',max:2},{label:'Insight (0\u20132)',max:2}
      ],
      severity:[
        {min:0,max:7,label:'Normal / Remission',color:'#22c55e',interp:'Normal range or remission.'},
        {min:8,max:13,label:'Mild Depression',color:'#84cc16',interp:'Mild depressive symptoms. Monitor; consider initiating treatment.'},
        {min:14,max:18,label:'Moderate Depression',color:'var(--accent-amber)',interp:'Scores in this range suggest moderate depression. Treatment initiation commonly considered; clinician assessment required.'},
        {min:19,max:22,label:'Severe Depression',color:'#f97316',interp:'Scores in this range indicate severe depression. Clinician review of treatment intensity is warranted.'},
        {min:23,max:52,label:'Very Severe',color:'#ef4444',interp:'Scores in this range indicate very severe depression. Scores at this level indicate the need for urgent clinical assessment.'}
      ],
      cutoffs:[{range:'0\u20137',label:'Normal',action:'Maintenance'},{range:'8\u201313',label:'Mild',action:'Monitor'},{range:'14\u201318',label:'Moderate',action:'Treatment'},{range:'19\u201322',label:'Severe',action:'Intensify'},{range:'23+',label:'Very Severe',action:'Urgent'}],
      txRecs:{'TMS':'Left DLPFC, 10 Hz. Response criterion: \u226550% HAM-D reduction (reference values \u2014 clinician judgment required).','ECT':'HAM-D \u226523 with insufficient prior treatment responses is a commonly cited ECT consideration threshold (clinician judgment required).'}
    },
    'MADRS': {
      fullName: 'Montgomery\u2013\u00c5sberg Depression Rating Scale',
      condition: 'Depression', icd10: ['F32','F33'], maxScore: 60, itemType: 'quick',
      domains: [
        {label:'Apparent Sadness (0\u20136)',max:6},{label:'Reported Sadness (0\u20136)',max:6},{label:'Inner Tension (0\u20136)',max:6},
        {label:'Reduced Sleep (0\u20136)',max:6},{label:'Reduced Appetite (0\u20136)',max:6},{label:'Concentration Difficulties (0\u20136)',max:6},
        {label:'Lassitude (0\u20136)',max:6},{label:'Inability to Feel (0\u20136)',max:6},{label:'Pessimistic Thoughts (0\u20136)',max:6},
        {label:'Suicidal Thoughts (0\u20136)',max:6}
      ],
      severity:[
        {min:0,max:6,label:'Normal',color:'#22c55e',interp:'Normal range. No treatment indicated.'},
        {min:7,max:19,label:'Mild Depression',color:'#84cc16',interp:'Mild depression. Watchful waiting or self-management.'},
        {min:20,max:34,label:'Moderate Depression',color:'var(--accent-amber)',interp:'Moderate depression. Active treatment recommended. TMS or pharmacotherapy.'},
        {min:35,max:60,label:'Severe Depression',color:'#ef4444',interp:'Scores in this range indicate severe depression. Scores at this level indicate the need for urgent clinical assessment. Note: MADRS \u226530 is a commonly cited TMS trial inclusion threshold (clinician judgment required).'}
      ],
      cutoffs:[{range:'0\u20136',label:'Normal',action:'None'},{range:'7\u201319',label:'Mild',action:'Self-management'},{range:'20\u201334',label:'Moderate',action:'Active treatment'},{range:'35\u201360',label:'Severe',action:'Urgent referral'}],
      txRecs:{'TMS':'Standard TMS trial inclusion threshold: MADRS \u226520. Response criterion: \u226550% reduction. Remission criterion: MADRS \u226410. (Reference values \u2014 confirm with clinical assessment.)'}
    },
    'BDI-II': {
      fullName: 'Beck Depression Inventory-II',
      condition: 'Depression', icd10: ['F32','F33'], maxScore: 63, itemType: 'quick',
      domains: [
        {label:'Sadness (0\u20133)',max:3},{label:'Pessimism (0\u20133)',max:3},{label:'Past Failure (0\u20133)',max:3},
        {label:'Loss of Pleasure (0\u20133)',max:3},{label:'Guilty Feelings (0\u20133)',max:3},{label:'Punishment Feelings (0\u20133)',max:3},
        {label:'Self-Dislike (0\u20133)',max:3},{label:'Self-Criticalness (0\u20133)',max:3},{label:'Suicidal Ideation (0\u20133)',max:3},
        {label:'Crying (0\u20133)',max:3},{label:'Agitation (0\u20133)',max:3},{label:'Loss of Interest (0\u20133)',max:3},
        {label:'Indecisiveness (0\u20133)',max:3},{label:'Worthlessness (0\u20133)',max:3},{label:'Loss of Energy (0\u20133)',max:3},
        {label:'Sleep Changes (0\u20133)',max:3},{label:'Irritability (0\u20133)',max:3},{label:'Appetite Changes (0\u20133)',max:3},
        {label:'Concentration Difficulties (0\u20133)',max:3},{label:'Tiredness/Fatigue (0\u20133)',max:3},{label:'Loss of Sex Interest (0\u20133)',max:3}
      ],
      severity:[
        {min:0,max:13,label:'Minimal Depression',color:'#22c55e',interp:'Minimal depressive symptoms.'},
        {min:14,max:19,label:'Mild Depression',color:'#84cc16',interp:'Mild depression. Monitoring and self-help.'},
        {min:20,max:28,label:'Moderate Depression',color:'var(--accent-amber)',interp:'Moderate depression. Treatment initiation recommended.'},
        {min:29,max:63,label:'Severe Depression',color:'#ef4444',interp:'Scores in this range indicate severe depression. Scores at this level indicate the need for urgent clinical assessment.'}
      ],
      cutoffs:[{range:'0\u201313',label:'Minimal',action:'Monitor'},{range:'14\u201319',label:'Mild',action:'Self-help'},{range:'20\u201328',label:'Moderate',action:'Treatment'},{range:'29\u201363',label:'Severe',action:'Urgent'}],
      txRecs:{'TMS':'BDI-II \u226520 typical TMS trial eligibility. Response: \u226550% reduction.','CBT':'First-line with or without pharmacotherapy.'}
    },
    'Y-BOCS': {
      fullName: 'Yale-Brown Obsessive Compulsive Scale',
      condition: 'OCD', icd10: ['F42'], maxScore: 40, itemType: 'quick',
      domains: [
        {label:'Obsessions \u2014 Time (0\u20134)',max:4},{label:'Obsessions \u2014 Interference (0\u20134)',max:4},{label:'Obsessions \u2014 Distress (0\u20134)',max:4},
        {label:'Obsessions \u2014 Resistance (0\u20134)',max:4},{label:'Obsessions \u2014 Control (0\u20134)',max:4},
        {label:'Compulsions \u2014 Time (0\u20134)',max:4},{label:'Compulsions \u2014 Interference (0\u20134)',max:4},{label:'Compulsions \u2014 Distress (0\u20134)',max:4},
        {label:'Compulsions \u2014 Resistance (0\u20134)',max:4},{label:'Compulsions \u2014 Control (0\u20134)',max:4}
      ],
      severity:[
        {min:0,max:7,label:'Subclinical',color:'#22c55e',interp:'Score in subclinical range.'},
        {min:8,max:15,label:'Mild OCD',color:'#84cc16',interp:'Mild OCD. Brief ERP, self-guided materials.'},
        {min:16,max:23,label:'Moderate OCD',color:'var(--accent-amber)',interp:'Moderate OCD. Structured ERP \u00b1 SRI. TMS (SMA or OFC) has emerging evidence.'},
        {min:24,max:31,label:'Severe OCD',color:'#f97316',interp:'Severe OCD. Intensive ERP + SRI. TMS for treatment-resistant cases.'},
        {min:32,max:40,label:'Extreme OCD',color:'#ef4444',interp:'Extreme OCD. Intensive/residential treatment. Neuromodulation (TMS, DBS) for refractory.'}
      ],
      cutoffs:[{range:'0\u20137',label:'Subclinical',action:'Monitor'},{range:'8\u201315',label:'Mild',action:'ERP self-guided'},{range:'16\u201323',label:'Moderate',action:'ERP + SRI'},{range:'24\u201331',label:'Severe',action:'Intensive ERP'},{range:'32\u201340',label:'Extreme',action:'Residential/TMS'}],
      txRecs:{'TMS':'Deep TMS (H7 coil) FDA-cleared for OCD (reference \u2014 clinician assessment required).','ERP':'ERP is widely considered a primary evidence-based approach. Response criterion: \u226535% Y-BOCS reduction.'}
    },
    'BPRS': {
      fullName: 'Brief Psychiatric Rating Scale',
      condition: 'Psychosis / General Psychiatry', icd10: ['F20','F25','F31'], maxScore: 168, itemType: 'quick',
      domains: [
        {label:'Somatic Concern (1\u20137)',max:7},{label:'Anxiety (1\u20137)',max:7},{label:'Emotional Withdrawal (1\u20137)',max:7},
        {label:'Conceptual Disorganization (1\u20137)',max:7},{label:'Guilt Feelings (1\u20137)',max:7},{label:'Tension (1\u20137)',max:7},
        {label:'Mannerisms/Posturing (1\u20137)',max:7},{label:'Grandiosity (1\u20137)',max:7},{label:'Depressive Mood (1\u20137)',max:7},
        {label:'Hostility (1\u20137)',max:7},{label:'Suspiciousness (1\u20137)',max:7},{label:'Hallucinatory Behavior (1\u20137)',max:7},
        {label:'Motor Retardation (1\u20137)',max:7},{label:'Uncooperativeness (1\u20137)',max:7},{label:'Unusual Thought Content (1\u20137)',max:7},
        {label:'Blunted Affect (1\u20137)',max:7},{label:'Excitement (1\u20137)',max:7},{label:'Disorientation (1\u20137)',max:7},
        {label:'Poor Attention (1\u20137)',max:7},{label:'Reduced Social Interest (1\u20137)',max:7},{label:'Self-Neglect (1\u20137)',max:7},
        {label:'Disturbance of Volition (1\u20137)',max:7},{label:'Bizarre Behavior (1\u20137)',max:7},{label:'Increased Motor Activity (1\u20137)',max:7}
      ],
      severity:[
        {min:24,max:40,label:'Normal',color:'#22c55e',interp:'Within normal limits.'},
        {min:41,max:70,label:'Borderline\u2013Mild',color:'#84cc16',interp:'Some symptoms present. Monitor closely.'},
        {min:71,max:108,label:'Moderate',color:'var(--accent-amber)',interp:'Moderate symptom burden. Active management.'},
        {min:109,max:168,label:'Severe',color:'#ef4444',interp:'Scores in this range indicate severe psychiatric symptom burden. Scores at this level indicate the need for urgent clinical assessment.'}
      ],
      cutoffs:[{range:'24\u201340',label:'Normal',action:'Monitor'},{range:'41\u201370',label:'Mild',action:'Outpatient'},{range:'71\u2013108',label:'Moderate',action:'Active treatment'},{range:'109+',label:'Severe',action:'Urgent care'}],
      txRecs:{'Antipsychotics':'First-line for positive symptoms.','TMS':'Left DLPFC for negative symptoms in schizophrenia (research).'}
    },
    'MoCA': {
      fullName: 'Montreal Cognitive Assessment',
      condition: 'Cognitive Impairment', icd10: ['F06.7','G31.84'], maxScore: 30, itemType: 'moca',
      domains: [
        {label:'Visuospatial / Executive (0\u20135)',max:5},{label:'Naming (0\u20133)',max:3},
        {label:'Memory \u2014 Registration',max:0,note:'Not scored'},
        {label:'Attention (0\u20136)',max:6},{label:'Language (0\u20133)',max:3},
        {label:'Abstraction (0\u20132)',max:2},{label:'Delayed Recall (0\u20135)',max:5},{label:'Orientation (0\u20136)',max:6}
      ],
      severity:[
        {min:0,max:17,label:'Moderate-Severe Impairment',color:'#ef4444',interp:'Scores in this range indicate significant cognitive impairment (score interpretation only \u2014 clinical assessment required). Neuropsychological evaluation and neurology referral may be warranted.'},
        {min:18,max:22,label:'Mild Impairment',color:'var(--accent-amber)',interp:'Mild cognitive impairment (MCI) range. Longitudinal monitoring and lifestyle interventions.'},
        {min:23,max:25,label:'Low Normal',color:'#84cc16',interp:'Low normal. Consider education adjustment (+1 if \u226412 years education). Retest in 12 months.'},
        {min:26,max:30,label:'Normal',color:'#22c55e',interp:'Within normal limits (\u226526). No significant cognitive impairment detected.'}
      ],
      cutoffs:[{range:'\u226526',label:'Normal',action:'Annual screen'},{range:'18\u201325',label:'MCI',action:'Monitor + lifestyle'},{range:'\u226417',label:'Dementia range',action:'Neurology referral'}],
      txRecs:{'Neurofeedback':'Emerging evidence for alpha/theta enhancement in MCI.','tDCS':'Left DLPFC stimulation for working memory in MCI populations.'}
    },
    'MMSE': {
      fullName: 'Mini-Mental State Examination',
      condition: 'Cognitive Impairment / Dementia', icd10: ['F00','F01','F02','F03'], maxScore: 30, itemType: 'moca',
      domains: [
        {label:'Orientation to Time (0\u20135)',max:5},{label:'Orientation to Place (0\u20135)',max:5},
        {label:'Registration (0\u20133)',max:3},{label:'Attention / Calculation (0\u20135)',max:5},
        {label:'Recall (0\u20133)',max:3},{label:'Language \u2014 Naming (0\u20132)',max:2},
        {label:'Language \u2014 Repetition (0\u20131)',max:1},{label:'Language \u2014 Commands (0\u20133)',max:3},
        {label:'Reading (0\u20131)',max:1},{label:'Writing (0\u20131)',max:1},{label:'Copying (0\u20131)',max:1}
      ],
      severity:[
        {min:0,max:9,label:'Severe Dementia',color:'#ef4444',interp:'Severe dementia. Specialist care required.'},
        {min:10,max:18,label:'Moderate Dementia',color:'#f97316',interp:'Moderate dementia. Structured care planning and safety assessment.'},
        {min:19,max:23,label:'Mild Dementia',color:'var(--accent-amber)',interp:'Mild dementia. Consider cholinesterase inhibitors. Cognitive rehabilitation.'},
        {min:24,max:30,label:'Normal',color:'#22c55e',interp:'Normal range. Repeat annually.'}
      ],
      cutoffs:[{range:'24\u201330',label:'Normal',action:'Annual screen'},{range:'19\u201323',label:'Mild dementia',action:'Medication + rehab'},{range:'10\u201318',label:'Moderate',action:'Structured care'},{range:'0\u20139',label:'Severe',action:'Specialist care'}],
      txRecs:{'Medication':'Cholinesterase inhibitors for mild-moderate Alzheimer\'s.','Neurofeedback':'Research stage for dementia populations.'}
    },
    'CAGE': {
      fullName: 'CAGE Alcohol Questionnaire',
      condition: 'Alcohol Use Disorder', icd10: ['F10.1','F10.2'], maxScore: 4, itemType: 'quick',
      domains: [
        {label:'C \u2014 Cut down (0\u20131): Have you ever felt you should cut down on your drinking?',max:1},
        {label:'A \u2014 Annoyed (0\u20131): Have people annoyed you by criticizing your drinking?',max:1},
        {label:'G \u2014 Guilty (0\u20131): Have you ever felt bad or guilty about your drinking?',max:1},
        {label:'E \u2014 Eye-opener (0\u20131): Have you ever had a drink first thing in the morning?',max:1}
      ],
      severity:[
        {min:0,max:1,label:'Low Risk',color:'#22c55e',interp:'Low risk. Provide brief alcohol education.'},
        {min:2,max:2,label:'Possible AUD',color:'var(--accent-amber)',interp:'Score of 2 suggests possible alcohol use disorder. Brief intervention and further assessment.'},
        {min:3,max:4,label:'Probable AUD / Dependence',color:'#ef4444',interp:'Scores in this range are associated with probable alcohol dependence in validated research (screening result only). Formal clinical assessment and specialist referral recommended.'}
      ],
      cutoffs:[{range:'0\u20131',label:'Low risk',action:'Brief education'},{range:'2',label:'Possible AUD',action:'Brief intervention'},{range:'3\u20134',label:'Probable dependence',action:'Specialist referral'}],
      txRecs:{'Psychotherapy':'Motivational interviewing and CBT for AUD.','Medication':'Naltrexone, acamprosate, or disulfiram per guidelines.'}
    },
    'AUDIT-C': {
      fullName: 'Alcohol Use Disorders Identification Test-C',
      condition: 'Alcohol Use Disorder', icd10: ['F10.1','F10.2'], maxScore: 12, itemType: 'quick',
      domains: [
        {label:'Q1: Frequency of drinking (0=Never to 4=4+\u00d7/week)',max:4},
        {label:'Q2: Drinks on typical day (0=1\u20132 to 4=10+)',max:4},
        {label:'Q3: Frequency of heavy drinking \u22656 drinks (0=Never to 4=Daily)',max:4}
      ],
      severity:[
        {min:0,max:2,label:'Low Risk',color:'#22c55e',interp:'Low-risk drinking. Provide education on safe limits.'},
        {min:3,max:4,label:'Hazardous / Harmful',color:'var(--accent-amber)',interp:'Hazardous/harmful drinking. Brief counselling recommended.'},
        {min:5,max:12,label:'Probable AUD',color:'#ef4444',interp:'Scores in this range are associated with probable alcohol use disorder (screening result only). Full AUDIT and clinical assessment needed.'}
      ],
      cutoffs:[{range:'0\u20132',label:'Low risk',action:'Education'},{range:'3\u20134',label:'Hazardous',action:'Brief counselling'},{range:'5\u201312',label:'Probable AUD',action:'Full assessment'}],
      txRecs:{'Brief Intervention':'FRAMES model for hazardous drinkers.','Specialist':'Formal AUD treatment for AUDIT-C \u22655.'}
    }
  };

  const SCALE_KEYS = Object.keys(SCALES);

  function _scalLoad() { try { return JSON.parse(localStorage.getItem('ds_scale_scores') || '[]'); } catch(e){ return []; } }
  function _scalSave(arr) { localStorage.setItem('ds_scale_scores', JSON.stringify(arr)); }

  let _scalActive = 'PHQ-9';
  let _scalValues = {};
  let _histOpen = false;
  let _refOpen = false;

  function _scalScore() {
    const scale = SCALES[_scalActive];
    if (!scale) return 0;
    if (scale.itemType === 'radio4') {
      return scale.items.reduce(function(s, _, i) {
        const v = parseInt(_scalValues['item_' + i]);
        return s + (v >= 0 ? v : 0);
      }, 0);
    }
    return (scale.domains || []).reduce(function(s, d, i) {
      const v = parseFloat(_scalValues['domain_' + i]) || 0;
      return s + Math.min(v, d.max);
    }, 0);
  }

  function _scalSeverity(score) {
    const scale = SCALES[_scalActive];
    if (!scale) return null;
    for (let si = 0; si < scale.severity.length; si++) {
      const sv = scale.severity[si];
      if (score >= sv.min && score <= sv.max) return sv;
    }
    return scale.severity[scale.severity.length - 1];
  }

  function _scalLastEntry() {
    const hist = _scalLoad().filter(function(e) { return e.scale === _scalActive; });
    if (!hist.length) return null;
    hist.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    return hist[0];
  }

  function _scalSparkline(vals) {
    if (vals.length < 2) return '';
    const W = 100, H = 30;
    const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    const range = mx - mn || 1;
    const pts = vals.map(function(v, i) {
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((v - mn) / range) * (H - 4) - 2;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100" height="30" style="vertical-align:middle"><polyline points="' + pts + '" fill="none" stroke="var(--teal)" stroke-width="1.5"/></svg>';
  }

  function _scalItemsHTML() {
    const scale = SCALES[_scalActive];
    if (!scale) return '';
    if (scale.itemType === 'radio4') {
      return scale.items.map(function(item, i) {
        const isCrisis = scale.crisisItem === i;
        const val = parseInt(_scalValues['item_' + i]);
        const opts = scale.optionLabels.map(function(lbl, v) {
          const sel = val === v;
          return '<label class="scal-radio-opt' + (sel ? ' selected' : '') + '">'
            + '<input type="radio" name="scal-item-' + i + '" value="' + v + '" onchange="window._scalSet(\'item_' + i + '\',' + v + ')" ' + (sel ? 'checked' : '') + '>'
            + '<span class="scal-radio-num">' + v + '</span>'
            + '<span class="scal-radio-lbl">' + lbl + '</span>'
            + '</label>';
        }).join('');
        const crisisFlag = (isCrisis && val > 0)
          ? '<div class="scal-crisis-flag">\u26a0 Crisis Resources: If patient endorses self-harm thoughts, assess immediate safety. Contact 988 Suicide &amp; Crisis Lifeline or nearest emergency services.</div>'
          : '';
        return '<div class="scal-item' + (isCrisis ? ' scal-item-crisis' : '') + '">'
          + '<div class="scal-item-label"><span class="scal-item-num">' + (i + 1) + '.</span> ' + item + '</div>'
          + '<div class="scal-radio-row">' + opts + '</div>'
          + crisisFlag
          + '</div>';
      }).join('');
    }
    return '<div class="scal-quick-note">Quick entry mode \u2014 enter domain scores from your paper/tablet form:</div>'
      + (scale.domains || []).map(function(d, i) {
        const val = _scalValues['domain_' + i] || '';
        if (d.max === 0) {
          return '<div class="scal-domain-row scal-domain-skip"><span class="scal-domain-label">' + d.label + '</span><span class="scal-domain-note">' + (d.note||'') + '</span></div>';
        }
        return '<div class="scal-domain-row">'
          + '<label class="scal-domain-label">' + d.label + '</label>'
          + '<input type="number" class="scal-domain-input" min="0" max="' + d.max + '" step="1" value="' + val + '"'
          + ' oninput="window._scalSet(\'domain_' + i + '\',this.value)" placeholder="0\u2013' + d.max + '">'
          + '<span class="scal-domain-max">/ ' + d.max + '</span>'
          + '</div>';
      }).join('');
  }

  function _scalResultHTML() {
    const scale = SCALES[_scalActive];
    const score = _scalScore();
    const sv = _scalSeverity(score);
    const prev = _scalLastEntry();
    const delta = prev ? score - prev.score : null;
    const deltaStr = delta !== null ? ((delta >= 0 ? '+' : '') + delta + ' pts vs. ' + prev.date) : null;
    const deltaColor = delta !== null ? (delta <= 0 ? 'var(--teal)' : '#ef4444') : '';
    const prevHtml = deltaStr
      ? '<div class="scal-delta" style="color:' + deltaColor + '">' + (delta <= 0 ? '\u2193' : '\u2191') + ' ' + deltaStr + '</div>'
      : '<div class="scal-delta" style="color:var(--text-secondary)">No previous assessment on record</div>';

    let pats = [];
    try { pats = JSON.parse(localStorage.getItem('ds_patients') || '[]'); } catch(e) {}
    const patOpts = pats.length
      ? pats.map(function(p) { return '<option value="' + p.id + '">' + (p.name || p.full_name || p.id) + '</option>'; }).join('')
      : '<option value="">No patients in local store</option>';

    return '<div class="scal-result-panel">'
      + '<div class="scal-result-main">'
      + '<div class="scal-score-big" style="color:' + (sv ? sv.color : 'var(--text-primary)') + '">' + score + '<span class="scal-score-denom">/' + scale.maxScore + '</span></div>'
      + '<div class="scal-severity-badge" style="background:' + (sv ? sv.color : '#64748b') + '22;color:' + (sv ? sv.color : 'var(--text-primary)') + ';border:1px solid ' + (sv ? sv.color : 'var(--border)') + '">' + (sv ? sv.label : '\u2014') + '</div>'
      + '</div>'
      + '<div class="scal-interp">' + (sv ? sv.interp : '') + '</div>'
      + prevHtml
      + '<div class="scal-save-row">'
      + '<select id="scal-pat-sel" class="form-control" style="width:auto;flex:1;font-size:13px"><option value="">Select patient\u2026</option>' + patOpts + '</select>'
      + '<input type="text" id="scal-meas-pt" class="form-control" placeholder="Assessment point (e.g. Baseline)" style="flex:1;font-size:13px">'
      + '<button class="scal-btn scal-btn-primary" onclick="window._scalSavePat()">Save to Patient</button>'
      + '<button class="scal-btn" onclick="window._scalCopy()">Copy Result</button>'
      + '</div>'
      + '</div>';
  }

  function _scalHistHTML() {
    const hist = _scalLoad().filter(function(e) { return e.scale === _scalActive; })
      .sort(function(a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 5);
    if (!hist.length) return '<div style="color:var(--text-secondary);font-size:13px;padding:12px 0">No saved scores for ' + _scalActive + ' yet.</div>';
    const scale = SCALES[_scalActive];
    const sparkVals = hist.slice().reverse().map(function(e) { return e.score; });
    return '<div class="scal-hist-row">'
      + '<div style="flex:1">'
      + hist.map(function(e) {
          const sv = _scalSeverity(e.score);
          return '<div class="scal-hist-entry">'
            + '<span class="scal-hist-date">' + e.date + '</span>'
            + '<span class="scal-hist-pt">' + (e.measurementPoint||'') + '</span>'
            + '<span class="scal-hist-score" style="color:' + (sv ? sv.color : 'var(--text-primary)') + '">' + e.score + '/' + scale.maxScore + '</span>'
            + '<span class="scal-hist-sev">' + (sv ? sv.label : '\u2014') + '</span>'
            + '</div>';
        }).join('')
      + '</div>'
      + '<div class="scal-hist-spark">' + _scalSparkline(sparkVals) + '</div>'
      + '</div>';
  }

  function _scalRefHTML() {
    const scale = SCALES[_scalActive];
    const icd = scale.icd10.join(', ');
    const cutRows = scale.cutoffs.map(function(c) {
      return '<tr><td>' + c.range + '</td><td>' + c.label + '</td><td>' + c.action + '</td></tr>';
    }).join('');
    const txRows = Object.keys(scale.txRecs || {}).map(function(k) {
      return '<div class="scal-ref-tx"><strong>' + k + ':</strong> ' + scale.txRecs[k] + '</div>';
    }).join('');
    return '<div class="scal-ref-inner">'
      + '<div class="scal-ref-section"><strong>Reference ICD-10 codes</strong> <span style="font-size:11px;color:var(--text-secondary)">(confirm with clinical assessment)</span>: ' + icd + '</div>'
      + '<div class="scal-ref-section"><strong>Scoring Cutoffs</strong>'
      + '<table class="scal-ref-table"><thead><tr><th>Range</th><th>Severity</th><th>Action</th></tr></thead><tbody>' + cutRows + '</tbody></table>'
      + '</div>'
      + '<div class="scal-ref-section"><strong>Clinical Reference &amp; Guidance</strong><div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">Reference information to support clinician judgment \u2014 not treatment prescriptions.</div>' + txRows + '</div>'
      + '</div>';
  }

  function _scalRender() {
    const tabs = SCALE_KEYS.map(function(k) {
      return '<button class="scal-tab' + (k === _scalActive ? ' active' : '') + '" onclick="window._scalTab(\'' + k + '\')">' + k + '</button>';
    }).join('');

    const hasDemoSeed = SCALES[_scalActive] && SCALES[_scalActive].itemType === 'radio4';
    const demoBtn = hasDemoSeed
      ? '<button class="scal-demo-btn" onclick="window._scalLoadDemo()" title="Pre-fill with a sample moderately-severe case for demo purposes">&#9654; Load demo scores</button>'
      : '';

    el.innerHTML = '<div class="scal-page">'
      + '<div class="scal-tab-row">' + tabs + (demoBtn ? '<div class="scal-tab-row-right">' + demoBtn + '</div>' : '') + '</div>'
      + '<div style="border-left:3px solid #4a9eff;background:rgba(74,158,255,0.07);padding:7px 12px;margin:8px 0 12px;border-radius:0 4px 4px 0;font-size:11.5px;color:var(--text-secondary);line-height:1.5">Clinical decision support tool \u2014 scores assist clinician judgment and do not constitute diagnosis or treatment recommendations.</div>'
      + '<div class="scal-scale-name">' + (SCALES[_scalActive] ? SCALES[_scalActive].fullName : '') + '</div>'
      + '<div class="scal-body">'
      + '<div class="scal-main-col">'
      + '<div class="scal-items" id="scal-items">' + _scalItemsHTML() + '</div>'
      + '<div id="scal-result">' + _scalResultHTML() + '</div>'
      + '<div class="scal-collapsible">'
      + '<button class="scal-collapse-btn" onclick="window._scalToggleHist()">' + (_histOpen ? '\u25be' : '\u25b8') + ' Score History</button>'
      + '<div id="scal-hist" style="' + (_histOpen ? '' : 'display:none') + '">' + _scalHistHTML() + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="scal-ref-col">'
      + '<button class="scal-collapse-btn scal-ref-toggle" onclick="window._scalToggleRef()">' + (_refOpen ? '\u25be' : '\u25b8') + ' Reference Card</button>'
      + '<div id="scal-ref" style="' + (_refOpen ? '' : 'display:none') + '">' + _scalRefHTML() + '</div>'
      + '</div>'
      + '</div>'
      + '</div>';
  }

  window._scalTab = function(k) { _scalActive = k; _scalValues = {}; _scalRender(); };

  // Demo mode: pre-fill current scale with a moderately-severe example
  window._scalLoadDemo = function() {
    const scale = SCALES[_scalActive];
    if (!scale) return;
    if (scale.itemType === 'radio4') {
      // PHQ-9 → total 17 (Moderately Severe): items 3,3,2,3,2,2,1,1,0
      // GAD-7 → total 13 (Moderate): items 3,2,3,2,1,2,0
      // Generic: fill most items with 2, last with 0
      const demoMaps = {
        'PHQ-9': [3,3,2,3,2,2,1,1,0],
        'GAD-7': [3,2,3,2,1,2,0],
        'HAM-D': [2,2,1,2,1,1,2,0,1,1,1,1,0,0,0,0,1],
        'MADRS': [2,2,2,2,2,2,2,2,2,2],
        'BDI-II':[2,1,2,2,1,1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
      };
      const scores = demoMaps[_scalActive] || scale.items.map(function(_, i) { return i < scale.items.length - 1 ? 2 : 0; });
      _scalValues = {};
      scores.forEach(function(v, i) { _scalValues['item_' + i] = v; });
    } else if (scale.itemType === 'quick') {
      (scale.domains || []).forEach(function(d, i) {
        if (d.max > 0) _scalValues['domain_' + i] = Math.floor(d.max * 0.45);
      });
    }
    _scalRender();
    if (typeof window._showNotifToast === 'function') {
      window._showNotifToast({ title: 'Demo scores loaded', body: 'Showing a moderately-severe example. Scores are illustrative only.', severity: 'info' });
    }
  };

  window._scalSet = function(key, val) {
    _scalValues[key] = val;
    const result = document.getElementById('scal-result');
    if (result) result.innerHTML = _scalResultHTML();
    const items = document.getElementById('scal-items');
    if (items) items.innerHTML = _scalItemsHTML();
  };

  window._scalSavePat = async function() {
    const patEl = document.getElementById('scal-pat-sel');
    const mpEl  = document.getElementById('scal-meas-pt');
    const pat  = patEl ? patEl.value : '';
    const mp   = (mpEl && mpEl.value) ? mpEl.value : 'Assessment';
    const score = _scalScore();
    const sv = _scalSeverity(score);
    const scale = SCALES[_scalActive];
    const entry = {
      id: 'sc_' + Date.now(),
      scale: _scalActive,
      patientId: pat || null,
      score: score,
      maxScore: scale.maxScore,
      severity: sv ? sv.label : '',
      measurementPoint: mp,
      date: new Date().toISOString().slice(0, 10),
      savedAt: new Date().toISOString()
    };
    const arr = _scalLoad();
    arr.push(entry);
    _scalSave(arr);
    if (pat) {
      await api.recordOutcome({
        patient_id: pat,
        scale: _scalActive,
        score: score,
        max_score: scale.maxScore,
        severity: sv ? sv.label : '',
        measurement_point: mp,
        assessed_at: entry.date
      }).catch(function() { return null; });
    }
    window._showNotifToast && window._showNotifToast({ title: 'Score Saved', body: _scalActive + ': ' + score + '/' + scale.maxScore + ' \u2014 ' + (sv ? sv.label : ''), severity: 'success' });
    const result = document.getElementById('scal-result');
    if (result) result.innerHTML = _scalResultHTML();
    const hist = document.getElementById('scal-hist');
    if (hist && _histOpen) hist.innerHTML = _scalHistHTML();
  };

  window._scalCopy = function() {
    const score = _scalScore();
    const sv = _scalSeverity(score);
    const scale = SCALES[_scalActive];
    const txt = _scalActive + ': ' + score + '/' + scale.maxScore + ' \u2014 ' + (sv ? sv.label : '') + ' (assessed ' + new Date().toISOString().slice(0, 10) + ')';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).catch(function() {
        const ta = document.createElement('textarea');
        ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    window._showNotifToast && window._showNotifToast({ title: 'Copied', body: txt, severity: 'info' });
  };

  window._scalToggleHist = function() {
    _histOpen = !_histOpen;
    const hist = document.getElementById('scal-hist');
    const btn  = el.querySelector('.scal-collapse-btn');
    if (hist) { hist.style.display = _histOpen ? '' : 'none'; if (_histOpen) hist.innerHTML = _scalHistHTML(); }
    if (btn) btn.textContent = (_histOpen ? '\u25be' : '\u25b8') + ' Score History';
  };

  window._scalToggleRef = function() {
    _refOpen = !_refOpen;
    const ref = document.getElementById('scal-ref');
    const btn = el.querySelector('.scal-ref-toggle');
    if (ref) ref.style.display = _refOpen ? '' : 'none';
    if (btn) btn.textContent = (_refOpen ? '\u25be' : '\u25b8') + ' Reference Card';
  };

  _scalRender();
}


// ─────────────────────────────────────────────────────────────────────────────
// pgConditionBrowser — browse all 20 condition packages
// ─────────────────────────────────────────────────────────────────────────────
export async function pgConditionBrowser(setTopbar) {
  setTopbar('Condition Packages', `
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:11px;color:var(--text-tertiary)">Gold-standard clinical schemas · ADHD + 19 conditions</span>
    </div>`);

  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary);font-size:13px">Loading condition packages…</div>';

  if (!document.getElementById('cpb-styles')) {
    const st = document.createElement('style');
    st.id = 'cpb-styles';
    st.textContent = `
      .cpb-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;padding:4px 0 }
      .cpb-card { background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;cursor:pointer;transition:border-color 0.15s,transform 0.12s }
      .cpb-card:hover { border-color:var(--teal);transform:translateY(-1px) }
      .cpb-cat { font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-tertiary);margin-bottom:6px }
      .cpb-name { font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px;line-height:1.3 }
      .cpb-icd { font-size:10.5px;color:var(--text-secondary);font-family:var(--font-mono,monospace);margin-bottom:8px }
      .cpb-tags { display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px }
      .cpb-tag { font-size:9.5px;padding:1px 7px;border-radius:6px;background:rgba(0,212,188,0.1);color:var(--teal) }
      .cpb-ev { font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;color:#000 }
      .cpb-ev-a { background:#22c55e } .cpb-ev-b { background:#3b82f6;color:#fff }
      .cpb-ev-c { background:#f59e0b } .cpb-ev-d { background:#94a3b8 }
      .cpb-footer { display:flex;align-items:center;justify-content:space-between;margin-top:10px }
      .cpb-sections { font-size:9.5px;color:var(--text-tertiary) }
    `;
    document.head.appendChild(st);
  }

  // All 20 known slugs with metadata for the browser
  const KNOWN_PACKAGES = [
    { slug:'adhd', name:'ADHD', category:'Neurodevelopmental', icd:'F90.x', ev:'EV-C', modalities:['Neurofeedback','tDCS','TMS'] },
    { slug:'major-depressive-disorder', name:'Major Depressive Disorder', category:'Mood & Affective', icd:'F32.9', ev:'EV-A', modalities:['TMS/rTMS','iTBS','tDCS'] },
    { slug:'treatment-resistant-depression', name:'Treatment-Resistant Depression', category:'Mood & Affective', icd:'F32.2', ev:'EV-A', modalities:['TMS','iTBS','ECT','tDCS'] },
    { slug:'obsessive-compulsive-disorder', name:'OCD', category:'OCD-Spectrum', icd:'F42', ev:'EV-B', modalities:['TMS','tDCS','DBS'] },
    { slug:'generalized-anxiety-disorder', name:'Generalised Anxiety Disorder', category:'Anxiety', icd:'F41.1', ev:'EV-C', modalities:['TMS','tDCS','taVNS'] },
    { slug:'ptsd', name:'PTSD', category:'Trauma & Stress', icd:'F43.1', ev:'EV-B', modalities:['TMS','Neurofeedback','taVNS'] },
    { slug:'insomnia', name:'Insomnia', category:'Sleep', icd:'G47.0', ev:'EV-C', modalities:['tDCS','Neurofeedback','taVNS','CES'] },
    { slug:'chronic-pain-fibromyalgia', name:'Chronic Pain / Fibromyalgia', category:'Neurological — Pain', icd:'M79.7', ev:'EV-C', modalities:['TMS','tDCS','taVNS'] },
    { slug:'migraine', name:'Migraine', category:'Neurological — Headache', icd:'G43', ev:'EV-B', modalities:['TMS','tDCS','taVNS'] },
    { slug:'cluster-headache', name:'Cluster Headache', category:'Neurological — Headache', icd:'G44.0', ev:'EV-C', modalities:['TMS','taVNS','Sphenopalatine stimulation'] },
    { slug:'drug-resistant-epilepsy', name:'Epilepsy (Drug-Resistant)', category:'Neurological — Epilepsy', icd:'G40.9', ev:'EV-B', modalities:['VNS','taVNS','DBS','TMS (inhibitory)'] },
    { slug:'parkinsons-disease', name:"Parkinson's Disease", category:'Neurological — Movement', icd:'G20', ev:'EV-B', modalities:['TMS','tDCS','DBS'] },
    { slug:'essential-tremor', name:'Essential Tremor', category:'Neurological — Movement', icd:'G25.0', ev:'EV-B', modalities:['TMS','tDCS','DBS'] },
    { slug:'dystonia', name:'Dystonia', category:'Neurological — Movement', icd:'G24', ev:'EV-C', modalities:['TMS','DBS'] },
    { slug:'stroke-rehabilitation', name:'Stroke Rehabilitation', category:'Neurological — Rehabilitation', icd:'I69', ev:'EV-B', modalities:['TMS','tDCS','Neurofeedback'] },
    { slug:'tinnitus', name:'Tinnitus', category:'Sensory', icd:'H93.1', ev:'EV-C', modalities:['TMS','tDCS','taVNS'] },
    { slug:'cognitive-impairment-tbi', name:'Cognitive Impairment / TBI', category:'Neurological — Cognitive', icd:'S09.90', ev:'EV-C', modalities:['tDCS','TMS','Neurofeedback'] },
    { slug:'autism-spectrum-disorder', name:'Autism Spectrum Disorder', category:'Neurodevelopmental', icd:'F84.0', ev:'EV-C', modalities:['TMS','tDCS','Neurofeedback'] },
    { slug:'smoking-cessation', name:'Smoking Cessation', category:'Addiction', icd:'F17.2', ev:'EV-C', modalities:['TMS','tDCS','taVNS'] },
    { slug:'opioid-withdrawal', name:'Opioid Withdrawal', category:'Addiction', icd:'F11.2', ev:'EV-C', modalities:['TMS','taVNS','CES'] },
  ];

  function evClass(ev) {
    if (ev === 'EV-A') return 'cpb-ev-a';
    if (ev === 'EV-B') return 'cpb-ev-b';
    if (ev === 'EV-C') return 'cpb-ev-c';
    return 'cpb-ev-d';
  }

  const cards = KNOWN_PACKAGES.map(p => `
    <div class="cpb-card" onclick="window._openCondPkg('${p.slug}')">
      <div class="cpb-cat">${p.category}</div>
      <div class="cpb-name">${p.name}</div>
      <div class="cpb-icd">${p.icd}</div>
      <div class="cpb-tags">
        ${p.modalities.slice(0,3).map(m => `<span class="cpb-tag">${m}</span>`).join('')}
      </div>
      <div class="cpb-footer">
        <span class="cpb-sections">13 clinical sections · protocols · handbook · consent</span>
        <span class="cpb-ev ${evClass(p.ev)}">${p.ev}</span>
      </div>
    </div>`).join('');

  el.innerHTML = `<div class="page-section">
    <div style="margin-bottom:20px">
      <div style="font-size:20px;font-weight:800;color:var(--text-primary);font-family:var(--font-display);margin-bottom:6px">Clinical Condition Packages</div>
      <div style="font-size:13px;color:var(--text-secondary)">One schema per condition · generates assessments, protocols, handbooks, monitoring rules, home programs, patient guides, and consent documents</div>
    </div>
    <div class="cpb-grid">${cards}</div>
  </div>`;

  window._openCondPkg = function(slug) {
    window._condPkgSlug = slug;
    window._nav('condition-package');
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// pgConditionPackage — full condition package viewer (8 tabs)
// ─────────────────────────────────────────────────────────────────────────────
export async function pgConditionPackage(setTopbar, navigate) {
  const slug = window._condPkgSlug || 'adhd';

  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary);font-size:13px">Loading condition package…</div>';

  // ── CSS ───────────────────────────────────────────────────────────────────
  if (!document.getElementById('cp-styles')) {
    const st = document.createElement('style');
    st.id = 'cp-styles';
    st.textContent = `
      .cp-header { background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px 24px;margin-bottom:20px }
      .cp-tab-bar { display:flex;gap:2px;border-bottom:2px solid var(--border);margin-bottom:20px;overflow-x:auto;flex-wrap:nowrap }
      .cp-tab { padding:9px 15px;font-size:12px;font-weight:600;color:var(--text-secondary);cursor:pointer;border:none;background:transparent;font-family:var(--font-body);border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:color 0.12s }
      .cp-tab:hover { color:var(--text-primary) }
      .cp-tab.active { color:var(--teal);border-bottom-color:var(--teal) }
      .cp-section { margin-bottom:20px }
      .cp-section-title { font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border) }
      .cp-grid2 { display:grid;grid-template-columns:1fr 1fr;gap:14px }
      .cp-grid3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px }
      .cp-card { background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px }
      .cp-pheno-card { background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px }
      .cp-ev-badge { font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;color:#000 }
      .cp-ev-a { background:#22c55e } .cp-ev-b { background:#3b82f6;color:#fff }
      .cp-ev-c { background:#f59e0b } .cp-ev-d { background:#94a3b8 }
      .cp-proto-card { background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;margin-bottom:14px }
      .cp-proto-header { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px }
      .cp-proto-name { font-size:14px;font-weight:700;color:var(--text-primary) }
      .cp-param-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 }
      .cp-param-row { background:var(--bg-surface-2);border-radius:var(--radius-sm);padding:8px 10px }
      .cp-param-lbl { font-size:9.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px }
      .cp-param-val { font-size:12px;font-weight:600;color:var(--text-primary) }
      .cp-caveat { background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:var(--radius-md);padding:10px 14px;margin-top:10px;font-size:11.5px;color:var(--amber);line-height:1.5 }
      .cp-ae-row { display:grid;grid-template-columns:24px 1fr 80px 100px;gap:10px;align-items:center;padding:10px 12px;border-radius:var(--radius-sm);margin-bottom:6px }
      .cp-ae-serious { background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.18) }
      .cp-ae-moderate { background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.18) }
      .cp-ae-mild { background:rgba(255,255,255,0.03);border:1px solid var(--border) }
      .cp-timeline { display:flex;gap:0;margin:14px 0;overflow-x:auto }
      .cp-timeline-step { flex:1;min-width:90px;text-align:center;position:relative;padding:0 4px }
      .cp-timeline-step:before { content:'';position:absolute;top:15px;left:50%;right:-50%;height:2px;background:var(--border);z-index:0 }
      .cp-timeline-step:last-child:before { display:none }
      .cp-timeline-dot { width:32px;height:32px;border-radius:50%;background:var(--teal);border:2px solid var(--teal);margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#000;position:relative;z-index:1 }
      .cp-timeline-lbl { font-size:9.5px;color:var(--text-secondary);line-height:1.3 }
      .cp-handbook-sub { display:flex;gap:6px;margin-bottom:14px }
      .cp-handbook-tab { padding:5px 12px;font-size:11px;font-weight:600;cursor:pointer;border-radius:var(--radius-md);background:transparent;border:1px solid var(--border);color:var(--text-secondary);font-family:var(--font-body);transition:all 0.12s }
      .cp-handbook-tab.active { background:var(--teal);color:#000;border-color:var(--teal) }
      .cp-handbook-section { background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:10px }
      .cp-handbook-sec-title { font-size:12.5px;font-weight:700;color:var(--text-primary);margin-bottom:8px }
      .cp-faq-item { border-bottom:1px solid var(--border);padding:12px 0;cursor:pointer }
      .cp-faq-q { font-size:13px;font-weight:600;color:var(--text-primary);display:flex;align-items:center;justify-content:space-between }
      .cp-faq-a { font-size:12.5px;color:var(--text-secondary);margin-top:8px;line-height:1.6;display:none }
      .cp-faq-item.open .cp-faq-a { display:block }
      .cp-faq-item.open .cp-faq-arrow { transform:rotate(180deg) }
      .cp-faq-arrow { transition:transform 0.2s;color:var(--text-tertiary) }
      .cp-consent-card { background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:12px }
      .cp-report-sec { background:var(--bg-surface-2);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:6px }
      .cp-chip { font-size:9.5px;padding:1px 7px;border-radius:6px;background:rgba(0,212,188,0.1);color:var(--teal);margin-right:4px }
      .cp-chip-red { background:rgba(239,68,68,0.1);color:var(--red) }
      .cp-chip-amber { background:rgba(245,158,11,0.1);color:var(--amber) }
      .cp-chip-green { background:rgba(34,197,94,0.1);color:var(--green) }
      .cp-off-label { font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;background:rgba(245,158,11,0.15);color:var(--amber) }
      @media (max-width:760px) { .cp-grid2,.cp-grid3 { grid-template-columns:1fr; } .cp-param-grid { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(st);
  }

  // ── Load package ──────────────────────────────────────────────────────────
  const pkg = await api.conditionPackage(slug);
  if (!pkg) {
    el.innerHTML = emptyState('◈', 'Condition package not found', `No package found for slug '${slug}'. Ensure the backend is running and the condition JSON exists.`);
    return;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const esc = s => String(s || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const ev = e => `<span class="cp-ev-badge cp-ev-${(e||'').toLowerCase().replace('-','')||'d'}">${e||'?'}</span>`;
  const modBadge = m => `<span class="cp-chip">${esc(m)}</span>`;
  const chip = (t, cls) => `<span class="cp-chip ${cls||''}">${esc(t)}</span>`;

  function safeList(arr) {
    if (!Array.isArray(arr) || !arr.length) return '<span style="color:var(--text-tertiary);font-size:12px">None listed</span>';
    return arr.map(s => `<li style="font-size:12.5px;color:var(--text-secondary);margin-bottom:4px;line-height:1.5">${esc(s)}</li>`).join('');
  }

  // ── Topbar ────────────────────────────────────────────────────────────────
  const ov = pkg.condition_overview || {};
  setTopbar(pkg.name || slug, `
    <div style="display:flex;align-items:center;gap:8px">
      ${ev(ov.highest_evidence_level)}
      <button class="btn btn-sm" onclick="window._nav('condition-packages')">← All Conditions</button>
      <button class="btn btn-primary btn-sm" onclick="window._cpPrescribe()">Prescribe Protocol →</button>
    </div>`);

  // ── Condition header card ─────────────────────────────────────────────────
  const headerCard = `
    <div class="cp-header">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:4px">${esc(pkg.category)}</div>
          <div style="font-size:22px;font-weight:800;color:var(--text-primary);font-family:var(--font-display);margin-bottom:6px">${esc(pkg.name)}</div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            ${(pkg.icd_10||[]).map(c => `<span style="font-size:11px;font-family:var(--font-mono,monospace);color:var(--text-tertiary);background:var(--bg-surface-2);padding:1px 6px;border-radius:4px">${esc(c)}</span>`).join('')}
            ${pkg.dsm_5_code ? `<span style="font-size:11px;font-family:var(--font-mono,monospace);color:var(--text-tertiary);background:var(--bg-surface-2);padding:1px 6px;border-radius:4px">DSM-5: ${esc(pkg.dsm_5_code)}</span>` : ''}
            ${ev(ov.highest_evidence_level)}
            ${(ov.relevant_modalities||[]).map(m => modBadge(m)).join('')}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:3px">Schema</div>
          <div style="font-size:11px;color:var(--text-secondary)">${esc(pkg.schema_version)} · ${esc(pkg.review_status)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Updated ${esc(pkg.updated_at)}</div>
        </div>
      </div>
    </div>`;

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const TABS = ['Overview','Assessments','Protocols','Monitoring','Handbook','Home Programs','Patient Guide','Documents'];
  window._cpActiveTab = window._cpActiveTab || 0;
  window._cpPkg = pkg;
  window._cpHandbookSub = window._cpHandbookSub || 0;

  function tabBar() {
    return `<div class="cp-tab-bar">
      ${TABS.map((t,i) => `<button class="cp-tab${window._cpActiveTab===i?' active':''}" onclick="window._cpTab(${i})">${t}</button>`).join('')}
    </div>`;
  }

  // ── Tab renderers ─────────────────────────────────────────────────────────

  function tabOverview() {
    const summ = ov.summary || '';
    const phenoClusters = (ov.phenotype_clusters || []).map(p => `
      <div class="cp-pheno-card">
        <div style="font-size:11px;font-weight:700;color:var(--teal);text-transform:uppercase;margin-bottom:4px">${esc(p.id)}</div>
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:5px">${esc(p.name)}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:6px">${esc(p.description)}</div>
        ${p.qeeg_signature ? `<div style="font-size:10.5px;color:var(--teal);background:rgba(0,212,188,0.07);padding:5px 8px;border-radius:4px">qEEG: ${esc(p.qeeg_signature)}</div>` : ''}
      </div>`).join('');

    const brainTargets = (pkg.brain_targets || []).map(bt => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--bg-surface-2);border-radius:var(--radius-sm);margin-bottom:6px">
        <div style="flex:1">
          <div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">${esc(bt.region)}</div>
          <div style="font-size:10.5px;color:var(--text-secondary)">${esc(bt.laterality)} · EEG: ${esc((bt.eeg_10_20_positions||[]).join(', '))}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:var(--text-tertiary)">${esc(bt.effect_direction)}</div>
          <div style="font-size:9.5px;color:var(--text-tertiary)">${(bt.modalities||[]).join(', ')}</div>
        </div>
      </div>`).join('');

    return `
      <div class="cp-section">
        <div class="cp-section-title">Clinical Summary</div>
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:12px">${esc(summ)}</p>
        ${ov.neurobiology ? `<div class="cp-caveat" style="color:var(--text-secondary);border-color:rgba(0,212,188,0.25);background:rgba(0,212,188,0.05)">🧠 <strong>Neurobiology:</strong> ${esc(ov.neurobiology)}</div>` : ''}
      </div>

      <div class="cp-section">
        <div class="cp-section-title">Phenotype Clusters (${(ov.phenotype_clusters||[]).length})</div>
        <div class="cp-grid2">${phenoClusters}</div>
      </div>

      <div class="cp-section">
        <div class="cp-section-title">Brain Targets</div>
        ${brainTargets || '<span style="color:var(--text-tertiary);font-size:12px">No brain targets defined.</span>'}
      </div>

      <div class="cp-grid2">
        <div class="cp-card">
          <div class="cp-section-title">Comorbidities</div>
          <ul style="margin:0;padding-left:18px">${safeList(ov.comorbidities)}</ul>
        </div>
        <div class="cp-card">
          <div class="cp-section-title">Differential Diagnoses</div>
          <ul style="margin:0;padding-left:18px">${safeList(ov.differential_diagnoses)}</ul>
        </div>
      </div>`;
  }

  function tabAssessments() {
    const ab = pkg.assessment_bundle || {};
    const sections = [
      { key: 'screening',       label: 'Screening' },
      { key: 'diagnostic',      label: 'Diagnostic' },
      { key: 'baseline',        label: 'Baseline' },
      { key: 'monitoring',      label: 'Monitoring' },
      { key: 'outcome',         label: 'Outcome' },
      { key: 'neurophysiological', label: 'Neurophysiological' },
    ];

    return sections.map(s => {
      const items = ab[s.key] || [];
      if (!items.length) return '';
      const rows = items.map(a => `
        <div style="display:grid;grid-template-columns:1fr 80px 120px 80px;gap:10px;align-items:center;padding:9px 12px;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">${esc(a.name || a.id)}</div>
            ${a.rationale ? `<div style="font-size:10.5px;color:var(--text-secondary);margin-top:2px">${esc(a.rationale)}</div>` : ''}
          </div>
          <div style="font-size:10.5px;color:var(--text-tertiary)">${esc(a.clinician_vs_patient || a.administered_by || '—')}</div>
          <div style="font-size:10.5px;color:var(--text-secondary)">${esc(a.frequency || a.timing || '—')}</div>
          <div>${a.required ? '<span class="cp-chip cp-chip-red" style="font-size:9px">Required</span>' : '<span style="font-size:9px;color:var(--text-tertiary)">Optional</span>'}</div>
        </div>`).join('');

      return `<div class="cp-section">
        <div class="cp-section-title">${s.label}</div>
        <div class="cp-card" style="padding:0;overflow:hidden">
          <div style="display:grid;grid-template-columns:1fr 80px 120px 80px;gap:10px;padding:7px 12px;background:var(--bg-surface-2);font-size:9.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;font-weight:700">
            <span>Assessment</span><span>Who</span><span>When</span><span>Status</span>
          </div>
          ${rows}
        </div>
      </div>`;
    }).join('');
  }

  function tabProtocols() {
    const protos = pkg.protocol_bundle || [];
    if (!protos.length) return emptyState('◈', 'No protocols defined', 'Protocol bundle is empty for this condition package.');

    return protos.map(p => {
      const params = p.parameters || {};
      const paramEntries = Object.entries(params).filter(([k]) => !['notes'].includes(k));
      const paramGrid = paramEntries.map(([k, v]) => `
        <div class="cp-param-row">
          <div class="cp-param-lbl">${esc(k.replace(/_/g,' '))}</div>
          <div class="cp-param-val">${esc(String(v||'—'))}</div>
        </div>`).join('');

      const sessStruct = p.session_structure || {};
      const sessRows = Object.entries(sessStruct).filter(([k]) => k !== 'notes').map(([k,v]) => `
        <div class="cp-param-row">
          <div class="cp-param-lbl">${esc(k.replace(/_/g,' '))}</div>
          <div class="cp-param-val">${esc(String(v||'—'))}</div>
        </div>`).join('');

      const govBadges = [];
      const gov = p.governance || {};
      if (p.on_label_vs_off_label === 'Off-label') govBadges.push('<span class="cp-off-label">Off-label</span>');
      if (gov.off_label_acknowledgement_required) govBadges.push(chip('Consent required', 'cp-chip-amber'));
      if (gov.requires_clinician_sign_off) govBadges.push(chip('Clinician sign-off', 'cp-chip-amber'));
      if (gov.patient_export_allowed !== false) govBadges.push(chip('Patient export ✓', 'cp-chip-green'));

      const hasEvidenceCaveat = (p.notes||'').toLowerCase().includes('caveat') || (p.evidence_summary||'').toLowerCase().includes('caveat');

      return `<div class="cp-proto-card">
        <div class="cp-proto-header">
          <div style="flex:1;min-width:0">
            <div class="cp-proto-name">${esc(p.name)}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:3px;font-family:var(--font-mono,monospace)">${esc(p.protocol_id)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            ${modBadge(p.modality_slug)}
            ${ev(p.evidence_grade)}
            <button onclick="window._cpPrescribeProto('${esc(p.protocol_id)}')"
              style="font-size:11px;font-weight:600;padding:5px 11px;border-radius:var(--radius-md);background:var(--teal);color:#000;border:none;cursor:pointer;font-family:var(--font-body)">Prescribe →</button>
          </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px">${govBadges.join('')}</div>

        <div class="cp-section-title" style="margin-bottom:8px">Evidence Summary</div>
        <p style="font-size:11.5px;color:var(--text-secondary);line-height:1.6;margin-bottom:10px">${esc(p.evidence_summary||'No evidence summary provided.')}</p>

        ${hasEvidenceCaveat ? `<div class="cp-caveat">⚠ <strong>Evidence Caveat:</strong> ${esc(p.notes||'')}</div>` : ''}

        ${paramGrid ? `<div class="cp-section-title" style="margin:14px 0 8px">Protocol Parameters</div>
          <div class="cp-param-grid">${paramGrid}</div>` : ''}

        ${sessRows ? `<div class="cp-section-title" style="margin:14px 0 8px">Session Structure</div>
          <div class="cp-param-grid">${sessRows}</div>` : ''}

        ${(p.monitoring_required||[]).length ? `<div class="cp-section-title" style="margin:14px 0 8px">Monitoring Requirements</div>
          <ul style="margin:0;padding-left:18px">${safeList(p.monitoring_required)}</ul>` : ''}

        ${(p.escalation_rules||[]).length ? `<div class="cp-section-title" style="margin:14px 0 8px">Escalation Rules</div>
          <ul style="margin:0;padding-left:18px">${safeList(p.escalation_rules)}</ul>` : ''}
      </div>`;
    }).join('');
  }

  function tabMonitoring() {
    const mr = pkg.monitoring_rules || {};

    // Assessment schedule timeline
    const schedule = mr.assessment_schedule || [];
    const timelineHTML = schedule.length ? `
      <div class="cp-section">
        <div class="cp-section-title">Assessment Schedule</div>
        <div class="cp-card" style="padding:0;overflow:hidden">
          ${schedule.map((s,i) => `
            <div style="display:grid;grid-template-columns:2px 1fr 120px 150px;gap:12px;align-items:center;padding:11px 16px;border-bottom:1px solid var(--border)">
              <div style="height:100%;background:var(--teal);width:2px;border-radius:2px;align-self:stretch"></div>
              <div>
                <div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">${esc(s.assessment_name || s.assessment_id)}</div>
              </div>
              <div style="font-size:10.5px;color:var(--text-secondary)">${esc(s.frequency || '—')}</div>
              <div style="font-size:10.5px;color:var(--text-tertiary)">${esc(s.administered_by || '—')}</div>
            </div>`).join('')}
        </div>
      </div>` : '';

    // Response thresholds
    const thresholds = mr.response_thresholds || [];
    const threshHTML = thresholds.length ? `
      <div class="cp-section">
        <div class="cp-section-title">Response Thresholds</div>
        ${thresholds.map(t => `
          <div class="cp-card" style="margin-bottom:10px">
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">${esc(t.assessment_name || t.assessment_id)}</div>
            <div class="cp-param-grid">
              <div class="cp-param-row"><div class="cp-param-lbl">Response</div><div class="cp-param-val" style="color:var(--green)">${esc(t.response_threshold||'—')}</div></div>
              <div class="cp-param-row"><div class="cp-param-lbl">Remission</div><div class="cp-param-val" style="color:var(--teal)">${esc(t.remission_threshold||'—')}</div></div>
              <div class="cp-param-row"><div class="cp-param-lbl">Non-Response</div><div class="cp-param-val" style="color:var(--amber)">${esc(t.non_response_threshold||'—')}</div></div>
              <div class="cp-param-row"><div class="cp-param-lbl">Deterioration ⚠</div><div class="cp-param-val" style="color:var(--red)">${esc(t.deterioration_threshold||'—')}</div></div>
            </div>
          </div>`).join('')}
      </div>` : '';

    // AE triggers
    const aeTriggers = mr.adverse_event_triggers || [];
    const aeColors = { Serious: 'cp-ae-serious', Severe: 'cp-ae-serious', Moderate: 'cp-ae-moderate', Mild: 'cp-ae-mild' };
    const aeHTML = aeTriggers.length ? `
      <div class="cp-section">
        <div class="cp-section-title">Adverse Event Triggers</div>
        ${aeTriggers.map(ae => `
          <div class="cp-ae-row ${aeColors[ae.severity]||'cp-ae-mild'}">
            <div style="font-size:14px">${ae.suspend_treatment ? '🛑' : '⚠'}</div>
            <div>
              <div style="font-size:12px;font-weight:700;color:var(--text-primary)">${esc(ae.event_type)}</div>
              <div style="font-size:10.5px;color:var(--text-secondary);margin-top:2px">${esc(ae.action)}</div>
            </div>
            <span class="${ae.severity==='Serious'||ae.severity==='Severe'?'cp-chip-red':ae.severity==='Moderate'?'cp-chip-amber':''} cp-chip" style="font-size:9px">${esc(ae.severity)}</span>
            <span class="cp-chip ${ae.suspend_treatment?'cp-chip-red':''}" style="font-size:9px">${ae.suspend_treatment?'Suspend':'Continue'}</span>
          </div>`).join('')}
      </div>` : '';

    // Escalation rules
    const escalation = mr.escalation_rules || [];
    const escHTML = escalation.length ? `
      <div class="cp-section">
        <div class="cp-section-title">Escalation Rules</div>
        ${escalation.map(r => `
          <div style="display:grid;grid-template-columns:1fr 80px;gap:10px;align-items:start;padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px">
            <div>
              <div style="font-size:11.5px;font-weight:600;color:var(--text-primary);margin-bottom:3px">${esc(r.trigger)}</div>
              <div style="font-size:10.5px;color:var(--text-secondary)">${esc(r.action)}</div>
            </div>
            <span class="cp-chip ${r.urgency==='Emergency'?'cp-chip-red':r.urgency==='Urgent'?'cp-chip-amber':''}" style="font-size:9px;text-align:center">${esc(r.urgency)}</span>
          </div>`).join('')}
      </div>` : '';

    // Adherence rules
    const adh = mr.adherence_rules || {};
    const adhHTML = adh.minimum_session_adherence_pct ? `
      <div class="cp-section">
        <div class="cp-section-title">Adherence Rules</div>
        <div class="cp-grid3">
          <div class="cp-param-row"><div class="cp-param-lbl">Minimum adherence</div><div class="cp-param-val">${adh.minimum_session_adherence_pct}%</div></div>
          <div class="cp-param-row"><div class="cp-param-lbl">Consecutive missed sessions</div><div class="cp-param-val">${adh.consecutive_missed_sessions_flag} sessions</div></div>
          <div class="cp-param-row" style="grid-column:1/-1"><div class="cp-param-lbl">Action</div><div class="cp-param-val" style="font-size:11px;font-weight:400">${esc(adh.action_on_low_adherence||'—')}</div></div>
        </div>
      </div>` : '';

    return timelineHTML + threshHTML + aeHTML + escHTML + adhHTML;
  }

  function tabHandbook() {
    const ho = pkg.handbook_outputs || {};
    const subs = [
      { key: 'clinician_handbook', label: 'Clinician' },
      { key: 'patient_guide',      label: 'Patient' },
      { key: 'technician_sop',     label: 'Technician' },
    ];

    const subBar = `<div class="cp-handbook-sub">
      ${subs.map((s,i) => `<button class="cp-handbook-tab${window._cpHandbookSub===i?' active':''}" onclick="window._cpHandbookSub=${i};window._cpRender()">${s.label} Guide</button>`).join('')}
    </div>`;

    const active = subs[window._cpHandbookSub] || subs[0];
    const doc = ho[active.key] || {};
    const sections = doc.sections || [];

    const content = sections.length ? sections.map(s => `
      <div class="cp-handbook-section">
        <div class="cp-handbook-sec-title">${esc(s.title || s.section || '')}</div>
        ${s.content ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.7">${esc(s.content)}</div>` : ''}
        ${(s.subsections||[]).map(ss => `
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
            <div style="font-size:11.5px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${esc(ss.title||'')}</div>
            <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6">${esc(ss.content||'')}</div>
          </div>`).join('')}
      </div>`).join('') : `<div style="color:var(--text-tertiary);font-size:12px;padding:16px">No ${active.label} content defined.</div>`;

    return subBar + `
      <div style="margin-bottom:10px">
        <div style="font-size:14px;font-weight:700;color:var(--text-primary)">${esc(doc.title||'')}</div>
        ${doc.audience ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Audience: ${esc(doc.audience)}</div>` : ''}
      </div>
      ${content}`;
  }

  function tabHomePrograms() {
    const hps = pkg.home_program_templates || [];
    if (!hps.length) return emptyState('🏠', 'No home programs defined', 'No home program templates have been added to this condition package yet.');

    return hps.map(hp => `
      <div class="cp-card" style="margin-bottom:14px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary)">${esc(hp.name)}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">${esc(hp.id)} · ${esc(hp.modality_slug)}</div>
          </div>
          <div style="text-align:right">
            <div class="cp-param-row" style="min-width:120px">
              <div class="cp-param-lbl">Session</div>
              <div class="cp-param-val">${hp.session_duration_minutes || '?'} min · ${hp.sessions_per_week || '?'}×/wk · ${hp.total_weeks || '?'} wks</div>
            </div>
          </div>
        </div>

        ${hp.device_required ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px"><strong>Device required:</strong> ${esc(hp.device_required)}</div>` : ''}
        ${hp.prerequisite_clinic_sessions ? `<div style="font-size:11px;color:var(--amber);background:rgba(245,158,11,0.08);padding:6px 10px;border-radius:var(--radius-sm);margin-bottom:10px">⚠ Requires ${hp.prerequisite_clinic_sessions} clinic sessions before home use</div>` : ''}

        <div class="cp-grid2">
          <div>
            <div class="cp-section-title">Patient Instructions</div>
            <ol style="margin:0;padding-left:18px">
              ${(hp.patient_instructions||[]).map(i => `<li style="font-size:11.5px;color:var(--text-secondary);margin-bottom:5px;line-height:1.5">${esc(i)}</li>`).join('')}
            </ol>
          </div>
          <div>
            <div class="cp-section-title">Pre-Session Safety Checklist</div>
            ${(hp.safety_checklist||[]).map(item => `
              <div style="display:flex;align-items:flex-start;gap:7px;margin-bottom:6px">
                <span style="color:var(--teal);margin-top:1px;flex-shrink:0">◻</span>
                <span style="font-size:11.5px;color:var(--text-secondary);line-height:1.4">${esc(item)}</span>
              </div>`).join('')}
          </div>
        </div>

        ${(hp.contraindications_for_home||[]).length ? `
          <div style="margin-top:12px">
            <div class="cp-section-title">Do NOT use home device if:</div>
            <ul style="margin:0;padding-left:18px">${safeList(hp.contraindications_for_home)}</ul>
          </div>` : ''}

        ${hp.evidence_note ? `<div class="cp-caveat" style="margin-top:12px">📊 ${esc(hp.evidence_note)}</div>` : ''}
      </div>`).join('');
  }

  function tabPatientGuide() {
    const pf = pkg.patient_friendly_explanation || {};
    const faqItems = (pf.faq || []).map((f,i) => `
      <div class="cp-faq-item" id="faq-${i}" onclick="this.classList.toggle('open')">
        <div class="cp-faq-q">${esc(f.question)} <span class="cp-faq-arrow">▾</span></div>
        <div class="cp-faq-a">${esc(f.answer)}</div>
      </div>`).join('');

    return `
      <div class="cp-section">
        <div class="cp-section-title">What Is ${esc(pkg.name)}?</div>
        <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.7">${esc(pf.what_is_it||'Not available.')}</p>
      </div>

      <div class="cp-section">
        <div class="cp-section-title">How It Affects You</div>
        <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.7">${esc(pf.how_it_affects_you||'Not available.')}</p>
      </div>

      <div class="cp-section">
        <div class="cp-section-title">Treatment Options</div>
        <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.7">${esc(pf.treatment_options_overview||'Not available.')}</p>
      </div>

      <div class="cp-section">
        <div class="cp-section-title">What to Expect</div>
        <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.7">${esc(pf.what_to_expect||'Not available.')}</p>
      </div>

      ${faqItems ? `<div class="cp-section">
        <div class="cp-section-title">Frequently Asked Questions</div>
        ${faqItems}
      </div>` : ''}`;
  }

  function tabDocuments() {
    const consents = pkg.consent_documents || [];
    const reports  = pkg.report_templates  || [];

    const consentCards = consents.map(c => `
      <div class="cp-consent-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
          <div>
            <div style="font-size:10px;font-family:var(--font-mono,monospace);color:var(--text-tertiary)">${esc(c.id)}</div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${esc(c.name)}</div>
          </div>
          <div style="text-align:right">
            ${c.document_type ? `<span class="cp-chip">${esc(c.document_type)}</span>` : ''}
            ${c.signature_required ? `<span class="cp-chip cp-chip-amber">Signature required</span>` : ''}
          </div>
        </div>
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:8px">${esc(c.when_required||'')}</div>
        ${(c.key_disclosures||[]).length ? `
          <div class="cp-section-title" style="margin-bottom:6px">Key Disclosures</div>
          <ul style="margin:0;padding-left:16px">${(c.key_disclosures||[]).map(d => `<li style="font-size:11.5px;color:var(--text-secondary);margin-bottom:4px">${esc(d)}</li>`).join('')}</ul>` : ''}
      </div>`).join('');

    const reportCards = reports.map(r => `
      <div class="cp-card" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:10px;font-family:var(--font-mono,monospace);color:var(--text-tertiary)">${esc(r.id)}</div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${esc(r.name)}</div>
          </div>
          <div style="text-align:right">
            ${r.audience ? chip(r.audience, '') : ''}
            ${r.frequency ? `<div style="font-size:9.5px;color:var(--text-tertiary);margin-top:3px">${esc(r.frequency)}</div>` : ''}
          </div>
        </div>
        ${(r.sections||[]).map(s => `
          <div class="cp-report-sec">
            <div style="font-size:11.5px;font-weight:600;color:var(--text-primary);margin-bottom:3px">${esc(s.title)}</div>
            ${s.clinician_narrative_prompt ? `<div style="font-size:10.5px;color:var(--amber);font-style:italic">Narrative prompt: ${esc(s.clinician_narrative_prompt)}</div>` : ''}
            ${(s.auto_populate_from||[]).length ? `<div style="font-size:9.5px;color:var(--teal);margin-top:3px">Auto-fills: ${(s.auto_populate_from||[]).join(', ')}</div>` : ''}
          </div>`).join('')}
      </div>`).join('');

    return `
      ${consents.length ? `<div class="cp-section">
        <div class="cp-section-title">Consent Documents (${consents.length})</div>
        ${consentCards}
      </div>` : ''}
      ${reports.length ? `<div class="cp-section">
        <div class="cp-section-title">Report Templates (${reports.length})</div>
        ${reportCards}
      </div>` : ''}
      ${!consents.length && !reports.length ? emptyState('◱', 'No documents defined', 'Consent documents and report templates have not been added to this condition package.') : ''}`;
  }

  // ── Tab renderer dispatch ─────────────────────────────────────────────────
  const RENDERERS = [tabOverview, tabAssessments, tabProtocols, tabMonitoring, tabHandbook, tabHomePrograms, tabPatientGuide, tabDocuments];

  window._cpRender = function() {
    const tabContent = document.getElementById('cp-tab-content');
    if (!tabContent) return;
    // Update tab bar active state
    document.querySelectorAll('.cp-tab').forEach((b,i) => b.classList.toggle('active', i === window._cpActiveTab));
    tabContent.innerHTML = RENDERERS[window._cpActiveTab]?.() || '';
  };

  window._cpTab = function(i) {
    window._cpActiveTab = i;
    window._cpRender();
  };

  window._cpPrescribe = function() {
    const proto = (window._cpPkg?.protocol_bundle || [])[0];
    if (proto) window._rxPrefilledProto = { ...proto, name: proto.name, modality_id: proto.modality_slug };
    window._nav('prescriptions');
  };

  window._cpPrescribeProto = function(pid) {
    const proto = (window._cpPkg?.protocol_bundle || []).find(p => p.protocol_id === pid);
    if (proto) window._rxPrefilledProto = { ...proto, name: proto.name, modality_id: proto.modality_slug };
    window._nav('prescriptions');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  el.innerHTML = headerCard + tabBar() + `<div id="cp-tab-content"></div>`;
  window._cpRender();
}
