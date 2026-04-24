"""Unit tests for :mod:`app.services.mri_pipeline`.

The façade's whole point is to survive the optional sibling
``deepsynaps_mri`` package being missing (or only partially installed —
the default in Studio CI, where the heavy neuro stack is not built).
These tests pin that behaviour so a regression (stray top-level ``import
nibabel`` etc.) is caught immediately.
"""
from __future__ import annotations

import asyncio
import importlib

import pytest


def test_facade_importable_without_pipeline() -> None:
    """The façade must import cleanly whether or not the pipeline is present."""
    mod = importlib.import_module("app.services.mri_pipeline")
    assert hasattr(mod, "HAS_MRI_PIPELINE")
    assert hasattr(mod, "run_analysis_safe")
    assert hasattr(mod, "load_demo_report")
    assert hasattr(mod, "generate_overlay_html_safe")
    assert hasattr(mod, "generate_report_pdf_safe")
    assert hasattr(mod, "generate_report_html_safe")
    assert hasattr(mod, "run_medrag_for_analysis_safe")
    assert isinstance(mod.HAS_MRI_PIPELINE, bool)


def test_load_demo_report_returns_mri_report_shape() -> None:
    """The demo JSON must load and expose the top-level MRIReport keys."""
    from app.services import mri_pipeline as facade

    report = facade.load_demo_report()
    assert isinstance(report, dict)
    assert "error" not in report, f"demo report failed to load: {report.get('error')}"
    assert report["analysis_id"]
    assert report["patient"]["patient_id"]
    assert isinstance(report["modalities_present"], list)
    assert isinstance(report["stim_targets"], list)
    assert report["stim_targets"], "demo report must include at least one stim target"
    target = report["stim_targets"][0]
    assert target["target_id"]
    assert target["modality"]
    assert target["condition"]
    assert target["region_name"]
    assert "mni_xyz" in target
    assert "disclaimer" in target


def test_run_analysis_safe_returns_error_envelope_when_missing(monkeypatch) -> None:
    """When the pipeline package is not installed the façade must NOT raise.

    Instead it returns a structured envelope with ``success=False`` and
    ``is_stub=True`` so callers can fall back to demo mode cleanly.
    """
    import app.services.mri_pipeline as facade

    monkeypatch.setattr(facade, "HAS_MRI_PIPELINE", False)
    monkeypatch.setattr(facade, "run_pipeline", None)
    monkeypatch.setattr(facade, "PatientMeta", None)

    result = facade.run_analysis_safe(
        upload_id="up-1",
        patient_id="pat-1",
        condition="mdd",
    )

    assert result["success"] is False
    assert result["data"] is None
    assert result["is_stub"] is True
    assert "error" in result
    assert isinstance(result["error"], str)
    assert "not installed" in result["error"] or "deepsynaps_mri" in result["error"]


def test_run_analysis_safe_never_raises_on_import_error(monkeypatch) -> None:
    """Simulating an ImportError path — no exception should escape."""
    import app.services.mri_pipeline as facade

    def _raiser(*args, **kwargs):
        raise ImportError("simulated missing dep")

    monkeypatch.setattr(facade, "HAS_MRI_PIPELINE", True)
    monkeypatch.setattr(facade, "run_pipeline", _raiser)

    class _Meta:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    monkeypatch.setattr(facade, "PatientMeta", _Meta)
    monkeypatch.setattr(facade, "Sex", lambda v: v)

    result = facade.run_analysis_safe(
        upload_id="up-1",
        patient_id="pat-1",
        condition="mdd",
        session_dir="/tmp/does-not-matter",
    )
    assert result["success"] is False
    assert result["data"] is None
    assert "simulated missing dep" in result["error"]


def test_generate_overlay_html_safe_returns_placeholder_when_missing(monkeypatch) -> None:
    """The overlay wrapper must return an HTML string even with no renderer."""
    import app.services.mri_pipeline as facade

    monkeypatch.setattr(facade, "HAS_MRI_PIPELINE", False)

    html = facade.generate_overlay_html_safe(
        analysis_id="a-1",
        target_id="rTMS_F3",
        report={"stim_targets": [{"target_id": "rTMS_F3"}], "overlays": {}},
    )
    assert isinstance(html, str)
    assert "Overlay unavailable" in html
    assert "rTMS_F3" in html
    # Regulatory disclaimer must be surfaced per CLAUDE.md §Regulatory.
    assert "Not a medical device" in html


def test_generate_report_pdf_safe_returns_none_when_missing(monkeypatch) -> None:
    import app.services.mri_pipeline as facade

    monkeypatch.setattr(facade, "HAS_MRI_PIPELINE", False)

    result = facade.generate_report_pdf_safe("a-1", {"analysis_id": "a-1"})
    assert result is None


def test_generate_report_html_safe_fallback_when_missing(monkeypatch) -> None:
    import app.services.mri_pipeline as facade

    monkeypatch.setattr(facade, "HAS_MRI_PIPELINE", False)

    html = facade.generate_report_html_safe("a-1", facade.load_demo_report())
    assert isinstance(html, str)
    assert "MRI Analyzer report" in html
    assert "Not a medical device" in html


def test_medrag_bridge_shape(monkeypatch) -> None:
    """The MedRAG bridge must return the §8 shape."""
    import app.services.mri_pipeline as facade

    async def _fake_query(conditions, modalities, *, top_k=10, db_session=None):
        return [
            {
                "pmid": "12345",
                "doi": "10.1/foo",
                "title": "Example",
                "authors": ["A"],
                "year": 2024,
                "journal": "Jrnl",
                "abstract": "",
                "relevance_score": 0.8,
            }
        ]

    monkeypatch.setattr("app.services.qeeg_rag.query_literature", _fake_query)

    report = facade.load_demo_report()
    out = asyncio.new_event_loop().run_until_complete(
        facade.run_medrag_for_analysis_safe(report, top_k=5)
    )
    assert "analysis_id" in out
    assert isinstance(out["results"], list)
    assert out["results"]
    first = out["results"][0]
    assert "title" in first
    assert "score" in first
    assert "hits" in first
    assert isinstance(first["hits"], list)


def test_medrag_bridge_never_raises_on_backend_failure(monkeypatch) -> None:
    import app.services.mri_pipeline as facade

    async def _boom(*a, **k):
        raise RuntimeError("backend dead")

    monkeypatch.setattr("app.services.qeeg_rag.query_literature", _boom)

    report = facade.load_demo_report()
    out = asyncio.new_event_loop().run_until_complete(
        facade.run_medrag_for_analysis_safe(report, top_k=5)
    )
    assert out["results"] == []
