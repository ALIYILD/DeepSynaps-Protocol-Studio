/
import { api } from './api.js';
import { currentUser } from './state.js';

**
 * pages-home-program.js — Home Therapy Task Assignment + Tracking
 *
 * Scope: home exercise program management, task assignment to patients,
 * adherence tracking, overdue task alerts, and trend visualization.
 *
 * Safety: home program adherence does not replace clinical supervision.
 */


const PROGRAM_TYPES = ['Exercise', 'Cognitive Training', 'Mindfulness', 'ADL Practice', 'Balance', 'Speech', 'Hand Therapy', 'Gait Training'];
const STATUS_FILTERS = ['All', 'On track', 'At risk', 'Non-adherent', 'Completed'];

const DEMO_PROGRAMS_FALLBACK = [
  { id: 'hp1', patient: 'Eleanor Vance', patientId: 'P1001', program: 'Post-Stroke Balance Exercises', type: 'Balance', tasks: 5, completed: 4, adherence: 92, lastActivity: '2024-11-08', nextDue: '2024-11-09', status: 'On track', clinician: 'Dr. Sarah Mitchell' },
  { id: 'hp2', patient: 'Marcus Chen', patientId: 'P1002', program: 'Cognitive Training Suite', type: 'Cognitive Training', tasks: 7, completed: 3, adherence: 58, lastActivity: '2024-11-05', nextDue: '2024-11-09', status: 'At risk', clinician: 'Dr. James Chen' },
  { id: 'hp3', patient: 'Sophia Patel', patientId: 'P1003', program: 'Daily Mindfulness Practice', type: 'Mindfulness', tasks: 3, completed: 0, adherence: 0, lastActivity: '2024-10-30', nextDue: '2024-11-01', status: 'Non-adherent', clinician: 'Dr. Amara Patel' },
  { id: 'hp4', patient: 'James O\'Brien', patientId: 'P1004', program: 'Upper Extremity Exercise', type: 'Exercise', tasks: 6, completed: 6, adherence: 100, lastActivity: '2024-11-08', nextDue: '2024-11-09', status: 'Completed', clinician: 'Dr. Sarah Mitchell' },
  { id: 'hp5', patient: 'Aisha Johnson', patientId: 'P1005', program: 'Gait Training Home Program', type: 'Gait Training', tasks: 4, completed: 3, adherence: 85, lastActivity: '2024-11-07', nextDue: '2024-11-09', status: 'On track', clinician: 'Dr. James Chen' },
  { id: 'hp6', patient: 'Robert Kim', patientId: 'P1006', program: 'Speech Therapy Drills', type: 'Speech', tasks: 5, completed: 2, adherence: 48, lastActivity: '2024-11-03', nextDue: '2024-11-08', status: 'At risk', clinician: 'Tom Nguyen, PsyD' },
  { id: 'hp7', patient: 'Diana Martinez', patientId: 'P1007', program: 'ADL Independence Practice', type: 'ADL Practice', tasks: 8, completed: 8, adherence: 100, lastActivity: '2024-11-08', nextDue: '—', status: 'Completed', clinician: 'Lisa Rodriguez, LCSW' },
  { id: 'hp8', patient: 'Thomas Wright', patientId: 'P1008', program: 'Fine Motor Hand Exercises', type: 'Hand Therapy', tasks: 4, completed: 3, adherence: 78, lastActivity: '2024-11-06', nextDue: '2024-11-09', status: 'On track', clinician: 'Dr. Sarah Mitchell' },
  { id: 'hp9', patient: 'Linda Foster', patientId: 'P1009', program: 'Cognitive Memory Tasks', type: 'Cognitive Training', tasks: 6, completed: 1, adherence: 22, lastActivity: '2024-10-28', nextDue: '2024-11-05', status: 'Non-adherent', clinician: 'Dr. James Chen' },
  { id: 'hp10', patient: 'David Park', patientId: 'P1010', program: 'Mindfulness for Sleep', type: 'Mindfulness', tasks: 3, completed: 3, adherence: 95, lastActivity: '2024-11-08', nextDue: '2024-11-09', status: 'On track', clinician: 'Dr. Amara Patel' },
  { id: 'hp11', patient: 'Catherine Liu', patientId: 'P1011', program: 'Lower Body Strengthening', type: 'Exercise', tasks: 5, completed: 4, adherence: 88, lastActivity: '2024-11-07', nextDue: '2024-11-09', status: 'On track', clinician: 'Dr. Sarah Mitchell' },
  { id: 'hp12', patient: 'Samuel Torres', patientId: 'P1012', program: 'Balance & Coordination', type: 'Balance', tasks: 4, completed: 2, adherence: 62, lastActivity: '2024-11-04', nextDue: '2024-11-09', status: 'At risk', clinician: 'Dr. Karen Walsh' },
  { id: 'hp13', patient: 'Emily Watson', patientId: 'P1013', program: 'Relaxation Techniques', type: 'Mindfulness', tasks: 3, completed: 3, adherence: 100, lastActivity: '2024-11-08', nextDue: '2024-11-09', status: 'Completed', clinician: 'Dr. Amara Patel' },
  { id: 'hp14', patient: 'Michael Brooks', patientId: 'P1014', program: 'Functional Mobility Drills', type: 'Exercise', tasks: 6, completed: 5, adherence: 90, lastActivity: '2024-11-08', nextDue: '2024-11-09', status: 'On track', clinician: 'Dr. James Chen' },
  { id: 'hp15', patient: 'Olivia Reed', patientId: 'P1015', program: 'Speech Clarity Practice', type: 'Speech', tasks: 4, completed: 0, adherence: 15, lastActivity: '2024-10-20', nextDue: '2024-11-01', status: 'Non-adherent', clinician: 'Tom Nguyen, PsyD' },
];


