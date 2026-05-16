"""
ClinVar Adapter — NCBI ClinVar for clinical variant interpretations.

Provides normalised access to human genetic variant–disease relationships,
clinical significance ratings, review status star levels, and supporting
evidence.  Uses the NCBI E-utilities API (esearch → esummary → efetch).

ClinVar is public-domain data from the U.S. National Institutes of Health.

API docs: https://www.ncbi.nlm.nih.gov/clinvar/docs/help/
E-utilities: https://www.ncbi.nlm.nih.gov/books/NBK25499/
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import aiohttp
from aiohttp import ClientTimeout, ClientResponseError
import xml.etree.ElementTree as ET

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

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
EFETCH_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/efetch.fcgi"
DEFAULT_TIMEOUT = ClientTimeout(total=60, connect=15)
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5
REQUESTS_PER_SECOND = 3  # NCBI polite limit
NCBI_API_KEY_HEADER = "ncbi_api_key"

# ClinVar star level → review status mapping
STAR_MAP: Dict[str, Tuple[int, str]] = {
    "practice guideline": (4, "Practice guideline"),
    "reviewed by expert panel": (3, "Expert panel"),
    "criteria provided, multiple submitters, no conflicts": (2, "Multiple submitters"),
    "criteria provided, conflicting interpretations": (1, "Conflicting"),
    "criteria provided, single submitter": (1, "Single submitter"),
    "no assertion criteria provided": (0, "No criteria"),
    "no assertion provided": (0, "No assertion"),
    "no conflicts": (2, "No conflicts"),
}

# Normalised field schema
NORMALIZED_SCHEMA: Dict[str, type] = {
    "variant_id": str,
    "gene": str,
    "chromosome": str,
    "position": int,
    "ref_allele": str,
    "alt_allele": str,
    "clinical_significance": str,
    "review_status": str,
    "star_level": int,
    "conditions": list,
    "last_evaluated": str,
    "rs_id": str,
}


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class ClinVarError(Exception):
    """Base exception for ClinVar adapter errors."""

    pass


class ClinVarNotFoundError(ClinVarError):
    """Raised when a ClinVar query returns no results."""

    pass


class ClinVarAPIError(ClinVarError):
    """Raised on unexpected HTTP status, malformed XML/JSON, or NCBI error."""

    pass


class ClinVarRateLimitError(ClinVarError):
    """Raised when NCBI rate-limits the request (no API key or exceeded quota)."""

    pass


class ClinVarParseError(ClinVarError):
    """Raised when XML parsing of an efetch response fails."""

    pass


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class ClinVarAdapter(DatabaseAdapter):
    """Async adapter for NCBI ClinVar via E-utilities.

    Configuration keys (all optional):
        * ``ncbi_api_key`` — NCBI API key (raises rate limit from 3 to 10 req/s).
        * ``timeout`` — request timeout in seconds (default 60).
        * ``max_retries`` — retry attempts (default 3).
        * ``cache_ttl`` — in-memory cache TTL in seconds (default 86400).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._ncbi_api_key: Optional[str] = self.config.get("ncbi_api_key")
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", 60), connect=15
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._cache_ttl: int = self.config.get("cache_ttl", 86_400)
        self._session: Optional[aiohttp.ClientSession] = None
        self._requests_per_second: int = 10 if self._ncbi_api_key else REQUESTS_PER_SECOND
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(self._requests_per_second)
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "ClinVar"

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
        """Enforce NCBI polite per-second request cap."""
        now = asyncio.get_event_loop().time()
        min_interval = 1.0 / self._requests_per_second
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None, xml: bool = False) -> Any:
        """Execute a GET request with retries, rate-limiting, and caching."""
        params = params or {}
        if self._ncbi_api_key:
            params["api_key"] = self._ncbi_api_key

        cache_key = self._cache_key(endpoint, params)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._session is None:
            raise ClinVarError("HTTP session not initialised — call connect() first.")

        url = f"{EUTILS_BASE}{endpoint}"
        last_exception: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._semaphore:
                    await self._enforce_rate_limit()
                    async with self._session.get(url, params=params, raise_for_status=True) as resp:
                        if xml:
                            text = await resp.text()
                            data = text
                        else:
                            data = await resp.json()
                        self._cache[cache_key] = data
                        return data
            except ClientResponseError as exc:
                if exc.status == 429:
                    raise ClinVarRateLimitError("NCBI E-utilities rate limit exceeded") from exc
                if 500 <= exc.status < 600:
                    last_exception = exc
                    wait = RETRY_BACKOFF * attempt
                    logger.warning("ClinVar transient error %s on attempt %d/%d — retrying in %.1fs", exc.status, attempt, self._max_retries, wait)
                    await asyncio.sleep(wait)
                    continue
                raise ClinVarAPIError(f"ClinVar API error {exc.status}: {exc.message}") from exc
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning("ClinVar network error on attempt %d/%d — retrying in %.1fs", attempt, self._max_retries, wait)
                await asyncio.sleep(wait)

        raise ClinVarAPIError(f"ClinVar request failed after {self._max_retries} attempts") from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise session and verify NCBI reachability via esearch."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-ClinVarAdapter/1.0",
                },
            )
        try:
            # Lightweight esearch ping
            await self._request("/esearch.fcgi", {"db": "clinvar", "term": "BRCA1[Gene]", "retmax": 1, "retmode": "json"})
            self._connected = True
            logger.info("ClinVarAdapter connected — E-utilities")
            return True
        except ClinVarError:
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Close session and flush cache."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._connected = False
        logger.info("ClinVarAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute a ClinVar query via E-utilities.

        Supported keys:
            * ``gene`` — HGNC gene symbol (esearch by gene).
            * ``variant_id`` — exact ClinVar Variation ID.
            * ``rs_id`` — dbSNP rsID.
            * ``condition`` — disease / phenotype name.
            * ``term`` — free-text Entrez query term.
        """
        if not self._connected:
            await self.connect()

        records: List[Dict[str, Any]] = []

        # Build Entrez query term
        term_parts: List[str] = []
        if "gene" in query:
            term_parts.append(f"{query['gene']}[Gene]")
        if "variant_id" in query:
            term_parts.append(f"{query['variant_id']}[VariationID]")
        if "rs_id" in query:
            term_parts.append(f"{query['rs_id']}[rs]")
        if "condition" in query:
            term_parts.append(f"{query['condition']}[Disease]")
        if "term" in query:
            term_parts.append(query["term"])

        if not term_parts:
            raise ClinVarError("Query must contain 'gene', 'variant_id', 'rs_id', 'condition', or 'term'.")

        term = " AND ".join(term_parts)
        retmax = min(query.get("limit", 50), 200)

        # 1. esearch — get UIDs
        esearch_data = await self._request(
            "/esearch.fcgi",
            {"db": "clinvar", "term": term, "retmax": retmax, "retmode": "json"},
        )
        idlist = esearch_data.get("esearchresult", {}).get("idlist", [])
        if not idlist:
            return []

        # 2. esummary — get summaries for each UID in batches
        batch_size = 20
        summaries: List[Dict[str, Any]] = []
        for i in range(0, len(idlist), batch_size):
            batch = idlist[i : i + batch_size]
            esummary_data = await self._request(
                "/esummary.fcgi",
                {"db": "clinvar", "id": ",".join(batch), "retmode": "json"},
            )
            result = esummary_data.get("result", {})
            for uid in batch:
                if uid in result:
                    result[uid]["_uid"] = uid
                    summaries.append(result[uid])

        # 3. efetch for full XML details (optional, only when limit is small)
        if len(idlist) <= 10:
            for uid in idlist[:10]:
                try:
                    xml_text = await self._request(
                        "/efetch.fcgi",
                        {"db": "clinvar", "id": uid, "rettype": "vcv", "is_variationid": "variationid"},
                        xml=True,
                    )
                    xml_record = {"_uid": uid, "_xml": xml_text, "_fetch_type": "efetch"}
                    records.append(xml_record)
                except ClinVarError:
                    # Fallback to esummary-only record
                    for s in summaries:
                        if s.get("_uid") == uid:
                            s["_fetch_type"] = "esummary"
                            records.append(s)
        else:
            for s in summaries:
                s["_fetch_type"] = "esummary"
                records.append(s)

        return records

    # -- normalize ------------------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform ClinVar raw records into the standard internal schema."""
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm = await self._normalize_single(raw)
            if norm:
                normalised.append(norm)
        return normalised

    async def _normalize_single(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        fetch_type = raw.get("_fetch_type", "esummary")

        if fetch_type == "efetch":
            return self._normalize_efetch(raw)
        return self._normalize_esummary(raw)

    def _normalize_esummary(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normalise an esummary record (JSON)."""
        uid = raw.get("_uid", "")
        if not uid:
            return None

        # Clinical significance
        clinical_significance = ""
        cs_dict = raw.get("clinical_significance", {})
        if isinstance(cs_dict, dict):
            clinical_significance = cs_dict.get("description", "")
        elif isinstance(cs_dict, str):
            clinical_significance = cs_dict

        # Review status → star level
        review_status = raw.get("review_status", "")
        star_level, review_label = STAR_MAP.get(
            review_status.lower(), (0, review_status)
        )

        # Gene
        genes = raw.get("genes", [])
        gene = genes[0].get("symbol", "") if genes else ""

        # Chromosome / position
        chrom = raw.get("chromosome", "")
        pos = 0
        if "location" in raw and raw["location"]:
            try:
                loc = raw["location"].split(":")[-1]
                if "-" in loc:
                    pos = int(loc.split("-")[0])
                else:
                    pos = int(loc)
            except (ValueError, IndexError):
                pos = 0

        # Variant details from object_type
        obj_type = raw.get("obj_type", "")

        # Conditions (disease / phenotype)
        conditions: List[str] = []
        trait_set = raw.get("trait_set", [])
        if isinstance(trait_set, list):
            for trait in trait_set:
                trait_name = trait.get("trait_name", "") if isinstance(trait, dict) else str(trait)
                if trait_name:
                    conditions.append(trait_name)

        # Last evaluated
        last_evaluated = ""
        if isinstance(cs_dict, dict):
            last_evaluated = cs_dict.get("last_evaluated", "")

        return {
            "variant_id": str(uid),
            "gene": gene,
            "chromosome": chrom,
            "position": pos,
            "ref_allele": raw.get("ref", ""),
            "alt_allele": raw.get("alt", ""),
            "clinical_significance": clinical_significance,
            "review_status": review_status,
            "star_level": star_level,
            "conditions": conditions,
            "last_evaluated": last_evaluated,
            "rs_id": raw.get("accession", ""),
            "_obj_type": obj_type,
            "_raw": raw,
        }

    def _normalize_efetch(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normalise an efetch XML record into the standard schema."""
        try:
            root = ET.fromstring(raw.get("_xml", "<root/>"))
        except ET.ParseError as exc:
            logger.warning("ClinVar XML parse error: %s", exc)
            return None

        ns = {"clinvar": "http://www.ncbi.nlm.nih.gov/clinvar"}

        # Extract variation ID
        variation_id = raw.get("_uid", "")

        # Gene
        gene_elem = root.find(".//clinvar:Gene", ns)
        gene = gene_elem.get("Symbol", "") if gene_elem is not None else ""

        # Chromosome
        chrom_elem = root.find(".//clinvar:Chromosome", ns)
        chromosome = chrom_elem.text if chrom_elem is not None else ""

        # Position
        pos_elem = root.find(".//clinvar:PositionVCF", ns)
        position = int(pos_elem.text) if pos_elem is not None and pos_elem.text else 0

        # Alleles
        ref_elem = root.find(".//clinvar:ReferenceAlleleVCF", ns)
        ref_allele = ref_elem.text if ref_elem is not None else ""
        alt_elem = root.find(".//clinvar:AlternateAlleleVCF", ns)
        alt_allele = alt_elem.text if alt_elem is not None else ""

        # Clinical significance
        desc_elem = root.find(".//clinvar:Description", ns)
        clinical_significance = desc_elem.text if desc_elem is not None else ""

        # Review status
        rev_elem = root.find(".//clinvar:ReviewStatus", ns)
        review_status = rev_elem.text if rev_elem is not None else ""
        star_level, _ = STAR_MAP.get(review_status.lower(), (0, review_status))

        # Conditions
        conditions: List[str] = []
        for name_elem in root.findall(".//clinvar:Name/clinvar:ElementValue", ns):
            if name_elem.get("Type") == "Preferred":
                val = name_elem.text
                if val:
                    conditions.append(val)

        # Last evaluated
        attr_elem = root.find(".//clinvar:ClinicalSignificance", ns)
        last_evaluated = attr_elem.get("DateLastEvaluated", "") if attr_elem is not None else ""

        # rsID
        xrefs = root.findall(".//clinvar:XRef", ns)
        rs_id = ""
        for xr in xrefs:
            if xr.get("DB") == "dbSNP":
                rs_id = xr.get("ID", "")
                break

        return {
            "variant_id": str(variation_id),
            "gene": gene,
            "chromosome": chromosome,
            "position": position,
            "ref_allele": ref_allele,
            "alt_allele": alt_allele,
            "clinical_significance": clinical_significance,
            "review_status": review_status,
            "star_level": star_level,
            "conditions": conditions,
            "last_evaluated": last_evaluated,
            "rs_id": rs_id,
            "_obj_type": "",
            "_raw": raw,
        }

    # -- validate -------------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate normalised records and flag VUS / 1-star as research-only."""
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
        """Valid when it has a variant ID and chromosome."""
        return bool(record.get("variant_id")) and bool(record.get("chromosome"))

    def _is_research_only(self, record: Dict[str, Any]) -> bool:
        """Flag as research-only for 1-star or VUS (uncertain significance)."""
        star = record.get("star_level", 0)
        cs = record.get("clinical_significance", "").lower()
        return star <= 1 or "uncertain" in cs or "conflicting" in cs

    def _research_only_reason(self, record: Dict[str, Any]) -> Optional[str]:
        """Human-readable reason for research-only flagging."""
        reasons: List[str] = []
        if record.get("star_level", 0) <= 1:
            reasons.append(f"Low review status ({record.get('star_level', 0)} stars)")
        cs = record.get("clinical_significance", "").lower()
        if "uncertain" in cs:
            reasons.append("Variant of Uncertain Significance (VUS)")
        if "conflicting" in cs:
            reasons.append("Conflicting interpretations")
        return "; ".join(reasons) if reasons else None

    # -- provenance & governance ----------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=record.get("variant_id", "unknown"),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="Public Domain",
            license_url="https://www.ncbi.nlm.nih.gov/home/about/policies/",
            attribution_text="Data from NCBI ClinVar, a public-domain resource.",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.OBSERVATIONAL,
            research_only=self._is_research_only(record),
            research_only_reason=self._research_only_reason(record),
            cache_ttl_seconds=self._cache_ttl,
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Public Domain (U.S. Government Work)",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            requires_share_alike=False,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text="Data from NCBI ClinVar (https://www.ncbi.nlm.nih.gov/clinvar).",
            restrictions=[],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Score confidence based on star level and clinical significance."""
        star = record.get("star_level", 0)
        cs = record.get("clinical_significance", "").lower()
        if star >= 3:
            return ConfidenceTier.HIGH
        if star == 2 and cs not in ("uncertain significance", "conflicting interpretations"):
            return ConfidenceTier.HIGH
        if star == 2:
            return ConfidenceTier.MEDIUM
        if star == 1 and "conflicting" not in cs:
            return ConfidenceTier.MEDIUM
        if star == 1:
            return ConfidenceTier.LOW
        if "uncertain" in cs:
            return ConfidenceTier.RESEARCH
        return ConfidenceTier.LOW

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify NCBI E-utilities reachability and report latency."""
        if not self._session or self._session.closed:
            return {"status": "down", "latency_ms": None, "source": self.source_name, "error": "Session closed"}

        start = asyncio.get_event_loop().time()
        try:
            await self._request("/esearch.fcgi", {"db": "clinvar", "term": "BRCA1[Gene]", "retmax": 1, "retmode": "json"})
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "ok", "latency_ms": round(latency, 2), "source": self.source_name, "base_url": EUTILS_BASE}
        except ClinVarError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "down", "latency_ms": round(latency, 2), "source": self.source_name, "error": str(exc)}
