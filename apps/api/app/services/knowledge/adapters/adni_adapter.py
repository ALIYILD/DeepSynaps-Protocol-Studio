"""
ADNI Adapter — Alzheimer's Disease Neuroimaging Initiative Reference Data.

Provides normalised access to ADNI biomarker reference data including
amyloid-beta 42, total tau, phosphorylated tau, hippocampal volume,
cortical thickness, FDG-PET, CDR scores, and MMSE scores.

GOVERNANCE RULES:
  1. Cohort research context ONLY — NOT a diagnostic reference.
  2. Commercial use is PROHIBITED by the ADNI Data Use Agreement.
  3. Cannot be used to diagnose individual patients.
  4. All outputs flagged as research-only with commercial prohibition.

Data source: LONI IDA (https://ida.loni.usc.edu/) — requires application
License:    ADNI Data Use Agreement (research only, NO commercial)
Citation:   Weiner MW et al. Alzheimer's Dement. 2017;13(8):841-849
"""

from __future__ import annotations

import asyncio
import csv
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
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

ADNI_API_BASE = "https://ida.loni.usc.edu/api"
DEFAULT_TIMEOUT = ClientTimeout(total=60, connect=15)
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0
REQUESTS_PER_SECOND = 3

# ADNI biomarker catalogue
ADNI_BIOMARKERS: Dict[str, Dict[str, Any]] = {
    "amyloid_beta_42": {
        "display_name": "Amyloid-beta 42 (CSF)",
        "unit": "pg/mL",
        "reference_range_mean": 193.0,
        "reference_range_sd": 52.0,
        "lower_is_pathological": True,
        "measurement_method": "ELISA (INNOTEST or Elecsys)",
    },
    "total_tau": {
        "display_name": "Total Tau (CSF)",
        "unit": "pg/mL",
        "reference_range_mean": 93.0,
        "reference_range_sd": 51.0,
        "lower_is_pathological": False,
        "measurement_method": "ELISA (INNOTEST or Elecsys)",
    },
    "phosphorylated_tau": {
        "display_name": "Phosphorylated Tau p-tau181 (CSF)",
        "unit": "pg/mL",
        "reference_range_mean": 23.0,
        "reference_range_sd": 13.0,
        "lower_is_pathological": False,
        "measurement_method": "ELISA (INNOTEST or Elecsys)",
    },
    "hippocampal_volume": {
        "display_name": "Hippocampal Volume",
        "unit": "mm3",
        "reference_range_mean": 6800.0,
        "reference_range_sd": 1100.0,
        "lower_is_pathological": True,
        "measurement_method": "FreeSurfer volumetry (v6.0)",
    },
    "cortical_thickness": {
        "display_name": "Mean Cortical Thickness",
        "unit": "mm",
        "reference_range_mean": 2.56,
        "reference_range_sd": 0.15,
        "lower_is_pathological": True,
        "measurement_method": "FreeSurfer cortical thickness (v6.0)",
    },
    "fdg_pet": {
        "display_name": "FDG-PET (temporal meta-ROI)",
        "unit": "SUVr",
        "reference_range_mean": 1.35,
        "reference_range_sd": 0.18,
        "lower_is_pathological": True,
        "measurement_method": "FDG-PET SUVR (pons reference)",
    },
    "cdr_score": {
        "display_name": "Clinical Dementia Rating (CDR) Global Score",
        "unit": "score",
        "reference_range_mean": 0.0,
        "reference_range_sd": 0.5,
        "lower_is_pathological": False,
        "measurement_method": "CDR interview (structured)",
    },
    "mmse_score": {
        "display_name": "Mini-Mental State Examination (MMSE)",
        "unit": "score",
        "reference_range_mean": 29.0,
        "reference_range_sd": 1.5,
        "lower_is_pathological": True,
        "measurement_method": "MMSE (standard 30-point)",
    },
    "abeta_ratio": {
        "display_name": "Amyloid-beta 42/40 Ratio (CSF)",
        "unit": "ratio",
        "reference_range_mean": 0.09,
        "reference_range_sd": 0.03,
        "lower_is_pathological": True,
        "measurement_method": "ELISA or mass spectrometry",
    },
    "av45_pet": {
        "display_name": "Amyloid PET (AV-45 / Florbetapir)",
        "unit": "SUVr",
        "reference_range_mean": 1.08,
        "reference_range_sd": 0.18,
        "lower_is_pathological": False,
        "measurement_method": "AV-45 PET SUVR (cerebellum reference)",
    },
}

