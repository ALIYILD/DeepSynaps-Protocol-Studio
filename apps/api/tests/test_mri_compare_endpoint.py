"""Integration tests for the MRI longitudinal-compare endpoint.

Covers:

* ``GET /api/v1/mri/compare/{baseline_id}/{followup_id}`` — round-trips
  two mocked ``MriAnalysis`` rows and returns the structured
  ``LongitudinalReport`` shape.
* Patient-mismatch guard → 422.
* Missing analysis → 404.
* ``GET /api/v1/mri/patients/{patient_id}/analyses`` — helper endpoint
  used by the Compare modal to enumerate completed analyses.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import MriAnalysis


def _make_report_json(
    analysis_id: str,
    patient_id: str,
    *,
    acc_thick: float,
    dlpfc_thick: float,
    hippocampus_vol: float,
    fa_cg: float,
    dmn_fc: float,
) -> dict:
    """Build a minimally-valid MRIReport-shaped dict for round-trip tests."""
    return {
        "analysis_id": analysis_id,
        "patient": {"patient_id": patient_id, "age": 54, "sex": "F"},
        "modalities_present": ["T1", "rs_fMRI", "DTI"],
        "qc": {"passed": True, "notes": []},
        "structural": {
            "atlas": "Desikan-Killiany",
            "cortical_thickness_mm": {
                "acc_l": {"value": acc_thick, "unit": "mm"},
                "dlpfc_l": {"value": dlpfc_thick, "unit": "mm"},
            },
            "subcortical_volume_mm3": {
                "hippocampus_l": {"value": hippocampus_vol, "unit": "mm^3"},
            },
        },
        "functional": {
            "networks": [
                {"network": "DMN", "mean_within_fc": {"value": dmn_fc, "unit": "r"}},
                {"network": "SN", "mean_within_fc": {"value": 0.29, "unit": "r"}},
            ],
            "atlas": "DiFuMo-256",
        },
        "diffusion": {
            "bundles": [
                {"bundle": "UF_L", "mean_FA": {"value": 0.41}},
                {"bundle": "CG_L", "mean_FA": {"value": fa_cg}},
            ],
        },
        "stim_targets": [],
        "medrag_query": {"findings": [], "conditions": ["mdd"]},
        "overlays": {},
    }


def _insert_analysis(
    analysis_id: str,
    patient_id: str,
    created_at: datetime,
    *,
    condition: str = "mdd",
    **report_kwargs,
) -> None:
    report = _make_report_json(analysis_id, patient_id, **report_kwargs)
    db = SessionLocal()
    try:
        row = MriAnalysis(
            analysis_id=analysis_id,
            patient_id=patient_id,
            created_at=created_at,
            job_id=analysis_id,
            state="SUCCESS",
            condition=condition,
            age=54,
            sex="F",
            modalities_present_json=json.dumps(report["modalities_present"]),
            qc_json=json.dumps(report["qc"]),
            structural_json=json.dumps(report["structural"]),
            functional_json=json.dumps(report["functional"]),
            diffusion_json=json.dumps(report["diffusion"]),
            stim_targets_json=json.dumps(report["stim_targets"]),
            medrag_query_json=json.dumps(report["medrag_query"]),
            overlays_json=json.dumps(report["overlays"]),
        )
        db.add(row)
        db.commit()
    finally:
        db.close()


def test_compare_endpoint_returns_longitudinal_shape(
    client: TestClient,
    auth_headers: dict,
) -> None:
    now = datetime.now(timezone.utc)
    _insert_analysis(
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "pat-compare-1",
        now - timedelta(days=180),
        acc_thick=2.60,
        dlpfc_thick=2.30,
        hippocampus_vol=3400.0,
        fa_cg=0.39,
        dmn_fc=0.41,
    )
    _insert_analysis(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "pat-compare-1",
        now,
        acc_thick=2.70,        # +3.85% -> flagged
        dlpfc_thick=2.31,      # +0.43% -> not flagged
        hippocampus_vol=3500,  # +2.94% -> flagged
        fa_cg=0.40,            # +2.56% -> flagged
        dmn_fc=0.38,           # -7.32% -> flagged
    )

    resp = client.get(
        "/api/v1/mri/compare/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/"
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["baseline_analysis_id"].startswith("aaaa") or body[
        "baseline_analysis_id"
    ] == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    assert isinstance(body["structural_changes"], list)
    assert isinstance(body["functional_changes"], list)
    assert isinstance(body["diffusion_changes"], list)

    # At least the acc_l row should be flagged.
    structural = {c["region"]: c for c in body["structural_changes"]}
    assert "acc_l" in structural
    assert structural["acc_l"]["flagged"] is True
    assert structural["acc_l"]["metric"] == "cortical_thickness_mm"

    # Days between should be approximately 180.
    assert body["days_between"] == 180 or body["days_between"] == 179
    # Summary is present and non-empty.
    assert body["summary"]


def test_compare_endpoint_rejects_cross_patient(
    client: TestClient,
    auth_headers: dict,
) -> None:
    now = datetime.now(timezone.utc)
    _insert_analysis(
        "cccccccc-cccc-cccc-cccc-cccccccccccc",
        "patient-A",
        now - timedelta(days=30),
        acc_thick=2.60,
        dlpfc_thick=2.30,
        hippocampus_vol=3400.0,
        fa_cg=0.39,
        dmn_fc=0.41,
    )
    _insert_analysis(
        "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "patient-B",
        now,
        acc_thick=2.60,
        dlpfc_thick=2.30,
        hippocampus_vol=3400.0,
        fa_cg=0.39,
        dmn_fc=0.41,
    )
    resp = client.get(
        "/api/v1/mri/compare/cccccccc-cccc-cccc-cccc-cccccccccccc/"
        "dddddddd-dddd-dddd-dddd-dddddddddddd",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "patient_mismatch"


def test_compare_endpoint_404_on_missing_analysis(
    client: TestClient,
    auth_headers: dict,
) -> None:
    resp = client.get(
        "/api/v1/mri/compare/ghost-1/ghost-2",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404


def test_compare_endpoint_rejects_guest(
    client: TestClient,
    auth_headers: dict,
) -> None:
    resp = client.get(
        "/api/v1/mri/compare/any-1/any-2",
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403


def test_list_patient_analyses_returns_sorted(
    client: TestClient,
    auth_headers: dict,
) -> None:
    now = datetime.now(timezone.utc)
    _insert_analysis(
        "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        "pat-list-1",
        now - timedelta(days=60),
        acc_thick=2.60,
        dlpfc_thick=2.30,
        hippocampus_vol=3400.0,
        fa_cg=0.39,
        dmn_fc=0.41,
    )
    _insert_analysis(
        "ffffffff-ffff-ffff-ffff-ffffffffffff",
        "pat-list-1",
        now,
        acc_thick=2.65,
        dlpfc_thick=2.32,
        hippocampus_vol=3450.0,
        fa_cg=0.40,
        dmn_fc=0.40,
    )

    resp = client.get(
        "/api/v1/mri/patients/pat-list-1/analyses",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["patient_id"] == "pat-list-1"
    assert len(body["analyses"]) == 2
    # Newest first.
    ids = [a["analysis_id"] for a in body["analyses"]]
    assert ids[0].startswith("ffff")
    assert all(a["state"] == "SUCCESS" for a in body["analyses"])
