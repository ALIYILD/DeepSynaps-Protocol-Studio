from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.errors import ApiServiceError
from app.persistence.models import MriAnalysis, OutcomeEvent, OutcomeSeries, Patient, QEEGAnalysis, TreatmentCourse


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _safe_json(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _pick_qeeg_summary(row: QEEGAnalysis) -> dict[str, Any]:
    band_powers = _safe_json(row.band_powers_json) or {}
    flagged_conditions = _safe_json(row.flagged_conditions) or []
    return {
        "status": row.analysis_status,
        "recording_date": row.recording_date,
        "eyes_condition": row.eyes_condition,
        "channels": row.channel_count,
        "sample_rate_hz": row.sample_rate_hz,
        "flagged_conditions": flagged_conditions,
        "bands_present": sorted(list(band_powers.keys()))[:10] if isinstance(band_powers, dict) else [],
    }


def _pick_mri_summary(row: MriAnalysis) -> dict[str, Any]:
    stim_targets = _safe_json(row.stim_targets_json) or []
    qc = _safe_json(row.qc_json) or {}
    return {
        "state": row.state,
        "condition": row.condition,
        "pipeline_version": row.pipeline_version,
        "norm_db_version": row.norm_db_version,
        "modalities_present": _safe_json(row.modalities_present_json) or [],
        "stim_target_count": len(stim_targets) if isinstance(stim_targets, list) else 0,
        "qc_passed": qc.get("passed") if isinstance(qc, dict) else None,
    }


def build_neuromodulation_fhir_bundle(
    db: Session,
    patient_id: str,
    *,
    qeeg_analysis_id: Optional[str] = None,
    mri_analysis_id: Optional[str] = None,
) -> dict[str, Any]:
    qeeg_query = db.query(QEEGAnalysis).filter(QEEGAnalysis.patient_id == patient_id)
    if qeeg_analysis_id:
        qeeg_query = qeeg_query.filter(QEEGAnalysis.id == qeeg_analysis_id)
    qeeg_row = qeeg_query.order_by(QEEGAnalysis.created_at.desc()).first()

    mri_query = db.query(MriAnalysis).filter(MriAnalysis.patient_id == patient_id)
    if mri_analysis_id:
        mri_query = mri_query.filter(MriAnalysis.analysis_id == mri_analysis_id)
    mri_row = mri_query.order_by(MriAnalysis.created_at.desc()).first()

    outcome_rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id == patient_id)
        .order_by(OutcomeSeries.administered_at.asc())
        .all()
    )
    event_rows = (
        db.query(OutcomeEvent)
        .filter(OutcomeEvent.patient_id == patient_id)
        .order_by(OutcomeEvent.recorded_at.desc())
        .limit(25)
        .all()
    )

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient is None and qeeg_row is None and mri_row is None and not outcome_rows:
        raise ApiServiceError(code="patient_not_found", message="Patient not found", status_code=404)

    if patient is None:
        synthetic_name = f"Patient {patient_id}"
        patient = Patient(
            id=patient_id,
            clinician_id="unknown",
            first_name=synthetic_name,
            last_name="",
            status="active",
        )

    course_rows = (
        db.query(TreatmentCourse)
        .filter(TreatmentCourse.patient_id == patient_id)
        .order_by(TreatmentCourse.created_at.desc())
        .all()
    )

    entries: list[dict[str, Any]] = []

    patient_ref = f"Patient/{patient.id}"
    entries.append(
        {
            "fullUrl": patient_ref,
            "resource": {
                "resourceType": "Patient",
                "id": patient.id,
                "name": [{"text": f"{patient.first_name} {patient.last_name}".strip()}],
                "gender": (patient.gender or "").lower() or None,
                "birthDate": patient.dob,
                "telecom": ([{"system": "email", "value": patient.email}] if patient.email else []),
            },
        }
    )

    if patient.primary_condition:
        entries.append(
            {
                "fullUrl": f"Condition/{patient.id}-primary",
                "resource": {
                    "resourceType": "Condition",
                    "id": f"{patient.id}-primary",
                    "subject": {"reference": patient_ref},
                    "clinicalStatus": {"text": patient.status},
                    "code": {"text": patient.primary_condition},
                },
            }
        )

    for course in course_rows[:5]:
        entries.append(
            {
                "fullUrl": f"CarePlan/{course.id}",
                "resource": {
                    "resourceType": "CarePlan",
                    "id": course.id,
                    "subject": {"reference": patient_ref},
                    "status": "active" if course.status in {"active", "pending_approval"} else "completed",
                    "intent": "plan",
                    "title": f"{course.modality_slug} neuromodulation course",
                    "description": f"{course.condition_slug} · {course.protocol_id}",
                    "period": {"start": _iso(course.started_at), "end": _iso(course.completed_at)},
                },
            }
        )

    if qeeg_row is not None:
        entries.append(
            {
                "fullUrl": f"DiagnosticReport/qeeg-{qeeg_row.id}",
                "resource": {
                    "resourceType": "DiagnosticReport",
                    "id": f"qeeg-{qeeg_row.id}",
                    "status": "final" if qeeg_row.analysis_status == "completed" else "registered",
                    "code": {"text": "qEEG analysis"},
                    "subject": {"reference": patient_ref},
                    "effectiveDateTime": _iso(qeeg_row.analyzed_at or qeeg_row.created_at),
                    "presentedForm": [{
                        "contentType": "application/json",
                        "title": "qEEG summary",
                        "data": json.dumps(_pick_qeeg_summary(qeeg_row)),
                    }],
                },
            }
        )

    if mri_row is not None:
        entries.append(
            {
                "fullUrl": f"DiagnosticReport/mri-{mri_row.analysis_id}",
                "resource": {
                    "resourceType": "DiagnosticReport",
                    "id": f"mri-{mri_row.analysis_id}",
                    "status": "final" if (mri_row.state or "").lower() == "success" else "registered",
                    "code": {"text": "MRI analysis"},
                    "subject": {"reference": patient_ref},
                    "effectiveDateTime": _iso(mri_row.created_at),
                    "presentedForm": [{
                        "contentType": "application/json",
                        "title": "MRI summary",
                        "data": json.dumps(_pick_mri_summary(mri_row)),
                    }],
                },
            }
        )

    for idx, row in enumerate(outcome_rows[:50], start=1):
        entries.append(
            {
                "fullUrl": f"Observation/outcome-{row.id}",
                "resource": {
                    "resourceType": "Observation",
                    "id": f"outcome-{row.id}",
                    "status": "final",
                    "code": {"text": row.template_title or row.template_id},
                    "subject": {"reference": patient_ref},
                    "effectiveDateTime": _iso(row.administered_at),
                    "valueQuantity": (
                        {"value": row.score_numeric, "unit": "score"} if row.score_numeric is not None else None
                    ),
                    "valueString": row.score if row.score_numeric is None else None,
                    "note": [{"text": f"{row.measurement_point} assessment #{idx}"}],
                },
            }
        )

    for row in event_rows:
        entries.append(
            {
                "fullUrl": f"ClinicalImpression/{row.id}",
                "resource": {
                    "resourceType": "ClinicalImpression",
                    "id": row.id,
                    "status": "completed",
                    "subject": {"reference": patient_ref},
                    "date": _iso(row.recorded_at),
                    "summary": row.title,
                    "description": row.summary,
                    "note": [{
                        "text": json.dumps(
                            {
                                "event_type": row.event_type,
                                "severity": row.severity,
                                "source_type": row.source_type,
                                "source_id": row.source_id,
                            }
                        )
                    }],
                },
            }
        )

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "identifier": {"system": "urn:deepsynaps:fhir-export", "value": f"neuromod-{patient.id}"},
        "entry": entries,
    }
