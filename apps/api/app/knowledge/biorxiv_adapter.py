"""
bioRxiv/medRxiv Adapter - Preprint Server
===========================================
Provides access to bioRxiv and medRxiv preprint servers,
indexing 300K+ preprints across life sciences and medicine.

API: https://api.biorxiv.org/ (REST API)
Confidence tier: C (preprints are not peer-reviewed)
"""

import logging
import asyncio
import re
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
# bioRxiv/medRxiv Adapter
# ---------------------------------------------------------------------------


class BioRxivAdapter(BaseAdapter):
    """
    Adapter for bioRxiv and medRxiv preprint servers.

    Servers:
      - bioRxiv: biology and life sciences preprints
      - medRxiv: health sciences and clinical research preprints

    API endpoints:
      - /details/{server}/{doi} – retrieve preprint by DOI
      - /pub/{date_range} – list preprints published in date range
      - /pub/{server}/{date_range} – server-specific date listing

    Where {server} is one of: biorxiv, medrxiv
    {date_range} format: YYYY-MM-DD/YYYY-MM-DD (max 100 days)

    Preprints are NOT peer-reviewed. They represent preliminary research
    reports that have not undergone formal peer review.

    Subject areas include:
      - Animal Behavior and Cognition
      - Biochemistry
      - Bioengineering
      - Bioinformatics
      - Biophysics
      - Cancer Biology
      - Cell Biology
      - Clinical Trials
      - Developmental Biology
      - Ecology
      - Epidemiology
      - Evolutionary Biology
      - Genetics
      - Genomics
      - Immunology
      - Microbiology
      - Molecular Biology
      - Neuroscience
      - Paleontology
      - Pathology
      - Pharmacology and Toxicology
      - Physiology
      - Plant Biology
      - Scientific Communication and Education
      - Systems Biology
      - Zoology
      - Allergy and Immunology
      - Cardiovascular Medicine
      - Critical Care and Emergency Medicine
      - Dentistry and Oral Medicine
      - Dermatology
      - Endocrinology
      - Epidemiology (medRxiv)
      - Forensic Medicine
      - Gastroenterology
      - Geriatric Medicine
      - Health Economics
      - Health Informatics
      - Health Policy
      - Health Systems and Quality Improvement
      - Hematology
      - HIV/AIDS
      - Infectious Diseases
      - Intensive Care and Critical Care Medicine
      - Medical Education
      - Medical Ethics
      - Nephrology
      - Neurology
      - Nursing
      - Nutrition
      - Obstetrics and Gynecology
      - Occupational and Environmental Health
      - Oncology
      - Ophthalmology
      - Orthopedics
      - Otolaryngology
      - Pain Medicine
      - Palliative Medicine
      - Pathology (medRxiv)
      - Pediatrics
      - Primary Care Research
      - Psychiatry
      - Public and Global Health
      - Radiology and Imaging
      - Rehabilitation Medicine and Physical Therapy
      - Respiratory Medicine
      - Rheumatology
      - Sexual and Reproductive Health
      - Sports Medicine
      - Surgery
      - Transplantation
      - Urology
    """

    API_BASE = "https://api.biorxiv.org"
    WEB_BASES = {
        "biorxiv": "https://www.biorxiv.org",
        "medrxiv": "https://www.medrxiv.org",
    }

    # Preprint subject areas by server
    SUBJECT_AREAS = {
        "biorxiv": [
            "Animal Behavior and Cognition",
            "Biochemistry",
            "Bioengineering",
            "Bioinformatics",
            "Biophysics",
            "Cancer Biology",
            "Cell Biology",
            "Clinical Trials",
            "Developmental Biology",
            "Ecology",
            "Epidemiology",
            "Evolutionary Biology",
            "Genetics",
            "Genomics",
            "Immunology",
            "Microbiology",
            "Molecular Biology",
            "Neuroscience",
            "Paleontology",
            "Pathology",
            "Pharmacology and Toxicology",
            "Physiology",
            "Plant Biology",
            "Scientific Communication and Education",
            "Systems Biology",
            "Zoology",
        ],
        "medrxiv": [
            "Allergy and Immunology",
            "Anesthesia",
            "Cardiovascular Medicine",
            "Critical Care and Emergency Medicine",
            "Dentistry and Oral Medicine",
            "Dermatology",
            "Endocrinology",
            "Epidemiology",
            "Forensic Medicine",
            "Gastroenterology",
            "Geriatric Medicine",
            "Health Economics",
            "Health Informatics",
            "Health Policy",
            "Health Systems and Quality Improvement",
            "Hematology",
            "HIV/AIDS",
            "Infectious Diseases",
            "Intensive Care and Critical Care Medicine",
            "Medical Education",
            "Medical Ethics",
            "Nephrology",
            "Neurology",
            "Nursing",
            "Nutrition",
            "Obstetrics and Gynecology",
            "Occupational and Environmental Health",
            "Oncology",
            "Ophthalmology",
            "Orthopedics",
            "Otolaryngology",
            "Pain Medicine",
            "Palliative Medicine",
            "Pathology",
            "Pediatrics",
            "Primary Care Research",
            "Psychiatry",
            "Public and Global Health",
            "Radiology and Imaging",
            "Rehabilitation Medicine and Physical Therapy",
            "Respiratory Medicine",
            "Rheumatology",
            "Sexual and Reproductive Health",
            "Sports Medicine",
            "Surgery",
            "Transplantation",
            "Urology",
        ],
    }

    def __init__(self, api_key: Optional[str] = None):
        self.name = "biorxiv"
        self.display_name = "bioRxiv / medRxiv"
        self.source_url = self.API_BASE
        self.version = "2025"
        self.confidence_tier = "C"  # preprints, not peer-reviewed
        self.data_types = [
            "preprint",
            "life_sciences_preprint",
            "clinical_preprint",
            "unreviewed_manuscript",
        ]
        self.rate_limit_per_minute = 60  # 1/sec to be respectful
        self.requires_auth = False
        self.auth_type = "none"
        self.api_key = api_key

        self._semaphore = asyncio.Semaphore(1)
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
        """Execute a GET request with rate limiting (1/sec for preprint servers)."""
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                if elapsed < 1.0:
                    await asyncio.sleep(1.0 - elapsed)
            self._last_request_time = datetime.utcnow()
            response = await self.client.get(url, params=params)
            return response

    def _detect_server(self, raw: Dict) -> str:
        """Detect whether a preprint is from bioRxiv or medRxiv."""
        server = raw.get("server") or raw.get("journaltitle") or raw.get("journal", "")
        if "medrxiv" in server.lower():
            return "medrxiv"
        return "biorxiv"  # default

    def _build_preprint_url(self, doi: str, server: str = "biorxiv") -> str:
        """Build the canonical URL for a preprint."""
        if not doi:
            return ""
        base = self.WEB_BASES.get(server, self.WEB_BASES["biorxiv"])
        # DOI format: 10.1101/YYYY.MM.DD.XXXXXX
        clean_doi = doi.replace("doi:", "").strip()
        return f"{base}/content/{clean_doi}"

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate by checking bioRxiv and medRxiv APIs."""
        for server in ["biorxiv", "medrxiv"]:
            try:
                yesterday = datetime.now().strftime("%Y-%m-%d")
                week_ago = datetime.now().strftime("%Y-%m-%d")
                resp = await self._rate_limited_get(
                    f"{self.API_BASE}/pub/{server}/{week_ago}/{yesterday}",
                    params={"limit": 1},
                )
                if resp.status_code == 200:
                    logger.info(f"{server} API validated")
                    return True
                logger.warning(f"{server} returned HTTP {resp.status_code}")
            except Exception as exc:
                logger.error(f"{server} connection validation failed: {exc}")
                continue
        return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search bioRxiv/medRxiv for preprints.

        Parameters
        ----------
        query: Topic, gene, disease, or keyword.
        filters: Optional dictionary with keys:
            - max_results (int):     maximum results, default 20, max 100
            - server (str):          'biorxiv', 'medrxiv', or 'both' (default)
            - date_from (str):       YYYY-MM-DD start date
            - date_to (str):         YYYY-MM-DD end date
            - subject_area (str):    subject area / category filter
            - doi (str):             specific DOI lookup
            - collection (str):      collection name

        Returns
        -------
        List of raw preprint dictionaries.
        """
        filters = filters or {}
        max_results = min(filters.get("max_results", 20), 100)

        # If DOI is provided, use direct lookup
        if filters.get("doi"):
            return await self._search_by_doi(filters["doi"], filters.get("server", "biorxiv"))

        # Use date range search
        date_from = filters.get("date_from", "")
        date_to = filters.get("date_to", "")

        if not date_from or not date_to:
            # Default to last 90 days
            from datetime import timedelta
            date_to = datetime.now().strftime("%Y-%m-%d")
            date_from = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")

        server = filters.get("server", "both").lower()

        if server == "both":
            # Search both servers
            results: List[Dict] = []
            for srv in ["biorxiv", "medrxiv"]:
                srv_results = await self._search_by_date_range(
                    query, srv, date_from, date_to, filters, max_results // 2 + 1
                )
                results.extend(srv_results)
            # Sort by date and limit
            results.sort(key=lambda x: x.get("date", ""), reverse=True)
            return results[:max_results]
        else:
            return await self._search_by_date_range(
                query, server, date_from, date_to, filters, max_results
            )

    async def _search_by_doi(self, doi: str, server: str) -> List[Dict]:
        """Search for a specific preprint by DOI."""
        try:
            clean_doi = doi.replace("doi:", "").replace("https://doi.org/", "").strip()
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/details/{server}/{clean_doi}"
            )
            if resp.status_code == 200:
                data = resp.json()
                collection = data.get("collection", [])
                if isinstance(collection, list):
                    for item in collection:
                        item["_query"] = doi
                        item["_fetch_source"] = "biorxiv"
                        item["server"] = server
                    return collection
                elif isinstance(collection, dict):
                    collection["_query"] = doi
                    collection["_fetch_source"] = "biorxiv"
                    collection["server"] = server
                    return [collection]
            elif resp.status_code == 404:
                logger.info(f"Preprint not found: {doi}")
                return []
            else:
                logger.warning(f"DOI search HTTP {resp.status_code} for {doi}")
                return []
        except Exception as exc:
            logger.error(f"DOI search failed for {doi}: {exc}")
            return []

    async def _search_by_date_range(
        self, query: str, server: str, date_from: str, date_to: str,
        filters: Dict, max_results: int
    ) -> List[Dict]:
        """Search preprints published within a date range."""
        try:
            # bioRxiv API uses YYYY-MM-DD/YYYY-MM-DD format for date ranges
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/pub/{server}/{date_from}/{date_to}",
                params={"limit": max_results},
            )
            if resp.status_code == 200:
                data = resp.json()
                collection = data.get("collection", [])
                if isinstance(collection, list):
                    results: List[Dict] = []
                    for item in collection:
                        # Shallow copy to avoid mutating the original
                        entry = dict(item)
                        entry["_query"] = query
                        entry["_fetch_source"] = "biorxiv"
                        entry["server"] = server
                        # Client-side query filtering
                        if self._matches_query(entry, query):
                            results.append(entry)
                    logger.info(f"bioRxiv/{server} returned {len(results)} matching preprints")
                    return results[:max_results]
                return []
            elif resp.status_code == 400:
                logger.warning(f"Invalid date range: {date_from} to {date_to}")
                return []
            else:
                logger.warning(f"Date search HTTP {resp.status_code}")
                return []
        except Exception as exc:
            logger.error(f"Date range search failed: {exc}")
            return []

    def _matches_query(self, item: Dict, query: str) -> bool:
        """Check if a preprint item matches the query string (case-insensitive)."""
        if not query:
            return True
        query_lower = query.lower()
        # Check title
        title = (item.get("title") or "").lower()
        if query_lower in title:
            return True
        # Check abstract
        abstract = (item.get("abstract") or "").lower()
        if query_lower in abstract:
            return True
        # Check authors
        authors = item.get("authors", "")
        if isinstance(authors, str):
            if query_lower in authors.lower():
                return True
        elif isinstance(authors, list):
            for a in authors:
                name = (a.get("name") or "").lower() if isinstance(a, dict) else str(a).lower()
                if query_lower in name:
                    return True
        # Check subject area / category
        category = (item.get("category") or item.get("subject_area") or "").lower()
        if query_lower in category:
            return True
        # Check DOI
        doi = (item.get("doi") or "").lower()
        if query_lower in doi:
            return True
        return False

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        """
        Convert a raw bioRxiv/medRxiv preprint into the canonical EvidenceEntry.
        """
        doi = raw_data.get("doi") or raw_data.get("DOI", "")
        # Normalize DOI
        clean_doi = doi.replace("doi:", "").replace("https://doi.org/", "").strip()

        title = raw_data.get("title") or ""
        # Decode HTML entities
        import html as _html
        title = _html.unescape(title)

        # Abstract
        abstract = raw_data.get("abstract") or ""
        abstract = _html.unescape(abstract)

        # Authors
        authors_data = raw_data.get("authors") or raw_data.get("author", "")
        author_list: List[str] = []
        if isinstance(authors_data, str):
            # Comma-separated author string
            author_list = [a.strip() for a in authors_data.split(";") if a.strip()]
            if not author_list:
                author_list = [a.strip() for a in authors_data.split(",") if a.strip()]
        elif isinstance(authors_data, list):
            for a in authors_data:
                if isinstance(a, str):
                    author_list.append(a)
                elif isinstance(a, dict):
                    name = a.get("name") or ""
                    if not name:
                        name = f"{a.get('given', '')} {a.get('family', '')}".strip()
                    if name:
                        author_list.append(name)

        # Server and journal
        server = self._detect_server(raw_data)
        journal = raw_data.get("journaltitle") or raw_data.get("journal", server)

        # Dates
        pub_date = raw_data.get("date") or raw_data.get("published", "")
        version = raw_data.get("version") or raw_data.get("preprint_version", "1")
        if isinstance(version, (int, float)):
            version = str(int(version))

        # Subject area / category
        category = raw_data.get("category") or raw_data.get("subject_area") or ""

        # Type
        preprint_type = raw_data.get("type") or raw_data.get("document_type", "preprint")

        # URL
        url = raw_data.get("url") or raw_data.get("URL", "")
        if not url and clean_doi:
            url = self._build_preprint_url(clean_doi, server)

        # Full text URL
        full_text_url = raw_data.get("full_text_url") or raw_data.get("content_url", "")

        # License
        license_type = raw_data.get("license") or raw_data.get("license_type", "")

        # Has been peer-reviewed / published
        is_published = bool(raw_data.get("published_doi") or raw_data.get("journal_doi"))
        published_doi = raw_data.get("published_doi") or raw_data.get("journal_doi", "")

        # Server-specific URL
        server_url = self.WEB_BASES.get(server, self.WEB_BASES["biorxiv"])

        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": clean_doi if clean_doi else str(raw_data.get("id", "")),
            "title": title,
            "abstract": abstract,
            "authors": author_list,
            "journal": journal,
            "publication_date": pub_date,
            "doi": clean_doi,
            "version": version,
            "server": server,
            "category": category,
            "preprint_type": preprint_type,
            "is_preprint": True,
            "peer_reviewed": False,
            "is_published": is_published,
            "published_doi": published_doi,
            "license": license_type,
            "has_full_text": bool(full_text_url),
            "full_text_url": full_text_url,
            "evidence_grade": "C",  # preprints are not peer-reviewed
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": url,
            "server_url": server_url,
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for a bioRxiv/medRxiv preprint."""
        server = self._detect_server(result)
        license_type = result.get("license") or result.get("license_type", "")
        version = result.get("version") or "1"
        if isinstance(version, (int, float)):
            version = str(int(version))
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.65,
            "research_only": True,
            "curation_status": "preprint_unreviewed",
            "server": server,
            "preprint_version": version,
            "peer_reviewed": False,
            "license": license_type,
            "open_access": True,  # bioRxiv/medRxiv are OA by default
            "has_corresponding_published_article": bool(
                result.get("published_doi") or result.get("journal_doi")
            ),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute confidence score for a preprint.

        Preprints get lower confidence due to lack of peer review.
        Preprints that have been subsequently published score higher.
        medRxiv preprints with clinical focus get slightly higher scores.
        """
        server = self._detect_server(result)
        has_published_version = bool(result.get("published_doi") or result.get("journal_doi"))
        version = result.get("version") or "1"
        try:
            version_num = int(str(version))
        except (ValueError, TypeError):
            version_num = 1

        # Evidence strength
        if has_published_version:
            evidence_strength = 0.72  # published versions validated
        elif server == "medrxiv":
            evidence_strength = 0.55  # medRxiv has some screening
        else:
            evidence_strength = 0.50  # biorxiv - minimal screening

        # Data quality
        data_quality = 0.65
        if has_published_version:
            data_quality += 0.15
        if version_num > 1:
            data_quality += 0.03  # updated versions

        # Preprints lack peer review validation
        sample_size = 0.55
        replication = 0.35
        consistency = 0.50
        temporal_relevance = 0.88  # preprints are very current
        population_match = 0.65

        overall = round(
            (evidence_strength * 0.25
             + data_quality * 0.25
             + sample_size * 0.08
             + replication * 0.07
             + consistency * 0.10
             + temporal_relevance * 0.15
             + population_match * 0.10),
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

    async def fetch_preprint_by_doi(self, doi: str, server: str = "biorxiv") -> Optional[Dict]:
        """
        Retrieve a specific preprint by DOI.

        Parameters
        ----------
        doi: Preprint DOI (e.g., '10.1101/2024.01.15.123456')
        server: 'biorxiv' or 'medrxiv'

        Returns
        -------
        Preprint dictionary or None.
        """
        try:
            clean_doi = doi.replace("doi:", "").replace("https://doi.org/", "").strip()
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/details/{server}/{clean_doi}"
            )
            if resp.status_code == 200:
                data = resp.json()
                collection = data.get("collection", [])
                if isinstance(collection, list) and collection:
                    item = collection[0]
                    item["_fetch_source"] = "biorxiv_detail"
                    item["server"] = server
                    return item
                elif isinstance(collection, dict):
                    collection["_fetch_source"] = "biorxiv_detail"
                    collection["server"] = server
                    return collection
                return None
            elif resp.status_code == 404:
                logger.info(f"Preprint not found: {doi}")
                return None
            else:
                logger.warning(f"Preprint detail HTTP {resp.status_code} for {doi}")
                return None
        except Exception as exc:
            logger.error(f"fetch_preprint_by_doi failed for {doi}: {exc}")
            return None

    async def fetch_preprints_by_date(
        self, date_from: str, date_to: str, server: str = "biorxiv"
    ) -> List[Dict]:
        """
        Retrieve preprints published in a date range.

        Parameters
        ----------
        date_from: Start date YYYY-MM-DD
        date_to: End date YYYY-MM-DD (max 100 day range)
        server: 'biorxiv' or 'medrxiv'

        Returns
        -------
        List of preprint dictionaries.
        """
        try:
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/pub/{server}/{date_from}/{date_to}",
                params={"limit": 100},
            )
            if resp.status_code == 200:
                data = resp.json()
                collection = data.get("collection", [])
                if isinstance(collection, list):
                    for item in collection:
                        item["server"] = server
                        item["_fetch_source"] = "biorxiv"
                    return collection
                return []
            logger.warning(f"Date fetch HTTP {resp.status_code}")
            return []
        except Exception as exc:
            logger.error(f"fetch_preprints_by_date failed: {exc}")
            return []

    async def get_subject_areas(self, server: str = "both") -> Dict[str, List[str]]:
        """Return subject areas for bioRxiv and/or medRxiv."""
        if server == "both":
            return self.SUBJECT_AREAS.copy()
        return {server: self.SUBJECT_AREAS.get(server, [])}

    async def close(self):
        await self.client.aclose()
