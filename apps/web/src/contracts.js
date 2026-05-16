/**
 * Canonical contract definitions for DeepSynaps Multimodal Intelligence Engine.
 * Mirrors the Python backend contracts for type consistency.
 *
 * Changelog:
 *  - Added validateEvidenceLink, validateConfounderCandidate
 *  - Added validateSynthesisRequest, validateSynthesisResponse
 *  - Added validateDeepTwinSnapshot, validateClinicianReview
 *  - Added validateDeepTwinAuditEvent, validateDeepTwinExport
 *  - Added sweepSafetyWording() utility for safety-label enforcement
 *  - Added isDemoMode() detection helper
 *  - Aligned all field names with Python contracts.py and deeptwin_contracts.py
 */

/* ------------------------------------------------------------------ */
/*  Constants matching Python enums / hard-coded sets                */
/* ------------------------------------------------------------------ */

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
  DEEPTWIN_DISCLAIMER:
    "Decision support only. Requires clinician review. DeepTwin does not diagnose, prescribe, or prove causality.",
  SYNTHESIS_DISCLAIMER:
    "This output is decision support only and requires clinician review. It does not constitute a diagnosis or treatment recommendation.",
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

export const CLINICIAN_REVIEW_ACTIONS = [
  "accept",
  "reject",
  "note",
  "request_data",
  "report",
  "protocol",
  "export",
  "mark_reviewed",
];

export const DEEPTWIN_EVENT_TYPES = [
  "deeptwin_opened",
  "snapshot_generated",
  "synthesis_requested",
  "hypothesis_accepted",
  "hypothesis_rejected",
  "hypothesis_noted",
  "data_requested",
  "report_handoff",
  "protocol_handoff",
  "export_generated",
  "review_completed",
];

export const DEEPTWIN_EXPORT_TYPES = ["json", "pdf", "report_handoff", "protocol_handoff"];

/* ------------------------------------------------------------------ */
/*  Word lists for safety sweep & causal-overclaim detection          */
/* ------------------------------------------------------------------ */

const CAUSAL_OVERCLAIM_PATTERNS = [
  /caused by/gi,
  /causes\b/gi,
  /proven/gi,
  /definitely/gi,
  /autonomous diagnosis/gi,
  /autonomous treatment/gi,
  /treatment recommendation/gi,
  /prescribe/gi,
  /black[-\s]?box/gi,
  /certain/gi,
  /guaranteed/gi,
];

const SAFETY_MANDATORY_LABELS = [
  "Decision support only. Requires clinician review.",
];

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function isOptionalString(v) {
  return v === undefined || v === null || typeof v === "string";
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isIsoDate(v) {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v);
}

/* ------------------------------------------------------------------ */
/*  1. MultimodalEvent                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate an event object against the MultimodalEvent contract.
 * Mirrors Python: contracts.py::MultimodalEvent
 */
