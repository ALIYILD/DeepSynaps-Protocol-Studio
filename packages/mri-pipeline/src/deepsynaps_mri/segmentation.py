"""
Structural tissue and subcortical segmentation — DeepSynaps standard layout.

**Primary wrapped backends (P0):** FSL FAST (GM/WM/CSF), FSL FIRST (subcortical).

**Future adapters:** FreeSurfer/SynthSeg ASEG (``structural.py``), ANTs Atropos
(multimodal / custom priors), ``antspyx`` ``atropos`` when you need ANTs-native
pipelines without FSL.

Decision-support / research tooling — not a primary diagnostic.

See ``docs/SEGMENTATION.md`` for label conventions and tool mapping.
"""
from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field

from .adapters.fsl_fast import run_fast_tissue_segmentation as _adapter_fast
from .adapters.fsl_first import run_first_subcortical as _adapter_first
from .validation import validate_nifti_header

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Standardized DeepSynaps tissue labels (integer seg, same as FSL FAST 3-class)
# ---------------------------------------------------------------------------
# 0 = background (outside brain / below threshold)
# 1 = CSF
# 2 = GM
# 3 = WM
TISSUE_LABEL_CSF = 1
TISSUE_LABEL_GM = 2
TISSUE_LABEL_WM = 3


class TissueSegmentationResult(BaseModel):
    ok: bool
    engine: Literal["fsl_fast", "none"] = "fsl_fast"
    tissue_seg_path: str | None = None
    """Path to NIfTI int labels: 0=bg, 1=CSF, 2=GM, 3=WM (DeepSynaps standard)."""
    pve_csf_path: str | None = None
    pve_gm_path: str | None = None
    pve_wm_path: str | None = None
    manifest_path: str | None = None
    log_path: str | None = None
    validation: dict | None = None
    adapter_details: dict | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class SubcorticalSegmentationResult(BaseModel):
    ok: bool
    engine: Literal["fsl_first", "none"] = "fsl_first"
    """FIRST integer labels per FSL MNI152-first templates (see FSL FIRST docs)."""
    labels_path: str | None = None
    manifest_path: str | None = None
    log_path: str | None = None
    validation: dict | None = None
    adapter_details: dict | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class SegmentationQCMetrics(BaseModel):
    n_voxels_brain: int | None = None
    frac_csf: float | None = None
    frac_gm: float | None = None
    frac_wm: float | None = None
    label_entropy: float | None = None
    passes_min_brain_voxels: bool = True
    min_brain_voxels: int = 10_000

    def to_dict(self) -> dict:
        return self.model_dump()


class SegmentationQCReport(BaseModel):
    ok: bool
    metrics: SegmentationQCMetrics = Field(default_factory=SegmentationQCMetrics)
    json_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


