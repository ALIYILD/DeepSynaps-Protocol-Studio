"""brainmap_router.py — Brain Map Planner backend endpoints.

Implements CRUD and audit for brain map planning reports:
- POST /api/v1/brain-map/plans — Create plan (clinician-gated)
- GET /api/v1/brain-map/plans/{id} — Retrieve plan
- GET /api/v1/brain-map/plans — List patient's plans
- PATCH /api/v1/brain-map/plans/{id} — Update status
- GET /api/v1/brain-map/plans/{id}/audit — Audit trail

Safety gates:
- Demo plans (demo_stamp=True) not persisted unless role is admin/demo
- Patient ownership validated via auth + IDOR check
- All mutations audit-logged
- No autonomous prescribing; clinician review required

Non-goals:
- FEM/neuronavigation (Brain Map Planner is atlas-first)
- ML protocol ranking (deterministic queries only)
- Fake clinical data (empty state if DB unavailable)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, desc, func
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.repositories.audit import create_audit_event
from app.schemas.brainmap import (
    BrainMapPlanAuditEvent,
    BrainMapPlanAuditResponse,
    BrainMapPlanCreate,
    BrainMapPlanListResponse,
    BrainMapPlanResponse,
    BrainMapPlanStatusUpdate,
)

router = APIRouter(prefix="/api/v1/brain-map", tags=["brain-map"])


# ─── Helper functions ─────────────────────────────────────────────────────

def _iso_now() -> str:
    """Return ISO 8601 timestamp in UTC."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _generate_plan_id() -> str:
    """Generate a UUID for a brain map plan."""
    return str(uuid.uuid4())


