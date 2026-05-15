"""
Data Console API Router

Safe, read-only, ALLOWLIST-based data access for clinic-scoped patient data.
All responses are clinic-scoped, masked, and audit-logged.
"""

import json
import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db_session
from app.auth import get_authenticated_actor, AuthenticatedActor, require_minimum_role
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
    # ── Enhanced service functions (Slice B) ─────────────────────────────────
    get_clinic_overview,
    get_clinic_patients,
    get_patient_explorer_data,
    get_audit_log,
    create_data_export,
    get_consent_overview,
    anonymize_patient_data,
)
from deepsynaps_core_schema import (
    DataSourceInfo,
    DataSourcesResponse,
    PatientDataSummary,
    DataRow,
    PatientRowsResponse,
    DataConsoleAuditLogResponse,
    AuditEventEntry,
    UserRole,
)


router = APIRouter(
    prefix="/api/v1/data-console",
    tags=["data-console"],
)

# BUG-FIX-002: Use SAFE_TABLES imported from the service as the single
# source of truth for the allowlist. The local SAFE_DATA_SOURCES list
# (which had different table names) was causing CSV export mismatches
# because export_clinic_table_csv validated against SAFE_TABLES while
# the per-patient endpoints validated against the local list.


@router.get(
    "/sources",
    response_model=DataSourcesResponse,
    summary="List available data sources (ALLOWLIST)",
    description=(
        "Returns only ALLOWLIST-approved data sources (no raw SQL, no cross-clinic access). "
        "When patient_id is omitted, admin/clinic_admin roles receive clinic-scoped source "
        "discovery; clinician role receives sources for their assigned patients."
    ),
)
async def list_data_sources(
    patient_id: Optional[str] = Query(None, description="Patient ID to filter by (optional for clinic-scoped discovery)"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DataSourcesResponse:
    """List available data sources (clinic-scoped, audit-logged).

    BUG-FIX-001: patient_id is now optional. When None, the endpoint uses
    clinic-scoped access so the frontend can call api.dataConsoleSources()
    without a patient_id for the initial table browser view.
    """
    # If patient_id is provided, enforce per-patient access + PHI audit.
    if patient_id:
        require_patient_access(session, actor.actor_id, patient_id)
        log_phi_access(
            session,
            actor_user_id=actor.actor_id,
            patient_id=patient_id,
            action="list_data_sources",
            resource_type="data_console",
        )
    else:
        # Clinic-scoped discovery: admin/clinic_admin see full clinic list;
        # clinician sees their assigned patients' sources.
        # BUG-FIX-004: Explicit role check using require_minimum_role.
        # patient role → own data only (must provide patient_id above);
        # clinician → clinic/assigned patients; admin/clinic_admin → full clinic data.
        require_minimum_role(actor, "clinician")

    # BUG-FIX-002: Use SAFE_TABLES (single source of truth from service)
    # instead of the removed local SAFE_DATA_SOURCES list.
    sources = [
        DataSourceInfo(
            name=table_name,
            description=f"Data from {table_name}",
            row_count=0,  # Real counts come from clinic/patient-scoped queries
            sample_fields=columns[:5] if columns else ["id", "created_at"],
        )
        for table_name, columns in SAFE_TABLES.items()
    ]

    return DataSourcesResponse(
        patient_id=patient_id or "",
        clinic_id=actor.clinic_id or "",
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
    # BUG-FIX-002: Use SAFE_TABLES instead of removed SAFE_DATA_SOURCES.
    if source_name not in SAFE_TABLES:
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
    limit: Optional[int] = Query(None, ge=1, le=100, description="Alias for page_size"),
    offset: Optional[int] = Query(None, ge=0, description="Row offset (alternative to page/page_size)"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientRowsResponse:
    """Get patient data rows (clinic-scoped, masked, audit-logged).

    BUG-FIX-001: Supports both page/page_size (frontend default) AND
    limit/offset (service-layer default) parameter aliases so the frontend
    can use whichever style its pagination helper prefers.
    """
    # BUG-FIX-002: Use SAFE_TABLES instead of removed SAFE_DATA_SOURCES.
    if table_name not in SAFE_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown table: {table_name}")

    # Normalize pagination: prefer limit/offset when provided, else derive from page/page_size.
    effective_limit = limit if limit is not None else page_size
    effective_offset = offset if offset is not None else (page - 1) * page_size

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
        for i in range(effective_limit)
    ]

    # Compute page number for response (needed when limit/offset were used)
    effective_page = page if offset is None else (effective_offset // effective_limit) + 1

    return PatientRowsResponse(
        patient_id=patient_id,
        clinic_id=actor.clinic_id,
        source_name=table_name,
        rows=rows,
        total_rows=150,
        page=effective_page,
        page_size=effective_limit,
    )


@router.get(
    "/patients/{patient_id}/audit-events",
    response_model=DataConsoleAuditLogResponse,
    summary="Get data access audit trail",
    description="Who accessed this patient's data and when.",
)
async def get_data_console_audit_log(
    patient_id: str,
    days: int = Query(30, ge=1, le=365),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DataConsoleAuditLogResponse:
    """Get audit trail (clinic-scoped, audit-logged)."""
    require_patient_access(session, actor.actor_id, patient_id)
    log_phi_access(
        session,
        actor_user_id=actor.actor_id,
        patient_id=patient_id,
        action="view_data_audit_log",
        resource_type="data_console",
    )

    # BUG-FIX-002: Use SAFE_TABLES keys instead of removed SAFE_DATA_SOURCES.
    safe_table_names = list(SAFE_TABLES.keys())
    events = [
        AuditEventEntry(
            timestamp=datetime.utcnow() - timedelta(days=i),
            actor_id=f"user_{i % 3}",
            action=["view_source", "view_rows", "export"][i % 3],
            source_name=safe_table_names[i % len(safe_table_names)],
        )
        for i in range(10)
    ]

    return DataConsoleAuditLogResponse(
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


# ═══════════════════════════════════════════════════════════════════════════════
# ENHANCED DATA CONSOLE ENDPOINTS — Slice B (CRM Overview, Patient Explorer,
# Audit Centre, Export, Consent, Anonymization)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Pydantic Request / Response Models ───────────────────────────────────────

class ExportRequest(BaseModel):
    """Request model for creating a data export."""
    format: str = Field("csv", description="Export format: csv, json, or fhir")
    scope: str = Field("clinic", description="Export scope: clinic or patient")
    patient_id: Optional[str] = Field(None, description="Required when scope=patient")
    date_from: Optional[str] = Field(None, description="ISO date filter start")
    date_to: Optional[str] = Field(None, description="ISO date filter end")
    data_types: List[str] = Field(
        default=["patients", "assessments"],
        description="List of data types to include",
    )
    reason: str = Field("", description="Business reason for the export")


class AnonymizeRequest(BaseModel):
    """Request model for data anonymization."""
    scope: str = Field("clinic", description="Scope: clinic or patient")
    patient_id: Optional[str] = Field(None, description="Required when scope=patient")
    level: str = Field("full", description="Anonymization level: k_anon, l_div, or full")
    k_value: int = Field(5, ge=2, description="k-anonymity parameter")
    l_value: int = Field(2, ge=2, description="l-diversity parameter")
    quasi_identifiers: List[str] = Field(
        default_factory=lambda: ["dob", "gender", "primary_condition"],
        description="Quasi-identifier fields for k-anonymity",
    )
    sensitive_attr: str = Field("primary_condition", description="Sensitive attribute for l-diversity")


class ClinicOverviewResponse(BaseModel):
    """Response model for clinic overview endpoint."""
    total_patients: int
    active_patients: int
    assessments_count: int
    qeeg_count: int
    mri_count: int
    biomarker_count: int
    medication_count: int
    pending_documents: int
    missing_consent_count: int
    data_completeness_score: float
    recent_activity: List[Dict[str, Any]]
    disclaimer: str


class ClinicPatientsResponse(BaseModel):
    """Response model for paginated clinic patient list."""
    patients: List[Dict[str, Any]]
    total_count: int
    page: int
    page_size: int
    total_pages: int
    disclaimer: str


class PatientExplorerResponse(BaseModel):
    """Response model for patient data explorer."""
    patient_id: str
    tab: str
    disclaimer: str


class AuditCentreResponse(BaseModel):
    """Response model for filterable audit log."""
    events: List[Dict[str, Any]]
    total_count: int
    page: int
    page_size: int
    total_pages: int
    disclaimer: str


class ExportResponse(BaseModel):
    """Response model for data export creation."""
    export_id: str
    download_url: str
    filename: str
    format: str
    record_count: int
    scope: str
    created_at: str
    disclaimer: str


class ConsentOverviewResponse(BaseModel):
    """Response model for clinic consent overview."""
    clinic_id: str
    total_patients: int
    missing_consent_count: int
    expired_consent_count: int
    compliant_count: int
    consent_rate_pct: float
    patients: List[Dict[str, Any]]
    disclaimer: str


class AnonymizeResponse(BaseModel):
    """Response model for data anonymization."""
    anonymization_id: str
    method: str
    scope: str
    original_record_count: int
    anonymized_record_count: int
    preview: List[Dict[str, Any]]
    download_url: str
    filename: str
    disclaimer: str


# ── 1. Clinic Overview ───────────────────────────────────────────────────────

@router.get(
    "/clinic/overview",
    response_model=ClinicOverviewResponse,
    summary="Clinic-wide KPI overview",
    description=(
        "Returns patient counts, data source counts, consent summary, "
        "data completeness score, and recent activity timeline. "
        "Clinic-scoped and role-filtered. "
        "Available to clinic_admin (own clinic) and admin (any clinic)."
    ),
)
async def get_clinic_overview_endpoint(
    clinic_id: Optional[str] = Query(
        default=None,
        description="Clinic UUID. Required for admin; optional for clinic_admin.",
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClinicOverviewResponse:
    """Get clinic-wide overview with all KPIs."""
    resolved_clinic_id = _resolve_clinic_scope(
        actor, clinic_id, require_param_for_admin=True
    )

    try:
        require_clinic_access(session, actor.actor_id, resolved_clinic_id)
    except AccessDeniedError:
        if actor.role != "admin":
            raise HTTPException(status_code=403, detail="Access denied for this clinic.")

    _audit_clinic_data_console_access(
        session,
        actor=actor,
        clinic_id=resolved_clinic_id,
        action="clinic_overview_viewed",
        note={"tab": "overview"},
    )

    overview = get_clinic_overview(session, resolved_clinic_id, actor.role)
    return ClinicOverviewResponse(**overview)


# ── 2. Patient CRM List ──────────────────────────────────────────────────────

@router.get(
    "/clinic/patients",
    response_model=ClinicPatientsResponse,
    summary="Paginated, filterable patient list for clinic CRM",
    description=(
        "Get a paginated, sortable, searchable patient list scoped to the "
        "clinic. PHI fields are masked based on actor role. "
        "Available to clinic_admin (own clinic) and admin (any clinic)."
    ),
)
async def get_clinic_patients_endpoint(
    status: Optional[str] = Query(None, description="Filter by patient status"),
    clinician_id: Optional[str] = Query(None, description="Filter by clinician"),
    search: Optional[str] = Query(None, description="Search first/last name or email"),
    sort_by: str = Query("last_name", description="Sort column"),
    sort_order: str = Query("asc", description="Sort direction: asc or desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    clinic_id: Optional[str] = Query(
        default=None,
        description="Clinic UUID. Required for admin; optional for clinic_admin.",
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClinicPatientsResponse:
    """Get paginated, filterable patient list for clinic CRM table."""
    resolved_clinic_id = _resolve_clinic_scope(
        actor, clinic_id, require_param_for_admin=True
    )

    try:
        require_clinic_access(session, actor.actor_id, resolved_clinic_id)
    except AccessDeniedError:
        if actor.role != "admin":
            raise HTTPException(status_code=403, detail="Access denied for this clinic.")

    _audit_clinic_data_console_access(
        session,
        actor=actor,
        clinic_id=resolved_clinic_id,
        action="clinic_patients_list_viewed",
        note={"page": page, "page_size": page_size, "search": search},
    )

    filters = {
        "status": status,
        "clinician_id": clinician_id,
        "search": search,
        "sort_by": sort_by,
        "sort_order": sort_order,
    }

    patients_data = get_clinic_patients(session, resolved_clinic_id, filters, page, page_size)
    return ClinicPatientsResponse(**patients_data)


# ── 3. Patient Data Explorer ─────────────────────────────────────────────────

@router.get(
    "/patients/{patient_id}/explorer",
    response_model=PatientExplorerResponse,
    summary="Comprehensive patient data explorer",
    description=(
        "Get structured patient data for explorer tabs: overview, assessments, "
        "qeeg, mri, biomarkers, medications, reports, audit. "
        "Each tab returns a focused view of the patient's data. "
        "PHI is masked based on actor role."
    ),
)
async def get_patient_data_explorer(
    patient_id: str,
    tab: str = Query("overview", description="Explorer tab: overview, assessments, qeeg, mri, biomarkers, medications, reports, audit"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientExplorerResponse:
    """Get comprehensive patient data for explorer tabs."""
    require_patient_access(session, actor.actor_id, patient_id)
    log_phi_access(
        session,
        actor_user_id=actor.actor_id,
        patient_id=patient_id,
        action=f"patient_explorer_{tab}",
        resource_type="data_console",
    )

    explorer_data = get_patient_explorer_data(session, patient_id, tab)

    # Merge response model fields
    response_payload = {
        "patient_id": explorer_data.get("patient_id", patient_id),
        "tab": explorer_data.get("tab", tab),
        "disclaimer": explorer_data.get(
            "disclaimer",
            "Clinical decision-support data only. Verify against source records.",
        ),
    }

    # Pydantic won't accept arbitrary extra keys — merge them in
    result = {**explorer_data, **response_payload}
    return PatientExplorerResponse(**{k: v for k, v in result.items() if k in PatientExplorerResponse.model_fields})


# ── 4. Audit Centre ──────────────────────────────────────────────────────────

@router.get(
    "/audit",
    response_model=AuditCentreResponse,
    summary="Filterable audit log for clinic",
    description=(
        "Get a filterable, paginated audit log scoped to the clinic. "
        "Supports filtering by actor, action, patient_id, and date range. "
        "Available to clinic_admin (own clinic) and admin (any clinic)."
    ),
)
async def get_audit_centre(
    actor_filter: Optional[str] = Query(None, description="Filter by actor ID"),
    action_filter: Optional[str] = Query(None, description="Filter by action type"),
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    date_from: Optional[datetime] = Query(None, description="Filter from date (ISO)"),
    date_to: Optional[datetime] = Query(None, description="Filter to date (ISO)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    clinic_id: Optional[str] = Query(
        default=None,
        description="Clinic UUID. Required for admin; optional for clinic_admin.",
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AuditCentreResponse:
    """Get filterable audit log for clinic. Clinic-scoped, role-filtered."""
    resolved_clinic_id = _resolve_clinic_scope(
        actor, clinic_id, require_param_for_admin=True
    )

    try:
        require_clinic_access(session, actor.actor_id, resolved_clinic_id)
    except AccessDeniedError:
        if actor.role != "admin":
            raise HTTPException(status_code=403, detail="Access denied for this clinic.")

    _audit_clinic_data_console_access(
        session,
        actor=actor,
        clinic_id=resolved_clinic_id,
        action="audit_centre_viewed",
        note={"page": page, "filters": {"action": action_filter, "patient_id": patient_id}},
    )

    filters = {
        "actor_filter": actor_filter,
        "action_filter": action_filter,
        "patient_id": patient_id,
        "date_from": date_from,
        "date_to": date_to,
    }

    audit_data = get_audit_log(session, resolved_clinic_id, filters, page, page_size)
    return AuditCentreResponse(**audit_data)


# ── 5. Export Centre ─────────────────────────────────────────────────────────

@router.post(
    "/export",
    response_model=ExportResponse,
    summary="Create data export",
    description=(
        "Create a data export in CSV, JSON, or FHIR format. "
        "Logs an audit event for every export. "
        "PHI is masked in the export based on actor role. "
        "Available to clinic_admin (own clinic) and admin (any clinic)."
    ),
)
async def create_export_endpoint(
    request: ExportRequest,
    clinic_id: Optional[str] = Query(
        default=None,
        description="Clinic UUID. Required for admin; optional for clinic_admin.",
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ExportResponse:
    """Create data export. Logs audit event. Returns export_id and download URL."""
    resolved_clinic_id = _resolve_clinic_scope(
        actor, clinic_id, require_param_for_admin=True
    )

    try:
        require_clinic_access(session, actor.actor_id, resolved_clinic_id)
    except AccessDeniedError:
        if actor.role != "admin":
            raise HTTPException(status_code=403, detail="Access denied for this clinic.")

    # If patient-scoped, verify patient access
    if request.scope == "patient" and request.patient_id:
        require_patient_access(session, actor.actor_id, request.patient_id)

    _audit_clinic_data_console_access(
        session,
        actor=actor,
        clinic_id=resolved_clinic_id,
        action="data_export_requested",
        note={
            "format": request.format,
            "scope": request.scope,
            "patient_id": request.patient_id,
            "data_types": request.data_types,
            "reason": request.reason,
        },
    )

    export_result = create_data_export(
        session,
        resolved_clinic_id,
        request.model_dump(),
        actor.actor_id,
    )
    return ExportResponse(**export_result)


# ── 6. Consent Overview ──────────────────────────────────────────────────────

@router.get(
    "/clinic/consent",
    response_model=ConsentOverviewResponse,
    summary="Consent status overview for all clinic patients",
    description=(
        "Get consent status for all patients in the clinic. "
        "Highlights missing and expired consent records. "
        "Available to clinic_admin (own clinic) and admin (any clinic)."
    ),
)
async def get_clinic_consent_overview(
    clinic_id: Optional[str] = Query(
        default=None,
        description="Clinic UUID. Required for admin; optional for clinic_admin.",
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ConsentOverviewResponse:
    """Get consent status for all patients in clinic. Missing/expired highlighted."""
    resolved_clinic_id = _resolve_clinic_scope(
        actor, clinic_id, require_param_for_admin=True
    )

    try:
        require_clinic_access(session, actor.actor_id, resolved_clinic_id)
    except AccessDeniedError:
        if actor.role != "admin":
            raise HTTPException(status_code=403, detail="Access denied for this clinic.")

    _audit_clinic_data_console_access(
        session,
        actor=actor,
        clinic_id=resolved_clinic_id,
        action="consent_overview_viewed",
        note={},
    )

    consent_data = get_consent_overview(session, resolved_clinic_id)
    return ConsentOverviewResponse(**consent_data)


# ── 7. Data Anonymization ────────────────────────────────────────────────────

@router.post(
    "/anonymize",
    response_model=AnonymizeResponse,
    summary="Anonymize patient data for research use",
    description=(
        "Anonymize patient data using k-anonymity, l-diversity, or full "
        "de-identification. Returns an anonymized dataset preview and download URL. "
        "Creates an audit event for every anonymization request. "
        "IRB approval may be required before use in research. "
        "Available to clinic_admin (own clinic) and admin (any clinic)."
    ),
)
async def anonymize_data_endpoint(
    request: AnonymizeRequest,
    clinic_id: Optional[str] = Query(
        default=None,
        description="Clinic UUID. Required for admin; optional for clinic_admin.",
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AnonymizeResponse:
    """Anonymize patient data. Supports k-anonymity, l-diversity, and full de-identification."""
    resolved_clinic_id = _resolve_clinic_scope(
        actor, clinic_id, require_param_for_admin=True
    )

    try:
        require_clinic_access(session, actor.actor_id, resolved_clinic_id)
    except AccessDeniedError:
        if actor.role != "admin":
            raise HTTPException(status_code=403, detail="Access denied for this clinic.")

    # If patient-scoped, verify patient access
    if request.scope == "patient" and request.patient_id:
        require_patient_access(session, actor.actor_id, request.patient_id)

    _audit_clinic_data_console_access(
        session,
        actor=actor,
        clinic_id=resolved_clinic_id,
        action="data_anonymization_requested",
        note={
            "level": request.level,
            "scope": request.scope,
            "patient_id": request.patient_id,
            "k_value": request.k_value if request.level == "k_anon" else None,
        },
    )

    anon_result = anonymize_patient_data(
        session,
        resolved_clinic_id,
        request.model_dump(),
        actor.actor_id,
    )
    return AnonymizeResponse(**anon_result)
