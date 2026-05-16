"""Dialect-aware database adapter — SQLite for dev/test, PostgreSQL for production.

Minimal abstraction: the KnowledgeLayer and other engines call these helpers
instead of raw sqlite3.connect().  PostgreSQL paths use psycopg2 if available.
"""

import os
import sys
import logging
from typing import Any, Dict, List, Optional, Tuple
from contextlib import contextmanager

# psycopg2 is optional — imported only when PostgreSQL is configured
try:
    import psycopg2
    import psycopg2.extras
    _HAS_PSYCOPG2 = True
except ImportError:
    _HAS_PSYCOPG2 = False

logger = logging.getLogger(__name__)


# ── Dialect Detection ──────────────────────────────────────────

def _db_url() -> str:
    return os.environ.get("DATABASE_URL", "") or os.environ.get("DEEPSYNAPS_DB", ":memory:")


def is_postgres() -> bool:
    url = _db_url()
    return url.startswith("postgresql://") or url.startswith("postgres://")


def is_sqlite() -> bool:
    return not is_postgres()


def is_production() -> bool:
    return os.environ.get("DEEPSYNAPS_APP_ENV", "development") == "production"


def is_test() -> bool:
    return os.environ.get("DEEPSYNAPS_APP_ENV", "development") in ("test", "testing")


def validate_production_db() -> None:
    """Raise clear error if production is missing PostgreSQL."""
    if is_production() and is_sqlite():
        raise RuntimeError(
            "FATAL: Production environment requires PostgreSQL. "
            "Set DATABASE_URL=postgresql://user:pass@host/db. "
            "SQLite is not permitted in production."
        )


def sqlite_allowed() -> bool:
    """SQLite allowed only in dev, test, demo — never production."""
    return not is_production()


# ── Connection Factory ─────────────────────────────────────────

class ConnectionProxy:
    """Wraps either sqlite3.Connection or psycopg2.connection with a uniform API."""

    def __init__(self, raw_conn, dialect: str):
        self._conn = raw_conn
        self.dialect = dialect  # "sqlite" or "postgresql"

    @property
    def raw(self):
        return self._conn

    def cursor(self):
        if self.dialect == "sqlite":
            import sqlite3
            self._conn.row_factory = sqlite3.Row
        return self._conn.cursor()

    def execute(self, sql: str, params: Optional[Tuple] = None):
        """Execute with dialect-adapted SQL."""
        adapted = adapt_sql(sql, self.dialect)
        cur = self._conn.cursor()
        if params:
            # Convert ? placeholders to %s for PostgreSQL
            if self.dialect == "postgresql":
                adapted = adapted.replace("?", "%s")
            cur.execute(adapted, params)
        else:
            cur.execute(adapted)
        return cur

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()

    def row_factory(self, factory):
        """Set row factory (SQLite) or RealDictCursor (PostgreSQL)."""
        if self.dialect == "sqlite":
            import sqlite3
            if factory is not None:
                self._conn.row_factory = factory
        # For PostgreSQL, row_factory is handled at connection creation


def connect(db_url: Optional[str] = None) -> ConnectionProxy:
    """Create a dialect-aware database connection."""
    url = db_url or _db_url()

    if url.startswith("postgresql://") or url.startswith("postgres://"):
        validate_production_db()
        if not _HAS_PSYCOPG2:
            raise RuntimeError(
                "PostgreSQL configured but psycopg2 is not installed. "
                "Run: pip install psycopg2-binary"
            )
        # Parse URL for psycopg2 (it handles postgresql:// directly)
        conn = psycopg2.connect(url)
        return ConnectionProxy(conn, "postgresql")

    # ── SQLite path ───────────────────────────────────────────
    if url in (":memory:", ""):
        path = ":memory:"
    else:
        path = url

    import sqlite3
    conn = sqlite3.connect(path, check_same_thread=False)
    return ConnectionProxy(conn, "sqlite")


@contextmanager
def connection(db_url: Optional[str] = None):
    """Context manager for database connections."""
    conn = connect(db_url)
    try:
        yield conn
    finally:
        conn.close()


# ── SQL Dialect Adapter ────────────────────────────────────────

_SQLITE_TO_PG = {
    # SQLite-specific → PostgreSQL-compatible
    "INTEGER PRIMARY KEY AUTOINCREMENT": "SERIAL PRIMARY KEY",
    "TEXT DEFAULT CURRENT_TIMESTAMP": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    "INSERT OR IGNORE": "INSERT",
}


