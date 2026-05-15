/


let outcomesData = DEMO_OUTCOMES_FALLBACK;
mport { api } from './api.js';
import { currentUser } from './state.js';

**
 * pages-outcome-measures.js — Standardized Outcome Measure Tracking
 *
 * Scope: clinical outcome tracking using standardized scales (GAD-7, PHQ-9,
 * MoCA, FMA, BBS, TUG, 6MWT, PSQI, ESS, etc.). Displays baseline vs latest
 * scores, change calculations, MCID thresholds, evidence grades, and mini
 * sparkline trends per patient.
 *
 * Safety: outcome scores require clinical interpretation — do not rely on
 * automated thresholds alone.
 */


const OUTCOME_FILTERS = ['All', 'Improved', 'Stable', 'Worsened', 'MCID met', 'Not met'];

const MEASURE_META = {
  'GAD-7': { mcid: 4, direction: 'lower', maxScore: 21, evidence: 'A', desc: 'Generalized Anxiety Disorder 7-item' },
  'PHQ-9': { mcid: 5, direction: 'lower', maxScore: 27, evidence: 'A', desc: 'Patient Health Questionnaire 9-item' },
  'MoCA': { mcid: 2, direction: 'higher', maxScore: 30, evidence: 'A', desc: 'Montreal Cognitive Assessment' },
  'FMA-UE': { mcid: 9, direction: 'higher', maxScore: 66, evidence: 'B', desc: 'Fugl-Meyer Upper Extremity' },
  'BBS': { mcid: 5, direction: 'higher', maxScore: 56, evidence: 'A', desc: 'Berg Balance Scale' },
  'TUG': { mcid: 3, direction: 'lower', maxScore: 60, evidence: 'B', desc: 'Timed Up and Go (seconds)' },
  '6MWT': { mcid: 50, direction: 'higher', maxScore: 800, evidence: 'A', desc: '6-Minute Walk Test (meters)' },
  'PSQI': { mcid: 3, direction: 'lower', maxScore: 21, evidence: 'B', desc: 'Pittsburgh Sleep Quality Index' },
  'ESS': { mcid: 3, direction: 'lower', maxScore: 24, evidence: 'B', desc: 'Epworth Sleepiness Scale' },
  'VAS-Pain': { mcid: 15, direction: 'lower', maxScore: 100, evidence: 'A', desc: 'Visual Analog Scale — Pain (mm)' },
  'DASH': { mcid: 10, direction: 'lower', maxScore: 100, evidence: 'B', desc: 'Disabilities of Arm Shoulder Hand' },
  'SF-36 PCS': { mcid: 5, direction: 'higher', maxScore: 100, evidence: 'A', desc: 'SF-36 Physical Component' },
};

