# DeepSynaps Protocol Studio — Observability Setup

> **Owner:** SRE & Clinical Engineering Teams  
> **Last Updated:** 2025-01-15  
> **Scope:** Logging, metrics, alerting, tracing, clinical audit logging, dashboards, and Sentry configuration for the DeepSynaps Protocol Studio platform.  
> **Environments:** development, test, staging, production  
> **Compliance:** HIPAA-aware; all configurations are designed to protect PHI/PII.

---

## Table of Contents

1. [Logging Architecture](#1-logging-architecture)
2. [Metrics Architecture](#2-metrics-architecture)
3. [Alerting Rules](#3-alerting-rules)
4. [Request Tracing](#4-request-tracing)
5. [Clinical Audit Logging](#5-clinical-audit-logging)
6. [Dashboard Specifications](#6-dashboard-specifications)
7. [Sentry Configuration](#7-sentry-configuration)
8. [Environment-Specific Configurations](#8-environment-specific-configurations)
9. [Operational Runbooks](#9-operational-runbooks)
10. [Appendix: Reference Quick-Start](#10-appendix-reference-quick-start)

---

## 1. Logging Architecture

### 1.1 Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Structured JSON** | Every log line is valid JSON; no free-text parsing needed |
| **PHI Safety** | No patient identifiers, clinical values, or PII in log messages |
| **Request Correlation** | Every log carries a `request_id` propagated across async boundaries |
| **Level Appropriateness** | DEBUG for dev only; INFO for normal ops; WARNING for anomalies; ERROR for failures |
| **Immutable Timestamps** | All timestamps are UTC ISO-8601 with timezone suffix (`+00:00`) |
| **Centralized Aggregation** | Fly.io native logs → Vector → external sink (optional) |

### 1.2 Log Format Specification (JSON)

Every log record emitted by `app.logging_setup.JsonFormatter` conforms to this schema:

```json
{
  "timestamp": "2025-01-15T09:23:47.123456+00:00",
  "level": "INFO",
  "logger": "app.monitoring.middleware",
  "message": "request completed",
  "request_id": "req_abc123def456",
  "method": "GET",
  "path": "/api/v1/patients/{patient_id}",
  "status_code": 200,
  "duration_ms": 45.23,
  "actor_id": "user_clinician_01",
  "role": "clinician",
  "snapshot_id": "snap_20250115_001"
}
```

**Field definitions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | ISO-8601 string | Always | UTC timestamp with microsecond precision |
| `level` | string | Always | One of `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `logger` | string | Always | Python `__name__` of the emitting module |
| `message` | string | Always | Human-readable log message (PHI-free) |
| `request_id` | string | When in HTTP context | UUIDv4 propagated from `X-Request-ID` header or generated |
| `method` | string | When HTTP | HTTP verb (`GET`, `POST`, etc.) |
| `path` | string | When HTTP | Route template (e.g., `/api/v1/patients/{patient_id}`) |
| `status_code` | integer | When HTTP response available | HTTP response status code |
| `duration_ms` | float | When timing available | Operation duration in milliseconds |
| `actor_id` | string | When authenticated | Anonymized actor identifier (never email or MRN) |
| `role` | string | When authenticated | One of `clinician`, `patient`, `admin`, `system`, `guest` |
| `snapshot_id` | string | Clinical ops only | Snapshot identifier for clinical data operations |
| `exception` | string | On exception only | Exception traceback (stack trace) |

### 1.3 Log Levels per Environment

| Environment | Root Level | Middleware | Clinical Ops | Workers |
|-------------|-----------|------------|--------------|---------|
| `development` | `DEBUG` | `DEBUG` | `DEBUG` | `INFO` |
| `test` | `WARNING` | `WARNING` | `WARNING` | `WARNING` |
| `staging` | `INFO` | `INFO` | `INFO` | `INFO` |
| `production` | `INFO` | `INFO` | `INFO` | `INFO` |

**Configuration:**

```python
# In app/settings.py — controlled by DEEPSYNAPS_LOG_LEVEL env var
LOG_LEVEL_MAP = {
    "development": "DEBUG",
    "test": "WARNING",
    "staging": "INFO",
    "production": "INFO",
}
```

### 1.4 Sensitive Data Redaction Rules (PHI/PII)

**The following must NEVER appear in any log field:**

| Data Type | Examples | Redaction Method |
|-----------|----------|-----------------|
| Patient names | "John Doe" | Replace with `{patient_name}` |
| Medical Record Numbers | `MRN-12345`, `PT-67890` | Replace with `{mrn}` |
| Social Security Numbers | `123-45-6789` | Replace with `{ssn}` |
| Dates of birth | `1985-03-15` | Replace with `{dob}` |
| Clinical values | PHQ-9 scores, lab results | Replace with `{clinical_value}` |
| Diagnostic codes | `F32.2`, `G40.901` | Replace with `{diagnosis_code}` |
| Addresses | Street, city, postal code | Replace with `{address}` |
| Phone numbers | `+1-555-123-4567` | Replace with `{phone}` |
| Email addresses | `patient@example.com` | Replace with `{email}` |
| Authorization tokens | `Bearer eyJ...` | Replace with `[REDACTED]` |
| Session cookies | `session=abc123` | Replace with `[REDACTED]` |

**Implementation:**

```python
# app/services/log_sanitizer.py
import re

# Pre-compiled redaction patterns
_REDACTION_PATTERNS = [
    (re.compile(r'\b\d{3}-\d{2}-\d{4}\b'), '{ssn}'),          # SSN
    (re.compile(r'\b(?:MRN|PT)-\d+\b', re.I), '{mrn}'),       # MRN patterns
    (re.compile(r'\bBearer\s+\S+', re.I), '[REDACTED]'),      # Auth tokens
    (re.compile(r'session=\S+', re.I), 'session=[REDACTED]'),  # Session cookies
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'), '{email}'),  # Emails
]

def redact_phi(text: str) -> str:
    """Redact PHI/PII from log messages and fields."""
    for pattern, replacement in _REDACTION_PATTERNS:
        text = pattern.sub(replacement, text)
    return text
```

### 1.5 Request ID Correlation Across Services

The request ID propagation chain:

```
Client Request → Nginx/Fly Proxy → FastAPI Middleware → Route Handler → Service Layer → DB/Redis/Celery
     │               │                    │                  │               │              │
     │         X-Request-ID        request.state.       logger extra      Propagated    Celery header
     │         (or generate)       request_id           field             via context   x-request-id
```

**Implementation in FastAPI middleware:**

```python
# app/middleware/request_id.py
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", f"req_{uuid.uuid4().hex[:16]}")
        request.state.request_id = request_id
        
        # Inject into logging context for all downstream loggers
        from app.logging_setup import get_logger
        logger = get_logger(__name__)
        logger_adapter = logging.LoggerAdapter(logger, {"request_id": request_id})
        
        # Propagate to Celery tasks
        from celery import current_task
        if current_task:
            current_task.request.headers = current_task.request.headers or {}
            current_task.request.headers["X-Request-ID"] = request_id
        
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
```

**Celery worker propagation:**

```python
# app/jobs/context.py
from celery import Task
from app.logging_setup import get_logger

logger = get_logger(__name__)

class ContextTask(Task):
    """Base Celery task that propagates request_id and snapshot_id."""
    
    def apply_async(self, *args, **kwargs):
        headers = kwargs.setdefault("headers", {})
        # Request ID is injected by the middleware before task submission
        return super().apply_async(*args, **kwargs)
    
    def __call__(self, *args, **kwargs):
        request_id = self.request.headers.get("X-Request-ID", "worker-generated") if self.request.headers else "worker-generated"
        snapshot_id = kwargs.get("snapshot_id", "snap_unknown")
        
        # Bind to logging context
        extra = {"request_id": request_id, "snapshot_id": snapshot_id}
        with logger.contextualize(**extra):
            return self.run(*args, **kwargs)
```

### 1.6 Log Retention Policies per Environment

| Environment | Hot Storage | Warm Storage | Cold Storage (Archive) | Total Retention |
|-------------|-------------|--------------|----------------------|-----------------|
| `development` | 7 days | — | — | 7 days |
| `test` | 3 days | — | — | 3 days |
| `staging` | 14 days | 30 days | — | 30 days |
| `production` | 30 days | 90 days | 7 years (HIPAA) | 7 years |

**Implementation:**

```yaml
# Fly.io log retention (native)
# Fly.io retains logs for 7 days by default.
# For longer retention, configure Vector to ship to an external sink.

# Vector configuration for log shipping
# /etc/vector/vector.toml
[sources.fly_logs]
type = "fly_log_metrics"

[transforms.parse_json]
type = "remap"
inputs = ["fly_logs"]
source = """
  . = parse_json!(.message)
"""

# Hot: Fly.io native (7 days) — already handled
# Warm: Ship to external log aggregator (e.g., Datadog, Grafana Loki, AWS CloudWatch)
[sinks.external_logs]
type = "loki"  # or "datadog_logs", "aws_cloudwatch_logs"
inputs = ["parse_json"]
endpoint = "https://logs-prod-us-central1.grafana.net"
encoding.codec = "json"
labels.environment = "{{environment}}"
labels.app = "deepsynaps-studio"

# Cold (HIPAA): Ship to encrypted S3-compatible storage
[sinks.archive]
type = "aws_s3"
inputs = ["parse_json"]
bucket = "deepsynaps-clinical-logs-archive"
region = "us-east-1"
encoding.codec = "json"
key_prefix = "logs/year=%Y/month=%m/day=%d/"
server_side_encryption = "AES256"
```

### 1.7 Audit Logging for Clinical Operations

**Audit log fields** (in addition to standard JSON fields):

```json
{
  "timestamp": "2025-01-15T09:23:47.123456+00:00",
  "level": "INFO",
  "logger": "app.audit.patient_access",
  "message": "patient data accessed",
  "event_type": "patient_data_access",
  "request_id": "req_abc123def456",
  "actor_id": "user_clinician_01",
  "actor_role": "clinician",
  "resource_type": "patient_record",
  "resource_id_hash": "sha256:a1b2c3...",
  "action": "read",
  "outcome": "success",
  "snapshot_id": "snap_20250115_001",
  "ip_address": "10.0.0.1",
  "user_agent_hash": "sha256:d4e5f6...",
  "session_id": "sess_xyz789",
  "justification": "routine_clinical_review"
}
```

**Important:** The `resource_id_hash` is a SHA-256 hash of the actual patient ID — it allows correlation without exposing the raw identifier. The `ip_address` is the internal Fly.io 6PN address, never the client IP.

### 1.8 Centralized Logging Strategy

**Architecture:**

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  DeepSynaps API │────▶│  Fly.io Logs │────▶│  Vector Agent    │
│  (JSON stdout)  │     │  (7-day hot) │     │  (log router)    │
└─────────────────┘     └──────────────┘     └──────────────────┘
                                                      │
                          ┌───────────────────────────┼──────────────┐
                          ▼                           ▼              ▼
                   ┌─────────────┐           ┌─────────────┐  ┌────────────┐
                   │ Grafana     │           │ S3 Glacier  │  │ Datadog    │
                   │ Loki        │           │ (7-year     │  │ (optional) │
                   │ (90-day)    │           │  HIPAA      │  │            │
                   └─────────────┘           │  archive)   │  └────────────┘
                                             └─────────────┘
```

**Fly.io native log access:**

```bash
# Live logs (hot storage)
fly logs --app deepsynaps-studio

# Recent logs (last N lines)
fly logs --app deepsynaps-studio --tail 500

# Filter by severityfly logs --app deepsynaps-studio 2>&1 | jq 'select(.level == "ERROR")'
```

---

## 2. Metrics Architecture

### 2.1 RED Metrics (Already Implemented)

The existing Prometheus metrics implementation in `app.monitoring.metrics` follows the RED method:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | Counter | `method`, `endpoint`, `status` | Total requests processed |
| `http_request_duration_seconds` | Histogram | `method`, `endpoint` | Request latency distribution |
| `http_requests_in_progress` | Gauge | `method` | Currently active requests |

**Latency buckets** (configured for the API's 200ms SLO):

```python
# Buckets: 5ms, 10ms, 25ms, 50ms, 75ms, 100ms, 250ms, 500ms, 750ms, 1s, 2.5s, 5s, 7.5s, 10s, 30s, 60s
# The 200ms SLO falls between the 100ms and 250ms buckets.
```

### 2.2 Business Metrics to Add

**Active Sessions & Users:**

```python
# metrics.py — add these counters and gauges

from prometheus_client import Counter, Gauge

# --- Session metrics ---
ACTIVE_SESSIONS = Gauge(
    "active_sessions",
    "Number of currently active user sessions",
    labelnames=["actor_role"],
    registry=MONITORING_REGISTRY,
)

# --- Treatment plan metrics ---
TREATMENT_PLANS_CREATED = Counter(
    "treatment_plans_created_total",
    "Total number of treatment plans created",
    labelnames=["plan_type", "actor_role"],
    registry=MONITORING_REGISTRY,
)

TREATMENT_PLANS_COMPLETED = Counter(
    "treatment_plans_completed_total",
    "Total number of treatment plans completed",
    labelnames=["plan_type", "outcome"],
    registry=MONITORING_REGISTRY,
)

# --- Assessment metrics ---
ASSESSMENTS_SUBMITTED = Counter(
    "assessments_submitted_total",
    "Total number of assessments submitted",
    labelnames=["assessment_type", "actor_role"],
    registry=MONITORING_REGISTRY,
)

# --- Protocol generation metrics ---
PROTOCOLS_GENERATED = Counter(
    "protocols_generated_total",
    "Total number of protocols generated by the AI engine",
    labelnames=["modality", "status"],
    registry=MONITORING_REGISTRY,
)

# --- Payment metrics ---
PAYMENT_EVENTS = Counter(
    "payment_events_total",
    "Total number of payment events",
    labelnames=["event_type", "plan_tier"],
    registry=MONITORING_REGISTRY,
)

# --- Wearable sync metrics ---
WEARABLE_SYNC = Counter(
    "wearable_sync_total",
    "Total number of wearable data sync events",
    labelnames=["device_type", "status"],
    registry=MONITORING_REGISTRY,
)
```

### 2.3 Infrastructure Metrics

**Database Connection Pool:**

```python
# metrics.py — pool monitoring

DB_POOL_SIZE = Gauge(
    "db_pool_size",
    "Current database connection pool size",
    labelnames=["pool"],
    registry=MONITORING_REGISTRY,
)

DB_POOL_CHECKED_OUT = Gauge(
    "db_pool_checked_out",
    "Number of checked-out DB connections",
    labelnames=["pool"],
    registry=MONITORING_REGISTRY,
)

DB_POOL_ACQUIRE_SECONDS = Histogram(
    "db_pool_acquire_seconds",
    "Time to acquire a DB connection from the pool",
    labelnames=["pool"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
    registry=MONITORING_REGISTRY,
)
```

**Worker Queue Depth:**

```python
# metrics.py — Celery queue monitoring

WORKER_QUEUE_DEPTH = Gauge(
    "worker_queue_depth",
    "Current depth of Celery task queues",
    labelnames=["queue"],
    registry=MONITORING_REGISTRY,
)

CELERY_TASK_PROCESSED = Counter(
    "celery_task_processed_total",
    "Total number of Celery tasks processed",
    labelnames=["task_name", "status"],
    registry=MONITORING_REGISTRY,
)

CELERY_TASK_DURATION = Histogram(
    "celery_task_duration_seconds",
    "Celery task execution duration",
    labelnames=["task_name"],
    buckets=[0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0, 600.0],
    registry=MONITORING_REGISTRY,
)
```

**Backup Age:**

```python
# metrics.py — backup freshness

BACKUP_AGE_SECONDS = Gauge(
    "backup_age_seconds",
    "Seconds since the last successful database backup",
    registry=MONITORING_REGISTRY,
)
```

### 2.4 Custom Metrics for Clinical Workflows

```python
# metrics.py — clinical workflow metrics

# --- qEEG pipeline ---
QEEG_ANALYSIS_DURATION = Histogram(
    "qeeg_analysis_duration_seconds",
    "qEEG analysis pipeline duration",
    labelnames=["analysis_type", "status"],
    buckets=[0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0, 600.0],
    registry=MONITORING_REGISTRY,
)

# --- MRI pipeline ---
MRI_ANALYSIS_DURATION = Histogram(
    "mri_analysis_duration_seconds",
    "MRI analysis pipeline duration",
    labelnames=["analysis_type", "status"],
    buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0, 600.0],
    registry=MONITORING_REGISTRY,
)

# --- Evidence queries ---
EVIDENCE_QUERIES = Counter(
    "evidence_queries_total",
    "Total evidence database queries",
    labelnames=["query_type", "source"],
    registry=MONITORING_REGISTRY,
)

# --- Knowledge layer ---
KNOWLEDGE_QUERIES = Counter(
    "knowledge_queries_total",
    "Total knowledge layer queries",
    labelnames=["query_type", "source"],
    registry=MONITORING_REGISTRY,
)

KNOWLEDGE_EMBEDDING_LATENCY = Histogram(
    "knowledge_embedding_latency_seconds",
    "Vector embedding generation latency",
    labelnames=["model"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
    registry=MONITORING_REGISTRY,
)

# --- DeepTwin ---
DEEPTWIN_PREDICTIONS = Counter(
    "deeptwin_predictions_total",
    "Total DeepTwin predictions generated",
    labelnames=["prediction_type", "status"],
    registry=MONITORING_REGISTRY,
)

# --- Adverse events ---
ADVERSE_EVENTS = Counter(
    "adverse_events_total",
    "Total adverse events reported",
    labelnames=["severity", "modality"],
    registry=MONITORING_REGISTRY,
)
```

### 2.5 Dashboard Specifications (Grafana)

**Dashboard configuration files are located in:**
`monitoring/deploy/grafana/`

| Dashboard | File | Purpose | Refresh |
|-----------|------|---------|---------|
| API Performance | `dashboard-api.json` | RED metrics, latency percentiles, error rates | 30s |
| Infrastructure | `dashboard-infrastructure.json` | CPU, memory, disk, DB pool, queue depth | 30s |
| Clinical Operations | `dashboard-clinical.json` | qEEG/MRI pipeline health, assessment stats | 30s |

**Dashboard variables (common across all dashboards):**

```json
{
  "templating": {
    "list": [
      {
        "name": "environment",
        "type": "custom",
        "query": "production,staging,development",
        "current": { "text": "production", "value": "production" }
      },
      {
        "name": "endpoint_filter",
        "type": "textbox",
        "current": { "text": ".*", "value": ".*" },
        "label": "Endpoint regex"
      }
    ]
  }
}
```

### 2.6 Alert Thresholds and Routing

**SLO Definitions:**

| SLO | Target | Measurement Window | Burn Rate Alert |
|-----|--------|-------------------|-----------------|
| API Availability | 99.9% | 30 days | Fast burn: 14.4x, Slow burn: 2x |
| API Latency (P95) | 200ms | 5 minutes | Breach: 5 consecutive minutes |
| API Error Rate | < 0.1% (5xx) | 5 minutes | Breach: 2 consecutive minutes |
| Clinical Endpoint Latency (P95) | 500ms | 5 minutes | Breach: 5 consecutive minutes |
| qEEG Analysis Success | > 95% | 15 minutes | Breach: 5 consecutive minutes |
| Backup Freshness | < 24 hours | Continuous | Critical: > 25 hours |

**Prometheus recording rules for SLO monitoring:**

```yaml
# monitoring/deploy/prometheus/recording-rules.yml
groups:
  - name: deepsynaps_slo
    interval: 30s
    rules:
      - record: slo:api_availability_ratio_5m
        expr: |
          1 - (
            sum(rate(http_requests_total{status=~"5xx"}[5m]))
            /
            sum(rate(http_requests_total[5m]))
          )

      - record: slo:api_latency_p95_5m
        expr: |
          histogram_quantile(
            0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
          )

      - record: slo:api_error_budget_burn_1h
        expr: |
          (
            sum(rate(http_requests_total{status=~"5xx"}[1h]))
            /
            sum(rate(http_requests_total[1h]))
          ) / (1 - 0.999)

      - record: slo:api_error_budget_burn_6h
        expr: |
          (
            sum(rate(http_requests_total{status=~"5xx"}[6h]))
            /
            sum(rate(http_requests_total[6h]))
          ) / (1 - 0.999)
```

---

## 3. Alerting Rules

### 3.1 Alert Severity Definitions

| Severity | Response Time | Page On-Call? | Channels |
|----------|--------------|---------------|----------|
| **P0 — Critical** | 5 minutes | Yes — immediate | PagerDuty + Slack #incidents |
| **P1 — High** | 15 minutes | Yes — within 5 min | PagerDuty + Slack #alerts |
| **P2 — Warning** | 30 minutes | No | Slack #monitoring |
| **P3 — Info** | Business hours | No | Slack #monitoring (batched) |

### 3.2 P0 Alerts: Service Down, Data Loss, PHI Exposure

```yaml
# monitoring/deploy/alertmanager/alerts-p0.yml
groups:
  - name: p0_critical
    interval: 15s
    rules:
      - alert: ServiceDown
        expr: |
          up{job="deepsynaps-api"} == 0
        for: 1m
        labels:
          severity: critical
          priority: p0
          alertgroup: system
          team: sre
        annotations:
          summary: "DeepSynaps API is DOWN in {{ $labels.env }}"
          description: "The API instance {{ $labels.instance }} has been unreachable for more than 1 minute. All clinical operations are halted."
          runbook_url: "https://docs.deepsynaps.io/runbooks/alerting-runbook.md#service-down"
          dashboard_url: "https://grafana.deepsynaps.io/d/infrastructure?var-instance={{ $labels.instance }}"

      - alert: DatabasePoolExhausted
        expr: |
          (db_pool_checked_out / db_pool_size{pool="default"}) >= 1.0
        for: 1m
        labels:
          severity: critical
          priority: p0
          alertgroup: system
          team: sre
        annotations:
          summary: "DB connection pool EXHAUSTED in {{ $labels.env }}"
          description: "All database connections are checked out. New requests cannot obtain a connection. The API is effectively down."
          runbook_url: "https://docs.deepsynaps.io/runbooks/alerting-runbook.md#db-pool-exhausted"

      - alert: BackupAgeCritical
        expr: |
          backup_age_seconds > 90000
        for: 5m
        labels:
          severity: critical
          priority: p0
          alertgroup: clinical
          team: sre
        annotations:
          summary: "Database backup is {{ $value | humanizeDuration }} old"
          description: "Last successful backup was > 25 hours ago. Data loss window is unacceptable for a clinical system."
          runbook_url: "https://docs.deepsynaps.io/runbooks/alerting-runbook.md#backup-age-critical"

      - alert: PrivilegeEscalationDetected
        expr: |
          sum(rate(security_events_total{event_type="privilege_escalation"}[5m])) by (env) > 0
        for: 0s
        labels:
          severity: critical
          priority: p0
          alertgroup: security
          team: security
        annotations:
          summary: "PRIVILEGE ESCALATION detected in {{ $labels.env }}"
          description: "A user is attempting to access clinical functions beyond their authorization level. Immediate investigation required."
          runbook_url: "https://docs.deepsynaps.io/runbooks/alerting-runbook.md#privilege-escalation"

      - alert: ExcessivePatientDataExport
        expr: |
          sum(rate(patient_data_access_total{operation_type="export"}[15m])) by (env) > 0.1
        for: 5m
        labels:
          severity: critical
          priority: p0
          alertgroup: security
          team: security
        annotations:
          summary: "High rate of patient data exports in {{ $labels.env }}"
          description: "Patient data exports at {{ $value | humanize }}/s. Possible bulk data exfiltration attempt."
          runbook_url: "https://docs.deepsynaps.io/runbooks/alerting-runbook.md#excessive-patient-data-export"
```

### 3.3 P1 Alerts: Error Rate, Latency, DB Failures

```yaml
# monitoring/deploy/alertmanager/alerts-p1.yml
groups:
  - name: p1_high
    interval: 30s
    rules:
      - alert: APIErrorRateHigh
        expr: |
          sum(rate(http_requests_total{status=~"5xx"}[5m])) by (env)
          /
          sum(rate(http_requests_total[5m])) by (env)
          > 0.05
        for: 2m
        labels:
          severity: critical
          priority: p1
          alertgroup: system
          team: sre
        annotations:
          summary: "API 5xx error rate is {{ $value | humanizePercentage }}"
          description: "Error rate exceeds 5% for 2+ minutes. Clinical operations may be degraded."

      - alert: APILatencyP95High
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
          ) > 2.0
        for: 5m
        labels:
          severity: critical
          priority: p1
          alertgroup: system
          team: sre
        annotations:
          summary: "API P95 latency is {{ $value }}s"
          description: "P95 latency exceeds 2s for 5+ minutes. User experience is severely degraded."

      - alert: ClinicalEndpointHighErrorRate
        expr: |
          sum(rate(http_errors_total{error_type="clinical"}[5m])) by (endpoint, env)
          /
          sum(rate(http_requests_total[5m])) by (endpoint, env)
          > 0.05
        for: 2m
        labels:
          severity: critical
          priority: p1
          alertgroup: clinical
          team: clinical-engineering
        annotations:
          summary: "Clinical endpoint {{ $labels.endpoint }} error rate is {{ $value | humanizePercentage }}"
          description: "Clinical endpoint returning errors at > 5%. Patient treatments may be affected."

      - alert: QEEGAnalysisHighFailureRate
        expr: |
          sum(rate(qeeg_analysis_duration_seconds_count{status="error"}[15m])) by (analysis_type, env)
          /
          sum(rate(qeeg_analysis_duration_seconds_count[15m])) by (analysis_type, env)
          > 0.05
        for: 5m
        labels:
          severity: critical
          priority: p1
          alertgroup: clinical
          team: neuroimaging
        annotations:
          summary: "qEEG {{ $labels.analysis_type }} failure rate is {{ $value | humanizePercentage }}"
          description: "qEEG pipeline has > 5% failure rate. Clinicians may be blocked from protocol generation."

      - alert: DBConnectionSlow
        expr: |
          histogram_quantile(0.95, sum(rate(db_pool_acquire_seconds_bucket[5m])) by (le)) > 0.5
        for: 5m
        labels:
          severity: warning
          priority: p1
          alertgroup: system
          team: sre
        annotations:
          summary: "DB connection acquisition P95 is {{ $value }}s"
          description: "Acquiring a DB connection takes > 500ms (P95). Pool may be undersized or connections leaking."
```

### 3.4 P2 Alerts: Queue Depth, Memory, Disk

```yaml
# monitoring/deploy/alertmanager/alerts-p2.yml
groups:
  - name: p2_warning
    interval: 30s
    rules:
      - alert: WorkerQueueDepthHigh
        expr: |
          worker_queue_depth > 500
        for: 5m
        labels:
          severity: warning
          priority: p2
          alertgroup: system
          team: sre
        annotations:
          summary: "Worker queue depth is {{ $value }}"
          description: "Celery queue has > 500 pending tasks for 5+ minutes. Workers may be falling behind."

      - alert: MemoryUsageHigh
        expr: |
          (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)
          /
          node_memory_MemTotal_bytes * 100 > 80
        for: 5m
        labels:
          severity: warning
          priority: p2
          alertgroup: system
          team: sre
        annotations:
          summary: "Memory usage is {{ $value | humanize }}%"
          description: "Memory utilization above 80% for 5+ minutes. Consider scaling the Fly.io machine."

      - alert: DiskUsageHigh
        expr: |
          100 - ((node_filesystem_avail_bytes{mountpoint="/data"} * 100)
          /
          node_filesystem_size_bytes{mountpoint="/data"}) > 85
        for: 5m
        labels:
          severity: warning
          priority: p2
          alertgroup: system
          team: sre
        annotations:
          summary: "Disk usage is {{ $value | humanize }}%"
          description: "Disk utilization above 85%. Evidence DB and media uploads may fail."

      - alert: FlyConnectionLimitApproaching
        expr: |
          sum(http_requests_in_progress) by (env) > 18
        for: 5m
        labels:
          severity: warning
          priority: p2
          alertgroup: system
          team: sre
        annotations:
          summary: "Active connections approaching Fly.io limit"
          description: "Active connections ({{ $value }}) approaching the Fly.io soft limit of 20."

      - alert: SSLCertificateExpiring30d
        expr: |
          ssl_certificate_expiry_seconds / 86400 < 30
        for: 1h
        labels:
          severity: warning
          priority: p2
          alertgroup: system
          team: sre
        annotations:
          summary: "SSL certificate expires in {{ $value | humanize }} days"
          description: "SSL certificate expires in {{ $value | humanize }} days. Schedule renewal."
```

### 3.5 P3 Alerts: Slow Requests, Non-Critical Failures

```yaml
# monitoring/deploy/alertmanager/alerts-p3.yml
groups:
  - name: p3_info
    interval: 30s
    rules:
      - alert: SlowRequestDetected
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket{status!~"5xx"}[5m])) by (le)
          ) > 0.5
        for: 10m
        labels:
          severity: info
          priority: p3
          alertgroup: system
          team: sre
        annotations:
          summary: "Slow requests detected (P99 > 500ms)"
          description: "Non-error requests taking > 500ms at P99 for 10+ minutes. Review for optimization."

      - alert: RateLimitFrequent
        expr: |
          sum(rate(security_events_total{event_type="rate_limit_hit"}[5m])) by (env) > 1
        for: 10m
        labels:
          severity: info
          priority: p3
          alertgroup: system
          team: sre
        annotations:
          summary: "Rate limiting active ({{ $value | humanize }}/s)"
          description: "Rate limit events occurring. Clients may need backoff tuning."

      - alert: EvidenceDatabaseStale
        expr: |
          sum(rate(evidence_queries_total[24h])) by (env) == 0
        for: 1h
        labels:
          severity: info
          priority: p3
          alertgroup: clinical
          team: data-platform
        annotations:
          summary: "Evidence database appears stale"
          description: "No evidence queries in 24 hours. Evidence DB may be unreachable."
```

### 3.6 Notification Channels per Severity

**AlertManager routing configuration** (see full config in `monitoring/deploy/alertmanager/alertmanager.yml`):

```yaml
route:
  group_by: ['alertgroup', 'env', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'slack-monitoring'

  routes:
    # P0 / P1 Critical → PagerDuty + Slack
    - matchers:
        - 'severity = critical'
      receiver: 'pagerduty-primary'
      group_wait: 0s
      continue: true

    # P2 Warning → Slack only
    - matchers:
        - 'severity = warning'
      receiver: 'slack-alerts'
      continue: false

    # P3 Info → Slack #monitoring (batched)
    - matchers:
        - 'severity = info'
      receiver: 'slack-monitoring'
      group_wait: 2m
      repeat_interval: 24h
      continue: false
```

**Channel configuration:**

| Severity | PagerDuty | Slack #incidents | Slack #alerts | Slack #monitoring | Email |
|----------|-----------|-----------------|---------------|-------------------|-------|
| P0 | Immediate | Instant | — | — | Yes |
| P1 | Within 5 min | — | Instant | — | Yes |
| P2 | No | — | — | Instant | No |
| P3 | No | — | — | Batched 24h | No |

---

## 4. Request Tracing

### 4.1 Request ID Propagation

The request ID is the primary correlation mechanism across all services:

**Header:** `X-Request-ID` (UUIDv4 format)

**Propagation chain:**

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│   Client    │────▶│  Fly Proxy   │────▶│   FastAPI API    │────▶│   Celery      │
│             │     │              │     │                  │     │   Worker      │
│ X-Request-  │     │ Preserve or  │     │ request.state.   │     │ task header   │
│ ID: abc123  │     │ generate     │     │ request_id       │     │ x-request-id  │
└─────────────┘     └──────────────┘     └──────────────────┘     └───────────────┘
                                                │
                                                ▼
                                         ┌───────────────┐
                                         │   Database    │
                                         │  (SQLite/     │
                                         │   PostgreSQL) │
                                         └───────────────┘
```

**Implementation:**

```python
# app/middleware/request_id.py
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class RequestIdMiddleware(BaseHTTPMiddleware):
    """Inject and propagate X-Request-ID across all downstream services."""
    
    async def dispatch(self, request: Request, call_next):
        request_id = (
            request.headers.get("X-Request-ID") 
            or f"req_{uuid.uuid4().hex[:20]}"
        )
        request.state.request_id = request_id
        
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
```

### 4.2 OpenTelemetry Integration (Optional)

OpenTelemetry is configured as an optional dependency for advanced distributed tracing:

```python
# app/tracing_setup.py (optional — install opentelemetry packages)
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.celery import CeleryInstrumentor

def init_tracing(service_name: str, otlp_endpoint: str | None = None):
    """Initialize OpenTelemetry tracing. Disabled if OTLP endpoint not configured."""
    if not otlp_endpoint:
        return
    
    provider = TracerProvider()
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    
    # Instrument frameworks
    FastAPIInstrumentor.instrument_app(app)
    SQLAlchemyInstrumentor.instrument()
    CeleryInstrumentor.instrument()
```

**Configuration:**

```bash
# Set in fly secrets or .env
OTLP_ENDPOINT=https://tempo.deepsynaps.io:4317
OTEL_SERVICE_NAME=deepsynaps-api
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```

### 4.3 Span Creation for Clinical Operations

When OpenTelemetry is enabled, clinical operations create detailed spans:

```python
# Example: qEEG analysis pipeline with spans
from opentelemetry import trace

tracer = trace.get_tracer("deepsynaps.qeeg")

async def run_qeeg_analysis(patient_id_hash: str, edf_data: bytes):
    with tracer.start_as_current_span("qeeg.full_analysis") as span:
        span.set_attribute("patient.id_hash", patient_id_hash)
        span.set_attribute("edf.size_bytes", len(edf_data))
        
        # Step 1: Signal quality check
        with tracer.start_as_current_span("qeeg.signal_quality") as sq_span:
            quality_score = check_signal_quality(edf_data)
            sq_span.set_attribute("quality.score", quality_score)
            if quality_score < 0.5:
                sq_span.set_status(StatusCode.ERROR, "Signal quality too low")
                raise SignalQualityError()
        
        # Step 2: Spectral analysis
        with tracer.start_as_current_span("qeeg.spectral_analysis") as sp_span:
            spectral_result = await run_spectral_analysis(edf_data)
            sp_span.set_attribute("spectral.bands.count", len(spectral_result.bands))
        
        # Step 3: Protocol recommendation
        with tracer.start_as_current_span("qeeg.protocol_recommendation") as pr_span:
            protocol = await generate_protocol(spectral_result)
            pr_span.set_attribute("protocol.modality", protocol.modality)
            pr_span.set_attribute("protocol.confidence", protocol.confidence)
        
        span.set_attribute("analysis.duration_ms", total_duration)
        return protocol
```

### 4.4 Distributed Tracing Across Workers

Celery tasks participate in the distributed trace via context propagation:

```python
# app/jobs/tracing.py
from opentelemetry import trace
from opentelemetry.propagate import inject, extract
from celery import Task

tracer = trace.get_tracer("deepsynaps.worker")

class TracedTask(Task):
    """Celery task that participates in distributed tracing."""
    
    def apply_async(self, *args, **kwargs):
        # Inject current trace context into task headers
        headers = kwargs.setdefault("headers", {})
        carrier = {}
        inject(carrier)
        headers.update(carrier)
        return super().apply_async(*args, **kwargs)
    
    def __call__(self, *args, **kwargs):
        # Extract trace context from task headers
        headers = self.request.headers or {}
        context = extract(headers)
        
        with tracer.start_as_current_span(
            f"celery.task.{self.name}",
            context=context,
        ) as span:
            span.set_attribute("celery.task_id", self.request.id)
            span.set_attribute("celery.queue", self.request.delivery_info.get("queue", "default"))
            return self.run(*args, **kwargs)
```

---

## 5. Clinical Audit Logging

### 5.1 Patient Data Access Logging (HIPAA Requirement)

**HIPAA Requirement:** 45 CFR 164.312(b) — Audit Controls. All access to electronic protected health information (ePHI) must be recorded.

**Implementation:**

```python
# app/audit/patient_access.py
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json

@dataclass
class PatientAccessAuditEvent:
    """Immutable audit event for patient data access."""
    timestamp: str
    event_type: str           # patient_data_access
    actor_id_hash: str        # SHA-256 hash of actor ID
    actor_role: str           # clinician, patient, admin, system
    patient_id_hash: str      # SHA-256 hash of patient ID (never raw)
    resource_type: str        # patient_record, assessment, protocol, etc.
    action: str               # read, create, update, delete, export
    outcome: str              # success, denied, error
    endpoint: str             # Route template
    request_id: str
    session_id_hash: str      # SHA-256 hash of session ID
    ip_address_hash: str      # SHA-256 hash of IP (internal 6PN)
    user_agent_hash: str      # SHA-256 hash of user agent
    justification: str | None  # Reason for access (clinical review, treatment, etc.)
    
    def to_json(self) -> str:
        return json.dumps({
            "timestamp": self.timestamp,
            "event_type": self.event_type,
            "actor_id_hash": self.actor_id_hash,
            "actor_role": self.actor_role,
            "patient_id_hash": self.patient_id_hash,
            "resource_type": self.resource_type,
            "action": self.action,
            "outcome": self.outcome,
            "endpoint": self.endpoint,
            "request_id": self.request_id,
            "session_id_hash": self.session_id_hash,
            "ip_address_hash": self.ip_address_hash,
            "user_agent_hash": self.user_agent_hash,
            "justification": self.justification,
        }, ensure_ascii=True)


def _hash_value(value: str) -> str:
    """SHA-256 hash a value for audit logging."""
    return f"sha256:{hashlib.sha256(value.encode()).hexdigest()[:16]}"


async def log_patient_data_access(
    patient_id: str,
    action: str,
    resource_type: str,
    request: Request,
    outcome: str = "success",
    justification: str | None = None,
) -> None:
    """Log a patient data access event. Never logs the raw patient_id."""
    event = PatientAccessAuditEvent(
        timestamp=datetime.now(timezone.utc).isoformat(),
        event_type="patient_data_access",
        actor_id_hash=_hash_value(getattr(request.state, "actor_id", "anonymous")),
        actor_role=getattr(request.state, "role", "unknown"),
        patient_id_hash=_hash_value(patient_id),  # NEVER log raw patient_id
        resource_type=resource_type,
        action=action,
        outcome=outcome,
        endpoint=request.scope.get("route", {}).path if request.scope.get("route") else request.url.path,
        request_id=getattr(request.state, "request_id", "unknown"),
        session_id_hash=_hash_value(request.cookies.get("session", "none")),
        ip_address_hash=_hash_value(request.client.host if request.client else "unknown"),
        user_agent_hash=_hash_value(request.headers.get("User-Agent", "unknown")),
        justification=justification,
    )
    
    # Log to dedicated audit logger
    audit_logger.info(event.to_json())
    
    # Also emit metric
    record_patient_data_access(action, getattr(request.state, "role", "unknown"))
```

### 5.2 Medication Change Logging

```python
# app/audit/medication.py
async def log_medication_change(
    patient_id: str,
    medication_name: str,       # Generic name only, never brand
    change_type: str,            # added, removed, dosage_changed, discontinued
    previous_dosage: str | None,
    new_dosage: str | None,
    prescribed_by: str,
    request: Request,
) -> None:
    """Log medication changes for audit trail."""
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "medication_change",
        "patient_id_hash": _hash_value(patient_id),
        "medication_name": medication_name,  # Generic name only
        "change_type": change_type,
        "previous_dosage": previous_dosage,
        "new_dosage": new_dosage,
        "prescribed_by_hash": _hash_value(prescribed_by),
        "request_id": getattr(request.state, "request_id", "unknown"),
    }
    audit_logger.info(json.dumps(event, ensure_ascii=True))
```

### 5.3 Consent Management Logging

```python
# app/audit/consent.py
async def log_consent_event(
    patient_id: str,
    consent_type: str,           # treatment, data_sharing, research, withdrawal
    action: str,                 # granted, revoked, expired, renewed
    consent_version: str,
    request: Request,
) -> None:
    """Log consent management events. Critical for HIPAA and GDPR compliance."""
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "consent_management",
        "patient_id_hash": _hash_value(patient_id),
        "consent_type": consent_type,
        "action": action,
        "consent_version": consent_version,
        "request_id": getattr(request.state, "request_id", "unknown"),
    }
    audit_logger.info(json.dumps(event, ensure_ascii=True))
```

### 5.4 Data Export/Download Logging

```python
# app/audit/export.py
async def log_data_export(
    patient_id: str,
    export_format: str,          # pdf, csv, json, hl7, fhir
    export_scope: str,           # full_record, assessments, protocols, imaging
    record_count: int,
    request: Request,
) -> None:
    """Log all data exports — critical for detecting data exfiltration."""
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "data_export",
        "patient_id_hash": _hash_value(patient_id),
        "export_format": export_format,
        "export_scope": export_scope,
        "record_count": record_count,
        "actor_id_hash": _hash_value(getattr(request.state, "actor_id", "anonymous")),
        "actor_role": getattr(request.state, "role", "unknown"),
        "request_id": getattr(request.state, "request_id", "unknown"),
    }
    audit_logger.info(json.dumps(event, ensure_ascii=True))
    
    # Emit metric for alerting
    record_patient_data_access("export", getattr(request.state, "role", "unknown"))
```

### 5.5 Admin Action Logging

```python
# app/audit/admin.py
async def log_admin_action(
    action: str,                 # user_created, role_changed, settings_modified, data_purged
    target_resource: str,        # user, patient, system_setting
    target_id_hash: str,
    previous_state: dict | None,
    new_state: dict | None,
    request: Request,
) -> None:
    """Log all administrative actions for accountability."""
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "admin_action",
        "action": action,
        "target_resource": target_resource,
        "target_id_hash": target_id_hash,
        "previous_state": previous_state,
        "new_state": new_state,
        "actor_id_hash": _hash_value(getattr(request.state, "actor_id", "anonymous")),
        "request_id": getattr(request.state, "request_id", "unknown"),
    }
    audit_logger.info(json.dumps(event, ensure_ascii=True))
```

### 5.6 Log Retention for Compliance

| Regulation | Requirement | Implementation |
|------------|-------------|----------------|
| **HIPAA** | 6 years minimum | Archive to encrypted S3 for 7 years |
| **GDPR** | As long as necessary for purpose | Same as HIPAA; data subject access requests logged |
| **21 CFR Part 11** (if applicable) | Tamper-evident, timestamped | SHA-256 hashes + immutable storage |
| **State laws** | Varies (some require 7+ years) | 7-year retention covers all states |

**Retention schedule:**

```yaml
# Log lifecycle
hot:      Fly.io native logs          → 7 days
warm:     Grafana Loki                → 90 days
 cold:    S3 Standard-IA              → 1 year
 archive: S3 Glacier Deep Archive     → 7 years
```

**Implementation:**

```bash
# Automated archival (run nightly via cron or GitHub Actions)
#!/bin/bash
# scripts/archive_audit_logs.sh
set -euo pipefail

BUCKET="deepsynaps-clinical-logs-archive"
DATE=$(date +%Y/%m/%d)

# Export from Loki (warm storage) to S3
# This is a placeholder — replace with actual Loki export mechanism
# or use Vector's S3 sink for real-time archival

echo "Archiving audit logs for $DATE to s3://$BUCKET/audit/$DATE/"
# aws s3 sync ... (actual implementation depends on log infra)
```

---

## 6. Dashboard Specifications

### 6.1 System Health Dashboard

**Dashboard:** `dashboard-infrastructure.json`  
**Purpose:** Overall system health — CPU, memory, disk, network, Fly.io status

**Panels:**

| Row | Panel | Query | Threshold |
|-----|-------|-------|-----------|
| 1 | CPU Usage % | `100 - avg(rate(node_cpu_seconds_total{mode="idle"}[2m])) by (instance) * 100` | Warning: 80%, Critical: 95% |
| 1 | Memory Usage % | `(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100` | Warning: 85%, Critical: 95% |
| 1 | Disk Usage % | `100 - (node_filesystem_avail_bytes{mountpoint="/data"} * 100 / node_filesystem_size_bytes{mountpoint="/data"})` | Warning: 85%, Critical: 95% |
| 2 | Fly.io Machines Healthy | `sum(up{job="deepsynaps-api"}) by (env)` | Alert if < 1 |
| 2 | Active Connections | `sum(http_requests_in_progress) by (env)` | Alert if > 18 |
| 2 | SSL Certificate Days Left | `ssl_certificate_expiry_seconds / 86400` | Alert if < 30 |
| 3 | DB Pool Utilization | `db_pool_checked_out / db_pool_size{pool="default"}` | Warning: 75%, Critical: 100% |
| 3 | DB Connection Acquire P95 | `histogram_quantile(0.95, rate(db_pool_acquire_seconds_bucket[5m]))` | Warning: 500ms |
| 4 | Worker Queue Depth | `worker_queue_depth` | Warning: 500, Critical: 1000 |
| 4 | Celery Tasks Processed/sec | `sum(rate(celery_task_processed_total[5m])) by (task_name)` | Baseline tracking |
| 5 | Backup Age | `backup_age_seconds` | Warning: 20h, Critical: 25h |

### 6.2 API Performance Dashboard

**Dashboard:** `dashboard-api.json`  
**Purpose:** RED metrics — request rate, errors, duration

**Panels:**

| Row | Panel | Query |
|-----|-------|-------|
| 1 | Request Rate (rps) | `sum(rate(http_requests_total{env="$environment",endpoint=~"$endpoint_filter"}[5m])) by (endpoint)` |
| 1 | Request Rate (total) | `sum(rate(http_requests_total{env="$environment"}[5m]))` |
| 1 | Error Rate % | `sum(rate(http_requests_total{status=~"5xx",env="$environment"}[5m])) / sum(rate(http_requests_total{env="$environment"}[5m])) * 100` |
| 2 | Latency P50 | `histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket{env="$environment"}[5m])) by (le))` |
| 2 | Latency P95 | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{env="$environment"}[5m])) by (le))` |
| 2 | Latency P99 | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{env="$environment"}[5m])) by (le))` |
| 3 | Error Rate by Type | `sum(rate(http_errors_total{env="$environment"}[5m])) by (error_type)` |
| 3 | Security Events | `sum(rate(security_events_total{env="$environment"}[5m])) by (event_type)` |
| 4 | Top 10 Slowest Endpoints | `topk(10, histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{env="$environment"}[5m])) by (endpoint, le)))` |
| 4 | Top 10 Error-Prone Endpoints | `topk(10, sum(rate(http_errors_total{env="$environment"}[5m])) by (endpoint))` |

### 6.3 Clinical Operations Dashboard

**Dashboard:** `dashboard-clinical.json`  
**Purpose:** Clinical pipeline health, patient data access patterns, qEEG/MRI status

**Panels:**

| Row | Panel | Query |
|-----|-------|-------|
| 1 | Clinical Operations Rate | `sum(rate(clinical_operations_total{env="$environment"}[5m])) by (operation)` |
| 1 | Patient Data Access Rate | `sum(rate(patient_data_access_total{env="$environment"}[5m])) by (operation_type)` |
| 1 | Active Sessions by Role | `active_sessions{env="$environment"}` |
| 2 | qEEG Analysis Duration P95 | `histogram_quantile(0.95, sum(rate(qeeg_analysis_duration_seconds_bucket{env="$environment"}[5m])) by (analysis_type, le))` |
| 2 | qEEG Analysis Success Rate | `sum(rate(qeeg_analysis_duration_seconds_count{status="success",env="$environment"}[15m])) / sum(rate(qeeg_analysis_duration_seconds_count{env="$environment"}[15m]))` |
| 2 | qEEG Analysis by Type | `sum(rate(qeeg_analysis_duration_seconds_count{env="$environment"}[5m])) by (analysis_type)` |
| 3 | MRI Analysis Duration P95 | `histogram_quantile(0.95, sum(rate(mri_analysis_duration_seconds_bucket{env="$environment"}[5m])) by (le))` |
| 3 | MRI Analysis Success Rate | `sum(rate(mri_analysis_duration_seconds_count{status="success",env="$environment"}[15m])) / sum(rate(mri_analysis_duration_seconds_count{env="$environment"}[15m]))` |
| 4 | Evidence Query Rate | `sum(rate(evidence_queries_total{env="$environment"}[5m])) by (query_type)` |
| 4 | Evidence Query Latency P95 | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{endpoint=~"/api/v1/evidence.*",env="$environment"}[5m])) by (le))` |
| 5 | Adverse Events Rate | `sum(rate(adverse_events_total{env="$environment"}[5m])) by (severity)` |
| 5 | Assessment Submission Rate | `sum(rate(assessments_submitted_total{env="$environment"}[5m])) by (assessment_type)` |

