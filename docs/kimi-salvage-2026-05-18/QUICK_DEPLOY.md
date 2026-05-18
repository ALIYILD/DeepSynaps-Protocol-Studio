# DeepSynaps Protocol Studio — Quick Deployment Guide

> Deploy the full stack (FastAPI + React + PostgreSQL + Redis) in under 15 minutes.
>
> For the full production runbook, see `DEPLOYMENT_RUNBOOK.md`.

---

## Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Docker | 24.0+ | `docker --version` |
| docker-compose | 2.20+ | `docker compose version` |
| Git | 2.30+ | `git --version` |
| Free ports | 80, 8000, 5432, 6379 | See troubleshooting if occupied |

### Minimum System Resources

| Component | CPU | RAM | Disk |
|-----------|-----|-----|------|
| API | 0.25 cores | 128 MB | 1 GB |
| Web (Nginx) | 0.1 cores | 64 MB | 500 MB |
| PostgreSQL | 0.25 cores | 256 MB | 10 GB |
| Redis | 0.1 cores | 64 MB | 1 GB |
| **Total minimum** | **1.0 core** | **1 GB** | **15 GB** |

---

## Step 1: Clone and Configure (5 min)

### 1.1 Clone the repository

```bash
git clone <repository-url> DeepSynaps-Protocol-Studio
cd DeepSynaps-Protocol-Studio
```

### 1.2 Copy environment file

```bash
cp .env.example .env
```

### 1.3 Edit `.env` with your production values

**Minimum required changes (production):**

```bash
# === REQUIRED: Application Environment ===
DEEPSYNAPS_APP_ENV=production

# === REQUIRED: PostgreSQL ===
DATABASE_URL=postgresql://deepsynaps:YOUR_STRONG_PASSWORD@db:5432/deepsynaps

# === REQUIRED: Security ===
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
DEEPSYNAPS_JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

# === REQUIRED: CORS (your frontend domain) ===
DEEPSYNAPS_CORS_ORIGINS=https://your-domain.com,https://app.your-domain.com
```

**Generate secure secrets:**

```bash
# Run this to generate a SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(32))"

# Example output: 8f3a9b2c... (64 hex chars)
# Paste this into your .env as SECRET_KEY=...
```

**Full `.env` for production reference:**

```bash
# =============================================================================
# DeepSynaps Protocol Studio — Production Environment
# =============================================================================

# --- Application Environment ---
DEEPSYNAPS_APP_ENV=production

# --- Database (PostgreSQL via docker-compose service name) ---
DATABASE_URL=postgresql://deepsynaps:YOUR_STRONG_PASSWORD@db:5432/deepsynaps

# --- PostgreSQL Connection Pooling ---
POSTGRES_POOL_SIZE=10
POSTGRES_MAX_OVERFLOW=20
POSTGRES_POOL_RECYCLE=3600
POSTGRES_POOL_PRE_PING=true
POSTGRES_SSLMODE=prefer

# --- Redis Cache ---
REDIS_URL=redis://redis:6379/0
DEEPSYNAPS_ENABLE_REDIS_CACHE=true
DEEPSYNAPS_CACHE_TTL_SECONDS=60
DEEPSYNAPS_PATIENT_CACHE_TTL_SECONDS=60
DEEPSYNAPS_CLINIC_SUMMARY_CACHE_TTL_SECONDS=30

# --- Security (GENERATE STRONG VALUES) ---
SECRET_KEY=REPLACE_WITH_64_CHAR_HEX_STRING
DEEPSYNAPS_JWT_SECRET=REPLACE_WITH_64_CHAR_HEX_STRING
# DEEPSYNAPS_ENCRYPTION_KEY=your-encryption-key-here

# --- GZip Compression ---
DEEPSYNAPS_ENABLE_GZIP=true
DEEPSYNAPS_GZIP_MINIMUM_SIZE=1024

# --- Demo Mode (MUST BE FALSE IN PRODUCTION) ---
DEEPSYNAPS_DEMO_MODE=false
DEEPSYNAPS_DEMO_CLINIC_SEED=false

# --- CORS Origins (your production frontend domains) ---
DEEPSYNAPS_CORS_ORIGINS=https://your-domain.com

# --- Logging ---
DEEPSYNAPS_LOG_LEVEL=INFO
```

### 1.4 Build the frontend

```bash
cd apps/web
npm install
npm run build
cd ../..
```

> The `docker-compose.yml` mounts `./apps/web/dist` into Nginx. You must build the frontend before `docker compose up`.

---

## Step 2: docker-compose up (5 min)

### 2.1 Start all services

