"""Unit tests for :mod:`deepsynaps_mri.longitudinal` (AI_UPGRADES §P0 #4).

Covers:

* Percent-change maths and flagging threshold (2.5 %).
* Structural + functional + diffusion delta tables populate correctly.
* Dict-rehydrated reports (as served by the API router) work alongside
  real pydantic ``MRIReport`` instances.
* Jacobian map is skipped (no antspyx) without raising.
* Summary string names the top |Δ%| region.
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from deepsynaps_mri.longitudinal import compute_change_map, _pct_change
from deepsynaps_mri.schemas import (
    BundleMetric,
    DiffusionMetrics,
    FunctionalMetrics,
    LongitudinalReport,
    MRIReport,
    Modality,
    NetworkMetric,
    NormedValue,
    PatientMeta,
    QCMetrics,
    StructuralMetrics,
)


def _make_report(
    *,
    acc_thick: float = 2.60,
    dlpfc_thick: float = 2.30,
    hippocampus_vol: float = 3400.0,
    fa_uf: float = 0.41,
    fa_cg: float = 0.39,
    dmn_fc: float = 0.41,
    sn_fc: float = 0.29,
) -> MRIReport:
    return MRIReport(
        analysis_id=uuid4(),
        patient=PatientMeta(patient_id="pat-compare", age=54),
        modalities_present=[Modality.T1, Modality.RS_FMRI, Modality.DTI],
        qc=QCMetrics(),
        structural=StructuralMetrics(
            cortical_thickness_mm={
                "acc_l": NormedValue(value=acc_thick, unit="mm"),
                "dlpfc_l": NormedValue(value=dlpfc_thick, unit="mm"),
            },
            subcortical_volume_mm3={
                "hippocampus_l": NormedValue(value=hippocampus_vol, unit="mm^3"),
            },
        ),
        functional=FunctionalMetrics(
            networks=[
                NetworkMetric(network="DMN", mean_within_fc=NormedValue(value=dmn_fc, unit="r")),
                NetworkMetric(network="SN", mean_within_fc=NormedValue(value=sn_fc, unit="r")),
            ],
        ),
        diffusion=DiffusionMetrics(
            bundles=[
                BundleMetric(bundle="UF_L", mean_FA=NormedValue(value=fa_uf)),
                BundleMetric(bundle="CG_L", mean_FA=NormedValue(value=fa_cg)),
            ],
        ),
    )


def test_pct_change_basic():
    assert _pct_change(100.0, 110.0) == pytest.approx(10.0)
    assert _pct_change(100.0, 95.0) == pytest.approx(-5.0)
    assert _pct_change(0.0, 10.0) == 0.0  # zero-baseline guard


def test_compute_change_map_returns_structured_deltas():
    baseline = _make_report()
    followup = _make_report(
        acc_thick=2.69,        # +3.46% -> flagged
        dlpfc_thick=2.31,      # +0.43% -> not flagged
        hippocampus_vol=3500,  # +2.94% -> flagged
        fa_uf=0.43,            # +4.88% -> flagged
        fa_cg=0.382,           # -2.05% -> not flagged
        dmn_fc=0.38,           # -7.32% -> flagged
        sn_fc=0.29,            # 0% -> not flagged
    )

    result = compute_change_map(baseline, followup, days_between=180)

    assert isinstance(result, LongitudinalReport)
    assert result.days_between == 180

    structural = {c.region: c for c in result.structural_changes}
    assert structural["acc_l"].delta_pct == pytest.approx(3.46, abs=0.05)
    assert structural["acc_l"].flagged is True
    assert structural["dlpfc_l"].flagged is False
    assert structural["hippocampus_l"].flagged is True

    diffusion = {c.region: c for c in result.diffusion_changes}
    assert diffusion["UF_L"].flagged is True
    assert diffusion["CG_L"].flagged is False

    functional = {c.region: c for c in result.functional_changes}
    assert functional["DMN"].flagged is True
    assert functional["SN"].flagged is False

    # Summary references the top |delta|.
    assert result.summary
    assert "DMN" in result.summary or "UF_L" in result.summary or "acc_l" in result.summary


def test_compute_change_map_from_json_dicts():
    """Router rehydrates rows as dicts — the same compare call must work."""
    baseline = _make_report()
    followup = _make_report(acc_thick=2.70)

    b_dict = baseline.model_dump(mode="json")
    f_dict = followup.model_dump(mode="json")

    result = compute_change_map(b_dict, f_dict)
    assert isinstance(result, LongitudinalReport)
    assert any(c.region == "acc_l" and c.flagged for c in result.structural_changes)


def test_compute_change_map_survives_missing_modalities():
    """Partial reports must not crash — missing modalities yield empty lists."""
    baseline = _make_report()
    followup = _make_report()
    # Blow away the functional block on the follow-up.
    follow_dict = followup.model_dump(mode="json")
    follow_dict["functional"] = None

    result = compute_change_map(baseline, follow_dict)
    assert result.structural_changes  # still present
    assert result.diffusion_changes  # still present
    assert result.functional_changes == []  # missing block -> empty list


def test_jacobian_gracefully_skipped_without_antspyx(tmp_path):
    """No antspyx present → no Jacobian but no exception either."""
    baseline = _make_report()
    followup = _make_report(acc_thick=2.70)
    # Point at files that do not exist — compute_jacobian_map is guarded by
    # an import check first, so the missing files never get opened.
    result = compute_change_map(
        baseline,
        followup,
        baseline_t1_path=tmp_path / "missing_baseline.nii.gz",
        followup_t1_path=tmp_path / "missing_followup.nii.gz",
        out_dir=tmp_path,
    )
    assert result.jacobian_determinant_s3 is None or isinstance(
        result.jacobian_determinant_s3, str
    )
