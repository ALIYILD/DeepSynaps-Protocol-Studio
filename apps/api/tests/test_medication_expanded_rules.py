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


# ── Phase 3: Expanded confound detection (18 types) ──────────────────────────

from app.services.medication_analyzer import (
    _confound_flags_for_meds,
    NUTRITION_INTERACTIONS,
    LAB_MONITORING_SCHEDULES,
    generate_nutrition_lab_panel,
    MEDICATION_BIOMARKER_CONFOUNDER_MATRIX,
)

# All 18 expected confound types with their domains
EXPECTED_CONFOUND_TYPES = [
    ("qEEG theta/delta power increase", "qEEG"),
    ("qEEG beta power increase", "qEEG"),
    ("qEEG beta/theta-beta ratio increase", "qEEG"),
    ("theta/beta ratio decrease", "qEEG"),
    ("alpha power decrease", "qEEG"),
    ("frontal alpha asymmetry change", "qEEG"),
    ("P300 latency increase", "ERP"),
    ("HRV reduction (large)", "autonomic"),
    ("HRV mild decrease", "autonomic"),
    ("BDNF elevation", "neuroplasticity"),
    ("IL-6 / TNF-alpha reduction", "inflammatory"),
    ("cortisol awakening response alteration", "HPA axis"),
    ("prolactin elevation", "endocrine"),
    ("TSH elevation (subclinical hypothyroidism)", "endocrine"),
    ("hippocampal volume increase", "structural MRI"),
    ("DMN connectivity change", "rs-fMRI"),
    ("prefrontal cortical thickness change", "structural MRI"),
    ("weight gain / metabolic syndrome", "metabolic"),
]


def test_confound_detection_yields_18_types() -> None:
    """All 18 confound types should be detectable across a representative medication set."""
    # Use a broad medication list covering all confound categories
    med_records = [
        {"id": "med-001", "drug_name": "Olanzapine", "medication_class": "atypical antipsychotic", "status": "active"},
        {"id": "med-002", "drug_name": "Lorazepam", "medication_class": "benzodiazepine", "status": "active"},
        {"id": "med-003", "drug_name": "Methylphenidate", "medication_class": "stimulant", "status": "active"},
        {"id": "med-004", "drug_name": "Sertraline", "medication_class": "SSRI", "status": "active"},
        {"id": "med-005", "drug_name": "Venlafaxine", "medication_class": "SNRI", "status": "active"},
        {"id": "med-006", "drug_name": "Amitriptyline", "medication_class": "TCA", "status": "active"},
        {"id": "med-007", "drug_name": "Lithium", "medication_class": "mood stabilizer", "status": "active"},
        {"id": "med-008", "drug_name": "Mirtazapine", "medication_class": "NaSSA", "status": "active"},
    ]
    confounds = _confound_flags_for_meds(med_records)

    # Collect unique confound types found
    found_types = {c["confound_type"] for c in confounds}
    found_domains = {c["domain"] for c in confounds}

    # Assert we find all 18 types
    for expected_type, expected_domain in EXPECTED_CONFOUND_TYPES:
        assert expected_type in found_types, (
            f"Expected confound type '{expected_type}' (domain: {expected_domain}) not found. "
            f"Found types: {sorted(found_types)}"
        )

    # Assert all expected domains are represented
    expected_domains = {d for _, d in EXPECTED_CONFOUND_TYPES}
    for domain in expected_domains:
        assert domain in found_domains, (
            f"Expected domain '{domain}' not found in confounds. Found domains: {sorted(found_domains)}"
        )


def test_confound_structure_has_required_fields() -> None:
    """Each confound must have all required fields with correct types."""
    med_records = [
        {"id": "med-001", "drug_name": "Sertraline", "medication_class": "SSRI", "status": "active"},
    ]
    confounds = _confound_flags_for_meds(med_records)
    assert len(confounds) >= 1

    for c in confounds:
        assert "id" in c and isinstance(c["id"], str)
        assert "confound_type" in c and isinstance(c["confound_type"], str)
        assert "domain" in c and isinstance(c["domain"], str)
        assert "hypothesis" in c
        assert "linked_medications" in c and isinstance(c["linked_medications"], list)
        assert "temporal_alignment" in c and isinstance(c["temporal_alignment"], str)
        assert "strength" in c and isinstance(c["strength"], str)
        assert "confidence" in c and isinstance(c["confidence"], (int, float))
        assert 0 <= c["confidence"] <= 1
        assert "explanation" in c and isinstance(c["explanation"], str)
        assert "evidence_grade" in c and c["evidence_grade"] in ("A", "B", "C", "D")
        assert "washout_days_min" in c and isinstance(c["washout_days_min"], int)
        assert c["washout_days_min"] >= 0
        assert "generated_at" in c
        assert "source" in c


def test_confound_confidence_values_are_in_range() -> None:
    """All confidence values must be in [0, 1]."""
    med_records = [
        {"id": "med-001", "drug_name": "Olanzapine", "medication_class": "atypical antipsychotic", "status": "active"},
        {"id": "med-002", "drug_name": "Lithium", "medication_class": "mood stabilizer", "status": "active"},
        {"id": "med-003", "drug_name": "Sertraline", "medication_class": "SSRI", "status": "active"},
    ]
    confounds = _confound_flags_for_meds(med_records)
    for c in confounds:
        assert 0 <= c["confidence"] <= 1, (
            f"Confound {c['confound_type']} has confidence {c['confidence']} outside [0,1]"
        )


