// DeepTwin — flagship clinician page.
//
// Composes 11 sections built from /apps/web/src/deeptwin/*.js:
//   1. Twin status header
//   2. Data source grid
//   3. Patient signal matrix
//   4. Timeline intelligence
//   5. Correlation map
//   6. Causal hypothesis panel
//   7. Prediction engine (2w / 6w / 12w)
//   8. Simulation lab (with scenario compare)
//   9. Report center (8 report kinds, JSON + Markdown download)
//  10. Doctor agent handoff (writes context for pages-agents.js)
//  11. Safety footer
//
// Loading state, error block, and "no patient selected" empty state are
// all handled. Falls back to deterministic demo data when API is empty.

import {
  getTwinSummary, getTwinSignals, getTwinTimeline, getTwinCorrelations,
  getTwinPredictions, runTwinSimulation, getDemoPatient, getDeepTwinDataSources,
  createAnalysisRun, listAnalysisRuns, reviewAnalysisRun,
  createSimulationRun, listSimulationRuns, reviewSimulationRun,
  createClinicianNote, listClinicianNotes,
} from './deeptwin/service.js';
import {
  renderHeader, renderDataSources, renderSignalMatrix,
  renderTimeline, mountTimeline,
  renderCorrelations, mountCorrelations,
  renderCausal,
  renderPrediction, mountPrediction,
  renderSimulationLab, renderSimulationDetail, mountSimulation,
  renderReportCenter, renderHandoff, renderSafetyFooter,
  renderHistoryPanel, renderClinicianNotesPanel,
  loadingBlock, errorBlock, emptyPatientBlock,
} from './deeptwin/components.js';
import { decisionSupportBanner } from './deeptwin/safety.js';
import { buildReport, reportToMarkdown, reportToJSONString, downloadBlob, renderReportPreview } from './deeptwin/reports.js';
import { startHandoff } from './deeptwin/handoff.js';
import { PRESET_SCENARIOS } from './deeptwin/mockData.js';
import { renderTribeCompare, wireTribeCompare } from './deeptwin/tribe.js';

const HOST_TIMELINE = 'dt-timeline-host';
const HOST_CORR     = 'dt-corr-host';
const HOST_PRED     = 'dt-pred-host';
const HOST_SIM      = 'dt-sim-host';

function _selectedPatientId() {
  return window._selectedPatientId
      || window._profilePatientId
      || sessionStorage.getItem('ds_pat_selected_id')
      || '';
}

function _resolvePatientLabel(patientId) {
  const demo = getDemoPatient(patientId);
  return demo?.name || patientId || 'Unknown patient';
}

function _resolveCondition(patientId) {
  const demo = getDemoPatient(patientId);
  if (!demo) return '';
  const sec = (demo.secondary || []).join(', ');
  return demo.primary + (sec ? ` · ${sec}` : '');
}

function _injectStylesOnce() {
  // Styles are added permanently in styles.css; this is a noop guard.
  if (window.__dtStylesChecked) return;
  window.__dtStylesChecked = true;
}

const STATE = {
  patientId: '',
  summary: null,
  signals: null,
  timeline: null,
  correlations: null,
  prediction: null,
  predictionHorizon: '6w',
  scenarios: [],     // persisted for compare
  timelineFilters: ['session', 'assessment', 'qeeg', 'symptom', 'biometric'],
  dataSources: null,
  analysisRuns: [],
  simulationRuns: [],
  clinicianNotes: [],
};

function _setMain(html) {
  // The host element is content (Brain-Twin pattern) but page modules in
  // this app render to either #content or #main-content depending on
  // which router pass landed first. We try both.
  const el = document.getElementById('content') || document.getElementById('main-content');
  if (el) el.innerHTML = html;
  return el;
}

async function _loadAll(patientId) {
  STATE.patientId = patientId;
  const [summary, signals, timeline, correlations, prediction, dataSources, analysisRuns, simulationRuns, notes] = await Promise.all([
    getTwinSummary(patientId),
    getTwinSignals(patientId),
    getTwinTimeline(patientId, 90),
    getTwinCorrelations(patientId),
    getTwinPredictions(patientId, STATE.predictionHorizon),
    getDeepTwinDataSources(patientId),
    listAnalysisRuns(patientId),
    listSimulationRuns(patientId),
    listClinicianNotes(patientId),
  ]);
  STATE.summary = summary;
  STATE.signals = signals?.signals || [];
  STATE.timeline = timeline?.events || [];
  STATE.correlations = correlations;
  STATE.prediction = prediction;
  STATE.dataSources = dataSources;
  STATE.analysisRuns = Array.isArray(analysisRuns) ? analysisRuns : [];
  STATE.simulationRuns = Array.isArray(simulationRuns) ? simulationRuns : [];
  STATE.clinicianNotes = Array.isArray(notes) ? notes : [];
}

