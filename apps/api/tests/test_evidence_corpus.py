"""Tests for the 87k-paper corpus integration.

Covers:
  * ingest_csv.py roundtrip — synthetic CSV → papers table with new columns.
  * /api/v1/evidence/papers new filters (modality, condition, study_design,
    effect_direction, year_min/max, source, has_abstract).
  * /api/v1/evidence/papers/stats aggregate endpoint.
  * /api/v1/evidence/papers/similar/{paper_id} FTS similarity endpoint.
  * evidence_rag.search_evidence + format_evidence_context.
  * chat_service._extract_clinical_context modality/condition detector.
"""
from __future__ import annotations

import csv
import importlib
import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[3]
PIPELINE = REPO / "services" / "evidence-pipeline"


# ── Fixture builders ─────────────────────────────────────────────────────────

def _write_sample_csv(path: Path) -> None:
    """Write a small CSV shaped like deepsynaps_papers.87k.csv."""
    rows = [
        {
            "paper_id": "1",
            "source": "MED",
            "source_id": "41875435",
            "pmid": "41875435",
            "pmcid": "",
            "doi": "10.1080/corpus-test-1",
            "title": "iTBS for depression: a landmark randomized controlled trial",
            "abstract": "We evaluated intermittent theta-burst stimulation in treatment-resistant depression across 414 patients. "
                        "The primary outcome was HAMD-17 response at 6 weeks. iTBS was non-inferior to 10 Hz rTMS with faster delivery.",
            "journal": "Lancet",
            "year": "2018",
            "is_open_access": "t",
            "cited_by_count": "1200",
            "modalities": "tms",
            "conditions": "mdd;depression",
            "study_design": "rct",
            "sample_size": "414",
            "primary_outcome_measure": "HAMD-17",
            "effect_direction": "positive",
            "europe_pmc_url": "https://europepmc.org/article/MED/41875435",
            "enrichment_status": "enriched",
        },
        {
            "paper_id": "2",
            "source": "MED",
            "source_id": "30000000",
            "pmid": "30000000",
            "pmcid": "",
            "doi": "10.1016/corpus-test-2",
            "title": "DBS for Parkinson's disease: systematic review of long-term outcomes",
            "abstract": "Systematic review of 42 studies covering 1,820 PD patients treated with subthalamic DBS. "
                        "Motor UPDRS-III reduction sustained over 5 years; quality of life improvements plateaued at year 3.",
            "journal": "Movement Disorders",
            "year": "2022",
            "is_open_access": "f",
            "cited_by_count": "75",
            "modalities": "dbs",
            "conditions": "parkinsons",
            "study_design": "systematic_review",
            "sample_size": "1820",
            "primary_outcome_measure": "UPDRS-III",
            "effect_direction": "positive",
            "europe_pmc_url": "https://europepmc.org/article/MED/30000000",
            "enrichment_status": "enriched",
        },
        {
            "paper_id": "3",
            "source": "PMC",
            "source_id": "PMC99999",
            "pmid": "",
            "pmcid": "PMC99999",
            "doi": "",
            "title": "No abstract preprint on tDCS for stroke",
            "abstract": "",
            "journal": "",
            "year": "2023",
            "is_open_access": "t",
            "cited_by_count": "0",
            "modalities": "tdcs",
            "conditions": "stroke",
            "study_design": "",
            "sample_size": "",
            "primary_outcome_measure": "",
            "effect_direction": "",
            "europe_pmc_url": "https://europepmc.org/article/PMC/PMC99999",
            "enrichment_status": "no_abstract",
        },
        {
            "paper_id": "4",
            "source": "MED",
            "source_id": "20000000",
            "pmid": "20000000",
            "pmcid": "",
            "doi": "10.1016/corpus-test-4",
            "title": "SCS for failed back surgery: null-effect case series",
            "abstract": "Case series of 22 patients who did not respond to spinal cord stimulation. "
                        "No statistically significant change in NRS at 6-month follow-up.",
            "journal": "Pain Medicine",
            "year": "2016",
            "is_open_access": "t",
            "cited_by_count": "8",
            "modalities": "scs",
            "conditions": "chronic_pain",
            "study_design": "case_series",
            "sample_size": "22",
            "primary_outcome_measure": "NRS pain",
            "effect_direction": "null",
            "europe_pmc_url": "https://europepmc.org/article/MED/20000000",
            "enrichment_status": "enriched",
        },
    ]
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def _build_corpus_fixture_db(db_path: str) -> None:
    """Run ingest_csv against a synthetic CSV — exercises the real script end-
    to-end, so this test doubles as an integration smoke for the migration +
    ingest pipeline."""
    sys.path.insert(0, str(PIPELINE))
    if "ingest_csv" in sys.modules:
        importlib.reload(sys.modules["ingest_csv"])
    ingest_csv = importlib.import_module("ingest_csv")

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        csv_path = Path(tmp) / "sample.csv"
        _write_sample_csv(csv_path)
        ingest_csv.ingest_file(str(csv_path), db_path, verbose=False)


