# Kimi salvage audit — verdicts

Per-file audit of all 89 docs in `docs/kimi-salvage-2026-05-18/`, completed 2026-05-18 by 9 parallel reviewer subagents. Each file got one of three verdicts:

- **PROMOTE** — accurate against current main, useful as-is; move to canonical home.
- **EDIT** — partially useful, but needs rewrite (stale paths, wrong role names, wrong schemas) before promotion.
- **DELETE** — fully stale or fictional; not worth rewriting.

## Final tally

| Verdict | Count | % of 89 |
| --- | ---: | ---: |
| PROMOTE | **9** | 10% |
| EDIT | **25** | 28% |
| DELETE | **55** | 62% |

The high DELETE rate reflects that `origin/master` had been writing docs against an **abandoned `apps/api/src/deepsynaps/` prototype layer** while real work continued on `apps/api/app/`. Hundreds of file paths, role names, env vars, and table names in the salvage docs simply don't exist in current main.

## PROMOTE (9) — graduated to canonical homes ✅

All nine were moved out of `docs/kimi-salvage-2026-05-18/` and into canonical homes via the same PR that records this audit closure. History preserved via `git mv`.

| Original file | Now lives at |
| --- | --- |
| `BETA_FEEDBACK_WORKFLOW.md` | `docs/operations/BETA_FEEDBACK_WORKFLOW.md` |
| `BETA_PR_PRIORITIZATION_MODEL.md` | `docs/operations/BETA_PR_PRIORITIZATION_MODEL.md` |
| `BETA_SAFETY_INCIDENT_WORKFLOW.md` | `docs/operations/safety/BETA_SAFETY_INCIDENT_WORKFLOW.md` |
| `SUPPORT_AND_ESCALATION_WORKFLOW.md` | `docs/operations/SUPPORT_AND_ESCALATION_WORKFLOW.md` |
| `WEEKLY_BETA_REVIEW_PROCESS.md` | `docs/operations/WEEKLY_BETA_REVIEW_PROCESS.md` |
| `API_RESPONSE_COMPRESSION_TARGETS.md` | `docs/performance/API_RESPONSE_COMPRESSION_TARGETS.md` |
| `docs/STABILIZATION_HEALTHCARE_UX_REVIEW.md` | `docs/design/STABILIZATION_HEALTHCARE_UX_REVIEW.md` |
| `docs/STABILIZATION_PERFORMANCE_REVIEW.md` | `docs/performance/STABILIZATION_PERFORMANCE_REVIEW.md` |
| `docs/OPEN_SOURCE_PHASE3_MULTIMODAL_INTELLIGENCE_STACK.md` | `docs/research/OPEN_SOURCE_PHASE3_MULTIMODAL_INTELLIGENCE_STACK.md` |

## EDIT (25) — partial value, needs rewrite before promotion

