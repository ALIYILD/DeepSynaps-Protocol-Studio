"""
Image registration — subject MRI ↔ MNI152 (NLin2009cAsym).

**Primary engine:** ``antspyx`` ``ants.registration`` (SyN family), matching
fMRIPrep/QSIPrep-style nonlinear alignment. Canonical atlas name in
:mod:`constants` is ``MNI152NLin2009cAsym`` — do not mix other MNI variants in
stored coordinates.

**FSL (FLIRT/FNIRT):** not wrapped here. FLIRT affine + FNIRT warp is a valid
production alternative; add ``adapters/fsl_fnirt.py`` if you need FSL-only
deployments. Prefer **wrap** for FLIRT/FNIRT/ANTS CLI; **reimplement** only for
QC metrics (correlation, simple overlap), not for optimization.

**Target mapping:** Atlas targets in ``constants.ALL_TARGETS`` are MNI mm.
``MniRegistrationBundle.inverse_transform_paths`` + ``apply_transform(...,
transform_list=inverse, fixed=native_T1, moving=atlas_roi)`` (or
``warp_points_to_patient``) maps MNI → native for neuronavigation overlays.
Forward transforms map native → MNI for group templates and some ML models.
"""
from __future__ import annotations

import json
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence

import numpy as np
from pydantic import BaseModel, Field
from scipy.stats import pearsonr

from .constants import MNI_TEMPLATE

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic envelopes (JSON-serialisable)
# ---------------------------------------------------------------------------


class MniRegistrationBundle(BaseModel):
    """Result of :func:`register_to_mni` — paths + metadata for audit/reload."""

    ok: bool
    atlas_space: str = MNI_TEMPLATE
    engine: Literal["ants_syn"] = "ants_syn"
    transform_type: str = "SyN"
    moving_path: str | None = None
    fixed_path: str | None = None
    forward_transform_paths: list[str] = Field(default_factory=list)
    inverse_transform_paths: list[str] = Field(default_factory=list)
    warped_moving_path: str | None = None
    manifest_path: str | None = None
    log_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class ApplyTransformResult(BaseModel):
    ok: bool
    output_path: str | None = None
    interpolator: str = "linear"
    transform_list: list[str] = Field(default_factory=list)
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class InvertTransformResult(BaseModel):
    """Paths to apply with ``fixed`` = native reference, ``moving`` = MNI-space."""

    ok: bool
    inverse_transform_paths: list[str] = Field(default_factory=list)
    application_note: str = ""
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class RegistrationQCMetrics(BaseModel):
    n_voxels_evaluated: int | None = None
    pearson_r: float | None = None
    pearson_p: float | None = None
    mean_abs_diff: float | None = None
    fixed_mean: float | None = None
    warped_mean: float | None = None
    passes_default_threshold: bool = True
    threshold_pearson_r: float = 0.12

    def to_dict(self) -> dict:
        return self.model_dump()


class RegistrationQCReport(BaseModel):
    ok: bool
    metrics: RegistrationQCMetrics = Field(default_factory=RegistrationQCMetrics)
    json_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


@dataclass
class Transform:
    """Opaque container for forward + inverse transforms (in-memory ANTs)."""

    fwd_transforms: list[str]
    inv_transforms: list[str]
    warped_moving: object
    warped_fixed: object | None = None


def _load(path_or_img):
    import ants

    if isinstance(path_or_img, (str, Path)):
        return ants.image_read(str(path_or_img))
    return path_or_img


def _ants_registration_core(
    moving_path: str | Path,
    *,
    fixed_path: str | Path | None,
    transform_type: Literal["SyN", "SyNRA", "SyNCC", "SyNAggro"],
) -> Transform:
    import ants

    moving = _load(moving_path)
    if fixed_path is None:
        fixed = ants.image_read(ants.get_ants_data("mni"))
    else:
        fixed = _load(fixed_path)

    log.info(
        "ANTS registration: type=%s moving=%s fixed=%s",
        transform_type,
        moving_path,
        "bundled_mni" if fixed_path is None else fixed_path,
    )
    reg = ants.registration(
        fixed=fixed,
        moving=moving,
        type_of_transform=transform_type,
        verbose=False,
    )
    return Transform(
        fwd_transforms=list(reg["fwdtransforms"]),
        inv_transforms=list(reg["invtransforms"]),
        warped_moving=reg["warpedmovout"],
        warped_fixed=reg.get("warpedfixout"),
    )