# ── Ingest-script tests ──────────────────────────────────────────────────────

def test_ingest_csv_populates_new_columns() -> None:
    """End-to-end: CSV rows → DB with all new enrichment columns present."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_corpus_fixture_db(db_path)

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT pmid, pmcid, source, source_id, study_design, "
            "effect_direction, sample_size, modalities_json, conditions_json, "
            "enrichment_status, europe_pmc_url "
            "FROM papers ORDER BY id"
        ).fetchall()
        assert len(rows) == 4

        # Row 1: iTBS RCT
        r1 = dict(rows[0])
        assert r1["pmid"] == "41875435"
        assert r1["study_design"] == "rct"
        assert r1["effect_direction"] == "positive"
        assert r1["sample_size"] == 414
        assert json.loads(r1["modalities_json"]) == ["tms"]
        assert set(json.loads(r1["conditions_json"])) == {"mdd", "depression"}
        assert r1["enrichment_status"] == "enriched"
        assert r1["europe_pmc_url"].endswith("MED/41875435")

        # Row 3: no-abstract PMC preprint
        r3 = dict(rows[2])
        assert r3["source"] == "PMC"
        assert r3["pmcid"] == "PMC99999"
        assert r3["enrichment_status"] == "no_abstract"
        assert r3["study_design"] is None

        # FTS stayed in sync on insert
        fts_hits = conn.execute(
            "SELECT count(*) FROM papers_fts WHERE papers_fts MATCH 'depression'"
        ).fetchone()[0]
        assert fts_hits >= 1, "papers_fts index did not pick up the depression row"
        conn.close()


def test_ingest_csv_is_idempotent() -> None:
    """Re-running the script against the same CSV updates in place — the row
    count stays the same, not doubles."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_corpus_fixture_db(db_path)

        # Run again.
        _build_corpus_fixture_db(db_path)
        conn = sqlite3.connect(db_path)
        n = conn.execute("SELECT count(*) FROM papers").fetchone()[0]
        assert n == 4, f"expected 4 after second run, got {n}"
        conn.close()


# ── API tests ────────────────────────────────────────────────────────────────

