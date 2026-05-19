//


let devicesData = DEMO_DEVICES_FALLBACK;
import { api } from './api.js';
import { currentUser } from './auth.js';
import { renderStandardsGuidelinesReferenceCard } from './standards-guidelines-reference-card.js';

/**
 * pages-device-planning.js
 * DeepSynaps Protocol Studio — Neuromodulation Device Parameter Planning + Montage Design
 *
 * Features:
 *   - Protocol table with 15 demo protocols across 6 device types
 *   - Montage diagram viewer with 4x5 electrode grid
 *   - Safety parameter panel with per-device limits
 *   - Evidence grades (A-D) on all protocols
 *   - Filterable by status: Draft, Reviewed, Approved, Archived
 *   - Interactive row selection updates montage + safety views
 *
 * Device types: tDCS, tACS, tRNS, tPCS, TMS, DCS
 * Safety limits per device class with OK / EXCEEDS LIMIT indicators
 */

const styles = `
<style>
  .dp-container { max-width: 1400px; margin: 0 auto; padding: 24px; }
  .dp-header { margin-bottom: 24px; }
  .dp-header h1 { font-size: 24px; font-weight: 700; color: var(--text-primary, #111827); margin: 0 0 4px 0; }
  .dp-header p { font-size: 13px; color: var(--text-secondary, #6b7280); margin: 0; }
  .dp-safety-banner { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; color: #92400e; display: flex; align-items: center; gap: 10px; }
  .dp-safety-banner .icon { font-size: 16px; flex-shrink: 0; }
  .dp-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .dp-kpi-card { background: var(--surface-1, #f9fafb); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 16px; transition: box-shadow .15s; }
  .dp-kpi-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
  .dp-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary, #6b7280); letter-spacing: 0.05em; margin-bottom: 6px; }
  .dp-kpi-value { font-size: 22px; font-weight: 700; color: var(--text-primary, #111827); margin-bottom: 2px; }
  .dp-kpi-sub { font-size: 11px; color: var(--text-secondary, #6b7280); }
  .dp-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
  .dp-filter-group { display: flex; gap: 6px; flex-wrap: wrap; }
  .dp-filter-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); background: var(--surface-0, #fff); font-size: 12px; font-weight: 500; color: var(--text-secondary, #6b7280); cursor: pointer; transition: all .15s; }
  .dp-filter-btn:hover { background: var(--surface-1, #f9fafb); }
  .dp-filter-btn.active { background: var(--accent, #2563eb); color: #fff; border-color: var(--accent, #2563eb); }
  .dp-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); background: var(--surface-0, #fff); font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s; display: inline-flex; align-items: center; gap: 6px; }
  .dp-btn:hover { background: var(--surface-1, #f9fafb); }
  .dp-btn-primary { background: var(--accent, #2563eb); color: #fff; border-color: var(--accent, #2563eb); }
  .dp-btn-primary:hover { background: #1d4ed8; }
  .dp-table-wrap { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; overflow-x: auto; margin-bottom: 24px; }
  .dp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .dp-table thead th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary, #6b7280); background: var(--surface-1, #f9fafb); border-bottom: 1px solid var(--border, #e5e7eb); letter-spacing: 0.03em; white-space: nowrap; }
  .dp-table tbody td { padding: 10px 12px; border-bottom: 1px solid var(--border, #e5e7eb); color: var(--text-primary, #111827); vertical-align: middle; }
  .dp-table tbody tr { cursor: pointer; transition: background .1s; }
  .dp-table tbody tr:hover { background: var(--surface-1, #f9fafb); }
  .dp-table tbody tr.selected { background: #eff6ff; outline: 1px solid #bfdbfe; }
  .dp-table tbody tr:last-child td { border-bottom: none; }
  .dp-status { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .dp-status.draft { background: #e5e7eb; color: #374151; }
  .dp-status.reviewed { background: #dbeafe; color: #1e40af; }
  .dp-status.approved { background: #dcfce7; color: #166534; }
  .dp-status.archived { background: #f3f4f6; color: #9ca3af; }
  .dp-device-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .dp-device-tdcs { background: #dbeafe; color: #1e40af; }
  .dp-device-tacs { background: #ede9fe; color: #5b21b6; }
  .dp-device-trns { background: #ccfbf1; color: #0f766e; }
  .dp-device-tpcs { background: #fef3c7; color: #92400e; }
  .dp-device-tms { background: #fce7f3; color: #9d174d; }
  .dp-device-dcs { background: #f3f4f6; color: #4b5563; }
  .dp-evidence { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
  .dp-evidence-a { background: #dcfce7; color: #166534; }
  .dp-evidence-b { background: #dbeafe; color: #1e40af; }
  .dp-evidence-c { background: #fef3c7; color: #92400e; }
  .dp-evidence-d { background: #fee2e2; color: #991b1b; }
  .dp-montage-wrap { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 20px; margin-bottom: 24px; }
  .dp-montage-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary, #111827); }
  .dp-montage-subtitle { font-size: 12px; color: var(--text-secondary, #6b7280); margin-bottom: 12px; }
  .montage-diagram { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 16px; background: var(--surface-1, #f9fafb); border-radius: 8px; max-width: 320px; margin: 0 auto; }
  .electrode-pad { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; cursor: pointer; transition: transform .15s; }
  .electrode-pad:hover { transform: scale(1.15); }
  .electrode-anode { background: #dcfce7; border: 2px solid #166534; color: #166534; }
  .electrode-cathode { background: #fee2e2; border: 2px solid #991b1b; color: #991b1b; }
  .electrode-inactive { background: #e5e7eb; border: 2px dashed #9ca3af; color: #9ca3af; }
  .electrode-coil { background: #fce7f3; border: 2px solid #9d174d; color: #9d174d; border-radius: 8px; width: 44px; height: 44px; }
  .electrode-epidural { background: #f3f4f6; border: 2px solid #4b5563; color: #4b5563; border-radius: 6px; width: 44px; height: 30px; }
  .dp-safety-panel { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .dp-safety-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary, #111827); }
  .dp-safety-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .dp-safety-item { padding: 12px; background: var(--surface-1, #f9fafb); border-radius: 8px; }
  .dp-safety-label { font-size: 11px; font-weight: 600; color: var(--text-secondary, #6b7280); margin-bottom: 4px; }
  .dp-safety-value { font-size: 14px; font-weight: 700; color: var(--text-primary, #111827); }
  .dp-safety-limit { font-size: 11px; color: #dc2626; font-weight: 600; margin-top: 2px; }
  .dp-safety-ok { color: #16a34a; }
  .dp-safety-note { font-size: 11px; color: var(--text-secondary, #6b7280); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border, #e5e7eb); }
  .dp-col2 { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
  .dp-target-tag { font-size: 11px; font-weight: 500; color: #4b5563; }
  .dp-intensity-val { font-family: monospace; font-size: 12px; }
  .dp-evidence-legend { display: flex; gap: 12px; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border, #e5e7eb); }
  .dp-evidence-legend-item { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-secondary, #6b7280); }
  .dp-footer-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: 11px; color: var(--text-secondary, #6b7280); }
  @media (max-width: 1024px) {
    .dp-kpi-row { grid-template-columns: repeat(2, 1fr); }
    .dp-col2 { grid-template-columns: 1fr; }
    .dp-safety-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 640px) {
    .dp-kpi-row { grid-template-columns: 1fr; }
    .dp-safety-grid { grid-template-columns: 1fr; }
  }
</style>
`;

