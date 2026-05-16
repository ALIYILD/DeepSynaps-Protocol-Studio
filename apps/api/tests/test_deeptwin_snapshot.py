"""Tests for DeepTwin Snapshot Engine, Export Engine, and Audit Logger.

Coverage:
- Snapshot generation (orchestrates all 6 engines)
- Modality coverage (all 18 modalities)
- Recency status classification (fresh / stale / old / missing)
- Forecast status is always "unavailable"
- No causal overclaiming in output
- Safety disclaimer present
- Uncertainty drivers populated
- Hypothesis provenance tracked
- Export snapshot (json, pdf, report_handoff, protocol_handoff)
- Report handoff
- Protocol handoff
- Audit event logging (all 9 event types)
- Safety: confidence never >= 0.95
- Safety: correlation labels
- Safety: hypothesis labels
"""

from __future__ import annotations

import sys
import os
import tempfile
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Generator

# Ensure the source package is importable
sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(__file__), "..", "src", "deepsynaps"
    ),
)

import pytest

from contracts import MultimodalEvent, IntelligenceOutput
from deeptwin_contracts import (
    DeepTwinSnapshot,
    DeepTwinAuditEvent,
    DeepTwinExport,
)
from knowledge_layer import KnowledgeLayer
from deeptwin_snapshot import DeepTwinSnapshotEngine
from deeptwin_export import DeepTwinExportEngine
from deeptwin_audit import DeepTwinAuditLogger
from safety_governance import SafetyGovernance


# ====================================================================
# Fixtures
# ====================================================================

@pytest.fixture
def knowledge_layer() -> Generator[KnowledgeLayer, None, None]:
    """Fresh file-backed knowledge layer for each test.

    Uses a temporary file instead of :memory: because SQLite :memory:
    databases are connection-isolated — each new connection gets a
    separate empty database.  A file-backed DB ensures all operations
    within a test share the same schema and data.
    """
    tmp_dir = tempfile.mkdtemp(prefix="deeptwin_test_")
    db_file = os.path.join(tmp_dir, f"test_{uuid.uuid4().hex[:8]}.db")
    kl = KnowledgeLayer(db_path=db_file)
    yield kl
    # Cleanup
    try:
        os.unlink(db_file)
        os.rmdir(tmp_dir)
    except OSError:
        pass


@pytest.fixture
def snapshot_engine(knowledge_layer: KnowledgeLayer) -> DeepTwinSnapshotEngine:
    """DeepTwinSnapshotEngine backed by an empty knowledge layer."""
    return DeepTwinSnapshotEngine(knowledge_layer)


@pytest.fixture
def export_engine(knowledge_layer: KnowledgeLayer) -> DeepTwinExportEngine:
    """DeepTwinExportEngine backed by a fresh knowledge layer."""
    return DeepTwinExportEngine(knowledge_layer)


@pytest.fixture
def audit_logger(knowledge_layer: KnowledgeLayer) -> DeepTwinAuditLogger:
    """DeepTwinAuditLogger backed by a fresh knowledge layer."""
    return DeepTwinAuditLogger(knowledge_layer)


