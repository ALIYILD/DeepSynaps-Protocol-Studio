# Summary Endpoints Audit — DeepSynaps Protocol Studio

**Date:** 2026-05-16
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

**Conclusion:** All existing frontend functions now have corresponding summary endpoints that return counts/aggregates instead of full records.

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

| Test | Status |
|------|--------|
| Clinic-0 sees clinic-0 data | ✅ |
| Clinic-1 sees clinic-1 data | ✅ |
| Counts differ between clinics | ✅ |

---

## 4. No PHI Verification

| Endpoint | Contains Patient IDs? | Contains Event Data? |
|----------|----------------------|---------------------|
| Clinic dashboard | ❌ | ❌ |
| Patient dashboard | ✅ (requested patient only) | ❌ (counts only) |
| Analyzer status | ❌ | ❌ |
