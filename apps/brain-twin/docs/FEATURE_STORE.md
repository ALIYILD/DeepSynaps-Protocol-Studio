## Goals

- Single feature definition for training and serving, with schema-stable feature names and typed fields.
- Sub-100ms online lookup per patient at p99, including per-tenant scoping and common feature-set composition.
- Support batch (example: qEEG band power computed nightly or per upload), near-real-time (assessments arrive on submit), and streaming (live HRV during a SOZO session) feature paths under one retrieval API.
- Lineage from event to feature back to model output, including reproducible transforms and versioned artifacts.
- Point-in-time correctness for training samples and multi-tenant isolation across online, offline, and API boundaries.

## Stack choice

- OSS default: Feast.
  - Rationale: pluggable online/offline stores, Python-first feature definitions, and a clean fit with Kafka as the primary event source.
  - Feast supports point-in-time joins via `get_historical_features()` and a clear separation between feature definitions, materialization, and retrieval.
- Enterprise alternative: Tecton.
  - Rationale: managed operations, higher-throughput streaming pipelines, governance, and enterprise support when scale and compliance requirements exceed the OSS footprint.
- Incremental aggregation pattern reference: Roku’s 2025 talk on real-time feature serving with Chronon, which describes the practical pattern of incremental / windowed aggregation and serving derived state from a low-latency store. Reference: `https://www.youtube.com/watch?v=629rhyiV2OY`.

Recommended v1 stack (optimize for simplicity and correctness first, then scale):

- Event bus: Kafka (Layer 1; schemas defined in `EVENT_BUS_SCHEMAS.md`).
- Feature definitions: Feast feature repository (`packages/feature-store/feature_repo/`).
- Online store: Redis 7.
  - Target: sub-100ms p99 patient-level lookup.
  - Tenant isolation via key prefixing and API boundary enforcement.
- Offline store: Postgres (existing) plus Parquet on S3 for bulk training pulls.
  - Postgres: joinable, queryable feature tables for moderate-size historical pulls and debugging.
  - Parquet on S3: large-scale training extraction, reproducibility, and cost-efficient storage.
- Streaming compute: Faust (pure Python) for v1.
  - Migration path: Apache Flink for higher throughput and stronger operational primitives when needed.

Additional selection notes (agents should treat as constraints, not suggestions):

- Feast is the contract surface between Layer 1 and Layers 3-4. Downstream code must not depend on Kafka topic payload shapes directly.
- The online store is an optimization of the canonical feature state, not a source of truth. The canonical truth remains: replayable Layer 1 events plus deterministic transforms.
- Redis is chosen for low p99 latency and operational familiarity. If Redis p99 drifts, fix the data access pattern before changing stores.
- Postgres is chosen because it already exists in the monorepo’s operational footprint. Use it for joinable audit tables and small-to-medium analytics, not for large training scans.
- S3 Parquet is the default training format. Training code should read Parquet snapshots, not production Postgres, except for debugging.

## Feature taxonomy

