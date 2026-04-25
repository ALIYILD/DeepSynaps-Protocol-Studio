# DeepSynaps Brain Twin Kit: Unified Event Bus Schemas (Avro)

Default: Apache Kafka-compatible backbone (Kafka, Redpanda) with Avro schemas managed in a Schema Registry (Confluent-style subject compatibility). Alternative: Protobuf can be used for teams that want explicit codegen-first APIs; if used, keep the same universal envelope and topic taxonomy, and enforce backward compatibility via Buf and CI checks.

This document defines:

- A universal event envelope that every DeepSynaps module publishes.
- Per-modality event types and their payload semantics.
- Operational rules: schema evolution, PHI/consent enforcement, replay/retention, and producer/consumer contracts.

Companion docs referenced by Brain Twin architecture:

- `BRAIN_TWIN_ARCHITECTURE.md`
- `FEATURE_STORE.md`
- `LEARNING_LOOP.md`

## Goals

- Single source of truth for multimodal patient signals and all AI outputs across modules (qEEG Analyzer, MRI Analyzer, Monitor, Patient Portal, Virtual Care, EHR connector).
- Strong schema evolution guarantees so producers can ship independently while consumers remain stable (Schema Registry BACKWARD compatibility).
- Consent, tenant, and trace context embedded in every event envelope so compliance and observability are enforced by default.
- Replayability for feature recomputation and retraining, with PHI-safe payload practices (store large media and raw signals out-of-band, reference via URI, not inline blobs).

## Backbone choice

Recommendation: Redpanda (Kafka API compatible), simpler ops (no ZooKeeper/KRaft management burden), fast local dev, and built-in tiered storage to S3-compatible object stores for long retention and replay. Enterprise option: Confluent Cloud (managed, stronger governance features, enterprise support).

Topic naming convention:

- `deepsynaps.<modality>.<event_type>.v<schema_major>`
- Examples:
  - `deepsynaps.qeeg.recording.v1`
  - `deepsynaps.wearable.timeseries.v1`
  - `deepsynaps.ai.inference.v1`

Partition key:

- `patient_id` for patient-scoped events (most topics).
- Tenant-level events (rare) may partition by `tenant_id` when `patient_id` is null (for example global consent policy updates), but prefer `patient_id` whenever possible to preserve patient-scoped replay.

Retention and compaction:

- Hot retention in the streaming cluster: 30 days.
- Long-term durability: S3 tiered storage (permanent) for replay and training datasets.
- Compaction:
  - Off for raw signals and session events (qEEG recordings, wearable time series, video/audio sessions) because they are append-only.
  - On for state-like events (consent updates, patient state snapshots, outcome records) where the latest value matters operationally.

## The universal envelope

Every event is an Avro record that includes the universal envelope fields. For Schema Registry simplicity and independent subject registration, the envelope fields are duplicated into each modality schema record.

Base envelope schema (reference shape):

```json
{
  "type": "record",
  "name": "BaseEvent",
  "namespace": "studio.deepsynaps.events.v1",
  "fields": [
    { "name": "event_id", "type": { "type": "string", "logicalType": "uuid" } },
    { "name": "event_type", "type": "string" },
    { "name": "schema_version", "type": "string" },
    { "name": "occurred_at", "type": { "type": "long", "logicalType": "timestamp-millis" } },
    { "name": "recorded_at", "type": { "type": "long", "logicalType": "timestamp-millis" } },
    { "name": "tenant_id", "type": "string" },
    { "name": "patient_id", "type": ["null", "string"], "default": null },
    { "name": "source_id", "type": "string" },
    { "name": "source_instance", "type": "string" },
    {
      "name": "modality",
      "type": {
        "type": "enum",
        "name": "Modality",
        "symbols": [
          "QEEG",
          "MRI",
          "FMRI",
          "WEARABLE",
          "THERAPY_INCLINIC",
          "THERAPY_HOME",
          "VIDEO",
          "AUDIO",
          "ASSESSMENT",
          "EHR_TEXT",
          "OUTCOME",
          "CONSENT",
          "SYSTEM"
        ]
      }
    },
    { "name": "trace_id", "type": "string" },
    { "name": "correlation_id", "type": ["null", "string"], "default": null },
    { "name": "consent_version", "type": "string" },
    { "name": "de_identified", "type": "boolean" },
    {
      "name": "retention_class",
      "type": {
        "type": "enum",
        "name": "RetentionClass",
        "symbols": ["STANDARD", "EXTENDED", "RESEARCH_ONLY"]
      }
    },
    { "name": "payload_uri", "type": ["null", "string"], "default": null },
    { "name": "payload_inline", "type": ["null", { "type": "map", "values": "string" }], "default": null },
    { "name": "schema_registry_id", "type": ["null", "int"], "default": null }
  ]
}
```

