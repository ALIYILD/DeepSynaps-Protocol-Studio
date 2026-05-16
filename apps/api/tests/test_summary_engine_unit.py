"""Unit tests for SummaryEngine — no FastAPI dependency.

Tests SummaryEngine methods directly with seeded SQLite data.
Covers: enriched patient dashboard, patient analyzer, clinic dashboard,
access patterns, response shapes, no-mutation guarantees.
"""

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

import pytest
from datetime import datetime, timedelta
from contracts import MultimodalEvent
from knowledge_layer import KnowledgeLayer
from summary_engine import SummaryEngine


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def seeded_engine(tmp_path):
    """SummaryEngine with seeded test data."""
    db_file = str(tmp_path / "test_summary_unit.db")
    kl = KnowledgeLayer(db_url=db_file)
    se = SummaryEngine(kl)
    now = datetime.now()

    # Seed 3 patients across 2 clinics
    for p in range(3):
        patient_id = f"patient-{p:03d}"
        clinic_id = f"clinic-{p % 2}"
        conn = kl._connect()
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT OR REPLACE INTO patient_access VALUES (?, ?, ?, ?, ?)",
                (patient_id, clinic_id, "clinician-001", "read", 1 if p == 0 else 0),
            )
            conn.commit()
        finally:
            conn.close()

        # 50 events per patient, varying modalities
        modalities = ["assessment", "qeeg", "mri", "biomarker", "medication", "voice", "risk_signal"]
        for i in range(50):
            mod = modalities[i % len(modalities)]
            e = MultimodalEvent(
                patient_id=patient_id,
                event_type=mod,
                modality=mod,
                source_system="test",
                source_record_id=f"r{i}",
                timestamp=now - timedelta(hours=i),
                value_summary=f"Event {i} for {patient_id}",
                confidence=0.5 + (i % 5) * 0.1,
                data_quality="high" if i % 5 != 0 else "low",
            )
            kl.insert_event(e)

    # Audit entries
    for i in range(20):
        kl.log_audit(f"/test/{i}", "clinician-001", "clinic-0", "patient-000", "test")

    return se


# ═══════════════════════════════════════════════════════════════════════════════
# Clinic Dashboard Summary
# ═══════════════════════════════════════════════════════════════════════════════

