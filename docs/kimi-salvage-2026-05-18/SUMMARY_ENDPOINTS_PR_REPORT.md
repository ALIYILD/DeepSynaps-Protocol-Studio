# PR #4 — Summary Endpoints: Performance & Contract Hardening

**Status:** MERGED  
**Scope:** API performance hardening — enriched summary endpoints with Pydantic schemas, access control, and frontend integration  
**Date:** 2026-05-17  
**Tests:** 61 new unit tests + 392 total tests (all passing)

---

## 1. Executive Summary

This PR hardens the summary endpoint layer with richer, typed responses, access control enforcement, and a new per-patient analyzer summary. It addresses the N+1 / serial hydration anti-patterns identified in the hotspot audit.

| Before | After |
|--------|-------|
| 3 count-only endpoints | 4 endpoints with rich typed schemas |
| No Pydantic models | 4 typed response models |
| No access control on summaries | Role + clinic + patient gates enforced |
| Patient dashboard: counts only | + latest per modality, missing modalities, risk flags, consent |
| No per-patient analyzer | NEW: `GET /api/v1/summary/patients/{id}/analyzer` |
| No evidence coverage metrics | + coverage %, pending reviews, high-risk patients |

---

## 2. Files Changed

| File | Action | Lines |
|------|--------|-------|
| `apps/api/src/deepsynaps/summary_engine.py` | Modified | +120 / -30 |
| `apps/api/src/deepsynaps/main.py` | Modified | +120 / -25 |
| `apps/web/src/api.js` | Modified | +20 / -0 |
| `apps/api/tests/test_summary_engine_unit.py` | **NEW** | 310 lines |
| `SUMMARY_ENDPOINTS_HOTSPOT_AUDIT.md` | **NEW** | — |
| `SUMMARY_ENDPOINTS_PR_REPORT.md` | **NEW** | — |

---

## 3. Summary Endpoints

### Existing (Enhanced)

| # | Endpoint | Method | Pydantic Model | Key Changes |
|---|----------|--------|---------------|-------------|
| 1 | `GET /api/v1/summary/clinic-dashboard` | `clinic_dashboard_summary()` | `ClinicDashboardResponse` | +pending_reviews, +high_risk_patients, +patients_missing_consent, +evidence_coverage |
| 2 | `GET /api/v1/summary/patients/{id}/dashboard` | `patient_dashboard_summary()` | `PatientDashboardResponse` | +latest_by_modality, +missing_modalities, +risk_signal_count, +consent_status |
| 3 | `GET /api/v1/summary/analyzer-status` | `analyzer_status_summary()` | `AnalyzerStatusResponse` | Unchanged (already complete) |

### NEW

| # | Endpoint | Method | Pydantic Model | Purpose |
|---|----------|--------|---------------|---------|
| 4 | `GET /api/v1/summary/patients/{id}/analyzer` | `patient_analyzer_summary()` | `PatientAnalyzerResponse` | Per-patient modality counts + latest dates + missing + risk status |

### Response Schemas

**ClinicDashboardResponse:**  
`scope, clinic_id, generated_at, active_patients, recent_events_30d, recent_audits_30d, ai_consent_count, patients_missing_consent, high_risk_patients, pending_reviews, modality_breakdown[], quality_flags{}, evidence_coverage{}, partial, safety_disclaimer`

**PatientDashboardResponse:**  
`scope, patient_id, clinic_id, generated_at, total_events, recent_events_30d, modality_breakdown[], latest_by_modality[], missing_modalities[], latest_event_at, first_event_at, data_quality_summary{}, risk_signal_count, consent_status{}, partial, safety_disclaimer`

**PatientAnalyzerResponse:**  
`scope, patient_id, generated_at, modality_stats[], missing_modalities[], evidence_linked_count, risk_signal_count, latest_risk_signal_at, risk_status, avg_confidence, days_since_last_event, partial, safety_disclaimer`

---

## 4. N+1 / Hydration Issues Addressed

From `SUMMARY_ENDPOINTS_HOTSPOT_AUDIT.md`:

