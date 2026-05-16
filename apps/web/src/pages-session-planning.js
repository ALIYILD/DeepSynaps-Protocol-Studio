//


let sessionsData = DEMO_SESSIONS_FALLBACK;
import { api } from './api.js';
import { currentUser } from './auth.js';

/**
 * pages-session-planning.js
 * DeepSynaps Protocol Studio — Session Scheduling + Protocol Sequencing
 *
 * Features:
 *   - Session calendar grid (Mon-Sun) with session count badges
 *   - Session table with scheduling actions (schedule/reschedule/cancel/complete/clone)
 *   - Protocol sequencing blocks showing multi-week session ordering
 *   - KPI dashboard for sessions, compliance, active protocols
 *   - Filterable by: All, Upcoming, Today, This Week, Completed, Cancelled
 *   - Export controls for CSV and PDF
 */

const styles = `
<style>
  .sp-container { max-width: 1400px; margin: 0 auto; padding: 24px; }
  .sp-header { margin-bottom: 24px; }
  .sp-header h1 { font-size: 24px; font-weight: 700; color: var(--text-primary, #111827); margin: 0 0 4px 0; }
  .sp-header p { font-size: 13px; color: var(--text-secondary, #6b7280); margin: 0; }
  .sp-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .sp-kpi-card { background: var(--surface-1, #f9fafb); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 16px; transition: box-shadow .15s; }
  .sp-kpi-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
  .sp-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary, #6b7280); letter-spacing: 0.05em; margin-bottom: 6px; }
  .sp-kpi-value { font-size: 22px; font-weight: 700; color: var(--text-primary, #111827); margin-bottom: 2px; }
  .sp-kpi-sub { font-size: 11px; color: var(--text-secondary, #6b7280); }
  .sp-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
  .sp-filter-group { display: flex; gap: 6px; flex-wrap: wrap; }
  .sp-filter-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); background: var(--surface-0, #fff); font-size: 12px; font-weight: 500; color: var(--text-secondary, #6b7280); cursor: pointer; transition: all .15s; }
  .sp-filter-btn:hover { background: var(--surface-1, #f9fafb); }
  .sp-filter-btn.active { background: var(--accent, #2563eb); color: #fff; border-color: var(--accent, #2563eb); }
  .sp-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); background: var(--surface-0, #fff); font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s; display: inline-flex; align-items: center; gap: 6px; }
  .sp-btn:hover { background: var(--surface-1, #f9fafb); }
  .sp-btn-primary { background: var(--accent, #2563eb); color: #fff; border-color: var(--accent, #2563eb); }
  .sp-btn-primary:hover { background: #1d4ed8; }
  .sp-btn-danger { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
  .sp-btn-success { background: #dcfce7; color: #166534; border-color: #86efac; }
  .sp-table-wrap { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; overflow-x: auto; margin-bottom: 24px; }
  .sp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .sp-table thead th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary, #6b7280); background: var(--surface-1, #f9fafb); border-bottom: 1px solid var(--border, #e5e7eb); letter-spacing: 0.03em; white-space: nowrap; }
  .sp-table tbody td { padding: 10px 12px; border-bottom: 1px solid var(--border, #e5e7eb); color: var(--text-primary, #111827); vertical-align: middle; }
  .sp-table tbody tr:hover { background: var(--surface-1, #f9fafb); }
  .sp-table tbody tr:last-child td { border-bottom: none; }
  .sp-status { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .sp-status.scheduled { background: #dbeafe; color: #1e40af; }
  .sp-status.completed { background: #dcfce7; color: #166534; }
  .sp-status.cancelled { background: #fee2e2; color: #991b1b; }
  .sp-status.today { background: #fef3c7; color: #92400e; }
  .sp-status.upcoming { background: #e0e7ff; color: #3730a3; }
  .sp-actions { display: flex; gap: 4px; flex-wrap: wrap; }
  .sp-action-btn { padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border, #e5e7eb); background: var(--surface-0, #fff); font-size: 11px; cursor: pointer; transition: all .15s; }
  .sp-action-btn:hover { background: var(--surface-1, #f9fafb); }
  .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 24px; }
  .calendar-day-header { padding: 8px 4px; text-align: center; font-size: 11px; font-weight: 600; color: var(--text-secondary, #6b7280); background: var(--surface-1, #f9fafb); border-radius: 4px; }
  .calendar-day { min-height: 60px; padding: 4px; border: 1px solid var(--border, #e5e7eb); border-radius: 4px; font-size: 11px; background: var(--surface-0, #fff); }
  .calendar-day-number { font-weight: 600; font-size: 12px; margin-bottom: 2px; display: flex; justify-content: space-between; }
  .calendar-day-count { font-size: 10px; color: #fff; background: var(--accent, #2563eb); border-radius: 999px; padding: 1px 5px; font-weight: 600; }
  .calendar-day-session { padding: 2px 4px; border-radius: 3px; font-size: 10px; margin-bottom: 2px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: opacity .15s; }
  .calendar-day-session:hover { opacity: .75; }
  .calendar-session-tdcs { background: #dbeafe; color: #1e40af; }
  .calendar-session-tacs { background: #ede9fe; color: #5b21b6; }
  .calendar-session-tms { background: #fce7f3; color: #9d174d; }
  .calendar-session-trns { background: #ccfbf1; color: #0f766e; }
  .calendar-session-tpcs { background: #fef3c7; color: #92400e; }
  .calendar-day-empty { background: var(--surface-1, #f9fafb); border-style: dashed; opacity: .6; }
  .calendar-day-today { border: 2px solid var(--accent, #2563eb); }
  .sp-seq-panel { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 20px; margin-bottom: 24px; }
  .sp-seq-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary, #111827); }
  .sp-seq-subtitle { font-size: 12px; color: var(--text-secondary, #6b7280); margin-bottom: 12px; }
  .sp-seq-blocks { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .sp-seq-block { padding: 8px 14px; border-radius: 8px; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .sp-seq-arrow { color: var(--text-secondary, #6b7280); font-size: 14px; font-weight: 700; }
  .sp-seq-tdcs { background: #dbeafe; color: #1e40af; }
  .sp-seq-tacs { background: #ede9fe; color: #5b21b6; }
  .sp-seq-tms { background: #fce7f3; color: #9d174d; }
  .sp-seq-trns { background: #ccfbf1; color: #0f766e; }
  .sp-seq-tpcs { background: #fef3c7; color: #92400e; }
  .sp-seq-rest { background: var(--surface-1, #f9fafb); color: var(--text-secondary, #6b7280); border: 1px dashed var(--border, #e5e7eb); }
  .sp-seq-washout { background: #fee2e2; color: #991b1b; border: 1px dashed #fca5a5; }
  .sp-col2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .sp-export-bar { display: flex; gap: 8px; align-items: center; }
  .sp-footer-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: 11px; color: var(--text-secondary, #6b7280); }
  .sp-calendar-panel { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 16px; margin-bottom: 20px; }
  .sp-calendar-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary, #111827); }
  .sp-week-legend { display: flex; gap: 12px; align-items: center; margin-top: 12px; font-size: 11px; color: var(--text-secondary, #6b7280); flex-wrap: wrap; }
  .sp-week-legend-item { display: inline-flex; align-items: center; gap: 4px; }
  .sp-device-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .sp-summary-panel { background: var(--surface-0, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .sp-summary-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary, #111827); }
  .sp-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .sp-summary-item { padding: 10px; background: var(--surface-1, #f9fafb); border-radius: 6px; text-align: center; }
  .sp-summary-label { font-size: 10px; font-weight: 600; color: var(--text-secondary, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; }
  .sp-summary-value { font-size: 16px; font-weight: 700; color: var(--text-primary, #111827); }
  @media (max-width: 1024px) {
    .sp-kpi-row { grid-template-columns: repeat(2, 1fr); }
    .sp-col2 { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .sp-kpi-row { grid-template-columns: 1fr; }
  }
</style>
`;

