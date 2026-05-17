# DeepSynaps Protocol Studio — ROLLBACK RUNBOOK

> **Document ID:** ROLLBACK-RB-001  
> **Version:** 1.0.0  
> **Owner:** SRE / Platform Engineering  
> **Last Updated:** 2025-01-15  
> **Classification:** INTERNAL — OPERATIONS  
> **Related Docs:** DEPLOYMENT_GUIDE.md, INCIDENT_RESPONSE.md, DR_PLAN.md, DB_RECOVERY.md  

---

## TABLE OF CONTENTS

1. [Overview](#1-overview)
2. [Incident Classification](#2-incident-classification)
3. [Architecture Reference](#3-architecture-reference)
4. [Pre-Rollback Checklist](#4-pre-rollback-checklist)
5. [Scenario 1: Bad Code Deploy](#5-scenario-1-bad-code-deploy)
6. [Scenario 2: Bad Migration](#6-scenario-2-bad-migration)
7. [Scenario 3: Configuration Error](#7-scenario-3-configuration-error)
8. [Scenario 4: External Dependency Failure](#8-scenario-4-external-dependency-failure)
9. [Scenario 5: Security Incident](#9-scenario-5-security-incident)
10. [Post-Rollback Verification](#10-post-rollback-verification)
11. [Rollback Decision Tree](#11-rollback-decision-tree)
12. [Communication Template](#12-communication-template)
13. [Escalation Matrix](#13-escalation-matrix)
14. [Appendix A: Reference Commands](#appendix-a-reference-commands)
15. [Appendix B: Common Error Patterns](#appendix-b-common-error-patterns)
16. [Appendix C: Recovery Time Objectives](#appendix-c-recovery-time-objectives)

---

## 1. OVERVIEW

### 1.1 Purpose

This runbook provides step-by-step rollback procedures for the DeepSynaps Protocol Studio platform deployed on Fly.io. It covers five primary failure scenarios and gives operators exact commands, verification steps, and escalation paths to restore service safely and predictably.

### 1.2 When to Use This Runbook

Use this runbook when:
- A production deployment introduces critical bugs or regressions
- A database migration fails or corrupts data
- Configuration changes cause service-wide failures
- An external dependency outage cascades into our platform
- A security incident requires immediate containment

### 1.3 Assumptions

- You have `flyctl` CLI installed and authenticated
- You have access to the Fly.io dashboard
- You have PostgreSQL/SQLite admin credentials
- You have access to the Netlify dashboard for frontend
- You have access to Stripe dashboard (for payment-related issues)
- You have this runbook open before you start any rollback

### 1.4 Golden Rules

1. **NEVER roll back without a second person aware** — ping #incidents channel minimum
2. **ALWAYS capture state before acting** — screenshots, logs, current version
3. **VERIFY each step before proceeding** — do not skip verification
4. **COMMUNICATE early and often** — silence during an incident is dangerous
5. **IF IN DOUBT, ESCALATE** — better to involve someone early than late

---

## 2. INCIDENT CLASSIFICATION

### 2.1 Priority Matrix

| Priority | Criteria | Response Time | Rollback Decision | Notification |
|----------|----------|---------------|-------------------|--------------|
| **P0** | Data loss, PHI/PII exposure, security breach, complete platform outage | Immediate (< 5 min) | Roll back NOW, no approval needed | #incidents + phone bridge + executive |
| **P1** | Critical feature broken, 500 errors > 5%, major workflow blocked | < 15 minutes | Roll back after 2-person confirmation | #incidents + on-call lead |
| **P2** | Degraded performance (> 2x latency), non-critical features broken | < 1 hour | Roll back at next scheduled window unless degrading | #incidents channel |
| **P3** | Cosmetic issues, monitoring gaps, minor UX regressions | Next scheduled window | Do NOT roll back — patch forward | Ticket only |

### 2.2 P0 Indicators (Roll Back Immediately)

Check ANY of these — if true, treat as P0:

- [ ] Evidence database shows corrupted or missing records
- [ ] PHI/PII data visible in logs or error messages
- [ ] Unauthorized API access detected in audit logs
- [ ] `deepsynaps-studio` app shows 0 healthy instances
- [ ] Stripe webhooks returning 500 for > 10 minutes
- [ ] qEEG worker processing pipeline producing invalid clinical data
- [ ] Database replication lag > 30 minutes
- [ ] Any process group has 0 running machines

### 2.3 P1 Indicators (Roll Back Within 15 Minutes)

- [ ] Error rate > 5% across any process group for > 5 minutes
- [ ] Core API endpoints (health, auth, sessions) returning 500s
- [ ] qEEG worker failing > 50% of jobs
- [ ] Stripe worker unable to process webhooks
- [ ] Frontend completely non-functional (blank page, endless load)
- [ ] Feature flags causing unexpected behavior for > 20% of users

### 2.4 P2 Indicators (Monitor and Plan)

- [ ] API latency P95 > 2x baseline for > 15 minutes
- [ ] Knowledge Layer adapter timeouts > 10% of requests
- [ ] Non-critical features (reporting, exports) broken
- [ ] Degraded qEEG processing (slower but still accurate)
- [ ] Monitoring gaps (missing metrics, false alerts)

### 2.5 P3 Indicators (Do Not Roll Back)

- [ ] UI cosmetic issues (misaligned elements, wrong colors)
- [ ] Log verbosity changes (too much/too little logging)
- [ ] Documentation inconsistencies
- [ ] Non-user-facing monitoring label issues

---

## 3. ARCHITECTURE REFERENCE

### 3.1 Fly.io Deployment Topology

```
                    +-----------------------------+
                    |   Netlify CDN Frontend      |
                    |   deepsynaps-studio-preview |
                    +-------------+---------------+
                                  |
                    +-------------v---------------+
                    |   Fly.io Load Balancer      |
                    |   deepsynaps-studio         |
                    +-------------+---------------+
                                  |
          +-----------------------+-----------------------+
          |                       |                       |
+---------v---------+  +----------v----------+  +--------v--------+
|  app (HTTP API)   |  |  qeeg_worker        |  |  stripe_worker  |
|  Python/FastAPI   |  |  Python/RQ Worker   |  |  Python/RQ      |
|  Port 8080        |  |  Async job processor|  |  Stripe webhooks|
|  2+ machines      |  |  1+ machines        |  |  1+ machines    |
+-------------------+  +---------------------+  +-----------------+
          |                       |                       |
          +-----------------------+-----------------------+
                                  |
                    +-------------v---------------+
                    |   Fly Postgres              |
                    |   deepsynaps-db             |
                    |   PostgreSQL 15             |
                    +-------------+---------------+
                                  |
                    +-------------v---------------+
                    |   Persistent Volume         |
                    |   deepsynaps_data           |
                    |   Mounted at /data          |
                    |   /data/evidence.db (SQLite)|
                    +-----------------------------+
```

### 3.2 Process Groups Detail

| Group | Purpose | Min Machines | Health Check | Critical Path |
|-------|---------|-------------|-------------|---------------|
| `app` | HTTP API (FastAPI) | 2 | `GET /health` | YES — all user traffic |
| `qeeg_worker` | qEEG processing pipeline | 1 | Internal heartbeat | YES — clinical data |
| `stripe_worker` | Payment webhooks & jobs | 1 | Internal heartbeat | YES — billing |

### 3.3 Data Stores

| Store | Type | Location | Backup Strategy | RPO |
|-------|------|----------|-----------------|-----|
| `deepsynaps-db` | PostgreSQL | Fly.io | Automated daily + WAL | 1 hour |
| `evidence.db` | SQLite | `/data` (volume) | Daily snapshot | 24 hours |
| Redis | Fly.io Redis | Fly.io | Built-in replication | 5 minutes |
| Config/Secrets | Fly secrets | Fly.io | Manual export | N/A |

### 3.4 Internal Package Dependencies

```
The app depends on 20 internal Python packages. During a rollback,
ALL packages are rolled back together via the Docker image.
Individual package rollback is NOT supported in production.

Knowledge Layer (16 database adapters) is bundled inside the image.
Adapter configuration is via environment variables (see Scenario 3).
```

---

## 4. PRE-ROLLBACK CHECKLIST

### 4.1 Before ANY Rollback — Complete ALL 5 Items

#### Item 1: Confirm the Incident is Deployment-Related

```bash
# Check recent deployment activity
fly releases list --app deepsynaps-studio --limit 10

# Check if error rate correlates with last deploy
# Look at Grafana dashboard: "Error Rate by Release"
# Compare: deployment timestamp vs. incident start timestamp
```

**Decision rule:** If the incident started within 10 minutes of the last deployment AND no external dependency alerts are firing → proceed with rollback.  
**If incident started > 30 min after deploy OR external alerts are firing → investigate before rolling back.**

#### Item 2: Capture Current State

```bash
# Run this script to capture pre-rollback state
# SAVE OUTPUT — paste into #incidents channel

echo "=== INCIDENT SNAPSHOT $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo ""
echo "--- Current Release ---"
fly releases list --app deepsynaps-studio --limit 5

echo ""
echo "--- Machine Status ---"
fly status --app deepsynaps-studio

echo ""
echo "--- Recent Logs (last 50 lines) ---"
fly logs --app deepsynaps-studio --limit 50

echo ""
echo "--- Database Health ---"
fly status --app deepsynaps-db

echo ""
echo "--- Worker Queue Depth ---"
# Check Redis queue depth (if accessible)
# Requires fly redis or direct Redis connection

echo ""
echo "--- Frontend Deploy Status ---"
# Check Netlify deploy log for last deployment
# https://app.netlify.com/sites/deepsynaps-studio-preview/deploys

echo "=== END SNAPSHOT ==="
```

**Required artifacts:**
- [ ] Screenshot of `fly releases list` output
- [ ] Screenshot of `fly status` output
- [ ] Link to error dashboard showing incident start time
- [ ] Last 20 lines of application logs showing errors

#### Item 3: Identify the Target Rollback Version

```bash
# Get the last KNOWN GOOD version
# Ask: "What version was running before the incident started?"

# Option A: Use fly releases
fly releases list --app deepsynaps-studio --limit 20

# The "Known Good" version is the one immediately before
# the bad deployment. Note its IMAGE REF or VERSION.

# Option B: Check deployment tracking
# Look in #deployments Slack channel for last successful deploy
# Cross-reference with fly releases list
```

**Decision rule:**
- If rolling back one release → target = previous release
- If rolling back multiple releases → target = last known good (ask team)
- If unsure which version → **STOP and escalate** before proceeding

#### Item 4: Notify the Team

```bash
# Post in #incidents channel with this format:
```
:rotating_light: ROLLBACK INITIATED :rotating_light:
Incident: [brief description]
Severity: [P0/P1/P2]
Bad Release: [version/image tag]
Target Rollback: [version/image tag]
Started by: [@your handle]
ETA to completion: [estimate]
```

**Do NOT start the rollback until at least one other team member has acknowledged.**  
**Exception: P0 incidents — roll back immediately, notify simultaneously.**

#### Item 5: Check for In-Flight Operations

```bash
# Check for active database migrations
fly logs --app deepsynaps-studio --limit 100 | grep -i "alembic\|migration"

# Check for long-running qEEG jobs
# Look at worker dashboard or query job queue

# Check for active Stripe operations
# Look at Stripe dashboard for pending/refund operations
```

**Decision rule:**
- [ ] No active migrations → proceed
- [ ] Active migration running → **WAIT for completion or abort safely** (see Scenario 2)
- [ ] Long-running qEEG jobs → jobs will be interrupted, note in incident log
- [ ] Active Stripe operations → **coordinate with finance team** before rollback

---

## 5. SCENARIO 1: BAD CODE DEPLOY

### 5.1 Detection

**Symptoms:**
- Error rate spike in Grafana after recent deploy
- Failed health checks on `app` process group
- Sentry showing new exception types from latest release
- User reports of broken functionality
- Automated deployment smoke tests failing

**Confirmation commands:**

```bash
# Step 1: Check current release
fly releases list --app deepsynaps-studio --limit 5

# Step 2: Check error rate vs. baseline
# In Grafana: Dashboard "API Health" > Panel "Error Rate (5m)"
# Baseline: < 0.5% | Warning: 2% | Critical: 5%

# Step 3: Check machine health
fly status --app deepsynaps-studio

# Step 4: Check logs for new error types
fly logs --app deepsynaps-studio --limit 100 | grep -i "error\|exception\|traceback"

# Step 5: Check if health endpoint is responding
APP_URL=$(fly status --app deepsynaps-studio --json | jq -r '.Hostname')
curl -s -o /dev/null -w "%{http_code}" https://${APP_URL}/health
```

### 5.2 Rollback Procedure

#### Phase 1: Preparation (2 minutes)

```bash
# 1.1. Export the target rollback version
export TARGET_VERSION="<KNOWN_GOOD_VERSION>"
# Example: export TARGET_VERSION="v1.2.3"

# 1.2. Verify the target version exists
fly releases list --app deepsynaps-studio | grep "${TARGET_VERSION}"
# Expected: one line showing the release with Status = succeeded

# 1.3. Capture current state (run full snapshot script from Section 4.2)
```

#### Phase 2: Execute Rollback (3 minutes)

```bash
# 2.1. Option A: Roll back to a specific image tag
fly deploy --image registry.fly.io/deepsynaps-studio:${TARGET_VERSION} \
  --app deepsynaps-studio \
  --strategy rolling \
  --wait-timeout=300

# 2.1. Option B: Roll back using the previous release from fly
# Get the previous release version
fly releases list --app deepsynaps-studio --limit 5

# Deploy the specific previous release image
# Replace <PREVIOUS_IMAGE_REF> with the image reference from releases list
fly deploy --image <PREVIOUS_IMAGE_REF> \
  --app deepsynaps-studio \
  --strategy rolling \
  --wait-timeout=300

# 2.2. Monitor the rollout
fly status --app deepsynaps-studio --watch

# 2.3. Wait for all machines to be "started" and "healthy"
# Expected output: All machines show:
#   State = started
#   Healthchecks = 1 passing
```

#### Phase 3: Verification (3 minutes)

```bash
# 3.1. Check all process groups are healthy
fly status --app deepsynaps-studio

# 3.2. Test the health endpoint
APP_HOST=$(fly status --app deepsynaps-studio --json | jq -r '.Hostname')
curl -s https://${APP_HOST}/health | jq .
# Expected: {"status": "ok", "version": "<TARGET_VERSION>"}

# 3.3. Test critical endpoints
curl -s -o /dev/null -w "%{http_code}" https://${APP_HOST}/api/v1/health
curl -s -o /dev/null -w "%{http_code}" https://${APP_HOST}/api/v1/sessions
curl -s -o /dev/null -w "%{http_code}" https://${APP_HOST}/api/v1/qeeg/status

# 3.4. Check error rate is returning to baseline
# In Grafana: "Error Rate (5m)" should be dropping

# 3.5. Verify worker processes are running
fly logs --app deepsynaps-studio --limit 20 | grep -i "worker.*started\|ready"

# 3.6. Run smoke tests (if available)
# cd /path/to/smoke-tests && ./run-smoke-tests.sh ${APP_HOST}
```

#### Phase 4: Frontend Rollback (if needed)

```bash
# 4.1. Check if frontend was also deployed
# Look at Netlify deploy log: https://app.netlify.com/sites/deepsynaps-studio-preview/deploys

# 4.2. If frontend deploy correlates with incident, rollback on Netlify
# Go to Netlify Dashboard → Site → Deploys
# Find last known good deploy → Click "Publish deploy"

# 4.3. Verify frontend loads correctly
curl -s -o /dev/null -w "%{http_code}" https://deepsynaps-studio-preview.netlify.app
```

### 5.3 Rollback Verification Checklist

- [ ] All `app` machines show `started` state
- [ ] All `qeeg_worker` machines show `started` state
- [ ] All `stripe_worker` machines show `started` state
- [ ] `GET /health` returns 200 with expected version
- [ ] Error rate in Grafana is back to baseline (< 0.5%)
- [ ] No new exception types in Sentry
- [ ] Frontend loads without console errors
- [ ] Worker queue is processing (not backing up)
- [ ] Database connections are stable
- [ ] User reports confirm service is restored

### 5.4 If Rollback Fails

```bash
# If the rollback deployment fails:

# 1. Check the deployment logs
fly logs --app deepsynaps-studio --limit 100

# 2. If machines fail to start, try a complete restart
fly apps restart deepsynaps-studio

# 3. If still failing, check for infrastructure issues
fly status --app deepsynaps-studio
fly status --app deepsynaps-db

# 4. If the issue is with the target image itself,
# go back TWO releases:
export TARGET_VERSION="<TWO_RELEASES_AGO_VERSION>"
fly deploy --image registry.fly.io/deepsynaps-studio:${TARGET_VERSION} \
  --app deepsynaps-studio \
  --strategy rolling

# 5. If ALL rollbacks fail → ESCALATE (see Section 13)
# This is a P0 situation — start a phone bridge
```

---

## 6. SCENARIO 2: BAD MIGRATION

### 6.1 Detection

**Symptoms:**
- Migration command failed during deployment (`release_command`)
- Application fails to start after migration
- Data integrity errors in application logs
- Foreign key constraint violations
- Missing or unexpected columns in database queries
- Evidence DB (`/data/evidence.db`) showing corruption errors

**Confirmation commands:**

```bash
# Step 1: Check migration status
fly ssh console --app deepsynaps-studio --command "cd /app/apps/api && python -m alembic current"
# Expected: Shows current revision ID

# Step 2: Check migration history
fly ssh console --app deepsynaps-studio --command "cd /app/apps/api && python -m alembic history --verbose"
# Shows: Current revision → Target revision path

# Step 3: Check if app is failing due to migration
fly logs --app deepsynaps-studio --limit 50 | grep -i "alembic\|migration\|revision\|upgrade"

# Step 4: Check PostgreSQL for errors
fly logs --app deepsynaps-db --limit 50 | grep -i "error\|fatal\|constraint"

# Step 5: Check evidence DB integrity (if accessible)
fly ssh console --app deepsynaps-studio --command "sqlite3 /data/evidence.db 'PRAGMA integrity_check;'"
# Expected: "ok" | If not OK → DB corruption detected
```

### 6.2 Severity Assessment

| Condition | Severity | Action |
|-----------|----------|--------|
| Migration failed, NO data changed | P1 | Re-run migration or roll back revision |
| Migration partially applied, data inconsistent | P0 | Stop app, run downgrade, restore from backup |
| Evidence DB corrupted | P0 | Restore from latest backup immediately |
| Migration succeeded but app logic broken | P1 | Roll back code deploy (Scenario 1) |

### 6.3 Rollback Procedure — Migration Failed (No Data Corruption)

```bash
# Phase 1: Stop the application (prevent further damage)
fly scale count 0 --app deepsynaps-studio

# Phase 2: Access the database console
fly ssh console --app deepsynaps-db

# Phase 2b: Inside the DB console, check migration state
# (Run these inside the SSH session)
psql -d deepsynaps
SELECT * FROM alembic_version;
\q
exit

# Phase 3: Roll back the migration
fly ssh console --app deepsynaps-studio --command "cd /app/apps/api && python -m alembic downgrade -1"

# Phase 4: Verify the migration was rolled back
fly ssh console --app deepsynaps-studio --command "cd /app/apps/api && python -m alembic current"
# Should show the previous revision ID

# Phase 5: Re-deploy the previous application version
# (Follow Scenario 1 rollback procedure)
export TARGET_VERSION="<PREVIOUS_GOOD_VERSION>"
fly deploy --image registry.fly.io/deepsynaps-studio:${TARGET_VERSION} \
  --app deepsynaps-studio \
  --strategy rolling

# Phase 6: Verify
fly status --app deepsynaps-studio
# Run verification checklist from Section 5.3
```

### 6.4 Rollback Procedure — Migration Corrupted Data

#### Phase 1: IMMEDIATE CONTAINMENT (1 minute)

```bash
# 1.1. EMERGENCY: Scale app to 0 to prevent further writes
fly scale count 0 --app deepsynaps-studio

# 1.2. Confirm no machines are running
fly status --app deepsynaps-studio
# Expected: 0 machines in "app", "qeeg_worker", "stripe_worker" groups

# 1.3. Notify team — this is P0
# Post in #incidents: "DATABASE CORRUPTION DETECTED — APP SCALED TO 0"
```

#### Phase 2: DAMAGE ASSESSMENT (5 minutes)

```bash
# 2.1. Check which tables are affected
fly ssh console --app deepsynaps-db --command "psql -d deepsynaps -c \"\\dt\""

# 2.2. Check for constraint violations
fly ssh console --app deepsynaps-db --command "psql -d deepsynaps -c \"
  SELECT 
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY';
\""

# 2.3. Check evidence DB integrity
fly ssh console --app deepsynaps-studio --command "sqlite3 /data/evidence.db 'PRAGMA integrity_check;'"

# 2.4. Get row counts for critical tables (compare with baseline)
fly ssh console --app deepsynaps-db --command "psql -d deepsynaps -c \"
  SELECT 
    'users' as table_name, COUNT(*) as row_count FROM users
  UNION ALL
  SELECT 'sessions', COUNT(*) FROM sessions
  UNION ALL
  SELECT 'qeeg_recordings', COUNT(*) FROM qeeg_recordings
  UNION ALL
  SELECT 'patients', COUNT(*) FROM patients
  UNION ALL
  SELECT 'payments', COUNT(*) FROM payments;
\""
# SAVE THIS OUTPUT — compare with known baselines

# 2.5. Identify the problematic migration
fly ssh console --app deepsynaps-studio --command "cd /app/apps/api && python -m alembic history --verbose"
# The current revision is the bad one — note its ID
```

#### Phase 3: RESTORE FROM BACKUP (if corruption is severe)

```bash
# 3.1. List available PostgreSQL backups
# Fly.io automated backups are listed in the dashboard
# OR use:
fly volumes list --app deepsynaps-db

# 3.2. If automated backup available, restore from it
# This is the SAFEST option for significant corruption
# Go to Fly.io Dashboard → deepsynaps-db → Backups → Select backup → Restore

# 3.3. Alternative: Manual restore from pg_dump backup (if available)
# This requires a pre-existing backup file

# Download the latest backup (example with Fly's backup system)
# Follow Fly.io docs for point-in-time recovery:
# https://fly.io/docs/postgres/managing/backup-and-restore/

# 3.4. If evidence DB is corrupted, restore from volume snapshot
# Fly.io volume snapshots:
fly volumes list --app deepsynaps-studio
fly volumes snapshots list <VOLUME_ID>
# Restore from the most recent snapshot before the incident
```

#### Phase 4: RUN DOWNGRADE (if corruption is minimal and downgrade is safe)

**WARNING: Only run downgrade if you are CERTAIN it will not make things worse.**  
**When in doubt, restore from backup instead.**

```bash
# 4.1. Connect to the app machine (must have code access)
fly ssh console --app deepsynaps-studio

# 4.2. Navigate to the API directory
cd /app/apps/api

# 4.3. Check what the downgrade will do (dry-run concept)
python -m alembic history --verbose --rev-range $(python -m alembic current):$(python -m alembic current)~-1

# 4.4. Run the downgrade
python -m alembic downgrade -1

# 4.5. Verify the downgrade completed
python -m alembic current
# Should show the previous revision

# 4.6. Exit SSH
exit
```

#### Phase 5: DATA INTEGRITY REPAIR (specific corruption patterns)

**Pattern A: Orphaned Records (Foreign Key Violations)**

```sql
-- Run inside PostgreSQL console (fly ssh console --app deepsynaps-db)
-- Then: psql -d deepsynaps

-- Find orphaned session records
SELECT s.id, s.patient_id
FROM sessions s
LEFT JOIN patients p ON s.patient_id = p.id
WHERE p.id IS NULL;

-- If orphaned records exist, either:
-- Option 1: Delete orphaned records (if safe)
-- DELETE FROM sessions WHERE patient_id NOT IN (SELECT id FROM patients);

-- Option 2: Create placeholder parent records
-- INSERT INTO patients (id, name, status) 
-- SELECT DISTINCT patient_id, 'ORPHANED', 'needs_review'
-- FROM sessions WHERE patient_id NOT IN (SELECT id FROM patients);
```

**Pattern B: Duplicate Records**

```sql
-- Find duplicate patients by external_id
SELECT external_id, COUNT(*) 
FROM patients 
GROUP BY external_id 
HAVING COUNT(*) > 1;

-- Find duplicate qEEG recordings
SELECT patient_id, recording_timestamp, COUNT(*)
FROM qeeg_recordings
GROUP BY patient_id, recording_timestamp
HAVING COUNT(*) > 1;

-- Resolution: Merge or delete duplicates based on business rules
-- Always backup before running DELETE statements
```

**Pattern C: Missing Required Columns (Migration Rolled Back)**

```sql
-- Check current table structure
\d patients
\d sessions
\d qeeg_recordings

-- If a column that the app expects is missing,
-- the code rollback must match the DB schema.
-- Ensure the deployed app version matches the downgraded schema.
```

**Pattern D: Evidence DB (SQLite) Corruption**

```bash
# If integrity_check fails:
sqlite3 /data/evidence.db "PRAGMA integrity_check;"
# If output is NOT "ok":

# Option 1: Restore from Fly volume snapshot (RECOMMENDED)
fly volumes snapshots list <VOLUME_ID>
# Choose snapshot before incident, restore

# Option 2: SQLite recovery mode
sqlite3 /data/evidence.db ".recover" | sqlite3 /data/evidence_recovered.db
# Then replace: mv /data/evidence_recovered.db /data/evidence.db

# Option 3: If corrupted beyond recovery, restore from backup
# Evidence DB should have regular backups — use most recent
```

#### Phase 6: REDEPLOY AND VERIFY (5 minutes)

```bash
# 6.1. Deploy the known-good application version
export TARGET_VERSION="<PREVIOUS_GOOD_VERSION>"
fly deploy --image registry.fly.io/deepsynaps-studio:${TARGET_VERSION} \
  --app deepsynaps-studio \
  --strategy rolling

# 6.2. Monitor startup
fly status --app deepsynaps-studio --watch

# 6.3. Run comprehensive data integrity check
fly ssh console --app deepsynaps-studio --command "
  cd /app/apps/api && python -c \"
import asyncio
from app.db import get_db_session
from app.models import Patient, Session, QEEGRecording

async def check_integrity():
    async with get_db_session() as db:
        patient_count = await db.scalar(select(func.count()).select_from(Patient))
        session_count = await db.scalar(select(func.count()).select_from(Session))
        qeeg_count = await db.scalar(select(func.count()).select_from(QEEGRecording))
        print(f'Patients: {patient_count}')
        print(f'Sessions: {session_count}')
        print(f'qEEGs: {qeeg_count}')

asyncio.run(check_integrity())
  \"
"

# 6.4. Verify critical workflows
# - Create a test patient
# - Create a test session
# - Run a test qEEG processing job
# - Verify Stripe webhook processing

# 6.5. Check evidence DB
fly ssh console --app deepsynaps-studio --command "sqlite3 /data/evidence.db 'PRAGMA integrity_check;'"
```

### 6.5 Post-Migration Rollback Checklist

- [ ] App is running and responding to health checks
- [ ] PostgreSQL shows correct (downgraded) schema version
- [ ] All critical tables have expected row counts
- [ ] No foreign key constraint violations
- [ ] Evidence DB passes integrity_check = "ok"
- [ ] Test patient can be created
- [ ] Test session can be created
- [ ] qEEG worker processes a test job successfully
- [ ] Stripe worker processes a test webhook
- [ ] No errors in application logs for 10 minutes
- [ ] Monitoring shows all-green for all process groups

---

## 7. SCENARIO 3: CONFIGURATION ERROR

### 7.1 Detection

**Symptoms:**
- Application fails to start after secret change
- Auth failures (JWT errors, session invalidation)
- API returning 401/403 for valid requests
- Workers failing to connect to external services
- Timeout errors on specific integrations
- Environment-specific behavior (works in staging, not prod)

**Confirmation commands:**

```bash
# Step 1: Check recent secret changes
fly secrets list --app deepsynaps-studio
# Look for recently updated secrets (timestamps)

# Step 2: Check application logs for config errors
fly logs --app deepsynaps-studio --limit 100 | grep -i "config\|secret\|env\|key\|token\|credential\|auth"

# Step 3: Check if error is consistent across all instances
fly status --app deepsynaps-studio
# If ALL machines are unhealthy → likely config issue

# Step 4: Check for specific error patterns
fly logs --app deepsynaps-studio --limit 50 | grep -i "invalid.*key\|bad.*token\|unauthorized\|forbidden\|timeout"
```

### 7.2 Common Configuration Issues

| Secret/Config | Failure Mode | Detection |
|--------------|-------------|-----------|
| `DATABASE_URL` | App can't connect to DB | Connection timeout errors |
| `REDIS_URL` | Worker queue failures, cache misses | Worker crashes, session issues |
| `JWT_SECRET` | All auth failures, 401/403 | Login failures, token errors |
| `STRIPE_API_KEY` | Payment processing failures | Stripe webhook 500s |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification failures | Stripe dashboard shows failures |
| `AWS_*` keys | S3 upload/download failures | File operation errors |
| `SENTRY_DSN` | Error reporting gaps | No errors in Sentry |
| `OPENAI_API_KEY` | AI feature failures | Timeout on AI endpoints |
| Knowledge Layer adapters | DB adapter timeouts | 16 adapter-specific errors |
| `API_BASE_URL` | Frontend-backend mismatch | CORS errors, 404s |

### 7.3 Rollback Procedure

#### Phase 1: Identify the Bad Secret (2 minutes)

```bash
# 1.1. List all secrets with timestamps
fly secrets list --app deepsynaps-studio

# 1.2. Identify which secret was changed most recently
# Compare the "DIGEST" column — a changed digest = changed value

# 1.3. Check logs for the specific error
# The error message usually tells you WHICH secret is wrong
fly logs --app deepsynaps-studio --limit 100 | grep -i "secret\|key\|token\|config"

# 1.4. Common patterns:
# "jwt.exceptions.InvalidSignatureError" → JWT_SECRET issue
# "stripe.error.AuthenticationError" → STRIPE_API_KEY issue
# "sqlalchemy.exc.OperationalError: connection refused" → DATABASE_URL issue
# "redis.exceptions.ConnectionError" → REDIS_URL issue
# "botocore.exceptions.NoCredentialsError" → AWS_* issue
```

#### Phase 2: Retrieve Previous Secret Value (3 minutes)

```bash
# Option A: From your password manager / secret vault
# The previous value should be stored in your team's secret vault
# (1Password, Vault, etc.)

# Option B: From deployment logs
# Check CI/CD pipeline logs for the previous deployment
# The secrets are often printed (masked) or logged

# Option C: From another team member
# Ask the person who last successfully deployed

# Option D: From a staging environment (if staging is working)
fly secrets list --app deepsynaps-studio-staging
# Copy the value from staging (if staging has the good value)

# Option E: From backup (if secrets are backed up)
# Check your team's secret backup procedure
```

**IMPORTANT:** If you cannot find the previous value → **STOP and escalate.**  
**Do NOT guess secret values.**

#### Phase 3: Update the Secret (1 minute)

```bash
# 3.1. Set the correct secret value
# Replace SECRET_NAME and correct_value

# For single-line secrets:
echo -n "correct_value" | fly secrets set SECRET_NAME=- --app deepsynaps-studio

# For secrets from a file:
fly secrets set SECRET_NAME="$(cat /path/to/secret)" --app deepsynaps-studio

# For multiple secrets at once:
fly secrets set \
  DATABASE_URL="postgres://..." \
  REDIS_URL="redis://..." \
  JWT_SECRET="..." \
  --app deepsynaps-studio

# 3.2. Verify the secret was set
fly secrets list --app deepsynaps-studio
# The DIGEST should have changed for the updated secret
```

**NOTE:** Setting secrets triggers an automatic deployment restart. The app will restart with the new secret values.

#### Phase 4: Verify the Fix (3 minutes)

```bash
# 4.1. Wait for restart and check status
sleep 30
fly status --app deepsynaps-studio

# 4.2. Check logs for successful startup
fly logs --app deepsynaps-studio --limit 50 | grep -i "started\|ready\|listening"

# 4.3. Test the previously failing functionality
# If auth was broken:
curl -s -X POST https://${APP_HOST}/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "password": "test"}'

# If Stripe was broken:
# Check Stripe dashboard → Webhooks → recent events

# If DB connection was broken:
# Check Grafana → Database connections panel

# 4.4. Test all critical paths
# See Post-Rollback Verification (Section 10)
```

#### Phase 5: If the App Doesn't Restart Automatically

```bash
# Sometimes Fly doesn't restart after secret changes
# Force a restart:
fly apps restart deepsynaps-studio

# Or force a new deployment with the current image:
fly deploy --app deepsynaps-studio --image registry.fly.io/deepsynaps-studio:$(fly releases list --app deepsynaps-studio --limit 1 --json | jq -r '.[0].Version') \
  --strategy rolling
```

### 7.4 Bulk Secret Rollback (Multiple Secrets Changed)

If multiple secrets were changed at once (e.g., during a rotation):

```bash
# 1. Get a list of all current secrets
fly secrets list --app deepsynaps-studio

# 2. Compare with a known-good list
# Your team should maintain a secrets manifest in a secure location

# 3. Roll back each secret individually
# There is NO bulk rollback — you must set each one

# 4. For a complete secret reset, you may need to:
#    a. Export all secrets from the known-good environment
#    b. Import them into the production environment
#    c. Force a restart

# Example: Export from staging (be careful!)
fly ssh console --app deepsynaps-studio-staging --command "env | grep -E 'DATABASE|REDIS|JWT|STRIPE|AWS|API_KEY'"
# Then set each one in production
```

### 7.5 Netlify Environment Variable Rollback

```bash
# If the issue is with Netlify environment variables:

# 1. Go to Netlify Dashboard → Site settings → Environment variables
# https://app.netlify.com/sites/deepsynaps-studio-preview/configuration/env

# 2. Check for recently changed variables

# 3. To roll back: find the previous value and update

# 4. Trigger a redeploy
# Go to Deploys → Trigger deploy
```

---

## 8. SCENARIO 4: EXTERNAL DEPENDENCY FAILURE

### 8.1 Detection

**Symptoms:**
- Timeout errors from specific external services
- Health check failures for dependency endpoints
- Queue backup in workers that call external services
- Partial functionality — some features work, others don't
- Error messages naming specific third-party services

**Confirmation commands:**

```bash
# Step 1: Check dependency health endpoints
curl -s https://api.stripe.com/v1/health || echo "Stripe API unreachable"

# Step 2: Check Fly Postgres health
fly status --app deepsynaps-db

# Step 3: Check Redis health (if using Fly Redis)
# fly redis status <redis-app-name> (if applicable)

# Step 4: Check application logs for dependency errors
fly logs --app deepsynaps-studio --limit 100 | grep -i "timeout\|connection\|unreachable\|503\|stripe\|openai\|aws\|s3"

# Step 5: Check worker-specific logs
fly logs --app deepsynaps-studio --limit 50 | grep "qeeg_worker\|stripe_worker"

# Step 6: Check dependency status pages
# Stripe: https://status.stripe.com/
# OpenAI: https://status.openai.com/
# AWS: https://health.aws.amazon.com/
# Fly.io: https://status.fly.io/
```

### 8.2 Dependency Failure Matrix

| Dependency | Failure Impact | Degraded Mode | Rollback Needed? |
|-----------|---------------|---------------|-----------------|
| **Stripe API** | Payments fail, webhooks queue | Retry with exponential backoff, queue webhooks | No — wait for Stripe |
| **PostgreSQL** | Complete app outage | Read-only mode if possible | Yes — if Fly DB issue, contact Fly |
| **Redis** | Caching fails, sessions break, queue stops | Direct DB queries, session fallback | Yes — if persistent |
| **OpenAI API** | AI features timeout | Feature toggle off | No — degrade gracefully |
| **AWS S3** | File uploads/downloads fail | Queue file ops, local temp storage | No — wait for AWS |
| **Knowledge Layer DBs** | Adapter timeouts | Use cached results, skip enrichment | Partial — disable failing adapters |
| **Fly.io DNS/Network** | All external calls fail | Nothing — platform issue | Contact Fly support |

### 8.3 Rollback / Degradation Procedure

#### Phase 1: Identify the Failing Dependency (2 minutes)

```bash
# 1.1. Check which dependency is failing
fly logs --app deepsynaps-studio --limit 100 | grep -i "timeout\|connection refused\|503\|5xx" | head -20

# 1.2. Check dependency status pages (via browser)
# Open each status page and check for incidents

# 1.3. Check if the issue is with Fly.io infrastructure
# https://status.fly.io/
```

#### Phase 2: Enable Fallback / Degraded Mode (3 minutes)

**Option A: Stripe API Down**

```bash
# Stripe outages are usually temporary. Steps:
# 1. Enable extended retry logic (in app config)
# 2. Increase webhook timeout
# 3. Monitor Stripe status page

# If Stripe webhooks are failing, check the queue:
# (Requires Redis access)
# redis-cli LLEN stripe_webhooks_pending

# No rollback of our code is needed — wait for Stripe
# Keep monitoring: https://status.stripe.com/
```

**Option B: OpenAI API Down**

```bash
# 1. Disable AI features via feature flag or env var
# Set environment variable to skip AI processing
fly secrets set SKIP_AI_PROCESSING="true" --app deepsynaps-studio

# 2. This will cause the app to skip AI enrichment
# Users will see a "AI features temporarily unavailable" message

# 3. When OpenAI recovers, unset the flag:
fly secrets unset SKIP_AI_PROCESSING --app deepsynaps-studio
```

**Option C: Knowledge Layer Adapter Timeouts**

```bash
# 1. Identify which adapters are failing
# Check logs for specific adapter errors
fly logs --app deepsynaps-studio --limit 100 | grep -i "adapter\|knowledge\|timeout"

# 2. Disable failing adapters via configuration
# This requires updating the adapter configuration
# (Usually via environment variable or config file)

# 3. If adapters are configured via env vars:
fly secrets set DISABLED_ADAPTERS="adapter1,adapter2" --app deepsynaps-studio

# 4. Restart to pick up config changes
fly apps restart deepsynaps-studio
```

**Option D: Fly PostgreSQL Issues**

```bash
# If the DB is the problem:

# 1. Check DB status
fly status --app deepsynaps-db
fly checks list --app deepsynaps-db

# 2. If DB machines are down:
# Try restarting the DB
fly apps restart deepsynaps-db

# 3. If DB is unresponsive:
# Check for resource issues (CPU, memory, disk)
fly metrics --app deepsynaps-db

# 4. If disk is full:
fly volumes list --app deepsynaps-db
# May need to scale volume or clean up data

# 5. If DB issue persists > 10 minutes:
# Contact Fly.io support AND start preparing for DR
# (See DR_PLAN.md for full database recovery)
```

**Option E: Complete Fly.io Outage**

```bash
# If Fly.io itself is having issues:
# 1. Check https://status.fly.io/
# 2. If confirmed Fly outage:
#    a. Post in #incidents
#    b. Update status page
#    c. Wait for Fly to resolve
#    d. Monitor recovery
# 3. There is NO rollback for Fly.io platform issues
```

#### Phase 3: Monitor and Communicate

```bash
# 3.1. Set up continuous monitoring
watch -n 30 'fly logs --app deepsynaps-studio --limit 20'

# 3.2. Update #incidents channel every 15 minutes
# Format:
:information_source: Dependency Update [TIME]
Status: [Degraded/Recovering/Resolved]
Affected: [Feature/Service]
External Status: [Link to status page]
User Impact: [Description]
ETA: [If known]
```

### 8.4 When to Roll Back vs. Wait

```
Decision Tree:

Is the dependency issue caused by OUR recent change?
├── YES → Roll back the change that introduced the dependency issue
│         (Follow Scenario 1 or 3)
│
└── NO → Is the dependency issue on the vendor side?
          ├── YES → Can we degrade gracefully?
          │         ├── YES → Enable degraded mode, wait for vendor
          │         └── NO → Is there a backup dependency?
          │                   ├── YES → Switch to backup
          │                   └── NO → Full outage, communicate to users
          │                         (This is a P0 incident)
          └── NO → Investigate network/DNS issues
                    (Could be Fly.io infrastructure)
```

---

## 9. SCENARIO 5: SECURITY INCIDENT

### 9.1 Detection

**Symptoms:**
- Unauthorized access in audit logs
- Suspicious API activity (unusual patterns, rate spikes)
- Credentials found in logs or public repositories
- Unusual data access patterns (bulk exports, odd hours)
- Security scanning alerts (Dependabot, Snyk, etc.)
- Report from external security researcher or user
- PHI/PII detected in unexpected locations

**Confirmation commands:**

```bash
# Step 1: Check audit logs for unauthorized access
fly ssh console --app deepsynaps-db --command "psql -d deepsynaps -c \"
  SELECT 
    action, 
    user_id, 
    ip_address, 
    timestamp,
    resource_type,
    resource_id
  FROM audit_log
  WHERE timestamp > NOW() - INTERVAL '24 hours'
  ORDER BY timestamp DESC
  LIMIT 100;
\""

# Step 2: Check for unusual login patterns
fly logs --app deepsynaps-studio --limit 500 | grep -i "login\|auth\|token\|session" | grep -v "200\|success"

# Step 3: Check for data export/bulk access
# Look for large or unusual SELECT queries in DB logs
fly logs --app deepsynaps-db --limit 200 | grep -i "select.*from\|copy\|export"

# Step 4: Check if credentials were committed
# (Search git history for patterns — run locally, not on prod)
git log --all --full-history -- .env
git log --all --full-history -- '*secret*' '*key*' '*password*' '*token*'

# Step 5: Check Sentry for auth-related errors
# Filter: tag:auth OR tag:security

# Step 6: Check Stripe dashboard for unauthorized charges
# https://dashboard.stripe.com/payments
```

### 9.2 Severity Classification

| Severity | Indicators | Response |
|----------|-----------|----------|
| **CRITICAL** | PHI/PII exposed publicly, credential leak confirmed, active breach detected | Immediate — follow full procedure below |
| **HIGH** | Unauthorized access detected, but scope contained | < 30 minutes — rotate secrets, revoke sessions |
| **MEDIUM** | Suspicious activity, but no confirmed breach | < 2 hours — investigate, monitor, prepare |
| **LOW** | Security scan finding, no active exploitation | < 24 hours — patch forward |

### 9.3 Security Rollback Procedure

#### Phase 1: IMMEDIATE CONTAINMENT (5 minutes)

```bash
# 1.1. EMERGENCY: Scale app to 0 if active breach is suspected
# This immediately stops all access
fly scale count 0 --app deepsynaps-studio

# 1.2. Revoke ALL active sessions (if possible)
# This requires DB access:
fly ssh console --app deepsynaps-db --command "psql -d deepsynaps -c \"
  UPDATE user_sessions SET revoked_at = NOW(), revocation_reason = 'security_incident';
\""

# 1.3. Rotate the JWT secret (invalidates all tokens)
# Generate a new secret:
export NEW_JWT_SECRET=$(openssl rand -hex 32)
echo "New JWT secret generated: ${NEW_JWT_SECRET:0:8}..."

# Set the new secret
fly secrets set JWT_SECRET="${NEW_JWT_SECRET}" --app deepsynaps-studio

# 1.4. Notify security team and leadership
# This is a P0 incident — phone bridge required
# Post in #security and #incidents
```

#### Phase 2: SECRET ROTATION (10 minutes)

Rotate ALL secrets that may be compromised:

```bash
# 2.1. Stripe API keys
# Go to Stripe Dashboard → Developers → API Keys
# Create new secret key, revoke old one
# Then update:
fly secrets set STRIPE_API_KEY="sk_live_NEW_KEY" --app deepsynaps-studio

# 2.2. Stripe webhook secret
# Go to Stripe Dashboard → Developers → Webhooks
# Re-create webhook endpoint, get new secret
fly secrets set STRIPE_WEBHOOK_SECRET="whsec_NEW_SECRET" --app deepsynaps-studio

# 2.3. Database credentials
# If DB credentials are suspected compromised:
# 1. Create new DB user
# 2. Grant same permissions
# 3. Update connection string
# 4. Revoke old user

# 2.4. AWS credentials (if used)
# Go to AWS IAM → Create new access keys
# Update application secrets
# Revoke old keys
fly secrets set \
  AWS_ACCESS_KEY_ID="NEW_KEY" \
  AWS_SECRET_ACCESS_KEY="NEW_SECRET" \
  --app deepsynaps-studio

# 2.5. OpenAI API key
# Go to OpenAI Dashboard → API Keys
# Create new key, revoke old
fly secrets set OPENAI_API_KEY="sk-NEW_KEY" --app deepsynaps-studio

# 2.6. Any other API keys or service credentials
# Review ALL secrets and rotate any that may be compromised
fly secrets list --app deepsynaps-studio
# For each secret: evaluate if it could be compromised
```

#### Phase 3: AUDIT AND ASSESSMENT (15 minutes)

```bash
# 3.1. Check what data was accessed
fly ssh console --app deepsynaps-db --command "psql -d deepsynaps -c \"
  SELECT 
    action,
    user_id,
    resource_type,
    resource_id,
    timestamp,
    ip_address,
    user_agent
  FROM audit_log
  WHERE timestamp > (NOW() - INTERVAL '72 hours')
  ORDER BY timestamp DESC;
\""

# 3.2. Check for bulk data access
fly ssh console --app deepsynaps-db --command "psql -d deepsynaps -c \"
  SELECT 
    user_id,
    COUNT(*) as access_count,
    MIN(timestamp) as first_access,
    MAX(timestamp) as last_access
  FROM audit_log
  WHERE timestamp > (NOW() - INTERVAL '72 hours')
  GROUP BY user_id
  HAVING COUNT(*) > 100
  ORDER BY access_count DESC;
\""

# 3.3. Check evidence DB access
# If SQLite access is logged:
fly ssh console --app deepsynaps-studio --command "
  ls -la /data/
  stat /data/evidence.db
"
# Check modification times — unexpected changes may indicate tampering

# 3.4. Export logs for forensic analysis
fly logs --app deepsynaps-studio --limit 10000 > /tmp/incident_logs_app.txt
fly logs --app deepsynaps-db --limit 10000 > /tmp/incident_logs_db.txt
# Save these files securely for investigation
```

#### Phase 4: PATCH AND REDEPLOY (10 minutes)

```bash
# 4.1. If the security issue is in code:
# Identify the vulnerable version
# Deploy a patched version

# If a hotfix is ready:
fly deploy --app deepsynaps-studio \
  --config apps/api/fly.toml \
  --strategy rolling \
  --wait-timeout=300

# 4.2. If rolling back to a known-safe version:
export SAFE_VERSION="<LAST_KNOWN_SAFE_VERSION>"
fly deploy --image registry.fly.io/deepsynaps-studio:${SAFE_VERSION} \
  --app deepsynaps-studio \
  --strategy rolling

# 4.3. With new secrets in place, scale back up
fly scale count app=2 qeeg_worker=1 stripe_worker=1 --app deepsynaps-studio

# 4.4. Verify the deployment
fly status --app deepsynaps-studio
```

#### Phase 5: POST-INCIDENT VERIFICATION (10 minutes)

```bash
# 5.1. Verify all secrets are rotated
fly secrets list --app deepsynaps-studio
# Confirm all compromised secrets have new digests

# 5.2. Verify sessions are invalidated
fly ssh console --app deepsynaps-db --command "psql -d deepsynaps -c \"
  SELECT COUNT(*) FROM user_sessions WHERE revoked_at IS NULL;
\""
# Expected: 0 (all sessions revoked) or only new sessions

# 5.3. Test authentication flow
# Attempt login with valid credentials
# Verify new JWT is issued
# Verify old JWTs are rejected

# 5.4. Test critical security controls
curl -s -o /dev/null -w "%{http_code}" https://${APP_HOST}/api/v1/auth/login
curl -s -o /dev/null -w "%{http_code}" https://${APP_HOST}/api/v1/sessions
# Without auth token:
curl -s -o /dev/null -w "%{http_code}" https://${APP_HOST}/api/v1/admin
# Expected: 401

# 5.5. Verify audit logging is working
# Perform an action and check it appears in audit log

# 5.6. Run security scan (if available)
# Run automated vulnerability scan on the deployed version
```

### 9.4 Post-Security Incident Checklist

- [ ] App scaled back up with new secrets
- [ ] All potentially compromised secrets rotated
- [ ] All active sessions revoked
- [ ] JWT secret rotated (all old tokens invalid)
- [ ] Audit logs exported for forensic analysis
- [ ] Authentication working with new credentials
- [ ] Authorization controls functioning
- [ ] No unauthorized access detected in logs since restart
- [ ] Stripe webhooks working with new secret
- [ ] API keys for all external services updated
- [ ] Incident documented in incident tracker
- [ ] Legal/Compliance team notified (if PHI/PII involved)
- [ ] Post-mortem scheduled within 48 hours

---

## 10. POST-ROLLBACK VERIFICATION

### 10.1 Complete Verification Checklist (10 Items)

After ANY rollback scenario, verify ALL of the following:

#### Item 1: Application Health

```bash
# All process groups show healthy machines
fly status --app deepsynaps-studio

# Expected output:
# app:        2 machines, all started, health checks passing
# qeeg_worker:  1+ machines, started
# stripe_worker: 1+ machines, started
```

- [ ] `app` group has ≥ 2 machines in `started` state
- [ ] `qeeg_worker` group has ≥ 1 machine in `started` state
- [ ] `stripe_worker` group has ≥ 1 machine in `started` state
- [ ] All machines show health checks as `1 passing`

#### Item 2: API Endpoints

```bash
APP_HOST=$(fly status --app deepsynaps-studio --json | jq -r '.Hostname')

# Core health check
curl -s https://${APP_HOST}/health | jq .

# API endpoints
curl -s -o /dev/null -w "Health: %{http_code}\n" https://${APP_HOST}/api/v1/health
curl -s -o /dev/null -w "Auth: %{http_code}\n" https://${APP_HOST}/api/v1/auth/status
curl -s -o /dev/null -w "Sessions: %{http_code}\n" https://${APP_HOST}/api/v1/sessions
curl -s -o /dev/null -w "qEEG: %{http_code}\n" https://${APP_HOST}/api/v1/qeeg/status
curl -s -o /dev/null -w "Stripe: %{http_code}\n" https://${APP_HOST}/api/v1/payments/status

# Expected: ALL return 200 (or 401 for auth-protected endpoints)
```

- [ ] `GET /health` returns 200
- [ ] `GET /api/v1/health` returns 200
- [ ] `GET /api/v1/auth/status` returns 200
- [ ] `GET /api/v1/sessions` returns 200 or 401 (not 500)
- [ ] `GET /api/v1/qeeg/status` returns 200
- [ ] `GET /api/v1/payments/status` returns 200

#### Item 3: Error Rate

```bash
# In Grafana dashboard:
# Navigate to: "API Health" → "Error Rate (5m)"
# Check the last 10 minutes

# Baseline error rate: < 0.5%
# After rollback: should be at baseline within 5 minutes
```

- [ ] Error rate < 1% for the last 5 minutes
- [ ] Error rate < 0.5% for the last 2 minutes
- [ ] No new exception types appearing in Sentry

#### Item 4: Database Connectivity

```bash
# Test database connection
fly ssh console --app deepsynaps-studio --command "
  cd /app/apps/api && python -c \"
import asyncio
from sqlalchemy import text
from app.db import get_db_session

async def test_db():
    async with get_db_session() as db:
        result = await db.execute(text('SELECT 1'))
        val = result.scalar()
        print(f'DB connection: OK ({val})')
        
        # Check migration version
        result = await db.execute(text('SELECT version_num FROM alembic_version'))
        version = result.scalar()
        print(f'Alembic version: {version}')

asyncio.run(test_db())
  \"
"
```

- [ ] Database connection succeeds
- [ ] Alembic version matches expected (downgraded) version
- [ ] No connection pool exhaustion

#### Item 5: Evidence DB Integrity

```bash
# Check SQLite integrity
fly ssh console --app deepsynaps-studio --command "sqlite3 /data/evidence.db 'PRAGMA integrity_check;'"
# Expected: "ok"

# Check evidence DB size (should not be unexpectedly large/small)
fly ssh console --app deepsynaps-studio --command "ls -lh /data/evidence.db"

# Check evidence DB tables
fly ssh console --app deepsynaps-studio --command "sqlite3 /data/evidence.db '.tables'"
```

- [ ] `PRAGMA integrity_check` returns `ok`
- [ ] Database size is within expected range
- [ ] All expected tables are present

#### Item 6: Worker Processing

```bash
# Check worker logs for successful job processing
fly logs --app deepsynaps-studio --limit 50 | grep -i "job\|worker\|processing\|completed"

# Check that workers are not crashing
fly logs --app deepsynaps-studio --limit 50 | grep -i "error\|exception\|crash" | wc -l
# Expected: 0 errors

# If possible, check queue depth
# (Requires Redis CLI access)
```

- [ ] qEEG worker processing jobs without errors
- [ ] Stripe worker processing webhooks without errors
- [ ] No worker crash/restart loops in logs
- [ ] Queue depth is stable or decreasing

#### Item 7: Frontend Functionality

```bash
# Test frontend loads
curl -s -o /dev/null -w "Frontend: %{http_code}\n" https://deepsynaps-studio-preview.netlify.app

# Expected: 200
```

- [ ] Frontend loads without 5xx errors
- [ ] No CORS errors in browser console
- [ ] API calls from frontend succeed
- [ ] Authentication flow works end-to-end

#### Item 8: External Integrations

```bash
# Test Stripe connectivity
curl -s https://api.stripe.com/v1/health -H "Authorization: Bearer $(fly secrets get STRIPE_API_KEY --app deepsynaps-studio 2>/dev/null || echo 'MISSING')"

# Test OpenAI connectivity (if applicable)
# curl -s https://api.openai.com/v1/models -H "Authorization: Bearer ..."

# Test Knowledge Layer adapters
# Check logs for successful adapter calls
fly logs --app deepsynaps-studio --limit 50 | grep -i "adapter\|knowledge" | grep -i "success\|completed"
```

- [ ] Stripe API responds with 200
- [ ] OpenAI API responds (if used)
- [ ] Knowledge Layer adapters responding within timeout
- [ ] AWS S3 operations succeed (if used)

#### Item 9: Monitoring and Alerts

```bash
# Check that monitoring is working
# In Grafana: verify data is flowing
# In Sentry: verify error reporting is active
# In Fly dashboard: verify metrics are collected
```

- [ ] Grafana dashboards showing current data
- [ ] Sentry receiving error reports
- [ ] Fly.io metrics available
- [ ] No false-positive alerts firing
- [ ] Alerting channels (Slack, PagerDuty) functional

#### Item 10: User-Facing Verification

```bash
# Perform end-to-end smoke test:
# 1. Log in as a test user
# 2. Create a test patient record
# 3. Create a test session
# 4. Submit a test qEEG recording
# 5. Verify payment processing (test mode)
# 6. Generate a test report
# 7. Log out

# All of the above should complete without errors
```

- [ ] Login works
- [ ] Patient CRUD works
- [ ] Session CRUD works
- [ ] qEEG submission triggers worker job
- [ ] Worker job completes successfully
- [ ] Report generation works
- [ ] Logout works

### 10.2 If Any Verification Item Fails

```
If ANY of the 10 items fails:

1. Document which item failed and the observed behavior
2. Check application logs for related errors
3. If the issue is minor and not user-facing → note and proceed
4. If the issue is user-facing or critical → the rollback is INCOMPLETE
5. For incomplete rollbacks:
   a. Re-check the rollback target version
   b. Consider rolling back an additional release
   c. Check for configuration drift
   d. ESCALATE if the issue persists
```

---

## 11. ROLLBACK DECISION TREE

```
START: Anomaly Detected
│
├─ Is the platform COMPLETELY DOWN (0 healthy instances)?
│  ├─ YES → P0: SCALE TO 0 immediately → Follow Scenario 1 or 2
│  └─ NO → Continue
│
├─ Is there a SECURITY BREACH or PHI/PII exposure?
│  ├─ YES → P0: Follow Scenario 5 (Security Incident)
│  │         1. Scale to 0
│  │         2. Rotate ALL secrets
│  │         3. Revoke all sessions
│  │         4. Audit and assess
│  │         5. Deploy patched/safe version
│  └─ NO → Continue
│
├─ Did the incident start within 10 min of a deployment?
│  ├─ YES → DEPLOYMENT-RELATED
│  │         │
│  │         ├─ Are there DATABASE errors or migration failures?
│  │         │  ├─ YES → Follow Scenario 2 (Bad Migration)
│  │         │  │         1. Stop app
│  │         │  │         2. Assess damage
│  │         │  │         3. Downgrade migration OR restore backup
│  │         │  │         4. Deploy previous code version
│  │         │  │         5. Verify data integrity
│  │         │  └─ NO → Continue
│  │         │
│  │         ├─ Are there AUTH/API errors suggesting config?
│  │         │  ├─ YES → Follow Scenario 3 (Configuration Error)
│  │         │  │         1. Identify bad secret/config
│  │         │  │         2. Retrieve previous value
│  │         │  │         3. Update secret
│  │         │  │         4. Verify fix
│  │         │  └─ NO → Continue
│  │         │
│  │         └─ Default → Follow Scenario 1 (Bad Code Deploy)
│  │                    1. Identify bad release
│  │                    2. Deploy previous image
│  │                    3. Verify all process groups
│  │                    4. Verify error rate
│  │
│  └─ NO → NOT DEPLOYMENT-RELATED
│           │
│           ├─ Are external dependencies failing?
│           │  ├─ YES → Follow Scenario 4 (External Dependency)
│           │  │         1. Identify failing dependency
│           │  │         2. Check vendor status page
│           │  │         3. Enable degraded mode if possible
│           │  │         4. Wait for vendor or switch to backup
│           │  └─ NO → Continue
│           │
│           ├─ Is performance degraded (> 2x latency)?
│           │  ├─ YES → P2: Monitor, prepare rollback window
│           │  │         If degrading further → Escalate to P1
│           │  └─ NO → Continue
│           │
│           └─ UNCERTAIN
│                    1. Gather more data (logs, metrics)
│                    2. Consult with team in #incidents
│                    3. If no clear cause in 15 min → ESCALATE
│
├─ Error rate > 5%?
│  ├─ YES → P1: 2-person confirmation → Roll back to previous release
│  └─ NO → Continue monitoring
│
├─ Error rate 2-5%?
│  ├─ YES → P2: Monitor for 15 min, plan rollback if not improving
│  └─ NO → Continue monitoring
│
└─ Everything normal?
     → Close incident (false alarm / recovered)
     → Document in incident tracker

EMERGENCY ESCAPE HATCH:
If at ANY point the situation worsens beyond your ability to handle:
→ Call the on-call lead (see Escalation Matrix)
→ P0: Call the SRE manager
→ Start a phone bridge
→ Do NOT attempt heroics — get help
```

### 11.1 Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│           ROLLBACK QUICK REFERENCE CARD                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  P0 (Immediate, no approval):                               │
│    • Data loss / corruption                                 │
│    • PHI/PII exposure                                       │
│    • Security breach                                        │
│    • 0 healthy instances                                    │
│    ACTION: Scale to 0, then follow runbook                  │
│                                                              │
│  P1 (Roll back within 15 min):                              │
│    • Error rate > 5%                                        │
│    • Critical feature broken                                │
│    • ACTION: 2-person confirm, then roll back               │
│                                                              │
│  P2 (Plan rollback within 1 hour):                          │
│    • Performance degraded                                   │
│    • Non-critical broken                                    │
│    ACTION: Monitor, rollback at next window                 │
│                                                              │
│  P3 (Do NOT roll back):                                     │
│    • Cosmetic issues                                        │
│    • Monitoring gaps                                        │
│    ACTION: Patch forward                                    │
│                                                              │
│  COMMANDS:                                                   │
│    Roll back code:                                          │
│    fly deploy --image registry.fly.io/deepsynaps-studio:    │
│      <VERSION> --app deepsynaps-studio                      │
│                                                              │
│    Roll back migration:                                     │
│    fly ssh console --app deepsynaps-studio --command        │
│      "cd /app/apps/api && python -m alembic downgrade -1"   │
│                                                              │
│    Fix config:                                              │
│    fly secrets set NAME=VALUE --app deepsynaps-studio       │
│                                                              │
│    Emergency stop:                                          │
│    fly scale count 0 --app deepsynaps-studio                │
│                                                              │
│  VERIFICATION:                                               │
│    fly status --app deepsynaps-studio                       │
│    curl https://<host>/health                               │
│    (See full checklist in Section 10)                       │
│                                                              │
│  ESCALATION:                                                 │
│    Primary:   @sre-oncall                                     │
│    Secondary: @platform-lead                                  │
│    Emergency: Call SRE manager                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 12. COMMUNICATION TEMPLATE

### 12.1 Communication Timeline

| Time | Action | Channel | Audience |
|------|--------|---------|----------|
| **T+0 min** | Incident detected | #incidents | Engineering |
| **T+2 min** | Severity declared | #incidents + page if P0/P1 | On-call + Engineering |
| **T+5 min** | Rollback decision | #incidents | All engineers |
| **T+10 min** | Rollback started | #incidents + #general | Company-wide (P0/P1) |
| **T+15 min** | Status update | #incidents | Engineering |
| **T+30 min** | Status update | #incidents + status page | Company-wide + customers (if external) |
| **T+60 min** | Resolution or escalation | #incidents + phone bridge | Leadership (if unresolved) |
| **Post-resolution** | Incident closed | #incidents + #general | Company-wide |
| **+24 hours** | Post-mortem scheduled | Calendar invite | Incident participants |
| **+48 hours** | Post-mortem completed | Wiki + #incidents | Company-wide |

### 12.2 Message Templates

#### Template A: Incident Declared

```
:rotating_light: INCIDENT DECLARED :rotating_light:

**Severity:** [P0 / P1 / P2 / P3]
**Service:** DeepSynaps Protocol Studio
**Detected:** [timestamp] by [person/detection method]
**Symptoms:** [Brief description of what users are seeing]
**Impact:** [Which features are affected, approximate user count]
**Started by:** @handle

Current status: [INVESTIGATING / ROLLING BACK / MONITORING]
Next update in: [X] minutes

Thread for updates :thread:
```

#### Template B: Rollback Initiated

```
:warning: ROLLBACK IN PROGRESS :warning:

**Reason:** [Why we're rolling back — e.g., "Error rate spike to 15% after v1.4.2 deploy"]
**Rolling back from:** [bad version]
**Rolling back to:** [target version]
**Started by:** @handle
**ETA:** [X] minutes

Steps being taken:
1. [List steps]
2. [List steps]
3. [List steps]

No action needed from other teams at this time.
```

#### Template C: Rollback Complete — Verification in Progress

```
:white_check_mark: ROLLBACK COMPLETE — VERIFYING

**Rolled back to:** [version]
**Rollback completed at:** [timestamp]
**Duration:** [X] minutes

Current status: Verifying all systems
**DO NOT** deploy to production until verification is complete.

Verification checklist in progress:
- [ ] App health checks
- [ ] Error rate normalization
- [ ] Database connectivity
- [ ] Worker processing
- [ ] Frontend functionality

Next update in 5 minutes or upon verification completion.
```

#### Template D: All Clear

```
:large_green_circle: ALL CLEAR

**Incident resolved at:** [timestamp]
**Total duration:** [X] minutes
**Resolution:** [Brief description — e.g., "Rolled back to v1.4.1"]

All systems verified and operating normally.
- App: Healthy (2 instances)
- qEEG Worker: Processing normally
- Stripe Worker: Processing normally
- Database: Connected, normal load
- Evidence DB: Integrity verified

Post-mortem will be scheduled within 24 hours.
Incident ticket: [LINK]

Thank you for your patience.
```

#### Template E: Status Update (During Incident)

```
:information_source: UPDATE [+XX min since start]

**Status:** [INVESTIGATING / ROLLING BACK / VERIFYING / ESCALATED]
**Progress:** [What has been done since last update]
**Blockers:** [Any blockers or unknowns]
**Next step:** [What we're doing next]
**Next update:** [When to expect next update]
```

#### Template F: Escalation Notice

```
:phone: ESCALATION

**Reason:** [Why we're escalating — e.g., "Rollback failed, need senior SRE"]
**Escalating to:** [@person / team]
**Current situation:** [Brief summary]
**What we need help with:** [Specific assistance needed]
**Bridge:** [Phone bridge / Zoom link]
```

### 12.3 Customer-Facing Communication

**Only send customer-facing communication for P0 or P1 incidents with external impact.**

```
Subject: DeepSynaps Protocol Studio — Service Update

We are currently investigating an issue affecting [feature/service].
Some users may experience [symptom].

Our engineering team is actively working on a resolution.
We will provide an update within [30] minutes.

Thank you for your patience.

— DeepSynaps Support Team
```

### 12.4 Post-Resolution Update

```
Subject: DeepSynaps Protocol Studio — Issue Resolved

The issue affecting [feature/service] has been resolved.
All systems are now operating normally.

What happened:
[1-2 sentence technical summary]

What we did:
[1-2 sentence resolution summary]

What we're doing to prevent this in the future:
[Reference to post-mortem action items]

We apologize for any inconvenience this may have caused.

— DeepSynaps Engineering Team
```

---

## 13. ESCALATION MATRIX

### 13.1 Escalation Levels

| Level | Role | Contact | When to Escalate | Response Time |
|-------|------|---------|-----------------|---------------|
| **L1** | On-call Engineer | @sre-oncall in Slack | P0/P1 incidents, any rollback | 5 minutes |
| **L2** | SRE Team Lead | @sre-lead in Slack / phone | Rollback fails, complex incident | 10 minutes |
| **L3** | Platform Engineering Lead | @platform-lead in Slack / phone | Multi-system failure, security incident | 15 minutes |
| **L4** | Engineering Director | Phone call | Extended outage > 1 hour, data loss | 20 minutes |
| **L5** | VP Engineering / CTO | Phone call | All-hands incident, PHI exposure, regulatory | 30 minutes |

### 13.2 Escalation Triggers

**Escalate to L2 when:**
- [ ] Rollback procedure fails (app doesn't come back healthy)
- [ ] Database corruption is detected
- [ ] Security incident is confirmed
- [ ] Incident duration exceeds 30 minutes
- [ ] More than one system is affected
- [ ] You are unsure which procedure to follow

**Escalate to L3 when:**
- [ ] L2 is unavailable after 10 minutes
- [ ] Multiple rollbacks have failed
- [ ] Data restoration is required from backup
- [ ] External vendor involvement is needed (Fly.io, Stripe)
- [ ] Incident has potential regulatory impact (HIPAA)

**Escalate to L4 when:**
- [ ] L3 is unavailable after 15 minutes
- [ ] Platform outage exceeds 1 hour
- [ ] Data loss is confirmed
- [ ] Customer-facing SLA breach is imminent

**Escalate to L5 when:**
- [ ] L4 is unavailable after 20 minutes
- [ ] PHI/PII exposure is confirmed
- [ ] Regulatory notification may be required
- [ ] Extended outage > 2 hours
- [ ] Revenue-impacting event (payment processing down)

### 13.3 Emergency Contacts

```
On-call Engineer (L1):
  Slack: @sre-oncall
  PagerDuty: [LINK]
  Phone: Check PagerDuty for current on-call

SRE Team Lead (L2):
  Slack: @sre-lead
  Phone: [REDACTED — see internal directory]
  Secondary: [REDACTED]

Platform Lead (L3):
  Slack: @platform-lead
  Phone: [REDACTED — see internal directory]

Engineering Director (L4):
  Phone: [REDACTED — see internal directory]

VP Engineering (L5):
  Phone: [REDACTED — see internal directory]

External Contacts:
  Fly.io Support: https://fly.io/docs/about/support/
  Fly.io Status: https://status.fly.io/
  Stripe Support: https://support.stripe.com/
  Stripe Status: https://status.stripe.com/
```

### 13.4 Escalation Procedure

```bash
# When escalating:

# 1. Document what you've tried
# 2. Document current system state
# 3. Document what you believe the issue is
# 4. Document what you need help with

# 5. Post in #incidents with escalation tag:
# :arrow_up: ESCALATING to L[2/3/4/5]
# Reason: [brief reason]
# Tried: [what you've attempted]
# Current state: [system status]
# Need help with: [specific ask]

# 6. Page the next level if no response in [5/10/15/20] minutes
# Use PagerDuty or phone as appropriate

# 7. Start a phone bridge for P0 incidents
# Zoom/Meet link: [REDACTED]
# Bridge number: [REDACTED]
```

---

## APPENDIX A: REFERENCE COMMANDS

### A.1 Fly.io Commands

```bash
# App status
fly status --app deepsynaps-studio
fly status --app deepsynaps-studio --json
fly status --app deepsynaps-studio --watch

# Logs
fly logs --app deepsynaps-studio
fly logs --app deepsynaps-studio --limit 100
fly logs --app deepsynaps-studio --follow

# Machine management
fly machines list --app deepsynaps-studio
fly machine status <MACHINE_ID> --app deepsynaps-studio
fly machine restart <MACHINE_ID> --app deepsynaps-studio
fly machine stop <MACHINE_ID> --app deepsynaps-studio

# Scaling
fly scale count 0 --app deepsynaps-studio                    # Stop all
fly scale count 2 --app deepsynaps-studio --group app        # Scale app group
fly scale count 1 --app deepsynaps-studio --group qeeg_worker
fly scale count 1 --app deepsynaps-studio --group stripe_worker

# Deployments
fly deploy --app deepsynaps-studio --config apps/api/fly.toml
fly deploy --image <IMAGE> --app deepsynaps-studio
fly releases list --app deepsynaps-studio
fly releases list --app deepsynaps-studio --limit 20

# Secrets
fly secrets list --app deepsynaps-studio
fly secrets set NAME=VALUE --app deepsynaps-studio
fly secrets unset NAME --app deepsynaps-studio

# SSH
fly ssh console --app deepsynaps-studio
fly ssh console --app deepsynaps-studio --command "<COMMAND>"

# Database
fly status --app deepsynaps-db
fly ssh console --app deepsynaps-db

# Apps
fly apps restart deepsynaps-studio
fly apps list | grep deepsynaps

# Volumes
fly volumes list --app deepsynaps-studio
fly volumes list --app deepsynaps-db
fly volumes snapshots list <VOLUME_ID>
```

### A.2 Database Commands

```bash
# Alembic (run via fly ssh console)
cd /app/apps/api && python -m alembic current          # Show current revision
cd /app/apps/api && python -m alembic history            # Show all revisions
cd /app/apps/api && python -m alembic history --verbose  # Detailed history
cd /app/apps/api && python -m alembic downgrade -1       # Roll back one step
cd /app/apps/api && python -m alembic downgrade <REVISION>  # Roll back to specific revision
cd /app/apps/api && python -m alembic upgrade +1         # Roll forward one step
cd /app/apps/api && python -m alembic stamp <REVISION>   # Force version without running migrations

# PostgreSQL (inside fly ssh console --app deepsynaps-db)
psql -d deepsynaps
  \dt                              # List tables
  \d <table>                       # Describe table
  SELECT * FROM alembic_version;   # Check migration version
  SELECT pg_size_pretty(pg_database_size('deepsynaps'));  # DB size
  \q                               # Quit

# SQLite (evidence DB)
sqlite3 /data/evidence.db
  .tables                          # List tables
  .schema <table>                  # Show table schema
  PRAGMA integrity_check;          # Check integrity
  PRAGMA foreign_key_check;        # Check foreign keys
  .quit                            # Quit

# Quick health checks
# PostgreSQL connection
echo "SELECT 1;" | psql -d deepsynaps

# SQLite integrity
sqlite3 /data/evidence.db "PRAGMA integrity_check;"
```

### A.3 Application Verification Commands

```bash
# Get app hostname
APP_HOST=$(fly status --app deepsynaps-studio --json | jq -r '.Hostname')

# Health check
curl -s https://${APP_HOST}/health | jq .

# API endpoints
curl -s https://${APP_HOST}/api/v1/health
curl -s https://${APP_HOST}/api/v1/auth/status
curl -s https://${APP_HOST}/api/v1/sessions
curl -s https://${APP_HOST}/api/v1/qeeg/status
curl -s https://${APP_HOST}/api/v1/payments/status

# With headers
curl -s -D - https://${APP_HOST}/health | head -20

# Frontend
curl -s -o /dev/null -w "%{http_code}" https://deepsynaps-studio-preview.netlify.app

# Stripe API health
curl -s https://api.stripe.com/v1/health
```

### A.4 Monitoring Commands

```bash
# Watch logs in real-time
fly logs --app deepsynaps-studio --follow

# Check error counts
fly logs --app deepsynaps-studio --limit 1000 | grep -i "error\|exception" | wc -l

# Check specific patterns
fly logs --app deepsynaps-studio --limit 500 | grep -i "timeout"
fly logs --app deepsynaps-studio --limit 500 | grep -i "5[0-9][0-9]"
fly logs --app deepsynaps-studio --limit 500 | grep -i "memory\|oom"
fly logs --app deepsynaps-studio --limit 500 | grep -i "worker.*fail\|job.*fail"

# Check machine CPU/memory (via fly dashboard)
# OR via fly CLI metrics (if available)
fly metrics --app deepsynaps-studio
```

---

## APPENDIX B: COMMON ERROR PATTERNS

### B.1 Error Pattern Quick Reference

| Error Message | Likely Cause | Scenario | Quick Fix |
|--------------|-------------|----------|-----------|
| `sqlalchemy.exc.OperationalError: connection refused` | DATABASE_URL wrong or DB down | 2, 3 | Check DB status, check DATABASE_URL secret |
| `alembic.util.exc.CommandError: Can't locate revision` | Migration mismatch | 2 | Run `alembic current`, compare with code |
| `jwt.exceptions.InvalidSignatureError` | JWT_SECRET changed | 3 | Rotate JWT_SECRET, redeploy |
| `stripe.error.AuthenticationError` | Stripe API key invalid | 3, 4 | Check STRIPE_API_KEY secret |
| `ModuleNotFoundError: No module named 'xxx'` | Bad deploy, missing package | 1 | Roll back to previous image |
| `ImportError: cannot import name 'xxx'` | Bad deploy, API change | 1 | Roll back to previous image |
| `sqlite3.DatabaseError: database disk image is malformed` | Evidence DB corruption | 2 | Restore from volume snapshot |
| `redis.exceptions.ConnectionError` | Redis down or URL wrong | 3, 4 | Check REDIS_URL, check Redis status |
| `openai.error.APIError` | OpenAI API issue | 4 | Check OpenAI status, disable AI features |
| `botocore.exceptions.NoCredentialsError` | AWS credentials missing | 3 | Check AWS secrets |
| `MemoryError` or `Killed` | OOM (out of memory) | 1 | Scale memory, optimize code |
| `504 Gateway Timeout` | Upstream timeout | 4 | Check dependency latency |
| `401 Unauthorized` for all requests | Auth system broken | 3, 5 | Check JWT_SECRET, auth config |
| `500 Internal Server Error` (spike) | Code bug | 1 | Roll back to previous image |
| Worker jobs not processing | Worker crashed | 1, 3 | Check worker logs, restart workers |
| Queue growing indefinitely | Worker not consuming | 1, 4 | Check worker status, restart |

### B.2 Log Analysis Patterns

```bash
# Find the most common errors
cat /tmp/incident_logs_app.txt | grep -oP '(?<=ERROR ).*' | sort | uniq -c | sort -rn | head -20

# Find error rate over time
cat /tmp/incident_logs_app.txt | grep -c "ERROR"
# Divide by time range for rate

# Find when errors started
cat /tmp/incident_logs_app.txt | grep "ERROR" | head -5
# First error timestamp = incident start (approximate)

# Find which endpoints are failing
cat /tmp/incident_logs_app.txt | grep -oP '(?<=path=)[^ ]*' | sort | uniq -c | sort -rn | head -10

# Find which users are affected
cat /tmp/incident_logs_app.txt | grep -oP '(?<=user_id=)[^ ]*' | sort | uniq -c | sort -rn | head -10
```

---

## APPENDIX C: RECOVERY TIME OBJECTIVES

### C.1 RTO / RPO Targets

| Component | RTO (Recovery Time) | RPO (Data Loss) | Method |
|-----------|-------------------|-----------------|--------|
| `app` (HTTP API) | < 10 minutes | N/A | Roll back image |
| `qeeg_worker` | < 15 minutes | Reprocess jobs | Roll back image |
| `stripe_worker` | < 15 minutes | Reprocess webhooks | Roll back image |
| PostgreSQL (`deepsynaps-db`) | < 30 minutes | < 1 hour | Point-in-time recovery |
| Evidence DB (`/data/evidence.db`) | < 1 hour | < 24 hours | Volume snapshot restore |
| Frontend (Netlify) | < 5 minutes | N/A | Publish previous deploy |

### C.2 Expected Rollback Durations

| Scenario | Detection | Rollback | Verification | Total |
|----------|-----------|----------|-------------|-------|
| Bad Code Deploy | 2 min | 3 min | 5 min | **10 min** |
| Bad Migration (no corruption) | 2 min | 5 min | 10 min | **17 min** |
| Bad Migration (with corruption) | 5 min | 20 min | 15 min | **40 min** |
| Configuration Error | 2 min | 2 min | 5 min | **9 min** |
| External Dependency | 2 min | 0 min (degrade) | 5 min | **7 min** |
| Security Incident | 5 min | 15 min | 15 min | **35 min** |

### C.3 Maximum Tolerable Downtime

| Service | Max Downtime | Business Impact if Exceeded |
|---------|-------------|---------------------------|
| `app` (HTTP API) | 30 minutes | Clinical workflows halted, revenue loss |
| `qeeg_worker` | 60 minutes | qEEG processing backlog, delayed reports |
| `stripe_worker` | 30 minutes | Payment processing failure, billing issues |
| PostgreSQL | 15 minutes | Complete platform outage |
| Evidence DB | 60 minutes | Unable to access evidence records |

---

## DOCUMENT CONTROL

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-01-15 | SRE Team | Initial release |

### Review Schedule

- **Quarterly review:** First Monday of each quarter
- **After every incident:** Update with lessons learned
- **After major architecture changes:** Update topology and procedures

### Approval

| Role | Name | Date |
|------|------|------|
| SRE Team Lead | | |
| Platform Engineering Lead | | |
| Engineering Director | | |

---

> **END OF RUNBOOK**
>
> Remember: When in doubt, escalate. No one gets fired for calling for help.
> The runbook is a guide, not a cage. Use judgment, communicate, and stay calm.
