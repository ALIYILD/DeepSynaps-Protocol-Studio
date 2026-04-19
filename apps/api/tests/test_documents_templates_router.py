"""Documents router — custom document template CRUD."""
from __future__ import annotations

from fastapi.testclient import TestClient


def _create_template(client: TestClient, auth_headers: dict, **overrides) -> dict:
    body = {"name": "Discharge Letter v1", "doc_type": "letter", "body_markdown": "# Hello {{patient_name}}"}
    body.update(overrides)
    resp = client.post("/api/v1/documents/templates", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestDocumentTemplateCrud:
    def test_list_empty(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/documents/templates", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_create_persists_owner_and_fields(self, client: TestClient, auth_headers: dict) -> None:
        t = _create_template(
            client, auth_headers,
            name="GP Referral", doc_type="letter", body_markdown="Dear Doctor,\n\n...",
        )
        assert t["id"]
        assert t["owner_id"]  # populated from authenticated actor
        assert t["name"] == "GP Referral"
        assert t["doc_type"] == "letter"
        assert t["body_markdown"].startswith("Dear Doctor,")

        listing = client.get("/api/v1/documents/templates", headers=auth_headers["clinician"]).json()
        assert listing["total"] == 1
        assert listing["items"][0]["id"] == t["id"]

    def test_list_does_not_collide_with_get_document(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Regression guard: /templates must route to list_document_templates,
        # NOT to get_document(doc_id="templates"). If routes are reordered the
        # latter returns 404 with the document `not_found` payload instead of
        # the {items, total} envelope.
        _create_template(client, auth_headers, name="Sanity")
        resp = client.get("/api/v1/documents/templates", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body and "total" in body
        assert body["total"] == 1

    def test_patch_updates_name_type_and_body(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        t = _create_template(client, auth_headers)
        resp = client.patch(
            f"/api/v1/documents/templates/{t['id']}",
            json={"name": "Renamed", "doc_type": "consent", "body_markdown": "## consent body"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        j = resp.json()
        assert j["name"] == "Renamed"
        assert j["doc_type"] == "consent"
        assert j["body_markdown"] == "## consent body"

    def test_delete_removes_record(self, client: TestClient, auth_headers: dict) -> None:
        t = _create_template(client, auth_headers)
        r = client.delete(f"/api/v1/documents/templates/{t['id']}", headers=auth_headers["clinician"])
        assert r.status_code == 204
        # Subsequent PATCH should 404.
        r2 = client.patch(
            f"/api/v1/documents/templates/{t['id']}",
            json={"name": "x"},
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 404

    def test_owner_isolation(self, client: TestClient, auth_headers: dict) -> None:
        _create_template(client, auth_headers, name="Mine")
        # admin actor has its own actor_id and should not see the clinician's row
        listing = client.get("/api/v1/documents/templates", headers=auth_headers["admin"]).json()
        assert all(item["name"] != "Mine" for item in listing["items"])

    def test_invalid_doc_type_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            "/api/v1/documents/templates",
            json={"name": "Bad", "doc_type": "weapon", "body_markdown": ""},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_blank_name_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            "/api/v1/documents/templates",
            json={"name": "   ", "doc_type": "letter", "body_markdown": ""},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
