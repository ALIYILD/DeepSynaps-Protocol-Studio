"""Integration tests for the qEEG MNE-pipeline wiring.

Covers CONTRACT §1-§5:
- ``AnalysisOut`` round-trips the new nullable ``*_json`` columns added in
  migration 037.
- The ``analyze_edf`` endpoint falls back gracefully to the legacy Welch
  path when ``deepsynaps_qeeg.pipeline`` cannot be imported.
- ``generate_ai_report`` accepts both the legacy ``band_powers`` kwarg and
  the new ``features`` / ``zscores`` kwargs, and calls the RAG layer
  without exploding when it is missing.

All tests that require MNE-Python / fooof / autoreject / pyprep /
mne-icalabel / mne-connectivity are guarded with ``pytest.mark.skipif``
so the suite stays green on workstations without the scientific stack.
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
import uuid
from datetime import datetime, timezone
from typing import Any

import pytest

# ── Skip markers for the heavy scientific stack ──────────────────────────────
MNE_AVAILABLE = importlib.util.find_spec("mne") is not None
QEEG_PKG_AVAILABLE = importlib.util.find_spec("deepsynaps_qeeg") is not None

skip_without_mne = pytest.mark.skipif(
    not MNE_AVAILABLE,
    reason="MNE-Python not installed — skip MNE-dependent test",
)
skip_without_qeeg = pytest.mark.skipif(
    not QEEG_PKG_AVAILABLE,
    reason="deepsynaps_qeeg reference package not installed",
)


# ── Test 1: AnalysisOut round-trips the new JSON fields ──────────────────────


def _mock_qeeg_row(**overrides: Any) -> Any:
    """Construct a light-weight mock row exposing QEEGAnalysis attributes.

    Using a plain object (not the SQLAlchemy model) keeps the test DB-free.
    ``AnalysisOut.from_record`` only touches attributes — it never calls
    the session — so this is sufficient.
    """
    class _Row:
        pass

    row = _Row()
    row.id = "analysis-1"
    row.qeeg_record_id = "rec-1"
    row.patient_id = "patient-1"
    row.clinician_id = "clinician-1"
    row.original_filename = "foo.edf"
    row.file_size_bytes = 1024
    row.recording_duration_sec = 300.0
    row.sample_rate_hz = 250.0
    row.channels_json = json.dumps(["Fp1", "Fp2", "Fz"])
    row.channel_count = 3
    row.recording_date = "2026-04-24"
    row.eyes_condition = "eyes_closed"
    row.equipment = "test-rig"
    row.analysis_status = "completed"
    row.analysis_error = None
    row.band_powers_json = json.dumps({"bands": {}, "derived_ratios": {}})
    row.artifact_rejection_json = None
    row.aperiodic_json = json.dumps({"slope": {"Fz": -1.2}, "offset": {"Fz": 0.5}, "r_squared": {"Fz": 0.9}})
    row.peak_alpha_freq_json = json.dumps({"O1": 10.1, "O2": 10.2})
    row.connectivity_json = json.dumps({"wpli": {}, "coherence": {}, "channels": ["Fp1", "Fp2", "Fz"]})
    row.asymmetry_json = json.dumps({"frontal_alpha_F3_F4": 0.15, "frontal_alpha_F7_F8": 0.02})
    row.graph_metrics_json = json.dumps({"alpha": {"clustering_coef": 0.4, "char_path_length": 2.1, "small_worldness": 1.1}})
    row.source_roi_json = json.dumps({"alpha": {"precuneus_lh": 3.4}})
    row.normative_zscores_json = json.dumps({"spectral": {"bands": {}}, "flagged": [], "norm_db_version": "toy-0.1"})
    row.flagged_conditions = json.dumps(["adhd", "anxiety"])
    row.quality_metrics_json = json.dumps({"n_epochs_retained": 42, "pipeline_version": "0.1.0"})
    row.pipeline_version = "0.1.0"
    row.norm_db_version = "toy-0.1"
    row.analyzed_at = datetime(2026, 4, 24, 12, 0, tzinfo=timezone.utc)
    row.created_at = datetime(2026, 4, 24, 11, 0, tzinfo=timezone.utc)

    for key, val in overrides.items():
        setattr(row, key, val)
    return row


def test_analysis_out_round_trips_new_json_fields() -> None:
    """AnalysisOut.from_record parses every new CONTRACT §3 column."""
    from app.routers.qeeg_analysis_router import AnalysisOut

    row = _mock_qeeg_row()
    out = AnalysisOut.from_record(row)

    assert out.aperiodic == {"slope": {"Fz": -1.2}, "offset": {"Fz": 0.5}, "r_squared": {"Fz": 0.9}}
    assert out.peak_alpha_freq == {"O1": 10.1, "O2": 10.2}
    assert out.connectivity is not None
    assert out.connectivity["channels"] == ["Fp1", "Fp2", "Fz"]
    assert out.asymmetry == {"frontal_alpha_F3_F4": 0.15, "frontal_alpha_F7_F8": 0.02}
    assert out.graph_metrics is not None
    assert "alpha" in out.graph_metrics
    assert out.source_roi == {"alpha": {"precuneus_lh": 3.4}}
    assert out.normative_zscores is not None
    assert out.normative_zscores["norm_db_version"] == "toy-0.1"
    assert out.flagged_conditions == ["adhd", "anxiety"]
    assert out.quality_metrics is not None
    assert out.quality_metrics["n_epochs_retained"] == 42
    assert out.pipeline_version == "0.1.0"
    assert out.norm_db_version == "toy-0.1"


def test_analysis_out_tolerates_missing_new_columns() -> None:
    """Legacy rows without the new columns must still serialise."""
    from app.routers.qeeg_analysis_router import AnalysisOut

    row = _mock_qeeg_row(
        aperiodic_json=None,
        peak_alpha_freq_json=None,
        connectivity_json=None,
        asymmetry_json=None,
        graph_metrics_json=None,
        source_roi_json=None,
        normative_zscores_json=None,
        flagged_conditions=None,
        quality_metrics_json=None,
        pipeline_version=None,
        norm_db_version=None,
    )
    out = AnalysisOut.from_record(row)

    assert out.aperiodic is None
    assert out.flagged_conditions is None
    assert out.pipeline_version is None
    # Core legacy fields still populated
    assert out.id == "analysis-1"
    assert out.analysis_status == "completed"


def test_analysis_out_tolerates_malformed_json() -> None:
    """A corrupted ``*_json`` column must not 500 the listing endpoint."""
    from app.routers.qeeg_analysis_router import AnalysisOut

    row = _mock_qeeg_row(aperiodic_json="{not valid json", flagged_conditions="[[not json")
    out = AnalysisOut.from_record(row)
    assert out.aperiodic is None
    assert out.flagged_conditions is None


# ── Test 2: analyze_edf falls back when deepsynaps_qeeg import fails ─────────


def test_try_import_full_pipeline_returns_none_when_module_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``_try_import_full_pipeline`` must swallow ImportError."""
    import builtins as _builtins

    from app.routers import qeeg_analysis_router as router_mod

    real_import = _builtins.__import__

    def _blocked_import(name: str, *args: Any, **kwargs: Any) -> Any:
        if name.startswith("deepsynaps_qeeg"):
            raise ImportError("simulated missing deepsynaps_qeeg")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(_builtins, "__import__", _blocked_import)

    assert router_mod._try_import_full_pipeline() is None


