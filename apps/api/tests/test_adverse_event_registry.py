from __future__ import annotations

from app.services.knowledge.adverse_event_inventory import (
    build_adverse_event_inventory,
    build_adverse_event_lifecycle_summary,
)


def test_all_category6_sources_are_represented() -> None:
    rows = build_adverse_event_inventory()
    keys = {row["key"] for row in rows}
    assert keys == {"faers", "meddra", "vigibase", "who_adr", "ich_e2b", "ctcae"}


def test_restricted_who_sources_are_not_marked_healthy() -> None:
    rows = {row["key"]: row for row in build_adverse_event_inventory()}
    assert rows["vigibase"]["lifecycle_state"] == "disabled"
    assert rows["who_adr"]["lifecycle_state"] == "disabled"
    assert rows["vigibase"]["license_required"] is True
    assert rows["who_adr"]["license_required"] is True


def test_ich_e2b_and_ctcae_are_reference_surfaces_not_live_apis() -> None:
    rows = {row["key"]: row for row in build_adverse_event_inventory()}
    assert rows["ich_e2b"]["source_kind"] == "reporting_standard"
    assert rows["ich_e2b"]["live_exposed"] is False
    assert rows["ich_e2b"]["lifecycle_state"] == "registered"
    assert rows["ctcae"]["source_kind"] == "grading_reference"
    assert rows["ctcae"]["live_exposed"] is False
    assert rows["ctcae"]["lifecycle_state"] == "registered"


def test_lifecycle_summary_covers_all_six_sources() -> None:
    summary = build_adverse_event_lifecycle_summary()
    assert summary["total"] == 6
    assert summary["sources"]["faers"] == "healthy"
    assert summary["sources"]["meddra"] == "healthy"