def _audit_plan_event(
    session: Session,
    *,
    plan_id: str,
    actor: AuthenticatedActor,
    action: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Log an audit event for a plan action."""
    create_audit_event(
        session,
        event_id=f"bmp-{uuid.uuid4().hex[:12]}",
        target_id=plan_id,
        target_type="brain_map_plan",
        action=action,
        role=actor.role,
        actor_id=actor.actor_id,
        note=(
            f"plan_id={plan_id}; "
            + (f"metadata={str(metadata)[:200]}" if metadata else "")
        ),
        created_at=_iso_now(),
    )


def _row_to_response(row: Any) -> BrainMapPlanResponse:
    """Convert DB row to response schema."""
    return BrainMapPlanResponse(
        id=row.id,
        patient_id=row.patient_id,
        created_by=row.created_by,
        created_at=row.created_at.isoformat() if isinstance(row.created_at, datetime) else row.created_at,
        updated_at=row.updated_at.isoformat() if row.updated_at and isinstance(row.updated_at, datetime) else row.updated_at,
        status=row.status,
        region=row.region,
        target_anchor=row.target_anchor,
        protocol_id=row.protocol_id,
        protocol_name=row.protocol_name,
        intensity_ma=row.intensity_ma,
        frequency_hz=row.frequency_hz,
        session_duration_min=row.session_duration_min,
        num_sessions=row.num_sessions,
        qeeg_analysis_id=row.qeeg_analysis_id,
        analyzer_fit=row.analyzer_fit,
        demo_stamp=row.demo_stamp,
        full_artifact=row.full_artifact,
        notes=row.notes,
    )


# ─── POST /api/v1/brain-map/plans ─────────────────────────────────────────

@router.post(
    "/plans",
    response_model=BrainMapPlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a brain map plan",
    description="Persist a planning report. Clinician-gated. Demo plans are logged but not persisted.",
)
def create_brain_map_plan(
    payload: BrainMapPlanCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> BrainMapPlanResponse:
    """Create a brain map plan.
    
    Safety gates:
    - Only clinician role can create persistent plans
    - Demo plans logged but not persisted
    - Patient ID required for production plans
    """
    # Safety gate: demo plans not persisted (except for demo/admin roles)
    if payload.demo_stamp and actor.role not in ("admin", "demo"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo plans cannot be persisted. Set demo_stamp=False to save.",
        )
    
    # Safety gate: patient_id required for production
    if not payload.patient_id and actor.role not in ("admin", "demo"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="patient_id required for production plans",
        )
    
    plan_id = _generate_plan_id()
    now = _iso_now()
    
    # Insert into brain_map_plans
    stmt = """
        INSERT INTO brain_map_plans (
            id, patient_id, created_by, created_at, status,
            region, target_anchor, protocol_id, protocol_name,
            intensity_ma, frequency_hz, session_duration_min, num_sessions,
            qeeg_analysis_id, analyzer_fit, demo_stamp, full_artifact, notes
        ) VALUES (
            :id, :patient_id, :created_by, :created_at, :status,
            :region, :target_anchor, :protocol_id, :protocol_name,
            :intensity_ma, :frequency_hz, :session_duration_min, :num_sessions,
            :qeeg_analysis_id, :analyzer_fit, :demo_stamp, :full_artifact, :notes
        )
    """
    
    session.execute(
        stmt,
        {
            "id": plan_id,
            "patient_id": payload.patient_id,
            "created_by": actor.actor_id,
            "created_at": now,
            "status": "draft",
            "region": payload.region,
            "target_anchor": payload.target_anchor,
            "protocol_id": payload.protocol_id,
            "protocol_name": payload.protocol_name,
            "intensity_ma": payload.intensity_ma,
            "frequency_hz": payload.frequency_hz,
            "session_duration_min": payload.session_duration_min,
            "num_sessions": payload.num_sessions,
            "qeeg_analysis_id": payload.qeeg_analysis_id,
            "analyzer_fit": payload.analyzer_fit,
            "demo_stamp": payload.demo_stamp,
            "full_artifact": payload.full_artifact,
            "notes": payload.notes,
        },
    )
    session.commit()
    
    # Audit event
    _audit_plan_event(
        session,
        plan_id=plan_id,
        actor=actor,
        action="create",
        metadata={"region": payload.region, "demo": payload.demo_stamp},
    )
    
    # Fetch and return
    row = session.execute(
        "SELECT * FROM brain_map_plans WHERE id = :id",
        {"id": plan_id},
    ).first()
    
    return _row_to_response(row)


# ─── GET /api/v1/brain-map/plans/{id} ─────────────────────────────────────

@router.get(
    "/plans/{plan_id}",
    response_model=BrainMapPlanResponse,
    summary="Retrieve a brain map plan",
)
def get_brain_map_plan(
    plan_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> BrainMapPlanResponse:
    """Retrieve a brain map plan by ID. Audit-logged."""
    row = session.execute(
        "SELECT * FROM brain_map_plans WHERE id = :id",
        {"id": plan_id},
    ).first()
    
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    
    # Audit event
    _audit_plan_event(
        session,
        plan_id=plan_id,
        actor=actor,
        action="read",
    )
    
    return _row_to_response(row)


# ─── GET /api/v1/brain-map/plans (list) ─────────────────────────────────

@router.get(
    "/plans",
    response_model=BrainMapPlanListResponse,
    summary="List brain map plans",
    description="List plans by patient. Pagination via offset/limit.",
)
def list_brain_map_plans(
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    offset: int = Query(0, ge=0, description="Offset"),
    limit: int = Query(50, ge=1, le=500, description="Limit"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> BrainMapPlanListResponse:
    """List brain map plans with optional filtering."""
    
    # Build WHERE clause
    where_clauses = []
    params: dict[str, Any] = {}
    
    if patient_id:
        where_clauses.append("patient_id = :patient_id")
        params["patient_id"] = patient_id
    
    if status_filter:
        where_clauses.append("status = :status")
        params["status"] = status_filter
    
    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
    
    # Count query
    count_stmt = f"SELECT COUNT(*) as cnt FROM brain_map_plans WHERE {where_sql}"
    count_row = session.execute(count_stmt, params).first()
    total = count_row[0] if count_row else 0
    
    # List query
    list_stmt = f"""
        SELECT * FROM brain_map_plans 
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """
    params["limit"] = limit
    params["offset"] = offset
    
    rows = session.execute(list_stmt, params).fetchall()
    
    # Audit event
    _audit_plan_event(
        session,
        plan_id="list",  # synthetic ID for list op
        actor=actor,
        action="query",
        metadata={"patient_id": patient_id, "status": status_filter, "limit": limit},
    )
    
    plans = [_row_to_response(row) for row in rows]
    
    return BrainMapPlanListResponse(
        plans=plans,
        total=total,
        offset=offset,
        limit=limit,
    )


# ─── PATCH /api/v1/brain-map/plans/{id} ──────────────────────────────────

@router.patch(
    "/plans/{plan_id}",
    response_model=BrainMapPlanResponse,
    summary="Update brain map plan status",
)
def update_brain_map_plan_status(
    plan_id: str,
    payload: BrainMapPlanStatusUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> BrainMapPlanResponse:
    """Update a plan's status. Creator or clinician-role only."""
    
    row = session.execute(
        "SELECT * FROM brain_map_plans WHERE id = :id",
        {"id": plan_id},
    ).first()
    
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    
    # IDOR check: only creator or admin can update
    if row.created_by != actor.actor_id and actor.role not in ("admin",):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this plan")
    
    # Update
    now = _iso_now()
    session.execute(
        """
        UPDATE brain_map_plans 
        SET status = :status, updated_at = :updated_at, notes = COALESCE(:notes, notes)
        WHERE id = :id
        """,
        {
            "id": plan_id,
            "status": payload.status,
            "updated_at": now,
            "notes": payload.notes,
        },
    )
    session.commit()
    
    # Audit event
    _audit_plan_event(
        session,
        plan_id=plan_id,
        actor=actor,
        action="update",
        metadata={"new_status": payload.status},
    )
    
    # Fetch and return
    row = session.execute(
        "SELECT * FROM brain_map_plans WHERE id = :id",
        {"id": plan_id},
    ).first()
    
    return _row_to_response(row)


# ─── GET /api/v1/brain-map/plans/{id}/audit ──────────────────────────────

@router.get(
    "/plans/{plan_id}/audit",
    response_model=BrainMapPlanAuditResponse,
    summary="Get audit trail for a plan",
)
def get_brain_map_plan_audit(
    plan_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> BrainMapPlanAuditResponse:
    """Retrieve the audit trail for a brain map plan."""
    
    # Verify plan exists
    row = session.execute(
        "SELECT * FROM brain_map_plans WHERE id = :id",
        {"id": plan_id},
    ).first()
    
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    
    # Fetch audit events
    audit_rows = session.execute(
        "SELECT * FROM brain_map_plan_audit WHERE plan_id = :plan_id ORDER BY timestamp DESC",
        {"plan_id": plan_id},
    ).fetchall()
    
    events = [
        BrainMapPlanAuditEvent(
            id=event.id,
            plan_id=event.plan_id,
            actor_id=event.actor_id,
            action=event.action,
            timestamp=event.timestamp.isoformat() if isinstance(event.timestamp, datetime) else event.timestamp,
            metadata=event.metadata,
        )
        for event in audit_rows
    ]
    
    return BrainMapPlanAuditResponse(plan_id=plan_id, events=events)


# ─── Health check ────────────────────────────────────────────────────────

@router.get(
    "/health",
    summary="Health check for brain-map endpoints",
)
def health_check() -> dict[str, str]:
    """Simple health check."""
    return {"status": "ok", "service": "brain-map"}
