# DeepSynaps Protocol Studio — Monitoring Runbook

> **Owner:** SRE Team  
> **Last Updated:** 2025-01  
> **Scope:** Monitoring infrastructure, metrics collection, dashboard usage, and Prometheus/AlertManager operations for the DeepSynaps clinical neuromodulation platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Metrics Collection](#metrics-collection)
4. [Dashboards](#dashboards)
5. [Prometheus Operations](#prometheus-operations)
6. [Adding New Metrics](#adding-new-metrics)
7. [On-Call Checklist](#on-call-checklist)
8. [Useful Queries](#useful-queries)
9. [Escalation](#escalation)

---

## Overview

This runbook documents the monitoring infrastructure for DeepSynaps Protocol Studio. It covers how metrics are collected, where dashboards live, how to operate Prometheus and AlertManager, and how to add new observability signals.

### SLOs (Service Level Objectives)

| SLO | Target | Measurement Window |
|-----|--------|-------------------|
| API Availability | > 99.9% | Rolling 30 days |
| API P95 Latency | < 200 ms | Per 5-minute window |
| API Error Rate | < 0.1% (5xx) | Per 5-minute window |
| Clinical Endpoint Availability | > 99.95% | Rolling 7 days |
| qEEG Analysis Success Rate | > 95% | Per 24-hour window |
| Backup Freshness | < 24 hours | Continuous |

---

## Architecture

```
  +------------------+       scrape       +-------------------+
  |  DeepSynaps API  |<-------------------|  Prometheus       |
  |  (FastAPI)       |   /metrics         |  (fly.io / VM)    |
  |  port 8080       |                    |                   |
  +------------------+                    +---------+---------+
          |                                         |
          | writes metrics                          | evaluates rules
          v                                         v
  +------------------+                    +---------+---------+
  |  Monitoring      |                    |  AlertManager     |
  |  Middleware      |                    |  (routing)        |
  +------------------+                    +---------+---------+
                                                    |
                                    +---------------+---------------+
                                    |                               |
                                    v                               v
                            +-------------+               +-----------------+
                            |  Slack      |               |  PagerDuty      |
                            |  (warnings) |               |  (critical)     |
                            +-------------+               +-----------------+
```

### Data Flow

1. **Request arrives** at FastAPI → `MetricsMiddleware` records start time
2. **Request completes** → middleware records duration, status, error classification
3. **Prometheus scrapes** `/metrics` every 15s (configurable)
4. **Prometheus evaluates** alerting rules every 15s
5. **Firing alerts** sent to AlertManager for routing, grouping, inhibition
6. **Notifications** dispatched to Slack (warnings) or PagerDuty (critical)

---

## Metrics Collection

### Instrumented Metrics

All metrics live in `apps/api/app/monitoring/metrics.py`. The following table documents each metric:

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `http_requests_total` | Counter | `method`, `endpoint`, `status` | Total HTTP requests (RED: Rate) |
| `http_request_duration_seconds` | Histogram | `method`, `endpoint` | Request latency distribution (RED: Duration) |
| `http_requests_in_progress` | Gauge | `method` | Concurrent requests |
| `http_errors_total` | Counter | `error_type`, `endpoint`, `status` | Error occurrences by classification |
| `db_pool_size` | Gauge | `pool` | DB connection pool total size |
| `clinical_operations_total` | Counter | `operation`, `actor_role` | Clinical operations performed |
| `patient_data_access_total` | Counter | `operation_type`, `actor_role` | Patient data access events (audit) |
| `evidence_queries_total` | Counter | `query_type`, `source` | Evidence DB query count |
| `qeeg_analysis_duration_seconds` | Histogram | `analysis_type`, `status` | qEEG pipeline latency |
| `active_sessions` | Gauge | `actor_role` | Active user sessions |
| `worker_queue_depth` | Gauge | `queue` | Celery pending task count |
| `backup_age_seconds` | Gauge | — | Seconds since last backup |
| `security_events_total` | Counter | `event_type`, `severity` | Security-relevant events |

### Label Safety (PHI Compliance)

**NEVER** include the following in any metric label value:
- Patient names, MRNs, or IDs
- Email addresses
- Phone numbers
- Clinical data values (symptom scores, biomarker values)
- Free-form text fields

**Safe label values** are drawn from controlled vocabularies:
- `method`: `GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `OPTIONS`
- `status`: `2xx`, `3xx`, `4xx`, `5xx`
- `endpoint`: FastAPI route template (e.g., `/api/v1/patients/{patient_id}`)
- `actor_role`: `clinician`, `patient`, `admin`, `system`, `caregiver`
- `operation`: `protocol_generate`, `assessment_complete`, `treatment_start`, etc.
- `error_type`: `validation`, `auth`, `clinical`, `internal`, `timeout`, `database`, `upstream`
- `event_type`: `failed_auth`, `rate_limit_hit`, `privilege_escalation`, `suspicious_access`

### Middleware Integration

The `MetricsMiddleware` is registered in `app/main.py` and automatically tracks:
- Request count, duration, in-progress count
- Error classification by status code and endpoint
- Security events (failed auth, rate limiting)
- Slow request logging (> 200ms)

To add the middleware to the application:

```python
from app.monitoring.middleware import MetricsMiddleware

app.add_middleware(MetricsMiddleware)
```

---

## Dashboards

### Grafana Dashboard URLs

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| API Performance | `https://grafana.deepsynaps.io/d/api-performance` | RED metrics, latency percentiles, error rates |
| Clinical Operations | `https://grafana.deepsynaps.io/d/clinical` | Protocol generation, assessments, patient data access |
| Infrastructure Health | `https://grafana.deepsynaps.io/d/infrastructure` | CPU, memory, DB pool, workers, backups, error budget |

### Dashboard Drill-Down

All dashboards support drill-down via template variables:
- Click an endpoint in the API dashboard to filter all panels to that endpoint
- Change the `environment` dropdown to switch between production/staging
- Use the `instance` filter in the infrastructure dashboard to focus on a specific Fly.io machine

### Dashboard Import

Dashboard JSON files are in `deploy/grafana/`:
```bash
# Import to Grafana
curl -X POST \
  -H "Content-Type: application/json" \
  -d @deploy/grafana/dashboard-api.json \
  https://grafana.deepsynaps.io/api/dashboards/db
```

---

## Prometheus Operations

### Access

Prometheus runs on `prometheus.internal:9090` within the Fly.io 6PN network.

```bash
# Port-forward for local access
fly proxy 9090:9090 -a deepsynaps-prometheus

# Then open http://localhost:9090
```

### Common Operations

#### Reload Configuration

```bash
# Send SIGHUP to reload config and rules
curl -X POST http://prometheus.internal:9090/-/reload
```

#### Check Target Health

```bash
# List all scrape targets and their status
curl -s http://prometheus.internal:9090/api/v1/targets | jq '.data.activeTargets[] | {job, health, labels}'
```

#### Query Examples

```promql
# Request rate per endpoint
sum(rate(http_requests_total[5m])) by (endpoint)

# P95 latency
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# Error rate
sum(rate(http_requests_total{status=~"5xx"}[5m])) / sum(rate(http_requests_total[5m]))

# DB pool utilization
db_pool_checked_out / db_pool_size{pool="default"}

# Clinical operations per hour
sum(increase(clinical_operations_total[1h])) by (operation)

# Backup age in hours
backup_age_seconds / 3600
```

### Storage

- Retention: 30 days
- Volume: `/data/prometheus` on Fly.io persistent volume
- Expected growth: ~2GB/month for current traffic levels

---

## Adding New Metrics

### Step-by-Step

1. **Define the metric** in `apps/api/app/monitoring/metrics.py`:

```python
MY_NEW_COUNTER = Counter(
    "my_new_events_total",
    "Description of the event",
    labelnames=["category", "outcome"],
    registry=MONITORING_REGISTRY,
)
```

2. **Add a helper function** (optional but recommended):

```python
def record_my_new_event(category: str, outcome: str) -> None:
    MY_NEW_COUNTER.labels(category=category, outcome=outcome).inc()
```

3. **Export from `__init__.py`**:

```python
from app.monitoring.metrics import (
    # ... existing exports ...
    record_my_new_event,
)
```

4. **Instrument the code**:

```python
from app.monitoring import record_my_new_event

# In your router/service:
record_my_new_event("protocol_validation", "success")
```

5. **Add a dashboard panel** in the appropriate Grafana dashboard JSON.

6. **Add an alert rule** if the metric needs alerting (see `alerts-clinical.yml` or `alerts-system.yml`).

7. **Deploy** — the new metric appears on the next `/metrics` scrape.

---

## On-Call Checklist

### Shift Handoff

- [ ] Review firing alerts in Grafana (annotation overlay)
- [ ] Check error budget burn rate on Infrastructure dashboard
- [ ] Verify all Fly.io machines are healthy (`fly status`)
- [ ] Review any silenced alerts and their expiry
- [ ] Confirm PagerDuty escalation policies are active

### Weekly Review

- [ ] Review P95/P99 latency trends (1-week view)
- [ ] Check clinical error rate trends
- [ ] Verify backup completion logs
- [ ] Review security events for anomalies
- [ ] Check worker queue depth patterns
- [ ] Examine disk usage growth rate

### Monthly Review

- [ ] SLO report: availability, latency, error rate vs targets
- [ ] Error budget consumption
- [ ] Dashboard and alert rule audit
- [ ] Metrics cardinality review (check for unexpected label values)
- [ ] Runbook accuracy review and updates

---

## Useful Queries

### RED Method

```promql
# Rate (requests per second)
sum(rate(http_requests_total[5m])) by (endpoint)

# Errors (error rate)
sum(rate(http_errors_total[5m])) by (error_type)

# Duration (latency percentiles)
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

### Clinical Operations

```promql
# Protocols generated per hour
sum(increase(clinical_operations_total{operation="protocol_generate"}[1h]))

# Assessment completion rate
sum(rate(clinical_operations_total{operation="assessment_complete"}[1h]))
  /
sum(rate(clinical_operations_total{operation=~"assessment_(complete|start)"}[1h]))

# Patient data access by role
sum(rate(patient_data_access_total[1h])) by (actor_role)
```

### Infrastructure

```promql
# CPU usage
100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100)

# Memory usage
(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100

# Error budget remaining (30-day)
1 - (sum(increase(http_requests_total{status=~"5xx"}[30d])) / sum(increase(http_requests_total[30d])))
```

---

## Escalation

| Severity | Response Time | Channel | Escalation |
|----------|--------------|---------|------------|
| Critical (clinical) | 5 minutes | PagerDuty + Slack | Auto-page on-call SRE |
| Critical (system) | 15 minutes | PagerDuty + Slack | Auto-page on-call SRE |
| Warning | 30 minutes | Slack | Manual escalation if unresolved |
| Info | Business hours | Slack #monitoring | No escalation |

### Escalation Chain

1. **Primary on-call** (SRE) receives alert via PagerDuty
2. If unacknowledged in 10 minutes → Secondary on-call paged
3. If unacknowledged in 20 minutes → Engineering manager paged
4. For clinical-critical alerts → Clinical engineering lead also paged

### Contacts

| Role | Contact | PagerDuty Schedule |
|------|---------|-------------------|
| Primary SRE | sre-oncall@deepsynaps.io | `SRE_Primary` |
| Secondary SRE | sre-secondary@deepsynaps.io | `SRE_Secondary` |
| Clinical Engineering | clinical-eng@deepsynaps.io | `Clinical_Engineering` |
| Security | security@deepsynaps.io | `Security_OnCall` |
| Engineering Manager | eng-manager@deepsynaps.io | `Eng_Management` |

---

*End of Monitoring Runbook*
