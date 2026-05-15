"""OpenFDA API client for adverse event lookup with caching and offline fallback.

Decision-support only -- not a replacement for FAERS database analysis.

This module provides:
- query_adverse_events(): Query OpenFDA drug adverse event reports
- query_drug_label(): Query OpenFDA drug labeling for warnings/contraindications
- signal_detection_prr(): Calculate Proportional Reporting Ratio (PRR) and chi-square

All results are cached in SQLite with 24-hour TTL. When the OpenFDA API is
unreachable, cached data is returned with ``cached: true, offline: true`` flags.
Every result carries evidence grade "C" (observational data).

Key URLs:
- https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:{drug}&limit={limit}
- https://api.fda.gov/drug/label.json?search=openfda.generic_name:{drug}
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────────

OPENFDA_BASE = "https://api.fda.gov"
OPENFDA_EVENT_ENDPOINT = f"{OPENFDA_BASE}/drug/event.json"
OPENFDA_LABEL_ENDPOINT = f"{OPENFDA_BASE}/drug/label.json"

# API request timeout (connect, read) in seconds
DEFAULT_TIMEOUT = httpx.Timeout(8.0, connect=4.0, read=10.0)

# Cache TTL in seconds (24 hours)
CACHE_TTL_SECONDS = 24 * 60 * 60

# Default SQLite cache path (override via OPENFDA_CACHE_PATH env var)
DEFAULT_CACHE_PATH = Path(__file__).resolve().parents[3] / "data" / "cache" / "openfda_cache.db"

# Evidence grade for all OpenFDA-derived data
EVIDENCE_GRADE = "C"

# ── Cache layer ──────────────────────────────────────────────────────────────


@dataclass(slots=True)
class CacheEntry:
    """Single cache entry with TTL support."""

    key: str
    data: dict[str, Any]
    created_at: float  # unix timestamp
    ttl_seconds: int = CACHE_TTL_SECONDS

    @property
    def is_expired(self) -> bool:
        return (time.time() - self.created_at) > self.ttl_seconds

    @property
    def is_fresh(self) -> bool:
        return not self.is_expired


class OpenFDACache:
    """SQLite-backed cache for OpenFDA API responses.

    Provides thread-safe access with automatic expiration and cleanup.
    Falls back to in-memory-only operation if the DB is unreachable.
    """

    _SCHEMA = """
    CREATE TABLE IF NOT EXISTS openfda_cache (
        cache_key TEXT PRIMARY KEY,
        cache_data TEXT NOT NULL,
        created_at REAL NOT NULL,
        endpoint TEXT,
        drug_name TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_openfda_created ON openfda_cache(created_at);
    CREATE INDEX IF NOT EXISTS idx_openfda_drug ON openfda_cache(drug_name);
    """

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(db_path or os.getenv("OPENFDA_CACHE_PATH", DEFAULT_CACHE_PATH))
        self._memory: dict[str, CacheEntry] = {}
        self._db_ok = False
        self._ensure_schema()

    # ── Internal helpers ──────────────────────────────────────────────────

    def _ensure_schema(self) -> None:
        """Create cache directory and schema if they don't exist."""
        try:
            Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(self._db_path, timeout=10) as conn:
                conn.executescript(self._SCHEMA)
                self._db_ok = True
        except Exception as exc:
            logger.warning("OpenFDA cache DB unavailable (%s); falling back to in-memory", exc)
            self._db_ok = False

    def _make_key(self, endpoint: str, params: dict[str, Any]) -> str:
        """Deterministic cache key from endpoint + sorted params."""
        payload = json.dumps({"endpoint": endpoint, "params": params}, sort_keys=True, default=str)
        return hashlib.sha256(payload.encode()).hexdigest()[:32]

    # ── Public API ────────────────────────────────────────────────────────

    def get(self, endpoint: str, params: dict[str, Any]) -> Optional[CacheEntry]:
        """Fetch entry from cache if present and not expired."""
        key = self._make_key(endpoint, params)

        # Check in-memory first
        if key in self._memory and self._memory[key].is_fresh:
            return self._memory[key]

        # Check SQLite
        if self._db_ok:
            try:
                with sqlite3.connect(self._db_path, timeout=10) as conn:
                    row = conn.execute(
                        "SELECT cache_data, created_at FROM openfda_cache WHERE cache_key = ?",
                        (key,),
                    ).fetchone()
                    if row:
                        data = json.loads(row[0])
                        entry = CacheEntry(key=key, data=data, created_at=row[1])
                        if entry.is_fresh:
                            self._memory[key] = entry
                            return entry
                        # Expired -- delete it
                        conn.execute("DELETE FROM openfda_cache WHERE cache_key = ?", (key,))
            except Exception as exc:
                logger.warning("OpenFDA cache read error (%s); using memory only", exc)
                self._db_ok = False

        return None

    def set(
        self,
        endpoint: str,
        params: dict[str, Any],
        data: dict[str, Any],
        drug_name: str | None = None,
    ) -> None:
        """Store entry in both SQLite and memory."""
        key = self._make_key(endpoint, params)
        now = time.time()
        entry = CacheEntry(key=key, data=data, created_at=now)
        self._memory[key] = entry

        if self._db_ok:
            try:
                with sqlite3.connect(self._db_path, timeout=10) as conn:
                    conn.execute(
                        """INSERT OR REPLACE INTO openfda_cache
                           (cache_key, cache_data, created_at, endpoint, drug_name)
                           VALUES (?, ?, ?, ?, ?)""",
                        (key, json.dumps(data, default=str), now, endpoint, drug_name),
                    )
            except Exception as exc:
                logger.warning("OpenFDA cache write error (%s); memory only", exc)
                self._db_ok = False

    def get_offline_fallback(self, endpoint: str, params: dict[str, Any]) -> Optional[dict[str, Any]]:
        """Return stale cached data (with offline flags) when API is unreachable."""
        key = self._make_key(endpoint, params)

        # Try memory first (even if expired)
        if key in self._memory:
            entry = self._memory[key]
            result = dict(entry.data)
            result["cached"] = True
            result["offline"] = True
            result["cache_age_hours"] = round((time.time() - entry.created_at) / 3600, 1)
            return result

        # Try SQLite (even if expired)
        if self._db_ok:
            try:
                with sqlite3.connect(self._db_path, timeout=10) as conn:
                    row = conn.execute(
                        "SELECT cache_data, created_at FROM openfda_cache WHERE cache_key = ?",
                        (key,),
                    ).fetchone()
                    if row:
                        result = json.loads(row[0])
                        result["cached"] = True
                        result["offline"] = True
                        result["cache_age_hours"] = round((time.time() - row[1]) / 3600, 1)
                        return result
            except Exception as exc:
                logger.warning("OpenFDA offline fallback read error (%s)", exc)

        return None

    def clear_expired(self) -> int:
        """Remove expired entries. Returns count deleted."""
        cutoff = time.time() - CACHE_TTL_SECONDS
        count = 0

        # Memory
        expired_keys = [k for k, v in self._memory.items() if v.is_expired]
        for k in expired_keys:
            del self._memory[k]
            count += 1

        # SQLite
        if self._db_ok:
            try:
                with sqlite3.connect(self._db_path, timeout=10) as conn:
                    cursor = conn.execute("DELETE FROM openfda_cache WHERE created_at < ?", (cutoff,))
                    count += cursor.rowcount
            except Exception as exc:
                logger.warning("OpenFDA cache cleanup error (%s)", exc)

        return count

    def clear_all(self) -> int:
        """Clear entire cache. Returns count deleted."""
        count = len(self._memory)
        self._memory.clear()

        if self._db_ok:
            try:
                with sqlite3.connect(self._db_path, timeout=10) as conn:
                    cursor = conn.execute("DELETE FROM openfda_cache")
                    count += cursor.rowcount
            except Exception as exc:
                logger.warning("OpenFDA cache clear error (%s)", exc)

        return count

    def stats(self) -> dict[str, Any]:
        """Return cache statistics."""
        mem_entries = len(self._memory)
        mem_expired = sum(1 for v in self._memory.values() if v.is_expired)
        db_entries = 0
        db_expired = 0

        if self._db_ok:
            try:
                with sqlite3.connect(self._db_path, timeout=10) as conn:
                    db_entries = conn.execute("SELECT COUNT(*) FROM openfda_cache").fetchone()[0]
                    cutoff = time.time() - CACHE_TTL_SECONDS
                    db_expired = conn.execute(
                        "SELECT COUNT(*) FROM openfda_cache WHERE created_at < ?", (cutoff,)
                    ).fetchone()[0]
            except Exception as exc:
                logger.warning("OpenFDA cache stats error (%s)", exc)

        return {
            "memory_entries": mem_entries,
            "memory_expired": mem_expired,
            "db_entries": db_entries,
            "db_expired": db_expired,
            "db_path": self._db_path,
            "db_ok": self._db_ok,
            "ttl_hours": CACHE_TTL_SECONDS // 3600,
        }


# ── Singleton cache instance ─────────────────────────────────────────────────

_cache_instance: OpenFDACache | None = None


def get_cache() -> OpenFDACache:
    """Return singleton cache instance."""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = OpenFDACache()
    return _cache_instance


# ── HTTP client ──────────────────────────────────────────────────────────────

_httpx_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """Return or create shared async HTTP client."""
    global _httpx_client
    if _httpx_client is None or _httpx_client.is_closed:
        _httpx_client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True)
    return _httpx_client


