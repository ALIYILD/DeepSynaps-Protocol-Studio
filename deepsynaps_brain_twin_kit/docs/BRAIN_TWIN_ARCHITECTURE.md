## 1. Purpose and scope

Brain Twin is DeepSynaps Studio’s multimodal patient model: a unified patient embedding plus an explicit timeline state that is continuously updated from clinical and at-home data streams (qEEG, MRI/fMRI, wearables, device telemetry, audio/video, structured assessments, and EHR text) and used to generate clinician-facing decision-support outputs. Brain Twin is not a self-healing autonomous AI and will not auto-correct itself, auto-prescribe, or silently change behavior in production; it is a clinician-in-the-loop multimodal representation system that improves only through gated feedback, auditability, and controlled retraining. The operating principle is selective autonomy with built-in escalation: automation where safe and measurable, explicit uncertainty, and escalation to human review when uncertainty, drift, or overrides indicate risk, aligned with the BCG 2026 framing for healthcare AI systems. The learning loop is designed around HITL clinical AI evidence that clinician correction is not an edge case but the primary data engine for safe improvement, as demonstrated in the Maria platform case study. The architecture is organized to map cleanly onto the Clinical MLOps four-layer framework (data, model, deployment, governance) while extending it with an explicit Layer 5 closed-loop learning surface and controls.

## 2. The five layers

### 2.1 Event bus

This layer is the single ingestion backbone that normalizes multimodal events into typed envelopes (patient-scoped, tenant-scoped, consent-scoped) and routes them to storage, streaming features, and downstream model triggers. It prioritizes traceability (every event is attributable, versioned, and replayable) and explicit consent versioning so that model inputs and outputs can be reconstructed for audit. The event bus does not embed model logic; it transports facts and artifacts with minimal transformation beyond validation and schema enforcement. It is also the contract boundary for modality presence signals used by the Brain Twin page.

Concrete components:
- Kafka or Redpanda topics partitioned by tenant and patient
- Schema registry (Avro/Protobuf/JSON Schema) and compatibility policy
- Envelope validators and PII/PHI classifiers at ingress
- Dead-letter topics, replay tooling, and backfill runners
- Idempotency keys, ordering guarantees per modality stream

Owning DeepSynaps module:
- `apps/api` owns ingestion endpoints and topic publication
- `packages/event-bus` (new) owns schemas and SDKs

Companion docs:
- `EVENT_BUS_SCHEMAS.md`
- `FEATURE_STORE.md`
- `LEARNING_LOOP.md`
- `BRAIN_TWIN_PAGE.md`

### 2.2 Feature store

This layer materializes raw facts and engineered features into a consistent retrieval interface for both training and online inference, with point-in-time correctness and reproducible joins across modalities. It separates immutable artifacts (raw qEEG, MRI volumes, device logs) from derived features and embeddings, enabling backfills without rewriting clinical truth. Online-serving features are constrained to what can be computed within defined latency tiers, while batch features may include expensive transforms. The feature store is the authoritative catalog for what the fusion model is allowed to consume, and it exposes lineage for audit and governance.

Concrete components:
- Feast (open source) with online store (Redis/DynamoDB) and offline store (Postgres/BigQuery/Snowflake)
- Object storage (S3-compatible) for large artifacts (EEG files, NIfTI, video, audio)
- Feature definitions as code with versioning and validation
- MNE-based qEEG preprocessing pipelines registered as feature views
- Backfill jobs (Airflow/Prefect) with point-in-time correctness tests

Owning DeepSynaps module:
- `packages/feature-store` (new) owns definitions, retrieval APIs, and backfills
- `apps/api` owns feature-serving endpoints to the app surface

Companion docs:
- `FEATURE_STORE.md`
- `EVENT_BUS_SCHEMAS.md`

### 2.3 Modality encoders

