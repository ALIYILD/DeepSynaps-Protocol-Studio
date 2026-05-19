from __future__ import annotations

from types import SimpleNamespace

from app.main import app
from app.routers.specialized_genomics_router import (
    get_genetic_registry,
    get_specialized_genomics_registry,
)
from app.services.knowledge.genetics_inventory import GeneticRegistry
from app.services.knowledge.specialized_genomics_inventory import SpecializedGenomicsRegistry


class _FakeCategory2Adapter:
    def __init__(self, rows, *, forbidden_term: str | None = None):
        self._rows = rows
        self._forbidden = forbidden_term

    async def search(self, query: str, filters=None):
        if self._forbidden:
            assert self._forbidden not in query
        return list(self._rows)


class _FakeEpilepsyAdapter:
    def search_epilepsy_genes(self, gene_symbol: str = "", limit: int = 50):
        return [SimpleNamespace(gene_symbol="SCN1A", sources=["curated", "ncbi_gene"])]

    def get_variants(self, gene_symbol: str, limit: int = 50):
        return [SimpleNamespace(variant_id="rs121918674", gene_symbol="SCN1A", phenotype="Dravet syndrome")]


def test_specialized_genomics_query_returns_normalized_shape(client, auth_headers) -> None:
    specialized = SpecializedGenomicsRegistry({"epilepsygenome": _FakeEpilepsyAdapter()})
    category2 = GeneticRegistry(
        {
            "clinvar": _FakeCategory2Adapter([{"variant_id": "rs121918674", "clinical_significance": "pathogenic"}]),
            "dbsnp": _FakeCategory2Adapter([{"rsid": "rs121918674"}]),
            "gwas_catalog": _FakeCategory2Adapter([{"trait": "epilepsy"}]),
            "myvariant": _FakeCategory2Adapter([{"variant_id": "rs121918674"}]),
        }
    )
    app.dependency_overrides[get_specialized_genomics_registry] = lambda: specialized
    app.dependency_overrides[get_genetic_registry] = lambda: category2
    try:
        res = client.post(
            "/api/v1/specialized-genomics/query",
            headers=auth_headers["clinician"],
            json={
                "disease_focus": "epilepsy",
                "gene_symbol": "SCN1A",
                "variant_id": "rs121918674",
                "modality": "VNS",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["disease_focus"] == "epilepsy"
    assert body["matched_context"]["gene_symbol"] == "SCN1A"
    assert body["results"]
    assert body["results"][0]["source_id"] == "epilepsygenome"
    assert body["results"][0]["gene_symbol"] == "SCN1A"
    assert body["results"][0]["evidence_type"] in {"curated_gene", "variant_annotation"}
    assert body["category2_cross_links"]["clinvar"][0]["variant_id"] == "rs121918674"
    assert "decision support only" in body["decision_support_disclaimer"].lower()
    assert "predicts responder" not in res.text.lower()
    assert "will respond" not in res.text.lower()
