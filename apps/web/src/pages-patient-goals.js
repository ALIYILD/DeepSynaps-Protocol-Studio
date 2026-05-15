/


let goalsData = DEMO_GOALS_FALLBACK;
mport { api } from './api.js';
import { currentUser } from './state.js';

**
 * pages-patient-goals.js — Patient Goal-Setting + Care Plan
 *
 * Scope: SMART goal tracking for patients across clinical domains.
 * Supports goal creation, progress updates, status transitions, and
 * archival. Goals are categorized by clinical domain with progress
 * visualization and evidence grading.
 *
 * Safety: goals should be set collaboratively between clinician and patient.
 */


const GOAL_CATEGORIES = ['Symptom reduction', 'Function', 'Quality of life', 'Adherence', 'Cognitive', 'Social'];
const GOAL_STATUSES = ['Active', 'Achieved', 'Paused', 'Overdue', 'Abandoned'];
const STATUS_FILTERS = ['All', 'Active', 'Achieved', 'Paused', 'Overdue', 'Abandoned'];

const DEMO_GOALS_FALLBACK = [
  { id: 'gl1', patient: 'Eleanor Vance', patientId: 'P1001', goal: 'Reduce anxiety episodes to fewer than 2 per week by end of month', category: 'Symptom reduction', progress: 75, targetDate: '2024-12-01', status: 'Active', created: '2024-09-01', clinician: 'Dr. Sarah Mitchell' },
  { id: 'gl2', patient: 'Eleanor Vance', patientId: 'P1001', goal: 'Complete 30-minute daily walk without assistive device', category: 'Function', progress: 60, targetDate: '2024-11-30', status: 'Active', created: '2024-08-15', clinician: 'Dr. Sarah Mitchell' },
  { id: 'gl3', patient: 'Marcus Chen', patientId: 'P1002', goal: 'Achieve MoCA score of 26 or higher on formal assessment', category: 'Cognitive', progress: 100, targetDate: '2024-11-15', status: 'Achieved', created: '2024-06-01', clinician: 'Dr. James Chen' },
  { id: 'gl4', patient: 'Marcus Chen', patientId: 'P1002', goal: 'Independently perform morning routine within 45 minutes', category: 'Function', progress: 80, targetDate: '2024-12-15', status: 'Active', created: '2024-09-10', clinician: 'Dr. James Chen' },
  { id: 'gl5', patient: 'Sophia Patel', patientId: 'P1003', goal: 'Maintain 85% adherence to home balance exercise program', category: 'Adherence', progress: 45, targetDate: '2024-11-20', status: 'Overdue', created: '2024-09-01', clinician: 'Dr. Amara Patel' },
  { id: 'gl6', patient: 'James O\'Brien', patientId: 'P1004', goal: 'Reduce TUG time to under 10 seconds consistently', category: 'Function', progress: 100, targetDate: '2024-10-31', status: 'Achieved', created: '2024-07-01', clinician: 'Dr. Sarah Mitchell' },
  { id: 'gl7', patient: 'Aisha Johnson', patientId: 'P1005', goal: 'Walk 400m continuously without rest breaks', category: 'Function', progress: 90, targetDate: '2024-12-01', status: 'Active', created: '2024-08-20', clinician: 'Dr. James Chen' },
  { id: 'gl8', patient: 'Robert Kim', patientId: 'P1006', goal: 'Improve sleep quality score (PSQI) below 8', category: 'Quality of life', progress: 55, targetDate: '2024-11-25', status: 'Active', created: '2024-09-15', clinician: 'Dr. Amara Patel' },
  { id: 'gl9', patient: 'Diana Martinez', patientId: 'P1007', goal: 'Participate in one social activity per week', category: 'Social', progress: 30, targetDate: '2024-11-15', status: 'Paused', created: '2024-08-01', clinician: 'Lisa Rodriguez, LCSW' },
  { id: 'gl10', patient: 'Thomas Wright', patientId: 'P1008', goal: 'Reduce self-reported pain level below 30mm on VAS', category: 'Symptom reduction', progress: 100, targetDate: '2024-11-01', status: 'Achieved', created: '2024-07-15', clinician: 'Dr. Sarah Mitchell' },
  { id: 'gl11', patient: 'Linda Foster', patientId: 'P1009', goal: 'Complete cognitive training exercises 5 days per week', category: 'Cognitive', progress: 40, targetDate: '2024-11-10', status: 'Overdue', created: '2024-09-01', clinician: 'Dr. James Chen' },
  { id: 'gl12', patient: 'David Park', patientId: 'P1010', goal: 'Increase SF-36 PCS score above 45', category: 'Quality of life', progress: 70, targetDate: '2024-12-10', status: 'Active', created: '2024-08-25', clinician: 'Dr. Amara Patel' },
  { id: 'gl13', patient: 'Catherine Liu', patientId: 'P1011', goal: 'Practice mindfulness meditation 10 minutes daily', category: 'Adherence', progress: 85, targetDate: '2024-12-01', status: 'Active', created: '2024-09-05', clinician: 'Dr. Amara Patel' },
  { id: 'gl14', patient: 'Samuel Torres', patientId: 'P1012', goal: 'Reduce PHQ-9 score below 5 and maintain for 4 weeks', category: 'Symptom reduction', progress: 100, targetDate: '2024-11-05', status: 'Achieved', created: '2024-06-15', clinician: 'Dr. Sarah Mitchell' },
  { id: 'gl15', patient: 'Olivia Reed', patientId: 'P1015', goal: 'Achieve Berg Balance Scale score of 45 for safe community ambulation', category: 'Function', progress: 65, targetDate: '2024-12-20', status: 'Active', created: '2024-09-20', clinician: 'Dr. Karen Walsh' },
];

