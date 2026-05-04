"""Min/max + LTTB-style pyramid downsampling helpers for long EEG windows."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    pass


def stride_downsample_maxmin(
    row: np.ndarray,
    target_points: int,
) -> np.ndarray:
    """Aggressive min/max envelope per bucket (factor-of-two friendly).

    Guarantees ≤ ``target_points`` samples while preserving spikes better than
    pure averaging when ``target_points`` is small.
    """
    n = row.shape[0]
    if n <= target_points or target_points < 2:
        return row.astype(np.float32, copy=False)

    bucket = max(1, int(np.ceil(n / target_points)))
    out_len = (n + bucket - 1) // bucket
    out = np.empty(out_len * 2, dtype=np.float32)
    o = 0
    for start in range(0, n, bucket):
        chunk = row[start : start + bucket]
        mn = float(np.min(chunk))
        mx = float(np.max(chunk))
        if mn <= mx:
            out[o] = mn
            out[o + 1] = mx
            o += 2
        else:
            out[o] = mx
            out[o + 1] = mn
            o += 2
    return out[:o]


def largest_triangle_three_buckets(y: np.ndarray, max_points: int) -> np.ndarray:
    """Classic LTTB (single channel). Falls back to stride when tiny."""
    n = y.shape[0]
    if max_points >= n or max_points < 3:
        return y.astype(np.float32, copy=False)

    sampled = np.zeros(max_points, dtype=np.float32)
    sampled[0] = y[0]
    sampled[-1] = y[-1]

    every = (n - 2) / (max_points - 2)
    a = 0
    for i in range(max_points - 2):
        avg_range_start = int(np.floor((i + 1) * every)) + 1
        avg_range_end = int(np.floor((i + 2) * every)) + 1
        avg_range_end = min(avg_range_end, n)
        avg_x = 0.0
        avg_y = 0.0
        avg_range_length = avg_range_end - avg_range_start
        if avg_range_length > 0:
            for j in range(avg_range_start, avg_range_end):
                avg_x += j
                avg_y += float(y[j])
            avg_x /= avg_range_length
            avg_y /= avg_range_length

        point_ax = a
        point_ay = float(y[a])
        max_area = -1.0
        max_idx = avg_range_start
        for j in range(avg_range_start, avg_range_end):
            area = abs(
                (point_ax - avg_x) * (float(y[j]) - point_ay)
                - (point_ax - j) * (avg_y - point_ay)
            ) * 0.5
            if area > max_area:
                max_area = area
                max_idx = j
        sampled[i + 1] = y[max_idx]
        a = max_idx

    return sampled
