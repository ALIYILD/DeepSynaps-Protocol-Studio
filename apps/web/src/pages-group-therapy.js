//


let groupsData = DEMO_GROUPS_FALLBACK;
import { api } from './api.js';
import { currentUser } from './auth.js';

/**
 * pages-group-therapy.js — Group/Cohort Therapy Session Management
 *
 * Scope: group therapy program tracking, participant rosters,
 * attendance monitoring, and aggregated outcome reporting.
 *
 * Safety: group therapy outcomes are aggregated — individual results may vary.
 */


const GROUP_TYPES = ['CBT Group', 'DBT Skills', 'Support Group', 'Psychoeducation', 'Mindfulness', 'Social Skills', 'Trauma-focused', 'Family Therapy'];
const GROUP_FILTERS = ['All', 'Active', 'Completed', 'Paused', 'Recruiting'];

const DEMO_GROUPS_FALLBACK = [
  { id: 'g1', name: 'CBT for Anxiety — Cohort 4', type: 'CBT Group', facilitator: 'Dr. Sarah Mitchell', participants: 8, maxParticipants: 10, sessions: 12, completedSessions: 10, schedule: 'Tue/Thu 10:00 AM', status: 'Active', startDate: '2024-09-01', endDate: '2024-12-01', attendanceRate: 87, avgOutcomeChange: -4.2 },
  { id: 'g2', name: 'DBT Skills — Evening Group', type: 'DBT Skills', facilitator: 'Dr. James Chen', participants: 6, maxParticipants: 8, sessions: 16, completedSessions: 16, schedule: 'Mon/Wed 6:00 PM', status: 'Completed', startDate: '2024-06-01', endDate: '2024-09-30', attendanceRate: 92, avgOutcomeChange: -5.8 },
  { id: 'g3', name: 'Post-Stroke Support Circle', type: 'Support Group', facilitator: 'Lisa Rodriguez, LCSW', participants: 5, maxParticipants: 12, sessions: 8, completedSessions: 3, schedule: 'Fri 2:00 PM', status: 'Active', startDate: '2024-10-15', endDate: '2024-12-15', attendanceRate: 80, avgOutcomeChange: -1.5 },
  { id: 'g4', name: 'Mindfulness for Chronic Pain', type: 'Mindfulness', facilitator: 'Dr. Amara Patel', participants: 0, maxParticipants: 10, sessions: 8, completedSessions: 0, schedule: 'Wed/Fri 11:00 AM', status: 'Recruiting', startDate: '2024-11-15', endDate: '2025-01-15', attendanceRate: 0, avgOutcomeChange: 0 },
  { id: 'g5', name: 'Social Skills — Adolescents', type: 'Social Skills', facilitator: 'Tom Nguyen, PsyD', participants: 4, maxParticipants: 6, sessions: 10, completedSessions: 7, schedule: 'Tue 4:00 PM', status: 'Active', startDate: '2024-09-15', endDate: '2024-12-01', attendanceRate: 75, avgOutcomeChange: -2.1 },
  { id: 'g6', name: 'Trauma Recovery — Phase 2', type: 'Trauma-focused', facilitator: 'Dr. Karen Walsh', participants: 6, maxParticipants: 8, sessions: 14, completedSessions: 14, schedule: 'Mon/Thu 1:00 PM', status: 'Completed', startDate: '2024-05-01', endDate: '2024-10-01', attendanceRate: 95, avgOutcomeChange: -7.3 },
  { id: 'g7', name: 'Family Therapy — Neuro Rehab', type: 'Family Therapy', facilitator: 'Dr. Michael Torres', participants: 3, maxParticipants: 6, sessions: 6, completedSessions: 2, schedule: 'Sat 10:00 AM', status: 'Paused', startDate: '2024-10-01', endDate: '2024-12-01', attendanceRate: 67, avgOutcomeChange: -0.8 },
  { id: 'g8', name: 'Psychoeducation — TBI', type: 'Psychoeducation', facilitator: 'Dr. Emily Brooks', participants: 9, maxParticipants: 12, sessions: 6, completedSessions: 6, schedule: 'Wed 2:00 PM', status: 'Completed', startDate: '2024-07-01', endDate: '2024-09-30', attendanceRate: 90, avgOutcomeChange: -3.4 },
  { id: 'g9', name: 'CBT for Depression — Cohort 5', type: 'CBT Group', facilitator: 'Dr. Sarah Mitchell', participants: 7, maxParticipants: 10, sessions: 12, completedSessions: 4, schedule: 'Mon/Wed 10:00 AM', status: 'Active', startDate: '2024-10-01', endDate: '2025-01-01', attendanceRate: 85, avgOutcomeChange: -2.8 },
  { id: 'g10', name: 'DBT Skills — Morning Group', type: 'DBT Skills', facilitator: 'Dr. James Chen', participants: 2, maxParticipants: 8, sessions: 16, completedSessions: 1, schedule: 'Tue/Thu 9:00 AM', status: 'Recruiting', startDate: '2024-11-01', endDate: '2025-02-28', attendanceRate: 100, avgOutcomeChange: 0 },
  { id: 'g11', name: 'Caregiver Support Group', type: 'Support Group', facilitator: 'Lisa Rodriguez, LCSW', participants: 6, maxParticipants: 10, sessions: 6, completedSessions: 5, schedule: 'Thu 6:00 PM', status: 'Active', startDate: '2024-09-20', endDate: '2024-12-01', attendanceRate: 88, avgOutcomeChange: -1.9 },
  { id: 'g12', name: 'Mindfulness for Sleep', type: 'Mindfulness', facilitator: 'Dr. Amara Patel', participants: 7, maxParticipants: 10, sessions: 6, completedSessions: 6, schedule: 'Mon 7:00 PM', status: 'Completed', startDate: '2024-08-01', endDate: '2024-10-15', attendanceRate: 93, avgOutcomeChange: -4.1 },
];

