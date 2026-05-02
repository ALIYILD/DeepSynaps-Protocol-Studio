// ─────────────────────────────────────────────────────────────────────────────
// Clinical presets for Video Assessments — virtual-care motor protocol.
// Guides literature retrieval + motion-proxy interpretation copy. Not diagnosis.
// ─────────────────────────────────────────────────────────────────────────────

/** @typedef {{ id: string, label: string, evidence_diagnosis: string, evidence_target?: string, phenotype_tags: string[], patient_hint: string, reviewer_focus: string }} VaConditionPreset */

/** @type {VaConditionPreset[]} */
export const VA_CONDITION_PRESETS = [
  {
    id: 'parkinsonism_followup',
    label: "Parkinson's / parkinsonism follow-up (meds, DBS, TMS monitoring)",
    evidence_diagnosis: 'parkinson disease',
    evidence_target: 'remote_motor_exam',
    phenotype_tags: [
      'Parkinson disease',
      'parkinsonism',
      'bradykinesia',
      'rest tremor',
      'postural tremor',
      'gait freezing',
      'neuromodulation',
      'DBS',
    ],
    patient_hint:
      'Protocol emphasizes tremor, repetitive movements, gait, and balance — typical for Parkinsonism follow-up. Skip anything unsafe.',
    reviewer_focus:
      'Compare rest vs postural tremor tasks, finger/foot tap asymmetry, gait and turns; correlate automated motion proxy with your structured scores only as adjunct.',
  },
  {
    id: 'essential_tremor',
    label: 'Essential tremor / action tremor follow-up',
    evidence_diagnosis: 'essential tremor',
    evidence_target: 'remote_motor_exam',
    phenotype_tags: ['essential tremor', 'action tremor', 'kinetic tremor', 'upper limb tremor', 'propranolol'],
    patient_hint: 'Postural and kinetic tasks matter most; rest tremor may be minimal. Keep hands well lit and in frame.',
    reviewer_focus:
      'Weight postural & kinetic tasks; motion peaks on repetitive tasks may reflect oscillatory movement — not a tremor frequency measurement.',
  },
  {
    id: 'ataxia_balance',
    label: 'Ataxia / imbalance / wide-based gait concern',
    evidence_diagnosis: 'ataxia',
    evidence_target: 'remote_motor_exam',
    phenotype_tags: ['ataxia', 'cerebellar', 'gait imbalance', 'wide-based gait', 'fall risk', 'truncal ataxia'],
    patient_hint: 'Standing, gait, and finger-to-nose are priorities; use a sturdy chair and assistance if your team advised it.',
    reviewer_focus:
      'Emphasize gait, turns, finger-to-nose; frame-difference metrics are crude — use for gross QA of movement visibility, not stance stability.',
  },
  {
    id: 'dystonia',
    label: 'Dystonia / sustained abnormal postures (focal or generalized)',
    evidence_diagnosis: 'dystonia',
    evidence_target: 'remote_motor_exam',
    phenotype_tags: ['dystonia', 'cervical dystonia', 'blepharospasm', 'task-specific dystonia', 'BoNT'],
    patient_hint: 'Capture typical postures your clinician asked you to monitor; avoid prolonged forced holds if painful.',
    reviewer_focus:
      'Sustained postures may reduce repetitive peak counts while overall pixel motion stays elevated — interpret metrics cautiously.',
  },
  {
    id: 'stroke_rehab_hemiparesis',
    label: 'Stroke rehabilitation / hemiparesis motor check-in',
    evidence_diagnosis: 'stroke',
    evidence_target: 'remote_motor_exam',
    phenotype_tags: ['stroke', 'hemiparesis', 'motor recovery', 'rehabilitation', 'gait training'],
    patient_hint: 'One-sided weakness: keep both limbs visible when instructed; skip standing tasks if unsafe alone.',
    reviewer_focus:
      'Look for left-right asymmetry on bilateral tasks; automated symmetry is not computed — rely on structured scoring.',
  },
  {
    id: 'general_movement_disorder',
    label: 'General movement disorder / neurology televisit (unspecified)',
    evidence_diagnosis: 'movement disorder',
    evidence_target: 'remote_motor_exam',
    phenotype_tags: ['movement disorder', 'telemedicine', 'remote neurological examination', 'motor examination'],
    patient_hint: 'Complete tasks your clinician prioritized; document skips honestly.',
    reviewer_focus: 'Use full protocol as context; motion proxy is exploratory across heterogeneous presentations.',
  },
];

export const VA_DEFAULT_PRESET_ID = 'parkinsonism_followup';

/**
 * @param {string} id
 * @returns {VaConditionPreset | undefined}
 */
export function getVaPreset(id) {
  return VA_CONDITION_PRESETS.find((p) => p.id === id);
}

/**
 * Merge preset defaults into stored clinical_context from API.
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeClinicalContext(raw) {
  const presetId =
    (raw && typeof raw.preset_id === 'string' && raw.preset_id) || VA_DEFAULT_PRESET_ID;
  const preset = getVaPreset(presetId) || getVaPreset(VA_DEFAULT_PRESET_ID);
  return {
    preset_id: preset?.id || presetId,
    condition_label: typeof raw?.condition_label === 'string' ? raw.condition_label : preset?.label || '',
    custom_indication:
      typeof raw?.custom_indication === 'string' ? raw.custom_indication.trim().slice(0, 240) : '',
    set_at:
      typeof raw?.set_at === 'string'
        ? raw.set_at
        : new Date().toISOString(),
  };
}
