"""MAPIE conformal-interval wrapper for predictive heads.

The encoder itself emits embeddings, not predictions. But it ships a small
calibrated confidence head (e.g. signal-quality classifier) and exposes a
generic wrapper any downstream task head can reuse.

Coverage target: 1 - alpha. Default 90%.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class ConformalInterval:
    """A single prediction with conformal lower/upper bounds."""

    prediction: float
    lower: float
    upper: float
    alpha: float

    @property
    def coverage_target(self) -> float:
        return 1.0 - self.alpha


@dataclass
class ConformalSetClassification:
    """A classification prediction with a conformal label set."""

    top_label: str
    label_set: list[str]
    label_scores: dict[str, float]
    alpha: float


class ConformalWrapper:
    """Lightweight MAPIE-style split conformal wrapper.

    Real implementation delegates to mapie.MapieRegressor / MapieClassifier.
    This stand-in keeps the same public contract so downstream code is stable.
    """

    def __init__(self, alpha: float = 0.10) -> None:
        if not 0 < alpha < 1:
            raise ValueError(f"alpha must be in (0, 1), got {alpha}")
        self.alpha = alpha
        self._regression_q: float | None = None
        self._classification_threshold: float | None = None

    def calibrate_regression(self, y_true: np.ndarray, y_pred: np.ndarray) -> None:
        residuals = np.abs(y_true - y_pred)
        self._regression_q = float(np.quantile(residuals, 1 - self.alpha))

    def calibrate_classification(self, scores_calib: np.ndarray, y_calib: np.ndarray) -> None:
        # Score of the true class on each calibration row
        true_scores = scores_calib[np.arange(len(y_calib)), y_calib]
        self._classification_threshold = float(np.quantile(1 - true_scores, 1 - self.alpha))

    def predict_regression(self, y_pred: float) -> ConformalInterval:
        if self._regression_q is None:
            raise RuntimeError("call calibrate_regression() first")
        return ConformalInterval(
            prediction=float(y_pred),
            lower=float(y_pred) - self._regression_q,
            upper=float(y_pred) + self._regression_q,
            alpha=self.alpha,
        )

    def predict_classification(
        self,
        scores: np.ndarray,
        labels: list[str],
    ) -> ConformalSetClassification:
        if self._classification_threshold is None:
            raise RuntimeError("call calibrate_classification() first")
        if scores.ndim != 1 or len(scores) != len(labels):
            raise ValueError("scores must be 1-D with len == labels")
        in_set = [labels[i] for i, s in enumerate(scores) if (1 - s) <= self._classification_threshold]
        if not in_set:
            in_set = [labels[int(np.argmax(scores))]]
        return ConformalSetClassification(
            top_label=labels[int(np.argmax(scores))],
            label_set=in_set,
            label_scores={l: float(s) for l, s in zip(labels, scores, strict=True)},
            alpha=self.alpha,
        )

