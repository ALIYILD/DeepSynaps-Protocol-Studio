# Brain Twin — UI Specification

DeepSynaps Studio is a clinical neuromodulation platform. **Brain Twin** is a multimodal patient digital twin that provides decision-support only and never autonomously prescribes protocols. The Brain Twin system ingests 11 modalities and produces clinician-facing insights with conformal intervals, uncertainty communication, and a structured clinician feedback rail that closes the learning loop.

This document specifies two required UI surfaces:
- `/clinical/brain-twin/:patient_id` — clinician-facing page within the Patient Profile context
- `/admin/learning-loop` — admin-only page for Layer 5 operations (ML lead + clinical lead)

Related companion documents (referenced throughout):
- `BRAIN_TWIN_ARCHITECTURE.md`
- `EVENT_BUS_SCHEMAS.md`
- `FEATURE_STORE.md`
- `LEARNING_LOOP.md`

Human factors and governance context:
- [BCG 2026](https://www.bcg.com/publications/2026/ai-wont-fix-your-healthcare-system-redesigning-it-will) for socio-technical redesign framing
- [Maria HITL](https://arxiv.org/html/2602.00751) for human-in-the-loop and feedback-loop considerations
- [Frontiers Medicine 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12847379/) for clinical AI deployment constraints and evaluation patterns

---

## Routes & navigation

### Sidebar placement and information architecture
- The existing global sidebar is organized around clinical workflows (for example Clinical, Monitor, Analyzers, Patients, Reports, Settings).
- Brain Twin is patient-scoped and must not appear as a top-level global navigation item.
- **Brain Twin lives under Patient Profile as a page entry**, not as a tabbed subview.
  - Entry point: Patients → select patient → Patient Profile sidebar → Brain Twin (page)
  - Rationale: Brain Twin is patient-specific, longitudinal, and consent-bound, and must share the same Patient Profile context as Clinical Record.

### Routes
- **Clinician surface**: `/clinical/brain-twin/:patient_id`
  - Required URL param: `patient_id` (string, stable patient identifier)
  - Optional query params:
    - `as_of` (ISO timestamp) for time-traveling the embedding and report context
    - `task_head` (string) to deep-link into a specific report head
    - `from`, `to` (ISO timestamps) for timeline window
- **Admin surface**: `/admin/learning-loop`
  - Optional query params:
    - `tab` in `{audit, drift, models, retrains, override-rates, champion-challenger}`
    - `from`, `to` for time-bounded audit queries

### Feature flag
- A single feature flag gates all Brain Twin UX:
  - **Flag name**: `brain_twin_enabled`
  - Location: server-delivered feature flags + client route guard
  - Behavior:
    - If off, the Patient Profile sidebar shows a disabled Brain Twin page entry with an explanatory tooltip and no navigation.
    - If on, the page entry appears and routes resolve.

### Permissions and roles
Roles referenced in this spec (not pricing tiers):
- **Clinician**
- **Lead Clinician**
- **Admin**
- **ML Lead**

Role-based access matrix:
- `/clinical/brain-twin/:patient_id`
  - Clinician: allowed (read + submit feedback)
  - Lead Clinician: allowed (read + submit feedback + view drift banners)
  - Admin: allowed (read-only; feedback optional per policy)
  - ML Lead: allowed (read-only; can view model metadata but no patient export)
- `/admin/learning-loop`
  - Clinician: denied
  - Lead Clinician: allowed
  - Admin: allowed
  - ML Lead: allowed

Enforcement:
- Server-side route authorization is the source of truth.
- Frontend also includes route guards and UI-level feature hiding for least-privilege behavior.

### Audit and navigation breadcrumbs
- Clinician page breadcrumbs:
  - Patients → Patient Profile → Brain Twin
- Admin page breadcrumbs:
  - Settings (or Admin) → Learning Loop

Audit events required for page views are specified in the **Permissions & audit** section.

---

## Page layout — /clinical/brain-twin/:patient_id

### Top-to-bottom wireframe (ASCII, monospace-aligned)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Patient Profile ▸ Brain Twin                                                                                 │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [PatientIdentityStrip: Name • MRN • DOB • Sex • Patient ID]   [ConsentBadge]   Last updated: 2026-04-25 12:34 │
│ Modality presence: [qEEG raw ✓] [qEEG features ✓] [MRI structural ✓] [fMRI ·] [Wearables ✓] [In-clinic ✓]     │
│                  [Home therapy ·] [Video ·] [Audio ·] [Assessments ✓] [EHR text ✓]                           │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  LEFT RAIL (260px)               │  CENTER (flex)                                              │ RIGHT (320px) │
│                                  │                                                             │               │
│  ModalityPresenceGrid (11)       │  EmbeddingBrainViewer (NiiVue)                               │ FeedbackRail  │
│  ┌─────────────────────────────┐ │  ┌─────────────────────────────────────────────────────────┐ │ ┌───────────┐ │
│  │ qEEG raw        fresh   ✓    │ │  │ Glass brain + patient embedding projection              │ │ │ AI Block  │ │
│  │ qEEG features   stale   ⚠    │ │  │ - viridis only for heatmaps                            │ │ │ ACR Ctrl  │ │
│  │ MRI structural  fresh   ✓    │ │  │ - no diagnostic claims                                 │ │ │ Reasons   │ │
│  │ fMRI            missing ·    │ │  │ - hover: region label + unit                            │ │ │ Corrections│ │
│  │ wearables       fresh   ✓    │ │  └─────────────────────────────────────────────────────────┘ │ └───────────┘ │
│  │ in-clinic       fresh   ✓    │ │                                                             │               │
│  │ home therapy    missing ·    │ │  TrajectoryTimeline (Plotly, multi-track)                  │ ClinicianNotes│
│  │ video           missing ·    │ │  ┌─────────────────────────────────────────────────────────┐ │ ┌───────────┐ │
│  │ audio           missing ·    │ │  │ symptom severity (units)                                │ │ │ Notes     │ │
│  │ assessments     fresh   ✓    │ │  │ biomarkers (units)                                      │ │ └───────────┘ │
│  │ EHR text        stale   ⚠    │ │  │ interventions markers                                   │ Next-session  │
│  └─────────────────────────────┘ │  │ AI predictions + conformal bands                         │ plan suggestion│
│                                  │  │ drift/low confidence banners                             │ (advisory)    │
│  DriftAlertList                  │  └─────────────────────────────────────────────────────────┘ │               │
│  - ADWIN alert (biomarkers)      │                                                             │ Open questions│
│  - PSI alert (wearables)         │  MultimodalReportCard (RAG-grounded, cited)                 │ queue          │
│                                  │  ┌─────────────────────────────────────────────────────────┐ │ - Q1          │
│  Last AI run                     │  │ TaskHeadSection: Symptom trajectory summary              │ - Q2           │
│  - run_id / model_version        │  │ TaskHeadSection: Intervention response hypotheses        │ - Q3           │
│  - as_of timestamp               │  │ TaskHeadSection: Risk flags (decision-support only)      │               │
│  - coverage / confidence         │  │ RAGCitation chips (EEG-MedRAG)                            │               │
│                                  │  └─────────────────────────────────────────────────────────┘ │               │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Notes:
- Wireframe uses symbols for quick scanning, but the UI must not rely on glyphs alone; status labels are required for accessibility.
- The embedding visualization uses NiiVue as already used in the qEEG viewer. Timeline uses Plotly as used elsewhere.

### Header bar specification

Header elements (fixed order):
- `PatientIdentityStrip`: name, MRN, DOB, sex, patient_id (MRN and patient_id are copyable, monospace)
- `ConsentBadge`: states `active | partial | revoked`, opens read-only consent detail drawer (effective/revoked dates per modality)
- `Last updated`: latest successful fusion inference time, else latest presence ingestion time (local time shown, ISO on hover)
- Modality chip row (11, fixed order): status `fresh | stale | missing | consent-revoked`, tooltip includes last_ingested_at and source

### 3-column main grid

#### Left rail (260px)

##### ModalityPresenceGrid
Goals:
- Provide a high-confidence operational view of ingestion state.
- Provide a fast way to understand what the model had available at inference time.

Rules:
- Always show all 11 modalities, even if missing.
- Each row shows:
  - Modality label
  - Status pill: fresh, stale, missing, consent-revoked
  - Age indicator: “updated Xh ago” where applicable
  - “Why stale” reason if the ingestion SLA is exceeded per modality

Freshness definitions (configurable per modality):
- wearables < 6h, assessments < 30d, qEEG < 90d, MRI < 365d, EHR < 30d, video/audio < 30d when present, therapies < 14d

##### DriftAlertList
Purpose:
- Surface drift signals that alter interpretation and advisory labeling.
- This list is patient-scoped (local drift or outlier detection) plus global model-under-review flags.

Items:
- Each alert shows:
  - Drift detector: ADWIN, PSI, or other (per `LEARNING_LOOP.md`)
  - Feature group: EEG, wearables, narrative, imaging, interventions
  - Severity: low / medium / high
  - Detected at timestamp
  - Link to admin drift tab (only visible to Lead Clinician, Admin, ML Lead)

Clinical behavior:
- Drift triggers a banner in center column: “Model under review — predictions are advisory only”.
- Drift never blocks viewing; it changes labeling and default caution states.

##### Last AI run
Always visible summary:
- run_id (monospace)
- as_of (ISO)
- model version bundle:
  - fusion transformer version
  - encoder bundle versions by modality
  - conformal calibration dataset version
- coverage and uncertainty:
  - conformal target coverage (e.g., 0.9)
  - achieved empirical coverage window (if available)
  - confidence tier: high / medium / low

Link:
- “View inference details” opens a drawer with full structured metadata and audit identifiers.

#### Center column (flex)

##### EmbeddingBrainViewer (NiiVue)
- Purpose: glass-brain context view for the patient embedding (decision-support only, not diagnostic)
- Rendering: NiiVue, glass brain template + scalar overlay (viridis only), labels/axes in monochrome neutrals
- Interaction: hover inspect (region, value, unit), click pin, reset/zoom/pan
- Safety UI: persistent “Advisory” label, paediatric retention banner when age < 18

##### TrajectoryTimeline (Plotly, multi-track)
- Tracks (Plotly): symptoms (units), key biomarkers (units), intervention markers, AI predictions with conformal bands
- Bands: filled interval, tooltip shows {lower, median, upper, target_coverage} and model/run ids (admin link gated)
- Controls: date range, per-track toggles, “View as table”
- Banners: “Low confidence — clinical review required”, “Model under review — predictions are advisory only”

##### AI-generated multimodal report (RAG-grounded)
- Output: RAG-grounded, clinician-readable narrative with explicit citations (EEG-MedRAG + internal artifacts)
- Layout: per-task-head collapsible sections; each section shows “decision-support only”, “data used” modality row, citations
- Missing data: inline `MissingModalityNotice` blocks (missing vs consent-revoked distinguished)
- Feedback: every section exposes Approve / Correct / Reject and writes to learning loop; corrections can enqueue regeneration

#### Right rail (320px)

##### FeedbackRail
Purpose:
- Provide structured human-in-the-loop oversight with explicit clinician intent capture.
- Aligns with HITL practices summarized in [Maria HITL](https://arxiv.org/html/2602.00751) and the operational redesign focus in [BCG 2026](https://www.bcg.com/publications/2026/ai-wont-fix-your-healthcare-system-redesigning-it-will).

Pinned sections (top to bottom):
- Feedback controls per AI block (scrollable list)
- Clinician notes (free text, patient-scoped, audit logged)
- Next-session plan suggestion (advisory only, never auto-scheduled)
- Open questions queue (model-generated questions requiring clinician triage)

Approve / Correct / Reject behavior:
- Approve: indicates clinician agrees with the content and it is acceptable for decision-support context.
- Correct: indicates partial disagreement with structured correction capture.
- Reject: indicates the content is not suitable; requires reason taxonomy selection.

Reason taxonomy (minimum categories):
- Data missing or wrong modality window
- Temporal mismatch (wrong as_of)
- Clinical interpretation incorrect
- Overstated certainty
- Citation issue (unsupported claim)
- Patient context missing
- Unsafe suggestion phrasing
- Other (requires free-text)

Keyboard behavior:
- Tab sequence lands on each control group in order.
- Enter triggers the primary action when focused.
- Escape closes correction dialogs.

---

## Component inventory

All components are React + TypeScript under `apps/web/src/features/brain-twin/components/`.

Layout:
- `BrainTwinLayout` — `BrainTwinLayout.tsx` — `{ header, left, center, right, isLoading? }`
- `PatientIdentityStrip` — `PatientIdentityStrip.tsx` — `{ patient, onCopy? }`
- `ConsentBadge` — `ConsentBadge.tsx` — `{ status, revokedModalities?, onOpenDetails }`

Presence:
- `ModalityPresenceGrid` — `ModalityPresenceGrid.tsx` — `{ items, onClickModality? }`
- `ModalityChip` — `ModalityChip.tsx` — `{ label, status, tooltip, onClick? }`
- `DriftAlertList` — `DriftAlertList.tsx` — `{ alerts, canNavigateToAdmin, onNavigateToAdmin? }`

Visualization:
- `EmbeddingBrainViewer` (NiiVue) — `EmbeddingBrainViewer.tsx` — `{ patientId, asOfISO, embedding, anatomy, onPointInspect? }`
- `TrajectoryTimeline` (Plotly) — `TrajectoryTimeline.tsx` — `{ range, tracks, interventions, predictions?, banners?, onViewAsTable? }`
- `ConformalBand` — `ConformalBand.tsx` — `{ points, targetCoverage, label? }`

Report:
- `MultimodalReportCard` — `MultimodalReportCard.tsx` — `{ asOfISO, taskHeads, missingModalities?, advisoryBanners? }`
- `TaskHeadSection` — `TaskHeadSection.tsx` — `{ block, defaultExpanded?, headerRight? }`
- `RAGCitation` — `RAGCitation.tsx` — `{ citation, onOpen? }`
- `MissingModalityNotice` — `MissingModalityNotice.tsx` — `{ missing, context? }`

Feedback:
- `FeedbackRail` — `FeedbackRail.tsx` — `{ items, onSubmit, isSubmitting? }`
- `ApproveCorrectRejectControl` — `ApproveCorrectRejectControl.tsx` — `{ value?, onChange, disabled? }`
- `ReasonTaxonomyPicker` — `ReasonTaxonomyPicker.tsx` — `{ selected, options, onChange }`
- `CorrectionForm` — `CorrectionForm.tsx` — `{ initialText, onSubmit, onCancel }`

Shared:
- `EmptyStateCard` — `EmptyStateCard.tsx` — `{ title, body, primaryAction? }`
- `LoadingShimmer` — `LoadingShimmer.tsx` — `{ variant }`
- `ErrorBoundary` — `ErrorBoundary.tsx` — `{ children, fallback? }`

---

## Page layout — /admin/learning-loop

This page supports Layer 5 operations described in `LEARNING_LOOP.md`, including auditability, drift monitoring, model registry, retrain approvals, override rates monitoring, and champion/challenger evaluation.

### Global page frame
- Route: `/admin/learning-loop`
- Access: role `ml_lead` or `clinical_lead` (also Admin)
- Default tab: Audit
- Persistent top bar:
  - Page title: Learning Loop
  - Date range filter (from/to)
  - Environment indicator (if applicable)

### Tabs
Tabs in this order:
1) Audit
2) Drift
3) Models
4) Retrains
5) Override Rates
6) Champion/Challenger

