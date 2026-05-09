"""Tests for rotation_policy_advisor_threshold_tuning_router (CSAHP6).

Covers:
  - GET /current-thresholds happy path + auth gate
  - POST /replay happy path
  - POST /adopt happy path (admin) + clinician-forbidden + invalid code + invalid key
  - GET /adoption-history empty + after adopt
  - GET /audit-events shape
  - POST /audit-events page-level ingestion
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}


# ── helpers ──────────────────────────────────────────────────────────────────

def _first_valid_code_and_key() -> tuple[str, str]:
    from app.services.rotation_policy_advisor import DEFAULT_THRESHOLDS, ROTATION_ADVICE_CODES
    code = list(ROTATION_ADVICE_CODES)[0]
    key = list(DEFAULT_THRESHOLDS[code].keys())[0]
    return code, key


# ── tests ────────────────────────────────────────────────────────────────────

def test_current_thresholds_requires_auth():
    r = client.get("/api/v1/rotation-policy-advisor-threshold-tuning/current-thresholds")
    assert r.status_code == 403


def test_current_thresholds_happy_path():
    r = client.get(
        "/api/v1/rotation-policy-advisor-threshold-tuning/current-thresholds",
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    data = r.json()
    assert "thresholds" in data
    assert "defaults" in data
    assert "advice_codes" in data
    assert isinstance(data["advice_codes"], list)
    assert len(data["advice_codes"]) > 0


def test_replay_happy_path_empty_overrides():
    r = client.post(
        "/api/v1/rotation-policy-advisor-threshold-tuning/replay",
        json={"override_thresholds": {}},
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    data = r.json()
    assert "current_accuracy" in data
    assert "whatif_accuracy" in data
    assert isinstance(data["snapshot_count"], int)


def test_replay_requires_auth():
    r = client.post(
        "/api/v1/rotation-policy-advisor-threshold-tuning/replay",
        json={"override_thresholds": {}},
    )
    assert r.status_code == 403


def test_adopt_requires_admin():
    """Clinician cannot adopt a threshold."""
    code, key = _first_valid_code_and_key()
    r = client.post(
        "/api/v1/rotation-policy-advisor-threshold-tuning/adopt",
        json={
            "advice_code": code,
            "threshold_key": key,
            "threshold_value": 5.0,
            "justification": "Test adoption justification text",
        },
        headers=CLINICIAN,
    )
    assert r.status_code == 403


def test_adopt_invalid_advice_code_returns_400():
    r = client.post(
        "/api/v1/rotation-policy-advisor-threshold-tuning/adopt",
        json={
            "advice_code": "NOT_A_REAL_CODE",
            "threshold_key": "re_flag_rate_pct_min",
            "threshold_value": 5.0,
            "justification": "Justification must be long enough",
        },
        headers=ADMIN,
    )
    assert r.status_code == 400
    assert "advice_code" in r.json().get("detail", "").lower() or \
           "advice_code" in str(r.json()).lower()


def test_adopt_invalid_threshold_key_returns_400():
    code, _ = _first_valid_code_and_key()
    r = client.post(
        "/api/v1/rotation-policy-advisor-threshold-tuning/adopt",
        json={
            "advice_code": code,
            "threshold_key": "nonexistent_key_xyz",
            "threshold_value": 5.0,
            "justification": "Justification must be long enough",
        },
        headers=ADMIN,
    )
    assert r.status_code == 400


def test_adopt_happy_path():
    code, key = _first_valid_code_and_key()
    r = client.post(
        "/api/v1/rotation-policy-advisor-threshold-tuning/adopt",
        json={
            "advice_code": code,
            "threshold_key": key,
            "threshold_value": 50.0,
            "justification": "Adopting a test threshold for automated coverage",
        },
        headers=ADMIN,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert data["advice_code"] == code
    assert data["threshold_key"] == key
    assert data["threshold_value"] == 50.0
    assert "audit_event_id" in data


def test_adoption_history_empty():
    r = client.get(
        "/api/v1/rotation-policy-advisor-threshold-tuning/adoption-history",
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] == 0


def test_adoption_history_after_adopt():
    code, key = _first_valid_code_and_key()
    client.post(
        "/api/v1/rotation-policy-advisor-threshold-tuning/adopt",
        json={
            "advice_code": code,
            "threshold_key": key,
            "threshold_value": 42.0,
            "justification": "History test adoption — must be at least 10 chars",
        },
        headers=ADMIN,
    )
    r = client.get(
        "/api/v1/rotation-policy-advisor-threshold-tuning/adoption-history",
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1


def test_audit_events_shape():
    r = client.get(
        "/api/v1/rotation-policy-advisor-threshold-tuning/audit-events",
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "surface" in data


def test_post_audit_event_happy_path():
    r = client.post(
        "/api/v1/rotation-policy-advisor-threshold-tuning/audit-events",
        json={"event": "page_viewed", "note": "threshold tuning page opened"},
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "event_id" in data
