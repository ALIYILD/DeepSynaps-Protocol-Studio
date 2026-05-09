"""Pin the public pure-function contracts of app/services/assessment_summary.py.

Only the stateless helpers are exercised here — DB-dependent functions
(get_patient_assessment_summary, extract_ai_assessment_context) are
intentionally excluded to keep setup minimal.
"""
from __future__ import annotations

import pytest

from app.services.assessment_summary import (
    _template_key,
    normalize_assessment_score,
    severity_is_at_least,
)


# ── _template_key ─────────────────────────────────────────────────────────────

class TestTemplateKey:
    def test_lowercase_strip(self):
        assert _template_key("PHQ-9") == "phq9"

    def test_hyphen_removed(self):
        assert _template_key("gad-7") == "gad7"

    def test_underscore_preserved_in_generic_names(self):
        # _template_key only removes HYPHENS, not underscores (except _rs_5 special case)
        assert _template_key("gad_7") == "gad_7"

    def test_adhd_rs5_normalised(self):
        assert _template_key("adhd_rs_5") == "adhd_rs5"
        # after hyphen removal "adhd_rs-5" becomes "adhd_rs5" (hyphen stripped then special case matches)
        assert _template_key("adhd_rs-5") == "adhd_rs5"

    def test_empty_string_safe(self):
        assert _template_key("") == ""

    def test_already_normalised(self):
        assert _template_key("phq9") == "phq9"

    def test_c_hyphen_ssrs_becomes_cssrs(self):
        # hyphen stripped: "c-ssrs" → "cssrs" (NOT "c_ssrs" which is the band key)
        assert _template_key("c-ssrs") == "cssrs"

    def test_c_underscore_ssrs_stays(self):
        # underscore preserved: "c_ssrs" → "c_ssrs" (the correct band key)
        assert _template_key("c_ssrs") == "c_ssrs"


# ── normalize_assessment_score ────────────────────────────────────────────────

class TestNormalizeAssessmentScore:
    # PHQ-9 bands: ≤4→minimal ≤9→mild ≤14→moderate ≤19→severe >19→critical
    def test_phq9_boundary_minimal(self):
        r = normalize_assessment_score("phq9", 4.0)
        assert r["severity"] == "minimal"
        assert r["label"] == "Minimal"
        assert "4.0" in r["interpretation"]

    def test_phq9_boundary_mild(self):
        r = normalize_assessment_score("PHQ-9", 9.0)
        assert r["severity"] == "mild"

    def test_phq9_boundary_moderate(self):
        r = normalize_assessment_score("phq9", 14.0)
        assert r["severity"] == "moderate"
        assert r["label"] == "Moderate"

    def test_phq9_boundary_severe(self):
        r = normalize_assessment_score("phq9", 19.0)
        assert r["severity"] == "severe"
        assert r["label"] == "Moderately Severe"

    def test_phq9_critical(self):
        r = normalize_assessment_score("phq9", 27.0)
        assert r["severity"] == "critical"
        assert r["label"] == "Severe"

    def test_phq9_above_max_clamps_to_last_band(self):
        # Score beyond max band should still return the last band
        r = normalize_assessment_score("phq9", 100.0)
        assert r["severity"] == "critical"

    # GAD-7 bands: ≤4→minimal ≤9→mild ≤14→moderate >14→severe
    def test_gad7_minimal(self):
        r = normalize_assessment_score("gad7", 0.0)
        assert r["severity"] == "minimal"

    def test_gad7_severe(self):
        r = normalize_assessment_score("gad7", 21.0)
        assert r["severity"] == "severe"

    # ISI bands: ≤7→minimal ≤14→mild ≤21→moderate >21→severe
    def test_isi_no_insomnia(self):
        r = normalize_assessment_score("isi", 5.0)
        assert r["severity"] == "minimal"
        assert "No clinically significant insomnia" in r["label"]

    def test_isi_moderate(self):
        r = normalize_assessment_score("isi", 20.0)
        assert r["severity"] == "moderate"

    # C-SSRS: 0→minimal 1→mild ≤3→severe >3→critical
    def test_cssrs_no_ideation(self):
        r = normalize_assessment_score("c_ssrs", 0.0)
        assert r["severity"] == "minimal"
        assert r["label"] == "No Ideation"

    def test_cssrs_passive_ideation(self):
        r = normalize_assessment_score("c_ssrs", 1.0)
        assert r["severity"] == "mild"
        assert r["label"] == "Passive ideation"

    def test_cssrs_active_ideation(self):
        r = normalize_assessment_score("c_ssrs", 3.0)
        assert r["severity"] == "severe"

    def test_cssrs_plan(self):
        # Must use underscore form; hyphen form ("c-ssrs") strips to "cssrs" which has no band
        r = normalize_assessment_score("c_ssrs", 6.0)
        assert r["severity"] == "critical"
        assert "plan" in r["label"].lower() or "behavior" in r["label"].lower()

    # Edge cases
    def test_none_score_returns_unknown(self):
        r = normalize_assessment_score("phq9", None)
        assert r["severity"] == "unknown"
        assert r["level"] is None
        assert r["label"] is None

    def test_unknown_template_returns_unknown(self):
        r = normalize_assessment_score("zz_does_not_exist", 10.0)
        assert r["severity"] == "unknown"
        assert r["level"] is None

    def test_unknown_template_interpretation_contains_score(self):
        r = normalize_assessment_score("zz_does_not_exist", 42.0)
        assert "42" in r["interpretation"]

    def test_sf12_returns_unknown(self):
        # sf12 band is explicitly empty []
        r = normalize_assessment_score("sf12", 50.0)
        assert r["severity"] == "unknown"

    # YBOCS bands: ≤7→minimal ≤15→mild ≤23→moderate ≤31→severe >31→critical
    def test_ybocs_extreme(self):
        r = normalize_assessment_score("ybocs", 40.0)
        assert r["severity"] == "critical"

    # DASS-21 bands
    def test_dass21_normal(self):
        r = normalize_assessment_score("dass21", 10.0)
        assert r["severity"] == "minimal"

    def test_dass21_severe(self):
        r = normalize_assessment_score("dass21", 63.0)
        assert r["severity"] == "severe"


# ── severity_is_at_least ──────────────────────────────────────────────────────

class TestSeverityIsAtLeast:
    def test_critical_is_at_least_severe(self):
        assert severity_is_at_least("critical", "severe") is True

    def test_critical_is_at_least_critical(self):
        assert severity_is_at_least("critical", "critical") is True

    def test_minimal_is_not_at_least_mild(self):
        assert severity_is_at_least("minimal", "mild") is False

    def test_moderate_is_at_least_moderate(self):
        assert severity_is_at_least("moderate", "moderate") is True

    def test_moderate_not_at_least_severe(self):
        assert severity_is_at_least("moderate", "severe") is False

    def test_unknown_severity_treated_as_zero(self):
        # unknown maps to -1 which is < 0 (minimal), so not >= minimal
        assert severity_is_at_least("unknown", "minimal") is False

    def test_unknown_threshold_never_reached(self):
        # threshold 'unknown' maps to 99 — nothing can reach it
        assert severity_is_at_least("critical", "unknown") is False
