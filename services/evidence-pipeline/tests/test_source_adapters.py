from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import db  # noqa: E402
from sources import crossref, semantic_scholar  # noqa: E402


def _temp_conn(tmp_path):
    db_path = tmp_path / "evidence.db"
    db.init(db_path)
    return db.connect(db_path)


def test_crossref_upsert_inserts_and_tags_source(tmp_path) -> None:
    conn = _temp_conn(tmp_path)
    try:
        count = crossref.upsert_papers(
            conn,
            [
                {
                    "DOI": "10.1000/example-crossref",
                    "title": ["Crossref metadata row"],
                    "container-title": ["Journal A"],
                    "author": [{"given": "Ada", "family": "Lovelace"}],
                    "type": "journal-article",
                    "is-referenced-by-count": 42,
                    "created": {"date-parts": [[2024, 1, 1]]},
                }
            ],
        )
        assert count == 1
        row = conn.execute("SELECT doi, title, journal, authors_json, sources_json FROM papers").fetchone()
        assert row["doi"] == "10.1000/example-crossref"
        assert row["title"] == "Crossref metadata row"
        assert row["journal"] == "Journal A"
        assert json.loads(row["authors_json"]) == ["Ada Lovelace"]
        assert json.loads(row["sources_json"]) == ["crossref"]
    finally:
        conn.close()


def test_semantic_scholar_upsert_merges_into_existing_doi_row(tmp_path) -> None:
    conn = _temp_conn(tmp_path)
    try:
        conn.execute(
            "INSERT INTO papers(doi, title, sources_json, last_ingested) VALUES (?,?,?,?)",
            ("10.1000/example-merge", "Base row", json.dumps(["pubmed"]), "2026-05-02T00:00:00Z"),
        )
        count = semantic_scholar.upsert_papers(
            conn,
            [
                {
                    "externalIds": {"DOI": "10.1000/example-merge", "PubMed": "123456"},
                    "title": "Semantic Scholar row",
                    "abstract": "Merged abstract",
                    "year": 2025,
                    "venue": "Journal B",
                    "authors": [{"name": "Grace Hopper"}],
                    "publicationTypes": ["Review"],
                    "citationCount": 17,
                    "openAccessPdf": {"url": "https://example.org/paper.pdf"},
                }
            ],
        )
        assert count == 0
        row = conn.execute(
            "SELECT pmid, abstract, cited_by_count, oa_url, is_oa, sources_json FROM papers WHERE doi=?",
            ("10.1000/example-merge",),
        ).fetchone()
        assert row["pmid"] == "123456"
        assert row["abstract"] == "Merged abstract"
        assert row["cited_by_count"] == 17
        assert row["oa_url"] == "https://example.org/paper.pdf"
        assert row["is_oa"] == 1
        assert json.loads(row["sources_json"]) == ["pubmed", "semantic_scholar"]
    finally:
        conn.close()