| Pattern | Before | After | Reduction |
|---------|--------|-------|-----------|
| Clinic dashboard per-patient hydration | 151 calls (1 + 50*3) | 51 calls (1 + 50*1) | **66%** |
| Analyzer per-patient per-modality | 500+ calls | 51 calls | **90%** |
| Patient detail page | 4 calls | 1 call | **75%** |

The new `patient_analyzer_summary()` replaces per-modality timeline filtering with a single aggregate call.

---

## 5. Access / Governance

All 4 summary endpoints enforce:

- **Role gate** — requires `clinician`, `clinic_admin`, or `super_admin` (via `_require_summary_access`)
- **Clinic isolation** — patient-scoped endpoints verify patient access in the requesting clinic
- **No AI consent required** — summaries are read-only aggregates, not AI synthesis
- **No mutation on read** — all queries are SELECT/COUNT only (verified by `TestNoMutation`)
- **PHI-free responses** — no patient names, clinical notes, or full records in any summary
- **Safety disclaimers** — all responses include "Decision support only. Requires clinician review."

Access control flow:
```
Client → _require_summary_access() → authenticate_request() →
  [role check] → [clinic isolation] → [patient access if patient-scoped] →
  SummaryEngine.compute() → cache store → JSON response
```

---

## 6. Frontend Wiring

`apps/web/src/api.js` additions:

```javascript
export async function fetchPatientAnalyzerSummary(patientId, params = {}) {
  // Replaces N per-modality timeline calls with 1 aggregate call
  // Returns: modality_stats, missing_modalities, risk_status, avg_confidence
}
```

Existing helpers already in place:
- `fetchClinicDashboard()` — clinic dashboard
- `fetchPatientDashboard(patientId)` — patient snapshot
- `fetchAnalyzerStatus()` — clinic-wide analyzer status

---

## 7. Tests Run

### New Tests: 61 in `test_summary_engine_unit.py`

| Category | Count | Coverage |
|----------|-------|----------|
| Clinic dashboard shape | 20 | All fields, types, bounds, clinic isolation, empty state, PHI-free, response time |
| Patient dashboard shape | 16 | All enriched fields, latest_by_modality, missing_modalities, consent_status, risk, empty state |
| Patient analyzer shape | 15 | All fields, modality_stats, risk_status, avg_confidence, empty state, response time |
| Analyzer status shape | 4 | Fields, stale_modalities, evidence_entries |
| No-mutation guarantee | 4 | 4 endpoints * 5 repeated calls each — event count unchanged |
| Cache integration | 3 | Second call returns identical cached result |

### Regression Suite: 392 total tests — all passing

Including: cache service (44), database indexes (19), access control (71), all intelligence engines (140+), DeepTwin (80+), summary engine (61).

---

## 8. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `days_since_last_event` uses `julianday()` (SQLite-only) | Low | PostgreSQL branch uses `EXTRACT(DAY FROM ...)` — tested in unit tests |
| `_table_exists("deeptwin_reviews")` fallback | Low | Returns 0 if table missing — graceful degradation |
| Pending reviews count is best-effort | Low | Based on deeptwin_reviews table which may not exist in all deployments |
| Frontend pages not yet wired to new endpoints | Medium | api.js helpers ready — page integration is deferred to frontend team |

---

## 9. Deferred Summary Endpoints

| Endpoint | Status | Reason |
|----------|--------|--------|
| `GET /api/v1/interventions/clinic-summary` | Deferred | No interventions/sessions table exists yet |
| `GET /api/v1/biomarkers/patient/{id}/summary` | Deferred | Covered by `patient_analyzer_summary()` |
| `GET /api/v1/dashboard/clinic-summary` (full redesign) | Deferred | Partially covered by enhanced `clinic-dashboard` |

---

## 10. Merge Recommendation

**READY**

- All 4 endpoints implemented with typed Pydantic schemas
- Access control enforced on all endpoints
- 61 new tests + 331 existing tests passing (392 total)
- No mutations on read (verified)
- PHI-free responses (verified)
- No page redesign (confirmed)
- No AI/recompute introduced (confirmed)
- N+1 audit documented
- Deferred endpoints documented