@pytest.fixture
def sample_events(knowledge_layer: KnowledgeLayer) -> List[MultimodalEvent]:
    """Seed the knowledge layer with realistic sample events."""
    now = datetime.now()
    patient_id = "P_test_001"
    events = [
        MultimodalEvent(
            patient_id=patient_id,
            event_type="assessment",
            modality="assessment",
            source_system="ehr",
            source_record_id="ass_001",
            timestamp=now - timedelta(days=5),
            value_summary="MMSE score 26/30",
            confidence=0.85,
            data_quality="high",
        ),
        MultimodalEvent(
            patient_id=patient_id,
            event_type="qeeg_record",
            modality="qeeg",
            source_system="neuro_lab",
            source_record_id="qeeg_001",
            timestamp=now - timedelta(days=7),
            value_summary="Elevated delta power frontal regions",
            confidence=0.72,
            data_quality="medium",
        ),
        MultimodalEvent(
            patient_id=patient_id,
            event_type="mri_scan",
            modality="mri",
            source_system="radiology",
            source_record_id="mri_001",
            timestamp=now - timedelta(days=45),
            value_summary="Mild hippocampal atrophy",
            confidence=0.88,
            data_quality="high",
        ),
        MultimodalEvent(
            patient_id=patient_id,
            event_type="biomarker_draw",
            modality="biomarker",
            source_system="lab",
            source_record_id="bio_001",
            timestamp=now - timedelta(days=10),
            value_summary="NfL elevated at 45 pg/mL",
            confidence=0.78,
            data_quality="high",
        ),
        MultimodalEvent(
            patient_id=patient_id,
            event_type="medication",
            modality="medication",
            source_system="pharmacy",
            source_record_id="med_001",
            timestamp=now - timedelta(days=3),
            value_summary="Started donepezil 5mg",
            confidence=0.95,
            data_quality="high",
        ),
        MultimodalEvent(
            patient_id=patient_id,
            event_type="session_note",
            modality="session",
            source_system="ehr",
            source_record_id="sess_001",
            timestamp=now - timedelta(days=20),
            value_summary="Cognitive therapy session 3",
            confidence=0.80,
            data_quality="medium",
        ),
        MultimodalEvent(
            patient_id=patient_id,
            event_type="voice_sample",
            modality="voice",
            source_system="app",
            source_record_id="vox_001",
            timestamp=now - timedelta(days=2),
            value_summary="Voice prosody analysis",
            confidence=0.55,
            data_quality="medium",
        ),
        MultimodalEvent(
            patient_id=patient_id,
            event_type="wearable_sync",
            modality="wearable",
            source_system="fitbit",
            source_record_id="wear_001",
            timestamp=now - timedelta(days=1),
            value_summary="Sleep 6.2h, steps 4500",
            confidence=0.60,
            data_quality="medium",
        ),
        MultimodalEvent(
            patient_id=patient_id,
            event_type="patient_checkin",
            modality="patient_checkin",
            source_system="patient_app",
            source_record_id="pc_001",
            timestamp=now - timedelta(days=4),
            value_summary="Mood reported as stable",
            confidence=0.70,
            data_quality="high",
        ),
        MultimodalEvent(
            patient_id=patient_id,
            event_type="risk_flag",
            modality="risk_signal",
            source_system="monitoring",
            source_record_id="risk_001",
            timestamp=now - timedelta(days=30),
            value_summary="Missed dose alert triggered",
            confidence=0.65,
            data_quality="medium",
        ),
    ]
    for ev in events:
        knowledge_layer.insert_event(ev)
    return events


@pytest.fixture
def populated_engine(
    knowledge_layer: KnowledgeLayer, sample_events: List[MultimodalEvent]
) -> DeepTwinSnapshotEngine:
    """Snapshot engine with seeded patient data."""
    return DeepTwinSnapshotEngine(knowledge_layer)


# ====================================================================
# 1. Snapshot Generation
# ====================================================================

