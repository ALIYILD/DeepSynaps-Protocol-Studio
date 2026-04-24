"""Microstate analysis — K-means microstate segmentation.

Registered analyses:
  microstate/microstate_analysis
"""
from __future__ import annotations

from typing import Any

import numpy as np

from app.services.analyses._engine import register_analysis


def _compute_gfp(data: np.ndarray) -> np.ndarray:
    """Compute Global Field Power (GFP) — spatial std across channels at each time point."""
    return np.std(data, axis=0)


def _find_gfp_peaks(gfp: np.ndarray, min_distance: int = 2) -> np.ndarray:
    """Find local maxima in GFP signal."""
    peaks = []
    for i in range(min_distance, len(gfp) - min_distance):
        if gfp[i] > gfp[i - 1] and gfp[i] > gfp[i + 1]:
            # Check it's a local max in the wider window
            window = gfp[max(0, i - min_distance):i + min_distance + 1]
            if gfp[i] == np.max(window):
                peaks.append(i)
    return np.array(peaks, dtype=int)


def _kmeans_microstates(
    data: np.ndarray,
    peak_indices: np.ndarray,
    n_clusters: int = 4,
    max_iter: int = 100,
    n_init: int = 5,
) -> tuple[np.ndarray, np.ndarray]:
    """Custom K-means on topographic maps at GFP peaks.

    Uses correlation-based distance (polarity-invariant).

    Returns:
        (cluster_maps, labels) where cluster_maps shape is (n_clusters, n_channels)
        and labels shape is (n_peaks,)
    """
    peak_maps = data[:, peak_indices].T  # (n_peaks, n_channels)
    n_peaks, n_ch = peak_maps.shape

    if n_peaks < n_clusters:
        return np.zeros((n_clusters, n_ch)), np.zeros(n_peaks, dtype=int)

    # Normalize maps
    norms = np.linalg.norm(peak_maps, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    peak_maps_norm = peak_maps / norms

    best_gev = -1.0
    best_maps = None
    best_labels = None

    for _ in range(n_init):
        # Random initialization
        init_idx = np.random.choice(n_peaks, n_clusters, replace=False)
        centroids = peak_maps_norm[init_idx].copy()

        labels = np.zeros(n_peaks, dtype=int)

        for _it in range(max_iter):
            # Assign: use absolute correlation (polarity-invariant)
            corr = np.abs(peak_maps_norm @ centroids.T)  # (n_peaks, n_clusters)
            new_labels = np.argmax(corr, axis=1)

            if np.array_equal(new_labels, labels):
                break
            labels = new_labels

            # Update centroids
            for k in range(n_clusters):
                members = peak_maps_norm[labels == k]
                if len(members) > 0:
                    # Use first eigenvector of covariance as centroid
                    mean_map = np.mean(members, axis=0)
                    norm = np.linalg.norm(mean_map)
                    centroids[k] = mean_map / norm if norm > 0 else mean_map

        # Compute Global Explained Variance (GEV)
        gev = 0.0
        for k in range(n_clusters):
            members = peak_maps_norm[labels == k]
            if len(members) > 0:
                corr_vals = np.abs(members @ centroids[k])
                gev += np.sum(corr_vals ** 2)
        gev /= n_peaks

        if gev > best_gev:
            best_gev = gev
            best_maps = centroids.copy()
            best_labels = labels.copy()

    return best_maps, best_labels


# ── 21. Microstate Analysis ──────────────────────────────────────────────────

@register_analysis("microstate", "microstate_analysis", "EEG Microstate Analysis")
def microstate_analysis(ctx: dict[str, Any]) -> dict[str, Any]:
    """K-means microstate analysis (classes A-D).

    Segments EEG into quasi-stable topographic states (~60-120ms each).
    Reports: duration, coverage, occurrence rate, transition probabilities,
    and global explained variance (GEV).
    """
    data = ctx["data"]
    ch_names = ctx["ch_names"]
    sfreq = ctx["sfreq"]
    n_ch = len(ch_names)

    # Use at most 60 seconds of data
    max_samples = int(60.0 * sfreq)
    if data.shape[1] > max_samples:
        start = (data.shape[1] - max_samples) // 2
        data_seg = data[:, start:start + max_samples]
    else:
        data_seg = data

    # Compute GFP and find peaks
    gfp = _compute_gfp(data_seg)
    peak_indices = _find_gfp_peaks(gfp, min_distance=int(sfreq * 0.008))  # ~8ms minimum

    if len(peak_indices) < 20:
        return {
            "data": {"error": "insufficient_gfp_peaks", "n_peaks": len(peak_indices)},
            "summary": "Insufficient GFP peaks for microstate analysis",
        }

    # K-means clustering (4 classes = A, B, C, D)
    n_classes = 4
    cluster_maps, peak_labels = _kmeans_microstates(data_seg, peak_indices, n_clusters=n_classes)

    # Back-fit: assign every time point to nearest microstate
    norms = np.linalg.norm(data_seg, axis=0, keepdims=False)
    data_norm = data_seg / np.where(norms > 0, norms, 1.0)
    map_norms = np.linalg.norm(cluster_maps, axis=1, keepdims=True)
    map_norms[map_norms == 0] = 1.0
    maps_norm = cluster_maps / map_norms
    corr = np.abs(maps_norm @ data_norm)  # (n_classes, n_time)
    all_labels = np.argmax(corr, axis=0)

    class_names = ["A", "B", "C", "D"]
    n_time = len(all_labels)

    # Per-class statistics
    classes_data: dict[str, Any] = {}
    for k in range(n_classes):
        mask = all_labels == k
        coverage = float(np.sum(mask)) / n_time

        # Count segments and their durations
        segments: list[int] = []
        current_len = 0
        for t in range(n_time):
            if all_labels[t] == k:
                current_len += 1
            else:
                if current_len > 0:
                    segments.append(current_len)
                current_len = 0
        if current_len > 0:
            segments.append(current_len)

        n_segments = len(segments)
        mean_duration_ms = (np.mean(segments) / sfreq * 1000) if segments else 0
        occurrence_per_sec = n_segments / (n_time / sfreq) if n_time > 0 else 0

        # Map topography (per channel)
        topo = {ch_names[c]: round(float(cluster_maps[k, c]), 4) for c in range(min(n_ch, cluster_maps.shape[1]))}

        classes_data[class_names[k]] = {
            "coverage_pct": round(coverage * 100, 2),
            "mean_duration_ms": round(mean_duration_ms, 1),
            "occurrence_per_sec": round(occurrence_per_sec, 2),
            "n_segments": n_segments,
            "topography": topo,
        }

    # Transition probabilities
    transitions = np.zeros((n_classes, n_classes))
    for t in range(n_time - 1):
        if all_labels[t] != all_labels[t + 1]:
            transitions[all_labels[t], all_labels[t + 1]] += 1
    # Normalize rows
    row_sums = transitions.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1
    trans_prob = transitions / row_sums
    trans_dict = {
        f"{class_names[i]}->{class_names[j]}": round(float(trans_prob[i, j]), 3)
        for i in range(n_classes) for j in range(n_classes) if i != j
    }

    # GEV
    gev = 0.0
    for k in range(n_classes):
        mask = all_labels == k
        if np.any(mask):
            corr_vals = corr[k, mask]
            gev += float(np.sum(corr_vals ** 2))
    gev /= n_time

    return {
        "data": {
            "classes": classes_data,
            "transitions": trans_dict,
            "gev": round(gev, 4),
            "n_gfp_peaks": len(peak_indices),
            "n_timepoints": n_time,
        },
        "summary": f"4-class microstates: GEV={round(gev * 100, 1)}%, "
                   + ", ".join(f"{c}={classes_data[c]['coverage_pct']:.0f}%" for c in class_names),
    }
