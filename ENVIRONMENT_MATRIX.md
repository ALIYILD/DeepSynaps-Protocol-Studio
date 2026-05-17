# DeepSynaps Protocol Studio - Environment Matrix

> **Document Version**: 1.0
> **Owner**: DevOps / Platform Engineering
> **Last Updated**: 2025-06-10
> **Classification**: Internal - Engineering

---

## 1. Overview & Purpose

This document defines the complete environment topology for the DeepSynaps Protocol Studio platform - a clinical neuromodulation SaaS application. The matrix serves as the single source of truth for:

- **Configuration differentiation** across 4 environments
- **Safe promotion pathways** from development to production
- **Secrets isolation boundaries** per environment
- **Data isolation guarantees** for HIPAA-aligned clinical operations
- **Feature flag governance** controlling worker processes and integrations

### 1.1 Architecture Summary

| Component | Technology | Environments |
|-----------|-----------|--------------|
| Backend API | FastAPI (80+ routers, 160+ endpoints) | All |
| Frontend | React (Netlify) | All |
| Database | PostgreSQL (Fly Postgres) | All |
| Task Broker | Redis / Upstash (Celery) | Local, Staging, Production |
| Process Groups | `app` (HTTP), `qeeg_worker`, `stripe_worker` | All (selective) |
| Persistent Volume | `/data` (evidence.db, voice uploads) | Local, Staging, Production |
| Internal Packages | 20 Python packages | All |
| Demo Clinic | Seeded clinic data | Local, Test |

### 1.2 Environment Topology

```
                         +---------------------+
                         |   Local Development |
                         |   localhost:8000    |
                         |   Hot-reload / UV   |
                         +----------+----------+
                                    |
                                    v CI Pipeline
                         +----------+----------+
                         |     Test / CI       |
                         |   pytest / GitHub   |
                         |   Actions           |
                         +----------+----------+
                                    |
                         Manual Approval Gate (DevOps Lead)
                                    |
                                    v
                         +----------+----------+
                         |      Staging        |
                         |  preview.app (Fly)  |
                         |  Anonymized Data    |
                         +----------+----------+
                                    |
                         CAB + Clinical Safety Review
                                    |
                                    v
                         +----------+----------+
                         |     Production      |
                         |   app.deepsynaps    |
                         |   Live Patients     |
                         +---------------------+
```

### 1.3 Change Advisory Board (CAB) Requirements

| Promotion Path | Required Approvals | CAB Review |
|----------------|-------------------|------------|
| Local -> Test | Automated | None |
| Test -> Staging | DevOps Lead + QA Lead | Optional |
| Staging -> Production | DevOps Lead + QA Lead + Clinical Safety Officer | **Mandatory** |

---

## 2. Environment Definitions

### 2.1 Environment: Local Development

| Attribute | Specification |
|-----------|--------------|
| **Name** | `development` |
| **Hostname** | `localhost:8000` |
| **Deploy Target** | Local machine / Docker Compose |
| **Branch** | `feature/*`, `fix/*`, `dev` |
| **Hot Reload** | Yes (UV / uvicorn --reload) |
| **Access** | Developer machine only |
| **Log Level** | `DEBUG` |
| **Demo Data** | Full seed (`DEEPSYNAPS_DEMO_CLINIC_SEED=1`) |
| **Database** | Local PostgreSQL via Docker or `localhost:5432` |
| **Redis** | Docker Redis container (`redis://localhost:6379/0`) |
| **Workers** | All 3 process groups (local Celery) |
| **Stripe** | Test mode (`sk_test_*`) |
| **Sentry** | Disabled |
| **SSL** | None (HTTP) |
| **Monitoring** | None |

**Purpose**: Active feature development, API exploration, integration testing with local dependencies. Full demo clinic with synthetic patient data available for UI development and API endpoint validation.

**Typical Developer Workflow**:
```bash
# Start local infrastructure
docker-compose -f docker-compose.dev.yml up -d postgres redis

# Run backend with hot reload
uv run uvicorn app.main:app --reload --port 8000

# Run all workers locally
celery -A app.celery worker -l debug -Q app,qeeg,stripe

# Seed demo data
python -m scripts.seed_demo_clinic
```

---

### 2.2 Environment: Test / CI

| Attribute | Specification |
|-----------|--------------|
| **Name** | `test` |
| **Hostname** | N/A (ephemeral containers) |
| **Deploy Target** | GitHub Actions / ephemeral Fly machines |
| **Branch** | `main` (on PR), `release/*` |
| **Hot Reload** | No |
| **Access** | CI pipeline only (no external access) |
| **Log Level** | `WARNING` (minimize noise) |
| **Demo Data** | Seeded per test suite (`DEEPSYNAPS_DEMO_CLINIC_SEED=1`) |
| **Database** | In-memory SQLite OR test PostgreSQL container |
| **Redis** | In-memory OR fakeredis (`fakeredis://`) |
| **Workers** | None (tasks run eagerly with `CELERY_TASK_ALWAYS_EAGER=True`) |
| **Stripe** | Mocked (responses library) |
| **Sentry** | Disabled |
| **SSL** | N/A |
| **Monitoring** | None |

**Purpose**: Automated testing gate. Fast feedback loop with mocked external dependencies. All Celery tasks execute synchronously. Database state is reset between test modules.

**CI Pipeline Configuration**:
```yaml
# .github/workflows/test.yml
env:
  DEEPSYNAPS_APP_ENV: test
  DEEPSYNAPS_LOG_LEVEL: WARNING
  DEEPSYNAPS_DATABASE_URL: postgresql://test:test@postgres:5432/deepsynaps_test
  CELERY_BROKER_URL: fakeredis://
  CELERY_TASK_ALWAYS_EAGER: "True"
  MRI_DEMO_MODE: "1"
  STRIPE_SECRET_KEY: sk_test_mock
  DEEPSYNAPS_DEMO_CLINIC_SEED: "1"
```

**Required CI Gates**:
| Gate | Minimum Threshold | Blocking |
|------|------------------|----------|
| Unit Tests | 100% pass rate | Yes |
| Integration Tests | 100% pass rate | Yes |
| API Contract Tests | 100% pass rate | Yes |
| Code Coverage | >= 85% | Yes |
| Type Checking (mypy) | Zero errors | Yes |
| Linting (ruff) | Zero errors | Yes |
| Security Scan (bandit) | Zero high/critical | Yes |
| Dependency Audit | Zero known CVEs (critical/high) | Yes |
| Database Migration Check | Forward-only, no destructive ops | Yes |

---

### 2.3 Environment: Staging

| Attribute | Specification |
|-----------|--------------|
| **Name** | `staging` |
| **Hostname** | `staging-api.deepsynaps.io` |
| **Deploy Target** | Fly.io (`deepsynaps-protocol-studio-staging`) |
| **Branch** | `main` (post-merge), `release/*` |
| **Hot Reload** | No |
| **Access** | Engineering team + QA team + Product (VPN/internal auth) |
| **Log Level** | `INFO` |
| **Demo Data** | Anonymized clinical subset (`DEEPSYNAPS_DEMO_CLINIC_SEED=0`) |
| **Database** | Fly Postgres (`deepsynaps-db-staging.internal:5432`) |
| **Redis** | Upstash Redis (`rediss://.../0`) |
| **Workers** | All 3 process groups (qeeg_worker, stripe_worker, app) |
| **Stripe** | Test mode (`sk_test_*`) |
| **Sentry** | Enabled (staging project) |
| **SSL** | TLS 1.2+ (Fly terminates) |
| **Monitoring** | Sentry + Fly Metrics + Structured Logging |

