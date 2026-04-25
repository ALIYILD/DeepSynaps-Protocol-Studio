"""Data privacy router — /api/v1/privacy.

GDPR Article 20 (right to portability) implementation. Users can request an
asynchronous ZIP export of every table linked to their account; the job is
persisted in ``data_exports`` and the actual bundling happens in
``services.data_export_service`` via FastAPI ``BackgroundTasks`` (no Celery
dependency for v0).

Endpoints:
  POST   /api/v1/privacy/export           -> {export_id, status: "queued"}
  GET    /api/v1/privacy/exports          -> {items: [...]}, newest 20
  GET    /api/v1/privacy/exports/{id}     -> DataExport (file_url if ready)
  DELETE /api/v1/privacy/exports/{id}     -> {deleted: true}

Lazy retention: on GET-by-id, exports older than 7 days that are still
``ready`` are marked ``expired`` and the on-disk file is removed. There is
no cron job for this in v0 — the transition happens opportunistically when
the owning user revisits their exports list.

See apps/api/SETTINGS_API_DESIGN.md — Data privacy router for the full spec.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db_session
from ..errors import ApiServiceError
from ..limiter import limiter
from ..persistence.models import DataExport, User
from ..services import auth_service
from ..services.data_export_service import delete_export_file, run_export

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/privacy", tags=["privacy"])

# Ready exports older than this are treated as expired on next GET; their
# file is cleaned up from disk and ``file_url`` is cleared.
EXPORT_TTL = timedelta(days=7)

# Cap the history list — exports are relatively large artefacts, no need to
# return a user's whole multi-year history on the Settings page.
HISTORY_LIMIT = 20


# ── Pydantic models ───────────────────────────────────────────────────────────


class DataExportResponse(BaseModel):
    id: str
    status: str  # queued / running / ready / failed / expired
    file_url: Optional[str] = None
    file_bytes: Optional[int] = None
    requested_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None


class DataExportsListResponse(BaseModel):
    items: list[DataExportResponse]


class DataExportCreateResponse(BaseModel):
    export_id: str
    status: str = "queued"


class DataExportDeleteResponse(BaseModel):
    deleted: bool = True


# ── Helpers ───────────────────────────────────────────────────────────────────


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _to_response(row: DataExport) -> DataExportResponse:
    requested = _iso(row.requested_at) or ""
    return DataExportResponse(
        id=row.id,
        status=row.status,
        file_url=row.file_url,
        file_bytes=row.file_bytes,
        requested_at=requested,
        completed_at=_iso(row.completed_at),
        error=row.error,
    )


def _maybe_expire(db: Session, row: DataExport) -> DataExport:
    """Opportunistic 7-day TTL enforcement — if the export is ``ready`` and
    older than EXPORT_TTL, mark it ``expired`` and remove the file. Returns
    the (possibly-mutated) row."""
    if row.status != "ready" or row.completed_at is None:
        return row
    completed = row.completed_at
    if completed.tzinfo is None:
        completed = completed.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - completed <= EXPORT_TTL:
        return row
    # Expired — clean up.
    delete_export_file(row.id)
    row.status = "expired"
    row.file_url = None
    row.file_bytes = None
    db.commit()
    return row


def _owned_export_or_404(db: Session, export_id: str, user: User) -> DataExport:
    row = db.get(DataExport, export_id)
    if row is None or row.user_id != user.id:
        # Do NOT leak whether the ID exists for another user — a flat 404.
        raise ApiServiceError(
            code="export_not_found",
            message="Data export not found.",
            status_code=404,
        )
    return row


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/export", response_model=DataExportCreateResponse)
@limiter.limit("1/day")
def create_export(
    request: Request,
    background_tasks: BackgroundTasks,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> DataExportCreateResponse:
    """Queue a new GDPR data export.

    Rate-limited to 1/day (shared with SlowAPI's IP-based default — if the
    same user hits this from multiple IPs they effectively get more than one
    job, which is acceptable v0 behaviour).

    The actual bundling happens in a BackgroundTask. The response returns
    immediately with the queued job id so the client can poll
    ``GET /privacy/exports/{id}``.
    """
    export_id = str(uuid.uuid4())
    row = DataExport(
        id=export_id,
        user_id=user.id,
        clinic_id=user.clinic_id,
        status="queued",
        requested_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()

    # Schedule the worker to run after the response has been returned.
    background_tasks.add_task(run_export, export_id, user.id)

    logger.info(
        "[data-export] queued %s for user=%s clinic=%s",
        export_id,
        user.id,
        user.clinic_id,
    )
    return DataExportCreateResponse(export_id=export_id, status="queued")


@router.get("/exports", response_model=DataExportsListResponse)
def list_exports(
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> DataExportsListResponse:
    """Return this user's last ``HISTORY_LIMIT`` exports, newest first."""
    stmt = (
        select(DataExport)
        .where(DataExport.user_id == user.id)
        .order_by(DataExport.requested_at.desc())
        .limit(HISTORY_LIMIT)
    )
    rows = db.execute(stmt).scalars().all()
    return DataExportsListResponse(items=[_to_response(row) for row in rows])


@router.get("/exports/{export_id}", response_model=DataExportResponse)
def get_export(
    export_id: str,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> DataExportResponse:
    """Return a single export row. 404 if the export does not exist OR is
    owned by a different user (we don't differentiate the two cases on
    purpose — no ID enumeration).

    Side effect: if the export is ``ready`` but older than 7 days it is
    lazily flipped to ``expired`` and the file is deleted from disk before
    the response is built.
    """
    row = _owned_export_or_404(db, export_id, user)
    row = _maybe_expire(db, row)
    return _to_response(row)


@router.delete("/exports/{export_id}", response_model=DataExportDeleteResponse)
def delete_export(
    export_id: str,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> DataExportDeleteResponse:
    """Delete an export — removes the ZIP from disk and the row from DB."""
    row = _owned_export_or_404(db, export_id, user)
    delete_export_file(export_id)
    db.delete(row)
    db.commit()
    logger.info("[data-export] deleted %s (user=%s)", export_id, user.id)
    return DataExportDeleteResponse(deleted=True)
