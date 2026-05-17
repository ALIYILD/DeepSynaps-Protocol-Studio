# DeepSynaps Protocol Studio — Master Deployment Plan

> **Version**: 1.0.0
> **Date**: 2026-05-17
> **Status**: Production-Ready Deployment Topology Defined
> **Repository**: `ALIYILD/DeepSynaps-Protocol-Studio`

---

## 1. Executive Summary

DeepSynaps Protocol Studio is a clinical neuromodulation platform comprising a **React frontend**, **FastAPI backend**, **Celery async workers**, **PostgreSQL database**, and **20+ internal Python packages**. This document provides the canonical deployment plan.

### Deployment Topology

```
                    [User]
                      |
              +-------+-------+
              |               |
        [Netlify]       [Fly.io]
     (Frontend SPA)    (API + Workers)
         |                  |
    apps/web/dist    +------+------+
                     |      |      |
                  [app] [qeeg] [stripe]
                  HTTP   Celery  Cron
                  API   Worker  Job
                     |      |      |
                     +------+------+
                            |
                   [PostgreSQL]  [Redis]
                   (Main DB)    (Queue)
                            |
                     [Fly Volume]
                        /data
                   (evidence.db)
```

| Component | Platform | App Name | Region |
|-----------|----------|----------|--------|
| **Frontend** | Netlify | `deepsynaps-studio-preview` | Global CDN |
| **API Server** | Fly.io | `deepsynaps-studio` | `lhr` (London) |
| **qEEG Worker** | Fly.io (process) | `deepsynaps-studio` | `lhr` |
| **Stripe Worker** | Fly.io (process) | `deepsynaps-studio` | `lhr` |
| **PostgreSQL** | Fly.io Postgres | Attached to app | `lhr` |
| **Redis** | Fly.io Redis / Upstash | Celery broker | `lhr` |
| **Persistent Data** | Fly Volume | `deepsynaps_data` | `lhr` |

---

## 2. Prerequisites