def test_run_and_persist_full_pipeline_returns_false_on_runtime_error() -> None:
    """If ``run_full_pipeline`` raises, the analysis is left unmodified."""
    from app.routers.qeeg_analysis_router import _run_and_persist_full_pipeline

    row = _mock_qeeg_row(
        aperiodic_json=None,
        peak_alpha_freq_json=None,
        pipeline_version=None,
    )

    def _boom(_path: str) -> Any:
        raise RuntimeError("mne is not installed")

    ok = _run_and_persist_full_pipeline(
        analysis=row,
        file_bytes=b"0" * 512,
        run_full_pipeline=_boom,
    )
    assert ok is False
    # Row must not have been populated with pipeline fields.
    assert row.pipeline_version is None
    assert row.aperiodic_json is None


def test_run_and_persist_full_pipeline_populates_columns_on_success() -> None:
    """Successful pipeline run persists every CONTRACT §2 column."""
    from app.routers.qeeg_analysis_router import _run_and_persist_full_pipeline

    row = _mock_qeeg_row(
        aperiodic_json=None,
        peak_alpha_freq_json=None,
        connectivity_json=None,
        asymmetry_json=None,
        graph_metrics_json=None,
        source_roi_json=None,
        normative_zscores_json=None,
        flagged_conditions=None,
        quality_metrics_json=None,
        pipeline_version=None,
        norm_db_version=None,
    )

    class _FakeResult:
        features = {
            "spectral": {
                "bands": {
                    "alpha": {
                        "absolute_uv2": {"O1": 12.0, "O2": 11.5},
                        "relative": {"O1": 0.35, "O2": 0.34},
                    },
                    "beta": {
                        "absolute_uv2": {"O1": 6.0, "O2": 6.2},
                        "relative": {"O1": 0.20, "O2": 0.21},
                    },
                    "theta": {
                        "absolute_uv2": {"O1": 4.0, "O2": 4.2},
                        "relative": {"O1": 0.10, "O2": 0.12},
                    },
                },
                "aperiodic": {"slope": {"Fz": -1.2}, "offset": {"Fz": 0.5}, "r_squared": {"Fz": 0.9}},
                "peak_alpha_freq": {"O1": 10.1, "O2": 10.3},
            },
            "connectivity": {"wpli": {"alpha": [[0.0]]}, "coherence": {}, "channels": ["O1"]},
            "asymmetry": {"frontal_alpha_F3_F4": 0.11, "frontal_alpha_F7_F8": 0.02},
            "graph": {"alpha": {"clustering_coef": 0.4, "char_path_length": 2.1, "small_worldness": 1.0}},
            "source": {"roi_band_power": {"alpha": {"precuneus_lh": 3.1}}, "method": "eLORETA"},
        }
        zscores = {"spectral": {"bands": {}}, "flagged": [], "norm_db_version": "toy-0.1"}
        flagged_conditions = ["adhd"]
        quality = {
            "n_channels_input": 19,
            "n_channels_rejected": 1,
            "bad_channels": ["T7"],
            "n_epochs_retained": 40,
            "n_epochs_total": 45,
            "ica_components_dropped": 2,
            "ica_labels_dropped": {"eye": 2},
            "sfreq_input": 500.0,
            "sfreq_output": 250.0,
            "bandpass": [1.0, 45.0],
            "notch_hz": 50.0,
            "pipeline_version": "0.1.0",
        }

    def _fake_pipeline(_path: str) -> Any:
        return _FakeResult()

    ok = _run_and_persist_full_pipeline(
        analysis=row,
        file_bytes=b"0" * 512,
        run_full_pipeline=_fake_pipeline,
    )
    assert ok is True

    # Every new column populated.
    assert row.aperiodic_json is not None
    assert json.loads(row.aperiodic_json)["slope"]["Fz"] == -1.2
    assert json.loads(row.peak_alpha_freq_json)["O1"] == 10.1
    assert json.loads(row.connectivity_json)["channels"] == ["O1"]
    assert json.loads(row.asymmetry_json)["frontal_alpha_F3_F4"] == 0.11
    assert json.loads(row.graph_metrics_json)["alpha"]["clustering_coef"] == 0.4
    assert json.loads(row.source_roi_json)["method"] == "eLORETA"
    assert json.loads(row.flagged_conditions) == ["adhd"]
    assert json.loads(row.quality_metrics_json)["n_epochs_retained"] == 40
    assert row.pipeline_version == "0.1.0"
    assert row.norm_db_version == "toy-0.1"

    # Legacy band_powers_json synthesised for backward compat.
    legacy = json.loads(row.band_powers_json)
    assert "bands" in legacy
    assert "alpha" in legacy["bands"]
    assert legacy["bands"]["alpha"]["channels"]["O1"]["absolute_uv2"] == 12.0
    # Relative is converted fraction → percent.
    assert abs(legacy["bands"]["alpha"]["channels"]["O1"]["relative_pct"] - 35.0) < 1e-6
    # Derived ratios include FAA + APF + TBR.
    derived = legacy["derived_ratios"]
    assert derived["frontal_alpha_asymmetry"]["F3_F4"] == 0.11
    assert derived["alpha_peak_frequency"]["channels"]["O1"] == 10.1
    assert "theta_beta_ratio" in derived


