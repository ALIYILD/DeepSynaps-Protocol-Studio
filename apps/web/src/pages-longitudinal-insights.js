// ─────────────────────────────────────────────────────────────────────────────
// pages-longitudinal-insights.js — Patient Trajectory + Progression Tracking
//
// Features:
// - KPI cards: Patients tracked, Data points, Trajectories analyzed, Alerts triggered
// - Patient trajectory cards: Patient | Baseline | Latest | Change | Trend | Sessions | Next milestone
// - Mini sparkline (CSS bar chart) for each patient showing score over time
// - Trend indicators: Improving / Stable / Declining
// - Alert badges for patients crossing thresholds
// - Filter: All / Improving / Stable / Declining / At Risk / Lost to Follow-up
// - Safety banner: "Trends reflect clinic data only — external factors not captured"
// ─────────────────────────────────────────────────────────────────────────────

import { evidenceBadge } from './helpers.js';
import { api } from './api.js';

// ── Demo data ───────────────────────────────────────────────────────────────
let DEMO_PATIENTS = [
  { id: 'PT-2841', initials: 'SL', name: 'S. Li', age: 39, condition: 'MDD', modality: 'tDCS', baseline: 22, latest: 12, sessions: 14, totalSessions: 20, trend: 'improving', status: 'active', alert: null, scores: [22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 12, 12, 11], nextMilestone: 'Session 16 assessment' },
  { id: 'PT-2917', initials: 'MR', name: 'M. Reilly', age: 46, condition: 'MDD', modality: 'rTMS', baseline: 24, latest: 18, sessions: 10, totalSessions: 20, trend: 'improving', status: 'active', alert: null, scores: [24, 24, 23, 22, 22, 21, 20, 20, 19, 18, 18, 18], nextMilestone: 'Week 6 HAM-D' },
  { id: 'PT-3056', initials: 'PN', name: 'P. Nambiar', age: 34, condition: 'GAD', modality: 'tDCS', baseline: 18, latest: 16, sessions: 22, totalSessions: 30, trend: 'stable', status: 'active', alert: 'plateau', scores: [18, 18, 17, 17, 17, 16, 16, 17, 16, 16, 16, 17, 16, 16, 16, 15], nextMilestone: 'Protocol review' },
  { id: 'PT-3122', initials: 'JT', name: 'J. Thompson', age: 13, condition: 'ADHD', modality: 'Neurofeedback', baseline: 28, latest: 22, sessions: 8, totalSessions: 20, trend: 'improving', status: 'active', alert: 'off-label', scores: [28, 27, 26, 25, 25, 24, 23, 22, 22, 22], nextMilestone: 'Parent review' },
  { id: 'PT-3198', initials: 'EO', name: 'E. Okafor', age: 31, condition: 'PTSD', modality: 'rTMS-iTBS', baseline: 56, latest: 38, sessions: 26, totalSessions: 30, trend: 'improving', status: 'active', alert: null, scores: [56, 54, 52, 50, 48, 46, 45, 44, 42, 40, 39, 38, 38, 37], nextMilestone: 'PCL-5 follow-up' },
  { id: 'PT-3284', initials: 'TW', name: 'T. Wu', age: 44, condition: 'Insomnia', modality: 'tACS', baseline: 15, latest: 8, sessions: 10, totalSessions: 12, trend: 'improving', status: 'active', alert: null, scores: [15, 14, 13, 12, 12, 11, 10, 9, 9, 8, 8], nextMilestone: 'Sleep study' },
  { id: 'PT-3350', initials: 'RK', name: 'R. Kumar', age: 52, condition: 'MDD', modality: 'rTMS', baseline: 26, latest: 24, sessions: 18, totalSessions: 24, trend: 'declining', status: 'at_risk', alert: 'worsening', scores: [26, 26, 25, 25, 25, 24, 24, 24, 25, 24, 24, 25, 24, 24], nextMilestone: 'Treatment review' },
  { id: 'PT-3416', initials: 'AL', name: 'A. Lee', age: 29, condition: 'GAD', modality: 'tDCS', baseline: 20, latest: 20, sessions: 6, totalSessions: 18, trend: 'stable', status: 'active', alert: null, scores: [20, 20, 20, 20, 20, 19, 20, 20], nextMilestone: 'HAM-A week 4' },
  { id: 'PT-3482', initials: 'DK', name: 'D. Kim', age: 37, condition: 'MDD', modality: 'tDCS', baseline: 23, latest: 25, sessions: 4, totalSessions: 20, trend: 'declining', status: 'at_risk', alert: 'worsening', scores: [23, 23, 24, 25, 25], nextMilestone: 'Urgent review' },
  { id: 'PT-3548', initials: 'NW', name: 'N. Wang', age: 41, condition: 'MDD', modality: 'rTMS', baseline: 21, latest: null, sessions: 0, totalSessions: 20, trend: 'stable', status: 'lost_to_follow_up', alert: 'lapsed', scores: [21], nextMilestone: 'Re-engagement' },
  { id: 'PT-3604', initials: 'CB', name: 'C. Brown', age: 55, condition: 'PTSD', modality: 'rTMS', baseline: 62, latest: 48, sessions: 12, totalSessions: 24, trend: 'improving', status: 'active', alert: null, scores: [62, 60, 58, 56, 54, 53, 52, 51, 50, 49, 48, 48, 47], nextMilestone: 'Mid-point review' },
  { id: 'PT-3670', initials: 'SF', name: 'S. Foster', age: 27, condition: 'GAD', modality: 'tDCS', baseline: 19, latest: 9, sessions: 16, totalSessions: 18, trend: 'improving', status: 'active', alert: null, scores: [19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 10, 9, 9, 9, 9], nextMilestone: 'Graduation assessment' },
  { id: 'PT-3736', initials: 'MH', name: 'M. Hayes', age: 48, condition: 'MDD', modality: 'rTMS-iTBS', baseline: 27, latest: 14, sessions: 10, totalSessions: 30, trend: 'improving', status: 'active', alert: null, scores: [27, 26, 25, 24, 23, 22, 20, 18, 16, 15, 14], nextMilestone: 'Week 6 assessment' },
  { id: 'PT-3802', initials: 'LP', name: 'L. Park', age: 33, condition: 'Insomnia', modality: 'tACS', baseline: 14, latest: 10, sessions: 8, totalSessions: 12, trend: 'stable', status: 'active', alert: 'plateau', scores: [14, 13, 13, 12, 12, 11, 11, 10, 10, 10], nextMilestone: 'Protocol adjustment' },
  { id: 'PT-3868', initials: 'AR', name: 'A. Rivera', age: 61, condition: 'Anxiety', modality: 'tDCS', baseline: 17, latest: 19, sessions: 6, totalSessions: 20, trend: 'declining', status: 'at_risk', alert: 'worsening', scores: [17, 17, 18, 18, 19, 19], nextMilestone: 'Urgent clinician review' },
];

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'improving', label: 'Improving' },
  { id: 'stable', label: 'Stable' },
  { id: 'declining', label: 'Declining' },
  { id: 'at_risk', label: 'At Risk' },
  { id: 'lost_to_follow_up', label: 'Lost to Follow-up' },
];

