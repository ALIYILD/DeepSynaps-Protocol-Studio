/**
 * pages-surgical-planning.js
 * DeepSynaps Protocol Studio — Surgical Neuromodulation Planning
 *
 * Features:
 *   - 13 surgical cases across DBS, VNS, RNS, SCS procedures
 *   - Case table with patient, procedure, target, lead, trajectory details
 *   - Interactive procedure checklist (pre-op, frame, MER, test stim, lead place)
 *   - KPI dashboard for cases, implants, trajectories, OR time
 *   - Evidence grades (A-B) per procedure type
 *   - Filterable: All, Planned, Scheduled, Completed, Follow-up
 *   - Detail panel with full case information on row selection
 *   - Safety disclaimer — decision support only, neurosurgeon review required
 *
 * Surgical types: DBS (deep brain stimulation), VNS (vagus nerve stimulation),
 *   RNS (responsive neurostimulation), SCS (spinal cord stimulation)
 */

const styles = `
<style>
  .sg-container { max-width: 1400px; margin: 0 auto; padding: 24px; }
  .sg-header { margin-bottom: 24px; }
  .sg-header h1 { font-size: 24px; font-weight: 700; color: var(--text-primary, #111827); margin: 0 0 4px 0; }
  .sg-header p { font-size: 13px; color: var(--text-secondary, #6b7280); margin: 0; }
  .sg-safety-banner { background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; color: #991b1b; display: flex; align-items: center; gap: 10px; font-weight: 500; }
  .sg-safety-banner .icon { font-size: 16px; flex-shrink: 0; }
  .sg-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .sg-kpi-card { background: var(--surface-1, #f9fafb); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 16px; transition: box-shadow .15s; }
  .sg-kpi-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
  .sg-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary, #6b7280); letter-spacing: 0.05em; margin-bottom: 6px; }
  .sg-kpi-value { font-size: 22px; font-weight: 700; color: var(--text-primary, #111827); margin-bottom: 2px; }
  .sg-kpi-sub { font-size: 11px; color: var(--text-secondary, #6b7280); }
  .sg-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
  .sg-filter-group { display: flex; gap: 6px; flex-wrap: wrap; }
  .sg-filter-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); background: var(--surface-0, #fff); font-size: 12px; font-weight: 500; color: var(--text-secondary, #6b7280); cursor: pointer; transition: all .15s; }
  .sg-filter-btn:hover { background: var(--surface-1, #f9fafb); }
  .sg-filter-btn.active { background: var(--accent, #2563eb); color: #fff; border-color: var(--accent, #2563eb); }
  .sg-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); background: var(--surface-0, #fff); font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s; display: inline-flex; align-items: center; gap: 6px; }
  .sg-btn:hover { background: var(--surface-1, #f9fafb); }
  .sg-btn-primary { background: var(--accent, #2563eb); color: #fff; border-color: var(--accent, #2563eb); }
  .sg-btn-primary:hover { background: #1d4ed8; }
  .sg-table-wrap { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; overflow-x: auto; margin-bottom: 24px; }
  .sg-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .sg-table thead th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary, #6b7280); background: var(--surface-1, #f9fafb); border-bottom: 1px solid var(--border, #e5e7eb); letter-spacing: 0.03em; white-space: nowrap; }
  .sg-table tbody td { padding: 10px 12px; border-bottom: 1px solid var(--border, #e5e7eb); color: var(--text-primary, #111827); vertical-align: middle; }
  .sg-table tbody tr { cursor: pointer; transition: background .1s; }
  .sg-table tbody tr:hover { background: var(--surface-1, #f9fafb); }
  .sg-table tbody tr.selected { background: #eff6ff; outline: 1px solid #bfdbfe; }
  .sg-table tbody tr:last-child td { border-bottom: none; }
  .sg-status { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .sg-status.planned { background: #e5e7eb; color: #374151; }
  .sg-status.scheduled { background: #dbeafe; color: #1e40af; }
  .sg-status.completed { background: #dcfce7; color: #166534; }
  .sg-status.follow-up { background: #fef3c7; color: #92400e; }
  .sg-procedure-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .sg-proc-dbs { background: #dbeafe; color: #1e40af; }
  .sg-proc-vns { background: #ede9fe; color: #5b21b6; }
  .sg-proc-rns { background: #fef3c7; color: #92400e; }
  .sg-proc-scs { background: #d1fae5; color: #065f46; }
  .sg-evidence { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
  .sg-evidence-a { background: #dcfce7; color: #166534; }
  .sg-evidence-b { background: #dbeafe; color: #1e40af; }
  .sg-evidence-c { background: #fef3c7; color: #92400e; }
  .checklist-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
  .checklist-check { width: 18px; height: 18px; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
  .checklist-done { background: var(--success, #16a34a); color: white; }
  .checklist-pending { background: var(--border, #e5e7eb); }
  .sg-checklist-panel { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 20px; }
  .sg-checklist-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary, #111827); }
  .sg-checklist-section { margin-bottom: 14px; }
  .sg-checklist-section:last-child { margin-bottom: 0; }
  .sg-checklist-section-title { font-size: 12px; font-weight: 600; color: var(--text-secondary, #6b7280); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }
  .sg-detail-panel { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .sg-detail-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary, #111827); }
  .sg-detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .sg-detail-item { padding: 12px; background: var(--surface-1, #f9fafb); border-radius: 8px; }
  .sg-detail-label { font-size: 11px; font-weight: 600; color: var(--text-secondary, #6b7280); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.02em; }
  .sg-detail-value { font-size: 13px; font-weight: 600; color: var(--text-primary, #111827); }
  .sg-coordinate-display { font-family: monospace; font-size: 12px; background: var(--surface-2, #f3f4f6); padding: 4px 8px; border-radius: 4px; }
  .sg-col2 { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
  .sg-lead-type { font-size: 11px; font-weight: 500; color: #4b5563; }
  .sg-or-time { font-family: monospace; font-size: 12px; color: #92400e; font-weight: 600; }
  .sg-footer-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: 11px; color: var(--text-secondary, #6b7280); }
  .sg-evidence-legend { display: flex; gap: 12px; align-items: center; margin-top: 12px; font-size: 11px; color: var(--text-secondary, #6b7280); flex-wrap: wrap; }
  .sg-evidence-legend-item { display: inline-flex; align-items: center; gap: 4px; }
  @media (max-width: 1024px) {
    .sg-kpi-row { grid-template-columns: repeat(2, 1fr); }
    .sg-col2 { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .sg-kpi-row { grid-template-columns: 1fr; }
    .sg-detail-grid { grid-template-columns: 1fr; }
  }
</style>
`;