**Purpose**: Pre-production validation environment. Mirrors production topology identically. Uses anonymized clinical data subset for realistic load testing. All integrations operational in test/sandbox mode. Final validation gate before production promotion.

**Staging Data Strategy**:
```
+-----------------------------+----------------------------------+
| Data Source                 | Method                           |
+-----------------------------+----------------------------------+
| Patient Demographics        | Anonymized production subset     |
| Clinical Protocols          | Full set (anonymized)            |
| EEG/qEEG Datasets           | Anonymized, 10% sampling         |
| Wearable Device Tokens      | Synthetic (dev tokens)           |
| Billing / Stripe Events     | Test mode, synthetic             |
| Voice Recordings            | Synthetic audio files            |
| Evidence DB (/data)         | Copied + anonymized              |
+-----------------------------+----------------------------------+
```

**Staging Deployment Configuration**:
```toml
# fly.staging.toml
app = "deepsynaps-protocol-studio-staging"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  DEEPSYNAPS_APP_ENV = "staging"
  DEEPSYNAPS_API_HOST = "0.0.0.0"
  DEEPSYNAPS_API_PORT = "8080"
  DEEPSYNAPS_LOG_LEVEL = "INFO"
  DEEPSYNAPS_CORS_ORIGINS = "https://staging.deepsynaps.io"
  MRI_DEMO_MODE = "1"
  EVIDENCE_DB_PATH = "/data/evidence.db"
  DEEPSYNAPS_VOICE_WARMUP = "1"
  WHISPER_MODEL = "base"
  DEEPSYNAPS_AGENT_CRON_ENABLED = "1"
  DEEPSYNAPS_AUTO_PAGE_ENABLED = "1"
  DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED = "1"
  DEEPSYNAPS_QEEG_105_WORKER_ENABLED = "1"
  DEEPSYNAPS_DEMO_CLINIC_SEED = "0"

[mounts]
  source = "deepsynaps_data_staging"
  destination = "/data"

[[vm]]
  size = "shared-cpu-2x"
  memory = "2gb"

[processes]
  app = "uvicorn app.main:app --host 0.0.0.0 --port 8080"
  qeeg_worker = "celery -A app.celery worker -Q qeeg -n qeeg@%h --concurrency=2"
  stripe_worker = "celery -A app.celery worker -Q stripe -n stripe@%h --concurrency=1"
```

---

### 2.4 Environment: Production

| Attribute | Specification |
|-----------|--------------|
| **Name** | `production` |
| **Hostname** | `api.deepsynaps.io` |
| **Deploy Target** | Fly.io (`deepsynaps-protocol-studio`) |
| **Branch** | `release/*` (tagged) |
| **Hot Reload** | No |
| **Access** | End users (clinicians, patients, caregivers) |
| **Log Level** | `INFO` (`ERROR` for sensitive routers) |
| **Demo Data** | Minimal admin-only (`DEEPSYNAPS_DEMO_CLINIC_SEED=0`) |
| **Database** | Fly Postgres HA (`deepsynaps-db.internal:5432`) |
| **Redis** | Upstash Redis Production (`rediss://.../0`) |
| **Workers** | All 3 process groups (scaled) |
| **Stripe** | Live mode (`sk_live_*`) |
| **Sentry** | Enabled (production project, error level+) |
| **SSL** | TLS 1.2+ (Fly terminates + cert pinning) |
| **Monitoring** | Sentry + PagerDuty + Fly Metrics + Structured Logging + Alerting |

**Purpose**: Live clinical operations environment serving real patients. Maximum security, observability, and reliability. All clinical data is real PHI protected under HIPAA. Billing processes real payments.

**Production Deployment Configuration**:
```toml
# fly.production.toml
app = "deepsynaps-protocol-studio"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  DEEPSYNAPS_APP_ENV = "production"
  DEEPSYNAPS_API_HOST = "0.0.0.0"
  DEEPSYNAPS_API_PORT = "8080"
  DEEPSYNAPS_LOG_LEVEL = "INFO"
  DEEPSYNAPS_CORS_ORIGINS = "https://app.deepsynaps.io,https://deepsynaps.io"
  MRI_DEMO_MODE = "0"
  EVIDENCE_DB_PATH = "/data/evidence.db"
  DEEPSYNAPS_VOICE_WARMUP = "1"
  WHISPER_MODEL = "small"
  DEEPSYNAPS_AGENT_CRON_ENABLED = "1"
  DEEPSYNAPS_AUTO_PAGE_ENABLED = "1"
  DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED = "1"
  DEEPSYNAPS_QEEG_105_WORKER_ENABLED = "1"
  DEEPSYNAPS_DEMO_CLINIC_SEED = "0"

[mounts]
  source = "deepsynaps_data_production"
  destination = "/data"

[[vm]]
  size = "dedicated-cpu-2x"
  memory = "4gb"
  count = 2  # HA for app process

[processes]
  app = "uvicorn app.main:app --host 0.0.0.0 --port 8080"
  qeeg_worker = "celery -A app.celery worker -Q qeeg -n qeeg@%h --concurrency=4"
  stripe_worker = "celery -A app.celery worker -Q stripe -n stripe@%h --concurrency=2"
```

**Production Safety Rules**:
| Rule | Enforcement |
|------|-------------|
| No direct database writes | All changes via migrations or API |
| No debug endpoints | `/debug/*`, `/docs` (raw) disabled |
| No synthetic patient data | Strictly real clinical data only |
| All mutations audited | Audit log table + Sentry Breadcrumbs |
| Encryption at rest | AES-256 via Fly volumes + Fernet for columns |
| Encryption in transit | TLS 1.2+ everywhere |
| Backup frequency | Continuous (Fly) + daily snapshots |
| RPO target | < 5 minutes |
| RTO target | < 30 minutes |

---

## 3. Complete Configuration Matrix

### 3.1 Core Application Variables

