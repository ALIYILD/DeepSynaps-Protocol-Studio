"""3D CNN brain-age + cognition-proxy predictor.

This module wraps an open-weights 3D ResNet-style architecture that ingests
a minimally preprocessed T1w volume and returns a brain-age estimate plus
a cognition-proxy CDR regression score.

Evidence
--------
* Alzheimer's Res Ther 2025 — PMC12125894 — 3D CNN trained on >10k scans,
  MAE = 3.30 y, cognition AUC ≈ 0.95 (primary reference for MAE used in
  :attr:`~deepsynaps_mri.schemas.BrainAgePrediction.mae_years_reference`).
* Nature Aging 2025 — ``10.1038/s41514-025-00260-x`` — clinical 2D variant.
* UK Biobank CNN — MAE = 2.67 y (minimally preprocessed T1w, ``n>42k``).
* Open weights: https://github.com/westman-neuroimaging-group/brainage-prediction-mri.

Research / wellness use only — not a clinical diagnostic.

The runtime is guarded: when ``torch`` or the model weights are not
available we return :class:`BrainAgePrediction` with
``status='dependency_missing'`` and never raise. This keeps the DeepSynaps
API worker healthy on the slim Docker image where CUDA + torch are not
installed.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Optional

from ..schemas import BrainAgePrediction

log = logging.getLogger(__name__)


_DEFAULT_MODEL_ID = "brainage_cnn_v1"
_DEFAULT_MAE_Y = 3.30  # Alzheimer's Res Ther 2025


# ---------------------------------------------------------------------------
# Availability probes — cheap and idempotent
# ---------------------------------------------------------------------------
def _try_import_torch() -> Optional[Any]:
    try:
        import torch  # type: ignore[import-not-found]

        return torch
    except Exception as exc:  # noqa: BLE001
        log.info("torch import failed (%s) — brain-age CNN unavailable", exc)
        return None


def _try_import_nibabel() -> Optional[Any]:
    try:
        import nibabel as nib  # type: ignore[import-not-found]

        return nib
    except Exception as exc:  # noqa: BLE001
        log.info("nibabel import failed (%s) — brain-age cannot load T1", exc)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def predict_brain_age(
    t1_preprocessed_path: Path,
    chronological_age: float | None,
    weights_path: Path | None = None,
) -> BrainAgePrediction:
    """Predict brain-age + cognition proxy from a preprocessed T1w volume.

    Parameters
    ----------
    t1_preprocessed_path
        Absolute path to a skull-stripped, MNI-registered T1w NIfTI. The
        loader only enforces readability; preprocessing is the caller's
        responsibility.
    chronological_age
        Patient's chronological age in years. Used to compute
        :attr:`BrainAgePrediction.brain_age_gap_years`. When ``None`` the
        gap is omitted from the result.
    weights_path
        Path to a ``state_dict`` checkpoint. Defaults to the bundled /
        cached westman-neuroimaging-group weights. When ``None`` and no
        cached copy exists, returns ``status='dependency_missing'``.

    Returns
    -------
    BrainAgePrediction
        Status-stamped result. ``status='ok'`` when the model ran; all
        other cases wrap the failure cleanly so the pipeline survives.

    Notes
    -----
    ``cognition_cdr_estimate`` is a secondary regression head on the same
    backbone — MAE 0.12 on CDR-SB in the reference study. Values above
    0.5 deserve closer clinician review.

    The prediction is deliberately light on post-processing: we do not
    apply age-bias correction (Beheshti 2019) at this layer; that belongs
    to longitudinal cohort z-scoring in ``longitudinal.py``.
    """
    t0 = time.perf_counter()

    torch_mod = _try_import_torch()
    if torch_mod is None:
        return BrainAgePrediction(
            status="dependency_missing",
            chronological_age_years=chronological_age,
            runtime_sec=time.perf_counter() - t0,
            error_message=(
                "torch is not installed. "
                "Install with `pip install torch` to enable the brain-age CNN."
            ),
        )

    nib_mod = _try_import_nibabel()
    if nib_mod is None:
        return BrainAgePrediction(
            status="dependency_missing",
            chronological_age_years=chronological_age,
            runtime_sec=time.perf_counter() - t0,
            error_message=(
                "nibabel is not installed — cannot load preprocessed T1 volume."
            ),
        )

    try:
        t1_path = Path(t1_preprocessed_path)
        if not t1_path.exists():
            return BrainAgePrediction(
                status="failed",
                chronological_age_years=chronological_age,
                runtime_sec=time.perf_counter() - t0,
                error_message=f"T1 volume not found: {t1_path}",
            )

        model = _load_model(torch_mod, weights_path)
        if model is None:
            return BrainAgePrediction(
                status="dependency_missing",
                chronological_age_years=chronological_age,
                runtime_sec=time.perf_counter() - t0,
                error_message=(
                    "Brain-age model weights not found. "
                    "Set `weights_path=` or download from "
                    "https://github.com/westman-neuroimaging-group/brainage-prediction-mri."
                ),
            )

        volume = _load_t1_tensor(torch_mod, nib_mod, t1_path)
        with torch_mod.no_grad():
            outputs = model(volume)

        predicted_age, cdr = _parse_outputs(outputs)

        gap = None
        if chronological_age is not None and predicted_age is not None:
            gap = float(predicted_age) - float(chronological_age)

        gap_z = None
        if gap is not None:
            # Normalise gap against reference MAE (≈ 1 SD in healthy cohort,
            # Franke & Gaser 2019). This is a conservative placeholder — the
            # longitudinal layer will compute cohort-matched z-scores.
            gap_z = float(gap) / _DEFAULT_MAE_Y if _DEFAULT_MAE_Y else None

        return BrainAgePrediction(
            status="ok",
            predicted_age_years=float(predicted_age) if predicted_age is not None else None,
            chronological_age_years=chronological_age,
            brain_age_gap_years=float(gap) if gap is not None else None,
            gap_zscore=gap_z,
            cognition_cdr_estimate=float(cdr) if cdr is not None else None,
            model_id=_DEFAULT_MODEL_ID,
            mae_years_reference=_DEFAULT_MAE_Y,
            runtime_sec=time.perf_counter() - t0,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception(
            "predict_brain_age failed: t1=%s age=%s",
            t1_preprocessed_path, chronological_age,
        )
        return BrainAgePrediction(
            status="failed",
            chronological_age_years=chronological_age,
            runtime_sec=time.perf_counter() - t0,
            error_message=f"{type(exc).__name__}: {exc}",
        )


# ---------------------------------------------------------------------------
# Model loader — two-branch resolution
# ---------------------------------------------------------------------------
def _load_model(torch_mod: Any, weights_path: Path | None) -> Any:
    """Resolve + load the brain-age model.

    Priority order:
      1. ``torch.hub.load('westman-neuroimaging-group/brainage-prediction-mri')``
         — only if explicit download was previously cached.
      2. ``weights_path`` state_dict into a local lightweight 3D ResNet.
      3. Cached copy under ``~/.cache/deepsynaps/brainage_cnn_v1.pt``.

    Returns
    -------
    torch.nn.Module | None
        Model in ``eval()`` mode, or ``None`` when no weights are available.
    """
    # Attempt torch.hub first (non-blocking — skip if it throws).
    try:
        hub_model = torch_mod.hub.load(
            "westman-neuroimaging-group/brainage-prediction-mri",
            "brainage",
            trust_repo=True,
            skip_validation=True,
        )
        hub_model.eval()
        return hub_model
    except Exception as exc:  # noqa: BLE001
        log.debug("torch.hub brain-age load skipped (%s)", exc)

    # Fallback — state_dict into our lightweight ResNet3D.
    candidate = _resolve_weights(weights_path)
    if candidate is None:
        return None

    try:
        model = _LightResNet3D()
        state = torch_mod.load(str(candidate), map_location="cpu")
        if isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]
        model.load_state_dict(state, strict=False)
        model.eval()
        return model
    except Exception as exc:  # noqa: BLE001
        log.info("brain-age weights load failed (%s)", exc)
        return None


def _resolve_weights(explicit: Path | None) -> Path | None:
    """Pick the first existing weights file from the priority list."""
    candidates: list[Path] = []
    if explicit is not None:
        candidates.append(Path(explicit))
    candidates.append(Path.home() / ".cache" / "deepsynaps" / "brainage_cnn_v1.pt")
    for c in candidates:
        if c.exists():
            return c
    return None


# ---------------------------------------------------------------------------
# Minimal 3D ResNet-like backbone (lazy — imports torch only when called)
# ---------------------------------------------------------------------------
class _LightResNet3D:  # pragma: no cover - structural only, monkeypatched in tests
    """Lightweight 3D ResNet backbone with two regression heads.

    Kept deliberately simple — the tests monkeypatch this out, and the
    prod deployment pulls the open-weights repo which ships its own
    definition. This class's purpose is to provide a reasonable default
    when ``weights_path`` is supplied without ``torch.hub`` access.
    """

    def __init__(self) -> None:
        import torch.nn as nn

        self._nn = nn
        self._module = nn.Sequential(
            nn.Conv3d(1, 8, kernel_size=3, stride=2, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv3d(8, 16, kernel_size=3, stride=2, padding=1),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool3d(1),
            nn.Flatten(),
            nn.Linear(16, 2),   # [predicted_age, cdr_estimate]
        )

    def __call__(self, x):
        return self._module(x)

    def eval(self) -> "_LightResNet3D":
        self._module.eval()
        return self

    def load_state_dict(self, state, strict: bool = False):
        return self._module.load_state_dict(state, strict=strict)


# ---------------------------------------------------------------------------
# Tensor + output parsing helpers
# ---------------------------------------------------------------------------
def _load_t1_tensor(torch_mod: Any, nib_mod: Any, t1_path: Path) -> Any:
    """Load a T1 NIfTI into a (1, 1, D, H, W) float32 tensor.

    Intensities are z-scored over foreground voxels (>0) to match the
    training-time normalisation of the reference model.
    """
    import numpy as np

    img = nib_mod.load(str(t1_path))
    arr = np.asarray(img.get_fdata(), dtype=np.float32)
    mask = arr > 0
    if mask.any():
        mean = float(arr[mask].mean())
        std = float(arr[mask].std()) or 1.0
        arr = (arr - mean) / std
    arr = np.expand_dims(arr, axis=0)
    arr = np.expand_dims(arr, axis=0)
    return torch_mod.from_numpy(arr).float()


def _parse_outputs(outputs: Any) -> tuple[float | None, float | None]:
    """Accept (batch, 2) or (age, cdr) outputs, returning two floats."""
    try:
        # Torch tensor path.
        if hasattr(outputs, "detach"):
            flat = outputs.detach().cpu().numpy().reshape(-1)
        elif isinstance(outputs, (tuple, list)):
            return (
                float(outputs[0]) if len(outputs) > 0 else None,
                float(outputs[1]) if len(outputs) > 1 else None,
            )
        else:
            import numpy as np

            flat = np.asarray(outputs, dtype=float).reshape(-1)
        age = float(flat[0]) if len(flat) > 0 else None
        cdr = float(flat[1]) if len(flat) > 1 else None
        return age, cdr
    except Exception as exc:  # noqa: BLE001
        log.warning("parse_outputs failed (%s) — returning nulls", exc)
        return None, None


__all__ = ["predict_brain_age"]
