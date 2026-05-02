import { isDemoSession } from './demo-session.js';

const DEMO_PATIENTS = Object.freeze([
  Object.freeze({
    id: 'demo-pt-samantha-li',
    name: 'Samantha Li',
    age: 33,
    sex: 'F',
    presenting: 'Major Depressive Disorder · 6mo persistent low mood, anhedonia',
  }),
  Object.freeze({
    id: 'demo-pt-marcus-chen',
    name: 'Marcus Chen',
    age: 40,
    sex: 'M',
    presenting: 'Generalized Anxiety Disorder · sleep-onset insomnia, somatic tension',
  }),
  Object.freeze({
    id: 'demo-pt-elena-vasquez',
    name: 'Elena Vasquez',
    age: 47,
    sex: 'F',
    presenting: 'Chronic pain (Fibromyalgia) · refractory to first-line pharmacology',
  }),
]);

export const DEMO_PATIENT_PERSONAS = DEMO_PATIENTS;

const _MRI = {
  ok: true,
  analysis_id: 'demo-mri-samantha-li',
  patient: { patient_id: 'demo-pt-samantha-li', name: 'Samantha Li', age: 33, sex: 'F' },
  acquired_at: '2026-04-22T09:14:00Z',
  modality: 'T1w + T2 FLAIR',
  scanner: 'Siemens Prisma 3T',
  qc: { snr_db: 32.4, motion_mm: 0.31, ghosting: 'minimal', usable: true },
  brain_age: { predicted_years: 35.2, chronological_years: 33, gap_years: 2.2, percentile: 58 },
  findings: [
    { id: 'f1', region: 'Right periventricular WM', type: 'T2-hyperintense focus', size_mm: 4.1, severity: 'mild', incidental: true, note: 'Likely chronic small-vessel change. Clinical correlation advised.' },
    { id: 'f2', region: 'Left frontal subcortical WM', type: 'Punctate FLAIR hyperintensity', size_mm: 2.6, severity: 'mild', incidental: true, note: 'Non-specific, stable on prior reads.' },
  ],
  volumetrics: {
    total_intracranial_cm3: 1456,
    grey_matter_cm3: 642,
    white_matter_cm3: 510,
    csf_cm3: 304,
    hippocampus_left_cm3: 3.41,
    hippocampus_right_cm3: 3.52,
    asymmetry_index: -0.016,
  },
  targets: [
    { id: 'tgt-dlpfc-l', region: 'L-DLPFC (BA46)', mni: [-44, 32, 28], modality: 'tps', confidence: 0.86, indication: 'MDD' },
    { id: 'tgt-acc',     region: 'ACC (BA32)',     mni: [-2,  36, 18], modality: 'tfus', confidence: 0.74, indication: 'MDD · adjunct' },
  ],
  literature_refs: [
    { title: 'Repetitive TPS for treatment-resistant depression: pilot RCT', year: 2024, journal: 'Brain Stimulation', doi: '10.1016/j.brs.2024.0001', pmid: 38000001 },
    { title: 'tFUS modulation of subgenual ACC in MDD', year: 2025, journal: 'Nat. Mental Health', doi: '10.1038/s44220-025-00012', pmid: 38000002 },
  ],
  clinical_disclaimer: 'Decision-support only. Findings are model outputs and require radiologist + clinician review.',
};

