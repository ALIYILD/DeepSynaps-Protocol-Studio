# Brain Twin — Feature Store Specification (Layer 2)

This document specifies Layer 2 of the Brain Twin system: the feature store and artifact store contracts that make training and inference reproducible, point-in-time correct, and auditable. It is a companion to:
- `BRAIN_TWIN_ARCHITECTURE.md`
- `EVENT_BUS_SCHEMAS.md`
- `BRAIN_TWIN_PAGE.md`
- `LEARNING_LOOP.md`

## Goals

- Single catalog for all Brain Twin-eligible inputs: raw artifacts, engineered features, and modality embeddings.
- Point-in-time correctness for any offline join and training dataset build.
- Deterministic feature retrieval for online inference, with declared latency tiers.
- Strong lineage: every derived feature references source events, preprocessing versions, and consent versions.
- Clear PHI boundary: large raw payloads remain in tenant-isolated encrypted object storage; feature store stores references, hashes, and de-identified derivatives only.

## Non-goals

- Not a replacement for the event bus; the event bus is the system of record for facts.
- Not a data lake redesign; it defines conventions that can be implemented on Postgres + object storage first, then migrated to a warehouse if needed.
- Not defining model architecture; it defines what data the model can reliably consume.

## Architecture overview

Layer 2 comprises three storage surfaces and one retrieval surface:
- Offline store: historical feature tables for training and backfills (Postgres first; BigQuery/Snowflake optional later).
- Online store: low-latency key-value serving for near-real-time inference (Redis first; DynamoDB/Elasticache optional later).
- Artifact store: encrypted object storage for large payloads and derived artifacts (EDF, NIfTI, parquet, embedding tensors) with tenant isolation.
- Retrieval API: a single library/service used by inference jobs and training dataset builders to get a consistent view of features, with point-in-time correctness semantics.

Recommended implementation stack (pragmatic v1):
- Feast as the feature store API and registry.
- Offline store: Postgres (existing DeepSynaps stack alignment) with partitioning by tenant and time.
- Online store: Redis.
- Artifact store: S3-compatible (MinIO for dev, cloud object storage for prod) with KMS encryption.
- Metadata and experiment tracking: MLflow (models, datasets, evaluation artifacts).

## Core identifiers and invariants

These identifiers must appear in stored records and are inherited from the universal envelope in `EVENT_BUS_SCHEMAS.md`.

Required fields on every feature row (or retrievable metadata):
- `tenant_id`
- `patient_id`
- `event_id` (source event that caused the row to exist)
- `occurred_at` (time the observation occurred)
- `recorded_at` (time ingested)
- `trace_id` (end-to-end trace)
- `consent_version` (in effect at collection time)
- `de_identified` (true for any data derived from potentially identifying media or text)
- `schema_version` (source event schema)

Hard rules:
- `tenant_id` and `patient_id` are mandatory for all patient-scoped features.
- `occurred_at` is the primary timestamp for point-in-time joins.
- `recorded_at` is used for operational freshness and debugging.
- Consent gating must be enforced at materialization time and again at retrieval time for training builders.

## Entities

Entities are Feast entities (or equivalent) that define join keys.

### `patient`
- Join key: `(tenant_id, patient_id)`
- Primary use: most Brain Twin features and embeddings.

### `session`
- Join key: `(tenant_id, patient_id, session_id)`
- Use: qEEG session artifacts, therapy sessions, video/audio sessions.

### `time_bucket_month`
- Join key: `(tenant_id, patient_id, month_start_iso)`
- Use: timeline aggregation materializations (per-month embedding state and per-month derived features).

## Source tables and materialization pattern

Materializers consume event bus topics and write feature tables with explicit lineage.

Pattern:
1. Consume modality event.
2. Validate consent scope and `de_identified` rules.
3. If payload is large, fetch from `payload_uri` in artifact store.
4. Compute derived features and/or embeddings.
5. Write:
   - Feature values to offline store (append-only).
   - If declared online-eligible, also write to online store keyed by `(tenant_id, patient_id, feature_name)` and time bucket.
