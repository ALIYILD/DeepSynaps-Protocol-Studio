"""Supplementary tests for ``deepsynaps_mri.safety``.

The existing test_safety.py covers the core happy path. This file
fills the safety / decision-support edge branches:

- safe_brain_age: every degenerate input path is tested -> the
  function never returns garbage; it returns ``status='not_estimable'``
  + an audit reason. This is the load-bearing safety contract: the API
  surface NEVER renders an implausible age.
- severity_label_from_z: bucket boundaries (1.5 / 2.0 / 3.0) and
  sub-threshold None.
- format_observation_text: hedged "Observation: ... requires clinical
  correlation" wording — refactor cannot dilute this.
- build_finding: stable JSON shape including
  requires_clinical_correlation=True.
- findings_from_structural: handles both dict + Pydantic model inputs,
  skips unflagged regions.
- to_fusion_payload: emits the schema_version="mri.v1" envelope with
  every required field including the disclaimer.
"""
from __future__ import annotations

from typing import Any

import pytest

from deepsynaps_mri.safety import (
    BRAIN_AGE_GAP_MAX_YEARS,
    BRAIN_AGE_MAX_YEARS,
    BRAIN_AGE_MIN_YEARS,
    DEFAULT_BRAIN_AGE_PROVENANCE,
    FUSION_PAYLOAD_VERSION,
    _ensure_dict,
    _get,
    _tuple_or_none,
    build_finding,
    findings_from_structural,
    format_observation_text,
    safe_brain_age,
    severity_label_from_z,
    to_fusion_payload,
)
from deepsynaps_mri.schemas import (
    BrainAgePrediction,
    MRIReport,
    NormedValue,
    PatientMeta,
    QCMetrics,
    StructuralMetrics,
)


# ── safe_brain_age ─────────────────────────────────────────────────────────


class TestSafeBrainAge:
    def test_none_input_returns_dependency_missing(self) -> None:
        out = safe_brain_age(None)
        assert out.status == "dependency_missing"
        assert "No brain-age" in (out.error_message or "")
        assert out.calibration_provenance == DEFAULT_BRAIN_AGE_PROVENANCE

    def test_already_failed_status_passes_through(self) -> None:
        # Pin: an already-failed prediction is returned untouched (with
        # provenance set if missing) — never silently flipped to 'ok'.
        out = safe_brain_age(BrainAgePrediction(status="failed"))
        assert out.status == "failed"

    def test_missing_predicted_age_marks_not_estimable(self) -> None:
        # Status='ok' but no predicted_age → the safety wrapper flips
        # status to 'not_estimable' instead of returning a NaN prediction.
        out = safe_brain_age(
            BrainAgePrediction(status="ok", predicted_age_years=None),
        )
        assert out.status == "not_estimable"
        assert "no predicted_age_years" in (out.not_estimable_reason or "")

    def test_predicted_below_floor_marks_not_estimable(self) -> None:
        out = safe_brain_age(
            BrainAgePrediction(status="ok", predicted_age_years=1.0),
        )
        assert out.status == "not_estimable"
        assert "below plausibility floor" in (out.not_estimable_reason or "")
        assert out.predicted_age_years is None  # wiped to avoid leakage

    def test_predicted_above_ceiling_marks_not_estimable(self) -> None:
        out = safe_brain_age(
            BrainAgePrediction(status="ok", predicted_age_years=120.0),
        )
        assert out.status == "not_estimable"
        assert "above plausibility ceiling" in (out.not_estimable_reason or "")

    def test_implausible_gap_marks_not_estimable(self) -> None:
        # |gap| > 30 should trip the safety wrapper.
        out = safe_brain_age(
            BrainAgePrediction(
                status="ok",
                predicted_age_years=70.0,
                brain_age_gap_years=40.0,
            ),
        )
        assert out.status == "not_estimable"
        assert "exceeds plausible max" in (out.not_estimable_reason or "")

    def test_valid_prediction_gets_confidence_band(self) -> None:
        # Pin the load-bearing decision-support contract: a valid
        # prediction is wrapped with confidence_band_years and provenance.
        out = safe_brain_age(
            BrainAgePrediction(
                status="ok",
                predicted_age_years=58.7,
                brain_age_gap_years=2.1,
                mae_years_reference=3.3,
            ),
        )
        assert out.status == "ok"
        assert out.confidence_band_years is not None
        lo, hi = out.confidence_band_years
        assert lo == pytest.approx(55.4, rel=1e-2)
        assert hi == pytest.approx(62.0, rel=1e-2)
        assert out.calibration_provenance is not None

    def test_confidence_band_clamped_to_age_bounds(self) -> None:
        # When predicted is near 4.0 with mae=10.0, the band is clamped
        # to [3.0, 14.0] — not negative numbers.
        out = safe_brain_age(
            BrainAgePrediction(
                status="ok",
                predicted_age_years=4.0,
                mae_years_reference=10.0,
            ),
            min_age=3.0,
        )
        assert out.confidence_band_years[0] >= 3.0


