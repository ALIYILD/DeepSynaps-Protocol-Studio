"""Tests for Phase 2 MRI backend features (viewer state persistence + capabilities).

Tests the new viewer state persistence endpoints and capabilities endpoint.

Added 2026-05-09 as part of MRI DeepDive Phase 2/4 (Backend + DB).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import MriAnalysis, MriViewerState
from app.services.auth_service import create_access_token


@pytest.fixture
def clinician_token() -> str:
    """Create a valid clinician access token."""
    return create_access_token(
        user_id="user-123",
        username="clinician",
        roles=["clinician"],
    )


@pytest.fixture
def mri_analysis_db() -> str:
    """Create a test MRI analysis record."""
    db = SessionLocal()
    try:
        # Create a minimal analysis record for testing
        analysis = MriAnalysis(
            analysis_id="test-analysis-id-001",
            patient_id="patient-123",
            job_id="job-001",
            state="completed",
            demo_mode=False,
        )
        db.add(analysis)
        db.commit()
        yield analysis.analysis_id
    finally:
        # Cleanup
        db.query(MriViewerState).filter_by(analysis_id="test-analysis-id-001").delete()
        db.query(MriAnalysis).filter_by(analysis_id="test-analysis-id-001").delete()
        db.commit()
        db.close()


def test_viewer_state_save_and_retrieve(
    client: TestClient,
    clinician_token: str,
    mri_analysis_db: str,
) -> None:
    """Test saving and retrieving viewer state."""
    viewer_state = {
        "slice_index": {"x": 100, "y": 100, "z": 50},
        "roi_visibility": {"atlas": True, "custom_roi": False},
        "overlay_alpha": 0.7,
        "active_modality": "structural",
        "crosshair_enabled": True,
    }

    # Save viewer state
    response = client.post(
        f"/api/v1/mri/{mri_analysis_db}/viewer-state",
        json={"state": viewer_state},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert response.status_code == 200, response.json()
    data = response.json()
    assert data["analysis_id"] == mri_analysis_db
    assert data["state"] == viewer_state
    assert "updated_at" in data

    # Retrieve viewer state
    response = client.get(
        f"/api/v1/mri/{mri_analysis_db}/viewer-state",
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["analysis_id"] == mri_analysis_db
    assert data["state"] == viewer_state


def test_viewer_state_empty_on_missing_analysis(
    client: TestClient,
    clinician_token: str,
) -> None:
    """Test that retrieving state for non-existent analysis returns 404."""
    response = client.get(
        "/api/v1/mri/nonexistent-analysis/viewer-state",
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert response.status_code == 404


def test_viewer_state_update(
    client: TestClient,
    clinician_token: str,
    mri_analysis_db: str,
) -> None:
    """Test that viewer state can be updated."""
    state_v1 = {"slice_index": {"z": 50}}

    # Save initial state
    response = client.post(
        f"/api/v1/mri/{mri_analysis_db}/viewer-state",
        json={"state": state_v1},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert response.status_code == 200

    # Update state
    state_v2 = {"slice_index": {"z": 75}, "overlay_alpha": 0.5}
    response = client.post(
        f"/api/v1/mri/{mri_analysis_db}/viewer-state",
        json={"state": state_v2},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["state"]["overlay_alpha"] == 0.5

    # Verify update was persisted
    response = client.get(
        f"/api/v1/mri/{mri_analysis_db}/viewer-state",
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["state"] == state_v2


def test_mri_capabilities_endpoint(
    client: TestClient,
    clinician_token: str,
) -> None:
    """Test the MRI capabilities endpoint."""
    response = client.get(
        "/api/v1/mri/capabilities",
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    # Verify response shape
    assert "status" in data
    assert data["status"] in ("ok", "unavailable", "degraded")
    assert "modules" in data
    assert isinstance(data["modules"], dict)
    assert "warnings" in data
    assert isinstance(data["warnings"], list)
    assert "last_checked_at" in data

    # If available, check module structure
    if data["modules"]:
        for module_name, module_info in data["modules"].items():
            assert "available" in module_info
            assert isinstance(module_info["available"], bool)


def test_mri_capabilities_module_targeting_always_available(
    client: TestClient,
    clinician_token: str,
) -> None:
    """Test that targeting module is always available when pipeline is."""
    response = client.get(
        "/api/v1/mri/capabilities",
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    # If pipeline is available, targeting should be available
    if data["status"] != "unavailable":
        assert "targeting" in data["modules"]
        assert data["modules"]["targeting"]["available"] is True
        assert "conditions_supported" in data["modules"]["targeting"]
        assert isinstance(data["modules"]["targeting"]["conditions_supported"], list)


def test_viewer_state_requires_clinician_role(
    client: TestClient,
    mri_analysis_db: str,
) -> None:
    """Test that viewer state endpoints require clinician role."""
    # Create a token with a non-clinician role (if possible)
    non_clinician_token = create_access_token(
        user_id="user-456",
        username="non_clinician",
        roles=["patient"],
    )

    response = client.get(
        f"/api/v1/mri/{mri_analysis_db}/viewer-state",
        headers={"Authorization": f"Bearer {non_clinician_token}"},
    )
    assert response.status_code in (401, 403)


def test_capabilities_requires_clinician_role(
    client: TestClient,
) -> None:
    """Test that capabilities endpoint requires clinician role."""
    non_clinician_token = create_access_token(
        user_id="user-456",
        username="non_clinician",
        roles=["patient"],
    )

    response = client.get(
        "/api/v1/mri/capabilities",
        headers={"Authorization": f"Bearer {non_clinician_token}"},
    )
    assert response.status_code in (401, 403)