### Audit tab wireframe

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Learning Loop                                                                                                 │
│ Tabs: [Audit] [Drift] [Models] [Retrains] [Override Rates] [Champion/Challenger]                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Date range: [from] [to]     Search: [event_type / patient_id / run_id / user_id]     Export: [CSV] [JSON]     │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Immutable audit log (hash-chained)                                                       Merkle anchor: [✓]   │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Event row: timestamp • event_type • actor • patient_id • run_id • hash • prev_hash                        │ │
│ │ - click row opens details drawer with payload and verification steps                                       │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                              │
│ Details drawer                                                                                               │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Verification badge: "Merkle anchor verified" (shows anchor_id, block height, verifier signature ids)      │ │
│ │ Payload: JSON view + copy buttons for IDs                                                                  │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Audit requirements:
- Append-only table, row fields include `hash`, `prev_hash`, and Merkle verification state (verified, pending, failed)

### Drift tab wireframe (ADWIN + PSI per feature group)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Drift                                                                                                         │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Filters: [feature group ▼] [model version ▼] [time window ▼]                                                  │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ADWIN alerts (time series)                         │ PSI distribution shift (time series)                    │
│ ┌───────────────────────────────────────────────┐  │ ┌─────────────────────────────────────────────────────┐ │
│ │ monochrome line chart with thresholds         │  │ │ monochrome line chart with thresholds               │ │
│ │ units on axes                                │  │ │ units on axes                                       │ │
│ └───────────────────────────────────────────────┘  │ └─────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Heatmap (viridis only): feature group × time bucket (optional)                                                │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ viridis heatmap with legend and numeric hover tooltips                                                     │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Drift governance:
- Drift state propagates to clinician banners via presence and is documented per `LEARNING_LOOP.md` and [Frontiers Medicine 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12847379/).

