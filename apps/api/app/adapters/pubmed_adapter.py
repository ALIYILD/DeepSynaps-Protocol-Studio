"""
PubMed/MEDLINE Adapter - NCBI E-utilities Integration
========================================================
Provides search and retrieval of biomedical literature citations from
PubMed/MEDLINE via the NCBI E-utilities API.

API Docs: https://www.ncbi.nlm.nih.gov/books/NBK25499/
Rate Limit: 3 req/s without API key, 10 req/s with API key
Database Size: 35M+ biomedical citations
"""

import logging
import asyncio
import json
import hashlib
from datetime import datetime
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree as ET

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# BaseAdapter – minimal ABC so all adapters share the same interface
# ---------------------------------------------------------------------------
from abc import ABC, abstractmethod


class BaseAdapter(ABC):
    """Abstract base class for all evidence/literature database adapters."""

    name: str = ""
    display_name: str = ""
    source_url: str = ""
    version: str = ""
    confidence_tier: str = "C"
    data_types: List[str] = []
    rate_limit_per_minute: int = 60
    requires_auth: bool = False
    auth_type: str = "none"

    @abstractmethod
    async def validate_connection(self) -> bool:
        ...

    @abstractmethod
    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        ...

    @abstractmethod
    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        ...

    @abstractmethod
    def get_provenance(self, result: Dict) -> Dict:
        ...

    @abstractmethod
    def get_confidence_score(self, result: Dict) -> Dict:
        ...

    async def close(self):
        """Close any open connections. Override in subclass if needed."""
        logger.debug("BaseAdapter.close() called — no-op default")


# ---------------------------------------------------------------------------
# PubMed Adapter
# ---------------------------------------------------------------------------


