"""Thin integration tests for :func:`deepsynaps_mri.pipeline.run_pipeline` with stubs."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from deepsynaps_mri.io import ConvertedScan
from deepsynaps_mri.pipeline import run_pipeline
from deepsynaps_mri.schemas import PatientMeta, Sex


@pytest.fixture
def patient() -> PatientMeta:
    return PatientMeta(patient_id="DS-TEST-1", age=40, sex=Sex.M)


def test_run_pipeline_targeting_only_returns_report(patient: PatientMeta, tmp_path: Path) -> None:
    """End-to-end envelope: no disk ingest; targeting + medrag build only."""
    session = tmp_path / "session"
    session.mkdir()
    out = tmp_path / "out"

    report = run_pipeline(
        session,
        patient,
        out,
        only=("targeting", "medrag"),
    )

    assert report.patient.patient_id == "DS-TEST-1"
    assert report.stim_targets
    assert report.medrag_query is not None


def test_run_pipeline_structural_stub_writes_manifest(
    patient: PatientMeta,
    tmp_path: Path,
) -> None:
    session = tmp_path / "session"
    session.mkdir()
    out = tmp_path / "out"
    t1_nii = tmp_path / "t1.nii.gz"
    t1_nii.write_bytes(b"x")

    stats_dir = tmp_path / "fake_stats"
    stats_dir.mkdir()
    (stats_dir / "aseg.stats").write_text(
        "# ColHeaders Index SegId NVoxels Volume_mm3 StructName\n"
        "1 2 100 100.0 Left-Thalamus-Proper\n"
        "# Measure IntracranialVolume, ICV, Brain Volume, 1000000.0, mm^3\n",
        encoding="utf-8",
    )
    (stats_dir / "lh.aparc.stats").write_text(
        "# ColHeaders StructName NumVert SurfArea GrayVol ThickAvg ThickStd\n"
        "bankssts 10 10 10 2.0 0.1\n",
        encoding="utf-8",
    )
    (stats_dir / "rh.aparc.stats").write_text(
        "# ColHeaders StructName NumVert SurfArea GrayVol ThickAvg ThickStd\n"
        "bankssts 10 10 10 2.0 0.1\n",
        encoding="utf-8",
    )

    seg = MagicMock()
    seg.engine = __import__(
        "deepsynaps_mri.schemas",
        fromlist=["SegmentationEngine"],
    ).SegmentationEngine.FASTSURFER
    seg.aseg_path = stats_dir / "aseg.mgz"
    seg.aparc_path = stats_dir / "aparc.mgz"
    seg.thickness_path = stats_dir / "lh.thickness"
    seg.wmh_path = None
    seg.stats_dir = stats_dir

    fake_ingest = [
        ConvertedScan(
            nifti_path=t1_nii,
            sidecar_path=None,
            modality_guess="T1w",
            n_volumes=1,
        ),
    ]

    with (
        patch("deepsynaps_mri.pipeline.io_mod.ingest", return_value=fake_ingest),
        patch(
            "deepsynaps_mri.pipeline.struct_mod.segment",
            return_value=seg,
        ),
        patch(
            "deepsynaps_mri.pipeline.struct_mod.attach_brain_age",
            side_effect=lambda m, **kw: m,
        ),
        patch("deepsynaps_mri.pipeline.qc_mod.run_mriqc"),
        patch("deepsynaps_mri.pipeline.qc_mod.screen_incidental_findings"),
    ):
        report = run_pipeline(
            session,
            patient,
            out,
            only=("ingest", "structural"),
        )

    assert report.structural is not None
    manifest = out / "artefacts" / "structural" / "structural_metrics_manifest.json"
    assert manifest.is_file()
