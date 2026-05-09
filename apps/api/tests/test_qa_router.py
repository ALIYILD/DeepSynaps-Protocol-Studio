"""Tests for qa_router — /api/v1/qa.

Tests cover:
- GET  /specs returns list of available QA specs
- GET  /checks returns registered check classes
- POST /run with a valid spec + artifact returns result + audit_entry
- POST /run with unknown spec_id returns 422
- POST /run with invalid artifact type returns 422
- POST /run without auth returns 403 (guest actor blocked)
- GET  /specs without auth returns 403
- POST /run with minimal passing artifact (all required sections present)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}

# A minimal qeeg_narrative artifact that satisfies the required sections.
# Artifact.content is a plain string (full text); citations is a list of dicts.
_QEEG_ARTIFACT = {
    "artifact_id": "test-art-001",
    "artifact_type": "qeeg_narrative",
    "content": (
        "## Methods\nEEG recorded for 20 minutes using a 19-channel cap [1].\n\n"
        "## Findings\nAlpha power elevated in posterior regions. No seizure activity [2].\n\n"
        "## Clinical Impression\nMildly elevated alpha; no significant pathology [1][2].\n\n"
        "## Recommendations\nRepeat assessment in 6 months."
    ),
    "citations": [
        {"id": "1", "text": "Smith et al. 2020"},
        {"id": "2", "text": "Jones et al. 2021"},
    ],
    "metadata": {},
    "sections": [],
}


def test_qa_specs_returns_list(client: TestClient) -> None:
    """GET /api/v1/qa/specs returns at least one spec."""
    r = client.get("/api/v1/qa/specs", headers=CLINICIAN_HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "specs" in body
    assert isinstance(body["specs"], list)
    assert len(body["specs"]) >= 1


def test_qa_specs_shape(client: TestClient) -> None:
    """Each spec has required fields."""
    r = client.get("/api/v1/qa/specs", headers=CLINICIAN_HDR)
    specs = r.json()["specs"]
    for s in specs:
        assert "spec_id" in s
        assert "artifact_type" in s
        assert "required_sections" in s
        assert "citation_floor" in s
        assert isinstance(s["required_sections"], list)


def test_qa_specs_contains_qeeg_narrative(client: TestClient) -> None:
    """QEEG narrative spec must be registered."""
    r = client.get("/api/v1/qa/specs", headers=CLINICIAN_HDR)
    spec_ids = [s["spec_id"] for s in r.json()["specs"]]
    assert "spec:qeeg_narrative_v1" in spec_ids


def test_qa_specs_requires_auth(client: TestClient) -> None:
    """GET /specs without auth header returns 403."""
    r = client.get("/api/v1/qa/specs")
    assert r.status_code == 403


def test_qa_checks_returns_list(client: TestClient) -> None:
    """GET /api/v1/qa/checks returns registered checks."""
    r = client.get("/api/v1/qa/checks", headers=CLINICIAN_HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "checks" in body
    assert isinstance(body["checks"], list)
    assert len(body["checks"]) >= 1


def test_qa_checks_shape(client: TestClient) -> None:
    """Each check entry has category and class_name."""
    r = client.get("/api/v1/qa/checks", headers=CLINICIAN_HDR)
    for item in r.json()["checks"]:
        assert "category" in item
        assert "class_name" in item


def test_qa_run_unknown_spec_returns_422(client: TestClient) -> None:
    """POST /run with unknown spec_id returns 422."""
    payload = {
        "artifact": _QEEG_ARTIFACT,
        "spec_id": "spec:does_not_exist_xyz",
        "operator": "test-operator",
    }
    r = client.post("/api/v1/qa/run", json=payload, headers=CLINICIAN_HDR)
    assert r.status_code == 422, r.text


def test_qa_run_missing_artifact_returns_422(client: TestClient) -> None:
    """POST /run with missing artifact field returns 422."""
    payload = {
        "spec_id": "spec:qeeg_narrative_v1",
    }
    r = client.post("/api/v1/qa/run", json=payload, headers=CLINICIAN_HDR)
    assert r.status_code == 422


def test_qa_run_without_auth_forbidden(client: TestClient) -> None:
    """POST /run without auth (anonymous actor / guest) returns 403.

    The request must have a structurally valid body so Pydantic validation
    passes before the auth gate is reached.
    """
    payload = {
        "artifact": _QEEG_ARTIFACT,
        "spec_id": "spec:qeeg_narrative_v1",
        "operator": "anon",
    }
    r = client.post("/api/v1/qa/run", json=payload)
    assert r.status_code == 403


def test_qa_run_happy_path(client: TestClient) -> None:
    """POST /run returns result, audit_entry with correct shape."""
    payload = {
        "artifact": _QEEG_ARTIFACT,
        "spec_id": "spec:qeeg_narrative_v1",
        "operator": "clinician-demo",
    }
    r = client.post("/api/v1/qa/run", json=payload, headers=CLINICIAN_HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "result" in body
    assert "audit_entry" in body
    result = body["result"]
    assert "score" in result
    assert "verdict" in result
    assert "run_id" in result
    audit = body["audit_entry"]
    assert "entry_id" in audit
    assert "run_id" in audit
    assert "timestamp_utc" in audit
