"""
PharmGKB Adapter — Pharmacogenomics Knowledge Base.

Provides normalised access to clinical annotations, drug-gene-variant
relationships, haplotype definitions, and dosing guidelines.  PharmGKB is
CC BY-SA 4.0 licensed and **requires** both an API key and attribution.

API docs: https://api.pharmgkb.org/v1/
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import aiohttp
from aiohttp import ClientTimeout, ClientResponseError

from ..base_adapter import (
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    LicenseMetadata,
    ProvenanceRecord,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "https://api.pharmgkb.org/v1"
DEFAULT_TIMEOUT = ClientTimeout(total=45, connect=15)
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0
REQUESTS_PER_SECOND = 10

# Annotation levels of evidence (1 = highest, 4 = lowest)
ANNOTATION_LEVEL_MAP: Dict[int, str] = {
    1: "Definitive clinical annotation",
    2: "Strong clinical annotation",
    3: "Moderate clinical annotation",
    4: "Provisional / research-level annotation",
}

# Normalised field schema
NORMALIZED_SCHEMA: Dict[str, type] = {
    "gene": str,
    "drug": str,
    "variant": str,
    "annotation_level": int,
    "evidence_level": str,
    "clinical_implication": str,
    "population": str,
    "pmids": list,
    "haplotype": str,
    "guideline_url": str,
}


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class PharmGKBError(Exception):
    """Base exception for PharmGKB adapter errors."""

    pass


class PharmGKBAuthError(PharmGKBError):
    """Raised when the API key is missing, expired, or rejected."""

    pass


class PharmGKBNotFoundError(PharmGKBError):
    """Raised when a queried entity does not exist in PharmGKB."""

    pass


class PharmGKBAPIError(PharmGKBError):
    """Raised on unexpected HTTP status or malformed JSON."""

    pass


class PharmGKBRateLimitError(PharmGKBError):
    """Raised when the PharmGKB API returns HTTP 429."""

    pass


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class PharmGKBAdapter(DatabaseAdapter):
    """Async adapter for the PharmGKB REST API (v1).

    Configuration keys:
        * ``api_key`` — **required** PharmGKB API key.
        * ``base_url`` — override endpoint (default https://api.pharmgkb.org/v1).
        * ``timeout`` — request timeout in seconds (default 45).
        * ``max_retries`` — retry attempts (default 3).
        * ``cache_ttl`` — in-memory cache TTL in seconds (default 86400).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._version: str = self.config.get("version", "v1")
        self._api_key: Optional[str] = self.config.get("api_key")
        if not self._api_key:
            logger.warning("PharmGKB API key not provided — some endpoints may reject requests.")
        self._base_url: str = self.config.get("base_url", BASE_URL).rstrip("/")
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", 45), connect=15
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._cache_ttl: int = self.config.get("cache_ttl", 86_400)
        self._session: Optional[aiohttp.ClientSession] = None
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "PharmGKB"

    @property
    def source_version(self) -> str:
        return self._version

    # -- cache key generation -------------------------------------------------

    def _cache_key(self, endpoint: str, params: Dict[str, Any]) -> str:
        """Generate a deterministic SHA-256 cache key."""
        payload = json.dumps({"endpoint": endpoint, "params": params}, sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    # -- HTTP helpers ---------------------------------------------------------

    async def _enforce_rate_limit(self) -> None:
        """Enforce a polite per-second request cap."""
        now = asyncio.get_event_loop().time()
        min_interval = 1.0 / REQUESTS_PER_SECOND
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Execute an authenticated GET request with retries and caching."""
        params = params or {}
        cache_key = self._cache_key(endpoint, params)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._session is None:
            raise PharmGKBError("HTTP session not initialised — call connect() first.")

        url = f"{self._base_url}{endpoint}"
        headers: Dict[str, str] = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        last_exception: Optional[Exception] = None
        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._semaphore:
                    await self._enforce_rate_limit()
                    async with self._session.get(
                        url, params=params, headers=headers, raise_for_status=True
                    ) as resp:
                        data = await resp.json()
                        self._cache[cache_key] = data
                        return data
            except ClientResponseError as exc:
                if exc.status == 401:
                    raise PharmGKBAuthError("Invalid or expired PharmGKB API key") from exc
                if exc.status == 404:
                    raise PharmGKBNotFoundError(f"PharmGKB resource not found: {url}") from exc
                if exc.status == 429:
                    raise PharmGKBRateLimitError("PharmGKB API rate limit exceeded") from exc
                if 500 <= exc.status < 600:
                    last_exception = exc
                    wait = RETRY_BACKOFF * attempt
                    logger.warning("PharmGKB transient error %s on attempt %d/%d — retrying in %.1fs", exc.status, attempt, self._max_retries, wait)
                    await asyncio.sleep(wait)
                    continue
                raise PharmGKBAPIError(f"PharmGKB API error {exc.status}: {exc.message}") from exc
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning("PharmGKB network error on attempt %d/%d — retrying in %.1fs", attempt, self._max_retries, wait)
                await asyncio.sleep(wait)

        raise PharmGKBAPIError(f"PharmGKB request failed after {self._max_retries} attempts") from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise session and verify API key via a lightweight call."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-PharmGKBAdapter/1.0",
                },
            )
        try:
            # Lightweight ping — list a single drug
            await self._request("/data/drug", {"limit": 1})
            self._connected = True
            logger.info("PharmGKBAdapter connected — %s", self._base_url)
            return True
        except PharmGKBAuthError:
            self._connected = False
            logger.error("PharmGKBAdapter connection failed — authentication error")
            return False
        except PharmGKBError:
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Close session and flush cache."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._connected = False
        logger.info("PharmGKBAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute a query against PharmGKB.

        Supported keys:
            * ``drug`` — drug name or PharmGKB accession ID.
            * ``gene`` — HGNC gene symbol or PharmGKB accession ID.
            * ``variant`` — variant name or rsID.
            * ``annotation_level`` — filter by evidence level (1–4).
        """
        if not self._connected:
            await self.connect()

        records: List[Dict[str, Any]] = []

        # 1. Clinical annotations
        ca_params: Dict[str, Any] = {"limit": 50}
        if "drug" in query:
            ca_params["relatedChemicals"] = query["drug"]
        if "gene" in query:
            ca_params["relatedGenes"] = query["gene"]
        if "variant" in query:
            ca_params["relatedVariants"] = query["variant"]
        if "annotation_level" in query:
            ca_params["annotationLevel"] = query["annotation_level"]

        ca_data = await self._request("/data/clinicalAnnotation", ca_params)
        for ca in ca_data.get("data", []):
            ca["_fetched_via"] = "clinicalAnnotation"
            records.append(ca)

        # 2. Drug metadata
        if "drug" in query:
            drug_data = await self._request("/data/drug", {"name": query["drug"], "limit": 10})
            for d in drug_data.get("data", []):
                d["_fetched_via"] = "drug"
                records.append(d)

        # 3. Gene metadata
        if "gene" in query:
            gene_data = await self._request("/data/gene", {"symbol": query["gene"], "limit": 10})
            for g in gene_data.get("data", []):
                g["_fetched_via"] = "gene"
                records.append(g)

        # 4. Guidelines
        if "drug" in query or "gene" in query:
            gl_params: Dict[str, Any] = {"limit": 20}
            if "drug" in query:
                gl_params["relatedChemicals"] = query["drug"]
            if "gene" in query:
                gl_params["relatedGenes"] = query["gene"]
            gl_data = await self._request("/data/guideline", gl_params)
            for gl in gl_data.get("data", []):
                gl["_fetched_via"] = "guideline"
                records.append(gl)

        return records

    # -- normalize ------------------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform PharmGKB raw records into the standard internal schema."""
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm = await self._normalize_single(raw)
            if norm:
                normalised.append(norm)
        return normalised

    async def _normalize_single(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        fetched_via = raw.get("_fetched_via", "")

        if fetched_via == "clinicalAnnotation":
            return self._normalize_clinical_annotation(raw)
        if fetched_via == "drug":
            return self._normalize_drug(raw)
        if fetched_via == "gene":
            return self._normalize_gene(raw)
        if fetched_via == "guideline":
            return self._normalize_guideline(raw)

        return None

    def _normalize_clinical_annotation(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise a clinicalAnnotation record."""
        # Extract related chemicals (drugs)
        chemicals = raw.get("relatedChemicals", [])
        drug = chemicals[0].get("name", "") if chemicals else ""

        # Extract related genes
        genes = raw.get("relatedGenes", [])
        gene = genes[0].get("symbol", "") if genes else ""

        # Extract related variants
        variants = raw.get("relatedVariants", [])
        variant = variants[0].get("name", "") if variants else ""

        # Annotation level
        annotation_level = raw.get("annotationLevel", 4)

        # Evidence level
        evidence_terms = raw.get("evidenceTerms", [])
        evidence_level = evidence_terms[0].get("term", "") if evidence_terms else ""

        # Clinical implication
        implication = raw.get("implications", [{}])[0].get("implication", "") if raw.get("implications") else ""

        # Population
        pops = raw.get("populationTypes", [])
        population = pops[0].get("term", "") if pops else ""

        # PubMed IDs
        literature = raw.get("literature", [])
        pmids = [str(lit.get("pmid", "")) for lit in literature if lit.get("pmid")]

        return {
            "gene": gene,
            "drug": drug,
            "variant": variant,
            "annotation_level": int(annotation_level) if annotation_level else 4,
            "evidence_level": evidence_level,
            "clinical_implication": implication,
            "population": population,
            "pmids": pmids,
            "haplotype": "",
            "guideline_url": "",
            "_raw_id": raw.get("id", ""),
            "_raw_type": "clinicalAnnotation",
        }

    def _normalize_drug(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise a drug metadata record."""
        return {
            "gene": "",
            "drug": raw.get("name", ""),
            "variant": "",
            "annotation_level": 0,
            "evidence_level": "",
            "clinical_implication": raw.get("description", ""),
            "population": "",
            "pmids": [str(lit.get("pmid", "")) for lit in raw.get("literature", []) if lit.get("pmid")],
            "haplotype": "",
            "guideline_url": "",
            "_raw_id": raw.get("id", ""),
            "_raw_type": "drug",
        }

    def _normalize_gene(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise a gene metadata record."""
        return {
            "gene": raw.get("symbol", ""),
            "drug": "",
            "variant": "",
            "annotation_level": 0,
            "evidence_level": "",
            "clinical_implication": raw.get("description", ""),
            "population": "",
            "pmids": [str(lit.get("pmid", "")) for lit in raw.get("literature", []) if lit.get("pmid")],
            "haplotype": "",
            "guideline_url": "",
            "_raw_id": raw.get("id", ""),
            "_raw_type": "gene",
        }

    def _normalize_guideline(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise a guideline record."""
        chemicals = raw.get("relatedChemicals", [])
        drug = chemicals[0].get("name", "") if chemicals else ""
        genes = raw.get("relatedGenes", [])
        gene = genes[0].get("symbol", "") if genes else ""
        return {
            "gene": gene,
            "drug": drug,
            "variant": "",
            "annotation_level": 0,
            "evidence_level": "guideline",
            "clinical_implication": raw.get("name", ""),
            "population": "",
            "pmids": [str(lit.get("pmid", "")) for lit in raw.get("literature", []) if lit.get("pmid")],
            "haplotype": "",
            "guideline_url": raw.get("url", ""),
            "_raw_id": raw.get("id", ""),
            "_raw_type": "guideline",
        }

    # -- validate -------------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate normalised records and flag research-only annotations."""
        validated: List[Dict[str, Any]] = []
        for record in normalized_records:
            record["_valid"] = self._is_valid(record)
            record["_confidence"] = self.get_confidence(record).value
            record["_research_only"] = self._is_research_only(record)
            record["_research_only_reason"] = self._research_only_reason(record)
            record["_provenance"] = self.get_provenance(record)
            validated.append(record)
        return validated

    def _is_valid(self, record: Dict[str, Any]) -> bool:
        """Valid when it has at least a gene or drug identifier."""
        return bool(record.get("gene")) or bool(record.get("drug"))

    def _is_research_only(self, record: Dict[str, Any]) -> bool:
        """Flag as research-only for annotation levels 3 and 4."""
        ann_level = record.get("annotation_level", 0)
        return ann_level in (3, 4)

    def _research_only_reason(self, record: Dict[str, Any]) -> Optional[str]:
        """Human-readable reason for research-only flagging."""
        ann_level = record.get("annotation_level", 0)
        if ann_level in (3, 4):
            return ANNOTATION_LEVEL_MAP.get(ann_level, "Low-level annotation")
        return None

    # -- provenance & governance ----------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        raw_id = record.get("_raw_id", "unknown")
        raw_type = record.get("_raw_type", "unknown")
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=f"{raw_type}:{raw_id}",
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="CC-BY-SA-4.0",
            license_url="https://creativecommons.org/licenses/by-sa/4.0/",
            attribution_text="Data obtained from PharmGKB. CC BY-SA 4.0.",
            confidence_tier=self.get_confidence(record),
            evidence_level=self._map_evidence_level(record.get("evidence_level", "")),
            research_only=self._is_research_only(record),
            research_only_reason=self._research_only_reason(record),
            cache_ttl_seconds=self._cache_ttl,
        )

    def _map_evidence_level(self, evidence_level: str) -> EvidenceLevel:
        """Map PharmGKB evidence strings to internal evidence levels."""
        mapping: Dict[str, EvidenceLevel] = {
            "meta-analysis": EvidenceLevel.META_ANALYSIS,
            "randomized controlled trial": EvidenceLevel.RCT,
            "clinical trial": EvidenceLevel.RCT,
            "observational study": EvidenceLevel.OBSERVATIONAL,
            "case report": EvidenceLevel.PILOT_EXPERT,
            "expert opinion": EvidenceLevel.PILOT_EXPERT,
        }
        return mapping.get(evidence_level.lower(), EvidenceLevel.OBSERVATIONAL)

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="CC-BY-SA-4.0",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            requires_share_alike=True,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text="Data obtained from PharmGKB (https://www.pharmgkb.org). License: CC BY-SA 4.0.",
            restrictions=[
                "Attribution required — must cite PharmGKB.",
                "Share-alike required — derivative works under CC BY-SA 4.0.",
                "Commercial use requires separate PharmGKB license agreement.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Score confidence based on annotation level and data completeness."""
        ann_level = record.get("annotation_level", 0)
        if ann_level == 1:
            return ConfidenceTier.HIGH
        if ann_level == 2:
            return ConfidenceTier.HIGH
        if ann_level == 3:
            return ConfidenceTier.MEDIUM
        if ann_level == 4:
            return ConfidenceTier.RESEARCH
        # Drug/gene metadata without clinical annotation
        if record.get("drug") and record.get("gene"):
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.LOW

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify API reachability and report latency."""
        if not self._session or self._session.closed:
            return {"status": "down", "latency_ms": None, "source": self.source_name, "error": "Session closed"}

        start = asyncio.get_event_loop().time()
        try:
            await self._request("/data/drug", {"limit": 1})
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "ok", "latency_ms": round(latency, 2), "source": self.source_name, "base_url": self._base_url}
        except PharmGKBError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "down", "latency_ms": round(latency, 2), "source": self.source_name, "error": str(exc)}