### Models tab wireframe (registry)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Models                                                                                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Filters: [status ▼] [task head ▼] [modality bundle ▼]                                                         │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Registered models                                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ task_head | model_name | version | training_date | conformal_target | coverage_est | status                │ │
│ │ --------- | ---------- | ------- | ------------- | ---------------- | ------------ | ---------------------   │ │
│ │ ... champion / challenger / shadow / retired                                                               │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ Row click opens: encoder versions, feature groups, calibration set id, eval summary, audit ids                │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Retrains tab wireframe (two-signature promotions)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Retrains                                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Pending promotions require two signatures: Clinical Lead + ML Lead                                             │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Pending retrains                                                                                               │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ retrain_id | task_head | candidate_version | eval_summary | requested_by | signatures | actions            │ │
│ │ ... signatures: [Clinical Lead ✓/·] [ML Lead ✓/·]                                                          │ │
│ │ actions: [Approve] [Hold] (buttons are role-aware)                                                         │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                              │
│ Detail panel: evaluation metrics, override rates, drift status, safety checklist links                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Approval semantics:
- Two signatures required (Clinical Lead + ML Lead); holds require a reason; all actions are audited.

### Override Rates tab wireframe (auto-demote thresholds)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Override Rates                                                                                                 │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Running override percentage per task head                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ task_head list with small multiples charts (monochrome)                                                     │ │
│ │ - predictive override % with red line at 25%                                                                │ │
│ │ - narrative override % with red line at 40%                                                                 │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ Notes: thresholds configurable but defaults are enforced for v1 governance                                     │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Threshold rules:
- Auto-demote thresholds: predictive \(> 25\%\), narrative \(> 40\%\) (rolling window), with audited registry transition.