let programsData = DEMO_PROGRAMS_FALLBACK;
const DEMO_TASKS = {
  hp1: [
    { name: 'Single-leg stance', frequency: 'Daily', dueDate: '2024-11-09', completedDates: ['2024-11-01','2024-11-02','2024-11-04','2024-11-05','2024-11-06','2024-11-07','2024-11-08'], duration: '5 min' },
    { name: 'Heel-to-toe walk', frequency: 'Daily', dueDate: '2024-11-09', completedDates: ['2024-11-01','2024-11-02','2024-11-03','2024-11-05','2024-11-06','2024-11-07','2024-11-08'], duration: '10 min' },
    { name: 'Sit-to-stand reps', frequency: '3x/week', dueDate: '2024-11-09', completedDates: ['2024-11-01','2024-11-04','2024-11-06','2024-11-08'], duration: '10 reps' },
    { name: 'Balance board practice', frequency: 'Daily', dueDate: '2024-11-09', completedDates: ['2024-11-02','2024-11-04','2024-11-05','2024-11-07','2024-11-08'], duration: '5 min' },
    { name: 'Side-stepping exercise', frequency: 'Daily', dueDate: '2024-11-09', completedDates: ['2024-11-01','2024-11-03','2024-11-05','2024-11-06','2024-11-07','2024-11-08'], duration: '5 min' },
  ],
  hp2: [
    { name: 'Memory recall cards', frequency: 'Daily', dueDate: '2024-11-09', completedDates: ['2024-11-01','2024-11-03','2024-11-05','2024-11-08'], duration: '15 min' },
    { name: 'Pattern matching', frequency: 'Daily', dueDate: '2024-11-09', completedDates: ['2024-11-02','2024-11-05','2024-11-08'], duration: '10 min' },
    { name: 'Word fluency drill', frequency: 'Daily', dueDate: '2024-11-09', completedDates: ['2024-11-01','2024-11-04'], duration: '10 min' },
    { name: 'Attention shifting task', frequency: 'Daily', dueDate: '2024-11-09', completedDates: ['2024-11-03','2024-11-06','2024-11-08'], duration: '10 min' },
    { name: ' sequencing exercise', frequency: 'Daily', dueDate: '2024-11-09', completedDates: ['2024-11-01','2024-11-05'], duration: '10 min' },
    { name: 'Dual-task training', frequency: '3x/week', dueDate: '2024-11-09', completedDates: ['2024-11-04','2024-11-07'], duration: '15 min' },
    { name: 'Cognitive speed drill', frequency: 'Daily', dueDate: '2024-11-09', completedDates: ['2024-11-02','2024-11-06','2024-11-08'], duration: '10 min' },
  ],
};

