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

import json
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field

from .constants import MNI_TEMPLATE
from .pipeline_manifests import write_stage_manifest

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


def write_registration_manifest(
    artefacts_root: str | Path,
    *,
    moving_t1_path: str | Path,
    warped_mni_path: str | Path,
    xfm: Transform,
    transform_type: str = "SyN",
) -> Path:
    """Persist paths and transform list references under ``manifests/register_manifest.json``."""
    return write_stage_manifest(
        artefacts_root,
        "register",
        {
            "tool": "antspyx",
            "transform_type": transform_type,
            "template": MNI_TEMPLATE,
            "moving_image": str(Path(moving_t1_path).resolve()),
            "warped_mni_image": str(Path(warped_mni_path).resolve()),
            "fwd_transforms": [str(Path(p).resolve()) for p in xfm.fwd_transforms],
            "inv_transforms": [str(Path(p).resolve()) for p in xfm.inv_transforms],
        },
    )


# ---------------------------------------------------------------------------
# Extended bundle API (additive — alongside ``register_t1_to_mni``)
# ---------------------------------------------------------------------------
class MniRegistrationBundle(BaseModel):
    """Paths + artefacts from :func:`persist_registration_to_mni`."""

    ok: bool = True
    moving_path: str
    fixed_template_path: str | None = None
    warped_mni_path: str | None = None
    transform_type: str = "SyN"
    fwd_transform_paths: list[str] = Field(default_factory=list)
    inv_transform_paths: list[str] = Field(default_factory=list)
    manifest_path: str | None = None
    message: str = ""


class ApplyTransformResult(BaseModel):
    ok: bool
    output_path: str | None = None
    message: str = ""


class InvertTransformResult(BaseModel):
    ok: bool
    output_path: str | None = None
    message: str = ""


class RegistrationQCMetrics(BaseModel):
    pearson_r: float | None = None
    mean_abs_diff: float | None = None
    n_voxels_evaluated: int | None = None


class RegistrationQCReport(BaseModel):
    ok: bool
    metrics: RegistrationQCMetrics = Field(default_factory=RegistrationQCMetrics)
    manifest_path: str | None = None
    message: str = ""