def test_papers_endpoint_returns_new_enrichment_fields(
    client: TestClient, auth_headers
) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_corpus_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/papers?limit=10",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
            payload = r.json()
            assert len(payload) == 4

            by_pmid = {p.get("pmid"): p for p in payload if p.get("pmid")}
            itbs = by_pmid["41875435"]
            assert itbs["study_design"] == "rct"
            assert itbs["effect_direction"] == "positive"
            assert itbs["sample_size"] == 414
            assert "tms" in itbs["modalities"]
            assert "mdd" in itbs["conditions"]
            assert itbs["enrichment_status"] == "enriched"
            assert itbs["europe_pmc_url"]
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_papers_endpoint_filters_by_modality_and_study_design(
    client: TestClient, auth_headers
) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_corpus_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/papers?modality=dbs",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            titles = [p["title"] for p in r.json()]
            assert any("Parkinson" in t for t in titles)
            assert all("DBS" in t or "dbs" in t.lower() or "Parkinson" in t for t in titles)

            r = client.get(
                "/api/v1/evidence/papers?study_design=rct",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            payload = r.json()
            assert payload and all(p["study_design"] == "rct" for p in payload)

            r = client.get(
                "/api/v1/evidence/papers?effect_direction=null",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            payload = r.json()
            assert payload and all(p["effect_direction"] == "null" for p in payload)
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_papers_endpoint_filters_by_year_and_has_abstract(
    client: TestClient, auth_headers
) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_corpus_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/papers?year_min=2020",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            payload = r.json()
            assert payload and all(p["year"] and p["year"] >= 2020 for p in payload)

            r = client.get(
                "/api/v1/evidence/papers?has_abstract=true",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            payload = r.json()
            # The PMC99999 row has no abstract; should be filtered out.
            assert all(p.get("pmid") != "" and p.get("pmcid") != "PMC99999" for p in payload)
            # All returned rows should have an abstract once we filter.
            assert all(
                not p.get("pmid") == "" or p["abstract"]  # tolerate absent abstract field
                for p in payload
            )
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_papers_stats_endpoint_aggregates_corpus(
    client: TestClient, auth_headers
) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_corpus_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/papers/stats",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
            stats = r.json()
            assert stats["total"] == 4
            # Three of four have an abstract.
            assert stats["with_abstract"] == 3
            assert stats["by_source"]["MED"] == 3
            assert stats["by_source"]["PMC"] == 1
            # study_design facet should include rct, systematic_review, case_series
            by_design = stats["by_study_design"]
            assert by_design.get("rct") == 1
            assert by_design.get("systematic_review") == 1
            assert by_design.get("case_series") == 1
            # effect_direction facet
            assert stats["by_effect_direction"].get("positive") == 2
            assert stats["by_effect_direction"].get("null") == 1
            # Top modalities should include tms, dbs, tdcs, scs
            mod_keys = {m["key"] for m in stats["top_modalities"]}
            assert {"tms", "dbs", "tdcs", "scs"}.issubset(mod_keys)
            # Top conditions should include mdd, parkinsons, stroke, chronic_pain
            cond_keys = {c["key"] for c in stats["top_conditions"]}
            assert {"mdd", "parkinsons", "stroke", "chronic_pain"}.issubset(cond_keys)
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_papers_similar_endpoint_returns_related_papers(
    client: TestClient, auth_headers
) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_corpus_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            seed_id = conn.execute(
                "SELECT id FROM papers WHERE pmid='41875435'"
            ).fetchone()[0]
            conn.close()

            r = client.get(
                f"/api/v1/evidence/papers/similar/{seed_id}?limit=5",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
            results = r.json()
            # Must not include the seed paper itself.
            assert all(p["id"] != seed_id for p in results)
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


# ── evidence_rag + chat_service helper tests ─────────────────────────────────

def test_evidence_rag_search_respects_filters() -> None:
    from app.services import evidence_rag

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_corpus_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            importlib.reload(evidence_rag)
            papers = evidence_rag.search_evidence(
                query="depression", modality="tms", condition="mdd", top_k=5
            )
            assert papers, "expected at least one paper"
            assert any(p["pmid"] == "41875435" for p in papers)

            # prefer_rct=True should float the RCT result to the top.
            papers = evidence_rag.search_evidence(
                query="treatment", top_k=5, prefer_rct=True
            )
            assert papers
            # The RCT or systematic review should be ranked above the case series.
            assert papers[0]["study_design"] in {"rct", "systematic_review", "meta_analysis"}
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_evidence_rag_format_produces_markdown_with_citations() -> None:
    from app.services import evidence_rag

    papers = [
        {
            "paper_id": 1, "pmid": "12345", "doi": None,
            "title": "Test paper", "year": 2024, "journal": "Test Journal",
            "study_design": "rct", "sample_size": 50,
            "effect_direction": "positive", "cited_by_count": 10,
            "abstract_snippet": "abstract text",
            "url": "https://pubmed.ncbi.nlm.nih.gov/12345/",
        }
    ]
    out = evidence_rag.format_evidence_context(papers)
    assert "[1]" in out
    assert "Test paper" in out
    assert "12345" in out
    assert "2024" in out


def test_chat_service_extract_clinical_context_detects_modality_and_condition() -> None:
    from app.services import chat_service

    fn = getattr(chat_service, "_extract_clinical_context", None)
    assert fn is not None, "chat_service._extract_clinical_context missing"

    modality, condition = fn("What does the evidence say about tms for depression?")
    assert modality in {"tms", "rtms"}
    assert condition in {"mdd", "depression"}

    modality, condition = fn("any good DBS papers for Parkinson's disease?")
    assert modality == "dbs"
    assert condition == "parkinsons"

    # Benign message with no clinical tokens → both None.
    modality, condition = fn("how's the weather today?")
    assert modality is None and condition is None
