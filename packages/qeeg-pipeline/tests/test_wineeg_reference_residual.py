"""Residual tests for :mod:`deepsynaps_qeeg.knowledge.wineeg_reference`.

Covers ``format_wineeg_workflow_context`` and edge-cases in
``manual_analysis_checklist`` that the existing test_knowledge.py misses.
No MNE / EEG fixtures required.
"""

from __future__ import annotations

from deepsynaps_qeeg.knowledge.wineeg_reference import (
    format_wineeg_workflow_context,
    manual_analysis_checklist,
    validate_wineeg_reference_library,
)


# ─── format_wineeg_workflow_context ──────────────────────────────────────────

def test_format_context_contains_decision_support_disclaimer() -> None:
    ctx = format_wineeg_workflow_context()
    assert "Decision-support only. Clinician review required." in ctx


def test_format_context_no_native_compatibility_claim() -> None:
    ctx = format_wineeg_workflow_context()
    assert "Do not claim native WinEEG compatibility or equivalence." in ctx


def test_format_context_reference_only_first_line() -> None:
    ctx = format_wineeg_workflow_context()
    first_line = ctx.splitlines()[0]
    assert "WinEEG-style workflow reference only." == first_line


def test_format_context_includes_workflow_hints_header() -> None:
    ctx = format_wineeg_workflow_context()
    assert "Workflow hints:" in ctx


def test_format_context_includes_concept_reminders_header() -> None:
    ctx = format_wineeg_workflow_context()
    assert "Concept reminders:" in ctx


def test_format_context_respects_max_workflows_limit() -> None:
    ctx_2 = format_wineeg_workflow_context(max_workflows=2, max_concepts=0)
    workflow_lines = [l for l in ctx_2.splitlines() if l.startswith("- ")]
    assert len(workflow_lines) <= 2


def test_format_context_zero_workflows_no_workflow_hints() -> None:
    ctx = format_wineeg_workflow_context(max_workflows=0, max_concepts=0)
    assert "Workflow hints:" not in ctx
    assert "Concept reminders:" not in ctx


def test_format_context_returns_string() -> None:
    ctx = format_wineeg_workflow_context()
    assert isinstance(ctx, str)
    assert len(ctx) > 0


# ─── manual_analysis_checklist edge cases ────────────────────────────────────

def test_manual_analysis_checklist_length_equals_12() -> None:
    """Checklist always has exactly 12 ordered entries."""
    items = manual_analysis_checklist()
    assert len(items) == 12


def test_manual_analysis_checklist_structure_keys() -> None:
    items = manual_analysis_checklist()
    required_keys = {"category", "title", "action", "safety_notes"}
    for item in items:
        assert required_keys == set(item.keys()), f"Missing keys in {item['category']}"


def test_manual_analysis_checklist_action_strings_non_empty() -> None:
    items = manual_analysis_checklist()
    for item in items:
        assert item["action"], f"Empty action for category {item['category']}"


def test_manual_analysis_checklist_safety_notes_are_lists() -> None:
    items = manual_analysis_checklist()
    for item in items:
        assert isinstance(item["safety_notes"], list), (
            f"safety_notes is not a list for {item['category']}"
        )


def test_manual_analysis_checklist_impedance_entry() -> None:
    items = manual_analysis_checklist()
    imp = next(i for i in items if i["category"] == "impedance")
    assert "impedance" in imp["action"].lower()


def test_manual_analysis_checklist_reporting_entry() -> None:
    items = manual_analysis_checklist()
    rep = next(i for i in items if i["category"] == "reporting")
    assert "manual findings" in rep["action"].lower()


def test_manual_analysis_checklist_ordering_matches_spec() -> None:
    """First entry must be recording_setup and last must be reporting."""
    items = manual_analysis_checklist()
    assert items[0]["category"] == "recording_setup"
    assert items[-1]["category"] == "reporting"