def persist_registration_to_mni(
    moving_path: str | Path,
    artefacts_dir: str | Path,
    *,
    mni_template_path: str | Path | None = None,
    transform_type: Literal["SyN", "SyNRA", "SyNCC", "SyNAggro"] = "SyN",
    warped_basename: str = "t1_mni.nii.gz",
) -> MniRegistrationBundle:
    """
    Register subject T1 to MNI; persist warped image + copied transform files.

    Use :func:`register_t1_to_mni` when only an in-memory :class:`Transform` is needed;
    use this when artefacts must live under ``artefacts_dir/registration/``.
    """
    moving_path = Path(moving_path)
    root = Path(artefacts_dir) / "registration"
    root.mkdir(parents=True, exist_ok=True)

    xfm = register_t1_to_mni(
        moving_path,
        mni_template_path=mni_template_path,
        transform_type=transform_type,
    )

    warped_path = root / warped_basename
    xfm.warped_moving.to_filename(str(warped_path))

    fwd_copied: list[str] = []
    inv_copied: list[str] = []
    for i, p in enumerate(xfm.fwd_transforms):
        src = Path(p)
        dst = root / f"fwd_{i}_{src.name}"
        shutil.copy2(src, dst)
        fwd_copied.append(str(dst.resolve()))
    for i, p in enumerate(xfm.inv_transforms):
        src = Path(p)
        dst = root / f"inv_{i}_{src.name}"
        shutil.copy2(src, dst)
        inv_copied.append(str(dst.resolve()))

    fixed_p = None
    try:
        import ants

        fixed_p = str(Path(mni_template_path).resolve()) if mni_template_path else str(
            Path(ants.get_ants_data("mni")).resolve()
        )
    except Exception:  # noqa: BLE001
        fixed_p = str(mni_template_path) if mni_template_path else None

    man = root / "registration_bundle_manifest.json"
    man.write_text(
        json.dumps(
            {
                "tool": "antspyx",
                "transform_type": transform_type,
                "moving": str(moving_path.resolve()),
                "warped_mni": str(warped_path.resolve()),
                "fwd_transforms": fwd_copied,
                "inv_transforms": inv_copied,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    return MniRegistrationBundle(
        ok=True,
        moving_path=str(moving_path.resolve()),
        fixed_template_path=fixed_p,
        warped_mni_path=str(warped_path.resolve()),
        transform_type=transform_type,
        fwd_transform_paths=fwd_copied,
        inv_transform_paths=inv_copied,
        manifest_path=str(man.resolve()),
        message="ok",
    )


def apply_transform(
    moving_path: str | Path,
    reference_path: str | Path,
    transform_paths: list[str | Path],
    output_path: str | Path,
    *,
    interpolator: str = "linear",
) -> ApplyTransformResult:
    """Apply an arbitrary forward transform list (ANTs ``apply_transforms``)."""
    import ants

    try:
        out = ants.apply_transforms(
            fixed=_load(reference_path),
            moving=_load(moving_path),
            transformlist=[str(p) for p in transform_paths],
            interpolator=interpolator,
        )
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        ants.image_write(out, str(output_path))
    except Exception as exc:  # noqa: BLE001
        return ApplyTransformResult(ok=False, message=str(exc))
    return ApplyTransformResult(
        ok=True,
        output_path=str(Path(output_path).resolve()),
        message="ok",
    )


def invert_transform(
    moving_path: str | Path,
    reference_path: str | Path,
    inverse_transform_paths: list[str | Path],
    output_path: str | Path,
    *,
    interpolator: str = "linear",
) -> InvertTransformResult:
    """Apply inverse chain (patient-space reconstruction from MNI)."""
    import ants

    try:
        out = ants.apply_transforms(
            fixed=_load(reference_path),
            moving=_load(moving_path),
            transformlist=[str(p) for p in inverse_transform_paths],
            interpolator=interpolator,
        )
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        ants.image_write(out, str(output_path))
    except Exception as exc:  # noqa: BLE001
        return InvertTransformResult(ok=False, message=str(exc))
    return InvertTransformResult(
        ok=True,
        output_path=str(Path(output_path).resolve()),
        message="ok",
    )


def compute_registration_qc(
    fixed_path: str | Path,
    moving_warped_path: str | Path,
    artefacts_dir: str | Path,
    *,
    min_voxels: int = 100,
) -> RegistrationQCReport:
    """Pearson r and mean abs diff between fixed and warped moving (both in fixed grid)."""
    try:
        import ants
    except ImportError:
        return RegistrationQCReport(ok=False, message="antspyx not installed")

    fixed = _load(fixed_path)
    warped = _load(moving_warped_path)
    a = np.asarray(fixed.numpy(), dtype=np.float64).ravel()
    b = np.asarray(warped.numpy(), dtype=np.float64).ravel()
    n = min(a.size, b.size)
    a = a[:n]
    b = b[:n]
    if n < min_voxels:
        return RegistrationQCReport(ok=False, message="too_few_voxels")

    if np.std(a) > 0 and np.std(b) > 0:
        r = float(np.corrcoef(a, b)[0, 1])
    else:
        r = None
    mad = float(np.mean(np.abs(a - b)))

    metrics = RegistrationQCMetrics(
        pearson_r=r,
        mean_abs_diff=mad,
        n_voxels_evaluated=n,
    )
    root = Path(artefacts_dir) / "registration"
    root.mkdir(parents=True, exist_ok=True)
    man = root / "registration_qc.json"
    man.write_text(json.dumps(metrics.model_dump(), indent=2), encoding="utf-8")
    return RegistrationQCReport(
        ok=True,
        metrics=metrics,
        manifest_path=str(man.resolve()),
        message="ok",
    )


# Extended persisted bundle — roadmap name ``register_to_mni((moving, artefacts_dir))``
register_to_mni = persist_registration_to_mni