const _QEEG = {
  id: 'demo-qeeg-marcus-chen',
  analysis_status: 'completed',
  patient: { patient_id: 'demo-pt-marcus-chen', name: 'Marcus Chen', age: 40, sex: 'M' },
  original_filename: 'demo_marcus-chen_eyes-closed.edf',
  channels_used: 19,
  channel_count: 19,
  sample_rate_hz: 256,
  recording_duration_sec: 600,
  recording_date: '2026-04-29T11:02:00Z',
  amplifier_type: 'Generic-19ch',
  electrode_placement: '10-20 System',
  eyes_condition: 'closed',
  band_powers: {
    derived_ratios: {
      theta_beta_ratio: 4.12,
      theta_alpha_ratio: 1.21,
      delta_alpha_ratio: 1.38,
      alpha_peak_frequency_hz: 8.6,
      frontal_alpha_asymmetry: 0.21,
    },
  },
  summary: {
    headline: 'Slowed alpha peak (8.6 Hz) with elevated frontal theta — pattern often seen in chronic anxiety with sleep disturbance.',
    flags: [
      { level: 'amber', label: 'Alpha peak < 9 Hz', detail: 'Suggests reduced cortical arousal / poor sleep recovery.' },
      { level: 'amber', label: 'Frontal theta excess', detail: 'Theta/Beta 4.1 — adult norm < 2.5.' },
      { level: 'green', label: 'No epileptiform activity', detail: 'No spikes or sharp waves over 10 min EC.' },
    ],
  },
  protocol_recommendations: [
    { name: 'SMR uptraining at Cz', rationale: 'Improves sleep continuity in GAD with elevated arousal.', confidence: 'medium' },
    { name: 'Alpha/theta down-train F3–F4', rationale: 'Targets frontal theta excess; clinician-supervised.', confidence: 'medium' },
  ],
};

const _VOICE = {
  ok: true,
  analysis_id: 'demo-voice-elena-vasquez',
  clinical_disclaimer: 'Acoustic outputs are decision-support signals. Confirm clinically.',
  voice_report: {
    patient: { patient_id: 'demo-pt-elena-vasquez', name: 'Elena Vasquez' },
    qc: { snr_db: 28.6, clipping_pct: 0.4, voiced_ratio: 0.71, usable: true },
    pd_voice: {
      jitter_local_pct: 1.42,
      jitter_norm_max_pct: 1.04,
      shimmer_local_pct: 4.8,
      shimmer_norm_max_pct: 3.81,
      hnr_db: 17.9,
      hnr_norm_min_db: 20.0,
      f0_mean_hz: 198.4,
      flag: 'elevated_jitter_shimmer',
    },
    cognitive_speech: {
      speech_rate_wpm: 118,
      pause_ratio: 0.31,
      filled_pause_pct: 4.7,
      type_token_ratio: 0.46,
      flag: 'within_norms',
    },
    decision_support: {
      disclaimer: 'Decision-support only.',
      summary: 'Jitter and shimmer above the published normative ceiling; HNR slightly low. Pattern is non-specific but worth correlating with motor exam given the chronic-pain context.',
      evidence_packs: {
        'Acoustic biomarkers in chronic pain': {
          literature_summary: 'Several cross-sectional studies report increased perturbation measures (jitter, shimmer) in adults with chronic widespread pain, hypothesised to reflect autonomic dysregulation rather than primary laryngeal pathology.',
          supporting_papers: [
            { title: 'Vocal acoustic markers in fibromyalgia: a systematic review', doi: '10.1016/j.jvoice.2024.09.012' },
            { title: 'Jitter, shimmer and HNR in adults with chronic pain', doi: '10.1044/2025_jslhr-25-00091' },
            { title: 'Speech-rate slowing as a fatigue marker', doi: '10.1093/sleep/zsab015' },
          ],
        },
      },
      external_resources: [
        { label: 'NIH NIDCD — Voice disorders overview', url: 'https://www.nidcd.nih.gov/health/voice-disorders' },
        { label: 'GRBAS scale (clinician reference)', url: 'https://en.wikipedia.org/wiki/GRBAS_scale' },
      ],
    },
    provenance: { pipeline_version: 'demo-1.0.0', norm_db_version: '2025.04', schema_version: '1' },
  },
};

const _TEXT_NOTE = `Patient Marcus Chen, 40 y/o male (DOB 1985-07-22, MRN 998211), seen on 2026-04-30 in the Oxford clinic by Dr. Ali Yildirim.

Hx: GAD x4 years, sleep-onset insomnia, somatic tension. Currently on sertraline 100 mg PO daily and melatonin 3 mg qhs. BP 128/82, HR 78.

Plan: trial neurofeedback (SMR uptraining at Cz) x10 sessions; repeat GAD-7 in 4 weeks. Patient consented to research data sharing.

Contact: marcus.chen@example.com / +44 7700 900456.`;

