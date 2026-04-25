"""Session-to-session comparison utilities."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np

from .store import SessionData


@dataclass(frozen=True)
class ComparisonResult:
    """Computed deltas between two sessions (current - previous)."""

    patient_id: str
    curr_session_id: str
    prev_session_id: str
    channels: list[str]

    # Per-band, per-channel delta payloads
    spectral: dict[str, Any]

    # Connectivity deltas (summary scalars per band/method)
    connectivity: dict[str, Any]

    # Global / scalar deltas
    iapf_shift_hz: float | None
    tbr_delta: float | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def compare_sessions(curr: SessionData, prev: SessionData) -> ComparisonResult:
    """Compare two sessions and return a structured delta payload.

    Parameters
    ----------
    curr, prev : SessionData
        Current and previous sessions for the same patient.

    Returns
    -------
    ComparisonResult
        Contains per-band/per-channel deltas and summary longitudinal metrics.

    Raises
    ------
    ValueError
        If channel ordering (montage) or recording state mismatch is detected.
    """
    curr_ch = curr.channel_names
    prev_ch = prev.channel_names
    if curr_ch and prev_ch and curr_ch != prev_ch:
        raise ValueError("Montage mismatch: channel order differs between sessions.")
    state_c, state_p = curr.recording_state, prev.recording_state
    if state_c and state_p and state_c != state_p:
        raise ValueError("Recording state mismatch: eyes-open vs eyes-closed differs.")

    channels = curr_ch or prev_ch or _infer_channels(curr) or _infer_channels(prev)

    spectral_delta = _compare_spectral(curr, prev, channels)
    conn_delta = _compare_connectivity(curr, prev)
    iapf_shift = _iapf_shift(curr, prev)
    tbr_delta = _tbr_delta(curr, prev, channels)

    return ComparisonResult(
        patient_id=curr.patient_id,
        curr_session_id=curr.session_id,
        prev_session_id=prev.session_id,
        channels=list(channels),
        spectral=spectral_delta,
        connectivity=conn_delta,
        iapf_shift_hz=iapf_shift,
        tbr_delta=tbr_delta,
    )


def _infer_channels(sess: SessionData) -> list[str]:
    # Try a best-effort recovery from any band payload
    spec = (sess.features or {}).get("spectral") or {}
    bands = spec.get("bands") or {}
    for band_payload in (bands.values() if isinstance(bands, dict) else []):
        abs_map = (band_payload or {}).get("absolute_uv2") or {}
        if abs_map:
            return [str(k) for k in abs_map.keys()]
    return []


def _compare_spectral(curr: SessionData, prev: SessionData, channels: list[str]) -> dict[str, Any]:
    curr_feat = (curr.features or {}).get("spectral") or {}
    prev_feat = (prev.features or {}).get("spectral") or {}
    curr_z = (curr.zscores or {}).get("spectral") or {}
    prev_z = (prev.zscores or {}).get("spectral") or {}

    out: dict[str, Any] = {"bands": {}}
    curr_bands = curr_feat.get("bands") or {}
    prev_bands = prev_feat.get("bands") or {}
    band_names = sorted(set(curr_bands.keys()) | set(prev_bands.keys()))

    for band in band_names:
        out["bands"][band] = {
            "absolute_uv2": _delta_map(
                _get_map(curr_bands, band, "absolute_uv2"),
                _get_map(prev_bands, band, "absolute_uv2"),
                channels,
            ),
            "relative": _delta_map(
                _get_map(curr_bands, band, "relative"),
                _get_map(prev_bands, band, "relative"),
                channels,
            ),
            "z_absolute_uv2": _delta_map(
                _get_zmap(curr_z, band, "absolute_uv2"),
                _get_zmap(prev_z, band, "absolute_uv2"),
                channels,
            ),
            "z_relative": _delta_map(
                _get_zmap(curr_z, band, "relative"),
                _get_zmap(prev_z, band, "relative"),
                channels,
            ),
        }
    return out


def _get_map(bands: dict[str, Any], band: str, metric: str) -> dict[str, Any]:
    return ((bands.get(band) or {}).get(metric) or {}) if isinstance(bands, dict) else {}


def _get_zmap(zspectral: dict[str, Any], band: str, metric: str) -> dict[str, Any]:
    zb = (zspectral.get("bands") or {}) if isinstance(zspectral, dict) else {}
    return ((zb.get(band) or {}).get(metric) or {}) if isinstance(zb, dict) else {}


def _delta_map(
    curr_map: dict[str, Any],
    prev_map: dict[str, Any],
    channels: list[str],
) -> dict[str, Any]:
    """Per-channel delta/rel/z payload for a scalar channel map.

    Output shape:
        {ch: {"curr": x2, "prev": x1, "delta": d, "rel": d/|x1|}}
    """
    out: dict[str, Any] = {}
    for ch in channels:
        c = _to_float(curr_map.get(ch))
        p = _to_float(prev_map.get(ch))
        d = (c - p) if (c is not None and p is not None) else None
        rel = None
        if d is not None and p is not None and abs(p) > 1e-12:
            rel = d / abs(p)
        out[ch] = {"curr": c, "prev": p, "delta": d, "rel": rel}
    return out


def _compare_connectivity(curr: SessionData, prev: SessionData) -> dict[str, Any]:
    cconn = (curr.features or {}).get("connectivity") or {}
    pconn = (prev.features or {}).get("connectivity") or {}

    out: dict[str, Any] = {"wpli": {}, "coherence": {}}
    for method, key in (("wpli", "wpli"), ("coherence", "coherence")):
        cb = cconn.get(key) or {}
        pb = pconn.get(key) or {}
        for band in sorted(set(cb.keys()) | set(pb.keys())):
            cm = np.asarray(cb.get(band) or [], dtype=float)
            pm = np.asarray(pb.get(band) or [], dtype=float)
            if cm.size == 0 or pm.size == 0:
                out[method][band] = {"mean_abs_edge_delta": None, "fro_norm_delta": None}
                continue
            # Align shapes defensively
            n = min(cm.shape[0], pm.shape[0], cm.shape[1], pm.shape[1])
            if n <= 1:
                out[method][band] = {"mean_abs_edge_delta": None, "fro_norm_delta": None}
                continue
            cm2 = cm[:n, :n]
            pm2 = pm[:n, :n]
            diff = cm2 - pm2
            # ignore diagonal
            np.fill_diagonal(diff, 0.0)
            mean_abs = float(np.nanmean(np.abs(diff)))
            fro = float(np.linalg.norm(diff, ord="fro"))
            out[method][band] = {"mean_abs_edge_delta": mean_abs, "fro_norm_delta": fro}
    return out


def _iapf_shift(curr: SessionData, prev: SessionData) -> float | None:
    c = ((curr.features or {}).get("spectral") or {}).get("peak_alpha_freq") or {}
    p = ((prev.features or {}).get("spectral") or {}).get("peak_alpha_freq") or {}
    cvals = [_to_float(v) for v in (c.values() if isinstance(c, dict) else [])]
    pvals = [_to_float(v) for v in (p.values() if isinstance(p, dict) else [])]
    cvals = [v for v in cvals if v is not None and math.isfinite(v)]
    pvals = [v for v in pvals if v is not None and math.isfinite(v)]
    if not cvals or not pvals:
        return None
    return float(np.mean(cvals) - np.mean(pvals))


def _tbr_delta(curr: SessionData, prev: SessionData, channels: list[str]) -> float | None:
    """Theta/Beta ratio delta using mean absolute band power across channels."""
    def _band_mean(sess: SessionData, band: str) -> float | None:
        bands = (((sess.features or {}).get("spectral") or {}).get("bands") or {})
        abs_map = ((bands.get(band) or {}).get("absolute_uv2") or {}) if isinstance(bands, dict) else {}
        vals = [_to_float(abs_map.get(ch)) for ch in channels]
        vals = [v for v in vals if v is not None and math.isfinite(v)]
        return float(np.mean(vals)) if vals else None

    c_theta, c_beta = _band_mean(curr, "theta"), _band_mean(curr, "beta")
    p_theta, p_beta = _band_mean(prev, "theta"), _band_mean(prev, "beta")
    if c_theta is None or c_beta is None or p_theta is None or p_beta is None:
        return None
    if abs(c_beta) < 1e-12 or abs(p_beta) < 1e-12:
        return None
    c_tbr = c_theta / c_beta
    p_tbr = p_theta / p_beta
    return float(c_tbr - p_tbr)


def _to_float(v: Any) -> float | None:
    try:
        if v is None:
            return None
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None

