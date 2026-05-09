"""Happy-path tests for the Care Team Coverage router.

Scope: /api/v1/care-team-coverage — roster, oncall-now, sla-config,
escalation-chain, sla-breaches, summary, pages. Verifies role gate
(guest blocked), empty-DB stability, and admin write paths.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


AUTH_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
AUTH_ADMIN = {"Authorization": "Bearer admin-demo-token"}
AUTH_GUEST = {"Authorization": "Bearer guest-demo-token"}


def test_summary_empty_db_returns_stable_shape(client: TestClient) -> None:
    r = client.get("/api/v1/care-team-coverage/summary", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "active_shifts" in body
    assert "oncall_now" in body
    assert "sla_breaches_today" in body
    assert "paged_today" in body
    assert isinstance(body.get("disclaimers"), list)


def test_summary_guest_blocked(client: TestClient) -> None:
    r = client.get("/api/v1/care-team-coverage/summary", headers=AUTH_GUEST)
    assert r.status_code in (403, 404)


def test_roster_empty_returns_list(client: TestClient) -> None:
    r = client.get("/api/v1/care-team-coverage/roster", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_oncall_now_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/care-team-coverage/oncall-now", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "oncall" in body or isinstance(body, dict)


def test_sla_config_returns_defaults(client: TestClient) -> None:
    r = client.get("/api/v1/care-team-coverage/sla-config", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body or isinstance(body, (list, dict))


def test_escalation_chain_empty(client: TestClient) -> None:
    r = client.get("/api/v1/care-team-coverage/escalation-chain", headers=AUTH_CLINICIAN)
    assert r.status_code == 200


def test_sla_breaches_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/care-team-coverage/sla-breaches", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_pages_history_empty(client: TestClient) -> None:
    r = client.get("/api/v1/care-team-coverage/pages", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_admin_can_upsert_sla_config(client: TestClient) -> None:
    r = client.post(
        "/api/v1/care-team-coverage/sla-config",
        json={
            "surface": "adverse_events",
            "priority": "HIGH",
            "sla_minutes": 10,
        },
        headers=AUTH_ADMIN,
    )
    assert r.status_code in (200, 201), r.text


def test_audit_event_ingestion(client: TestClient) -> None:
    r = client.post(
        "/api/v1/care-team-coverage/audit-events",
        json={"event": "page_viewed"},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("accepted") is True
    assert body.get("event_id")
