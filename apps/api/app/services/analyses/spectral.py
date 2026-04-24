"""Spectral analyses — U-Shape, FOOOF, periodic/aperiodic, band peaks, SEF.

Registered analyses:
  spectral/u_shape
  spectral/fooof_decomposition
  spectral/periodic_aperiodic
  spectral/aperiodic_adjusted
  spectral/band_peak_frequencies
  spectral/spectral_edge_frequency
"""
from __future__ import annotations

from typing import Any

import numpy as np

from app.services.analyses._engine import register_analysis
from app.services.analyses._helpers import (
    DEFAULT_BANDS,
    compute_band_power_from_psd,
)


# ── 1. U-Shape Analysis ──────────────────────────────────────────────────────

@register_analysis("spectral", "u_shape", "U-Shape Analysis")
def u_shape(ctx: dict[str, Any]) -> dict[str, Any]:
    """Evaluate whether the power spectrum follows the expected U-shape.

    In healthy eyes-open EEG, power is high in delta, dips in theta/alpha,
    and rises again in beta — forming a U. Deviation from this pattern
    can indicate dysregulation.
    """
    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]

    results_per_channel: dict[str, Any] = {}
    band_order = ["delta", "theta", "alpha", "beta", "gamma"]
    band_ranges = {b: DEFAULT_BANDS[b] for b in band_order if b in DEFAULT_BANDS}

    for ch_idx, ch in enumerate(ch_names):
        band_powers = []
        for bname in band_order:
            if bname not in band_ranges:
                continue
            fmin, fmax = band_ranges[bname]
            bp = float(compute_band_power_from_psd(freqs, psd[ch_idx:ch_idx+1], fmin, fmax)[0])
            band_powers.append(bp)

        # Normalize to relative
        total = sum(band_powers) or 1.0
        relative = [bp / total for bp in band_powers]

        # U-shape score: expect dip at theta/alpha (indices 1,2) relative to delta and beta/gamma
        edges_avg = (relative[0] + relative[-1]) / 2  # delta + gamma average
        middle_avg = sum(relative[1:-1]) / max(len(relative) - 2, 1)  # theta + alpha + beta
        u_score = round(edges_avg - middle_avg, 4) if edges_avg > 0 else 0.0
        # Positive = U-shape present, negative = inverted

        results_per_channel[ch] = {
            "band_powers_relative": {band_order[i]: round(relative[i], 4) for i in range(len(relative))},
            "u_score": u_score,
            "u_shape_present": u_score > 0.02,
        }

    # Global summary
    scores = [v["u_score"] for v in results_per_channel.values()]
    avg_score = round(np.mean(scores), 4) if scores else 0.0
    u_present_count = sum(1 for v in results_per_channel.values() if v["u_shape_present"])

    return {
        "data": {
            "channels": results_per_channel,
            "mean_u_score": avg_score,
            "u_shape_present_count": u_present_count,
            "total_channels": len(ch_names),
        },
        "summary": f"U-shape present in {u_present_count}/{len(ch_names)} channels (mean score={avg_score})",
    }


# ── 2. FOOOF / specparam Decomposition ───────────────────────────────────────

@register_analysis("spectral", "fooof_decomposition", "FOOOF/Specparam Decomposition")
def fooof_decomposition(ctx: dict[str, Any]) -> dict[str, Any]:
    """Decompose PSD into aperiodic (1/f) and periodic (oscillatory) components
    using the specparam (FOOOF) library.
    """
    try:
        from specparam import SpectralModel
    except ImportError:
        raise RuntimeError("specparam library not installed — install with: pip install specparam")

    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]

    # Fit range: 1-45 Hz
    freq_range = [1, 45]
    results_per_channel: dict[str, Any] = {}

    for ch_idx, ch in enumerate(ch_names):
        sm = SpectralModel(
            peak_width_limits=[1, 8],
            max_n_peaks=6,
            min_peak_height=0.1,
            peak_threshold=2.0,
            aperiodic_mode="fixed",
        )
        try:
            sm.fit(freqs, psd[ch_idx], freq_range)

            aperiodic_params = sm.aperiodic_params_
            peaks = sm.peak_params_  # (n_peaks, 3): center_freq, power, bandwidth

            results_per_channel[ch] = {
                "aperiodic_offset": round(float(aperiodic_params[0]), 4),
                "aperiodic_exponent": round(float(aperiodic_params[1]), 4),
                "n_peaks": int(len(peaks)),
                "peaks": [
                    {
                        "center_freq_hz": round(float(p[0]), 2),
                        "power": round(float(p[1]), 4),
                        "bandwidth_hz": round(float(p[2]), 2),
                    }
                    for p in peaks
                ],
                "r_squared": round(float(sm.r_squared_), 4),
                "error": round(float(sm.error_), 4),
            }
        except Exception as exc:
            results_per_channel[ch] = {"error": str(exc)[:200]}

    # Summary: average exponent across channels
    exponents = [v["aperiodic_exponent"] for v in results_per_channel.values() if "aperiodic_exponent" in v]
    avg_exp = round(np.mean(exponents), 3) if exponents else 0.0

    return {
        "data": {"channels": results_per_channel, "mean_aperiodic_exponent": avg_exp},
        "summary": f"Mean aperiodic exponent: {avg_exp} (1/f slope) across {len(exponents)} channels",
    }


