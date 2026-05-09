from __future__ import annotations

from app.settings import get_settings
from fastapi.testclient import TestClient


def test_founder_dash_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/founder-dash/tasks")
    assert resp.status_code in (401, 403)


def test_founder_dash_rejects_patient_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.get("/api/v1/founder-dash/tasks", headers=auth_headers["patient"])
    assert resp.status_code == 403


def test_founder_dash_create_and_list_round_trip_for_admin(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    create = client.post(
        "/api/v1/founder-dash/tasks",
        json={
            "board": "deepsynaps",
            "system": "Hermes",
            "owner": "coordinator",
            "title": "Run release-candidate check",
            "notes": "Triggered from founder dash",
            "source": "dash",
            "priority": "P0",
            "status": "todo",
            "route_reason": "DeepSynaps release work",
        },
        headers=auth_headers["admin"],
    )
    assert create.status_code == 200, create.text
    item = create.json()
    assert item["board"] == "deepsynaps"
    assert item["owner"] == "coordinator"

    listed = client.get("/api/v1/founder-dash/tasks", headers=auth_headers["admin"])
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["title"] == "Run release-candidate check"


def test_founder_dash_patch_updates_status(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    created = client.post(
        "/api/v1/founder-dash/tasks",
        json={
            "board": "personal",
            "system": "AliSlave AI",
            "owner": "alislave-ai",
            "title": "Book flights",
            "source": "telegram-personal",
            "priority": "routine",
            "status": "todo",
        },
        headers=auth_headers["admin"],
    ).json()

    patched = client.patch(
        f"/api/v1/founder-dash/tasks/{created['id']}",
        json={"status": "done"},
        headers=auth_headers["admin"],
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["status"] == "done"


def test_founder_dash_isolated_per_actor(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.post(
        "/api/v1/founder-dash/tasks",
        json={
            "board": "perfflux",
            "system": "Perfflux HQ",
            "owner": "perfflux-hq",
            "title": "Prep investor brief",
            "source": "telegram-perfflux",
            "priority": "P1",
            "status": "todo",
        },
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 200, resp.text

    other = client.get("/api/v1/founder-dash/tasks", headers=auth_headers["clinician"])
    assert other.status_code == 200, other.text
    assert other.json()["items"] == []


def test_founder_dash_delete_removes_task(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    created = client.post(
        "/api/v1/founder-dash/tasks",
        json={
            "board": "governance",
            "system": "Paperclip",
            "owner": "paperclip-governance-bridge",
            "title": "Review approvals",
            "source": "telegram-governance",
            "priority": "P1",
            "status": "todo",
        },
        headers=auth_headers["admin"],
    ).json()

    deleted = client.delete(
        f"/api/v1/founder-dash/tasks/{created['id']}",
        headers=auth_headers["admin"],
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json() == {"ok": True}

    listed = client.get("/api/v1/founder-dash/tasks", headers=auth_headers["admin"])
    assert listed.status_code == 200, listed.text
    assert listed.json()["items"] == []


def test_founder_dash_intake_routes_perfflux_telegram(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.post(
        "/api/v1/founder-dash/intake",
        json={
            "title": "Prepare investor update",
            "notes": "Founder asked via Telegram",
            "source": "telegram-perfflux",
            "priority": "P1",
        },
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["board"] == "perfflux"
    assert body["system"] == "Perfflux HQ"
    assert body["owner"] == "perfflux-hq"


def test_founder_dash_system_event_and_overview(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    created = client.post(
        "/api/v1/founder-dash/intake",
        json={
            "title": "Run DeepSynaps release check",
            "source": "telegram-deepsynaps",
            "priority": "P0",
        },
        headers=auth_headers["admin"],
    ).json()

    event = client.post(
        "/api/v1/founder-dash/system-events",
        json={
            "source_system": "hermes",
            "event_kind": "task_started",
            "title": "Hermes picked up release check",
            "detail": "backend-engineer started verification",
            "board": "deepsynaps",
            "owner": "coordinator",
            "related_task_id": created["id"],
        },
        headers=auth_headers["admin"],
    )
    assert event.status_code == 200, event.text
    assert event.json()["source_system"] == "hermes"

    overview = client.get("/api/v1/founder-dash/overview", headers=auth_headers["admin"])
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert any(item["board"] == "deepsynaps" and item["total"] == 1 for item in body["boards"])
    assert body["recent_events"][0]["event_kind"] == "task_started"


def test_founder_dash_bridge_intake_uses_secret_and_default_actor(
    client: TestClient,
    monkeypatch,
) -> None:
    base = get_settings()
    overridden = base.model_copy(update={
        "founder_dash_bridge_key": "bridge-secret",
        "founder_dash_bridge_actor_id": "actor-admin-demo",
        "founder_dash_bridge_actor_role": "admin",
    })
    monkeypatch.setattr("app.routers.founder_dash_router.get_settings", lambda: overridden)
    resp = client.post(
        "/api/v1/founder-dash/bridge/intake",
        json={
            "title": "Ship DeepSynaps hotfix",
            "notes": "Triggered from Hermes",
            "source": "hermes",
            "priority": "P0",
        },
        headers={"X-Founder-Dash-Bridge-Key": "bridge-secret"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["board"] == "deepsynaps"
    assert body["owner"] == "coordinator"
    assert body["source"] == "hermes"


def test_founder_dash_bridge_event_requires_valid_secret(
    client: TestClient,
    monkeypatch,
) -> None:
    base = get_settings()
    overridden = base.model_copy(update={
        "founder_dash_bridge_key": "bridge-secret",
        "founder_dash_bridge_actor_id": "actor-admin-demo",
        "founder_dash_bridge_actor_role": "admin",
    })
    monkeypatch.setattr("app.routers.founder_dash_router.get_settings", lambda: overridden)
    resp = client.post(
        "/api/v1/founder-dash/bridge/system-events",
        json={
            "source_system": "paperclip",
            "event_kind": "approval_requested",
            "title": "Need founder approval",
        },
        headers={"X-Founder-Dash-Bridge-Key": "wrong-secret"},
    )
    assert resp.status_code == 401, resp.text
    assert resp.json()["code"] == "founder_dash_bridge_unauthorized"
