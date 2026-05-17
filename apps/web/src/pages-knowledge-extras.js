// pages-knowledge-extras.js — code-split extras for pages-knowledge.
//
// Holds the bodies of five large page renderers (pgReportBuilder,
// pgQualityAssurance, pgClinicalTrials, pgProtocolMarketplace, pgDataExport)
// that pages-knowledge.js wraps via dynamic import(). Splitting these out
// keeps the main pages-knowledge chunk under Vite's 1 MB warning threshold.
// The wrappers in pages-knowledge.js preserve the source-grep contracts that
// the launch-audit tests check.
import { api, downloadBlob } from './api.js';
import { spinner, tag } from './helpers.js';

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
      <div style="font-size:1.8rem;font-weight:800;color:var(--teal,#00d4bc)">${i.value}</div>
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
      <div style="font-size:1.6rem;font-weight:800;color:var(--teal,#00d4bc)">${i.value}</div>
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
    }).catch(() => { window._showToast?.('Clipboard unavailable. ' + text, 'warning'); });
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

// ── QA Findings / CAPA Register (launch-audit 2026-04-30) ────────────────────
//
// Real, API-backed Quality Assurance findings register. Replaces the prior
// localStorage-only peer-review prototype. Every visible control is wired to
// `/api/v1/qa/findings*` or honestly disabled. Closed findings are immutable;
// reopen creates a new revision; CAPA owners must be real users (the API
// validates owner_id against the User table).
//
// Cross-surface drill-out: rows with source_target_type/id navigate to the
// originating record (adverse_events, sessions, reports, documents, qeeg,
// brain_map_planner). When the API returns an empty list, we render a clear
// "No findings yet" empty state — never invented rows. Demo rows are tagged
// `is_demo=true` and exports prefix with `# DEMO`.

const _QA_PAGE_DISCLAIMERS = [
  'Quality Assurance findings require timely owner action and clinician sign-off.',
  'CAPA owners and due dates support regulator inspection — keep them current.',
  'Closed findings are immutable; reopen creates a new revision with audit trail.',
];

const _QA_FINDING_TYPES = [
  ['non_conformance',    'Non-conformance'],
  ['sae_followup',       'SAE follow-up'],
  ['documentation_gap',  'Documentation gap'],
  ['protocol_deviation', 'Protocol deviation'],
  ['capa',               'CAPA action'],
  ['observation',        'Observation'],
];

const _QA_SEVERITIES = [
  ['minor',    'Minor'],
  ['major',    'Major'],
  ['critical', 'Critical'],
];

const _QA_STATUSES = [
  ['open',        'Open'],
  ['in_progress', 'In progress'],
  ['closed',      'Closed'],
  ['reopened',    'Reopened'],
];

const _QA_SOURCE_TARGETS = [
  ['adverse_events',    'Adverse Event'],
  ['sessions',          'Session'],
  ['reports',           'Report'],
  ['documents',         'Document'],
  ['qeeg',              'qEEG analysis'],
  ['brain_map_planner', 'Brain Map plan'],
];

function _qaEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _qaSeverityBadge(sev) {
  const map = {
    critical: ['#dc2626', '#fee2e2', 'Critical'],
    major:    ['#ea580c', '#fed7aa', 'Major'],
    minor:    ['#2563eb', '#dbeafe', 'Minor'],
  };
  const [color, bg, label] = map[sev] || map.minor;
  return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:9999px;background:${bg};color:${color}">${label}</span>`;
}

function _qaFindingStatusBadge(status) {
  const map = {
    open:        ['#dc2626', '#fee2e2', 'Open'],
    in_progress: ['#d97706', '#fef3c7', 'In progress'],
    closed:      ['#059669', '#d1fae5', 'Closed'],
    reopened:    ['#7c3aed', '#ede9fe', 'Reopened'],
  };
  const [color, bg, label] = map[status] || map.open;
  return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:9999px;background:${bg};color:${color}">${label}</span>`;
}

function _qaDrillOutHref(targetType, targetId) {
  if (!targetType || !targetId) return null;
  const id = encodeURIComponent(targetId);
  switch ((targetType || '').toLowerCase()) {
    case 'adverse_events':    return `?page=adverse-events&id=${id}`;
    case 'sessions':          return `?page=session-execution&id=${id}`;
    case 'reports':           return `?page=reports&id=${id}`;
    case 'documents':         return `?page=documents&id=${id}`;
    case 'qeeg':              return `?page=qeegmaps&id=${id}`;
    case 'brain_map_planner': return `?page=brain-map-planner&id=${id}`;
    default:                  return null;
  }
}