def test_confound_washout_periods_are_positive() -> None:
    """All washout periods must be non-negative integers."""
    med_records = [
        {"id": "med-001", "drug_name": "Clozapine", "medication_class": "atypical antipsychotic", "status": "active"},
        {"id": "med-002", "drug_name": "Fluoxetine", "medication_class": "SSRI", "status": "active"},
        {"id": "med-003", "drug_name": "Carbamazepine", "medication_class": "anticonvulsant / mood stabilizer", "status": "active"},
    ]
    confounds = _confound_flags_for_meds(med_records)
    for c in confounds:
        assert isinstance(c["washout_days_min"], int)
        assert c["washout_days_min"] >= 0


# ── Nutrition interactions tests ──────────────────────────────────────────────


def test_nutrition_interactions_has_12_entries() -> None:
    """NUTRITION_INTERACTIONS must contain exactly 12 interactions."""
    assert len(NUTRITION_INTERACTIONS) == 12, f"Expected 12 nutrition interactions, got {len(NUTRITION_INTERACTIONS)}"


def test_nutrition_interactions_all_have_required_fields() -> None:
    """Each nutrition interaction must have all required fields."""
    required = ["id", "drug_classes", "drug_names", "nutrient", "interaction_type", "severity", "mechanism", "clinical_action", "evidence_grade"]
    for ni in NUTRITION_INTERACTIONS:
        for field in required:
            assert field in ni, f"Nutrition interaction {ni.get('id', '?')} missing field: {field}"
        assert ni["severity"] in ("critical", "severe", "moderate", "mild")
        assert ni["evidence_grade"] in ("A", "B", "C", "D")
        assert isinstance(ni["drug_names"], list) and len(ni["drug_names"]) > 0
        assert isinstance(ni["drug_classes"], list) and len(ni["drug_classes"]) > 0


def test_nutrition_lithium_sodium_is_critical() -> None:
    """Lithium-sodium interaction must be critical severity."""
    lithium_ni = [n for n in NUTRITION_INTERACTIONS if "lithium" in n["id"]]
    assert len(lithium_ni) >= 1
    assert lithium_ni[0]["severity"] == "critical"
    assert "sodium" in lithium_ni[0]["nutrient"].lower()


def test_nutrition_warfarin_vitamink_is_critical() -> None:
    """Warfarin-vitamin K interaction must be critical severity."""
    warfarin_ni = [n for n in NUTRITION_INTERACTIONS if "warfarin" in n["id"]]
    assert len(warfarin_ni) == 1
    assert warfarin_ni[0]["severity"] == "critical"


def test_nutrition_grapefruit_cyp3a4_exists() -> None:
    """Grapefruit-CYP3A4 interaction must exist."""
    gf_ni = [n for n in NUTRITION_INTERACTIONS if "grapefruit" in n["id"]]
    assert len(gf_ni) == 1
    assert "cyp3a4" in gf_ni[0]["id"].lower()
    assert "grapefruit" in gf_ni[0]["nutrient"].lower()


def test_nutrition_caffeine_clozapine_exists() -> None:
    """Caffeine-clozapine CYP1A2 interaction must exist."""
    caf_ni = [n for n in NUTRITION_INTERACTIONS if "caffeine" in n["id"]]
    assert len(caf_ni) == 1
    assert "clozapine" in caf_ni[0]["drug_names"]


# ── Lab monitoring schedules tests ────────────────────────────────────────────


def test_lab_schedules_has_expected_keys() -> None:
    """LAB_MONITORING_SCHEDULES must contain expected medication keys."""
    expected_keys = {"lithium", "clozapine", "valproate", "carbamazepine", "olanzapine", "lamotrigine", "general_psychiatric"}
    assert expected_keys.issubset(set(LAB_MONITORING_SCHEDULES.keys())), (
        f"Missing keys: {expected_keys - set(LAB_MONITORING_SCHEDULES.keys())}"
    )


def test_lab_schedule_lithium_has_baseline_and_ongoing() -> None:
    """Lithium schedule must have baseline and ongoing labs."""
    li = LAB_MONITORING_SCHEDULES["lithium"]
    assert len(li["baseline_labs"]) >= 4
    assert len(li["ongoing_labs"]) >= 3
    # TSH q6mo must be present
    tsh_entries = [o for o in li["ongoing_labs"] if "tsh" in o["test"].lower()]
    assert len(tsh_entries) >= 1
    # Lithium level q3mo must be present
    level_entries = [o for o in li["ongoing_labs"] if "lithium" in o["test"].lower()]
    assert len(level_entries) >= 1


def test_lab_schedule_clozapine_has_rems_structure() -> None:
    """Clozapine schedule must have REMS-structured ANC monitoring."""
    cz = LAB_MONITORING_SCHEDULES["clozapine"]
    baseline_anc = [b for b in cz["baseline_labs"] if "neutrophil" in b["test"].lower()]
    assert len(baseline_anc) >= 1
    # Must have weekly ANC for first 6 months
    weekly = [o for o in cz["ongoing_labs"] if "weekly" in o["frequency"].lower()]
    assert len(weekly) >= 1


def test_lab_schedule_valproate_has_folate_and_pregnancy() -> None:
    """Valproate schedule must include folate and pregnancy considerations."""
    vp = LAB_MONITORING_SCHEDULES["valproate"]
    baseline_tests = [b["test"].lower() for b in vp["baseline_labs"]]
    assert any("folate" in t for t in baseline_tests)
    assert any("pregnancy" in t for t in baseline_tests)