### 6.4 Knowledge Layer Dashboard

**Dashboard:** `dashboard-knowledge.json` (to be created)  
**Purpose:** Knowledge layer health, embedding performance, query patterns

**Panels:**

| Row | Panel | Query |
|-----|-------|-------|
| 1 | Knowledge Query Rate | `sum(rate(knowledge_queries_total[5m])) by (query_type)` |
| 1 | Embedding Latency P95 | `histogram_quantile(0.95, sum(rate(knowledge_embedding_latency_seconds_bucket[5m])) by (le))` |
| 2 | DeepTwin Prediction Rate | `sum(rate(deeptwin_predictions_total[5m])) by (prediction_type)` |
| 2 | DeepTwin Prediction Success Rate | `sum(rate(deeptwin_predictions_total{status="success"}[15m])) / sum(rate(deeptwin_predictions_total[15m]))` |
| 3 | Protocol Generation Rate | `sum(rate(protocols_generated_total[5m])) by (modality)` |
| 3 | Protocol Generation Success Rate | `sum(rate(protocols_generated_total{status="success"}[15m])) / sum(rate(protocols_generated_total[15m]))` |
| 4 | Treatment Plans Created | `sum(rate(treatment_plans_created_total[5m])) by (plan_type)` |
| 4 | Treatment Plans Completed | `sum(rate(treatment_plans_completed_total[5m])) by (outcome)` |

