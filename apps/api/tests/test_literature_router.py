"""Tests for literature_router — /api/v1/literature.

Covers:
  - list papers: auth gate + empty result shape
  - add paper: happy path + missing title 422
  - get paper by id: happy path + 404
  - curate paper: mark-relevant, idempotent update
  - tag-protocol: idempotent tagging
  - reading list: add, list, remove, 404 on missing
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
NO_AUTH: dict = {}


# ── helpers ───────────────────────────────────────────────────────────────────

def _create_paper(title: str = "Test RCT Paper") -> dict:
    r = client.post(
        "/api/v1/literature",
        json={
            "title": title,
            "authors": "Smith J et al.",
            "journal": "Brain Stim",
            "year": 2023,
            "modality": "tDCS",
            "condition": "mdd",
            "evidence_grade": "A",
            "study_type": "RCT",
        },
        headers=CLINICIAN,
    )
    assert r.status_code == 201, r.text
    return r.json()


# ── auth gates ─────────────────────────────────────────────────────────────────

def test_list_papers_requires_auth():
    r = client.get("/api/v1/literature")
    assert r.status_code == 403


def test_add_paper_requires_auth():
    r = client.post("/api/v1/literature", json={"title": "X"})
    assert r.status_code == 403


# ── list papers ────────────────────────────────────────────────────────────────

def test_list_papers_empty_db():
    r = client.get("/api/v1/literature", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert body["total"] == 0


def test_list_papers_returns_added_paper():
    _create_paper("Unique FilterPaper")
    r = client.get("/api/v1/literature", params={"q_text": "FilterPaper"}, headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert body["items"][0]["title"] == "Unique FilterPaper"


def test_list_papers_filter_by_modality():
    _create_paper("tDCS Depression Study")
    r = client.get("/api/v1/literature", params={"modality": "tDCS"}, headers=CLINICIAN)
    assert r.status_code == 200
    assert r.json()["total"] >= 1


# ── add paper ─────────────────────────────────────────────────────────────────

def test_add_paper_happy_path():
    paper = _create_paper()
    assert "id" in paper
    assert paper["title"] == "Test RCT Paper"
    assert paper["evidence_grade"] == "A"
    assert isinstance(paper["tags"], list)


def test_add_paper_missing_title_422():
    r = client.post(
        "/api/v1/literature",
        json={"authors": "Anonymous"},
        headers=CLINICIAN,
    )
    assert r.status_code == 422


# ── get paper ─────────────────────────────────────────────────────────────────

def test_get_paper_happy_path():
    paper = _create_paper("Individual Paper")
    r = client.get(f"/api/v1/literature/{paper['id']}", headers=CLINICIAN)
    assert r.status_code == 200
    assert r.json()["id"] == paper["id"]


def test_get_paper_not_found_404():
    r = client.get("/api/v1/literature/nonexistent-paper-id", headers=CLINICIAN)
    assert r.status_code == 404


# ── curate paper ──────────────────────────────────────────────────────────────

def test_curate_paper_mark_relevant():
    r = client.post(
        "/api/v1/literature/papers/pmid-12345/curate",
        json={"action": "mark-relevant"},
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["pmid"] == "pmid-12345"
    assert body["action"] == "mark-relevant"


def test_curate_paper_idempotent_update():
    client.post(
        "/api/v1/literature/papers/pmid-99999/curate",
        json={"action": "mark-relevant"},
        headers=CLINICIAN,
    )
    r = client.post(
        "/api/v1/literature/papers/pmid-99999/curate",
        json={"action": "not-relevant", "note": "On reflection, out of scope."},
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    assert r.json()["action"] == "not-relevant"


def test_curate_paper_invalid_action_422():
    r = client.post(
        "/api/v1/literature/papers/pmid-11111/curate",
        json={"action": "invalid-action"},
        headers=CLINICIAN,
    )
    assert r.status_code == 422


# ── tag protocol ──────────────────────────────────────────────────────────────

def test_tag_protocol_happy_path():
    paper = _create_paper("Tagging Target Paper")
    r = client.post(
        "/api/v1/literature/tag-protocol",
        json={"paper_id": paper["id"], "protocol_id": "proto-tdcs-001"},
        headers=CLINICIAN,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["paper_id"] == paper["id"]
    assert body["protocol_id"] == "proto-tdcs-001"


def test_tag_protocol_idempotent():
    paper = _create_paper("Idempotent Tag Paper")
    payload = {"paper_id": paper["id"], "protocol_id": "proto-tdcs-002"}
    r1 = client.post("/api/v1/literature/tag-protocol", json=payload, headers=CLINICIAN)
    r2 = client.post("/api/v1/literature/tag-protocol", json=payload, headers=CLINICIAN)
    assert r1.status_code == 201
    # Second call is idempotent — same id returned.
    assert r2.json()["id"] == r1.json()["id"]


def test_tag_protocol_missing_paper_404():
    r = client.post(
        "/api/v1/literature/tag-protocol",
        json={"paper_id": "no-such-paper", "protocol_id": "proto-001"},
        headers=CLINICIAN,
    )
    assert r.status_code == 404


# ── reading list ──────────────────────────────────────────────────────────────

def test_reading_list_empty():
    r = client.get("/api/v1/literature/reading-list", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0


def test_reading_list_add_and_list():
    paper = _create_paper("Reading List Paper")
    r = client.post(f"/api/v1/literature/reading-list/{paper['id']}", headers=CLINICIAN)
    assert r.status_code == 201
    body = r.json()
    assert body["paper_id"] == paper["id"]

    r_list = client.get("/api/v1/literature/reading-list", headers=CLINICIAN)
    assert r_list.json()["total"] == 1


def test_reading_list_remove():
    paper = _create_paper("Remove List Paper")
    client.post(f"/api/v1/literature/reading-list/{paper['id']}", headers=CLINICIAN)
    r = client.delete(f"/api/v1/literature/reading-list/{paper['id']}", headers=CLINICIAN)
    assert r.status_code == 204

    r_list = client.get("/api/v1/literature/reading-list", headers=CLINICIAN)
    assert r_list.json()["total"] == 0


def test_reading_list_remove_not_found_404():
    r = client.delete("/api/v1/literature/reading-list/no-such-paper", headers=CLINICIAN)
    assert r.status_code == 404
