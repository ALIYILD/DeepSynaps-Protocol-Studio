"""Tests for the deterministic tool surface in ``deepsynaps_qeeg.ai.copilot``.

Pins the load-bearing **safety refusal + banned-vocabulary** copilot
contract:

- is_unsafe_query catches every clinical-advice-seeking phrase pattern
  baked into SAFETY_REFUSAL_PATTERNS. The router uses this to refuse
  diagnosis / prescription / self-harm queries.
- REFUSAL_MESSAGE wording is pinned; refactor cannot dilute it.
- _sanitize_banned_words rewrites every "diagnose"/"diagnostic"/
  "treatment recommendation"/"diagnosis" form into research-only
  language. Case-insensitive across the full inflection set.
- All six tools (explain_feature / explain_channel / search_papers /
  compare_to_norm / explain_medication / get_recommendation_detail)
  return safe envelopes for empty / unknown / malformed input — never
  raise.
- mock_llm_tool_dispatch routes prefixes correctly and short-circuits
  on unsafe queries.
"""
from __future__ import annotations

from typing import Any
from unittest import mock

import pytest

from deepsynaps_qeeg.ai.copilot import (
    REFUSAL_MESSAGE,
    SAFETY_REFUSAL_PATTERNS,
    _centile_from_z,
    _format_medication_confounds,
    _normal_sf,
    _sanitize_banned_words,
    _truncate,
    is_unsafe_query,
    mock_llm_tool_dispatch,
    render_system_prompt,
    tool_compare_to_norm,
    tool_explain_channel,
    tool_explain_feature,
    tool_explain_medication,
    tool_get_recommendation_detail,
    tool_search_papers,
)


# ── is_unsafe_query ───────────────────────────────────────────────────────


class TestIsUnsafeQuery:
    @pytest.mark.parametrize(
        "query",
        [
            "should I take more sertraline?",
            "should i stop my medication",
            "Can I increase my dose?",
            "prescribe me something for sleep",
            "Can you diagnose this?",
            "diagnose me",
            "diagnosis me please",
            "am I depressed?",
            "do I have ADHD?",
            "cure my anxiety",
            "treatment recommendation for me",
            "which SSRI should I take",
            "dosage for me",
            "I want to commit suicide",
            "I want to kill myself",
            "self-harm thoughts",
            "self harm",
        ],
    )
    def test_clinical_advice_phrases_caught(self, query: str) -> None:
        # Pin the safety gate: every documented clinical-advice or
        # self-harm pattern must trip the refusal.
        assert is_unsafe_query(query) is True

    @pytest.mark.parametrize(
        "query",
        [
            "What does theta/beta ratio mean?",
            "explain the alpha asymmetry feature",
            "search for papers on rTMS",
            "what is the protocol confidence?",
            "show me the citations",
        ],
    )
    def test_safe_queries_pass(self, query: str) -> None:
        assert is_unsafe_query(query) is False

    def test_empty_query_returns_false(self) -> None:
        assert is_unsafe_query("") is False
        assert is_unsafe_query(None) is False  # type: ignore[arg-type]


class TestRefusalMessage:
    def test_refusal_carries_load_bearing_phrases(self) -> None:
        # Pin the wording: "can't give personal medical advice",
        # "adjust medication", "diagnose", "consult your clinician".
        assert "can't give personal medical advice" in REFUSAL_MESSAGE
        assert "adjust" in REFUSAL_MESSAGE
        assert "medication" in REFUSAL_MESSAGE
        assert "diagnose" in REFUSAL_MESSAGE
        assert "consult your clinician" in REFUSAL_MESSAGE

    def test_pattern_list_includes_self_harm_phrases(self) -> None:
        joined = " ".join(SAFETY_REFUSAL_PATTERNS)
        assert "suicide" in joined
        assert "kill myself" in joined
        assert "self.?harm" in joined or "self-harm" in joined.replace(".?", "-")


# ── tool_explain_feature ──────────────────────────────────────────────────


