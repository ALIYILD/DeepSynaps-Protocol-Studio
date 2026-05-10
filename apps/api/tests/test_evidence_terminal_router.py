from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


PIPELINE = Path(__file__).resolve().parents[3] / "services" / "evidence-pipeline"


def _build_terminal_fixture_db(path: str, *, with_protocols: bool = True) -> None:
    with open(PIPELINE / "schema.sql", encoding="utf-8") as handle:
        schema = handle.read()
    conn = sqlite3.connect(path)
    conn.executescript(schema)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)"
    )
    with open(PIPELINE / "migrations" / "009_paper_trial_links.sql", encoding="utf-8") as handle:
        conn.executescript(handle.read())
    with open(PIPELINE / "migrations" / "011_indications_computed_grade.sql", encoding="utf-8") as handle:
        conn.executescript(handle.read())
    if with_protocols:
        with open(PIPELINE / "migrations" / "006_protocols_table.sql", encoding="utf-8") as handle:
            conn.executescript(handle.read())

    conn.execute(
        "INSERT INTO indications(slug, label, modality, condition, evidence_grade, regulatory, computed_evidence_grade) "
        "VALUES ('rtms_mdd', 'rTMS for MDD', 'rTMS', 'Major depressive disorder', 'A', 'FDA-cleared 2008', 'A')"
    )
    conn.execute(
        "INSERT INTO indications(slug, label, modality, condition, evidence_grade, regulatory, computed_evidence_grade) "
        "VALUES ('tdcs_pain', 'tDCS for pain', 'tDCS', 'Chronic pain', 'C', NULL, 'C')"
    )
    rtms_id = conn.execute("SELECT id FROM indications WHERE slug='rtms_mdd'").fetchone()[0]
    tdcs_id = conn.execute("SELECT id FROM indications WHERE slug='tdcs_pain'").fetchone()[0]

    conn.execute(
        "INSERT INTO papers(pmid, doi, title, abstract, year, journal, authors_json, pub_types_json, cited_by_count, is_oa, oa_url, sources_json, last_ingested) "
        "VALUES ('29726344', '10.1016/example1', 'THREE-D iTBS non-inferiority RCT', "
        "'Landmark rTMS trial with NCT01804270 linkage.', 2018, 'Lancet', '[\"Blumberger DM\"]', "
        "'[\"Randomized Controlled Trial\"]', 1249, 1, 'https://example.org/three-d.pdf', '[\"pubmed\"]', '2026-05-10T00:00:00Z')"
    )
    conn.execute(
        "INSERT INTO papers(pmid, doi, title, abstract, year, journal, authors_json, pub_types_json, cited_by_count, is_oa, oa_url, sources_json, last_ingested) "
        "VALUES ('30000000', NULL, 'Pilot tDCS study for pain', NULL, 2019, 'Pain Journal', '[\"Doe A\"]', '[\"Clinical Trial\"]', 14, 0, NULL, '[\"pubmed\"]', '2026-05-09T00:00:00Z')"
    )
    paper_ids = [row[0] for row in conn.execute("SELECT id FROM papers ORDER BY id").fetchall()]
    conn.execute("INSERT INTO paper_indications(paper_id, indication_id, relevance) VALUES (?, ?, ?)", (paper_ids[0], rtms_id, 0.98))
    conn.execute("INSERT INTO paper_indications(paper_id, indication_id, relevance) VALUES (?, ?, ?)", (paper_ids[1], tdcs_id, 0.61))

    conn.execute(
        "INSERT INTO trials(nct_id, title, phase, status, enrollment, conditions_json, interventions_json, outcomes_json, brief_summary, start_date, last_update, sponsor, raw_json) "
        "VALUES ('NCT01804270', 'THREE-D iTBS', 'PHASE3', 'COMPLETED', 414, '[\"Depression\"]', '[{\"name\":\"iTBS L-DLPFC\"}]', '[]', 'iTBS vs 10Hz', '2013-04-01', '2018-04-26', 'CAMH', '{}')"
    )
    conn.execute(
        "INSERT INTO trials(nct_id, title, phase, status, enrollment, conditions_json, interventions_json, outcomes_json, brief_summary, start_date, last_update, sponsor, raw_json) "
        "VALUES ('NCT09999999', 'Pain pilot', 'PHASE2', 'RECRUITING', 40, '[\"Chronic pain\"]', '[{\"name\":\"tDCS M1\"}]', '[]', 'Pain pilot', '2025-01-01', '2026-03-01', 'Pain Lab', '{}')"
    )
    trial_ids = [row[0] for row in conn.execute("SELECT id FROM trials ORDER BY id").fetchall()]
    conn.execute("INSERT INTO trial_indications(trial_id, indication_id) VALUES (?, ?)", (trial_ids[0], rtms_id))
    conn.execute("INSERT INTO trial_indications(trial_id, indication_id) VALUES (?, ?)", (trial_ids[1], tdcs_id))
    conn.execute(
        "INSERT INTO paper_trial_links(paper_id, trial_id, nct_id, source) VALUES (?, ?, ?, ?)",
        (paper_ids[0], trial_ids[0], "NCT01804270", "paper_abstract_nct_regex"),
    )
    if with_protocols:
        conn.execute(
            "INSERT INTO protocols(indication_id, source_type, source_id, arm_label, modality, target_anatomy, frequency_hz, total_sessions, confidence, notes, raw_text) "
            "VALUES (?, 'ctgov', 'NCT01804270', 'iTBS arm', 'rTMS', 'L-DLPFC', 50.0, 30, 'high', 'Extractor summary', '50 Hz iTBS arm')",
            (rtms_id,),
        )

    conn.commit()
    conn.close()