### Champion/Challenger tab wireframe (split-traffic, rolling outcomes)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Champion/Challenger                                                                                            │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Split traffic config                                                                                            │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ task_head | champion_version | challenger_version | split % | guardrails | status                           │ │
│ │ guardrails include drift gating and override thresholds                                                     │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Rolling outcome comparison (monochrome charts + table export)                                                   │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ metrics: calibration error, coverage, clinician override %, time-to-decision proxy, narrative quality score│ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## State management

State management uses TanStack Query for REST data, plus a WebSocket channel for live wearable updates. This aligns with the event-bus-driven architecture in `BRAIN_TWIN_ARCHITECTURE.md` and `EVENT_BUS_SCHEMAS.md`.

### TanStack Query keys
Clinician page keys:
- `['brain-twin', patientId, 'presence']`
- `['brain-twin', patientId, 'embedding', { asOfISO }]`
- `['brain-twin', patientId, 'timeline', { fromISO, toISO }]`
- `['brain-twin', patientId, 'report', { asOfISO, taskHead }]`
- `['brain-twin', patientId, 'ai-run', { asOfISO }]` (metadata bundle, if separate)
- `['brain-twin', patientId, 'feedback', 'pending']` (local optimistic state)

Admin page keys:
- `['admin', 'learning-loop', 'audit', { fromISO, toISO, query }]`
- `['admin', 'learning-loop', 'drift']`
- `['admin', 'learning-loop', 'models']`
- `['admin', 'learning-loop', 'retrains']`
- `['admin', 'learning-loop', 'override-rates']`
- `['admin', 'learning-loop', 'champion-challenger']`

