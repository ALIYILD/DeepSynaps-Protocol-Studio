"""Movement Analyzer — assemble multimodal movement workspace payload (v0.1).

Decision-support only. Uses posture/scores from video_analysis, step counts from
wearable_daily_summaries, and medication context for correlation hints. Future:
structured kinematics from clinical-task video pipeline and IMU adapters.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import (
    MovementAnalyzerAudit,
    MovementAnalyzerSnapshot,
    PatientMedication,
    RiskStratificationResult,
)
from app.persistence.models.devices import VideoAnalysis, WearableDailySummary

PIPELINE_VERSION = "0.1.0"
SCHEMA_VERSION = "1"


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _level_from_posture(score: Optional[float]) -> tuple[str, float]:
    """video_analysis.posture_score is 0–100 style integer; higher = better posture proxy."""
    if score is None:
        return "unknown", 0.35
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "unknown", 0.35
    if s >= 70:
        return "within_expected", 0.55
    if s >= 45:
        return "mild_limitation", 0.5
    return "notable_concern", 0.45


def _activity_from_steps(avg_steps: Optional[float]) -> tuple[str, float]:
    if avg_steps is None:
        return "unknown", 0.4
    if avg_steps >= 6500:
        return "active", 0.55
    if avg_steps >= 3500:
        return "moderate", 0.55
    return "low", 0.5


def build_movement_workspace_payload(patient_id: str, db: Session) -> dict[str, Any]:
    """Build serialisable Movement Analyzer page payload from DB signals."""
    now = datetime.now(timezone.utc)
    generated_at = _iso(now)

    # ── Video analysis aggregates ─────────────────────────────────────────────
    vid_rows = db.execute(
        select(VideoAnalysis.posture_score, VideoAnalysis.created_at)
        .where(VideoAnalysis.patient_id == patient_id)
        .order_by(VideoAnalysis.created_at.desc())
        .limit(20)
    ).all()
    posture_scores = [float(r[0]) for r in vid_rows if r[0] is not None]
    last_video_at = _iso(vid_rows[0][1]) if vid_rows else None
    posture_mean = sum(posture_scores) / len(posture_scores) if posture_scores else None
    posture_level, posture_conf = _level_from_posture(posture_mean)

    # ── Wearable steps (activity proxy) ───────────────────────────────────────
    since = (now - timedelta(days=14)).date().isoformat()
    step_rows = db.execute(
        select(WearableDailySummary.steps, WearableDailySummary.date, WearableDailySummary.synced_at)
        .where(WearableDailySummary.patient_id == patient_id)
        .where(WearableDailySummary.date >= since)
        .where(WearableDailySummary.steps.isnot(None))
    ).all()
    step_vals = [int(r[0]) for r in step_rows if r[0] is not None]
    avg_steps = sum(step_vals) / len(step_vals) if step_vals else None
    last_wearable_at = None
    if step_rows:
        latest_sync = max((r[2] for r in step_rows if r[2] is not None), default=None)
        if latest_sync:
            last_wearable_at = _iso(latest_sync)
    activity_level, activity_conf = _activity_from_steps(avg_steps)

    # ── Medications (motor-relevant hint only) ────────────────────────────────
    med_rows = db.execute(
        select(PatientMedication.name, PatientMedication.generic_name)
        .where(PatientMedication.patient_id == patient_id)
        .where(PatientMedication.active.is_(True))
    ).all()
    has_meds = bool(med_rows)
    motor_keywords = (
        "levodopa", "carbidopa", "sinemet", "madopar", "stalevo", "ropinirole",
        "pramipexole", "rotigotine", "amantadine", "propranolol", "primidone",
        "haloperidol", "quetiapine", "olanzapine", "aripiprazole", "tramadol",
    )
    motor_meds = []
    for name, generic in med_rows:
        blob = f"{name or ''} {generic or ''}".lower()
        if any(k in blob for k in motor_keywords):
            motor_meds.append(name or generic or "medication")

    # ── Risk link (clinical deterioration category) ──────────────────────────
    risk_row = db.execute(
        select(RiskStratificationResult.level, RiskStratificationResult.confidence)
        .where(RiskStratificationResult.patient_id == patient_id)
        .where(RiskStratificationResult.category == "clinical_deterioration")
    ).first()
    risk_level = risk_row[0] if risk_row else None

    # ── Completeness (heuristic) ──────────────────────────────────────────────
    has_video = bool(vid_rows)
    has_wearable = bool(step_vals)
    has_meds = bool(med_rows)
    completeness = _clamp01(0.25 + (0.35 if has_video else 0) + (0.35 if has_wearable else 0) + (0.05 if has_meds else 0))
    by_domain = {
        "gait": 0.45 if has_wearable else 0.2,
        "tremor": 0.25,
        "bradykinesia": 0.25,
        "dyskinesia": 0.2,
        "posture_balance": 0.55 if has_video else 0.2,
        "freezing_immobility": 0.2,
        "fine_motor": 0.2,
        "activity_patterns": 0.6 if has_wearable else 0.25,
    }

    # ── Snapshot axes (honest defaults where no kinematic pipeline yet) ─────
    snapshot_axes = {
        "tremor": {
            "level": "not_assessed",
            "label": "No structured tremor task in recorded signals",
            "confidence": 0.35,
        },
        "gait": {
            "level": "indirect",
            "label": "Step-count trend only" if has_wearable else "No wearable gait stream",
            "confidence": 0.45 if has_wearable else 0.3,
        },
        "bradykinesia": {
            "level": "not_assessed",
            "label": "Add finger-tap / task video for bradykinesia features",
            "confidence": 0.35,
        },
        "dyskinesia": {
            "level": "not_assessed",
            "label": "No dyskinesia model run on this patient",
            "confidence": 0.35,
        },
        "posture_balance": {
            "level": posture_level,
            "label": "Virtual-care posture proxy" if has_video else "No video movement analysis",
            "confidence": posture_conf if has_video else 0.35,
        },
        "activity": {
            "level": activity_level,
            "label": f"Avg {int(avg_steps)} steps/day (14d)" if avg_steps else "No recent step data",
            "confidence": activity_conf if avg_steps else 0.35,
        },
    }

    overall = "unclear"
    if risk_level == "red":
        overall = "worsening"
    elif risk_level == "amber":
        overall = "unclear"
    elif has_wearable and avg_steps and avg_steps >= 5000 and posture_level == "within_expected":
        overall = "stable"

    concern_confidence = _clamp01(completeness * 0.65 + (0.1 if has_video else 0) + (0.1 if has_wearable else 0))

    phenotype_bits = []
    if has_wearable and avg_steps:
        phenotype_bits.append(f"Activity proxy: ~{int(avg_steps)} steps/day from wearable summaries.")
    if has_video:
        phenotype_bits.append("Posture/engagement signals available from analyzed video segments.")
    if motor_meds:
        phenotype_bits.append(
            "Medication list includes agents that may affect movement; interpret alongside exam."
        )
    if not phenotype_bits:
        phenotype_bits.append(
            "Limited movement-linked signals — connect Video and Biometrics analyzers to populate this workspace."
        )

    signal_sources = [
        {
            "source_id": "video_vc",
            "source_modality": "video",
            "passive_vs_elicited": "mixed",
            "time_range": {"start": last_video_at, "end": generated_at} if last_video_at else None,
            "last_received_at": last_video_at,
            "completeness_0_1": 0.7 if has_video else 0.0,
            "qc_flags": [] if has_video else ["no_video_analysis_rows"],
            "confidence": 0.55 if has_video else 0.25,
            "upstream_analyzer": "video_analysis",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "wearable_daily",
            "source_modality": "wearable",
            "passive_vs_elicited": "passive",
            "last_received_at": last_wearable_at,
            "completeness_0_1": 0.65 if has_wearable else 0.0,
            "qc_flags": [] if has_wearable else ["no_wearable_summaries"],
            "confidence": 0.55 if has_wearable else 0.25,
            "upstream_analyzer": "wearable_daily_summaries",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "medications",
            "source_modality": "clinician",
            "passive_vs_elicited": "passive",
            "completeness_0_1": 0.8 if has_meds else 0.0,
            "qc_flags": [] if has_meds else ["no_medications"],
            "confidence": 0.75 if has_meds else 0.2,
            "upstream_analyzer": "patient_medications",
            "upstream_entity_ids": [],
        },
    ]

    domains = {
        "gait": [
            {
                "domain": "gait",
                "metric_key": "steps_per_day_avg",
                "value": round(avg_steps, 1) if avg_steps else None,
                "unit": "steps/d",
                "severity_or_direction": "neutral" if avg_steps and avg_steps > 4000 else "unknown",
                "confidence": 0.5 if has_wearable else 0.25,
                "completeness": by_domain["gait"],
                "timestamp": generated_at,
                "note": "Spatiotemporal gait parameters require task video or instrumented walk tests.",
            }
        ],
        "tremor": [
            {
                "domain": "tremor",
                "metric_key": "rest_tremor_power",
                "value": None,
                "unit": "au",
                "severity_or_direction": "unknown",
                "confidence": 0.25,
                "completeness": by_domain["tremor"],
                "timestamp": generated_at,
                "note": "Upload IMU or clinical tremor-task video to estimate tremor burden.",
            }
        ],
        "posture_balance": [
            {
                "domain": "posture_balance",
                "metric_key": "posture_score_vc_proxy",
                "value": round(posture_mean, 1) if posture_mean is not None else None,
                "unit": "score_0_100",
                "severity_or_direction": "better" if posture_level == "within_expected" else ("worse" if posture_level == "notable_concern" else "unknown"),
                "confidence": posture_conf,
                "completeness": by_domain["posture_balance"],
                "timestamp": generated_at,
            }
        ],
        "activity_patterns": [
            {
                "domain": "activity_patterns",
                "metric_key": "wearable_steps_14d_avg",
                "value": round(avg_steps, 1) if avg_steps else None,
                "unit": "steps/d",
                "severity_or_direction": activity_level,
                "confidence": activity_conf,
                "completeness": by_domain["activity_patterns"],
                "timestamp": generated_at,
            }
        ],
    }

    flags: list[dict[str, Any]] = []
    if not has_video and not has_wearable:
        flags.append({
            "flag_id": "mov-data-sparse",
            "category": "data_quality",
            "title": "Sparse movement-linked data",
            "detail": "No recent wearable summaries and no video analysis rows. Interpretability is limited.",
            "confidence": 0.85,
            "urgency": "routine",
            "movement_domain": "activity_patterns",
            "source_modalities": [],
            "evidence_link_ids": ["evidence-missingness"],
            "linked_analyzers_impacted": ["video-assessments", "wearables"],
        })
    if motor_meds:
        flags.append({
            "flag_id": "mov-med-context",
            "category": "medication_context",
            "title": "Medications may influence movement",
            "detail": f"Flagged for movement relevance (keyword scan): {', '.join(sorted(set(motor_meds))[:6])}. Correlate with exam and timing.",
            "confidence": 0.55,
            "urgency": "monitor",
            "movement_domain": "tremor",
            "source_modalities": ["clinician"],
            "evidence_link_ids": ["evidence-med-movement"],
            "linked_analyzers_impacted": ["medication-analyzer"],
        })

    recommendations = [
        {
            "id": "rec-video-tasks",
            "kind": "review_video",
            "rationale": "Structured gait/tremor/bradykinesia tasks in Video Analyzer improve domain scores.",
            "priority": "P1",
            "confidence": 0.7,
            "evidence_link_ids": ["evidence-gait-digital"],
        },
    ]
    if has_wearable and avg_steps and avg_steps < 3500:
        recommendations.append({
            "id": "rec-activity-context",
            "kind": "correlate_meds",
            "rationale": "Low average step count — review medications, mood, pain, and cardiometabolic context.",
            "priority": "P2",
            "confidence": 0.5,
            "evidence_link_ids": ["evidence-activity-realworld"],
        })

    evidence_links = [
        {
            "id": "evidence-missingness",
            "source_type": "rule",
            "title": "Interpretation limited without multimodal inputs",
            "snippet": "Digital movement biomarkers depend on sensor quality, task protocol, and population context.",
            "strength": "moderate",
            "confidence": 0.8,
            "related_flag_ids": ["mov-data-sparse"],
        },
        {
            "id": "evidence-med-movement",
            "source_type": "literature",
            "title": "Medication-related movement effects",
            "snippet": "Several medication classes alter tremor, rigidity, or akathisia; clinical correlation is required.",
            "strength": "moderate",
            "confidence": 0.55,
            "related_flag_ids": ["mov-med-context"] if motor_meds else [],
        },
        {
            "id": "evidence-gait-digital",
            "source_type": "literature",
            "title": "Real-world gait and activity metrics",
            "snippet": "Wearable-derived activity can support longitudinal tracking when interpreted with clinical context.",
            "strength": "moderate",
            "confidence": 0.65,
            "related_flag_ids": [],
        },
        {
            "id": "evidence-activity-realworld",
            "source_type": "literature",
            "title": "Activity levels and functional mobility",
            "snippet": "Step counts are a coarse proxy; they do not replace gait laboratory or timed tests.",
            "strength": "low",
            "confidence": 0.5,
            "related_flag_ids": [],
        },
    ]

    risk_relation = "clinical_trajectory_context"
    if risk_level:
        risk_relation = f"clinical_deterioration_risk_{risk_level}"
    multimodal_links = [
        {"analyzer_id": "video-assessments", "label": "Video Analyzer", "relation": "feeds_posture_proxy", "entity_ids": []},
        {"analyzer_id": "wearables", "label": "Biometrics / wearables", "relation": "feeds_activity_proxy", "entity_ids": []},
        {"analyzer_id": "medication-analyzer", "label": "Medication Analyzer", "relation": "motor_relevant_meds", "entity_ids": []},
        {"analyzer_id": "risk-analyzer", "label": "Risk Analyzer", "relation": risk_relation, "entity_ids": []},
        {"analyzer_id": "assessments-v2", "label": "Assessments", "relation": "timed_measures_and_scales", "entity_ids": []},
        {"analyzer_id": "mri-analysis", "label": "MRI Analyzer", "relation": "structural_context_when_movement_disorder", "entity_ids": []},
        {"analyzer_id": "qeeg-analysis", "label": "qEEG Analyzer", "relation": "cortical_motor_network_context", "entity_ids": []},
    ]

    interpretation = {
        "hypotheses": [
            {
                "kind": "data_limitation",
                "statement": "This workspace prioritises transparent gaps: domains without task or sensor data stay uninterpreted rather than imputed.",
                "confidence": 0.9,
                "caveat": "Does not replace neurological examination.",
            },
        ],
        "summary": " ".join(phenotype_bits),
    }

    payload: dict[str, Any] = {
        "patient_id": patient_id,
        "generated_at": generated_at,
        "schema_version": SCHEMA_VERSION,
        "pipeline_version": PIPELINE_VERSION,
        "clinical_disclaimer": (
            "Decision-support only. These summaries combine model outputs and passive sensors; "
            "they are not a substitute for in-person neurological examination or standardised rating scales."
        ),
        "snapshot": {
            "as_of": generated_at,
            "phenotype_summary": " ".join(phenotype_bits),
            "overall_concern": overall,
            "overall_confidence": round(concern_confidence, 2),
            "data_completeness": round(completeness, 2),
            "axes": snapshot_axes,
        },
        "signal_sources": signal_sources,
        "domains": domains,
        "baseline": None,
        "deviations": [],
        "flags": flags,
        "recommendations": recommendations,
        "evidence_links": evidence_links,
        "multimodal_links": multimodal_links,
        "completeness": {"overall": round(completeness, 2), "by_domain": by_domain},
        "linked_analyzers_impacted": ["video-assessments", "wearables", "medication-analyzer", "risk-analyzer"],
        "clinical_interpretation": interpretation,
        "audit_tail": [],
    }
    return payload


def persist_snapshot(patient_id: str, payload: dict[str, Any], db: Session) -> MovementAnalyzerSnapshot:
    """Upsert cached snapshot row."""
    row = db.execute(
        select(MovementAnalyzerSnapshot).where(MovementAnalyzerSnapshot.patient_id == patient_id)
    ).scalar_one_or_none()
    body = json.dumps(payload, separators=(",", ":"), default=str)
    now = datetime.now(timezone.utc)
    if row is None:
        row = MovementAnalyzerSnapshot(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            payload_json=body,
            schema_version=SCHEMA_VERSION,
            pipeline_version=PIPELINE_VERSION,
            computed_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    else:
        row.payload_json = body
        row.schema_version = SCHEMA_VERSION
        row.pipeline_version = PIPELINE_VERSION
        row.computed_at = now
        row.updated_at = now
    db.commit()
    db.refresh(row)
    return row


def load_snapshot(patient_id: str, db: Session) -> Optional[dict[str, Any]]:
    row = db.execute(
        select(MovementAnalyzerSnapshot).where(MovementAnalyzerSnapshot.patient_id == patient_id)
    ).scalar_one_or_none()
    if row is None:
        return None
    try:
        return json.loads(row.payload_json)
    except json.JSONDecodeError:
        return None


def append_audit(
    patient_id: str,
    action: str,
    actor_id: Optional[str],
    detail: Optional[dict[str, Any]],
    db: Session,
) -> None:
    db.add(
        MovementAnalyzerAudit(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            action=action,
            actor_id=actor_id,
            detail_json=json.dumps(detail or {}, separators=(",", ":"), default=str),
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()


def list_audit_events(patient_id: str, db: Session, limit: int = 50) -> list[dict[str, Any]]:
    rows = db.execute(
        select(MovementAnalyzerAudit)
        .where(MovementAnalyzerAudit.patient_id == patient_id)
        .order_by(MovementAnalyzerAudit.created_at.desc())
        .limit(limit)
    ).scalars().all()
    out = []
    for r in rows:
        detail: Any = {}
        if r.detail_json:
            try:
                detail = json.loads(r.detail_json)
            except json.JSONDecodeError:
                detail = {"raw": r.detail_json}
        out.append({
            "id": r.id,
            "patient_id": r.patient_id,
            "action": r.action,
            "actor_id": r.actor_id,
            "created_at": _iso(r.created_at),
            "detail": detail,
        })
    return out
