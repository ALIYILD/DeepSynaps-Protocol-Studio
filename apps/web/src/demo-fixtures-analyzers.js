import { isDemoSession } from './demo-session.js';
import {
  buildMovementAnalyzerDemoPayload,
  movementDemoAudit,
} from './demo-fixtures-movement-analyzer.js';

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

const _MOVEMENT = {
  patient: buildMovementAnalyzerDemoPayload,
  audit: movementDemoAudit,
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

const _PHENOTYPE = {
  catalog: _PHENOTYPE_CATALOG,
  all_assignments: _PHENOTYPE_ASSIGNMENTS,
  assignments_for: _phenotypeAssignmentsFor,
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
  movement: _MOVEMENT,
  phenotype: _PHENOTYPE,
});

export function isFixtureFallbackActive() {
  return isDemoSession();
}

export const DEMO_FIXTURE_BANNER_HTML =
  '<div class="notice notice-info" data-demo-fixture-banner role="note" style="margin-bottom:14px;font-size:12px">'
  + '<strong>Demo data</strong> — sign in with a real account to see your clinic’s results.'
  + '</div>';

export default ANALYZER_DEMO_FIXTURES;
export { buildMovementAnalyzerDemoPayload } from './demo-fixtures-movement-analyzer.js';
