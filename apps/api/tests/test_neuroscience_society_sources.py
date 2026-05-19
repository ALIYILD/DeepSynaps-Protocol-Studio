from __future__ import annotations

from app.services.knowledge.society_resource_registry import (
    DECISION_SUPPORT_DISCLAIMER,
    build_society_resource_inventory,
    list_society_resource_keys,
)


def test_neuroscience_society_inventory_covers_all_five_sources() -> None:
    inventory = build_society_resource_inventory()

    assert list_society_resource_keys() == (
        "sfn",
        "brain_congress",
        "neurology_academy",
        "epilepsy_foundation",
        "movement_disorder_society",
    )
    assert inventory["total"] == 5
    assert inventory["decision_support_disclaimer"] == DECISION_SUPPORT_DISCLAIMER

    summary = inventory["summary"]
    assert summary["total"] == 5
    assert summary["by_state"]["catalogued"] == 5
    assert summary["by_state"]["healthy"] == 0
    assert summary["by_state"]["degraded"] == 0

    sources = {row["key"]: row for row in inventory["sources"]}
    assert set(sources) == set(list_society_resource_keys())

    for key, row in sources.items():
        assert row["category"] == "neuroscience_society"
        assert row["enabled"] is True
        assert row["api_feed_available"] is False
        assert row["structured_search_available"] is False
        assert row["registered"] is False
        assert row["live_exposed"] is False
        assert row["lifecycle_state"] == "catalogued"
        assert row["status"] == "catalogued"
        assert "Decision support only" in row["decision_support_disclaimer"]
        assert row["source_url"].startswith("https://")
        assert row["clinical_utility_summary"]
        assert row["limitations"]
        assert row["warnings"]

    assert sources["sfn"]["source_kind"] == "conference"
    assert sources["brain_congress"]["source_kind"] == "society"
    assert sources["neurology_academy"]["source_kind"] == "education"
    assert sources["epilepsy_foundation"]["source_kind"] == "patient_resource"
    assert sources["movement_disorder_society"]["source_kind"] == "guideline"
    assert any("do not present patient resources as clinician guidelines" in warning.lower() for warning in sources["epilepsy_foundation"]["warnings"])
