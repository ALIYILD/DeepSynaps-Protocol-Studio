# Phase 2C: Staging Deployment Guide
## DeepSynaps Protocol Studio — Production Readiness

**Objective:** Deploy all new production infrastructure to staging, validate everything works, and achieve staging sign-off.

**Prerequisites:**
- `feature/production-readiness` branch is pushed and CI passes
- You have `flyctl` installed and authenticated (`flyctl auth login`)
- You have access to the staging environment secrets
- Staging database is accessible and has recent data

---

## Staging Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    STAGING ENVIRONMENT                           │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Fly.io App  │  │  Prometheus  │  │   Grafana    │         │
│  │  (deepsynaps- │  │  (metrics    │  │  (dashboards │         │
│  │   studio-stg) │  │   storage)   │  │   & alerts)  │         │
│  │               │  │              │  │              │         │
│  │  ┌─────────┐ │  │              │  │              │         │
│  │  │ FastAPI │ │  │              │  │              │         │
│  │  │  +      │◄─┼──┤ scrape     │  │  ◄───────────┼──┐     │
│  │  │Metrics  │ │  │              │  │              │  │     │
│  │  │Endpoint │ │  │              │  │              │  │     │
│  │  └────┬────┘ │  └──────────────┘  └──────────────┘  │     │
│  │       │      │        ▲                    ▲         │     │
│  │       │      │        │                    │         │     │
│  │  ┌────▼────┐ │  ┌─────┴────────┐    ┌──────┴──────┐ │     │
│  │  │  Health │ │  │ AlertManager │    │  Slack/     │ │     │
│  │  │ Checks  │ │  │  (routing)   │    │  PagerDuty  │ │     │
│  │  └─────────┘ │  └──────────────┘    └─────────────┘ │     │
│  └──────────────┘                                         │     │
│                                                           │     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │     │
│  │  Celery      │  │   Redis      │  │  PostgreSQL  │   │     │
│  │  Workers     │  │  (broker)    │  │  (database)  │   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘   │     │
│                                                           │     │
│  ┌──────────────┐  ┌──────────────┐                      │     │
│  │  Persistent  │  │  Backup      │                      │     │
│  │  Volume      │  │  (S3)        │◄─────────────────────┘     │
│  │  (/data)     │  │              │                            │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Pre-Deployment Setup (15 minutes)

### 1.1 Ensure you're on the right branch
```bash
git checkout feature/production-readiness
git pull origin feature/production-readiness
```

### 1.2 Verify local environment
```bash
# Check flyctl
flyctl version

# Verify auth
flyctl auth whoami

# Check Docker (for local testing)
docker --version
```

### 1.3 Set staging environment variables
```bash
# Set staging-specific env vars on Fly
flyctl secrets set --app deepsynaps-studio \
  DEEPSYNAPS_APP_ENV=staging \
  PROMETHEUS_ENABLED=1 \
  METRICS_ENDPOINT=/metrics

# Optional: Set up alerting (if you have Slack webhook)
flyctl secrets set --app deepsynaps-studio \
  SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

---

## Part 2: Deploy Application with Monitoring (10 minutes)

### 2.1 Deploy using the existing deploy script
```bash
# Option A: Use existing deploy script (recommended)
./scripts/deploy-preview.sh --api

# Option B: Direct fly deploy
cd apps/api
flyctl deploy --config fly.toml --app deepsynaps-studio
```

### 2.2 Verify deployment health
```bash
# Check app status
flyctl status --app deepsynaps-studio

# Check logs
flyctl logs --app deepsynaps-studio --tail

# Test health endpoint
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# Test metrics endpoint (should return Prometheus metrics)
curl -s https://deepsynaps-studio.fly.dev/metrics | head -20
```

### 2.3 Expected metrics output
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",endpoint="/health",status="200"} 3.0
# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",endpoint="/health",le="0.01"} 2.0
...
```

---

## Part 3: Verify Monitoring Integration (10 minutes)

### 3.1 Test all monitoring metrics endpoints
```bash
BASE_URL="https://deepsynaps-studio.fly.dev"

# Request counter
curl -s "$BASE_URL/health" > /dev/null
curl -s "$BASE_URL/metrics" | grep http_requests_total

# Clinical operations counter
curl -s "$BASE_URL/api/v1/protocols" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
curl -s "$BASE_URL/metrics" | grep clinical_operations_total

# Active sessions gauge
curl -s "$BASE_URL/metrics" | grep active_sessions

# Error rate
curl -s "$BASE_URL/metrics" | grep error_rate_total
```

### 3.2 Verify middleware is collecting data
```bash
# Make several requests and check metrics are incrementing
for i in {1..5}; do curl -s "$BASE_URL/health" > /dev/null; done
curl -s "$BASE_URL/metrics" | grep 'http_requests_total{method="GET",endpoint="/health"}'
# Value should be 5 or higher
```

---

## Part 4: Run Security Scan (15 minutes)

### 4.1 Run local security audit
```bash
# Full audit (excludes checks requiring external tools)
./scripts/security-audit.sh --severity high

# Check specific areas
./scripts/security-audit.sh --checks bandit,headers,deps
```

### 4.2 Validate security headers
```bash
./scripts/check-security-headers.sh "$BASE_URL"
```

### 4.3 Run dependency audit
```bash
# Python dependencies
cd apps/api && pip-audit --desc

# Node.js dependencies
cd apps/web && npm audit --audit-level=high
```

