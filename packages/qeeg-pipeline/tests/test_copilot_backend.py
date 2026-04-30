"""Pipeline-side regression tests for the copilot backend scaffold.

Covers:

* The 6-tool schema names + required fields don't drift (stability).
* :data:`SYSTEM_PROMPT_TEMPLATE` still contains only *negated* mentions
  of banned vocabulary — the template never *asserts* them.
* :func:`mock_llm_tool_dispatch` still routes the canned prefixes to
  the correct tool (regression: real dispatch scaffolding must not
  have broken the deterministic mock).
"""
from __future__ import annotations


def test_tools_schema_stability() -> None:
    """Snapshot the 6 tool names + required fields."""
    from deepsynaps_qeeg.ai import copilot

    schema = copilot._tools_schema()
    assert [t["name"] for t in schema] == [
        "tool_search_papers",
        "tool_explain_feature",
        "tool_explain_channel",
        "tool_compare_to_norm",
        "tool_get_recommendation_detail",
        "tool_explain_medication",
    ]
    by_name = {t["name"]: t for t in schema}
    assert by_name["tool_search_papers"]["input_schema"]["required"] == ["query"]
    assert by_name["tool_explain_feature"]["input_schema"]["required"] == [
        "feature_name"
    ]
    assert by_name["tool_explain_channel"]["input_schema"]["required"] == [
        "channel_name"
    ]
    assert set(
        by_name["tool_compare_to_norm"]["input_schema"]["required"]
    ) == {"feature_name", "value"}
    assert by_name["tool_get_recommendation_detail"]["input_schema"]["required"] == [
        "section"
    ]
    assert by_name["tool_explain_medication"]["input_schema"]["required"] == [
        "medication_name"
    ]


def test_system_prompt_has_no_banned_words() -> None:
    """The rendered system prompt (no context) must only mention the
    banned vocabulary within negated / prohibition phrasing."""
    from deepsynaps_qeeg.ai import copilot

    rendered = copilot.render_system_prompt(analysis_id="test-id")
    lowered = rendered.lower()

    # "Never use" instruction must be present — we want the model to
    # explicitly avoid these words.
    assert "never use" in lowered

    # Every occurrence of "treatment recommendation" or "diagnose" must
    # sit on a line that either prohibits them ("never", "not", quoted)
    # or is the refusal sentence from :data:`REFUSAL_MESSAGE`.
    def _line_for(idx: int) -> str:
        start = lowered.rfind("\n", 0, idx) + 1
        end = lowered.find("\n", idx)
        if end == -1:
            end = len(lowered)
        return lowered[start:end]

    for banned in ("diagnose", "diagnostic", "treatment recommendation"):
        idx = 0
        while True:
            idx = lowered.find(banned, idx)
            if idx < 0:
                break
            line = _line_for(idx)
            assert any(
                marker in line
                for marker in ("never", "not ", '"', "refuse", "can't", "can not")
            ), f"'{banned}' appears without negation on line: {line!r}"
            idx += len(banned)


def test_mock_dispatch_still_works() -> None:
    """Regression: the deterministic mock dispatch routes prefixes."""
    from deepsynaps_qeeg.ai import copilot

    # explain: prefix -> tool_explain_feature
    explain = copilot.mock_llm_tool_dispatch("explain: theta_beta_ratio", {})
    assert explain["tool"] == "tool_explain_feature"
    assert "theta" in explain["reply"].lower() or "Theta" in explain["reply"]

    # norm: prefix -> tool_compare_to_norm
    norm = copilot.mock_llm_tool_dispatch(
        "norm: theta_beta_ratio=2.5", {"age": 35, "sex": "F"}
    )
    assert norm["tool"] == "tool_compare_to_norm"
    assert "centile" in norm["reply"]

    # section: prefix -> tool_get_recommendation_detail
    section = copilot.mock_llm_tool_dispatch(
        "section: dose",
        {"recommendation": {"dose": {"sessions": 10}}},
    )
    assert section["tool"] == "tool_get_recommendation_detail"

    # Unsafe query -> refusal (no tool call).
    refusal = copilot.mock_llm_tool_dispatch("Can you diagnose me?", {})
    assert refusal["tool"] is None
    assert refusal["reply"] == copilot.REFUSAL_MESSAGE

    # Bare text (no prefix) -> echo with no tool.
    echo = copilot.mock_llm_tool_dispatch("hello there", {})
    assert echo["tool"] is None


def test_mock_medication_prefix() -> None:
    """Regression: medication: prefix routes to tool_explain_medication."""
    from deepsynaps_qeeg.ai import copilot

    res = copilot.mock_llm_tool_dispatch("medication: lorazepam", {})
    assert res["tool"] == "tool_explain_medication"
    assert "lorazepam" in res["reply"].lower() or "Benzodiazepines" in res["reply"]

    unknown = copilot.mock_llm_tool_dispatch("medication: not_a_drug_xyz", {})
    assert unknown["tool"] == "tool_explain_medication"
    assert unknown["result"]["drug_class"] == "Unknown"


def test_render_system_prompt_with_medication_confounds() -> None:
    """render_system_prompt surfaces medication_confounds as readable text."""
    from deepsynaps_qeeg.ai import copilot

    meds = [
        {
            "medication": "Benzodiazepines (e.g., lorazepam)",
            "affected_bands": ["beta", "alpha"],
            "drug_class": "GABA-A positive allosteric modulator",
            "clinical_note": "Beta excess is the hallmark EEG effect.",
        }
    ]
    rendered = copilot.render_system_prompt(
        analysis_id="test-123",
        medication_confounds=meds,
    )
    assert "Benzodiazepines" in rendered
    assert "beta" in rendered
    assert "Medication / confound awareness" in rendered


def test_render_system_prompt_medication_confounds_fallback() -> None:
    """render_system_prompt falls back to (none) when no confounds provided."""
    from deepsynaps_qeeg.ai import copilot

    rendered = copilot.render_system_prompt(analysis_id="test-456")
    assert "Medication / confound awareness" in rendered
    assert "(none)" in rendered


def test_banned_word_sanitiser_rewrites_all_forms() -> None:
    """The sanitiser must rewrite ``diagnos*`` and
    ``treatment recommendation`` case-insensitively."""
    from deepsynaps_qeeg.ai import copilot

    # Each form should get a research-neutral replacement.
    assert "finding" in copilot._sanitize_banned_words("Diagnosis of X").lower()
    assert "finding" in copilot._sanitize_banned_words("diagnostic impression").lower()
    assert "note" in copilot._sanitize_banned_words("I would diagnose X").lower()
    out = copilot._sanitize_banned_words("The treatment recommendation is 10 Hz rTMS.")
    assert "treatment recommendation" not in out.lower()
    assert "protocol suggestion" in out.lower()