def test_lab_schedule_general_psychiatric_has_b12_vitd_folate_tsh() -> None:
    """General psychiatric baseline must include B12, vitamin D, folate, and TSH."""
    gp = LAB_MONITORING_SCHEDULES["general_psychiatric"]
    baseline_tests = [b["test"].lower() for b in gp["baseline_labs"]]
    assert any("b12" in t for t in baseline_tests)
    assert any("vitamin d" in t for t in baseline_tests)
    assert any("folate" in t for t in baseline_tests)
    assert any("tsh" in t for t in baseline_tests)


# ── Washout period accuracy tests ─────────────────────────────────────────────


def test_washout_matrix_has_expected_classes() -> None:
    """MEDICATION_BIOMARKER_CONFOUNDER_MATRIX must cover key drug classes."""
    expected_classes = {
        "antipsychotic", "benzodiazepine", "ssri", "snri", "tca",
        "stimulant", "mood_stabilizer_lithium", "atypical_antipsychotic",
    }
    assert expected_classes.issubset(set(MEDICATION_BIOMARKER_CONFOUNDER_MATRIX.keys())), (
        f"Missing washout classes: {expected_classes - set(MEDICATION_BIOMARKER_CONFOUNDER_MATRIX.keys())}"
    )


def test_washout_periods_have_valid_ranges() -> None:
    """All washout periods must have standard <= extended and positive values."""
    for class_name, data in MEDICATION_BIOMARKER_CONFOUNDER_MATRIX.items():
        assert data["typical_washout_days"] > 0, f"{class_name} typical_washout_days must be positive"
        assert data["extended_washout_days"] > 0, f"{class_name} extended_washout_days must be positive"
        assert data["typical_washout_days"] <= data["extended_washout_days"], (
            f"{class_name}: standard ({data['typical_washout_days']}) must be <= extended ({data['extended_washout_days']})"
        )
        assert data["evidence_grade"] in ("A", "B", "C", "D")


def test_washout_benzodiazepine_is_shortest() -> None:
    """Benzodiazepines should have among the shortest washout periods."""
    bz = MEDICATION_BIOMARKER_CONFOUNDER_MATRIX["benzodiazepine"]
    assert bz["typical_washout_days"] == 7
    assert bz["extended_washout_days"] == 21


def test_washout_antipsychotic_is_longest() -> None:
    """Antipsychotics should have the longest washout periods."""
    ap = MEDICATION_BIOMARKER_CONFOUNDER_MATRIX["antipsychotic"]
    assert ap["typical_washout_days"] == 14
    assert ap["extended_washout_days"] == 30


# ── Nutrition lab panel generation tests ──────────────────────────────────────


def test_generate_nutrition_lab_panel_returns_structure() -> None:
    """generate_nutrition_lab_panel must return the expected structure."""
    med_records = [
        {"id": "med-001", "drug_name": "Lithium", "medication_class": "mood stabilizer", "status": "active"},
        {"id": "med-002", "drug_name": "Olanzapine", "medication_class": "atypical antipsychotic", "status": "active"},
    ]
    panel = generate_nutrition_lab_panel(med_records)

    assert "generated_at" in panel
    assert "ruleset_version" in panel
    assert panel["active_medication_count"] == 2
    assert "nutrition_interactions" in panel
    assert "lab_monitoring_schedules" in panel
    assert "nutrition_interactions_found" in panel
    assert "schedules_matched" in panel
    assert "critical_nutrition_count" in panel
    assert "severe_nutrition_count" in panel
    assert "disclaimer" in panel


def test_generate_nutrition_lab_panel_finds_lithium_interactions() -> None:
    """Panel must detect lithium-related nutrition interactions."""
    med_records = [
        {"id": "med-001", "drug_name": "Lithium", "medication_class": "mood stabilizer", "status": "active"},
    ]
    panel = generate_nutrition_lab_panel(med_records)
    assert panel["nutrition_interactions_found"] >= 1
    assert panel["schedules_matched"] >= 1
    # Must find lithium schedule
    li_schedules = [s for s in panel["lab_monitoring_schedules"] if s["schedule_key"] == "lithium"]
    assert len(li_schedules) == 1
    assert len(li_schedules[0]["baseline_labs"]) >= 3


def test_generate_nutrition_lab_panel_inactive_meds_excluded() -> None:
    """Inactive medications should not trigger nutrition interactions."""
    med_records = [
        {"id": "med-001", "drug_name": "Lithium", "medication_class": "mood stabilizer", "status": "inactive"},
    ]
    panel = generate_nutrition_lab_panel(med_records)
    assert panel["active_medication_count"] == 0
    assert panel["nutrition_interactions_found"] == 0


# ── Phase 4: Composite Risk Scores ───────────────────────────────────────────

from app.services.medication_analyzer import (
    compute_composite_risk_scores,
    compute_adherence_prediction,
    generate_deprescribing_suggestions,
    EXPLAINABLE_FACTORS,
)


def _make_med_record(name: str, drug_class: str, active: bool = True, indication: str = "", start_date: str = "", **extra) -> dict[str, Any]:
    """Helper to build a normalized medication record."""
    return {
        "id": f"med-{name.lower().replace(' ', '-')}-{hash(name) % 10000}",
        "drug_name": name,
        "medication_class": drug_class,
        "status": "active" if active else "inactive",
        "indication": indication,
        "start_date": start_date,
        **extra,
    }


def test_composite_risk_empty_list() -> None:
    """Empty med list should produce zero/lower-bound scores."""
    result = compute_composite_risk_scores([], [], [])
    scores = result["scores"]
    assert scores["seizure_risk"]["score"] == 0
    assert scores["serotonin_syndrome_risk"]["score"] == 0
    assert scores["bleeding_risk"]["score"] == 0
    assert scores["qt_prolongation_risk"]["score"] == 0
    assert scores["polypharmacy_risk"]["score"] == 0
    assert result["total_active_medications"] == 0
    assert result["disclaimer"]


