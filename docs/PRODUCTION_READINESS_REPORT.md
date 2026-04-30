# Production Readiness Report

> Branch: `audit/launch-readiness-hardening`
> Date: 2026-04-30
> Verdict: **PREVIEW ONLY -- not production-ready**

## Executive Summary

DeepSynaps Protocol Studio is architecturally sound for a **preview / staging
deployment**. The codebase is honest about placeholder features, fail-closed
in production for secrets and infrastructure, and has comprehensive test
coverage. However, it cannot be marked production-ready because:

1. **No real AI models are connected** -- DeepTwin, Brain Twin, and TRIBE are
   all deterministic rule-based stubs
2. **MedRAG dense retrieval is in fallback mode** -- pgvector, sentence_transformers,
   and psycopg are not installed
3. **All database access is synchronous** -- will not scale beyond ~50 concurrent
   users without async migration
4. **No production secrets are configured** -- JWT, encryption keys, Celery broker,
   and database URL all use dev defaults

## Test Results

| Suite | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|
| API tests (apps/api) | 1,769 | 0 | 8 | All pass |
| Worker tests (apps/worker) | 10 | 0 | 0 | All pass (run isolated) |
| QA package (packages/qa) | 54 | 0 | 0 | All pass |
| qEEG pipeline (packages/qeeg-pipeline) | 120 | 4 | 1 | Pre-existing: 3 need nibabel, 1 schema drift |
| **Total** | **1,953** | **4** | **9** | |

### Pre-existing Failures (not introduced by this session)

1. `test_forward_builds_for_fsaverage` -- requires `nibabel` (not installed)
2. `test_inverse_methods` -- requires `nibabel`
3. `test_roi_extraction_returns_dataframe` -- requires `nibabel`
4. `test_tools_schema_stability` -- copilot tool list has grown (added `tool_explain_channel`)

These are dependency/schema-drift issues, not code bugs. The nibabel tests are
optional MRI source-localization features. The schema test needs its golden
fixture updated.

### Worker + API Collision Note

Running worker tests alongside API tests causes 10 worker test failures due to
`app` package namespace collision (both `apps/api/app/` and `apps/worker/app/`
resolve to `app`). This is a pre-existing test infrastructure issue. Both suites
pass when run independently.

## Validation Script Results

### Development Mode (no env vars set)
```
Overall: WARN
PASS: 3  |  WARN: 19  |  FAIL: 0
```
All checks either pass or produce expected warnings for missing optional config.

### Production Mode (--env production)
```
Overall: FAIL
PASS: 4  |  WARN: 12  |  FAIL: 6
Exit code: 1
```

Production FAILs (correctly detected):
- `DEEPSYNAPS_DATABASE_URL` -- not set
- `JWT_SECRET_KEY` -- not set
- `DEEPSYNAPS_SECRETS_KEY` -- not set
- `DEEPSYNAPS_CORS_ORIGINS` -- not set
- `WEARABLE_TOKEN_ENC_KEY` -- not set
- `CELERY_BROKER_URL` -- not set

The script correctly exits with code 1 when production requirements are unmet.

## Alembic Migrations

- Single head: `061_composite_indexes`
- No forks or conflicts
- 61 migrations total, all linear

## AI Feature Status (from `/api/v1/health/ai`)

| Feature | Status | real_ai | Notes |
|---|---|---|---|
| medrag_retrieval | fallback | true | Keyword matching; dense needs pgvector+sentence_transformers |
| deeptwin_simulation | not_implemented | false | Deterministic stub |
| deeptwin_encoders | not_implemented | false | No trained encoders |
| tribe_fusion | rule_based | false | Rule-based quality-weighted fusion |
| qeeg_recommender | unavailable | true | Package not installed |
| chat_copilot | unavailable | true | No LLM API key configured |
| qeeg_interpreter | unavailable | true | No LLM API key configured |

All features honestly report their true status. No feature claims `active`
without a real dependency backing it.

## Safety Contracts

### DeepTwin Model Contract (`docs/deeptwin/model-contract.md`)
- Status: `not_implemented` (placeholder)
- All outputs include `decision_support_only: true`
- Engine declares `real_ai: false`
- Clinician role + cross-clinic access gate enforced
- 5 tests enforce the contract

