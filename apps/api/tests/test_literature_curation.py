"""Tests for the per-user PMID curation endpoint.

POST /api/v1/literature/papers/{pmid}/curate
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_curate_paper_requires_clinician_role(client: TestClient, auth_headers) -> None:
    # Anonymous → 401/403
    r = client.post(
        "/api/v1/literature/papers/12345678/curate",
        json={"action": "mark-relevant"},
    )
    assert r.status_code in (401, 403), r.text

    # Patient role → 403
    r = client.post(
        "/api/v1/literature/papers/12345678/curate",
        headers=auth_headers["patient"],
        json={"action": "mark-relevant"},
    )
    assert r.status_code == 403, r.text


def test_curate_paper_persists_and_is_idempotent(client: TestClient, auth_headers) -> None:
    pmid = "33445566"

    # First curation: mark-relevant with a note
    r = client.post(
        f"/api/v1/literature/papers/{pmid}/curate",
        headers=auth_headers["clinician"],
        json={"action": "mark-relevant", "note": "Useful for OCD pathway"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pmid"] == pmid
    assert body["action"] == "mark-relevant"
    assert body["note"] == "Useful for OCD pathway"
    assert body["user_id"]
    first_created = body["created_at"]

    # Re-curate same PMID with a different action → row updated, not duplicated
    r2 = client.post(
        f"/api/v1/literature/papers/{pmid}/curate",
        headers=auth_headers["clinician"],
        json={"action": "promote"},
    )
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["pmid"] == pmid
    assert body2["action"] == "promote"
    assert body2["note"] is None
    # Same row → created_at unchanged
    assert body2["created_at"] == first_created


def test_curate_paper_rejects_unknown_action(client: TestClient, auth_headers) -> None:
    r = client.post(
        "/api/v1/literature/papers/99887766/curate",
        headers=auth_headers["clinician"],
        json={"action": "delete-everything"},
    )
    # Pydantic Literal violation → 422
    assert r.status_code == 422, r.text
