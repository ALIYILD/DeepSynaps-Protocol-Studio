"""Tests for ``app.routers.ai_tier2_mri_router``.

Exercises the Tier 2 MRI segmentation stub: health reports stub mode and
no GPU, the registry surfaces FastSurfer + SynthSeg with ``binary_path:
None``, ``/jobs`` POST + GET are gated on clinician-or-above, and every
response carries the canonical disclaimer.
"""
from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient

from app.services.ai.tier2_mri import MRI_DISCLAIMER


def test_mri_health_reports_stub_mode(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.get(
        "/api/v1/ai/mri/health", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["status"] == "stub"
    assert body["gpu_available"] is False
    assert set(body["pipelines_available"]) == {"fastsurfer", "synthseg"}


def test_mri_pipelines_lists_both_with_no_binary_path(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.get(
        "/api/v1/ai/mri/pipelines", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    names = {item["name"] for item in body["items"]}
    assert names == {"fastsurfer", "synthseg"}
    for item in body["items"]:
        assert item["binary_path"] is None
        assert item["license"] == "Apache-2.0"


def test_mri_submit_requires_clinician(
    client: TestClient, auth_headers: dict
) -> None:
    payload = {
        "pipeline": "fastsurfer",
        "input_uri": "s3://bucket/sub-001/T1.nii.gz",
        "subject_id": "sub-001",
    }
    for role in ("guest", "patient"):
        resp = client.post(
            "/api/v1/ai/mri/jobs", json=payload, headers=auth_headers[role]
        )
        assert resp.status_code == 403, f"role={role} got {resp.status_code}"


def test_mri_submit_returns_stub_envelope(
    client: TestClient, auth_headers: dict
) -> None:
    payload = {
        "pipeline": "fastsurfer",
        "input_uri": "s3://bucket/sub-001/T1.nii.gz",
        "subject_id": "sub-001",
    }
    resp = client.post(
        "/api/v1/ai/mri/jobs", json=payload, headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["status"] == "stub"
    assert body["stage"] == "queued"
    assert body["segmentation_uri"] is None
    assert body["disclaimer"] == MRI_DISCLAIMER
    # job_id must be a valid UUID
    UUID(body["job_id"])


def test_mri_job_status_returns_stub_for_any_id(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.get(
        "/api/v1/ai/mri/jobs/00000000-0000-0000-0000-000000000000",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["status"] == "stub"
    assert body["stage"] == "queued"
    assert body["disclaimer"] == MRI_DISCLAIMER


def test_mri_submit_rejects_invalid_pipeline(
    client: TestClient, auth_headers: dict
) -> None:
    """Schema validation: unknown pipeline → 422."""
    resp = client.post(
        "/api/v1/ai/mri/jobs",
        json={
            "pipeline": "bananasurfer",
            "input_uri": "s3://bucket/x.nii.gz",
            "subject_id": "sub-001",
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text


def test_mri_endpoints_registered_in_openapi(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/mri/health" in schema["paths"]
    assert "/api/v1/ai/mri/pipelines" in schema["paths"]
    assert "/api/v1/ai/mri/jobs" in schema["paths"]
    assert "/api/v1/ai/mri/jobs/{job_id}" in schema["paths"]