6. Emit a materialization audit event (internal system topic) linking source `event_id` to derived artifacts.

Append-only rule:
- Offline tables are append-only and time-indexed by `occurred_at`.
- Corrections are new rows linked to the original row by `supersedes_row_id` (do not update in place).

## Feature view taxonomy (Brain Twin minimum set)

This section defines a minimal set of feature views needed to support Phase 1–3 roadmap.

### qEEG feature views

#### `qeeg_session_metadata`
Source: `deepsynaps.qeeg.recording.v1`
Keys: `(tenant_id, patient_id, session_id)`
Fields:
- acquisition metadata: `sfreq_hz`, `n_channels`, `montage`, `duration_s`, `recording_state`
- QA summaries: `dropout_rate`, `artifact_fraction`, `impedance_summary`
Latency: near-real-time (metadata), batch (QA if derived)
Online: yes (metadata + QA scalar summaries)

#### `qeeg_engineered_features_v1`
Source: `deepsynaps.qeeg.features.v1`
Keys: `(tenant_id, patient_id, session_id)`
Fields (examples, not exhaustive):
- `iapf_hz`, `faa`, `tbr_fz`, `zscore_global`
- bandpowers by region/channel (stored as sparse columns or JSONB with strict schema)
Latency: near-real-time
Online: yes (for fusion and for UI timeline tracks)

#### `qeeg_raw_embedding_v1`
Source: `deepsynaps.qeeg.recording.v1` + artifact fetch
Keys: `(tenant_id, patient_id, session_id)`
Fields:
- `embedding_uri` (artifact store path to embedding tensor)
- `embedding_dim` (512)
- `model_id`, `model_version`
- `preproc_version` (MNE pipeline version)
- `signal_hash` (content hash of EDF)
Latency: batch / near-real-time depending on compute
Online: optionally (pointer only), not raw tensor

### Wearables feature views

#### `wearables_daily_aggregates_v1`
Source: `deepsynaps.wearable.timeseries.v1`
Keys: `(tenant_id, patient_id, day_iso)`
Fields:
- sleep: `sleep_total_min`, `sleep_efficiency`, `rem_min`, `deep_min`
- autonomic: `hrv_rmssd`, `resting_hr`
- activity: `steps`, `active_min`
Latency: streaming / near-real-time
Online: yes (latest day and rolling windows)

#### `wearables_embedding_v1`
Source: `deepsynaps.wearable.timeseries.v1` (windowed)
Keys: `(tenant_id, patient_id, window_start_iso)`
Fields:
- `embedding_uri`, `embedding_dim` (256)
- `window_hours`, `vendor`
- `model_id`, `model_version`
Latency: streaming / near-real-time
Online: pointer only

### Assessments feature views

#### `assessment_scores_v1`
Source: `deepsynaps.assessment.completed.v1`
Keys: `(tenant_id, patient_id, instrument_id, completed_at_iso)`
Fields:
- `total_score`, `subscales` (strict map), `mode`
Latency: near-real-time
Online: yes (latest per instrument)

#### `assessment_embedding_v1`
Source: `deepsynaps.assessment.completed.v1`
Keys: `(tenant_id, patient_id, completed_at_iso)`
Fields:
- `embedding_uri`, `embedding_dim` (128)
- `instrument_mix` (which instruments contributed)
Latency: near-real-time
Online: pointer only

### Therapy device feature views

#### `therapy_inclinic_session_v1`
Source: `deepsynaps.therapy.inclinic.v1`
Keys: `(tenant_id, patient_id, session_id)`
Fields:
- modality, target region, dose parameters (structured fields)
- adherence/interruptions, operator id hash, device serial hash
Latency: near-real-time
Online: yes (session summaries)