class TestToolExplainFeature:
    def test_known_feature_returns_full_entry(self) -> None:
        out = tool_explain_feature("frontal_alpha_asymmetry")
        assert "Frontal alpha asymmetry" in out["name"]
        assert out["definition"]
        assert out["clinical_relevance"]
        assert out["normal_range"]

    @pytest.mark.parametrize(
        "alias",
        ["FAA", "tbr", "PAF", "iAPF", "DMN", "MDD", "adhd", "anxiety"],
    )
    def test_aliases_resolve_to_full_entry(self, alias: str) -> None:
        out = tool_explain_feature(alias)
        # Aliased entry must NOT be the generic fallback.
        assert "No encyclopedia entry available" not in out["definition"]

    def test_unknown_feature_returns_generic_fallback(self) -> None:
        out = tool_explain_feature("never_heard_of_this_feature")
        assert "No encyclopedia entry available" in out["definition"]
        assert out["name"] == "never_heard_of_this_feature"

    def test_empty_feature_returns_unknown_envelope(self) -> None:
        out = tool_explain_feature("")
        assert out["name"] == "Unknown feature"
        assert out["normal_range"] == "unknown"

    def test_punctuation_normalised(self) -> None:
        # "frontal-alpha-asymmetry" should resolve via the underscore
        # normalisation path.
        out = tool_explain_feature("frontal-alpha-asymmetry")
        assert "Frontal alpha asymmetry" in out["name"]

    def test_case_insensitive(self) -> None:
        out = tool_explain_feature("THETA_BETA_RATIO")
        assert "Theta/Beta ratio" in out["name"]


# ── tool_explain_channel ──────────────────────────────────────────────────


class TestToolExplainChannel:
    def test_empty_channel_returns_empty_envelope(self) -> None:
        out = tool_explain_channel("")
        assert out["channel"] == ""
        assert out["anatomy"] == ""
        assert out["artifacts"] == []

    def test_known_channel_returns_anatomy_and_artifacts(self) -> None:
        out = tool_explain_channel("Fp1")
        assert out["channel"] == "Fp1"
        # Anatomy comes from the knowledge atlas — non-empty for Fp1.
        assert out["anatomy"] is not None
        assert isinstance(out["artifacts"], list)


# ── tool_search_papers ────────────────────────────────────────────────────


class TestToolSearchPapers:
    def test_empty_query_returns_empty_list(self) -> None:
        assert tool_search_papers("") == []
        assert tool_search_papers("   ") == []

    def test_medrag_failure_returns_empty(self) -> None:
        # Pin: a medrag retrieval exception is swallowed and the tool
        # returns [] rather than crashing the copilot.
        with mock.patch(
            "deepsynaps_qeeg.ai.medrag.retrieve",
            side_effect=RuntimeError("simulated"),
        ):
            assert tool_search_papers("alpha asymmetry") == []

    def test_medrag_results_normalised_to_dict_shape(self) -> None:
        rows = [
            {
                "pmid": "111",
                "doi": "10.1/x",
                "title": "X",
                "year": 2024,
                "authors": "A",
                "url": "https://example.org",
                "relevance_score": 0.9,
            },
            "garbage row that gets skipped",
        ]
        with mock.patch(
            "deepsynaps_qeeg.ai.medrag.retrieve", return_value=rows
        ):
            out = tool_search_papers("query", k=5)
        assert len(out) == 1
        assert out[0]["pmid"] == "111"


# ── _normal_sf / _centile_from_z ─────────────────────────────────────────


class TestNormalCdf:
    def test_z_zero_centile_50(self) -> None:
        assert _centile_from_z(0.0) == pytest.approx(50.0, rel=1e-3)

    def test_z_positive_centile_above_50(self) -> None:
        assert _centile_from_z(1.0) > 50.0

    def test_z_negative_centile_below_50(self) -> None:
        assert _centile_from_z(-1.0) < 50.0

    def test_z_2_centile_around_97_5(self) -> None:
        assert _centile_from_z(1.96) == pytest.approx(97.5, abs=0.5)

    def test_normal_sf_at_zero_is_half(self) -> None:
        assert _normal_sf(0.0) == pytest.approx(0.5, rel=1e-3)


# ── tool_compare_to_norm ─────────────────────────────────────────────────


class TestToolCompareToNorm:
    def test_known_feature_emits_centile_and_z(self) -> None:
        out = tool_compare_to_norm("theta_beta_ratio", value=2.4)
        # Within mean±0.6 of 1.8 → z=1.0 (mean+1sd) → centile ≈ 84.
        assert out["centile"] > 50
        assert "z_score" in out
        assert out["is_stub"] is False

    def test_unknown_feature_marks_stub(self) -> None:
        out = tool_compare_to_norm("unknown_feature", value=1.0)
        assert out["is_stub"] is True

    def test_within_normal_range_label(self) -> None:
        # mean=1.8, sd=0.6 — value=1.8 → z=0 → "within normal range".
        out = tool_compare_to_norm("theta_beta_ratio", value=1.8)
        assert out["direction"] == "within normal range"
        assert out["magnitude"] == "small"

    def test_above_norm_label(self) -> None:
        # mean=10.2, sd=0.8 — value=11.0 → z≈1.0 → "above norm".
        out = tool_compare_to_norm("peak_alpha_frequency", value=11.0)
        assert out["direction"] == "above norm"
        assert out["magnitude"] == "moderate"

    def test_well_below_norm_label(self) -> None:
        # |z| > 1.96 case → "well below norm".
        out = tool_compare_to_norm("brain_age_gap", value=-12.0)
        assert out["direction"] == "well below norm"
        assert out["magnitude"] == "large"

    def test_passes_through_age_and_sex(self) -> None:
        out = tool_compare_to_norm("aperiodic_slope", value=1.4, age=45, sex="F")
        assert out["age"] == 45
        assert out["sex"] == "F"


