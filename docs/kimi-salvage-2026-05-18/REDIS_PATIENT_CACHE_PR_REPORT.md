# PR #5 — Redis Patient Cache: Implementation Report

**Status:** MERGED  
**Scope:** Optional Redis-backed caching for summary endpoints with safe fallback  
**Date:** 2026-05-17  
**Tests:** 44 cache tests + 61 summary tests + 287 regression tests = **392 total, 0 failures**

---

## 1. Executive Summary

This PR adds a safe, optional Redis-backed caching layer for the four summary endpoints. When Redis is unavailable or disabled, the system gracefully falls back to an in-memory `_MockRedis`. Cache invalidation hooks are added to the knowledge layer so data mutations automatically invalidate affected cache entries. All cached responses now include `cache_status` (hit/miss) and `cache_ttl_seconds` metadata.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Optional (not required)** | Redis adds infrastructure complexity; clinics can opt in |
| **JSON only (no pickle)** | Prevents RCE, ensures human-readability, cross-platform safe |
| **In-memory mock fallback** | Dev/test environments work without running Redis |
| **PHI-safe keys** | Only scoped IDs in keys — no patient names, notes, or diagnoses |
| **Bounded TTLs** | Clinic summaries 30s, patient summaries 60s — stale data is bounded |
| **Best-effort invalidation** | Cache invalidation failure never breaks the write operation |
| **Cache status metadata** | Every response includes `cache_status` (hit/miss) + `cache_ttl_seconds` |

---

## 2. Files Changed

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `apps/api/src/deepsynaps/cache_service.py` | 327 | CacheService, _MockRedis, CacheConfig, key builder |
| `apps/api/tests/test_cache_service.py` | 414 | 44 tests covering all cache functionality |
| `REDIS_CACHE_READINESS_AUDIT.md` | — | Cache readiness assessment |
| `REDIS_CACHE_SECURITY_REVIEW.md` | — | Security audit report |
| `CACHE_INVALIDATION_MATRIX.md` | — | Invalidation triggers and coverage |
| `REDIS_PATIENT_CACHE_PR_REPORT.md` | — | This report |

### Modified Files

| File | Changes | Purpose |
|------|---------|---------|
| `apps/api/src/deepsynaps/summary_engine.py` | +35 / -15 | Cache metadata (cache_status, cache_ttl_seconds) in all 4 methods |
| `apps/api/src/deepsynaps/main.py` | +8 / -0 | Pydantic schemas updated with cache_status + cache_ttl_seconds |
| `apps/api/src/deepsynaps/knowledge_layer.py` | +14 / -0 | Cache invalidation hooks on insert_event, log_audit |
| `apps/api/tests/test_summary_engine_unit.py` | +12 / -3 | Cache integration tests updated for cache_status |
| `.env.example` | +6 / -2 | Cache TTL and Redis configuration variables |

---

## 3. Redis Config Added

### Environment Variables

```bash
# Redis Cache (optional)
REDIS_URL=redis://localhost:6379/0
DEEPSYNAPS_ENABLE_REDIS_CACHE=false  # Default: disabled
DEEPSYNAPS_CACHE_TTL_SECONDS=60
DEEPSYNAPS_PATIENT_CACHE_TTL_SECONDS=60
DEEPSYNAPS_CLINIC_SUMMARY_CACHE_TTL_SECONDS=30
```

### CacheService Health

```python
>>> from cache_service import get_cache_service, CacheConfig
>>> svc = get_cache_service()
>>> svc.health()
{'enabled': True, 'backend': 'mock|redis', 'redis_url_set': False|True, 'env_enabled': 'false|true'}
```

---

## 4. Cached Endpoints

All four summary endpoints are cached with explicit TTL and cache status metadata:

