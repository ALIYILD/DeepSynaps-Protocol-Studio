"""Tests for :mod:`deepsynaps_mri.models.brain_age`.

Covers the three status paths the public API surfaces:

* ``ok`` — monkeypatched loader + forward pass; verifies
  ``brain_age_gap_years = predicted - chronological``.
* ``dependency_missing`` — ``_try_import_torch`` returns ``None``.
* ``failed`` — the loader raises an exception.

Also checks the StructuralMetrics schema round-trips a BrainAgePrediction
block through ``model_dump(mode='json')`` unchanged.
"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from deepsynaps_mri.models import brain_age as ba_mod
from deepsynaps_mri.schemas import BrainAgePrediction, StructuralMetrics


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def fake_t1(tmp_path: Path) -> Path:
    p = tmp_path / "t1_mni.nii.gz"
    p.write_bytes(b"NOT-A-REAL-NIFTI")
    return p


# ---------------------------------------------------------------------------
# status == "dependency_missing"
# ---------------------------------------------------------------------------
def test_predict_brain_age_dep_missing_when_torch_absent(
    monkeypatch: pytest.MonkeyPatch, fake_t1: Path,
) -> None:
    monkeypatch.setattr(ba_mod, "_try_import_torch", lambda: None)
    result = ba_mod.predict_brain_age(
        t1_preprocessed_path=fake_t1,
        chronological_age=54.0,
    )
    assert isinstance(result, BrainAgePrediction)
    assert result.status == "dependency_missing"
    assert result.predicted_age_years is None
    assert result.brain_age_gap_years is None
    # Chronological age must still pass through.
    assert result.chronological_age_years == 54.0
    assert result.model_id == "brainage_cnn_v1"
    assert result.mae_years_reference == pytest.approx(3.30)
    assert result.error_message and "torch" in result.error_message.lower()


def test_predict_brain_age_dep_missing_when_nibabel_absent(
    monkeypatch: pytest.MonkeyPatch, fake_t1: Path,
) -> None:
    monkeypatch.setattr(
        ba_mod, "_try_import_torch",
        lambda: SimpleNamespace(no_grad=lambda: _DummyContext()),
    )
    monkeypatch.setattr(ba_mod, "_try_import_nibabel", lambda: None)
    result = ba_mod.predict_brain_age(fake_t1, chronological_age=50.0)
    assert result.status == "dependency_missing"
    assert "nibabel" in (result.error_message or "").lower()


# ---------------------------------------------------------------------------
# status == "ok"
# ---------------------------------------------------------------------------
class _DummyContext:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_predict_brain_age_ok_with_fake_model(
    monkeypatch: pytest.MonkeyPatch, fake_t1: Path,
) -> None:
    chrono = 54.0
    predicted = 58.7

    fake_torch = SimpleNamespace(
        no_grad=lambda: _DummyContext(),
        from_numpy=lambda arr: SimpleNamespace(float=lambda: arr),
    )
    monkeypatch.setattr(ba_mod, "_try_import_torch", lambda: fake_torch)

    fake_nib = SimpleNamespace(load=lambda p: SimpleNamespace(
        get_fdata=lambda: __import__("numpy").ones((4, 4, 4), dtype="float32"),
    ))
    monkeypatch.setattr(ba_mod, "_try_import_nibabel", lambda: fake_nib)

    class _FakeModel:
        def __call__(self, _x):
            return [predicted, 0.18]  # [predicted_age, cdr_estimate]

    monkeypatch.setattr(
        ba_mod, "_load_model",
        lambda _torch, _weights: _FakeModel(),
    )

    result = ba_mod.predict_brain_age(fake_t1, chronological_age=chrono)
    assert result.status == "ok"
    assert result.predicted_age_years == pytest.approx(predicted)
    assert result.chronological_age_years == pytest.approx(chrono)
    assert result.brain_age_gap_years == pytest.approx(predicted - chrono)
    assert result.cognition_cdr_estimate == pytest.approx(0.18)
    assert result.model_id == "brainage_cnn_v1"
    assert result.gap_zscore is not None
    assert result.runtime_sec is not None and result.runtime_sec >= 0


def test_predict_brain_age_ok_without_chrono(
    monkeypatch: pytest.MonkeyPatch, fake_t1: Path,
) -> None:
    """Chronological age is optional — gap should be None when absent."""
    fake_torch = SimpleNamespace(
        no_grad=lambda: _DummyContext(),
        from_numpy=lambda arr: SimpleNamespace(float=lambda: arr),
    )
    monkeypatch.setattr(ba_mod, "_try_import_torch", lambda: fake_torch)
    monkeypatch.setattr(
        ba_mod, "_try_import_nibabel",
        lambda: SimpleNamespace(load=lambda p: SimpleNamespace(
            get_fdata=lambda: __import__("numpy").zeros((4, 4, 4), dtype="float32"),
        )),
    )
    monkeypatch.setattr(
        ba_mod, "_load_model",
        lambda _torch, _weights: lambda _x: [60.0, 0.0],
    )
    result = ba_mod.predict_brain_age(fake_t1, chronological_age=None)
    assert result.status == "ok"
    assert result.predicted_age_years == pytest.approx(60.0)
    assert result.chronological_age_years is None
    assert result.brain_age_gap_years is None


# ---------------------------------------------------------------------------
# status == "failed"
# ---------------------------------------------------------------------------
def test_predict_brain_age_failed_when_loader_raises(
    monkeypatch: pytest.MonkeyPatch, fake_t1: Path,
) -> None:
    fake_torch = SimpleNamespace(
        no_grad=lambda: _DummyContext(),
        from_numpy=lambda arr: SimpleNamespace(float=lambda: arr),
    )
    monkeypatch.setattr(ba_mod, "_try_import_torch", lambda: fake_torch)

    def _load_raises(_p: str):
        raise RuntimeError("malformed nifti header")

    monkeypatch.setattr(
        ba_mod, "_try_import_nibabel",
        lambda: SimpleNamespace(load=_load_raises),
    )
    # Model loader returns a truthy fake — we want the failure to happen
    # *inside* _load_t1_tensor, not in _load_model.
    monkeypatch.setattr(
        ba_mod, "_load_model",
        lambda _torch, _weights: lambda _x: [60.0, 0.0],
    )

    result = ba_mod.predict_brain_age(fake_t1, chronological_age=40.0)
    assert result.status == "failed"
    assert "malformed nifti header" in (result.error_message or "")


def test_predict_brain_age_failed_when_t1_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    fake_torch = SimpleNamespace(no_grad=lambda: _DummyContext())
    monkeypatch.setattr(ba_mod, "_try_import_torch", lambda: fake_torch)
    monkeypatch.setattr(ba_mod, "_try_import_nibabel", lambda: SimpleNamespace())

    result = ba_mod.predict_brain_age(
        t1_preprocessed_path=tmp_path / "missing.nii.gz",
        chronological_age=30.0,
    )
    assert result.status == "failed"
    assert "not found" in (result.error_message or "").lower()


# ---------------------------------------------------------------------------
# Schema round-trip
# ---------------------------------------------------------------------------
def test_structural_metrics_round_trips_brain_age() -> None:
    metrics = StructuralMetrics(
        brain_age=BrainAgePrediction(
            status="ok",
            predicted_age_years=58.7,
            chronological_age_years=54.0,
            brain_age_gap_years=4.7,
            gap_zscore=1.42,
            cognition_cdr_estimate=0.18,
        ),
    )
    payload = metrics.model_dump(mode="json")
    assert payload["brain_age"]["status"] == "ok"
    assert payload["brain_age"]["predicted_age_years"] == 58.7

    restored = StructuralMetrics.model_validate(payload)
    assert restored.brain_age is not None
    assert restored.brain_age.brain_age_gap_years == pytest.approx(4.7)


def test_structural_metrics_without_brain_age_is_valid() -> None:
    metrics = StructuralMetrics()
    payload = metrics.model_dump(mode="json")
    assert payload["brain_age"] is None
    restored = StructuralMetrics.model_validate(payload)
    assert restored.brain_age is None