| Feature group | Latency tier (batch / NRT / streaming) | Typical features | Source events | Owner module | Refresh cadence |
| --- | --- | --- | --- | --- | --- |
| qeeg_session_features | batch | band power per channel, TBR, IAPF, FAA, regional connectivity, z-scores per band per channel, source-localized ROI z-scores | deepsynaps.qeeg.features.v1 | qEEG Analyzer | per upload |
| qeeg_live_features | streaming | rolling 4 s band power, live z-score per channel, frontal asymmetry, vigilance index | LSL via deepsynaps.qeeg.recording.v1 (streaming variant) | qEEG Streaming | 250ms |
| mri_volumetrics | batch | DK ROI volumes, cortical thickness, white-matter integrity, ventricle ratio | deepsynaps.mri.structural.v1 | MRI Analyzer | per scan |
| wearable_daily | batch | daily HRV (RMSSD, SDNN), resting HR, sleep stages duration, sleep efficiency, total activity, training load | deepsynaps.wearable.timeseries.v1 | Monitor | nightly per patient |
| wearable_live | streaming | rolling 5-min HRV, current HR, current SpO2, current activity | deepsynaps.wearable.timeseries.v1 (streaming) | Monitor | every 5 min |
| therapy_dose_cumulative | NRT | total rTMS pulses last 30d per target, total tDCS minutes, adherence pct home protocols, last session date | deepsynaps.therapy.inclinic.v1 + deepsynaps.therapy.home.v1 | Brain Twin | on each therapy event |
| assessment_scores | NRT | latest PHQ-9 total, GAD-7 total, BPRS total, MoCA total, change vs baseline, change vs last session, completion rate | deepsynaps.assessment.completed.v1 | Patient Portal | on submit |
| video_features | batch | gait cadence, gait symmetry, facial AU summary stats, blink rate, eye-tracking saccade summary | deepsynaps.video.session.v1 (derived features) | Virtual Care | per session |
| audio_features | batch | speech rate, F0 mean/range, jitter, shimmer, breathing rate | deepsynaps.audio.session.v1 | Virtual Care | per session |
| ehr_text_summary | batch | note count last 30d, latest discharge summary embedding, latest med list embedding, problem list embedding | deepsynaps.ehr.note.v1 | EHR connector | nightly |
| outcome_signals | batch | clinician-reported response (yes/no), remission flag, AE flag, dropout flag, days to first response | deepsynaps.outcome.recorded.v1 | Brain Twin | on event |

### Feature set composition (serving-facing contract)

Feature sets are named bundles used by Layers 3–4 and other services. They are explicit so:

- callers do not hardcode individual feature view lists
- feature additions are reviewed as contract changes
- feature-store can apply caching and retrieval optimization per set

Canonical feature sets (v1): `core`, `qeeg`, `imaging`, `virtual_care`, `ehr`, `outcomes`, `full`.

Rules:

- Feature sets are implemented as data in `packages/feature-store/src/deepsynaps_features/serve.py` (dict of set -> list of Feast refs).
- Every set has a `feature_set_version` string used for model output lineage and change control.
- `full` may include streaming groups conditionally, gated by freshness and session context.

## Feature definition pattern

Below are concrete Feast definitions illustrating the intended style for Layer 2. The intent is that:

- Entities and feature views are stable, reviewed APIs.
- Transforms are implemented once in `packages/feature-store/src/deepsynaps_features/transforms/` and imported by both batch and streaming paths.
- Kafka topics are the source of truth for event-to-feature derivations in both real-time and backfill flows.
- Every feature view includes:
  - stable names suitable for model code and dashboards
  - typed fields and explicit units in names where needed
  - tags for ownership, latency tier, and schema provenance
  - explicit TTL semantics aligned with clinical use cases

Key conventions for Field naming:

- Use `bp_<band>_<channel>_uv2` for raw band power in \(\mu V^2\) unless otherwise specified.
- Use `z_<band>_<channel>` for z-scored features with a known reference dataset; store the reference dataset version separately.
- Use `roi_*` prefixes for source-localized ROIs; do not overload channel-derived names.
- Avoid ambiguous suffixes like `_value`. Prefer `_hz`, `_ms`, `_pct`, `_bpm`, `_s` when applicable.

### Entity and timestamp policy

The system uses two time notions:

- `occurred_at`: event time as produced by the modality pipeline (the timestamp used for point-in-time joins).
- `ingested_at`: time the event was accepted by the event bus ingestion path.

Rules:

- Feast `timestamp_field` must be `occurred_at` for all KafkaSources.
- Offline audit tables store both `occurred_at` and `ingested_at`.
- Historical retrieval uses `occurred_at` as the event timestamp column.

Ownership and evolution:

- One owner per feature group.
- Additive changes only by default; renames require deprecation + feature_set_version bump.
- CI must run `feast apply` (schema validation) and parity tests (consistency validation).

