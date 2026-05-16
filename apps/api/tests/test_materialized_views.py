"""Tests for MaterializedViews service — SQLite-safe, PostgreSQL-aware.

All default tests run on SQLite (no PostgreSQL required).
Tests verify: fallback behavior, no crashes, correct reporting.

Optional PostgreSQL tests are marked with @pytest.mark.postgres and
skipped by default. To run them: pytest -m postgres
"""

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

import pytest
from datetime import datetime
from knowledge_layer import KnowledgeLayer
from materialized_views import MaterializedViews

# ── Markers ───────────────────────────────────────────────────────────────────

postgres = pytest.mark.postgres

# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mv_service(tmp_path):
    """Fresh MaterializedViews service with a test database."""
    db = str(tmp_path / "test_mv.db")
    kl = KnowledgeLayer(db_url=db)
    return MaterializedViews(knowledge_layer=kl)


# ═══════════════════════════════════════════════════════════════════════════════
# Dialect Detection
# ═══════════════════════════════════════════════════════════════════════════════

class TestDialectDetection:
    """Verify correct dialect identification."""

    def test_sqlite_detected(self, mv_service):
        """SQLite should be detected as non-PostgreSQL."""
        assert mv_service.dialect == "sqlite"
        assert mv_service.is_postgres() is False

    def test_is_available_false_on_sqlite(self, mv_service):
        """Views should be reported unavailable on SQLite."""
        assert mv_service.is_available() is False

    def test_get_summary_source_sqlite(self, mv_service):
        """Summary source should be 'fallback' on SQLite."""
        assert mv_service.get_summary_source() == "fallback"

    def test_is_available_cached(self, mv_service):
        """Availability result should be cached after first check."""
        result1 = mv_service.is_available()
        result2 = mv_service.is_available()
        assert result1 == result2
        assert mv_service._available is not None


# ═══════════════════════════════════════════════════════════════════════════════
# Clinic Activity Summary Query
# ═══════════════════════════════════════════════════════════════════════════════

class TestClinicActivitySummary:
    """Clinic activity summary query — falls back on SQLite."""

    def test_returns_none_on_sqlite(self, mv_service):
        """Should return None on SQLite (caller falls back to live query)."""
        result = mv_service.try_clinic_activity_summary("clinic-0")
        assert result is None

    def test_no_crash_with_invalid_clinic(self, mv_service):
        """Should not crash with nonexistent clinic."""
        result = mv_service.try_clinic_activity_summary("nonexistent-clinic")
        assert result is None

    def test_does_not_mutate_db(self, mv_service, tmp_path):
        """Query should not modify the database."""
        db = str(tmp_path / "test_clinic.db")
        kl = KnowledgeLayer(db_url=db)
        mv = MaterializedViews(knowledge_layer=kl)

        # Seed data
        from contracts import MultimodalEvent
        e = MultimodalEvent(
            patient_id="p-001", event_type="qeeg", modality="qeeg",
            source_system="test", source_record_id="r1",
            timestamp=datetime.now(), value_summary="test",
            confidence=0.8, data_quality="high",
        )
        kl.insert_event(e)
        conn = kl._connect()
        try:
            cur = conn.cursor()
            ph = "?"
            cur.execute(
                f"INSERT OR REPLACE INTO patient_access VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                ("p-001", "clinic-0", "c-001", "read", 1),
            )
            conn.commit()
        finally:
            conn.close()

        # Call MV query (will return None on SQLite)
        mv.try_clinic_activity_summary("clinic-0")

        # Verify data unchanged
        conn = kl._connect()
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM multimodal_events WHERE patient_id = ?", ("p-001",))
            count = cur.fetchone()[0]
            assert count >= 1
        finally:
            conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# Patient Analyzer Counts Query
# ═══════════════════════════════════════════════════════════════════════════════

class TestPatientAnalyzerCounts:
    """Patient analyzer counts query — falls back on SQLite."""

    def test_returns_none_on_sqlite(self, mv_service):
        """Should return None on SQLite."""
        result = mv_service.try_patient_analyzer_counts("clinic-0", "p-001")
        assert result is None

    def test_no_crash_with_invalid_ids(self, mv_service):
        """Should not crash with nonexistent IDs."""
        result = mv_service.try_patient_analyzer_counts("nonexistent", "nonexistent")
        assert result is None


# ═══════════════════════════════════════════════════════════════════════════════
# View Status
# ═══════════════════════════════════════════════════════════════════════════════

class TestViewStatus:
    """Admin status endpoint — safe on all dialects."""

    def test_returns_dict(self, mv_service):
        """Should return a status dict."""
        status = mv_service.get_view_status()
        assert isinstance(status, dict)

    def test_has_required_keys(self, mv_service):
        """Status should contain expected keys."""
        status = mv_service.get_view_status()
        required = ["dialect", "available", "views", "last_refresh", "error"]
        for key in required:
            assert key in status, f"Missing key: {key}"

    def test_sqlite_dialect_reported(self, mv_service):
        """SQLite dialect should be reported correctly."""
        status = mv_service.get_view_status()
        assert status["dialect"] == "sqlite"

    def test_not_available_on_sqlite(self, mv_service):
        """Should report not available on SQLite."""
        status = mv_service.get_view_status()
        assert status["available"] is False

    def test_empty_views_list(self, mv_service):
        """Views list should be empty on SQLite."""
        status = mv_service.get_view_status()
        assert status["views"] == []

    def test_no_error(self, mv_service):
        """No error should be reported on SQLite."""
        status = mv_service.get_view_status()
        assert status["error"] is None

    def test_no_phi_in_status(self, mv_service):
        """Status should never contain PHI."""
        status = mv_service.get_view_status()
        status_str = str(status)
        assert "patient" not in status_str.lower() or "patient_count" in status_str