import { api } from './api.js';
import { currentUser } from './state.js';

/**
 * Surgical case dataset — 13 cases across DBS, VNS, RNS, SCS.
 * Evidence: A=meta-analysis/RCT, B=controlled trials.
 */
const DEMO_CASES = [
  { id: 1, patient: 'SP-001', procedure: 'DBS', target: 'STN', leadType: 'Medtronic 3389', entryPoint: 'Coronal suture', trajectory: 'Posterior-superior', date: '2025-02-10', status: 'scheduled', orTime: '3.5h', evidence: 'A', checklist: { preop: true, frame: true, mer: false, testStim: false, leadPlace: false }, notes: 'Bilateral STN for Parkinson disease. Frame-based approach.' },
  { id: 2, patient: 'SP-002', procedure: 'DBS', target: 'GPi', leadType: 'Boston Vercise', entryPoint: 'Coronal suture', trajectory: 'Orthogonal', date: '2025-02-12', status: 'scheduled', orTime: '4.0h', evidence: 'A', checklist: { preop: true, frame: true, mer: false, testStim: false, leadPlace: false }, notes: 'Bilateral GPi for dystonia. MER planned for both hemispheres.' },
  { id: 3, patient: 'SP-003', procedure: 'VNS', target: 'LCN', leadType: 'VNS Therapy Aspire', entryPoint: 'Cervical incision', trajectory: 'Carotid sheath', date: '2025-02-14', status: 'planned', orTime: '1.5h', evidence: 'A', checklist: { preop: true, frame: false, mer: false, testStim: false, leadPlace: false }, notes: 'Left cervical vagus nerve for refractory epilepsy. LCN dissection approach.' },
  { id: 4, patient: 'SP-004', procedure: 'DBS', target: 'VIM', leadType: 'Medtronic 3387', entryPoint: 'Coronal suture', trajectory: 'Posterior-superior', date: '2025-01-28', status: 'completed', orTime: '3.0h', evidence: 'A', checklist: { preop: true, frame: true, mer: true, testStim: true, leadPlace: true }, notes: 'Unilateral VIM thalamotomy-equivalent DBS for essential tremor. Excellent tremor suppression intraop.' },
  { id: 5, patient: 'SP-005', procedure: 'RNS', target: 'Hippocampus', leadType: 'NeuroPace RNS-320', entryPoint: 'Temporal craniotomy', trajectory: 'Longitudinal', date: '2025-03-01', status: 'planned', orTime: '4.5h', evidence: 'B', checklist: { preop: true, frame: false, mer: false, testStim: false, leadPlace: false }, notes: 'Bilateral hippocampal leads for mesial temporal lobe epilepsy. StereoEEG guidance.' },
  { id: 6, patient: 'SP-006', procedure: 'SCS', target: 'T8-T9', leadType: 'Spectra WaveWriter', entryPoint: 'Laminectomy T9', trajectory: 'Epidural midline', date: '2025-02-18', status: 'scheduled', orTime: '2.5h', evidence: 'A', checklist: { preop: true, frame: false, mer: false, testStim: false, leadPlace: false }, notes: 'Spinal cord stimulation for failed back surgery syndrome. Trial phase completed successfully.' },
  { id: 7, patient: 'SP-007', procedure: 'DBS', target: 'STN', leadType: 'Abbott Infinity DIR', entryPoint: 'Coronal suture', trajectory: 'Posterior-superior', date: '2025-01-15', status: 'completed', orTime: '3.5h', evidence: 'A', checklist: { preop: true, frame: true, mer: true, testStim: true, leadPlace: true }, notes: 'Bilateral STN DBS with directional leads. Both hemispheres passed intraop testing.' },
  { id: 8, patient: 'SP-008', procedure: 'VNS', target: 'LCN', leadType: 'VNS Therapy SenTiva', entryPoint: 'Cervical incision', trajectory: 'Carotid sheath', date: '2025-01-20', status: 'completed', orTime: '1.5h', evidence: 'A', checklist: { preop: true, frame: false, mer: false, testStim: false, leadPlace: true }, notes: 'VNS generator upgrade with new lead. Previous system implanted 2018.' },
  { id: 9, patient: 'SP-009', procedure: 'DBS', target: 'GPi', leadType: 'Medtronic SenSight', entryPoint: 'Coronal suture', trajectory: 'Orthogonal', date: '2025-03-05', status: 'planned', orTime: '4.0h', evidence: 'A', checklist: { preop: true, frame: false, mer: false, testStim: false, leadPlace: false }, notes: 'Bilateral GPi with sensing-enabled leads. PD with severe motor fluctuations.' },
  { id: 10, patient: 'SP-010', procedure: 'RNS', target: 'Neocortex', leadType: 'NeuroPace RNS-320', entryPoint: 'Craniotomy', trajectory: 'Grid placement', date: '2025-02-20', status: 'scheduled', orTime: '5.0h', evidence: 'B', checklist: { preop: true, frame: false, mer: false, testStim: false, leadPlace: false }, notes: 'Cortical RNS for multifocal epilepsy. Two 4-contact depth leads over seizure focus.' },
  { id: 11, patient: 'SP-011', procedure: 'SCS', target: 'C2-C4', leadType: 'Nevro HF10', entryPoint: 'Laminectomy C3', trajectory: 'Epidural cervical', date: '2025-01-10', status: 'follow-up', orTime: '2.5h', evidence: 'A', checklist: { preop: true, frame: false, mer: false, testStim: true, leadPlace: true }, notes: 'Cervical SCS for upper extremity neuropathic pain. 6-month follow-up scheduled.' },
  { id: 12, patient: 'SP-012', procedure: 'DBS', target: 'STN', leadType: 'Medtronic 3389', entryPoint: 'Coronal suture', trajectory: 'Posterior-superior', date: '2025-03-10', status: 'planned', orTime: '3.5h', evidence: 'A', checklist: { preop: false, frame: false, mer: false, testStim: false, leadPlace: false }, notes: 'Early planning phase. Pre-op MRI pending. Bilateral STN for young-onset PD.' },
  { id: 13, patient: 'SP-013', procedure: 'DBS', target: 'VIM', leadType: 'Boston Vercise', entryPoint: 'Coronal suture', trajectory: 'Orthogonal', date: '2025-02-05', status: 'follow-up', orTime: '3.0h', evidence: 'A', checklist: { preop: true, frame: true, mer: true, testStim: true, leadPlace: true }, notes: 'VIM DBS programming session at 3 months post-op. Tremor control excellent at 2.5V.' }
];