let _programFilter = 'All';
let _selectedProgramId = null;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'on track') return '<span class="hp-badge hp-ontrack">On track</span>';
  if (s === 'at risk') return '<span class="hp-badge hp-atrisk">At risk</span>';
  if (s === 'non-adherent') return '<span class="hp-badge hp-nonadherent">Non-adherent</span>';
  if (s === 'completed') return '<span class="hp-badge hp-completed">Completed</span>';
  return `<span class="hp-badge">${esc(status)}</span>`;
}

function _kpiCards() {
  const active = programsData.filter(p => p.status !== 'Completed').length;
  const tasks = DEMO_PROGRAMS.reduce((s, p) => s + p.tasks, 0);
  const completionRate = Math.round(DEMO_PROGRAMS.reduce((s, p) => s + p.adherence, 0) / DEMO_PROGRAMS.length);
  const overdue = programsData.filter(p => {
    if (p.status === 'Completed' || p.nextDue === '—') return false;
    return new Date(p.nextDue) < new Date('2024-11-09');
  }).length;

  return `
    <div class="kpi-grid">
      <div class="kpi-card" style="border-top:3px solid var(--blue)">
        <div class="kpi-value" style="color:var(--blue)">${active}</div>
        <div class="kpi-label">Active programs</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--purple)">
        <div class="kpi-value" style="color:var(--purple)">${tasks}</div>
        <div class="kpi-label">Tasks assigned</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--success)">
        <div class="kpi-value" style="color:var(--success)">${completionRate}%</div>
        <div class="kpi-label">Completion rate</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--danger)">
        <div class="kpi-value" style="color:var(--danger)">${overdue}</div>
        <div class="kpi-label">Overdue tasks</div>
      </div>
    </div>`;
}

function _filterTabs() {
  return `
    <div class="filter-tabs">
      ${STATUS_FILTERS.map(f => {
        const active = _programFilter === f ? 'active' : '';
        return `<button class="filter-tab ${active}" onclick="window._hpSetFilter('${esc(f)}')">${esc(f)}</button>`;
      }).join('')}
    </div>`;
}

function _filteredPrograms() {
  if (_programFilter === 'All') return DEMO_PROGRAMS;
  return programsData.filter(p => String(p.status).toLowerCase() === _programFilter.toLowerCase());
}