#### `therapy_home_session_v1`
Source: `deepsynaps.therapy.home.v1`
Keys: `(tenant_id, patient_id, session_id)`
Fields:
- vendor, prescribed_protocol_id, adherence_percent, completion
Latency: streaming / near-real-time
Online: yes (rolling adherence)

### Imaging feature views

#### `mri_structural_session_v1`
Source: `deepsynaps.mri.structural.v1`
Keys: `(tenant_id, patient_id, session_id)`
Fields:
- `artifact_uri` (NIfTI/BIDS), `signal_hash`
- `qc_summary` fields, optional regional volumes
Latency: batch
Online: pointer only (metadata)

#### `mri_structural_embedding_v1`
Source: `deepsynaps.mri.structural.v1` + preprocessing
Keys: `(tenant_id, patient_id, session_id)`
Fields:
- `embedding_uri`, `embedding_dim` (512)
- `model_id`, `model_version`, `preproc_version`
Latency: batch
Online: pointer only

### Text feature views

#### `ehr_note_embedding_v1`
Source: `deepsynaps.ehr.note.v1`
Keys: `(tenant_id, patient_id, note_id)`
Fields:
- `embedding_uri`, `embedding_dim` (512)
- `de_identified` must be true
- `model_id`, `model_version`
- `note_type`, `encounter_id_hash`
Latency: batch / near-real-time
Online: pointer only (never raw note text)

### Brain Twin state feature views

#### `brain_twin_month_state_v1`
Source: fusion inference outputs (Layer 4), written back as a feature view
Keys: `(tenant_id, patient_id, month_start_iso)`
Fields:
- `timeline_embedding_uri` (1024-d per month)
- `embedding_shift_metrics` (cosine drift, distance metrics)
- `model_version_bundle` (fusion + encoder versions)
- `target_coverage` and calibration set id for intervals
Latency: near-real-time (after inference)
Online: yes (latest month pointer + summary metrics)

#### `brain_twin_global_state_v1`
Source: fusion inference outputs (Layer 4)
Keys: `(tenant_id, patient_id, as_of_iso)`
Fields:
- `patient_embedding_uri` (1024-d global)
- `interval_lower_uri`, `interval_upper_uri` (if stored as tensors) or inline numeric summaries
- provenance and trace linkage: `ai_run_id`, `trace_id`
Latency: near-real-time
Online: yes (latest snapshot metadata)

## Artifact store conventions

Artifacts are stored in tenant-isolated encrypted object storage. No artifacts are stored inline on the event bus.

Path convention:
- `s3://<bucket>/tenants/<tenant_id>/patients/<patient_id>/<modality>/<yyyy>/<mm>/<dd>/<artifact_type>/<artifact_id>.<ext>`

Required metadata (stored as object tags or adjacent JSON):
- `tenant_id`, `patient_id`, `event_id`, `trace_id`, `occurred_at`, `recorded_at`
- `consent_version`
- `producer_module`
- `content_hash` (SHA-256 of plaintext payload before encryption)
- `encryption_key_id` (KMS key reference)

Artifact types and typical extensions:
- Raw qEEG: `edf`, `bdf`
- Imaging: `nii`, `nii.gz`, `json` (BIDS sidecar)
- Wearables windows: `parquet`
- Embeddings: `npy` or `pt` (tensor), plus metadata JSON
- Report artifacts: `json` (structured), `md` (narrative), never containing PHI

## Point-in-time correctness (PIT) semantics

Training dataset builders must join features as-of a label timestamp without leakage.

Required semantics:
- For a label at time `t`, only include feature rows with `occurred_at <= t`.
- When multiple rows exist for the same key, select the latest `occurred_at` before `t`.
- Corrections are handled by superseding rows; selection prefers non-superseded rows unless the correction’s `occurred_at` is also `<= t`.

Validation tests (must exist in CI):
- Leakage tests for each feature view: randomly sample labels and ensure no feature timestamp is after the label timestamp.
- Join completeness tests: expected feature availability rates per modality and tenant.
- Reproducibility tests: re-run dataset build with same inputs yields identical row hashes.

