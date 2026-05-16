"""
Allen Brain Atlas Adapter — Gene Expression and Neuroanatomical Data.

Provides normalised access to the Allen Human Brain Atlas (AHBA)
microarray gene expression data across ~3702 tissue samples from 6 donors.
Maps gene expression levels to MNI coordinates and Allen ontology structures.

GOVERNANCE RULE:
  Gene expression data is CONTEXTUAL ENRICHMENT, NOT a clinical biomarker.
  Population-level neuroanatomical context only. Cannot diagnose individual patients.

API docs: https://help.brain-map.org/display/api/Allen+Brain+Atlas+API
Data:     http://human.brain-map.org/
License:  CC BY 4.0
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

ALLEN_API_BASE = "https://api.brain-map.org/api/v2"
DEFAULT_TIMEOUT = ClientTimeout(total=60, connect=15)
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0
REQUESTS_PER_SECOND = 5

# Allen-specific field schema for normalised output
NORMALIZED_SCHEMA: Dict[str, type] = {
    "gene_symbol": str,
    "gene_id": int,
    "structure_id": int,
    "structure_name": str,
    "structure_acronym": str,
    "expression_level": float,
    "expression_z_score": float,
    "donor_id": int,
    "donor_age": str,
    "donor_sex": str,
    "mni_coordinates": list,
}

# Structure ontology mapping (Allen → common names)
_STRUCTURE_ONTOLOGY_MAP: Dict[int, Dict[str, str]] = {
    4008: {"name": "Frontal Lobe", "acronym": "FR", "parent": "Cerebral Cortex"},
    4010: {"name": "Parietal Lobe", "acronym": "PA", "parent": "Cerebral Cortex"},
    4012: {"name": "Temporal Lobe", "acronym": "TE", "parent": "Cerebral Cortex"},
    4014: {"name": "Occipital Lobe", "acronym": "OC", "parent": "Cerebral Cortex"},
    4016: {"name": "Cingulate Gyrus", "acronym": "CG", "parent": "Limbic Lobe"},
    4018: {"name": "Hippocampal Formation", "acronym": "HIP", "parent": "Limbic Lobe"},
    4019: {"name": "Amygdala", "acronym": "AMY", "parent": "Subcortical"},
    4020: {"name": "Basal Ganglia", "acronym": "BG", "parent": "Subcortical"},
    4022: {"name": "Thalamus", "acronym": "THA", "parent": "Subcortical"},
    4024: {"name": "Hypothalamus", "acronym": "HYP", "parent": "Subcortical"},
    4026: {"name": "Midbrain", "acronym": "MB", "parent": "Brainstem"},
    4028: {"name": "Pons", "acronym": "PN", "parent": "Brainstem"},
    4030: {"name": "Medulla", "acronym": "ME", "parent": "Brainstem"},
    4034: {"name": "Cerebellar Cortex", "acronym": "CB", "parent": "Cerebellum"},
}

# Confidence thresholds
_DONOR_COUNT_HIGH = 4
_DONOR_COUNT_MEDIUM = 2
_Z_SCORE_HIGH = 2.0
_Z_SCORE_MEDIUM = 1.0


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class AllenBrainError(Exception):
    """Base exception for Allen Brain Atlas adapter errors."""

    pass


class AllenBrainNotFoundError(AllenBrainError):
    """Raised when a query returns no gene or structure results."""

    pass


class AllenBrainAPIError(AllenBrainError):
    """Raised on unexpected HTTP status or malformed API response."""

    pass


class AllenBrainRateLimitError(AllenBrainError):
    """Raised when the Allen API rate limit is exceeded."""

    pass


class AllenBrainParseError(AllenBrainError):
    """Raised when parsing an Allen API response fails."""

    pass


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class AllenBrainAdapter(DatabaseAdapter):
    """Async adapter for the Allen Human Brain Atlas API.

    Provides gene expression queries mapped to neuroanatomical structures
    with MNI coordinates. All outputs are flagged as research-only because
    gene expression represents population-level neuroanatomical context,
    NOT individual clinical biomarkers.

    Configuration keys (all optional):
        * ``timeout`` — request timeout in seconds (default 60).
        * ``max_retries`` — retry attempts (default 3).
        * ``cache_ttl`` — in-memory cache TTL in seconds (default 86400).
        * ``min_expression_level`` — minimum expression level filter (default 0.0).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", 60), connect=15
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._cache_ttl: int = self.config.get("cache_ttl", 86_400)
        self._min_expression: float = self.config.get("min_expression_level", 0.0)
        self._session: Optional[aiohttp.ClientSession] = None
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._last_request_time: float = 0.0
        self._structure_cache: Dict[int, Dict[str, Any]] = {}

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "Allen_Brain_Atlas"

    @property
    def source_version(self) -> str:
        return "current"

    # -- cache key generation -------------------------------------------------

    def _cache_key(self, endpoint: str, params: Dict[str, Any]) -> str:
        """Generate a deterministic SHA-256 cache key."""
        payload = json.dumps({"endpoint": endpoint, "params": params}, sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    # -- HTTP helpers ---------------------------------------------------------

    async def _enforce_rate_limit(self) -> None:
        """Enforce per-second request cap against Allen API."""
        now = asyncio.get_event_loop().time()
        min_interval = 1.0 / REQUESTS_PER_SECOND
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Execute a GET request with retries, rate-limiting, and caching."""
        params = params or {}
        cache_key = self._cache_key(endpoint, params)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._session is None or self._session.closed:
            raise AllenBrainError("HTTP session not initialised — call connect() first.")

        url = f"{ALLEN_API_BASE}{endpoint}"
        last_exception: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._semaphore:
                    await self._enforce_rate_limit()
                    async with self._session.get(url, params=params, raise_for_status=True) as resp:
                        data = await resp.json()
                        self._cache[cache_key] = data
                        return data
            except ClientResponseError as exc:
                if exc.status == 429:
                    raise AllenBrainRateLimitError(
                        "Allen Brain Atlas API rate limit exceeded"
                    ) from exc
                if 500 <= exc.status < 600:
                    last_exception = exc
                    wait = RETRY_BACKOFF * attempt
                    logger.warning(
                        "AllenBrain transient error %s on attempt %d/%d — retrying in %.1fs",
                        exc.status,
                        attempt,
                        self._max_retries,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise AllenBrainAPIError(
                    f"Allen API error {exc.status}: {exc.message}"
                ) from exc
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "AllenBrain network error on attempt %d/%d — retrying in %.1fs",
                    attempt,
                    self._max_retries,
                    wait,
                )
                await asyncio.sleep(wait)

        raise AllenBrainAPIError(
            f"Allen request failed after {self._max_retries} attempts"
        ) from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise session and verify Allen API reachability."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-AllenBrainAdapter/1.0",
                },
            )
        try:
            # Lightweight API ping — query a well-known gene
            await self._request(
                "/data/query.json",
                {"criteria": "model::Gene,rma::criteria,[acronym$eq'GFAP']", "num_rows": "1"},
            )
            self._connected = True
            logger.info("AllenBrainAdapter connected — Allen Brain Atlas API")
            return True
        except AllenBrainError:
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Close session and flush cache."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._structure_cache.clear()
        self._connected = False
        logger.info("AllenBrainAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute a gene expression query against the Allen Brain Atlas.

        Supported keys:
            * ``gene_symbol`` — HGNC gene symbol (e.g., 'GFAP', 'TH').
            * ``gene_id`` — Allen Institute numeric gene ID.
            * ``structure_id`` — Allen ontology structure ID.
            * ``structure_acronym`` — Structure acronym (e.g., 'FR', 'HIP').
            * ``donor_id`` — Specific donor filter (1–6).
            * ``probe_id`` — Specific probe ID.
        """
        if not self._connected:
            await self.connect()

        records: List[Dict[str, Any]] = []

        gene_symbol = query.get("gene_symbol")
        gene_id = query.get("gene_id")
        structure_id = query.get("structure_id")
        structure_acronym = query.get("structure_acronym")
        donor_id = query.get("donor_id")

        # Resolve gene ID from symbol if needed
        if gene_symbol and not gene_id:
            gene_id = await self._resolve_gene_id(gene_symbol)
            if gene_id is None:
                raise AllenBrainNotFoundError(f"Gene symbol '{gene_symbol}' not found in Allen Atlas")

        # Build SectionDataSet query criteria
        criteria_parts: List[str] = []
        if gene_id:
            criteria_parts.append(f"[genes$eq'{gene_id}']")
        if donor_id:
            criteria_parts.append(f"[donors$eq'{donor_id}']")

        # Fetch SectionDataSet entries (tissue samples with expression data)
        dataset_criteria = "".join(criteria_parts) if criteria_parts else ""
        datasets = await self._request(
            "/data/SectionDataSet/query.json",
            {
                "criteria": f"model::SectionDataSet,rma::criteria{dataset_criteria}" if dataset_criteria else "model::SectionDataSet",
                "num_rows": "50",
                "include": "specimen(stereotaxic_injections(primary_injection_structure,structures)),probes(gene)",
            },
        )

        # Fetch microarray data (expression levels per sample)
        if gene_id:
            microarray_data = await self._fetch_microarray_data(gene_id, donor_id)
        else:
            microarray_data = []

        # Build structure info cache
        for entry in microarray_data:
            sid = entry.get("structure_id")
            if sid and sid not in self._structure_cache:
                self._structure_cache[sid] = await self._fetch_structure_info(sid)

        # Filter by structure if requested
        for entry in microarray_data:
            sid = entry.get("structure_id", 0)
            if structure_id and sid != structure_id:
                continue
            struct_info = self._structure_cache.get(sid, {})
            if structure_acronym:
                acr = struct_info.get("acronym", "")
                if acr.upper() != structure_acronym.upper():
                    continue
            records.append(entry)

        return records

    async def _resolve_gene_id(self, gene_symbol: str) -> Optional[int]:
        """Resolve an HGNC gene symbol to an Allen Institute gene ID."""
        cache_key = f"gene_resolve_{gene_symbol.upper()}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        try:
            data = await self._request(
                "/data/query.json",
                {
                    "criteria": f"model::Gene,rma::criteria,[acronym$eq'{gene_symbol}']",
                    "num_rows": "5",
                },
            )
            rows = data.get("msg", [])
            if rows:
                gene_id = rows[0].get("id")
                self._cache[cache_key] = gene_id
                return gene_id
        except AllenBrainError:
            pass
        return None

    async def _fetch_microarray_data(
        self, gene_id: int, donor_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Fetch microarray expression data for a gene across all donors."""
        cache_key = f"microarray_{gene_id}_{donor_id}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        params: Dict[str, str] = {
            "criteria": f"model::MicroarraySignal,rma::criteria,[genes$eq'{gene_id}']",
            "num_rows": "5000",
        }
        if donor_id:
            params["criteria"] += f",[donors$eq'{donor_id}']"

        data = await self._request("/data/query.json", params)
        rows = data.get("msg", [])
        records: List[Dict[str, Any]] = []

        for row in rows:
            record = {
                "gene_id": gene_id,
                "gene_symbol": row.get("gene_acronym", ""),
                "probe_id": row.get("probe_id", 0),
                "structure_id": row.get("structure_id", 0),
                "expression_level": float(row.get("signal", 0.0)),
                "expression_z_score": float(row.get("z_score", 0.0)),
                "donor_id": row.get("donor_id", 0),
                "donor_age": row.get("donor_age", "unknown"),
                "donor_sex": row.get("donor_sex", "unknown"),
                "mni_coordinates": [
                    float(row.get("mni_x", 0.0)),
                    float(row.get("mni_y", 0.0)),
                    float(row.get("mni_z", 0.0)),
                ],
                "sample_name": row.get("sample_name", ""),
                "_raw": row,
            }
            records.append(record)

        self._cache[cache_key] = records
        return records

    async def _fetch_structure_info(self, structure_id: int) -> Dict[str, Any]:
        """Fetch structure ontology information by ID."""
        if structure_id in _STRUCTURE_ONTOLOGY_MAP:
            info = _STRUCTURE_ONTOLOGY_MAP[structure_id]
            return {
                "id": structure_id,
                "name": info["name"],
                "acronym": info["acronym"],
                "parent": info["parent"],
            }

        try:
            data = await self._request(
                "/data/Structure/query.json",
                {
                    "criteria": f"model::Structure,rma::criteria,[id$eq'{structure_id}']",
                    "num_rows": "1",
                },
            )
            rows = data.get("msg", [])
            if rows:
                row = rows[0]
                return {
                    "id": structure_id,
                    "name": row.get("name", "Unknown"),
                    "acronym": row.get("acronym", ""),
                    "parent": row.get("parent_structure_id", 0),
                }
        except AllenBrainError:
            pass

        return {"id": structure_id, "name": "Unknown", "acronym": "", "parent": 0}

    # -- normalize ------------------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform Allen raw records into the standard internal schema."""
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm = await self._normalize_single(raw)
            if norm:
                normalised.append(norm)
        return normalised

    async def _normalize_single(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normalise a single Allen expression record."""
        gene_symbol = raw.get("gene_symbol", "")
        if not gene_symbol:
            return None

        gene_id = raw.get("gene_id", 0)
        structure_id = raw.get("structure_id", 0)
        struct_info = self._structure_cache.get(structure_id, {})
        if not struct_info:
            struct_info = await self._fetch_structure_info(structure_id)
            self._structure_cache[structure_id] = struct_info

        expression_level = raw.get("expression_level", 0.0)
        if expression_level < self._min_expression:
            return None

        # Build normalized record
        return {
            "gene_symbol": gene_symbol,
            "gene_id": gene_id,
            "structure_id": structure_id,
            "structure_name": struct_info.get("name", "Unknown"),
            "structure_acronym": struct_info.get("acronym", ""),
            "expression_level": round(expression_level, 4),
            "expression_z_score": round(raw.get("expression_z_score", 0.0), 4),
            "donor_id": raw.get("donor_id", 0),
            "donor_age": raw.get("donor_age", "unknown"),
            "donor_sex": raw.get("donor_sex", "unknown"),
            "mni_coordinates": raw.get("mni_coordinates", [0.0, 0.0, 0.0]),
            "sample_name": raw.get("sample_name", ""),
            "_raw": raw.get("_raw", {}),
        }

    # -- validate -------------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate normalised records and attach governance metadata."""
        validated: List[Dict[str, Any]] = []
        for record in normalized_records:
            record["_valid"] = self._is_valid(record)
            record["_confidence"] = self.get_confidence(record).value
            record["_research_only"] = True  # ALWAYS research-only per governance rules
            record["_research_only_reason"] = self._research_only_reason()
            record["_caveat"] = self._caveat_text()
            record["_provenance"] = self.get_provenance(record)
            validated.append(record)
        return validated

    def _is_valid(self, record: Dict[str, Any]) -> bool:
        """Valid when gene and structure are present with non-zero expression."""
        has_gene = bool(record.get("gene_symbol")) and record.get("gene_id", 0) > 0
        has_structure = record.get("structure_id", 0) > 0
        has_expression = record.get("expression_level", 0.0) > 0
        valid_coords = all(
            isinstance(c, (int, float)) and c != 0
            for c in record.get("mni_coordinates", [])
        )
        return has_gene and has_structure and has_expression and valid_coords

    def _research_only_reason(self) -> str:
        """Governance-required research-only explanation."""
        return (
            "Allen Brain Atlas gene expression data provides population-level "
            "neuroanatomical context. It is not a clinical biomarker and cannot "
            "diagnose individual patients."
        )

    def _caveat_text(self) -> str:
        """Contextual caveat for all Allen Brain Atlas outputs."""
        return (
            "Gene expression levels represent population averages across 6 post-mortem "
            "donors (n=~3702 samples). Expression varies by donor age, sex, PMI, and "
            "tissue quality. These data provide neuroanatomical context for research "
            "purposes only."
        )

    # -- provenance & governance ----------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=f"{record.get('gene_symbol', 'unknown')}_{record.get('structure_id', 0)}",
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="CC BY 4.0",
            license_url="https://alleninstitute.org/legal/terms-use/",
            attribution_text="Data from Allen Institute for Brain Science. Available from https://portal.brain-map.org/",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.OBSERVATIONAL,
            research_only=True,
            retrieval_method="direct",
            data_quality_score=self._quality_score(record),
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="CC BY 4.0",
            license_url="https://creativecommons.org/licenses/by/4.0/",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            requires_share_alike=False,
            modification_allowed=True,
            redistribution_allowed=True,
            attribution_text="Allen Human Brain Atlas data © Allen Institute for Brain Science, used under CC BY 4.0.",
            restrictions=[
                "Gene expression data is for research use only — not a clinical biomarker.",
                "Attribution to Allen Institute required.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Score confidence based on donor count, z-score magnitude, and structure specificity."""
        z_score = abs(record.get("expression_z_score", 0.0))
        donor_count = self._estimate_donor_count(record)

        if donor_count >= _DONOR_COUNT_HIGH and z_score >= _Z_SCORE_HIGH:
            return ConfidenceTier.HIGH
        if donor_count >= _DONOR_COUNT_MEDIUM and z_score >= _Z_SCORE_MEDIUM:
            return ConfidenceTier.MEDIUM
        if donor_count >= _DONOR_COUNT_MEDIUM:
            return ConfidenceTier.LOW
        return ConfidenceTier.RESEARCH

    def _estimate_donor_count(self, record: Dict[str, Any]) -> int:
        """Estimate donor count from record metadata or raw data."""
        raw = record.get("_raw", {})
        if isinstance(raw, dict):
            return raw.get("donor_count", 1)
        return 1

    def _quality_score(self, record: Dict[str, Any]) -> float:
        """Compute a 0.0–1.0 quality score for the record."""
        z_score = abs(record.get("expression_z_score", 0.0))
        donor_count = self._estimate_donor_count(record)
        z_norm = min(z_score / 3.0, 1.0)
        donor_norm = min(donor_count / 6.0, 1.0)
        return round((z_norm * 0.6) + (donor_norm * 0.4), 3)

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify Allen API reachability and report latency."""
        if not self._session or self._session.closed:
            return {
                "status": "down",
                "latency_ms": None,
                "source": self.source_name,
                "error": "Session closed",
            }

        start = asyncio.get_event_loop().time()
        try:
            await self._request(
                "/data/query.json",
                {"criteria": "model::Gene,rma::criteria,[acronym$eq'GFAP']", "num_rows": "1"},
            )
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "base_url": ALLEN_API_BASE,
                "structure_cache_size": len(self._structure_cache),
            }
        except AllenBrainError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "error": str(exc),
            }
