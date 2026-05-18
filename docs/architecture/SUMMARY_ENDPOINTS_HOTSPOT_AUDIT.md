<!-- Verified 2026-05-18; promote-ready. -->
# Summary Endpoints — N+1 / Serial Hydration Hotspot Audit

**Date:** 2026-05-17  
**Edited:** 2026-05-18 — router paths corrected to current main; call-count estimates are architectural estimates, not measured benchmarks.

> **Verified 2026-05-18 (URL check):** The proposed URLs (`GET /api/v1/summary/patients/{patient_id}/dashboard`, `GET /api/v1/summary/patients/{patient_id}/analyzer`, `GET /api/v1/summary/clinic-dashboard`) do **not** conflict with any existing route in `patient_summary_router.py` (which uses prefix `/api/v1/patient-portal`) or `patient_portal_router.py`. The proposed prefix `/api/v1/summary` is unoccupied in current main — safe to implement as a new router.  
**Auditor:** Automated Architecture Audit  
**Scope:** Frontend pages → backend API call patterns

---

## 1. Current State Analysis

The frontend (`apps/web/src/api.js`) currently has these fetch patterns:

| Function | Endpoint | Pattern | Issue |
|----------|----------|---------|-------|
| `fetchTimeline(patientId)` | GET /patients/{id}/timeline | Full record fetch | Loads all events + value_summary text |
| `fetchCorrelations(patientId)` | GET /patients/{id}/correlations | Full correlation objects | Returns full correlation records |
| `fetchConfounders(patientId)` | GET /patients/{id}/confounders | Full confounder objects | Returns full confounder records |
| `fetchQualityFlags(patientId)` | GET /patients/{id}/quality-flags | Full flag objects | Returns all flags |
| `requestSynthesis(patientId)` | POST /patients/{id}/synthesis | AI computation | Expensive — triggers full synthesis |

### Identified N+1 / Serial Hydration Patterns

#### Pattern A: Dashboard Loading a Patient List
**Page:** Clinic dashboard  
**Current flow:**
```
1. GET /clinic-dashboard (counts only — OK)
2. FOR each patient in list:
   3. GET /patients/{id}/timeline (full events)
   4. GET /patients/{id}/quality-flags (full flags)
   5. GET /patients/{id}/correlations (full correlations)
   6. DERIVE: summary state in frontend
```
**Problem:** If a clinic has 50 patients on the dashboard, this generates 1 + 50*3 = **151 API calls**.  
**Root cause:** No per-patient lightweight summary. Frontend needs counts + latest + flags per patient.

#### Pattern B: Analyzer Status Page
**Page:** Treatment Sessions / Analyzer  
**Current flow:**
```
1. GET /analyzer-status (aggregate counts — OK)
2. FOR each patient in clinic:
   3. GET /patients/{id}/timeline?modality=qeeg (filter for qeeg)
   4. GET /patients/{id}/timeline?modality=mri (filter for mri)
   5. COUNT events client-side
   6. DERIVE: which modalities are missing
```
**Problem:** Per-patient, per-modality timeline fetches. 50 patients * 10 modalities = **500 API calls**.  
**Root cause:** No per-patient analyzer summary with modality counts + latest dates.

#### Pattern C: Patient Detail Page
**Page:** Patient dashboard  
**Current flow:**
```
1. GET /patients/{id}/timeline (all events)
2. GET /patients/{id}/correlations
3. GET /patients/{id}/confounders
4. GET /patients/{id}/quality-flags
5. DERIVE: latest per modality, risk status, data quality in frontend
```
**Problem:** 4 separate full-record fetches. Frontend re-derives what backend could compute.  
**Root cause:** No patient snapshot endpoint that returns latest-per-modality + risk flags in one call.

---

## 2. Hotspot Summary

| # | Page | Current Calls (50 patients) | Target Calls | Reduction |
|---|------|---------------------------|-------------|-----------|
| A | Clinic Dashboard | 151 | 1 + 50*1 = 51 | **66%** |
| B | Analyzer Status | 500+ | 1 + 50*1 = 51 | **90%** |
| C | Patient Detail | 4 | 1 | **75%** |

---

## 3. Proposed Summary Endpoints

### Endpoint 1: Patient Snapshot Summary (enhanced existing)
**URL:** `GET /api/v1/summary/patients/{patient_id}/dashboard`  
**Replaces:** Timeline + correlations + confounders + quality_flags (4 calls → 1)  
**Returns:**
- `total_events`, `recent_events_30d` — counts
- `modality_breakdown` — per-modality counts
- `latest_event_at`, `first_event_at` — date bounds
- **NEW:** `latest_by_modality` — latest timestamp per modality
- **NEW:** `missing_modalities` — which expected modalities have no events
- **NEW:** `risk_flags` — count of high-risk signal events
- **NEW:** `consent_status` — ai_analysis_consent for this patient
- `data_quality_summary` — quality tier counts
- `safety_disclaimer`, `generated_at`, `partial`

### Endpoint 2: Patient Analyzer Summary (NEW)
**URL:** `GET /api/v1/summary/patients/{patient_id}/analyzer`  
**Replaces:** Per-modality timeline filtering (N calls → 1)  
**Returns:**
- `modality_counts` — event count per modality
- `latest_dates` — most recent event timestamp per modality
- `missing_modalities` — expected modalities with zero events
- `risk_status` — overall risk level (low/medium/high based on signals)
- `data_freshness` — how old the newest event is per modality
- `evidence_linked_count` — how many events have evidence links
- `safety_disclaimer`, `generated_at`

### Endpoint 3: Clinic Dashboard Summary (enhanced existing)
**URL:** `GET /api/v1/summary/clinic-dashboard`  
**Already efficient** — enhances with:
- **NEW:** `pending_reviews` — count of unreviewed deeptwin snapshots
- **NEW:** `high_risk_patients` — patients with risk_signal events
- **NEW:** `patients_missing_consent` — count needing consent
- **NEW:** `evidence_coverage` — % of modalities with evidence entries

---

## 4. Frontend Impact

| Page | Current Helpers | New Helpers | Calls Saved |
|------|----------------|-------------|-------------|
| Clinic dashboard | `fetchClinicDashboard()` + per-patient fetches | `fetchClinicDashboard()` + `fetchPatientDashboard()` | 100 per clinic |
| Patient detail | `fetchTimeline()` + `fetchCorrelations()` + `fetchConfounders()` + `fetchQualityFlags()` | `fetchPatientDashboard()` | 3 per patient |
| Analyzer | Per-patient per-modality | `fetchPatientDashboard()` + `fetchPatientAnalyzer()` | N*M per clinic |

---

## 5. Deferred Endpoints (Lower Priority)

<!-- Verified 2026-05-18: No Intervention or TreatmentSession model found in apps/api/app/persistence/models.py (grep returned no results). Alembic migrations contain session_recordings (030, 081) and video_assessment_sessions but no standalone interventions table. Deferred status confirmed. -->
| Endpoint | Why Deferred |
|----------|-------------|
| `GET /api/v1/interventions/clinic-summary` | Confirmed: no interventions/sessions model in current main (verified against models.py and alembic/versions/) |
| `GET /api/v1/biomarkers/patient/{id}/summary` | Biomarker data is in multimodal_events — covered by analyzer summary |
| `GET /api/v1/dashboard/clinic-summary` (full) | Partial — covered by enhanced clinic-dashboard |
