"""Build template variable tree from QEEG analysis + patient rows."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.persistence.models import Patient, QEEGAnalysis


def build_template_context(analysis_id: str, db: Session) -> dict[str, Any]:
    row = db.query(QEEGAnalysis).filter(QEEGAnalysis.id == analysis_id).first()
    if row is None:
        return {"analysis": {"id": analysis_id}, "patient": {}, "indices": {}, "recording": {}}

    patient_block: dict[str, Any] = {}
    pt = db.query(Patient).filter(Patient.id == row.patient_id).first()
    if pt is not None:
        patient_block = {
            "firstName": pt.first_name,
            "lastName": pt.last_name,
            "dob": pt.dob or "",
            "gender": pt.gender or "",
            "primaryCondition": pt.primary_condition or "",
        }

    recording = {
        "durationSec": row.recording_duration_sec,
        "sampleRateHz": row.sample_rate_hz,
        "equipment": row.equipment or "",
        "eyesCondition": row.eyes_condition or "",
        "recordingDate": row.recording_date or "",
        "originalFilename": row.original_filename or "",
    }

    indices: dict[str, Any] = {}
    if row.normative_zscores_json:
        try:
            raw = json.loads(row.normative_zscores_json)
            if isinstance(raw, dict):
                indices["normativeZ"] = raw
        except json.JSONDecodeError:
            pass
    indices.setdefault(
        "theta_beta_ratio",
        "__MISSING__",
    )  # populated when spectral indices pipeline exposes it

    return {
        "patient": patient_block,
        "recording": recording,
        "indices": indices,
        "analysis": {"id": analysis_id, "status": row.analysis_status},
    }
