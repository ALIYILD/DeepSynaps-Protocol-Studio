"""Runtime model loading for qEEG likelihood models.

This package is intentionally lightweight:
- Training-side dependencies (NeuralSet/NeuralFetch/MLflow client) must not be
  required at runtime.
- Optional inference dependencies (torch/braindecode) are imported lazily.
"""

from __future__ import annotations

__all__ = ["download_weights", "load_model"]

from .loader import download_weights, load_model

