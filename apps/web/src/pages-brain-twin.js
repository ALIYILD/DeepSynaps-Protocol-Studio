import { api } from './api.js';
import { spinner } from './helpers.js';

const MODALITIES = [
  { id: 'qeeg_raw', label: 'qEEG raw', short: 'Raw EEG', group: 'Neurophysiology' },
  { id: 'qeeg_features', label: 'qEEG biomarkers', short: 'qEEG', group: 'Neurophysiology' },
  { id: 'mri_structural', label: 'MRI structural', short: 'MRI', group: 'Imaging' },
  { id: 'fmri', label: 'fMRI', short: 'fMRI', group: 'Imaging' },
  { id: 'wearables', label: 'Wearables', short: 'Wearables', group: 'Biometrics' },
  { id: 'in_clinic_therapy', label: 'Clinic therapy logs', short: 'Clinic therapy', group: 'Treatment' },
  { id: 'home_therapy', label: 'Home therapy logs', short: 'Home therapy', group: 'Treatment' },
  { id: 'video', label: 'Video analysis', short: 'Video', group: 'Behavioral' },
  { id: 'audio', label: 'Audio analysis', short: 'Audio', group: 'Behavioral' },
  { id: 'assessments', label: 'Assessments', short: 'Assessments', group: 'Clinical' },
  { id: 'ehr_text', label: 'Medical record text', short: 'Medical record', group: 'Clinical' },
];

const SIM_PRESETS = {
  rtms_fp2_10hz: {
    intervention_type: 'rTMS',
    target: 'Fp2',
    frequency_hz: 10,
    intensity: '110% MT',
    sessions_per_day: 5,
    sessions_per_week: 5,
    weeks: 5,
    expected_biomarker: 'alpha',
    clinical_goal: 'attention',
  },
  tdcs_bifrontal: {
    intervention_type: 'tDCS',
    target: 'F3 anode / F4 cathode',
    frequency_hz: 0,
    intensity: '2 mA',
    sessions_per_day: 1,
    sessions_per_week: 5,
    weeks: 4,
    expected_biomarker: 'frontal asymmetry',
    clinical_goal: 'mood regulation',
  },
  nfb_theta_beta: {
    intervention_type: 'Neurofeedback',
    target: 'Fz/Cz',
    frequency_hz: 0,
    intensity: 'Theta down / beta up',
    sessions_per_day: 1,
    sessions_per_week: 3,
    weeks: 8,
    expected_biomarker: 'theta_beta_ratio',
    clinical_goal: 'attention',
  },
};

function _esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function _toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

function _firstDefined() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function _fmtDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function _daysAgo(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));
}

