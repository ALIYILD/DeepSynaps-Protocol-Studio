# Brain Twin — Learning Loop Specification (Layer 5)

This document specifies Layer 5 of the Brain Twin system: clinician feedback capture, immutable audit logging, drift and override monitoring, and gated retraining operations. It is a companion to:
- `BRAIN_TWIN_ARCHITECTURE.md`
- `EVENT_BUS_SCHEMAS.md`
- `FEATURE_STORE.md`
- `BRAIN_TWIN_PAGE.md`

Layer 5 is clinician-gated continuous improvement, not self-healing AI. No model changes occur without explicit evaluation, controlled promotion, and sign-off.

## Goals

- Capture clinician feedback at the granularity of UI blocks (Approve/Correct/Reject) with trace linkage.
- Maintain an immutable audit log that can reconstruct what was shown, when, under which model versions, with which retrieved evidence and which consent snapshot.
- Detect drift and workflow harm signals (override rates) and route them to human review, not automatic retraining.
- Provide a retraining queue and controlled promotion workflow with champion/challenger comparisons and two-signature approvals (ML Lead + Lead Clinician).
- Enforce safe degradation: auto-demote heads to advisory-only when override rates exceed thresholds.

## Non-goals

- Not an autonomous retrain system triggered directly by drift.
- Not a public-facing analytics dashboard; it is admin-only (`/admin/learning-loop`).
- Not a replacement for quality systems; it must integrate with IEC 62304 SOUP records and ISO 13485 design controls but does not define the full QMS.

## Entities and identifiers

### Core identifiers

These ids must exist and be stable across the system:
- `trace_id`: end-to-end tracing id propagated from ingestion through materialization, inference, and report generation.
- `ai_run_id`: one Brain Twin inference run for one patient and one `as_of` timestamp.
- `ai_block_id`: stable id for each AI-generated UI block within a run (per task head section or sub-block).
- `model_version_bundle`: a structured bundle:
  - fusion backbone id + version
  - encoder versions per modality
  - conformal calibration set id + version
  - RAG index snapshot id for EEG-MedRAG hypergraph DB
- `consent_version`: consent snapshot used for the run.

### Required linkages

Every feedback submission must link:
- patient: `(tenant_id, patient_id)`
- `ai_run_id`, `ai_block_id`
- `task_head`
- `trace_id`
- `model_version_bundle`
- input lineage: list of source `event_id`s and key artifact hashes used (or a pointer to a stored lineage object)

## Event taxonomy

Layer 5 is driven by events. These events are either published to the event bus (`deepsynaps.ai.inference.v1`) or stored as internal audit events with the same envelope fields.

### Inference output event: `deepsynaps.ai.inference.v1`

Produced by: Brain Twin inference service (Layer 4)
Consumers: audit logger, drift monitors, override monitors, admin UI queries

Required fields (payload):
- `ai_run_id`, `task_head`, `ai_block_ids[]`
- `patient_id`, `tenant_id`, `as_of`
- `model_version_bundle`
- `input_event_ids[]`
- `used_modalities[]` and `modality_presence_mask`
- `uncertainty`:
  - `confidence_tier` in `{high, medium, low}`
  - conformal interval summary for predictive heads (lower/median/upper)
  - calibration metadata pointer
- `rag_provenance`:
  - evidence node ids
  - index snapshot id
- `output_payload`:
  - PHI-safe structured outputs and narrative pointers

### Feedback events

Feedback is captured from `/clinical/brain-twin/:patient_id` as specified in `BRAIN_TWIN_PAGE.md`.

#### `brain_twin.feedback.submitted`
Triggered by: clinician Approve/Correct/Reject submission
Payload:
- `feedback_id`
- `action` in `{approve, correct, reject}`
- `reasons[]` from the taxonomy
- `free_text` optional
- `corrected_text` optional (required when action is correct)
- `client_ts` and `server_ts`
- all linkage ids (ai_run_id, ai_block_id, trace_id, model bundle, consent version)

#### `brain_twin.feedback.conflict`
Triggered by: server detects report regeneration or ai_block mismatch
Payload:
- `feedback_id` (client generated), `conflict_reason`
- latest `ai_run_id` and `ai_block_id` references to resolve

### Model registry events

All model state transitions must be auditable.

#### `learning_loop.model.status_change`
States:
- `shadow`, `challenger`, `champion`, `retired`, `demoted_advisory`
Payload:
- `task_head`
- `model_version`
- `from_status`, `to_status`
- `triggering_metrics` pointer (evaluation artifact)
- actor id and role

#### `learning_loop.retrain.requested`
Triggered by: ML Lead or policy when queue created
Payload:
- `retrain_id`, `task_head`, target dataset id, reason, requested_by

