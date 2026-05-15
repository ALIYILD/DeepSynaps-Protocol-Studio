# DeepSynaps Protocol Studio — Production Setup Quickstart

> **Purpose:** Step-by-step guide for setting up a new production instance  
> **Audience:** DevOps engineers, SREs, platform operators  
> **Prerequisites:** Basic knowledge of Fly.io, Docker, Python, and PostgreSQL  
> **Last Updated:** 2026-05-14

---

## Table of Contents

1. [Prerequisites Checklist](#1-prerequisites-checklist)
2. [Environment Setup](#2-environment-setup)
3. [Database Initialization](#3-database-initialization)
4. [First Deployment](#4-first-deployment)
5. [Verification Steps](#5-verification-steps)
6. [Common Issues and Solutions](#6-common-issues-and-solutions)
7. [Links to All Runbooks](#7-links-to-all-runbooks)

---

## 1. Prerequisites Checklist

Before starting, ensure you have:

### 1.1 Required Tools

| Tool | Version | Installation | Verify |
|------|---------|--------------|--------|
| **flyctl** | Latest | `brew install flyctl` or [docs](https://fly.io/docs/hands-on/install-flyctl/) | `fly version` |
| **Docker** | 24.x+ | [docker.com](https://docs.docker.com/get-docker/) | `docker --version` |
| **Python** | 3.11+ | `pyenv` or `python.org` | `python --version` |
| **uv** | Latest | `pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh` | `uv --version` |
| **Git** | 2.40+ | `brew install git` or `git-scm.com` | `git --version` |
| **OpenSSL** | 3.x | Included with most systems | `openssl version` |

### 1.2 Accounts and Access

- [ ] **Fly.io account** with payment method configured
- [ ] **Fly.io authentication**: `fly auth login` (verify with `fly orgs list`)
- [ ] **Git access** to the repository: `git@github.com:your-org/DeepSynaps-Protocol-Studio.git`
- [ ] **Stripe account** (if payments enabled)
- [ ] **Sentry account** (if error tracking enabled)
- [ ] **Domain name** configured (optional — Fly.io provides `.fly.dev`)

### 1.3 Repository Setup

```bash
# Clone the repository
git clone git@github.com:your-org/DeepSynaps-Protocol-Studio.git
cd DeepSynaps-Protocol-Studio

# Verify repository structure
ls -la apps/api apps/web packages/ scripts/
```

### 1.4 Local Environment Verification

```bash
# Verify Python works
python --version  # Should be 3.11+

# Verify uv works
uv --version

# Install backend packages locally (for scripts)
python -m pip install -e ./packages/core-schema \
  -e ./packages/condition-registry \
  -e ./packages/modality-registry \
  -e ./packages/device-registry \
  -e ./packages/safety-engine \
  -e ./packages/generation-engine \
  -e ./packages/render-engine \
  -e ./apps/api

# Verify local backend starts
uvicorn app.main:app --reload --app-dir apps/api
# (Should start without errors; Ctrl+C to stop)

# Verify frontend builds
cd apps/web
npm install
npm run build
# (Should complete without errors)
```

---

## 2. Environment Setup

### 2.1 Create the Fly.io App

```bash
# Create the application (one-time)
fly apps create deepsynaps-studio

# Verify app was created
fly status --app deepsynaps-studio
# (Will show "No machines configured" — that's expected)
```

### 2.2 Create Persistent Volume

```bash
# Create a persistent volume for SQLite, media, and backups
# Size: start with 3GB (adjust as needed)
fly volumes create deepsynaps_data \
  --size 3 \
  --region lhr \
  --app deepsynaps-studio

# Verify volume created
fly volumes list --app deepsynaps-studio
```

### 2.3 Generate Secret Keys

```bash
# These are CRITICAL — save them in your password manager!

# JWT secret key (256-bit)
export JWT_SECRET=$(openssl rand -hex 32)
echo "JWT_SECRET_KEY: $JWT_SECRET"

# Fernet key for settings/2FA encryption
export SECRETS_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
echo "DEEPSYNAPS_SECRETS_KEY: $SECRETS_KEY"

# Fernet key for wearable token encryption
export WEARABLE_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
echo "WEARABLE_TOKEN_ENC_KEY: $WEARABLE_KEY"
```

**IMPORTANT:** Save these keys in a secure location (password manager, vault). **They cannot be recovered if lost.** Losing them means:
- All JWT tokens invalidate (all users must re-login)
- All 2FA secrets are lost (users must reconfigure 2FA)
- All wearable OAuth tokens become unreadable

### 2.4 Set Required Secrets

```bash
# Required secrets — the app will FAIL TO BOOT without these

# 1. JWT Secret
fly secrets set JWT_SECRET_KEY="$JWT_SECRET" --app deepsynaps-studio

# 2. Fernet key for settings encryption
fly secrets set DEEPSYNAPS_SECRETS_KEY="$SECRETS_KEY" --app deepsynaps-studio

# 3. Database URL (SQLite on persistent volume)
fly secrets set DEEPSYNAPS_DATABASE_URL="sqlite:////data/deepsynaps_protocol_studio.db" --app deepsynaps-studio

# 4. CORS origins (your frontend URL)
fly secrets set DEEPSYNAPS_CORS_ORIGINS="https://your-frontend.netlify.app,https://your-custom-domain.com" --app deepsynaps-studio

# 5. App URL (for Stripe redirects)
fly secrets set APP_URL="https://your-frontend.netlify.app" --app deepsynaps-studio

# 6. Media storage root (on persistent volume)
fly secrets set MEDIA_STORAGE_ROOT="/data/media_uploads" --app deepsynaps-studio

# 7. Wearable token encryption key
fly secrets set WEARABLE_TOKEN_ENC_KEY="$WEARABLE_KEY" --app deepsynaps-studio
```

### 2.5 Set Optional Secrets

Configure based on which features you need:

```bash
# --- Payments (Stripe) ---
fly secrets set STRIPE_SECRET_KEY="sk_live_YOUR_KEY" --app deepsynaps-studio
fly secrets set STRIPE_PUBLISHABLE_KEY="pk_live_YOUR_KEY" --app deepsynaps-studio
fly secrets set STRIPE_WEBHOOK_SECRET="whsec_YOUR_SECRET" --app deepsynaps-studio

# --- AI Services ---
fly secrets set ANTHROPIC_API_KEY="sk-ant-YOUR_KEY" --app deepsynaps-studio
fly secrets set OPENAI_API_KEY="sk-YOUR_KEY" --app deepsynaps-studio

# --- Error Tracking ---
fly secrets set SENTRY_DSN="https://YOUR_DSN@sentry.io/PROJECT" --app deepsynaps-studio

# --- Async Workers (Redis) ---
# HIGHLY RECOMMENDED for production
# Create Redis first: fly redis create --name deepsynaps-redis --region lhr
fly secrets set CELERY_BROKER_URL="redis://default:PASSWORD@HOST:6379" --app deepsynaps-studio

# --- Rate Limiting (Redis) ---
fly secrets set DEEPSYNAPS_LIMITER_REDIS_URI="redis://default:PASSWORD@HOST:6379/1" --app deepsynaps-studio

# --- Telegram (optional) ---
fly secrets set TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN" --app deepsynaps-studio

# --- Clinical NLP (optional) ---
# fly secrets set OPENMED_BASE_URL="https://api.openmed.example.com/v1" --app deepsynaps-studio
```

### 2.6 Verify All Secrets

```bash
# List all secrets (names only — values are encrypted)
fly secrets list --app deepsynaps-studio

# You should see at minimum:
# - JWT_SECRET_KEY
# - DEEPSYNAPS_SECRETS_KEY
# - DEEPSYNAPS_DATABASE_URL
# - DEEPSYNAPS_CORS_ORIGINS
# - APP_URL
# - MEDIA_STORAGE_ROOT
# - WEARABLE_TOKEN_ENC_KEY
```

### 2.7 Environment Configuration Summary

```bash
# Optional: Set a non-default region
# fly regions set ams --app deepsynaps-studio  # If not LHR

# The following are set in fly.toml (no secrets needed):
# - DEEPSYNAPS_APP_ENV=production
# - DEEPSYNAPS_API_HOST=0.0.0.0
# - DEEPSYNAPS_API_PORT=8080
# - DEEPSYNAPS_LOG_LEVEL=INFO
# - MRI_DEMO_MODE=1
# - EVIDENCE_DB_PATH=/data/evidence.db
# - DEEPSYNAPS_VOICE_DIR=/data/voice
# - WHISPER_MODEL=base
# - DEEPSYNAPS_VOICE_WARMUP=1
```

---

## 3. Database Initialization

### 3.1 First Deploy (Schema Creation)

The first deployment will run database migrations automatically via the `release_command` in `fly.toml`.

```bash
# First deployment — migrations will run automatically
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
  --app deepsynaps-studio

# Monitor the deployment
fly status --app deepsynaps-studio
fly logs --app deepsynaps-studio
```

**What happens during first deploy:**
1. Fly.io builds Docker image from `apps/api/Dockerfile`
2. Runs `release_command` (Alembic migrations): creates all tables
3. Starts the FastAPI app process
4. Health checks begin

### 3.2 Verify Database Created

```bash
# Wait 60 seconds for startup
sleep 60

# Check database exists
fly ssh console --app deepsynaps-studio -C \
  "ls -la /data/*.db"

# Check tables created
fly ssh console --app deepsynaps-studio -C \
  "sqlite3 /data/deepsynaps_protocol_studio.db '.tables'"

# Verify integrity
fly ssh console --app deepsynaps-studio -C \
  "sqlite3 /data/deepsynaps_protocol_studio.db 'PRAGMA integrity_check;'"
```

### 3.3 Seed Clinical Data

```bash
# Run the clinical database seeder
fly ssh console --app deepsynaps-studio -C \
  "cd /app && python scripts/seed_demo.py"

# Or run locally with production database (if you have access):
# DEEPSYNAPS_DATABASE_URL="sqlite:////data/deepsynaps_protocol_studio.db" \
#   uv run python scripts/seed_demo.py
```

### 3.4 Create Evidence Database (Optional)

```bash
# The evidence database is used for research/literature features
# It will return 503 until populated — this is expected behavior

# To populate evidence DB (requires evidence ingestion setup):
# fly ssh console --app deepsynaps-studio -C \
#   "cd /app && python scripts/populate_evidence.py"
```

### 3.5 Set Up Backups

```bash
# Create initial backup
fly ssh console --app deepsynaps-studio -C \
  "mkdir -p /data/backups && sqlite3 /data/deepsynaps_protocol_studio.db \
   '.backup /data/backups/deepsynaps_protocol_studio_$(date +%Y%m%d_%H%M%S).db'"

# Verify backup
fly ssh console --app deepsynaps-studio -C \
  "ls -la /data/backups/"

# Set up automated backups (recommended: cron job or scheduled GitHub Action)
# See scripts/backup_database.py for the backup script
```

---

## 4. First Deployment

### 4.1 Deploy the API

```bash
# Deploy from repository root
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
  --app deepsynaps-studio

# Monitor deployment progress
fly status --app deepsynaps-studio

# Watch logs
fly logs --app deepsynaps-studio
```

**Deployment will:**
1. Build Docker image
2. Run database migrations (`alembic upgrade head`)
3. Start API server on port 8080
4. Start qEEG worker
5. Start Stripe worker

### 4.2 Deploy the Frontend (Netlify)

```bash
# Build the frontend
cd apps/web
npm install
npm run build

# Deploy to Netlify (requires Netlify CLI)
# npm install -g netlify-cli
# netlify login
# netlify deploy --prod --dir=dist

# Or use the deploy script from repo root:
cd ../..
bash scripts/deploy-preview.sh
# This deploys the preview site; for production:
# netlify deploy --prod --dir=apps/web/dist
```

**Netlify Configuration:**

Ensure `netlify.toml` is configured:
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/api/*"
  to = "https://deepsynaps-studio.fly.dev/api/:splat"
  status = 200

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### 4.3 Verify Deployment Status

```bash
# Check all machines are running
fly status --app deepsynaps-studio

# Expected output shows:
# - app process: running (1 machine)
# - qeeg_worker process: running (1 machine)
# - stripe_worker process: running (1 machine)
```

---

## 5. Verification Steps

### 5.1 Basic Health Check

```bash
# Test health endpoint
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# Expected response:
# {
#   "status": "healthy",
#   "database": { "status": "connected", "type": "sqlite" },
#   "version": "0.1.0",
#   "environment": "production"
# }
```

### 5.2 Authentication Verification

```bash
# Test with demo tokens (configured in auth system)

# Guest access
curl -s https://deepsynaps-studio.fly.dev/api/v1/registries/conditions \
  -H "Authorization: Bearer guest-demo-token" | jq . | head -10

# Clinician access
curl -s https://deepsynaps-studio.fly.dev/api/v1/registries/conditions \
  -H "Authorization: Bearer clinician-demo-token" | jq . | head -10

# Admin access
curl -s https://deepsynaps-studio.fly.dev/api/v1/registries/conditions \
  -H "Authorization: Bearer admin-demo-token" | jq . | head -10
```

**Expected:** Each request should return a JSON array of conditions (or appropriate data).

### 5.3 Full Smoke Test

```bash
# Run the production smoke test
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "clinician-demo-token" \
  --require-pdf

# Expected results:
# - execution_mode: celery (or sync if no Redis)
# - analysis_status: completed
# - report_html_generated: true
# - report_pdf_generated: true
```

### 5.4 Frontend Verification

```bash
# Verify frontend loads
open https://your-frontend.netlify.app

# Check that:
# - [ ] Page loads without errors
# - [ ] Can log in with demo tokens
# - [ ] Can navigate to conditions registry
# - [ ] API calls succeed (check browser Network tab)
# - [ ] No CORS errors in console
```

### 5.5 Worker Verification

```bash
# Check worker logs
fly logs --app deepsynaps-studio | grep -i "celery\|worker" | tail -20

# Look for:
# - Worker started messages
# - No error/stack trace messages
# - Task processing messages

# Check Stripe worker
fly logs --app deepsynaps-studio | grep -i "stripe" | tail -10
```

### 5.6 Runtime Snapshot

```bash
# Generate a runtime snapshot (validates system health)
fly ssh console --app deepsynaps-studio -C \
  "cd /app && python scripts/write_runtime_snapshot.py"

# Verify snapshot created
fly ssh console --app deepsynaps-studio -C \
  "cat /data/snapshots/clinical-database/runtime-readiness.json"
```

### 5.7 Post-Deployment Sign-Off

```markdown
## Production Setup Sign-Off

**Date:** [YYYY-MM-DD]
**Deployed by:** [Name]
**App:** deepsynaps-studio.fly.dev
**Frontend:** [Netlify URL]

### Verification Results
- [ ] Health endpoint: PASS
- [ ] Authentication (all roles): PASS
- [ ] Smoke test: PASS
- [ ] Frontend loads: PASS
- [ ] Workers active: PASS
- [ ] Runtime snapshot: PASS
- [ ] Backups configured: PASS

### Known Limitations
- [ ] Evidence DB not populated (expected)
- [ ] [Any other known items]

### Next Steps
- [ ] Configure monitoring alerts
- [ ] Set up PagerDuty/OpsGenie
- [ ] On-call rotation setup
- [ ] Load testing
```

---

## 6. Common Issues and Solutions

### 6.1 "App refuses to boot" / Crash Loop

**Symptoms:** `fly status` shows machines as `failed` or constantly restarting.

**Diagnosis:**
```bash
fly logs --app deepsynaps-studio | tail -50
```

**Common causes:**

| Error | Cause | Fix |
|-------|-------|-----|
| `JWT_SECRET_KEY must be set` | JWT secret not configured | `fly secrets set JWT_SECRET_KEY=$(openssl rand -hex 32)` |
| `DEEPSYNAPS_SECRETS_KEY must be set` | Fernet key missing | `fly secrets set DEEPSYNAPS_SECRETS_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")` |
| `database_url must not be empty` | DATABASE_URL not set | `fly secrets set DEEPSYNAPS_DATABASE_URL=sqlite:////data/deepsynaps_protocol_studio.db` |
| `ModuleNotFoundError` | PYTHONPATH issue | Check fly.toml worker process config |
| `Permission denied: /data` | Volume not mounted | Verify `fly.toml` mounts section and volume exists |
| `Address already in use` | Port conflict | Ensure `PORT=8080` env var is set |

### 6.2 "CORS errors" in Browser

**Symptoms:** Frontend shows `CORS policy` errors in console.

**Fix:**
```bash
# Update CORS origins to include your frontend URL
fly secrets set DEEPSYNAPS_CORS_ORIGINS="https://your-frontend.netlify.app,https://your-custom-domain.com" \
  --app deepsynaps-studio

# Verify (check logs for CORS-related messages)
fly logs --app deepsynaps-studio | grep -i "cors" | tail -10
```

### 6.3 "Database is locked" (SQLite)

**Symptoms:** API returns 500 with "database is locked" errors.

**Cause:** SQLite only supports one writer at a time. High concurrency causes lock contention.

**Immediate fix:**
```bash
# Restart the app to clear any stuck transactions
fly machine restart <machine-id> --app deepsynaps-studio
```

**Long-term fix:** Migrate to PostgreSQL (see [Capacity Planning](runbooks/capacity-planning.md)).

### 6.4 "Worker not processing jobs"

**Symptoms:** qEEG analysis status stays "pending" indefinitely.

**Diagnosis:**
```bash
# Check worker machine status
fly status --app deepsynaps-studio

# Check worker logs
fly logs --app deepsynaps-studio | grep -i "celery\|worker" | tail -30

# If Redis is configured, check connectivity
fly logs --app deepsynaps-studio | grep -i "redis\|broker" | tail -10
```

**Fix:**
```bash
# Restart worker machine
fly machine restart <worker-machine-id> --app deepsynaps-studio

# If Redis connection issues, verify CELERY_BROKER_URL
fly secrets list --app deepsynaps-studio | grep CELERY
```

### 6.5 "Out of Memory" (OOM) Errors

**Symptoms:** Workers or API killed; logs show `Killed process` or OOM messages.

**Fix:**
```bash
# Option 1: Scale VM memory (edit fly.toml)
# [[vm]]
#   processes = ["app"]
#   memory = "16gb"
#   cpu_kind = "performance"
#   cpus = 4

# Option 2: Reduce worker concurrency
# In fly.toml worker process, add --concurrency flag:
# qeeg_worker = "sh -c 'PYTHONPATH=/app/apps/api celery -A app.jobs worker --loglevel=INFO --without-gossip --without-mingle --concurrency=1'"

# Deploy changes
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

### 6.6 "Volume is full"

**Symptoms:** Uploads fail; database writes fail with disk full errors.

**Fix:**
```bash
# Check disk usage
fly ssh console --app deepsynaps-studio -C "df -h /data"

# Clean old backups (keep last 7 days)
fly ssh console --app deepsynaps-studio -C \
  "cd /data/backups && ls -t | tail -n +8 | xargs rm -f"

# Expand volume
fly volumes list --app deepsynaps-studio
fly volumes extend <volume-id> --size 10 --app deepsynaps-studio
```

### 6.7 "Alembic migration failed"

**Symptoms:** Deployment fails during `release_command`; migration error in logs.

**Fix:**
```bash
# Check migration status
fly ssh console --app deepsynaps-studio -C \
  "cd /app/apps/api && python -m alembic current"

# Check migration history
fly ssh console --app deepsynaps-studio -C \
  "cd /app/apps/api && python -m alembic history"

# If migration is partially applied, may need to manually fix:
# 1. Mark migration as applied (if it actually completed)
fly ssh console --app deepsynaps-studio -C \
  "cd /app/apps/api && python -m alembic stamp <revision>"

# 2. Or downgrade and retry
fly ssh console --app deepsynaps-studio -C \
  "cd /app/apps/api && python -m alembic downgrade -1"

# Then redeploy
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

### 6.8 "Sentry not receiving errors"

**Symptoms:** Errors in app but not showing in Sentry.

**Fix:**
```bash
# Verify SENTRY_DSN is set
fly secrets list --app deepsynaps-studio | grep SENTRY

# Verify DSN format (should not have trailing slash issues)
# Test with a manual error trigger

# Check if Sentry integration is working
fly logs --app deepsynaps-studio | grep -i "sentry" | tail -10
```

---

## 7. Links to All Runbooks

### Operational Runbooks

| Runbook | Purpose | When to Use |
|---------|---------|-------------|
| [Incident Response](runbooks/incident-response.md) | P1-P4 incident handling | Any production incident |
| [On-Call Playbook](runbooks/oncall-playbook.md) | Daily operational procedures | On-call shifts |
| [Capacity Planning](runbooks/capacity-planning.md) | Scaling decisions | Growth planning, resource issues |
| [Performance Tuning](runbooks/performance-tuning.md) | Optimization procedures | Slow performance, high resource usage |

### Process Documentation

| Document | Purpose | When to Use |
|----------|---------|-------------|
| [SLA Definition](operations/sla-definition.md) | Service level targets | Capacity planning, incident severity |
| [Change Management](operations/change-management.md) | Change approval process | Any production change |
| [Release Process](operations/release-process.md) | Deployment procedures | Every release |

### Architecture Documentation

| Document | Purpose | When to Use |
|----------|---------|-------------|
| [System Overview](architecture/system-overview.md) | Architecture reference | Design decisions, onboarding |

### External References

| Resource | URL |
|----------|-----|
| Fly.io Documentation | https://fly.io/docs/ |
| FastAPI Documentation | https://fastapi.tiangolo.com/ |
| Celery Documentation | https://docs.celeryq.dev/ |
| Alembic Documentation | https://alembic.sqlalchemy.org/ |
| SQLite Documentation | https://www.sqlite.org/docs.html |
| Sentry Documentation | https://docs.sentry.io/ |

---

## Quick Command Reference

```bash
# STATUS
fly status --app deepsynaps-studio
fly machine list --app deepsynaps-studio

# LOGS
fly logs --app deepsynaps-studio
fly logs --app deepsynaps-studio --recent

# DEPLOY
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile

# SECRETS
fly secrets list --app deepsynaps-studio
fly secrets set KEY=value --app deepsynaps-studio

# SSH
fly ssh console --app deepsynaps-studio
fly ssh console --app deepsynaps-studio -C "command"

# VOLUME
fly volumes list --app deepsynaps-studio
fly volumes extend <id> --size <gb> --app deepsynaps-studio

# RESTART
fly machine restart <id> --app deepsynaps-studio

# HEALTH
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# BACKUP
fly ssh console --app deepsynaps-studio -C \
  "sqlite3 /data/deepsynaps_protocol_studio.db '.backup /data/backups/manual_$(date +%Y%m%d_%H%M%S).db'"

# SMOKE TEST
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "clinician-demo-token" \
  --require-pdf
```

---

## Support

For issues not covered in this guide:

1. Check the [Incident Response Runbook](runbooks/incident-response.md)
2. Review [Fly.io Status](https://status.fly.io/)
3. Check application logs: `fly logs --app deepsynaps-studio`
4. Contact the SRE team via `#incidents` Slack channel
