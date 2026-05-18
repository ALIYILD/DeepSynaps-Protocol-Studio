"""
gnomAD Adapter — Broad Institute population genetics aggregator.

Wraps the gnomAD GraphQL API at https://gnomad.broadinstitute.org/api and
emits canonical records that conform to the Knowledge Layer schema
(subclass of the production ``DatabaseAdapter`` ABC).

API docs:   https://gnomad.broadinstitute.org/api
Help docs:  https://gnomad.broadinstitute.org/help/

Implementation notes
--------------------
* GraphQL adapter — uses POST not GET. Differs from REST adapters in:
  - Single endpoint URL with query/variables JSON body
  - GraphQL response shape: ``{"data": {...}, "errors": [...]}``
  - We surface ``errors`` as ``GnomadAPIError`` so a partial-data response
    cannot silently produce a half-correct ``ProvenanceRecord``.
* Uses ``httpx`` (matches the codebase-wide HTTP client).
* Reference research source (preserved, not imported):
  ``apps/api/app/knowledge/gnomad_adapter.py``.
* Briefing: ``docs/knowledge/BATCH4_GENETICS_INTEGRATION_REPORT.md`` § 4.
* Roadmap row: ``docs/engineering/knowledge-adapter-roadmap.md`` Batch 1 #3.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

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

BASE_URL = "https://gnomad.broadinstitute.org/api"
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5
REQUESTS_PER_SECOND = 5  # gnomAD asks for reasonable use; 5 rps is comfortable.
DEFAULT_DATASET = "gnomad_r4"  # GRCh38 short-variant dataset, most current as of 2024-26.
DEFAULT_REFERENCE_GENOME = "GRCh38"

# GraphQL query for a single variant by variant ID (chrom-pos-ref-alt).
_VARIANT_QUERY = """
query Variant($variantId: String!, $dataset: DatasetId!) {
  variant(variantId: $variantId, dataset: $dataset) {
    variant_id
    reference_genome
    chrom
    pos
    ref
    alt
    rsids
    exome {
      ac
      an
      af
      filters
      populations { id ac an af }
    }
    genome {
      ac
      an
      af
      filters
      populations { id ac an af }
    }
    transcript_consequences {
      gene_id
      gene_symbol
      consequence_terms
      is_canonical
    }
  }
}
"""

# GraphQL query for a gene's variants (capped server-side at the dataset's gene scope).
_GENE_QUERY = """
query Gene($geneSymbol: String!, $referenceGenome: ReferenceGenomeId!) {
  gene(gene_symbol: $geneSymbol, reference_genome: $referenceGenome) {
    gene_id
    symbol
    chrom
    start
    stop
  }
}
"""


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class GnomadError(Exception):
    """Base exception for gnomAD adapter errors."""


class GnomadNotFoundError(GnomadError):
    """Raised when a queried variant or gene returns no data."""


class GnomadAPIError(GnomadError):
    """Raised on unexpected HTTP status or GraphQL ``errors`` payload."""


class GnomadRateLimitError(GnomadError):
    """Raised when gnomAD returns 429 or when the adapter is self-throttling."""


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class GnomadAdapter(DatabaseAdapter):
    """Async adapter for the gnomAD GraphQL API.

    Configuration keys (all optional):

    * ``base_url``         — override the default GraphQL endpoint.
    * ``timeout``          — total request timeout in seconds (default 30).
    * ``max_retries``      — retries on transient errors (default 3).
    * ``cache_ttl``        — in-memory cache TTL in seconds (default 3600).
    * ``dataset``          — dataset ID (default ``gnomad_r4``).
    * ``reference_genome`` — reference genome (default ``GRCh38``).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._base_url: str = self.config.get("base_url", BASE_URL).rstrip("/")
        self._timeout: httpx.Timeout = httpx.Timeout(
            self.config.get("timeout", 30.0), connect=10.0
        )
        self._max_retries: int = int(self.config.get("max_retries", MAX_RETRIES))
        self._cache_ttl = int(self.config.get("cache_ttl", 3600))
        self._dataset: str = self.config.get("dataset", DEFAULT_DATASET)
        self._reference_genome: str = self.config.get(
            "reference_genome", DEFAULT_REFERENCE_GENOME
        )
        self._client: Optional[httpx.AsyncClient] = None

        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._min_interval: float = 1.0 / REQUESTS_PER_SECOND
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "gnomAD"

    @property
    def source_version(self) -> str:
        return f"{self._dataset}/{self._reference_genome}"

    # -- HTTP plumbing --------------------------------------------------------

    def _cache_key(self, query: str, variables: Dict[str, Any]) -> str:
        payload = json.dumps(
            {"query": query, "variables": variables}, sort_keys=True
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    async def _enforce_rate_limit(self) -> None:
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _graphql(
        self, query: str, variables: Dict[str, Any]
    ) -> Dict[str, Any]:
        """POST a GraphQL request with retry, rate-limit and cache."""
        cache_key = self._cache_key(query, variables)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._client is None:
            raise GnomadError("HTTP client not initialised — call connect() first.")

        body = {"query": query, "variables": variables}
        last_exception: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._semaphore:
                    await self._enforce_rate_limit()
                    resp = await self._client.post(self._base_url, json=body)
                    if resp.status_code == 404:
                        raise GnomadNotFoundError(
                            "gnomAD endpoint not found (check base_url)"
                        )
                    if resp.status_code == 429:
                        raise GnomadRateLimitError("Rate limited by gnomAD")
                    if 500 <= resp.status_code < 600:
                        last_exception = httpx.HTTPStatusError(
                            f"{resp.status_code} server error",
                            request=resp.request,
                            response=resp,
                        )
                        wait = RETRY_BACKOFF * attempt
                        logger.warning(
                            "gnomAD transient %s on attempt %d/%d — retrying in %.1fs",
                            resp.status_code,
                            attempt,
                            self._max_retries,
                            wait,
                        )
                        await asyncio.sleep(wait)
                        continue
                    if resp.status_code >= 400:
                        raise GnomadAPIError(
                            f"gnomAD API error {resp.status_code}: {resp.text[:200]}"
                        )
                    data = resp.json()
                    errors = data.get("errors")
                    if errors:
                        # GraphQL surfaces partial results alongside errors;
                        # we refuse the partial set rather than emit half-data.
                        messages = "; ".join(
                            e.get("message", "unknown") for e in errors
                        )
                        raise GnomadAPIError(f"gnomAD GraphQL errors: {messages}")
                    self._cache[cache_key] = data
                    return data
            except (httpx.RequestError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "gnomAD network error on attempt %d/%d — retrying in %.1fs (%s)",
                    attempt,
                    self._max_retries,
                    wait,
                    exc,
                )
                await asyncio.sleep(wait)

        raise GnomadAPIError(
            f"gnomAD request failed after {self._max_retries} attempts"
        ) from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise httpx client and verify gnomAD GraphQL is reachable."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "User-Agent": "DeepSynaps-GnomadAdapter/1.0",
                },
            )
        try:
            # Lightweight ping: a minimal valid GraphQL introspection-ish query.
            # gnomAD exposes a typename always; this checks the endpoint is up.
            await self._graphql("{ __typename }", {})
            self._connected = True
            logger.info("GnomadAdapter connected — %s", self._base_url)
            return True
        except GnomadError as exc:
            logger.warning("GnomadAdapter connect failed: %s", exc)
            self._connected = False
            return False

    async def disconnect(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        self._cache.clear()
        self._connected = False
        logger.info("GnomadAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Any) -> List[Dict[str, Any]]:
        """Execute a gnomAD query.

        Query forms:

        * ``str`` — interpreted as a variant ID (chrom-pos-ref-alt or rsid).
        * ``dict`` keys (at least one of variant_id / gene_symbol required):
            - ``variant_id``  : single variant identifier
            - ``variant_ids`` : list of variant identifiers (fans out)
            - ``gene_symbol`` : gene symbol (e.g. ``BDNF``)
            - ``dataset``     : override the default dataset ID for this call
        """
        if not self._connected:
            await self.connect()

        if isinstance(query, str):
            query = {"variant_id": query}
        if not isinstance(query, dict):
            raise GnomadError("Query must be a string or a dict.")

        dataset = query.get("dataset") or self._dataset

        if query.get("gene_symbol"):
            return await self._fetch_gene(str(query["gene_symbol"]))

        variant_ids: List[str] = []
        if query.get("variant_ids"):
            variant_ids = [str(v) for v in query["variant_ids"]]
        elif query.get("variant_id"):
            variant_ids = [str(query["variant_id"])]

        if not variant_ids:
            raise GnomadError(
                "Query requires one of: variant_id, variant_ids, gene_symbol."
            )

        records: List[Dict[str, Any]] = []
        for vid in variant_ids:
            rec = await self._fetch_variant(vid, dataset)
            if rec is not None:
                records.append(rec)
        return records

    async def _fetch_variant(
        self, variant_id: str, dataset: str
    ) -> Optional[Dict[str, Any]]:
        data = await self._graphql(
            _VARIANT_QUERY, {"variantId": variant_id, "dataset": dataset}
        )
        return (data.get("data") or {}).get("variant")

    async def _fetch_gene(self, gene_symbol: str) -> List[Dict[str, Any]]:
        data = await self._graphql(
            _GENE_QUERY,
            {
                "geneSymbol": gene_symbol,
                "referenceGenome": self._reference_genome,
            },
        )
        gene = (data.get("data") or {}).get("gene")
        if gene is None:
            return []
        # Wrap as a single record so downstream normalize() can handle it.
        return [{"_gene_record": True, **gene}]

    # -- normalize ------------------------------------------------------------

    async def normalize(
        self, raw_records: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            if not raw:
                continue
            if raw.get("_gene_record"):
                norm = self._normalize_gene(raw)
            else:
                norm = self._normalize_variant(raw)
            if norm:
                normalised.append(norm)
        return normalised

    @staticmethod
    def _normalize_variant(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        variant_id = raw.get("variant_id")
        if not variant_id:
            return None

        exome = raw.get("exome") or {}
        genome = raw.get("genome") or {}

        # Prefer genome dataset, fall back to exome — both can be present.
        def _af(field: Dict[str, Any]) -> Optional[float]:
            v = field.get("af")
            return float(v) if v is not None else None

        # Pull canonical consequence + gene from transcript_consequences[0].
        consequences = raw.get("transcript_consequences") or []
        canonical = next(
            (c for c in consequences if isinstance(c, dict) and c.get("is_canonical")),
            consequences[0] if consequences else {},
        )
        if not isinstance(canonical, dict):
            canonical = {}
        consequence_terms = canonical.get("consequence_terms") or []
        primary_consequence = (
            consequence_terms[0] if isinstance(consequence_terms, list) and consequence_terms else ""
        )

        return {
            "variant_id": variant_id,
            "reference_genome": raw.get("reference_genome", ""),
            "chromosome": raw.get("chrom", ""),
            "position": raw.get("pos"),
            "ref": raw.get("ref", ""),
            "alt": raw.get("alt", ""),
            "rsids": list(raw.get("rsids") or []),
            "exome_ac": exome.get("ac"),
            "exome_an": exome.get("an"),
            "exome_af": _af(exome),
            "exome_filters": list(exome.get("filters") or []),
            "exome_populations": list(exome.get("populations") or []),
            "genome_ac": genome.get("ac"),
            "genome_an": genome.get("an"),
            "genome_af": _af(genome),
            "genome_filters": list(genome.get("filters") or []),
            "genome_populations": list(genome.get("populations") or []),
            "gene_symbol": canonical.get("gene_symbol", ""),
            "gene_id": canonical.get("gene_id", ""),
            "consequence": primary_consequence,
            "consequence_terms": list(consequence_terms),
            "_raw": raw,
        }

    @staticmethod
    def _normalize_gene(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        gene_id = raw.get("gene_id")
        symbol = raw.get("symbol")
        if not gene_id or not symbol:
            return None
        return {
            "_record_type": "gene",
            "gene_id": gene_id,
            "gene_symbol": symbol,
            "chromosome": raw.get("chrom", ""),
            "start": raw.get("start"),
            "stop": raw.get("stop"),
            "_raw": raw,
        }

    # -- validate -------------------------------------------------------------

    async def validate(
        self, normalized_records: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        validated: List[Dict[str, Any]] = []
        for record in normalized_records:
            record["_valid"] = self._is_valid(record)
            confidence = self.get_confidence(record)
            record["_confidence"] = confidence.value
            record["_evidence_level"] = self._evidence_level_for(record).value
            record["_provenance"] = self.get_provenance(record).to_dict()
            validated.append(record)
        return validated

    @staticmethod
    def _is_valid(record: Dict[str, Any]) -> bool:
        # Gene record: just gene_id + symbol required.
        if record.get("_record_type") == "gene":
            return bool(record.get("gene_id")) and bool(record.get("gene_symbol"))
        # Variant record: variant_id + chrom + at least one AF source.
        return (
            bool(record.get("variant_id"))
            and bool(record.get("chromosome"))
            and (
                record.get("exome_af") is not None
                or record.get("genome_af") is not None
            )
        )

    @staticmethod
    def _evidence_level_for(record: Dict[str, Any]) -> EvidenceLevel:
        # gnomAD is observational population-genomics — cohort study tier.
        return EvidenceLevel.COHORT_STUDY

    # -- provenance & governance ---------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=str(
                record.get("variant_id") or record.get("gene_id") or "unknown"
            ),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="ODC-BY 1.0 (data) / CC-BY 4.0 (publication)",
            confidence_tier=self.get_confidence(record),
            evidence_level=self._evidence_level_for(record),
            citation_doi="10.1038/s41586-020-2308-7",  # Karczewski 2020 gnomAD flagship
            attribution_text=(
                "Population allele frequencies courtesy of the Broad Institute "
                "Genome Aggregation Database (gnomAD). Karczewski et al., "
                "Nature 2020, doi:10.1038/s41586-020-2308-7."
            ),
            # gnomAD population frequencies are NOT clinical interpretations.
            # Mark research-only so consumers must not present an allele
            # frequency as a clinical risk number without further review.
            research_only=True,
            retrieval_method="direct",
            data_quality_score=self._data_quality_score(record),
        )

    @staticmethod
    def _data_quality_score(record: Dict[str, Any]) -> float:
        # Variant records score by completeness of frequency data + consequence.
        if record.get("_record_type") == "gene":
            score = 0.3
            if record.get("chromosome"):
                score += 0.2
            if record.get("start") and record.get("stop"):
                score += 0.2
            return round(min(score, 1.0), 4)
        score = 0.0
        if record.get("variant_id"):
            score += 0.20
        if record.get("rsids"):
            score += 0.10
        if record.get("exome_af") is not None:
            score += 0.20
        if record.get("genome_af") is not None:
            score += 0.20
        if record.get("consequence"):
            score += 0.15
        if record.get("gene_symbol"):
            score += 0.15
        return round(min(score, 1.0), 4)

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="ODC-BY 1.0 (data) / CC-BY 4.0 (publication)",
            license_url="https://gnomad.broadinstitute.org/policies",
            attribution_text=(
                "Population allele frequencies courtesy of the Broad Institute "
                "Genome Aggregation Database (gnomAD). Karczewski et al., "
                "Nature 2020, doi:10.1038/s41586-020-2308-7."
            ),
            commercial_use_allowed=True,
            allows_research=True,
            allows_commercial=True,
            requires_attribution=True,
            requires_share_alike=False,
            share_alike=False,
            modification_allowed=True,
            redistribution_allowed=True,
            restrictions=[
                "Attribute Karczewski et al. 2020 in any published work.",
                "Allele frequencies are NOT clinical interpretations; do not "
                "present a gnomAD AF as a clinical risk percentage.",
                "Respect the dataset's reasonable-use policy.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        # gnomAD population frequencies have HIGH confidence as observational
        # data — the dataset is the field's reference standard. Confidence
        # here is about the AF estimate, not about any clinical claim.
        if record.get("_record_type") == "gene":
            return ConfidenceTier.HIGH
        # Variant: HIGH only if there are enough alleles in at least one dataset.
        for ac_field in ("genome_an", "exome_an"):
            an = record.get(ac_field)
            if isinstance(an, (int, float)) and an >= 1000:
                return ConfidenceTier.HIGH
        # AF present but small sample — MEDIUM.
        if (
            record.get("genome_af") is not None
            or record.get("exome_af") is not None
        ):
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.LOW

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        if not self._client or self._client.is_closed:
            return {
                "status": "down",
                "latency_ms": None,
                "source": self.source_name,
                "error": "Client closed",
            }
        start = asyncio.get_event_loop().time()
        try:
            await self._graphql("{ __typename }", {})
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "base_url": self._base_url,
                "dataset": self._dataset,
                "reference_genome": self._reference_genome,
                "rate_limit_per_second": REQUESTS_PER_SECOND,
            }
        except GnomadError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "error": str(exc),
            }
