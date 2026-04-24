"""Frontal alpha asymmetry (FAA) — ln(right) − ln(left).

Positive values indicate left hypoactivation (right dominance), consistent with
the Davidson approach/withdrawal hypothesis. We compute the classic F4/F3 and
F8/F7 pairs using the absolute-power entries produced by
:mod:`deepsynaps_qeeg.features.spectral`.
"""
from __future__ import annotations

import logging
from math import log
from typing import Any

log_ = logging.getLogger(__name__)

_ASYMMETRY_PAIRS: list[tuple[str, str, str]] = [
    # (output_key, left_channel, right_channel)
    ("frontal_alpha_F3_F4", "F3", "F4"),
    ("frontal_alpha_F7_F8", "F7", "F8"),
]


def compute(
    features_spectral: dict[str, Any],
    ch_names: list[str],
) -> dict[str, float | None]:
    """Compute frontal alpha asymmetry values for the standard FAA pairs.

    Parameters
    ----------
    features_spectral : dict
        Output of :func:`deepsynaps_qeeg.features.spectral.compute`. Must
        contain ``features_spectral['bands']['alpha']['absolute_uv2']``
        keyed by channel name.
    ch_names : list of str
        Available channel names (used to detect missing electrodes).

    Returns
    -------
    dict
        ``{"frontal_alpha_F3_F4": float | None, "frontal_alpha_F7_F8": float | None}``.
        A value is ``None`` if either channel in the pair is absent or its
        absolute alpha power is non-positive.
    """
    try:
        alpha_abs = features_spectral["bands"]["alpha"]["absolute_uv2"]
    except (KeyError, TypeError) as exc:
        log_.warning("Alpha absolute-power missing from spectral features (%s).", exc)
        return {key: None for key, *_ in _ASYMMETRY_PAIRS}

    ch_set = set(ch_names)
    result: dict[str, float | None] = {}
    for key, left, right in _ASYMMETRY_PAIRS:
        if left not in ch_set or right not in ch_set:
            log_.info("Asymmetry pair %s missing channel(s); returning None.", (left, right))
            result[key] = None
            continue
        left_p = alpha_abs.get(left)
        right_p = alpha_abs.get(right)
        if left_p is None or right_p is None or left_p <= 0 or right_p <= 0:
            result[key] = None
            continue
        result[key] = float(log(right_p) - log(left_p))
    return result