### 6.5 Error/Alert Dashboard

**Dashboard:** `dashboard-alerts.json` (to be created)  
**Purpose:** Real-time alert status, error trends, incident correlation

**Panels:**

| Row | Panel | Query |
|-----|-------|-------|
| 1 | Firing Alerts by Severity | `ALERTS{alertstate="firing"}` grouped by severity |
| 1 | Pending Alerts | `ALERTS{alertstate="pending"}` |
| 2 | 5xx Error Rate Trend | `sum(rate(http_requests_total{status=~"5xx"}[5m])) / sum(rate(http_requests_total[5m]))` |
| 2 | Error Rate by Type | `sum(rate(http_errors_total[5m])) by (error_type)` |
| 3 | Auth Failures Rate | `sum(rate(security_events_total{event_type="failed_auth"}[5m]))` |
| 3 | Rate Limit Hits | `sum(rate(security_events_total{event_type="rate_limit_hit"}[5m]))` |
| 4 | Clinical Error Rate | `sum(rate(http_errors_total{error_type="clinical"}[5m])) by (endpoint)` |
| 4 | Sentry Event Rate | `sentry_events_total[5m]` (if using Sentry exporter) |

---

## 7. Sentry Configuration

### 7.1 Error Sampling Rates per Environment

| Environment | Traces Sample Rate | Error Sample Rate | Profiles Sample Rate |
|-------------|-------------------|-------------------|---------------------|
| `development` | 0% (disabled) | 0% (disabled) | 0% |
| `test` | 0% (disabled) | 0% (disabled) | 0% |
| `staging` | 50% | 100% | 10% |
| `production` | 10% | 100% | 1% |

