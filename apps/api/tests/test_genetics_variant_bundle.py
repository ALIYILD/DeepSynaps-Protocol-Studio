from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.genetics_router import router, get_genetic_registry
from app.services.knowledge.genetics_inventory import GeneticRegistry, list_genetic_keys


class FakeAdapter:
    def __init__(self, name: str, payload: list[dict[str, Any]]) -> None:
        self.source_name = name
        self.source_version = "test"
        self.is_connected = True
        self._payload = payload

    async def search(self, query: str, filters: dict[str, Any] | None = None):
        return self._payload


def _client_with_registry(registry: GeneticRegistry) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_genetic_registry] = lambda: registry
    return TestClient(app)


def test_variant_annotation_bundle_returns_partial_results_and_disclaimer() -> None:
    registry = GeneticRegistry(
        {
            "clinvar": FakeAdapter(
                "ClinVar",
                [{"variant_id": "rs6265", "clinical_significance": "risk factor"}],
            ),
            "dbsnp": FakeAdapter("dbSNP", [{"rsid": "rs6265"}]),
            "gwas_catalog": FakeAdapter("GWAS Catalog", [{"trait": "depression"}]),
            "ensembl": FakeAdapter("Ensembl", [{"gene": "BDNF"}]),
            "uniprot": FakeAdapter("UniProt", [{"gene": "BDNF"}]),
            "string": FakeAdapter("STRING", [{"gene": "BDNF"}]),
            "gnomad": FakeAdapter("gnomAD", [{"variant_id": "rs6265"}]),
            "myvariant": FakeAdapter("MyVariant.info", [{"variant_id": "rs6265"}]),
        }
    )
    client = _client_with_registry(registry)

    response = client.post(
        "/api/v1/genetics/variant-annotation",
        json={
            "gene": "BDNF",
            "variant": "Val66Met",
            "rsid": "rs6265",
            "condition": "depression",
            "medication": "sertraline",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["decision_support_only"] is True
    assert "decision support only" in payload["clinical_disclaimer"].lower()
    assert payload["status"] == "partial"
    assert payload["normalized_identifiers"]["gene"] == "BDNF"
    assert payload["source_hits"]["clinvar"][0]["variant_id"] == "rs6265"
    assert payload["source_hits"]["gnomad"][0]["variant_id"] == "rs6265"
    assert payload["uncertainty_flags"]
    assert len(payload["registry_summary"]["adapters"]) == 14


def test_pgx_neuromodulation_check_returns_safe_language() -> None:
    registry = GeneticRegistry(
        {
            "clinvar": FakeAdapter(
                "ClinVar",
                [{"variant_id": "rs4680", "clinical_significance": "risk factor"}],
            ),
            "dbsnp": FakeAdapter("dbSNP", [{"rsid": "rs4680"}]),
            "gwas_catalog": FakeAdapter("GWAS Catalog", [{"trait": "cognitive flexibility"}]),
            "ensembl": FakeAdapter("Ensembl", [{"gene": "COMT"}]),
            "uniprot": FakeAdapter("UniProt", [{"gene": "COMT"}]),
            "string": FakeAdapter("STRING", [{"gene": "COMT"}]),
            "gnomad": FakeAdapter("gnomAD", [{"variant_id": "rs4680"}]),
            "myvariant": FakeAdapter("MyVariant.info", [{"variant_id": "rs4680"}]),
        }
    )
    client = _client_with_registry(registry)

    response = client.post(
        "/api/v1/genetics/pgx-neuromodulation-check",
        json={"gene": "COMT", "variant": "Val158Met", "rsid": "rs4680", "condition": "ADHD"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["focus"] == "neuromodulation"
    assert payload["neuromodulation_support"]["review_required"] is True
    assert "not a treatment recommendation" in payload["clinical_disclaimer"].lower()
    assert "will respond" not in response.text.lower()


def test_adapter_query_returns_disabled_for_missing_sources() -> None:
    registry = GeneticRegistry({})
    client = _client_with_registry(registry)

    response = client.post(
        "/api/v1/genetics/query",
        json={"adapter_key": "omim", "query": "BRCA1"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "disabled"
    assert payload["lifecycle_state"] == "disabled"
    assert payload["results"] == []
    assert "decision support only" in payload["clinical_disclaimer"].lower()
    assert len(list_genetic_keys()) == 14