// ── Module state ────────────────────────────────────────────────────────────
let _activeFilter = 'all';

// ── KPI data ────────────────────────────────────────────────────────────────
function _kpiData() {
  return {
    patientsTracked: DEMO_PATIENTS.filter(p => p.status !== 'lost_to_follow_up').length,
    dataPoints: DEMO_PATIENTS.reduce((s, p) => s + p.scores.length, 0),
    trajectoriesAnalyzed: DEMO_PATIENTS.filter(p => p.scores.length >= 3).length,
    alertsTriggered: DEMO_PATIENTS.filter(p => p.alert !== null).length,
  };
}

// ── Color helpers ───────────────────────────────────────────────────────────
function _trendColor(trend) {
  const map = { improving: 'var(--teal)', stable: 'var(--blue)', declining: 'var(--red)' };
  return map[trend] || 'var(--text-tertiary)';
}

function _trendBg(trend) {
  const map = { improving: 'rgba(0,212,188,0.12)', stable: 'rgba(74,158,255,0.12)', declining: 'rgba(255,107,107,0.12)' };
  return map[trend] || 'rgba(255,255,255,0.06)';
}

function _trendArrow(trend) {
  const map = { improving: '\u2197', stable: '\u2192', declining: '\u2198' };
  return map[trend] || '';
}

