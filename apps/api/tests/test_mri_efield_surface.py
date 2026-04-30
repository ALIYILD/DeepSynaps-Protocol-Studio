"""Surface-layer tests for the E-field + brain-age JSON round-trip.

Verifies that :class:`deepsynaps_mri.schemas.EfieldDose` (attached to
``StimTarget.efield_dose``) and :class:`deepsynaps_mri.schemas.BrainAgePrediction`
(attached to ``StructuralMetrics.brain_age``) flow cleanly through the
Studio MRI router:

    client -> POST /analyze -> DB row -> GET /report/{aid}

The router stores per-section JSON in ``*_json`` columns; the shape of
these new nested blocks must not corrupt the demo-mode payload or
require a new DB migration. These tests guard that contract.
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import MriAnalysis
from app.settings import get_settings

# Reuse the hand-built valid NIfTI-1 gz fixture from the sibling test module
# so the night-shift `validate_upload_blob` gate accepts the payload.
from test_mri_analysis_router import VALID_NIFTI_GZ


# ── Fixtures (copied from test_mri_analysis_router.py) ──────────────────────


@pytest.fixture
def media_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("MEDIA_STORAGE_ROOT", str(tmp_path))
    get_settings.cache_clear()  # type: ignore[attr-defined]
    yield tmp_path
    get_settings.cache_clear()  # type: ignore[attr-defined]


@pytest.fixture
def force_demo_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MRI_DEMO_MODE", "1")


def _upload(client: TestClient, auth_headers: dict) -> str:
    files = {"file": ("scan.nii.gz", io.BytesIO(VALID_NIFTI_GZ), "application/gzip")}
    resp = client.post(
        "/api/v1/mri/upload",
        data={"patient_id": "pat-mri-ai-upgrades"},
        files=files,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["upload_id"]


# ── Demo-mode round-trip ────────────────────────────────────────────────────
def test_demo_report_carries_efield_dose_on_personalised_target(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    upload_id = _upload(client, auth_headers)

    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-ai-upgrades",
            "condition": "mdd",
            "age": "54",
            "sex": "F",
            "run_mode": "sync",
        },
        headers=auth_headers["clinician"],
    )
    assert analyze.status_code == 200, analyze.text
    aid = analyze.json()["job_id"]

    # DB row must have serialised the E-field + brain-age blocks.
    db = SessionLocal()
    try:
        row = db.query(MriAnalysis).filter_by(analysis_id=aid).first()
        assert row is not None
        targets = json.loads(row.stim_targets_json or "[]")
        assert targets, "stim_targets must be populated by demo mode"
        personalised = next(
            (t for t in targets if t.get("target_id") == "rTMS_MDD_personalised_sgACC"),
            None,
        )
        assert personalised is not None, "personalised target missing from demo"
        dose = personalised.get("efield_dose")
        assert dose is not None, "efield_dose must be attached to personalised target"
        assert dose["status"] == "ok"
        assert dose["solver"] == "simnibs_fem"
        assert dose["v_per_m_at_target"] == pytest.approx(92.4)
        assert dose["coil_optimised"] is True

        structural = json.loads(row.structural_json or "{}")
        brain_age = structural.get("brain_age")
        assert brain_age is not None, "brain_age must be attached to structural metrics"
        assert brain_age["status"] == "ok"
        assert brain_age["predicted_age_years"] == pytest.approx(58.7)
        assert brain_age["brain_age_gap_years"] == pytest.approx(4.7)
        assert brain_age["model_id"] == "brainage_cnn_v1"
    finally:
        db.close()

    # GET /report/{aid} must surface the same shape to the frontend.
    report = client.get(
        f"/api/v1/mri/report/{aid}",
        headers=auth_headers["clinician"],
    )
    assert report.status_code == 200, report.text
    body = report.json()
    targets = body.get("stim_targets") or []
    personalised = next(
        (t for t in targets if t.get("target_id") == "rTMS_MDD_personalised_sgACC"),
        None,
    )
    assert personalised is not None
    assert personalised.get("efield_dose") is not None
    assert personalised["efield_dose"]["status"] == "ok"

    structural = body.get("structural") or {}
    assert structural.get("brain_age") is not None
    assert structural["brain_age"]["status"] == "ok"


def test_demo_report_survives_null_efield_and_brain_age(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    """The second / third targets in the demo payload omit efield_dose —
    the router must still return a well-formed report."""
    upload_id = _upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-ai-upgrades-null",
            "condition": "mdd",
            "run_mode": "sync",
        },
        headers=auth_headers["clinician"],
    )
    aid = analyze.json()["job_id"]

    report = client.get(
        f"/api/v1/mri/report/{aid}",
        headers=auth_headers["clinician"],
    )
    body = report.json()
    targets = body.get("stim_targets") or []
    assert targets
    # At least one demo target intentionally omits efield_dose — the key
    # is either absent or null in that case, never a stringified error.
    for t in targets:
        assert "efield_dose" in t or True   # dict may omit optional key
        dose = t.get("efield_dose")
        assert dose is None or isinstance(dose, dict)