function _programTable(programs) {
  if (programs.length === 0) {
    return `
      <div style="padding:40px 16px;text-align:center;border:1px dashed var(--border);border-radius:12px;margin-top:16px">
        <div style="font-size:2rem;margin-bottom:8px">🏠</div>
        <div style="font-weight:600;font-size:13px;margin-bottom:4px;color:var(--text-primary)">No programs found</div>
        <div style="font-size:12px;color:var(--text-secondary)">No programs match the selected filter.</div>
      </div>`;
  }

  const rows = programs.map(p => `
    <tr style="cursor:pointer" onclick="window._hpSelectProgram('${esc(p.id)}')">
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
        <div style="font-weight:600">${esc(p.patient)}</div>
        <div style="font-size:11px;color:var(--text-tertiary)">${esc(p.patientId)}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
        <div style="font-weight:500">${esc(p.program)}</div>
        <div style="font-size:11px;color:var(--text-tertiary)">${esc(p.type)}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);text-align:center">${p.tasks}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);text-align:center">${p.completed}/${p.tasks}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;text-align:center">
        <div style="display:flex;align-items:center;justify-content:center;gap:6px">
          <div class="progress-bar" style="width:50px;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
            <div class="progress-fill ${p.adherence >= 80 ? 'high' : p.adherence >= 50 ? 'medium' : 'low'}" style="width:${p.adherence}%"></div>
          </div>
          <span style="font-weight:600;color:${p.adherence >= 80 ? 'var(--success)' : p.adherence >= 50 ? 'var(--warning)' : 'var(--danger)'};font-size:11px">${p.adherence}%</span>
        </div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${esc(p.lastActivity)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px">${_statusBadge(p.status)}</td>
    </tr>
  `).join('');

  return `
    <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg-card);margin-top:16px">
      <div style="overflow-x:auto">
        <table class="data-table" style="width:100%;border-collapse:collapse;min-width:720px">
          <thead>
            <tr style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary)">
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Patient</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Program</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Tasks</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Completed</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Adherence</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Last activity</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function _taskPanel(program) {
  if (!program) return '';
  const tasks = DEMO_TASKS[program.id] || [];

  let tasksHtml = '';
  if (tasks.length > 0) {
    const taskRows = tasks.map(t => {
      const completed = t.completedDates.length;
      const expected = t.frequency === 'Daily' ? 8 : 4;
      const pct = Math.round((completed / expected) * 100);
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;font-weight:500">${esc(t.name)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(t.frequency)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${esc(t.dueDate)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;text-align:center">${completed}/${expected}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px">
            <div style="display:flex;align-items:center;gap:6px">
              <div class="progress-bar" style="width:60px;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                <div class="progress-fill ${pct >= 80 ? 'high' : pct >= 50 ? 'medium' : 'low'}" style="width:${Math.min(pct, 100)}%"></div>
              </div>
              <span style="font-size:11px;color:var(--text-secondary)">${pct}%</span>
            </div>
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-tertiary);white-space:nowrap">${esc(t.duration)}</td>
        </tr>`;
    }).join('');

    tasksHtml = `
      <table style="width:100%;border-collapse:collapse;margin-top:8px">
        <thead>
          <tr style="text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary)">
            <th style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600">Task name</th>
            <th style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600">Frequency</th>
            <th style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600">Due date</th>
            <th style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600;text-align:center">Completed</th>
            <th style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600">Adherence</th>
            <th style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600">Duration</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>`;
  } else {
    tasksHtml = `
      <div style="padding:20px;text-align:center;border:1px dashed var(--border);border-radius:8px;margin-top:8px">
        <div style="font-size:12px;color:var(--text-secondary)">No task breakdown available for this program.</div>
      </div>`;
  }

  const evidenceGrade = program.adherence >= 80 ? 'A' : program.adherence >= 50 ? 'B' : 'C';

  return `
    <div id="program-detail-panel" style="border:1px solid var(--border);border-radius:12px;padding:20px;background:var(--bg-card);margin-top:16px;animation:fadeIn 0.2s ease">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${esc(program.program)}</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${esc(program.patient)} · ${esc(program.patientId)} · Clinician: ${esc(program.clinician)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="window._hpCloseDetail()">Close</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px">
        <div style="padding:10px;border-radius:8px;background:rgba(148,163,184,0.06)">
          <div style="font-size:11px;color:var(--text-tertiary)">Tasks</div>
          <div style="font-size:16px;font-weight:700">${program.tasks}</div>
        </div>
        <div style="padding:10px;border-radius:8px;background:rgba(148,163,184,0.06)">
          <div style="font-size:11px;color:var(--text-tertiary)">Completed</div>
          <div style="font-size:16px;font-weight:700">${program.completed}/${program.tasks}</div>
        </div>
        <div style="padding:10px;border-radius:8px;background:rgba(148,163,184,0.06)">
          <div style="font-size:11px;color:var(--text-tertiary)">Adherence</div>
          <div style="font-size:16px;font-weight:700;color:${program.adherence >= 80 ? 'var(--success)' : program.adherence >= 50 ? 'var(--warning)' : 'var(--danger)'}">${program.adherence}%</div>
        </div>
        <div style="padding:10px;border-radius:8px;background:rgba(148,163,184,0.06)">
          <div style="font-size:11px;color:var(--text-tertiary)">Evidence grade</div>
          <div style="font-size:13px;margin-top:2px">${_evidenceBadge(evidenceGrade)}</div>
        </div>
      </div>
      <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Task Breakdown</div>
      ${tasksHtml}
      <div style="padding:10px;border-radius:8px;background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.2);font-size:11px;color:var(--text-secondary);line-height:1.45;margin-top:12px">
        <strong style="color:var(--red)">⚠ Safety reminder:</strong> Home program adherence does not replace clinical supervision. Patients showing non-adherent status require follow-up assessment.
      </div>
    </div>`;
}

