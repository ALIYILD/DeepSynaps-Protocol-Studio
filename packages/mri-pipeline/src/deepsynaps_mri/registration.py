"""
Image registration — ANTs SyN wrappers for T1 <-> MNI.

Thin wrappers around ``antspyx`` (pip-installable, ships MNI152NLin2009cAsym
template). We stick to SyN (greedy SyN by default) because it's the
reference nonlinear method used by fMRIPrep / QSIPrep and matches the
spatial alignment of our pgvector paper abstracts.

Note: all MNI coordinates elsewhere in this project are in
MNI152NLin2009cAsym space. Never mix spaces.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .constants import MNI_TEMPLATE

log = logging.getLogger(__name__)


@dataclass
class Transform:
    """Opaque container for the forward + inverse transforms."""
    fwd_transforms: list[str]          # fixed <- moving
    inv_transforms: list[str]          # moving <- fixed
    warped_moving: object               # antspyx image
    warped_fixed: object | None = None


def _load(path_or_img):
    import ants
    if isinstance(path_or_img, (str, Path)):
        return ants.image_read(str(path_or_img))
    return path_or_img


def register_t1_to_mni(
    t1_path: str | Path,
    *,
    mni_template_path: str | Path | None = None,
    transform_type: Literal["SyN", "SyNRA", "SyNCC", "SyNAggro"] = "SyN",
) -> Transform:
    """Register patient T1 to MNI152NLin2009cAsym.

    If ``mni_template_path`` is None we use antspyx's bundled MNI152.

    Returns a Transform object whose ``fwd_transforms`` are what you pass
    to ``ants.apply_transforms`` to move data from patient-T1 space into MNI.
    """
    import ants
    moving = _load(t1_path)
    if mni_template_path is None:
        fixed = ants.image_read(ants.get_ants_data("mni"))   # bundled MNI152
    else:
        fixed = _load(mni_template_path)

    reg = ants.registration(
        fixed=fixed,
        moving=moving,
        type_of_transform=transform_type,
        verbose=False,
    )
    return Transform(
        fwd_transforms=reg["fwdtransforms"],
        inv_transforms=reg["invtransforms"],
        warped_moving=reg["warpedmovout"],
        warped_fixed=reg["warpedfixout"],
    )


def warp_image_to_mni(
    moving_path: str | Path,
    reference_path: str | Path,
    xfm: Transform,
    *,
    interpolator: str = "linear",
):
    """Apply the forward transform to push a patient-space image into MNI."""
    import ants
    return ants.apply_transforms(
        fixed=_load(reference_path),
        moving=_load(moving_path),
        transformlist=xfm.fwd_transforms,
        interpolator=interpolator,
    )


def warp_points_to_patient(
    mni_points_xyz: list[tuple[float, float, float]],
    xfm: Transform,
) -> list[tuple[float, float, float]]:
    """Map MNI-space coordinates back into patient-T1 space.

    Useful to display canonical stim targets on the patient's native T1.
    ``antspyx.apply_transforms_to_points`` requires a DataFrame.
    """
    import ants
    import pandas as pd

    df = pd.DataFrame(mni_points_xyz, columns=["x", "y", "z"])
    out = ants.apply_transforms_to_points(
        dim=3,
        points=df,
        transformlist=xfm.inv_transforms,
    )
    return [(float(r.x), float(r.y), float(r.z)) for r in out.itertuples()]


def mni_template_name() -> str:
    """Canonical template used by this project."""
    return MNI_TEMPLATE