def _seg_dir(artefacts_dir: Path) -> Path:
    d = artefacts_dir / "segmentation"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write_manifest(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _relabel_fast_to_deepsynaps(seg_array: np.ndarray) -> np.ndarray:
    """Ensure 0,1,2,3 convention; clamp unknowns to 0."""
    out = np.zeros_like(seg_array, dtype=np.int16)
    s = np.asarray(seg_array, dtype=np.int64)
    out[np.isin(s, (1,))] = TISSUE_LABEL_CSF
    out[np.isin(s, (2,))] = TISSUE_LABEL_GM
    out[np.isin(s, (3,))] = TISSUE_LABEL_WM
    return out


def segment_tissues_gm_wm_csf(
    t1_brain_nifti: str | Path,
    artefacts_dir: str | Path,
    *,
    run_input_validation: bool = True,
    fast_basename: str = "fast_tissue",
    timeout_sec: int = 7200,
) -> TissueSegmentationResult:
    """
    Three-class tissue segmentation (CSF / GM / WM).

    Writes under ``artefacts_dir/segmentation/``:

    * ``tissue_pve0_csf.nii.gz`` … ``tissue_pve2_wm.nii.gz`` (from FAST, renamed)
    * ``tissue_seg_deepsynaps.nii.gz`` — int labels 0–3 (DeepSynaps standard)
    * ``tissue_segmentation_manifest.json``
    * ``logs/fast_subprocess.log``
    """
    inp = Path(t1_brain_nifti).resolve()
    root = Path(artefacts_dir).resolve()
    sdir = _seg_dir(root)
    log_p = root / "segmentation" / "logs"
    log_p.mkdir(parents=True, exist_ok=True)
    fast_log = log_p / "fast_subprocess.log"

    validation_dict: dict | None = None
    if run_input_validation:
        vr = validate_nifti_header(inp)
        validation_dict = vr.to_dict()
        if not vr.ok:
            return TissueSegmentationResult(
                ok=False,
                engine="none",
                validation=validation_dict,
                code=vr.code or "validation_failed",
                message=vr.message,
            )

    if not inp.is_file():
        return TissueSegmentationResult(
            ok=False,
            engine="none",
            code="input_missing",
            message=str(inp),
        )

    fast_base = sdir / fast_basename
    fast = _adapter_fast(
        inp,
        fast_base,
        n_classes=3,
        log_path=fast_log,
        timeout_sec=timeout_sec,
    )

    if not fast.ok:
        return TissueSegmentationResult(
            ok=False,
            engine="fsl_fast",
            log_path=str(fast_log),
            adapter_details=fast.to_dict(),
            validation=validation_dict,
            code=fast.code,
            message=fast.message,
        )

    try:
        import nibabel as nib
    except ImportError as exc:
        return TissueSegmentationResult(
            ok=False,
            engine="fsl_fast",
            adapter_details=fast.to_dict(),
            code="nibabel_missing",
            message=str(exc),
        )

    seg_in = nib.load(str(fast.seg_path))
    data = np.asanyarray(seg_in.dataobj)
    relabeled = _relabel_fast_to_deepsynaps(data)
    out_seg = sdir / "tissue_seg_deepsynaps.nii.gz"
    nib.save(nib.Nifti1Image(relabeled, seg_in.affine, seg_in.header), str(out_seg))

    pve_dst: list[tuple[str, Path | None]] = [
        ("tissue_pve0_csf.nii.gz", fast.pve_csf_path),
        ("tissue_pve1_gm.nii.gz", fast.pve_gm_path),
        ("tissue_pve2_wm.nii.gz", fast.pve_wm_path),
    ]
    pve_written: dict[str, str] = {}
    for name, src in pve_dst:
        if src and Path(src).is_file():
            dst = sdir / name
            shutil.copy2(src, dst)
            pve_written[name] = str(dst.resolve())

    manifest = {
        "kind": "deepsynaps_tissue_segmentation",
        "engine": "fsl_fast",
        "label_scheme": {
            "0": "background",
            "1": "csf",
            "2": "gm",
            "3": "wm",
        },
        "source_fast_seg": str(fast.seg_path) if fast.seg_path else None,
        "outputs": {
            "tissue_seg_deepsynaps": str(out_seg.resolve()),
            **pve_written,
        },
        "command": fast.command,
    }
    man_path = sdir / "tissue_segmentation_manifest.json"
    _write_manifest(man_path, manifest)

    log.info("Tissue segmentation OK: %s", out_seg)

    return TissueSegmentationResult(
        ok=True,
        engine="fsl_fast",
        tissue_seg_path=str(out_seg.resolve()),
        pve_csf_path=pve_written.get("tissue_pve0_csf.nii.gz"),
        pve_gm_path=pve_written.get("tissue_pve1_gm.nii.gz"),
        pve_wm_path=pve_written.get("tissue_pve2_wm.nii.gz"),
        manifest_path=str(man_path.resolve()),
        log_path=str(fast_log.resolve()),
        validation=validation_dict,
        adapter_details=fast.to_dict(),
        message="ok",
    )


def segment_subcortical_structures(
    t1_brain_nifti: str | Path,
    artefacts_dir: str | Path,
    *,
    run_input_validation: bool = True,
    first_prefix: str = "first_subcort",
    timeout_sec: int = 7200,
) -> SubcorticalSegmentationResult:
    """
    Subcortical labels via FSL FIRST (native FSL label IDs).

    Writes:

    * ``subcortical_first_labels.nii.gz`` — copy of FIRST output
    * ``subcortical_segmentation_manifest.json``
    * ``logs/first_subprocess.log``

    For structure names, map integers using the FSL FIRST label lookup table
    (documented in FSL course notes / ``first_labels``).
    """
    inp = Path(t1_brain_nifti).resolve()
    root = Path(artefacts_dir).resolve()
    sdir = _seg_dir(root)
    log_p = root / "segmentation" / "logs"
    log_p.mkdir(parents=True, exist_ok=True)
    first_log = log_p / "first_subprocess.log"

    validation_dict: dict | None = None
    if run_input_validation:
        vr = validate_nifti_header(inp)
        validation_dict = vr.to_dict()
        if not vr.ok:
            return SubcorticalSegmentationResult(
                ok=False,
                engine="none",
                validation=validation_dict,
                code=vr.code or "validation_failed",
                message=vr.message,
            )

    if not inp.is_file():
        return SubcorticalSegmentationResult(
            ok=False,
            engine="none",
            code="input_missing",
            message=str(inp),
        )

    first_out = sdir / first_prefix
    fr = _adapter_first(inp, first_out, log_path=first_log, timeout_sec=timeout_sec)

    if not fr.ok:
        return SubcorticalSegmentationResult(
            ok=False,
            engine="fsl_first",
            log_path=str(first_log),
            adapter_details=fr.to_dict(),
            validation=validation_dict,
            code=fr.code,
            message=fr.message,
        )

    dst = sdir / "subcortical_first_labels.nii.gz"
    shutil.copy2(fr.seg_path, dst)

    manifest = {
        "kind": "deepsynaps_subcortical_segmentation",
        "engine": "fsl_first",
        "label_atlas": "fsl_first_mni_templates",
        "reference": "FSL FIRST — integer labels per structure (see FSL documentation)",
        "outputs": {"labels": str(dst.resolve())},
        "command": fr.command,
    }
    man_path = sdir / "subcortical_segmentation_manifest.json"
    _write_manifest(man_path, manifest)

    log.info("Subcortical segmentation OK: %s", dst)

    return SubcorticalSegmentationResult(
        ok=True,
        engine="fsl_first",
        labels_path=str(dst.resolve()),
        manifest_path=str(man_path.resolve()),
        log_path=str(first_log.resolve()),
        validation=validation_dict,
        adapter_details=fr.to_dict(),
        message="ok",
    )


def compute_segmentation_qc(
    tissue_seg_path: str | Path,
    artefacts_dir: str | Path,
    *,
    brain_mask_path: str | Path | None = None,
    json_name: str = "segmentation_qc.json",
) -> SegmentationQCReport:
    """
    QC on DeepSynaps tissue labels (1=CSF, 2=GM, 3=WM).

    Computes label fractions inside optional binary ``brain_mask_path``.
    """
    try:
        import nibabel as nib
    except ImportError as exc:
        return SegmentationQCReport(
            ok=False,
            code="nibabel_missing",
            message=str(exc),
        )

    p = Path(tissue_seg_path).resolve()
    root = Path(artefacts_dir).resolve()
    sdir = _seg_dir(root)

    if not p.is_file():
        return SegmentationQCReport(ok=False, code="seg_missing", message=str(p))

    try:
        seg = np.asanyarray(nib.load(str(p)).dataobj).ravel()
        mask = np.ones_like(seg, dtype=bool)
        if brain_mask_path is not None:
            mp = Path(brain_mask_path).resolve()
            if mp.is_file():
                m = np.asanyarray(nib.load(str(mp)).dataobj).astype(bool).ravel()
                if m.size != seg.size:
                    return SegmentationQCReport(
                        ok=False,
                        code="mask_shape_mismatch",
                        message="Mask size does not match segmentation",
                    )
                mask = m

        inside = seg[mask]
        inside = inside[inside > 0]
        n = int(inside.size)
        metrics = SegmentationQCMetrics(n_voxels_brain=n, min_brain_voxels=10_000)
        if n == 0:
            return SegmentationQCReport(
                ok=False,
                metrics=metrics,
                code="empty_foreground",
                message="No foreground voxels in mask",
            )

        counts = np.bincount(inside.astype(np.int64), minlength=4)
        total = float(counts[1] + counts[2] + counts[3]) or 1.0
        metrics.frac_csf = float(counts[1] / total)
        metrics.frac_gm = float(counts[2] / total)
        metrics.frac_wm = float(counts[3] / total)

        probs = np.array([counts[1], counts[2], counts[3]], dtype=np.float64) / total
        probs = probs[probs > 0]
        metrics.label_entropy = float(-np.sum(probs * np.log(probs + 1e-12)))
        metrics.passes_min_brain_voxels = n >= metrics.min_brain_voxels

        report = SegmentationQCReport(ok=True, metrics=metrics, message="ok")
        jp = sdir / json_name
        jp.write_text(report.model_dump_json(indent=2), encoding="utf-8")
        return report.model_copy(update={"json_path": str(jp.resolve())})
    except Exception as exc:  # noqa: BLE001
        log.exception("compute_segmentation_qc failed")
        return SegmentationQCReport(ok=False, code="qc_failed", message=str(exc))


__all__ = [
    "TISSUE_LABEL_CSF",
    "TISSUE_LABEL_GM",
    "TISSUE_LABEL_WM",
    "SegmentationQCMetrics",
    "SegmentationQCReport",
    "SubcorticalSegmentationResult",
    "TissueSegmentationResult",
    "compute_segmentation_qc",
    "segment_subcortical_structures",
    "segment_tissues_gm_wm_csf",
]
