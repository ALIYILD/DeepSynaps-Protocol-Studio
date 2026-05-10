"""Data console API router — read-only clinical data access.

Provides 4 endpoints for clinician review of patient data in a safe, audit-logged
manner:

* ``GET /api/v1/data-console/sources`` — list available data tables
* ``GET /api/v1/data-console/patients/{patient_id}/summary`` — data availability per table
* ``GET /api/v1/data-console/patients/{patient_id}/tables/{table_name}/rows`` — paginated rows (PHI masked)
* ``GET /api/v1/data-console/patients/{patient_id}/audit`` — audit log of PHI access

All endpoints enforce:
- Clinic-scoped access control via ``require_patient_access()``
- ALLOWLIST validation (SAFE_TABLES from data_console_service)
- PHI masking on sensitive fields
- Structured audit logging of all access
- Read-only safety badges in responses
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.services.data_console_service import (
    DataConsoleAccessError,
    get_available_sources,
    get_patient_data_summary,
    get_patient_rows,
    SAFE_TABLES,
)
from app.services.patient_analytics_service import get_patient_audit_log
from app.services.access_control_service import (
    require_patient_access,
    log_phi_access,
)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/data-console", tags=["data-console"])


# ── Response Models ────────────────────────────────────────────────────────────


class DataSourceInfo(BaseModel):
    """Information about a single available data source (table)."""

    table: str
    columns: list[str]
    row_count_estimate: Optional[int] = None


class DataSourcesResponse(BaseModel):
    """Response body for GET /sources endpoint."""

    sources: list[DataSourceInfo]
    read_only: bool = True
    phi_masked: bool = True
    generated_at: str


class PatientDataSummary(BaseModel):
    """Summary of data availability for a patient across all tables."""

    patient_id: str
    table_summaries: dict[str, int]
    read_only: bool = True
    phi_masked: bool = True
    generated_at: str


class DataRow(BaseModel):
    """A single row of patient data (potentially with PHI masked)."""

    pass  # Flexible schema — actual fields depend on table


class PatientRowsResponse(BaseModel):
    """Response body for GET /tables/{table_name}/rows endpoint."""

    patient_id: str
    table_name: str
    rows: list[dict[str, Any]]
    limit: int
    offset: int
    read_only: bool = True
    phi_masked: bool = True


class AuditEventEntry(BaseModel):
    """Single entry in PHI access audit log."""

    id: str
    actor_id: str
    action: str
    resource_type: str
    result: str
    timestamp: str
    reason: Optional[str] = None


class PatientAuditLogResponse(BaseModel):
    """Response body for GET /audit endpoint."""

    patient_id: str
    events: list[AuditEventEntry]
    read_only: bool = True
    phi_masked: bool = True


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/sources", response_model=DataSourcesResponse)
def list_data_sources(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DataSourcesResponse:
    """List all available data sources (safe tables) in the data console.

    Returns: List of tables with columns and metadata.

    Requires: clinician, admin, or platform_admin role.
    """
    require_minimum_role(actor, "clinician")

    try:
        sources_list = get_available_sources(session, actor.actor_id)
    except DataConsoleAccessError as exc:
        _log.warning("Data console access denied: %s", exc)
        raise ApiServiceError(
            code="access_denied",
            message="You do not have access to the data console.",
            status_code=403,
        ) from exc
    except Exception as exc:  # noqa: BLE001
        _log.error("Error listing data sources: %s", exc)
        raise ApiServiceError(
            code="internal_error",
            message="Failed to retrieve data sources.",
            status_code=500,
        ) from exc

    from datetime import datetime, timezone

    return DataSourcesResponse(
        sources=[
            DataSourceInfo(
                table=source["table"],
                columns=source["columns"],
                row_count_estimate=source.get("row_count_estimate"),
            )
            for source in sources_list
        ],
        read_only=True,
        phi_masked=True,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/patients/{patient_id}/summary", response_model=PatientDataSummary)
def get_patient_data_summary_endpoint(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientDataSummary:
    """Get a summary of data available for a patient across all safe tables.

    Returns: Counts of rows per table.

    Requires: clinician or admin role with clinic-scoped access to patient.
    """
    require_minimum_role(actor, "clinician")

    try:
        # Enforce access control before returning any data
        require_patient_access(session, actor.actor_id, patient_id)

        # Log PHI access
        log_phi_access(
            session=session,
            actor_user_id=actor.actor_id,
            patient_id=patient_id,
            action="data_console_summary",
            resource_type="patient",
        )

        summary = get_patient_data_summary(session, actor.actor_id, patient_id)
    except DataConsoleAccessError as exc:
        _log.warning("Data console access denied for patient %s: %s", patient_id, exc)
        raise ApiServiceError(
            code="access_denied",
            message="You do not have access to this patient's data.",
            status_code=403,
        ) from exc
    except Exception as exc:  # noqa: BLE001
        _log.error("Error retrieving patient summary for %s: %s", patient_id, exc)
        raise ApiServiceError(
            code="internal_error",
            message="Failed to retrieve patient data summary.",
            status_code=500,
        ) from exc

    from datetime import datetime, timezone

    return PatientDataSummary(
        patient_id=patient_id,
        table_summaries=summary,
        read_only=True,
        phi_masked=True,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/patients/{patient_id}/tables/{table_name}/rows", response_model=PatientRowsResponse)
def get_patient_rows_endpoint(
    patient_id: str,
    table_name: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientRowsResponse:
    """Fetch paginated rows from a safe table for a patient (with PHI masked).

    Args:
        patient_id: Patient ID
        table_name: Table to fetch from (must be in ALLOWLIST)
        limit: Max rows to return (1-1000, default 100)
        offset: Offset for pagination (default 0)

    Returns: Paginated rows with PHI masked.

    Requires: clinician or admin role with clinic-scoped access to patient.

    Raises:
        403: If user lacks access to patient or table not in ALLOWLIST
        404: If patient not found
        500: If query fails
    """
    require_minimum_role(actor, "clinician")

    # Validate table_name is in SAFE_TABLES (prevent raw SQL injection)
    if table_name not in SAFE_TABLES:
        _log.warning(
            "Attempt to access non-whitelisted table '%s' by actor %s for patient %s",
            table_name,
            actor.actor_id,
            patient_id,
        )
        raise ApiServiceError(
            code="table_not_allowed",
            message=f"Table '{table_name}' is not available in the data console.",
            status_code=403,
        )

    try:
        # Enforce access control before returning any data
        require_patient_access(session, actor.actor_id, patient_id)

        # Fetch rows with PHI masking enabled
        rows = get_patient_rows(
            session=session,
            actor_user_id=actor.actor_id,
            patient_id=patient_id,
            table_name=table_name,
            limit=limit,
            offset=offset,
            mask_phi=True,
        )

        # Log PHI access
        log_phi_access(
            session=session,
            actor_user_id=actor.actor_id,
            patient_id=patient_id,
            action="data_console_rows_read",
            resource_type=table_name,
        )

    except DataConsoleAccessError as exc:
        _log.warning(
            "Data console access denied for patient %s, table %s: %s",
            patient_id,
            table_name,
            exc,
        )
        raise ApiServiceError(
            code="access_denied",
            message="You do not have access to this patient's data.",
            status_code=403,
        ) from exc
    except Exception as exc:  # noqa: BLE001
        _log.error(
            "Error retrieving rows for patient %s, table %s: %s",
            patient_id,
            table_name,
            exc,
        )
        raise ApiServiceError(
            code="internal_error",
            message="Failed to retrieve patient rows.",
            status_code=500,
        ) from exc

    return PatientRowsResponse(
        patient_id=patient_id,
        table_name=table_name,
        rows=rows,
        limit=limit,
        offset=offset,
        read_only=True,
        phi_masked=True,
    )


@router.get("/patients/{patient_id}/audit", response_model=PatientAuditLogResponse)
def get_patient_audit_endpoint(
    patient_id: str,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=500),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientAuditLogResponse:
    """Get audit log of PHI access for a patient.

    Returns audit events from the past N days showing who accessed what data and when.

    Args:
        patient_id: Patient ID
        days: Look back this many days (1-365, default 30)
        limit: Max events to return (1-500, default 50)

    Returns: Paginated audit events in reverse chronological order.

    Requires: clinician or admin role with clinic-scoped access to patient.

    Raises:
        403: If user lacks access to patient
        404: If patient not found
        500: If query fails
    """
    require_minimum_role(actor, "clinician")

    try:
        # Enforce access control before returning audit data
        require_patient_access(session, actor.actor_id, patient_id)

        # Fetch audit log
        events = get_patient_audit_log(
            session=session,
            patient_id=patient_id,
            days=days,
            limit=limit,
        )

        # Log that audit log was accessed (meta-audit)
        log_phi_access(
            session=session,
            actor_user_id=actor.actor_id,
            patient_id=patient_id,
            action="data_console_audit_read",
            resource_type="audit_log",
        )

    except DataConsoleAccessError as exc:
        _log.warning(
            "Data console access denied for patient %s audit log: %s",
            patient_id,
            exc,
        )
        raise ApiServiceError(
            code="access_denied",
            message="You do not have access to this patient's audit log.",
            status_code=403,
        ) from exc
    except Exception as exc:  # noqa: BLE001
        _log.error("Error retrieving audit log for patient %s: %s", patient_id, exc)
        raise ApiServiceError(
            code="internal_error",
            message="Failed to retrieve patient audit log.",
            status_code=500,
        ) from exc

    return PatientAuditLogResponse(
        patient_id=patient_id,
        events=[
            AuditEventEntry(
                id=event["id"],
                actor_id=event["actor_id"],
                action=event["action"],
                resource_type=event["resource_type"],
                result=event["result"],
                timestamp=event["timestamp"],
                reason=event.get("reason"),
            )
            for event in events
        ],
        read_only=True,
        phi_masked=True,
    )
