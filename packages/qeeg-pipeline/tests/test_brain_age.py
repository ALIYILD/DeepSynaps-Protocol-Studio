"""Tests for :mod:`deepsynaps_qeeg.ml.brain_age`."""
from __future__ import annotations

from typing import Any

import pytest


def _sample_features() -> dict[str, Any]:
    """Minimal classical feature dict with 3 channels.

    Returns
    -------
    dict
    """
    return {
        "spectral": {
            "bands": {
                "delta": {"absolute_uv2": {"Fz": 8.0, "Cz": 7.5, "Pz": 6.0},
                          "relative":     {"Fz": 0.18, "Cz": 0.20, "Pz": 0.22}},
                "theta": {"absolute_uv2": {"Fz": 5.0, "Cz": 4.5, "Pz": 4.1},
                          "relative":     {"Fz": 0.14, "Cz": 0.15, "Pz": 0.16}},
                "alpha": {"absolute_uv2": {"Fz": 9.0, "Cz": 8.5, "Pz": 10.0},
                          "relative":     {"Fz": 0.28, "Cz": 0.27, "Pz": 0.30}},
                "beta":  {"absolute_uv2": {"Fz": 4.0, "Cz": 3.8, "Pz": 3.2},
                          "relative":     {"Fz": 0.25, "Cz": 0.24, "Pz": 0.21}},
                "gamma": {"absolute_uv2": {"Fz": 1.0, "Cz": 1.1, "Pz": 0.9},
                          "relative":     {"Fz": 0.15, "Cz": 0.14, "Pz": 0.11}},
            },
            "aperiodic": {
                "slope":   {"Fz": 1.1, "Cz": 1.3, "Pz": 1.0},
                "offset":  {"Fz": 0.5, "Cz": 0.7, "Pz": 0.4},
            },
            "peak_alpha_freq": {"Fz": 10.0, "Cz": 10.1, "Pz": 9.8},
        }
    }


def test_predict_brain_age_returns_contract_shape() -> None:
    """Output dict must contain all CONTRACT_V2 §1 brain_age keys."""
    from deepsynaps_qeeg.ml.brain_age import predict_brain_age

    out = predict_brain_age(_sample_features(), chronological_age=30)

    # Contract keys.
    for key in (
        "predicted_years",
        "chronological_years",
        "gap_years",
        "gap_percentile",
        "confidence",
        "electrode_importance",
    ):
        assert key in out, f"missing key: {key}"

    assert isinstance(out["predicted_years"], float)
    assert out["chronological_years"] == 30
    assert isinstance(out["gap_years"], float)
    assert 0.0 <= out["gap_percentile"] <= 100.0
    assert out["confidence"] in {"low", "moderate", "high"}
    assert isinstance(out["electrode_importance"], dict)
    for ch, w in out["electrode_importance"].items():
        assert isinstance(ch, str)
        assert 0.0 <= float(w) <= 1.0


def test_predict_brain_age_is_deterministic_for_same_input() -> None:
    """Same features + seed → identical output payload."""
    from deepsynaps_qeeg.ml.brain_age import predict_brain_age

    a = predict_brain_age(_sample_features(), chronological_age=30, deterministic_seed=7)
    b = predict_brain_age(_sample_features(), chronological_age=30, deterministic_seed=7)
    assert a["predicted_years"] == b["predicted_years"]
    assert a["electrode_importance"] == b["electrode_importance"]


def test_predict_brain_age_gap_none_when_chronological_missing() -> None:
    """``gap_years`` must be None when chronological_age is None."""
    from deepsynaps_qeeg.ml.brain_age import predict_brain_age

    out = predict_brain_age(_sample_features(), chronological_age=None)
    assert out["chronological_years"] is None
    assert out["gap_years"] is None
    # Gap percentile still reported — stub defaults to 50.
    assert out["gap_percentile"] == pytest.approx(50.0)


def test_predict_brain_age_electrode_importance_sums_to_one() -> None:
    """The importance distribution is a proper probability simplex."""
    from deepsynaps_qeeg.ml.brain_age import predict_brain_age

    out = predict_brain_age(_sample_features(), chronological_age=42)
    total = sum(out["electrode_importance"].values())
    assert total == pytest.approx(1.0, abs=1e-6)


def test_train_fcnn_writes_placeholder_state_dict(tmp_path: Any) -> None:
    """The stub trainer writes a loadable pickle but does NOT train."""
    import pickle

    from deepsynaps_qeeg.ml.brain_age import _train_fcnn

    manifest = tmp_path / "manifest.csv"
    manifest.write_text("subject_id,age,sex,features_json\n")
    out_path = tmp_path / "out.pt"
    result = _train_fcnn(manifest, out_path)
    assert result.exists()
    with out_path.open("rb") as fh:
        state = pickle.load(fh)
    assert state["model"] is None
    assert state["manifest_csv"].endswith("manifest.csv")