function _evidenceBadge(grade) {
  const g = String(grade || '').toUpperCase();
  if (g === 'A') return '<span class="evidence-badge evidence-a">Grade A</span>';
  if (g === 'B') return '<span class="evidence-badge evidence-b">Grade B</span>';
  if (g === 'C') return '<span class="evidence-badge evidence-c">Grade C</span>';
  return '<span class="evidence-badge">—</span>';
}

function _safetyBanner() {
  return `
    <div class="safety-banner" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);margin-bottom:16px;font-size:12px;color:var(--text-secondary);line-height:1.45">
      <strong style="color:var(--red)">⚠ Clinical safety:</strong> Home program adherence does not replace clinical supervision. All home programs require periodic in-person reassessment by a licensed clinician.
    </div>`;
}

function _render(navigate) {
  const programs = _filteredPrograms();
  const selectedProgram = _selectedProgramId ? programsData.find(p => p.id === _selectedProgramId) : null;

  return `
    <div class="patient-container" style="padding:20px 16px 40px;max-width:1200px;margin:0 auto">
      <div class="patient-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div class="patient-title" style="font-size:20px;font-weight:800;color:var(--text-primary);margin-bottom:4px">Home Program Tracking</div>
          <div style="font-size:12px;color:var(--text-secondary)">Monitor home therapy assignments, task adherence, and completion trends</div>
        </div>
        <button class="btn btn-primary btn-export" onclick="window._hpExport()">Export CSV</button>
      </div>

      ${_safetyBanner()}
      ${_kpiCards()}
      ${_filterTabs()}
      ${_programTable(programs)}
      ${selectedProgram ? _taskPanel(selectedProgram) : ''}

      <style>
        .hp-badge { display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap; }
        .hp-ontrack { background:rgba(74,222,128,0.12);color:#16a34a;border:1px solid rgba(74,222,128,0.25); }
        .hp-atrisk { background:rgba(251,191,36,0.12);color:#b45309;border:1px solid rgba(251,191,36,0.25); }
        .hp-nonadherent { background:rgba(255,107,107,0.12);color:#dc2626;border:1px solid rgba(255,107,107,0.25); }
        .hp-completed { background:rgba(45,212,191,0.12);color:#0d9488;border:1px solid rgba(45,212,191,0.25); }
        .evidence-badge { display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600; }
        .evidence-a { background:rgba(74,222,128,0.12);color:#16a34a; }
        .evidence-b { background:rgba(96,165,250,0.12);color:#2563eb; }
        .evidence-c { background:rgba(251,191,36,0.12);color:#b45309; }
        .data-table th, .data-table td { font-variant-numeric:tabular-nums; }
        .data-table tbody tr:hover { background:rgba(148,163,184,0.06); }
        .kpi-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px; }
        .kpi-card { padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card); }
        .kpi-value { font-size:22px;font-weight:700;color:var(--text-primary); }
        .kpi-label { font-size:12px;color:var(--text-secondary);margin-top:2px; }
        .filter-tabs { display:flex;gap:4px;margin-top:16px;flex-wrap:wrap; }
        .filter-tab { padding:6px 14px;border-radius:8px;border:1px solid transparent;background:transparent;font-size:12px;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:all 0.15s; }
        .filter-tab:hover { background:rgba(148,163,184,0.08);color:var(--text-primary); }
        .filter-tab.active { background:rgba(96,165,250,0.1);color:var(--blue);border-color:rgba(96,165,250,0.25); }
        .progress-bar { height:8px;background:var(--border);border-radius:4px;overflow:hidden; }
        .progress-fill { height:100%;border-radius:4px;transition:width 0.3s; }
        .progress-fill.high { background:var(--success); }
        .progress-fill.medium { background:var(--warning); }
        .progress-fill.low { background:var(--danger); }
        @keyframes fadeIn { from { opacity:0;transform:translateY(-4px); } to { opacity:1;transform:translateY(0); } }
      </style>
    </div>`;
}