const DEMO_OUTCOMES_FALLBACK = [
  { id: 'o1', patient: 'Eleanor Vance', patientId: 'P1001', measure: 'GAD-7', baseline: 14, latest: 8, sessions: 8, lastAssessed: '2024-11-01', trend: [14, 13, 12, 11, 10, 9, 8, 8] },
  { id: 'o2', patient: 'Eleanor Vance', patientId: 'P1001', measure: 'PHQ-9', baseline: 16, latest: 10, sessions: 8, lastAssessed: '2024-11-01', trend: [16, 15, 14, 13, 12, 11, 10, 10] },
  { id: 'o3', patient: 'Marcus Chen', patientId: 'P1002', measure: 'MoCA', baseline: 22, latest: 26, sessions: 12, lastAssessed: '2024-11-05', trend: [22, 23, 23, 24, 25, 25, 26, 26] },
  { id: 'o4', patient: 'Marcus Chen', patientId: 'P1002', measure: 'FMA-UE', baseline: 34, latest: 48, sessions: 12, lastAssessed: '2024-11-05', trend: [34, 36, 38, 40, 42, 44, 46, 48] },
  { id: 'o5', patient: 'Sophia Patel', patientId: 'P1003', measure: 'BBS', baseline: 38, latest: 46, sessions: 6, lastAssessed: '2024-10-28', trend: [38, 40, 41, 43, 44, 46] },
  { id: 'o6', patient: 'James O\'Brien', patientId: 'P1004', measure: 'TUG', baseline: 18, latest: 12, sessions: 10, lastAssessed: '2024-11-06', trend: [18, 17, 16, 15, 14, 14, 13, 12] },
  { id: 'o7', patient: 'Aisha Johnson', patientId: 'P1005', measure: '6MWT', baseline: 320, latest: 410, sessions: 8, lastAssessed: '2024-11-04', trend: [320, 340, 355, 370, 385, 395, 405, 410] },
  { id: 'o8', patient: 'Robert Kim', patientId: 'P1006', measure: 'PSQI', baseline: 15, latest: 10, sessions: 6, lastAssessed: '2024-11-02', trend: [15, 14, 13, 12, 11, 10] },
  { id: 'o9', patient: 'Diana Martinez', patientId: 'P1007', measure: 'ESS', baseline: 16, latest: 14, sessions: 4, lastAssessed: '2024-10-30', trend: [16, 15, 15, 14] },
  { id: 'o10', patient: 'Thomas Wright', patientId: 'P1008', measure: 'VAS-Pain', baseline: 72, latest: 45, sessions: 8, lastAssessed: '2024-11-07', trend: [72, 68, 62, 58, 55, 50, 48, 45] },
  { id: 'o11', patient: 'Linda Foster', patientId: 'P1009', measure: 'DASH', baseline: 45, latest: 38, sessions: 5, lastAssessed: '2024-10-25', trend: [45, 44, 42, 40, 38] },
  { id: 'o12', patient: 'David Park', patientId: 'P1010', measure: 'SF-36 PCS', baseline: 35, latest: 42, sessions: 6, lastAssessed: '2024-11-03', trend: [35, 36, 37, 39, 40, 42] },
  { id: 'o13', patient: 'Catherine Liu', patientId: 'P1011', measure: 'GAD-7', baseline: 10, latest: 9, sessions: 4, lastAssessed: '2024-11-06', trend: [10, 10, 9, 9] },
  { id: 'o14', patient: 'Samuel Torres', patientId: 'P1012', measure: 'PHQ-9', baseline: 12, latest: 6, sessions: 8, lastAssessed: '2024-11-07', trend: [12, 11, 10, 9, 8, 7, 6, 6] },
  { id: 'o15', patient: 'Olivia Reed', patientId: 'P1015', measure: 'BBS', baseline: 28, latest: 36, sessions: 6, lastAssessed: '2024-11-01', trend: [28, 30, 31, 33, 34, 36] },
];

let _outcomeFilter = 'All';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _computeChange(baseline, latest, measureKey) {
  const meta = MEASURE_META[measureKey];
  if (!meta) return { change: latest - baseline, improved: latest < baseline, mcidMet: false };
  const change = latest - baseline;
  const improved = meta.direction === 'lower' ? change < 0 : change > 0;
  const mcidMet = improved && Math.abs(change) >= meta.mcid;
  return { change, improved, mcidMet };
}

function _statusBadge(improved, mcidMet) {
  if (mcidMet) return '<span class="om-badge om-improved-mcid">Improved (MCID)</span>';
  if (improved) return '<span class="om-badge om-improved">Improved</span>';
  return '<span class="om-badge om-stable">Stable</span>';
}

function _evidenceBadge(grade) {
  const g = String(grade || '').toUpperCase();
  if (g === 'A') return '<span class="evidence-badge evidence-a">Grade A</span>';
  if (g === 'B') return '<span class="evidence-badge evidence-b">Grade B</span>';
  if (g === 'C') return '<span class="evidence-badge evidence-c">Grade C</span>';
  if (g === 'D') return '<span class="evidence-badge evidence-d">Grade D</span>';
  return '<span class="evidence-badge">—</span>';
}

function _miniSparkline(trend, direction) {
  if (!Array.isArray(trend) || trend.length === 0) return '';
  const vals = trend.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return '';
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;

  const color = direction === 'lower'
    ? (vals[vals.length - 1] < vals[0] ? 'var(--success)' : 'var(--danger)')
    : (vals[vals.length - 1] > vals[0] ? 'var(--success)' : 'var(--danger)');

  const dots = vals.map((v) => {
    const h = Math.max(3, Math.min(14, 3 + ((v - min) / range) * 11));
    return `<span style="display:inline-block;width:5px;height:${Math.round(h)}px;border-radius:2px;background:${color};margin:0 1.5px;vertical-align:bottom"></span>`;
  }).join('');

  return `<span style="display:inline-flex;align-items:flex-end;height:16px" aria-hidden="true" title="Trend: ${vals.join(' → ')}">${dots}</span>`;
}