```python
from datetime import timedelta

from feast import Entity, FeatureView, Field
from feast.types import Float32, Float64, Int32, String
from feast.data_source import KafkaSource

# Patient entity is the stable join key across all modalities.
patient = Entity(
    name="patient",
    join_keys=["patient_id"],
    description="Brain Twin patient entity. All modality features join on patient_id.",
)

# KafkaSource points to the Layer 1 event bus schema for derived qEEG session features.
# The event payload must carry:
# - patient_id
# - tenant_id (enforced at API boundary; also persisted for offline auditing)
# - event_timestamp (occurred_at) for point-in-time correctness
qeeg_features_source = KafkaSource(
    name="kafka_deepsynaps_qeeg_features_v1",
    kafka_bootstrap_servers="kafka:9092",
    topic="deepsynaps.qeeg.features.v1",
    timestamp_field="occurred_at",
    message_format="json",
)

# qeeg_session_features is treated as a per-upload batch-like feature group.
# It can be computed in a batch pipeline and pushed, but is also definable in Feast
# so the training/offline join is consistent with serving schema.
qeeg_session_features = FeatureView(
    name="qeeg_session_features",
    entities=[patient],
    ttl=timedelta(days=3650),
    online=True,
    source=qeeg_features_source,
    tags={
        "layer": "2",
        "latency_tier": "batch",
        "owner": "qEEG Analyzer",
        "event_schema": "deepsynaps.qeeg.features.v1",
    },
    schema=[
        # Example typed schema (made-up but realistic). Keep field names stable.
        Field(name="tbr_fz", dtype=Float32),
        Field(name="iapf_hz", dtype=Float32),
        Field(name="faa_f3_f4", dtype=Float32),
        Field(name="bp_delta_fz_uv2", dtype=Float32),
        Field(name="bp_theta_fz_uv2", dtype=Float32),
        Field(name="bp_alpha_fz_uv2", dtype=Float32),
        Field(name="bp_beta_fz_uv2", dtype=Float32),
        Field(name="z_alpha_fz", dtype=Float32),
        Field(name="z_beta_fz", dtype=Float32),
        Field(name="conn_alpha_frontal", dtype=Float32),
        Field(name="roi_z_dlpfc_left_alpha", dtype=Float32),
        # Model consumers often need provenance fields; keep them explicit.
        Field(name="recording_duration_s", dtype=Int32),
        Field(name="pipeline_version", dtype=String),
    ],
)
```

```python
from datetime import timedelta

from feast import Field, StreamFeatureView
from feast.types import Float32, String
from feast.data_source import KafkaSource

# wearable_live is a streaming feature group where the online store is the primary consumer.
# Offline storage still exists for audit and training, but the online lookup must be fresh.
wearable_stream_source = KafkaSource(
    name="kafka_deepsynaps_wearable_timeseries_v1_streaming",
    kafka_bootstrap_servers="kafka:9092",
    topic="deepsynaps.wearable.timeseries.v1.streaming",
    timestamp_field="occurred_at",
    message_format="json",
)

# StreamFeatureView expresses that features are derived continuously from a stream.
# The compute step is executed by a streaming worker (Faust v1), which writes derived
# state into the online store using the same field names and types.
wearable_live = StreamFeatureView(
    name="wearable_live",
    entities=[patient],
    ttl=timedelta(hours=6),
    online=True,
    source=wearable_stream_source,
    tags={
        "layer": "2",
        "latency_tier": "streaming",
        "owner": "Monitor",
        "event_schema": "deepsynaps.wearable.timeseries.v1.streaming",
    },
    schema=[
        Field(name="hr_bpm_current", dtype=Float32),
        Field(name="spo2_pct_current", dtype=Float32),
        Field(name="hrv_rmssd_5m_ms", dtype=Float32),
        Field(name="activity_index_current", dtype=Float32),
        Field(name="source_device_id", dtype=String),
    ],
)
```