**Current configuration** (from `app/sentry_setup.py`):

```python
sentry_sdk.init(
    dsn=dsn,
    environment=environment,
    integrations=[
        FastApiIntegration(transaction_style="endpoint"),
        SqlAlchemyIntegration(),
        LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
    ],
    traces_sample_rate=0.1,      # 10% of transactions in production
    send_default_pii=False,       # NEVER send PII to Sentry
    before_send=_before_send,     # PHI scrubbing hook (see below)
)
```

**Recommended per-environment configuration:**

```python
# app/sentry_setup.py — enhanced
SENTRY_CONFIG = {
    "development": {
        "traces_sample_rate": 0.0,
        "profiles_sample_rate": 0.0,
        "event_level": logging.WARNING,
    },
    "test": {
        "traces_sample_rate": 0.0,
        "profiles_sample_rate": 0.0,
        "event_level": logging.ERROR,
    },
    "staging": {
        "traces_sample_rate": 0.5,
        "profiles_sample_rate": 0.1,
        "event_level": logging.INFO,
    },
    "production": {
        "traces_sample_rate": 0.1,
        "profiles_sample_rate": 0.01,
        "event_level": logging.ERROR,
    },
}
```

### 7.2 PHI Scrubbing Rules

The `before_send` hook in `app/sentry_setup.py` delegates to `app.services.log_sanitizer.scrub_sentry_event`. This is **critical for HIPAA compliance** — it ensures no PHI leaves the application process.

