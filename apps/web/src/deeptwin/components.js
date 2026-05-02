// DeepTwin section render functions.
//
// Each function returns an HTML string for one section and (where it
// uses Plotly) wires up the chart in a follow-up call after the HTML
// is in the DOM. The page module composes these in pages-deeptwin.js.

import {
  evidenceGradeBadge, simulationOnlyBadge, notAPrescriptionStamp,
  modelEstimatedStamp, approvalRequiredBadge, correlationVsCausationNotice,
  dataCompletenessWarning, completenessGauge, riskChip, reviewStatusChip,
  confidenceTierChip, topDriversList, evidenceStatusChip, decisionSupportBanner,
  escHtml, safetyFooter,
} from './safety.js';
import { sparklineSVG, buildTimeline, buildCorrelationHeatmap, buildPrediction, buildSimulationCurve } from './charts.js';
import { PRESET_SCENARIOS } from './mockData.js';
import { REPORT_KINDS } from './reports.js';
import { HANDOFF_KINDS_LIST } from './handoff.js';

const DOMAIN_LABEL = {
  qeeg: 'qEEG',
  mri: 'MRI / brain regions',
  assessments: 'Assessments',
  biomarkers: 'Biomarkers',
  sleep_hrv_activity: 'Sleep · HRV · activity',
  sessions: 'Treatment sessions',
  tasks_adherence: 'Tasks · adherence',
  notes_text: 'Notes · text · video',
};

// 1. Twin status header --------------------------------------------------
export function renderHeader({ patientLabel, condition, summary, dataSources }) {
  const compl = dataSources?.completeness_score != null
    ? Math.round(dataSources.completeness_score * 100)
    : (summary?.completeness_pct ?? 0);
  const sources = dataSources?.sources
    ? Object.values(dataSources.sources).filter(s => s.available).length
    : (summary?.sources_connected || []).length;
  const total = dataSources?.sources
    ? Object.keys(dataSources.sources).length
    : (sources + (summary?.sources_missing || []).length);
  const updated = summary?.last_updated ? new Date(summary.last_updated).toLocaleString() : '—';
  return `
    <section class="dt-header card">
      <div class="dt-header-left">
        <div class="dt-avatar">${escHtml((patientLabel || '?').slice(0, 2).toUpperCase())}</div>
        <div>
          <div class="dt-eyebrow">DeepTwin · Patient intelligence</div>
          <div class="dt-title">${escHtml(patientLabel || 'No patient selected')}</div>
          <div class="dt-sub">${escHtml(condition || '')}</div>
          <div class="dt-meta">
            ${riskChip(summary?.risk_status)}
            ${reviewStatusChip(summary?.review_status)}
            <span class="dt-chip dt-chip-muted">Last updated ${escHtml(updated)}</span>
            <span class="dt-chip dt-chip-muted">${sources}/${total} sources connected</span>
          </div>
        </div>
      </div>
      <div class="dt-header-right">
        ${completenessGauge(compl)}
        <div class="dt-completeness-label">Twin completeness</div>
      </div>
    </section>
  `;
}

