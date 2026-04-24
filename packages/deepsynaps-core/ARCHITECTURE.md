# DeepSynaps Core — the nervous system that wires every module together

> You have seven subsystems. This document defines the **connective tissue**
> that makes them compound into one product instead of seven silos.

---

## The seven subsystems

| # | Subsystem                       | Status        | Produces                                        | Consumes                           |
|---|---------------------------------|---------------|-------------------------------------------------|------------------------------------|
| 1 | **qEEG Analyzer**               | built         | band-power, FC, microstates, brain-age          | raw EEG                            |
| 2 | **MRI Analyzer**                | built         | volumetrics, FC, DTI, stim targets, E-field     | DICOM / NIfTI                      |
| 3 | **MedRAG** (87k papers)         | built         | grounded evidence for any finding               | entity+z-score queries             |
| 4 | **Protocol Generator** (SOZO)   | built         | 80-page personalized clinical protocol          | findings + condition + patient     |
| 5 | **Home biometrics**             | planned       | HRV, sleep, actigraphy, mood PROMs              | wearable APIs                      |
| 6 | **Crisis risk stratification**  | planned       | suicide/crisis probability + tier               | all signals above                  |
| 7 | **Dr. OpenClaw agents**         | planned       | clinical actions, summaries, chat, scheduling   | the whole patient record           |

Without wiring, these are seven apps. With wiring, they become **one longitudinal
patient brain + behaviour record**, usable by humans and agents interchangeably.

---

## The six pieces of connective tissue

### 1. Shared patient timeline — `PatientGraph`

One immutable, append-only event log per patient. Every subsystem writes
**events** here; every subsystem reads from here. Think of it as the
patient's medical git log.

```
patient_id ──┬── event(kind=qeeg_analysis,      payload=QEEGReport)
             ├── event(kind=mri_analysis,        payload=MRIReport)
             ├── event(kind=protocol_generated,  payload=SOZOProtocol)
             ├── event(kind=stim_session,        payload=SessionLog)
             ├── event(kind=wearable_day,        payload=DailyBioSummary)
             ├── event(kind=prom_score,          payload=PROM)
             ├── event(kind=crisis_alert,        payload=RiskScore)
             └── event(kind=agent_action,        payload=AgentTrace)
```

Schema: `src/deepsynaps_core/timeline.py::PatientEvent` (Pydantic).
Storage: one `patient_events` table + JSONB payload + pgvector embedding
(already running Postgres). No new infrastructure needed.

**Why this is the linchpin:** every downstream feature — longitudinal
change maps, crisis prediction, agent context — needs chronological access
to heterogeneous events. One table, one query pattern, one audit trail.

### 2. Unified feature bus — `FeatureStore`

Every subsystem publishes numeric features into a single namespaced store,
**z-score normalized against age/sex peers**. A feature is:

```python
Feature(
    patient_id, t_utc, source,    # 'qeeg'|'mri'|'wearable'|'prom'|'derived'
    name,                         # 'DMN_within_fc' | 'hrv_rmssd_7d' | 'phq9_total'
    value, unit, z, percentile, flagged
)
```

Three queries the whole product depends on:
- `get_current_features(patient_id, age_hours=24)` → snapshot
- `get_feature_trajectory(patient_id, name, window_days=90)` → timeseries
- `get_features_by_flag(patient_id)` → only abnormal ones

File: `src/deepsynaps_core/feature_store.py`. Backed by a materialized
view over `patient_events` + a Redis last-known-values cache.

### 3. Cross-modal embedding space — `PatientVector`

One 768-d vector per patient per day, concatenating:

```
patient_vector = concat(
    qeeg_embedding[256],      # from qEEG foundation-model head
    mri_embedding[200],        # from brain-age CNN penultimate layer
    biometric_embedding[128],  # from HRV+sleep+activity encoder
    prom_embedding[96],        # sentence-transformer over symptoms
    demographics[88],          # age/sex/meds/diagnoses one-hot
)
```

Stored in pgvector, HNSW-indexed. Three capabilities unlock:
- **Case similarity** — "find patients most similar to this one who responded to iTBS"
- **Cohort cursor** — "on this treatment, these 12 patients are trajecting wrong"
- **Cold-start retrieval** — new patient → top-20 analogues → prior-art protocols