**Scrubbing rules** (covered by unit tests in `tests/test_sentry_before_send.py`):

| Rule | Action | Test Coverage |
|------|--------|---------------|
| Authorization header | Strip completely (`Authorization: [REDACTED]`) | `test_authorization_header_stripped` |
| Cookie header | Strip completely | `test_cookie_and_set_cookie_stripped` |
| X-Demo-Token header | Strip completely | `test_x_demo_token_stripped` |
| Case-insensitive headers | `authorization` also stripped | `test_lowercase_authorization_header_also_stripped` |
| Patient IDs in URL | Replace with `{id}` | `test_patient_id_in_url_redacted` |
| UUIDs in URL | Replace with `{id}` | `test_uuid_in_url_redacted` |
| Path field | Also redacted | `test_path_field_also_redacted` |
| JSON body on patient routes | Redact entirely (replace with `[REDACTED]`) | `test_json_body_dropped_on_patient_scoped_route` |
| JSON body on DeepTwin routes | Redact entirely | `test_json_body_dropped_on_deeptwin_route` |
| JSON body on auth routes | Preserved (no PHI expected) | `test_json_body_preserved_on_auth_register` |
| Non-JSON body | Preserved (handled by size limits) | `test_non_json_body_preserved` |

**Sensitive route prefixes that trigger body redaction:**

