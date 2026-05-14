# Incident Response Procedures — DeepSynaps Protocol Studio

> **Classification:** Critical Operations Document  
> **Applies To:** Platform Operations, Clinical Engineering, Security, DevOps  
> **Owner:** Site Reliability Engineering (SRE) Lead  
> **Review Cycle:** Quarterly  
> **Last Updated:** 2026-05-14

---

## Table of Contents

1. [Incident Severity Classification](#1-incident-severity-classification)
2. [Response Procedures by Severity](#2-response-procedures-by-severity)
3. [Incident Handling Workflow](#3-incident-handling-workflow)
4. [Communication Templates](#4-communication-templates)
5. [Escalation Paths](#5-escalation-paths)
6. [Post-Incident Review](#6-post-incident-review)
7. [Scenario-Specific Runbooks](#7-scenario-specific-runbooks)

---

## 1. Incident Severity Classification

### P1 — CRITICAL (Patient Safety / Complete Outage)

| Attribute | Definition |
|-----------|------------|
| **Patient Impact** | Direct risk to patient safety; incorrect treatment data; data integrity compromise |
| **System Impact** | Complete platform unavailability; all clinical operations halted |
| **Response Time** | On-call engineer must acknowledge within **5 minutes** |
| **Target Resolution** | **1 hour** (RTO) |
| **Stakeholder Notification** | Immediate — within 10 minutes of declaration |

**Examples:**
- All API servers returning 5xx errors; clinicians cannot access patient protocols
- Database corruption or confirmed patient data integrity breach
- Security breach involving exposure of PHI/ePHI
- qEEG analysis pipeline producing clinically incorrect results
- Authentication system failure allowing unauthorized access to patient data
- Treatment protocol generation producing unsafe/harmful recommendations

### P2 — HIGH (Major Feature Degradation)

| Attribute | Definition |
|-----------|------------|
| **Patient Impact** | Indirect risk; significant workflow disruption for clinicians |
| **System Impact** | Major feature unavailable; partial platform degradation |
| **Response Time** | On-call engineer must acknowledge within **15 minutes** |
| **Target Resolution** | **4 hours** |
| **Stakeholder Notification** | Within 30 minutes |

**Examples:**
- qEEG analysis pipeline down (async jobs not processing)
- Payment/billing system failure
- Report generation failures affecting clinical documentation
- Wearable data ingestion stopped
- Search/indexing non-functional across clinical databases

### P3 — MEDIUM (Partial Degradation / Workaround Available)

| Attribute | Definition |
|-----------|------------|
| **Patient Impact** | Minimal direct patient impact; workaround exists |
| **System Impact** | Single feature or non-critical subsystem degraded |
| **Response Time** | On-call engineer must acknowledge within **30 minutes** |
| **Target Resolution** | **24 hours** (next business day if outside hours) |
| **Stakeholder Notification** | Next business day |

**Examples:**
- Telegram bot notification delays
- Non-critical analytics dashboard unavailable
- Evidence database returning stale data
- Slow API responses (P95 > 500ms but < 2000ms)
- Administrative features (user management, settings) degraded

### P4 — LOW (Cosmetic / Non-Functional)

| Attribute | Definition |
|-----------|------------|
| **Patient Impact** | None |
| **System Impact** | Cosmetic issues; internal tooling inconveniences |
| **Response Time** | Acknowledge within **4 hours** during business hours |
| **Target Resolution** | **72 hours** |
| **Stakeholder Notification** | Weekly operations summary |

**Examples:**
- Log formatting inconsistencies
- Documentation typos
- Non-critical monitoring gaps
- UI styling issues in admin panels
- Feature flag telemetry delays

---

## 2. Response Procedures by Severity

### P1 Response Procedure

```
[T+0 min]  ALERT RECEIVED (PagerDuty / OpsGenie / Slack)
[T+0-5]    ACKNOWLEDGE and ASSESS
[T+5-10]   DECLARE INCIDENT, NOTIFY STAKEHOLDERS, BEGIN CONTAINMENT
[T+10-30]  EXECUTE CONTAINMENT, ACTIVATE WAR ROOM if needed
[T+30-60]  RESOLVE or establish sustained MITIGATION
[T+60]     Post-incident review scheduled within 24 hours
```

**Step-by-Step:**

1. **Acknowledge the alert** in PagerDuty/OpsGenie within 5 minutes
2. **Assess scope** — check `/health` endpoint and check Fly.io status:
   ```bash
   fly status --app deepsynaps-studio
   curl -s https://deepsynaps-studio.fly.dev/health | jq .
   ```
3. **Declare the incident** — create a dedicated Slack channel `#inc-<YYYYMMDD>-<shortname>`
4. **Notify stakeholders** using P1 template (see Section 4)
5. **Begin containment** — follow the relevant scenario runbook (Section 7)
6. **If unresolved at T+30**, escalate to Engineering Lead + Clinical Safety Officer
7. **If unresolved at T+60**, activate the Incident Commander role; all-hands page

### P2 Response Procedure

1. Acknowledge within 15 minutes
2. Assess using health checks and logs:
   ```bash
   fly logs --app deepsynaps-studio --recent | tail -100
   curl -s https://deepsynaps-studio.fly.dev/health
   ```
3. Notify `#alerts` Slack channel with P2 template
4. Execute relevant scenario runbook
5. Escalate to team lead if no clear path to resolution within 1 hour
6. Schedule post-incident review within 48 hours

### P3 Response Procedure

1. Acknowledge within 30 minutes
2. Assess and log the issue in incident tracking
3. Notify `#alerts` Slack channel
4. Apply workaround if available
5. Schedule fix for next maintenance window or sprint
6. Document in weekly ops report

### P4 Response Procedure

1. Acknowledge during next business hours check
2. Create a ticket in backlog
3. Address during next sprint planning
4. Document resolution for weekly ops summary

---

## 3. Incident Handling Workflow

### 3.1 Detection

Sources of incident detection:

| Source | Tool | Alert Channel |
|--------|------|---------------|
| API Health Checks | Fly.io + Custom `/health` | PagerDuty (P1/P2) |
| Error Rate Spikes | Sentry + Custom dashboards | PagerDuty (P1/P2) |
| Log Anomalies | `fly logs` + structured logging | Slack #alerts |
| Latency Alerts | Custom P95/P99 metrics | PagerDuty (P1/P2) |
| Database Alerts | PostgreSQL monitoring / SQLite health | PagerDuty (P1/P2) |
| Worker Queue Depth | Celery monitoring | Slack #alerts |
| Customer Reports | Intercom / Slack / Email | Manual entry |
| Security Scans | Automated security tools | PagerDuty (P1) |

### 3.2 Assessment Checklist

Use this checklist to assess any incident:

- [ ] Check primary `/health` endpoint
- [ ] Check `/health` database component status
- [ ] Check Fly.io machine status: `fly status --app deepsynaps-studio`
- [ ] Review recent error logs: `fly logs --app deepsynaps-studio --recent | grep -i error`
- [ ] Check Sentry for error spikes
- [ ] Verify worker queue status (Celery): `celery -A app.jobs inspect active --workdir apps/api`
- [ ] Check if incident is environment-specific (dev/staging/prod)
- [ ] Determine if patient data integrity is at risk
- [ ] Determine scope: all users / specific clinic / specific feature
- [ ] Check for recent deployments (potential regression)
- [ ] Check external dependency status (Stripe, OpenAI, Anthropic, Redis)

### 3.3 Containment Decision Tree

```
                    INCIDENT DETECTED
                           |
              +------------+------------+
              |                         |
         DATA AT RISK?            DATA SAFE?
              |                         |
        +-----+-----+             +-----+-----+
        |           |             |           |
       YES         NO           YES          NO
        |           |             |           |
        v           v             v           v
   +----+----+  +---+----+  +---+----+  +---+----+
   | IMMED   |  | EVAL   |  | EVAL   |  | LOW    |
   | ISOLATE |  | SCOPE  |  | SCOPE  |  | PRI    |
   | + PAGE  |  | + RESP |  | + RESP |  | MONITOR|
   +----+----+  +---+----+  +---+----+  +---+----+
        |           |             |           |
        v           v             v           v
   1. STOP        ASSESS      ASSESS       LOG +
      INBOUND      SEVERITY    SEVERITY     BACKLOG
      TRAFFIC      (P1-P4)    (P1-P4)
   2. DISABLE
      AFFECTED
      ROUTERS
   3. PRESERVE
      ALL LOGS
```

### 3.4 Resolution and Recovery

For every incident, execute these steps in order:

1. **Root cause identified** — document in incident channel
2. **Fix implemented** — reference commit/PR for traceability
3. **Verification** — confirm health checks pass:
   ```bash
   curl -s https://deepsynaps-studio.fly.dev/health
   # Run full smoke test
   uv run python scripts/qeeg_deploy_smoke.py \
     --base-url https://deepsynaps-studio.fly.dev \
     --token "$CLINICIAN_BEARER_TOKEN" \
     --require-pdf
   ```
4. **Monitoring** — watch for 30 minutes post-resolution for recurrence
5. **Close incident** — update all channels, close incident channel after 24h

### 3.5 Post-Incident Actions

1. Schedule post-incident review within 24 hours (P1) or 48 hours (P2)
2. Complete the Post-Incident Review Template (Section 6)
3. File follow-up tickets for any remediation work
4. Update runbooks if procedures were insufficient
5. Communicate findings to stakeholders

---

## 4. Communication Templates

### 4.1 P1 Incident — Slack Announcement

```
:rotating_light: **P1 INCIDENT DECLARED** :rotating_light:

**Incident:** [short description]
**Channel:** #inc-[YYYYMMDD]-[shortname]
**Severity:** P1 — CRITICAL
**Detected:** [timestamp UTC]
**Impact:** [what's broken and who is affected]
**Patient Safety Risk:** [yes/no — explain if yes]

**Current Status:** INVESTIGATING

**On-Call Engineer:** @oncall-engineer
**Incident Commander:** [if activated]

We will update this channel every 10 minutes until resolved.
```

### 4.2 P2 Incident — Slack Announcement

```
:warning: **P2 Incident** :warning:

**Incident:** [short description]
**Severity:** P2 — HIGH
**Detected:** [timestamp UTC]
**Impact:** [affected feature(s) and user groups]

**Current Status:** INVESTIGATING
**On-Call Engineer:** @oncall-engineer

Next update in 30 minutes or upon significant change.
```

### 4.3 Status Update Template

```
**Update #[N]** — [timestamp UTC]

**Status:** [INVESTIGATING / CONTAINED / MITIGATED / RESOLVED]
**Summary:** [what we've learned / what's been done]
**Next Steps:** [what we're doing next]
**ETA:** [estimated time to resolution or "no ETA yet"]
```

### 4.4 Resolution Template

```
:green_check_mark: **RESOLVED** — [Incident Name]

**Resolution Time:** [duration from detection to resolution]
**Root Cause (Preliminary):** [brief description]
**Action Taken:** [what fixed it]

**Post-Incident Review:** Scheduled for [date/time]
**Incident Channel:** #inc-[YYYYMMDD]-[shortname] (archiving in 24h)

Full writeup will be posted within 24 hours.
```

### 4.5 PagerDuty Page Content

```
[P1] DeepSynaps Protocol Studio — [brief description]
Impact: [clinical/patient impact]
Check: fly status --app deepsynaps-studio
Runbook: docs/runbooks/incident-response.md Section 7
```

### 4.6 Clinical Safety Officer Notification (Email)

**To:** clinical-safety@deepsynaps.com  
**Subject:** [P1/P2] Clinical Safety Notification — [Incident Brief]

```
Clinical Safety Team,

A [P1/P2] incident has been declared that may impact clinical operations:

**Incident:** [description]
**Patient Impact:** [specific clinical workflows affected]
**Data Integrity Risk:** [yes/no — assessment]
**Mitigation in Place:** [what's being done to protect patients]
**Status Page:** [link to incident channel or status page]

We will notify you immediately upon resolution or if patient safety risk escalates.

**Incident Commander:** [name]
**Contact:** [phone]
```

---

## 5. Escalation Paths

### 5.1 Escalation Matrix

| Time | Action | Notify |
|------|--------|--------|
| T+0 | On-call engineer alerted | — |
| T+5 | If unacknowledged | Escalate to secondary on-call |
| T+10 (P1) | If unacknowledged | Page all platform engineers |
| T+15 (P1) | If still unacknowledged | Page Engineering Lead + CTO |
| T+30 (P1) | If unresolved | Activate Incident Commander |
| T+60 (P1) | If unresolved | All-hands page; notify executive team |
| T+60 (P2) | If unresolved | Escalate to team lead |
| T+4h (P2) | If unresolved | Escalate to Engineering Lead |

### 5.2 Contact Roles

| Role | Responsibility | Escalation Order |
|------|----------------|------------------|
| On-Call Engineer | First responder, triage, initial containment | 1 |
| Secondary On-Call | Backup if primary unavailable | 2 |
| SRE Lead | Infrastructure decisions, scaling, complex ops | 3 |
| Engineering Lead | Architecture decisions, code changes | 4 |
| Clinical Safety Officer | Patient safety assessment, clinical impact | 4 (parallel for P1) |
| Product Lead | Customer communication, feature prioritization | 5 |
| CTO | Executive decisions, vendor escalation | 6 |
| External Vendor | Stripe, OpenAI, Anthropic, Fly.io | As needed |

### 5.3 Vendor Escalation Contacts

| Vendor | Support Channel | Escalation Path |
|--------|----------------|-----------------|
| Fly.io | fly.io/support + `#fly-community` Slack | Priority support with paid plan |
| Stripe | stripe.com/support | Dashboard → Support → Phone |
| Sentry | sentry.io/support | In-app chat + email |
| OpenAI | Platform status page | Support ticket |
| Anthropic | Console support | Support ticket |
| Redis (Upstash) | Dashboard + email | Paid support plan |

---

## 6. Post-Incident Review

### 6.1 Review Template

```markdown
# Post-Incident Review: [Incident Title]
**Date:** [YYYY-MM-DD]
**Incident ID:** [tracking number]
**Severity:** [P1/P2/P3/P4]
**Duration:** [HH:MM from detection to resolution]
**Reporter:** [name]
**Participants:** [names and roles]

## Timeline (UTC)
| Time | Event |
|------|-------|
| HH:MM | Alert fired |
| HH:MM | On-call acknowledged |
| HH:MM | [event] |
| HH:MM | [event] |
| HH:MM | Resolved |

## Impact Summary
- **Users Affected:** [count or "all"]
- **Clinical Workflows Disrupted:** [list]
- **Patient Data at Risk:** [yes/no — details]
- **Financial Impact:** [if applicable]

## Root Cause
[Detailed technical description]

## What Went Well
- [item]
- [item]

## What Went Wrong
- [item]
- [item]

## Action Items
| ID | Action | Owner | Due Date | Priority |
|----|--------|-------|----------|----------|
| 1  | [action] | [owner] | [date] | [P] |

## Runbook Updates Needed
- [list any runbook sections to update]
```

### 6.2 Review Schedule

| Severity | Review Timing | Attendees Required |
|----------|---------------|-------------------|
| P1 | Within 24 hours | On-call, SRE Lead, Engineering Lead, Clinical Safety Officer |
| P2 | Within 48 hours | On-call, SRE Lead, relevant team lead |
| P3 | Weekly ops review | On-call, team lead |
| P4 | Monthly ops review | Team lead |

---

## 7. Scenario-Specific Runbooks

### 7.1 Database Outage (PostgreSQL)

**Symptoms:** `/health` endpoint returns DB error; all database-dependent routes return 5xx.

**Impact:** P1 — All clinical operations depend on the database.

**Immediate Steps:**

1. **Verify the scope:**
   ```bash
   curl -s https://deepsynaps-studio.fly.dev/health
   fly status --app deepsynaps-studio
   ```

2. **Check Fly.io PostgreSQL status:**
   ```bash
   fly status --app <postgres-app-name>
   fly logs --app <postgres-app-name> --recent
   ```

3. **Check for connection pool exhaustion:**
   ```bash
   # If you have direct DB access
   psql $DEEPSYNAPS_DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
   psql $DEEPSYNAPS_DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'idle';"
   ```

4. **If connection pool exhausted:**
   - Restart the application machines to reset connections:
     ```bash
     fly machine list --app deepsynaps-studio
     fly machine restart <machine-id> --app deepsynaps-studio
     ```
   - Consider scaling DB connection pool in settings temporarily

5. **If PostgreSQL instance is down:**
   - Check Fly.io status page for regional outages
   - If regional issue, consider failover to standby (if configured)
   - If single instance, follow Fly.io recovery procedures:
     ```bash
     fly pg restart --app <postgres-app-name>
     ```

6. **Verify recovery:**
   ```bash
   curl -s https://deepsynaps-studio.fly.dev/health | jq .database.status
   ```

**Rollback/Recovery:**
- Database recovery from backup: See `docs/runbooks/oncall-playbook.md` Section "Database Recovery"
- Point-in-time recovery via Fly.io PostgreSQL automated backups

**Prevention:**
- Enable PostgreSQL HA (high availability) with Fly.io
- Configure connection pooling (PgBouncer)
- Set up read replicas for analytics/reporting queries
- Monitor connection count and set alerts at 80% capacity

---

### 7.2 API Degradation / High Latency

**Symptoms:** P95 latency > 200ms; elevated 5xx error rates; Fly.io health checks flapping.

**Impact:** P2 (if partial) to P1 (if widespread).

**Immediate Steps:**

1. **Confirm degradation:**
   ```bash
   curl -w "\n%{time_total}s\n" -s -o /dev/null https://deepsynaps-studio.fly.dev/health
   fly status --app deepsynaps-studio
   ```

2. **Check resource utilization:**
   ```bash
   fly metrics --app deepsynaps-studio
   # Check for CPU throttling, memory pressure
   ```

3. **Check recent deployments (potential regression):**
   ```bash
   fly releases list --app deepsynaps-studio
   # If a recent deploy correlates with the issue:
   # Rollback immediately:
   fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile --image <previous-image>
   ```

4. **Scale up if resource-constrained:**
   ```bash
   # Temporarily scale to more machines
   fly machine list --app deepsynaps-studio
   fly scale count 2 --app deepsynaps-studio
   ```

5. **If Celery worker queue is backing up:**
   ```bash
   # Check queue depth
   celery -A app.jobs inspect active --workdir apps/api
   celery -A app.jobs inspect scheduled --workdir apps/api
   # If queue is backed up, scale workers:
   fly scale count qeeg_worker=2 --app deepsynaps-studio
   ```

6. **If specific endpoint is slow (check logs):**
   ```bash
   fly logs --app deepsynaps-studio | grep -i "slow\|timeout\|error"
   ```

**Verification:**
```bash
# Run health check
for i in {1..5}; do
  curl -w "%{http_code} %{time_total}s\n" -s -o /dev/null https://deepsynaps-studio.fly.dev/health
done
# Run smoke test
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf
```

---

### 7.3 Security Breach

**Symptoms:** Unauthorized access detected; unusual API patterns; Sentry security alerts; PHI exposure suspected.

**Impact:** P1 — Always treat as patient safety and compliance critical.

**Immediate Steps:**

1. **DO NOT PANIC. DO NOT DELETE LOGS.**

2. **Alert the Clinical Safety Officer immediately** — this is a compliance event.

3. **Preserve evidence:**
   ```bash
   # Save current logs immediately
   fly logs --app deepsynaps-studio > /tmp/incident-$(date +%Y%m%d-%H%M%S)-logs.txt
   # Do NOT restart services yet — this destroys forensic evidence
   ```

4. **Isolate affected systems (if possible without destroying evidence):**
   - If a specific machine is compromised:
     ```bash
     fly machine stop <machine-id> --app deepsynaps-studio
     ```
   - If API keys are compromised, rotate immediately:
     ```bash
     # JWT secret rotation
     fly secrets set JWT_SECRET_KEY=$(openssl rand -hex 32) --app deepsynaps-studio
     # Fernet key rotation (note: this will invalidate existing 2FA secrets)
     fly secrets set DEEPSYNAPS_SECRETS_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())") --app deepsynaps-studio
     ```

5. **Disable affected features via feature flags or router-level blocks**

6. **Assess scope of data exposure:**
   - Review access logs for affected time window
   - Determine which patients/clinics may be affected
   - Document all findings for compliance reporting

7. **Notify required parties (HIPAA breach notification requirements):**
   - Clinical Safety Officer (immediate)
   - Legal/Compliance team (within 1 hour)
   - Affected patients (within 60 days if confirmed breach)
   - HHS (within 60 days if >500 individuals affected, within 60 days annually otherwise)

**Post-Containment:**
- Full forensic analysis of all logs
- Credential rotation for all services
- Security review of all access patterns
- Update security policies and procedures

---

### 7.4 Data Integrity Issue

**Symptoms:** Inconsistent patient data; reports showing incorrect values; database constraint violations; checksum mismatches.

**Impact:** P1 — Patient data integrity is the highest priority.

**Immediate Steps:**

1. **STOP ALL WRITE OPERATIONS** to affected data immediately.

2. **Identify scope:**
   ```bash
   # Check which tables/routes are affected
   fly logs --app deepsynaps-studio | grep -i "integrity\|constraint\|checksum"
   # Check database consistency (if SQLite):
   fly ssh console --app deepsynaps-studio -C "sqlite3 /data/deepsynaps_protocol_studio.db 'PRAGMA integrity_check;'"
   ```

3. **Quarantine affected data** — mark records as under review:
   ```sql
   -- Example: flag affected records
   UPDATE affected_table SET data_status = 'UNDER_REVIEW' WHERE <condition>;
   ```

4. **If SQLite corruption detected:**
   ```bash
   # From a machine with the volume mounted:
   sqlite3 /data/deepsynaps_protocol_studio.db ".dump" > /tmp/db-dump-$(date +%Y%m%d).sql
   # Attempt recovery
   sqlite3 /data/recovered.db < /tmp/db-dump-$(date +%Y%m%d).sql
   # Verify recovered database
   sqlite3 /data/recovered.db 'PRAGMA integrity_check;'
   ```

5. **Restore from backup if corruption is unrecoverable:**
   ```bash
   # List available backups
   ls -la /data/backups/
   # Stop the app
   fly machine stop <machine-id> --app deepsynaps-studio
   # Restore from latest verified backup
   cp /data/backups/deepsynaps_protocol_studio_latest.db /data/deepsynaps_protocol_studio.db
   # Restart
   fly machine start <machine-id> --app deepsynaps-studio
   ```

6. **Verify data consistency post-recovery:**
   ```bash
   # Run the validation script
   uv run python scripts/validate_production_readiness.py
   # Check runtime snapshot
   uv run python scripts/write_runtime_snapshot.py
   ```

7. **Clinical Safety Review:**
   - All affected patient records must be clinically reviewed
   - Generate a report of all affected patients for the Clinical Safety Officer
   - Do NOT clear the `UNDER_REVIEW` flag without clinical sign-off

**Verification:**
```bash
# Run full smoke test
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf
# Check health
 curl -s https://deepsynaps-studio.fly.dev/health | jq .
```

---

## Quick Reference Card

```
INCIDENT RESPONSE — ONE-PAGER

DETECT  → ACK (5/15/30/240 min by severity)
        → ASSESS: curl /health + fly status + fly logs
        → DECLARE: Create #inc-YYYYMMMDD-name channel
        → NOTIFY: Use severity template
        → CONTAIN: Follow scenario runbook
        → RESOLVE: Verify with smoke tests
        → REVIEW: Schedule post-incident within 24-48h

CRITICAL CONTACTS:
  On-Call:     [PagerDuty rotation]
  SRE Lead:    [contact]
  Eng Lead:    [contact]
  Clinical SO: [contact]

KEY COMMANDS:
  fly status --app deepsynaps-studio
  fly logs --app deepsynaps-studio --recent
  curl -s https://deepsynaps-studio.fly.dev/health
  celery -A app.jobs inspect active --workdir apps/api
  fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

---

## Cross-References

- [On-Call Playbook](./oncall-playbook.md) — Day-to-day operational procedures
- [Capacity Planning Guide](./capacity-planning.md) — Scaling decisions during incidents
- [Performance Tuning Guide](./performance-tuning.md) — Latency and performance issues
- [Release Process](../operations/release-process.md) — Rollback procedures
- [Change Management](../operations/change-management.md) — Emergency change procedures
