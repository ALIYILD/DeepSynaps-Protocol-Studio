from __future__ import annotations
"""SQLite connection + schema bootstrap."""
import os
import sqlite3
from pathlib import Path

DB_PATH = os.environ.get(
    "DEEPSYNAPS_DB",
    str(Path(__file__).parent / "evidence.db"),
)
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def connect(db_path: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, isolation_level=None, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init(db_path: str = DB_PATH) -> str:
    conn = connect(db_path)
    with open(SCHEMA_PATH) as f:
        conn.executescript(f.read())
    return db_path


def upsert_indication(conn, slug, label, modality, condition, grade=None, regulatory=None, notes=None) -> int:
    conn.execute(
        "INSERT INTO indications(slug, label, modality, condition, evidence_grade, regulatory, notes) "
        "VALUES (?,?,?,?,?,?,?) "
        "ON CONFLICT(slug) DO UPDATE SET "
        "  label=excluded.label, modality=excluded.modality, condition=excluded.condition, "
        "  evidence_grade=excluded.evidence_grade, regulatory=excluded.regulatory, notes=excluded.notes",
        (slug, label, modality, condition, grade, regulatory, notes),
    )
    return conn.execute("SELECT id FROM indications WHERE slug=?", (slug,)).fetchone()[0]


if __name__ == "__main__":
    path = init()
    print(f"initialised {path}")