# ── tool_explain_medication ──────────────────────────────────────────────


class TestToolExplainMedication:
    def test_empty_medication_returns_empty_envelope(self) -> None:
        out = tool_explain_medication("")
        assert out["name"] == ""
        assert out["drug_class"] == ""
        assert out["eeg_effects"] == []

    def test_known_medication_returns_profile(self) -> None:
        out = tool_explain_medication("lorazepam")
        # The atlas resolves lorazepam to a Benzodiazepines profile.
        assert "Benzodiazepines" in out["name"]
        assert out["drug_class"]
        assert isinstance(out["eeg_effects"], list)

    def test_unknown_medication_returns_unknown_envelope(self) -> None:
        out = tool_explain_medication("not_a_real_drug_xyz_123")
        assert out["drug_class"] == "Unknown"
        assert "No EEG-effect profile found" in out["clinical_note"]


# ── tool_get_recommendation_detail ───────────────────────────────────────


class TestToolGetRecommendationDetail:
    def test_modality_section(self) -> None:
        rec = {"primary_modality": "rTMS"}
        out = tool_get_recommendation_detail("modality", rec)
        assert out["section"] == "modality"
        assert out["detail"] == "rTMS"

    def test_dose_section(self) -> None:
        rec = {"dose": {"sessions": 20, "intensity": "120% MT"}}
        out = tool_get_recommendation_detail("dose", rec)
        assert out["detail"]["sessions"] == 20

    def test_nested_path_sessions(self) -> None:
        rec = {"dose": {"sessions": 24}}
        out = tool_get_recommendation_detail("sessions", rec)
        assert out["detail"] == 24

    def test_unknown_section_returns_warning(self) -> None:
        out = tool_get_recommendation_detail("not_a_real_section", {})
        assert "warning" in out
        assert "Unknown section" in out["warning"]

    def test_alias_alternatives(self) -> None:
        rec = {"alternative_protocols": [{"id": "P1"}]}
        out = tool_get_recommendation_detail("alternatives", rec)
        assert out["detail"][0]["id"] == "P1"

    def test_non_dict_recommendation_treated_as_empty(self) -> None:
        out = tool_get_recommendation_detail("modality", "garbage")  # type: ignore[arg-type]
        assert out["detail"] is None


# ── _format_medication_confounds ──────────────────────────────────────────


class TestFormatMedicationConfounds:
    def test_none_returns_placeholder(self) -> None:
        assert _format_medication_confounds(None) == "(none)"

    def test_empty_string_returns_placeholder(self) -> None:
        assert _format_medication_confounds("") == "(none)"
        assert _format_medication_confounds("   ") == "(none)"

    def test_string_passes_through(self) -> None:
        assert _format_medication_confounds("custom note") == "custom note"

    def test_list_of_dicts_formatted_as_bullets(self) -> None:
        out = _format_medication_confounds(
            [
                {
                    "medication": "Sertraline",
                    "affected_bands": ["beta"],
                    "clinical_note": "SSRI effect.",
                },
            ]
        )
        assert "- Sertraline" in out
        assert "(bands: beta)" in out
        assert "SSRI effect." in out

    def test_list_of_strings_formatted(self) -> None:
        out = _format_medication_confounds(["Lithium"])
        assert "- Lithium" in out

    def test_empty_list_returns_placeholder(self) -> None:
        assert _format_medication_confounds([]) == "(none)"


# ── _truncate ────────────────────────────────────────────────────────────


class TestTruncate:
    def test_short_value_passes_through(self) -> None:
        assert _truncate({"x": 1}) == '{"x": 1}'

    def test_long_value_truncated_with_ellipsis(self) -> None:
        out = _truncate("x" * 1000, limit=20)
        assert len(out) == 20
        assert out.endswith("...")

    def test_none_returns_empty_string(self) -> None:
        assert _truncate(None) == ""


# ── render_system_prompt ─────────────────────────────────────────────────


