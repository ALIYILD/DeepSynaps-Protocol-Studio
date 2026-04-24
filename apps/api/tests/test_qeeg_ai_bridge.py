"""Unit tests for :mod:`app.services.qeeg_ai_bridge`.

Exercise the envelope contract:

    {"success": bool, "data": ..., "error": str | None, "is_stub": bool}

The bridge must NEVER raise — every ``run_*_safe`` helper is expected to
swallow ImportError and runtime errors alike.
"""
from __future__ import annotations

import importlib

import pytest


def _reload_bridge():
    """Re-import the bridge after a monkeypatched ``__import__`` so its
    module-level ``_safe_import`` calls re-evaluate."""
    from app.services import qeeg_ai_bridge

    return importlib.reload(qeeg_ai_bridge)


def test_bridge_importable() -> None:
    from app.services import qeeg_ai_bridge

    assert hasattr(qeeg_ai_bridge, "run_compute_embedding_safe")
    assert hasattr(qeeg_ai_bridge, "run_predict_brain_age_safe")
    assert hasattr(qeeg_ai_bridge, "run_score_conditions_safe")
    assert hasattr(qeeg_ai_bridge, "run_fit_centiles_safe")
    assert hasattr(qeeg_ai_bridge, "run_explain_safe")
    assert hasattr(qeeg_ai_bridge, "run_similar_cases_safe")
    assert hasattr(qeeg_ai_bridge, "run_recommend_protocol_safe")
    assert hasattr(qeeg_ai_bridge, "run_retrieve_papers_safe")
    assert hasattr(qeeg_ai_bridge, "run_trajectory_report_safe")


def test_envelope_shape_when_module_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    """If every scaffold module is unavailable, every helper returns a
    structured ``success=False`` envelope."""
    from app.services import qeeg_ai_bridge

    # Force every HAS_* flag to False by monkeypatching the flag directly.
    flags = [
        "HAS_FOUNDATION_EMBEDDING",
        "HAS_BRAIN_AGE",
        "HAS_GAMLSS",
        "HAS_EXPLAINABILITY",
        "HAS_RISK_SCORES",
        "HAS_SIMILAR_CASES",
        "HAS_PROTOCOL_RECOMMENDER",
        "HAS_MEDRAG",
        "HAS_LONGITUDINAL",
    ]
    for flag in flags:
        monkeypatch.setattr(qeeg_ai_bridge, flag, False)

    class _Epochs:
        info = {"x": 1}

    envelopes = [
        qeeg_ai_bridge.run_compute_embedding_safe(_Epochs()),
        qeeg_ai_bridge.run_predict_brain_age_safe({}, chronological_age=40),
        qeeg_ai_bridge.run_score_conditions_safe({}),
        qeeg_ai_bridge.run_fit_centiles_safe({}),
        qeeg_ai_bridge.run_explain_safe({}, {}),
        qeeg_ai_bridge.run_similar_cases_safe([], k=5),
        qeeg_ai_bridge.run_recommend_protocol_safe({}, {}),
        qeeg_ai_bridge.run_retrieve_papers_safe({}, {}),
        qeeg_ai_bridge.run_trajectory_report_safe("patient-x", None),
    ]

    for env in envelopes:
        assert isinstance(env, dict)
        assert env.get("success") is False
        assert env.get("error") is not None
        assert env.get("is_stub") is True
        assert "data" in env


def test_bridge_propagates_runtime_errors_as_envelope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If a scaffold function raises at call time, the bridge wraps the
    exception into a success=False envelope rather than propagating."""
    from app.services import qeeg_ai_bridge

    # Fake a brain-age module that raises.
    class _ExplodingMod:
        def predict_brain_age(self, *a, **k):  # noqa: D401, ARG002
            raise RuntimeError("boom")

    monkeypatch.setattr(qeeg_ai_bridge, "_brain_age_mod", _ExplodingMod())
    monkeypatch.setattr(qeeg_ai_bridge, "HAS_BRAIN_AGE", True)

    env = qeeg_ai_bridge.run_predict_brain_age_safe({}, chronological_age=30)
    assert env["success"] is False
    assert "boom" in (env.get("error") or "")


def test_longitudinal_bridge_returns_success_envelope() -> None:
    """When the longitudinal module is available (it should be — it's a
    pure-Python module we shipped in this PR) the bridge must forward a
    success envelope even for a patient with no analyses."""
    from app.services import qeeg_ai_bridge

    env = qeeg_ai_bridge.run_trajectory_report_safe("nonexistent-patient", None)
    # Longitudinal module is ours — it should always be importable.
    assert qeeg_ai_bridge.HAS_LONGITUDINAL is True
    assert env["success"] is True
    assert isinstance(env["data"], dict)
    assert env["data"]["n_sessions"] == 0