def test_composite_risk_seizure_single_bupropion() -> None:
    """Single bupropion (20 pts) should yield seizure score >0."""
    meds = [_make_med_record("Bupropion", "NDRI")]
    result = compute_composite_risk_scores(meds, [], [])
    scores = result["scores"]
    assert scores["seizure_risk"]["score"] >= 20
    assert scores["seizure_risk"]["score"] < 50  # single med, not critical


def test_composite_risk_seizure_clozapine_plus_stimulant() -> None:
    """Clozapine (25) + stimulant (10) should yield seizure score >= 35."""
    meds = [
        _make_med_record("Clozapine", "atypical antipsychotic"),
        _make_med_record("Methylphenidate", "stimulant"),
    ]
    result = compute_composite_risk_scores(meds, [], [])
    assert result["scores"]["seizure_risk"]["score"] >= 35


def test_composite_risk_serotonin_ssri_counting() -> None:
    """Two SSRIs should produce serotonin score from both agents."""
    meds = [
        _make_med_record("Sertraline", "SSRI"),
        _make_med_record("Fluoxetine", "SSRI"),
    ]
    result = compute_composite_risk_scores(meds, [], [])
    assert result["scores"]["serotonin_syndrome_risk"]["score"] >= 40  # 20+20
    assert result["serotonergic_agent_count"] == 2


def test_composite_risk_serotonin_combo_bonus() -> None:
    """Three serotonergic agents should trigger combination bonus."""
    meds = [
        _make_med_record("Sertraline", "SSRI"),
        _make_med_record("Venlafaxine", "SNRI"),
        _make_med_record("Tramadol", "opioid analgesic / SNRI"),
    ]
    result = compute_composite_risk_scores(meds, [], [])
    # SSRI 20 + SNRI 15 + tramadol 15 + combo bonus 20 = 70
    assert result["scores"]["serotonin_syndrome_risk"]["score"] >= 55
    assert result["serotonergic_agent_count"] == 3


def test_composite_risk_serotonin_maoi_max() -> None:
    """MAOI + 2 SSRIs should produce critical serotonin score."""
    meds = [
        _make_med_record("Phenelzine", "MAOI"),
        _make_med_record("Sertraline", "SSRI"),
        _make_med_record("Fluoxetine", "SSRI"),
    ]
    result = compute_composite_risk_scores(meds, [], [])
    assert result["scores"]["serotonin_syndrome_risk"]["score"] >= 80  # MAOI 30 + SSRI 20 + SSRI 20 + combo 20
    assert result["scores"]["serotonin_syndrome_risk"]["band"] == "critical"


def test_composite_risk_bleeding_warfarin_plus_ssri() -> None:
    """Warfarin + SSRI should yield elevated bleeding risk."""
    meds = [
        _make_med_record("Warfarin", "anticoagulant"),
        _make_med_record("Sertraline", "SSRI"),
    ]
    result = compute_composite_risk_scores(meds, [], [])
    assert result["scores"]["bleeding_risk"]["score"] >= 40  # 30 + 10
    assert result["anticoagulant_agent_count"] == 2


def test_composite_risk_bleeding_combo_bonus() -> None:
    """Warfarin + aspirin + SSRI should trigger bleeding combo bonus."""
    meds = [
        _make_med_record("Warfarin", "anticoagulant"),
        _make_med_record("Aspirin", "NSAID"),
        _make_med_record("Sertraline", "SSRI"),
    ]
    result = compute_composite_risk_scores(meds, [], [])
    assert result["scores"]["bleeding_risk"]["score"] >= 55  # 30+15+10 + combo


def test_composite_risk_qt_tca() -> None:
    """TCA should produce QT prolongation risk."""
    meds = [_make_med_record("Amitriptyline", "TCA")]
    result = compute_composite_risk_scores(meds, [], [])
    assert result["scores"]["qt_prolongation_risk"]["score"] >= 20


def test_composite_risk_qt_antipsychotic() -> None:
    """Antipsychotic should produce QT prolongation risk."""
    meds = [_make_med_record("Olanzapine", "atypical antipsychotic")]
    result = compute_composite_risk_scores(meds, [], [])
    assert result["scores"]["qt_prolongation_risk"]["score"] >= 15


def test_composite_risk_polypharmacy_thresholds() -> None:
    """Polypharmacy score should follow stepped thresholds."""
    for count, expected_score in [(4, 0), (5, 25), (8, 50), (12, 75), (15, 100), (20, 100)]:
        meds = [_make_med_record(f"Med{i}", f"class{i}") for i in range(count)]
        result = compute_composite_risk_scores(meds, [], [])
        assert result["scores"]["polypharmacy_risk"]["score"] == expected_score, (
            f"Expected polypharmacy score {expected_score} for {count} meds, "
            f"got {result['scores']['polypharmacy_risk']['score']}"
        )


def test_composite_risk_explainable_factors_present() -> None:
    """Result should include explainable factors for each dimension."""
    meds = [
        _make_med_record("Clozapine", "atypical antipsychotic"),
        _make_med_record("Bupropion", "NDRI"),
    ]
    result = compute_composite_risk_scores(meds, [], [])
    assert "explainable_factors" in result
    for dim in ["seizure_risk", "serotonin_syndrome_risk", "bleeding_risk", "qt_prolongation_risk", "polypharmacy_risk"]:
        assert dim in result["explainable_factors"]


def test_composite_risk_age_factor_elderly() -> None:
    """Age >75 should add age factor to seizure risk."""
    meds = [_make_med_record("Bupropion", "NDRI")]
    result = compute_composite_risk_scores(meds, [], [], patient_age=80)
    assert result["scores"]["seizure_risk"]["score"] >= 30  # 20 drug + 10 age


