"""Unit tests for cortical surface and thickness façade modules."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from deepsynaps_mri import cortical_surfaces as cs
from deepsynaps_mri import cortical_thickness as ct


def test_export_surface_meshes_and_qc(tmp_path: Path) -> None:
    surf = tmp_path / "surf"
    surf.mkdir()
    for name in ("lh.white", "rh.white", "lh.pial", "rh.pial"):
        (surf / name).write_bytes(b"x")
    exp = tmp_path / "export"
    out = cs.export_surface_meshes(surf, exp)
    assert out.ok
    assert len(out.exported_paths) == 4
    qc = cs.compute_surface_qc(surf, tmp_path)
    assert qc.ok
    assert qc.metrics.n_present == 4


def test_reconstruct_skips_when_surfaces_exist(tmp_path: Path) -> None:
    subject_id = "sub01"
    sdir = tmp_path / "segmentation" / subject_id / "surf"
    sdir.mkdir(parents=True)
    for name in ("lh.white", "rh.white", "lh.pial", "rh.pial"):
        (sdir / name).write_bytes(b"s")

    with patch("deepsynaps_mri.cortical_surfaces.structural_mod.run_fastsurfer") as mock_fs:
        res = cs.reconstruct_cortical_surfaces(tmp_path / "t1.nii.gz", tmp_path, subject_id)
        mock_fs.assert_not_called()
    assert res.ok
    assert res.message == "surfaces_already_present"


def test_summarize_regional_thickness(tmp_path: Path) -> None:
    stats = tmp_path / "stats"
    stats.mkdir()
    lh = stats / "lh.aparc.stats"
    rh = stats / "rh.aparc.stats"
    row = (
        "# ColHeaders StructName NumVert SurfArea GrayVol ThickAvg ThickStd\n"
        "bankssts 10 10 10 2.7 0.1\n"
    )
    lh.write_text(row, encoding="utf-8")
    rh.write_text(row.replace("2.7", "2.6"), encoding="utf-8")
    summary = ct.summarize_regional_thickness(stats, tmp_path)
    assert summary.ok
    assert summary.global_mean_mm is not None
    assert "lh_bankssts" in summary.region_mean_mm
    qc = ct.compute_thickness_qc(stats, tmp_path)
    assert qc.ok
    assert qc.metrics.min_region_mm is not None


def test_compute_cortical_thickness_manifest(tmp_path: Path) -> None:
    stats = tmp_path / "stats"
    stats.mkdir()
    (stats / "lh.aparc.stats").write_text(
        "# ColHeaders StructName NumVert SurfArea GrayVol ThickAvg ThickStd\n"
        "bankssts 10 10 10 2.5 0.1\n",
        encoding="utf-8",
    )
    res = ct.compute_cortical_thickness(stats, tmp_path)
    assert res.ok
    assert res.manifest_path
    data = json.loads(Path(res.manifest_path).read_text(encoding="utf-8"))
    assert data.get("lh_aparc_stats")
