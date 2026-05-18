"""
NICE Evidence Adapter - UK Clinical Guidelines
===============================================
Provides access to NICE (National Institute for Health and Care Excellence)
guidelines, technology appraisals, and interventional procedures.

* Website: https://www.nice.org.uk/guidance
* Evidence API: https://www.evidence.nhs.uk/
* Open access to UK national clinical guidelines
* Confidence tier: A (national guidelines)
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
# NICE Evidence Adapter
# ---------------------------------------------------------------------------


class NICEAdapter(BaseAdapter):
    """
    Adapter for NICE (National Institute for Health and Care Excellence).

    NICE publishes:
      - Clinical Guidelines (CG) – recommendations for care
      - Technology Appraisals (TA) – evaluations of treatments
      - Interventional Procedures (IP) – safety/efficacy of procedures
      - Diagnostics Guidance (DG)
      - Medical Technologies Guidance (MTG)
      - Highly Specialised Technologies (HST)

    This adapter uses the public NICE API and search endpoints.
    """

    API_BASE = "https://www.nice.org.uk/api"
    GUIDANCE_URL = "https://www.nice.org.uk/guidance"
    EVIDENCE_API = "https://www.evidence.nhs.uk/api"

    # Mapping of NICE guidance types to internal codes
    GUIDANCE_TYPES = {
        "cg": "Clinical guideline",
        "ta": "Technology appraisal",
        "ip": "Interventional procedures",
        "dg": "Diagnostics guidance",
        "mtg": "Medical technologies guidance",
        "hst": "Highly specialised technologies",
        "es": "Evidence summary",
        "qs": "Quality standard",
        "ph": "Public health guideline",
        "ng": "NICE guideline",
    }

    def __init__(self, api_key: Optional[str] = None):
        self.name = "nice"
        self.display_name = "NICE Evidence"
        self.source_url = "https://www.nice.org.uk/"
        self.version = "2025"
        self.confidence_tier = "A"          # national guidelines
        self.data_types = [
            "clinical_guideline",
            "technology_appraisal",
            "interventional_procedure",
            "diagnostics_guidance",
            "evidence_summary",
            "quality_standard",
        ]
        self.rate_limit_per_minute = 120    # ~2/sec
        self.requires_auth = False
        self.auth_type = "api_key_optional"
        self.api_key = api_key

        self._semaphore = asyncio.Semaphore(3)
        self._last_request_time: Optional[datetime] = None

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
        """Execute a GET request with rate limiting."""
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                if elapsed < 0.5:           # 2 req/s max
                    await asyncio.sleep(0.5 - elapsed)
            self._last_request_time = datetime.utcnow()
            response = await self.client.get(url, params=params)
            return response

    @staticmethod
    def _extract_guidance_type(nice_id: str) -> str:
        """Infer guidance type from the NICE identifier prefix."""
        if not nice_id:
            return "guideline"
        prefix = nice_id.lower().split(" ")[0] if " " in nice_id else nice_id.lower()[:2]
        return NICEAdapter.GUIDANCE_TYPES.get(prefix, "guideline")

    @staticmethod
    def _nice_id_to_url(nice_id: str, guidance_type: str = "") -> str:
        """Build the canonical NICE URL for a guidance document."""
        if not nice_id:
            return ""
        gt = guidance_type.lower()
        if gt in NICEAdapter.GUIDANCE_TYPES:
            return f"https://www.nice.org.uk/guidance/{nice_id.lower().replace(' ', '-')}"  
        return f"https://www.nice.org.uk/guidance/{nice_id.lower().replace(' ', '-')}"

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate by checking the NICE guidance homepage."""
        try:
            response = await self._rate_limited_get("https://www.nice.org.uk/guidance")
            if response.status_code == 200:
                logger.info("NICE guidance homepage validated")
                return True
            logger.warning(f"NICE homepage returned HTTP {response.status_code}")
            return False
        except Exception as exc:
            logger.error(f"NICE connection validation failed: {exc}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search NICE guidance and evidence.

        Parameters
        ----------
        query: Condition, intervention, or topic keyword.
        filters: Optional dictionary with keys:
            - max_results (int):     maximum results, default 20, max 100
            - guidance_type (str):   'cg', 'ta', 'ip', 'dg', 'ng', etc.
            - status (str):          'published', 'indevelopment', 'discontinued'
            - date_from (str):       YYYY-MM-DD
            - date_to (str):         YYYY-MM-DD
            - technology (str):      specific technology name
            - sort (str):            'date' or 'relevance'
            - api_source (str):      'nice' or 'evidence_nhs' (default 'nice')

        Returns
        -------
        List of raw NICE guidance / evidence dictionaries.
        """
        filters = filters or {}
        max_results = min(filters.get("max_results", 20), 100)
        api_source = filters.get("api_source", "nice")

        if api_source == "evidence_nhs":
            return await self._search_evidence_nhs(query, filters, max_results)
        return await self._search_nice_api(query, filters, max_results)

    async def _search_nice_api(self, query: str, filters: Dict, max_results: int) -> List[Dict]:
        """Search using the NICE public guidance API / search endpoint."""
        params: Dict[str, Any] = {
            "q": query,
            "len": max_results,
            "from": 0,
        }

        if filters.get("guidance_type"):
            params["type"] = filters["guidance_type"]
        if filters.get("status"):
            params["status"] = filters["status"]
        if filters.get("sort"):
            params["sort"] = filters["sort"]
        else:
            params["sort"] = "relevance"

        logger.info(f"NICE search: query='{query}', filters={filters}")

        try:
            # NICE provides a search endpoint that returns JSON
            resp = await self._rate_limited_get(
                "https://www.nice.org.uk/guidance/published", params=params
            )
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")

            if "application/json" in content_type:
                data = resp.json()
                results = data if isinstance(data, list) else data.get("results", data.get("documents", []))
            else:
                # Parse HTML search results
                results = self._parse_nice_html(resp.text, query, max_results)

        except httpx.HTTPStatusError as exc:
            logger.error(f"NICE search HTTP error {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"NICE search failed: {exc}")
            return []

        for r in results:
            r["_query"] = query
            r["_fetch_source"] = "nice_guidance"

        logger.info(f"NICE returned {len(results)} results")
        return results

    async def _search_evidence_nhs(self, query: str, filters: Dict, max_results: int) -> List[Dict]:
        """Search using the NHS Evidence API."""
        params: Dict[str, Any] = {
            "q": query,
            "count": max_results,
        }

        if filters.get("guidance_type"):
            params["type"] = filters["guidance_type"]
        if filters.get("date_from"):
            params["dateFrom"] = filters["date_from"]
        if filters.get("date_to"):
            params["dateTo"] = filters["date_to"]

        logger.info(f"NHS Evidence search: query='{query}'")

        try:
            resp = await self._rate_limited_get(
                f"{self.EVIDENCE_API}/search", params=params
            )
            resp.raise_for_status()
            data = resp.json()
            results = data if isinstance(data, list) else data.get("results", [])
        except httpx.HTTPStatusError as exc:
            logger.error(f"NHS Evidence HTTP error {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"NHS Evidence search failed: {exc}")
            return []

        for r in results:
            r["_query"] = query
            r["_fetch_source"] = "evidence_nhs"

        return results

    def _parse_nice_html(self, html_text: str, query: str, max_results: int) -> List[Dict]:
        """
        Parse structured guidance data from NICE HTML search results.

        Uses regex-based extraction of known NICE HTML patterns.
        In production this would use BeautifulSoup.
        """
        import re
        results: List[Dict] = []

        # Look for guidance document patterns
        # Pattern 1: data-doi or data-id attributes
        doc_pattern = re.compile(
            r'<article[^>]*data-id="([^"]+)"[^>]*>.*?<h[^>]*>(.*?)</h[^>]*>.*?</article>',
            re.DOTALL | re.IGNORECASE,
        )
        matches = doc_pattern.findall(html_text)

        for doc_id, title_html in matches[:max_results]:
            title = re.sub(r'<[^>]+>', '', title_html).strip()
            guidance_type = self._extract_guidance_type(doc_id)
            results.append({
                "id": doc_id,
                "title": title,
                "guidanceType": guidance_type,
                "url": self._nice_id_to_url(doc_id, guidance_type),
                "datePublished": "",
                "status": "published",
            })

        # Pattern 2: JSON-LD structured data
        if not results:
            jsonld_pattern = re.compile(
                r'<script type="application/ld\+json">(.*?)</script>', re.DOTALL
            )
            for match in jsonld_pattern.findall(html_text):
                try:
                    import json as _json
                    item = _json.loads(match)
                    if isinstance(item, dict) and item.get("@type") in ("MedicalWebPage", "Article"):
                        results.append({
                            "id": item.get("identifier", ""),
                            "title": item.get("name") or item.get("headline", ""),
                            "guidanceType": "guideline",
                            "url": item.get("url", ""),
                            "datePublished": item.get("datePublished", ""),
                            "status": "published",
                        })
                except Exception:
                    continue
                if len(results) >= max_results:
                    break

        # Pattern 3: Simple link extraction
        if not results:
            link_pattern = re.compile(
                r'href="(/guidance/[^"]+)"[^>]*>(.*?)</a>', re.IGNORECASE
            )
            for url_path, title_html in link_pattern.findall(html_text)[:max_results]:
                title = re.sub(r'<[^>]+>', '', title_html).strip()
                if title and "guidance" in url_path.lower():
                    doc_id = url_path.split("/")[-1]
                    results.append({
                        "id": doc_id,
                        "title": title,
                        "guidanceType": self._extract_guidance_type(doc_id),
                        "url": f"https://www.nice.org.uk{url_path}",
                        "datePublished": "",
                        "status": "published",
                    })

        return results[:max_results]

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        """
        Convert a raw NICE guidance result into the canonical EvidenceEntry.
        """
        nice_id = raw_data.get("id") or raw_data.get("identifier", "")
        title = raw_data.get("title") or raw_data.get("name", "")
        guidance_type = raw_data.get("guidanceType") or self._extract_guidance_type(nice_id)
        url = raw_data.get("url") or self._nice_id_to_url(nice_id, guidance_type)

        # Abstract / summary
        abstract = raw_data.get("summary") or raw_data.get("description") or raw_data.get("abstract", "")

        # Authors / committee
        authors = []
        committee = raw_data.get("committee", {})
        if isinstance(committee, dict):
            committee_name = committee.get("name", "")
            if committee_name:
                authors.append(committee_name)

        # Publication date
        pub_date = raw_data.get("datePublished") or raw_data.get("publishedDate") or raw_data.get("date", "")
        last_updated = raw_data.get("dateUpdated") or raw_data.get("lastUpdated", "")
        status = raw_data.get("status") or raw_data.get("publicationState", "published")

        # Recommendation categories from NICE
        recommendations = raw_data.get("recommendations", [])
        if isinstance(recommendations, dict):
            recommendations = [recommendations]

        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": nice_id,
            "title": title,
            "abstract": abstract,
            "authors": authors,
            "guidance_type": guidance_type,
            "guidance_type_label": NICEAdapter.GUIDANCE_TYPES.get(guidance_type.lower(), guidance_type),
            "publication_date": pub_date,
            "last_updated": last_updated,
            "status": status,
            "recommendations": recommendations,
            "evidence_grade": "A",
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": url,
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.95,
            "research_only": False,
            "curation_status": "nice_national_guideline",
            "guidance_type": result.get("guidanceType", "guideline"),
            "last_updated": result.get("dateUpdated") or result.get("lastUpdated", ""),
            "uk_national_recommendation": True,
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute confidence score for NICE guidance.

        NICE guidelines are systematically developed national recommendations
        based on comprehensive evidence reviews.
        """
        guidance_type = (result.get("guidanceType") or "").lower()
        status = (result.get("status") or result.get("publicationState", "")).lower()
        has_recommendations = bool(result.get("recommendations"))

        # Evidence strength – NICE guidelines are top-tier
        if "technology appraisal" in guidance_type or "ta" in guidance_type:
            evidence_strength = 0.97
        elif "clinical" in guidance_type or "ng" in guidance_type or "cg" in guidance_type:
            evidence_strength = 0.96
        elif "interventional" in guidance_type or "ip" in guidance_type:
            evidence_strength = 0.94
        elif "diagnostics" in guidance_type or "dg" in guidance_type:
            evidence_strength = 0.93
        else:
            evidence_strength = 0.95

        # Data quality – based on systematic review foundation
        data_quality = 0.95 if has_recommendations else 0.90
        if status == "published":
            data_quality += 0.02

        # NICE guidelines are regularly updated
        sample_size = 0.85     # reflects broad evidence base
        replication = 0.90     # based on multiple studies
        consistency = 0.94
        temporal_relevance = 0.88 if status == "published" else 0.70
        population_match = 0.80  # UK-focused but widely applicable

        overall = round(
            (evidence_strength * 0.30
             + data_quality * 0.25
             + sample_size * 0.10
             + replication * 0.10
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

    async def fetch_guidance_detail(self, nice_id: str) -> Optional[Dict]:
        """
        Retrieve detailed information for a specific NICE guidance document.

        Parameters
        ----------
        nice_id: NICE guidance identifier (e.g. 'CG159', 'TA678', 'NG28')

        Returns
        -------
        Detailed guidance dictionary or None.
        """
        try:
            normalized_id = nice_id.upper().strip()
            url = f"https://www.nice.org.uk/guidance/{normalized_id}"
            resp = await self._rate_limited_get(url)
            if resp.status_code == 200:
                # Check for JSON response
                content_type = resp.headers.get("content-type", "")
                if "application/json" in content_type:
                    return resp.json()
                # Extract structured data from HTML
                return self._extract_detail_from_html(resp.text, normalized_id)
            elif resp.status_code == 404:
                logger.info(f"NICE guidance not found: {normalized_id}")
                return None
            else:
                logger.warning(f"NICE detail HTTP {resp.status_code} for {normalized_id}")
                return None
        except Exception as exc:
            logger.error(f"NICE fetch_guidance_detail failed for {nice_id}: {exc}")
            return None

    def _extract_detail_from_html(self, html_text: str, nice_id: str) -> Dict:
        """Extract structured guidance details from NICE HTML page."""
        import re
        import json as _json

        result: Dict[str, Any] = {
            "id": nice_id,
            "guidanceType": self._extract_guidance_type(nice_id),
            "url": f"https://www.nice.org.uk/guidance/{nice_id}",
            "title": "",
            "summary": "",
            "datePublished": "",
            "dateUpdated": "",
            "status": "published",
            "recommendations": [],
        }

        # Extract title
        title_match = re.search(r'<title>(.*?)</title>', html_text, re.IGNORECASE | re.DOTALL)
        if title_match:
            result["title"] = title_match.group(1).strip().split(" | ")[0]

        # Extract JSON-LD
        jsonld_pattern = re.compile(
            r'<script type="application/ld\+json">(.*?)</script>', re.DOTALL
        )
        for match in jsonld_pattern.findall(html_text):
            try:
                item = _json.loads(match)
                if isinstance(item, dict):
                    result["title"] = result["title"] or item.get("name", "")
                    result["datePublished"] = item.get("datePublished", "")
                    result["dateUpdated"] = item.get("dateModified", "")
            except Exception:
                continue

        # Extract meta description as summary
        desc_match = re.search(
            r'<meta name="description" content="([^"]+)"', html_text, re.IGNORECASE
        )
        if desc_match:
            result["summary"] = desc_match.group(1)

        return result

    async def get_guidance_types(self) -> List[Dict]:
        """Return a list of available NICE guidance types with descriptions."""
        return [
            {"code": code, "name": name}
            for code, name in self.GUIDANCE_TYPES.items()
        ]

    async def close(self):
        await self.client.aclose()