Envelope field reference:

| Field | Type | Required | Meaning / constraints |
|---|---:|---:|---|
| `event_id` | uuid | Yes | Globally unique event identifier. Used for dedupe/idempotency at consumers. |
| `event_type` | string | Yes | Producer-defined code; must match the topic semantic and the schema record name. |
| `schema_version` | string | Yes | SemVer for this event schema. Producers must set; consumers log and enforce policy. |
| `occurred_at` | timestamp-millis | Yes | When the underlying observation/session occurred. |
| `recorded_at` | timestamp-millis | Yes | When the producer published the event. |
| `tenant_id` | string | Yes | Tenant boundary for data residency and access control. |
| `patient_id` | string or null | Usually | Patient-scoped partition key. Nullable only for tenant-level/system events. |
| `source_id` | string | Yes | Producing module identifier (for example `qeeg-analyzer`, `monitor`, `ehr-connector`). |
| `source_instance` | string | Yes | Specific device/service instance (serial, pod id, connector instance). |
| `modality` | enum | Yes | Normalized modality classification. |
| `trace_id` | string | Yes | End-to-end tracing across ingestion, materialization, inference, report generation. |
| `correlation_id` | string or null | No | Optional grouping id (for example a visit id, session id, pipeline run id). |
| `consent_version` | string | Yes | SemVer pointer to the consent record in effect at collection time. |
| `de_identified` | boolean | Yes | Must be true for any event referencing identifying media/text (EHR note text, video/audio). |
| `retention_class` | enum | Yes | Retention policy class used by object storage and training dataset builders. |
| `payload_uri` | string or null | No | URI to encrypted object store for large payloads (EDF/NIfTI/video/audio/text). |
| `payload_inline` | map<string,string> or null | No | Small structured payload; must be PHI-safe. |
| `schema_registry_id` | int or null | No | Optional registry id logged by producers for fast compatibility checks. |

## Per-modality event types

This section specifies the semantic contract per event type. The full Avro record schemas used by producers and consumers live under `../schemas/` and are intended to be registered per subject in the Schema Registry.

Notes:

- Large blobs are always out-of-band: store in tenant-isolated encrypted object storage and reference using `payload_uri`.
- Inline payloads are allowed for small structured content only, and must remain PHI-safe.
- All feature-store materializers should treat these as append-only fact events unless explicitly noted otherwise.

### qEEG raw (deepsynaps.qeeg.recording.v1)

Description: Raw qEEG recording session. The EDF is stored in object storage and referenced by URI. Metadata is always inline and small.

Schema: `schemas/qeeg_recording.avsc`

Signals carried:

- EDF recording reference and acquisition metadata (sampling rate, montage, referencing, duration).
- Device/vendor metadata for downstream QA and stratified analysis.

Sample payload (inline map, representative keys):

```json
{
  "sfreq_hz": "500",
  "n_channels": "19",
  "montage": "10-20",
  "recording_state": "eyes_closed",
  "vendor_device": "neurofield_xyz"
}
```

Feature-store feeds (examples):

- Recording QA features (dropout rate, impedance stats, artifact flags).
- Session-level embedding via LaBraM/EEGPT encoder path (raw-to-embedding pipeline runs off `payload_uri`).

### qEEG engineered features (deepsynaps.qeeg.features.v1)

