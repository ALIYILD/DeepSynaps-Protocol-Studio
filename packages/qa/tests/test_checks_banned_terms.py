"""Tests for the banned terms check."""

from __future__ import annotations

from deepsynaps_qa.checks.banned_terms import BannedTermsCheck
from deepsynaps_qa.models import Artifact, CheckSeverity


def test_golden_bts_no_banned_terms(golden_bts, bts_spec):
    check = BannedTermsCheck()
    results = check.run(golden_bts, bts_spec)
    blocks = [r for r in results if not r.passed and r.severity == CheckSeverity.BLOCK]
    assert len(blocks) == 0


def test_neurotwin_banned_term_detected(broken_banned_bts, bts_spec):
    check = BannedTermsCheck()
    results = check.run(broken_banned_bts, bts_spec)
    blocks = [r for r in results if r.check_id == "banned_terms.detected" and not r.passed]
    assert len(blocks) >= 1
    messages = " ".join(r.message for r in blocks)
    assert "NeuroTwin" in messages or "digital twin" in messages


def test_banned_term_in_citation_title(bts_spec):
    """Banned term smuggled inside a citation title should still be caught."""
    art = Artifact(
        artifact_id="test:cit_smuggle",
        artifact_type="brain_twin_summary",
        content="Clean content with moderate confidence.",
        citations=[
            {"pmid": "12345678", "title": "The NeuroTwin approach to brain modeling"},
        ],
        sections=[],
    )
    check = BannedTermsCheck()
    results = check.run(art, bts_spec)
    blocks = [r for r in results if not r.passed]
    assert len(blocks) >= 1


def test_global_banned_terms_checked(qeeg_spec):
    """Global banned terms like 'prescribe' should be checked on all types."""
    art = Artifact(
        artifact_id="test:global",
        artifact_type="qeeg_narrative",
        content="The clinician should prescribe this treatment immediately.",
    )
    check = BannedTermsCheck()
    results = check.run(art, qeeg_spec)
    blocks = [r for r in results if not r.passed]
    assert len(blocks) >= 1
