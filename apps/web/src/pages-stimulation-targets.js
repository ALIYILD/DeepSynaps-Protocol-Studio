/**
 * pages-stimulation-targets.js
 * DeepSynaps Protocol Studio — Brain Stimulation Target Atlas + Coordinate Selection
 *
 * Features:
 *   - 15 stimulation targets across 8 brain region categories
 *   - MNI coordinate display with precision indicator per target
 *   - Evidence grades (A=meta-analysis, B=RCT, C=observational)
 *   - Hemisphere indicator (Left/Right/Bilateral)
 *   - Focality badge (Focal vs Broad)
 *   - Interactive target selection with detail panel
 *   - Filterable: All, High Evidence, Custom, Focal, Bilateral
 *   - Safety reminder about individual MRI verification
 *
 * Brain regions: Motor cortex, DLPFC, SMA, Cerebellum, Temporal, Parietal, Occipital, Insula
 */

const styles = `
<style>
  .st-container { max-width: 1400px; margin: 0 auto; padding: 24px; }
  .st-header { margin-bottom: 24px; }
  .st-header h1 { font-size: 24px; font-weight: 700; color: var(--text-primary, #111827); margin: 0 0 4px 0; }
  .st-header p { font-size: 13px; color: var(--text-secondary, #6b7280); margin: 0; }
  .st-safety-banner { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; color: #92400e; display: flex; align-items: center; gap: 10px; }
  .st-safety-banner .icon { font-size: 16px; flex-shrink: 0; }
  .st-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .st-kpi-card { background: var(--surface-1, #f9fafb); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 16px; transition: box-shadow .15s; }
  .st-kpi-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
  .st-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary, #6b7280); letter-spacing: 0.05em; margin-bottom: 6px; }
  .st-kpi-value { font-size: 22px; font-weight: 700; color: var(--text-primary, #111827); margin-bottom: 2px; }
  .st-kpi-sub { font-size: 11px; color: var(--text-secondary, #6b7280); }
  .st-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
  .st-filter-group { display: flex; gap: 6px; flex-wrap: wrap; }
  .st-filter-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); background: var(--surface-0, #fff); font-size: 12px; font-weight: 500; color: var(--text-secondary, #6b7280); cursor: pointer; transition: all .15s; }
  .st-filter-btn:hover { background: var(--surface-1, #f9fafb); }
  .st-filter-btn.active { background: var(--accent, #2563eb); color: #fff; border-color: var(--accent, #2563eb); }
  .st-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); background: var(--surface-0, #fff); font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s; display: inline-flex; align-items: center; gap: 6px; }
  .st-btn:hover { background: var(--surface-1, #f9fafb); }
  .st-btn-primary { background: var(--accent, #2563eb); color: #fff; border-color: var(--accent, #2563eb); }
  .st-btn-primary:hover { background: #1d4ed8; }
  .st-table-wrap { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; overflow-x: auto; margin-bottom: 24px; }
  .st-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .st-table thead th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary, #6b7280); background: var(--surface-1, #f9fafb); border-bottom: 1px solid var(--border, #e5e7eb); letter-spacing: 0.03em; white-space: nowrap; }
  .st-table tbody td { padding: 10px 12px; border-bottom: 1px solid var(--border, #e5e7eb); color: var(--text-primary, #111827); vertical-align: middle; }
  .st-table tbody tr { cursor: pointer; transition: background .1s; }
  .st-table tbody tr:hover { background: var(--surface-1, #f9fafb); }
  .st-table tbody tr.selected { background: #eff6ff; outline: 1px solid #bfdbfe; }
  .st-table tbody tr:last-child td { border-bottom: none; }
  .st-evidence { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .st-evidence-a { background: #dcfce7; color: #166534; }
  .st-evidence-b { background: #dbeafe; color: #1e40af; }
  .st-evidence-c { background: #fef3c7; color: #92400e; }
  .st-evidence-d { background: #fee2e2; color: #991b1b; }
  .st-status { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .st-status.active { background: #dcfce7; color: #166534; }
  .st-status.custom { background: #ede9fe; color: #5b21b6; }
  .st-status.draft { background: #e5e7eb; color: #374151; }
  .st-status.archived { background: #f3f4f6; color: #9ca3af; }
  .coordinate-display { font-family: monospace; font-size: 13px; background: var(--surface-2, #f3f4f6); padding: 4px 8px; border-radius: 4px; white-space: nowrap; letter-spacing: 0.02em; }
  .st-region-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .st-region-motor { background: #dbeafe; color: #1e40af; }
  .st-region-dlpfc { background: #ede9fe; color: #5b21b6; }
  .st-region-sma { background: #ccfbf1; color: #0f766e; }
  .st-region-cerebellum { background: #fef3c7; color: #92400e; }
  .st-region-temporal { background: #fce7f3; color: #9d174d; }
  .st-region-parietal { background: #d1fae5; color: #065f46; }
  .st-region-occipital { background: #c7d2fe; color: #3730a3; }
  .st-region-insula { background: #fed7aa; color: #9a3412; }
  .st-detail-panel { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 20px; }
  .st-detail-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary, #111827); }
  .st-detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .st-detail-item { padding: 12px; background: var(--surface-1, #f9fafb); border-radius: 8px; }
  .st-detail-label { font-size: 11px; font-weight: 600; color: var(--text-secondary, #6b7280); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.02em; }
  .st-detail-value { font-size: 13px; font-weight: 600; color: var(--text-primary, #111827); }
  .st-precision-meter { height: 6px; border-radius: 3px; background: var(--surface-2, #f3f4f6); margin-top: 8px; overflow: hidden; }
  .st-precision-fill { height: 100%; border-radius: 3px; transition: width .3s; }
  .st-precision-high { background: #16a34a; }
  .st-precision-medium { background: #ca8a04; }
  .st-precision-low { background: #dc2626; }
  .st-hemisphere-l { color: #2563eb; font-weight: 600; }
  .st-hemisphere-r { color: #dc2626; font-weight: 600; }
  .st-hemisphere-bi { color: #7c3aed; font-weight: 600; }
  .st-atlas-ref { font-size: 11px; color: var(--text-secondary, #6b7280); margin-top: 8px; }
  .st-col2 { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
  .st-focal-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .st-focal-yes { background: #dcfce7; color: #166534; }
  .st-focal-no { background: #fee2e2; color: #991b1b; }
  .st-coord-legend { display: flex; gap: 12px; align-items: center; margin-top: 12px; font-size: 11px; color: var(--text-secondary, #6b7280); flex-wrap: wrap; }
  .st-footer-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: 11px; color: var(--text-secondary, #6b7280); }
  .st-precision-legend { display: flex; gap: 12px; margin-top: 8px; }
  .st-precision-legend-item { font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }
  .st-precision-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .st-target-stats { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .st-target-stats-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary, #111827); }
  .st-target-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .st-target-stats-item { padding: 10px; background: var(--surface-1, #f9fafb); border-radius: 6px; text-align: center; }
  .st-target-stats-label { font-size: 10px; font-weight: 600; color: var(--text-secondary, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; }
  .st-target-stats-value { font-size: 16px; font-weight: 700; color: var(--text-primary, #111827); }
  .st-region-legend { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .st-region-legend-item { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-secondary, #6b7280); }
  .st-region-dot { width: 8px; height: 8px; border-radius: 3px; display: inline-block; }
  @media (max-width: 1024px) {
    .st-kpi-row { grid-template-columns: repeat(2, 1fr); }
    .st-col2 { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .st-kpi-row { grid-template-columns: 1fr; }
    .st-detail-grid { grid-template-columns: 1fr; }
  }
</style>
`;