Description: Engineered qEEG features (band powers, ratios, IAPF, FAA, connectivity summaries, z-scores). Small enough to inline; may optionally also be stored as a parquet artifact with a URI for provenance.

Schema: `schemas/qeeg_features.avsc`

Signals carried:

- Per-channel band powers and derived ratios (TBR per channel).
- Scalar session summaries (IAPF, FAA).
- Connectivity summaries (regional connectivity matrix summary stats) and z-score aggregates (not full PHI).

Sample payload (inline sketch):

```json
{
  "iapf_hz": "10.2",
  "faa": "-0.12",
  "tbr_fz": "2.1",
  "zscore_global": "1.4"
}
```

Feature-store feeds (examples):

- Tabular feature vectors for the engineered-feature encoder (MLP) feeding Brain Twin fusion in parallel with the raw encoder.
- Monitoring and cohort analytics (longitudinal normalization, response stratification).

### MRI structural (deepsynaps.mri.structural.v1)

Description: Structural MRI session reference (NIfTI/BIDS) and acquisition metadata. Payload is URI-only plus small inline metadata.

Schema: Full schema lives in the monorepo under `packages/event-bus/schemas/` when MRI integration is enabled; not included in this kit file set.

Signals carried:

- NIfTI/BIDS URI, sequence type (T1/T2/FLAIR), voxel size, scanner model.
- Optional derived features (regional volumes) as inline small maps.

Feature-store feeds (examples):

- Structural encoder embeddings (for example a 3D CNN/ViT head) and QC stats.

### fMRI (deepsynaps.mri.fmri.v1)

Description: fMRI session reference and acquisition metadata.

Schema: Full schema lives in the monorepo under `packages/event-bus/schemas/`; not included in this kit file set.

Signals carried:

- fMRI timeseries URI, paradigm, TR, number of volumes.

Feature-store feeds (examples):

- Resting-state connectivity summaries, task activation summaries, and fMRI encoder embeddings.

### Wearables time series (deepsynaps.wearable.timeseries.v1)

Description: Wearable metric time series (HR/HRV/SpO2/temp/sleep/activity). Values may be inline for small bursts or referenced via `payload_uri` for larger windows.

Schema: `schemas/wearable_timeseries.avsc`

Signals carried:

- Vendor identity (apple_health/whoop/oura/garmin/fitbit), device id.
- Metric identity, sampling frequency, time window, and value pointer.

Sample payload (inline sketch):

```json
{
  "metric": "HRV",
  "sampling_hz": "0.0167",
  "values": "[...]" 
}
```

Feature-store feeds (examples):

- Sleep-stage aggregates, circadian rhythm features, autonomic markers feeding Brain Twin fusion.
- Drift monitors (vendor/device changes).

### In-clinic therapy (deepsynaps.therapy.inclinic.v1)

Description: In-clinic neuromodulation session logs (rTMS/tDCS/TPS/taVNS/CES/PBM/PEMF/LIFU/tRNS). Includes dose parameters, targeting, operator and device provenance.

Schema: `schemas/therapy_inclinic.avsc`

Signals carried:

- Modality enum, session id, target region (structured string), dose parameters.
- Operator id and device serial for audit and quality.

Feature-store feeds (examples):

- Exposure/dose features for response modeling.
- Protocol adherence and deviations.

### Home therapy (deepsynaps.therapy.home.v1)

Description: Home therapy device session logs (Flow/Muse/Sens.ai/Mendi or other vendors). Captures adherence and prescribed protocol link.

Schema: `schemas/therapy_home.avsc`

Signals carried:

- Vendor enum, session id, prescribed protocol id, adherence percentage, completion time.

Feature-store feeds (examples):

- Adherence curves and dose features feeding response and risk heads.

### Video (deepsynaps.video.session.v1)

Description: Video session reference (telehealth, gait, face, eye-tracking). Video is always out-of-band; derived features may be inline if de-identified.

Schema: `schemas/video_session.avsc`

Signals carried:

- Clip URI, source type, duration, resolution, optional derived features (cadence, blink rate).

Feature-store feeds (examples):

- Video encoder embeddings (VideoMAE-like) and derived gait/affect features.

