"""Tests for reviewer_sla_calibration_threshold_tuning_router (IRB-AMD4).

Covers:
  - GET /current-threshold happy path + auth gate
  - GET /recommend happy path (returns RecommendationOut shape)
  - POST /replay happy path + 422 for out-of-range value
  - POST /adopt happy path (admin) + clinician-forbidden + short justification
  - GET /adoption-history empty + populated after adopt
  - GET /audit-events shape
  - POST /audit-events page-level ingestion
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}

BASE = "/api/v1/reviewer-sla-calibration-threshold-tuning"


def test_current_threshold_requires_auth():
    r = client.get(f"{BASE}/current-threshold")
    assert r.status_code == 403


def test_current_threshold_happy_path():
    r = client.get(f"{BASE}/current-threshold", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "threshold_key" in data
    assert "auto_reassign_enabled" in data


def test_recommend_happy_path():
    r = client.get(f"{BASE}/recommend", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "insufficient_data" in data
    assert "sample_size_reviewers" in data
    assert isinstance(data["qualifying_reviewers"], list)


def test_replay_happy_path():
    r = client.post(
        f"{BASE}/replay",
        json={"override_threshold": 0.5},
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["override_threshold"] == 0.5
    assert "projected_reassign_count" in data
    assert "reviewers_below_floor_ids" in data


def test_replay_out_of_range_422():
    r = client.post(
        f"{BASE}/replay",
        json={"override_threshold": 99.0},  # > 2.0 limit
        headers=CLINICIAN,
    )
    assert r.status_code == 422


def test_adopt_requires_admin():
    r = client.post(
        f"{BASE}/adopt",
        json={
            "threshold_value": 0.5,
            "auto_reassign_enabled": False,
            "justification": "Clinician should be denied this action",
        },
        headers=CLINICIAN,
    )
    assert r.status_code == 403


def test_adopt_short_justification_422():
    r = client.post(
        f"{BASE}/adopt",
        json={
            "threshold_value": 0.5,
            "auto_reassign_enabled": False,
            "justification": "too short",
        },
        headers=ADMIN,
    )
    assert r.status_code == 422


def test_adopt_happy_path():
    r = client.post(
        f"{BASE}/adopt",
        json={
            "threshold_value": 0.6,
            "auto_reassign_enabled": True,
            "justification": "Adopting calibration floor for automated test coverage run",
        },
        headers=ADMIN,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert data["threshold_value"] == 0.6
    assert data["auto_reassign_enabled"] is True
    assert "audit_event_id" in data


def test_adoption_history_empty():
    r = client.get(f"{BASE}/adoption-history", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert data["total"] == 0


def test_adoption_history_after_adopt():
    client.post(
        f"{BASE}/adopt",
        json={
            "threshold_value": 0.7,
            "auto_reassign_enabled": False,
            "justification": "Adoption for history backfill test scenario",
        },
        headers=ADMIN,
    )
    r = client.get(f"{BASE}/adoption-history", headers=CLINICIAN)
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_audit_events_shape():
    r = client.get(f"{BASE}/audit-events", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "surface" in data


def test_post_audit_event_happy_path():
    r = client.post(
        f"{BASE}/audit-events",
        json={"event": "page_viewed"},
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "event_id" in data
