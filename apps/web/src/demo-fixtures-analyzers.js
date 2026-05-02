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

const _MED_PATIENT_REGIMENS = {
  'demo-pt-samantha-li': [
    { id: 'demo-med-sam-1', patient_id: 'demo-pt-samantha-li', name: 'Sertraline',  generic_name: 'sertraline',  dose: '100 mg', frequency: 'once daily',   route: 'PO', prescriber: 'Dr. A. Yildirim', started_at: '2025-11-04', active: true },
    { id: 'demo-med-sam-2', patient_id: 'demo-pt-samantha-li', name: 'Tramadol',    generic_name: 'tramadol',    dose: '50 mg',  frequency: 'twice daily',  route: 'PO', prescriber: 'Dr. A. Yildirim', started_at: '2026-03-21', active: true },
    { id: 'demo-med-sam-3', patient_id: 'demo-pt-samantha-li', name: 'Melatonin',   generic_name: 'melatonin',   dose: '3 mg',   frequency: 'at bedtime',   route: 'PO', prescriber: 'Self-initiated',  started_at: '2026-02-12', active: true },
  ],
  'demo-pt-marcus-chen': [
    { id: 'demo-med-mar-1', patient_id: 'demo-pt-marcus-chen', name: 'Sertraline',  generic_name: 'sertraline',  dose: '100 mg', frequency: 'once daily',   route: 'PO', prescriber: 'Dr. A. Yildirim', started_at: '2025-09-02', active: true },
    { id: 'demo-med-mar-2', patient_id: 'demo-pt-marcus-chen', name: 'Melatonin',   generic_name: 'melatonin',   dose: '3 mg',   frequency: 'at bedtime',   route: 'PO', prescriber: 'Dr. A. Yildirim', started_at: '2026-01-15', active: true },
    { id: 'demo-med-mar-3', patient_id: 'demo-pt-marcus-chen', name: 'Bupropion',   generic_name: 'bupropion',   dose: '150 mg', frequency: 'once daily',   route: 'PO', prescriber: 'Dr. A. Yildirim', started_at: '2026-02-08', active: true },
  ],
  'demo-pt-elena-vasquez': [
    { id: 'demo-med-ele-1', patient_id: 'demo-pt-elena-vasquez', name: 'Warfarin',     generic_name: 'warfarin',     dose: '5 mg',  frequency: 'once daily',  route: 'PO', prescriber: 'Dr. R. Patel',     started_at: '2024-06-19', active: true },
    { id: 'demo-med-ele-2', patient_id: 'demo-pt-elena-vasquez', name: 'Ibuprofen',    generic_name: 'ibuprofen',    dose: '400 mg', frequency: 'three times daily', route: 'PO', prescriber: 'Self-initiated', started_at: '2026-04-08', active: true },
    { id: 'demo-med-ele-3', patient_id: 'demo-pt-elena-vasquez', name: 'Amitriptyline',generic_name: 'amitriptyline',dose: '25 mg',  frequency: 'at bedtime',  route: 'PO', prescriber: 'Dr. A. Yildirim', started_at: '2025-12-01', active: true },
    { id: 'demo-med-ele-4', patient_id: 'demo-pt-elena-vasquez', name: 'Pregabalin',   generic_name: 'pregabalin',   dose: '75 mg',  frequency: 'twice daily', route: 'PO', prescriber: 'Dr. A. Yildirim', started_at: '2025-10-12', active: true },
  ],
};

const _MED_INTERACTION_RESULTS = {
  'demo-pt-samantha-li': {
    medications_checked: ['Sertraline', 'Tramadol', 'Melatonin'],
    interactions: [
      {
        drugs: ['sertraline', 'tramadol'],
        severity: 'moderate',
        description: 'Co-administration of an SSRI with tramadol increases the risk of serotonin syndrome via additive serotonergic activity.',
        recommendation: 'Monitor for tremor, hyperreflexia, agitation, hyperthermia. Consider non-opioid analgesia or reduce tramadol dose; counsel patient on warning signs.',
      },
    ],
    severity_summary: 'moderate',
  },
  'demo-pt-marcus-chen': {
    medications_checked: ['Sertraline', 'Melatonin'],
    interactions: [],
    severity_summary: 'none',
  },
  'demo-pt-elena-vasquez': {
    medications_checked: ['Warfarin', 'Ibuprofen', 'Amitriptyline', 'Pregabalin'],
    interactions: [
      {
        drugs: ['warfarin', 'ibuprofen'],
        severity: 'severe',
        description: 'NSAIDs displace warfarin from plasma protein binding and inhibit platelet aggregation, substantially increasing major-bleed risk (GI and intracranial).',
        recommendation: 'Stop ibuprofen. Switch to paracetamol or topical NSAID. If continued use is unavoidable, add gastroprotection and re-check INR within 3–5 days.',
      },
      {
        drugs: ['amitriptyline', 'pregabalin'],
        severity: 'mild',
        description: 'Additive CNS depression and anticholinergic load; modest increase in sedation, dizziness, and falls risk in older adults.',
        recommendation: 'Counsel on driving / fall risk. Review necessity of both agents for chronic pain; consider tapering one if symptom control allows.',
      },
    ],
    severity_summary: 'severe',
  },
};

const _MED_INTERACTION_LOG = [
  {
    id: 'demo-med-log-1',
    patient_id: 'demo-pt-elena-vasquez',
    patient_name: 'Elena Vasquez',
    medications_checked: ['Warfarin', 'Ibuprofen', 'Amitriptyline', 'Pregabalin'],
    interactions_found: _MED_INTERACTION_RESULTS['demo-pt-elena-vasquez'].interactions,
    severity_summary: 'severe',
    created_at: '2026-05-02T07:42:00Z',
  },
  {
    id: 'demo-med-log-2',
    patient_id: 'demo-pt-samantha-li',
    patient_name: 'Samantha Li',
    medications_checked: ['Sertraline', 'Tramadol', 'Melatonin'],
    interactions_found: _MED_INTERACTION_RESULTS['demo-pt-samantha-li'].interactions,
    severity_summary: 'moderate',
    created_at: '2026-05-01T15:18:00Z',
  },
  {
    id: 'demo-med-log-3',
    patient_id: 'demo-pt-marcus-chen',
    patient_name: 'Marcus Chen',
    medications_checked: ['Sertraline', 'Melatonin'],
    interactions_found: [],
    severity_summary: 'none',
    created_at: '2026-04-30T11:02:00Z',
  },
];

function _medPatientMedications(patientId) {
  return _MED_PATIENT_REGIMENS[patientId] || [];
}

const _MED_PATIENT_ACTIVE_PROTOCOLS = {
  'demo-pt-samantha-li': {
    id: 'demo-protocol-sam-tdcs',
    patient_id: 'demo-pt-samantha-li',
    protocol_name: 'Anodal tDCS · L-DLPFC for MDD',
    modality: 'tdcs',
    target_region: 'L-DLPFC (F3)',
    session_frequency: '5×/week',
    duration: '4 weeks',
    status: 'active',
    created_at: '2026-04-12T10:14:00Z',
  },
  'demo-pt-marcus-chen': {
    id: 'demo-protocol-mar-rtms',
    patient_id: 'demo-pt-marcus-chen',
    protocol_name: '10 Hz rTMS · L-DLPFC for treatment-resistant anxiety / depression',
    modality: 'rtms',
    target_region: 'L-DLPFC (BA46)',
    session_frequency: '5×/week',
    duration: '6 weeks',
    status: 'active',
    created_at: '2026-04-22T09:31:00Z',
  },
  'demo-pt-elena-vasquez': {
    id: 'demo-protocol-ele-ect',
    patient_id: 'demo-pt-elena-vasquez',
    protocol_name: 'Bilateral ECT for refractory chronic-pain–associated severe depression',
    modality: 'ect',
    target_region: 'Bifrontal',
    session_frequency: '3×/week',
    duration: '3 weeks',
    status: 'active',
    created_at: '2026-04-18T08:02:00Z',
  },
};

function _medActiveProtocol(patientId) {
  const proto = _MED_PATIENT_ACTIVE_PROTOCOLS[patientId];
  return proto ? { items: [proto] } : { items: [] };
}

function _medCheckInteractions(patientId, names) {
  const seeded = _MED_INTERACTION_RESULTS[patientId];
  if (seeded) {
    return {
      medications_checked: names && names.length ? names : seeded.medications_checked,
      interactions: seeded.interactions,
      severity_summary: seeded.severity_summary,
    };
  }
  return {
    medications_checked: names || [],
    interactions: [],
    severity_summary: 'none',
  };
}

const _MEDICATION = {
  patient_medications: _medPatientMedications,
  check_interactions: _medCheckInteractions,
  interaction_log: _MED_INTERACTION_LOG,
  active_protocol: _medActiveProtocol,
};

