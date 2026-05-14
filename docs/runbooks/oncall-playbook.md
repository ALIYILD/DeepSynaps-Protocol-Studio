# On-Call Engineer Playbook — DeepSynaps Protocol Studio

> **Role:** Platform On-Call Engineer  
> **Coverage:** 24x7 with 15-minute response SLA for P1/P2  
> **Shift Duration:** 1 week (Monday 00:00 UTC → Monday 00:00 UTC)  
> **Rotation:** Primary + Secondary (backup after 5-min unacknowledged)  
> **Owner:** SRE Lead  
> **Last Updated:** 2026-05-14

---

## Table of Contents

1. [Pre-Shift Preparation Checklist](#1-pre-shift-preparation-checklist)
2. [Common Alert Responses](#2-common-alert-responses)
3. [Debugging Commands and Queries](#3-debugging-commands-and-queries)
4. [Rollback Procedures Quick Reference](#4-rollback-procedures-quick-reference)
5. [Emergency Contact List](#5-emergency-contact-list)
6. [Shift Handoff Template](#6-shift-handoff-template)
7. [Quick Reference Cards](#7-quick-reference-cards)

---

## 1. Pre-Shift Preparation Checklist

Complete this checklist at the start of every on-call shift. It should take 10-15 minutes.

### 1.1 Environment Setup

- [ ] **PagerDuty/OpsGenie app installed** on phone with push notifications enabled
- [ ] **Slack mobile app installed**; `#incidents`, `#alerts`, `#oncall` channels favorited
- [ ] **VPN/Fly.io access verified** — can run `fly status --app deepsynaps-studio`
- [ ] **Repository cloned** and up to date: `git pull origin main`
- [ ] **Python environment ready** — `uv` installed and working
- [ ] **Demo tokens available** for authentication testing:
  - `guest-demo-token`
  - `clinician-demo-token`
  - `admin-demo-token`

### 1.2 System Health Baseline

- [ ] Check production health endpoint:
  ```bash
  curl -s https://deepsynaps-studio.fly.dev/health | jq .
  ```
- [ ] Check Fly.io machine status:
  ```bash
  fly status --app deepsynaps-studio
  ```
- [ ] Review open alerts from previous shift:
  ```bash
  # In Slack, check #alerts and #incidents for unresolved items
  ```
- [ ] Review current worker queue status:
  ```bash
  # Check via logs if direct Celery inspect is unavailable
  fly logs --app deepsynaps-studio --recent | grep -i "celery\|worker\|queue" | tail -20
  ```
- [ ] Check recent deployments:
  ```bash
  fly releases list --app deepsynaps-studio | head -5
  ```

### 1.3 Runbook Accessibility

- [ ] This playbook bookmarked and accessible offline (PDF export recommended)
- [ ] [Incident Response Runbook](./incident-response.md) accessible
- [ ] [Capacity Planning Guide](./capacity-planning.md) accessible
- [ ] [Performance Tuning Guide](./performance-tuning.md) accessible
- [ ] [Release Process](../operations/release-process.md) accessible

### 1.4 Shift Start Confirmation

Post in `#oncall` Slack channel:
```
:wave: Shift start: @engineer-name taking primary on-call.
Health check: PASS (or describe issues)
Open items from previous shift: [none / list]
Ready for alerts.
```

---

## 2. Common Alert Responses

### Alert Decision Tree

```
ALERT RECEIVED
     |
+----+----+
|         |
v         v
HEALTH   OTHER
CHECK    ALERT
  |         |
  v         v
OK?    IDENTIFY
  |    SOURCE
+--+--+    |
|     |    v
YES   NO   DATABASE
 |     |    API
 |     |    WORKER
 |     |    SECURITY
 |     |    EXTERNAL
 |     |    |
 |     |    v
 |     |  SEVERITY?
 |     |  P1 → INCIDENT RESPONSE
 |     |  P2 → NOTIFY + INVESTIGATE
 |     |  P3 → TICKET + NEXT SPRINT
 |     v
 |   EXECUTE
 |   RUNBOOK
 v
NOTE &
MONITOR
```

### Alert: `/health` Endpoint Failing

**Symptoms:** Fly.io health checks returning non-200; potential service outage.

```bash
# 1. Check health directly
curl -v https://deepsynaps-studio.fly.dev/health

# 2. Check detailed health (if accessible)
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# 3. Check machine status
fly status --app deepsynaps-studio

# 4. Check recent logs for crash reasons
fly logs --app deepsynaps-studio --recent | tail -50
```

**Decision branches:**

| Health Response | Action |
|-----------------|--------|
| 200 OK | Transient issue; monitor for 10 minutes |
| 503 Service Unavailable | Check database connectivity, memory pressure |
| Connection refused | App may have crashed; check `fly status` and restart |
| 500 Internal Error | Check Sentry for exceptions; follow Error Spike runbook |
| Timeout | Check for resource exhaustion or infinite loops |

### Alert: Error Rate Spike

**Symptoms:** Sentry reporting elevated errors; 5xx rate > 0.1%.

```bash
# 1. Check Sentry for error patterns
# 2. Check logs for error frequency
fly logs --app deepsynaps-studio --recent | grep -c "ERROR"

# 3. Get error samples
fly logs --app deepsynaps-studio --recent | grep "ERROR" | head -20

# 4. Check if errors correlate with a deployment
fly releases list --app deepsynaps-studio
# Compare error start time with release time
```

**Decision branches:**

| Error Pattern | Action |
|---------------|--------|
| Errors correlate with deploy | **ROLLBACK IMMEDIATELY** (see Section 4) |
| Database connection errors | Follow Database Outage runbook |
| 502/503 from upstream | Check external dependencies (OpenAI, Stripe, Anthropic) |
| Memory/OOM errors | Scale up VM memory or reduce worker count |
| Specific route errors | Disable affected router if possible; hotfix |
| Intermittent/transient | Monitor; may be temporary upstream issue |

### Alert: High Latency (P95 > 200ms)

**Symptoms:** API response times exceeding SLA; user complaints about slowness.

```bash
# 1. Check current latency
curl -w "\nTime: %{time_total}s\nDNS: %{time_namelookup}s\nConnect: %{time_connect}s\n" \
  -s -o /dev/null https://deepsynaps-studio.fly.dev/health

# 2. Check Fly.io metrics
fly metrics --app deepsynaps-studio

# 3. Check if specific endpoints are slow
# (Review application logs for request duration)
fly logs --app deepsynaps-studio --recent | grep -i "slow\|duration\|ms" | tail -30

# 4. Check database query performance
# If direct DB access available:
# psql $DB_URL -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

**Decision branches:**

| Cause Pattern | Action |
|---------------|--------|
| CPU throttling | Scale to performance CPU kind or add machines |
| Memory pressure | Check for leaks; restart or scale memory |
| Slow DB queries | Identify and kill long-running queries; add indices |
| External API latency | Check OpenAI/Stripe/Anthropic status pages |
| Worker queue backlog | Scale workers or investigate job failures |
| Large payload upload | Check media upload size; may be legitimate |

### Alert: Worker Queue Backlog (Celery)

**Symptoms:** qEEG analyses not completing; queue depth growing; jobs timing out.

```bash
# 1. Check worker process status via logs
fly logs --app deepsynaps-studio --recent | grep -i "celery\|worker" | tail -30

# 2. Check Fly.io machine status for worker processes
fly status --app deepsynaps-studio

# 3. Check for OOM errors in workers
fly logs --app deepsynaps-studio --recent | grep -i "oom\|killed\|memory" | tail -20
```

**Decision branches:**

| Cause Pattern | Action |
|---------------|--------|
| Worker machines down | Restart worker machines via `fly machine restart` |
| OOM killing workers | Workers need more memory — scale VM or reduce concurrency |
| Redis unavailable | Check Redis/Upstash status; Celery will queue locally if configured |
| Job processing but slow | Normal under load — monitor queue depth trend |
| Jobs failing repeatedly | Check Sentry for task exceptions; may need code fix |

### Alert: Database Connection Pool Exhaustion

**Symptoms:** Errors about "too many connections"; requests queuing; eventual timeouts.

```bash
# 1. Check active connections (PostgreSQL)
# psql $DB_URL -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"

# 2. Check for idle connections
# psql $DB_URL -c "SELECT pid, state, query_start, query FROM pg_stat_activity WHERE state = 'idle' ORDER BY query_start;"

# 3. Restart application to reset pool
fly machine restart <machine-id> --app deepsynaps-studio
```

**Immediate Mitigation:**
- Restart application machines to reset connection pools
- If chronic issue, add PgBouncer connection pooler
- Reduce `pool_size` in SQLAlchemy configuration temporarily

### Alert: External Dependency Failure

**Symptoms:** Errors from Stripe, OpenAI, Anthropic, or other external services.

```bash
# Check external service status pages:
# Stripe:     https://status.stripe.com/
# OpenAI:     https://status.openai.com/
# Anthropic:  https://status.anthropic.com/
# Fly.io:     https://status.fly.io/
# Upstash:    https://status.upstash.io/
```

**Decision branches:**

| Dependency | Fallback Behavior | Action |
|------------|-------------------|--------|
| OpenAI (Whisper) | Transcription unavailable | Switch to `WHISPER_PROVIDER=local` if configured |
| Anthropic (AI Chat) | Deterministic fallback responses | Notify users of reduced AI capability |
| Stripe (Payments) | Payments fail open (grace period) | Enable offline billing mode; retry queue |
| Redis (Celery) | Celery falls back to synchronous | API requests for qEEG will be synchronous; monitor load |
| Fly.io (Platform) | N/A — follow Fly.io status | Wait for resolution; consider multi-region if prolonged |

### Alert: Disk Space Warning (SQLite/Volume)

**Symptoms:** Volume approaching capacity; write failures.

```bash
# 1. Check volume usage
fly ssh console --app deepsynaps-studio -C "df -h /data"

# 2. Check what's consuming space
fly ssh console --app deepsynaps-studio -C "du -sh /data/* | sort -rh"

# 3. Clean up old backups if safe
fly ssh console --app deepsynaps-studio -C "ls -la /data/backups/"

# 4. If media uploads are consuming space:
# Review and archive old media files
fly ssh console --app deepsynaps-studio -C "du -sh /data/media_uploads/"
```

**Mitigation:**
- Clean up old backups (keep last 7 days minimum)
- Archive old media uploads
- Expand volume if needed: `fly volumes extend <vol-id> --size <new-size> --app deepsynaps-studio`

---

## 3. Debugging Commands and Queries

### 3.1 Fly.io Commands

```bash
# App status
fly status --app deepsynaps-studio

# Machine list
fly machine list --app deepsynaps-studio

# Restart a machine
fly machine restart <machine-id> --app deepsynaps-studio

# SSH into machine
fly ssh console --app deepsynaps-studio

# View logs (recent)
fly logs --app deepsynaps-studio --recent

# View logs (follow)
fly logs --app deepsynaps-studio

# View logs (specific machine)
fly logs --app deepsynaps-studio --machine <machine-id>

# Deploy with specific config
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile

# List releases
fly releases list --app deepsynaps-studio

# Show app info
fly info --app deepsynaps-studio

# Show volume info
fly volumes list --app deepsynaps-studio

# Metrics
fly metrics --app deepsynaps-studio
```

### 3.2 Health Check Commands

```bash
# Basic health check
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# Expected response:
# {
#   "status": "healthy",
#   "database": { "status": "connected", "type": "postgresql|sqlite" },
#   "version": "0.1.0",
#   "environment": "production"
# }

# API smoke test with authentication
curl -s https://deepsynaps-studio.fly.dev/api/v1/registries/conditions \
  -H "Authorization: Bearer clinician-demo-token" | jq . | head -20

# Full deployment smoke test (qEEG pipeline)
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf
```

### 3.3 Database Debugging

**SQLite (current production):**
```bash
# SSH into machine and run SQLite commands
fly ssh console --app deepsynaps-studio -C "sqlite3 /data/deepsynaps_protocol_studio.db '.tables'"

# Check database integrity
fly ssh console --app deepsynaps-studio -C "sqlite3 /data/deepsynaps_protocol_studio.db 'PRAGMA integrity_check;'"

# Check database size
fly ssh console --app deepsynaps-studio -C "ls -lh /data/deepsynaps_protocol_studio.db"

# Check table sizes
fly ssh console --app deepsynaps-studio -C "sqlite3 /data/deepsynaps_protocol_studio.db \
  'SELECT name, COUNT(*) FROM sqlite_master WHERE type=\"table\";'"

# Recent backup check
fly ssh console --app deepsynaps-studio -C "ls -la /data/backups/"
```

**PostgreSQL (future target):**
```bash
# Connection count
psql $DEEPSYNAPS_DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Long-running queries
psql $DEEPSYNAPS_DATABASE_URL -c "SELECT pid, now() - query_start AS duration, query 
  FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 10;"

# Table sizes
psql $DEEPSYNAPS_DATABASE_URL -c "SELECT schemaname, tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"

# Lock detection
psql $DEEPSYNAPS_DATABASE_URL -c "SELECT * FROM pg_locks WHERE NOT granted;"
```

### 3.4 Celery Worker Debugging

```bash
# Note: These require direct access to the worker environment
# Check active workers
celery -A app.jobs inspect active --workdir apps/api

# Check registered tasks
celery -A app.jobs inspect registered --workdir apps/api

# Purge queue (WARNING: destructive — only if tasks are corrupt)
celery -A app.jobs control purge --workdir apps/api

# Restart worker
# Workers are Fly.io machines — restart via:
fly machine restart <worker-machine-id> --app deepsynaps-studio
```

### 3.5 Log Analysis

```bash
# Recent errors
fly logs --app deepsynaps-studio --recent | grep -i "error\|exception\|traceback" | tail -30

# Specific route errors
fly logs --app deepsynaps-studio --recent | grep "/api/v1/<route-name>"

# Slow requests
fly logs --app deepsynaps-studio --recent | grep -i "slow\|timeout\|duration"

# Authentication failures
fly logs --app deepsynaps-studio --recent | grep -i "auth\|unauthorized\|forbidden"

# Worker activity
fly logs --app deepsynaps-studio --recent | grep -i "celery\|worker\|task"

# Database activity
fly logs --app deepsynaps-studio --recent | grep -i "database\|sqlalchemy\|sqlite"
```

---

## 4. Rollback Procedures Quick Reference

### 4.1 Emergency Code Rollback

When a deployment causes issues, roll back to the previous release:

```bash
# 1. Identify the previous good release
fly releases list --app deepsynaps-studio | head -5

# 2. Rollback to previous image
# Get the image reference from the previous release:
fly releases list --app deepsynaps-studio --image | head -5

# 3. Deploy the previous image
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
  --image <previous-image-ref>

# 4. Verify rollback
fly status --app deepsynaps-studio
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# 5. Run smoke test
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf
```

### 4.2 Database Rollback

**SQLite rollback from backup:**
```bash
# 1. Stop the app
fly machine stop <machine-id> --app deepsynaps-studio

# 2. Backup current (possibly corrupted) database
cp /data/deepsynaps_protocol_studio.db /data/deepsynaps_protocol_studio_emergency_backup_$(date +%Y%m%d_%H%M%S).db

# 3. Restore from latest automated backup
cp /data/backups/deepsynaps_protocol_studio_latest.db /data/deepsynaps_protocol_studio.db

# 4. Verify integrity
sqlite3 /data/deepsynaps_protocol_studio.db 'PRAGMA integrity_check;'

# 5. Restart the app
fly machine start <machine-id> --app deepsynaps-studio

# 6. Verify
fly status --app deepsynaps-studio
curl -s https://deepsynaps-studio.fly.dev/health | jq .
```

### 4.3 Configuration Rollback

```bash
# 1. List current secrets
fly secrets list --app deepsynaps-studio

# 2. Rollback a specific secret (example: reverting a bad config)
# Note: Fly.io doesn't have automatic secret rollback.
# You must have the previous value documented.
fly secrets set DEEPSYNAPS_<SETTING>=<previous-value> --app deepsynaps-studio

# 3. Verify after secret change (app restarts automatically)
fly status --app deepsynaps-studio
```

### 4.4 Feature Flag / Router Disable

If a specific feature is causing issues, disable it:

```bash
# Option 1: Environment variable disable
# Set feature flag to 0/false via secrets
fly secrets set MRI_DEMO_MODE=0 --app deepsynaps-studio

# Option 2: Scale down specific worker processes
# If qEEG workers are causing issues:
fly scale count qeeg_worker=0 --app deepsynaps-studio

# Option 3: Restart with increased logging
fly machine restart <machine-id> --app deepsynaps-studio
```

---

## 5. Emergency Contact List

### 5.1 Team Contacts

| Role | Name | Primary Contact | Backup Contact |
|------|------|-----------------|----------------|
| Primary On-Call | [Rotation] | PagerDuty Push | — |
| Secondary On-Call | [Rotation] | PagerDuty Push (5-min delay) | — |
| SRE Lead | [Name] | [Phone] | [Phone] |
| Engineering Lead | [Name] | [Phone] | [Phone] |
| Clinical Safety Officer | [Name] | [Phone] | [Phone] |
| Product Lead | [Name] | [Phone] | [Email] |
| CTO | [Name] | [Phone] | [Phone] |
| Legal/Compliance | [Name] | [Email] | [Email] |

### 5.2 Vendor Support

| Vendor | Support URL | Phone | Escalation |
|--------|-------------|-------|------------|
| Fly.io | https://fly.io/support | — | Priority plan required |
| Stripe | https://support.stripe.com | +1-888-963-8442 | Dashboard → Phone |
| Sentry | https://sentry.io/support | — | In-app chat |
| OpenAI | https://help.openai.com | — | Support ticket |
| Anthropic | https://support.anthropic.com | — | Console support |

### 5.3 Clinical Emergency Contacts

| Role | Contact | When to Call |
|------|---------|--------------|
| Clinical Safety Officer | [Phone] | Any incident affecting patient data or clinical workflows |
| HIPAA Compliance Officer | [Phone] | Any suspected data breach |
| Medical Director | [Phone] | P1 incidents with potential patient harm |

---

## 6. Shift Handoff Template

### 6.1 Handoff Timing

Primary on-call shift transitions occur **Monday 00:00 UTC**.
Handoff must be completed within 1 hour of shift transition.

### 6.2 Handoff Content

Post the following in `#oncall` Slack channel:

```markdown
## Shift Handoff: [Outgoing Engineer] → [Incoming Engineer]
**Period:** [Start Date] to [End Date]

### System Health
- [ ] `/health` endpoint: PASS/FAIL
- [ ] Fly.io status: HEALTHY/DEGRADED
- [ ] Worker status: HEALTHY/DEGRADED
- [ ] No active incidents: YES/NO

### Incidents During Shift
| Time | Severity | Description | Status | Link |
|------|----------|-------------|--------|------|
| | | | | |

### Open Alerts / Warnings
| Alert | Severity | Status | Notes |
|-------|----------|--------|-------|
| | | | |

### Scheduled Maintenance
| Item | Scheduled Time | Status |
|------|----------------|--------|
| | | |

### Follow-Up Items
| Item | Owner | Due |
|------|-------|-----|
| | | |

### Notes / Context
[Any additional context the incoming engineer should know]

**Outgoing:** @engineer-name — Shift complete.
**Incoming:** @engineer-name — Acknowledged, taking primary.
```

### 6.3 Unresolved Incident Handoff

If an incident is ongoing at shift change:
1. Both engineers remain engaged until incident is contained
2. Outgoing engineer provides full context to incoming
3. Incoming engineer assumes incident commander role
4. Outgoing engineer stays available for 1 hour post-handoff

---

## 7. Quick Reference Cards

### Card 1: "If the API is down"
```
1. curl https://deepsynaps-studio.fly.dev/health
2. fly status --app deepsynaps-studio
3. fly logs --app deepsynaps-studio --recent | tail -50
4. Check Sentry for error spikes
5. If recent deploy: ROLLBACK
6. If resource issue: SCALE UP
7. If DB issue: See Database runbook
8. Run smoke test after recovery
```

### Card 2: "If qEEG analysis is not completing"
```
1. Check worker logs: fly logs | grep -i "celery\|worker"
2. Check machine status: fly status
3. Check for OOM errors in logs
4. If workers down: fly machine restart <worker-id>
5. If OOM: scale VM memory or reduce concurrency
6. If Redis down: Celery may fallback to sync mode
7. Test: uv run scripts/qeeg_deploy_smoke.py --base-url ... --token ...
```

### Card 3: "If database errors"
```
1. Check health endpoint DB status
2. SQLite: fly ssh console -C "sqlite3 /data/...db 'PRAGMA integrity_check;'"
3. Check disk space: fly ssh console -C "df -h /data"
4. If corrupt: restore from /data/backups/
5. If full: clean old backups or expand volume
6. Verify: curl /health + run smoke tests
```

### Card 4: "If there's a security concern"
```
1. DO NOT DELETE LOGS
2. Page Clinical Safety Officer immediately
3. Save logs: fly logs > /tmp/incident-logs.txt
4. Isolate compromised machines
5. Rotate compromised credentials
6. Assess data exposure scope
7. Document everything for compliance
8. Follow Security Breach runbook in incident-response.md
```

### Card 5: "If payment/billing issues"
```
1. Check Stripe status: https://status.stripe.com
2. Check Stripe webhook logs
3. Check retry worker: fly logs | grep stripe_worker
4. Verify webhook secret is correct
5. If Stripe is down: billing queue will auto-retry
6. Check payment routes for errors in Sentry
7. Test with Stripe test mode if needed
```

### Card 6: "If performance is degraded"
```
1. Measure latency: curl -w "%{time_total}" /health
2. Check Fly.io metrics: fly metrics
3. Check for recent deployments
4. Check DB query performance
5. Check external API latency
6. Check worker queue depth
7. Scale up if resource-constrained
8. Profile slow endpoints if chronic
```

---

## Cross-References

- [Incident Response Runbook](./incident-response.md) — Full incident procedures
- [Capacity Planning Guide](./capacity-planning.md) — Scaling decisions
- [Performance Tuning Guide](./performance-tuning.md) — Optimization procedures
- [Release Process](../operations/release-process.md) — Deployment and rollback
- [SLA Definition](../operations/sla-definition.md) — Service level targets
