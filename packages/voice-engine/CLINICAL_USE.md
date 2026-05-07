# Voice Analyzer — Clinical Use Guidance

## Scope

Voice-derived decision support; not a diagnostic device. Patterns are
statistical, not validated against clinical outcomes. All findings require
clinician interpretation.

## What this engine does

- Transcribes recorded speech (Whisper, local).
- Recognizes acoustic affect indicators ("calm", "sad", "angry", etc. — see
  the canonical 8-label set in `emotion.py`). These are **acoustic** signals,
  not clinical assessments of mood.
- Extracts vocal biomarkers (F0, jitter, shimmer, HNR, MFCC, pause ratio,
  speech rate). Reference values are based on published ranges for adult
  speech and are not stratified by sex / age / language / task.
- Produces four decision-support scores in [0, 1]: depression risk, anxiety
  risk, stress level, cognitive load. These come from a transparent
  rule-based scorer (`scoring.py::_score_rule_based`); thresholds are
  starting points and are not calibrated against labeled clinician data.
- Generates a templated clinical summary (`report.py`). When an LLM is not
  configured, summaries are deterministic templates — no narrative
  generation.

## What this engine is NOT

- Not a diagnostic device under MHRA, FDA, CE, or any other regulatory
  framework.
- Not validated to detect depression, anxiety, stress, or any specific
  clinical condition.
- Not a substitute for structured clinical assessment.
- Not intended to be the sole basis for any clinical decision.

## Output framing

Every API response includes:
- `disclaimer` — the canonical decision-support statement.
- `engine_version` — for traceability between an output and the engine that
  produced it.

Findings consistently use language like "patterns consistent with",
"may warrant further assessment", "decision support only". The engine does
not assert diagnoses.

## Known limitations

- Rule-based scorer thresholds need calibration with labeled, clinician-
  reviewed data before any deployment beyond exploratory use.
- No demographic stratification (sex / age / language / task / device).
- CPP (cepstral peak prominence) is currently returned as `None` because the
  available Praat path is not reliable enough to publish a value.
- Audio quality affects every metric; low-SNR or low-bitrate inputs will
  produce less reliable output. The engine surfaces some warnings via
  `extraction_warnings` and the sparse-data flag.

## Data handling

- Audio is stored on the Fly persistent volume under
  `${DEEPSYNAPS_VOICE_DIR}/voice/{patient_id}/{session_id}/...`.
- Cross-clinic access is gated by `clinic_id` in `voice_engine_router.py`.
- Retention and deletion are not yet automated; treat as manual until that
  is in place.

## When to escalate findings

- High or critical risk tier on multiple consecutive analyses.
- Adverse-event language in extraction warnings.
- Patterns that don't reconcile with the patient's self-report on
  PHQ-9 / GAD-7 / clinical interview.

These are flags for clinician review, not autonomous escalation.
