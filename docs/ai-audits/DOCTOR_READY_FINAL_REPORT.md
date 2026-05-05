## DeepSynaps Doctor-Ready Final Report

**PR**: `#515` (draft)  
**Branch**: `doctor-ready/e2e-validation-and-hardening` → `main`  
**Prepared by**: Release Captain (Cursor agent)  
**Date**: 2026-05-05  
**Environments**: Preview (Netlify), API (Fly), Local VM

---

## Executive Verdict

- **Merge-ready**: **No** (CI Node 20 build + Playwright E2E not yet confirmed/visible)
- **Doctor-demo ready**: **Yes, with constraints** (backend + safety gates validated locally; web build/E2E must be validated in CI Node 20)
- **Preview-ready**: **Pending CI** (deploy paths unchanged; this PR is hardening + audits/tests/docs)
- **Production clinical ready**: **No** (demo-gated modules + operational secrets/evidence DB + clinical sign-off required)
- **Remaining blockers**:
  - CI checks are **not visible** for this draft PR via `gh` in this environment, and **Node 20 web build + Playwright** must pass before merge.

**What shipped (doctor-ready hardening):**
- QEEG-105 Phase 0 registry-first surface (honest statuses, audit events, no placeholder results, SSE status stream).
- Tenant isolation/security hardening for QEEG-105 job/run/result surfaces + PHI redaction before LLM prompt assembly.
- Doctor-ready validation reports + deployment checklist updates (Node 20 requirement, MRI_DEMO_MODE boundary, etc.).

**Major risks / constraints**
- Local VM is **Node 18.19.1**; Vite 7 requires **Node >=20.19**, so `npm run build` + Playwright are blocked locally.
- Evidence DB may be empty in preview/prod; evidence routes intentionally return 503 until populated (acceptable for doctor-demo if documented).
- Some “real” pipelines remain demo-gated (`MRI_DEMO_MODE`, DeepTwin simulation gate); must stay honest.

**Required follow-ups:**
- Land CI green on PR #515 and keep it draft until green.
- Optional language hardening: rename visible Source Localization UI title to “MNE Source Imaging” (safer framing; no urgency).

---

## CI / Environment

- **PR**: `#515` (draft)
- **Branch**: `doctor-ready/e2e-validation-and-hardening`
- **Local Node**: `v18.19.1` (incompatible with Vite 7 build)
- **CI Node**: `20` (per `.github/workflows/ci.yml`; Vite 7 requires `>=20.19`)
- **Local Python**: `3.12.3` (tests passed locally)
- **CI Python**: `3.11` (per `.github/workflows/ci.yml`)
- **CI checks visible (this env)**: **No** (`gh pr view --json statusCheckRollup` returned empty; PR is draft)

## Evidence pack (links)

| Item | Link | Notes |
|---|---|---|
| Netlify preview site | `https://deepsynaps-studio-preview.netlify.app` | |
| Fly API | `https://deepsynaps-studio.fly.dev` | |
| Latest CI run | (paste) | |
| Test artifacts | (paste) | Playwright report, logs |
| Deploy script | `scripts/deploy-preview.sh` | web only / web+api |
| Deploy docs | `apps/api/DEPLOY.md` | Fly first deploy / secrets |

---

## 3) Scope and non-scope (doctor-ready definition)

### In-scope
- (fill)

### Explicitly out-of-scope / demo-only
- (fill)

### Clinical safety positioning
- **Decision support only**: clinician review required.
- **Not a medical device** (current positioning).

---

## Validation Matrix (commands + results)

| Area | Command | Result | Notes |
|---|---|---|---|
| Alembic heads | `cd apps/api && python3 -m alembic heads` | **PASS** | single head: `093_qeeg_105_jobs_audit_cache` |
| Alembic upgrade | `cd apps/api && python3 -m alembic upgrade head` | **PASS** | SQLite path validated |
| Alembic downgrade/upgrade | `cd apps/api && python3 -m alembic downgrade -1 && python3 -m alembic upgrade head` | **PASS** | |
| Backend doctor-ready gates | `cd apps/api && python3 -m pytest -q -n 0 tests/test_qeeg_security_audit.py tests/test_qeeg_105_endpoints_authz.py tests/test_qeeg_105_registry.py tests/test_qeeg_105_results_contract.py app/qeeg/services/phi_redaction_test.py` | **PASS** | `98 passed` |
| MRI + DeepTwin gates | `cd apps/api && python3 -m pytest -q -n 0 tests/test_mri_* tests/test_deeptwin_*` | **PASS** | `103 passed` (see Agent 5 report) |
| qEEG pipeline | `python3 -m pytest -q packages/qeeg-pipeline` | **PASS** | `139 passed, 3 skipped` |
| Worker tests | `cd apps/worker && python3 -m pytest -q` | **PASS** | `10 passed` |
| Web lint | `cd apps/web && npm run lint` | **PASS** | |
| Web unit tests | `cd apps/web && npm run test:unit` | **PASS** | `1029` tests |
| Web build | `cd apps/web && npm run build` | **BLOCKED (local)** | Node 18; CI Node 20 required |
| Playwright E2E | `cd apps/web && npx playwright test` | **BLOCKED (local)** | Node 18 (webServer uses Vite) |

## Agent Summary

