"""Tests for :mod:`deepsynaps_qeeg.ai.risk_scores`."""
from __future__ import annotations

from deepsynaps_qeeg.ai import risk_scores as rs


def _embedding() -> list[float]:
    return [0.1 * i for i in range(32)]


def _features(**overrides) -> dict:
    feats = {
        "spectral": {
            "bands": {
                "delta": {"absolute_uv2": {"Fp1": 0.8, "Fp2": 0.9, "F3": 0.7,
                                           "F4": 0.75, "Fz": 0.8}},
                "theta": {"absolute_uv2": {ch: 1.2 for ch in
                                           ("Fp1", "Fp2", "F3", "F4", "Fz",
                                            "Cz", "Pz", "O1", "O2")}},
                "alpha": {"absolute_uv2": {ch: 1.0 for ch in
                                           ("Fp1", "Fp2", "F3", "F4", "Fz",
                                            "Cz", "Pz", "O1", "O2", "P3",
                                            "P4")}},
                "beta":  {"absolute_uv2": {ch: 0.6 for ch in
                                           ("Fp1", "Fp2", "F3", "F4", "Fz",
                                            "Cz", "Pz", "O1", "O2")}},
            },
            "peak_alpha_freq": {"O1": 10.0, "O2": 10.2, "Pz": 10.1},
        },
        "asymmetry": {"frontal_alpha_F3_F4": 0.0, "frontal_alpha_F7_F8": 0.0},
    }
    feats.update(overrides)
    return feats


def test_risk_scores_shape_and_labels():
    out = rs.compute_risk_scores(_embedding(), _features())
    # disclaimer is mandatory
    assert "disclaimer" in out
    assert "NOT diagnostic" in out["disclaimer"]
    assert out["score_type"] == "neurophysiological_similarity_index"
    assert "calibration" in out
    for label in rs.LABELS:
        assert label in out
        entry = out[label]
        assert "score" in entry and "ci95" in entry and "drivers" in entry
        assert 0.0 <= entry["score"] <= 1.0
        ci = entry["ci95"]
        assert isinstance(ci, list) and len(ci) == 2
        lo, hi = ci
        assert 0.0 <= lo <= hi <= 1.0


def test_risk_scores_determinism():
    emb = _embedding()
    a = rs.compute_risk_scores(emb, _features(), deterministic_seed=7)
    b = rs.compute_risk_scores(emb, _features(), deterministic_seed=7)
    assert a == b


def test_risk_scores_faa_prior_bumps_mdd():
    low = rs.compute_risk_scores(
        _embedding(), _features(asymmetry={"frontal_alpha_F3_F4": 0.0}),
        deterministic_seed=1,
    )
    high = rs.compute_risk_scores(
        _embedding(),
        _features(asymmetry={"frontal_alpha_F3_F4": 0.35,
                             "frontal_alpha_F7_F8": 0.2}),
        deterministic_seed=1,
    )
    assert high["mdd_like"]["score"] > low["mdd_like"]["score"]


def test_risk_scores_reduced_paf_bumps_cognitive_decline():
    baseline = rs.compute_risk_scores(
        _embedding(), _features(), deterministic_seed=3,
    )
    reduced = _features()
    reduced["spectral"]["peak_alpha_freq"] = {"O1": 7.5, "O2": 7.8, "Pz": 8.0}
    bumped = rs.compute_risk_scores(
        _embedding(), reduced, deterministic_seed=3,
    )
    assert (
        bumped["cognitive_decline_like"]["score"]
        > baseline["cognitive_decline_like"]["score"]
    )


def test_risk_scores_labels_use_like_suffix():
    out = rs.compute_risk_scores(_embedding(), _features())
    for key in out:
        if key in {"disclaimer", "score_type", "confidence", "calibration", "evidence_policy"}:
            continue
        assert key.endswith("_like"), f"label {key} must end with _like"


def test_risk_scores_explain_biomarker_drivers():
    out = rs.compute_risk_scores(
        _embedding(),
        _features(asymmetry={"frontal_alpha_F3_F4": 0.35, "frontal_alpha_F7_F8": 0.2}),
        deterministic_seed=1,
    )
    drivers = out["mdd_like"]["drivers"]
    assert any(driver["feature"] == "frontal_alpha_asymmetry" for driver in drivers)
    assert out["mdd_like"]["calibration"] == "uncalibrated_stub"
    assert out["confidence"]["level"] in {"low", "moderate", "high"}