function _ageFromDob(value) {
  if (!value) return null;
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function _selectedPatientId() {
  return (
    window._selectedPatientId ||
    window._profilePatientId ||
    window._patientId ||
    sessionStorage.getItem('ds_pat_selected_id') ||
    ''
  );
}

function _defaultSelection() {
  return ['qeeg_features', 'mri_structural', 'wearables', 'assessments', 'ehr_text'];
}

function _selectedModalities() {
  if (!window._brain_twin_modalities) window._brain_twin_modalities = _defaultSelection();
  return window._brain_twin_modalities.slice();
}

function _modalityMeta(id) {
  return MODALITIES.find((item) => item.id === id) || { id, label: id, short: id, group: 'Other' };
}

function _workspaceState() {
  if (!window._brain_twin_workspace) {
    window._brain_twin_workspace = {
      patient: null,
      context: null,
      analysis: null,
      simulation: null,
      evidence: null,
      reports: null,
      loadingContext: false,
      loadingAnalysis: false,
      loadingSimulation: false,
      loadingEvidence: false,
    };
  }
  return window._brain_twin_workspace;
}

function _scenarioState() {
  if (!window._brain_twin_scenario) window._brain_twin_scenario = Object.assign({}, SIM_PRESETS.rtms_fp2_10hz);
  return window._brain_twin_scenario;
}

function _ensurePatientOrPrompt() {
  const id = _selectedPatientId();
  if (id) return id;
  if (window._showToast) window._showToast('Select a patient first.', 'warning');
  window._nav('patients-v2');
  return '';
}

function _latestByDate(rows, key = 'date') {
  return rows
    .filter(Boolean)
    .slice()
    .sort((left, right) => new Date(right[key] || 0).getTime() - new Date(left[key] || 0).getTime())[0] || null;
}

function _extractAssessmentRows(payload) {
  return _toArray(payload).map((item) => ({
    instrument: _firstDefined(item.instrument, item.template_label, item.scale_name, 'Assessment'),
    score: _firstDefined(item.score, item.total_score, item.normalized_score),
    createdAt: _firstDefined(item.created_at, item.completed_at, item.timestamp),
    raw: item,
  }));
}

function _extractSessionRows(payload) {
  return _toArray(payload).map((item) => ({
    date: _firstDefined(item.session_date, item.started_at, item.created_at),
    protocol: _firstDefined(item.protocol_name, item.protocol_id, item.protocol?.name),
    raw: item,
  }));
}

function _extractCourseRows(payload) {
  return _toArray(payload).map((item) => ({
    date: _firstDefined(item.updated_at, item.created_at, item.started_at),
    label: _firstDefined(item.name, item.course_name, item.protocol_name, 'Course'),
    raw: item,
  }));
}

function _extractReportRows(payload) {
  return _toArray(payload).map((item) => ({
    date: _firstDefined(item.created_at, item.updated_at),
    type: _firstDefined(item.report_type, item.template_id, 'Report'),
    raw: item,
  }));
}

function _extractQeegRows(payload) {
  return _toArray(payload).map((item) => ({
    id: item.id,
    date: _firstDefined(item.analyzed_at, item.created_at, item.recorded_at),
    bandPowers: _firstDefined(item.band_powers, item.bandPowers, item.raw?.band_powers, {}),
    brainAge: _firstDefined(item.brain_age, item.brainAge, {}),
    raw: item,
  }));
}

function _extractMriRows(payload) {
  return _toArray(payload).map((item) => ({
    id: _firstDefined(item.analysis_id, item.id),
    date: _firstDefined(item.created_at, item.completed_at),
    raw: item,
  }));
}

function _extractWearableSummary(payload) {
  const raw = payload || {};
  return {
    sleepMinutes: _num(_firstDefined(raw.sleep_total_min, raw.sleep_minutes, raw.sleep?.total_min)),
    hrvRmssd: _num(_firstDefined(raw.hrv_rmssd_ms, raw.hrv?.rmssd_ms)),
    restingHr: _num(_firstDefined(raw.resting_hr, raw.hr?.resting)),
    raw,
  };
}

function _extractMedicalSignals(payload) {
  const raw = payload || {};
  const sections = _toArray(raw.sections).length;
  const diagnoses = _toArray(raw.diagnoses).length;
  const meds = _toArray(raw.medications).length;
  return { sectionCount: sections || diagnoses || meds, raw };
}

async function _loadPatientTwinContext(patientId) {
  const calls = await Promise.allSettled([
    api.getPatient(patientId),
    api.getPatientMedicalHistory(patientId),
    api.getPatientAssessments(patientId),
    api.getPatientSessions(patientId),
    api.getPatientCourse(patientId),
    api.getPatientReports(patientId),
    api.listPatientQEEGAnalyses(patientId),
    api.listPatientMRIAnalyses(patientId),
    api.getPatientWearableSummary(patientId),
    api.getPatientAlertFlags(patientId),
    api.getFusionRecommendation(patientId),
  ]);
  const value = (index, fallback) => (calls[index].status === 'fulfilled' ? calls[index].value : fallback);
  return {
    patientId,
    patient: value(0, null),
    medical: _extractMedicalSignals(value(1, null)),
    assessmentRows: _extractAssessmentRows(value(2, [])),
    sessionRows: _extractSessionRows(value(3, [])),
    courseRows: _extractCourseRows(value(4, [])),
    reportRows: _extractReportRows(value(5, [])),
    qeegRows: _extractQeegRows(value(6, [])),
    mriRows: _extractMriRows(value(7, [])),
    wearables: _extractWearableSummary(value(8, null)),
    alerts: _toArray(value(9, [])),
    fusion: value(10, null),
  };
}

function _inferCoverage(context, selected) {
  const availability = {
    qeeg_raw: context.qeegRows.length > 0,
    qeeg_features: context.qeegRows.length > 0,
    mri_structural: context.mriRows.length > 0,
    fmri: false,
    wearables: Boolean(context.wearables.sleepMinutes || context.wearables.hrvRmssd || context.wearables.restingHr),
    in_clinic_therapy: context.sessionRows.length > 0,
    home_therapy: context.courseRows.length > 0 || context.sessionRows.length > 0,
    video: false,
    audio: false,
    assessments: context.assessmentRows.length > 0,
    ehr_text: context.medical.sectionCount > 0 || context.reportRows.length > 0,
  };
  const freshness = {
    qeeg_features: _latestByDate(context.qeegRows)?.date || null,
    mri_structural: _latestByDate(context.mriRows)?.date || null,
    wearables: context.wearables.raw?.updated_at || context.wearables.raw?.captured_at || null,
    assessments: _latestByDate(context.assessmentRows, 'createdAt')?.createdAt || null,
    in_clinic_therapy: _latestByDate(context.sessionRows)?.date || null,
    home_therapy: _latestByDate(context.courseRows)?.date || null,
    ehr_text: context.patient?.updated_at || null,
  };
  const items = selected.map((id) => {
    const meta = _modalityMeta(id);
    return {
      id,
      label: meta.label,
      short: meta.short,
      group: meta.group,
      available: Boolean(availability[id]),
      lastUpdated: freshness[id] || null,
      staleDays: _daysAgo(freshness[id]),
    };
  });
  return { items, covered: items.filter((item) => item.available).length, total: items.length };
}

function _buildSnapshot(context) {
  const patient = context.patient || {};
  return {
    patientName: _firstDefined(
      [patient.first_name, patient.last_name].filter(Boolean).join(' '),
      patient.display_name,
      patient.name,
      context.patientId
    ),
    age: _ageFromDob(_firstDefined(patient.dob, patient.date_of_birth)),
    primaryCondition: _firstDefined(
      patient.primary_condition,
      patient.condition,
      patient.primary_diagnosis,
      'Unspecified'
    ),
    coverage: _inferCoverage(context, _selectedModalities()),
    activeAlerts: context.alerts,
  };
}

function _assessmentSeverity(item) {
  const score = _num(item?.score) || 0;
  if (score >= 25) return { label: 'High recent assessment burden', tone: 'amber' };
  if (score >= 15) return { label: 'Moderate recent assessment burden', tone: 'blue' };
  return { label: 'Low recent assessment burden', tone: 'teal' };
}

function _buildFindings(context, analysis) {
  const findings = [];
  const latestAssessment = _latestByDate(context.assessmentRows, 'createdAt');
  if (latestAssessment) {
    const severity = _assessmentSeverity(latestAssessment);
    findings.push({
      title: latestAssessment.instrument,
      summary: severity.label,
      supporting: `Latest score ${latestAssessment.score ?? 'n/a'} on ${_fmtDate(latestAssessment.createdAt)}.`,
      confidence: latestAssessment.score >= 15 ? 'moderate' : 'low',
      tone: severity.tone,
      provenance: 'assessment time-series',
    });
  }
  if (context.wearables.sleepMinutes != null || context.wearables.hrvRmssd != null) {
    const stressSignals = [];
    if (context.wearables.sleepMinutes != null && context.wearables.sleepMinutes < 390) {
      stressSignals.push(`sleep ${context.wearables.sleepMinutes} min`);
    }
    if (context.wearables.hrvRmssd != null && context.wearables.hrvRmssd < 25) {
      stressSignals.push(`HRV ${context.wearables.hrvRmssd} ms`);
    }
    findings.push({
      title: 'Autonomic and recovery state',
      summary: stressSignals.length
        ? `Recovery stress signal from ${stressSignals.join(', ')}`
        : 'Wearable data available for physiologic context',
      supporting: 'Wearables can modulate symptom volatility, attentional stability, and treatment readiness.',
      confidence: stressSignals.length ? 'moderate' : 'low',
      tone: stressSignals.length ? 'amber' : 'blue',
      provenance: 'wearable summary',
    });
  }
  if (context.qeegRows.length) {
    const latest = _latestByDate(context.qeegRows);
    const ratios = latest?.bandPowers?.derived_ratios || latest?.raw?.clinical_ratios || {};
    const thetaBeta = _num(_firstDefined(ratios.theta_beta_ratio, ratios.tbr, latest?.raw?.theta_beta_ratio));
    findings.push({
      title: 'qEEG signal summary',
      summary: thetaBeta != null
        ? `Theta/beta ratio ${thetaBeta.toFixed(2)} on the latest recording`
        : `Latest qEEG available from ${_fmtDate(latest?.date)}`,
      supporting: 'Use qEEG for biomarker tracking, protocol planning, and cross-modal triangulation.',
      confidence: 'moderate',
      tone: thetaBeta != null && thetaBeta >= 4 ? 'amber' : 'blue',
      provenance: 'qEEG analyzer',
    });
  }
  if (context.mriRows.length) {
    const latest = _latestByDate(context.mriRows);
    findings.push({
      title: 'MRI longitudinal anchor',
      summary: `MRI dataset available from ${_fmtDate(latest?.date)}`,
      supporting: 'Structural data gives an anatomic anchor for stimulation targeting and multimodal interpretation.',
      confidence: 'moderate',
      tone: 'blue',
      provenance: 'MRI analyzer',
    });
  }
  if (analysis?.prediction?.key_predictions) {
    analysis.prediction.key_predictions.slice(0, 2).forEach((item) => {
      findings.push({
        title: item.title || 'Predicted response',
        summary: item.summary || item.expected_direction || 'Prediction available',
        supporting: item.why || item.caveat || '',
        confidence: item.confidence || 'low',
        tone: item.confidence === 'high' ? 'teal' : item.confidence === 'moderate' ? 'amber' : 'blue',
        provenance: 'DeepTwin prediction engine',
      });
    });
  }
  return findings.slice(0, 8);
}

function _buildCrossModalHypotheses(context, analysis) {
  const hypotheses = [];
  const latestAssessment = _latestByDate(context.assessmentRows, 'createdAt');
  const latestQeeg = _latestByDate(context.qeegRows);
  const thetaBeta = _num(_firstDefined(
    latestQeeg?.bandPowers?.derived_ratios?.theta_beta_ratio,
    latestQeeg?.raw?.clinical_ratios?.theta_beta_ratio,
    latestQeeg?.raw?.theta_beta_ratio
  ));
  if (latestAssessment && thetaBeta != null && thetaBeta >= 3.5) {
    hypotheses.push({
      title: 'Attention dysregulation hypothesis',
      statement: `${latestAssessment.instrument} burden and elevated theta/beta ratio may reflect a shared attention-regulation phenotype.`,
      support: ['Latest assessment severity', `Theta/beta ratio ${thetaBeta.toFixed(2)}`],
      confidence: 0.64,
      caution: 'Association only. This does not prove mechanism or treatment response.',
    });
  }
  if (
    (context.wearables.sleepMinutes != null && context.wearables.sleepMinutes < 390) ||
    (context.wearables.hrvRmssd != null && context.wearables.hrvRmssd < 25)
  ) {
    hypotheses.push({
      title: 'Recovery load amplifying symptoms',
      statement: 'Poor sleep or low HRV may be increasing day-to-day symptom variability and reducing intervention readiness.',
      support: [
        context.wearables.sleepMinutes != null ? `Sleep ${context.wearables.sleepMinutes} min` : null,
        context.wearables.hrvRmssd != null ? `HRV ${context.wearables.hrvRmssd} ms` : null,
      ].filter(Boolean),
      confidence: 0.58,
      caution: 'Treat as a modifiable hypothesis and confirm with longitudinal trend review.',
    });
  }
  if (context.mriRows.length && context.qeegRows.length) {
    hypotheses.push({
      title: 'Imaging plus physiology triangulation',
      statement: 'MRI and qEEG should be reviewed together before target selection, because physiologic features can refine how structural targets are interpreted.',
      support: ['MRI available', 'qEEG available'],
      confidence: 0.71,
      caution: 'Requires clinician review and target-specific evidence.',
    });
  }
  if (analysis?.causation?.hypotheses) {
    analysis.causation.hypotheses.slice(0, 3).forEach((item) => {
      hypotheses.push({
        title: item.title || 'Causal hypothesis',
        statement: item.summary || item.explanation || 'Directional hypothesis available',
        support: _toArray(item.support).map((entry) => entry.label || entry),
        confidence: _num(item.confidence) || 0.5,
        caution: item.caveat || 'Hypothesis only; not established clinical causation.',
      });
    });
  }
  return hypotheses.slice(0, 6);
}

function _buildPairRanking(analysis) {
  const pairs = _toArray(analysis?.correlation?.priority_pairs);
  if (pairs.length) return pairs;
  const labels = _toArray(analysis?.correlation?.labels);
  const matrix = _toArray(analysis?.correlation?.matrix);
  const ranked = [];
  for (let left = 0; left < labels.length; left += 1) {
    for (let right = left + 1; right < labels.length; right += 1) {
      const score = _num(matrix[left]?.[right]);
      if (score == null) continue;
      ranked.push({
        left: labels[left],
        right: labels[right],
        score,
        interpretation: score > 0 ? 'moves together' : 'moves in opposite directions',
      });
    }
  }
  ranked.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  return ranked.slice(0, 6);
}

function _buildReportDrafts(snapshot, findings, hypotheses, analysis, simulation) {
  const patientLine = `${snapshot.patientName} · ${snapshot.primaryCondition}${snapshot.age != null ? ` · age ${snapshot.age}` : ''}`;
  const finding = findings[0]?.summary || 'No major signal highlighted yet.';
  const hypothesis = hypotheses[0]?.statement || 'No cross-modal hypothesis ranked yet.';
  const prediction = analysis?.prediction?.executive_summary
    || analysis?.prediction?.fusion?.summary
    || 'Prediction engine has not yet produced a summary.';
  const simulationLine = simulation?.outputs?.clinical_forecast?.summary
    || simulation?.outputs?.timecourse_summary
    || 'No scenario has been simulated yet.';
  return [
    {
      id: 'twin-summary',
      title: 'DeepTwin summary report',
      body: `${patientLine}. Current leading signal: ${finding} Cross-modal hypothesis: ${hypothesis} This page is decision-support only and all outputs require clinician review.`,
    },
    {
      id: 'correlation-report',
      title: 'Correlation and interaction brief',
      body: `${patientLine}. Highest-priority interactions should be reviewed in context rather than treated as causal facts. Current lead: ${hypothesis}`,
    },
    {
      id: 'prediction-report',
      title: 'Prediction and treatment-readiness report',
      body: `${patientLine}. Prediction summary: ${prediction}`,
    },
    {
      id: 'simulation-report',
      title: 'Scenario simulation brief',
      body: `${patientLine}. Latest what-if scenario: ${simulationLine}`,
    },
  ];
}

function _analysisPayload(patientId) {
  return {
    patient_id: patientId,
    modalities: _selectedModalities(),
    combine: window._brain_twin_combine || 'all_selected',
    analysis_modes: ['correlation', 'prediction', 'causation'],
  };
}

function _simulationPayload(patientId) {
  const scenario = _scenarioState();
  return {
    patient_id: patientId,
    protocol_id: scenario.protocol_id || `${scenario.intervention_type || 'protocol'}_${String(scenario.target || 'target').replace(/\s+/g, '_')}`,
    horizon_days: Math.max(14, Number(scenario.weeks || 4) * 7),
    modalities: _selectedModalities(),
    scenario: Object.assign({}, scenario),
  };
}

function _autoResearchQuestion(snapshot, findings, scenario) {
  return [
    snapshot.primaryCondition,
    findings[0]?.title,
    findings[0]?.summary,
    scenario?.intervention_type,
    scenario?.target,
    scenario?.frequency_hz ? `${scenario.frequency_hz} hz` : '',
    scenario?.clinical_goal,
  ].filter(Boolean).join(' ');
}

function _pill(label, tone) {
  const colors = {
    teal: 'rgba(0,212,188,.14)',
    blue: 'rgba(74,158,255,.16)',
    amber: 'rgba(255,179,71,.16)',
    red: 'rgba(255,107,107,.16)',
    slate: 'rgba(255,255,255,.08)',
  };
  return `<span style="padding:6px 10px;border-radius:999px;background:${colors[tone] || colors.slate};border:1px solid rgba(255,255,255,.08);font-size:11px;color:var(--text)">${_esc(label)}</span>`;
}

function _card(title, body) {
  return `<div class="card" style="padding:14px">
    <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:10px">${_esc(title)}</div>
    ${body}
  </div>`;
}

function _renderHero(snapshot, findings, workspace) {
  return `<div class="card" style="padding:18px">
    <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <div style="max-width:860px">
        <div style="font-size:12px;color:var(--text-tertiary);letter-spacing:.08em;text-transform:uppercase">Decision-support only</div>
        <div style="font-size:28px;font-weight:750;letter-spacing:-.03em;color:var(--text);margin-top:14px">DeepTwin Command Workspace</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-top:10px">
          One patient-state canvas for multimodal signal fusion, ranked mechanism hypotheses, scenario simulation, auto-research, and clinician-ready report drafting.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          ${_pill(snapshot.patientName, 'teal')}
          ${_pill(snapshot.primaryCondition, 'blue')}
          ${snapshot.age != null ? _pill(`age ${snapshot.age}`, 'slate') : ''}
          ${_pill(`${snapshot.coverage.covered}/${snapshot.coverage.total} modalities available`, snapshot.coverage.covered >= 3 ? 'teal' : 'amber')}
        </div>
      </div>
      <div style="display:grid;gap:10px;min-width:280px">
        <button class="btn btn-primary btn-sm" onclick="window._brainTwinRefreshAll()">Refresh patient context</button>
        <button class="btn btn-ghost btn-sm" onclick="window._brainTwinRun()">Run DeepTwin analysis</button>
        <div style="font-size:12.5px;color:var(--text-tertiary);line-height:1.6">
          ${_esc(workspace.simulation?.outputs?.clinical_forecast?.summary || 'Define a protocol and run a what-if scenario to estimate biomarker and outcome movement.')}
        </div>
      </div>
    </div>
    ${findings.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:16px">
      ${findings.slice(0, 3).map((item) => `<div style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025)">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div style="font-size:12px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em">${_esc(item.title)}</div>
          ${_pill(item.confidence || 'low', item.tone || 'slate')}
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-top:8px">${_esc(item.summary)}</div>
        <div style="font-size:12px;color:var(--text-tertiary);line-height:1.7;margin-top:8px">${_esc(item.supporting || '')}</div>
      </div>`).join('')}
    </div>` : ''}
  </div>`;
}

function _renderSourceInventory(snapshot) {
  return _card('Data Spine', `<div style="display:grid;gap:10px">
    ${snapshot.coverage.items.map((item) => `<div style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:${item.available ? 'rgba(0,212,188,.06)' : 'rgba(255,255,255,.03)'}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div>
          <div style="font-size:12px;color:var(--text);font-weight:650">${_esc(item.label)}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${_esc(item.group)}</div>
        </div>
        ${_pill(item.available ? 'Present' : 'Missing', item.available ? 'teal' : 'amber')}
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">
        ${item.lastUpdated ? `Updated ${_fmtDate(item.lastUpdated)}${item.staleDays != null ? ` · ${item.staleDays}d ago` : ''}` : 'No recent source payload'}
      </div>
    </div>`).join('')}
  </div>`);
}

function _renderStateRail(snapshot, context) {
  return _card('Current Patient State', `<div style="display:grid;gap:10px">
    <div style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025)">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em">Patient</div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-top:6px">${_esc(snapshot.patientName)}</div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">${_esc(snapshot.primaryCondition)}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
      <div style="padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)">
        <div style="font-size:11px;color:var(--text-tertiary)">Assessments</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-top:6px">${context.assessmentRows.length}</div>
      </div>
      <div style="padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)">
        <div style="font-size:11px;color:var(--text-tertiary)">Sessions</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-top:6px">${context.sessionRows.length}</div>
      </div>
      <div style="padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)">
        <div style="font-size:11px;color:var(--text-tertiary)">qEEG analyses</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-top:6px">${context.qeegRows.length}</div>
      </div>
      <div style="padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)">
        <div style="font-size:11px;color:var(--text-tertiary)">MRI analyses</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-top:6px">${context.mriRows.length}</div>
      </div>
    </div>
    <div style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025)">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em">Fusion recommendation</div>
      <div style="font-size:12.5px;color:var(--text);line-height:1.7;margin-top:8px">${_esc(context.fusion?.summary || context.fusion?.recommendation || 'No fusion summary available yet.')}</div>
    </div>
  </div>`);
}

function _renderFindings(findings) {
  return _card('Prioritized Findings', findings.length
    ? `<div style="display:grid;gap:10px">
      ${findings.map((item) => `<div style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02)">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${_esc(item.title)}</div>
          ${_pill(item.confidence || 'low', item.tone || 'slate')}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-top:8px">${_esc(item.summary)}</div>
        <div style="font-size:12px;color:var(--text-tertiary);line-height:1.7;margin-top:8px">${_esc(item.supporting || '')}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Source: ${_esc(item.provenance || 'DeepTwin')}</div>
      </div>`).join('')}
    </div>`
    : '<div style="font-size:12.5px;color:var(--text-tertiary)">No patient data loaded yet.</div>');
}

function _renderHypotheses(hypotheses) {
  return _card('Mechanism Hypotheses', hypotheses.length
    ? `<div style="display:grid;gap:10px">
      ${hypotheses.map((item) => `<div style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02))">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${_esc(item.title)}</div>
          ${_pill(`${Math.round((item.confidence || 0) * 100)}%`, item.confidence >= 0.66 ? 'teal' : item.confidence >= 0.5 ? 'amber' : 'slate')}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;margin-top:8px">${_esc(item.statement)}</div>
        <div style="font-size:12px;color:var(--text-tertiary);line-height:1.7;margin-top:8px">${_esc((item.support || []).join(' · '))}</div>
        <div style="font-size:12px;color:var(--text-tertiary);line-height:1.7;margin-top:8px">Caution: ${_esc(item.caution || '')}</div>
      </div>`).join('')}
    </div>`
    : '<div style="font-size:12.5px;color:var(--text-tertiary)">No ranked hypotheses yet. Run DeepTwin after loading patient context.</div>');
}

function _renderCorrelationPairs(pairs) {
  return _card('Cross-Modal Pair Ranking', pairs.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
      ${pairs.map((pair) => {
        const score = _num(pair.score) || 0;
        const width = Math.max(8, Math.round(Math.abs(score) * 100));
        return `<div style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02)">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--text)">${_esc(pair.left)} ↔ ${_esc(pair.right)}</div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">${_esc(pair.clinical_readout || pair.interpretation || 'Cross-modal association')}</div>
            </div>
            ${_pill(score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2), score >= 0 ? 'teal' : 'amber')}
          </div>
          <div style="height:7px;border-radius:999px;background:rgba(255,255,255,.05);overflow:hidden;margin-top:10px">
            <div style="height:100%;width:${width}%;background:${score >= 0 ? 'linear-gradient(90deg,var(--teal),var(--blue))' : 'linear-gradient(90deg,var(--amber),var(--red))'}"></div>
          </div>
        </div>`;
      }).join('')}
    </div>`
    : '<div style="font-size:12.5px;color:var(--text-tertiary)">Correlation pairs will appear after analysis runs.</div>');
}