# ── 3. Periodic vs Aperiodic Parameters ──────────────────────────────────────

@register_analysis("spectral", "periodic_aperiodic", "Periodic vs Aperiodic Parameters")
def periodic_aperiodic(ctx: dict[str, Any]) -> dict[str, Any]:
    """Extract and compare periodic (oscillatory) vs aperiodic (1/f) power
    contributions per channel. Uses specparam for decomposition.
    """
    try:
        from specparam import SpectralModel
    except ImportError:
        raise RuntimeError("specparam library not installed")

    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]
    freq_range = [1, 45]

    channels_data: dict[str, Any] = {}

    for ch_idx, ch in enumerate(ch_names):
        sm = SpectralModel(peak_width_limits=[1, 8], max_n_peaks=6, aperiodic_mode="fixed")
        try:
            sm.fit(freqs, psd[ch_idx], freq_range)

            # Total power in range
            mask = (freqs >= freq_range[0]) & (freqs <= freq_range[1])
            freq_res = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0
            total_power = float(np.sum(psd[ch_idx, mask]) * freq_res)

            # Aperiodic power (modeled)
            aperiodic_fit = sm._ap_fit if hasattr(sm, '_ap_fit') else np.zeros_like(freqs)
            aperiodic_power = float(np.sum(10 ** aperiodic_fit[mask]) * freq_res) if len(aperiodic_fit) > 0 else 0.0

            # Periodic = total - aperiodic (approximate)
            periodic_power = max(total_power - aperiodic_power, 0.0)

            channels_data[ch] = {
                "total_power": round(total_power, 4),
                "aperiodic_power": round(aperiodic_power, 4),
                "periodic_power": round(periodic_power, 4),
                "periodic_ratio": round(periodic_power / total_power, 4) if total_power > 0 else 0.0,
                "aperiodic_exponent": round(float(sm.aperiodic_params_[1]), 4),
            }
        except Exception:
            channels_data[ch] = {"error": "fit_failed"}

    ratios = [v["periodic_ratio"] for v in channels_data.values() if "periodic_ratio" in v]
    avg_ratio = round(np.mean(ratios), 3) if ratios else 0.0

    return {
        "data": {"channels": channels_data, "mean_periodic_ratio": avg_ratio},
        "summary": f"Mean periodic/total power ratio: {avg_ratio:.1%}",
    }


# ── 4. Aperiodic-Adjusted Band Powers ────────────────────────────────────────

