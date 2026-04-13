"""Protocol draft device resolution — registry-backed deterministic behavior."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def clinician_headers(auth_headers: dict[str, dict[str, str]]) -> dict[str, str]:
    return auth_headers["clinician"]


def test_device_provided_valid_returns_200_with_resolution_metadata(
    client: TestClient, clinician_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=clinician_headers,
        json={
            "condition": "Parkinson's disease",
            "symptom_cluster": "Motor symptoms",
            "modality": "TPS",
            "device": "NEUROLITH",
            "setting": "Clinic",
            "evidence_threshold": "Systematic Review",
            "off_label": False,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["device_resolution"]["resolution_method"] == "user_selected_validated"
    assert body["device_resolution"]["resolved_device"]
    assert body["device_resolution"]["clinical_evidence_snapshot_id"]
    assert "safety_engine_governance" in body["device_resolution"]["safety_checks_applied"]


def test_device_provided_unknown_name_returns_invalid_device(
    client: TestClient, clinician_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=clinician_headers,
        json={
            "condition": "Parkinson's disease",
            "symptom_cluster": "Motor symptoms",
            "modality": "TPS",
            "device": "LumaBand Home",
            "setting": "Clinic",
            "evidence_threshold": "Guideline",
            "off_label": False,
        },
    )
    assert r.status_code == 422
    assert r.json()["code"] == "invalid_device"


def test_device_missing_single_candidate_auto_resolves_tdcs_mdd(
    client: TestClient, clinician_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=clinician_headers,
        json={
            "condition": "Major Depressive Disorder (MDD)",
            "symptom_cluster": "General",
            "modality": "tDCS (Transcranial Direct Current Stimulation)",
            "device": "",
            "setting": "Clinic",
            "evidence_threshold": "Systematic Review",
            "off_label": False,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["device_resolution"]["resolution_method"] == "auto_resolved"
    assert "Flow" in body["device_resolution"]["resolved_device"]


def test_device_missing_multiple_candidates_returns_409(
    client: TestClient, clinician_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=clinician_headers,
        json={
            "condition": "Major Depressive Disorder (MDD)",
            "symptom_cluster": "General",
            "modality": "rTMS (Repetitive Transcranial Magnetic Stimulation)",
            "device": "",
            "setting": "Clinic",
            "evidence_threshold": "Guideline",
            "off_label": False,
        },
    )
    assert r.status_code == 409
    err = r.json()
    assert err["code"] == "device_candidates_required"
    assert err["details"]["candidate_devices"]


def test_no_protocol_rows_for_condition_modality_returns_no_compatible_device(
    client: TestClient, clinician_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=clinician_headers,
        json={
            "condition": "Major Depressive Disorder (MDD)",
            "symptom_cluster": "General",
            "modality": "tACS (Transcranial Alternating Current Stimulation)",
            "device": "",
            "setting": "Clinic",
            "evidence_threshold": "Guideline",
            "off_label": False,
        },
    )
    assert r.status_code == 422
    assert r.json()["code"] == "no_compatible_device"