function _renderSimulationLab(workspace) {
  const scenario = _scenarioState();
  const simulation = workspace.simulation;
  const clinical = simulation?.outputs?.clinical_forecast || {};
  const biomarkers = _toArray(simulation?.outputs?.biomarker_forecast);
  const timeline = _toArray(simulation?.outputs?.timecourse);
  return _card('Simulation Lab', `<div style="display:grid;grid-template-columns:320px minmax(0,1fr);gap:14px">
    <div style="display:grid;gap:10px">
      <label class="bt-field"><span>Intervention</span>
        <select class="bt-select" onchange="window._brainTwinSetScenarioField('intervention_type', this.value)">
          ${['rTMS', 'tDCS', 'Neurofeedback', 'Medication', 'Lifestyle'].map((value) => `<option value="${value}" ${scenario.intervention_type === value ? 'selected' : ''}>${value}</option>`).join('')}
        </select>
      </label>
      <label class="bt-field"><span>Target / montage</span><input class="bt-input" value="${_esc(scenario.target || '')}" oninput="window._brainTwinSetScenarioField('target', this.value)"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="bt-field"><span>Hz</span><input class="bt-input" type="number" min="0" value="${_esc(scenario.frequency_hz || 0)}" oninput="window._brainTwinSetScenarioField('frequency_hz', this.value)"></label>
        <label class="bt-field"><span>Intensity</span><input class="bt-input" value="${_esc(scenario.intensity || '')}" oninput="window._brainTwinSetScenarioField('intensity', this.value)"></label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <label class="bt-field"><span>/ day</span><input class="bt-input" type="number" min="1" value="${_esc(scenario.sessions_per_day || 1)}" oninput="window._brainTwinSetScenarioField('sessions_per_day', this.value)"></label>
        <label class="bt-field"><span>/ week</span><input class="bt-input" type="number" min="1" value="${_esc(scenario.sessions_per_week || 5)}" oninput="window._brainTwinSetScenarioField('sessions_per_week', this.value)"></label>
        <label class="bt-field"><span>Weeks</span><input class="bt-input" type="number" min="1" value="${_esc(scenario.weeks || 4)}" oninput="window._brainTwinSetScenarioField('weeks', this.value)"></label>
      </div>
      <label class="bt-field"><span>Expected biomarker</span><input class="bt-input" value="${_esc(scenario.expected_biomarker || '')}" oninput="window._brainTwinSetScenarioField('expected_biomarker', this.value)"></label>
      <label class="bt-field"><span>Clinical goal</span><input class="bt-input" value="${_esc(scenario.clinical_goal || '')}" oninput="window._brainTwinSetScenarioField('clinical_goal', this.value)"></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="window._brainTwinApplyPreset('rtms_fp2_10hz')">Use 10 Hz Fp2 preset</button>
        <button class="btn btn-primary btn-sm" onclick="window._brainTwinSimulate()">Run scenario</button>
      </div>
    </div>
    <div style="display:grid;gap:10px">
      <div style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03)">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div style="font-size:14px;font-weight:700;color:var(--text)">Clinical forecast</div>
          ${_pill(simulation?.engine?.name || 'Awaiting run', simulation ? 'blue' : 'slate')}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-top:8px">${_esc(clinical.summary || 'No scenario has been executed yet. Use the structured fields on the left rather than an opaque protocol id so the workspace can explain the forecast.')}</div>
        ${clinical.expected_direction ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:10px">Expected direction: ${_esc(clinical.expected_direction)}</div>` : ''}
        ${clinical.caveat ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">Uncertainty: ${_esc(clinical.caveat)}</div>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
        ${biomarkers.length ? biomarkers.map((item) => `<div style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02)">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary)">${_esc(item.name || item.marker || 'Biomarker')}</div>
          <div style="font-size:16px;font-weight:700;color:var(--text);margin-top:6px">${_esc(item.direction || item.expected_direction || 'Shift expected')}</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">${_esc(item.why || item.summary || '')}</div>
        </div>`).join('') : '<div style="padding:12px;border-radius:12px;border:1px dashed rgba(255,255,255,.08);color:var(--text-tertiary)">Biomarker forecast will appear here after simulation.</div>'}
      </div>
      <div style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02)">
        <div style="font-size:12px;font-weight:700;color:var(--text)">Timeline</div>
        ${timeline.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-top:10px">
          ${timeline.map((point) => `<div style="padding:10px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)">
            <div style="font-size:11px;color:var(--text-tertiary)">Day ${_esc(point.day)}</div>
            <div class="bt-mono" style="font-size:15px;font-weight:700;color:${(_num(point.delta_symptom_score) || 0) <= 0 ? 'var(--teal)' : 'var(--amber)'};margin-top:6px">${(_num(point.delta_symptom_score) || 0) > 0 ? '+' : ''}${_esc(point.delta_symptom_score)}</div>
          </div>`).join('')}
        </div>` : '<div style="font-size:12px;color:var(--text-tertiary);margin-top:10px">No timecourse yet.</div>'}
      </div>
    </div>
  </div>`);
}

