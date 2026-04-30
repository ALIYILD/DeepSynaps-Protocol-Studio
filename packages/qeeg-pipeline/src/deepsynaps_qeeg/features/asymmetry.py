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
) -> dict[str, Any]:
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
        out: dict[str, float | None] = {key: None for key, *_ in _ASYMMETRY_PAIRS}
        out["confidence"] = {  # type: ignore[assignment]
            "level": "low",
            "rationale": "alpha-power source unavailable",
            "per_pair": {},
        }
        out["qc_flags"] = [{  # type: ignore[assignment]
            "code": "alpha_source_missing",
            "severity": "high",
            "message": "Spectral alpha absolute power unavailable; FAA cannot be computed.",
        }]
        return out

    # Pull spectral per-channel confidence if present so we can propagate it to
    # each FAA pair. This means the UI can show "FAA F3/F4 = +0.21 (low conf —
    # F3 had poor SNR)" instead of just a number.
    spectral_conf = (features_spectral.get("confidence") or {}).get("per_channel") or {}

    ch_set = set(ch_names)
    result: dict[str, float | None] = {}
    per_pair_conf: dict[str, dict[str, Any]] = {}
    qc_flags: list[dict[str, Any]] = []

    for key, left, right in _ASYMMETRY_PAIRS:
        if left not in ch_set or right not in ch_set:
            log_.info("Asymmetry pair %s missing channel(s); returning None.", (left, right))
            result[key] = None
            qc_flags.append({
                "code": "asymmetry_pair_missing_channel",
                "severity": "medium",
                "message": f"Asymmetry pair {left}/{right} missing channel(s) on this montage.",
                "affected_channels": [c for c in (left, right) if c not in ch_set],
                "pair": key,
            })
            per_pair_conf[key] = {"level": "unavailable", "reason": "missing_channel"}
            continue
        left_p = alpha_abs.get(left)
        right_p = alpha_abs.get(right)
        if left_p is None or right_p is None or left_p <= 0 or right_p <= 0:
            result[key] = None
            qc_flags.append({
                "code": "asymmetry_pair_invalid_power",
                "severity": "medium",
                "message": (
                    f"Asymmetry pair {left}/{right} had non-positive or missing alpha power; "
                    "value not computed."
                ),
                "affected_channels": [left, right],
                "pair": key,
            })
            per_pair_conf[key] = {"level": "unavailable", "reason": "invalid_power"}
            continue
        value = float(log(right_p) - log(left_p))
        result[key] = value

        # Propagate per-channel confidence: the pair is only as reliable as the
        # weaker of the two channels.
        left_c = (spectral_conf.get(left) or {}).get("level") or "moderate"
        right_c = (spectral_conf.get(right) or {}).get("level") or "moderate"
        order = {"low": 0, "moderate": 1, "high": 2, "unavailable": -1}
        worst = min(left_c, right_c, key=lambda lvl: order.get(lvl, 1))
        per_pair_conf[key] = {
            "level": worst,
            "left": {"channel": left, "level": left_c},
            "right": {"channel": right, "level": right_c},
            "value": value,
        }

    levels = [c.get("level") for c in per_pair_conf.values() if c.get("level") and c["level"] != "unavailable"]
    if not levels:
        overall = "low"
    elif "low" in levels:
        overall = "low"
    elif "moderate" in levels:
        overall = "moderate"
    else:
        overall = "high"

    result["confidence"] = {  # type: ignore[assignment]
        "level": overall,
        "per_pair": per_pair_conf,
        "rationale": "Min-of-pair channel confidence from spectral SNR + n_epochs + FOOOF R².",
    }
    result["qc_flags"] = qc_flags  # type: ignore[assignment]
    result["method_provenance"] = {  # type: ignore[assignment]
        "method": "ln(right_alpha_uv2) - ln(left_alpha_uv2)",
        "pairs": [{"key": k, "left": left, "right": r} for k, left, r in _ASYMMETRY_PAIRS],
        "reference": "Davidson approach/withdrawal; Coan & Allen (2004).",
    }
    return result
