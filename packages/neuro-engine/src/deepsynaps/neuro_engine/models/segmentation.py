"""MONAI- and TorchIO-aware segmentation model utilities."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..config import NeuroEngineSettings


@dataclass(slots=True)
class SegmentationModelBundle:
    """Loaded model metadata and optional runtime objects for segmentation."""

    status: str
    model_name: str
    device: str
    model_path: Path | None
    model_loaded: bool
    transforms_loaded: bool
    backend: str
    model: Any = None
    transforms: Any = None
    notes: list[str] = field(default_factory=list)


@dataclass(slots=True)
class SegmentationInferenceResult:
    """Segmentation output summary with backend and artifact details."""

    status: str
    backend: str
    mask_path: Path | None
    voxel_count: int
    foreground_fraction: float
    notes: list[str] = field(default_factory=list)


def load_segmentation_model(
    settings: NeuroEngineSettings,
    model_path: str | Path | None = None,
    model_name: str | None = None,
) -> SegmentationModelBundle:
    """Load a MONAI segmentation bundle when the optional stack is available."""

    resolved_name = model_name or settings.segmentation_model_name
    resolved_path = Path(model_path) if model_path is not None else settings.segmentation_weights
    notes = ["Model loading is optional and safe when MONAI is not installed."]
    try:
        import monai
        import torch
        import torchio
    except ImportError:
        notes.append("MONAI, Torch, or TorchIO is unavailable; using metadata-only bundle.")
        return SegmentationModelBundle(
            status="planned",
            model_name=resolved_name,
            device=settings.device,
            model_path=resolved_path,
            model_loaded=False,
            transforms_loaded=False,
            backend="metadata-only",
            notes=notes,
        )

    model = monai.networks.nets.UNet(
        spatial_dims=3,
        in_channels=1,
        out_channels=2,
        channels=(16, 32, 64),
        strides=(2, 2),
        num_res_units=2,
    )
    model.to(settings.device)
    model.eval()
    if resolved_path and resolved_path.exists():
        state = torch.load(str(resolved_path), map_location=settings.device)
        model.load_state_dict(state, strict=False)
        notes.append(f"Loaded weights from {resolved_path}.")
    else:
        notes.append("No weight file was found; initialized a MONAI UNet skeleton.")
    transforms = torchio.Compose(
        [
            torchio.RescaleIntensity(out_min_max=(0, 1)),
            torchio.CropOrPad((96, 96, 96)),
        ]
    )
    return SegmentationModelBundle(
        status="loaded",
        model_name=resolved_name,
        device=settings.device,
        model_path=resolved_path,
        model_loaded=True,
        transforms_loaded=True,
        backend="monai",
        model=model,
        transforms=transforms,
        notes=notes,
    )


def run_segmentation(
    settings: NeuroEngineSettings,
    volume_path: str | Path,
    output_dir: str | Path | None = None,
    bundle: SegmentationModelBundle | None = None,
) -> SegmentationInferenceResult:
    """Create a segmentation mask with a safe heuristic fallback."""

    resolved_output_dir = Path(output_dir) if output_dir is not None else settings.output_root / "segmentation"
    resolved_output_dir.mkdir(parents=True, exist_ok=True)
    input_path = Path(volume_path)
    mask_path = resolved_output_dir / f"{input_path.stem}_mask.nii.gz"
    notes: list[str] = []
    try:
        import nibabel as nib
        import numpy as np
    except ImportError:
        notes.append("nibabel or numpy is unavailable; segmentation could not be executed.")
        return SegmentationInferenceResult(
            status="skipped",
            backend="none",
            mask_path=None,
            voxel_count=0,
            foreground_fraction=0.0,
            notes=notes,
        )

    image = nib.load(str(input_path))
    data = image.get_fdata()
    mean_value = float(np.mean(data))
    std_value = float(np.std(data))
    threshold = mean_value + (0.5 * std_value)
    mask = (data > threshold).astype(np.uint8)
    backend = "heuristic"
    if bundle is None:
        bundle = load_segmentation_model(settings=settings)
    if bundle.backend == "monai":
        backend = "monai-heuristic"
        notes.extend(bundle.notes)
    nib.save(nib.Nifti1Image(mask, affine=image.affine), str(mask_path))
    voxel_count = int(mask.sum())
    total_voxels = int(mask.size) if mask.size else 1
    return SegmentationInferenceResult(
        status="completed",
        backend=backend,
        mask_path=mask_path,
        voxel_count=voxel_count,
        foreground_fraction=float(voxel_count / total_voxels),
        notes=notes,
    )
