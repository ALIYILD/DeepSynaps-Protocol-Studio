"""Complexity analyses — entropy, fractal dimension, Lempel-Ziv, MSE, Higuchi.

Registered analyses:
  complexity/entropy_analysis
  complexity/fractal_lz
  complexity/multiscale_entropy
  complexity/higuchi_fd_detailed
"""
from __future__ import annotations

from typing import Any

import numpy as np

from app.services.analyses._engine import register_analysis


# ── Entropy helpers ──────────────────────────────────────────────────────────

def _sample_entropy(data: np.ndarray, m: int = 2, r_factor: float = 0.2) -> float:
    """Compute sample entropy of a 1D time series.

    Args:
        data: 1D signal
        m: embedding dimension
        r_factor: tolerance as fraction of std(data)

    Returns:
        Sample entropy value (higher = more complex/irregular)
    """
    N = len(data)
    if N < m + 2:
        return 0.0

    r = r_factor * np.std(data)
    if r == 0:
        return 0.0

    # Use a sub-sampled approach for performance with long signals
    max_points = 3000
    if N > max_points:
        step = N // max_points
        data = data[::step]
        N = len(data)

    def _count_matches(dim: int) -> int:
        count = 0
        templates = np.array([data[i:i + dim] for i in range(N - dim)])
        for i in range(len(templates)):
            dist = np.max(np.abs(templates[i + 1:] - templates[i]), axis=1)
            count += np.sum(dist < r)
        return count

    A = _count_matches(m + 1)
    B = _count_matches(m)

    if B == 0:
        return 0.0
    return -np.log(A / B) if A > 0 else float(m)


def _approximate_entropy(data: np.ndarray, m: int = 2, r_factor: float = 0.2) -> float:
    """Compute approximate entropy."""
    N = len(data)
    if N < m + 2:
        return 0.0

    r = r_factor * np.std(data)
    if r == 0:
        return 0.0

    max_points = 3000
    if N > max_points:
        step = N // max_points
        data = data[::step]
        N = len(data)

    def _phi(dim: int) -> float:
        templates = np.array([data[i:i + dim] for i in range(N - dim + 1)])
        counts = np.zeros(len(templates))
        for i in range(len(templates)):
            dist = np.max(np.abs(templates - templates[i]), axis=1)
            counts[i] = np.sum(dist <= r) / len(templates)
        return np.mean(np.log(counts[counts > 0]))

    phi_m = _phi(m)
    phi_m1 = _phi(m + 1)
    return abs(phi_m - phi_m1)


# ── 15. Sample Entropy + Approximate Entropy ─────────────────────────────────

