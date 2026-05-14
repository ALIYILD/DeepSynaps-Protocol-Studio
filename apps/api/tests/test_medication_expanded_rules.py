"""Tests for expanded medication interaction rules.

Verifies:
- Each new interaction rule produces expected output for known medication pairs
- All severity levels are valid (severe, moderate, mild)
- All rules contain clinical safety framing in recommendations
- Research-based rules have appropriate drug coverage
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.medications_router import _INTERACTION_RULES, _run_interaction_check

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_BASE = "/api/v1/medications"


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


# ── Severity validation ──────────────────────────────────────────────────────

VALID_SEVERITIES = {"severe", "moderate", "mild"}


def test_all_rules_have_valid_severity() -> None:
    """Every interaction rule must have a severity in {severe, moderate, mild}."""
    for i, rule in enumerate(_INTERACTION_RULES):
        sev = rule.get("severity", "")
        assert sev in VALID_SEVERITIES, (
            f"Rule {i} ({rule.get('drugs', [])}) has invalid severity: {sev}"
        )


def test_all_rules_have_severity_string() -> None:
    """Severity must be a non-empty string."""
    for rule in _INTERACTION_RULES:
        assert isinstance(rule.get("severity"), str)
        assert rule["severity"].strip() != ""


# ── Safety framing validation ────────────────────────────────────────────────

SAFETY_PHRASES = [
    "requires clinician",
    "requires psychiatrist",
    "requires anesthesia",
    "requires neurologist",
    "not a",
    "not an",
    "does not",
    "decision-support",
    "this tool",
    "clinical",
]


def test_all_rules_have_safety_framing_in_recommendation() -> None:
    """Every rule recommendation must contain safety-framing language."""
    for rule in _INTERACTION_RULES:
        rec = str(rule.get("recommendation", "")).lower()
        assert any(phrase.lower() in rec for phrase in SAFETY_PHRASES), (
            f"Rule {rule.get('drugs', [])} recommendation lacks safety framing: {rec[:100]}"
        )


def test_no_rule_has_banned_prescriptive_phrases() -> None:
    """No rule recommendation should contain autonomous-prescribing language."""
    banned = [
        "stop ",
        "do not take",
        "discontinue",
        "must be stopped",
        "should be discontinued",
        "contraindicated — avoid",
        "patient should stop",
    ]
    for rule in _INTERACTION_RULES:
        rec = str(rule.get("recommendation", "")).lower()
        for b in banned:
            assert b.lower() not in rec, (
                f"Rule {rule.get('drugs', [])} contains banned phrase '{b}': {rec[:120]}"
            )


# ── Research-based rule coverage (new rules) ─────────────────────────────────

NEW_RULE_DRUG_PAIRS = [
    ("clozapine", "valproate", "severe"),
    ("bupropion", "clozapine", "moderate"),
    ("lithium", "ect", "severe"),
    ("lorazepam", "ect", "severe"),
    ("phenelzine", "sertraline", "severe"),
    ("warfarin", "ect", "moderate"),
    ("methylphenidate", "phenelzine", "severe"),
    ("amitriptyline", "rtms", "moderate"),
    ("valproate", "carbamazepine", "moderate"),
    ("lithium", "furosemide", "moderate"),
]


def test_clozapine_anticonvulsant_rule_detected() -> None:
    """Clozapine + anticonvulsant should trigger severe interaction."""
    interactions, worst = _run_interaction_check(["clozapine", "valproate"])
    sevs = [i.severity for i in interactions]
    assert "severe" in sevs


def test_bupropion_seizure_threshold_rule_detected() -> None:
    """Bupropion + seizure-threshold lowering should trigger moderate."""
    interactions, worst = _run_interaction_check(["bupropion", "clozapine"])
    sevs = [i.severity for i in interactions]
    assert "moderate" in sevs


def test_lithium_ect_rule_detected() -> None:
    """Lithium + ECT should trigger severe interaction."""
    interactions, worst = _run_interaction_check(["lithium carbonate", "ect"])
    sevs = [i.severity for i in interactions]
    assert "severe" in sevs


def test_benzodiazepine_ect_rule_detected() -> None:
    """Benzodiazepine + ECT should trigger severe interaction."""
    interactions, worst = _run_interaction_check(["lorazepam", "ect"])
    sevs = [i.severity for i in interactions]
    assert "severe" in sevs


def test_maoi_serotonergic_rule_detected() -> None:
    """MAOI + serotonergic agent should trigger severe interaction."""
    interactions, worst = _run_interaction_check(["phenelzine", "sertraline"])
    sevs = [i.severity for i in interactions]
    assert "severe" in sevs


def test_anticoagulant_ect_rule_detected() -> None:
    """Anticoagulant + ECT should trigger moderate interaction."""
    interactions, worst = _run_interaction_check(["warfarin", "ect"])
    sevs = [i.severity for i in interactions]
    assert "moderate" in sevs


def test_stimulant_maoi_rule_detected() -> None:
    """Stimulant + MAOI should trigger severe interaction."""
    interactions, worst = _run_interaction_check(["methylphenidate", "phenelzine"])
    sevs = [i.severity for i in interactions]
    assert "severe" in sevs


def test_tca_rtms_rule_detected() -> None:
    """TCA + rTMS should trigger moderate interaction."""
    interactions, worst = _run_interaction_check(["amitriptyline", "rtms"])
    sevs = [i.severity for i in interactions]
    assert "moderate" in sevs


def test_valproate_carbamazepine_rule_detected() -> None:
    """Valproate + carbamazepine should trigger moderate interaction."""
    interactions, worst = _run_interaction_check(["valproate", "carbamazepine"])
    sevs = [i.severity for i in interactions]
    assert "moderate" in sevs


def test_lithium_diuretic_rule_detected() -> None:
    """Lithium + diuretic should trigger moderate interaction."""
    interactions, worst = _run_interaction_check(["lithium", "furosemide"])
    sevs = [i.severity for i in interactions]
    assert "moderate" in sevs


# ── API endpoint integration tests for new rules ─────────────────────────────

def test_api_clozapine_valproate_interaction(client: TestClient) -> None:
    """API returns clozapine + valproate interaction via check-interactions."""
    r = client.post(
        f"{_BASE}/check-interactions",
        json={"medications": ["clozapine", "valproic acid"]},
        headers=_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["interactions"]) >= 1
    sevs = [i["severity"] for i in body["interactions"]]
    assert "severe" in sevs


def test_api_lithium_ect_interaction(client: TestClient) -> None:
    """API returns lithium + ECT interaction via check-interactions."""
    r = client.post(
        f"{_BASE}/check-interactions",
        json={"medications": ["lithium", "ect"]},
        headers=_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["interactions"]) >= 1
    sevs = [i["severity"] for i in body["interactions"]]
    assert "severe" in sevs


def test_api_stimulant_maoi_interaction(client: TestClient) -> None:
    """API returns stimulant + MAOI interaction via check-interactions."""
    r = client.post(
        f"{_BASE}/check-interactions",
        json={"medications": ["methylphenidate", "phenelzine"]},
        headers=_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["interactions"]) >= 1
    sevs = [i["severity"] for i in body["interactions"]]
    assert "severe" in sevs


def test_api_valproate_carbamazepine_interaction(client: TestClient) -> None:
    """API returns valproate + carbamazepine interaction via check-interactions."""
    r = client.post(
        f"{_BASE}/check-interactions",
        json={"medications": ["valproate", "carbamazepine"]},
        headers=_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["interactions"]) >= 1
    sevs = [i["severity"] for i in body["interactions"]]
    assert "moderate" in sevs


# ── Medication search helper tests ───────────────────────────────────────────

from app.services.medication_analyzer import search_medication_candidates, _MEDICATION_CATALOG


def test_search_catalog_has_at_least_50_entries() -> None:
    """Curated catalog must contain at least 50 medications."""
    assert len(_MEDICATION_CATALOG) >= 50, (
        f"Catalog has only {len(_MEDICATION_CATALOG)} entries; expected >= 50"
    )


def test_search_exact_name_match() -> None:
    """Exact name match should return the medication with highest score."""
    results = search_medication_candidates("sertraline")
    assert len(results) >= 1
    assert results[0]["generic_name"] == "sertraline"


def test_search_case_insensitive() -> None:
    """Search should be case-insensitive."""
    lower_results = search_medication_candidates("sertraline")
    upper_results = search_medication_candidates("SERTRALINE")
    assert len(lower_results) == len(upper_results)
    assert lower_results[0]["generic_name"] == upper_results[0]["generic_name"]


def test_search_generic_name_match() -> None:
    """Searching by generic name should return matching medication."""
    results = search_medication_candidates("escitalopram")
    assert any(r["generic_name"] == "escitalopram" for r in results)


def test_search_class_match() -> None:
    """Searching by drug class should return relevant medications."""
    results = search_medication_candidates("SSRI")
    assert len(results) >= 3  # At least 3 SSRIs in catalog


def test_search_indication_match() -> None:
    """Searching by indication should return relevant medications."""
    results = search_medication_candidates("bipolar")
    assert len(results) >= 2  # Multiple mood stabilizers treat bipolar


def test_search_returns_limit() -> None:
    """Search should respect the limit parameter."""
    results = search_medication_candidates("a", limit=5)
    assert len(results) <= 5


def test_search_empty_query() -> None:
    """Empty query should return empty list."""
    results = search_medication_candidates("")
    assert results == []


def test_search_no_results() -> None:
    """Nonsense query should return empty list."""
    results = search_medication_candidates("xyznonexistent12345")
    assert results == []


def test_search_returns_required_fields() -> None:
    """Each result must have name, generic_name, drug_class, common_indications."""
    results = search_medication_candidates("lithium")
    assert len(results) >= 1
    for r in results:
        assert "name" in r
        assert "generic_name" in r
        assert "drug_class" in r
        assert "common_indications" in r


def test_search_psychiatric_coverage() -> None:
    """Catalog must cover major psychiatric drug classes."""
    classes_found: set[str] = set()
    for med in _MEDICATION_CATALOG:
        classes_found.add(med["drug_class"].lower())
    # Check for key psychiatric/neuromod classes
    expected_terms = ["ssri", "snri", "antipsychotic", "mood stabilizer", "benzodiazepine", "stimulant"]
    for term in expected_terms:
        assert any(term in cls for cls in classes_found), (
            f"Catalog missing drug class containing '{term}'"
        )


def test_search_result_scores_present() -> None:
    """Results should include a score field for ranking."""
    results = search_medication_candidates("sertraline")
    for r in results:
        assert "score" in r
        assert isinstance(r["score"], (int, float))
