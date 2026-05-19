from __future__ import annotations

from app.services.knowledge.genetics_inventory import GeneticRegistry
from app.services.knowledge.specialized_genomics_inventory import (
    SpecializedGenomicsRegistry,
    query_specialized_genomics,
)


class _FakeAdapter:
    def __init__(self, rows):
        self._rows = rows

    async def search(self, query: str, filters=None):
        return list(self._rows)


def test_specialized_genomics_query_reuses_category2_crosslinks() -> None:
    specialized = SpecializedGenomicsRegistry({})
    category2 = GeneticRegistry(
        {
            "pharmgkb": _FakeAdapter([{"gene": "CYP2C19", "drug": "sertraline"}]),
            "myvariant": _FakeAdapter([{"variant_id": "rs4244285"}]),
            "clinvar": _FakeAdapter([{"variant_id": "rs4244285", "clinical_significance": "drug response"}]),
            "dbsnp": _FakeAdapter([{"rsid": "rs4244285"}]),
        }
    )

    payload = __import__("asyncio").run(
        query_specialized_genomics(
            specialized_registry=specialized,
            category2_registry=category2,
            disease_focus="pharmacogenomics",
            gene_symbol="CYP2C19",
            variant_id="rs4244285",
            modality="TMS",
            condition="depression",
        )
    )
    assert set(payload["category2_cross_links"]) >= {"pharmgkb", "myvariant", "clinvar", "dbsnp"}
    assert payload["source_statuses"]["pharmacogenomics"]["lifecycle_state"] == "degraded"
    assert payload["provenance"]["patient_identifier_sent_to_external_sources"] is False
    assert "not predictive of treatment response" in payload["decision_support_disclaimer"].lower()