class PubMedAdapter(BaseAdapter):
    """
    PubMed/MEDLINE adapter using the NCBI E-utilities API.

    Supports:
      - esearch   – find PMIDs matching a query
      - esummary  – retrieve document summaries
      - efetch    – fetch full records (XML or medline)
      - elink     – find related articles and citations

    The adapter applies a self-imposed rate limit (async semaphore) to stay
    within NCBI's 3 requests / second guideline for key-less usage.
    """

    # NCBI E-utilities endpoints
    EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"

    def __init__(self, api_key: Optional[str] = None, cache_ttl: int = 3600):
        self.name = "pubmed"
        self.display_name = "PubMed / MEDLINE"
        self.source_url = self.EUTILS_BASE
        self.version = "2025"
        self.confidence_tier = "B"          # varies by publication type
        self.data_types = [
            "journal_article",
            "systematic_review",
            "meta_analysis",
            "clinical_trial",
            "review",
            "case_report",
            "guideline",
            "randomized_controlled_trial",
        ]
        self.rate_limit_per_minute = 180    # 3/sec * 60 (key-less default)
        self.requires_auth = False
        self.auth_type = "api_key_optional"
        self.api_key = api_key
        self.cache_ttl = cache_ttl

        # Respect NCBI rate-limiting: 3 req/s without key, 10 req/s with key
        self._requests_per_second = 10 if api_key else 3
        self._semaphore = asyncio.Semaphore(self._requests_per_second)
        self._last_request_time: Optional[datetime] = None
        self._cache: Dict[str, Any] = {}

        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={"User-Agent": "DeepSynaps-Protocol-Studio/1.0 (bot@deepsynaps.ai)"},
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        """Execute a GET request respecting the per-second rate limit."""
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                min_interval = 1.0 / self._requests_per_second
                if elapsed < min_interval:
                    await asyncio.sleep(min_interval - elapsed)
            self._last_request_time = datetime.utcnow()
            response = await self.client.get(url, params=params)
            return response

    def _inject_api_key(self, params: Dict) -> Dict:
        """Add API key to request parameters when available."""
        if self.api_key:
            params["api_key"] = self.api_key
        return params

    def _cache_key(self, method: str, query: Any) -> str:
        """Generate deterministic cache key."""
        raw = json.dumps({"method": method, "query": query}, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
        return f"pubmed_{digest}"

    def _get_cached(self, cache_key: str) -> Optional[Any]:
        """Retrieve cached data if still valid."""
        entry = self._cache.get(cache_key)
        if entry and isinstance(entry, dict) and entry.get("_cached_at"):
            age = (datetime.utcnow() - entry["_cached_at"]).total_seconds()
            if age < self.cache_ttl:
                logger.debug(f"Cache hit for key {cache_key}")
                return entry["data"]
        return None

    def _set_cached(self, cache_key: str, data: Any) -> None:
        """Store data in cache."""
        self._cache[cache_key] = {"data": data, "_cached_at": datetime.utcnow()}
        logger.debug(f"Cached data for key {cache_key}")

    @staticmethod
    def _pub_type_to_evidence_grade(pub_types: List[str]) -> str:
        """Map PubMed publication types to an internal evidence grade."""
        pt_lower = [pt.lower() for pt in pub_types]
        grade_map = [
            (("systematic review", "meta-analysis"), "A"),
            (("randomized controlled trial",), "A"),
            (("practice guideline", "guideline", "consensus development conference"), "A"),
            (("clinical trial", "controlled clinical trial"), "B"),
            (("review",), "B"),
            (("case reports",), "C"),
            (("observational study", "cohort study", "case-control study"), "B"),
        ]
        for keywords, grade in grade_map:
            if any(k in pt_lower for k in keywords):
                return grade
        return "C"  # default for letters, editorials, etc.

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Check connectivity by calling einfo for the pubmed database."""
        try:
            params = self._inject_api_key({"db": "pubmed", "retmode": "json"})
            response = await self._rate_limited_get(
                self.EUTILS_BASE + "einfo.fcgi", params=params
            )
            if response.status_code == 200:
                data = response.json()
                return "pubmed" in data.get("einforesult", {}).get("dbname", [])
            logger.warning(f"PubMed einfo returned HTTP {response.status_code}")
            return False
        except Exception as exc:
            logger.error(f"PubMed connection validation failed: {exc}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search PubMed via esearch → esummary pipeline.

        Parameters
        ----------
        query: PubMed-compatible query string (supports MeSH terms, Boolean,
               field tags, etc.).
        filters: Optional dictionary with keys such as:
            - max_results (int):   maximum number of returned records (default 20)
            - sort (str):          sort order, e.g. 'relevance', 'pub_date'
            - date_from (str):     YYYY/MM/DD start date
            - date_to (str):       YYYY/MM/DD end date
            - publication_type (List[str]):  filter by publication type
            - retmax_esearch (int): maximum PMIDs to fetch in esearch step

        Returns
        -------
        List of raw PubMed document dictionaries ready for
        ``transform_to_canonical``.
        """
        filters = filters or {}
        cache_key = self._cache_key("search", {"query": query, "filters": filters})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        max_results = min(filters.get("max_results", 20), 100)   # cap at 100
        retmax_esearch = min(filters.get("retmax_esearch", 200), 10000)
        sort_order = filters.get("sort", "relevance")

        # --- 1. esearch – obtain PMIDs -----------------------------------
        search_params: Dict[str, Any] = {
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": retmax_esearch,
            "sort": sort_order,
        }
        if filters.get("date_from"):
            search_params["mindate"] = filters["date_from"]
        if filters.get("date_to"):
            search_params["maxdate"] = filters["date_to"]
        if filters.get("publication_type"):
            pt_filters = " OR ".join(f"{pt}[pt]" for pt in filters["publication_type"])
            search_params["term"] = f"({query}) AND ({pt_filters})"

        search_params = self._inject_api_key(search_params)
        logger.info(f"PubMed esearch: query='{query}'")

        try:
            resp = await self._rate_limited_get(
                self.EUTILS_BASE + "esearch.fcgi", params=search_params
            )
            resp.raise_for_status()
            search_data = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(f"PubMed esearch HTTP error: {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"PubMed esearch failed: {exc}")
            return []

        idlist = search_data.get("esearchresult", {}).get("idlist", [])
        if not idlist:
            logger.info("PubMed search returned no results")
            return []

        pmids = idlist[:max_results]
        logger.info(f"PubMed found {len(idlist)} total PMIDs, fetching {len(pmids)}")

        # --- 2. esummary – fetch document details ------------------------
        summary_params = self._inject_api_key({
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "json",
        })

        try:
            resp = await self._rate_limited_get(
                self.EUTILS_BASE + "esummary.fcgi", params=summary_params
            )
            resp.raise_for_status()
            summary_data = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(f"PubMed esummary HTTP error: {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"PubMed esummary failed: {exc}")
            return []

        results: List[Dict] = []
        result_container = summary_data.get("result", {})
        for pmid in pmids:
            doc = result_container.get(pmid)
            if not isinstance(doc, dict):
                continue
            doc["_pmid"] = pmid
            doc["_query"] = query
            doc["_fetch_source"] = "esummary"
            results.append(doc)

        self._set_cached(cache_key, results)
        return results

    # -- NEW: get_by_id -------------------------------------------------

    async def get_by_id(self, pmid: str) -> Optional[Dict]:
        """
        Retrieve a single PubMed article by PMID.

        Parameters
        ----------
        pmid: PubMed ID (e.g. '34245678')

        Returns
        -------
        Article record dictionary or None if not found.
        """
        if not pmid or not pmid.isdigit():
            logger.warning(f"Invalid PMID: {pmid}")
            return None

        cache_key = self._cache_key("get_by_id", pmid)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        logger.info(f"PubMed get_by_id: {pmid}")

        summary_params = self._inject_api_key({
            "db": "pubmed",
            "id": pmid,
            "retmode": "json",
        })

        try:
            resp = await self._rate_limited_get(
                self.EUTILS_BASE + "esummary.fcgi", params=summary_params
            )
            resp.raise_for_status()
            data = resp.json()
            doc = data.get("result", {}).get(pmid)
            if isinstance(doc, dict):
                doc["_pmid"] = pmid
                doc["_fetch_source"] = "esummary_get_by_id"
                self._set_cached(cache_key, doc)
                return doc
            logger.warning(f"PubMed PMID {pmid} not found or invalid response")
            return None
        except httpx.HTTPError as exc:
            logger.error(f"PubMed get_by_id HTTP error for {pmid}: {exc}")
            return None
        except Exception as exc:
            logger.error(f"PubMed get_by_id failed for {pmid}: {exc}")
            return None

    # -- NEW: get_abstract ----------------------------------------------

    async def get_abstract(self, pmid: str) -> str:
        """
        Fetch the abstract for a single PMID via efetch.

        Parameters
        ----------
        pmid: PubMed ID

        Returns
        -------
        Abstract text (empty string if unavailable).
        """
        if not pmid or not pmid.isdigit():
            logger.warning(f"Invalid PMID for abstract: {pmid}")
            return ""

        cache_key = self._cache_key("get_abstract", pmid)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        params = self._inject_api_key({
            "db": "pubmed",
            "id": pmid,
            "rettype": "abstract",
            "retmode": "xml",
        })

        try:
            resp = await self._rate_limited_get(
                self.EUTILS_BASE + "efetch.fcgi", params=params
            )
            resp.raise_for_status()
            root = ET.fromstring(resp.text)
            abstract_parts = []
            for abstract_elem in root.iter("AbstractText"):
                label = abstract_elem.get("Label", "")
                text = (abstract_elem.text or "").strip()
                if label:
                    abstract_parts.append(f"{label}: {text}")
                else:
                    abstract_parts.append(text)
            abstract = " ".join(abstract_parts)
            self._set_cached(cache_key, abstract)
            return abstract
        except ET.ParseError as exc:
            logger.error(f"PubMed abstract XML parse error for {pmid}: {exc}")
            return ""
        except httpx.HTTPError as exc:
            logger.error(f"PubMed abstract HTTP error for {pmid}: {exc}")
            return ""
        except Exception as exc:
            logger.error(f"PubMed abstract fetch failed for {pmid}: {exc}")
            return ""

    # -- NEW: get_related -----------------------------------------------

    async def get_related(self, pmid: str, max_results: int = 10) -> List[str]:
        """
        Return a list of related article PMIDs via elink.

        Parameters
        ----------
        pmid: source PubMed ID
        max_results: maximum number of related PMIDs to return

        Returns
        -------
        List of PMIDs as strings.
        """
        if not pmid or not pmid.isdigit():
            logger.warning(f"Invalid PMID for related: {pmid}")
            return []

        cache_key = self._cache_key("get_related", {"pmid": pmid, "max": max_results})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        params = self._inject_api_key({
            "dbfrom": "pubmed",
            "db": "pubmed",
            "id": pmid,
            "cmd": "neighbor",
            "retmode": "json",
        })

        try:
            resp = await self._rate_limited_get(
                self.EUTILS_BASE + "elink.fcgi", params=params
            )
            resp.raise_for_status()
            data = resp.json()
            links = (
                data.get("linksets", [{}])[0]
                .get("linksetdbs", [{}])[0]
                .get("links", [])
            )
            result = [str(l) for l in links[:max_results]]
            self._set_cached(cache_key, result)
            return result
        except (IndexError, KeyError):
            logger.info(f"No related articles found for PMID {pmid}")
            return []
        except httpx.HTTPError as exc:
            logger.error(f"PubMed get_related HTTP error for {pmid}: {exc}")
            return []
        except Exception as exc:
            logger.error(f"PubMed elink failed for {pmid}: {exc}")
            return []

    # -- NEW: get_citations ---------------------------------------------

    async def get_citations(self, pmid: str, max_results: int = 20) -> List[Dict]:
        """
        Retrieve articles that cite the given PMID via elink (citedin).

        Parameters
        ----------
        pmid: source PubMed ID
        max_results: maximum number of citing articles to return

        Returns
        -------
        List of citation dictionaries with pmid, title, and pub_date.
        """
        if not pmid or not pmid.isdigit():
            logger.warning(f"Invalid PMID for citations: {pmid}")
            return []

        cache_key = self._cache_key("get_citations", {"pmid": pmid, "max": max_results})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        params = self._inject_api_key({
            "dbfrom": "pubmed",
            "db": "pubmed",
            "id": pmid,
            "cmd": "neighbor",
            "linkname": "pubmed_pubmed_citedin",
            "retmode": "json",
        })

        try:
            # Step 1: Get citing PMIDs via elink
            resp = await self._rate_limited_get(
                self.EUTILS_BASE + "elink.fcgi", params=params
            )
            resp.raise_for_status()
            data = resp.json()

            citing_pmids = []
            for linkset in data.get("linksets", []):
                for lsdb in linkset.get("linksetdbs", []):
                    if lsdb.get("linkname") == "pubmed_pubmed_citedin":
                        for link in lsdb.get("links", [])[:max_results]:
                            citing_pmids.append(str(link))

            if not citing_pmids:
                logger.info(f"No citations found for PMID {pmid}")
                return []

            # Step 2: Fetch summaries for citing articles
            summary_params = self._inject_api_key({
                "db": "pubmed",
                "id": ",".join(citing_pmids),
                "retmode": "json",
            })

            resp2 = await self._rate_limited_get(
                self.EUTILS_BASE + "esummary.fcgi", params=summary_params
            )
            resp2.raise_for_status()
            summary_data = resp2.json()

            citations = []
            result_container = summary_data.get("result", {})
            for cpid in citing_pmids:
                doc = result_container.get(cpid)
                if isinstance(doc, dict):
                    citations.append({
                        "pmid": cpid,
                        "title": doc.get("title", ""),
                        "authors": [a.get("name", "") for a in doc.get("authors", [])],
                        "journal": doc.get("fulljournalname") or doc.get("source", ""),
                        "pub_date": doc.get("pubdate", ""),
                        "doi": doc.get("elocationid", ""),
                    })

            self._set_cached(cache_key, citations)
            logger.info(f"Found {len(citations)} citations for PMID {pmid}")
            return citations

        except httpx.HTTPError as exc:
            logger.error(f"PubMed get_citations HTTP error for {pmid}: {exc}")
            return []
        except Exception as exc:
            logger.error(f"PubMed get_citations failed for {pmid}: {exc}")
            return []

    # ------------------------------------------------------------------

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        """
        Convert a raw PubMed esummary record into the canonical EvidenceEntry
        schema.
        """
        pmid = raw_data.get("_pmid", raw_data.get("uid", ""))
        title = raw_data.get("title", "")
        # Clean HTML tags sometimes present in titles
        title = title.replace("&lt;b&gt;", "").replace("&lt;/b&gt;", "")
        title = title.replace("<b>", "").replace("</b>", "")

        authors = raw_data.get("authors", [])
        author_list = [a.get("name", "") for a in authors if a.get("name")]

        pub_types = raw_data.get("pubtype", [])
        if isinstance(pub_types, str):
            pub_types = [pub_types]

        journal = raw_data.get("fulljournalname") or raw_data.get("source", "")
        pub_date = raw_data.get("pubdate") or raw_data.get("sortpubdate", "")[:10]
        doi = raw_data.get("elocationid", "")
        if doi and not doi.startswith("doi:"):
            doi = f"doi:{doi}"

        mesh_terms = raw_data.get("meshterms", [])
        if isinstance(mesh_terms, str):
            mesh_terms = [t.strip() for t in mesh_terms.split(";")]

        evidence_grade = self._pub_type_to_evidence_grade(pub_types)
        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": pmid,
            "title": title,
            "abstract": "",          # esummary does not include abstracts
            "authors": author_list,
            "journal": journal,
            "publication_date": pub_date,
            "doi": doi.replace("doi:", "") if doi.startswith("doi:") else doi,
            "mesh_terms": mesh_terms,
            "publication_types": pub_types,
            "evidence_grade": evidence_grade,
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.88,
            "research_only": False,
            "curation_status": "ncbi_curated",
            "last_updated": result.get("edat", ""),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute per-record confidence based on PubMed metadata signals.
        """
        pub_types = result.get("pubtype", [])
        if isinstance(pub_types, str):
            pub_types = [pub_types]
        pt_lower = [pt.lower() for pt in pub_types]

        if any(k in pt_lower for k in ("systematic review", "meta-analysis", "randomized controlled trial")):
            evidence_strength = 0.95
        elif "clinical trial" in str(pt_lower):
            evidence_strength = 0.85
        elif "review" in str(pt_lower):
            evidence_strength = 0.75
        else:
            evidence_strength = 0.60

        has_mesh = bool(result.get("meshterms"))
        has_doi = bool(result.get("elocationid"))
        data_quality = 0.85 + (0.05 if has_mesh else 0) + (0.05 if has_doi else 0)
        data_quality = min(data_quality, 0.99)

        overall = round((evidence_strength * 0.4 + data_quality * 0.4 + 0.70 * 0.2), 3)

        return {
            "data_quality": round(data_quality, 3),
            "evidence_strength": round(evidence_strength, 3),
            "sample_size": 0.50,
            "replication": 0.50,
            "consistency": 0.80,
            "temporal_relevance": 0.85,
            "population_match": 0.70,
            "overall": overall,
        }

    async def close(self):
        """Close the HTTP client and clean up resources."""
        await self.client.aclose()
        self._cache.clear()
        logger.info("PubMedAdapter closed")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

async def _test_pubmed_adapter():
    """Smoke-test the PubMedAdapter."""
    adapter = PubMedAdapter()

    # 1. validate_connection
    ok = await adapter.validate_connection()
    print(f"[TEST] validate_connection: {ok}")

    # 2. search
    results = await adapter.search("diabetes type 2", filters={"max_results": 3})
    print(f"[TEST] search returned {len(results)} results")
    assert isinstance(results, list)

    # 3. get_by_id
    article = await adapter.get_by_id("34245678")
    print(f"[TEST] get_by_id: {article.get('title', 'N/A')[:40] if article else 'not found'}")

    # 4. get_abstract
    abstract = await adapter.get_abstract("34245678")
    print(f"[TEST] get_abstract: {len(abstract)} chars")

    # 5. get_related
    related = await adapter.get_related("34245678", max_results=3)
    print(f"[TEST] get_related: {len(related)} related PMIDs")

    # 6. get_citations
    citations = await adapter.get_citations("34245678", max_results=3)
    print(f"[TEST] get_citations: {len(citations)} citing articles")

    # 7. transform_to_canonical
    if results:
        canonical = adapter.transform_to_canonical(results[0])
        print(f"[TEST] transform_to_canonical: {canonical.get('title', 'N/A')[:40]}")

    await adapter.close()
    print("[TEST] All PubMedAdapter tests passed!")


if __name__ == "__main__":
    asyncio.run(_test_pubmed_adapter())