let _goalFilter = 'All';
let _selectedGoalId = null;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return '<span class="gl-badge gl-active">Active</span>';
  if (s === 'achieved') return '<span class="gl-badge gl-achieved">Achieved</span>';
  if (s === 'paused') return '<span class="gl-badge gl-paused">Paused</span>';
  if (s === 'overdue') return '<span class="gl-badge gl-overdue">Overdue</span>';
  if (s === 'abandoned') return '<span class="gl-badge gl-abandoned">Abandoned</span>';
  return `<span class="gl-badge">${esc(status)}</span>`;
}

function _categoryIcon(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('symptom')) return '🩺';
  if (c.includes('function')) return '🏃';
  if (c.includes('quality')) return '🌟';
  if (c.includes('adherence')) return '✅';
  if (c.includes('cognitive')) return '🧠';
  if (c.includes('social')) return '👥';
  return '📝';
}

function _categoryColor(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('symptom')) return 'rgba(220,38,38,0.1)';
  if (c.includes('function')) return 'rgba(37,99,235,0.1)';
  if (c.includes('quality')) return 'rgba(234,179,8,0.1)';
  if (c.includes('adherence')) return 'rgba(22,163,74,0.1)';
  if (c.includes('cognitive')) return 'rgba(124,58,237,0.1)';
  if (c.includes('social')) return 'rgba(219,39,119,0.1)';
  return 'rgba(148,163,184,0.1)';
}

function _progressBar(pct) {
  const color = pct >= 80 ? 'high' : pct >= 50 ? 'medium' : 'low';
  return `
    <div class="progress-bar" style="width:100%;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
      <div class="progress-fill ${color}" style="width:${pct}%"></div>
    </div>`;
}

function _kpiCards() {
  const active = goalsData.filter(g => g.status === 'Active').length;
  const achieved = goalsData.filter(g => g.status === 'Achieved').length;
  const avgProgress = Math.round(goalsData.filter(g => g.status === 'Active').reduce((s, g) => s + g.progress, 0) / Math.max(goalsData.filter(g => g.status === 'Active').length, 1));
  const overdue = goalsData.filter(g => g.status === 'Overdue').length;

  return `
    <div class="kpi-grid">
      <div class="kpi-card" style="border-top:3px solid var(--blue)">
        <div class="kpi-value" style="color:var(--blue)">${active}</div>
        <div class="kpi-label">Active goals</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--success)">
        <div class="kpi-value" style="color:var(--success)">${achieved}</div>
        <div class="kpi-label">Goals achieved</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--teal-400,#2dd4bf)">
        <div class="kpi-value" style="color:var(--teal-400,#2dd4bf)">${avgProgress}%</div>
        <div class="kpi-label">Avg progress</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--danger)">
        <div class="kpi-value" style="color:var(--danger)">${overdue}</div>
        <div class="kpi-label">Overdue goals</div>
      </div>
    </div>`;
}

function _filterTabs() {
  return `
    <div class="filter-tabs">
      ${STATUS_FILTERS.map(f => {
        const active = _goalFilter === f ? 'active' : '';
        return `<button class="filter-tab ${active}" onclick="window._glSetFilter('${esc(f)}')">${esc(f)}</button>`;
      }).join('')}
    </div>`;
}

function _filteredGoals() {
  if (_goalFilter === 'All') return DEMO_GOALS;
  return goalsData.filter(g => String(g.status).toLowerCase() === _goalFilter.toLowerCase());
}