## Online and offline stores

Online store (serving path):

- Redis 7 as the Feast online store.
- Per-tenant key prefix to guarantee isolation at the storage layer.
  - Canonical key shape:
    - `tenant:{tenant_id}:patient:{patient_id}:fv:{feature_view_name}` for grouped lookups
    - Alternatively, per-feature keys if needed, but prefer grouped payloads for fewer round trips.
- Persistence: AOF enabled.
  - Rationale: reduce risk of transient Redis loss causing feature unavailability during a clinical session.
  - Use fsync policy appropriate to environment; v1 target is correctness and availability over absolute minimal write latency.
- SLO: sub-100ms p99 online lookup per patient for the common feature sets.
- Retrieval API pattern used by Layer 3-4:

```python
brain_twin.fetch_patient_features(patient_id, feature_set="full") -> dict
```

The `feature_set` abstraction is how downstream models express what they need without hardcoding per-view lookups throughout the codebase.

Lookup semantics (agents must implement these):

- The API always requires `tenant_id` at the boundary, even if not shown in the simplified signature above.
- Retrieval uses a single network round trip per backing store where possible:
  - Redis pipelining for multi-view reads.
  - Avoid N+1 patterns per feature group.
- Retrieval returns:
  - feature values
  - a minimal metadata envelope per feature group:
    - `occurred_at` of the freshest contributing event
    - `materialized_at` or write time
    - `pipeline_version` or transform version
  - This metadata is used for debugging, freshness gating, and model output lineage.

### Storage schemas (normative, compact)

Redis:

- Group key: `tenant:{tenant_id}:patient:{patient_id}:fg:{feature_group}` (HASH).
- Fields: feature names plus `__meta:max_occurred_at`, `__meta:materialized_at`, `__meta:transform_version`, `__meta:source_event_schema`.
- Atomic group writes; streaming groups may expire, batch groups generally do not.

Postgres:

- One table per feature group, primary key `(tenant_id, patient_id, occurred_at, transform_version)`.
- Required columns: `tenant_id`, `patient_id`, `occurred_at`, `ingested_at`, `transform_version`, `materialized_at`, feature columns.
- RLS enabled on all feature tables with policy `tenant_id = current_setting('app.tenant_id', true)`.

Offline store (training and audit path):

- Postgres for joinable feature tables.
  - Purpose: debugging, analytics, small-to-medium training pulls, and human inspection.
  - Each feature row carries at minimum: `tenant_id`, `patient_id`, `occurred_at`, `ingested_at`, `feature_group`, plus the feature columns.
- Parquet on S3 for bulk training pulls.
  - Purpose: scale-out training data extraction and reproducible snapshots at specific pipeline versions.
- Point-in-time correctness is enforced by Feast:
  - Use `get_historical_features()` to join entity rows at time \(t\) with only features available at or before \(t\), within the declared TTL windows.
  - Training dataset creation always starts from an entity dataframe containing `patient_id`, `tenant_id`, and the sample timestamp column.

Point-in-time join pattern (Feast historical retrieval):

```python
# Entity dataframe columns:
# - tenant_id
# - patient_id
# - event_timestamp (sample time)
training_df = store.get_historical_features(
    entity_df=entity_df,
    features=[
        "qeeg_session_features:tbr_fz",
        "qeeg_session_features:iapf_hz",
        "wearable_daily:hrv_rmssd_ms",
        "assessment_scores:phq9_total_latest",
    ],
).to_df()
```

Training code should treat `entity_df` as the contract that enforces point-in-time correctness. Feature Store code must reject historical pulls that omit an event timestamp column.

## Streaming compute

Streaming workers exist to compute incremental aggregations and maintain derived state in the online store. The preferred pattern is incremental aggregation rather than recomputing from scratch per event.

v1 approach:

- Faust workers consume from Kafka topics.
- For each feature group, one dedicated worker process (or deployment unit) owns:
  - event parsing and schema validation
  - stateful aggregation
  - writing the derived feature dict to Redis in the Feast online format