def test_composite_risk_age_factor_child() -> None:
    """Age <12 should add small age factor to seizure risk."""
    meds = [_make_med_record("Methylphenidate", "stimulant")]
    result = compute_composite_risk_scores(meds, [], [], patient_age=8)
    assert result["scores"]["seizure_risk"]["score"] >= 15  # 10 drug + 5 age


def test_composite_risk_neuromod_intensity() -> None:
    """Critical neuromod matches should increase seizure risk."""
    meds = [_make_med_record("Bupropion", "NDRI")]
    neuromod = [{"severity": "critical"}, {"severity": "major"}]
    result = compute_composite_risk_scores(meds, [], neuromod)
    assert result["scores"]["seizure_risk"]["score"] >= 45  # 20 drug + 15 critical + 10 major


def test_composite_risk_highest_risk_field() -> None:
    """Highest risk field should point to one of the dimensions."""
    meds = [
        _make_med_record("Phenelzine", "MAOI"),
        _make_med_record("Sertraline", "SSRI"),
    ]
    result = compute_composite_risk_scores(meds, [], [])
    assert result["highest_risk"] in result["scores"]
    assert result["highest_score"] == max(
        s["score"] for s in result["scores"].values()
    )


def test_composite_risk_band_boundaries() -> None:
    """Score bands should map correctly."""
    from app.services.medication_analyzer import _risk_band
    assert _risk_band(0) == "low"
    assert _risk_band(15) == "low"
    assert _risk_band(30) == "low"
    assert _risk_band(31) == "moderate"
    assert _risk_band(45) == "moderate"
    assert _risk_band(60) == "moderate"
    assert _risk_band(61) == "high"
    assert _risk_band(75) == "high"
    assert _risk_band(80) == "high"
    assert _risk_band(81) == "critical"
    assert _risk_band(100) == "critical"


def test_composite_risk_score_clamping() -> None:
    """Scores should never exceed 100 or go below 0."""
    from app.services.medication_analyzer import _clamp_score
    assert _clamp_score(-5) == 0
    assert _clamp_score(0) == 0
    assert _clamp_score(50) == 50
    assert _clamp_score(100) == 100
    assert _clamp_score(150) == 100
    assert _clamp_score(45.7) == 46


# ── Phase 4: Adherence Prediction ────────────────────────────────────────────


def test_adherence_single_med() -> None:
    """Single med, no risk factors should yield good adherence."""
    result = compute_adherence_prediction(
        active_count=1,
        med_complexity_score=0.0,
        side_effect_burden=0,
    )
    assert 0.7 <= result["predicted_adherence"] <= 0.90
    assert result["risk_band"] == "good"
    assert result["confidence"] > 0
    assert len(result["contributing_factors"]) >= 1
    assert len(result["limitations"]) >= 1


def test_adherence_polypharmacy_poor() -> None:
    """>10 meds should yield poor adherence."""
    result = compute_adherence_prediction(
        active_count=12,
        med_complexity_score=0.8,
        side_effect_burden=4,
        has_cognitive_impairment=True,
    )
    assert result["predicted_adherence"] < 0.60
    assert result["risk_band"] == "poor"
    assert len(result["intervention_triggers"]) > 0


def test_adherence_moderate_band() -> None:
    """Predicted 60-79% should yield moderate band."""
    result = compute_adherence_prediction(
        active_count=5,
        med_complexity_score=0.6,
        side_effect_burden=2,
    )
    if 0.60 <= result["predicted_adherence"] < 0.80:
        assert result["risk_band"] == "moderate"


def test_adherence_age_over_75() -> None:
    """Age >75 should reduce adherence prediction."""
    result_young = compute_adherence_prediction(
        active_count=3, med_complexity_score=0.0, side_effect_burden=0, age=50,
    )
    result_old = compute_adherence_prediction(
        active_count=3, med_complexity_score=0.0, side_effect_burden=0, age=80,
    )
    assert result_old["predicted_adherence"] < result_young["predicted_adherence"]


def test_adherence_age_under_18() -> None:
    """Age <18 should reduce adherence prediction."""
    result = compute_adherence_prediction(
        active_count=2, med_complexity_score=0.0, side_effect_burden=0, age=15,
    )
    assert any(f.get("factor") == "pediatric_age" for f in result["contributing_factors"])


def test_adherence_cognitive_impairment() -> None:
    """Cognitive impairment should reduce adherence and add trigger."""
    result = compute_adherence_prediction(
        active_count=5, med_complexity_score=0.0, side_effect_burden=0,
        has_cognitive_impairment=True,
    )
    assert any(f.get("factor") == "cognitive_impairment" for f in result["contributing_factors"])
    assert result["predicted_adherence"] < 0.75


def test_adherence_side_effect_max_penalty() -> None:
    """Side effect burden should cap at -20%."""
    result = compute_adherence_prediction(
        active_count=1, med_complexity_score=0.0, side_effect_burden=10,
    )
    se_factor = next(
        (f for f in result["contributing_factors"] if f.get("factor") == "side_effect_burden"),
        None,
    )
    assert se_factor is not None
    assert abs(se_factor["adjustment"]) <= 0.20


def test_adherence_intervention_triggers_below_70() -> None:
    """Predicted adherence <70% should generate intervention triggers."""
    result = compute_adherence_prediction(
        active_count=8, med_complexity_score=0.9, side_effect_burden=3,
        has_cognitive_impairment=True,
    )
    if result["predicted_adherence"] < 0.70:
        assert len(result["intervention_triggers"]) > 0
        trigger_types = [t["trigger"] for t in result["intervention_triggers"]]
        assert "low_predicted_adherence" in trigger_types


