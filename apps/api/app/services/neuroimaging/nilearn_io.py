"""Nilearn fMRI/sMRI helpers — Phase 2b."""
from __future__ import annotations

try:
    import nilearn  # noqa: F401
    HAS_NILEARN: bool = True
except ImportError:
    HAS_NILEARN = False

from app.services.neuroimaging.schemas import (
    AtlasTimeseriesSummary,
    ConnectomeSummary,
    MaskerSummary,
)

_VALID_KINDS = frozenset({"correlation", "partial correlation", "tangent", "covariance", "precision"})

_MATRIX_TRUNCATE = 32


def mask_nifti(img_path: str, mask_strategy: str = "whole-brain") -> MaskerSummary:
    """Apply a NiftiMasker to *img_path* and return summary.

    For mask_strategy='whole-brain' an explicit all-voxels mask is used so
    the function works on uniform (e.g. all-zeros) images without nilearn
    trying to auto-detect background.  Other recognised strategies are passed
    through to NiftiMasker directly.
    """
    if not HAS_NILEARN:
        raise ImportError("Nilearn is not installed")

    import nibabel as nib
    import numpy as np
    from nilearn.maskers import NiftiMasker

    img = nib.load(img_path)
    spatial_shape = img.shape[:3]

    if mask_strategy == "whole-brain":
        mask_data = np.ones(spatial_shape, dtype=np.uint8)
        mask_img = nib.Nifti1Image(mask_data, img.affine)
        masker = NiftiMasker(mask_img=mask_img, standardize=False)
    else:
        masker = NiftiMasker(mask_strategy=mask_strategy, standardize=False)

    signals = masker.fit_transform(img_path)
    n_timepoints, n_voxels = signals.shape
    return MaskerSummary(
        n_timepoints=n_timepoints,
        n_voxels=n_voxels,
        shape=list(signals.shape),
    )


def extract_atlas_timeseries(img_path: str, atlas_path: str) -> AtlasTimeseriesSummary:
    """Extract per-region mean timeseries using a labels atlas.

    NEVER calls nilearn.datasets.fetch_* — caller must supply atlas_path.
    """
    if not HAS_NILEARN:
        raise ImportError("Nilearn is not installed")

    from nilearn.maskers import NiftiLabelsMasker

    masker = NiftiLabelsMasker(labels_img=atlas_path, standardize=False)
    signals = masker.fit_transform(img_path)
    n_timepoints, n_regions = signals.shape
    return AtlasTimeseriesSummary(
        n_timepoints=n_timepoints,
        n_regions=n_regions,
        atlas_path=atlas_path,
    )


def compute_connectome(
    timeseries_2d: list[list[float]],
    kind: str = "correlation",
) -> ConnectomeSummary:
    """Compute a connectome matrix from a 2-D timeseries list.

    Truncates to 32x32 and sets truncated=True for larger matrices.
    """
    if not HAS_NILEARN:
        raise ImportError("Nilearn is not installed")

    if kind not in _VALID_KINDS:
        raise ValueError(f"Unknown kind '{kind}'. Valid: {sorted(_VALID_KINDS)}")

    import numpy as np
    from nilearn.connectome import ConnectivityMeasure

    ts = np.asarray(timeseries_2d, dtype=float)
    n_regions = ts.shape[1]

    measure = ConnectivityMeasure(kind=kind)
    matrix = measure.fit_transform([ts])[0]

    truncated = n_regions > _MATRIX_TRUNCATE
    if truncated:
        matrix = matrix[:_MATRIX_TRUNCATE, :_MATRIX_TRUNCATE]
        n_regions_out = _MATRIX_TRUNCATE
    else:
        n_regions_out = n_regions

    return ConnectomeSummary(
        n_regions=n_regions_out,
        kind=kind,
        matrix=matrix.tolist(),
        truncated=truncated,
    )
