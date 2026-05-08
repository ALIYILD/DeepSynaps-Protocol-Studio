"""Tests for the per-indication shortcut endpoints added in
feat/evidence-ui-wiring (PR for evidence DB → Studio UI wiring).

Covers:
* GET /api/v1/evidence/indications/summary — list with counts
* GET /api/v1/evidence/indications/{slug}/detail — single-call bundle
* GET /api/v1/evidence/indications/{slug}/papers — top papers via JOIN
* GET /api/v1/evidence/indications/{slug}/trials — trials via JOIN
* GET /api/v1/evidence/indications/{slug}/devices — devices via JOIN
* GET /api/v1/evidence/indications/{slug}/protocols — protocols by indication_id
* GET /api/v1/evidence/search — FTS5 query
* Auth gating — guest can't read

A tiny fixture SQLite DB is built in-test so we don't depend on a live
ingest. Counts and shapes are asserted against the fixture, not the prod
DB; the prod DB is exercised separately by the deepsynaps-evidence MCP.
"""
from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

PIPELINE = Path(__file__).resolve().parents[3] / "services" / "evidence-pipeline"


def _build_fixture_db(path: str) -> None:
    """Create an evidence.db with 2 indications, papers, trials, devices,
    and protocols (matching the curated v4 schema). Mirrors the fixture
    pattern in test_evidence_router.py but adds device_indications +
    protocols rows so the new endpoints have something to JOIN against.
    """
    with open(PIPELINE / "schema.sql") as f:
        schema = f.read()
    conn = sqlite3.connect(path)
    conn.executescript(schema)
    conn.executescript(
        "CREATE TABLE IF NOT EXISTS schema_migrations "
        "(filename TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"
    )
    for migration in sorted((PIPELINE / "migrations").glob("*.sql")):
        with open(migration, encoding="utf-8") as mf:
            conn.executescript(mf.read())

    # Two indications — one with full curation, one totally empty (to
    # exercise the fts_fallback empty-state path).
    conn.execute(
        "INSERT INTO indications(slug, label, modality, condition, evidence_grade, regulatory) "
        "VALUES ('rtms_mdd', 'rTMS for MDD', 'rTMS', 'Major depressive disorder', 'A', 'FDA-cleared 2008')"
    )
    conn.execute(
        "INSERT INTO indications(slug, label, modality, condition, evidence_grade, regulatory) "
        "VALUES ('tdcs_pain', 'tDCS for chronic pain', 'tDCS', 'Chronic pain', 'C', NULL)"
    )
    rtms_id = conn.execute("SELECT id FROM indications WHERE slug='rtms_mdd'").fetchone()[0]

    # Two papers, one OA + highly cited (THREE-D), one less cited.
    conn.execute(
        "INSERT INTO papers(pmid, doi, title, abstract, year, journal, authors_json, "
        "pub_types_json, cited_by_count, is_oa, oa_url, sources_json, last_ingested) "
        "VALUES ('29726344', '10.1016/s0140-6736(18)30295-2', "
        "'THREE-D iTBS non-inferiority RCT', 'Landmark rTMS RCT.', 2018, 'Lancet', "
        "'[\"Blumberger DM\"]', '[\"Randomized Controlled Trial\"]', 1249, 1, "
        "'https://example.org/three-d.pdf', '[\"pubmed\"]', '2026-04-12T00:00:00Z')"
    )
    conn.execute(
        "INSERT INTO papers(pmid, doi, title, abstract, year, journal, authors_json, "
        "pub_types_json, cited_by_count, is_oa, oa_url, sources_json, last_ingested) "
        "VALUES ('19833552', '10.1001/archgenpsychiatry.2009.45', "
        "'Active vs sham rTMS for depression', 'Original RCT.', 2010, 'Arch Gen Psych', "
        "'[\"OReardon JP\"]', '[\"Randomized Controlled Trial\"]', 412, 0, NULL, "
        "'[\"pubmed\"]', '2026-04-12T00:00:00Z')"
    )
    p_three_d, p_oreardon = [
        r[0] for r in conn.execute("SELECT id FROM papers ORDER BY id").fetchall()
    ]
    conn.execute(
        "INSERT INTO paper_indications(paper_id, indication_id) VALUES (?, ?)",
        (p_three_d, rtms_id),
    )
    conn.execute(
        "INSERT INTO paper_indications(paper_id, indication_id) VALUES (?, ?)",
        (p_oreardon, rtms_id),
    )

    # One trial.
    conn.execute(
        "INSERT INTO trials(nct_id, title, phase, status, enrollment, conditions_json, "
        "interventions_json, outcomes_json, brief_summary, raw_json, last_update) "
        "VALUES ('NCT01837353', 'THREE-D iTBS', 'PHASE3', 'COMPLETED', 414, "
        "'[\"Depression\"]', '[{\"name\":\"iTBS L-DLPFC\"}]', '[]', 'iTBS vs 10Hz', '{}', "
        "'2018-04-26')"
    )
    t_id = conn.execute("SELECT id FROM trials").fetchone()[0]
    conn.execute(
        "INSERT INTO trial_indications(trial_id, indication_id) VALUES (?, ?)",
        (t_id, rtms_id),
    )

    # Two devices — one accepted (NeuroStar), one rejected (should not show).
    conn.execute(
        "INSERT INTO devices(kind, number, applicant, trade_name, product_code, "
        "decision_date, raw_json, curation_status) "
        "VALUES ('510k', 'K083538', 'Neuronetics', 'NeuroStar', 'OBP', "
        "'2008-10-08', '{}', 'accept')"
    )
    conn.execute(
        "INSERT INTO devices(kind, number, applicant, trade_name, product_code, "
        "decision_date, raw_json, curation_status, curation_reason) "
        "VALUES ('510k', 'K000000', 'Acme', 'NotANeuromodDevice', 'XXX', "
        "'2020-01-01', '{}', 'reject', 'wrong device class')"
    )
    d_accept, d_reject = [
        r[0] for r in conn.execute("SELECT id FROM devices ORDER BY id").fetchall()
    ]
    conn.execute(
        "INSERT INTO device_indications(device_id, indication_id) VALUES (?, ?)",
        (d_accept, rtms_id),
    )
    conn.execute(
        "INSERT INTO device_indications(device_id, indication_id) VALUES (?, ?)",
        (d_reject, rtms_id),
    )

    # Two protocols — one high-confidence, one low.
    conn.execute(
        "INSERT INTO protocols(indication_id, source_type, source_id, arm_label, "
        "modality, target_anatomy, frequency_hz, total_sessions, confidence) "
        "VALUES (?, 'ctgov', 'NCT01837353', 'iTBS arm', 'rTMS', 'L-DLPFC', "
        "50.0, 30, 'high')",
        (rtms_id,),
    )
    conn.execute(
        "INSERT INTO protocols(indication_id, source_type, source_id, arm_label, "
        "modality, target_anatomy, frequency_hz, total_sessions, confidence) "
        "VALUES (?, 'ctgov', 'NCT01837353', '10Hz arm', 'rTMS', 'L-DLPFC', "
        "10.0, 30, 'low')",
        (rtms_id,),
    )

    conn.commit()
    conn.close()


