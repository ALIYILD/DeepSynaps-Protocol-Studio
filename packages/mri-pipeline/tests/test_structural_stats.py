"""Tests for :mod:`deepsynaps_mri.structural_stats` and metrics extraction."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from deepsynaps_mri import structural as s
from deepsynaps_mri import structural_stats as ss
from deepsynaps_mri.schemas import SegmentationEngine


def _minimal_aseg_stats() -> str:
    return """# TableFormat 2.0
# ColHeaders Index SegId NVoxels Volume_mm3 StructName
 1  2  1000  1000.0  Left-Cerebral-White-Matter
 2  3  500  500.0  Left-Cerebral-Cortex
# Measure IntracranialVolume, ICV, Brain Volume (Sum of CSF, GM, WM), 1500000.0, mm^3
"""


def _minimal_aparc_line(struct_name: str, thick: str = "2.5") -> str:
    return (
        f"# TableFormat 2.0\n"
        f"# ColHeaders StructName NumVert SurfArea GrayVol ThickAvg ThickStd MeanCurv GausCurv FoldCurf CurvIndir VertStd ThickStd\t\n"
        f"{struct_name} 100 100 100 {thick} 0.1 0.1 0.1 0.1 0.1 0.1\t\n"
    )


def test_parse_aseg_stats_icv(tmp_path: Path) -> None:
    p = tmp_path / "aseg.stats"
    p.write_text(_minimal_aseg_stats(), encoding="utf-8")
    vols, icv = ss.parse_aseg_stats(p)
    assert icv == pytest.approx(1500.0)
    assert "Left-Cerebral-White-Matter" in vols


def test_parse_aparc_stats_thickness(tmp_path: Path) -> None:
    p = tmp_path / "lh.aparc.stats"
    p.write_text(_minimal_aparc_line("bankssts"), encoding="utf-8")
    t = ss.parse_aparc_stats_thickness(p)
    assert t["bankssts"] == pytest.approx(2.5)


def test_parse_synthseg_volumes_csv(tmp_path: Path) -> None:
    p = tmp_path / "volumes.csv"
    p.write_text(
        "Hippocampus,Putamen,CSF\n1234.0,5678.0,890.0\n",
        encoding="utf-8",
    )
    v = ss.parse_synthseg_volumes_csv(p)
    assert v["Hippocampus"] == pytest.approx(1234.0)


def test_extract_fastsurfer_writes_manifest(tmp_path: Path) -> None:
    stats = tmp_path / "sub1" / "stats"
    stats.mkdir(parents=True)
    (stats / "aseg.stats").write_text(_minimal_aseg_stats(), encoding="utf-8")
    (stats / "lh.aparc.stats").write_text(_minimal_aparc_line("bankssts"), encoding="utf-8")
    (stats / "rh.aparc.stats").write_text(_minimal_aparc_line("bankssts"), encoding="utf-8")

    seg = s.SegmentationResult(
        engine=SegmentationEngine.FASTSURFER,
        aseg_path=tmp_path / "mri" / "aseg.mgz",
        aparc_path=tmp_path / "mri" / "aparc.mgz",
        thickness_path=tmp_path / "surf" / "lh.thickness",
        wmh_path=None,
        stats_dir=stats,
    )
    m = s.extract_structural_metrics(
        seg,
        age=40.0,
        sex="M",
        artefacts_root=tmp_path / "art",
    )
    assert m.icv_ml == pytest.approx(1500.0)
    assert m.structural_metrics_manifest_path
    man = Path(m.structural_metrics_manifest_path)
    assert man.is_file()
    data = json.loads(man.read_text(encoding="utf-8"))
    assert data["n_subcortical"] >= 1


def test_extract_synthseg_from_csv(tmp_path: Path) -> None:
    out = tmp_path / "seg"
    out.mkdir()
    (out / "volumes.csv").write_text(
        "Hippocampus,Putamen\n5000.0,6000.0\n",
        encoding="utf-8",
    )
    seg = s.SegmentationResult(
        engine=SegmentationEngine.SYNTHSEG_PLUS,
        aseg_path=out / "seg.nii.gz",
        aparc_path=out / "parc.nii.gz",
        thickness_path=None,
        wmh_path=None,
        stats_dir=out,
    )
    m = s.extract_structural_metrics(seg, age=None, sex=None, artefacts_root=None)
    assert "Hippocampus" in m.subcortical_volume_mm3
    assert m.icv_ml is not None
