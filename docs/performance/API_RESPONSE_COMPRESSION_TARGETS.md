# API Response Compression Targets

**Date:** 2026-05-16

---

## Payload-Heavy Routes

| Route Family | Endpoint | Est. Payload | Compression | Future Optimization |
|-------------|----------|-------------|-------------|-------------------|
| Timeline | `/timeline` | 50-500KB | **YES** (this PR) | Summary endpoint (PR #6) |
| DeepTwin | `/snapshot` | 100-800KB | **YES** (this PR) | Summary endpoint (PR #6) |
| DeepTwin | `/synthesis` | 200KB-2MB | **YES** (this PR) | Caching (PR #9) |
| Correlations | `/correlations` | 20-100KB | **YES** (this PR) | Pagination |
| Confounders | `/confounders` | 10-50KB | **YES** (this PR) | N/A |
| Audit logs | `/audit/*` | 100KB-1MB | **YES** (this PR) | Pagination + time-range filter |
| Evidence | `/evidence/*` | 5-20KB | **YES** (this PR) | N/A (small) |
| Health | `/health` | 200B | **NO** (<1KB) | N/A |
| Review | `/review` | 5-30KB | **YES** (this PR) | N/A |
| Export | `/export` | Variable | **YES** (this PR) | Direct download |

---

## Compression Performance

Measured with 200-event timeline:
- Uncompressed: ~761 KB
- Compressed: ~14 KB (via manual gzip.compress)
- Ratio: **98.2% reduction**

---

## Future Optimizations (not this PR)

| PR | Optimization | Expected Benefit |
|----|-------------|-----------------|
| PR #6 | Summary endpoints (5KB vs 200KB) | 97% reduction |
| PR #9 | Redis patient cache (60s TTL) | 5-10× speedup |
| PR #10 | Materialized dashboard views | Sub-second loads |
| PR #7 | GZip + datetime deprecation | Cleanup |
