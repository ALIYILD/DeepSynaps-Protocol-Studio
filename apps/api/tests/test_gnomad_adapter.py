"""
Unit tests for app.services.knowledge.adapters.gnomad_adapter.GnomadAdapter.

HTTP mocked at the httpx.AsyncClient boundary with a plain stub class
(matches the pattern from test_pubmed_adapter and test_clinicaltrials_adapter).
GraphQL specifics covered: POST body capture, GraphQL ``errors`` array →
raises GnomadAPIError without falling back to partial data.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.gnomad_adapter import (
    DEFAULT_DATASET,
    GnomadAdapter,
    GnomadAPIError,
    GnomadError,
    GnomadRateLimitError,
)
from app.services.knowledge.base_adapter import (
    ConfidenceTier,
    EvidenceLevel,
    LicenseMetadata,
    ProvenanceRecord,
)


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(
        self,
        *,
        json_data: Any = None,
        text_data: str = "",
        status_code: int = 200,
    ) -> None:
        self.status_code = status_code
        self.text = text_data
        self._json = json_data
        self.request = MagicMock()

    def json(self) -> Any:
        return self._json


def _fake_response(**kw: Any) -> _FakeResponse:
    return _FakeResponse(**kw)


class _FakeClient:
    """Stub httpx.AsyncClient supporting POST (gnomAD is GraphQL)."""

    def __init__(
        self,
        responder: Union[_FakeResponse, Callable[[Dict[str, Any]], _FakeResponse]],
    ) -> None:
        self._responder = responder
        self.is_closed = False
        self.posts: list = []

    async def post(self, url: str, json: Dict[str, Any]) -> _FakeResponse:
        self.posts.append({"url": url, "body": json})
        if callable(self._responder):
            return self._responder(json or {})
        return self._responder

    async def aclose(self) -> None:
        self.is_closed = True


def _install_client(
    adapter: GnomadAdapter,
    responder: Union[_FakeResponse, Callable[[Dict[str, Any]], _FakeResponse]],
) -> _FakeClient:
    client = _FakeClient(responder)
    adapter._client = client
    adapter._connected = True
    return client


# ---------------------------------------------------------------------------
# Fixture data
# ---------------------------------------------------------------------------


_TYPENAME_BODY = {"data": {"__typename": "Query"}}

_VARIANT_BODY = {
    "data": {
        "variant": {
            "variant_id": "11-27679916-C-T",
            "reference_genome": "GRCh38",
            "chrom": "11",
            "pos": 27679916,
            "ref": "C",
            "alt": "T",
            "rsids": ["rs6265"],
            "exome": {
                "ac": 12345,
                "an": 250000,
                "af": 0.0494,
                "filters": [],
                "populations": [
                    {"id": "nfe", "ac": 7000, "an": 120000, "af": 0.0583},
                    {"id": "afr", "ac": 500, "an": 20000, "af": 0.025},
                ],
            },
            "genome": {
                "ac": 5000,
                "an": 75000,
                "af": 0.0667,
                "filters": [],
                "populations": [],
            },
            "transcript_consequences": [
                {
                    "gene_id": "ENSG00000176697",
                    "gene_symbol": "BDNF",
                    "consequence_terms": ["missense_variant"],
                    "is_canonical": True,
                },
                {
                    "gene_id": "ENSG00000176697",
                    "gene_symbol": "BDNF",
                    "consequence_terms": ["synonymous_variant"],
                    "is_canonical": False,
                },
            ],
        }
    }
}

_VARIANT_LOW_COVERAGE_BODY = {
    "data": {
        "variant": {
            "variant_id": "1-100-A-G",
            "reference_genome": "GRCh38",
            "chrom": "1",
            "pos": 100,
            "ref": "A",
            "alt": "G",
            "rsids": [],
            "exome": {
                "ac": 1,
                "an": 200,
                "af": 0.005,
                "filters": [],
                "populations": [],
            },
            "genome": None,
            "transcript_consequences": [],
        }
    }
}

_VARIANT_NULL_BODY = {"data": {"variant": None}}

_GENE_BODY = {
    "data": {
        "gene": {
            "gene_id": "ENSG00000176697",
            "symbol": "BDNF",
            "chrom": "11",
            "start": 27654893,
            "stop": 27722058,
        }
    }
}

_GRAPHQL_ERROR_BODY = {
    "data": None,
    "errors": [
        {"message": "Variant not in dataset gnomad_r4: nonsense"}
    ],
}


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_then_disconnect():
    adapter = GnomadAdapter({"max_retries": 1})
    _install_client(adapter, _fake_response(json_data=_TYPENAME_BODY))
    assert await adapter.connect() is True
    assert adapter.is_connected
    await adapter.disconnect()
    assert not adapter.is_connected


@pytest.mark.asyncio
async def test_connect_returns_false_on_500():
    adapter = GnomadAdapter({"max_retries": 1})
    _install_client(adapter, _fake_response(status_code=500))
    assert await adapter.connect() is False


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_variant_by_id_returns_one_record():
    adapter = GnomadAdapter({"max_retries": 1})
    # _install_client sets _connected=True, so fetch() skips the typename ping
    # and goes straight to the variant query — one POST, one response.
    client = _install_client(adapter, _fake_response(json_data=_VARIANT_BODY))
    records = await adapter.fetch({"variant_id": "11-27679916-C-T"})
    assert len(records) == 1
    # Validate the GraphQL body shape
    assert client.posts[0]["body"]["variables"]["variantId"] == "11-27679916-C-T"
    assert client.posts[0]["body"]["variables"]["dataset"] == DEFAULT_DATASET


@pytest.mark.asyncio
async def test_fetch_variant_string_query_treated_as_variant_id():
    adapter = GnomadAdapter({"max_retries": 1})
    _install_client(adapter, _fake_response(json_data=_VARIANT_BODY))
    records = await adapter.fetch("11-27679916-C-T")
    assert len(records) == 1


@pytest.mark.asyncio
async def test_fetch_variant_fan_out_for_list_of_ids():
    adapter = GnomadAdapter({"max_retries": 1})
    seq = iter([
        _fake_response(json_data=_VARIANT_BODY),
        _fake_response(json_data=_VARIANT_LOW_COVERAGE_BODY),
    ])

    def resp(_body):
        return next(seq)

    _install_client(adapter, resp)
    records = await adapter.fetch({"variant_ids": ["11-27679916-C-T", "1-100-A-G"]})
    assert len(records) == 2


@pytest.mark.asyncio
async def test_fetch_variant_returns_empty_when_data_is_null():
    adapter = GnomadAdapter({"max_retries": 1})
    _install_client(adapter, _fake_response(json_data=_VARIANT_NULL_BODY))
    records = await adapter.fetch({"variant_id": "1-1-A-A"})
    assert records == []


@pytest.mark.asyncio
async def test_fetch_gene_by_symbol():
    adapter = GnomadAdapter({"max_retries": 1})
    client = _install_client(adapter, _fake_response(json_data=_GENE_BODY))
    records = await adapter.fetch({"gene_symbol": "BDNF"})
    assert len(records) == 1
    assert client.posts[0]["body"]["variables"]["geneSymbol"] == "BDNF"


@pytest.mark.asyncio
async def test_fetch_empty_query_raises():
    adapter = GnomadAdapter({"max_retries": 1})
    _install_client(adapter, _fake_response(json_data=_TYPENAME_BODY))
    with pytest.raises(GnomadError):
        await adapter.fetch({})


# ---------------------------------------------------------------------------
# GraphQL error handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_graphql_errors_array_raises_api_error_not_partial_data():
    adapter = GnomadAdapter({"max_retries": 1})
    _install_client(adapter, _fake_response(json_data=_GRAPHQL_ERROR_BODY))
    with pytest.raises(GnomadAPIError) as exc_info:
        await adapter.fetch({"variant_id": "nonsense"})
    assert "Variant not in dataset" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Normalize
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_variant_picks_canonical_transcript():
    adapter = GnomadAdapter()
    normalised = await adapter.normalize([_VARIANT_BODY["data"]["variant"]])
    assert len(normalised) == 1
    rec = normalised[0]
    assert rec["variant_id"] == "11-27679916-C-T"
    assert rec["gene_symbol"] == "BDNF"
    # Canonical transcript has consequence "missense_variant"
    assert rec["consequence"] == "missense_variant"
    assert rec["exome_af"] == 0.0494
    assert rec["genome_af"] == 0.0667
    assert any(p["id"] == "nfe" for p in rec["exome_populations"])


@pytest.mark.asyncio
async def test_normalize_gene_record():
    adapter = GnomadAdapter()
    # _fetch_gene wraps result with {"_gene_record": True, **gene}
    raw = {"_gene_record": True, **_GENE_BODY["data"]["gene"]}
    normalised = await adapter.normalize([raw])
    assert len(normalised) == 1
    assert normalised[0]["gene_symbol"] == "BDNF"
    assert normalised[0]["_record_type"] == "gene"


@pytest.mark.asyncio
async def test_normalize_skips_records_without_id():
    adapter = GnomadAdapter()
    normalised = await adapter.normalize(
        [None, {}, {"chrom": "1"}, {"_gene_record": True, "symbol": "no_id"}]
    )
    assert normalised == []


# ---------------------------------------------------------------------------
# Validate / confidence / provenance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_attaches_evidence_and_provenance():
    adapter = GnomadAdapter()
    normalised = await adapter.normalize(
        [
            _VARIANT_BODY["data"]["variant"],
            _VARIANT_LOW_COVERAGE_BODY["data"]["variant"],
        ]
    )
    validated = await adapter.validate(normalised)
    big = next(r for r in validated if r["variant_id"] == "11-27679916-C-T")
    small = next(r for r in validated if r["variant_id"] == "1-100-A-G")
    assert big["_valid"] is True
    # All gnomAD records are observational cohort-tier evidence.
    assert big["_evidence_level"] == EvidenceLevel.COHORT_STUDY.value
    # AN=250000 → HIGH confidence
    assert big["_confidence"] == ConfidenceTier.HIGH.value
    # AN=200 → MEDIUM (AF present but small sample)
    assert small["_confidence"] == ConfidenceTier.MEDIUM.value
    # Research-only is ALWAYS True for gnomAD — population frequency is
    # not a clinical interpretation.
    assert big["_provenance"]["research_only"] is True
    assert big["_provenance"]["source_database"] == "gnomAD"


def test_get_license_is_odc_by():
    adapter = GnomadAdapter()
    meta = adapter.get_license()
    assert isinstance(meta, LicenseMetadata)
    assert meta.allows_research is True
    assert meta.allows_commercial is True
    assert meta.requires_attribution is True
    assert any("Karczewski" in r or "clinical" in r for r in meta.restrictions)


def test_get_provenance_always_research_only():
    adapter = GnomadAdapter()
    record = {
        "variant_id": "11-27679916-C-T",
        "chromosome": "11",
        "exome_af": 0.05,
        "genome_af": 0.06,
        "consequence": "missense_variant",
        "gene_symbol": "BDNF",
    }
    prov = adapter.get_provenance(record)
    assert isinstance(prov, ProvenanceRecord)
    assert prov.source_database == "gnomAD"
    assert prov.research_only is True  # invariant
    assert prov.evidence_level == EvidenceLevel.COHORT_STUDY
    assert prov.citation_doi == "10.1038/s41586-020-2308-7"


def test_get_confidence_tiers():
    adapter = GnomadAdapter()
    # High-N variant → HIGH
    assert (
        adapter.get_confidence({"genome_an": 250000, "genome_af": 0.05})
        == ConfidenceTier.HIGH
    )
    # Small-N variant → MEDIUM
    assert (
        adapter.get_confidence({"genome_an": 200, "genome_af": 0.005})
        == ConfidenceTier.MEDIUM
    )
    # No AF at all → LOW
    assert adapter.get_confidence({}) == ConfidenceTier.LOW
    # Gene record → HIGH
    assert (
        adapter.get_confidence({"_record_type": "gene"}) == ConfidenceTier.HIGH
    )


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_429_raises_ratelimit():
    adapter = GnomadAdapter({"max_retries": 1})
    _install_client(adapter, _fake_response(status_code=429))
    with pytest.raises(GnomadRateLimitError):
        await adapter.fetch({"variant_id": "1-1-A-G"})


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok():
    adapter = GnomadAdapter({"max_retries": 1})
    _install_client(adapter, _fake_response(json_data=_TYPENAME_BODY))
    h = await adapter.health_check()
    assert h["status"] == "ok"
    assert h["source"] == "gnomAD"
    assert h["dataset"] == DEFAULT_DATASET


@pytest.mark.asyncio
async def test_health_check_reports_down_on_500():
    adapter = GnomadAdapter({"max_retries": 1})
    _install_client(adapter, _fake_response(status_code=500))
    h = await adapter.health_check()
    assert h["status"] == "down"
    assert "error" in h
