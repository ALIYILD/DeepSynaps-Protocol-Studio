"""Tests for the language check."""

from __future__ import annotations

from deepsynaps_qa.checks.language import LanguageCheck
from deepsynaps_qa.models import Artifact, CheckSeverity


def test_golden_qeeg_language_pass(golden_qeeg, qeeg_spec):
    check = LanguageCheck()
    results = check.run(golden_qeeg, qeeg_spec)
    # No BLOCK-severity failures expected
    blocks = [r for r in results if not r.passed and r.severity == CheckSeverity.BLOCK]
    assert len(blocks) == 0


def test_excessive_certainty_detected(broken_language_protocol, protocol_spec):
    check = LanguageCheck()
    results = check.run(broken_language_protocol, protocol_spec)
    certainty = [
        r for r in results
        if r.check_id == "language.excessive_certainty" and not r.passed
    ]
    assert len(certainty) >= 1


def test_certainty_terms_listed(protocol_spec):
    art = Artifact(
        artifact_id="test:certainty",
        artifact_type="protocol_draft",
        content="This protocol guarantees results and cures the condition with 100% effectiveness.",
    )
    check = LanguageCheck()
    results = check.run(art, protocol_spec)
    certainty = [r for r in results if r.check_id == "language.excessive_certainty"]
    assert len(certainty) >= 1
    # Check that detected terms are mentioned
    msg = certainty[0].message.lower()
    assert "guarantees" in msg or "cures" in msg or "100" in msg
