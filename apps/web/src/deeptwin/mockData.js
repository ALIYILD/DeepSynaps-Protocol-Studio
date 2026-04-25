// DeepTwin demo seed.
//
// Activates when the API returns empty/synthetic shapes (or fails) so the
// page always renders fully in demo mode. Mirrors the patient-roster seed
// pattern in pages-clinical-hubs.js.

const PATIENTS = {
  'sarah-johnson': {
    name: 'Sarah Johnson', age: 32, sex: 'F',
    primary: 'ADHD (combined presentation)',
    secondary: ['Generalised anxiety', 'Sleep onset insomnia'],
    medications: ['atomoxetine 40mg daily'],
    contraindications: [],
  },
  'robert-kim': { name: 'Robert Kim', age: 41, sex: 'M', primary: 'Major depressive disorder', secondary: ['Chronic fatigue'], medications: [], contraindications: [] },
  'emma-clarke': { name: 'Emma Clarke', age: 28, sex: 'F', primary: 'PTSD', secondary: ['Sleep fragmentation'], medications: [], contraindications: [] },
  'david-nguyen': { name: 'David Nguyen', age: 36, sex: 'M', primary: 'Chronic pain', secondary: ['Mood low'], medications: [], contraindications: [] },
  'lucy-fernandez': { name: 'Lucy Fernandez', age: 24, sex: 'F', primary: 'Generalised anxiety', secondary: [], medications: [], contraindications: [] },
};

function patientKey(patientId) {
  const id = String(patientId || '').toLowerCase();
  if (id.includes('sarah')) return 'sarah-johnson';
  if (id.includes('robert')) return 'robert-kim';
  if (id.includes('emma')) return 'emma-clarke';
  if (id.includes('david')) return 'david-nguyen';
  if (id.includes('lucy')) return 'lucy-fernandez';
  return 'sarah-johnson';
}

export function getDemoPatientHeader(patientId) {
  return PATIENTS[patientKey(patientId)];
}

function seedRand(patientId, salt) {
  let h = 0;
  const s = String(patientId || 'demo') + ':' + salt;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  let x = Math.abs(h) || 1;
  return () => {
    x = (x * 1664525 + 1013904223) % 2147483647;
    return x / 2147483647;
  };
}

export function demoSummary(patientId) {
  const r = seedRand(patientId, 'sum');
  const sources = [
    { key: 'qeeg_features', label: 'qEEG features' },
    { key: 'assessments', label: 'Assessments' },
    { key: 'wearables', label: 'Wearables' },
    { key: 'in_clinic_therapy', label: 'In-clinic sessions' },
    { key: 'home_therapy', label: 'Home therapy' },
    { key: 'mri_structural', label: 'MRI structural' },
    { key: 'ehr_text', label: 'EHR text' },
    { key: 'video', label: 'Video' },
  ];
  const connected = []; const missing = [];
  for (const s of sources) {
    if (r() > 0.18) connected.push({ ...s, last_sync_days_ago: Math.floor(r() * 14) });
    else missing.push(s);
  }
  const pct = Math.round((connected.length / sources.length) * 1000) / 10;
  const risks = ['stable', 'watch', 'elevated'];
  return {
    patient_id: patientId,
    completeness_pct: pct,
    risk_status: risks[Math.floor(r() * 3)],
    last_updated: new Date().toISOString(),
    sources_connected: connected,
    sources_missing: missing,
    review_status: 'awaiting_clinician_review',
    warnings: missing.filter(m => m.key === 'qeeg_features' || m.key === 'assessments')
      .map(m => `Missing baseline for ${m.label} weakens predictions in this domain.`),
    disclaimer: 'Decision-support only. Twin estimates are model-derived hypotheses, not prescriptions. All outputs require clinician review.',
  };
}