import { api } from './api.js';
import { currentUser } from './state.js';

/**
 * Target dataset — 15 brain stimulation targets with MNI coordinates.
 * Evidence: A=meta-analysis, B=RCT, C=observational.
 * All coordinates reference MNI152 space.
 */
const DEMO_TARGETS = [
  { id: 1, name: 'L M1-Hand', region: 'Motor cortex', mni: [-38, -26, 56], hemisphere: 'L', evidence: 'A', focal: true, protocols: 3, status: 'active', atlas: 'MNI152', desc: 'Primary motor cortex, hand knob area. Meta-analysis supports motor learning enhancement (Grade A). tDCS at 1-2mA for 20min.' },
  { id: 2, name: 'L DLPFC (F3)', region: 'DLPFC', mni: [-42, 36, 28], hemisphere: 'L', evidence: 'A', focal: false, protocols: 5, status: 'active', atlas: 'MNI152', desc: 'Dorsolateral prefrontal cortex. Strong evidence for depression (F3 anode), working memory, and executive function. Most studied tDCS target.' },
  { id: 3, name: 'R DLPFC (F4)', region: 'DLPFC', mni: [44, 38, 30], hemisphere: 'R', evidence: 'A', focal: false, protocols: 2, status: 'active', atlas: 'MNI152', desc: 'Right DLPFC. Used in anxiety, PTSD protocols. Bilateral pair with F3 for bifrontal montages.' },
  { id: 4, name: 'SMA (Fz)', region: 'SMA', mni: [0, -6, 54], hemisphere: 'Bi', evidence: 'B', focal: true, protocols: 1, status: 'active', atlas: 'MNI152', desc: 'Supplementary motor area. RCT evidence for motor preparation, action inhibition, and speech fluency protocols.' },
  { id: 5, name: 'L Cerebellum', region: 'Cerebellum', mni: [-32, -56, -28], hemisphere: 'L', evidence: 'B', focal: true, protocols: 1, status: 'active', atlas: 'MNI152', desc: 'Cerebellar hemisphere. Growing RCT evidence for motor adaptation, balance, and cognitive functions. Cathode over cerebellum.' },
  { id: 6, name: 'L STG', region: 'Temporal', mni: [-64, -32, 10], hemisphere: 'L', evidence: 'C', focal: true, protocols: 1, status: 'custom', atlas: 'MNI152', desc: 'Left superior temporal gyrus. Observational studies for tinnitus suppression and auditory processing enhancement.' },
  { id: 7, name: 'Visual Cortex (Oz)', region: 'Occipital', mni: [0, -90, -4], hemisphere: 'Bi', evidence: 'B', focal: true, protocols: 2, status: 'active', atlas: 'MNI152', desc: 'Primary visual cortex at Oz. RCT evidence for visual processing, phosphene thresholds, and alpha entrainment studies.' },
  { id: 8, name: 'L PPC', region: 'Parietal', mni: [-40, -50, 46], hemisphere: 'L', evidence: 'C', focal: true, protocols: 1, status: 'custom', atlas: 'MNI152', desc: 'Left posterior parietal cortex. Observational evidence for attention, spatial cognition, and numerical processing tasks.' },
  { id: 9, name: 'L IFG', region: 'Temporal', mni: [-52, 22, 8], hemisphere: 'L', evidence: 'C', focal: true, protocols: 1, status: 'draft', atlas: 'MNI152', desc: 'Inferior frontal gyrus. Language (Broca area overlap) and working memory studies. Limited evidence base — Grade C.' },
  { id: 10, name: 'R Insula', region: 'Insula', mni: [38, 18, -2], hemisphere: 'R', evidence: 'B', focal: true, protocols: 1, status: 'active', atlas: 'MNI152', desc: 'Right anterior insula. RCT evidence for interoception, pain modulation, and autonomic regulation protocols.' },
  { id: 11, name: 'R M1-Hand', region: 'Motor cortex', mni: [40, -24, 58], hemisphere: 'R', evidence: 'A', focal: true, protocols: 1, status: 'active', atlas: 'MNI152', desc: 'Right primary motor cortex. Grade A evidence from multiple meta-analyses for motor learning and stroke rehabilitation.' },
  { id: 12, name: 'Cz-Central', region: 'Motor cortex', mni: [0, -24, 58], hemisphere: 'Bi', evidence: 'B', focal: false, protocols: 1, status: 'custom', atlas: 'MNI152', desc: 'Central vertex at Cz. Broad stimulation area covering bilateral motor regions. Lower spatial precision, easy montage.' },
  { id: 13, name: 'R Cerebellum', region: 'Cerebellum', mni: [30, -58, -26], hemisphere: 'R', evidence: 'C', focal: true, protocols: 1, status: 'draft', atlas: 'MNI152', desc: 'Right cerebellar hemisphere. Observational studies only for cognitive and emotional processing modulation.' },
  { id: 14, name: 'L Occipital', region: 'Occipital', mni: [-28, -88, 8], hemisphere: 'L', evidence: 'C', focal: true, protocols: 1, status: 'archived', atlas: 'MNI152', desc: 'Left lateral occipital cortex. Limited evidence for visual attention modulation. Archived target — not recommended.' },
  { id: 15, name: 'Bilateral DLPFC', region: 'DLPFC', mni: [-42, 36, 28], hemisphere: 'Bi', evidence: 'A', focal: false, protocols: 3, status: 'active', atlas: 'MNI152', desc: 'Simultaneous bilateral DLPFC stimulation. Meta-analysis supports working memory enhancement with bifrontal tDCS at 2mA.' }
];

