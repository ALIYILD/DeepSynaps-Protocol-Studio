from __future__ import annotations


def test_literature_local_knowledge_endpoint_returns_summary(client, auth_headers) -> None:
    resp = client.get(
        "/api/v1/literature/local-knowledge",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["summary"]["resource_count"] >= 3
    assert isinstance(body["items"], list)


def test_literature_local_knowledge_endpoint_searches_imported_corpus(client, auth_headers) -> None:
    resp = client.get(
        "/api/v1/literature/local-knowledge?q_text=artifact&limit=5",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
