from app.services.knowledge.standards_guidelines_registry import (
    DECISION_SUPPORT_DISCLAIMER,
    build_standards_guidelines_inventory,
    list_standards_guideline_keys,
    summarize_standards_guideline_lifecycle,
)


def test_standards_guidelines_registry_contains_all_five_sources() -> None:
    keys = list_standards_guideline_keys()
    assert keys == [
        "ieee_neuro",
        "neuromod_standards",
        "iso_neuro",
        "fda_guidance",
        "eu_mdr",
    ]

    inventory = build_standards_guidelines_inventory()
    assert inventory["total"] == 5
    assert inventory["structured_search_available"] is False
    assert inventory["search_status"] == "catalogued_only"
    assert inventory["decision_support_disclaimer"] == DECISION_SUPPORT_DISCLAIMER

    rows = inventory["sources"]
    assert {row["lifecycle_state"] for row in rows} <= {"catalogued", "degraded"}
    assert all(not row["enabled"] for row in rows)
    assert all(not row["registered"] for row in rows)
    assert all(row["category"] == "standards_guidelines" for row in rows)
    assert any(row["lifecycle_state"] == "degraded" for row in rows)
    assert all("compliance certification" in row["decision_support_disclaimer"].lower() for row in rows)
    notes = {row["source_id"]: row["access_license_notes"].lower() for row in rows}
    assert "copyright" in notes["ieee_neuro"]
    assert "copyright" in notes["neuromod_standards"]
    assert "licensed" in notes["iso_neuro"]
    assert "legal" in notes["fda_guidance"]
    assert "legal" in notes["eu_mdr"]


def test_standards_guidelines_lifecycle_summary_honest_states() -> None:
    summary = summarize_standards_guideline_lifecycle()
    assert summary["total"] == 5
    assert summary["by_state"]["healthy"] == 0
    assert summary["by_state"]["catalogued"] >= 3
    assert summary["by_state"]["degraded"] >= 2
