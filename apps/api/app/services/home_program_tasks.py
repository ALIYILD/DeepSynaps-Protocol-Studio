"""Home program task persistence: merge rules + provenance validation."""

from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiServiceError
from app.persistence.models import ClinicianHomeProgramTask, Patient
from deepsynaps_core_schema import parse_home_program_selection


def get_task_by_server_task_id(session: Session, server_task_id: str) -> ClinicianHomeProgramTask | None:
    return session.scalar(select(ClinicianHomeProgramTask).where(ClinicianHomeProgramTask.server_task_id == server_task_id))


def load_task_dict(task_json: str) -> dict[str, Any]:
    try:
        d = json.loads(task_json)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def merge_provenance_from_previous(incoming: dict[str, Any], previous: dict[str, Any] | None) -> dict[str, Any]:
    """If the client omits ``homeProgramSelection``, retain the previously stored value."""
    merged = {**incoming}
    if "homeProgramSelection" not in merged and previous:
        prev_hp = previous.get("homeProgramSelection")
        if prev_hp is not None:
            merged["homeProgramSelection"] = prev_hp
    return merged


def validate_and_normalize_task_dict(task: dict[str, Any]) -> dict[str, Any]:
    """Validate ``homeProgramSelection`` when present; rejects unknown keys and bad types."""
    out = dict(task)
    if "homeProgramSelection" not in out:
        return out
    raw = out["homeProgramSelection"]
    if raw is None:
        out["homeProgramSelection"] = None
        return out
    if not isinstance(raw, dict):
        raise ApiServiceError(
            code="invalid_home_program_provenance",
            message="homeProgramSelection must be a JSON object or null.",
            status_code=422,
        )
    try:
        out["homeProgramSelection"] = parse_home_program_selection(raw)
    except ValueError as e:
        raise ApiServiceError(
            code="invalid_home_program_provenance",
            message="homeProgramSelection failed validation.",
            warnings=[str(e)],
            status_code=422,
            details={"error": str(e)},
        ) from e
    except ValidationError as e:
        raise ApiServiceError(
            code="invalid_home_program_provenance",
            message="homeProgramSelection failed validation.",
            status_code=422,
            details={"errors": e.errors()},
        ) from e
    return out


def assert_patient_owned_by_clinician(session: Session, *, patient_id: str, clinician_id: str) -> Patient:
    p = session.get(Patient, patient_id)
    if p is None:
        raise ApiServiceError(code="patient_not_found", message="Patient not found.", status_code=404)
    if p.clinician_id != clinician_id:
        raise ApiServiceError(code="forbidden", message="Not allowed to access this patient.", status_code=403)
    return p


def list_tasks_for_clinician(
    session: Session,
    *,
    clinician_id: str,
    patient_id: str | None = None,
) -> list[ClinicianHomeProgramTask]:
    q = select(ClinicianHomeProgramTask).where(ClinicianHomeProgramTask.clinician_id == clinician_id)
    if patient_id:
        q = q.where(ClinicianHomeProgramTask.patient_id == patient_id)
    return list(session.scalars(q.order_by(ClinicianHomeProgramTask.updated_at.desc())).all())