## Online serving semantics

Online store is used only for:
- Presence and freshness computations (for UI)
- Latest snapshot metadata needed for `GET /brain-twin/:patient_id/presence`
- Latest timeline windows and prediction summaries where low latency is required

Online storage pattern:
- Key: `(tenant_id, patient_id, feature_view, feature_key, time_bucket)`
- Value: compact JSON with numeric scalars and artifact pointers; never large arrays
- TTL: modality-specific, but must not delete audit-relevant pointers from offline store

## Modality presence and freshness computation

Presence is computed from the feature store plus event bus ingestion metadata:
- For each modality, compute:
  - `status`: fresh, stale, missing, consent_revoked
  - `last_ingested_at` and `last_occurred_at`
  - `staleness_reason` if SLA exceeded

Freshness thresholds must match `BRAIN_TWIN_PAGE.md` defaults:
- wearables: fresh if < 6 hours
- assessments: fresh if < 30 days
- qEEG raw/features: fresh if < 90 days
- MRI structural: fresh if < 365 days
- EHR text: fresh if < 30 days
- video/audio: fresh if < 30 days when present
- home therapy / in-clinic therapy: fresh if < 14 days

Presence endpoints must return deterministic results for a given `as_of` to support audit reconstruction.

## Consent enforcement

Enforcement points:
- Materializers: block writes for events outside consent scope; route to DLQ for human review.
- Training dataset builders: filter by consent scopes (clinical use vs research-only); any research-only feature rows are excluded unless explicitly building research datasets.
- Inference retrieval: if consent revoked for a modality, the modality is masked and excluded from fusion inputs; UI must show consent-revoked state.

## Feature naming, typing, and units

Rules:
- Every numeric feature has an explicit unit string (stored in registry metadata and exposed to UI).
- Avoid free-form JSON for numeric features unless schema is strict and versioned.
- Version feature views explicitly when semantics change (e.g., `wearables_daily_aggregates_v2`).

Units examples:
- HR: bpm
- HRV RMSSD: ms
- Sleep duration: minutes
- Bandpower: µV^2 (or standardized z-score; declare which)

## Training dataset builder contracts

Dataset builders are responsible for producing:
- A row-level dataset with:
  - join keys
  - feature vector pointers (embedding URIs)
  - scalar feature columns
  - label columns (where available)
  - per-row lineage payload (source event ids list, consent version, trace ids)
- A dataset manifest:
  - dataset id
  - time range
  - feature view versions
  - inclusion/exclusion criteria
  - row hash summary

Tracking:
- MLflow logs the manifest and the dataset build code version.
- Dataset ids are referenced in `LEARNING_LOOP.md` retrain workflows and in audit events.

## Interfaces and endpoints (implementation targets)

The UI spec in `BRAIN_TWIN_PAGE.md` expects these Layer 2-derived computations:
- Presence bundle with freshness and drift banners
- Timeline tracks with units and intervention markers
- Embedding pointers for the brain viewer and timeline embeddings

Minimum service/library interfaces:
- `FeatureRetrieval.get_presence(tenant_id, patient_id, as_of)`
- `FeatureRetrieval.get_timeline(tenant_id, patient_id, from, to)`
- `FeatureRetrieval.get_fusion_inputs(tenant_id, patient_id, as_of)` returning modality embeddings pointers and scalar features, plus presence mask
- `FeatureRetrieval.get_report_context(tenant_id, patient_id, as_of)` returning de-identified findings, modality list, and artifact pointers for citations

## Operational monitoring

Layer 2 must expose metrics:
- Materializer lag per topic (seconds)
- Feature freshness percentiles per modality and tenant
- Artifact store fetch latency and error rates
- Schema incompatibility errors and DLQ volume

Dashboards:
- Monochrome charts by default; if heatmaps are used for freshness by modality, use viridis only.

