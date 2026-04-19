"""Home task templates router — clinician-authored task template CRUD.

Mirrors the document_templates router tests (test_documents_templates_router.py)
for consistency with the pattern that ships in PR #38.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


_PAYLOAD_DEFAULT = {
    "title": "Daily Mood Journal",
    "type": "mood-journal",
    "frequency": "daily",
    "instructions": "Record mood, energy, and notable thoughts each morning.",
    "reason": "Treatment monitoring",
}


def _create_template(client: TestClient, auth_headers: dict, **overrides) -> dict:
    body = {"name": "Daily Mood Journal", "payload": dict(_PAYLOAD_DEFAULT)}
    body.update(overrides)
    resp = client.post(
        "/api/v1/home-task-templates",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestHomeTaskTemplateCrud:
    def test_list_empty(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get(
            "/api/v1/home-task-templates", headers=auth_headers["clinician"]
        )
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_create_persists_owner_and_payload(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        t = _create_template(
            client,
            auth_headers,
            name="Sleep Hygiene",
            payload={
                "title": "Sleep Hygiene Routine",
                "type": "sleep",
                "frequency": "daily",
                "instructions": "No screens 1h before bed.",
                "reason": "Sleep quality improvement",
                "conditionId": "CON-014",
                "conditionName": "Insomnia",
            },
        )
        assert t["id"]
        assert t["owner_id"]  # populated from authenticated actor
        assert t["name"] == "Sleep Hygiene"
        assert t["payload"]["type"] == "sleep"
        assert t["payload"]["conditionId"] == "CON-014"

        listing = client.get(
            "/api/v1/home-task-templates", headers=auth_headers["clinician"]
        ).json()
        assert listing["total"] == 1
        assert listing["items"][0]["id"] == t["id"]

    def test_patch_updates_name_and_payload(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        t = _create_template(client, auth_headers)
        resp = client.patch(
            f"/api/v1/home-task-templates/{t['id']}",
            json={
                "name": "Renamed",
                "payload": {**_PAYLOAD_DEFAULT, "frequency": "weekly"},
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        j = resp.json()
        assert j["name"] == "Renamed"
        assert j["payload"]["frequency"] == "weekly"

    def test_delete_removes_record(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        t = _create_template(client, auth_headers)
        r = client.delete(
            f"/api/v1/home-task-templates/{t['id']}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 204
        # Subsequent PATCH should 404.
        r2 = client.patch(
            f"/api/v1/home-task-templates/{t['id']}",
            json={"name": "x"},
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 404

    def test_owner_isolation(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_template(client, auth_headers, name="Mine")
        # admin actor has its own actor_id and should not see the clinician's row
        listing = client.get(
            "/api/v1/home-task-templates", headers=auth_headers["admin"]
        ).json()
        assert all(item["name"] != "Mine" for item in listing["items"])

    def test_blank_name_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            "/api/v1/home-task-templates",
            json={"name": "   ", "payload": {}},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_oversize_payload_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Construct a payload whose JSON-encoded form exceeds the 200 KB cap.
        big = {"instructions": "x" * 210_000}
        resp = client.post(
            "/api/v1/home-task-templates",
            json={"name": "Too Big", "payload": big},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json().get("code") == "payload_too_large"
