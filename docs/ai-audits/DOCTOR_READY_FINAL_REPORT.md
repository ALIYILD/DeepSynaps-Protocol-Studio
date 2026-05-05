## Doctor-Ready Final Report (Release Captain Fill-In)

**Release**: Doctor-ready (DeepSynaps Protocol Studio)  
**Branch / Tag**: `doctor-ready/...`  
**Prepared by**: Release Captain  
**Date**: YYYY-MM-DD  
**Environments**: Preview (Netlify), API (Fly), Local

---

## 1) Executive summary

- **Go/No-Go**: ☐ Go ☐ No-Go ☑ Go with constraints (listed below)
- **Doctor-demo ready**: ☑ Pending CI Node 20 build/E2E for PR #515; backend + clinical safety gates validated locally.
- **Preview-ready**: ☑ Pending CI confirmation (Netlify/Fly deploys unchanged by this PR; doctor-ready hardening adds audits/tests/docs).
- **Production-ready**: ☐ No (this PR is validation/hardening; several modules remain demo-gated and require operational secrets + evidence DB + clinician workflow sign-off).

**What shipped (doctor-ready hardening):**
- QEEG-105 Phase 0 registry-first surface (honest statuses, audit events, no placeholder results, SSE status stream).
- Tenant isolation/security hardening for QEEG-105 job/run/result surfaces + PHI redaction before LLM prompt assembly.
- Doctor-ready validation reports + deployment checklist updates (Node 20 requirement, MRI_DEMO_MODE boundary, etc.).

**Major risks / constraints:**
- CI (Node 20) build + Playwright E2E must pass before merge; local VM is Node 18 (Vite 7 cannot run).
- Evidence DB in preview/prod may be empty; evidence routes intentionally return 503 until populated (acceptable for doctor-demo if documented).
- Some “real” pipelines remain demo-gated (MRI_DEMO_MODE, DeepTwin simulation gate); must stay honest.

**Required follow-ups:**
- Land CI green on PR #515 and keep it draft until green.
- Optional language hardening: rename visible Source Localization UI title to “MNE Source Imaging” (safer framing; no urgency).

---

## 2) Evidence pack (links)

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

## 4) CI / quality gates summary

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

## 5) Local run validation (commands + outcomes)

| Area | Command(s) | Result | Notes |
|---|---|---|---|
| Install (node) | `npm ci` | ☑ pass ☐ fail | Node 18 in VM; install ok |
| Web unit tests | `cd apps/web && npm run test:unit` | ☑ pass ☐ fail | `1029` pass |
| Web build | `cd apps/web && npm run build` | ☐ pass ☑ fail | Node 18 incompatible with Vite 7 (requires Node >=20.19) |
| API tests (targeted) | `cd apps/api && python3 -m pytest -q ...` | ☑ pass ☐ fail | See matrix below |
| E2E | `cd apps/web && npx playwright test` | ☐ pass ☑ fail | Blocked by Node 18 (cannot start Vite) |

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