function _renderAll() {
  const patientLabel = _resolvePatientLabel(STATE.patientId);
  const condition = _resolveCondition(STATE.patientId);
  const html = `
    <div class="dt-page">
      ${decisionSupportBanner()}
      ${renderHeader({ patientLabel, condition, summary: STATE.summary, dataSources: STATE.dataSources })}
      ${renderDataSources({ summary: STATE.summary, dataSources: STATE.dataSources })}
      ${renderSignalMatrix({ signals: STATE.signals })}
      ${renderTimeline({ patientId: STATE.patientId }, HOST_TIMELINE)}
      ${renderCorrelations({ correlations: STATE.correlations }, HOST_CORR)}
      ${renderCausal({ correlations: STATE.correlations })}
      ${renderPrediction({ prediction: STATE.prediction }, HOST_PRED)}
      ${renderSimulationLab({}, HOST_SIM)}
      ${renderTribeCompare()}
      ${renderReportCenter()}
      ${renderHandoff()}
      ${renderHistoryPanel({ analysisRuns: STATE.analysisRuns, simulationRuns: STATE.simulationRuns })}
      ${renderClinicianNotesPanel({ notes: STATE.clinicianNotes })}
      ${renderSafetyFooter()}
    </div>
  `;
  _setMain(html);
  // Mount Plotly charts after HTML is in DOM
  mountTimeline(HOST_TIMELINE, STATE.timeline, STATE.timelineFilters);
  mountCorrelations(HOST_CORR, STATE.correlations);
  mountPrediction(HOST_PRED, STATE.prediction);
  mountSimulation(HOST_SIM, STATE.scenarios);
  // Wire interactions
  _wireTimelineFilters();
  _wirePredictionTabs();
  _wireSimulationLab();
  wireTribeCompare(() => STATE.patientId);
  _wireReportButtons();
  _wireHandoffButtons();
  _wireHistoryReviewButtons();
  _wireClinicianNoteForm();
}

function _wireTimelineFilters() {
  document.querySelectorAll('input[data-tl-kind]').forEach(box => {
    box.addEventListener('change', () => {
      const checked = Array.from(document.querySelectorAll('input[data-tl-kind]:checked'))
        .map(el => el.dataset.tlKind);
      STATE.timelineFilters = checked;
      mountTimeline(HOST_TIMELINE, STATE.timeline, checked);
    });
  });
}

function _wirePredictionTabs() {
  document.querySelectorAll('button[data-horizon]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const h = btn.dataset.horizon;
      if (!h || h === STATE.predictionHorizon) return;
      STATE.predictionHorizon = h;
      btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const host = document.getElementById(HOST_PRED);
      if (host) host.innerHTML = loadingBlock('Recomputing…');
      const pred = await getTwinPredictions(STATE.patientId, h);
      STATE.prediction = pred;
      mountPrediction(HOST_PRED, pred);
    });
  });
}

function _readSimForm() {
  const get = id => document.getElementById(id)?.value;
  const num = id => Number(get(id));
  const contras = (get('dt-sim-contra') || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    scenario_id: get('dt-sim-preset') ? `scn_${get('dt-sim-preset')}` : null,
    modality: get('dt-sim-modality') || 'tdcs',
    target: get('dt-sim-target') || 'Fp2',
    frequency_hz: num('dt-sim-freq') || 0,
    current_ma: num('dt-sim-current') || 0,
    duration_min: num('dt-sim-duration') || 20,
    sessions_per_week: num('dt-sim-perweek') || 5,
    weeks: num('dt-sim-weeks') || 5,
    adherence_assumption_pct: num('dt-sim-adherence') || 80,
    contraindications: contras,
    notes: get('dt-sim-notes') || null,
  };
}

function _applyPreset(presetId) {
  const p = PRESET_SCENARIOS.find(x => x.id === presetId);
  if (!p) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('dt-sim-modality', p.modality);
  set('dt-sim-target', p.target);
  if (p.frequency_hz !== undefined) set('dt-sim-freq', p.frequency_hz);
  if (p.current_ma !== undefined) set('dt-sim-current', p.current_ma);
  if (p.duration_min !== undefined) set('dt-sim-duration', p.duration_min);
  set('dt-sim-perweek', p.sessions_per_week);
  set('dt-sim-weeks', p.weeks);
  if (p.adherence_assumption_pct !== undefined) set('dt-sim-adherence', p.adherence_assumption_pct);
}