/** Session dataset — 15 sessions across the current and upcoming weeks. */
const DEMO_SESSIONS = [
  { id: 1, date: '2025-01-20', time: '09:00', patient: 'P-1001', protocol: 'M1-SOHD', device: 'tDCS', duration: 20, status: 'completed', notes: 'Good tolerance, no AEs' },
  { id: 2, date: '2025-01-21', time: '10:30', patient: 'P-1002', protocol: 'DLPFC-Bifrontal', device: 'tDCS', duration: 20, status: 'completed', notes: 'Slight tingling reported at 1.5mA' },
  { id: 3, date: '2025-01-22', time: '14:00', patient: 'P-1003', protocol: 'tACS-Alpha', device: 'tACS', duration: 10, status: 'today', notes: 'Scheduled for today — phosphene check' },
  { id: 4, date: '2025-01-22', time: '16:00', patient: 'P-1001', protocol: 'rTMS-DLPFC', device: 'TMS', duration: 10, status: 'today', notes: 'Second session today, motor threshold confirmed' },
  { id: 5, date: '2025-01-23', time: '09:00', patient: 'P-1004', protocol: 'tRNS-M1', device: 'tRNS', duration: 15, status: 'scheduled', notes: 'First session — baseline assessment' },
  { id: 6, date: '2025-01-23', time: '11:00', patient: 'P-1005', protocol: 'M1-SOHD', device: 'tDCS', duration: 20, status: 'scheduled', notes: 'Follow-up session, week 2' },
  { id: 7, date: '2025-01-24', time: '10:00', patient: 'P-1006', protocol: 'tPCS-Prefrontal', device: 'tPCS', duration: 20, status: 'scheduled', notes: 'Pilot protocol — monitor skin redness' },
  { id: 8, date: '2025-01-24', time: '13:30', patient: 'P-1002', protocol: 'rTMS-SMA', device: 'TMS', duration: 5, status: 'scheduled', notes: 'SMA stimulation at 5Hz' },
  { id: 9, date: '2025-01-24', time: '15:00', patient: 'P-1007', protocol: 'tDCS-Cerebellar', device: 'tDCS', duration: 20, status: 'scheduled', notes: 'Cerebellar target — balance assessment pre' },
  { id: 10, date: '2025-01-27', time: '09:00', patient: 'P-1008', protocol: 'tACS-Gamma', device: 'tACS', duration: 20, status: 'upcoming', notes: 'Gamma protocol — cognitive task battery' },
  { id: 11, date: '2025-01-27', time: '11:00', patient: 'P-1003', protocol: 'tACS-Alpha', device: 'tACS', duration: 10, status: 'upcoming', notes: 'Repeat alpha session' },
  { id: 12, date: '2025-01-28', time: '14:00', patient: 'P-1009', protocol: 'DCS-Epidural', device: 'DCS', duration: 60, status: 'upcoming', notes: 'Epidural implant test — OR standby' },
  { id: 13, date: '2025-01-15', time: '09:00', patient: 'P-1010', protocol: 'tDCS-Temporal', device: 'tDCS', duration: 20, status: 'cancelled', notes: 'Patient withdrew consent before session' },
  { id: 14, date: '2025-01-16', time: '10:00', patient: 'P-1011', protocol: 'tACS-Gamma', device: 'tACS', duration: 20, status: 'cancelled', notes: 'Equipment failure — stimulator calibration error' },
  { id: 15, date: '2025-01-29', time: '09:00', patient: 'P-1001', protocol: 'rTMS-DLPFC', device: 'TMS', duration: 10, status: 'upcoming', notes: 'Continuation of DLPFC rTMS block' }
];

