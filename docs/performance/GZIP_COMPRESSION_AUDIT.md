<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# GZip Compression Audit — DeepSynaps Protocol Studio

**Date:** 2026-05-16  
**Edited:** 2026-05-18 — reframed as current-gap analysis. The original doc was written for a PR that never merged to main. `GZipMiddleware` is **not present** in `apps/api/app/main.py` on current main. All "ENABLED (this PR)" claims below are stale and have been corrected.

---

## Current Status

| Layer | Compression | Method | Status |
|-------|-------------|--------|--------|
| Backend API | GZipMiddleware | Starlette | **NOT ENABLED — gap** |
| Frontend static | N/A | Vite build | Not configured (Netlify handles it) |
| Reverse proxy | N/A | No proxy configured | Not applicable |
| Netlify | Auto gzip/brotli | Platform-level | Active (static assets only) |
| Fly.io | Not configured | N/A | Not applicable |
| nginx | Not configured | N/A | Not applicable |

---

## Gap Analysis: Backend API Compression

**Current state:** All JSON responses from `apps/api/app/main.py` are sent uncompressed. Starlette's `GZipMiddleware` is available but not wired in.

**Impact:** Summary endpoints return 1–3 KB (low impact). Full-record endpoints (timeline, correlations, exports) can return 50–200 KB uncompressed per request. With a clinic of 50 patients this is material.

**Proposed config (not yet implemented):**
```python
from starlette.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1024)
```

Behaviour when added:
- Compresses only when client sends `Accept-Encoding: gzip`
- Skips payloads below `minimum_size` (avoids overhead on small responses)
- Does not compress streaming responses
- Does not interfere with error handlers

**Env controls (proposed):**
- `DEEPSYNAPS_ENABLE_GZIP=true` (default)
- `DEEPSYNAPS_GZIP_MINIMUM_SIZE=1024` (default)

---

## Frontend / Static Assets

Netlify automatically serves gzip/brotli for static assets. No action needed.

---

## Risks (if GZip is added)

| Risk | Level | Mitigation |
|------|-------|-----------|
| BREACH attack on reflected secrets | Low | No reflected secrets in API responses |
| Auth tokens in compressed responses | None | Tokens in headers, not bodies |
| PHI exposure via compression side-channels | Low | All responses require authentication |
| CPU overhead on large payloads | Low | 1 KB threshold prevents micro-payload compression |

---

## TODO Action Items

- [ ] **TODO-GZIP-1:** Add `GZipMiddleware` to `apps/api/app/main.py` (2-line change; low risk).
- [ ] **TODO-GZIP-2:** Add `DEEPSYNAPS_ENABLE_GZIP` env var to Fly secrets and `fly.toml` for toggle without deploy.
- [ ] **TODO-GZIP-3:** Verify compressed responses in staging via `curl -H "Accept-Encoding: gzip" https://deepsynaps-studio.fly.dev/api/v1/... | file -` before merging to main.
- [ ] **TODO-GZIP-4:** Add a smoke test that asserts `Content-Encoding: gzip` header is present on large-response endpoints.