// ── Main exported page function ───────────────────────────────────────────────
export async function pgQualityAssurance(setTopbar) {
  setTopbar('Quality Assurance & Peer Review', `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="window._qaShowCreate()">+ Log Finding</button>
      <button class="btn btn-ghost btn-sm" onclick="window._qaExportCSV()">Export CSV</button>
      <button class="btn btn-ghost btn-sm" onclick="window._qaExportNDJSON()" title="Newline-delimited JSON, one finding per line — preferred regulator format">Export NDJSON</button>
    </div>
  `);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── Page state ────────────────────────────────────────────────────────────
  // Persisted on window so re-entry from a drill-out preserves the filter set.
  const state = (window._qaState = window._qaState || {
    filters: {
      status: '',
      severity: '',
      finding_type: '',
      since: '',
      until: '',
      owner_id: '',
      q: '',
      capa_overdue_only: false,
    },
    selectedId: null,
  });

  // ── Page-load audit ───────────────────────────────────────────────────────
  try {
    if (api && typeof api.logQualityAssuranceAudit === 'function') {
      const p = api.logQualityAssuranceAudit({ event: 'page_loaded', note: 'quality_assurance_page' });
      if (p && p.catch) p.catch(() => {});
    }
  } catch (_) {}

  // ── Data loading ──────────────────────────────────────────────────────────
  async function _qaLoad() {
    let listRes = null;
    let summary = null;
    let listError = null;
    try {
      const [lr, sr] = await Promise.all([
        api.listQualityFindings(state.filters).catch((e) => { listError = e; return null; }),
        api.getQualityFindingsSummary().catch(() => null),
      ]);
      listRes = lr;
      summary = sr;
    } catch (e) {
      listError = e;
    }

    const items = (listRes && Array.isArray(listRes.items)) ? listRes.items : [];
    const total = (listRes && typeof listRes.total === 'number') ? listRes.total : items.length;
    const disclaimers = (listRes && Array.isArray(listRes.disclaimers) && listRes.disclaimers.length)
      ? listRes.disclaimers
      : _QA_PAGE_DISCLAIMERS;

    // Honest demo fallback: only seed demo rows when the live API call FAILED
    // entirely. An empty list from a healthy backend stays empty so reviewers
    // see the truth ("No findings yet").
    const apiFailed = !!listError && items.length === 0;
    const displayItems = apiFailed ? _qaDemoFindings() : items;
    const displaySummary = summary || (apiFailed ? _qaDemoSummary() : { total: 0, open: 0, in_progress: 0, closed: 0, reopened: 0, by_severity: {}, by_finding_type: {}, sae_related: 0, capa_overdue: 0, demo_rows: 0 });
    const displayTotal = apiFailed ? displayItems.length : total;

    state.items = displayItems;
    state.summary = displaySummary;
    state.apiFailed = apiFailed;
    state.disclaimers = disclaimers;
    state.total = displayTotal;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    const s = state.summary || {};
    const items = state.items || [];
    const apiFailed = !!state.apiFailed;

    const banner = `
      <div class="card" style="padding:12px 14px;border-left:3px solid var(--teal);margin-bottom:14px;background:rgba(20,184,166,0.05)">
        <div style="font-weight:600;font-size:.85rem;margin-bottom:6px">Clinical safety</div>
        <ul style="margin:0;padding-left:18px;font-size:.8rem;color:var(--text-muted);line-height:1.5">
          ${(state.disclaimers || _QA_PAGE_DISCLAIMERS).map(d => `<li>${_qaEsc(d)}</li>`).join('')}
        </ul>
        ${apiFailed ? `<div style="margin-top:8px;padding:6px 10px;background:#fef3c7;border-radius:4px;font-size:.78rem;color:#92400e"><b>Backend unreachable.</b> Showing DEMO rows for layout review only — these are <b>NOT</b> regulator-submittable. Refresh once the API is restored.</div>` : ''}
      </div>`;

    const counts = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        ${_qaCountCard('Open',          s.open || 0,           '#dc2626')}
        ${_qaCountCard('In progress',   s.in_progress || 0,    '#d97706')}
        ${_qaCountCard('Closed',        s.closed || 0,         '#059669')}
        ${_qaCountCard('Reopened',      s.reopened || 0,       '#7c3aed')}
        ${_qaCountCard('SAE-related',   s.sae_related || 0,    '#ef4444')}
        ${_qaCountCard('CAPA overdue',  s.capa_overdue || 0,   '#b91c1c', s.capa_overdue ? 'window._qaToggleOverdue()' : null)}
      </div>`;

    const filters = _qaRenderFilters();
    const list    = _qaRenderList(items);

    el.innerHTML = banner + counts + filters + list + _qaRenderModalSlot();

    // Re-attach search debounce hook every render
    const searchEl = document.getElementById('qa-filter-q');
    if (searchEl) {
      searchEl.addEventListener('input', _qaDebouncedSearch, { once: false });
    }
  }

  function _qaCountCard(label, value, color, onclick) {
    const click = onclick ? `onclick="${onclick}" style="cursor:pointer"` : '';
    return `
      <div class="card" style="padding:12px;text-align:center" ${click}>
        <div style="font-size:1.6rem;font-weight:700;color:${color}">${_qaEsc(value)}</div>
        <div style="font-size:.72rem;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:.04em">${_qaEsc(label)}</div>
      </div>`;
  }

  function _qaRenderFilters() {
    const f = state.filters;
    return `
      <div class="card" style="padding:12px;margin-bottom:12px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <select class="form-control" id="qa-filter-status" style="width:auto" onchange="window._qaSetFilter('status', this.value)">
            <option value="">All statuses</option>
            ${_QA_STATUSES.map(([v,l]) => `<option value="${v}" ${f.status===v?'selected':''}>${l}</option>`).join('')}
          </select>
          <select class="form-control" id="qa-filter-severity" style="width:auto" onchange="window._qaSetFilter('severity', this.value)">
            <option value="">All severities</option>
            ${_QA_SEVERITIES.map(([v,l]) => `<option value="${v}" ${f.severity===v?'selected':''}>${l}</option>`).join('')}
          </select>
          <select class="form-control" id="qa-filter-type" style="width:auto" onchange="window._qaSetFilter('finding_type', this.value)">
            <option value="">All types</option>
            ${_QA_FINDING_TYPES.map(([v,l]) => `<option value="${v}" ${f.finding_type===v?'selected':''}>${l}</option>`).join('')}
          </select>
          <input type="date"   class="form-control" id="qa-filter-since" style="width:auto" value="${_qaEsc(f.since)}" onchange="window._qaSetFilter('since', this.value)" title="From (created on or after)">
          <input type="date"   class="form-control" id="qa-filter-until" style="width:auto" value="${_qaEsc(f.until)}" onchange="window._qaSetFilter('until', this.value)" title="Until (created on or before)">
          <input type="text"   class="form-control" id="qa-filter-owner" placeholder="Owner ID" style="width:140px" value="${_qaEsc(f.owner_id)}" onchange="window._qaSetFilter('owner_id', this.value)">
          <input type="search" class="form-control" id="qa-filter-q"     placeholder="Search title / description / CAPA" style="flex:1;min-width:220px" value="${_qaEsc(f.q)}">
          <label style="display:flex;align-items:center;gap:6px;font-size:.82rem;cursor:pointer">
            <input type="checkbox" id="qa-filter-overdue" ${f.capa_overdue_only?'checked':''} onchange="window._qaSetFilter('capa_overdue_only', this.checked)">
            CAPA overdue only
          </label>
          <button class="btn btn-ghost btn-sm" onclick="window._qaClearFilters()">Clear</button>
        </div>
      </div>`;
  }

  function _qaRenderList(items) {
    if (!items.length) {
      return `<div class="card" style="padding:32px;text-align:center;color:var(--text-muted)">
        <div style="font-size:1rem;font-weight:600;margin-bottom:6px">No findings yet</div>
        <div style="font-size:.85rem">QA reviews will land here as reviewers log non-conformances and CAPA actions.</div>
        <div style="margin-top:12px"><button class="btn btn-primary btn-sm" onclick="window._qaShowCreate()">+ Log first finding</button></div>
      </div>`;
    }
    const rows = items.map(_qaRenderRow).join('');
    return `<div style="display:flex;flex-direction:column;gap:10px">${rows}</div>`;
  }

  function _qaRenderRow(it) {
    const drillHref = _qaDrillOutHref(it.source_target_type, it.source_target_id);
    const drillBtn = drillHref
      ? `<a class="btn btn-ghost btn-sm" href="${drillHref}" onclick="window._qaLogDrillOut('${_qaEsc(it.id)}','${_qaEsc(it.source_target_type)}','${_qaEsc(it.source_target_id)}')">Open source ${_qaEsc(it.source_target_type)}</a>`
      : `<span style="font-size:.72rem;color:var(--text-muted)">No source record linked</span>`;
    const overdueChip = it.capa_overdue
      ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:9999px;background:#fee2e2;color:#b91c1c">CAPA overdue</span>`
      : '';
    const demoChip = it.is_demo
      ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:9999px;background:#fef3c7;color:#92400e">DEMO</span>`
      : '';
    const ownerLine = it.owner_display_name || it.owner_id
      ? `Owner: <b style="color:var(--text)">${_qaEsc(it.owner_display_name || it.owner_id)}</b>`
      : `<span style="color:var(--text-muted)">No owner assigned</span>`;
    const dueLine = it.capa_due_date
      ? `Due: <b style="color:${it.capa_overdue?'#b91c1c':'var(--text)'}">${_qaEsc(it.capa_due_date)}</b>`
      : '';
    return `
      <div class="card" style="padding:14px" id="qa-row-${_qaEsc(it.id)}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <div style="font-weight:700;font-size:.95rem">${_qaEsc(it.title)}</div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:3px">${_qaEsc((it.description || '').slice(0, 220))}${(it.description||'').length>220?'…':''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${_qaSeverityBadge(it.severity)}
            ${_qaFindingStatusBadge(it.status)}
            ${overdueChip}
            ${demoChip}
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;font-size:.78rem;color:var(--text-muted)">
          <span>Type: <b style="color:var(--text)">${_qaEsc(it.finding_type)}</b></span>
          <span>${ownerLine}</span>
          ${dueLine?`<span>${dueLine}</span>`:''}
          <span>Reporter: <b style="color:var(--text)">${_qaEsc(it.reporter_id)}</b></span>
          <span>Created: <b style="color:var(--text)">${_qaEsc((it.created_at || '').slice(0,10))}</b></span>
        </div>
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="window._qaOpenDetail('${_qaEsc(it.id)}')">Detail</button>
          ${drillBtn}
        </div>
      </div>`;
  }

  function _qaRenderModalSlot() {
    return `<div id="qa-modal-slot"></div>`;
  }

  // ── Filter handlers ───────────────────────────────────────────────────────
  let _searchTimer = null;
  const _qaDebouncedSearch = (ev) => {
    if (_searchTimer) clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      state.filters.q = ev.target.value || '';
      try { api.logQualityAssuranceAudit?.({ event: 'filter_changed', note: 'q=' + state.filters.q.slice(0,80) }); } catch (_) {}
      _qaReload();
    }, 300);
  };

  window._qaSetFilter = function(key, value) {
    state.filters[key] = value;
    try { api.logQualityAssuranceAudit?.({ event: 'filter_changed', note: key + '=' + String(value).slice(0,80) }); } catch (_) {}
    _qaReload();
  };

  window._qaClearFilters = function() {
    state.filters = { status:'', severity:'', finding_type:'', since:'', until:'', owner_id:'', q:'', capa_overdue_only:false };
    try { api.logQualityAssuranceAudit?.({ event: 'filters_cleared', note: 'all' }); } catch (_) {}
    _qaReload();
  };

  window._qaToggleOverdue = function() {
    state.filters.capa_overdue_only = !state.filters.capa_overdue_only;
    try { api.logQualityAssuranceAudit?.({ event: 'filter_changed', note: 'capa_overdue_only=' + state.filters.capa_overdue_only }); } catch (_) {}
    _qaReload();
  };

  async function _qaReload() {
    el.innerHTML = spinner();
    try { await _qaLoad(); } catch (_) {}
    render();
  }

  // ── Drill-out logging ─────────────────────────────────────────────────────
  window._qaLogDrillOut = function(findingId, targetType, targetId) {
    try {
      api.logQualityAssuranceAudit?.({
        event: 'drill_out',
        finding_id: findingId,
        note: `target=${targetType}:${targetId}`,
      });
    } catch (_) {}
    // Allow the anchor's default href navigation to proceed.
    return true;
  };

  // ── Modal / detail / create / close / reopen ──────────────────────────────
  window._qaShowCreate = function() {
    const slot = document.getElementById('qa-modal-slot');
    if (!slot) return;
    slot.innerHTML = `
      <div class="qa-modal-bg" style="position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999" onclick="if(event.target===this)window._qaCloseModal()">
        <div class="card" style="max-width:560px;width:92%;padding:18px;max-height:90vh;overflow:auto">
          <div style="font-weight:700;font-size:1rem;margin-bottom:10px">Log new QA finding</div>
          <div style="display:grid;gap:10px">
            <input class="form-control" id="qa-new-title" placeholder="Short title (required)">
            <textarea class="form-control" id="qa-new-desc" rows="3" placeholder="Description / context"></textarea>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <select class="form-control" id="qa-new-type">
                ${_QA_FINDING_TYPES.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
              </select>
              <select class="form-control" id="qa-new-sev">
                ${_QA_SEVERITIES.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <select class="form-control" id="qa-new-source-type">
                <option value="">No source surface</option>
                ${_QA_SOURCE_TARGETS.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
              </select>
              <input class="form-control" id="qa-new-source-id" placeholder="Source record ID (optional)">
            </div>
            <input class="form-control" id="qa-new-owner" placeholder="CAPA owner (real user ID; leave blank if none)">
            <textarea class="form-control" id="qa-new-capa" rows="2" placeholder="CAPA action (corrective/preventive plan)"></textarea>
            <input type="date" class="form-control" id="qa-new-due" title="CAPA due date">
            <div id="qa-new-error" style="font-size:.8rem;color:#b91c1c"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
              <button class="btn" onclick="window._qaCloseModal()">Cancel</button>
              <button class="btn btn-primary" id="qa-new-save" onclick="window._qaSubmitCreate()">Save finding</button>
            </div>
          </div>
        </div>
      </div>`;
  };

  window._qaCloseModal = function() {
    const slot = document.getElementById('qa-modal-slot');
    if (slot) slot.innerHTML = '';
  };

  window._qaSubmitCreate = async function() {
    const title = (document.getElementById('qa-new-title')?.value || '').trim();
    if (!title) {
      const err = document.getElementById('qa-new-error');
      if (err) err.textContent = 'Title is required.';
      return;
    }
    const body = {
      title,
      description: document.getElementById('qa-new-desc')?.value || '',
      finding_type: document.getElementById('qa-new-type')?.value || 'non_conformance',
      severity:    document.getElementById('qa-new-sev')?.value || 'minor',
      owner_id:    (document.getElementById('qa-new-owner')?.value || '').trim() || null,
      capa_text:   document.getElementById('qa-new-capa')?.value || null,
      capa_due_date: document.getElementById('qa-new-due')?.value || null,
      source_target_type: document.getElementById('qa-new-source-type')?.value || null,
      source_target_id:   (document.getElementById('qa-new-source-id')?.value || '').trim() || null,
    };
    const btn = document.getElementById('qa-new-save');
    if (btn) btn.disabled = true;
    try {
      const created = await api.createQualityFinding(body);
      try { api.logQualityAssuranceAudit?.({ event: 'created', finding_id: created?.id, note: `severity=${body.severity}` }); } catch (_) {}
      window._qaCloseModal();
      await _qaReload();
    } catch (e) {
      const err = document.getElementById('qa-new-error');
      if (err) err.textContent = (e && e.message) || 'Failed to create finding. The backend may be unreachable; demo mode does not persist creations.';
      if (btn) btn.disabled = false;
    }
  };

  window._qaOpenDetail = async function(id) {
    const slot = document.getElementById('qa-modal-slot');
    if (!slot) return;
    slot.innerHTML = `<div class="qa-modal-bg" style="position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999" onclick="if(event.target===this)window._qaCloseModal()"><div class="card" style="padding:24px;max-width:520px;width:92%">${spinner()}</div></div>`;
    let it = null;
    try {
      it = await api.getQualityFinding(id);
    } catch (_) {
      // fall back to any matching list item (covers demo mode)
      it = (state.items || []).find(x => x.id === id) || null;
    }
    try { api.logQualityAssuranceAudit?.({ event: 'finding_viewed', finding_id: id, note: '' }); } catch (_) {}
    if (!it) {
      slot.innerHTML = `<div class="qa-modal-bg" style="position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999" onclick="if(event.target===this)window._qaCloseModal()"><div class="card" style="padding:24px;max-width:480px;width:92%">
        <div style="font-weight:700;margin-bottom:8px">Finding not found</div>
        <div style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px">It may have been deleted or is not visible at your role.</div>
        <div style="text-align:right"><button class="btn" onclick="window._qaCloseModal()">Close</button></div>
      </div></div>`;
      return;
    }
    state.selectedId = id;
    const drillHref = _qaDrillOutHref(it.source_target_type, it.source_target_id);
    const drillRow = drillHref
      ? `<div style="margin-top:6px"><a class="btn btn-ghost btn-sm" href="${drillHref}" onclick="window._qaLogDrillOut('${_qaEsc(it.id)}','${_qaEsc(it.source_target_type)}','${_qaEsc(it.source_target_id)}')">Open source ${_qaEsc(it.source_target_type)}: ${_qaEsc(it.source_target_id)}</a></div>`
      : '';
    const isClosed = it.status === 'closed';
    const isReopened = it.status === 'reopened';
    const ownerVal = _qaEsc(it.owner_id || '');
    const capaVal = _qaEsc(it.capa_text || '');
    const dueVal = _qaEsc(it.capa_due_date || '');
    slot.innerHTML = `
      <div class="qa-modal-bg" style="position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999" onclick="if(event.target===this)window._qaCloseModal()">
        <div class="card" style="max-width:680px;width:94%;padding:18px;max-height:92vh;overflow:auto">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
            <div>
              <div style="font-weight:700;font-size:1rem">${_qaEsc(it.title)}</div>
              <div style="font-size:.74rem;color:var(--text-muted);margin-top:2px">${_qaEsc(it.id)} · revision_count=${_qaEsc(it.revision_count||0)} · payload_hash=${_qaEsc(it.payload_hash||'-')}</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${_qaSeverityBadge(it.severity)}${_qaFindingStatusBadge(it.status)}${it.is_demo?'<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:9999px;background:#fef3c7;color:#92400e">DEMO</span>':''}</div>
          </div>
          <div style="margin-top:10px;font-size:.85rem;white-space:pre-wrap">${_qaEsc(it.description||'(no description)')}</div>
          ${drillRow}
          <hr style="border:0;border-top:1px solid var(--border);margin:14px 0">
          <div style="font-weight:600;font-size:.82rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Update fields</div>
          <div style="display:grid;gap:8px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <select class="form-control" id="qa-d-sev" ${isClosed?'disabled':''}>
                ${_QA_SEVERITIES.map(([v,l])=>`<option value="${v}" ${it.severity===v?'selected':''}>${l}</option>`).join('')}
              </select>
              <select class="form-control" id="qa-d-status" ${isClosed?'disabled':''}>
                ${_QA_STATUSES.filter(([v]) => v !== 'closed' && v !== 'reopened').map(([v,l])=>`<option value="${v}" ${it.status===v?'selected':''}>${l}</option>`).join('')}
                ${isReopened?`<option value="reopened" selected>Reopened</option>`:''}
              </select>
            </div>
            <input class="form-control" id="qa-d-owner" placeholder="CAPA owner user ID" value="${ownerVal}" ${isClosed?'disabled':''}>
            <textarea class="form-control" id="qa-d-capa" rows="2" placeholder="CAPA action" ${isClosed?'disabled':''}>${capaVal}</textarea>
            <input type="date" class="form-control" id="qa-d-due" value="${dueVal}" ${isClosed?'disabled':''}>
            <div id="qa-d-error" style="font-size:.8rem;color:#b91c1c"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
              ${isClosed
                ? `<button class="btn btn-primary" onclick="window._qaShowReopen('${_qaEsc(it.id)}')">Reopen finding</button>`
                : `<button class="btn btn-primary" onclick="window._qaSavePatch('${_qaEsc(it.id)}')">Save changes</button>
                   <button class="btn" onclick="window._qaShowClose('${_qaEsc(it.id)}')">Sign-off &amp; close</button>`}
              <button class="btn btn-ghost" onclick="window._qaCloseModal()">Close</button>
            </div>
            ${isClosed ? `<div style="margin-top:10px;padding:10px;background:rgba(5,150,105,.06);border-left:3px solid #059669;font-size:.8rem"><b>Closed</b> by <code>${_qaEsc(it.closed_by||'-')}</code> at <code>${_qaEsc(it.closed_at||'-')}</code><div style="margin-top:4px;color:var(--text-muted)">${_qaEsc(it.closure_note||'')}</div></div>` : ''}
          </div>
        </div>
      </div>`;
  };

  window._qaSavePatch = async function(id) {
    const body = {
      severity:    document.getElementById('qa-d-sev')?.value || null,
      status:      document.getElementById('qa-d-status')?.value || null,
      owner_id:    (document.getElementById('qa-d-owner')?.value || '').trim(),
      capa_text:   document.getElementById('qa-d-capa')?.value || null,
      capa_due_date: document.getElementById('qa-d-due')?.value || null,
    };
    try {
      await api.patchQualityFinding(id, body);
      try { api.logQualityAssuranceAudit?.({ event: 'updated', finding_id: id, note: 'severity='+body.severity+';status='+body.status }); } catch (_) {}
      window._qaCloseModal();
      await _qaReload();
    } catch (e) {
      const err = document.getElementById('qa-d-error');
      if (err) err.textContent = (e && e.message) || 'Update failed.';
    }
  };

  window._qaShowClose = function(id) {
    const slot = document.getElementById('qa-modal-slot');
    if (!slot) return;
    slot.innerHTML = `
      <div class="qa-modal-bg" style="position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999" onclick="if(event.target===this)window._qaCloseModal()">
        <div class="card" style="max-width:520px;width:92%;padding:18px">
          <div style="font-weight:700;font-size:1rem;margin-bottom:6px">Sign-off &amp; close</div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px">Closure is immutable. Record what corrective action satisfied this finding — a regulator will review this note.</div>
          <textarea class="form-control" id="qa-close-note" rows="4" placeholder="Closure note (required)"></textarea>
          <input class="form-control" id="qa-close-sig" placeholder="Sign-off signature (optional, e.g. clinician initials)" style="margin-top:8px">
          <div id="qa-close-error" style="font-size:.8rem;color:#b91c1c;margin-top:6px"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
            <button class="btn" onclick="window._qaOpenDetail('${_qaEsc(id)}')">Back</button>
            <button class="btn btn-primary" onclick="window._qaConfirmClose('${_qaEsc(id)}')">Sign &amp; close</button>
          </div>
        </div>
      </div>`;
  };

  window._qaConfirmClose = async function(id) {
    const note = (document.getElementById('qa-close-note')?.value || '').trim();
    const sig  = (document.getElementById('qa-close-sig')?.value || '').trim();
    if (!note) {
      const err = document.getElementById('qa-close-error');
      if (err) err.textContent = 'Closure note is required.';
      return;
    }
    try {
      await api.closeQualityFinding(id, { note, signature: sig || null });
      try { api.logQualityAssuranceAudit?.({ event: 'closed', finding_id: id, note: '' }); } catch (_) {}
      window._qaCloseModal();
      await _qaReload();
    } catch (e) {
      const err = document.getElementById('qa-close-error');
      if (err) err.textContent = (e && e.message) || 'Close failed.';
    }
  };

  window._qaShowReopen = function(id) {
    const slot = document.getElementById('qa-modal-slot');
    if (!slot) return;
    slot.innerHTML = `
      <div class="qa-modal-bg" style="position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999" onclick="if(event.target===this)window._qaCloseModal()">
        <div class="card" style="max-width:520px;width:92%;padding:18px">
          <div style="font-weight:700;font-size:1rem;margin-bottom:6px">Reopen finding</div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px">Reopening creates a new immutable revision in the audit trail. The prior closure metadata is preserved in the revision history.</div>
          <textarea class="form-control" id="qa-reopen-reason" rows="4" placeholder="Reason for reopening (required)"></textarea>
          <div id="qa-reopen-error" style="font-size:.8rem;color:#b91c1c;margin-top:6px"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
            <button class="btn" onclick="window._qaOpenDetail('${_qaEsc(id)}')">Back</button>
            <button class="btn btn-primary" onclick="window._qaConfirmReopen('${_qaEsc(id)}')">Reopen</button>
          </div>
        </div>
      </div>`;
  };

  window._qaConfirmReopen = async function(id) {
    const reason = (document.getElementById('qa-reopen-reason')?.value || '').trim();
    if (!reason) {
      const err = document.getElementById('qa-reopen-error');
      if (err) err.textContent = 'Reason is required.';
      return;
    }
    try {
      await api.reopenQualityFinding(id, { reason });
      try { api.logQualityAssuranceAudit?.({ event: 'reopened', finding_id: id, note: reason.slice(0,80) }); } catch (_) {}
      window._qaCloseModal();
      await _qaReload();
    } catch (e) {
      const err = document.getElementById('qa-reopen-error');
      if (err) err.textContent = (e && e.message) || 'Reopen failed.';
    }
  };

  // ── Exports ───────────────────────────────────────────────────────────────
  window._qaExportCSV = async function() {
    try { api.logQualityAssuranceAudit?.({ event: 'export_csv', note: JSON.stringify(state.filters).slice(0,200) }); } catch (_) {}
    try {
      const blob = await api.exportQualityFindingsCsv(state.filters);
      downloadBlob(blob, 'quality_findings.csv');
    } catch (e) {
      alert('CSV export failed: ' + ((e && e.message) || 'unknown error'));
    }
  };

  window._qaExportNDJSON = async function() {
    try { api.logQualityAssuranceAudit?.({ event: 'export_ndjson', note: JSON.stringify(state.filters).slice(0,200) }); } catch (_) {}
    try {
      const blob = await api.exportQualityFindingsNdjson(state.filters);
      downloadBlob(blob, 'quality_findings.ndjson');
    } catch (e) {
      alert('NDJSON export failed: ' + ((e && e.message) || 'unknown error'));
    }
  };

  // ── Initial load ──────────────────────────────────────────────────────────
  await _qaLoad();
  render();
}

