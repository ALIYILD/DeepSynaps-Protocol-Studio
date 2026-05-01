"""Tests for :mod:`deepsynaps_mri.cortical_thickness`."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest

pytest.importorskip("nibabel")

import nibabel as nib

from deepsynaps_mri import cortical_thickness as ct
from deepsynaps_mri.adapters import ants_kelly_kapowski as kk_adp


def _write_morph(path: Path, n: int = 200, val: float = 2.4) -> None:
    nib.freesurfer.write_morph_data(str(path), np.full(n, val, dtype=np.float32))


def test_compute_thickness_freesurfer_surfaces(tmp_path: Path) -> None:
    subj = tmp_path / "subj"
    surf = subj / "surf"
    surf.mkdir(parents=True)
    _write_morph(surf / "lh.thickness")
    _write_morph(surf / "rh.thickness")

    r = ct.compute_cortical_thickness(
        tmp_path / "out",
        engine="freesurfer_surfaces",
        subject_dir=subj,
    )
    assert r.ok is True
    assert r.vertex_paths.lh_thickness and r.vertex_paths.rh_thickness
    assert Path(r.vertex_paths.lh_thickness).exists()
    assert r.manifest_path


def test_compute_thickness_missing_surf(tmp_path: Path) -> None:
    subj = tmp_path / "subj"
    (subj / "surf").mkdir(parents=True)
    r = ct.compute_cortical_thickness(
        tmp_path / "out",
        engine="freesurfer_surfaces",
        subject_dir=subj,
    )
    assert r.ok is False
    assert r.code == "thickness_missing"


def test_summarize_regional_aparc(tmp_path: Path) -> None:
    stats = tmp_path / "stats"
    stats.mkdir(parents=True)
    header = (
        "# ColHeaders StructName NumVert SurfArea GrayVol ThickAvg ThickStd MeanCurv GausCurv "
        "FoldInd CurvInd\n"
    )
    stats.joinpath("lh.aparc.stats").write_text(
        header + "bankssts 1200 2200 3000 2.35 0.4 0.1 0.2 10 5\n",
        encoding="utf-8",
    )
    stats.joinpath("rh.aparc.stats").write_text(
        header + "bankssts 1180 2180 2980 2.40 0.4 0.1 0.2 10 5\n",
        encoding="utf-8",
    )

    s = ct.summarize_regional_thickness(stats, tmp_path / "art")
    assert s.ok is True
    assert len(s.regions) == 2
    assert s.regions[0].region_id.startswith("lh.")
    assert s.manifest_path


def test_compute_thickness_qc_vertex(tmp_path: Path) -> None:
    lp = tmp_path / "lh.thickness"
    rp = tmp_path / "rh.thickness"
    _write_morph(lp, 150)
    _write_morph(rp, 150)
    qc = ct.compute_thickness_qc(
        lh_thickness_path=lp,
        rh_thickness_path=rp,
        artefacts_dir=tmp_path / "art",
    )
    assert qc.ok is True
    assert qc.metrics.median_mm == pytest.approx(2.4)
    assert qc.json_path


def test_compute_thickness_qc_volume(tmp_path: Path) -> None:
    vol = tmp_path / "t.nii.gz"
    data = np.random.RandomState(0).uniform(1.5, 3.5, size=(10, 10, 10)).astype(np.float32)
    nib.save(nib.Nifti1Image(data, np.eye(4)), str(vol))
    qc = ct.compute_thickness_qc(
        volume_thickness_path=vol,
        artefacts_dir=tmp_path / "art",
    )
    assert qc.ok is True
    assert qc.domain == "volume"


def test_kelly_kapowski_mocked(tmp_path: Path) -> None:
    seg = tmp_path / "s.nii.gz"
    gm = tmp_path / "g.nii.gz"
    wm = tmp_path / "w.nii.gz"
    seg_arr = np.zeros((4, 4, 4), dtype=np.float32)
    seg_arr[1:3, 1:3, 1:3] = 2  # GM label
    seg_arr[2, 2, 2] = 3  # WM voxel
    nib.save(nib.Nifti1Image(seg_arr, np.eye(4)), str(seg))
    nib.save(nib.Nifti1Image(np.ones((4, 4, 4), np.float32) * 0.5, np.eye(4)), str(gm))
    nib.save(nib.Nifti1Image(np.ones((4, 4, 4), np.float32) * 0.5, np.eye(4)), str(wm))

    out = tmp_path / "thick.nii.gz"
    fake = kk_adp.KellyKapowskiRunResult(
        ok=True,
        output_path=out,
        its=45,
        gm_label=2,
        wm_label=3,
        runtime_sec=1.0,
        log_text="ok",
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    nib.save(nib.Nifti1Image(np.ones((4, 4, 4), np.float32), np.eye(4)), str(out))

    with patch("deepsynaps_mri.cortical_thickness._adapter_kk", return_value=fake):
        r = ct.compute_cortical_thickness(
            tmp_path / "art",
            engine="ants_kelly_kapowski",
            seg_nifti=seg,
            gm_pve_nifti=gm,
            wm_pve_nifti=wm,
            run_input_validation=False,
        )

    assert r.ok is True
    assert r.volume_thickness_path