function _tsBuildSessions(prefix, total, completed, options) {
  const opts = options || {};
  const baseDate = new Date(opts.startISO || '2026-02-05T09:00:00Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const cadenceDays = opts.cadenceDays || 2;
  const out = [];
  for (let i = 0; i < completed; i += 1) {
    const flagAE = (opts.aeIndices || []).includes(i + 1);
    const flagDeviation = (opts.deviationIndices || []).includes(i + 1);
    const unsigned = (opts.unsignedIndices || []).includes(i + 1);
    const scheduled = new Date(baseDate + i * cadenceDays * dayMs).toISOString();
    out.push({
      id: `demo-${prefix}-s${i + 1}`,
      session_number: i + 1,
      scheduled_at: scheduled,
      intensity_label: opts.intensity || '—',
      duration_minutes: flagDeviation && opts.deviationDuration ? opts.deviationDuration : (opts.duration || 20),
      comfort_score: flagAE ? 4 : (opts.comfort || 8),
      signed: !unsigned,
      has_ae: flagAE,
      modality: opts.modality || '',
      telemetry_summary: opts.telemetry || 'Within prescribed envelope.',
      impedance_summary: opts.impedance || 'All electrodes < 10 kΩ.',
      comfort_summary: flagAE ? 'Patient reported tingling and brief headache (NRS-SE 4).' : 'Tolerated well, NRS-SE within target.',
      ae_log: flagAE ? 'Mild headache resolved within 30 min, no escalation.' : '',
    });
  }
  return out;
}

const _TS_DETAIL = {
  'demo-pt-samantha-li': () => {
    const sessions = _tsBuildSessions('sam', 24, 18, {
      modality: 'tDCS', intensity: '2 mA · 20 min · F3-anodal',
      duration: 20, comfort: 9, cadenceDays: 2, startISO: '2026-02-05T09:30:00Z',
    });
    return {
      course: {
        id: 'demo-course-sam-tdcs', patient_id: 'demo-pt-samantha-li', patient_name: 'Samantha Li',
        protocol_name: 'Anodal tDCS · L-DLPFC for MDD', modality: 'tDCS', target_site: 'L-DLPFC (F3)',
        total_sessions: 24, completed_sessions: 18, adherence_pct: 92,
        current_week: 9, total_weeks: 12, started_at: '2026-02-05T09:30:00Z',
      },
      sessions,
      summary: { signed_count: 18, delivered_count: 18 },
      deviations: [],
      outcomes: { scale: 'PHQ-9', scores: [14, 13, 12, 11, 10, 9, 8, 7, 7, 6, 6] },
    };
  },
  'demo-pt-marcus-chen': () => {
    const sessions = _tsBuildSessions('mar', 30, 8, {
      modality: 'rTMS', intensity: '120% rMT · 10 Hz · 3000 pulses',
      duration: 38, comfort: 7, cadenceDays: 2, startISO: '2026-04-05T10:00:00Z',
      aeIndices: [4], unsignedIndices: [7, 8],
    });
    return {
      course: {
        id: 'demo-course-mar-rtms', patient_id: 'demo-pt-marcus-chen', patient_name: 'Marcus Chen',
        protocol_name: '10 Hz rTMS · L-DLPFC', modality: 'rTMS', target_site: 'L-DLPFC (BA46)',
        total_sessions: 30, completed_sessions: 8, adherence_pct: 75,
        current_week: 4, total_weeks: 6, started_at: '2026-04-05T10:00:00Z',
      },
      sessions,
      summary: { signed_count: 6, delivered_count: 8 },
      deviations: [],
      outcomes: { scale: 'HAM-A', scores: [22, 22, 21, 21, 20] },
    };
  },
  'demo-pt-elena-vasquez': () => {
    const sessions = _tsBuildSessions('ele', 12, 6, {
      modality: 'ECT', intensity: '1.5× ST · brief-pulse bifrontal',
      duration: 8, comfort: 8, cadenceDays: 3, startISO: '2026-04-15T08:00:00Z',
      deviationIndices: [4], deviationDuration: 11,
    });
    return {
      course: {
        id: 'demo-course-ele-ect', patient_id: 'demo-pt-elena-vasquez', patient_name: 'Elena Vasquez',
        protocol_name: 'Bilateral ECT · refractory depression in chronic pain', modality: 'ECT', target_site: 'Bifrontal',
        total_sessions: 12, completed_sessions: 6, adherence_pct: 100,
        current_week: 3, total_weeks: 4, started_at: '2026-04-15T08:00:00Z',
      },
      sessions,
      summary: { signed_count: 6, delivered_count: 6 },
      deviations: [
        {
          session_number: 4, scheduled_at: '2026-04-24T08:00:00Z',
          parameter: 'Stimulus duration', prescribed: '8 s', delivered: '11 s',
          note: 'Operator extended on the fly; reviewer flagged for chart note.',
        },
      ],
      outcomes: { scale: 'HAM-D', scores: [28, 27, 25, 23, 21, 19, 18] },
    };
  },
};

const _TREATMENT_SESSIONS = {
  patients: ['demo-pt-samantha-li', 'demo-pt-marcus-chen', 'demo-pt-elena-vasquez'],
  detail: (pid) => (_TS_DETAIL[pid] ? _TS_DETAIL[pid]() : null),
};

const _PHENOTYPE_CATALOG = [
  {
    id: 'demo-ph-anxious-depression',
    name: 'Anxious depression',
    domain: 'Mood · Anxiety overlap',
    description: 'Depressive episode with prominent worry, somatic tension, and sleep-onset difficulty.',
    associated_conditions: 'MDD, GAD',
    possible_target_regions: 'L-DLPFC, sgACC',
    candidate_modalities: 'rtms-dlpfc, tdcs',
    suggested_modalities: ['rtms-dlpfc', 'tdcs'],
    evidence_level: 'A',
    assessment_inputs_needed: 'PHQ-9, GAD-7, sleep diary',
  },
  {
    id: 'demo-ph-cognitive-control-deficit',
    name: 'Cognitive-control deficit',
    domain: 'Executive function',
    description: 'Reduced working-memory capacity and goal maintenance, often with attentional drift.',
    associated_conditions: 'MDD, ADHD-comorbid',
    possible_target_regions: 'L-DLPFC (BA46)',
    candidate_modalities: 'rtms-dlpfc, tdcs, neurofeedback',
    suggested_modalities: ['rtms-dlpfc', 'tdcs', 'neurofeedback'],
    evidence_level: 'B',
    assessment_inputs_needed: 'Stroop, n-back, digit-span',
  },
  {
    id: 'demo-ph-reward-deficit-anhedonic',
    name: 'Reward deficit (anhedonic)',
    domain: 'Reward / motivation',
    description: 'Blunted hedonic response and motivational drive; reduced reward anticipation.',
    associated_conditions: 'MDD, anhedonic-bipolar',
    possible_target_regions: 'mPFC, vmPFC, NAcc circuit',
    candidate_modalities: 'tdcs, tfus, ketamine-adjunct',
    suggested_modalities: ['tdcs', 'tfus'],
    evidence_level: 'B',
    assessment_inputs_needed: 'SHAPS, MASQ-AD',
  },
  {
    id: 'demo-ph-insomnia-dominant',
    name: 'Insomnia-dominant depression',
    domain: 'Sleep · Mood',
    description: 'Depression with sleep-onset and maintenance insomnia as the dominant complaint.',
    associated_conditions: 'MDD, primary insomnia',
    possible_target_regions: 'Cz (SMR), Pz',
    candidate_modalities: 'neurofeedback-smr, sleep-CBT-i',
    suggested_modalities: ['neurofeedback', 'cbt-i'],
    evidence_level: 'B',
    assessment_inputs_needed: 'ISI, sleep diary, actigraphy',
  },
  {
    id: 'demo-ph-inflammatory',
    name: 'Inflammatory subtype',
    domain: 'Neuroinflammation',
    description: 'Depressive presentation with elevated peripheral inflammatory markers and fatigue.',
    associated_conditions: 'MDD with elevated CRP/IL-6',
    possible_target_regions: '—',
    candidate_modalities: 'anti-inflammatory adjunct, tdcs',
    suggested_modalities: ['tdcs'],
    evidence_level: 'C',
    assessment_inputs_needed: 'CRP, IL-6, FACIT-Fatigue',
  },
  {
    id: 'demo-ph-trauma-related',
    name: 'Trauma-related dysregulation',
    domain: 'Trauma · Stress',
    description: 'Hyperarousal, intrusive memories, and affective dysregulation following trauma exposure.',
    associated_conditions: 'PTSD, complex trauma',
    possible_target_regions: 'R-DLPFC, vmPFC',
    candidate_modalities: 'rtms-rdlpfc, neurofeedback, EMDR-adjunct',
    suggested_modalities: ['rtms-dlpfc', 'neurofeedback'],
    evidence_level: 'B',
    assessment_inputs_needed: 'PCL-5, DES-II',
  },
  {
    id: 'demo-ph-anhedonic-bipolar',
    name: 'Anhedonic-bipolar spectrum',
    domain: 'Mood · Bipolar',
    description: 'Bipolar-spectrum presentation with prolonged anhedonic depressive episodes.',
    associated_conditions: 'Bipolar II, cyclothymia',
    possible_target_regions: 'mPFC, R-DLPFC',
    candidate_modalities: 'tdcs, ect (refractory)',
    suggested_modalities: ['tdcs', 'ect'],
    evidence_level: 'C',
    assessment_inputs_needed: 'MDQ, mood-chart, YMRS',
  },
];

const _PHENOTYPE_ASSIGNMENTS = [
  {
    id: 'demo-pha-sam-1',
    patient_id: 'demo-pt-samantha-li',
    clinician_id: 'demo-clinician',
    phenotype_id: 'demo-ph-cognitive-control-deficit',
    phenotype_name: 'Cognitive-control deficit',
    domain: 'Executive function',
    rationale: 'n-back at 60th percentile but Stroop interference >2 SD above norm; consistent with executive-control vulnerability.',
    qeeg_supported: true,
    confidence: 'moderate',
    assigned_at: '2026-04-22T10:14:00Z',
    created_at: '2026-04-22T10:14:00Z',
  },
  {
    id: 'demo-pha-sam-2',
    patient_id: 'demo-pt-samantha-li',
    clinician_id: 'demo-clinician',
    phenotype_id: 'demo-ph-insomnia-dominant',
    phenotype_name: 'Insomnia-dominant depression',
    domain: 'Sleep · Mood',
    rationale: 'ISI 19, sleep-diary onset latency >45 min, 5/7 nights under 6h.',
    qeeg_supported: false,
    confidence: 'high',
    assigned_at: '2026-04-25T08:30:00Z',
    created_at: '2026-04-25T08:30:00Z',
  },
  {
    id: 'demo-pha-mar-1',
    patient_id: 'demo-pt-marcus-chen',
    clinician_id: 'demo-clinician',
    phenotype_id: 'demo-ph-anxious-depression',
    phenotype_name: 'Anxious depression',
    domain: 'Mood · Anxiety overlap',
    rationale: 'GAD-7 17, PHQ-9 15, prominent somatic tension and onset insomnia.',
    qeeg_supported: true,
    confidence: 'high',
    assigned_at: '2026-04-29T11:02:00Z',
    created_at: '2026-04-29T11:02:00Z',
  },
  {
    id: 'demo-pha-ele-1',
    patient_id: 'demo-pt-elena-vasquez',
    clinician_id: 'demo-clinician',
    phenotype_id: 'demo-ph-reward-deficit-anhedonic',
    phenotype_name: 'Reward deficit (anhedonic)',
    domain: 'Reward / motivation',
    rationale: 'SHAPS 9, MASQ-AD elevated; pleasure-response blunted across activity domains.',
    qeeg_supported: false,
    confidence: 'moderate',
    assigned_at: '2026-04-18T08:02:00Z',
    created_at: '2026-04-18T08:02:00Z',
  },
  {
    id: 'demo-pha-ele-2',
    patient_id: 'demo-pt-elena-vasquez',
    clinician_id: 'demo-clinician',
    phenotype_id: 'demo-ph-trauma-related',
    phenotype_name: 'Trauma-related dysregulation',
    domain: 'Trauma · Stress',
    rationale: 'PCL-5 38; hyperarousal and intrusive memories tied to MVA in 2022.',
    qeeg_supported: false,
    confidence: 'moderate',
    assigned_at: '2026-04-20T14:18:00Z',
    created_at: '2026-04-20T14:18:00Z',
  },
];

function _phenotypeAssignmentsFor(patientId) {
  if (!patientId) return _PHENOTYPE_ASSIGNMENTS.slice();
  return _PHENOTYPE_ASSIGNMENTS.filter((a) => a.patient_id === patientId);
}

function _nutritionDemoPayload(patientId) {
  const pid = patientId || 'demo-pt-samantha-li';
  const persona = DEMO_PATIENTS.find((p) => p.id === pid) || DEMO_PATIENTS[0];
  const asOf = '2026-05-02T08:00:00Z';
  return Object.freeze({
    patient_id: pid,
    computation_id: `demo-nut-${pid.slice(-8)}`,
    data_as_of: asOf,
    schema_version: '1',
    clinical_disclaimer:
      'Decision-support only. Not a prescription or diet order. '
      + 'Clinician judgment and local policy govern all care decisions.',
    snapshot: Object.freeze([
      Object.freeze({ label: 'Energy (7d mean)', value: '1840', unit: 'kcal/d', confidence: 0.62, provenance: 'demo_food_summary', as_of: asOf }),
      Object.freeze({ label: 'Protein (7d mean)', value: '78', unit: 'g/d', confidence: 0.58, provenance: 'demo_food_summary', as_of: asOf }),
      Object.freeze({ label: 'Active supplements', value: pid === 'demo-pt-elena-vasquez' ? '5' : '3', unit: 'agents', confidence: 0.72, provenance: 'demo_chart', as_of: asOf }),
      Object.freeze({ label: 'Omega-3 index (est.)', value: '—', unit: '%', confidence: 0.2, provenance: 'not_measured', as_of: asOf }),
    ]),
    diet: Object.freeze({
      window_days: 7,
      avg_calories_kcal: 1840,
      avg_protein_g: 78,
      avg_carbs_g: 195,
      avg_fat_g: 72,
      avg_sodium_mg: 2680,
      avg_fiber_g: 19,
      logging_coverage_pct: 71,
      confidence: 0.61,
      provenance: 'demo_aggregated_log',
      notes: `Illustrative aggregates for ${persona.name} — replace with device / EHR feeds when integrated.`,
    }),
    supplements: Object.freeze(
      pid === 'demo-pt-elena-vasquez'
        ? [
          Object.freeze({ id: 'demo-sup-ele-1', name: 'Vitamin D3', dose: '2000 IU', frequency: 'daily', active: true, notes: 'OTC', started_at: '2025-06-01', confidence: 0.8, provenance: 'demo' }),
          Object.freeze({ id: 'demo-sup-ele-2', name: 'Magnesium glycinate', dose: '200 mg', frequency: 'bedtime', active: true, notes: 'Sleep support', started_at: '2026-01-12', confidence: 0.74, provenance: 'demo' }),
          Object.freeze({ id: 'demo-sup-ele-3', name: 'Omega-3 (EPA/DHA)', dose: '1 g', frequency: 'daily', active: true, notes: null, started_at: '2025-09-20', confidence: 0.7, provenance: 'demo' }),
          Object.freeze({ id: 'demo-sup-ele-4', name: 'Curcumin', dose: '500 mg', frequency: 'twice daily', active: false, notes: 'Stopped — GI upset', started_at: '2025-11-01', confidence: 0.65, provenance: 'demo' }),
          Object.freeze({ id: 'demo-sup-ele-5', name: 'Iron (with vitamin C)', dose: '65 mg', frequency: 'alternate days', active: true, notes: 'Directed by PCP', started_at: '2026-03-04', confidence: 0.82, provenance: 'demo' }),
        ]
        : [
          Object.freeze({ id: 'demo-sup-1', name: 'Vitamin D3', dose: '1000 IU', frequency: 'daily', active: true, notes: null, started_at: '2025-08-10', confidence: 0.78, provenance: 'demo' }),
          Object.freeze({ id: 'demo-sup-2', name: 'Omega-3', dose: '500 mg', frequency: 'daily', active: true, notes: null, started_at: '2026-02-01', confidence: 0.7, provenance: 'demo' }),
          Object.freeze({ id: 'demo-sup-3', name: 'Multivitamin', dose: '1 tab', frequency: 'morning', active: true, notes: 'General', started_at: '2025-11-15', confidence: 0.55, provenance: 'demo' }),
        ],
    ),
    biomarker_links: Object.freeze([
      Object.freeze({ label: 'Wearable biometrics', page_id: 'wearables', detail: 'Sleep & activity vs intake', confidence: 0.45 }),
      Object.freeze({ label: 'Risk stratification', page_id: 'risk-analyzer', detail: 'Cross-check adherence & safety', confidence: 0.5 }),
      Object.freeze({ label: 'Medication safety', page_id: 'medication-analyzer', detail: 'Drug–supplement overlap screen (future)', confidence: 0.35 }),
    ]),
    recommendations: Object.freeze([
      Object.freeze({
        title: 'Discuss sodium with patient',
        detail: 'Rolling average above many cardiovascular targets; correlate with BP readings and prescribing context.',
        priority: 'follow_up',
        confidence: 0.49,
        provenance: 'demo_heuristic',
      }),
      Object.freeze({
        title: 'Fiber adequacy',
        detail: 'Trending below 25–30 g/day; explore dietitian referral if symptoms or comorbidities warrant.',
        priority: 'routine',
        confidence: 0.46,
        provenance: 'demo_heuristic',
      }),
    ]),
    audit_events: Object.freeze({
      total_events: 2,
      last_event_at: '2026-05-01T14:22:00Z',
      last_event_type: 'review_note',
    }),
  });
}

const _PHENOTYPE = {
  catalog: _PHENOTYPE_CATALOG,
  all_assignments: _PHENOTYPE_ASSIGNMENTS,
  assignments_for: _phenotypeAssignmentsFor,
};

const _MOVEMENT_PROFILES = {
  'demo-pt-samantha-li': {
    patient_id: 'demo-pt-samantha-li',
    patient_name: 'Samantha Li',
    captured_at: '2026-04-29T14:18:00Z',
    source_video: {
      recording_id: 'demo-video-samantha-li-001',
      captured_at: '2026-04-29T14:18:00Z',
      duration_seconds: 312,
    },
    modalities: {
      bradykinesia: {
        score: 18, severity: 'green', confidence: 0.88,
        contributing_factors: [
          'Finger-tap rate within age-norm range (4.2 Hz)',
          'No decrement across 10-second tap sequence',
        ],
      },
      tremor: {
        score: 46, severity: 'amber', confidence: 0.74,
        contributing_factors: [
          'Postural tremor 7.8 Hz, amplitude 0.9 cm — consistent with SSRI exposure',
          'Tremor absent at rest; emerges with arms outstretched',
        ],
      },
      gait: {
        score: 22, severity: 'green', confidence: 0.81,
        contributing_factors: [
          'Step length 0.62 m, cadence 112 steps/min — within norms',
          'No freezing or shuffling on 6-meter walk',
        ],
      },
      posture: {
        score: 19, severity: 'green', confidence: 0.84,
        contributing_factors: [
          'Sagittal tilt 2.1° — within norm',
          'No retropulsion on pull-test simulation',
        ],
      },
      monitoring: {
        score: 24, severity: 'green', confidence: 0.79,
        contributing_factors: [
          'Movement variability index 0.42 — engaged, expressive',
          'Spontaneous gestures retained across 5-min interview',
        ],
      },
    },
    prior_scores: [
      { captured_at: '2026-02-04T10:00:00Z', modality: 'tremor', score: 22 },
      { captured_at: '2026-02-22T10:00:00Z', modality: 'tremor', score: 28 },
      { captured_at: '2026-03-08T10:00:00Z', modality: 'tremor', score: 33 },
      { captured_at: '2026-03-22T10:00:00Z', modality: 'tremor', score: 38 },
      { captured_at: '2026-04-08T10:00:00Z', modality: 'tremor', score: 42 },
      { captured_at: '2026-04-22T10:00:00Z', modality: 'tremor', score: 45 },
      { captured_at: '2026-04-29T14:18:00Z', modality: 'tremor', score: 46 },
      { captured_at: '2026-02-04T10:00:00Z', modality: 'bradykinesia', score: 16 },
      { captured_at: '2026-03-08T10:00:00Z', modality: 'bradykinesia', score: 17 },
      { captured_at: '2026-04-08T10:00:00Z', modality: 'bradykinesia', score: 18 },
      { captured_at: '2026-04-29T14:18:00Z', modality: 'bradykinesia', score: 18 },
      { captured_at: '2026-02-04T10:00:00Z', modality: 'gait', score: 24 },
      { captured_at: '2026-03-08T10:00:00Z', modality: 'gait', score: 23 },
      { captured_at: '2026-04-08T10:00:00Z', modality: 'gait', score: 22 },
      { captured_at: '2026-04-29T14:18:00Z', modality: 'gait', score: 22 },
      { captured_at: '2026-02-04T10:00:00Z', modality: 'posture', score: 21 },
      { captured_at: '2026-03-08T10:00:00Z', modality: 'posture', score: 20 },
      { captured_at: '2026-04-29T14:18:00Z', modality: 'posture', score: 19 },
      { captured_at: '2026-02-04T10:00:00Z', modality: 'monitoring', score: 26 },
      { captured_at: '2026-03-08T10:00:00Z', modality: 'monitoring', score: 24 },
      { captured_at: '2026-04-29T14:18:00Z', modality: 'monitoring', score: 24 },
    ],
  },
  'demo-pt-marcus-chen': {
    patient_id: 'demo-pt-marcus-chen',
    patient_name: 'Marcus Chen',
    captured_at: '2026-04-30T11:45:00Z',
    source_video: {
      recording_id: 'demo-video-marcus-chen-002',
      captured_at: '2026-04-30T11:45:00Z',
      duration_seconds: 287,
    },
    modalities: {
      bradykinesia: {
        score: 24, severity: 'green', confidence: 0.83,
        contributing_factors: [
          'Finger-tap rate 4.0 Hz — borderline-low but within age range',
          'Slight slowing on rapid alternating movements',
        ],
      },
      tremor: {
        score: 14, severity: 'green', confidence: 0.91,
        contributing_factors: [
          'No rest, postural, or kinetic tremor detected',
          'Hand steadiness within norm during sustained posture',
        ],
      },
      gait: {
        score: 28, severity: 'green', confidence: 0.78,
        contributing_factors: [
          'Step length 0.68 m, cadence 108 steps/min',
          'Arm swing slightly reduced but symmetric',
        ],
      },
      posture: {
        score: 52, severity: 'amber', confidence: 0.71,
        contributing_factors: [
          'Sagittal forward lean 7.4° — above 5° clinical threshold',
          'Persists across both standing and seated tasks',
        ],
      },
      monitoring: {
        score: 58, severity: 'amber', confidence: 0.69,
        contributing_factors: [
          'Movement variability index 0.18 — markedly reduced vs baseline',
          'Possible psychomotor slowing; correlates with PHQ-9 trend',
        ],
      },
    },
    prior_scores: [
      { captured_at: '2026-02-12T11:00:00Z', modality: 'monitoring', score: 28 },
      { captured_at: '2026-02-26T11:00:00Z', modality: 'monitoring', score: 32 },
      { captured_at: '2026-03-12T11:00:00Z', modality: 'monitoring', score: 38 },
      { captured_at: '2026-03-26T11:00:00Z', modality: 'monitoring', score: 44 },
      { captured_at: '2026-04-09T11:00:00Z', modality: 'monitoring', score: 50 },
      { captured_at: '2026-04-23T11:00:00Z', modality: 'monitoring', score: 55 },
      { captured_at: '2026-04-30T11:45:00Z', modality: 'monitoring', score: 58 },
      { captured_at: '2026-02-12T11:00:00Z', modality: 'posture', score: 32 },
      { captured_at: '2026-03-12T11:00:00Z', modality: 'posture', score: 41 },
      { captured_at: '2026-04-09T11:00:00Z', modality: 'posture', score: 48 },
      { captured_at: '2026-04-30T11:45:00Z', modality: 'posture', score: 52 },
      { captured_at: '2026-02-12T11:00:00Z', modality: 'bradykinesia', score: 21 },
      { captured_at: '2026-03-12T11:00:00Z', modality: 'bradykinesia', score: 22 },
      { captured_at: '2026-04-30T11:45:00Z', modality: 'bradykinesia', score: 24 },
      { captured_at: '2026-02-12T11:00:00Z', modality: 'tremor', score: 16 },
      { captured_at: '2026-03-12T11:00:00Z', modality: 'tremor', score: 15 },
      { captured_at: '2026-04-30T11:45:00Z', modality: 'tremor', score: 14 },
      { captured_at: '2026-02-12T11:00:00Z', modality: 'gait', score: 27 },
      { captured_at: '2026-03-12T11:00:00Z', modality: 'gait', score: 28 },
      { captured_at: '2026-04-30T11:45:00Z', modality: 'gait', score: 28 },
    ],
  },
  'demo-pt-elena-vasquez': {
    patient_id: 'demo-pt-elena-vasquez',
    patient_name: 'Elena Vasquez',
    captured_at: '2026-05-01T09:22:00Z',
    source_video: {
      recording_id: 'demo-video-elena-vasquez-003',
      captured_at: '2026-05-01T09:22:00Z',
      duration_seconds: 348,
    },
    modalities: {
      bradykinesia: {
        score: 54, severity: 'amber', confidence: 0.72,
        contributing_factors: [
          'Finger-tap rate 3.1 Hz — slowed (post-ECT day 2)',
          'Decrement of 18% across 10-second tap sequence',
        ],
      },
      tremor: {
        score: 21, severity: 'green', confidence: 0.86,
        contributing_factors: [
          'No measurable rest tremor',
          'Sub-threshold postural tremor (4 mm amplitude)',
        ],
      },
      gait: {
        score: 49, severity: 'amber', confidence: 0.74,
        contributing_factors: [
          'Step length 0.41 m — reduced from 0.55 m baseline',
          'Cadence 96 steps/min, mild en bloc turning',
        ],
      },
      posture: {
        score: 26, severity: 'green', confidence: 0.80,
        contributing_factors: [
          'Sagittal tilt 3.0° — within norm',
          'No lateral lean or retropulsion',
        ],
      },
      monitoring: {
        score: 31, severity: 'green', confidence: 0.77,
        contributing_factors: [
          'Movement variability index 0.34 — preserved',
          'Spontaneous facial expression intact',
        ],
      },
    },
    prior_scores: [
      { captured_at: '2026-03-04T09:00:00Z', modality: 'bradykinesia', score: 22 },
      { captured_at: '2026-03-25T09:00:00Z', modality: 'bradykinesia', score: 24 },
      { captured_at: '2026-04-15T09:00:00Z', modality: 'bradykinesia', score: 28 },
      { captured_at: '2026-04-22T09:00:00Z', modality: 'bradykinesia', score: 38 },
      { captured_at: '2026-04-29T09:00:00Z', modality: 'bradykinesia', score: 47 },
      { captured_at: '2026-05-01T09:22:00Z', modality: 'bradykinesia', score: 54 },
      { captured_at: '2026-03-04T09:00:00Z', modality: 'gait', score: 26 },
      { captured_at: '2026-04-15T09:00:00Z', modality: 'gait', score: 32 },
      { captured_at: '2026-04-29T09:00:00Z', modality: 'gait', score: 44 },
      { captured_at: '2026-05-01T09:22:00Z', modality: 'gait', score: 49 },
      { captured_at: '2026-03-04T09:00:00Z', modality: 'tremor', score: 18 },
      { captured_at: '2026-04-15T09:00:00Z', modality: 'tremor', score: 20 },
      { captured_at: '2026-05-01T09:22:00Z', modality: 'tremor', score: 21 },
      { captured_at: '2026-03-04T09:00:00Z', modality: 'posture', score: 24 },
      { captured_at: '2026-04-15T09:00:00Z', modality: 'posture', score: 26 },
      { captured_at: '2026-05-01T09:22:00Z', modality: 'posture', score: 26 },
      { captured_at: '2026-03-04T09:00:00Z', modality: 'monitoring', score: 28 },
      { captured_at: '2026-04-15T09:00:00Z', modality: 'monitoring', score: 30 },
      { captured_at: '2026-05-01T09:22:00Z', modality: 'monitoring', score: 31 },
    ],
  },
};

const _MOVEMENT_AUDITS = {
  'demo-pt-samantha-li': [
    { id: 'mv-aud-sam-1', kind: 'recompute', actor: 'system', message: 'Profile recomputed from new video capture.', created_at: '2026-04-29T14:20:00Z' },
    { id: 'mv-aud-sam-2', kind: 'annotation', actor: 'Dr. A. Yildirim', message: 'Postural tremor amplitude rising on sertraline 100 mg — consider dose review at next visit.', created_at: '2026-04-29T14:32:00Z' },
    { id: 'mv-aud-sam-3', kind: 'recompute', actor: 'system', message: 'Profile recomputed from new video capture.', created_at: '2026-04-22T10:14:00Z' },
    { id: 'mv-aud-sam-4', kind: 'annotation', actor: 'Dr. A. Yildirim', message: 'Tremor first noted; counsel patient on caffeine reduction.', created_at: '2026-04-08T10:30:00Z' },
  ],
  'demo-pt-marcus-chen': [
    { id: 'mv-aud-mar-1', kind: 'recompute', actor: 'system', message: 'Profile recomputed from new video capture.', created_at: '2026-04-30T11:47:00Z' },
    { id: 'mv-aud-mar-2', kind: 'annotation', actor: 'Dr. A. Yildirim', message: 'Movement variability dropping in line with PHQ-9 increase — psychomotor slowing component.', created_at: '2026-04-30T12:02:00Z' },
    { id: 'mv-aud-mar-3', kind: 'annotation', actor: 'Dr. A. Yildirim', message: 'Forward postural lean noted; review ergonomics and bupropion timing.', created_at: '2026-04-23T10:10:00Z' },
    { id: 'mv-aud-mar-4', kind: 'recompute', actor: 'system', message: 'Profile recomputed from new video capture.', created_at: '2026-04-09T11:00:00Z' },
  ],
  'demo-pt-elena-vasquez': [
    { id: 'mv-aud-ele-1', kind: 'recompute', actor: 'system', message: 'Profile recomputed from new video capture.', created_at: '2026-05-01T09:24:00Z' },
    { id: 'mv-aud-ele-2', kind: 'annotation', actor: 'Dr. A. Yildirim', message: 'Post-ECT day-2 motor slowing expected; reassess at 72 h before adjusting course.', created_at: '2026-05-01T09:40:00Z' },
    { id: 'mv-aud-ele-3', kind: 'annotation', actor: 'Dr. R. Patel', message: 'Reduced step length on 6-m walk; flag fall-risk for nursing.', created_at: '2026-04-29T09:30:00Z' },
    { id: 'mv-aud-ele-4', kind: 'recompute', actor: 'system', message: 'Profile recomputed from new video capture.', created_at: '2026-04-22T09:00:00Z' },
    { id: 'mv-aud-ele-5', kind: 'annotation', actor: 'Dr. A. Yildirim', message: 'Pre-ECT baseline captured; motor exam grossly normal.', created_at: '2026-04-15T08:45:00Z' },
  ],
};

function _movementProfileFor(patientId) {
  return _MOVEMENT_PROFILES[patientId] || null;
}

function _movementAuditFor(patientId) {
  const items = _MOVEMENT_AUDITS[patientId] || [];
  return { patient_id: patientId, items };
}

function _movementClinicSummary() {
  return {
    captured_at: '2026-05-02T07:30:00Z',
    patients: Object.values(_MOVEMENT_PROFILES).map((p) => ({
      patient_id: p.patient_id,
      patient_name: p.patient_name,
      captured_at: p.captured_at,
      modalities: Object.fromEntries(
        Object.entries(p.modalities).map(([k, v]) => [k, { severity: v.severity, score: v.score }])
      ),
    })),
  };
}

const _MOVEMENT = {
  clinic_summary: _movementClinicSummary,
  patient_profile: _movementProfileFor,
  patient_audit: _movementAuditFor,
};

const _LABS_PROFILES = {
  'demo-pt-samantha-li': {
    patient_id: 'demo-pt-samantha-li',
    patient_name: 'Samantha Li',
    captured_at: '2026-04-26T08:30:00Z',
    panels: [
      {
        name: 'Complete Blood Count',
        results: [
          { analyte: 'Hemoglobin',  value: 13.4, unit: 'g/dL',   ref_low: 12.0, ref_high: 16.0, status: 'normal', captured_at: '2026-04-26T08:30:00Z' },
          { analyte: 'WBC',         value: 6.1,  unit: '10^9/L', ref_low: 4.0,  ref_high: 11.0, status: 'normal', captured_at: '2026-04-26T08:30:00Z' },
          { analyte: 'Platelets',   value: 248,  unit: '10^9/L', ref_low: 150,  ref_high: 400,  status: 'normal', captured_at: '2026-04-26T08:30:00Z' },
        ],
      },
      {
        name: 'Comprehensive Metabolic Panel',
        results: [
          { analyte: 'Sodium',     value: 140, unit: 'mmol/L', ref_low: 135, ref_high: 145, status: 'normal', captured_at: '2026-04-26T08:30:00Z' },
          { analyte: 'Potassium',  value: 4.2, unit: 'mmol/L', ref_low: 3.5, ref_high: 5.0, status: 'normal', captured_at: '2026-04-26T08:30:00Z' },
          { analyte: 'Creatinine', value: 0.8, unit: 'mg/dL',  ref_low: 0.6, ref_high: 1.1, status: 'normal', captured_at: '2026-04-26T08:30:00Z' },
          { analyte: 'eGFR',       value: 96,  unit: 'mL/min', ref_low: 90,  ref_high: 120, status: 'normal', captured_at: '2026-04-26T08:30:00Z' },
        ],
      },
      {
        name: 'Endocrine',
        results: [
          { analyte: 'TSH',        value: 4.8,  unit: 'mIU/L', ref_low: 0.4, ref_high: 4.0,  status: 'high', captured_at: '2026-04-26T08:30:00Z', note: 'Sub-clinical hypothyroid pattern.' },
          { analyte: 'Free T4',    value: 1.0,  unit: 'ng/dL', ref_low: 0.8, ref_high: 1.8,  status: 'normal', captured_at: '2026-04-26T08:30:00Z' },
          { analyte: 'Vitamin D',  value: 18,   unit: 'ng/mL', ref_low: 30,  ref_high: 100,  status: 'low',  captured_at: '2026-04-26T08:30:00Z', note: 'Insufficient — supplementation indicated.' },
        ],
      },
    ],
    flags: [
      {
        analyte: 'TSH',
        severity: 'major',
        mechanism: 'Sub-clinical hypothyroidism (TSH 4.8 mIU/L) is a recognised contributor to depressive symptoms and treatment resistance, particularly in young women on SSRIs.',
        recommendation: 'Consider endocrine referral; treat hypothyroidism before escalating sertraline or adding augmentation. Repeat TSH + anti-TPO in 6 weeks.',
        references: [
          { pmid: '19833552', title: 'Safety of TMS — consensus guideline (Rossi et al., 2009)', year: 2009, journal: 'Clinical Neurophysiology' },
        ],
      },
      {
        analyte: 'Vitamin D',
        severity: 'monitor',
        mechanism: 'Vitamin D insufficiency (18 ng/mL) co-occurs with low mood and may blunt antidepressant response.',
        recommendation: 'Start cholecalciferol 2000 IU daily; recheck 25-OH-D at 12 weeks.',
        references: [],
      },
    ],
    prior_results: [
      { captured_at: '2025-11-04T08:00:00Z', analyte: 'TSH', value: 3.2 },
      { captured_at: '2026-01-12T08:00:00Z', analyte: 'TSH', value: 3.9 },
      { captured_at: '2026-02-22T08:00:00Z', analyte: 'TSH', value: 4.3 },
      { captured_at: '2026-03-30T08:00:00Z', analyte: 'TSH', value: 4.6 },
      { captured_at: '2026-04-26T08:30:00Z', analyte: 'TSH', value: 4.8 },
      { captured_at: '2025-11-04T08:00:00Z', analyte: 'Vitamin D', value: 26 },
      { captured_at: '2026-01-12T08:00:00Z', analyte: 'Vitamin D', value: 22 },
      { captured_at: '2026-03-30T08:00:00Z', analyte: 'Vitamin D', value: 19 },
      { captured_at: '2026-04-26T08:30:00Z', analyte: 'Vitamin D', value: 18 },
    ],
  },
  'demo-pt-marcus-chen': {
    patient_id: 'demo-pt-marcus-chen',
    patient_name: 'Marcus Chen',
    captured_at: '2026-04-28T09:10:00Z',
    panels: [
      {
        name: 'Complete Blood Count',
        results: [
          { analyte: 'Hemoglobin',  value: 14.8, unit: 'g/dL',   ref_low: 13.5, ref_high: 17.5, status: 'normal', captured_at: '2026-04-28T09:10:00Z' },
          { analyte: 'WBC',         value: 6.6,  unit: '10^9/L', ref_low: 4.0,  ref_high: 11.0, status: 'normal', captured_at: '2026-04-28T09:10:00Z' },
          { analyte: 'Platelets',   value: 271,  unit: '10^9/L', ref_low: 150,  ref_high: 400,  status: 'normal', captured_at: '2026-04-28T09:10:00Z' },
        ],
      },
      {
        name: 'Comprehensive Metabolic Panel',
        results: [
          { analyte: 'Sodium',     value: 139, unit: 'mmol/L', ref_low: 135, ref_high: 145, status: 'normal', captured_at: '2026-04-28T09:10:00Z' },
          { analyte: 'Creatinine', value: 0.9, unit: 'mg/dL',  ref_low: 0.7, ref_high: 1.2, status: 'normal', captured_at: '2026-04-28T09:10:00Z' },
          { analyte: 'eGFR',       value: 95,  unit: 'mL/min', ref_low: 90,  ref_high: 120, status: 'normal', captured_at: '2026-04-28T09:10:00Z' },
          { analyte: 'ALT',        value: 28,  unit: 'U/L',    ref_low: 7,   ref_high: 56,  status: 'normal', captured_at: '2026-04-28T09:10:00Z' },
        ],
      },
      {
        name: 'Therapeutic Drug Monitoring',
        results: [
          { analyte: 'Lithium (trough)', value: 0.4, unit: 'mmol/L', ref_low: 0.6, ref_high: 1.0, status: 'low', captured_at: '2026-04-28T09:10:00Z', note: 'Sub-therapeutic — drawn 12 h post-dose.' },
        ],
      },
    ],
    flags: [
      {
        analyte: 'Lithium (trough)',
        severity: 'major',
        mechanism: 'Trough lithium 0.4 mmol/L sits below the 0.6–1.0 mmol/L therapeutic window. Concurrent rTMS course will not compensate for sub-therapeutic mood-stabiliser cover.',
        recommendation: 'Review prescribing — confirm adherence and timing of last dose, consider dose increase to 600–900 mg or augmentation. Repeat trough in 5–7 days.',
        references: [
          { pmid: '19833552', title: 'Safety of TMS — consensus guideline (Rossi et al., 2009)', year: 2009, journal: 'Clinical Neurophysiology' },
        ],
      },
    ],
    prior_results: [
      { captured_at: '2026-01-30T09:00:00Z', analyte: 'Lithium (trough)', value: 0.7 },
      { captured_at: '2026-02-27T09:00:00Z', analyte: 'Lithium (trough)', value: 0.6 },
      { captured_at: '2026-03-26T09:00:00Z', analyte: 'Lithium (trough)', value: 0.5 },
      { captured_at: '2026-04-28T09:10:00Z', analyte: 'Lithium (trough)', value: 0.4 },
      { captured_at: '2026-01-30T09:00:00Z', analyte: 'eGFR', value: 98 },
      { captured_at: '2026-02-27T09:00:00Z', analyte: 'eGFR', value: 96 },
      { captured_at: '2026-04-28T09:10:00Z', analyte: 'eGFR', value: 95 },
    ],
  },
  'demo-pt-elena-vasquez': {
    patient_id: 'demo-pt-elena-vasquez',
    patient_name: 'Elena Vasquez',
    captured_at: '2026-05-01T07:45:00Z',
    panels: [
      {
        name: 'Coagulation',
        results: [
          { analyte: 'INR',        value: 3.8,  unit: 'ratio', ref_low: 2.0, ref_high: 3.0, status: 'critical', captured_at: '2026-05-01T07:45:00Z', note: 'Supratherapeutic — bleeding risk. Concurrent ibuprofen + ECT-day proximity.' },
          { analyte: 'PT',         value: 38.2, unit: 's',     ref_low: 11,  ref_high: 14,  status: 'high',     captured_at: '2026-05-01T07:45:00Z' },
        ],
      },
      {
        name: 'Complete Blood Count',
        results: [
          { analyte: 'Hemoglobin',  value: 11.4, unit: 'g/dL',   ref_low: 12.0, ref_high: 16.0, status: 'low',    captured_at: '2026-05-01T07:45:00Z', note: 'Mild anemia — investigate for occult bleeding given supratherapeutic INR.' },
          { analyte: 'WBC',         value: 7.0,  unit: '10^9/L', ref_low: 4.0,  ref_high: 11.0, status: 'normal', captured_at: '2026-05-01T07:45:00Z' },
          { analyte: 'Platelets',   value: 232,  unit: '10^9/L', ref_low: 150,  ref_high: 400,  status: 'normal', captured_at: '2026-05-01T07:45:00Z' },
        ],
      },
      {
        name: 'Comprehensive Metabolic Panel',
        results: [
          { analyte: 'Sodium',     value: 141, unit: 'mmol/L', ref_low: 135, ref_high: 145, status: 'normal', captured_at: '2026-05-01T07:45:00Z' },
          { analyte: 'Potassium',  value: 4.0, unit: 'mmol/L', ref_low: 3.5, ref_high: 5.0, status: 'normal', captured_at: '2026-05-01T07:45:00Z' },
          { analyte: 'Creatinine', value: 1.0, unit: 'mg/dL',  ref_low: 0.6, ref_high: 1.1, status: 'normal', captured_at: '2026-05-01T07:45:00Z' },
          { analyte: 'eGFR',       value: 71,  unit: 'mL/min', ref_low: 60,  ref_high: 120, status: 'normal', captured_at: '2026-05-01T07:45:00Z' },
        ],
      },
    ],
    flags: [
      {
        analyte: 'INR',
        severity: 'critical',
        mechanism: 'INR 3.8 with concurrent ibuprofen 400 mg TID and a scheduled ECT session creates a stacked bleeding risk: supratherapeutic warfarin, NSAID-induced platelet inhibition, plus airway/dental trauma exposure during ECT-related muscle relaxation.',
        recommendation: 'Hold warfarin tonight; coordinate with hematology before next ECT session. Stop ibuprofen, switch analgesia to paracetamol. Recheck INR in 24 h before re-dosing.',
        references: [
          { pmid: '19833552', title: 'Safety of TMS — consensus guideline (Rossi et al., 2009)', year: 2009, journal: 'Clinical Neurophysiology' },
        ],
      },
      {
        analyte: 'Hemoglobin',
        severity: 'monitor',
        mechanism: 'Mild anemia (11.4 g/dL) in the setting of supratherapeutic anticoagulation suggests possible occult GI loss.',
        recommendation: 'Order ferritin + reticulocytes; consider stool occult-blood testing if Hb continues to drift.',
        references: [],
      },
    ],
    prior_results: [
      { captured_at: '2026-02-15T08:00:00Z', analyte: 'INR', value: 2.4 },
      { captured_at: '2026-03-15T08:00:00Z', analyte: 'INR', value: 2.7 },
      { captured_at: '2026-04-08T08:00:00Z', analyte: 'INR', value: 3.1 },
      { captured_at: '2026-04-22T08:00:00Z', analyte: 'INR', value: 3.4 },
      { captured_at: '2026-05-01T07:45:00Z', analyte: 'INR', value: 3.8 },
      { captured_at: '2026-02-15T08:00:00Z', analyte: 'Hemoglobin', value: 12.6 },
      { captured_at: '2026-03-15T08:00:00Z', analyte: 'Hemoglobin', value: 12.1 },
      { captured_at: '2026-04-22T08:00:00Z', analyte: 'Hemoglobin', value: 11.7 },
      { captured_at: '2026-05-01T07:45:00Z', analyte: 'Hemoglobin', value: 11.4 },
    ],
  },
};

const _LABS_AUDITS = {
  'demo-pt-samantha-li': [
    { id: 'lab-aud-sam-1', kind: 'recompute',   actor: 'system',          message: 'Lab profile recomputed after CMP/TSH panel uploaded.', created_at: '2026-04-26T08:32:00Z' },
    { id: 'lab-aud-sam-2', kind: 'annotation',  actor: 'Dr. A. Yildirim', message: 'TSH trending up across 6 months — request anti-TPO and refer endocrine.', created_at: '2026-04-26T09:14:00Z' },
    { id: 'lab-aud-sam-3', kind: 'review-note', actor: 'Dr. A. Yildirim', message: 'Reviewed and signed: hold sertraline dose escalation pending thyroid workup.', created_at: '2026-04-26T09:18:00Z' },
    { id: 'lab-aud-sam-4', kind: 'result-add',  actor: 'Lab Corp (HL7)',  message: 'Added Vitamin D 25-OH result.', created_at: '2026-04-26T08:40:00Z' },
  ],
  'demo-pt-marcus-chen': [
    { id: 'lab-aud-mar-1', kind: 'recompute',   actor: 'system',          message: 'Lab profile recomputed after lithium trough result.', created_at: '2026-04-28T09:12:00Z' },
    { id: 'lab-aud-mar-2', kind: 'annotation',  actor: 'Dr. A. Yildirim', message: 'Trough 0.4 mmol/L — confirm timing of last dose with patient before dose change.', created_at: '2026-04-28T09:35:00Z' },
    { id: 'lab-aud-mar-3', kind: 'review-note', actor: 'Dr. A. Yildirim', message: 'Sign-off: increase lithium to 600 mg nocte; repeat trough in 1 week.', created_at: '2026-04-28T10:02:00Z' },
  ],
  'demo-pt-elena-vasquez': [
    { id: 'lab-aud-ele-1', kind: 'recompute',   actor: 'system',          message: 'Lab profile recomputed after coagulation panel.', created_at: '2026-05-01T07:48:00Z' },
    { id: 'lab-aud-ele-2', kind: 'annotation',  actor: 'Dr. A. Yildirim', message: 'INR critical at 3.8 + concurrent ibuprofen — pause ECT session, brief hematology.', created_at: '2026-05-01T08:02:00Z' },
    { id: 'lab-aud-ele-3', kind: 'review-note', actor: 'Dr. R. Patel',    message: 'Sign-off: hold warfarin tonight, recheck INR 24 h, reassess ECT slot.', created_at: '2026-05-01T08:18:00Z' },
    { id: 'lab-aud-ele-4', kind: 'annotation',  actor: 'Dr. A. Yildirim', message: 'Mild anemia trending — order ferritin and reticulocytes.', created_at: '2026-05-01T08:25:00Z' },
    { id: 'lab-aud-ele-5', kind: 'result-add',  actor: 'Lab Corp (HL7)',  message: 'Added INR 3.8 + PT 38.2 s.', created_at: '2026-05-01T07:46:00Z' },
  ],
};

function _labsProfileFor(patientId) {
  return _LABS_PROFILES[patientId] || null;
}

function _labsAuditFor(patientId) {
  const items = _LABS_AUDITS[patientId] || [];
  return { patient_id: patientId, items };
}

function _labsClinicSummary() {
  return {
    captured_at: '2026-05-02T07:30:00Z',
    patients: Object.values(_LABS_PROFILES).map((p) => {
      const allResults = (p.panels || []).flatMap((pn) => pn.results || []);
      const abnormal = allResults.filter((r) => r.status && r.status !== 'normal');
      const top = abnormal.find((r) => r.status === 'critical') || abnormal[0] || null;
      const topLabel = top
        ? `${top.analyte} ${top.value} ${top.unit || ''} — ${top.status}`
        : '';
      return {
        patient_id: p.patient_id,
        patient_name: p.patient_name,
        captured_at: p.captured_at,
        abnormal_count: abnormal.length,
        critical_count: abnormal.filter((r) => r.status === 'critical').length,
        top_flag_label: topLabel,
        top_flag_status: top?.status || null,
      };
    }),
  };
}

const _LABS = {
  clinic_summary: _labsClinicSummary,
  patient_profile: _labsProfileFor,
  patient_audit: _labsAuditFor,
};

const _NUTRITION_PROFILES = {
  'demo-pt-samantha-li': {
    patient_id: 'demo-pt-samantha-li',
    patient_name: 'Samantha Li',
    captured_at: '2026-04-30T08:30:00Z',
    macros: {
      day: '2026-04-30',
      calories: { intake: 1620, target: 2000, status: 'low' },
      protein:  { intake: 64,   target: 75,   status: 'low',    unit: 'g' },
      carbs:    { intake: 198,  target: 240,  status: 'normal', unit: 'g' },
      fat:      { intake: 58,   target: 65,   status: 'normal', unit: 'g' },
      fiber:    { intake: 12,   target: 28,   status: 'low',    unit: 'g' },
      sodium:   { intake: 2400, target: 2300, status: 'normal', unit: 'mg' },
    },
    micronutrients: [
      { key: 'vit_d',      label: 'Vitamin D',     intake: 600, unit: 'IU',  rdi: 2000, rdi_pct: 30,  status: 'low',
        history: [620, 580, 640, 600, 590, 610, 600, 580, 610, 600, 590, 580, 600, 600] },
      { key: 'vit_b12',    label: 'Vitamin B12',   intake: 4.1, unit: 'µg',  rdi: 2.4,  rdi_pct: 171, status: 'normal',
        history: [3.8, 4.0, 4.2, 4.1, 4.0, 4.1, 4.2, 4.0, 4.1, 4.0, 4.2, 4.1, 4.1, 4.1] },
      { key: 'folate',     label: 'Folate',        intake: 380, unit: 'µg',  rdi: 400,  rdi_pct: 95,  status: 'normal',
        history: [350, 360, 370, 380, 390, 380, 370, 380, 390, 380, 370, 380, 380, 380] },
      { key: 'iron',       label: 'Iron',          intake: 12,  unit: 'mg',  rdi: 18,   rdi_pct: 67,  status: 'low',
        history: [11, 12, 13, 12, 11, 12, 12, 13, 12, 11, 12, 12, 13, 12] },
      { key: 'magnesium',  label: 'Magnesium',     intake: 380, unit: 'mg',  rdi: 320,  rdi_pct: 119, status: 'normal',
        history: [340, 360, 380, 390, 380, 360, 370, 380, 390, 380, 370, 380, 380, 380] },
      { key: 'omega3',     label: 'Omega-3 (EPA+DHA)', intake: 220, unit: 'mg', rdi: 500, rdi_pct: 44, status: 'low',
        history: [200, 210, 220, 230, 220, 210, 220, 230, 220, 210, 220, 220, 220, 220] },
    ],
    supplements: [
      { id: 'sup-sam-1', name: 'Magnesium glycinate', dose: '400 mg', frequency: 'at bedtime', active: true, notes: 'For sleep onset; well-tolerated.' },
      { id: 'sup-sam-2', name: 'Vitamin D3',          dose: '600 IU',  frequency: 'once daily',  active: true, notes: 'Sub-therapeutic — increase to 2000 IU.' },
    ],
    interactions: [
      {
        category: 'micronutrient_deficiency',
        severity: 'major',
        title: 'Vitamin D insufficiency overlapping with depressive presentation',
        mechanism: 'Daily Vitamin D intake (~600 IU) is well below the 2000 IU/day target needed to correct the lab-confirmed 25-OH-D of 18 ng/mL. Insufficiency is associated with blunted SSRI response in MDD.',
        recommendation: 'Increase cholecalciferol to 2000 IU daily; recheck 25-OH-D in 12 weeks. Coordinate with the Labs Analyzer flag (Vit D 18 ng/mL).',
        references: [
          { pmid: '19833552', title: 'Safety of TMS — consensus guideline (Rossi et al., 2009)', year: 2009, journal: 'Clinical Neurophysiology' },
        ],
      },
      {
        category: 'diet_drug',
        severity: 'monitor',
        title: 'Low fiber intake with serotonergic regimen',
        mechanism: 'Fiber 12 g/day (target 28 g) increases risk of SSRI-related GI distress (sertraline + tramadol). Adequate fiber also moderates serum-tryptophan absorption rhythms.',
        recommendation: 'Counsel on dietary fibre (vegetables, legumes, oats); consider psyllium 5 g daily if reflux/constipation reported.',
        references: [],
      },
    ],
    daily_log: [
      { day: '2026-04-30', calories_kcal: 1620, protein_g: 64, carbs_g: 198, fat_g: 58, fiber_g: 12, sodium_mg: 2400 },
      { day: '2026-04-29', calories_kcal: 1580, protein_g: 60, carbs_g: 190, fat_g: 56, fiber_g: 14, sodium_mg: 2350 },
      { day: '2026-04-28', calories_kcal: 1700, protein_g: 68, carbs_g: 210, fat_g: 62, fiber_g: 13, sodium_mg: 2500 },
    ],
  },
  'demo-pt-marcus-chen': {
    patient_id: 'demo-pt-marcus-chen',
    patient_name: 'Marcus Chen',
    captured_at: '2026-04-29T09:15:00Z',
    macros: {
      day: '2026-04-29',
      calories: { intake: 2350, target: 2400, status: 'normal' },
      protein:  { intake: 95,   target: 90,   status: 'normal', unit: 'g' },
      carbs:    { intake: 290,  target: 300,  status: 'normal', unit: 'g' },
      fat:      { intake: 80,   target: 78,   status: 'normal', unit: 'g' },
      fiber:    { intake: 22,   target: 30,   status: 'low',    unit: 'g' },
      sodium:   { intake: 2900, target: 2300, status: 'high',   unit: 'mg' },
    },
    micronutrients: [
      { key: 'vit_d',      label: 'Vitamin D',     intake: 1200, unit: 'IU',  rdi: 2000, rdi_pct: 60,  status: 'low',
        history: [1100, 1150, 1200, 1180, 1200, 1220, 1200, 1180, 1200, 1180, 1200, 1220, 1200, 1200] },
      { key: 'vit_b12',    label: 'Vitamin B12',   intake: 5.2,  unit: 'µg',  rdi: 2.4,  rdi_pct: 217, status: 'normal',
        history: [5.0, 5.1, 5.2, 5.3, 5.2, 5.1, 5.2, 5.3, 5.2, 5.1, 5.2, 5.3, 5.2, 5.2] },
      { key: 'folate',     label: 'Folate',        intake: 420,  unit: 'µg',  rdi: 400,  rdi_pct: 105, status: 'normal',
        history: [410, 420, 430, 420, 410, 420, 430, 420, 410, 420, 430, 420, 420, 420] },
      { key: 'iron',       label: 'Iron',          intake: 10,   unit: 'mg',  rdi: 8,    rdi_pct: 125, status: 'normal',
        history: [9, 10, 11, 10, 9, 10, 11, 10, 9, 10, 11, 10, 10, 10] },
      { key: 'magnesium',  label: 'Magnesium',     intake: 290,  unit: 'mg',  rdi: 420,  rdi_pct: 69,  status: 'low',
        history: [280, 290, 300, 290, 280, 290, 300, 290, 280, 290, 300, 290, 290, 290] },
      { key: 'omega3',     label: 'Omega-3 (EPA+DHA)', intake: 1000, unit: 'mg', rdi: 500, rdi_pct: 200, status: 'normal',
        history: [950, 1000, 1050, 1000, 950, 1000, 1050, 1000, 950, 1000, 1050, 1000, 1000, 1000] },
      { key: 'caffeine',   label: 'Caffeine',      intake: 500,  unit: 'mg',  rdi: 400,  rdi_pct: 125, status: 'high',
        history: [480, 500, 520, 510, 500, 490, 500, 520, 510, 500, 490, 510, 500, 500] },
    ],
    supplements: [
      { id: 'sup-mar-1', name: 'Fish oil (EPA/DHA)', dose: '1 g',   frequency: 'once daily',  active: true, notes: 'Adjunct for mood.' },
      { id: 'sup-mar-2', name: 'L-theanine',         dose: '200 mg', frequency: 'twice daily', active: true, notes: 'For caffeine-related arousal.' },
    ],
    interactions: [
      {
        category: 'diet_drug',
        severity: 'critical',
        title: 'Caffeine + bupropion + rTMS — additive seizure-threshold concern',
        mechanism: 'Habitual caffeine intake of ~500 mg/day (5 cups coffee equivalent) combined with bupropion 150 mg daily (dose-dependent seizure-threshold reduction) and an active rTMS course produces an additive cortical-excitability load. Recent withdrawal-rebound caffeine surges further destabilise the threshold on stim days.',
        recommendation: 'Cap caffeine ≤200 mg/day, no caffeine within 4 h of an rTMS session. Confirm bupropion dose remains ≤300 mg/day. Brief patient on prodromes (tinnitus, twitching, tunnel vision).',
        references: [
          { pmid: '19833552', title: 'Safety of TMS — consensus guideline (Rossi et al., 2009)', year: 2009, journal: 'Clinical Neurophysiology' },
        ],
      },
      {
        category: 'micronutrient_deficiency',
        severity: 'monitor',
        title: 'Low magnesium intake on lithium augmentation',
        mechanism: 'Magnesium 290 mg/day (target 420 mg) co-occurring with sub-therapeutic lithium trough (0.4 mmol/L per Labs Analyzer) may compound mood-stabiliser failure; magnesium adequacy supports lithium pharmacodynamics in some studies.',
        recommendation: 'Encourage magnesium-rich foods (leafy greens, nuts, seeds) or trial magnesium glycinate 200 mg nocte. Coordinate with the lithium dose review.',
        references: [],
      },
      {
        category: 'hydration',
        severity: 'monitor',
        title: 'Low water intake on lithium',
        mechanism: 'Self-report water intake ≈ 800 mL/day with high caffeine load; lithium toxicity risk rises with dehydration via reduced renal clearance.',
        recommendation: 'Target 2.0–2.5 L water/day; counsel on dehydration warning signs (tremor, nausea, confusion).',
        references: [],
      },
    ],
    daily_log: [
      { day: '2026-04-29', calories_kcal: 2350, protein_g: 95, carbs_g: 290, fat_g: 80, fiber_g: 22, sodium_mg: 2900 },
      { day: '2026-04-28', calories_kcal: 2280, protein_g: 92, carbs_g: 280, fat_g: 78, fiber_g: 24, sodium_mg: 2750 },
      { day: '2026-04-27', calories_kcal: 2400, protein_g: 98, carbs_g: 295, fat_g: 82, fiber_g: 21, sodium_mg: 3000 },
    ],
  },
  'demo-pt-elena-vasquez': {
    patient_id: 'demo-pt-elena-vasquez',
    patient_name: 'Elena Vasquez',
    captured_at: '2026-05-01T07:50:00Z',
    macros: {
      day: '2026-05-01',
      calories: { intake: 1850, target: 1900, status: 'normal' },
      protein:  { intake: 78,   target: 75,   status: 'normal', unit: 'g' },
      carbs:    { intake: 230,  target: 220,  status: 'normal', unit: 'g' },
      fat:      { intake: 64,   target: 65,   status: 'normal', unit: 'g' },
      fiber:    { intake: 26,   target: 25,   status: 'normal', unit: 'g' },
      sodium:   { intake: 2100, target: 2300, status: 'normal', unit: 'mg' },
    },
    micronutrients: [
      { key: 'vit_d',      label: 'Vitamin D',     intake: 1500, unit: 'IU', rdi: 2000, rdi_pct: 75, status: 'normal',
        history: [1450, 1500, 1550, 1500, 1450, 1500, 1550, 1500, 1450, 1500, 1550, 1500, 1500, 1500] },
      { key: 'vit_b12',    label: 'Vitamin B12',   intake: 4.6,  unit: 'µg', rdi: 2.4,  rdi_pct: 192, status: 'normal',
        history: [4.5, 4.6, 4.7, 4.6, 4.5, 4.6, 4.7, 4.6, 4.5, 4.6, 4.7, 4.6, 4.6, 4.6] },
      { key: 'folate',     label: 'Folate',        intake: 480,  unit: 'µg', rdi: 400,  rdi_pct: 120, status: 'normal',
        history: [470, 480, 490, 480, 470, 480, 490, 480, 470, 480, 490, 480, 480, 480] },
      { key: 'iron',       label: 'Iron',          intake: 16,   unit: 'mg', rdi: 18,   rdi_pct: 89,  status: 'normal',
        history: [15, 16, 17, 16, 15, 16, 17, 16, 15, 16, 17, 16, 16, 16] },
      { key: 'magnesium',  label: 'Magnesium',     intake: 360,  unit: 'mg', rdi: 320,  rdi_pct: 113, status: 'normal',
        history: [340, 350, 360, 370, 360, 350, 360, 370, 360, 350, 360, 370, 360, 360] },
      { key: 'omega3',     label: 'Omega-3 (EPA+DHA)', intake: 350, unit: 'mg', rdi: 500, rdi_pct: 70, status: 'low',
        history: [330, 340, 350, 360, 350, 340, 350, 360, 350, 340, 350, 360, 350, 350] },
      { key: 'vit_k',      label: 'Vitamin K',     intake: 410,  unit: 'µg', rdi: 90,   rdi_pct: 456, status: 'high',
        history: [380, 400, 420, 410, 390, 400, 420, 430, 410, 400, 420, 430, 410, 410] },
    ],
    supplements: [
      { id: 'sup-ele-1', name: 'Turmeric (curcumin)', dose: '500 mg', frequency: 'twice daily', active: true, notes: 'Self-initiated for joint pain — antiplatelet effect.' },
      { id: 'sup-ele-2', name: 'Multivitamin',        dose: '1 tab',  frequency: 'once daily',  active: true, notes: 'Generic OTC formulation.' },
    ],
    interactions: [
      {
        category: 'diet_drug',
        severity: 'critical',
        title: 'Vitamin K-rich diet destabilising warfarin (INR 3.8) — critical bleed risk',
        mechanism: 'Daily large kale serving (~410 µg vitamin K, 4.5× RDI) drives erratic warfarin response and was followed by a paradoxical INR rise to 3.8 (per Labs Analyzer). The actual concern is week-to-week variability of vitamin K intake rather than absolute amount; intake swings shift effective warfarin dose. Concurrent ibuprofen 400 mg TID adds platelet inhibition; ECT day adds airway/dental trauma exposure.',
        recommendation: 'Stabilise vitamin K intake (consistent leafy-green portion daily, avoid sudden boluses or eliminations). Coordinate with hematology before next ECT session. Stop ibuprofen, switch to paracetamol. Repeat INR in 24 h before re-dosing warfarin.',
        references: [
          { pmid: '19833552', title: 'Safety of TMS — consensus guideline (Rossi et al., 2009)', year: 2009, journal: 'Clinical Neurophysiology' },
        ],
      },
      {
        category: 'supplement_drug',
        severity: 'critical',
        title: 'Turmeric (curcumin) on warfarin + NSAID — additive bleeding risk',
        mechanism: 'Curcumin inhibits platelet aggregation and CYP-mediated warfarin metabolism. Layered on supratherapeutic INR and ibuprofen, it stacks three independent bleeding mechanisms (anticoagulation, COX inhibition, platelet inhibition) — a recognised pre-procedural red flag for ECT.',
        recommendation: 'Stop turmeric supplement until INR back in range and ECT course complete. Document as patient-initiated supplement on the Medication Analyzer. Re-introduce only with hematology sign-off.',
        references: [
          { pmid: '19833552', title: 'Safety of TMS — consensus guideline (Rossi et al., 2009)', year: 2009, journal: 'Clinical Neurophysiology' },
        ],
      },
    ],
    daily_log: [
      { day: '2026-05-01', calories_kcal: 1850, protein_g: 78, carbs_g: 230, fat_g: 64, fiber_g: 26, sodium_mg: 2100 },
      { day: '2026-04-30', calories_kcal: 1820, protein_g: 76, carbs_g: 225, fat_g: 62, fiber_g: 27, sodium_mg: 2050 },
      { day: '2026-04-29', calories_kcal: 1900, protein_g: 80, carbs_g: 235, fat_g: 66, fiber_g: 25, sodium_mg: 2200 },
    ],
  },
};

const _NUTRITION_AUDITS = {
  'demo-pt-samantha-li': [
    { id: 'nut-aud-sam-1', kind: 'recompute',  actor: 'system',          message: 'Nutrition profile recomputed after diet log uploaded.', created_at: '2026-04-30T08:32:00Z' },
    { id: 'nut-aud-sam-2', kind: 'diet-log',   actor: 'Patient (mobile app)', message: 'Logged 2026-04-30 intake (1620 kcal, fiber 12 g).',  created_at: '2026-04-30T08:30:00Z' },
    { id: 'nut-aud-sam-3', kind: 'annotation', actor: 'Dr. A. Yildirim', message: 'Vit D intake 600 IU mirrors lab insufficiency (18 ng/mL) — increase to 2000 IU.', created_at: '2026-04-30T09:14:00Z' },
    { id: 'nut-aud-sam-4', kind: 'supplement-add', actor: 'Patient',     message: 'Added supplement: Magnesium glycinate 400 mg qhs.', created_at: '2026-04-26T20:05:00Z' },
  ],
  'demo-pt-marcus-chen': [
    { id: 'nut-aud-mar-1', kind: 'recompute',  actor: 'system',          message: 'Nutrition profile recomputed after caffeine flag triggered.', created_at: '2026-04-29T09:18:00Z' },
    { id: 'nut-aud-mar-2', kind: 'diet-log',   actor: 'Patient (mobile app)', message: 'Logged 2026-04-29 intake — caffeine 500 mg.', created_at: '2026-04-29T09:15:00Z' },
    { id: 'nut-aud-mar-3', kind: 'annotation', actor: 'Dr. A. Yildirim', message: 'Caffeine 500 mg + bupropion + rTMS — counsel patient to cap at 200 mg/day, not on stim mornings.', created_at: '2026-04-29T10:02:00Z' },
    { id: 'nut-aud-mar-4', kind: 'supplement-add', actor: 'Dr. A. Yildirim', message: 'Started L-theanine 200 mg BID for arousal counterbalance.', created_at: '2026-04-22T11:14:00Z' },
  ],
  'demo-pt-elena-vasquez': [
    { id: 'nut-aud-ele-1', kind: 'recompute',  actor: 'system',          message: 'Nutrition profile recomputed after vit-K bolus logged.', created_at: '2026-05-01T07:52:00Z' },
    { id: 'nut-aud-ele-2', kind: 'diet-log',   actor: 'Patient (mobile app)', message: 'Logged 2026-05-01 intake — kale 200 g (vit K ≈ 410 µg).', created_at: '2026-05-01T07:50:00Z' },
    { id: 'nut-aud-ele-3', kind: 'annotation', actor: 'Dr. A. Yildirim', message: 'Vit K bolus precedes INR rise to 3.8 — counsel on consistent leafy-green intake; halt turmeric until ECT done.', created_at: '2026-05-01T08:08:00Z' },
    { id: 'nut-aud-ele-4', kind: 'supplement-add', actor: 'Patient',     message: 'Added supplement: Turmeric 500 mg BID (self-initiated).', created_at: '2026-04-15T13:22:00Z' },
    { id: 'nut-aud-ele-5', kind: 'annotation', actor: 'Dr. R. Patel',    message: 'Sign-off: stop turmeric pending hematology review; warfarin held tonight.', created_at: '2026-05-01T08:30:00Z' },
  ],
};

function _nutritionProfileFor(patientId) {
  return _NUTRITION_PROFILES[patientId] || null;
}

function _nutritionAuditFor(patientId) {
  const items = _NUTRITION_AUDITS[patientId] || [];
  return { patient_id: patientId, items };
}

function _nutritionClinicSummary() {
  return {
    captured_at: '2026-05-02T07:30:00Z',
    patients: Object.values(_NUTRITION_PROFILES).map((p) => {
      const flags = [];
      (p.micronutrients || []).forEach((m) => {
        if (m.status === 'low')  flags.push({ label: `${m.label} low`,  status: 'low' });
        if (m.status === 'high') flags.push({ label: `${m.label} high`, status: 'high' });
      });
      const macros = p.macros || {};
      ['fiber', 'sodium'].forEach((k) => {
        const v = macros[k];
        if (v && v.status === 'low')  flags.push({ label: `${k} low`,  status: 'low' });
        if (v && v.status === 'high') flags.push({ label: `${k} high`, status: 'high' });
      });
      const supplementCount = (p.supplements || []).length;
      const log = Array.isArray(p.daily_log) ? p.daily_log : [];
      const lastLogDay = log[0]?.day || null;
      const adherencePct = log.length ? Math.min(100, Math.round((log.length / 3) * 100)) : 0;
      const critical = (p.interactions || []).some((i) => i.severity === 'critical');
      return {
        patient_id: p.patient_id,
        patient_name: p.patient_name,
        last_log_day: lastLogDay,
        flags: flags.slice(0, 4),
        supplement_count: supplementCount,
        adherence_pct: adherencePct,
        worst_severity: critical ? 'critical' : (flags.length ? 'monitor' : 'green'),
      };
    }),
  };
}

const _NUTRITION = {
  clinic_summary: _nutritionClinicSummary,
  patient_profile: _nutritionProfileFor,
  patient_audit: _nutritionAuditFor,
};

export const ANALYZER_DEMO_FIXTURES = Object.freeze({
  patients: DEMO_PATIENTS,
  mri: _MRI,
  qeeg: _QEEG,
  voice: _VOICE,
  text: _TEXT,
  risk: _RISK,
  biometrics: _BIOMETRICS,
  video: _VIDEO,
  medication: _MEDICATION,
  treatmentSessions: _TREATMENT_SESSIONS,
  phenotype: _PHENOTYPE,
  movement: _MOVEMENT,
  labs: _LABS,
  nutrition: _NUTRITION,
});

export function isFixtureFallbackActive() {
  return isDemoSession();
}

export const DEMO_FIXTURE_BANNER_HTML =
  '<div class="notice notice-info" data-demo-fixture-banner role="note" style="margin-bottom:14px;font-size:12px">'
  + '<strong>Demo data</strong> — sign in with a real account to see your clinic’s results.'
  + '</div>';

export default ANALYZER_DEMO_FIXTURES;
