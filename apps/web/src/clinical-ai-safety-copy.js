// ─────────────────────────────────────────────────────────────────────────────
// clinical-ai-safety-copy.js — Shared decision-support / regulatory-safe strings
//
// Reusable across qEEG Analyzer, MRI Analyzer, DeepTwin, Protocol Studio,
// evidence flows, and biomarker surfaces. Do not assert diagnosis, treatment
// approval, or device clearance. Prefer "review cue", "draft", and
// "clinician review required" framing per QEEG_REGULATORY_AUDIT.md.
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical patient-facing variant (research / wellness + clinician discussion). */
export const CANONICAL_RESEARCH_WELLNESS_DISCLAIMER =
  'Research and wellness use only. This summary is informational and is not a medical diagnosis or treatment recommendation. Discuss any findings with a qualified clinician.';

export const AI_DECISION_SUPPORT_DISCLAIMER =
  'Decision-support only. Outputs are drafts for clinician review; they are not diagnostic and do not replace independent clinical judgment.';

export const DEMO_SYNTHETIC_DATA_DISCLAIMER =
  'Demo / synthetic data: illustrative values only. Not for clinical use. Do not treat as a real patient record or validated clinical output.';

export const CLINICIAN_REVIEW_REQUIRED_COPY =
  'Clinician review required before any clinical action, care decision, or patient-facing communication.';

export const NOT_DIAGNOSTIC_COPY =
  'Does not establish a medical condition, seizure-risk label, or emergency triage decision. Decision-support only.';

export const NOT_TREATMENT_APPROVAL_COPY =
  'Not a treatment recommendation or protocol approval. Stimulation targets and protocols require independent clinician validation and local policy.';

export const RAW_EEG_VERIFICATION_REQUIRED_COPY =
  'Verify against raw EEG and acquisition context before relying on quantitative summaries or AI-assisted text.';

export const RED_FLAGS_ARE_REVIEW_CUES_COPY =
  'Red flags and quality alerts are review cues — confirm against raw data and local policy before any clinical action.';

export const PROTOCOL_SUGGESTIONS_ARE_DRAFT_COPY =
  'Protocol-fit and protocol suggestions are draft ideas for clinician review; they are not treatment approval or stimulation targeting.';

export const NORMATIVE_COMPARISON_REQUIRES_CONDITION_COPY =
  'Normative comparison requires a known recording condition such as eyes-closed or eyes-open. Current result is shown as analysis-only, not normative scoring.';

export const NORMATIVE_DATABASE_LIMITATION_COPY =
  'Normative z-scores and comparisons apply only when the pipeline reports a real normative database version — verify the Normative Model Card for source and applicability. If no provider is configured, treat values as analysis-only, not clinical normative scoring.';

export const RESEARCH_ONLY_FEATURE_COPY =
  'Research-only feature: exploratory metrics and visualisations may lack evidence-graded clinical validation; use for hypothesis generation only.';

export const SEIZURE_TREND_RESEARCH_ONLY_COPY =
  'Research-only probability cue. Not a seizure detection device. Not diagnostic. Clinician review and raw EEG verification required.';

/** Ordered bullets for the qEEG Analyzer safety footer (HTML assembled with esc() in the consumer). */
export const QEEG_ANALYZER_SAFETY_FOOTER_BULLETS = [
  'This is a controlled preview using synthetic or clinician-provided data where applicable. This page supports clinical review and decision-support only. It does not diagnose, prescribe, triage emergencies, approve treatment, or act autonomously. All outputs require clinician review.',
  'This workspace provides EEG/qEEG analysis support and decision-support only. It is not autonomous diagnosis, psychiatry, epilepsy determination, emergency triage, protocol prescription, device control, or AI-directed therapy.',
  NORMATIVE_DATABASE_LIMITATION_COPY,
  PROTOCOL_SUGGESTIONS_ARE_DRAFT_COPY,
  RED_FLAGS_ARE_REVIEW_CUES_COPY,
  'AI-assisted text summarises available numerics and documents — it does not replace clinical interpretation or independent findings.',
];
