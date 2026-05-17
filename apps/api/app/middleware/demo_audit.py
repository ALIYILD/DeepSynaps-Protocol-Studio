"""Demo/Production Audit Logging.

Provides comprehensive audit logging for demo data access, demo mode
activations, and boundary crossing attempts. Every audit entry includes:
- timestamp
- event type
- source IP
- user ID (if authenticated)
- endpoint
- environment
- outcome (allowed/blocked)
- stack trace (for blocked events)
"""

from __future__ import annotations

import os
import json
import time
import traceback
from datetime import datetime, timezone
from typing import Optional, Any, Dict
from dataclasses import dataclass, asdict

from app.logging_setup import get_logger

logger = get_logger(__name__)

# Event types
EVENT_DEMO_ENDPOINT_BLOCKED = "demo_endpoint_blocked"
EVENT_DEMO_DATA_IN_RESPONSE = "demo_data_in_response"
EVENT_DEMO_SEED_ATTEMPT = "demo_seed_attempt"
EVENT_DEMO_MODE_ENABLED = "demo_mode_enabled"
EVENT_DEMO_USER_LOGIN = "demo_user_login"
EVENT_PRODUCTION_SAFETY_VIOLATION = "production_safety_violation"

# Severity levels
SEVERITY_CRITICAL = "CRITICAL"  # Production violation
SEVERITY_WARNING = "WARNING"    # Unusual but allowed
SEVERITY_INFO = "INFO"          # Normal operation


@dataclass
class DemoAuditEntry:
    """Single demo audit entry."""
    timestamp: str
    event_type: str
    severity: str
    environment: str
    source_ip: Optional[str]
    user_id: Optional[str]
    endpoint: Optional[str]
    clinic_id: Optional[str]
    outcome: str  # "allowed", "blocked", "detected"
    details: Dict[str, Any]
    stack_trace: Optional[str]


def log_demo_audit(
    event_type: str,
    severity: str = SEVERITY_INFO,
    source_ip: Optional[str] = None,
    user_id: Optional[str] = None,
    endpoint: Optional[str] = None,
    clinic_id: Optional[str] = None,
    outcome: str = "allowed",
    details: Optional[Dict[str, Any]] = None,
    include_stack_trace: bool = False,
) -> None:
    """Log a demo audit entry.

    Every call creates a structured audit log that can be:
    - Forwarded to a SIEM
    - Queried for compliance reports
    - Used for incident investigation
    """
    entry = DemoAuditEntry(
        timestamp=datetime.now(timezone.utc).isoformat(),
        event_type=event_type,
        severity=severity,
        environment=os.environ.get("DEEPSYNAPS_APP_ENV", "unknown"),
        source_ip=source_ip,
        user_id=user_id,
        endpoint=endpoint,
        clinic_id=clinic_id,
        outcome=outcome,
        details=details or {},
        stack_trace=traceback.format_stack(limit=8) if include_stack_trace and outcome == "blocked" else None,
    )

    log_data = asdict(entry)

    if severity == SEVERITY_CRITICAL:
        logger.critical("DEMO_AUDIT: %s", json.dumps(log_data))
    elif severity == SEVERITY_WARNING:
        logger.warning("DEMO_AUDIT: %s", json.dumps(log_data))
    else:
        logger.info("DEMO_AUDIT: %s", json.dumps(log_data))


def audit_demo_endpoint_blocked(
    path: str,
    method: str,
    source_ip: Optional[str] = None,
) -> None:
    """Audit log when a demo endpoint is blocked in production."""
    log_demo_audit(
        event_type=EVENT_DEMO_ENDPOINT_BLOCKED,
        severity=SEVERITY_CRITICAL,
        source_ip=source_ip,
        endpoint=f"{method} {path}",
        outcome="blocked",
        details={"reason": "Demo endpoints not available in production"},
        include_stack_trace=True,
    )


def audit_demo_data_detected(
    path: str,
    indicators: list[str],
    source_ip: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    """Audit log when demo data is detected in a response."""
    is_production = os.environ.get("DEEPSYNAPS_APP_ENV") == "production"
    log_demo_audit(
        event_type=EVENT_DEMO_DATA_IN_RESPONSE,
        severity=SEVERITY_CRITICAL if is_production else SEVERITY_INFO,
        source_ip=source_ip,
        user_id=user_id,
        endpoint=path,
        outcome="detected",
        details={"indicators": indicators, "is_production": is_production},
    )


def audit_demo_seed_attempt(
    app_env: str,
    blocked: bool = False,
) -> None:
    """Audit log when demo seeding is attempted."""
    log_demo_audit(
        event_type=EVENT_DEMO_SEED_ATTEMPT,
        severity=SEVERITY_CRITICAL if blocked else SEVERITY_INFO,
        endpoint="lifespan:seed_demo",
        outcome="blocked" if blocked else "allowed",
        details={"requested_env": app_env, "actual_env": os.environ.get("DEEPSYNAPS_APP_ENV")},
    )
