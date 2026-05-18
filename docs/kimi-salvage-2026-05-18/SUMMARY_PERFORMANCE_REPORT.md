<!-- Partially verified 2026-05-18 — quantitative claims pending re-benchmark. -->
# Summary Endpoint Performance Report

**Date:** 2026-05-16  
**Edited:** 2026-05-18 — figures below were originally measured on a 2026-05-12 snapshot of the abandoned `src/deepsynaps/` tree against SQLite in-memory data; current main (`apps/api/app/`) has not been benchmarked. Re-measurement on Fly staging (`deepsynaps-studio`) is a separate task. Do not treat any figure here as authoritative for current main.

---

## Performance Figures (not current — pending re-benchmark)

> Originally measured on a 2026-05-12 snapshot of the abandoned `src/deepsynaps/` tree against SQLite in-memory data. Current main (`apps/api/app/`) has not been benchmarked. Re-measurement on Fly staging is a separate task.

| Endpoint | Test Data (prototype) | Response Time (prototype) | Payload Size (prototype) |
|----------|----------------------|--------------------------|--------------------------|
| `GET /summary/clinic-dashboard` | 3 patients, 150 events, 20 audits | ⚪ not measured on main | ⚪ not measured on main |
| `GET /summary/patients/{id}/dashboard` | 50 events | ⚪ not measured on main | ⚪ not measured on main |
| `GET /summary/analyzer-status` | 150 events, 8 evidence | ⚪ not measured on main | ⚪ not measured on main |

## Comparison: Summary vs Full Objects (architectural estimate)

> Payload-size ratios below are structural estimates based on schema inspection, not measured benchmarks on current main.

| Query Type | Full Objects (est.) | Summary (est.) | Reduction (est.) |
|-----------|---------------------|----------------|-----------------|
| Patient timeline (50 events) | ~50KB | ~1KB | ~98% |
| Clinic dashboard (150 events) | ~150KB | ~2KB | ~98.7% |
| Analyzer status (all modalities) | ~100KB | ~3KB | ~97% |

## Response Time Budget (not yet verified on current main)

| Target | Status |
|--------|--------|
| Dashboard loads in <1s | ⚪ Not measured — endpoints not yet implemented on current main |
| Summary payload <5KB | ⚪ Not measured — endpoints not yet implemented on current main |
| No full record hydration | ✅ Design intent confirmed — summary endpoints return counts only |

## Caveats

- SQLite in-memory test data — production PostgreSQL may differ
- 150 events is small scale — production will have more
- Network latency not measured (local test client)
- Redis is present in `apps/api/app/` only for rate-limiting (`limiter.py`); no response-cache layer is implemented. The Redis caching recommendation below is still future work.

## Recommendations

| Priority | Action | Expected Benefit |
|----------|--------|-----------------|
| HIGH | Use summary endpoints for dashboard initial load | 98% payload reduction |
| MEDIUM | Add Redis cache (60s TTL) | 5-10× speedup |
| LOW | Add server-sent events for real-time updates | Live dashboard feel |
