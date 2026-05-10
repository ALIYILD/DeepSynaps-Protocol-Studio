from __future__ import annotations

import importlib.util
import sqlite3
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "extract_protocols.py"
spec = importlib.util.spec_from_file_location("extract_protocols", MODULE_PATH)
extract_protocols = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(extract_protocols)

LONG_ABSTRACT = (
    "10 Hz rTMS with 3000 pulses across 20 sessions was delivered to participants "
    "in a structured stimulation protocol with repeated treatment visits."
)


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE indications (
          id INTEGER PRIMARY KEY,
          slug TEXT,
          modality TEXT
        );
        CREATE TABLE papers (
          id INTEGER PRIMARY KEY,
          pmid TEXT,
          doi TEXT,
          title TEXT,
          abstract TEXT
        );
        CREATE TABLE paper_indications (
          paper_id INTEGER,
          indication_id INTEGER,
          relevance REAL
        );
        CREATE TABLE trials (
          id INTEGER PRIMARY KEY,
          nct_id TEXT,
          interventions_json TEXT
        );
        CREATE TABLE trial_indications (
          trial_id INTEGER,
          indication_id INTEGER
        );
        """
    )
    conn.executescript(extract_protocols.SCHEMA)
    return conn


def test_extract_from_papers_only_keeps_routed_papers_and_assigns_best_indication() -> None:
    conn = _conn()
    conn.execute("INSERT INTO indications(id, slug, modality) VALUES (1, 'rtms_mdd', 'rTMS')")
    conn.execute(
        "INSERT INTO papers(id, pmid, doi, title, abstract) VALUES (1, '123', NULL, 'alpha', ?)",
        (LONG_ABSTRACT,),
    )
    conn.execute(
        "INSERT INTO papers(id, pmid, doi, title, abstract) VALUES (2, '456', NULL, 'beta', ?)",
        (LONG_ABSTRACT,),
    )
    conn.execute("INSERT INTO paper_indications(paper_id, indication_id, relevance) VALUES (1, 1, 0.9)")

    written = extract_protocols._extract_from_papers(conn, None, False)
    rows = [
        tuple(row)
        for row in conn.execute(
        "SELECT source_id, indication_id FROM protocols WHERE source_type='paper' ORDER BY source_id"
        ).fetchall()
    ]

    assert written == 1
    assert rows == [("123", 1)]


def test_backfill_and_prune_protocols_repairs_paper_and_ctgov_orphans() -> None:
    conn = _conn()
    conn.execute("INSERT INTO indications(id, slug, modality) VALUES (1, 'rtms_mdd', 'rTMS')")
    conn.execute(
        "INSERT INTO papers(id, pmid, doi, title, abstract) VALUES (1, NULL, '10.1000/test', 'alpha', ?)",
        (LONG_ABSTRACT,),
    )
    conn.execute("INSERT INTO paper_indications(paper_id, indication_id, relevance) VALUES (1, 1, 0.8)")
    conn.execute("INSERT INTO trials(id, nct_id, interventions_json) VALUES (1, 'NCT00000001', '[]')")
    conn.execute("INSERT INTO trial_indications(trial_id, indication_id) VALUES (1, 1)")
    conn.execute(
        "INSERT INTO protocols(indication_id, source_type, source_id, arm_label) VALUES (NULL, 'paper', '10.1000/test', 'abstract')"
    )
    conn.execute(
        "INSERT INTO protocols(indication_id, source_type, source_id, arm_label) VALUES (NULL, 'paper', '10.1000/miss', 'abstract')"
    )
    conn.execute(
        "INSERT INTO protocols(indication_id, source_type, source_id, arm_label) VALUES (NULL, 'ctgov', 'NCT00000001', 'arm_a')"
    )

    assert extract_protocols._backfill_protocol_indications(conn, "paper") == 1
    assert extract_protocols._prune_orphan_protocols(conn, "paper") == 1
    assert extract_protocols._backfill_protocol_indications(conn, "ctgov") == 1
    assert extract_protocols._prune_orphan_protocols(conn, "ctgov") == 0

    rows = [
        tuple(row)
        for row in conn.execute(
        "SELECT source_type, source_id, indication_id FROM protocols ORDER BY source_type, source_id"
        ).fetchall()
    ]
    assert rows == [
        ("ctgov", "NCT00000001", 1),
        ("paper", "10.1000/test", 1),
    ]