| File | Main problem |
| --- | --- |
| `BETA_LAUNCH_PACK.md` | RBAC (5 roles) outdated vs current 3-role schema (`guest`/`clinician`/`admin`). |
| `BETA_OPERATIONS_DASHBOARD_PLAN.md` | References tables (`patient_access`, `multimodal_events`, `deeptwin_reviews`) that don't exist. |
| `BETA_RISK_REGISTER.md` | Mitigation claims cite features that need re-verification against main. |
| `CLINIC_ONBOARDING_CHECKLIST.md` | Env vars and role names (`reviewer`, `technician`, `super_admin`) not in current schema. |
| `CLINICIAN_TRAINING_GUIDE.md` | 12-module structure assumes feature shapes that diverge from current main. |
| `PATIENT_PORTAL_ONBOARDING_GUIDE.md` | `patient` role not in current `UserRole`; portal flow needs verification. |
| `PILOT_FEEDBACK_SCHEMA.md` | JSON schema usable; `user_role` enum mismatches 3-role enum. |
| `PILOT_SUCCESS_METRICS.md` | Metrics reference tables that may not exist on current schema. |
| `RELEASE_NOTES_TEMPLATE.md` | Generic template; light rewrite to current versioning/migration conventions. |
| `API_DOCUMENTATION.md` | Covers ~10 of 178 current routers; localhost base URL, no Fly/Netlify. |
| `TROUBLESHOOTING.md` | Symptom catalog useful; all fixes assume docker-compose, rewrite for Fly/Netlify. |
| `docs/deployment/postgres.md` | Wrong env var (`DATABASE_URL` vs `DEEPSYNAPS_DATABASE_URL`), wrong module path. |
| `POSTGRES_CONFIG_AUDIT.md` | Env-var matrix (POOL_SIZE, SSLMODE, APP_ENV) still useful as deployment reference. |
| `MATERIALIZED_VIEW_CANDIDATE_AUDIT.md` | Methodology sound; tables wrong, useful as template when MVs are actually built. |
| `DATETIME_DEPRECATION_AUDIT.md` | `utc_now` helper pattern still applicable; 147 `utcnow()` calls remain. |
| `SUMMARY_ENDPOINTS_AUDIT.md` | Endpoints exist in `patient_summary_router.py`; verify schemas before promoting. |
| `SUMMARY_ENDPOINTS_HOTSPOT_AUDIT.md` | Hotspot logic likely useful; rewrite against current router file structure. |
| `SUMMARY_PERFORMANCE_REPORT.md` | Salvage methodology, re-measure on main. |
| `GZIP_COMPRESSION_AUDIT.md` | Valid gap analysis — `main.py` has no `GZipMiddleware`; reframe as TODO. |
| `DEEPTWIN_SAFETY_AUDIT.md` | Safety-wording grep findings still valid; component paths stale, must re-verify. |
| `EXPORT_GOVERNANCE_AUDIT.md` | Risk-tier framing useful; role/endpoint claims wrong vs current `export_router.py`. |
| `docs/STABILIZATION_CLINICAL_GOVERNANCE.md` | Useful FDA/EU-AI-Act framework; strip implementation claims not in current code. |
| `docs/STABILIZATION_PRODUCTION_HARDENING.md` | Checklist sound; remove "SQLite→Postgres migration" claim (already done). |
| `docs/PHASE3_EVIDENCE_REASONING_DESIGN.md` | `evidence_rag.py` exists but architecture differs; salvage describes unimplemented `ClinicalRAG`. |
| `docs/PHASE3_MULTIMODAL_FUSION_DESIGN.md` | Only `mri_multimodal_fusion.py` + `deeptwin_fusion.py` exist; doc covers broader fusion never built. |

## DELETE (55) — stale, fictional, or fully superseded

### A. `*_PR_REPORT.md` — describe PRs that never merged to main (12)
Every one of these is a "completion report" for a PR that lived only on `origin/master`. The PRs were not integrated.
- `BETA_OPS_PR14_REPORT.md`, `BETA_PILOT_PR_REPORT.md`
- `REDIS_CACHE_PR_REPORT.md`, `REDIS_PATIENT_CACHE_PR_REPORT.md`
- `SUMMARY_ENDPOINTS_PR_REPORT.md`
- `GZIP_COMPRESSION_PR_REPORT.md`
- `DEMO_MODE_BANNER_PR_REPORT.md`
- `EVIDENCE_LINKS_ANALYZERS_PR_REPORT.md`
- `POSTGRES_MIGRATION_PR_REPORT.md`
- `MATERIALIZED_VIEWS_PR_REPORT.md`
- `FRONTEND_E2E_PR_REPORT.md`

### B. "FINAL" launch readiness docs — snapshot of an abandoned tree (9)
All reference `apps/api/src/deepsynaps/` paths and `require_role()` (current main uses `apps/api/app/` and `require_minimum_role`).
- `FEATURE_FREEZE_POLICY.md`, `FINAL_LAUNCH_RECOMMENDATION.md`
- `FINAL_ACCESS_GOVERNANCE_REVIEW.md`, `FINAL_DEMO_LIVE_BOUNDARY_REVIEW.md`
- `FINAL_PERFORMANCE_READINESS.md`, `FINAL_SAFETY_SWEEP_REPORT.md`
- `GO_NO_GO_CHECKLIST.md`, `LAUNCH_BLOCKER_TRIAGE.md`
- `RELEASE_CANDIDATE_SNAPSHOT.md`

### C. Deployment runbooks against non-existent infra (3)
Reference `docker compose`, `localhost:8000`, missing scripts.
- `DEPLOYMENT_AUDIT_MASTER_REPORT.md`, `DEPLOYMENT_RUNBOOK.md`, `QUICK_DEPLOY.md`
- `docs/deployment/sqlite_to_postgres_migration.md` (references non-existent `tools/migrate_sqlite_to_postgres.py`)

### D. Schema audits against abandoned 6-table prototype (4)
- `DB_INDEX_DESIGN.md`, `DB_INDEX_HOTSPOT_AUDIT.md`
- `POSTGRES_COMPATIBILITY_SWEEP.md`
- `docs/deployment/materialized-views.md`