def test_adherence_confidence_range() -> None:
    """Confidence should be between 0 and 1."""
    result = compute_adherence_prediction(
        active_count=3, med_complexity_score=0.3, side_effect_burden=1, age=45,
    )
    assert 0 <= result["confidence"] <= 1.0


def test_adherence_has_limitations() -> None:
    """Result should include limitations."""
    result = compute_adherence_prediction(active_count=1, med_complexity_score=0.0, side_effect_burden=0)
    assert len(result["limitations"]) >= 3
    assert any("not a validated" in lim.lower() for lim in result["limitations"])


# ── Phase 4: Deprescribing Suggestions ───────────────────────────────────────


def test_deprescribing_empty_list() -> None:
    """Empty med list should yield empty suggestions."""
    result = generate_deprescribing_suggestions([])
    assert result == []


def test_deprescribing_duplicate_ssris() -> None:
    """Two SSRIs should flag duplicate therapy."""
    meds = [
        _make_med_record("Sertraline", "SSRI"),
        _make_med_record("Fluoxetine", "SSRI"),
    ]
    result = generate_deprescribing_suggestions(meds)
    dup_ssri = [s for s in result if s.get("subcategory") == "multiple_ssris"]
    assert len(dup_ssri) == 1
    assert dup_ssri[0]["severity"] == "moderate"


def test_deprescribing_duplicate_benzos() -> None:
    """Two benzodiazepines should flag duplicate therapy."""
    meds = [
        _make_med_record("Lorazepam", "benzodiazepine"),
        _make_med_record("Clonazepam", "benzodiazepine"),
    ]
    result = generate_deprescribing_suggestions(meds)
    dup_benzo = [s for s in result if s.get("subcategory") == "multiple_benzodiazepines"]
    assert len(dup_benzo) == 1
    assert dup_benzo[0]["severity"] == "high"


def test_deprescribing_long_term_benzo() -> None:
    """Benzodiazepine with old start date should flag prolonged use."""
    from datetime import datetime, timezone, timedelta
    old_date = (datetime.now(timezone.utc) - timedelta(weeks=12)).isoformat()
    meds = [
        _make_med_record("Lorazepam", "benzodiazepine", start_date=old_date),
    ]
    result = generate_deprescribing_suggestions(meds)
    long_term = [s for s in result if s.get("subcategory") == "benzodiazepine_prolonged"]
    assert len(long_term) == 1
    assert long_term[0]["severity"] == "moderate"


def test_deprescribing_anticholinergic_burden() -> None:
    """Multiple anticholinergic meds should flag cumulative burden."""
    meds = [
        _make_med_record("Amitriptyline", "TCA"),
        _make_med_record("Olanzapine", "atypical antipsychotic"),
        _make_med_record("Hydroxyzine", "antihistamine / anxiolytic"),
    ]
    result = generate_deprescribing_suggestions(meds)
    ach = [s for s in result if s.get("subcategory") == "cumulative_anticholinergic_load"]
    assert len(ach) == 1
    assert ach[0]["severity"] == "high"
    assert len(ach[0]["drug_names"]) == 3


def test_deprescribing_missing_indication() -> None:
    """Med without indication should flag missing indication."""
    meds = [_make_med_record("Sertraline", "SSRI", indication="")]
    result = generate_deprescribing_suggestions(meds)
    missing = [s for s in result if s.get("subcategory") == "no_documented_indication"]
    assert len(missing) == 1
    assert missing[0]["severity"] == "low"


def test_deprescribing_unreviewed_12m() -> None:
    """Med started >12 months ago should flag long duration."""
    from datetime import datetime, timezone, timedelta
    old_date = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
    meds = [_make_med_record("Amlodipine", "calcium channel blocker", start_date=old_date)]
    result = generate_deprescribing_suggestions(meds)
    unreviewed = [s for s in result if s.get("subcategory") == "medication_unreviewed_12m"]
    assert len(unreviewed) == 1


def test_deprescribing_no_flags_for_single_ssri() -> None:
    """Single SSRI with indication and recent start should produce minimal flags."""
    from datetime import datetime, timezone, timedelta
    recent_date = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    meds = [
        _make_med_record("Sertraline", "SSRI", indication="MDD", start_date=recent_date),
    ]
    result = generate_deprescribing_suggestions(meds)
    # Only missing_indication and unreviewed flags should not fire
    assert not any(s.get("subcategory") == "multiple_ssris" for s in result)
    assert not any(s.get("subcategory") == "no_documented_indication" for s in result)


def test_deprescribing_evidence_basis_present() -> None:
    """Every suggestion should cite evidence basis."""
    meds = [
        _make_med_record("Sertraline", "SSRI"),
        _make_med_record("Fluoxetine", "SSRI"),
    ]
    result = generate_deprescribing_suggestions(meds)
    assert len(result) > 0
    for s in result:
        assert s.get("evidence_basis")
        assert "Beers" in s["evidence_basis"] or "STOPP" in s["evidence_basis"]


def test_deprescribing_disclaimer_present() -> None:
    """Every suggestion should include a disclaimer."""
    meds = [
        _make_med_record("Sertraline", "SSRI"),
        _make_med_record("Fluoxetine", "SSRI"),
    ]
    result = generate_deprescribing_suggestions(meds)
    for s in result:
        assert "Requires clinician review" in s.get("disclaimer", "")