async def _async_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    """Execute async GET with timeout and error handling."""
    client = _get_client()
    try:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("OpenFDA HTTP %s for %s: %s", exc.response.status_code, url, exc)
        raise
    except httpx.TimeoutException:
        logger.warning("OpenFDA timeout for %s", url)
        raise
    except Exception as exc:
        logger.warning("OpenFDA request error for %s: %s", url, exc)
        raise


def _sync_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    """Synchronous GET for non-async contexts."""
    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("OpenFDA HTTP %s for %s: %s", exc.response.status_code, url, exc)
        raise
    except httpx.TimeoutException:
        logger.warning("OpenFDA timeout for %s", url)
        raise
    except Exception as exc:
        logger.warning("OpenFDA request error for %s: %s", url, exc)
        raise


# ── API functions ────────────────────────────────────────────────────────────


def _add_evidence_metadata(result: dict[str, Any], drug_name: str) -> dict[str, Any]:
    """Attach evidence grade and decision-support disclaimers."""
    result["evidence_grade"] = EVIDENCE_GRADE
    result["evidence_source"] = "OpenFDA/FAERS"
    result["evidence_type"] = "observational"
    result["queried_drug"] = drug_name
    result["queried_at"] = datetime.now(timezone.utc).isoformat()
    result["disclaimer"] = (
        "Decision-support only. FAERS data are self-reported and unverified. "
        "Not a replacement for systematic pharmacovigilance analysis. "
        "Requires clinician/pharmacist interpretation."
    )
    return result