Cache policy:
- Presence: staleTime 30s, refetchOnWindowFocus true
- Embedding: staleTime 5m, refetchOnWindowFocus false
- Timeline: staleTime 60s, refetchOnWindowFocus true
- Report: staleTime 60s with explicit invalidate on feedback correction submission
- Admin: default staleTime 30s, audit may be 10s depending on usage

### WebSocket channel (wearables live updates)
- Endpoint: `wss://api/ws/brain-twin/:patient_id`
- Message types (high level):
  - `wearable.sample` (append-only series updates)
  - `presence.update` (modality presence deltas)
  - `ai.run.completed` (signals invalidate report/timeline keys)
  - `drift.flag` (signals drift banner updates)
- Client behavior:
  - Connect on page mount if wearables modality exists and consent active
  - Backoff reconnect: 1s, 2s, 4s, 8s, max 30s
  - Heartbeat ping every 30s, server pong required
  - On disconnect: show a non-blocking banner and fall back to REST polling

### Feedback submission: optimistic updates with rollback
Pattern:
- When clinician submits Approve/Correct/Reject:
  - Create an optimistic entry in local state and mark AI block as “Submitted”
  - Disable repeated submissions until mutation settles
  - On success:
    - Persist server response and invalidate `['brain-twin', patientId, 'report', ...]` if correction or reject
    - Update override counters in admin metrics (server-side)
  - On error:
    - Roll back optimistic state
    - Show inline error on the relevant AI block with retry affordance

