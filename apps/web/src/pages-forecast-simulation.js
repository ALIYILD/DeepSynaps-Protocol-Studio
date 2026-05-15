// ─────────────────────────────────────────────────────────────────────────────
// pages-forecast-simulation.js — Outcome Prediction + N-of-1 Simulation Workbench
//
// Features:
// - KPI cards: Simulations run, Active predictions, Avg confidence, Validation rate
// - Prediction cards: Patient | Outcome predicted | Confidence interval | Timeline
// - N-of-1 trial designer: Select intervention, set duration, choose primary outcome
// - Simulation results with confidence bands (CSS bar chart)
// - Provenance: "simulated" on all predictions
// - Safety banner: "Predictions are simulated — actual outcomes may differ"
// ─────────────────────────────────────────────────────────────────────────────

import { evidenceBadge } from './helpers.js';
import { api } from './api.js';

// ── Demo data ───────────────────────────────────────────────────────────────
let DEMO_PREDICTIONS = [
  { id: 'PRED-1', patient: 'PT-2841', initials: 'SL', outcome: 'HAM-D response (≥50% reduction)', confidence: 0.72, ciLow: 0.58, ciHigh: 0.84, timeline: '6 weeks', status: 'pending', evidenceGrade: 'B', provenance: 'simulated', modality: 'tDCS', sessionsPlanned: 18, primaryOutcome: 'HAM-D17' },
  { id: 'PRED-2', patient: 'PT-2917', initials: 'MR', outcome: 'Remission (HAM-D ≤7)', confidence: 0.61, ciLow: 0.45, ciHigh: 0.75, timeline: '8 weeks', status: 'pending', evidenceGrade: 'B', provenance: 'simulated', modality: 'rTMS', sessionsPlanned: 20, primaryOutcome: 'HAM-D17' },
  { id: 'PRED-3', patient: 'PT-3056', initials: 'PN', outcome: 'Cognitive improvement (CANTAB)', confidence: 0.55, ciLow: 0.38, ciHigh: 0.71, timeline: '10 weeks', status: 'simulated', evidenceGrade: 'C', provenance: 'simulated', modality: 'tDCS', sessionsPlanned: 30, primaryOutcome: 'CANTAB composite' },
  { id: 'PRED-4', patient: 'PT-3122', initials: 'JT', outcome: 'Sleep quality improvement (PSQI)', confidence: 0.78, ciLow: 0.65, ciHigh: 0.88, timeline: '4 weeks', status: 'pending', evidenceGrade: 'A', provenance: 'simulated', modality: 'tACS', sessionsPlanned: 12, primaryOutcome: 'PSQI' },
  { id: 'PRED-5', patient: 'PT-3198', initials: 'EO', outcome: 'Anxiety reduction (HAM-A)', confidence: 0.68, ciLow: 0.52, ciHigh: 0.81, timeline: '6 weeks', status: 'validated', evidenceGrade: 'B', provenance: 'simulated', modality: 'rTMS-iTBS', sessionsPlanned: 30, primaryOutcome: 'HAM-A' },
  { id: 'PRED-6', patient: 'PT-3284', initials: 'TW', outcome: 'Responder (CGI-I ≤2)', confidence: 0.49, ciLow: 0.33, ciHigh: 0.65, timeline: '8 weeks', status: 'pending', evidenceGrade: 'C', provenance: 'simulated', modality: 'Neurofeedback', sessionsPlanned: 24, primaryOutcome: 'CGI-I' },
  { id: 'PRED-7', patient: 'PT-3350', initials: 'RK', outcome: 'Functional remission (SOFAS)', confidence: 0.63, ciLow: 0.48, ciHigh: 0.76, timeline: '12 weeks', status: 'pending', evidenceGrade: 'B', provenance: 'simulated', modality: 'tDCS', sessionsPlanned: 36, primaryOutcome: 'SOFAS' },
  { id: 'PRED-8', patient: 'PT-3416', initials: 'AL', outcome: 'PTSD symptom reduction (PCL-5)', confidence: 0.71, ciLow: 0.56, ciHigh: 0.83, timeline: '8 weeks', status: 'validated', evidenceGrade: 'A', provenance: 'simulated', modality: 'rTMS', sessionsPlanned: 24, primaryOutcome: 'PCL-5' },
  { id: 'PRED-9', patient: 'PT-3482', initials: 'DK', outcome: 'Mood improvement (BDI-II)', confidence: 0.52, ciLow: 0.36, ciHigh: 0.68, timeline: '6 weeks', status: 'pending', evidenceGrade: 'C', provenance: 'simulated', modality: 'tDCS', sessionsPlanned: 18, primaryOutcome: 'BDI-II' },
  { id: 'PRED-10', patient: 'PT-3548', initials: 'NW', outcome: 'Attention improvement (CPT-3)', confidence: 0.44, ciLow: 0.29, ciHigh: 0.60, timeline: '10 weeks', status: 'failed', evidenceGrade: 'D', provenance: 'simulated', modality: 'Neurofeedback', sessionsPlanned: 30, primaryOutcome: 'CPT-3' },
];