This layer provides modality-specific encoders that transform each modality’s raw/engineered inputs into standardized embeddings with declared dimensionality, uncertainty signals where applicable, and well-defined latency tiers. Encoders are deployed as services or jobs depending on latency and cost, but they must share common interfaces for feature store registration and for fusion consumption. The goal is to consolidate prior per-module ML logic (qEEG analyzer, MRI analyzer) into a consistent encoder catalog while preserving domain-specific preprocessing (e.g., MNE pipelines for qEEG; NIfTI normalization for MRI). Encoders are permitted to ship incrementally; the fusion layer must be robust to missing embeddings.

Concrete components:
- qEEG raw encoder: LaBraM/EEGPT-style EEG foundation models for sequence embeddings
- qEEG engineered encoder: tabular MLP for handcrafted spectral/connectivity features
- MRI structural encoder: 3D CNN / ViT-style volumetric encoder
- fMRI encoder: spatiotemporal transformer or 3D+time encoder
- Wearables encoder: temporal convolution / transformer for multivariate time series
- Audio encoder: Whisper / wav2vec2-based embeddings + task-specific heads
- Video encoder: VideoMAE or similar for gait/face embeddings (batch or near-real-time)
- Text encoder: ClinicalBERT / BioGPT-large / Meditron embeddings for EHR text

Owning DeepSynaps module:
- `packages/qeeg-pipeline` owns qEEG preprocessing and both qEEG embedding paths
- `packages/mri-pipeline` owns MRI/fMRI preprocessing and encoders
- `packages/brain-twin-encoders` (new) owns shared interfaces, deployment wrappers, and registry

Companion docs:
- `FEATURE_STORE.md`
- `BRAIN_TWIN_PAGE.md`

### 2.4 Brain Twin fusion

This layer fuses modality embeddings into a unified patient representation that is explicitly temporal: a global patient embedding plus per-month timeline embeddings. It uses intermediate fusion with a cross-modal transformer that can accept an arbitrary subset of modalities, represented with learned modality tokens and a missing-modality mask. Task heads attach via lightweight LoRA adapters so new heads can be added without destabilizing shared representations, and uncertainty is first-class: outputs include calibrated intervals and escalation triggers. This layer replaces placeholder “glue” logic and unifies outputs previously scattered across qEEG and MRI analyzers while keeping those analyzers as upstream modality encoders.

Concrete components:
- Cross-modal transformer backbone (intermediate fusion) producing 1024-d embeddings
- Learned modality tokens, learned missing-modality mask token, modality dropout training
- Timeline aggregator producing per-month embeddings and change metrics
- LoRA task heads for (a) report generation, (b) condition likelihoods (research-use-only), (c) protocol recommendation, (d) deterioration risk, (e) treatment-response
- Conformal prediction / calibration layer producing intervals and thresholds for escalation

Owning DeepSynaps module:
- `apps/brain-twin` (new) owns fusion inference services and the patient state API
- `packages/brain-twin-models` (new) owns training code, configs, and evaluation harness

Companion docs:
- `BRAIN_TWIN_PAGE.md`
- `LEARNING_LOOP.md`
- `FEATURE_STORE.md`

### 2.5 Closed-loop learning

This layer is the safety and improvement system: it captures inference traces, exposes per-block clinician feedback (Approve/Correct/Reject), stores immutable audit logs, monitors drift and overrides, and gates retraining through champion/challenger evaluation and clinician sign-off. The system does not autonomously retrain on drift; drift triggers human review workflows and scheduled, controlled retraining. It is also the compliance backbone: EU AI Act and FDA SaMD evidence requires the ability to reconstruct what was shown to clinicians, under which model version, with which data and consent. The Layer 5 admin surface is the operational cockpit for monitoring and deciding changes, not an automated self-update mechanism.

Concrete components:
- Inference trace IDs and structured logging (OpenTelemetry)
- Immutable audit log store (append-only) and export tooling
- Drift detection (ADWIN + PSI) on input embeddings and output distributions
- Feedback labeling store and retrain queue with prioritization
- Champion/challenger evaluation runs with MLflow tracking
- Override-rate monitors and policy enforcement (auto-demotion to advisory mode)

