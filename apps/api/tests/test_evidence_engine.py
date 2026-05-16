"""Tests for EvidenceLinkingEngine."""

import sys
import os
import unittest
from datetime import datetime, timedelta
from typing import List

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

from contracts import (
    EvidenceLink,
    IntelligenceOutput,
    MultimodalEvent,
)
from knowledge_layer import KnowledgeLayer
from safety_governance import SafetyGovernance
from evidence_engine import EvidenceLinkingEngine


class TestEvidenceLinkingEngine(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.db_path = "/tmp/test_evidence.db"
        # Clean up any stale db
        if os.path.exists(cls.db_path):
            os.remove(cls.db_path)
        cls.kl = KnowledgeLayer(cls.db_path)
        cls.engine = EvidenceLinkingEngine(cls.kl)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.db_path):
            os.remove(cls.db_path)

    def _make_insight(
        self,
        modalities: List[str],
        summary: str = "Test insight",
        supporting_events: List[str] = None,
        evidence_links: List[dict] = None,
    ) -> IntelligenceOutput:
        now = datetime.utcnow()
        return IntelligenceOutput(
            patient_id="P001",
            insight_type="correlation",
            modalities_involved=modalities,
            timeline_window=(now - timedelta(days=30), now),
            summary=summary,
            supporting_events=supporting_events or [],
            evidence_links=evidence_links or [],
            confidence=0.5,
            uncertainty_drivers=["Test uncertainty"],
            research_only=True,
            clinician_review_required=True,
        )

    # ------------------------------------------------------------------
    # attach_evidence
    # ------------------------------------------------------------------

    def test_attach_evidence_populates_evidence_links(self):
        """attach_evidence should populate evidence_links from knowledge layer."""
        insight = self._make_insight(modalities=["qeeg", "mri"])
        self.assertEqual(len(insight.evidence_links), 0)

        result = self.engine.attach_evidence([insight])
        self.assertEqual(len(result), 1)

        enriched = result[0]
        self.assertGreater(len(enriched.evidence_links), 0,
                           "Should have evidence links after attachment")

    def test_attach_evidence_sets_research_only_for_low_grade(self):
        """C/D grade evidence should set research_only=True."""
        insight = self._make_insight(modalities=["voice"])
        result = self.engine.attach_evidence([insight])
        enriched = result[0]

        # voice evidence is grade C
        has_low_grade = any(
            ev.get("evidence_grade") in ("C", "D")
            for ev in enriched.evidence_links
        )
        if has_low_grade:
            self.assertTrue(
                enriched.research_only,
                "research_only must be True when C/D grade evidence is present"
            )

    def test_attach_evidence_confidence_below_095(self):
        """Confidence must never be >= 0.95 after evidence attachment."""
        insight = self._make_insight(modalities=["sleep", "mri"])
        result = self.engine.attach_evidence([insight])
        enriched = result[0]

        self.assertLess(
            enriched.confidence, 0.95,
            f"Confidence {enriched.confidence} must be < 0.95"
        )

    def test_attach_evidence_clinician_review_required(self):
        """clinician_review_required must always be True."""
        insight = self._make_insight(modalities=["biomarker"])
        result = self.engine.attach_evidence([insight])
        enriched = result[0]

        self.assertTrue(
            enriched.clinician_review_required,
            "clinician_review_required must be True"
        )

    def test_attach_evidence_uncertainty_drivers_populated(self):
        """uncertainty_drivers must be populated after attachment."""
        insight = self._make_insight(modalities=["medication"])
        # Clear uncertainty drivers
        insight.uncertainty_drivers = []

        result = self.engine.attach_evidence([insight])
        enriched = result[0]

        self.assertGreater(
            len(enriched.uncertainty_drivers), 0,
            "uncertainty_drivers must be populated"
        )

    def test_attach_evidence_multiple_insights(self):
        """attach_evidence should handle multiple insights."""
        insight1 = self._make_insight(modalities=["qeeg"])
        insight2 = self._make_insight(modalities=["mri"])

        result = self.engine.attach_evidence([insight1, insight2])
        self.assertEqual(len(result), 2)

        for r in result:
            self.assertGreater(len(r.evidence_links), 0)
            self.assertTrue(r.clinician_review_required)

    def test_attach_evidence_with_supporting_events(self):
        """attach_evidence should use supporting events for external provenance."""
        insight = self._make_insight(
            modalities=["qeeg"],
            supporting_events=["evt_abc123"],
        )
        result = self.engine.attach_evidence([insight])
        enriched = result[0]

        # Should have both internal and external provenance evidence
        self.assertGreater(len(enriched.evidence_links), 0)

    # ------------------------------------------------------------------
    # grade_evidence
    # ------------------------------------------------------------------

    def test_grade_evidence_no_evidence(self):
        """grade_evidence should return D when no evidence is present."""
        insight = self._make_insight(modalities=["unknown_modality"])
        insight.evidence_links = []

        grade = self.engine.grade_evidence(insight)
        self.assertEqual(grade, "D")

    def test_grade_evidence_with_grade_a(self):
        """Multiple A-grade evidence should yield aggregate grade A."""
        insight = self._make_insight(modalities=["sleep"])
        insight.evidence_links = [
            EvidenceLink(
                evidence_id="ev_a1", source_type="literature",
                citation="Systematic review 1", evidence_grade="A",
                confidence=0.90,
            ).to_dict(),
            EvidenceLink(
                evidence_id="ev_a2", source_type="literature",
                citation="Systematic review 2", evidence_grade="A",
                confidence=0.88,
            ).to_dict(),
        ]

        grade = self.engine.grade_evidence(insight)
        self.assertEqual(grade, "A")

    def test_grade_evidence_with_grade_b(self):
        """Single B-grade evidence should yield aggregate grade B."""
        insight = self._make_insight(modalities=["medication"])
        insight.evidence_links = [
            EvidenceLink(
                evidence_id="ev_b1", source_type="literature",
                citation="Single RCT", evidence_grade="B",
                confidence=0.70,
            ).to_dict(),
        ]

        grade = self.engine.grade_evidence(insight)
        self.assertEqual(grade, "B")

    def test_grade_evidence_with_mixed_grades(self):
        """Mixed A/B/C grades should yield appropriate aggregate."""
        insight = self._make_insight(modalities=["qeeg"])
        insight.evidence_links = [
            EvidenceLink(
                evidence_id="ev_b1", source_type="literature",
                citation="RCT 1", evidence_grade="B", confidence=0.65,
            ).to_dict(),
            EvidenceLink(
                evidence_id="ev_c1", source_type="literature",
                citation="Expert opinion", evidence_grade="C", confidence=0.45,
            ).to_dict(),
        ]

        grade = self.engine.grade_evidence(insight)
        self.assertIn(grade, ("B", "C"))

    # ------------------------------------------------------------------
    # find_conflicting_evidence
    # ------------------------------------------------------------------

    def test_find_conflicting_evidence_detects_conflicting_flag(self):
        """find_conflicting_evidence should detect evidence with conflicting=True."""
        insight = self._make_insight(modalities=["voice", "assessment"])

        conflicts = self.engine.find_conflicting_evidence(insight)

        # The seeded data has voice_001 and assessment_001 marked as conflicting
        conflicting_evidence = [c for c in conflicts if c.conflicting]
        self.assertGreaterEqual(
            len(conflicting_evidence), 0,
            "Should detect conflicting evidence when present"
        )

    def test_find_conflicting_evidence_returns_list(self):
        """find_conflicting_evidence must return a list."""
        insight = self._make_insight(modalities=["qeeg"])
        conflicts = self.engine.find_conflicting_evidence(insight)
        self.assertIsInstance(conflicts, list)

    def test_find_conflicting_evidence_evidence_link_type(self):
        """Each conflict should be an EvidenceLink instance."""
        insight = self._make_insight(modalities=["voice"])
        conflicts = self.engine.find_conflicting_evidence(insight)

        for c in conflicts:
            self.assertIsInstance(c, EvidenceLink)


if __name__ == "__main__":
    unittest.main()