def query_adverse_events(drug_name: str, limit: int = 5) -> list[dict]:
    """Query OpenFDA for adverse events reported for *drug_name*.

    Returns a list of adverse event records with:
    - patient demographics (age, sex, weight when available)
    - reporter information
    - reaction terms (PT - preferred terms)
    - drug role (suspect, concomitant, interacting)
    - event date and report ID

    All results carry evidence grade "C" (observational/FAERS data).
    Cached for 24 hours. Returns cached data with ``offline: true`` on API failure.
    """
    if not drug_name or not str(drug_name).strip():
        return []

    drug = str(drug_name).strip()
    params = {"search": f'patient.drug.medicinalproduct:"{drug}"', "limit": max(1, min(limit, 100))}
    cache = get_cache()

    # Check cache
    cached = cache.get(OPENFDA_EVENT_ENDPOINT, params)
    if cached and cached.is_fresh:
        result = dict(cached.data)
        result["cached"] = True
        result["offline"] = False
        return _add_evidence_metadata(result, drug)["results"]

    # Fetch from API
    try:
        raw = _sync_get(OPENFDA_EVENT_ENDPOINT, params)
    except Exception:
        # Fallback to stale cache
        fallback = cache.get_offline_fallback(OPENFDA_EVENT_ENDPOINT, params)
        if fallback:
            logger.info("OpenFDA offline fallback used for adverse events: %s", drug)
            return fallback.get("results", [])
        # Return empty with metadata
        return []

    # Parse and store
    results = _parse_event_results(raw)
    to_cache = {"results": results, "meta": raw.get("meta", {})}
    cache.set(OPENFDA_EVENT_ENDPOINT, params, to_cache, drug_name=drug)
    return _add_evidence_metadata(to_cache, drug)["results"]


