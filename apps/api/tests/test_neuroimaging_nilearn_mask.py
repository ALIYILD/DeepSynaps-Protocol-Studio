"""Behavioral test: nilearn mask_nifti returns correct shape and voxel count."""
from __future__ import annotations

import numpy as np
import pytest

nilearn = pytest.importorskip("nilearn")


def test_mask_nifti_returns_summary(tmp_path):
    import nibabel as nib

    from app.services.neuroimaging.nilearn_io import mask_nifti

    data = np.zeros((4, 4, 4, 5), dtype=np.float32)
    img = nib.Nifti1Image(data, np.eye(4))
    nii_path = tmp_path / "brain.nii"
    nib.save(img, str(nii_path))

    result = mask_nifti(str(nii_path))

    assert result.n_timepoints == 5
    assert result.n_voxels > 0
    assert len(result.shape) == 2  # (n_timepoints, n_voxels)
