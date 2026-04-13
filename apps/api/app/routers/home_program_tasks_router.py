"""Clinician home program tasks — persisted task JSON with validated ``homeProgramSelection``."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import ClinicianHomeProgramTask
from app.services.home_program_task_audit import (
    ACTION_CREATE_REPLAY,
    ACTION_FORCE_OVERWRITE,
    ACTION_LEGACY_PUT_CREATE,
    ACTION_RETRY_SUCCESS,
    ACTION_SYNC_CONFLICT,
    ACTION_TAKE_SERVER,
    log_home_program_audit,
)
from app.services.home_program_task_serialization import (
    enrich_task_dict_from_row,
    strip_client_transient_fields,
    strip_request_only_fields,
    task_dict_for_export_stub,
)
from app.services.home_program_tasks import (
    assert_patient_owned_by_clinician,
    get_task_by_server_task_id,
    list_tasks_for_clinician,
    load_task_dict,
    merge_provenance_from_previous,
    validate_and_normalize_task_dict,
)
from deepsynaps_core_schema import patient_safe_home_program_selection

router = APIRouter(prefix="/api/v1/home-program-tasks", tags=["Home Program Tasks"])

_EXTERNAL_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,96}$")
_SERVER_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


class HomeProgramTaskListResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int


class AuditActionRequest(BaseModel):
    external_task_id: str = Field(..., min_length=1, max_length=96)
    action: Literal["take_server", "retry_success"]
    server_revision: int | None = None


class HomeProgramTaskMutationResponse(BaseModel):
    """Task payload (from stored JSON + server metadata) plus explicit write disposition.

    Task fields are dynamic; ``createDisposition`` is the stable contract for how the row was written.
    """

    model_config = ConfigDict(extra="allow")

    createDisposition: Literal["created", "replay", "legacy_put_create"] | None = Field(
        default=None,
        description=(
            "POST: ``created`` (inserted) or ``replay`` (idempotent duplicate POST). "
            "PUT: ``legacy_put_create`` only when this PUT created a missing row (deprecated; prefer POST). "
            "Omitted on normal PUT updates."
        ),
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _validate_external_task_id(task_id: str) -> None:
    if not _EXTERNAL_ID_RE.match(task_id):
        raise ApiServiceError(
            code="invalid_external_task_id",
            message="Task id must be 1–96 characters: letters, digits, dot, underscore, hyphen.",
            status_code=422,
        )


def _validate_server_uuid(server_task_id: str) -> None:
    if not _SERVER_UUID_RE.match(server_task_id or ""):
        raise ApiServiceError(
            code="invalid_server_task_id",
            message="server_task_id must be a UUID.",
            status_code=422,
        )


def _row_to_response_dict(row: ClinicianHomeProgramTask) -> dict[str, Any]:
    base = load_task_dict(row.task_json)
    return enrich_task_dict_from_row(base, row)


def _post_task_response(
    *,
    row: ClinicianHomeProgramTask,
    disposition: Literal["created", "replay"],
    response: Response,
    actor: AuthenticatedActor,
    replay_note: str | None = None,
) -> HomeProgramTaskMutationResponse:
    if disposition == "replay":
        log_home_program_audit(
            server_task_id=row.server_task_id,
            external_task_id=row.id,
            action=ACTION_CREATE_REPLAY,
            actor_id=actor.actor_id,
            role=actor.role,
            note=replay_note or "Idempotent create — row already exists.",
        )
    response.headers["X-DS-Home-Task-Create"] = "new" if disposition == "created" else "replay"
    return HomeProgramTaskMutationResponse.model_validate(
        {**_row_to_response_dict(row), "createDisposition": disposition}
    )


@router.get("", response_model=HomeProgramTaskListResponse)
def list_home_program_tasks(
    patient_id: str | None = None,
    session: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HomeProgramTaskListResponse:
    require_minimum_role(actor, "clinician")
    rows = list_tasks_for_clinician(session, clinician_id=actor.actor_id, patient_id=patient_id)
    items = [_row_to_response_dict(r) for r in rows]
    return HomeProgramTaskListResponse(items=items, total=len(items))


@router.post(
    "",
    response_model=HomeProgramTaskMutationResponse,
    response_model_exclude_none=True,
    summary="Create home program task",
    description=(
        "Server-authoritative create: assigns ``serverTaskId`` and revision 1. "
        "Duplicate POST for the same clinician + patient + external id is **replay** (same row, same revision). "
        "See ``createDisposition`` in the body (preferred); ``X-DS-Home-Task-Create`` header is retained for compatibility."
    ),
)
def create_home_program_task(
    response: Response,
    body: dict[str, Any] = Body(...),
    session: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HomeProgramTaskMutationResponse:
    """Server-authoritative create. Idempotent: same external id + same patient + same clinician returns existing row."""
    require_minimum_role(actor, "clinician")
    raw = strip_request_only_fields(dict(body))
    raw.pop("lastKnownServerRevision", None)
    patient_id = raw.get("patientId")
    if not patient_id or not isinstance(patient_id, str):
        raise ApiServiceError(code="missing_patient", message="patientId is required.", status_code=422)
    task_id = raw.get("id")
    if not task_id or not isinstance(task_id, str):
        raise ApiServiceError(code="missing_task_id", message="id (external task id) is required for create.", status_code=422)
    _validate_external_task_id(task_id)
    assert_patient_owned_by_clinician(session, patient_id=patient_id, clinician_id=actor.actor_id)

    existing = session.get(ClinicianHomeProgramTask, task_id)
    if existing is not None:
        if existing.clinician_id != actor.actor_id:
            raise ApiServiceError(code="forbidden", message="Not allowed to access this task.", status_code=403)
        if existing.patient_id != patient_id:
            raise ApiServiceError(
                code="patient_mismatch",
                message="This external id already exists for another patient.",
                status_code=409,
            )
        return _post_task_response(
            row=existing,
            disposition="replay",
            response=response,
            actor=actor,
            replay_note="Idempotent create — row already exists.",
        )

    merged = merge_provenance_from_previous(
        {**strip_client_transient_fields(raw), "id": task_id, "patientId": patient_id},
        None,
    )
    normalized = validate_and_normalize_task_dict(merged)
    to_store = strip_client_transient_fields(normalized)
    payload = json.dumps(to_store, separators=(",", ":"), ensure_ascii=False)

    now = _now()
    row = ClinicianHomeProgramTask(
        id=task_id,
        server_task_id=str(uuid.uuid4()),
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        task_json=payload,
        revision=1,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        again = session.get(ClinicianHomeProgramTask, task_id)
        if (
            again is not None
            and again.clinician_id == actor.actor_id
            and again.patient_id == patient_id
        ):
            return _post_task_response(
                row=again,
                disposition="replay",
                response=response,
                actor=actor,
                replay_note="Create race resolved — concurrent insert.",
            )
        raise ApiServiceError(
            code="create_failed",
            message="Could not create task; retry or use GET to reconcile.",
            status_code=409,
        ) from None

    session.refresh(row)
    return _post_task_response(row=row, disposition="created", response=response, actor=actor)


@router.get("/by-server-id/{server_task_id}")
def get_home_program_task_by_server_id(
    server_task_id: str,
    session: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Lookup by authoritative server_task_id (exports, admin, audit drill-down)."""
    require_minimum_role(actor, "clinician")
    _validate_server_uuid(server_task_id)
    row = get_task_by_server_task_id(session, server_task_id)
    if row is None:
        raise ApiServiceError(code="not_found", message="Task not found.", status_code=404)
    if row.clinician_id != actor.actor_id:
        raise ApiServiceError(code="forbidden", message="Not allowed to access this task.", status_code=403)
    return _row_to_response_dict(row)