# ── Test 3: AI interpreter accepts both legacy and new kwargs ────────────────


def _fake_llm_patch(monkeypatch: pytest.MonkeyPatch, *, returns: str = "") -> None:
    """Patch ``_llm_chat_async`` to return a fixed string (no real LLM call)."""
    async def _fake(
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.3,
        not_configured_message: str = "",
    ) -> str:
        return returns

    from app.services import chat_service

    monkeypatch.setattr(chat_service, "_llm_chat_async", _fake)


def test_generate_ai_report_accepts_legacy_band_powers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The original signature (positional ``band_powers``) still works."""
    _fake_llm_patch(monkeypatch, returns="")  # force deterministic fallback
    from app.services.qeeg_ai_interpreter import generate_ai_report

    band_powers = {
        "bands": {
            "alpha": {
                "hz_range": [8.0, 13.0],
                "channels": {
                    "O1": {"absolute_uv2": 12.0, "relative_pct": 35.0},
                },
            },
        },
        "derived_ratios": {"theta_beta_ratio": {"channels": {"Cz": 2.1}}},
    }

    result = asyncio.new_event_loop().run_until_complete(
        generate_ai_report(band_powers=band_powers)
    )
    assert "data" in result
    assert "prompt_hash" in result
    # Deterministic path — no RAG triggered (no features / zscores / flagged).
    assert result.get("literature_refs", []) == []


def test_generate_ai_report_accepts_features_and_zscores(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """New kwargs: features / zscores / flagged_conditions / quality."""
    _fake_llm_patch(monkeypatch, returns="")
    from app.services.qeeg_ai_interpreter import generate_ai_report

    features = {
        "spectral": {
            "bands": {
                "alpha": {
                    "absolute_uv2": {"O1": 12.0},
                    "relative": {"O1": 0.35},
                },
            },
            "aperiodic": {"slope": {"Fz": -1.2}},
            "peak_alpha_freq": {"O1": 10.1},
        },
        "asymmetry": {"frontal_alpha_F3_F4": 0.11},
    }
    zscores = {
        "spectral": {"bands": {}},
        "flagged": [{"metric": "spectral.bands.theta.absolute_uv2", "channel": "Fz", "z": 2.8}],
        "norm_db_version": "toy-0.1",
    }
    quality = {"n_epochs_retained": 40, "pipeline_version": "0.1.0"}

    result = asyncio.new_event_loop().run_until_complete(
        generate_ai_report(
            features=features,
            zscores=zscores,
            flagged_conditions=["adhd"],
            quality=quality,
        )
    )
    assert "data" in result
    # literature_refs is always present (may be empty when RAG missing).
    assert "literature_refs" in result
    assert isinstance(result["literature_refs"], list)
    # model_used annotates non-grounded when RAG returned nothing.
    assert "model_used" in result


def test_generate_ai_report_synthesises_band_powers_from_features(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When ``band_powers`` is omitted, it must be built from ``features``."""
    _fake_llm_patch(monkeypatch, returns="")
    from app.services.qeeg_ai_interpreter import (
        _synthesise_band_powers_from_features,
    )

    features = {
        "spectral": {
            "bands": {
                "alpha": {
                    "absolute_uv2": {"O1": 12.0, "O2": 11.0},
                    "relative": {"O1": 0.35, "O2": 0.34},
                },
                "beta": {
                    "absolute_uv2": {"O1": 6.0},
                    "relative": {"O1": 0.20},
                },
            },
            "peak_alpha_freq": {"O1": 10.1},
        },
        "asymmetry": {"frontal_alpha_F3_F4": 0.11},
    }
    bp = _synthesise_band_powers_from_features(features)
    assert "alpha" in bp["bands"]
    assert bp["bands"]["alpha"]["channels"]["O1"]["absolute_uv2"] == 12.0
    assert abs(bp["bands"]["alpha"]["channels"]["O1"]["relative_pct"] - 35.0) < 1e-6
    assert bp["derived_ratios"]["frontal_alpha_asymmetry"]["F3_F4"] == 0.11


