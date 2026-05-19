"""NiBabel I/O helpers — pure functions, no globals except HAS_NIBABEL."""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

try:
    import nibabel as nib
    HAS_NIBABEL: bool = True
except ImportError:
    nib = None  # type: ignore[assignment]
    HAS_NIBABEL = False

from app.services.neuroimaging.schemas import NiftiSummary


def load_nifti(path: str | Path):
    """Load a NIfTI file and return the nibabel image object.

    Raises ImportError if nibabel is not installed.
    """
    if not HAS_NIBABEL:
        raise ImportError("nibabel is not installed")
    return nib.load(str(path))


def nifti_header_summary(path: str | Path) -> NiftiSummary:
    """Return a NiftiSummary for the NIfTI file at *path*."""
    if not HAS_NIBABEL:
        raise ImportError("nibabel is not installed")
    img = nib.load(str(path))
    header = img.header
    zooms = header.get_zooms()
    try:
        xyzt = header.get_xyzt_units()
        space_unit = xyzt[0] if xyzt else None
    except Exception:
        space_unit = None

    return NiftiSummary(
        shape=list(img.shape),
        voxel_size=[float(z) for z in zooms[:3]],
        affine=[list(row) for row in img.affine.tolist()],
        units=space_unit if space_unit else None,
        dtype=str(img.get_data_dtype()),
        header_keys=list(header.keys()),
    )