const DEMO_ROSTER = {
  g1: [
    { name: 'Eleanor Vance', attendance: [1,1,1,0,1,1,1,1,1,1], phq9Base: 14, phq9Latest: 9 },
    { name: 'Marcus Chen', attendance: [1,1,1,1,1,0,1,1,1,1], phq9Base: 16, phq9Latest: 10 },
    { name: 'Sophia Patel', attendance: [1,1,0,1,1,1,0,1,1,1], phq9Base: 18, phq9Latest: 12 },
  ],
  g2: [
    { name: 'James O\'Brien', attendance: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], phq9Base: 15, phq9Latest: 7 },
    { name: 'Aisha Johnson', attendance: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], phq9Base: 20, phq9Latest: 11 },
  ],
};

let _groupFilter = 'All';
let _selectedGroupId = null;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return '<span class="gt-badge gt-active">Active</span>';
  if (s === 'completed') return '<span class="gt-badge gt-completed">Completed</span>';
  if (s === 'paused') return '<span class="gt-badge gt-paused">Paused</span>';
  if (s === 'recruiting') return '<span class="gt-badge gt-recruiting">Recruiting</span>';
  return `<span class="gt-badge">${esc(status)}</span>`;
}

function _categoryColor(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('cbt')) return '#2563eb';
  if (t.includes('dbt')) return '#7c3aed';
  if (t.includes('support')) return '#0d9488';
  if (t.includes('mindfulness')) return '#059669';
  if (t.includes('social')) return '#d97706';
  if (t.includes('trauma')) return '#dc2626';
  if (t.includes('family')) return '#db2777';
  if (t.includes('psychoeducation')) return '#4f46e5';
  return '#64748b';
}

function _evidenceBadge(grade) {
  const g = String(grade || '').toUpperCase();
  if (g === 'A') return '<span class="evidence-badge evidence-a">Grade A</span>';
  if (g === 'B') return '<span class="evidence-badge evidence-b">Grade B</span>';
  if (g === 'C') return '<span class="evidence-badge evidence-c">Grade C</span>';
  return '<span class="evidence-badge">—</span>';
}

function _kpiCards() {
  const active = groupsData.filter(g => g.status === 'Active').length;
  const thisWeek = groupsData.filter(g => g.status === 'Active').reduce((s, g) => s + (g.status === 'Active' ? 2 : 0), 18);
  const avgAtt = Math.round(groupsData.filter(g => g.attendanceRate > 0).reduce((s, g) => s + g.attendanceRate, 0) / groupsData.filter(g => g.attendanceRate > 0).length);
  const completed = groupsData.filter(g => g.status === 'Completed').length;
  const completionRate = Math.round((completed / DEMO_GROUPS.length) * 100);

  return `
    <div class="kpi-grid">
      <div class="kpi-card" style="border-top:3px solid var(--blue)">
        <div class="kpi-value" style="color:var(--blue)">${active}</div>
        <div class="kpi-label">Active groups</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--teal-400,#2dd4bf)">
        <div class="kpi-value" style="color:var(--teal-400,#2dd4bf)">${thisWeek}</div>
        <div class="kpi-label">Sessions this week</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--success)">
        <div class="kpi-value" style="color:var(--success)">${avgAtt}%</div>
        <div class="kpi-label">Avg attendance</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--purple)">
        <div class="kpi-value" style="color:var(--purple)">${completionRate}%</div>
        <div class="kpi-label">Completion rate</div>
      </div>
    </div>`;
}

