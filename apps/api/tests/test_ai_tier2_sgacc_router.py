"""Tests for ``app.routers.ai_tier2_sgacc_router``.

Exercises the sgACC TMS-targeting stub: health reports stub mode, the
``/target`` endpoint is gated on clinician-or-above, schema validation
catches missing required fields, every response carries the canonical
disclaimer, and both endpoints register in the OpenAPI schema.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier2_sgacc import SGACC_DISCLAIMER


def test_sgacc_health_reports_stub_mode(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.get(
        "/api/v1/ai/sgacc/health", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["status"] == "stub"
    assert body["reference_map_loaded"] is False
    assert body["model_loaded"] is False


def test_sgacc_target_requires_clinician(
    client: TestClient, auth_headers: dict
) -> None:
    payload = {
        "patient_id": "pat-001",
        "fmri_volume_uri": "s3://bucket/sub-001/rest.nii.gz",
    }
    for role in ("guest", "patient"):
        resp = client.post(
            "/api/v1/ai/sgacc/target",
            json=payload,
            headers=auth_headers[role],
        )
        assert resp.status_code == 403, f"role={role} got {resp.status_code}"


def test_sgacc_target_returns_stub_envelope(
    client: TestClient, auth_headers: dict
) -> None:
    payload = {
        "patient_id": "pat-001",
        "fmri_volume_uri": "s3://bucket/sub-001/rest.nii.gz",
    }
    resp = client.post(
        "/api/v1/ai/sgacc/target",
        json=payload,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["status"] == "stub"
    assert body["patient_id"] == "pat-001"
    assert body["recommended_coil_mni"] is None
    assert body["predicted_response_probability"] is None
    assert body["predictor_correlation_r"] is None
    assert body["disclaimer"] == SGACC_DISCLAIMER


def test_sgacc_target_rejects_missing_patient_id(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.post(
        "/api/v1/ai/sgacc/target",
        json={"fmri_volume_uri": "s3://bucket/x.nii.gz"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text


def test_sgacc_target_rejects_missing_fmri_volume_uri(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.post(
        "/api/v1/ai/sgacc/target",
        json={"patient_id": "pat-001"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text


def test_sgacc_endpoints_registered_in_openapi(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/sgacc/health" in schema["paths"]
    assert "/api/v1/ai/sgacc/target" in schema["paths"]