Consistency rules:
- Feedback mutation payload includes `ai_run_id` and `ai_block_id` to avoid mismatch across regenerated reports.
- If the report has been regenerated since the clinician opened the page, the server returns a conflict code and the UI prompts to re-open the updated block before submitting.

---

## API contract

All endpoints are REST. Frontend relies on stable schemas defined in `FEATURE_STORE.md` and the system architecture described in `BRAIN_TWIN_ARCHITECTURE.md`.

For each endpoint below, the schema sketch is one line. Exact Pydantic models are out of scope for this UI spec.

### Clinician Brain Twin endpoints

#### `GET /api/v1/brain-twin/:patient_id/presence`
- **Response**: `{ patient_id, last_updated_at, consent: { overall, per_modality[] }, modalities: [{ modality, status, last_ingested_at, staleness_reason? }], drift: { global_status, alerts[] }, last_ai_run?: { run_id, as_of, model_versions, confidence_tier, target_coverage } }`

#### `GET /api/v1/brain-twin/:patient_id/embedding?as_of=ISO`
- **Response**: `{ patient_id, as_of, embedding: { volume_url, lut: 'viridis', value_unit? }, anatomy: { glass_brain_template_url }, provenance: { run_id, model_version_bundle } }`

#### `GET /api/v1/brain-twin/:patient_id/timeline?from=&to=`
- **Response**: `{ patient_id, from, to, tracks: [{ id, label, unit, series: [{ at, value }] }], interventions: [{ at, label, kind }], predictions: [{ task_head, target_coverage, series: [{ at, median, lower, upper }] }] }`

#### `GET /api/v1/brain-twin/:patient_id/report?task_head=`
- **Response**: `{ patient_id, as_of, ai_run: { run_id, confidence_tier, target_coverage, model_version_bundle }, task_heads: [{ task_head, title, narrative_markdown, used_modalities[], citations[] }], missing_modalities[] }`

#### `POST /api/v1/brain-twin/:patient_id/feedback`
- **Request**: `{ patient_id, ai_run_id, ai_block_id, task_head, action, reasons[], free_text?, corrected_text?, client_ts }`
- **Response**: `{ feedback_id, stored_at, status: 'accepted' | 'conflict' | 'rejected', next_actions?: ['regenerate_report' | 'review_required'], audit_event_id }`

### Admin learning loop endpoints

#### `GET /api/v1/admin/learning-loop/audit?from=&to=`
- **Response**: `{ from, to, events: [{ ts, event_type, actor_user_id, patient_id?, run_id?, payload, hash, prev_hash, merkle_anchor?: { anchor_id, verified } }] }`

#### `GET /api/v1/admin/learning-loop/drift`
- **Response**: `{ generated_at, feature_groups: [{ name, adwin: { series[] }, psi: { series[] }, thresholds, status }], heatmap?: { buckets, values, lut: 'viridis' } }`

