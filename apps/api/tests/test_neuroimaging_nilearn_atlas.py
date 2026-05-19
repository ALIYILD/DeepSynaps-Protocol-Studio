"""Behavioral test: extract_atlas_timeseries returns n_regions==3 and n_timepoints==5."""
from __future__ import annotations

import numpy as np
import pytest

nilearn = pytest.importorskip("nilearn")


def test_extract_atlas_timeseries(tmp_path):
    import nibabel as nib

    from app.services.neuroimaging.nilearn_io import extract_atlas_timeseries

    # 4D functional image: 4x4x4 spatial, 5 timepoints
    data = np.ones((4, 4, 4, 5), dtype=np.float32)
    img = nib.Nifti1Image(data, np.eye(4))
    nii_path = tmp_path / "func.nii"
    nib.save(img, str(nii_path))

    # Labels image with 3 non-zero regions
    labels = np.zeros((4, 4, 4), dtype=np.int32)
    labels[0, 0, 0] = 1
    labels[1, 1, 1] = 2
    labels[2, 2, 2] = 3
    atlas_img = nib.Nifti1Image(labels, np.eye(4))
    atlas_path = tmp_path / "atlas.nii"
    nib.save(atlas_img, str(atlas_path))

    result = extract_atlas_timeseries(str(nii_path), str(atlas_path))

    assert result.n_regions == 3
    assert result.n_timepoints == 5
    assert result.atlas_path == str(atlas_path)
