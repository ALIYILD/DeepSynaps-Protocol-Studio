from __future__ import annotations

from pathlib import Path
from typing import Any

from .loader import ModelSpec


def _require_torch() -> Any:
    try:
        import torch  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Model inference requires torch (and usually braindecode). "
            "This is intentionally not a hard dependency of the qEEG pipeline runtime."
        ) from exc
    return torch


def _build_model(model_class: str | None, *, n_times: int) -> Any:
    """Instantiate a model without importing training-only dependencies."""

    _require_torch()

    if model_class is None or model_class.lower() in ("deep4net", "braindecode.deep4net"):
        try:
            from braindecode.models import Deep4Net  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("braindecode is required to instantiate Deep4Net") from exc

        return Deep4Net(
            n_chans=19,
            n_outputs=2,
            n_times=n_times,
            final_conv_length="auto",
        )

    raise ValueError(f"Unknown model_class={model_class!r}")


def load_model_from_spec(spec: ModelSpec, weights_path: str | Path) -> Any:
    """Load a runtime model instance from a `ModelSpec` + weights path."""

    torch = _require_torch()
    weights_path = Path(weights_path)

    # Default window: 4s @ 256Hz, as in the training-stack decision record.
    n_times = int(4.0 * 256)
    if spec.metadata and "n_times" in spec.metadata:
        n_times = int(spec.metadata["n_times"])

    model = _build_model(spec.model_class, n_times=n_times)
    state = torch.load(str(weights_path), map_location="cpu")
    model.load_state_dict(state)
    model.eval()
    return model


def predict_likelihood(model: Any, eeg_window: Any, *, positive_index: int = 1) -> float:
    """Return \(P(y=positive)\) for a single EEG window tensor.

    `eeg_window` is expected to be shaped like (n_channels, n_times) or
    (1, n_channels, n_times); the exact shape depends on the chosen model.
    """

    torch = _require_torch()
    with torch.no_grad():
        x = eeg_window
        if hasattr(x, "dim") and x.dim() == 2:
            x = x.unsqueeze(0)
        logits = model(x)
        return torch.softmax(logits, dim=-1)[0, positive_index].item()