/** Protocol sequence blocks for a 3-week intervention example. */
const sequenceBlocks = [
  { phase: 'Baseline Assessment', type: 'rest', day: 'Day 1', desc: 'Cognitive battery + MRI' },
  { phase: 'tDCS L-DLPFC', type: 'tdcs', day: 'Days 2-6', desc: '2mA, 20min, F3-F4' },
  { phase: 'Rest Day', type: 'rest', day: 'Day 7', desc: 'No stimulation' },
  { phase: 'tACS Alpha', type: 'tacs', day: 'Days 8-12', desc: '10Hz, O1-O2, 1mA' },
  { phase: 'Washout', type: 'washout', day: 'Days 13-14', desc: 'No stimulation, retest' },
  { phase: 'rTMS M1', type: 'tms', day: 'Days 15-19', desc: '10Hz, 80% RMT, C3' },
  { phase: 'Follow-up', type: 'rest', day: 'Days 20-21', desc: 'Post assessment battery' }
];

function getStatusClass(s) { return `sp-status ${s}`; }

function getDeviceSessionClass(d) {
  const map = { tDCS: 'calendar-session-tdcs', tACS: 'calendar-session-tacs', TMS: 'calendar-session-tms', tRNS: 'calendar-session-trns', tPCS: 'calendar-session-tpcs', DCS: 'calendar-session-tdcs' };
  return map[d] || 'calendar-session-tdcs';
}

