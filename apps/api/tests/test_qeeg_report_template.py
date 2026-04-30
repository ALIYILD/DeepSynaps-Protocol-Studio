"""Phase 0 contract tests for QEEGBrainMapReport.

Verify:
  - The Pydantic model validates a minimal pipeline result.
  - The DK narrative bank loads and covers ≥33 of 34 DK regions per hemisphere.
  - The factory produces a 68-row dk_atlas with correct hemisphere/lobe metadata.
  - Regulatory copy: disclaimer is research/wellness, never "diagnosis".
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.qeeg_report_template import (
    DEFAULT_DISCLAIMER,
    DK_ROIS_PER_HEMISPHERE,
    REPORT_SCHEMA_VERSION,
    QEEGBrainMapReport,
    compute_brain_function_score,
    compute_indicators,
    from_pipeline_result,
    load_narrative_bank,
)


def _sample_pipeline_dict() -> dict:
    """Pipeline-shaped fixture mirroring run_pipeline_safe() output keys."""
    roi_features = {}
    roi_zscores = {}
    for roi in DK_ROIS_PER_HEMISPHERE:
        for hemi in ("lh", "rh"):
            key = f"{hemi}.{roi}"
            roi_features[key] = {
                "abs_power_uv2": 1.23,
                "rel_power_pct": 0.12,
                "percentile_lt": 50.0 if hemi == "lh" else None,
                "percentile_rt": 60.0 if hemi == "rh" else None,
            }
            roi_zscores[key] = {"z": 0.4, "band": "alpha"}

    return {
        "success": True,
        "features": {
            "spectral": {
                "theta_beta_ratio": 4.1,
                "theta_beta_ratio_percentile": 77.8,
                "peak_alpha_frequency_hz": 8.8,
                "peak_alpha_frequency_percentile": 22.2,
                "alpha_reactivity_ratio": 1.4,
                "alpha_reactivity_percentile": 35.0,
            },
            "asymmetry": {
                "hemisphere_laterality_index": 0.12,
                "hemisphere_laterality_percentile": 41.7,
            },
            "aperiodic": {
                "ai_estimated_brain_age_years": 9.3,
            },
            "lobe_percentiles": {
                "frontal":   {"lt": 47.6, "rt": 46.4},
                "temporal":  {"lt": 50.5, "rt": 52.5},
                "parietal":  {"lt": 75.2, "rt": 76.9},
                "occipital": {"lt": 66.1, "rt": 57.8},
            },
            "source": {"roi_band_power": roi_features},
        },
        "zscores": {"roi": roi_zscores, "topomap_url": "/static/topomaps/abc.png"},
        "flagged_conditions": ["adhd_pattern_watch"],
        "quality": {
            "n_clean_epochs": 84,
            "channels_used": ["Fp1", "Fp2", "F3", "F4", "C3", "C4", "P3", "P4", "O1", "O2"],
        },
        "qc_flags": [],
        "confidence": {"global": 0.78},
        "method_provenance": {
            "pipeline_version": "0.5.0",
            "norm_db_version": "lemip+hbn-v1",
        },
        "limitations": ["template fsaverage source model"],
    }


def test_narrative_bank_loads_and_has_required_rois() -> None:
    bank = load_narrative_bank()
    # iSyncBrain sample covers 33 of 34 DK regions; isthmuscingulate is the
    # documented gap (empty arrays, narrative_source: null).
    populated = [
        roi for roi in DK_ROIS_PER_HEMISPHERE
        if (bank.get(roi) or {}).get("functions")
    ]
    assert len(populated) >= 33, f"only {len(populated)} populated DK regions in bank"
    assert "rostralmiddlefrontal" in bank
    assert bank["rostralmiddlefrontal"]["code"] == "F5"
    assert bank["rostralmiddlefrontal"]["lobe"] == "frontal"


def test_compute_indicators_from_features() -> None:
    features = _sample_pipeline_dict()["features"]
    ind = compute_indicators(features)
    assert ind.tbr.value == pytest.approx(4.1)
    assert ind.tbr.percentile == pytest.approx(77.8)
    assert ind.tbr.band == "balanced"  # 16 < 77.8 < 84
    assert ind.occipital_paf.value == pytest.approx(8.8)
    assert ind.occipital_paf.unit == "Hz"
    assert ind.occipital_paf.band == "balanced"
    assert ind.ai_brain_age.value == pytest.approx(9.3)


def test_compute_brain_function_score_clamps_and_averages() -> None:
    features = _sample_pipeline_dict()["features"]
    score = compute_brain_function_score(features)
    # Mean of [47.6, 46.4, 50.5, 52.5, 75.2, 76.9, 66.1, 57.8] ≈ 59.125
    assert 58.0 < score < 60.0
    # Clamping
    assert compute_brain_function_score({"lobe_percentiles": {"frontal": {"lt": 200, "rt": 200}}}) == 100.0
    assert compute_brain_function_score({}) == 0.0


def test_from_pipeline_result_round_trip() -> None:
    pipeline = _sample_pipeline_dict()
    patient = {
        "client_name": "Aarush Patel",
        "sex": "male",
        "dob": "2018-05-20",
        "age_years": 7.4,
        "eeg_acquisition_date": "2025-10-13",
        "eyes_condition": "eyes_closed",
    }
    report = from_pipeline_result(pipeline, patient_meta=patient)

    # Header
    assert report.header.client_name == "Aarush Patel"
    assert report.header.eyes_condition == "eyes_closed"

    # Indicators
    assert report.indicators.tbr.percentile == pytest.approx(77.8)
    assert report.indicators.occipital_paf.value == pytest.approx(8.8)

    # Lobe summary
    assert report.lobe_summary.parietal.lt_percentile == pytest.approx(75.2)
    assert report.lobe_summary.parietal.lt_band == "balanced"

    # DK atlas: 68 rows (34 ROIs × 2 hemispheres)
    assert len(report.dk_atlas) == 68
    hemis = {(r.roi, r.hemisphere) for r in report.dk_atlas}
    assert len(hemis) == 68
    f5 = next(r for r in report.dk_atlas if r.roi == "rostralmiddlefrontal" and r.hemisphere == "lh")
    assert f5.code == "F5"
    assert f5.lobe == "frontal"
    assert f5.functions, "F5 should have functions populated from narrative bank"

    # Source map
    assert len(report.source_map.dk_roi_zscores) == 68
    assert report.source_map.topomap_url == "/static/topomaps/abc.png"

    # Findings derived from flagged_conditions
    assert any(f.description == "adhd_pattern_watch" for f in report.ai_narrative.findings)

    # Quality + provenance
    assert report.quality.n_clean_epochs == 84
    assert "Fp1" in report.quality.channels_used
    assert report.provenance.pipeline_version == "0.5.0"
    assert report.provenance.schema_version == REPORT_SCHEMA_VERSION

    # Disclaimer
    assert report.disclaimer == DEFAULT_DISCLAIMER
    assert "diagnosis" not in report.disclaimer.lower().replace("not a medical diagnosis", "")


def test_disclaimer_and_regulatory_copy() -> None:
    report = QEEGBrainMapReport()
    # The default disclaimer must explicitly say it is NOT a diagnosis.
    assert "not a medical diagnosis" in report.disclaimer.lower()
    assert "research" in report.disclaimer.lower() or "wellness" in report.disclaimer.lower()


def test_json_serialization_round_trip() -> None:
    report = from_pipeline_result(_sample_pipeline_dict(), patient_meta={"client_name": "Demo"})
    payload = report.model_dump(mode="json")
    # Must be JSON-serializable (this is what gets persisted to QEEGAIReport.report_payload)
    text = json.dumps(payload)
    rehydrated = QEEGBrainMapReport.model_validate(json.loads(text))
    assert rehydrated.header.client_name == "Demo"
    assert len(rehydrated.dk_atlas) == 68


def test_dk_atlas_narrative_file_is_valid_json_and_has_meta() -> None:
    path = Path(__file__).resolve().parent.parent / "app" / "data" / "dk_atlas_narrative.json"
    assert path.exists(), f"narrative bank missing at {path}"
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    assert "_meta" in data
    assert data["_meta"]["atlas"] == "Desikan-Killiany"
    assert data["_meta"]["n_rois_per_hemisphere"] == 34
