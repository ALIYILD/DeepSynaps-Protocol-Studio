// DeepTwin section render functions.
//
// Each function returns an HTML string for one section and (where it
// uses Plotly) wires up the chart in a follow-up call after the HTML
// is in the DOM. The page module composes these in pages-deeptwin.js.

import {
  evidenceGradeBadge, simulationOnlyBadge, notAPrescriptionStamp,
  modelEstimatedStamp, approvalRequiredBadge, correlationVsCausationNotice,
  dataCompletenessWarning, completenessGauge, riskChip, reviewStatusChip,
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
export function renderHeader({ patientLabel, condition, summary }) {
  const compl = summary?.completeness_pct ?? 0;
  const sources = (summary?.sources_connected || []).length;
  const total = sources + (summary?.sources_missing || []).length;
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
export function renderDataSources({ summary }) {
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
  return `
    <section class="card dt-section">
      <header class="dt-section-h"><h3>Prediction engine</h3>
        <span class="dt-section-sub">Trajectory with uncertainty bands. ${modelEstimatedStamp()} ${approvalRequiredBadge()}</span>
      </header>
      <div class="dt-tabs">${buttons}</div>
      <div id="${hostId}" class="dt-chart-host"></div>
      <div class="dt-pred-foot">
        <div><div class="dt-k">Assumptions</div><ul>${assumptions}</ul></div>
        <div>${evidenceGradeBadge(prediction?.evidence_grade)}</div>
      </div>
      <div class="dt-notice dt-notice-amber">${escHtml(prediction?.disclaimer || 'Predictions are model-estimated. Clinician must review.')}</div>
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
  const bullet = arr => (arr || []).map(s => `<li>${escHtml(s)}</li>`).join('');
  return `
    <div class="dt-sim-detail">
      <div class="dt-sim-detail-h">
        <strong>${escHtml(sim.scenario_id)}</strong>
        ${evidenceGradeBadge(sim.evidence_grade)}
        ${approvalRequiredBadge()}
      </div>
      <div class="dt-sim-detail-grid">
        <div>
          <div class="dt-k">Expected domains</div>
          <div>${(sim.expected_domains || []).map(d => `<span class="dt-chip">${escHtml(d)}</span>`).join(' ')}</div>
        </div>
        <div>
          <div class="dt-k">Responder probability</div>
          <div>${escHtml(String(Math.round((sim.responder_probability || 0) * 100)))}% ${sim.non_responder_flag ? '<span class="dt-stamp dt-stamp-warn">non-responder flag</span>' : ''}</div>
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
      </div>
      <div class="dt-notice dt-notice-amber">${escHtml(sim.disclaimer || '')}</div>
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
  return `
    <section class="card dt-section dt-empty">
      <h3>Select a patient to load their DeepTwin</h3>
      <p class="dt-muted">DeepTwin is patient-scoped. Pick a patient from the roster, then return here.</p>
      <button class="btn btn-primary btn-sm" onclick="window._nav('patients-hub')">Go to Patients</button>
    </section>
  `;
}