- Incremental aggregation techniques:
  - rolling means and variances
  - exponentially weighted moving averages
  - ring-buffered windowed aggregates for fixed windows (example: 4 s qEEG band power windows, 5 min HRV)
- Backpressure policy:
  - drop oldest before blocking to preserve recency and keep serving fresh state
  - record drop counts as a metric per feature group and tenant
- State persistence:
  - stateful aggregations checkpoint to RocksDB so a worker restart does not reset rolling windows.
  - checkpoint keys are tenant-scoped and include feature group versioning.

Notes:

- Streaming compute should not be responsible for business logic branching based on model needs. It writes the canonical feature state; retrieval composes feature sets.
- Keep transform logic in pure Python functions shared across batch and streaming paths to minimize drift.

Worker contract details (implementation constraints):

- Input event requirements:
  - `tenant_id`, `patient_id`
  - `occurred_at` as event time (not ingestion time)
  - `event_id` for deduplication
  - `schema_version` to support safe evolution
- Deduplication:
  - Keep a bounded per-patient LRU of recent `event_id`s in RocksDB.
  - When an event is duplicated, do not update state; increment a metric counter.
- Out-of-order handling:
  - Windowed aggregates must be robust to small out-of-order jitter.
  - Define an allowed lateness bound per group (example: wearable streaming 30s, qEEG streaming 2s).
  - Events older than the allowed lateness are ignored for online state but still written to offline audit storage if required.
- Write pattern:
  - Online writes are atomic per patient and feature group.
  - Payload includes both values and a metadata envelope with `max_occurred_at` and transform version.

RocksDB checkpointing rules:

- Store aggregation state, not raw events.
- Checkpoint keys include:
  - tenant_id
  - patient_id
  - feature_group
  - transform_version
- If transform_version changes, do not attempt to load old state; start fresh and rely on replay/backfill to converge if needed.

Implementation contract for `workers.py` (agents must follow):

- One worker process per feature group.
- Handler steps per event:
  - parse + validate required fields (`tenant_id`, `patient_id`, `occurred_at`, `event_id`, `schema_version`)
  - dedup by `(tenant_id, patient_id, event_id)` with bounded RocksDB state
  - update aggregation state (ring buffer / EWMA / rolling window primitives)
  - write a single atomic group update to Redis including metadata
- Backpressure: bounded buffers; drop oldest before blocking; metrics for drops and late events.

## Backfill and replay

Every feature is recomputable from Layer 1 event bus replay. Backfill is not a special-case pipeline; it is the replay of the same transform logic over a bounded time range.

Backfill job pattern:

- Read events from S3 tiered storage by:
  - tenant_id
  - patient_id set or cohort query
  - time range \([t0, t1]\)
  - schema version filters when necessary
- Apply the same transform code as the streaming worker:
  - deduplicated logic in a single transform module per feature group
  - deterministic outputs given the same event stream ordering and timestamps
- Write outputs:
  - offline store tables in Postgres for audit and debugging
  - Parquet partitions on S3 for bulk training pulls and snapshots

Operational workflow for new features:

- Add feature columns and definitions behind a feature group version tag.
- Run backfill to populate offline storage for the historical window required for training.
- Only after offline backfill is complete, enable online serving materialization for the new fields.
- Downstream encoders and fusion model adopt new features by feature set selection, not by direct Redis access.

Backfill idempotency and reproducibility:

- Backfill runs are keyed by:
  - tenant_id
  - feature_group
  - transform_version
  - time range
  - input event snapshot identifier (S3 partition set)
- Writes to Parquet use partitioning:
  - `tenant_id=<...>/feature_group=<...>/transform_version=<...>/date=<YYYY-MM-DD>/`
- Postgres writes use upserts with:
  - primary key: `(tenant_id, patient_id, occurred_at, feature_group, transform_version)`
  - conflict policy: update feature columns and `materialized_at`, never delete.

