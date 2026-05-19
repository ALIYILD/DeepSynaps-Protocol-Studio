"""Behavioral test: fit_dti returns FA in [0,1] and voxel_count > 0."""
from __future__ import annotations

import numpy as np
import pytest

dipy = pytest.importorskip("dipy")


def _build_synthetic_dwi(tmp_path):
    """Write a minimal synthetic DWI dataset: 2x2x2 voxels, 7 volumes."""
    import nibabel as nib

    shape = (2, 2, 2, 7)
    data = np.ones(shape, dtype=np.float32) * 1000.0
    data[..., 1:] = 800.0
    img = nib.Nifti1Image(data, np.eye(4))
    nii_path = tmp_path / "dwi.nii"
    nib.save(img, str(nii_path))

    bvals = np.array([0, 1000, 1000, 1000, 1000, 1000, 1000], dtype=float)
    bval_path = tmp_path / "dwi.bval"
    bval_path.write_text(" ".join(str(b) for b in bvals))

    bvecs = np.array([
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
    ])
    bvec_path = tmp_path / "dwi.bvec"
    bvec_path.write_text(
        "\n".join(" ".join(str(bvecs[v, ax]) for v in range(7)) for ax in range(3))
    )

    return str(nii_path), str(bval_path), str(bvec_path)


def test_fit_dti_returns_valid_scalars(tmp_path):
    from app.services.neuroimaging.dipy_dwi import fit_dti

    nii_path, bval_path, bvec_path = _build_synthetic_dwi(tmp_path)
    result = fit_dti(nii_path, bval_path, bvec_path)

    assert 0.0 <= result.mean_fa <= 1.0
    assert result.mean_md >= 0.0
    assert result.voxel_count > 0
