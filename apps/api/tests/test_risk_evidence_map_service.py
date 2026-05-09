"""Pin the public contracts of app/services/risk_evidence_map.py.

The module is entirely static data — no DB, no network.  We pin:
  - the 8 canonical category names
  - labels
  - key structural fields of each evidence-map entry
  - seizure-threshold drug list membership
  - magnetic modalities set
"""
from __future__ import annotations

import pytest

from app.services.risk_evidence_map import (
    MAGNETIC_MODALITIES,
    RISK_CATEGORIES,
    RISK_CATEGORY_LABELS,
    RISK_EVIDENCE_MAP,
    SEIZURE_THRESHOLD_DRUGS,
)


# ── RISK_CATEGORIES ───────────────────────────────────────────────────────────

class TestRiskCategories:
    EXPECTED = [
        "allergy",
        "suicide_risk",
        "mental_crisis",
        "self_harm",
        "harm_to_others",
        "seizure_risk",
        "implant_risk",
        "medication_interaction",
    ]

    def test_exact_eight_categories(self):
        assert len(RISK_CATEGORIES) == 8

    def test_all_expected_categories_present(self):
        for cat in self.EXPECTED:
            assert cat in RISK_CATEGORIES, f"{cat!r} missing from RISK_CATEGORIES"

    def test_order_preserved(self):
        assert RISK_CATEGORIES == self.EXPECTED


# ── RISK_CATEGORY_LABELS ──────────────────────────────────────────────────────

class TestRiskCategoryLabels:
    def test_all_categories_have_labels(self):
        for cat in RISK_CATEGORIES:
            assert cat in RISK_CATEGORY_LABELS, f"No label for {cat!r}"

    def test_labels_are_non_empty_strings(self):
        for cat, label in RISK_CATEGORY_LABELS.items():
            assert isinstance(label, str) and label, f"Empty label for {cat!r}"

    def test_specific_labels(self):
        assert RISK_CATEGORY_LABELS["suicide_risk"] == "Suicide Risk"
        assert RISK_CATEGORY_LABELS["seizure_risk"] == "Epilepsy / Seizure"
        assert RISK_CATEGORY_LABELS["implant_risk"] == "Piercing / Implants"
        assert RISK_CATEGORY_LABELS["medication_interaction"] == "Medication"


# ── RISK_EVIDENCE_MAP ─────────────────────────────────────────────────────────

class TestRiskEvidenceMap:
    def test_all_categories_in_map(self):
        for cat in RISK_CATEGORIES:
            assert cat in RISK_EVIDENCE_MAP, f"Category {cat!r} not in RISK_EVIDENCE_MAP"

    def test_each_entry_has_required_keys(self):
        required = {"condition_package_paths", "keyword_filters", "modality_relevance", "safety_flag_ids"}
        for cat, entry in RISK_EVIDENCE_MAP.items():
            for key in required:
                assert key in entry, f"Key {key!r} missing from entry for {cat!r}"

    def test_keyword_filters_are_lists_of_strings(self):
        for cat, entry in RISK_EVIDENCE_MAP.items():
            filters = entry["keyword_filters"]
            assert isinstance(filters, list), f"keyword_filters for {cat!r} not a list"
            for kw in filters:
                assert isinstance(kw, str), f"Non-string keyword in {cat!r}"

    def test_suicide_risk_has_unstable_psych_flag(self):
        entry = RISK_EVIDENCE_MAP["suicide_risk"]
        assert "unstable_psych" in entry["safety_flag_ids"]

    def test_seizure_risk_has_both_safety_flags(self):
        entry = RISK_EVIDENCE_MAP["seizure_risk"]
        assert "seizure_history" in entry["safety_flag_ids"]
        assert "lower_threshold_meds" in entry["safety_flag_ids"]

    def test_implant_risk_has_expected_keywords(self):
        kws = RISK_EVIDENCE_MAP["implant_risk"]["keyword_filters"]
        assert "pacemaker" in kws
        assert "DBS" in kws

    def test_implant_risk_has_magnetic_modalities(self):
        mods = RISK_EVIDENCE_MAP["implant_risk"]["modality_relevance"]
        assert "rtms" in mods
        assert "dtms" in mods

    def test_seizure_risk_has_rtms_in_modality_relevance(self):
        mods = RISK_EVIDENCE_MAP["seizure_risk"]["modality_relevance"]
        assert "rtms" in mods


# ── SEIZURE_THRESHOLD_DRUGS ───────────────────────────────────────────────────

class TestSeizureThresholdDrugs:
    def test_bupropion_in_list(self):
        assert "bupropion" in SEIZURE_THRESHOLD_DRUGS

    def test_clozapine_in_list(self):
        assert "clozapine" in SEIZURE_THRESHOLD_DRUGS

    def test_tramadol_in_list(self):
        assert "tramadol" in SEIZURE_THRESHOLD_DRUGS

    def test_all_lowercase(self):
        for drug in SEIZURE_THRESHOLD_DRUGS:
            assert drug == drug.lower(), f"{drug!r} not lowercase"

    def test_no_duplicates(self):
        assert len(SEIZURE_THRESHOLD_DRUGS) == len(set(SEIZURE_THRESHOLD_DRUGS))

    def test_minimum_count(self):
        # Must list at least 10 known threshold-lowering drugs
        assert len(SEIZURE_THRESHOLD_DRUGS) >= 10


# ── MAGNETIC_MODALITIES ───────────────────────────────────────────────────────

class TestMagneticModalities:
    def test_rtms_is_magnetic(self):
        assert "rtms" in MAGNETIC_MODALITIES

    def test_dtms_is_magnetic(self):
        assert "dtms" in MAGNETIC_MODALITIES

    def test_mrgfus_is_magnetic(self):
        assert "mrgfus" in MAGNETIC_MODALITIES

    def test_tdcs_not_magnetic(self):
        # tDCS is electrical, not magnetic
        assert "tdcs" not in MAGNETIC_MODALITIES

    def test_is_a_set(self):
        assert isinstance(MAGNETIC_MODALITIES, (set, frozenset))
