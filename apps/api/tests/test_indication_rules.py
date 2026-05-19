"""Unit tests for the curated indication-rule loader and matcher."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.services.diagnosis_coding import indication_rules
from app.services.diagnosis_coding.indication_rules import (
    _validate_rule,
    all_rules,
    evidence_references_for,
    match_rules,
)
from app.services.diagnosis_coding.safety import FORBIDDEN_PHRASES


def test_all_rules_load_without_validation_errors() -> None:
    rules = all_rules()
    # The shipped YAML must always validate; if a future edit adds a rule
    # with forbidden language the loader strips it and this assertion
    # catches the regression.
    assert isinstance(rules, list)
    assert len(rules) > 0


def test_no_rule_uses_forbidden_language() -> None:
    for rule in all_rules():
        for phrase in FORBIDDEN_PHRASES:
            assert phrase.lower() not in rule["indication_context"].lower(), (
                f"rule {rule['id']} indication_context contains forbidden '{phrase}'"
            )


def test_rtms_mdd_us_matches_f33_2() -> None:
    matches = match_rules(diagnosis_code="F33.2", modality="rTMS", jurisdiction="US")
    assert any(r["id"] == "rtms-mdd-fda" for r in matches)


def test_rtms_mdd_gb_matches_f33_2() -> None:
    matches = match_rules(diagnosis_code="F33.2", modality="rTMS", jurisdiction="GB")
    assert any(r["id"] == "rtms-mdd-nice" for r in matches)


def test_rtms_in_unsupported_jurisdiction_returns_empty() -> None:
    # A jurisdiction with no curated rule and no `international` fallback
    # for rTMS should return no matches.
    matches = match_rules(diagnosis_code="F33.2", modality="rTMS", jurisdiction="JP")
    rtms_matches = [r for r in matches if r.get("modality", "").lower() == "rtms"]
    assert rtms_matches == []


def test_ect_international_matches_severe_depression() -> None:
    matches = match_rules(diagnosis_code="F33.2", modality="ECT", jurisdiction="US")
    assert any(r["id"] == "ect-treatment-resistant-depression" for r in matches)
    # And without a jurisdiction hint:
    matches = match_rules(diagnosis_code="F33.2", modality="ECT")
    assert any(r["id"] == "ect-treatment-resistant-depression" for r in matches)


def test_modality_token_normalises_separators() -> None:
    matches_a = match_rules(diagnosis_code="F33.2", modality="rTMS", jurisdiction="US")
    matches_b = match_rules(diagnosis_code="F33.2", modality="r-TMS", jurisdiction="US")
    matches_c = match_rules(diagnosis_code="F33.2", modality="RTMS", jurisdiction="US")
    assert {r["id"] for r in matches_a} == {r["id"] for r in matches_b} == {r["id"] for r in matches_c}


def test_unknown_code_returns_empty() -> None:
    assert match_rules(diagnosis_code="Z99.9", modality="rTMS", jurisdiction="US") == []


def test_evidence_references_dedup() -> None:
    rules = match_rules(diagnosis_code="F33.2", modality="rTMS", jurisdiction="US")
    refs = evidence_references_for(rules)
    # Each FDA clearance / NICE TA reference is unique by (source, identifier, title).
    keys = [(r.get("source", ""), r.get("identifier", ""), r.get("title", "")) for r in refs]
    assert len(keys) == len(set(keys))


def test_validate_rule_rejects_forbidden_language() -> None:
    bad = {
        "id": "bad-rule",
        "modality": "rtms",
        "diagnosis_codes": {"icd10": ["F33.2"]},
        "regulatory_status": "FDA_510k_cleared",
        "indication_context": "This patient is covered for treatment.",
    }
    with pytest.raises(ValueError, match="forbidden"):
        _validate_rule(bad)


def test_validate_rule_rejects_missing_codes() -> None:
    bad = {
        "id": "bad-rule-2",
        "modality": "rtms",
        "diagnosis_codes": {},
        "regulatory_status": "FDA_510k_cleared",
        "indication_context": "Clinician must verify local policy.",
    }
    with pytest.raises(ValueError, match="non-empty dict"):
        _validate_rule(bad)


def test_reload_rules_picks_up_disk_changes(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake = tmp_path / "indication_rules.yaml"
    fake.write_text(
        """
rules:
  - id: test-rule
    modality: rtms
    diagnosis_codes:
      icd10: ["F33.2"]
    jurisdiction: US
    regulatory_status: FDA_510k_cleared
    indication_context: |
      Clinician must verify local payer policy before use.
    evidence_references: []
""",
        encoding="utf-8",
    )
    monkeypatch.setattr(indication_rules, "RULES_PATH", fake)
    indication_rules.reload_rules()
    try:
        rules = indication_rules.all_rules()
        assert any(r["id"] == "test-rule" for r in rules)
    finally:
        # Restore the production YAML so subsequent tests see the real data.
        monkeypatch.undo()
        indication_rules.reload_rules()
