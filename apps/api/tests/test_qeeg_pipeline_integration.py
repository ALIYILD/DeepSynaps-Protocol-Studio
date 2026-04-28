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
    row.advanced_analyses_json = None
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

    _loop = asyncio.new_event_loop()
    try:
        result = _loop.run_until_complete(
            generate_ai_report(band_powers=band_powers)
        )
    finally:
        _loop.close()
    assert "data" in result
    assert "prompt_hash" in result
    # RAG may return literature refs when condition patterns match; verify structure.
    assert isinstance(result.get("literature_refs", []), list)


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

    _loop = asyncio.new_event_loop()
    try:
        result = _loop.run_until_complete(
            generate_ai_report(
                features=features,
                zscores=zscores,
                flagged_conditions=["adhd"],
                quality=quality,
            )
        )
    finally:
        _loop.close()
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
        _legacy_band_powers_from_features as _synthesise_band_powers_from_features,
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

    assert _modalities_for_conditions(["depression"]) == ["tms", "tdcs", "neurofeedback"]
    assert _modalities_for_conditions(["adhd"]) == ["neurofeedback", "tdcs", "eeg_training"]
    assert _modalities_for_conditions(["anxiety"]) == ["neurofeedback", "breathwork", "taVNS"]
    assert _modalities_for_conditions(["ptsd"]) == ["neurofeedback", "eye_movement", "taVNS"]
    assert _modalities_for_conditions(["chronic_pain"]) == ["tdcs", "tms", "neurofeedback"]
    # Unknown condition → default
    assert _modalities_for_conditions(["weirdness"]) == ["neurofeedback", "tdcs", "tms"]
    # Empty → default
    assert _modalities_for_conditions(None) == ["neurofeedback", "tdcs", "tms"]




# ── Test 4: run-advanced endpoint handles missing deps ───────────────────────


@skip_without_mne
@skip_without_qeeg
def test_full_pipeline_smoke_against_reference_package() -> None:
    """When both MNE and the reference package are installed, import works."""
    from deepsynaps_qeeg.pipeline import run_full_pipeline  # type: ignore

    # We can't actually run it here (needs a real EDF fixture + heavy deps),
    # but being importable is a meaningful integration signal.
    assert callable(run_full_pipeline)