| Variable | Local Development | Test / CI | Staging | Production |
|----------|-------------------|-----------|---------|------------|
| `DEEPSYNAPS_APP_ENV` | `development` | `test` | `staging` | `production` |
| `DEEPSYNAPS_DATABASE_URL` | `postgresql://dev:dev@localhost:5432/deepsynaps_dev` | `postgresql://test:test@postgres:5432/deepsynaps_test` | `postgresql://$(secrets)@deepsynaps-db-staging.internal:5432/deepsynaps_staging` | `postgresql://$(secrets)@deepsynaps-db.internal:5432/deepsynaps_production` |
| `DEEPSYNAPS_API_HOST` | `0.0.0.0` | `0.0.0.0` | `0.0.0.0` | `0.0.0.0` |
| `DEEPSYNAPS_API_PORT` | `8000` (or `8080`) | `8080` | `8080` | `8080` |
| `DEEPSYNAPS_LOG_LEVEL` | `DEBUG` | `WARNING` | `INFO` | `INFO` |
| `DEEPSYNAPS_CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173,http://localhost:8000` | `*` (test only) | `https://staging.deepsynaps.io` | `https://app.deepsynaps.io,https://deepsynaps.io` |
| `JWT_SECRET_KEY` | `dev-jwt-secret-do-not-use-in-production-ever` (local only) | `test-jwt-secret-ci-only` (rotated per run) | `[FLY SECRET]` | `[FLY SECRET]` |
| `DEEPSYNAPS_SECRETS_KEY` | `dev-secrets-key-32-bytes-long!!` (local only) | `test-secrets-key-ci-only!!` (rotated per run) | `[FLY SECRET]` | `[FLY SECRET]` |
| `STRIPE_SECRET_KEY` | `sk_test_...` (developer test account) | `sk_test_mock` (responses mock) | `sk_test_...` (Stripe test mode) | `sk_live_...` (Stripe live mode) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_test_...` | `whsec_test_mock` | `whsec_test_...` (Stripe test) | `whsec_...` (Stripe live) |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | `fakeredis://` (or memory) | `rediss://$(secrets)@deepsynaps-redis-staging.upstash.io:6379/0` | `rediss://$(secrets)@deepsynaps-redis.upstash.io:6379/0` |
| `WEARABLE_TOKEN_ENC_KEY` | `dev-wearable-key-32-bytes-long!` (local only) | `test-wearable-key-ci-only!!!` (rotated per run) | `[FLY SECRET]` | `[FLY SECRET]` |
| `SENTRY_DSN` | `` (empty/disabled) | `` (empty/disabled) | `https://...@staging.sentry.io/...` | `https://...@production.sentry.io/...` |
| `DEEPSYNAPS_LIMITER_REDIS_URI` | `redis://localhost:6379/1` | `` (disabled) | `rediss://$(secrets)@deepsynaps-redis-staging.upstash.io:6379/1` | `rediss://$(secrets)@deepsynaps-redis.upstash.io:6379/1` |

### 3.2 Feature Flag Variables

| Variable | Local Development | Test / CI | Staging | Production |
|----------|-------------------|-----------|---------|------------|
| `MRI_DEMO_MODE` | `1` | `1` | `1` | `0` |
| `EVIDENCE_DB_PATH` | `./data/evidence.db` | `:memory:` (or temp) | `/data/evidence.db` | `/data/evidence.db` |
| `DEEPSYNAPS_VOICE_WARMUP` | `1` | `0` | `1` | `1` |
| `WHISPER_MODEL` | `tiny` | `tiny` | `base` | `small` |
| `DEEPSYNAPS_AGENT_CRON_ENABLED` | `1` | `0` | `1` | `1` |
| `DEEPSYNAPS_AUTO_PAGE_ENABLED` | `1` | `0` | `1` | `1` |
| `DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED` | `1` | `0` | `1` | `1` |
| `DEEPSYNAPS_QEEG_105_WORKER_ENABLED` | `1` | `0` | `1` | `1` |
| `DEEPSYNAPS_DEMO_CLINIC_SEED` | `1` | `1` | `0` | `0` |
| `CELERY_TASK_ALWAYS_EAGER` | `False` | `True` | `False` | `False` |

### 3.3 Infrastructure & Scaling Variables

| Variable | Local Development | Test / CI | Staging | Production |
|----------|-------------------|-----------|---------|------------|
| `APP_REPLICAS` | `1` | `1` | `1` | `2` |
| `QEEG_WORKER_CONCURRENCY` | `2` | `N/A` | `2` | `4` |
| `STRIPE_WORKER_CONCURRENCY` | `1` | `N/A` | `1` | `2` |
| `VM_SIZE_APP` | `shared-cpu-1x` | `shared-cpu-1x` | `shared-cpu-2x` | `dedicated-cpu-2x` |
| `VM_MEMORY_APP` | `512mb` | `512mb` | `2gb` | `4gb` |
| `VM_SIZE_WORKER` | `shared-cpu-1x` | `N/A` | `shared-cpu-2x` | `dedicated-cpu-2x` |
| `VM_MEMORY_WORKER` | `1gb` | `N/A` | `2gb` | `4gb` |
| `DB_SIZE` | `development` | `development` | `development` | `production` (HA) |
| `REDIS_SIZE` | `container` | `fakeredis` | `free` (Upstash) | `standard` (Upstash) |
| `SSL_MODE` | `off` | `off` | `required` | `required` |
| `MAX_REQUEST_BODY_SIZE` | `50MB` | `10MB` | `50MB` | `50MB` |
| `REQUEST_TIMEOUT` | `300s` | `30s` | `120s` | `120s` |

### 3.4 Security & Compliance Variables

| Variable | Local Development | Test / CI | Staging | Production |
|----------|-------------------|-----------|---------|------------|
| `JWT_EXPIRATION_MINUTES` | `1440` (24h) | `60` | `60` | `60` |
| `JWT_REFRESH_DAYS` | `30` | `7` | `7` | `7` |
| `PASSWORD_HASH_ROUNDS` | `4` (fast for tests) | `4` | `12` | `12` |
| `RATE_LIMIT_ENABLED` | `False` | `False` | `True` | `True` |
| `RATE_LIMIT_REQUESTS` | `N/A` | `N/A` | `100/minute` | `60/minute` |
| `AUDIT_LOG_ENABLED` | `False` | `False` | `True` | `True` |
| `PHI_MASKING_IN_LOGS` | `False` | `True` | `True` | `True` |
| `DEBUG_ENDPOINTS_ENABLED` | `True` | `False` | `False` | `False` |
| `OPENAPI_DOCS_ENABLED` | `True` | `False` | `True` (VPN only) | `False` (admin only) |
| `ADMIN_ENDPOINT_AUTH` | `dev bypass` | `test token` | `JWT + role` | `JWT + role + MFA` |
| `CSP_HEADER` | `report-only` | `enforced` | `enforced` | `enforced` |
| `HSTS_MAX_AGE` | `0` | `31536000` | `31536000` | `31536000` |
| `SECURE_COOKIE` | `False` | `True` | `True` | `True` |
| `SAMESITE_COOKIE` | `Lax` | `Strict` | `Strict` | `Strict` |

### 3.5 Monitoring & Observability Variables

| Variable | Local Development | Test / CI | Staging | Production |
|----------|-------------------|-----------|---------|------------|
| `SENTRY_ENVIRONMENT` | `` | `test` | `staging` | `production` |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.0` | `0.0` | `1.0` | `0.1` |
| `SENTRY_PROFILES_SAMPLE_RATE` | `0.0` | `0.0` | `0.5` | `0.05` |
| `STRUCTURED_LOGGING` | `False` (pretty) | `True` (JSON) | `True` (JSON) | `True` (JSON) |
| `LOG_CORRELATION_ID` | `False` | `True` | `True` | `True` |
| `HEALTH_CHECK_ENDPOINT` | `/health` | `/health` | `/health` | `/health` |
| `METRICS_ENDPOINT` | `/metrics` (local) | `/metrics` | `/metrics` (internal) | `/metrics` (internal) |
| `FLY_METRICS_ENABLED` | `False` | `False` | `True` | `True` |
| `ALERT_EMAIL_ENABLED` | `False` | `False` | `True` | `True` |
| `ALERT_PAGERDUTY_ENABLED` | `False` | `False` | `False` | `True` |
| `ALERT_THRESHOLD_ERROR_RATE` | `N/A` | `N/A` | `5%` | `1%` |
| `ALERT_THRESHOLD_P95_LATENCY` | `N/A` | `N/A` | `5000ms` | `2000ms` |
| `ALERT_THRESHOLD_DB_CONNECTIONS` | `N/A` | `N/A` | `80%` | `70%` |

---

## 4. Environment Promotion Rules

### 4.1 Promotion Pipeline Overview

```
    FEATURE BRANCH        MAIN BRANCH           RELEASE BRANCH         TAGGED RELEASE
    (developer work)      (integration)         (stabilization)        (production)
           |                      |                      |                      |
           v                      v                      v                      v
    +-------------+        +-------------+        +-------------+        +-------------+
    |   LOCAL     |  CI    |    TEST     |  MANUAL  |   STAGING   |   CAB   |  PRODUCTION |
    |     DEV     |  --->  |     /CI     |  ----->  |   PREVIEW   |  ---->  |    LIVE     |
    +-------------+        +-------------+        +-------------+        +-------------+
         auto                 auto                    gate                   gate