/** Return CSS class for brain region badge coloring. */
function getRegionClass(r) {
  const map = { 'Motor cortex': 'st-region-motor', 'DLPFC': 'st-region-dlpfc', 'SMA': 'st-region-sma', 'Cerebellum': 'st-region-cerebellum', 'Temporal': 'st-region-temporal', 'Parietal': 'st-region-parietal', 'Occipital': 'st-region-occipital', 'Insula': 'st-region-insula' };
  return map[r] || 'st-region-motor';
}

/** Return CSS class for evidence grade badge. */
function getEvidenceClass(e) { return `st-evidence-${e.toLowerCase()}`; }

/** Return CSS class for status pill. */
function getStatusClass(s) { return `st-status ${s}`; }

/** Return CSS class for hemisphere coloring. */
function getHemisphereClass(h) {
  if (h === 'L') return 'st-hemisphere-l';
  if (h === 'R') return 'st-hemisphere-r';
  return 'st-hemisphere-bi';
}

/**
 * Compute spatial precision score based on focality and evidence grade.
 * @returns {Object} { label, value, cls }
 */
function getPrecision(target) {
  if (target.focal && target.evidence === 'A') return { label: 'High', value: 90, cls: 'st-precision-high' };
  if (target.focal && target.evidence === 'B') return { label: 'High', value: 80, cls: 'st-precision-high' };
  if (target.focal) return { label: 'Medium', value: 65, cls: 'st-precision-medium' };
  return { label: 'Low', value: 40, cls: 'st-precision-low' };
}

