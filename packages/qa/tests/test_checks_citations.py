"""Tests for the citations check."""

from __future__ import annotations

from deepsynaps_qa.checks.citations import CitationsCheck
from deepsynaps_qa.models import Artifact, CheckSeverity


def test_golden_qeeg_citations_pass(golden_qeeg, qeeg_spec):
    check = CitationsCheck()
    results = check.run(golden_qeeg, qeeg_spec)
    blocks = [r for r in results if r.severity == CheckSeverity.BLOCK and not r.passed]
    assert len(blocks) == 0, [r.message for r in blocks]


def test_zero_citations_is_block(broken_citations_protocol, protocol_spec):
    check = CitationsCheck()
    results = check.run(broken_citations_protocol, protocol_spec)
    blocks = [r for r in results if r.check_id == "citations.no_references" and not r.passed]
    assert len(blocks) == 1


def test_placeholder_citation_is_block(qeeg_spec):
    art = Artifact(
        artifact_id="test:placeholder_cit",
        artifact_type="qeeg_narrative",
        content="See [CITATION NEEDED] for details.",
        citations=[
            {"pmid": "12345678", "title": "Real paper"},
        ],
    )
    check = CitationsCheck()
    results = check.run(art, qeeg_spec)
    placeholders = [r for r in results if r.check_id == "citations.placeholder_ref"]
    assert len(placeholders) == 1
    assert placeholders[0].severity == CheckSeverity.BLOCK


def test_below_floor_is_warning(qeeg_spec):
    art = Artifact(
        artifact_id="test:low",
        artifact_type="qeeg_narrative",
        citations=[
            {"pmid": "12345678", "title": "Paper 1"},
            {"pmid": "23456789", "title": "Paper 2"},
        ],
    )
    check = CitationsCheck()
    results = check.run(art, qeeg_spec)
    below = [r for r in results if r.check_id == "citations.below_floor"]
    assert len(below) == 1
    assert below[0].severity == CheckSeverity.WARNING


def test_duplicate_pmid_is_info(qeeg_spec):
    art = Artifact(
        artifact_id="test:dup",
        artifact_type="qeeg_narrative",
        citations=[
            {"pmid": "12345678"},
            {"pmid": "12345678"},
            {"pmid": "23456789"},
            {"pmid": "34567890"},
            {"pmid": "45678901"},
        ],
    )
    check = CitationsCheck()
    results = check.run(art, qeeg_spec)
    dups = [r for r in results if r.check_id == "citations.duplicate_pmid"]
    assert len(dups) >= 1
    assert dups[0].severity == CheckSeverity.INFO