#### `GET /api/v1/admin/learning-loop/models`
- **Response**: `{ models: [{ task_head, model_name, version, training_date, conformal_target, coverage_est, status, encoder_versions, calibration_set_id }] }`

#### `POST /api/v1/admin/learning-loop/retrain/:retrain_id/sign`
- **Request**: `{ retrain_id, signer_role: 'clinical_lead' | 'ml_lead', action: 'approve' | 'hold', reason? }`
- **Response**: `{ retrain_id, signatures: { clinical_lead: { signed_at? }, ml_lead: { signed_at? } }, promotion_status: 'pending' | 'promoted' | 'held', audit_event_id }`

---

## Visual design tokens

Reuse the existing DeepSynaps design system. This section constrains the Brain Twin feature to consistent tokens and clinical UX patterns.

### Color
- Heatmaps: **viridis colormap only**
- All other charts: monochrome neutrals (single-hue greys) plus the status colors below for annotations only
- Backgrounds and surfaces: existing neutrals

### Typography
- UI: Inter
- IDs, timestamps, hashes, run ids: JetBrains Mono
- Markdown in reports uses existing typography scale with constrained line length for readability

### Spacing
- 8px grid
- Default padding:
  - cards: 16px
  - rails: 12px
  - chip rows: 8px gap

### Status colors
- success: `green-600`
- warning: `amber-500`
- error: `red-600`
- info: `blue-600`

Rules:
- Status color is never the sole carrier of meaning; include text labels and icons with accessible names.
- Drift and low confidence use warning styles but remain non-blocking.

### Chart rules
- All chart axes labeled with units.
- Plotly tooltips always show unit alongside values.
- Every chart includes a “View as table” toggle (see Accessibility).

---

## Empty/edge states

Required behaviors:
- No modalities ingested yet: center `EmptyStateCard` with onboarding CTA, left rail shows all missing, right rail disabled until first AI run
- Consent revoked for a modality: chip greyed with revocation date, report distinguishes consent-revoked vs missing, deep link disabled
- Low confidence: warning banner “Low confidence — clinical review required”, feedback requires reason on Approve by default
- Drift detected: warning banner “Model under review — predictions are advisory only”, drift context row visible (role-gated links)
- Patient under 18: info banner “25-year retention applies”
- Report generating: `LoadingShimmer` + status line “Generating report from latest data”
- WebSocket disconnected: non-blocking banner “Live wearable updates disconnected — showing last known values”, REST polling continues

---

## Accessibility

Target: WCAG 2.2 AA.
- Keyboard: Tab → Approve/Correct/Reject → (Reasons) → (Correction form), Enter activates, Escape closes drawers/dialogs
- Screen reader: aria-label on every chip and chart, every chart has “View as table”, citations are focusable links
- Contrast: ≥ 4.5:1 for text/controls; heatmaps include numeric legend
- Motion: respect `prefers-reduced-motion`

---

## Permissions & audit