Replay semantics:

- Online replay is optional and used for fast convergence after incidents.
- Offline replay is required for correctness and must always be possible for any feature group.

Backfill runner contract:

- Input: replayable Layer 1 events from S3 tiered storage filtered by tenant, patient set, and time range.
- Compute: call `compute_batch(events_df)` from the same transform module as streaming.
- Output:
  - Postgres upsert into per-group table keyed by `(tenant_id, patient_id, occurred_at, transform_version)`
  - Parquet partitions on S3: `tenant_id=<...>/feature_group=<...>/transform_version=<...>/date=<YYYY-MM-DD>/`
- Acceptance:
  - deterministic results per input snapshot
  - idempotent writes
  - no cross-tenant rows

### New feature rollout checklist (Layer 2 contract)

- Add fields to transform output and Feast schema.
- Add unit tests for transform edge cases.
- Add parity test coverage for batch vs streaming.
- Backfill offline historical data for training horizon.
- Add to feature set with a feature_set_version bump.
- Only then enable online serving in production and roll out to model consumers.

## Train-serve consistency

Core rule: one feature group, one canonical transform module, two execution modes.

Contract per feature group:

- `compute_batch(events_df) -> features_df`
  - Input: a dataframe of events (already schema-normalized).
  - Output: a dataframe keyed by `(tenant_id, patient_id, occurred_at)` or the group-specific feature timestamp, with feature columns.
- `compute_online(event) -> feature_dict`
  - Input: a single event object.
  - Output: a dict of feature updates for that patient and group, suitable for merging into the online state.

Implementation rule:

- Both functions call into the same underlying pure functions to avoid drift.
- Feast definitions reference the same names and schemas, so types and field names stay aligned with the transform outputs.

CI parity test:

- For each feature group:
  - Use a fixed fixture event stream and deterministic ordering.
  - Run batch path to get `features_df`.
  - Run streaming path by feeding events one-by-one and capturing the resulting online state snapshots.
  - Assert equality of final results for the same window and timestamps with numeric tolerance where relevant:
    - tolerances are explicit, per feature, and reviewed.
  - Fail the build if any mismatch is detected, as this is the primary guardrail against train-serve skew.

Consistency failure modes to guard against:

- Different default parameter choices between batch and streaming (window length, smoothing factor, baseline reference set).
- Different handling of missing values, NaNs, and out-of-range sensor values.
- Different timestamp semantics (event time vs ingestion time).
- Accidental feature renaming in one path but not the other.

Agent rule:

- If a feature requires state (rolling windows), implement the state update once and call it from:
  - a vectorized batch loop that replays events in order
  - the streaming per-event handler

### Numeric tolerance and determinism guidelines

Consistency tests must account for floating-point realities while still being strict enough to catch drift.

- Use deterministic algorithms for windowed features:
  - avoid non-deterministic parallel reductions
  - explicitly sort by `(occurred_at, event_id)` before replay
- Numeric tolerances:
  - default absolute tolerance: 1e-6 for normalized/z-score features
  - default relative tolerance: 1e-4 for physiologic aggregates
  - per-feature overrides are allowed but must be justified in the test name

### Transform versioning rules

Every feature group publishes a `transform_version` string. It must change when:

- computation logic changes
- baseline reference sets change (z-scores, embeddings)
- window parameters change

Transform version is recorded in:

- Redis metadata `__meta:transform_version`
- Postgres `transform_version` column
- model output lineage records (Layer 4)

## Multi-tenant isolation

Isolation must hold across every boundary: storage, retrieval, and tests.

Data model:

- Every feature row carries `tenant_id`.
- Every online key and/or payload is tenant-prefixed.

Online store (Redis):

- Key prefix: `tenant:{tenant_id}:...` is mandatory.
- Feature retrieval never constructs keys without tenant context.

Offline store (Postgres):