/**
 * Render target table rows, filtered by active filter.
 * @param {string} filter — 'all' | 'high-evidence' | 'custom' | 'focal' | 'bilateral'
 */
function renderTable(filter) {
  let data = targets || DEMO_TARGETS;
  if (filter === 'high-evidence') data = (targets || DEMO_TARGETS).filter(t => t.evidence === 'A');
  if (filter === 'custom') data = (targets || DEMO_TARGETS).filter(t => t.status === 'custom');
  if (filter === 'focal') data = (targets || DEMO_TARGETS).filter(t => t.focal);
  if (filter === 'bilateral') data = (targets || DEMO_TARGETS).filter(t => t.hemisphere === 'Bi');
  return data.map(t => {
    const prec = getPrecision(t);
    return `
    <tr data-id="${t.id}">
      <td><strong>${t.name}</strong></td>
      <td><span class="st-region-tag ${getRegionClass(t.region)}">${t.region}</span></td>
      <td>
        <div class="coordinate-display">X: ${t.mni[0]} &nbsp; Y: ${t.mni[1]} &nbsp; Z: ${t.mni[2]}</div>
        <div class="st-precision-meter"><div class="st-precision-fill ${prec.cls}" style="width:${prec.value}%"></div></div>
      </td>
      <td class="${getHemisphereClass(t.hemisphere)}">${t.hemisphere}</td>
      <td><span class="st-evidence ${getEvidenceClass(t.evidence)}">Grade ${t.evidence}</span></td>
      <td>${t.protocols}</td>
      <td><span class="${getStatusClass(t.status)}">${t.status}</span></td>
    </tr>
  `; }).join('');
}

