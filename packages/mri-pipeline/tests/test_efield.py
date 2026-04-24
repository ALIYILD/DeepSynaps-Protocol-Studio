"""Tests for :mod:`deepsynaps_mri.efield` — the SimNIBS E-field wrapper.

Covers the three status paths the public API is contractually required
to surface:

* ``ok`` — the SimNIBS module imports and the forward solve runs. We
  monkeypatch ``_run_simnibs_forward`` with a fake that returns a
  pre-canned :class:`EfieldDose`.
* ``dependency_missing`` — ``_try_import_simnibs`` returns ``None``.
* ``failed`` — ``_run_simnibs_forward`` raises.

No real SimNIBS / FEM code runs. The tests should pass on the default
DeepSynaps Studio CI image (python:3.11-slim).
"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from deepsynaps_mri import efield as efield_mod
from deepsynaps_mri.schemas import EfieldDose, StimTarget


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def fake_t1(tmp_path: Path) -> Path:
    """Dummy T1 file — the status paths don't actually read it."""
    p = tmp_path / "t1.nii.gz"
    p.write_bytes(b"NOT-A-REAL-NIFTI")
    return p


@pytest.fixture
def target_mni() -> tuple[float, float, float]:
    return (-41.0, 43.0, 28.0)


# ---------------------------------------------------------------------------
# status == "dependency_missing"
# ---------------------------------------------------------------------------
def test_simulate_efield_dependency_missing(
    monkeypatch: pytest.MonkeyPatch,
    fake_t1: Path,
    target_mni: tuple[float, float, float],
) -> None:
    monkeypatch.setattr(efield_mod, "_try_import_simnibs", lambda: None)
    dose = efield_mod.simulate_efield(
        t1_path=fake_t1,
        target_mni=target_mni,
        modality="tms",
        coil="Magstim_70mm_Fig8",
        intensity_pct_rmt=120.0,
    )
    assert isinstance(dose, EfieldDose)
    assert dose.status == "dependency_missing"
    assert dose.solver == "unavailable"
    assert dose.v_per_m_at_target is None
    assert dose.peak_v_per_m is None
    assert dose.error_message and "simnibs" in dose.error_message.lower()
    assert dose.runtime_sec is not None and dose.runtime_sec >= 0


def test_optimize_coil_position_dependency_missing(
    monkeypatch: pytest.MonkeyPatch,
    fake_t1: Path,
    target_mni: tuple[float, float, float],
) -> None:
    monkeypatch.setattr(efield_mod, "_try_import_simnibs", lambda: None)
    dose = efield_mod.optimize_coil_position(
        t1_path=fake_t1, target_mni=target_mni,
    )
    assert dose.status == "dependency_missing"
    assert dose.coil_optimised is False
    assert dose.solver == "unavailable"


# ---------------------------------------------------------------------------
# status == "ok"
# ---------------------------------------------------------------------------
def test_simulate_efield_ok_via_fake_solver(
    monkeypatch: pytest.MonkeyPatch,
    fake_t1: Path,
    target_mni: tuple[float, float, float],
) -> None:
    fake_simnibs = SimpleNamespace(
        sim_struct=object(),
        run_simnibs=lambda _: None,
        mesh_io=None,
    )
    monkeypatch.setattr(efield_mod, "_try_import_simnibs", lambda: fake_simnibs)

    def fake_forward(*_args, **_kwargs) -> EfieldDose:
        return EfieldDose(
            status="ok",
            v_per_m_at_target=87.5,
            peak_v_per_m=131.2,
            focality_50pct_volume_cm3=5.3,
            iso_contour_mesh_s3="/tmp/fake.msh",
            e_field_png_s3=None,
            coil_optimised=False,
            solver="simnibs_fem",
        )

    monkeypatch.setattr(efield_mod, "_run_simnibs_forward", fake_forward)

    dose = efield_mod.simulate_efield(
        t1_path=fake_t1,
        target_mni=target_mni,
        modality="tms",
        coil="Magstim_70mm_Fig8",
        intensity_pct_rmt=120.0,
    )
    assert dose.status == "ok"
    assert dose.v_per_m_at_target == pytest.approx(87.5)
    assert dose.peak_v_per_m == pytest.approx(131.2)
    assert dose.focality_50pct_volume_cm3 == pytest.approx(5.3)
    assert dose.solver == "simnibs_fem"
    assert dose.runtime_sec is not None and dose.runtime_sec >= 0
    assert dose.iso_contour_mesh_s3 == "/tmp/fake.msh"


# ---------------------------------------------------------------------------
# status == "failed"
# ---------------------------------------------------------------------------
def test_simulate_efield_failed_when_solver_raises(
    monkeypatch: pytest.MonkeyPatch,
    fake_t1: Path,
    target_mni: tuple[float, float, float],
) -> None:
    monkeypatch.setattr(
        efield_mod, "_try_import_simnibs",
        lambda: SimpleNamespace(sim_struct=object(), run_simnibs=None, mesh_io=None),
    )

    def boom(*_args, **_kwargs):
        raise RuntimeError("charm subject directory missing")

    monkeypatch.setattr(efield_mod, "_run_simnibs_forward", boom)

    dose = efield_mod.simulate_efield(
        t1_path=fake_t1,
        target_mni=target_mni,
        modality="tms",
        coil="Magstim_70mm_Fig8",
    )
    assert dose.status == "failed"
    assert dose.solver == "unavailable"
    assert dose.error_message and "charm subject directory missing" in dose.error_message


# ---------------------------------------------------------------------------
# StimTarget round-trip — the schema-level smoke test
# ---------------------------------------------------------------------------
def test_stim_target_accepts_efield_dose() -> None:
    """Attaching an EfieldDose to a StimTarget must round-trip via JSON."""
    target = StimTarget(
        target_id="rTMS_MDD_personalised_sgACC",
        modality="rtms",
        condition="mdd",
        region_name="Left DLPFC",
        mni_xyz=(-41.0, 43.0, 28.0),
        method="sgACC_anticorrelation_personalised",
    )
    assert target.efield_dose is None

    dose = EfieldDose(
        status="ok",
        v_per_m_at_target=92.4,
        peak_v_per_m=138.1,
        focality_50pct_volume_cm3=4.6,
        solver="simnibs_fem",
    )
    target.efield_dose = dose

    payload = target.model_dump(mode="json")
    assert "efield_dose" in payload
    assert payload["efield_dose"]["status"] == "ok"
    assert payload["efield_dose"]["v_per_m_at_target"] == 92.4

    restored = StimTarget.model_validate(payload)
    assert restored.efield_dose is not None
    assert restored.efield_dose.status == "ok"


def test_stim_target_null_efield_is_default() -> None:
    """Legacy StimTargets (no efield_dose) must still validate cleanly."""
    target = StimTarget(
        target_id="rTMS_MDD_F3_Beam",
        modality="rtms",
        condition="mdd",
        region_name="Left DLPFC",
        mni_xyz=(-37.0, 26.0, 49.0),
        method="F3_Beam_projection",
    )
    payload = target.model_dump(mode="json")
    assert payload["efield_dose"] is None
    restored = StimTarget.model_validate(payload)
    assert restored.efield_dose is None
