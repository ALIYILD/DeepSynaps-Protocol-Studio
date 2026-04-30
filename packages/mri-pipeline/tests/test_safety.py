"""Tests for :mod:`deepsynaps_mri.safety`.

Covers:

* :func:`safe_brain_age` — None input, plausibility floor / ceiling,
  excessive gap, NaN handling, ok-path adds confidence band + provenance,
  passthrough of dependency_missing / failed envelopes.
* :func:`build_finding` / :func:`format_observation_text` — hedged
  language, requires_clinical_correlation always True, severity bucketing.
* :func:`to_fusion_payload` — narrow + stable shape, includes findings,
  brain_age, qc, provenance.
"""
from __future__ import annotations

import math

import pytest

from deepsynaps_mri import safety
from deepsynaps_mri.schemas import (
    BrainAgePrediction,
    MRIReport,
    NormedValue,
    PatientMeta,
    QCMetrics,
    Sex,
    StructuralMetrics,
)


# ---------------------------------------------------------------------------
# safe_brain_age
# ---------------------------------------------------------------------------
def test_safe_brain_age_none_returns_dependency_missing() -> None:
    out = safety.safe_brain_age(None)
    assert out.status == "dependency_missing"
    assert out.calibration_provenance


def test_safe_brain_age_passthrough_dependency_missing() -> None:
    pred = BrainAgePrediction(status="dependency_missing", error_message="no torch")
    out = safety.safe_brain_age(pred)
    assert out.status == "dependency_missing"
    # Provenance always attached.
    assert out.calibration_provenance


def test_safe_brain_age_passthrough_failed() -> None:
    pred = BrainAgePrediction(status="failed", error_message="model crashed")
    out = safety.safe_brain_age(pred)
    assert out.status == "failed"


def test_safe_brain_age_ok_adds_confidence_band() -> None:
    pred = BrainAgePrediction(
        status="ok",
        predicted_age_years=58.7,
        chronological_age_years=54.0,
        brain_age_gap_years=4.7,
        mae_years_reference=3.3,
    )
    out = safety.safe_brain_age(pred)
    assert out.status == "ok"
    assert out.confidence_band_years is not None
    low, high = out.confidence_band_years
    assert low == pytest.approx(58.7 - 3.3, abs=1e-3)
    assert high == pytest.approx(58.7 + 3.3, abs=1e-3)
    assert out.calibration_provenance


def test_safe_brain_age_below_floor_becomes_not_estimable() -> None:
    pred = BrainAgePrediction(
        status="ok",
        predicted_age_years=-5.0,
        chronological_age_years=40.0,
    )
    out = safety.safe_brain_age(pred)
    assert out.status == "not_estimable"
    assert out.predicted_age_years is None
    assert out.not_estimable_reason
    assert "below" in out.not_estimable_reason.lower()


def test_safe_brain_age_above_ceiling_becomes_not_estimable() -> None:
    pred = BrainAgePrediction(
        status="ok",
        predicted_age_years=200.0,
        chronological_age_years=40.0,
    )
    out = safety.safe_brain_age(pred)
    assert out.status == "not_estimable"
    assert "above" in (out.not_estimable_reason or "").lower()


def test_safe_brain_age_excessive_gap_becomes_not_estimable() -> None:
    pred = BrainAgePrediction(
        status="ok",
        predicted_age_years=50.0,
        chronological_age_years=10.0,
        brain_age_gap_years=40.0,
    )
    out = safety.safe_brain_age(pred)
    assert out.status == "not_estimable"
    assert out.not_estimable_reason


def test_safe_brain_age_nan_predicted_becomes_not_estimable() -> None:
    pred = BrainAgePrediction(
        status="ok",
        predicted_age_years=float("nan"),
    )
    out = safety.safe_brain_age(pred)
    assert out.status == "not_estimable"


def test_safe_brain_age_band_clamped_to_plausibility_window() -> None:
    pred = BrainAgePrediction(
        status="ok",
        predicted_age_years=99.5,
        mae_years_reference=10.0,
    )
    out = safety.safe_brain_age(pred)
    assert out.status == "ok"
    low, high = out.confidence_band_years
    assert high <= safety.BRAIN_AGE_MAX_YEARS
    assert low >= safety.BRAIN_AGE_MIN_YEARS