**Expected:** Zero critical/high findings.

---

## Part 5: Run Deployment Checklist (10 minutes)

### 5.1 Execute full checklist
```bash
./scripts/deployment-checklist.sh full staging
```

### 5.2 Verify specific checks
```bash
# SSL certificate
openssl s_client -connect deepsynaps-studio.fly.dev:443 -servername deepsynaps-studio.fly.dev < /dev/null 2>/dev/null | openssl x509 -noout -dates

# API response time (should be <200ms)
curl -w "\nTime: %{time_total}s\n" -o /dev/null -s "$BASE_URL/health"

# Database migration status
curl -s "$BASE_URL/api/v1/health" | jq '.database.migration'
```

---

## Part 6: Test Backup Procedures (10 minutes)

### 6.1 Test backup script (dry-run)
```bash
# Set required env vars for backup
export DEEPSYNAPS_DATABASE_URL="postgresql://..."  # Your staging DB URL
export BACKUP_S3_BUCKET="deepsynaps-staging-backups"
export BACKUP_ENCRYPTION_KEY="$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")"

# Run dry-run backup
./scripts/backup-database.sh --dry-run

# Run actual backup (creates real backup)
./scripts/backup-database.sh
```

### 6.2 Verify backup
```bash
# List available backups
./scripts/restore-database.sh --list

# Verify latest backup
./scripts/backup-verify.sh
```

---

## Part 7: Run Load Tests (20 minutes)

### 7.1 Install Locust (if not already installed)
```bash
pip install locust
```

### 7.2 Run load test against staging
```bash
# Set target
export TARGET_HOST="https://deepsynaps-studio.fly.dev"

# Quick smoke test (10 users, 1 minute)
cd tests/load
locust -f locustfile.py --host "$TARGET_HOST" -u 10 -r 2 -t 60s --headless

# Standard load test (50 users, 5 minutes)
locust -f locustfile.py --host "$TARGET_HOST" -u 50 -r 5 -t 300s --headless --csv=load-test-results
```

### 7.3 Verify SLO compliance
```bash
# Check P95 latency is <200ms
curl -s "$BASE_URL/metrics" | grep 'http_request_duration_seconds{quantile="0.95"}'

# Check error rate is <0.1%
curl -s "$BASE_URL/metrics" | grep error_rate_total
```

**Expected:**
- P95 latency: <200ms
- Error rate: <0.1%
- No 5xx errors

---

## Part 8: Staging Sign-Off Checklist

Before proceeding to production, ALL of the following must be ✅:

### Application Health
- [ ] App deploys successfully without errors
- [ ] `/health` endpoint returns 200
- [ ] `/metrics` endpoint returns Prometheus metrics
- [ ] `/api/v1/health` returns detailed health status
- [ ] All existing API endpoints still work
- [ ] Frontend loads correctly

### Monitoring
- [ ] Metrics are being collected (request count increments)
- [ ] Clinical operation metrics are present
- [ ] Error tracking is working
- [ ] Request duration histograms are populated

### Security
- [ ] Security audit: 0 critical/high findings
- [ ] Security headers are set correctly
- [ ] All endpoints require authentication (except health/metrics)
- [ ] Rate limiting is active

### Performance
- [ ] P95 latency <200ms on `/health`
- [ ] P95 latency <500ms on API endpoints
- [ ] Load test completes without errors
- [ ] Error rate <0.1%

### Backup & Recovery
- [ ] Backup script runs successfully
- [ ] Backup file is created and non-empty
- [ ] Backup verification passes
- [ ] Restore procedure documented and tested (dry-run)

### Deployment Pipeline
- [ ] Blue-green deployment script works (syntax validated)
- [ ] Rollback script works (syntax validated)
- [ ] Deployment checklist runs without errors

### Documentation
- [ ] Runbooks are accessible in `docs/runbooks/`
- [ ] Incident response procedure reviewed
- [ ] On-call playbook reviewed

---

## Troubleshooting

### Metrics endpoint not found (404)
```bash
# Check if monitoring middleware is loaded
flyctl logs --app deepsynaps-studio | grep -i "monitor\|metrics"

# Verify prometheus_client is installed
flyctl ssh console --app deepsynaps-studio
python3 -c "import prometheus_client; print(prometheus_client.__version__)"
```

### High latency on staging
```bash
# Check if Whisper model is pre-loaded
flyctl logs --app deepsynaps-studio | grep -i "whisper\|warmup"

# Check VM resources
flyctl status --app deepsynaps-studio --all
```

### Backup fails
```bash
# Check database connectivity
flyctl ssh console --app deepsynaps-studio
psql "$DEEPSYNAPS_DATABASE_URL" -c "SELECT 1;"

# Check S3/curl availability
which curl && curl --version | head -1
```

---

## Phase 2C Completion Criteria

Phase 2C is complete when:
1. ✅ Application deployed to staging with monitoring
2. ✅ All metrics endpoints return data
3. ✅ Security audit passes (0 critical/high)
4. ✅ Deployment checklist passes
5. ✅ Backup/verify cycle completes
6. ✅ Load tests pass (P95<200ms, error<0.1%)
7. ✅ Staging sign-off checklist is fully checked

Once complete, proceed to **Phase 2D: Production Cutover**.

---

*Generated: 2026-05-14 | Phase 2C: STAGING DEPLOYMENT GUIDE*