```

### 4.2 Local Development -> Test / CI

| Aspect | Rule |
|--------|------|
| **Trigger** | Every push to any branch with open PR |
| **Approval** | None (automated) |
| **Duration** | < 10 minutes target |
| **Gates** | All CI gates must pass (see Section 2.2) |
| **Database** | Fresh ephemeral database per run |
| **Artifacts** | Test report, coverage report, build image |
| **Failure Action** | Block PR merge, notify author |

**Required Tests**:
```
1. pytest tests/unit/              (300+ unit tests)
2. pytest tests/integration/       (40+ integration tests)
3. pytest tests/api_contract/      (OpenAPI contract validation)
4. pytest tests/security/          (auth, authorization, injection)
5. pytest tests/migrations/        (forward migration test)
6. mypy app/                       (type checking)
7. ruff check app/                 (linting)
8. bandit -r app/                  (security scan)
9. pip-audit                       (dependency audit)
10. docker build --target test     (container build verification)
```

### 4.3 Test / CI -> Staging

| Aspect | Rule |
|--------|------|
| **Trigger** | Merge to `main` OR manual trigger for `release/*` |
| **Approval** | DevOps Lead + QA Lead approval required |
| **Duration** | < 15 minutes (build + deploy + smoke tests) |
| **Gates** | CI all-green + approval + security scan pass |
| **Database** | Persistent staging database (migrated forward) |
| **Artifacts** | Deployed staging app, smoke test report |
| **Failure Action** | Auto-rollback, notify team |

**Staging Smoke Tests** (automated post-deploy):
```
1. Health check: GET /health -> 200 OK
2. Auth flow: POST /auth/login -> 200 + JWT token
3. Protected endpoint: GET /patients -> 200 (with auth)
4. Celery worker: Publish test task -> Verify completion < 30s
5. Database: Verify migration version matches code
6. Stripe: POST /stripe/test-webhook -> 200 (test mode)
7. qEEG: Submit test analysis job -> Verify queue processing
8. Redis: Verify connection and pub/sub
9. Volume: Write test file to /data -> Verify read back
10. CORS: Verify preflight from staging frontend -> 204
```

**Staging Validation Requirements**:
| Validation | Owner | Duration | Pass Criteria |
|------------|-------|----------|---------------|
| Functional QA | QA Team | 1-2 days | All P0/P1 test cases pass |
| Regression Testing | QA Team | 1 day | No P0/P1 regressions |
| Performance Baseline | DevOps | 2-4 hours | p95 latency < baseline + 20% |
| Security Validation | Security Team | 1 day | No new vulnerabilities |
| Clinical Workflow Review | Clinical Safety | 1-2 days | No clinical safety concerns |

### 4.4 Staging -> Production

| Aspect | Rule |
|--------|------|
| **Trigger** | Tag creation (`vX.Y.Z`) on `release/*` branch |
| **Approval** | CAB review mandatory (see below) |
| **Duration** | < 20 minutes (blue-green deploy) |
| **Gates** | All staging validations passed + CAB approval |
| **Database** | Production database (forward migration only) |
| **Artifacts** | Tagged release, deploy report, rollback plan |
| **Failure Action** | Automatic rollback to previous stable version |

**Change Advisory Board (CAB) Checklist**:
```
Release Candidate: vX.Y.Z

[ ] Clinical Safety Review
    [ ] No changes to patient data models without clinical sign-off
    [ ] No changes to treatment protocol algorithms without clinical sign-off
    [ ] No changes to alerting thresholds without clinical sign-off
    [ ] Patient-facing UI changes reviewed for accessibility

[ ] Security Review
    [ ] No new secrets introduced without rotation plan
    [ ] No changes to auth/authz without security review
    [ ] Dependency changes audited for CVEs
    [ ] API changes reviewed for injection/escalation risks

[ ] Operations Review
    [ ] Database migration reviewed (forward-only, no destructive ops)
    [ ] Rollback procedure documented and tested
    [ ] Monitoring/alerting coverage confirmed for new features
    [ ] Capacity assessment completed (CPU, memory, storage, DB connections)

[ ] Compliance Review
    [ ] Audit log changes reviewed
    [ ] Data retention implications assessed
    [ ] HIPAA impact assessment (if applicable)
    [ ] Backup/recovery implications reviewed

[ ] Approval Signatures
    [ ] DevOps Lead: _________________ Date: _______
    [ ] QA Lead: _________________ Date: _______
    [ ] Clinical Safety Officer: _________________ Date: _______
    [ ] Security Lead: _________________ Date: _______
```

**Production Deployment Procedure**:
```bash
# 1. Verify pre-conditions
fly status --app deepsynaps-protocol-studio-staging  # Confirm staging healthy
./scripts/verify_staging_smoke_tests.sh

# 2. Create deployment artifact
git tag -a v$VERSION -m "Release v$VERSION"
git push origin v$VERSION

# 3. Run database migrations (forward-only)
fly deploy --app deepsynaps-protocol-studio --config fly.production.toml --build-target migrate

# 4. Deploy application (blue-green)
fly deploy --app deepsynaps-protocol-studio --config fly.production.toml --strategy rolling

# 5. Run production smoke tests
./scripts/smoke_tests_production.sh

# 6. Verify monitoring
./scripts/verify_monitoring.sh --env production

# 7. On failure: automatic rollback triggers
# fly deploy --app deepsynaps-protocol-studio --image $PREVIOUS_IMAGE
```

### 4.5 Emergency / Hotfix Promotion

| Condition | Procedure |
|-----------|-----------|
| **Security incident** | Direct `main` -> production with Security Lead approval (skip staging for < 4h fix) |
| **Critical bug** | Fast-track: staging validation condensed to 2 hours max |
| **Data integrity issue** | Immediate rollback, post-incident review required |
| **Infrastructure failure** | Rollback only, no forward deploy |

**Hotfix Branch Strategy**:
```
# Emergency hotfix bypasses normal promotion
hotfix/critical-fix  ----->  staging (smoke only)  ----->  production
         |                            |                           |
     branched from              2hr validation            Security/Clinical
     production tag             condensed                 Lead approval
```

---

## 5. Secrets Isolation

### 5.1 Secrets Classification

#### Tier 1: Environment-Specific Secrets (NEVER shared)

| Secret | Local | Test | Staging | Production | Rotation Cadence |
|--------|-------|------|---------|------------|-----------------|
| `JWT_SECRET_KEY` | Dev-only (throwaway) | CI-generated per run | Unique staging key | Unique production key | Quarterly |
| `DEEPSYNAPS_SECRETS_KEY` | Dev-only (throwaway) | CI-generated per run | Unique staging key | Unique production key | Quarterly |
| `STRIPE_SECRET_KEY` | Dev test key | Mocked | Stripe test (`sk_test_*`) | Stripe live (`sk_live_*`) | On compromise |
| `STRIPE_WEBHOOK_SECRET` | Dev test secret | Mocked | Stripe test webhook | Stripe live webhook | On compromise |
| `DEEPSYNAPS_DATABASE_URL` | Local DB | CI ephemeral DB | Staging DB credentials | Production DB credentials | On compromise |
| `WEARABLE_TOKEN_ENC_KEY` | Dev-only (throwaway) | CI-generated per run | Unique staging key | Unique production key | Quarterly |
| `CELERY_BROKER_URL` | Local Redis | fakeredis | Upstash staging | Upstash production | On compromise |
| `SENTRY_DSN` | Disabled | Disabled | Staging DSN | Production DSN | On compromise |

#### Tier 2: Shared Configuration (Non-secret, per environment)

| Configuration | Shared Across | Notes |
|---------------|--------------|-------|
| `DEEPSYNAPS_APP_ENV` | All | Different value per env |
| `DEEPSYNAPS_LOG_LEVEL` | All | Different value per env |
| `DEEPSYNAPS_CORS_ORIGINS` | All | Different value per env |
| `MRI_DEMO_MODE` | All | Different value per env |
| `WHISPER_MODEL` | All | Different value per env |
| Feature flags (`DEEPSYNAPS_*_ENABLED`) | All | Different values per env |
| `EVIDENCE_DB_PATH` | Local, Staging, Production | Test uses memory |

#### Tier 3: Infrastructure Secrets (Managed by Platform)

| Secret | Managed By | Scope | Rotation |
|--------|-----------|-------|----------|
| Fly.io API Token | Fly Dashboard | DevOps team | On personnel change |
| Upstash Redis Token | Upstash Console | Per-environment | Quarterly |
| PostgreSQL Password | Fly Postgres | Per-environment | Quarterly |
| Netlify Deploy Token | Netlify Dashboard | CI only | On compromise |
| GitHub Actions Token | GitHub Settings | CI only | Auto-rotated |

### 5.2 Secrets Management Architecture

```
+-----------------------------------------------------------+
|                    SECRETS GOVERNANCE                       |
+-----------------------------------------------------------+
                                                             |
    +------------------+    +------------------+    +------------------+
    |   LOCAL/ DEV     |    |    FLY SECRETS   |    |   CI SECRETS     |
    |   .env.local     |    |   (Staging)      |    |   GitHub Actions |
    |   (git-ignored)  |    |   fly secrets set|    |   Secrets Store  |
    +------------------+    +------------------+    +------------------+
           |                        |                        |
           v                        v                        v
    +------------------+    +------------------+    +------------------+
    |   Never commit   |    |   Encrypted at   |    |   Masked in      |
    |   Developer owns |    |   rest (Fly)     |    |   logs           |
    |   Disposable     |    |   Scoped to app  |    |   Ephemeral      |
    +------------------+    +------------------+    +------------------+
                                                             |
    +------------------+    +------------------+             |
    | 1PASSWORD VAULT  |    |   PRODUCTION     |             |
    |   (Source of     |--->|   FLY SECRETS    |             |
    |    Truth)        |    |   (Highest       |             |
    |                  |    |    Protection)   |             |
    +------------------+    +------------------+             |
+-----------------------------------------------------------+
```

### 5.3 Secrets Rotation Procedures

| Rotation Type | Trigger | Procedure | Downtime |
|--------------|---------|-----------|----------|
| **Scheduled** | Quarterly | 1. Generate new secret in 1Password<br>2. Update Fly secrets: `fly secrets set KEY=new_value`<br>3. Verify application health<br>4. Revoke old secret after 24h grace period | Zero (Rolling) |
| **Emergency** | Compromise suspected | 1. Immediately revoke compromised secret<br>2. Generate replacement<br>3. Emergency deploy with new secret<br>4. Force token refresh for all users<br>5. Post-incident review | < 5 minutes |
| **Personnel** | Team member departs | 1. Rotate all shared secrets<br>2. Revoke personal access tokens<br>3. Audit access logs for 30d<br>4. Update CAB | Zero (Rolling) |

### 5.4 Local Development Secrets Policy

```yaml
# .env.local.template (checked into repo)
# NEVER put real values in template - copy to .env.local and fill in

# These are THROWAWAY development values only
# Production secrets must NEVER be used locally
JWT_SECRET_KEY: "dev-jwt-secret-$(openssl rand -hex 16)"
DEEPSYNAPS_SECRETS_KEY: "dev-secrets-$(openssl rand -hex 16)"
WEARABLE_TOKEN_ENC_KEY: "dev-wearable-$(openssl rand -hex 16)"

# Stripe: ALWAYS use test mode locally
STRIPE_SECRET_KEY: "sk_test_..."
STRIPE_WEBHOOK_SECRET: "whsec_test_..."

# Database: local Docker only
DEEPSYNAPS_DATABASE_URL: "postgresql://dev:dev@localhost:5432/deepsynaps_dev"

# Redis: local Docker only
CELERY_BROKER_URL: "redis://localhost:6379/0"
```

**Rules**:
1. `.env.local` is in `.gitignore` and MUST NEVER be committed
2. Pre-commit hook checks for `sk_live_`, `sk_prod_`, production hostnames in `.env.*`
3. Production secrets detection in CI blocks the build
4. Developer onboarding includes secrets hygiene training

---

## 6. Data Isolation

### 6.1 Database Isolation Strategy

```
+------------------------------------------------------------------+
|                        DATABASE ISOLATION                         |
+------------------------------------------------------------------+
                                                                    |
    +--------------------+    +--------------------+    +----------+----------+
    |  LOCAL DEVELOPMENT |    |    TEST / CI       |    |      STAGING        |
    |  PostgreSQL Docker |    |  Ephemeral DB      |    |  Fly Postgres       |
    |  (single instance) |    |  (per CI run)      |    |  (single node)      |
    |                    |    |                    |    |                     |
    |  DB: deepsynaps_dev|    |  DB: deepsynaps_test|   |  DB: deepsynaps_stag|
    |  Host: localhost   |    |  Host: postgres:5432|   |  Host: db.internal  |
    |  Full demo data    |    |  Seeded per suite   |   |  Anonymized subset  |
    +--------------------+    +--------------------+    +----------+----------+
                                                                    |
    +--------------------+    +--------------------+                |
    |    PRODUCTION      |    |    BACKUP / DR     |                |
    |  Fly Postgres HA   |    |  Daily Snapshots   |                |
    |  (Primary + Standby)|   |  30-day retention  |                |
    |                    |    |  Point-in-time     |                |
    |  DB: deepsynaps_prod|   |  Cross-region copy |                |
    |  Host: db.internal |    |  Encrypted at rest |                |
    |  Real patient data |    |  AES-256           |                |
    +--------------------+    +--------------------+                |
                                                                    |
    NO CROSS-ENVIRONMENT DATA FLOW (except anonymized staging seed) |
+------------------------------------------------------------------+
```

### 6.2 Database Per Environment

| Environment | Instance | Database Name | Network | Encryption |
|-------------|----------|--------------|---------|------------|
| Local | Docker PostgreSQL | `deepsynaps_dev` | `localhost:5432` | None (local only) |
| Test / CI | Docker PostgreSQL (ephemeral) | `deepsynaps_test` | `postgres:5432` | None (ephemeral) |
| Staging | Fly Postgres | `deepsynaps_staging` | Private WireGuard | TLS + Volume encryption |
| Production | Fly Postgres HA | `deepsynaps_production` | Private WireGuard | TLS + Volume encryption |

### 6.3 Migration Rules Per Environment

| Environment | Migrations | Direction | Safety Rules |
|-------------|-----------|-----------|-------------|
| Local | Alembic auto-generate + manual | Forward + backward allowed | Destructive changes OK |
| Test | `pytest-alembic` forward test | Forward only in CI | Must be backward-compatible for 1 release |
| Staging | Alembic upgrade (on deploy) | Forward only | Reviewed in PR, no destructive ops |
| Production | Alembic upgrade (on deploy, pre-app) | Forward only | CAB-approved, no column drops, no data loss |

**Migration Safety Checklist** (Staging + Production):
```
[ ] Migration is forward-only (no downgrade scripts required for deploy)
[ ] No column drops on existing tables
[ ] No data destruction (UPDATE/DELETE in migration must be justified)
[ ] New columns have defaults or are nullable
[ ] Indexes are created CONCURRENTLY where possible
[ ] Migration runtime estimated and within maintenance window
[ ] Rollback plan documented (previous image tag)
[ ] Migration tested against staging data volume
```

### 6.4 Volume / File System Isolation

| Environment | Volume | Path | Contents | Size Limit |
|-------------|--------|------|----------|------------|
| Local | Local filesystem | `./data/` | evidence.db, voice uploads, temp files | Host disk |
| Test | Temp directory | `/tmp/deepsynaps_test_*/` | evidence.db (per test), voice uploads | Auto-cleaned |
| Staging | Fly Volume | `/data/` | evidence.db, voice uploads, exports | 10GB |
| Production | Fly Volume (HA) | `/data/` | evidence.db, voice uploads, exports | 100GB |

**Volume Isolation Guarantees**:
- No shared volumes between environments
- Production volume is encrypted at rest (Fly platform encryption)
- Staging volume does NOT contain production data (anonymized copy pipeline)
- Local volumes are `.gitignore`-d and never committed
- Test volumes are ephemeral and cleaned after each CI run

### 6.5 Demo Data Rules Per Environment

| Environment | Demo Clinic | Demo Patients | Demo EEG Data | Demo Billing | Purpose |
|-------------|------------|---------------|---------------|--------------|---------|
| Local | Full seed | 50+ synthetic | Synthetic datasets | Test Stripe | Development, UI testing |
| Test | Per-test seed | Minimal (5-10) | Minimal | Mocked | Test isolation, deterministic |
| Staging | None | Anonymized real subset (10%) | Anonymized real subset | Test Stripe | Realistic load testing |
| Production | None | Real patients only | Real clinical data | Live Stripe | Clinical operations |

**Demo Clinic Seeding Control**:
```python
# Controlled by DEEPSYNAPS_DEMO_CLINIC_SEED
if DEEPSYNAPS_DEMO_CLINIC_SEED == "1":
    # Only allowed in development and test environments
    if DEEPSYNAPS_APP_ENV not in ("development", "test"):
        raise SecurityException(
            "Demo clinic seeding is PROHIBITED in "
            f"{DEEPSYNAPS_APP_ENV} environment"
        )
    seed_demo_clinic(full=True)
