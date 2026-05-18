#!/usr/bin/env python3
"""
BaseAdapter – contract enforced by every Batch C adapter.

Provides:
- fetch()   : acquire raw data (HTTP GET, file download, or mock)
- transform(): convert raw → canonical dataclasses
- validate() : quality / schema checks
- save()     : persist to local cache
- run()      : full pipeline (fetch → transform → validate → save)

Subclasses must override:
- fetch_raw()
- transform()
- source_name
- confidence_tier
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import pickle
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, Generic, List, Optional, TypeVar

import requests

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger("batch_c")


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class AdapterError(Exception):
    """Base adapter failure."""


class FetchError(AdapterError):
    """Network or I/O failure during fetch."""


class TransformError(AdapterError):
    """Malformed raw data preventing transform."""


class ValidationError(AdapterError):
    """Canonical records fail quality checks."""


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

RawType = TypeVar("RawType")
CanonicalType = TypeVar("CanonicalType")


# ---------------------------------------------------------------------------
# BaseAdapter
# ---------------------------------------------------------------------------

class BaseAdapter(ABC, Generic[RawType, CanonicalType]):
    """Abstract base for all Batch C adapters."""

    # ── subclass-overridable class attributes ────────────────────────────
    source_name: str = "abstract"
    source_url: str = ""
    confidence_tier: str = "C"
    cache_subdir: str = ""          # e.g. "orange_book"
    cache_file_raw: str = "raw.pkl"
    cache_file_canonical: str = "canonical.json.gz"

    # ── init ─────────────────────────────────────────────────────────────
    def __init__(
        self,
        *,
        cache_dir: Optional[str] = None,
        timeout: int = 60,
        max_retries: int = 3,
        force_refresh: bool = False,
    ) -> None:
        self.timeout = timeout
        self.max_retries = max_retries
        self.force_refresh = force_refresh
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            )
        })

        if cache_dir:
            self.cache_dir = Path(cache_dir)
        else:
            self.cache_dir = Path.home() / ".cache" / "batch_c" / self.cache_subdir
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self._raw_cache_path = self.cache_dir / self.cache_file_raw
        self._canonical_cache_path = self.cache_dir / self.cache_file_canonical

    # ── public pipeline ──────────────────────────────────────────────────
    def run(self) -> Dict[str, Any]:
        """Full pipeline: fetch → transform → validate → save.

        Returns a summary dict suitable for logging / reporting.
        """
        logger.info("[%s] Starting pipeline …", self.source_name)
        raw = self.fetch()
        canonical = self.transform(raw)
        valid, report = self.validate(canonical)
        self.save(canonical, raw)
        summary = {
            "source": self.source_name,
            "url": self.source_url,
            "tier": self.confidence_tier,
            "raw_records": len(raw) if isinstance(raw, list) else 1,
            "canonical_records": len(canonical),
            "valid_records": sum(valid) if valid else 0,
            "validation_report": report,
            "cache_dir": str(self.cache_dir),
        }
        logger.info("[%s] Pipeline complete: %s", self.source_name, summary)
        return summary

    # ── abstract interface ───────────────────────────────────────────────
    @abstractmethod
    def fetch(self) -> RawType:
        """Acquire raw data.  Return type is adapter-specific.

        Implementations should:
        1. Check local cache first (unless *force_refresh*).
        2. Fall back to HTTP download / API call.
        3. Cache the raw payload locally.
        """
        ...

    @abstractmethod
    def transform(self, raw: RawType) -> List[CanonicalType]:
        """Convert raw payload into list of canonical records."""
        ...

    def validate(self, records: List[CanonicalType]) -> tuple[List[bool], Dict[str, Any]]:
        """Return (per-record pass/fail list, aggregate report dict)."""
        passed: List[bool] = []
        report: Dict[str, Any] = {"checked": len(records), "errors": []}
        for idx, rec in enumerate(records):
            ok, err = self._validate_one(rec)
            passed.append(ok)
            if not ok and err:
                report["errors"].append({"index": idx, "error": err})
        report["passed"] = sum(passed)
        report["failed"] = len(records) - sum(passed)
        return passed, report

    @abstractmethod
    def _validate_one(self, record: CanonicalType) -> tuple[bool, Optional[str]]:
        """Return (True, None) or (False, error_message)."""
        ...

    # ── persistence ──────────────────────────────────────────────────────
    def save(self, canonical: List[CanonicalType], raw: RawType) -> None:
        """Persist canonical records (JSON-Lines gzip) and raw (pickle)."""
        # raw – pickle for fidelity
        try:
            with open(self._raw_cache_path, "wb") as fh:
                pickle.dump(raw, fh, protocol=pickle.HIGHEST_PROTOCOL)
            logger.debug("[%s] Raw cache written → %s", self.source_name, self._raw_cache_path)
        except Exception as exc:
            logger.warning("[%s] Failed to write raw cache: %s", self.source_name, exc)

        # canonical – compressed JSON
        try:
            out_path = self._canonical_cache_path
            with gzip.open(out_path, "wt", encoding="utf-8") as fh:
                for rec in canonical:
                    fh.write(json.dumps(rec.to_dict(), default=str) + "\n")
            logger.debug("[%s] Canonical cache written → %s", self.source_name, out_path)
        except Exception as exc:
            logger.warning("[%s] Failed to write canonical cache: %s", self.source_name, exc)

    # ── HTTP helpers ─────────────────────────────────────────────────────
    def _http_get(self, url: str, *, stream: bool = False, **kwargs: Any) -> requests.Response:
        """Robust GET with retries and timeout."""
        last_exc: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self.session.get(url, timeout=self.timeout, stream=stream, **kwargs)
                resp.raise_for_status()
                return resp
            except requests.RequestException as exc:
                last_exc = exc
                logger.warning("[%s] GET %s attempt %d/%d failed: %s", self.source_name, url, attempt, self.max_retries, exc)
        raise FetchError(f"Failed to fetch {url} after {self.max_retries} attempts: {last_exc}")

    def _download_to_file(self, url: str, dest: Path, chunk_size: int = 8192) -> Path:
        """Stream-download *url* → *dest*.  Returns path."""
        logger.info("[%s] Downloading %s → %s", self.source_name, url, dest)
        try:
            with self._http_get(url, stream=True) as resp:
                with open(dest, "wb") as fh:
                    for chunk in resp.iter_content(chunk_size=chunk_size):
                        if chunk:
                            fh.write(chunk)
            logger.info("[%s] Download complete (%s bytes)", self.source_name, dest.stat().st_size)
            return dest
        except Exception as exc:
            raise FetchError(f"Download failed for {url}: {exc}") from exc

    def _load_raw_cache(self) -> Optional[RawType]:
        """Return cached raw data if present, else None."""
        if self.force_refresh:
            return None
        if self._raw_cache_path.exists():
            try:
                with open(self._raw_cache_path, "rb") as fh:
                    data = pickle.load(fh)
                logger.debug("[%s] Loaded raw cache (%d items)", self.source_name, len(data) if isinstance(data, list) else 1)
                return data
            except Exception as exc:
                logger.warning("[%s] Corrupt raw cache, will re-fetch: %s", self.source_name, exc)
        return None

    # ── util ─────────────────────────────────────────────────────────────
    def clear_cache(self) -> None:
        """Remove all cached files for this adapter."""
        for p in (self._raw_cache_path, self._canonical_cache_path):
            if p.exists():
                p.unlink()
                logger.info("[%s] Removed cache file %s", self.source_name, p)