# ---------------------------------------------------------------------------
# Findings + safer language
# ---------------------------------------------------------------------------
def test_severity_label_buckets_correctly() -> None:
    assert safety.severity_label_from_z(-3.5) == "marked"
    assert safety.severity_label_from_z(-2.4) == "moderate"
    assert safety.severity_label_from_z(1.6) == "mild"
    assert safety.severity_label_from_z(-0.5) is None
    assert safety.severity_label_from_z(None) is None


def test_format_observation_text_uses_hedged_language() -> None:
    text = safety.format_observation_text(
        region="acc_l", metric="cortical_thickness",
        value=2.65, unit="mm", z=-2.4,
    )
    assert "Observation:" in text
    assert "below" in text.lower()
    assert "moderate" in text.lower()
    assert "requires clinical correlation" in text.lower()
    assert "diagnos" not in text.lower()


def test_build_finding_includes_required_correlation_flag() -> None:
    finding = safety.build_finding(
        region="acc_l", metric="cortical_thickness",
        value=2.65, unit="mm", z=-2.4,
        confidence="high",
    )
    assert finding["region_name"] == "acc_l"
    assert finding["requires_clinical_correlation"] is True
    assert finding["severity"] == "moderate"
    assert finding["confidence"] == "high"
    assert "observation" in finding["observation_text"].lower()


def test_findings_from_structural_emits_only_z_or_flagged() -> None:
    metrics = StructuralMetrics(
        cortical_thickness_mm={
            "acc_l": NormedValue(value=2.65, z=-2.4, flagged=True),
            "ignored": NormedValue(value=2.5),  # no z, not flagged → skip
        },
        subcortical_volume_mm3={
            "amygdala_l": NormedValue(value=1420, z=-2.1, flagged=True),
        },
    )
    findings = safety.findings_from_structural(metrics)
    region_names = sorted(f["region_name"] for f in findings)
    assert region_names == ["acc_l", "amygdala_l"]


# ---------------------------------------------------------------------------
# to_fusion_payload
# ---------------------------------------------------------------------------
def test_to_fusion_payload_shape_smoke() -> None:
    metrics = StructuralMetrics(
        cortical_thickness_mm={
            "acc_l": NormedValue(value=2.65, z=-2.4, flagged=True),
        },
        brain_age=BrainAgePrediction(
            status="ok",
            predicted_age_years=58.7,
            chronological_age_years=54.0,
            brain_age_gap_years=4.7,
        ),
    )
    qc = QCMetrics(passed=True, notes=["ok"])
    report = MRIReport(
        patient=PatientMeta(patient_id="DS-X", age=54, sex=Sex.F),
        modalities_present=[],
        qc=qc,
        structural=metrics,
        qc_warnings=["radiology review advised: WMH"],
    )
    payload = safety.to_fusion_payload(report)
    assert payload["schema_version"] == safety.FUSION_PAYLOAD_VERSION
    assert payload["modality"] == "mri"
    assert payload["subject_id"] == "DS-X"
    assert payload["qc"]["passed"] is True
    assert payload["qc"]["warnings"] == ["radiology review advised: WMH"]
    assert payload["findings"]
    assert payload["findings"][0]["requires_clinical_correlation"] is True
    assert payload["brain_age"]["predicted_age_years"] == 58.7
    assert "disclaimer" in payload["provenance"]


def test_to_fusion_payload_handles_dict_input() -> None:
    """Function must accept a dict (rehydrated row form), not just MRIReport."""
    payload = safety.to_fusion_payload(
        {
            "patient": {"patient_id": "P1"},
            "qc": {"passed": False},
            "qc_warnings": [],
            "stim_targets": [
                {"target_id": "t1", "modality": "rtms", "region_name": "L_DLPFC",
                 "mni_xyz": [-41, 43, 28], "confidence": "high",
                 "method": "F3"},
            ],
        },
        subject_id="P1",
    )
    assert payload["subject_id"] == "P1"
    assert payload["qc"]["passed"] is False
    assert len(payload["stim_targets"]) == 1
    assert payload["stim_targets"][0]["requires_clinician_review"] is True


def test_to_fusion_payload_brain_age_block_omitted_without_structural() -> None:
    payload = safety.to_fusion_payload({"patient": {"patient_id": "P2"}})
    assert payload["brain_age"] is None
    assert payload["findings"] == []
    assert payload["stim_targets"] == []