/**
 * Main entry point — Stimulation Targets page.
 * @param {Function} setTopbar — callback to configure top navigation
 * @param {Function} navigate — callback for page navigation
 */
export async function pgStimulationTargets(setTopbar, navigate) {
  if (typeof setTopbar === 'function') {
    setTopbar('Stimulation Targets', [
      { label: 'Dashboard', action: () => navigate && navigate('dashboard') },
      { label: 'Devices', action: () => navigate && navigate('device-planning') },
      { label: 'Sessions', action: () => navigate && navigate('session-planning') },
      { label: 'Surgical', action: () => navigate && navigate('surgical-planning') }
    ]);
  }

  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';

  // Try API first, fall back to demo data
  let targets = DEMO_TARGETS;
  try {
    const resp = await api.getStimulationTargets('all');
    if (resp && resp.length > 0) {
      targets = resp;
    } else if (resp && resp.items && resp.items.length > 0) {
      targets = resp.items;
    }
  } catch (err) {
    console.warn('[StimulationTargets] API error:', err.message);
  }

  let activeFilter = 'all';
  let selectedTarget = targets[0];  // assigned below after data load
  const container = document.createElement('div');
  container.className = 'st-container';

  function buildHTML() {
    const total = targets.length;
    const mniCount = targets.filter(t => t.atlas === 'MNI152').length;
    const regions = new Set(targets.map(t => t.region)).size;
    const custom = targets.filter(t => t.status === 'custom').length;
    const prec = getPrecision(selectedTarget);

    container.innerHTML = styles + `
      <div class="st-header">
        <h1>Stimulation Target Atlas</h1>
        <p>Brain stimulation targets with MNI coordinates, evidence grades, and spatial precision indicators</p>
      </div>

      <div class="st-safety-banner">
        <span class="icon">&#9888;</span>
        <span>Target coordinates should be verified against individual MRI before stimulation. MNI coordinates are population averages and may vary up to 10-20 mm in individuals.</span>
      </div>

      <div class="st-kpi-row">
        <div class="st-kpi-card">
          <div class="st-kpi-label">Targets Defined</div>
          <div class="st-kpi-value">${total}</div>
          <div class="st-kpi-sub">In atlas database</div>
        </div>
        <div class="st-kpi-card">
          <div class="st-kpi-label">MNI Coordinates</div>
          <div class="st-kpi-value">${mniCount}</div>
          <div class="st-kpi-sub">MNI152 reference space</div>
        </div>
        <div class="st-kpi-card">
          <div class="st-kpi-label">Atlas Regions</div>
          <div class="st-kpi-value">${regions}</div>
          <div class="st-kpi-sub">Anatomical categories</div>
        </div>
        <div class="st-kpi-card">
          <div class="st-kpi-label">Custom Targets</div>
          <div class="st-kpi-value">${custom}</div>
          <div class="st-kpi-sub">User-defined coordinates</div>
        </div>
      </div>

      <div class="st-target-stats">
        <div class="st-target-stats-title">Target Distribution by Evidence Grade</div>
        <div class="st-target-stats-grid">
          <div class="st-target-stats-item">
            <div class="st-target-stats-label">Grade A (Meta-analysis)</div>
            <div class="st-target-stats-value">${targets.filter(t => t.evidence === 'A').length}</div>
          </div>
          <div class="st-target-stats-item">
            <div class="st-target-stats-label">Grade B (RCT)</div>
            <div class="st-target-stats-value">${targets.filter(t => t.evidence === 'B').length}</div>
          </div>
          <div class="st-target-stats-item">
            <div class="st-target-stats-label">Grade C (Observational)</div>
            <div class="st-target-stats-value">${targets.filter(t => t.evidence === 'C').length}</div>
          </div>
          <div class="st-target-stats-item">
            <div class="st-target-stats-label">Focal Targets</div>
            <div class="st-target-stats-value">${targets.filter(t => t.focal).length}</div>
          </div>
        </div>
      </div>

      <div class="st-toolbar">
        <div class="st-filter-group">
          <button class="st-filter-btn ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${total})</button>
          <button class="st-filter-btn ${activeFilter === 'high-evidence' ? 'active' : ''}" data-filter="high-evidence">High Evidence (${targets.filter(t=>t.evidence==='A').length})</button>
          <button class="st-filter-btn ${activeFilter === 'custom' ? 'active' : ''}" data-filter="custom">Custom (${targets.filter(t=>t.status==='custom').length})</button>
          <button class="st-filter-btn ${activeFilter === 'focal' ? 'active' : ''}" data-filter="focal">Focal (${targets.filter(t=>t.focal).length})</button>
          <button class="st-filter-btn ${activeFilter === 'bilateral' ? 'active' : ''}" data-filter="bilateral">Bilateral (${targets.filter(t=>t.hemisphere==='Bi').length})</button>
        </div>
        <div>
          <button class="st-btn st-btn-primary">+ New Target</button>
          <button class="st-btn">Export Coords</button>
        </div>
      </div>

      <div class="st-col2">
        <div class="st-table-wrap">
          <table class="st-table">
            <thead>
              <tr>
                <th>Target Name</th>
                <th>Region</th>
                <th>MNI X/Y/Z</th>
                <th>Hemisphere</th>
                <th>Evidence</th>
                <th>Protocols Using</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${renderTable(activeFilter)}
            </tbody>
          </table>
          <div class="st-footer-bar">
            <span>Showing ${targets.filter(t => {
              if (activeFilter === 'all') return true;
              if (activeFilter === 'high-evidence') return t.evidence === 'A';
              if (activeFilter === 'custom') return t.status === 'custom';
              if (activeFilter === 'focal') return t.focal;
              if (activeFilter === 'bilateral') return t.hemisphere === 'Bi';
              return true;
            }).length} targets</span>
            <span>MNI152 reference space</span>
          </div>
        </div>

        <div class="st-detail-panel">
          <div class="st-detail-title">Target Detail — ${selectedTarget.name}</div>
          <div class="st-detail-grid">
            <div class="st-detail-item">
              <div class="st-detail-label">Brain Region</div>
              <div class="st-detail-value"><span class="st-region-tag ${getRegionClass(selectedTarget.region)}">${selectedTarget.region}</span></div>
            </div>
            <div class="st-detail-item">
              <div class="st-detail-label">Hemisphere</div>
              <div class="st-detail-value ${getHemisphereClass(selectedTarget.hemisphere)}">${selectedTarget.hemisphere === 'Bi' ? 'Bilateral' : selectedTarget.hemisphere === 'L' ? 'Left' : 'Right'}</div>
            </div>
            <div class="st-detail-item">
              <div class="st-detail-label">MNI Coordinates</div>
              <div class="coordinate-display" style="margin-top:4px;">X: ${selectedTarget.mni[0]}  Y: ${selectedTarget.mni[1]}  Z: ${selectedTarget.mni[2]}</div>
              <div class="st-atlas-ref">Reference: ${selectedTarget.atlas} template</div>
            </div>
            <div class="st-detail-item">
              <div class="st-detail-label">Spatial Precision</div>
              <div class="st-detail-value">${prec.label} (${prec.value}%)</div>
              <div class="st-precision-meter"><div class="st-precision-fill ${prec.cls}" style="width:${prec.value}%"></div></div>
              <div class="st-precision-legend">
                <span class="st-precision-legend-item"><span class="st-precision-dot" style="background:#16a34a;"></span> High</span>
                <span class="st-precision-legend-item"><span class="st-precision-dot" style="background:#ca8a04;"></span> Medium</span>
                <span class="st-precision-legend-item"><span class="st-precision-dot" style="background:#dc2626;"></span> Low</span>
              </div>
            </div>
            <div class="st-detail-item">
              <div class="st-detail-label">Focality</div>
              <div class="st-detail-value"><span class="st-focal-badge ${selectedTarget.focal ? 'st-focal-yes' : 'st-focal-no'}">${selectedTarget.focal ? 'Focal' : 'Broad'}</span></div>
            </div>
            <div class="st-detail-item">
              <div class="st-detail-label">Evidence Grade</div>
              <div class="st-detail-value"><span class="st-evidence ${getEvidenceClass(selectedTarget.evidence)}">Grade ${selectedTarget.evidence}</span></div>
            </div>
            <div class="st-detail-item" style="grid-column: 1 / -1;">
              <div class="st-detail-label">Description</div>
              <div class="st-detail-value" style="font-weight:400;font-size:12px;line-height:1.5;">${selectedTarget.desc}</div>
            </div>
            <div class="st-detail-item">
              <div class="st-detail-label">Protocols Using This Target</div>
              <div class="st-detail-value">${selectedTarget.protocols} active protocol${selectedTarget.protocols !== 1 ? 's' : ''}</div>
            </div>
            <div class="st-detail-item">
              <div class="st-detail-label">Status</div>
              <div class="st-detail-value"><span class="${getStatusClass(selectedTarget.status)}">${selectedTarget.status}</span></div>
            </div>
          </div>
          <div class="st-region-legend">
            <span class="st-region-legend-item"><span class="st-region-dot" style="background:#dbeafe;"></span> Motor</span>
            <span class="st-region-legend-item"><span class="st-region-dot" style="background:#ede9fe;"></span> DLPFC</span>
            <span class="st-region-legend-item"><span class="st-region-dot" style="background:#ccfbf1;"></span> SMA</span>
            <span class="st-region-legend-item"><span class="st-region-dot" style="background:#fef3c7;"></span> Cerebellum</span>
            <span class="st-region-legend-item"><span class="st-region-dot" style="background:#fce7f3;"></span> Temporal</span>
            <span class="st-region-legend-item"><span class="st-region-dot" style="background:#d1fae5;"></span> Parietal</span>
            <span class="st-region-legend-item"><span class="st-region-dot" style="background:#c7d2fe;"></span> Occipital</span>
            <span class="st-region-legend-item"><span class="st-region-dot" style="background:#fed7aa;"></span> Insula</span>
          </div>
        </div>
      </div>
    `;
  }

  buildHTML();

  // Event delegation for filter buttons and row selection
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.st-filter-btn');
    if (btn) {
      activeFilter = btn.dataset.filter;
      buildHTML();
      return;
    }
    const row = e.target.closest('.st-table tbody tr');
    if (row) {
      const id = parseInt(row.dataset.id);
      const found = targets.find(t => t.id === id);
      if (found) { selectedTarget = found; buildHTML(); }
    }
  });

  return container;
}

export default { pgStimulationTargets };
