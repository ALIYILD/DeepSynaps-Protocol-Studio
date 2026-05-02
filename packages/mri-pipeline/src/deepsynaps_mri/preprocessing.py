"""
Structural MRI preprocessing — brain extract, N4, orientation, intensity, QC.

Wraps FSL BET and optional ANTs N4 when available. Pure-Python steps use nibabel/numpy.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Literal

import numpy as np
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)


class BrainExtractResult(BaseModel):
    ok: bool
    brain_path: str | None = None
    mask_path: str | None = None
    message: str = ""
    manifest_path: str | None = None


class BiasCorrectionResult(BaseModel):
    ok: bool
    output_path: str | None = None
    message: str = ""


class OrientationResult(BaseModel):
    ok: bool
    output_path: str
    was_reoriented: bool = False
    message: str = ""


class IntensityNormalizeResult(BaseModel):
    ok: bool
    output_path: str
    message: str = ""


class PreprocessingQCMetrics(BaseModel):
    mean_intensity_brain: float | None = None
    std_intensity_brain: float | None = None
    brain_voxels: int | None = None


class PreprocessingQCReport(BaseModel):
    ok: bool
    metrics: PreprocessingQCMetrics = Field(default_factory=PreprocessingQCMetrics)
    manifest_path: str | None = None
    message: str = ""


def brain_extract(
    input_path: str | Path,
    artefacts_dir: str | Path,
    *,
    prefix: str = "bet",
    fractional_intensity: float = 0.5,
    robust: bool = False,
) -> BrainExtractResult:
    """FSL BET wrapper; writes under ``artefacts_dir/preprocessing/``."""
    from .adapters import fsl_bet as bet_adapters

    inp = Path(input_path)
    root = Path(artefacts_dir) / "preprocessing"
    root.mkdir(parents=True, exist_ok=True)
    out_prefix = root / prefix
    try:
        bet_adapters.run_bet(
            inp,
            out_prefix,
            fractional_intensity=fractional_intensity,
            robust=robust,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("brain_extract failed: %s", exc)
        return BrainExtractResult(ok=False, message=str(exc))

    brain_gz = Path(str(out_prefix) + "_brain.nii.gz")
    mask_gz = Path(str(out_prefix) + "_brain_mask.nii.gz")
    man = root / "brain_extract_manifest.json"
    payload = {
        "tool": "fsl_bet",
        "input": str(inp.resolve()),
        "output_prefix": str(out_prefix.resolve()),
        "brain_path": str(brain_gz.resolve()) if brain_gz.exists() else None,
        "mask_path": str(mask_gz.resolve()) if mask_gz.exists() else None,
    }
    man.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return BrainExtractResult(
        ok=True,
        brain_path=str(brain_gz.resolve()) if brain_gz.exists() else None,
        mask_path=str(mask_gz.resolve()) if mask_gz.exists() else None,
        manifest_path=str(man.resolve()),
        message="ok",
    )


def bias_correct_n4(
    input_path: str | Path,
    output_path: str | Path,
) -> BiasCorrectionResult:
    """ANTs N4 via antspyx when available."""
    try:
        import ants
    except ImportError:
        return BiasCorrectionResult(
            ok=False,
            message="antspyx not installed",
        )
    inp = ants.image_read(str(input_path))
    try:
        corrected = ants.n4_bias_field_correction(inp)
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        ants.image_write(corrected, str(out))
    except Exception as exc:  # noqa: BLE001
        return BiasCorrectionResult(ok=False, message=str(exc))
    return BiasCorrectionResult(ok=True, output_path=str(Path(output_path).resolve()), message="ok")


def normalize_orientation(input_path: str | Path, output_path: str | Path) -> OrientationResult:
    """Reorient to canonical RAS via nibabel."""
    import nibabel as nib
    from nibabel.orientations import axcodes2ornt, ornt_transform

    img = nib.load(str(input_path))
    ax = nib.aff2axcodes(img.affine)
    if ax == ("R", "A", "S"):
        data = img.get_fdata()
        nib.save(nib.Nifti1Image(data, img.affine, img.header), str(output_path))
        return OrientationResult(
            ok=True,
            output_path=str(Path(output_path).resolve()),
            was_reoriented=False,
            message="already_canonical",
        )
    can = nib.as_closest_canonical(img)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    nib.save(can, str(output_path))
    return OrientationResult(
        ok=True,
        output_path=str(Path(output_path).resolve()),
        was_reoriented=True,
        message="reoriented_to_ras",
    )


def normalize_intensity(
    input_path: str | Path,
    output_path: str | Path,
    mask_path: str | Path | None = None,
) -> IntensityNormalizeResult:
    """Masked z-score normalization (brain mask optional)."""
    import nibabel as nib

    img = nib.load(str(input_path))
    data = np.asarray(img.get_fdata(), dtype=np.float64)
    if data.ndim == 4:
        data = data[..., 0]

    mask = None
    if mask_path is not None and Path(mask_path).exists():
        m = nib.load(str(mask_path)).get_fdata()
        if m.ndim == 4:
            m = m[..., 0]
        mask = m > 0.5

    if mask is not None and np.any(mask):
        inside = data[mask]
        mu = float(np.mean(inside))
        sd = float(np.std(inside))
        out_d = np.zeros_like(data)
        if sd > 1e-12:
            out_d[mask] = (inside - mu) / sd
        else:
            out_d[mask] = 0.0
    else:
        mu = float(np.mean(data))
        sd = float(np.std(data))
        out_d = (data - mu) / sd if sd > 1e-12 else np.zeros_like(data)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    nib.save(nib.Nifti1Image(out_d.astype(np.float32), img.affine, img.header), str(output_path))
    return IntensityNormalizeResult(ok=True, output_path=str(Path(output_path).resolve()), message="ok")


def generate_preprocessing_qc(
    input_path: str | Path,
    artefacts_dir: str | Path,
    *,
    mask_path: str | Path | None = None,
) -> PreprocessingQCReport:
    """Scalar QC metrics + JSON sidecar."""
    import nibabel as nib

    img = nib.load(str(input_path))
    data = np.asarray(img.get_fdata(), dtype=np.float64)
    if data.ndim == 4:
        data = data[..., 0]

    mask = None
    if mask_path is not None and Path(mask_path).exists():
        m = nib.load(str(mask_path)).get_fdata()
        if m.ndim == 4:
            m = m[..., 0]
        mask = m > 0.5

    if mask is not None and np.any(mask):
        inside = data[mask]
        metrics = PreprocessingQCMetrics(
            mean_intensity_brain=float(np.mean(inside)),
            std_intensity_brain=float(np.std(inside)),
            brain_voxels=int(np.sum(mask)),
        )
    else:
        metrics = PreprocessingQCMetrics(
            mean_intensity_brain=float(np.mean(data)),
            std_intensity_brain=float(np.std(data)),
            brain_voxels=int(data.size),
        )

    root = Path(artefacts_dir) / "preprocessing"
    root.mkdir(parents=True, exist_ok=True)
    man = root / "preprocessing_qc.json"
    man.write_text(json.dumps(metrics.model_dump(), indent=2), encoding="utf-8")
    return PreprocessingQCReport(
        ok=True,
        metrics=metrics,
        manifest_path=str(man.resolve()),
        message="ok",
    )


__all__ = [
    "BrainExtractResult",
    "BiasCorrectionResult",
    "OrientationResult",
    "IntensityNormalizeResult",
    "PreprocessingQCReport",
    "brain_extract",
    "bias_correct_n4",
    "normalize_orientation",
    "normalize_intensity",
    "generate_preprocessing_qc",
]