/** Return CSS class for procedure badge coloring. */
function getProcedureClass(p) {
  const map = { DBS: 'sg-proc-dbs', VNS: 'sg-proc-vns', RNS: 'sg-proc-rns', SCS: 'sg-proc-scs' };
  return map[p] || 'sg-proc-dbs';
}

/** Return CSS class for evidence grade badge. */
function getEvidenceClass(e) { return `sg-evidence-${e.toLowerCase()}`; }

/** Return CSS class for status pill. */
function getStatusClass(s) { return `sg-status ${s}`; }

/**
 * Render case table rows, filtered by status.
 * @param {string} filter — 'all' | 'planned' | 'scheduled' | 'completed' | 'follow-up'
 */
function renderTable(filter) {
  let data = cases || DEMO_CASES;
  if (filter === 'planned') data = (cases || DEMO_CASES).filter(c => c.status === 'planned');
  if (filter === 'scheduled') data = (cases || DEMO_CASES).filter(c => c.status === 'scheduled');
  if (filter === 'completed') data = (cases || DEMO_CASES).filter(c => c.status === 'completed');
  if (filter === 'follow-up') data = (cases || DEMO_CASES).filter(c => c.status === 'follow-up');
  return data.map(c => `
    <tr data-id="${c.id}">
      <td><strong>${c.patient}</strong></td>
      <td><span class="sg-procedure-badge ${getProcedureClass(c.procedure)}">${c.procedure}</span></td>
      <td>${c.target}</td>
      <td class="sg-lead-type">${c.leadType}</td>
      <td>${c.entryPoint}</td>
      <td>${c.trajectory}</td>
      <td>${c.date}</td>
      <td><span class="${getStatusClass(c.status)}">${c.status}</span></td>
    </tr>
  `).join('');
}