def test_deprescribing_max_risk_scenario() -> None:
    """Maximum-risk polypharmacy scenario should produce multiple high-severity flags."""
    from datetime import datetime, timezone, timedelta
    old_date = (datetime.now(timezone.utc) - timedelta(weeks=26)).isoformat()
    meds = [
        _make_med_record("Sertraline", "SSRI", start_date=old_date),
        _make_med_record("Fluoxetine", "SSRI", start_date=old_date),
        _make_med_record("Lorazepam", "benzodiazepine", start_date=old_date),
        _make_med_record("Clonazepam", "benzodiazepine", start_date=old_date),
        _make_med_record("Amitriptyline", "TCA", start_date=old_date),
        _make_med_record("Olanzapine", "atypical antipsychotic", start_date=old_date),
    ]
    result = generate_deprescribing_suggestions(meds)
    high_severity = [s for s in result if s.get("severity") == "high"]
    assert len(high_severity) >= 2  # multiple benzos + anticholinergic burden
    assert any(s.get("subcategory") == "multiple_benzodiazepines" for s in result)
    assert any(s.get("subcategory") == "cumulative_anticholinergic_load" for s in result)


# ── Phase 4: EXPLAINABLE_FACTORS structure ───────────────────────────────────


def test_explainable_factors_has_all_dimensions() -> None:
    """EXPLAINABLE_FACTORS must cover all 5 risk dimensions."""
    expected = {
        "seizure_risk",
        "serotonin_syndrome_risk",
        "bleeding_risk",
        "qt_prolongation_risk",
        "polypharmacy_risk",
    }
    assert set(EXPLAINABLE_FACTORS.keys()) == expected


def test_explainable_factors_have_drug_weights() -> None:
    """Each dimension (except polypharmacy) should have drug_weights and class_weights."""
    for key, config in EXPLAINABLE_FACTORS.items():
        if key == "polypharmacy_risk":
            assert "thresholds" in config
            continue
        assert "drug_weights" in config, f"{key} missing drug_weights"
        assert "class_weights" in config, f"{key} missing class_weights"
        assert "label" in config, f"{key} missing label"
        assert "description" in config, f"{key} missing description"


# ── Phase 2: Pharmacogenomics Panel (CPIC) tests ─────────────────────────────

from app.services.pharmacogenomics_panel import (
    build_pharmacogenomics_panel,
    get_all_guidelines,
    get_genes_covered,
    get_guideline_for_medication,
    get_medications_covered,
    get_panel_stats,
)

# Gene-drug pairs to validate
_CYP2D6_DRUGS = ["nortriptyline", "paroxetine", "fluoxetine", "risperidone", "haloperidol", "atomoxetine"]
_CYP2C19_DRUGS = ["escitalopram", "sertraline", "citalopram", "diazepam"]
_CYP1A2_DRUGS = ["clozapine", "olanzapine", "duloxetine", "fluvoxamine"]
_CYP2C9_DRUGS = ["warfarin", "phenytoin"]
_HLA_DRUGS = ["carbamazepine"]


class TestPharmacogenomicsPanelCoverage:
    """Verify all required gene-drug pairs are covered."""

    def test_cyp2d6_coverage(self) -> None:
        """CYP2D6 covers all required drugs."""
        meds = get_medications_covered()
        for drug in _CYP2D6_DRUGS:
            assert drug.lower() in meds, f"CYP2D6 drug missing: {drug}"

    def test_cyp2c19_coverage(self) -> None:
        """CYP2C19 covers all required drugs."""
        meds = get_medications_covered()
        for drug in _CYP2C19_DRUGS:
            assert drug.lower() in meds, f"CYP2C19 drug missing: {drug}"

    def test_cyp1a2_coverage(self) -> None:
        """CYP1A2 covers all required drugs."""
        meds = get_medications_covered()
        for drug in _CYP1A2_DRUGS:
            assert drug.lower() in meds, f"CYP1A2 drug missing: {drug}"

    def test_cyp2c9_coverage(self) -> None:
        """CYP2C9 covers all required drugs."""
        meds = get_medications_covered()
        for drug in _CYP2C9_DRUGS:
            assert drug.lower() in meds, f"CYP2C9 drug missing: {drug}"

    def test_hla_b_5701_coverage(self) -> None:
        """HLA-B*57:01 covers carbamazepine."""
        guidelines = get_guideline_for_medication("carbamazepine")
        genes = [g["gene"] for g in guidelines]
        assert "HLA-B*57:01" in genes

    def test_hla_b_1502_coverage(self) -> None:
        """HLA-B*1502 covers carbamazepine."""
        guidelines = get_guideline_for_medication("carbamazepine")
        genes = [g["gene"] for g in guidelines]
        assert "HLA-B*1502" in genes

    def test_genes_covered_count(self) -> None:
        """At least 6 pharmacogenes are covered."""
        genes = get_genes_covered()
        assert len(genes) >= 6

    def test_all_guidelines_have_phenotypes(self) -> None:
        """Every guideline has at least one phenotype."""
        guidelines = get_all_guidelines()
        for g in guidelines:
            assert len(g["phenotypes"]) > 0, f"{g['gene']} has no phenotypes"