```python
_PHI_ROUTE_PREFIXES = (
    "/api/v1/patients",
    "/api/v1/protocols",
    "/api/v1/assessments",
    "/api/v1/treatment",
    "/api/v1/qeeg",
    "/api/v1/mri",
    "/api/v1/adverse-events",
    "/api/v1/outcomes",
    "/api/v1/consent",
    "/api/v1/biometrics",
    "/api/v1/deeptwin",
    "/api/v1/medications",
    "/api/v1/genetics",
)
```

### 7.3 Release Tracking

Sentry release tracking is configured via environment variables:

```bash
# Set during deployment (fly deploy sets these automatically or use secrets)
SENTRY_RELEASE=$(git rev-parse --short HEAD)
SENTRY_ENVIRONMENT=production

# Or configure in the app
sentry_sdk.init(
    # ... other config ...
    release=os.getenv("SENTRY_RELEASE", "unknown"),
)
```

**Release tracking workflow:**

```bash
# Before deployment, set the release
export SENTRY_RELEASE=$(git rev-parse --short HEAD)
fly secrets set SENTRY_RELEASE="$SENTRY_RELEASE" --app deepsynaps-studio

# Deploy
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
  --app deepsynaps-studio

# Verify in Sentry: Releases → deepsynaps-studio → should show the new release
```

