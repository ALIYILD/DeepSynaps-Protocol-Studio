"""Tests for :mod:`deepsynaps_qeeg.ai.explainability`."""
from __future__ import annotations


_CHANNELS = ["Fp1", "Fp2", "F3", "Fz", "F4", "C3", "Cz", "C4", "P3", "Pz", "P4", "O1", "O2"]
_BANDS = ["delta", "theta", "alpha", "beta", "gamma"]


def _embedding(seed: int = 0) -> list[float]:
    """Stable 200-dim embedding for tests.

    Parameters
    ----------
    seed : int

    Returns
    -------
    list of float
    """
    from deepsynaps_qeeg.ml.foundation_embedding import _stub_embedding

    return _stub_embedding(seed)


def _risk_scores() -> dict[str, dict[str, object]]:
    """Sample risk-score bundle (similarity indices, not diagnoses).

    Returns
    -------
    dict
    """
    return {
        "mdd_like": {"score": 0.72, "ci95": [0.62, 0.81]},
        "adhd_like": {"score": 0.31, "ci95": [0.22, 0.39]},
        "anxiety_like": {"score": 0.55, "ci95": [0.44, 0.65]},
    }


def test_explain_returns_contract_shape() -> None:
    """All CONTRACT_V2 §1 explainability keys are present."""
    from deepsynaps_qeeg.ai.explainability import explain_risk_scores

    out = explain_risk_scores(
        _embedding(1),
        _risk_scores(),
        channel_names=_CHANNELS,
        bands=_BANDS,
        deterministic_seed=123,
    )

    for key in ("per_risk_score", "ood_score", "adebayo_sanity_pass", "method"):
        assert key in out, f"missing key {key}"
    assert out["method"] == "integrated_gradients"
    assert isinstance(out["adebayo_sanity_pass"], bool)

    ood = out["ood_score"]
    assert 0.0 <= float(ood["percentile"]) <= 100.0
    assert "distance" in ood
    assert "interpretation" in ood

    for risk_name, payload in out["per_risk_score"].items():
        assert "channel_importance" in payload
        assert "top_channels" in payload
        assert len(payload["top_channels"]) <= 3
        # Channel importance is a nested dict: {ch: {band: float}}.
        for ch, band_map in payload["channel_importance"].items():
            assert ch in _CHANNELS
            for band, val in band_map.items():
                assert band in _BANDS
                assert isinstance(val, float)


def test_explain_is_deterministic() -> None:
    """Two calls with the same inputs produce identical payloads."""
    from deepsynaps_qeeg.ai.explainability import explain_risk_scores

    emb = _embedding(2)
    a = explain_risk_scores(
        emb, _risk_scores(), channel_names=_CHANNELS, bands=_BANDS, deterministic_seed=7
    )
    b = explain_risk_scores(
        emb, _risk_scores(), channel_names=_CHANNELS, bands=_BANDS, deterministic_seed=7
    )
    assert a == b


def test_ood_percentile_in_range() -> None:
    """OOD percentile must fall in the stub-path [10, 95] band."""
    from deepsynaps_qeeg.ai.explainability import explain_risk_scores

    out = explain_risk_scores(
        _embedding(3),
        _risk_scores(),
        channel_names=_CHANNELS,
        bands=_BANDS,
        deterministic_seed=99,
    )
    pct = float(out["ood_score"]["percentile"])
    assert 0.0 <= pct <= 100.0


def test_adebayo_sanity_check_returns_true_in_stub_mode() -> None:
    """Without captum, adebayo_sanity_check is a no-op that returns True."""
    from deepsynaps_qeeg.ai.explainability import HAS_CAPTUM, adebayo_sanity_check

    result = adebayo_sanity_check(model=None, input_tensor=None)
    assert isinstance(result, bool)
    if not HAS_CAPTUM:
        assert result is True


def test_empty_channels_returns_minimal_payload() -> None:
    """With no channels, we still return the contract shape (empty inner)."""
    from deepsynaps_qeeg.ai.explainability import explain_risk_scores

    out = explain_risk_scores(
        _embedding(4),
        _risk_scores(),
        channel_names=[],
        bands=_BANDS,
    )
    assert out["per_risk_score"] == {}
    assert out["method"] == "integrated_gradients"
    assert 0.0 <= float(out["ood_score"]["percentile"]) <= 100.0


def test_top_channels_sorted_descending() -> None:
    """top_channels list is sorted by score descending."""
    from deepsynaps_qeeg.ai.explainability import explain_risk_scores

    out = explain_risk_scores(
        _embedding(5),
        _risk_scores(),
        channel_names=_CHANNELS,
        bands=_BANDS,
        deterministic_seed=1234,
    )
    for payload in out["per_risk_score"].values():
        scores = [float(item["score"]) for item in payload["top_channels"]]
        assert scores == sorted(scores, reverse=True)
