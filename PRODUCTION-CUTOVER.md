# Phase 2D: Production Cutover Plan
## DeepSynaps Protocol Studio — Production Readiness

**Objective:** Deploy all validated infrastructure from staging to production with zero downtime.

**Prerequisites:** Phase 2C staging sign-off must be complete (all checklists passed).

---

## Production Cutover Timeline

### Decision: Blue-Green vs Direct Deploy

Given your current Fly.io setup (single app `deepsynaps-studio`), you have two options:

**Option A: Blue-Green (Recommended)**
- Zero downtime
- Instant rollback
- Requires second Fly app
- More complex

**Option B: Direct Deploy with Health Checks (Simpler)**
- Uses existing `fly deploy --strategy immediate`
- ~30-60 seconds of rolling restart
- Built-in health check gating
- Simpler to execute

For first production deployment, **Option B is recommended** — the Fly.io rolling deploy with health checks provides sufficient safety. Blue-green can be enabled later.

---

## Pre-Cutover Checklist (24 hours before)

### 1. Communication
- [ ] Notify team of planned maintenance window
- [ ] Post in #engineering Slack channel
- [ ] Confirm on-call engineer availability
- [ ] Prepare rollback communication template

### 2. Data Protection
- [ ] Run production database backup: `./scripts/backup-database.sh`
- [ ] Verify backup integrity: `./scripts/backup-verify.sh`
- [ ] Confirm backup is restorable (document restore time)
- [ ] Note current production commit hash: `git rev-parse HEAD`

### 3. Validation
- [ ] Confirm staging sign-off is complete
- [ ] Review all changes in `feature/production-readiness` branch
- [ ] Run security audit: `./scripts/security-audit.sh`
- [ ] Check for uncommitted changes: `git status`

### 4. Monitoring
- [ ] Verify Sentry is receiving events
- [ ] Confirm error alerting channels work
- [ ] Check current error rate (should be <0.1%)
- [ ] Document current P95 latency baseline

---

## Production Cutover Procedure

### Step 0: Prepare (5 minutes)

```bash
# Terminal 1: Watch logs
flyctl logs --app deepsynaps-studio --tail

# Terminal 2: Run commands
export PROD_APP="deepsynaps-studio"
export FEATURE_BRANCH="feature/production-readiness"

# Verify current state
CURRENT_COMMIT=$(flyctl ssh console --app "$PROD_APP" --command "cat /app/.git-commit" 2>/dev/null || echo "unknown")
echo "Current production commit: $CURRENT_COMMIT"

# Pull latest
git checkout main
git pull origin main
git checkout "$FEATURE_BRANCH"
git pull origin "$FEATURE_BRANCH"

# Backup database
./scripts/backup-database.sh
echo "Backup complete at $(date)"
```

### Step 1: Pre-Deploy Verification (5 minutes)

```bash
# Run deployment checklist
./scripts/deployment-checklist.sh full production

# Verify critical secrets are set
flyctl secrets list --app "$PROD_APP" | grep -E "JWT_SECRET_KEY|DEEPSYNAPS_DATABASE_URL|DEEPSYNAPS_SECRETS_KEY"

# Check database migration status
curl -s "https://deepsynaps-studio.fly.dev/api/v1/health" | jq '.database.migration'
```

### Step 2: Deploy to Production (10 minutes)

```bash
# Merge feature branch to main
git checkout main
git merge --no-ff "$FEATURE_BRANCH" -m "feat(production): deploy production readiness package

Includes:
- Prometheus metrics collection
- Blue-green deployment pipeline
- Automated security scanning
- Backup and disaster recovery
- 20+ operational runbooks
- Frontend coverage enforcement

Staging sign-off: $(date -u +%Y-%m-%d)"

# Deploy
git push origin main
cd apps/api
flyctl deploy --app "$PROD_APP" --wait-timeout=600

# Tag the release
git tag -a "production-$(date -u +%Y%m%d-%H%M)" -m "Production deployment $(date -u)"
git push origin --tags
```

### Step 3: Post-Deploy Verification (10 minutes)