function _kpiCards() {
  const tracked = DEMO_OUTCOMES.length;
  const completed = DEMO_OUTCOMES.reduce((s, o) => s + o.sessions, 0);
  const changes = outcomesData.map(o => _computeChange(o.baseline, o.latest, o.measure));
  const improved = changes.filter(c => c.improved);
  const avgChange = improved.length > 0
    ? (improved.reduce((s, c) => s + Math.abs(c.change), 0) / improved.length).toFixed(1)
    : '0';
  const clinicallySig = changes.filter(c => c.mcidMet).length;

  return `
    <div class="kpi-grid">
      <div class="kpi-card" style="border-top:3px solid var(--blue)">
        <div class="kpi-value" style="color:var(--blue)">${tracked}</div>
        <div class="kpi-label">Measures tracked</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--teal-400,#2dd4bf)">
        <div class="kpi-value" style="color:var(--teal-400,#2dd4bf)">${completed}</div>
        <div class="kpi-label">Assessments completed</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--success)">
        <div class="kpi-value" style="color:var(--success)">-${avgChange}</div>
        <div class="kpi-label">Avg improvement</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--purple)">
        <div class="kpi-value" style="color:var(--purple)">${clinicallySig}</div>
        <div class="kpi-label">Clinically significant</div>
      </div>
    </div>`;
}

function _filterTabs() {
  return `
    <div class="filter-tabs">
      ${OUTCOME_FILTERS.map(f => {
        const active = _outcomeFilter === f ? 'active' : '';
        return `<button class="filter-tab ${active}" onclick="window._omSetFilter('${esc(f)}')">${esc(f)}</button>`;
      }).join('')}
    </div>`;
}

function _filteredOutcomes() {
  if (_outcomeFilter === 'All') return DEMO_OUTCOMES;
  return outcomesData.filter(o => {
    const { improved, mcidMet } = _computeChange(o.baseline, o.latest, o.measure);
    const f = _outcomeFilter.toLowerCase();
    if (f === 'improved') return improved;
    if (f === 'stable') return !improved;
    if (f === 'worsened') return !improved && o.latest !== o.baseline;
    if (f === 'mcid met') return mcidMet;
    if (f === 'not met') return improved && !mcidMet;
    return true;
  });
}

function _outcomeTable(outcomes) {
  if (outcomes.length === 0) {
    return `
      <div style="padding:40px 16px;text-align:center;border:1px dashed var(--border);border-radius:12px;margin-top:16px">
        <div style="font-size:2rem;margin-bottom:8px">📊</div>
        <div style="font-weight:600;font-size:13px;margin-bottom:4px;color:var(--text-primary)">No outcome data</div>
        <div style="font-size:12px;color:var(--text-secondary)">No outcome measures match the selected filter.</div>
      </div>`;
  }

  const rows = outcomes.map(o => {
    const { change, improved, mcidMet } = _computeChange(o.baseline, o.latest, o.measure);
    const meta = MEASURE_META[o.measure] || {};
    const changeSign = change > 0 ? '+' : '';
    const changeColor = improved ? 'var(--success)' : change !== 0 ? 'var(--danger)' : 'var(--text-secondary)';
    const mcidBadge = mcidMet ? '<span style="font-size:10px;color:var(--success);font-weight:700">✓ MCID</span>' : '<span style="font-size:10px;color:var(--text-tertiary)">—</span>';
    const direction = meta.direction || 'lower';
    const sparkline = _miniSparkline(o.trend || [], direction);

    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
          <div style="font-weight:600">${esc(o.patient)}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${esc(o.patientId)}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
          <div style="font-weight:500">${esc(o.measure)}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${esc(meta.desc || '')}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);text-align:center;font-variant-numeric:tabular-nums">${o.baseline}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums;color:${changeColor}">${o.latest}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums;color:${changeColor}">${changeSign}${change}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;text-align:center">${mcidBadge}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);text-align:center">${o.sessions}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;text-align:center">${sparkline}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;text-align:center">${_evidenceBadge(meta.evidence)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px">${_statusBadge(improved, mcidMet)}</td>
      </tr>`;
  }).join('');

  return `
    <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg-card);margin-top:16px">
      <div style="overflow-x:auto">
        <table class="data-table" style="width:100%;border-collapse:collapse;min-width:960px">
          <thead>
            <tr style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary)">
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Patient</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Measure</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Baseline</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Latest</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Change</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">MCID</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Sessions</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Trend</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Evidence</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function _safetyBanner() {
  return `
    <div class="safety-banner" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);margin-bottom:16px;font-size:12px;color:var(--text-secondary);line-height:1.45">
      <strong style="color:var(--red)">⚠ Clinical safety:</strong> Outcome scores require clinical interpretation — do not rely on automated thresholds alone. MCID values are population-level estimates; individual significance requires clinical judgment.
    </div>`;
}