/**
 * Protocol dataset — 15 protocols across 6 device types.
 * Evidence grades: A=meta-analysis, B=RCT, C=observational, D=case-report
 */
const DEMO_PROTOCOLS = [
  { id: 1, name: 'M1-SOHD', device: 'tDCS', montage: 'M1-SOHD', anode: 'C3', cathode: 'FP2', intensity: 1.5, duration: 20, frequency: 'DC', target: 'Left M1', evidence: 'A', status: 'approved', rampUp: 15, rampDown: 15, sham: false },
  { id: 2, name: 'DLPFC-Bifrontal', device: 'tDCS', montage: 'F3-F4', anode: 'F3', cathode: 'F4', intensity: 2.0, duration: 20, frequency: 'DC', target: 'Bilateral DLPFC', evidence: 'A', status: 'approved', rampUp: 30, rampDown: 30, sham: true },
  { id: 3, name: 'tACS-Alpha', device: 'tACS', montage: 'O1-O2', anode: 'O1', cathode: 'O2', intensity: 1.0, duration: 10, frequency: '10 Hz', target: 'Visual Cortex', evidence: 'B', status: 'reviewed', rampUp: 10, rampDown: 10, sham: false },
  { id: 4, name: 'tRNS-M1', device: 'tRNS', montage: 'C3-FP2', anode: 'C3', cathode: 'FP2', intensity: 1.5, duration: 15, frequency: '100-640 Hz', target: 'Left M1', evidence: 'B', status: 'reviewed', rampUp: 15, rampDown: 15, sham: false },
  { id: 5, name: 'tPCS-Prefrontal', device: 'tPCS', montage: 'F3-F4', anode: 'F3', cathode: 'F4', intensity: 0.5, duration: 20, frequency: '0.5 Hz', target: 'L DLPFC', evidence: 'C', status: 'draft', rampUp: 60, rampDown: 60, sham: false },
  { id: 6, name: 'rTMS-DLPFC', device: 'TMS', montage: 'Coil-F3', anode: 'N/A', cathode: 'N/A', intensity: 80, duration: 10, frequency: '10 Hz', target: 'L DLPFC', evidence: 'A', status: 'approved', rampUp: 0, rampDown: 0, sham: false },
  { id: 7, name: 'tDCS-Cerebellar', device: 'tDCS', montage: 'CB-LA', anode: 'CB1', cathode: 'F3', intensity: 2.0, duration: 20, frequency: 'DC', target: 'Cerebellum', evidence: 'B', status: 'reviewed', rampUp: 30, rampDown: 30, sham: false },
  { id: 8, name: 'DCS-Epidural', device: 'DCS', montage: 'E1-E2', anode: 'E1', cathode: 'E2', intensity: 4.0, duration: 60, frequency: 'DC', target: 'Motor Strip', evidence: 'C', status: 'draft', rampUp: 60, rampDown: 60, sham: false },
  { id: 9, name: 'tACS-Gamma', device: 'tACS', montage: 'F7-F8', anode: 'F7', cathode: 'F8', intensity: 1.0, duration: 20, frequency: '40 Hz', target: 'IFG', evidence: 'C', status: 'draft', rampUp: 15, rampDown: 15, sham: false },
  { id: 10, name: 'tDCS-Temporal', device: 'tDCS', montage: 'T7-FP2', anode: 'T7', cathode: 'FP2', intensity: 1.0, duration: 20, frequency: 'DC', target: 'L STG', evidence: 'B', status: 'reviewed', rampUp: 30, rampDown: 30, sham: false },
  { id: 11, name: 'rTMS-SMA', device: 'TMS', montage: 'Coil-Fz', anode: 'N/A', cathode: 'N/A', intensity: 90, duration: 5, frequency: '5 Hz', target: 'SMA', evidence: 'A', status: 'approved', rampUp: 0, rampDown: 0, sham: true },
  { id: 12, name: 'tDCS-Parietal', device: 'tDCS', montage: 'P3-FP2', anode: 'P3', cathode: 'FP2', intensity: 1.5, duration: 20, frequency: 'DC', target: 'L PPC', evidence: 'C', status: 'archived', rampUp: 15, rampDown: 15, sham: false },
  { id: 13, name: 'tACS-Theta', device: 'tACS', montage: 'Fz-Oz', anode: 'Fz', cathode: 'Oz', intensity: 1.0, duration: 15, frequency: '6 Hz', target: 'Frontal', evidence: 'B', status: 'reviewed', rampUp: 10, rampDown: 10, sham: false },
  { id: 14, name: 'rTMS-Occipital', device: 'TMS', montage: 'Coil-Oz', anode: 'N/A', cathode: 'N/A', intensity: 70, duration: 5, frequency: '1 Hz', target: 'V1', evidence: 'B', status: 'reviewed', rampUp: 0, rampDown: 0, sham: false },
  { id: 15, name: 'tRNS-DLPFC', device: 'tRNS', montage: 'F3-F4', anode: 'F3', cathode: 'F4', intensity: 1.0, duration: 20, frequency: '100-640 Hz', target: 'Bilateral DLPFC', evidence: 'B', status: 'reviewed', rampUp: 15, rampDown: 15, sham: true }
];

