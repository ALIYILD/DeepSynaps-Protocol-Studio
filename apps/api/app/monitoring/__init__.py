"""DeepSynaps Protocol Studio — Monitoring & Observability Package.

Exports all Prometheus metrics and the monitoring middleware for use
troughout the FastAPI application.  All metrics are PHI-safe: no patient
identifiers, names, or clinical values appear in label values.
"""

from app.monitoring.metrics import (
    ACTIVE_SESSIONS,
    BACKUP_AGE_SECONDS,
    CLINICAL_OPERATIONS_TOTAL,
    DB_POOL_SIZE,
    ERROR_RATE,
    EVIDENCE_QUERIES,
    PATIENT_DATA_ACCESS,
    QEEG_ANALYSIS_DURATION,
    REQUEST_COUNT,
    REQUEST_DURATION,
    REQUEST_IN_PROGRESS,
    SECURITY_EVENTS,
    WORKER_QUEUE_DEPTH,
    start_request,
    end_request,
    record_clinical_operation,
    record_patient_data_access,
    record_security_event,
    record_evidence_query,
    record_qeeg_analysis,
)
from app.monitoring.middleware import MetricsMiddleware

__all__ = [
    # Counters
    "REQUEST_COUNT",
    "CLINICAL_OPERATIONS_TOTAL",
    "PATIENT_DATA_ACCESS",
    "ERROR_RATE",
    "EVIDENCE_QUERIES",
    "SECURITY_EVENTS",
    # Histograms
    "REQUEST_DURATION",
    "QEEG_ANALYSIS_DURATION",
    # Gauges
    "REQUEST_IN_PROGRESS",
    "DB_POOL_SIZE",
    "ACTIVE_SESSIONS",
    "WORKER_QUEUE_DEPTH",
    "BACKUP_AGE_SECONDS",
    # Helpers
    "start_request",
    "end_request",
    "record_clinical_operation",
    "record_patient_data_access",
    "record_security_event",
    "record_evidence_query",
    "record_qeeg_analysis",
    "MetricsMiddleware",
]
