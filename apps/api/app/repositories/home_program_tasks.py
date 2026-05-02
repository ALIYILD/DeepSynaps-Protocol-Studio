"""Repository helpers for clinician home-program tasks + completions.

Architect Rec #8: routers must not import from ``app.persistence.models``
directly. ``app.routers.home_program_tasks_router`` previously held its
own ``session.get(ClinicianHomeProgramTask, ...)`` and
``session.query(PatientHomeProgramTaskCompletion)`` calls — they are
collected here so the router can stay model-import-free.

NOTE: simple per-task lookup helpers live alongside the existing
``app.services.home_program_tasks`` (list / get-by-server-id), which is
already used by the router and is service-layer rather than repository.
The functions in this module are deliberately thin to mirror the
existing repo style.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..persistence.models import (
    ClinicianHomeProgramTask,
    PatientHomeProgramTaskCompletion,
)


def get_clinician_home_program_task(
    session: Session, task_id: str
) -> Optional[ClinicianHomeProgramTask]:
    """Fetch a clinician home-program task by its external (URL) id."""
    return session.get(ClinicianHomeProgramTask, task_id)


def insert_clinician_home_program_task(
    session: Session,
    *,
    task_id: str,
    server_task_id: str,
    patient_id: str,
    clinician_id: str,
    task_json: str,
    revision: int,
    created_at: datetime,
    updated_at: datetime,
) -> ClinicianHomeProgramTask:
    """Construct + add a fresh ``ClinicianHomeProgramTask`` row.

    Caller is responsible for flush/commit so audit writes can share the
    same transaction.
    """
    row = ClinicianHomeProgramTask(
        id=task_id,
        server_task_id=server_task_id,
        patient_id=patient_id,
        clinician_id=clinician_id,
        task_json=task_json,
        revision=revision,
        created_at=created_at,
        updated_at=updated_at,
    )
    session.add(row)
    return row


def list_patient_completions_for_clinician(
    session: Session,
    *,
    clinician_id: str,
    patient_id: str | None = None,
    limit: int = 200,
) -> list[PatientHomeProgramTaskCompletion]:
    """Most-recent-first list of completions filtered by clinician (and
    optionally patient)."""
    q = session.query(PatientHomeProgramTaskCompletion).filter(
        PatientHomeProgramTaskCompletion.clinician_id == clinician_id
    )
    if patient_id:
        q = q.filter(PatientHomeProgramTaskCompletion.patient_id == patient_id)
    return list(
        q.order_by(PatientHomeProgramTaskCompletion.completed_at.desc()).limit(limit).all()
    )