# ── severity_label_from_z ──────────────────────────────────────────────────


class TestSeverityFromZ:
    def test_none_returns_none(self) -> None:
        assert severity_label_from_z(None) is None

    def test_marked_at_or_above_3(self) -> None:
        assert severity_label_from_z(3.0) == "marked"
        assert severity_label_from_z(-3.5) == "marked"

    def test_moderate_between_2_and_3(self) -> None:
        assert severity_label_from_z(2.0) == "moderate"
        assert severity_label_from_z(-2.5) == "moderate"

    def test_mild_between_1_5_and_2(self) -> None:
        assert severity_label_from_z(1.5) == "mild"
        assert severity_label_from_z(-1.7) == "mild"

    def test_below_1_5_returns_none(self) -> None:
        assert severity_label_from_z(1.0) is None
        assert severity_label_from_z(-0.5) is None

    def test_non_numeric_returns_none(self) -> None:
        assert severity_label_from_z("garbage") is None  # type: ignore[arg-type]


# ── format_observation_text ────────────────────────────────────────────────


class TestFormatObservationText:
    def test_includes_clinical_correlation_disclaimer(self) -> None:
        # Pin the load-bearing safety wording: every observation MUST
        # carry "requires clinical correlation" — the MHRA / FDA
        # decision-support hedge.
        out = format_observation_text(
            region="L-Hippocampus",
            metric="volume",
            value=3500.0,
            unit="mm^3",
            z=-2.5,
        )
        assert "requires clinical correlation" in out
        # No diagnosis verbs.
        assert "diagnose" not in out.lower()
        assert "diagnosis" not in out.lower()

    def test_above_below_direction_from_z_sign(self) -> None:
        below = format_observation_text(
            region="X", metric="m", value=1.0, unit="mm", z=-2.5,
        )
        above = format_observation_text(
            region="X", metric="m", value=1.0, unit="mm", z=2.5,
        )
        assert "below" in below
        assert "above" in above

    def test_no_z_no_direction_no_severity(self) -> None:
        out = format_observation_text(
            region="X", metric="m", value=1.0, unit="mm", z=None,
        )
        # Still carries the clinical-correlation tail.
        assert "requires clinical correlation" in out

    def test_value_without_unit_renders(self) -> None:
        out = format_observation_text(
            region="X", metric="m", value=42, unit=None, z=None,
        )
        assert "42" in out


# ── build_finding ─────────────────────────────────────────────────────────


class TestBuildFinding:
    def test_envelope_includes_all_documented_keys(self) -> None:
        out = build_finding(
            region="X",
            metric="m",
            value=1.0,
            unit="mm",
            z=-2.5,
            percentile=2.0,
            reference_range=(0.5, 1.5),
            confidence="high",
            model_id="model-v1",
        )
        assert set(out.keys()) >= {
            "region_name",
            "metric",
            "value",
            "unit",
            "z",
            "percentile",
            "reference_range",
            "confidence",
            "severity",
            "model_id",
            "observation_text",
            "requires_clinical_correlation",
        }
        # Pin: the hedge flag is hard True so consumers can't render
        # this as a definitive finding.
        assert out["requires_clinical_correlation"] is True
        # Severity is bucketed via the same z-score thresholds.
        assert out["severity"] == "moderate"  # |z|=2.5 → moderate

    def test_partial_observation_with_only_region_and_metric(self) -> None:
        out = build_finding(region="X", metric="m", value=None, unit=None, z=None)
        assert out["region_name"] == "X"
        assert out["severity"] is None
        assert out["requires_clinical_correlation"] is True

    def test_reference_range_serialised_as_list(self) -> None:
        out = build_finding(
            region="X", metric="m", value=1.0, reference_range=(0.5, 1.5),
        )
        assert out["reference_range"] == [0.5, 1.5]


# ── findings_from_structural ──────────────────────────────────────────────


class TestFindingsFromStructural:
    def test_none_returns_empty(self) -> None:
        assert findings_from_structural(None) == []

    def test_dict_input_with_flagged_cortical_thickness(self) -> None:
        struct = {
            "cortical_thickness_mm": {
                "L-Hippocampus": {"value": 2.3, "z": -2.6, "flagged": True},
            },
            "subcortical_volume_mm3": {},
        }
        out = findings_from_structural(struct)
        assert len(out) == 1
        assert out[0]["region_name"] == "L-Hippocampus"
        assert out[0]["metric"] == "cortical_thickness"

    def test_pydantic_input_with_flagged_subcortical(self) -> None:
        struct = StructuralMetrics(
            subcortical_volume_mm3={
                "L-Hippocampus": NormedValue(value=2800.0, z=-2.5, flagged=True),
            },
        )
        out = findings_from_structural(struct)
        assert len(out) == 1
        assert out[0]["metric"] == "subcortical_volume"

    def test_unflagged_no_z_skipped(self) -> None:
        # Pin: regions with neither flagged=True nor a z-score are
        # filtered out so the findings list stays clinically actionable.
        struct = {
            "cortical_thickness_mm": {
                "X": {"value": 2.5, "flagged": False},  # no z
            },
            "subcortical_volume_mm3": {},
        }
        out = findings_from_structural(struct)
        assert out == []


