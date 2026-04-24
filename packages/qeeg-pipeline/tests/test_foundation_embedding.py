"""Tests for :mod:`deepsynaps_qeeg.ml.foundation_embedding`.

These tests concentrate on the *stub* path. The heavy path needs torch,
einops, and a local LaBraM checkpoint — all of which
:func:`pytest.importorskip` guards in the single heavy-path test below.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest


def _mock_epochs(ch_names: list[str], sfreq: float = 250.0, n_epochs: int = 30) -> Any:
    """Minimal duck-typed Epochs stand-in for stub-path tests.

    Parameters
    ----------
    ch_names : list of str
    sfreq : float
    n_epochs : int

    Returns
    -------
    SimpleNamespace
    """

    class _Info(dict):  # type: ignore[type-arg]
        pass

    info = _Info({"ch_names": list(ch_names), "sfreq": float(sfreq)})
    ns = SimpleNamespace(info=info)
    # _hash_epochs_info does ``getattr(epochs, "__len__", lambda: 0)()``
    # so a callable attribute on the instance is all we need.
    ns.__len__ = lambda _self=ns, _n=n_epochs: _n  # type: ignore[attr-defined]
    return ns


def test_stub_path_returns_200_dim_and_is_stub_flag() -> None:
    """When HAS_LABRAM is False, we must return a 200-d stub."""
    from deepsynaps_qeeg.ml import foundation_embedding as fe

    epochs = _mock_epochs(["Fz", "Cz", "Pz"])
    out = fe.compute_embedding(epochs, deterministic_seed=123)

    assert out["dim"] == 200
    assert out["is_stub"] is True or fe.HAS_LABRAM is True
    assert isinstance(out["embedding"], list)
    assert len(out["embedding"]) == 200
    for v in out["embedding"]:
        assert isinstance(v, float)


def test_stub_is_deterministic_same_seed_same_vector() -> None:
    """Same ``deterministic_seed`` → byte-identical embedding vector."""
    from deepsynaps_qeeg.ml import foundation_embedding as fe

    epochs = _mock_epochs(["Fz", "Cz", "Pz"])
    a = fe.compute_embedding(epochs, deterministic_seed=42)
    b = fe.compute_embedding(epochs, deterministic_seed=42)
    assert a["embedding"] == b["embedding"]


def test_stub_different_seed_produces_different_vector() -> None:
    """Different seeds → different stub vectors (not equal)."""
    from deepsynaps_qeeg.ml import foundation_embedding as fe

    epochs = _mock_epochs(["Fz", "Cz", "Pz"])
    a = fe.compute_embedding(epochs, deterministic_seed=1)
    b = fe.compute_embedding(epochs, deterministic_seed=2)
    assert a["embedding"] != b["embedding"]


def test_stub_derives_seed_from_epochs_when_none_provided() -> None:
    """When no seed is supplied, the stub derives one from epochs.info."""
    from deepsynaps_qeeg.ml import foundation_embedding as fe

    e1 = _mock_epochs(["Fz", "Cz"])
    e2 = _mock_epochs(["Fz", "Cz"])
    a = fe.compute_embedding(e1)
    b = fe.compute_embedding(e2)
    assert a["embedding"] == b["embedding"]

    e3 = _mock_epochs(["Fz", "Cz", "Pz"])
    c = fe.compute_embedding(e3)
    assert a["embedding"] != c["embedding"]


def test_download_guard_raises_without_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
    """Download guard must refuse when the opt-in env var is unset."""
    from deepsynaps_qeeg.ml import foundation_embedding as fe

    monkeypatch.delenv("DEEPSYNAPS_ALLOW_MODEL_DOWNLOAD", raising=False)
    with pytest.raises(RuntimeError):
        fe._download_checkpoint(tmp_path)


def test_download_guard_passes_with_env_but_does_not_fetch(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    """With env=1 the guard returns a path but does NOT download."""
    from deepsynaps_qeeg.ml import foundation_embedding as fe

    monkeypatch.setenv("DEEPSYNAPS_ALLOW_MODEL_DOWNLOAD", "1")
    path = fe._download_checkpoint(tmp_path)
    assert not path.exists(), "scaffold should not actually create the checkpoint file"


def test_heavy_path_importorskip() -> None:
    """Skip when heavy deps are absent; otherwise just sanity-import."""
    pytest.importorskip("torch")
    pytest.importorskip("einops")

    from deepsynaps_qeeg.ml import foundation_embedding as fe

    # Without a checkpoint file HAS_LABRAM will still be False — that's
    # fine; we only assert the module loads cleanly.
    assert fe.EMBEDDING_DIM == 200
    assert hasattr(fe, "compute_embedding")