def register_t1_to_mni(
    t1_path: str | Path,
    *,
    mni_template_path: str | Path | None = None,
    transform_type: Literal["SyN", "SyNRA", "SyNCC", "SyNAggro"] = "SyN",
) -> Transform:
    """Register patient T1 to MNI152 (bundled or custom template).

    Legacy thin wrapper — returns in-memory :class:`Transform`. For auditable
    on-disk artefacts use :func:`register_to_mni`.
    """
    return _ants_registration_core(
        t1_path,
        fixed_path=mni_template_path,
        transform_type=transform_type,
    )


def _copy_transforms_to_artefacts(
    paths: Sequence[str],
    artefacts_dir: Path,
    prefix: str,
) -> list[str]:
    out: list[str] = []
    artefacts_dir.mkdir(parents=True, exist_ok=True)
    for i, p in enumerate(paths):
        src = Path(p)
        if not src.is_file():
            log.warning("Transform path missing, skipping copy: %s", p)
            out.append(str(src))
            continue
        dest = artefacts_dir / f"{prefix}_{i:02d}_{src.name}"
        shutil.copy2(src, dest)
        out.append(str(dest.resolve()))
    return out


def register_to_mni(
    moving_path: str | Path,
    *,
    fixed_path: str | Path | None = None,
    artefacts_dir: str | Path | None = None,
    transform_type: Literal["SyN", "SyNRA", "SyNCC", "SyNAggro"] = "SyN",
    warped_name: str = "t1_warped_to_mni.nii.gz",
    manifest_name: str = "registration_manifest.json",
) -> MniRegistrationBundle:
    """
    Register ``moving_path`` (e.g. native T1) to MNI fixed space.

    When ``artefacts_dir`` is set, writes:

    * ``warped_name`` — moving resampled to fixed grid
    * ``forward_XX_*`` / ``inverse_XX_*`` — copied transform files
    * ``manifest_name`` — JSON manifest (paths, engine, transform type)

    Forward transform list maps **native → MNI** (use with ``fixed`` = MNI
    reference, ``moving`` = native image). Inverse list maps **MNI → native**
    for targets and overlays.
    """
    mp = Path(moving_path).resolve()
    if not mp.is_file():
        return MniRegistrationBundle(
            ok=False,
            moving_path=str(mp),
            code="moving_missing",
            message=f"Moving image not found: {mp}",
        )

    try:
        xfm = _ants_registration_core(
            mp,
            fixed_path=fixed_path,
            transform_type=transform_type,
        )
    except ImportError as exc:
        log.warning("antspyx unavailable: %s", exc)
        return MniRegistrationBundle(
            ok=False,
            moving_path=str(mp),
            fixed_path=str(fixed_path) if fixed_path else None,
            code="antspyx_missing",
            message=str(exc),
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("register_to_mni failed")
        return MniRegistrationBundle(
            ok=False,
            moving_path=str(mp),
            fixed_path=str(fixed_path) if fixed_path else None,
            code="registration_failed",
            message=str(exc),
        )

    fwd_paths = list(xfm.fwd_transforms)
    inv_paths = list(xfm.inv_transforms)
    warped_path_str: str | None = None
    manifest_path_str: str | None = None

    if artefacts_dir is not None:
        root = Path(artefacts_dir).resolve()
        reg_dir = root / "registration"
        reg_dir.mkdir(parents=True, exist_ok=True)
        fwd_paths = _copy_transforms_to_artefacts(fwd_paths, reg_dir, "forward")
        inv_paths = _copy_transforms_to_artefacts(inv_paths, reg_dir, "inverse")
        warped_out = reg_dir / warped_name
        try:
            xfm.warped_moving.to_filename(str(warped_out))
            warped_path_str = str(warped_out.resolve())
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not write warped image: %s", exc)

        bundle_partial = MniRegistrationBundle(
            ok=True,
            transform_type=transform_type,
            moving_path=str(mp),
            fixed_path=str(Path(fixed_path).resolve()) if fixed_path else None,
            forward_transform_paths=fwd_paths,
            inverse_transform_paths=inv_paths,
            warped_moving_path=warped_path_str,
            message="ok",
        )
        manifest_path = reg_dir / manifest_name
        manifest_path.write_text(
            json.dumps(bundle_partial.to_dict(), indent=2),
            encoding="utf-8",
        )
        manifest_path_str = str(manifest_path.resolve())
        return bundle_partial.model_copy(
            update={"manifest_path": manifest_path_str},
        )

    return MniRegistrationBundle(
        ok=True,
        transform_type=transform_type,
        moving_path=str(mp),
        fixed_path=str(Path(fixed_path).resolve()) if fixed_path else None,
        forward_transform_paths=fwd_paths,
        inverse_transform_paths=inv_paths,
        message="ok",
    )


def apply_transform(
    fixed_ref: str | Path,
    moving_path: str | Path,
    transform_list: Sequence[str],
    output_path: str | Path,
    *,
    interpolator: Literal["linear", "nearestNeighbor", "multiLabel", "gaussian", "bSpline"] = "linear",
) -> ApplyTransformResult:
    """
    Apply an ANTs transform chain (forward or inverse list from registration).

    Pass ``transform_list=`` :attr:`MniRegistrationBundle.forward_transform_paths`
    to warp a native image into fixed (MNI) space, or ``inverse_transform_paths``
    to warp an MNI-space image into native space (with ``fixed_ref`` = native T1).
    """
    try:
        import ants
    except ImportError as exc:
        return ApplyTransformResult(
            ok=False,
            transform_list=list(transform_list),
            code="antspyx_missing",
            message=str(exc),
        )

    out = Path(output_path).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        warped = ants.apply_transforms(
            fixed=_load(fixed_ref),
            moving=_load(moving_path),
            transformlist=list(transform_list),
            interpolator=interpolator,
        )
        warped.to_filename(str(out))
    except Exception as exc:  # noqa: BLE001
        log.exception("apply_transform failed")
        return ApplyTransformResult(
            ok=False,
            transform_list=list(transform_list),
            code="apply_failed",
            message=str(exc),
        )

    return ApplyTransformResult(
        ok=True,
        output_path=str(out),
        interpolator=interpolator,
        transform_list=list(transform_list),
        message="ok",
    )


def invert_transform(
    *,
    registration: MniRegistrationBundle | None = None,
    forward_transform_paths: Sequence[str] | None = None,
    inverse_transform_paths: Sequence[str] | None = None,
) -> InvertTransformResult:
    """
    Resolve the transform list that maps **MNI → native** (patient space).

    Prefer passing a completed :class:`MniRegistrationBundle`; then ANTs
    ``inverse_transform_paths`` from SyN are returned as-is.

    If only ``forward_transform_paths`` are supplied, **SyN inverses cannot be
    derived** without the companion inverse warp files — returns
    ``code=inverse_not_available``.
    """
    if registration is not None and registration.inverse_transform_paths:
        return InvertTransformResult(
            ok=True,
            inverse_transform_paths=list(registration.inverse_transform_paths),
            application_note=(
                "Use apply_transform(fixed_ref=native_T1, moving=mni_image_or_label, "
                "transform_list=inverse_transform_paths)."
            ),
            message="ok",
        )

    if inverse_transform_paths:
        return InvertTransformResult(
            ok=True,
            inverse_transform_paths=list(inverse_transform_paths),
            application_note=(
                "Order is ANTs apply_transforms order for MNI → native; "
                "fixed image should be native reference."
            ),
            message="ok",
        )

    if forward_transform_paths:
        return InvertTransformResult(
            ok=False,
            inverse_transform_paths=[],
            code="inverse_not_available",
            message=(
                "Nonlinear SyN inverse is not the reverse list of forward paths; "
                "re-run registration or pass inverse_transform_paths from the bundle."
            ),
        )

    return InvertTransformResult(
        ok=False,
        code="no_transforms",
        message="Provide registration bundle or inverse_transform_paths.",
    )


def compute_registration_qc(
    fixed_reference_path: str | Path,
    warped_moving_path: str | Path,
    *,
    artefacts_dir: str | Path | None = None,
    json_name: str = "registration_qc.json",
    brain_mask_path: str | Path | None = None,
) -> RegistrationQCReport:
    """
    Voxelwise QC: Pearson correlation between fixed reference and warped moving.

    Both volumes should lie on the **same grid** (ANTS ``warpedmovout`` on fixed).
    Optional ``brain_mask_path`` restricts evaluation.
    """
    try:
        import nibabel as nib
    except ImportError as exc:
        return RegistrationQCReport(
            ok=False,
            code="nibabel_missing",
            message=str(exc),
        )

    fp = Path(fixed_reference_path).resolve()
    wp = Path(warped_moving_path).resolve()
    if not fp.is_file() or not wp.is_file():
        return RegistrationQCReport(
            ok=False,
            code="input_missing",
            message=f"Missing fixed or warped: {fp} / {wp}",
        )

    try:
        fix = np.asanyarray(nib.load(str(fp)).dataobj, dtype=np.float64).ravel()
        war = np.asanyarray(nib.load(str(wp)).dataobj, dtype=np.float64).ravel()
        if fix.size != war.size:
            return RegistrationQCReport(
                ok=False,
                code="shape_mismatch",
                message=f"Shape mismatch {fix.size} vs {war.size}",
            )

        mask = np.ones(fix.shape[0], dtype=bool)
        if brain_mask_path is not None:
            mp = Path(brain_mask_path).resolve()
            if mp.is_file():
                m = np.asanyarray(nib.load(str(mp)).dataobj).ravel() > 0.5
                if m.size != fix.size:
                    return RegistrationQCReport(
                        ok=False,
                        code="mask_shape_mismatch",
                        message="Mask length does not match images",
                    )
                mask = m

        use = mask & np.isfinite(fix) & np.isfinite(war) & (np.abs(fix) + np.abs(war) > 1e-6)
        n = int(np.sum(use))
        if n < 100:
            return RegistrationQCReport(
                ok=False,
                code="too_few_voxels",
                message=f"Only {n} voxels for QC",
            )

        f = fix[use]
        w = war[use]
        r, p = pearsonr(f, w)
        mad = float(np.mean(np.abs(f - w)))
        thresh = RegistrationQCMetrics().threshold_pearson_r
        passes = bool(r >= thresh)

        metrics = RegistrationQCMetrics(
            n_voxels_evaluated=n,
            pearson_r=float(r),
            pearson_p=float(p),
            mean_abs_diff=mad,
            fixed_mean=float(np.mean(f)),
            warped_mean=float(np.mean(w)),
            passes_default_threshold=passes,
        )
        report = RegistrationQCReport(ok=True, metrics=metrics, message="ok")

        if artefacts_dir is not None:
            root = Path(artefacts_dir).resolve()
            root.mkdir(parents=True, exist_ok=True)
            jp = root / json_name
            jp.write_text(report.model_dump_json(indent=2), encoding="utf-8")
            report = report.model_copy(update={"json_path": str(jp.resolve())})

        return report
    except Exception as exc:  # noqa: BLE001
        log.exception("compute_registration_qc failed")
        return RegistrationQCReport(ok=False, code="qc_failed", message=str(exc))


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
    """Map MNI-space coordinates into patient-T1 space (inverse chain)."""
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
    """Canonical template label for this project."""
    return MNI_TEMPLATE


__all__ = [
    "ApplyTransformResult",
    "InvertTransformResult",
    "MniRegistrationBundle",
    "RegistrationQCMetrics",
    "RegistrationQCReport",
    "Transform",
    "apply_transform",
    "compute_registration_qc",
    "invert_transform",
    "mni_template_name",
    "register_t1_to_mni",
    "register_to_mni",
    "warp_image_to_mni",
    "warp_points_to_patient",
]
