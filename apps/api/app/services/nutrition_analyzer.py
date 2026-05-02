"""Nutrition analyzer service — MVP assembly from stored rows + heuristic defaults."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import (
    NutritionAnalyzerAudit,
    PatientNutritionDietLog,
    PatientSupplement,
)
from app.schemas.nutrition_analyzer import (
    AuditEventSummary,
    BiomarkerLink,
    DietIntakeSummary,
    NutritionAnalyzerPayload,
    NutritionRecommendation,
    NutritionSnapshotCard,
    SupplementItem,
)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _stable_computation_id(patient_id: str, diet_rows: list, supp_rows: list) -> str:
    parts: list[str] = [patient_id, str(len(diet_rows)), str(len(supp_rows))]
    latest = 0.0
    for r in diet_rows:
        ts = r.created_at.timestamp() if r.created_at else 0
        latest = max(latest, ts)
    for r in supp_rows:
        ts = r.updated_at.timestamp() if r.updated_at else (r.created_at.timestamp() if r.created_at else 0)
        latest = max(latest, ts)
    parts.append(f"{latest:.6f}")
    h = hashlib.sha256(":".join(parts).encode()).hexdigest()[:24]
    return f"nut-{h}"


def _mean(vals: list[float]) -> Optional[float]:
    cleaned = [v for v in vals if v is not None]
    if not cleaned:
        return None
    return round(sum(cleaned) / len(cleaned), 2)


def build_patient_nutrition_payload(
    patient_id: str,
    db: Session,
    actor_id: str,
    *,
    computation_id: Optional[str] = None,
    is_admin: bool = False,
) -> NutritionAnalyzerPayload:
    dq = db.query(PatientNutritionDietLog).filter(PatientNutritionDietLog.patient_id == patient_id)
    if not is_admin:
        dq = dq.filter(PatientNutritionDietLog.clinician_id == actor_id)
    diet_rows = dq.order_by(PatientNutritionDietLog.log_day.desc()).limit(120).all()

    sq = db.query(PatientSupplement).filter(PatientSupplement.patient_id == patient_id)
    if not is_admin:
        sq = sq.filter(PatientSupplement.clinician_id == actor_id)
    supp_rows = sq.order_by(PatientSupplement.created_at.desc()).all()

    comp_id = computation_id or _stable_computation_id(patient_id, diet_rows, supp_rows)

    window = min(7, max(1, len({r.log_day for r in diet_rows}) or 1))
    calories = [r.calories_kcal for r in diet_rows if r.calories_kcal is not None][: window]
    protein = [r.protein_g for r in diet_rows if r.protein_g is not None][: window]
    carbs = [r.carbs_g for r in diet_rows if r.carbs_g is not None][: window]
    fats = [r.fat_g for r in diet_rows if r.fat_g is not None][: window]
    sodium = [r.sodium_mg for r in diet_rows if r.sodium_mg is not None][: window]
    fiber = [r.fiber_g for r in diet_rows if r.fiber_g is not None][: window]

    distinct_days = len({r.log_day for r in diet_rows})
    coverage = round(min(100.0, distinct_days / 7.0 * 100), 1) if diet_rows else 0.0
    diet_confidence = round(0.35 + min(0.55, distinct_days / 14.0), 3) if diet_rows else 0.15

    diet_summary = DietIntakeSummary(
        window_days=7,
        avg_calories_kcal=_mean(calories) if calories else None,
        avg_protein_g=_mean(protein) if protein else None,
        avg_carbs_g=_mean(carbs) if carbs else None,
        avg_fat_g=_mean(fats) if fats else None,
        avg_sodium_mg=_mean(sodium) if sodium else None,
        avg_fiber_g=_mean(fiber) if fiber else None,
        logging_coverage_pct=coverage,
        confidence=diet_confidence,
        provenance="clinic_diet_log" if diet_rows else "no_logs_default",
        notes="Merged from aggregated daily logs where available.",
    )

    supplements = [
        SupplementItem(
            id=r.id,
            name=r.name,
            dose=r.dose,
            frequency=r.frequency,
            active=bool(r.active),
            notes=r.notes,
            started_at=r.started_at,
            confidence=0.88 if r.notes else 0.75,
            provenance="patient_supplements_table",
        )
        for r in supp_rows
    ]

    audit_q = db.query(NutritionAnalyzerAudit).filter(NutritionAnalyzerAudit.patient_id == patient_id)
    if not is_admin:
        audit_q = audit_q.filter(NutritionAnalyzerAudit.clinician_id == actor_id)
    last_audit = audit_q.order_by(NutritionAnalyzerAudit.created_at.desc()).first()
    total_audit = audit_q.count()

    avg_cal = diet_summary.avg_calories_kcal
    snapshot = [
        NutritionSnapshotCard(
            label="Energy (7d mean)",
            value=f"{avg_cal:.0f}" if avg_cal is not None else "—",
            unit="kcal/d",
            confidence=diet_confidence,
            provenance=diet_summary.provenance,
        ),
        NutritionSnapshotCard(
            label="Protein (7d mean)",
            value=f"{diet_summary.avg_protein_g:.1f}" if diet_summary.avg_protein_g else "—",
            unit="g/d",
            confidence=diet_confidence,
            provenance=diet_summary.provenance,
        ),
        NutritionSnapshotCard(
            label="Active supplements",
            value=str(sum(1 for s in supplements if s.active)),
            unit="agents",
            confidence=0.9 if supplements else 0.2,
            provenance="patient_supplements_table",
        ),
        NutritionSnapshotCard(
            label="Diet logging coverage",
            value=f"{coverage:.0f}",
            unit="% of week",
            confidence=0.7 if distinct_days else 0.25,
            provenance="computed_from_log_days",
        ),
    ]

    biomarker_links = [
        BiomarkerLink(label="Wearable biometrics", page_id="wearables", detail="Trends vs intake (stub)", confidence=0.45),
        BiomarkerLink(label="Risk stratification", page_id="risk-analyzer", detail="Safety / adherence context", confidence=0.5),
        BiomarkerLink(label="Wellness Hub", page_id="clinician-wellness", detail="Holistic wellbeing signals", confidence=0.4),
    ]

    recommendations: list[NutritionRecommendation] = []
    if not diet_rows:
        recommendations.append(
            NutritionRecommendation(
                title="Start structured intake logging",
                detail="No diet logs on file — consider 3-day food record or connected app feed when available.",
                priority="follow_up",
                confidence=0.55,
                provenance="heuristic_gap_fill",
            )
        )
    if diet_summary.avg_fiber_g is not None and diet_summary.avg_fiber_g < 20:
        recommendations.append(
            NutritionRecommendation(
                title="Fiber below common target",
                detail="Average fiber is under ~25–30 g/day for many adults; correlate with GI symptoms and meds.",
                priority="routine",
                confidence=0.48,
                provenance="heuristic_threshold",
            )
        )
    if any(s.active and "vitamin d" in (s.name or "").lower() for s in supplements):
        recommendations.append(
            NutritionRecommendation(
                title="Vitamin D supplementation documented",
                detail="Confirm testing cadence and sun exposure per local protocol; not a directive to change dose.",
                priority="routine",
                confidence=0.52,
                provenance="keyword_screen",
            )
        )

    payload = NutritionAnalyzerPayload(
        patient_id=patient_id,
        computation_id=comp_id,
        data_as_of=_iso_now(),
        snapshot=snapshot,
        diet=diet_summary,
        supplements=supplements,
        biomarker_links=biomarker_links,
        recommendations=recommendations,
        audit_events=AuditEventSummary(
            total_events=total_audit,
            last_event_at=last_audit.created_at.isoformat().replace("+00:00", "Z") if last_audit else None,
            last_event_type=last_audit.event_type if last_audit else None,
        ),
    )
    return payload


def build_stub_payload(patient_id: str) -> NutritionAnalyzerPayload:
    """Deterministic empty scaffold when DB is skipped (tests / docs)."""
    return NutritionAnalyzerPayload(
        patient_id=patient_id,
        computation_id=f"nut-stub-{patient_id[:8]}",
        data_as_of=_iso_now(),
        snapshot=[
            NutritionSnapshotCard(label="Energy (7d mean)", value="—", unit="kcal/d", confidence=0.0, provenance="stub"),
            NutritionSnapshotCard(label="Protein (7d mean)", value="—", unit="g/d", confidence=0.0, provenance="stub"),
            NutritionSnapshotCard(label="Active supplements", value="0", unit="agents", confidence=0.2, provenance="stub"),
            NutritionSnapshotCard(label="Diet logging coverage", value="0", unit="% of week", confidence=0.2, provenance="stub"),
        ],
        diet=DietIntakeSummary(
            provenance="stub",
            notes="No rows ingested yet.",
        ),
        biomarker_links=[
            BiomarkerLink(label="Wearable biometrics", page_id="wearables", detail="Stub link", confidence=0.3),
        ],
        recommendations=[
            NutritionRecommendation(
                title="Await structured inputs",
                detail="Populate diet logs and supplements to refine this panel.",
                priority="routine",
                provenance="stub",
            )
        ],
    )


def new_computation_id() -> str:
    return str(uuid.uuid4())