/** Return CSS class for device badge coloring. */
function getDeviceClass(d) {
  const map = { tDCS: 'dp-device-tdcs', tACS: 'dp-device-tacs', tRNS: 'dp-device-trns', tPCS: 'dp-device-tpcs', TMS: 'dp-device-tms', DCS: 'dp-device-dcs' };
  return map[d] || 'dp-device-tdcs';
}

/** Return CSS class for evidence grade badge. */
function getEvidenceClass(e) { return `dp-evidence-${e.toLowerCase()}`; }

/** Return CSS class for status pill. */
function getStatusClass(s) { return `dp-status ${s}`; }

/**
 * Render protocol table rows, filtered by status.
 * @param {string} filter — 'all' | 'draft' | 'reviewed' | 'approved' | 'archived'
 */
function renderTable(filter) {
  let data = protocols;
  if (filter !== 'all') data = protocols.filter(p => p.status === filter);
  return data.map(p => `
    <tr data-id="${p.id}">
      <td><strong>${p.name}</strong></td>
      <td><span class="dp-device-badge ${getDeviceClass(p.device)}">${p.device}</span></td>
      <td>${p.montage}</td>
      <td class="dp-intensity-val">${p.intensity} ${p.device === 'TMS' ? '% MSO' : 'mA'}</td>
      <td>${p.duration} min</td>
      <td>${p.frequency}</td>
      <td class="dp-target-tag">${p.target}</td>
      <td><span class="dp-evidence ${getEvidenceClass(p.evidence)}">Grade ${p.evidence}</span></td>
      <td><span class="${getStatusClass(p.status)}">${p.status}</span></td>
    </tr>
  `).join('');
}

