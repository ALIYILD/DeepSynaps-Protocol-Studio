from __future__ import annotations

import importlib.util
import sqlite3
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "route_indications.py"
spec = importlib.util.spec_from_file_location("route_indications", MODULE_PATH)
route_indications = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(route_indications)


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE VIRTUAL TABLE papers_fts USING fts5(title, abstract)")
    conn.execute(
        "CREATE TABLE paper_indications (paper_id INTEGER, indication_id INTEGER, relevance REAL, UNIQUE(paper_id, indication_id))"
    )
    conn.executemany(
        "INSERT INTO papers_fts(rowid, title, abstract) VALUES (?, ?, ?)",
        [
            (1, "alpha top", "alpha signal alpha"),
            (2, "alpha mid", "alpha signal"),
            (3, "alpha low", "alpha"),
        ],
    )
    return conn


def test_route_papers_honors_positive_top_limit() -> None:
    conn = _conn()
    inserted = route_indications.route_papers(conn, 7, "slug", "alpha", 2)
    count = conn.execute("SELECT COUNT(*) FROM paper_indications").fetchone()[0]
    assert inserted == 2
    assert count == 2


def test_route_papers_treats_zero_or_negative_top_as_uncapped() -> None:
    for top in (0, -3):
        conn = _conn()
        inserted = route_indications.route_papers(conn, 7, "slug", "alpha", top)
        count = conn.execute("SELECT COUNT(*) FROM paper_indications").fetchone()[0]
        assert inserted == 3
        assert count == 3
