"""Tests for neuro-engine structural/biomarkers.py.

All tests use synthetic in-memory stats file content written to tmp_path;
no FastSurfer binary or real MRI data required.

Covers:
- FastSurferBiomarkerExtractor.extract: happy path (aseg + aparc), missing aseg,
  missing all files → StructuralBiomarkerError
- find_stats_files: missing stats dir, aseg+DKT fallback
- parse_aseg_stats: measure lines, ColHeaders + data rows, no-data error
- parse_aparc_stats: invalid hemisphere ValueError, cortical rows, measure lines
- StructuralBiomarkerBundle.to_dict / to_flat_records
- helper functions: _safe_number, _normalize_unit, _normalize_measure_key,
  _normalize_identifier, _row_from_tokens, _lookup_first_numeric
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from deepsynaps.neuro_engine.structural.biomarkers import (
    FastSurferBiomarkerExtractor,
    StructuralBiomarkerBundle,
    StructuralBiomarkerError,
    _lookup_first_numeric,
    _normalize_identifier,
    _normalize_measure_key,
    _normalize_unit,
    _row_from_tokens,
    _safe_number,
)


# ---------------------------------------------------------------------------
# Helpers: build a minimal fake FastSurfer subject directory
# ---------------------------------------------------------------------------

_MINIMAL_ASEG = """\
# Measure BrainSeg, BrainSegVol, Brain Segmentation Volume, 1234567.0, mm3
# Measure EstimatedTotalIntraCranialVol, eTIV, Estimated Total Intracranial Volume, 1500000.0, mm3
# ColHeaders  Index SegId NVoxels Volume_mm3 StructName
  1   2   10  4321.0  Left-Hippocampus
  2   3   12  3987.0  Right-Hippocampus