/**
 * Render 4x5 electrode montage diagram.
 * TMS devices show coil icon, DCS shows epidural strip.
 */
function renderMontage(protocol) {
  if (protocol.device === 'TMS') {
    return `
      <div style="grid-column: 1 / -1; text-align: center; padding: 20px;">
        <div class="electrode-pad electrode-coil" style="margin: 0 auto;" title="TMS Coil ${protocol.target}">Coil</div>
        <div style="margin-top: 8px; font-size: 11px; color: var(--text-secondary, #6b7280);">${protocol.target} — ${protocol.frequency}</div>
        <div style="font-size: 11px; color: #9d174d; font-weight: 600;">${protocol.intensity}% MSO</div>
      </div>
    `;
  }
  if (protocol.device === 'DCS') {
    return `
      <div style="grid-column: 1 / -1; text-align: center; padding: 20px;">
        <div class="electrode-pad electrode-epidural" style="margin: 0 auto;" title="Epidural ${protocol.target}">E1-E2</div>
        <div style="margin-top: 8px; font-size: 11px; color: var(--text-secondary, #6b7280);">${protocol.target} — Epidural</div>
        <div style="font-size: 11px; color: #4b5563; font-weight: 600;">${protocol.intensity} mA / ${protocol.duration} min</div>
      </div>
    `;
  }
  const positions = [
    { label: 'FP1', name: 'Fp1' }, { label: 'FPz', name: 'Fpz' }, { label: 'FP2', name: 'Fp2' }, { label: 'AFz', name: 'AFz' },
    { label: 'F7', name: 'F7' },  { label: 'F3', name: 'F3' },  { label: 'Fz', name: 'Fz' },  { label: 'F4', name: 'F4' },
    { label: 'T7', name: 'T7' },  { label: 'C3', name: 'C3' },  { label: 'Cz', name: 'Cz' },  { label: 'C4', name: 'C4' },
    { label: 'P3', name: 'P3' },  { label: 'Pz', name: 'Pz' },  { label: 'P4', name: 'P4' },  { label: 'T8', name: 'T8' },
    { label: 'O1', name: 'O1' },  { label: 'CB1', name: 'CB1' }, { label: 'CB2', name: 'CB2' }, { label: 'O2', name: 'O2' }
  ];
  return positions.map(pos => {
    const isAnode = pos.label === protocol.anode;
    const isCathode = pos.label === protocol.cathode;
    if (isAnode) return `<div class="electrode-pad electrode-anode" title="Anode ${pos.name}">A</div>`;
    if (isCathode) return `<div class="electrode-pad electrode-cathode" title="Cathode ${pos.name}">C</div>`;
    return `<div class="electrode-pad electrode-inactive">${pos.name}</div>`;
  }).join('');
}