#### `learning_loop.retrain.signed`
Two signatures required:
- `ml_lead` and `clinical_lead`
Payload:
- `retrain_id`, signer_role, action `{approve, hold}`, reason optional

#### `learning_loop.retrain.promoted`
Triggered when both signatures present and promotion executed
Payload:
- `retrain_id`, `task_head`, promoted model version, rollout plan id

## Data stores

Layer 5 needs three persistent stores:

1. Immutable audit log store (append-only)
- Stores every inference shown and every feedback action.
- Must store hash chain fields: `hash`, `prev_hash`.
- Optional: Merkle anchoring metadata for periodic external anchoring (implementation choice).

2. Feedback store (query-optimized)
- A table indexed by `(tenant_id, patient_id, ai_run_id, ai_block_id)` for fast UI and retrain dataset extraction.
- Stores structured reasons and correction payloads.
- Correction payloads must be stored as deltas or full corrected text with size limits.

3. Model registry and ops store
- Stores model versions, statuses, rollout policies, thresholds, and evaluation artifacts pointers.
- MLflow can serve as the canonical artifact tracker; registry state may be mirrored in Postgres for app queries.

## Immutable audit log requirements

### What must be reconstructable

Given any `ai_run_id`, the system must reconstruct:
- inputs: which events, which artifacts (hashes), which features (view versions)
- model: exact version bundle and calibration set id
- outputs: the exact block narratives and structured predictions as displayed
- evidence: the exact RAG citations used (EEG-MedRAG node ids and index snapshot id)
- governance context: consent version, drift flags, confidence tier, and any advisories shown
- user actions: all feedback submissions and subsequent model ops that reference this run

### Hash chain

Each audit row:
- `hash = H(prev_hash || canonical_json(payload) || ts || tenant_id)`
- `prev_hash` stored from previous row in the same audit stream partition

Canonicalization:
- JSON must be canonicalized deterministically before hashing (sorted keys, stable floats representation).

### Access control

- Audit log access is limited to admin roles (Lead Clinician, Admin, ML Lead) as defined in `BRAIN_TWIN_PAGE.md`.
- Exports must be recorded as audit events with actor identity and time range.

## Drift detection specification

Drift detection is a monitoring layer that triggers human review workflows and UI advisories.

### Signals monitored

Inputs:
- modality embedding distributions (per modality, per tenant)
- scalar feature distributions for key feature groups (wearables aggregates, assessment totals, engineered qEEG summary)

Outputs:
- predictive head score distributions
- uncertainty rate distributions (fraction low confidence)
- narrative quality proxies (length, citation coverage, correction frequency)

### Detectors and thresholds

ADWIN:
- Applied to streaming summaries (mean, variance, selected quantiles) for each monitored feature group.
- Output: change points with severity based on magnitude and persistence.

PSI:
- Computed on fixed windows (daily/weekly) comparing current window to a baseline (last 30 days or a locked reference).
- Threshold guidance:
  - PSI < 0.1: stable
  - 0.1 <= PSI < 0.25: moderate shift
  - PSI >= 0.25: large shift requiring review

Baseline management:
- Baselines must be versioned and stored per tenant (and optionally per cohort) to avoid cross-tenant leakage.

### Drift to UI propagation

The presence endpoint (`GET /brain-twin/:patient_id/presence`) must include:
- `drift.global_status` in `{ok, watch, under_review}`
- `drift.alerts[]` with detector, feature group, severity, detected_at

Clinical behavior (hard rule):
- Drift triggers advisories and demotions, not auto-retrain.

Admin behavior:
- Drift alerts open queue items in `/admin/learning-loop?tab=drift` with links to underlying distributions.

Visualization constraints:
- Charts default monochrome; heatmaps use viridis only.

## Override monitoring specification

Override is defined as a clinician disagreeing with an AI block and recording it via the feedback rail:
- `correct` or `reject` counts as override for the block and task head.
- Approve does not count as override.

Override metrics:
- Override rate per task head: `overrides / total_feedback_submissions` over rolling windows.
- Correction rate and reject rate tracked separately.
- Override reasons distribution for targeted remediation (data issues vs interpretation vs overconfidence vs citation problems).

Default thresholds (v1 governance, configurable per tenant with audit trail):
- Predictive heads (protocol recommendation, deterioration risk, treatment response):
  - auto-demote to advisory if override rate > 25% over a rolling 30-day window and at least N=50 feedback samples
- Narrative/report head:
  - auto-demote to advisory if override rate > 40% over a rolling 30-day window and at least N=50 feedback samples

Demotion semantics:
- Demotion is a model registry status transition to `demoted_advisory` for the affected head and version.
- Demotion must be recorded as `learning_loop.model.status_change` with triggering metrics pointer.
- Clinician UI must display stronger advisory labeling and reduce default prominence for demoted heads.

