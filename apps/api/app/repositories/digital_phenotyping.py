"""Repository for Patient + DigitalPhenotyping{PatientState,Audit,Observation} access
used by the Digital Phenotyping Analyzer router.

Per Architect Rec #8 PR-A: routers MUST go through ``app.repositories`` rather than
importing models from ``app.persistence.models`` directly. This module wraps the
small surface the digital phenotyping analyzer router needs.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.persistence.models import (
    DigitalPhenotypingAudit,
    DigitalPhenotypingObservation,
    DigitalPhenotypingPatientState,
    Patient,
)


def get_patient_display_name(session: Session, patient_id: str) -> Optional[str]:
    """Return ``"<first> <last>"`` for the patient, or None if not found."""
    row = session.execute(
        select(Patient).where(Patient.id == patient_id)
    ).scalar_one_or_none()
    if row is None:
        return None
    parts = [row.first_name or "", row.last_name or ""]
    name = " ".join(p for p in parts if p).strip()
    return name or None


def load_or_create_state(
    session: Session,
    *,
    patient_id: str,
    default_domains_enabled: dict[str, bool],
) -> DigitalPhenotypingPatientState:
    """Load (or create-and-commit) the per-patient consent/settings row."""
    row = session.execute(
        select(DigitalPhenotypingPatientState).where(
            DigitalPhenotypingPatientState.patient_id == patient_id
        )
    ).scalar_one_or_none()
    if row is None:
        row = DigitalPhenotypingPatientState(
            patient_id=patient_id,
            domains_enabled_json=json.dumps(default_domains_enabled),
            ui_settings_json="{}",
            consent_scope_version="2026.04",
        )
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


def update_state(
    session: Session,
    state: DigitalPhenotypingPatientState,
    *,
    domains_enabled_json: Optional[str] = None,
    ui_settings_json: Optional[str] = None,
    consent_scope_version: Optional[str] = None,
    updated_by: Optional[str] = None,
) -> DigitalPhenotypingPatientState:
    """Apply partial updates to a state row and commit."""
    if domains_enabled_json is not None:
        state.domains_enabled_json = domains_enabled_json
    if ui_settings_json is not None:
        state.ui_settings_json = ui_settings_json
    if consent_scope_version is not None:
        state.consent_scope_version = consent_scope_version
    if updated_by is not None:
        state.updated_by = updated_by
    state.updated_at = datetime.now(timezone.utc)
    session.add(state)
    session.commit()
    return state


def append_audit(
    session: Session,
    *,
    patient_id: str,
    action: str,
    actor_id: Optional[str],
    detail_json: str,
) -> None:
    """Append a single DigitalPhenotypingAudit row and commit."""
    session.add(
        DigitalPhenotypingAudit(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            action=action,
            detail_json=detail_json,
            actor_id=actor_id,
        )
    )
    session.commit()


def list_recent_audit(
    session: Session, *, patient_id: str, limit: int
) -> list[DigitalPhenotypingAudit]:
    return list(
        session.execute(
            select(DigitalPhenotypingAudit)
            .where(DigitalPhenotypingAudit.patient_id == patient_id)
            .order_by(DigitalPhenotypingAudit.created_at.desc())
            .limit(limit)
        ).scalars().all()
    )


def count_observations(session: Session, *, patient_id: str) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(DigitalPhenotypingObservation)
            .where(DigitalPhenotypingObservation.patient_id == patient_id)
        )
        or 0
    )


def list_recent_observations(
    session: Session, *, patient_id: str, limit: int
) -> list[DigitalPhenotypingObservation]:
    return list(
        session.execute(
            select(DigitalPhenotypingObservation)
            .where(DigitalPhenotypingObservation.patient_id == patient_id)
            .order_by(DigitalPhenotypingObservation.recorded_at.desc())
            .limit(limit)
        ).scalars().all()
    )


def insert_observation(
    session: Session,
    *,
    patient_id: str,
    source: str,
    kind: str,
    recorded_at: datetime,
    payload_json: str,
    created_by: Optional[str],
) -> str:
    """Insert one observation row and commit; return the new id."""
    oid = str(uuid.uuid4())
    session.add(
        DigitalPhenotypingObservation(
            id=oid,
            patient_id=patient_id,
            source=source,
            kind=kind,
            recorded_at=recorded_at,
            payload_json=payload_json,
            created_by=created_by,
        )
    )
    session.commit()
    return oid


def observation_to_dict(row: DigitalPhenotypingObservation) -> dict[str, Any]:
    """Serialise an observation row to the dict shape used by the analyzer payload."""
    payload: dict[str, Any] = {}
    try:
        payload = json.loads(row.payload_json or "{}")
    except json.JSONDecodeError:
        payload = {}
    ra = row.recorded_at
    ts = ra.isoformat().replace("+00:00", "Z") if hasattr(ra, "isoformat") else str(ra)
    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "source": row.source,
        "kind": row.kind,
        "recorded_at": ts,
        "payload": payload,
        "created_by": row.created_by,
    }