const SIGNAL_SPECS = [
  ['qeeg', 'alpha_peak_hz', 'Hz', 9.6, 0.4],
  ['qeeg', 'theta_beta_ratio', 'ratio', 2.4, 0.3],
  ['qeeg', 'frontal_asymmetry_z', 'z', -0.4, 0.5],
  ['qeeg', 'global_zscore', 'z', 0.6, 0.4],
  ['assessments', 'phq9_total', 'score', 14.0, 3.0],
  ['assessments', 'gad7_total', 'score', 11.0, 2.5],
  ['assessments', 'asrs_total', 'score', 38.0, 5.0],
  ['biomarkers', 'hrv_rmssd_ms', 'ms', 38.0, 6.0],
  ['biomarkers', 'resting_hr_bpm', 'bpm', 72.0, 4.0],
  ['sleep_hrv_activity', 'sleep_total_min', 'min', 396.0, 35.0],
  ['sleep_hrv_activity', 'deep_sleep_min', 'min', 64.0, 10.0],
  ['sleep_hrv_activity', 'steps_per_day', 'steps', 6800.0, 1500.0],
  ['sessions', 'weekly_in_clinic', 'count', 3.0, 1.0],
  ['sessions', 'weekly_home', 'count', 2.5, 1.0],
  ['tasks_adherence', 'adherence_pct', 'pct', 78.0, 8.0],
  ['tasks_adherence', 'task_completion_pct', 'pct', 71.0, 10.0],
  ['notes_text', 'sentiment_score', '[-1,1]', -0.15, 0.2],
  ['notes_text', 'concern_flags_30d', 'count', 1.0, 1.0],
];

export function demoSignals(patientId) {
  const r = seedRand(patientId, 'sig');
  const signals = [];
  for (const [domain, name, unit, baseline, scale] of SIGNAL_SPECS) {
    const spark = [];
    let cur = baseline + (r() - 0.5) * scale * 0.8;
    for (let i = 0; i < 12; i++) {
      cur += (r() - 0.5) * scale * 0.3;
      spark.push(Math.round(cur * 1000) / 1000);
    }
    const current = spark[spark.length - 1];
    const n = 8 + Math.floor(r() * 52);
    const grade = n >= 30 ? (r() > 0.4 ? 'high' : 'moderate') : (n >= 6 ? 'moderate' : 'low');
    signals.push({
      domain, name, unit,
      baseline: Math.round(baseline * 1000) / 1000,
      current: Math.round(current * 1000) / 1000,
      delta: Math.round((current - baseline) * 1000) / 1000,
      sparkline: spark,
      n_observations: n,
      evidence_grade: grade,
    });
  }
  return { patient_id: patientId, signals };
}

const TIMELINE_KINDS = [
  ['session', 'tDCS Fp2 anodal, 20min'],
  ['session', 'PBM 810nm, 12min'],
  ['assessment', 'PHQ-9 follow-up'],
  ['assessment', 'ASRS follow-up'],
  ['qeeg', 'qEEG re-recording'],
  ['symptom', 'Patient reported brain-fog'],
  ['biometric', 'HRV dipped below baseline'],
  ['symptom', 'Patient reported improved focus'],
  ['session', 'Therapy notes added'],
  ['biometric', 'Sleep below 6h two nights'],
];

export function demoTimeline(patientId, days = 90) {
  const r = seedRand(patientId, 'tl');
  const events = [];
  const now = Date.now();
  const n = 18 + Math.floor(r() * 10);
  for (let i = 0; i < n; i++) {
    const [kind, label] = TIMELINE_KINDS[Math.floor(r() * TIMELINE_KINDS.length)];
    const offsetDays = Math.floor(r() * days);
    const ts = new Date(now - offsetDays * 86400000 - Math.floor(r() * 86400000)).toISOString();
    const sev = ['info', 'info', 'info', 'watch', 'warn'][Math.floor(r() * 5)];
    events.push({ ts, kind, label, severity: sev, ref: `evt_demo_${i}` });
  }
  events.sort((a, b) => a.ts.localeCompare(b.ts));
  return { patient_id: patientId, events, window_days: days };
}

export function demoCorrelations(patientId) {
  const r = seedRand(patientId, 'corr');
  const labels = ['sleep_total_min', 'hrv_rmssd_ms', 'phq9_total', 'gad7_total',
    'asrs_total', 'tbr_fz', 'alpha_peak_hz', 'adherence_pct', 'weekly_sessions', 'concern_flags_30d'];
  const m = labels.map(() => labels.map(() => Math.round((r() * 2 - 1) * 100) / 100));
  for (let i = 0; i < labels.length; i++) m[i][i] = 1.0;
  // mirror
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) m[j][i] = m[i][j];
  // inject realistic relationships
  m[0][2] = m[2][0] = -0.55; m[7][4] = m[4][7] = -0.45;
  const flat = [];
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      flat.push([Math.abs(m[i][j]), i, j]);
  flat.sort((a, b) => b[0] - a[0]);
  const cards = flat.slice(0, 8).map(([s, i, j]) => ({
    a: labels[i], b: labels[j],
    strength: m[i][j],
    abs_strength: Math.round(s * 1000) / 1000,
    confidence: Math.round(Math.min(0.95, 0.4 + s * 0.6) * 1000) / 1000,
    n_observations: 12 + Math.floor(r() * 28),
    evidence_grade: s > 0.5 ? 'moderate' : 'low',
    note: 'Correlation does not imply causation. Clinician interpretation required.',
  }));
  return {
    patient_id: patientId, method: 'pearson', labels, matrix: m, cards,
    hypotheses: demoHypotheses(patientId).hypotheses,
    warnings: ['These correlations are derived from this patient\'s own data and a small window; they are hypotheses for clinician review, not causal claims.'],
  };
}