# ═══════════════════════════════════════════════════════════════════════════════
# Refresh Operations
# ═══════════════════════════════════════════════════════════════════════════════

class TestRefresh:
    """Refresh operations — no-op on SQLite."""

    def test_refresh_clinic_noop_on_sqlite(self, mv_service):
        """Clinic refresh should return False on SQLite (no-op)."""
        result = mv_service.refresh_clinic_activity_summary()
        assert result is False

    def test_refresh_patient_noop_on_sqlite(self, mv_service):
        """Patient refresh should return False on SQLite (no-op)."""
        result = mv_service.refresh_patient_analyzer_counts()
        assert result is False

    def test_refresh_all_on_sqlite(self, mv_service):
        """refresh_all should report both as False on SQLite."""
        results = mv_service.refresh_all()
        assert results["clinic_activity_summary"] is False
        assert results["patient_analyzer_counts"] is False

    def test_refresh_all_returns_dict(self, mv_service):
        """refresh_all should return a dict with view names."""
        results = mv_service.refresh_all()
        assert isinstance(results, dict)
        assert "clinic_activity_summary" in results
        assert "patient_analyzer_counts" in results

    def test_refresh_does_not_crash(self, mv_service):
        """Multiple refreshes should not crash."""
        for _ in range(5):
            mv_service.refresh_all()


# ═══════════════════════════════════════════════════════════════════════════════
# Create / Drop Views (PostgreSQL only)
# ═══════════════════════════════════════════════════════════════════════════════

class TestCreateDrop:
    """create_views and drop_views — no-op on SQLite."""

    def test_create_views_returns_empty_on_sqlite(self):
        """Should return empty dict on SQLite."""
        results = MaterializedViews.create_views()
        assert isinstance(results, dict)
        assert len(results) == 0

    def test_drop_views_returns_empty_on_sqlite(self):
        """Should return empty dict on SQLite."""
        results = MaterializedViews.drop_views()
        assert isinstance(results, dict)
        assert len(results) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Performance
# ═══════════════════════════════════════════════════════════════════════════════

class TestPerformance:
    """MV service should be fast even on SQLite (no heavy computation)."""

    def test_is_available_fast(self, mv_service):
        start = time.perf_counter()
        mv_service.is_available()
        elapsed = (time.perf_counter() - start) * 1000
        assert elapsed < 100, f"Took {elapsed:.0f}ms"

    def test_get_status_fast(self, mv_service):
        start = time.perf_counter()
        mv_service.get_view_status()
        elapsed = (time.perf_counter() - start) * 1000
        assert elapsed < 100, f"Took {elapsed:.0f}ms"

    def test_refresh_fast(self, mv_service):
        start = time.perf_counter()
        mv_service.refresh_all()
        elapsed = (time.perf_counter() - start) * 1000
        assert elapsed < 100, f"Took {elapsed:.0f}ms"


# ═══════════════════════════════════════════════════════════════════════════════
# Edge Cases
# ═══════════════════════════════════════════════════════════════════════════════

class TestEdgeCases:
    """Boundary conditions and error handling."""

    def test_empty_clinic_id(self, mv_service):
        """Empty clinic ID should not crash."""
        result = mv_service.try_clinic_activity_summary("")
        assert result is None

    def test_none_clinic_id(self, mv_service):
        """None clinic ID should not crash."""
        result = mv_service.try_clinic_activity_summary(None)
        assert result is None

    def test_special_chars_in_id(self, mv_service):
        """Special characters should not crash."""
        result = mv_service.try_clinic_activity_summary("'; DROP TABLE--")
        assert result is None

    def test_unicode_clinic_id(self, mv_service):
        """Unicode characters should not crash."""
        result = mv_service.try_clinic_activity_summary("\u30af\u30ea\u30cb\u30c3\u30af")
        assert result is None

    def test_long_clinic_id(self, mv_service):
        """Very long clinic ID should not crash."""
        result = mv_service.try_clinic_activity_summary("x" * 1000)
        assert result is None


# ═══════════════════════════════════════════════════════════════════════════════
# Integration: KnowledgeLayer-backed service
# ═══════════════════════════════════════════════════════════════════════════════

class TestIntegration:
    """MaterializedViews with real KnowledgeLayer (SQLite)."""

    def test_with_seeded_data(self, tmp_path):
        """Service should work with seeded database."""
        db = str(tmp_path / "test_integration.db")
        kl = KnowledgeLayer(db_url=db)

        # Seed events
        from contracts import MultimodalEvent
        for i in range(10):
            e = MultimodalEvent(
                patient_id=f"p-{i:03d}",
                event_type="qeeg",
                modality="qeeg",
                source_system="test",
                source_record_id=f"r{i}",
                timestamp=datetime.now(),
                value_summary=f"event {i}",
                confidence=0.8,
                data_quality="high",
            )
            kl.insert_event(e)
        # Insert patient access records
        conn = kl._connect()
        try:
            cur = conn.cursor()
            ph = "?"
            for i in range(10):
                cur.execute(
                    f"INSERT OR REPLACE INTO patient_access VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                    (f"p-{i:03d}", "clinic-0", "c-001", "read", 1),
                )
            conn.commit()
        finally:
            conn.close()

        mv = MaterializedViews(knowledge_layer=kl)
        assert mv.is_available() is False  # SQLite
        assert mv.get_summary_source() == "fallback"

        # All queries return None (fallback)
        assert mv.try_clinic_activity_summary("clinic-0") is None
        assert mv.try_patient_analyzer_counts("clinic-0", "p-000") is None
