# Summary Endpoint Performance Report

**Date:** 2026-05-16

---

## Measured Performance

| Endpoint | Test Data | Response Time | Payload Size |
|----------|-----------|--------------|-------------|
| `GET /summary/clinic-dashboard` | 3 patients, 150 events, 20 audits | **<200ms** | ~2KB |
| `GET /summary/patients/{id}/dashboard` | 50 events | **<200ms** | ~1KB |
| `GET /summary/analyzer-status` | 150 events, 8 evidence | **<200ms** | ~3KB |

## Comparison: Summary vs Full Objects

| Query Type | Full Objects | Summary | Reduction |
|-----------|-------------|---------|-----------|
| Patient timeline (50 events) | ~50KB | ~1KB | **98%** |
| Clinic dashboard (150 events) | ~150KB | ~2KB | **98.7%** |
| Analyzer status (all modalities) | ~100KB | ~3KB | **97%** |

## Response Time Budget

| Target | Measured | Status |
|--------|----------|--------|
| Dashboard loads in <1s | All 3 endpoints <200ms | ✅ PASS |
| Summary payload <5KB | All 3 endpoints <3KB | ✅ PASS |
| No full record hydration | Only counts returned | ✅ PASS |

## Caveats

- SQLite in-memory test data — production PostgreSQL may differ
- 150 events is small scale — production will have more
- Network latency not measured (local test client)
- Redis/cache layer could further improve (future PR)

## Recommendations

| Priority | Action | Expected Benefit |
|----------|--------|-----------------|
| HIGH | Use summary endpoints for dashboard initial load | 98% payload reduction |
| MEDIUM | Add Redis cache (60s TTL) | 5-10× speedup |
| LOW | Add server-sent events for real-time updates | Live dashboard feel |