```bash
docker compose up -d
```

### 2.2 Watch the logs

```bash
# All services
docker compose logs -f

# Or individual services
docker compose logs -f api
docker compose logs -f db
docker compose logs -f redis
docker compose logs -f web
```

### 2.3 Expected startup sequence

```
[+] Running 4/4
  Container deepsynaps-db     Started    (PostgreSQL init)
  Container deepsynaps-redis  Started    (Redis ready)
  Container deepsynaps-api    Started    (waits for db + redis health)
  Container deepsynaps-web    Started    (waits for api health)
```

Services use Docker healthchecks — the API waits for PostgreSQL and Redis to be healthy, and the web server waits for the API.

### 2.4 Verify containers are running

```bash
docker compose ps
```

Expected output:
```
NAME                STATUS     PORTS
-------------------------------------------
deepsynaps-api      Up (healthy)  0.0.0.0:8000->8000/tcp
deepsynaps-db       Up (healthy)  0.0.0.0:5432->5432/tcp
deepsynaps-redis    Up (healthy)  0.0.0.0:6379->6379/tcp
deepsynaps-web      Up (healthy)  0.0.0.0:80->80/tcp
```

---

## Step 3: Verify Deployment (3 min)

### 3.1 Health check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "phase": "4",
  "modules": [
    "timeline",
    "correlation",
    "confound",
    "evidence",
    "hypothesis",
    "missing_data",
    "deeptwin_snapshot",
    "deeptwin_review",
    "deeptwin_export"
  ]
}
```

### 3.2 Runtime config check

```bash
curl http://localhost:8000/api/v1/system/runtime-config
```

Expected:
```json
{
  "app_env": "production",
  "dialect": "postgresql",
  "demo_mode_enabled": false,
  "demo_seed_enabled": false,
  "is_production": true,
  "log_level": "INFO"
}
```

**Verify `demo_mode_enabled` is `false` and `is_production` is `true`.**

### 3.3 Smoke test — API endpoints

```bash
# Check that the API responds (will get 403 without valid auth — that's expected)
curl -w "\nHTTP: %{http_code}\n" \
  "http://localhost:8000/api/v1/multimodal/patients/demo-001/timeline?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

Expected: `HTTP: 200` (if demo data seeded) or `HTTP: 403` (clinic isolation — also OK, means API is working)

### 3.4 Frontend check

```bash
curl -I http://localhost:80
```

Expected: `HTTP/1.1 200 OK` (served by Nginx)

### 3.5 Check frontend loads runtime config correctly

Open `http://localhost` in a browser and verify:
- No "DEMO BUILD" banner is visible (production mode)
- The API base URL points to your backend

### 3.6 Quick smoke test script

Save and run this combined verification script:

```bash
#!/bin/bash
set -e

echo "=== DeepSynaps Deployment Verification ==="
echo ""

echo "[1/5] Health check..."
curl -s http://localhost:8000/health | python3 -m json.tool
echo ""

echo "[2/5] Runtime config..."
curl -s http://localhost:8000/api/v1/system/runtime-config | python3 -m json.tool
echo ""

echo "[3/5] API endpoint response..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:8000/api/v1/multimodal/patients/demo-001/timeline?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001")
echo "Timeline endpoint: HTTP $STATUS (200 or 403 = OK)"
echo ""

echo "[4/5] Frontend (Nginx)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost)
echo "Frontend: HTTP $STATUS (200 = OK)"
echo ""

echo "[5/5] Docker containers..."
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "=== Verification complete ==="
```

---

## Step 4: First Clinic Onboarding (5 min)

After deployment, seed your first clinic with initial data.

### 4.1 Create the first clinic

```bash
# Connect to the PostgreSQL container
docker compose exec db psql -U deepsynaps -d deepsynaps -c "
INSERT INTO patient_access (patient_id, clinic_id, clinician_id, access_level, ai_analysis_consent)
VALUES
  ('patient-001', 'clinic-001', 'clinician-001', 'read', 1),
  ('patient-002', 'clinic-001', 'clinician-001', 'read', 1),
  ('patient-001', 'clinic-001', 'clinicadmin-001', 'admin', 1);
"
```

### 4.2 Insert sample multimodal events

