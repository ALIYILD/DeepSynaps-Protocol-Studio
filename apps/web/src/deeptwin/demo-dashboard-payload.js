// Shared DeepTwin 360 demo payload for Netlify preview / demo-token sessions.
// Keeps dashboard360.js and api.js demo shim aligned so the 360 tab matches GET /dashboard.

import { EVIDENCE_TOTAL_PAPERS } from '../evidence-dataset.js';
import { getDemoPatientHeader } from './mockData.js';

/**
 * @param {string} patientId
 * @returns {object} Same shape as GET /api/v1/deeptwin/patients/:id/dashboard
 */
export function buildDemoDashboard360Payload(patientId) {
  const header = getDemoPatientHeader(patientId);
  const dx = [header.primary, ...(header.secondary || [])];
  const labels = {
    identity: 'Identity / demographics',
    diagnosis: 'Diagnosis / phenotype',
    symptoms_goals: 'Symptoms / goals',
    assessments: 'Assessments',
    qeeg: 'EEG / qEEG',
    mri: 'MRI / imaging',
    video: 'Video',
    voice: 'Voice',
    text: 'Text / language',
    biometrics: 'Biometrics',
    wearables: 'Wearables',
    cognitive_tasks: 'Cognitive tasks',
    medications: 'Medication / supplements',
    labs: 'Labs / blood biomarkers',
    treatment_sessions: 'Treatment sessions',
    safety_flags: 'Adverse events / safety flags',
    lifestyle: 'Lifestyle / sleep / diet',
    environment: 'Environment',
    caregiver_reports: 'Family / teacher / caregiver reports',
    clinical_documents: 'Clinical documents',
    outcomes: 'Outcomes',
    twin_predictions: 'DeepTwin predictions and confidence',
  };
  const card = (key, status, summary, extra = {}) => ({
    key, label: labels[key], status,
    record_count: status === 'available' ? 1 : 0,
    last_updated: null,
    summary,
    warnings: extra.warnings || [],
    source_links: extra.source_links || [],
    upload_links: extra.upload_links || [],
  });
  const domains = [
    card('identity', 'available', header.name),
    card('diagnosis', 'available', dx.join(' · ')),
    card('symptoms_goals', 'partial', 'Demo intake notes only.'),
    card('assessments', 'missing', 'No assessment scores in this demo seed.', {
      upload_links: [{ label: 'Submit assessment', href: '/assessments', kind: 'assessment' }],
    }),
    card('qeeg', 'missing', 'No qEEG records in this demo seed.', {
      upload_links: [{ label: 'Upload qEEG', href: '/qeeg-launcher', kind: 'qeeg' }],
    }),
    card('mri', 'missing', 'No MRI records in this demo seed.', {
      upload_links: [{ label: 'Upload MRI', href: '/mri-analysis', kind: 'mri' }],
    }),
    card('video', 'missing', `No video analyses on file. When present, each task section carries evidence_context: registry-backed (${EVIDENCE_TOTAL_PAPERS.toLocaleString()} papers) condition anchors + rationale for why kinematics map to literature — not diagnostic proof.`, {
      warnings: ['Video movement/monitoring outputs are not clinically validated diagnostic scores.'],
      source_links: [
        { label: 'Research evidence (87k)', href: '/research-evidence' },
        { label: 'Patient analytics · video panel', href: '/patient-analytics' },
      ],
      upload_links: [{ label: 'Open video visits', href: '/virtualcare', kind: 'video' }],
    }),
    card('voice', 'missing', 'No voice analyses on file.'),
    card('text', 'missing', 'No journal or message text on file.'),
    card('biometrics', 'missing', 'No biometric observations on file.'),
    card('wearables', 'missing', 'No wearable daily summaries on file.'),
    card('cognitive_tasks', 'unavailable', 'No cognitive-task ingestion path in the platform yet.', {
      warnings: ['Domain is structurally unavailable, not data-missing.'],
    }),
    card('medications', header.medications.length ? 'available' : 'missing',
      header.medications.length ? `${header.medications.length} medication(s) on file (demo).` : 'No medications on file.'),
    card('labs', 'unavailable', 'No labs/biomarker ingestion path in the platform yet.', {
      warnings: ['Domain is structurally unavailable, not data-missing.'],
    }),
    card('treatment_sessions', 'missing', 'No treatment sessions on file.'),
    card('safety_flags', 'missing', 'No adverse events or safety flags on file.'),
    card('lifestyle', 'missing', 'No lifestyle / sleep observations available; diet not ingested.'),
    card('environment', 'unavailable', 'No environmental-context ingestion path in the platform yet.', {
      warnings: ['Domain is structurally unavailable, not data-missing.'],
    }),
    card('caregiver_reports', 'unavailable', 'No family/teacher/caregiver-report ingestion path yet.', {
      warnings: ['Domain is structurally unavailable, not data-missing.'],
    }),
    card('clinical_documents', 'partial', 'Document templates exist; per-patient generated documents not yet aggregated here.'),
    card('outcomes', 'missing', 'No outcome series or events on file.'),
    card('twin_predictions', 'partial', 'DeepTwin predictions are model-estimated and uncalibrated.', {
      warnings: ['DeepTwin model is currently a deterministic placeholder; no validated outcome calibration.'],
    }),
  ];
  const available = domains.filter(d => d.status === 'available').length;
  const partialCount = domains.filter(d => d.status === 'partial').length;
  const missing = domains.filter(d => d.status === 'missing').length;
  return {
    patient_id: patientId,
    generated_at: new Date().toISOString(),
    patient_summary: {
      name: header.name, age: header.age,
      diagnosis: dx, phenotype: [], primary_goals: [], risk_level: 'unknown',
    },
    completeness: {
      score: Math.round(((available + 0.5 * partialCount) / 22) * 1000) / 1000,
      available_domains: available, partial_domains: partialCount,
      missing_domains: missing,
      high_priority_missing: ['qeeg', 'assessments', 'treatment_sessions', 'outcomes'],
    },
    safety: { adverse_events: [], contraindications: [], red_flags: [], medication_confounds: [] },
    domains,
    timeline: [], correlations: [],
    outcomes: { series_count: 0, event_count: 0, summary: 'No outcomes on file (demo).' },
    prediction_confidence: {
      status: 'placeholder', real_ai: false, confidence: null,
      confidence_label: 'Not calibrated',
      summary: 'Decision-support only. Requires clinician review.',
      drivers: [],
      limitations: [
        'No validated outcome dataset bound to this engine.',
        'Encoders are deterministic feature extractors, not trained ML.',
        'Predictions must not be used as autonomous treatment recommendations.',
      ],
    },
    clinician_notes: [],
    review: { reviewed: false, reviewed_by: null, reviewed_at: null },
    disclaimer: 'Decision-support only. Requires clinician review. Correlation does not imply causation. Predictions are uncalibrated unless validated. Not an autonomous treatment recommendation.',
    _demo: true,
    is_demo_view: true,
  };
}