/**
 * Render procedure checklist grouped by category.
 * @param {Object} c — case object with checklist sub-object
 */
function renderChecklist(c) {
  if (!c) return '';
  const items = [
    { key: 'preop', label: 'Pre-operative imaging (MRI/CT)', category: 'Imaging' },
    { key: 'frame', label: 'Stereotactic frame placement', category: 'Frame' },
    { key: 'mer', label: 'Microelectrode recording (MER)', category: 'Recording' },
    { key: 'testStim', label: 'Intraoperative test stimulation', category: 'Testing' },
    { key: 'leadPlace', label: 'Lead placement & anchoring', category: 'Implantation' }
  ];
  const byCategory = {};
  items.forEach(item => {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  });
  return Object.entries(byCategory).map(([cat, catItems]) => `
    <div class="sg-checklist-section">
      <div class="sg-checklist-section-title">${cat}</div>
      ${catItems.map(item => `
        <div class="checklist-item">
          <div class="checklist-check ${c.checklist[item.key] ? 'checklist-done' : 'checklist-pending'}">${c.checklist[item.key] ? '&#10003;' : ''}</div>
          <span style="font-size:12px;color:var(--text-primary, #111827);">${item.label}</span>
        </div>
      `).join('')}
    </div>
  `).join('');
}

/**
 * Main entry point — Surgical Planning page.
 * @param {Function} setTopbar — callback to configure top navigation
 * @param {Function} navigate — callback for page navigation
 */