export function validateEvent(event) {
  const errors = [];

  // Required scalar fields
  for (const field of [
    "event_id",
    "patient_id",
    "event_type",
    "modality",
    "source_system",
    "source_record_id",
    "timestamp",
    "value_summary",
  ]) {
    if (!isNonEmptyString(event[field])) {
      errors.push(`Missing or empty required field: ${field}`);
    }
  }

  // Optional: data_quality must be one of the known levels
  if (event.data_quality !== undefined && event.data_quality !== null) {
    if (!DATA_QUALITY_LEVELS.includes(event.data_quality)) {
      errors.push(`data_quality must be one of: ${DATA_QUALITY_LEVELS.join(", ")}`);
    }
  }

  // Optional: confidence must be in [0, 1]
  if (event.confidence !== undefined && event.confidence !== null) {
    if (typeof event.confidence !== "number" || event.confidence < 0 || event.confidence > 1) {
      errors.push("confidence must be a number between 0 and 1");
    }
  }

  // Optional: provenance must be a plain object
  if (event.provenance !== undefined && event.provenance !== null && !isPlainObject(event.provenance)) {
    errors.push("provenance must be an object");
  }

  // Optional: evidence_links must be an array of strings
  if (event.evidence_links !== undefined && event.evidence_links !== null) {
    if (!Array.isArray(event.evidence_links)) {
      errors.push("evidence_links must be an array");
    } else if (event.evidence_links.length > 0 && !event.evidence_links.every((e) => typeof e === "string")) {
      errors.push("evidence_links must be an array of strings");
    }
  }

  // Optional: audit_reference should be a string
  if (event.audit_reference !== undefined && event.audit_reference !== null && typeof event.audit_reference !== "string") {
    errors.push("audit_reference must be a string");
  }

  // Optional: numeric_features must be an object with number values
  if (event.numeric_features !== undefined && event.numeric_features !== null) {
    if (!isPlainObject(event.numeric_features)) {
      errors.push("numeric_features must be an object");
    } else if (!Object.values(event.numeric_features).every((v) => typeof v === "number")) {
      errors.push("numeric_features values must all be numbers");
    }
  }

  // Optional: textual_summary should be a string
  if (event.textual_summary !== undefined && event.textual_summary !== null && typeof event.textual_summary !== "string") {
    errors.push("textual_summary must be a string");
  }

  // Optional: timestamp should be ISO-8601
  if (event.timestamp !== undefined && event.timestamp !== null && !isIsoDate(event.timestamp)) {
    errors.push("timestamp must be an ISO-8601 datetime string");
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  2. EvidenceLink                                                    */
/* ------------------------------------------------------------------ */

/**
 * Validate an EvidenceLink object.
 * Mirrors Python: contracts.py::EvidenceLink
 */
export function validateEvidenceLink(link) {
  const errors = [];

  for (const field of ["evidence_id", "source_type", "citation", "evidence_grade"]) {
    if (!isNonEmptyString(link[field])) {
      errors.push(`Missing or empty required field: ${field}`);
    }
  }

  if (link.evidence_grade !== undefined && !EVIDENCE_GRADES.includes(link.evidence_grade)) {
    errors.push(`evidence_grade must be one of: ${EVIDENCE_GRADES.join(", ")}`);
  }

  if (link.confidence !== undefined && link.confidence !== null) {
    if (typeof link.confidence !== "number" || link.confidence < 0 || link.confidence > 1) {
      errors.push("confidence must be a number between 0 and 1");
    }
  }

  if (link.research_only !== undefined && typeof link.research_only !== "boolean") {
    errors.push("research_only must be a boolean");
  }

  if (link.conflicting !== undefined && typeof link.conflicting !== "boolean") {
    errors.push("conflicting must be a boolean");
  }

  if (link.url !== undefined && link.url !== null && typeof link.url !== "string") {
    errors.push("url must be a string");
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  3. ConfounderCandidate                                             */
/* ------------------------------------------------------------------ */

/**
 * Validate a ConfounderCandidate object.
 * Mirrors Python: contracts.py::ConfounderCandidate
 */
export function validateConfounderCandidate(c) {
  const errors = [];

  for (const field of ["confounder_id", "confounder_type", "description"]) {
    if (!isNonEmptyString(c[field])) {
      errors.push(`Missing or empty required field: ${field}`);
    }
  }

  if (c.severity !== undefined && !["high", "moderate", "low"].includes(c.severity)) {
    errors.push("severity must be one of: high, moderate, low");
  }

  if (c.evidence_events !== undefined && c.evidence_events !== null && !Array.isArray(c.evidence_events)) {
    errors.push("evidence_events must be an array");
  }

  if (c.impact_estimate !== undefined && typeof c.impact_estimate !== "string") {
    errors.push("impact_estimate must be a string");
  }

  if (c.mitigation_suggestion !== undefined && typeof c.mitigation_suggestion !== "string") {
    errors.push("mitigation_suggestion must be a string");
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  4. IntelligenceOutput                                              */
/* ------------------------------------------------------------------ */

/**
 * Validate an insight object against the IntelligenceOutput contract.
 * Mirrors Python: contracts.py::IntelligenceOutput
 */
export function validateInsight(insight) {
  const errors = [];

  // Required fields
  for (const field of ["patient_id", "insight_type", "modalities_involved", "timeline_window", "summary"]) {
    const v = insight[field];
    if (field === "modalities_involved") {
      if (!Array.isArray(v) || v.length === 0) {
        errors.push("modalities_involved must be a non-empty array");
      }
    } else if (field === "timeline_window") {
      if (!Array.isArray(v) || v.length !== 2) {
        errors.push("timeline_window must be a 2-element array [start, end]");
      }
    } else if (!isNonEmptyString(v)) {
      errors.push(`Missing or empty required field: ${field}`);
    }
  }

  // Safety enforcement: clinician_review_required must be true
  if (insight.clinician_review_required !== true) {
    errors.push("clinician_review_required must be true for all insights");
  }

  // Safety enforcement: safety_labels must be populated
  if (!Array.isArray(insight.safety_labels) || insight.safety_labels.length === 0) {
    errors.push("safety_labels must be populated with at least one safety label");
  }

  // Confidence ceiling check
  if (insight.confidence !== undefined && insight.confidence !== null) {
    if (typeof insight.confidence !== "number") {
      errors.push("confidence must be a number");
    } else if (insight.confidence >= CONFIDENCE_THRESHOLD) {
      errors.push(`confidence for clinical interpretation must be < ${CONFIDENCE_THRESHOLD}`);
    }
  }

  // uncertainty_drivers must be populated
  if (!Array.isArray(insight.uncertainty_drivers) || insight.uncertainty_drivers.length === 0) {
    errors.push("uncertainty_drivers must be populated with at least one driver");
  }

  // Optional array fields type checks
  if (insight.supporting_events !== undefined && !Array.isArray(insight.supporting_events)) {
    errors.push("supporting_events must be an array");
  }
  if (insight.conflicting_events !== undefined && !Array.isArray(insight.conflicting_events)) {
    errors.push("conflicting_events must be an array");
  }
  if (insight.confounders !== undefined && !Array.isArray(insight.confounders)) {
    errors.push("confounders must be an array");
  }
  if (insight.evidence_links !== undefined && !Array.isArray(insight.evidence_links)) {
    errors.push("evidence_links must be an array");
  }

  // research_only should be boolean
  if (insight.research_only !== undefined && typeof insight.research_only !== "boolean") {
    errors.push("research_only must be a boolean");
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  5. SynthesisRequest                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate a SynthesisRequest payload.
 * Mirrors Python: contracts.py::SynthesisRequest
 */
export function validateSynthesisRequest(req) {
  const errors = [];

  if (!isNonEmptyString(req.patient_id)) {
    errors.push("Missing or empty required field: patient_id");
  }

  if (req.include_modalities !== undefined && req.include_modalities !== null) {
    if (!Array.isArray(req.include_modalities)) {
      errors.push("include_modalities must be an array");
    } else {
      const invalid = req.include_modalities.filter((m) => !MODALITY_TYPES.includes(m));
      if (invalid.length > 0) {
        errors.push(`Invalid modality types: ${invalid.join(", ")}`);
      }
    }
  }

  if (req.date_range !== undefined && req.date_range !== null) {
    if (!Array.isArray(req.date_range) || req.date_range.length !== 2) {
      errors.push("date_range must be a 2-element array [from, to]");
    } else {
      if (!isNonEmptyString(req.date_range[0])) errors.push("date_range[0] must be a date string");
      if (!isNonEmptyString(req.date_range[1])) errors.push("date_range[1] must be a date string");
    }
  }

  if (req.focus_areas !== undefined && req.focus_areas !== null && !Array.isArray(req.focus_areas)) {
    errors.push("focus_areas must be an array");
  }

  if (req.min_confidence !== undefined && req.min_confidence !== null) {
    if (typeof req.min_confidence !== "number" || req.min_confidence < 0 || req.min_confidence > 1) {
      errors.push("min_confidence must be a number between 0 and 1");
    }
  }

  if (req.max_hypotheses !== undefined && req.max_hypotheses !== null) {
    if (!Number.isInteger(req.max_hypotheses) || req.max_hypotheses < 1) {
      errors.push("max_hypotheses must be a positive integer");
    }
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  6. SynthesisResponse                                               */
/* ------------------------------------------------------------------ */

/**
 * Validate a SynthesisResponse payload.
 * Mirrors Python: contracts.py::SynthesisResponse
 */
export function validateSynthesisResponse(res) {
  const errors = [];

  if (!isNonEmptyString(res.patient_id)) {
    errors.push("Missing or empty required field: patient_id");
  }
  if (!isNonEmptyString(res.synthesis_id)) {
    errors.push("Missing or empty required field: synthesis_id");
  }
  if (res.generated_at !== undefined && !isIsoDate(res.generated_at)) {
    errors.push("generated_at must be an ISO-8601 datetime string");
  }

  // Array fields
  for (const field of ["timeline", "correlations", "confounders", "quality_flags", "ranked_hypotheses"]) {
    if (res[field] !== undefined && res[field] !== null && !Array.isArray(res[field])) {
      errors.push(`${field} must be an array`);
    }
  }

  // evidence_summary should be an object
  if (res.evidence_summary !== undefined && res.evidence_summary !== null && !isPlainObject(res.evidence_summary)) {
    errors.push("evidence_summary must be an object");
  }

  // Safety disclaimer must be present
  if (!isNonEmptyString(res.safety_disclaimer)) {
    errors.push("safety_disclaimer is required and must not be empty");
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  7. DeepTwinSnapshot                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate a DeepTwinSnapshot payload.
 * Mirrors Python: deeptwin_contracts.py::DeepTwinSnapshot
 */
export function validateDeepTwinSnapshot(snap) {
  const errors = [];

  if (!isNonEmptyString(snap.patient_id)) {
    errors.push("Missing or empty required field: patient_id");
  }
  if (!isNonEmptyString(snap.snapshot_id)) {
    errors.push("Missing or empty required field: snapshot_id");
  }
  if (snap.generated_at !== undefined && !isIsoDate(snap.generated_at)) {
    errors.push("generated_at must be an ISO-8601 datetime string");
  }

  // Object / Array field type checks
  if (snap.modality_coverage !== undefined && !isPlainObject(snap.modality_coverage)) {
    errors.push("modality_coverage must be an object");
  }
  if (snap.recency_status !== undefined && !isPlainObject(snap.recency_status)) {
    errors.push("recency_status must be an object");
  }

  for (const field of [
    "data_quality_flags",
    "timeline_events",
    "correlation_findings",
    "confounders",
    "ranked_hypotheses",
    "evidence_links",
    "uncertainty_drivers",
  ]) {
    if (snap[field] !== undefined && snap[field] !== null && !Array.isArray(snap[field])) {
      errors.push(`${field} must be an array`);
    }
  }

  // forecast_status — must be a string (e.g. "unavailable: no calibrated model")
  if (snap.forecast_status !== undefined && snap.forecast_status !== null && typeof snap.forecast_status !== "string") {
    errors.push("forecast_status must be a string");
  }

  // clinician_review_status — must be an object
  if (
    snap.clinician_review_status !== undefined &&
    snap.clinician_review_status !== null &&
    !isPlainObject(snap.clinician_review_status)
  ) {
    errors.push("clinician_review_status must be an object");
  }

  // provenance — must be an object
  if (snap.provenance !== undefined && snap.provenance !== null && !isPlainObject(snap.provenance)) {
    errors.push("provenance must be an object");
  }

  // Safety disclaimer must be present
  if (!isNonEmptyString(snap.safety_disclaimer)) {
    errors.push("safety_disclaimer is required and must not be empty");
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  8. ClinicianReview                                                 */
/* ------------------------------------------------------------------ */

/**
 * Validate a ClinicianReview payload.
 * Mirrors Python: deeptwin_contracts.py::ClinicianReview
 */
export function validateClinicianReview(review) {
  const errors = [];

  for (const field of ["patient_id", "clinician_id", "snapshot_id", "hypothesis_id", "action"]) {
    if (!isNonEmptyString(review[field])) {
      errors.push(`Missing or empty required field: ${field}`);
    }
  }

  if (review.action !== undefined && !CLINICIAN_REVIEW_ACTIONS.includes(review.action)) {
    errors.push(`action must be one of: ${CLINICIAN_REVIEW_ACTIONS.join(", ")}`);
  }

  if (review.review_id !== undefined && review.review_id !== null && typeof review.review_id !== "string") {
    errors.push("review_id must be a string");
  }

  if (review.note !== undefined && typeof review.note !== "string") {
    errors.push("note must be a string");
  }

  if (review.requested_modalities !== undefined && !Array.isArray(review.requested_modalities)) {
    errors.push("requested_modalities must be an array");
  }

  if (review.follow_up_tasks !== undefined && !Array.isArray(review.follow_up_tasks)) {
    errors.push("follow_up_tasks must be an array");
  }

  if (review.reviewed_at !== undefined && review.reviewed_at !== null && !isIsoDate(review.reviewed_at)) {
    errors.push("reviewed_at must be an ISO-8601 datetime string");
  }

  if (review.audit_reference !== undefined && typeof review.audit_reference !== "string") {
    errors.push("audit_reference must be a string");
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  9. DeepTwinAuditEvent                                              */
/* ------------------------------------------------------------------ */

/**
 * Validate a DeepTwinAuditEvent payload.
 * Mirrors Python: deeptwin_contracts.py::DeepTwinAuditEvent
 */
export function validateDeepTwinAuditEvent(evt) {
  const errors = [];

  for (const field of ["patient_id", "clinician_id", "event_type"]) {
    if (!isNonEmptyString(evt[field])) {
      errors.push(`Missing or empty required field: ${field}`);
    }
  }

  if (evt.event_type !== undefined && !DEEPTWIN_EVENT_TYPES.includes(evt.event_type)) {
    errors.push(`event_type must be one of: ${DEEPTWIN_EVENT_TYPES.join(", ")}`);
  }

  if (evt.event_id !== undefined && evt.event_id !== null && typeof evt.event_id !== "string") {
    errors.push("event_id must be a string");
  }

  if (evt.snapshot_id !== undefined && evt.snapshot_id !== null && typeof evt.snapshot_id !== "string") {
    errors.push("snapshot_id must be a string");
  }

  if (evt.details !== undefined && evt.details !== null && !isPlainObject(evt.details)) {
    errors.push("details must be an object");
  }

  if (evt.timestamp !== undefined && evt.timestamp !== null && !isIsoDate(evt.timestamp)) {
    errors.push("timestamp must be an ISO-8601 datetime string");
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  10. DeepTwinExport                                                 */
/* ------------------------------------------------------------------ */

/**
 * Validate a DeepTwinExport payload.
 * Mirrors Python: deeptwin_contracts.py::DeepTwinExport
 */
export function validateDeepTwinExport(exp) {
  const errors = [];

  if (!isNonEmptyString(exp.export_type)) {
    errors.push("Missing or empty required field: export_type");
  }

  if (exp.export_type !== undefined && !DEEPTWIN_EXPORT_TYPES.includes(exp.export_type)) {
    errors.push(`export_type must be one of: ${DEEPTWIN_EXPORT_TYPES.join(", ")}`);
  }

  for (const field of ["export_id", "snapshot_id", "patient_id", "clinician_id"]) {
    if (exp[field] !== undefined && exp[field] !== null && typeof exp[field] !== "string") {
      errors.push(`${field} must be a string`);
    }
  }

  if (exp.content !== undefined && exp.content !== null && !isPlainObject(exp.content)) {
    errors.push("content must be an object");
  }

  if (exp.exported_at !== undefined && exp.exported_at !== null && !isIsoDate(exp.exported_at)) {
    errors.push("exported_at must be an ISO-8601 datetime string");
  }

  if (exp.audit_reference !== undefined && typeof exp.audit_reference !== "string") {
    errors.push("audit_reference must be a string");
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  11. Causal overclaim detection                                     */
/* ------------------------------------------------------------------ */

/**
 * Check if a summary string contains causal overclaiming language.
 * Returns every matched pattern so callers can log specifics.
 */
export function containsCausalOverclaiming(summary) {
  if (!summary || typeof summary !== "string") return { flagged: false, matches: [] };
  const matches = [];
  for (const pattern of CAUSAL_OVERCLAIM_PATTERNS) {
    const found = summary.match(pattern);
    if (found) matches.push(found[0]);
  }
  return { flagged: matches.length > 0, matches };
}

/* ------------------------------------------------------------------ */
/*  12. Safety wording sweep                                           */
/* ------------------------------------------------------------------ */

/**
 * Sweep an insight / snapshot / any payload and enforce safety wording.
 *
 * - Ensures safety_labels array contains mandatory safety strings.
 * - Ensures safety_disclaimer is present and non-empty.
 * - Flags causal overclaiming in the summary field.
 *
 * @param {Object} payload — any object with safety_labels and/or safety_disclaimer + summary
 * @returns {{valid: boolean, errors: string[], fixed: Object}}
 *
 * The `fixed` object is a shallow copy with auto-corrected safety fields
 * (safe to use as a drop-in replacement).
 */
export function sweepSafetyWording(payload) {
  const errors = [];
  const fixed = { ...payload };

  // 1. safety_labels check
  if (fixed.safety_labels !== undefined) {
    if (!Array.isArray(fixed.safety_labels)) {
      errors.push("safety_labels must be an array");
      fixed.safety_labels = [...SAFETY_MANDATORY_LABELS];
    } else {
      const missing = SAFETY_MANDATORY_LABELS.filter((label) => !fixed.safety_labels.includes(label));
      if (missing.length > 0) {
        errors.push(`Missing mandatory safety labels: ${missing.join(", ")}`);
        fixed.safety_labels = [...fixed.safety_labels, ...missing];
      }
    }
  }

  // 2. safety_disclaimer check
  if (fixed.safety_disclaimer !== undefined) {
    if (!isNonEmptyString(fixed.safety_disclaimer)) {
      errors.push("safety_disclaimer is required and must not be empty");
      fixed.safety_disclaimer = SAFETY_LABELS.SYNTHESIS_DISCLAIMER;
    }
  }

  // 3. causal overclaim sweep on summary
  if (fixed.summary !== undefined && typeof fixed.summary === "string") {
    const { flagged, matches } = containsCausalOverclaiming(fixed.summary);
    if (flagged) {
      errors.push(`Causal overclaiming detected in summary: ${matches.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors, fixed };
}

/* ------------------------------------------------------------------ */
/*  13. Demo mode detection                                            */
/* ------------------------------------------------------------------ */

/**
 * Detect whether the application is running in demo / mock-data mode.
 *
 * Checks, in order:
 *  1. `import.meta.env.VITE_ENABLE_DEMO === "1"` or `"true"`  (canonical)
 *  2. `import.meta.env.VITE_DEMO_MODE === "true"`             (legacy)
 *  3. URL query parameter `?demo=1`
 *  4. localStorage flag `deepsynaps-demo-mode` === `"true"`
 *  5. Patient ID starts with `"demo-"` (fallback heuristic)
 *
 * @param {Object} options — { patientId?: string }
 * @returns {boolean}
 */
export function isDemoMode(options = {}) {
  try {
    // 1. Canonical Vite env var (VITE_ENABLE_DEMO)
    const viteDemo = import.meta.env?.VITE_ENABLE_DEMO;
    if (viteDemo === "1" || viteDemo === "true") return true;
  } catch {
    // import.meta may not be available in test environments
  }

  try {
    // 2. Legacy Vite env var (VITE_DEMO_MODE)
    if (import.meta.env?.VITE_DEMO_MODE === "true") return true;
  } catch {
    // import.meta may not be available in test environments
  }

  // 3. URL query param
  try {
    if (typeof window !== "undefined" && window.location) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("demo") === "1" || params.get("demo") === "true") return true;
    }
  } catch {
    // SSR / node environment
  }

  // 4. localStorage flag
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("deepsynaps-demo-mode") === "true") {
      return true;
    }
  } catch {
    // localStorage may be unavailable (private mode, SSR)
  }

  // 5. Patient-ID heuristic
  if (options.patientId && String(options.patientId).startsWith("demo-")) {
    return true;
  }

  return false;
}

/**
 * Get the demo mode label to display in the banner.
 * Falls back to "DEMO BUILD" if env var not set.
 * @returns {string}
 */
export function getDemoModeLabel() {
  try {
    return import.meta.env?.VITE_DEMO_MODE_LABEL || "DEMO BUILD";
  } catch {
    return "DEMO BUILD";
  }
}

/**
 * Check if the non-PHI banner should be shown.
 * Controlled by VITE_DEMO_NON_PHI_BANNER env var (default: true in demo).
 * @returns {boolean}
 */
export function shouldShowNonPhiBanner() {
  try {
    const val = import.meta.env?.VITE_DEMO_NON_PHI_BANNER;
    if (val === "0" || val === "false" || val === "no") return false;
    return true; // Default: show banner
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ */
/*  14. Batch validators (convenience)                                 */
/* ------------------------------------------------------------------ */

/**
 * Validate an array of events.
 * @param {Array} events
 * @returns {{valid: boolean, errors: Array<{index: number, errors: string[]}>}}
 */
export function validateEventBatch(events) {
  if (!Array.isArray(events)) {
    return { valid: false, errors: [{ index: -1, errors: ["Expected an array of events"] }] };
  }
  const errors = [];
  events.forEach((event, index) => {
    const result = validateEvent(event);
    if (!result.valid) errors.push({ index, errors: result.errors });
  });
  return { valid: errors.length === 0, errors };
}

/**
 * Validate an array of insights.
 * @param {Array} insights
 * @returns {{valid: boolean, errors: Array<{index: number, errors: string[]}>}}
 */
export function validateInsightBatch(insights) {
  if (!Array.isArray(insights)) {
    return { valid: false, errors: [{ index: -1, errors: ["Expected an array of insights"] }] };
  }
  const errors = [];
  insights.forEach((insight, index) => {
    const result = validateInsight(insight);
    if (!result.valid) errors.push({ index, errors: result.errors });
  });
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a complete synthesis response (events + insights + response envelope).
 * Convenience wrapper for end-to-end payload validation.
 */
export function validateFullSynthesisPayload(payload) {
  const errors = [];

  // 1. Validate the synthesis envelope
  const synthResult = validateSynthesisResponse(payload);
  if (!synthResult.valid) errors.push(...synthResult.errors.map((e) => `[envelope] ${e}`));

  // 2. Validate timeline events
  if (Array.isArray(payload.timeline)) {
    const batch = validateEventBatch(payload.timeline);
    if (!batch.valid) {
      batch.errors.forEach((err) => {
        err.errors.forEach((e) => errors.push(`[timeline[${err.index}]] ${e}`));
      });
    }
  }

  // 3. Validate ranked_hypotheses (insights)
  if (Array.isArray(payload.ranked_hypotheses)) {
    const batch = validateInsightBatch(payload.ranked_hypotheses);
    if (!batch.valid) {
      batch.errors.forEach((err) => {
        err.errors.forEach((e) => errors.push(`[hypotheses[${err.index}]] ${e}`));
      });
    }
  }

  // 4. Validate evidence_links inside insights
  if (Array.isArray(payload.ranked_hypotheses)) {
    payload.ranked_hypotheses.forEach((insight, i) => {
      if (Array.isArray(insight.evidence_links)) {
        insight.evidence_links.forEach((link, j) => {
          const lr = validateEvidenceLink(link);
          if (!lr.valid) {
            lr.errors.forEach((e) => errors.push(`[hypotheses[${i}].evidence_links[${j}]] ${e}`));
          }
        });
      }
    });
  }

  // 5. Safety sweep on the whole payload
  const sweep = sweepSafetyWording(payload);
  if (!sweep.valid) errors.push(...sweep.errors.map((e) => `[safety] ${e}`));

  return { valid: errors.length === 0, errors };
}