### Brain Twin Simulation Contract (`docs/brain-twin/simulation-contract.md`)
- Status: `placeholder` (no production model)
- Worker returns `engine.real_ai: false`, `engine.status: "placeholder"`
- Feature flag off by default in production/staging
- Celery task fails closed when broker is missing in production
- 4 tests enforce the contract

### MedRAG Dense Retrieval (`docs/medrag-pgvector-readiness.md`)
- Keyword-overlap fallback when deps missing
- Health endpoint correctly reports `fallback` status
- `real_ai: true` (it IS real AI when deps are present)
- 3 tests enforce the contract

## Infrastructure Readiness

| Component | Status | Production Blocker? |
|---|---|---|
| PostgreSQL database | Not configured | YES |
| Redis (Celery broker) | Not configured | YES |
| Redis (rate limiter) | Not configured | Degraded (in-memory fallback) |
| JWT secret | Not configured | YES |
| Encryption keys | Not configured | YES |
| CORS origins | Not configured | YES |
| Stripe billing | Not configured | No (optional feature) |
| LLM API keys | Not configured | No (degrades gracefully) |
| ML model weights | Not configured | No (degrades gracefully) |
| Async DB (SQLAlchemy) | Synchronous only | No (scaling concern, not launch blocker) |

## Async DB Tech Debt

Full migration plan at `docs/architecture/async-db-migration-plan.md`.

- 100% synchronous Session across all 85+ routers
- Current pool: 10 connections + 20 overflow = 30 max
- Adequate for <50 concurrent users
- 5-phase migration plan with rollback strategy documented
- NOT a launch blocker -- start when monitoring shows pool saturation

## New Tests Added This Session

| Test Class | Tests | File |
|---|---|---|
| TestMedRAGHealthTruthfulness | 3 | test_audit_fixes_validation.py |
| TestProductionReadinessScript | 2 | test_audit_fixes_validation.py |
| TestDeepTwinPlaceholderSafeguards | 5 | test_audit_fixes_validation.py |
| TestBrainTwinSimulationContract | 4 | test_audit_fixes_validation.py |
| **Total new tests** | **14** | |

## New Files Created This Session

| File | Purpose |
|---|---|
| `scripts/validate_production_readiness.py` | Automated env/infra validation |
| `docs/deeptwin/model-contract.md` | DeepTwin placeholder contract |
| `docs/brain-twin/simulation-contract.md` | Brain Twin simulation contract |
| `docs/architecture/async-db-migration-plan.md` | Async DB migration plan |
| `docs/PRODUCTION_READINESS_REPORT.md` | This report |

## Verdict

### PREVIEW ONLY

The platform is safe for:
- Internal demo and stakeholder review
- Clinician UX testing (with demo tokens)
- Integration testing with real infrastructure
- QA validation of all UI flows

The platform is NOT safe for:
- Real patient data (no production secrets configured)
- Clinical decision-making (no real AI models)
- Billing (Stripe not wired to live keys)
- Scale deployment (synchronous DB, no monitoring)

### To reach production-ready, complete these blockers:

1. Configure all 6 FAIL-level env vars (database, JWT, encryption, CORS, Celery)
2. Deploy PostgreSQL with connection pooling (PgBouncer recommended)
3. Deploy Redis for Celery broker + rate limiter
4. Connect at least one LLM provider for copilot features
5. Install pgvector + sentence_transformers for MedRAG dense retrieval
6. Run `validate_production_readiness.py --env production` with zero FAILs
7. Update `test_tools_schema_stability` fixture for new copilot tool
8. Install `nibabel` if MRI source localization is required

### When real AI models are ready:

1. Follow `docs/deeptwin/model-contract.md` upgrade path (7 steps)
2. Follow `docs/brain-twin/simulation-contract.md` upgrade path (8 steps)
3. Update AI health endpoint statuses from `not_implemented` to `active`
4. Add outcome tracking for post-market surveillance
5. Re-run full test suite -- all contract tests must still pass
