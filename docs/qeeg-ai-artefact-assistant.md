# qEEG AI Artefact Assistant

The AI Artefact Assistant is a **decision-support** tool inside the
Raw EEG Cleaning Workbench. It surfaces candidate artefact patterns
and asks the clinician to confirm before any cleaning is applied.

## What it does

`POST /api/v1/qeeg-raw/{analysis_id}/ai-artefact-suggestions` returns
canonical artefact archetypes with:

- `ai_label` — `eye_blink | muscle | movement | line_noise | flat_channel | noisy_channel | electrode_pop | ecg_contamination | other`
- `ai_confidence` — 0.0–1.0
- `channel`, `start_sec`, `end_sec`
- `explanation` — human-readable reasoning
- `suggested_action` — `ignore | mark_bad_segment | mark_bad_channel | review_ica | repeat_recording`

Every response carries the safety notice:

> AI-assisted suggestion only. Clinician confirmation required.

## What it does not do

- **No diagnosis.** It does not claim the EEG is "fully cleaned" or
  "guaranteed artefact free".
- **No autonomous mutation.** Suggestions persist as annotations with
  `source='ai'` and `decision_status='suggested'`. They become
  `accepted` only when a clinician explicitly confirms via the
  workbench Accept button.
- **No treatment recommendations.** The assistant comments on signal
  artefacts only.
- **No PHI exfiltration.** No patient identifiers, filenames, or
  internet search queries containing PHI are emitted.

## Decision lifecycle

```
                  ┌─────────────┐
   AI generates →  │  suggested  │  ←─ default state (no effect)
                  └─────────────┘
                        │
                        ▼  (clinician confirms)
                  ┌─────────────┐
                  │  accepted   │  →  may translate into a real
                  └─────────────┘     bad_segment / bad_channel
                                       annotation
                        │
                        ▼  (clinician overturns)
                  ┌─────────────┐
                  │  rejected   │  ←  no effect, persisted in audit
                  └─────────────┘
```

A `needs_review` status is also available for cases the clinician
wants to defer.

## Roadmap

The current generator returns three canonical archetypes. A future
iteration will plug into MNE's `ICLabel` and `autoreject` to score
ICA components and segments using the actual signal. The audit shape
already accommodates that — `ica_component` and `ai_confidence`
columns are ready.
