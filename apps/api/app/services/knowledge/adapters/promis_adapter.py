"""
PROMIS (Patient-Reported Outcomes Measurement Information System) Adapter.

Provides access to PROMIS instrument metadata, scoring parameters, and
population norms for clinical outcomes tracking. Supports both CAT
(Computerized Adaptive Testing) and fixed-length short-form instruments
across eight core domains.

Domains: Depression, Anxiety, Sleep Disturbance, Pain Interference,
         Cognitive Function, Fatigue, Anger, Social Isolation

Data source: PROMIS Assessment Center API (or manual TSV catalogs for
             offline/research use).

License: PROMIS terms — free for non-commercial research use; fees
         and separate licensing required for commercial/clinical use.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.utils.time_utils import utc_now
from typing import Any, Dict, List, Optional, Tuple

import aiohttp
from aiohttp import ClientTimeout

from app.services.knowledge.adapters.base import (
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

_PROMIS_API_BASE = "https://www.assessmentcenter.net/ac_api"
_PROMIS_DOMAINS: Dict[str, Dict[str, Any]] = {
    "depression": {
        "name": "Depression",
        "instrument_codes": ["PROMIS_Bank_Dep_v10", "PROMIS_SF_Dep_8a"],
        "item_count_cat": 4,
        "item_count_fixed": 8,
        "t_score_mean": 50.0,
        "t_score_sd": 10.0,
        "population_norms": "US_general_2011",
        "administration_mode": ["CAT", "fixed"],
        "min_items_cat": 4,
        "max_items_cat": 12,
        "reliability_target": 0.90,
        "score_range": (28.0, 84.0),
    },
    "anxiety": {
        "name": "Anxiety",
        "instrument_codes": ["PROMIS_Bank_Anxiety_v10", "PROMIS_SF_Anxiety_7a"],
        "item_count_cat": 4,
        "item_count_fixed": 7,
        "t_score_mean": 50.0,
        "t_score_sd": 10.0,
        "population_norms": "US_general_2011",
        "administration_mode": ["CAT", "fixed"],
        "min_items_cat": 4,
        "max_items_cat": 12,
        "reliability_target": 0.90,
        "score_range": (32.0, 82.0),
    },
    "sleep": {
        "name": "Sleep Disturbance",
        "instrument_codes": ["PROMIS_Bank_Sleep_v10", "PROMIS_SF_Sleep_8a"],
        "item_count_cat": 4,
        "item_count_fixed": 8,
        "t_score_mean": 50.0,
        "t_score_sd": 10.0,
        "population_norms": "US_general_2011",
        "administration_mode": ["CAT", "fixed"],
        "min_items_cat": 4,
        "max_items_cat": 12,
        "reliability_target": 0.90,
        "score_range": (30.0, 78.0),
    },
    "pain": {
        "name": "Pain Interference",
        "instrument_codes": ["PROMIS_Bank_PainInt_v10", "PROMIS_SF_PainInt_6a"],
        "item_count_cat": 4,
        "item_count_fixed": 6,
        "t_score_mean": 50.0,
        "t_score_sd": 10.0,
        "population_norms": "US_general_2011",
        "administration_mode": ["CAT", "fixed"],
        "min_items_cat": 4,
        "max_items_cat": 12,
        "reliability_target": 0.90,
        "score_range": (34.0, 78.0),
    },
    "cognitive": {
        "name": "Cognitive Function",
        "instrument_codes": ["PROMIS_Bank_CogFunc_v10", "PROMIS_SF_CogFunc_8a"],
        "item_count_cat": 4,
        "item_count_fixed": 8,
        "t_score_mean": 50.0,
        "t_score_sd": 10.0,
        "population_norms": "US_general_2011",
        "administration_mode": ["CAT", "fixed"],
        "min_items_cat": 4,
        "max_items_cat": 12,
        "reliability_target": 0.90,
        "score_range": (26.0, 76.0),
    },
    "fatigue": {
        "name": "Fatigue",
        "instrument_codes": ["PROMIS_Bank_Fatigue_v10", "PROMIS_SF_Fatigue_7a"],
        "item_count_cat": 4,
        "item_count_fixed": 7,
        "t_score_mean": 50.0,
        "t_score_sd": 10.0,
        "population_norms": "US_general_2011",
        "administration_mode": ["CAT", "fixed"],
        "min_items_cat": 4,
        "max_items_cat": 12,
        "reliability_target": 0.90,
        "score_range": (30.0, 80.0),
    },
    "anger": {
        "name": "Anger",
        "instrument_codes": ["PROMIS_Bank_Anger_v10", "PROMIS_SF_Anger_5a"],
        "item_count_cat": 4,
        "item_count_fixed": 5,
        "t_score_mean": 50.0,
        "t_score_sd": 10.0,
        "population_norms": "US_general_2011",
        "administration_mode": ["CAT", "fixed"],
        "min_items_cat": 4,
        "max_items_cat": 10,
        "reliability_target": 0.85,
        "score_range": (36.0, 80.0),
    },
    "social_isolation": {
        "name": "Social Isolation",
        "instrument_codes": ["PROMIS_Bank_SocIso_v10", "PROMIS_SF_SocIso_6a"],
        "item_count_cat": 4,
        "item_count_fixed": 6,
        "t_score_mean": 50.0,
        "t_score_sd": 10.0,
        "population_norms": "US_general_2011",
        "administration_mode": ["CAT", "fixed"],
        "min_items_cat": 4,
        "max_items_cat": 12,
        "reliability_target": 0.90,
        "score_range": (32.0, 82.0),
    },
}

_ADMIN_MODES = ["CAT", "fixed", "proxy"]
_SCORING_METHODS = ["T-score", "raw_sum", "IRT_theta"]


@dataclass
class PROMISInstrument:
    """Represents a single PROMIS instrument configuration."""

    instrument_code: str
    domain: str
    item_count: int
    scoring_method: str
    t_score_mean: float
    t_score_sd: float
    population_norms: str
    version: str
    administration_mode: str
    min_items_cat: Optional[int] = None
    max_items_cat: Optional[int] = None
    reliability_target: float = 0.90
    score_range: Optional[Tuple[float, float]] = None


class PROMISAdapter(DatabaseAdapter):
    """Adapter for PROMIS outcome measurement instruments.

    Provides metadata and scoring parameters for PROMIS instruments across
    eight clinical domains. Supports both CAT and fixed-length forms.
    """

    # -- Properties ----------------------------------------------------------

    @property
    def source_name(self) -> str:
        return "PROMIS"

    @property
    def source_version(self) -> str:
        return self._version

    # -- Lifecycle -----------------------------------------------------------

    def __init__(self, config: Dict[str, Any] = None) -> None:
        super().__init__(config)
        self._version = self.config.get("version", "v2.0")
        self._base_url = self.config.get("base_url", _PROMIS_API_BASE)
        self._api_key = self.config.get("api_key")
        self._offline_mode = self.config.get("offline_mode", True)
        self._session: Optional[aiohttp.ClientSession] = None
        self._instruments: Dict[str, PROMISInstrument] = {}
        self._cache_hits = 0
        self._cache_misses = 0
        self._last_fetch: Optional[datetime] = None
        self._initialize_default_instruments()

    def _initialize_default_instruments(self) -> None:
        for domain_key, domain_meta in _PROMIS_DOMAINS.items():
            for code in domain_meta["instrument_codes"]:
                is_cat = "Bank" in code
                self._instruments[code] = PROMISInstrument(
                    instrument_code=code,
                    domain=domain_meta["name"],
                    item_count=(
                        domain_meta["item_count_cat"]
                        if is_cat
                        else domain_meta["item_count_fixed"]
                    ),
                    scoring_method="T-score",
                    t_score_mean=domain_meta["t_score_mean"],
                    t_score_sd=domain_meta["t_score_sd"],
                    population_norms=domain_meta["population_norms"],
                    version=self._version,
                    administration_mode="CAT" if is_cat else "fixed",
                    min_items_cat=domain_meta.get("min_items_cat"),
                    max_items_cat=domain_meta.get("max_items_cat"),
                    reliability_target=domain_meta.get("reliability_target", 0.90),
                    score_range=domain_meta.get("score_range"),
                )

    async def connect(self) -> bool:
        headers: Dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        self._session = aiohttp.ClientSession(
            base_url=self._base_url,
            headers=headers,
            timeout=ClientTimeout(total=30, connect=10),
        )
        self._connected = True
        logger.info("PROMIS adapter connected (version %s, offline=%s)", self._version, self._offline_mode)
        return True

    async def disconnect(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
        self._connected = False
        logger.info("PROMIS adapter disconnected")

    # -- Core operations -----------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not self._connected or self._session is None:
            raise ConnectionError("PROMIS adapter not connected. Call connect() first.")

        cache_key = self._cache_key(query)
        if cache_key in self._cache:
            self._cache_hits += 1
            cached = self._cache[cache_key]
            if utc_now() < cached["expires_at"]:
                logger.debug("PROMIS cache hit for key %s", cache_key[:16])
                return cached["records"]

        self._cache_misses += 1
        records = await self._fetch_with_retry(query)
        self._cache[cache_key] = {
            "records": records,
            "expires_at": utc_now() + timedelta(seconds=604800),  # 7 days
        }
        self._last_fetch = utc_now()
        return records

    async def _fetch_with_retry(
        self, query: Dict[str, Any], max_retries: int = 3
    ) -> List[Dict[str, Any]]:
        last_error: Optional[Exception] = None
        for attempt in range(1, max_retries + 1):
            try:
                return await self._do_fetch(query)
            except aiohttp.ClientError as exc:
                last_error = exc
                wait = 2 ** attempt
                logger.warning("PROMIS fetch attempt %d/%d failed: %s. Retrying in %ds", attempt, max_retries, exc, wait)
                import asyncio
                await asyncio.sleep(wait)
        raise ConnectionError(f"PROMIS fetch failed after {max_retries} attempts: {last_error}")

    async def _do_fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        domain_filter = query.get("domain")
        code_filter = query.get("instrument_code")
        mode_filter = query.get("administration_mode")

        if self._offline_mode:
            records = self._fetch_offline(domain_filter, code_filter, mode_filter)
        else:
            records = await self._fetch_api(domain_filter, code_filter, mode_filter)
        return records

    def _fetch_offline(
        self,
        domain_filter: Optional[str],
        code_filter: Optional[str],
        mode_filter: Optional[str],
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for code, inst in self._instruments.items():
            if code_filter and code != code_filter:
                continue
            if domain_filter and inst.domain.lower() != domain_filter.lower():
                continue
            if mode_filter and inst.administration_mode != mode_filter:
                continue
            results.append(self._instrument_to_dict(inst))
        return results

    async def _fetch_api(
        self,
        domain_filter: Optional[str],
        code_filter: Optional[str],
        mode_filter: Optional[str],
    ) -> List[Dict[str, Any]]:
        """Live API fetch against PROMIS Assessment Center."""
        params: Dict[str, str] = {}
        if domain_filter:
            params["domain"] = domain_filter
        if code_filter:
            params["instrument"] = code_filter
        if mode_filter:
            params["mode"] = mode_filter

        async with self._session.get("/v1/instruments", params=params) as resp:  # type: ignore[union-attr]
            resp.raise_for_status()
            payload = await resp.json()

        records: List[Dict[str, Any]] = []
        for item in payload.get("instruments", []):
            records.append({
                "instrument_code": item.get("code", ""),
                "domain": item.get("domain", ""),
                "item_count": item.get("item_count", 0),
                "scoring_method": item.get("scoring_method", "T-score"),
                "t_score_mean": item.get("t_score_mean", 50.0),
                "t_score_sd": item.get("t_score_sd", 10.0),
                "population_norms": item.get("population_norms", ""),
                "version": item.get("version", self._version),
                "administration_mode": item.get("administration_mode", "fixed"),
                "cat_metadata": item.get("cat_metadata", {}),
            })
        return records

    def _instrument_to_dict(self, inst: PROMISInstrument) -> Dict[str, Any]:
        return {
            "instrument_code": inst.instrument_code,
            "domain": inst.domain,
            "item_count": inst.item_count,
            "scoring_method": inst.scoring_method,
            "t_score_mean": inst.t_score_mean,
            "t_score_sd": inst.t_score_sd,
            "population_norms": inst.population_norms,
            "version": inst.version,
            "administration_mode": inst.administration_mode,
            "cat_metadata": {
                "min_items": inst.min_items_cat,
                "max_items": inst.max_items_cat,
                "reliability_target": inst.reliability_target,
            },
            "score_range": inst.score_range,
        }

    # -- Normalization -------------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm_record = {
                "instrument_code": raw.get("instrument_code", "unknown"),
                "domain": raw.get("domain", "unknown"),
                "item_count": raw.get("item_count", 0),
                "scoring_method": raw.get("scoring_method", "T-score"),
                "t_score_mean": raw.get("t_score_mean", 50.0),
                "t_score_sd": raw.get("t_score_sd", 10.0),
                "population_norms": raw.get("population_norms", ""),
                "version": raw.get("version", self._version),
                "administration_mode": raw.get("administration_mode", "fixed"),
                "cat_metadata": raw.get("cat_metadata", {}),
                "score_range": raw.get("score_range"),
                "source": self.source_name,
                "_promis_raw": raw,
            }
            normalized.append(norm_record)
        return normalized

    # -- Validation ----------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        valid: List[Dict[str, Any]] = []
        for rec in normalized_records:
            errors: List[str] = []
            code = rec.get("instrument_code", "")
            if not code or code == "unknown":
                errors.append("Missing instrument_code")
            domain = rec.get("domain", "")
            if not domain:
                errors.append("Missing domain")
            mode = rec.get("administration_mode", "")
            if mode and mode not in _ADMIN_MODES:
                errors.append(f"Invalid administration_mode: {mode}")
            scoring = rec.get("scoring_method", "")
            if scoring and scoring not in _SCORING_METHODS:
                errors.append(f"Invalid scoring_method: {scoring}")
            item_count = rec.get("item_count", 0)
            if item_count <= 0:
                errors.append(f"Invalid item_count: {item_count}")
            t_mean = rec.get("t_score_mean")
            if t_mean is not None and not (20 <= t_mean <= 80):
                errors.append(f"Suspicious t_score_mean: {t_mean}")
            rec["_validation_errors"] = errors
            rec["_validation_passed"] = len(errors) == 0
            valid.append(rec)
        return valid

    # -- Provenance & metadata -----------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        code = record.get("instrument_code", "unknown")
        domain = record.get("domain", "unknown")
        is_cat = record.get("administration_mode") == "CAT"

        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self._version,
            source_record_id=code,
            ingestion_timestamp=utc_now(),
            license_type="PROMIS Terms of Use",
            license_url="https://www.healthmeasures.net/explore-measurement-systems/promis",
            attribution_text=(
                f"PROMIS instrument: {code} ({domain}). "
                "Patient-Reported Outcomes Measurement Information System. "
                "NIH-funded initiative."
            ),
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.META_ANALYSIS,
            research_only=True,
            research_only_reason=(
                "PROMIS instruments require registration and may incur fees "
                "for commercial use. Research use only until proper licensing "
                "is confirmed."
            ),
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="PROMIS Terms of Use",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            requires_share_alike=False,
            redistribution_allowed=False,
            modification_allowed=False,
            attribution_text=(
                "PROMIS measures are copyrighted by the PROMIS HealthOrganization. "
                "Free for non-commercial research use. Commercial use requires "
                "separate licensing agreement."
            ),
            restrictions=[
                "Research use only without separate commercial license",
                "User registration required at Assessment Center",
                "No redistribution of item banks or scoring code",
                "Publication requires PROMIS citation",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        domain = record.get("domain", "").lower()
        # Core domains have highest evidence base
        high_evidence_domains = {"depression", "anxiety", "pain", "physical function"}
        medium_evidence_domains = {"sleep", "fatigue", "cognitive"}
        if domain in high_evidence_domains:
            return ConfidenceTier.HIGH
        if domain in medium_evidence_domains:
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.RESEARCH

    # -- Health check --------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        healthy = self._connected
        instrument_count = len(self._instruments)
        domains_covered = sorted({inst.domain for inst in self._instruments.values()})

        return {
            "source": self.source_name,
            "version": self.source_version,
            "connected": healthy,
            "offline_mode": self._offline_mode,
            "instruments_cached": instrument_count,
            "domains_covered": domains_covered,
            "cache_size": len(self._cache),
            "cache_hits": self._cache_hits,
            "cache_misses": self._cache_misses,
            "last_fetch": self._last_fetch.isoformat() if self._last_fetch else None,
        }

    # -- Cache utilities -----------------------------------------------------

    def _cache_key(self, query: Dict[str, Any]) -> str:
        canonical = json.dumps(query, sort_keys=True, default=str)
        return hashlib.sha256(canonical.encode()).hexdigest()

    def clear_cache(self) -> None:
        self._cache.clear()
        self._cache_hits = 0
        self._cache_misses = 0
        logger.info("PROMIS adapter cache cleared")
