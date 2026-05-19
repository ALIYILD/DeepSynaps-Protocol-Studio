"""
Neurosynth Adapter — Meta-Analytic Association Data.

Provides normalised access to Neurosynth meta-analytic term-to-brain-activation
associations. Supports both forward inference (P(term|activation)) and reverse
inference (P(activation|term)) with MANDATORY reverse-inference warnings.

Also supports NeuroQuery as a secondary data source.

GOVERNANCE RULES:
  1. Meta-analytic associations only — NEVER patient-specific findings.
  2. Reverse inference is PROHIBITED for clinical decision-making.
  3. Every reverse inference result MUST include explicit warning.
  4. NEVER present meta-analytic maps as patient-specific findings.

API:       https://neurosynth.org/api/
Local DB:  SQLite database (~1GB) recommended for production
License:   CC BY (Neurosynth), BSD-3 (NeuroQuery)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

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

NEUROSYNTH_API_BASE = "https://neurosynth.org/api"
DEFAULT_TIMEOUT = ClientTimeout(total=60, connect=15)
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0
REQUESTS_PER_SECOND = 3

# Inference type identifiers
FORWARD_INFERENCE = "forward"
REVERSE_INFERENCE = "reverse"

# Reverse inference warning template (MANDATORY)
_REVERSE_INFERENCE_WARNING = (
    "REVERSE INFERENCE WARNING: This result uses reverse inference "
    "(P(activation|term)), which is NOT valid for patient-specific interpretation. "
    "It indicates the probability of observing brain activation given a term across "
    "many studies, NOT the probability of a condition in an individual. "
    "Reverse inference is statistically and logically fallible. "
    "Do NOT use for clinical diagnosis or individual patient assessment."
)

_FORWARD_INFERENCE_NOTE = (
    "Forward inference: P(term|activation) — the probability that studies "
    "activating a given region mention a particular term. This is a "
    "population-level meta-analytic association, not an individual finding."
)

# Minimum study count thresholds for confidence
_MIN_STUDIES_HIGH = 50
_MIN_STUDIES_MEDIUM = 20
_MIN_STUDIES_LOW = 5

# Z-score thresholds
_Z_SCORE_HIGH = 3.0
_Z_SCORE_MEDIUM = 1.96

NORMALIZED_SCHEMA: Dict[str, type] = {
    "term": str,
    "term_id": str,
    "association_z_score": float,
    "posterior_probability": float,
    "num_studies": int,
    "num_activations": int,
    "inference_type": str,
    "coordinate": list,
    "radius_mm": float,
}


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class NeurosynthError(Exception):
    """Base exception for Neurosynth adapter errors."""
    pass


class NeurosynthNotFoundError(NeurosynthError):
    """Raised when a term or coordinate query returns no results."""
    pass


class NeurosynthAPIError(NeurosynthError):
    """Raised on unexpected HTTP status or malformed API response."""
    pass


class NeurosynthRateLimitError(NeurosynthError):
    """Raised when the Neurosynth API rate limit is exceeded."""
    pass


class NeurosynthSQLiteError(NeurosynthError):
    """Raised when the local SQLite database cannot be queried."""
    pass


class NeurosynthReverseInferenceViolation(NeurosynthError):
    """Raised when reverse inference is used inappropriately for clinical decisions."""
    pass


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class NeurosynthAdapter(DatabaseAdapter):
    """Async adapter for Neurosynth meta-analytic association data.

    Provides forward and reverse inference term-to-brain mappings with
    MANDATORY governance warnings. Supports both the Neurosynth REST API
    and a local SQLite database for high-throughput queries.

    ALL outputs are flagged as research-only per governance rules.
    Reverse inference results carry explicit warnings and are PROHIBITED
    for clinical decision-making.

    Configuration keys (all optional):
        * ``sqlite_path``     — Path to local Neurosynth SQLite database.
        * ``timeout``         — Request timeout in seconds (default 60).
        * ``max_retries``     — Retry attempts (default 3).
        * ``cache_ttl``       — Cache TTL in seconds (default 86400).
        * ``allow_reverse``   — If False, reverse inference raises error.
        * ``min_studies``     — Minimum study count for results (default 5).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._version: str = self.config.get("version", "current")
        self._sqlite_path: Optional[str] = self.config.get("sqlite_path")
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", 60), connect=15
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._cache_ttl: int = self.config.get("cache_ttl", 86_400)
        self._allow_reverse: bool = self.config.get("allow_reverse", True)
        self._min_studies: int = self.config.get("min_studies", _MIN_STUDIES_LOW)
        self._session: Optional[aiohttp.ClientSession] = None
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._last_request_time: float = 0.0
        self._sqlite_conn: Optional[sqlite3.Connection] = None
        self._term_cache: Dict[str, Dict[str, Any]] = {}

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "Neurosynth"

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
            raise NeurosynthError("HTTP session not initialised — call connect() first.")

        url = f"{NEUROSYNTH_API_BASE}{endpoint}"
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
                    raise NeurosynthRateLimitError(
                        "Neurosynth API rate limit exceeded"
                    ) from exc
                if 500 <= exc.status < 600:
                    last_exception = exc
                    wait = RETRY_BACKOFF * attempt
                    logger.warning(
                        "Neurosynth transient error %s on attempt %d/%d — retrying in %.1fs",
                        exc.status,
                        attempt,
                        self._max_retries,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise NeurosynthAPIError(
                    f"Neurosynth API error {exc.status}: {exc.message}"
                ) from exc
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "Neurosynth network error on attempt %d/%d — retrying in %.1fs",
                    attempt,
                    self._max_retries,
                    wait,
                )
                await asyncio.sleep(wait)

        raise NeurosynthAPIError(
            f"Neurosynth request failed after {self._max_retries} attempts"
        ) from last_exception

    # -- SQLite helpers -------------------------------------------------------

    def _init_sqlite(self) -> bool:
        """Initialise local SQLite connection if path is configured."""
        if not self._sqlite_path:
            return False
        try:
            self._sqlite_conn = sqlite3.connect(self._sqlite_path)
            self._sqlite_conn.row_factory = sqlite3.Row
            # Verify database has expected tables
            cursor = self._sqlite_conn.cursor()
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('terms', 'studies')"
            )
            tables = [row[0] for row in cursor.fetchall()]
            if "terms" not in tables:
                logger.warning("Neurosynth SQLite missing 'terms' table")
                return False
            return True
        except sqlite3.Error as exc:
            logger.warning("Neurosynth SQLite init error: %s", exc)
            return False

    def _query_sqlite_terms(self, term: str) -> List[Dict[str, Any]]:
        """Query local SQLite for term associations."""
        if not self._sqlite_conn:
            return []
        try:
            cursor = self._sqlite_conn.cursor()
            cursor.execute(
                """
                SELECT t.term, t.term_id, f.z_score, f.posterior_probability,
                       f.num_studies, f.num_activations, f.inference_type,
                       f.x, f.y, f.z, f.radius_mm
                FROM terms t
                JOIN feature_associations f ON t.term_id = f.term_id
                WHERE t.term LIKE ? AND f.num_studies >= ?
                ORDER BY f.z_score DESC
                LIMIT 100
                """,
                (f"%{term}%", self._min_studies),
            )
            rows = cursor.fetchall()
            return [
                {
                    "term": row["term"],
                    "term_id": str(row["term_id"]),
                    "association_z_score": float(row["z_score"]),
                    "posterior_probability": float(row["posterior_probability"]),
                    "num_studies": int(row["num_studies"]),
                    "num_activations": int(row["num_activations"]),
                    "inference_type": row["inference_type"],
                    "coordinate": [float(row["x"]), float(row["y"]), float(row["z"])],
                    "radius_mm": float(row["radius_mm"]),
                }
                for row in rows
            ]
        except sqlite3.Error as exc:
            logger.error("Neurosynth SQLite query error: %s", exc)
            return []

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise HTTP session and optional SQLite connection."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-NeurosynthAdapter/1.0",
                },
            )

        # Try SQLite first; fall back to HTTP API
        if self._sqlite_path and Path(self._sqlite_path).exists():
            if self._init_sqlite():
                self._connected = True
                logger.info("NeurosynthAdapter connected — SQLite (%s)", self._sqlite_path)
                return True

        # Verify HTTP API reachability
        try:
            await self._request("/terms", {"limit": "1"})
            self._connected = True
            logger.info("NeurosynthAdapter connected — HTTP API")
            return True
        except NeurosynthError:
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Close all connections and flush caches."""
        if self._session and not self._session.closed:
            await self._session.close()
        if self._sqlite_conn:
            self._sqlite_conn.close()
            self._sqlite_conn = None
        self._cache.clear()
        self._term_cache.clear()
        self._connected = False
        logger.info("NeurosynthAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute a meta-analysis query against Neurosynth.

        Supported keys:
            * ``term``           — Term to query (e.g., 'language', 'memory').
            * ``term_id``        — Exact Neurosynth term ID.
            * ``coordinate``     — [x, y, z] MNI coordinate for nearby terms.
            * ``radius_mm``      — Search radius for coordinate queries (default 10).
            * ``inference_type`` — 'forward' or 'reverse' (default 'forward').
            * ``limit``          — Max results (default 50).

        REVERSE INFERENCE WARNING:
            When inference_type='reverse', results carry mandatory warnings.
            Reverse inference must NOT be used for clinical decision-making.
        """
        if not self._connected:
            await self.connect()

        term = query.get("term")
        term_id = query.get("term_id")
        coordinate = query.get("coordinate")
        radius_mm = query.get("radius_mm", 10.0)
        inference_type = query.get("inference_type", FORWARD_INFERENCE)
        limit = min(query.get("limit", 50), 500)

        # Governance: check reverse inference prohibition
        if inference_type == REVERSE_INFERENCE and not self._allow_reverse:
            raise NeurosynthReverseInferenceViolation(
                "Reverse inference is disabled by configuration. "
                "It is not valid for patient-specific interpretation."
            )

        records: List[Dict[str, Any]] = []

        # Try SQLite first if available
        if self._sqlite_conn and term:
            records = self._query_sqlite_terms(term)
            # Filter by inference type
            records = [r for r in records if r["inference_type"] == inference_type]
            if records:
                return records[:limit]

        # Fall back to HTTP API
        if term:
            records = await self._fetch_by_term(term, inference_type, limit)
        elif term_id:
            records = await self._fetch_by_term_id(term_id, inference_type, limit)
        elif coordinate:
            records = await self._fetch_by_coordinate(coordinate, radius_mm, inference_type, limit)
        else:
            raise NeurosynthError(
                "Query must contain 'term', 'term_id', or 'coordinate'."
            )

        return records

    async def _fetch_by_term(
        self, term: str, inference_type: str, limit: int
    ) -> List[Dict[str, Any]]:
        """Fetch associations for a specific term."""
        cache_key = f"term_{term}_{inference_type}"
        if cache_key in self._term_cache:
            return self._term_cache[cache_key][:limit]

        data = await self._request("/terms", {"q": term, "limit": str(limit)})
        results: List[Dict[str, Any]] = []
        terms_data = data.get("data", [])

        for term_entry in terms_data:
            tid = term_entry.get("id", "")
            tname = term_entry.get("term", "")
            features = term_entry.get("features", [])

            for feat in features:
                feat_type = feat.get("type", "")
                if inference_type == REVERSE_INFERENCE and feat_type != "reverse":
                    continue
                if inference_type == FORWARD_INFERENCE and feat_type != "forward":
                    continue

                record = {
                    "term": tname,
                    "term_id": str(tid),
                    "association_z_score": float(feat.get("z_score", 0.0)),
                    "posterior_probability": float(feat.get("probability", 0.0)),
                    "num_studies": int(feat.get("num_studies", 0)),
                    "num_activations": int(feat.get("num_activations", 0)),
                    "inference_type": inference_type,
                    "coordinate": [
                        float(feat.get("x", 0.0)),
                        float(feat.get("y", 0.0)),
                        float(feat.get("z", 0.0)),
                    ],
                    "radius_mm": float(feat.get("radius_mm", 6.0)),
                    "_reverse_inference_warning": (
                        _REVERSE_INFERENCE_WARNING if inference_type == REVERSE_INFERENCE else None
                    ),
                    "_forward_inference_note": (
                        _FORWARD_INFERENCE_NOTE if inference_type == FORWARD_INFERENCE else None
                    ),
                }
                results.append(record)

        self._term_cache[cache_key] = results
        return results[:limit]

    async def _fetch_by_term_id(
        self, term_id: str, inference_type: str, limit: int
    ) -> List[Dict[str, Any]]:
        """Fetch associations by exact term ID."""
        data = await self._request(f"/terms/{term_id}", {})
        tname = data.get("term", "")
        features = data.get("features", [])

        results: List[Dict[str, Any]] = []
        for feat in features:
            feat_type = feat.get("type", "")
            if inference_type == REVERSE_INFERENCE and feat_type != "reverse":
                continue
            if inference_type == FORWARD_INFERENCE and feat_type != "forward":
                continue

            record = {
                "term": tname,
                "term_id": str(term_id),
                "association_z_score": float(feat.get("z_score", 0.0)),
                "posterior_probability": float(feat.get("probability", 0.0)),
                "num_studies": int(feat.get("num_studies", 0)),
                "num_activations": int(feat.get("num_activations", 0)),
                "inference_type": inference_type,
                "coordinate": [
                    float(feat.get("x", 0.0)),
                    float(feat.get("y", 0.0)),
                    float(feat.get("z", 0.0)),
                ],
                "radius_mm": float(feat.get("radius_mm", 6.0)),
                "_reverse_inference_warning": (
                    _REVERSE_INFERENCE_WARNING if inference_type == REVERSE_INFERENCE else None
                ),
                "_forward_inference_note": (
                    _FORWARD_INFERENCE_NOTE if inference_type == FORWARD_INFERENCE else None
                ),
            }
            results.append(record)

        return results[:limit]

    async def _fetch_by_coordinate(
        self, coordinate: List[float], radius_mm: float, inference_type: str, limit: int
    ) -> List[Dict[str, Any]]:
        """Fetch terms associated with a specific MNI coordinate."""
        x, y, z = coordinate
        data = await self._request(
            "/locations",
            {"x": str(x), "y": str(y), "z": str(z), "r": str(radius_mm), "limit": str(limit)},
        )
        results: List[Dict[str, Any]] = []
        locations = data.get("data", [])

        for loc in locations:
            terms = loc.get("terms", [])
            for t in terms:
                record = {
                    "term": t.get("term", ""),
                    "term_id": str(t.get("id", "")),
                    "association_z_score": float(t.get("z_score", 0.0)),
                    "posterior_probability": float(t.get("probability", 0.0)),
                    "num_studies": int(t.get("num_studies", 0)),
                    "num_activations": int(t.get("num_activations", 0)),
                    "inference_type": inference_type,
                    "coordinate": [x, y, z],
                    "radius_mm": radius_mm,
                    "_reverse_inference_warning": (
                        _REVERSE_INFERENCE_WARNING if inference_type == REVERSE_INFERENCE else None
                    ),
                    "_forward_inference_note": (
                        _FORWARD_INFERENCE_NOTE if inference_type == FORWARD_INFERENCE else None
                    ),
                }
                results.append(record)

        return results[:limit]

    # -- normalize ------------------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw Neurosynth records into the standard schema."""
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm = self._normalize_single(raw)
            if norm:
                normalised.append(norm)
        return normalised

    def _normalize_single(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normalise a single Neurosynth association record."""
        term = raw.get("term", "")
        if not term:
            return None

        num_studies = raw.get("num_studies", 0)
        if num_studies < self._min_studies:
            return None

        inference_type = raw.get("inference_type", FORWARD_INFERENCE)

        return {
            "term": term,
            "term_id": str(raw.get("term_id", "")),
            "association_z_score": round(raw.get("association_z_score", 0.0), 4),
            "posterior_probability": round(raw.get("posterior_probability", 0.0), 4),
            "num_studies": int(num_studies),
            "num_activations": int(raw.get("num_activations", 0)),
            "inference_type": inference_type,
            "coordinate": raw.get("coordinate", [0.0, 0.0, 0.0]),
            "radius_mm": raw.get("radius_mm", 6.0),
            "_reverse_inference_warning": raw.get("_reverse_inference_warning"),
            "_forward_inference_note": raw.get("_forward_inference_note"),
            "_meta_analysis_only": True,
            "_raw": raw,
        }

    # -- validate -------------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate records and attach governance metadata with mandatory warnings."""
        validated: List[Dict[str, Any]] = []
        for record in normalized_records:
            record["_valid"] = self._is_valid(record)
            record["_confidence"] = self.get_confidence(record).value
            # Neurosynth is ALWAYS research-only per governance rules
            record["_research_only"] = True
            record["_research_only_reason"] = self._research_only_reason()
            record["_caveat"] = self._caveat_text(record)

            # Mandatory reverse inference warning
            if record.get("inference_type") == REVERSE_INFERENCE:
                record["_reverse_inference_violation_flag"] = True
                record["_reverse_inference_mandatory_warning"] = _REVERSE_INFERENCE_WARNING
                logger.warning(
                    "Reverse inference result validated for term '%s' — "
                    "MANDATORY WARNING attached",
                    record.get("term", "unknown"),
                )

            record["_provenance"] = self.get_provenance(record)
            validated.append(record)
        return validated

    def _is_valid(self, record: Dict[str, Any]) -> bool:
        """Valid when record has a term, z-score, and sufficient studies."""
        has_term = bool(record.get("term"))
        has_z_score = abs(record.get("association_z_score", 0.0)) > 0
        sufficient_studies = record.get("num_studies", 0) >= self._min_studies
        return has_term and has_z_score and sufficient_studies

    def _research_only_reason(self) -> str:
        """Governance-required research-only explanation."""
        return (
            "Neurosynth provides meta-analytic associations from aggregated neuroimaging "
            "studies. Reverse inference is not valid for patient-specific interpretation. "
            "These are population-level associations, not individual predictions. "
            "Meta-analytic maps must never be presented as patient-specific findings."
        )

    def _caveat_text(self, record: Dict[str, Any]) -> str:
        """Contextual caveat for Neurosynth outputs."""
        inference = record.get("inference_type", FORWARD_INFERENCE)
        num_studies = record.get("num_studies", 0)

        base = (
            f"Neurosynth meta-analysis based on {num_studies} fMRI studies. "
            f"Population-level association only — not patient-specific. "
        )
        if inference == REVERSE_INFERENCE:
            base += (
                "REVERSE INFERENCE: P(activation|term) describes the probability of "
                "observing activation given a term across studies. It does NOT describe "
                "the probability of a condition in an individual. Subject to reverse "
                "inference fallacy. Clinical use PROHIBITED."
            )
        else:
            base += (
                "FORWARD INFERENCE: P(term|activation) describes how likely studies "
                "activating a region mention a term. Directionally more reliable than "
                "reverse inference but still population-level."
            )
        return base

    # -- provenance & governance ----------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        inference = record.get("inference_type", FORWARD_INFERENCE)
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=f"{record.get('term_id', 'unknown')}_{record.get('inference_type', 'forward')}",
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="CC BY",
            license_url="https://creativecommons.org/licenses/by/4.0/",
            attribution_text="Data from Neurosynth (neurosynth.org), used under CC BY license.",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.META_ANALYSIS,
            research_only=True,
            retrieval_method="direct",
            data_quality_score=self._quality_score(record),
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="CC BY (Neurosynth) / BSD-3 (NeuroQuery)",
            license_url="https://creativecommons.org/licenses/by/4.0/",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=True,
            requires_share_alike=False,
            modification_allowed=True,
            redistribution_allowed=True,
            attribution_text="Neurosynth data © Neurosynth.org, used under CC BY 4.0.",
            restrictions=[
                "Meta-analytic associations only — NOT patient-specific findings.",
                "Reverse inference is PROHIBITED for clinical decision-making.",
                "NeuroQuery: BSD-3-Clause license applies.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Score confidence based on study count, z-score, and inference type."""
        num_studies = record.get("num_studies", 0)
        z_score = abs(record.get("association_z_score", 0.0))
        inference = record.get("inference_type", FORWARD_INFERENCE)

        # Reverse inference always capped at MEDIUM
        if inference == REVERSE_INFERENCE:
            if num_studies >= _MIN_STUDIES_HIGH and z_score >= _Z_SCORE_MEDIUM:
                return ConfidenceTier.MEDIUM
            return ConfidenceTier.LOW

        # Forward inference can be HIGH
        if num_studies >= _MIN_STUDIES_HIGH and z_score >= _Z_SCORE_HIGH:
            return ConfidenceTier.HIGH
        if num_studies >= _MIN_STUDIES_MEDIUM and z_score >= _Z_SCORE_MEDIUM:
            return ConfidenceTier.MEDIUM
        if num_studies >= _MIN_STUDIES_LOW:
            return ConfidenceTier.LOW
        return ConfidenceTier.RESEARCH

    def _quality_score(self, record: Dict[str, Any]) -> float:
        """Compute a 0.0–1.0 quality score for the record."""
        num_studies = record.get("num_studies", 0)
        z_score = abs(record.get("association_z_score", 0.0))
        pp = record.get("posterior_probability", 0.0)

        study_norm = min(num_studies / 100.0, 1.0)
        z_norm = min(z_score / 5.0, 1.0)
        pp_norm = pp  # Already 0-1

        return round((study_norm * 0.4) + (z_norm * 0.4) + (pp_norm * 0.2), 3)

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify Neurosynth API/SQLite reachability and report status."""
        sqlite_ok = self._sqlite_conn is not None

        if not self._session or self._session.closed:
            return {
                "status": "down",
                "latency_ms": None,
                "source": self.source_name,
                "sqlite_available": sqlite_ok,
                "error": "Session closed",
            }

        start = asyncio.get_event_loop().time()
        try:
            if not sqlite_ok:
                await self._request("/terms", {"limit": "1"})
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "base_url": NEUROSYNTH_API_BASE,
                "sqlite_available": sqlite_ok,
                "reverse_inference_allowed": self._allow_reverse,
                "min_studies_threshold": self._min_studies,
                "term_cache_size": len(self._term_cache),
            }
        except NeurosynthError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "sqlite_available": sqlite_ok,
                "error": str(exc),
            }