// 2. Data source grid ----------------------------------------------------
export function renderDataSources({ summary, dataSources }) {
  // Prefer real data-sources map (migration 063); fall back to summary shape.
  if (dataSources?.sources) {
    const entries = Object.entries(dataSources.sources);
    const cells = entries.filter(([, s]) => s.available).map(([key, s]) => `
      <div class="dt-src dt-src-on">
        <div class="dt-src-label">${escHtml(DOMAIN_LABEL[key] || key)}</div>
        <div class="dt-src-meta">${s.count} records · updated ${s.last_updated ? new Date(s.last_updated).toLocaleDateString() : '—'}</div>
      </div>
    `).join('');
    const off = entries.filter(([, s]) => !s.available).map(([key]) => `
      <div class="dt-src dt-src-off">
        <div class="dt-src-label">${escHtml(DOMAIN_LABEL[key] || key)}</div>
        <div class="dt-src-meta">no data</div>
      </div>
    `).join('');
    const score = Math.round((dataSources.completeness_score || 0) * 100);
    return `
      <section class="card dt-section">
        <header class="dt-section-h"><h3>Data sources</h3>
          <span class="dt-section-sub">Real availability · ${score}% complete</span>
        </header>
        <div class="dt-src-grid">${cells}${off}</div>
        ${off ? dataCompletenessWarning(off.split('dt-src-off').length - 1 + ' sources missing') : ''}
      </section>
    `;
  }
  const connected = summary?.sources_connected || [];
  const missing = summary?.sources_missing || [];
  const cells = connected.map(s => `
    <div class="dt-src dt-src-on">
      <div class="dt-src-label">${escHtml(s.label || s.key)}</div>
      <div class="dt-src-meta">last sync ${escHtml(String(s.last_sync_days_ago ?? '?'))}d ago</div>
    </div>
  `).join('');
  const off = missing.map(s => `
    <div class="dt-src dt-src-off">
      <div class="dt-src-label">${escHtml(s.label || s.key)}</div>
      <div class="dt-src-meta">not connected</div>
    </div>
  `).join('');
  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Data sources</h3>
        <span class="dt-section-sub">What this twin currently knows about</span>
      </header>
      <div class="dt-src-grid">${cells}${off}</div>
      ${dataCompletenessWarning(missing)}
    </section>
  `;
}

// 3. Signal matrix -------------------------------------------------------
export function renderSignalMatrix({ signals }) {
  if (!signals || !signals.length) return '';
  const grouped = {};
  for (const s of signals) {
    grouped[s.domain] = grouped[s.domain] || [];
    grouped[s.domain].push(s);
  }
  const blocks = Object.keys(grouped).map(dom => {
    const cells = grouped[dom].map(s => {
      const dir = s.delta > 0 ? '▲' : (s.delta < 0 ? '▼' : '·');
      const dirClass = s.delta > 0 ? 'up' : (s.delta < 0 ? 'down' : 'flat');
      return `
        <div class="dt-signal">
          <div class="dt-signal-h">
            <div class="dt-signal-name">${escHtml(s.name)}</div>
            ${evidenceGradeBadge(s.evidence_grade)}
          </div>
          <div class="dt-signal-row">
            <div class="dt-signal-val">${escHtml(String(s.current))} <span class="dt-signal-unit">${escHtml(s.unit || '')}</span></div>
            ${sparklineSVG(s.sparkline)}
          </div>
          <div class="dt-signal-foot">
            <span>baseline ${escHtml(String(s.baseline))}</span>
            <span class="dt-delta dt-delta-${dirClass}">${dir} ${escHtml(String(s.delta))}</span>
            <span>n=${escHtml(String(s.n_observations || 0))}</span>
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="dt-domain">
        <div class="dt-domain-h">${escHtml(DOMAIN_LABEL[dom] || dom)}</div>
        <div class="dt-domain-grid">${cells}</div>
      </div>
    `;
  }).join('');
  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Patient signal matrix</h3>
        <span class="dt-section-sub">Current value, delta vs baseline, and 12-point trend per metric.</span>
      </header>
      ${blocks}
    </section>
  `;
}

// 4. Timeline ------------------------------------------------------------
const ALL_KINDS = ['session', 'assessment', 'qeeg', 'symptom', 'biometric'];
export function renderTimeline({ patientId }, hostId) {
  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Timeline intelligence</h3>
        <span class="dt-section-sub">Sessions, assessments, qEEG events, symptom reports, and biometrics aligned by date.</span>
      </header>
      <div class="dt-timeline-filters">
        ${ALL_KINDS.map(k => `<label class="dt-chk"><input type="checkbox" data-tl-kind="${k}" checked> ${k}</label>`).join('')}
      </div>
      <div id="${hostId}" class="dt-chart-host"></div>
    </section>
  `;
}
export function mountTimeline(hostId, events, overlays) {
  buildTimeline(hostId, events, overlays || ALL_KINDS);
}

// 5. Correlation map -----------------------------------------------------
export function renderCorrelations({ correlations }, hostId) {
  const cards = (correlations?.cards || []).map(c => `
    <div class="dt-corr-card">
      <div class="dt-corr-pair">${escHtml(c.a)} <span class="dt-arrow">↔</span> ${escHtml(c.b)}</div>
      <div class="dt-corr-meta">
        <span>r = ${escHtml(String(c.strength))}</span>
        <span>conf ${escHtml(String(c.confidence))}</span>
        <span>n=${escHtml(String(c.n_observations))}</span>
        ${evidenceGradeBadge(c.evidence_grade)}
      </div>
      <div class="dt-corr-note">${escHtml(c.note || '')}</div>
    </div>
  `).join('');
  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Correlation map</h3>
        <span class="dt-section-sub">Top within-patient relationships. ${escHtml(correlations?.method || 'pearson')}.</span>
      </header>
      ${correlationVsCausationNotice()}
      <div class="dt-corr-grid">${cards}</div>
      <div id="${hostId}" class="dt-chart-host" style="margin-top:14px"></div>
    </section>
  `;
}
export function mountCorrelations(hostId, correlations) {
  buildCorrelationHeatmap(hostId, correlations?.matrix || [], correlations?.labels || []);
}

