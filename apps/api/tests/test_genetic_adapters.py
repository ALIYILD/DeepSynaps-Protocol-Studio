from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace

from app.services.knowledge.genetics_inventory import (
    GENETIC_SOURCES,
    GeneticRegistry,
    build_genetic_registry,
    list_genetic_keys,
    summarize_genetic_lifecycle,
)


def test_category_2_inventory_has_fourteen_sources() -> None:
    assert len(list_genetic_keys()) == 14
    assert set(list_genetic_keys()) == set(GENETIC_SOURCES.keys())


def test_real_genetic_sources_instantiate_without_network() -> None:
    registry = build_genetic_registry()

    for key in ("dbsnp", "clinvar", "gwas_catalog", "ensembl", "uniprot", "string", "gnomad", "myvariant"):
        assert registry.get(key) is not None, key


def test_lifecycle_summary_marks_disabled_sources_honestly() -> None:
    registry = build_genetic_registry()
    summary = summarize_genetic_lifecycle(registry)

    assert summary["total"] == 14
    assert summary["by_state"].get("disabled") == 6
    assert summary["adapters"]["biogrid"] == "disabled"
    assert summary["adapters"]["reactome"] == "disabled"


def test_missing_api_key_produces_degraded_state(monkeypatch) -> None:
    fake_adapter = SimpleNamespace(source_version="1.0", is_connected=False)
    registry = GeneticRegistry({"clinvar": fake_adapter})
    monkeypatch.setitem(
        GENETIC_SOURCES,
        "clinvar",
        replace(GENETIC_SOURCES["clinvar"], api_key_required=True),
    )

    row = registry.describe("clinvar")
    assert row["lifecycle_state"] == "degraded"
    assert row["api_key_required"] is True

