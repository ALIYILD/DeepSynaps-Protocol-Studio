"""Materialized Views Service — PostgreSQL-only, with safe SQLite fallback.

Provides read-optimized aggregate views for expensive dashboard queries.
Materialized views are refreshed manually or by scheduled job — never
on-request. When views are unavailable (SQLite, or views not created),
the system falls back to live aggregate queries.

No PHI is logged. All queries are read-only.
"""

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
import logging

import database

logger = logging.getLogger(__name__)

# ── SQL: Materialized View Definitions ────────────────────────────────────────
# These are PostgreSQL-specific. They are executed only when the dialect
# is PostgreSQL and views do not yet exist.

_MV_CLINIC_ACTIVITY_SQL = """
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_clinic_activity_summary AS
SELECT
    pa.clinic_id,
    COUNT(DISTINCT pa.patient_id) AS patient_count,
    COUNT(DISTINCT CASE WHEN pa.ai_analysis_consent = 1 THEN pa.patient_id END) AS active_patient_count,
    COUNT(DISTINCT CASE WHEN me.modality IN ('intervention', 'session') AND me.timestamp >= (CURRENT_TIMESTAMP - INTERVAL '30 days') THEN me.event_id END) AS session_count_30d,
    COUNT(DISTINCT CASE WHEN me.modality = 'report' AND me.timestamp >= (CURRENT_TIMESTAMP - INTERVAL '30 days') THEN me.event_id END) AS report_count_30d,
    COUNT(DISTINCT CASE WHEN me.modality = 'assessment' AND me.timestamp >= (CURRENT_TIMESTAMP - INTERVAL '30 days') THEN me.event_id END) AS assessment_count_30d,
    COUNT(DISTINCT CASE WHEN me.modality = 'qeeg' AND me.timestamp >= (CURRENT_TIMESTAMP - INTERVAL '30 days') THEN me.event_id END) AS qeeg_count_30d,
    COUNT(DISTINCT CASE WHEN me.modality = 'mri' AND me.timestamp >= (CURRENT_TIMESTAMP - INTERVAL '30 days') THEN me.event_id END) AS mri_count_30d,
    COUNT(DISTINCT CASE WHEN me.modality = 'biomarker' AND me.timestamp >= (CURRENT_TIMESTAMP - INTERVAL '30 days') THEN me.event_id END) AS biomarker_count_30d,
    MAX(me.timestamp) AS latest_activity_at,
    CURRENT_TIMESTAMP AS refreshed_at
FROM patient_access pa
LEFT JOIN multimodal_events me ON me.patient_id = pa.patient_id
GROUP BY pa.clinic_id
"""

_MV_PATIENT_ANALYZER_SQL = """
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_patient_analyzer_counts AS
SELECT
    pa.clinic_id,
    pa.patient_id,
    COUNT(DISTINCT CASE WHEN me.modality = 'qeeg' THEN me.event_id END) AS qeeg_count,
    COUNT(DISTINCT CASE WHEN me.modality = 'mri' THEN me.event_id END) AS mri_count,
    COUNT(DISTINCT CASE WHEN me.modality = 'biomarker' THEN me.event_id END) AS biomarker_count,
    COUNT(DISTINCT CASE WHEN me.modality = 'voice' THEN me.event_id END) AS voice_count,
    COUNT(DISTINCT CASE WHEN me.modality = 'video' THEN me.event_id END) AS video_count,
    COUNT(DISTINCT CASE WHEN me.modality = 'text' THEN me.event_id END) AS text_count,
    COUNT(DISTINCT CASE WHEN me.modality = 'wearable' THEN me.event_id END) AS movement_count,
    MAX(me.timestamp) AS latest_analysis_at,
    CURRENT_TIMESTAMP AS refreshed_at
FROM patient_access pa
LEFT JOIN multimodal_events me ON me.patient_id = pa.patient_id
GROUP BY pa.clinic_id, pa.patient_id
"""