function _filterTabs() {
  return `
    <div class="filter-tabs">
      ${GROUP_FILTERS.map(f => {
        const active = _groupFilter === f ? 'active' : '';
        return `<button class="filter-tab ${active}" onclick="window._gtSetFilter('${esc(f)}')">${esc(f)}</button>`;
      }).join('')}
    </div>`;
}

function _filteredGroups() {
  if (_groupFilter === 'All') return DEMO_GROUPS;
  return groupsData.filter(g => String(g.status).toLowerCase() === _groupFilter.toLowerCase());
}

function _miniSparkline(avgChange) {
  const color = avgChange < -3 ? 'var(--success)' : avgChange < 0 ? 'var(--teal-400,#2dd4bf)' : 'var(--text-tertiary)';
  const bars = [0.3, 0.5, 0.7, 0.6, 0.8, 0.9].map((h, i) =>
    `<span style="display:inline-block;width:4px;height:${Math.round(h * 14)}px;border-radius:2px;background:${color};opacity:${0.4 + (i * 0.12)};margin:0 1px;vertical-align:bottom"></span>`
  ).join('');
  return `<span style="display:inline-flex;align-items:flex-end;height:16px" aria-hidden="true">${bars}</span>`;
}

function _groupTable(groups) {
  if (groups.length === 0) {
    return `
      <div style="padding:40px 16px;text-align:center;border:1px dashed var(--border);border-radius:12px;margin-top:16px">
        <div style="font-size:2rem;margin-bottom:8px">👥</div>
        <div style="font-weight:600;font-size:13px;margin-bottom:4px;color:var(--text-primary)">No groups found</div>
        <div style="font-size:12px;color:var(--text-secondary)">No groups match the selected filter.</div>
      </div>`;
  }

  const rows = groups.map(g => `
    <tr style="cursor:pointer" onclick="window._gtSelectGroup('${esc(g.id)}')">
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
        <div style="font-weight:600">${esc(g.name)}</div>
        <div style="font-size:11px;color:var(--text-tertiary)">${esc(g.type)}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(g.facilitator)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;text-align:center">
        <span style="font-weight:600">${g.participants}</span><span style="color:var(--text-tertiary)">/${g.maxParticipants}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);text-align:center">${g.completedSessions}/${g.sessions}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${esc(g.schedule)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px">${_statusBadge(g.status)}</td>
    </tr>
  `).join('');

  return `
    <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg-card);margin-top:16px">
      <div style="overflow-x:auto">
        <table class="data-table" style="width:100%;border-collapse:collapse;min-width:700px">
          <thead>
            <tr style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary)">
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Group name</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Facilitator</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Participants</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Sessions</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Schedule</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function _rosterPanel(group) {
  if (!group) return '';
  const roster = DEMO_ROSTER[group.id] || [];

  const avgPhq9Change = roster.length > 0
    ? (roster.reduce((s, r) => s + (r.phq9Latest - r.phq9Base), 0) / roster.length).toFixed(1)
    : '—';

  const evidenceGrade = group.status === 'Completed' ? 'A' : group.status === 'Active' ? 'B' : 'C';

  let rosterHtml = '';
  if (roster.length > 0) {
    const rosterRows = roster.map(r => {
      const attended = r.attendance.filter(a => a === 1).length;
      const pct = Math.round((attended / r.attendance.length) * 100);
      const phq9Change = r.phq9Latest - r.phq9Base;
      const changeColor = phq9Change < -3 ? 'var(--success)' : phq9Change < 0 ? 'var(--teal-400)' : 'var(--text-secondary)';
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;font-weight:500">${esc(r.name)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;text-align:center">${pct}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;text-align:center">${r.phq9Base} → ${r.phq9Latest}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;text-align:center;font-weight:600;color:${changeColor}">${phq9Change > 0 ? '+' : ''}${phq9Change}</td>
        </tr>`;
    }).join('');

    rosterHtml = `
      <table style="width:100%;border-collapse:collapse;margin-top:8px">
        <thead>
          <tr style="text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary)">
            <th style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600">Participant</th>
            <th style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600;text-align:center">Attendance</th>
            <th style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600;text-align:center">PHQ-9 (Base→Latest)</th>
            <th style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600;text-align:center">Change</th>
          </tr>
        </thead>
        <tbody>${rosterRows}</tbody>
      </table>`;
  } else {
    rosterHtml = `
      <div style="padding:20px;text-align:center;border:1px dashed var(--border);border-radius:8px;margin-top:8px">
        <div style="font-size:12px;color:var(--text-secondary)">No detailed roster available for this group.</div>
      </div>`;
  }

  return `
    <div id="group-detail-panel" style="border:1px solid var(--border);border-radius:12px;padding:20px;background:var(--bg-card);margin-top:16px;animation:fadeIn 0.2s ease">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${esc(group.name)}</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${esc(group.type)} · Facilitator: ${esc(group.facilitator)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="window._gtCloseDetail()">Close</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">
        <div style="padding:10px;border-radius:8px;background:rgba(148,163,184,0.06)">
          <div style="font-size:11px;color:var(--text-tertiary)">Participants</div>
          <div style="font-size:16px;font-weight:700">${group.participants}/${group.maxParticipants}</div>
        </div>
        <div style="padding:10px;border-radius:8px;background:rgba(148,163,184,0.06)">
          <div style="font-size:11px;color:var(--text-tertiary)">Attendance rate</div>
          <div style="font-size:16px;font-weight:700;color:${group.attendanceRate >= 85 ? 'var(--success)' : group.attendanceRate >= 60 ? 'var(--warning)' : 'var(--danger)'}">${group.attendanceRate}%</div>
        </div>
        <div style="padding:10px;border-radius:8px;background:rgba(148,163,184,0.06)">
          <div style="font-size:11px;color:var(--text-tertiary)">Avg PHQ-9 change</div>
          <div style="font-size:16px;font-weight:700;color:typeof ${avgPhq9Change} === 'number' && ${avgPhq9Change} < 0 ? 'var(--success)' : 'var(--text-secondary)'">${avgPhq9Change}</div>
        </div>
        <div style="padding:10px;border-radius:8px;background:rgba(148,163,184,0.06)">
          <div style="font-size:11px;color:var(--text-tertiary)">Evidence</div>
          <div style="font-size:13px;margin-top:2px">${_evidenceBadge(evidenceGrade)}</div>
        </div>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Participant Roster</div>
      ${rosterHtml}
      <div style="padding:10px;border-radius:8px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);font-size:11px;color:var(--text-secondary);line-height:1.45;margin-top:12px">
        <strong style="color:var(--amber)">⚠ Safety note:</strong> Group therapy outcomes are aggregated — individual results may vary. Do not use group averages for individual clinical decisions.
      </div>
    </div>`;
}