| # | Endpoint | Cache Key Pattern | TTL | cache_status |
|---|----------|------------------|-----|-------------|
| 1 | `GET /api/v1/summary/clinic-dashboard` | `ds:v1:{env}:clinic_dashboard:clinic:{id}` | 30s | hit / miss |
| 2 | `GET /api/v1/summary/analyzer-status` | `ds:v1:{env}:analyzer_status:clinic:{id}` | 30s | hit / miss |
| 3 | `GET /api/v1/summary/patients/{id}/dashboard` | `ds:v1:{env}:patient_dashboard:patient:{id}` | 60s | hit / miss |
| 4 | `GET /api/v1/summary/patients/{id}/analyzer` | `ds:v1:{env}:patient_analyzer:patient:{id}` | 60s | hit / miss |

### Response Metadata (every response)

```json
{
  "cache_status": "hit",
  "cache_ttl_seconds": 30,
  "generated_at": "2026-05-17T10:30:00",
  ...
}
```

---

## 5. Invalidation Strategy

### Eager Invalidation (implemented)

| Write Operation | Cache Invalidated | Method |
|-----------------|------------------|--------|
| `insert_event()` | Patient cache | `cache.invalidate_patient(patient_id)` |
| `log_audit()` | Clinic cache | `cache.invalidate_clinic(clinic_id)` |

### TTL Fallback

| Scope | TTL | Max Staleness |
|-------|-----|--------------|
| Clinic | 30s | 30 seconds |
| Patient | 60s | 60 seconds |

### Best-Effort

All invalidation is wrapped in try/except — cache failure never blocks the write operation.

---

## 6. Security / PHI Review

| Check | Status |
|-------|--------|
| No patient names in cache keys | PASS |
| No clinical notes in cache values | PASS |
| JSON-only serialization (no pickle) | PASS |
| TTL on all writes | PASS |
| Credentials masked in logs | PASS |
| Patient/clinic scoped keys | PASS |
| Graceful fallback when Redis down | PASS |
| No hard dependency on Redis | PASS |

**Full security review:** `REDIS_CACHE_SECURITY_REVIEW.md`

---

## 7. Tests Run

### Cache Tests: 44 in `test_cache_service.py`

| Category | Tests |
|----------|-------|
| _MockRedis core | 9 |
| CacheConfig | 6 |
| CacheService core | 9 |
| Key builder (PHI-safe) | 7 |
| Cache invalidation | 3 |
| Singleton pattern | 2 |
| SummaryEngine keys | 4 |
| Security (no pickle, Unicode, injection) | 4 |

### Summary Tests: 61 in `test_summary_engine_unit.py`

| Category | Tests |
|----------|-------|
| Clinic dashboard shape | 20 |
| Patient dashboard shape | 16 |
| Patient analyzer shape | 15 |
| Analyzer status shape | 4 |
| No-mutation guarantee | 4 |
| Cache integration | 3 |

### Regression: 287 existing tests — all passing

**Total: 392 tests, 0 failures, 0 regressions.**

---

## 8. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| _MockRedis not shared across workers | Low | Document: mock for dev/test only |
| `datetime.utcnow()` deprecated | Low | Replace in future maintenance |
| Evidence DB updates don't trigger invalidation | Low | TTL 30s bounds staleness |
| Frontend not yet using `fetchPatientAnalyzerSummary()` | Medium | api.js helper ready — page integration deferred |

---

## 9. Follow-up PRs Needed

None required. Optional follow-ups:
- Frontend page integration (use `fetchPatientAnalyzerSummary()` instead of per-modality calls)
- Cache metrics endpoint (hit/miss ratio)
- Redis pub/sub for cross-instance invalidation

---

## 10. Merge Recommendation

**READY**

- [x] Redis cache is optional and safe
- [x] App works when Redis is missing
- [x] Cache service handles errors gracefully
- [x] Only safe read-only summaries are cached
- [x] Cache keys are patient/clinic scoped
- [x] Cached responses expose cache_status + cache_ttl_seconds
- [x] Invalidation strategy exists (eager + TTL)
- [x] Security review exists
- [x] Tests cover disabled/unavailable/hit/miss paths
- [x] No raw secrets or patient names in cache keys/logs
- [x] No clinical behavior changes
- [x] 392 tests passing, 0 regressions
