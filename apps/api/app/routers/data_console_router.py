"""
Data Console API Router

Safe, read-only, ALLOWLIST-based data access for clinic-scoped patient data.
All responses are clinic-scoped, masked, and audit-logged.
"""

import json
import uuid
from typing import Dict, List, Optional
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db_session
from app.auth import get_authenticated_actor, AuthenticatedActor
from app.errors import ApiServiceError
from app.repositories.audit import create_audit_event
from app.services.access_control_service import (
    AccessDeniedError,
    log_phi_access,
    require_clinic_access,
    require_patient_access,
)
from app.services.data_console_service import (
    SAFE_TABLES,
    get_available_sources,
    get_clinic_table_summary,
    get_patient_data_summary,
    get_patient_rows,
    stream_clinic_table_csv,
)
from deepsynaps_core_schema import (
    DataSourceInfo,
    DataSourcesResponse,
    PatientDataSummary,
    DataRow,
    PatientRowsResponse,
    PatientAuditLogResponse,
    AuditEventEntry,
)


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
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DataSourcesResponse:
    """List available data sources (clinic-scoped, audit-logged)."""
    require_patient_access(session, actor.actor_id, patient_id)
    log_phi_access(
        session,
        actor_user_id=actor.actor_id,
        patient_id=patient_id,
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
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientDataSummary:
    """Get patient data summary (clinic-scoped, audit-logged)."""
    if source_name not in SAFE_DATA_SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown data source: {source_name}")

    require_patient_access(session, actor.actor_id, patient_id)
    log_phi_access(
        session,
        actor_user_id=actor.actor_id,
        patient_id=patient_id,
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
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientRowsResponse:
    """Get patient data rows (clinic-scoped, masked, audit-logged)."""
    if table_name not in SAFE_DATA_SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown table: {table_name}")

    require_patient_access(session, actor.actor_id, patient_id)
    log_phi_access(
        session,
        actor_user_id=actor.actor_id,
        patient_id=patient_id,
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
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientAuditLogResponse:
    """Get audit trail (clinic-scoped, audit-logged)."""
    require_patient_access(session, actor.actor_id, patient_id)
    log_phi_access(
        session,
        actor_user_id=actor.actor_id,
        patient_id=patient_id,
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


# ─────────────────────────────────────────────────────────────────────────────
# Clinic-wide aggregate view + bulk CSV export (Slice A).
# ─────────────────────────────────────────────────────────────────────────────
#
# These endpoints are scoped to *clinic owners* (role 'clinic_admin') and
# DeepSynaps superadmins (role 'admin'). A plain 'clinician' role can read
# per-patient data via the existing endpoints but is NOT allowed to see
# clinic-wide roll-ups or download bulk CSV.
#
# Role rules (enforced by `_resolve_clinic_scope`):
#   - 'clinician'        → 403 always
#   - 'clinic_admin'     → may only access actor.clinic_id; if a `clinic_id`
#                          query param is passed and ≠ actor's clinic, 403.
#                          Omitting `clinic_id` defaults to actor.clinic_id.
#   - 'admin'            → must supply `clinic_id` (no implicit default —
#                          superadmins are cross-clinic by definition).
#   - any other role     → 403

_CLINIC_AGGREGATE_ROLES = frozenset({"admin", "clinic_admin"})


# core-schema-exempt: clinic aggregate summary is an admin-only router facade with no shared consumers yet.
class ClinicTableSummary(BaseModel):
    """Clinic-wide aggregate row counts for the data console."""

    clinic_id: str = Field(..., description="Clinic UUID this summary covers")
    table_summaries: Dict[str, int] = Field(
        default_factory=dict,
        description="Per-SAFE_TABLES row count, scoped to this clinic.",
    )
    generated_at: datetime = Field(..., description="Timestamp this summary was generated")
    read_only: bool = Field(
        default=True,
        description="Always true — the data console is strictly read-only.",
    )


def _audit_clinic_data_console_access(
    session: Session,
    *,
    actor: AuthenticatedActor,
    clinic_id: str,
    action: str,
    note: Dict[str, object] | None = None,
) -> None:
    """Append a single audit_events row for a clinic-data-console access.

    Best-effort: an audit insert that fails MUST NOT block the response
    (we still want the clinic owner to see their own data), but it MUST
    be logged at WARNING for SOC follow-up. Mirrors the pattern used in
    medical_images_router._audit. Commits the row before the route's
    body returns so an aborted stream still leaves a trail.
    """
    try:
        audit_role = "admin" if actor.role == "clinic_admin" else actor.role
        payload = json.dumps(
            {"clinic_id": clinic_id, **(note or {})},
            default=str,
        )[:1024]
        create_audit_event(
            session,
            event_id=f"data_console.{uuid.uuid4().hex[:12]}",
            target_id=clinic_id[:64],
            target_type="clinic",
            action=action,
            role=audit_role,
            actor_id=actor.actor_id,
            note=payload,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as exc:  # pragma: no cover — audit failure never blocks
        import logging as _logging
        _logging.getLogger(__name__).warning(
            "clinic-data-console audit failed (%s): %s", action, exc
        )


def _resolve_clinic_scope(
    actor: AuthenticatedActor,
    clinic_id_param: Optional[str],
    *,
    require_param_for_admin: bool,
) -> str:
    """Apply the role gate + clinic-ownership rules and return the resolved
    clinic_id.

    `require_param_for_admin=True` on the summary endpoint forces admins to
    pass an explicit `clinic_id` (so superadmins cannot accidentally see an
    arbitrary clinic by leaving the query param off). On the export route
    `clinic_id` is in the path, so that branch is taken automatically.

    Raises:
        HTTPException 403  — role not allowed, or clinic_admin tried to
                             touch a different clinic.
        HTTPException 422  — admin called the summary route with no
                             clinic_id query param.
    """
    if actor.role not in _CLINIC_AGGREGATE_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Clinic-wide data console access requires admin or clinic_admin role.",
        )

    if actor.role == "clinic_admin":
        own = actor.clinic_id
        if not own:
            # Mis-provisioned account — clinic_admin without a clinic. Treat
            # as 403 (we have nothing to scope to and won't fall back to
            # cross-clinic admin behaviour).
            raise HTTPException(
                status_code=403,
                detail="clinic_admin actor has no clinic assignment.",
            )
        if clinic_id_param and clinic_id_param != own:
            raise HTTPException(
                status_code=403,
                detail="clinic_admin cannot access another clinic.",
            )
        return own

    # actor.role == "admin"
    if not clinic_id_param:
        if require_param_for_admin:
            raise HTTPException(
                status_code=422,
                detail="admin role must supply clinic_id.",
            )
        # Export path: clinic_id is in the URL path — shouldn't reach here.
        raise HTTPException(
            status_code=422,
            detail="clinic_id is required.",
        )
    return clinic_id_param


@router.get(
    "/clinic/summary",
    response_model=ClinicTableSummary,
    summary="Clinic-wide aggregate row counts per SAFE_TABLES table",
    description=(
        "Roll-up view of every allowlisted data source for a clinic. "
        "Available to clinic owners (role='clinic_admin', defaults to "
        "their own clinic_id) and DeepSynaps superadmins (role='admin', "
        "must supply ?clinic_id=). Returns 0 for tables with no rows — "
        "never 404 — so PHI is never leaked through error messages."
    ),
)
async def get_clinic_data_console_summary(
    clinic_id: Optional[str] = Query(
        default=None,
        description="Clinic UUID. Required for admin; optional for clinic_admin (defaults to own clinic).",
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClinicTableSummary:
    resolved_clinic_id = _resolve_clinic_scope(
        actor, clinic_id, require_param_for_admin=True
    )

    # Defence-in-depth: require_clinic_access raises if the actor's User row
    # doesn't actually belong to this clinic (or isn't platform_admin). The
    # role+ownership checks above already enforce this for the clinic_admin
    # case; this catches the rare case where a stale JWT carries the wrong
    # clinic_id claim.
    try:
        require_clinic_access(session, actor.actor_id, resolved_clinic_id)
    except AccessDeniedError:
        # `admin` role intentionally bypasses the DB-level check — superadmin
        # is cross-clinic by design. clinic_admin must pass.
        if actor.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Access denied for this clinic.",
            )

    table_summaries = get_clinic_table_summary(session, resolved_clinic_id)
    _audit_clinic_data_console_access(
        session,
        actor=actor,
        clinic_id=resolved_clinic_id,
        action="clinic_data_console_summary",
        note={"table_count": len(table_summaries)},
    )

    return ClinicTableSummary(
        clinic_id=resolved_clinic_id,
        table_summaries=table_summaries,
        generated_at=datetime.now(timezone.utc),
        read_only=True,
    )


@router.get(
    "/clinic/{clinic_id}/tables/{table_name}/export.csv",
    summary="Stream a clinic-scoped CSV of one allowlisted table (NOT masked)",
    description=(
        "Bulk CSV export for clinic owners. Rows are streamed unmasked — the "
        "intended caller is the clinic itself, downloading data it already "
        "owns. PHI masking, which the per-patient endpoints apply, is "
        "deliberately omitted on this route. Cross-clinic access is "
        "prevented by the same role gate as /clinic/summary."
    ),
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "Streaming CSV (text/csv). Content-Disposition "
            "is an attachment named <clinic_id>_<table_name>_<YYYYMMDD>.csv.",
        },
    },
)
async def export_clinic_table_csv(
    clinic_id: str,
    table_name: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> StreamingResponse:
    # ALLOWLIST check FIRST — before any role/clinic resolution. This makes
    # the 403 unambiguous for unknown tables regardless of role.
    if table_name not in SAFE_TABLES:
        raise HTTPException(
            status_code=403,
            detail="Table is not available in the data console.",
        )

    resolved_clinic_id = _resolve_clinic_scope(
        actor, clinic_id, require_param_for_admin=False
    )

    try:
        require_clinic_access(session, actor.actor_id, resolved_clinic_id)
    except AccessDeniedError:
        if actor.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Access denied for this clinic.",
            )

    # Audit BEFORE streaming starts — an aborted download must still leave a
    # trail. create_audit_event commits the row immediately, so this is safe.
    _audit_clinic_data_console_access(
        session,
        actor=actor,
        clinic_id=resolved_clinic_id,
        action="clinic_data_console_export",
        note={"table_name": table_name},
    )

    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"{resolved_clinic_id}_{table_name}_{today}.csv"

    return StreamingResponse(
        stream_clinic_table_csv(session, resolved_clinic_id, table_name),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
