from __future__ import annotations

from app.services.knowledge.genetics_inventory import build_genetic_registry
from app.services.knowledge.specialized_genomics_inventory import (
    build_specialized_genomics_registry,
    list_specialized_genomics_keys,
    summarize_specialized_genomics_lifecycle,
)


def test_specialized_genomics_inventory_has_seven_sources() -> None:
    assert list_specialized_genomics_keys() == (
        "epilepsygenome",
        "alzgene",
        "neurodev_sfari",
        "pharmacogenomics",
        "neurogenetics",
        "pgc",
        "stroke_genetics",
    )


def test_connected_specialized_sources_instantiate_without_network() -> None:
    registry = build_specialized_genomics_registry()
    assert registry.get("epilepsygenome") is not None
    assert registry.get("alzgene") is not None
    assert registry.get("neurodev_sfari") is not None


def test_pending_sources_are_represented_honestly() -> None:
    registry = build_specialized_genomics_registry()
    category2 = build_genetic_registry()
    summary = summarize_specialized_genomics_lifecycle(registry, category2_registry=category2)
    assert summary["total"] == 7
    assert summary["sources"]["pharmacogenomics"] == "degraded"
    assert summary["sources"]["pgc"] == "catalogued"
    assert summary["sources"]["neurogenetics"] == "catalogued"
    assert summary["sources"]["stroke_genetics"] == "catalogued"


def test_crosslink_only_source_exposes_backing_sources() -> None:
    registry = build_specialized_genomics_registry()
    category2 = build_genetic_registry()
    row = registry.describe("pharmacogenomics", category2_registry=category2)
    assert row["lifecycle_state"] == "degraded"
    assert set(row["backing_sources"]) >= {"pharmgkb", "myvariant", "clinvar"}