Owning DeepSynaps module:
- `apps/brain-twin` owns feedback APIs and trace capture
- `apps/admin` owns the `/admin/learning-loop` UI and ops workflows
- `packages/learning-loop` (new) owns drift/override monitors and retrain orchestration

Companion docs:
- `LEARNING_LOOP.md`
- `BRAIN_TWIN_PAGE.md`

## 3. Modality matrix

| Modality | Source / connector | Producer module | Encoder | Embedding dim | Latency tier (batch / near-real-time / streaming) | Status (shipping / spec'd / planned) |
|---|---|---|---|---:|---|---|
| qEEG raw | EDF/BDF upload, clinic acquisition connectors | `packages/qeeg-pipeline` | LaBraM / EEGPT sequence encoder | 512 | batch / near-real-time | spec'd |
| qEEG engineered features | MNE pipelines: bandpower, connectivity, microstates, asymmetry | `packages/qeeg-pipeline` | Tabular MLP (handcrafted features) | 128 | near-real-time | shipping |
| MRI structural | NIfTI/DICOM import via imaging pipeline | `packages/mri-pipeline` | 3D ViT / 3D CNN encoder | 512 | batch | spec'd |
| fMRI | NIfTI time-series import, preprocessing | `packages/mri-pipeline` | Spatiotemporal transformer | 512 | batch | planned |
| Wearables time series | Apple Health / Fitbit / Oura / custom SDK | `apps/api` connectors | Time-series transformer / TCN | 256 | streaming / near-real-time | shipping |
| In-clinic therapy device logs | Device vendor APIs, clinic local gateway | `apps/api` + `packages/device-connectors` (new) | Sequence encoder + event embedding | 256 | near-real-time | spec'd |
| Home therapy device logs | Mobile app telemetry + device cloud | `apps/api` + `apps/mobile` | Sequence encoder + event embedding | 256 | streaming | planned |
| Video (gait/face) | Patient phone capture, clinic camera uploads | `apps/api` media ingest | VideoMAE-style encoder | 512 | batch / near-real-time | planned |
| Audio (voice/breath) | Patient phone microphone, clinic capture | `apps/api` media ingest | Whisper / wav2vec2 embeddings | 256 | batch / near-real-time | planned |
| Assessments (PHQ-9 etc.) | Structured forms in web app | `apps/web` + `apps/api` | Tabular encoder (MLP) + embedding lookup | 128 | near-real-time | shipping |
| EHR text | HL7/FHIR notes, clinical notes import | `apps/api` connectors | ClinicalBERT / BioGPT-large embeddings | 512 | batch / near-real-time | spec'd |

Notes:
- qEEG raw (LaBraM/EEGPT) and qEEG engineered (tabular MLP) both feed fusion in parallel; engineered features remain valuable as low-latency, interpretable signals even when raw encoders are present.
- Embedding dimensions are intentionally heterogeneous at the encoder boundary; fusion projects each modality into a shared 1024-d space.

## 4. Fusion architecture

Brain Twin fusion is implemented as a cross-modal transformer with intermediate fusion and LoRA task heads, designed to ingest an arbitrary subset of modality embeddings and produce both a global patient embedding and a temporal embedding series. The backbone uses modality-specific projection layers into a shared 1024-d token space, then fuses via multi-head self-attention across modality tokens and temporal tokens (per-month, plus optional intra-month slices for streaming modalities). Missing modalities are handled explicitly via a learned mask token and a modality presence mask; training uses modality dropout so the model learns to be robust to real-world sparsity. This design aligns with current task-oriented multimodal clinical architectures and surveys describing shared backbones with modular heads and careful handling of modality missingness and heterogeneity.

Backbone and tokenization:
- Modality tokens: one token per modality embedding per time bucket (e.g., month), plus optional fine-grained tokens for high-frequency wearables and device telemetry
- Temporal tokens: per-month tokens that represent fused state; these are the outputs used for trajectory visualization on the Brain Twin page
- Masking: learned missing-modality token plus a binary presence mask that is fed into attention as bias
- Training: modality dropout (randomly drop modalities per sample), time dropout (drop months), and noise augmentation on embeddings to improve robustness

Heads (LoRA task adapters on shared backbone):
- (a) Multimodal clinical report generation: sequence decoder head conditioned on fused tokens; strictly RAG-grounded against the existing 87k-paper EEG-MedRAG hypergraph DB so narrative claims are anchored in curated evidence retrieval, not free-form generation
- (b) Condition likelihoods: research-use-only labels; probabilities are surfaced only in admin/research views (not public clinician workflow) and never framed as diagnosis
- (c) Protocol recommendation: ranked decision-support candidates with explanations and evidence references; never an autonomous prescription
- (d) Deterioration risk forecast: time-to-event or horizon-based risk with intervals; requires explicit calibration per tenant/cohort
- (e) Treatment-response forecast: counterfactual-style response likelihood under candidate protocols, with uncertainty and guardrails

Outputs:
- 1024-d global patient embedding: point estimate plus conformal interval and calibration metadata (coverage target, calibration set version)
- Per-month timeline embeddings: 1024-d each, plus derived shift metrics (cosine drift, Mahalanobis distance in embedding space) for trajectory charts
- Task head outputs with uncertainty: predictive distributions, calibrated confidence, and escalation flags

Uncertainty and calibration:
- Conformal prediction is used to produce intervals for the main predictive heads and to drive escalation triggers; the intervals are versioned and recalibrated on schedule rather than continuously updated in production.

Evidence grounding for report generation:
- The report head must be retrieval-grounded and cite retrieved evidence nodes from the EEG-MedRAG hypergraph; generation is constrained to de-identified findings and templated patient identifiers are inserted locally (see Regulatory posture).

Key implementation libraries and patterns:
- PyTorch + Lightning for training loops and reproducible configs
- LoRA/PEFT for task adapters
- MLflow for experiment tracking and artifact versioning
- Evidently (or equivalent) for monitoring dashboards and drift reports

## 5. Closed-loop learning (Layer 5)

Layer 5 is the governance and improvement system that converts real clinical usage into safe, auditable model improvement. It is explicitly clinician-gated continuous improvement, not self-healing AI: no model behavior changes without scheduled retraining, evaluation, and sign-off.

1. Inference logged with trace ID + uncertainty  
Every Brain Twin inference (fusion + heads) emits a trace ID and structured payload: model versions (backbone + heads), feature store snapshot identifiers, modality presence mask, and uncertainty metadata (intervals, calibration version, escalation flags). Traces are emitted via OpenTelemetry and stored in an append-only event stream and audit store so any UI output block can be reconstructed.

2. Clinician Approve/Correct/Reject per AI block  
On `/clinical/brain-twin/:patient_id`, every AI-generated block is accompanied by a feedback rail: Approve, Correct, Reject. Corrections capture structured edits (e.g., corrected finding, removed claim, modified protocol rationale) and map directly to supervised signals for retraining and evaluation. The Maria platform case study indicates correction rates around 19% can be a gold-standard engine for improvement when captured consistently; the product must assume corrections are common and design for low-friction capture.

3. Immutable audit log (EU AI Act + FDA SaMD requirement)  
All inference outputs shown to clinicians, associated feedback, and subsequent edits are written to an immutable audit log with integrity protections (append-only, hashed chain, and export capability). This enables post-hoc investigation of adverse events, supports EU AI Act traceability requirements for high-risk systems, and aligns with FDA SaMD expectations for change control and evidence. Audit logs must include consent versioning, tenant data residency attributes, and the exact retrieved evidence references used for RAG.

4. Drift detection (ADWIN + PSI) triggers human review, not auto-retrain  
Drift monitors run on both inputs (modality embeddings, feature distributions) and outputs (head score distributions, uncertainty rates, override rates). ADWIN is applied to streaming summaries for change detection; PSI is computed on defined windows for tabular distributions. Drift alerts open a human review ticket in the admin learning-loop page; alerts do not automatically enqueue retraining or silently adjust thresholds.

5. Scheduled retraining gated by champion/challenger + clinician sign-off  
Retraining is scheduled (e.g., monthly) or triggered by an approved ops decision, not by drift alone. Each retrain produces a challenger model evaluated on locked test sets and shadow deployment cohorts; acceptance requires champion/challenger comparison, safety checks (calibration, subgroup performance), and clinician sign-off recorded in the audit log. MLflow tracks datasets, code versions, and artifacts; model registry promotions are gated.

6. Override-frequency monitoring and auto-demotion to advisory  
For decision-support heads (protocol recommendation, risk forecasts), override frequency is monitored per clinician, per clinic, and per tenant. If override rate exceeds a configurable threshold over a defined window, the system automatically demotes the affected head to advisory-only presentation (reduced prominence, stronger uncertainty framing) and triggers a human review workflow. This is a safety valve: high override indicates mismatch, drift, or workflow harm; it is not an invitation for autonomous adaptation.

Quality system integration:
- IEC 62304 SOUP records must track third-party model components and libraries used in production (e.g., Whisper, wav2vec2, transformers stacks) and document versions, intended use, verification, and known anomalies.
- ISO 13485 design controls apply to requirements traceability, risk management, verification/validation evidence, and controlled releases for model changes and UI surfaces.

## 6. Regulatory posture

Brain Twin v1 is decision-support only: it provides ranked recommendations, forecasts, and narrative summaries intended to support clinician decision-making, not to replace it. Under the EU AI Act, clinical decision-support systems that meaningfully influence clinical decisions are likely to be classified as high-risk, implying requirements for risk management, data governance, technical documentation, logging, transparency, human oversight, accuracy/robustness, and cybersecurity. For the predictive heads (deterioration risk, treatment response), the FDA SaMD pathway is expected to align with a Class IIa-equivalent posture for clinical decision-support where outputs influence care; design controls, validation, and change management must anticipate this from day one. CE/UKCA routes via a notified body should be planned early, with documented intended use statements that avoid diagnostic claims.

PHI boundary for report generation:
- Only de-identified findings, derived features, and signal hashes are provided to the narrative generation subsystem; patient name, MRN, and direct identifiers are templated locally inside the tenant boundary at render time.
- PHI redaction/enforcement should use a policy-based layer (e.g., Microsoft Presidio patterns plus allowlists) to ensure narrative generation and RAG requests cannot exfiltrate identifiers.

Data residency and consent:
- GDPR + HIPAA constraints are enforced per tenant: storage locations, processing regions, and any external service boundaries are tenant-configurable and auditable.
- Consent versioning is embedded in every event envelope; model inputs and outputs are tied to consent snapshots so revocation or scope changes can be enforced and audited.

## 7. UI surface

The Brain Twin is a page, not a tab, and is designed to live inside the existing DeepSynaps Studio sidebar structure. The primary clinical surface is `/clinical/brain-twin/:patient_id`, a full-page view within the Patient Profile sidebar, sibling to Clinical Record. It combines: a 3D brain view (reusing the existing qEEG viewer where applicable), a modality presence grid (what signals are flowing and freshness), a trajectory timeline (per-month embedding shifts), risk and protocol response forecasts with uncertainty and evidence grounding, and an AI-generated multimodal report. Every AI-generated block includes a feedback rail (Approve / Correct / Reject) that writes to Layer 5 with trace IDs.

The admin-only Layer 5 operations surface is `/admin/learning-loop`, which provides: immutable audit log search/export, drift dashboards, override-rate monitors, retrain queue management, and champion/challenger comparisons. UI details and block composition are specified in `BRAIN_TWIN_PAGE.md`.

## 8. 90-day roadmap

Phase 1 (Days 1-30): Layers 1-2 + Layer 5 audit  
Deliverables:
- Event bus schemas and ingestion envelopes (tenant/patient/consent/trace fields)
- Feature store foundation (offline + online stores), artifact storage conventions, point-in-time correctness tests
- Inference trace IDs plumbed through existing qEEG and MRI analyzers (no fusion yet)
- Immutable audit log store and basic admin search UI
Dependencies:
- Topic and schema registry setup, connector scaffolding, feature store deployment
Outcome:
- Every signal observable, every AI output traceable; existing per-module heads continue to run unchanged

Phase 2 (Days 31-60): Encoder consolidation + first fusion model (qEEG + assessments + wearables) + report head + Brain Twin page v1  
Deliverables:
- Consolidate qEEG engineered features encoder and wearables encoder into unified encoder registry
- Train first fusion model on paired qEEG + assessments + wearables (best paired coverage)
- Ship report generation head with strict RAG grounding against the EEG-MedRAG hypergraph DB
- Launch `/clinical/brain-twin/:patient_id` v1 with modality presence grid, timeline embeddings, and report blocks
- Implement per-block feedback rail wired to Layer 5 with trace IDs
Dependencies:
- Feature store retrieval APIs stable; RAG service integration and evidence node citations
Outcome:
- A usable Brain Twin representation for the most data-rich modalities and a clinician-gated improvement loop in production

Phase 3 (Days 61-90): Add MRI + therapy devices + EHR text + recommendation and forecasting heads + first feedback cycle + scheduled retrain  
Deliverables:
- Add MRI structural encoder and EHR text embeddings to feature store and fusion inputs
- Add therapy device log connectors and encoders (in-clinic first, then home where available)
- Ship protocol recommendation head with evidence grounding and uncertainty framing
- Ship deterioration risk and treatment-response forecasts with conformal intervals and escalation triggers
- Run first clinician feedback review cycle; prioritize corrections into retrain queue
- Execute first scheduled retrain gated by champion/challenger and clinician sign-off
Dependencies:
- Imaging pipeline readiness; device connector agreements; text ingestion via FHIR/HL7
Outcome:
- Multimodal coverage expanded, predictive heads available as decision-support, controlled learning loop proven end-to-end

## 9. Non-goals

- Not a chatbot.
- Not a diagnostic tool.
- Not autonomously prescribing protocols.
- Not training on TRIBE v2 (CC BY-NC).
- Not importing NeuralSet into runtime.
- Not replacing the qEEG / MRI analyzers; Brain Twin sits above them as a unifying fusion and presentation layer.
- Not writing to the EHR without clinician sign-off.
- Not marketed as self-healing AI.

## 10. Open questions

- Which fusion backbone: custom cross-modal transformer vs adapting LaBraM-derived backbone for broader modalities.
- HITL UX latency budgets per task: what must be near-real-time (presence grid, small summaries) vs batch (video analysis, MRI).
- How to label and version retrains externally for customers and auditors (model cards, change logs, semantic versioning strategy).
- Buy vs build for clinical-grade conformal prediction and calibration tooling; integration choices and validation burden.
- Consent UX and data governance for video/audio modalities; capture flows, storage policies, and revocation handling.
- Tenant-level customization: whether to allow per-tenant calibration thresholds or strictly global thresholds with stratified evaluation.
- How to operationalize evidence grounding: citation formats, conflict resolution between retrieved sources, and clinician trust UX.

## References

- [BCG (2026) AI won’t fix your healthcare system—redesigning it will](https://www.bcg.com/publications/2026/ai-wont-fix-your-healthcare-system-redesigning-it-will)
- [Maria platform HITL clinical AI case study (arXiv:2602.00751)](https://arxiv.org/html/2602.00751)
- [Clinical MLOps four-layer framework](https://www.igminresearch.com/articles/html/igmin336)
- [Frontiers in Medicine (2026) multimodal clinical AI review](https://pmc.ncbi.nlm.nih.gov/articles/PMC12847379/)
- [Mohsin (2025) survey: multimodal clinical foundation models](https://www.emergentmind.com/topics/multimodal-clinical-foundation-models)
- [Yu (2025) multimodal foundation models for early disease detection](https://arxiv.org/html/2510.01899v1)