def test_indications_summary_returns_counts(client: TestClient, auth_headers) -> None:
    """List view shows 2 indications with paper / trial / device / protocol
    counts populated for the curated slug, zeros for the empty slug."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/indications/summary",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert isinstance(body, list)
            assert len(body) == 2
            by_slug = {row["slug"]: row for row in body}

            rtms = by_slug["rtms_mdd"]
            assert rtms["paper_count"] == 2
            assert rtms["trial_count"] == 1
            # Both device_indications rows are present, even though one
            # device is curation_status=reject. The /devices subroute
            # filters; the count itself is junction-table truth.
            assert rtms["device_count"] == 2
            assert rtms["protocol_count"] == 2
            assert rtms["evidence_grade"] == "A"
            assert rtms["regulatory"] == "FDA-cleared 2008"

            tdcs = by_slug["tdcs_pain"]
            assert tdcs["paper_count"] == 0
            assert tdcs["trial_count"] == 0
            assert tdcs["device_count"] == 0
            assert tdcs["protocol_count"] == 0
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_indication_detail_returns_full_bundle(client: TestClient, auth_headers) -> None:
    """Detail endpoint returns the right shape: header + papers (ranked)
    + trials + devices (rejected excluded) + protocols (high first)."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/indications/rtms_mdd/detail",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
            body = r.json()

            # Indication header.
            assert body["indication"]["slug"] == "rtms_mdd"
            assert body["indication"]["paper_count"] == 2
            assert body["fts_fallback"] is False

            # Papers — ranked, THREE-D first (more cites + OA).
            papers = body["papers"]
            assert len(papers) == 2
            assert papers[0]["pmid"] == "29726344"
            assert papers[0]["is_oa"] is True
            assert papers[0]["oa_url"] == "https://example.org/three-d.pdf"

            # Trials.
            trials = body["trials"]
            assert len(trials) == 1
            assert trials[0]["nct_id"] == "NCT01837353"
            assert trials[0]["interventions"][0]["name"] == "iTBS L-DLPFC"

            # Devices — rejected one filtered out.
            devices = body["devices"]
            assert len(devices) == 1
            assert devices[0]["trade_name"] == "NeuroStar"

            # Protocols — high confidence first.
            protocols = body["protocols"]
            assert len(protocols) == 2
            assert protocols[0]["confidence"] == "high"
            assert protocols[0]["arm_label"] == "iTBS arm"
            assert protocols[0]["indication_slug"] == "rtms_mdd"
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_indication_detail_sets_fts_fallback_when_uncurated(client: TestClient, auth_headers) -> None:
    """When paper_indications has zero rows for the slug, fts_fallback=True
    so the UI knows to render the 'no curated papers yet' empty state."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/indications/tdcs_pain/detail",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["indication"]["paper_count"] == 0
            assert body["fts_fallback"] is True
            assert body["papers"] == []
            assert body["trials"] == []
            assert body["devices"] == []
            assert body["protocols"] == []
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_indication_papers_ranks_by_score(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/indications/rtms_mdd/papers?limit=10",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            papers = r.json()
            assert [p["pmid"] for p in papers] == ["29726344", "19833552"]
            # Abstract excluded by default — keeps payload small for list view.
            assert papers[0].get("abstract") in (None, "")
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_indication_trials_404s_unknown_slug(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/indications/does_not_exist/trials",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 404
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_indication_devices_excludes_rejected(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/indications/rtms_mdd/devices",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            devices = r.json()
            assert len(devices) == 1
            assert devices[0]["trade_name"] == "NeuroStar"
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_indication_protocols_filters_by_confidence(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/indications/rtms_mdd/protocols?confidence=high",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            protocols = r.json()
            assert len(protocols) == 1
            assert protocols[0]["confidence"] == "high"
            assert protocols[0]["frequency_hz"] == 50.0
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_search_runs_fts_query(client: TestClient, auth_headers) -> None:
    """FTS search hits the papers_fts virtual table — fixture has THREE-D
    with 'iTBS non-inferiority' in the title, so the query word matches."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/search?q=iTBS&limit=5",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["query"] == "iTBS"
            assert body["total"] >= 1
            pmids = {p["pmid"] for p in body["hits"]}
            assert "29726344" in pmids
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_indications_summary_requires_clinician_role(client: TestClient, auth_headers) -> None:
    """Guest tokens are rejected — the corpus is clinician-facing data."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/indications/summary",
                headers=auth_headers["guest"],
            )
            assert r.status_code in (401, 403), r.text
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)