### 7.4 Alert Rules (Sentry)

Configure these in the Sentry web UI at https://sentry.io/organizations/your-org/alerts/rules/

| Rule Name | Condition | Action | Environment |
|-----------|-----------|--------|-------------|
| **New Unhandled Error** | A new issue is created | Slack #errors + Email team | All |
| **High Error Volume** | > 100 events in 5 minutes | PagerDuty (P2) + Slack #incidents | production |
| **Regression** | A resolved issue reappears | Slack #errors + Email team | All |
| **User Feedback** | New user feedback submitted | Slack #user-feedback | All |
| **Clinical Error Spike** | > 10 `clinical` tagged errors in 5 min | PagerDuty (P1) + Slack #clinical-alerts | production |
| **Security Event** | Any error with `security` tag | PagerDuty (P0) + Slack #security | production |
| **Performance Regression** | P95 latency > 2s for 10 min | Slack #performance | production |

**Tag rules in Sentry:**

```python
# In application code, add context to Sentry events:
with sentry_sdk.push_scope() as scope:
    scope.set_tag("error_type", "clinical")
    scope.set_tag("endpoint", "/api/v1/patients/{patient_id}")
    scope.set_tag("clinical_operation", "protocol_generate")
    scope.set_level("error")
    sentry_sdk.capture_exception(e)
```

---

## 8. Environment-Specific Configurations

### 8.1 Development

```yaml
# .env.development
DEEPSYNAPS_APP_ENV=development
DEEPSYNAPS_LOG_LEVEL=DEBUG
SENTRY_DSN=  # Empty — Sentry disabled
OTLP_ENDPOINT=  # Empty — tracing disabled
```

- All DEBUG logs visible
- Sentry disabled
- Tracing disabled
- Audit logging to stdout only
- Metrics available at `/metrics` but not scraped

### 8.2 Test

```yaml
# .env.test
DEEPSYNAPS_APP_ENV=test
DEEPSYNAPS_LOG_LEVEL=WARNING
SENTRY_DSN=  # Empty
```

- Only WARNING and above logged (reduce noise in test output)
- All metrics reset between test runs
- Audit events validated via test assertions, not persisted

### 8.3 Staging

```yaml
# .env.staging
DEEPSYNAPS_APP_ENV=staging
DEEPSYNAPS_LOG_LEVEL=INFO
SENTRY_DSN=https://staging-dsn@sentry.io/PROJECT
OTLP_ENDPOINT=https://tempo-staging.deepsynaps.io:4317
```