/**
 * Safety limit check for a given protocol.
 * Returns per-parameter verdicts (ok / exceeds).
 */
function checkSafety(protocol) {
  const limits = {
    tDCS:   { current: 2.0, duration: 30, rampMin: 10, rampMax: 60 },
    tACS:   { current: 2.0, duration: 30, rampMin: 10, rampMax: 60 },
    tRNS:   { current: 2.0, duration: 30, rampMin: 10, rampMax: 60 },
    tPCS:   { current: 2.0, duration: 30, rampMin: 30, rampMax: 120 },
    TMS:    { current: 100, duration: 20, rampMin: 0, rampMax: 0 },
    DCS:    { current: 4.0, duration: 60, rampMin: 30, rampMax: 120 }
  };
  const limit = limits[protocol.device] || limits.tDCS;
  const currentOk = protocol.intensity <= limit.current;
  const durationOk = protocol.duration <= limit.duration;
  const rampUpOk = protocol.rampUp >= limit.rampMin && protocol.rampUp <= limit.rampMax;
  return { currentOk, durationOk, rampUpOk, limit };
}

/**
 * Main entry point — Device Parameter Planning page.
 * @param {Function} setTopbar — callback to configure top navigation
 * @param {Function} navigate — callback for page navigation
 */
export async function pgDevicePlanning(setTopbar, navigate) {
  if (typeof setTopbar === 'function') {
    setTopbar('Device Parameter Planning', [
      { label: 'Dashboard', action: () => navigate && navigate('dashboard') },
      { label: 'Sessions', action: () => navigate && navigate('session-planning') },
      { label: 'Targets', action: () => navigate && navigate('stimulation-targets') },
      { label: 'Surgical', action: () => navigate && navigate('surgical-planning') }
    ]);
  }

  // Try API first, fall back to demo data
  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';
  let protocols = DEMO_PROTOCOLS;
  try {
    const resp = await api.getDeviceProtocols(clinicId);
    if (resp && resp.length > 0) { protocols = resp; }
    else if (resp && resp.items && resp.items.length > 0) { protocols = resp.items; }
  } catch (err) {
    console.warn('[DevicePlanning] API error:', err.message);
    protocols = DEMO_PROTOCOLS;
  }

  let activeFilter = 'all';
  let selectedProtocol = protocols[0];
  let standardsInventory = null;
  let standardsSearch = null;

  const container = document.createElement('div');
  container.className = 'dp-container';

  function buildHTML() {
    const approved = protocols.filter(p => p.status === 'approved').length;
    const total = protocols.length;
    const safetyChecks = protocols.filter(p => {
      const s = checkSafety(p);
      return s.currentOk && s.durationOk && s.rampUpOk;
    }).length;
    const pending = protocols.filter(p => p.status === 'reviewed' || p.status === 'draft').length;
    const safety = checkSafety(selectedProtocol);
    const standardsPanel = standardsInventory
      ? renderStandardsGuidelinesReferenceCard(standardsInventory, standardsSearch)
      : '<div class="dp-safety-panel"><div class="dp-safety-title">Standards &amp; guidelines references</div><div class="dp-safety-note">Loading compliance-awareness references…</div></div>';

    container.innerHTML = styles + `
      <div class="dp-header">
        <h1>Device Parameter Planning</h1>
        <p>Configure neuromodulation protocols, montages, and safety parameters</p>
      </div>

      <div class="dp-safety-banner">
        <span class="icon">&#9888;</span>
        <span>Device parameters must stay within published safety limits — review evidence before application. tDCS current limit: 2 mA max.</span>
      </div>

      ${standardsPanel}

      <div class="dp-kpi-row">
        <div class="dp-kpi-card">
          <div class="dp-kpi-label">Protocols Planned</div>
          <div class="dp-kpi-value">${total}</div>
          <div class="dp-kpi-sub">${approved} approved</div>
        </div>
        <div class="dp-kpi-card">
          <div class="dp-kpi-label">Devices Configured</div>
          <div class="dp-kpi-value">6</div>
          <div class="dp-kpi-sub">tDCS, tACS, tRNS, tPCS, TMS, DCS</div>
        </div>
        <div class="dp-kpi-card">
          <div class="dp-kpi-label">Safety Checks Passed</div>
          <div class="dp-kpi-value">${safetyChecks}/${total}</div>
          <div class="dp-kpi-sub">Within published limits</div>
        </div>
        <div class="dp-kpi-card">
          <div class="dp-kpi-label">Pending Review</div>
          <div class="dp-kpi-value">${pending}</div>
          <div class="dp-kpi-sub">Draft + reviewed status</div>
        </div>
      </div>

      <div class="dp-toolbar">
        <div class="dp-filter-group">
          <button class="dp-filter-btn ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${total})</button>
          <button class="dp-filter-btn ${activeFilter === 'draft' ? 'active' : ''}" data-filter="draft">Draft (${protocols.filter(p=>p.status==='draft').length})</button>
          <button class="dp-filter-btn ${activeFilter === 'reviewed' ? 'active' : ''}" data-filter="reviewed">Reviewed (${protocols.filter(p=>p.status==='reviewed').length})</button>
          <button class="dp-filter-btn ${activeFilter === 'approved' ? 'active' : ''}" data-filter="approved">Approved (${protocols.filter(p=>p.status==='approved').length})</button>
          <button class="dp-filter-btn ${activeFilter === 'archived' ? 'active' : ''}" data-filter="archived">Archived (${protocols.filter(p=>p.status==='archived').length})</button>
        </div>
        <div>
          <button class="dp-btn dp-btn-primary">+ New Protocol</button>
          <button class="dp-btn">Export CSV</button>
        </div>
      </div>

      <div class="dp-col2">
        <div class="dp-table-wrap">
          <table class="dp-table">
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Device</th>
                <th>Montage</th>
                <th>Intensity</th>
                <th>Duration</th>
                <th>Frequency</th>
                <th>Target</th>
                <th>Evidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${renderTable(activeFilter)}
            </tbody>
          </table>
          <div class="dp-footer-bar">
            <span>Showing ${protocols.filter(p => activeFilter === 'all' || p.status === activeFilter).length} protocols</span>
            <span>Last updated: ${new Date().toLocaleDateString()}</span>
          </div>
        </div>

        <div>
          <div class="dp-montage-wrap">
            <div class="dp-montage-title">Montage Viewer — ${selectedProtocol.name}</div>
            <div class="dp-montage-subtitle">${selectedProtocol.device} | ${selectedProtocol.montage} | ${selectedProtocol.target}</div>
            <div class="montage-diagram">
              ${renderMontage(selectedProtocol)}
            </div>
            <div style="margin-top:12px;font-size:11px;color:var(--text-secondary);">
              <span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;"><span style="width:10px;height:10px;border-radius:50%;background:#dcfce7;border:2px solid #166534;display:inline-block;"></span> Anode</span>
              <span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;"><span style="width:10px;height:10px;border-radius:50%;background:#fee2e2;border:2px solid #991b1b;display:inline-block;"></span> Cathode</span>
              <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:50%;background:#e5e7eb;border:2px dashed #9ca3af;display:inline-block;"></span> Inactive</span>
            </div>
          </div>

          <div class="dp-safety-panel">
            <div class="dp-safety-title">Safety Parameters — ${selectedProtocol.device}</div>
            <div class="dp-safety-grid">
              <div class="dp-safety-item">
                <div class="dp-safety-label">Current Limit</div>
                <div class="dp-safety-value">${selectedProtocol.device === 'TMS' ? '100% MSO' : selectedProtocol.device === 'DCS' ? '4.0 mA' : '2.0 mA'}</div>
                <div class="dp-safety-limit ${safety.currentOk ? 'dp-safety-ok' : ''}">${safety.currentOk ? 'OK — within limit' : 'EXCEEDS LIMIT'}</div>
              </div>
              <div class="dp-safety-item">
                <div class="dp-safety-label">Session Limit</div>
                <div class="dp-safety-value">${selectedProtocol.device === 'DCS' ? '60 min' : '30 min'}</div>
                <div class="dp-safety-limit ${safety.durationOk ? 'dp-safety-ok' : ''}">${safety.durationOk ? 'OK — within limit' : 'EXCEEDS LIMIT'}</div>
              </div>
              <div class="dp-safety-item">
                <div class="dp-safety-label">Ramp Up / Down</div>
                <div class="dp-safety-value">${selectedProtocol.rampUp}s / ${selectedProtocol.rampDown}s</div>
                <div class="dp-safety-limit ${safety.rampUpOk ? 'dp-safety-ok' : ''}">${safety.rampUpOk ? 'OK' : 'OUT OF RANGE'}</div>
              </div>
              <div class="dp-safety-item">
                <div class="dp-safety-label">Impedance Check</div>
                <div class="dp-safety-value">&lt; 10 k&#x2126;</div>
                <div class="dp-safety-limit dp-safety-ok">Required before session</div>
              </div>
              <div class="dp-safety-item">
                <div class="dp-safety-label">Sham Available</div>
                <div class="dp-safety-value">${selectedProtocol.sham ? 'Yes' : 'No'}</div>
                <div class="dp-safety-limit" style="color:${selectedProtocol.sham ? '#16a34a' : '#92400e'};">${selectedProtocol.sham ? 'Protocol supports' : 'Not configured'}</div>
              </div>
              <div class="dp-safety-item">
                <div class="dp-safety-label">Evidence Grade</div>
                <div class="dp-safety-value"><span class="dp-evidence ${getEvidenceClass(selectedProtocol.evidence)}">Grade ${selectedProtocol.evidence}</span></div>
                <div class="dp-safety-note">${selectedProtocol.evidence === 'A' ? 'Meta-analysis supported' : selectedProtocol.evidence === 'B' ? 'RCT evidence' : 'Observational / limited'}</div>
              </div>
            </div>
          </div>

          <div class="dp-montage-wrap">
            <div class="dp-montage-title">Evidence Legend</div>
            <div class="dp-evidence-legend">
              <span class="dp-evidence-legend-item"><span class="dp-evidence dp-evidence-a">A</span> Meta-analysis</span>
              <span class="dp-evidence-legend-item"><span class="dp-evidence dp-evidence-b">B</span> RCT</span>
              <span class="dp-evidence-legend-item"><span class="dp-evidence dp-evidence-c">C</span> Observational</span>
              <span class="dp-evidence-legend-item"><span class="dp-evidence dp-evidence-d">D</span> Case report</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  buildHTML();

  Promise.all([
    typeof api?.standardsGuidelinesSources === 'function' ? api.standardsGuidelinesSources() : Promise.resolve(null),
    typeof api?.standardsGuidelinesSearch === 'function'
      ? api.standardsGuidelinesSearch({
          query: 'device governance review',
          modality: 'TMS',
          device_type: 'medical-device',
          jurisdiction: 'international',
        })
      : Promise.resolve(null),
  ]).then(([inventory, search]) => {
    standardsInventory = inventory;
    standardsSearch = search;
    buildHTML();
  }).catch(() => {});

  // Event delegation for filter buttons and row selection
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.dp-filter-btn');
    if (btn) {
      activeFilter = btn.dataset.filter;
      buildHTML();
      return;
    }
    const row = e.target.closest('.dp-table tbody tr');
    if (row) {
      const id = parseInt(row.dataset.id);
      const found = protocols.find(p => p.id === id);
      if (found) { selectedProtocol = found; buildHTML(); }
    }
  });

  return container;
}

export default { pgDevicePlanning };