function _renderEvidencePanel(workspace, snapshot, findings) {
  const evidence = workspace.evidence;
  const question = evidence?.question || _autoResearchQuestion(snapshot, findings, _scenarioState());
  const papers = _toArray(evidence?.papers).slice(0, 8);
  return _card('Research And Evidence', `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
    <input id="brain-twin-evidence-q" class="bt-input" style="flex:1;min-width:260px" value="${_esc(question)}" placeholder="Ask a protocol or biomarker evidence question">
    <button class="btn btn-ghost btn-sm" onclick="window._brainTwinEvidence()">Search</button>
    <button class="btn btn-ghost btn-sm" onclick="window._brainTwinRunAutoResearch()">Auto</button>
  </div>
  <div style="font-size:12px;color:var(--text-tertiary);line-height:1.7;margin-bottom:12px">
    Every evidence result is context, not runtime truth. DeepTwin should expose provenance, ranking mode, and whether key modalities are missing before anyone acts on the research.
  </div>
  ${papers.length ? papers.map((paper) => `<div style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--text)">${_esc(paper.title || '(untitled)')}</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">${_esc([paper.journal, paper.year, paper.evidence_tier].filter(Boolean).join(' · '))}</div>
      </div>
      ${_pill(paper.evidence_tier || 'Paper', 'blue')}
    </div>
  </div>`).join('') : '<div style="font-size:12.5px;color:var(--text-tertiary)">No evidence results yet.</div>'}
  ${evidence?.notes?.length ? `<div style="font-size:12px;color:var(--text-tertiary);line-height:1.7;margin-top:10px">${_esc(evidence.notes.join(' '))}</div>` : ''}`);
}

