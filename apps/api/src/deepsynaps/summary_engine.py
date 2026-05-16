"""Summary Engine — fast aggregate queries for dashboards.

Provides bounded, clinic-scoped summary data for high-traffic dashboard views.
Uses SQL COUNT/aggregate queries instead of loading full objects.
All queries are dialect-aware (SQLite dev/test, PostgreSQL production).
"""

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import json
import logging

import database
from cache_service import CacheService, CacheConfig

logger = logging.getLogger(__name__)


class SummaryEngine:
    """Aggregate summary queries for dashboard performance.

    Returns bounded payloads with counts, flags, and warnings — never
    full patient records or PHI. All queries use clinic isolation.
    """

    # ── Constants ────────────────────────────────────────────────
    # How many days back to consider "recent"
    RECENT_DAYS = 30
    TODAY_DAYS = 1

    # ── Constructor ──────────────────────────────────────────────

    def __init__(self, knowledge_layer):
        self.kl = knowledge_layer
        self.dialect = database.check_dialect()
        self._ph = "%s" if self.dialect == "postgresql" else "?"
        self._cache = CacheService()

    def _connect(self):
        return self.kl._connect()

    def _count(self, sql: str, params: Tuple) -> int:
        """Execute a COUNT query and return the integer result."""
        conn = self._connect()
        try:
            cur = conn.cursor()
            if self.dialect == "postgresql":
                sql = sql.replace("?", "%s")
            cur.execute(sql, params)
            row = cur.fetchone()
            return row[0] if row and row[0] is not None else 0
        finally:
            conn.close()

    def _one(self, sql: str, params: Tuple) -> Optional[Any]:
        """Execute a query and return the first column of the first row."""
        conn = self._connect()
        try:
            cur = conn.cursor()
            if self.dialect == "postgresql":
                sql = sql.replace("?", "%s")
            cur.execute(sql, params)
            row = cur.fetchone()
            return row[0] if row else None
        finally:
            conn.close()

    # ── Clinic Dashboard Summary ─────────────────────────────────

    def clinic_dashboard_summary(self, clinic_id: str) -> Dict[str, Any]:
        """Return aggregate clinic-level dashboard data.

        Bounded payload with counts and flags. No PHI.
        """
        # Check cache first
        cache_key = CacheService.build_key("clinic_dashboard", clinic_id=clinic_id)
        cached = self._cache.get_json(cache_key)
        if cached is not None:
            logger.debug("Cache hit for clinic_dashboard: %s", clinic_id)
            return cached

        now = datetime.now().isoformat()
        today_start = (datetime.now() - timedelta(days=1)).isoformat()
        recent_start = (datetime.now() - timedelta(days=self.RECENT_DAYS)).isoformat()

        # Count patients with access to this clinic
        active_patients = self._count(
            "SELECT COUNT(DISTINCT patient_id) FROM patient_access WHERE clinic_id = ?",
            (clinic_id,),
        )

        # Recent events for this clinic
        ph = self._ph
        recent_events = self._count(
            f"SELECT COUNT(*) FROM multimodal_events me "
            f"JOIN patient_access pa ON me.patient_id = pa.patient_id "
            f"WHERE pa.clinic_id = {ph} AND me.timestamp >= {ph}",
            (clinic_id, recent_start),
        )

        # Recent audit entries for this clinic
        recent_audits = self._count(
            f"SELECT COUNT(*) FROM audit_log WHERE clinic_id = {ph} AND timestamp >= {ph}",
            (clinic_id, recent_start),
        )

        # Patients with AI consent
        ai_consent_count = self._count(
            f"SELECT COUNT(DISTINCT patient_id) FROM patient_access "
            f"WHERE clinic_id = {ph} AND ai_analysis_consent = 1",
            (clinic_id,),
        )

        # Count events per modality (bounded top 10)
        modality_counts = self._modality_counts(clinic_id, recent_start)

        # Data quality: count low/missing quality events
        quality_flags = self._quality_flags(clinic_id, recent_start)

        result = {
            "scope": "clinic_dashboard",
            "clinic_id": clinic_id,
            "generated_at": now,
            "active_patients": active_patients,
            "recent_events_30d": recent_events,
            "recent_audits_30d": recent_audits,
            "ai_consent_count": ai_consent_count,
            "modality_breakdown": modality_counts,
            "quality_flags": quality_flags,
            "partial": False,
            "safety_disclaimer": (
                "Decision support only. Requires clinician review. "
                "Counts are aggregates, not diagnoses."
            ),
        }
        # Store in cache with clinic-scoped TTL
        from cache_service import CacheConfig
        self._cache.set_json(cache_key, result, ttl=CacheConfig.clinic_summary_ttl())
        return result

    # ── Patient Dashboard Summary ────────────────────────────────

    def patient_dashboard_summary(self, patient_id: str) -> Dict[str, Any]:
        """Return aggregate patient-level dashboard data.

        Bounded payload with counts and recency. No full records.
        """
        # Check cache first
        cache_key = CacheService.build_key("patient_dashboard", patient_id=patient_id)
        cached = self._cache.get_json(cache_key)
        if cached is not None:
            logger.debug("Cache hit for patient_dashboard: %s", patient_id)
            return cached

        now = datetime.now().isoformat()
        recent_start = (datetime.now() - timedelta(days=self.RECENT_DAYS)).isoformat()
        ph = self._ph

        # Total events for patient
        total_events = self._count(
            f"SELECT COUNT(*) FROM multimodal_events WHERE patient_id = {ph}",
            (patient_id,),
        )

        # Modalities present (bounded top 10)
        modality_counts = self._modality_counts_for_patient(patient_id)

        # Most recent event timestamp
        latest_event = self._one(
            f"SELECT MAX(timestamp) FROM multimodal_events WHERE patient_id = {ph}",
            (patient_id,),
        )

        # First event timestamp (study start)
        first_event = self._one(
            f"SELECT MIN(timestamp) FROM multimodal_events WHERE patient_id = {ph}",
            (patient_id,),
        )

        # Recent events
        recent_count = self._count(
            f"SELECT COUNT(*) FROM multimodal_events WHERE patient_id = {ph} AND timestamp >= {ph}",
            (patient_id, recent_start),
        )

        # Data quality summary
        quality_summary = self._quality_summary_for_patient(patient_id)

        result = {
            "scope": "patient_dashboard",
            "patient_id": patient_id,
            "generated_at": now,
            "total_events": total_events,
            "recent_events_30d": recent_count,
            "modality_breakdown": modality_counts,
            "latest_event_at": latest_event,
            "first_event_at": first_event,
            "data_quality_summary": quality_summary,
            "partial": False,
            "safety_disclaimer": (
                "Decision support only. Requires clinician review. "
                "Patient summary — not a diagnosis."
            ),
        }
        # Store in cache with patient-scoped TTL
        self._cache.set_json(cache_key, result, ttl=CacheConfig.patient_ttl())
        return result

    # ── Analyzer Status Summary ──────────────────────────────────

    def analyzer_status_summary(self, clinic_id: str) -> Dict[str, Any]:
        """Return aggregate analyzer/data processing status.

        Counts of events by modality, freshness indicators, and flags.
        """
        # Check cache first
        cache_key = CacheService.build_key("analyzer_status", clinic_id=clinic_id)
        cached = self._cache.get_json(cache_key)
        if cached is not None:
            logger.debug("Cache hit for analyzer_status: %s", clinic_id)
            return cached

        now = datetime.now().isoformat()
        recent_start = (datetime.now() - timedelta(days=self.RECENT_DAYS)).isoformat()
        ph = self._ph

        # All modality counts across clinic
        modality_counts = self._modality_counts(clinic_id, "1970-01-01T00:00:00")

        # Recent modality counts
        recent_modality = self._modality_counts(clinic_id, recent_start)

        # Stale modalities (no events in 30 days)
        all_modalities = ["assessment", "qeeg", "mri", "biomarker", "lab",
                         "medication", "intervention", "voice", "text",
                         "video", "wearable", "risk_signal", "report"]
        stale_modalities = []
        for mod in all_modalities:
            count = self._count(
                f"SELECT COUNT(*) FROM multimodal_events me "
                f"JOIN patient_access pa ON me.patient_id = pa.patient_id "
                f"WHERE pa.clinic_id = {ph} AND me.modality = {ph} AND me.timestamp >= {ph}",
                (clinic_id, mod, recent_start),
            )
            if count == 0:
                stale_modalities.append(mod)

        # Evidence entries count
        evidence_count = self._count(
            "SELECT COUNT(*) FROM evidence_db", (),
        )

        result = {
            "scope": "analyzer_status",
            "clinic_id": clinic_id,
            "generated_at": now,
            "all_time_modality_counts": modality_counts,
            "recent_30d_modality_counts": recent_modality,
            "stale_modalities": stale_modalities,
            "evidence_entries": evidence_count,
            "partial": False,
            "safety_disclaimer": (
                "Decision support only. Requires clinician review. "
                "Analyzer counts do not indicate clinical significance."
            ),
        }
        # Store in cache with clinic-scoped TTL
        self._cache.set_json(cache_key, result, ttl=CacheConfig.clinic_summary_ttl())
        return result

    # ── Internal helpers ─────────────────────────────────────────

    def _modality_counts(self, clinic_id: str, since: str) -> List[Dict[str, Any]]:
        """Return top 10 modality counts for a clinic since a timestamp."""
        ph = self._ph
        conn = self._connect()
        try:
            cur = conn.cursor()
            sql = (
                f"SELECT me.modality, COUNT(*) as cnt "
                f"FROM multimodal_events me "
                f"JOIN patient_access pa ON me.patient_id = pa.patient_id "
                f"WHERE pa.clinic_id = {ph} AND me.timestamp >= {ph} "
                f"GROUP BY me.modality ORDER BY cnt DESC LIMIT 10"
            )
            if self.dialect == "postgresql":
                sql = sql.replace("?", "%s")
            cur.execute(sql, (clinic_id, since))
            rows = cur.fetchall()
            return [{"modality": r[0], "count": r[1]} for r in rows]
        finally:
            conn.close()

    def _modality_counts_for_patient(self, patient_id: str) -> List[Dict[str, Any]]:
        """Return modality counts for a single patient."""
        ph = self._ph
        conn = self._connect()
        try:
            cur = conn.cursor()
            sql = (
                f"SELECT modality, COUNT(*) as cnt "
                f"FROM multimodal_events WHERE patient_id = {ph} "
                f"GROUP BY modality ORDER BY cnt DESC LIMIT 10"
            )
            if self.dialect == "postgresql":
                sql = sql.replace("?", "%s")
            cur.execute(sql, (patient_id,))
            rows = cur.fetchall()
            return [{"modality": r[0], "count": r[1]} for r in rows]
        finally:
            conn.close()

    def _quality_flags(self, clinic_id: str, since: str) -> Dict[str, int]:
        """Return counts of low-quality and missing-quality events."""
        ph = self._ph
        conn = self._connect()
        try:
            cur = conn.cursor()
            sql = (
                f"SELECT me.data_quality, COUNT(*) "
                f"FROM multimodal_events me "
                f"JOIN patient_access pa ON me.patient_id = pa.patient_id "
                f"WHERE pa.clinic_id = {ph} AND me.timestamp >= {ph} "
                f"GROUP BY me.data_quality"
            )
            if self.dialect == "postgresql":
                sql = sql.replace("?", "%s")
            cur.execute(sql, (clinic_id, since))
            rows = cur.fetchall()
            return {r[0] or "unknown": r[1] for r in rows}
        finally:
            conn.close()

    def _quality_summary_for_patient(self, patient_id: str) -> Dict[str, int]:
        """Return data quality counts for a single patient."""
        ph = self._ph
        conn = self._connect()
        try:
            cur = conn.cursor()
            sql = (
                f"SELECT data_quality, COUNT(*) "
                f"FROM multimodal_events WHERE patient_id = {ph} "
                f"GROUP BY data_quality"
            )
            if self.dialect == "postgresql":
                sql = sql.replace("?", "%s")
            cur.execute(sql, (patient_id,))
            rows = cur.fetchall()
            return {r[0] or "unknown": r[1] for r in rows}
        finally:
            conn.close()