| Agent | Scope | Result | Report |
|---|---|---|---|
| 1 | DB/Alembic | PASS | `docs/ai-audits/DOCTOR_READY_MIGRATION_REPORT.md` |
| 2 | Backend security/tenant isolation | PASS | `docs/ai-audits/DOCTOR_READY_BACKEND_SECURITY_REPORT.md` |
| 3 | QEEG-105 Phase 0 | PASS (honesty enforced) | `docs/ai-audits/QEEG_105_PHASE0_DOCTOR_READY_REPORT.md` |
| 4 | qEEG/ERP/Source | PASS | `docs/ai-audits/DOCTOR_READY_QEEG_ERP_SOURCE_REPORT.md` |
| 5 | MRI/DeepTwin | PASS | `docs/ai-audits/DOCTOR_READY_MRI_DEEPTWIN_REPORT.md` |
| 6 | Frontend/Playwright | PASS (lint/unit); build/E2E blocked locally | `docs/ai-audits/DOCTOR_READY_FRONTEND_PLAYWRIGHT_REPORT.md` |
| 7 | AI/PHI/claims | PASS | `docs/ai-audits/DOCTOR_READY_AI_COMPLIANCE_REPORT.md` |

### CI workflows referenced

| Workflow | File | What it does | Required to pass |
|---|---|---|---|
| CI | `.github/workflows/ci.yml` | build, unit, e2e, backend tests, lints | ☐ |
| E2E (web-focused) | `.github/workflows/e2e.yml` | Playwright against local backend | ☐ |
| Deploy web → Netlify | `.github/workflows/deploy-netlify.yml` | builds w/ demo flag, deploys | ☐ |

### Results (paste from main PR / branch)

| Gate | Status | Notes / link |
|---|---|---|
| Web build | ☐ pass ☐ fail | CI Node 20 is authoritative (local VM Node 18 cannot run Vite 7) |
| Web unit tests | ☑ pass ☐ fail | Local: `1029` pass (`npm run test:unit`) |
| E2E tests | ☐ pass ☐ fail | CI Node 20 is authoritative (local VM Node 18 cannot start Vite webServer) |
| Backend tests | ☑ pass ☐ fail | Targeted suites passed locally (see matrix below) |
| Router lints | ☑ pass ☐ fail | `tests/test_router_basemodel_lint.py`, `tests/test_router_no_models_lint.py` covered by web unit suite; API lint tools in CI |
| API image smoke | ☐ pass ☐ fail | CI gate |

---

## Recommendation

**Keep PR #515 as draft and do not merge yet.** Mark merge-ready only after CI (Node 20) confirms `build:web` and Playwright E2E green, or after an explicit policy waiver for E2E (not recommended for doctor-demo readiness).

---

## 6) Deployment readiness

### Environments and what they run

| Component | Preview / Demo | “Real” / Production intent | Notes |
|---|---|---|---|
| Web | Netlify preview | (TBD) | `VITE_ENABLE_DEMO=1` |
| API | Fly (`deepsynaps-studio`) | Fly / other | `MRI_DEMO_MODE` etc |
| DB | Fly volume SQLite or Postgres | Postgres recommended at scale | |

### Required env vars / secrets (fill with verification status)

| Secret / Env | Where | Required? | Verified present? | Notes |
|---|---|---:|---:|---|
| `JWT_SECRET_KEY` | API | Yes (prod/staging) | ☐ | |
| `DEEPSYNAPS_SECRETS_KEY` | API | Yes (prod/staging) | ☐ | |
| `DEEPSYNAPS_DATABASE_URL` | API | Yes | ☐ | sqlite volume vs postgres |
| `DEEPSYNAPS_CORS_ORIGINS` | API | Yes (for browser) | ☐ | must include Netlify |
| `WEARABLE_TOKEN_ENC_KEY` | API | Yes (prod/staging if wearable OAuth enabled) | ☐ | encryption at rest |
| `SENTRY_DSN` | API | Optional | ☐ | |
| `STRIPE_*` | API | Optional | ☐ | payments |
| `ANTHROPIC_API_KEY` | API | Optional | ☐ | LLM features |
| `OPENAI_API_KEY` | API | Optional | ☐ | whisper/fallback |

### Migrations
- **Mechanism**: Fly `release_command` runs `alembic upgrade head`.
- **Status**: ☐ verified on deploy ☐ not applicable ☐ needs attention

### Rollback plan
- **Web**: redeploy previous Netlify deploy (or redeploy from previous commit SHA).
- **API**: deploy previous working image/commit; run downgrade only if explicitly tested.
- **Data**: snapshot/backup strategy documented in `docs/deployment/doctor-ready-checklist.md`.

---

## 7) “Demo vs Real” behavior matrix

| Feature | Demo path | Real path | Risk / guardrails |
|---|---|---|---|
| Web login | demo buttons enabled (`VITE_ENABLE_DEMO=1`) | real auth flow (TBD) | |
| API auth | demo bearer tokens accepted | JWT-based auth | |
| MRI Analyzer | canned JSON if `MRI_DEMO_MODE=1` | pipeline if installed & enabled | |
| Evidence DB | 503 until DB exists | populated DB on volume | |

---

## 8) Privacy / security / compliance checklist

| Item | Status | Notes |
|---|---|---|
| No secrets committed | ☐ pass ☐ fail | |
| CORS allowlist set | ☐ pass ☐ fail | |
| JWT secret non-placeholder in prod | ☐ pass ☐ fail | |
| Rate limiting storage configured (Redis) | ☐ pass ☐ fail | `DEEPSYNAPS_LIMITER_REDIS_URI` |
| Upload size limits set | ☐ pass ☐ fail | |

---

## 9) Open issues and follow-ups

| Priority | Item | Owner | Link | Notes |
|---:|---|---|---|---|
| P0 |  |  |  |  |
| P1 |  |  |  |  |
| P2 |  |  |  |  |

