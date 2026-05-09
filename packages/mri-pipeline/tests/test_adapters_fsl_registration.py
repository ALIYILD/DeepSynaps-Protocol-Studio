"""Residual tests for FSL adapters (BET / FAST / FIRST / deface)
and :mod:`deepsynaps_mri.registration` extended API.

All subprocess calls are mocked — no FSL or ANTs install needed.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, call, patch
import subprocess

import numpy as np
import pytest

# ─────────────────────────────── FSL BET ──────────────────────────────────────

from deepsynaps_mri.adapters import fsl_bet, fsl_fast, fsl_first, deface


class TestFSLBet:
    def test_basic_invocation_argv(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        out = tmp_path / "t1_brain"
        with patch("deepsynaps_mri.adapters.fsl_bet.run_logged_subprocess") as m:
            argv = fsl_bet.run_bet(t1, out)
        assert argv[0] == "bet"
        assert str(t1) in argv
        assert str(out) in argv
        assert "-f" in argv
        assert "0.5" in argv
        m.assert_called_once()

    def test_custom_fractional_intensity(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        out = tmp_path / "brain"
        with patch("deepsynaps_mri.adapters.fsl_bet.run_logged_subprocess"):
            argv = fsl_bet.run_bet(t1, out, fractional_intensity=0.3)
        assert "0.3" in argv

    def test_robust_flag_included(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        out = tmp_path / "brain"
        with patch("deepsynaps_mri.adapters.fsl_bet.run_logged_subprocess"):
            argv = fsl_bet.run_bet(t1, out, robust=True)
        assert "-R" in argv

    def test_robust_flag_absent_by_default(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        out = tmp_path / "brain"
        with patch("deepsynaps_mri.adapters.fsl_bet.run_logged_subprocess"):
            argv = fsl_bet.run_bet(t1, out)
        assert "-R" not in argv

    def test_returns_list_of_strings(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        with patch("deepsynaps_mri.adapters.fsl_bet.run_logged_subprocess"):
            argv = fsl_bet.run_bet(t1, tmp_path / "brain")
        assert isinstance(argv, list)
        assert all(isinstance(a, str) for a in argv)


# ─────────────────────────────── FSL FAST ─────────────────────────────────────

class TestFSLFast:
    def test_basic_argv(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1_brain.nii.gz"
        t1.write_bytes(b"x")
        out = tmp_path / "fast_out"
        with patch("deepsynaps_mri.adapters.fsl_fast.run_logged_subprocess") as m:
            argv = fsl_fast.run_fast(t1, out)
        assert argv[0] == "fast"
        assert "-o" in argv
        assert str(out) in argv
        assert "-n" in argv
        assert "3" in argv
        m.assert_called_once()

    def test_bias_correction_flag_present_by_default(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        with patch("deepsynaps_mri.adapters.fsl_fast.run_logged_subprocess"):
            argv = fsl_fast.run_fast(t1, tmp_path / "out")
        assert "-B" in argv

    def test_bias_correction_flag_absent_when_disabled(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        with patch("deepsynaps_mri.adapters.fsl_fast.run_logged_subprocess"):
            argv = fsl_fast.run_fast(t1, tmp_path / "out", bias_field_correction=False)
        assert "-B" not in argv

    def test_custom_n_classes(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        with patch("deepsynaps_mri.adapters.fsl_fast.run_logged_subprocess"):
            argv = fsl_fast.run_fast(t1, tmp_path / "out", n_classes=4)
        idx = argv.index("-n")
        assert argv[idx + 1] == "4"

    def test_input_path_last_in_argv(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        with patch("deepsynaps_mri.adapters.fsl_fast.run_logged_subprocess"):
            argv = fsl_fast.run_fast(t1, tmp_path / "out")
        assert argv[-1] == str(t1)


# ─────────────────────────────── FSL FIRST ────────────────────────────────────

class TestFSLFirst:
    def test_resolve_first_binary_returns_none_when_missing(self) -> None:
        with patch("shutil.which", return_value=None):
            result = fsl_first.resolve_first_binary()
        assert result is None

    def test_resolve_first_binary_returns_first_path(self) -> None:
        with patch("shutil.which", side_effect=lambda x: "/usr/bin/first" if x == "first" else None):
            result = fsl_first.resolve_first_binary()
        assert result == "/usr/bin/first"

    def test_resolve_first_binary_returns_run_first_all_as_fallback(self) -> None:
        def which_mock(name):
            return "/usr/bin/run_first_all" if name == "run_first_all" else None
        with patch("shutil.which", side_effect=which_mock):
            result = fsl_first.resolve_first_binary()
        assert result == "/usr/bin/run_first_all"

    def test_run_first_raises_when_not_on_path(self, tmp_path: Path) -> None:
        with patch("shutil.which", return_value=None):
            with pytest.raises(FileNotFoundError, match="Neither 'first' nor 'run_first_all'"):
                fsl_first.run_first(tmp_path / "t1.nii.gz", tmp_path / "first_out")

    def test_run_first_argv_structure_with_first_binary(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        with patch("shutil.which", side_effect=lambda x: "/usr/bin/first" if x == "first" else None):
            with patch("deepsynaps_mri.adapters.fsl_first.run_logged_subprocess") as m:
                argv = fsl_first.run_first(t1, tmp_path / "first_out")
        assert argv[0] == "/usr/bin/first"
        assert "-i" in argv and str(t1) in argv
        assert "-o" in argv
        m.assert_called_once()

    def test_run_first_with_structures_flag(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        with patch("shutil.which", side_effect=lambda x: "/usr/bin/first" if x == "first" else None):
            with patch("deepsynaps_mri.adapters.fsl_first.run_logged_subprocess"):
                argv = fsl_first.run_first(t1, tmp_path / "out", structures="L_Hipp,R_Hipp")
        assert "-s" in argv
        idx = argv.index("-s")
        assert argv[idx + 1] == "L_Hipp,R_Hipp"

    def test_run_first_run_first_all_argv(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        with patch("shutil.which", side_effect=lambda x: "/usr/bin/run_first_all" if x == "run_first_all" else None):
            with patch("deepsynaps_mri.adapters.fsl_first.run_logged_subprocess"):
                argv = fsl_first.run_first(t1, tmp_path / "out")
        assert argv[0] == "/usr/bin/run_first_all"
        assert "-i" in argv
        assert "-o" in argv


# ─────────────────────────────── Deface adapters ──────────────────────────────

class TestDeface:
    def test_run_pydeface_argv(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        out = tmp_path / "defaced.nii.gz"
        with patch("deepsynaps_mri.adapters.deface.run_logged_subprocess") as m:
            argv = deface.run_pydeface(t1, out)
        assert argv[0] == "pydeface"
        assert "--force" in argv
        assert "--out" in argv
        idx = argv.index("--out")
        assert argv[idx + 1] == str(out)
        m.assert_called_once()

    def test_run_mri_deface_argv(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        tal_gca = tmp_path / "tal.gca"
        face_gca = tmp_path / "face.gca"
        out = tmp_path / "defaced.nii.gz"
        with patch("deepsynaps_mri.adapters.deface.run_logged_subprocess") as m:
            argv = deface.run_mri_deface(
                "/usr/bin/mri_deface", t1, tal_gca, face_gca, out
            )
        assert argv[0] == "/usr/bin/mri_deface"
        assert str(t1) in argv
        assert str(tal_gca) in argv
        assert str(face_gca) in argv
        assert str(out) in argv
        m.assert_called_once()

    def test_run_pydeface_returns_list_of_strings(self, tmp_path: Path) -> None:
        t1 = tmp_path / "t1.nii.gz"
        t1.write_bytes(b"x")
        with patch("deepsynaps_mri.adapters.deface.run_logged_subprocess"):
            argv = deface.run_pydeface(t1, tmp_path / "out.nii.gz")
        assert isinstance(argv, list)
        assert all(isinstance(a, str) for a in argv)


# ─────────────────────── registration extended models ─────────────────────────

from deepsynaps_mri import registration as reg


class TestRegistrationModels:
    def test_mni_template_name_returns_string(self) -> None:
        name = reg.mni_template_name()
        assert isinstance(name, str)
        assert len(name) > 0

    def test_transform_dataclass_fields(self, tmp_path: Path) -> None:
        xfm = reg.Transform(
            fwd_transforms=["a.mat"],
            inv_transforms=["b.mat"],
            warped_moving=MagicMock(),
            warped_fixed=None,
        )
        assert xfm.fwd_transforms == ["a.mat"]
        assert xfm.inv_transforms == ["b.mat"]
        assert xfm.warped_fixed is None

    def test_mni_registration_bundle_defaults(self) -> None:
        bundle = reg.MniRegistrationBundle(moving_path="/tmp/t1.nii.gz")
        assert bundle.ok is True
        assert bundle.transform_type == "SyN"
        assert bundle.fwd_transform_paths == []
        assert bundle.inv_transform_paths == []
        assert bundle.message == ""

    def test_apply_transform_result_ok(self) -> None:
        r = reg.ApplyTransformResult(ok=True, output_path="/out.nii.gz", message="ok")
        assert r.ok is True
        assert r.output_path == "/out.nii.gz"

    def test_apply_transform_result_failure(self) -> None:
        r = reg.ApplyTransformResult(ok=False, message="ants not installed")
        assert r.ok is False
        assert r.output_path is None
        assert "ants" in r.message

    def test_invert_transform_result_ok(self) -> None:
        r = reg.InvertTransformResult(ok=True, output_path="/inv.nii.gz", message="ok")
        assert r.ok is True
        assert r.output_path == "/inv.nii.gz"

    def test_registration_qc_metrics_defaults(self) -> None:
        m = reg.RegistrationQCMetrics()
        assert m.pearson_r is None
        assert m.mean_abs_diff is None
        assert m.n_voxels_evaluated is None

    def test_registration_qc_report_defaults(self) -> None:
        r = reg.RegistrationQCReport(ok=True, message="ok")
        assert r.ok is True
        assert r.metrics.pearson_r is None

    def test_apply_transform_failure_when_ants_raises(self, tmp_path: Path) -> None:
        """apply_transform returns ok=False when ants.apply_transforms raises."""
        ants_mod = MagicMock()
        ants_mod.apply_transforms.side_effect = RuntimeError("antspyx error")

        with patch.dict(sys.modules, {"ants": ants_mod}):
            result = reg.apply_transform(
                moving_path=tmp_path / "t1.nii.gz",
                reference_path=tmp_path / "ref.nii.gz",
                transform_paths=["fake.mat"],
                output_path=tmp_path / "out.nii.gz",
            )
        assert result.ok is False
        assert "antspyx error" in result.message

    def test_invert_transform_failure_when_ants_raises(self, tmp_path: Path) -> None:
        ants_mod = MagicMock()
        ants_mod.apply_transforms.side_effect = RuntimeError("inv error")

        with patch.dict(sys.modules, {"ants": ants_mod}):
            result = reg.invert_transform(
                moving_path=tmp_path / "t1.nii.gz",
                reference_path=tmp_path / "ref.nii.gz",
                inverse_transform_paths=["fake_inv.mat"],
                output_path=tmp_path / "out.nii.gz",
            )
        assert result.ok is False
        assert "inv error" in result.message


class TestComputeRegistrationQC:
    """Tests for compute_registration_qc — uses pure numpy, no ANTs needed."""

    def _fake_ants_with_images(self, arr_a: np.ndarray, arr_b: np.ndarray) -> MagicMock:
        ants_mod = MagicMock()
        img_a = MagicMock()
        img_a.numpy.return_value = arr_a
        img_b = MagicMock()
        img_b.numpy.return_value = arr_b
        ants_mod.image_read.side_effect = [img_a, img_b]
        return ants_mod

    def test_qc_perfect_correlation(self, tmp_path: Path) -> None:
        arr = np.linspace(0, 1, 200).reshape(10, 20)
        ants_mod = self._fake_ants_with_images(arr, arr)
        with patch.dict(sys.modules, {"ants": ants_mod}):
            result = reg.compute_registration_qc(
                tmp_path / "fixed.nii.gz",
                tmp_path / "warped.nii.gz",
                tmp_path,
            )
        assert result.ok is True
        assert result.metrics.pearson_r == pytest.approx(1.0)
        assert result.metrics.mean_abs_diff == pytest.approx(0.0)
        assert result.metrics.n_voxels_evaluated == 200

    def test_qc_manifest_written(self, tmp_path: Path) -> None:
        arr = np.linspace(0, 1, 200).reshape(10, 20)
        ants_mod = self._fake_ants_with_images(arr, arr)
        with patch.dict(sys.modules, {"ants": ants_mod}):
            result = reg.compute_registration_qc(
                tmp_path / "f.nii.gz",
                tmp_path / "w.nii.gz",
                tmp_path,
            )
        assert result.manifest_path is not None
        manifest = Path(result.manifest_path)
        assert manifest.exists()
        data = json.loads(manifest.read_text())
        assert "pearson_r" in data

    def test_qc_too_few_voxels(self, tmp_path: Path) -> None:
        arr = np.array([1.0, 2.0])
        ants_mod = self._fake_ants_with_images(arr, arr)
        with patch.dict(sys.modules, {"ants": ants_mod}):
            result = reg.compute_registration_qc(
                tmp_path / "f.nii.gz",
                tmp_path / "w.nii.gz",
                tmp_path,
            )
        assert result.ok is False
        assert result.message == "too_few_voxels"

    def test_qc_constant_arrays_pearson_none(self, tmp_path: Path) -> None:
        arr_a = np.ones(200)
        arr_b = np.ones(200) * 2
        ants_mod = self._fake_ants_with_images(arr_a, arr_b)
        with patch.dict(sys.modules, {"ants": ants_mod}):
            result = reg.compute_registration_qc(
                tmp_path / "f.nii.gz",
                tmp_path / "w.nii.gz",
                tmp_path,
            )
        assert result.ok is True
        assert result.metrics.pearson_r is None
        assert result.metrics.mean_abs_diff == pytest.approx(1.0)

    def test_qc_antspyx_not_installed(self, tmp_path: Path) -> None:
        with patch.dict(sys.modules, {"ants": None}):
            result = reg.compute_registration_qc(
                tmp_path / "f.nii.gz",
                tmp_path / "w.nii.gz",
                tmp_path,
            )
        assert result.ok is False
        assert "antspyx not installed" in result.message


class TestWriteRegistrationManifest:
    def test_manifest_json_written(self, tmp_path: Path) -> None:
        fwd = [str(tmp_path / "fwd.mat")]
        inv = [str(tmp_path / "inv.mat")]
        for p in fwd + inv:
            Path(p).write_bytes(b"x")

        xfm = reg.Transform(
            fwd_transforms=fwd,
            inv_transforms=inv,
            warped_moving=MagicMock(),
        )
        out = reg.write_registration_manifest(
            tmp_path,
            moving_t1_path=tmp_path / "t1.nii.gz",
            warped_mni_path=tmp_path / "mni.nii.gz",
            xfm=xfm,
            transform_type="SyNRA",
        )
        assert out.exists()
        data = json.loads(out.read_text())
        assert data["tool"] == "antspyx"
        assert data["transform_type"] == "SyNRA"
        assert isinstance(data["fwd_transforms"], list)
