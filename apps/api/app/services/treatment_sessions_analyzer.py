"""Aggregate patient neuromodulation course + multimodal context for the Treatment Sessions Analyzer UI.

Decision-support only: numeric estimates are heuristic / rules-based unless backed by
explicit model_version elsewhere. Does not prescribe or modify treatment.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor
from app.persistence.models import (
    AdverseEvent,
    AssessmentRecord,
    ClinicalSession,
    MriAnalysis,
    OutcomeSeries,
    QEEGAnalysis,
    TreatmentCourse,
)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stable_float(seed: str, lo: float, hi: float) -> float:
    h = hashlib.sha256(seed.encode()).digest()
    x = int.from_bytes(h[:8], "big") / (2**64)
    return lo + (hi - lo) * x


def _phase_from_course(course: TreatmentCourse) -> str:
    st = (course.status or "").lower()
    if st in {"completed", "ended"}:
        return "maintenance"
    if st in {"paused", "hold"}:
        return "continuation"
    if course.sessions_delivered and course.planned_sessions_total:
        ratio = course.sessions_delivered / max(course.planned_sessions_total, 1)
        if ratio < 0.35:
            return "acute"
        if ratio < 0.85:
            return "continuation"
        return "maintenance"
    return "acute"


def _missed_from_sessions(rows: list[ClinicalSession]) -> int:
    missed = 0
    for s in rows:
        st = (s.status or "").lower()
        if st in {"no_show", "cancelled"}:
            missed += 1
    return missed


def _response_label(course: TreatmentCourse | None) -> str:
    if course is None:
        return "unknown"
    # Placeholder — real logic lives in outcome correlation later
    if course.sessions_delivered >= course.planned_sessions_total * 0.85:
        return "on_track"
    if course.sessions_delivered >= 4:
        return "partial_response"
    return "unclear"


def build_treatment_sessions_analyzer_payload(
    db: Session,
    patient_id: str,
    actor: AuthenticatedActor,
) -> dict[str, Any]:
    """Build TreatmentSessionsAnalyzerPagePayload (dict, JSON-serializable)."""
    generated_at = _now_iso()

    # --- Scoped queries (mirror patients_router session/course access) ---
    cq = db.query(TreatmentCourse).filter(TreatmentCourse.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        cq = cq.filter(TreatmentCourse.clinician_id == actor.actor_id)
    courses: list[TreatmentCourse] = cq.order_by(TreatmentCourse.created_at.desc()).all()

    sq = db.query(ClinicalSession).filter(ClinicalSession.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        sq = sq.filter(ClinicalSession.clinician_id == actor.actor_id)
    sessions: list[ClinicalSession] = sq.order_by(ClinicalSession.scheduled_at).all()

    primary_course = courses[0] if courses else None
    modality = (
        (primary_course.modality_slug if primary_course else None)
        or "unknown"
    )

    missed = _missed_from_sessions(sessions)
    completed = sum(
        1 for s in sessions if (s.status or "").lower() == "completed"
    )

    # --- Linked analyzer IDs (lightweight) ---
    mri_rows = (
        db.query(MriAnalysis)
        .filter(MriAnalysis.patient_id == patient_id)
        .order_by(MriAnalysis.created_at.desc())
        .limit(5)
        .all()
    )
    qeeg_q = db.query(QEEGAnalysis).filter(QEEGAnalysis.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        qeeg_q = qeeg_q.filter(QEEGAnalysis.clinician_id == actor.actor_id)
    qeeg_rows = qeeg_q.order_by(QEEGAnalysis.created_at.desc()).limit(5).all()

    aq = db.query(AssessmentRecord).filter(AssessmentRecord.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        aq = aq.filter(AssessmentRecord.clinician_id == actor.actor_id)
    assessment_rows = aq.order_by(AssessmentRecord.created_at.desc()).limit(12).all()

    outcome_rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id == patient_id)
        .order_by(OutcomeSeries.administered_at.desc())
        .limit(24)
        .all()
    )

    ae_q = db.query(AdverseEvent).filter(AdverseEvent.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        ae_q = ae_q.filter(AdverseEvent.clinician_id == actor.actor_id)
    ae_rows = ae_q.order_by(AdverseEvent.reported_at.desc()).limit(20).all()

    linked = {
        "mri": [r.analysis_id for r in mri_rows],
        "qeeg": [r.id for r in qeeg_rows],
        "assessments": [r.id for r in assessment_rows],
        "outcomes": [r.id for r in outcome_rows],
        "medications": [],
        "video": [],
        "voice": [],
        "text": [],
        "biometrics": [],
    }

    # --- Heuristic forecasts (deterministic given seed) ---
    seed = f"{patient_id}:{modality}:{primary_course.id if primary_course else 'none'}"
    resp_p = round(_stable_float(seed + ":p", 0.35, 0.78), 2)
    ci_lo = max(0.1, round(resp_p - 0.18, 2))
    ci_hi = min(0.95, round(resp_p + 0.15, 2))
    planned_total = (
        primary_course.planned_sessions_total if primary_course else 24
    ) or 24
    delivered = primary_course.sessions_delivered if primary_course else completed
    median_sessions = int(round(planned_total * (0.85 + 0.1 * _stable_float(seed + ":n", 0, 1))))
    range_lo = max(delivered, int(median_sessions * 0.75))
    range_hi = max(range_lo + 1, int(median_sessions * 1.15))

    uncertainty_drivers: list[str] = []
    if not qeeg_rows:
        uncertainty_drivers.append("no_qeeg_in_chart")
    if not mri_rows:
        uncertainty_drivers.append("no_mri_in_chart")
    if len(sessions) < 4:
        uncertainty_drivers.append("sparse_session_history")
    if missed > 2:
        uncertainty_drivers.append("missed_sessions")

    data_gaps: list[dict[str, str]] = []
    if not qeeg_rows:
        data_gaps.append(
            {"domain": "qeeg", "impact": "protocol_stratification_wide_ci"}
        )
    if not mri_rows:
        data_gaps.append(
            {"domain": "mri", "impact": "target_hypothesis_lower_confidence"}
        )

    # --- Multimodal contributors (template + DB-backed where present) ---
    contributors: list[dict[str, Any]] = [
        {
            "id": "mmc_mri",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "treatment_sessions_analyzer/v1",
                "extracted_at": generated_at,
            },
            "domain": "mri",
            "biomarker_role": "predictive",
            "summary": (
                "Structural / functional imaging supports target localization when available."
                if mri_rows
                else "No MRI Analyzer runs linked — add imaging for stronger targeting context."
            ),
            "relevance_score": 0.55 if mri_rows else 0.15,
            "confidence": 0.6 if mri_rows else 0.25,
            "data_quality": "good" if mri_rows else "missing",
            "linked_artifact_ids": linked["mri"][:3],
            "linked_analyzer_route": f"/?page=mri-analysis",
            "impacted_predictions": ["response_probability", "target_hypothesis"],
            "caveats": ["Acquisition and test-retest reliability vary by metric."],
        },
        {
            "id": "mmc_qeeg",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "treatment_sessions_analyzer/v1",
                "extracted_at": generated_at,
            },
            "domain": "qeeg",
            "biomarker_role": "predictive",
            "summary": (
                "qEEG features may inform response probability when curated mappings exist."
                if qeeg_rows
                else "No qEEG analyses linked — predictive stratification is limited."
            ),
            "relevance_score": 0.5 if qeeg_rows else 0.2,
            "confidence": 0.55 if qeeg_rows else 0.3,
            "data_quality": "good" if qeeg_rows else "missing",
            "linked_artifact_ids": linked["qeeg"][:3],
            "linked_analyzer_route": "/?page=qeeg-analysis",
            "impacted_predictions": ["response_probability"],
            "caveats": ["Use predictive vs responsive framing per acquisition timing."],
        },
        {
            "id": "mmc_assessments",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "treatment_sessions_analyzer/v1",
                "extracted_at": generated_at,
            },
            "domain": "assessments",
            "biomarker_role": "responsive",
            "summary": "Longitudinal scales anchor outcome trajectories and response labeling.",
            "relevance_score": 0.65 if assessment_rows else 0.25,
            "confidence": 0.6 if assessment_rows else 0.35,
            "data_quality": "good" if len(assessment_rows) > 1 else "sparse",
            "linked_artifact_ids": [a.id for a in assessment_rows[:3]],
            "linked_analyzer_route": "/?page=assessments-v2",
            "impacted_predictions": ["trajectory", "nonresponse_detection"],
            "caveats": [],
        },
        {
            "id": "mmc_biometrics",
            "updated_at": generated_at,
            "provenance": {
                "source": "rule",
                "source_ref": "integration/wearables_stub",
                "extracted_at": generated_at,
            },
            "domain": "biometrics",
            "biomarker_role": "responsive",
            "summary": "Wearables and biosignals inform tolerability and adherence risk when connected.",
            "relevance_score": 0.35,
            "confidence": 0.4,
            "data_quality": "unknown",
            "linked_artifact_ids": [],
            "linked_analyzer_route": "/?page=wearables",
            "impacted_predictions": ["dropout_risk"],
            "caveats": ["Connect wearables for session-adjacent physiology context."],
        },
        {
            "id": "mmc_meds",
            "updated_at": generated_at,
            "provenance": {
                "source": "rule",
                "source_ref": "patient/medical_history",
                "extracted_at": generated_at,
            },
            "domain": "medications",
            "biomarker_role": "unknown",
            "summary": "Medication changes can confound EEG, sleep, and mood trajectories — review timeline.",
            "relevance_score": 0.4,
            "confidence": 0.45,
            "data_quality": "unknown",
            "linked_artifact_ids": [],
            "linked_analyzer_route": "/?page=patients-v2",
            "impacted_predictions": ["confound_risk"],
            "caveats": [],
        },
        {
            "id": "mmc_video",
            "updated_at": generated_at,
            "provenance": {
                "source": "rule",
                "source_ref": "integration/video_stub",
                "extracted_at": generated_at,
            },
            "domain": "video",
            "biomarker_role": "responsive",
            "summary": "Video / movement analytics add motor activation context around sessions when uploaded.",
            "relevance_score": 0.3,
            "confidence": 0.35,
            "data_quality": "unknown",
            "linked_artifact_ids": [],
            "linked_analyzer_route": "/?page=video-assessments",
            "impacted_predictions": [],
            "caveats": [],
        },
        {
            "id": "mmc_voice",
            "updated_at": generated_at,
            "provenance": {
                "source": "rule",
                "source_ref": "integration/voice_stub",
                "extracted_at": generated_at,
            },
            "domain": "voice",
            "biomarker_role": "responsive",
            "summary": "Voice prosody may covary with mood and fatigue alongside stimulation course.",
            "relevance_score": 0.28,
            "confidence": 0.32,
            "data_quality": "unknown",
            "linked_artifact_ids": [],
            "linked_analyzer_route": "/?page=voice-analyzer",
            "impacted_predictions": [],
            "caveats": [],
        },
        {
            "id": "mmc_text",
            "updated_at": generated_at,
            "provenance": {
                "source": "rule",
                "source_ref": "integration/text_stub",
                "extracted_at": generated_at,
            },
            "domain": "text",
            "biomarker_role": "unknown",
            "summary": "Structured session records supersede free-text for analytics; NLP augments context.",
            "relevance_score": 0.25,
            "confidence": 0.4,
            "data_quality": "unknown",
            "linked_artifact_ids": [],
            "linked_analyzer_route": "/?page=text-analyzer",
            "impacted_predictions": ["confound_risk"],
            "caveats": [],
        },
    ]

    phq_points: list[dict[str, Any]] = []
    for a in assessment_rows:
        data: dict[str, Any] = {}
        try:
            data = json.loads(a.data_json or "{}")
        except Exception:
            pass
        score = data.get("total") or data.get("score") or a.score_numeric
        if score is None and a.score:
            try:
                score = float(a.score)
            except Exception:
                score = None
        title_l = (a.template_title or "").lower()
        if "phq" in title_l or (a.template_id or "").lower().startswith("phq"):
            phq_points.append(
                {
                    "t": a.created_at.isoformat(),
                    "value": float(score) if score is not None else None,
                    "assessment_id": a.id,
                }
            )

    outcome_trends: list[dict[str, Any]] = []
    if phq_points:
        outcome_trends.append(
            {
                "id": "tot_phq9_proxy",
                "measure_key": "PHQ-9 (from assessments)",
                "provenance": {
                    "source": "assessments",
                    "source_ref": "assessment_records",
                    "extracted_at": generated_at,
                },
                "points": sorted(phq_points, key=lambda x: x["t"] or ""),
                "trajectory_class": "mixed",
                "expected_band": {"model_version": "trajectory_rules_v0"},
                "last_recalibrated_at": generated_at,
                "confidence": 0.5,
            }
        )

    side_effect_events: list[dict[str, Any]] = []
    for ae in ae_rows:
        side_effect_events.append(
            {
                "id": ae.id,
                "occurred_at": ae.reported_at.isoformat(),
                "provenance": {
                    "source": "clinical",
                    "source_ref": "adverse_events",
                    "extracted_at": generated_at,
                },
                "category": ae.event_type or "other",
                "severity": 3 if (ae.severity or "").lower() == "serious" else 2,
                "related_session_id": ae.session_id,
                "related_protocol_change": None,
                "urgency": "high" if ae.is_serious else "low",
                "sa_flag": bool(ae.is_serious),
                "confidence": 0.85,
                "notes": (ae.description or "")[:500],
            }
        )

    optimization_prompts: list[dict[str, Any]] = []
    if missed >= 2:
        optimization_prompts.append(
            {
                "id": "pop_adherence",
                "created_at": generated_at,
                "provenance": {
                    "source": "rules_engine",
                    "source_ref": "adherence_threshold_v1",
                    "extracted_at": generated_at,
                },
                "prompt_type": "spacing_review",
                "severity": "moderate",
                "urgency": "routine",
                "title": "Review adherence pattern",
                "detail": f"{missed} missed or cancelled visits detected — consider barriers and scheduling.",
                "suggested_actions": [
                    {"label": "Open adherence hub", "type": "navigate", "target": "clinician-adherence"}
                ],
                "deterministic": True,
                "evidence_link_ids": [],
                "requires_clinician_review": True,
                "confidence": 0.75,
            }
        )

    recommendations: list[dict[str, Any]] = [
        {
            "id": "trec_review",
            "created_at": generated_at,
            "provenance": {
                "source": "rules_engine",
                "source_ref": "treatment_sessions_analyzer/v1",
                "extracted_at": generated_at,
            },
            "kind": "clinician_review",
            "title": "Confirm protocol and targets in Protocol Studio",
            "body": "All dose and targeting changes require clinician review and documentation.",
            "priority": "medium",
            "decision_support_only": True,
            "clinician_review_required": True,
            "structured": {},
            "evidence_link_ids": [],
            "confidence": 1.0,
            "time_horizon": "ongoing",
        }
    ]

    evidence_links: list[dict[str, Any]] = [
        {
            "id": "tel_multimodal_planning",
            "created_at": generated_at,
            "provenance": {
                "source": "literature",
                "source_ref": "internal_registry",
                "extracted_at": generated_at,
            },
            "evidence_type": "literature",
            "title": "Multimodal planning context",
            "snippet": "Combining imaging, electrophysiology, and clinical features can improve individualized planning versus single-modality views alone.",
            "strength": "moderate",
            "confidence": 0.55,
            "uri": "",
            "expand_behavior": "drawer_full_abstract",
            "related_domains": ["mri", "eeg", "clinical"],
        }
    ]

    audit_events: list[dict[str, Any]] = []

    session_records: list[dict[str, Any]] = []
    for s in sessions[-40:]:  # cap payload size
        st = (s.status or "").lower()
        if st == "completed" or st == "in_progress":
            mapped_status = "completed" if st == "completed" else "planned"
        elif st in {"no_show", "cancelled"}:
            mapped_status = "missed"
        elif st in {"scheduled", "confirmed", "checked_in"}:
            mapped_status = "planned"
        else:
            mapped_status = "planned"
        session_records.append(
            {
                "id": s.id,
                "session_index": s.session_number,
                "started_at": s.scheduled_at,
                "ended_at": s.completed_at,
                "timezone": "UTC",
                "provenance": {
                    "source": "api",
                    "source_ref": "clinical_sessions",
                    "extracted_at": generated_at,
                },
                "modality": s.modality or modality,
                "protocol_label": s.protocol_ref or (primary_course.protocol_id if primary_course else ""),
                "target": {
                    "label": primary_course.target_region if primary_course else "",
                    "confidence": 0.5,
                },
                "parameters": {
                    "duration_minutes": s.duration_minutes,
                    "provenance": {
                        "source": "api",
                        "source_ref": "clinical_sessions",
                        "extracted_at": generated_at,
                    },
                    "confidence": 0.7,
                },
                "duration_minutes": s.duration_minutes,
                "status": mapped_status,
                "attendance": "full" if mapped_status == "completed" else "none",
                "patient_experience": {},
                "acute_side_effects": [],
                "linked_pre_measures": [],
                "linked_post_measures": [],
                "linked_analyzers_impacted": [],
                "severity_for_monitoring": "routine",
                "urgency": "none",
            }
        )

    course_payload: dict[str, Any] | None = None
    if primary_course:
        course_payload = {
            "id": primary_course.id,
            "updated_at": _iso(primary_course.updated_at) or generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "treatment_courses",
                "extracted_at": generated_at,
            },
            "modality": primary_course.modality_slug or modality,
            "indication_context": {
                "type": "clinical",
                "condition_codes": [primary_course.condition_slug],
            },
            "wellness_mode": False,
            "protocol_status": {
                "name": primary_course.protocol_id,
                "version": "",
                "started_on": _iso(primary_course.started_at),
            },
            "phase": _phase_from_course(primary_course),
            "planned_sessions": primary_course.planned_sessions_total,
            "completed_sessions": primary_course.sessions_delivered,
            "missed_sessions": missed,
            "last_session_at": session_records[-1]["started_at"] if session_records else None,
            "response_status": _response_label(primary_course),
            "side_effect_burden": {
                "score": min(1.0, len(ae_rows) * 0.08),
                "tier": "low",
            },
            "linked_analyzer_ids": linked,
        }

    planning_snapshot = {
        "updated_at": generated_at,
        "provenance": {
            "source": "rules_engine",
            "source_ref": "treatment_sessions_analyzer/v1",
            "extracted_at": generated_at,
        },
        "modality": modality,
        "candidate_protocols": [
            {
                "id": "cpr_primary",
                "created_at": generated_at,
                "provenance": {
                    "source": "rules_engine",
                    "source_ref": "course.protocol_id",
                    "extracted_at": generated_at,
                },
                "modality": modality,
                "protocol_key": primary_course.protocol_id if primary_course else "unspecified",
                "label": (primary_course.protocol_id if primary_course else "Define protocol in Protocol Studio"),
                "waveform_family": "unspecified",
                "evidence_strength": primary_course.evidence_grade or "unknown",
                "confidence": 0.55,
                "rank": 1,
                "rationale_bullets": [
                    "Derived from the active treatment course on file.",
                    "Compare with evidence-backed templates in Research Evidence.",
                ],
                "evidence_link_ids": ["tel_multimodal_planning"],
                "contraindication_hits": [],
                "requires_clinician_review": True,
            }
        ],
        "candidate_targets": [
            {
                "id": "tr_course_target",
                "created_at": generated_at,
                "provenance": {
                    "source": "rules_engine",
                    "source_ref": "treatment_course.target_region",
                    "extracted_at": generated_at,
                },
                "modality": modality,
                "anatomical_target": primary_course.target_region or "unspecified",
                "coordinate_space": "",
                "coordinates_mm": [],
                "confidence": 0.45 if mri_rows else 0.25,
                "mri_anchor_study_id": linked["mri"][0] if linked["mri"] else None,
                "uncertainty_mm": None,
                "biomarker_role": "predictive",
                "notes": "Hypothesis from course + imaging when available — verify clinically.",
            }
        ],
        "response_probability": {
            "point": resp_p,
            "ci": [ci_lo, ci_hi],
            "horizon": "12_weeks",
        },
        "session_count_estimate": {
            "median": median_sessions,
            "range": [range_lo, range_hi],
            "unit": "sessions",
        },
        "modality_suitability": {
            "status": "unknown_without_full_intake",
            "flags": [],
        },
        "uncertainty": {
            "level": "high" if uncertainty_drivers else "medium",
            "drivers": uncertainty_drivers or ["model_placeholder"],
        },
        "why_summary": (
            "Estimates combine course parameters on file with available multimodal context. "
            "Wide uncertainty when EEG/MRI or session density is limited."
        ),
        "biomarker_roles_used": {
            "predictive": ["mri", "qeeg"] if (mri_rows or qeeg_rows) else [],
            "responsive": ["assessments"] if assessment_rows else [],
        },
        "confidence": 0.45 if not uncertainty_drivers else 0.35,
    }

    return {
        "schema_version": "1.0.0",
        "generated_at": generated_at,
        "patient_id": patient_id,
        "provenance": {
            "source": "api",
            "source_ref": "treatment_sessions_analyzer/v1",
            "extracted_at": generated_at,
        },
        "page_title": "Treatment Sessions Analyzer + Protocol Intelligence",
        "disclaimer_refs": ["policy://decision-support-v1"],
        "planning_snapshot": planning_snapshot,
        "course": course_payload,
        "sessions": session_records,
        "multimodal_contributors": contributors,
        "outcome_trends": outcome_trends,
        "side_effect_events": side_effect_events,
        "optimization_prompts": optimization_prompts,
        "recommendations": recommendations,
        "evidence_links": evidence_links,
        "audit_events": audit_events,
        "data_gaps": data_gaps,
        "prediction_horizon": {
            "label": "acute_plus_12_weeks",
            "start": generated_at,
            "end": generated_at,
        },
        "meta": {
            "rules_engine_version": "treatment_sessions_analyzer_v1",
            "forecast_note": "Response probability is a seeded heuristic for UX wiring — replace with calibrated model.",
        },
    }