else:
    # Production / Staging: skip demo seeding
    logger.info("Demo clinic seeding disabled")
```

### 6.6 Data Flow Restrictions

```
                         ALLOWED FLOW                    PROHIBITED FLOW
    +------------------+
    |  PRODUCTION DB   |
    |  (Real PHI)      |-------> Anonymization Pipeline -----> STAGING
    +------------------+                                      (Anonymized)
           |                                                         |
           |  NO DIRECT ACCESS                                       |
           v                                                         v
    +------------------+    +------------------+    +------------------+
    |  DEVELOPER LOCAL |    |  TEST / CI       |    |  STAGING         |
    |  (Synthetic)     |    |  (Ephemeral)     |    |  (Anonymized)    |
    +------------------+    +------------------+    +------------------+

    PROHIBITED:
    - Production DB -> Local (NEVER)
    - Production DB -> Test (NEVER)
    - Production volume -> Any other env (NEVER)
    - Real PHI in any non-production environment

    ALLOWED:
    - Production -> Anonymization -> Staging (approved pipeline only)
    - Synthetic data -> Local, Test (demo clinic seeding)
    - Staging -> Production (ONLY schema migrations, NO data)
```

### 6.7 Backup & Recovery Per Environment

| Environment | Backup Type | Frequency | Retention | Recovery Time |
|-------------|------------|-----------|-----------|---------------|
| Local | None (developer responsibility) | N/A | N/A | N/A |
| Test | None (ephemeral) | N/A | N/A | N/A |
| Staging | Fly automated snapshots | Daily | 7 days | < 1 hour |
| Production | Fly automated + WAL archival | Continuous | 30 days | < 30 minutes |
| Production | Cross-region copy (DR) | Daily | 7 days | < 2 hours |

---

## 7. Feature Flag Matrix

### 7.1 Worker Process Matrix

| Process Group | Local Dev | Test / CI | Staging | Production | Description |
|--------------|-----------|-----------|---------|------------|-------------|
| `app` (HTTP API) | Yes | Yes (test client) | Yes | Yes (2 replicas) | Main FastAPI application |
| `qeeg_worker` | Yes | No (eager mode) | Yes | Yes (4 concurrency) | qEEG analysis processing |
| `stripe_worker` | Yes | No (mocked) | Yes | Yes (2 concurrency) | Stripe webhook processing |

**Worker Scaling Per Environment**:
```yaml
# Local Development
processes:
  app: uvicorn app.main:app --reload --port 8000
  qeeg_worker: celery -A app.celery worker -Q qeeg -n qeeg@%h --concurrency=2
  stripe_worker: celery -A app.celery worker -Q stripe -n stripe@%h --concurrency=1

