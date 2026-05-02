import numpy as np

from deepsynaps_biometrics.correlation import compute_biomarker_correlation_matrix


def test_correlation_pairwise_complete_with_nan():
    m = compute_biomarker_correlation_matrix(
        {
            "a": [1.0, 2.0, float("nan"), 4.0],
            "b": [2.0, 4.0, 6.0, 8.0],
        }
    )
    assert np.isfinite(m[("a", "b")])
