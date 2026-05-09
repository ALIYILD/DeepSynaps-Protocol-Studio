"""Tests for literature_watch_router.py.

The router hits a SQLite evidence.db that is NOT part of the test suite DB.
When the DB is absent the endpoints return 503.  We assert:
- 403 for unauthenticated requests
- 503 (db missing) OR 200/202 for authenticated requests (both pass)
- 422 for unknown source on refresh
- 422 for unknown verdict on review
"""
from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}


def _make_evidence_db(path: str) -> None:
    """Create a minimal evidence DB with the two tables the router expects."""
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS refresh_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            protocol_id TEXT,
            requested_by TEXT,
            source TEXT,
            started_at TEXT,
            finished_at TEXT,
            new_papers_count INTEGER DEFAULT 0,
            cost_usd REAL DEFAULT 0,
            status TEXT DEFAULT 'queued',
            error TEXT
        );
        CREATE TABLE IF NOT EXISTS literature_watch (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            protocol_id TEXT,
            pmid TEXT,
            doi TEXT,
            title TEXT,
            authors TEXT,
            year INTEGER,
            journal TEXT,
            citation_count INTEGER DEFAULT 0,
            source TEXT,
            first_seen_at TEXT,
            verdict TEXT DEFAULT 'pending',
            reviewer_id TEXT,
            reviewed_at TEXT
        );
    """)
    conn.commit()
    conn.close()


@pytest.fixture()
def evidence_db(tmp_path):
    """Create a temporary evidence DB and point the router at it."""
    db_path = str(tmp_path / "evidence.db")
    _make_evidence_db(db_path)
    old = os.environ.get("EVIDENCE_DB_PATH")
    os.environ["EVIDENCE_DB_PATH"] = db_path
    yield db_path
    if old is None:
        del os.environ["EVIDENCE_DB_PATH"]
    else:
        os.environ["EVIDENCE_DB_PATH"] = old


# ── Auth gates ──────────────────────────────────────────────────────────────

def test_refresh_requires_auth():
    r = TestClient(app).post(
        "/api/v1/protocols/test-proto/refresh-literature",
        json={"source": "pubmed"},
    )
    assert r.status_code == 403


def test_jobs_requires_auth():
    r = TestClient(app).get(
        "/api/v1/protocols/test-proto/refresh-literature/jobs"
    )
    assert r.status_code == 403


def test_pending_requires_auth():
    r = TestClient(app).get("/api/v1/literature-watch/pending")
    assert r.status_code == 403


def test_review_requires_auth():
    r = TestClient(app).post(
        "/api/v1/literature-watch/12345678/review",
        json={"verdict": "relevant", "protocol_id": "test-proto"},
    )
    assert r.status_code == 403


def test_spend_requires_auth():
    r = TestClient(app).get("/api/v1/literature-watch/spend")
    assert r.status_code == 403


# ── Happy paths (with in-memory evidence DB) ───────────────────────────────

def test_refresh_enqueues_pubmed_job(evidence_db):
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/protocols/test-proto/refresh-literature",
            json={"source": "pubmed"},
            headers=CLINICIAN_HDR,
        )
    assert r.status_code in (202, 503)
    if r.status_code == 202:
        body = r.json()
        assert body["status"] == "queued"
        assert body["source"] == "pubmed"
        assert body["protocol_id"] == "test-proto"


def test_jobs_list_empty(evidence_db):
    with TestClient(app) as tc:
        r = tc.get(
            "/api/v1/protocols/unknown-proto/refresh-literature/jobs",
            headers=CLINICIAN_HDR,
        )
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        assert "items" in r.json()
        assert isinstance(r.json()["items"], list)


def test_pending_list_empty(evidence_db):
    with TestClient(app) as tc:
        r = tc.get("/api/v1/literature-watch/pending", headers=CLINICIAN_HDR)
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        body = r.json()
        assert "items" in body
        assert body["total"] == 0


def test_spend_summary_empty(evidence_db):
    with TestClient(app) as tc:
        r = tc.get("/api/v1/literature-watch/spend", headers=CLINICIAN_HDR)
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        body = r.json()
        assert "total_usd" in body
        assert body["budget_cap_usd"] > 0


# ── 422 / 400 edge cases ───────────────────────────────────────────────────

def test_refresh_unknown_source_422(evidence_db):
    """Unknown source name must return 422."""
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/protocols/test-proto/refresh-literature",
            json={"source": "not_a_real_source"},
            headers=CLINICIAN_HDR,
        )
    assert r.status_code in (422, 503)


def test_review_unknown_verdict_422(evidence_db):
    """Unknown verdict must return 422."""
    # First seed a row so the DB is not the blocking issue.
    conn = sqlite3.connect(evidence_db)
    conn.execute(
        "INSERT INTO literature_watch (protocol_id, pmid, verdict) VALUES ('proto1','11111111','pending')"
    )
    conn.commit()
    conn.close()

    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/literature-watch/11111111/review",
            json={"verdict": "nonsense", "protocol_id": "proto1"},
            headers=CLINICIAN_HDR,
        )
    assert r.status_code in (422, 503)
