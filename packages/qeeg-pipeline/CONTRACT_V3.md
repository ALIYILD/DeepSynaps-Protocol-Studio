V3 Contract: Fusion, Annotations, Outcomes, Export
==================================================

Status
------
- Additive only. No existing V1/V2 endpoint or field is removed.
- Demo-safe. New APIs should degrade gracefully when heavy neuro dependencies are absent.
- Backward compatible. Existing qEEG, MRI, outcomes, and patient portal flows must continue to render.

Scope
-----
This contract extends the existing qEEG + MRI analyzer surfaces with four additive workstreams:

1. Multi-modal fusion + SSE progress/events
2. MRI overlay uplift + patient timeline
3. Compare + annotations + simplified patient-facing summaries
4. FHIR/BIDS exports + outcome events + command palette affordances

Workstream O: Fusion + SSE
--------------------------
Backend:
- Add a fusion service and router surface for patient-level recommendation synthesis.
- New endpoint: `POST /api/v1/fusion/recommend/{patient_id}`
- Response shape should include:
  - `patient_id`
  - `qeeg_analysis_id` (nullable)
  - `mri_analysis_id` (nullable)
  - `recommendations` (list)
  - `summary`
  - `confidence`
  - `generated_at`
- Fusion should tolerate qEEG-only, MRI-only, and dual-modality cases.
- Add lightweight SSE streams for qEEG and MRI progress/event updates without breaking current polling flows.

Frontend:
- Add a fusion summary card on qEEG analysis and MRI analysis pages.
- Card should render a friendly empty state when one modality is missing.

Workstream P: MRI Overlay + Timeline
------------------------------------
Backend:
- Keep `/api/v1/mri/overlay/{analysis_id}/{target_id}` additive and compatible.
- Upgrade overlay rendering to prefer a real interactive viewer when assets are available, with safe placeholder fallback.
- Add patient timeline data surface if needed to support a multi-lane chronology page.

Frontend:
- Add a `mountNiiVue()` style helper that can mount an MRI viewer progressively.
- Add a patient timeline page/module with four swim lanes:
  - sessions
  - qEEG
  - MRI
  - outcomes
- Support simple cross-lane relationship markers where available.

Workstream Q: Compare + Annotations + Patient View
--------------------------------------------------
Backend:
- Extend qEEG compare presentation with richer diff payload support.
- Keep MRI compare endpoint additive and expose comparison metadata needed by the page.
- Add annotation persistence/router support for patient-linked notes pinned to qEEG/MRI items.
- Add migration `042_annotations.py`.
- Add simplified patient-facing read-only summary endpoints or reuse existing portal shapes safely.

Frontend:
- Add qEEG compare enhancements, including diff/topomap-oriented summary blocks and RCI-style interpretation where data allows.
- Add MRI compare section enhancements.
- Add right-rail annotation drawer UI on analysis pages.
- Add simplified patient-facing read-only views that avoid clinician-only detail.

Workstream R: FHIR/BIDS + Outcomes + Palette
--------------------------------------------
Backend:
- Add FHIR R4 bundle export service for patient neuromodulation summaries.
- Add BIDS-style derivative export packaging for MRI/qEEG artifacts when available.
- Add outcome event support and migration `043_outcome_events.py`.

Frontend:
- Add export buttons on qEEG and MRI pages.
- Extend command palette so these new pages/actions are reachable.
- Preserve existing palette behaviour and shortcuts.

Non-overlapping file ownership
------------------------------
- O: fusion service/router, qEEG + MRI SSE additions, fusion card mounts.
- P: MRI façade/viewer helpers, overlay HTML, patient timeline page/module.
- Q: compare/annotation/patient-summary surfaces, migration 042.
- R: export services/router pieces, outcomes additions, palette enhancements, migration 043.

Acceptance
----------
- App boots without requiring optional heavy dependencies.
- New routes are registered explicitly in `apps/api/app/main.py`.
- New UI blocks fail soft with empty states instead of throwing.
- Existing tests continue to pass, and new targeted tests cover additive behavior where practical.
