"""Tests for :mod:`deepsynaps_mri.registration` (typed API + QC)."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from deepsynaps_mri import registration as reg


def _write_nifti(path: Path, data: np.ndarray) -> None:
    nib = pytest.importorskip("nibabel")
    img = nib.Nifti1Image(data.astype(np.float32), np.eye(4))
    nib.save(img, str(path))


def test_register_to_mni_missing_moving(tmp_path: Path) -> None:
    r = reg.register_to_mni(tmp_path / "none.nii.gz", artefacts_dir=tmp_path)
    assert r.ok is False
    assert r.code == "moving_missing"


def test_register_to_mni_antspyx_missing(tmp_path: Path) -> None:
    p = tmp_path / "t1.nii.gz"
    _write_nifti(p, np.random.RandomState(0).rand(4, 4, 4).astype(np.float32))

    with patch(
        "deepsynaps_mri.registration._ants_registration_core",
        side_effect=ImportError("no ants"),
    ):
        r = reg.register_to_mni(p, artefacts_dir=tmp_path / "out")
    assert r.ok is False
    assert r.code == "antspyx_missing"


def test_register_to_mni_writes_manifest_and_warped(tmp_path: Path) -> None:
    p = tmp_path / "t1.nii.gz"
    _write_nifti(p, np.ones((5, 5, 5), dtype=np.float32))

    fwd = tmp_path / "fwd0_GenericAffine.mat"
    inv = tmp_path / "inv0_InverseWarp.nii.gz"
    fwd.write_text("dummy")
    inv.write_text("dummy")

    warped = MagicMock()

    def fake_core(*_a, **_k):
        return reg.Transform(
            fwd_transforms=[str(fwd)],
            inv_transforms=[str(inv)],
            warped_moving=warped,
            warped_fixed=None,
        )

    with patch("deepsynaps_mri.registration._ants_registration_core", side_effect=fake_core):
        r = reg.register_to_mni(p, artefacts_dir=tmp_path / "art")

    assert r.ok is True
    assert r.forward_transform_paths and r.inverse_transform_paths
    assert Path(r.forward_transform_paths[0]).name.startswith("forward_")
    man = Path(r.manifest_path) if r.manifest_path else None
    assert man is not None and man.exists()
    warped.to_filename.assert_called_once()


def test_apply_transform_success(tmp_path: Path) -> None:
    pytest.importorskip("ants")
    fixed = tmp_path / "fix.nii.gz"
    mov = tmp_path / "mov.nii.gz"
    _write_nifti(fixed, np.ones((3, 3, 3), dtype=np.float32))
    _write_nifti(mov, np.ones((3, 3, 3), dtype=np.float32))
    out = tmp_path / "out.nii.gz"

    warped = MagicMock()

    with patch("ants.apply_transforms", return_value=warped):
        res = reg.apply_transform(fixed, mov, [], out)

    assert res.ok is True
    assert res.output_path == str(out.resolve())
    warped.to_filename.assert_called_once_with(str(out))


def test_invert_transform_from_bundle() -> None:
    b = reg.MniRegistrationBundle(
        ok=True,
        inverse_transform_paths=["/a/inv1.mat", "/a/inv2.nii.gz"],
    )
    inv = reg.invert_transform(registration=b)
    assert inv.ok is True
    assert inv.inverse_transform_paths == ["/a/inv1.mat", "/a/inv2.nii.gz"]


def test_invert_transform_forward_only_fails() -> None:
    inv = reg.invert_transform(forward_transform_paths=["/x/affine.mat"])
    assert inv.ok is False
    assert inv.code == "inverse_not_available"


def test_compute_registration_qc_identical_volumes(tmp_path: Path) -> None:
    pytest.importorskip("nibabel")
    # >100 voxels after masking (QC minimum)
    d = np.random.RandomState(1).rand(5, 5, 5).astype(np.float32)
    f = tmp_path / "f.nii.gz"
    w = tmp_path / "w.nii.gz"
    _write_nifti(f, d)
    _write_nifti(w, d)
    qc = reg.compute_registration_qc(f, w, artefacts_dir=tmp_path)
    assert qc.ok is True
    assert qc.metrics.pearson_r is not None
    assert qc.metrics.pearson_r == pytest.approx(1.0, abs=1e-5)
    assert qc.json_path and Path(qc.json_path).exists()


def test_register_t1_to_mni_returns_transform(tmp_path: Path) -> None:
    p = tmp_path / "t1.nii.gz"
    _write_nifti(p, np.ones((3, 3, 3), dtype=np.float32))

    fake = reg.Transform(
        fwd_transforms=["a.mat"],
        inv_transforms=["b.nii.gz"],
        warped_moving=MagicMock(),
    )

    with patch("deepsynaps_mri.registration._ants_registration_core", return_value=fake):
        xfm = reg.register_t1_to_mni(p)

    assert xfm.fwd_transforms == ["a.mat"]
    assert xfm.inv_transforms == ["b.nii.gz"]