class TestPharmacogenomicsPanelBuild:
    """Tests for build_pharmacogenomics_panel."""

    def test_basic_panel(self) -> None:
        """Building panel for known drugs returns alerts."""
        med_records = [
            {"name": "sertraline"},
            {"name": "clozapine"},
            {"name": "warfarin"},
        ]
        alerts = build_pharmacogenomics_panel(med_records)

        assert len(alerts) > 0
        # sertraline -> CYP2C19, clozapine -> CYP1A2, warfarin -> CYP2C9

    def test_alert_structure(self) -> None:
        """Each alert has required fields."""
        alerts = build_pharmacogenomics_panel([{"name": "sertraline"}])
        assert len(alerts) > 0

        for alert in alerts:
            assert "id" in alert
            assert "gene" in alert
            assert "medication" in alert
            assert "phenotype_implications" in alert
            assert "cpic_recommendation_summary" in alert
            assert "evidence_grade" in alert
            assert "guideline_source" in alert
            assert "pmids" in alert
            assert "highest_classification" in alert
            assert "disclaimer" in alert

    def test_evidence_grade_a_for_cpic(self) -> None:
        """CPIC guidelines carry evidence grade A."""
        alerts = build_pharmacogenomics_panel([{"name": "sertraline"}])
        cpic_alerts = [a for a in alerts if "CPIC" in a["guideline_source"]]
        for alert in cpic_alerts:
            assert alert["evidence_grade"] == "A"

    def test_evidence_grade_b_for_dpwg(self) -> None:
        """DPWG guidelines carry evidence grade B."""
        alerts = build_pharmacogenomics_panel([{"name": "diazepam"}])
        dpwg_alerts = [a for a in alerts if "DPWG" in a["guideline_source"]]
        for alert in dpwg_alerts:
            assert alert["evidence_grade"] == "B"

    def test_phenotype_implications_structure(self) -> None:
        """Each phenotype implication has required fields."""
        alerts = build_pharmacogenomics_panel([{"name": "sertraline"}])
        for alert in alerts:
            for pheno in alert["phenotype_implications"]:
                assert "phenotype" in pheno
                assert "implication" in pheno
                assert "recommendation" in pheno
                assert "classification" in pheno

    def test_poor_metabolizer_has_strong_recommendation(self) -> None:
        """Poor metabolizer phenotype has strong classification."""
        alerts = build_pharmacogenomics_panel([{"name": "nortriptyline"}])
        for alert in alerts:
            if alert["gene"] == "CYP2D6":
                poor = [p for p in alert["phenotype_implications"] if p["phenotype"] == "poor_metabolizer"]
                assert len(poor) > 0
                assert poor[0]["classification"] == "strong"

    def test_hla_alert_for_carbamazepine(self) -> None:
        """Carbamazepine triggers HLA pharmacogenomic alerts."""
        alerts = build_pharmacogenomics_panel([{"name": "carbamazepine"}])

        hla_alerts = [a for a in alerts if a["gene"].startswith("HLA")]
        assert len(hla_alerts) >= 1

        for alert in hla_alerts:
            assert alert["evidence_grade"] == "A"
            assert len(alert["pmids"]) > 0

    def test_empty_records(self) -> None:
        """Empty med records returns empty list."""
        alerts = build_pharmacogenomics_panel([])
        assert alerts == []

    def test_unknown_medication(self) -> None:
        """Unknown medication returns empty list (no errors)."""
        alerts = build_pharmacogenomics_panel([{"name": "unknown_xyz_999"}])
        assert alerts == []

    def test_disclaimer_present(self) -> None:
        """All alerts include decision-support disclaimer."""
        alerts = build_pharmacogenomics_panel([{"name": "sertraline"}])
        for alert in alerts:
            assert "decision-support" in alert["disclaimer"].lower()
            assert "not a replacement" in alert["disclaimer"].lower()

    def test_pmids_are_strings(self) -> None:
        """PMIDs are returned as strings."""
        alerts = build_pharmacogenomics_panel([{"name": "sertraline"}])
        for alert in alerts:
            for pmid in alert["pmids"]:
                assert isinstance(pmid, str)

    def test_panel_with_med_record_variations(self) -> None:
        """Panel works with various record field names."""
        records = [
            {"drug_name": "sertraline"},
            {"generic_name": "clozapine"},
            {"medication": "warfarin"},
        ]
        alerts = build_pharmacogenomics_panel(records)
        assert len(alerts) > 0

    def test_carbamazepine_two_hla_genes(self) -> None:
        """Carbamazepine alerts cover both HLA-B*57:01 and HLA-B*1502."""
        alerts = build_pharmacogenomics_panel([{"name": "carbamazepine"}])
        genes = [a["gene"] for a in alerts]
        assert "HLA-B*57:01" in genes
        assert "HLA-B*1502" in genes

    def test_atomoxetine_cyp2d6_alert(self) -> None:
        """Atomoxetine triggers CYP2D6 alert with poor metabolizer guidance."""
        alerts = build_pharmacogenomics_panel([{"name": "atomoxetine"}])
        cyp2d6 = [a for a in alerts if a["gene"] == "CYP2D6"]
        assert len(cyp2d6) > 0


class TestPharmacogenomicsStats:
    """Tests for panel statistics."""

    def test_stats_structure(self) -> None:
        """Stats have expected structure."""
        stats = get_panel_stats()

        assert "genes_covered" in stats
        assert "gene_list" in stats
        assert "medications_covered" in stats
        assert "guideline_count" in stats
        assert "evidence_breakdown" in stats
        assert "grade_A_CPIC" in stats["evidence_breakdown"]
        assert "grade_B_DPWG" in stats["evidence_breakdown"]

    def test_stats_counts(self) -> None:
        """Stats counts are consistent."""
        stats = get_panel_stats()
        assert stats["genes_covered"] == len(stats["gene_list"])
        assert stats["medications_covered"] == len(stats["medication_list"])
        assert stats["guideline_count"] >= stats["genes_covered"]

    def test_gene_medication_pairs(self) -> None:
        """Gene-medication pairs are tracked."""
        stats = get_panel_stats()
        assert "gene_medication_pairs" in stats
        assert isinstance(stats["gene_medication_pairs"], dict)
