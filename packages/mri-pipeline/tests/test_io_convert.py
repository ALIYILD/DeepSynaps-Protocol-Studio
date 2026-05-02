"""Tests for :mod:`deepsynaps_mri.io` DICOM→NIfTI conversion boundaries."""
from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from deepsynaps_mri import io


def test_convert_dicom_to_nifti_writes_stderr_log_on_failure(tmp_path: Path) -> None:
    dicom_dir = tmp_path / "in"
    dicom_dir.mkdir()
    out_dir = tmp_path / "out"
    log_path = tmp_path / "dcm2niix.stderr.log"

    err = subprocess.CalledProcessError(1, ["dcm2niix"], stderr="bad series")

    with (
        patch.object(io, "_dcm2niix_available", return_value=True),
        patch(
            "deepsynaps_mri.adapters.dcm2niix.subprocess.run",
            side_effect=err,
        ),
    ):
        with pytest.raises(subprocess.CalledProcessError):
            io.convert_dicom_to_nifti(dicom_dir, out_dir, stderr_log_path=log_path)

    assert log_path.is_file()
    text = log_path.read_text(encoding="utf-8")
    assert "dcm2niix" in text
    assert "bad series" in text


def test_convert_dicom_to_nifti_success_logs_nonempty_stderr(tmp_path: Path, caplog) -> None:
    import logging

    dicom_dir = tmp_path / "in"
    dicom_dir.mkdir()
    out_dir = tmp_path / "out"

    proc = MagicMock()
    proc.stderr = "warning: something odd"
    proc.returncode = 0

    with (
        patch.object(io, "_dcm2niix_available", return_value=True),
        patch(
            "deepsynaps_mri.adapters.dcm2niix.subprocess.run",
            return_value=proc,
        ),
        patch.object(io, "_collect_outputs", return_value=[]),
        caplog.at_level(logging.INFO),
    ):
        io.convert_dicom_to_nifti(dicom_dir, out_dir)

    assert any("dcm2niix stderr" in r.message for r in caplog.records)
