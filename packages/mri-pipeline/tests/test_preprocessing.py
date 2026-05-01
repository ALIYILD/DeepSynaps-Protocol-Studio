"""Tests for :mod:`deepsynaps_mri.preprocessing` and adapters."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest

pytest.importorskip("nibabel")

from deepsynaps_mri import preprocessing as prep
from deepsynaps_mri.adapters import fsl_bet as bet_adp


def _write_minimal_nifti(path: Path, *, data: np.ndarray | None = None) -> None:
    import nibabel as nib

    if data is None:
        data = np.random.RandomState(42).rand(8, 8, 8).astype(np.float32) * 100 + 50
    affine = np.eye(4)
    img = nib.Nifti1Image(data, affine)
    nib.save(img, str(path))


def test_normalize_orientation_writes_ras(tmp_path: Path) -> None:
    import nibabel as nib

    inp = tmp_path / "in.nii.gz"
    _write_minimal_nifti(inp)
    o = prep.normalize_orientation(inp, tmp_path, output_name="ras.nii.gz")
    assert o.ok is True
    assert o.output_path
    assert Path(o.output_path).exists()


def test_normalize_intensity_zscore(tmp_path: Path) -> None:
    vol = np.ones((6, 6, 6), dtype=np.float32) * 10.0
    inp = tmp_path / "v.nii.gz"
    _write_minimal_nifti(inp, data=vol)

    mask = np.zeros((6, 6, 6), dtype=np.float32)
    mask[1:4, 1:4, 1:4] = 1  # same constant inside mask → z-score 0 everywhere in mask
    mpath = tmp_path / "m.nii.gz"
    import nibabel as nib

    nib.save(nib.Nifti1Image(mask, np.eye(4)), str(mpath))

    z = prep.normalize_intensity(inp, mpath, tmp_path, output_name="z.nii.gz")
    assert z.ok is True
    arr = np.asanyarray(nib.load(z.output_path).dataobj)
    inside = arr[mask > 0.5]
    assert np.all(np.abs(inside) < 1e-4)


def test_generate_preprocessing_qc_json(tmp_path: Path) -> None:
    vol = np.random.RandomState(0).rand(5, 5, 5).astype(np.float32)
    nii = tmp_path / "x.nii.gz"
    _write_minimal_nifti(nii, data=vol)

    qc = prep.generate_preprocessing_qc(nii, None, tmp_path)
    assert qc.ok is True
    assert qc.json_path
    assert Path(qc.json_path).exists()
    assert qc.metrics.mean_in_brain is not None


def test_brain_extract_missing_input(tmp_path: Path) -> None:
    r = prep.brain_extract(tmp_path / "missing.nii.gz", tmp_path / "out")
    assert r.ok is False
    assert r.code == "input_missing"


def test_run_structural_preprocessing_chain_mocked(tmp_path: Path) -> None:
    inp = tmp_path / "t1.nii.gz"
    _write_minimal_nifti(inp)

    brain_p = tmp_path / "bet_brain.nii.gz"
    mask_p = tmp_path / "bet_brain_mask.nii.gz"
    import nibabel as nib

    nib.save(nib.Nifti1Image(np.ones((8, 8, 8), dtype=np.float32), np.eye(4)), str(brain_p))
    nib.save(nib.Nifti1Image(np.ones((8, 8, 8), dtype=np.float32), np.eye(4)), str(mask_p))

    fake_bet = bet_adp.BETRunResult(
        ok=True,
        brain_path=brain_p,
        mask_path=mask_p,
        command=["bet", "x", "y"],
        returncode=0,
        stdout_path=None,
        stderr_text="",
    )

    art = tmp_path / "art"
    n4_out = art / "t1_n4.nii.gz"
    art.mkdir(parents=True, exist_ok=True)
    nib.save(nib.Nifti1Image(np.ones((8, 8, 8), dtype=np.float32), np.eye(4)), str(n4_out))

    class FakeN4:
        ok = True
        output_path = n4_out
        code = ""
        message = "ok"
        log_text = ""

    with patch("deepsynaps_mri.preprocessing._adapter_bet", return_value=fake_bet):
        with patch("deepsynaps_mri.preprocessing._adapter_n4") as mock_n4:
            mock_n4.return_value = FakeN4()
            summary = prep.run_structural_preprocessing(
                inp,
                art,
                run_reorient_step=False,
                run_bet_step=True,
                run_n4_step=True,
                run_zscore_step=False,
                skip_bet_if_no_fsl=False,
            )

    assert summary["steps"]["brain_extract"]["ok"] is True
    assert summary["steps"]["bias_n4"]["ok"] is True
    assert summary["steps"]["qc"]["ok"] is True


def test_bias_correct_propagates_adapter_failure(tmp_path: Path) -> None:
    inp = tmp_path / "a.nii.gz"
    _write_minimal_nifti(inp)

    class Fail:
        ok = False
        output_path = None
        code = "antspyx_missing"
        message = "no ants"
        log_text = ""

    with patch("deepsynaps_mri.preprocessing._adapter_n4", return_value=Fail()):
        r = prep.bias_correct_n4(inp, tmp_path)
    assert r.ok is False
    assert r.code == "antspyx_missing"
