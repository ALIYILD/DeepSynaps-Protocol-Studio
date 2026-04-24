from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any, Optional
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy.orm import Session

from app.errors import ApiServiceError
from app.persistence.models import MriAnalysis, OutcomeSeries, Patient, QEEGAnalysis


def _safe_json(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _slug(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-") or "unknown"


def build_bids_derivatives_zip(
    db: Session,
    patient_id: str,
    *,
    qeeg_analysis_id: Optional[str] = None,
    mri_analysis_id: Optional[str] = None,
) -> tuple[bytes, str]:
    qeeg_query = db.query(QEEGAnalysis).filter(QEEGAnalysis.patient_id == patient_id)
    if qeeg_analysis_id:
        qeeg_query = qeeg_query.filter(QEEGAnalysis.id == qeeg_analysis_id)
    qeeg_rows = qeeg_query.order_by(QEEGAnalysis.created_at.desc()).limit(5).all()

    mri_query = db.query(MriAnalysis).filter(MriAnalysis.patient_id == patient_id)
    if mri_analysis_id:
        mri_query = mri_query.filter(MriAnalysis.analysis_id == mri_analysis_id)
    mri_rows = mri_query.order_by(MriAnalysis.created_at.desc()).limit(5).all()

    outcome_rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id == patient_id)
        .order_by(OutcomeSeries.administered_at.asc())
        .all()
    )

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient is None and not qeeg_rows and not mri_rows and not outcome_rows:
        raise ApiServiceError(code="patient_not_found", message="Patient not found", status_code=404)
    if patient is None:
        patient = Patient(
            id=patient_id,
            clinician_id="unknown",
            first_name="Patient",
            last_name=patient_id,
            status="active",
        )

    participant_label = f"sub-{_slug(patient.id)}"
    buffer = io.BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as zf:
        zf.writestr(
            "dataset_description.json",
            json.dumps(
                {
                    "Name": "DeepSynaps Neuromodulation Derivatives Export",
                    "BIDSVersion": "1.9.0",
                    "DatasetType": "derivative",
                    "GeneratedBy": [
                        {
                            "Name": "DeepSynaps Protocol Studio",
                            "Version": "contract-v3-minimal",
                        }
                    ],
                    "GeneratedAt": datetime.now(timezone.utc).isoformat(),
                },
                indent=2,
            ),
        )

        participants = io.StringIO()
        writer = csv.writer(participants, delimiter="\t", lineterminator="\n")
        writer.writerow(["participant_id", "sex", "age", "primary_condition"])
        writer.writerow([participant_label, patient.gender or "n/a", "n/a", patient.primary_condition or ""])
        zf.writestr("participants.tsv", participants.getvalue())

        derivatives_root = f"derivatives/deepsynaps/{participant_label}"
        zf.writestr(
            f"{derivatives_root}/README",
            "Synthetic derivative export. References original qEEG/MRI artifacts and includes derived JSON summaries.",
        )

        for row in qeeg_rows:
            payload = {
                "analysis_id": row.id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "analyzed_at": row.analyzed_at.isoformat() if row.analyzed_at else None,
                "source_ref": row.file_ref,
                "original_filename": row.original_filename,
                "recording_date": row.recording_date,
                "eyes_condition": row.eyes_condition,
                "band_powers": _safe_json(row.band_powers_json),
                "normative_deviations": _safe_json(row.normative_deviations_json),
                "advanced_analyses": _safe_json(row.advanced_analyses_json),
            }
            zf.writestr(
                f"{derivatives_root}/qeeg/{participant_label}_desc-{_slug(row.id)}_qeeg.json",
                json.dumps(payload, indent=2),
            )

        for row in mri_rows:
            payload = {
                "analysis_id": row.analysis_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "state": row.state,
                "source_ref": row.upload_ref,
                "modalities_present": _safe_json(row.modalities_present_json),
                "structural": _safe_json(row.structural_json),
                "functional": _safe_json(row.functional_json),
                "diffusion": _safe_json(row.diffusion_json),
                "stim_targets": _safe_json(row.stim_targets_json),
                "overlays": _safe_json(row.overlays_json),
                "qc": _safe_json(row.qc_json),
            }
            zf.writestr(
                f"{derivatives_root}/mri/{participant_label}_desc-{_slug(row.analysis_id)}_mri.json",
                json.dumps(payload, indent=2),
            )

        outcomes = io.StringIO()
        writer = csv.writer(outcomes, delimiter="\t", lineterminator="\n")
        writer.writerow(["patient_id", "course_id", "template_id", "measurement_point", "score_numeric", "administered_at"])
        for row in outcome_rows:
            writer.writerow(
                [
                    patient.id,
                    row.course_id,
                    row.template_id,
                    row.measurement_point,
                    "" if row.score_numeric is None else row.score_numeric,
                    row.administered_at.isoformat() if row.administered_at else "",
                ]
            )
        zf.writestr(f"{derivatives_root}/phenotype/{participant_label}_outcomes.tsv", outcomes.getvalue())

    filename = f"bids_derivatives_{_slug(patient.last_name or patient.id)}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.zip"
    return buffer.getvalue(), filename
