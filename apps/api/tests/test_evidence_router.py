"""Tests for /api/v1/evidence/*.

Covers the path where evidence.db is MISSING (503 with a clear message —
the doctor-facing failure mode), the path where it is PRESENT but empty
(200 with empty arrays), and auth gating. A tiny fixture SQLite DB is
built in-test so we don't depend on a live ingest.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

PIPELINE = Path(__file__).resolve().parents[3] / "services" / "evidence-pipeline"


def _build_fixture_db(path: str) -> None:
    """Create a minimal evidence.db with one indication + one paper + one trial."""
    with open(PIPELINE / "schema.sql") as f:
        schema = f.read()
    conn = sqlite3.connect(path)
    conn.executescript(schema)
    conn.execute(
        "INSERT INTO indications(slug, label, modality, condition, evidence_grade, regulatory) "
        "VALUES ('rtms_mdd', 'rTMS for MDD', 'rTMS', 'Major depressive disorder', 'A', 'FDA-cleared 2008')"
    )
    ind_id = conn.execute("SELECT id FROM indications WHERE slug='rtms_mdd'").fetchone()[0]
    conn.execute(
        "INSERT INTO papers(pmid, doi, title, abstract, year, journal, authors_json, "
        "pub_types_json, cited_by_count, is_oa, oa_url, sources_json, last_ingested) "
        "VALUES ('29726344', '10.1016/s0140-6736(18)30295-2', "
        "'THREE-D: iTBS non-inferiority RCT', 'Landmark rTMS RCT.', 2018, 'Lancet', "
        "'[\"Blumberger DM\"]', '[\"Randomized Controlled Trial\"]', 1249, 1, "
        "'https://example/pdf', '[\"pubmed\"]', '2026-04-12T00:00:00Z')"
    )
    paper_id = conn.execute("SELECT id FROM papers LIMIT 1").fetchone()[0]
    conn.execute(
        "INSERT INTO paper_indications(paper_id, indication_id) VALUES (?, ?)",
        (paper_id, ind_id),
    )
    conn.execute(
        "INSERT INTO trials(nct_id, title, phase, status, enrollment, conditions_json, "
        "interventions_json, outcomes_json, brief_summary, raw_json) "
        "VALUES ('NCT00000000', 'Test trial', 'PHASE3', 'COMPLETED', 100, "
        "'[\"Depression\"]', '[{\"name\":\"10Hz rTMS L-DLPFC\"}]', '[]', 'Summary', '{}')"
    )
    trial_id = conn.execute("SELECT id FROM trials WHERE nct_id='NCT00000000'").fetchone()[0]
    conn.execute(
        "INSERT INTO trial_indications(trial_id, indication_id) VALUES (?, ?)",
        (trial_id, ind_id),
    )
    conn.commit()
    conn.close()


def test_evidence_health_returns_503_when_db_missing(client: TestClient, auth_headers) -> None:
    # Point EVIDENCE_DB_PATH at a non-existent file.
    with tempfile.TemporaryDirectory() as tmp:
        missing = Path(tmp) / "nope.db"
        os.environ["EVIDENCE_DB_PATH"] = str(missing)
        r = client.get("/api/v1/evidence/health", headers=auth_headers["clinician"])
        assert r.status_code == 503
        assert "ingest" in r.json()["detail"].lower() or "not found" in r.json()["detail"].lower()
    os.environ.pop("EVIDENCE_DB_PATH", None)


def test_evidence_endpoints_work_with_fixture_db(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get("/api/v1/evidence/health", headers=auth_headers["clinician"])
            assert r.status_code == 200, r.text
            counts = r.json()["counts"]
            assert counts["papers"] == 1
            assert counts["indications"] == 1

            r = client.get("/api/v1/evidence/indications", headers=auth_headers["clinician"])
            assert r.status_code == 200
            inds = r.json()
            assert len(inds) == 1 and inds[0]["slug"] == "rtms_mdd"

            r = client.get(
                "/api/v1/evidence/papers?indication=rtms_mdd&limit=5",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            papers = r.json()
            assert papers and papers[0]["pmid"] == "29726344"
            assert "Randomized Controlled Trial" in papers[0]["pub_types"]

            r = client.get(
                "/api/v1/evidence/trials?indication=rtms_mdd",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            trials = r.json()
            assert trials and trials[0]["nct_id"] == "NCT00000000"
            assert trials[0]["interventions"][0]["name"].startswith("10Hz rTMS")
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_evidence_health_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/evidence/health")
    assert r.status_code in (401, 403), r.text


def test_evidence_papers_filters_oa_only(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/papers?indication=rtms_mdd&oa_only=true",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            papers = r.json()
            assert all(p["is_oa"] for p in papers)
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)
