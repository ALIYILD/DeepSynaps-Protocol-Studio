"""Per-window z-scoring for live qEEG monitoring."""

from __future__ import annotations

from typing import Any

from ..normative import zscore as zscore_mod


def zscore_window(
    features_frame: dict[str, Any],
    *,
    age: int | None,
    sex: str | None,
    norm_db: zscore_mod.NormativeDB | None = None,
) -> dict[str, Any]:
    """Compute normative z-scores for a single rolling frame.

    Parameters
    ----------
    features_frame : dict
        Output frame from :class:`deepsynaps_qeeg.streaming.rolling.RollingFeatures`.
    age, sex
        Passed to the shared normative engine.
    norm_db
        Optional db implementation; defaults to the toy CSV DB.
    """
    # The normative engine expects the full "features" dict with at least "spectral".
    spectral = (features_frame or {}).get("spectral", {}) or {}
    features = {"spectral": spectral}
    return zscore_mod.compute(features, age=age, sex=sex, db=norm_db)

