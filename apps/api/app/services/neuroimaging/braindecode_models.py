"""Phase 2c: optional deep-learning EEG model wrappers (braindecode + torch).

Both libraries are optional extras (neuro-dl). Import is guarded so the
module loads cleanly when neither is installed; all public functions raise
ImportError in that case.
"""
from __future__ import annotations

from .schemas import EegModelSummary

# ── Optional import guards ────────────────────────────────────────────────

try:
    import torch as _torch  # noqa: F401
    HAS_TORCH: bool = True
except ImportError:
    HAS_TORCH = False

try:
    if not HAS_TORCH:
        raise ImportError("torch is required by braindecode")
    import braindecode as _braindecode  # noqa: F401
    HAS_BRAINDECODE: bool = True
except ImportError:
    HAS_BRAINDECODE = False
    if HAS_TORCH:
        HAS_TORCH = False


# ── Public API ────────────────────────────────────────────────────────────

def build_eegnet(
    n_channels: int,
    n_classes: int,
    input_window_samples: int,
) -> EegModelSummary:
    """Build an EEGNet (or ShallowFBCSPNet fallback) and return summary.

    Parameters mirror braindecode.models.EEGNetv4 / ShallowFBCSPNet init.
    CPU only; no training.
    """
    if not HAS_BRAINDECODE:
        raise ImportError("Braindecode is not installed")

    import torch
    from braindecode import models as bd_models

    model_name: str
    model: torch.nn.Module

    if hasattr(bd_models, "EEGNetv4"):
        model = bd_models.EEGNetv4(
            n_chans=n_channels,
            n_outputs=n_classes,
            n_times=input_window_samples,
        )
        model_name = "EEGNetv4"
    else:
        model = bd_models.ShallowFBCSPNet(
            n_chans=n_channels,
            n_outputs=n_classes,
            n_times=input_window_samples,
        )
        model_name = "ShallowFBCSPNet"

    param_count = sum(p.numel() for p in model.parameters())
    layer_count = sum(1 for _ in model.modules())

    return EegModelSummary(
        model_name=model_name,
        n_channels=n_channels,
        n_classes=n_classes,
        input_window_samples=input_window_samples,
        param_count=param_count,
        layer_count=layer_count,
    )


def forward_pass(model_spec: dict, input_shape: tuple) -> dict:
    """Run a random float32 forward pass on CPU. No training.

    Parameters
    ----------
    model_spec:
        Dict representation of an EegModelSummary (from .model_dump()).
    input_shape:
        (batch, n_channels, n_timepoints)

    Returns
    -------
    dict with keys ``output_shape`` (list[int]) and ``device`` ("cpu").
    """
    if not HAS_BRAINDECODE:
        raise ImportError("Braindecode is not installed")

    import torch

    summary = EegModelSummary(**model_spec)
    model = _build_model_from_summary(summary)
    model.eval()

    x = torch.randn(*input_shape, dtype=torch.float32)
    with torch.no_grad():
        out = model(x)

    return {
        "output_shape": list(out.shape),
        "device": "cpu",
    }


def _build_model_from_summary(summary: EegModelSummary):
    """Re-construct the torch model from an EegModelSummary."""
    from braindecode import models as bd_models

    if summary.model_name == "EEGNetv4" and hasattr(bd_models, "EEGNetv4"):
        return bd_models.EEGNetv4(
            n_chans=summary.n_channels,
            n_outputs=summary.n_classes,
            n_times=summary.input_window_samples,
        )
    return bd_models.ShallowFBCSPNet(
        n_chans=summary.n_channels,
        n_outputs=summary.n_classes,
        n_times=summary.input_window_samples,
    )