# Diagnostic groups in ADNI
ADNI_DIAGNOSTIC_GROUPS = ["CN", "MCI", "AD", "EMCI", "LMCI", "SMC"]

# Confidence thresholds
_COHORT_SIZE_HIGH = 200
_COHORT_SIZE_MEDIUM = 100
_COHORT_SIZE_LOW = 50

# Research-only reason template
_RESEARCH_ONLY_REASON = (
    "ADNI provides group-level neuroimaging and biomarker reference data for "
    "Alzheimer's disease research. It is not a diagnostic tool and cannot be used "
    "to diagnose individual patients. Commercial use is prohibited."
)


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class ADNIError(Exception):
    """Base exception for ADNI adapter errors."""
    pass


class ADNINotFoundError(ADNIError):
    """Raised when a biomarker or record is not found."""
    pass


class ADNIAPIError(ADNIError):
    """Raised on unexpected HTTP status or API error."""
    pass


class ADNICommercialUseError(ADNIError):
    """Raised when commercial use is detected — PROHIBITED by ADNI DUA."""
    pass


class ADNIRateLimitError(ADNIError):
    """Raised when the LONI API rate limit is exceeded."""
    pass


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class ADNIAdapter(DatabaseAdapter):
    """Async adapter for ADNI reference biomarker data.

    Provides normalised ADNI biomarker reference values with governance
    metadata enforcing the ADNI Data Use Agreement. ALL outputs are
    research-only; commercial use is PROHIBITED.

    Data access requires an approved application via LONI IDA.

    Configuration keys (all optional):
        * ``api_key``           — LONI IDA API key (requires application).
        * ``data_dir``          — Local directory for cached CSV files.
        * ``timeout``           — Request timeout in seconds (default 60).
        * ``max_retries``       — Retry attempts (default 3).
        * ``cache_ttl``         — Cache TTL in seconds (default 86400).
        * ``commercial_check``  — If True, enforce commercial prohibition.
        * ``local_csv``         — Path to local ADNI CSV for offline mode.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._api_key: Optional[str] = self.config.get("api_key")
        self._data_dir: Path = Path(self.config.get("data_dir", "/tmp/adni_data"))
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", 60), connect=15
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._cache_ttl: int = self.config.get("cache_ttl", 86_400)
        self._commercial_check: bool = self.config.get("commercial_check", True)
        self._local_csv: Optional[str] = self.config.get("local_csv")
        self._session: Optional[aiohttp.ClientSession] = None
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._last_request_time: float = 0.0
        self._biomarker_cache: Dict[str, List[Dict[str, Any]]] = {}

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "ADNI"

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
        """Enforce per-second request cap."""
        now = asyncio.get_event_loop().time()
        min_interval = 1.0 / REQUESTS_PER_SECOND
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Execute a GET request with retries, rate-limiting, and caching."""
        params = params or {}
        if self._api_key:
            params["api_key"] = self._api_key

        cache_key = self._cache_key(endpoint, params)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._session is None or self._session.closed:
            raise ADNIError("HTTP session not initialised — call connect() first.")

        url = f"{ADNI_API_BASE}{endpoint}"
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
                    raise ADNIRateLimitError("ADNI/LONI rate limit exceeded") from exc
                if 500 <= exc.status < 600:
                    last_exception = exc
                    wait = RETRY_BACKOFF * attempt
                    logger.warning(
                        "ADNI transient error %s on attempt %d/%d — retrying in %.1fs",
                        exc.status,
                        attempt,
                        self._max_retries,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise ADNIAPIError(f"ADNI API error {exc.status}: {exc.message}") from exc
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "ADNI network error on attempt %d/%d — retrying in %.1fs",
                    attempt,
                    self._max_retries,
                    wait,
                )
                await asyncio.sleep(wait)

        raise ADNIAPIError(f"ADNI request failed after {self._max_retries} attempts") from last_exception

    # -- Commercial use prohibition -------------------------------------------

    def _check_commercial_use(self, query: Dict[str, Any]) -> None:
        """Enforce ADNI commercial use prohibition.

        Raises ADNICommercialUseError if commercial use is detected.
        """
        if not self._commercial_check:
            return

        use_case = query.get("use_case", "")
        if use_case.lower() in ("commercial", "for_profit", "product", "diagnostic"):
            raise ADNICommercialUseError(
                "ADNI data CANNOT be used for commercial, for-profit, or "
                "diagnostic product purposes per the ADNI Data Use Agreement. "
                "Research use only. Visit https://adni.loni.usc.edu/ for terms."
            )

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise session and verify connectivity."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-ADNIAdapter/1.0",
                },
            )

        self._data_dir.mkdir(parents=True, exist_ok=True)

        # Try to load from local CSV first
        if self._local_csv and Path(self._local_csv).exists():
            self._load_local_csv(Path(self._local_csv))
            self._connected = True
            logger.info("ADNIAdapter connected — local CSV mode")
            return True

        # Verify API connectivity with lightweight ping
        if self._api_key:
            try:
                await self._request("/biomarkers", {"limit": "1"})
                self._connected = True
                logger.info("ADNIAdapter connected — LONI IDA API")
                return True
            except ADNIError:
                pass

        # Offline mode with built-in reference data
        self._load_builtin_reference_data()
        self._connected = True
        logger.info("ADNIAdapter connected — built-in reference mode (offline)")
        return True

    async def disconnect(self) -> None:
        """Close session and flush caches."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._biomarker_cache.clear()
        self._connected = False
        logger.info("ADNIAdapter disconnected")

    def _load_local_csv(self, path: Path) -> None:
        """Load ADNI data from a local CSV file."""
        with open(path, "r", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                bname = row.get("biomarker_name", "").strip()
                if bname not in self._biomarker_cache:
                    self._biomarker_cache[bname] = []
                self._biomarker_cache[bname].append(dict(row))

    def _load_builtin_reference_data(self) -> None:
        """Load built-in ADNI reference summary statistics.

        These are group-level summary statistics from published ADNI papers.
        Individual-level data requires LONI IDA access agreement.
        """
        # CN (Cognitively Normal) group references
        cn_data = [
            {"biomarker_name": "amyloid_beta_42", "biomarker_value": 193.0, "unit": "pg/mL",
             "reference_range_mean": 193.0, "reference_range_sd": 52.0, "population": "CN",
             "diagnostic_group": "CN", "age_range": "55-90", "cohort_size": 229,
             "measurement_method": "ELISA (INNOTEST or Elecsys)", "visit": "baseline"},
            {"biomarker_name": "total_tau", "biomarker_value": 93.0, "unit": "pg/mL",
             "reference_range_mean": 93.0, "reference_range_sd": 51.0, "population": "CN",
             "diagnostic_group": "CN", "age_range": "55-90", "cohort_size": 229,
             "measurement_method": "ELISA (INNOTEST or Elecsys)", "visit": "baseline"},
            {"biomarker_name": "hippocampal_volume", "biomarker_value": 6800.0, "unit": "mm3",
             "reference_range_mean": 6800.0, "reference_range_sd": 1100.0, "population": "CN",
             "diagnostic_group": "CN", "age_range": "55-90", "cohort_size": 229,
             "measurement_method": "FreeSurfer volumetry (v6.0)", "visit": "baseline"},
            {"biomarker_name": "mmse_score", "biomarker_value": 29.0, "unit": "score",
             "reference_range_mean": 29.0, "reference_range_sd": 1.5, "population": "CN",
             "diagnostic_group": "CN", "age_range": "55-90", "cohort_size": 229,
             "measurement_method": "MMSE (standard 30-point)", "visit": "baseline"},
            {"biomarker_name": "cdr_score", "biomarker_value": 0.0, "unit": "score",
             "reference_range_mean": 0.0, "reference_range_sd": 0.0, "population": "CN",
             "diagnostic_group": "CN", "age_range": "55-90", "cohort_size": 229,
             "measurement_method": "CDR interview (structured)", "visit": "baseline"},
        ]

        # AD (Alzheimer's Disease) group references
        ad_data = [
            {"biomarker_name": "amyloid_beta_42", "biomarker_value": 141.0, "unit": "pg/mL",
             "reference_range_mean": 141.0, "reference_range_sd": 38.0, "population": "AD",
             "diagnostic_group": "AD", "age_range": "55-90", "cohort_size": 193,
             "measurement_method": "ELISA (INNOTEST or Elecsys)", "visit": "baseline"},
            {"biomarker_name": "total_tau", "biomarker_value": 119.0, "unit": "pg/mL",
             "reference_range_mean": 119.0, "reference_range_sd": 67.0, "population": "AD",
             "diagnostic_group": "AD", "age_range": "55-90", "cohort_size": 193,
             "measurement_method": "ELISA (INNOTEST or Elecsys)", "visit": "baseline"},
            {"biomarker_name": "hippocampal_volume", "biomarker_value": 5100.0, "unit": "mm3",
             "reference_range_mean": 5100.0, "reference_range_sd": 980.0, "population": "AD",
             "diagnostic_group": "AD", "age_range": "55-90", "cohort_size": 193,
             "measurement_method": "FreeSurfer volumetry (v6.0)", "visit": "baseline"},
            {"biomarker_name": "mmse_score", "biomarker_value": 23.0, "unit": "score",
             "reference_range_mean": 23.0, "reference_range_sd": 2.5, "population": "AD",
             "diagnostic_group": "AD", "age_range": "55-90", "cohort_size": 193,
             "measurement_method": "MMSE (standard 30-point)", "visit": "baseline"},
            {"biomarker_name": "cdr_score", "biomarker_value": 0.5, "unit": "score",
             "reference_range_mean": 0.5, "reference_range_sd": 0.0, "population": "AD",
             "diagnostic_group": "AD", "age_range": "55-90", "cohort_size": 193,
             "measurement_method": "CDR interview (structured)", "visit": "baseline"},
        ]

        # MCI (Mild Cognitive Impairment) group references
        mci_data = [
            {"biomarker_name": "amyloid_beta_42", "biomarker_value": 163.0, "unit": "pg/mL",
             "reference_range_mean": 163.0, "reference_range_sd": 48.0, "population": "MCI",
             "diagnostic_group": "MCI", "age_range": "55-90", "cohort_size": 383,
             "measurement_method": "ELISA (INNOTEST or Elecsys)", "visit": "baseline"},
            {"biomarker_name": "hippocampal_volume", "biomarker_value": 6000.0, "unit": "mm3",
             "reference_range_mean": 6000.0, "reference_range_sd": 1050.0, "population": "MCI",
             "diagnostic_group": "MCI", "age_range": "55-90", "cohort_size": 383,
             "measurement_method": "FreeSurfer volumetry (v6.0)", "visit": "baseline"},
            {"biomarker_name": "mmse_score", "biomarker_value": 27.0, "unit": "score",
             "reference_range_mean": 27.0, "reference_range_sd": 2.0, "population": "MCI",
             "diagnostic_group": "MCI", "age_range": "55-90", "cohort_size": 383,
             "measurement_method": "MMSE (standard 30-point)", "visit": "baseline"},
        ]

        for entry in cn_data + ad_data + mci_data:
            bname = entry["biomarker_name"]
            if bname not in self._biomarker_cache:
                self._biomarker_cache[bname] = []
            self._biomarker_cache[bname].append(entry)

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute an ADNI biomarker query.

        Supported keys:
            * ``biomarker_name``    — Name of biomarker (e.g., 'amyloid_beta_42').
            * ``diagnostic_group``  — 'CN', 'MCI', 'AD', 'EMCI', 'LMCI', 'SMC'.
            * ``age_range``         — Age range filter (e.g., '55-75').
            * ``visit``             — Visit timepoint (e.g., 'baseline', 'm06').
            * ``limit``             — Max results (default 50).
            * ``use_case``          — Must NOT be 'commercial' or 'for_profit'.
        """
        if not self._connected:
            await self.connect()

        # Governance: enforce commercial prohibition
        self._check_commercial_use(query)

        biomarker_name = query.get("biomarker_name")
        diagnostic_group = query.get("diagnostic_group")
        age_range = query.get("age_range")
        visit = query.get("visit")
        limit = min(query.get("limit", 50), 500)

        records: List[Dict[str, Any]] = []

        # Try API first if key is available
        if self._api_key:
            records = await self._fetch_from_api(
                biomarker_name, diagnostic_group, age_range, visit, limit
            )
        else:
            # Use cached/built-in data
            records = self._fetch_from_cache(
                biomarker_name, diagnostic_group, age_range, visit, limit
            )

        return records

    async def _fetch_from_api(
        self,
        biomarker_name: Optional[str],
        diagnostic_group: Optional[str],
        age_range: Optional[str],
        visit: Optional[str],
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Fetch from LONI IDA API."""
        params: Dict[str, str] = {"limit": str(limit)}
        if biomarker_name:
            params["biomarker"] = biomarker_name
        if diagnostic_group:
            params["diagnosis"] = diagnostic_group

        data = await self._request("/biomarkers", params)
        records: List[Dict[str, Any]] = []

        for entry in data.get("data", []):
            record = {
                "biomarker_name": entry.get("biomarker_name", ""),
                "biomarker_value": float(entry.get("value", 0.0)),
                "unit": entry.get("unit", ""),
                "reference_range_mean": float(entry.get("reference_mean", 0.0)),
                "reference_range_sd": float(entry.get("reference_sd", 0.0)),
                "population": entry.get("population", "ADNI"),
                "diagnostic_group": entry.get("diagnostic_group", ""),
                "age_range": entry.get("age_range", ""),
                "cohort_size": int(entry.get("n", 0)),
                "measurement_method": entry.get("method", ""),
                "visit": entry.get("visit", ""),
                "_raw": entry,
            }
            records.append(record)

        return records[:limit]

    def _fetch_from_cache(
        self,
        biomarker_name: Optional[str],
        diagnostic_group: Optional[str],
        age_range: Optional[str],
        visit: Optional[str],
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Fetch from local cache/built-in data."""
        records: List[Dict[str, Any]] = []

        biomarkers_to_query = [biomarker_name] if biomarker_name else list(ADNI_BIOMARKERS.keys())

        for bname in biomarkers_to_query:
            cached = self._biomarker_cache.get(bname, [])
            for entry in cached:
                if diagnostic_group and entry.get("diagnostic_group") != diagnostic_group:
                    continue
                if age_range and entry.get("age_range") != age_range:
                    continue
                if visit and entry.get("visit") != visit:
                    continue
                records.append(dict(entry))
                if len(records) >= limit:
                    return records

        return records[:limit]

    # -- normalize ------------------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw ADNI records into the standard schema."""
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm = self._normalize_single(raw)
            if norm:
                normalised.append(norm)
        return normalised

    def _normalize_single(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normalise a single ADNI biomarker record."""
        bname = raw.get("biomarker_name", "").strip()
        if not bname:
            return None

        bmeta = ADNI_BIOMARKERS.get(bname, {})

        return {
            "biomarker_name": bname,
            "biomarker_display_name": bmeta.get("display_name", bname),
            "biomarker_value": round(float(raw.get("biomarker_value", 0.0)), 4),
            "unit": raw.get("unit", bmeta.get("unit", "")),
            "reference_range_mean": round(
                float(raw.get("reference_range_mean", bmeta.get("reference_range_mean", 0.0))), 4
            ),
            "reference_range_sd": round(
                float(raw.get("reference_range_sd", bmeta.get("reference_range_sd", 0.0))), 4
            ),
            "population": raw.get("population", "ADNI"),
            "diagnostic_group": raw.get("diagnostic_group", ""),
            "age_range": raw.get("age_range", ""),
            "cohort_size": int(raw.get("cohort_size", 0)),
            "measurement_method": raw.get("measurement_method", bmeta.get("measurement_method", "")),
            "visit": raw.get("visit", ""),
            "_lower_is_pathological": bmeta.get("lower_is_pathological", False),
            "_raw": raw.get("_raw", raw),
        }

    # -- validate -------------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate records and attach governance metadata."""
        validated: List[Dict[str, Any]] = []
        for record in normalized_records:
            record["_valid"] = self._is_valid(record)
            record["_confidence"] = self.get_confidence(record).value
            # ADNI is ALWAYS research-only per governance rules
            record["_research_only"] = True
            record["_research_only_reason"] = _RESEARCH_ONLY_REASON
            record["_commercial_use_prohibited"] = True
            record["_caveat"] = self._caveat_text(record)
            record["_provenance"] = self.get_provenance(record)
            validated.append(record)
        return validated

    def _is_valid(self, record: Dict[str, Any]) -> bool:
        """Valid when biomarker has name, value, and known diagnostic group."""
        has_name = bool(record.get("biomarker_name"))
        has_value = record.get("biomarker_value", 0.0) != 0.0 or record.get("biomarker_value") is not None
        has_group = record.get("diagnostic_group", "") in ADNI_DIAGNOSTIC_GROUPS
        has_cohort = record.get("cohort_size", 0) > 0
        return has_name and has_value and has_group and has_cohort

    def _caveat_text(self, record: Dict[str, Any]) -> str:
        """Contextual caveat for ADNI outputs."""
        bname = record.get("biomarker_display_name", record.get("biomarker_name", ""))
        group = record.get("diagnostic_group", "")
        n = record.get("cohort_size", 0)
        method = record.get("measurement_method", "")

        return (
            f"ADNI group-level reference: {bname} for {group} group "
            f"(n={n}). Measurement: {method}. "
            f"These are summary statistics from a research cohort — "
            f"NOT a diagnostic reference for individual patients. "
            f"Values vary by assay version, site, and analytical pipeline. "
            f"Commercial use is PROHIBITED by the ADNI Data Use Agreement."
        )

    # -- provenance & governance ----------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=f"{record.get('biomarker_name', 'unknown')}_{record.get('diagnostic_group', 'na')}",
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="ADNI Data Use Agreement",
            license_url="https://adni.loni.usc.edu/wp-content/uploads/how_to_apply/ADNI_Acknowledgement_List.pdf",
            attribution_text=(
                "Data from the Alzheimer's Disease Neuroimaging Initiative (ADNI). "
                "Weiner MW et al. Alzheimer's Dement. 2017. "
                "Data used under ADNI Data Use Agreement — research only."
            ),
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.COHORT_STUDY,
            research_only=True,
            retrieval_method="direct" if self._api_key else "cached",
            data_quality_score=self._quality_score(record),
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="ADNI Data Use Agreement",
            license_url="https://adni.loni.usc.edu/wp-content/uploads/how_to_apply/ADNI_Acknowledgement_List.pdf",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            requires_share_alike=False,
            modification_allowed=False,
            redistribution_allowed=False,
            attribution_text=(
                "ADNI data © Alzheimer's Disease Neuroimaging Initiative. "
                "Data collection and sharing funded by NIH U19 AG024904. "
                "Research use only — commercial use PROHIBITED."
            ),
            restrictions=[
                "Research use ONLY — NO commercial use.",
                "NO use in diagnostic products or clinical decision-making tools.",
                "Attribution to ADNI and participating investigators required.",
                "NO redistribution without ADNI approval.",
                "Individual patient diagnosis PROHIBITED.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Score confidence based on cohort size, measurement method, and group specificity."""
        cohort_size = record.get("cohort_size", 0)
        method = record.get("measurement_method", "")
        group = record.get("diagnostic_group", "")

        # High-quality methods
        high_quality_methods = [
            "ELISA (INNOTEST or Elecsys)",
            "FreeSurfer volumetry (v6.0)",
            "FDG-PET SUVR (pons reference)",
            "AV-45 PET SUVR (cerebellum reference)",
        ]

        is_high_quality = any(m in method for m in high_quality_methods)
        is_well_defined_group = group in ("CN", "AD", "MCI")

        if cohort_size >= _COHORT_SIZE_HIGH and is_high_quality and is_well_defined_group:
            return ConfidenceTier.HIGH
        if cohort_size >= _COHORT_SIZE_MEDIUM and is_high_quality:
            return ConfidenceTier.MEDIUM
        if cohort_size >= _COHORT_SIZE_LOW:
            return ConfidenceTier.LOW
        return ConfidenceTier.RESEARCH

    def _quality_score(self, record: Dict[str, Any]) -> float:
        """Compute a 0.0–1.0 quality score."""
        cohort_size = record.get("cohort_size", 0)
        method = record.get("measurement_method", "")
        group = record.get("diagnostic_group", "")

        cohort_norm = min(cohort_size / 500.0, 1.0)
        method_score = 0.8 if any(
            m in method for m in ["FreeSurfer", "ELISA", "PET", "mass spectrometry"]
        ) else 0.4
        group_score = 1.0 if group in ("CN", "AD") else 0.7 if group == "MCI" else 0.5

        return round((cohort_norm * 0.5) + (method_score * 0.3) + (group_score * 0.2), 3)

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify ADNI connectivity and report status."""
        healthy = self._connected
        has_api_key = bool(self._api_key)
        has_local_csv = self._local_csv and Path(self._local_csv).exists()

        return {
            "status": "ok" if healthy else "down",
            "source": self.source_name,
            "version": self.source_version,
            "connected": self._connected,
            "api_key_configured": has_api_key,
            "local_csv_available": has_local_csv,
            "commercial_check_enabled": self._commercial_check,
            "biomarkers_cached": list(self._biomarker_cache.keys()),
            "total_cached_records": sum(len(v) for v in self._biomarker_cache.values()),
            "offline_mode": not has_api_key,
        }
