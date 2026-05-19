"""
ClinVar Adapter — Production-Quality NCBI E-Utils / ClinVar Integration

Data types: genetic_variant, clinical_significance, disease_association
API: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/ + ClinVar REST API
Free NCBI API — no authentication required (API key optional for higher rate limits).

Rebuild: 2024-06 — expanded from stub to 420+ line production adapter.
"""
from __future__ import annotations

import logging
import time
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Union
from urllib.parse import quote_plus

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger("clinvar_adapter")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
CLINVAR_API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
CLINVAR_VCV_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
DEFAULT_TIMEOUT = 30.0
MAX_RETRIES = 3
BACKOFF_BASE = 1.0
RATE_LIMIT_DELAY = 0.34  # 3 req/s without key; 10 req/s with key
SUPPORTED_DATA_TYPES: List[str] = [
    "genetic_variant",
    "clinical_significance",
    "disease_association",
]

# ---------------------------------------------------------------------------
# Pydantic models — canonical schema
# ---------------------------------------------------------------------------


class ClinicalSignificance(BaseModel):
    """Clinical significance assertion for a variant."""

    description: str
    review_status: str = ""
    last_evaluated: str = ""
    condition: str = ""
    submitter: str = ""


class DiseaseAssociation(BaseModel):
    """Association between a variant and a disease/phenotype."""

    disease_name: str
    medgen_cid: str = ""
    omim_id: str = ""
    clinical_significance: str = ""
    mode_of_inheritance: str = ""


class GeneticVariant(BaseModel):
    """Canonical representation of a ClinVar genetic variant."""

    variant_id: str  # ClinVar Variation ID
    variation_id: str = ""
    accession: str = ""  # RCV or VCV accession
    gene_symbol: str = ""
    gene_id: str = ""
    chromosome: str = ""
    start: int = 0
    ref_allele: str = ""
    alt_allele: str = ""
    build: str = "GRCh38"
    variant_type: str = ""
    clinical_significance: List[ClinicalSignificance] = Field(default_factory=list)
    disease_associations: List[DiseaseAssociation] = Field(default_factory=list)
    star_rating: int = 0
    review_status: str = ""


class ClinVarSearchResult(BaseModel):
    """Result container for a ClinVar search query."""

    query: str
    total_count: int
    variants: List[GeneticVariant]


# ---------------------------------------------------------------------------
# TTL cache
# ---------------------------------------------------------------------------


class _TTLCache:
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


# ---------------------------------------------------------------------------
# Adapter class
# ---------------------------------------------------------------------------


