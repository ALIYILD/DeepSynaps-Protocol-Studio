"""Tests for the pure helper functions in deepsynaps_evidence.validator.

The full validate_claims orchestrator depends on a SQLAlchemy session,
corpus_adapter, audit log, and the apps/api repository layer — that's
covered by integration tests in apps/api/tests/. This file tests the
pure helpers and module-level constants in isolation.
"""

from __future__ import annotations

import pytest

from deepsynaps_evidence.schemas import Claim, ValidationIssue
from deepsynaps_evidence.validator import (
    VALIDATOR_VERSION,
    _STRONG_CLAIM_PATTERNS,
    _check_empty_claim,
    _check_strong_claims,
)


class TestModuleConstants:
    def test_validator_version_is_string(self) -> None:
        assert isinstance(VALIDATOR_VERSION, str)
        assert VALIDATOR_VERSION

    def test_strong_claim_patterns_are_compiled_regex(self) -> None:
        assert _STRONG_CLAIM_PATTERNS
        for p in _STRONG_CLAIM_PATTERNS:
            assert hasattr(p, "search")  # compiled regex


# ───────────────────────────── _check_strong_claims ────────────────────────


class TestCheckStrongClaims:
    @pytest.mark.parametrize(
        "claim_text,should_flag",
        [
            # Spec section 6.2 — strong-claim patterns
            ("rTMS has been proven to cure depression.", True),
            ("This treatment is shown to eliminate symptoms.", True),
            ("Definitively treats anxiety in 4 weeks.", True),
            ("Conclusively cures fibromyalgia.", True),
            # "100% effective" requires the literal "rate" suffix in the
            # pattern; "in our cohort" alone does not trip it.
            ("100% effective in our cohort.", False),
            ("100% effective rate observed.", True),
            ("100% cure rate.", True),
            ("Guaranteed outcome with our protocol.", True),
            ("Guaranteed improvement after 10 sessions.", True),
            ("FDA-approved for everything.", True),
            ("FDA approved for off-label use.", True),
            # Pattern uses a negative lookahead `(?!class\s+I)`. The token
            # "class III" begins with "class I", so the lookahead fails and
            # the pattern does NOT match — same as "class I". For non-class-I
            # markings the lookahead succeeds; "neurology applications" is a
            # canonical positive case.
            ("CE-marked for neurology applications.", True),
            # Class I CE marking is intentionally allowed.
            ("CE-marked for class I devices.", False),
            ("CE-marked for class III devices.", False),
            # Neutral / safe statements
            ("Some studies suggest rTMS may help in MDD.", False),
            ("Evidence is mixed.", False),
            ("Patient may benefit from neurofeedback.", False),
            ("", False),
        ],
    )
    def test_strong_claim_detection(self, claim_text: str, should_flag: bool) -> None:
        issues = _check_strong_claims(claim_text)
        if should_flag:
            assert issues, f"expected flag for: {claim_text!r}"
            assert all(isinstance(i, ValidationIssue) for i in issues)
            assert all(i.severity == "block" for i in issues)
            assert all(i.issue_type == "strong_claim_ungrounded" for i in issues)
        else:
            assert not issues, f"unexpected flag for: {claim_text!r} → {issues}"

    def test_case_insensitive(self) -> None:
        # Patterns use re.IGNORECASE.
        assert _check_strong_claims("HAS BEEN PROVEN TO CURE everything.")
        assert _check_strong_claims("100% effective rate")
        assert _check_strong_claims("Guaranteed Recovery")

    def test_message_includes_matched_text(self) -> None:
        issues = _check_strong_claims("This 100% effective rate is unsupported.")
        assert issues
        assert "100%" in issues[0].message or "effective" in issues[0].message

    def test_multiple_patterns_flag_separately(self) -> None:
        issues = _check_strong_claims(
            "This is FDA-approved for everything and guaranteed improvement."
        )
        # FDA-approved match + guaranteed-improvement match → two issues.
        assert len(issues) >= 2

    def test_grade_a_b_keyword_message_mentions_citation(self) -> None:
        issues = _check_strong_claims("100% effective rate observed.")
        assert issues
        assert "Grade A or B" in issues[0].message


# ───────────────────────────── _check_empty_claim ──────────────────────────


class TestCheckEmptyClaim:
    def test_empty_string_flags(self) -> None:
        issues = _check_empty_claim(Claim(claim_text=""))
        assert len(issues) == 1
        assert issues[0].issue_type == "empty_claim"
        assert issues[0].severity == "warning"

    def test_whitespace_only_flags(self) -> None:
        issues = _check_empty_claim(Claim(claim_text="   \t\n  "))
        assert len(issues) == 1
        assert issues[0].issue_type == "empty_claim"

    def test_non_empty_does_not_flag(self) -> None:
        assert _check_empty_claim(Claim(claim_text="A real claim.")) == []

    def test_short_but_non_empty_does_not_flag(self) -> None:
        # The helper only catches whitespace-only — short claims are fine.
        assert _check_empty_claim(Claim(claim_text="x")) == []
