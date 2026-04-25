"""Integration tests for the QAEngine."""

from __future__ import annotations

from deepsynaps_qa.engine import QAEngine
from deepsynaps_qa.models import Artifact, ArtifactType, Verdict
from deepsynaps_qa.specs.brain_twin_summary import BRAIN_TWIN_SUMMARY_SPEC
from deepsynaps_qa.specs.mri_report import MRI_REPORT_SPEC
from deepsynaps_qa.specs.protocol_draft import PROTOCOL_DRAFT_SPEC
from deepsynaps_qa.specs.qeeg_narrative import QEEG_NARRATIVE_SPEC


class TestGoldenArtifactsPass:
    """Golden artifacts should pass QA (score >= 60, no BLOCKs)."""

    def test_golden_qeeg(self, golden_qeeg):
        engine = QAEngine()
        result = engine.run(golden_qeeg, QEEG_NARRATIVE_SPEC)
        assert result.verdict in (Verdict.PASS, Verdict.NEEDS_REVIEW), (
            f"Expected PASS or NEEDS_REVIEW, got {result.verdict} "
            f"(score={result.score.numeric}, blocks={result.score.block_count})\n"
            f"Failures: {[r.message for r in result.check_results if not r.passed]}"
        )
        assert result.score.block_count == 0

    def test_golden_mri(self, golden_mri):
        engine = QAEngine()
        result = engine.run(golden_mri, MRI_REPORT_SPEC)
        assert result.verdict in (Verdict.PASS, Verdict.NEEDS_REVIEW), (
            f"Expected PASS or NEEDS_REVIEW, got {result.verdict} "
            f"(score={result.score.numeric})\n"
            f"Failures: {[r.message for r in result.check_results if not r.passed]}"
        )
        assert result.score.block_count == 0

    def test_golden_protocol(self, golden_protocol):
        engine = QAEngine()
        result = engine.run(golden_protocol, PROTOCOL_DRAFT_SPEC)
        assert result.verdict in (Verdict.PASS, Verdict.NEEDS_REVIEW), (
            f"Expected PASS or NEEDS_REVIEW, got {result.verdict} "
            f"(score={result.score.numeric})\n"
            f"Failures: {[r.message for r in result.check_results if not r.passed]}"
        )
        assert result.score.block_count == 0

    def test_golden_bts(self, golden_bts):
        engine = QAEngine()
        result = engine.run(golden_bts, BRAIN_TWIN_SUMMARY_SPEC)
        assert result.verdict in (Verdict.PASS, Verdict.NEEDS_REVIEW), (
            f"Expected PASS or NEEDS_REVIEW, got {result.verdict} "
            f"(score={result.score.numeric})\n"
            f"Failures: {[r.message for r in result.check_results if not r.passed]}"
        )
        assert result.score.block_count == 0


class TestBrokenArtifactsFail:
    """Broken artifacts should fail QA with specific issues."""

    def test_broken_missing_section_fails(self, broken_sections_qeeg):
        engine = QAEngine()
        result = engine.run(broken_sections_qeeg, QEEG_NARRATIVE_SPEC)
        assert result.verdict == Verdict.FAIL
        assert result.score.block_count >= 1
        # Verify the sections.missing_required check fired
        section_blocks = [
            r for r in result.check_results
            if r.check_id == "sections.missing_required" and not r.passed
        ]
        assert len(section_blocks) >= 1

    def test_broken_zero_citations_fails(self, broken_citations_protocol):
        engine = QAEngine()
        result = engine.run(broken_citations_protocol, PROTOCOL_DRAFT_SPEC)
        assert result.verdict == Verdict.FAIL
        citation_blocks = [
            r for r in result.check_results
            if r.check_id == "citations.no_references" and not r.passed
        ]
        assert len(citation_blocks) >= 1

    def test_broken_banned_terms_fails(self, broken_banned_bts):
        engine = QAEngine()
        result = engine.run(broken_banned_bts, BRAIN_TWIN_SUMMARY_SPEC)
        assert result.verdict == Verdict.FAIL
        banned_blocks = [
            r for r in result.check_results
            if r.check_id == "banned_terms.detected" and not r.passed
        ]
        assert len(banned_blocks) >= 1

    def test_broken_placeholders_fails(self, broken_placeholder_mri):
        engine = QAEngine()
        result = engine.run(broken_placeholder_mri, MRI_REPORT_SPEC)
        assert result.verdict == Verdict.FAIL
        placeholder_blocks = [
            r for r in result.check_results
            if r.check_id == "placeholders.detected" and not r.passed
        ]
        assert len(placeholder_blocks) >= 1

    def test_broken_language_has_warnings(self, broken_language_protocol):
        engine = QAEngine()
        result = engine.run(broken_language_protocol, PROTOCOL_DRAFT_SPEC)
        certainty = [
            r for r in result.check_results
            if r.check_id == "language.excessive_certainty" and not r.passed
        ]
        assert len(certainty) >= 1


class TestEngineBasics:
    """Basic engine functionality."""

    def test_auto_spec_lookup(self, golden_qeeg):
        """Engine should auto-detect spec from artifact_type."""
        engine = QAEngine()
        result = engine.run(golden_qeeg)
        assert result.spec_id == "spec:qeeg_narrative_v1"

    def test_run_batch(self, golden_qeeg, golden_mri):
        engine = QAEngine()
        results = engine.run_batch([golden_qeeg, golden_mri])
        assert len(results) == 2
        assert results[0].artifact_id == golden_qeeg.artifact_id
        assert results[1].artifact_id == golden_mri.artifact_id

    def test_result_has_required_fields(self, golden_qeeg):
        engine = QAEngine()
        result = engine.run(golden_qeeg)
        assert result.run_id
        assert result.artifact_id == golden_qeeg.artifact_id
        assert result.spec_id
        assert result.timestamp_utc
        assert isinstance(result.score.numeric, float)
        assert 0 <= result.score.numeric <= 100

    def test_zero_section_artifact_fails(self):
        """An artifact with zero sections should FAIL hard."""
        art = Artifact(
            artifact_id="test:empty",
            artifact_type=ArtifactType.QEEG_NARRATIVE,
            content="",
            sections=[],
            citations=[],
        )
        engine = QAEngine()
        result = engine.run(art)
        assert result.verdict == Verdict.FAIL
        assert result.score.block_count >= 1