function _mount(html) {
  if (typeof document === 'undefined') return html;
  const host = document.getElementById('content');
  if (host) host.innerHTML = html;
  return html;
}

export async function pgHomeProgram(setTopbar, navigate) {
  setTopbar('Home Programs');

  // Try API first, fall back to demo data
  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';
  try {
    const resp = await api.getHomePrograms(clinicId);
    if (resp && resp.length > 0) { programsData = resp; }
    else if (resp && resp.items && resp.items.length > 0) { programsData = resp.items; }
  } catch (err) {
    console.warn('[HomeProgram] API error:', err.message);
    programsData = DEMO_PROGRAMS;
  }

  _programFilter = 'All';
  _selectedProgramId = null;

  const html = _render(navigate);
  _mount(html);

  if (typeof window !== 'undefined') {
    window._hpSetFilter = (f) => { _programFilter = f; _mount(_render(navigate)); };
    window._hpSelectProgram = (id) => { _selectedProgramId = id; _mount(_render(navigate)); };
    window._hpCloseDetail = () => { _selectedProgramId = null; _mount(_render(navigate)); };
    window._hpExport = () => {
      const rows = [['Patient', 'Patient ID', 'Program', 'Type', 'Tasks', 'Completed', 'Adherence %', 'Last Activity', 'Status']];
      programsData.forEach(p => rows.push([p.patient, p.patientId, p.program, p.type, p.tasks, p.completed, `${p.adherence}%`, p.lastActivity, p.status]));
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'home-programs-export.csv';
      a.click();
    };
  }

  return html;
}

/**
 * Calculate program-level adherence statistics for clinical dashboards.
 */
export function calculateAdherenceStats(programs) {
  if (!Array.isArray(programs) || programs.length === 0) {
    return { avgAdherence: 0, medianAdherence: 0, onTrackCount: 0, atRiskCount: 0, nonAdherentCount: 0 };
  }
  const sorted = [...programs].sort((a, b) => a.adherence - b.adherence);
  const avgAdherence = Math.round(programs.reduce((s, p) => s + p.adherence, 0) / programs.length);
  const mid = Math.floor(sorted.length / 2);
  const medianAdherence = sorted.length % 2 !== 0
    ? sorted[mid].adherence
    : Math.round((sorted[mid - 1].adherence + sorted[mid].adherence) / 2);
  const onTrackCount = programs.filter(p => String(p.status).toLowerCase() === 'on track').length;
  const atRiskCount = programs.filter(p => String(p.status).toLowerCase() === 'at risk').length;
  const nonAdherentCount = programs.filter(p => String(p.status).toLowerCase() === 'non-adherent').length;
  return { avgAdherence, medianAdherence, onTrackCount, atRiskCount, nonAdherentCount };
}

/**
 * Generate a clinical alert for patients with concerning adherence.
 * Returns an array of alert objects with severity and message.
 */
export function generateAdherenceAlerts(programs) {
  if (!Array.isArray(programs)) return [];
  const alerts = [];
  programs.forEach(p => {
    if (p.adherence < 30) {
      alerts.push({
        severity: 'critical',
        patientId: p.patientId,
        patient: p.patient,
        message: `Adherence critically low (${p.adherence}%) for ${p.program}`,
        programId: p.id,
      });
    } else if (p.adherence < 50) {
      alerts.push({
        severity: 'warning',
        patientId: p.patientId,
        patient: p.patient,
        message: `Adherence below threshold (${p.adherence}%) for ${p.program}`,
        programId: p.id,
      });
    }
  });
  return alerts;
}

export default { pgHomeProgram };

