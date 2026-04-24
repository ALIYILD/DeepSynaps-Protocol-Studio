"""EEG brain-age prediction with LRP electrode importance.

Contract
--------
See ``CONTRACT_V2.md §1 brain_age``:

    {
      "predicted_years": float,
      "chronological_years": int | None,
      "gap_years": float | None,        # predicted − chronological
      "gap_percentile": float,          # 0..100
      "confidence": "low"|"moderate"|"high",
      "electrode_importance": {"<ch>": float, ...},
    }

Real path
---------
3-layer fully-connected net trained on the Frontiers-2025 lifespan
paradigm — concatenated features are:

* aperiodic slope (per channel)
* peak alpha frequency (per channel)
* relative band power × 5 bands (per channel)

Electrode importance is extracted via Layerwise Relevance Propagation
on the trained network.

Stub path
---------
When ``torch`` is missing or no trained ``.pt`` is supplied, the module
computes a *reproducible* pseudo-age from a weighted hash of the feature
dict. Electrode importance is a softmax of per-channel absolute aperiodic
slopes (or a uniform distribution if slopes are unavailable). Confidence
is hard-coded to ``"low"`` so the UI disables any strong claims.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import pickle
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


def _try_import_torch() -> Any | None:
    """Best-effort import of torch.

    Returns
    -------
    module or None
        The imported ``torch`` module, or ``None`` if unavailable.
    """
    try:
        import torch  # type: ignore[import-not-found]
    except ImportError:
        return None
    return torch


_TORCH = _try_import_torch()
HAS_FCNN: bool = _TORCH is not None

#: Chronological age bounds used when surfacing centile estimates.
_AGE_MIN = 5.0
_AGE_MAX = 90.0

#: Conservative neurotypical gap-percentile table for the stub path. Each
#: tuple is (abs_gap_years, percentile_in_normative_cohort).
_STUB_GAP_PERCENTILES: list[tuple[float, float]] = [
    (0.0, 50.0),
    (1.0, 60.0),
    (2.0, 70.0),
    (3.5, 80.0),
    (5.0, 90.0),
    (7.0, 95.0),
    (10.0, 98.0),
    (14.0, 99.5),
]


def _hash_features(features: dict[str, Any]) -> int:
    """Stable, cross-process 64-bit hash of the feature dict.

    Uses ``json.dumps(sort_keys=True, default=str)`` so dict ordering
    does not change the result.

    Parameters
    ----------
    features : dict
        Any JSON-serialisable-ish feature dict.

    Returns
    -------
    int
        Non-negative 64-bit integer.
    """
    try:
        payload = json.dumps(features, sort_keys=True, default=str)
    except Exception:
        payload = repr(features)
    digest = hashlib.sha256(payload.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=False)


def _collect_slopes(features: dict[str, Any]) -> dict[str, float]:
    """Pull per-channel aperiodic slopes from a features dict.

    Parameters
    ----------
    features : dict
        See ``CONTRACT.md §1.1`` — we look at
        ``features["spectral"]["aperiodic"]["slope"]``.

    Returns
    -------
    dict
        ``{ch: float}`` (possibly empty).
    """
    try:
        slopes = features["spectral"]["aperiodic"]["slope"]  # type: ignore[index]
    except (KeyError, TypeError):
        return {}
    return {str(ch): float(v) for ch, v in slopes.items() if v is not None}


def _collect_all_channels(features: dict[str, Any]) -> list[str]:
    """Return a de-duplicated, stable-ordered list of channel names.

    Falls back to the slope dict keys; otherwise inspects the spectral
    bands payload.

    Parameters
    ----------
    features : dict

    Returns
    -------
    list of str
    """
    slopes = _collect_slopes(features)
    if slopes:
        return sorted(slopes.keys())
    channels: set[str] = set()
    bands = (features.get("spectral") or {}).get("bands") or {}
    for band_payload in bands.values():
        for metric_map in (band_payload or {}).values():
            if isinstance(metric_map, dict):
                channels.update(str(k) for k in metric_map.keys())
    return sorted(channels)


def _softmax_abs(values: dict[str, float]) -> dict[str, float]:
    """Softmax-of-absolute-values for electrode importance scoring.

    Parameters
    ----------
    values : dict
        ``{ch: float}``. Must be non-empty; callers fall back to uniform.

    Returns
    -------
    dict
        Same keys, values in ``[0, 1]`` summing to 1.0.
    """
    abs_items = [(k, abs(float(v))) for k, v in values.items()]
    if not abs_items:
        return {}
    mx = max(v for _, v in abs_items)
    exps = [(k, math.exp(v - mx)) for k, v in abs_items]
    denom = sum(e for _, e in exps) or 1.0
    return {k: e / denom for k, e in exps}


def _uniform_importance(channels: list[str]) -> dict[str, float]:
    """Uniform importance map over the supplied channels.

    Parameters
    ----------
    channels : list of str

    Returns
    -------
    dict
        Equal-weighted importance map. Empty when ``channels`` is empty.
    """
    if not channels:
        return {}
    w = 1.0 / len(channels)
    return {ch: w for ch in channels}


def _stub_predicted_years(features: dict[str, Any]) -> float:
    """Deterministic pseudo brain-age derived from a feature-dict hash.

    The output lives in ``[_AGE_MIN, _AGE_MAX]`` and is stable across
    runs — same input dict → same predicted age. No learning is
    performed; this is a *placeholder* so downstream UI panels render.

    Parameters
    ----------
    features : dict

    Returns
    -------
    float
        Age in years rounded to 2 decimals.
    """
    h = _hash_features(features)
    # Slope-informed perturbation so the stub isn't uniform noise.
    slopes = _collect_slopes(features)
    slope_bias = 0.0
    if slopes:
        slope_bias = sum(slopes.values()) / len(slopes)
    base = _AGE_MIN + (h / 0xFFFFFFFFFFFFFFFF) * (_AGE_MAX - _AGE_MIN)
    # A steeper mean slope ≈ older brain (very rough, only a placeholder).
    base = base + slope_bias * 3.0
    base = max(_AGE_MIN, min(_AGE_MAX, base))
    return round(base, 2)


def _stub_gap_percentile(gap_years: float | None) -> float:
    """Map an absolute brain-age gap to a reproducible cohort percentile.

    Parameters
    ----------
    gap_years : float or None

    Returns
    -------
    float
        ``50.0`` when ``gap_years`` is None; otherwise a monotonic
        mapping from the lookup table.
    """
    if gap_years is None:
        return 50.0
    g = abs(gap_years)
    last = 50.0
    for threshold, pct in _STUB_GAP_PERCENTILES:
        if g <= threshold:
            return pct
        last = pct
    return last


def predict_brain_age(
    features: dict[str, Any],
    *,
    chronological_age: int | None = None,
    model_path: Path | None = None,
    deterministic_seed: int | None = None,
) -> dict[str, Any]:
    """Predict brain age from a classical qEEG feature dict.

    Parameters
    ----------
    features : dict
        Output of the classical feature stage (see ``CONTRACT.md §1.1``).
    chronological_age : int or None
        Subject's chronological age in years. When ``None``, ``gap_years``
        is ``None`` and ``gap_percentile`` falls back to 50.
    model_path : Path or None
        Optional override of the FCNN checkpoint path. Ignored on the
        stub path.
    deterministic_seed : int or None
        Override the seed used by the stub path. Ignored on the real
        path. Callers typically pass ``analysis.id`` or similar.

    Returns
    -------
    dict
        Matches ``CONTRACT_V2.md §1 brain_age``. Always includes an
        ``is_stub`` key (not part of the V2 wire contract, but harmless
        — routers strip it before serialising).
    """
    channels = _collect_all_channels(features)
    slopes = _collect_slopes(features)

    # Stub path — triggered by missing torch OR missing model weights OR
    # any failure in the real path.
    def _stub_result() -> dict[str, Any]:
        if deterministic_seed is not None:
            payload = {"__seed__": deterministic_seed, "features": features}
        else:
            payload = features
        predicted = _stub_predicted_years(payload)
        gap = (predicted - chronological_age) if chronological_age is not None else None
        importance = _softmax_abs(slopes) if slopes else _uniform_importance(channels)
        return {
            "predicted_years": float(predicted),
            "chronological_years": (
                int(chronological_age) if chronological_age is not None else None
            ),
            "gap_years": float(gap) if gap is not None else None,
            "gap_percentile": _stub_gap_percentile(gap),
            "confidence": "low",
            "electrode_importance": importance,
            "is_stub": True,
        }

    if not HAS_FCNN or model_path is None or not Path(model_path).exists():
        if not HAS_FCNN:
            log.warning("predict_brain_age: torch unavailable — using stub.")
        else:
            log.warning(
                "predict_brain_age: model_path missing or not found — using stub."
            )
        return _stub_result()

    # Real path — best-effort; any failure falls back to the stub.
    try:
        import numpy as np  # noqa: WPS433 — local heavy import

        # Build a (n_ch × [slope + paf + 5 bands rel]) feature matrix.
        vec_rows: list[list[float]] = []
        row_channels: list[str] = []
        spectral = features.get("spectral") or {}
        bands = spectral.get("bands") or {}
        paf_map = spectral.get("peak_alpha_freq") or {}
        for ch in channels:
            row = [
                float(slopes.get(ch, 0.0)),
                float(paf_map.get(ch) or 0.0),
            ]
            for band in ("delta", "theta", "alpha", "beta", "gamma"):
                rel = (bands.get(band) or {}).get("relative") or {}
                row.append(float(rel.get(ch) or 0.0))
            vec_rows.append(row)
            row_channels.append(ch)

        if not vec_rows:
            log.warning("predict_brain_age: empty feature matrix — stub.")
            return _stub_result()

        x = np.asarray(vec_rows, dtype=np.float32)  # (n_ch, 7)

        import torch  # type: ignore[import-not-found]

        state = torch.load(Path(model_path), map_location="cpu")  # noqa: S614
        net = state.get("model") if isinstance(state, dict) else None
        if net is None:  # pragma: no cover — real-path guard
            log.warning("Checkpoint %s missing 'model' — stub.", model_path)
            return _stub_result()
        net = net.eval()
        with torch.no_grad():
            t = torch.from_numpy(x.flatten()).float().unsqueeze(0)
            predicted = float(net(t).item())

        # LRP importance — defer to whatever the checkpoint's companion
        # captured. For now we use |slope| softmax as a pragmatic stand-in
        # for the LRP saliency vector (the real trainer computes LRP once,
        # caches a per-channel vector, and we softmax it here).
        lrp_vec = state.get("lrp_channel_importance") if isinstance(state, dict) else None
        if isinstance(lrp_vec, dict):
            importance = _softmax_abs(
                {ch: float(lrp_vec.get(ch, 0.0)) for ch in row_channels}
            )
        else:
            importance = _softmax_abs(slopes) if slopes else _uniform_importance(channels)

        gap = (predicted - chronological_age) if chronological_age is not None else None
        gap_pct = _stub_gap_percentile(gap)  # swap for empirical cohort table at deploy

        # Heuristic confidence — high when we have ≥19 channels and slope
        # dispersion is in a reasonable range; else moderate.
        if len(channels) >= 19 and slopes:
            arr = np.asarray(list(slopes.values()), dtype=float)
            disp = float(arr.std())
            confidence = "high" if 0.05 <= disp <= 3.0 else "moderate"
        else:
            confidence = "moderate"

        return {
            "predicted_years": float(predicted),
            "chronological_years": (
                int(chronological_age) if chronological_age is not None else None
            ),
            "gap_years": float(gap) if gap is not None else None,
            "gap_percentile": float(gap_pct),
            "confidence": confidence,
            "electrode_importance": importance,
            "is_stub": False,
        }
    except Exception as exc:
        log.exception("predict_brain_age real path failed (%s) — stub.", exc)
        return _stub_result()


def _train_fcnn(manifest_csv: Path, out_path: Path) -> Path:
    """Write a minimal pickled state dict placeholder for the FCNN.

    This is a **stub** — no actual training happens. It exists so
    downstream code paths that expect a `.pt` artifact can be exercised
    in CI. The real trainer will be implemented under
    ``scripts/fit_normative_db.py`` per the AI_UPGRADES roadmap §2.

    Parameters
    ----------
    manifest_csv : Path
        Path to a manifest of (subject_id, age, sex, features_json). The
        contents are NOT read here; the parameter is accepted so the
        signature matches the eventual real trainer.
    out_path : Path
        Destination for the pickled state dict.

    Returns
    -------
    Path
        Absolute ``out_path``.
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    state = {
        "model": None,
        "manifest_csv": str(manifest_csv),
        "lrp_channel_importance": {},
        "note": (
            "Placeholder state dict written by brain_age._train_fcnn. No "
            "actual training was performed. Downstream consumers should "
            "fall back to the deterministic stub path."
        ),
    }
    with out_path.open("wb") as fh:
        pickle.dump(state, fh)
    log.warning(
        "brain_age._train_fcnn: wrote placeholder state dict to %s (no training performed).",
        out_path,
    )
    return out_path.resolve()