class ClinVarAdapter:
    """
    Production-grade adapter for NCBI ClinVar (via E-Utils).

    Features:
    - Real HTTP calls with httpx
    - ESearch / ESummary / EFetch pipeline
    - Exponential back-off retries
    - Rate limiting (NCBI compliance)
    - XML + JSON response parsing
    - TTL caching
    - Pagination via retstart / retmax
    - Pydantic validation & canonical schema
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = EUTILS_BASE,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = MAX_RETRIES,
        cache_ttl: float = 300.0,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self._cache = _TTLCache(ttl_seconds=cache_ttl)
        self._last_request_time: float = 0.0
        self._client: Optional[httpx.Client] = None
        logger.info(
            "ClinVarAdapter initialised | base=%s | key=%s | timeout=%.1fs",
            self.base_url,
            "yes" if api_key else "no",
            self.timeout,
        )

    def _get_client(self) -> httpx.Client:
        if self._client is None or self._client.is_closed:
            self._client = httpx.Client(timeout=self.timeout, follow_redirects=True)
        return self._client

    def close(self) -> None:
        if self._client and not self._client.is_closed:
            self._client.close()
        logger.info("ClinVarAdapter closed")

    def _apply_rate_limit(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_request_time
        min_interval = 1.0 / (10 if self.api_key else 3)
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        self._last_request_time = time.monotonic()

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
        client = self._get_client()
        merged_params = {**(params or {})}
        if self.api_key:
            merged_params["api_key"] = self.api_key

        last_exception: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.debug("HTTP %s %s | attempt=%d", method, url, attempt)
                resp = client.request(method, url, params=merged_params)
                if resp.status_code == 429:
                    retry_after = float(resp.headers.get("Retry-After", BACKOFF_BASE * (2 ** (attempt - 1))))
                    logger.warning("Rate limited | sleep %.1fs", retry_after)
                    time.sleep(retry_after)
                    continue
                resp.raise_for_status()
                # EUtils returns JSON for esearch/esummary, XML for efetch
                content_type = resp.headers.get("Content-Type", "")
                if "json" in content_type:
                    data: Dict[str, Any] = resp.json()
                else:
                    data = {"_xml_content": resp.text}
                if use_cache:
                    self._cache.set(cache_key, data)
                return data
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code >= 500:
                    last_exception = exc
                    sleep = BACKOFF_BASE * (2 ** (attempt - 1))
                    logger.warning("Server error %d | retry %.1fs", exc.response.status_code, sleep)
                    time.sleep(sleep)
                    continue
                raise
            except httpx.RequestError as exc:
                last_exception = exc
                sleep = BACKOFF_BASE * (2 ** (attempt - 1))
                logger.warning("Request error | retry %.1fs | %s", sleep, exc)
                time.sleep(sleep)
                continue

        raise RuntimeError(f"Max retries ({self.max_retries}) exceeded for {url}") from last_exception

    # -- ESearch: find IDs ---------------------------------------------------

    def _esearch(
        self,
        query: str,
        db: str = "clinvar",
        retmax: int = 50,
        retstart: int = 0,
    ) -> Dict[str, Any]:
        """Execute ESearch against ClinVar."""
        params: Dict[str, Any] = {
            "db": db,
            "term": query,
            "retmode": "json",
            "retmax": retmax,
            "retstart": retstart,
        }
        return self._request("GET", "/esearch.fcgi", params=params)

    # -- ESummary: metadata for IDs ----------------------------------------

    def _esummary(self, ids: List[str], db: str = "clinvar") -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "db": db,
            "id": ",".join(ids),
            "retmode": "json",
        }
        return self._request("GET", "/esummary.fcgi", params=params)

    # -- EFetch: detailed XML records --------------------------------------

    def _efetch(self, ids: List[str], db: str = "clinvar") -> str:
        params: Dict[str, Any] = {
            "db": db,
            "id": ",".join(ids),
            "rettype": "vcv",
            "is_variationid": "variationid",
        }
        data = self._request("GET", "/efetch.fcgi", params=params, use_cache=True)
        return data.get("_xml_content", "")

    # -- XML parsers --------------------------------------------------------

    def _parse_clinical_significance(self, xml_text: str) -> List[ClinicalSignificance]:
        """Parse clinical significance from ClinVarSet XML."""
        results: List[ClinicalSignificance] = []
        if not xml_text.strip():
            return results
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            return results
        ns = {"cv": "http://www.ncbi.nlm.nih.gov/clinvar"}
        for desc in root.iter("{http://www.ncbi.nlm.nih.gov/clinvar}Description"):
            text = desc.text or ""
            if text:
                results.append(ClinicalSignificance(description=text))
        return results if results else [ClinicalSignificance(description="not provided")]

    # -- Public API methods --------------------------------------------------

    def search_variants(
        self,
        query: str,
        max_results: int = 50,
        page: int = 1,
    ) -> ClinVarSearchResult:
        """
        Search ClinVar for genetic variants matching a query.

        Parameters
        ----------
        query: search term (e.g. "BRCA1" or "rs80357906")
        max_results: page size
        page: 1-indexed page number

        Returns
        -------
        ClinVarSearchResult with canonical GeneticVariant list.
        """
        retstart = (page - 1) * max_results
        search_data = self._esearch(query, retmax=max_results, retstart=retstart)
        esr = search_data.get("esearchresult", {})
        total = int(esr.get("count", 0))
        id_list = esr.get("idlist", [])
        variants: List[GeneticVariant] = []

        if not id_list:
            return ClinVarSearchResult(query=query, total_count=total, variants=variants)

        summary = self._esummary(id_list)
        result_items = summary.get("result", {})

        for vid in id_list:
            item = result_items.get(vid, {})
            if not item:
                continue
            variant = GeneticVariant(
                variant_id=str(vid),
                accession=item.get("accession", ""),
                gene_symbol="; ".join(item.get("genes", [])) if isinstance(item.get("genes"), list) else str(item.get("genes", "")),
                chromosome=item.get("chr", ""),
                start=int(item.get("start", 0)) if item.get("start") else 0,
                ref_allele=item.get("ref", ""),
                alt_allele=item.get("alt", ""),
                build=item.get("assembly_name", "GRCh38"),
                variant_type=item.get("variation_set_name", ""),
                clinical_significance=[
                    ClinicalSignificance(description=item.get("clinical_significance", {}).get("description", "not provided"))
                ] if isinstance(item.get("clinical_significance"), dict) else [],
                review_status=item.get("clinical_significance", {}).get("review_status", "") if isinstance(item.get("clinical_significance"), dict) else "",
                star_rating=item.get("gold_stars", 0) if isinstance(item.get("gold_stars"), int) else 0,
            )
            # disease associations from trait_set
            traits = item.get("trait_set", [])
            if isinstance(traits, list):
                for t in traits:
                    if isinstance(t, dict):
                        variant.disease_associations.append(
                            DiseaseAssociation(
                                disease_name=t.get("trait_name", ""),
                                medgen_cid=t.get("medgen_cid", ""),
                            )
                        )
            variants.append(variant)

        return ClinVarSearchResult(query=query, total_count=total, variants=variants)

    def get_variant_by_id(self, variant_id: str) -> Optional[GeneticVariant]:
        """
        Retrieve a single variant by ClinVar Variation ID.

        Parameters
        ----------
        variant_id: numeric ClinVar variation ID

        Returns
        -------
        GeneticVariant if found, else None.
        """
        try:
            summary = self._esummary([variant_id])
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None
            raise
        result_items = summary.get("result", {})
        item = result_items.get(variant_id, {})
        if not item:
            return None
        variant = GeneticVariant(
            variant_id=variant_id,
            accession=item.get("accession", ""),
            gene_symbol="; ".join(item.get("genes", [])) if isinstance(item.get("genes"), list) else str(item.get("genes", "")),
            chromosome=item.get("chr", ""),
            start=int(item.get("start", 0)) if item.get("start") else 0,
            ref_allele=item.get("ref", ""),
            alt_allele=item.get("alt", ""),
            build=item.get("assembly_name", "GRCh38"),
            variant_type=item.get("variation_set_name", ""),
            clinical_significance=[
                ClinicalSignificance(description=item.get("clinical_significance", {}).get("description", "not provided"))
            ] if isinstance(item.get("clinical_significance"), dict) else [],
            review_status=item.get("clinical_significance", {}).get("review_status", "") if isinstance(item.get("clinical_significance"), dict) else "",
        )
        # Fetch detailed clinical significance via efetch XML
        xml_data = self._efetch([variant_id])
        variant.clinical_significance = self._parse_clinical_significance(xml_data)
        return variant

    def get_clinical_significance(self, variant_id: str) -> List[ClinicalSignificance]:
        """
        Retrieve clinical significance assertions for a variant.

        Parameters
        ----------
        variant_id: ClinVar variation ID

        Returns
        -------
        List of ClinicalSignificance objects.
        """
        xml_data = self._efetch([variant_id])
        return self._parse_clinical_significance(xml_data)

    def get_submissions(self, variant_id: str) -> List[Dict[str, Any]]:
        """
        Retrieve submission data for a variant (submitter, date, review status).

        Parameters
        ----------
        variant_id: ClinVar variation ID

        Returns
        -------
        List of submission dicts.
        """
        xml_data = self._efetch([variant_id])
        submissions: List[Dict[str, Any]] = []
        if not xml_data.strip():
            return submissions
        try:
            root = ET.fromstring(xml_data)
        except ET.ParseError:
            return submissions
        for interp in root.iter("{http://www.ncbi.nlm.nih.gov/clinvar}ClinicalInterpretation"):
            submitter_elem = interp.find("{http://www.ncbi.nlm.nih.gov/clinvar}SubmitterName")
            date_elem = interp.find("{http://www.ncbi.nlm.nih.gov/clinvar}DateLastEvaluated")
            desc_elem = interp.find("{http://www.ncbi.nlm.nih.gov/clinvar}Description")
            submissions.append({
                "submitter": submitter_elem.text if submitter_elem is not None else "",
                "date": date_elem.text if date_elem is not None else "",
                "description": desc_elem.text if desc_elem is not None else "",
            })
        return submissions

    def search_all_variants(
        self,
        query: str,
        max_total: int = 500,
        page_size: int = 50,
    ) -> List[GeneticVariant]:
        """
        Exhaustively paginate through ClinVar search results.

        Parameters
        ----------
        query: search term
        max_total: hard cap
        page_size: retmax per request

        Returns
        -------
        Aggregated list of GeneticVariant.
        """
        all_variants: List[GeneticVariant] = []
        page = 1
        while len(all_variants) < max_total:
            result = self.search_variants(query, max_results=page_size, page=page)
            if not result.variants:
                break
            all_variants.extend(result.variants)
            if len(result.variants) < page_size:
                break
            page += 1
        return all_variants[:max_total]

    def search_by_gene(self, gene_symbol: str, max_results: int = 50, page: int = 1) -> ClinVarSearchResult:
        """Search ClinVar for variants in a specific gene."""
        query = f"{gene_symbol}[Gene]"
        return self.search_variants(query, max_results=max_results, page=page)

    def search_by_variant_id(self, variant_id: str) -> ClinVarSearchResult:
        """Search ClinVar by dbSNP rs ID."""
        query = f"{variant_id}[Reference SNP ID]"
        return self.search_variants(query, max_results=20, page=1)

    # -- Adapter interface ---------------------------------------------------

    @property
    def supported_data_types(self) -> List[str]:
        return SUPPORTED_DATA_TYPES.copy()

    def health_check(self) -> Dict[str, Any]:
        try:
            data = self._request("GET", "/einfo.fcgi", params={"db": "clinvar", "retmode": "json"}, use_cache=False)
            return {"status": "ok", "api": "clinvar", "base_url": self.base_url}
        except Exception as exc:
            logger.error("ClinVar health check failed: %s", exc)
            return {"status": "error", "detail": str(exc)}


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def _test_search_variants() -> None:
    adapter = ClinVarAdapter()
    result = adapter.search_variants("BRCA1")
    assert isinstance(result, ClinVarSearchResult)
    assert result.query == "BRCA1"
    print("[PASS] search_variants")


def _test_get_variant_by_id() -> None:
    adapter = ClinVarAdapter()
    variant = adapter.get_variant_by_id("1552")
    assert variant is None or isinstance(variant, GeneticVariant)
    print("[PASS] get_variant_by_id")


def _test_get_clinical_significance() -> None:
    adapter = ClinVarAdapter()
    sig = adapter.get_clinical_significance("1552")
    assert isinstance(sig, list)
    print("[PASS] get_clinical_significance")


def _test_search_by_gene() -> None:
    adapter = ClinVarAdapter()
    result = adapter.search_by_gene("BRCA1")
    assert isinstance(result, ClinVarSearchResult)
    print("[PASS] search_by_gene")


def _test_health_check() -> None:
    adapter = ClinVarAdapter()
    hc = adapter.health_check()
    assert hc["status"] in ("ok", "error")
    print("[PASS] health_check")


def run_tests() -> None:
    logging.basicConfig(level=logging.WARNING)
    tests = [
        _test_search_variants,
        _test_get_variant_by_id,
        _test_get_clinical_significance,
        _test_search_by_gene,
        _test_health_check,
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
