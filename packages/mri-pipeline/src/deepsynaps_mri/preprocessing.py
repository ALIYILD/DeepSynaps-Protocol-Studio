"""
Structural MRI preprocessing — brain extraction, bias correction, orientation,
intensity scaling, and QC metrics.

External tools are invoked only through :mod:`deepsynaps_mri.adapters`:

* FSL ``bet`` — subprocess (see ``adapters/fsl_bet.py``).
* ANTs N4 — ``antspyx`` (see ``adapters/ants_n4.py``).

Outputs are written under caller-provided ``artefacts_dir`` with logs alongside.

Decision-support context only — preprocessing aids downstream analysis, not diagnosis.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field

from .adapters.ants_n4 import run_n4_bias_correction as _adapter_n4
from .adapters.fsl_bet import run_bet as _adapter_bet

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Return schemas (JSON-serialisable)
# ---------------------------------------------------------------------------
class BrainExtractResult(BaseModel):
    """Result of :func:`brain_extract`."""

    ok: bool
    brain_path: str | None = None
    mask_path: str | None = None
    backend: Literal["fsl_bet", "skipped"] = "fsl_bet"
    command: list[str] = Field(default_factory=list)
    returncode: int | None = None
    log_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class BiasCorrectionResult(BaseModel):
    """Result of :func:`bias_correct_n4`."""

    ok: bool
    output_path: str | None = None
    backend: Literal["ants_n4"] = "ants_n4"
    log_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class OrientationResult(BaseModel):
    """Result of :func:`normalize_orientation`."""

    ok: bool
    output_path: str | None = None
    orientation_before: str | None = None  # e.g. LAS
    orientation_after: str = "RAS"
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class IntensityNormalizeResult(BaseModel):
    """Result of :func:`normalize_intensity`."""

    ok: bool
    output_path: str | None = None
    method: Literal["zscore_masked_mean_std"] = "zscore_masked_mean_std"
    mean_in_mask: float | None = None
    std_in_mask: float | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class PreprocessingQCMetrics(BaseModel):
    """Scalar QC after preprocessing (single scalar volume)."""

    voxel_count_brain: int | None = None
    mean_in_brain: float | None = None
    std_in_brain: float | None = None
    min_in_brain: float | None = None
    max_in_brain: float | None = None
    snr_proxy: float | None = Field(
        default=None,
        description="mean/std inside brain (unitless crude proxy, not SNR in physics sense)",
    )
    orientation_code: str | None = None
    shape_xyz: tuple[int, int, int] | None = None
    voxel_size_mm: tuple[float, float, float] | None = None

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


class PreprocessingQCReport(BaseModel):
    """Output of :func:`generate_preprocessing_qc`."""

    ok: bool
    metrics: PreprocessingQCMetrics = Field(default_factory=PreprocessingQCMetrics)
    json_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


def _artefact_log_path(artefacts_dir: Path, name: str) -> Path:
    logs = artefacts_dir / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    return logs / name


def brain_extract(
    input_nifti: str | Path,
    artefacts_dir: str | Path,
    *,
    prefix: str = "bet",
    frac: float = 0.5,
    skip_if_unavailable: bool = False,
    timeout_sec: int = 7200,
) -> BrainExtractResult:
    """
    Brain extraction via FSL BET.

    Writes ``{prefix}_brain.nii.gz`` and mask under ``artefacts_dir``.

    Parameters
    ----------
    skip_if_unavailable
        If True and ``bet`` is missing, return ``ok=False`` with code
        ``bet_not_found`` instead of treating as hard error for callers that chain steps.
    """
    inp = Path(input_nifti).resolve()
    root = Path(artefacts_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    out_prefix = root / prefix
    log_p = _artefact_log_path(root, "bet_subprocess.log")

    if not inp.exists():
        return BrainExtractResult(ok=False, code="input_missing", message=f"Missing {inp}")

    bet = _adapter_bet(inp, out_prefix, frac=frac, log_path=log_p, timeout_sec=timeout_sec)

    if not bet.ok and bet.code == "bet_not_found" and skip_if_unavailable:
        return BrainExtractResult(
            ok=False,
            backend="skipped",
            code=bet.code,
            message=bet.message,
            log_path=str(log_p),
        )

    if not bet.ok:
        return BrainExtractResult(
            ok=False,
            command=bet.command,
            returncode=bet.returncode,
            log_path=str(log_p),
            code=bet.code or "bet_failed",
            message=bet.message,
        )

    return BrainExtractResult(
        ok=True,
        brain_path=str(bet.brain_path) if bet.brain_path else None,
        mask_path=str(bet.mask_path) if bet.mask_path else None,
        backend="fsl_bet",
        command=bet.command,
        returncode=bet.returncode,
        log_path=str(log_p),
        message="ok",
    )


def bias_correct_n4(
    input_nifti: str | Path,
    artefacts_dir: str | Path,
    *,
    output_name: str = "t1_n4.nii.gz",
    mask_nifti: str | Path | None = None,
    shrink_factor: int = 4,
    convergence_tol: float = 1e-7,
    log_name: str = "n4_antspy.log",
) -> BiasCorrectionResult:
    """
    N4 bias field correction via ``antspyx``.

    Writes corrected volume to ``artefacts_dir / output_name``.
    """
    inp = Path(input_nifti).resolve()
    root = Path(artefacts_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    out = root / output_name
    log_p = _artefact_log_path(root, log_name)

    if not inp.exists():
        return BiasCorrectionResult(ok=False, code="input_missing", message=f"Missing {inp}")

    res = _adapter_n4(
        inp,
        out,
        mask_path=mask_nifti,
        shrink_factor=shrink_factor,
        convergence_tol=convergence_tol,
        log_path=log_p,
    )

    if not res.ok:
        return BiasCorrectionResult(
            ok=False,
            log_path=str(log_p),
            code=res.code,
            message=res.message,
        )

    return BiasCorrectionResult(
        ok=True,
        output_path=str(out),
        log_path=str(log_p),
        message="ok",
    )


def normalize_orientation(
    input_nifti: str | Path,
    artefacts_dir: str | Path,
    *,
    output_name: str = "t1_ras.nii.gz",
) -> OrientationResult:
    """
    Reorient volume to closest canonical (LA+) orientation — typically RAS.

    Uses ``nibabel.as_closest_canonical``. Writes ``artefacts_dir / output_name``.
    """
    try:
        import nibabel as nib
        from nibabel.orientations import aff2axcodes
    except ImportError as exc:
        return OrientationResult(
            ok=False,
            code="nibabel_missing",
            message=str(exc),
        )

    inp = Path(input_nifti).resolve()
    root = Path(artefacts_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    out = root / output_name

    if not inp.exists():
        return OrientationResult(ok=False, code="input_missing", message=f"Missing {inp}")

    try:
        img = nib.load(str(inp))
        before = "".join(aff2axcodes(img.affine))
        canon = nib.as_closest_canonical(img)
        after = "".join(aff2axcodes(canon.affine))
        nib.save(canon, str(out))
    except Exception as exc:  # noqa: BLE001
        log.exception("normalize_orientation failed")
        return OrientationResult(ok=False, code="reorient_failed", message=str(exc))

    return OrientationResult(
        ok=True,
        output_path=str(out),
        orientation_before=before,
        orientation_after=after,
        message="ok",
    )


def normalize_intensity(
    input_nifti: str | Path,
    brain_mask_nifti: str | Path,
    artefacts_dir: str | Path,
    *,
    output_name: str = "t1_zscore.nii.gz",
) -> IntensityNormalizeResult:
    """
    Z-score intensities inside ``brain_mask_nifti`` (values > 0.5 treated as brain).

    Voxels outside mask are unchanged from ``input_nifti``.
    """
    try:
        import nibabel as nib
    except ImportError as exc:
        return IntensityNormalizeResult(ok=False, code="nibabel_missing", message=str(exc))

    inp = Path(input_nifti).resolve()
    msk = Path(brain_mask_nifti).resolve()
    root = Path(artefacts_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    out = root / output_name

    if not inp.exists() or not msk.exists():
        return IntensityNormalizeResult(
            ok=False,
            code="input_missing",
            message=f"Missing input or mask: {inp} / {msk}",
        )

    try:
        img = nib.load(str(inp))
        mask_img = nib.load(str(msk))
        data = np.asanyarray(img.dataobj, dtype=np.float64)
        mask = np.asanyarray(mask_img.dataobj) > 0.5
        if data.shape[:3] != mask.shape[:3]:
            return IntensityNormalizeResult(
                ok=False,
                code="shape_mismatch",
                message=f"Shape mismatch data {data.shape} vs mask {mask.shape}",
            )
        inside = data[mask]
        if inside.size == 0:
            return IntensityNormalizeResult(ok=False, code="empty_mask", message="Empty brain mask")
        mean_v = float(np.mean(inside))
        std_v = float(np.std(inside))
        out_data = np.array(data, copy=True)
        if std_v < 1e-12:
            # Constant intensities in mask — leave ok=True; z-score is undefined, use zeros.
            out_data[mask] = 0.0
        else:
            out_data[mask] = (data[mask] - mean_v) / std_v
        out_img = nib.Nifti1Image(out_data.astype(np.float32), img.affine, img.header)
        nib.save(out_img, str(out))
    except Exception as exc:  # noqa: BLE001
        log.exception("normalize_intensity failed")
        return IntensityNormalizeResult(ok=False, code="normalize_failed", message=str(exc))

    return IntensityNormalizeResult(
        ok=True,
        output_path=str(out),
        mean_in_mask=mean_v,
        std_in_mask=std_v,
        message="ok",
    )


def generate_preprocessing_qc(
    nifti_path: str | Path,
    brain_mask_path: str | Path | None,
    artefacts_dir: str | Path,
    *,
    json_name: str = "preprocessing_qc.json",
) -> PreprocessingQCReport:
    """
    Compute scalar QC metrics inside brain mask (if provided; else full FOV).

    Writes JSON next to other artefacts under ``artefacts_dir``.
    """
    try:
        import nibabel as nib
        from nibabel.orientations import aff2axcodes
    except ImportError as exc:
        return PreprocessingQCReport(
            ok=False,
            code="nibabel_missing",
            message=str(exc),
        )

    p = Path(nifti_path).resolve()
    root = Path(artefacts_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    json_path = root / json_name

    if not p.exists():
        return PreprocessingQCReport(ok=False, code="input_missing", message=str(p))

    try:
        img = nib.load(str(p))
        data = np.asanyarray(img.dataobj, dtype=np.float64)
        if data.ndim == 4:
            vol = np.asanyarray(data[..., 0], dtype=np.float64)
        elif data.ndim == 3:
            vol = data
        else:
            return PreprocessingQCReport(
                ok=False,
                code="unsupported_dims",
                message=f"Expected 3D or 4D NIfTI, got shape {data.shape}",
            )

        shape_xyz = tuple(int(x) for x in vol.shape)
        zooms = tuple(float(z) for z in img.header.get_zooms()[:3])
        orient = "".join(aff2axcodes(img.affine))

        if brain_mask_path is not None:
            mp = Path(brain_mask_path).resolve()
            if mp.exists():
                mask_img = nib.load(str(mp))
                mask = np.asanyarray(mask_img.dataobj) > 0.5
                if mask.shape != shape_xyz:
                    return PreprocessingQCReport(
                        ok=False,
                        code="mask_shape_mismatch",
                        message=f"mask {mask.shape} vs volume {shape_xyz}",
                    )
            else:
                mask = np.ones(shape_xyz, dtype=bool)
        else:
            mask = np.ones(shape_xyz, dtype=bool)

        inside = vol[mask]

        mean_v = float(np.mean(inside))
        std_v = float(np.std(inside))
        snr_proxy = float(mean_v / std_v) if std_v > 1e-12 else None

        metrics = PreprocessingQCMetrics(
            voxel_count_brain=int(np.sum(mask)),
            mean_in_brain=mean_v,
            std_in_brain=std_v,
            min_in_brain=float(np.min(inside)),
            max_in_brain=float(np.max(inside)),
            snr_proxy=snr_proxy,
            orientation_code=orient,
            shape_xyz=shape_xyz,
            voxel_size_mm=zooms,
        )

        report = PreprocessingQCReport(ok=True, metrics=metrics, json_path=str(json_path))
        json_path.write_text(report.model_dump_json(indent=2), encoding="utf-8")
        return report
    except Exception as exc:  # noqa: BLE001
        log.exception("generate_preprocessing_qc failed")
        return PreprocessingQCReport(ok=False, code="qc_failed", message=str(exc))


def run_structural_preprocessing(
    t1_nifti: str | Path,
    artefacts_dir: str | Path,
    *,
    pseudo_id: str = "anonymous",
    run_bet_step: bool = True,
    run_n4_step: bool = True,
    run_reorient_step: bool = True,
    run_zscore_step: bool = True,
    bet_frac: float = 0.5,
    skip_bet_if_no_fsl: bool = True,
) -> dict:
    """
    Opinionated chain: optional RAS → BET → N4 → z-score → QC.

    Intermediate files:

    * ``t1_ras.nii.gz`` — canonical orientation
    * ``bet_brain.nii.gz`` / ``bet_brain_mask.nii.gz`` — BET outputs (prefix ``bet``)
    * ``t1_n4.nii.gz`` — bias corrected (masked when BET ran)
    * ``t1_zscore.nii.gz`` — intensity normalised
    * ``preprocessing_qc.json`` — QC metrics

    Returns a JSON-serialisable summary dict (not an MRIReport contract change).
    """
    root = Path(artefacts_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    log.info("run_structural_preprocessing start subject=%s dir=%s", pseudo_id, root)

    current = Path(t1_nifti).resolve()
    steps: dict[str, dict] = {}

    if run_reorient_step:
        o = normalize_orientation(current, root, output_name="t1_ras.nii.gz")
        steps["orientation"] = o.to_dict()
        if o.ok and o.output_path:
            current = Path(o.output_path)

    mask_for_n4: Path | None = None
    if run_bet_step:
        b = brain_extract(
            current,
            root,
            prefix="bet",
            frac=bet_frac,
            skip_if_unavailable=skip_bet_if_no_fsl,
        )
        steps["brain_extract"] = b.to_dict()
        if b.ok and b.mask_path:
            mask_for_n4 = Path(b.mask_path)
            current = Path(b.brain_path) if b.brain_path else current
        elif not b.ok and b.code == "bet_not_found":
            log.warning("BET skipped — no FSL on PATH")

    if run_n4_step:
        n = bias_correct_n4(
            current,
            root,
            output_name="t1_n4.nii.gz",
            mask_nifti=mask_for_n4,
        )
        steps["bias_n4"] = n.to_dict()
        if n.ok and n.output_path:
            current = Path(n.output_path)

    mask_for_z = mask_for_n4
    if run_zscore_step and mask_for_z is not None:
        z = normalize_intensity(
            current,
            mask_for_z,
            root,
            output_name="t1_zscore.nii.gz",
        )
        steps["intensity_zscore"] = z.to_dict()
        if z.ok and z.output_path:
            current = Path(z.output_path)

    qc = generate_preprocessing_qc(
        current,
        str(mask_for_z) if mask_for_z else None,
        root,
    )
    steps["qc"] = qc.to_dict()

    return {
        "ok": qc.ok,
        "final_preprocessed_path": str(current),
        "artefacts_dir": str(root),
        "steps": steps,
    }


__all__ = [
    "BiasCorrectionResult",
    "BrainExtractResult",
    "IntensityNormalizeResult",
    "OrientationResult",
    "PreprocessingQCMetrics",
    "PreprocessingQCReport",
    "bias_correct_n4",
    "brain_extract",
    "generate_preprocessing_qc",
    "normalize_intensity",
    "normalize_orientation",
    "run_structural_preprocessing",
]
