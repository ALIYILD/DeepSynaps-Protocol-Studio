"""Tests for ``deepsynaps_mri.morphometry_reporting``.

Covers regional-volume parsing (aseg.stats + SynthSeg volumes.csv),
asymmetry computation, summary QC flags, and the additive merge
of structural metrics into the MRI report payload.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from deepsynaps_mri.morphometry_reporting import (
    compute_asymmetry_indices,
    compute_regional_volumes,
    generate_mri_analysis_report_payload,
    summarize_morphometry,
)
from deepsynaps_mri.schemas import (
    MRIReport,
    PatientMeta,
    QCMetrics,
    RegionalVolumesResult,
    StructuralMetrics,
)


# ── Fixtures ───────────────────────────────────────────────────────────────


def _aseg_stats_text() -> str:
    return (
        "# Title Segmentation Statistics \n"
        "# Measure IntracranialVolume, ICV, ..., 1456234.0, mm^3\n"
        "# ColHeaders Index SegId NVoxels Volume_mm3 StructName\n"
        "1 17 4321 4321.0 Left-Hippocampus\n"
        "2 53 4500 4500.0 Right-Hippocampus\n"
        "3 10 7800 7800.0 Left-Thalamus-Proper\n"
        "4 49 7900 7900.0 Right-Thalamus-Proper\n"
        "# trailing comment ignored\n"
    )


def _synthseg_csv_text() -> str:
    # SynthSeg writes a header row with structure names and a numeric row.
    return "Left-Hippocampus,Right-Hippocampus,Left-Thalamus-Proper,Right-Thalamus-Proper\n4321.0,4500.0,7800.0,7900.0\n"


def _minimal_report() -> MRIReport:
    return MRIReport(
        patient=PatientMeta(patient_id="P1"),
        modalities_present=[],
        qc=QCMetrics(),
    )


# ── compute_regional_volumes ───────────────────────────────────────────────


class TestComputeRegionalVolumes:
    def test_no_source_returns_message_no_volume_source(self, tmp_path: Path) -> None:
        result = compute_regional_volumes(artefacts_dir=tmp_path)
        assert isinstance(result, RegionalVolumesResult)
        assert result.ok is False
        assert result.message == "no_volume_source"

    def test_aseg_path_parses_into_rows_and_writes_manifest(self, tmp_path: Path) -> None:
        aseg = tmp_path / "aseg.stats"
        aseg.write_text(_aseg_stats_text(), encoding="utf-8")

        result = compute_regional_volumes(
            artefacts_dir=tmp_path,
            aseg_stats_path=aseg,
        )
        assert result.ok is True
        names = {r.region for r in result.rows}
        assert "Left-Hippocampus" in names
        assert "Right-Thalamus-Proper" in names
        assert all(r.source == "aseg.stats" for r in result.rows)

        # Manifest is written next to artefacts_dir/morphometry/.
        assert result.manifest_path is not None
        manifest = Path(result.manifest_path)
        assert manifest.exists()
        text = manifest.read_text(encoding="utf-8")
        assert "aseg.stats" in text

    def test_synthseg_csv_path_parses_into_rows(self, tmp_path: Path) -> None:
        csv_path = tmp_path / "volumes.csv"
        csv_path.write_text(_synthseg_csv_text(), encoding="utf-8")

        result = compute_regional_volumes(
            artefacts_dir=tmp_path,
            synthseg_csv_path=csv_path,
        )
        assert result.ok is True
        assert all(r.source == "volumes.csv" for r in result.rows)
        assert any(r.region == "Left-Hippocampus" for r in result.rows)

    def test_aseg_takes_precedence_over_synthseg(self, tmp_path: Path) -> None:
        # When BOTH paths are passed, aseg wins (the elif structure).
        aseg = tmp_path / "aseg.stats"
        aseg.write_text(_aseg_stats_text(), encoding="utf-8")
        csv_path = tmp_path / "volumes.csv"
        csv_path.write_text(_synthseg_csv_text(), encoding="utf-8")

        result = compute_regional_volumes(
            artefacts_dir=tmp_path,
            aseg_stats_path=aseg,
            synthseg_csv_path=csv_path,
        )
        assert all(r.source == "aseg.stats" for r in result.rows)

    def test_missing_aseg_falls_back_to_synthseg(self, tmp_path: Path) -> None:
        # A non-existent aseg path should fall through to the synthseg path.
        csv_path = tmp_path / "volumes.csv"
        csv_path.write_text(_synthseg_csv_text(), encoding="utf-8")
        result = compute_regional_volumes(
            artefacts_dir=tmp_path,
            aseg_stats_path=tmp_path / "does_not_exist.stats",
            synthseg_csv_path=csv_path,
        )
        assert result.ok is True
        assert all(r.source == "volumes.csv" for r in result.rows)


# ── compute_asymmetry_indices ──────────────────────────────────────────────


class TestComputeAsymmetryIndices:
    def test_pairs_present_compute_normalised_asymmetry(self) -> None:
        out = compute_asymmetry_indices(
            {
                "Left-Hippocampus": 4000.0,
                "Right-Hippocampus": 4400.0,
                "Left-Thalamus-Proper": 7500.0,
                "Right-Thalamus-Proper": 7500.0,
            }
        )
        assert ("Hippocampus", pytest.approx(400 / 8400, rel=1e-9)) in [
            (label, ai) for label, ai in out
        ]
        # Symmetric thalamus → 0.
        labels = {label: ai for label, ai in out}
        assert labels["Thalamus"] == 0.0

    def test_missing_one_side_skipped(self) -> None:
        out = compute_asymmetry_indices({"Left-Hippocampus": 4000.0})
        # No right side → no Hippocampus row.
        assert all(label != "Hippocampus" for label, _ in out)

    def test_zero_total_volume_skipped(self) -> None:
        out = compute_asymmetry_indices(
            {"Left-Hippocampus": 0.0, "Right-Hippocampus": 0.0}
        )
        assert out == []

    def test_putamen_pair_resolved(self) -> None:
        out = compute_asymmetry_indices(
            {"Left-Putamen": 5000.0, "Right-Putamen": 5500.0}
        )
        labels = [label for label, _ in out]
        assert "Putamen" in labels


# ── summarize_morphometry ──────────────────────────────────────────────────


class TestSummarizeMorphometry:
    def test_failure_volumes_flag_and_no_asymmetry(self, tmp_path: Path) -> None:
        vols = RegionalVolumesResult(ok=False, message="no_volume_source")
        out = summarize_morphometry(vols, artefacts_dir=tmp_path)
        assert "no_regional_volumes" in out.qc_flags
        # Asymmetry is the default empty AsymmetryResult — never crashes.
        assert out.regional_volumes is vols

    def test_high_asymmetry_emits_qc_flag(self, tmp_path: Path) -> None:
        # Hippocampal pair with >15 % asymmetry should trip the flag.
        vols = compute_regional_volumes(
            artefacts_dir=tmp_path,
            aseg_stats_path=None,
            synthseg_csv_path=None,
        )
        # Build a hand-crafted RegionalVolumesResult instead of parsing.
        from deepsynaps_mri.schemas import RegionalVolumeRow

        rows = [
            RegionalVolumeRow(region="Left-Hippocampus", volume_mm3=4000.0, source="aseg.stats"),
            # 40% bigger right hippocampus → 0.40 / 1.40 = 0.286, > 0.15 trips the flag
            RegionalVolumeRow(region="Right-Hippocampus", volume_mm3=5600.0, source="aseg.stats"),
        ]
        vols = RegionalVolumesResult(ok=True, rows=rows, message="ok")
        out = summarize_morphometry(vols, artefacts_dir=tmp_path)
        assert "high_asymmetry_hint" in out.qc_flags
        assert out.asymmetry is not None and out.asymmetry.ok is True

    def test_within_threshold_no_flag(self, tmp_path: Path) -> None:
        from deepsynaps_mri.schemas import RegionalVolumeRow

        rows = [
            RegionalVolumeRow(region="Left-Hippocampus", volume_mm3=4000.0, source="aseg.stats"),
            RegionalVolumeRow(region="Right-Hippocampus", volume_mm3=4100.0, source="aseg.stats"),
        ]
        vols = RegionalVolumesResult(ok=True, rows=rows, message="ok")
        out = summarize_morphometry(vols, artefacts_dir=tmp_path)
        assert "high_asymmetry_hint" not in out.qc_flags


# ── generate_mri_analysis_report_payload ───────────────────────────────────


class TestGenerateReportPayload:
    def test_payload_includes_morphometry_and_artefacts_root(self, tmp_path: Path) -> None:
        aseg = tmp_path / "aseg.stats"
        aseg.write_text(_aseg_stats_text(), encoding="utf-8")
        report = _minimal_report()

        payload = generate_mri_analysis_report_payload(
            report,
            artefacts_dir=tmp_path,
            aseg_stats_path=aseg,
        )
        assert payload.morphometry.regional_volumes.ok is True
        # subcortical_volume_mm3 is populated additively.
        assert payload.report.structural is not None
        assert "Left-Hippocampus" in payload.report.structural.subcortical_volume_mm3
        # artefacts_root resolves to the absolute path.
        assert payload.artefacts_root == str(tmp_path.resolve())

    def test_payload_with_no_volume_source_has_empty_subcortical(self, tmp_path: Path) -> None:
        report = _minimal_report()
        payload = generate_mri_analysis_report_payload(
            report,
            artefacts_dir=tmp_path,
        )
        # ok=False path: structural carries no merged regional volumes.
        if payload.report.structural is not None:
            assert payload.report.structural.subcortical_volume_mm3 == {}
        assert "no_regional_volumes" in payload.morphometry.qc_flags

    def test_existing_structural_metrics_preserved(self, tmp_path: Path) -> None:
        # When a base report already has StructuralMetrics, the
        # generator must merge into it, not blow it away.
        from deepsynaps_mri.schemas import NormedValue

        report = _minimal_report()
        report.structural = StructuralMetrics(
            cortical_thickness_mm={"superiorfrontal": NormedValue(value=2.5)}
        )
        aseg = tmp_path / "aseg.stats"
        aseg.write_text(_aseg_stats_text(), encoding="utf-8")

        payload = generate_mri_analysis_report_payload(
            report,
            artefacts_dir=tmp_path,
            aseg_stats_path=aseg,
        )
        # Original cortical thickness measurement preserved.
        assert "superiorfrontal" in payload.report.structural.cortical_thickness_mm
        # Subcortical merged in additively.
        assert "Left-Hippocampus" in payload.report.structural.subcortical_volume_mm3

    def test_artefacts_root_none_when_dir_not_passed(self) -> None:
        report = _minimal_report()
        payload = generate_mri_analysis_report_payload(report)
        assert payload.artefacts_root is None