# Test / CI
processes:
  app: pytest (test client, no server)
# All tasks run eagerly: CELERY_TASK_ALWAYS_EAGER=True

# Staging
processes:
  app: uvicorn app.main:app --host 0.0.0.0 --port 8080
  qeeg_worker: celery -A app.celery worker -Q qeeg -n qeeg@%h --concurrency=2
  stripe_worker: celery -A app.celery worker -Q stripe -n stripe@%h --concurrency=1

# Production
processes:
  app: uvicorn app.main:app --host 0.0.0.0 --port 8080  # 2 replicas
  qeeg_worker: celery -A app.celery worker -Q qeeg -n qeeg@%h --concurrency=4
  stripe_worker: celery -A app.celery worker -Q stripe -n stripe@%h --concurrency=2
```

### 7.2 Integration Availability Matrix

| Integration | Local Dev | Test / CI | Staging | Production | Notes |
|------------|-----------|-----------|---------|------------|-------|
| **Stripe Payments** | Test mode | Mocked (responses) | Test mode | Live mode | Webhook endpoints registered per env |
| **Stripe Webhooks** | CLI forward | Mocked | Stripe test endpoint | Stripe live endpoint | Separate webhook secrets per env |
| **qEEG Processing** | Local (CPU) | Eager / Mocked | Staging queue | Production queue | GPU optional for large models |
| **Whisper (Voice)** | Local (tiny) | Tiny (eager) | Base model | Small model | Model size scales with environment |
| **Wearable Devices** | Dev tokens | Mocked | Test tokens | Live tokens | Token encryption per env |
| **Sentry Error Tracking** | Disabled | Disabled | Staging project | Production project | Sample rate differs |
| **Email (SendGrid)** | Console backend | Mocked | Test account | Live account | Staging sends to allowed domains only |
| **SMS (Twilio)** | Console backend | Mocked | Test account | Live account | Staging sends to team numbers only |
| **MRI Processing** | Demo mode | Demo mode | Demo mode | Real mode | Demo = fallback synthetic data |
| **Rate Limiting** | Disabled | Disabled | Redis-based | Redis-based | Production uses stricter limits |

### 7.3 Demo Mode Availability Matrix

| Feature | Local Dev | Test / CI | Staging | Production |
|---------|-----------|-----------|---------|------------|
| `MRI_DEMO_MODE` | `1` (demo fallback) | `1` (demo fallback) | `1` (demo fallback) | `0` (real MRI only) |
| `DEEPSYNAPS_DEMO_CLINIC_SEED` | `1` (full seed) | `1` (per-test seed) | `0` (no seed) | `0` (no seed) |
| Synthetic patient data | Available | Available per test | Anonymized only | **PROHIBITED** |
| Demo EEG datasets | Available | Minimal | Anonymized only | **PROHIBITED** |
| Test Stripe transactions | Available | Mocked | Available | Live only |
| Admin debug endpoints | Enabled | Disabled | VPN-restricted | Admin MFA only |

### 7.4 Feature Flag Governance

```python
# app/core/feature_flags.py
from enum import Enum

