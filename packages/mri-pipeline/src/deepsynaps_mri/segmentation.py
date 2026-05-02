"""
Tissue and subcortical segmentation — FSL FAST / FIRST wrappers with DeepSynaps labels.

Standard tissue labels (FAST PVE0–2 relabeled): CSF=1, GM=2, WM=3.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

TISSUE_LABEL_CSF = 1
TISSUE_LABEL_GM = 2
TISSUE_LABEL_WM = 3


class TissueSegmentationResult(BaseModel):
    ok: bool
    tissue_labels_path: str | None = None
    pve_paths: list[str] = Field(default_factory=list)
    manifest_path: str | None = None
    message: str = ""


class SubcorticalSegmentationResult(BaseModel):
    ok: bool
    labels_path: str | None = None
    manifest_path: str | None = None
    message: str = ""


class SegmentationQCMetrics(BaseModel):
    csf_fraction: float | None = None
    gm_fraction: float | None = None
    wm_fraction: float | None = None
    brain_voxels: int | None = None


class SegmentationQCReport(BaseModel):
    ok: bool
    metrics: SegmentationQCMetrics = Field(default_factory=SegmentationQCMetrics)
    manifest_path: str | None = None
    message: str = ""


def _relabel_fast_seg(seg_data: np.ndarray) -> np.ndarray:
    """Map FAST class indices to DeepSynaps CSF/GM/WM."""
    out = np.zeros_like(seg_data, dtype=np.uint8)
    # FAST: 1=CSF 2=GM 3=WM typically for -n 3
    out[seg_data == 1] = TISSUE_LABEL_CSF
    out[seg_data == 2] = TISSUE_LABEL_GM
    out[seg_data == 3] = TISSUE_LABEL_WM
    return out


def segment_tissues_gm_wm_csf(
    brain_path: str | Path,
    artefacts_dir: str | Path,
    *,
    prefix: str = "fast",
) -> TissueSegmentationResult:
    """Run FSL FAST and write relabeled tissue segmentation + manifest."""
    import nibabel as nib

    from .adapters import fsl_fast as fast_adapters

    inp = Path(brain_path)
    root = Path(artefacts_dir) / "segmentation"
    root.mkdir(parents=True, exist_ok=True)
    out_base = root / prefix
    try:
        fast_adapters.run_fast(inp, out_base, n_classes=3)
    except Exception as exc:  # noqa: BLE001
        return TissueSegmentationResult(ok=False, message=str(exc))

    seg_path = Path(str(out_base) + "_seg.nii.gz")
    if not seg_path.is_file():
        return TissueSegmentationResult(ok=False, message=f"missing_FAST_seg:{seg_path}")

    img = nib.load(str(seg_path))
    rel = _relabel_fast_seg(np.asarray(img.get_fdata(), dtype=np.int16))
    out_labels = root / f"{prefix}_tissue_ds_labels.nii.gz"
    nib.save(nib.Nifti1Image(rel.astype(np.uint8), img.affine, img.header), str(out_labels))

    pve = [
        str(Path(str(out_base) + f"_pve_{i}.nii.gz").resolve())
        for i in range(3)
        if Path(str(out_base) + f"_pve_{i}.nii.gz").exists()
    ]
    man = root / "tissue_segmentation_manifest.json"
    man.write_text(
        json.dumps(
            {
                "tool": "fsl_fast",
                "input": str(inp.resolve()),
                "standard_labels": {"CSF": TISSUE_LABEL_CSF, "GM": TISSUE_LABEL_GM, "WM": TISSUE_LABEL_WM},
                "tissue_labels_path": str(out_labels.resolve()),
                "pve_paths": pve,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return TissueSegmentationResult(
        ok=True,
        tissue_labels_path=str(out_labels.resolve()),
        pve_paths=pve,
        manifest_path=str(man.resolve()),
        message="ok",
    )


def segment_subcortical_structures(
    brain_path: str | Path,
    artefacts_dir: str | Path,
    *,
    prefix: str = "first",
) -> SubcorticalSegmentationResult:
    """Run FSL FIRST; output path is engine-native."""
    from .adapters import fsl_first as first_adapters

    inp = Path(brain_path)
    root = Path(artefacts_dir) / "segmentation"
    root.mkdir(parents=True, exist_ok=True)
    out_base = root / prefix
    try:
        first_adapters.run_first(inp, out_base)
    except Exception as exc:  # noqa: BLE001
        return SubcorticalSegmentationResult(ok=False, message=str(exc))

    man = root / "subcortical_segmentation_manifest.json"
    man.write_text(
        json.dumps(
            {
                "tool": "fsl_first",
                "input": str(inp.resolve()),
                "output_prefix": str(out_base.resolve()),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    # FIRST naming varies — glob native outputs
    candidates = sorted(root.glob(f"{prefix}*_all_fast_origsegs.nii.gz"))
    labels_path = str(candidates[0].resolve()) if candidates else None
    return SubcorticalSegmentationResult(
        ok=True,
        labels_path=labels_path,
        manifest_path=str(man.resolve()),
        message="ok",
    )


def compute_segmentation_qc(
    tissue_labels_path: str | Path,
    artefacts_dir: str | Path,
) -> SegmentationQCReport:
    """Tissue fractions from labeled volume."""
    import nibabel as nib

    p = Path(tissue_labels_path)
    data = np.asarray(nib.load(str(p)).get_fdata(), dtype=np.int32)
    flat = data.ravel()
    n = max(flat.size, 1)
    n_csf = int(np.sum(flat == TISSUE_LABEL_CSF))
    n_gm = int(np.sum(flat == TISSUE_LABEL_GM))
    n_wm = int(np.sum(flat == TISSUE_LABEL_WM))
    nb = n_csf + n_gm + n_wm
    metrics = SegmentationQCMetrics(
        csf_fraction=n_csf / nb if nb else None,
        gm_fraction=n_gm / nb if nb else None,
        wm_fraction=n_wm / nb if nb else None,
        brain_voxels=int(nb),
    )
    root = Path(artefacts_dir) / "segmentation"
    root.mkdir(parents=True, exist_ok=True)
    man = root / "segmentation_qc.json"
    man.write_text(json.dumps(metrics.model_dump(), indent=2), encoding="utf-8")
    return SegmentationQCReport(
        ok=True,
        metrics=metrics,
        manifest_path=str(man.resolve()),
        message="ok",
    )


__all__ = [
    "TISSUE_LABEL_CSF",
    "TISSUE_LABEL_GM",
    "TISSUE_LABEL_WM",
    "TissueSegmentationResult",
    "SubcorticalSegmentationResult",
    "SegmentationQCReport",
    "segment_tissues_gm_wm_csf",
    "segment_subcortical_structures",
    "compute_segmentation_qc",
]
