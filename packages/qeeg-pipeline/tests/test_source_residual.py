"""Residual tests for :mod:`deepsynaps_qeeg.source` sub-modules.

Covers the logic paths not touched by test_source.py (which needs the
`synthetic_raw` fixture and can be slow).  These tests use pure Python / mocks
and do NOT require real EEG fixtures.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ─── source.forward helpers ──────────────────────────────────────────────────

def test_resolve_subjects_dir_explicit_path(tmp_path):
    """_resolve_subjects_dir respects an explicit subjects_dir argument."""
    from deepsynaps_qeeg.source.forward import _resolve_subjects_dir

    fake_mne = MagicMock()
    result = _resolve_subjects_dir(fake_mne, "sub01", str(tmp_path))
    assert result == str(tmp_path)
    fake_mne.datasets.fetch_fsaverage.assert_not_called()


def test_resolve_subjects_dir_fsaverage_fetches(tmp_path):
    """_resolve_subjects_dir calls fetch_fsaverage when no explicit path given."""
    from deepsynaps_qeeg.source.forward import _resolve_subjects_dir

    fake_mne = MagicMock()
    fake_mne.datasets.fetch_fsaverage.return_value = str(tmp_path / "fsaverage")
    result = _resolve_subjects_dir(fake_mne, "fsaverage", None)
    fake_mne.datasets.fetch_fsaverage.assert_called_once()
    assert result == str(tmp_path)


def test_resolve_subjects_dir_non_fsaverage_without_path_raises():
    """_resolve_subjects_dir must raise ValueError for non-fsaverage without subjects_dir."""
    from deepsynaps_qeeg.source.forward import _resolve_subjects_dir

    fake_mne = MagicMock()
    with pytest.raises(ValueError, match="subjects_dir is required for non-fsaverage"):
        _resolve_subjects_dir(fake_mne, "sub01", None)


def test_load_or_make_bem_solution_missing_file_calls_make(tmp_path):
    """_load_or_make_bem_solution falls through to make_bem_model when .fif missing."""
    from deepsynaps_qeeg.source.forward import _load_or_make_bem_solution

    fake_mne = MagicMock()
    fake_mne.make_bem_model.return_value = MagicMock()
    fake_mne.make_bem_solution.return_value = MagicMock(name="bem_solution")

    result = _load_or_make_bem_solution(fake_mne, "fsaverage", str(tmp_path))

    fake_mne.make_bem_model.assert_called_once()
    assert result is fake_mne.make_bem_solution.return_value


def test_load_or_make_bem_solution_existing_file_reads(tmp_path):
    """_load_or_make_bem_solution reads from disk when .fif file is present."""
    from deepsynaps_qeeg.source.forward import _load_or_make_bem_solution

    # Create dummy directory structure expected by the function
    bem_dir = tmp_path / "fsaverage" / "bem"
    bem_dir.mkdir(parents=True)
    bem_file = bem_dir / "fsaverage-5120-5120-5120-bem-sol.fif"
    bem_file.write_bytes(b"fake")

    fake_mne = MagicMock()
    fake_mne.read_bem_solution.return_value = MagicMock(name="loaded_bem")

    result = _load_or_make_bem_solution(fake_mne, "fsaverage", str(tmp_path))

    fake_mne.read_bem_solution.assert_called_once()
    assert result is fake_mne.read_bem_solution.return_value


def test_load_or_make_bem_solution_read_failure_falls_back(tmp_path):
    """_load_or_make_bem_solution falls back to make_bem_model if read raises."""
    from deepsynaps_qeeg.source.forward import _load_or_make_bem_solution

    bem_dir = tmp_path / "fsaverage" / "bem"
    bem_dir.mkdir(parents=True)
    (bem_dir / "fsaverage-5120-5120-5120-bem-sol.fif").write_bytes(b"corrupt")

    fake_mne = MagicMock()
    fake_mne.read_bem_solution.side_effect = RuntimeError("corrupt fif")
    fake_mne.make_bem_model.return_value = MagicMock()
    fallback_bem = MagicMock(name="fallback_bem")
    fake_mne.make_bem_solution.return_value = fallback_bem

    result = _load_or_make_bem_solution(fake_mne, "fsaverage", str(tmp_path))

    fake_mne.make_bem_model.assert_called_once()
    assert result is fallback_bem


def test_resolve_trans_fsaverage_returns_string():
    """_resolve_trans returns the literal string 'fsaverage' for that subject."""
    from deepsynaps_qeeg.source.forward import _resolve_trans

    trans = _resolve_trans("fsaverage", "/does/not/matter")
    assert trans == "fsaverage"


def test_resolve_trans_non_fsaverage_existing_file(tmp_path):
    """_resolve_trans returns the existing transform file path."""
    from deepsynaps_qeeg.source.forward import _resolve_trans

    bem_dir = tmp_path / "sub01" / "bem"
    bem_dir.mkdir(parents=True)
    trans_file = bem_dir / "sub01-trans.fif"
    trans_file.write_bytes(b"x")

    result = _resolve_trans("sub01", str(tmp_path))
    assert Path(result) == trans_file


def test_resolve_trans_non_fsaverage_missing_raises(tmp_path):
    """_resolve_trans raises FileNotFoundError when no transform is found."""
    from deepsynaps_qeeg.source.forward import _resolve_trans

    with pytest.raises(FileNotFoundError, match="Could not find a head"):
        _resolve_trans("sub01", str(tmp_path))


# ─── source.noise heuristics ─────────────────────────────────────────────────

def test_noise_estimate_raises_with_no_args():
    """estimate_noise_covariance raises ValueError when called with no inputs."""
    import importlib, types

    # Mock the mne import inside the function.
    fake_mne = MagicMock()
    with patch.dict(sys.modules, {"mne": fake_mne}):
        from deepsynaps_qeeg.source import noise as _noise_mod
        import importlib
        importlib.reload(_noise_mod)
        with pytest.raises(ValueError, match="Provide one of"):
            _noise_mod.estimate_noise_covariance()


def test_noise_estimate_calls_compute_covariance_with_epochs():
    """When epochs is provided, compute_covariance is invoked."""
    fake_mne = MagicMock()
    fake_cov = MagicMock(name="covariance")
    fake_mne.compute_covariance.return_value = fake_cov

    fake_epochs = MagicMock()

    with patch.dict(sys.modules, {"mne": fake_mne}):
        from deepsynaps_qeeg.source import noise as _noise_mod
        import importlib
        importlib.reload(_noise_mod)
        result = _noise_mod.estimate_noise_covariance(epochs=fake_epochs)

    assert result is fake_cov
    fake_mne.compute_covariance.assert_called_once_with(
        fake_epochs, method="auto", verbose="WARNING"
    )


def test_noise_estimate_prefers_empty_room_over_epochs():
    """Empty-room raw takes priority over epochs."""
    fake_mne = MagicMock()
    empty_room_cov = MagicMock(name="empty_room_cov")
    fake_mne.compute_raw_covariance.return_value = empty_room_cov

    fake_empty = MagicMock(name="empty_room")
    fake_epochs = MagicMock(name="epochs")

    with patch.dict(sys.modules, {"mne": fake_mne}):
        from deepsynaps_qeeg.source import noise as _noise_mod
        import importlib
        importlib.reload(_noise_mod)
        result = _noise_mod.estimate_noise_covariance(
            empty_room_raw=fake_empty, epochs=fake_epochs
        )

    assert result is empty_room_cov
    # compute_covariance (epochs path) must NOT have been called.
    fake_mne.compute_covariance.assert_not_called()


# ─── source.inverse validation ────────────────────────────────────────────────

def test_apply_inverse_bad_method_raises():
    """apply_inverse raises ValueError for an unsupported method name."""
    fake_mne = MagicMock()
    # inject mne so isinstance checks use the mock classes
    with patch.dict(sys.modules, {"mne": fake_mne}):
        from deepsynaps_qeeg.source import inverse as _inv_mod
        import importlib
        importlib.reload(_inv_mod)
        fake_inv = MagicMock()
        # Pass something that is not Evoked/Epochs/BaseRaw but method is wrong first.
        with pytest.raises(ValueError, match="Unsupported inverse method"):
            _inv_mod.apply_inverse(MagicMock(), fake_inv, method="BOGUS")


def test_apply_inverse_unsupported_type_raises():
    """apply_inverse raises TypeError for an unknown input type."""
    fake_mne = MagicMock()

    class _FakeMNE:
        class Evoked:
            pass
        class Epochs:
            pass
        class io:
            class BaseRaw:
                pass
        minimum_norm = MagicMock()

    with patch.dict(sys.modules, {"mne": _FakeMNE}):
        from deepsynaps_qeeg.source import inverse as _inv_mod
        import importlib
        importlib.reload(_inv_mod)
        with pytest.raises(TypeError, match="Unsupported type for apply_inverse"):
            _inv_mod.apply_inverse("not_mne_type", MagicMock(), method="eLORETA")
