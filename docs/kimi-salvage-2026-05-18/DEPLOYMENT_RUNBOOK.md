# DeepSynaps Protocol Studio — Deployment Runbook

**Document ID:** DS-RUNBOOK-001
**Version:** 1.0.0
**Date:** 2026-05-17
**Classification:** INTERNAL — DEVOPS OPERATIONS
**Owner:** DevOps Lead
**Review Cycle:** Every deployment

---

## Table of Contents

1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [Local Development Deployment](#2-local-development-deployment)
3. [Docker Local Deployment](#3-docker-local-deployment)
4. [Staging Deployment](#4-staging-deployment)
5. [Production Deployment](#5-production-deployment)
6. [Verification Steps](#6-verification-steps)
7. [Rollback Procedure](#7-rollback-procedure)
8. [Post-Deployment Monitoring](#8-post-deployment-monitoring)
9. [Emergency Procedures](#9-emergency-procedures)
10. [Known Issues and Workarounds](#10-known-issues-and-workarounds)

---

## Document Control

| Version | Date | Author | Change Description |
|---------|------|--------|--------------------|
| 1.0.0 | 2026-05-17 | DevOps Team | Initial runbook covering all 4 deployment targets |

### Approval Signatures

| Role | Name | Date | Signature |
|------|------|------|-----------|
| DevOps Lead | | | _______________ |
| Security Lead | | | _______________ |
| Backend Lead | | | _______________ |
| Frontend Lead | | | _______________ |
| Clinical Safety Officer | | | _______________ |

---

## System Architecture Overview

```
                    +------------------+
                    |   SSL/TLS Term.  |
                    |   (Nginx/ALB)    |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   React + Vite   |  apps/web/    Port 3000/5173
                    |   (Frontend)     |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   FastAPI        |  apps/api/    Port 8000
                    |   (Backend)      |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
    +---------v----------+     +-----------v--------+
    |   PostgreSQL       |     |   Redis (opt.)     |
    |   (Primary DB)     |     |   (Caching)        |
    +--------------------+     +--------------------+
```

**Technology Stack:**
- **Backend:** Python 3.11+, FastAPI 0.104+, SQLAlchemy (SQLite dev/test, PostgreSQL prod), optional Redis 7+
- **Frontend:** React 18+, Vite 5+, React Router 6+, Tailwind CSS 3+, Playwright 1.45+
- **Infrastructure:** Docker 24+, Docker Compose 2.20+, Nginx/ALB for SSL

**Current Readiness Status:** NOT READY FOR PRODUCTION (5.2/10)
- 24 P0 blockers must be resolved before ANY deployment
- 55 P1 items must be resolved before GA
- 64 P2 items tracked for beta period

---

## 1. Pre-Deployment Checklist

### 1.1 Pre-Deployment Gate Checklist

All items must be checked before proceeding to any deployment target.

#### Infrastructure Prerequisites

- [ ] **P0-I1 RESOLVED** — `Dockerfile` exists at `apps/api/Dockerfile` and builds successfully
  - **File:** `apps/api/Dockerfile`
  - **Owner:** DevOps
  - **Verification:** `docker build -t deepsynaps-api:test apps/api/`
  - **Effort:** 4h

- [ ] **P0-I2 RESOLVED** — `docker-compose.yml` exists at repository root
  - **File:** `docker-compose.yml`
  - **Owner:** DevOps
  - **Verification:** `docker-compose up --build` starts all services
  - **Effort:** 2h

- [ ] **P0-I3 RESOLVED** — `.dockerignore` exists at repository root
  - **File:** `.dockerignore`
  - **Verification:** Build context < 50MB, no secrets in context
  - **Effort:** 1h

- [ ] **P0-I6 RESOLVED** — All Python dependencies pinned with `==` in `requirements.lock`
  - **File:** `apps/api/requirements.lock`
  - **Verification:** `pip install -r requirements.lock` succeeds with no version conflicts
  - **Effort:** 2h

- [ ] **P0-I4 RESOLVED** — Source maps disabled in production build
  - **File:** `apps/web/vite.config.js`
  - **Verification:** `build.sourcemap === false` in production mode
  - **Effort:** 1h

- [ ] **P0-I5 RESOLVED** — PostgreSQL connection pooling implemented
  - **File:** `apps/api/src/deepsynaps/database.py`
  - **Verification:** Connection pool active with min 5 / max 20 connections
  - **Effort:** 4h

- [ ] **README.md** created and accurate at repository root
  - **File:** `README.md`
  - **Owner:** Technical Writer
  - **Acceptance Criteria:** Setup, run, and test instructions verified by engineer unfamiliar with codebase
  - **Effort:** 3h

- [ ] **package-lock.json** committed and up-to-date
  - **File:** `apps/web/package-lock.json`
  - **Verification:** `npm ci` succeeds without generating new lock file changes
  - **Effort:** 0.5h

- [ ] **SSL/TLS certificates** ready for target environment
  - **Staging:** Let's Encrypt or internal CA
  - **Production:** Valid commercial or Let's Encrypt certificate
  - **File:** `apps/api/certs/` or environment-provided
  - **Owner:** DevOps
  - **Effort:** 2h

#### Security Prerequisites

- [ ] **P0-S1 RESOLVED** — Prefix-based role spoofing eliminated
  - **File:** `apps/api/src/deepsynaps/access_control.py`, lines 325-342
  - **Verification:** Role `superadmin-hacker-001` receives `403 Forbidden`
  - **Effort:** 3h

- [ ] **P0-S2 RESOLVED** — Demo banner non-dismissible
  - **File:** `apps/web/src/components/DemoModeBanner.jsx`, lines 72-105
  - **Verification:** `sessionStorage.clear()` + refresh = banner still visible
  - **Effort:** 2h

- [ ] **P0-S3 RESOLVED** — Default role fallback changed to "none"
  - **File:** `apps/api/src/deepsynaps/access_control.py`, line 342
  - **Verification:** Unrecognized user gets `403 Forbidden`, not clinician access
  - **Effort:** 2h

- [ ] **P0-S4 RESOLVED** — Export endpoint checks `can_export` permission
  - **File:** `apps/api/src/deepsynaps/main.py`, lines 1000-1058
  - **Verification:** User without `can_export` gets `403 Forbidden` on export
  - **Effort:** 3h

- [ ] **P0-S5 RESOLVED** — Regex bug fixed in safety governance
  - **File:** `apps/api/src/deepsynaps/safety_governance.py`, line 21
  - **Verification:** `re.escape()` used for literal string matching
  - **Effort:** 1h

- [ ] **Security scan clean** — `bandit` passes with no HIGH/CRITICAL findings
  - **Command:** `bandit -r apps/api/src/ -f json -o bandit-report.json`
  - **Acceptance:** Severity HIGH count = 0
  - **Effort:** 1h

- [ ] **Safety scan clean** — `safety check` passes with no CVE findings
  - **Command:** `safety check -r apps/api/requirements.lock`
  - **Acceptance:** No CVE findings in dependencies
  - **Effort:** 1h

#### Backend Stability Prerequisites

- [ ] **P0-B1 RESOLVED** — `logger` defined before use in `main.py`
  - **File:** `apps/api/src/deepsynaps/main.py`, module scope
  - **Verification:** `python -c "from main import app; print('ok')"` exits 0
  - **Effort:** 1h

- [ ] **P0-B2 RESOLVED** — All imports use relative form
  - **File:** `apps/api/src/deepsynaps/__init__.py`
  - **Verification:** `python -c "from deepsynaps import main; print('ok')"` exits 0
  - **Effort:** 2h

- [ ] **P0-B3 RESOLVED** — DB query methods have try/except
  - **File:** `apps/api/src/deepsynaps/deeptwin_review.py`, lines 246-534
  - **Verification:** DB failure returns `503 Service Unavailable`, not 500
  - **Effort:** 4h

- [ ] **P0-B4 RESOLVED** — `get_knowledge_layer()` uses thread-safe singleton
  - **File:** `apps/api/src/deepsynaps/main.py`, lines 28-33
  - **Verification:** `threading.Lock()` protects singleton creation
  - **Effort:** 3h

#### Frontend Stability Prerequisites

- [ ] **P0-F1 RESOLVED** — React Error Boundaries implemented
  - **File:** `apps/web/src/main.jsx`
  - **Verification:** Throwing test error in child component shows fallback UI, not white screen
  - **Effort:** 4h

- [ ] **P0-F2 RESOLVED** — Hardcoded demo data removed
  - **File:** `apps/web/src/pages-deeptwin/DeepTwinPage.jsx`, lines 45-91
  - **Verification:** `DEEPSYNAPS_DEMO_MODE=false` + production build = no synthetic data
  - **Effort:** 3h

- [ ] **P0-F3 RESOLVED** — Error states render in UI
  - **File:** `apps/web/src/pages-deeptwin/DeepTwinPage.jsx`
  - **Verification:** API 500 error displays user-visible error message
  - **Effort:** 1h

- [ ] **P0-F4 RESOLVED** — Error boundary around SynthesisDashboard
  - **File:** `apps/web/src/components/SynthesisDashboard.jsx`, lines 174-434
  - **Verification:** Child component crash shows error fallback, not white screen
  - **Effort:** 3h

- [ ] **P0-F5 RESOLVED** — XSS via JSON.stringify eliminated
  - **File:** `apps/web/src/components/TimelineView.jsx`, lines 235-237
  - **Verification:** `DOMPurify.sanitize()` or safe rendering before DOM insertion
  - **Effort:** 1h

- [ ] **P0-F6 RESOLVED** — Fetch timeout on all API calls
  - **File:** `apps/web/src/api.js`
  - **Verification:** Network delay > 10s triggers timeout error, not indefinite hang
  - **Effort:** 2h

- [ ] **P0-F7 RESOLVED** — Path traversal in download filename fixed
  - **File:** `apps/web/src/components/ReportHandoff.jsx`, line 32
  - **Verification:** `patientId` sanitized with regex `[a-zA-Z0-9_-]+`
  - **Effort:** 1h

#### Documentation Prerequisites

- [ ] **P0-D1 RESOLVED** — README.md exists at repository root
  - **File:** `README.md`
  - **Verification:** New engineer can set up and run from README alone
  - **Effort:** 3h

- [ ] **P0-D2 RESOLVED** — Role names correct in all docs
  - **File:** `FINAL_LAUNCH_RECOMMENDATION.md`
  - **Verification:** Role names match `access_control.py` source exactly
  - **Effort:** 1h

#### Test Prerequisites

- [ ] **All backend tests passing**
  - **Command:** `cd apps/api && pytest tests/ -q --tb=short`
  - **Acceptance:** Exit code 0, all assertions pass
  - **Estimated time:** 2-3 minutes

- [ ] **All E2E tests passing**
  - **Command:** `cd apps/web && npx playwright test`
  - **Acceptance:** Exit code 0, all scenarios pass across chromium, firefox, mobile
  - **Estimated time:** 5-10 minutes

- [ ] **Test coverage threshold met**
  - **Target:** Line coverage >= 60% for all modified modules
  - **Command:** `pytest --cov=apps/api/src/deepsynaps --cov-report=term-missing`

#### Database Prerequisites

- [ ] **Database migration plan documented**
  - **File:** `docs/deployment/sqlite_to_postgres_migration.md`
  - **Verification:** Migration script tested on staging database clone
  - **Effort:** 4h

- [ ] **Database indexes created**
  - **File:** `apps/api/src/deepsynaps/database.py`, lines 195-237
  - **Verification:** All 8 indexes listed in `_INDEX_STATEMENTS` exist on target database
  - **Command:** Verify with `\di` (PostgreSQL) or `.indexes` (SQLite)

- [ ] **Materialized views configured (PostgreSQL only)**
  - **File:** `apps/api/src/deepsynaps/materialized_views.py`
  - **Verification:** `/api/v1/system/materialized-views/status` returns `available: true`

#### Environment & Configuration

- [ ] **Environment variables configured for target**
  - **File:** `.env` (copied from `.env.example`)
  - **Verification:** All required variables set (see Section 2.4)

- [ ] **Backup strategy confirmed**
  - **Staging:** Daily automated snapshot
  - **Production:** Continuous backup + point-in-time recovery
  - **Owner:** DevOps
  - **RPO:** 1 hour (production), 24 hours (staging)
  - **RTO:** 4 hours (production), 8 hours (staging)

- [ ] **Rollback plan documented** (this document, Section 7)
  - **Owner:** DevOps
  - **Acceptance:** Rollback can execute within 15 minutes of decision

- [ ] **Monitoring configured**
  - **Tool:** Prometheus + Grafana (or Datadog/New Relic)
  - **Dashboards:** API latency, error rate, DB connections, cache hit rate
  - **Alerts:** PagerDuty/Opsgenie integration
  - **Owner:** DevOps

- [ ] **On-call rotation confirmed**
  - **Primary:** Name + phone + Slack handle
  - **Secondary:** Name + phone + Slack handle
  - **Escalation:** Name + phone + Slack handle
  - **Clinical Safety Officer:** Name + phone (for safety incidents)

### 1.2 Environment-Specific Checklist

| Environment | P0 Resolved | P1 Resolved | P2 Tracked | Docker | K8s/ECS | SSL | Go/No-Go |
|-------------|:-----------:|:-----------:|:----------:|:------:|:-------:|:---:|:--------:|
| Local Dev | [ ] 24/24 | N/A | N/A | Optional | No | No | 24 P0 |
| Docker Local | [ ] 24/24 | N/A | N/A | Required | No | No | 24 P0 + Docker |
| Staging | [ ] 24/24 | [ ] 20/55 | [ ] 0/64 | Required | Required | Yes | 24 P0 + 20 P1 |
| Production Beta | [ ] 24/24 | [ ] 40/55 | [ ] 30/64 | Required | Required | Yes | 24 P0 + 40 P1 |
| Production GA | [ ] 24/24 | [ ] 55/55 | [ ] 50/64 | Required | Required | Yes | ALL |

---

## 2. Local Development Deployment

### 2.1 Prerequisites

| Requirement | Version | Command to Verify |
|-------------|---------|-------------------|
| Python | 3.11+ | `python3 --version` |
| Node.js | 20.x LTS | `node --version` |
| npm | 10.x | `npm --version` |
| Git | 2.40+ | `git --version` |
| Docker (optional) | 24+ | `docker --version` |
| jq | 1.7+ | `jq --version` |
| curl | 8+ | `curl --version` |

### 2.2 Step-by-Step Deployment

#### Step 1: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/your-org/DeepSynaps-Protocol-Studio.git
cd DeepSynaps-Protocol-Studio

# Verify directory structure
ls -la apps/api/ apps/web/
```

**Expected output:**
```
apps/api/:
src/  tests/  requirements.txt

apps/web/:
src/  e2e/  tests/  package.json  vite.config.js  playwright.config.ts
```

#### Step 2: Set Up Python Environment

```bash
# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
# macOS/Linux:
source .venv/bin/activate
# Windows (Git Bash):
# source .venv/Scripts/activate

# Verify virtual environment
which python
# Expected: /path/to/DeepSynaps-Protocol-Studio/.venv/bin/python

# Install pinned dependencies
pip install --upgrade pip
pip install -r apps/api/requirements.lock

# Verify FastAPI installation
python -c "import fastapi; print(f'FastAPI {fastapi.__version__}')"
# Expected: FastAPI 0.104.0 or higher
```

**Note:** If `requirements.lock` does not exist yet (P0-I6 not resolved), use:
```bash
pip install -r apps/api/requirements.txt
```
**This is NOT recommended for production deployments.**

#### Step 3: Set Up Frontend

```bash
# Navigate to frontend directory
cd apps/web

# Install exact dependencies from lock file
npm ci

# Verify installation
npm list react react-dom vite --depth=0
# Expected: react@18.3.x, react-dom@18.3.x, vite@5.3.x

# Return to project root
cd ../..
```

#### Step 4: Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your local values
# Minimum required for local development:
cat > .env << 'EOF'
# ── App Environment ─────────────────────────────────────────────
DEEPSYNAPS_APP_ENV=development

# ── Database (SQLite for local dev) ─────────────────────────────
DEEPSYNAPS_DB=deepsynaps_local.db
DATABASE_URL=

# ── GZip Compression ──────────────────────────────────────────
DEEPSYNAPS_ENABLE_GZIP=true
DEEPSYNAPS_GZIP_MINIMUM_SIZE=1024

# ── Demo Mode ──────────────────────────────────────────────────
DEEPSYNAPS_DEMO_MODE=false
DEEPSYNAPS_DEMO_CLINIC_SEED=false

# ── CORS Origins ───────────────────────────────────────────────
DEEPSYNAPS_CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# ── Logging ────────────────────────────────────────────────────
DEEPSYNAPS_LOG_LEVEL=INFO
EOF
```

#### Step 5: Initialize Database

```bash
# Activate virtual environment if not already active
source .venv/bin/activate

# Initialize database tables and indexes
cd apps/api/src/deepsynaps
python -c "
from database import connect, init_all_tables
conn = connect()
init_all_tables(conn)
print('Database initialized successfully')
conn.close()
"

cd ../../../..
```

#### Step 6: Start Backend Server

```bash
# Terminal 1: Start FastAPI backend
cd apps/api/src/deepsynaps
source ../../../../.venv/bin/activate
uvicorn main:app --reload --port 8000 --host 0.0.0.0
```

**Expected output:**
```
INFO:     Will watch for changes in these directories: [...]
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [...]
```

#### Step 7: Start Frontend Dev Server

```bash
# Terminal 2: Start React frontend
cd apps/web
npm run dev
```

**Expected output:**
```
  VITE v5.3.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
  ➜  press h + enter to show help
```

#### Step 8: Verify Local Deployment

```bash
# Terminal 3: Run verification checks

# 1. Health check
curl -s http://localhost:8000/health | jq .

# Expected response:
# {
#   "status": "ok",
#   "phase": "4",
#   "modules": ["timeline", "correlation", "confound", "evidence", "hypothesis", "missing_data", "deeptwin_snapshot", "deeptwin_review", "deeptwin_export"]
# }

# 2. Runtime config (no secrets exposed)
curl -s http://localhost:8000/api/v1/system/runtime-config | jq .

# 3. Frontend loads
curl -s http://localhost:3000/ | head -20

# 4. OpenAPI docs accessible
curl -s http://localhost:8000/docs | head -5
# Expected: <!DOCTYPE html> (Swagger UI)
```

#### Step 9: Run Test Suite

```bash
# Backend tests
source .venv/bin/activate
cd apps/api
pytest tests/ -q --tb=short
# Expected: passed (all test modules)

# Frontend unit tests
cd apps/web
npm run test
# Expected: all tests passing

# E2E tests (requires both servers running)
npx playwright test --project=chromium
# Expected: all scenarios passing
```

### 2.3 Environment Variable Reference (Local Dev)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEEPSYNAPS_APP_ENV` | Yes | `development` | Must be `development` for local |
| `DEEPSYNAPS_DB` | Yes | `deepsynaps.db` | SQLite file path |
| `DATABASE_URL` | No | (empty) | Leave empty for SQLite |
| `DEEPSYNAPS_ENABLE_GZIP` | No | `true` | Enable response compression |
| `DEEPSYNAPS_DEMO_MODE` | No | `false` | Disable for real data |
| `DEEPSYNAPS_DEMO_CLINIC_SEED` | No | `false` | Never enable with real data |
| `DEEPSYNAPS_CORS_ORIGINS` | No | `http://localhost:3000` | Frontend origin(s) |
| `DEEPSYNAPS_LOG_LEVEL` | No | `INFO` | Logging verbosity |

### 2.4 Troubleshooting: Local Dev

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ModuleNotFoundError: No module named 'deepsynaps'` | Not in correct directory | `cd apps/api/src/deepsynaps` before `uvicorn` |
| `ImportError: attempted relative import with no known parent package` | Running wrong file directly | Use `uvicorn main:app`, not `python main.py` |
| `port already in use` | Port 8000 or 3000 occupied | `lsof -ti:8000 \| xargs kill -9` then retry |
| `npm ERR! code ELOCKVERIFY` | package-lock.json out of sync | `cd apps/web && rm -rf node_modules package-lock.json && npm install` |
| Database tables missing | `init_all_tables()` not called | Run Step 5 initialization script |
| Frontend shows CORS errors | `DEEPSYNAPS_CORS_ORIGINS` missing frontend URL | Add `http://localhost:3000` to .env |

---

## 3. Docker Local Deployment

### 3.1 Required Files

Before proceeding, ensure these files exist:

| File | Status (Pre-P0) | Owner |
|------|----------------|-------|
| `apps/api/Dockerfile` | DOES NOT EXIST — P0-I1 | DevOps |
| `apps/web/Dockerfile` | DOES NOT EXIST — P0-I1 | DevOps |
| `docker-compose.yml` | DOES NOT EXIST — P0-I2 | DevOps |
| `.dockerignore` | DOES NOT EXIST — P0-I3 | DevOps |
| `apps/api/requirements.lock` | DOES NOT EXIST — P0-I6 | DevOps |

### 3.2 Step 1: Create Required Docker Files

#### `apps/api/Dockerfile`

```dockerfile
# ── DeepSynaps API Dockerfile ──────────────────────────────────────────
# Multi-stage build for production-ready FastAPI container.
# Stage 1: Builder (compiles dependencies)
# Stage 2: Runtime (minimal image with app only)

# ── Builder Stage ──────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.lock .
RUN pip install --no-cache-dir --user -r requirements.lock

# ── Runtime Stage ──────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Create non-root user for security
RUN groupadd -r deepsynaps && useradd -r -g deepsynaps deepsynaps

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /root/.local /home/deepsynaps/.local
ENV PATH=/home/deepsynaps/.local/bin:$PATH

# Copy application code
COPY src/deepsynaps/ ./deepsynaps/

# Set Python path
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Switch to non-root user
USER deepsynaps

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "deepsynaps.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### `apps/web/Dockerfile`

```dockerfile
# ── DeepSynaps Web Frontend Dockerfile ─────────────────────────────────
# Multi-stage: build with Node, serve with Nginx

# ── Build Stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Production Stage ───────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runtime

# Copy built assets
COPY --from=builder /build/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### `nginx.conf` (for web container)

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1024;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # SPA routing — redirect all to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API proxy (if serving from same domain)
    location /api/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### `.dockerignore`

```
# Git
.git/
.gitignore

# Python
__pycache__/
*.pyc
*.pyo
*.egg-info/
.venv/
venv/
env/
.pytest_cache/
.coverage
htmlcov/

# Node
node_modules/
npm-debug.log*
.yarn-error.log*

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Secrets
.env
.env.local
.env.production
*.pem
*.key

# Documentation (not needed in build)
docs/
*.md

# E2E results
e2e-results/
e2e-report/
test-results/

# Build artifacts (will be rebuilt)
dist/
build/
```

### 3.3 docker-compose.yml

```yaml
# ═══════════════════════════════════════════════════════════════════════════════
# DeepSynaps Protocol Studio — Docker Compose Stack
# ═══════════════════════════════════════════════════════════════════════════════
# Usage:
#   docker-compose up --build          # First time / after changes
#   docker-compose up -d               # Detached mode
#   docker-compose logs -f             # Follow logs
#   docker-compose down                # Stop all services
#   docker-compose down -v             # Stop AND remove volumes (DESTRUCTIVE)
#
# Environments: local, staging, production
# ═══════════════════════════════════════════════════════════════════════════════

version: "3.8"

services:
  # ── PostgreSQL Database ─────────────────────────────────────────────────
  db:
    image: postgres:15-alpine
    container_name: deepsynaps-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: deepsynaps
      POSTGRES_USER: deepsynaps
      POSTGRES_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD must be set in .env}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./apps/api/src/deepsynaps/database.py:/docker-entrypoint-initdb.d/init.sql:ro
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U deepsynaps -d deepsynaps"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - deepsynaps-network

  # ── Redis Cache (Optional) ──────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: deepsynaps-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - deepsynaps-network

  # ── FastAPI Backend ─────────────────────────────────────────────────────
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
      target: runtime
    container_name: deepsynaps-api
    restart: unless-stopped
    environment:
      DEEPSYNAPS_APP_ENV: ${DEEPSYNAPS_APP_ENV:-development}
      DATABASE_URL: postgresql://deepsynaps:${DB_PASSWORD}@db:5432/deepsynaps
      POSTGRES_POOL_SIZE: ${POSTGRES_POOL_SIZE:-10}
      POSTGRES_MAX_OVERFLOW: ${POSTGRES_MAX_OVERFLOW:-20}
      POSTGRES_POOL_RECYCLE: ${POSTGRES_POOL_RECYCLE:-3600}
      POSTGRES_POOL_PRE_PING: ${POSTGRES_POOL_PRE_PING:-true}
      DEEPSYNAPS_ENABLE_GZIP: ${DEEPSYNAPS_ENABLE_GZIP:-true}
      DEEPSYNAPS_GZIP_MINIMUM_SIZE: ${DEEPSYNAPS_GZIP_MINIMUM_SIZE:-1024}
      DEEPSYNAPS_DEMO_MODE: ${DEEPSYNAPS_DEMO_MODE:-false}
      DEEPSYNAPS_DEMO_CLINIC_SEED: ${DEEPSYNAPS_DEMO_CLINIC_SEED:-false}
      DEEPSYNAPS_CORS_ORIGINS: ${DEEPSYNAPS_CORS_ORIGINS:-http://localhost:3000}
      DEEPSYNAPS_LOG_LEVEL: ${DEEPSYNAPS_LOG_LEVEL:-INFO}
      REDIS_URL: redis://redis:6379/0
      DEEPSYNAPS_ENABLE_REDIS_CACHE: ${DEEPSYNAPS_ENABLE_REDIS_CACHE:-false}
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - deepsynaps-network

  # ── React Frontend ──────────────────────────────────────────────────────
  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
      target: runtime
    container_name: deepsynaps-web
    restart: unless-stopped
    environment:
      # Frontend env vars are baked at build time
      # Runtime config comes from /api/v1/system/runtime-config
      NODE_ENV: ${DEEPSYNAPS_APP_ENV:-development}
    ports:
      - "3000:80"
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:80/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s
    networks:
      - deepsynaps-network

volumes:
  postgres_data:
    name: deepsynaps-postgres-data
  redis_data:
    name: deepsynaps-redis-data

networks:
  deepsynaps-network:
    driver: bridge
    name: deepsynaps-network
```

### 3.4 Step 2: Create Environment File for Docker

```bash
# Create .env file for Docker Compose
cat > .env << 'EOF'
# ── Database ────────────────────────────────────────────────────
DB_PASSWORD=change-me-in-production-use-strong-password

# ── App Environment ─────────────────────────────────────────────
DEEPSYNAPS_APP_ENV=development

# ── GZip Compression ──────────────────────────────────────────
DEEPSYNAPS_ENABLE_GZIP=true
DEEPSYNAPS_GZIP_MINIMUM_SIZE=1024

# ── Demo Mode ──────────────────────────────────────────────────
DEEPSYNAPS_DEMO_MODE=false
DEEPSYNAPS_DEMO_CLINIC_SEED=false

# ── CORS Origins ───────────────────────────────────────────────
DEEPSYNAPS_CORS_ORIGINS=http://localhost:3000

# ── Logging ────────────────────────────────────────────────────
DEEPSYNAPS_LOG_LEVEL=INFO

# ── PostgreSQL Pool ────────────────────────────────────────────
POSTGRES_POOL_SIZE=10
POSTGRES_MAX_OVERFLOW=20
POSTGRES_POOL_RECYCLE=3600
POSTGRES_POOL_PRE_PING=true

# ── Redis ──────────────────────────────────────────────────────
DEEPSYNAPS_ENABLE_REDIS_CACHE=true
EOF

# Secure the .env file
chmod 600 .env
```

**WARNING:** Never commit `.env` to Git. The `.gitignore` should already exclude it.

### 3.5 Step 3: Build and Start the Stack

```bash
# Build all images and start containers
docker-compose up --build

# Or detached mode (background):
docker-compose up --build -d

# Verify all services are running
docker-compose ps

# Expected output:
# NAME              COMMAND                  SERVICE   STATUS    PORTS
# deepsynaps-api    "uvicorn deepsynaps.…"   api       running   0.0.0.0:8000->8000/tcp
# deepsynaps-db     "docker-entrypoint.s…"   db        running   0.0.0.0:5432->5432/tcp
# deepsynaps-redis  "redis-server --appe…"   redis     running   0.0.0.0:6379->6379/tcp
# deepsynaps-web    "nginx -g 'daemon of…"  web       running   0.0.0.0:3000->80/tcp
```

### 3.6 Step 4: Verify Docker Deployment

```bash
# 1. Health check — API
curl -s http://localhost:8000/health | jq .
# Expected: {"status": "ok", "phase": "4", ...}

# 2. Health check — Database connectivity (via API)
curl -s http://localhost:8000/api/v1/system/materialized-views/status \
  -H "X-Clinic-ID: clinic-test" \
  -G -d "clinician_id=admin-test" | jq .

# 3. Frontend loads
curl -s http://localhost:3000/ | head -5
# Expected: <!DOCTYPE html>

# 4. Container health status
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# 5. Logs (if issues)
docker-compose logs api --tail=50
docker-compose logs web --tail=20
docker-compose logs db --tail=20
```

### 3.7 Step 5: Run Tests in Docker

```bash
# Backend tests inside API container
docker-compose exec api python -m pytest -q

# Or run with coverage
docker-compose exec api python -m pytest --cov=deepsynaps --cov-report=term-missing -q

# E2E tests (from host, requires both services running)
cd apps/web && npx playwright test --project=chromium

# Or run E2E against the Docker frontend
cd apps/web
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test --project=chromium
```

### 3.8 Docker Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `Bind mount failed` | Path mismatch | Verify `docker-compose.yml` paths match repo structure |
| `port already allocated` | Port 8000/3000/5432/6379 in use | `lsof -ti:8000 \| xargs kill -9` or change ports in compose |
| `DB_PASSWORD must be set` | Missing env var | Ensure `.env` exists and is loaded |
| `api container restarting` | Health check failing | `docker-compose logs api` to see startup error |
| `web container restarting` | Nginx config error | Check `nginx.conf` syntax with `nginx -t` |
| Database connection refused | API starts before DB ready | `depends_on` with `condition: service_healthy` handles this |
| Slow first build | No layer cache | Normal — subsequent builds use cache |

### 3.9 Docker Commands Reference

```bash
# Start (with build)
docker-compose up --build -d

# Stop (preserve data)
docker-compose down

# Stop (DESTROY data volumes)
docker-compose down -v

# Restart single service
docker-compose restart api

# Rebuild single service
docker-compose up --build -d api

# View logs
docker-compose logs -f api          # Follow API logs
docker-compose logs -f web          # Follow web logs
docker-compose logs -f db           # Follow DB logs
docker-compose logs --tail=100      # Last 100 lines all services

# Shell into container
docker-compose exec api bash
docker-compose exec db psql -U deepsynaps -d deepsynaps

# Database backup from container
docker-compose exec db pg_dump -U deepsynaps deepsynaps > backup.sql

# Database restore to container
cat backup.sql | docker-compose exec -T db psql -U deepsynaps -d deepsynaps

# Resource usage
docker stats deepsynaps-api deepsynaps-web deepsynaps-db deepsynaps-redis

# Prune unused images (cleanup)
docker system prune -f
```

---

## 4. Staging Deployment

### 4.1 Staging Prerequisites

- [ ] All 24 P0 blockers resolved
- [ ] At least 20 of 55 P1 items resolved
- [ ] Docker images built and tagged
- [ ] Kubernetes cluster or ECS cluster provisioned
- [ ] SSL certificate for staging domain (`staging.deepsynaps.io`)
- [ ] PostgreSQL database provisioned (RDS, Cloud SQL, or managed)
- [ ] Redis cache provisioned (ElastiCache or managed)
- [ ] Monitoring stack deployed (Prometheus + Grafana or cloud equivalent)
- [ ] Log aggregation configured (CloudWatch, Datadog, or ELK)

### 4.2 Infrastructure Requirements

| Component | Specification | Purpose |
|-----------|--------------|---------|
| Kubernetes | 1.28+ or ECS Fargate | Container orchestration |
| Nodes | 2x t3.medium (minimum) | Compute |
| PostgreSQL | db.t3.medium or equivalent | Primary database |
| Redis | cache.t3.micro or equivalent | Session + query cache |
| Load Balancer | ALB or Nginx Ingress | SSL termination + routing |
| Object Storage | S3 or GCS | Export file storage |
| DNS | Route 53 or Cloudflare | Domain management |

### 4.3 Kubernetes Deployment

#### Namespace Configuration

```bash
# Create staging namespace
kubectl create namespace deepsynaps-staging

# Set context
kubectl config set-context --current --namespace=deepsynaps-staging
```

#### Secret Configuration

```bash
# Create secrets for staging
kubectl create secret generic deepsynaps-secrets \
  --namespace=deepsynaps-staging \
  --from-literal=DB_PASSWORD='your-staging-db-password' \
  --from-literal=JWT_SECRET='your-staging-jwt-secret-min-32-chars' \
  --from-literal=ENCRYPTION_KEY='your-staging-encryption-key' \
  --from-literal=REDIS_PASSWORD='your-staging-redis-password'
```

#### ConfigMap

```yaml
# k8s/staging/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: deepsynaps-config
  namespace: deepsynaps-staging
data:
  DEEPSYNAPS_APP_ENV: "staging"
  DEEPSYNAPS_ENABLE_GZIP: "true"
  DEEPSYNAPS_GZIP_MINIMUM_SIZE: "1024"
  DEEPSYNAPS_DEMO_MODE: "false"
  DEEPSYNAPS_DEMO_CLINIC_SEED: "false"
  DEEPSYNAPS_CORS_ORIGINS: "https://staging.deepsynaps.io"
  DEEPSYNAPS_LOG_LEVEL: "INFO"
  POSTGRES_POOL_SIZE: "10"
  POSTGRES_MAX_OVERFLOW: "20"
  POSTGRES_POOL_RECYCLE: "3600"
  POSTGRES_POOL_PRE_PING: "true"
  DEEPSYNAPS_ENABLE_REDIS_CACHE: "true"
```

Deploy:
```bash
kubectl apply -f k8s/staging/configmap.yaml
```

#### API Deployment

```yaml
# k8s/staging/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deepsynaps-api
  namespace: deepsynaps-staging
  labels:
    app: deepsynaps-api
    version: "4.0.0"
    env: staging
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: deepsynaps-api
  template:
    metadata:
      labels:
        app: deepsynaps-api
        version: "4.0.0"
        env: staging
    spec:
      containers:
        - name: api
          image: deepsynaps/api:4.0.0-staging
          ports:
            - containerPort: 8000
              name: http
          envFrom:
            - configMapRef:
                name: deepsynaps-config
          env:
            - name: DATABASE_URL
              value: "postgresql://deepsynaps:$(DB_PASSWORD)@postgres-staging:5432/deepsynaps"
            - name: REDIS_URL
              value: "redis://:$(REDIS_PASSWORD)@redis-staging:6379/0"
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: deepsynaps-secrets
                  key: DB_PASSWORD
            - name: REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: deepsynaps-secrets
                  key: REDIS_PASSWORD
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: deepsynaps-secrets
                  key: JWT_SECRET
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          securityContext:
            runAsNonRoot: true
            runAsUser: 999
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
---
apiVersion: v1
kind: Service
metadata:
  name: deepsynaps-api
  namespace: deepsynaps-staging
spec:
  selector:
    app: deepsynaps-api
  ports:
    - port: 80
      targetPort: 8000
      name: http
  type: ClusterIP
```

Deploy:
```bash
kubectl apply -f k8s/staging/api-deployment.yaml
```

#### Web Deployment

```yaml
# k8s/staging/web-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deepsynaps-web
  namespace: deepsynaps-staging
  labels:
    app: deepsynaps-web
    version: "4.0.0"
    env: staging
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: deepsynaps-web
  template:
    metadata:
      labels:
        app: deepsynaps-web
        version: "4.0.0"
        env: staging
    spec:
      containers:
        - name: web
          image: deepsynaps/web:4.0.0-staging
          ports:
            - containerPort: 80
              name: http
          resources:
            requests:
              memory: "64Mi"
              cpu: "100m"
            limits:
              memory: "128Mi"
              cpu: "200m"
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 10
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
---
apiVersion: v1
kind: Service
metadata:
  name: deepsynaps-web
  namespace: deepsynaps-staging
spec:
  selector:
    app: deepsynaps-web
  ports:
    - port: 80
      targetPort: 80
      name: http
  type: ClusterIP
```

Deploy:
```bash
kubectl apply -f k8s/staging/web-deployment.yaml
```

#### Ingress (SSL Termination)

```yaml
# k8s/staging/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: deepsynaps-ingress
  namespace: deepsynaps-staging
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
    cert-manager.io/cluster-issuer: "letsencrypt-staging"
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - staging.deepsynaps.io
        - api.staging.deepsynaps.io
      secretName: deepsynaps-staging-tls
  rules:
    - host: staging.deepsynaps.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: deepsynaps-web
                port:
                  number: 80
    - host: api.staging.deepsynaps.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: deepsynaps-api
                port:
                  number: 80
```

Deploy:
```bash
kubectl apply -f k8s/staging/ingress.yaml
```

#### Database Migration Job

```yaml
# k8s/staging/db-migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration-staging
  namespace: deepsynaps-staging
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migration
          image: deepsynaps/api:4.0.0-staging
          command:
            - python
            - -c
            - |
              from deepsynaps.database import connect, init_all_tables
              conn = connect()
              init_all_tables(conn)
              print("Database migration completed successfully")
              conn.close()
          envFrom:
            - configMapRef:
                name: deepsynaps-config
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: deepsynaps-secrets
                  key: DB_PASSWORD
                  # Full URL constructed in app
```

Run migration:
```bash
kubectl apply -f k8s/staging/db-migration-job.yaml

# Wait for completion
kubectl wait --for=condition=complete job/db-migration-staging --timeout=120s

# Check logs
kubectl logs job/db-migration-staging
```

### 4.4 Staging Verification Commands

```bash
# 1. Check all pods are running
kubectl get pods -n deepsynaps-staging

# 2. Check services
kubectl get svc -n deepsynaps-staging

# 3. Check ingress
kubectl get ingress -n deepsynaps-staging

# 4. Health check (external)
curl -s https://api.staging.deepsynaps.io/health | jq .

# 5. Frontend load (external)
curl -s https://staging.deepsynaps.io/ | head -5

# 6. Materialized views status
curl -s https://api.staging.deepsynaps.io/api/v1/system/materialized-views/status \
  -H "X-Clinic-ID: clinic-staging" \
  -G -d "clinician_id=admin-staging" | jq .

# 7. Check SSL certificate
echo | openssl s_client -servername staging.deepsynaps.io \
  -connect staging.deepsynaps.io:443 2>/dev/null | openssl x509 -noout -dates

# 8. Run E2E tests against staging
export PLAYWRIGHT_BASE_URL=https://staging.deepsynaps.io
export API_BASE_URL=https://api.staging.deepsynaps.io
cd apps/web && npx playwright test --project=chromium
```

### 4.5 Staging Monitoring Setup

#### Prometheus ServiceMonitor

```yaml
# k8s/staging/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: deepsynaps-api-metrics
  namespace: deepsynaps-staging
  labels:
    app: deepsynaps
spec:
  selector:
    matchLabels:
      app: deepsynaps-api
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

#### Grafana Dashboard Import

Import dashboard ID `9614` (FastAPI) and configure with Prometheus datasource.

---

## 5. Production Deployment

### 5.1 Production Prerequisites

- [ ] All 24 P0 blockers resolved
- [ ] All 55 P1 items resolved
- [ ] Penetration testing completed (no critical findings)
- [ ] Clinical safety review signed off
- [ ] SOC2 or HIPAA compliance review completed (if applicable)
- [ ] SSL certificate for production domain (`deepsynaps.io`)
- [ ] Disaster recovery plan tested
- [ ] On-call rotation established with clinical safety officer
- [ ] Blue/green deployment infrastructure ready

### 5.2 Production Infrastructure Requirements

| Component | Specification | Purpose |
|-----------|--------------|---------|
| Kubernetes | 1.28+ | Container orchestration |
| Nodes | 3x t3.large (minimum) | Compute (HA) |
| PostgreSQL | db.r5.large Multi-AZ | Primary database (HA) |
| Redis | cache.r5.large cluster | Session + query cache (HA) |
| Load Balancer | ALB with WAF | SSL + DDoS protection |
| Object Storage | S3 with versioning | Export files + backups |
| CDN | CloudFront or Cloudflare | Static asset delivery |
| DNS | Route 53 with health checks | Failover routing |
| Monitoring | Prometheus + Grafana + PagerDuty | Full observability |

### 5.3 Blue/Green Deployment Strategy

```
  Traffic (100%)
       |
   +---v----+
   |  LB    |
   +---+----+
       |
   +---v-----------+      +-----------+
   |  Blue (live)  |      |  Green    |
   |  v4.0.0       |      |  v4.0.1   |
   |  Replicas: 3  |      |  v4.0.1   |
   +---------------+      +-----------+
```

### 5.4 Production Deployment Steps

#### Pre-Deployment (T-60 minutes)

**Step 1: Announce deployment window**
```bash
# Post in #deployments Slack channel
# Notify on-call: Primary, Secondary, Clinical Safety Officer
```

**Step 2: Verify current state**
```bash
# Check current version
curl -s https://api.deepsynaps.io/health | jq .

# Check current pods
kubectl get pods -n deepsynaps-production -l app=deepsynaps-api

# Check error rate (last 1 hour)
# Grafana: https://grafana.deepsynaps.io/d/deepsynaps/api-dashboard?from=now-1h&to=now
```

**Step 3: Database backup**
```bash
# Create point-in-time snapshot (AWS RDS)
aws rds create-db-snapshot \
  --db-instance-identifier deepsynaps-production \
  --db-snapshot-identifier pre-deploy-$(date +%Y%m%d-%H%M%S)

# Verify snapshot completion
aws rds wait db-snapshot-available \
  --db-snapshot-identifier pre-deploy-$(date +%Y%m%d-%H%M%S)
```

#### Database Migration (T-30 minutes)

**Step 4: Run database migration (green environment)**
```bash
# Apply migration job to green environment
kubectl apply -f k8s/production/db-migration-job-green.yaml

# Wait for completion
kubectl wait --for=condition=complete job/db-migration-green \
  -n deepsynaps-production --timeout=300s

# Verify migration
kubectl logs job/db-migration-green -n deepsynaps-production
```

#### Deployment (T-0)

**Step 5: Deploy green environment**
```bash
# Update green deployment with new version
kubectl set image deployment/deepsynaps-api-green \
  api=deepsynaps/api:4.0.1-production \
  -n deepsynaps-production

kubectl set image deployment/deepsynaps-web-green \
  web=deepsynaps/web:4.0.1-production \
  -n deepsynaps-production

# Wait for rollout
kubectl rollout status deployment/deepsynaps-api-green \
  -n deepsynaps-production --timeout=300s

kubectl rollout status deployment/deepsynaps-web-green \
  -n deepsynaps-production --timeout=300s
```

**Step 6: Smoke test green environment**
```bash
# Port-forward to green for testing
kubectl port-forward svc/deepsynaps-api-green 8001:80 \
  -n deepsynaps-production &

# Run smoke tests
curl -s http://localhost:8001/health | jq .
curl -s http://localhost:8001/api/v1/system/runtime-config | jq .

# Run synthesis endpoint test (use synthetic data only)
curl -X POST http://localhost:8001/api/v1/multimodal/patients/test-patient-001/synthesis \
  -H "Content-Type: application/json" \
  -H "X-Clinic-ID: clinic-smoke-test" \
  -G -d "clinician_id=smoke-test-clinician" \
  -d '{"include_modalities": ["qeeg"], "max_hypotheses": 3}' | jq .

# Verify safety disclaimer in response
# Expected: response.safety_disclaimer contains "decision support only"

# Kill port-forward
kill %1
```

#### Traffic Shift

**Step 7: Shift 10% traffic to green**
```bash
# Update load balancer weights
kubectl patch service deepsynaps-api \
  -n deepsynaps-production \
  --type='merge' \
  -p='{"spec":{"selector":{"version":"green"}}}'

# Or via ingress canary (if using nginx ingress)
kubectl annotate ingress deepsynaps-ingress \
  -n deepsynaps-production \
  nginx.ingress.kubernetes.io/canary="true" \
  nginx.ingress.kubernetes.io/canary-weight="10"
```

**Step 8: Monitor for 15 minutes**
```bash
# Watch error rate
# Grafana: p95 latency < 500ms, error rate < 0.1%

# Watch logs
kubectl logs -f deployment/deepsynaps-api-green \
  -n deepsynaps-production --tail=50

# Check alert status
# PagerDuty: No new incidents
```

**Step 9: Shift 50% traffic**
```bash
kubectl annotate ingress deepsynaps-ingress \
  -n deepsynaps-production \
  nginx.ingress.kubernetes.io/canary-weight="50"
```

**Step 10: Monitor for 15 minutes**
```bash
# Same monitoring as Step 8
# If any anomaly detected → GO TO ROLLBACK (Section 7)
```

**Step 11: Shift 100% traffic to green**
```bash
kubectl annotate ingress deepsynaps-ingress \
  -n deepsynaps-production \
  nginx.ingress.kubernetes.io/canary="false" \
  nginx.ingress.kubernetes.io/canary-weight- \

# Update primary service selector
kubectl patch service deepsynaps-api \
  -n deepsynaps-production \
  --type='merge' \
  -p='{"spec":{"selector":{"version":"green"}}}'
```

**Step 12: Monitor for 30 minutes at 100%**
```bash
# Full monitoring dashboard
# Key metrics: p95 latency, error rate, DB connections, cache hit rate
# If stable for 30 minutes → deployment successful
```

**Step 13: Swap blue/green labels**
```bash
# Green becomes new blue
echo "Deployment complete. Green is now live."
echo "Previous blue environment kept for 24 hours for rollback safety."
```

### 5.5 Post-Deployment Cleanup (T+24 hours)

```bash
# After 24 hours of stable operation, remove old blue environment
kubectl scale deployment/deepsynaps-api-blue --replicas=0 \
  -n deepsynaps-production
kubectl scale deployment/deepsynaps-web-blue --replicas=0 \
  -n deepsynaps-production

# Retain blue deployment config for 7 days before deletion
# kubectl delete deployment deepsynaps-api-blue -n deepsynaps-production
```

---

## 6. Verification Steps

### 6.1 Health Check Verification

```bash
#!/bin/bash
# save as: verify-deployment.sh
# usage: ./verify-deployment.sh <environment>
# environments: local, staging, production

ENV=${1:-local}

if [ "$ENV" == "local" ]; then
  API_URL="http://localhost:8000"
  WEB_URL="http://localhost:3000"
elif [ "$ENV" == "staging" ]; then
  API_URL="https://api.staging.deepsynaps.io"
  WEB_URL="https://staging.deepsynaps.io"
elif [ "$ENV" == "production" ]; then
  API_URL="https://api.deepsynaps.io"
  WEB_URL="https://app.deepsynaps.io"
else
  echo "Unknown environment: $ENV"
  exit 1
fi

echo "=== DeepSynaps Protocol Studio — Deployment Verification ==="
echo "Environment: $ENV"
echo "API: $API_URL"
echo "Web: $WEB_URL"
echo ""

# ── Check 1: Health endpoint ──────────────────────────────────────
echo "[1/10] Health endpoint..."
HEALTH=$(curl -s "$API_URL/health" | jq -r '.status // "FAIL"')
if [ "$HEALTH" == "ok" ]; then
  echo "  ✓ PASS — Health check returns 'ok'"
else
  echo "  ✗ FAIL — Health check returned: $HEALTH"
  exit 1
fi

# ── Check 2: Phase and modules ───────────────────────────────────
echo "[2/10] Phase and modules..."
PHASE=$(curl -s "$API_URL/health" | jq -r '.phase // "FAIL"')
MODULE_COUNT=$(curl -s "$API_URL/health" | jq '.modules | length')
if [ "$PHASE" == "4" ] && [ "$MODULE_COUNT" -ge 9 ]; then
  echo "  ✓ PASS — Phase $PHASE with $MODULE_COUNT modules"
else
  echo "  ✗ FAIL — Phase: $PHASE, Modules: $MODULE_COUNT"
  exit 1
fi

# ── Check 3: Runtime config (no secrets) ─────────────────────────
echo "[3/10] Runtime config (no secrets exposed)..."
RUNTIME=$(curl -s "$API_URL/api/v1/system/runtime-config")
HAS_SECRET=$(echo "$RUNTIME" | jq 'keys[]' | grep -iE "password|secret|token|key" || true)
APP_ENV=$(echo "$RUNTIME" | jq -r '.app_env // "unknown"')
if [ -z "$HAS_SECRET" ]; then
  echo "  ✓ PASS — No secrets in runtime config (env: $APP_ENV)"
else
  echo "  ✗ FAIL — Potential secret exposed: $HAS_SECRET"
  exit 1
fi

# ── Check 4: Frontend loads ──────────────────────────────────────
echo "[4/10] Frontend loads..."
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL/")
if [ "$FRONTEND_STATUS" == "200" ]; then
  echo "  ✓ PASS — Frontend returns HTTP 200"
else
  echo "  ✗ FAIL — Frontend returned HTTP $FRONTEND_STATUS"
  exit 1
fi

# ── Check 5: Safety disclaimer in API ────────────────────────────
echo "[5/10] Safety disclaimer in synthesis response..."
SAFETY=$(curl -s -X POST "$API_URL/api/v1/multimodal/patients/verify-patient-001/synthesis" \
  -H "Content-Type: application/json" \
  -H "X-Clinic-ID: clinic-verify" \
  -G -d "clinician_id=verify-clinician" \
  -d '{"include_modalities": ["qeeg"], "max_hypotheses": 1}' | jq -r '.safety_disclaimer // "MISSING"')
if echo "$SAFETY" | grep -qi "decision support"; then
  echo "  ✓ PASS — Safety disclaimer present"
else
  echo "  ✗ FAIL — Safety disclaimer missing or incomplete: $SAFETY"
  exit 1
fi

# ── Check 6: DeepTwin snapshot endpoint ──────────────────────────
echo "[6/10] DeepTwin snapshot endpoint..."
SNAPSHOT=$(curl -s "$API_URL/api/v1/deeptwin/patients/verify-patient-001/snapshot" \
  -H "X-Clinic-ID: clinic-verify" \
  -G -d "clinician_id=verify-clinician" | jq -r '.safety_disclaimer // "MISSING"')
if echo "$SNAPSHOT" | grep -qi "DeepTwin"; then
  echo "  ✓ PASS — DeepTwin safety disclaimer present"
else
  echo "  ✗ FAIL — DeepTwin disclaimer missing"
  exit 1
fi

# ── Check 7: Analyzer evidence endpoint ──────────────────────────
echo "[7/10] Analyzer evidence endpoint..."
EVIDENCE=$(curl -s "$API_URL/api/v1/analyzers/qeeg/evidence" \
  -H "X-Clinic-ID: clinic-verify" \
  -G -d "clinician_id=verify-clinician" -d "limit=1" | jq -r '.evidence_count // "FAIL"')
if [ "$EVIDENCE" != "FAIL" ]; then
  echo "  ✓ PASS — Evidence endpoint returns count: $EVIDENCE"
else
  echo "  ✗ FAIL — Evidence endpoint failed"
  exit 1
fi

# ── Check 8: Materialized views status ───────────────────────────
echo "[8/10] Materialized views status..."
MV_STATUS=$(curl -s "$API_URL/api/v1/system/materialized-views/status" \
  -H "X-Clinic-ID: clinic-verify" \
  -G -d "clinician_id=admin-verify" | jq -r '.dialect // "FAIL"')
if [ "$MV_STATUS" != "FAIL" ]; then
  echo "  ✓ PASS — Materialized views dialect: $MV_STATUS"
else
  echo "  ⚠ WARN — Materialized views status endpoint unavailable (may be SQLite)"
fi

# ── Check 9: Response time (p95 estimate) ────────────────────────
echo "[9/10] Response time check..."
START=$(date +%s%N)
curl -s "$API_URL/health" > /dev/null
END=$(date +%s%N)
DURATION_MS=$(( (END - START) / 1000000 ))
if [ "$DURATION_MS" -lt 500 ]; then
  echo "  ✓ PASS — Health endpoint responded in ${DURATION_MS}ms"
else
  echo "  ⚠ WARN — Health endpoint slow: ${DURATION_MS}ms (target < 500ms)"
fi

# ── Check 10: SSL certificate (non-local) ───────────────────────
if [ "$ENV" != "local" ]; then
  echo "[10/10] SSL certificate..."
  CERT_DAYS=$(echo | openssl s_client -servername "${API_URL#https://}" \
    -connect "${API_URL#https://}:443" 2>/dev/null | \
    openssl x509 -noout -enddate | \
    cut -d= -f2 | \
    xargs -I {} date -d "{}" +%s 2>/dev/null || echo "0")
  if [ "$CERT_DAYS" != "0" ]; then
    echo "  ✓ PASS — SSL certificate valid"
  else
    echo "  ✗ FAIL — SSL certificate check failed"
    exit 1
  fi
else
  echo "[10/10] SSL certificate — SKIPPED (local environment)"
fi

echo ""
echo "=== Verification Complete — All Checks Passed ==="
```

Run verification:
```bash
chmod +x verify-deployment.sh
./verify-deployment.sh local     # For local
./verify-deployment.sh staging   # For staging
./verify-deployment.sh production # For production
```

### 6.2 Performance Verification

```bash
# Install hey (HTTP load generator) if not present
# macOS: brew install hey
# Linux: go install github.com/rakyll/hey@latest

# ── Health endpoint load test ─────────────────────────────────────
echo "Health endpoint — 1000 requests, 50 concurrent"
hey -n 1000 -c 50 -z 30s \
  -H "Accept-Encoding: gzip" \
  https://api.deepsynaps.io/health

# Acceptance criteria:
# - p95 latency < 500ms
# - Error rate = 0%
# - Requests/sec > 100

# ── Synthesis endpoint load test ──────────────────────────────────
echo "Synthesis endpoint — 100 requests, 10 concurrent"
hey -n 100 -c 10 -m POST \
  -H "Content-Type: application/json" \
  -H "X-Clinic-ID: perf-test-clinic" \
  -H "Accept-Encoding: gzip" \
  -d '{"include_modalities": ["qeeg"], "max_hypotheses": 3}' \
  "https://api.deepsynaps.io/api/v1/multimodal/patients/perf-test-001/synthesis?clinician_id=perf-test"

# Acceptance criteria:
# - p95 latency < 5000ms
# - Error rate < 1%

# ── Frontend load time ────────────────────────────────────────────
echo "Frontend page load time"
curl -s -o /dev/null -w "Total time: %{time_total}s\nTTFB: %{time_starttransfer}s\n" \
  https://app.deepsynaps.io/

# Acceptance criteria:
# - Total page load < 2 seconds
# - TTFB < 200ms
```

### 6.3 E2E Test Verification

```bash
cd apps/web

# Run all E2E tests against target environment
export PLAYWRIGHT_BASE_URL=https://app.deepsynaps.io
export API_BASE_URL=https://api.deepsynaps.io

# Full suite (all browsers)
npx playwright test

# Chromium only (faster)
npx playwright test --project=chromium

# With HTML report
npx playwright test --project=chromium --reporter=html

# Specific test file
npx playwright test e2e/synthesis.spec.ts --project=chromium
```

### 6.4 Safety Verification

```bash
# ── Verify safety disclaimer on ALL endpoints ─────────────────────
ENDPOINTS=(
  "/api/v1/multimodal/patients/test-001/timeline"
  "/api/v1/multimodal/patients/test-001/correlations"
  "/api/v1/multimodal/patients/test-001/confounders"
  "/api/v1/multimodal/patients/test-001/quality-flags"
  "/api/v1/deeptwin/patients/test-001/snapshot"
  "/api/v1/deeptwin/patients/test-001/hypotheses"
  "/api/v1/deeptwin/patients/test-001/timeline"
  "/api/v1/analyzers/qeeg/evidence"
)

for endpoint in "${ENDPOINTS[@]}"; do
  RESPONSE=$(curl -s "https://api.deepsynaps.io${endpoint}" \
    -H "X-Clinic-ID: safety-test" \
    -G -d "clinician_id=safety-test" \
    -d "limit=1" 2>/dev/null)
  
  if echo "$RESPONSE" | grep -qi "safety.*disclaimer\|decision support"; then
    echo "✓ $endpoint — safety disclaimer present"
  else
    echo "✗ $endpoint — SAFETY DISCLAIMER MISSING"
  fi
done

# ── Verify demo mode disabled in production ──────────────────────
RUNTIME=$(curl -s https://api.deepsynaps.io/api/v1/system/runtime-config | jq .)
DEMO_MODE=$(echo "$RUNTIME" | jq -r '.demo_mode_enabled')
DEMO_SEED=$(echo "$RUNTIME" | jq -r '.demo_seed_enabled')
IS_PROD=$(echo "$RUNTIME" | jq -r '.is_production')

if [ "$DEMO_MODE" == "false" ] && [ "$DEMO_SEED" == "false" ] && [ "$IS_PROD" == "true" ]; then
  echo "✓ Production mode confirmed, demo disabled"
else
  echo "✗ DEMO MODE SAFETY ISSUE: demo=$DEMO_MODE, seed=$DEMO_SEED, prod=$IS_PROD"
fi
```

---

## 7. Rollback Procedure

### 7.1 Rollback Triggers

| Trigger | Threshold | Severity | Action |
|---------|-----------|----------|--------|
| Error rate spike | > 1% for 5 minutes | CRITICAL | Immediate rollback |
| p95 latency spike | > 2000ms for 10 minutes | HIGH | Immediate rollback |
| Database connection failures | > 10 in 5 minutes | CRITICAL | Immediate rollback |
| Safety incident | Any patient safety concern | CRITICAL | Immediate rollback + CSO notification |
| Security breach | Any unauthorized access | CRITICAL | Immediate rollback + security team |
| Data corruption | Any confirmed corruption | CRITICAL | Immediate rollback + restore from backup |
| Health check failures | > 3 consecutive failures | HIGH | Immediate rollback |
| Memory leak | Container OOM > 2 in 10 minutes | HIGH | Immediate rollback |

### 7.2 Rollback Decision Flow

```
ALERT RECEIVED
      |
      v
+-----+-----+
| Severity  |
| CRITICAL? |
+-----+-----+
      |
  +---v------+    No    +-------------+
  | Rollback |<---------| Investigate |
  |  NOW     |          |  5 minutes  |
  +---+------+          +------+------+
      |                        |
      v                        v
+-----+------+         +-------v------+
| Notify:    |         | Resolved?    |
| - On-call  |         +-------+------+
| - CSO      |                 |
| - Team     |           +-----v-----+
+------------+           | Continue  |
                         | monitoring|
                         +-----------+
```

### 7.3 Step-by-Step Rollback (Blue/Green)

**Step 1: Stop traffic to green (new) version**
```bash
# Revert ingress to blue (previous version)
kubectl annotate ingress deepsynaps-ingress \
  -n deepsynaps-production \
  nginx.ingress.kubernetes.io/canary="false"

# Update service selector back to blue
kubectl patch service deepsynaps-api \
  -n deepsynaps-production \
  --type='merge' \
  -p='{"spec":{"selector":{"version":"blue"}}}'

kubectl patch service deepsynaps-web \
  -n deepsynaps-production \
  --type='merge' \
  -p='{"spec":{"selector":{"version":"blue"}}}'
```

**Step 2: Verify rollback health**
```bash
# Wait 30 seconds for traffic switch
sleep 30

# Run health checks
curl -s https://api.deepsynaps.io/health | jq .
# Expected: {"status": "ok"}

# Check error rate drops
# Grafana: Confirm error rate returns to baseline
```

**Step 3: Scale down green (failed) version**
```bash
kubectl scale deployment/deepsynaps-api-green --replicas=0 \
  -n deepsynaps-production
kubectl scale deployment/deepsynaps-web-green --replicas=0 \
  -n deepsynaps-production
```

**Step 4: Verify all traffic on blue**
```bash
# Confirm blue pods receiving traffic
kubectl logs -f deployment/deepsynaps-api-blue \
  -n deepsynaps-production --tail=20

# Confirm green pods have zero traffic
kubectl logs deployment/deepsynaps-api-green \
  -n deepsynaps-production --tail=5
# Should show no new log entries
```

**Step 5: Notify on-call team**
```bash
# Post in #incidents Slack channel
cat << 'EOF'
🚨 ROLLBACK EXECUTED — DeepSynaps Protocol Studio
Environment: production
Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Trigger: <error-rate/latency/safety/security>
Action: Traffic reverted to blue (previous stable version)
Current status: Monitoring
Next steps: Post-mortem within 24 hours
On-call: <primary> | CSO: <safety officer>
EOF
```

**Step 6: Post-mortem (within 24 hours)**

Schedule and conduct post-mortem:
```bash
# Create incident ticket
# Template:
# - Timeline of events
# - Root cause analysis
# - Impact assessment
# - Remediation actions
# - Prevention measures
```

### 7.4 Database Rollback (if migration failed)

```bash
# If database migration caused the issue:

# Step 1: Identify snapshot to restore
aws rds describe-db-snapshots \
  --db-instance-identifier deepsynaps-production \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]' \
  --output table

# Step 2: Restore from pre-deployment snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier deepsynaps-production-rollback \
  --db-snapshot-identifier pre-deploy-YYYYMMDD-HHMMSS \
  --db-instance-class db.r5.large

# Step 3: Update application to point to restored database
kubectl set env deployment/deepsynaps-api-blue \
  DATABASE_URL="postgresql://.../deepsynaps-production-rollback" \
  -n deepsynaps-production

# Step 4: Verify connectivity
kubectl rollout status deployment/deepsynaps-api-blue \
  -n deepsynaps-production
```

### 7.5 Rollback Time Targets

| Step | Target Time | Max Time |
|------|-------------|----------|
| Decision to rollback | 2 minutes | 5 minutes |
| Traffic switch | 30 seconds | 2 minutes |
| Health verification | 1 minute | 3 minutes |
| Team notification | 2 minutes | 5 minutes |
| **Total rollback time** | **5.5 minutes** | **15 minutes** |

---

## 8. Post-Deployment Monitoring

### 8.1 Key Metrics Dashboard

| Metric | Target | Warning | Critical | Alert Channel |
|--------|--------|---------|----------|---------------|
| **p95 API latency** | < 500ms | > 750ms | > 2000ms | PagerDuty |
| **Error rate** | < 0.1% | > 0.5% | > 1% | PagerDuty |
| **DB connection pool** | < 80% | > 80% | > 95% | Slack + PagerDuty |
| **Cache hit rate** | > 80% | < 60% | < 40% | Slack |
| **Active users** | Baseline | -20% | -50% | Slack |
| **Safety incident count** | 0 | > 0 | > 0 | PagerDuty + CSO |
| **Feedback submission rate** | > 5% | < 3% | < 1% | Slack |
| **Memory usage** | < 70% | > 80% | > 90% | Slack + PagerDuty |
| **CPU usage** | < 70% | > 80% | > 90% | Slack + PagerDuty |
| **Disk usage (DB)** | < 70% | > 80% | > 90% | PagerDuty |

### 8.2 Prometheus Alert Rules

```yaml
# monitoring/prometheus-alerts.yaml
groups:
  - name: deepsynaps-api
    rules:
      - alert: DeepSynapsHighErrorRate
        expr: |
          (
            sum(rate(http_requests_total{status=~"5.."}[5m]))
            /
            sum(rate(http_requests_total[5m]))
          ) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "DeepSynaps API error rate is high"
          description: "Error rate is {{ $value | humanizePercentage }} over the last 5 minutes"

      - alert: DeepSynapsHighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
          ) > 2
        for: 10m
        labels:
          severity: high
        annotations:
          summary: "DeepSynaps API p95 latency is high"
          description: "p95 latency is {{ $value }}s over the last 10 minutes"

      - alert: DeepSynapsDBConnectionsHigh
        expr: |
          (deepsynaps_db_connections_active / deepsynaps_db_pool_size) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "DB connection pool near capacity"

      - alert: DeepSynapsSafetyIncident
        expr: |
          deepsynaps_safety_incidents_total > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "SAFETY INCIDENT detected"
          description: "{{ $value }} safety incident(s) reported — notify CSO immediately"

      - alert: DeepSynapsCacheHitRateLow
        expr: |
          (
            rate(redis_keyspace_hits_total[5m])
            /
            (rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m]))
          ) < 0.4
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Redis cache hit rate is low"
```

### 8.3 Grafana Dashboard Panels

Create a dashboard with these panels:

1. **Request Rate** — `sum(rate(http_requests_total[5m]))`
2. **Error Rate %** — `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100`
3. **p50/p95/p99 Latency** — `histogram_quantile(0.50/0.95/0.99, ...)`
4. **Active DB Connections** — `deepsynaps_db_connections_active`
5. **Cache Hit Rate** — `redis_keyspace_hits / (redis_keyspace_hits + redis_keyspace_misses)`
6. **Active Users** — `count(count_over_time(http_requests_total[1h])) by (user)`
7. **Container Memory Usage** — `container_memory_usage_bytes`
8. **Container CPU Usage** — `rate(container_cpu_usage_seconds_total[5m])`
9. **Safety Incidents** — `deepsynaps_safety_incidents_total`
10. **Synthesis Request Volume** — `sum(rate(deepsynaps_synthesis_requests_total[5m]))`

### 8.4 Log Aggregation Queries

**Datadog/ELK queries for common issues:**

```bash
# Find all errors in the last hour
source:deepsynaps status:error @env:production

# Find slow requests (> 2s)
source:deepsynaps @duration:>2000 @env:production

# Find safety-related events
source:deepsynaps safety OR disclaimer OR "decision support" @env:production

# Find authentication failures
source:deepsynaps "authentication failed" OR "403" OR "denied" @env:production

# Find database errors
source:deepsynaps "psycopg2" OR "sqlite3" OR "database" @env:production

# Find specific patient access (audit trail)
source:deepsynaps @patient_id:PATIENT-123 @env:production
```

### 8.5 Weekly Review Checklist

Every Monday at 10:00 AM, review:

- [ ] Error rate trend (week over week)
- [ ] p95 latency trend (week over week)
- [ ] Top 5 slowest endpoints
- [ ] Top 5 most error-prone endpoints
- [ ] Cache hit rate trend
- [ ] Database connection pool utilization
- [ ] Safety incident count (must be 0)
- [ ] User feedback summary
- [ ] Infrastructure cost review
- [ ] Action items from previous week

---

## 9. Emergency Procedures

### 9.1 Emergency Contact List

| Role | Name | Phone | Slack | PagerDuty |
|------|------|-------|-------|-----------|
| On-call Primary | | | | |
| On-call Secondary | | | | |
| Escalation Manager | | | | |
| Clinical Safety Officer | | | | |
| Security Lead | | | | |
| Backend Lead | | | | |
| Frontend Lead | | | | |
| DevOps Lead | | | | |

### 9.2 Procedure E1: Database Corruption

**Severity:** CRITICAL
**Response Time:** 15 minutes

```bash
# Step 1: Stop all write traffic
kubectl annotate ingress deepsynaps-ingress \
  -n deepsynaps-production \
  nginx.ingress.kubernetes.io/canary="false"

# Scale API to read-only mode
kubectl set env deployment/deepsynaps-api-blue \
  DEEPSYNAPS_READ_ONLY="true" \
  -n deepsynaps-production

# Step 2: Assess corruption scope
# Connect to database and run diagnostic queries
kubectl run db-debug --rm -it --image=postgres:15-alpine \
  -- psql $DATABASE_URL

# Check for data anomalies
# SELECT COUNT(*) FROM multimodal_events WHERE patient_id IS NULL;
# SELECT COUNT(*) FROM audit_log WHERE timestamp > NOW();
# Check table integrity

# Step 3: Restore from latest clean backup
aws rds describe-db-snapshots \
  --db-instance-identifier deepsynaps-production \
  --query 'DBSnapshots[?Status==`available`].[DBSnapshotIdentifier,SnapshotCreateTime]' \
  --output table | sort -k2 -r | head -5

# Restore from selected snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier deepsynaps-production-restored \
  --db-snapshot-identifier <snapshot-id> \
  --db-instance-class db.r5.large

# Step 4: Verify restored data
# Connect to restored instance and validate row counts, recent data

# Step 5: Switch application to restored database
kubectl set env deployment/deepsynaps-api-blue \
  DATABASE_URL="postgresql://.../deepsynaps-production-restored" \
  DEEPSYNAPS_READ_ONLY="false" \
  -n deepsynaps-production

# Step 6: Verify application health
curl -s https://api.deepsynaps.io/health | jq .

# Step 7: Notify stakeholders
echo "Database corruption incident resolved. Restored from backup: <snapshot-id>"
```

### 9.3 Procedure E2: Security Breach

**Severity:** CRITICAL
**Response Time:** 5 minutes

```bash
# Step 1: Revoke all active tokens
# This requires restarting the API with a new JWT secret
kubectl patch secret deepsynaps-secrets \
  -n deepsynaps-production \
  --type='json' \
  -p='[{"op": "replace", "path": "/data/JWT_SECRET", "value":"'$(openssl rand -base64 64 | tr -d '\n')'"}]'

# Step 2: Rotate all secrets
# Generate new secrets
NEW_DB_PASSWORD=$(openssl rand -base64 32)
NEW_ENCRYPTION_KEY=$(openssl rand -base64 32)
NEW_REDIS_PASSWORD=$(openssl rand -base64 32)

# Update Kubernetes secrets
kubectl patch secret deepsynaps-secrets \
  -n deepsynaps-production \
  --type='json' \
  -p='[{"op": "replace", "path": "/data/DB_PASSWORD", "value":"'$(echo -n $NEW_DB_PASSWORD | base64)'"}]'

# Step 3: Restart all pods to pick up new secrets
kubectl rollout restart deployment/deepsynaps-api-blue \
  -n deepsynaps-production
kubectl rollout restart deployment/deepsynaps-web-blue \
  -n deepsynaps-production

# Step 4: Force all users to re-authenticate
# (New JWT secret invalidates all existing tokens)

# Step 5: Enable enhanced logging
kubectl set env deployment/deepsynaps-api-blue \
  DEEPSYNAPS_LOG_LEVEL="DEBUG" \
  -n deepsynaps-production

# Step 6: Begin forensic analysis
# Collect logs for security team
kubectl logs --all-containers --since=24h \
  deployment/deepsynaps-api-blue \
  -n deepsynaps-production > /tmp/security-logs-$(date +%Y%m%d).log

# Step 7: Notify security team and CSO
echo "SECURITY BREACH — All tokens revoked, secrets rotated, enhanced logging enabled"

# Step 8: After incident resolved, return log level to INFO
kubectl set env deployment/deepsynaps-api-blue \
  DEEPSYNAPS_LOG_LEVEL="INFO" \
  -n deepsynaps-production
```

### 9.4 Procedure E3: Performance Degradation

**Severity:** HIGH
**Response Time:** 10 minutes

```bash
# Step 1: Identify bottleneck
# Check if it's DB, CPU, memory, or network

# DB bottleneck — scale connection pool
kubectl set env deployment/deepsynaps-api-blue \
  POSTGRES_POOL_SIZE="20" \
  POSTGRES_MAX_OVERFLOW="40" \
  -n deepsynaps-production

# Step 2: Enable additional caching
kubectl set env deployment/deepsynaps-api-blue \
  DEEPSYNAPS_ENABLE_REDIS_CACHE="true" \
  DEEPSYNAPS_CACHE_TTL_SECONDS="120" \
  DEEPSYNAPS_PATIENT_CACHE_TTL_SECONDS="120" \
  -n deepsynaps-production

# Step 3: Horizontal scale — add replicas
kubectl scale deployment/deepsynaps-api-blue --replicas=5 \
  -n deepsynaps-production

# Step 4: If materialized views are slow, trigger refresh
# (Only for admin users — use materialized-views/refresh endpoint)

# Step 5: Monitor for improvement
# Grafana: Watch p95 latency and error rate for 15 minutes

# Step 6: If resolved, document root cause
# If not resolved, consider rollback (Section 7)
```

### 9.5 Procedure E4: Safety Incident

**Severity:** CRITICAL
**Response Time:** IMMEDIATE

```bash
# Step 1: Disable affected endpoints immediately
# Patch deployment to disable specific endpoints
kubectl set env deployment/deepsynaps-api-blue \
  DEEPSYNAPS_DISABLE_SYNTHESIS="true" \
  -n deepsynaps-production

# Step 2: Notify Clinical Safety Officer (CSO) IMMEDIATELY
# Phone call — not Slack, not email
# Message: "Safety incident detected. Endpoint <name> disabled. No patient harm reported."

# Step 3: Document incident
# Record:
# - Time of detection
# - Endpoint affected
# - Nature of safety issue
# - Patients potentially affected (check audit logs)
# - Clinical impact assessment

# Step 4: Preserve evidence
# Export audit logs for affected period
kubectl logs --all-containers --since=1h \
  deployment/deepsynaps-api-blue \
  -n deepsynaps-production > /tmp/safety-incident-$(date +%Y%m%d-%H%M%S).log

# Step 5: CSO determines if endpoints can be re-enabled
# Only CSO can approve re-enabling after safety review

# Step 6: Post-incident review
# Within 24 hours: CSO-led review
# Within 72 hours: Engineering fix for root cause
# Within 1 week: Updated safety controls deployed
```

### 9.6 Incident Response Summary

| Procedure | Trigger | First Action | Response Time | Owner |
|-----------|---------|-------------|---------------|-------|
| E1: DB Corruption | Data integrity failure | Stop writes, restore backup | 15 min | DBA + DevOps |
| E2: Security Breach | Unauthorized access detected | Revoke tokens, rotate secrets | 5 min | Security + DevOps |
| E3: Performance | Latency/error rate spike | Scale horizontally, enable caching | 10 min | DevOps + Backend |
| E4: Safety Incident | Patient safety concern | Disable endpoint, call CSO | IMMEDIATE | CSO + On-call |

---

## 10. Known Issues and Workarounds

### 10.1 P0 Issues Status

All 24 P0 blockers must be resolved before ANY deployment. See Section 1.1 for the full checklist.

| ID | Issue | Impact if Not Fixed | Workaround | ETA |
|----|-------|---------------------|------------|-----|
| P0-B1 | `logger` NameError on startup | App crashes on start | Define `logger = logging.getLogger(__name__)` at module scope | Sprint Day 1 |
| P0-B2 | Bare imports in `__init__.py` | Package import fails | Use `from . import module` relative imports | Sprint Day 1 |
| P0-B3 | No DB error handling | HTTP 500 on DB errors | Wrap all DB calls in try/except with 503 return | Sprint Day 1 |
| P0-B4 | Non-thread-safe singleton | Race condition on startup | Add `threading.Lock()` around singleton creation | Sprint Day 1 |
| P0-F1 | No React Error Boundaries | White screen on any error | Wrap app in `<ErrorBoundary>` component | Sprint Day 2 |
| P0-F2 | Hardcoded demo data | Synthetic data in production | Remove `setTimeout()` demo data; gate behind `demo_mode` | Sprint Day 2 |
| P0-F3 | Error state not rendered | Silent failures | Add error rendering to all async components | Sprint Day 2 |
| P0-F4 | No error boundary on dashboard | Dashboard crashes | Wrap `SynthesisDashboard` in error boundary | Sprint Day 2 |
| P0-F5 | XSS in TimelineView | Script injection | Use `DOMPurify.sanitize()` before DOM insertion | Sprint Day 2 |
| P0-F6 | No fetch timeout | Indefinite hangs | Add `AbortController` with 10s timeout to all fetches | Sprint Day 2 |
| P0-F7 | Path traversal in downloads | Arbitrary file access | Sanitize `patientId` with regex `[a-zA-Z0-9_-]+` | Sprint Day 2 |
| P0-I1 | No Dockerfile | No containerization | **MUST FIX** — No workaround | Sprint Day 3 |
| P0-I2 | No docker-compose.yml | No local orchestration | **MUST FIX** — No workaround | Sprint Day 3 |
| P0-I3 | No .dockerignore | Secret leak risk | **MUST FIX** — No workaround | Sprint Day 3 |
| P0-I4 | Source maps in production | Full source exposed | Set `build.sourcemap = false` in vite.config.js | Sprint Day 5 |
| P0-I5 | Connection pool not implemented | Raw DB connections | Implement SQLAlchemy connection pool | Sprint Day 5 |
| P0-I6 | Unpinned dependencies | Supply chain risk | Create `requirements.lock` with `==` versions | Sprint Day 5 |
| P0-S1 | Prefix role spoofing | Privilege escalation | Use exact match `==` instead of `startswith()` | Sprint Day 4 |
| P0-S2 | Dismissible demo banner | Safety risk | Remove dismiss button; make banner permanent | Sprint Day 4 |
| P0-S3 | Fail-open default role | Unauthorized access | Change default from "clinician" to "none" | Sprint Day 4 |
| P0-S4 | Export missing permission check | Unauthorized export | Add `can_export` check before export | Sprint Day 4 |
| P0-S5 | Regex dot matches any char | Safety filter bypass | Use `re.escape()` for literal matching | Sprint Day 4 |
| P0-D1 | README.md missing | Developer onboarding blocked | **MUST FIX** — No workaround | Sprint Day 6 |
| P0-D2 | Wrong role names in docs | Operational confusion | Fix role names to match source code | Sprint Day 6 |

### 10.2 P1 Issues Impact on Deployment

P1 items do not block staging deployment (20/55 must be resolved), but ALL 55 must be resolved before GA.

| Category | Count | Resolved for Staging | Resolved for GA | Impact if Deferred |
|----------|-------|---------------------|-----------------|--------------------|
| Backend | 15 | 5 | 10 | Reduced stability, missing tests |
| Frontend | 14 | 5 | 9 | Poor UX, accessibility gaps |
| Infrastructure | 10 | 4 | 6 | No CI/CD, no monitoring, no backups |
| Safety/Security | 10 | 4 | 6 | Compliance gaps, missing audit logging |
| Tests | 5 | 2 | 3 | Incomplete coverage, no load tests |
| Documentation | 6 | 2 | 4 | Developer onboarding gaps |

### 10.3 P2 Items and Beta Timeline

P2 items (64 total) are tracked during beta and prioritized by user feedback. Key themes:

| Theme | Count | Beta Priority | Effort |
|-------|-------|--------------|--------|
| Dark mode support | 1 | Low | 4h |
| Keyboard shortcuts | 1 | Medium | 3h |
| PDF/CSV export | 1 | High | 4h |
| Data visualization | 1 | High | 4h |
| Virtual scrolling | 1 | Medium | 4h |
| i18n framework | 1 | Low | 8h |
| Offline support | 1 | Low | 8h |
| Toast notifications | 1 | Medium | 3h |
| Breadcrumb navigation | 1 | Low | 2h |
| Blue-green deployment | 1 | High | 8h |
| Infrastructure-as-code | 1 | High | 8h |
| Automated backup verification | 1 | High | 4h |

### 10.4 Current Deployment Blocker Summary

| Deployment Target | Status | Blockers Remaining |
|-------------------|--------|--------------------|
| Local development (bare metal) | NOT READY | 14 P0 (missing Docker, dep resolution, frontend crashes) |
| Docker local | NOT READY | 14 P0 (no Dockerfile, no docker-compose, no .dockerignore) |
| Staging (controlled beta) | NOT READY | 24 P0 (all P0 blockers) |
| Production beta | NOT READY | 24 P0 + 15 P1 (security, safety, stability blockers) |
| Production GA | NOT READY | 24 P0 + 55 P1 (all P0 + all P1 items) |

### 10.5 Path to Production

| Milestone | Criteria | Timeline |
|-----------|----------|----------|
| **Current** — NOT READY | 24 P0 open | Now |
| **After 14-day P0 sprint** — CONTROLLED BETA READY | 0 P0 open, 55 P1 tracked | +14 days |
| **After P0 + P1 resolution** — PRODUCTION GA READY | 0 P0, 0 P1, 64 P2 in backlog | +6-8 weeks |

---

## Appendix A: File Reference

### A.1 Critical Files Checklist

| File | Path | Purpose | Status |
|------|------|---------|--------|
| Backend entry | `apps/api/src/deepsynaps/main.py` | FastAPI app, all routes | Exists |
| Config | `apps/api/src/deepsynaps/config.py` | Environment configuration | Exists |
| Database | `apps/api/src/deepsynaps/database.py` | DB adapter (SQLite/PostgreSQL) | Exists |
| Access control | `apps/api/src/deepsynaps/access_control.py` | Role-based authorization | Exists |
| Safety governance | `apps/api/src/deepsynaps/safety_governance.py` | Safety filter | Exists |
| Materialized views | `apps/api/src/deepsynaps/materialized_views.py` | DB performance | Exists |
| Requirements | `apps/api/requirements.txt` | Python dependencies | Exists (unpinned) |
| Requirements lock | `apps/api/requirements.lock` | Pinned dependencies | **MISSING** |
| Frontend entry | `apps/web/src/main.jsx` | React app mount | Exists |
| API client | `apps/web/src/api.js` | Frontend API calls | Exists |
| Vite config | `apps/web/vite.config.js` | Build configuration | Exists |
| Package manifest | `apps/web/package.json` | Node dependencies | Exists |
| Playwright config | `apps/web/playwright.config.ts` | E2E test config | Exists |
| Environment example | `.env.example` | Env var template | Exists |
| Dockerfile (API) | `apps/api/Dockerfile` | API container | **MISSING** |
| Dockerfile (Web) | `apps/web/Dockerfile` | Web container | **MISSING** |
| Docker Compose | `docker-compose.yml` | Local orchestration | **MISSING** |
| .dockerignore | `.dockerignore` | Build context filter | **MISSING** |
| README.md | `README.md` | Project documentation | **MISSING** |

### A.2 Test Files

| File | Path | Type |
|------|------|------|
| API endpoints | `apps/api/tests/test_api_endpoints.py` | Integration |
| Hypothesis engine | `apps/api/tests/test_hypothesis_engine.py` | Unit |
| Correlation engine | `apps/api/tests/test_correlation_engine.py` | Unit |
| Confound engine | `apps/api/tests/test_confound_engine.py` | Unit |
| Timeline engine | `apps/api/tests/test_timeline_engine.py` | Unit |
| Evidence engine | `apps/api/tests/test_evidence_engine.py` | Unit |
| Access control | `apps/api/tests/test_access_control.py` | Unit |
| Cache service | `apps/api/tests/test_cache_service.py` | Unit |
| Database indexes | `apps/api/tests/test_database_indexes.py` | Integration |
| Materialized views | `apps/api/tests/test_materialized_views.py` | Integration |
| DeepTwin API | `apps/api/tests/test_deeptwin_api.py` | Integration |
| DeepTwin snapshot | `apps/api/tests/test_deeptwin_snapshot.py` | Unit |
| DeepTwin review | `apps/api/tests/test_deeptwin_review.py` | Unit |
| Summary engine | `apps/api/tests/test_summary_engine_unit.py` | Unit |
| Summary endpoints | `apps/api/tests/test_summary_endpoints.py` | Integration |
| Gzip compression | `apps/api/tests/test_gzip_compression.py` | Integration |
| Time utilities | `apps/api/tests/test_time_utils.py` | Unit |
| Demo mode | `apps/api/tests/test_demo_mode_config.py` | Unit |
| E2E tests | `apps/web/e2e/` | End-to-end (Playwright) |

---

## Appendix B: Quick Reference Card

### B.1 Essential Commands

```bash
# ── Local Development ────────────────────────────────────────────
git clone <repo-url> && cd DeepSynaps-Protocol-Studio
python3 -m venv .venv && source .venv/bin/activate
pip install -r apps/api/requirements.lock
cd apps/web && npm ci && cd ../..
cp .env.example .env
# Terminal 1: cd apps/api/src/deepsynaps && uvicorn main:app --reload --port 8000
# Terminal 2: cd apps/web && npm run dev
# Terminal 3: pytest apps/api/tests/ -q && npx playwright test

# ── Docker Local ─────────────────────────────────────────────────
docker-compose up --build -d
docker-compose ps
docker-compose exec api pytest -q
cd apps/web && PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test

# ── Health Checks ────────────────────────────────────────────────
curl -s http://localhost:8000/health | jq .
curl -s https://api.staging.deepsynaps.io/health | jq .
curl -s https://api.deepsynaps.io/health | jq .

# ── Kubernetes ───────────────────────────────────────────────────
kubectl get pods -n deepsynaps-staging
kubectl logs -f deployment/deepsynaps-api -n deepsynaps-staging
kubectl rollout status deployment/deepsynaps-api -n deepsynaps-staging

# ── Rollback ─────────────────────────────────────────────────────
kubectl annotate ingress deepsynaps-ingress nginx.ingress.kubernetes.io/canary="false"
kubectl rollout undo deployment/deepsynaps-api -n deepsynaps-production
```

### B.2 Port Reference

| Service | Local Port | Docker Port | Staging URL | Production URL |
|---------|-----------|-------------|-------------|----------------|
| API | 8000 | 8000 | api.staging.deepsynaps.io | api.deepsynaps.io |
| Web | 3000/5173 | 3000 | staging.deepsynaps.io | app.deepsynaps.io |
| PostgreSQL | (file) | 5432 | RDS/Cloud SQL | RDS Multi-AZ |
| Redis | (mock) | 6379 | ElastiCache | ElastiCache cluster |

### B.3 Environment Quick Config

```bash
# ── Development ──────────────────────────────────────────────────
DEEPSYNAPS_APP_ENV=development
DEEPSYNAPS_DB=deepsynaps_dev.db
DATABASE_URL=
DEEPSYNAPS_DEMO_MODE=false

# ── Staging ──────────────────────────────────────────────────────
DEEPSYNAPS_APP_ENV=staging
DATABASE_URL=postgresql://.../deepsynaps_staging
DEEPSYNAPS_DEMO_MODE=false
DEEPSYNAPS_ENABLE_REDIS_CACHE=true

# ── Production ───────────────────────────────────────────────────
DEEPSYNAPS_APP_ENV=production
DATABASE_URL=postgresql://.../deepsynaps_production
DEEPSYNAPS_DEMO_MODE=false
DEEPSYNAPS_DEMO_CLINIC_SEED=false
DEEPSYNAPS_ENABLE_REDIS_CACHE=true
DEEPSYNAPS_ENABLE_GZIP=true
```

---

## Signatures

This runbook has been reviewed and approved for operational use.

| Role | Name | Date | Signature |
|------|------|------|-----------|
| DevOps Lead | | | _______________ |
| Security Lead | | | _______________ |
| Backend Lead | | | _______________ |
| Frontend Lead | | | _______________ |
| Clinical Safety Officer | | | _______________ |
| QA Lead | | | _______________ |

---

*Document generated: 2026-05-17*
*Next review date: After P0 sprint completion (2026-05-31)*
*Classification: INTERNAL — DEVOPS OPERATIONS*
