"""Tests for FastSurfer / SynthSeg adapters (mocked subprocess)."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from deepsynaps_mri.adapters import fastsurfer, synthseg


def test_fastsurfer_adapter_invokes_expected_argv(tmp_path: Path) -> None:
    t1 = tmp_path / "t1.nii.gz"
    t1.write_bytes(b"x")
    out = tmp_path / "fs_out"
    with patch(
        "deepsynaps_mri.adapters.fastsurfer.run_logged_subprocess",
    ) as run_mock:
        argv = fastsurfer.run_fastsurfer_segmentation(t1, out, "sub1")
    assert argv[0] == "run_fastsurfer.sh"
    assert "--sid" in argv and "sub1" in argv
    run_mock.assert_called_once()


def test_synthseg_adapter_invokes_expected_argv(tmp_path: Path) -> None:
    t1 = tmp_path / "t1.nii.gz"
    t1.write_bytes(b"x")
    out = tmp_path / "ss_out"
    with patch(
        "deepsynaps_mri.adapters.synthseg.run_logged_subprocess",
    ) as run_mock:
        argv = synthseg.run_synthseg_segmentation(t1, out, parc=True, robust=True)
    assert argv[0] == "mri_synthseg"
    assert "--robust" in argv
    run_mock.assert_called_once()
