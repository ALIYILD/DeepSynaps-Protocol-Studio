"""Repository helpers for Protocol Studio router data access.

Architect Rec #8: routers must not import ``app.persistence.models``
directly. This module owns the minimal patient + source queries needed by
``app.routers.protocol_studio_router`` so the router can stay model-free.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.persistence.models import (
    AssessmentRecord,
    ClinicalSession,
    DeepTwinAnalysisRun,
    MriAnalysis,
    OutcomeEvent,
    Patient,
    QEEGAnalysis,
)


@dataclass(frozen=True)
class ProtocolStudioPatientContextRecord:
    dob: str | None
    gender: str | None
    primary_condition: str | None
    medical_history: str | None


@dataclass(frozen=True)
class ProtocolStudioSourceStat:
    count: int
    last_updated: str | None


def _serialize_dt(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _count_patient_rows(session: Session, model_cls: type[Any], patient_id: str) -> int:
    return int(
        session.scalar(select(func.count()).where(model_cls.patient_id == patient_id))
        or 0
    )


def _last_updated(
    session: Session, model_cls: type[Any], patient_id: str
) -> str | None:
    ts_col = (
        getattr(model_cls, "created_at", None)
        or getattr(model_cls, "observed_at", None)
        or getattr(model_cls, "synced_at", None)
    )
    if ts_col is None:
        return None
    row = session.execute(
        select(ts_col)
        .where(model_cls.patient_id == patient_id)
        .order_by(ts_col.desc())
        .limit(1)
    ).scalar_one_or_none()
    return _serialize_dt(row)


def get_patient_context_record(
    session: Session, patient_id: str
) -> ProtocolStudioPatientContextRecord | None:
    patient = session.scalar(select(Patient).where(Patient.id == patient_id))
    if patient is None:
        return None
    return ProtocolStudioPatientContextRecord(
        dob=patient.dob,
        gender=patient.gender,
        primary_condition=patient.primary_condition,
        medical_history=patient.medical_history,
    )


def get_patient_data_source_stats(
    session: Session, patient_id: str
) -> dict[str, ProtocolStudioSourceStat]:
    model_map = {
        "assessments": AssessmentRecord,
        "qeeg": QEEGAnalysis,
        "mri": MriAnalysis,
        "sessions": ClinicalSession,
        "outcomes": OutcomeEvent,
        "deeptwin": DeepTwinAnalysisRun,
    }
    return {
        key: ProtocolStudioSourceStat(
            count=_count_patient_rows(session, model_cls, patient_id),
            last_updated=_last_updated(session, model_cls, patient_id),
        )
        for key, model_cls in model_map.items()
    }