@router.post("/audit-actions")
def post_home_program_audit_action(
    body: AuditActionRequest,
    session: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, str]:
    """Record client-side conflict resolution / retry outcomes (server task id is authoritative)."""
    require_minimum_role(actor, "clinician")
    _validate_external_task_id(body.external_task_id)
    row = session.get(ClinicianHomeProgramTask, body.external_task_id)
    if row is None:
        raise ApiServiceError(code="not_found", message="Task not found.", status_code=404)
    if row.clinician_id != actor.actor_id:
        raise ApiServiceError(code="forbidden", message="Not allowed to audit this task.", status_code=403)
    if body.action == "take_server":
        log_home_program_audit(
            server_task_id=row.server_task_id,
            external_task_id=row.id,
            action=ACTION_TAKE_SERVER,
            actor_id=actor.actor_id,
            role=actor.role,
            note="Clinician chose server version locally.",
        )
    else:
        log_home_program_audit(
            server_task_id=row.server_task_id,
            external_task_id=row.id,
            action=ACTION_RETRY_SUCCESS,
            actor_id=actor.actor_id,
            role=actor.role,
            note=f"Retry success reported. server_revision={body.server_revision}",
        )
    return {"status": "recorded"}


@router.get("/{task_id}/patient-view")
def get_home_program_task_patient_view(
    task_id: str,
    session: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Non-clinical subset for future patient channels (no raw confidence tiers/scores)."""
    require_minimum_role(actor, "clinician")
    _validate_external_task_id(task_id)
    row = session.get(ClinicianHomeProgramTask, task_id)
    if row is None:
        raise ApiServiceError(code="not_found", message="Task not found.", status_code=404)
    if row.clinician_id != actor.actor_id:
        raise ApiServiceError(code="forbidden", message="Not allowed to access this task.", status_code=403)
    task = load_task_dict(row.task_json)
    hp = task.get("homeProgramSelection")
    safe = patient_safe_home_program_selection(hp) if isinstance(hp, dict) else None
    return {"id": task.get("id"), "patientId": task.get("patientId"), "homeProgramSelection": safe}


@router.get("/{task_id}/export-stub")
def get_home_program_task_export_stub(
    task_id: str,
    session: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Structured audit/export projection (extend for bulk DOCX/JSON later)."""
    require_minimum_role(actor, "clinician")
    _validate_external_task_id(task_id)
    row = session.get(ClinicianHomeProgramTask, task_id)
    if row is None:
        raise ApiServiceError(code="not_found", message="Task not found.", status_code=404)
    if row.clinician_id != actor.actor_id:
        raise ApiServiceError(code="forbidden", message="Not allowed to access this task.", status_code=403)
    task = load_task_dict(row.task_json)
    return task_dict_for_export_stub(task, row)


@router.get("/{task_id}")
def get_home_program_task(
    task_id: str,
    session: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _validate_external_task_id(task_id)
    row = session.get(ClinicianHomeProgramTask, task_id)
    if row is None:
        raise ApiServiceError(code="not_found", message="Task not found.", status_code=404)
    if row.clinician_id != actor.actor_id:
        raise ApiServiceError(code="forbidden", message="Not allowed to access this task.", status_code=403)
    return _row_to_response_dict(row)


@router.put(
    "/{task_id}",
    response_model=HomeProgramTaskMutationResponse,
    response_model_exclude_none=True,
    summary="Update home program task (upsert)",
    description=(
        "Updates an existing task; requires matching ``lastKnownServerRevision`` unless ``force=true``. "
        "If no row exists, creates one (**deprecated** PUT-create). New clients should **POST /** then PUT for updates. "
        "Legacy creates set ``createDisposition=legacy_put_create`` and deprecation headers."
    ),
)
def upsert_home_program_task(
    response: Response,
    task_id: str,
    body: dict[str, Any] = Body(...),
    session: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    force: bool = Query(False, description="Skip revision check (explicit overwrite after conflict review)."),
) -> HomeProgramTaskMutationResponse:
    """Create (legacy) or update a task by external id. Prefer POST / for new tasks."""
    require_minimum_role(actor, "clinician")
    _validate_external_task_id(task_id)
    last_known = body.get("lastKnownServerRevision")
    raw = strip_request_only_fields(dict(body))
    patient_id = raw.get("patientId")
    if not patient_id or not isinstance(patient_id, str):
        raise ApiServiceError(code="missing_patient", message="patientId is required.", status_code=422)
    assert_patient_owned_by_clinician(session, patient_id=patient_id, clinician_id=actor.actor_id)

    if raw.get("id") is not None and raw.get("id") != task_id:
        raise ApiServiceError(code="id_mismatch", message="Payload id must match URL task id.", status_code=422)

    existing = session.get(ClinicianHomeProgramTask, task_id)
    legacy_put_create = existing is None
    if existing is not None:
        if existing.clinician_id != actor.actor_id:
            raise ApiServiceError(code="forbidden", message="Not allowed to modify this task.", status_code=403)
        if existing.patient_id != patient_id:
            raise ApiServiceError(code="patient_mismatch", message="Cannot reassign task to another patient.", status_code=422)
        if not force and last_known is not None and int(last_known) != int(existing.revision):
            log_home_program_audit(
                server_task_id=existing.server_task_id,
                external_task_id=existing.id,
                action=ACTION_SYNC_CONFLICT,
                actor_id=actor.actor_id,
                role=actor.role,
                note=f"Stale write blocked. client_last_known={last_known} server_revision={existing.revision}",
            )
            raise ApiServiceError(
                code="sync_conflict",
                message="Task was updated elsewhere. Refresh or resolve the conflict before saving.",
                status_code=409,
                details={
                    "serverRevision": existing.revision,
                    "serverTask": _row_to_response_dict(existing),
                    "serverTaskId": existing.server_task_id,
                },
            )

    prev_dict = load_task_dict(existing.task_json) if existing else None
    merged = merge_provenance_from_previous(
        {**strip_client_transient_fields(raw), "id": task_id, "patientId": patient_id},
        prev_dict,
    )
    normalized = validate_and_normalize_task_dict(merged)
    to_store = strip_client_transient_fields(normalized)
    payload = json.dumps(to_store, separators=(",", ":"), ensure_ascii=False)

    now = _now()
    if existing is None:
        row = ClinicianHomeProgramTask(
            id=task_id,
            server_task_id=str(uuid.uuid4()),
            patient_id=patient_id,
            clinician_id=actor.actor_id,
            task_json=payload,
            revision=1,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        session.flush()
    else:
        existing.task_json = payload
        existing.updated_at = now
        existing.revision = int(existing.revision) + 1
        row = existing
        session.flush()

    session.commit()
    session.refresh(row)
    if force and existing is not None:
        log_home_program_audit(
            server_task_id=row.server_task_id,
            external_task_id=row.id,
            action=ACTION_FORCE_OVERWRITE,
            actor_id=actor.actor_id,
            role=actor.role,
            note=f"Force save applied. revision={row.revision}",
        )
    base = _row_to_response_dict(row)
    if legacy_put_create:
        log_home_program_audit(
            server_task_id=row.server_task_id,
            external_task_id=row.id,
            action=ACTION_LEGACY_PUT_CREATE,
            actor_id=actor.actor_id,
            role=actor.role,
            note="Deprecated PUT-create path used; prefer POST /api/v1/home-program-tasks for new rows.",
        )
        response.headers["X-DS-Home-Task-Legacy-Put-Create"] = "true"
        response.headers["Deprecation"] = 'behavior="put-create"'
        return HomeProgramTaskMutationResponse.model_validate(
            {**base, "createDisposition": "legacy_put_create"}
        )
    return HomeProgramTaskMutationResponse.model_validate(base)


@router.delete("/{task_id}")
def delete_home_program_task(
    task_id: str,
    session: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, str]:
    require_minimum_role(actor, "clinician")
    _validate_external_task_id(task_id)
    row = session.get(ClinicianHomeProgramTask, task_id)
    if row is None:
        raise ApiServiceError(code="not_found", message="Task not found.", status_code=404)
    if row.clinician_id != actor.actor_id:
        raise ApiServiceError(code="forbidden", message="Not allowed to delete this task.", status_code=403)
    session.delete(row)
    session.commit()
    return {"status": "deleted", "id": task_id}