function getSeqClass(t) {
  const map = { tdcs: 'sp-seq-tdcs', tacs: 'sp-seq-tacs', tms: 'sp-seq-tms', trns: 'sp-seq-trns', tpcs: 'sp-seq-tpcs', rest: 'sp-seq-rest', washout: 'sp-seq-washout' };
  return map[t] || 'sp-seq-rest';
}

function getDeviceClass(d) {
  const map = { tDCS: 'dp-device-tdcs', tACS: 'dp-device-tacs', tRNS: 'dp-device-trns', tPCS: 'dp-device-tpcs', TMS: 'dp-device-tms', DCS: 'dp-device-dcs' };
  return map[d] || 'dp-device-tdcs';
}

function renderTable(filter) {
  let data = sessions;
  const today = '2025-01-22';
  const thisWeekEnd = '2025-01-26';
  if (filter === 'upcoming') data = sessions.filter(s => s.status === 'upcoming');
  if (filter === 'today') data = sessions.filter(s => s.status === 'today');
  if (filter === 'this-week') data = sessions.filter(s => s.date >= today && s.date <= thisWeekEnd);
  if (filter === 'completed') data = sessions.filter(s => s.status === 'completed');
  if (filter === 'cancelled') data = sessions.filter(s => s.status === 'cancelled');
  return data.map(s => `
    <tr>
      <td>${s.date}</td>
      <td>${s.time}</td>
      <td><strong>${s.patient}</strong></td>
      <td>${s.protocol}</td>
      <td><span class="dp-device-badge ${getDeviceClass(s.device)}">${s.device}</span></td>
      <td>${s.duration} min</td>
      <td><span class="${getStatusClass(s.status)}">${s.status}</span></td>
      <td style="font-size:11px;color:var(--text-secondary, #6b7280);max-width:200px;overflow:hidden;text-overflow:ellipsis;">${s.notes}</td>
      <td>
        <div class="sp-actions">
          ${s.status === 'scheduled' || s.status === 'upcoming' ? `<button class="sp-action-btn" data-id="${s.id}" data-action="reschedule">Reschedule</button><button class="sp-action-btn sp-btn-danger" data-id="${s.id}" data-action="cancel">Cancel</button>` : ''}
          ${s.status === 'today' ? `<button class="sp-action-btn sp-btn-success" data-id="${s.id}" data-action="complete">Complete</button><button class="sp-action-btn" data-id="${s.id}" data-action="clone">Clone</button>` : ''}
          ${s.status === 'cancelled' ? `<button class="sp-action-btn" data-id="${s.id}" data-action="clone">Clone</button>` : ''}
          ${s.status === 'completed' ? `<button class="sp-action-btn" data-id="${s.id}" data-action="clone">Clone</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function renderCalendar() {
  const days = [
    { d: 20, sessions: sessions.filter(s => s.date === '2025-01-20') },
    { d: 21, sessions: sessions.filter(s => s.date === '2025-01-21') },
    { d: 22, sessions: sessions.filter(s => s.date === '2025-01-22'), today: true },
    { d: 23, sessions: sessions.filter(s => s.date === '2025-01-23') },
    { d: 24, sessions: sessions.filter(s => s.date === '2025-01-24') },
    { d: 25, sessions: sessions.filter(s => s.date === '2025-01-25') },
    { d: 26, sessions: sessions.filter(s => s.date === '2025-01-26') }
  ];
  const headers = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return `
    <div class="calendar-grid">
      ${headers.map(h => `<div class="calendar-day-header">${h}</div>`).join('')}
      ${days.map(day => `
        <div class="calendar-day ${day.today ? 'calendar-day-today' : ''} ${day.sessions.length === 0 ? 'calendar-day-empty' : ''}">
          <div class="calendar-day-number">
            ${day.d}
            ${day.sessions.length > 0 ? `<span class="calendar-day-count">${day.sessions.length}</span>` : ''}
          </div>
          ${day.sessions.map(s => `
            <div class="calendar-day-session ${getDeviceSessionClass(s.device)}" title="${s.patient} | ${s.protocol} | ${s.time}">
              ${s.time} ${s.patient}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function renderSequence() {
  return sequenceBlocks.map((b, i) => `
    <div class="sp-seq-block ${getSeqClass(b.type)}" title="${b.desc}">
      <span>${b.day}: ${b.phase}</span>
    </div>
    ${i < sequenceBlocks.length - 1 ? '<span class="sp-seq-arrow">&rarr;</span>' : ''}
  `).join('');
}

export async function pgSessionPlanning(setTopbar, navigate) {
  if (typeof setTopbar === 'function') {
    setTopbar('Session Planning', [
      { label: 'Dashboard', action: () => navigate && navigate('dashboard') },
      { label: 'Devices', action: () => navigate && navigate('device-planning') },
      { label: 'Targets', action: () => navigate && navigate('stimulation-targets') },
      { label: 'Surgical', action: () => navigate && navigate('surgical-planning') }
    ]);
  }

  // Try API first, fall back to demo data
  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';
  let sessions = DEMO_SESSIONS;
  try {
    const resp = await api.getSessions(clinicId);
    if (resp && resp.length > 0) { sessions = resp; }
    else if (resp && resp.items && resp.items.length > 0) { sessions = resp.items; }
  } catch (err) {
    console.warn('[SessionPlanning] API error:', err.message);
    sessions = DEMO_SESSIONS;
  }

  let activeFilter = 'this-week';
  const container = document.createElement('div');
  container.className = 'sp-container';

  function buildHTML() {
    const scheduled = sessions.filter(s => s.status === 'scheduled' || s.status === 'upcoming' || s.status === 'today').length;
    const thisWeek = sessions.filter(s => s.date >= '2025-01-20' && s.date <= '2025-01-26').length;
    const active = sessions.filter(s => s.status === 'today').length;
    const completed = sessions.filter(s => s.status === 'completed').length;
    const total = sessions.length;
    const nonCancelled = total - sessions.filter(s => s.status === 'cancelled').length;
    const compliance = nonCancelled > 0 ? Math.round((completed / nonCancelled) * 100) : 0;

    container.innerHTML = styles + `
      <div class="sp-header">
        <h1>Session Scheduling</h1>
        <p>Schedule and sequence neuromodulation sessions across protocols and weeks</p>
      </div>

      <div class="sp-kpi-row">
        <div class="sp-kpi-card">
          <div class="sp-kpi-label">Sessions Scheduled</div>
          <div class="sp-kpi-value">${scheduled}</div>
          <div class="sp-kpi-sub">Active + upcoming sessions</div>
        </div>
        <div class="sp-kpi-card">
          <div class="sp-kpi-label">This Week</div>
          <div class="sp-kpi-value">${thisWeek}</div>
          <div class="sp-kpi-sub">January 20-26, 2025</div>
        </div>
        <div class="sp-kpi-card">
          <div class="sp-kpi-label">Protocols Active</div>
          <div class="sp-kpi-value">${active}</div>
          <div class="sp-kpi-sub">Sessions scheduled today</div>
        </div>
        <div class="sp-kpi-card">
          <div class="sp-kpi-label">Compliance Rate</div>
          <div class="sp-kpi-value">${compliance}%</div>
          <div class="sp-kpi-sub">Completed / total scheduled</div>
        </div>
      </div>

      <div class="sp-seq-panel">
        <div class="sp-seq-title">Protocol Sequencing — 3-Week Intervention Block</div>
        <div class="sp-seq-subtitle">Example schedule showing ordered stimulation phases with washout periods</div>
        <div class="sp-seq-blocks">
          ${renderSequence()}
        </div>
      </div>

      <div class="sp-summary-panel">
        <div class="sp-summary-title">Session Summary — Device Breakdown</div>
        <div class="sp-summary-grid">
          <div class="sp-summary-item">
            <div class="sp-summary-label">tDCS Sessions</div>
            <div class="sp-summary-value">${sessions.filter(s => s.device === 'tDCS').length}</div>
          </div>
          <div class="sp-summary-item">
            <div class="sp-summary-label">tACS Sessions</div>
            <div class="sp-summary-value">${sessions.filter(s => s.device === 'tACS').length}</div>
          </div>
          <div class="sp-summary-item">
            <div class="sp-summary-label">TMS Sessions</div>
            <div class="sp-summary-value">${sessions.filter(s => s.device === 'TMS').length}</div>
          </div>
          <div class="sp-summary-item">
            <div class="sp-summary-label">Other Devices</div>
            <div class="sp-summary-value">${sessions.filter(s => s.device !== 'tDCS' && s.device !== 'tACS' && s.device !== 'TMS').length}</div>
          </div>
        </div>
      </div>

      <div class="sp-calendar-panel">
        <div class="sp-calendar-title">Week at a Glance — January 20-26, 2025</div>
        ${renderCalendar()}
        <div class="sp-week-legend">
          <span class="sp-week-legend-item"><span class="sp-device-dot" style="background:#dbeafe;"></span> tDCS</span>
          <span class="sp-week-legend-item"><span class="sp-device-dot" style="background:#ede9fe;"></span> tACS</span>
          <span class="sp-week-legend-item"><span class="sp-device-dot" style="background:#fce7f3;"></span> TMS</span>
          <span class="sp-week-legend-item"><span class="sp-device-dot" style="background:#ccfbf1;"></span> tRNS</span>
          <span class="sp-week-legend-item"><span class="sp-device-dot" style="background:#fef3c7;"></span> tPCS</span>
          <span class="sp-week-legend-item"><span class="sp-device-dot" style="background:#2563eb;"></span> Today highlighted</span>
        </div>
      </div>

      <div class="sp-toolbar">
        <div class="sp-filter-group">
          <button class="sp-filter-btn ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${total})</button>
          <button class="sp-filter-btn ${activeFilter === 'upcoming' ? 'active' : ''}" data-filter="upcoming">Upcoming</button>
          <button class="sp-filter-btn ${activeFilter === 'today' ? 'active' : ''}" data-filter="today">Today</button>
          <button class="sp-filter-btn ${activeFilter === 'this-week' ? 'active' : ''}" data-filter="this-week">This Week</button>
          <button class="sp-filter-btn ${activeFilter === 'completed' ? 'active' : ''}" data-filter="completed">Completed</button>
          <button class="sp-filter-btn ${activeFilter === 'cancelled' ? 'active' : ''}" data-filter="cancelled">Cancelled</button>
        </div>
        <div class="sp-export-bar">
          <button class="sp-btn sp-btn-primary">+ Schedule Session</button>
          <button class="sp-btn">Export CSV</button>
          <button class="sp-btn">Export PDF</button>
        </div>
      </div>

      <div class="sp-table-wrap">
        <table class="sp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Patient</th>
              <th>Protocol</th>
              <th>Device</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${renderTable(activeFilter)}
          </tbody>
        </table>
        <div class="sp-footer-bar">
          <span>Showing ${sessions.filter(s => {
            if (activeFilter === 'all') return true;
            if (activeFilter === 'upcoming') return s.status === 'upcoming';
            if (activeFilter === 'today') return s.status === 'today';
            if (activeFilter === 'this-week') return s.date >= '2025-01-20' && s.date <= '2025-01-26';
            if (activeFilter === 'completed') return s.status === 'completed';
            if (activeFilter === 'cancelled') return s.status === 'cancelled';
            return true;
          }).length} sessions</span>
          <span>Last updated: ${new Date().toLocaleDateString()}</span>
        </div>
      </div>
    `;
  }

  buildHTML();

  // Event delegation for filter buttons, session actions
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.sp-filter-btn');
    if (btn) {
      activeFilter = btn.dataset.filter;
      buildHTML();
      return;
    }
    const actionBtn = e.target.closest('.sp-action-btn');
    if (actionBtn) {
      const id = parseInt(actionBtn.dataset.id);
      const action = actionBtn.dataset.action;
      const s = sessions.find(x => x.id === id);
      if (!s) return;
      if (action === 'complete') {
        s.status = 'completed';
        s.notes = s.notes + ' — Completed';
      }
      if (action === 'cancel') {
        s.status = 'cancelled';
        s.notes = 'Cancelled by operator';
      }
      if (action === 'clone') {
        const clone = { ...s, id: sessions.length + 1, date: '2025-02-03', time: '09:00', status: 'scheduled', notes: 'Cloned from session ' + s.id };
        sessions.push(clone);
      }
      if (action === 'reschedule') {
        s.date = '2025-02-03';
        s.status = 'upcoming';
        s.notes = 'Rescheduled from ' + s.date;
      }
      buildHTML();
    }
  });

  return container;
}

export default { pgSessionPlanning };
