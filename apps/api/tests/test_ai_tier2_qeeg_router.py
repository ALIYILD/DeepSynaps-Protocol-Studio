"""Tests for ``app.routers.ai_tier2_qeeg_router``.

Exercises the Tier 2 qEEG adapter stub: health reports stub mode and
no loaded models, the registry surfaces both EEGNet and BIOT with
``path: None``, ``/infer`` is gated on clinician-or-above, and every
response carries the canonical disclaimer.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier2_qeeg import QEEG_DISCLAIMER


def test_qeeg_health_reports_stub_mode(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.get(
        "/api/v1/ai/qeeg/health", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["status"] == "stub"
    assert body["models_loaded"] == []
    assert set(body["models_available"]) == {"eegnet", "biot"}


def test_qeeg_models_lists_both_with_no_path(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.get(
        "/api/v1/ai/qeeg/models", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    names = {item["name"] for item in body["items"]}
    assert names == {"eegnet", "biot"}
    for item in body["items"]:
        assert item["path"] is None


def test_qeeg_infer_requires_clinician(
    client: TestClient, auth_headers: dict
) -> None:
    payload = {"model": "eegnet", "signal_shape": [22, 512]}
    for role in ("guest", "patient"):
        resp = client.post(
            "/api/v1/ai/qeeg/infer", json=payload, headers=auth_headers[role]
        )
        assert resp.status_code == 403, f"role={role} got {resp.status_code}"


def test_qeeg_infer_returns_stub_envelope(
    client: TestClient, auth_headers: dict
) -> None:
    payload = {"model": "biot", "signal_shape": [22, 2048]}
    resp = client.post(
        "/api/v1/ai/qeeg/infer",
        json=payload,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["predictions"] is None
    assert body["status"] == "stub"
    assert body["disclaimer"] == QEEG_DISCLAIMER
    assert body["model"] == "biot"


def test_qeeg_infer_rejects_unknown_model(
    client: TestClient, auth_headers: dict
) -> None:
    """Schema validation: invalid model name (e.g. 'resnet') → 422."""
    resp = client.post(
        "/api/v1/ai/qeeg/infer",
        json={"model": "resnet", "signal_shape": [22, 512]},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text


def test_qeeg_endpoints_registered_in_openapi(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/qeeg/health" in schema["paths"]
    assert "/api/v1/ai/qeeg/models" in schema["paths"]
    assert "/api/v1/ai/qeeg/infer" in schema["paths"]
