"""Visualizations for longitudinal change."""

from __future__ import annotations

import base64
import io
import logging
import math
from pathlib import Path
from typing import Any

import numpy as np

from .compare import compare_sessions
from .store import SessionData

log = logging.getLogger(__name__)


def plot_change_topomap(
    curr: SessionData,
    prev: SessionData,
    *,
    band: str,
    out_path: str | Path | None = None,
) -> str | Path | None:
    """Plot z-delta topomap for a band (curr - prev).

    Uses a fixed diverging scale of ±2 z for stable interpretation.

    Returns
    -------
    str | Path | None
        If `out_path` is None, returns a base64 data-URI string for embedding.
        Otherwise writes a PNG and returns its path. Returns None if deps missing.
    """
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import mne
    except Exception as exc:
        log.warning("Topomap deps unavailable (%s).", exc)
        return None

    comp = compare_sessions(curr, prev)
    band_payload = ((comp.spectral or {}).get("bands") or {}).get(band) or {}
    zabs = (band_payload.get("z_absolute_uv2") or {}) if isinstance(band_payload, dict) else {}
    ch_names = comp.channels
    if not ch_names:
        return None

    values = np.asarray([_to_float((zabs.get(ch) or {}).get("delta")) or 0.0 for ch in ch_names], dtype=float)

    montage = mne.channels.make_standard_montage("standard_1020")
    info = mne.create_info(ch_names=list(ch_names), sfreq=250.0, ch_types="eeg")
    info.set_montage(montage, on_missing="ignore")

    fig, ax = plt.subplots(figsize=(3.2, 3.2), dpi=130)
    mne.viz.plot_topomap(
        values,
        info,
        axes=ax,
        show=False,
        cmap="RdBu_r",
        vlim=(-2.0, 2.0),
    )
    ax.set_title(f"{band} Δz (curr-prev)")

    if out_path is not None:
        outp = Path(out_path)
        outp.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(outp, format="png", bbox_inches="tight")
        plt.close(fig)
        return outp

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def plot_trend_lines(
    sessions: list[SessionData],
    *,
    metric: str,
    band: str | None = None,
    channel: str | None = None,
    out_path: str | Path | None = None,
) -> str | Path | None:
    """Plot trend lines across >=3 sessions for selected summary metrics.

    Supported metrics
    -----------------
    - "iapf_mean_hz": mean peak alpha frequency (across available channels)
    - "tbr": theta/beta ratio (mean absolute band power)
    - "band_z_mean_abs": mean absolute z-score for a band (requires zscores)
    """
    if len(sessions) < 3:
        return None

    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as exc:
        log.warning("matplotlib unavailable for trend plot (%s).", exc)
        return None

    xs = list(range(1, len(sessions) + 1))
    ys: list[float | None] = []

    for s in sessions:
        if metric == "iapf_mean_hz":
            paf = ((s.features or {}).get("spectral") or {}).get("peak_alpha_freq") or {}
            vals = [_to_float(v) for v in (paf.values() if isinstance(paf, dict) else [])]
            vals = [v for v in vals if v is not None and math.isfinite(v)]
            ys.append(float(np.mean(vals)) if vals else None)
        elif metric == "tbr":
            ys.append(_tbr(s))
        elif metric == "band_z_mean_abs":
            if not band:
                ys.append(None)
                continue
            ys.append(_band_z_mean_abs(s, band=band, channel=channel))
        else:
            raise ValueError(f"Unsupported metric: {metric}")

    fig, ax = plt.subplots(figsize=(4.2, 2.6), dpi=140)
    y_plot = [y if y is not None else np.nan for y in ys]
    ax.plot(xs, y_plot, marker="o", linewidth=1.8)
    ax.set_xlabel("Session (ordered)")
    ax.set_ylabel(metric)
    title = metric
    if band:
        title += f" · {band}"
    if channel:
        title += f" · {channel}"
    ax.set_title(title)
    ax.grid(True, alpha=0.25)

    if out_path is not None:
        outp = Path(out_path)
        outp.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(outp, format="png", bbox_inches="tight")
        plt.close(fig)
        return outp

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _band_z_mean_abs(sess: SessionData, *, band: str, channel: str | None) -> float | None:
    z = (sess.zscores or {}).get("spectral") or {}
    zb = (z.get("bands") or {}) if isinstance(z, dict) else {}
    m = ((zb.get(band) or {}).get("absolute_uv2") or {}) if isinstance(zb, dict) else {}
    if channel:
        v = _to_float(m.get(channel))
        return abs(v) if v is not None else None
    vals = [_to_float(v) for v in (m.values() if isinstance(m, dict) else [])]
    vals = [v for v in vals if v is not None and math.isfinite(v)]
    return float(np.mean(np.abs(vals))) if vals else None


def _tbr(sess: SessionData) -> float | None:
    spec = (sess.features or {}).get("spectral") or {}
    bands = spec.get("bands") or {}
    if not isinstance(bands, dict):
        return None
    ch = sess.channel_names or []

    def _mean(band: str) -> float | None:
        abs_map = ((bands.get(band) or {}).get("absolute_uv2") or {})
        vals = [_to_float(abs_map.get(c)) for c in ch] if ch else [_to_float(v) for v in abs_map.values()]
        vals = [v for v in vals if v is not None and math.isfinite(v)]
        return float(np.mean(vals)) if vals else None

    theta = _mean("theta")
    beta = _mean("beta")
    if theta is None or beta is None or abs(beta) < 1e-12:
        return None
    return float(theta / beta)


def _to_float(v: Any) -> float | None:
    try:
        if v is None:
            return None
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None