const _TEXT = {
  source_text: _TEXT_NOTE,
  patient: { patient_id: 'demo-pt-marcus-chen', name: 'Marcus Chen' },
  analyze: {
    entities: [
      { text: 'Marcus Chen',                label: 'PERSON',       score: 0.99, start: 8,   end: 19 },
      { text: '40 y/o male',                label: 'DEMOGRAPHIC',  score: 0.94, start: 21,  end: 32 },
      { text: 'GAD',                        label: 'CONDITION',    score: 0.97, start: 173, end: 176 },
      { text: 'sleep-onset insomnia',       label: 'SYMPTOM',      score: 0.92, start: 188, end: 208 },
      { text: 'somatic tension',            label: 'SYMPTOM',      score: 0.88, start: 210, end: 225 },
      { text: 'sertraline 100 mg PO daily', label: 'MEDICATION',   score: 0.96, start: 250, end: 277 },
      { text: 'melatonin 3 mg qhs',         label: 'MEDICATION',   score: 0.95, start: 282, end: 300 },
      { text: 'BP 128/82',                  label: 'VITAL',        score: 0.91, start: 302, end: 311 },
      { text: 'HR 78',                      label: 'VITAL',        score: 0.93, start: 313, end: 318 },
      { text: 'neurofeedback',              label: 'INTERVENTION', score: 0.89, start: 343, end: 356 },
      { text: 'SMR uptraining at Cz',       label: 'INTERVENTION', score: 0.90, start: 358, end: 379 },
      { text: 'GAD-7',                      label: 'ASSESSMENT',   score: 0.96, start: 405, end: 410 },
    ],
  },
  pii: {
    pii_spans: [
      { text: 'Marcus Chen',           label: 'NAME',     score: 0.99 },
      { text: '1985-07-22',            label: 'DOB',      score: 0.99 },
      { text: '998211',                label: 'MRN',      score: 0.98 },
      { text: 'Dr. Ali Yildirim',      label: 'CLINICIAN', score: 0.95 },
      { text: 'marcus.chen@example.com', label: 'EMAIL',  score: 0.99 },
      { text: '+44 7700 900456',       label: 'PHONE',    score: 0.99 },
    ],
  },
  deidentify: {
    deidentified_text: `Patient [NAME], 40 y/o male (DOB [DATE], MRN [ID]), seen on [DATE] in the Oxford clinic by [CLINICIAN].

Hx: GAD x4 years, sleep-onset insomnia, somatic tension. Currently on sertraline 100 mg PO daily and melatonin 3 mg qhs. BP 128/82, HR 78.

Plan: trial neurofeedback (SMR uptraining at Cz) x10 sessions; repeat GAD-7 in 4 weeks. Patient consented to research data sharing.

Contact: [EMAIL] / [PHONE].`,
  },
};

const _RISK_PATIENTS = [
  {
    patient_id: 'demo-pt-samantha-li',
    patient_name: 'Samantha Li',
    worst_level: 'amber',
    categories: [
      { category: 'safety',                 level: 'green', confidence: 0.82 },
      { category: 'clinical_deterioration', level: 'amber', confidence: 0.71 },
      { category: 'medication',             level: 'green', confidence: 0.90 },
      { category: 'adherence',              level: 'amber', confidence: 0.66 },
      { category: 'engagement',             level: 'green', confidence: 0.78 },
      { category: 'wellbeing',              level: 'amber', confidence: 0.72 },
      { category: 'caregiver',              level: 'green', confidence: 0.85 },
      { category: 'logistics',              level: 'green', confidence: 0.88 },
    ],
  },
  {
    patient_id: 'demo-pt-marcus-chen',
    patient_name: 'Marcus Chen',
    worst_level: 'red',
    categories: [
      { category: 'safety',                 level: 'red',   confidence: 0.61 },
      { category: 'clinical_deterioration', level: 'amber', confidence: 0.69 },
      { category: 'medication',             level: 'amber', confidence: 0.74 },
      { category: 'adherence',              level: 'green', confidence: 0.83 },
      { category: 'engagement',             level: 'amber', confidence: 0.70 },
      { category: 'wellbeing',              level: 'amber', confidence: 0.68 },
      { category: 'caregiver',              level: 'green', confidence: 0.81 },
      { category: 'logistics',              level: 'green', confidence: 0.86 },
    ],
  },
  {
    patient_id: 'demo-pt-elena-vasquez',
    patient_name: 'Elena Vasquez',
    worst_level: 'green',
    categories: [
      { category: 'safety',                 level: 'green', confidence: 0.91 },
      { category: 'clinical_deterioration', level: 'green', confidence: 0.84 },
      { category: 'medication',             level: 'green', confidence: 0.88 },
      { category: 'adherence',              level: 'green', confidence: 0.92 },
      { category: 'engagement',             level: 'green', confidence: 0.87 },
      { category: 'wellbeing',              level: 'amber', confidence: 0.69 },
      { category: 'caregiver',              level: 'green', confidence: 0.85 },
      { category: 'logistics',              level: 'green', confidence: 0.90 },
    ],
  },
];