```bash
BASE_URL="https://deepsynaps-studio.fly.dev"

# 1. Health checks
for i in {1..5}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
  echo "Health check $i: $STATUS"
  sleep 2
done

# 2. Metrics endpoint
METRICS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/metrics")
echo "Metrics endpoint: $METRICS_STATUS"

# 3. Key metrics present
curl -s "$BASE_URL/metrics" | grep -E "http_requests_total|clinical_operations_total|active_sessions" | head -5

# 4. Response time
for i in {1..10}; do
  TIME=$(curl -s -o /dev/null -w "%{time_total}" "$BASE_URL/health")
  echo "Request $i: ${TIME}s"
done

# 5. SSL certificate
echo | openssl s_client -connect "deepsynaps-studio.fly.dev:443" -servername "deepsynaps-studio.fly.dev" 2>/dev/null | openssl x509 -noout -dates

# 6. Fly status
flyctl status --app "$PROD_APP"

# 7. Database check
curl -s "$BASE_URL/api/v1/health" | jq '{status: .status, database: .database.status, migration: .database.migration}'

# 8. Frontend loads
curl -s -o /dev/null -w "Frontend: %{http_code}\n" "$BASE_URL/"
```

### Step 4: Critical Path Smoke Tests (10 minutes)

Test the most critical user flows:

```bash
# You can also run the existing E2E tests
# cd apps/web && npx playwright test --project=chromium --grep "@critical"

# Or test manually via the staging checklist:
./scripts/staging-checklist.sh --auto
```

### Step 5: Enable Monitoring (After 30 min stability)

```bash
# Set monitoring secrets
flyctl secrets set --app "$PROD_APP" \
  PROMETHEUS_ENABLED=1 \
  METRICS_ENDPOINT=/metrics

# Restart to pick up new env vars
flyctl deploy --app "$PROD_APP" --strategy immediate

# Verify metrics are flowing
curl -s "$BASE_URL/metrics" | grep -E "http_requests_total|http_request_duration_seconds" | head -5
```

---

## Rollback Procedure (If Needed)

If ANY critical issue is detected:

### Option A: Fast Rollback (1-2 minutes)
```bash
# Roll back to previous release
flyctl deploy --app "$PROD_APP" --image "registry.fly.io/${PROD_APP}:$(git rev-parse HEAD~1)"

# Or use flyctl rollback
flyctl deploy --app "$PROD_APP" --image $(flyctl releases list --app "$PROD_APP" | grep -v "v.*current" | head -2 | tail -1 | awk '{print $2}')
```

### Option B: Full Rollback (5 minutes)
```bash
# Use the rollback script
./scripts/rollback.sh production --strategy=previous

# This will:
# 1. Verify current state
# 2. Roll back database migrations (if needed)
# 3. Deploy previous Docker image
# 4. Verify rollback health
# 5. Send notification
```

### Option C: Emergency Manual Rollback
```bash
# If all else fails — revert the merge and redeploy
git checkout main
git revert HEAD --no-edit  # Reverts the merge commit
git push origin main
cd apps/api && flyctl deploy --app "$PROD_APP"
```

---

## Post-Cutover Tasks (Within 24 hours)

- [ ] Monitor error rate for 2 hours
- [ ] Monitor P95 latency for 2 hours
- [ ] Confirm metrics are collecting correctly
- [ ] Verify backup ran successfully
- [ ] Send deployment summary to team
- [ ] Update runbooks with any lessons learned
- [ ] Schedule first DR drill (within 2 weeks)
- [ ] Enable frontend coverage enforcement in CI

---

## Emergency Contacts & Escalation

| Role | Contact | When |
|------|---------|------|
| Primary on-call | (fill in) | Any production issue |
| Secondary on-call | (fill in) | If primary unreachable |
| Engineering lead | (fill in) | Severity 1-2 incidents |
| Clinical safety | (fill in) | Patient data concerns |

---

*Generated: 2026-05-14 | Phase 2D: PRODUCTION CUTOVER PLAN*
