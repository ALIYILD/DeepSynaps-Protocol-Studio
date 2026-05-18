"""
Unit tests for app.services.knowledge.adapters.clinicaltrials_adapter.

HTTP mocked at the httpx.AsyncClient boundary with a plain stub class. Covers:
lifecycle, search (term + condition + intervention + status + pagination),
single-trial direct lookup, normalize/validate, evidence-tier mapping,
provenance + license dataclass shape, error paths (404/429), health check.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.clinicaltrials_adapter import (
    ClinicalTrialsAdapter,
    ClinicalTrialsError,
    ClinicalTrialsNotFoundError,
    ClinicalTrialsRateLimitError,
)
from app.services.knowledge.base_adapter import (
    ConfidenceTier,
    EvidenceLevel,
    LicenseMetadata,
    ProvenanceRecord,
)


# ---------------------------------------------------------------------------
# Test helpers — plain class, no MagicMock attribute magic
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
    def __init__(
        self,
        routes: Dict[str, Union[_FakeResponse, Callable[[Dict[str, Any]], _FakeResponse]]],
    ) -> None:
        self.routes = routes
        self.is_closed = False
        self.calls: list = []

    async def get(self, url: str, params: Dict[str, Any] = None) -> _FakeResponse:
        self.calls.append((url, dict(params or {})))
        for needle, response in self.routes.items():
            if needle in url:
                return response(params or {}) if callable(response) else response
        raise AssertionError(f"Unexpected URL: {url}")

    async def aclose(self) -> None:
        self.is_closed = True


def _install_client(
    adapter: ClinicalTrialsAdapter,
    routes: Dict[str, Union[_FakeResponse, Callable[[Dict[str, Any]], _FakeResponse]]],
) -> _FakeClient:
    client = _FakeClient(routes)
    adapter._client = client
    adapter._connected = True
    return client


# ---------------------------------------------------------------------------
# Fixture data
# ---------------------------------------------------------------------------


_STATS_BODY = {"totalStudies": 480000}

_STUDY_RCT_COMPLETED = {
    "hasResults": True,
    "protocolSection": {
        "identificationModule": {
            "nctId": "NCT00000001",
            "briefTitle": "tDCS for major depressive disorder — Phase 3 RCT",
            "officialTitle": "A multicenter, randomized trial of tDCS in MDD",
        },
        "statusModule": {
            "overallStatus": "COMPLETED",
            "startDateStruct": {"date": "2020-01-15"},
            "completionDateStruct": {"date": "2022-12-01"},
        },
        "designModule": {
            "phases": ["PHASE3"],
            "enrollmentInfo": {"count": 240, "type": "ACTUAL"},
        },
        "conditionsModule": {"conditions": ["Major Depressive Disorder"]},
        "armsInterventionsModule": {
            "interventions": [
                {"name": "Active tDCS 2mA", "type": "DEVICE"},
                {"name": "Sham tDCS", "type": "DEVICE"},
            ]
        },
        "sponsorCollaboratorsModule": {
            "leadSponsor": {"name": "Big University Hospital"}
        },
        "contactsLocationsModule": {
            "locations": [
                {"facility": "Hospital A", "city": "London", "country": "UK"}
            ]
        },
    },
}

_STUDY_PHASE2_RECRUITING = {
    "hasResults": False,
    "protocolSection": {
        "identificationModule": {
            "nctId": "NCT00000002",
            "briefTitle": "rTMS dose-finding study",
        },
        "statusModule": {
            "overallStatus": "RECRUITING",
        },
        "designModule": {
            "phases": ["PHASE2"],
            "enrollmentInfo": {"count": 40, "type": "ESTIMATED"},
        },
        "conditionsModule": {"conditions": ["Treatment-Resistant Depression"]},
        "armsInterventionsModule": {
            "interventions": [{"name": "rTMS 10Hz left DLPFC", "type": "DEVICE"}]
        },
        "sponsorCollaboratorsModule": {"leadSponsor": {"name": "Trial Sponsor LLC"}},
    },
}

_SEARCH_PAGE_1 = {
    "studies": [_STUDY_RCT_COMPLETED, _STUDY_PHASE2_RECRUITING],
    "nextPageToken": None,
    "totalCount": 2,
}


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_then_disconnect():
    adapter = ClinicalTrialsAdapter({"max_retries": 1})
    _install_client(adapter, {"stats/size": _fake_response(json_data=_STATS_BODY)})
    assert await adapter.connect() is True
    assert adapter.is_connected
    await adapter.disconnect()
    assert not adapter.is_connected


@pytest.mark.asyncio
async def test_connect_returns_false_on_500():
    adapter = ClinicalTrialsAdapter({"max_retries": 1})
    _install_client(adapter, {"stats/size": _fake_response(status_code=500)})
    assert await adapter.connect() is False
    assert not adapter.is_connected


# ---------------------------------------------------------------------------
# fetch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_by_term_calls_studies_endpoint():
    adapter = ClinicalTrialsAdapter({"max_retries": 1})
    client = _install_client(
        adapter,
        {
            "stats/size": _fake_response(json_data=_STATS_BODY),
            "studies": _fake_response(json_data=_SEARCH_PAGE_1),
        },
    )
    records = await adapter.fetch({"term": "tDCS depression", "max_results": 10})
    assert len(records) == 2
    # 'studies' endpoint should be hit, with query.term param
    studies_calls = [c for c in client.calls if c[0].endswith("/studies")]
    assert studies_calls, "expected at least one /studies call"
    params = studies_calls[0][1]
    assert params["query.term"] == "tDCS depression"
    assert params["format"] == "json"


@pytest.mark.asyncio
async def test_fetch_with_condition_intervention_and_status_filters():
    adapter = ClinicalTrialsAdapter({"max_retries": 1})
    client = _install_client(
        adapter,
        {
            "stats/size": _fake_response(json_data=_STATS_BODY),
            "studies": _fake_response(json_data=_SEARCH_PAGE_1),
        },
    )
    await adapter.fetch(
        {
            "condition": "depression",
            "intervention": "tDCS",
            "status": ["RECRUITING", "COMPLETED"],
            "max_results": 5,
        }
    )
    params = next(c[1] for c in client.calls if c[0].endswith("/studies"))
    assert params["query.cond"] == "depression"
    assert params["query.intr"] == "tDCS"
    assert params["filter.overallStatus"] == "RECRUITING|COMPLETED"


@pytest.mark.asyncio
async def test_fetch_single_by_nct_id_hits_study_endpoint():
    adapter = ClinicalTrialsAdapter({"max_retries": 1})
    client = _install_client(
        adapter,
        {
            "stats/size": _fake_response(json_data=_STATS_BODY),
            "studies/NCT00000001": _fake_response(json_data=_STUDY_RCT_COMPLETED),
        },
    )
    records = await adapter.fetch({"nct_id": "NCT00000001"})
    assert len(records) == 1
    assert any("NCT00000001" in c[0] for c in client.calls)


@pytest.mark.asyncio
async def test_fetch_paginates_until_max_results():
    adapter = ClinicalTrialsAdapter({"max_retries": 1, "page_size": 1})
    # First call returns 1 study with a next token; second call returns 1 study no token.
    page_1 = {
        "studies": [_STUDY_RCT_COMPLETED],
        "nextPageToken": "tok-2",
    }
    page_2 = {
        "studies": [_STUDY_PHASE2_RECRUITING],
        "nextPageToken": None,
    }
    seq = iter([page_1, page_2])

    def studies_resp(_params):
        return _fake_response(json_data=next(seq))

    _install_client(
        adapter,
        {
            "stats/size": _fake_response(json_data=_STATS_BODY),
            "studies": studies_resp,
        },
    )
    records = await adapter.fetch({"term": "anything", "max_results": 2})
    assert len(records) == 2


@pytest.mark.asyncio
async def test_fetch_empty_query_raises():
    adapter = ClinicalTrialsAdapter({"max_retries": 1})
    _install_client(
        adapter, {"stats/size": _fake_response(json_data=_STATS_BODY)}
    )
    with pytest.raises(ClinicalTrialsError):
        await adapter.fetch({"max_results": 5})


# ---------------------------------------------------------------------------
# normalize / validate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_maps_protocol_section_fields():
    adapter = ClinicalTrialsAdapter()
    normalised = await adapter.normalize([_STUDY_RCT_COMPLETED])
    assert len(normalised) == 1
    rec = normalised[0]
    assert rec["nct_id"] == "NCT00000001"
    assert "Phase 3 RCT" in rec["title"]
    assert rec["phases"] == ["PHASE3"]
    assert rec["overall_status"] == "COMPLETED"
    assert "Major Depressive Disorder" in rec["conditions"]
    assert any(i["name"] == "Active tDCS 2mA" for i in rec["interventions"])
    assert rec["enrollment_count"] == 240
    assert rec["lead_sponsor"] == "Big University Hospital"
    assert rec["locations"][0]["country"] == "UK"
    assert rec["has_results"] is True


@pytest.mark.asyncio
async def test_normalize_drops_record_without_nct_id():
    adapter = ClinicalTrialsAdapter()
    # protocolSection missing identificationModule.nctId
    raw = {"protocolSection": {"identificationModule": {"briefTitle": "no nct"}}}
    normalised = await adapter.normalize([raw])
    assert normalised == []


@pytest.mark.asyncio
async def test_validate_attaches_evidence_and_provenance():
    adapter = ClinicalTrialsAdapter()
    normalised = await adapter.normalize(
        [_STUDY_RCT_COMPLETED, _STUDY_PHASE2_RECRUITING]
    )
    validated = await adapter.validate(normalised)
    rct = next(r for r in validated if r["nct_id"] == "NCT00000001")
    p2 = next(r for r in validated if r["nct_id"] == "NCT00000002")
    assert rct["_valid"] is True
    assert rct["_evidence_level"] == EvidenceLevel.RCT.value
    # Phase 3 completed WITH results → HIGH
    assert rct["_confidence"] == ConfidenceTier.HIGH.value
    # Phase 2 ongoing without results → LOW
    assert p2["_evidence_level"] == EvidenceLevel.CASE_SERIES.value
    assert p2["_confidence"] == ConfidenceTier.LOW.value
    assert rct["_provenance"]["source_database"] == "ClinicalTrials.gov"


# ---------------------------------------------------------------------------
# Provenance / license / confidence
# ---------------------------------------------------------------------------


def test_get_license_is_public_domain():
    adapter = ClinicalTrialsAdapter()
    meta = adapter.get_license()
    assert isinstance(meta, LicenseMetadata)
    assert meta.allows_research is True
    assert meta.allows_commercial is True
    assert meta.requires_attribution is True


def test_get_provenance_dataclass_shape_for_rct_with_results():
    adapter = ClinicalTrialsAdapter()
    record = {
        "nct_id": "NCT00000001",
        "title": "An RCT",
        "phases": ["PHASE3"],
        "overall_status": "COMPLETED",
        "has_results": True,
    }
    prov = adapter.get_provenance(record)
    assert isinstance(prov, ProvenanceRecord)
    assert prov.source_database == "ClinicalTrials.gov"
    assert prov.confidence_tier == ConfidenceTier.HIGH
    assert prov.evidence_level == EvidenceLevel.RCT
    assert prov.research_only is False


def test_get_provenance_marks_trial_without_results_as_research_only():
    adapter = ClinicalTrialsAdapter()
    record = {
        "nct_id": "NCT00000002",
        "title": "Ongoing",
        "phases": ["PHASE3"],
        "overall_status": "RECRUITING",
        "has_results": False,
    }
    prov = adapter.get_provenance(record)
    assert prov.research_only is True


def test_get_confidence_tiers_map_correctly():
    adapter = ClinicalTrialsAdapter()
    assert (
        adapter.get_confidence(
            {"phases": ["PHASE3"], "overall_status": "COMPLETED", "has_results": True}
        )
        == ConfidenceTier.HIGH
    )
    assert (
        adapter.get_confidence(
            {"phases": ["PHASE3"], "overall_status": "RECRUITING", "has_results": False}
        )
        == ConfidenceTier.MEDIUM
    )
    assert (
        adapter.get_confidence({"phases": ["PHASE2"], "overall_status": "RECRUITING"})
        == ConfidenceTier.LOW
    )
    # No phases at all → CASE_SERIES → LOW
    assert adapter.get_confidence({"phases": [], "overall_status": ""}) == ConfidenceTier.LOW


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_404_raises_notfound():
    adapter = ClinicalTrialsAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {
            "stats/size": _fake_response(json_data=_STATS_BODY),
            "studies": _fake_response(status_code=404),
        },
    )
    with pytest.raises(ClinicalTrialsNotFoundError):
        await adapter.fetch({"term": "ghost"})


@pytest.mark.asyncio
async def test_429_raises_ratelimit():
    adapter = ClinicalTrialsAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {
            "stats/size": _fake_response(json_data=_STATS_BODY),
            "studies": _fake_response(status_code=429),
        },
    )
    with pytest.raises(ClinicalTrialsRateLimitError):
        await adapter.fetch({"term": "burst"})


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok():
    adapter = ClinicalTrialsAdapter({"max_retries": 1})
    _install_client(adapter, {"stats/size": _fake_response(json_data=_STATS_BODY)})
    h = await adapter.health_check()
    assert h["status"] == "ok"
    assert h["source"] == "ClinicalTrials.gov"


@pytest.mark.asyncio
async def test_health_check_reports_down_on_500():
    adapter = ClinicalTrialsAdapter({"max_retries": 1})
    _install_client(adapter, {"stats/size": _fake_response(status_code=500)})
    h = await adapter.health_check()
    assert h["status"] == "down"
    assert "error" in h
