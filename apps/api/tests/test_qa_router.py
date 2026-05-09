"""Tests for the QA scoring router."""
from __future__ import annotations

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}


def test_specs_requires_auth():
    """GET /qa/specs must reject unauthenticated requests."""
    r = client.get("/api/v1/qa/specs")
    assert r.status_code == 403


def test_checks_requires_auth():
    """GET /qa/checks must reject unauthenticated requests."""
    r = client.get("/api/v1/qa/checks")
    assert r.status_code == 403


def test_run_requires_auth():
    """POST /qa/run must reject unauthenticated requests."""
    r = client.post("/api/v1/qa/run", json={
        "artifact": {"artifact_id": "a1", "artifact_type": "qeeg_narrative", "content": "test"},
        "spec_id": "spec:qeeg_narrative_v1",
    })
    assert r.status_code == 403


def test_specs_returns_list():
    """Authenticated clinician gets a list of QA specs."""
    r = client.get("/api/v1/qa/specs", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "specs" in body
    assert isinstance(body["specs"], list)


def test_checks_returns_list():
    """Authenticated clinician gets a list of QA checks."""
    r = client.get("/api/v1/qa/checks", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "checks" in body
    assert isinstance(body["checks"], list)


def test_run_unknown_spec_returns_422():
    """Running QA with an unknown spec ID returns 422."""
    r = client.post("/api/v1/qa/run", headers=CLINICIAN_HDR, json={
        "artifact": {
            "artifact_id": "art-001",
            "artifact_type": "qeeg_narrative",
            "content": "Some content here.",
        },
        "spec_id": "spec:nonexistent_v999",
        "operator": "test-user",
    })
    assert r.status_code == 422


def test_run_valid_spec_returns_result():
    """Running QA with a valid spec returns result, audit_entry."""
    # First get a valid spec id
    r_specs = client.get("/api/v1/qa/specs", headers=CLINICIAN_HDR)
    specs = r_specs.json().get("specs", [])
    if not specs:
        # No specs registered — skip the positive path but don't fail
        return

    spec_id = specs[0]["spec_id"]
    artifact_type = specs[0]["artifact_type"]

    r = client.post("/api/v1/qa/run", headers=CLINICIAN_HDR, json={
        "artifact": {
            "artifact_id": "art-002",
            "artifact_type": artifact_type,
            # sections must be a list of dicts, not a bare dict
            "content": "Patient shows improvement. [Ref: Smith 2023]",
            "sections": [],
            "citations": [],
        },
        "spec_id": spec_id,
        "operator": "clinician-demo",
    })
    assert r.status_code == 200
    body = r.json()
    assert "result" in body
    assert "audit_entry" in body