def test_terminal_status_and_overview_return_structured_metrics(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_terminal_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            status_resp = client.get("/api/v1/evidence/terminal/status")
            assert status_resp.status_code == 200, status_resp.text
            status_body = status_resp.json()
            assert status_body["db_available"] is True
            assert status_body["counts"]["papers"] == 2
            assert status_body["counts"]["papers_with_abstracts"] == 1
            assert "clinical/research decision support only" in status_body["safety_disclaimer"].lower()

            overview_resp = client.get("/api/v1/evidence/terminal/overview", headers=auth_headers["clinician"])
            assert overview_resp.status_code == 200, overview_resp.text
            overview = overview_resp.json()
            assert overview["counts"]["protocols"] == 1
            assert overview["top_indications_by_paper_count"][0]["indication_id"] == "rtms_mdd"
            assert all("recommend" not in str(item).lower() for item in overview["flagship_indications"])
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_terminal_paper_search_and_detail_are_honest(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_terminal_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            search_resp = client.get(
                "/api/v1/evidence/terminal/papers/search?q=iTBS&linked_to_trial=true&limit=10&offset=0",
                headers=auth_headers["clinician"],
            )
            assert search_resp.status_code == 200, search_resp.text
            body = search_resp.json()
            assert body["total"] == 1
            result = body["results"][0]
            assert result["pmid"] == "29726344"
            assert result["doi"] == "10.1016/example1"
            assert result["linked_trials_count"] == 1
            assert result["linked_protocols_count"] == 1
            assert "Landmark rTMS trial" in result["abstract_snippet"]

            detail_resp = client.get("/api/v1/evidence/terminal/papers/2", headers=auth_headers["clinician"])
            assert detail_resp.status_code == 200, detail_resp.text
            detail = detail_resp.json()
            assert detail["paper_id"] == 2
            assert detail["abstract"] is None
            assert "Abstract not available in local database" in detail["safety_caveats"]
            assert detail["pmid"] == "30000000"
            assert detail["doi"] is None
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_terminal_protocol_and_network_endpoints_are_bounded(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_terminal_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            protocol_resp = client.get(
                "/api/v1/evidence/terminal/protocols/search?indication=rtms_mdd&limit=10&offset=0",
                headers=auth_headers["clinician"],
            )
            assert protocol_resp.status_code == 200, protocol_resp.text
            protocol_body = protocol_resp.json()
            assert protocol_body["total"] == 1
            protocol_row = protocol_body["results"][0]
            assert protocol_row["source_id"] == "NCT01804270"
            assert protocol_row["linked_trial_nct_ids"] == ["NCT01804270"]
            assert "verification" in protocol_row["safety_caveat"].lower()

            network_resp = client.get(
                "/api/v1/evidence/terminal/network?indication=rtms_mdd&max_nodes=4",
                headers=auth_headers["clinician"],
            )
            assert network_resp.status_code == 200, network_resp.text
            network = network_resp.json()
            assert len(network["nodes"]) <= 4
            assert any(node["type"] == "indication" for node in network["nodes"])
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_terminal_handles_unavailable_db_safely(client: TestClient, auth_headers) -> None:
    os.environ["EVIDENCE_DB_PATH"] = str(Path(tempfile.gettempdir()) / "missing-evidence-terminal.db")
    try:
        status_resp = client.get("/api/v1/evidence/terminal/status")
        assert status_resp.status_code == 200, status_resp.text
        assert status_resp.json()["db_available"] is False

        overview_resp = client.get("/api/v1/evidence/terminal/overview", headers=auth_headers["clinician"])
        assert overview_resp.status_code == 503

        search_resp = client.get("/api/v1/evidence/terminal/papers/search?q=%28", headers=auth_headers["clinician"])
        assert search_resp.status_code == 503
    finally:
        os.environ.pop("EVIDENCE_DB_PATH", None)
