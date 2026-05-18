"""
Europe PMC Adapter - Biomedical Literature Search
=================================================
Provides access to Europe PMC, a database of 40M+ biomedical articles
including PubMed content plus additional open-access literature.

* API Base: https://www.ebi.ac.uk/europepmc/webservices/rest/
* Documentation: https://europepmc.org/RestfulWebService
* Rate Limit: ~1,000 requests / minute (no key required)
* Full-text available for open-access articles
* Confidence tier: B
"""

import logging
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# BaseAdapter
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
        pass


# ---------------------------------------------------------------------------
# Europe PMC Adapter
# ---------------------------------------------------------------------------


class EuropePMCAdapter(BaseAdapter):
    """
    Adapter for the Europe PMC RESTful Web Services API.

    Endpoints used:
      - /search        – search publications
      - /profile       – database information
      - /references    – citation references for a publication
      - /citations     – publications citing a given article

    Europe PMC covers:
      - PubMed / MEDLINE (~35M records)
      - PMC open-access full-text (~9M records)
      - Additional content from Agricola, Europe PMC Funders, etc.
    """

    API_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest"

    def __init__(self, api_key: Optional[str] = None):
        self.name = "europepmc"
        self.display_name = "Europe PMC"
        self.source_url = "https://www.ebi.ac.uk/europepmc/"
        self.version = "2025"
        self.confidence_tier = "B"
        self.data_types = [
            "journal_article",
            "preprint",
            "review",
            "book",
            "clinical_guideline",
            "database",
            "patent",
        ]
        self.rate_limit_per_minute = 1000   # generous limit from EBI
        self.requires_auth = False
        self.auth_type = "api_key_optional"
        self.api_key = api_key

        # Conservative: allow 10 concurrent but rate-spaced
        self._semaphore = asyncio.Semaphore(10)
        self._last_request_time: Optional[datetime] = None
        self._min_interval = 0.06           # ~16 req/s max

        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (bot@deepsynaps.ai)",
                "Accept": "application/json",
            },
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        """Execute a GET request respecting the internal rate limit."""
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                if elapsed < self._min_interval:
                    await asyncio.sleep(self._min_interval - elapsed)
            self._last_request_time = datetime.utcnow()
            response = await self.client.get(url, params=params)
            return response

    def _format_date(self, date_str: str) -> str:
        """Normalise Europe PMC date strings to ISO-8601 (YYYY-MM-DD)."""
        if not date_str:
            return ""
        # Europe PMC returns dates like '2023-01-15', '2023-01', or '2023'
        parts = date_str.split("-")
        if len(parts) == 3:
            return date_str
        elif len(parts) == 2:
            return f"{date_str}-01"
        elif len(parts) == 1 and parts[0].isdigit():
            return f"{parts[0]}-01-01"
        return date_str

    @staticmethod
    def _pub_type_to_evidence_grade(pub_type: str) -> str:
        """Map Europe PMC publication type to evidence grade."""
        pt = pub_type.lower() if pub_type else ""
        grade_map = {
            "review": "B",
            "clinical trial": "A",
            "randomized controlled trial": "A",
            "meta-analysis": "A",
            "systematic review": "A",
            "book": "C",
            "preprint": "C",
            "research article": "B",
            "guideline": "A",
        }
        return grade_map.get(pt, "B")

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate by calling the /profile endpoint."""
        try:
            response = await self._rate_limited_get(f"{self.API_BASE}/profile")
            if response.status_code == 200:
                data = response.json()
                databases = data.get("databases", [])
                if any("pubmed" in db.get("name", "").lower() for db in databases):
                    logger.info("Europe PMC profile validated – PubMed source available")
                    return True
                return True  # endpoint works even if structure differs
            logger.warning(f"Europe PMC profile returned HTTP {response.status_code}")
            return False
        except Exception as exc:
            logger.error(f"Europe PMC connection validation failed: {exc}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search Europe PMC for biomedical literature.

        Parameters
        ----------
        query: Search query string (supports fielded search, Boolean logic).
        filters: Optional dictionary with keys:
            - max_results (int):     page size, default 25, max 1000
            - sort (str):            'Date' or 'Relevance' (default)
            - date_from (str):       YYYY-MM-DD start date
            - date_to (str):         YYYY-MM-DD end date
            - author (str):          filter by author name
            - journal (str):         filter by journal title
            - publication_type (str): filter by publication type
            - has_ft (bool):         only open-access with full text
            - is_cited (bool):       only cited articles
            - page (int):            result page number (1-based)
            - result_type (str):     'core' (default), 'idlist', 'ids'

        Returns
        -------
        List of raw Europe PMC result dictionaries.
        """
        filters = filters or {}
        page_size = min(filters.get("max_results", 25), 1000)
        page = max(1, filters.get("page", 1))
        sort = filters.get("sort", "Relevance")

        params: Dict[str, Any] = {
            "query": query,
            "pageSize": page_size,
            "page": page,
            "sort": sort,
            "format": "json",
            "resultType": filters.get("result_type", "core"),
        }

        # Add date range if provided
        date_from = filters.get("date_from", "")
        date_to = filters.get("date_to", "")
        if date_from or date_to:
            # Europe PMC uses FIRST_PDATE for publication date filtering in query
            date_parts = []
            if date_from:
                date_parts.append(f"{date_from}")
            if date_to:
                date_parts.append(f"{date_to}")
            date_filter = "[\"" + " TO ".join(date_parts) + "\"]"
            params["query"] = f'({query}) AND FIRST_PDATE:{date_filter}'

        if filters.get("author"):
            params["query"] = f'({params["query"]}) AND AUTH:\"{filters["author"]}\"'
        if filters.get("journal"):
            params["query"] = f'({params["query"]}) AND JOURNAL:\"{filters["journal"]}\"'
        if filters.get("publication_type"):
            params["query"] = f'({params["query"]}) AND PUB_TYPE:\"{filters["publication_type"]}\"'

        logger.info(f"Europe PMC search: query='{query}'")

        try:
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/search", params=params
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(f"Europe PMC HTTP error {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"Europe PMC search failed: {exc}")
            return []

        results = data.get("resultList", {}).get("result", [])
        for r in results:
            r["_query"] = query
            r["_fetch_source"] = "europepmc_search"

        logger.info(f"Europe PMC returned {len(results)} results")
        return results

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        """
        Convert a raw Europe PMC result into the canonical EvidenceEntry.
        """
        pmid = raw_data.get("pmid", "")
        pmcid = raw_data.get("pmcid", "")
        doi = raw_data.get("doi", "")
        source_id = doi or pmid or pmcid or raw_data.get("id", "")

        title = raw_data.get("title", "")
        # Strip XML tags that Europe PMC sometimes includes
        title = title.replace("<em>", "").replace("</em>", "")
        title = title.replace("<b>", "").replace("</b>", "")

        authors = []
        author_list = raw_data.get("authorList", {}).get("author", [])
        if isinstance(author_list, dict):
            author_list = [author_list]
        for a in author_list:
            full_name = a.get("fullName", "")
            if not full_name and a.get("lastName"):
                full_name = f"{a.get('firstName', '')} {a.get('lastName', '')}".strip()
            if full_name:
                authors.append(full_name)

        journal_info = raw_data.get("journalInfo", {})
        journal = journal_info.get("journal", {}).get("title", "") or raw_data.get("journalTitle", "")
        pub_date = self._format_date(raw_data.get("firstPublicationDate", "") or raw_data.get("pubYear", ""))
        pub_type = raw_data.get("pubType", "")

        abstract = raw_data.get("abstractText", "")
        has_ft = raw_data.get("hasFT", "N") == "Y"
        is_open_access = raw_data.get("isOpenAccess", "N") == "Y"
        in_epmc = raw_data.get("inEPMC", "N") == "Y"
        in_pmc = raw_data.get("inPMC", "N") == "Y"

        mesh_terms = []
        mesh_headings = raw_data.get("meshHeadingList", {}).get("meshHeading", [])
        if isinstance(mesh_headings, dict):
            mesh_headings = [mesh_headings]
        for mh in mesh_headings:
            descriptor = mh.get("descriptorName", "")
            if descriptor:
                mesh_terms.append(descriptor)

        evidence_grade = self._pub_type_to_evidence_grade(pub_type)
        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": source_id,
            "pmid": pmid,
            "pmcid": pmcid,
            "title": title,
            "abstract": abstract,
            "authors": authors,
            "journal": journal,
            "publication_date": pub_date,
            "doi": doi,
            "mesh_terms": mesh_terms,
            "publication_type": pub_type,
            "evidence_grade": evidence_grade,
            "has_full_text": has_ft,
            "is_open_access": is_open_access,
            "in_epmc": in_epmc,
            "in_pmc": in_pmc,
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": f"https://europepmc.org/article/MED/{pmid}" if pmid else (
                f"https://europepmc.org/articles/{pmcid}" if pmcid else ""
            ),
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.85,
            "research_only": False,
            "curation_status": "ebi_curated",
            "has_full_text": result.get("hasFT", "N") == "Y",
            "is_open_access": result.get("isOpenAccess", "N") == "Y",
            "last_updated": result.get("firstPublicationDate", ""),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute confidence score based on Europe PMC metadata signals.
        """
        pub_type = result.get("pubType", "").lower()
        has_ft = result.get("hasFT", "N") == "Y"
        is_oa = result.get("isOpenAccess", "N") == "Y"
        is_cited = bool(result.get("citedByCount", 0))
        citation_count = result.get("citedByCount", 0) or 0

        # Evidence strength
        if "systematic review" in pub_type or "meta-analysis" in pub_type:
            evidence_strength = 0.95
        elif "randomized controlled trial" in pub_type:
            evidence_strength = 0.92
        elif "clinical trial" in pub_type:
            evidence_strength = 0.85
        elif "review" in pub_type:
            evidence_strength = 0.75
        else:
            evidence_strength = 0.70

        # Data quality – indexed in multiple databases, has full text
        data_quality = 0.82
        if has_ft:
            data_quality += 0.05
        if is_oa:
            data_quality += 0.03
        if result.get("inEPMC") == "Y":
            data_quality += 0.03
        if result.get("meshHeadingList"):
            data_quality += 0.02

        # Replication via citation count
        if citation_count >= 100:
            replication = 0.90
        elif citation_count >= 20:
            replication = 0.80
        elif citation_count >= 5:
            replication = 0.70
        elif is_cited:
            replication = 0.60
        else:
            replication = 0.45

        sample_size = 0.50       # not directly available
        consistency = 0.78
        temporal_relevance = 0.82
        population_match = 0.70

        overall = round(
            (evidence_strength * 0.25
             + data_quality * 0.25
             + sample_size * 0.10
             + replication * 0.15
             + consistency * 0.10
             + temporal_relevance * 0.08
             + population_match * 0.07),
            3,
        )

        return {
            "data_quality": round(data_quality, 3),
            "evidence_strength": round(evidence_strength, 3),
            "sample_size": round(sample_size, 3),
            "replication": round(replication, 3),
            "consistency": round(consistency, 3),
            "temporal_relevance": round(temporal_relevance, 3),
            "population_match": round(population_match, 3),
            "overall": overall,
        }

    # ------------------------------------------------------------------
    # Extended helpers
    # ------------------------------------------------------------------

    async def fetch_references(self, pmid: str) -> List[Dict]:
        """
        Retrieve the reference list for a given PMID.

        Parameters
        ----------
        pmid: PubMed identifier

        Returns
        -------
        List of reference dictionaries (title, authors, citationId).
        """
        try:
            params = {"format": "json", "pageSize": "100"}
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/references/MED/{pmid}", params=params
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("referenceList", {}).get("reference", [])
            return []
        except Exception as exc:
            logger.error(f"Europe PMC references fetch failed for {pmid}: {exc}")
            return []

    async def fetch_citations(self, pmid: str) -> List[Dict]:
        """
        Retrieve publications that cite the given PMID.

        Parameters
        ----------
        pmid: PubMed identifier

        Returns
        -------
        List of citing publication dictionaries.
        """
        try:
            params = {"format": "json", "pageSize": "100"}
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/citations/MED/{pmid}", params=params
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("citationList", {}).get("citation", [])
            return []
        except Exception as exc:
            logger.error(f"Europe PMC citations fetch failed for {pmid}: {exc}")
            return []

    async def fetch_fulltext(self, pmcid: str) -> str:
        """
        Fetch the full-text XML of an open-access article by its PMCID.

        Parameters
        ----------
        pmcid: PMC identifier (e.g. 'PMC1234567')

        Returns
        -------
        Full-text XML as a string (empty if unavailable).
        """
        try:
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/{pmcid}/fullTextXML"
            )
            if resp.status_code == 200:
                return resp.text
            logger.warning(f"Europe PMC full-text HTTP {resp.status_code} for {pmcid}")
            return ""
        except Exception as exc:
            logger.error(f"Europe PMC full-text fetch failed for {pmcid}: {exc}")
            return ""

    async def close(self):
        await self.client.aclose()
