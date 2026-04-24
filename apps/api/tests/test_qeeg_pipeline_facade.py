"""Unit tests for :mod:`app.services.qeeg_pipeline`.

The façade's whole point is to survive the optional sibling
``deepsynaps_qeeg`` package being missing. These tests pin that
behaviour so a regression (e.g. a stray top-level ``import mne``) is
caught immediately instead of blowing up the whole API worker at boot.
"""
from __future__ import annotations

import importlib

import pytest


def test_facade_importable_without_pipeline() -> None:
    """The façade must import cleanly even when MNE stack is absent."""
    mod = importlib.import_module("app.services.qeeg_pipeline")
    assert hasattr(mod, "HAS_MNE_PIPELINE")
    assert hasattr(mod, "run_pipeline_safe")
    assert isinstance(mod.HAS_MNE_PIPELINE, bool)


def test_run_pipeline_safe_returns_error_envelope_when_missing(monkeypatch) -> None:
    """When the pipeline package is not installed the façade must NOT raise.

    Instead it returns a structured ``{"success": False, "error": "..."}``
    dict. Simulate the "not installed" state by monkeypatching the module
    flag + the bound ``run_full_pipeline`` callable to ``None``.
    """
    import app.services.qeeg_pipeline as facade

    monkeypatch.setattr(facade, "HAS_MNE_PIPELINE", False)
    monkeypatch.setattr(facade, "run_full_pipeline", None)

    result = facade.run_pipeline_safe("/tmp/does-not-matter.edf")

    assert result["success"] is False
    assert "error" in result
    assert isinstance(result["error"], str)
    # The error string should mention the extra so ops know the remediation.
    assert "qeeg_mne" in result["error"] or "not installed" in result["error"]


def test_run_pipeline_safe_catches_pipeline_exceptions(monkeypatch) -> None:
    """Exceptions raised inside ``run_full_pipeline`` are surfaced as error dicts."""
    import app.services.qeeg_pipeline as facade

    def _raiser(*args, **kwargs):
        raise RuntimeError("simulated MNE failure")

    monkeypatch.setattr(facade, "HAS_MNE_PIPELINE", True)
    monkeypatch.setattr(facade, "run_full_pipeline", _raiser)

    result = facade.run_pipeline_safe("/tmp/any.edf")

    assert result["success"] is False
    assert "simulated MNE failure" in result["error"]


def test_run_pipeline_safe_serialises_dataclass_result(monkeypatch) -> None:
    """A real ``PipelineResult``-like object is converted into the §1 dict shape."""
    import app.services.qeeg_pipeline as facade

    class _FakeResult:
        features = {"spectral": {"bands": {"alpha": {"absolute_uv2": {"Cz": 1.0}}}}}
        zscores = {"flagged": []}
        flagged_conditions = ["adhd"]
        quality = {"pipeline_version": "0.1.0"}
        report_html = None
        report_pdf_path = None

    def _ok(*args, **kwargs):
        return _FakeResult()

    monkeypatch.setattr(facade, "HAS_MNE_PIPELINE", True)
    monkeypatch.setattr(facade, "run_full_pipeline", _ok)

    result = facade.run_pipeline_safe("/tmp/any.edf")

    assert result["success"] is True
    assert result["features"] == _FakeResult.features
    assert result["flagged_conditions"] == ["adhd"]
    assert result["quality"] == {"pipeline_version": "0.1.0"}


def test_run_pipeline_safe_passes_through_plain_dict(monkeypatch) -> None:
    """Some pipeline implementations may already return a plain dict."""
    import app.services.qeeg_pipeline as facade

    payload = {
        "features": {"spectral": {}},
        "zscores": {},
        "flagged_conditions": [],
        "quality": {"pipeline_version": "0.1.0"},
    }

    monkeypatch.setattr(facade, "HAS_MNE_PIPELINE", True)
    monkeypatch.setattr(facade, "run_full_pipeline", lambda *a, **k: payload)

    result = facade.run_pipeline_safe("/tmp/any.edf")

    assert result["success"] is True
    assert result["features"] == {"spectral": {}}