export function demoHypotheses(patientId) {
  const r = seedRand(patientId, 'caus');
  return {
    patient_id: patientId,
    hypotheses: [
      { driver: 'Reduced sleep duration', outcome: 'Worsened attention scores',
        evidence_for: ['Within-patient correlation r ≈ -0.55 over 28 days', 'Multiple cohort studies report sleep–attention coupling'],
        evidence_against: ['Confounded by stress events on those nights', 'Caffeine intake not tracked'],
        missing_data: ['Sleep architecture (REM/Deep) limited to 6 nights'],
        confidence: 0.45 + r() * 0.15, evidence_grade: 'moderate', interpretation_required: true },
      { driver: 'tDCS Fp2 sessions', outcome: 'ASRS reduction',
        evidence_for: ['Within-patient ASRS −6 over 6-week protocol window', 'Small RCT support in adult ADHD'],
        evidence_against: ['No washout phase tested', 'Concurrent therapy adjustments could explain change'],
        missing_data: ['No sham comparator'],
        confidence: 0.40 + r() * 0.20, evidence_grade: 'low', interpretation_required: true },
      { driver: 'Home-program adherence drop', outcome: 'Re-emergence of anxiety',
        evidence_for: ['GAD-7 rose 4 points after adherence dipped below 60%'],
        evidence_against: ['Life-stressor reported same week (confound)'],
        missing_data: ['Adherence tracking gap of 9 days'],
        confidence: 0.35 + r() * 0.15, evidence_grade: 'low', interpretation_required: true },
    ],
  };
}

const HORIZON_DAYS = { '2w': 14, '6w': 42, '12w': 84 };

export function demoPrediction(patientId, horizon = '6w') {
  const days = HORIZON_DAYS[horizon] || 42;
  const r = seedRand(patientId, 'pred_' + horizon);
  const metrics = [
    ['attention_score', 100, -0.18],
    ['mood_score', 100, -0.12],
    ['sleep_total_min', 396, 0.6],
    ['qeeg_global_z', 0.6, -0.005],
    ['adherence_pct', 78, 0.05],
    ['risk_index', 0.42, -0.002],
  ];
  const traces = metrics.map(([name, baseline, drift]) => {
    const xs = [];
    for (let d = 0; d <= days; d += Math.max(1, Math.floor(days / 14))) xs.push(d);
    const point = []; const ci_low = []; const ci_high = [];
    let v = baseline;
    let prev = 0;
    for (const d of xs) {
      const dt = d - prev; prev = d;
      v = v + drift * dt + (r() - 0.5) * (Math.abs(baseline) * 0.005 + 0.05);
      const band = Math.abs(baseline) * 0.04 + 0.5 + d * Math.abs(baseline) * 0.0008;
      point.push(Math.round(v * 1000) / 1000);
      ci_low.push(Math.round((v - band) * 1000) / 1000);
      ci_high.push(Math.round((v + band) * 1000) / 1000);
    }
    return { metric: name, days: xs, point, ci_low, ci_high };
  });
  return {
    patient_id: patientId, horizon, horizon_days: days, traces,
    assumptions: [
      'Baseline phenotype remains stable.',
      'Adherence trend continues at recent 14-day average.',
      'No new contraindications introduced.',
      'Wearable sampling continuous.',
    ],
    evidence_grade: 'moderate', uncertainty_widens_with_horizon: true,
    disclaimer: 'Predictions are model-estimated. Confidence band is illustrative — clinician must review.',
  };
}

