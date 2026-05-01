"""Tests for :mod:`deepsynaps_mri.registration` (mocked antspyx)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from deepsynaps_mri import registration as reg


def _fake_ants_module(tmp_path: Path) -> MagicMock:
    warped = MagicMock()
    fwd = [str(tmp_path / "fwd.mat")]
    inv = [str(tmp_path / "inv.mat")]
    fake_reg = {
        "fwdtransforms": fwd,
        "invtransforms": inv,
        "warpedmovout": warped,
        "warpedfixout": None,
    }
    ants_mod = MagicMock()
    ants_mod.image_read.return_value = MagicMock()
    ants_mod.get_ants_data.return_value = "mni.nii.gz"
    ants_mod.registration.return_value = fake_reg
    ants_mod.apply_transforms_to_points.return_value = pd.DataFrame(
        {"x": [1.0], "y": [2.0], "z": [3.0]},
    )
    return ants_mod


def test_register_t1_to_mni_returns_transform(tmp_path: Path) -> None:
    t1 = tmp_path / "t1.nii.gz"
    t1.write_bytes(b"x")

    ants_mod = _fake_ants_module(tmp_path)
    warped = ants_mod.registration.return_value["warpedmovout"]
    fwd = ants_mod.registration.return_value["fwdtransforms"]
    inv = ants_mod.registration.return_value["invtransforms"]

    with patch.dict(sys.modules, {"ants": ants_mod}):
        xfm = reg.register_t1_to_mni(t1)

    assert xfm.fwd_transforms == fwd
    assert xfm.inv_transforms == inv
    assert xfm.warped_moving is warped
    ants_mod.registration.assert_called_once()


def test_warp_points_to_patient_uses_inverse(tmp_path: Path) -> None:
    inv = [str(tmp_path / "inv1.mat")]
    xfm = reg.Transform(
        fwd_transforms=[],
        inv_transforms=inv,
        warped_moving=MagicMock(),
    )

    ants_mod = _fake_ants_module(tmp_path)

    with patch.dict(sys.modules, {"ants": ants_mod}):
        pts = reg.warp_points_to_patient([(0, 0, 0)], xfm)

    assert pts == [(1.0, 2.0, 3.0)]
    call_kw = ants_mod.apply_transforms_to_points.call_args
    assert call_kw[1]["transformlist"] == inv