### 2.1 Required Tools

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| `flyctl` | latest | Fly.io CLI | `brew install flyctl` or [docs](https://fly.io/docs/hands-on/install-flyctl/) |
| `node` | 20.x | Frontend build | `nvm install 20` |
| `npm` | 10.x | Package management | bundled with node |
| `python` | 3.11+ | Backend runtime | `pyenv install 3.11` |
| `docker` | latest | Container builds | [Docker Desktop](https://docs.docker.com/get-docker/) |
| `git` | latest | Source control | `brew install git` |

### 2.2 Accounts & Access

| Service | Account Needed | Role |
|---------|---------------|------|
| Fly.io | Personal/Org | App deployment, volumes, secrets |
| Netlify | Personal/Team | Frontend hosting |
| GitHub | `ALIYILD` | CI/CD, repo access |
| Stripe | Business account | Payment processing (optional) |
| Sentry | Project DSN | Error tracking (optional) |

### 2.3 Repository Setup

```bash
# Clone the repository
git clone https://github.com/ALIYILD/DeepSynaps-Protocol-Studio.git
cd DeepSynaps-Protocol-Studio

# Install frontend dependencies
npm install --no-audit --no-fund

# Install backend packages (requires uv or pip)
# Option A: uv (recommended)
pip install uv
uv pip install -e ./packages/core-schema -e ./packages/condition-registry \
  -e ./packages/modality-registry -e ./packages/device-registry \
  -e ./packages/safety-engine -e ./packages/generation-engine \
  -e ./packages/render-engine -e ./packages/evidence -e ./packages/qa \
  -e ./packages/qeeg-pipeline -e ./packages/mri-pipeline \
  -e ./packages/neuro-engine -e ./packages/biometrics-pipeline \
  -e ./packages/deeptwin-neuroai-lab -e ./apps/api

# Option B: pip
pip install -e ./packages/* -e ./apps/api
```

---

## 3. Infrastructure Setup

### 3.1 Fly.io App Creation

```bash
# Login to Fly.io
fly auth login

# Create the app (only needed ONCE for first deploy)
fly apps create deepsynaps-studio

# Create the persistent volume (only needed ONCE)
# Size: 1GB initially, can scale up
fly volumes create deepsynaps_data --region lhr --size 1 --app deepsynaps-studio

# Create PostgreSQL cluster (only needed ONCE)
fly postgres create --name deepsynaps-db --region lhr --vm-size shared-cpu-1x --initial-cluster-size 1 --volume-size 1

# Attach Postgres to app (saves DATABASE_URL as secret automatically)
fly postgres attach --app deepsynaps-studio deepsynaps-db

# Create Redis (Upstash) for Celery broker
fly redis create --name deepsynaps-redis --region lhr --plan free
```

### 3.2 Required Secrets

Set ALL required secrets before first deploy:

```bash
# Core secrets (REQUIRED)
fly secrets set --app deepsynaps-studio \
  DEEPSYNAPS_DATABASE_URL="postgres://..." \
  JWT_SECRET_KEY="your-64-char-random-secret-key-here-minimum-32-chars-long" \
  DEEPSYNAPS_SECRETS_KEY="your-fernet-key-here" \
  DEEPSYNAPS_CORS_ORIGINS="https://deepsynaps-studio-preview.netlify.app,https://deepsynaps-studio.fly.dev"

# Stripe (REQUIRED for payments)
fly secrets set --app deepsynaps-studio \
  STRIPE_SECRET_KEY="sk_live_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..."

# Redis/Celery (REQUIRED for async workers)
fly secrets set --app deepsynaps-studio \
  CELERY_BROKER_URL="redis://default:...@fly-upstash-redis..."

# Wearable integrations (REQUIRED before enabling real wearable OAuth)
fly secrets set --app deepsynaps-studio \
  WEARABLE_TOKEN_ENC_KEY="your-fernet-key-for-wearable-tokens"

# Optional: Sentry error tracking
fly secrets set --app deepsynaps-studio \
  SENTRY_DSN="https://...@sentry.io/..."

# Optional: Rate limiting Redis
fly secrets set --app deepsynaps-studio \
  DEEPSYNAPS_LIMITER_REDIS_URI="redis://default:...@..."

# Verify all secrets are set
fly secrets list --app deepsynaps-studio
```

### 3.3 Netlify Site Setup

```bash
# Option 1: Netlify CLI
npm install -g netlify-cli
netlify login
netlify sites:create --name deepsynaps-studio-preview

# Link to repo for auto-deploys
netlify link

# Set environment variables
netlify env:set NODE_VERSION 20
netlify env:set VITE_ENABLE_DEMO 1
netlify env:set VITE_API_BASE_URL https://deepsynaps-studio.fly.dev

# Option 2: Netlify Dashboard
# 1. Go to https://app.netlify.com/
# 2. "Add new site" -> "Import from GitHub"
# 3. Select `ALIYILD/DeepSynaps-Protocol-Studio`
# 4. Build command: `npm install --no-audit --no-fund && npm run build:web`
# 5. Publish directory: `apps/web/dist`
# 6. Environment variables: Add all VITE_* vars
```

---

## 4. Deployment Procedures

### 4.1 Full Production Deploy

```bash
# Step 1: Pull latest code
git pull origin main

# Step 2: Run tests locally (gate)
python3.11 -m pytest apps/api/tests/ -q --tb=short
npm run test:unit

# Step 3: Deploy API (Fly.io)
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile

# Step 4: Deploy Frontend (Netlify - auto from git push)
git push origin main
# OR manual:
netlify deploy --prod --dir=apps/web/dist

# Step 5: Verify deployment
curl https://deepsynaps-studio.fly.dev/health
curl https://deepsynaps-studio.fly.dev/api/v1/openapi.json
```

### 4.2 API-Only Deploy (Backend Updates)

```bash
# Use the canonical deploy script
bash scripts/deploy-preview.sh --api

# OR manually
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
  --app deepsynaps-studio

# Monitor deploy
fly logs --app deepsynaps-studio

# Verify
fly status --app deepsynaps-studio
```

### 4.3 Frontend-Only Deploy

```bash
# Build locally first
npm run build:web

# Deploy to Netlify
netlify deploy --prod --dir=apps/web/dist

# Or push to main (auto-deploy via Git hook)
git push origin main
```

### 4.4 Rollback Procedure

```bash
# API Rollback (Fly.io)
fly releases list --app deepsynaps-studio
fly deploy --image registry.fly.io/deepsynaps-studio:<previous-version> --app deepsynaps-studio

# Frontend Rollback (Netlify)
# Via dashboard: Site -> Deploys -> Select previous deploy -> Publish
# Via CLI:
netlify deploys:list --site=<site-id>
netlify deploys:publish --site=<site-id> --prod --deploy-id=<previous-id>

# Emergency: Scale to 0 and back
fly scale count 0 --app deepsynaps-studio
fly scale count 1 --app deepsynaps-studio
```

---

## 5. Application Configuration

### 5.1 Fly.toml (Canonical — `apps/api/fly.toml`)

```toml
app = "deepsynaps-studio"
primary_region = "lhr"

[build]
  context = "../.."
  dockerfile = "../../apps/api/Dockerfile"

[env]
  DEEPSYNAPS_APP_ENV = "production"
  DEEPSYNAPS_API_HOST = "0.0.0.0"
  DEEPSYNAPS_API_PORT = "8080"
  DEEPSYNAPS_LOG_LEVEL = "INFO"
  PORT = "8080"
  MRI_DEMO_MODE = "1"
  EVIDENCE_DB_PATH = "/data/evidence.db"
  DEEPSYNAPS_VOICE_DIR = "/data/voice"
  WHISPER_MODEL = "base"
  DEEPSYNAPS_VOICE_WARMUP = "1"

[processes]
  app = "uvicorn app.main:app --host 0.0.0.0 --port 8080 --app-dir apps/api"
  qeeg_worker = "sh -c 'PYTHONPATH=/app/apps/api celery -A app.jobs worker --loglevel=INFO --without-gossip --without-mingle'"
  stripe_worker = "sh -c 'while true; do python scripts/retry_stripe_webhooks.py; sleep 300; done'"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [http_service.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

  [[http_service.checks]]
    grace_period = "10s"
    interval = "15s"
    method = "GET"
    timeout = "5s"
    path = "/health"

[deploy]
  release_command = "sh -c 'cd /app/apps/api && python -m alembic upgrade head'"

[[vm]]
  processes = ["app"]
  memory = "8gb"
  cpu_kind = "performance"
  cpus = 4

[[vm]]
  processes = ["qeeg_worker", "stripe_worker"]
  memory = "1gb"
  cpu_kind = "shared"
  cpus = 1

[[mounts]]
  source = "deepsynaps_data"
  destination = "/data"
  initial_size = "1gb"
```

### 5.2 Environment Variables Reference

| Variable | Required | Source | Description |
|----------|----------|--------|-------------|
| `DEEPSYNAPS_DATABASE_URL` | ✅ | Fly Postgres | PostgreSQL connection string |
| `JWT_SECRET_KEY` | ✅ | Manual secret | JWT signing key (min 32 chars) |
| `DEEPSYNAPS_SECRETS_KEY` | ✅ | Manual secret | Fernet key for 2FA/auth secrets |
| `DEEPSYNAPS_CORS_ORIGINS` | ✅ | Manual secret | Allowed frontend origins |
| `STRIPE_SECRET_KEY` | ⚠️ Payments | Manual secret | Stripe live key |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ Payments | Manual secret | Stripe webhook signing |
| `CELERY_BROKER_URL` | ✅ | Fly Redis | Redis URL for Celery |
| `WEARABLE_TOKEN_ENC_KEY` | ⚠️ Wearables | Manual secret | Fernet key for wearable tokens |
| `SENTRY_DSN` | ❌ Optional | Sentry | Error tracking DSN |
| `DEEPSYNAPS_LIMITER_REDIS_URI` | ❌ Optional | Fly Redis | Rate limiting backend |
| `EVIDENCE_DB_PATH` | ✅ | fly.toml | SQLite path on volume |
| `WHISPER_MODEL` | ✅ | fly.toml | Whisper ASR model size |
| `MRI_DEMO_MODE` | ✅ | fly.toml | MRI demo fallback flag |

### 5.3 Docker Build (Multi-Stage)

```dockerfile
# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
RUN npm ci
COPY apps/web ./apps/web
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build:web

# Stage 2: Python runtime
FROM python:3.11-slim
WORKDIR /app

# WeasyPrint native deps (for PDF rendering)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangoft2-1.0-0 libcairo2 \
    libgdk-pixbuf-2.0-0 libharfbuzz0b libffi8 \
    shared-mime-info fonts-liberation fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Install all packages
COPY packages ./packages
COPY apps/api ./apps/api
COPY pyproject.toml ./
COPY data ./data
COPY services/evidence-pipeline ./services/evidence-pipeline

RUN pip install --no-cache-dir \
    -e ./packages/core-schema -e ./packages/condition-registry \
    -e ./packages/modality-registry -e ./packages/device-registry \
    -e ./packages/safety-engine -e ./packages/generation-engine \
    -e ./packages/render-engine -e ./packages/evidence -e ./packages/qa \
    -e ./packages/qeeg-pipeline -e ./packages/mri-pipeline \
    -e ./packages/neuro-engine -e ./packages/biometrics-pipeline \
    -e ./apps/api

RUN mkdir -p ./data/snapshots/clinical-database ./data/backups

# Copy built frontend
RUN rm -rf ./apps/web/dist 2>/dev/null || true
COPY --from=frontend-builder /app/apps/web/dist ./apps/web/dist

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--app-dir", "apps/api"]
```

---

## 6. Post-Deployment Steps

### 6.1 Database Migrations

Migrations run automatically via the `release_command` in fly.toml. For manual runs:

```bash
# SSH into the app
fly ssh console --app deepsynaps-studio

# Run migrations manually
cd /app/apps/api && python -m alembic upgrade head

# Check current revision
python -m alembic current

# Rollback one step (emergency)
python -m alembic downgrade -1
```

### 6.2 Evidence Pipeline Setup

```bash
# Populate the evidence database (first-time only)
fly ssh console --app deepsynaps-studio -C \
  'python3 /app/services/evidence-pipeline/ingest.py --all --unpaywall'

# Verify evidence endpoints work
curl https://deepsynaps-studio.fly.dev/api/v1/evidence/health
```

### 6.3 Health Check Verification

```bash
# Main health endpoint
curl https://deepsynaps-studio.fly.dev/health

# API discovery
curl https://deepsynaps-studio.fly.dev/api/v1/openapi.json

# Knowledge layer status
curl https://deepsynaps-studio.fly.dev/api/v1/knowledge/status

# Frontend loads
curl https://deepsynaps-studio-preview.netlify.app/
```

### 6.4 SSL / HTTPS

- **Fly.io**: HTTPS is automatic via `force_https = true` in fly.toml
- **Netlify**: HTTPS is automatic via Let's Encrypt
- **Custom domain**: Set DNS A/AAAA records to Fly IPs + CNAME for Netlify

---

## 7. CI/CD Pipeline

### 7.1 GitHub Actions Workflows

Located in `.github/workflows/`:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | PR / Push | Lint, typecheck, unit tests |
| `build.yml` | Push to main | Build Docker image, push to registry |
| `deploy-netlify.yml` | Push to main | Deploy frontend to Netlify |
| `deploy-blue-green.yml` | Manual | Blue-green API deployment |
| `e2e.yml` | PR / Schedule | Playwright E2E tests |
| `sast.yml` | PR | Static application security testing |
| `dast.yml` | Schedule | Dynamic application security testing |
| `security-scan.yml` | PR | Dependency vulnerability scan |
| `load-test.yml` | Manual | Performance/load testing |
| `coverage.yml` | PR | Code coverage reporting |
| `rollback.yml` | Manual | Emergency rollback procedure |

### 7.2 Deploy Flow

```
git push origin main
       |
       v
[GitHub Actions]
       |
       +---> [CI] Lint + Test + Typecheck
       |
       +---> [Build] Docker image -> Fly registry
       |
       +---> [Netlify] Build web -> Deploy
       |
       +---> [Fly] Deploy API + Workers
       |
       v
[Production Live]
```

---

## 8. Monitoring & Observability

### 8.1 Health Endpoints

| Endpoint | Returns | Use |
|----------|---------|-----|
| `GET /health` | `{"status": "ok"}` | Load balancer health check |
| `GET /api/v1/knowledge/status` | Adapter health JSON | Knowledge layer diagnostics |
| `GET /api/v1/openapi.json` | OpenAPI spec | API documentation |

### 8.2 Logs

```bash
# Live API logs
fly logs --app deepsynaps-studio

# Filter for errors
fly logs --app deepsynaps-studio | grep ERROR

# qEEG worker logs
fly logs --app deepsynaps-studio --instance=<worker-id>

# SSH for interactive debugging
fly ssh console --app deepsynaps-studio
```

### 8.3 Metrics (Prometheus)

- Endpoint: `/metrics` (if enabled)
- Key metrics: Request rate, latency, error rate, active connections
- Workers: Queue depth, processed jobs, failed jobs

### 8.4 Error Tracking (Sentry)

- Set `SENTRY_DSN` secret to enable automatic error tracking
- Captures: API exceptions, worker failures, frontend errors

---

## 9. Scaling

### 9.1 Vertical Scaling (More Resources)

```bash
# Scale API VM (e.g., 8GB -> 16GB)
fly scale memory 16384 --app deepsynaps-studio --process-group app

# Scale CPU
fly scale cpus 8 --app deepsynaps-studio --process-group app
```

### 9.2 Horizontal Scaling (More Instances)

```bash
# Run 2 API instances
fly scale count 2 --app deepsynaps-studio --process-group app

# Scale workers
fly scale count 3 --app deepsynaps-studio --process-group qeeg_worker
```

### 9.3 Volume Scaling

```bash
# Current volume info
fly volumes list --app deepsynaps-studio

# Extend volume (create new, migrate data, swap)
# Fly volumes are immutable — extend by creating larger volume + data migration
```

---

## 10. Knowledge Layer Post-Deploy

### 10.1 Initialize Knowledge Layer Adapters

```bash
# SSH into the app
fly ssh console --app deepsynaps-studio

# Trigger sync for all P0 adapters
curl -X POST http://localhost:8080/api/v1/knowledge/sync/rxnorm
curl -X POST http://localhost:8080/api/v1/knowledge/sync/pharmgkb
curl -X POST http://localhost:8080/api/v1/knowledge/sync/clinvar
curl -X POST http://localhost:8080/api/v1/knowledge/sync/loinc
curl -X POST http://localhost:8080/api/v1/knowledge/sync/openfda
curl -X POST http://localhost:8080/api/v1/knowledge/sync/chbmp
curl -X POST http://localhost:8080/api/v1/knowledge/sync/mni_atlas
curl -X POST http://localhost:8080/api/v1/knowledge/sync/promis
curl -X POST http://localhost:8080/api/v1/knowledge/sync/simnibs

# Check adapter health
curl http://localhost:8080/api/v1/knowledge/status
```

### 10.2 Verify Analyzer Integration

```bash
# Test medication bridge
curl -X POST http://localhost:8080/api/v1/knowledge/medications/lookup \
  -H "Content-Type: application/json" \
  -d '{"name": "sertraline"}'

# Test gene-drug query
curl -X POST http://localhost:8080/api/v1/knowledge/pgx/gene-drug \
  -H "Content-Type: application/json" \
  -d '{"gene": "CYP2D6", "drug": "fluoxetine"}'

# Test adverse events (with caveats)
curl http://localhost:8080/api/v1/knowledge/medications/sertraline/interactions
```

---

## 11. Disaster Recovery

### 11.1 Database Backup

```bash
# Create backup via Fly Postgres
fly postgres backup create --app deepsynaps-db

# List backups
fly postgres backup list --app deepsynaps-db

# Restore from backup
fly postgres backup restore --app deepsynaps-db <backup-id>
```

### 11.2 Volume Backup

```bash
# Snapshot the persistent volume
fly volumes snapshots list --app deepsynaps-studio

# Restore from snapshot
fly volumes create deepsynaps_data_restored --region lhr --size 1 --snapshot-id <snapshot-id>
```

### 11.3 Full App Recreation

```bash
# If everything is lost, recreate:
fly apps create deepsynaps-studio-new
fly volumes create deepsynaps_data --region lhr --size 1 --app deepsynaps-studio-new
# Restore DB from backup
# Set all secrets
# Deploy
fly deploy --config apps/api/fly.toml --app deepsynaps-studio-new
```

---

## 12. Cost Estimates (Monthly)

| Service | Spec | Monthly Cost |
|---------|------|-------------|
| **Fly.io App (API)** | 4 CPU / 8 GB / performance | ~$80 (while running) |
| **Fly.io Workers** | 2 × shared-1x / 1 GB | ~$20 |
| **Fly Postgres** | shared-1x / 1 GB | ~$15 |
| **Fly Redis (Upstash)** | Free tier | $0 |
| **Fly Volume** | 1 GB | ~$3 |
| **Netlify** | Pro tier | $19 |
| **Sentry** | Developer | $0 |
| **Stripe** | Per-transaction | 2.9% + 30¢ |
| **TOTAL** | | **~$137/month** |

---

## 13. Checklist: First-Time Deploy

### Before Deploy
- [ ] `flyctl` installed and authenticated
- [ ] `netlify` CLI installed and authenticated
- [ ] `deepsynaps-studio` app created on Fly
- [ ] `deepsynaps_data` volume created
- [ ] `deepsynaps-db` Postgres created and attached
- [ ] `deepsynaps-redis` Redis created
- [ ] All secrets set (JWT, DB URL, Stripe, etc.)
- [ ] `npm install` completed locally
- [ ] `pytest` passes locally

### Deploy
- [ ] `fly deploy --config apps/api/fly.toml` succeeds
- [ ] Alembic migrations run successfully
- [ ] Health check `/health` returns 200
- [ ] Netlify site is live
- [ ] Frontend loads without errors
- [ ] API endpoints respond correctly
- [ ] Knowledge layer `/status` shows adapters

### Post-Deploy
- [ ] Evidence pipeline populated
- [ ] Stripe webhooks configured
- [ ] Sentry DSN set (optional)
- [ ] SSL certificates valid
- [ ] Logs flowing correctly
- [ ] CI/CD pipeline passing

---

## Quick Reference: Essential Commands

```bash
# Deploy API
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile

# Deploy Frontend (manual)
netlify deploy --prod --dir=apps/web/dist

# View logs
fly logs --app deepsynaps-studio

# View status
fly status --app deepsynaps-studio
fly releases list --app deepsynaps-studio

# Set secret
fly secrets set --app deepsynaps-studio KEY=value

# SSH into app
fly ssh console --app deepsynaps-studio

# Restart
fly apps restart deepsynaps-studio

# Scale
fly scale count 2 --app deepsynaps-studio --process-group app

# Rollback
fly releases list --app deepsynaps-studio
fly deploy --image registry.fly.io/deepsynaps-studio:<version>
```

---

*Document Version: 1.0.0*
*Last Updated: 2026-05-17*
*DeepSynaps Protocol Studio — Deployment Engineering*
