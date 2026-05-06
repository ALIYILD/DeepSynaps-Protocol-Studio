# DeepTwin NeuroAI Lab

## Purpose

The **DeepTwin NeuroAI Lab** layer (`packages/deeptwin-neuroai-lab`) provides **research-grade**, **deterministic** scaffolding for multimodal patient timelines, modality metadata, placeholder feature extraction, and scenario contracts. It is informed by public NeuroAI / NeuralSet-style patterns (Pydantic models, timeline-oriented events, modality-aware extractors) **without** importing Meta’s `neuralset` package.

## What this module does

- Validates **multimodal event** payloads with explicit safety defaults (`research_only`, `not_diagnostic`, etc.).
- Maintains an in-memory **EventTimeline** with filtering, grouping, and **association-oriented** summaries (no causal claims).
- Exposes a **modality registry** (accepted formats, feature groups, dashboard hints, safety notes).
- Provides **placeholder extractors** that summarize supplied numeric fields only.
- Defines **simulation contracts** for hypothesis-style previews with mandatory disclaimers.

## What it does not do

- Clinical **diagnosis**, **prescription**, or **autonomous protocol selection**.
- Black-box prediction of outcomes or normative brain labels without validated pipelines.
- Automatic treatment parameter changes.

## Architecture (text diagram)

```
PatientDataEvent (Pydantic)
        │
        ▼
 EventTimeline ──► summary / dashboard_series / missing_modalities
        │
        ▼
 extract_features(modality) ──► FeatureExtractionResult + safety_flags
        │
        ▼
 DeepTwinSimulationRequest ──► preview_simulation() ──► DeepTwinSimulationResult
```

## Supported modalities

See `deeptwin_neuroai_lab.schemas.Modality` and `modality_registry.MODALITY_REGISTRY` (EEG, qEEG, MRI, fMRI, video, audio, voice, text, clinical notes, assessments, biometrics, medications, interventions, outcomes, wearables, labs, sleep, behaviour, other).

## Event schema

Core fields: `event_id`, optional `patient_id`, `event_type`, `modality`, `timestamp`, `source`, `payload`, `metadata`, optional `confidence`, `clinician_verified`, `research_only`. Intervention-specific fields use `InterventionPayload`; outcomes may use `OutcomeScorePayload`.

## Feature extraction approach

Deterministic only: pass-through of structured payload keys, simple numeric summaries (mean/min/max), explicit **missing field** and **warning** lists. No claims of abnormality unless clinician/source-labelled.

## Safety rules

- Outputs carry `DeepTwinSafetyMetadata` / `FeatureExtractionResult.research_only`.
- Language scanning rejects prescriptive or diagnostic phrasing in simulation stubs (`risk_flags.py`).
- API routes under `/api/v1/deeptwin/neuroai/*` label responses as research-only; simulation preview is **blocked** for `guest`/`patient` demo roles.

## Clinical governance boundaries

NeuroAI Lab is **optional** and **experimental**. Product-facing use should remain limited to **data completeness**, **timeline visualization**, and **clinician-reviewed** interpretation workflows until instruments and audits are aligned.

## Future integration plan

- Optional editable install of upstream research tooling in **dev** environments only.
- Exchange formats compatible with NeuralSet-style loaders **without** coupling production containers to torch stacks.

## Run tests

Package unit tests:

```bash
cd packages/deeptwin-neuroai-lab
python3 -m pytest -q
```

API integration tests:

```bash
cd apps/api
python3 -m pytest tests/test_deeptwin_neuroai_lab.py -o addopts=
```

## Add a new modality

1. Add a member to `Modality` in `schemas.py`.
2. Register defaults in `modality_registry.MODALITY_REGISTRY`.
3. Optionally extend `feature_extractors.extract_features` dispatch.
4. Add unit tests under `packages/deeptwin-neuroai-lab/tests/`.