// 6. Causal hypothesis panel --------------------------------------------
export function renderCausal({ correlations }) {
  const items = (correlations?.hypotheses || []).map(h => {
    const ef = (h.evidence_for || []).map(s => `<li>${escHtml(s)}</li>`).join('');
    const ea = (h.evidence_against || []).map(s => `<li>${escHtml(s)}</li>`).join('');
    const md = (h.missing_data || []).map(s => `<li>${escHtml(s)}</li>`).join('');
    return `
      <div class="dt-causal">
        <div class="dt-causal-h">
          <div><strong>${escHtml(h.driver)}</strong> <span class="dt-arrow">→</span> <strong>${escHtml(h.outcome)}</strong></div>
          ${evidenceGradeBadge(h.evidence_grade)}
        </div>
        <div class="dt-causal-grid">
          <div><div class="dt-k">Evidence for</div><ul>${ef}</ul></div>
          <div><div class="dt-k">Evidence against</div><ul>${ea}</ul></div>
          <div><div class="dt-k">Missing data</div><ul>${md}</ul></div>
        </div>
        <div class="dt-causal-foot">
          <span>confidence ${escHtml(String(Math.round((h.confidence || 0) * 100)))}%</span>
          <span class="dt-stamp dt-stamp-review">Clinician interpretation needed</span>
        </div>
      </div>
    `;
  }).join('');
  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Causal hypotheses</h3>
        <span class="dt-section-sub">Possible drivers — evidence-graded and not causal claims.</span>
      </header>
      ${items || '<div class="dt-muted">No hypotheses yet.</div>'}
    </section>
  `;
}

// 7. Prediction panel ----------------------------------------------------
export function renderPrediction({ prediction }, hostId) {
  const horizon = prediction?.horizon || '6w';
  const buttons = ['2w', '6w', '12w'].map(h => `
    <button class="dt-tab ${h === horizon ? 'active' : ''}" data-horizon="${h}">${h}</button>
  `).join('');
  const assumptions = (prediction?.assumptions || []).map(a => `<li>${escHtml(a)}</li>`).join('');
  const tierChip = prediction?.confidence_tier ? confidenceTierChip(prediction.confidence_tier) : '';
  const evChip = evidenceStatusChip(prediction?.evidence_status || 'pending');
  const drivers = topDriversList(prediction?.top_drivers);
  const rationale = prediction?.rationale
    ? `<div class="dt-pred-rationale" style="font-size:13px;margin:8px 0">${escHtml(prediction.rationale)}</div>`
    : '';
  const calibrationNote = prediction?.calibration?.note
    ? `<div class="dt-muted" style="font-size:11px;margin-top:4px">Calibration: ${escHtml(prediction.calibration.status || 'uncalibrated')} — ${escHtml(prediction.calibration.note)}</div>`
    : '';
  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Prediction engine</h3>
        <span class="dt-section-sub">Trajectory with uncertainty bands. ${modelEstimatedStamp()} ${approvalRequiredBadge()} ${tierChip} ${evChip}</span>
      </header>
      <div class="dt-tabs">${buttons}</div>
      <div id="${hostId}" class="dt-chart-host"></div>
      ${rationale}
      <div class="dt-pred-foot">
        <div><div class="dt-k">Assumptions</div><ul>${assumptions}</ul></div>
        <div><div class="dt-k">Top drivers</div>${drivers}</div>
        <div>${evidenceGradeBadge(prediction?.evidence_grade)}${calibrationNote}</div>
      </div>
      <div class="dt-notice dt-notice-amber">${escHtml(prediction?.disclaimer || 'Predictions are model-estimated and uncalibrated. Clinician must review.')}</div>
    </section>
  `;
}
export function mountPrediction(hostId, prediction) {
  buildPrediction(hostId, prediction?.traces || []);
}