function _goalCards(goals) {
  if (goals.length === 0) {
    return `
      <div style="padding:40px 16px;text-align:center;border:1px dashed var(--border);border-radius:12px;margin-top:16px">
        <div style="font-size:2rem;margin-bottom:8px">🎯</div>
        <div style="font-weight:600;font-size:13px;margin-bottom:4px;color:var(--text-primary)">No goals found</div>
        <div style="font-size:12px;color:var(--text-secondary)">No goals match the selected filter.</div>
      </div>`;
  }

  const cards = goals.map(g => {
    const isOverdue = g.status === 'Overdue';
    const progressColor = g.progress >= 80 ? 'var(--success)' : g.progress >= 50 ? 'var(--warning)' : 'var(--danger)';
    const evidenceGrade = g.progress >= 80 ? 'A' : g.progress >= 50 ? 'B' : 'C';

    return `
      <div style="border:1px solid var(--border);border-radius:12px;padding:16px;background:var(--bg-card);display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">
          <div>
            <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:2px">${esc(g.patient)} · ${esc(g.patientId)}</div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);line-height:1.4">${esc(g.goal)}</div>
          </div>
          ${_statusBadge(g.status)}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span style="font-size:11px;padding:2px 8px;border-radius:6px;background:rgba(148,163,184,0.1);color:var(--text-secondary)">${esc(g.category)}</span>
          <span style="font-size:11px;color:var(--text-tertiary)">Target: ${esc(g.targetDate)}</span>
          <span style="font-size:11px;color:var(--text-tertiary)">Clinician: ${esc(g.clinician)}</span>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:11px;color:var(--text-secondary)">Progress</span>
            <span style="font-size:12px;font-weight:700;color:${progressColor}">${g.progress}%</span>
          </div>
          ${_progressBar(g.progress)}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
          ${g.status === 'Active' ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();window._glUpdateProgress('${esc(g.id)}')">Update progress</button>` : ''}
          ${g.status === 'Active' ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window._glMarkAchieved('${esc(g.id)}')">Mark achieved</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window._glArchive('${esc(g.id)}')">Archive</button>
        </div>
      </div>`;
  }).join('');

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-top:16px">
      ${cards}
    </div>`;
}

function _safetyBanner() {
  return `
    <div class="safety-banner" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(96,165,250,0.35);background:rgba(96,165,250,0.06);margin-bottom:16px;font-size:12px;color:var(--text-secondary);line-height:1.45">
      <strong style="color:var(--blue)">💡 Clinical practice:</strong> Goals should be set collaboratively between clinician and patient. SMART criteria (Specific, Measurable, Achievable, Relevant, Time-bound) should guide all goal-setting conversations.
    </div>`;
}

function _render(navigate) {
  const goals = _filteredGoals();

  return `
    <div class="patient-container" style="padding:20px 16px 40px;max-width:1200px;margin:0 auto">
      <div class="patient-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div class="patient-title" style="font-size:20px;font-weight:800;color:var(--text-primary);margin-bottom:4px">Patient Goals & Care Plans</div>
          <div style="font-size:12px;color:var(--text-secondary)">SMART goal tracking, progress monitoring, and care plan management</div>
        </div>
        <button class="btn btn-primary btn-export" onclick="window._glExport()">Export CSV</button>
      </div>

      ${_safetyBanner()}
      ${_kpiCards()}
      ${_filterTabs()}
      ${_goalCards(goals)}

      <style>
        .gl-badge { display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;flex-shrink:0; }
        .gl-active { background:rgba(96,165,250,0.12);color:#2563eb;border:1px solid rgba(96,165,250,0.25); }
        .gl-achieved { background:rgba(74,222,128,0.12);color:#16a34a;border:1px solid rgba(74,222,128,0.25); }
        .gl-paused { background:rgba(251,191,36,0.12);color:#b45309;border:1px solid rgba(251,191,36,0.25); }
        .gl-overdue { background:rgba(255,107,107,0.12);color:#dc2626;border:1px solid rgba(255,107,107,0.25); }
        .gl-abandoned { background:rgba(148,163,184,0.1);color:#64748b;border:1px solid rgba(148,163,184,0.2); }
        .evidence-badge { display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600; }
        .evidence-a { background:rgba(74,222,128,0.12);color:#16a34a; }
        .evidence-b { background:rgba(96,165,250,0.12);color:#2563eb; }
        .evidence-c { background:rgba(251,191,36,0.12);color:#b45309; }
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
      </style>
    </div>`;
}

function _mount(html) {
  if (typeof document === 'undefined') return html;
  const host = document.getElementById('content');
  if (host) host.innerHTML = html;
  return html;
}

export async function pgPatientGoals(setTopbar, navigate) {
  setTopbar('Patient Goals');

  // Try API first, fall back to demo data
  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';
  try {
    const resp = await api.getPatientGoals(clinicId);
    if (resp && resp.length > 0) { goalsData = resp; }
    else if (resp && resp.items && resp.items.length > 0) { goalsData = resp.items; }
  } catch (err) {
    console.warn('[PatientGoals] API error:', err.message);
    goalsData = DEMO_GOALS;
  }

  _goalFilter = 'All';
  _selectedGoalId = null;

  const html = _render(navigate);
  _mount(html);

  if (typeof window !== 'undefined') {
    window._glSetFilter = (f) => { _goalFilter = f; _mount(_render(navigate)); };
    window._glUpdateProgress = async (id) => {
      try { await api.updateGoalProgress(id, { progress: Math.min(100, (DEMO_GOALS.find(x => x.id === id)?.progress || 0) + 10) }); } catch (err) { console.warn('[PatientGoals] updateGoalProgress error:', err.message); }
      const g = goalsData.find(x => x.id === id);
      if (g && g.status === 'Active') {
        const newProgress = Math.min(100, g.progress + 10);
        g.progress = newProgress;
        if (newProgress >= 100) {
          g.status = 'Achieved';
          g.progress = 100;
        }
        _mount(_render(navigate));
      }
    };
    window._glMarkAchieved = (id) => {
      const g = DEMO_GOALS.find(x => x.id === id);
      if (g) { g.status = 'Achieved'; g.progress = 100; _mount(_render(navigate)); }
    };
    window._glArchive = (id) => {
      const g = DEMO_GOALS.find(x => x.id === id);
      if (g) {
        const idx = DEMO_GOALS.indexOf(g);
        if (idx > -1) goalsData.splice(idx, 1);
        _mount(_render(navigate));
      }
    };
    window._glExport = () => {
      const rows = [['Patient', 'Patient ID', 'Goal', 'Category', 'Progress', 'Target Date', 'Status', 'Clinician']];
      goalsData.forEach(g => rows.push([g.patient, g.patientId, g.goal, g.category, `${g.progress}%`, g.targetDate, g.status, g.clinician]));
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'patient-goals-export.csv';
      a.click();
    };
  }

  return html;
}

/**
 * Validate a goal definition against SMART criteria.
 * Returns { isSmart, missingCriteria[] }.
 */
export function validateSmartGoal(goalText, targetDate) {
  if (!goalText || String(goalText).trim().length === 0) {
    return { isSmart: false, missingCriteria: ['Specific — goal statement is empty'] };
  }
  const missing = [];
  const g = String(goalText).toLowerCase();
  const hasMetric = /\d+/.test(g);
  if (!hasMetric) missing.push('Measurable — no numeric metric found');
  if (!targetDate || String(targetDate).trim() === '') {
    missing.push('Time-bound — target date is required');
  }
  if (g.length < 15) missing.push('Specific — goal statement too vague');
  const isSmart = missing.length === 0;
  return { isSmart, missingCriteria: missing };
}

/**
 * Compute aggregate goal statistics for reporting dashboards.
 */
export function computeGoalStats(goals) {
  if (!Array.isArray(goals) || goals.length === 0) {
    return { totalGoals: 0, activeGoals: 0, achievedGoals: 0, avgProgress: 0, overdueGoals: 0 };
  }
  const totalGoals = goals.length;
  const activeGoals = goals.filter(g => g.status === 'Active').length;
  const achievedGoals = goals.filter(g => g.status === 'Achieved').length;
  const avgProgress = Math.round(
    goals.reduce((s, g) => s + g.progress, 0) / totalGoals
  );
  const overdueGoals = goals.filter(g => g.status === 'Overdue').length;
  const completionRate = Math.round((achievedGoals / totalGoals) * 100);
  return { totalGoals, activeGoals, achievedGoals, avgProgress, overdueGoals, completionRate };
}

/**
 * Check if a goal is at risk of becoming overdue.
 * Returns { atRisk, daysRemaining, reason }.
 */
export function checkGoalAtRisk(goal) {
  if (!goal || !goal.targetDate) return { atRisk: false, daysRemaining: 0, reason: 'Invalid goal' };
  const target = new Date(goal.targetDate);
  const now = new Date();
  const daysRemaining = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysRemaining < 0) {
    return { atRisk: true, daysRemaining, reason: `Goal overdue by ${Math.abs(daysRemaining)} days` };
  }
  if (daysRemaining < 7 && goal.progress < 75) {
    return { atRisk: true, daysRemaining, reason: `${daysRemaining} days remaining with ${goal.progress}% progress` };
  }
  if (goal.progress < 25) {
    return { atRisk: true, daysRemaining, reason: `Low progress (${goal.progress}%) with ${daysRemaining} days remaining` };
  }
  return { atRisk: false, daysRemaining, reason: 'On track' };
}

export default { pgPatientGoals };

