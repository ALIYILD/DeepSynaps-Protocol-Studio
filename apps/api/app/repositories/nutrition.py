"""Repository for NutritionAnalyzerAudit / PatientNutritionDietLog / PatientSupplement
access used by the Nutrition Analyzer router.

Per Architect Rec #8 PR-A: routers MUST go through ``app.repositories`` rather than
importing models from ``app.persistence.models`` directly. This module wraps the
small surface the nutrition analyzer router needs (audit append + diet/supplement
inserts + audit listing).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.persistence.models import (
    NutritionAnalyzerAudit,
    PatientNutritionDietLog,
    PatientSupplement,
)


def append_audit(
    session: Session,
    *,
    patient_id: str,
    clinician_id: str,
    event_type: str,
    message: str,
) -> None:
    """Append a single NutritionAnalyzerAudit row (caller manages commit)."""
    session.add(
        NutritionAnalyzerAudit(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type=event_type,
            message=message,
            actor_id=clinician_id,
        )
    )


def insert_diet_log(
    session: Session,
    *,
    patient_id: str,
    clinician_id: str,
    log_day: str,
    calories_kcal: Optional[float] = None,
    protein_g: Optional[float] = None,
    carbs_g: Optional[float] = None,
    fat_g: Optional[float] = None,
    sodium_mg: Optional[float] = None,
    fiber_g: Optional[float] = None,
    notes: Optional[str] = None,
) -> None:
    session.add(
        PatientNutritionDietLog(
            patient_id=patient_id,
            clinician_id=clinician_id,
            log_day=log_day,
            calories_kcal=calories_kcal,
            protein_g=protein_g,
            carbs_g=carbs_g,
            fat_g=fat_g,
            sodium_mg=sodium_mg,
            fiber_g=fiber_g,
            notes=notes,
        )
    )


def insert_supplement(
    session: Session,
    *,
    patient_id: str,
    clinician_id: str,
    name: str,
    dose: Optional[str] = None,
    frequency: Optional[str] = None,
    active: bool = True,
    notes: Optional[str] = None,
    started_at: Optional[str] = None,
) -> None:
    session.add(
        PatientSupplement(
            patient_id=patient_id,
            clinician_id=clinician_id,
            name=name,
            dose=dose,
            frequency=frequency,
            active=active,
            notes=notes,
            started_at=started_at,
        )
    )


def list_audit_rows(
    session: Session,
    *,
    patient_id: str,
    actor_id: Optional[str] = None,
    is_admin: bool = False,
    limit: int = 200,
) -> list[Any]:
    """Return up to ``limit`` NutritionAnalyzerAudit rows for the patient.

    If ``is_admin`` is False, scopes to rows authored by ``actor_id``.
    """
    q = session.query(NutritionAnalyzerAudit).filter(
        NutritionAnalyzerAudit.patient_id == patient_id
    )
    if not is_admin:
        q = q.filter(NutritionAnalyzerAudit.clinician_id == actor_id)
    return q.order_by(NutritionAnalyzerAudit.created_at.desc()).limit(limit).all()