// 8. Simulation lab ------------------------------------------------------
export function renderSimulationLab(_state, hostId) {
  const presets = PRESET_SCENARIOS.map(s => `<option value="${s.id}">${escHtml(s.label)}</option>`).join('');
  const modalities = ['tdcs', 'tms', 'tacs', 'ces', 'pbm', 'behavioural', 'therapy', 'medication', 'lifestyle']
    .map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join('');
  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Simulation lab</h3>
        <span class="dt-section-sub">${simulationOnlyBadge()} ${notAPrescriptionStamp()} ${approvalRequiredBadge()}</span>
      </header>
      <div class="dt-sim-grid">
        <div class="dt-sim-form">
          <label>Preset
            <select id="dt-sim-preset">
              <option value="">— custom —</option>
              ${presets}
            </select>
          </label>
          <label>Modality
            <select id="dt-sim-modality">${modalities}</select>
          </label>
          <label>Target electrode / site
            <input id="dt-sim-target" value="Fp2" />
          </label>
          <label>Frequency (Hz)
            <input id="dt-sim-freq" type="number" step="0.1" value="10" />
          </label>
          <label>Current (mA)
            <input id="dt-sim-current" type="number" step="0.1" value="2" />
          </label>
          <label>Duration (min)
            <input id="dt-sim-duration" type="number" min="1" max="120" value="20" />
          </label>
          <label>Sessions / week
            <input id="dt-sim-perweek" type="number" min="1" max="14" value="5" />
          </label>
          <label>Weeks
            <input id="dt-sim-weeks" type="number" min="1" max="26" value="5" />
          </label>
          <label>Adherence assumption (%)
            <input id="dt-sim-adherence" type="number" min="0" max="100" value="80" />
          </label>
          <label>Contraindications (comma-separated)
            <input id="dt-sim-contra" placeholder="e.g. epilepsy_history, metal_implants" />
          </label>
          <label>Notes
            <textarea id="dt-sim-notes" rows="2" placeholder="Optional clinical context"></textarea>
          </label>
          <div class="dt-sim-actions">
            <button class="btn btn-primary btn-sm" id="dt-sim-run">Simulate</button>
            <button class="btn btn-ghost btn-sm" id="dt-sim-add">Add to compare</button>
            <button class="btn btn-ghost btn-sm" id="dt-sim-clear">Clear</button>
            <button class="btn btn-sm" id="dt-sim-room" style="margin-left:auto;background:linear-gradient(135deg,rgba(139,125,255,0.18),rgba(62,224,197,0.18));border:1px solid rgba(139,125,255,0.4);color:var(--text-primary)">🚀 Open Simulation Room</button>
          </div>
        </div>
        <div class="dt-sim-output">
          <div id="${hostId}" class="dt-chart-host"></div>
          <div id="dt-sim-detail"></div>
        </div>
      </div>
    </section>
  `;
}

export function renderSimulationDetail(sim) {
  if (!sim) return '<div class="dt-muted">Run a scenario to see predicted output.</div>';
  const bullet = arr => (arr || []).map(s => `<li>${escHtml(typeof s === 'string' ? s : (s.claim || s.detail || JSON.stringify(s)))}</li>`).join('');
  const tier = sim.confidence_tier ? confidenceTierChip(sim.confidence_tier) : '';
  const ev = evidenceStatusChip(sim.evidence_status || 'pending');
  const drivers = topDriversList(sim.top_drivers || sim.feature_attribution);
  const rationale = sim.rationale
    ? `<div class="dt-sim-rationale" style="font-size:13px;margin:6px 0">${escHtml(sim.rationale)}</div>`
    : '';
  const ci = Array.isArray(sim.responder_probability_ci95)
    ? ` <span class="dt-muted" style="font-size:11px">95% CI ${Math.round(sim.responder_probability_ci95[0]*100)}–${Math.round(sim.responder_probability_ci95[1]*100)}%</span>`
    : '';
  const calNote = sim.calibration?.note
    ? `<div class="dt-muted" style="font-size:11px;margin-top:4px">Calibration: ${escHtml(sim.calibration.status || 'uncalibrated')} — ${escHtml(sim.calibration.note)}</div>`
    : '';
  const provenance = sim.provenance
    ? `<details class="dt-prov" style="margin-top:8px"><summary class="dt-muted" style="font-size:11px;cursor:pointer">Provenance · ${escHtml(sim.provenance.model_id || '')} · ${escHtml(sim.provenance.schema_version || '')}</summary><pre style="font-size:11px;white-space:pre-wrap;background:rgba(255,255,255,.04);padding:6px;border-radius:6px">${escHtml(JSON.stringify(sim.provenance, null, 2))}</pre></details>`
    : '';
  const psNotes = (sim.patient_specific_notes || []).map(n => `<li>${escHtml(n)}</li>`).join('');
  return `
    <div class="dt-sim-detail">
      <div class="dt-sim-detail-h">
        <strong>${escHtml(sim.scenario_id)}</strong>
        ${evidenceGradeBadge(sim.evidence_grade)}
        ${tier}
        ${ev}
        ${approvalRequiredBadge()}
      </div>
      ${rationale}
      <div class="dt-sim-detail-grid">
        <div>
          <div class="dt-k">Expected domains</div>
          <div>${(sim.expected_domains || []).map(d => `<span class="dt-chip">${escHtml(d)}</span>`).join(' ')}</div>
        </div>
        <div>
          <div class="dt-k">Responder probability</div>
          <div>${escHtml(String(Math.round((sim.responder_probability || 0) * 100)))}%${ci} ${sim.non_responder_flag ? '<span class="dt-stamp dt-stamp-warn">non-responder flag</span>' : ''}</div>
          ${calNote}
        </div>
        <div>
          <div class="dt-k">Top drivers (patient-specific)</div>
          ${drivers}
        </div>
        <div>
          <div class="dt-k">Safety concerns</div>
          <ul class="dt-list-warn">${bullet(sim.safety_concerns)}</ul>
        </div>
        <div>
          <div class="dt-k">Missing data</div>
          <ul>${bullet(sim.missing_data)}</ul>
        </div>
        <div>
          <div class="dt-k">Monitoring plan</div>
          <ul>${bullet(sim.monitoring_plan)}</ul>
        </div>
        <div>
          <div class="dt-k">Evidence support</div>
          <ul>${bullet(sim.evidence_support)}</ul>
        </div>
        ${psNotes ? `<div><div class="dt-k">Patient-specific notes</div><ul>${psNotes}</ul></div>` : ''}
      </div>
      ${provenance}
      <div class="dt-notice dt-notice-amber">${escHtml(sim.disclaimer || 'Decision-support only. Clinician must review.')}</div>
    </div>
  `;
}

export function mountSimulation(hostId, scenarios) {
  if (!scenarios || !scenarios.length) {
    const el = document.getElementById(hostId);
    if (el) el.innerHTML = '<div class="dt-muted" style="padding:20px">Run a simulation to see the trajectory.</div>';
    return;
  }
  buildSimulationCurve(hostId, scenarios);
}

// 9. Report center -------------------------------------------------------
export function renderReportCenter() {
  const buttons = REPORT_KINDS.map(r => `
    <button class="btn btn-ghost btn-sm dt-report-btn" data-report-kind="${r.id}">${escHtml(r.label)}</button>
  `).join('');
  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Report center</h3>
        <span class="dt-section-sub">Generate clinician, patient, prediction, correlation, causal, simulation, governance, and completeness reports.</span>
      </header>
      <div class="dt-safety-footer" style="margin:0 0 10px 0">
        Video Analyzer outputs can be included as DeepTwin signals for correlations, causation hypotheses, and predictions only as decision-support features. Generated JSON reports include an <code style="font-size:11px">evidence_context</code> block: 87k-registry metadata, per-task <code style="font-size:11px">evidence_link</code> (condition id, target_name for the evidence query API, rationale, method note). Use those fields to open ranked papers — not to treat video metrics as stand-alone evidence of disease.
      </div>
      <div class="dt-report-buttons">${buttons}</div>
      <div id="dt-report-out" style="margin-top:10px"></div>
    </section>
  `;
}