File: `src/deepsynaps_core/embeddings.py`. Updated nightly by a Celery cron.

### 4. Crisis & safety signal fusion — `RiskEngine`

Single module consumes the FeatureStore and publishes a continuous
`risk_score ∈ [0,1]` with a tier (`green|yellow|orange|red`). Inputs
include everything you already have:

| Signal class         | Examples                                                        |
|----------------------|-----------------------------------------------------------------|
| **Structural**       | hippocampal/ACC atrophy z, WMH burden                            |
| **Functional**       | sgACC-DLPFC anticorrelation weakening, DMN hyperconnectivity     |
| **Neurophysiologic** | qEEG alpha asymmetry, theta/beta ratio drift                      |
| **Biometric**        | 7-day HRV trend, sleep fragmentation, step-count collapse        |
| **Behavioural**      | PHQ-9 Δ, C-SSRS, linguistic markers from patient chat            |
| **Protocol adherence**| missed sessions, device compliance                               |
| **Contextual**       | anniversary dates, medication changes, season (winter ↑ risk)    |

Output is emitted back into the timeline as a `crisis_alert` event; that
event triggers agent routing (next section).

File: `src/deepsynaps_core/risk_engine.py`. Initially a calibrated logistic
regression (transparent, auditable) with a gradient-boosted overlay; upgrade to a
graph-fused model once you have 500+ patients.

