# GZip Compression Audit — DeepSynaps Protocol Studio

**Date:** 2026-05-16
**Scope:** HTTP response compression across API and frontend

---

## Current Status

| Layer | Compression | Method | Status |
|-------|-------------|--------|--------|
| Backend API | GZipMiddleware | Starlette, min_size=1024 | **ENABLED (this PR)** |
| Frontend static | N/A | Vite build | Not configured (Netlify handles it) |
| Reverse proxy | N/A | No proxy configured | Not applicable |
| Netlify | Auto gzip/brotli | Platform-level | Documented |
| Fly.io | Not using | N/A | Not applicable |
| nginx | Not configured | N/A | Not applicable |

---

## Backend API

**Before:** No compression. All JSON responses sent uncompressed.

**After:** Starlette GZipMiddleware enabled with:
- `minimum_size=1024` (1KB threshold — small responses not compressed)
- Only compresses when client sends `Accept-Encoding: gzip`
- Respects `Accept-Encoding: identity` (no compression)
- Does not compress streaming responses
- Does not break error handlers

**Env controls:**
- `DEEPSYNAPS_ENABLE_GZIP=true` (default)
- `DEEPSYNAPS_GZIP_MINIMUM_SIZE=1024` (default)

---

## Frontend / Static Assets

**Vite:** No explicit compression config. Vite handles minification but not gzip.

**Netlify:** Automatically serves gzip/brotli for static assets. No config needed.

**Recommendation:** No action needed for static assets. Netlify handles compression.

---

## Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| Brotli support | Low | Netlify provides this for static assets |
| Frontend build-time gzip | Low | Not needed with Netlify |
| Streaming response compression | Low | Not used in current API |
| Binary file compression | Low | No binary endpoints |

---

## Risks

| Risk | Level | Mitigation |
|------|-------|-----------|
| BREACH attack on reflected secrets | Low | No reflected secrets in API responses |
| Auth tokens in compressed responses | None | Tokens in headers, not bodies |
| PHI exposure via compression side-channels | Low | All responses require authentication |
| CPU overhead on large payloads | Low | 1KB threshold prevents micro-payload compression |