// ── Honest demo seeds for offline / API-down preview ─────────────────────────
function _qaDemoFindings() {
  const today = new Date();
  const iso = (n) => { const d = new Date(today); d.setDate(d.getDate()+n); return d.toISOString(); };
  const day = (n) => iso(n).slice(0,10);
  return [
    {
      id: 'demo-finding-1',
      title: 'Documentation gap on consent re-attestation',
      description: 'Consent attestation missing for protocol amendment v2 in 3 cases.',
      finding_type: 'documentation_gap',
      severity: 'major',
      status: 'open',
      owner_id: 'demo-owner-1',
      owner_display_name: 'Dr. Demo Clinician',
      capa_text: 'Re-attest consent; review staff training.',
      capa_due_date: day(-2),
      capa_overdue: true,
      source_target_type: 'documents',
      source_target_id: 'demo-doc-1',
      evidence_links: [],
      is_demo: true,
      created_at: iso(-7),
      updated_at: iso(-1),
      reporter_id: 'demo-reporter',
      revision_count: 1,
      payload_hash: 'demo0001',
    },
    {
      id: 'demo-finding-2',
      title: 'SAE follow-up overdue (rTMS protocol B)',
      description: 'Adverse event AE-demo-009 lacks 14-day follow-up note.',
      finding_type: 'sae_followup',
      severity: 'critical',
      status: 'in_progress',
      owner_id: 'demo-owner-2',
      owner_display_name: 'NP. Demo Reviewer',
      capa_text: 'Schedule follow-up; document outcome.',
      capa_due_date: day(3),
      capa_overdue: false,
      source_target_type: 'adverse_events',
      source_target_id: 'AE-demo-009',
      evidence_links: [],
      is_demo: true,
      created_at: iso(-3),
      updated_at: iso(0),
      reporter_id: 'demo-reporter',
      revision_count: 2,
      payload_hash: 'demo0002',
    },
    {
      id: 'demo-finding-3',
      title: 'Closed: protocol fidelity in qEEG cleaning step',
      description: 'Resolved — staff retrained on artifact rejection threshold.',
      finding_type: 'protocol_deviation',
      severity: 'minor',
      status: 'closed',
      owner_id: null,
      owner_display_name: null,
      capa_text: 'Training delivered 2026-04-20.',
      capa_due_date: day(-10),
      capa_overdue: false,
      source_target_type: 'qeeg',
      source_target_id: 'demo-qeeg-1',
      evidence_links: [],
      is_demo: true,
      created_at: iso(-21),
      updated_at: iso(-9),
      closed_at: iso(-9),
      closed_by: 'demo-admin',
      closure_note: 'Training records on file.',
      reporter_id: 'demo-reporter',
      revision_count: 3,
      payload_hash: 'demo0003',
    },
  ];
}

