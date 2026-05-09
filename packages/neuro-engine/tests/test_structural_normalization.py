"""Tests for neuro-engine structural/normalization.py.

All tests use synthetic StructuralBiomarkerBundle objects built directly
in-memory; no file I/O or FastSurfer binary required.

Covers:
- StructuralNormalizer.__init__: invalid volume_norm_scale
- StructuralNormalizer.normalize: empty bundle raises StructuralNormalizationError
- _get_intracranial_volume: known keys, missing key → None
- _normalize_volumes_by_icv: correct per-ICV metric names and values
- _compute_hemisphere_normalized_measures: fractions, zero-total guard
- _compute_asymmetry_indices: matching structures, zero-bilateral guard,
  non-allowed structure names skipped
- _compute_lobe_aggregates: frontal/temporal lobe volume + thickness sums
- _is_volume_metric, _base_structure_name, _extract_structure_side helpers
- NormalizedStructuralRecord.to_dict
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from deepsynaps.neuro_engine.structural.biomarkers import StructuralBiomarkerBundle
from deepsynaps.neuro_engine.structural.normalization import (
    NormalizedStructuralRecord,
    StructuralNormalizationError,
    StructuralNormalizer,
)


# ---------------------------------------------------------------------------
# Helpers: build synthetic bundles
# ---------------------------------------------------------------------------

def _bundle(
    aseg_metrics=None,
    cortical_metrics=None,
    global_metrics=None,
    *,
    subject_id: str = "P01",
    session_id: str | None = "baseline",
    tmp_path: Path | None = None,
) -> StructuralBiomarkerBundle:
    return StructuralBiomarkerBundle(
        subject_id=subject_id,
        session_id=session_id,
        source_dir=tmp_path or Path("/tmp/fake"),
        aseg_metrics=aseg_metrics or [],
        cortical_metrics=cortical_metrics or [],
        global_metrics=global_metrics or {},
        generated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        global_metric_units={},
    )


def _aseg_metric(name: str, value: float) -> dict:
    return {
        "subject_id": "P01",
        "session_id": "baseline",
        "modality": "sMRI",
        "scope": "subcortical",
        "hemisphere": None,
        "structure_name": name,
        "metric_name": "volume_mm3",
        "value": value,
        "unit": "mm^3",
        "source_file": "aseg.stats",
    }


def _cortical_metric(
    hemisphere: str,
    structure: str,
    metric_name: str,
    value: float,
) -> dict:
    return {
        "subject_id": "P01",
        "session_id": "baseline",
        "modality": "sMRI",
        "scope": "cortical",
        "hemisphere": hemisphere,
        "structure_name": structure,
        "metric_name": metric_name,
        "value": value,
        "unit": "mm^3" if "volume" in metric_name else "mm",
        "source_file": "lh.aparc.stats",
    }


# ---------------------------------------------------------------------------
# __init__
# ---------------------------------------------------------------------------

class TestInit:
    def test_default_scale_is_1000(self):
        normalizer = StructuralNormalizer()
        assert normalizer.volume_norm_scale == 1000.0

    def test_custom_scale_accepted(self):
        normalizer = StructuralNormalizer(volume_norm_scale=500.0)
        assert normalizer.volume_norm_scale == 500.0

    def test_zero_scale_raises(self):
        with pytest.raises(ValueError, match="volume_norm_scale must be positive"):
            StructuralNormalizer(volume_norm_scale=0.0)

    def test_negative_scale_raises(self):
        with pytest.raises(ValueError):
            StructuralNormalizer(volume_norm_scale=-100.0)


# ---------------------------------------------------------------------------
# normalize — empty bundle
# ---------------------------------------------------------------------------

class TestNormalizeErrors:
    def test_empty_bundle_raises(self):
        normalizer = StructuralNormalizer()
        b = _bundle()
        with pytest.raises(StructuralNormalizationError, match="empty"):
            normalizer.normalize(b)


# ---------------------------------------------------------------------------
# _get_intracranial_volume
# ---------------------------------------------------------------------------

class TestGetIntracranialVolume:
    def test_etiv_key_returned(self):
        b = _bundle(global_metrics={"eTIV": 1500000.0}, aseg_metrics=[_aseg_metric("Hippocampus", 1000.0)])
        normalizer = StructuralNormalizer()
        icv = normalizer._get_intracranial_volume(b)
        assert icv == pytest.approx(1500000.0)

    def test_estimated_total_intracranial_key_returned(self):
        b = _bundle(global_metrics={"estimated_total_intracranial_volume_mm3": 1200000.0},
                    aseg_metrics=[_aseg_metric("H", 500.0)])
        normalizer = StructuralNormalizer()
        assert normalizer._get_intracranial_volume(b) == pytest.approx(1200000.0)

    def test_missing_icv_returns_none(self):
        b = _bundle(global_metrics={"some_other_key": 999.0},
                    aseg_metrics=[_aseg_metric("H", 500.0)])
        normalizer = StructuralNormalizer()
        assert normalizer._get_intracranial_volume(b) is None

    def test_zero_icv_ignored_returns_none(self):
        b = _bundle(global_metrics={"eTIV": 0.0},
                    aseg_metrics=[_aseg_metric("H", 500.0)])
        normalizer = StructuralNormalizer()
        assert normalizer._get_intracranial_volume(b) is None


# ---------------------------------------------------------------------------
# _normalize_volumes_by_icv
# ---------------------------------------------------------------------------

class TestNormalizeVolumesByIcv:
    def test_per_icv_metric_name_has_suffix(self):
        records = [_aseg_metric("Left-Hippocampus", 3000.0)]
        normalizer = StructuralNormalizer(volume_norm_scale=1000.0)
        output = normalizer._normalize_volumes_by_icv(records, icv=1500000.0)
        assert len(output) == 1
        assert output[0].metric_name == "volume_mm3_per_icv"

    def test_per_icv_value_computed_correctly(self):
        records = [_aseg_metric("Left-Hippocampus", 3000.0)]
        normalizer = StructuralNormalizer(volume_norm_scale=1000.0)
        output = normalizer._normalize_volumes_by_icv(records, icv=1500000.0)
        expected = (3000.0 / 1500000.0) * 1000.0
        assert output[0].value == pytest.approx(expected)

    def test_non_volume_record_skipped(self):
        records = [
            {
                "subject_id": "P01", "session_id": None, "modality": "sMRI",
                "scope": "cortical", "hemisphere": "lh", "structure_name": "superiortemporal",
                "metric_name": "mean_thickness_mm", "value": 2.5, "unit": "mm",
                "source_file": "lh.aparc.stats",
            }
        ]
        normalizer = StructuralNormalizer()
        output = normalizer._normalize_volumes_by_icv(records, icv=1500000.0)
        assert output == []


# ---------------------------------------------------------------------------
# _compute_hemisphere_normalized_measures
# ---------------------------------------------------------------------------

class TestHemisphereNormalizedMeasures:
    def test_fractions_sum_to_one_per_hemisphere(self):
        records = [
            _cortical_metric("lh", "precentral", "gray_matter_volume_mm3", 1000.0),
            _cortical_metric("lh", "superiorfrontal", "gray_matter_volume_mm3", 3000.0),
        ]
        normalizer = StructuralNormalizer()
        output = normalizer._compute_hemisphere_normalized_measures(records)
        fractions = [r.value for r in output if r.hemisphere == "lh"]
        assert abs(sum(fractions) - 1.0) < 1e-6

    def test_zero_hemisphere_total_produces_no_output(self):
        records = [
            _cortical_metric("lh", "precentral", "gray_matter_volume_mm3", 0.0),
        ]
        normalizer = StructuralNormalizer()
        output = normalizer._compute_hemisphere_normalized_measures(records)
        assert output == []

    def test_non_gray_matter_records_excluded(self):
        records = [
            _cortical_metric("lh", "precentral", "mean_thickness_mm", 2.5),
        ]
        normalizer = StructuralNormalizer()
        output = normalizer._compute_hemisphere_normalized_measures(records)
        assert output == []


# ---------------------------------------------------------------------------
# _compute_asymmetry_indices
# ---------------------------------------------------------------------------

class TestAsymmetryIndices:
    def test_hippocampus_pair_produces_asymmetry_index(self):
        records = [
            _aseg_metric("Left-Hippocampus", 3000.0),
            _aseg_metric("Right-Hippocampus", 2800.0),
        ]
        # Make records have hemisphere field inferred from structure name
        records[0]["hemisphere"] = None   # will be inferred from name
        records[1]["hemisphere"] = None

        # Manually set correct hemisphere for extraction path
        records[0]["structure_name"] = "Left-Hippocampus"
        records[1]["structure_name"] = "Right-Hippocampus"

        normalizer = StructuralNormalizer()
        output = normalizer._compute_asymmetry_indices(records)
        ai_records = [r for r in output if r.metric_name == "asymmetry_index_percent"]
        assert len(ai_records) >= 1
        val = ai_records[0].value
        expected = (abs(3000.0 - 2800.0) / (3000.0 + 2800.0)) * 100.0
        assert val == pytest.approx(expected)

    def test_zero_bilateral_total_skipped(self):
        records = [
            _aseg_metric("Left-Hippocampus", 0.0),
            _aseg_metric("Right-Hippocampus", 0.0),
        ]
        records[0]["hemisphere"] = None
        records[1]["hemisphere"] = None
        normalizer = StructuralNormalizer()
        output = normalizer._compute_asymmetry_indices(records)
        ai_records = [r for r in output if r.metric_name == "asymmetry_index_percent"]
        assert ai_records == []

    def test_non_allowed_structure_skipped(self):
        records = [_aseg_metric("Left-Caudate", 500.0), _aseg_metric("Right-Caudate", 450.0)]
        records[0]["hemisphere"] = None
        records[1]["hemisphere"] = None
        normalizer = StructuralNormalizer()
        output = normalizer._compute_asymmetry_indices(records)
        # Caudate is not in the allowed set
        assert output == []


# ---------------------------------------------------------------------------
# _compute_lobe_aggregates
# ---------------------------------------------------------------------------

class TestLobeAggregates:
    def test_frontal_lobe_volume_sum_computed(self):
        records = [
            _cortical_metric("lh", "precentral", "gray_matter_volume_mm3", 1000.0),
            _cortical_metric("lh", "superiorfrontal", "gray_matter_volume_mm3", 2000.0),
        ]
        normalizer = StructuralNormalizer()
        output = normalizer._compute_lobe_aggregates(records)
        frontal_vols = [r for r in output
                        if r.structure_name == "frontal_lobe"
                        and r.metric_name == "lobe_gray_matter_volume_mm3"
                        and r.hemisphere == "lh"]
        assert len(frontal_vols) == 1
        assert frontal_vols[0].value == pytest.approx(3000.0)

    def test_temporal_lobe_thickness_mean_computed(self):
        records = [
            _cortical_metric("rh", "superiortemporal", "mean_thickness_mm", 2.5),
            _cortical_metric("rh", "middletemporal", "mean_thickness_mm", 2.3),
        ]
        normalizer = StructuralNormalizer()
        output = normalizer._compute_lobe_aggregates(records)
        temporal_thick = [r for r in output
                          if r.structure_name == "temporal_lobe"
                          and r.metric_name == "lobe_mean_thickness_mm"
                          and r.hemisphere == "rh"]
        assert len(temporal_thick) == 1
        assert temporal_thick[0].value == pytest.approx((2.5 + 2.3) / 2.0)

    def test_unknown_region_not_aggregated(self):
        records = [_cortical_metric("lh", "unknownregion", "gray_matter_volume_mm3", 5000.0)]
        normalizer = StructuralNormalizer()
        output = normalizer._compute_lobe_aggregates(records)
        assert output == []


# ---------------------------------------------------------------------------
# _is_volume_metric / _base_structure_name / _extract_structure_side
# ---------------------------------------------------------------------------

class TestHelpers:
    def test_is_volume_metric_true_for_mm3_unit(self):
        assert StructuralNormalizer._is_volume_metric({"unit": "mm^3", "metric_name": "x"})

    def test_is_volume_metric_true_for_volume_mm3_in_name(self):
        assert StructuralNormalizer._is_volume_metric({"unit": "mm", "metric_name": "gray_matter_volume_mm3"})

    def test_is_volume_metric_false_for_thickness(self):
        assert not StructuralNormalizer._is_volume_metric({"unit": "mm", "metric_name": "mean_thickness_mm"})

    def test_base_structure_name_strips_lh_prefix(self):
        assert StructuralNormalizer._base_structure_name("lh_superiortemporal") == "superiortemporal"

    def test_base_structure_name_strips_left_dash(self):
        result = StructuralNormalizer._base_structure_name("Left-Hippocampus")
        assert "left" not in result.lower()
        assert "hippocampus" in result.lower()

    def test_base_structure_name_strips_proper_suffix(self):
        result = StructuralNormalizer._base_structure_name("cortexproper")
        assert not result.endswith("proper")

    def test_base_structure_name_none_returns_empty(self):
        assert StructuralNormalizer._base_structure_name(None) == ""

    def test_extract_structure_side_from_hemisphere_field(self):
        normalizer = StructuralNormalizer()
        record = {"hemisphere": "lh", "structure_name": "superiortemporal"}
        base, side = normalizer._extract_structure_side(record)
        assert side == "lh"
        assert "superior" in base or "temporal" in base

    def test_extract_structure_side_from_left_prefix(self):
        normalizer = StructuralNormalizer()
        record = {"hemisphere": None, "structure_name": "Left-Hippocampus"}
        _, side = normalizer._extract_structure_side(record)
        assert side == "lh"

    def test_extract_structure_side_from_right_prefix(self):
        normalizer = StructuralNormalizer()
        record = {"hemisphere": None, "structure_name": "Right-Amygdala"}
        _, side = normalizer._extract_structure_side(record)
        assert side == "rh"


# ---------------------------------------------------------------------------
# NormalizedStructuralRecord.to_dict
# ---------------------------------------------------------------------------

class TestNormalizedStructuralRecordToDict:
    def test_to_dict_has_all_fields(self):
        r = NormalizedStructuralRecord(
            subject_id="P01",
            session_id="baseline",
            modality="sMRI",
            scope="derived",
            hemisphere="lh",
            structure_name="frontal_lobe",
            metric_name="lobe_gray_matter_volume_mm3",
            value=10000.0,
            unit="mm^3",
            source_metric_name="gray_matter_volume_mm3",
            source_file="lh.aparc.stats",
        )
        d = r.to_dict()
        assert d["subject_id"] == "P01"
        assert d["metric_name"] == "lobe_gray_matter_volume_mm3"
        assert d["value"] == 10000.0