### E. Cache/Redis docs for features that were never built (3)
No Redis code exists in `apps/api/app/`.
- `REDIS_CACHE_READINESS_AUDIT.md`, `REDIS_CACHE_SECURITY_REVIEW.md`
- `CACHE_INVALIDATION_MATRIX.md`

### F. GZip security review for middleware that doesn't exist (1)
- `GZIP_SECURITY_REVIEW.md`

### G. Clinical/governance audits against dead paths (6)
- `ANALYZER_STABILITY_MATRIX.md` (claims 1 `main.py`; current main has 170+ routers)
- `DEMO_MODE_AUDIT.md` (`DEEPSYNAPS_DEMO_MODE`/`VITE_DEMO_MODE` not current contract)
- `EVIDENCE_LINKS_ANALYZER_AUDIT.md` (`knowledge_layer.py` superseded by today's `knowledge_router.py`)
- `ROLE_GATE_AUDIT.md` — **highest risk to keep**: implies `require_any_role`, which is the v372 outage pattern from this morning.

### H. Phase reports for engines that don't exist in current code (5)
Current main has its own deeptwin suite (`deeptwin_engine.py`, `deeptwin_fusion.py`, `deeptwin_causal.py`, etc.) but none match the salvage docs' named-engine taxonomy.
- `DEEPSYNAPS_EXECUTION_FREEZE_STABILIZATION_REPORT.md`
- `DEEPSYNAPS_PHASE0_4_STABILIZATION_REPORT.md` (claims "302 tests / 15-section DeepTwin audit" — unverifiable)
- `DEEPSYNAPS_PHASE3_MULTIMODAL_INTELLIGENCE_REPORT.md` (six named engines don't exist)
- `DEEPSYNAPS_PHASE4_DEEPTWIN_INTELLIGENCE_REPORT.md` (deeptwin snapshot/review/audit/export.py absent)
- `SPEC-PHASE4.md` (specifies `src/deepsynaps/` tree + `pages-deeptwin/` components that were never built)
- `docs/PHASE3_CONFOUND_ENGINE_DESIGN.md` (no `confound_engine.py` in repo)
- `docs/PHASE3_CORRELATION_ENGINE_DESIGN.md` (no `correlation_engine.py`)

### I. Frontend/test/CI audits with order-of-magnitude wrong baselines (5)
- `FRONTEND_BACKEND_CONTRACT_AUDIT.md` (`apps/web/src/contracts.js` doesn't exist)
- `FRONTEND_E2E_AUDIT.md` (claims no Playwright/e2e; current main has 20+ specs + `e2e.yml`)
- `CI_VALIDATION_REPORT.md` (pinned to dead commits)
- `TEST_AUDIT_REPORT.md` (baseline 21 backend tests; current main has 200+)
- `apps/web/AUDIT_REPORT.md` (claims 23 `.jsx` files; current main has 400+ `.js` flat files)

### J. Ephemeral session artifacts (7)
Catalogs of `origin/master`, plans for past sessions — actively misleading once `origin/master` is deleted.
- `BRANCH_CATALOG.md`, `CHAT_SESSION_COMPLETE_INVENTORY.md`, `KIMI_PUSH_CATALOG.md`
- `NIGHT_SHIFT_REPORT.md`
- `plan-deployment-audit.md`, `plan-night-shift.md`, `plan-pr15.md`

## Headline read of the data

- **Only 9 of 89 docs (10%) are accurate and useful against current main as-is.**
- A further 25 (28%) have salvageable content but need a rewrite — none are urgent.
- 55 (62%) describe a fundamentally different codebase that was never integrated. Keeping them in-tree, even quarantined, is a continued source of confusion for both humans and future agents searching the repo for "the deployment runbook" or "the role-gate audit".

## Suggested next steps

1. **Delete the 55** in one PR: `docs/kimi-salvage-2026-05-18/` shrinks to 34 .md + README + this audit.
2. **Promote the 9** in a separate PR: move them to canonical homes (`docs/operations/`, `docs/performance/`, `docs/design/`, `docs/research/`) so they actually get found.
3. **Schedule the 25 EDITs** as individual follow-up tickets — none of them are blocking; do them as people need the content.
4. Once steps 1-2 are done, drop `origin/master` itself — at that point nothing on it isn't already preserved in `main` or in this audit's recommendations.