function _renderReportStudio(reports) {
  return _card('Report Studio', `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
    <button class="btn btn-ghost btn-sm" onclick="window._brainTwinGenerateReports()">Generate drafts</button>
    ${reports.map((item) => `<button class="btn btn-ghost btn-sm" onclick="window._brainTwinOpenDraft('${_esc(item.id)}')">${_esc(item.title)}</button>`).join('')}
  </div>
  <div id="brain-twin-report-draft">${reports[0] ? _renderDraftBody(reports[0]) : '<div style="font-size:12.5px;color:var(--text-tertiary)">Generate a report draft from the current patient state, analysis, and scenario.</div>'}</div>`);
}

function _renderDraftBody(report) {
  return `<div style="padding:12px;border-radius:14px;border:1px solid rgba(74,158,255,.16);background:rgba(74,158,255,.06)">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
      <div style="font-size:14px;font-weight:700;color:var(--text)">${_esc(report.title)}</div>
      ${_pill('Draft', 'blue')}
    </div>
    <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.8;margin-top:10px">${_esc(report.body)}</div>
  </div>`;
}

function _renderTransparency() {
  return _card('Model Transparency', `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
    <div style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025)">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em">Provenance</div>
      <div style="font-size:12.5px;color:var(--text);line-height:1.7;margin-top:6px">Show source modality, timestamp, report lineage, and whether a clinician has reviewed the output.</div>
    </div>
    <div style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025)">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em">Uncertainty</div>
      <div style="font-size:12.5px;color:var(--text);line-height:1.7;margin-top:6px">Expose calibrated confidence and explain which missing modalities would most reduce uncertainty.</div>
    </div>
    <div style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025)">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em">Causation boundary</div>
      <div style="font-size:12.5px;color:var(--text);line-height:1.7;margin-top:6px">All causal outputs are ranked hypotheses. They must never be presented as proven treatment effects.</div>
    </div>
  </div>`);
}