## Feedback schema and correction semantics

### Reason taxonomy

Minimum reason ids must match `BRAIN_TWIN_PAGE.md`:
- `data_missing`
- `wrong_window`
- `temporal_mismatch`
- `clinical_interpretation_incorrect`
- `overstated_certainty`
- `citation_issue`
- `patient_context_missing`
- `unsafe_phrasing`
- `other`

### Correction payload

When action is `correct`, at least one of these must be present:
- `corrected_text` (replacement narrative for the block)
- structured correction fields for predictive heads:
  - `corrected_label` (if a label is known and policy allows)
  - `corrected_ranked_protocols` (if clinician supplies)
  - `notes` and `rationale`

Correction storage rules:
- Store full corrected text plus a diff summary for analytics if feasible.
- Enforce size limits and redact PHI in corrections if they are intended for model training.

Feedback conflict handling:
- If the ai_block has changed since the page loaded, server returns `status=conflict` and provides the latest ai_run id and a resolution prompt.

## Retraining pipeline (gated)

Retraining is scheduled and gated. It must follow controlled steps.

### Inputs to retraining

- Feature store dataset id and manifest (from `FEATURE_STORE.md` dataset builder contracts).
- Feedback-derived supervision:
  - Approved blocks contribute to reinforcement signals (acceptability)
  - Corrections contribute to supervised targets (narrative edits, ranking preferences, error categorization)
  - Rejects contribute to negative examples and safety constraints

### Retrain queue item definition

Queue item fields:
- `retrain_id`
- `task_head`
- `candidate_model_base` (starting checkpoint id)
- `dataset_id` and dataset manifest pointer
- inclusion criteria (time range, tenants, consent scopes)
- risk checklist status (required items complete/incomplete)
- assigned reviewers (ML Lead, Lead Clinician)

### Champion/challenger evaluation

Required evaluations before promotion:
- Predictive heads:
  - calibration error and conformal coverage on locked test sets
  - subgroup performance checks (per tenant, device vendor, key cohorts)
  - stability checks vs prior champion
- Narrative head:
  - citation coverage (fraction of claims linked to evidence)
  - correction rate changes
  - safety policy compliance rate (no diagnostic claims, no PHI)

Evaluation artifacts:
- Stored in MLflow with immutable ids.
- Linked in `learning_loop.retrain.signed` and `learning_loop.model.status_change`.

### Promotion workflow (two-signature)

Roles:
- ML Lead signs technical readiness.
- Lead Clinician signs clinical acceptability.

Rules:
- Promotion requires two approvals.
- Any hold requires a reason and creates a remediation ticket.
- Promotions must include a rollout plan:
  - shadow first, then split traffic, then champion
  - roll back conditions (drift, override spikes)

### Rollout and rollback

Rollout states:
- `shadow`: compute outputs but do not show to clinicians
- `challenger`: show to subset split
- `champion`: default

Rollback triggers:
- sudden override spike beyond threshold
- drift status changes to `under_review` plus performance degradation evidence
- audit verification failure

## Admin UI contract mapping

The `/admin/learning-loop` UI in `BRAIN_TWIN_PAGE.md` is the required surface. This doc defines the data the UI must show.

Tabs mapping:
- Audit:
  - query audit rows, show hash chain, show verification badges, export with audit event
- Drift:
  - ADWIN alerts series, PSI series, thresholds, feature group filters
- Models:
  - model registry table, per-version metadata, calibration set ids, status transitions
- Retrains:
  - pending retrains, evaluation links, two-signature controls, promotion events
- Override Rates:
  - override charts per head, thresholds, demotion events
- Champion/Challenger:
  - split traffic config, rolling outcome comparisons, guardrails state

## Compliance integration points

IEC 62304 SOUP:
- Maintain SOUP inventory for third-party ML libraries and model components used in production.
- Each production model bundle must list:
  - framework versions (PyTorch, transformers)
  - encoder model versions (Whisper, wav2vec2, ClinicalBERT variants)
  - known limitations and verification steps

ISO 13485 design controls:
- Layer 5 must provide traceability from requirements to verification:
  - audit log reconstructability tests
  - permission enforcement tests
  - drift detector validation on synthetic shifts
  - override threshold demotion tests
  - promotion workflow tests (two-signature enforcement)

## Operational SLOs (v1 targets)

These are engineering targets to keep the loop usable:
- Feedback submission API p95: < 250 ms
- Presence endpoint p95: < 300 ms
- Drift computation: near-real-time summaries updated at least hourly per tenant
- Override monitors: daily rollups plus on-demand recompute for investigation
- Audit log append: at-least-once, idempotent by `event_id`

