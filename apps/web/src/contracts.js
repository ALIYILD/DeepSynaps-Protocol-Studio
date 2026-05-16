/**
 * Canonical contract definitions for DeepSynaps Multimodal Intelligence Engine.
 * Mirrors the Python backend contracts for type consistency.
 */

export const DATA_QUALITY_LEVELS = ["high", "medium", "low", "missing", "unknown"];
export const EVIDENCE_GRADES = ["A", "B", "C", "D"];
export const CONFIDENCE_THRESHOLD = 0.95;

export const SAFETY_LABELS = {
  TEMPORAL_ONLY: "Temporal association only. Not causal proof.",
  REQUIRES_REVIEW: "Decision support only. Requires clinician review.",
  RANKED_HYPOTHESIS: "Ranked clinical hypothesis. Requires clinician review.",
  NOT_CAUSAL: "Not causal proof.",
  EVIDENCE_PREFIX: "Evidence strength: ",
  DATA_QUALITY_PREFIX: "Data quality: ",
  POSSIBLE_CONTRIBUTOR: "Possible contributor.",
};

export const MODALITY_TYPES = [
  "assessment",
  "qeeg",
  "mri",
  "biomarker",
  "medication",
  "intervention",
  "voice",
  "text",
  "video",
  "wearable",
  "digital_phenotyping",
  "risk_signal",
  "report",
  "patient_checkin",
];

/**
 * Validate an event object against the MultimodalEvent contract.
 */
export function validateEvent(event) {
  const required = [
    "event_id", "patient_id", "event_type", "modality",
    "source_system", "source_record_id", "timestamp", "value_summary",
  ];
  const errors = [];
  for (const field of required) {
    if (event[field] === undefined || event[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (event.confidence !== undefined && (event.confidence < 0 || event.confidence > 1)) {
    errors.push("confidence must be between 0 and 1");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate an insight object against the IntelligenceOutput contract.
 */
export function validateInsight(insight) {
  const errors = [];
  if (!insight.clinician_review_required) {
    errors.push("clinician_review_required must be true for all insights");
  }
  if (!insight.safety_labels || insight.safety_labels.length === 0) {
    errors.push("safety_labels must be populated");
  }
  if (insight.confidence >= CONFIDENCE_THRESHOLD) {
    errors.push("confidence for clinical interpretation must be < 0.95");
  }
  if (!insight.uncertainty_drivers || insight.uncertainty_drivers.length === 0) {
    errors.push("uncertainty_drivers must be populated");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Check if an insight contains causal overclaiming language.
 */
export function containsCausalOverclaiming(summary) {
  const overclaimPatterns = [
    /caused by/i, /causes/i, /proven/i, /definitely/i,
    /autonomous diagnosis/i, /autonomous treatment/i,
    /treatment recommendation/i, /prescribe/i,
    /black.box/i, /certain/i, /guaranteed/i,
  ];
  return overclaimPatterns.some(p => p.test(summary || ""));
}
