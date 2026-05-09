"""Tests for app.services.mri_safety_engine — MRI safety cockpit + red-flag detector.

All logic is pure (no DB). Tests pin real behaviour including clinical-safety
strings that must not be silently removed.
"""
from __future__ import annotations

import json
import pytest

from app.services.mri_safety_engine import (
    _json_loads,
    _overall_status,
    compute_mri_safety_cockpit,
)


# ---------------------------------------------------------------------------
# Helper to build a minimal fake MriAnalysis object
# ---------------------------------------------------------------------------

class _Mri:
    """Minimal stand-in for app.persistence.models.MriAnalysis."""

    def __init__(
        self,
        *,
        filename: str = "scan.zip",
        modalities: dict | None = None,
        qc: dict | None = None,
        structural: dict | None = None,
    ):
        self.upload_ref = json.dumps({"filename": filename})
        self.modalities_present_json = json.dumps(modalities or {})
        self.qc_json = json.dumps(qc or {})
        self.structural_json = json.dumps(structural or {})


# ---------------------------------------------------------------------------
# _json_loads
# ---------------------------------------------------------------------------

def test_json_loads_none_returns_none():
    assert _json_loads(None) is None


def test_json_loads_empty_string_returns_none():
    assert _json_loads("") is None


def test_json_loads_valid_object():
    assert _json_loads('{"key": "val"}') == {"key": "val"}


def test_json_loads_invalid_returns_none():
    assert _json_loads("not-json") is None


# ---------------------------------------------------------------------------
# _overall_status
# ---------------------------------------------------------------------------

def test_overall_status_radiology_review_takes_precedence():
    red_flags = [
        {"code": "RADIOLOGY_REVIEW_REQUIRED", "severity": "high"},
        {"code": "PHI_IN_FILENAME", "severity": "high"},
    ]
    checks: list[dict] = []
    assert _overall_status(checks, red_flags) == "MRI_RADIOLOGY_REVIEW_REQUIRED"


def test_overall_status_high_flag_triggers_repeat():
    checks = [{"status": "warn"}]
    flags = [{"code": "PHI_IN_FILENAME", "severity": "high"}]
    assert _overall_status(checks, flags) == "MRI_REPEAT_RECOMMENDED"


def test_overall_status_medium_flag_limited_quality():
    checks = [{"status": "pass"}]
    flags = [{"code": "SNR_LOW", "severity": "medium"}]
    assert _overall_status(checks, flags) == "MRI_LIMITED_QUALITY"


def test_overall_status_no_flags_valid():
    checks = [{"status": "pass"}, {"status": "pass"}]
    assert _overall_status(checks, []) == "MRI_VALID_FOR_REVIEW"


# ---------------------------------------------------------------------------
# compute_mri_safety_cockpit — full integration
# ---------------------------------------------------------------------------

def test_cockpit_clean_scan_valid_status():
    mri = _Mri(
        filename="scan.zip",
        modalities={"t1": True},
        qc={"mriqc": {"snr": 80, "cnr": 3.0, "motion_mean_fd_mm": 0.3}},
        structural={"registration": {"status": "ok", "template_space": "MNI"}},
    )
    result = compute_mri_safety_cockpit(mri)
    assert result["overall_status"] == "MRI_VALID_FOR_REVIEW"
    assert len(result["checks"]) >= 4
    assert len(result["red_flags"]) == 0


def test_cockpit_disclaimer_is_non_diagnostic():
    """Clinical safety: disclaimer must always be present and non-diagnostic."""
    mri = _Mri()
    result = compute_mri_safety_cockpit(mri)
    assert "Decision-support only" in result["disclaimer"]
    assert "clinician review" in result["disclaimer"]
    assert "Not a diagnostic" in result["disclaimer"]


def test_cockpit_phi_in_filename_raises_high_flag():
    mri = _Mri(
        filename="patient_john_doe.nii",
        modalities={"t1": True},
        qc={"mriqc": {"snr": 80, "cnr": 3.0, "motion_mean_fd_mm": 0.3}},
        structural={"registration": {"status": "ok"}},
    )
    result = compute_mri_safety_cockpit(mri)
    codes = [f["code"] for f in result["red_flags"]]
    assert "PHI_IN_FILENAME" in codes
    # Should also appear as 'fail' check
    statuses = {c["label"]: c["status"] for c in result["checks"]}
    assert statuses["De-identification"] == "fail"


def test_cockpit_low_snr_adds_medium_flag():
    mri = _Mri(
        filename="scan.zip",
        modalities={"t1": True},
        qc={"mriqc": {"snr": 20, "cnr": 3.0, "motion_mean_fd_mm": 0.2}},
        structural={"registration": {"status": "ok"}},
    )
    result = compute_mri_safety_cockpit(mri)
    codes = [f["code"] for f in result["red_flags"]]
    assert "SNR_LOW" in codes


def test_cockpit_high_motion_fd_flag():
    mri = _Mri(
        filename="scan.zip",
        modalities={"t1": True},
        qc={"mriqc": {"snr": 80, "cnr": 3.0, "motion_mean_fd_mm": 1.5}},
        structural={"registration": {"status": "ok"}},
    )
    result = compute_mri_safety_cockpit(mri)
    codes = [f["code"] for f in result["red_flags"]]
    assert "MOTION_HIGH" in codes


def test_cockpit_incidental_finding_triggers_radiology_review():
    mri = _Mri(
        filename="scan.zip",
        modalities={"t1": True},
        qc={
            "mriqc": {"snr": 80, "cnr": 3.0, "motion_mean_fd_mm": 0.2},
            "incidental": {"any_flagged": True},
        },
        structural={"registration": {"status": "ok"}},
    )
    result = compute_mri_safety_cockpit(mri)
    assert result["overall_status"] == "MRI_RADIOLOGY_REVIEW_REQUIRED"
    codes = [f["code"] for f in result["red_flags"]]
    assert "RADIOLOGY_REVIEW_REQUIRED" in codes


def test_cockpit_unrecognised_file_type_warns():
    mri = _Mri(
        filename="scan.rar",
        modalities={},
        qc={},
        structural={},
    )
    result = compute_mri_safety_cockpit(mri)
    statuses = {c["label"]: c["status"] for c in result["checks"]}
    assert statuses["File type"] == "warn"
    codes = [f["code"] for f in result["red_flags"]]
    assert "FILE_TYPE_UNVERIFIED" in codes


def test_cockpit_nifti_file_recognised():
    mri = _Mri(
        filename="brain.nii",
        modalities={"t1": True},
        qc={"mriqc": {"snr": 80, "cnr": 3.0, "motion_mean_fd_mm": 0.3}},
        structural={"registration": {"status": "ok"}},
    )
    result = compute_mri_safety_cockpit(mri)
    statuses = {c["label"]: c["status"] for c in result["checks"]}
    assert statuses["File type"] == "pass"


def test_cockpit_multiple_modalities_detected():
    mri = _Mri(
        filename="scan.zip",
        modalities={"t1": True, "flair": True, "dwi": True},
        qc={"mriqc": {"snr": 60, "cnr": 2.6, "motion_mean_fd_mm": 0.4}},
        structural={"registration": {"status": "ok"}},
    )
    result = compute_mri_safety_cockpit(mri)
    scan_check = next(c for c in result["checks"] if c["label"] == "Scan type")
    assert "T1" in scan_check["detail"]
    assert "FLAIR" in scan_check["detail"]
    assert "DWI" in scan_check["detail"]