```bash
docker compose exec db psql -U deepsynaps -d deepsynaps -c "
INSERT INTO multimodal_events (
  event_id, patient_id, event_type, modality, source_system, source_record_id,
  timestamp, value_summary, numeric_features, textual_summary, confidence, data_quality
) VALUES
  ('evt_demo_001', 'patient-001', 'assessment', 'assessment', 'EMR', 'rec-001',
   '2024-01-15T09:00:00', 'PHQ-9 score: 12',
   '{\"phq9_total\": 12}', 'Moderate depression symptoms', 0.85, 'high'),
  ('evt_demo_002', 'patient-001', 'qeeg', 'qeeg', 'QEEG Lab', 'rec-002',
   '2024-01-15T10:00:00', 'Theta power: 2.3uV',
   '{\"theta_power\": 2.3}', 'Elevated theta in frontal regions', 0.78, 'high');
"
```

### 4.3 Verify clinic onboarding

```bash
# Test timeline endpoint with the seeded patient
curl "http://localhost:8000/api/v1/multimodal/patients/patient-001/timeline?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001" | python3 -m json.tool
```

Expected: A JSON response with timeline events.

### 4.4 Verify clinic dashboard summary

```bash
curl "http://localhost:8000/api/v1/summary/clinic-dashboard?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001" | python3 -m json.tool
```

Expected: Clinic dashboard with aggregate counts.

---

## Troubleshooting

### "Cannot start service api: port 8000 is already allocated"

```bash
# Find what's using port 8000
sudo lsof -i :8000
# Kill it, or change the port mapping in docker-compose.yml:
# ports:
#   - "8080:8000"   # Use 8080 on host
```

### "db service is unhealthy"

```bash
# Check PostgreSQL logs
docker compose logs db

# Verify credentials
docker compose exec db psql -U deepsynaps -d deepsynaps -c "SELECT 1;"
```

### "api service keeps restarting"

```bash
# Check the API logs for the actual error
docker compose logs --tail 50 api

# Common causes:
# - DATABASE_URL not set correctly
# - SECRET_KEY too short (< 32 chars)
# - DEEPSYNAPS_APP_ENV=production with SQLite (blocked)
```

### Frontend shows "DEMO BUILD" banner in production

```bash
# Check .env
grep DEEPSYNAPS_DEMO_MODE .env
# Must be: DEEPSYNAPS_DEMO_MODE=false

# Rebuild and restart if changed
docker compose down
docker compose up -d
```

### Database tables don't exist

```bash
# The API auto-creates tables on startup via startup_event.
# If missing, restart the API container:
docker compose restart api

# Or manually check:
docker compose exec db psql -U deepsynaps -d deepsynaps -c "\dt"
```

---

## Upgrade / Redeploy

```bash
# Pull latest code
git pull origin main

# Rebuild the frontend
cd apps/web && npm install && npm run build && cd ../..

# Rebuild and restart containers
docker compose down
docker compose up -d --build

# Verify
curl http://localhost:8000/health
```

---

## Useful Commands

```bash
# Restart a single service
docker compose restart api

# Scale API (if needed — requires load balancer)
docker compose up -d --scale api=3

# View resource usage
docker stats

# Backup PostgreSQL
docker compose exec db pg_dump -U deepsynaps deepsynaps > backup_$(date +%Y%m%d).sql

# Restore PostgreSQL
docker compose exec -T db psql -U deepsynaps -d deepsynaps < backup_20240115.sql

# Redis CLI
docker compose exec redis redis-cli

# Flush Redis cache
docker compose exec redis redis-cli FLUSHDB

# View API environment inside container
docker compose exec api env | grep DEEPSYNAPS

# Tail API logs with filter
docker compose logs -f api | grep ERROR

# Stop everything
docker compose down

# Stop everything including volumes (DELETES DATA)
docker compose down -v
```

---

## Architecture Reference

```
                    ┌─────────────────┐
                    │   User Browser   │
                    └────────┬────────┘
                             │ HTTP (port 80)
                    ┌────────▼────────┐
                    │   Nginx (web)    │  Serves static frontend
                    └────────┬────────┘
                             │ Proxy pass (port 8000)
                    ┌────────▼────────┐
                    │  FastAPI (api)   │  Python 3.11 + Uvicorn
                    │  Port: 8000      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
      ┌──────────┐   ┌──────────┐   ┌──────────┐
      │PostgreSQL│   │  Redis   │   │GZip Mid. │
      │Port 5432 │   │Port 6379 │   │(auto)    │
      └──────────┘   └──────────┘   └──────────┘
```

| Service | Container Name | Port | Image |
|---------|---------------|------|-------|
| API | `deepsynaps-api` | `8000` | Built from `Dockerfile` |
| Web | `deepsynaps-web` | `80` | `nginx:1.27-alpine` |
| DB | `deepsynaps-db` | `5432` | `postgres:15-alpine` |
| Cache | `deepsynaps-redis` | `6379` | `redis:7-alpine` |
