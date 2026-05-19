from __future__ import annotations

from fastapi.testclient import TestClient


def test_society_resource_search_returns_context_only(client: TestClient) -> None:
    res = client.post(
        "/api/v1/society-resources/search",
        json={
            "query": "rTMS conference abstracts",
            "condition": "depression",
            "modality": "neuromodulation",
        },
    )
    assert res.status_code == 200
    body = res.json()

    assert body["structured_search_available"] is False
    assert body["matched_resources"] == []
    assert len(body["source_statuses"]) == 5
    assert len(body["contextual_resources"]) == 5
    assert body["decision_support_disclaimer"].startswith("Decision support only")
    assert any("structured search is unavailable" in warning.lower() for warning in body["warnings"])
    assert any("no fake conference abstracts" in limitation.lower() for limitation in body["limitations"])


def test_society_resource_search_filters_sources_honestly(client: TestClient) -> None:
    res = client.get("/api/v1/society-resources/search", params={"source": "epilepsy_foundation"})
    assert res.status_code == 200
    body = res.json()

    assert body["structured_search_available"] is False
    assert body["matched_resources"] == []
    assert len(body["source_statuses"]) == 1
    assert body["source_statuses"][0]["key"] == "epilepsy_foundation"
    assert len(body["contextual_resources"]) == 1
    assert body["contextual_resources"][0]["source_id"] == "epilepsy_foundation"
    assert body["contextual_resources"][0]["resource_type"] == "patient_resource"
    assert "patient resources are not clinical guidelines" in body["contextual_resources"][0]["limitations"][0].lower()
