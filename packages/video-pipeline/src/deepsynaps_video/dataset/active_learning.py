"""Active-learning sampling strategies for the clinician review queue."""

from __future__ import annotations

from typing import Any


def sample_uncertainty(predictions: list[dict[str, Any]], *, k: int) -> list[str]:
    """Return ``k`` clip_ids with the highest score uncertainty. TODO(impl)."""

    _ = (predictions, k)
    raise NotImplementedError


def sample_disagreement(
    predictions_a: list[dict[str, Any]],
    predictions_b: list[dict[str, Any]],
    *,
    k: int,
) -> list[str]:
    """Top-``k`` clips where two model bundles disagree most. TODO(impl)."""

    _ = (predictions_a, predictions_b, k)
    raise NotImplementedError


__all__ = ["sample_disagreement", "sample_uncertainty"]