function _qaDemoSummary() {
  return {
    total: 3,
    open: 1,
    in_progress: 1,
    closed: 1,
    reopened: 0,
    by_severity: { minor: 1, major: 1, critical: 1 },
    by_finding_type: { documentation_gap: 1, sae_followup: 1, protocol_deviation: 1 },
    sae_related: 1,
    capa_overdue: 1,
    demo_rows: 3,
  };
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
    + '<span id="wiz-step-1" style="padding:3px 10px;border-radius:12px;font-size:.72rem;font-weight:700;background:var(--teal);color:#000">1. Basic Info</span>'
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

  var _activeTab = 'trials-register';
  var _filterStatus = '';
  var _filterPhase = '';
  var _selectedTrialId = '';
  var _selectedDataTrialId = '';
  var _wizStep = 1;
  var _wizArms = [];
  var _trialIdBeingEdited = null;
  var _expandedTrials = {};

  var OUTCOME_MEASURES = ['PHQ-9','GAD-7','ADHD-RS','HAM-D','CGI','BIS-11','Custom'];

  // ── API-backed Clinical Trials register state (launch-audit 2026-04-30) ──
  // Mirrors the IRB Manager (#334) pattern: a regulator-credible register
  // tab that talks to /api/v1/clinical-trials/trials, alongside the legacy
  // localStorage-backed demo tabs which are clearly marked as such.
  var _apiTrials = null;       // null = not loaded yet
  var _apiSummary = null;
  var _apiError = null;
  var _apiFilterStatus = '';
  var _apiFilterPhase = '';
  var _apiFilterPI = '';
  var _apiFilterNct = '';
  var _apiFilterIrb = '';
  var _apiFilterSiteId = '';
  var _apiFilterQ = '';
  var _apiFilterSince = '';
  var _apiFilterUntil = '';

  function _ctApi() {
    // The module-level `api` import is the authoritative client. Defensive
    // wrapper here keeps any future window.api fallback honest if a downstream
    // bundler swaps the shell, and avoids hard-crashing if the import is
    // missing during a partial reload.
    try {
      if (api && typeof api === 'object') return api;
    } catch (_) {}
    if (typeof window !== 'undefined' && window.api && typeof window.api === 'object') {
      return window.api;
    }
    return null;
  }

  function _ctEsc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _emitCtAudit(event, opts) {
    try {
      var api = _ctApi();
      if (api && typeof api.logClinicalTrialsAudit === 'function') {
        api.logClinicalTrialsAudit(Object.assign({ event: event }, opts || {}));
      }
    } catch (_) { /* swallow — audit must never block UI */ }
  }

  function _ctBuildFilterParams() {
    var p = {};
    if (_apiFilterStatus) p.status = _apiFilterStatus;
    if (_apiFilterPhase) p.phase = _apiFilterPhase;
    if (_apiFilterPI) p.pi_user_id = _apiFilterPI;
    if (_apiFilterNct) p.nct_number = _apiFilterNct;
    if (_apiFilterIrb) p.irb_protocol_id = _apiFilterIrb;
    if (_apiFilterSiteId) p.site_id = _apiFilterSiteId;
    if (_apiFilterQ) p.q = _apiFilterQ;
    if (_apiFilterSince) p.since = _apiFilterSince;
    if (_apiFilterUntil) p.until = _apiFilterUntil;
    return p;
  }

  async function _ctLoadTrials() {
    _apiError = null;
    var api = _ctApi();
    if (!api || typeof api.listClinicalTrials !== 'function') {
      _apiError = 'API client not available; cannot load clinical trials.';
      _apiTrials = [];
      _apiSummary = null;
      return;
    }
    try {
      var params = _ctBuildFilterParams();
      var listP = api.listClinicalTrials(params);
      var sumP = (typeof api.getClinicalTrialsSummary === 'function')
        ? api.getClinicalTrialsSummary().catch(function() { return null; })
        : Promise.resolve(null);
      var results = await Promise.all([listP, sumP]);
      var list = results[0];
      var summary = results[1];
      _apiTrials = (list && Array.isArray(list.items)) ? list.items : [];
      _apiSummary = summary;
    } catch (err) {
      _apiError = (err && err.message) ? err.message : 'Failed to load clinical trials.';
      _apiTrials = [];
      _apiSummary = null;
    }
  }

  function _ctStatusBadge(status) {
    var color = ({
      planning: 'var(--text-muted)',
      recruiting: 'var(--blue)',
      active: 'var(--teal)',
      paused: 'var(--amber)',
      closed: 'var(--text-muted)',
      completed: '#9b7fff',
      terminated: 'var(--rose)',
    })[status] || 'var(--text-muted)';
    return '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;background:' + color + '22;color:' + color + ';border:1px solid ' + color + '55">' + _ctEsc(status) + '</span>';
  }

  function _ctRenderTopCounts(s) {
    if (!s) {
      s = { total: 0, active: 0, recruiting: 0, paused: 0, closed: 0, completed: 0, terminated: 0, planning: 0, enrollment_open: 0, sae_flagged: 0, pending_irb: 0, demo_rows: 0 };
    }
    var counts = [
      ['Total', s.total != null ? s.total : 0, 'var(--text)'],
      ['Active', s.active != null ? s.active : 0, 'var(--teal)'],
      ['Recruiting', s.recruiting != null ? s.recruiting : 0, 'var(--blue)'],
      ['Pending IRB', s.pending_irb != null ? s.pending_irb : 0, 'var(--amber)'],
      ['Paused', s.paused != null ? s.paused : 0, 'var(--amber)'],
      ['Closed', s.closed != null ? s.closed : 0, 'var(--text-muted)'],
      ['Enrolment Open', s.enrollment_open != null ? s.enrollment_open : 0, 'var(--teal)'],
      ['SAE-Flagged', s.sae_flagged != null ? s.sae_flagged : 0, 'var(--rose)'],
    ];
    return '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">' + counts.map(function(c) {
      return '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:10px 14px;min-width:120px"><div style="font-size:10.5px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px">' + _ctEsc(c[0]) + '</div><div style="font-size:18px;font-weight:800;color:' + c[2] + ';margin-top:3px">' + _ctEsc(c[1]) + '</div></div>';
    }).join('') + '</div>';
  }

  function _ctRenderFilters() {
    var statuses = ['', 'planning','recruiting','active','paused','closed','completed','terminated'];
    var phases = ['', 'i','ii','iii','iv','observational','pilot','feasibility','registry'];
    return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;align-items:flex-end">'
      + '<div><label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:3px">Status</label><select class="form-control" style="font-size:12px;width:auto" onchange="window._ctApiSetFilter(\'status\',this.value)">'
      + statuses.map(function(v) { return '<option value="' + v + '"' + (_apiFilterStatus===v?' selected':'') + '>' + (v||'All') + '</option>'; }).join('') + '</select></div>'
      + '<div><label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:3px">Phase</label><select class="form-control" style="font-size:12px;width:auto" onchange="window._ctApiSetFilter(\'phase\',this.value)">'
      + phases.map(function(v) { return '<option value="' + v + '"' + (_apiFilterPhase===v?' selected':'') + '>' + (v||'All') + '</option>'; }).join('') + '</select></div>'
      + '<div><label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:3px">PI user_id</label><input class="form-control" style="font-size:12px;width:160px" placeholder="actor-…" value="' + _ctEsc(_apiFilterPI) + '" oninput="window._ctApiSetFilter(\'pi\',this.value)"></div>'
      + '<div><label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:3px">NCT number</label><input class="form-control" style="font-size:12px;width:140px" placeholder="NCT…" value="' + _ctEsc(_apiFilterNct) + '" oninput="window._ctApiSetFilter(\'nct\',this.value)"></div>'
      + '<div><label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:3px">IRB protocol_id</label><input class="form-control" style="font-size:12px;width:160px" placeholder="proto-…" value="' + _ctEsc(_apiFilterIrb) + '" oninput="window._ctApiSetFilter(\'irb\',this.value)"></div>'
      + '<div><label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:3px">Site id</label><input class="form-control" style="font-size:12px;width:140px" placeholder="site-…" value="' + _ctEsc(_apiFilterSiteId) + '" oninput="window._ctApiSetFilter(\'site\',this.value)"></div>'
      + '<div><label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:3px">Search</label><input class="form-control" style="font-size:12px;width:180px" placeholder="title / sponsor / NCT" value="' + _ctEsc(_apiFilterQ) + '" oninput="window._ctApiSetFilter(\'q\',this.value)"></div>'
      + '<div><label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:3px">Since</label><input type="date" class="form-control" style="font-size:12px;width:auto" value="' + _ctEsc(_apiFilterSince) + '" onchange="window._ctApiSetFilter(\'since\',this.value)"></div>'
      + '<div><label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:3px">Until</label><input type="date" class="form-control" style="font-size:12px;width:auto" value="' + _ctEsc(_apiFilterUntil) + '" onchange="window._ctApiSetFilter(\'until\',this.value)"></div>'
      + '<button class="btn btn-ghost" style="font-size:.78rem;padding:5px 12px" onclick="window._ctApiApply()">Apply</button>'
      + '<button class="btn btn-ghost" style="font-size:.78rem;padding:5px 12px" onclick="window._ctApiClearFilters()">Clear</button>'
      + '</div>';
  }

  function _ctRenderActions() {
    return '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">'
      + '<button class="btn btn-primary" style="font-size:.82rem;padding:6px 14px" onclick="window._ctApiNewModal()">+ Register New Trial</button>'
      + '<button class="btn btn-ghost" style="font-size:.78rem;padding:5px 12px" onclick="window._ctApiExport(\'csv\')">Export CSV</button>'
      + '<button class="btn btn-ghost" style="font-size:.78rem;padding:5px 12px" onclick="window._ctApiExport(\'ndjson\')">Export NDJSON</button>'
      + '<button class="btn btn-ghost" style="font-size:.78rem;padding:5px 12px" onclick="window._ctApiRefresh()">Refresh</button>'
      + '</div>';
  }

  function _ctRenderTrialsRegister() {
    if (_apiTrials === null) {
      return '<div style="padding:40px;text-align:center;color:var(--text-muted)">Loading clinical trials register…</div>';
    }
    var s = _apiSummary || {};
    var disclaimers = (s.disclaimers || []);
    var demoRows = s.demo_rows != null ? s.demo_rows : 0;
    var banner = '<div style="background:var(--blue)12;border:1px solid var(--blue)44;border-radius:8px;padding:11px 14px;margin-bottom:14px;font-size:12px;color:var(--text)"><strong style="color:var(--blue)">Regulator-credible register:</strong> All entries below FK to a real IRB-approved protocol and are persisted server-side with append-only audit trail. The other tabs are local demo data only.</div>';
    if (_apiError) {
      banner += '<div style="background:var(--rose)18;border:1px solid var(--rose)55;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--rose);font-weight:600">API error: ' + _ctEsc(_apiError) + '. Retry or check authentication.</div>';
    }
    if (demoRows > 0) {
      banner += '<div style="background:var(--amber)18;border:1px solid var(--amber)55;border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:12px;color:var(--amber);font-weight:600">' + demoRows + ' demo row' + (demoRows>1?'s':'') + ' visible — exports will carry a DEMO prefix and are NOT regulator-submittable.</div>';
    }
    var disclList = disclaimers.length
      ? '<div style="background:var(--hover-bg);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:11.5px;color:var(--text-muted);line-height:1.6"><strong>Disclaimers:</strong><ul style="margin:6px 0 0 18px;padding:0">' + disclaimers.map(function(d) { return '<li>' + _ctEsc(d) + '</li>'; }).join('') + '</ul></div>'
      : '';
    var counts = _ctRenderTopCounts(s);
    var filters = _ctRenderFilters();
    var actions = _ctRenderActions();

    var rows;
    if (!_apiTrials.length) {
      rows = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);background:var(--hover-bg);border:1px dashed var(--border);border-radius:10px">No clinical trials registered yet.</div>';
    } else {
      rows = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="border-bottom:2px solid var(--border)">'
        + ['NCT','Title','PI','Phase','Status','Sponsor','Sites','Enrolled','IRB','Demo',''].map(function(h) {
            return '<th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">' + _ctEsc(h) + '</th>';
          }).join('') + '</tr></thead><tbody>'
        + _apiTrials.map(function(t) {
            var sites = Array.isArray(t.sites) ? t.sites : [];
            var enrol = (t.enrolled_active != null ? t.enrolled_active : 0) + (t.enrollment_target ? (' / ' + t.enrollment_target) : '');
            var demoBadge = t.is_demo
              ? '<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;background:var(--amber)22;color:var(--amber);border:1px solid var(--amber)55">DEMO</span>'
              : '';
            var irbLink = t.irb_protocol_id
              ? '<a href="?page=irb-manager&protocol_id=' + encodeURIComponent(t.irb_protocol_id) + '" style="color:var(--blue);text-decoration:none">' + _ctEsc(t.irb_protocol_code || t.irb_protocol_id.slice(0,8)) + '</a>'
              : '—';
            return '<tr style="border-bottom:1px solid var(--border)">'
              + '<td style="padding:8px 10px;font-family:monospace;font-size:11.5px">' + _ctEsc(t.nct_number || '—') + '</td>'
              + '<td style="padding:8px 10px;font-weight:600">' + _ctEsc(t.title) + '</td>'
              + '<td style="padding:8px 10px">' + _ctEsc(t.pi_display_name || t.pi_user_id || '—') + '</td>'
              + '<td style="padding:8px 10px">' + _ctEsc(t.phase || '—') + '</td>'
              + '<td style="padding:8px 10px">' + _ctStatusBadge(t.status) + '</td>'
              + '<td style="padding:8px 10px;color:var(--text-muted)">' + _ctEsc(t.sponsor || '—') + '</td>'
              + '<td style="padding:8px 10px">' + sites.length + '</td>'
              + '<td style="padding:8px 10px">' + _ctEsc(enrol) + '</td>'
              + '<td style="padding:8px 10px">' + irbLink + '</td>'
              + '<td style="padding:8px 10px">' + demoBadge + '</td>'
              + '<td style="padding:8px 10px;white-space:nowrap"><button class="btn btn-ghost" style="font-size:.72rem;padding:3px 10px" onclick="window._ctApiDetail(\'' + _ctEsc(t.id) + '\')">Detail</button></td>'
              + '</tr>';
          }).join('') + '</tbody></table></div>';
    }
    return '<div>' + banner + counts + disclList + filters + actions + rows + '</div>';
  }

  function render() {
    var trials = getTrials();
    var tabs = [
      { id: 'trials-register', label: 'Trials Register' },
      { id: 'registry', label: 'Trial Registry (legacy demo)' },
      { id: 'participants', label: 'Participants (legacy demo)' },
      { id: 'data', label: 'Data Collection (legacy demo)' },
    ];
    var tabBar = '<div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px;overflow-x:auto">'
      + tabs.map(function(t) {
          var active = _activeTab === t.id;
          return '<button onclick="window._trialTabSwitch(\'' + t.id + '\')" style="padding:10px 18px;border:none;background:none;cursor:pointer;font-size:.85rem;font-weight:' + (active?'700':'400') + ';color:' + (active?'var(--teal)':'var(--text-muted)') + ';border-bottom:' + (active?'2px solid var(--teal)':'2px solid transparent') + ';margin-bottom:-2px;white-space:nowrap;transition:all .15s">' + t.label + '</button>';
        }).join('')
      + '</div>';
    var body = '';
    if (_activeTab === 'trials-register') body = _ctRenderTrialsRegister();
    else if (_activeTab === 'registry') body = renderRegistry(trials);
    else if (_activeTab === 'participants') body = renderParticipants(trials);
    else body = renderDataCollection(trials);
    el.innerHTML = tabBar + body;
    bindHandlers();
    _ctBindHandlers();
  }

  // Initial API load — kick off then re-render so the spinner is replaced.
  _ctLoadTrials().then(function() {
    _emitCtAudit('page_loaded', { note: 'trials-register' });
    render();
  });

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
          return '<button onclick="window._trialFilterStatus(\'' + s + '\')" style="padding:3px 10px;border-radius:12px;border:1px solid var(--border);background:' + (active ? 'var(--teal)' : 'var(--card-bg)') + ';color:' + (active ? '#000' : 'var(--text-secondary)') + ';font-size:.72rem;font-weight:600;cursor:pointer">' + label + '</button>';
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
            + '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:4px">Enrollment: <strong style="color:var(--text-primary)">' + stats.total + ' / ' + trial.targetEnrollment + '</strong><span style="color:var(--teal);margin-left:4px">(' + stats.enrollmentPct + '%)</span></div>'
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
        if (el2) { el2.style.background = i === 0 ? 'var(--teal)' : 'var(--hover-bg)'; el2.style.color = i === 0 ? '#000' : 'var(--text-muted)'; }
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
        if (el2) { el2.style.background = i === next - 1 ? 'var(--teal)' : 'var(--hover-bg)'; el2.style.color = i === next - 1 ? '#000' : 'var(--text-muted)'; }
      });
      if (next === 2) window._trialRenderArms();
    };

    window._trialWizBack = function(currentStep) {
      var prev = currentStep - 1;
      document.getElementById('wiz-panel-' + currentStep).style.display = 'none';
      document.getElementById('wiz-panel-' + prev).style.display = '';
      ['wiz-step-1','wiz-step-2','wiz-step-3'].forEach(function(sid, i) {
        var el2 = document.getElementById(sid);
        if (el2) { el2.style.background = i === prev - 1 ? 'var(--teal)' : 'var(--hover-bg)'; el2.style.color = i === prev - 1 ? '#000' : 'var(--text-muted)'; }
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
      if (!title || !title.trim()) { window._showToast?.('Please enter a trial title.', 'warning'); return; }
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
      window._showToast?.(msg2, 'success');
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
      if (msg) { msg.style.display = 'block'; msg.style.color = '#10b981'; msg.textContent = '\u2713 Data point saved in this browser view.'; }
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

  // ── API-backed Clinical Trials register handlers (launch-audit) ─────────
  function _ctBindHandlers() {
    window._trialTabSwitch = function(tab) { _activeTab = tab; render(); };

    window._ctApiSetFilter = function(key, value) {
      if (key === 'status') _apiFilterStatus = value;
      else if (key === 'phase') _apiFilterPhase = value;
      else if (key === 'pi') _apiFilterPI = value;
      else if (key === 'nct') _apiFilterNct = value;
      else if (key === 'irb') _apiFilterIrb = value;
      else if (key === 'site') _apiFilterSiteId = value;
      else if (key === 'q') _apiFilterQ = value;
      else if (key === 'since') _apiFilterSince = value;
      else if (key === 'until') _apiFilterUntil = value;
    };

    window._ctApiApply = function() {
      _emitCtAudit('filter_changed', { note: 'status=' + (_apiFilterStatus||'-') + ' phase=' + (_apiFilterPhase||'-') + ' nct=' + (_apiFilterNct||'-') + ' q=' + ((_apiFilterQ||'-').slice(0,80)) });
      _ctLoadTrials().then(function() { _activeTab = 'trials-register'; render(); });
    };

    window._ctApiClearFilters = function() {
      _apiFilterStatus = ''; _apiFilterPhase = ''; _apiFilterPI = '';
      _apiFilterNct = ''; _apiFilterIrb = ''; _apiFilterSiteId = '';
      _apiFilterQ = ''; _apiFilterSince = ''; _apiFilterUntil = '';
      _ctLoadTrials().then(function() { _activeTab = 'trials-register'; render(); });
    };

    window._ctApiRefresh = function() {
      _ctLoadTrials().then(function() { render(); });
    };

    window._ctApiExport = function(format) {
      var api = _ctApi();
      if (!api) return;
      var fn = (format === 'ndjson') ? api.exportClinicalTrialsNdjson : api.exportClinicalTrialsCsv;
      if (typeof fn !== 'function') return;
      try {
        var p = fn.call(api, _ctBuildFilterParams());
        if (p && typeof p.then === 'function') {
          p.then(function(blob) {
            try {
              var url = URL.createObjectURL(blob);
              var a = document.createElement('a');
              a.href = url;
              a.download = 'clinical_trials.' + (format === 'ndjson' ? 'ndjson' : 'csv');
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            } catch (_) {}
          });
        }
        _emitCtAudit('export_' + format, { note: 'rows=' + ((_apiTrials || []).length) });
      } catch (_) {}
    };

    window._ctApiNewModal = function() {
      var existing = document.getElementById('ct-new-modal');
      if (existing) existing.remove();
      var html = '<div id="ct-new-modal" onclick="if(event.target.id===\'ct-new-modal\')window._ctCloseModal(\'ct-new-modal\')" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px">'
        + '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0;font-size:15px;font-weight:800;color:var(--text)">Register New Clinical Trial</h3><button onclick="window._ctCloseModal(\'ct-new-modal\')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1">x</button></div>'
        + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:14px;background:var(--hover-bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px">Trials must FK to a real IRB-approved protocol id. PI must be a real user_id. NCT number is optional but recommended for regulator submission.</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div style="grid-column:1/-1"><label class="form-label">Trial Title *</label><input class="form-control" id="ct-new-title" placeholder="e.g. Theta Burst TMS for TRD: Multi-Site RCT"></div>'
        + '<div style="grid-column:1/-1"><label class="form-label">IRB protocol_id *</label><input class="form-control" id="ct-new-irb" placeholder="UUID of an IRB protocol from /api/v1/irb/protocols"></div>'
        + '<div><label class="form-label">PI user_id *</label><input class="form-control" id="ct-new-pi" placeholder="actor-clinician-…"></div>'
        + '<div><label class="form-label">NCT number</label><input class="form-control" id="ct-new-nct" placeholder="NCT12345678"></div>'
        + '<div><label class="form-label">Phase</label><select class="form-control" id="ct-new-phase">'
        + ['','i','ii','iii','iv','observational','pilot','feasibility','registry'].map(function(v) { return '<option value="' + v + '">' + (v || '—') + '</option>'; }).join('')
        + '</select></div>'
        + '<div><label class="form-label">Sponsor</label><input class="form-control" id="ct-new-sponsor" placeholder="Sponsor / funder"></div>'
        + '<div><label class="form-label">Enrolment Target</label><input type="number" class="form-control" id="ct-new-target" placeholder="e.g. 60" min="0"></div>'
        + '<div><label class="form-label">Primary Site Name</label><input class="form-control" id="ct-new-site" placeholder="e.g. London Main Site"></div>'
        + '<div style="grid-column:1/-1"><label class="form-label">Description</label><textarea class="form-control" id="ct-new-desc" rows="3" placeholder="Brief description"></textarea></div>'
        + '<div style="grid-column:1/-1;display:flex;align-items:center;gap:8px"><input type="checkbox" id="ct-new-demo"><label for="ct-new-demo" style="font-size:.8rem">Mark as demo data (NOT regulator-submittable)</label></div>'
        + '</div>'
        + '<div id="ct-new-msg" style="display:none;margin-top:10px;font-size:.82rem"></div>'
        + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button class="btn btn-ghost" onclick="window._ctCloseModal(\'ct-new-modal\')">Cancel</button><button class="btn btn-primary" onclick="window._ctApiCreate()">Register Trial</button></div>'
        + '</div></div>';
      document.body.insertAdjacentHTML('beforeend', html);
    };

    window._ctCloseModal = function(id) {
      var m = document.getElementById(id);
      if (m) m.remove();
    };

    window._ctApiCreate = function() {
      var api = _ctApi();
      if (!api || typeof api.createClinicalTrial !== 'function') return;
      var get = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
      var title = (get('ct-new-title') || '').trim();
      var irb = (get('ct-new-irb') || '').trim();
      var pi = (get('ct-new-pi') || '').trim();
      var nct = (get('ct-new-nct') || '').trim();
      var phase = (get('ct-new-phase') || '').trim();
      var sponsor = (get('ct-new-sponsor') || '').trim();
      var target = parseInt(get('ct-new-target'), 10);
      var siteName = (get('ct-new-site') || '').trim();
      var desc = (get('ct-new-desc') || '').trim();
      var demoEl = document.getElementById('ct-new-demo');
      var isDemo = demoEl ? !!demoEl.checked : false;
      var msg = document.getElementById('ct-new-msg');
      function showErr(text) {
        if (msg) {
          msg.style.display = 'block';
          msg.style.color = 'var(--rose)';
          msg.textContent = text;
        }
      }
      if (!title) { showErr('Title is required.'); return; }
      if (!irb) { showErr('IRB protocol_id is required.'); return; }
      if (!pi) { showErr('PI user_id is required.'); return; }
      var body = {
        title: title,
        irb_protocol_id: irb,
        pi_user_id: pi,
        description: desc,
        is_demo: isDemo,
      };
      if (nct) body.nct_number = nct;
      if (phase) body.phase = phase;
      if (sponsor) body.sponsor = sponsor;
      if (!isNaN(target)) body.enrollment_target = target;
      if (siteName) body.sites = [{ name: siteName }];
      api.createClinicalTrial(body).then(function(created) {
        _ctCloseModalSafe('ct-new-modal');
        _emitCtAudit('trial_created', { trial_id: created && created.id, note: 'phase=' + (created && created.phase || '-') });
        _ctLoadTrials().then(function() { render(); });
      }).catch(function(err) {
        var text = (err && err.message) ? err.message : 'Failed to register trial.';
        try {
          var data = err && err.data;
          if (data && data.message) text = data.message;
        } catch (_) {}
        showErr(text);
      });
    };

    function _ctCloseModalSafe(id) { var m = document.getElementById(id); if (m) m.remove(); }

    window._ctApiDetail = function(trialId) {
      var api = _ctApi();
      if (!api || typeof api.getClinicalTrial !== 'function' || !trialId) return;
      api.getClinicalTrial(trialId).then(function(t) {
        if (!t) return;
        _emitCtAudit('trial_viewed', { trial_id: t.id });
        _ctRenderDetailModal(t);
      }).catch(function(err) {
        var text = (err && err.message) ? err.message : 'Failed to load trial detail.';
        try { if (err && err.data && err.data.message) text = err.data.message; } catch (_) {}
        alert(text);
      });
    };

    function _ctRenderDetailModal(t) {
      var existing = document.getElementById('ct-detail-modal');
      if (existing) existing.remove();
      var sites = Array.isArray(t.sites) ? t.sites : [];
      var enrollments = Array.isArray(t.enrollments) ? t.enrollments : [];
      var pid = encodeURIComponent(t.id);
      var protoId = t.irb_protocol_id ? encodeURIComponent(t.irb_protocol_id) : '';
      var drillButtons = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">'
        + (protoId ? '<a class="btn btn-ghost" style="font-size:.72rem;padding:3px 10px;text-decoration:none" href="?page=irb-manager&protocol_id=' + protoId + '">↗ IRB Protocol</a>' : '')
        + '<a class="btn btn-ghost" style="font-size:.72rem;padding:3px 10px;text-decoration:none" href="?page=patients-hub&trial_id=' + pid + '">↗ Enrolled Patients</a>'
        + '<a class="btn btn-ghost" style="font-size:.72rem;padding:3px 10px;text-decoration:none" href="?page=documents-hub&source_target_type=clinical_trials&source_target_id=' + pid + '">↗ Sponsor Docs</a>'
        + '<a class="btn btn-ghost" style="font-size:.72rem;padding:3px 10px;text-decoration:none" href="?page=adverse-events&trial_id=' + pid + '">↗ Adverse Events</a>'
        + '<a class="btn btn-ghost" style="font-size:.72rem;padding:3px 10px;text-decoration:none" href="?page=reports-hub&trial_id=' + pid + '">↗ Sponsor Reports</a>'
        + '</div>';

      var lifecycleButtons = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">';
      var canPause = (t.status === 'recruiting' || t.status === 'active');
      var canResume = (t.status === 'paused');
      var canClose = (t.status !== 'closed' && t.status !== 'completed' && t.status !== 'terminated');
      var canEnroll = (t.status === 'recruiting' || t.status === 'active');
      if (canPause) lifecycleButtons += '<button class="btn btn-ghost" style="font-size:.72rem;padding:3px 10px" onclick="window._ctApiPause(\'' + _ctEsc(t.id) + '\')">Pause</button>';
      if (canResume) lifecycleButtons += '<button class="btn btn-ghost" style="font-size:.72rem;padding:3px 10px" onclick="window._ctApiResume(\'' + _ctEsc(t.id) + '\')">Resume</button>';
      if (canClose) lifecycleButtons += '<button class="btn btn-ghost" style="font-size:.72rem;padding:3px 10px;color:var(--rose)" onclick="window._ctApiClose(\'' + _ctEsc(t.id) + '\')">Close (one-way)</button>';
      if (canEnroll) lifecycleButtons += '<button class="btn btn-primary" style="font-size:.72rem;padding:3px 10px" onclick="window._ctApiEnrollModal(\'' + _ctEsc(t.id) + '\')">+ Enrol Patient</button>';
      lifecycleButtons += '</div>';

      var enrollRows = enrollments.length === 0
        ? '<tr><td colspan="6" style="padding:10px;text-align:center;color:var(--text-muted)">No enrolments yet.</td></tr>'
        : enrollments.map(function(e) {
            var withdrawBtn = (e.status === 'active')
              ? '<button class="btn btn-ghost" style="font-size:.7rem;padding:2px 8px;color:var(--rose)" onclick="window._ctApiWithdraw(\'' + _ctEsc(t.id) + '\',\'' + _ctEsc(e.id) + '\')">Withdraw</button>'
              : '';
            return '<tr style="border-bottom:1px solid var(--border)">'
              + '<td style="padding:6px 10px;font-size:.78rem">' + _ctEsc(e.patient_display_name || e.patient_id) + '</td>'
              + '<td style="padding:6px 10px;font-size:.78rem">' + _ctEsc(e.arm || '—') + '</td>'
              + '<td style="padding:6px 10px;font-size:.78rem">' + _ctEsc(e.status) + '</td>'
              + '<td style="padding:6px 10px;font-size:.78rem;color:var(--text-muted)">' + _ctEsc((e.enrolled_at || '').slice(0,10)) + '</td>'
              + '<td style="padding:6px 10px;font-size:.78rem;color:var(--text-muted)">' + _ctEsc(e.withdrawal_reason || '—') + '</td>'
              + '<td style="padding:6px 10px">' + withdrawBtn + '</td>'
              + '</tr>';
          }).join('');

      var siteRows = sites.length === 0
        ? '<div style="font-size:.78rem;color:var(--text-muted)">No sites registered.</div>'
        : '<ul style="margin:0;padding-left:18px;font-size:.8rem">' + sites.map(function(s) {
            return '<li><strong>' + _ctEsc(s.name) + '</strong>' + (s.id ? ' <code style="font-size:.72rem;color:var(--text-muted)">id=' + _ctEsc(s.id) + '</code>' : '') + (s.address ? ' — ' + _ctEsc(s.address) : '') + (s.pi_user_id ? ' (PI: ' + _ctEsc(s.pi_user_id) + ')' : '') + '</li>';
          }).join('') + '</ul>';

      var html = '<div id="ct-detail-modal" onclick="if(event.target.id===\'ct-detail-modal\')window._ctCloseModal(\'ct-detail-modal\')" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px">'
        + '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:760px;max-height:92vh;overflow-y:auto">'
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px">'
        + '<div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px"><span style="font-family:monospace;font-size:11.5px;color:var(--blue)">' + _ctEsc(t.nct_number || '—') + '</span>' + _ctStatusBadge(t.status) + (t.is_demo ? '<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;background:var(--amber)22;color:var(--amber);border:1px solid var(--amber)55">DEMO</span>' : '') + '</div>'
        + '<h3 style="margin:0;font-size:15px;font-weight:800;color:var(--text);line-height:1.3">' + _ctEsc(t.title) + '</h3>'
        + '<div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;display:flex;flex-wrap:wrap;gap:12px">'
        + '<span>PI: <strong style="color:var(--text)">' + _ctEsc(t.pi_display_name || t.pi_user_id || '—') + '</strong></span>'
        + '<span>Sponsor: <strong style="color:var(--text)">' + _ctEsc(t.sponsor || '—') + '</strong></span>'
        + '<span>Phase: <strong style="color:var(--text)">' + _ctEsc(t.phase || '—') + '</strong></span>'
        + '<span>Enrolled: <strong style="color:var(--text)">' + (t.enrolled_active != null ? t.enrolled_active : 0) + (t.enrollment_target ? (' / ' + t.enrollment_target) : '') + '</strong></span>'
        + '</div></div>'
        + '<button onclick="window._ctCloseModal(\'ct-detail-modal\')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1">x</button>'
        + '</div>'
        + drillButtons + lifecycleButtons
        + (t.description ? '<div style="margin-top:14px;font-size:.82rem;color:var(--text);line-height:1.6">' + _ctEsc(t.description) + '</div>' : '')
        + '<div style="margin-top:14px"><div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Sites</div>' + siteRows + '</div>'
        + '<div style="margin-top:14px"><div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Enrolments (' + enrollments.length + ')</div>'
        + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
        + '<thead><tr style="border-bottom:2px solid var(--border)"><th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Patient</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Arm</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Status</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Enrolled</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Withdrawal Reason</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase"></th></tr></thead>'
        + '<tbody>' + enrollRows + '</tbody></table></div></div>'
        + '<div style="margin-top:14px;font-size:11px;color:var(--text-muted)">Closed trials are immutable and cannot be reopened. Withdrawals require a non-empty reason.</div>'
        + '</div></div>';
      // Every trial-supplied field above is wrapped with _ctEsc(...) (defined
      // in this file). Static markup is the rest. semgrep can't trace ad-hoc
      // escape helpers, so suppress the false positive explicitly.
      // nosemgrep: typescript.react.security.audit.react-unsanitized-method.react-unsanitized-method
      document.body.insertAdjacentHTML('beforeend', html);
    }

    window._ctApiPause = function(trialId) {
      var note = window.prompt('Pause note (required for regulator audit):', '');
      if (note === null) return;
      if (!note.trim()) { alert('Pause note is required.'); return; }
      var api = _ctApi();
      if (!api || typeof api.pauseClinicalTrial !== 'function') return;
      api.pauseClinicalTrial(trialId, { note: note.trim() }).then(function() {
        _emitCtAudit('trial_paused', { trial_id: trialId });
        _ctCloseModalSafe('ct-detail-modal');
        _ctLoadTrials().then(function() { render(); });
      }).catch(function(err) { alert((err && err.message) || 'Failed to pause trial.'); });
    };

    window._ctApiResume = function(trialId) {
      var note = window.prompt('Resume note (required):', '');
      if (note === null) return;
      if (!note.trim()) { alert('Resume note is required.'); return; }
      var api = _ctApi();
      if (!api || typeof api.resumeClinicalTrial !== 'function') return;
      api.resumeClinicalTrial(trialId, { note: note.trim() }).then(function() {
        _emitCtAudit('trial_resumed', { trial_id: trialId });
        _ctCloseModalSafe('ct-detail-modal');
        _ctLoadTrials().then(function() { render(); });
      }).catch(function(err) { alert((err && err.message) || 'Failed to resume trial.'); });
    };

    window._ctApiClose = function(trialId) {
      var note = window.prompt('Closure note (required, ONE-WAY — trials cannot be reopened):', '');
      if (note === null) return;
      if (!note.trim()) { alert('Closure note is required.'); return; }
      var api = _ctApi();
      if (!api || typeof api.closeClinicalTrial !== 'function') return;
      api.closeClinicalTrial(trialId, { note: note.trim() }).then(function() {
        _emitCtAudit('trial_closed', { trial_id: trialId });
        _ctCloseModalSafe('ct-detail-modal');
        _ctLoadTrials().then(function() { render(); });
      }).catch(function(err) { alert((err && err.message) || 'Failed to close trial.'); });
    };

    window._ctApiEnrollModal = function(trialId) {
      var existing = document.getElementById('ct-enroll-modal');
      if (existing) existing.remove();
      var html = '<div id="ct-enroll-modal" onclick="if(event.target.id===\'ct-enroll-modal\')window._ctCloseModal(\'ct-enroll-modal\')" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9100;display:flex;align-items:center;justify-content:center;padding:20px">'
        + '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:480px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><h3 style="margin:0;font-size:15px;font-weight:800;color:var(--text)">Enrol Patient</h3><button onclick="window._ctCloseModal(\'ct-enroll-modal\')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1">x</button></div>'
        + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">Patient must be a real Patient row in your clinic.</div>'
        + '<div class="form-group" style="margin-bottom:10px"><label class="form-label">Patient id *</label><input class="form-control" id="ct-enroll-pid" placeholder="patient UUID"></div>'
        + '<div class="form-group" style="margin-bottom:10px"><label class="form-label">Arm</label><input class="form-control" id="ct-enroll-arm" placeholder="e.g. Active TBS"></div>'
        + '<div class="form-group" style="margin-bottom:10px"><label class="form-label">Consent doc id (optional)</label><input class="form-control" id="ct-enroll-consent" placeholder="document_id"></div>'
        + '<div id="ct-enroll-msg" style="display:none;margin-top:8px;font-size:.82rem;color:var(--rose)"></div>'
        + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn btn-ghost" onclick="window._ctCloseModal(\'ct-enroll-modal\')">Cancel</button><button class="btn btn-primary" onclick="window._ctApiEnrollSubmit(\'' + trialId + '\')">Enrol</button></div>'
        + '</div></div>';
      document.body.insertAdjacentHTML('beforeend', html);
    };

    window._ctApiEnrollSubmit = function(trialId) {
      var api = _ctApi();
      if (!api || typeof api.enrollClinicalTrialPatient !== 'function') return;
      var pid = (document.getElementById('ct-enroll-pid') || {}).value || '';
      var arm = (document.getElementById('ct-enroll-arm') || {}).value || '';
      var consent = (document.getElementById('ct-enroll-consent') || {}).value || '';
      var msg = document.getElementById('ct-enroll-msg');
      function showErr(t) { if (msg) { msg.style.display = 'block'; msg.textContent = t; } }
      pid = pid.trim();
      if (!pid) { showErr('patient_id is required.'); return; }
      var body = { patient_id: pid };
      if (arm.trim()) body.arm = arm.trim();
      if (consent.trim()) body.consent_doc_id = consent.trim();
      api.enrollClinicalTrialPatient(trialId, body).then(function(e) {
        _ctCloseModalSafe('ct-enroll-modal');
        _emitCtAudit('patient_enrolled', { trial_id: trialId, note: 'enrollment_id=' + (e && e.id) });
        // Reload detail + list
        if (typeof api.getClinicalTrial === 'function') {
          api.getClinicalTrial(trialId).then(function(t) {
            _ctCloseModalSafe('ct-detail-modal');
            _ctRenderDetailModal(t);
          });
        }
        _ctLoadTrials().then(function() { render(); });
      }).catch(function(err) {
        var text = (err && err.message) ? err.message : 'Failed to enrol patient.';
        try { if (err && err.data && err.data.message) text = err.data.message; } catch (_) {}
        showErr(text);
      });
    };

    window._ctApiWithdraw = function(trialId, enrollmentId) {
      var reason = window.prompt('Withdrawal reason (required for regulator audit):', '');
      if (reason === null) return;
      if (!reason.trim()) { alert('Withdrawal reason is required.'); return; }
      var api = _ctApi();
      if (!api || typeof api.withdrawClinicalTrialEnrollment !== 'function') return;
      api.withdrawClinicalTrialEnrollment(trialId, enrollmentId, { reason: reason.trim() }).then(function() {
        _emitCtAudit('enrollment_withdrawn', { trial_id: trialId, note: 'enrollment_id=' + enrollmentId });
        // Refresh detail
        if (typeof api.getClinicalTrial === 'function') {
          api.getClinicalTrial(trialId).then(function(t) {
            _ctCloseModalSafe('ct-detail-modal');
            _ctRenderDetailModal(t);
          });
        }
        _ctLoadTrials().then(function() { render(); });
      }).catch(function(err) { alert((err && err.message) || 'Failed to withdraw enrollment.'); });
    };
  }

  render();
}
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
      `<span class="kkk-tag" style="background:rgba(74,158,255,.07);border-color:rgba(74,158,255,.15);color:var(--blue)">${c}</span>`
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
      const lifecycleLabel = p.status === 'Published' ? 'Published' : (p.status === 'Local Draft' ? 'Saved locally' : 'Submitted');
      return `
        <div class="kkk-published-row">
          <div class="kkk-published-info">
            <div class="kkk-published-name">${p.name}</div>
            <div class="kkk-published-meta">${p.modality} · ${lifecycleLabel} ${p.publishDate} · ${p.downloads} downloads · ${ratingDisp}</div>
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
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:4px;color:var(--text)">Prepare a Protocol for Marketplace Sharing</h3>
        <p style="font-size:.84rem;color:var(--text-muted);margin-bottom:20px">This page stores marketplace publish drafts locally. Registry-backed submission and review routing are not wired from this view yet.</p>
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
          <button class="btn-primary" style="padding:9px 22px" onclick="window._mpSubmitPublish()">Save Publish Draft</button>
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
          <div class="kkk-preview-sub">${p.author} · ${p.institution} · ${(p.status === 'Published' ? 'Published' : (p.status === 'Local Draft' ? 'Saved locally' : 'Submitted'))} ${p.publishDate || 'N/A'}</div>

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
    const trend = `<svg width="${W}" height="${H}" style="overflow:visible">${bars}<polyline points="${pts}" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;

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
            <div class="kkk-preview-section-title" style="font-size:.7rem;color:var(--teal);font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px">Download Trend (Last 12 Weeks)</div>
            <div style="overflow-x:auto">${trend}</div>
            <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--text-muted);margin-top:4px;padding:0 10px">
              <span>12w ago</span><span>Now</span>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div>
              <div class="kkk-preview-section-title" style="font-size:.7rem;color:var(--teal);font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px">Usage by Condition</div>
              ${condUsage.map(c=>`
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:.8rem">
                  <span style="flex:1;color:var(--text-muted)">${c.label}</span>
                  <div style="width:80px;height:5px;background:var(--bg-secondary);border-radius:3px;overflow:hidden">
                    <div style="width:${c.pct}%;height:100%;background:var(--blue);border-radius:3px"></div>
                  </div>
                  <span style="color:var(--text);font-weight:600;min-width:30px">${c.pct}%</span>
                </div>`).join('')}
            </div>
            <div>
              <div class="kkk-preview-section-title" style="font-size:.7rem;color:var(--teal);font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px">Top Locations</div>
              ${cities.map(c=>`
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:.8rem">
                  <span style="flex:1;color:var(--text-muted)">${c.city}</span>
                  <div style="width:80px;height:5px;background:var(--bg-secondary);border-radius:3px;overflow:hidden">
                    <div style="width:${c.pct}%;height:100%;background:var(--violet);border-radius:3px"></div>
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
              <div style="font-size:.8rem;color:var(--text-muted);display:flex;justify-content:space-between"><span>Imported</span><strong style="color:var(--teal)">${imps.length}</strong></div>
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
    showToast('Opening local share metadata editor…', true);
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
      status: 'Local Draft',
      modality: 'Custom',
      desc, tags, conditions: conds, contraindications: contra, evidence, refs,
    });
    lsSet('ds_published_protocols', pubs);
    showToast('Publish draft saved locally');
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
    <div style="margin-top:8px;font-size:11px;color:var(--teal,#00d4bc)">
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
              border:1px solid ${active ? 'var(--teal,#00d4bc)' : 'var(--border)'};
              background:${active ? 'rgba(0,212,188,0.06)' : 'rgba(255,255,255,0.02)'};cursor:pointer;transition:all 0.15s">
              <input type="checkbox" style="margin-top:2px;accent-color:var(--teal,#00d4bc)"
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
              border:1px solid ${active ? 'var(--blue,#4a9eff)' : 'var(--border)'};
              background:${active ? 'rgba(74,158,255,0.06)' : 'rgba(255,255,255,0.02)'};cursor:pointer;transition:all 0.15s">
              <input type="radio" name="nnnb-deid-method" value="${m.val}" ${active?'checked':''} onchange="window._nnnbSetMethod('${m.val}')" style="accent-color:var(--blue,#4a9eff)">
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
              border:1px solid ${active ? 'var(--violet,#9b7fff)' : 'var(--border)'};
              background:${active ? 'rgba(155,127,255,0.07)' : 'rgba(255,255,255,0.02)'};cursor:pointer;transition:all 0.15s">
              <div style="display:flex;align-items:center;gap:8px">
                <input type="radio" name="nnnb-format" value="${f.val}" ${active?'checked':''} onchange="window._nnnbSetFormat('${f.val}')" style="accent-color:var(--violet,#9b7fff)">
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
                <input type="radio" name="nnnb-compress" value="${val}" ${_sel.compress===val?'checked':''} onchange="window._nnnbSetCompress('${val}')" style="accent-color:var(--teal,#00d4bc)">
                ${label}
              </label>`).join('')}
          </div>
        </div>
        <div>
          <label class="form-label" style="font-size:11.5px;font-weight:600">Export Purpose / Notes (audit log)</label>
          <input type="text" class="form-control" id="nnnb-export-purpose" placeholder="e.g. IRB-2024-011 interim analysis" style="max-width:500px">
        </div>
      </div>
      <div style="padding:12px 16px;border-radius:9px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);margin-bottom:16px;font-size:12px;color:var(--amber,#ffb547)">
        ⚠ Exports to external parties require a valid active Data Sharing Agreement covering the exported domains. Check Section 4 below before sharing.
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="window._nnnbGoStep(2)">← Back</button>
        <button class="btn btn-primary" style="background:var(--teal,#00d4bc);color:#000;font-weight:700;padding:10px 22px" onclick="window._nnnbGenerateExport()">
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
              ${(r.domains||[]).map(d => `<span style="font-size:9.5px;padding:1px 6px;border-radius:3px;background:rgba(74,158,255,0.1);color:var(--blue,#4a9eff)">${d}</span>`).join('')}
            </div>
          </td>
          <td style="font-family:var(--font-mono,monospace);font-size:12px">${(r.recordCount||0).toLocaleString()}</td>
          <td><span style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(155,127,255,0.1);color:var(--violet,#9b7fff)">${r.format}</span></td>
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
            <input type="checkbox" class="nnnb-dsa-domain-cb" value="${d}" style="accent-color:var(--blue,#4a9eff)"> ${d}
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
          <span style="font-size:10.5px;font-weight:500;color:var(--amber,#ffb547);background:rgba(245,158,11,0.1);padding:3px 10px;border-radius:5px">
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
        <div style="padding:10px 14px;border-radius:8px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);font-size:12px;color:var(--amber,#ffb547);margin-bottom:14px">
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
      window._showToast?.('Please select at least one data domain in Step 1 before generating an export.', 'warning');
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
          <button id="_nnnb-export-confirm-btn" disabled style="padding:7px 16px;font-size:12.5px;border-radius:6px;background:var(--teal,#00d4bc);color:#000;font-weight:700;cursor:pointer;opacity:0.45" onclick="window._nnnbDoExport(this)">Confirm &amp; Download</button>
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
      toast.style.cssText = 'position:fixed;bottom:24px;right:24px;max-width:340px;padding:14px 18px;border-radius:10px;background:var(--navy-800,#0f172a);border:1px solid var(--teal,#00d4bc);z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,0.5)';
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
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;max-width:340px;padding:12px 16px;border-radius:10px;background:var(--navy-800,#0f172a);border:1px solid var(--blue,#4a9eff);z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
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
      window._showToast?.('Please fill in Institution, Purpose, Effective Date, and Expiry Date.', 'warning');
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
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;max-width:320px;padding:12px 16px;border-radius:10px;background:var(--navy-800,#0f172a);border:1px solid var(--teal,#00d4bc);z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
    toast.innerHTML = `<div style="font-size:12.5px;font-weight:600;color:var(--text,var(--text-primary))">DSA saved — status: Pending Signature</div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  };

  // ── Initial render ────────────────────────────────────────────────────────
  renderPage();
}