export async function pgSurgicalPlanning(setTopbar, navigate) {
  if (typeof setTopbar === 'function') {
    setTopbar('Surgical Planning', [
      { label: 'Dashboard', action: () => navigate && navigate('dashboard') },
      { label: 'Devices', action: () => navigate && navigate('device-planning') },
      { label: 'Sessions', action: () => navigate && navigate('session-planning') },
      { label: 'Targets', action: () => navigate && navigate('stimulation-targets') }
    ]);
  }

  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';

  // Try API first, fall back to demo data
  let cases = DEMO_CASES;
  try {
    const resp = await api.getSurgicalCases(clinicId);
    if (resp && resp.length > 0) {
      cases = resp;
    } else if (resp && resp.items && resp.items.length > 0) {
      cases = resp.items;
    }
  } catch (err) {
    console.warn('[SurgicalPlanning] API error:', err.message);
  }

  // Fetch checklist for selected case
  let checklistData = null;
  try {
    const caseId = cases[0]?.id;
    if (caseId) {
      checklistData = await api.getSurgicalChecklist(caseId);
    }
  } catch (err) {
    console.warn('[SurgicalPlanning] checklist API error:', err.message);
  }

  let activeFilter = 'all';
  let selectedCase = cases[0];
  const container = document.createElement('div');
  container.className = 'sg-container';

  function buildHTML() {
    const total = cases.length;
    const scheduled = cases.filter(c => c.status === 'scheduled').length;
    const trajectories = new Set(cases.map(c => c.trajectory)).size;
    const totalORTime = cases.reduce((sum, c) => sum + parseFloat(c.orTime), 0).toFixed(1);
    const completion = Math.round((cases.filter(c => c.status === 'completed').length / total) * 100);
    const caseChecklist = checklistData || selectedCase.checklist || {};
    const checklistDone = Object.values(caseChecklist).filter(v => v).length;
    const checklistTotal = Object.keys(caseChecklist).length;

    container.innerHTML = styles + `
      <div class="sg-header">
        <h1>Surgical Neuromodulation Planning</h1>
        <p>Surgical planning for DBS, VNS, RNS, and SCS procedures with evidence-based targets</p>
      </div>

      <div class="sg-safety-banner">
        <span class="icon">&#9888;</span>
        <span>Surgical planning requires neurosurgeon review — this is decision support only. All procedures must be confirmed by the operating surgeon before proceeding.</span>
      </div>

      <div class="sg-kpi-row">
        <div class="sg-kpi-card">
          <div class="sg-kpi-label">Cases Planned</div>
          <div class="sg-kpi-value">${total}</div>
          <div class="sg-kpi-sub">${completion}% completed</div>
        </div>
        <div class="sg-kpi-card">
          <div class="sg-kpi-label">Implants Scheduled</div>
          <div class="sg-kpi-value">${scheduled}</div>
          <div class="sg-kpi-sub">In OR queue</div>
        </div>
        <div class="sg-kpi-card">
          <div class="sg-kpi-label">Lead Trajectories</div>
          <div class="sg-kpi-value">${trajectories}</div>
          <div class="sg-kpi-sub">Unique surgical approaches</div>
        </div>
        <div class="sg-kpi-card">
          <div class="sg-kpi-label">OR Time Estimated</div>
          <div class="sg-kpi-value">${totalORTime}h</div>
          <div class="sg-kpi-sub">Total across all cases</div>
        </div>
      </div>

      <div class="sg-toolbar">
        <div class="sg-filter-group">
          <button class="sg-filter-btn ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${total})</button>
          <button class="sg-filter-btn ${activeFilter === 'planned' ? 'active' : ''}" data-filter="planned">Planned (${cases.filter(c=>c.status==='planned').length})</button>
          <button class="sg-filter-btn ${activeFilter === 'scheduled' ? 'active' : ''}" data-filter="scheduled">Scheduled (${cases.filter(c=>c.status==='scheduled').length})</button>
          <button class="sg-filter-btn ${activeFilter === 'completed' ? 'active' : ''}" data-filter="completed">Completed (${cases.filter(c=>c.status==='completed').length})</button>
          <button class="sg-filter-btn ${activeFilter === 'follow-up' ? 'active' : ''}" data-filter="follow-up">Follow-up (${cases.filter(c=>c.status==='follow-up').length})</button>
        </div>
        <div>
          <button class="sg-btn sg-btn-primary">+ New Case</button>
          <button class="sg-btn">Export Report</button>
        </div>
      </div>

      <div class="sg-col2">
        <div class="sg-table-wrap">
          <table class="sg-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Procedure</th>
                <th>Target</th>
                <th>Lead Type</th>
                <th>Entry Point</th>
                <th>Trajectory</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${renderTable(activeFilter)}
            </tbody>
          </table>
          <div class="sg-footer-bar">
            <span>Showing ${cases.filter(c => {
              if (activeFilter === 'all') return true;
              return c.status === activeFilter;
            }).length} cases</span>
            <span>Last updated: ${new Date().toLocaleDateString()}</span>
          </div>
        </div>

        <div>
          <div class="sg-detail-panel">
            <div class="sg-detail-title">Case Detail — ${selectedCase.patient}</div>
            <div class="sg-detail-grid">
              <div class="sg-detail-item">
                <div class="sg-detail-label">Procedure</div>
                <div class="sg-detail-value"><span class="sg-procedure-badge ${getProcedureClass(selectedCase.procedure)}">${selectedCase.procedure}</span></div>
              </div>
              <div class="sg-detail-item">
                <div class="sg-detail-label">Target Structure</div>
                <div class="sg-detail-value">${selectedCase.target}</div>
              </div>
              <div class="sg-detail-item">
                <div class="sg-detail-label">Lead / Device</div>
                <div class="sg-detail-value sg-lead-type">${selectedCase.leadType}</div>
              </div>
              <div class="sg-detail-item">
                <div class="sg-detail-label">Entry Point</div>
                <div class="sg-detail-value">${selectedCase.entryPoint}</div>
              </div>
              <div class="sg-detail-item">
                <div class="sg-detail-label">Trajectory</div>
                <div class="sg-detail-value">${selectedCase.trajectory}</div>
              </div>
              <div class="sg-detail-item">
                <div class="sg-detail-label">OR Time</div>
                <div class="sg-detail-value sg-or-time">${selectedCase.orTime}</div>
              </div>
              <div class="sg-detail-item">
                <div class="sg-detail-label">Surgery Date</div>
                <div class="sg-detail-value">${selectedCase.date}</div>
              </div>
              <div class="sg-detail-item">
                <div class="sg-detail-label">Evidence Grade</div>
                <div class="sg-detail-value"><span class="sg-evidence ${getEvidenceClass(selectedCase.evidence)}">Grade ${selectedCase.evidence}</span></div>
              </div>
              <div class="sg-detail-item" style="grid-column: 1 / -1;">
                <div class="sg-detail-label">Notes</div>
                <div class="sg-detail-value" style="font-weight:400;font-size:12px;line-height:1.5;">${selectedCase.notes}</div>
              </div>
            </div>
          </div>

          <div class="sg-checklist-panel">
            <div class="sg-checklist-title">Procedure Checklist — ${selectedCase.patient} (${checklistDone}/${checklistTotal})</div>
            ${renderChecklist({ ...selectedCase, checklist: caseChecklist })}
          </div>

          <div style="background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 20px; margin-top: 20px;">
            <div class="sg-detail-title">Evidence Legend</div>
            <div class="sg-evidence-legend">
              <span class="sg-evidence-legend-item"><span class="sg-evidence sg-evidence-a">A</span> Meta-analysis / RCT</span>
              <span class="sg-evidence-legend-item"><span class="sg-evidence sg-evidence-b">B</span> Controlled trials</span>
              <span class="sg-evidence-legend-item"><span class="sg-evidence sg-evidence-c">C</span> Observational</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  buildHTML();

  // Event delegation for filter buttons and row selection
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.sg-filter-btn');
    if (btn) {
      activeFilter = btn.dataset.filter;
      buildHTML();
      return;
    }
    const row = e.target.closest('.sg-table tbody tr');
    if (row) {
      const id = parseInt(row.dataset.id);
      const found = cases.find(c => c.id === id);
      if (found) { selectedCase = found; buildHTML(); }
    }
  });

  return container;
}

export default { pgSurgicalPlanning };