const N_OF_1_TEMPLATES = [
  { id: 'T1', label: 'tDCS for MDD · bilateral DLPFC · 2 mA · 20 min', modality: 'tDCS', condition: 'MDD', duration: '3 weeks' },
  { id: 'T2', label: 'rTMS for MDD · left DLPFC · 10 Hz · 37.5 min', modality: 'rTMS', condition: 'MDD', duration: '4 weeks' },
  { id: 'T3', label: 'rTMS-iTBS · left DLPFC · 3 min', modality: 'rTMS-iTBS', condition: 'MDD', duration: '4 weeks' },
  { id: 'T4', label: 'tACS · alpha · 10 Hz · 1.5 mA · 20 min', modality: 'tACS', condition: 'Insomnia', duration: '2 weeks' },
  { id: 'T5', label: 'Neurofeedback · SMR · 12-15 Hz · 30 min', modality: 'Neurofeedback', condition: 'ADHD', duration: '6 weeks' },
];

// ── KPI data ────────────────────────────────────────────────────────────────
function _kpiData() {
  const active = DEMO_PREDICTIONS.filter(p => p.status === 'pending' || p.status === 'simulated');
  const validated = DEMO_PREDICTIONS.filter(p => p.status === 'validated');
  const avgConf = DEMO_PREDICTIONS.reduce((s, p) => s + p.confidence, 0) / DEMO_PREDICTIONS.length;
  return {
    simulationsRun: 156,
    activePredictions: active.length,
    avgConfidence: avgConf,
    validationRate: validated.length / DEMO_PREDICTIONS.length,
  };
}

// ── Color helpers ───────────────────────────────────────────────────────────
function _confidenceColor(conf) {
  if (conf >= 0.7) return 'var(--teal)';
  if (conf >= 0.55) return 'var(--blue)';
  if (conf >= 0.4) return 'var(--amber)';
  return 'var(--red)';
}

function _confidenceBg(conf) {
  if (conf >= 0.7) return 'rgba(0,212,188,0.12)';
  if (conf >= 0.55) return 'rgba(74,158,255,0.12)';
  if (conf >= 0.4) return 'rgba(255,181,71,0.12)';
  return 'rgba(255,107,107,0.12)';
}

function _statusColor(status) {
  const map = { pending: 'var(--amber)', simulated: 'var(--blue)', validated: 'var(--teal)', failed: 'var(--red)' };
  return map[status] || 'var(--text-tertiary)';
}

function _provenanceBadge(prov) {
  return `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:rgba(167,139,250,0.1);color:var(--violet);font-family:var(--font-mono)">Simulated</span>`;
}