function _measureLegend() {
  const measures = Object.entries(MEASURE_META).map(([key, meta]) => {
    const dirLabel = meta.direction === 'lower' ? 'Lower is better' : 'Higher is better';
    return `
      <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;background:rgba(148,163,184,0.06)">
        <span style="font-size:12px;font-weight:600;color:var(--text-primary)">${esc(key)}</span>
        <span style="font-size:11px;color:var(--text-tertiary)">${esc(meta.desc)}</span>
        <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(148,163,184,0.1);color:var(--text-secondary)">${dirLabel}</span>
        <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(148,163,184,0.1);color:var(--text-secondary)">MCID: ${meta.mcid}</span>
        ${_evidenceBadge(meta.evidence)}
      </div>`;
  }).join('');

  return `
    <div style="margin-top:20px;border:1px solid var(--border);border-radius:12px;padding:16px;background:var(--bg-card)">
      <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px">📋 Measure Reference Guide</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${measures}
      </div>
    </div>`;
}

function _render(navigate) {
  const outcomes = _filteredOutcomes();
  const stats = computeOutcomeStats(DEMO_OUTCOMES);

  return `
    <div class="patient-container" style="padding:20px 16px 40px;max-width:1200px;margin:0 auto">
      <div class="patient-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div class="patient-title" style="font-size:20px;font-weight:800;color:var(--text-primary);margin-bottom:4px">Outcome Measures</div>
          <div style="font-size:12px;color:var(--text-secondary)">Standardized clinical outcome tracking with MCID analysis and evidence grading</div>
        </div>
        <button class="btn btn-primary btn-export" onclick="window._omExport()">Export CSV</button>
      </div>

      ${_safetyBanner()}
      ${_kpiCards()}
      ${_filterTabs()}
      ${_outcomeTable(outcomes)}
      ${_measureLegend()}

      <div style="margin-top:16px;padding:12px;border-radius:10px;border:1px solid rgba(96,165,250,0.2);background:rgba(96,165,250,0.06);font-size:12px;color:var(--text-secondary);line-height:1.5">
        <strong style="color:var(--blue)">📊 Cohort summary:</strong> Across ${stats.totalMeasures} tracked measures, ${stats.improvedCount} showed improvement (${stats.improvementRate}%), with ${stats.mcidMetCount} meeting MCID criteria (${stats.mcidRate}%). Average absolute change: ${stats.avgAbsChange} points.

      <style>
        .om-badge { display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap; }
        .om-improved-mcid { background:rgba(74,222,128,0.14);color:#16a34a;border:1px solid rgba(74,222,128,0.3); }
        .om-improved { background:rgba(74,222,128,0.08);color:#15803d;border:1px solid rgba(74,222,128,0.2); }
        .om-stable { background:rgba(148,163,184,0.1);color:#64748b;border:1px solid rgba(148,163,184,0.2); }
        .evidence-badge { display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600; }
        .evidence-a { background:rgba(74,222,128,0.12);color:#16a34a; }
        .evidence-b { background:rgba(96,165,250,0.12);color:#2563eb; }
        .evidence-c { background:rgba(251,191,36,0.12);color:#b45309; }
        .evidence-d { background:rgba(255,107,107,0.12);color:#dc2626; }
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
      </style>
    </div>`;
}

function _mount(html) {
  if (typeof document === 'undefined') return html;
  const host = document.getElementById('content');
  if (host) host.innerHTML = html;
  return html;
}