function _renderWorkspace(setTopbar) {
  const patientId = _selectedPatientId();
  const workspace = _workspaceState();
  const context = workspace.context;
  const snapshot = context ? _buildSnapshot(context) : null;
  const findings = context ? _buildFindings(context, workspace.analysis) : [];
  const hypotheses = context ? _buildCrossModalHypotheses(context, workspace.analysis) : [];
  const reports = snapshot ? _buildReportDrafts(snapshot, findings, hypotheses, workspace.analysis, workspace.simulation) : [];
  const pairs = _buildPairRanking(workspace.analysis);

  setTopbar?.({
    title: 'Deeptwin',
    subtitle: patientId ? `${snapshot?.patientName || patientId} · unified multimodal workspace` : 'Select a patient to run DeepTwin',
    actions: [
      { label: 'Patients', onClick: () => window._nav('patients-v2') },
      { label: 'Patient Profile', onClick: () => { if (patientId) { window._selectedPatientId = patientId; window._profilePatientId = patientId; window._nav('patient-profile'); } } },
    ],
  });

  const element = document.getElementById('content');
  if (!element) return;
  if (!patientId) {
    element.innerHTML = `<div style="max-width:1300px;margin:0 auto;padding:18px 18px 32px">
      <div class="card" style="padding:18px">
        <div style="font-size:24px;font-weight:750;color:var(--text)">DeepTwin Command Workspace</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-top:12px">Select a patient first. DeepTwin aggregates qEEG, MRI, wearables, assessments, therapy logs, and medical record context into one investigation surface.</div>
      </div>
    </div>`;
    return;
  }
  element.innerHTML = `<div style="max-width:1380px;margin:0 auto;padding:18px 18px 36px">
    ${snapshot ? _renderHero(snapshot, findings, workspace) : `<div class="card" style="padding:18px">${spinner()}</div>`}
    <div class="bt-main-grid" style="margin-top:14px">
      <div style="display:grid;gap:14px">
        ${snapshot ? _renderSourceInventory(snapshot) : ''}
        ${snapshot ? _renderStateRail(snapshot, context) : ''}
      </div>
      <div style="display:grid;gap:14px">
        ${context ? _renderFindings(findings) : ''}
        ${context ? _renderHypotheses(hypotheses) : ''}
        ${_renderCorrelationPairs(pairs)}
        ${_renderSimulationLab(workspace)}
        ${snapshot ? _renderEvidencePanel(workspace, snapshot, findings) : ''}
        ${snapshot ? _renderReportStudio(reports) : ''}
        ${_renderTransparency()}
      </div>
    </div>
  </div>`;
}