function _alertBadge(alert) {
  if (!alert) return '';
  const map = {
    worsening: { color: 'var(--red)', bg: 'rgba(255,107,107,0.12)', label: 'Worsening' },
    plateau: { color: 'var(--amber)', bg: 'rgba(255,181,71,0.12)', label: 'Plateau' },
    'off-label': { color: 'var(--amber)', bg: 'rgba(255,181,71,0.12)', label: 'Off-label' },
    lapsed: { color: 'var(--red)', bg: 'rgba(255,107,107,0.12)', label: 'Lapsed' },
  };
  const s = map[alert] || map.plateau;
  return `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${s.bg};color:${s.color};font-family:var(--font-mono)">${s.label}</span>`;
}

function _sparklineBars(scores) {
  if (!scores || scores.length === 0) return '';
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const range = max - min || 1;
  return scores.map(s => {
    const h = Math.max(3, ((s - min) / range) * 28);
    return `<div style="width:4px;border-radius:1px;min-height:2px;height:${h}px;background:${s === min ? 'var(--teal)' : s === max ? 'var(--red)' : 'var(--blue)'};opacity:0.7"></div>`;
  }).join('');
}

// ── KPI cards ───────────────────────────────────────────────────────────────
function _renderKpis() {
  const k = _kpiData();
  const cards = [
    { label: 'Patients tracked', value: k.patientsTracked, sub: 'Active in longitudinal monitoring', color: 'var(--teal)' },
    { label: 'Data points', value: k.dataPoints, sub: 'Total score measurements', color: 'var(--blue)' },
    { label: 'Trajectories analyzed', value: k.trajectoriesAnalyzed, sub: 'With sufficient data for trend', color: 'var(--violet)' },
    { label: 'Alerts triggered', value: k.alertsTriggered, sub: 'Patients crossing thresholds', color: 'var(--red)' },
  ];
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:24px">
    ${cards.map(c => `
      <div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
        <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">${c.label}</div>
        <div style="font-size:32px;font-weight:700;color:${c.color};font-family:var(--font-mono);line-height:1;margin-bottom:6px">${c.value}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${c.sub}</div>
      </div>
    `).join('')}
  </div>`;
}

// ── Safety banner ───────────────────────────────────────────────────────────
function _renderSafetyBanner() {
  return `
    <div style="margin-bottom:24px;padding:12px 16px;border-radius:8px;border-left:4px solid var(--amber);background:rgba(255,181,71,0.08);color:var(--amber);font-size:12.5px;line-height:1.5">
      <strong>Data notice:</strong> Trends reflect clinic data only — external factors (medication changes, life events, adherence) may not be captured. Trajectory analysis is <em>inferred</em> from available measurements and should be interpreted with clinical judgment.
    </div>
  `;
}

// ── Filter tabs ─────────────────────────────────────────────────────────────
function _renderFilterTabs() {
  return `
    <div style="display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap">
      ${FILTER_TABS.map(ft => {
        const count = ft.id === 'all' ? DEMO_PATIENTS.length : DEMO_PATIENTS.filter(p => (ft.id === 'at_risk' ? p.status === 'at_risk' : ft.id === 'lost_to_follow_up' ? p.status === 'lost_to_follow_up' : p.trend === ft.id)).length;
        const isActive = _activeFilter === ft.id;
        return `<button onclick="window._liFilter('${ft.id}')"
          style="padding:6px 14px;border-radius:6px;border:1px solid ${isActive ? 'var(--border-teal)' : 'var(--border)'};background:${isActive ? 'rgba(0,212,188,0.08)' : 'var(--navy-900)'};color:${isActive ? 'var(--teal)' : 'var(--text-secondary)'};cursor:pointer;font-size:12px;font-weight:${isActive ? '600' : '400'}">
          ${ft.label} · ${count}
        </button>`;
      }).join('')}
    </div>
  `;
}

// ── Patient trajectory cards ────────────────────────────────────────────────
function _renderTrajectoryCards() {
  const filtered = _activeFilter === 'all'
    ? DEMO_PATIENTS
    : _activeFilter === 'at_risk'
      ? DEMO_PATIENTS.filter(p => p.status === 'at_risk')
      : _activeFilter === 'lost_to_follow_up'
        ? DEMO_PATIENTS.filter(p => p.status === 'lost_to_follow_up')
        : DEMO_PATIENTS.filter(p => p.trend === _activeFilter);

  if (filtered.length === 0) {
    return `
      <div style="padding:40px;text-align:center;border-radius:10px;border:1px dashed var(--border);background:var(--navy-850)">
        <div style="font-size:15px;color:var(--text-secondary);margin-bottom:8px">No patients match this filter</div>
        <div style="font-size:12px;color:var(--text-tertiary)">Select a different category to view patient trajectories</div>
      </div>
    `;
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;margin-bottom:28px">
      ${filtered.map(p => {
        const change = p.latest != null && p.baseline != null ? p.latest - p.baseline : null;
        const changeColor = change == null ? 'var(--text-tertiary)' : change < 0 ? 'var(--teal)' : change > 0 ? 'var(--red)' : 'var(--text-secondary)';
        const changeSign = change == null ? '' : change < 0 ? '' : change > 0 ? '+' : '';
        const progressPct = p.totalSessions > 0 ? Math.round(p.sessions / p.totalSessions * 100) : 0;

        return `
          <div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850);display:flex;flex-direction:column;gap:12px"
            onmouseover="this.style.borderColor='var(--border-hover)'" onmouseout="this.style.borderColor='var(--border)'">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:38px;height:38px;border-radius:50%;background:var(--navy-700);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--teal);font-family:var(--font-mono)">${p.initials}</div>
                <div>
                  <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${p.name} <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">${p.age}y</span></div>
                  <div style="font-size:11px;color:var(--text-secondary)">${p.condition} · ${p.modality}</div>
                </div>
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
                ${_alertBadge(p.alert)}
                <span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:${_trendBg(p.trend)};color:${_trendColor(p.trend)};font-family:var(--font-mono)">
                  ${_trendArrow(p.trend)} ${p.trend}
                </span>
              </div>
            </div>

            <!-- Scores row -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:10px;border-radius:6px;background:rgba(255,255,255,0.02)">
              <div style="text-align:center">
                <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px">Baseline</div>
                <div style="font-size:18px;font-weight:700;color:var(--text-primary);font-family:var(--font-mono)">${p.baseline}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px">Latest</div>
                <div style="font-size:18px;font-weight:700;color:${p.latest != null ? 'var(--text-primary)' : 'var(--text-tertiary)'};font-family:var(--font-mono)">${p.latest != null ? p.latest : '—'}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px">Change</div>
                <div style="font-size:18px;font-weight:700;color:${changeColor};font-family:var(--font-mono)">${change != null ? changeSign + change : '—'}</div>
              </div>
            </div>

            <!-- Sparkline -->
            <div>
              <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.4px">Score trajectory (${p.scores.length} data points)</div>
              <div style="display:flex;align-items:flex-end;gap:2px;height:34px;padding:4px;border-radius:4px;background:var(--navy-900)">
                ${_sparklineBars(p.scores)}
              </div>
            </div>

            <!-- Progress bar -->
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:10px;color:var(--text-tertiary)">Course progress</span>
                <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-secondary)">${p.sessions}/${p.totalSessions}</span>
              </div>
              <div style="height:5px;border-radius:3px;background:var(--navy-700)">
                <div style="height:5px;border-radius:3px;background:var(--teal);width:${progressPct}%;transition:width 0.3s"></div>
              </div>
            </div>

            <!-- Footer -->
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
              <span style="font-size:11px;color:var(--text-tertiary)">Next: ${p.nextMilestone}</span>
              <button class="btn btn-sm btn-ghost" style="font-size:11px;padding:4px 10px" onclick="window._liViewPatient('${p.id}')">
                View trajectory
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── Summary table ───────────────────────────────────────────────────────────
function _renderSummaryTable() {
  const sorted = [...DEMO_PATIENTS].sort((a, b) => {
    // At risk first, then by trend severity
    const priority = { at_risk: 0, lost_to_follow_up: 1, active: 2 };
    const pa = priority[a.status] ?? 3;
    const pb = priority[b.status] ?? 3;
    return pa - pb;
  });

  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Trajectory Summary</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">${DEMO_PATIENTS.length} patients · sorted by priority</span>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:2px solid var(--border);background:var(--navy-850)">
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Patient</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Condition</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Modality</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Baseline</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Latest</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Trend</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Sessions</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Alert</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Next Milestone</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((p, i) => {
              const change = p.latest != null ? p.latest - p.baseline : null;
              const rowBg = p.status === 'at_risk' ? 'rgba(255,107,107,0.04)' : i % 2 === 0 ? 'var(--navy-850)' : '';
              return `
                <tr style="border-bottom:1px solid var(--border);${rowBg ? 'background:' + rowBg : ''}">
                  <td style="padding:9px 12px;font-size:12px;color:var(--text-primary);font-weight:500">${p.name}</td>
                  <td style="padding:9px 12px;font-size:12px;color:var(--text-secondary)">${p.condition}</td>
                  <td style="padding:9px 12px;font-size:12px;color:var(--text-secondary)">${p.modality}</td>
                  <td style="padding:9px 12px;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--text-primary)">${p.baseline}</td>
                  <td style="padding:9px 12px;text-align:center;font-family:var(--font-mono);font-size:12px;color:${change != null && change < 0 ? 'var(--teal)' : change != null && change > 0 ? 'var(--red)' : 'var(--text-primary)'}">${p.latest != null ? p.latest : '—'}</td>
                  <td style="padding:9px 12px;text-align:center">
                    <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:${_trendBg(p.trend)};color:${_trendColor(p.trend)};font-family:var(--font-mono)">
                      ${_trendArrow(p.trend)} ${p.trend}
                    </span>
                  </td>
                  <td style="padding:9px 12px;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${p.sessions}/${p.totalSessions}</td>
                  <td style="padding:9px 12px">${_alertBadge(p.alert) || '<span style="font-size:11px;color:var(--text-tertiary)">—</span>'}</td>
                  <td style="padding:9px 12px;font-size:11px;color:var(--text-secondary)">${p.nextMilestone}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Window handlers ─────────────────────────────────────────────────────────
window._liFilter = function(filterId) {
  _activeFilter = filterId;
  _rerender();
};

window._liViewPatient = function(patientId) {
  const p = DEMO_PATIENTS.find(pt => pt.id === patientId);
  if (!p) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:400;display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML = `
    <div style="background:var(--navy-850);border:1px solid var(--border);border-radius:12px;max-width:540px;width:100%;max-height:80vh;overflow:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--navy-700);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--teal);font-family:var(--font-mono)">${p.initials}</div>
          <div>
            <h3 style="margin:0;font-size:16px;color:var(--text-primary)">${p.name}</h3>
            <div style="font-size:12px;color:var(--text-tertiary)">${p.age}y · ${p.condition} · ${p.modality}</div>
          </div>
        </div>
        <button onclick="this.closest('.ds-overlay').remove()" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:18px">&times;</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <span style="font-size:10px;font-weight:600;padding:3px 10px;border-radius:4px;background:${_trendBg(p.trend)};color:${_trendColor(p.trend)};font-family:var(--font-mono)">
          ${_trendArrow(p.trend)} ${p.trend}
        </span>
        ${_alertBadge(p.alert)}
        <span style="font-size:10px;color:var(--text-tertiary)">${p.scores.length} data points · ${p.sessions}/${p.totalSessions} sessions</span>
      </div>
      <div style="padding:12px;border-radius:6px;background:var(--navy-900);margin-bottom:16px">
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px">Score trajectory</div>
        <div style="display:flex;align-items:flex-end;gap:2px;height:50px;margin-bottom:8px">
          ${_sparklineBars(p.scores)}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-family:var(--font-mono);color:var(--text-tertiary)">
          <span>Baseline: ${p.baseline}</span>
          <span>Latest: ${p.latest != null ? p.latest : '—'}</span>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5;border-top:1px solid var(--border);padding-top:12px">
        <strong style="color:var(--text-secondary)">Next milestone:</strong> ${p.nextMilestone}<br>
        Trajectory analysis is inferred from available clinic data. External factors may influence outcomes. Review with clinical judgment.
      </div>
    </div>
  `;
  overlay.className = 'ds-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

function _rerender() {
  const el = document.getElementById('li-cards-area');
  const tabs = document.getElementById('li-filter-area');
  if (el) el.innerHTML = _renderTrajectoryCards();
  if (tabs) tabs.innerHTML = _renderFilterTabs();
}

// ── Main render ─────────────────────────────────────────────────────────────
function _renderPage() {
  return `
    <div style="max-width:1200px;margin:0 auto;padding:20px">
      ${_renderSafetyBanner()}
      <div style="margin-bottom:20px">
        <h2 style="font-size:20px;font-weight:800;margin:0 0 4px;color:var(--text-primary)">Longitudinal Insights</h2>
        <p style="margin:0;font-size:12px;color:var(--text-tertiary)">Patient trajectory tracking and progression monitoring</p>
      </div>
      ${_renderKpis()}
      <div id="li-filter-area">${_renderFilterTabs()}</div>
      <div id="li-cards-area">${_renderTrajectoryCards()}</div>
      ${_renderSummaryTable()}
      ${_renderTrendDistribution()}
      ${_renderAdherenceSummary()}
    </div>
  `;
}

// ── Trend distribution ──────────────────────────────────────────────────────
function _renderTrendDistribution() {
  const counts = { improving: 0, stable: 0, declining: 0 };
  DEMO_PATIENTS.forEach(p => { counts[p.trend]++; });
  const total = DEMO_PATIENTS.length;
  const alertCounts = { worsening: 0, plateau: 0, 'off-label': 0, lapsed: 0 };
  DEMO_PATIENTS.forEach(p => { if (p.alert) alertCounts[p.alert] = (alertCounts[p.alert] || 0) + 1; });
  const alertTotal = Object.values(alertCounts).reduce((s, v) => s + v, 0);

  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Trend Distribution</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">${total} patients · inferred from clinic data</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
        <div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
          <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px">Trend breakdown</div>
          ${Object.entries(counts).map(([trend, count]) => {
            const pct = (count / total * 100).toFixed(0);
            return `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                <span style="font-size:11px;color:var(--text-secondary);width:70px;text-transform:capitalize">${trend}</span>
                <div style="flex:1;height:8px;border-radius:4px;background:var(--navy-700)">
                  <div style="height:8px;border-radius:4px;background:${_trendColor(trend)};width:${pct}%;transition:width 0.3s"></div>
                </div>
                <span style="font-size:11px;font-family:var(--font-mono);color:${_trendColor(trend)};width:32px;text-align:right">${count}</span>
                <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-tertiary);width:36px">${pct}%</span>
              </div>
            `;
          }).join('')}
        </div>
        <div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
          <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px">Alert summary</div>
          ${alertTotal > 0 ? Object.entries(alertCounts).filter(([,c]) => c > 0).map(([alert, count]) => {
            const pct = (count / total * 100).toFixed(0);
            return `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                <span style="font-size:11px;color:var(--text-secondary);width:70px;text-transform:capitalize">${alert}</span>
                <div style="flex:1;height:8px;border-radius:4px;background:var(--navy-700)">
                  <div style="height:8px;border-radius:4px;background:var(--amber);width:${pct}%"></div>
                </div>
                <span style="font-size:11px;font-family:var(--font-mono);color:var(--amber);width:32px;text-align:right">${count}</span>
                <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-tertiary);width:36px">${pct}%</span>
              </div>
            `;
          }).join('') : '<div style="font-size:12px;color:var(--text-tertiary);padding:8px 0">No active alerts</div>'}
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
            <div style="font-size:18px;font-weight:700;color:${alertTotal > 0 ? 'var(--amber)' : 'var(--teal)'};font-family:var(--font-mono)">${alertTotal}</div>
            <div style="font-size:11px;color:var(--text-secondary)">Total active alerts · ${(alertTotal / total * 100).toFixed(0)}% of cohort</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Adherence summary ───────────────────────────────────────────────────────
function _renderAdherenceSummary() {
  const avgSessions = (DEMO_PATIENTS.reduce((s, p) => s + p.sessions, 0) / DEMO_PATIENTS.length).toFixed(1);
  const avgProgress = (DEMO_PATIENTS.reduce((s, p) => s + (p.totalSessions > 0 ? p.sessions / p.totalSessions : 0), 0) / DEMO_PATIENTS.length * 100).toFixed(0);
  const complete = DEMO_PATIENTS.filter(p => p.totalSessions > 0 && p.sessions >= p.totalSessions).length;
  const atRisk = DEMO_PATIENTS.filter(p => p.status === 'at_risk').length;

  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Cohort Adherence Overview</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">Session completion metrics</span>
      </div>
      <div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:16px">
          <div style="text-align:center;padding:12px;border-radius:8px;background:rgba(255,255,255,0.02)">
            <div style="font-size:24px;font-weight:700;color:var(--teal);font-family:var(--font-mono)">${avgProgress}%</div>
            <div style="font-size:11px;color:var(--text-secondary)">Avg course progress</div>
          </div>
          <div style="text-align:center;padding:12px;border-radius:8px;background:rgba(255,255,255,0.02)">
            <div style="font-size:24px;font-weight:700;color:var(--blue);font-family:var(--font-mono)">${avgSessions}</div>
            <div style="font-size:11px;color:var(--text-secondary)">Avg sessions completed</div>
          </div>
          <div style="text-align:center;padding:12px;border-radius:8px;background:rgba(255,255,255,0.02)">
            <div style="font-size:24px;font-weight:700;color:var(--green);font-family:var(--font-mono)">${complete}</div>
            <div style="font-size:11px;color:var(--text-secondary)">Courses completed</div>
          </div>
          <div style="text-align:center;padding:12px;border-radius:8px;background:rgba(255,255,255,0.02)">
            <div style="font-size:24px;font-weight:700;color:var(--red);font-family:var(--font-mono)">${atRisk}</div>
            <div style="font-size:11px;color:var(--text-secondary)">Patients at risk</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5;padding-top:12px;border-top:1px solid var(--border)">
          <strong>Data provenance:</strong> Adherence metrics are <em>measured</em> from session completion logs. Patients flagged as "at risk" require clinician follow-up within 48 hours. Trends are <em>inferred</em> and may not capture external confounding factors.
        </div>
      </div>
    </div>
  `;
}

// ── Entry point ─────────────────────────────────────────────────────────────
export async function pgLongitudinalInsights(setTopbar, navigate) {
  setTopbar('Longitudinal Insights',
    `<button class="btn btn-sm btn-ghost" onclick="window._nav('deeptwin-insights')" style="margin-right:6px" title="Correlation engine">DeepTwin</button>` +
    `<button class="btn btn-sm btn-ghost" onclick="window._nav('forecast-simulation')" style="margin-right:6px" title="Prediction workbench">Forecast</button>`
  );

  const clinicId = window.APP_STATE?.clinicId || 'demo-clinic';

  // Fetch longitudinal trajectories from API with demo fallback
  let patients = [];
  try {
    const res = await api.getLongitudinalTrajectories(clinicId);
    patients = res?.patients || res?.items || [];
  } catch (err) {
    console.warn('[LongitudinalInsights] API error, using demo data:', err.message);
  }
  if (patients && patients.length > 0) {
    DEMO_PATIENTS = patients;
  }

  _activeFilter = 'all';
  document.getElementById('content').innerHTML = _renderPage();
}

export default { pgLongitudinalInsights };
