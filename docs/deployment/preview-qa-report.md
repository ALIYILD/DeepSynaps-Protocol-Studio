# DeepSynaps Netlify Preview QA Report

## Preview URL
https://deepsynaps-studio-preview.netlify.app

## Executive Verdict
- **Preview frontend ready:** Yes
- **Backend-connected staging ready:** Yes (documentation and env template created; 6 required env vars must be set)
- **Production ready:** No
- **Main blockers:** 6 required env vars missing for production, DeepTwin/Brain Twin are placeholder engines, sync DB engine, model weights absent

## Live Preview Smoke Test

| # | Journey | Result | Notes |
|---|---------|--------|-------|
| 1 | Landing/demo screen loads | PASS | Full hero, feature cards, login panel visible |
| 2 | Patient demo button | PASS | Button visible, offline fallback login works, patient shell renders |
| 3 | Clinician demo button | PASS | Button visible, login works, clinician dashboard with sidebar renders |
| 4 | Patient dashboard content | PASS | Patient view renders with demo data, no blank screen |
| 5 | Clinician dashboard content | PASS | Setup wizard / dashboard renders with sample data |
| 6 | Settings Hub / AI Status | PASS | AI status tab renders feature list |
| 7 | qEEG unavailable state | PASS | Page renders gracefully; no raw error traces |
| 8 | DeepTwin/Brain Twin honesty | PASS | No claims of real prediction; demo data clearly labeled |
| 9 | Protocol pages | PASS | Protocol wizard loads, shows rule-based content |
| 10 | Evidence/governance pages | PASS | Landing mentions evidence-graded, HIPAA-aligned |
| 11 | Console errors | PASS | Demo shim intercepts API calls; no uncaught JS errors |
| 12 | Static assets | PASS | All CSS, JS, fonts load (200/304). No 404s |
| 13 | Route navigation | PASS | Multi-page nav (dashboard, qeeg, deeptwin, protocols, patients) works |
| 14 | Mobile viewport | PASS | Navigation bar, menu items, text readable at 502x735px |
| 15 | Demo fallback banners | PASS | Per-page banners clearly explain demo data on each section |

## Console / Runtime Errors
- **Errors found:** 0 uncaught JS errors (Playwright verified)
- **Warnings found:** Expected 401/404 from initial demo-login API attempt to Fly (before offline fallback kicks in); suppressed by demo shim for all subsequent calls
- **Fixes applied:** None needed

## Demo Mode UX

### Existing demo banners (all functioning correctly)
- **Global:** "Demo Mode -- exploring with sample data" + Exit Demo button
- **Clinical dashboard:** "DEMO" pill + "Showing sample data so you can explore"
- **Patient list:** "Demo Data" + "N sample patients shown for demonstration. Records with [DEMO] prefix are not real"
- **Schedule:** "Demo schedule -- N sample sessions. Real bookings will replace these when available"
- **qEEG raw viewer:** "Demo mode -- displaying synthetic EEG data"
- **Monitoring:** Preview notices per section ("Preview telemetry is shown because live endpoints were unavailable")
- **Education programs:** "DEMO DATA -- backend not yet wired"

### Copy improvements applied
None needed. All existing demo banners are honest, clear, and contextual.

### Remaining rough edges
- The global demo banner (`_injectDemoBanner`) is gated on a separate `ds_demo_mode` localStorage flag, not automatically shown during demo-token login. Per-page banners cover this gap adequately.
- First demo login attempt makes one real API call (4s timeout) before falling back. This produces one console-level 401/404 that cannot be suppressed from JS, but the demo shim prevents all subsequent network calls.

## AI Honesty Check

| Feature | Status | Honest | Notes |
|---------|--------|--------|-------|
| DeepTwin | Placeholder engine | Yes | Falls back to deterministic demo data; no real AI claims |
| Brain Twin | No real simulation | Yes | Placeholder forecasts, clearly labeled |
| qEEG | Model weights absent | Yes | Quantitative data valid, AI recommendation marked unavailable |
| MedRAG | No pgvector/embeddings | Yes | Falls back to keyword matching; disclosed in health endpoint |
| Protocol generation | Rule-based | Yes | "Decision-support information. Protocol recommendations require clinician review" |
| Safety/governance | Documented | Yes | Evidence labels, HIPAA/GDPR alignment mentioned on landing |

## Playwright Against Live Preview

**Command:**
```bash
PLAYWRIGHT_BASE_URL=https://deepsynaps-studio-preview.netlify.app \
  npx playwright test smoke-live-preview --reporter=list
```

**Result:** 6 passed in 8.5s

| Spec | Result | Duration |
|------|--------|----------|
| public app shell loads without JS errors | PASS | 1.4s |
| patient demo login renders patient view | PASS | 1.6s |
| clinician demo login renders clinician dashboard | PASS | 1.6s |
| settings AI status tab renders | PASS | 3.1s |
| DeepTwin page shows demo content without false AI claims | PASS | 4.1s |
| multi-page navigation produces no JS errors | PASS | 6.3s |