function _injectStylesOnce() {
  if (window.__brainTwinStylesInjected) return;
  window.__brainTwinStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .bt-main-grid{display:grid;grid-template-columns:340px minmax(0,1fr);gap:14px}
    .bt-select,.bt-input{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:10px 12px;font-size:13px;width:100%}
    .bt-input::placeholder{color:var(--text-tertiary)}
    .bt-field{display:flex;flex-direction:column;gap:6px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary)}
    .bt-mono{font-family:var(--font-mono,'JetBrains Mono',monospace)}
    @media (max-width: 1100px){.bt-main-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

async function _refreshContext() {
  const patientId = _ensurePatientOrPrompt();
  if (!patientId) return;
  const workspace = _workspaceState();
  workspace.loadingContext = true;
  _renderWorkspace(window._brainTwinSetTopbar);
  try {
    workspace.context = await _loadPatientTwinContext(patientId);
    workspace.patient = workspace.context.patient;
  } finally {
    workspace.loadingContext = false;
    _renderWorkspace(window._brainTwinSetTopbar);
  }
}

async function _runAnalysis() {
  const patientId = _ensurePatientOrPrompt();
  if (!patientId) return;
  const workspace = _workspaceState();
  workspace.loadingAnalysis = true;
  _renderWorkspace(window._brainTwinSetTopbar);
  try {
    workspace.analysis = await api.brainTwinAnalyze(_analysisPayload(patientId));
  } catch (error) {
    workspace.analysis = { prediction: { executive_summary: `DeepTwin analysis failed: ${error?.message || error}`, prediction_band: 'Unavailable' } };
  } finally {
    workspace.loadingAnalysis = false;
    _renderWorkspace(window._brainTwinSetTopbar);
  }
}

async function _runSimulation() {
  const patientId = _ensurePatientOrPrompt();
  if (!patientId) return;
  const workspace = _workspaceState();
  workspace.loadingSimulation = true;
  _renderWorkspace(window._brainTwinSetTopbar);
  try {
    workspace.simulation = await api.brainTwinSimulate(_simulationPayload(patientId));
  } catch (error) {
    workspace.simulation = {
      engine: { name: 'error' },
      outputs: { clinical_forecast: { summary: `Simulation failed: ${error?.message || error}`, caveat: 'Check protocol structure and backend availability.' } },
    };
  } finally {
    workspace.loadingSimulation = false;
    _renderWorkspace(window._brainTwinSetTopbar);
  }
}

async function _runEvidence(question) {
  const patientId = _ensurePatientOrPrompt();
  if (!patientId) return;
  const workspace = _workspaceState();
  workspace.loadingEvidence = true;
  _renderWorkspace(window._brainTwinSetTopbar);
  try {
    workspace.evidence = await api.brainTwinEvidence({
      patient_id: patientId,
      question,
      modalities: _selectedModalities(),
      analysis_mode: window._brain_twin_mode || 'prediction',
      ranking_mode: 'clinical',
      limit: 8,
    });
  } catch (error) {
    workspace.evidence = { question, papers: [], notes: [`Evidence search failed: ${error?.message || error}`] };
  } finally {
    workspace.loadingEvidence = false;
    _renderWorkspace(window._brainTwinSetTopbar);
  }
}

async function _refreshAll() {
  await _refreshContext();
  await _runAnalysis();
}

function _wireHandlers(setTopbar) {
  window._brainTwinSetTopbar = setTopbar;
  window._brainTwinPickPatient = function () {
    if (window._showToast) window._showToast('Pick a patient from Patients, then return to Deeptwin.', 'info');
    window._nav('patients-v2');
  };
  window._brainTwinToggleModality = function (id, checked) {
    const current = new Set(_selectedModalities());
    if (checked) current.add(id); else current.delete(id);
    window._brain_twin_modalities = Array.from(current);
    _renderWorkspace(setTopbar);
  };
  window._brainTwinSetMode = function (mode) {
    window._brain_twin_mode = mode;
    _renderWorkspace(setTopbar);
  };
  window._brainTwinSetCombine = function (value) {
    window._brain_twin_combine = value;
  };
  window._brainTwinRefreshAll = _refreshAll;
  window._brainTwinRun = _runAnalysis;
  window._brainTwinSimulate = _runSimulation;
  window._brainTwinEvidence = function () {
    const input = document.getElementById('brain-twin-evidence-q');
    const workspace = _workspaceState();
    const snapshot = workspace.context ? _buildSnapshot(workspace.context) : null;
    const findings = workspace.context ? _buildFindings(workspace.context, workspace.analysis) : [];
    const question = (input?.value || '').trim() || (snapshot ? _autoResearchQuestion(snapshot, findings, _scenarioState()) : 'protocol evidence');
    _runEvidence(question);
  };
  window._brainTwinRunAutoResearch = function () {
    const workspace = _workspaceState();
    if (!workspace.context) return _refreshAll().then(() => window._brainTwinRunAutoResearch());
    const snapshot = _buildSnapshot(workspace.context);
    const findings = _buildFindings(workspace.context, workspace.analysis);
    const question = _autoResearchQuestion(snapshot, findings, _scenarioState());
    const input = document.getElementById('brain-twin-evidence-q');
    if (input) input.value = question;
    _runEvidence(question);
  };
  window._brainTwinGenerateReports = function () {
    const workspace = _workspaceState();
    if (!workspace.context) return;
    const snapshot = _buildSnapshot(workspace.context);
    const findings = _buildFindings(workspace.context, workspace.analysis);
    const hypotheses = _buildCrossModalHypotheses(workspace.context, workspace.analysis);
    workspace.reports = _buildReportDrafts(snapshot, findings, hypotheses, workspace.analysis, workspace.simulation);
    _renderWorkspace(setTopbar);
  };
  window._brainTwinOpenDraft = function (id) {
    const report = (_workspaceState().reports || []).find((item) => item.id === id);
    const element = document.getElementById('brain-twin-report-draft');
    if (report && element) element.innerHTML = _renderDraftBody(report);
  };
  window._brainTwinSetScenarioField = function (field, value) {
    const scenario = _scenarioState();
    const numericFields = new Set(['frequency_hz', 'sessions_per_day', 'sessions_per_week', 'weeks']);
    scenario[field] = numericFields.has(field) ? Number(value) : value;
  };
  window._brainTwinApplyPreset = function (id) {
    const preset = SIM_PRESETS[id];
    if (!preset) return;
    window._brain_twin_scenario = Object.assign({}, preset);
    _renderWorkspace(setTopbar);
  };
}

export async function pgBrainTwin(setTopbar, navigate) {
  _injectStylesOnce();
  window._brainTwinNavigate = navigate;
  _wireHandlers(setTopbar);
  if (_selectedPatientId() && !_workspaceState().context) {
    _refreshAll();
  }
  _renderWorkspace(setTopbar);
}
