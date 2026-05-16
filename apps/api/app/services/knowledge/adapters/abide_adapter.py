"""
ABIDE Adapter — Autism Brain Imaging Data Exchange Reference Data.

Provides normalised access to ABIDE and ABIDE-II rs-fMRI connectivity,
T1 MRI, and phenotypic reference data for autism research.

GOVERNANCE RULES:
  1. Cohort research context ONLY — NOT a diagnostic reference.
  2. Multi-site heterogeneity means SITE EFFECTS MUST BE DISCLOSED.
  3. Cannot be used for individual patient diagnosis.
  4. Preprocessing pipeline metadata must be included.
  5. ALL outputs flagged as research-only.

Data source:  http://fcon_1000.projects.nitrc.org/indi/abide/ (open download)
License:      CC BY-SA 3.0
Citations:    Di Martino et al. Mol Psychiatry 2014 (ABIDE I);
              Di Martino et al. 2017 (ABIDE II)
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
import numpy as np

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

ABIDE_DATA_URL = "http://fcon_1000.projects.nitrc.org/indi/abide/"
DEFAULT_TIMEOUT = aiohttp.ClientTimeout(total=60, connect=15)
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0
REQUESTS_PER_SECOND = 3

# ABIDE I and II site counts
ABIDE_I_SITES = 17
ABIDE_II_SITES = 19
TOTAL_SITES = ABIDE_I_SITES + ABIDE_II_SITES

# Diagnostic groups
ABIDE_DIAGNOSTIC_GROUPS = {
    "HC": "Healthy Control",
    "ASD": "Autism Spectrum Disorder",
    "TC": "Typically Developing Control",
    "ADHD": "Attention-Deficit/Hyperactivity Disorder",
}

# Preprocessing pipelines
PREPROCESSING_PIPELINES: Dict[str, Dict[str, Any]] = {
    "ccs": {
        "name": "Connectome Computation System (CCS)",
        "software": "FSL, FreeSurfer, AFNI",
        "nuisance": "CompCor + motion + CSF",
        "bandpass": "0.01–0.1 Hz",
        "reference": "Xu et al. 2015",
    },
    "cpac": {
        "name": "Configurable Pipeline for the Analysis of Connectomes (CPAC)",
        "software": "AFNI, FSL, ANTS",
        "nuisance": "Global + motion + WM + CSF",
        "bandpass": "0.009–0.1 Hz",
        "reference": "Cameron Craddock et al. 2013",
    },
    "dparsf": {
        "name": "Data Processing Assistant for Resting-State fMRI (DPARSF)",
        "software": "SPM, REST",
        "nuisance": "Motion + WM + CSF",
        "bandpass": "0.01–0.1 Hz",
        "reference": "Chao-Gan & Yu-Feng 2010",
    },
    "niak": {
        "name": "Neuroimaging Analysis Kit (NIAK)",
        "software": "Octave/MATLAB, minc-toolkit",
        "nuisance": "CompCor + motion + WM",
        "bandpass": "0.01–0.1 Hz",
        "reference": "Bellec et al. 2011",
    },
}

# Modality definitions
ABIDE_MODALITIES: Dict[str, Dict[str, Any]] = {
    "rs_fmri_connectivity": {
        "display_name": "Resting-State fMRI Connectivity",
        "typical_measures": ["ALFF", "fALFF", "ReHo", "DC", "connectivity_matrix"],
        "sites_available": TOTAL_SITES,
    },
    "t1_mri": {
        "display_name": "T1-Weighted MRI",
        "typical_measures": ["cortical_thickness", "volume", "surface_area", "cth"],
        "sites_available": TOTAL_SITES,
    },
    "phenotypic": {
        "display_name": "Phenotypic Data",
        "typical_measures": ["ADI_R", "ADOS", "SRS", "WISC", "VIQ", "PIQ", "FIQ"],
        "sites_available": TOTAL_SITES,
    },
    "dti": {
        "display_name": "Diffusion Tensor Imaging",
        "typical_measures": ["FA", "MD", "RD", "AD", "tractography"],
        "sites_available": 8,  # subset of sites
    },
}

# Confidence thresholds
_SUBJECTS_HIGH = 500
_SUBJECTS_MEDIUM = 200
_SITES_HIGH = 15
_SITES_MEDIUM = 8

# Research-only reason
_RESEARCH_ONLY_REASON = (
    "ABIDE provides research neuroimaging data for autism studies. "
    "Multi-site heterogeneity means site effects must be considered. "
    "It cannot be used for individual patient diagnosis."
)


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class ABIDEError(Exception):
    """Base exception for ABIDE adapter errors."""
    pass


class ABIDENotFoundError(ABIDEError):
    """Raised when a modality or measure is not found."""
    pass


class ABIDEAPIError(ABIDEError):
    """Raised on unexpected HTTP status or API error."""
    pass


class ABIDERateLimitError(ABIDEError):
    """Raised when the NITRC server rate limit is exceeded."""
    pass


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class ABIDEAdapter(DatabaseAdapter):
    """Async adapter for ABIDE reference neuroimaging data.

    Provides normalised access to ABIDE and ABIDE-II resting-state fMRI,
    T1 MRI, phenotypic, and DTI reference data with mandatory site-effect
    disclosures and preprocessing pipeline metadata.

    ALL outputs are research-only per governance rules.

    Configuration keys (all optional):
        * ``data_dir``            — Local directory for cached data.
        * ``timeout``             — Request timeout in seconds (default 60).
        * ``max_retries``         — Retry attempts (default 3).
        * ``cache_ttl``           — Cache TTL in seconds (default 86400).
        * ``local_csv``           — Path to local ABIDE phenotypic CSV.
        * ``site_effect_disclose`` — If True, include site effect warnings.
        * ``pipeline``            — Preferred preprocessing pipeline reference.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._data_dir: Path = Path(self.config.get("data_dir", "/tmp/abide_data"))
        self._timeout: aiohttp.ClientTimeout = aiohttp.ClientTimeout(
            total=self.config.get("timeout", 60), connect=15
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._cache_ttl: int = self.config.get("cache_ttl", 86_400)
        self._local_csv: Optional[str] = self.config.get("local_csv")
        self._site_effect_disclose: bool = self.config.get("site_effect_disclose", True)
        self._pipeline: str = self.config.get("pipeline", "ccs")
        self._session: Optional[aiohttp.ClientSession] = None
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._last_request_time: float = 0.0
        self._data_cache: Dict[str, List[Dict[str, Any]]] = {}

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "ABIDE"

    @property
    def source_version(self) -> str:
        return "II_combined"

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
        cache_key = self._cache_key(endpoint, params)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._session is None or self._session.closed:
            raise ABIDEError("HTTP session not initialised — call connect() first.")

        url = f"{ABIDE_DATA_URL}{endpoint}"
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
                    raise ABIDERateLimitError("ABIDE/NITRC rate limit exceeded") from exc
                if 500 <= exc.status < 600:
                    last_exception = exc
                    wait = RETRY_BACKOFF * attempt
                    logger.warning(
                        "ABIDE transient error %s on attempt %d/%d — retrying in %.1fs",
                        exc.status,
                        attempt,
                        self._max_retries,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise ABIDEAPIError(f"ABIDE API error {exc.status}: {exc.message}") from exc
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "ABIDE network error on attempt %d/%d — retrying in %.1fs",
                    attempt,
                    self._max_retries,
                    wait,
                )
                await asyncio.sleep(wait)

        raise ABIDEAPIError(f"ABIDE request failed after {self._max_retries} attempts") from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise session and load reference data."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-ABIDEAdapter/1.0",
                },
            )

        self._data_dir.mkdir(parents=True, exist_ok=True)

        # Load from local CSV if available
        if self._local_csv and Path(self._local_csv).exists():
            self._load_local_csv(Path(self._local_csv))
            self._connected = True
            logger.info("ABIDEAdapter connected — local CSV mode")
            return True

        # Load built-in reference data
        self._load_builtin_reference_data()
        self._connected = True
        logger.info("ABIDEAdapter connected — built-in reference mode (offline)")
        return True

    async def disconnect(self) -> None:
        """Close session and flush caches."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._data_cache.clear()
        self._connected = False
        logger.info("ABIDEAdapter disconnected")

    def _load_local_csv(self, path: Path) -> None:
        """Load ABIDE phenotypic data from local CSV."""
        with open(path, "r", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                modality = row.get("modality", "phenotypic")
                if modality not in self._data_cache:
                    self._data_cache[modality] = []
                self._data_cache[modality].append(dict(row))

    def _load_builtin_reference_data(self) -> None:
        """Load built-in ABIDE group-level reference statistics.

        Individual-level data requires download from NITRC.
        These are summary statistics from published ABIDE papers.
        """
        # ABIDE I rs-fMRI connectivity references
        abide1_rsfmri = [
            {
                "modality": "rs_fmri_connectivity",
                "measure": "ALFF",
                "value": 0.0,
                "reference_mean": 0.42,
                "reference_sd": 0.12,
                "population": "ABIDE_I",
                "diagnostic_group": "ASD",
                "age_range": "7-64",
                "site_count": ABIDE_I_SITES,
                "total_subjects": 539,
                "preprocessing_pipeline": "CCS",
                "_site_effect_warning": True,
                "_raw": {},
            },
            {
                "modality": "rs_fmri_connectivity",
                "measure": "ALFF",
                "value": 0.0,
                "reference_mean": 0.45,
                "reference_sd": 0.11,
                "population": "ABIDE_I",
                "diagnostic_group": "HC",
                "age_range": "7-64",
                "site_count": ABIDE_I_SITES,
                "total_subjects": 573,
                "preprocessing_pipeline": "CCS",
                "_site_effect_warning": True,
                "_raw": {},
            },
            {
                "modality": "rs_fmri_connectivity",
                "measure": "connectivity_strength",
                "value": 0.0,
                "reference_mean": 0.18,
                "reference_sd": 0.08,
                "population": "ABIDE_I",
                "diagnostic_group": "ASD",
                "age_range": "7-64",
                "site_count": ABIDE_I_SITES,
                "total_subjects": 539,
                "preprocessing_pipeline": "CCS",
                "_site_effect_warning": True,
                "_raw": {},
            },
        ]

        # ABIDE I T1 MRI references
        abide1_t1 = [
            {
                "modality": "t1_mri",
                "measure": "total_brain_volume",
                "value": 0.0,
                "reference_mean": 1425000.0,
                "reference_sd": 145000.0,
                "population": "ABIDE_I",
                "diagnostic_group": "ASD",
                "age_range": "7-64",
                "site_count": ABIDE_I_SITES,
                "total_subjects": 478,
                "preprocessing_pipeline": "FreeSurfer",
                "_site_effect_warning": True,
                "_raw": {},
            },
            {
                "modality": "t1_mri",
                "measure": "cortical_thickness",
                "value": 0.0,
                "reference_mean": 2.58,
                "reference_sd": 0.14,
                "population": "ABIDE_I",
                "diagnostic_group": "ASD",
                "age_range": "7-64",
                "site_count": ABIDE_I_SITES,
                "total_subjects": 478,
                "preprocessing_pipeline": "FreeSurfer",
                "_site_effect_warning": True,
                "_raw": {},
            },
        ]

        # ABIDE II rs-fMRI connectivity references
        abide2_rsfmri = [
            {
                "modality": "rs_fmri_connectivity",
                "measure": "ALFF",
                "value": 0.0,
                "reference_mean": 0.40,
                "reference_sd": 0.13,
                "population": "ABIDE_II",
                "diagnostic_group": "ASD",
                "age_range": "5-64",
                "site_count": ABIDE_II_SITES,
                "total_subjects": 487,
                "preprocessing_pipeline": "CCS",
                "_site_effect_warning": True,
                "_raw": {},
            },
            {
                "modality": "rs_fmri_connectivity",
                "measure": "ALFF",
                "value": 0.0,
                "reference_mean": 0.43,
                "reference_sd": 0.12,
                "population": "ABIDE_II",
                "diagnostic_group": "HC",
                "age_range": "5-64",
                "site_count": ABIDE_II_SITES,
                "total_subjects": 557,
                "preprocessing_pipeline": "CCS",
                "_site_effect_warning": True,
                "_raw": {},
            },
        ]

        # Phenotypic references
        phenotypic = [
            {
                "modality": "phenotypic",
                "measure": "ADOS_total",
                "value": 0.0,
                "reference_mean": 12.5,
                "reference_sd": 4.8,
                "population": "ABIDE_combined",
                "diagnostic_group": "ASD",
                "age_range": "5-64",
                "site_count": TOTAL_SITES,
                "total_subjects": 1026,
                "preprocessing_pipeline": "N/A",
                "_site_effect_warning": True,
                "_raw": {},
            },
            {
                "modality": "phenotypic",
                "measure": "FIQ",
                "value": 0.0,
                "reference_mean": 105.0,
                "reference_sd": 18.0,
                "population": "ABIDE_combined",
                "diagnostic_group": "ASD",
                "age_range": "5-64",
                "site_count": TOTAL_SITES,
                "total_subjects": 1026,
                "preprocessing_pipeline": "N/A",
                "_site_effect_warning": True,
                "_raw": {},
            },
        ]

        for entry in abide1_rsfmri + abide1_t1 + abide2_rsfmri + phenotypic:
            modality = entry["modality"]
            if modality not in self._data_cache:
                self._data_cache[modality] = []
            self._data_cache[modality].append(entry)

    # -- Site effect disclosure -----------------------------------------------

    def _site_effect_disclosure(self, record: Dict[str, Any]) -> str:
        """Generate mandatory site effect disclosure text."""
        site_count = record.get("site_count", TOTAL_SITES)
        population = record.get("population", "ABIDE_combined")

        return (
            f"SITE EFFECT WARNING: This data aggregates results from {site_count} imaging "
            f"sites ({population}). Multi-site acquisition introduces heterogeneity from "
            f"different scanners, protocols, recruitment practices, and demographics. "
            f"Site effects (scanner manufacturer, field strength, sequence parameters) "
            f"can explain substantial variance in imaging measures. Any group comparison "
            f"must account for site as a covariate. Results may not generalize to sites "
            f"not represented in the ABIDE collection."
        )

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute an ABIDE reference data query.

        Supported keys:
            * ``modality``          — 'rs_fmri_connectivity', 't1_mri', 'phenotypic', 'dti'.
            * ``measure``           — Specific measure name (e.g., 'ALFF', 'FIQ').
            * ``diagnostic_group``  — 'ASD' or 'HC'.
            * ``age_range``         — Age range filter.
            * ``population``        — 'ABIDE_I', 'ABIDE_II', or 'ABIDE_combined'.
            * ``preprocessing``     — Pipeline name filter.
            * ``limit``             — Max results (default 50).
        """
        if not self._connected:
            await self.connect()

        modality = query.get("modality")
        measure = query.get("measure")
        diagnostic_group = query.get("diagnostic_group")
        age_range = query.get("age_range")
        population = query.get("population")
        preprocessing = query.get("preprocessing")
        limit = min(query.get("limit", 50), 500)

        records: List[Dict[str, Any]] = []

        # Query cached/built-in data
        modalities_to_query = [modality] if modality else list(self._data_cache.keys())

        for mod in modalities_to_query:
            cached = self._data_cache.get(mod, [])
            for entry in cached:
                if measure and entry.get("measure") != measure:
                    continue
                if diagnostic_group and entry.get("diagnostic_group") != diagnostic_group:
                    continue
                if age_range and entry.get("age_range") != age_range:
                    continue
                if population and entry.get("population") != population:
                    continue
                if preprocessing and entry.get("preprocessing_pipeline") != preprocessing:
                    continue
                records.append(dict(entry))
                if len(records) >= limit:
                    return records

        return records[:limit]

    # -- normalize ------------------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw ABIDE records into the standard schema."""
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm = self._normalize_single(raw)
            if norm:
                normalised.append(norm)
        return normalised

    def _normalize_single(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normalise a single ABIDE reference record."""
        modality = raw.get("modality", "")
        if not modality:
            return None

        measure = raw.get("measure", "")
        mod_info = ABIDE_MODALITIES.get(modality, {})

        return {
            "modality": modality,
            "modality_display_name": mod_info.get("display_name", modality),
            "measure": measure,
            "value": round(float(raw.get("value", 0.0)), 4) if raw.get("value") is not None else None,
            "reference_mean": round(float(raw.get("reference_mean", 0.0)), 4),
            "reference_sd": round(float(raw.get("reference_sd", 0.0)), 4),
            "population": raw.get("population", "ABIDE"),
            "diagnostic_group": raw.get("diagnostic_group", ""),
            "diagnostic_group_display": ABIDE_DIAGNOSTIC_GROUPS.get(
                raw.get("diagnostic_group", ""), ""
            ),
            "age_range": raw.get("age_range", ""),
            "site_count": int(raw.get("site_count", 0)),
            "total_subjects": int(raw.get("total_subjects", 0)),
            "preprocessing_pipeline": raw.get("preprocessing_pipeline", "unknown"),
            "pipeline_metadata": PREPROCESSING_PIPELINES.get(
                raw.get("preprocessing_pipeline", ""), {}
            ),
            "_site_effect_warning": raw.get("_site_effect_warning", True),
            "_raw": raw.get("_raw", raw),
        }

    # -- validate -------------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate records and attach governance metadata."""
        validated: List[Dict[str, Any]] = []
        for record in normalized_records:
            record["_valid"] = self._is_valid(record)
            record["_confidence"] = self.get_confidence(record).value
            # ABIDE is ALWAYS research-only per governance rules
            record["_research_only"] = True
            record["_research_only_reason"] = _RESEARCH_ONLY_REASON
            record["_site_effect_disclosure"] = (
                self._site_effect_disclosure(record) if self._site_effect_disclose else None
            )
            record["_caveat"] = self._caveat_text(record)
            record["_provenance"] = self.get_provenance(record)
            validated.append(record)
        return validated

    def _is_valid(self, record: Dict[str, Any]) -> bool:
        """Valid when record has modality, measure, and group info."""
        has_modality = bool(record.get("modality")) and record.get("modality") in ABIDE_MODALITIES
        has_measure = bool(record.get("measure"))
        has_group = record.get("diagnostic_group", "") in ABIDE_DIAGNOSTIC_GROUPS
        has_subjects = record.get("total_subjects", 0) > 0
        return has_modality and has_measure and has_group and has_subjects

    def _caveat_text(self, record: Dict[str, Any]) -> str:
        """Contextual caveat for ABIDE outputs."""
        modality = record.get("modality_display_name", record.get("modality", ""))
        group = record.get("diagnostic_group", "")
        n = record.get("total_subjects", 0)
        sites = record.get("site_count", 0)
        pipeline = record.get("preprocessing_pipeline", "")

        return (
            f"ABIDE group-level reference: {modality} ({record.get('measure', '')}) "
            f"for {group} group (n={n} across {sites} sites). "
            f"Preprocessing: {pipeline}. "
            f"Multi-site data has substantial scanner/protocol heterogeneity. "
            f"Site effects must be considered in any analysis. "
            f"These are research summary statistics — NOT diagnostic criteria. "
            f"Individual patient diagnosis is PROHIBITED."
        )

    # -- provenance & governance ----------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=f"{record.get('modality', 'unknown')}_{record.get('measure', 'na')}_{record.get('diagnostic_group', 'na')}",
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="CC BY-SA 3.0",
            license_url="https://creativecommons.org/licenses/by-sa/3.0/",
            attribution_text=(
                "ABIDE data: Di Martino A et al. Mol Psychiatry 2014 (ABIDE I); "
                "Di Martino A et al. 2017 (ABIDE II). Used under CC BY-SA 3.0."
            ),
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.COHORT_STUDY,
            research_only=True,
            retrieval_method="cached",
            data_quality_score=self._quality_score(record),
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="CC BY-SA 3.0",
            license_url="https://creativecommons.org/licenses/by-sa/3.0/",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            requires_share_alike=True,
            modification_allowed=True,
            redistribution_allowed=True,
            attribution_text=(
                "ABIDE data: Di Martino A et al. Mol Psychiatry 2014; "
                "Di Martino A et al. 2017. Used under CC BY-SA 3.0."
            ),
            restrictions=[
                "ShareAlike: derivative works must use CC BY-SA 3.0.",
                "Multi-site effects must be disclosed in any publication.",
                "Individual patient diagnosis PROHIBITED.",
                "Commercial diagnostic products PROHIBITED.",
                "Preprocessing pipeline must be reported.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Score confidence based on sample size, site count, and measure type."""
        total_subjects = record.get("total_subjects", 0)
        site_count = record.get("site_count", 0)
        modality = record.get("modality", "")

        # More sites reduces confidence due to heterogeneity
        if total_subjects >= _SUBJECTS_HIGH and site_count >= _SITES_HIGH:
            if modality == "phenotypic":
                return ConfidenceTier.MEDIUM  # Phenotypic is more reliable
            return ConfidenceTier.LOW  # Imaging: high site count = heterogeneity
        if total_subjects >= _SUBJECTS_MEDIUM and site_count >= _SITES_MEDIUM:
            return ConfidenceTier.LOW
        if total_subjects >= _SUBJECTS_LOW:
            return ConfidenceTier.RESEARCH
        return ConfidenceTier.RESEARCH

    def _quality_score(self, record: Dict[str, Any]) -> float:
        """Compute a 0.0–1.0 quality score."""
        total_subjects = record.get("total_subjects", 0)
        site_count = record.get("site_count", 0)

        subjects_norm = min(total_subjects / 1000.0, 1.0)
        # Penalize high site counts (more heterogeneity)
        site_penalty = max(0.0, 1.0 - ((site_count - 5) / 30.0))
        pipeline_score = 0.8 if record.get("preprocessing_pipeline") in PREPROCESSING_PIPELINES else 0.4

        return round((subjects_norm * 0.5) + (site_penalty * 0.3) + (pipeline_score * 0.2), 3)

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify ABIDE adapter status and report configuration."""
        healthy = self._connected
        return {
            "status": "ok" if healthy else "down",
            "source": self.source_name,
            "version": self.source_version,
            "connected": self._connected,
            "site_effect_disclosure": self._site_effect_disclose,
            "preferred_pipeline": self._pipeline,
            "pipelines_available": list(PREPROCESSING_PIPELINES.keys()),
            "modalities_cached": list(self._data_cache.keys()),
            "total_cached_records": sum(len(v) for v in self._data_cache.values()),
            "abide_i_sites": ABIDE_I_SITES,
            "abide_ii_sites": ABIDE_II_SITES,
            "total_sites": TOTAL_SITES,
        }
