# DeepSynaps Protocol Studio — Alerting Runbook

> **Owner:** SRE Team  
> **Last Updated:** 2025-01  
> **Scope:** Alert response procedures for all clinical and system alerts. Every alert in `alerts-clinical.yml` and `alerts-system.yml` links to a section in this document.

---

## Table of Contents

1. [Alert Response Philosophy](#alert-response-philosophy)
2. [Initial Response Checklist](#initial-response-checklist)
3. [Clinical Alerts](#clinical-alerts)
4. [System Alerts](#system-alerts)
5. [Security Alerts](#security-alerts)
6. [Recovery Verification](#recovery-verovery-verification)
7. [Post-Incident Actions](#post-incident-actions)
8. [Alert Tuning](#alert-tuning)

---

## Alert Response Philosophy

### Severity Definitions

| Severity | Meaning | Response |
|----------|---------|----------|
| **Critical** | Patient safety at risk, or service is down/unusable | Page immediately, respond within 5 min |
| **Warning** | Degraded experience, capacity concern, or anomaly | Slack alert, respond within 30 min |
| **Info** | Awareness event, no immediate action needed | Review during business hours |

### Golden Signals

For every alert, check these four signals first:
1. **Latency** — Are requests slow? Check P50/P95/P99.
2. **Traffic** — Is load unusual? Check request rate.
3. **Errors** — What's failing? Check error rate by type.
4. **Saturation** — Are resources exhausted? Check CPU, memory, DB pool, queue depth.

---

## Initial Response Checklist

Use this checklist for every alert before diving into diagnosis:

- [ ] Acknowledge the alert in PagerDuty/Slack
- [ ] Check the linked Grafana dashboard
- [ ] Check if the alert is a **symptom** or **cause**
- [ ] Look for correlated alerts (AlertManager groups by `alertgroup` and `env`)
- [ ] Check recent deployments (`deepsynaps_app_info` changes)
- [ ] Check Fly.io status page: https://status.flyio.net
- [ ] Determine: Is this a known issue with an open incident?

### Quick Diagnostic Commands

```bash
# Check Fly.io app status
fly status --app deepsynaps-studio

# Check logs (last 100 lines)
fly logs --app deepsynaps-studio --tail 100

# Check specific machine logs
fly machine status <machine-id> --app deepsynaps-studio

# Check DB connections
fly ssh console --app deepsynaps-studio
> psql $DEEPSYNAPS_DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Check queue depth
fly ssh console --app deepsynaps-studio --machine <worker-machine-id>
> redis-cli -u $CELERY_BROKER_URL LLEN celery

# Check recent deployments
fly releases list --app deepsynaps-studio
```

---

## Clinical Alerts

### ClinicalEndpointHighErrorRate

**Fires when:** A clinical endpoint has > 5% error rate for 2+ minutes.  
**Impact:** Patient treatments, protocol generation, or assessments may be blocked.

#### Diagnosis

1. Identify the failing endpoint from the `endpoint` label
2. Check the API Performance dashboard filtered to that endpoint
3. Check error classification:
   ```promql
   sum(rate(http_errors_total{endpoint="<endpoint>"}[5m])) by (error_type)
   ```
4. Check application logs:
   ```bash
   fly logs --app deepsynaps-studio | grep "<endpoint>" | grep "error"
   ```

#### Common Causes & Actions

| Cause | Signs | Action |
|-------|-------|--------|
| DB connection pool exhausted | `error_type="database"`, DB pool gauge near limit | Scale DB pool or restart app machines |
| Evidence DB locked/corrupt | `error_type="clinical"`, SQLite errors in logs | Check `/data/evidence.db` integrity, restore from backup if needed |
| Downstream service timeout | `error_type="timeout"`, latency high upstream | Check qEEG worker, Redis, or external API health |
| Schema migration issue | Errors after a deploy, `error_type="internal"` | Rollback to previous release via `fly deploy --image` |
| Memory pressure (OOM) | `error_type="internal"`, memory usage high | Scale Fly.io memory or restart machine |

#### Verification

```promql
# Confirm error rate is dropping
sum(rate(http_errors_total{error_type="clinical",endpoint="<endpoint>"}[5m]))
/
sum(rate(http_requests_total{endpoint="<endpoint>"}[5m]))
```

---

### ClinicalEndpointDown

**Fires when:** The API health check fails for 1+ minute.  
**Impact:** All clinical operations halted.

#### Diagnosis

1. Check Fly.io status page
2. Check if machines are running:
   ```bash
   fly status --app deepsynaps-studio
   ```
3. Check if the health endpoint responds:
   ```bash
   curl https://deepsynaps-studio.fly.dev/health
   ```
4. Check for recent crash loops:
   ```bash
   fly machine status <id> --app deepsynaps-studio
   ```

#### Common Causes & Actions

| Cause | Signs | Action |
|-------|-------|--------|
| Fly.io platform issue | Status page shows incident | Wait for Fly.io resolution, engage support |
| App crash loop | Machine status shows multiple restarts | Check logs for startup error, fix config/code |
| DB unreachable | Health check returns 500, DB connection errors | Check DB connection string, network, DB status |
| Memory OOM | Machine restarted, OOM in logs | Scale memory or reduce worker concurrency |
| Deployment broken | Issue correlates with a release | Rollback to previous release immediately |

#### Verification

```bash
curl -f https://deepsynaps-studio.fly.dev/health
curl -f https://deepsynaps-studio.fly.dev/healthz
```

---

### ClinicalLatencySloBreach

**Fires when:** Clinical endpoint P95 latency > 500ms for 5+ minutes.  
**Impact:** Clinicians experience sluggish UI, assessment timing may be affected.

#### Diagnosis

1. Check which endpoint(s) are slow on the API Performance dashboard
2. Check latency heatmap to identify duration buckets
3. Check for resource saturation (CPU, memory, DB pool)
4. Check if qEEG/MRI workers are backed up (clinical endpoints may wait for async results)

#### Common Causes & Actions

| Cause | Signs | Action |
|-------|-------|--------|
| DB query slow | `db_pool_acquire_seconds` high | Check slow query log, add index, optimize query |
| Evidence DB I/O | Endpoint = `/api/v1/evidence/*` | Check /data volume I/O, consider moving evidence DB to PostgreSQL |
| Worker queue deep | `worker_queue_depth` > 500 | Scale qEEG workers or reduce submission rate |
| Fly.io CPU throttling | CPU usage > 80% on shared cores | Scale to dedicated CPU or reduce machine load |
| Large payload | POST requests with big bodies | Add pagination, streaming, or payload limits |

---

### PatientDataAccessAnomaly

**Fires when:** Patient data access rate is 5x above the 1-hour baseline for 5+ minutes.  
**Impact:** Potential unauthorized data scraping or bulk export.

#### Diagnosis

1. Check which `actor_role` triggered the alert
2. Review the Clinical Operations dashboard — Patient Data Access panel
3. Check audit logs for the affected role
4. Look for patterns: single IP, single user, bulk requests

#### Common Causes & Actions

| Cause | Signs | Action |
|-------|-------|--------|
| Legitimate batch job | `actor_role="system"`, regular pattern | Verify with team that a batch export is expected |
| Scraping attempt | `actor_role="clinician"`, single IP, sequential IDs | Block IP at edge, revoke session tokens, notify security |
| Report generation burst | `actor_role="clinician"`, export operation type | Expected if multiple reports generated — verify |
| Compromised credentials | Unusual access patterns, off-hours | Force password reset, enable MFA, audit all sessions |

#### Verification

```promql
# Confirm rate has normalized
sum(rate(patient_data_access_total[5m])) by (actor_role)
```

---

### ExcessivePatientDataExport

**Fires when:** Patient data export rate > 0.1/s for 5+ minutes.  
**Impact:** Possible data exfiltration.

#### Immediate Actions

1. **Do not dismiss without investigation**
2. Check audit trail for export operations
3. Identify the source actor and IP
4. If unauthorized: revoke sessions, block IP, notify security team
5. Document all actions taken

---

### QEEGAnalysisHighFailureRate

**Fires when:** qEEG analysis failure rate > 5% for 5+ minutes.  
**Impact:** Clinicians cannot generate protocols that depend on qEEG analysis.

#### Diagnosis

1. Check the `analysis_type` label for which pipeline is failing
2. Check Clinical Operations dashboard — qEEG panels
3. Check worker logs:
   ```bash
   fly logs --app deepsynaps-studio --machine <qeeg-worker-id>
   ```
4. Check if input data is malformed (check `/data` for corrupt EEG files)

#### Common Causes & Actions

| Cause | Signs | Action |
|-------|-------|--------|
| Worker OOM | OOMKilled in logs | Increase worker memory or reduce batch size |
| Corrupt input data | Specific file pattern in errors | Remove/replace corrupt files, add validation |
| Dependency missing | Import errors in logs | Rebuild worker Docker image with dependencies |
| GPU/CPU resource exhaustion | Processing time increasing | Scale workers or reduce concurrency |
| Evidence DB mismatch | `status="error"` on specific analysis type | Check evidence DB for stale biomarker references |

---

### QEEGAnalysisTimeout

**Fires when:** qEEG analysis P99 duration > 10 minutes for 10+ minutes.  
**Impact:** Analysis jobs severely delayed, clinicians waiting for results.

#### Actions

1. Check worker queue depth
2. Check if workers are processing at all (`WorkersNotProcessing` alert may also fire)
3. Scale workers if queue is backing up:
   ```bash
   fly machine clone <worker-machine-id> --app deepsynaps-studio
   ```
4. If workers are stuck, restart them:
   ```bash
   fly machine restart <worker-machine-id> --app deepsynaps-studio
   ```

---

### QEEGAnalysisStalled

**Fires when:** No successful qEEG analysis in 1 hour despite submissions.  
**Impact:** Complete pipeline blockage.

#### Actions

1. Check worker machine status: `fly status --app deepsynaps-studio`
2. Check Redis connectivity: `redis-cli -u $CELERY_BROKER_URL ping`
3. Check for worker crash loops in logs
4. Restart worker machines if unresponsive
5. If Redis is down, all async processing halts — restore Redis first

---

### AssessmentTimeoutHigh

**Fires when:** > 2% of assessment requests time out.  
**Impact:** Patients cannot complete assessments.

#### Diagnosis

1. Check assessment endpoint latency distribution
2. Check if assessment depends on external services (qEEG, evidence queries)
3. Check DB pool utilization during timeout periods

#### Actions

- If DB pool issue: scale connections
- If external dependency: check dependency health
- If load spike: scale app machines
- Consider async assessment submission to avoid timeouts

---

### EvidenceDatabaseStale

**Fires when:** No evidence queries recorded in 24 hours.  
**Impact:** Evidence-based recommendations may fail silently.

#### Diagnosis

1. Check if the evidence router is reachable: `curl /api/v1/evidence`
2. Check if `EVIDENCE_DB_PATH` is set correctly
3. Check if `/data/evidence.db` exists and is readable
4. Check SQLite integrity:
   ```bash
   sqlite3 /data/evidence.db "PRAGMA integrity_check;"
   ```

#### Actions

- If DB file missing: restore from backup
- If DB corrupt: attempt `.recover`, then rebuild from source
- If permissions issue: fix volume permissions
- If code issue: check evidence router for recent changes

---

### EvidenceQueryLatencyHigh

**Fires when:** Evidence endpoint P95 latency > 2 seconds.  
**Impact:** Protocol generation (which queries evidence) becomes slow.

#### Actions

1. Check `/data` volume I/O metrics
2. Run SQLite query planner on slow queries
3. Consider adding indexes to evidence DB
4. If DB is large (> 1GB), consider migrating to PostgreSQL

---

### BackupAgeCritical / BackupAgeWarning

**Fires when:** Last backup was > 25 hours (critical) or > 20 hours (warning).  
**Impact:** Extended data loss window.

#### Diagnosis

1. Check backup job logs
2. Verify backup storage destination is accessible
3. Check if backup job is scheduled correctly

#### Actions

- If backup job failed: retry manually, investigate failure cause
- If backup destination full: free space or expand storage
- If backup job missing: restore from infrastructure-as-code
- Run manual backup immediately while investigating:
  ```bash
  fly ssh console --app deepsynaps-studio
  > pg_dump $DEEPSYNAPS_DATABASE_URL | gzip > /data/backups/manual-$(date +%Y%m%d-%H%M).sql.gz
  ```

---

## System Alerts

### HighCPUUsage / CriticalCPUUsage

**Fires when:** CPU > 80% (warning) or > 95% (critical).  
**Impact:** Request latency increases, potential timeout cascade.

#### Actions

1. Check which endpoints are driving load on API dashboard
2. Check if load is legitimate (traffic spike) or pathological (infinite loop)
3. Scale Fly.io machines:
   ```bash
   fly machine clone <machine-id> --app deepsynaps-studio
   ```
4. If persistent, consider scaling CPU kind from `shared` to `performance`

---

### HighMemoryUsage / CriticalMemoryUsage

**Fires when:** Memory > 85% (warning) or > 95% (critical).  
**Impact:** OOM kills, request failures, potential data loss.

#### Actions

1. Identify memory-heavy processes:
   ```bash
   fly ssh console --app deepsynaps-studio
   > ps aux --sort=-%mem | head -20
   ```
2. Common memory hogs: qEEG analysis, large uploads, evidence DB cache
3. Scale memory:
   ```bash
   fly machine update <id> --memory 2gb --app deepsynaps-studio
   ```
4. If qEEG workers use too much memory, reduce batch size

---

### HighDiskUsage / CriticalDiskUsage

**Fires when:** Disk > 85% (warning) or > 95% (critical) on `/data`.  
**Impact:** Uploads fail, evidence DB operations fail.

#### Actions

1. Check disk usage breakdown:
   ```bash
   fly ssh console --app deepsynaps-studio
   > du -sh /data/* | sort -rh
   ```
2. Clean up old uploads, logs, temp files
3. Expand Fly.io volume:
   ```bash
   fly volume extend <vol-id> --size 2 --app deepsynaps-studio
   ```
4. Set up automated log rotation if not present

---

### DBPoolUtilizationHigh / DBPoolExhausted

**Fires when:** DB pool > 75% (warning) or 100% (critical).  
**Impact:** Requests queue and timeout.

#### Actions

1. Check active connections:
   ```bash
   psql $DEEPSYNAPS_DATABASE_URL -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"
   ```
2. Look for idle connections not being returned to pool
3. Increase pool size in application config (if headroom on DB)
4. Check for connection leaks (connections that grow over time)
5. Restart app to reset pool if critical and under pressure

---

### SSLCertificateExpiring30d / 14d / 7d

**Fires when:** SSL certificate expires within 30/14/7 days.  
**Impact:** Service becomes unreachable when certificate expires.

#### Actions

- If using Fly.io managed certificates: usually auto-renews, check `fly certs list`
- If custom certificate: initiate renewal process immediately
- For 7-day alert: **this is critical** — begin renewal NOW
- Verify renewal:
  ```bash
  fly certs list --app deepsynaps-studio
  openssl s_client -connect deepsynaps-studio.fly.dev:443 -servername deepsynaps-studio.fly.dev < /dev/null 2>/dev/null | openssl x509 -noout -dates
  ```

---

### WorkerQueueDepthHigh / WorkerQueueDepthCritical

**Fires when:** Queue depth > 500 (warning) or > 1000 (critical).  
**Impact:** Async tasks severely delayed.

#### Actions

1. Check worker status: `fly status --app deepsynaps-studio`
2. Check processing rate vs submission rate
3. Scale workers by cloning machines
4. If workers are running but slow: check worker CPU/memory
5. If Redis is slow: check Redis metrics

---

### WorkersNotProcessing

**Fires when:** No tasks processed in 10 minutes with queue > 0.  
**Impact:** Complete async pipeline halt.

#### Actions

1. Check worker machine health
2. Check Redis connectivity from worker
3. Check for worker process crash loops
4. Restart workers
5. If tasks are critical, consider manual execution of highest-priority jobs

---

### APIHighErrorRate / APIElevatedErrorRate

**Fires when:** 5xx rate > 0.1% (critical) or total error rate > 5% (warning).  
**Impact:** Failed requests, degraded user experience.

#### Actions

Follow the same diagnostic path as [ClinicalEndpointHighErrorRate](#clinicalendpointhigherrorrate), but for all endpoints.

Key additional checks:
- Check if errors correlate with a specific deploy
- Check if errors are concentrated on specific endpoints
- Check Fly.io status page for platform issues

---

### APILatencyP95High / APILatencyP99High

**Fires when:** P95 > 200ms (critical) or P99 > 1s (warning).  
**Impact:** Sluggish user experience, potential timeouts.

#### Actions

1. Identify slow endpoints via the Top 10 Slowest Endpoints table
2. Check resource saturation (CPU, memory, DB pool)
3. Check if slow endpoints depend on external services
4. Consider caching for frequently-accessed evidence queries
5. Optimize slow DB queries

---

### ErrorBudgetFastBurn / ErrorBudgetSlowBurn

**Fires when:** Error budget burn rate exceeds 14.4x (fast) or 2x (slow).  
**Impact:** Monthly SLO at risk.

#### Actions

1. **Fast burn (14.4x):** Stop the bleeding first — identify and mitigate the root cause
2. **Slow burn (2x):** Plan remediation within the sprint
3. Review recent deployments for quality issues
4. If burn is due to a single incident, document and ensure it won't recur
5. Consider temporary traffic reduction (e.g., disable non-critical features)

---

### FlyMachineCountLow / FlyConnectionLimitApproaching

**Fires when:** Less than 1 healthy machine, or connections approaching 20 (soft limit).  
**Impact:** Service availability or connection refusal.

#### Actions

1. Check Fly.io status page
2. Check machine health: `fly status`
3. If machines are unhealthy, investigate and restart
4. For connection limit: scale machines or increase Fly.io concurrency limits
5. Consider adding caching layer to reduce origin load

---

## Security Alerts

### ClinicalAuthFailureRateHigh

**Fires when:** Failed auth rate > 0.5/s for 5+ minutes on clinical endpoints.  
**Impact:** Possible brute-force attack or credential issue.

#### Actions

1. Check source IPs in application logs
2. If brute-force: block IP at edge, enable rate limiting
3. If widespread: check if auth service is misconfigured
4. Notify security team

---

### PrivilegeEscalationDetected

**Fires when:** Any privilege escalation event recorded.  
**Impact:** Potential unauthorized access to clinical functions.

#### Actions

1. **Immediate:** Identify the actor and session involved
2. Revoke the session and force re-authentication
3. Check audit trail for actions taken during the session
4. Notify security team immediately
5. Document incident for compliance review

---

## Recovery Verification

After resolving any alert, verify recovery:

1. **Check the metric** that triggered the alert is back to normal:
   ```promql
   # Example: confirm error rate is below threshold
   sum(rate(http_errors_total{error_type="clinical"}[5m]))
   /
   sum(rate(http_requests_total[5m]))
   ```

2. **Check Grafana dashboard** — the alert panel should show green

3. **Check for resolution notification** from AlertManager (Slack/PagerDuty)

4. **Verify dependent services** are healthy (e.g., if DB pool was exhausted, confirm clinical endpoints respond correctly)

5. **Monitor for 15 minutes** after resolution to ensure no relapse

---

## Post-Incident Actions

After any critical or significant incident:

1. **Write an incident report** with:
   - Timeline of events
   - Root cause analysis (5 Whys)
   - Impact assessment (patients affected, data at risk, duration)
   - Actions taken
   - Preventive measures

2. **Update this runbook** if the response process was unclear or incorrect

3. **Tune alerts** if they fired incorrectly (false positive) or too late

4. **Update dashboards** if gaps in observability were identified

5. **Schedule a post-mortem** within 48 hours for critical incidents

---

## Alert Tuning

### When to Tune

- Alert fires too often (noisy) → increase threshold or `for` duration
- Alert fires too late → decrease threshold or `for` duration
- Alert catches real issues but also fires for known acceptable conditions → add exclusion
- New feature needs monitoring → add new alert rule

### Process

1. Edit the relevant rule file (`alerts-clinical.yml` or `alerts-system.yml`)
2. Test the PromQL expression in the Prometheus UI
3. Use `promtool` to validate:
   ```bash
   promtool check rules deploy/alertmanager/alerts-clinical.yml
   promtool check rules deploy/alertmanager/alerts-system.yml
   ```
4. Deploy via CI/CD pipeline
5. Monitor the alert for 1-2 days to ensure it behaves as expected

---

*End of Alerting Runbook*
