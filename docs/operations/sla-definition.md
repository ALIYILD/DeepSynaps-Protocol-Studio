# Service Level Agreements — DeepSynaps Protocol Studio

> **Classification:** Operational Contract  
> **Owner:** SRE Lead + Product Lead + Clinical Safety Officer  
> **Review Cycle:** Quarterly  
> **Effective Date:** 2026-05-14  
> **Applies To:** Production Environment (`deepsynaps-studio.fly.dev`)

---

## Table of Contents

1. [Service Level Objectives (SLOs)](#1-service-level-objectives-slos)
2. [Service Level Indicators (SLIs)](#2-service-level-indicators-slis)
3. [Recovery Objectives](#3-recovery-objectives)
4. [Escalation Response Times](#4-escalation-response-times)
5. [Error Budget](#5-error-budget)
6. [Measurement and Reporting](#6-measurement-and-reporting)
7. [SLA Violation Process](#7-sla-violation-process)

---

## 1. Service Level Objectives (SLOs)

### 1.1 API Availability

| Metric | Target (SLO) | SLA (Customer-Facing) | Measurement Window |
|--------|-------------|----------------------|-------------------|
| **API Uptime** | 99.95% | **99.9%** | Rolling 30 days |
| **Allowed Downtime** | ~21.6 min/month | ~43.2 min/month | — |

**Scope:** All API endpoints returning 2xx/3xx/4xx (5xx counts as downtime unless caused by client error).  
**Exclusions:** Scheduled maintenance (with 24h notice), planned database migrations, third-party service failures (Stripe, OpenAI, etc.)  
**Measurement:** Fly.io health checks + synthetic monitoring every 60 seconds.

### 1.2 API Latency

| Metric | Target (SLO) | SLA (Customer-Facing) | Measurement |
|--------|-------------|----------------------|-------------|
| **P50 Latency** | <50 ms | <100 ms | Per endpoint, rolling 24h |
| **P95 Latency** | <100 ms | **<200 ms** | Per endpoint, rolling 24h |
| **P99 Latency** | <300 ms | <500 ms | Per endpoint, rolling 24h |

**Scope:** Authenticated API requests excluding `/health`, file uploads, and SSE streams.  
**Measurement:** Server-side request duration from request received to response sent.

### 1.3 Error Rate

| Metric | Target (SLO) | SLA (Customer-Facing) | Measurement |
|--------|-------------|----------------------|-------------|
| **HTTP 5xx Rate** | <0.05% | **<0.1%** | Rolling 24 hours |
| **HTTP 4xx Rate** | N/A (client errors) | N/A | Monitoring only |

**Scope:** All API requests. 5xx responses are counted as errors.  
**Exclusions:** Errors caused by invalid client requests (400, 401, 403, 404, 422).

### 1.4 Clinical Processing SLAs

| Service | Target (SLO) | SLA | Measurement |
|---------|-------------|-----|-------------|
| **qEEG Analysis Completion** | <3 min | **<5 min** | From job submission to result ready |
| **Protocol Generation** | <5 sec | **<10 sec** | From request to response |
| **Report Generation** | <30 sec | <60 sec | From request to PDF/HTML ready |
| **EEG Cleaning Pipeline** | <2 min | <5 min | Per 5-minute EEG segment |
| **Transcription (Whisper)** | <20 sec | <30 sec | Per 60-second audio clip |

**Scope:** End-to-end processing time including queue wait + execution.  
**Exclusions:** Jobs that require human review or clinician input.

### 1.5 Data Integrity SLAs

| Metric | Target | SLA | Measurement |
|--------|--------|-----|-------------|
| **Data Accuracy** | 99.999% | **100%** | Zero patient data corruption |
| **Protocol Safety** | 100% | **100%** | Zero unsafe protocol recommendations |
| **Audit Log Completeness** | 100% | **100%** | All clinical actions logged |

**Clinical Safety Note:** Data integrity and patient safety are non-negotiable. Any data corruption or unsafe protocol generation is a **P1 incident** regardless of other SLA status.

---

## 2. Service Level Indicators (SLIs)

### 2.1 Availability SLI

```
Availability = (total_minutes - downtime_minutes) / total_minutes x 100

downtime_minutes = sum of all periods where /health returns
                   non-200 for >30 consecutive seconds
                   (excluding scheduled maintenance)
```

### 2.2 Latency SLI

```
Latency_P95 = 95th percentile of request durations
              over a 24-hour window

Measured per endpoint, aggregated across all machines.
```

### 2.3 Error Rate SLI

```
Error_Rate = (5xx_request_count / total_request_count) x 100

Measured over 24-hour rolling window.
```

### 2.4 qEEG Processing SLI

```
qEEG_SLA_Compliance = (jobs_completed_within_5min / total_jobs) x 100

Measured from Celery task start to task completion.
Queue wait time + execution time.
```

---

## 3. Recovery Objectives

### 3.1 Recovery Time Objective (RTO)

| Scenario | RTO | Measurement |
|----------|-----|-------------|
| **Complete Platform Failure** | **<1 hour** | From incident declaration to full service restoration |
| **Database Failure (SQLite)** | <30 min | From detection to restore from backup |
| **Database Failure (PostgreSQL)** | <15 min | From detection to failover or restore |
| **Worker Queue Failure** | <10 min | From detection to worker restart/scale |
| **API Degradation** | <30 min | From detection to P95 < 200ms restored |
| **Security Incident** | <1 hour | From detection to containment |

### 3.2 Recovery Point Objective (RPO)

| Data Type | RPO | Backup Frequency |
|-----------|-----|-----------------|
| **Patient Data** | **<15 minutes** | Every 15 minutes (automated) |
| **Clinical Database** | <15 minutes | Every 15 minutes (automated) |
| **Protocol/Evidence Data** | <1 hour | Every hour (snapshot) |
| **Media Uploads** | <24 hours | Daily (volume snapshots) |
| **Audit Logs** | 0 (real-time) | Continuous (append-only) |

### 3.3 Backup Verification

```bash
# Verify latest backup
fly ssh console --app deepsynaps-studio -C \
  "sqlite3 /data/backups/deepsynaps_protocol_studio_latest.db 'PRAGMA integrity_check;'"

# Verify backup timestamp
fly ssh console --app deepsynaps-studio -C \
  "ls -la /data/backups/"

# Monthly restore test (to staging)
# Copy latest backup to staging environment and verify full functionality
```

---

## 4. Escalation Response Times

### 4.1 by Incident Severity

| Severity | Acknowledgment | Initial Response | Target Resolution | Stakeholder Notification |
|----------|---------------|-----------------|-------------------|------------------------|
| **P1 — Critical** | **5 minutes** | 15 minutes | 1 hour | Within 10 minutes |
| **P2 — High** | **15 minutes** | 30 minutes | 4 hours | Within 30 minutes |
| **P3 — Medium** | **30 minutes** | 2 hours | 24 hours | Next business day |
| **P4 — Low** | 4 hours | 8 hours | 72 hours | Weekly summary |

### 4.2 Escalation Chain

```
T+0     Alert fires → Primary On-Call notified
T+5m    Unacknowledged → Secondary On-Call notified
T+10m   (P1) Unacknowledged → All platform engineers paged
T+15m   (P1) Still unacknowledged → Engineering Lead paged
T+30m   (P1) Unresolved → Clinical Safety Officer notified
T+60m   (P1) Unresolved → CTO + Executive team notified
```

### 4.3 Communication Expectations

| Severity | Update Frequency | Channel |
|----------|-----------------|---------|
| P1 | Every 10 minutes | #incidents Slack + Email |
| P2 | Every 30 minutes | #alerts Slack |
| P3 | Daily | #alerts Slack |
| P4 | Weekly | Ops summary |

---

## 5. Error Budget

### 5.1 Budget Calculation

```
Error Budget = (1 - SLO) x Measurement Window

For 99.9% uptime SLO over 30 days:
  Error Budget = 0.1% x 43,200 minutes = 43.2 minutes/month

For 99.95% uptime SLO (internal target):
  Error Budget = 0.05% x 43,200 minutes = 21.6 minutes/month
```

### 5.2 Budget Consumption Alerts

| Budget Consumed | Action |
|-----------------|--------|
| 25% (10.8 min) | Warning — review recent incidents |
| 50% (21.6 min) | Freeze non-critical deploys |
| 75% (32.4 min) | All deploys require SRE approval |
| 100% (43.2 min) | Emergency freeze — P1 response to any degradation |

### 5.3 Budget Reset

Error budget resets monthly (calendar month). Unused budget does not roll over.

---

## 6. Measurement and Reporting

### 6.1 Data Collection

| Metric | Source | Collection Frequency |
|--------|--------|---------------------|
| Uptime | Fly.io health checks | Every 15 seconds |
| Latency | Application logs (request duration) | Every request |
| Error Rate | Sentry + application logs | Real-time |
| qEEG processing | Celery task metadata | Every task |
| Queue depth | Celery inspect | Every 60 seconds |
| Disk usage | Volume metrics | Every 60 seconds |

### 6.2 Reporting Schedule

| Report | Frequency | Audience | Content |
|--------|-----------|----------|---------|
| **Weekly Ops Summary** | Monday | Engineering team | Uptime %, P95 latency, error rate, incidents |
| **Monthly SLA Report** | 1st of month | Leadership, Product | Full SLA compliance, error budget, trends |
| **Quarterly Review** | Quarterly | All stakeholders | SLA performance, improvement plans, SLO adjustments |
| **Incident Report** | Per incident | All stakeholders | Incident details, root cause, remediation |

### 6.3 Monthly SLA Report Template

```markdown
# SLA Report: [Month Year]

## Summary
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| API Uptime | 99.9% | [X]% | [PASS/FAIL] |
| P95 Latency | <200ms | [X]ms | [PASS/FAIL] |
| Error Rate | <0.1% | [X]% | [PASS/FAIL] |
| qEEG Completion | <5 min | [X]min | [PASS/FAIL] |

## Incidents
| Date | Severity | Duration | Impact | Status |
|------|----------|----------|--------|--------|
| | | | | |

## Error Budget
- Budget: 43.2 minutes
- Consumed: [X] minutes ([X]%)
- Remaining: [X] minutes

## Notable Events
- [Deployments, optimizations, incidents]

## Action Items
| Item | Owner | Due |
|------|-------|-----|
| | | |
```

---

## 7. SLA Violation Process

### 7.1 Internal Escalation (SLA Miss)

When an SLA is violated:

1. **Immediate:** SRE Lead is notified automatically
2. **Within 1 hour:** Incident review initiated
3. **Within 24 hours:** Preliminary analysis completed
4. **Within 48 hours:** Remediation plan created and assigned
5. **Within 1 week:** Post-incident review completed

### 7.2 Customer Communication (if applicable)

For externally committed SLAs:

| Severity | Customer Notification | Compensation |
|----------|----------------------|--------------|
| <99.9% uptime | Within 24 hours | Service credit per SLA terms |
| <99.5% uptime | Within 4 hours | Enhanced service credit |
| <99% uptime | Immediate | Maximum service credit + executive outreach |

### 7.3 Continuous Improvement

Each SLA violation triggers:

1. Root cause analysis (RCA)
2. Remediation action items
3. Runbook updates if procedures were insufficient
4. Architecture review if systemic issues identified
5. SLO adjustment proposal if targets are consistently met or missed

---

## Quick Reference

```
SLA SUMMARY
-----------
Availability:    99.9% uptime (43.2 min downtime/month allowed)
Latency P95:     <200ms
Error Rate:      <0.1%
qEEG Analysis:   <5 minutes
Protocol Gen:    <10 seconds
RTO:             <1 hour
RPO:             <15 minutes

P1 Response:     5 min acknowledge, 1 hour resolve
P2 Response:     15 min acknowledge, 4 hours resolve

Error Budget:    43.2 minutes/month (99.9%)
Budget 50%:      Freeze non-critical deploys
Budget 100%:     Emergency freeze
```

---

## Cross-References

- [Incident Response Runbook](../runbooks/incident-response.md) — Response procedures
- [On-Call Playbook](../runbooks/oncall-playbook.md) — Operational procedures
- [Capacity Planning Guide](../runbooks/capacity-planning.md) — Scaling for SLA compliance
- [Performance Tuning Guide](../runbooks/performance-tuning.md) — Optimization for latency
- [Release Process](./release-process.md) — Deployment impact on SLA
