"""Focused tests for the isolated DeepSynaps Neuro Engine package."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from deepsynaps.neuro_engine import NeuroEngine, NeuroEngineSettings, load_settings
from deepsynaps.neuro_engine.api.routes import create_app
from deepsynaps.neuro_engine.functional.connectivity import (
    ConnectivityBundle,
    ConnectivityExtractionError,
    ConnectivityResult,
    ConnectivityRunResult,
    FunctionalConnectivityExtractor,
)
from deepsynaps.neuro_engine.preprocessing.fmriprep_runner import (
    FMRIPrepExecutionError,
    FMRIPrepRunConfig,
    FMRIPrepRunner,
)
from deepsynaps.neuro_engine.models.segmentation import (
    SegmentationInferenceResult,
    SegmentationModelBundle,
)
from deepsynaps.neuro_engine.preprocessing.fmriprep_runner import FMRIPrepRunResult
from deepsynaps.neuro_engine.structural.fastsurfer_runner import (
    FastSurferExecutionError,
    FastSurferRunConfig,
    FastSurferRunResult,
    FastSurferRunner,
)
from deepsynaps.neuro_engine.structural.biomarkers import (
    FastSurferBiomarkerExtractor,
    StructuralBiomarkerBundle,
    StructuralBiomarkerError,
)
from deepsynaps.neuro_engine.structural.normalization import (
    NormalizedStructuralRecord,
    StructuralNormalizer,
)
from deepsynaps.neuro_engine.utils.bids_validator import BIDSValidationResult, BidsValidator
from deepsynaps.neuro_engine.utils.dicom_converter import DICOMConversionResult, DicomToBidsConverter


def _build_minimal_bids_tree(root: Path) -> Path:
    """Create a tiny BIDS tree on disk for integration tests."""

    bids_root = root / "bids"
    anat_dir = bids_root / "sub-01" / "ses-01" / "anat"
    anat_dir.mkdir(parents=True)
    (bids_root / "dataset_description.json").write_text(
        json.dumps({"Name": "DeepSynaps Test Dataset", "BIDSVersion": "1.8.0"}),
        encoding="utf-8",
    )
    (anat_dir / "sub-01_T1w.nii.gz").write_bytes(b"nifti")
    (anat_dir / "sub-01_T1w.json").write_text("{}", encoding="utf-8")
    return bids_root


def _build_subject_level_bids_tree(root: Path) -> Path:
    """Create a tiny subject-level BIDS tree without sessions."""

    bids_root = root / "bids-subject-level"
    anat_dir = bids_root / "sub-01" / "anat"
    anat_dir.mkdir(parents=True)
    (bids_root / "dataset_description.json").write_text(
        json.dumps({"Name": "DeepSynaps Subject Dataset", "BIDSVersion": "1.8.0"}),
        encoding="utf-8",
    )
    (anat_dir / "sub-01_T1w.nii.gz").write_bytes(b"nifti")
    (anat_dir / "sub-01_T1w.json").write_text("{}", encoding="utf-8")
    return bids_root


def _aseg_stats_text() -> str:
    """Return a minimal synthetic aseg stats payload."""

    return "\n".join(
        [
            "# Measure BrainSeg, BrainSegVol, Brain Segmentation Volume, 123456.0, mm^3",
            "# Measure EstimatedTotalIntraCranialVol, EstimatedTotalIntraCranialVol, eTIV, 1456789.0, mm^3",
            "# ColHeaders Index SegId NVoxels Volume_mm3 StructName normMean normStdDev normMin normMax normRange",
            "1 10 5000 5100.5 Left-Thalamus-Proper 0 0 0 0 0",
            "2 11 4900 5001.0 Right-Thalamus-Proper 0 0 0 0 0",
        ]
    )


def _aparc_stats_text(hemisphere: str) -> str:
    """Return a minimal synthetic aparc stats payload."""

    return "\n".join(
        [
            "# Measure Cortex, NumVert, Number of Vertices, 12345, count",
            "# Measure Cortex, WhiteSurfArea, White Surface Total Area, 5432.1, mm^2",
            "# Measure Cortex, MeanThickness, Mean Thickness, 2.5, mm",
            "# ColHeaders StructName NumVert SurfArea GrayVol ThickAvg ThickStd",
            f"{hemisphere}_superiortemporal 1200 345.6 789.1 2.31 0.12",
            f"{hemisphere}_insula 1100 300.2 700.4 2.10 0.15",
        ]
    )


def _write_structural_stats(
    root: Path,
    *,
    aseg: bool = True,
    lh: bool = True,
    rh: bool = True,
) -> Path:
    """Create a synthetic FastSurfer stats directory tree."""

    subject_dir = root / "fastsurfer-subject"
    stats_dir = subject_dir / "stats"
    stats_dir.mkdir(parents=True)
    if aseg:
        (stats_dir / "aseg.stats").write_text(_aseg_stats_text(), encoding="utf-8")
    if lh:
        (stats_dir / "lh.aparc.DKTatlas.mapped.stats").write_text(
            _aparc_stats_text("lh"),
            encoding="utf-8",
        )
    if rh:
        (stats_dir / "rh.aparc.DKTatlas.mapped.stats").write_text(
            _aparc_stats_text("rh"),
            encoding="utf-8",
        )
    return subject_dir


def _build_structural_bundle(include_icv: bool = True) -> StructuralBiomarkerBundle:
    """Create a synthetic structural biomarker bundle for normalization tests."""

    global_metrics: dict[str, float | int | str | None] = {}
    if include_icv:
        global_metrics["EstimatedTotalIntraCranialVol"] = 1_500_000.0

    return StructuralBiomarkerBundle(
        subject_id="DS123",
        session_id="V1",
        source_dir=Path("/tmp/fastsurfer-subject"),
        aseg_metrics=[
            {
                "structure_name": "Left-Hippocampus",
                "metric_name": "volume_mm3",
                "value": 3000.0,
                "unit": "mm^3",
                "scope": "subcortical",
                "source_file": "aseg.stats",
                "hemisphere": None,
            },
            {
                "structure_name": "Right-Hippocampus",
                "metric_name": "volume_mm3",
                "value": 3300.0,
                "unit": "mm^3",
                "scope": "subcortical",
                "source_file": "aseg.stats",
                "hemisphere": None,
            },
        ],
        cortical_metrics=[
            {
                "hemisphere": "lh",
                "structure_name": "lh_superiortemporal",
                "metric_name": "gray_matter_volume_mm3",
                "value": 400.0,
                "unit": "mm^3",
                "scope": "cortical",
                "source_file": "lh.aparc.DKTatlas.mapped.stats",
            },
            {
                "hemisphere": "lh",
                "structure_name": "lh_superiortemporal",
                "metric_name": "mean_thickness_mm",
                "value": 2.4,
                "unit": "mm",
                "scope": "cortical",
                "source_file": "lh.aparc.DKTatlas.mapped.stats",
            },
            {
                "hemisphere": "lh",
                "structure_name": "lh_precentral",
                "metric_name": "gray_matter_volume_mm3",
                "value": 600.0,
                "unit": "mm^3",
                "scope": "cortical",
                "source_file": "lh.aparc.DKTatlas.mapped.stats",
            },
            {
                "hemisphere": "lh",
                "structure_name": "lh_precentral",
                "metric_name": "mean_thickness_mm",
                "value": 2.6,
                "unit": "mm",
                "scope": "cortical",
                "source_file": "lh.aparc.DKTatlas.mapped.stats",
            },
            {
                "hemisphere": "rh",
                "structure_name": "rh_superiortemporal",
                "metric_name": "gray_matter_volume_mm3",
                "value": 500.0,
                "unit": "mm^3",
                "scope": "cortical",
                "source_file": "rh.aparc.DKTatlas.mapped.stats",
            },
            {
                "hemisphere": "rh",
                "structure_name": "rh_superiortemporal",
                "metric_name": "mean_thickness_mm",
                "value": 2.2,
                "unit": "mm",
                "scope": "cortical",
                "source_file": "rh.aparc.DKTatlas.mapped.stats",
            },
            {
                "hemisphere": "rh",
                "structure_name": "rh_precentral",
                "metric_name": "gray_matter_volume_mm3",
                "value": 500.0,
                "unit": "mm^3",
                "scope": "cortical",
                "source_file": "rh.aparc.DKTatlas.mapped.stats",
            },
            {
                "hemisphere": "rh",
                "structure_name": "rh_precentral",
                "metric_name": "mean_thickness_mm",
                "value": 2.8,
                "unit": "mm",
                "scope": "cortical",
                "source_file": "rh.aparc.DKTatlas.mapped.stats",
            },
        ],
        global_metrics=global_metrics,
        generated_at=datetime.now(timezone.utc),
    )


def _write_fmriprep_func_run(
    root: Path,
    subject_id: str,
    *,
    session_id: str | None,
    task_id: str,
    run_id: str | None,
    space: str,
    include_confounds: bool = True,
    repetition_time: float = 2.0,
) -> Path:
    """Create a synthetic fMRIPrep-like functional derivative run."""

    parts = [f"sub-{subject_id}"]
    if session_id is not None:
        parts.append(f"ses-{session_id}")
    parts.append(f"task-{task_id}")
    if run_id is not None:
        parts.append(f"run-{run_id}")
    parts.append(f"space-{space}")
    bold_prefix = "_".join(parts)

    func_dir = root / f"sub-{subject_id}"
    if session_id is not None:
        func_dir = func_dir / f"ses-{session_id}"
    func_dir = func_dir / "func"
    func_dir.mkdir(parents=True, exist_ok=True)

    bold_file = func_dir / f"{bold_prefix}_desc-preproc_bold.nii.gz"
    bold_file.write_bytes(b"dummy bold")
    bold_file.with_suffix("").with_suffix(".json").write_text(
        json.dumps({"RepetitionTime": repetition_time}),
        encoding="utf-8",
    )

    confound_parts = [part for part in parts if not part.startswith("space-")]
    if include_confounds:
        (func_dir / f"{'_'.join(confound_parts)}_desc-confounds_timeseries.tsv").write_text(
            "trans_x\ttrans_y\n0\t0\n",
            encoding="utf-8",
        )
    return bold_file


def test_package_is_importable() -> None:
    """The namespace package should export the NeuroEngine façade."""

    engine = NeuroEngine()
    assert isinstance(engine, NeuroEngine)


def test_settings_load_from_environment(monkeypatch, tmp_path: Path) -> None:
    """Environment variables should override the default settings."""

    monkeypatch.setenv("DEEPSYNAPS_NEURO_ENGINE_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("DEEPSYNAPS_NEURO_ENGINE_BIDS_ROOT", str(tmp_path / "bids-root"))
    monkeypatch.setenv("DEEPSYNAPS_NEURO_ENGINE_FMRI_THREADS", "8")
    settings = load_settings()
    assert isinstance(settings, NeuroEngineSettings)
    assert settings.data_root == tmp_path / "data"
    assert settings.bids_root == tmp_path / "bids-root"
    assert settings.fmri_threads == 8


def test_bids_validation_detects_valid_dataset(tmp_path: Path) -> None:
    """The validator should accept a minimal anatomical BIDS tree."""

    bids_root = _build_minimal_bids_tree(tmp_path)
    result = NeuroEngine().validate_bids_dataset(bids_root)
    assert result.is_valid is True
    assert result.subjects == ["sub-01"]
    assert "ses-01" in result.sessions
    assert "anat" in result.modalities


def test_converter_and_validator_instantiation(tmp_path: Path) -> None:
    """The lightweight converter and validator interfaces should be easy to wire up."""

    bids_root = _build_minimal_bids_tree(tmp_path)
    converter = DicomToBidsConverter(bids_root=bids_root)
    validator = BidsValidator()

    assert converter.bids_root == bids_root
    result = validator.validate_subject_session(bids_root, subject_id="01", session_id="01")
    assert "is_valid" in result


def test_fmriprep_build_command_includes_docker_mounts_and_flags(tmp_path: Path) -> None:
    """The Docker-backed command should include expected mounts and core flags."""

    bids_root = _build_minimal_bids_tree(tmp_path)
    output_root = tmp_path / "derivatives"
    work_root = tmp_path / "work"
    license_file = tmp_path / "license.txt"
    license_file.write_text("fake-license", encoding="utf-8")

    config = FMRIPrepRunConfig(
        bids_root=bids_root,
        output_root=output_root,
        work_root=work_root,
        subject_id="DS123",
        session_id="V1",
        fs_license_file=license_file,
        extra_args=["--dummy-flag"],
    )
    command = FMRIPrepRunner().build_command(config)
    rendered = " ".join(command)

    assert command[:3] == ["docker", "run", "--rm"]
    assert f"{bids_root.resolve()}:/data:ro" in rendered
    assert f"{output_root.resolve()}:/out" in rendered
    assert f"{work_root.resolve()}:/work" in rendered
    assert "--participant-label DS123" in rendered
    assert "--session-label V1" in rendered
    assert "--output-layout bids" in rendered
    assert "--stop-on-first-crash" in rendered
    assert "--notrack" in rendered
    assert "--dummy-flag" in rendered


def test_fmriprep_requires_license_when_freesurfer_enabled(tmp_path: Path) -> None:
    """FreeSurfer-backed runs should fail command construction without a license file."""

    config = FMRIPrepRunConfig(
        bids_root=tmp_path / "bids",
        output_root=tmp_path / "out",
        work_root=tmp_path / "work",
        subject_id="DS123",
        use_freesurfer=True,
        fs_license_file=None,
    )
    with pytest.raises(FMRIPrepExecutionError):
        FMRIPrepRunner().build_command(config)


def test_fmriprep_adds_fs_no_reconall_when_freesurfer_disabled(tmp_path: Path) -> None:
    """Disabling FreeSurfer should append the no-reconall flag."""

    config = FMRIPrepRunConfig(
        bids_root=tmp_path / "bids",
        output_root=tmp_path / "out",
        work_root=tmp_path / "work",
        subject_id="DS123",
        use_freesurfer=False,
    )
    command = FMRIPrepRunner().build_command(config)
    assert "--fs-no-reconall" in command


def test_fmriprep_subject_labels_strip_existing_sub_prefix(tmp_path: Path) -> None:
    """Participant labels should not duplicate the ``sub-`` prefix."""

    license_file = tmp_path / "license.txt"
    license_file.write_text("fake-license", encoding="utf-8")
    config = FMRIPrepRunConfig(
        bids_root=tmp_path / "bids",
        output_root=tmp_path / "out",
        work_root=tmp_path / "work",
        subject_id="sub-DS123",
        fs_license_file=license_file,
    )
    command = FMRIPrepRunner().build_command(config)
    participant_index = command.index("--participant-label")
    assert command[participant_index + 1] == "DS123"


def test_fmriprep_run_raises_clear_error_on_non_zero_subprocess(tmp_path: Path) -> None:
    """Non-zero Docker exits should surface a diagnostic execution error."""

    bids_root = _build_minimal_bids_tree(tmp_path)
    output_root = tmp_path / "derivatives"
    work_root = tmp_path / "work"
    license_file = tmp_path / "license.txt"
    license_file.write_text("fake-license", encoding="utf-8")
    config = FMRIPrepRunConfig(
        bids_root=bids_root,
        output_root=output_root,
        work_root=work_root,
        subject_id="DS123",
        fs_license_file=license_file,
    )
    completed = subprocess.CompletedProcess(
        args=["docker"],
        returncode=2,
        stdout="partial stdout",
        stderr="fatal stderr",
    )
    runner = FMRIPrepRunner()
    with (
        patch("deepsynaps.neuro_engine.preprocessing.fmriprep_runner.shutil.which", return_value="/usr/bin/docker"),
        patch("deepsynaps.neuro_engine.preprocessing.fmriprep_runner.subprocess.run", return_value=completed),
    ):
        with pytest.raises(FMRIPrepExecutionError) as error:
            runner.run(config)
    assert "fatal stderr" in str(error.value)
    assert "partial stdout" in str(error.value)


def test_fastsurfer_find_t1_image_prefers_session_specific_anat(tmp_path: Path) -> None:
    """Session-aware discovery should resolve the session anat image first."""

    bids_root = _build_minimal_bids_tree(tmp_path)
    runner = FastSurferRunner()

    found = runner.find_t1_image(bids_root=bids_root, subject_id="01", session_id="01")

    assert found == bids_root / "sub-01" / "ses-01" / "anat" / "sub-01_T1w.nii.gz"


def test_fastsurfer_find_t1_image_falls_back_to_subject_level_anat(tmp_path: Path) -> None:
    """Session-aware lookup should fall back to subject-level anat when needed."""

    bids_root = _build_subject_level_bids_tree(tmp_path)
    runner = FastSurferRunner()

    found = runner.find_t1_image(bids_root=bids_root, subject_id="01", session_id="V1")

    assert found == bids_root / "sub-01" / "anat" / "sub-01_T1w.nii.gz"


def test_fastsurfer_find_t1_image_raises_on_ambiguous_candidates(tmp_path: Path) -> None:
    """Multiple T1w candidates in one anat directory should raise a clear error."""

    bids_root = tmp_path / "bids-ambiguous"
    anat_dir = bids_root / "sub-01" / "ses-01" / "anat"
    anat_dir.mkdir(parents=True)
    (anat_dir / "sub-01_run-1_T1w.nii.gz").write_bytes(b"one")
    (anat_dir / "sub-01_run-2_T1w.nii.gz").write_bytes(b"two")

    with pytest.raises(FastSurferExecutionError) as error:
        FastSurferRunner().find_t1_image(bids_root=bids_root, subject_id="01", session_id="01")

    assert "Multiple session-specific T1w images" in str(error.value)


def test_fastsurfer_build_command_includes_mounts_gpu_and_session_aware_sid(tmp_path: Path) -> None:
    """The Docker-backed FastSurfer command should include core mounts and flags."""

    bids_root = _build_minimal_bids_tree(tmp_path)
    output_root = tmp_path / "fastsurfer-out"
    license_file = tmp_path / "license.txt"
    license_file.write_text("fake-license", encoding="utf-8")

    config = FastSurferRunConfig(
        bids_root=bids_root,
        output_root=output_root,
        subject_id="DS123",
        session_id="V1",
        fs_license_file=license_file,
        device="cuda",
        view_agg_device="cuda",
        t1_relpath=Path("sub-01/ses-01/anat/sub-01_T1w.nii.gz"),
        seg_only=True,
    )
    command = FastSurferRunner().build_command(config)
    rendered = " ".join(command)

    assert command[:3] == ["docker", "run", "--rm"]
    assert "--gpus all" in rendered
    assert f"{bids_root.resolve()}:/data:ro" in rendered
    assert f"{output_root.resolve()}:/output" in rendered
    assert f"{license_file.parent.resolve()}:/fs_license:ro" in rendered
    assert "--fs_license /fs_license/license.txt" in rendered
    assert "--sid sub-DS123_ses-V1" in rendered
    assert "--t1 /data/sub-01/ses-01/anat/sub-01_T1w.nii.gz" in rendered
    assert "--device cuda" in rendered
    assert "--viewagg_device cuda" in rendered
    assert "--seg_only" in rendered


def test_fastsurfer_run_raises_clear_error_on_non_zero_subprocess(tmp_path: Path) -> None:
    """Non-zero Docker exits should surface a diagnostic FastSurfer error."""

    bids_root = _build_minimal_bids_tree(tmp_path)
    output_root = tmp_path / "fastsurfer-out"
    license_file = tmp_path / "license.txt"
    license_file.write_text("fake-license", encoding="utf-8")
    config = FastSurferRunConfig(
        bids_root=bids_root,
        output_root=output_root,
        subject_id="01",
        session_id="01",
        fs_license_file=license_file,
    )
    completed = subprocess.CompletedProcess(
        args=["docker"],
        returncode=3,
        stdout="partial stdout",
        stderr="fatal stderr",
    )
    runner = FastSurferRunner()
    with (
        patch("deepsynaps.neuro_engine.structural.fastsurfer_runner.shutil.which", return_value="/usr/bin/docker"),
        patch("deepsynaps.neuro_engine.structural.fastsurfer_runner.subprocess.run", return_value=completed),
    ):
        with pytest.raises(FastSurferExecutionError) as error:
            runner.run(config)
    assert "fatal stderr" in str(error.value)
    assert "partial stdout" in str(error.value)


def test_parse_aseg_stats_extracts_global_and_per_structure_metrics(tmp_path: Path) -> None:
    """A minimal aseg stats file should yield global and subcortical metrics."""

    stats_file = tmp_path / "aseg.stats"
    stats_file.write_text(_aseg_stats_text(), encoding="utf-8")

    metrics, global_metrics = FastSurferBiomarkerExtractor().parse_aseg_stats(stats_file)

    assert len(metrics) == 2
    assert metrics[0]["metric_name"] == "volume_mm3"
    assert metrics[0]["scope"] == "subcortical"
    assert metrics[0]["unit"] == "mm^3"
    assert global_metrics["brain_seg_volume_mm3"] == 123456
    assert global_metrics["estimated_total_intracranial_volume_mm3"] == 1456789


def test_parse_aparc_stats_extracts_cortical_region_metrics(tmp_path: Path) -> None:
    """A minimal aparc stats file should yield cortical regional metrics."""

    stats_file = tmp_path / "lh.aparc.DKTatlas.mapped.stats"
    stats_file.write_text(_aparc_stats_text("lh"), encoding="utf-8")

    metrics, global_metrics = FastSurferBiomarkerExtractor().parse_aparc_stats(
        stats_file,
        hemisphere="lh",
    )

    assert any(metric["metric_name"] == "surface_area_mm2" for metric in metrics)
    assert any(metric["metric_name"] == "mean_thickness_mm" for metric in metrics)
    assert all(metric["scope"] == "cortical" for metric in metrics)
    assert global_metrics["lh_cortex_mean_thickness_mm"] == 2.5


def test_structural_biomarker_extraction_succeeds_with_only_aseg(tmp_path: Path) -> None:
    """Extraction should proceed when only aseg metrics are present."""

    subject_dir = _write_structural_stats(tmp_path, aseg=True, lh=False, rh=False)

    bundle = FastSurferBiomarkerExtractor().extract(subject_dir, subject_id="DS123", session_id="V1")

    assert isinstance(bundle, StructuralBiomarkerBundle)
    assert bundle.subject_id == "DS123"
    assert bundle.session_id == "V1"
    assert len(bundle.aseg_metrics) == 2
    assert bundle.cortical_metrics == []


def test_structural_biomarker_extraction_succeeds_with_only_cortical_stats(tmp_path: Path) -> None:
    """Extraction should proceed when only cortical stats are present."""

    subject_dir = _write_structural_stats(tmp_path, aseg=False, lh=True, rh=True)

    bundle = FastSurferBiomarkerExtractor().extract(subject_dir, subject_id="DS123")

    assert bundle.aseg_metrics == []
    assert len(bundle.cortical_metrics) >= 4
    assert "lh_cortex_mean_thickness_mm" in bundle.global_metrics
    assert "rh_cortex_mean_thickness_mm" in bundle.global_metrics


def test_structural_biomarker_flat_records_include_analysis_fields(tmp_path: Path) -> None:
    """Flat biomarker rows should carry subject/session and metric metadata."""

    subject_dir = _write_structural_stats(tmp_path, aseg=True, lh=True, rh=False)
    bundle = FastSurferBiomarkerExtractor().extract(subject_dir, subject_id="DS123", session_id="V1")

    records = bundle.to_flat_records()

    assert records
    first = records[0]
    assert first["subject_id"] == "DS123"
    assert first["session_id"] == "V1"
    assert "scope" in first
    assert "metric_name" in first
    assert "value" in first
    assert "unit" in first


def test_structural_biomarker_extractor_raises_on_malformed_stats(tmp_path: Path) -> None:
    """Malformed stats content should raise a clear structural biomarker error."""

    subject_dir = tmp_path / "bad-subject"
    stats_dir = subject_dir / "stats"
    stats_dir.mkdir(parents=True)
    (stats_dir / "aseg.stats").write_text("# malformed\nnot enough columns\n", encoding="utf-8")

    with pytest.raises(StructuralBiomarkerError) as error:
        FastSurferBiomarkerExtractor().extract(subject_dir, subject_id="DS123")

    assert "aseg" in str(error.value).lower() or "biomarker" in str(error.value).lower()


def test_structural_normalizer_discovers_icv_from_global_metrics() -> None:
    """The normalizer should discover ICV/eTIV from bundle globals."""

    bundle = _build_structural_bundle(include_icv=True)
    normalizer = StructuralNormalizer()

    assert normalizer._get_intracranial_volume(bundle) == 1_500_000.0


def test_structural_normalizer_icv_normalizes_volumes_but_not_thickness() -> None:
    """ICV normalization should apply to volumes and skip cortical thickness."""

    bundle = _build_structural_bundle(include_icv=True)
    records = StructuralNormalizer(volume_norm_scale=1000.0).normalize(bundle)

    metric_names = {record.metric_name for record in records}
    assert "volume_mm3_per_icv" in metric_names
    assert "gray_matter_volume_mm3_per_icv" in metric_names
    assert "mean_thickness_mm_per_icv" not in metric_names


def test_structural_normalizer_computes_hemisphere_fractions() -> None:
    """Cortical gray matter volumes should be expressed as hemisphere fractions."""

    bundle = _build_structural_bundle(include_icv=True)
    records = StructuralNormalizer().normalize(bundle)
    fractions = [
        record for record in records
        if record.metric_name == "gray_matter_volume_mm3_fraction_of_hemisphere"
        and record.hemisphere == "lh"
        and record.structure_name == "lh_superiortemporal"
    ]

    assert len(fractions) == 1
    assert fractions[0].value == pytest.approx(0.4)


def test_structural_normalizer_computes_asymmetry_index_for_bilateral_structure() -> None:
    """Bilateral hippocampal volumes should yield a percent asymmetry index."""

    bundle = _build_structural_bundle(include_icv=True)
    records = StructuralNormalizer().normalize(bundle)
    asymmetry = [
        record for record in records
        if record.metric_name == "asymmetry_index_percent"
        and record.structure_name == "hippocampus"
    ]

    assert len(asymmetry) == 1
    assert asymmetry[0].value == pytest.approx(abs(3000.0 - 3300.0) / 6300.0 * 100.0)


def test_structural_normalizer_computes_lobe_aggregates() -> None:
    """A tiny DKT-like cortical set should yield lobe volume and thickness aggregates."""

    bundle = _build_structural_bundle(include_icv=True)
    records = StructuralNormalizer().normalize(bundle)
    frontal_records = [
        record for record in records
        if record.structure_name == "frontal_lobe" and record.hemisphere == "lh"
    ]
    temporal_records = [
        record for record in records
        if record.structure_name == "temporal_lobe" and record.hemisphere == "lh"
    ]

    assert any(record.metric_name == "lobe_gray_matter_volume_mm3" and record.value == 600.0 for record in frontal_records)
    assert any(record.metric_name == "lobe_mean_thickness_mm" and record.value == pytest.approx(2.6) for record in frontal_records)
    assert any(record.metric_name == "lobe_gray_matter_volume_mm3" and record.value == 400.0 for record in temporal_records)


def test_structural_normalizer_without_icv_still_returns_non_icv_metrics(caplog: pytest.LogCaptureFixture) -> None:
    """Missing ICV should log a warning and still emit non-ICV derived metrics."""

    bundle = _build_structural_bundle(include_icv=False)
    with caplog.at_level("WARNING"):
        records = StructuralNormalizer().normalize(bundle)

    assert any("intracranial volume" in message.lower() for message in caplog.messages)
    assert records
    assert all(not record.metric_name.endswith("_per_icv") for record in records)


def test_structural_normalizer_handles_zero_totals_and_missing_sides_without_crashing(caplog: pytest.LogCaptureFixture) -> None:
    """Zero denominators and missing bilateral pairs should be skipped safely."""

    bundle = StructuralBiomarkerBundle(
        subject_id="DS123",
        session_id=None,
        source_dir=Path("/tmp/fastsurfer-subject"),
        aseg_metrics=[
            {
                "structure_name": "Left-Hippocampus",
                "metric_name": "volume_mm3",
                "value": 0.0,
                "unit": "mm^3",
                "scope": "subcortical",
                "source_file": "aseg.stats",
                "hemisphere": None,
            },
            {
                "structure_name": "Right-Hippocampus",
                "metric_name": "volume_mm3",
                "value": 0.0,
                "unit": "mm^3",
                "scope": "subcortical",
                "source_file": "aseg.stats",
                "hemisphere": None,
            },
        ],
        cortical_metrics=[
            {
                "hemisphere": "lh",
                "structure_name": "lh_superiortemporal",
                "metric_name": "gray_matter_volume_mm3",
                "value": 0.0,
                "unit": "mm^3",
                "scope": "cortical",
                "source_file": "lh.aparc.DKTatlas.mapped.stats",
            },
        ],
        global_metrics={},
        generated_at=datetime.now(timezone.utc),
    )

    with caplog.at_level("WARNING"):
        records = StructuralNormalizer().normalize(bundle)

    assert any("skipping hemisphere fractions" in message.lower() or "zero bilateral total" in message.lower() for message in caplog.messages)
    assert isinstance(records, list)
    assert all(record.metric_name != "asymmetry_index_percent" for record in records)


def test_functional_discovery_filters_by_session_and_space_and_preserves_missing_confounds(tmp_path: Path) -> None:
    """fMRIPrep discovery should filter by session/space and allow missing confounds."""

    derivatives_root = tmp_path / "fmriprep"
    _write_fmriprep_func_run(
        derivatives_root,
        "01",
        session_id="01",
        task_id="rest",
        run_id="01",
        space="MNI152NLin2009cAsym",
        include_confounds=True,
    )
    _write_fmriprep_func_run(
        derivatives_root,
        "01",
        session_id="01",
        task_id="nback",
        run_id="02",
        space="MNI152NLin2009cAsym",
        include_confounds=False,
    )
    _write_fmriprep_func_run(
        derivatives_root,
        "01",
        session_id="01",
        task_id="rest",
        run_id="03",
        space="T1w",
        include_confounds=True,
    )
    _write_fmriprep_func_run(
        derivatives_root,
        "01",
        session_id="02",
        task_id="rest",
        run_id="01",
        space="MNI152NLin2009cAsym",
        include_confounds=True,
    )

    atlas_img = tmp_path / "atlas.nii.gz"
    atlas_img.write_bytes(b"atlas")
    extractor = FunctionalConnectivityExtractor(
        atlas_img=atlas_img,
        atlas_labels=["roi1", "roi2"],
        atlas_name="toy-atlas",
    )

    discovered = extractor.discover_bold_and_confounds(
        derivatives_root=derivatives_root,
        subject_id="01",
        session_id="01",
    )

    assert len(discovered) == 2
    assert {metadata["task_id"] for _, _, metadata in discovered} == {"rest", "nback"}
    assert all(metadata["space"] == "MNI152NLin2009cAsym" for _, _, metadata in discovered)
    assert any(confounds_file is None for _, confounds_file, _ in discovered)


def test_functional_discovery_raises_when_no_matching_bold_exists(tmp_path: Path) -> None:
    """Discovery should raise a clear error when no BOLD matches the requested scope."""

    derivatives_root = tmp_path / "fmriprep"
    _write_fmriprep_func_run(
        derivatives_root,
        "01",
        session_id="01",
        task_id="rest",
        run_id="01",
        space="T1w",
        include_confounds=True,
    )

    atlas_img = tmp_path / "atlas.nii.gz"
    atlas_img.write_bytes(b"atlas")
    extractor = FunctionalConnectivityExtractor(
        atlas_img=atlas_img,
        atlas_labels=["roi1", "roi2"],
        atlas_name="toy-atlas",
        space="MNI152NLin2009cAsym",
    )

    with pytest.raises(ConnectivityExtractionError):
        extractor.discover_bold_and_confounds(derivatives_root, subject_id="01", session_id="01")


def test_extract_run_connectivity_returns_square_matrix_with_confounds(monkeypatch, tmp_path: Path) -> None:
    """Run-level connectivity should return a square matrix and propagate metadata."""

    atlas_img = tmp_path / "atlas.nii.gz"
    atlas_img.write_bytes(b"atlas")
    bold_file = tmp_path / "sub-01_task-rest_run-01_space-MNI152NLin2009cAsym_desc-preproc_bold.nii.gz"
    bold_file.write_bytes(b"bold")
    confounds_file = tmp_path / "sub-01_task-rest_run-01_desc-confounds_timeseries.tsv"
    confounds_file.write_text("confounds", encoding="utf-8")
    extractor = FunctionalConnectivityExtractor(
        atlas_img=atlas_img,
        atlas_labels=["roi1", "roi2"],
        atlas_name="toy-atlas",
        t_r=2.0,
    )

    monkeypatch.setattr(
        extractor,
        "_load_confounds",
        lambda bold: ([["motion"]], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    )
    monkeypatch.setattr(
        extractor,
        "_extract_time_series",
        lambda bold_path, confounds, sample_mask, tr: [
            [0.0, 1.0],
            [1.0, 2.0],
            [2.0, 3.0],
            [3.0, 4.0],
            [4.0, 5.0],
            [5.0, 6.0],
            [6.0, 7.0],
            [7.0, 8.0],
            [8.0, 9.0],
            [9.0, 10.0],
        ],
    )
    monkeypatch.setattr(
        extractor,
        "_compute_connectivity_matrix",
        lambda time_series: [[1.0, 0.5], [0.5, 1.0]],
    )

    result = extractor.extract_run_connectivity(
        bold_file=bold_file,
        confounds_file=confounds_file,
        metadata={"run_id": "01", "task_id": "rest", "space": "MNI152NLin2009cAsym", "RepetitionTime": 2.0},
        subject_id="01",
        session_id="01",
    )

    assert isinstance(result, ConnectivityRunResult)
    assert result.run_id == "01"
    assert result.task_id == "rest"
    assert result.n_volumes == 10
    assert result.matrix == [[1.0, 0.5], [0.5, 1.0]]
    assert result.source_confounds == str(confounds_file)


def test_extract_run_connectivity_without_confounds_skips_confounds_loading(monkeypatch, tmp_path: Path) -> None:
    """Run extraction without confounds should avoid confounds loading entirely."""

    atlas_img = tmp_path / "atlas.nii.gz"
    atlas_img.write_bytes(b"atlas")
    bold_file = tmp_path / "sub-01_task-rest_space-MNI152NLin2009cAsym_desc-preproc_bold.nii.gz"
    bold_file.write_bytes(b"bold")
    extractor = FunctionalConnectivityExtractor(
        atlas_img=atlas_img,
        atlas_labels=["roi1", "roi2"],
        atlas_name="toy-atlas",
    )

    calls = {"load_confounds": 0}

    def _fake_load_confounds(_: Path) -> tuple[list[list[str]], list[int]]:
        calls["load_confounds"] += 1
        return ([["motion"]], list(range(10)))

    monkeypatch.setattr(extractor, "_load_confounds", _fake_load_confounds)
    monkeypatch.setattr(
        extractor,
        "_extract_time_series",
        lambda bold_path, confounds, sample_mask, tr: [[float(index), float(index + 1)] for index in range(10)],
    )
    monkeypatch.setattr(
        extractor,
        "_compute_connectivity_matrix",
        lambda time_series: [[1.0, 0.0], [0.0, 1.0]],
    )

    result = extractor.extract_run_connectivity(
        bold_file=bold_file,
        confounds_file=None,
        metadata={"task_id": "rest", "space": "MNI152NLin2009cAsym"},
        subject_id="01",
    )

    assert calls["load_confounds"] == 0
    assert result.source_confounds is None


def test_extract_subject_connectivity_aggregates_mean_across_runs(monkeypatch, tmp_path: Path) -> None:
    """Multiple runs should produce an element-wise mean aggregated matrix."""

    derivatives_root = tmp_path / "fmriprep"
    _write_fmriprep_func_run(
        derivatives_root,
        "01",
        session_id="01",
        task_id="rest",
        run_id="01",
        space="MNI152NLin2009cAsym",
    )
    _write_fmriprep_func_run(
        derivatives_root,
        "01",
        session_id="01",
        task_id="rest",
        run_id="02",
        space="MNI152NLin2009cAsym",
    )

    atlas_img = tmp_path / "atlas.nii.gz"
    atlas_img.write_bytes(b"atlas")
    extractor = FunctionalConnectivityExtractor(
        atlas_img=atlas_img,
        atlas_labels=["roi1", "roi2"],
        atlas_name="toy-atlas",
    )

    def _fake_extract_run(
        bold_file: Path,
        confounds_file: Path | None,
        metadata: dict,
        subject_id: str,
        session_id: str | None = None,
    ) -> ConnectivityRunResult:
        matrix = [[1.0, 0.2], [0.2, 1.0]] if metadata["run_id"] == "01" else [[1.0, 0.6], [0.6, 1.0]]
        return ConnectivityRunResult(
            subject_id=subject_id,
            session_id=session_id,
            run_id=metadata.get("run_id"),
            task_id=metadata.get("task_id"),
            space=metadata.get("space", "MNI152NLin2009cAsym"),
            atlas_name="toy-atlas",
            atlas_labels=["roi1", "roi2"],
            connectivity_kind="correlation",
            matrix=matrix,
            confounds_strategy="simple",
            n_volumes=100,
            tr=2.0,
            source_bold=str(bold_file),
            source_confounds=None if confounds_file is None else str(confounds_file),
        )

    monkeypatch.setattr(extractor, "extract_run_connectivity", _fake_extract_run)

    bundle = extractor.extract_subject_connectivity(
        derivatives_root=derivatives_root,
        subject_id="01",
        session_id="01",
        aggregate=True,
    )

    assert isinstance(bundle, ConnectivityBundle)
    assert len(bundle.runs) == 2
    assert bundle.aggregation_method == "mean_across_runs"
    assert bundle.aggregated_matrix == [[1.0, 0.4], [0.4, 1.0]]


def test_extract_subject_connectivity_single_run_no_aggregate(monkeypatch, tmp_path: Path) -> None:
    """Single-run extraction should keep aggregation empty when aggregate is disabled."""

    derivatives_root = tmp_path / "fmriprep"
    _write_fmriprep_func_run(
        derivatives_root,
        "01",
        session_id="01",
        task_id="rest",
        run_id="01",
        space="MNI152NLin2009cAsym",
    )
    atlas_img = tmp_path / "atlas.nii.gz"
    atlas_img.write_bytes(b"atlas")
    extractor = FunctionalConnectivityExtractor(
        atlas_img=atlas_img,
        atlas_labels=["roi1", "roi2"],
        atlas_name="toy-atlas",
    )

    monkeypatch.setattr(
        extractor,
        "extract_run_connectivity",
        lambda bold_file, confounds_file, metadata, subject_id, session_id=None: ConnectivityRunResult(
            subject_id=subject_id,
            session_id=session_id,
            run_id=metadata.get("run_id"),
            task_id=metadata.get("task_id"),
            space=metadata.get("space", "MNI152NLin2009cAsym"),
            atlas_name="toy-atlas",
            atlas_labels=["roi1", "roi2"],
            connectivity_kind="correlation",
            matrix=[[1.0, 0.3], [0.3, 1.0]],
            confounds_strategy="simple",
            n_volumes=100,
            tr=2.0,
            source_bold=str(bold_file),
            source_confounds=None if confounds_file is None else str(confounds_file),
        ),
    )

    bundle = extractor.extract_subject_connectivity(
        derivatives_root=derivatives_root,
        subject_id="01",
        session_id="01",
        aggregate=False,
    )

    assert len(bundle.runs) == 1
    assert bundle.aggregated_matrix is None
    assert bundle.aggregation_method is None


def test_extract_subject_connectivity_raises_when_no_runs_exist(tmp_path: Path) -> None:
    """Subject-level extraction should raise when discovery finds no runs."""

    atlas_img = tmp_path / "atlas.nii.gz"
    atlas_img.write_bytes(b"atlas")
    extractor = FunctionalConnectivityExtractor(
        atlas_img=atlas_img,
        atlas_labels=["roi1", "roi2"],
        atlas_name="toy-atlas",
    )

    with pytest.raises(ConnectivityExtractionError):
        extractor.extract_subject_connectivity(
            derivatives_root=tmp_path / "empty-derivatives",
            subject_id="01",
            session_id="01",
        )


def test_api_app_construction_registers_expected_routes() -> None:
    """The API app should expose the expected neuro engine routes."""

    app = create_app(NeuroEngine())
    route_paths = {getattr(route, "path", None) for route in app.routes}
    assert "/neuro-engine/health" in route_paths
    assert "/neuro-engine/orchestrate" in route_paths


def test_orchestrate_uses_facade_collaborators(monkeypatch, tmp_path: Path) -> None:
    """The façade should compose stage outputs without touching external tools."""

    engine = NeuroEngine()
    bids_root = _build_minimal_bids_tree(tmp_path)
    t1w_path = bids_root / "sub-01" / "ses-01" / "anat" / "sub-01_T1w.nii.gz"

    monkeypatch.setattr(
        engine,
        "convert_dicom_series",
        lambda input_dir, output_dir, output_name="series.nii.gz": DICOMConversionResult(
            status="completed",
            input_dir=Path(input_dir),
            output_path=Path(output_dir) / output_name,
            dicom_files=[],
            converted_slices=12,
            notes=["stubbed conversion"],
        ),
    )
    monkeypatch.setattr(
        engine,
        "run_preprocessing",
        lambda bids_root, output_root, work_root, participant_label=None, execute=False, extra_args=None: FMRIPrepRunResult(
            status="planned",
            command=["fmriprep"],
            command_line="fmriprep",
            command_available=False,
            executed=False,
            input_bids_root=Path(bids_root),
            output_root=Path(output_root),
            work_root=Path(work_root),
            participant_label=participant_label,
            expected_outputs=[Path(output_root) / "fmriprep"],
            notes=["stubbed preprocessing"],
        ),
    )
    monkeypatch.setattr(
        engine,
        "run_structural",
        lambda t1w_path, subject_id, subjects_dir, execute=False, extra_args=None: FastSurferRunResult(
            status="planned",
            command=["run_fastsurfer.sh"],
            command_line="run_fastsurfer.sh",
            command_available=False,
            executed=False,
            t1w_path=Path(t1w_path),
            subject_id=subject_id,
            subjects_dir=Path(subjects_dir),
            expected_outputs=[Path(subjects_dir) / subject_id / "stats" / "aseg.stats"],
            notes=["stubbed structural"],
        ),
    )
    monkeypatch.setattr(
        engine,
        "analyze_functional_connectivity",
        lambda timeseries=None, bold_path=None, labels=None: ConnectivityResult(
            status="completed",
            backend="python-fallback",
            matrix=[[0.0, 0.1], [0.1, 0.0]],
            labels=["roi_00", "roi_01"],
            n_regions=2,
            source="timeseries",
            notes=["stubbed connectivity"],
        ),
    )
    monkeypatch.setattr(
        engine,
        "prepare_segmentation_model",
        lambda model_path=None, model_name=None: SegmentationModelBundle(
            status="loaded",
            model_name="dynunet",
            device="cpu",
            model_path=None,
            model_loaded=False,
            transforms_loaded=False,
            backend="metadata-only",
            notes=["stubbed bundle"],
        ),
    )
    monkeypatch.setattr(
        engine,
        "run_segmentation",
        lambda volume_path, output_dir=None, bundle=None: SegmentationInferenceResult(
            status="completed",
            backend="heuristic",
            mask_path=Path(output_dir) / "mask.nii.gz" if output_dir else tmp_path / "mask.nii.gz",
            voxel_count=42,
            foreground_fraction=0.25,
            notes=["stubbed segmentation"],
        ),
    )

    result = engine.orchestrate(
        bids_root=bids_root,
        dicom_input_dir=tmp_path / "dicom",
        conversion_output_dir=tmp_path / "converted",
        preprocessing_output_root=tmp_path / "preprocessed",
        preprocessing_work_root=tmp_path / "work",
        participant_label="01",
        structural_t1w_path=t1w_path,
        structural_subject_id="sub-01",
        structural_subjects_dir=tmp_path / "subjects",
        connectivity_timeseries=[[1.0, 2.0], [2.0, 1.0], [3.0, 0.0]],
        segmentation_volume_path=t1w_path,
        segmentation_output_dir=tmp_path / "segmentation",
    )

    assert isinstance(result.validation, BIDSValidationResult)
    assert result.validation.is_valid is True
    assert result.conversion is not None and result.conversion.status == "completed"
    assert result.preprocessing is not None and result.preprocessing.status == "planned"
    assert result.structural is not None and result.structural.subject_id == "sub-01"
    assert result.connectivity is not None and result.connectivity.n_regions == 2
    assert result.segmentation is not None and result.segmentation.voxel_count == 42
    assert result.to_dict()["segmentation"]["backend"] == "heuristic"