- Row-Level Security (RLS) policies enforce that a session scoped to a tenant cannot read other tenant rows.
- Tables include `tenant_id` as a mandatory column, indexed with `patient_id` and timestamp.

API boundary:

- Feast retrieval functions are wrapped by a Brain Twin API that requires `tenant_id` and enforces scoping for:
  - online lookups
  - historical retrieval
  - materialization and backfill operations
- Retrieval without tenant context is an error.
  - Use an explicit exception (example: `TenantScopeError`) to prevent accidental fallback to unscoped behavior.

Smoke test requirement:

- A cross-tenant lookup must return empty.
  - Create two tenants with the same `patient_id` value.
  - Materialize different feature values in each tenant.
  - Assert that tenant A cannot read tenant B values and vice versa.

Additional enforcement requirements:

- Tenant scoping is enforced at the API boundary and must not rely only on storage configuration.
- Any caching layer above Redis must include tenant_id in cache keys.
- Feature sets are tenant-agnostic definitions, but resolution is tenant-scoped at runtime.

Minimal test matrix:

- Same patient_id in two tenants, different values, online lookup isolation.
- Same patient_id in two tenants, different values, historical retrieval isolation.
- Attempt to materialize a feature for tenant A using tenant B credentials, rejected.

### Tenant scoping at the Feast boundary

Feast does not natively enforce tenant scoping across all backends in a way that replaces application enforcement. Therefore:

- The Brain Twin feature-store wrapper must:
  - require tenant_id
  - inject tenant_id filters into offline retrieval paths
  - use tenant-prefixed online keys
- The entity key for Feast joins remains `patient_id` for model compatibility, but:
  - offline tables include tenant_id and are filtered by tenant_id
  - online keys include tenant_id

If a future implementation uses a composite entity key, it must be introduced behind a new entity definition and a feature set version bump.

## Observability

Feature Store observability is about freshness, lag, correctness signals, and serving latency.

Prometheus metrics (minimum set):

- `feature_store_feature_lag_seconds{tenant_id, feature_group}` as a histogram or summary with p50/p95/p99.
  - Definition: \(now - max(occurred\_at)\) for the latest materialized feature per patient aggregated appropriately, or per group stream watermark.
- `feature_store_lookup_latency_ms{tenant_id, feature_set}` as a histogram with p50/p95/p99.
  - Definition: end-to-end latency of `fetch_patient_features` including Feast retrieval and Redis IO.
- `feature_store_freshness_staleness_seconds{tenant_id, feature_group}` as a histogram.
  - Definition: \(now - max(occurred\_at)\) computed per group, used to detect stale streams or batch pipelines.
- `feature_store_write_errors_total{tenant_id, feature_group, error_class}` as a counter.
  - Tracks Kafka decode errors, schema violations, Redis write errors, and checkpoint failures.

Grafana dashboard:

- Panels for:
  - lag per feature group (p50/p95/p99)
  - online lookup latency per feature set (p50/p95/p99)
  - staleness per feature group
  - event ingestion rate and drop counts
- Support per-tenant cuts and global views.

Alerts:

- Any feature lag \(per group\) above its SLO triggers PagerDuty.
- Sustained lookup latency p99 above 100ms triggers PagerDuty.
- Streaming worker drop rate above a defined threshold triggers PagerDuty (often a symptom of downstream slowness or upstream burst).

Metric bucket guidance (so teams measure comparable distributions):

- `feature_store_lookup_latency_ms` buckets: 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000.
- `feature_store_feature_lag_seconds` buckets: 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600.

Alert rule examples (names and thresholds are normative; routing is environment-specific):

- `FeatureStoreOnlineLookupP99High`:
  - condition: p99 lookup latency > 100ms for 5m for any tenant and feature_set
- `FeatureStoreStreamingLagHigh`:
  - condition: p95 lag > 5s for 2m for any streaming feature_group and tenant