function _riskCategoryDetails(patient) {
  return patient.categories.map((c) => {
    const base = {
      category: c.category,
      level: c.level,
      computed_level: c.level,
      confidence: c.confidence,
      override_level: null,
      data_sources: ['demo_fixture'],
      evidence_refs: [],
      rationale: '',
    };
    if (c.category === 'safety' && c.level === 'red') {
      base.evidence_refs = ['PHQ-9 item 9 endorsed (passive ideation)', 'No active plan documented'];
      base.rationale = 'PHQ-9 item 9 endorsed at last self-report. Triage and same-day clinician contact recommended.';
    } else if (c.category === 'wellbeing' && c.level === 'amber') {
      base.evidence_refs = ['Sleep diary <6h x5 nights', 'Self-reported fatigue 7/10'];
      base.rationale = 'Sub-threshold sleep duration with elevated fatigue ratings.';
    } else if (c.category === 'medication' && c.level === 'amber') {
      base.evidence_refs = ['Pharmacy refill gap 9 days', 'Self-reported partial adherence'];
      base.rationale = 'Refill cadence inconsistent with prescribed regimen.';
    } else if (c.category === 'adherence' && c.level === 'amber') {
      base.evidence_refs = ['Home program 3/7 sessions last week', 'Missed scheduled visit on 2026-04-21'];
      base.rationale = 'Home program completion below 60% target.';
    } else if (c.category === 'clinical_deterioration' && c.level === 'amber') {
      base.evidence_refs = ['PHQ-9 +3 vs prior', 'GAD-7 +2 vs prior'];
      base.rationale = 'Symptom rating scales trending upward over the last 2 weeks.';
    } else if (c.level === 'green') {
      base.evidence_refs = ['Within expected ranges'];
      base.rationale = 'No risk indicators above threshold for this category.';
    }
    return base;
  });
}

function _riskProfile(patientId) {
  const p = _RISK_PATIENTS.find((x) => x.patient_id === patientId) || _RISK_PATIENTS[0];
  return {
    patient_id: p.patient_id,
    patient_name: p.patient_name,
    computed_at: '2026-05-02T07:30:00Z',
    categories: _riskCategoryDetails(p),
  };
}

function _riskAudit(patientId) {
  if (patientId === 'demo-pt-marcus-chen') {
    return {
      patient_id: patientId,
      items: [
        { category: 'safety', previous_level: 'amber', new_level: 'red', trigger: 'phq9_item9_positive', created_at: '2026-05-01T16:42:00Z' },
        { category: 'medication', previous_level: 'green', new_level: 'amber', trigger: 'pharmacy_refill_gap', created_at: '2026-04-29T08:11:00Z' },
        { category: 'clinical_deterioration', previous_level: 'green', new_level: 'amber', trigger: 'gad7_delta_positive', created_at: '2026-04-25T10:03:00Z' },
      ],
    };
  }
  if (patientId === 'demo-pt-samantha-li') {
    return {
      patient_id: patientId,
      items: [
        { category: 'wellbeing', previous_level: 'green', new_level: 'amber', trigger: 'sleep_diary_low', created_at: '2026-04-30T07:05:00Z' },
        { category: 'adherence', previous_level: 'green', new_level: 'amber', trigger: 'home_program_below_target', created_at: '2026-04-28T19:22:00Z' },
      ],
    };
  }
  return { patient_id: patientId, items: [] };
}