Auditability is required for clinical governance and learning-loop oversight, consistent with the deployment constraints described in [Frontiers Medicine 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12847379/) and operational redesign guidance in [BCG 2026](https://www.bcg.com/publications/2026/ai-wont-fix-your-healthcare-system-redesigning-it-will).

### Required audit events

#### `brain_twin.view`
Triggered:
- Every time `/clinical/brain-twin/:patient_id` is viewed (including refresh)

Payload:
- `{ patient_id, viewer_user_id, modalities_seen: ModalityKey[], as_of?, timestamp, feature_flag: 'brain_twin_enabled' }`

#### `brain_twin.feedback`
Triggered:
- Every feedback submission (approve, correct, reject)

Payload:
- `{ patient_id, viewer_user_id, ai_run_id, ai_block_id, task_head, action, reasons[], timestamp }`

#### `learning_loop.view`
Triggered:
- Every time `/admin/learning-loop` is viewed

Payload:
- `{ viewer_user_id, role, timestamp, tab }`

#### `learning_loop.retrain.sign`
Triggered:
- Every signature action in retrains tab

Payload:
- `{ retrain_id, viewer_user_id, signer_role, action, timestamp, reason? }`

#### `learning_loop.model.status_change`
Triggered:
- Promotion, demotion, retirement, champion/challenger config change

Payload:
- `{ task_head, model_version, from_status, to_status, actor_user_id, timestamp, triggering_metrics? }`

### Enforcement details
- Server must enforce all permissions, including modality-consent constraints.
- Frontend must hide admin links for unauthorized roles.
- Admin drift links on clinician page only render for roles that can access `/admin/learning-loop`.

---

## File layout

Full directory trees (compact). Annotation is via folder role descriptions below the trees.

### `apps/web/src/features/brain-twin/`

```
apps/web/src/features/brain-twin/
├─ components/
│  ├─ BrainTwinLayout.tsx
│  ├─ PatientIdentityStrip.tsx
│  ├─ ConsentBadge.tsx
│  ├─ ModalityPresenceGrid.tsx
│  ├─ ModalityChip.tsx
│  ├─ DriftAlertList.tsx
│  ├─ EmbeddingBrainViewer.tsx
│  ├─ TrajectoryTimeline.tsx
│  ├─ ConformalBand.tsx
│  ├─ MultimodalReportCard.tsx
│  ├─ TaskHeadSection.tsx
│  ├─ RAGCitation.tsx
│  ├─ MissingModalityNotice.tsx
│  ├─ FeedbackRail.tsx
│  ├─ ApproveCorrectRejectControl.tsx
│  ├─ ReasonTaxonomyPicker.tsx
│  ├─ CorrectionForm.tsx
│  ├─ EmptyStateCard.tsx
│  ├─ LoadingShimmer.tsx
│  └─ ErrorBoundary.tsx
├─ hooks/
│  ├─ useBrainTwinPresence.ts
│  ├─ useBrainTwinEmbedding.ts
│  ├─ useBrainTwinTimeline.ts
│  ├─ useBrainTwinReport.ts
│  ├─ useBrainTwinFeedback.ts
│  └─ useBrainTwinWearablesSocket.ts
├─ types/
│  ├─ brainTwinTypes.ts
│  └─ apiContracts.ts
└─ utils/
   ├─ modalityFreshness.ts
   ├─ chartTableExport.ts
   └─ auditEvents.ts
```

Folder annotations:
- `components/`: UI building blocks for `/clinical/brain-twin/:patient_id`
- `hooks/`: TanStack Query + WebSocket orchestration
- `types/`: feature-level types and API contract typings
- `utils/`: freshness policy, audit payload helpers, accessible “view as table” utilities

### `apps/web/src/pages/admin/learning-loop/`

```
apps/web/src/pages/admin/learning-loop/
├─ LearningLoopPage.tsx
├─ tabs/
│  ├─ AuditTab.tsx
│  ├─ DriftTab.tsx
│  ├─ ModelsTab.tsx
│  ├─ RetrainsTab.tsx
│  ├─ OverrideRatesTab.tsx
│  └─ ChampionChallengerTab.tsx
├─ components/
│  ├─ MerkleVerificationBadge.tsx
│  ├─ HashChainRow.tsx
│  └─ TwoSignatureControl.tsx
└─ hooks/
   ├─ useLearningLoopAudit.ts
   ├─ useLearningLoopDrift.ts
   ├─ useLearningLoopModels.ts
   └─ useLearningLoopRetrains.ts
```

Folder annotations:
- `tabs/`: per-tab layouts and charts
- `components/`: shared admin widgets (Merkle badge, signature control)
- `hooks/`: admin query wrappers and mutations

---

## Open questions

Six items to resolve for v1 implementation scoping and governance alignment:

1) Should the embedding viewer show t-SNE projection or anatomical glass brain as the default, and how should the alternative be accessed
2) How should the foundation-model and encoder bundle versions be surfaced per inference in clinician UI without overwhelming the page
3) Should clinicians be able to compare two patients side-by-side in v1, and if so which elements are comparable without privacy risk
4) What is the SLA for report regeneration after a correction, and how should the UI communicate queue position and completion
5) Should video/audio modality previews be shown in-page (with strict consent gating) or only via a “review” deep link
6) Keyboard shortcut scheme: define global vs page-local shortcuts and ensure no conflicts with assistive technology

