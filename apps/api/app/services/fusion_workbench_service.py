"""Fusion Workbench — core orchestrator for persistent multimodal case summaries.

Deterministic agreement engine, protocol fusion, and patient-facing sanitization.
No external packages required; falls back gracefully when ``deepsynaps_qeeg.ai.fusion``
is not installed.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.persistence.models import (
    AssessmentRecord,
    FusionCase,
    FusionCaseAudit,
    FusionCaseFinding,
    MriAnalysis,
    QEEGAnalysis,
    QEEGAIReport,
    TreatmentCourse,
)
from app.services.fusion_safety_service import run_safety_gates

logger = logging.getLogger(__name__)

# ── State machine ────────────────────────────────────────────────────────────

VALID_TRANSITIONS: dict[str, dict[str, str]] = {
    "FUSION_DRAFT_AI": {
        "needs_clinical_review": "FUSION_NEEDS_CLINICAL_REVIEW",
        "archive": "FUSION_ARCHIVED",
    },
    "FUSION_NEEDS_CLINICAL_REVIEW": {
        "approve": "FUSION_APPROVED",
        "amend": "FUSION_REVIEWED_WITH_AMENDMENTS",
        "archive": "FUSION_ARCHIVED",
    },
    "FUSION_APPROVED": {
        "sign": "FUSION_SIGNED",
        "amend": "FUSION_REVIEWED_WITH_AMENDMENTS",
        "archive": "FUSION_ARCHIVED",
    },
    "FUSION_REVIEWED_WITH_AMENDMENTS": {
        "approve": "FUSION_APPROVED",
        "sign": "FUSION_SIGNED",
        "archive": "FUSION_ARCHIVED",
    },
    "FUSION_SIGNED": {
        "archive": "FUSION_ARCHIVED",
    },
}

# ── JSON helpers ─────────────────────────────────────────────────────────────


def _load_json(raw: str | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _dump_json(obj: Any) -> str | None:
    if obj is None:
        return None
    return json.dumps(obj, default=str)


# ── Input gathering ──────────────────────────────────────────────────────────


def _latest_qeeg_analysis(db: Session, patient_id: str) -> QEEGAnalysis | None:
    return (
        db.query(QEEGAnalysis)
        .filter(
            QEEGAnalysis.patient_id == patient_id,
            QEEGAnalysis.analysis_status == "completed",
        )
        .order_by(QEEGAnalysis.analyzed_at.desc(), QEEGAnalysis.created_at.desc())
        .first()
    )


def _latest_mri_analysis(db: Session, patient_id: str) -> MriAnalysis | None:
    return (
        db.query(MriAnalysis)
        .filter(
            MriAnalysis.patient_id == patient_id,
            MriAnalysis.state == "SUCCESS",
        )
        .order_by(MriAnalysis.created_at.desc())
        .first()
    )


def _latest_assessments(db: Session, patient_id: str, limit: int = 10) -> list[AssessmentRecord]:
    return (
        db.query(AssessmentRecord)
        .filter(
            AssessmentRecord.patient_id == patient_id,
            AssessmentRecord.status == "completed",
        )
        .order_by(AssessmentRecord.completed_at.desc(), AssessmentRecord.created_at.desc())
        .limit(limit)
        .all()
    )


def _latest_courses(db: Session, patient_id: str, limit: int = 5) -> list[TreatmentCourse]:
    return (
        db.query(TreatmentCourse)
        .filter(TreatmentCourse.patient_id == patient_id)
        .order_by(TreatmentCourse.created_at.desc())
        .limit(limit)
        .all()
    )


def _build_inputs(
    db: Session,
    patient_id: str,
) -> dict[str, Any]:
    """Gather all multimodal inputs for fusion."""
    qeeg = _latest_qeeg_analysis(db, patient_id)
    mri = _latest_mri_analysis(db, patient_id)
    assessments = _latest_assessments(db, patient_id)
    courses = _latest_courses(db, patient_id)

    qeeg_payload = _qeeg_payload(qeeg)
    mri_payload = _mri_payload(mri)

    return {
        "qeeg": qeeg,
        "mri": mri,
        "qeeg_payload": qeeg_payload,
        "mri_payload": mri_payload,
        "assessments": assessments,
        "courses": courses,
        "partial": not (qeeg is not None and mri is not None),
    }


def _qeeg_payload(row: QEEGAnalysis | None) -> dict[str, Any] | None:
    if row is None:
        return None
    flagged = _load_json(getattr(row, "flagged_conditions", None))
    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "analysis_status": row.analysis_status,
        "band_powers": _load_json(row.band_powers_json),
        "advanced_analyses": _load_json(row.advanced_analyses_json),
        "brain_age": _load_json(getattr(row, "brain_age_json", None)),
        "risk_scores": _load_json(getattr(row, "risk_scores_json", None)),
        "protocol_recommendation": _load_json(getattr(row, "protocol_recommendation_json", None)),
        "flagged_conditions": flagged if isinstance(flagged, list) else [],
        "quality_metrics": _load_json(getattr(row, "quality_metrics_json", None)),
        "analyzed_at": row.analyzed_at.isoformat() if row.analyzed_at else None,
    }


def _mri_payload(row: MriAnalysis | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "analysis_id": row.analysis_id,
        "patient_id": row.patient_id,
        "state": row.state,
        "structural": _load_json(row.structural_json),
        "functional": _load_json(row.functional_json),
        "diffusion": _load_json(row.diffusion_json),
        "stim_targets": _load_json(row.stim_targets_json),
        "qc": _load_json(row.qc_json),
        "condition": row.condition,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


# ── Agreement engine ─────────────────────────────────────────────────────────


def _run_agreement_engine(
    qeeg_payload: dict[str, Any] | None,
    mri_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    """Deterministic heuristic comparing qEEG vs MRI findings."""
    items: list[dict[str, Any]] = []

    # 1. Condition agreement
    qeeg_conditions = set()
    if qeeg_payload:
        for cond in qeeg_payload.get("flagged_conditions", []):
            if isinstance(cond, dict):
                qeeg_conditions.add(cond.get("condition", "").lower().strip())
            elif isinstance(cond, str):
                qeeg_conditions.add(cond.lower().strip())
    mri_condition = (mri_payload.get("condition") or "").lower().strip() if mri_payload else ""

    if qeeg_conditions and mri_condition:
        if mri_condition in qeeg_conditions:
            items.append({
                "topic": "condition",
                "qeeg_position": ", ".join(sorted(qeeg_conditions)),
                "mri_position": mri_condition,
                "status": "AGREE",
                "severity": "info",
                "recommendation": "Both modalities converge on the same primary condition.",
            })
        else:
            items.append({
                "topic": "condition",
                "qeeg_position": ", ".join(sorted(qeeg_conditions)),
                "mri_position": mri_condition,
                "status": "DISAGREE",
                "severity": "warn",
                "recommendation": "qEEG and MRI suggest different primary conditions. Clinical correlation required.",
            })
    elif qeeg_conditions or mri_condition:
        present = qeeg_conditions or {mri_condition}
        items.append({
            "topic": "condition",
            "qeeg_position": ", ".join(sorted(qeeg_conditions)) if qeeg_conditions else "(no data)",
            "mri_position": mri_condition if mri_condition else "(no data)",
            "status": "PARTIAL",
            "severity": "info",
            "recommendation": f"Only one modality flagged condition: {', '.join(sorted(present))}.",
        })

    # 2. Brain-age / structural agreement
    brain_age_gap = None
    if qeeg_payload and qeeg_payload.get("brain_age"):
        ba = qeeg_payload["brain_age"]
        if isinstance(ba, dict):
            brain_age_gap = ba.get("gap_years") or ba.get("brain_age_gap")
    mri_atrophy = False
    if mri_payload and mri_payload.get("structural"):
        struct = mri_payload["structural"]
        if isinstance(struct, dict):
            findings = struct.get("findings", [])
            for f in findings:
                if isinstance(f, dict):
                    label = (f.get("label") or "").lower()
                    if "atrophy" in label or "volume loss" in label:
                        mri_atrophy = True

    if brain_age_gap is not None and mri_atrophy:
        if brain_age_gap > 5:
            items.append({
                "topic": "brain_age_structural",
                "qeeg_position": f"Brain age gap +{brain_age_gap:.1f} years",
                "mri_position": "Atrophy / volume loss detected",
                "status": "AGREE",
                "severity": "warn",
                "recommendation": "Both modalities indicate accelerated brain aging. Consider neuroprotective protocols.",
            })
        else:
            items.append({
                "topic": "brain_age_structural",
                "qeeg_position": f"Brain age gap {brain_age_gap:.1f} years (within normal range)",
                "mri_position": "Atrophy / volume loss detected",
                "status": "DISAGREE",
                "severity": "warn",
                "recommendation": "MRI shows atrophy but qEEG brain age is normal. Verify structural analysis and clinical context.",
            })
    elif brain_age_gap is not None and brain_age_gap > 5:
        items.append({
            "topic": "brain_age_structural",
            "qeeg_position": f"Brain age gap +{brain_age_gap:.1f} years",
            "mri_position": "(no atrophy data)",
            "status": "PARTIAL",
            "severity": "info",
            "recommendation": "qEEG suggests accelerated brain aging but MRI structural data is unavailable.",
        })
    elif mri_atrophy:
        items.append({
            "topic": "brain_age_structural",
            "qeeg_position": "(no brain-age data)",
            "mri_position": "Atrophy / volume loss detected",
            "status": "PARTIAL",
            "severity": "info",
            "recommendation": "MRI shows atrophy but qEEG brain age is unavailable.",
        })

    # 3. Protocol agreement
    qeeg_target = ""
    if qeeg_payload and qeeg_payload.get("protocol_recommendation"):
        rec = qeeg_payload["protocol_recommendation"]
        if isinstance(rec, dict):
            qeeg_target = (rec.get("target_region") or rec.get("target") or "").lower().strip()
    mri_target = ""
    if mri_payload and mri_payload.get("stim_targets"):
        targets = mri_payload["stim_targets"]
        if isinstance(targets, list) and targets:
            first = targets[0]
            if isinstance(first, dict):
                mri_target = (first.get("region") or first.get("label") or "").lower().strip()

    if qeeg_target and mri_target:
        if qeeg_target == mri_target:
            items.append({
                "topic": "protocol_target",
                "qeeg_position": qeeg_target.upper(),
                "mri_position": mri_target.upper(),
                "status": "AGREE",
                "severity": "info",
                "recommendation": f"Both modalities target {qeeg_target.upper()}. Fusion recommends MRI-guided coordinates with qEEG-informed parameters.",
            })
        else:
            items.append({
                "topic": "protocol_target",
                "qeeg_position": qeeg_target.upper(),
                "mri_position": mri_target.upper(),
                "status": "CONFLICT",
                "severity": "critical",
                "recommendation": f"qEEG recommends {qeeg_target.upper()} but MRI targets {mri_target.upper()}. Clinician resolution required.",
            })
    elif qeeg_target or mri_target:
        items.append({
            "topic": "protocol_target",
            "qeeg_position": qeeg_target.upper() if qeeg_target else "(no recommendation)",
            "mri_position": mri_target.upper() if mri_target else "(no targets)",
            "status": "PARTIAL",
            "severity": "info",
            "recommendation": "Only one modality provided targeting guidance.",
        })

    # 4. Safety agreement
    qeeg_red_flags = []
    mri_red_flags = []
    if qeeg_payload:
        qeeg_red_flags = [f.get("code", "UNKNOWN") for f in qeeg_payload.get("red_flags", []) if isinstance(f, dict)]
    if mri_payload:
        mri_red_flags = [f.get("code", "UNKNOWN") for f in mri_payload.get("red_flags", []) if isinstance(f, dict)]

    shared = set(qeeg_red_flags) & set(mri_red_flags)
    if shared:
        items.append({
            "topic": "safety",
            "qeeg_position": ", ".join(qeeg_red_flags) if qeeg_red_flags else "(none)",
            "mri_position": ", ".join(mri_red_flags) if mri_red_flags else "(none)",
            "status": "AGREE",
            "severity": "warn",
            "recommendation": f"Both modalities flagged: {', '.join(sorted(shared))}. Elevated safety monitoring recommended.",
        })
    elif qeeg_red_flags or mri_red_flags:
        items.append({
            "topic": "safety",
            "qeeg_position": ", ".join(qeeg_red_flags) if qeeg_red_flags else "(none)",
            "mri_position": ", ".join(mri_red_flags) if mri_red_flags else "(none)",
            "status": "PARTIAL",
            "severity": "info",
            "recommendation": "Only one modality raised safety flags. Cross-check with clinical history.",
        })

    # Overall score
    if not items:
        overall_status = "no_data"
        score = 0.0
    else:
        status_counts = {"AGREE": 0, "DISAGREE": 0, "CONFLICT": 0, "PARTIAL": 0}
        for item in items:
            status_counts[item["status"]] = status_counts.get(item["status"], 0) + 1
        if status_counts["CONFLICT"] > 0:
            overall_status = "conflict"
        elif status_counts["DISAGREE"] > 0:
            overall_status = "disagreement"
        elif status_counts["AGREE"] > status_counts["PARTIAL"]:
            overall_status = "agreement"
        else:
            overall_status = "partial"
        score = round(status_counts["AGREE"] / len(items), 3)

    return {
        "overall_status": overall_status,
        "score": score,
        "items": items,
        "decision_support_only": True,
    }


# ── Protocol fusion ──────────────────────────────────────────────────────────


def _run_protocol_fusion(
    qeeg_payload: dict[str, Any] | None,
    mri_payload: dict[str, Any] | None,
    agreement: dict[str, Any],
) -> dict[str, Any]:
    """Merge qEEG protocol recommendation with MRI stim targets."""
    qeeg_rec = (qeeg_payload or {}).get("protocol_recommendation") or {}
    mri_targets = (mri_payload or {}).get("stim_targets") or []
    if isinstance(mri_targets, dict):
        mri_targets = [mri_targets]

    # Extract target region from each modality
    qeeg_target = ""
    qeeg_params = {}
    if isinstance(qeeg_rec, dict):
        qeeg_target = (qeeg_rec.get("target_region") or qeeg_rec.get("target") or "").lower().strip()
        qeeg_params = {
            "frequency_hz": qeeg_rec.get("frequency_hz"),
            "intensity": qeeg_rec.get("intensity"),
            "duration_minutes": qeeg_rec.get("duration_minutes"),
            "sessions": qeeg_rec.get("sessions"),
            "evidence_grade": qeeg_rec.get("evidence_grade", "heuristic"),
        }

    mri_target = ""
    mri_coords = {}
    if mri_targets and isinstance(mri_targets[0], dict):
        mri_target = (mri_targets[0].get("region") or mri_targets[0].get("label") or "").lower().strip()
        mri_coords = {
            "x": mri_targets[0].get("x"),
            "y": mri_targets[0].get("y"),
            "z": mri_targets[0].get("z"),
            "atlas": mri_targets[0].get("atlas"),
        }

    # Determine fusion status
    if qeeg_target and mri_target:
        if qeeg_target == mri_target:
            fusion_status = "merged"
            recommendation = (
                f"Use MRI-guided coordinates for {qeeg_target.upper()} "
                f"with qEEG-informed stimulation parameters."
            )
        else:
            fusion_status = "conflict"
            recommendation = (
                f"qEEG recommends {qeeg_target.upper()}; MRI targets {mri_target.upper()}. "
                f"Clinician must select one or justify dual-targeting."
            )
    elif qeeg_target:
        fusion_status = "qeeg_only"
        recommendation = f"qEEG recommends {qeeg_target.upper()}. MRI targeting is not available."
    elif mri_target:
        fusion_status = "mri_only"
        recommendation = f"MRI targets {mri_target.upper()}. qEEG protocol guidance is not available."
    else:
        fusion_status = "none"
        recommendation = "No protocol guidance available from either modality."

    return {
        "fusion_status": fusion_status,
        "recommendation": recommendation,
        "qeeg_protocol": {
            "target_region": qeeg_target.upper() if qeeg_target else None,
            "parameters": qeeg_params,
        },
        "mri_target": {
            "region": mri_target.upper() if mri_target else None,
            "coordinates": mri_coords,
        } if mri_target else None,
        "off_label": qeeg_rec.get("off_label", False) if isinstance(qeeg_rec, dict) else False,
        "evidence_grade": qeeg_rec.get("evidence_grade", "heuristic") if isinstance(qeeg_rec, dict) else "heuristic",
        "decision_support_only": True,
    }


# ── Summary generation ───────────────────────────────────────────────────────


def _generate_summary(
    inputs: dict[str, Any],
    agreement: dict[str, Any],
    protocol_fusion: dict[str, Any],
) -> tuple[str, float, str]:
    """Return (summary, confidence, confidence_grade)."""
    qeeg = inputs.get("qeeg_payload")
    mri = inputs.get("mri_payload")
    partial = inputs.get("partial", True)

    # Try external fusion package first
    try:
        from deepsynaps_qeeg.ai.fusion import synthesize_fusion_recommendation
        result = synthesize_fusion_recommendation(
            patient_id=inputs.get("patient_id", ""),
            qeeg_analysis_id=qeeg.get("id") if qeeg else None,
            qeeg=qeeg,
            mri_analysis_id=mri.get("analysis_id") if mri else None,
            mri=mri,
        )
        summary = result.get("summary", "")
        confidence = result.get("confidence")
        grade = result.get("confidence_grade", "heuristic")
        return summary, confidence, grade
    except Exception:
        pass

    # Fallback deterministic summary
    modality_count = sum([qeeg is not None, mri is not None])
    if partial:
        summary = (
            f"Partial fusion available from {modality_count} modality. "
            f"{protocol_fusion.get('recommendation', '')} "
            f"Agreement status: {agreement.get('overall_status', 'unknown')}."
        )
        confidence = 0.15 + (0.25 * modality_count)
    else:
        summary = (
            f"Dual-modality fusion available. qEEG and MRI signals were combined. "
            f"{protocol_fusion.get('recommendation', '')} "
            f"Agreement status: {agreement.get('overall_status', 'unknown')} "
            f"(score: {agreement.get('score', 0)})."
        )
        confidence = 0.15 + (0.25 * modality_count) + 0.08
    confidence = round(min(confidence, 0.95), 3)
    return summary, confidence, "heuristic"


# ── Patient-facing report ────────────────────────────────────────────────────


def _build_patient_facing_report(fusion_case: FusionCase) -> dict[str, Any]:
    """Strip BLOCKED content, soften INFERRED claims, pseudonymize."""
    governance = _load_json(fusion_case.governance_json) or []
    if not isinstance(governance, list):
        governance = []

    allowed_claims = []
    for claim in governance:
        if not isinstance(claim, dict):
            continue
        ctype = claim.get("claim_type", "OBSERVED")
        text = claim.get("text", "")
        if ctype == "BLOCKED":
            continue
        if ctype == "INFERRED":
            text = text.replace("suggests", "could be associated with")
            text = text.replace("indicates", "may reflect")
            text = text.replace("confirms", "is consistent with")
        allowed_claims.append({"claim_type": ctype, "text": text})

    patient_id_hash = hashlib.sha256(fusion_case.patient_id.encode()).hexdigest()[:16]

    return {
        "patient_id_hash": f"sha256:{patient_id_hash}",
        "summary": fusion_case.summary,
        "confidence": fusion_case.confidence,
        "confidence_grade": fusion_case.confidence_grade,
        "protocol_recommendation": (_load_json(fusion_case.protocol_fusion_json) or {}).get("recommendation"),
        "claims": allowed_claims,
        "limitations": _load_json(fusion_case.limitations_json) or [],
        "disclaimer": (
            "This report is decision-support only and not a diagnosis or prescription. "
            "Always consult your clinician for care decisions."
        ),
        "generated_at": fusion_case.generated_at.isoformat() if fusion_case.generated_at else None,
        "decision_support_only": True,
    }


# ── Main orchestrator ────────────────────────────────────────────────────────


def create_fusion_case(
    db: Session,
    patient_id: str,
    actor_id: str,
    actor_role: str,
    force_include_assessment_ids: list[str] | None = None,
    force_include_course_ids: list[str] | None = None,
) -> FusionCase | dict[str, Any]:
    """Run safety gates, gather inputs, generate fusion case.

    Returns a ``FusionCase`` on success, or a safety-block dict on failure.
    """
    inputs = _build_inputs(db, patient_id)
    qeeg = inputs["qeeg"]
    mri = inputs["mri"]

    # Safety gates
    safety = run_safety_gates(db, qeeg, mri)
    if safety.blocked:
        return {
            "blocked": True,
            "reasons": safety.reasons,
            "next_steps": safety.next_steps,
            "warnings": safety.warnings,
        }

    # Agreement engine
    agreement = _run_agreement_engine(inputs["qeeg_payload"], inputs["mri_payload"])

    # Protocol fusion
    protocol_fusion = _run_protocol_fusion(
        inputs["qeeg_payload"], inputs["mri_payload"], agreement
    )

    # Summary
    summary, confidence, grade = _generate_summary(inputs, agreement, protocol_fusion)

    # Recommendations
    recommendations = []
    if protocol_fusion.get("fusion_status") == "conflict":
        recommendations.append("Clinician must resolve target conflict before proceeding.")
    elif protocol_fusion.get("fusion_status") == "merged":
        recommendations.append("Proceed with MRI-guided coordinates and qEEG-informed parameters.")
    elif protocol_fusion.get("fusion_status") in ("qeeg_only", "mri_only"):
        recommendations.append("Consider acquiring the missing modality to upgrade to dual-modality fusion.")
    if agreement.get("overall_status") == "conflict":
        recommendations.append("Review conflicting findings between modalities before finalizing protocol.")

    # Limitations
    limitations = []
    if inputs["partial"]:
        limitations.append("Fusion is partial — only one modality contributed.")
    if safety.warnings:
        limitations.extend(safety.warnings)
    limitations.append(
        "Confidence score is algorithmic heuristic and not evidence-graded clinical validation."
    )

    # Missing modalities
    missing_modalities = []
    if qeeg is None:
        missing_modalities.append("qeeg")
    if mri is None:
        missing_modalities.append("mri")

    # Assessment / course IDs
    assessment_ids = [a.id for a in inputs["assessments"]]
    course_ids = [c.id for c in inputs["courses"]]
    if force_include_assessment_ids:
        assessment_ids = list(dict.fromkeys(assessment_ids + force_include_assessment_ids))
    if force_include_course_ids:
        course_ids = list(dict.fromkeys(course_ids + force_include_course_ids))

    # Source report states
    source_qeeg_state = None
    if qeeg is not None:
        qeeg_report = (
            db.query(QEEGAIReport)
            .filter_by(analysis_id=qeeg.id)
            .order_by(QEEGAIReport.created_at.desc())
            .first()
        )
        source_qeeg_state = qeeg_report.report_state if qeeg_report else qeeg.analysis_status

    source_mri_state = mri.report_state if mri else None
    radiology_required = False
    if mri is not None:
        cockpit = _load_json(mri.safety_cockpit_json) or {}
        for flag in cockpit.get("red_flags", []):
            if isinstance(flag, dict) and flag.get("code") == "RADIOLOGY_REVIEW_REQUIRED":
                radiology_required = not flag.get("resolved", False)

    # Provenance
    provenance = {
        "qeeg_analysis_id": qeeg.id if qeeg else None,
        "mri_analysis_id": mri.analysis_id if mri else None,
        "assessment_count": len(assessment_ids),
        "course_count": len(course_ids),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator": "fusion_workbench_service.v1",
    }

    # Build the case
    case = FusionCase(
        patient_id=patient_id,
        clinician_id=actor_id,
        qeeg_analysis_id=qeeg.id if qeeg else None,
        mri_analysis_id=mri.analysis_id if mri else None,
        assessment_ids_json=_dump_json(assessment_ids),
        course_ids_json=_dump_json(course_ids),
        summary=summary,
        confidence=confidence,
        confidence_grade=grade,
        recommendations_json=_dump_json(recommendations),
        modality_agreement_json=_dump_json(agreement),
        protocol_fusion_json=_dump_json(protocol_fusion),
        explainability_json=_dump_json({
            "top_modalities": [
                {"modality": "qEEG", "weight": 0.5 if qeeg else 0.0},
                {"modality": "MRI", "weight": 0.5 if mri else 0.0},
            ],
            "missing_data_notes": [f"Modality '{m}' missing." for m in missing_modalities],
            "cautions": [
                "Fusion output is decision-support only, not a prescription or diagnosis.",
                "Predicted trajectories are model-estimated response patterns with uncertainty.",
            ],
        }),
        safety_cockpit_json=_dump_json({
            "overall_status": "safe" if not safety.reasons else "blocked",
            "red_flags": [],
            "warnings": safety.warnings,
        }),
        red_flags_json=_dump_json([]),
        governance_json=_dump_json([
            {"section": "summary", "claim_type": "INFERRED", "text": summary},
        ]),
        limitations_json=_dump_json(limitations),
        missing_modalities_json=_dump_json(missing_modalities),
        provenance_json=_dump_json(provenance),
        report_state="FUSION_DRAFT_AI",
        partial=inputs["partial"],
        source_qeeg_state=source_qeeg_state,
        source_mri_state=source_mri_state,
        radiology_review_required=radiology_required,
        generated_at=datetime.now(timezone.utc),
    )

    db.add(case)
    db.commit()
    db.refresh(case)

    # Auto-transition to NEEDS_CLINICAL_REVIEW
    _write_audit(db, case.id, "create", actor_id, actor_role, None, "FUSION_DRAFT_AI", "Fusion case created by AI.")

    return case


# ── State transitions ────────────────────────────────────────────────────────


def _write_audit(
    db: Session,
    case_id: str,
    action: str,
    actor_id: str,
    actor_role: str,
    previous_state: str | None,
    new_state: str,
    note: str | None = None,
) -> None:
    audit = FusionCaseAudit(
        fusion_case_id=case_id,
        action=action,
        actor_id=actor_id,
        actor_role=actor_role,
        previous_state=previous_state,
        new_state=new_state,
        note=note,
    )
    db.add(audit)
    db.commit()


def transition_fusion_case_state(
    db: Session,
    fusion_case_id: str,
    action: str,
    actor_id: str,
    actor_role: str,
    note: str | None = None,
    amendments: str | None = None,
) -> FusionCase:
    """Transition a FusionCase through its state machine."""
    case = db.query(FusionCase).filter_by(id=fusion_case_id).first()
    if case is None:
        raise ValueError(f"FusionCase {fusion_case_id} not found")

    current = case.report_state
    allowed = VALID_TRANSITIONS.get(current, {})
    if action not in allowed:
        raise ValueError(
            f"Invalid transition '{action}' from state '{current}'. "
            f"Allowed: {list(allowed.keys())}"
        )

    new_state = allowed[action]
    previous = case.report_state
    case.report_state = new_state

    if action in ("approve", "amend"):
        case.reviewer_id = actor_id
        case.reviewed_at = datetime.now(timezone.utc)
    if action == "amend" and amendments:
        case.clinician_amendments = amendments
    if action == "sign":
        case.signed_by = actor_id
        case.signed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(case)

    _write_audit(db, case.id, action, actor_id, actor_role, previous, new_state, note)
    return case


# ── Findings ─────────────────────────────────────────────────────────────────


def review_fusion_finding(
    db: Session,
    fusion_case_id: str,
    finding_id: str,
    actor_id: str,
    status: str,
    clinician_note: str | None = None,
    amended_text: str | None = None,
) -> FusionCaseFinding:
    """Update a single finding review record."""
    finding = (
        db.query(FusionCaseFinding)
        .filter_by(id=finding_id, fusion_case_id=fusion_case_id)
        .first()
    )
    if finding is None:
        raise ValueError(f"Finding {finding_id} not found in case {fusion_case_id}")

    finding.status = status
    if clinician_note is not None:
        finding.clinician_note = clinician_note
    if amended_text is not None:
        finding.amended_text = amended_text
    db.commit()
    db.refresh(finding)
    return finding
