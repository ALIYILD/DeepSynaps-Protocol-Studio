"""Happy-path tests for the Quality Assurance findings router.

Scope: /api/v1/qa/findings — list, summary, create, get, patch, close, reopen,
audit-event ingestion. Verifies role gate (guest blocked), empty-DB stability,
and closed-finding immutability.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


AUTH_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
AUTH_ADMIN = {"Authorization": "Bearer admin-demo-token"}
AUTH_GUEST = {"Authorization": "Bearer guest-demo-token"}


def test_list_findings_empty_returns_stable_shape(client: TestClient) -> None:
    r = client.get("/api/v1/qa/findings", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)
    assert body["total"] == 0
    assert isinstance(body.get("disclaimers"), list)
    assert len(body["disclaimers"]) >= 1


def test_list_findings_guest_blocked(client: TestClient) -> None:
    r = client.get("/api/v1/qa/findings", headers=AUTH_GUEST)
    assert r.status_code in (403, 404)


def test_findings_summary_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/qa/findings/summary", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert "by_severity" in body
    assert "by_finding_type" in body
    assert isinstance(body.get("disclaimers"), list)


def test_create_finding_and_get(client: TestClient) -> None:
    create_r = client.post(
        "/api/v1/qa/findings",
        json={
            "title": "Test protocol deviation",
            "description": "Minor deviation from protocol step 3",
            "finding_type": "protocol_deviation",
            "severity": "minor",
        },
        headers=AUTH_CLINICIAN,
    )
    assert create_r.status_code == 201, create_r.text
    finding = create_r.json()
    assert finding["title"] == "Test protocol deviation"
    assert finding["finding_type"] == "protocol_deviation"
    assert finding["severity"] == "minor"
    assert finding["status"] == "open"
    assert finding.get("id")
    assert finding.get("payload_hash")

    fid = finding["id"]
    get_r = client.get(f"/api/v1/qa/findings/{fid}", headers=AUTH_CLINICIAN)
    assert get_r.status_code == 200
    assert get_r.json()["id"] == fid


def test_patch_finding_severity(client: TestClient) -> None:
    create_r = client.post(
        "/api/v1/qa/findings",
        json={"title": "Patch target", "severity": "minor"},
        headers=AUTH_CLINICIAN,
    )
    assert create_r.status_code == 201
    fid = create_r.json()["id"]

    patch_r = client.patch(
        f"/api/v1/qa/findings/{fid}",
        json={"severity": "major"},
        headers=AUTH_CLINICIAN,
    )
    assert patch_r.status_code == 200
    assert patch_r.json()["severity"] == "major"


def test_close_finding_requires_note(client: TestClient) -> None:
    create_r = client.post(
        "/api/v1/qa/findings",
        json={"title": "Close candidate", "severity": "minor"},
        headers=AUTH_CLINICIAN,
    )
    fid = create_r.json()["id"]

    # Closing without a note must be rejected.
    bad_r = client.post(
        f"/api/v1/qa/findings/{fid}/close",
        json={"note": ""},
        headers=AUTH_CLINICIAN,
    )
    assert bad_r.status_code == 422

    # Closing with a note succeeds.
    ok_r = client.post(
        f"/api/v1/qa/findings/{fid}/close",
        json={"note": "Corrective action completed per SOP-42."},
        headers=AUTH_CLINICIAN,
    )
    assert ok_r.status_code == 200
    assert ok_r.json()["status"] == "closed"


def test_closed_finding_is_immutable(client: TestClient) -> None:
    create_r = client.post(
        "/api/v1/qa/findings",
        json={"title": "Immutability check", "severity": "minor"},
        headers=AUTH_CLINICIAN,
    )
    fid = create_r.json()["id"]
    client.post(
        f"/api/v1/qa/findings/{fid}/close",
        json={"note": "CAPA completed."},
        headers=AUTH_CLINICIAN,
    )

    # Patching a closed finding must be rejected.
    patch_r = client.patch(
        f"/api/v1/qa/findings/{fid}",
        json={"severity": "critical"},
        headers=AUTH_CLINICIAN,
    )
    assert patch_r.status_code == 409


def test_reopen_closed_finding(client: TestClient) -> None:
    create_r = client.post(
        "/api/v1/qa/findings",
        json={"title": "Reopen candidate", "severity": "minor"},
        headers=AUTH_CLINICIAN,
    )
    fid = create_r.json()["id"]
    client.post(
        f"/api/v1/qa/findings/{fid}/close",
        json={"note": "Initial closure."},
        headers=AUTH_CLINICIAN,
    )

    reopen_r = client.post(
        f"/api/v1/qa/findings/{fid}/reopen",
        json={"reason": "New evidence found during audit."},
        headers=AUTH_CLINICIAN,
    )
    assert reopen_r.status_code == 200
    assert reopen_r.json()["status"] == "reopened"


def test_audit_event_ingestion(client: TestClient) -> None:
    r = client.post(
        "/api/v1/qa/findings/audit-events",
        json={"event": "page_viewed", "note": "QA page opened"},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert body.get("event_id")