// 10. Agent handoff ------------------------------------------------------
export function renderHandoff() {
  const buttons = HANDOFF_KINDS_LIST.map(k => `
    <button class="btn btn-ghost btn-sm" data-handoff-kind="${k.id}">${escHtml(k.label)}</button>
  `).join('');
  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Doctor agent handoff</h3>
        <span class="dt-section-sub">Send a Twin summary into the AI Agents page. Each handoff is logged.</span>
      </header>
      <div class="dt-handoff">
        <input id="dt-handoff-note" class="dt-input" placeholder="Optional note for the agent" />
        <div class="dt-handoff-buttons">${buttons}</div>
      </div>
    </section>
  `;
}

// 11. Safety footer ------------------------------------------------------
export function renderSafetyFooter() {
  return safetyFooter();
}

// Global error / loading fragments --------------------------------------
export function loadingBlock(label = 'Loading…') {
  return `<div class="dt-loading">${escHtml(label)}</div>`;
}

export function errorBlock(message) {
  return `<div class="dt-notice dt-notice-red">${escHtml(message || 'Something went wrong.')}</div>`;
}

export function emptyPatientBlock() {
  // Detect demo build at render time so the chooser surfaces a one-click
  // path to a synthetic DeepTwin without leaving the page. Outside demo
  // mode the demo button is hidden so a clinician can't accidentally
  // explore fabricated content.
  let isDemo = false;
  try {
    isDemo = !!(import.meta.env && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1'));
  } catch (_e) { isDemo = false; }
  const demoBtn = isDemo
    ? `<button class="btn btn-primary btn-sm" onclick="window._selectedPatientId='sarah-johnson';window._profilePatientId='sarah-johnson';window._nav('deeptwin')">Open DeepTwin (demo data)</button>`
    : '';
  return `
    <section class="card dt-section dt-empty" role="region" aria-label="DeepTwin patient picker">
      <h3>Pick a patient to load their DeepTwin</h3>
      <p class="dt-muted">DeepTwin is patient-scoped — it composes 11 sections (signals, timeline, correlations, predictions, simulation lab, report center, doctor handoff) for one patient at a time. Pick a patient below or open the demo to see the full surface.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        ${demoBtn}
        <button class="btn btn-outline btn-sm" onclick="window._nav('patients-hub')">Open patients roster</button>
        <button class="btn btn-outline btn-sm" onclick="window._nav('clinical')">Back to clinical hub</button>
      </div>
    </section>
  `;
}


// 12. Analysis & Simulation history ---------------------------------------
export function renderHistoryPanel({ analysisRuns = [], simulationRuns = [] }) {
  const analysisItems = analysisRuns.map(r => `
    <div class="dt-history-item" data-run-id="${escHtml(r.id)}" data-run-type="analysis">
      <div class="dt-history-meta">
        <span class="dt-history-type">${escHtml(r.analysis_type)}</span>
        <span class="dt-history-date">${new Date(r.created_at).toLocaleString()}</span>
        ${r.reviewed_at ? '<span class="dt-chip dt-chip-teal">Reviewed</span>' : '<span class="dt-chip dt-chip-amber">Pending review</span>'}
      </div>
      <div class="dt-history-actions">
        ${!r.reviewed_at ? `<button class="btn btn-ghost btn-sm" data-review>Mark reviewed</button>` : ''}
      </div>
    </div>
  `).join('') || '<div class="dt-muted">No analysis runs yet.</div>';

  const simulationItems = simulationRuns.map(r => `
    <div class="dt-history-item" data-run-id="${escHtml(r.id)}" data-run-type="simulation">
      <div class="dt-history-meta">
        <span class="dt-history-type">Simulation</span>
        <span class="dt-history-date">${new Date(r.created_at).toLocaleString()}</span>
        ${r.reviewed_at ? '<span class="dt-chip dt-chip-teal">Reviewed</span>' : '<span class="dt-chip dt-chip-amber">Pending review</span>'}
      </div>
      <div class="dt-history-actions">
        ${!r.reviewed_at ? `<button class="btn btn-ghost btn-sm" data-review>Mark reviewed</button>` : ''}
      </div>
    </div>
  `).join('') || '<div class="dt-muted">No simulation runs yet.</div>';

  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>History & Review</h3>
        <span class="dt-section-sub">Past analyses and simulations requiring clinician review</span>
      </header>
      <div class="dt-history-grid">
        <div class="dt-history-col">
          <h4>Analysis runs (${analysisRuns.length})</h4>
          ${analysisItems}
        </div>
        <div class="dt-history-col">
          <h4>Simulation runs (${simulationRuns.length})</h4>
          ${simulationItems}
        </div>
      </div>
    </section>
  `;
}

// 13. Clinician notes -----------------------------------------------------
export function renderClinicianNotesPanel({ notes = [] }) {
  const items = notes.map(n => `
    <div class="dt-note-item">
      <div class="dt-note-meta">
        <span class="dt-note-author">${escHtml(n.clinician_id)}</span>
        <span class="dt-note-date">${new Date(n.created_at).toLocaleString()}</span>
      </div>
      <div class="dt-note-text">${escHtml(n.note_text)}</div>
    </div>
  `).join('') || '<div class="dt-muted">No clinician notes yet.</div>';

  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Clinician notes</h3>
        <span class="dt-section-sub">Annotations on this twin context</span>
      </header>
      <div class="dt-notes-list">${items}</div>
      <div class="dt-note-form">
        <textarea id="dt-note-input" class="dt-textarea" rows="2" placeholder="Add a clinician note…"></textarea>
        <button class="btn btn-primary btn-sm" id="dt-note-save">Save note</button>
      </div>
    </section>
  `;
}