class Environment(str, Enum):
    DEVELOPMENT = "development"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"

FEATURE_MATRIX = {
    # Worker enablement
    "AGENT_CRON": {
        Environment.DEVELOPMENT: True,
        Environment.TEST: False,          # No background tasks in tests
        Environment.STAGING: True,
        Environment.PRODUCTION: True,
    },
    "AUTO_PAGE": {
        Environment.DEVELOPMENT: True,
        Environment.TEST: False,
        Environment.STAGING: True,
        Environment.PRODUCTION: True,
    },
    "CAREGIVER_DIGEST": {
        Environment.DEVELOPMENT: True,
        Environment.TEST: False,
        Environment.STAGING: True,
        Environment.PRODUCTION: True,
    },
    "QEEG_105_WORKER": {
        Environment.DEVELOPMENT: True,
        Environment.TEST: False,          # Eager or mocked
        Environment.STAGING: True,
        Environment.PRODUCTION: True,
    },

    # Integration modes
    "STRIPE_LIVE": {
        Environment.DEVELOPMENT: False,   # test keys only
        Environment.TEST: False,          # mocked
        Environment.STAGING: False,       # test keys only
        Environment.PRODUCTION: True,     # live keys only
    },
    "MRI_REAL_DATA": {
        Environment.DEVELOPMENT: False,   # demo fallback
        Environment.TEST: False,          # demo fallback
        Environment.STAGING: False,       # demo fallback
        Environment.PRODUCTION: True,     # real MRI data required
    },
    "VOICE_WARMUP": {
        Environment.DEVELOPMENT: True,    # preload for faster dev
        Environment.TEST: False,          # no preload (faster tests)
        Environment.STAGING: True,
        Environment.PRODUCTION: True,
    },

    # Data seeding
    "DEMO_CLINIC_SEED": {
        Environment.DEVELOPMENT: True,    # full demo data
        Environment.TEST: True,           # minimal per-test
        Environment.STAGING: False,       # anonymized real data
        Environment.PRODUCTION: False,    # NEVER in production
    },

    # Security features
    "RATE_LIMITING": {
        Environment.DEVELOPMENT: False,
        Environment.TEST: False,
        Environment.STAGING: True,
        Environment.PRODUCTION: True,
    },
    "AUDIT_LOGGING": {
        Environment.DEVELOPMENT: False,
        Environment.TEST: False,
        Environment.STAGING: True,
        Environment.PRODUCTION: True,
    },
    "PHI_MASKING": {
        Environment.DEVELOPMENT: False,
        Environment.TEST: True,
        Environment.STAGING: True,
        Environment.PRODUCTION: True,
    },
}

def is_feature_enabled(feature_name: str, env: Environment = None) -> bool:
    """Check if a feature is enabled in the current environment."""
    from app.core.config import settings
    env = env or Environment(settings.APP_ENV)
    return FEATURE_MATRIX.get(feature_name, {}).get(env, False)
