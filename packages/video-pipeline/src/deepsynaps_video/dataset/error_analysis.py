"""Slice metrics, confusion matrices, bias audits.

Output lands in ``video_eval_runs`` and is rendered by the dashboard
"Errors" tab. Slices we always compute:

- per task_id
- per camera type (smartphone vs clinic vs RTSP)
- per skin-tone bin (Fitzpatrick I-VI; from face-mesh skin-region pixels)
- per lighting bin (ambient lux estimate)
- per patient (no leakage check)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .manifest import ManifestRow


@dataclass
class SliceMetric:
    slice_name: str
    n: int
    accuracy: float | None = None
    mae: float | None = None
    extras: dict[str, Any] = field(default_factory=dict)


def evaluate(
    predictions: list[dict[str, Any]],
    manifest: list[ManifestRow],
) -> list[SliceMetric]:
    """Compute per-slice metrics from predictions + a labeled manifest.

    TODO(impl): join predictions to manifest by ``clip_id``; compute MAE
    on the 0–4 score and confusion-matrix-style metrics; produce slice
    breakdowns.
    """

    _ = (predictions, manifest)
    raise NotImplementedError


__all__ = ["SliceMetric", "evaluate"]
