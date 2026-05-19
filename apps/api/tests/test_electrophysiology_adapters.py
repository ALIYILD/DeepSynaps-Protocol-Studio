from app.services.knowledge.electrophysiology_registry import (
    DECISION_SUPPORT_DISCLAIMER,
    build_electrophysiology_inventory,
    list_electrophysiology_keys,
    summarize_electrophysiology_lifecycle,
)


def test_electrophysiology_registry_lists_all_four_sources() -> None:
    assert list_electrophysiology_keys() == [
        "eegbase",
        "eeglab_datasets",
        "openeeg",
        "sleep_edf",
    ]


def test_electrophysiology_inventory_is_catalogued_not_healthy() -> None:
    inventory = build_electrophysiology_inventory()
    assert len(inventory) == 4
    assert all(row["status"] == "catalogued" for row in inventory)
    assert all(row["lifecycle_state"] == "catalogued" for row in inventory)
    assert all(row["enabled"] is False for row in inventory)
    assert all(row["registered"] is False for row in inventory)
    assert all(row["status"] != "healthy" for row in inventory)
    assert any("reference dataset" in " ".join(row["warnings"]).lower() for row in inventory)
    assert DECISION_SUPPORT_DISCLAIMER.startswith("Decision support only")


def test_electrophysiology_lifecycle_summary_tracks_catalogued_sources() -> None:
    summary = summarize_electrophysiology_lifecycle()
    assert summary["total"] == 4
    assert summary["by_state"]["catalogued"] == 4
    assert summary["adapters"]["sleep_edf"] == "catalogued"