```

### 7.5 Environment-Specific Endpoint Availability

| Endpoint Category | Local Dev | Test / CI | Staging | Production |
|------------------|-----------|-----------|---------|------------|
| `/health` | Public | Public | Public | Public |
| `/docs` (Swagger) | Public | Disabled | VPN only | Admin only |
| `/redoc` | Public | Disabled | VPN only | Admin only |
| `/openapi.json` | Public | Disabled | VPN only | Admin only |
| `/debug/*` | Enabled | Disabled | VPN only | Disabled |
| `/admin/*` | Dev bypass | Test token | JWT + role | JWT + role + MFA |
| `/stripe/webhook` | Stripe CLI | Mocked | Stripe test | Stripe live |
| `/metrics` | Public | Internal | Internal (VPN) | Internal (VPN) |
| GraphQL (if applicable) | Enabled | Disabled | Enabled | Enabled |

---

## 8. Infrastructure Comparison

### 8.1 Resource Allocation Matrix

| Resource | Local Dev | Test / CI | Staging | Production |
|----------|-----------|-----------|---------|------------|
| **App Instances** | 1 | 1 (ephemeral) | 1 | 2 (HA) |
| **App CPU** | Host shared | Shared (GitHub) | Shared-2x | Dedicated-2x |
| **App Memory** | Host RAM | 512MB | 2GB | 4GB |
| **qEEG Workers** | 1 | 0 (eager) | 1 | 2-4 (auto-scaled) |
| **Stripe Workers** | 1 | 0 (mocked) | 1 | 2 |
| **PostgreSQL** | Docker | Docker | Fly single-node | Fly HA |
| **PostgreSQL Size** | Dev's choice | Minimal | 1GB | 100GB+ |
| **Redis** | Docker | fakeredis | Upstash free | Upstash standard |
| **Volume Storage** | Host disk | Temp | 10GB | 100GB+ |
| **CDN / Static** | Local dev server | N/A | Netlify staging | Netlify production |
| **SSL Certificate** | None | N/A | Let's Encrypt (Fly) | Let's Encrypt (Fly) |
| **DDoS Protection** | None | N/A | Fly proxy | Fly proxy + WAF |

### 8.2 Cost Estimation Per Environment

| Environment | Monthly Estimate | Primary Cost Drivers |
|-------------|-----------------|---------------------|
| Local Dev | $0 (developer hardware) | None |
| Test / CI | $0 (GitHub Actions free tier) | Compute minutes |
| Staging | ~$50-100/month | Fly shared CPU, Upstash free, minimal storage |
| Production | ~$500-1500/month (scales with usage) | Dedicated CPU, HA Postgres, Upstash standard, volume storage, workers |

---

## 9. Disaster Recovery & Rollback

### 9.1 Rollback Procedures

| Environment | Rollback Method | Recovery Time | Data Impact |
|-------------|----------------|---------------|-------------|
| Local Dev | `git checkout` + restart | < 1 minute | None (local data disposable) |
| Test / CI | Re-run CI pipeline | < 10 minutes | None (ephemeral) |
| Staging | `fly deploy --image $PREVIOUS` | < 2 minutes | Last migration may need manual revert |
| Production | `fly deploy --image $PREVIOUS_TAG` | < 5 minutes | DB migration rollback requires careful handling |

### 9.2 Production Rollback Checklist

```
EMERGENCY ROLLBACK PROCEDURE - Production Only

[ ] 1. Assess severity (P1 = immediate, P2 = within 1h)
[ ] 2. Notify on-call engineer via PagerDuty
[ ] 3. Identify previous stable image tag: fly releases list
[ ] 4. Execute rollback: fly deploy --image registry.fly.io/...:$PREVIOUS_TAG
[ ] 5. Verify rollback: /health, smoke tests
[ ] 6. If DB migration involved:
    [ ] Determine if migration is backward-compatible
    [ ] If compatible: previous code works with new schema
    [ ] If incompatible: plan migration reversal (separate procedure)
[ ] 7. Verify monitoring dashboards (error rate, latency)
[ ] 8. Notify team in #incidents channel
[ ] 9. Create post-mortem document
[ ] 10. Schedule CAB review for forward fix
```

---

## 10. Appendices

### Appendix A: Environment Variable Quick Reference

```bash
# Local development .env.local
DEEPSYNAPS_APP_ENV=development
DEEPSYNAPS_DATABASE_URL=postgresql://dev:dev@localhost:5432/deepsynaps_dev
DEEPSYNAPS_API_HOST=0.0.0.0
DEEPSYNAPS_API_PORT=8000
DEEPSYNAPS_LOG_LEVEL=DEBUG
DEEPSYNAPS_CORS_ORIGINS=http://localhost:3000,http://localhost:5173
JWT_SECRET_KEY=<generate-local-only>
DEEPSYNAPS_SECRETS_KEY=<generate-local-only>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
CELERY_BROKER_URL=redis://localhost:6379/0
WEARABLE_TOKEN_ENC_KEY=<generate-local-only>
SENTRY_DSN=
MRI_DEMO_MODE=1
EVIDENCE_DB_PATH=./data/evidence.db
DEEPSYNAPS_VOICE_WARMUP=1
WHISPER_MODEL=tiny
DEEPSYNAPS_AGENT_CRON_ENABLED=1
DEEPSYNAPS_AUTO_PAGE_ENABLED=1
DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED=1
DEEPSYNAPS_QEEG_105_WORKER_ENABLED=1
DEEPSYNAPS_DEMO_CLINIC_SEED=1
```

### Appendix B: Fly Secrets Commands

```bash
# Staging secrets management
fly secrets set JWT_SECRET_KEY="..." --app deepsynaps-protocol-studio-staging
fly secrets set DEEPSYNAPS_SECRETS_KEY="..." --app deepsynaps-protocol-studio-staging
fly secrets set STRIPE_SECRET_KEY="sk_test_..." --app deepsynaps-protocol-studio-staging
fly secrets set STRIPE_WEBHOOK_SECRET="whsec_test_..." --app deepsynaps-protocol-studio-staging
fly secrets set CELERY_BROKER_URL="rediss://..." --app deepsynaps-protocol-studio-staging
fly secrets set WEARABLE_TOKEN_ENC_KEY="..." --app deepsynaps-protocol-studio-staging
fly secrets set SENTRY_DSN="https://..." --app deepsynaps-protocol-studio-staging

# Production secrets management
fly secrets set JWT_SECRET_KEY="..." --app deepsynaps-protocol-studio
fly secrets set DEEPSYNAPS_SECRETS_KEY="..." --app deepsynaps-protocol-studio
fly secrets set STRIPE_SECRET_KEY="sk_live_..." --app deepsynaps-protocol-studio
fly secrets set STRIPE_WEBHOOK_SECRET="whsec_..." --app deepsynaps-protocol-studio
fly secrets set CELERY_BROKER_URL="rediss://..." --app deepsynaps-protocol-studio
fly secrets set WEARABLE_TOKEN_ENC_KEY="..." --app deepsynaps-protocol-studio
fly secrets set SENTRY_DSN="https://..." --app deepsynaps-protocol-studio
```

### Appendix C: Environment Validation Script

```bash
#!/bin/bash
# scripts/validate_environment.sh

ENV=$1

case $ENV in
  development)
    [[ "$DEEPSYNAPS_APP_ENV" == "development" ]] || exit 1
    [[ "$STRIPE_SECRET_KEY" == sk_test_* ]] || exit 1
    [[ "$DEEPSYNAPS_DEMO_CLINIC_SEED" == "1" ]] || exit 1
    echo "Development environment validated"
    ;;
  test)
    [[ "$DEEPSYNAPS_APP_ENV" == "test" ]] || exit 1
    [[ "$CELERY_TASK_ALWAYS_EAGER" == "True" ]] || exit 1
    echo "Test environment validated"
    ;;
  staging)
    [[ "$DEEPSYNAPS_APP_ENV" == "staging" ]] || exit 1
    [[ "$STRIPE_SECRET_KEY" == sk_test_* ]] || exit 1
    [[ "$DEEPSYNAPS_DEMO_CLINIC_SEED" == "0" ]] || exit 1
    [[ -n "$SENTRY_DSN" ]] || exit 1
    echo "Staging environment validated"
    ;;
  production)
    [[ "$DEEPSYNAPS_APP_ENV" == "production" ]] || exit 1
    [[ "$STRIPE_SECRET_KEY" == sk_live_* ]] || exit 1
    [[ "$MRI_DEMO_MODE" == "0" ]] || exit 1
    [[ "$DEEPSYNAPS_DEMO_CLINIC_SEED" == "0" ]] || exit 1
    [[ -n "$SENTRY_DSN" ]] || exit 1
    [[ -n "$JWT_SECRET_KEY" ]] || exit 1
    [[ ${#JWT_SECRET_KEY} -ge 32 ]] || exit 1
    echo "Production environment validated"
    ;;
  *)
    echo "Unknown environment: $ENV"
    exit 1
    ;;
esac
```

### Appendix D: Contact & Escalation

| Role | Responsibility | Escalation Path |
|------|---------------|----------------|
| On-Call Engineer | First responder | PagerDuty rotation |
| DevOps Lead | Infrastructure, deployments | Direct (Slack: @devops-lead) |
| QA Lead | Testing, validation gates | Direct (Slack: @qa-lead) |
| Clinical Safety Officer | Patient safety, clinical review | Direct (Slack: @clinical-safety) |
| Security Lead | Security incidents, secrets | Direct (Slack: @security-lead) |
| Platform Team | Fly.io, Upstash, Netlify | Platform vendor support |

---

## 11. Document Maintenance

| Trigger | Action | Owner |
|---------|--------|-------|
| New environment variable added | Update matrix tables | DevOps |
| New feature flag added | Update Section 7 | Backend Lead |
| New integration added | Update integration matrix | DevOps |
| Secrets rotation procedure changes | Update Section 5 | Security Lead |
| Promotion rules change | Update Section 4 | DevOps Lead |
| Quarterly review | Full document review | DevOps Lead + QA Lead |

---

*End of Environment Matrix Document*