function _wireSimulationLab() {
  const preset = document.getElementById('dt-sim-preset');
  if (preset) preset.addEventListener('change', e => _applyPreset(e.target.value));

  const run = async (addToCompare) => {
    const detail = document.getElementById('dt-sim-detail');
    if (detail) detail.innerHTML = loadingBlock('Simulating…');
    try {
      const params = _readSimForm();
      // Race the simulation against a 30s timeout so a stalled backend can't
      // hang the clinician indefinitely. The backend job continues server-
      // side; the UI just stops waiting and shows a clear timeout block.
      const TIMEOUT_MS = 30000;
      const timeoutP = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Simulation timed out after 30s. The backend may still be processing — try again or refresh shortly.')), TIMEOUT_MS)
      );
      const sim = await Promise.race([runTwinSimulation(STATE.patientId, params), timeoutP]);
      // Persist the simulation run to backend for audit trail.
      try {
        await createSimulationRun(STATE.patientId, {
          proposed_protocol_json: { modality: params.modality, target: params.target, frequency_hz: params.frequency_hz, current_ma: params.current_ma, duration_min: params.duration_min, sessions_per_week: params.sessions_per_week, weeks: params.weeks },
          assumptions_json: { adherence_assumption_pct: params.adherence_assumption_pct, contraindications: params.contraindications },
          predicted_direction_json: sim?.outputs || {},
          confidence: sim?.outputs?.confidence || null,
          limitations: 'Simulation uses exploratory modeling. Not a prescription. Clinician review required.',
        });
        // Refresh history panel in background.
        listSimulationRuns(STATE.patientId).then(runs => { STATE.simulationRuns = Array.isArray(runs) ? runs : []; });
      } catch (persistErr) {
        // Non-fatal: simulation worked but persistence failed. Log quietly.
        console.warn('Simulation persistence failed:', persistErr);
      }
      if (addToCompare) {
        const willEvict = STATE.scenarios.length >= 3;
        STATE.scenarios = [...STATE.scenarios, sim].slice(-3);
        if (willEvict) {
          window._showToast?.('Comparison limit is 3. Oldest scenario removed.', 'info');
        }
      } else {
        STATE.scenarios = [sim];
      }
      mountSimulation(HOST_SIM, STATE.scenarios);
      if (detail) detail.innerHTML = renderSimulationDetail(sim);
    } catch (e) {
      if (detail) detail.innerHTML = errorBlock('Simulation failed: ' + (e.message || e));
    }
  };
  document.getElementById('dt-sim-run')?.addEventListener('click', () => run(false));
  document.getElementById('dt-sim-add')?.addEventListener('click', () => run(true));
  document.getElementById('dt-sim-clear')?.addEventListener('click', () => {
    STATE.scenarios = [];
    mountSimulation(HOST_SIM, []);
    const detail = document.getElementById('dt-sim-detail');
    if (detail) detail.innerHTML = '';
  });
  document.getElementById('dt-sim-room')?.addEventListener('click', async () => {
    const { openSimRoom } = await import('./deeptwin/sim-room.js');
    openSimRoom(STATE.patientId);
  });
}

function _wireHistoryReviewButtons() {
  document.querySelectorAll('.dt-history-item [data-review]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.dt-history-item');
      const runId = item?.dataset.runId;
      const runType = item?.dataset.runType;
      if (!runId || !runType) return;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        if (runType === 'analysis') {
          await reviewAnalysisRun(runId);
        } else {
          await reviewSimulationRun(runId);
        }
        window._showToast?.('Marked as reviewed', 'success');
        // Refresh history in background.
        if (runType === 'analysis') {
          listAnalysisRuns(STATE.patientId).then(runs => { STATE.analysisRuns = Array.isArray(runs) ? runs : []; _renderAll(); });
        } else {
          listSimulationRuns(STATE.patientId).then(runs => { STATE.simulationRuns = Array.isArray(runs) ? runs : []; _renderAll(); });
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Mark reviewed';
        window._showToast?.('Review failed: ' + (e.message || e), 'warning');
      }
    });
  });
}

