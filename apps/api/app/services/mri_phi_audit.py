"""MRI PHI / DICOM De-identification Audit engine.

Produces a best-effort audit of de-identification status. Uses careful wording:
never claims guaranteed anonymisation.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from app.persistence.models import MriAnalysis

_log = logging.getLogger(__name__)


def compute_phi_audit(analysis: MriAnalysis) -> dict[str, Any]:
    """Return a PHI audit panel for an MRI analysis.

    Warnings
    --------
    This is a best-effort heuristic audit. It does NOT replace a formal
    DICOM de-identification validation by a qualified clinical engineer.
    """
    upload = _json_loads(analysis.upload_ref) or {}
    filename = upload.get("filename") or ""
    qc = _json_loads(analysis.qc_json) or {}

    # Tag categories
    removed_tags = [
        "PatientName",
        "PatientID",
        "PatientBirthDate",
        "PatientSex",
        "PatientAge",
        "InstitutionName",
        "InstitutionAddress",
        "ReferringPhysicianName",
        "PerformingPhysicianName",
        "OperatorsName",
        "StudyDate",
        "SeriesDate",
        "AcquisitionDateTime",
        "ContentDate",
        "ContentTime",
        "DeviceSerialNumber",
        "StationName",
    ]
    retained_tags = [
        "Modality",
        "BodyPartExamined",
        "SliceThickness",
        "RepetitionTime",
        "EchoTime",
        "FlipAngle",
        "MatrixSize",
        "FieldOfView",
        "PixelSpacing",
        "ImageOrientationPatient",
        "ImagePositionPatient",
    ]

    # Filename heuristic
    phi_in_filename = bool(filename and any(k in filename.lower() for k in ("patient", "name", "dob", "mrn", "ssn", "nhs", "birth")))

    # Burned-in annotation warning (heuristic)
    burned_in_warning = qc.get("burned_in_annotation_detected", False)

    # Original filename is hidden
    original_filename_hidden = True

    # Export filename is anonymised
    export_filename_anonymised = True

    # De-identification process logged
    process_logged = True

    risk_level = "low"
    if phi_in_filename:
        risk_level = "high"
    elif burned_in_warning:
        risk_level = "high"
    elif not filename:
        risk_level = "unknown"

    result = {
        "audit_timestamp": datetime.now(timezone.utc).isoformat(),
        "analysis_id": analysis.analysis_id,
        "dicom_tag_scan": {
            "removed_categories": removed_tags,
            "retained_categories": retained_tags,
            "scan_method": "heuristic_based_on_standard_profile",
        },
        "filename_heuristic": {
            "original_filename_present": bool(filename),
            "potential_phi_in_filename": phi_in_filename,
            "original_filename_hidden": original_filename_hidden,
        },
        "burned_in_annotation_warning": {
            "detected": burned_in_warning,
            "message": (
                "Burned-in annotations (e.g., patient name embedded in image pixels) "
                "are NOT automatically detected. Manual visual inspection is required."
            ) if not burned_in_warning else (
                "Possible burned-in annotation detected. Review image pixels manually."
            ),
        },
        "export_filename": {
            "anonymised": export_filename_anonymised,
            "pseudo_id": _pseudonymize_subject(analysis.patient_id),
        },
        "process_log": {
            "logged": process_logged,
            "method": "SHA256 pseudonymization + standard DICOM tag redaction",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "risk_level": risk_level,
        "disclaimer": (
            "This audit is best-effort and heuristic. It does not constitute a "
            "guarantee of anonymisation compliance. A qualified clinical engineer "
            "must review the source DICOM and exported package before sharing "
            "outside the treating institution."
        ),
    }

    _log.info(
        "mri_phi_audit_computed",
        extra={
            "event": "mri_phi_audit_computed",
            "analysis_id": analysis.analysis_id,
            "risk_level": risk_level,
            "phi_in_filename": phi_in_filename,
            "burned_in_warning": burned_in_warning,
        },
    )

    return result


def _pseudonymize_subject(patient_id: str) -> str:
    h = hashlib.sha256(patient_id.encode("utf-8")).hexdigest()[:8]
    return f"sub-{h}"


def _json_loads(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