const _RISK = {
  clinic_summary: {
    computed_at: '2026-05-02T07:30:00Z',
    patient_count: _RISK_PATIENTS.length,
    patients: _RISK_PATIENTS,
  },
  patient_profile: _riskProfile,
  patient_audit: _riskAudit,
};

const _BIOMETRICS = {
  patient: { patient_id: 'demo-pt-elena-vasquez', name: 'Elena Vasquez' },
  window_days: 7,
  generated_at: '2026-05-02T06:00:00Z',
  summary: {
    sleep_hours_avg: 6.1,
    sleep_efficiency_pct: 78,
    resting_hr_avg: 71,
    hrv_rmssd_ms_avg: 32.8,
    spo2_avg_pct: 96.4,
    steps_avg: 4820,
    flags: [
      { level: 'amber', label: 'Sleep duration below 7h target', detail: '5 of 7 nights under target.' },
      { level: 'green', label: 'SpO2 stable', detail: 'No nocturnal desaturation events.' },
    ],
  },
  series: {
    sleep_hours: [5.4, 6.2, 6.8, 5.9, 6.4, 5.7, 7.1],
    resting_hr:  [72,  71,  70,  73,  71,  70,  72],
    hrv_rmssd:   [29,  31,  35,  30,  33,  34,  37],
    steps:       [4200, 5100, 4800, 4900, 5200, 4400, 5100],
  },
};

const _VIDEO = {
  patient: { patient_id: 'demo-pt-samantha-li', name: 'Samantha Li' },
  session_id: 'demo-video-samantha-li-001',
  captured_at: '2026-04-29T14:18:00Z',
  tasks_completed: 5,
  tasks_skipped: 0,
  tasks_needing_repeat: 0,
  review_completion_percent: 100,
  safety_flags: [],
  notes: 'All 5 guided tasks captured cleanly. Clinician review complete.',
};

