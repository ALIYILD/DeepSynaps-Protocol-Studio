"""Tests for :mod:`deepsynaps_mri.segmentation`."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest

pytest.importorskip("nibabel")

from deepsynaps_mri import segmentation as seg
from deepsynaps_mri.adapters import fsl_fast as fast_adp
from deepsynaps_mri.adapters import fsl_first as first_adp


def _write_nifti(path: Path, data: np.ndarray) -> None:
    import nibabel as nib

    img = nib.Nifti1Image(data.astype(np.int16), np.eye(4))
    nib.save(img, str(path))


def test_segment_tissues_validation_failure(tmp_path: Path) -> None:
    bad = tmp_path / "bad.nii.gz"
    bad.write_bytes(b"not nifti")
    r = seg.segment_tissues_gm_wm_csf(bad, tmp_path)
    assert r.ok is False
    assert r.validation is not None


def test_segment_tissues_fast_mocked(tmp_path: Path) -> None:
    t1 = tmp_path / "brain.nii.gz"
    _write_nifti(t1, np.ones((4, 4, 4), dtype=np.int16))

    fast_base = tmp_path / "segmentation" / "fast_tissue"
    seg_out = Path(str(fast_base) + "_seg.nii.gz")
    seg_out.parent.mkdir(parents=True, exist_ok=True)
    # FAST-style: 1=CSF 2=GM 3=WM in brain voxels
    arr = np.zeros((4, 4, 4), dtype=np.int16)
    arr[1:3, 1:3, 1:3] = 2
    _write_nifti(seg_out, arr)

    pve0 = Path(str(fast_base) + "_pve_0.nii.gz")
    _write_nifti(pve0, np.zeros((4, 4, 4), dtype=np.float32))

    fake = fast_adp.FASTRunResult(
        ok=True,
        out_basename=fast_base,
        seg_path=seg_out,
        pve_csf_path=pve0,
        pve_gm_path=Path(str(fast_base) + "_pve_1.nii.gz"),
        pve_wm_path=Path(str(fast_base) + "_pve_2.nii.gz"),
        command=["fast", "x"],
        returncode=0,
        log_path=None,
        stderr_text="",
    )
    Path(str(fast_base) + "_pve_1.nii.gz").write_bytes(pve0.read_bytes())
    Path(str(fast_base) + "_pve_2.nii.gz").write_bytes(pve0.read_bytes())

    with patch("deepsynaps_mri.segmentation._adapter_fast", return_value=fake):
        r = seg.segment_tissues_gm_wm_csf(t1, tmp_path, run_input_validation=False)

    assert r.ok is True
    assert r.tissue_seg_path
    assert Path(r.tissue_seg_path).exists()
    assert r.manifest_path and Path(r.manifest_path).exists()


def test_segment_subcortical_first_mocked(tmp_path: Path) -> None:
    t1 = tmp_path / "brain.nii.gz"
    _write_nifti(t1, np.ones((4, 4, 4), dtype=np.int16))

    first_seg = tmp_path / "first_out_all_fast_firstseg.nii.gz"
    _write_nifti(first_seg, np.zeros((4, 4, 4), dtype=np.int16))

    fake = first_adp.FIRSTRunResult(
        ok=True,
        output_prefix=tmp_path / "segmentation" / "first_subcort",
        seg_path=first_seg,
        command=["first", "-i", "x"],
        returncode=0,
        log_path=None,
        stderr_text="",
    )

    with patch("deepsynaps_mri.segmentation._adapter_first", return_value=fake):
        r = seg.segment_subcortical_structures(t1, tmp_path, run_input_validation=False)

    assert r.ok is True
    assert r.labels_path and Path(r.labels_path).exists()


def test_compute_segmentation_qc(tmp_path: Path) -> None:
    lab = np.zeros((5, 5, 5), dtype=np.int16)
    lab[1:4, 1:4, 1:4] = 2
    lab[2, 2, 2] = 3
    p = tmp_path / "seg.nii.gz"
    _write_nifti(p, lab)

    qc = seg.compute_segmentation_qc(p, tmp_path)
    assert qc.ok is True
    assert qc.metrics.frac_gm is not None
    assert qc.json_path and Path(qc.json_path).exists()
