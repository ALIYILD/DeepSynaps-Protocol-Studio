"""Tests for structural MRI subprocess helpers (no real CLIs)."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from deepsynaps_mri import structural as s


def test_deface_t1_mri_deface_expands_freesurfer_home(tmp_path: Path) -> None:
    t1 = tmp_path / "t1.nii.gz"
    t1.write_bytes(b"x")
    out = tmp_path / "out.nii.gz"
    fs = tmp_path / "fs"
    avg = fs / "average"
    avg.mkdir(parents=True)
    (avg / "talairach_mixed_with_skull.gca").write_text("gca1")
    (avg / "face.gca").write_text("gca2")

    with (
        patch.dict(os.environ, {"FREESURFER_HOME": str(fs)}),
        patch("deepsynaps_mri.structural.shutil.which", side_effect=lambda x: x == "mri_deface"),
        patch("deepsynaps_mri.structural._run_logged_subprocess") as run_mock,
    ):
        s.deface_t1(t1, out)

    run_mock.assert_called_once()
    cmd = run_mock.call_args[0][0]
    assert cmd[0] == "mri_deface"
    assert str(t1) == cmd[1]
    assert cmd[2].endswith("talairach_mixed_with_skull.gca")
    assert cmd[3].endswith("face.gca")
    assert str(out) == cmd[4]


def test_deface_t1_skips_mri_deface_when_templates_missing(tmp_path: Path) -> None:
    t1 = tmp_path / "t1.nii.gz"
    t1.write_bytes(b"data")
    out = tmp_path / "out.nii.gz"
    fs = tmp_path / "fs"
    fs.mkdir()

    with (
        patch.dict(os.environ, {"FREESURFER_HOME": str(fs)}),
        patch("deepsynaps_mri.structural.shutil.which", side_effect=lambda x: x == "mri_deface"),
    ):
        s.deface_t1(t1, out)

    assert out.read_bytes() == b"data"


def test_run_logged_subprocess_raises_with_output() -> None:
    fake = subprocess.CompletedProcess(
        ["fake"], 1, stdout="out", stderr="err detail",
    )
    with (
        patch("deepsynaps_mri.structural.subprocess.run", return_value=fake),
        pytest.raises(subprocess.CalledProcessError) as ei,
    ):
        s._run_logged_subprocess(["fake"])
    assert "err detail" in (ei.value.stderr or "")