/** Digital Phenotyping Analyzer — mirrors apps/api stub payload shape (v1). */
function _digitalPhenotypingPayload(patientId) {
  const now = '2026-05-02T12:00:00Z';
  const start = '2026-04-04T12:00:00Z';
  const name =
    DEMO_PATIENTS.find((p) => p.id === patientId)?.name || 'Patient';
  return {
    schema_version: '1.0.0',
    clinical_disclaimer:
      'Decision-support only. Passive phone data do not diagnose a disorder. '
      + 'Signals are behavioral indicators that require clinical correlation.',
    generated_at: now,
    patient_id: patientId,
    patient_display_name: name,
    analysis_window: { start, end: now, timezone: 'UTC' },
    provenance: {
      source_system: 'demo_fixture',
      ingest_batch_id: null,
      feature_pipeline_version: '0.1.0-demo',
    },
    audit_summary: {
      last_computed_at: now,
      recompute_job_id: null,
      data_pipeline_version: '0.1.0-demo',
    },
    snapshot: {
      computed_at: now,
      mobility_stability: { value: 0.72, confidence: 0.78, completeness: 0.81, baseline_comparison: 'within', privacy_sensitivity_level: 'medium' },
      routine_regularity: { value: 0.61, confidence: 0.65, completeness: 0.81, baseline_comparison: 'below', privacy_sensitivity_level: 'low' },
      screen_time_pattern: { value: 1.12, confidence: 0.52, completeness: 0.81, baseline_comparison: 'above', privacy_sensitivity_level: 'medium' },
      sleep_timing_proxy: { value: 0.88, confidence: 0.71, completeness: 0.81, baseline_comparison: 'within', privacy_sensitivity_level: 'medium' },
      sociability_proxy: { value: 0.55, confidence: 0.60, completeness: 0.55, baseline_comparison: 'below', privacy_sensitivity_level: 'high' },
      activity_level: { value: 0.70, confidence: 0.80, completeness: 0.81, baseline_comparison: 'within', privacy_sensitivity_level: 'low' },
      anomaly_score: { value: 0.38, confidence: 0.55, completeness: 0.81, baseline_comparison: 'above', privacy_sensitivity_level: 'low' },
      data_completeness: { value: 0.81, confidence: 0.95, completeness: 1, baseline_comparison: 'within', privacy_sensitivity_level: 'low' },
    },
    domains: [
      {
        signal_domain: 'screen_use',
        collection_modalities: ['screen_events'],
        source_types: ['passive'],
        window_end: now,
        completeness: 0.81,
        summary_stats: { hours_daily_avg: 4.0, late_night_pct: 18 },
        trend: 'unclear',
        linked_analyzers_impacted: [],
      },
      {
        signal_domain: 'location_mobility',
        collection_modalities: ['gps'],
        source_types: ['passive'],
        window_end: now,
        completeness: 0.74,
        summary_stats: { radius_km_typical: 4.2, entropy_index: 0.68 },
        trend: 'unclear',
        linked_analyzers_impacted: [],
      },
      {
        signal_domain: 'physical_activity',
        collection_modalities: ['steps'],
        source_types: ['passive'],
        window_end: now,
        completeness: 0.88,
        summary_stats: { steps_daily_avg: 4980 },
        trend: 'unclear',
        linked_analyzers_impacted: [],
      },
      {
        signal_domain: 'sleep_proxy',
        collection_modalities: ['screen_off', 'motion'],
        source_types: ['hybrid'],
        window_end: now,
        completeness: 0.79,
        summary_stats: { bedtime_variability_min: 88 },
        trend: 'unclear',
        linked_analyzers_impacted: [],
      },
      {
        signal_domain: 'social_communication',
        collection_modalities: ['communication_meta'],
        source_types: ['passive'],
        window_end: now,
        completeness: 0.45,
        summary_stats: { note: 'Not enabled in demo consent profile' },
        trend: 'unclear',
        linked_analyzers_impacted: [],
      },
      {
        signal_domain: 'device_engagement',
        collection_modalities: ['unlock_count'],
        source_types: ['passive'],
        window_end: now,
        completeness: 0.81,
        summary_stats: { unlocks_daily_avg: 79 },
        trend: 'unclear',
        linked_analyzers_impacted: [],
      },
      {
        signal_domain: 'ema_active',
        collection_modalities: ['ema'],
        source_types: ['active'],
        window_end: now,
        completeness: 0.72,
        summary_stats: { ema_completion_pct: 72 },
        trend: 'unclear',
        linked_analyzers_impacted: [],
      },
    ],
    baseline_profile: {
      estimated_at: '2026-04-25T12:00:00Z',
      valid_from: start,
      baseline_window_days: 28,
      method: 'robust_stats_demo',
      confidence: 0.58,
      feature_summaries: {
        screen_hours_daily: { median: 3.6, iqr: 1.1 },
        steps_daily: { median: 5400, iqr: 1200 },
        routine_index: { median: 0.68, iqr: 0.12 },
      },
      weekday_weekend_delta: { screen_hours: 0.35, steps: -820 },
    },
    deviations: [
      {
        event_id: 'demo-dev-1',
        detected_at: '2026-04-30T08:00:00Z',
        window: { start: '2026-04-27T08:00:00Z', end: '2026-04-30T08:00:00Z' },
        signal_domain: 'screen_use',
        deviation_type: 'short_term_spike',
        severity: 'medium',
        urgency: 'soon',
        confidence: 0.52,
        summary: 'Late-night screen use increased vs personal baseline.',
        linked_analyzers_impacted: ['risk:wellbeing', 'risk:engagement'],
      },
    ],
    clinical_flags: [
      {
        flag_id: 'demo-cf-1',
        raised_at: '2026-05-01T10:00:00Z',
        category: 'sleep_disruption',
        statement_type: 'behavioral_indicator',
        severity: 'low',
        urgency: 'routine',
        confidence: 0.49,
        label: 'Possible sleep timing instability (proxy)',
        detail:
          'Bedtime variability increased versus baseline. Interpret with sleep diary or wearable sleep staging when available.',
        caveats: ['Sleep proxy only — not polysomnography.', 'Completeness 81% this window.'],
        evidence_refs: ['sleep_timing_proxy_deviation', 'registry:sleep_circadian'],
      },
    ],
    recommendations: [
      {
        id: 'demo-rec-1',
        priority: 'P1',
        title: 'Cross-check with Biometrics / Assessments',
        detail: 'Compare passive sleep proxy with wearable sleep and recent PHQ/GAD scores.',
        action_type: 'review_assessment',
        targets: ['wearables', 'assessments-v2'],
        confidence: 0.55,
      },
    ],
    multimodal_links: [
      { nav_page_id: 'research-evidence', title: 'Research Evidence', relevance_note: '87K+ papers — digital phenotyping / passive sensing', last_updated: '—' },
      { nav_page_id: 'qeeg-analysis', title: 'qEEG Analyzer', relevance_note: 'Neurophysiology context', last_updated: '—' },
      { nav_page_id: 'assessments-v2', title: 'Assessments', relevance_note: 'Last GAD-7 within analysis window', last_updated: '2026-04-28' },
      { nav_page_id: 'wearables', title: 'Biometrics', relevance_note: 'Sleep + resting HR trends', last_updated: '2026-05-01' },
      { nav_page_id: 'risk-analyzer', title: 'Risk Analyzer', relevance_note: 'Wellbeing + engagement context', last_updated: '2026-05-02' },
      { nav_page_id: 'session-execution', title: 'Session execution', relevance_note: 'Treatment session capture', last_updated: '—' },
      { nav_page_id: 'live-session', title: 'Virtual Care', relevance_note: 'Telehealth sessions', last_updated: '—' },
      { nav_page_id: 'protocol-studio', title: 'Protocol Studio', relevance_note: 'Active protocol for this patient', last_updated: '—' },
      { nav_page_id: 'deeptwin', title: 'DeepTwin', relevance_note: 'Multimodal 360° view', last_updated: '—' },
      { nav_page_id: 'ai-agent-v2', title: 'AI Practice Agents', relevance_note: 'Agent-assisted workflows', last_updated: '—' },
      { nav_page_id: 'voice-analyzer', title: 'Voice Analyzer', relevance_note: 'Optional: acoustic fatigue markers', last_updated: '—' },
      { nav_page_id: 'video-assessments', title: 'Video', relevance_note: 'Session-based tasks', last_updated: '—' },
      { nav_page_id: 'text-analyzer', title: 'Clinical Text', relevance_note: 'Recent notes', last_updated: '—' },
    ],
    consent_state: {
      updated_at: '2026-04-02T12:00:00Z',
      consent_scope_version: '2026.04',
      domains_enabled: {
        screen_use: true,
        location_mobility: true,
        physical_activity: true,
        sleep_proxy: true,
        social_communication: false,
        device_engagement: true,
        ema_active: true,
      },
      retention_summary_days: 365,
      visibility_note: 'Clinic care team per organization policy (demo).',
    },
    audit_events: [
      { event_id: 'demo-aud-1', timestamp: '2026-05-02T09:00:00Z', action: 'view', actor_role: 'clinician', summary: 'Page payload viewed (demo)' },
    ],
  };
}

export function demoDigitalPhenotypingPayload(patientId) {
  return _digitalPhenotypingPayload(patientId);
}

export const ANALYZER_DEMO_FIXTURES = Object.freeze({
  patients: DEMO_PATIENTS,
  mri: _MRI,
  qeeg: _QEEG,
  voice: _VOICE,
  text: _TEXT,
  risk: _RISK,
  biometrics: _BIOMETRICS,
  video: _VIDEO,
  digitalPhenotyping: { payload: _digitalPhenotypingPayload },
});

export function isFixtureFallbackActive() {
  return isDemoSession();
}

export const DEMO_FIXTURE_BANNER_HTML =
  '<div class="notice notice-info" data-demo-fixture-banner role="note" style="margin-bottom:14px;font-size:12px">'
  + '<strong>Demo data</strong> — sign in with a real account to see your clinic’s results.'
  + '</div>';

export default ANALYZER_DEMO_FIXTURES;
