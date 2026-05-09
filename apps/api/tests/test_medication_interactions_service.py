"""Tests for app.services.medication_interactions — V1 in-memory rule engine.

Covers:
- run_interaction_check returns (list, worst_severity) tuple
- sertraline + tramadol → severe serotonin-syndrome rule fires
- ssri + maoi → severe (contraindicated)
- warfarin + aspirin → moderate
- no matching drugs → empty list, worst_severity "none"
- severity ordering: severe beats moderate beats mild
- normalize_therapy_tokens produces correct tokens for tms/tdcs/tricyclics/stimulants
- normalize_therapy_tokens is case-insensitive
- INTERACTION_RULES is non-empty list of dicts
- INTERACTION_RULES entries have required keys
"""
from __future__ import annotations


def test_interaction_rules_is_nonempty_list():
    from app.services.medication_interactions import INTERACTION_RULES

    assert isinstance(INTERACTION_RULES, list)
    assert len(INTERACTION_RULES) >= 1


def test_interaction_rules_entries_have_required_keys():
    from app.services.medication_interactions import INTERACTION_RULES

    for rule in INTERACTION_RULES:
        assert "drugs" in rule, f"Missing 'drugs' in {rule}"
        assert "severity" in rule, f"Missing 'severity' in {rule}"
        assert "description" in rule, f"Missing 'description' in {rule}"
        assert "recommendation" in rule, f"Missing 'recommendation' in {rule}"


def test_no_interactions_on_empty_input():
    from app.services.medication_interactions import run_interaction_check

    found, worst = run_interaction_check([])
    assert found == []
    assert worst == "none"


def test_no_interactions_on_unrelated_meds():
    from app.services.medication_interactions import run_interaction_check

    found, worst = run_interaction_check(["ibuprofen", "paracetamol", "vitamin_c"])
    assert found == []
    assert worst == "none"


def test_sertraline_tramadol_fires_severe():
    from app.services.medication_interactions import run_interaction_check

    found, worst = run_interaction_check(["sertraline", "tramadol"])
    assert worst == "severe"
    assert len(found) >= 1
    descs = [r["description"].lower() for r in found]
    assert any("serotonin" in d for d in descs), "serotonin syndrome description expected"


def test_ssri_maoi_fires_severe_contraindicated():
    from app.services.medication_interactions import run_interaction_check

    found, worst = run_interaction_check(["ssri", "maoi"])
    assert worst == "severe"
    recs = [r["recommendation"].lower() for r in found]
    assert any("contraindicated" in r for r in recs), "contraindicated recommendation expected"


def test_warfarin_aspirin_fires_moderate():
    from app.services.medication_interactions import run_interaction_check

    found, worst = run_interaction_check(["warfarin 5mg", "aspirin 75mg"])
    assert worst == "moderate"
    assert len(found) >= 1


def test_worst_severity_is_highest_across_multiple_interactions():
    from app.services.medication_interactions import run_interaction_check

    # ssri+maoi (severe) and lithium+ibuprofen would both fire, but we test ordering
    found, worst = run_interaction_check(["sertraline", "tramadol", "warfarin", "aspirin"])
    assert worst == "severe", f"Expected 'severe', got '{worst}'"


def test_normalize_therapy_tokens_tms():
    from app.services.medication_interactions import normalize_therapy_tokens

    tokens = normalize_therapy_tokens("rtms", None, [])
    assert "tms" in tokens


def test_normalize_therapy_tokens_tdcs():
    from app.services.medication_interactions import normalize_therapy_tokens

    tokens = normalize_therapy_tokens("tdcs_protocol", None, [])
    assert "tdcs" in tokens


def test_normalize_therapy_tokens_tricyclics_from_drug_name():
    from app.services.medication_interactions import normalize_therapy_tokens

    tokens = normalize_therapy_tokens(None, None, ["amitriptyline 10mg"])
    assert "tricyclics" in tokens


def test_normalize_therapy_tokens_stimulants():
    from app.services.medication_interactions import normalize_therapy_tokens

    tokens = normalize_therapy_tokens(None, "methylphenidate protocol", [])
    assert "stimulants" in tokens


def test_normalize_therapy_tokens_case_insensitive():
    from app.services.medication_interactions import normalize_therapy_tokens

    tokens = normalize_therapy_tokens("TMS", "TDCS Session", [])
    assert "tms" in tokens
    assert "tdcs" in tokens


def test_normalize_therapy_tokens_deduplicates():
    from app.services.medication_interactions import normalize_therapy_tokens

    tokens = normalize_therapy_tokens("tms", "rtms magnetic", ["tms_variant"])
    # tms should appear only once even though mentioned multiple times
    assert tokens.count("tms") == 1