def test_modalities_for_conditions_mapping() -> None:
    """Each flagged condition maps to the CONTRACT-specified top modalities."""
    from app.services.qeeg_ai_interpreter import _modalities_for_conditions

    assert _modalities_for_conditions(["depression"]) == ["tdcs", "rtms", "neurofeedback"]
    assert _modalities_for_conditions(["adhd"]) == ["neurofeedback", "tdcs"]
    assert _modalities_for_conditions(["anxiety"]) == ["neurofeedback", "hrv", "ces"]
    assert _modalities_for_conditions(["ptsd"]) == ["emdr", "neurofeedback", "tdcs"]
    assert _modalities_for_conditions(["chronic_pain"]) == ["tdcs", "tens", "neurofeedback"]
    # Unknown condition → default
    assert _modalities_for_conditions(["weirdness"]) == ["neurofeedback", "tdcs", "rtms"]
    # Empty → default
    assert _modalities_for_conditions(None) == ["neurofeedback", "tdcs", "rtms"]


def test_query_rag_literature_returns_empty_when_module_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """RAG import failure must be swallowed — empty list + non-grounded flag."""
    import builtins as _builtins

    real_import = _builtins.__import__

    def _blocked_import(name: str, *args: Any, **kwargs: Any) -> Any:
        if name.startswith("deepsynaps_qeeg.report"):
            raise ImportError("simulated missing rag")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(_builtins, "__import__", _blocked_import)

    from app.services.qeeg_ai_interpreter import _query_rag_literature

    hits, grounded = _query_rag_literature(["adhd"], ["neurofeedback", "tdcs"])
    assert hits == []
    assert grounded is False