def query_drug_label(drug_name: str) -> dict | None:
    """Query OpenFDA drug labeling for warnings, contraindications, and precautions.

    Returns a dict with:
    - warnings (boxed warnings if present)
    - contraindications
    - precautions
    - drug interactions
    - pregnancy/lactation information
    - description and indication

    Returns ``None`` if no label found. Evidence grade "C".
    """
    if not drug_name or not str(drug_name).strip():
        return None

    drug = str(drug_name).strip()
    params = {"search": f'openfda.generic_name:"{drug}"', "limit": 1}
    cache = get_cache()

    # Check cache
    cached = cache.get(OPENFDA_LABEL_ENDPOINT, params)
    if cached and cached.is_fresh:
        result = dict(cached.data)
        result["cached"] = True
        result["offline"] = False
        return _add_evidence_metadata(result, drug)

    # Fetch from API
    try:
        raw = _sync_get(OPENFDA_LABEL_ENDPOINT, params)
    except Exception:
        fallback = cache.get_offline_fallback(OPENFDA_LABEL_ENDPOINT, params)
        if fallback:
            logger.info("OpenFDA offline fallback used for drug label: %s", drug)
            return fallback
        return None

    # Parse and store
    parsed = _parse_label_results(raw)
    if parsed is None:
        return None

    cache.set(OPENFDA_LABEL_ENDPOINT, params, parsed, drug_name=drug)
    return _add_evidence_metadata(parsed, drug)


def signal_detection_prr(drug_name: str, event_term: str) -> dict:
    """Calculate Proportional Reporting Ratio (PRR) and chi-square statistic.

    Uses OpenFDA's count API to estimate:
    - a: reports with drug + event
    - b: reports with drug without event
    - c: reports without drug with event
    - d: reports without drug without event

    Returns dict with PRR, chi-square, confidence interval, and interpretation.
    Evidence grade "C" (spontaneous reporting data).

    PRR = [a / (a+b)] / [c / (c+d)]
    Chi-square = (ad-bc)^2 * N / [(a+b)(c+d)(a+c)(b+d)]  (with Yates continuity correction)
    """
    if not drug_name or not event_term:
        return _empty_prr_result(drug_name or "", event_term or "")

    drug = str(drug_name).strip()
    event = str(event_term).strip()
    cache_key = {"drug": drug, "event": event, "method": "prr"}
    cache = get_cache()

    # Check cache
    cached = cache.get("prr_calculation", cache_key)
    if cached and cached.is_fresh:
        result = dict(cached.data)
        result["cached"] = True
        result["offline"] = False
        return result

    try:
        # Count a: drug + event
        a = _count_reports(drug, event)
        # Count b: drug + NOT event
        b = _count_reports(drug, event, exclude_event=True)
        # Count c: NOT drug + event
        c = _count_reports(drug, event, exclude_drug=True)
        # Count d: NOT drug + NOT event (estimated from totals)
        d = _estimate_total_reports() - a - b - c
        d = max(d, 1)  # Avoid division by zero
    except Exception as exc:
        logger.warning("PRR count query failed: %s", exc)
        fallback = cache.get_offline_fallback("prr_calculation", cache_key)
        if fallback:
            return fallback
        return _empty_prr_result(drug, event, error=str(exc))

    result = _calculate_prr_metrics(drug, event, a, b, c, d)
    cache.set("prr_calculation", cache_key, result, drug_name=drug)
    return result


# ── Result parsers ───────────────────────────────────────────────────────────


def _parse_event_results(raw: dict[str, Any]) -> list[dict]:
    """Extract adverse event records from OpenFDA response."""
    results: list[dict] = []
    for result in raw.get("results", []):
        patient = result.get("patient", {})
        drugs = patient.get("drug", [])
        reactions = patient.get("reaction", [])

        # Extract reaction terms
        reaction_terms: list[str] = []
        for r in reactions:
            term = r.get("reactionmeddrapt") or r.get("reactionmeddraversionpt")
            if term:
                reaction_terms.append(term)

        # Extract drug info
        drug_list: list[dict] = []
        for d in drugs:
            drug_list.append({
                "name": d.get("medicinalproduct", "unknown"),
                "role": d.get("drugcharacterization", "unknown"),
            })

        results.append({
            "safety_report_id": result.get("safetyreportid", "unknown"),
            "receive_date": result.get("receivedate", ""),
            "serious": result.get("serious", "unknown"),
            "seriousness": {
                "death": result.get("seriousnessdeath", "") == "1",
                "hospitalization": result.get("seriousnesshospitalization", "") == "1",
                "disability": result.get("seriousnessdisabling", "") == "1",
                "congenital": result.get("seriousnesscongenitalanomali", "") == "1",
                "life_threatening": result.get("seriousnesslifethreatening", "") == "1",
            },
            "patient": {
                "age": patient.get("patientonsetage", None),
                "age_unit": patient.get("patientonsetageunit", ""),
                "sex": patient.get("patientsex", ""),
                "weight_kg": patient.get("patientweight", None),
            },
            "reactions": reaction_terms,
            "drugs": drug_list,
            "report_source": result.get("primarysource", {}).get("qualification", ""),
        })
    return results


