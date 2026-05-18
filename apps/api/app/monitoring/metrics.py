"""DeepSynaps Protocol Studio — Prometheus Metrics.

All metrics defined here follow the RED method (Rate, Errors, Duration) and
are PHI-safe by design.  Label values must NEVER contain patient
identifiers, names, MRN, or any clinical data values.

Intended label values:
  - method      : HTTP verb (GET, POST, PATCH, PUT, DELETE)
  - endpoint    : Route template, e.g. /api/v1/patients/{patient_id}
  - status      : HTTP status code family (2xx, 3xx, 4xx, 5xx) or exact code
  - operation   : Clinical operation category (protocol_generate, assessment_complete, ...)
  - operation_type : Patient data action (read, create, update, delete, export)
  - actor_role  : Role of the actor performing the action (clinician, patient, admin, system)
  - error_type  : Error classification (validation, auth, clinical, internal, timeout)
  - query_type  : Evidence query category (biomarker, protocol, condition, device)
  - event_type  : Security event category (failed_auth, rate_limit_hit, privilege_escalation, suspicious_access)
  - severity    : Security event severity (low, medium, high, critical)
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Generator

try:
    from prometheus_client import (
        CollectorRegistry,
        Counter,
        Gauge,
        Histogram,
        Info,
        generate_latest,
    )
    _PROMETHEUS_AVAILABLE = True
except ModuleNotFoundError:
    _PROMETHEUS_AVAILABLE = False

    class CollectorRegistry:  # type: ignore[override]
        """Fallback registry when prometheus_client is unavailable."""

    class _NoopMetric:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def labels(self, **kwargs):
            return self

        def inc(self, amount: float = 1.0) -> None:
            return None

        def dec(self, amount: float = 1.0) -> None:
            return None

        def observe(self, value: float) -> None:
            return None

        def info(self, data) -> None:
            return None

    Counter = Gauge = Histogram = Info = _NoopMetric  # type: ignore[misc,assignment]

    def generate_latest(registry) -> bytes:  # type: ignore[override]
        return b"# prometheus_client not installed; metrics disabled\n"

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
# Use a dedicated registry so we don't accidentally pick up global default
# metrics from other libraries (e.g. asyncio, gc) that bloat the scrape.
MONITORING_REGISTRY = CollectorRegistry()

# Application metadata
APP_INFO = Info(
    "deepsynaps_app",
    "DeepSynaps Protocol Studio build information",
    registry=MONITORING_REGISTRY,
)

# ---------------------------------------------------------------------------
# RED Metrics — Request Rate, Errors, Duration
# ---------------------------------------------------------------------------

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total number of HTTP requests processed",
    labelnames=["method", "endpoint", "status"],
    registry=MONITORING_REGISTRY,
)

REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    labelnames=["method", "endpoint"],
    buckets=[
        0.005,
        0.01,
        0.025,
        0.05,
        0.075,
        0.1,
        0.25,
        0.5,
        0.75,
        1.0,
        2.5,
        5.0,
        7.5,
        10.0,
        30.0,
        60.0,
    ],
    registry=MONITORING_REGISTRY,
)

REQUEST_IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "Number of HTTP requests currently being processed",
    labelnames=["method"],
    registry=MONITORING_REGISTRY,
)

# ---------------------------------------------------------------------------
# Error Tracking
# ---------------------------------------------------------------------------

ERROR_RATE = Counter(
    "http_errors_total",
    "Total number of HTTP errors by type and endpoint",
    labelnames=["error_type", "endpoint", "status"],
    registry=MONITORING_REGISTRY,
)

# ---------------------------------------------------------------------------
# Infrastructure Gauges
# ---------------------------------------------------------------------------

DB_POOL_SIZE = Gauge(
    "db_pool_size",
    "Current database connection pool size (checked out + available)",
    labelnames=["pool"],
    registry=MONITORING_REGISTRY,
)

ACTIVE_SESSIONS = Gauge(
    "active_sessions",
    "Number of currently active user sessions",
    labelnames=["actor_role"],
    registry=MONITORING_REGISTRY,
)

WORKER_QUEUE_DEPTH = Gauge(
    "worker_queue_depth",
    "Current depth of Celery task queues",
    labelnames=["queue"],
    registry=MONITORING_REGISTRY,
)

BACKUP_AGE_SECONDS = Gauge(
    "backup_age_seconds",
    "Seconds since the last successful database backup",
    registry=MONITORING_REGISTRY,
)

# ---------------------------------------------------------------------------
# Clinical Operations Metrics (PHI-safe)
# ---------------------------------------------------------------------------

CLINICAL_OPERATIONS_TOTAL = Counter(
    "clinical_operations_total",
    "Total number of clinical operations performed",
    labelnames=["operation", "actor_role"],
    registry=MONITORING_REGISTRY,
)

PATIENT_DATA_ACCESS = Counter(
    "patient_data_access_total",
    "Total number of patient data access events (audit trail)",
    labelnames=["operation_type", "actor_role"],
    registry=MONITORING_REGISTRY,
)

EVIDENCE_QUERIES = Counter(
    "evidence_queries_total",
    "Total number of evidence database queries",
    labelnames=["query_type", "source"],
    registry=MONITORING_REGISTRY,
)

QEEG_ANALYSIS_DURATION = Histogram(
    "qeeg_analysis_duration_seconds",
    "qEEG analysis pipeline duration in seconds",
    labelnames=["analysis_type", "status"],
    buckets=[
        0.1,
        0.5,
        1.0,
        2.5,
        5.0,
        10.0,
        30.0,
        60.0,
        120.0,
        300.0,
        600.0,
    ],
    registry=MONITORING_REGISTRY,
)

# ---------------------------------------------------------------------------
# Security Metrics
# ---------------------------------------------------------------------------

SECURITY_EVENTS = Counter(
    "security_events_total",
    "Total number of security-related events",
    labelnames=["event_type", "severity"],
    registry=MONITORING_REGISTRY,
)


# ---------------------------------------------------------------------------
# Helper functions — thin wrappers to keep call sites readable
# ---------------------------------------------------------------------------

def start_request(method: str) -> None:
    """Increment the in-progress gauge when a request starts."""
    REQUEST_IN_PROGRESS.labels(method=method).inc()


def end_request(
    method: str,
    endpoint: str,
    status: int,
    duration_seconds: float,
) -> None:
    """Record a completed request: decrement in-progress, increment count
    and duration histogram.  Must be called exactly once per request.
    """
    REQUEST_IN_PROGRESS.labels(method=method).dec()
    status_family = f"{status // 100}xx" if status >= 100 else "unknown"
    REQUEST_COUNT.labels(
        method=method,
        endpoint=endpoint,
        status=status_family,
    ).inc()
    REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(duration_seconds)


def record_error(error_type: str, endpoint: str, status: int) -> None:
    """Record an error occurrence.  ``error_type`` should be one of:
    validation, auth, clinical, internal, timeout, database, upstream.
    """
    ERROR_RATE.labels(
        error_type=error_type,
        endpoint=endpoint,
        status=f"{status}",
    ).inc()


def record_clinical_operation(operation: str, actor_role: str) -> None:
    """Record a clinical operation.  ``operation`` examples:
    protocol_generate, protocol_save, assessment_complete, assessment_submit,
    treatment_start, treatment_complete, adverse_event_report.
    """
    CLINICAL_OPERATIONS_TOTAL.labels(operation=operation, actor_role=actor_role).inc()


def record_patient_data_access(operation_type: str, actor_role: str) -> None:
    """Record a patient data access event for audit.
    ``operation_type`` should be one of: read, create, update, delete, export.
    """
    PATIENT_DATA_ACCESS.labels(operation_type=operation_type, actor_role=actor_role).inc()


def record_evidence_query(query_type: str, source: str = "api") -> None:
    """Record an evidence database query.
    ``query_type`` examples: biomarker, protocol, condition, device, interaction.
    """
    EVIDENCE_QUERIES.labels(query_type=query_type, source=source).inc()


def record_qeeg_analysis(analysis_type: str, status: str, duration_seconds: float) -> None:
    """Record qEEG analysis duration.  ``analysis_type`` examples:
    spectral, connectivity, erp, coherence, asymmetry.
    """
    QEEG_ANALYSIS_DURATION.labels(
        analysis_type=analysis_type,
        status=status,
    ).observe(duration_seconds)


@contextmanager
def timed_qeeg_analysis(analysis_type: str) -> Generator[None, None, None]:
    """Context manager for timing qEEG analysis pipelines.

    Usage::
        with timed_qeeg_analysis("spectral"):
            run_spectral_analysis(...)
    """
    start = time.perf_counter()
    try:
        yield
        record_qeeg_analysis(analysis_type, "success", time.perf_counter() - start)
    except Exception:
        record_qeeg_analysis(analysis_type, "error", time.perf_counter() - start)
        raise


def record_security_event(event_type: str, severity: str) -> None:
    """Record a security event.
    ``event_type`` examples: failed_auth, rate_limit_hit, privilege_escalation,
    suspicious_access, mfa_failure, token_refresh_anomaly.
    ``severity`` should be one of: low, medium, high, critical.
    """
    SECURITY_EVENTS.labels(event_type=event_type, severity=severity).inc()


def get_metrics_payload() -> bytes:
    """Return the current metrics snapshot in OpenMetrics text format."""
    return generate_latest(MONITORING_REGISTRY)
