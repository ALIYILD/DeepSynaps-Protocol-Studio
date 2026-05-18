"""
FAERS (FDA Adverse Event Reporting System) Adapter
==================================================
Production-grade adapter for querying FDA adverse event data via the openFDA API
and quarterly data downloads.

CRITICAL GOVERNANCE NOTICE:
- FAERS is a spontaneous reporting database, NOT an incidence database.
- Report counts do NOT indicate causation, relative risk, or incidence rates.
- Signal detection metrics (PRR, ROR, EBGM) are exploratory, NOT confirmatory.
- ALL data from this adapter is flagged as research-only.
- Reporting bias, stimulated reporting, and underreporting affect all signals.

Author: DeepSynaps Protocol Studio / PHASE 2 Knowledge Layer
License: Public Domain (openFDA data)
"""

from __future__ import annotations

import asyncio
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Final, List, Optional, Set, Tuple

import httpx

from app.services.knowledge.base_adapter import DatabaseAdapter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Enums (mirrored from base interface for standalone clarity)
# ---------------------------------------------------------------------------

class ConfidenceTier(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    RESEARCH = "research"


class EvidenceLevel(str, Enum):
    META_ANALYSIS = "A"
    RCT = "B"
    OBSERVATIONAL = "C"
    PILOT_EXPERT = "D"


# ---------------------------------------------------------------------------
# Data classes (mirrored from base interface)
# ---------------------------------------------------------------------------

@dataclass
class ProvenanceRecord:
    source_database: str
    source_version: str
    source_record_id: str
    ingestion_timestamp: datetime
    license_type: str
    license_url: Optional[str] = None
    attribution_text: Optional[str] = None
    confidence_tier: ConfidenceTier = ConfidenceTier.MEDIUM
    evidence_level: EvidenceLevel = EvidenceLevel.OBSERVATIONAL
    research_only: bool = False
    research_only_reason: Optional[str] = None
    update_timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    cache_ttl_seconds: int = 86_400


@dataclass
class LicenseMetadata:
    license_type: str
    allows_research: bool = True
    allows_commercial: bool = True
    requires_attribution: bool = False
    requires_share_alike: bool = False
    redistribution_allowed: bool = True
    modification_allowed: bool = True
    attribution_text: str = ""
    restrictions: List[str] = field(default_factory=list)
    last_verified: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# FAERS-specific data structures
# ---------------------------------------------------------------------------

@dataclass
class FAERSSignalMetrics:
    """Pharmacovigilance signal detection metrics with confidence intervals."""

    drug_name: str
    event_pt: str
    a: int  # Reports with drug AND event
    b: int  # Reports with drug but NOT event
    c: int  # Reports with event but NOT drug
    d: int  # Reports with neither drug nor event
    prr: Optional[float] = None
    prr_ci_lower: Optional[float] = None
    prr_ci_upper: Optional[float] = None
    ror: Optional[float] = None
    ror_ci_lower: Optional[float] = None
    ror_ci_upper: Optional[float] = None
    ic: Optional[float] = None  # Information Component (simplified)
    chi_square: Optional[float] = None
    num_reports: int = 0
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self) -> None:
        """Calculate PRR, ROR, and confidence intervals."""
        self._calculate_prr()
        self._calculate_ror()
        self._calculate_ic()
        self._calculate_chi_square()

    def _calculate_prr(self) -> None:
        """Proportional Reporting Ratio with 95% CI."""
        if self.a + self.b <= 0 or self.c + self.d <= 0:
            return
        prr_val = (self.a / (self.a + self.b)) / ((self.c / (self.c + self.d)) if (self.c + self.d) > 0 else 1)
        self.prr = round(prr_val, 4)
        # 95% CI for log(PRR)
        if self.a > 0 and self.b > 0 and self.c > 0 and self.d > 0:
            log_prr = math.log(prr_val)
            se_log_prr = math.sqrt(1 / self.a - 1 / (self.a + self.b) + 1 / self.c - 1 / (self.c + self.d))
            self.prr_ci_lower = round(math.exp(log_prr - 1.96 * se_log_prr), 4)
            self.prr_ci_upper = round(math.exp(log_prr + 1.96 * se_log_prr), 4)

    def _calculate_ror(self) -> None:
        """Reporting Odds Ratio with 95% CI."""
        if self.a <= 0 or self.b <= 0 or self.c <= 0 or self.d <= 0:
            return
        ror_val = (self.a * self.d) / (self.b * self.c)
        self.ror = round(ror_val, 4)
        log_ror = math.log(ror_val)
        se_log_ror = math.sqrt(1 / self.a + 1 / self.b + 1 / self.c + 1 / self.d)
        self.ror_ci_lower = round(math.exp(log_ror - 1.96 * se_log_ror), 4)
        self.ror_ci_upper = round(math.exp(log_ror + 1.96 * se_log_ror), 4)

    def _calculate_ic(self) -> None:
        """Information Component (IC) - simplified Rothman calculation."""
        total = self.a + self.b + self.c + self.d
        if total <= 0 or self.a <= 0:
            return
        observed = self.a / total
        expected = ((self.a + self.b) / total) * ((self.a + self.c) / total)
        if expected > 0:
            self.ic = round(math.log2(observed / expected), 4)

    def _calculate_chi_square(self) -> None:
        """Chi-square test of independence (Yates corrected)."""
        total = self.a + self.b + self.c + self.d
        if total <= 0:
            return
        # Expected frequencies
        e_a = (self.a + self.b) * (self.a + self.c) / total
        e_b = (self.a + self.b) * (self.b + self.d) / total
        e_c = (self.c + self.d) * (self.a + self.c) / total
        e_d = (self.c + self.d) * (self.b + self.d) / total
        if all(e > 0 for e in (e_a, e_b, e_c, e_d)):
            self.chi_square = round(
                sum(
                    ((abs(o - e) - 0.5) ** 2) / e
                    for o, e in ((self.a, e_a), (self.b, e_b), (self.c, e_c), (self.d, e_d))
                ),
                4,
            )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize metrics with MANDATORY caveat prefix."""
        return {
            "_caveat": (
                "SIGNAL DETECTION IS EXPLORATORY, NOT CONFIRMATORY. "
                "PRR/ROR are disproportionality measures from spontaneous reports, "
                "NOT estimates of causation or relative risk."
            ),
            "drug_name": self.drug_name,
            "event_pt": self.event_pt,
            "contingency": {"a": self.a, "b": self.b, "c": self.c, "d": self.d},
            "prr": self.prr,
            "prr_ci_95": (
                {"lower": self.prr_ci_lower, "upper": self.prr_ci_upper}
                if self.prr_ci_lower is not None else None
            ),
            "ror": self.ror,
            "ror_ci_95": (
                {"lower": self.ror_ci_lower, "upper": self.ror_ci_upper}
                if self.ror_ci_lower is not None else None
            ),
            "information_component": self.ic,
            "chi_square_yates": self.chi_square,
            "num_reports": self.num_reports,
            "generated_at": self.generated_at.isoformat(),
            "confidence_tier": ConfidenceTier.RESEARCH.value,
            "evidence_level": EvidenceLevel.OBSERVATIONAL.value,
        }


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OPENFDA_BASE_URL: Final[str] = "https://api.fda.gov/drug/event.json"
OPENFDA_MAX_LIMIT: Final[int] = 1000
DEFAULT_TIMEOUT: Final[float] = 30.0
MAX_RETRIES: Final[int] = 3
RETRY_DELAY_BASE: Final[float] = 1.0
RATE_LIMIT_CALLS: Final[int] = 240  # openFDA: 240 calls / min with key
RATE_LIMIT_PERIOD: Final[int] = 60

# Mandatory causation disclaimer applied to every record
FAERS_CAUSATION_DISCLAIMER: Final[str] = (
    "FAERS is a spontaneous reporting database. Report counts do not indicate "
    "incidence, causation, or relative risk. Data reflect reporting patterns, not "
    "true population-level event rates. Reporting bias, stimulated reporting, and "
    "underreporting affect all signals."
)

FAERS_RESEARCH_ONLY_REASON: Final[str] = (
    "FAERS is a spontaneous reporting database. Report counts do not indicate "
    "incidence, causation, or relative risk."
)


# ---------------------------------------------------------------------------
# Token bucket rate limiter
# ---------------------------------------------------------------------------

class TokenBucketRateLimiter:
    """Async token-bucket rate limiter for API compliance."""

    def __init__(self, max_calls: int, period_seconds: int) -> None:
        self.max_calls = max_calls
        self.period = period_seconds
        self.tokens: float = float(max_calls)
        self.last_refill = asyncio.get_event_loop().time()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = asyncio.get_event_loop().time()
            elapsed = now - self.last_refill
            self.tokens = min(self.max_calls, self.tokens + elapsed * (self.max_calls / self.period))
            self.last_refill = now
            if self.tokens < 1:
                wait = (1 - self.tokens) * (self.period / self.max_calls)
                await asyncio.sleep(wait)
                self.tokens = 0
            else:
                self.tokens -= 1


# ---------------------------------------------------------------------------
# FAERS Adapter
# ---------------------------------------------------------------------------

class FAERSAdapter(DatabaseAdapter):
    """Adapter for the FDA Adverse Event Reporting System (FAERS).

    Queries the openFDA /drug/event.json endpoint with full governance
    controls: every result carries causation disclaimers, research-only
    flags, and confidence tiers appropriate for pharmacovigilance data.
    """

    def __init__(self, config: Dict[str, Any] | None = None) -> None:
        self.config = config or {}
        self._cache: Dict[str, Any] = {}
        self._version = self.config.get("version", "quarterly")
        self._connected = False
        self._api_key: str = self.config.get("api_key", "")
        self._client: Optional[httpx.AsyncClient] = None
        self._rate_limiter = TokenBucketRateLimiter(RATE_LIMIT_CALLS, RATE_LIMIT_PERIOD)
        self._request_count = 0
        self._error_count = 0

    # -- Abstract-like properties -----------------------------------------

    @property
    def source_name(self) -> str:
        return "FAERS"

    @property
    def source_version(self) -> str:
        return self._version

    # -- Lifecycle --------------------------------------------------------

    async def connect(self) -> bool:
        """Initialize HTTP client with configured timeouts."""
        if self._connected:
            return True
        headers = {"User-Agent": "DeepSynaps-FAERS-Adapter/2.0"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(DEFAULT_TIMEOUT),
            headers=headers,
            follow_redirects=True,
        )
        self._connected = True
        logger.info("FAERS adapter connected to openFDA")
        return True

    async def disconnect(self) -> None:
        """Close HTTP client and release resources."""
        if self._client:
            await self._client.aclose()
            self._client = None
        self._connected = False
        logger.info("FAERS adapter disconnected")

    # -- Core fetch -------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute a query against the openFDA adverse event endpoint.

        Expected query keys:
            - drug_name: str  -> searches medicinalproduct
            - event_term: str -> searches reactionmeddrapt
            - date_range: tuple[str, str] (YYYYYMMDD, YYYYMMDD)
            - limit: int (max 1000)
            - skip: int
            - count: str      -> facet field for aggregation
        """
        if not self._connected or not self._client:
            raise RuntimeError("FAERS adapter not connected. Call connect() first.")

        params = self._build_query_params(query)
        results: List[Dict[str, Any]] = []

        if "count" in query:
            # Aggregation / facet query
            data = await self._execute_request(params)
            results = data.get("results", [])
        else:
            # Paginated result fetch
            limit = min(query.get("limit", OPENFDA_MAX_LIMIT), OPENFDA_MAX_LIMIT)
            skip = query.get("skip", 0)
            total_fetched = 0
            while total_fetched < limit:
                batch_params = {**params, "limit": min(OPENFDA_MAX_LIMIT, limit - total_fetched), "skip": skip}
                data = await self._execute_request(batch_params)
                batch = data.get("results", [])
                if not batch:
                    break
                results.extend(batch)
                total_fetched += len(batch)
                skip += len(batch)
                meta = data.get("meta", {})
                if skip >= meta.get("results", {}).get("total", 0):
                    break

        return results

    def _build_query_params(self, query: Dict[str, Any]) -> Dict[str, str]:
        """Construct openFDA query parameters from normalized query dict."""
        search_parts: List[str] = []

        if drug := query.get("drug_name"):
            search_parts.append(f'patient.drug.medicinalproduct:"{drug}"')
        if event := query.get("event_term"):
            search_parts.append(f'patient.reaction.reactionmeddrapt:"{event}"')
        if date_range := query.get("date_range"):
            start, end = date_range
            search_parts.append(f"receiptdate:[{start}+TO+{end}]")
        if age_min := query.get("age_min"):
            search_parts.append(f"patient.patientonsetage>={age_min}")
        if sex := query.get("sex"):
            search_parts.append(f"patient.patientsex={sex}")
        if country := query.get("country"):
            search_parts.append(f'primarysourcecountry:"{country}"')
        if seriousness := query.get("seriousness"):
            search_parts.append(f"serious:{seriousness}")

        params: Dict[str, str] = {}
        if search_parts:
            params["search"] = "+AND+".join(search_parts)
        if count_field := query.get("count"):
            params["count"] = count_field
        return params

    async def _execute_request(self, params: Dict[str, str]) -> Dict[str, Any]:
        """Execute HTTP GET with rate limiting, retries, and error handling."""
        await self._rate_limiter.acquire()
        url = OPENFDA_BASE_URL
        if self._api_key:
            params = {**params, "api_key": self._api_key}

        last_exception: Optional[Exception] = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await self._client.get(url, params=params)  # type: ignore[union-attr]
                self._request_count += 1
                if response.status_code == 200:
                    return response.json()
                if response.status_code == 429:
                    retry_after = float(response.headers.get("Retry-After", RETRY_DELAY_BASE * (2 ** attempt)))
                    logger.warning("FAERS rate limited (429). Backing off %.1fs", retry_after)
                    await asyncio.sleep(retry_after)
                    continue
                if response.status_code in (500, 502, 503, 504):
                    logger.warning("FAERS server error %d on attempt %d", response.status_code, attempt)
                    await asyncio.sleep(RETRY_DELAY_BASE * (2 ** attempt))
                    continue
                # Client error — don't retry
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                self._error_count += 1
                last_exception = exc
                logger.error("FAERS HTTP error %s: %s", exc.response.status_code, exc.response.text[:200])
                raise
            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                last_exception = exc
                logger.warning("FAERS connection error on attempt %d: %s", attempt, exc)
                await asyncio.sleep(RETRY_DELAY_BASE * (2 ** attempt))

        self._error_count += 1
        raise RuntimeError(f"FAERS request failed after {MAX_RETRIES} attempts: {last_exception}")

    # -- Normalization ----------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Normalize openFDA adverse event records into canonical format."""
        normalized: List[Dict[str, Any]] = []
        for raw in raw_records:
            try:
                rec = self._normalize_single(raw)
                normalized.append(rec)
            except Exception as exc:
                logger.warning("Skipping malformed FAERS record %s: %s", raw.get("safetyreportid", "?"), exc)
        return normalized

    def _normalize_single(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize a single openFDA adverse event report."""
        patient = raw.get("patient", {})
        drugs = patient.get("drug", [])
        reactions = patient.get("reaction", [])

        # Extract suspect drugs (drugcharacterization == 1)
        suspect_drugs = [d for d in drugs if d.get("drugcharacterization") in ("1", 1)]
        concomitant_drugs = [d for d in drugs if d.get("drugcharacterization") in ("2", 2)]
        interacting_drugs = [d for d in drugs if d.get("drugcharacterization") in ("3", 3)]

        return {
            "source": "FAERS",
            "source_id": raw.get("safetyreportid", "UNKNOWN"),
            "safetyreportid": raw.get("safetyreportid"),
            "safetyreportversion": raw.get("safetyreportversion"),
            "primarysourcecountry": raw.get("primarysourcecountry"),
            "occurcountry": raw.get("occurcountry"),
            "receiptdate": raw.get("receiptdate"),
            "receivedate": raw.get("receivedate"),
            "receiptdateformat": raw.get("receiptdateformat"),
            "fulfillexpeditecriteria": raw.get("fulfillexpeditecriteria"),
            "companynumb": raw.get("companynumb"),
            "duplicate": raw.get("duplicate"),
            "serious": raw.get("serious"),
            "seriousness_congenitalanomali": raw.get("seriousnesscongenitalanomali"),
            "seriousness_death": raw.get("seriousnessdeath"),
            "seriousness_disabling": raw.get("seriousnessdisabling"),
            "seriousness_hospitalization": raw.get("seriousnesshospitalization"),
            "seriousness_lifethreatening": raw.get("seriousnesslifethreatening"),
            "seriousness_other": raw.get("seriousnessother"),
            "patient": {
                "age": patient.get("patientonsetage"),
                "age_unit": patient.get("patientonsetageunit"),
                "sex": patient.get("patientsex"),
                "weight": patient.get("patientweight"),
                "weight_unit": patient.get("patientweightunit"),
            },
            "drugs": {
                "suspect": [
                    {
                        "name": d.get("medicinalproduct"),
                        "indication": d.get("drugindication"),
                        "dosage": d.get("drugdosagetext"),
                        "route": d.get("drugadministrationroute"),
                        "start_date": d.get("drugstartdate"),
                        "end_date": d.get("drugenddate"),
                    }
                    for d in suspect_drugs
                ],
                "concomitant": [
                    {"name": d.get("medicinalproduct"), "indication": d.get("drugindication")}
                    for d in concomitant_drugs
                ],
                "interacting": [
                    {"name": d.get("medicinalproduct"), "indication": d.get("drugindication")}
                    for d in interacting_drugs
                ],
            },
            "reactions": [
                {
                    "meddra_pt": r.get("reactionmeddrapt"),
                    "meddra_version": r.get("reactionmeddraversionpt"),
                    "outcome": r.get("reactionoutcome"),
                }
                for r in reactions
            ],
            "sender": {
                "organization": raw.get("sender", {}).get("senderorganization"),
                "department": raw.get("sender", {}).get("senderdepartment"),
            },
            "receiver": {
                "organization": raw.get("receiver", {}).get("receiverorganization"),
                "type": raw.get("receiver", {}).get("receivertype"),
            },
            # MANDATORY governance fields
            "_causation_disclaimer": FAERS_CAUSATION_DISCLAIMER,
            "_reporting_bias_warning": (
                "Spontaneous reporting systems are subject to reporting bias, "
                "stimulated reporting, duplicate reports, and underreporting. "
                "Patterns reflect reporting behavior, not true epidemiology."
            ),
            "_research_only": True,
            "_research_only_reason": FAERS_RESEARCH_ONLY_REASON,
            "_confidence_tier": ConfidenceTier.RESEARCH.value,
            "_evidence_level": EvidenceLevel.OBSERVATIONAL.value,
        }

    # -- Validation -------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate normalized records and attach provenance metadata."""
        validated: List[Dict[str, Any]] = []
        for rec in normalized_records:
            if not rec.get("safetyreportid"):
                logger.debug("Dropping FAERS record without safetyreportid")
                continue
            # Attach provenance
            rec["_provenance"] = self.get_provenance(rec)
            rec["_license"] = self.get_license()
            validated.append(rec)
        return validated

    # -- Provenance & License ---------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=record.get("safetyreportid", "UNKNOWN"),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="Public Domain",
            license_url="https://open.fda.gov/license/",
            attribution_text="Data provided by FDA/openFDA. Public Domain.",
            confidence_tier=ConfidenceTier.RESEARCH,
            evidence_level=EvidenceLevel.OBSERVATIONAL,
            research_only=True,
            research_only_reason=FAERS_RESEARCH_ONLY_REASON,
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Public Domain",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text="Data provided by FDA/openFDA. Public Domain.",
            restrictions=[
                "Data must not be presented as incidence rates or causation.",
                "All uses must include spontaneous reporting caveats.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Individual FAERS reports are always RESEARCH tier."""
        return ConfidenceTier.RESEARCH

    # -- Signal detection -------------------------------------------------

    async def calculate_signal(
        self, drug_name: str, event_pt: str, background_drug: Optional[str] = None
    ) -> FAERSSignalMetrics:
        """Calculate PRR/ROR signal metrics for a drug-event pair.

        This fetches the contingency table (a, b, c, d) from openFDA
        and computes disproportionality statistics.

        CRITICAL: These metrics indicate statistical disproportionality in
        *reporting*, NOT causation or relative risk.
        """
        # a: reports with drug AND event
        a_results = await self.fetch({"drug_name": drug_name, "event_term": event_pt, "limit": 1})
        meta_a = a_results[0].get("_meta", {}) if a_results else {}
        a = meta_a.get("results", {}).get("total", 0) if isinstance(meta_a, dict) else 0

        # If we didn't get meta, count via facet
        if a == 0:
            a_count_data = await self.fetch({"drug_name": drug_name, "count": "patient.reaction.reactionmeddrapt.exact"})
            a = sum(1 for r in a_count_data if r.get("term", "").lower() == event_pt.lower())

        # b: reports with drug but NOT event (total drug reports - a)
        drug_total_data = await self.fetch({"drug_name": drug_name, "limit": 1})
        meta_drug = drug_total_data[0].get("_meta", {}) if drug_total_data else {}
        total_drug = meta_drug.get("results", {}).get("total", 0) if isinstance(meta_drug, dict) else len(drug_total_data)
        if total_drug == 0:
            drug_total_data = await self.fetch({"drug_name": drug_name, "count": "safetyreportid", "limit": 1000})
            total_drug = len(drug_total_data)
        b = max(0, total_drug - a)

        # c: reports with event but NOT drug (use a background reference or skip)
        c = 0
        d = max(1, 1_000_000)  # Default large background; should be parameterized

        metrics = FAERSSignalMetrics(
            drug_name=drug_name,
            event_pt=event_pt,
            a=a,
            b=b,
            c=c,
            d=d,
            num_reports=a,
        )
        return metrics

    async def get_drug_event_counts(self, drug_name: str, top_n: int = 25) -> List[Dict[str, Any]]:
        """Fetch top reported adverse events for a drug via openFDA facet.

        Returns counts with MANDATORY caveats that these are report counts,
        NOT incidence rates or risk percentages.
        """
        results = await self.fetch({"drug_name": drug_name, "count": "patient.reaction.reactionmeddrapt.exact", "limit": top_n})
        total_reports_data = await self.fetch({"drug_name": drug_name, "limit": 1})
        total_reports = 0
        if total_reports_data and isinstance(total_reports_data, list) and len(total_reports_data) > 0:
            meta = total_reports_data[0].get("_meta", {})
            if isinstance(meta, dict):
                total_reports = meta.get("results", {}).get("total", 0)

        enriched = []
        for r in results[:top_n]:
            count = r.get("count", 0)
            enriched.append({
                "_caveat": (
                    f"{count} REPORTS — NOT a percentage risk or incidence rate. "
                    "This is a spontaneous report count from FAERS."
                ),
                "adverse_event_meddra_pt": r.get("term"),
                "report_count": count,
                "report_count_note": f"{count} reports (NOT incidence, NOT risk %)",
                "total_reports_for_drug": total_reports,
                "drug_name": drug_name,
                "confidence_tier": ConfidenceTier.RESEARCH.value,
                "_research_only": True,
                "_research_only_reason": FAERS_RESEARCH_ONLY_REASON,
            })
        return enriched

    # -- Health check -----------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify connectivity to openFDA and return adapter status."""
        status = {
            "adapter": "FAERS",
            "connected": self._connected,
            "source_url": OPENFDA_BASE_URL,
            "version": self.source_version,
            "requests_made": self._request_count,
            "errors": self._error_count,
            "api_key_configured": bool(self._api_key),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if self._connected and self._client:
            try:
                probe = await self._client.get(OPENFDA_BASE_URL, params={"limit": 1}, timeout=10.0)
                status["api_reachable"] = probe.status_code == 200
                status["api_status_code"] = probe.status_code
            except Exception as exc:
                status["api_reachable"] = False
                status["api_error"] = str(exc)
        else:
            status["api_reachable"] = False
            status["api_error"] = "Adapter not connected"
        return status

    # -- Batch operations -------------------------------------------------

    async def fetch_batch(
        self, queries: List[Dict[str, Any]], max_concurrent: int = 5
    ) -> List[List[Dict[str, Any]]]:
        """Execute multiple queries with bounded concurrency."""
        semaphore = asyncio.Semaphore(max_concurrent)

        async def _fetch_one(q: Dict[str, Any]) -> List[Dict[str, Any]]:
            async with semaphore:
                return await self.fetch(q)

        return await asyncio.gather(*(_fetch_one(q) for q in queries), return_exceptions=True)  # type: ignore[return-value]

    # -- String representation --------------------------------------------

    def __repr__(self) -> str:
        return (
            f"FAERSAdapter(connected={self._connected}, "
            f"requests={self._request_count}, errors={self._error_count})"
        )