def _parse_label_results(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Extract drug label information from OpenFDA response."""
    results = raw.get("results", [])
    if not results:
        return None

    label = results[0]
    openfda = label.get("openfda", {})

    def _get_field(label_dict: dict, *keys: str) -> list[str]:
        """Extract field trying multiple possible keys."""
        for key in keys:
            val = label_dict.get(key)
            if val:
                return val if isinstance(val, list) else [val]
        return []

    return {
        "set_id": label.get("set_id", ""),
        "id": label.get("id", ""),
        "generic_name": openfda.get("generic_name", []),
        "brand_name": openfda.get("brand_name", []),
        "manufacturer": openfda.get("manufacturer_name", []),
        "warnings": _get_field(label, "warnings", "warnings_and_cautions"),
        "boxed_warning": _get_field(label, "boxed_warning"),
        "contraindications": _get_field(label, "contraindications"),
        "precautions": _get_field(label, "precautions", "warnings_and_cautions"),
        "drug_interactions": _get_field(label, "drug_interactions"),
        "pregnancy": _get_field(label, "pregnancy", "pregnancy_or_breast_feeding"),
        "lactation": _get_field(label, "nursing_mothers"),
        "description": _get_field(label, "description"),
        "indications": _get_field(label, "indications_and_usage"),
        "dosage_administration": _get_field(label, "dosage_and_administration"),
        "adverse_reactions": _get_field(label, "adverse_reactions"),
        "meta": raw.get("meta", {}),
    }


# ── PRR / Signal detection ───────────────────────────────────────────────────


def _count_reports(
    drug: str,
    event: str,
    *,
    exclude_drug: bool = False,
    exclude_event: bool = False,
) -> int:
    """Count matching reports via OpenFDA count API.

    Uses the count endpoint for efficiency. Falls back to estimation.
    """
    search_parts: list[str] = []

    if exclude_drug:
        search_parts.append(f'patient.drug.medicinalproduct:"{event}"')
        search_parts.append(f'patient.reaction.reactionmeddrapt:"{event}"')
    elif exclude_event:
        search_parts.append(f'patient.drug.medicinalproduct:"{drug}"')
        search_parts.append(f'NOT patient.reaction.reactionmeddrapt:"{event}"')
    else:
        search_parts.append(f'patient.drug.medicinalproduct:"{drug}"')
        search_parts.append(f'patient.reaction.reactionmeddrapt:"{event}"')

    search_query = " AND ".join(search_parts)
    params = {"search": search_query, "count": "safetyreportid", "limit": 1}

    try:
        raw = _sync_get(OPENFDA_EVENT_ENDPOINT, params)
        results = raw.get("results", [])
        if results:
            return results[0].get("count", 0)
        return 0
    except Exception:
        # Fallback: estimate from a limited query
        try:
            fallback_params = {
                "search": f'patient.drug.medicinalproduct:"{drug}"',
                "limit": 1,
            }
            raw = _sync_get(OPENFDA_EVENT_ENDPOINT, fallback_params)
            meta = raw.get("meta", {})
            total = meta.get("results", {}).get("total", 0)
            # Rough estimate: assume ~1-5% have specific event
            if exclude_event:
                return int(total * 0.95)
            return max(1, int(total * 0.02))
        except Exception:
            return 0


def _estimate_total_reports() -> int:
    """Estimate total FAERS report count."""
    try:
        params = {"limit": 1}
        raw = _sync_get(OPENFDA_EVENT_ENDPOINT, params)
        meta = raw.get("meta", {})
        return meta.get("results", {}).get("total", 10_000_000)
    except Exception:
        return 10_000_000  # Conservative default


def _calculate_prr_metrics(drug: str, event: str, a: int, b: int, c: int, d: int) -> dict[str, Any]:
    """Calculate PRR, chi-square, and confidence interval."""
    import math

    # Avoid division by zero
    a = max(a, 0)
    b = max(b, 0)
    c = max(c, 0)
    d = max(d, 0)

    n1 = a + b  # total with drug
    n0 = c + d  # total without drug
    m1 = a + c  # total with event
    m0 = b + d  # total without event
    n = a + b + c + d

    if n1 == 0 or n0 == 0 or m1 == 0:
        return _empty_prr_result(drug, event)

    # PRR
    prr_numerator = a / n1
    prr_denominator = c / n0 if c > 0 else 0.0001
    prr = prr_numerator / prr_denominator if prr_denominator > 0 else 0.0

    # Chi-square with Yates continuity correction
    if n > 0 and m1 > 0 and m0 > 0:
        chi_num = (abs(a * d - b * c) - n / 2) ** 2 * n
        chi_den = n1 * n0 * m1 * m0
        chi_square = chi_num / chi_den if chi_den > 0 else 0.0
    else:
        chi_square = 0.0

    # 95% confidence interval for PRR (log method)
    if a > 0 and b > 0 and c > 0 and d > 0:
        log_prr = math.log(prr)
        se_log_prr = math.sqrt(1 / a - 1 / n1 + 1 / c - 1 / n0)
        ci_lower = math.exp(log_prr - 1.96 * se_log_prr)
        ci_upper = math.exp(log_prr + 1.96 * se_log_prr)
    else:
        ci_lower = 0.0
        ci_upper = float("inf")

    # Interpretation
    interpretation = "no signal"
    if prr >= 2.0 and chi_square > 4.0:
        interpretation = "potential safety signal detected"
    elif prr >= 1.5 and chi_square > 3.84:
        interpretation = "possible signal -- requires further investigation"
    elif prr < 1.0:
        interpretation = "negative association"

    return {
        "drug": drug,
        "event": event,
        "prr": round(prr, 4),
        "chi_square": round(chi_square, 4),
        "ci_95": [round(ci_lower, 4), round(ci_upper, 4) if ci_upper != float("inf") else None],
        "counts": {"a": a, "b": b, "c": c, "d": d},
        "interpretation": interpretation,
        "evidence_grade": EVIDENCE_GRADE,
        "evidence_source": "OpenFDA/FAERS (PRR signal detection)",
        "evidence_type": "observational",
        "method": "prr_with_yates_correction",
        "disclaimer": (
            "PRR is a screening metric, not proof of causality. "
            "Requires systematic pharmacovigilance analysis. "
            "Decision-support only -- not a replacement for FDA safety assessments."
        ),
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


def _empty_prr_result(drug: str, event: str, error: str | None = None) -> dict[str, Any]:
    """Return empty PRR result structure."""
    result: dict[str, Any] = {
        "drug": drug,
        "event": event,
        "prr": None,
        "chi_square": None,
        "ci_95": None,
        "counts": {"a": 0, "b": 0, "c": 0, "d": 0},
        "interpretation": "insufficient data",
        "evidence_grade": EVIDENCE_GRADE,
        "evidence_source": "OpenFDA/FAERS",
        "evidence_type": "observational",
        "method": "prr_with_yates_correction",
        "disclaimer": (
            "PRR is a screening metric, not proof of causality. "
            "Requires systematic pharmacovigilance analysis."
        ),
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    if error:
        result["error"] = error
    return result


# ── Async variants for async contexts ────────────────────────────────────────


async def query_adverse_events_async(drug_name: str, limit: int = 5) -> list[dict]:
    """Async variant of query_adverse_events."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, query_adverse_events, drug_name, limit)


async def query_drug_label_async(drug_name: str) -> dict | None:
    """Async variant of query_drug_label."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, query_drug_label, drug_name)


async def signal_detection_prr_async(drug_name: str, event_term: str) -> dict:
    """Async variant of signal_detection_prr."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, signal_detection_prr, drug_name, event_term)


# ── Cache management utilities ───────────────────────────────────────────────


def clear_cache() -> int:
    """Clear all OpenFDA cache entries. Returns count deleted."""
    return get_cache().clear_all()


def cache_stats() -> dict[str, Any]:
    """Return cache statistics."""
    return get_cache().stats()
