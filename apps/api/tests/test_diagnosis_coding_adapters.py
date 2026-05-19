"""Category 8 — diagnosis coding adapter unit tests.

These tests do NOT hit the network. They only verify that each adapter
instantiates, exposes the expected identity/license/parse behaviour, and
that the UMLS adapter is degraded by default when no API key is configured.
"""
from __future__ import annotations

import os
from unittest import mock

import pytest

from app.services.knowledge.adapters.icd10_adapter import ICD10Adapter
from app.services.knowledge.adapters.mesh_adapter import MeSHAdapter
from app.services.knowledge.adapters.ols_adapter import OLSAdapter
from app.services.knowledge.adapters.snomedct_adapter import SNOMEDCTAdapter
from app.services.knowledge.adapters.umls_adapter import UMLSAdapter


def test_icd10_identity_and_license() -> None:
    adapter = ICD10Adapter()
    assert adapter.source_name == "ICD-10-CM"
    assert adapter.source_version
    lic = adapter.get_license()
    assert "Public Domain" in lic.license_type
    assert lic.allows_research is True
    assert lic.allows_commercial is True


def test_icd10_parse_clinical_tables_shape() -> None:
    payload = [2, ["F33.2", "F33.3"], None, [["F33.2", "Major depressive disorder, severe"], ["F33.3", "Severe with psychotic features"]]]
    parsed = ICD10Adapter._parse_clinical_tables(payload)
    assert len(parsed) == 2
    assert parsed[0]["_raw_code"] == "F33.2"
    assert "Major depressive" in parsed[0]["_raw_display"]


def test_icd10_parse_empty_payload() -> None:
    assert ICD10Adapter._parse_clinical_tables([0, [], None, []]) == []
    assert ICD10Adapter._parse_clinical_tables(None) == []


def test_snomedct_identity_and_license() -> None:
    adapter = SNOMEDCTAdapter()
    assert adapter.source_name == "SNOMED CT"
    lic = adapter.get_license()
    assert "Affiliate" in lic.license_type
    assert lic.allows_commercial is False
    assert lic.requires_attribution is True


def test_snomedct_parse_clinical_tables_shape() -> None:
    payload = [1, ["370143000"], None, [["370143000", "Major depressive disorder, single episode, severe"]]]
    parsed = SNOMEDCTAdapter._parse_clinical_tables(payload)
    assert len(parsed) == 1
    assert parsed[0]["_raw_code"] == "370143000"


def test_mesh_identity_and_license() -> None:
    adapter = MeSHAdapter()
    assert adapter.source_name == "MeSH"
    lic = adapter.get_license()
    assert "Public Domain" in lic.license_type


def test_mesh_parse_lookup() -> None:
    payload = [
        {"resource": "http://id.nlm.nih.gov/mesh/D003863", "label": "Depression"},
        {"resource": "http://id.nlm.nih.gov/mesh/D003866", "label": "Depressive Disorder, Major"},
    ]
    parsed = MeSHAdapter._parse_lookup(payload)
    assert len(parsed) == 2
    assert parsed[0]["_raw_code"] == "D003863"
    assert parsed[1]["_raw_display"].startswith("Depressive")


def test_ols_identity_and_parse() -> None:
    adapter = OLSAdapter()
    assert adapter.source_name == "OLS"
    payload = {
        "response": {
            "docs": [
                {
                    "iri": "http://purl.obolibrary.org/obo/MONDO_0002050",
                    "obo_id": "MONDO:0002050",
                    "label": "depressive disorder",
                    "ontology_name": "mondo",
                    "synonym": ["depression"],
                }
            ]
        }
    }
    parsed = OLSAdapter._parse_search(payload)
    assert parsed[0]["_raw_code"] == "MONDO:0002050"
    assert parsed[0]["_raw_ontology"] == "mondo"
    assert "depression" in parsed[0]["_raw_synonyms"]


def test_umls_degraded_without_credentials() -> None:
    # Force no API key
    with mock.patch.dict(os.environ, {}, clear=False):
        os.environ.pop("UMLS_API_KEY", None)
        adapter = UMLSAdapter(config={"api_key": None})
        assert adapter.has_credentials is False
        # health_check is async — schedule it via asyncio
        import asyncio

        result = asyncio.get_event_loop().run_until_complete(adapter.health_check())
        assert result["status"] == "degraded"
        assert result["license_required"] is True
        assert result["missing_env"] == "UMLS_API_KEY"


def test_umls_license_metadata_signals_uts() -> None:
    adapter = UMLSAdapter(config={"api_key": None})
    lic = adapter.get_license()
    assert "UMLS" in lic.license_type
    assert lic.allows_commercial is False
    assert any("UTS" in r for r in lic.restrictions)


@pytest.mark.parametrize(
    "adapter",
    [ICD10Adapter(), SNOMEDCTAdapter(), MeSHAdapter(), OLSAdapter()],
)
def test_adapter_provenance_for_unknown_record(adapter) -> None:  # type: ignore[no-untyped-def]
    prov = adapter.get_provenance({"code": "ABC"})
    assert prov.source_database == adapter.source_name
    assert prov.source_record_id == "ABC"
    assert prov.research_only is False