class TestSnapshotGeneration:
    """Tests for DeepTwinSnapshotEngine.generate_snapshot()."""

    def test_generate_snapshot_returns_deeptwin_snapshot(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """generate_snapshot must return a DeepTwinSnapshot instance."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert isinstance(snapshot, DeepTwinSnapshot)

    def test_snapshot_has_patient_id(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Snapshot must carry the correct patient_id."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert snapshot.patient_id == "P_test_001"

    def test_snapshot_has_snapshot_id(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Snapshot must auto-generate a snapshot_id."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert snapshot.snapshot_id
        assert snapshot.snapshot_id.startswith("dts_")

    def test_snapshot_has_timeline_events(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Snapshot must include timeline events."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert len(snapshot.timeline_events) > 0

    def test_snapshot_has_correlation_findings(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """Snapshot may include correlation findings (depends on data)."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        # correlations may be empty but the field must exist
        assert isinstance(snapshot.correlation_findings, list)

    def test_snapshot_has_confounders(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Snapshot may include confounders."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert isinstance(snapshot.confounders, list)

    def test_snapshot_has_ranked_hypotheses(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """Snapshot may include ranked hypotheses."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert isinstance(snapshot.ranked_hypotheses, list)

    def test_snapshot_has_quality_flags(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Snapshot may include data quality flags."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert isinstance(snapshot.data_quality_flags, list)

    def test_snapshot_has_evidence_links(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Snapshot may include evidence links."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert isinstance(snapshot.evidence_links, list)

    def test_empty_patient_generates_snapshot(
        self, snapshot_engine: DeepTwinSnapshotEngine
    ) -> None:
        """A patient with no data must still produce a valid snapshot."""
        snapshot = snapshot_engine.generate_snapshot("P_nonexistent")
        assert isinstance(snapshot, DeepTwinSnapshot)
        assert snapshot.patient_id == "P_nonexistent"
        assert snapshot.timeline_events == []
        assert snapshot.forecast_status == "unavailable: no calibrated model"

    def test_max_hypotheses_parameter(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """max_hypotheses parameter should be passed through."""
        snapshot = populated_engine.generate_snapshot("P_test_001", max_hypotheses=2)
        # If hypotheses exist, they should be at most 2
        assert len(snapshot.ranked_hypotheses) <= 2


# ====================================================================
# 2. Modality Coverage (18 modalities)
# ====================================================================

class TestModalityCoverage:
    """Tests for get_modality_coverage — all 18 canonical modalities."""

    def test_all_18_modalities_present(self, snapshot_engine: DeepTwinSnapshotEngine) -> None:
        """Coverage map must contain exactly all 18 modalities."""
        now = datetime.now()
        events = [
            MultimodalEvent(
                patient_id="P_cov",
                event_type="t",
                modality="assessment",
                source_system="s",
                source_record_id="r1",
                timestamp=now,
                value_summary="v",
            ),
            MultimodalEvent(
                patient_id="P_cov",
                event_type="t",
                modality="qeeg",
                source_system="s",
                source_record_id="r2",
                timestamp=now,
                value_summary="v",
            ),
        ]
        coverage = snapshot_engine.get_modality_coverage(events)
        expected_modalities = snapshot_engine.ALL_MODALITIES
        assert sorted(coverage.keys()) == sorted(expected_modalities)

    def test_coverage_true_for_present(self, snapshot_engine: DeepTwinSnapshotEngine) -> None:
        """Present modalities must map to True."""
        now = datetime.now()
        events = [
            MultimodalEvent(
                patient_id="P_cov",
                event_type="t",
                modality="mri",
                source_system="s",
                source_record_id="r1",
                timestamp=now,
                value_summary="v",
            ),
        ]
        coverage = snapshot_engine.get_modality_coverage(events)
        assert coverage["mri"] is True

    def test_coverage_false_for_absent(self, snapshot_engine: DeepTwinSnapshotEngine) -> None:
        """Absent modalities must map to False."""
        now = datetime.now()
        events = [
            MultimodalEvent(
                patient_id="P_cov",
                event_type="t",
                modality="mri",
                source_system="s",
                source_record_id="r1",
                timestamp=now,
                value_summary="v",
            ),
        ]
        coverage = snapshot_engine.get_modality_coverage(events)
        assert coverage["lab"] is False
        assert coverage["voice"] is False
        assert coverage["wearable"] is False

    def test_coverage_with_populated_data(
        self, populated_engine: DeepTwinSnapshotEngine, sample_events: List[MultimodalEvent]
    ) -> None:
        """Coverage must reflect all 10 seeded modalities."""
        coverage = populated_engine.get_modality_coverage(sample_events)
        true_count = sum(1 for v in coverage.values() if v)
        assert true_count == 10  # 10 modalities seeded
        # Verify specific ones
        assert coverage["assessment"] is True
        assert coverage["qeeg"] is True
        assert coverage["mri"] is True
        assert coverage["biomarker"] is True
        assert coverage["medication"] is True
        assert coverage["session"] is True
        assert coverage["voice"] is True
        assert coverage["wearable"] is True
        assert coverage["patient_checkin"] is True
        assert coverage["risk_signal"] is True
        # And some that should be absent
        assert coverage["video"] is False
        assert coverage["movement"] is False
        assert coverage["digital_phenotyping"] is False
        assert coverage["document"] is False


# ====================================================================
# 3. Recency Status Classification
# ====================================================================

class TestRecencyStatus:
    """Tests for get_recency_status — fresh / stale / old / missing."""

    def test_recency_all_18_modalities(self, snapshot_engine: DeepTwinSnapshotEngine) -> None:
        """Recency status must cover all 18 modalities."""
        now = datetime.now()
        events = [
            MultimodalEvent(
                patient_id="P_rec",
                event_type="t",
                modality="assessment",
                source_system="s",
                source_record_id="r1",
                timestamp=now - timedelta(days=5),
                value_summary="v",
            ),
        ]
        status = snapshot_engine.get_recency_status(events)
        assert sorted(status.keys()) == sorted(snapshot_engine.ALL_MODALITIES)

    def test_recency_fresh(self, snapshot_engine: DeepTwinSnapshotEngine) -> None:
        """Event < 14 days old → "fresh"."""
        now = datetime.now()
        events = [
            MultimodalEvent(
                patient_id="P_rec",
                event_type="t",
                modality="assessment",
                source_system="s",
                source_record_id="r1",
                timestamp=now - timedelta(days=5),
                value_summary="v",
            ),
        ]
        status = snapshot_engine.get_recency_status(events)
        assert status["assessment"] == "fresh"

    def test_recency_stale(self, snapshot_engine: DeepTwinSnapshotEngine) -> None:
        """Event 14–90 days old → "stale"."""
        now = datetime.now()
        events = [
            MultimodalEvent(
                patient_id="P_rec",
                event_type="t",
                modality="mri",
                source_system="s",
                source_record_id="r1",
                timestamp=now - timedelta(days=45),
                value_summary="v",
            ),
        ]
        status = snapshot_engine.get_recency_status(events)
        assert status["mri"] == "stale"

    def test_recency_old(self, snapshot_engine: DeepTwinSnapshotEngine) -> None:
        """Event > 90 days old → "old"."""
        now = datetime.now()
        events = [
            MultimodalEvent(
                patient_id="P_rec",
                event_type="t",
                modality="lab",
                source_system="s",
                source_record_id="r1",
                timestamp=now - timedelta(days=120),
                value_summary="v",
            ),
        ]
        status = snapshot_engine.get_recency_status(events)
        assert status["lab"] == "old"

    def test_recency_missing(self, snapshot_engine: DeepTwinSnapshotEngine) -> None:
        """No events for modality → "missing"."""
        now = datetime.now()
        events = [
            MultimodalEvent(
                patient_id="P_rec",
                event_type="t",
                modality="mri",
                source_system="s",
                source_record_id="r1",
                timestamp=now - timedelta(days=45),
                value_summary="v",
            ),
        ]
        status = snapshot_engine.get_recency_status(events)
        assert status["video"] == "missing"
        assert status["wearable"] == "missing"

    def test_recency_with_populated_data(
        self, populated_engine: DeepTwinSnapshotEngine, sample_events: List[MultimodalEvent]
    ) -> None:
        """Recency classification on 10 seeded events."""
        status = populated_engine.get_recency_status(sample_events)
        # wearable is 1 day old → fresh
        assert status["wearable"] == "fresh"
        # voice is 2 days old → fresh
        assert status["voice"] == "fresh"
        # medication is 3 days old → fresh
        assert status["medication"] == "fresh"
        # patient_checkin is 4 days old → fresh
        assert status["patient_checkin"] == "fresh"
        # assessment is 5 days old → fresh
        assert status["assessment"] == "fresh"
        # biomarker is 10 days old → fresh
        assert status["biomarker"] == "fresh"
        # qeeg is 7 days old → fresh
        assert status["qeeg"] == "fresh"
        # session is 20 days old → fresh (just under 14) ... wait, it's 20 days
        # Actually 20 days is stale (>= 14)
        assert status["session"] == "stale"
        # risk_signal is 30 days old → stale
        assert status["risk_signal"] == "stale"
        # mri is 45 days old → stale
        assert status["mri"] == "stale"
        # And missing ones
        assert status["video"] == "missing"
        assert status["movement"] == "missing"
        assert status["digital_phenotyping"] == "missing"
        assert status["document"] == "missing"
        assert status["lab"] == "missing"
        assert status["intervention"] == "missing"
        assert status["text"] == "missing"


# ====================================================================
# 4. Forecast Status
# ====================================================================

class TestForecastStatus:
    """Tests that forecast is ALWAYS unavailable — never faked."""

    def test_forecast_always_unavailable(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Forecast status must always be the unavailable string."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert snapshot.forecast_status == "unavailable: no calibrated model"

    def test_forecast_unavailable_empty_patient(
        self, snapshot_engine: DeepTwinSnapshotEngine
    ) -> None:
        """Forecast must be unavailable even for patients with no data."""
        snapshot = snapshot_engine.generate_snapshot("P_empty")
        assert snapshot.forecast_status == "unavailable: no calibrated model"


# ====================================================================
# 5. No Causal Overclaiming
# ====================================================================

class TestNoCausalOverclaiming:
    """Ensure outputs never claim causality."""

    def test_correlation_findings_labeled_temporal(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """All correlation findings must carry temporal-association label."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        for corr in snapshot.correlation_findings:
            labels = corr.get("safety_labels", [])
            has_temporal_label = any(
                "Temporal association only" in label for label in labels
            )
            assert has_temporal_label, (
                f"Correlation {corr.get('insight_id')} missing temporal label"
            )

    def test_no_causal_language_in_correlation_summary(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """Correlation summaries must not contain causal overclaiming."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        for corr in snapshot.correlation_findings:
            summary = corr.get("summary", "")
            assert not SafetyGovernance.contains_causal_overclaiming(summary), (
                f"Correlation summary has causal language: {summary[:100]}"
            )


# ====================================================================
# 6. Safety Disclaimer
# ====================================================================

class TestSafetyDisclaimer:
    """Safety disclaimer must always be present."""

    def test_safety_disclaimer_present(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Snapshot must include the safety disclaimer."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert snapshot.safety_disclaimer
        assert "Decision support only" in snapshot.safety_disclaimer
        assert "Requires clinician review" in snapshot.safety_disclaimer

    def test_safety_disclaimer_on_empty_patient(
        self, snapshot_engine: DeepTwinSnapshotEngine
    ) -> None:
        """Safety disclaimer present even for empty patients."""
        snapshot = snapshot_engine.generate_snapshot("P_empty")
        assert "Decision support only" in snapshot.safety_disclaimer


# ====================================================================
# 7. Uncertainty Drivers
# ====================================================================

class TestUncertaintyDrivers:
    """Uncertainty drivers must be populated from all engines."""

    def test_uncertainty_drivers_not_empty(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Snapshot must have at least one uncertainty driver."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert len(snapshot.uncertainty_drivers) > 0

    def test_uncertainty_drivers_is_list_of_strings(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """uncertainty_drivers must be a list of strings."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert isinstance(snapshot.uncertainty_drivers, list)
        for d in snapshot.uncertainty_drivers:
            assert isinstance(d, str)

    def test_default_uncertainty_drivers_on_empty_patient(
        self, snapshot_engine: DeepTwinSnapshotEngine
    ) -> None:
        """Empty patient still gets default uncertainty drivers."""
        snapshot = snapshot_engine.generate_snapshot("P_empty")
        assert len(snapshot.uncertainty_drivers) > 0


# ====================================================================
# 8. Hypothesis Provenance
# ====================================================================

class TestHypothesisProvenance:
    """Provenance must track which engines ran."""

    def test_provenance_has_engines(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Provenance must list all 7 engines that ran."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        engines = snapshot.provenance.get("engines", [])
        assert "MultimodalTimelineEngine" in engines
        assert "CorrelationEngine" in engines
        assert "ConfoundEngine" in engines
        assert "MissingDataEngine" in engines
        assert "HypothesisRankingEngine" in engines
        assert "EvidenceLinkingEngine" in engines
        assert "SafetyGovernance" in engines
        assert len(engines) == 7

    def test_provenance_has_timestamp(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Provenance must include a generation timestamp."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert snapshot.provenance.get("timestamp")

    def test_provenance_has_version(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Provenance must include a version string."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert snapshot.provenance.get("version") == "4.0.0"

    def test_provenance_safety_flag(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Provenance must flag that safety governance was applied."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert snapshot.provenance.get("safety_governance_applied") is True

    def test_provenance_forecast_policy(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """Provenance must record the never-fake forecast policy."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        assert snapshot.provenance.get("forecast_policy") == "never_faked"


# ====================================================================
# 9. Export Snapshot
# ====================================================================

class TestExportSnapshot:
    """Tests for DeepTwinExportEngine.export_snapshot()."""

    @pytest.fixture
    def sample_snapshot(self, populated_engine: DeepTwinSnapshotEngine) -> DeepTwinSnapshot:
        """A pre-generated snapshot for export tests."""
        return populated_engine.generate_snapshot("P_test_001")

    def test_export_json(self, export_engine: DeepTwinExportEngine, sample_snapshot: DeepTwinSnapshot) -> None:
        """JSON export must return a DeepTwinExport."""
        export = export_engine.export_snapshot(sample_snapshot, "json")
        assert isinstance(export, DeepTwinExport)
        assert export.export_type == "json"
        assert export.snapshot_id == sample_snapshot.snapshot_id

    def test_export_pdf(self, export_engine: DeepTwinExportEngine, sample_snapshot: DeepTwinSnapshot) -> None:
        """PDF export must return a DeepTwinExport."""
        export = export_engine.export_snapshot(sample_snapshot, "pdf")
        assert isinstance(export, DeepTwinExport)
        assert export.export_type == "pdf"
        assert "sections" in export.content

    def test_export_report_handoff(
        self, export_engine: DeepTwinExportEngine, sample_snapshot: DeepTwinSnapshot
    ) -> None:
        """Report handoff export must include summary metadata."""
        export = export_engine.export_snapshot(sample_snapshot, "report_handoff")
        assert isinstance(export, DeepTwinExport)
        assert export.export_type == "report_handoff"
        assert "snapshot_summary" in export.content

    def test_export_protocol_handoff(
        self, export_engine: DeepTwinExportEngine, sample_snapshot: DeepTwinSnapshot
    ) -> None:
        """Protocol handoff export must include modality coverage."""
        export = export_engine.export_snapshot(sample_snapshot, "protocol_handoff")
        assert isinstance(export, DeepTwinExport)
        assert export.export_type == "protocol_handoff"
        assert "modality_coverage" in export.content
        assert "ranked_hypotheses" in export.content

    def test_export_invalid_type_raises(
        self, export_engine: DeepTwinExportEngine, sample_snapshot: DeepTwinSnapshot
    ) -> None:
        """Invalid export_type must raise ValueError."""
        with pytest.raises(ValueError, match="Invalid export_type"):
            export_engine.export_snapshot(sample_snapshot, "invalid_type")

    def test_export_has_safety_header(
        self, export_engine: DeepTwinExportEngine, sample_snapshot: DeepTwinSnapshot
    ) -> None:
        """Every export must include the safety header in content."""
        export = export_engine.export_snapshot(sample_snapshot, "json")
        assert "safety_header" in export.content
        assert "Decision support only" in export.content["safety_header"]

    def test_export_has_audit_reference(
        self, export_engine: DeepTwinExportEngine, sample_snapshot: DeepTwinSnapshot
    ) -> None:
        """Every export must have an audit_reference."""
        export = export_engine.export_snapshot(sample_snapshot, "json")
        assert export.audit_reference
        assert export.audit_reference.startswith("audit_")


# ====================================================================
# 10. Report Handoff
# ====================================================================

class TestReportHandoff:
    """Tests for handoff_to_report."""

    def test_report_handoff_returns_string(
        self, export_engine: DeepTwinExportEngine
    ) -> None:
        """handoff_to_report must return a handoff ID string."""
        handoff_id = export_engine.handoff_to_report(
            snapshot_id="dts_test_001",
            patient_id="P_test",
            clinician_id="CL_001",
        )
        assert isinstance(handoff_id, str)
        assert handoff_id.startswith("rpt_ho_")

    def test_report_handoff_unique_ids(
        self, export_engine: DeepTwinExportEngine
    ) -> None:
        """Each handoff must produce a unique ID."""
        id1 = export_engine.handoff_to_report("dts_1", "P_1", "CL_1")
        id2 = export_engine.handoff_to_report("dts_1", "P_1", "CL_1")
        assert id1 != id2


# ====================================================================
# 11. Protocol Handoff
# ====================================================================

class TestProtocolHandoff:
    """Tests for handoff_to_protocol."""

    def test_protocol_handoff_returns_string(
        self, export_engine: DeepTwinExportEngine
    ) -> None:
        """handoff_to_protocol must return a handoff ID string."""
        handoff_id = export_engine.handoff_to_protocol(
            snapshot_id="dts_test_001",
            patient_id="P_test",
            clinician_id="CL_001",
        )
        assert isinstance(handoff_id, str)
        assert handoff_id.startswith("proto_ho_")

    def test_protocol_handoff_unique_ids(
        self, export_engine: DeepTwinExportEngine
    ) -> None:
        """Each protocol handoff must produce a unique ID."""
        id1 = export_engine.handoff_to_protocol("dts_1", "P_1", "CL_1")
        id2 = export_engine.handoff_to_protocol("dts_1", "P_1", "CL_1")
        assert id1 != id2


# ====================================================================
# 12. Audit Event Logging
# ====================================================================

class TestAuditLogging:
    """Tests for DeepTwinAuditLogger — all 9 event types."""

    def test_log_deeptwin_opened(self, audit_logger: DeepTwinAuditLogger) -> None:
        """log_deeptwin_opened must return an event_id."""
        event_id = audit_logger.log_deeptwin_opened("P_1", "CL_1")
        assert event_id
        assert event_id.startswith("dtae_")

    def test_log_snapshot_generated(self, audit_logger: DeepTwinAuditLogger) -> None:
        """log_snapshot_generated must log and return event_id."""
        event_id = audit_logger.log_snapshot_generated("P_1", "CL_1", "dts_001")
        assert event_id.startswith("dtae_")

    def test_log_synthesis_requested(self, audit_logger: DeepTwinAuditLogger) -> None:
        """log_synthesis_requested must log and return event_id."""
        event_id = audit_logger.log_synthesis_requested("P_1", "CL_1", "dts_001")
        assert event_id.startswith("dtae_")

    def test_log_hypothesis_accepted(self, audit_logger: DeepTwinAuditLogger) -> None:
        """log_hypothesis_accepted must log and return event_id."""
        event_id = audit_logger.log_hypothesis_accepted("P_1", "CL_1", "dts_001", "hyp_001")
        assert event_id.startswith("dtae_")

    def test_log_hypothesis_rejected(self, audit_logger: DeepTwinAuditLogger) -> None:
        """log_hypothesis_rejected must log and return event_id."""
        event_id = audit_logger.log_hypothesis_rejected("P_1", "CL_1", "dts_001", "hyp_001")
        assert event_id.startswith("dtae_")

    def test_log_report_handoff(self, audit_logger: DeepTwinAuditLogger) -> None:
        """log_report_handoff must log and return event_id."""
        event_id = audit_logger.log_report_handoff("P_1", "CL_1", "dts_001", "ho_001")
        assert event_id.startswith("dtae_")

    def test_log_protocol_handoff(self, audit_logger: DeepTwinAuditLogger) -> None:
        """log_protocol_handoff must log and return event_id."""
        event_id = audit_logger.log_protocol_handoff("P_1", "CL_1", "dts_001", "ho_001")
        assert event_id.startswith("dtae_")

    def test_log_export_generated(self, audit_logger: DeepTwinAuditLogger) -> None:
        """log_export_generated must log and return event_id."""
        event_id = audit_logger.log_export_generated("P_1", "CL_1", "dts_001", "exp_001")
        assert event_id.startswith("dtae_")

    def test_log_review_completed(self, audit_logger: DeepTwinAuditLogger) -> None:
        """log_review_completed must log and return event_id."""
        event_id = audit_logger.log_review_completed("P_1", "CL_1", "dts_001", "rev_001")
        assert event_id.startswith("dtae_")

    def test_log_event_with_invalid_type_raises(
        self, audit_logger: DeepTwinAuditLogger
    ) -> None:
        """Logging an invalid event_type must raise ValueError."""
        with pytest.raises(ValueError, match="Invalid event_type"):
            audit_logger.log_event(
                DeepTwinAuditEvent(
                    patient_id="P_1",
                    clinician_id="CL_1",
                    event_type="invalid_event_type",
                )
            )

    def test_log_event_generic(self, audit_logger: DeepTwinAuditLogger) -> None:
        """log_event with a valid DeepTwinAuditEvent must return event_id."""
        event = DeepTwinAuditEvent(
            patient_id="P_1",
            clinician_id="CL_1",
            event_type="deeptwin_opened",
            details={"status": "test"},
        )
        event_id = audit_logger.log_event(event)
        assert event_id == event.event_id

    def test_all_event_types_are_valid(self) -> None:
        """All convenience methods must use valid event types."""
        valid_types = DeepTwinAuditEvent.VALID_EVENT_TYPES
        convenience_types = [
            "deeptwin_opened",
            "snapshot_generated",
            "synthesis_requested",
            "hypothesis_accepted",
            "hypothesis_rejected",
            "report_handoff",
            "protocol_handoff",
            "export_generated",
            "review_completed",
        ]
        for et in convenience_types:
            assert et in valid_types


# ====================================================================
# 13. Safety: Confidence Never >= 0.95
# ====================================================================

class TestConfidenceSafety:
    """Ensure no output has confidence >= 0.95."""

    def test_hypotheses_confidence_below_max(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """All hypothesis confidences must be < 0.95."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        for hyp in snapshot.ranked_hypotheses:
            assert hyp.get("confidence", 0.0) < 0.95, (
                f"Hypothesis {hyp.get('insight_id')} has confidence >= 0.95"
            )

    def test_correlation_confidence_below_max(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """All correlation confidences must be < 0.95."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        for corr in snapshot.correlation_findings:
            assert corr.get("confidence", 0.0) < 0.95, (
                f"Correlation {corr.get('insight_id')} has confidence >= 0.95"
            )

    def test_quality_flag_confidence_below_max(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """All quality flag confidences must be < 0.95."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        for qf in snapshot.data_quality_flags:
            assert qf.get("confidence", 0.0) < 0.95, (
                f"Quality flag {qf.get('insight_id')} has confidence >= 0.95"
            )


# ====================================================================
# 14. Safety: Hypothesis Labels
# ====================================================================

class TestHypothesisLabels:
    """Hypotheses must carry required safety labels."""

    def test_hypotheses_have_review_label(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """All hypotheses must have 'Requires clinician review' label."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        for hyp in snapshot.ranked_hypotheses:
            labels = hyp.get("safety_labels", [])
            has_review = any("Requires clinician review" in label for label in labels)
            assert has_review, (
                f"Hypothesis {hyp.get('insight_id')} missing review label"
            )

    def test_hypotheses_have_ranked_label(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """All hypotheses must have 'Ranked hypothesis' label."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        for hyp in snapshot.ranked_hypotheses:
            labels = hyp.get("safety_labels", [])
            has_ranked = any("Ranked" in label for label in labels)
            assert has_ranked, (
                f"Hypothesis {hyp.get('insight_id')} missing ranked label"
            )


# ====================================================================
# 15. DeepTwinSnapshot.to_dict serialization
# ====================================================================

class TestSnapshotSerialization:
    """Test that DeepTwinSnapshot serializes correctly."""

    def test_to_dict_returns_dict(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """to_dict must return a dictionary."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        d = snapshot.to_dict()
        assert isinstance(d, dict)

    def test_to_dict_has_all_keys(self, populated_engine: DeepTwinSnapshotEngine) -> None:
        """to_dict must include all expected snapshot fields."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        d = snapshot.to_dict()
        expected_keys = [
            "snapshot_id", "patient_id", "generated_at",
            "modality_coverage", "recency_status",
            "data_quality_flags", "timeline_events",
            "correlation_findings", "confounders",
            "ranked_hypotheses", "evidence_links",
            "uncertainty_drivers", "forecast_status",
            "clinician_review_status", "provenance",
            "safety_disclaimer",
        ]
        for key in expected_keys:
            assert key in d, f"Missing key: {key}"

    def test_clinician_review_status_defaults(
        self, populated_engine: DeepTwinSnapshotEngine
    ) -> None:
        """Default review status must be unreviewed."""
        snapshot = populated_engine.generate_snapshot("P_test_001")
        review = snapshot.clinician_review_status
        assert review.get("reviewed") is False
        assert review.get("reviewed_by") is None
        assert review.get("reviewed_at") is None