function _safetyBanner() {
  return `
    <div class="safety-banner" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(251,191,36,0.35);background:rgba(251,191,36,0.06);margin-bottom:16px;font-size:12px;color:var(--text-secondary);line-height:1.45">
      <strong style="color:var(--amber)">⚠ Clinical note:</strong> Group therapy outcomes are aggregated — individual results may vary. Always review individual patient data before making treatment decisions.
    </div>`;
}

function _render(navigate) {
  const groups = _filteredGroups();
  const selectedGroup = _selectedGroupId ? groupsData.find(g => g.id === _selectedGroupId) : null;
  const stats = computeGroupStats(DEMO_GROUPS);

  return `
    <div class="patient-container" style="padding:20px 16px 40px;max-width:1200px;margin:0 auto">
      <div class="patient-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div class="patient-title" style="font-size:20px;font-weight:800;color:var(--text-primary);margin-bottom:4px">Group Therapy Management</div>
          <div style="font-size:12px;color:var(--text-secondary)">Cohort-based therapy sessions, attendance tracking, and outcome monitoring</div>
        </div>
        <button class="btn btn-primary btn-export" onclick="window._gtExport()">Export CSV</button>
      </div>

      ${_safetyBanner()}
      ${_kpiCards()}
      ${_filterTabs()}
      ${_groupTable(groups)}
      ${selectedGroup ? _rosterPanel(selectedGroup) : ''}

      <div style="margin-top:16px;padding:12px;border-radius:10px;border:1px solid rgba(96,165,250,0.2);background:rgba(96,165,250,0.06);font-size:12px;color:var(--text-secondary);line-height:1.5">
        <strong style="color:var(--blue)">📊 Cohort summary:</strong> ${stats.totalGroups} total groups · ${stats.activeGroups} active · ${stats.completedGroups} completed · ${stats.totalParticipants}/${stats.maxCapacity} participants (${stats.utilizationRate}% utilization) · ${stats.avgAttendance}% average attendance.

      <style>
        .gt-badge { display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap; }
        .gt-active { background:rgba(74,222,128,0.12);color:#16a34a;border:1px solid rgba(74,222,128,0.25); }
        .gt-completed { background:rgba(45,212,191,0.12);color:#0d9488;border:1px solid rgba(45,212,191,0.25); }
        .gt-paused { background:rgba(148,163,184,0.12);color:#64748b;border:1px solid rgba(148,163,184,0.25); }
        .gt-recruiting { background:rgba(96,165,250,0.12);color:#2563eb;border:1px solid rgba(96,165,250,0.25); }
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

export async function pgGroupTherapy(setTopbar, navigate) {
  setTopbar('Group Therapy');

  // Try API first, fall back to demo data
  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';
  try {
    const resp = await api.getGroups(clinicId);
    if (resp && resp.length > 0) { groupsData = resp; }
    else if (resp && resp.items && resp.items.length > 0) { groupsData = resp.items; }
  } catch (err) {
    console.warn('[GroupTherapy] API error:', err.message);
    groupsData = DEMO_GROUPS;
  }

  _groupFilter = 'All';
  _selectedGroupId = null;

  const html = _render(navigate);
  _mount(html);

  if (typeof window !== 'undefined') {
    window._gtSetFilter = (f) => { _groupFilter = f; _mount(_render(navigate)); };
    window._gtSelectGroup = (id) => { _selectedGroupId = id; _mount(_render(navigate)); };
    window._gtCloseDetail = () => { _selectedGroupId = null; _mount(_render(navigate)); };
    window._gtExport = () => {
      const rows = [['Group Name', 'Type', 'Facilitator', 'Participants', 'Sessions', 'Schedule', 'Status', 'Attendance Rate', 'Avg Outcome Change']];
      groupsData.forEach(g => rows.push([g.name, g.type, g.facilitator, `${g.participants}/${g.maxParticipants}`, `${g.completedSessions}/${g.sessions}`, g.schedule, g.status, `${g.attendanceRate}%`, g.avgOutcomeChange]));
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'group-therapy-export.csv';
      a.click();
    };
  }

  return html;
}

/**
 * Compute aggregated group statistics for reporting dashboards.
 */
export function computeGroupStats(groups) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return {
      totalGroups: 0, activeGroups: 0, completedGroups: 0,
      avgAttendance: 0, avgSessionsCompleted: 0, totalParticipants: 0,
    };
  }
  const totalGroups = groups.length;
  const activeGroups = groups.filter(g => g.status === 'Active').length;
  const completedGroups = groups.filter(g => g.status === 'Completed').length;
  const recruitingGroups = groups.filter(g => g.status === 'Recruiting').length;
  const pausedGroups = groups.filter(g => g.status === 'Paused').length;
  const avgAttendance = Math.round(
    groups.filter(g => g.attendanceRate > 0).reduce((s, g) => s + g.attendanceRate, 0)
    / Math.max(groups.filter(g => g.attendanceRate > 0).length, 1)
  );
  const avgSessionsCompleted = Math.round(
    groups.reduce((s, g) => s + (g.completedSessions / Math.max(g.sessions, 1)) * 100, 0) / totalGroups
  );
  const totalParticipants = groups.reduce((s, g) => s + g.participants, 0);
  const maxCapacity = groups.reduce((s, g) => s + g.maxParticipants, 0);
  const utilizationRate = maxCapacity > 0 ? Math.round((totalParticipants / maxCapacity) * 100) : 0;
  return { totalGroups, activeGroups, completedGroups, recruitingGroups, pausedGroups, avgAttendance, avgSessionsCompleted, totalParticipants, maxCapacity, utilizationRate };
}

/**
 * Validate that a group therapy session has minimum participants
 * before activation. Returns { ok, reason }.
 */
export function validateGroupActivation(group) {
  if (!group || typeof group !== 'object') {
    return { ok: false, reason: 'Invalid group configuration' };
  }
  if ((group.participants || 0) < 2) {
    return { ok: false, reason: 'Group requires at least 2 participants to activate' };
  }
  if (!group.facilitator || String(group.facilitator).trim() === '') {
    return { ok: false, reason: 'A licensed facilitator must be assigned' };
  }
  if (!Array.isArray(group.sessions) && !(group.sessions > 0)) {
    return { ok: false, reason: 'Session plan must be defined' };
  }
  return { ok: true, reason: 'Group ready for activation' };
}

export default { pgGroupTherapy };