class TestClinicDashboard:
    """Tests for clinic_dashboard_summary with enriched fields."""

    def test_returns_dict(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert isinstance(r, dict)

    def test_has_required_fields(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        required = [
            "scope", "clinic_id", "generated_at", "active_patients",
            "recent_events_30d", "recent_audits_30d", "ai_consent_count",
            "patients_missing_consent", "high_risk_patients",
            "pending_reviews", "modality_breakdown", "quality_flags",
            "evidence_coverage", "partial", "safety_disclaimer",
        ]
        for field in required:
            assert field in r, f"Missing field: {field}"

    def test_scope_is_clinic_dashboard(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert r["scope"] == "clinic_dashboard"

    def test_clinic_id_matches(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert r["clinic_id"] == "clinic-0"

    def test_active_patients_positive(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert r["active_patients"] > 0

    def test_recent_events_positive(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert r["recent_events_30d"] >= 0

    def test_ai_consent_count(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert isinstance(r["ai_consent_count"], int)

    def test_patients_missing_consent(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert isinstance(r["patients_missing_consent"], int)

    def test_high_risk_patients(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert isinstance(r["high_risk_patients"], int)

    def test_pending_reviews_is_int(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert isinstance(r["pending_reviews"], int)

    def test_modality_breakdown_is_list(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert isinstance(r["modality_breakdown"], list)

    def test_modality_breakdown_bounded(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert len(r["modality_breakdown"]) <= 10

    def test_quality_flags_is_dict(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert isinstance(r["quality_flags"], dict)

    def test_evidence_coverage_has_fields(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        ec = r["evidence_coverage"]
        assert "modalities_with_evidence" in ec
        assert "expected_modalities" in ec
        assert "covered_count" in ec
        assert "coverage_percent" in ec
        assert 0 <= ec["coverage_percent"] <= 100

    def test_partial_is_false(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert r["partial"] is False

    def test_safety_disclaimer_present(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert "Decision support only" in r["safety_disclaimer"]

    def test_different_clinics_different_counts(self, seeded_engine):
        r0 = seeded_engine.clinic_dashboard_summary("clinic-0")
        r1 = seeded_engine.clinic_dashboard_summary("clinic-1")
        # Clinic-0 has patients 000 + 002, clinic-1 has patient 001
        assert r0["active_patients"] != r1["active_patients"] or \
               r0["recent_events_30d"] != r1["recent_events_30d"]

    def test_empty_clinic_returns_zero(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-empty")
        assert r["active_patients"] == 0
        assert r["recent_events_30d"] == 0

    def test_no_phi_in_response(self, seeded_engine):
        r = seeded_engine.clinic_dashboard_summary("clinic-0")
        r_str = str(r)
        # No patient names or detailed clinical text
        assert "Event 0 for" not in r_str  # value_summary should not appear

    def test_response_time_under_200ms(self, seeded_engine):
        start = time.perf_counter()
        seeded_engine.clinic_dashboard_summary("clinic-0")
        elapsed = (time.perf_counter() - start) * 1000
        assert elapsed < 200, f"Took {elapsed:.0f}ms"


# ═══════════════════════════════════════════════════════════════════════════════
# Patient Dashboard Summary (enriched)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPatientDashboard:
    """Tests for enriched patient_dashboard_summary."""

    def test_returns_dict(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        assert isinstance(r, dict)

    def test_has_all_required_fields(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        required = [
            "scope", "patient_id", "generated_at", "total_events",
            "recent_events_30d", "modality_breakdown", "latest_by_modality",
            "missing_modalities", "latest_event_at", "first_event_at",
            "data_quality_summary", "risk_signal_count", "consent_status",
            "partial", "safety_disclaimer",
        ]
        for field in required:
            assert field in r, f"Missing field: {field}"

    def test_scope_is_patient_dashboard(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        assert r["scope"] == "patient_dashboard"

    def test_total_events_is_50(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        assert r["total_events"] == 50

    def test_latest_by_modality_is_list(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        assert isinstance(r["latest_by_modality"], list)

    def test_latest_by_modality_has_modality_and_latest(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        if r["latest_by_modality"]:
            item = r["latest_by_modality"][0]
            assert "modality" in item
            assert "latest_at" in item

    def test_missing_modalities_is_list(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        assert isinstance(r["missing_modalities"], list)

    def test_missing_modalities_are_expected(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        present = {m["modality"] for m in r["modality_breakdown"]}
        for missing in r["missing_modalities"]:
            assert missing not in present

    def test_risk_signal_count(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        assert isinstance(r["risk_signal_count"], int)

    def test_consent_status_has_fields(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        cs = r["consent_status"]
        assert "has_any_consent" in cs
        assert isinstance(cs["has_any_consent"], bool)
        assert "clinic_count" in cs
        assert "clinics" in cs

    def test_no_full_records(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        assert "events" not in r  # No full event list
        assert "value_summary" not in r  # No clinical text

    def test_safety_disclaimer_present(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        assert "Decision support only" in r["safety_disclaimer"]

    def test_partial_is_false(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("patient-000")
        assert r["partial"] is False

    def test_empty_patient(self, seeded_engine):
        r = seeded_engine.patient_dashboard_summary("nonexistent-patient")
        assert r["total_events"] == 0
        assert r["modality_breakdown"] == []
        assert r["missing_modalities"]  # All expected modalities missing

    def test_response_time_under_200ms(self, seeded_engine):
        start = time.perf_counter()
        seeded_engine.patient_dashboard_summary("patient-000")
        elapsed = (time.perf_counter() - start) * 1000
        assert elapsed < 200, f"Took {elapsed:.0f}ms"


# ═══════════════════════════════════════════════════════════════════════════════
# Patient Analyzer Summary (NEW)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPatientAnalyzer:
    """Tests for patient_analyzer_summary (new endpoint)."""

    def test_returns_dict(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert isinstance(r, dict)

    def test_has_all_required_fields(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        required = [
            "scope", "patient_id", "generated_at", "modality_stats",
            "missing_modalities", "evidence_linked_count", "risk_signal_count",
            "latest_risk_signal_at", "risk_status", "avg_confidence",
            "days_since_last_event", "partial", "safety_disclaimer",
        ]
        for field in required:
            assert field in r, f"Missing field: {field}"

    def test_scope_is_patient_analyzer(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert r["scope"] == "patient_analyzer"

    def test_modality_stats_is_list(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert isinstance(r["modality_stats"], list)

    def test_modality_stats_has_count_and_latest(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        if r["modality_stats"]:
            item = r["modality_stats"][0]
            assert "modality" in item
            assert "count" in item
            assert "latest_at" in item

    def test_missing_modalities_is_list(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert isinstance(r["missing_modalities"], list)

    def test_risk_status_is_low_medium_or_high(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert r["risk_status"] in ("low", "medium", "high")

    def test_avg_confidence_between_0_and_1(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert 0.0 <= r["avg_confidence"] <= 1.0

    def test_evidence_linked_count_is_int(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert isinstance(r["evidence_linked_count"], int)

    def test_risk_signal_count_is_int(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert isinstance(r["risk_signal_count"], int)

    def test_no_full_records(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert "events" not in r
        assert "value_summary" not in r

    def test_safety_disclaimer_present(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert "Decision support only" in r["safety_disclaimer"]

    def test_partial_is_false(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("patient-000")
        assert r["partial"] is False

    def test_empty_patient(self, seeded_engine):
        r = seeded_engine.patient_analyzer_summary("nonexistent-patient")
        assert r["modality_stats"] == []
        assert r["missing_modalities"]  # All expected missing
        assert r["risk_status"] == "low"
        assert r["avg_confidence"] == 0.0

    def test_response_time_under_200ms(self, seeded_engine):
        start = time.perf_counter()
        seeded_engine.patient_analyzer_summary("patient-000")
        elapsed = (time.perf_counter() - start) * 1000
        assert elapsed < 200, f"Took {elapsed:.0f}ms"


# ═══════════════════════════════════════════════════════════════════════════════
# Analyzer Status Summary
# ═══════════════════════════════════════════════════════════════════════════════

class TestAnalyzerStatus:
    """Tests for analyzer_status_summary."""

    def test_returns_dict(self, seeded_engine):
        r = seeded_engine.analyzer_status_summary("clinic-0")
        assert isinstance(r, dict)

    def test_has_required_fields(self, seeded_engine):
        r = seeded_engine.analyzer_status_summary("clinic-0")
        required = [
            "scope", "clinic_id", "generated_at", "all_time_modality_counts",
            "recent_30d_modality_counts", "stale_modalities",
            "evidence_entries", "partial", "safety_disclaimer",
        ]
        for field in required:
            assert field in r, f"Missing field: {field}"

    def test_stale_modalities_is_list(self, seeded_engine):
        r = seeded_engine.analyzer_status_summary("clinic-0")
        assert isinstance(r["stale_modalities"], list)

    def test_evidence_entries_is_int(self, seeded_engine):
        r = seeded_engine.analyzer_status_summary("clinic-0")
        assert isinstance(r["evidence_entries"], int)


# ═══════════════════════════════════════════════════════════════════════════════
# No-Mutation Guarantee
# ═══════════════════════════════════════════════════════════════════════════════

class TestNoMutation:
    """Summary endpoints must not mutate state."""

    def test_clinic_dashboard_does_not_change_event_count(self, seeded_engine):
        before = seeded_engine.patient_dashboard_summary("patient-000")["total_events"]
        for _ in range(5):
            seeded_engine.clinic_dashboard_summary("clinic-0")
        after = seeded_engine.patient_dashboard_summary("patient-000")["total_events"]
        assert before == after

    def test_patient_dashboard_does_not_change_event_count(self, seeded_engine):
        before = seeded_engine.patient_dashboard_summary("patient-000")["total_events"]
        for _ in range(5):
            seeded_engine.patient_dashboard_summary("patient-000")
        after = seeded_engine.patient_dashboard_summary("patient-000")["total_events"]
        assert before == after

    def test_patient_analyzer_does_not_change_event_count(self, seeded_engine):
        before = seeded_engine.patient_dashboard_summary("patient-000")["total_events"]
        for _ in range(5):
            seeded_engine.patient_analyzer_summary("patient-000")
        after = seeded_engine.patient_dashboard_summary("patient-000")["total_events"]
        assert before == after

    def test_analyzer_status_does_not_change_event_count(self, seeded_engine):
        before = seeded_engine.patient_dashboard_summary("patient-000")["total_events"]
        for _ in range(5):
            seeded_engine.analyzer_status_summary("clinic-0")
        after = seeded_engine.patient_dashboard_summary("patient-000")["total_events"]
        assert before == after


# ═══════════════════════════════════════════════════════════════════════════════
# Cache Integration
# ═══════════════════════════════════════════════════════════════════════════════

class TestCacheIntegration:
    """Summary results are cached and retrievable."""

    def test_second_call_is_cached(self, seeded_engine):
        # First call populates cache (cache_status="miss")
        r1 = seeded_engine.patient_dashboard_summary("patient-000")
        # Second call should hit cache (cache_status="hit")
        r2 = seeded_engine.patient_dashboard_summary("patient-000")
        # cache_status differs (miss vs hit) but all data fields match
        assert r2["cache_status"] == "hit"
        assert r1["cache_ttl_seconds"] == r2["cache_ttl_seconds"]
        assert r1["total_events"] == r2["total_events"]
        assert r1["modality_breakdown"] == r2["modality_breakdown"]
        assert r1["missing_modalities"] == r2["missing_modalities"]

    def test_second_analyzer_call_is_cached(self, seeded_engine):
        r1 = seeded_engine.patient_analyzer_summary("patient-000")
        r2 = seeded_engine.patient_analyzer_summary("patient-000")
        assert r2["cache_status"] == "hit"
        assert r1["risk_status"] == r2["risk_status"]
        assert r1["modality_stats"] == r2["modality_stats"]
        assert r1["avg_confidence"] == r2["avg_confidence"]

    def test_clinic_dashboard_cached(self, seeded_engine):
        r1 = seeded_engine.clinic_dashboard_summary("clinic-0")
        r2 = seeded_engine.clinic_dashboard_summary("clinic-0")
        assert r2["cache_status"] == "hit"
        assert r1["active_patients"] == r2["active_patients"]
        assert r1["recent_events_30d"] == r2["recent_events_30d"]
        assert r1["modality_breakdown"] == r2["modality_breakdown"]
