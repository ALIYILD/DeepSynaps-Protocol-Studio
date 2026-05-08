"""SQLite connection + schema bootstrap."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

# Priority order:
#   1. EVIDENCE_DB_PATH     — the production Studio uses this (set in fly.toml).
#   2. DEEPSYNAPS_DB        — legacy / dev override.
#   3. <pipeline_dir>/neuromodulation_evidence_2026-04-29_v4.db  — canonical local dev DB
#      (184,670 papers / 1,279 trials / 39 devices; seeded indications; ingested 2026-04-29).
#   4. <pipeline_dir>/evidence.db — legacy fallback kept for backwards compat.
#
# ROOT CAUSE NOTE (fixed 2026-05-08): the MCP server was registered pointing at
#   ~/Desktop/DeepSynaps-Protocol-Studio/services/evidence-pipeline/mcp_server.py
# That copy resolves __file__.parent to the Desktop mirror, which contains an empty
# (schema-less) SQLite file -- hence "no such table: papers".
# One-line re-registration fix (run in your terminal, not in chat):
#   claude mcp add deepsynaps-evidence -s user -- python3 \
#       ~/DeepSynaps-Protocol-Studio/services/evidence-pipeline/mcp_server.py
_PIPELINE_DIR = Path(__file__).parent
_V4_PATH = _PIPELINE_DIR / "neuromodulation_evidence_2026-04-29_v4.db"
_LEGACY_PATH = _PIPELINE_DIR / "evidence.db"
DEFAULT_DB_PATH = str(_V4_PATH if _V4_PATH.exists() else _LEGACY_PATH)
DB_PATH = (
    os.environ.get("EVIDENCE_DB_PATH")
    or os.environ.get("DEEPSYNAPS_DB")
    or DEFAULT_DB_PATH
)
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def resolve_db_path(db_path: str | os.PathLike[str] | None = None) -> str:
    if db_path:
        return str(Path(db_path).expanduser())
    return (
        os.environ.get("EVIDENCE_DB_PATH")
        or os.environ.get("DEEPSYNAPS_DB")
        or DEFAULT_DB_PATH
    )


def connect(db_path: str | os.PathLike[str] | None = None) -> sqlite3.Connection:
    resolved = resolve_db_path(db_path)
    conn = sqlite3.connect(resolved, isolation_level=None, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init(db_path: str | os.PathLike[str] | None = None) -> str:
    resolved = resolve_db_path(db_path)
    Path(resolved).expanduser().parent.mkdir(parents=True, exist_ok=True)
    conn = connect(resolved)
    with open(SCHEMA_PATH) as f:
        conn.executescript(f.read())
    conn.close()
    return resolved


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
