"""Tests for :mod:`deepsynaps_mri.morphometry_reporting`."""
from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import pytest

from deepsynaps_mri.morphometry_reporting import (
    compute_asymmetry_indices,
    compute_regional_volumes,
    generate_mri_analysis_report_payload,
    summarize_morphometry,
)
from deepsynaps_mri.schemas import (
    Modality,
    MRIReport,
    NormedValue,
    PatientMeta,
    QCMetrics,
    StructuralMetrics,
)


def _minimal_aseg_stats() -> str:
    return """# Measure BrainSegNotVent, 1.500000e+06, mm^3
# Measure EstimatedTotalIntraCranialVol, 1.600000e+06, mm^3
# Table of Segment Statistics
#NRows 4
#ColHeaders Index SegId NVoxels Volume_mm3 StructName
1 17 1000 4000.0 Left-Hippocampus
2 53 1000 3800.0 Right-Hippocampus
3 18 800 3500.0 Left-Amygdala
4 54 800 3600.0 Right-Amygdala
"""


def test_compute_regional_volumes_aseg(tmp_path: Path) -> None:
    p = tmp_path / "aseg.stats"
    p.write_text(_minimal_aseg_stats(), encoding="utf-8")
    r = compute_regional_volumes(artefacts_dir=tmp_path, aseg_stats_path=p)
    assert r.ok is True
    assert r.source == "freesurfer_aseg"
    assert len(r.rows) == 4
    assert r.icv_mm3 == pytest.approx(1.6e6)
    assert r.manifest_path


def test_compute_asymmetry_and_summarize(tmp_path: Path) -> None:
    p = tmp_path / "aseg.stats"
    p.write_text(_minimal_aseg_stats(), encoding="utf-8")
    vol = compute_regional_volumes(artefacts_dir=tmp_path, aseg_stats_path=p)
    asym = compute_asymmetry_indices(vol, tmp_path, threshold_abs_pct=5.0)
    assert asym.ok is True
    assert any(i.flagged for i in asym.indices)
    summ = summarize_morphometry(
        artefacts_dir=tmp_path,
        regional_volumes=vol,
        asymmetry=asym,
    )
    assert summ.ok is True
    assert summ.n_asymmetry_pairs >= 1
    assert any("asymmetry_flagged" in f for f in summ.qc_flags)


def test_synthseg_volumes_csv(tmp_path: Path) -> None:
    csv_p = tmp_path / "volumes.csv"
    csv_p.write_text(
        "Hippocampus_L,Hippocampus_R\n4200.0,4100.0\n",
        encoding="utf-8",
    )
    r = compute_regional_volumes(artefacts_dir=tmp_path, synthseg_volumes_csv=csv_p)
    assert r.ok is True
    assert r.source == "synthseg_csv"
    assert len(r.rows) == 2


def test_generate_payload(tmp_path: Path) -> None:
    p = tmp_path / "aseg.stats"
    p.write_text(_minimal_aseg_stats(), encoding="utf-8")
    vol = compute_regional_volumes(artefacts_dir=tmp_path, aseg_stats_path=p)
    asym = compute_asymmetry_indices(vol, tmp_path, threshold_abs_pct=5.0)

    thickness_json = tmp_path / "thick.json"
    thickness_json.write_text(
        json.dumps(
            {
                "ok": True,
                "atlas": "Desikan-Killiany",
                "source": "aparc_stats",
                "regions": [
                    {
                        "region_id": "lh.bankssts",
                        "hemisphere": "lh",
                        "mean_thickness_mm": 2.3,
                        "n_vertices": 100,
                        "surface_area_mm2": None,
                    }
                ],
                "manifest_path": None,
                "code": "",
                "message": "ok",
            }
        ),
        encoding="utf-8",
    )

    payload = generate_mri_analysis_report_payload(
        artefacts_dir=tmp_path,
        patient=PatientMeta(patient_id="P1", age=55),
        modalities_present=[Modality.T1],
        qc=QCMetrics(passed=True),
        regional_volumes=vol,
        asymmetry=asym,
        regional_thickness_summary_path=thickness_json,
        segmentation_engine="fastsurfer",
        write_json=True,
    )
    assert payload.mri_report.structural is not None
    assert "hippocampus_l" in payload.mri_report.structural.subcortical_volume_mm3
    assert "lh_bankssts" in payload.mri_report.structural.cortical_thickness_mm
    assert payload.payload_json_path
    assert Path(payload.payload_json_path).exists()


def test_payload_merges_base_report(tmp_path: Path) -> None:
    p = tmp_path / "aseg.stats"
    p.write_text(_minimal_aseg_stats(), encoding="utf-8")
    vol = compute_regional_volumes(artefacts_dir=tmp_path, aseg_stats_path=p)
    base = MRIReport(
        analysis_id=uuid4(),
        patient=PatientMeta(patient_id="P2"),
        modalities_present=[Modality.T1],
        qc=QCMetrics(),
        structural=StructuralMetrics(
            cortical_thickness_mm={"existing": NormedValue(value=2.0, unit="mm")},
        ),
    )
    payload = generate_mri_analysis_report_payload(
        artefacts_dir=tmp_path,
        patient=PatientMeta(patient_id="P2", age=60),
        modalities_present=[Modality.T1],
        qc=QCMetrics(passed=True, notes=["x"]),
        regional_volumes=vol,
        base_report=base,
        write_json=False,
    )
    assert "existing" in payload.mri_report.structural.cortical_thickness_mm
    assert "hippocampus_l" in payload.mri_report.structural.subcortical_volume_mm3