- `FeatureStoreBatchFreshnessStale`:
  - condition: batch staleness > 24h for 30m for any batch feature_group and tenant

### Traceability and model output lineage hooks

Layer 2 must provide enough metadata for Layer 4 to create a lineage graph:

- For each model invocation, capture:
  - feature_set, feature_set_version
  - per-group `max_occurred_at`
  - per-group transform_version
  - request id / correlation id
- Store this alongside the model output record so that:
  - a clinician can audit which data drove a recommendation
  - a model regression can be traced to upstream feature freshness or transform changes

The lineage requirement in Goals is satisfied only if these fields are persisted, not merely logged.

## File layout

Target monorepo placement: this document is intended to be pasted into both `apps/brain-twin/docs/` and `packages/feature-store/` to anchor implementation for Cursor agents.

Proposed tree:

```
packages/feature-store/
  pyproject.toml
  src/
    deepsynaps_features/
      __init__.py
      definitions/
        qeeg.py
        mri.py
        wearable.py
        therapy.py
        assessment.py
        video.py
        audio.py
        ehr.py
        outcome.py
      transforms/
        qeeg.py
        mri.py
        wearable.py
        therapy.py
        assessment.py
        video.py
        audio.py
        ehr.py
        outcome.py
      streaming/
        workers.py
      serve.py
  feature_repo/
    feature_store.yaml
    entities.py
    qeeg.py
    mri.py
    wearable.py
    therapy.py
    assessment.py
    video.py
    audio.py
    ehr.py
    outcome.py
  tests/

apps/brain-twin/
  docs/
    FEATURE_STORE.md
```

Conventions implied by this layout:

- `definitions/*.py` contains Feast definitions only, importing shared constants and schemas.
- `transforms/*.py` contains pure functions used by both batch and streaming.
- `streaming/workers.py` contains Faust app wiring and state stores, minimal business logic.
- `serve.py` contains the stable retrieval API used by Layer 3-4.
- `feature_repo/` is the Feast repo boundary, suitable for CI validation and deployment.

Repository rules for Cursor agents:

- New feature groups must add:
  - one `definitions/<group>.py`
  - one `transforms/<group>.py`
  - unit tests for transform correctness
  - parity test coverage in the consistency suite
- Do not add feature definitions directly into `workers.py`. Workers import transforms and definitions.

### Minimal module responsibilities

- `src/deepsynaps_features/serve.py`:
  - `fetch_patient_features(tenant_id, patient_id, feature_set) -> dict`
  - feature set resolution
  - freshness gating
  - metadata envelope construction
- `src/deepsynaps_features/streaming/workers.py`:
  - Faust app wiring
  - per-feature-group agents
  - state store integration
  - online writes
- `src/deepsynaps_features/transforms/*.py`:
  - pure functions
  - deterministic replay logic
  - shared state update primitive for batch and online
- `tests/`:
  - transform unit tests
  - parity tests
  - tenant isolation smoke tests

### apps/brain-twin integration points

When pasted into `apps/brain-twin/docs/FEATURE_STORE.md`, agents should also implement:

- Brain Twin service call site:
  - `FeatureStoreClient.fetch_patient_features(...)`
- Model invocation wrapper that:
  - attaches feature store metadata to the model output record
  - enforces feature set selection as configuration, not ad hoc code

## SLOs

| SLO | Target | Measurement method |
| --- | --- | --- |
| Online lookup latency | p99 < 100ms | `feature_store_lookup_latency_ms` histogram, per `feature_set`, per tenant |
| Streaming feature lag | p95 < 5 s | `feature_store_feature_lag_seconds` per streaming group, per tenant |
| Batch feature freshness | < 24 h | `feature_store_freshness_staleness_seconds` for batch groups, per tenant |
| Backfill throughput | > 1k patients/hour | backfill job metrics: processed patients/time, plus write throughput to Parquet/Postgres |
| Cross-tenant leak rate | = 0 | automated cross-tenant smoke test in CI and periodic production canary |