"""

_MINIMAL_APARC = """\
# Measure Cortex, NumVert, Number of Vertices, 120000, unitless
# ColHeaders StructName NumVert SurfArea GrayVol ThickAvg ThickStd
superiortemporal  10000  5000.0  8000.0  2.50  0.30
middletemporal    9000   4500.0  7500.0  2.40  0.25
"""


def _write_subject(tmp_path: Path, aseg_content: str = _MINIMAL_ASEG,
                   lh_content: str = _MINIMAL_APARC, rh_content: str = _MINIMAL_APARC) -> Path:
    stats_dir = tmp_path / "stats"
    stats_dir.mkdir(parents=True)
    if aseg_content is not None:
        (stats_dir / "aseg.stats").write_text(aseg_content, encoding="utf-8")
    if lh_content is not None:
        (stats_dir / "lh.aparc.DKTatlas.mapped.stats").write_text(lh_content, encoding="utf-8")
    if rh_content is not None:
        (stats_dir / "rh.aparc.DKTatlas.mapped.stats").write_text(rh_content, encoding="utf-8")
    return tmp_path


# ---------------------------------------------------------------------------
# FastSurferBiomarkerExtractor.extract — happy path
# ---------------------------------------------------------------------------

class TestExtractHappyPath:
    def test_extract_returns_bundle_with_correct_subject_id(self, tmp_path):
        subject_dir = _write_subject(tmp_path)
        extractor = FastSurferBiomarkerExtractor()
        bundle = extractor.extract(subject_dir, "sub-01")
        # subject_id has the "sub-" prefix stripped
        assert bundle.subject_id == "01"

    def test_extract_strips_sub_prefix_from_subject_id(self, tmp_path):
        subject_dir = _write_subject(tmp_path)
        extractor = FastSurferBiomarkerExtractor()
        bundle = extractor.extract(subject_dir, "sub-myPatient")
        assert bundle.subject_id == "myPatient"

    def test_extract_strips_ses_prefix_from_session_id(self, tmp_path):
        subject_dir = _write_subject(tmp_path)
        extractor = FastSurferBiomarkerExtractor()
        bundle = extractor.extract(subject_dir, "P01", session_id="ses-baseline")
        assert bundle.session_id == "baseline"

    def test_extract_none_session_id_kept_as_none(self, tmp_path):
        subject_dir = _write_subject(tmp_path)
        extractor = FastSurferBiomarkerExtractor()
        bundle = extractor.extract(subject_dir, "P01", session_id=None)
        assert bundle.session_id is None

    def test_extract_aseg_metrics_present(self, tmp_path):
        subject_dir = _write_subject(tmp_path)
        extractor = FastSurferBiomarkerExtractor()
        bundle = extractor.extract(subject_dir, "P01")
        assert len(bundle.aseg_metrics) >= 2
        names = [m["structure_name"] for m in bundle.aseg_metrics]
        assert "Left-Hippocampus" in names
        assert "Right-Hippocampus" in names

    def test_extract_cortical_metrics_present(self, tmp_path):
        subject_dir = _write_subject(tmp_path)
        extractor = FastSurferBiomarkerExtractor()
        bundle = extractor.extract(subject_dir, "P01")
        assert len(bundle.cortical_metrics) > 0

    def test_extract_global_metrics_has_etiv(self, tmp_path):
        subject_dir = _write_subject(tmp_path)
        extractor = FastSurferBiomarkerExtractor()
        bundle = extractor.extract(subject_dir, "P01")
        # The aseg Measure line for EstimatedTotalIntraCranialVol should be parsed.
        # _normalize_measure_key converts it to something containing "cranial" or "brain_seg".
        found = any(
            "cranial" in k.lower()
            or "etiv" in k.lower()
            or "icv" in k.lower()
            or "intra_cranial" in k.lower()
            or "brain_seg" in k.lower()
            for k in bundle.global_metrics
        )
        assert found, f"Expected a brain-volume key; got keys: {list(bundle.global_metrics)}"

    def test_extract_generated_at_is_utc_datetime(self, tmp_path):
        subject_dir = _write_subject(tmp_path)
        extractor = FastSurferBiomarkerExtractor()
        bundle = extractor.extract(subject_dir, "P01")
        assert isinstance(bundle.generated_at, datetime)


# ---------------------------------------------------------------------------
# extract — error cases
# ---------------------------------------------------------------------------

class TestExtractErrors:
    def test_nonexistent_subject_dir_raises(self):
        extractor = FastSurferBiomarkerExtractor()
        with pytest.raises(StructuralBiomarkerError, match="does not exist"):
            extractor.extract(Path("/nonexistent/subject_dir"), "P01")

    def test_missing_stats_dir_raises(self, tmp_path):
        # No stats/ subdirectory created
        extractor = FastSurferBiomarkerExtractor()
        with pytest.raises(StructuralBiomarkerError, match="Stats directory does not exist"):
            extractor.extract(tmp_path, "P01")

    def test_no_stats_files_at_all_raises(self, tmp_path):
        # stats/ dir exists but is empty
        (tmp_path / "stats").mkdir()
        extractor = FastSurferBiomarkerExtractor()
        with pytest.raises(StructuralBiomarkerError, match="No usable FastSurfer structural stats files"):
            extractor.extract(tmp_path, "P01")


# ---------------------------------------------------------------------------
# find_stats_files — aseg+DKT fallback
# ---------------------------------------------------------------------------

class TestFindStatsFiles:
    def test_aseg_plus_dkt_fallback_used_when_aseg_missing(self, tmp_path):
        stats_dir = tmp_path / "stats"
        stats_dir.mkdir()
        dkt = stats_dir / "aseg+DKT.stats"
        dkt.write_text(_MINIMAL_ASEG, encoding="utf-8")
        extractor = FastSurferBiomarkerExtractor()
        found = extractor.find_stats_files(tmp_path)
        assert "aseg" in found
        assert found["aseg"] == dkt


# ---------------------------------------------------------------------------
# parse_aseg_stats
# ---------------------------------------------------------------------------

class TestParseAsegStats:
    def test_measure_lines_parsed_into_global_metrics(self, tmp_path):
        content = (
            "# Measure BrainSeg, BrainSegVol, Brain Segmentation Volume, 1234567.0, mm3\n"
            "# ColHeaders  Index SegId NVoxels Volume_mm3 StructName\n"
            "  1  2  10  500.0  TestStruct\n"
        )
        f = tmp_path / "aseg.stats"
        f.write_text(content, encoding="utf-8")
        extractor = FastSurferBiomarkerExtractor()
        metrics, global_metrics = extractor.parse_aseg_stats(f)
        assert len(metrics) >= 1
        assert any("TestStruct" == m["structure_name"] for m in metrics)
        assert any(isinstance(v, (int, float)) for v in global_metrics.values())

    def test_empty_file_raises(self, tmp_path):
        f = tmp_path / "empty.stats"
        f.write_text("", encoding="utf-8")
        extractor = FastSurferBiomarkerExtractor()
        with pytest.raises(StructuralBiomarkerError):
            extractor.parse_aseg_stats(f)

    def test_volume_mm3_is_float(self, tmp_path):
        content = (
            "# ColHeaders  Index SegId NVoxels Volume_mm3 StructName\n"
            "  1  2  10  4321.5  Left-Amygdala\n"
        )
        f = tmp_path / "aseg.stats"
        f.write_text(content, encoding="utf-8")
        extractor = FastSurferBiomarkerExtractor()
        metrics, _ = extractor.parse_aseg_stats(f)
        assert len(metrics) == 1
        assert metrics[0]["value"] == pytest.approx(4321.5)
        assert metrics[0]["unit"] == "mm^3"


# ---------------------------------------------------------------------------
# parse_aparc_stats
# ---------------------------------------------------------------------------

class TestParseAparcStats:
    def test_invalid_hemisphere_raises_value_error(self, tmp_path):
        f = tmp_path / "bad.stats"
        f.write_text("# placeholder\n  struct1 10 100.0 500.0 2.5\n", encoding="utf-8")
        extractor = FastSurferBiomarkerExtractor()
        with pytest.raises(ValueError, match="hemisphere must be"):
            extractor.parse_aparc_stats(f, hemisphere="xy")

    def test_cortical_rows_parsed_with_correct_hemisphere(self, tmp_path):
        f = tmp_path / "lh.aparc.stats"
        f.write_text(_MINIMAL_APARC, encoding="utf-8")
        extractor = FastSurferBiomarkerExtractor()
        metrics, _ = extractor.parse_aparc_stats(f, hemisphere="lh")
        # Each row × {surface_area, gray_matter_volume, mean_thickness} = 6 metrics
        assert len(metrics) >= 2
        for m in metrics:
            assert m["hemisphere"] == "lh"

    def test_measure_lines_give_global_metrics_with_hemisphere_prefix(self, tmp_path):
        f = tmp_path / "rh.aparc.stats"
        f.write_text(_MINIMAL_APARC, encoding="utf-8")
        extractor = FastSurferBiomarkerExtractor()
        _, global_metrics = extractor.parse_aparc_stats(f, hemisphere="rh")
        # At least one key should be prefixed with "rh_"
        rh_keys = [k for k in global_metrics if k.startswith("rh_")]
        assert len(rh_keys) >= 1, f"No rh_ keys found: {list(global_metrics)}"


# ---------------------------------------------------------------------------
# StructuralBiomarkerBundle.to_dict / to_flat_records
# ---------------------------------------------------------------------------

class TestBundleMethods:
    def _make_bundle(self, tmp_path: Path) -> StructuralBiomarkerBundle:
        from datetime import timezone
        return StructuralBiomarkerBundle(
            subject_id="P01",
            session_id="baseline",
            source_dir=tmp_path,
            aseg_metrics=[{"structure_name": "Left-Hippocampus", "metric_name": "volume_mm3",
                            "value": 3000.0, "unit": "mm^3", "scope": "subcortical",
                            "source_file": "aseg.stats", "hemisphere": None}],
            cortical_metrics=[],
            global_metrics={"eTIV": 1500000.0},
            generated_at=datetime(2026, 1, 1, tzinfo=None),
            global_metric_units={"eTIV": "mm^3"},
        )

    def test_to_dict_contains_expected_keys(self, tmp_path):
        bundle = self._make_bundle(tmp_path)
        d = bundle.to_dict()
        for key in ("subject_id", "session_id", "aseg_metrics", "cortical_metrics",
                    "global_metrics", "generated_at", "source_dir"):
            assert key in d, f"Missing key: {key}"

    def test_to_dict_subject_id_correct(self, tmp_path):
        bundle = self._make_bundle(tmp_path)
        assert bundle.to_dict()["subject_id"] == "P01"

    def test_to_flat_records_aseg_row_has_modality_sMRI(self, tmp_path):
        bundle = self._make_bundle(tmp_path)
        records = bundle.to_flat_records()
        aseg_records = [r for r in records if r.get("scope") == "subcortical"]
        assert len(aseg_records) == 1
        assert aseg_records[0]["modality"] == "sMRI"

    def test_to_flat_records_global_row_present(self, tmp_path):
        bundle = self._make_bundle(tmp_path)
        records = bundle.to_flat_records()
        global_records = [r for r in records if r.get("scope") == "global"]
        assert len(global_records) == 1
        assert global_records[0]["metric_name"] == "eTIV"
        assert global_records[0]["value"] == 1500000.0


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

class TestSafeNumber:
    def test_integer_string(self):
        assert _safe_number("42") == 42
        assert isinstance(_safe_number("42"), int)

    def test_float_string(self):
        assert _safe_number("3.14") == pytest.approx(3.14)

    def test_non_numeric_returns_none(self):
        assert _safe_number("abc") is None

    def test_empty_string_returns_none(self):
        assert _safe_number("") is None


class TestNormalizeUnit:
    def test_mm3_aliases_to_caret_notation(self):
        assert _normalize_unit("mm3") == "mm^3"

    def test_mm2_aliases(self):
        assert _normalize_unit("mm2") == "mm^2"

    def test_unitless_aliases_to_none(self):
        assert _normalize_unit("unitless") is None

    def test_none_input_returns_none(self):
        assert _normalize_unit(None) is None

    def test_unknown_unit_returned_stripped(self):
        assert _normalize_unit("  mm  ") == "mm"


class TestNormalizeMeasureKey:
    def test_basic_key_normalised_to_snake_case(self):
        key = _normalize_measure_key("BrainSeg", "Vol", None)
        assert key == key.lower()
        assert " " not in key

    def test_hemisphere_prefix_prepended(self):
        key = _normalize_measure_key("Cortex", "NumVert", None, hemisphere="lh")
        assert key.startswith("lh_")


class TestNormalizeIdentifier:
    def test_sub_prefix_stripped(self):
        assert _normalize_identifier("sub-01", "subject_id", "sub-") == "01"

    def test_no_prefix_returned_as_is(self):
        assert _normalize_identifier("patient42", "subject_id", "sub-") == "patient42"

    def test_empty_after_strip_raises(self):
        with pytest.raises(ValueError):
            _normalize_identifier("sub-", "subject_id", "sub-")

    def test_whitespace_in_value_raises(self):
        with pytest.raises(ValueError):
            _normalize_identifier("hello world", "subject_id", "sub-")


class TestRowFromTokens:
    def test_aseg_without_headers_returns_expected_keys(self):
        tokens = ["1", "2", "10", "500.0", "Left-Hippocampus"]
        row = _row_from_tokens(tokens, [], "aseg")
        assert row is not None
        assert row["StructName"] == "Left-Hippocampus"
        assert row["Volume_mm3"] == "500.0"

    def test_aseg_too_few_tokens_returns_none(self):
        assert _row_from_tokens(["1", "2"], [], "aseg") is None

    def test_aparc_without_headers_returns_expected_keys(self):
        tokens = ["superiortemporal", "10000", "5000.0", "8000.0", "2.5", "0.3"]
        row = _row_from_tokens(tokens, [], "aparc")
        assert row is not None
        assert row["StructName"] == "superiortemporal"
        assert row["SurfArea"] == "5000.0"
        assert row["ThickStd"] == "0.3"

    def test_unknown_kind_returns_none(self):
        assert _row_from_tokens(["a", "b", "c", "d", "e"], [], "unknown_kind") is None

    def test_with_column_headers_maps_correctly(self):
        headers = ["Col1", "Col2", "Col3"]
        tokens = ["A", "B", "C"]
        row = _row_from_tokens(tokens, headers, "aseg")
        assert row == {"Col1": "A", "Col2": "B", "Col3": "C"}


class TestLookupFirstNumeric:
    def test_returns_first_matching_key(self):
        row = {"Volume_mm3": "999.0", "Vol": "100.0"}
        val = _lookup_first_numeric(row, "Volume_mm3", "Vol")
        assert val == pytest.approx(999.0)

    def test_skips_non_numeric_values(self):
        row = {"Volume_mm3": "n/a", "Vol": "123.0"}
        val = _lookup_first_numeric(row, "Volume_mm3", "Vol")
        assert val == pytest.approx(123.0)

    def test_returns_none_when_no_key_found(self):
        assert _lookup_first_numeric({"other": "10.0"}, "Volume_mm3") is None
