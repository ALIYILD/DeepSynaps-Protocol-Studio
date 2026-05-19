"""DIPY dMRI helpers — Phase 2b."""
from __future__ import annotations

try:
    import dipy.reconst.dti as _dti_check  # noqa: F401
    HAS_DIPY: bool = True
except ImportError:
    HAS_DIPY = False

from app.services.neuroimaging.schemas import DtiScalarSummary, DwiSummary


def load_dwi(nifti_path: str, bval_path: str, bvec_path: str) -> DwiSummary:
    """Load a DWI dataset and return a shape/count summary."""
    if not HAS_DIPY:
        raise ImportError("Dipy is not installed")

    import nibabel as nib
    import numpy as np
    from dipy.io.gradients import read_bvals_bvecs

    img = nib.load(nifti_path)
    data = np.asarray(img.dataobj)
    bvals, bvecs = read_bvals_bvecs(bval_path, bvec_path)

    n_volumes = data.shape[-1] if data.ndim == 4 else 1
    b0_count = int(np.sum(bvals < 50))
    n_directions = n_volumes - b0_count

    return DwiSummary(
        shape=list(data.shape),
        n_volumes=n_volumes,
        n_directions=n_directions,
        b0_count=b0_count,
    )


def fit_dti(nifti_path: str, bval_path: str, bvec_path: str) -> DtiScalarSummary:
    """Fit a DTI model and return mean FA and mean MD over a b0-based mask."""
    if not HAS_DIPY:
        raise ImportError("Dipy is not installed")

    import nibabel as nib
    import numpy as np
    from dipy.core.gradients import gradient_table
    from dipy.io.gradients import read_bvals_bvecs
    from dipy.reconst.dti import TensorModel

    img = nib.load(nifti_path)
    data = np.asarray(img.dataobj)
    bvals, bvecs = read_bvals_bvecs(bval_path, bvec_path)
    gtab = gradient_table(bvals, bvecs)

    # b0-based binary mask (avoid median_otsu)
    b0_mask = data[..., bvals < 50].mean(axis=-1) > 0

    tenmodel = TensorModel(gtab)
    tenfit = tenmodel.fit(data, mask=b0_mask)

    fa = tenfit.fa
    md = tenfit.md

    finite_mask = np.isfinite(fa) & np.isfinite(md) & b0_mask
    voxel_count = int(finite_mask.sum())
    mean_fa = float(fa[finite_mask].mean()) if voxel_count > 0 else 0.0
    mean_md = float(md[finite_mask].mean()) if voxel_count > 0 else 0.0

    return DtiScalarSummary(
        mean_fa=mean_fa,
        mean_md=mean_md,
        voxel_count=voxel_count,
    )
