"""MRI Clinical Safety Cockpit + Red Flag Detector.

Non-diagnostic. Decision-support only. All outputs require clinician review.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.persistence.models import MriAnalysis

_log = logging.getLogger(__name__)


def compute_mri_safety_cockpit(analysis: MriAnalysis) -> dict[str, Any]:
    """Return a structured safety panel for the MRI recording."""
    checks: list[dict] = []
    red_flags: list[dict] = []

    # 1. File type validation
    upload = _json_loads(analysis.upload_ref) or {}
    filename = upload.get("filename") or ""
    is_dicom = filename.lower().endswith(".zip")
    is_nifti = filename.lower().endswith((".nii", ".nii.gz", ".nii.gz"))
    if is_dicom or is_nifti:
        checks.append({"label": "File type", "status": "pass", "detail": "DICOM zip" if is_dicom else "NIfTI"})
    else:
        checks.append({"label": "File type", "status": "warn", "detail": filename or "unknown"})
        red_flags.append({"code": "FILE_TYPE_UNVERIFIED", "severity": "medium", "message": "File type not recognised as DICOM zip or NIfTI."})

    # 2. PHI / de-identification heuristic
    if filename and any(k in filename.lower() for k in ("patient", "name", "dob", "mrn", "ssn", "nhs")):
        checks.append({"label": "De-identification", "status": "fail", "detail": "Potential PHI in filename"})
        red_flags.append({"code": "PHI_IN_FILENAME", "severity": "high", "message": "Filename may contain PHI. De-identify before upload."})
    else:
        checks.append({"label": "De-identification", "status": "pass", "detail": "No obvious PHI in filename"})

    # 3. Scan type detection
    modalities = _json_loads(analysis.modalities_present_json) or {}
    detected = []
    if modalities.get("t1"): detected.append("T1")
    if modalities.get("t2"): detected.append("T2")
    if modalities.get("flair"): detected.append("FLAIR")
    if modalities.get("dwi"): detected.append("DWI")
    if modalities.get("dti"): detected.append("DTI")
    if modalities.get("fmri"): detected.append("fMRI")
    if detected:
        checks.append({"label": "Scan type", "status": "pass", "detail": ", ".join(detected)})
    else:
        checks.append({"label": "Scan type", "status": "warn", "detail": "Unknown"})
        red_flags.append({"code": "SCAN_TYPE_UNKNOWN", "severity": "low", "message": "Scan type not detected from metadata."})

    # 4. QC metrics
    qc = _json_loads(analysis.qc_json) or {}
    mriqc = qc.get("mriqc") or {}
    snr = mriqc.get("snr")
    cnr = mriqc.get("cnr")
    fd = mriqc.get("motion_mean_fd_mm")
    if snr is not None and float(snr) >= 50:
        checks.append({"label": "SNR", "status": "pass", "detail": f"{float(snr):.1f}"})
    elif snr is not None:
        checks.append({"label": "SNR", "status": "warn", "detail": f"{float(snr):.1f}"})
        red_flags.append({"code": "SNR_LOW", "severity": "medium", "message": f"SNR {float(snr):.1f} — consider re-scan."})
    else:
        checks.append({"label": "SNR", "status": "warn", "detail": "Unknown"})

    if cnr is not None and float(cnr) >= 2.5:
        checks.append({"label": "CNR", "status": "pass", "detail": f"{float(cnr):.2f}"})
    elif cnr is not None:
        checks.append({"label": "CNR", "status": "warn", "detail": f"{float(cnr):.2f}"})
        red_flags.append({"code": "CNR_LOW", "severity": "medium", "message": f"CNR {float(cnr):.2f} — reduced tissue contrast."})
    else:
        checks.append({"label": "CNR", "status": "warn", "detail": "Unknown"})

    if fd is not None and float(fd) <= 0.5:
        checks.append({"label": "Motion (FD)", "status": "pass", "detail": f"{float(fd):.2f} mm"})
    elif fd is not None:
        checks.append({"label": "Motion (FD)", "status": "warn", "detail": f"{float(fd):.2f} mm"})
        red_flags.append({"code": "MOTION_HIGH", "severity": "medium", "message": f"Mean FD {float(fd):.2f} mm — motion artefact likely."})
    else:
        checks.append({"label": "Motion (FD)", "status": "warn", "detail": "Unknown"})

    # 5. Registration readiness
    structural = _json_loads(analysis.structural_json) or {}
    reg = structural.get("registration") or {}
    if reg.get("status") == "ok":
        checks.append({"label": "Registration", "status": "pass", "detail": reg.get("template_space") or "MNI"})
    else:
        checks.append({"label": "Registration", "status": "warn", "detail": reg.get("status") or "unverified"})
        red_flags.append({"code": "REGISTRATION_UNVERIFIED", "severity": "medium", "message": "Spatial registration not verified. Target coordinates may be unreliable."})

    # 6. Radiology review required flag
    incidental = qc.get("incidental") or {}
    if incidental.get("any_flagged"):
        red_flags.append({"code": "RADIOLOGY_REVIEW_REQUIRED", "severity": "high", "message": "Incidental finding flagged — radiology review required before target planning."})

    overall = _overall_status(checks, red_flags)
    return {
        "checks": checks,
        "red_flags": red_flags,
        "overall_status": overall,
        "disclaimer": "Decision-support only. Requires clinician review. Not a diagnostic radiology report.",
    }


def _overall_status(checks: list[dict], red_flags: list[dict]) -> str:
    fail_count = sum(1 for c in checks if c["status"] == "fail")
    high_flags = sum(1 for f in red_flags if f["severity"] == "high")
    if high_flags > 0 or fail_count > 1:
        return "MRI_REPEAT_RECOMMENDED"
    if fail_count == 1 or any(f["severity"] == "medium" for f in red_flags):
        return "MRI_LIMITED_QUALITY"
    if any(f["code"] == "RADIOLOGY_REVIEW_REQUIRED" for f in red_flags):
        return "MRI_RADIOLOGY_REVIEW_REQUIRED"
    return "MRI_VALID_FOR_REVIEW"


def _json_loads(raw: Optional[str]) -> Optional[Any]:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
