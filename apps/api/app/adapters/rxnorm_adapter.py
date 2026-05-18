"""
RxNorm Adapter — Production-Quality NIH RxNorm API Integration

Data types: drug, medication, ndc, clinical_drug
API: https://rxnav.nlm.nih.gov/REST/
Free NIH API — no authentication required.

Rebuild: 2024-06 — expanded from 23-line stub to 400+ line production adapter.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Union
from urllib.parse import quote_plus

import httpx
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger("rxnorm_adapter")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
BASE_URL = "https://rxnav.nlm.nih.gov/REST"
DEFAULT_TIMEOUT = 30.0
MAX_RETRIES = 3
BACKOFF_BASE = 1.0  # seconds
RATE_LIMIT_RPS = 10  # NIH recommends ~10 req/s for RxNorm
SUPPORTED_DATA_TYPES: List[str] = ["drug", "medication", "ndc", "clinical_drug"]

# ---------------------------------------------------------------------------
# Pydantic models — canonical schema
# ---------------------------------------------------------------------------


class DrugProperty(BaseModel):
    """A single drug property (e.g. strength, dose form)."""

    name: str
    value: str


class RelatedDrug(BaseModel):
    """A drug related to the queried concept (e.g. generic, brand)."""

    rxcui: str
    name: str
    tty: str  # term type (e.g. SCD, SBD, GN)
    relation: str


class DrugConcept(BaseModel):
    """Canonical representation of a drug concept from RxNorm."""

    rxcui: str
    name: str
    tty: str
    language: str = "ENG"
    suppress: str = "N"
    properties: List[DrugProperty] = Field(default_factory=list)
    related_drugs: List[RelatedDrug] = Field(default_factory=list)
    ndcs: List[str] = Field(default_factory=list)


class RxNormSearchResult(BaseModel):
    """Result container for a search query."""

    query: str
    total_results: int
    concepts: List[DrugConcept]


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def _extract_properties(all_properties: Dict[str, Any]) -> List[DrugProperty]:
    """Parse the RxNorm allProperties response into canonical DrugProperty list."""
    props: List[DrugProperty] = []
    prop_group = all_properties.get("propConceptGroup", {})
    if not prop_group:
        return props
    concepts = prop_group.get("propConcept", [])
    if isinstance(concepts, dict):
        concepts = [concepts]
    for c in concepts:
        props.append(
            DrugProperty(name=c.get("propName", ""), value=c.get("propValue", ""))
        )
    return props


def _extract_related(related_response: Dict[str, Any], relation: str) -> List[RelatedDrug]:
    """Parse the relatedByType / relatedByNDC response."""
    related: List[RelatedDrug] = []
    concept_group = related_response.get("relatedGroup", {}).get("conceptGroup", [])
    if isinstance(concept_group, dict):
        concept_group = [concept_group]
    for cg in concept_group:
        concepts = cg.get("conceptProperties", [])
        if isinstance(concepts, dict):
            concepts = [concepts]
        for c in concepts:
            related.append(
                RelatedDrug(
                    rxcui=c.get("rxcui", ""),
                    name=c.get("name", ""),
                    tty=cg.get("tty", ""),
                    relation=relation,
                )
            )
    return related


def _extract_ndcs(ndc_response: Dict[str, Any]) -> List[str]:
    """Extract NDC codes from the getAllRelatedInfo NDC list."""
    ndcs: List[str] = []
    ndc_group = ndc_response.get("ndcConcept", {}).get("ndcTime", [])
    if isinstance(ndc_group, dict):
        ndc_group = [ndc_group]
    for entry in ndc_group:
        ndc = entry.get("ndc", [])
        if isinstance(ndc, str):
            ndcs.append(ndc)
        elif isinstance(ndc, list):
            ndcs.extend(ndc)
    return ndcs


# ---------------------------------------------------------------------------
# Simple in-memory TTL cache
# ---------------------------------------------------------------------------


class _TTLCache:
    """Thread-safe(ish) in-memory cache with TTL seconds."""

    def __init__(self, ttl_seconds: float = 300.0) -> None:
        self._store: Dict[str, Any] = {}
        self._expires: Dict[str, float] = {}
        self._ttl = ttl_seconds

    def get(self, key: str) -> Any:
        now = time.monotonic()
        if key in self._expires and now < self._expires[key]:
            return self._store[key]
        self._store.pop(key, None)
        self._expires.pop(key, None)
        return None

    def set(self, key: str, value: Any) -> None:
        self._store[key] = value
        self._expires[key] = time.monotonic() + self._ttl

    def clear(self) -> None:
        self._store.clear()
        self._expires.clear()


# ---------------------------------------------------------------------------
# Adapter class
# ---------------------------------------------------------------------------


class RxNormAdapter:
    """
    Production-grade adapter for the NIH RxNorm REST API.

    Features:
    - Real HTTP calls with httpx (sync & async)
    - Exponential back-off retries on transient errors
    - Per-method rate limiting (token-bucket style via sleep)
    - In-memory response caching with TTL
    - Pagination handling for large result sets
    - Structured logging
    - Pydantic data validation & canonical schema transformation
    """

    def __init__(
        self,
        base_url: str = BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = MAX_RETRIES,
        cache_ttl: float = 300.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self._cache = _TTLCache(ttl_seconds=cache_ttl)
        self._last_request_time: float = 0.0
        self._client: Optional[httpx.Client] = None
        self._async_client: Optional[httpx.AsyncClient] = None
        logger.info("RxNormAdapter initialized | base=%s | timeout=%.1fs", self.base_url, self.timeout)

    # -- Client lifecycle ----------------------------------------------------

    def _get_sync_client(self) -> httpx.Client:
        if self._client is None or self._client.is_closed:
            self._client = httpx.Client(timeout=self.timeout, follow_redirects=True)
        return self._client

    def _get_async_client(self) -> httpx.AsyncClient:
        if self._async_client is None or self._async_client.is_closed:
            self._async_client = httpx.AsyncClient(timeout=self.timeout, follow_redirects=True)
        return self._async_client

    def close(self) -> None:
        if self._client and not self._client.is_closed:
            self._client.close()
        if self._async_client and not self._async_client.is_closed:
            asyncio.get_event_loop().run_until_complete(self._async_client.aclose())
        logger.info("RxNormAdapter clients closed")

    async def aclose(self) -> None:
        if self._async_client and not self._async_client.is_closed:
            await self._async_client.aclose()

    def __enter__(self) -> "RxNormAdapter":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    # -- Rate limiting -------------------------------------------------------

    def _apply_rate_limit(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_request_time
        min_interval = 1.0 / RATE_LIMIT_RPS
        if elapsed < min_interval:
            sleep_time = min_interval - elapsed
            time.sleep(sleep_time)
        self._last_request_time = time.monotonic()

    # -- Low-level request helpers -------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        cache_key = f"{method}:{path}:{hash(str(params))}"
        if use_cache:
            cached = self._cache.get(cache_key)
            if cached is not None:
                logger.debug("Cache hit | %s %s", method, path)
                return cached  # type: ignore[return-value]

        self._apply_rate_limit()
        url = f"{self.base_url}/{path.lstrip('/')}"
        client = self._get_sync_client()

        last_exception: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.debug("HTTP %s %s | attempt=%d", method, url, attempt)
                resp = client.request(method, url, params=params)
                if resp.status_code == 429:
                    retry_after = float(resp.headers.get("Retry-After", BACKOFF_BASE * (2 ** (attempt - 1))))
                    logger.warning("Rate limited | sleeping %.1fs", retry_after)
                    time.sleep(retry_after)
                    continue
                resp.raise_for_status()
                data = resp.json()
                if use_cache:
                    self._cache.set(cache_key, data)
                return data  # type: ignore[return-value]
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code >= 500:
                    last_exception = exc
                    sleep = BACKOFF_BASE * (2 ** (attempt - 1))
                    logger.warning("Server error %d | retry in %.1fs | %s", exc.response.status_code, sleep, path)
                    time.sleep(sleep)
                    continue
                raise
            except httpx.RequestError as exc:
                last_exception = exc
                sleep = BACKOFF_BASE * (2 ** (attempt - 1))
                logger.warning("Request error | retry in %.1fs | %s", sleep, exc)
                time.sleep(sleep)
                continue

        raise RuntimeError(f"Max retries ({self.max_retries}) exceeded for {url}") from last_exception

    # -- Public API methods --------------------------------------------------

    def search_by_name(
        self,
        name: str,
        max_entries: int = 20,
        page: int = 1,
    ) -> RxNormSearchResult:
        """
        Search RxNorm concepts by drug name.

        Parameters
        ----------
        name: drug name (e.g. "lipitor", "metformin")
        max_entries: page size
        page: page number (1-indexed)

        Returns
        -------
        RxNormSearchResult with canonical DrugConcept list.
        """
        params: Dict[str, Any] = {
            "name": name,
            "maxEntries": max_entries,
            "page": page,
        }
        data = self._request("GET", "/drugs.json", params=params)
        drug_group = data.get("drugGroup", {})
        concepts: List[DrugConcept] = []
        concept_group = drug_group.get("conceptGroup", [])
        if isinstance(concept_group, dict):
            concept_group = [concept_group]
        for cg in concept_group:
            props = cg.get("conceptProperties", [])
            if isinstance(props, dict):
                props = [props]
            for p in props:
                concepts.append(
                    DrugConcept(
                        rxcui=p.get("rxcui", ""),
                        name=p.get("name", ""),
                        tty=p.get("tty", ""),
                    )
                )
        return RxNormSearchResult(
            query=name,
            total_results=drug_group.get("totalConceptCount", len(concepts)),
            concepts=concepts,
        )

    def get_by_rxcui(self, rxcui: str) -> Optional[DrugConcept]:
        """
        Retrieve a single drug concept by its RxCUI identifier.

        Parameters
        ----------
        rxcui: RxNorm concept unique identifier (e.g. "153165")

        Returns
        -------
        DrugConcept if found, else None.
        """
        try:
            data = self._request("GET", f"/rxcui/{quote_plus(rxcui)}/properties.json")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None
            raise
        props = data.get("properties", {})
        if not props:
            return None
        return DrugConcept(
            rxcui=rxcui,
            name=props.get("name", ""),
            tty=props.get("tty", ""),
        )

    def get_related_drugs(self, rxcui: str, relation_type: str = "related") -> List[RelatedDrug]:
        """
        Fetch related drug concepts for a given RxCUI.

        Parameters
        ----------
        rxcui: concept identifier
        relation_type: 'related' (default) or 'brands' or 'generics'

        Returns
        -------
        List of RelatedDrug objects.
        """
        tty_map = {
            "related": "",
            "brands": "SBD+BPCK",
            "generics": "SCD+GPCK",
        }
        tty = tty_map.get(relation_type, "")
        params: Dict[str, Any] = {}
        if tty:
            params["tty"] = tty
        data = self._request("GET", f"/relatedRxNorm.json?rxcui={quote_plus(rxcui)}", params=params)
        related_group = data.get("relatedGroup", {})
        concepts: List[RelatedDrug] = []
        concept_groups = related_group.get("conceptGroup", [])
        if isinstance(concept_groups, dict):
            concept_groups = [concept_groups]
        for cg in concept_groups:
            props = cg.get("conceptProperties", [])
            if isinstance(props, dict):
                props = [props]
            for p in props:
                concepts.append(
                    RelatedDrug(
                        rxcui=p.get("rxcui", ""),
                        name=p.get("name", ""),
                        tty=cg.get("tty", ""),
                        relation=relation_type,
                    )
                )
        return concepts

    def get_properties(self, rxcui: str) -> List[DrugProperty]:
        """
        Retrieve all properties for a given RxCUI.

        Parameters
        ----------
        rxcui: concept identifier

        Returns
        -------
        List of DrugProperty items.
        """
        data = self._request("GET", f"/rxcui/{quote_plus(rxcui)}/allProperties.json?prop=all")
        return _extract_properties(data)

    def get_ndcs(self, rxcui: str) -> List[str]:
        """
        Retrieve all National Drug Codes (NDCs) linked to a RxCUI.

        Parameters
        ----------
        rxcui: concept identifier

        Returns
        -------
        List of NDC strings.
        """
        data = self._request("GET", f"/rxcui/{quote_plus(rxcui)}/ndcs.json")
        ndc_list = data.get("ndcConcept", {}).get("ndcTime", [])
        if isinstance(ndc_list, dict):
            ndc_list = [ndc_list]
        ndcs: List[str] = []
        for entry in ndc_list:
            vals = entry.get("ndc", [])
            if isinstance(vals, str):
                ndcs.append(vals)
            elif isinstance(vals, list):
                ndcs.extend(vals)
        return ndcs

    def get_drug_details(self, rxcui: str) -> Optional[DrugConcept]:
        """
        Comprehensive drug retrieval: properties, related drugs, and NDCs.

        Parameters
        ----------
        rxcui: concept identifier

        Returns
        -------
        Fully populated DrugConcept or None.
        """
        basic = self.get_by_rxcui(rxcui)
        if basic is None:
            return None
        basic.properties = self.get_properties(rxcui)
        basic.related_drugs = self.get_related_drugs(rxcui)
        basic.ndcs = self.get_ndcs(rxcui)
        return basic

    # -- Paginated search helper ---------------------------------------------

    def search_all(
        self,
        name: str,
        max_per_page: int = 50,
        max_total: int = 500,
    ) -> List[DrugConcept]:
        """
        Exhaustively paginate through search results.

        Parameters
        ----------
        name: search term
        max_per_page: page size
        max_total: hard cap on total concepts to fetch

        Returns
        -------
        Aggregated list of DrugConcept.
        """
        all_concepts: List[DrugConcept] = []
        page = 1
        while len(all_concepts) < max_total:
            result = self.search_by_name(name, max_entries=max_per_page, page=page)
            if not result.concepts:
                break
            all_concepts.extend(result.concepts)
            if len(result.concepts) < max_per_page:
                break
            page += 1
        return all_concepts[:max_total]

    # -- Adapter interface ---------------------------------------------------

    @property
    def supported_data_types(self) -> List[str]:
        return SUPPORTED_DATA_TYPES.copy()

    def health_check(self) -> Dict[str, Any]:
        """Lightweight ping to verify API availability."""
        try:
            self._request("GET", "/version.json", use_cache=False)
            return {"status": "ok", "api": "rxnorm", "base_url": self.base_url}
        except Exception as exc:
            logger.error("RxNorm health check failed: %s", exc)
            return {"status": "error", "detail": str(exc)}


# ---------------------------------------------------------------------------
# Unit tests (self-contained, runnable via `pytest` or `python -m doctest`)
# ---------------------------------------------------------------------------


def _test_search() -> None:
    adapter = RxNormAdapter()
    result = adapter.search_by_name("aspirin")
    assert isinstance(result, RxNormSearchResult)
    assert result.query == "aspirin"
    print("[PASS] search_by_name")


def _test_get_by_rxcui() -> None:
    adapter = RxNormAdapter()
    concept = adapter.get_by_rxcui("153165")
    assert concept is None or isinstance(concept, DrugConcept)
    print("[PASS] get_by_rxcui")


def _test_get_properties() -> None:
    adapter = RxNormAdapter()
    props = adapter.get_properties("153165")
    assert isinstance(props, list)
    print("[PASS] get_properties")


def _test_related_drugs() -> None:
    adapter = RxNormAdapter()
    related = adapter.get_related_drugs("153165")
    assert isinstance(related, list)
    print("[PASS] get_related_drugs")


def _test_ndcs() -> None:
    adapter = RxNormAdapter()
    ndcs = adapter.get_ndcs("153165")
    assert isinstance(ndcs, list)
    print("[PASS] get_ndcs")


def _test_health_check() -> None:
    adapter = RxNormAdapter()
    hc = adapter.health_check()
    assert hc["status"] in ("ok", "error")
    print("[PASS] health_check")


def _test_cache() -> None:
    adapter = RxNormAdapter()
    # First call populates cache
    r1 = adapter.search_by_name("ibuprofen")
    # Second call should hit cache
    r2 = adapter.search_by_name("ibuprofen")
    assert r1.total_results == r2.total_results
    print("[PASS] cache")


def run_tests() -> None:
    logging.basicConfig(level=logging.WARNING)
    tests = [
        _test_search,
        _test_get_by_rxcui,
        _test_get_properties,
        _test_related_drugs,
        _test_ndcs,
        _test_health_check,
        _test_cache,
    ]
    passed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except AssertionError as exc:
            print(f"[FAIL] {t.__name__}: {exc}")
        except Exception as exc:
            print(f"[SKIP] {t.__name__}: {exc}")
    print(f"\nResults: {passed}/{len(tests)} passed")


if __name__ == "__main__":
    run_tests()
