"""Unit tests for :mod:`deepsynaps_mri.qc` (AI_UPGRADES §P0 #5).

Covers the three status paths of both public functions:

* ``run_mriqc`` — ok (parsed subprocess output), ``dependency_missing``
  (no binary on PATH), ``failed`` (subprocess error).
* ``screen_incidental_findings`` — ok (populated findings),
  ``dependency_missing`` (no LST-AI), ``failed`` (missing NIfTI).
* ``build_qc_warnings`` — ``any_flagged`` → amber strings surface;
  clean → no strings.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from deepsynaps_mri import qc as qc_mod
from deepsynaps_mri.schemas import (
    IncidentalFinding,
    IncidentalFindingResult,
    MRIQCResult,
)


# ---------------------------------------------------------------------------
# MRIQC
# ---------------------------------------------------------------------------
def test_run_mriqc_dependency_missing_when_binary_absent(tmp_path, monkeypatch):
    monkeypatch.setattr(qc_mod, "_mriqc_binary", lambda: None)
    result = qc_mod.run_mriqc(tmp_path / "scan.nii.gz", modality="T1w")
    assert isinstance(result, MRIQCResult)
    assert result.status == "dependency_missing"
    assert result.cnr is None
    assert result.passes_threshold is True  # default


def test_run_mriqc_failed_when_input_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(qc_mod, "_mriqc_binary", lambda: "/usr/bin/mriqc")
    result = qc_mod.run_mriqc(tmp_path / "missing.nii.gz", modality="T1w")
    assert result.status == "failed"
    assert "missing" in (result.error_message or "").lower()


def test_run_mriqc_ok_parses_iqm(tmp_path, monkeypatch):
    # Create a dummy T1 so the exists() check passes.
    t1 = tmp_path / "scan.nii.gz"
    t1.write_bytes(b"dummy")

    # Force the subprocess call to succeed without actually invoking mriqc.
    def _fake_run(*args, **kwargs):
        out_dir = Path(args[0][2])  # subprocess cmd: [bin, input, out_dir, ...]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "sub-01_T1w.json").write_text(json.dumps({
            "snr": 14.2,
            "cnr": 3.1,
            "efc": 0.45,
            "fber": 4100.0,
            "fwhm_avg": 3.9,
            "fd_mean": 0.1,
        }))

        class _Completed:
            returncode = 0
            stdout = b""
            stderr = b""

        return _Completed()

    monkeypatch.setattr(qc_mod, "_mriqc_binary", lambda: "/usr/bin/mriqc")
    monkeypatch.setattr(qc_mod.subprocess, "run", _fake_run)

    result = qc_mod.run_mriqc(t1, modality="T1w")
    assert result.status == "ok"
    assert result.snr == pytest.approx(14.2)
    assert result.cnr == pytest.approx(3.1)
    assert result.passes_threshold is True


def test_run_mriqc_flags_below_threshold(tmp_path, monkeypatch):
    """Low SNR must flip passes_threshold to False."""
    t1 = tmp_path / "scan.nii.gz"
    t1.write_bytes(b"dummy")

    def _fake_run(*args, **kwargs):
        out_dir = Path(args[0][2])
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "sub-01_T1w.json").write_text(json.dumps({
            "snr": 5.0,     # below threshold (10)
            "cnr": 3.1,
            "efc": 0.45,
        }))

        class _Completed:
            returncode = 0

        return _Completed()

    monkeypatch.setattr(qc_mod, "_mriqc_binary", lambda: "/usr/bin/mriqc")
    monkeypatch.setattr(qc_mod.subprocess, "run", _fake_run)

    result = qc_mod.run_mriqc(t1, modality="T1w")
    assert result.status == "ok"
    assert result.passes_threshold is False


# ---------------------------------------------------------------------------
# Incidental-finding screening
# ---------------------------------------------------------------------------
def test_screen_incidental_findings_dependency_missing(tmp_path, monkeypatch):
    t1 = tmp_path / "scan.nii.gz"
    t1.write_bytes(b"dummy")
    monkeypatch.setattr(qc_mod, "_try_lst_ai", lambda _p: None)
    result = qc_mod.screen_incidental_findings(t1)
    assert isinstance(result, IncidentalFindingResult)
    assert result.status == "dependency_missing"
    assert result.findings == []
    assert result.any_flagged is False


def test_screen_incidental_findings_ok_sets_any_flagged(tmp_path, monkeypatch):
    t1 = tmp_path / "scan.nii.gz"
    t1.write_bytes(b"dummy")
    monkeypatch.setattr(
        qc_mod, "_try_lst_ai",
        lambda _p: [
            IncidentalFinding(
                finding_type="wmh",
                location_region="left periventricular",
                volume_ml=8.2,
                severity="moderate",
                confidence=0.81,
            )
        ],
    )
    result = qc_mod.screen_incidental_findings(t1)
    assert result.status == "ok"
    assert len(result.findings) == 1
    assert result.any_flagged is True


def test_screen_incidental_findings_failed_when_missing_file(tmp_path):
    result = qc_mod.screen_incidental_findings(tmp_path / "missing.nii.gz")
    assert result.status == "failed"


# ---------------------------------------------------------------------------
# build_qc_warnings
# ---------------------------------------------------------------------------
def test_build_qc_warnings_quiet_when_clean():
    mriqc = MRIQCResult(status="ok", passes_threshold=True)
    incidental = IncidentalFindingResult(status="ok", findings=[], any_flagged=False)
    warnings = qc_mod.build_qc_warnings(mriqc, incidental)
    assert warnings == []


def test_build_qc_warnings_surfaces_low_quality_and_findings():
    mriqc = MRIQCResult(status="ok", passes_threshold=False, snr=4.0)
    incidental = IncidentalFindingResult(
        status="ok",
        findings=[
            IncidentalFinding(
                finding_type="wmh",
                location_region="left periventricular",
                severity="moderate",
                confidence=0.81,
            )
        ],
        any_flagged=True,
    )
    warnings = qc_mod.build_qc_warnings(mriqc, incidental)
    assert len(warnings) == 2
    joined = " | ".join(warnings)
    assert "radiology review advised" in joined.lower()
    assert "wmh" in joined.lower()


def test_build_qc_warnings_ignores_missing_dependencies():
    """When dependencies are absent we should NOT populate warnings."""
    mriqc = MRIQCResult(status="dependency_missing")
    incidental = IncidentalFindingResult(status="dependency_missing")
    warnings = qc_mod.build_qc_warnings(mriqc, incidental)
    assert warnings == []