**Evidence base:** Columbia Suicide Severity Rating Scale (C-SSRS); Mayo
Clinic ML suicide-risk work ([Barak-Corren 2020](https://doi.org/10.1001/jamanetworkopen.2020.1262));
VA REACH-VET program; wearable-HRV correlates of MDD severity
([Kemp 2014](https://doi.org/10.1016/j.biopsych.2011.07.012)).

**Regulatory posture v1:** decision-support only. Red-tier alerts send a
notification to the clinician inbox; they do *not* autonomously contact
the patient. This keeps you outside SaMD Class III until you have prospective trial data.

### 5. Agent layer — `OpenClawBus`

Dr. OpenClaw is not one agent; it's a **router over specialized agents**,
each with a single job and read-only access to the timeline. The
architecture is Anthropic's "orchestrator-worker" pattern:

```
          ┌────────────────────────────────────────────────┐
          │   Orchestrator (GPT-5 / Claude Opus 4.7)       │
          │   reads: PatientGraph + RiskEngine + Protocol  │
          └────────────┬───────────────────────────────────┘
                       │ routes to
   ┌─────────┬─────────┼─────────┬──────────┬───────────┐
   ▼         ▼         ▼         ▼          ▼           ▼
InsightDr  Protocol  Crisis    Scribe    Scheduler  Research
(summarize)  Dr       Dr       (SOAP notes) (next  Dr  (MedRAG+
  EEG/MRI  (tunes    (escalate,            visit,    literature
  reports  protocol)  triage)               refill)    search)
```

Contract: every agent receives a `PatientContext` (not the raw record) —
a 4-8k-token synthesis built by the Context Builder that pulls from
PatientGraph + FeatureStore. Every action an agent takes is written back
as an `agent_action` event with full provenance (model, prompt hash,
tools used, clinician review status).

Files: `src/deepsynaps_core/agents/{bus,context_builder,tools}.py`.

**Two hard rules** (write these into the bus itself, not per agent):

1. **No write without a clinician-accept event in the timeline.** Agents
   can draft orders, messages, protocol edits. Only a human click turns
   them into `mutation` events. This is the ethical and regulatory floor.
2. **Every retrieval that influences an agent answer is logged**. If an
   agent cited a paper, the paper_id appears in the action's `sources`
   field. This is what lets a clinic defend a decision in a board review.

### 6. Event bus & ingest gateway — `EventBus`

One message broker (Redis Streams or NATS — both are 20 lines of config)
that every subsystem publishes to. Replaces the current situation where
qEEG, MRI, and future biometric ingest each have their own API surface.

```
POST /ingest/eeg/raw      ─┐
POST /ingest/mri/dicom    ─┤
POST /ingest/wearable     ─┼──► EventBus ──► Celery workers
POST /ingest/prom         ─┤                   │
POST /ingest/chat         ─┘                   ├─► analyzer pipelines
                                               ├─► feature_store updater
                                               ├─► patient_vector updater
                                               └─► risk_engine retrigger
```

File: `src/deepsynaps_core/bus.py`. Consumers are idempotent: a wearable
hiccup that resends yesterday's HRV is a no-op.

---

## The physical architecture

```
                              ┌──────────────────────┐
                              │  Clinical Dashboard  │
                              │  (Next.js 14)        │
                              └───────────┬──────────┘
                                          │ single unified API
                                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                      DeepSynaps Core API                           │
│   FastAPI · same Postgres · same auth · OpenClaw orchestrator     │
└──┬────────────┬────────────┬────────────┬────────────┬────────────┘
   │            │            │            │            │
   ▼            ▼            ▼            ▼            ▼
qEEG         MRI         Protocol      Biometric    Crisis
analyzer     analyzer    generator     ingester     RiskEngine
            (built)     (built)      (SOZO)        (new)         (new)
   │            │            │            │            │
   └────────────┴────────────┼────────────┴────────────┘
                             ▼
                    ┌─────────────────────┐
                    │  Postgres +         │
                    │  pgvector +         │
                    │  timescaledb (opt)  │
                    │                     │
                    │  patient_events     │  ← single source of truth
                    │  features_mv        │  ← materialized feature store
                    │  patient_vectors    │  ← pgvector 768-d
                    │  kg_entities/relations (MedRAG, existing)
                    └─────────────────────┘
```

One database. One event log. One feature store. One vector space. Seven
subsystems reading and writing through them.

---

## What this enables that isolated modules cannot

| Capability                                    | Needs which pieces                          |
|-----------------------------------------------|---------------------------------------------|
| "Show me how this patient changed over 6 weeks" | Timeline + FeatureStore                   |
| "Find patients like this one who responded"     | PatientVector                              |
| "Draft a protocol from this week's data"        | FeatureStore + Protocol Generator + Agents |
| "Flag deteriorating patients before the visit"  | FeatureStore + RiskEngine                  |
| "Why is this patient at yellow?"                | RiskEngine + MedRAG + Agents               |
| "Call me when something matters"                | RiskEngine + EventBus + Agents             |
| Clinician-facing summary each morning           | Agents + FeatureStore + Timeline           |
| Federated research across clinics               | PatientVector (centroids only)             |

---

## Build order (recommended)

| Phase | Weeks | Build                                                          |
|-------|-------|----------------------------------------------------------------|
| 0     | 1–2   | `patient_events` table + Pydantic `PatientEvent` + migrate qEEG/MRI reports to write events |
| 1     | 2–3   | `FeatureStore` materialized view + Redis cache + backfill from existing reports |
| 2     | 3–4   | `EventBus` (Redis Streams) + move all ingest endpoints behind it |
| 3     | 4–6   | `RiskEngine` v0 (logistic regression on baseline features) + clinician inbox |
| 4     | 5–7   | `PatientVector` nightly job + similarity search endpoint       |
| 5     | 6–9   | `OpenClawBus` with three starter agents (InsightDr, ScribeDr, CrisisDr) |
| 6     | 8–12  | Dashboard integration: "Patient 360" page that reads only from Core API |

Each phase ships value alone. You do not need all six to start benefiting —
Phase 0 + 1 alone gives you a cross-analyzer longitudinal view.

---

## Non-negotiable design principles

1. **One timeline, one schema.** No subsystem gets its own event table. If
   it feels like it needs one, the schema is wrong, not the need.
2. **z-score everything.** Features enter the store normalized against
   peers, not as raw units. This is how cross-modal fusion becomes tractable.
3. **Agents never write directly.** Every mutation is a draft-then-accept
   event. Audit trail is non-optional.
4. **Decision-support, never autonomous action.** Until prospective trial
   evidence exists, no agent reaches a patient without a clinician click.
5. **Every finding carries its citations.** MedRAG paper_ids stay attached
   from analyzer output all the way to the clinician's UI.
6. **The core API is the only public surface.** Subsystems are internal.
   Swapping FastSurfer for CAT12 should not change a single UI call.
7. **Eventsourcing > CRUD.** Recomputing features, vectors, or risk is
   always possible because the raw events never mutate.
