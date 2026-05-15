"""EEG Connectivity Analysis -- wPLI, Coherence, Graph Metrics.

Decision-support only. Volume conduction is a major confound.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

_log = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────
# Weighted Phase Lag Index (wPLI)
# ────────────────────────────────────────────────────────────────

def weighted_phase_lag_index(
    signal1: list[float] | np.ndarray,
    signal2: list[float] | np.ndarray,
    sfreq: float,
    band: tuple[float, float],
) -> dict[str, Any]:
    """Compute weighted Phase Lag Index (wPLI) between two signals.

    wPLI is robust to volume conduction and noise.

    Parameters
    ----------
    signal1, signal2 : list[float] | np.ndarray
        Time-domain signals (same length).
    sfreq : float
        Sampling frequency in Hz.
    band : tuple[float, float]
        Frequency band (low, high) in Hz.

    Returns
    -------
    dict
        wpli, band, n_freqs, confidence, note.
    """
    s1 = np.asarray(signal1, dtype=float)
    s2 = np.asarray(signal2, dtype=float)

    if s1.size != s2.size:
        return {"wpli": 0.0, "band": band, "note": "Signals have different lengths"}

    # FFT-based cross-spectrum
    fft1 = np.fft.rfft(s1)
    fft2 = np.fft.rfft(s2)
    freqs = np.fft.rfftfreq(len(s1), 1.0 / sfreq)

    mask = (freqs >= band[0]) & (freqs <= band[1])
    if not mask.any():
        return {
            "wpli": 0.0,
            "band": band,
            "note": "No frequencies in band",
            "n_freqs": 0,
        }

    f1 = fft1[mask]
    f2 = fft2[mask]

    # Cross-spectrum
    cross = f1 * np.conj(f2)
    imag_cross = np.imag(cross)

    # wPLI = |E[Im(S)]| / E[|Im(S)|]
    denom = np.mean(np.abs(imag_cross))
    wpli = float(np.abs(np.mean(imag_cross)) / denom) if denom > 0 else 0.0

    return {
        "wpli": wpli,
        "band": band,
        "n_freqs": int(mask.sum()),
        "confidence": "moderate" if wpli > 0.3 else "low",
        "note": (
            "wPLI > 0.5 suggests significant phase coupling. "
            "Volume conduction may inflate values."
        ),
    }


# ────────────────────────────────────────────────────────────────
# Magnitude-Squared Coherence
# ────────────────────────────────────────────────────────────────

def coherence(
    signal1: list[float] | np.ndarray,
    signal2: list[float] | np.ndarray,
    sfreq: float,
    band: tuple[float, float],
) -> dict[str, Any]:
    """Compute magnitude-squared coherence between two signals.

    Coherence is sensitive to volume conduction. Use wPLI for robust
    phase coupling estimates.

    Parameters
    ----------
    signal1, signal2 : list[float] | np.ndarray
        Time-domain signals (same length).
    sfreq : float
        Sampling frequency in Hz.
    band : tuple[float, float]
        Frequency band (low, high) in Hz.

    Returns
    -------
    dict
        coherence, band, note.
    """
    s1 = np.asarray(signal1, dtype=float)
    s2 = np.asarray(signal2, dtype=float)

    if s1.size != s2.size:
        return {"coherence": 0.0, "band": band, "note": "Signals have different lengths"}

    fft1 = np.fft.rfft(s1)
    fft2 = np.fft.rfft(s2)
    freqs = np.fft.rfftfreq(len(s1), 1.0 / sfreq)

    mask = (freqs >= band[0]) & (freqs <= band[1])
    if not mask.any():
        return {"coherence": 0.0, "band": band}

    cross = fft1[mask] * np.conj(fft2[mask])
    auto1 = np.abs(fft1[mask]) ** 2
    auto2 = np.abs(fft2[mask]) ** 2

    denom = auto1 * auto2
    valid = denom > 0
    if not valid.any():
        return {"coherence": 0.0, "band": band}

    coh_vals = np.abs(cross[valid]) ** 2 / denom[valid]
    coh = float(np.mean(coh_vals))

    return {
        "coherence": coh,
        "band": band,
        "note": (
            "Coherence is sensitive to volume conduction. "
            "Use wPLI for robust phase coupling."
        ),
    }


# ────────────────────────────────────────────────────────────────
# Imaginary Coherence
# ────────────────────────────────────────────────────────────────

def imaginary_coherence(
    signal1: list[float] | np.ndarray,
    signal2: list[float] | np.ndarray,
    sfreq: float,
    band: tuple[float, float],
) -> dict[str, Any]:
    """Compute imaginary coherence between two signals.

    Eliminates zero-phase interactions (volume conduction artifact).

    Parameters
    ----------
    signal1, signal2 : list[float] | np.ndarray
        Time-domain signals (same length).
    sfreq : float
        Sampling frequency in Hz.
    band : tuple[float, float]
        Frequency band (low, high) in Hz.

    Returns
    -------
    dict
        imaginary_coherence, band, note.
    """
    s1 = np.asarray(signal1, dtype=float)
    s2 = np.asarray(signal2, dtype=float)

    if s1.size != s2.size:
        return {"imaginary_coherence": 0.0, "band": band, "note": "Signals have different lengths"}

    fft1 = np.fft.rfft(s1)
    fft2 = np.fft.rfft(s2)
    freqs = np.fft.rfftfreq(len(s1), 1.0 / sfreq)

    mask = (freqs >= band[0]) & (freqs <= band[1])
    if not mask.any():
        return {"imaginary_coherence": 0.0, "band": band}

    cross = fft1[mask] * np.conj(fft2[mask])
    auto1 = np.abs(fft1[mask]) ** 2
    auto2 = np.abs(fft2[mask]) ** 2

    denom = np.sqrt(auto1 * auto2)
    valid = denom > 0
    if not valid.any():
        return {"imaginary_coherence": 0.0, "band": band}

    # Imaginary part only
    imag_coh = np.abs(np.imag(cross[valid] / denom[valid]))
    ic = float(np.mean(imag_coh))

    return {
        "imaginary_coherence": ic,
        "band": band,
        "note": (
            "Imaginary coherence removes zero-phase interactions. "
            "Less sensitive to volume conduction than magnitude coherence."
        ),
    }


# ────────────────────────────────────────────────────────────────
# Graph-Theoretic Network Metrics
# ────────────────────────────────────────────────────────────────

def graph_metrics(
    connectivity_matrix: list[list[float]] | np.ndarray,
    channel_names: list[str],
    threshold: float = 0.3,
) -> dict[str, Any]:
    """Compute graph-theoretic metrics from connectivity matrix.

    Parameters
    ----------
    connectivity_matrix : list[list[float]] | np.ndarray
        n x n connectivity matrix.
    channel_names : list[str]
        Channel labels (length n).
    threshold : float
        Threshold for binarizing the connectivity matrix.

    Returns
    -------
    dict
        degree, clustering_coefficient, betweenness_centrality, global_efficiency,
        primary_hub, n_connections, volume_conduction_warning.
    """
    matrix = np.array(connectivity_matrix, dtype=float)
    n = len(channel_names)

    if matrix.shape != (n, n):
        return {
            "error": f"Matrix shape {matrix.shape} does not match {n} channels",
            "volume_conduction_warning": "All connectivity metrics are potentially confounded by volume conduction. Interpret with caution.",
        }

    # Degree (sum of connections per node)
    degree = np.sum(matrix, axis=1)

    # Clustering coefficient (simplified)
    clustering: list[float] = []
    for i in range(n):
        neighbors = np.where(matrix[i] > threshold)[0]
        if len(neighbors) < 2:
            clustering.append(0.0)
            continue
        # Count triangles
        sub = matrix[np.ix_(neighbors, neighbors)]
        n_neighbors = len(neighbors)
        max_edges = n_neighbors * (n_neighbors - 1)
        if max_edges == 0:
            clustering.append(0.0)
            continue
        actual_edges = np.sum(sub > threshold) - n_neighbors  # exclude diagonal
        # Undirected: divide by 2
        actual_edges = actual_edges / 2.0
        possible_edges = max_edges / 2.0
        clustering.append(float(actual_edges / possible_edges) if possible_edges > 0 else 0.0)

    # Betweenness centrality (simplified - weighted degree-based approximation)
    degree_sum = np.sum(degree)
    betweenness = degree / degree_sum if degree_sum > 0 else np.zeros(n)

    # Global efficiency
    inv_dist = 1.0 / (matrix + 0.001)  # avoid division by zero
    np.fill_diagonal(inv_dist, 0)
    global_efficiency = float(np.mean(inv_dist[np.isfinite(inv_dist)]))

    # Characteristic path length (simplified)
    finite_distances = inv_dist[np.isfinite(inv_dist)]
    characteristic_path_length = float(np.mean(1.0 / finite_distances[finite_distances > 0])) if finite_distances.size > 0 else 0.0

    # Hub identification
    hub_idx = int(np.argmax(betweenness))

    # Modularity approximation (simplified)
    # True modularity requires community detection; we use a simple approximation
    n_above_threshold = int(np.sum(matrix > threshold))
    density = n_above_threshold / (n * (n - 1)) if n > 1 else 0.0

    return {
        "degree": {ch: float(d) for ch, d in zip(channel_names, degree)},
        "clustering_coefficient": {ch: float(c) for ch, c in zip(channel_names, clustering)},
        "betweenness_centrality": {ch: float(b) for ch, b in zip(channel_names, betweenness)},
        "global_efficiency": global_efficiency,
        "characteristic_path_length": characteristic_path_length,
        "network_density": float(density),
        "primary_hub": channel_names[hub_idx],
        "n_connections_above_threshold": n_above_threshold,
        "threshold_used": threshold,
        "volume_conduction_warning": (
            "All connectivity metrics are potentially confounded by volume conduction. "
            "Interpret with caution."
        ),
    }


# ────────────────────────────────────────────────────────────────
# Full connectivity analysis pipeline
# ────────────────────────────────────────────────────────────────

def full_connectivity_analysis(
    eeg_data: dict[str, list[float]],
    sfreq: float,
    band: tuple[float, float] = (8.0, 13.0),  # alpha default
    threshold: float = 0.3,
) -> dict[str, Any]:
    """Run complete connectivity analysis.

    Computes wPLI, coherence, and imaginary coherence matrices plus
    graph-theoretic metrics.

    Parameters
    ----------
    eeg_data : dict[str, list[float]]
        channel_name -> signal values.
    sfreq : float
        Sampling frequency in Hz.
    band : tuple[float, float]
        Frequency band (low, high) in Hz (default alpha 8-13).
    threshold : float
        Threshold for graph metric binarization.

    Returns
    -------
    dict
        wpli_matrix, coherence_matrix, imaginary_coherence_matrix,
        graph_metrics, band, n_channels, safety_note.
    """
    channels = list(eeg_data.keys())
    n = len(channels)

    if n < 2:
        return {
            "wpli_matrix": [],
            "coherence_matrix": [],
            "imaginary_coherence_matrix": [],
            "graph_metrics": {},
            "band": band,
            "n_channels": n,
            "safety_note": (
                "Connectivity analysis is decision support only. "
                "Volume conduction is a major confound. "
                "Requires clinician review."
            ),
        }

    # Compute connectivity matrices
    wpli_matrix: list[list[float]] = [[0.0] * n for _ in range(n)]
    coh_matrix: list[list[float]] = [[0.0] * n for _ in range(n)]
    icoh_matrix: list[list[float]] = [[0.0] * n for _ in range(n)]

    for i in range(n):
        wpli_matrix[i][i] = 1.0
        coh_matrix[i][i] = 1.0
        icoh_matrix[i][i] = 0.0

    for i in range(n):
        for j in range(i + 1, n):
            wpli_res = weighted_phase_lag_index(
                eeg_data[channels[i]], eeg_data[channels[j]], sfreq, band
            )
            coh_res = coherence(
                eeg_data[channels[i]], eeg_data[channels[j]], sfreq, band
            )
            icoh_res = imaginary_coherence(
                eeg_data[channels[i]], eeg_data[channels[j]], sfreq, band
            )

            wpli_matrix[i][j] = wpli_matrix[j][i] = float(wpli_res.get("wpli", 0.0))
            coh_matrix[i][j] = coh_matrix[j][i] = float(coh_res.get("coherence", 0.0))
            icoh_matrix[i][j] = icoh_matrix[j][i] = float(icoh_res.get("imaginary_coherence", 0.0))

    # Graph metrics (using wPLI matrix)
    graphs = graph_metrics(wpli_matrix, channels, threshold=threshold)

    return {
        "wpli_matrix": wpli_matrix,
        "coherence_matrix": coh_matrix,
        "imaginary_coherence_matrix": icoh_matrix,
        "graph_metrics": graphs,
        "band": band,
        "n_channels": n,
        "methods_used": ["wpli", "coherence", "imaginary_coherence"],
        "safety_note": (
            "Connectivity analysis is decision support only. "
            "Volume conduction is a major confound. "
            "Requires clinician review."
        ),
    }