- Full observability stack enabled
- Sentry: 50% trace sampling, 100% error sampling
- Tracing: OTLP endpoint enabled
- Prometheus scraping from `deepsynaps-staging.internal:8080`
- AlertManager routing to `#staging-alerts` Slack channel (no PagerDuty)

### 8.4 Production

```yaml
# fly.toml (env section)
DEEPSYNAPS_APP_ENV=production
DEEPSYNAPS_LOG_LEVEL=INFO
```

```bash
# fly secrets (sensitive values)
fly secrets set SENTRY_DSN="https://prod-dsn@sentry.io/PROJECT" --app deepsynaps-studio
fly secrets set OTLP_ENDPOINT="https://tempo.deepsynaps.io:4317" --app deepsynaps-studio
fly secrets set PAGERDUTY_SERVICE_KEY="..." --app deepsynaps-studio
fly secrets set SLACK_WEBHOOK_URL="..." --app deepsynaps-studio
```

- Full observability stack with production routing
- Sentry: 10% trace sampling, 100% error sampling
- All P0/P1 alerts route to PagerDuty
- Audit logs archived to encrypted S3
- 7-year log retention for HIPAA compliance

---

## 9. Operational Runbooks

### 9.1 Alert Response Procedures

**For every alert, follow the INITIAL checklist:**

1. Acknowledge the alert in PagerDuty or Slack
2. Open the linked Grafana dashboard
3. Check if the alert is a symptom or the root cause
4. Look for correlated alerts (AlertManager groups by `alertgroup` and `env`)
5. Check recent deployments (`deepsynaps_app_info` changes in Grafana)
6. Check Fly.io status page: https://status.flyio.net
7. Check application logs: `fly logs --app deepsynaps-studio --tail 200`
8. Determine: Is this a known issue with an open incident?

### 9.2 Log Investigation Commands

```bash
# Live logs with filtering
fly logs --app deepsynaps-studio | jq 'select(.level == "ERROR")'

# Filter by request ID (correlate a specific request across services)
fly logs --app deepsynaps-studio | jq 'select(.request_id == "req_abc123")'

# Filter by clinical operation
fly logs --app deepsynaps-studio | jq 'select(.message | contains("patient data"))'

# Filter slow requests
fly logs --app deepsynaps-studio | jq 'select(.duration_ms > 500)'

# Count errors by type in last hour
fly logs --app deepsynaps-studio --tail 10000 | \
  jq -r 'select(.level == "ERROR") | .logger' | sort | uniq -c | sort -rn
```

### 9.3 Metrics Investigation Commands

```bash
# Direct Prometheus query (if you have port-forward)
curl -s "http://prometheus.deepsynaps.io/api/v1/query?query=up{job='deepsynaps-api'}" | jq .

# Check specific metric
curl -s "http://deepsynaps-studio.internal:8080/metrics" | grep "http_requests_total"

# Check error rate for specific endpoint
curl -s "http://prometheus.deepsynaps.io/api/v1/query?query=\
sum(rate(http_errors_total{endpoint=\"/api/v1/patients/{patient_id}\"}[5m]))" | jq .
```

### 9.4 Escalation Matrix

| Situation | First Responder | Escalation (15 min) | Escalation (30 min) |
|-----------|----------------|--------------------|--------------------|
| P0 — Service down | On-call SRE | SRE Lead + Engineering Manager | CTO |
| P0 — PHI exposure | On-call SRE + Security Lead | CISO + Legal | CTO + CEO |
| P1 — Clinical errors | On-call SRE | Clinical Engineering Lead | VP Engineering |
| P1 — High error rate | On-call SRE | SRE Lead | Engineering Manager |
| P2 — Resource exhaustion | On-call SRE | SRE Lead (Slack) | — |
| P3 — Performance | On-call SRE (next business day) | — | — |

---

## 10. Appendix: Reference Quick-Start

### 10.1 Complete Environment Variables

```bash
# Required
DEEPSYNAPS_APP_ENV=production          # environment
DEEPSYNAPS_LOG_LEVEL=INFO              # log level
SENTRY_DSN=https://...                 # Sentry DSN (optional)

# Monitoring (optional)
OTLP_ENDPOINT=https://...              # OpenTelemetry collector (optional)
PROMETHEUS_MULTIPROC_DIR=/tmp          # For multi-process Prometheus

# Rate limiting
DEEPSYNAPS_LIMITER_REDIS_URI=redis://...  # Redis for rate limiting

# Workers
CELERY_BROKER_URL=redis://...          # Celery broker
CELERY_RESULT_BACKEND=redis://...      # Celery result backend
```

### 10.2 Directory Structure

```
monitoring/
├── deploy/
│   ├── alertmanager/
│   │   ├── alertmanager.yml           # AlertManager routing config
│   │   ├── alerts-clinical.yml        # Clinical safety alerts
│   │   ├── alerts-system.yml          # System health alerts
│   │   ├── alerts-p0.yml              # P0 critical alerts
│   │   ├── alerts-p1.yml              # P1 high alerts
│   │   ├── alerts-p2.yml              # P2 warning alerts
│   │   └── alerts-p3.yml              # P3 info alerts
│   ├── grafana/
│   │   ├── dashboard-api.json         # API performance dashboard
│   │   ├── dashboard-infrastructure.json  # System health dashboard
│   │   ├── dashboard-clinical.json    # Clinical operations dashboard
│   │   ├── dashboard-knowledge.json   # Knowledge layer dashboard
│   │   └── dashboard-alerts.json      # Error/alert dashboard
│   └── prometheus/
│       ├── prometheus.yml             # Scrape configuration
│       └── recording-rules.yml        # SLO recording rules
├── docs/
│   └── runbooks/
│       ├── alerting-runbook.md        # Alert response procedures
│       └── monitoring-runbook.md      # Monitoring setup guide
└── apps/
    └── api/
        └── app/
            ├── monitoring/
            │   ├── __init__.py
│   │   ├── middleware.py          # Metrics middleware
│   │   └── metrics.py             # Prometheus metric definitions
│   ├── sentry_setup.py            # Sentry initialization
│   ├── logging_setup.py           # Structured JSON logging
│   └── tracing_setup.py           # OpenTelemetry (optional)
```

### 10.3 Key Metrics Reference Card

| Metric | Type | Alert Threshold | Runbook |
|--------|------|----------------|---------|
| `up{job="deepsynaps-api"}` | Gauge | == 0 for 1m | Service Down |
| `http_requests_total{status=~"5xx"}` | Counter | rate > 0.1% for 2m | API Error Rate |
| `http_request_duration_seconds` | Histogram | P95 > 200ms for 5m | API Latency |
| `db_pool_checked_out / db_pool_size` | Gauge ratio | > 0.75 for 5m | DB Pool High |
| `worker_queue_depth` | Gauge | > 500 for 5m | Queue Depth |
| `backup_age_seconds` | Gauge | > 90000 (25h) | Backup Stale |
| `qeeg_analysis_duration_seconds` | Histogram | P99 > 600s for 10m | qEEG Timeout |
| `security_events_total{event_type="privilege_escalation"}` | Counter | > 0 (immediate) | Security Incident |
| `patient_data_access_total{operation_type="export"}` | Counter | rate > 0.1/s for 5m | Data Exfiltration |

### 10.4 Fly.io Observability Quick Reference

```bash
# App status
fly status --app deepsynaps-studio

# Live logs
fly logs --app deepsynaps-studio

# Metrics endpoint (from within Fly network)
curl http://deepsynaps-studio.internal:8080/metrics

# SSH into machine
fly ssh console --app deepsynaps-studio

# Check resource usage from within machine
ps aux --sort=-%mem | head -10
df -h /data
free -h

# Check database (SQLite)
sqlite3 /data/deepsynaps_protocol_studio.db "PRAGMA integrity_check;"
sqlite3 /data/deepsynaps_protocol_studio.db ".tables"

# Check Redis/Celery (from within machine)
redis-cli -u $CELERY_BROKER_URL LLEN celery
redis-cli -u $CELERY_BROKER_URL INFO memory

# Restart a machine
fly machine restart <machine-id> --app deepsynaps-studio

# Scale memory (edit fly.toml then deploy)
# [[vm]]
#   memory = "2gb"
# fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-15 | SRE Team | Initial comprehensive observability setup document |

---

*This document is a living reference. Update it whenever monitoring configuration changes, new alerts are added, or dashboards are modified. All changes must be peer-reviewed by the SRE team.*
