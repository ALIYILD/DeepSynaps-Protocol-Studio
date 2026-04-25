"""Tests for the sections check."""

from __future__ import annotations

from deepsynaps_qa.checks.sections import SectionsCheck
from deepsynaps_qa.models import Artifact, CheckSeverity


def test_golden_qeeg_sections_pass(golden_qeeg, qeeg_spec):
    check = SectionsCheck()
    results = check.run(golden_qeeg, qeeg_spec)
    # All results should be passing
    assert all(r.passed for r in results), [r.message for r in results if not r.passed]


def test_missing_section_is_block(broken_sections_qeeg, qeeg_spec):
    check = SectionsCheck()
    results = check.run(broken_sections_qeeg, qeeg_spec)
    block_results = [r for r in results if r.severity == CheckSeverity.BLOCK and not r.passed]
    assert len(block_results) >= 1
    # The missing section should be clinical_impression
    missing_msgs = [r.message for r in block_results]
    assert any("clinical_impression" in m for m in missing_msgs)


def test_empty_artifact_all_sections_missing(qeeg_spec):
    empty = Artifact(
        artifact_id="test:empty",
        artifact_type="qeeg_narrative",
        content="",
        sections=[],
    )
    check = SectionsCheck()
    results = check.run(empty, qeeg_spec)
    blocks = [r for r in results if r.severity == CheckSeverity.BLOCK and not r.passed]
    # Should have one BLOCK per required section
    assert len(blocks) == len(qeeg_spec.required_sections)


def test_section_with_few_words_is_warning(qeeg_spec):
    # Create an artifact with all sections present but one has < 50 words
    sections = []
    for s in qeeg_spec.required_sections:
        if s == "limitations_and_caveats":
            sections.append({"section_id": s, "body": "Short."})
        else:
            sections.append({"section_id": s, "body": "word " * 60})
    art = Artifact(
        artifact_id="test:short",
        artifact_type="qeeg_narrative",
        sections=sections,
    )
    check = SectionsCheck()
    results = check.run(art, qeeg_spec)
    warnings = [
        r for r in results
        if r.severity == CheckSeverity.WARNING and not r.passed
    ]
    assert len(warnings) >= 1
    assert any("limitations_and_caveats" in r.location for r in warnings)