export function demoSimulation(patientId, params = {}) {
  const r = seedRand(patientId, 'sim_' + (params.scenario_id || params.modality || 'x'));
  const weeks = params.weeks || 5;
  const days = weeks * 7;
  const xs = [];
  for (let d = 0; d <= days; d += 7) xs.push(d);
  const baseDrift = { tdcs: -0.18, tms: -0.22, tacs: -0.15, ces: -0.10, pbm: -0.08,
    behavioural: -0.06, therapy: -0.05, medication: -0.20, lifestyle: -0.04 };
  let drift = baseDrift[params.modality] ?? -0.10;
  drift *= Math.max(0.4, Math.min(1.2, (params.adherence_assumption_pct || 80) / 80));
  const point = [], ci_low = [], ci_high = [];
  let v = 0;
  for (const d of xs) {
    v += drift + (r() - 0.5) * 0.1;
    const band = 0.6 + d * 0.012;
    point.push(Math.round(v * 1000) / 1000);
    ci_low.push(Math.round((v - band) * 1000) / 1000);
    ci_high.push(Math.round((v + band) * 1000) / 1000);
  }
  const safety = [];
  if ((params.contraindications || []).length) safety.push('Patient has flagged contraindications: ' + params.contraindications.join(', '));
  if (params.modality === 'tms' && params.frequency_hz > 20) safety.push('High-frequency rTMS — verify seizure-risk screening.');
  if ((params.duration_min || 20) > 30 && (params.modality === 'tdcs' || params.modality === 'tacs')) safety.push('Session duration above typical range — monitor skin tolerance.');
  if ((params.adherence_assumption_pct || 80) < 60) safety.push('Low adherence assumption — predicted effect highly uncertain.');
  if (!safety.length) safety.push('No automatic safety concerns flagged. Clinician review still required.');
  const expected = ({
    tdcs: ['attention', 'mood', 'qEEG alpha'],
    tms: ['mood', 'qEEG theta', 'executive function'],
    tacs: ['working memory', 'qEEG alpha'],
    ces: ['sleep', 'anxiety'],
    pbm: ['fatigue', 'mood'],
    behavioural: ['adherence', 'mood'],
    therapy: ['mood', 'behavioural activation'],
    medication: ['mood', 'attention'],
    lifestyle: ['sleep', 'HRV', 'mood'],
  }[params.modality]) || ['unspecified'];
  const responder = Math.min(0.85, Math.max(0.15, 0.55 - (r() - 0.5) * 0.2));
  return {
    patient_id: patientId,
    scenario_id: params.scenario_id || `scn_${params.modality || 'x'}_${params.target || 'Fp2'}_${weeks}w`,
    input: { ...params },
    predicted_curve: { x_days: xs, delta_outcome_score: point, ci_low, ci_high },
    expected_domains: expected,
    responder_probability: Math.round(responder * 1000) / 1000,
    non_responder_flag: responder < 0.35,
    safety_concerns: safety,
    missing_data: ['No sham comparator', 'Limited within-patient history (<60 days)'],
    monitoring_plan: [
      'Re-record qEEG at week 3 and week 5.',
      'Repeat target assessment at week 5.',
      'Track adherence weekly; escalate if <60%.',
      'Capture adverse events at every visit.',
    ],
    evidence_support: ['Within-patient baseline + cohort literature.', 'See Evidence panel for cited papers.'],
    evidence_grade: 'moderate',
    approval_required: true,
    labels: { simulation_only: true, not_a_prescription: true, model_estimated: true },
    disclaimer: 'Simulation only. Predicted trajectory is model-estimated, not a guaranteed effect. Clinician must approve before this becomes a treatment decision.',
  };
}

export const PRESET_SCENARIOS = [
  { id: 'fp2_10hz_5w', label: '10 Hz Fp2, 5×/week, 5 weeks', modality: 'tdcs', target: 'Fp2', frequency_hz: 10, current_ma: 2, duration_min: 20, sessions_per_week: 5, weeks: 5 },
  { id: 'sleep_plus45', label: 'Sleep +45 min/night, 4 weeks', modality: 'lifestyle', target: 'sleep', duration_min: 45, sessions_per_week: 7, weeks: 4 },
  { id: 'adherence_drop', label: 'Adherence drop 90 → 60%', modality: 'behavioural', target: 'adherence', adherence_assumption_pct: 60, sessions_per_week: 3, weeks: 4 },
  { id: 'home_tasks_4x', label: 'Home tasks 4×/week, 4 weeks', modality: 'behavioural', target: 'home_program', sessions_per_week: 4, weeks: 4 },
  { id: 'ces_3x', label: 'CES 3×/week, 6 weeks', modality: 'ces', target: 'mastoid', sessions_per_week: 3, weeks: 6, duration_min: 30 },
];
