# DeepSynaps Protocol Studio — Rollback Runbook

## Document Information

| Field            | Value                                    |
|------------------|------------------------------------------|
| **Version**      | 1.0.0                                    |
| **Last Updated** | 2025-01-15                               |
| **Owner**        | Platform Engineering Team                |
| **Classification** | Internal — Clinical Systems              |
| **Review Cycle** | Quarterly                                |
| **SLA Target**   | Rollback complete in < 5 minutes         |

## Purpose

This runbook provides step-by-step procedures for rolling back the DeepSynaps Protocol Studio deployment. Given the clinical nature of this platform — serving patient data through 130+ FastAPI routers — rollback procedures prioritize **data integrity** and **rapid restoration of service**.

## Rollback Triggers

### Automatic Triggers

The following conditions trigger an **automatic rollback** of the deployment pipeline:

- Health endpoint fails for > 2 minutes after traffic switch
- > 5% error rate on critical API routes
- Database connection pool exhaustion
- Memory usage exceeding 95% on app VMs
- Any patient data integrity alarm

### Manual Triggers

The following conditions require **manual rollback decision**:

- Functional regression discovered post-deployment
- Performance degradation (response time > 10s)
- Third-party service integration failure
- Security vulnerability discovered in deployed version

---

## Rollback Methods

### Method 1: GitHub Actions Automated Rollback (Recommended)

The rollback workflow is defined in `.github/workflows/rollback.yml`.

#### Automatic Rollback

The rollback workflow triggers automatically when the blue-green deployment workflow fails. It:

1. Detects the failed deployment
2. Abandons the green environment
3. Keeps blue serving traffic (no traffic was switched)
4. Sends notification to `#deployments`

#### Manual Rollback via workflow_dispatch

1. Navigate to **Actions > Rollback** in GitHub
2. Click **Run workflow**
3. Configure parameters:

| Parameter     | Description                                          | Required |
|---------------|------------------------------------------------------|----------|
| Environment   | `staging` or `production`                            | Yes      |
| Rollback type | `previous_version`, `green_abandon`, `db_rollback`  | Yes      |
| Confirmation  | Type `ROLLBACK` for production                       | Yes*     |
| Reason        | Why rollback is needed                               | Yes      |
| Notify Slack  | Send Slack notification                              | No       |

\* Required only for production.

4. Click **Run workflow**

#### Rollback Types Explained

| Type                | Use Case                                     | Database Impact  | Duration |
|---------------------|----------------------------------------------|------------------|----------|
| `green_abandon`     | Green deployed but traffic not switched      | None             | ~1 min   |
| `previous_version`  | Need to revert to previous release           | None (app only)  | ~3 min   |
| `db_rollback`       | Database migration must also be reverted     | Manual steps     | ~10 min  |

---

### Method 2: Local Script Rollback

Use the `rollback.sh` script for direct rollback from your machine.

#### Quick Rollback (Green Abandon)

```bash
# Rollback staging — abandon green, keep blue running
./scripts/rollback.sh staging --reason "API errors after deploy"
```

#### Rollback to Previous Version

```bash
# Rollback production to previous release
./scripts/rollback.sh production \
    --reason "Critical patient data endpoint returning 500" \
    --type previous_version
```

#### Rollback with Database Warnings

```bash
# Rollback with database migration warnings
./scripts/rollback.sh production \
    --reason "Migration caused data inconsistency" \
    --type db_rollback
```

#### Dry Run

```bash
# Simulate rollback without making changes
./scripts/rollback.sh staging --reason "Testing rollback procedure" --dry-run
```

---

### Method 3: Emergency Manual Rollback

> **⚠️ WARNING**: Use only when automated and scripted methods are unavailable.

#### Emergency Green Abandon

```bash
# Scale green to 0 (if green was the problematic deployment)
flyctl scale count 0 --app deepsynaps-studio-green --yes

# Ensure blue is running
flyctl scale count 1 --app deepsynaps-studio --yes

# Verify health
curl -fsS https://deepsynaps-studio.fly.dev/health
```

#### Emergency Previous Version

```bash
# List recent releases
flyctl releases list --app deepsynaps-studio

# Get the previous stable image
PREV_IMAGE=$(flyctl releases list --app deepsynaps-studio --json | \
    jq -r '[.[] | select(.Stable == true)][1].ImageRef')

# Deploy previous image
flyctl deploy --app deepsynaps-studio --image "$PREV_IMAGE" --yes --strategy immediate

# Verify
for i in {1..30}; do
    curl -fsS https://deepsynaps-studio.fly.dev/health && break
    sleep 2
done
```

---

## Rollback Decision Flowchart

