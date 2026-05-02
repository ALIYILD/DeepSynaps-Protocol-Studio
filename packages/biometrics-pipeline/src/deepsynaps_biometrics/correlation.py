"""Correlation analytics — associative only; separate from causal module."""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from deepsynaps_biometrics.schemas import CorrelationResult, LaggedCorrelationResult


def compute_biomarker_correlation_matrix(
    feature_matrix: dict[str, list[float]],
    *,
    method: str = "pearson",
) -> dict[tuple[str, str], float]:
    """``feature_matrix`` maps feature name → aligned daily values."""
    names = list(feature_matrix.keys())
    if len(names) < 2:
        return {}
    # Pearson pairwise (numpy), ignores NaN pairwise not implemented in MVP stub
    data = np.array([feature_matrix[n] for n in names], dtype=float)
    corr = np.corrcoef(data)
    out: dict[tuple[str, str], float] = {}
    for i, a in enumerate(names):
        for j, b in enumerate(names):
            if i <= j:
                out[(a, b)] = float(corr[i, j])
    del method
    return out


def compute_within_person_correlations(
    feature_matrix: dict[str, list[float]],
) -> dict[tuple[str, str], float]:
    return compute_biomarker_correlation_matrix(feature_matrix)


def compute_lagged_correlations(
    a: list[float],
    b: list[float],
    *,
    max_lag: int = 7,
    feature_a: str = "A",
    feature_b: str = "B",
) -> list[LaggedCorrelationResult]:
    """Shift ``b`` relative to ``a`` for lags 1..max_lag (day indices)."""
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    results: list[LaggedCorrelationResult] = []
    if len(a) != len(b) or len(a) < max_lag + 2:
        return results
    arr_a = np.asarray(a, dtype=float)
    arr_b = np.asarray(b, dtype=float)
    for lag in range(1, max_lag + 1):
        x = arr_a[:-lag]
        y = arr_b[lag:]
        if len(x) < 2:
            continue
        coef = float(np.corrcoef(x, y)[0, 1])
        results.append(
            LaggedCorrelationResult(
                feature_a=feature_a,
                feature_b=feature_b,
                lag=f"{lag}d",
                coefficient=coef,
                n_samples=len(x),
                computed_at_utc=now,
            )
        )
    return results