**Specs added:**
- `apps/web/e2e/smoke-live-preview.spec.ts` -- 6 live-preview smoke tests
- Updated `apps/web/playwright.config.ts` to support `PLAYWRIGHT_BASE_URL` env var

## Backend Staging Prep

| Item | Status | Notes |
|------|--------|-------|
| Frontend API base URL | `VITE_API_BASE_URL` in Netlify env | Currently unset (demo mode) |
| CORS | `DEEPSYNAPS_CORS_ORIGINS` on API | Must include Netlify preview URL |
| Auth/demo token | Offline fallback works | Real auth requires API + JWT_SECRET_KEY |
| `/healthz` | Implemented | Returns DB status |
| `/api/v1/health` | Implemented | Versioned health check |
| `/api/v1/health/ai` | Implemented | Per-feature AI readiness with `real_ai` flags |
| Demo mode toggle | `VITE_ENABLE_DEMO=0/1` | Switch between live and demo modes |

### Missing config for staging
6 required env vars (all documented in `.env.staging.example`):
1. `DEEPSYNAPS_DATABASE_URL` -- PostgreSQL connection
2. `JWT_SECRET_KEY` -- Auth signing
3. `DEEPSYNAPS_SECRETS_KEY` -- 2FA encryption
4. `DEEPSYNAPS_CORS_ORIGINS` -- Cross-origin allowlist
5. `WEARABLE_TOKEN_ENC_KEY` -- OAuth token encryption
6. `CELERY_BROKER_URL` -- Async job queue

### Alembic migration status
- Merged parallel 061 heads into single head (`beaf9a56faac`)
- Local SQLite has gap (migration 059 references missing table); fresh PostgreSQL runs full chain cleanly

## Backend Test Results

| Command | Result | Notes |
|---------|--------|-------|
| `pytest apps/api/tests -q` | 1783 passed, 8 skipped | Green |
| `pytest apps/worker/tests -q` | 10 passed | Green |
| `pytest packages/qa/tests -q` | 54 passed | Green |
| `pytest packages/qeeg-pipeline/tests -q` | 121 passed, 2 skipped | Green (nibabel skips expected) |
| `npm run build` (frontend) | Clean build, 2.2s | No warnings |
| `npm run test:unit` | 317 passed | Green |
| Production validator (dev) | WARN (3 pass, 19 warn, 0 fail) | Correct |
| Production validator (prod) | FAIL (4 pass, 12 warn, 6 fail) | Correct -- 6 required vars missing |
| `alembic upgrade head` | Fails on local SQLite | Known: missing base table in local DB |

**Total backend tests:** 1968 passed, 10 skipped, 0 failures
**Total with frontend:** 2285 passed, 10 skipped, 0 failures

## Files Changed

| File | Change | Reason |
|------|--------|--------|
| `apps/web/playwright.config.ts` | Updated | Support `PLAYWRIGHT_BASE_URL` env var for remote testing |
| `apps/web/e2e/smoke-live-preview.spec.ts` | Created | 6 live-preview smoke tests against Netlify |
| `docs/deployment/backend-staging-connect.md` | Created | Backend staging connection guide |
| `docs/deployment/preview-qa-report.md` | Created | This report |
| `.env.staging.example` | Created | Safe staging env template |
| `apps/api/alembic/versions/beaf9a56faac_merge_parallel_061_heads.py` | Created | Merge two parallel 061 Alembic heads |

## Remaining Production Blockers

1. **DeepTwin real model absent** -- Placeholder engine with deterministic demo data. No real AI predictions.
2. **Brain Twin real simulation absent** -- Placeholder forecasts only.
3. **Production secrets missing** -- 6 required env vars must be configured for any non-demo deployment.
4. **pgvector not enabled** -- MedRAG uses keyword fallback unless PostgreSQL pgvector extension + embeddings are configured.
5. **Model weights absent** -- Brain-age CNN and LaBraM foundation model require weight files.
6. **Synchronous DB engine** -- 85 routers use sync SQLAlchemy Session. Async migration plan exists but is not implemented.
7. **No LLM API keys** -- Chat copilot and qEEG interpreter unavailable without at least one provider key.

## Recommendation

**1. Safe to keep public preview live.**

The Netlify preview is stable, honest, and intentional. Demo mode correctly communicates that data is synthetic, AI features are placeholders, and clinical review is required. No false claims are made. The frontend handles backend absence gracefully through the demo shim.

**2. Safe to connect staging backend** once the 6 required env vars are configured and the PostgreSQL database is provisioned. The staging connection guide (`docs/deployment/backend-staging-connect.md`) and env template (`.env.staging.example`) are ready.

**3. Do not deploy to production** until the synchronous DB engine is migrated, real model weights are available, and production secrets are properly managed.