def adapt_sql(sql: str, dialect: str) -> str:
    """Adapt a SQL statement from SQLite dialect to target dialect."""
    if dialect == "sqlite":
        return sql

    result = sql
    for sqlite_pat, pg_pat in _SQLITE_TO_PG.items():
        result = result.replace(sqlite_pat, pg_pat)

    # Boolean: SQLite uses INTEGER (0/1), PostgreSQL uses BOOLEAN
    # We keep INTEGER for compatibility — psycopg2 handles the cast
    # but we document this for migration scripts.

    return result


# ── Query Helpers ──────────────────────────────────────────────

_placeholder_map = {"sqlite": "?", "postgresql": "%s"}


def placeholders(count: int, dialect: str = "sqlite") -> str:
    """Return placeholder string for a given count."""
    ph = _placeholder_map.get(dialect, "?")
    return ",".join([ph] * count)


# ── Row Reader ─────────────────────────────────────────────────

def row_to_dict(row: Any, columns: List[str]) -> Dict[str, Any]:
    """Convert a database row to a dictionary."""
    if hasattr(row, "keys"):
        # psycopg2 RealDictRow or sqlite3.Row
        return {k: row[k] for k in row.keys()}
    # Fallback: positional access with column names
    return {col: row[i] for i, col in enumerate(columns)}


# ── Init All Tables ────────────────────────────────────────────

_CREATE_STATEMENTS = {
    "multimodal_events": """
        CREATE TABLE IF NOT EXISTS multimodal_events (
            event_id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            modality TEXT NOT NULL,
            source_system TEXT NOT NULL,
            source_record_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            value_summary TEXT NOT NULL,
            numeric_features TEXT,
            textual_summary TEXT,
            confidence REAL DEFAULT 0.0,
            data_quality TEXT DEFAULT 'unknown',
            provenance TEXT,
            evidence_links TEXT,
            audit_reference TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "evidence_db": """
        CREATE TABLE IF NOT EXISTS evidence_db (
            evidence_id TEXT PRIMARY KEY,
            source_type TEXT NOT NULL,
            citation TEXT NOT NULL,
            evidence_grade TEXT,
            confidence REAL DEFAULT 0.0,
            research_only INTEGER DEFAULT 1,
            conflicting INTEGER DEFAULT 0,
            url TEXT,
            modality_scope TEXT,
            clinical_tags TEXT
        )
    """,
    "patient_access": """
        CREATE TABLE IF NOT EXISTS patient_access (
            patient_id TEXT NOT NULL,
            clinic_id TEXT NOT NULL,
            clinician_id TEXT NOT NULL,
            access_level TEXT DEFAULT 'read',
            ai_analysis_consent INTEGER DEFAULT 0,
            PRIMARY KEY (patient_id, clinic_id, clinician_id)
        )
    """,
    "audit_log": """
        CREATE TABLE IF NOT EXISTS audit_log (
            audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            endpoint TEXT,
            clinician_id TEXT,
            clinic_id TEXT,
            patient_id TEXT,
            action TEXT,
            request_hash TEXT,
            response_status TEXT
        )
    """,
    "deeptwin_reviews": """
        CREATE TABLE IF NOT EXISTS deeptwin_reviews (
            review_id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            clinician_id TEXT NOT NULL,
            snapshot_id TEXT NOT NULL,
            hypothesis_id TEXT,
            action TEXT,
            note TEXT,
            requested_modalities TEXT,
            follow_up_tasks TEXT,
            reviewed_at TEXT,
            audit_reference TEXT
        )
    """,
    "deeptwin_tasks": """
        CREATE TABLE IF NOT EXISTS deeptwin_tasks (
            task_id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            clinician_id TEXT NOT NULL,
            snapshot_id TEXT,
            description TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT
        )
    """,
}


def init_all_tables(conn: ConnectionProxy) -> None:
    """Initialize all tables with dialect-adapted SQL."""
    for name, sql in _CREATE_STATEMENTS.items():
        adapted = adapt_sql(sql, conn.dialect)
        cur = conn.cursor()
        cur.execute(adapted)
    conn.commit()
    logger.info(f"Initialized tables for dialect: {conn.dialect}")


def check_dialect() -> str:
    """Return the active database dialect string."""
    return "postgresql" if is_postgres() else "sqlite"


def health_check(db_url: Optional[str] = None) -> Dict[str, Any]:
    """Return database health status."""
    dialect = check_dialect()
    result = {
        "dialect": dialect,
        "connectable": False,
        "tables": [],
        "error": None,
    }
    try:
        with connection(db_url) as conn:
            result["connectable"] = True
            cur = conn.cursor()
            if dialect == "sqlite":
                cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
                result["tables"] = [r[0] for r in cur.fetchall()]
            else:
                cur.execute(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
                )
                result["tables"] = [r[0] for r in cur.fetchall()]
    except Exception as e:
        result["error"] = str(e)
    return result