function _wireClinicianNoteForm() {
  const saveBtn = document.getElementById('dt-note-save');
  const input = document.getElementById('dt-note-input');
  if (!saveBtn || !input) return;
  saveBtn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await createClinicianNote(STATE.patientId, { note_text: text });
      input.value = '';
      window._showToast?.('Note saved', 'success');
      const notes = await listClinicianNotes(STATE.patientId);
      STATE.clinicianNotes = Array.isArray(notes) ? notes : [];
      _renderAll();
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save note';
      window._showToast?.('Note failed: ' + (e.message || e), 'warning');
    }
  });
}

function _wireReportButtons() {
  document.querySelectorAll('button[data-report-kind]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const kind = btn.dataset.reportKind;
      const out = document.getElementById('dt-report-out');
      if (!out) return;
      out.innerHTML = loadingBlock('Generating report…');
      try {
        const extras = (kind === 'simulation')
          ? { simulation: STATE.scenarios[STATE.scenarios.length - 1] || {} }
          : (kind === 'prediction' ? { horizon: STATE.predictionHorizon } : {});
        const report = await buildReport(STATE.patientId, kind, extras);
        out.innerHTML = `
          ${renderReportPreview(report)}
          <div class="dt-report-actions">
            <button class="btn btn-ghost btn-sm" data-dl="json">Download JSON</button>
            <button class="btn btn-ghost btn-sm" data-dl="md">Download Markdown</button>
          </div>
        `;
        out.querySelector('button[data-dl="json"]')?.addEventListener('click', () =>
          downloadBlob(`deeptwin_${kind}_${STATE.patientId}.json`, reportToJSONString(report), 'application/json'));
        out.querySelector('button[data-dl="md"]')?.addEventListener('click', () =>
          downloadBlob(`deeptwin_${kind}_${STATE.patientId}.md`, reportToMarkdown(report), 'text/markdown'));
      } catch (e) {
        out.innerHTML = errorBlock('Report failed: ' + (e.message || e));
      }
    });
  });
}

function _wireHandoffButtons() {
  document.querySelectorAll('button[data-handoff-kind]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const kind = btn.dataset.handoffKind;
      const note = document.getElementById('dt-handoff-note')?.value || '';
      // Confirm before sending — handoffs notify another clinician/agent and
      // are awkward to retract. Fat-finger clicks have triggered accidental
      // handoffs in QA. Use the native confirm dialog so we get the same
      // accessibility/affordance as a real modal without adding a new one.
      const target = (kind || 'agent').replace(/_/g, ' ');
      if (!window.confirm(`Send handoff to ${target}?`)) return;
      try { await startHandoff(STATE.patientId, kind, note); }
      catch (e) {
        if (window._showToast) window._showToast('Handoff failed: ' + (e.message || e), 'warning');
      }
    });
  });
}

function _setTopbar(setTopbar) {
  const id = STATE.patientId;
  setTopbar?.({
    title: 'DeepTwin',
    subtitle: id ? `Patient: ${_resolvePatientLabel(id)}` : 'Select a patient to load their twin',
    actions: [
      { label: 'Patients', onClick: () => window._nav('patients-hub') },
      { label: 'Patient profile', onClick: () => {
          if (id) { window._selectedPatientId = id; window._profilePatientId = id; window._nav('patient-profile'); }
        } },
      { label: 'qEEG analyzer', onClick: () => {
          if (id) { window._selectedPatientId = id; window._nav('qeeg-analysis'); }
        } },
      { label: 'Fusion Workbench', onClick: () => {
          if (id) { window._selectedPatientId = id; window._nav('fusion-workbench'); }
        } },
    ],
  });
}

export async function pgDeeptwin(setTopbar /* , navigate */) {
  _injectStylesOnce();
  const patientId = _selectedPatientId();
  STATE.patientId = patientId;
  _setTopbar(setTopbar);

  if (!patientId) {
    _setMain(`<div class="dt-page">${decisionSupportBanner()}${emptyPatientBlock()}${renderSafetyFooter()}</div>`);
    return;
  }

  _setMain(`<div class="dt-page">${decisionSupportBanner()}${loadingBlock('Loading DeepTwin…')}</div>`);
  try {
    await _loadAll(patientId);
    _renderAll();
    _setTopbar(setTopbar);
  } catch (e) {
    _setMain(`<div class="dt-page">${decisionSupportBanner()}${errorBlock('Failed to load DeepTwin: ' + (e.message || e))}${renderSafetyFooter()}</div>`);
  }
}