@register_analysis("spectral", "aperiodic_adjusted", "Aperiodic-Adjusted Band Powers")
def aperiodic_adjusted(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute band powers after removing the 1/f aperiodic component.

    This isolates true oscillatory contributions to each band, removing
    the confound of overall spectral tilt.
    """
    try:
        from specparam import SpectralModel
    except ImportError:
        raise RuntimeError("specparam library not installed")

    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]
    freq_range = [1, 45]

    channels_data: dict[str, Any] = {}

    for ch_idx, ch in enumerate(ch_names):
        sm = SpectralModel(peak_width_limits=[1, 8], max_n_peaks=6, aperiodic_mode="fixed")
        try:
            sm.fit(freqs, psd[ch_idx], freq_range)

            # Flatten spectrum: remove aperiodic component
            # The flattened spectrum = original - aperiodic fit (in log space)
            flat_spec = sm._peak_fit if hasattr(sm, '_peak_fit') else None
            if flat_spec is None:
                channels_data[ch] = {"error": "no_flat_spectrum"}
                continue

            # Compute adjusted band powers from the flattened spectrum
            bands_adjusted: dict[str, float] = {}
            freq_res = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0
            for bname, (fmin, fmax) in DEFAULT_BANDS.items():
                if hasattr(sm, 'freqs') and len(sm.freqs) > 0:
                    sm_mask = (sm.freqs >= fmin) & (sm.freqs <= fmax)
                    if np.any(sm_mask) and len(flat_spec) > 0:
                        adjusted = float(np.sum(10 ** flat_spec[sm_mask]) * freq_res)
                        bands_adjusted[bname] = round(adjusted, 4)
                        continue
                # fallback
                bands_adjusted[bname] = 0.0

            channels_data[ch] = {"adjusted_band_powers": bands_adjusted}
        except Exception:
            channels_data[ch] = {"error": "fit_failed"}

    return {
        "data": {"channels": channels_data},
        "summary": "Aperiodic-adjusted band powers computed for oscillatory isolation",
    }


# ── 5. Band Peak Frequencies ─────────────────────────────────────────────────

@register_analysis("spectral", "band_peak_frequencies", "Band Peak Frequencies")
def band_peak_frequencies(ctx: dict[str, Any]) -> dict[str, Any]:
    """Find the peak frequency within each standard band for every channel."""
    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]

    channels_data: dict[str, Any] = {}

    for ch_idx, ch in enumerate(ch_names):
        ch_peaks: dict[str, Any] = {}
        for bname, (fmin, fmax) in DEFAULT_BANDS.items():
            mask = (freqs >= fmin) & (freqs <= fmax)
            band_freqs = freqs[mask]
            band_psd = psd[ch_idx, mask]

            if len(band_psd) == 0:
                continue

            peak_idx = int(np.argmax(band_psd))
            peak_freq = float(band_freqs[peak_idx])
            peak_power = float(band_psd[peak_idx])

            ch_peaks[bname] = {
                "peak_freq_hz": round(peak_freq, 2),
                "peak_power_uv2hz": round(peak_power, 4),
            }

        channels_data[ch] = ch_peaks

    # Global alpha peak summary
    alpha_peaks = [
        v.get("alpha", {}).get("peak_freq_hz", 0)
        for v in channels_data.values()
        if v.get("alpha", {}).get("peak_freq_hz", 0) > 0
    ]
    avg_alpha = round(np.mean(alpha_peaks), 2) if alpha_peaks else 0.0

    return {
        "data": {"channels": channels_data, "mean_alpha_peak_hz": avg_alpha},
        "summary": f"Mean alpha peak frequency: {avg_alpha} Hz",
    }


# ── 6. Spectral Edge Frequency (SEF50, SEF95) ────────────────────────────────

@register_analysis("spectral", "spectral_edge_frequency", "Spectral Edge Frequency")
def spectral_edge_frequency(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute SEF50 and SEF95 — the frequency below which 50% / 95%
    of total spectral power resides (1-45 Hz range).

    SEF95 is used in anesthesia monitoring; lower SEF = more slow activity.
    """
    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]

    analysis_mask = (freqs >= 1.0) & (freqs <= 45.0)
    analysis_freqs = freqs[analysis_mask]
    freq_res = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0

    channels_data: dict[str, Any] = {}

    for ch_idx, ch in enumerate(ch_names):
        band_psd = psd[ch_idx, analysis_mask]
        cumulative = np.cumsum(band_psd * freq_res)
        total = cumulative[-1] if len(cumulative) > 0 else 1.0

        sef50 = 0.0
        sef95 = 0.0
        for pctile, target in [(0.50, "sef50"), (0.95, "sef95")]:
            idx = np.searchsorted(cumulative, total * pctile)
            idx = min(idx, len(analysis_freqs) - 1)
            if target == "sef50":
                sef50 = float(analysis_freqs[idx])
            else:
                sef95 = float(analysis_freqs[idx])

        channels_data[ch] = {
            "sef50_hz": round(sef50, 2),
            "sef95_hz": round(sef95, 2),
        }

    sef50_vals = [v["sef50_hz"] for v in channels_data.values()]
    sef95_vals = [v["sef95_hz"] for v in channels_data.values()]
    avg_sef50 = round(np.mean(sef50_vals), 2) if sef50_vals else 0.0
    avg_sef95 = round(np.mean(sef95_vals), 2) if sef95_vals else 0.0

    return {
        "data": {
            "channels": channels_data,
            "mean_sef50_hz": avg_sef50,
            "mean_sef95_hz": avg_sef95,
        },
        "summary": f"Mean SEF50={avg_sef50} Hz, SEF95={avg_sef95} Hz",
    }
