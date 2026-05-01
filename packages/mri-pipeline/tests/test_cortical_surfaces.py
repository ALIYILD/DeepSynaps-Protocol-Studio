"""Tests for :mod:`deepsynaps_mri.cortical_surfaces`."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest

pytest.importorskip("nibabel")

import nibabel as nib

from deepsynaps_mri import cortical_surfaces as cs
from deepsynaps_mri.adapters import fastsurfer_surfaces as fs_adp


def _write_fs_surf(surf_dir: Path) -> None:
    surf_dir.mkdir(parents=True, exist_ok=True)
    v = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], dtype=np.float32)
    f = np.array([[0, 1, 2], [0, 2, 3]], dtype=np.int32)
    for name in ("lh.white", "lh.pial", "rh.white", "rh.pial"):
        nib.freesurfer.write_geometry(str(surf_dir / name), v, f)


def test_reconstruct_external_layout(tmp_path: Path) -> None:
    ext = tmp_path / "subj"
    _write_fs_surf(ext / "surf")
    r = cs.reconstruct_cortical_surfaces(
        artefacts_dir=tmp_path / "out",
        subject_id="s1",
        source="external_freesurfer_layout",
        external_subject_dir=ext,
        run_input_validation=False,
    )
    assert r.ok is True
    assert r.fsnative_dir
    assert len(r.surfaces) == 4
    assert r.manifest_path and Path(r.manifest_path).exists()


def test_reconstruct_external_incomplete(tmp_path: Path) -> None:
    ext = tmp_path / "subj"
    surf = ext / "surf"
    surf.mkdir(parents=True)
    v = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float32)
    f = np.array([[0, 1, 2]], dtype=np.int32)
    nib.freesurfer.write_geometry(str(surf / "lh.white"), v, f)
    r = cs.reconstruct_cortical_surfaces(
        artefacts_dir=tmp_path / "out",
        subject_id="s1",
        source="external_freesurfer_layout",
        external_subject_dir=ext,
        run_input_validation=False,
    )
    assert r.ok is False
    assert r.code == "incomplete_surfaces"


def test_reconstruct_fastsurfer_mocked(tmp_path: Path) -> None:
    t1 = tmp_path / "t1.nii.gz"
    img = nib.Nifti1Image(np.ones((4, 4, 4), dtype=np.float32), np.eye(4))
    nib.save(img, str(t1))

    sd = tmp_path / "fs_subjects"
    sid = "subj1"
    sdir = sd / sid
    _write_fs_surf(sdir / "surf")

    fake = fs_adp.FastSurferSurfaceRunResult(
        ok=True,
        subject_dir=sdir,
        command=["run_fastsurfer.sh"],
        returncode=0,
        log_path=None,
        stdout_stderr="",
    )

    with patch("deepsynaps_mri.cortical_surfaces._adapter_fastsurfer", return_value=fake):
        r = cs.reconstruct_cortical_surfaces(
            artefacts_dir=tmp_path / "art",
            subject_id=sid,
            source="fastsurfer",
            t1_nifti=t1,
            subjects_dir=sd,
            run_input_validation=False,
        )

    assert r.ok is True
    assert len(r.surfaces) == 4


def test_export_gifti(tmp_path: Path) -> None:
    surf = tmp_path / "fsnative"
    _write_fs_surf(surf)
    out = tmp_path / "gifti"
    exp = cs.export_surface_meshes(surf, out)
    assert exp.ok is True
    assert len(exp.gifti_paths) == 4
    assert all(Path(p).exists() for p in exp.gifti_paths.values())


def test_compute_surface_qc(tmp_path: Path) -> None:
    surf = tmp_path / "fsnative"
    _write_fs_surf(surf)
    qc = cs.compute_surface_qc(surf, tmp_path / "art")
    assert qc.ok is True
    assert len(qc.surfaces) == 4
    assert qc.json_path and Path(qc.json_path).exists()


def test_brainsuite_stub(tmp_path: Path) -> None:
    r = cs.reconstruct_cortical_surfaces(
        artefacts_dir=tmp_path,
        subject_id="x",
        source="brainsuite",
    )
    assert r.ok is False
    assert r.code == "brainsuite_not_implemented"