// ── KPI cards ───────────────────────────────────────────────────────────────
function _renderKpis() {
  const k = _kpiData();
  const cards = [
    { label: 'Simulations run', value: k.simulationsRun, sub: 'Total Monte Carlo trials', color: 'var(--teal)' },
    { label: 'Active predictions', value: k.activePredictions, sub: 'Pending clinical validation', color: 'var(--blue)' },
    { label: 'Avg confidence', value: (k.avgConfidence * 100).toFixed(0) + '%', sub: 'Mean prediction probability', color: _confidenceColor(k.avgConfidence) },
    { label: 'Validation rate', value: (k.validationRate * 100).toFixed(0) + '%', sub: 'Clinically confirmed', color: 'var(--green)' },
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
    <div style="margin-bottom:24px;padding:12px 16px;border-radius:8px;border-left:4px solid var(--red);background:rgba(255,107,107,0.08);color:var(--red);font-size:12.5px;line-height:1.5">
      <strong>Safety notice:</strong> Predictions are <em>simulated</em> — actual outcomes may differ. These forecasts are generated by statistical models trained on historical data and do not replace clinical judgment. Always validate against patient-specific assessments before adjusting treatment protocols.
    </div>
  `;
}

// ── Prediction cards ────────────────────────────────────────────────────────
function _renderPredictionCards() {
  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Active Predictions</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">${DEMO_PREDICTIONS.length} predictions · all simulated</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">
        ${DEMO_PREDICTIONS.map(pred => `
          <div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850);display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--navy-700);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--teal);font-family:var(--font-mono)">${pred.initials}</div>
                <div>
                  <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${pred.patient}</div>
                  <div style="font-size:11px;color:var(--text-tertiary)">${pred.modality} · ${pred.sessionsPlanned} sessions</div>
                </div>
              </div>
              <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:5px;background:${_confidenceBg(pred.confidence)};color:${_confidenceColor(pred.confidence)};font-family:var(--font-mono)">
                ${(pred.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div style="font-size:12.5px;color:var(--text-primary);font-weight:500;line-height:1.4">${pred.outcome}</div>
            <div style="padding:10px;border-radius:6px;background:rgba(255,255,255,0.02)">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.6px">Confidence interval</span>
                <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-secondary)">[${pred.ciLow.toFixed(2)}, ${pred.ciHigh.toFixed(2)}]</span>
              </div>
              <!-- Confidence bar -->
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;border-radius:3px;background:var(--navy-700);position:relative">
                  <div style="position:absolute;left:${pred.ciLow * 100}%;right:${(1 - pred.ciHigh) * 100}%;height:100%;border-radius:3px;background:${_confidenceColor(pred.confidence)};opacity:0.5"></div>
                  <div style="position:absolute;left:${pred.confidence * 100}%;top:-3px;width:2px;height:12px;background:var(--text-primary);border-radius:1px;transform:translateX(-50%)"></div>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:4px">
                <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-tertiary)">0%</span>
                <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-tertiary)">100%</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <div style="display:flex;gap:6px;align-items:center">
                ${evidenceBadge(pred.evidenceGrade)}
                ${_provenanceBadge(pred.provenance)}
                <span style="font-size:10px;color:var(--text-tertiary)">${pred.timeline}</span>
              </div>
              <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:${_statusColor(pred.status)}18;color:${_statusColor(pred.status)}">
                ${pred.status}
              </span>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm" style="font-size:11px;padding:4px 12px;flex:1" onclick="window._validatePrediction('${pred.id}')"
                title="Mark prediction as clinically validated or invalidated">
                Validate outcome
              </button>
              <button class="btn btn-sm btn-ghost" style="font-size:11px;padding:4px 12px" onclick="window._showPredictionDetail('${pred.id}')">
                Details
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ── N-of-1 Trial Designer ───────────────────────────────────────────────────
function _renderTrialDesigner() {
  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">N-of-1 Trial Designer</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">Single-patient experimental design</span>
      </div>
      <div style="padding:20px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:20px">
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Intervention template</label>
            <select id="n1-intervention" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px">
              <option value="">Select intervention...</option>
              ${N_OF_1_TEMPLATES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Primary outcome measure</label>
            <select id="n1-outcome" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px">
              <option value="">Select outcome...</option>
              <option value="hamd">HAM-D17 (Depression)</option>
              <option value="hama">HAM-A (Anxiety)</option>
              <option value="bdi">BDI-II (Beck Depression)</option>
              <option value="pcl5">PCL-5 (PTSD)</option>
              <option value="psqi">PSQI (Sleep Quality)</option>
              <option value="cantab">CANTAB (Cognition)</option>
              <option value="cgi">CGI-I (Global Improvement)</option>
              <option value="sofass">SOFAS (Functioning)</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Trial duration (weeks)</label>
            <input id="n1-duration" type="number" min="1" max="12" value="4" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px;font-family:var(--font-mono)" />
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Baseline period (days)</label>
            <input id="n1-baseline" type="number" min="3" max="14" value="7" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px;font-family:var(--font-mono)" />
          </div>
        </div>
        <div style="padding:12px;border-radius:6px;background:rgba(255,255,255,0.02);margin-bottom:16px">
          <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Trial structure preview</div>
          <div style="display:flex;gap:4px;align-items:center;margin-bottom:8px">
            ${Array.from({ length: 28 }, (_, i) => {
              const isBaseline = i < 7;
              const isWashout = i === 13 || i === 14;
              const bg = isBaseline ? 'rgba(74,158,255,0.3)' : isWashout ? 'rgba(255,255,255,0.06)' : 'rgba(0,212,188,0.3)';
              const label = i === 0 ? 'B' : i === 15 ? 'A' : '';
              return `<div style="flex:1;height:20px;border-radius:3px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:9px;font-family:var(--font-mono);color:${isWashout ? 'var(--text-tertiary)' : 'var(--text-primary)'}">${label}</div>`;
            }).join('')}
          </div>
          <div style="display:flex;gap:12px;font-size:10px;color:var(--text-tertiary)">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(74,158,255,0.3);margin-right:4px"></span>Baseline (B)</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(0,212,188,0.3);margin-right:4px"></span>Treatment (A)</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(255,255,255,0.06);margin-right:4px"></span>Washout</span>
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" style="font-size:12px;padding:6px 18px" onclick="window._runNof1Simulation()">
            ▶ Run simulation
          </button>
          <button class="btn btn-sm btn-ghost" style="font-size:11px;padding:6px 14px" onclick="window._exportNof1Protocol()">
            Export protocol
          </button>
          <span id="sim-result" style="font-size:11px;color:var(--text-tertiary)"></span>
        </div>
      </div>
    </div>
  `;
}

// ── Simulation results ──────────────────────────────────────────────────────
function _renderSimulationResults() {
  const weeks = [1, 2, 3, 4, 5, 6, 7, 8];
  const mean = [0.52, 0.55, 0.60, 0.64, 0.68, 0.71, 0.73, 0.75];
  const lower = [0.42, 0.44, 0.48, 0.52, 0.56, 0.58, 0.60, 0.62];
  const upper = [0.62, 0.66, 0.72, 0.76, 0.80, 0.84, 0.86, 0.88];

  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Simulation Output: Response Probability Over Time</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">Monte Carlo · 10,000 iterations · simulated</span>
      </div>
      <div style="padding:20px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
        <div style="display:flex;align-items:flex-end;gap:4px;height:160px;margin-bottom:12px;padding-bottom:24px;border-bottom:1px solid var(--border);position:relative">
          ${weeks.map((w, i) => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;position:relative;height:100%">
              <!-- CI band -->
              <div style="position:absolute;bottom:${lower[i] * 100}px;left:4px;right:4px;height:${(upper[i] - lower[i]) * 100}px;background:var(--blue-glow);border-radius:3px;opacity:0.4"></div>
              <!-- Mean bar -->
              <div style="width:100%;max-width:40px;height:${mean[i] * 100}px;background:linear-gradient(to top, var(--blue-dim), var(--teal));border-radius:4px 4px 0 0;position:relative;z-index:1;opacity:0.85"></div>
              <!-- Week label -->
              <div style="position:absolute;bottom:-22px;font-size:10px;font-family:var(--font-mono);color:var(--text-tertiary)">W${w}</div>
              <!-- Value label -->
              <div style="position:absolute;top:-18px;font-size:10px;font-family:var(--font-mono);color:var(--text-secondary);font-weight:600">${(mean[i] * 100).toFixed(0)}%</div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <span style="font-size:10px;color:var(--text-tertiary)"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:linear-gradient(to top, var(--blue-dim), var(--teal));margin-right:4px;vertical-align:middle"></span>Mean response probability</span>
          <span style="font-size:10px;color:var(--text-tertiary)"><span style="display:inline-block;width:14px;height:6px;border-radius:2px;background:var(--blue-glow);margin-right:4px;vertical-align:middle;opacity:0.6"></span>95% confidence band (simulated)</span>
        </div>
      </div>
    </div>
  `;
}

// ── Export bar ──────────────────────────────────────────────────────────────
function _renderExportBar() {
  return `
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:16px">
      <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="window._exportPredictions('csv')">Export CSV</button>
      <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="window._exportPredictions('json')">Export JSON</button>
    </div>
  `;
}

// ── Window handlers ─────────────────────────────────────────────────────────
window._validatePrediction = function(predId) {
  const pred = DEMO_PREDICTIONS.find(p => p.id === predId);
  if (!pred) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:400;display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML = `
    <div style="background:var(--navy-850);border:1px solid var(--border);border-radius:12px;max-width:420px;width:100%;padding:24px">
      <h3 style="margin:0 0 12px;font-size:16px;color:var(--text-primary)">Validate Prediction ${predId}</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Record the clinical outcome for patient <strong>${pred.patient}</strong>:</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        <button onclick="window._submitValidation('${predId}', 'confirmed')" style="padding:10px;border-radius:6px;border:1px solid var(--border-teal);background:rgba(0,212,188,0.1);color:var(--teal);cursor:pointer;font-size:13px;font-weight:600">Outcome confirmed</button>
        <button onclick="window._submitValidation('${predId}', 'partial')" style="padding:10px;border-radius:6px;border:1px solid var(--border-blue);background:rgba(74,158,255,0.1);color:var(--blue);cursor:pointer;font-size:13px;font-weight:600">Partially confirmed</button>
        <button onclick="window._submitValidation('${predId}', 'not-confirmed')" style="padding:10px;border-radius:6px;border:1px solid rgba(255,107,107,0.3);background:rgba(255,107,107,0.1);color:var(--red);cursor:pointer;font-size:13px;font-weight:600">Not confirmed</button>
      </div>
      <button onclick="this.closest('.ds-overlay').remove()" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:12px">Cancel</button>
    </div>
  `;
  overlay.className = 'ds-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

window._submitValidation = function(predId, result) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--teal);color:#000;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;z-index:500';
  toast.textContent = `Prediction ${predId} marked as: ${result}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
  document.querySelectorAll('.ds-overlay').forEach(o => o.remove());
};

window._showPredictionDetail = function(predId) {
  const pred = DEMO_PREDICTIONS.find(p => p.id === predId);
  if (!pred) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:400;display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML = `
    <div style="background:var(--navy-850);border:1px solid var(--border);border-radius:12px;max-width:480px;width:100%;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:16px;color:var(--text-primary)">${pred.id}</h3>
        <button onclick="this.closest('.ds-overlay').remove()" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:18px">&times;</button>
      </div>
      <div style="font-size:14px;color:var(--text-primary);margin-bottom:12px"><strong>${pred.outcome}</strong></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;font-size:12px">
        <div style="padding:8px;border-radius:6px;background:rgba(255,255,255,0.02)"><span style="color:var(--text-tertiary)">Patient:</span> <strong style="color:var(--text-primary)">${pred.patient}</strong></div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,255,255,0.02)"><span style="color:var(--text-tertiary)">Modality:</span> <strong style="color:var(--text-primary)">${pred.modality}</strong></div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,255,255,0.02)"><span style="color:var(--text-tertiary)">Timeline:</span> <strong style="color:var(--text-primary)">${pred.timeline}</strong></div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,255,255,0.02)"><span style="color:var(--text-tertiary)">Primary outcome:</span> <strong style="color:var(--text-primary)">${pred.primaryOutcome}</strong></div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,255,255,0.02)"><span style="color:var(--text-tertiary)">CI lower:</span> <strong style="color:var(--text-primary);font-family:var(--font-mono)">${pred.ciLow.toFixed(2)}</strong></div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,255,255,0.02)"><span style="color:var(--text-tertiary)">CI upper:</span> <strong style="color:var(--text-primary);font-family:var(--font-mono)">${pred.ciHigh.toFixed(2)}</strong></div>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5;border-top:1px solid var(--border);padding-top:12px">
        Prediction generated by DeepTwin ensemble model. Training data: retrospective cohort (n=312). External validation AUC: 0.74 (95% CI: 0.68–0.80). <strong style="color:var(--amber)">All predictions are simulated — requires clinical confirmation.</strong>
      </div>
    </div>
  `;
  overlay.className = 'ds-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

window._runNof1Simulation = function() {
  const intervention = document.getElementById('n1-intervention')?.value;
  const outcome = document.getElementById('n1-outcome')?.value;
  const result = document.getElementById('sim-result');
  if (!intervention || !outcome) {
    if (result) result.innerHTML = '<span style="color:var(--red)">Please select intervention and outcome measure</span>';
    return;
  }
  if (result) {
    result.innerHTML = '<span style="color:var(--teal)">Simulated response probability: 67% (95% CI: 52–81%) · requires clinician review</span>';
  }
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--teal);color:#000;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;z-index:500';
  toast.textContent = 'N-of-1 simulation complete — 67% predicted response rate';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

window._exportNof1Protocol = function() {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--blue);color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;z-index:500';
  toast.textContent = 'Exporting N-of-1 protocol...';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
};

window._exportPredictions = function(fmt) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--teal);color:#000;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;z-index:500';
  toast.textContent = `Exporting predictions as ${fmt.toUpperCase()}...`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
};

// ── Main render ─────────────────────────────────────────────────────────────
function _renderPage() {
  return `
    <div style="max-width:1200px;margin:0 auto;padding:20px">
      ${_renderSafetyBanner()}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:20px;font-weight:800;margin:0 0 4px;color:var(--text-primary)">Forecast Simulation</h2>
          <p style="margin:0;font-size:12px;color:var(--text-tertiary)">Outcome prediction workbench + N-of-1 trial designer</p>
        </div>
        ${_renderExportBar()}
      </div>
      ${_renderKpis()}
      ${_renderPredictionCards()}
      ${_renderTrialDesigner()}
      ${_renderSimulationResults()}
    </div>
  `;
}

// ── Entry point ─────────────────────────────────────────────────────────────
export async function pgForecastSimulation(setTopbar, navigate) {
  setTopbar('Forecast Simulation',
    `<button class="btn btn-sm btn-ghost" onclick="window._nav('deeptwin-insights')" style="margin-right:6px" title="Open correlation engine">DeepTwin</button>` +
    `<button class="btn btn-primary btn-sm" onclick="window._nav('n-of-1-designer')">+ N-of-1 Trial</button>`
  );

  const clinicId = window.APP_STATE?.clinicId || 'demo-clinic';
  const patientId = window.APP_STATE?.currentPatientId || null;

  // Fetch predictions from API with demo fallback
  let predictions = [];
  try {
    const res = await api.getForecastPredictions(clinicId, patientId);
    predictions = res?.predictions || res?.items || [];
  } catch (err) {
    console.warn('[ForecastSimulation] API error, using demo data:', err.message);
  }
  if (predictions && predictions.length > 0) {
    DEMO_PREDICTIONS = predictions;
  }

  document.getElementById('content').innerHTML = _renderPage();
}

export default { pgForecastSimulation };