_MV_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_clinic_clinic_id
ON mv_clinic_activity_summary (clinic_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_patient_clinic_patient
ON mv_patient_analyzer_counts (clinic_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_mv_patient_patient_id
ON mv_patient_analyzer_counts (patient_id);
"""

# ── SQL: Refresh (PostgreSQL only) ────────────────────────────────────────────

_REFRESH_CLINIC = "REFRESH MATERIALIZED VIEW mv_clinic_activity_summary"
_REFRESH_PATIENT = "REFRESH MATERIALIZED VIEW mv_patient_analyzer_counts"

# ── SQL: Query from views ─────────────────────────────────────────────────────

_QUERY_CLINIC_MV = "SELECT * FROM mv_clinic_activity_summary WHERE clinic_id = %s"
_QUERY_PATIENT_MV = "SELECT * FROM mv_patient_analyzer_counts WHERE clinic_id = %s AND patient_id = %s"


class MaterializedViews:
    """Materialized views service with safe PostgreSQL / SQLite handling.

    All public methods are safe to call regardless of dialect. When views
    are not available (SQLite or views not yet created), methods return
    ``None`` so callers can fall back to live queries.
    """

    def __init__(self, knowledge_layer=None):
        self.dialect = database.check_dialect()
        self._available = None  # cached availability check
        self._kl = knowledge_layer

    # ── Public API ────────────────────────────────────────────────────────────

    def is_postgres(self) -> bool:
        """Return True if the active dialect is PostgreSQL."""
        return self.dialect == "postgresql"

    def is_available(self) -> bool:
        """Check if materialized views exist and are queryable.

        Result is cached after first check (per instance)."""
        if self._available is not None:
            return self._available

        if not self.is_postgres():
            self._available = False
            return False

        self._available = self._views_exist()
        if self._available:
            logger.info("Materialized views are available (PostgreSQL)")
        else:
            logger.info("Materialized views not found — will use live queries")
        return self._available

    def get_summary_source(self) -> str:
        """Return the current summary data source label."""
        if self.is_available():
            return "materialized_view"
        elif self.is_postgres():
            return "live_query"  # Postgres but views not created yet
        else:
            return "fallback"  # SQLite

    def try_clinic_activity_summary(self, clinic_id: str) -> Optional[Dict[str, Any]]:
        """Query mv_clinic_activity_summary for a clinic.

        Returns ``None`` if views are unavailable so callers fall back.
        """
        if not self.is_available():
            return None
        return self._query_one(_QUERY_CLINIC_MV, (clinic_id,))

    def try_patient_analyzer_counts(
        self, clinic_id: str, patient_id: str
    ) -> Optional[Dict[str, Any]]:
        """Query mv_patient_analyzer_counts for a clinic + patient.

        Returns ``None`` if views are unavailable so callers fall back.
        """
        if not self.is_available():
            return None
        return self._query_one(_QUERY_PATIENT_MV, (clinic_id, patient_id))

    def get_view_status(self) -> Dict[str, Any]:
        """Return metadata about materialized views for admin monitoring.

        Safe to call on any dialect — never crashes."""
        status = {
            "dialect": self.dialect,
            "available": self.is_available(),
            "views": [],
            "last_refresh": None,
            "error": None,
        }
        if not self.is_postgres():
            return status

        try:
            conn = self._connect()
            try:
                cur = conn.cursor()
                # List materialized views
                cur.execute(
                    "SELECT matviewname, hasindexes "
                    "FROM pg_matviews WHERE schemaname = 'public'"
                )
                for row in cur.fetchall():
                    view_name = row[0]
                    has_indexes = row[1]
                    # Get last refresh time (refreshed_at column)
                    try:
                        cur.execute(
                            f"SELECT MAX(refreshed_at) FROM {view_name}"
                        )
                        last_refresh = cur.fetchone()[0]
                    except Exception:
                        last_refresh = None
                    status["views"].append({
                        "name": view_name,
                        "has_indexes": has_indexes,
                        "last_refresh": last_refresh,
                    })
                    if last_refresh and (
                        status["last_refresh"] is None or last_refresh > status["last_refresh"]
                    ):
                        status["last_refresh"] = last_refresh
            finally:
                conn.close()
        except Exception as e:
            status["error"] = str(e)
            logger.warning("Failed to get materialized view status: %s", e)
        return status

    # ── Refresh ───────────────────────────────────────────────────────────────

    def refresh_clinic_activity_summary(self) -> bool:
        """Refresh mv_clinic_activity_summary. Returns True on success.

        No-op on SQLite. Safe to call in any environment."""
        if not self.is_postgres():
            logger.debug("Skipping refresh — not PostgreSQL")
            return False
        return self._execute_refresh(_REFRESH_CLINIC, "clinic_activity_summary")

    def refresh_patient_analyzer_counts(self) -> bool:
        """Refresh mv_patient_analyzer_counts. Returns True on success.

        No-op on SQLite. Safe to call in any environment."""
        if not self.is_postgres():
            logger.debug("Skipping refresh — not PostgreSQL")
            return False
        return self._execute_refresh(_REFRESH_PATIENT, "patient_analyzer_counts")

    def refresh_all(self) -> Dict[str, bool]:
        """Refresh all materialized views. Returns status per view.

        Safe to call on any dialect — no-op on SQLite."""
        return {
            "clinic_activity_summary": self.refresh_clinic_activity_summary(),
            "patient_analyzer_counts": self.refresh_patient_analyzer_counts(),
        }

    # ── Setup (one-time creation) ─────────────────────────────────────────────

    @classmethod
    def create_views(cls) -> Dict[str, bool]:
        """Create materialized views and indexes (PostgreSQL only).

        This is a classmethod so it can be called without an instance.
        Returns a dict of {view_name: success}."""
        if not database.is_postgres():
            logger.info("Skipping materialized view creation — not PostgreSQL")
            return {}

        results = {}
        try:
            with database.connection() as conn:
                cur = conn.cursor()

                # Create clinic activity view
                logger.info("Creating mv_clinic_activity_summary...")
                cur.execute(_MV_CLINIC_ACTIVITY_SQL)
                results["mv_clinic_activity_summary"] = True
                logger.info("Created mv_clinic_activity_summary")

                # Create patient analyzer view
                logger.info("Creating mv_patient_analyzer_counts...")
                cur.execute(_MV_PATIENT_ANALYZER_SQL)
                results["mv_patient_analyzer_counts"] = True
                logger.info("Created mv_patient_analyzer_counts")

                # Create indexes
                logger.info("Creating materialized view indexes...")
                cur.execute(_MV_INDEX_SQL)
                logger.info("Created materialized view indexes")

                conn.commit()
        except Exception as e:
            logger.error("Failed to create materialized views: %s", e)
            for view_name in ["mv_clinic_activity_summary", "mv_patient_analyzer_counts"]:
                if view_name not in results:
                    results[view_name] = False
        return results

    @classmethod
    def drop_views(cls) -> Dict[str, bool]:
        """Drop materialized views and indexes (PostgreSQL only).

        Use for testing, teardown, or downgrade."""
        if not database.is_postgres():
            return {}

        results = {}
        try:
            with database.connection() as conn:
                cur = conn.cursor()

                drop_statements = [
                    "DROP INDEX IF EXISTS idx_mv_clinic_clinic_id",
                    "DROP INDEX IF EXISTS idx_mv_patient_clinic_patient",
                    "DROP INDEX IF EXISTS idx_mv_patient_patient_id",
                    "DROP MATERIALIZED VIEW IF EXISTS mv_patient_analyzer_counts",
                    "DROP MATERIALIZED VIEW IF EXISTS mv_clinic_activity_summary",
                ]

                for sql in drop_statements:
                    try:
                        cur.execute(sql)
                        logger.debug("Executed: %s", sql.split(" EXISTS")[-1].strip())
                    except Exception as e:
                        logger.debug("Skipped (may not exist): %s — %s", sql, e)

                conn.commit()
                results["dropped"] = True
        except Exception as e:
            logger.error("Failed to drop materialized views: %s", e)
            results["dropped"] = False
        return results

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _connect(self):
        """Get a database connection."""
        if self._kl is not None:
            return self._kl._connect()
        return database.connect()

    def _views_exist(self) -> bool:
        """Check if our materialized views exist in the database."""
        try:
            conn = self._connect()
            try:
                cur = conn.cursor()
                cur.execute(
                    "SELECT COUNT(*) FROM pg_matviews "
                    "WHERE schemaname = 'public' "
                    "AND matviewname IN ('mv_clinic_activity_summary', 'mv_patient_analyzer_counts')"
                )
                count = cur.fetchone()[0]
                return count >= 2
            finally:
                conn.close()
        except Exception as e:
            logger.debug("Views exist check failed: %s", e)
            return False

    def _query_one(self, sql: str, params: Tuple) -> Optional[Dict[str, Any]]:
        """Execute a single-row query and return as dict."""
        try:
            conn = self._connect()
            try:
                cur = conn.cursor()
                cur.execute(sql, params)
                row = cur.fetchone()
                if row is None:
                    return None
                columns = [desc[0] for desc in cur.description]
                result = {col: row[i] for i, col in enumerate(columns)}
                result["summary_source"] = "materialized_view"
                return result
            finally:
                conn.close()
        except Exception as e:
            logger.debug("MV query failed (will fall back): %s", e)
            return None

    def _execute_refresh(self, sql: str, view_name: str) -> bool:
        """Execute a REFRESH MATERIALIZED VIEW statement."""
        try:
            conn = self._connect()
            try:
                cur = conn.cursor()
                cur.execute(sql)
                conn.commit()
                logger.info("Refreshed %s", view_name)
                return True
            finally:
                conn.close()
        except Exception as e:
            logger.warning("Failed to refresh %s: %s", view_name, e)
            return False