### Audio (deepsynaps.audio.session.v1)

Description: Audio session reference (voice sample, breathing, telehealth). Audio is out-of-band; derived features may be inline if de-identified.

Schema: `schemas/audio_session.avsc`

Signals carried:

- Clip URI, source type, duration, sampling rate, optional derived features (F0, jitter, shimmer).

Feature-store feeds (examples):

- Audio encoder embeddings (wav2vec2/Whisper embeddings) and respiratory/voice features.

### Assessment (deepsynaps.assessment.completed.v1)

Description: Structured assessment completion event (PHQ-9, GAD-7, BPRS, ASRS, MoCA, etc.). Fully inline, no blobs.

Schema: `schemas/assessment_completed.avsc`

Signals carried:

- Instrument identifier, version, total score, subscale scores map, item response map, completion time, mode (self/clinician).

Feature-store feeds (examples):

- Longitudinal symptom trajectory features and baselines feeding fusion and forecasting heads.

### EHR text (deepsynaps.ehr.note.v1)

Description: De-identified clinical note reference. Text is stored encrypted; only de-identified text is allowed on the bus. PHI must be removed before publish.

Schema: Full schema lives in the monorepo under `packages/event-bus/schemas/`; not included in this kit file set.

Signals carried:

- Note type, encounter id, encrypted text URI, source system.
- `de_identified` must be true.

Feature-store feeds (examples):

- Clinical text embeddings (ClinicalBERT/BioGPT-large/Meditron variants) and structured extraction outputs.

### Meta: Outcome (deepsynaps.outcome.recorded.v1)

Description: Clinical outcome record to support learning and monitoring. Typically compacted (latest outcome per episode), but also can be append-only with episode ids for provenance.

Schema: Monorepo schema (not in the kit file set).

Signals carried:

- Outcome type (response/remission/dropout/adverse_event), value, link to protocol session, clinician id.

Feature-store feeds (examples):

- Supervision signals for offline evaluation, champion/challenger, and calibration.

### Meta: Consent (deepsynaps.consent.updated.v1)

Description: Consent versioned updates. Must be compacted and retained indefinitely. Referenced by `consent_version` on every event envelope.

Schema: Monorepo schema (not in the kit file set).

Signals carried:

- Consent version, scopes (training/research/marketing), signed timestamp, modality-level grants.

Feature-store feeds (examples):

- Feature materialization filters and training dataset builders must enforce scope gating.

### Meta: AI inference (deepsynaps.ai.inference.v1)

Description: Model inference outputs emitted by Brain Twin inference service. Audit logger consumes this topic to create immutable logs, and monitors consume it for drift, latency, and override-rate analytics.

Schema: `schemas/ai_inference.avsc`

Signals carried:

- `model_id`, `model_version`, `task` code, input event ids, output payload (PHI-safe), uncertainty interval, retrieved evidence ids, latency.

Feature-store feeds (examples):

- Monitoring features, feedback loop targets, and decision-support traceability.

## Schema evolution rules

- SemVer applies to `schema_version` in the envelope and to schema registration subjects.
- Minor version changes:
  - Backward-compatible additions only: adding optional fields with defaults, adding new enum symbols at the end, widening unions to include null.
  - No renames, no type changes, no removing enum symbols.
- Major version bump is required for any breaking change (field removal, type change, semantic meaning change that affects consumers).
- Producers:
  - Must set `schema_version` on every event.
  - Must be deployed with registry compatibility checks in CI (reject if the registry reports incompatibility).
- Consumers:
  - Must tolerate unknown fields.
  - Must log `schema_version` and `schema_registry_id` for all consumed events.
- Schema Registry:
  - Compatibility setting: BACKWARD (or BACKWARD_TRANSITIVE if feasible).
  - Subject naming: topic-based subjects (`<topic>-value`) or record-name strategy; pick one and enforce consistently.

## PHI and consent enforcement

- `de_identified` must be true for any event referencing identifying media or text:
  - `deepsynaps.video.session.v1`
  - `deepsynaps.audio.session.v1`
  - `deepsynaps.ehr.note.v1`