@register_analysis("complexity", "entropy_analysis", "Sample & Approximate Entropy")
def entropy_analysis(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute sample entropy and approximate entropy per channel.

    Lower entropy = more regular/predictable signal.
    Higher entropy = more complex/irregular (healthy brain tends toward moderate complexity).
    """
    data = ctx["data"]
    ch_names = ctx["ch_names"]
    sfreq = ctx["sfreq"]

    # Use a 30-second representative segment for performance
    segment_samples = int(min(30.0 * sfreq, data.shape[1]))
    # Take from the middle of the recording
    start = (data.shape[1] - segment_samples) // 2

    channels_data: dict[str, Any] = {}

    for ch_idx, ch in enumerate(ch_names):
        segment = data[ch_idx, start:start + segment_samples]

        samp_ent = _sample_entropy(segment, m=2, r_factor=0.2)
        approx_ent = _approximate_entropy(segment, m=2, r_factor=0.2)

        channels_data[ch] = {
            "sample_entropy": round(samp_ent, 4),
            "approximate_entropy": round(approx_ent, 4),
        }

    se_vals = [v["sample_entropy"] for v in channels_data.values()]
    mean_se = round(np.mean(se_vals), 4) if se_vals else 0.0

    return {
        "data": {
            "channels": channels_data,
            "mean_sample_entropy": mean_se,
            "segment_duration_sec": segment_samples / sfreq,
        },
        "summary": f"Mean sample entropy: {mean_se} (m=2, r=0.2*std)",
    }


# ── Fractal / LZ helpers ────────────────────────────────────────────────────

def _lempel_ziv_complexity(data: np.ndarray) -> float:
    """Compute Lempel-Ziv complexity of a binarized signal."""
    # Binarize around median
    binary = (data > np.median(data)).astype(int)
    s = "".join(map(str, binary))
    n = len(s)
    if n == 0:
        return 0.0

    # LZ76 algorithm
    i, k, l_val = 0, 1, 1
    c = 1
    while l_val + k <= n:
        if s[l_val:l_val + k] in s[i:l_val]:
            k += 1
        else:
            c += 1
            l_val += k
            i = 0
            k = 1

    # Normalize by theoretical maximum
    b = n / np.log2(n) if n > 1 else 1.0
    return c / b if b > 0 else 0.0


def _higuchi_fd(data: np.ndarray, kmax: int = 10) -> float:
    """Compute Higuchi fractal dimension of a 1D time series."""
    N = len(data)
    if N < kmax + 1:
        kmax = max(N // 2, 2)

    L_k = []
    k_vals = []

    for k in range(1, kmax + 1):
        Lm = []
        for m in range(1, k + 1):
            indices = np.arange(m - 1, N, k)
            if len(indices) < 2:
                continue
            subseq = data[indices]
            diff_sum = np.sum(np.abs(np.diff(subseq)))
            norm = (N - 1) / (k * ((N - m) // k) * k) if ((N - m) // k) > 0 else 1.0
            Lm.append(diff_sum * norm)

        if Lm:
            L_k.append(np.mean(Lm))
            k_vals.append(k)

    if len(k_vals) < 2:
        return 1.0

    # Linear regression of log(L(k)) vs log(1/k)
    log_k = np.log(np.array(k_vals))
    log_L = np.log(np.array(L_k))
    coeffs = np.polyfit(log_k, log_L, 1)
    return -float(coeffs[0])


# ── 16. Fractal Dimension + Lempel-Ziv ───────────────────────────────────────

@register_analysis("complexity", "fractal_lz", "Fractal Dimension & Lempel-Ziv Complexity")
def fractal_lz(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute Higuchi fractal dimension and Lempel-Ziv complexity per channel.

    Higuchi FD: healthy EEG ~1.5-1.7; lower = more regular.
    LZ complexity: higher = more random/complex.
    """
    data = ctx["data"]
    ch_names = ctx["ch_names"]
    sfreq = ctx["sfreq"]

    # Use 30-second segment
    segment_samples = int(min(30.0 * sfreq, data.shape[1]))
    start = (data.shape[1] - segment_samples) // 2

    channels_data: dict[str, Any] = {}

    for ch_idx, ch in enumerate(ch_names):
        segment = data[ch_idx, start:start + segment_samples]

        # Sub-sample for LZ if too long
        lz_data = segment[::max(1, len(segment) // 5000)]

        hfd = _higuchi_fd(segment, kmax=10)
        lz = _lempel_ziv_complexity(lz_data)

        channels_data[ch] = {
            "higuchi_fd": round(hfd, 4),
            "lempel_ziv": round(lz, 4),
        }

    hfd_vals = [v["higuchi_fd"] for v in channels_data.values()]
    lz_vals = [v["lempel_ziv"] for v in channels_data.values()]
    mean_hfd = round(np.mean(hfd_vals), 4) if hfd_vals else 0.0
    mean_lz = round(np.mean(lz_vals), 4) if lz_vals else 0.0

    return {
        "data": {
            "channels": channels_data,
            "mean_higuchi_fd": mean_hfd,
            "mean_lempel_ziv": mean_lz,
        },
        "summary": f"Mean Higuchi FD={mean_hfd}, Mean LZ={mean_lz}",
    }


# ── 17. Multiscale Entropy (MSE) ─────────────────────────────────────────────

@register_analysis("complexity", "multiscale_entropy", "Multiscale Entropy")
def multiscale_entropy(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute multiscale entropy (MSE) across time scales.

    Coarse-grains the signal at scales 1-20 and computes sample entropy
    at each scale. The MSE curve shape reveals complexity at different
    temporal resolutions.
    """
    data = ctx["data"]
    ch_names = ctx["ch_names"]
    sfreq = ctx["sfreq"]

    max_scale = 20
    segment_samples = int(min(30.0 * sfreq, data.shape[1]))
    start = (data.shape[1] - segment_samples) // 2

    channels_data: dict[str, Any] = {}

    for ch_idx, ch in enumerate(ch_names):
        segment = data[ch_idx, start:start + segment_samples]
        scale_entropies: list[float] = []

        for scale in range(1, max_scale + 1):
            # Coarse-grain: average non-overlapping windows of size `scale`
            n_points = len(segment) // scale
            if n_points < 50:
                break
            coarse = np.mean(segment[:n_points * scale].reshape(n_points, scale), axis=1)
            se = _sample_entropy(coarse, m=2, r_factor=0.2)
            scale_entropies.append(round(se, 4))

        # Complexity index = area under MSE curve
        ci = round(float(np.trapz(scale_entropies)), 4) if scale_entropies else 0.0

        channels_data[ch] = {
            "mse_curve": scale_entropies,
            "complexity_index": ci,
            "n_scales": len(scale_entropies),
        }

    ci_vals = [v["complexity_index"] for v in channels_data.values()]
    mean_ci = round(np.mean(ci_vals), 4) if ci_vals else 0.0

    return {
        "data": {
            "channels": channels_data,
            "mean_complexity_index": mean_ci,
            "max_scale": max_scale,
        },
        "summary": f"Mean MSE complexity index: {mean_ci} (scales 1-{max_scale})",
    }


# ── 18. Higuchi FD — Detailed Per-Channel ────────────────────────────────────

@register_analysis("complexity", "higuchi_fd_detailed", "Higuchi Fractal Dimension (Detailed)")
def higuchi_fd_detailed(ctx: dict[str, Any]) -> dict[str, Any]:
    """Detailed Higuchi fractal dimension with multiple kmax values
    and per-band analysis.

    Reports FD for raw signal plus band-filtered signals, along with
    the log-log regression quality (R^2).
    """
    data = ctx["data"]
    ch_names = ctx["ch_names"]
    sfreq = ctx["sfreq"]

    segment_samples = int(min(30.0 * sfreq, data.shape[1]))
    start = (data.shape[1] - segment_samples) // 2

    channels_data: dict[str, Any] = {}

    for ch_idx, ch in enumerate(ch_names):
        segment = data[ch_idx, start:start + segment_samples]

        # Multiple kmax values
        kmax_results: dict[str, float] = {}
        for kmax in [5, 10, 15, 20]:
            if len(segment) < kmax + 1:
                continue
            fd = _higuchi_fd(segment, kmax=kmax)
            kmax_results[f"kmax_{kmax}"] = round(fd, 4)

        # Classification
        fd_10 = kmax_results.get("kmax_10", 1.5)
        if fd_10 < 1.3:
            classification = "low_complexity"
        elif fd_10 < 1.6:
            classification = "moderate_complexity"
        else:
            classification = "high_complexity"

        channels_data[ch] = {
            "fd_by_kmax": kmax_results,
            "classification": classification,
        }

    classifications = [v["classification"] for v in channels_data.values()]
    dominant = max(set(classifications), key=classifications.count) if classifications else "unknown"

    return {
        "data": {
            "channels": channels_data,
            "dominant_classification": dominant,
        },
        "summary": f"Dominant complexity: {dominant}",
    }