```
┌──────────────────────────────────────────┐
│         Issue Detected                   │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Is patient data at risk?                │
│  (data corruption, unauthorized access)  │
└──────────────┬───────────────────────────┘
               │
         YES ──┼── NO
               │               │
               ▼               ▼
┌──────────────────┐  ┌────────────────────┐
│ IMMEDIATE ROLLBACK│  │ Is service down?   │
│ (any method)     │  │ (500 errors, no    │
│                  │  │ health response)   │
└──────────────────┘  └─────────┬──────────┘
                                │
                          YES ──┼── NO
                                │          │
                                ▼          ▼
                          ┌──────────┐  ┌────────────────┐
                          │ ROLLBACK  │  │ Is there a      │
                          │ (< 5 min) │  │ performance     │
                          │           │  │ regression?     │
                          └──────────┘  └───────┬────────┘
                                                  │
                                            YES ──┼── NO
                                                  │        │
                                                  ▼        ▼
                                            ┌──────────┐  ┌──────────┐
                                            │ ROLLBACK  │  │ MONITOR   │
                                            │ (< 5 min) │  │ and       │
                                            │           │  │ document  │
                                            └──────────┘  └──────────┘
```

---

## Rollback Procedures by Scenario

### Scenario 1: Green Deployed, Traffic NOT Switched

**Situation**: The deployment pipeline failed during green deployment or smoke tests.

**Impact**: Zero — blue is still serving all traffic.

**Procedure**:

```bash
# Method: green_abandon (default)
./scripts/rollback.sh staging --reason "Smoke tests failed"
```

**What happens**:
1. Green app is scaled to 0
2. Blue app continues serving traffic unaffected
3. Team is notified via Slack

**Verification**:

```bash
# Confirm blue is healthy
curl -fsS https://deepsynaps-studio.fly.dev/health

# Confirm green is down
flyctl status --app deepsynaps-studio-green
# Expected: 0 machines
```

---

### Scenario 2: Traffic Switched, Blue is Unhealthy

**Situation**: Traffic was switched to the new version, but the live app is failing.

**Impact**: Patients may be unable to access their data.

**Procedure**:

```bash
# Method: previous_version (roll back to last known good)
./scripts/rollback.sh production \
    --reason "Health endpoint failing after traffic switch" \
    --type previous_version
```

**What happens**:
1. Blue app is redeployed with the previous Docker image
2. Green app is scaled to 0
3. Blue app is verified healthy
4. Team is notified

**Timeline**:

| Phase              | Duration |
|--------------------|----------|
| Detect issue       | ~1 min   |
| Decision to rollback | ~1 min  |
| Rollback execution | ~2 min   |
| Verification       | ~1 min   |
| **Total**          | **~5 min** |

**Verification**:

```bash
# Run full post-deploy checklist
./scripts/deployment-checklist.sh post production

# Check application logs for errors
flyctl logs --app deepsynaps-studio --limit 50
```

---

### Scenario 3: Database Migration Causes Issues

**Situation**: A database migration is causing data integrity issues or application errors.

**Impact**: HIGH — patient data may be affected.

**⚠️ CRITICAL**: This scenario requires manual database intervention. The application rollback does NOT revert migrations.

**Procedure**:

#### Step 1: Application Rollback (Immediate)

```bash
# Roll back the application first to stop the bleeding
./scripts/rollback.sh production \
    --reason "Database migration causing patient data errors" \
    --type db_rollback
```

This will:
- Roll back the application to the previous version
- Print database rollback warnings and checklist

#### Step 2: Database Assessment (Before Migration Rollback)

```bash
# Check current migration version
flyctl ssh console --app deepsynaps-studio -C \
    'cd /app/apps/api && python -m alembic current'

# View migration history
flyctl ssh console --app deepsynaps-studio -C \
    'cd /app/apps/api && python -m alembic history'

# Check for data integrity issues (example query)
flyctl ssh console --app deepsynaps-studio -C \
    'cd /app/apps/api && python -c "
import asyncio
from app.persistence.database import get_db_session
async def check():
    async with get_db_session() as db:
        # Add your integrity check here
        print(\"Database connection OK\")
asyncio.run(check())
"'
```

#### Step 3: Database Rollback (Requires DBA Approval)

> **⚠️ HIPAA WARNING**: Before reverting any migration that touched patient data:
> - [ ] Verify a backup exists from before the deployment
> - [ ] Document the reason for the rollback
> - [ ] Get approval from the clinical data steward
> - [ ] Plan data validation after the rollback

```bash
# Connect to the app console
flyctl ssh console --app deepsynaps-studio

# Navigate to the API directory
cd /app/apps/api

# Check what downgrade would do (dry run)
python -m alembic downgrade -1 --sql

# Execute the downgrade
python -m alembic downgrade -1

# Verify the migration status
python -m alembic current
```

#### Step 4: Data Integrity Verification

```bash
# Run integrity checks specific to the reverted migration
# (These will vary based on what the migration changed)

# Example: Verify patient record count is consistent
# Example: Verify no orphaned records exist
# Example: Verify foreign key constraints are intact
```

#### Step 5: Post-Rollback Monitoring

- Monitor error rates for 1 hour
- Verify all patient-facing endpoints respond correctly
- Check background job processing (qEEG, Stripe)
- Confirm clinical team is aware of any data changes

---

### Scenario 4: Partial Rollback (Green Kept as Hot Standby)

