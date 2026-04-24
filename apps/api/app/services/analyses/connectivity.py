"""Connectivity analyses — coherence, disconnection flags, PLI, wPLI.

Registered analyses:
  connectivity/coherence_matrix
  connectivity/disconnection_flags
  connectivity/pli_icoh
  connectivity/wpli
"""
from __future__ import annotations

import itertools
from typing import Any

import numpy as np
from scipy.signal import csd, welch

from app.services.analyses._engine import register_analysis
from app.services.analyses._helpers import DEFAULT_BANDS


def _compute_coherence_pair(
    data_x: np.ndarray,
    data_y: np.ndarray,
    sfreq: float,
    nperseg: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute magnitude-squared coherence between two channels."""
    freqs_xy, pxy = csd(data_x, data_y, fs=sfreq, nperseg=nperseg)
    _, pxx = welch(data_x, fs=sfreq, nperseg=nperseg)
    _, pyy = welch(data_y, fs=sfreq, nperseg=nperseg)
    # MSC = |Pxy|^2 / (Pxx * Pyy)
    denom = pxx * pyy
    denom[denom == 0] = 1e-30
    coh = np.abs(pxy) ** 2 / denom
    return freqs_xy, coh


# ── 11. Coherence Matrix ─────────────────────────────────────────────────────

@register_analysis("connectivity", "coherence_matrix", "Coherence Matrix")
def coherence_matrix(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute magnitude-squared coherence between all channel pairs
    for each frequency band.
    """
    data = ctx["data"]
    sfreq = ctx["sfreq"]
    ch_names = ctx["ch_names"]
    n_ch = len(ch_names)

    # Use representative subset if too many channels (>19 = unusual)
    max_channels = 19
    if n_ch > max_channels:
        ch_indices = list(range(max_channels))
    else:
        ch_indices = list(range(n_ch))

    nperseg = int(2.0 * sfreq)
    if nperseg > data.shape[1]:
        nperseg = data.shape[1]

    # Compute per-band coherence matrix
    band_matrices: dict[str, list[list[float]]] = {}

    for bname, (fmin, fmax) in DEFAULT_BANDS.items():
        matrix = np.zeros((len(ch_indices), len(ch_indices)))
        np.fill_diagonal(matrix, 1.0)

        for i, j in itertools.combinations(range(len(ch_indices)), 2):
            ci, cj = ch_indices[i], ch_indices[j]
            freqs_coh, coh = _compute_coherence_pair(data[ci], data[cj], sfreq, nperseg)
            band_mask = (freqs_coh >= fmin) & (freqs_coh <= fmax)
            mean_coh = float(np.mean(coh[band_mask])) if np.any(band_mask) else 0.0
            matrix[i, j] = mean_coh
            matrix[j, i] = mean_coh

        band_matrices[bname] = [[round(matrix[i, j], 3) for j in range(len(ch_indices))]
                                 for i in range(len(ch_indices))]

    used_channels = [ch_names[i] for i in ch_indices]

    return {
        "data": {
            "channels": used_channels,
            "bands": band_matrices,
        },
        "summary": f"Coherence matrix computed for {len(used_channels)} channels across {len(band_matrices)} bands",
    }


# ── 12. Disconnection Flags ──────────────────────────────────────────────────

@register_analysis("connectivity", "disconnection_flags", "Disconnection Flags")
def disconnection_flags(ctx: dict[str, Any]) -> dict[str, Any]:
    """Identify channel pairs with abnormally low coherence (potential
    disconnection markers) in key bands.

    A pair is flagged if coherence < 0.15 in alpha or beta bands.
    """
    data = ctx["data"]
    sfreq = ctx["sfreq"]
    ch_names = ctx["ch_names"]
    n_ch = len(ch_names)

    nperseg = int(2.0 * sfreq)
    if nperseg > data.shape[1]:
        nperseg = data.shape[1]

    check_bands = {"alpha": (8.0, 12.0), "beta": (12.0, 30.0)}
    flags: list[dict[str, Any]] = []
    total_pairs = 0

    for i, j in itertools.combinations(range(min(n_ch, 19)), 2):
        total_pairs += 1
        freqs_coh, coh = _compute_coherence_pair(data[i], data[j], sfreq, nperseg)

        for bname, (fmin, fmax) in check_bands.items():
            band_mask = (freqs_coh >= fmin) & (freqs_coh <= fmax)
            mean_coh = float(np.mean(coh[band_mask])) if np.any(band_mask) else 0.0

            if mean_coh < 0.15:
                flags.append({
                    "ch1": ch_names[i],
                    "ch2": ch_names[j],
                    "band": bname,
                    "coherence": round(mean_coh, 3),
                })

    return {
        "data": {
            "flags": flags,
            "total_pairs_checked": total_pairs,
            "flagged_count": len(flags),
        },
        "summary": f"{len(flags)} disconnection flags from {total_pairs} pairs",
    }


# ── 13. Phase Lag Index (PLI) + Imaginary Coherence ──────────────────────────

@register_analysis("connectivity", "pli_icoh", "Phase Lag Index & Imaginary Coherence")
def pli_icoh(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute Phase Lag Index (PLI) and imaginary coherence (iCoh)
    for all channel pairs in the alpha band.

    PLI is robust to volume conduction (ignores zero-lag connectivity).
    iCoh = imaginary part of coherency — also volume-conduction resistant.
    """
    data = ctx["data"]
    sfreq = ctx["sfreq"]
    ch_names = ctx["ch_names"]
    n_ch = min(len(ch_names), 19)

    nperseg = int(2.0 * sfreq)
    if nperseg > data.shape[1]:
        nperseg = data.shape[1]

    alpha_range = (8.0, 12.0)
    pairs_data: dict[str, Any] = {}

    for i, j in itertools.combinations(range(n_ch), 2):
        freqs_xy, pxy = csd(data[i], data[j], fs=sfreq, nperseg=nperseg)
        _, pxx = welch(data[i], fs=sfreq, nperseg=nperseg)
        _, pyy = welch(data[j], fs=sfreq, nperseg=nperseg)

        band_mask = (freqs_xy >= alpha_range[0]) & (freqs_xy <= alpha_range[1])
        if not np.any(band_mask):
            continue

        pxy_band = pxy[band_mask]

        # PLI = mean(sign(imag(cross-spectrum)))
        pli = float(np.abs(np.mean(np.sign(np.imag(pxy_band)))))

        # iCoh = imag(coherency) = imag(Pxy / sqrt(Pxx * Pyy))
        denom = np.sqrt(pxx[band_mask] * pyy[band_mask])
        denom[denom == 0] = 1e-30
        coherency = pxy_band / denom
        icoh = float(np.mean(np.abs(np.imag(coherency))))

        pair_key = f"{ch_names[i]}_{ch_names[j]}"
        pairs_data[pair_key] = {
            "pli": round(pli, 3),
            "icoh": round(icoh, 3),
        }

    # Mean PLI
    pli_vals = [v["pli"] for v in pairs_data.values()]
    mean_pli = round(np.mean(pli_vals), 3) if pli_vals else 0.0

    return {
        "data": {
            "band": "alpha",
            "pairs": pairs_data,
            "mean_pli": mean_pli,
            "total_pairs": len(pairs_data),
        },
        "summary": f"Mean alpha PLI={mean_pli} across {len(pairs_data)} pairs",
    }


# ── 14. Weighted PLI (wPLI) ──────────────────────────────────────────────────

@register_analysis("connectivity", "wpli", "Weighted Phase Lag Index")
def wpli(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute weighted Phase Lag Index (wPLI) for all channel pairs.

    wPLI weights by the magnitude of the imaginary part, reducing
    noise sensitivity while maintaining volume conduction rejection.
    Computed for alpha and beta bands.
    """
    data = ctx["data"]
    sfreq = ctx["sfreq"]
    ch_names = ctx["ch_names"]
    n_ch = min(len(ch_names), 19)

    # Epoch the data for trial-based wPLI estimation
    epoch_sec = 2.0
    epoch_samples = int(epoch_sec * sfreq)
    n_epochs = data.shape[1] // epoch_samples

    if n_epochs < 3:
        return {
            "data": {"error": "insufficient_data", "n_epochs": n_epochs},
            "summary": "Insufficient data for wPLI (need >= 3 epochs)",
        }

    bands_to_compute = {"alpha": (8.0, 12.0), "beta": (12.0, 30.0)}
    band_results: dict[str, Any] = {}

    nperseg = epoch_samples

    for bname, (fmin, fmax) in bands_to_compute.items():
        pairs_wpli: dict[str, float] = {}

        for i, j in itertools.combinations(range(n_ch), 2):
            # Compute cross-spectrum per epoch and average
            imag_parts = []
            for ep in range(n_epochs):
                s = ep * epoch_samples
                e = s + epoch_samples
                freqs_xy, pxy = csd(data[i, s:e], data[j, s:e], fs=sfreq, nperseg=min(nperseg, e - s))
                band_mask = (freqs_xy >= fmin) & (freqs_xy <= fmax)
                if np.any(band_mask):
                    imag_parts.append(np.imag(pxy[band_mask]))

            if not imag_parts:
                continue

            imag_stack = np.array(imag_parts)  # (n_epochs, n_freqs_in_band)
            # wPLI = |mean(imag(Pxy))| / mean(|imag(Pxy)|)
            numerator = np.abs(np.mean(imag_stack, axis=0))
            denominator = np.mean(np.abs(imag_stack), axis=0)
            denominator[denominator == 0] = 1e-30
            wpli_vals = numerator / denominator
            mean_wpli = float(np.mean(wpli_vals))

            pair_key = f"{ch_names[i]}_{ch_names[j]}"
            pairs_wpli[pair_key] = round(mean_wpli, 3)

        vals = list(pairs_wpli.values())
        band_results[bname] = {
            "pairs": pairs_wpli,
            "mean_wpli": round(np.mean(vals), 3) if vals else 0.0,
        }

    return {
        "data": {"bands": band_results, "n_epochs": n_epochs},
        "summary": f"wPLI computed across {n_epochs} epochs for alpha/beta bands",
    }
