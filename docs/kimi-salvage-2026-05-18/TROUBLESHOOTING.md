# DeepSynaps Protocol Studio — Troubleshooting Guide

> Quick fixes for the most common deployment and runtime issues.
>
> For production deployment procedures, see `QUICK_DEPLOY.md`.
> For the full deployment audit, see `DEPLOYMENT_AUDIT_MASTER_REPORT.md`.

---

## Table of Contents

1. [App Won't Start](#1-app-wont-start)
2. [Database Connection Failed](#2-database-connection-failed)
3. [Redis Connection Failed](#3-redis-connection-failed)
4. [Safety Disclaimers Missing](#4-safety-disclaimers-missing)
5. [CORS Errors](#5-cors-errors)
6. [Tests Failing](#6-tests-failing)
7. [Quick Diagnostic Commands](#7-quick-diagnostic-commands)

---

## 1. App Won't Start

### Symptom
`docker compose up` fails, API container exits with error, or `uvicorn` won't start.

### Checklist

#### 1.1 Check Docker is running

```bash
docker --version
docker compose version
docker info
```

**Fix:**
```bash
# Linux
sudo systemctl start docker

# macOS
open -a Docker

# Verify
docker run hello-world
```

#### 1.2 Check port conflicts

```bash
# Check if required ports are in use
sudo lsof -i :80
sudo lsof -i :8000
sudo lsof -i :5432
sudo lsof -i :6379
```

**Fix — kill process using port:**
```bash
sudo kill -9 <PID>
```

**Fix — change port mapping in `docker-compose.yml`:**
```yaml
# Example: use port 8080 instead of 80 for web
web:
  ports:
    - "8080:80"

# Example: use port 5433 instead of 5432 for DB (external access only)
db:
  ports:
    - "5433:5432"
```

#### 1.3 Check environment variables

```bash
# Verify .env exists and is readable
ls -la .env
cat .env | head -20

# Verify key variables are set
grep "DEEPSYNAPS_APP_ENV" .env
grep "DATABASE_URL" .env
grep "SECRET_KEY" .env
```

**Fix — regenerate .env from template:**
```bash
cp .env.example .env
# Edit .env with your values
nano .env
```

**Critical env vars that prevent startup:**

| Variable | Symptom if Missing |
|----------|-------------------|
| `DEEPSYNAPS_APP_ENV=production` + no `DATABASE_URL` | `RuntimeError: FATAL: Production environment requires PostgreSQL` |
| `SECRET_KEY` with < 32 chars | JWT signing failures, session errors |
| `DEEPSYNAPS_DEMO_CLINIC_SEED=true` in production | `CRITICAL: DEEPSYNAPS_DEMO_CLINIC_SEED is enabled in production` warning |

#### 1.4 Check Docker container logs

```bash
# All service logs
docker compose logs

# API logs (most informative)
docker compose logs --tail 100 api

# Check for Python traceback
docker compose logs api 2>&1 | grep -A 20 "Traceback"
```

#### 1.5 Check the Dockerfile build

```bash
# Force rebuild
docker compose down
docker compose up -d --build

# If build fails, check Dockerfile syntax
docker build -f Dockerfile .
```

#### 1.6 Production SQLite block

If you see this error, you're trying to use SQLite in production:
```
FATAL: Production environment requires PostgreSQL.
Set DATABASE_URL=postgresql://user:pass@host/db.
SQLite is not permitted in production.
```

**Fix:**
```bash
# Option A: Set DATABASE_URL to PostgreSQL
DATABASE_URL=postgresql://deepsynaps:changeme@db:5432/deepsynaps

# Option B: Change APP_ENV to development (NOT for production)
DEEPSYNAPS_APP_ENV=development
```

#### 1.7 Container resource limits

```bash
# Check if containers are being killed by OOM
docker events --filter event=oom

# Check container stats
docker stats deepsynaps-api

# Fix: increase memory limits in docker-compose.yml
api:
  deploy:
    resources:
      limits:
        memory: 1G   # Increase from 512M
```

---

## 2. Database Connection Failed

### Symptom
API returns 500 errors, health check shows DB issues, or `psycopg2` errors in logs.

### Checklist

#### 2.1 Check DATABASE_URL is set correctly

```bash
# Inside the API container
docker compose exec api env | grep DATABASE_URL

# Or check .env
grep DATABASE_URL .env
```

**Expected format:**
```bash
DATABASE_URL=postgresql://deepsynaps:changeme@db:5432/deepsynaps
```

**Common mistakes:**

| Wrong | Right |
|-------|-------|
| `postgres://` (without `ql`) | `postgresql://` |
| `@localhost:5432` | `@db:5432` (docker service name, not localhost) |
| Missing password | Must include `user:password@` |
| Wrong database name | Must match `POSTGRES_DB` in docker-compose.yml |

#### 2.2 Check PostgreSQL is running

```bash
# Container status
docker compose ps db

# PostgreSQL logs
docker compose logs --tail 50 db

# Connect to PostgreSQL from host
docker compose exec db pg_isready -U deepsynaps

# Expected: /var/run/postgresql:5432 - accepting connections
```

**Fix — restart PostgreSQL:**
```bash
docker compose restart db

# If persistent failure, check disk space
docker system df
```

#### 2.3 Check credentials work

```bash
# Test login
docker compose exec db psql -U deepsynaps -d deepsynaps -c "SELECT 1;"

# Expected:  ?column? 
#            ----------
#                   1
#            (1 row)
```

**Fix — if credentials are wrong:**
```bash
# 1. Stop everything
docker compose down -v  # -v removes the volume

# 2. Fix credentials in .env
docker compose up -d
```

> **WARNING:** `docker compose down -v` DELETES ALL DATABASE DATA.

#### 2.4 Check tables exist

```bash
docker compose exec db psql -U deepsynaps -d deepsynaps -c "\dt"
```

**Expected tables:**
- `multimodal_events`
- `evidence_db`
- `patient_access`
- `audit_log`
- `deeptwin_reviews`
- `deeptwin_tasks`

**Fix — if tables are missing:**
```bash
# Restart the API (tables are auto-created on startup)
docker compose restart api

# Verify again
docker compose exec db psql -U deepsynaps -d deepsynaps -c "\dt"
```

#### 2.5 Check psycopg2 is installed

```bash
docker compose exec api python -c "import psycopg2; print(psycopg2.__version__)"
```

**Fix — if not installed:**
```bash
# Rebuild the API image (psycopg2 is in requirements.txt)
docker compose down
docker compose up -d --build
```

#### 2.6 Connection pool exhaustion

```bash
# Check active connections
docker compose exec db psql -U deepsynaps -d deepsynaps -c "
SELECT count(*) FROM pg_stat_activity WHERE datname = 'deepsynaps';
"
```

**Fix — increase pool size in .env:**
```bash
POSTGRES_POOL_SIZE=20
POSTGRES_MAX_OVERFLOW=40
```

#### 2.7 SSL connection issues

```bash
# If SSL errors appear in logs, adjust SSL mode
POSTGRES_SSLMODE=prefer   # Default — try SSL, fall back to plaintext
POSTGRES_SSLMODE=require  # Force SSL
POSTGRES_SSLMODE=disable  # No SSL (dev only)
```

---

## 3. Redis Connection Failed

### Symptom
Cache not working, API falls back to MockRedis, or `redis.exceptions.ConnectionError` in logs.

### Checklist

#### 3.1 Check REDIS_URL is set

```bash
# Inside API container
docker compose exec api env | grep REDIS_URL

# From host
grep REDIS_URL .env
```

**Expected:**
```bash
REDIS_URL=redis://redis:6379/0
```

#### 3.2 Check Redis is running

```bash
# Container status
docker compose ps redis

# Redis ping
docker compose exec redis redis-cli ping

# Expected: PONG
```

**Fix:**
```bash
docker compose restart redis
```

#### 3.3 Check Redis logs

```bash
docker compose logs --tail 30 redis
```

#### 3.4 Verify Redis caching is enabled

```bash
docker compose exec api env | grep DEEPSYNAPS_ENABLE_REDIS_CACHE
```

**Expected:** `DEEPSYNAPS_ENABLE_REDIS_CACHE=true`

**Fix — enable Redis cache:**
```bash
# Edit .env
DEEPSYNAPS_ENABLE_REDIS_CACHE=true

# Restart API to pick up changes
docker compose restart api
```

#### 3.5 MockRedis fallback behavior

When Redis is unavailable, the API automatically falls back to `_MockRedis` (in-memory cache):

```
# In API logs:
"Redis connection failed: Error 111 connecting to redis:6379. Connection refused — falling back to in-memory mock"
```

**This is expected behavior for development.** In production, Redis should be healthy:

```bash
# Verify the fallback is NOT active in production
docker compose logs api | grep "in-memory mock"

# Should show NO lines in production
# If it does, fix Redis connectivity
```

#### 3.6 Check Redis memory

```bash
# Memory usage
docker compose exec redis redis-cli INFO memory | grep used_memory_human

# Max memory (set in docker-compose.yml to 256mb with allkeys-lru)
docker compose exec redis redis-cli CONFIG GET maxmemory
```

#### 3.7 Flush Redis cache

```bash
# Flush all keys (use with caution in production)
docker compose exec redis redis-cli FLUSHDB

# Or flush via the API container
docker compose exec api python -c "
from cache_service import get_cache_service
cache = get_cache_service()
cache.delete_prefix('ds:v1:')
print('Cache flushed')
"
```

---

## 4. Safety Disclaimers Missing

### Symptom
API responses don't include `safety_disclaimer`, frontend shows no safety banner, or safety governance tests fail.

### Checklist

#### 4.1 Check `safety_governance.py` is present

```bash
ls -la apps/api/src/deepsynaps/safety_governance.py
```

**Verify the file contains the required safety rules:**

```bash
grep -n "DISALLOWED_PATTERNS\|MAX_CONFIDENCE\|REQUIRED_REVIEW_LABEL" \
  apps/api/src/deepsynaps/safety_governance.py
```

Expected output:
```
12:    DISALLOWED_PATTERNS = [
31:    MAX_CONFIDENCE = 0.95
30:    REQUIRED_REVIEW_LABEL = "Decision support only. Requires clinician review."
```

#### 4.2 Check `contracts.py` is present

```bash
ls -la apps/api/src/deepsynaps/contracts.py
```

**Verify safety disclaimer constants exist:**

```bash
grep -n "SAFETY_DISCLAIMER\|safety_disclaimer\|safety_labels" \
  apps/api/src/deepsynaps/main.py | head -20
```

#### 4.3 Check `contracts.js` (frontend)

```bash
ls -la apps/web/src/contracts.js
```

**Verify safety sweep function exists:**

```bash
grep -n "sweepSafetyWording\|SAFETY_MANDATORY_LABELS\|SAFETY_LABELS" \
  apps/web/src/contracts.js | head -20
```

Expected:
```
24:  REQUIRES_REVIEW: "Decision support only. Requires clinician review.",
99:  const SAFETY_MANDATORY_LABELS = [
685:  export function sweepSafetyWording(payload) {
```

#### 4.4 Run safety governance tests

```bash
cd apps/api
pytest tests/test_safety_governance.py -v
```

#### 4.5 Check API response includes disclaimer

```bash
curl -s http://localhost:8000/health | python3 -m json.tool
```

All non-system endpoints should return `safety_disclaimer` in their JSON response.

**Fix — if missing, verify the endpoint uses the response model:**

All Phase 3 and Phase 4 endpoints in `main.py` use response models with `safety_disclaimer` defaults:
- `TimelineResponse`, `CorrelationResponse`, `ConfounderResponse`, `QualityFlagsResponse`
- `SynthesisResponseModel`
- `DeepTwinSnapshotResponse`, `DeepTwinTimelineResponse`, `DeepTwinHypothesesResponse`
- `DeepTwinSynthesisResponse`, `DeepTwinReviewResponse`, `DeepTwinExportResponse`

#### 4.6 Check causal overclaiming detection

```bash
# Run the safety engine tests
pytest apps/api/tests/test_safety_governance.py::test_causal_overclaiming -v

# Verify confidence capping
pytest apps/api/tests/test_safety_governance.py::test_confidence_cap -v
```

---

## 5. CORS Errors

### Symptom
Browser console shows `Access-Control-Allow-Origin` errors, frontend can't connect to API.

### Checklist

#### 5.1 Check CORS origins configuration

```bash
# Check .env
grep DEEPSYNAPS_CORS_ORIGINS .env
```

**Default (development):**
```bash
DEEPSYNAPS_CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Production — must include your frontend domain:**
```bash
DEEPSYNAPS_CORS_ORIGINS=https://your-domain.com,https://app.your-domain.com
```

#### 5.2 Check the origin whitelist format

| Wrong | Right |
|-------|-------|
| `http://localhost:5173/` (trailing slash) | `http://localhost:5173` |
| `*` (wildcard — not supported) | Comma-separated exact origins |
| `https://your-domain.com:443` | `https://your-domain.com` |

#### 5.3 Check headers in the request

Open browser DevTools > Network tab. Check the `OPTIONS` preflight request:

**Request headers should include:**
- `Origin: https://your-frontend-domain.com`
- `Access-Control-Request-Method: GET` (or POST, etc.)
- `Access-Control-Request-Headers: x-clinic-id, x-patient-access-token`

**Response headers should include:**
- `Access-Control-Allow-Origin: https://your-frontend-domain.com`
- `Access-Control-Allow-Headers: x-clinic-id, x-patient-access-token`

#### 5.4 Test CORS from curl

```bash
# Test preflight
curl -i -X OPTIONS http://localhost:8000/api/v1/multimodal/patients/p-001/timeline \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: X-Clinic-ID, X-Patient-Access-Token"

# Look for Access-Control-Allow-Origin in the response
```

#### 5.5 Restart API after CORS config change

```bash
# .env changes require restart
docker compose restart api
```

#### 5.6 Nginx CORS (if using Nginx as reverse proxy)

If Nginx is in front of the API, add CORS headers to `nginx.conf`:

```nginx
location /api/ {
    proxy_pass http://api:8000;
    
    # CORS headers
    add_header 'Access-Control-Allow-Origin' '$http_origin' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,X-Clinic-ID,X-Patient-Access-Token' always;
    
    if ($request_method = 'OPTIONS') {
        return 204;
    }
}
```

---

## 6. Tests Failing

### Symptom
`pytest` reports failures, E2E tests fail, or coverage is below threshold.

### Checklist

#### 6.1 Check Python version

```bash
python --version
```

**Required:** Python 3.11+

**Fix — use pyenv or install Python 3.11:**
```bash
# Check available versions
pyenv versions

# Install if needed
pyenv install 3.11.6
pyenv local 3.11.6
```

#### 6.2 Check pytest is installed

```bash
cd apps/api
pytest --version
```

**Fix:**
```bash
pip install -r requirements.txt
```

#### 6.3 Check all dependencies are installed

```bash
pip install -r requirements.txt
```

**Key dependencies in `requirements.txt`:**
```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
pytest>=7.4.0
httpx>=0.25.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
python-multipart>=0.0.6
```

#### 6.4 Install optional dependencies

```bash
# For PostgreSQL support
pip install psycopg2-binary

# For Redis support
pip install redis

# For coverage reports
pip install pytest-cov
```

#### 6.5 Run tests with verbose output

```bash
cd apps/api

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_api_endpoints.py -v
pytest tests/test_access_control.py -v
pytest tests/test_safety_governance.py -v

# Run with coverage
pytest tests/ -v --cov=src/deepsynaps --cov-report=term-missing

# Run with traceback
pytest tests/ -v --tb=short
```

#### 6.6 Common test failures and fixes

**ImportError / ModuleNotFoundError:**
```bash
# Ensure you're in the right directory
cd apps/api

# Add src to PYTHONPATH if needed
PYTHONPATH=src:$PYTHONPATH pytest tests/ -v
```

**Database-related test failures:**
```bash
# Tests use SQLite by default (in-memory)
# If PostgreSQL tests fail, check:
export DATABASE_URL=""  # Force SQLite for tests
pytest tests/ -v
```

**Permission denied on test database:**
```bash
# SQLite file permissions
rm -f deepsynaps.db
pytest tests/ -v
```

#### 6.7 Run frontend unit tests

```bash
cd apps/web
npm install
npm run test
```

#### 6.8 Run frontend E2E tests

```bash
cd apps/web

# Install Playwright browsers
npx playwright install --with-deps

# Build frontend first
npm run build

# Run E2E tests
npm run test:e2e

# Or with UI mode
npm run test:e2e:ui

# Run specific test
npx playwright test e2e/safety-wording.spec.ts
```

#### 6.9 E2E test prerequisites

```bash
# Ensure API is running
curl http://localhost:8000/health

# Ensure frontend is built
ls apps/web/dist/index.html

# Ensure Playwright browsers are installed
npx playwright install chromium
```

#### 6.10 Test database is locked (SQLite)

```bash
# SQLite 'database is locked' during parallel tests
pytest tests/ -v -n 1  # Run single-threaded

# Or set a busy timeout
export DEEPSYNAPS_DB=:memory:
pytest tests/ -v
```

---

## 7. Quick Diagnostic Commands

### Full System Status Check

Run this combined diagnostic:

```bash
#!/bin/bash
echo "========================================"
echo "DeepSynaps Diagnostic Report"
echo "========================================"
echo ""

echo "--- Docker ---"
docker --version
docker compose version
echo ""

echo "--- Containers ---"
docker compose ps
echo ""

echo "--- Health Check ---"
curl -s http://localhost:8000/health | python3 -m json.tool 2>/dev/null || echo "HEALTH CHECK FAILED"
echo ""

echo "--- Runtime Config ---"
curl -s http://localhost:8000/api/v1/system/runtime-config | python3 -m json.tool 2>/dev/null || echo "CONFIG CHECK FAILED"
echo ""

echo "--- Database ---"
docker compose exec db pg_isready -U deepsynaps 2>/dev/null || echo "PostgreSQL not responding"
docker compose exec db psql -U deepsynaps -d deepsynaps -c "SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo "Cannot query DB"
echo ""

echo "--- Redis ---"
docker compose exec redis redis-cli ping 2>/dev/null || echo "Redis not responding"
echo ""

echo "--- API Logs (last 5 lines) ---"
docker compose logs --tail 5 api 2>/dev/null || echo "Cannot read API logs"
echo ""

echo "--- Nginx ---"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost 2>/dev/null || echo "Nginx not responding"
echo ""

echo "--- Ports ---"
for port in 80 8000 5432 6379; do
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Port $port: IN USE"
  else
    echo "Port $port: FREE"
  fi
done
echo ""

echo "--- Environment ---"
grep -E "^DEEPSYNAPS_APP_ENV=|^DATABASE_URL=|^REDIS_URL=|^DEEPSYNAPS_DEMO_MODE=|^DEEPSYNAPS_ENABLE_REDIS_CACHE=" .env 2>/dev/null || echo "Cannot read .env"
echo ""

echo "========================================"
echo "Diagnostic complete"
echo "========================================"
```

Save as `diagnose.sh`, then run:
```bash
chmod +x diagnose.sh
./diagnose.sh
```

### Individual Quick Checks

| Check | Command |
|-------|---------|
| API health | `curl http://localhost:8000/health` |
| Runtime config | `curl http://localhost:8000/api/v1/system/runtime-config` |
| DB connectivity | `docker compose exec db pg_isready -U deepsynaps` |
| DB tables | `docker compose exec db psql -U deepsynaps -d deepsynaps -c "\dt"` |
| Redis connectivity | `docker compose exec redis redis-cli ping` |
| Redis memory | `docker compose exec redis redis-cli INFO memory \| grep used` |
| Nginx | `curl -I http://localhost` |
| Container stats | `docker stats --no-stream` |
| API logs | `docker compose logs --tail 20 api` |
| DB logs | `docker compose logs --tail 20 db` |
| Redis logs | `docker compose logs --tail 20 redis` |
| Port usage | `sudo lsof -i :80,8000,5432,6379` |
| Env check | `docker compose exec api env \| grep DEEPSYNAPS` |
| Test run | `cd apps/api && pytest tests/ -v --tb=short` |