**Situation**: You want to roll back traffic to blue but keep green running for investigation.

**Procedure**:

```bash
# Scale blue up (ensure it's running)
flyctl scale count 1 --app deepsynaps-studio --yes

# Scale green down to 0 (but don't destroy)
flyctl scale count 0 --app deepsynaps-studio-green --yes

# Verify blue is serving
curl -fsS https://deepsynaps-studio.fly.dev/health

# Green can be investigated later
flyctl logs --app deepsynaps-studio-green
```

---

## Post-Rollback Checklist

### Immediate (0-5 minutes)

- [ ] Blue app is serving traffic and healthy
- [ ] Health endpoint returns 200 OK
- [ ] Response time is < 5 seconds
- [ ] Critical API routes respond correctly
- [ ] No errors in application logs
- [ ] Green app is stopped or destroyed

### Short-term (5-30 minutes)

- [ ] All patient-facing features are functional
- [ ] Background workers are processing jobs
- [ ] No new errors in Sentry
- [ ] Database connections are stable
- [ ] On-call engineer has been notified

### Long-term (1-24 hours)

- [ ] Error rates returned to baseline
- [ ] Root cause analysis has been initiated
- [ ] Incident timeline has been documented
- [ ] Fix for the original issue is being developed
- [ ] Clinical team has been notified (if patient data was affected)

---

## Rollback Verification Commands

### Quick Verification

```bash
# 1. Health check
curl -fsS https://deepsynaps-studio.fly.dev/health | jq .

# 2. Critical endpoints
for endpoint in /api/v1/conditions /api/v1/devices /api/v1/modalities; do
    code=$(curl -s -o /dev/null -w "%{http_code}" "https://deepsynaps-studio.fly.dev${endpoint}")
    echo "$endpoint: HTTP $code"
done

# 3. SSL certificate
echo | openssl s_client -servername deepsynaps-studio.fly.dev \
    -connect deepsynaps-studio.fly.dev:443 2>/dev/null | openssl x509 -noout -dates

# 4. Response time
curl -fsS -o /dev/null -w "Response time: %{time_total}s\n" \
    https://deepsynaps-studio.fly.dev/health
```

### Full Verification

```bash
# Run the complete post-deployment checklist
./scripts/deployment-checklist.sh post production
```

---

## Communication Templates

### Slack — Rollback Initiated

```
🚨 ROLLBACK INITIATED
Environment: production
Reason: [insert reason]
Initiated by: @username
Type: previous_version
ETA: < 5 minutes
```

### Slack — Rollback Complete

```
✅ ROLLBACK COMPLETE
Environment: production
Duration: 3m 24s
App: deepsynaps-studio
Status: Healthy and serving traffic
Next: Root cause analysis in progress
```

### Slack — Rollback with Database Impact

```
⚠️ ROLLBACK COMPLETE — DATABASE ACTION REQUIRED
Environment: production
Duration: 4m 12s
App: Healthy and serving traffic
⚠️ Database migration [migration_name] was reverted
⚠️ Clinical data team: please verify data integrity
Incident: [link to incident doc]
```

---

## Prevention

### Pre-Deployment Measures

1. **Thorough testing** — All changes must pass CI, coverage gates, and E2E tests
2. **Staging validation** — Minimum 24-hour staging soak time before production
3. **Database migration review** — All migrations reviewed by DBA
4. **Feature flags** — Use feature flags for risky changes to enable quick disable
5. **Gradual rollout** — Consider canary deployments for high-risk changes

### Detection Improvements

1. **Monitoring** — Ensure all critical endpoints have alerting
2. **Smoke tests** — Expand smoke test coverage for critical patient workflows
3. **Synthetic monitoring** — Run continuous synthetic tests against production
4. **Error budgets** — Define acceptable error rates and alert on breaches

---

## Escalation Path

```
Issue Detected
    │
    ▼
┌─────────────────┐    No response in 5 min
│ On-Call Engineer │ ────────────────────►
└────────┬────────┘
         │
         ▼
┌─────────────────┐    No resolution in 15 min
│ Platform Lead    │ ────────────────────►
└────────┬────────┘
         │
         ▼
┌─────────────────┐    Patient data at risk
│ Clinical Lead    │ ────────────────────►
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ CTO / VP Eng     │
└─────────────────┘
```

---

## Related Documents

- [Deployment Runbook](./deployment-runbook.md)
- [Blue-Green Deploy Script](../../scripts/deploy-blue-green.sh)
- [Rollback Script](../../scripts/rollback.sh)
- [Deployment Checklist Script](../../scripts/deployment-checklist.sh)
- [GitHub Actions — Deploy](../../.github/workflows/deploy-blue-green.yml)
- [GitHub Actions — Rollback](../../.github/workflows/rollback.yml)
- [HIPAA Compliance Policy](../../../docs/compliance/)

---

## Change Log

| Date       | Version | Author | Changes                                  |
|------------|---------|--------|------------------------------------------|
| 2025-01-15 | 1.0.0   | Platform Eng | Initial runbook creation              |
