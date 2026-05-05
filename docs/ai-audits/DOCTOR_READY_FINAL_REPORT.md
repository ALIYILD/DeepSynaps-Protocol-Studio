## Doctor-Ready Final Report (Release Captain Fill-In)

**Release**: Doctor-ready (DeepSynaps Protocol Studio)  
**Branch / Tag**: `doctor-ready/...`  
**Prepared by**: Release Captain  
**Date**: YYYY-MM-DD  
**Environments**: Preview (Netlify), API (Fly), Local

---

## 1) Executive summary

- **Go/No-Go**: ☐ Go ☐ No-Go ☐ Go with constraints (listed below)
- **What shipped**: (1–3 bullets)
- **Major risks**: (1–3 bullets)
- **Required follow-ups**: (links to issues / PRs)

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
| Web build | ☐ pass ☐ fail | |
| Web unit tests | ☐ pass ☐ fail | |
| E2E tests | ☐ pass ☐ fail | |
| Backend tests | ☐ pass ☐ fail | |
| Router lints | ☐ pass ☐ fail | |
| API image smoke | ☐ pass ☐ fail | |

---

## 5) Local run validation (commands + outcomes)

| Area | Command(s) | Result | Notes |
|---|---|---|---|
| Install (node) | `npm ci` | ☐ pass ☐ fail | |
| Web unit tests | `npm run test:unit --workspace @deepsynaps/web` | ☐ pass ☐ fail | |
| Web build | `npm run build:web` | ☐ pass ☐ fail | |
| API install (editable) | (paste) | ☐ pass ☐ fail | |
| API tests | `cd apps/api && python -m pytest -q` | ☐ pass ☐ fail | |
| E2E | `npm run test:e2e --workspace @deepsynaps/web` | ☐ pass ☐ fail | |

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