# ── _ensure_dict / _tuple_or_none / _get ──────────────────────────────────


class TestPrivateHelpers:
    def test_ensure_dict_passes_through(self) -> None:
        assert _ensure_dict({"x": 1}) == {"x": 1}

    def test_ensure_dict_none_returns_empty(self) -> None:
        assert _ensure_dict(None) == {}

    def test_ensure_dict_pydantic_model_dumped(self) -> None:
        nv = NormedValue(value=1.0)
        out = _ensure_dict(nv)
        assert isinstance(out, dict)
        assert out["value"] == 1.0

    def test_ensure_dict_garbage_returns_empty(self) -> None:
        assert _ensure_dict("string") == {}

    def test_tuple_or_none_2tuple(self) -> None:
        assert _tuple_or_none((1.0, 2.0)) == (1.0, 2.0)
        assert _tuple_or_none([1, 2]) == (1.0, 2.0)

    def test_tuple_or_none_invalid(self) -> None:
        assert _tuple_or_none(None) is None
        assert _tuple_or_none((1.0,)) is None
        assert _tuple_or_none(("a", "b")) is None

    def test_get_dict(self) -> None:
        assert _get({"x": 1}, "x") == 1

    def test_get_object(self) -> None:
        class _O:
            x = 7
        assert _get(_O(), "x") == 7

    def test_get_none(self) -> None:
        assert _get(None, "x") is None


# ── to_fusion_payload ─────────────────────────────────────────────────────


def _minimal_report() -> MRIReport:
    return MRIReport(
        patient=PatientMeta(patient_id="P-001"),
        modalities_present=[],
        qc=QCMetrics(passed=True),
    )


class TestToFusionPayload:
    def test_envelope_has_required_keys(self) -> None:
        out = to_fusion_payload(_minimal_report())
        assert out["schema_version"] == FUSION_PAYLOAD_VERSION == "mri.v1"
        assert set(out.keys()) >= {
            "schema_version",
            "subject_id",
            "modality",
            "qc",
            "findings",
            "brain_age",
            "stim_targets",
            "provenance",
        }
        assert out["modality"] == "mri"

    def test_disclaimer_phrases_pinned(self) -> None:
        # Pin the load-bearing posture: "Decision-support tool" + "Not a
        # medical device" + "clinical correlation" — refactor cannot
        # dilute these.
        out = to_fusion_payload(_minimal_report())
        disc = out["provenance"]["disclaimer"]
        assert "Decision-support tool" in disc
        assert "Not a medical device" in disc
        assert "clinical correlation" in disc

    def test_subject_id_falls_back_to_patient_id(self) -> None:
        out = to_fusion_payload(_minimal_report())
        assert out["subject_id"] == "P-001"

    def test_explicit_subject_id_overrides(self) -> None:
        out = to_fusion_payload(_minimal_report(), subject_id="external-id")
        assert out["subject_id"] == "external-id"

    def test_brain_age_block_emitted_when_structural_carries_it(self) -> None:
        report = _minimal_report()
        report.structural = StructuralMetrics(
            brain_age=BrainAgePrediction(
                status="ok",
                predicted_age_years=58.0,
                brain_age_gap_years=2.0,
            ),
        )
        out = to_fusion_payload(report)
        assert out["brain_age"] is not None
        assert out["brain_age"]["status"] == "ok"
        assert out["brain_age"]["predicted_age_years"] == 58.0

    def test_dict_input_works(self) -> None:
        # Pydantic-free input shape (cached payload dict).
        d = {
            "patient": {"patient_id": "X"},
            "qc": {"passed": True},
            "stim_targets": [],
        }
        out = to_fusion_payload(d)
        assert out["subject_id"] == "X"
        assert out["qc"]["passed"] is True

    def test_stim_targets_have_clinician_review_flag(self) -> None:
        d = {
            "patient": {"patient_id": "X"},
            "qc": {"passed": True},
            "stim_targets": [
                {
                    "target_id": "T1",
                    "modality": "rtms",
                    "region_name": "L-DLPFC",
                    "mni_xyz": [-40, 44, 30],
                    "confidence": "high",
                    "method": "MNI atlas",
                },
            ],
        }
        out = to_fusion_payload(d)
        # Pin: every stim target ALWAYS carries
        # requires_clinician_review=True so the consuming UI cannot
        # auto-deliver a stim target without clinician sign-off.
        assert out["stim_targets"][0]["requires_clinician_review"] is True
