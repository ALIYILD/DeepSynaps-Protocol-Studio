"""
Slice C — federated clinical-evidence search.

Tests the service module ``app.services.evidence_federation`` end-to-end:

- Internal DB queried first; rows returned under ``internal_results``.
- ``CataloguedOnlyAdapter`` (`FetchError`) → status="catalogued", zero rows.
- Adapter exceptions → status="error", call still returns.
- Adapter timeouts → status="timeout".
- Dedup by DOI / PMID / trial / title (in that priority).
- ``decision_support_disclaimer`` verbatim.
- Empty-envelope produces a clinician-facing warning.

The internal DB path is monkey-patched so tests do not require
``evidence.db`` to exist on disk.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

import pytest

import app.services.evidence_federation as fed
from app.services.evidence_federation import (
    FEDERATED_SEARCH_DECISION_SUPPORT_DISCLAIMER,
    FederatedSearchRequest,
    federated_search,
)
from app.services.knowledge.adapter_registry import AdapterRegistry
from app.services.knowledge.base_adapter import (
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    FetchError,
    LicenseMetadata,
    ProvenanceRecord,
)


# ---------------------------------------------------------------------------
# Adapter stubs for the registry
# ---------------------------------------------------------------------------


def _utc_now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


def _provenance(record: Dict[str, Any], source: str) -> ProvenanceRecord:
    return ProvenanceRecord(
        source_database=source,
        source_version="test",
        source_record_id=str(record.get("doi") or record.get("pmid") or ""),
        ingestion_timestamp=_utc_now(),
        license_type="test-public",
    )


class _BaseStub(DatabaseAdapter):
    """Shared boilerplate for the test stubs."""

    _name = "Stub"

    @property
    def source_name(self) -> str:
        return self._name

    @property
    def source_version(self) -> str:
        return "test"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return list(records)

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return _provenance(record, self._name)

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(license_type="test-public")

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        return ConfidenceTier.UNKNOWN

    async def health_check(self) -> Dict[str, Any]:
        return {"connected": True, "status": "ok"}


class _OkAdapter(_BaseStub):
    """Returns a configurable list of normalized rows."""

    _name = "Live OK Source"

    def __init__(self, rows: List[Dict[str, Any]]):
        super().__init__({})
        self._rows = rows

    async def fetch(self, query):
        return list(self._rows)

    async def normalize(self, raw):
        return list(raw)


class _CataloguedAdapter(_BaseStub):
    """Behaves like ``CataloguedOnlyAdapter`` — raises FetchError."""

    _name = "Catalogued Stub"

    async def fetch(self, query):
        raise FetchError("No live transport.")

    async def normalize(self, raw):
        return list(raw)


class _ExplodingAdapter(_BaseStub):
    """Raises a non-FetchError exception to test error passthrough."""

    _name = "Broken Source"

    async def fetch(self, query):
        raise RuntimeError("simulated crash")

    async def normalize(self, raw):
        return list(raw)


class _SlowAdapter(_BaseStub):
    """Sleeps past the federation timeout."""

    _name = "Slow Source"

    async def fetch(self, query):
        await asyncio.sleep(30)
        return []

    async def normalize(self, raw):
        return list(raw)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def empty_internal(monkeypatch):
    """Make the internal-DB shim return zero rows + an honest status."""

    from app.services.evidence_federation import SourceStatus

    def _stub(req):
        return [], SourceStatus(
            key="internal_evidence_db",
            display_name="DeepSynaps Evidence Database",
            is_internal=True,
            requires_subscription=False,
            status="degraded",
            message="DB not present in test env.",
        )

    monkeypatch.setattr(fed, "_internal_db_search", _stub)


@pytest.fixture
def internal_with_rows(monkeypatch):
    """Internal-DB shim returns two rows with DOIs that external sources also have."""

    from app.services.evidence_federation import SourceStatus

    def _stub(req):
        rows = [
            {
                "source": "internal_evidence_db",
                "doi": "10.1234/INT.1",
                "pmid": "11111",
                "title": "Internal paper one",
                "provenance": {"source": "internal_evidence_db"},
            },
            {
                "source": "internal_evidence_db",
                "doi": None,
                "pmid": "22222",
                "title": "Internal paper two",
                "provenance": {"source": "internal_evidence_db"},
            },
        ]
        return rows, SourceStatus(
            key="internal_evidence_db",
            display_name="DeepSynaps Evidence Database",
            is_internal=True,
            requires_subscription=False,
            status="ok",
            result_count=len(rows),
        )

    monkeypatch.setattr(fed, "_internal_db_search", _stub)


def _registry_with(*entries) -> AdapterRegistry:
    registry = AdapterRegistry()
    for key, adapter in entries:
        registry.register(key, adapter, tier="P1")
    return registry


# ---------------------------------------------------------------------------
# Honesty contract
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_decision_support_disclaimer_is_verbatim(empty_internal):
    registry = AdapterRegistry()
    response = await federated_search(
        FederatedSearchRequest(query="rTMS depression"),
        registry=registry,
        adapter_keys=[],
    )
    assert response.decision_support_disclaimer == FEDERATED_SEARCH_DECISION_SUPPORT_DISCLAIMER
    assert "Decision support only" in response.decision_support_disclaimer
    assert "Clinician must verify" in response.decision_support_disclaimer


@pytest.mark.asyncio
async def test_empty_envelope_produces_clinician_warning(empty_internal):
    registry = AdapterRegistry()
    response = await federated_search(
        FederatedSearchRequest(query="nothing matches"),
        registry=registry,
        adapter_keys=[],
    )
    assert response.internal_results == []
    assert response.external_results == []
    warnings = " ".join(response.warnings).lower()
    assert "do not interpret an empty envelope" in warnings


# ---------------------------------------------------------------------------
# Adapter outcomes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_catalogued_only_adapter_recorded_as_catalogued(empty_internal):
    registry = _registry_with(("crossref", _CataloguedAdapter({})))
    response = await federated_search(
        FederatedSearchRequest(query="anything"),
        registry=registry,
        adapter_keys=["crossref"],
    )
    statuses = {s.key: s for s in response.source_status}
    assert statuses["crossref"].status == "catalogued"
    assert statuses["crossref"].result_count == 0
    # FetchError reason surfaced verbatim (truncated to 240 chars).
    assert "No live transport" in (statuses["crossref"].message or "")


@pytest.mark.asyncio
async def test_exploding_adapter_recorded_as_error_call_still_returns(empty_internal):
    registry = _registry_with(("pubmed", _ExplodingAdapter({})))
    response = await federated_search(
        FederatedSearchRequest(query="x"),
        registry=registry,
        adapter_keys=["pubmed"],
    )
    statuses = {s.key: s for s in response.source_status}
    assert statuses["pubmed"].status == "error"
    assert "RuntimeError" in (statuses["pubmed"].message or "")


@pytest.mark.asyncio
async def test_slow_adapter_times_out(empty_internal, monkeypatch):
    # Shorten the per-source timeout for the test.
    monkeypatch.setattr(fed, "_PER_SOURCE_TIMEOUT_SECONDS", 0.1)
    registry = _registry_with(("trip", _SlowAdapter({})))
    response = await federated_search(
        FederatedSearchRequest(query="x"),
        registry=registry,
        adapter_keys=["trip"],
    )
    statuses = {s.key: s for s in response.source_status}
    assert statuses["trip"].status == "timeout"


@pytest.mark.asyncio
async def test_ok_adapter_rows_carried_with_provenance(empty_internal):
    rows = [
        {"doi": "10.1234/EXT.1", "pmid": "33333", "title": "External one"},
        {"doi": "10.1234/EXT.2", "pmid": "44444", "title": "External two"},
    ]
    registry = _registry_with(("pubmed", _OkAdapter(rows)))
    response = await federated_search(
        FederatedSearchRequest(query="x"),
        registry=registry,
        adapter_keys=["pubmed"],
    )
    assert len(response.external_results) == 2
    by_doi = {r["doi"]: r for r in response.external_results}
    assert by_doi["10.1234/EXT.1"]["provenance"]["source_database"] == "Live OK Source"


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_internal_doi_wins_over_external_duplicate(internal_with_rows):
    """An external row with DOI matching an internal row must be dropped."""
    external_rows = [
        {"doi": "10.1234/INT.1", "pmid": "99", "title": "duplicate of internal one"},
        {"doi": "10.1234/EXT.NEW", "pmid": "55555", "title": "actually new"},
    ]
    registry = _registry_with(("pubmed", _OkAdapter(external_rows)))
    response = await federated_search(
        FederatedSearchRequest(query="x"),
        registry=registry,
        adapter_keys=["pubmed"],
    )
    assert len(response.internal_results) == 2  # internal kept intact
    assert len(response.external_results) == 1  # duplicate dropped
    assert response.external_results[0]["doi"] == "10.1234/EXT.NEW"
    assert response.deduplication_summary["dedup_by_doi"] == 1


@pytest.mark.asyncio
async def test_dedup_falls_back_to_pmid_when_no_doi(empty_internal):
    """Two external sources returning the same PMID-only paper → dedup."""
    pubmed_rows = [{"doi": None, "pmid": "777", "title": "P1"}]
    europepmc_rows = [{"doi": None, "pmid": "777", "title": "P1 alt title"}]
    registry = _registry_with(
        ("pubmed", _OkAdapter(pubmed_rows)),
        ("europepmc", _OkAdapter(europepmc_rows)),
    )
    response = await federated_search(
        FederatedSearchRequest(query="x"),
        registry=registry,
        adapter_keys=["pubmed", "europepmc"],
    )
    assert len(response.external_results) == 1
    assert response.deduplication_summary["dedup_by_pmid"] == 1


@pytest.mark.asyncio
async def test_dedup_by_title_when_no_strong_identifier(empty_internal):
    """Title-hash dedup only fires when there is no DOI/PMID anywhere."""
    pubmed_rows = [{"doi": None, "pmid": None, "title": "Some Paper About rTMS"}]
    europepmc_rows = [{"doi": None, "pmid": None, "title": "some paper about rTMS"}]
    registry = _registry_with(
        ("pubmed", _OkAdapter(pubmed_rows)),
        ("europepmc", _OkAdapter(europepmc_rows)),
    )
    response = await federated_search(
        FederatedSearchRequest(query="x"),
        registry=registry,
        adapter_keys=["pubmed", "europepmc"],
    )
    assert len(response.external_results) == 1
    assert response.deduplication_summary["dedup_by_title"] == 1


@pytest.mark.asyncio
async def test_dedup_by_trial_id_only_when_include_trials_true(empty_internal):
    pubmed_rows = [{"doi": None, "pmid": None, "title": "T1", "nct_id": "NCT001"}]
    eudract_rows = [{"doi": None, "pmid": None, "title": "T1 alt", "nct_id": "NCT001"}]
    registry = _registry_with(
        ("pubmed", _OkAdapter(pubmed_rows)),
        ("eudract", _OkAdapter(eudract_rows)),
    )
    response = await federated_search(
        FederatedSearchRequest(query="x", include_trials=True),
        registry=registry,
        adapter_keys=["pubmed", "eudract"],
    )
    assert len(response.external_results) == 1
    assert response.deduplication_summary["dedup_by_trial"] == 1


# ---------------------------------------------------------------------------
# Limit + adapter ordering
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_limit_truncates_external_results(empty_internal):
    rows = [
        {"doi": f"10.X/{i}", "pmid": None, "title": f"Row {i}"}
        for i in range(50)
    ]
    registry = _registry_with(("pubmed", _OkAdapter(rows)))
    response = await federated_search(
        FederatedSearchRequest(query="x", limit=10, per_source_limit=50),
        registry=registry,
        adapter_keys=["pubmed"],
    )
    assert len(response.external_results) == 10
    assert any("Truncated" in w for w in response.warnings)
    assert response.limit_applied == 10


@pytest.mark.asyncio
async def test_internal_db_row_count_reflected_in_source_status(internal_with_rows):
    registry = AdapterRegistry()
    response = await federated_search(
        FederatedSearchRequest(query="x"),
        registry=registry,
        adapter_keys=[],
    )
    internal_status = response.source_status[0]
    assert internal_status.key == "internal_evidence_db"
    assert internal_status.is_internal is True
    assert internal_status.result_count == 2


# ---------------------------------------------------------------------------
# Subscription source — flagged honestly
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_subscription_source_status_marked(empty_internal):
    registry = _registry_with(("cochrane", _CataloguedAdapter({})))
    response = await federated_search(
        FederatedSearchRequest(query="x"),
        registry=registry,
        adapter_keys=["cochrane"],
    )
    cochrane = next(s for s in response.source_status if s.key == "cochrane")
    assert cochrane.requires_subscription is True
    assert cochrane.status == "catalogued"
    assert cochrane.result_count == 0
