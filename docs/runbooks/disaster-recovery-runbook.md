# Disaster Recovery Runbook

## DeepSynaps Protocol Studio — Clinical Neuromodulation Platform

**Document ID:** RUN-002  
**Version:** 2.0.0  
**Classification:** Critical Operational — HIPAA-Ready  
**Owner:** Infrastructure Engineering  
**Review Cycle:** Quarterly  
**Last Updated:** 2025-01-15

---

> ⚠️ **CRITICAL NOTICE**
> This document contains procedures to be followed during infrastructure emergencies.
> Print and store copies in multiple locations. Do NOT rely solely on electronic access during an outage.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Recovery Objectives](#2-recovery-objectives)
3. [Disaster Classification](#3-disaster-classification)
4. [Roles and Responsibilities](#4-roles-and-responsibilities)
5. [Detection Procedures](#5-detection-procedures)
6. [Recovery Procedures](#6-recovery-procedures)
7. [Failover Procedures](#7-failover-procedures)
8. [Post-Recovery Verification](#8-post-recovery-verification)
9. [Rollback Procedures](#9-rollback-procedures)
10. [Communication Plan](#10-communication-plan)
11. [Compliance Considerations](#11-compliance-considerations)
12. [Appendices](#12-appendices)

---

## 1. Overview

This runbook defines the disaster recovery procedures for the DeepSynaps Protocol Studio, a clinical neuromodulation platform deployed on Fly.io. It covers database failures, regional outages, data corruption, and complete infrastructure failure.

### Platform Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        Fly.io (Primary: LHR)                     │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │   App Machine   │  │   Workers    │  │   Stripe Worker     │ │
│  │   (performance- │  │   (shared-   │  │   (shared-cpu-1x)   │ │
│  │    cpu-4x, 8GB) │  │    cpu-1x)   │  │                     │ │
│  └────────┬────────┘  └──────┬───────┘  └──────────┬──────────┘ │
│           │                  │                     │            │
│           └──────────────────┼─────────────────────┘            │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              PostgreSQL Cluster (LHR)                     │  │
│  │         Primary + Read Replicas (prod)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│           ┌──────────────────┼──────────────────┐               │
│           ▼                  ▼                  ▼               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │   Redis      │  │  Persistent  │  │   S3 Backups     │     │
│  │   (Celery)   │  │   Volume     │  │   (encrypted)    │     │
│  └──────────────┘  └──────────────┘  └──────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (auto-failover)
┌─────────────────────────────────────────────────────────────────┐
│                   Fly.io (Standby: IAD)                          │
│  ┌─────────────────┐  ┌──────────────────────────────────────┐ │
│  │   App Machine   │  │         PostgreSQL Replica            │ │
│  │   (standby)     │  │         (read-only, promoted)        │ │
│  └─────────────────┘  └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Key Infrastructure Components

| Component | Primary Region | Standby Region | Failover |
|-----------|---------------|----------------|----------|
| Application | `lhr` | `iad` | Automatic (auto_start) |
| PostgreSQL | `lhr` | `iad` | Manual promotion |
| Persistent Volume | `lhr` | N/A | Restore from backup |
| Redis | `lhr` | N/A | Re-create or use Upstash |
| Backups | S3 | Cross-region replication | Always available |

---

## 2. Recovery Objectives

### Official Targets

| Metric | Target | Measured As |
|--------|--------|-------------|
| **RTO** | < 1 hour | Time from detection to full service restoration |
| **RPO** | < 15 minutes | Maximum data loss (last backup interval) |
| **MTTD** | < 5 minutes | Mean time to detect disaster |
| **MTTR** | < 55 minutes | Mean time to recover after detection |

### Recovery Timeline

```
T+0:00    Disaster occurs
T+0:05    Automated detection triggers (health checks)
T+0:10    PagerDuty alert sent to on-call engineer
T+0:15    Engineer acknowledges, begins assessment
T+0:20    Recovery procedure initiated
T+0:30    Backup restoration begins
T+0:50    Database restored and verified
T+0:55    Application restarted and health checks pass
T+1:00    Service fully restored (RTO target)
```

---

## 3. Disaster Classification

### Disaster Types

| Type | Code | Severity | Description | Typical Cause |
|------|------|----------|-------------|---------------|
| **Database Failure** | `DB_FAILURE` | Critical | PostgreSQL/SQLite unreachable | Hardware failure, OOM, disk full |
| **Region Outage** | `REGION_OUTAGE` | Critical | Primary Fly.io region down | Datacenter outage, network partition |
| **Data Corruption** | `DATA_CORRUPTION` | Critical | Data integrity compromised | Bugs, storage corruption, failed migration |
| **Complete Failure** | `COMPLETE_FAILURE` | Catastrophic | Multiple services down | Cascading failure, attack |
| **Network Partition** | `NETWORK_PARTITION` | High | Services can't communicate | DNS issues, routing problems |

### Severity Matrix

| | Single Component | Multiple Components | All Components |
|---|:---:|:---:|:---:|
| **Data Intact** | P1 | P0 | P0 |
| **Data At Risk** | P0 | P0 | P0 |
| **Data Corrupted** | P0 | P0 | P0 |

---

## 4. Roles and Responsibilities

### Incident Response Team

| Role | Responsibility | Primary | Backup |
|------|---------------|---------|--------|
| **Incident Commander** | Coordinates response, makes decisions | On-call engineer | Infra lead |
| **Technical Lead** | Executes technical recovery | On-call engineer | Senior engineer |
| **Communications** | Internal/external communication | Engineering manager | CTO |
| **Compliance Officer** | HIPAA/audit compliance assessment | Security lead | Legal |

### Communication Channels

| Channel | Purpose |
|---------|---------|
| `#incidents` (Slack) | Primary incident coordination |
| PagerDuty | Alerting and escalation |
| `status.deepsynaps.app` | Public status page |
| `security@deepsynaps.com` | Compliance/breach notifications |

---

## 5. Detection Procedures

### 5.1 Automated Detection

The `disaster-recovery.sh --detect` script runs every 2 minutes via Fly.io checks and performs:

1. **Database connectivity check** — `SELECT 1` query
2. **Application health check** — `GET /health` HTTP check
3. **Region availability check** — Fly.io API status
4. **Data integrity check** — `PRAGMA integrity_check` (SQLite) or schema verification (PostgreSQL)

### 5.2 Manual Detection

Signs of disaster that may not be auto-detected:

- Elevated error rates in Sentry
- Unusual latency spikes
- Customer-reported issues
- Failed backup notifications
- Fly.io status page alerts

### 5.3 Confirming a Disaster

```bash
# 1. Run detection manually
./disaster-recovery.sh --detect

# 2. Check application health
curl -s https://deepsynaps-studio.fly.dev/health

# 3. Check database connectivity
psql "$DEEPSYNAPS_DATABASE_URL" -c "SELECT 1;"

# 4. Check Fly.io status
fly status --app deepsynaps-studio

# 5. Check logs
fly logs --app deepsynaps-studio --recent
```

### 5.4 Classification Decision Tree

```
Is the application returning errors?
├── YES → Is the database reachable?
│   ├── YES → Is the data intact?
│   │   ├── YES → NETWORK_PARTITION or application bug
│   │   └── NO  → DATA_CORRUPTION
│   └── NO  → Is the region available?
│       ├── YES → DATABASE_FAILURE
│       └── NO  → REGION_OUTAGE
└── NO  → Is automated detection false positive?
    └── YES → Log and monitor
```

---

## 6. Recovery Procedures

### 6.1 DATABASE_FAILURE Recovery

**Symptoms:** Database connection errors, application 500 errors, pg_dump fails.

**Procedure:**

```bash
# Step 1: Confirm the disaster type
./disaster-recovery.sh --detect
# Expected output: DATABASE_FAILURE

# Step 2: Begin automated recovery
./disaster-recovery.sh --type DATABASE_FAILURE --dry-run    # Preview
./disaster-recovery.sh --type DATABASE_FAILURE               # Execute
```

**Manual Steps (if automation fails):**

```bash
# 1. Check PostgreSQL status
fly status --app deepsynaps-studio-db

# 2. Check PostgreSQL logs
fly logs --app deepsynaps-studio-db --recent

# 3. If PostgreSQL is crashed, restart
fly machines list --app deepsynaps-studio-db
fly machines restart <MACHINE_ID> --app deepsynaps-studio-db

# 4. If restart fails, restore from backup
./restore-database.sh --latest --auto

# 5. Verify database
psql "$DEEPSYNAPS_DATABASE_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"

# 6. Restart application
fly deploy --app deepsynaps-studio

# 7. Verify application health
curl -s https://deepsynaps-studio.fly.dev/health
```

**Expected Duration:** 20-45 minutes

---

### 6.2 REGION_OUTAGE Recovery

**Symptoms:** Fly.io status page shows LHR issues, application unreachable from primary region.

**Procedure:**

```bash
# Step 1: Confirm region outage
./disaster-recovery.sh --detect
# Expected output: REGION_OUTAGE

# Step 2: Trigger failover to IAD (standby region)
./disaster-recovery.sh --failover-region --dry-run    # Preview
./disaster-recovery.sh --failover-region               # Execute
```

**Manual Steps:**

```bash
# 1. Verify LHR is down (check Fly.io status page)
open https://status.flyio.net

# 2. Verify IAD machines exist
fly machines list --app deepsynaps-studio | grep iad

# 3. Scale up IAD machines
fly machines update <IAD_MACHINE_ID> --app deepsynaps-studio --metadata fly_standby=false

# 4. If needed, restore database to IAD
# (PostgreSQL replica in IAD should be auto-promoted)
fly status --app deepsynaps-studio-db

# 5. Update DNS if using custom domain
# (Fly.io handles .fly.dev routing automatically)

# 6. Verify from IAD
curl -s --connect-to "deepsynaps-studio.fly.dev:443:iad.$FLY_APP_NAME.internal:443" \
    https://deepsynaps-studio.fly.dev/health
```

**Expected Duration:** 10-20 minutes

---

### 6.3 DATA_CORRUPTION Recovery

**Symptoms:** Integrity check failures, incorrect data in API responses, constraint violations.

**Procedure:**

```bash
# Step 1: Confirm corruption
./disaster-recovery.sh --detect
# Expected output: DATA_CORRUPTION

# Step 2: Quarantine corrupted data and restore
./disaster-recovery.sh --type DATA_CORRUPTION --dry-run
./disaster-recovery.sh --type DATA_CORRUPTION
```

**Manual Steps:**

```bash
# 1. STOP ALL WRITES immediately
# (Application will start returning 503 for write operations)

# 2. Quarantine current database (rename)
psql "$DEEPSYNAPS_DATABASE_URL" -c "
    ALTER DATABASE deepsynaps_production RENAME TO deepsynaps_quarantine_$(date +%Y%m%d_%H%M%S);
"

# 3. Find last known-good backup
./restore-database.sh --list | head -20

# 4. Restore from before corruption occurred
# (May need to go back several hours depending on when corruption started)
./restore-database.sh --backup <KNOWN_GOOD_BACKUP_KEY> --auto

# 5. Verify data integrity
psql "$DEEPSYNAPS_DATABASE_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
./backup-verify.sh

# 6. If possible, merge non-corrupted recent data
# (This is advanced — consult database team)

# 7. Resume application
fly deploy --app deepsynaps-studio
```

**⚠️ CRITICAL:** Data corruption may require investigation into root cause. Preserve the quarantined database for forensic analysis.

**Expected Duration:** 30-60 minutes

---

### 6.4 COMPLETE_FAILURE Recovery

**Symptoms:** All services down, no response from any endpoint, Fly.io status shows major incident.

**Procedure:**

```bash
# This combines region failover + database restore
./disaster-recovery.sh --type COMPLETE_FAILURE --dry-run
./disaster-recovery.sh --type COMPLETE_FAILURE
```

**Manual Steps (comprehensive):**

```bash
# 1. Acknowledge the incident in PagerDuty

# 2. Switch to standby region
./disaster-recovery.sh --failover-region

# 3. Restore database
./restore-database.sh --latest --auto

# 4. Verify all components
curl -s https://deepsynaps-studio.fly.dev/health
psql "$DEEPSYNAPS_DATABASE_URL" -c "SELECT 1;"

# 5. If Fly.io is completely down, consider:
#    a. Deploy to alternate cloud (emergency procedure)
#    b. Use local development environment as temporary
#    c. Communicate outage to customers

# 6. Document everything for post-mortem
```

**Expected Duration:** 45-60 minutes

---

### 6.5 NETWORK_PARTITION Recovery

**Symptoms:** Intermittent errors, services can't communicate, DNS resolution failures.

**Procedure:**

```bash
# Usually self-healing — restart services
./disaster-recovery.sh --type NETWORK_PARTITION
```

If automation fails, it escalates to COMPLETE_FAILURE recovery.

---

## 7. Failover Procedures

### 7.1 Automatic Failover (Application)

Fly.io provides automatic failover for applications:

- `auto_start_machines = true` — machines start on incoming requests
- `auto_stop_machines = false` in production — machines stay running
- If LHR is unhealthy, traffic routes to IAD (if machines exist there)

### 7.2 Manual Failover (Database)

PostgreSQL failover requires manual promotion:

```bash
# 1. List database machines
fly machines list --app deepsynaps-studio-db

# 2. If primary (LHR) is down, promote replica (IAD)
fly machines exec <IAD_DB_MACHINE_ID> \
    --app deepsynaps-studio-db \
    -- 'pg_ctl promote -D /data/postgresql'

# 3. Update connection string
fly secrets set DEEPSYNAPS_DATABASE_URL="postgresql://...iad..." \
    --app deepsynaps-studio

# 4. Restart application to pick up new connection string
fly deploy --app deepsynaps-studio
```

### 7.3 DNS Failover

For custom domains, update DNS:

```bash
# If using Cloudflare or similar, update A record
# Primary: LHR IP
# Standby: IAD IP

# Emergency: Point to IAD
curl -X PUT "https://api.cloudflare.com/client/v4/zones/<ZONE>/dns_records/<RECORD>" \
    -H "Authorization: Bearer <TOKEN>" \
    -H "Content-Type: application/json" \
    --data '{"type":"A","name":"api.deepsynaps.app","content":"<IAD_IP>"}'
```

---

## 8. Post-Recovery Verification

### 8.1 Automated Verification

The disaster recovery script automatically runs post-recovery verification:

1. Database connectivity (6 retries with 30s delay)
2. Application health endpoint (HTTP 200)
3. Basic query execution
4. Table count validation

### 8.2 Manual Verification Checklist

- [ ] Application health endpoint returns 200
- [ ] API key endpoints respond
- [ ] Database has expected table count
- [ ] No critical errors in application logs
- [ ] Workers are processing jobs
- [ ] Stripe webhooks are being retried
- [ ] Backup verification script passes
- [ ] No elevated error rate in Sentry
- [ ] Status page is updated

### 8.3 Verification Commands

```bash
# Application health
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# Database connectivity and table count
psql "$DEEPSYNAPS_DATABASE_URL" -c "
    SELECT 'tables', count(*) FROM information_schema.tables WHERE table_schema = 'public'
    UNION ALL
    SELECT 'extensions', count(*) FROM pg_extension
    UNION ALL
    SELECT 'size', pg_size_pretty(pg_database_size(current_database()));
"

# Worker status
fly machines list --app deepsynaps-studio

# Logs (no errors)
fly logs --app deepsynaps-studio --recent | grep -i error

# Sentry error rate
curl -s "https://sentry.io/api/0/projects/deepsynaps/studio/stats/?stat=received" \
    -H "Authorization: Bearer $SENTRY_TOKEN" | jq '.[] | select(.[0] > now - 300)'
```

---

## 9. Rollback Procedures

If recovery causes issues, rollback to the previous state:

```bash
# Rollback last recovery (restores previous routing)
./disaster-recovery.sh --rollback
```

**Manual Rollback:**

```bash
# 1. Read previous state
cat logs/dr-state.json

# 2. If database restore was wrong, restore older backup
./restore-database.sh --list
./restore-database.sh --backup <OLDER_BACKUP> --auto

# 3. If region failover was wrong, switch back
# Update routing to primary region
fly machines update <LHR_MACHINE> --app deepsynaps-studio --metadata fly_standby=false
fly machines update <IAD_MACHINE> --app deepsynaps-studio --metadata fly_standby=true

# 4. If all else fails, restore from earlier Terraform state
terraform state list
terraform apply -var-file=environments/production.tfvars
```

---

## 10. Communication Plan

### During Incident

| Time | Action | Owner |
|------|--------|-------|
| T+5 min | Acknowledge alert | On-call engineer |
| T+10 min | Post in #incidents with initial assessment | On-call engineer |
| T+15 min | Update status page to "Investigating" | Engineering manager |
| T+30 min | Send customer notification if user-facing | Customer success |
| T+60 min | Post-mortem scheduled | Incident commander |

### Communication Templates

**Internal (Slack #incidents):**
```
🚨 INCIDENT: DeepSynaps Protocol Studio
Type: [DATABASE_FAILURE|REGION_OUTAGE|DATA_CORRUPTION]
Severity: [P0|P1]
Start: [ISO timestamp]
Impact: [description]
Action: [what we're doing]
ETA: [estimated resolution]
IC: [name]
```

**External (Status Page):**
```
We are investigating connectivity issues with the DeepSynaps API.
Our engineering team has been notified and is working on resolution.
We will provide updates every 30 minutes.
```

---

## 11. Compliance Considerations

### HIPAA Requirements During DR

| Requirement | How We Comply |
|-------------|---------------|
| **Data Integrity** | Encrypted backups with HMAC verification |
| **Audit Trail** | All DR actions logged to immutable audit log |
| **Access Control** | Only authorized engineers can execute DR |
| **Breach Notification** | Automatic alerts if PHI may be compromised |
| **Documentation** | This runbook + automated audit records |

### Post-Incident Requirements

1. **Immediate:** Document all actions taken
2. **Within 24h:** File incident report
3. **Within 72h:** HIPAA risk assessment (if PHI potentially affected)
4. **Within 1 week:** Post-mortem meeting
5. **Within 2 weeks:** Implement preventive measures

---

## 12. Appendices

### Appendix A: Emergency Contacts

| Role | Name | Phone | Slack |
|------|------|-------|-------|
| On-Call | PagerDuty | — | #incidents |
| Infra Lead | [Name] | [Phone] | @infralead |
| Eng Manager | [Name] | [Phone] | @engmgr |
| Security | [Name] | [Phone] | @security |
| CTO | [Name] | [Phone] | @cto |

### Appendix B: Critical Commands Quick Reference

```bash
# DETECT
./disaster-recovery.sh --detect

# RECOVER
./disaster-recovery.sh --type DATABASE_FAILURE
./disaster-recovery.sh --type REGION_OUTAGE
./disaster-recovery.sh --type DATA_CORRUPTION
./disaster-recovery.sh --type COMPLETE_FAILURE

# FAILOVER
./disaster-recovery.sh --failover-region

# STATUS
./disaster-recovery.sh --status
fly status --app deepsynaps-studio

# ROLLBACK
./disaster-recovery.sh --rollback

# VERIFY
curl -s https://deepsynaps-studio.fly.dev/health
./backup-verify.sh
```

### Appendix C: Decision Matrix

| Scenario | First Action | Second Action | Escalate If |
|----------|-------------|---------------|-------------|
| DB connection errors | `./disaster-recovery.sh --type DATABASE_FAILURE` | Manual pg_restore | RTO > 30min |
| Fly.io LHR down | `./disaster-recovery.sh --failover-region` | Restore DB in IAD | Both regions down |
| Data integrity errors | `./disaster-recovery.sh --type DATA_CORRUPTION` | Quarantine + restore older | Corruption after restore |
| Total outage | `./disaster-recovery.sh --type COMPLETE_FAILURE` | Emergency alternate deploy | RTO > 45min |
| False positive | Monitor, document | — | Recurs > 3 times |

### Appendix D: Related Documents

| Document | ID | Location |
|----------|-----|----------|
| Backup and Restore Runbook | RUN-001 | `docs/runbooks/backup-restore-runbook.md` |
| Database Maintenance Runbook | RUN-003 | `docs/runbooks/database-maintenance-runbook.md` |
| Infrastructure Architecture | ARC-001 | `docs/architecture/infrastructure.md` |
| HIPAA Compliance Guide | COM-001 | `docs/compliance/hipaa.md` |

### Appendix E: Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0.0 | 2025-01-15 | Infra Team | Production-ready DR automation |
| 1.1.0 | 2024-11-01 | Infra Team | Added region failover procedures |
| 1.0.0 | 2024-09-15 | Infra Team | Initial DR runbook |

---

**END OF DOCUMENT**

*In case of emergency: start with `./disaster-recovery.sh --detect`, then follow the automated guidance.*