export async function pgOutcomeMeasures(setTopbar, navigate) {
  setTopbar('Outcome Measures');

  // Try API first, fall back to demo data
  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';
  try {
    const resp = await api.getOutcomeMeasures(clinicId);
    if (resp && resp.length > 0) { outcomesData = resp; }
    else if (resp && resp.items && resp.items.length > 0) { outcomesData = resp.items; }
  } catch (err) {
    console.warn('[OutcomeMeasures] API error:', err.message);
    outcomesData = DEMO_OUTCOMES;
  }

  _outcomeFilter = 'All';

  const html = _render(navigate);
  _mount(html);

  if (typeof window !== 'undefined') {
    window._omSetFilter = (f) => { _outcomeFilter = f; _mount(_render(navigate)); };
    window._omExport = () => {
      const rows = [['Patient', 'Patient ID', 'Measure', 'Baseline', 'Latest', 'Change', 'MCID Met', 'Sessions', 'Evidence']];
      outcomesData.forEach(o => {
        const { change, mcidMet } = _computeChange(o.baseline, o.latest, o.measure);
        const meta = MEASURE_META[o.measure] || {};
        rows.push([o.patient, o.patientId, o.measure, o.baseline, o.latest, change, mcidMet ? 'Yes' : 'No', o.sessions, meta.evidence || '']);
      });
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'outcome-measures-export.csv';
      a.click();
    };
  }

  return html;
}

/**
 * Get a color code for a change value based on direction and magnitude.
 * Used for consistent visual encoding across the dashboard.
 */
export function getChangeColor(change, direction) {
  if (change === 0) return 'var(--text-secondary)';
  const isPositive = direction === 'lower' ? change < 0 : change > 0;
  if (isPositive) {
    if (Math.abs(change) >= 10) return 'var(--success)';
    return 'var(--teal-400,#2dd4bf)';
  }
  if (Math.abs(change) >= 10) return 'var(--danger)';
  return 'var(--warning)';
}

/**
 * Format a change value with sign prefix for display.
 */
export function formatChange(change) {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change}`;
}

/**
 * Compute aggregate outcome statistics across a set of measures.
 * Returns summary counts, averages, and improvement rates.
 */
export function computeOutcomeStats(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    return {
      totalMeasures: 0, improvedCount: 0, worsenedCount: 0, stableCount: 0,
      mcidMetCount: 0, avgChange: 0, avgSessions: 0,
    };
  }
  const results = outcomes.map(o => _computeChange(o.baseline, o.latest, o.measure));
  const totalMeasures = outcomes.length;
  const improvedCount = results.filter(r => r.improved).length;
  const worsenedCount = results.filter(r => !r.improved && r.change !== 0).length;
  const stableCount = results.filter(r => r.change === 0).length;
  const mcidMetCount = results.filter(r => r.mcidMet).length;
  const improvementRate = totalMeasures > 0 ? Math.round((improvedCount / totalMeasures) * 100) : 0;
  const mcidRate = totalMeasures > 0 ? Math.round((mcidMetCount / totalMeasures) * 100) : 0;
  const avgChange = results.length > 0
    ? (results.reduce((s, r) => s + r.change, 0) / results.length).toFixed(1)
    : '0';
  const avgSessions = outcomes.length > 0
    ? Math.round(outcomes.reduce((s, o) => s + o.sessions, 0) / outcomes.length)
    : 0;
  const avgAbsChange = results.length > 0
    ? (results.reduce((s, r) => s + Math.abs(r.change), 0) / results.length).toFixed(1)
    : '0';
  return { totalMeasures, improvedCount, worsenedCount, stableCount, mcidMetCount, improvementRate, mcidRate, avgChange, avgSessions, avgAbsChange };
}

/**
 * Interpret an outcome change in clinical terms.
 * Returns a human-readable interpretation string.
 */
export function interpretOutcomeChange(measureKey, baseline, latest) {
  const meta = MEASURE_META[measureKey];
  if (!meta) return 'Unable to interpret — unknown measure';
  const { change, improved, mcidMet } = _computeChange(baseline, latest, measureKey);
  if (change === 0) return 'No change detected between baseline and latest assessment';
  const direction = improved ? 'improvement' : 'decline';
  const mcidNote = mcidMet ? ' This meets the minimum clinically important difference (MCID).' : ' This change is below the MCID threshold.';
  return `A change of ${change > 0 ? '+' : ''}${change} points represents a clinically meaningful ${direction} on the ${meta.desc}.${mcidNote}`;
}

/**
 * Get evidence grade for a standardized outcome measure.
 */
export function getMeasureEvidenceGrade(measureKey) {
  const meta = MEASURE_META[measureKey];
  return meta ? meta.evidence : null;
}

export default { pgOutcomeMeasures };;

