"""Integration tests for the monorepo Neuro Engine API wrapper."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient


def test_neuro_engine_health_requires_clinician(client: TestClient) -> None:
    """The Neuro Engine health endpoint should reject anonymous callers."""

    response = client.get("/api/v1/neuro-engine/health")
    assert response.status_code in (401, 403)


def test_neuro_engine_health_reports_availability(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """The Neuro Engine health endpoint should advertise the installed package."""

    response = client.get(
        "/api/v1/neuro-engine/health",
        headers=auth_headers["clinician"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True
    assert body["status"] == "available"
    assert body["package_version"] == "0.1.0"


def test_neuro_engine_validate_bids_round_trip(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    tmp_path: Path,
) -> None:
    """The wrapper should delegate BIDS validation to the Neuro Engine package."""

    bids_root = tmp_path / "bids"
    anat_dir = bids_root / "sub-01" / "ses-01" / "anat"
    anat_dir.mkdir(parents=True)
    (bids_root / "dataset_description.json").write_text(
        json.dumps({"Name": "Neuro Engine Test Dataset", "BIDSVersion": "1.8.0"}),
        encoding="utf-8",
    )
    (anat_dir / "sub-01_T1w.nii.gz").write_bytes(b"fake")
    (anat_dir / "sub-01_T1w.json").write_text("{}", encoding="utf-8")

    response = client.post(
        "/api/v1/neuro-engine/validate-bids",
        json={"bids_root": str(bids_root)},
        headers=auth_headers["clinician"],
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_valid"] is True
    assert body["subjects"] == ["sub-01"]
    assert "ses-01" in body["sessions"]
    assert "anat" in body["modalities"]
