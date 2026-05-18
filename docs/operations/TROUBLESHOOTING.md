<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# DeepSynaps Protocol Studio — Troubleshooting Guide

> Quick fixes for the most common deployment and runtime issues.
>
> Deployment: API on Fly (`deepsynaps-studio`, lhr region) · Web on Netlify (`deepsynaps-studio-preview`).
> Deploy scripts: `scripts/deploy-preview.sh` (local build + push) · `scripts/deploy-via-hook.sh` (build-hook trigger).

---

## Table of Contents

1. [API Won't Start (Fly)](#1-api-wont-start-fly)
2. [Database Connection Failed](#2-database-connection-failed)
3. [CORS Errors](#3-cors-errors)
4. [Safety Disclaimers Missing](#4-safety-disclaimers-missing)
5. [Tests Failing](#5-tests-failing)
6. [Web Deploy Failing (Netlify)](#6-web-deploy-failing-netlify)
7. [Quick Diagnostic Commands](#7-quick-diagnostic-commands)

---

## 1. API Won't Start (Fly)

### Symptom
`fly deploy` exits non-zero, machines crash-loop, or `/health` returns 502.

### Checklist

#### 1.1 Check machine status

```bash
fly status --app deepsynaps-studio
fly logs --app deepsynaps-studio
```

Look for Python tracebacks in the log stream.

#### 1.2 Check environment variables are set on Fly

```bash
fly secrets list --app deepsynaps-studio
```

**Critical secrets that prevent startup:**

| Secret | Symptom if Missing |
|--------|--------------------|
| `DEEPSYNAPS_DATABASE_URL` | `RuntimeError: FATAL: Production environment requires PostgreSQL` |
| `SECRET_KEY` (< 32 chars) | JWT signing failures, session errors |

To set or update a secret:
```bash
fly secrets set DEEPSYNAPS_DATABASE_URL="postgresql://..." --app deepsynaps-studio
```

#### 1.3 Check the module path

The correct uvicorn entrypoint is `app.main:app` (under `apps/api/`).

If the `fly.toml` or `Dockerfile` references `src.deepsynaps.main` that path does not exist in current main — update to `app.main:app`.

#### 1.4 Production SQLite block

If logs show:
```
FATAL: Production environment requires PostgreSQL.
Set DEEPSYNAPS_DATABASE_URL=postgresql://user:pass@host/db.
```

`DEEPSYNAPS_APP_ENV` is set to `production` but `DEEPSYNAPS_DATABASE_URL` is missing or pointing to a SQLite path. Fix the secret on Fly (see 1.2).

#### 1.5 Scale / resource issues

```bash
fly scale show --app deepsynaps-studio
fly logs --app deepsynaps-studio | grep "OOM\|killed\|memory"
```

Increase VM size if OOM-killed:
```bash
fly scale vm shared-cpu-2x --app deepsynaps-studio
```

---

## 2. Database Connection Failed

### Symptom
API returns 500 errors, health check shows DB issues, or SQLAlchemy errors in `fly logs`.

### Checklist

#### 2.1 Check DEEPSYNAPS_DATABASE_URL is set correctly

```bash
fly secrets list --app deepsynaps-studio
```

**Expected format:**
```
postgresql://user:password@host:5432/dbname?sslmode=require
```

**Common mistakes:**

| Wrong | Right |
|-------|-------|
| `DATABASE_URL` (old name) | `DEEPSYNAPS_DATABASE_URL` |
| `postgres://` (without `ql`) | `postgresql://` |
| No `sslmode` on Fly Postgres | Add `?sslmode=require` |

#### 2.2 Check Fly Postgres cluster status

```bash
fly status --app <your-postgres-app-name>
fly logs --app <your-postgres-app-name>
```

#### 2.3 Verify connectivity from the API machine

```bash
fly ssh console --app deepsynaps-studio
# Inside the machine:
python -c "import sqlalchemy; e = sqlalchemy.create_engine('$DEEPSYNAPS_DATABASE_URL'); e.connect(); print('OK')"
```

#### 2.4 Check alembic migrations are up to date

Current heads: `b5278dd39fee`, `d1e2f3a4b5c6_merge_100_agent_configs`, `104_merge_agent_configs_lineage`.

```bash
# From apps/api on the deployed machine or locally pointing at prod DB:
alembic heads
alembic current
alembic upgrade head
```

#### 2.5 Connection pool exhaustion

Tune via Fly secrets:
```bash
fly secrets set POSTGRES_POOL_SIZE=20 POSTGRES_MAX_OVERFLOW=40 --app deepsynaps-studio
```

#### 2.6 SSL issues

Fly Postgres requires SSL. Ensure the connection string includes `?sslmode=require` or set:
```bash
fly secrets set POSTGRES_SSLMODE=require --app deepsynaps-studio
```

---

## 3. CORS Errors

### Symptom
Browser console shows `Access-Control-Allow-Origin` errors; Netlify frontend can't reach Fly API.

### Checklist

#### 3.1 Check DEEPSYNAPS_CORS_ORIGINS on Fly

```bash
fly secrets list --app deepsynaps-studio | grep CORS
```

**Production value must include the Netlify preview URL:**
```
DEEPSYNAPS_CORS_ORIGINS=https://deepsynaps-studio-preview.netlify.app
```

Multiple origins are comma-separated.

#### 3.2 Check the origin whitelist format

| Wrong | Right |
|-------|-------|
| Trailing slash `https://…/` | No trailing slash |
| Wildcard `*` | Comma-separated exact origins |
| `https://domain.com:443` | `https://domain.com` |

#### 3.3 Test CORS preflight

```bash
curl -i -X OPTIONS https://deepsynaps-studio.fly.dev/api/v1/health \
  -H "Origin: https://deepsynaps-studio-preview.netlify.app" \
  -H "Access-Control-Request-Method: GET"
```

Response must include `Access-Control-Allow-Origin`.

#### 3.4 Apply the config change

After updating a secret, redeploy:
```bash
fly deploy --app deepsynaps-studio
```

---

## 4. Safety Disclaimers Missing

### Symptom
API responses lack `safety_disclaimer`, frontend shows no safety banner, or safety governance tests fail.

### Checklist

#### 4.1 Check `safety_governance.py` is present

```bash
ls -la apps/api/app/safety_governance.py
```

<!-- TODO: verify against current main — confirm file is at apps/api/app/safety_governance.py -->

**Verify required constants exist:**
```bash
grep -n "DISALLOWED_PATTERNS\|MAX_CONFIDENCE\|REQUIRED_REVIEW_LABEL" \
  apps/api/app/safety_governance.py
```

#### 4.2 Run safety governance tests

```bash
cd apps/api
pytest tests/test_safety_governance.py -v
```

#### 4.3 Check API health endpoint

```bash
curl -s https://deepsynaps-studio.fly.dev/health | python3 -m json.tool
```

#### 4.4 Check causal overclaiming and confidence cap

```bash
pytest apps/api/tests/test_safety_governance.py::test_causal_overclaiming -v
pytest apps/api/tests/test_safety_governance.py::test_confidence_cap -v
```

<!-- TODO: verify against current main — confirm these test names exist -->

---

## 5. Tests Failing

### Symptom
`pytest` reports failures, E2E tests fail, or coverage is below threshold.

### Checklist

#### 5.1 Check Python version

```bash
python --version
# Required: 3.11+
```

#### 5.2 Install dependencies

```bash
cd apps/api
pip install -r requirements.txt
```

#### 5.3 Run tests with verbose output

```bash
cd apps/api
pytest tests/ -v --tb=short

# With coverage (module path is app, not src):
pytest tests/ -v --cov=app --cov-report=term-missing
```

#### 5.4 Common failures

**ImportError / ModuleNotFoundError:**
```bash
cd apps/api
PYTHONPATH=. pytest tests/ -v
```

**Database-related test failures (SQLite lock):**
```bash
pytest tests/ -v -n 1  # single-threaded
```

#### 5.5 Run frontend unit tests

```bash
cd apps/web
npm install
npm run test
```

#### 5.6 Run E2E tests

```bash
cd apps/web
npx playwright install --with-deps
npm run build
npm run test:e2e
```

---

## 6. Web Deploy Failing (Netlify)

### Symptom
`scripts/deploy-preview.sh` fails, Netlify build errors, or preview URL shows old content.

### Checklist

#### 6.1 Trigger a deploy

```bash
# Build locally and push to Netlify:
bash scripts/deploy-preview.sh

# Or trigger server-side build via hook (no local Netlify auth required):
bash scripts/deploy-via-hook.sh
```

#### 6.2 Check Netlify build logs

```bash
netlify deploy --build --dir apps/web/dist
# Or view in Netlify dashboard under the deepsynaps-studio-preview site
```

#### 6.3 Clear Netlify build cache

```bash
bash scripts/deploy-via-hook.sh --clear-cache
```

#### 6.4 Netlify auth

One-time setup:
```bash
netlify login
```

Or export `NETLIFY_AUTH_TOKEN` before running deploy scripts. Never paste tokens in chat.

#### 6.5 Verify preview URL is live

```bash
curl -sf https://deepsynaps-studio-preview.netlify.app | head -5
```

---

## 7. Quick Diagnostic Commands

### Full System Status

```bash
echo "=== Fly API Status ==="
fly status --app deepsynaps-studio

echo "=== Fly Recent Logs ==="
fly logs --app deepsynaps-studio | tail -30

echo "=== API Health ==="
curl -sf https://deepsynaps-studio.fly.dev/health | python3 -m json.tool || echo "HEALTH CHECK FAILED"

echo "=== Netlify Preview ==="
curl -sf -o /dev/null -w "HTTP %{http_code}\n" https://deepsynaps-studio-preview.netlify.app

echo "=== Fly Secrets (names only) ==="
fly secrets list --app deepsynaps-studio

echo "=== Alembic Migration Status ==="
cd apps/api && alembic current 2>/dev/null || echo "Cannot check (run locally with DB env set)"
```

### Individual Quick Checks

| Check | Command |
|-------|---------|
| API health | `curl https://deepsynaps-studio.fly.dev/health` |
| Fly machine status | `fly status --app deepsynaps-studio` |
| Fly live logs | `fly logs --app deepsynaps-studio` |
| Fly secrets list | `fly secrets list --app deepsynaps-studio` |
| Set a secret | `fly secrets set KEY=value --app deepsynaps-studio` |
| SSH into machine | `fly ssh console --app deepsynaps-studio` |
| Netlify preview | `curl -I https://deepsynaps-studio-preview.netlify.app` |
| Trigger web build | `bash scripts/deploy-via-hook.sh` |
| Alembic current | `cd apps/api && alembic current` |
| Run tests | `cd apps/api && pytest tests/ -v --tb=short` |
| Env check on Fly | `fly ssh console --app deepsynaps-studio -C "env \| grep DEEPSYNAPS"` |
