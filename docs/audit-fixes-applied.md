# Audit Fixes Applied

> Branch: `audit/fix-fullstack-readiness` | Date: 2026-04-30

## What Was Fixed

### Phase 1: Dependency Declarations
- **evidence** package: Added missing `sqlalchemy>=2.0.0` to `pyproject.toml`
  (audit.py imports `from sqlalchemy.orm import Session`)
- **render-engine** package: Added optional deps `weasyprint>=60` (pdf) and
  `pytest>=8.0` (dev)
- **qa** package: Expanded `__init__.py` from 11 to 24 public exports
  (qa_router.py used deep imports that bypassed the public surface)

### Phase 2: AI Honesty & Resilience
- **qEEG recommendations**: Silent empty-data fallback replaced with explicit
  HTTP 503 + `code="feature_unavailable"` when recommender package is missing
- **AI health endpoint**: New `GET /api/v1/health/ai` reports 14 features with
  truthful status (active/degraded/fallback/unavailable/not_implemented/rule_based)
- **LLM retry**: New `resilience.py` module with `retry_call` / `retry_call_async`
  (exponential backoff + jitter). Wired into chat_service sync, async, and agent paths
  for `APIConnectionError`, `RateLimitError`, `APITimeoutError`

### Phase 3: Database Integrity
- **Invoice race condition**: `_next_invoice_number` rewritten from Python-side
  iteration to `func.max()` with `IntegrityError` retry (max 2 attempts)
- **Claim race condition**: Same fix for `_next_claim_number`
- **Unique constraints**: Invoice already had `uq_invoices_clinician_number`;
  InsuranceClaim now has `uq_claims_clinician_number`
- **Composite indexes**: Migration 061 adds 5 composite indexes on high-query tables
- **Migration SQLite compat**: Fixed to use `create_index(unique=True)` instead of
  `create_unique_constraint` (SQLite doesn't support ALTER TABLE ADD CONSTRAINT)

### Phase 4: DeepTwin/Brain Twin Honesty
- Stub engine status changed from `{"status": "ok"}` to
  `{"status": "placeholder", "real_ai": false}`
- Worker simulation marked placeholder
- TRIBE responses: All 5 response models now include `engine_info` with
  `{"real_ai": false, "method": "rule_based"}`

### Phase 5: Frontend
- `api.aiHealth()` method added to centralized API client
- Settings Hub: New "AI Status" tab with live feature grid

## What Was Deferred

### Sync DB in Async Routes
Multiple async endpoints use synchronous `Session`. Migrating to `AsyncSession`
would touch 50+ files and requires careful testing of transaction scoping.
**Why deferred**: High risk of regression for low immediate user impact. The
sync calls block the event loop briefly but don't cause data corruption.
**Recommendation**: Migrate 2-3 high-traffic routes per sprint, starting with
chat and notification endpoints.

### models.py Split
`apps/api/app/persistence/models.py` is 2987 lines with 126+ models.
**Why deferred**: Pure refactoring with no functional change. Risk of merge
conflicts with parallel sessions. Should be done in a dedicated PR with no
other changes.
**Recommended split**: clinical.py, finance.py, admin.py, deeptwin.py,
evidence.py, agents.py, notifications.py.

### deepsynaps-core Package
Empty/unused. No code imports it. Can be removed in a follow-up PR.

### feature-store Package
Never imported by any API or worker code. Contains Feast/Redis/Faust
dependencies that add install weight. Should be either wired in or removed.

### Playwright E2E Tests
Frontend smoke tests were not added in this PR. The test infrastructure
(`@playwright/test`) is configured but requires a running backend server.
Should be added in a follow-up with CI integration.