class TestRenderSystemPrompt:
    def test_minimal_call_renders_template(self) -> None:
        out = render_system_prompt(analysis_id="A1")
        assert "A1" in out
        assert REFUSAL_MESSAGE in out
        # All section headers present.
        assert "Features summary:" in out
        assert "Z-scores flagged:" in out
        assert "Similarity indices" in out
        assert "Protocol recommendation:" in out
        assert "Medication / confound awareness:" in out
        assert "Cited papers:" in out

    def test_unknown_analysis_id_renders_unknown(self) -> None:
        out = render_system_prompt(analysis_id="")
        assert "(unknown)" in out

    def test_papers_summary_renders_numbered_list(self) -> None:
        out = render_system_prompt(
            analysis_id="A1",
            papers=[
                {"title": "Paper A", "year": 2024, "pmid": "111"},
                {"title": "Paper B", "year": 2023, "doi": "10.1/x"},
            ],
        )
        assert "[1] Paper A" in out
        assert "[2] Paper B" in out

    def test_no_papers_renders_none_placeholder(self) -> None:
        out = render_system_prompt(analysis_id="A1", papers=None)
        # Find the "Cited papers:" section then verify the next line is "(none)".
        idx = out.find("Cited papers:")
        snippet = out[idx:]
        assert "(none)" in snippet

    def test_empty_string_field_renders_none_placeholder(self) -> None:
        out = render_system_prompt(analysis_id="A1", features="   ")
        idx = out.find("Features summary:")
        snippet = out[idx : idx + 200]
        assert "(none)" in snippet


# ── _sanitize_banned_words ───────────────────────────────────────────────


class TestSanitizeBannedWords:
    @pytest.mark.parametrize(
        "form,expected_replacement",
        [
            ("treatment recommendation", "protocol suggestion"),
            ("Treatment Recommendations", "protocol suggestions"),
            ("diagnostic", "finding"),
            ("Diagnosis", "finding"),
            ("diagnoses", "findings"),
            ("Diagnosing", "noting"),
            ("Diagnose", "note"),
        ],
    )
    def test_each_banned_form_rewritten(
        self, form: str, expected_replacement: str
    ) -> None:
        out = _sanitize_banned_words(f"text {form} text")
        # Output must NOT contain the banned form (case-insensitive).
        assert form.lower() not in out.lower()
        # And it must contain the replacement.
        assert expected_replacement.lower() in out.lower()

    def test_empty_string_passes_through(self) -> None:
        assert _sanitize_banned_words("") == ""

    def test_no_banned_words_unchanged(self) -> None:
        text = "This is a normal sentence with no banned words."
        assert _sanitize_banned_words(text) == text


# ── mock_llm_tool_dispatch ───────────────────────────────────────────────


class TestMockLlmDispatch:
    def test_unsafe_query_returns_refusal(self) -> None:
        # Pin: the dispatcher short-circuits on unsafe queries and
        # returns the refusal message — no tool call leaks through.
        out = mock_llm_tool_dispatch("should I increase my dose?", {})
        assert out["tool"] is None
        assert out["reply"] == REFUSAL_MESSAGE

    def test_search_prefix_routes_to_search_papers(self) -> None:
        with mock.patch(
            "deepsynaps_qeeg.ai.copilot.tool_search_papers", return_value=[{"pmid": "1"}]
        ):
            out = mock_llm_tool_dispatch("search: alpha", {})
        assert out["tool"] == "tool_search_papers"
        assert "1 papers" in out["reply"]

    def test_explain_prefix_routes_to_explain_feature(self) -> None:
        out = mock_llm_tool_dispatch("explain: theta_beta_ratio", {})
        assert out["tool"] == "tool_explain_feature"
        assert "Theta/Beta" in out["reply"]

    def test_norm_prefix_routes_to_compare_to_norm(self) -> None:
        out = mock_llm_tool_dispatch("norm: theta_beta_ratio=2.4", {})
        assert out["tool"] == "tool_compare_to_norm"
        assert "centile" in out["reply"]

    def test_norm_prefix_with_garbage_value_returns_parse_error(self) -> None:
        out = mock_llm_tool_dispatch("norm: theta_beta_ratio=not-a-number", {})
        assert out["tool"] is None
        assert "Could not parse" in out["reply"]

    def test_section_prefix_routes_to_recommendation_detail(self) -> None:
        out = mock_llm_tool_dispatch(
            "section: modality",
            {"recommendation": {"primary_modality": "rTMS"}},
        )
        assert out["tool"] == "tool_get_recommendation_detail"
        assert "modality" in out["reply"]

    def test_medication_prefix_routes_to_explain_medication(self) -> None:
        out = mock_llm_tool_dispatch("medication: lorazepam", {})
        assert out["tool"] == "tool_explain_medication"

    def test_unknown_prefix_echoes_text(self) -> None:
        out = mock_llm_tool_dispatch("just chatting about features", {})
        assert out["tool"] is None
        assert "just chatting" in out["reply"]
