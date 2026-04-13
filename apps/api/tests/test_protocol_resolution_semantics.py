"""Regression: no_compatible_device (no protocol rows) vs invalid_device (rows exist, unknown device)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def clinician_headers(auth_headers: dict[str, dict[str, str]]) -> dict[str, str]:
    return auth_headers["clinician"]


def test_no_protocol_rows_returns_no_compatible_device_even_if_device_string_provided(
    client: TestClient, clinician_headers: dict[str, str]
) -> None:
    """Case A: zero candidates from protocols.csv → 422 no_compatible_device before device validation."""
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=clinician_headers,
        json={
            "condition": "Major Depressive Disorder (MDD)",
            "symptom_cluster": "General",
            "modality": "tACS (Transcranial Alternating Current Stimulation)",
            "device": "TotallyUnknownDeviceXYZ",
            "setting": "Clinic",
            "evidence_threshold": "Guideline",
            "off_label": False,
        },
    )
    assert r.status_code == 422
    assert r.json()["code"] == "no_compatible_device"


def test_protocol_rows_exist_unknown_device_returns_invalid_device(
    client: TestClient, clinician_headers: dict[str, str]
) -> None:
    """Case B: candidates exist → unknown device name hits invalid_device."""
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=clinician_headers,
        json={
            "condition": "Major Depressive Disorder (MDD)",
            "symptom_cluster": "General",
            "modality": "rTMS (Repetitive Transcranial Magnetic Stimulation)",
            "device": "TotallyUnknownDeviceXYZ",
            "setting": "Clinic",
            "evidence_threshold": "Guideline",
            "off_label": False,
        },
    )
    assert r.status_code == 422
    assert r.json()["code"] == "invalid_device"


def test_registry_backed_device_succeeds_with_canonical_name_in_rationale(
    client: TestClient, clinician_headers: dict[str, str]
) -> None:
    """Case C/D: success path; rationale uses registry Device_Name (not only client alias)."""
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
    assert "Neurolith" in body["rationale"]
    assert body["device_resolution"]["resolution_method"] == "user_selected_validated"


def test_optional_personalization_hints_are_echoed_in_metadata_not_used_for_selection(
    client: TestClient, clinician_headers: dict[str, str]
) -> None:
    """Hints are recorded; tDCS MDD has a single eligible protocol so ranking factors stay empty."""
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
            "qeeg_summary": "alpha asymmetry noted",
            "phenotype_tags": ["anhedonic"],
            "comorbidities": ["anxiety"],
            "prior_response": "partial SSRI",
            "prior_failed_modalities": ["rTMS"],
        },
    )
    assert r.status_code == 200
    meta = r.json()["personalization_inputs_used"]
    assert "qeeg_summary" in meta
    assert "phenotype_tags" in meta
    assert r.json()["ranking_factors_applied"] == []
