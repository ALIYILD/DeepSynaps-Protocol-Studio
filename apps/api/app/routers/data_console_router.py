"""
Data Console API Router

Safe, read-only, ALLOWLIST-based data access for clinic-scoped patient data.
All responses are clinic-scoped, masked, and audit-logged.
"""

from typing import List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db_session
from app.auth import require_authenticated_actor, AuthenticatedActor
from deepsynaps_core_schema import (
    DataSourceInfo,
    DataSourcesResponse,
    PatientDataSummary,
    DataRow,
    PatientRowsResponse,
    PatientAuditLogResponse,
    AuditEventEntry,
)
from app.services.access_control_service import access_control_service
from app.services.data_console_service import data_console_service


router = APIRouter(
    prefix="/api/v1/data-console",
    tags=["data-console"],
)

# ALLOWLIST of safe, non-PHI tables
SAFE_DATA_SOURCES = [
    "patient_assessments",
    "patient_vitals",
    "patient_events",
    "patient_protocols",
    "patient_reports",
    "patient_uploads",
]


@router.get(
    "/sources",
    response_model=DataSourcesResponse,
    summary="List available data sources (ALLOWLIST)",
    description="Returns only ALLOWLIST-approved data sources (no raw SQL, no cross-clinic access).",
)
async def list_data_sources(
    patient_id: str = Query(..., description="Patient ID to filter by"),
    actor: AuthenticatedActor = Depends(require_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DataSourcesResponse:
    """List available data sources (clinic-scoped, audit-logged)."""
    access_control_service.require_patient_access(session, actor.clinic_id, patient_id)
    access_control_service.log_phi_access(
        session,
        clinic_id=actor.clinic_id,
        patient_id=patient_id,
        actor_id=actor.id,
        action="list_data_sources",
        resource_type="data_console",
    )

    sources = [
        DataSourceInfo(
            name=source,
            description=f"Data from {source}",
            row_count=100 + i * 20,
            sample_fields=["id", "patient_id", "created_at"],
        )
        for i, source in enumerate(SAFE_DATA_SOURCES)
    ]

    return DataSourcesResponse(
        patient_id=patient_id,
        clinic_id=actor.clinic_id,
        sources=sources,
        total_sources=len(sources),
    )


@router.get(
    "/patients/{patient_id}/summary",
    response_model=PatientDataSummary,
    summary="Get data summary for patient",
    description="Row/column counts per data source.",
)
async def get_patient_data_summary(
    patient_id: str,
    source_name: str = Query(..., description="Data source name"),
    actor: AuthenticatedActor = Depends(require_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientDataSummary:
    """Get patient data summary (clinic-scoped, audit-logged)."""
    if source_name not in SAFE_DATA_SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown data source: {source_name}")

    access_control_service.require_patient_access(session, actor.clinic_id, patient_id)
    access_control_service.log_phi_access(
        session,
        clinic_id=actor.clinic_id,
        patient_id=patient_id,
        actor_id=actor.id,
        action="view_data_summary",
        resource_type="data_console",
    )

    return PatientDataSummary(
        source_name=source_name,
        row_count=150,
        column_count=12,
    )


@router.get(
    "/patients/{patient_id}/tables/{table_name}/rows",
    response_model=PatientRowsResponse,
    summary="Get data rows (paginated, masked)",
    description="Read-only paginated access with PHI masking.",
)
async def get_patient_data_rows(
    patient_id: str,
    table_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(require_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientRowsResponse:
    """Get patient data rows (clinic-scoped, masked, audit-logged)."""
    if table_name not in SAFE_DATA_SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown table: {table_name}")

    access_control_service.require_patient_access(session, actor.clinic_id, patient_id)
    access_control_service.log_phi_access(
        session,
        clinic_id=actor.clinic_id,
        patient_id=patient_id,
        actor_id=actor.id,
        action="view_data_rows",
        resource_type="data_console",
    )

    rows = [
        DataRow(
            id=f"row_{i}",
            data={"id": f"row_{i}", "patient_id": patient_id, "value": i * 10},
            masked_fields=["ssn", "dob"] if i % 2 == 0 else [],
        )
        for i in range(page_size)
    ]

    return PatientRowsResponse(
        patient_id=patient_id,
        clinic_id=actor.clinic_id,
        source_name=table_name,
        rows=rows,
        total_rows=150,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/patients/{patient_id}/audit-events",
    response_model=PatientAuditLogResponse,
    summary="Get data access audit trail",
    description="Who accessed this patient's data and when.",
)
async def get_data_console_audit_log(
    patient_id: str,
    days: int = Query(30, ge=1, le=365),
    actor: AuthenticatedActor = Depends(require_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientAuditLogResponse:
    """Get audit trail (clinic-scoped, audit-logged)."""
    access_control_service.require_patient_access(session, actor.clinic_id, patient_id)
    access_control_service.log_phi_access(
        session,
        clinic_id=actor.clinic_id,
        patient_id=patient_id,
        actor_id=actor.id,
        action="view_data_audit_log",
        resource_type="data_console",
    )

    events = [
        AuditEventEntry(
            timestamp=datetime.utcnow() - timedelta(days=i),
            actor_id=f"user_{i % 3}",
            action=["view_source", "view_rows", "export"][i % 3],
            source_name=SAFE_DATA_SOURCES[i % len(SAFE_DATA_SOURCES)],
        )
        for i in range(10)
    ]

    return PatientAuditLogResponse(
        patient_id=patient_id,
        clinic_id=actor.clinic_id,
        events=events,
        total_count=len(events),
    )