- `payload_uri` must point to encrypted, tenant-isolated object storage paths:
  - Separate bucket or key prefix per tenant.
  - Bucket policies enforce tenant isolation and deny cross-tenant reads.
  - KMS keys per tenant where required by contracts.
- `consent_version` is mandatory and must match an active consent record:
  - Producers validate consent locally (cached consent records with TTL) before publishing.
  - Consumers re-validate for safety in materializers and training builders.
  - Events failing consent validation are routed to a dead-letter topic (for example `deepsynaps.system.dlq.v1`) for human review and remediation.
- EHR text events must be de-identified before publish:
  - Recommended: Presidio or AWS Comprehend Medical in the producer pipeline.
  - Never publish raw note text inline.

## Replay and retention

- Durable storage: tiered storage to S3-compatible object store is the source of truth for long retention and replay.
- Replay unit: patient-scoped replay is the default operational mode:
  - Recompute feature views and embeddings for a single patient id across all modalities.
  - Re-run inference for trace reconstitution and model comparisons.
- Retention classes (applies to payloads and derived artifacts):

| Retention class | Intended use | Retention target |
|---|---|---:|
| `STANDARD` | Clinical operations and compliance (HIPAA baseline) | 7 years |
| `EXTENDED` | Long-lived records where mandated (for example pediatric) | 25 years |
| `RESEARCH_ONLY` | Research datasets with explicit scope and re-consent rules | 10 years |

- Consent events:
  - Never expire.
  - Compaction on (latest consent state per patient + history topic for audit if needed).

## Producer / consumer contracts

| Module | Produces | Consumes |
|---|---|---|
| qEEG Analyzer | `deepsynaps.qeeg.recording.v1`, `deepsynaps.qeeg.features.v1` | Consent updates, AI inference for display (optional) |
| MRI Analyzer | `deepsynaps.mri.structural.v1`, `deepsynaps.mri.fmri.v1` | Consent updates |
| Monitor (wearables + therapy devices) | `deepsynaps.wearable.timeseries.v1`, `deepsynaps.therapy.inclinic.v1`, `deepsynaps.therapy.home.v1` | Consent updates, AI inference for alerts (optional) |
| Patient Portal | `deepsynaps.assessment.completed.v1`, home device linking events (system) | AI inference for patient-facing summaries (restricted) |
| Virtual Care | `deepsynaps.video.session.v1`, `deepsynaps.audio.session.v1`, structured visit notes (system) | AI inference for clinician view |
| EHR connector | `deepsynaps.ehr.note.v1` | Consent updates, patient identity mapping (system) |
| Feature Store materializers | Feature view updates (internal store), optional materialization audit (system) | All modality topics + consent/outcome |
| Brain Twin inference service | `deepsynaps.ai.inference.v1` | Feature views (or raw events for batch), consent/outcome |
| Audit logger | Immutable audit log entries (internal store) | `deepsynaps.ai.inference.v1` + all input event topics for linkage |
| Drift monitors | Alerts (system) | Inputs and `deepsynaps.ai.inference.v1` |

## File layout under packages/event-bus/

Target monorepo layout for the paste-in destination at `packages/event-bus/`:

```
packages/event-bus/
  pyproject.toml
  src/deepsynaps_eventbus/__init__.py          # exports BaseEvent, publish(), Subscriber
  src/deepsynaps_eventbus/publisher.py         # async Kafka producer wrapper (aiokafka/confluent-kafka)
  src/deepsynaps_eventbus/subscriber.py        # async consumer with at-least-once + idempotent handlers
  src/deepsynaps_eventbus/avro/                # .avsc files (source of truth)
  src/deepsynaps_eventbus/schemas/             # generated Python classes from Avro (optional)
  tests/
```

Implementation notes (non-normative):

- Producer idempotency:
  - Include `event_id` and ensure at-least-once delivery does not duplicate downstream state (feature store materializers dedupe by `event_id`).
- Tracing:
  - Set `trace_id` at ingestion boundary and propagate through materialization, inference, and report generation.
- Serialization:
  - Confluent wire format with Schema Registry ids is recommended for high-throughput cross-language compatibility.
