"""NiBabel roundtrip: write tiny Nifti1Image, reload, assert shape/dtype/affine."""
from __future__ import annotations

import numpy as np
import pytest

nibabel = pytest.importorskip("nibabel")


def test_nifti_roundtrip(tmp_path):
    import nibabel as nib
    from app.services.neuroimaging.nibabel_io import nifti_header_summary

    data = np.zeros((8, 8, 4), dtype=np.float32)
    affine = np.eye(4)
    affine[0, 0] = 2.0  # 2mm voxel in x
    img = nib.Nifti1Image(data, affine)
    out = tmp_path / "test.nii.gz"
    nib.save(img, str(out))

    summary = nifti_header_summary(str(out))
    assert summary.shape == [8, 8, 4]
    assert summary.dtype == "float32"
    assert len(summary.affine) == 4
    assert len(summary.affine[0]) == 4
    assert abs(summary.affine[0][0] - 2.0) < 1e-6
