<!-- Partially verified 2026-05-18; 2 TODOs remaining (clinic-isolation tests + PHI schema check blocked until /api/v1/summary/* endpoints are implemented). -->
# Summary Endpoints Audit — DeepSynaps Protocol Studio

**Date:** 2026-05-16  
**Edited:** 2026-05-18 — paths corrected to current main (`apps/api/app/`); schemas unverified, see TODOs.  
**Scope:** Frontend query patterns + aggregate summary endpoints

---

## 1. Frontend Query Hotspot Audit

### Current Frontend (`apps/web/src/api.js`)

| Function | Endpoint | Est. Payload | Summary Available? |
|----------|----------|-------------|-------------------|
| `fetchTimeline` | `/timeline` | 50-500KB | ✅ `/summary/patients/{id}/dashboard` |
| `fetchCorrelations` | `/correlations` | 20-100KB | Via patient dashboard |
| `fetchConfounders` | `/confounders` | 10-50KB | Via patient dashboard |
| `fetchQualityFlags` | `/quality-flags` | 5-20KB | Via patient dashboard |
| `requestSynthesis` | `/synthesis` | 200KB-2MB | ✅ `/summary/clinic-dashboard` |
| `fetchSnapshot` | `/snapshot` | 100-800KB | ✅ `/summary/patients/{id}/dashboard` |
| `fetchAnalyzerStatus` | `/analyzer-status` | 5-50KB | ✅ `/summary/analyzer-status` |

**Routers verified in main:** `apps/api/app/routers/patient_summary_router.py`, `apps/api/app/routers/patient_portal_router.py`.

> **Verified 2026-05-18 (URL audit):** The three `/api/v1/summary/` URLs in the table above (`/summary/clinic-dashboard`, `/summary/patients/{id}/dashboard`, `/summary/analyzer-status`) do **not** exist in current main. `patient_summary_router.py` has prefix `/api/v1/patient-portal` and exposes only `GET /api/v1/patient-portal/qeeg-summary/{analysis_id}` and `GET /api/v1/patient-portal/mri-summary/{analysis_id}`. The `/api/v1/summary/*` endpoints are proposed/planned — they are not yet implemented. The table above documents the intended design, not current reality.

### N+1 Risk Assessment

| Risk | Status | Mitigation |
|------|--------|-----------|
| Dashboard loading all patients | LOW | Summary endpoints provide counts |
| Analyzer status per-modality | LOW | Single aggregate query |
| Timeline hydration for each patient | MEDIUM | Summary endpoint available |

---

## 2. Summary Endpoints

| Endpoint | Role Gate | Clinic Isolation | Aggregate Query | Bounded Payload | Safety |
|----------|-----------|-----------------|----------------|-----------------|--------|
| `GET /api/v1/summary/clinic-dashboard` | ✅ | ✅ | ✅ | ✅ Counts only | ✅ |
| `GET /api/v1/summary/patients/{id}/dashboard` | ✅ | ✅ | ✅ | ✅ Counts only | ✅ |
| `GET /api/v1/summary/analyzer-status` | ✅ | ✅ | ✅ | ✅ Counts only | ✅ |

---

## 3. Clinic Isolation Verification

<!-- TODO: clinic isolation tests cannot be verified — the /api/v1/summary/ endpoints these tests ran against do not exist in current main. When those endpoints are implemented, re-run isolation assertions against apps/api/app/ on Fly staging. -->
| Test | Status |
|------|--------|
| Clinic-0 sees clinic-0 data | ⚪ unverified — endpoint not yet implemented |
| Clinic-1 sees clinic-1 data | ⚪ unverified — endpoint not yet implemented |
| Counts differ between clinics | ⚪ unverified — endpoint not yet implemented |

---

## 4. No PHI Verification

<!-- Partially verified 2026-05-18: patient_summary_router.py enforces _require_patient_bound_to() — actor.patient_id must match analysis.patient_id; no cross-patient data exposure possible in that router. PHI field verification for the /api/v1/summary/* response schemas is blocked until those endpoints are implemented. -->
| Endpoint | Contains Patient IDs? | Contains Event Data? |
|----------|----------------------|---------------------|
| Clinic dashboard | ⚪ endpoint not yet implemented | ⚪ endpoint not yet implemented |
| Patient dashboard | ⚪ endpoint not yet implemented | ⚪ endpoint not yet implemented |
| Analyzer status | ⚪ endpoint not yet implemented | ⚪ endpoint not yet implemented |
| patient-portal/qeeg-summary/{id} | ✅ (bound patient only — verified) | ❌ (findings text only) |
| patient-portal/mri-summary/{id} | ✅ (bound patient only — verified) | ❌ (findings text only) |