# ── Test 4: run-advanced endpoint handles missing deps ───────────────────────


def test_run_advanced_endpoint_dep_missing_returns_friendly_error(
    monkeypatch: pytest.MonkeyPatch,
    client: Any,
    auth_headers: dict,
) -> None:
    """The ``/run-advanced`` route must not 500 when MNE is unavailable.

    It should write a ``dependency_missing`` marker into
    ``quality_metrics_json`` and return the analysis row.
    """
    from app.routers import qeeg_analysis_router as router_mod

    # Force the pipeline import to return None.
    monkeypatch.setattr(router_mod, "_try_import_full_pipeline", lambda: None)

    # Seed an analysis row directly via ORM for speed.
    from app.database import SessionLocal
    from app.persistence.models import QEEGAnalysis

    analysis_id = str(uuid.uuid4())
    db = SessionLocal()
    try:
        db.add(
            QEEGAnalysis(
                id=analysis_id,
                patient_id="00000000-0000-0000-0000-000000000001",
                clinician_id="clinician-demo",
                file_ref="/tmp/does_not_exist.edf",
                original_filename="x.edf",
                analysis_status="completed",
            )
        )
        db.commit()
    finally:
        db.close()

    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_id}/run-advanced",
        headers=auth_headers["clinician"],
    )
    # 200 — friendly error in body, not an HTTP failure.
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == analysis_id
    qm = body.get("quality_metrics") or {}
    assert qm.get("error") == "dependency_missing"
    assert "MNE" in qm.get("message", "") or "mne" in qm.get("message", "").lower()


# ── Test 5: End-to-end smoke for the real pipeline (skipped without MNE) ─────


@skip_without_mne
@skip_without_qeeg
def test_full_pipeline_smoke_against_reference_package() -> None:
    """When both MNE and the reference package are installed, import works."""
    from deepsynaps_qeeg.pipeline import run_full_pipeline  # type: ignore

    # We can't actually run it here (needs a real EDF fixture + heavy deps),
    # but being importable is a meaningful integration signal.
    assert callable(run_full_pipeline)
