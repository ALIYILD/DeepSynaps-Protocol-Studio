"""UMLS Adapter — Unified Medical Language System (license-gated).

Source: NLM UTS REST API. Endpoint: https://uts-ws.nlm.nih.gov/rest/

UMLS access requires a UMLS Terminology Services (UTS) account and API key.
Without an API key this adapter remains in a DEGRADED state — connect() and
fetch() return empty results, and health_check() reports the missing license
explicitly so operators can tell "we don't have credentials" from "the
upstream is down."

Adapter config keys (optional):
    - api_key: UTS API key (env: UMLS_API_KEY).
    - base_url: override REST root (default https://uts-ws.nlm.nih.gov/rest).
    - version: UMLS release version (default "current").

The adapter never asserts a diagnosis. UMLS CUIs are concept identifiers
used to cross-walk between coding systems; downstream consumers must still
apply clinical judgement.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

import aiohttp
from aiohttp import ClientResponseError, ClientTimeout

from ..base_adapter import (
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    LicenseMetadata,
    ProvenanceRecord,
)

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://uts-ws.nlm.nih.gov/rest"
DEFAULT_TIMEOUT = 20
MAX_RETRIES = 2
DEFAULT_LIMIT = 25
API_KEY_ENV = "UMLS_API_KEY"


class UMLSAdapter(DatabaseAdapter):
    """UMLS adapter — degraded by default unless ``UMLS_API_KEY`` is set."""

    _cache_ttl_seconds = 24 * 3600

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._api_key: Optional[str] = self.config.get("api_key") or os.environ.get(
            API_KEY_ENV
        )
        self._base_url: str = self.config.get("base_url", DEFAULT_BASE_URL).rstrip("/")
        self._version: str = self.config.get("version", "current")
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", DEFAULT_TIMEOUT), connect=5
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._session: Optional[aiohttp.ClientSession] = None

    @property
    def source_name(self) -> str:
        return "UMLS"

    @property
    def source_version(self) -> str:
        return self._version

    @property
    def has_credentials(self) -> bool:
        return bool(self._api_key)

    async def connect(self) -> bool:
        if not self.has_credentials:
            logger.info(
                "UMLSAdapter: no API key configured — adapter will report degraded."
            )
            self._connected = False
            return False
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-UMLSAdapter/1.0",
                },
            )
        self._connected = True
        return True

    async def disconnect(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._connected = False

    async def fetch(self, query: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not self.has_credentials:
            # Silent degraded behaviour: empty result, never raise.
            return []
        if not self._connected:
            await self.connect()
            if not self._connected:
                return []

        if isinstance(query, str):
            term = query
            limit = DEFAULT_LIMIT
        else:
            term = query.get("string") or query.get("term") or query.get("terms") or ""
            limit = int(query.get("limit", DEFAULT_LIMIT))
        if not term:
            return []

        params = {
            "string": term,
            "pageSize": limit,
            "apiKey": self._api_key,
        }
        cache_key = self._get_cache_path({"q": term, "limit": limit})
        if self._is_cache_valid(cache_key):
            cached = self._read_cache(cache_key)
            if cached is not None:
                return cached

        url = f"{self._base_url}/search/{self._version}"
        data = await self._request(url, params)
        records = self._parse_search(data)
        self._write_cache(cache_key, records)
        return records

    async def _request(self, url: str, params: Dict[str, Any]) -> Any:
        assert self._session is not None
        last_exc: Optional[Exception] = None
        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._session.get(
                    url, params=params, raise_for_status=True
                ) as resp:
                    return await resp.json(content_type=None)
            except ClientResponseError as exc:
                last_exc = exc
                if 500 <= exc.status < 600:
                    await asyncio.sleep(0.5 * attempt)
                    continue
                raise
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exc = exc
                await asyncio.sleep(0.5 * attempt)
        raise RuntimeError(
            f"UMLS request failed after {self._max_retries} attempts: {last_exc}"
        )

    @staticmethod
    def _parse_search(data: Any) -> List[Dict[str, Any]]:
        if not isinstance(data, dict):
            return []
        results = (data.get("result") or {}).get("results") or []
        out: List[Dict[str, Any]] = []
        for item in results:
            if not isinstance(item, dict):
                continue
            cui = item.get("ui") or item.get("CUI") or ""
            name = item.get("name") or ""
            root_source = item.get("rootSource") or "MTH"
            if not cui or cui == "NONE":
                continue
            out.append(
                {
                    "_raw_code": cui,
                    "_raw_display": name,
                    "_raw_source": root_source,
                }
            )
        return out

    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for item in raw:
            code = item.get("_raw_code", "")
            if not code:
                continue
            out.append(
                {
                    "source": "UMLS",
                    "coding_system": "https://www.nlm.nih.gov/research/umls/",
                    "code": code,
                    "display": item.get("_raw_display", ""),
                    "synonyms": [],
                    "version": self.source_version,
                    "parents": [],
                    "children": [],
                    "crosswalks": [],
                    "root_source": item.get("_raw_source", ""),
                }
            )
        return out

    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        validated: List[Dict[str, Any]] = []
        for r in records:
            r["_valid"] = bool(r.get("code"))
            r["_confidence"] = self.get_confidence(r).value
            r["_provenance"] = self.get_provenance(r).to_dict()
            validated.append(r)
        return validated

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=record.get("code", "unknown"),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="UMLS Metathesaurus License (UTS)",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.EXPERT_OPINION,
            attribution_text="UMLS is licensed by the US National Library of Medicine via UTS.",
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="UMLS Metathesaurus License (UTS)",
            license_url="https://uts.nlm.nih.gov/uts/signup-login",
            attribution_text="UMLS Metathesaurus, U.S. National Library of Medicine.",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            redistribution_allowed=False,
            modification_allowed=False,
            restrictions=[
                "Requires a UMLS Terminology Services (UTS) account and API key.",
                "Source-specific restrictions inside UMLS vary by vocabulary (e.g., SNOMED CT, MedDRA).",
                "Annual license renewal and usage reporting may be required.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        return ConfidenceTier.HIGH if record.get("code") else ConfidenceTier.UNKNOWN

    async def health_check(self) -> Dict[str, Any]:
        if not self.has_credentials:
            return {
                "status": "degraded",
                "latency_ms": None,
                "source": self.source_name,
                "error": "missing_license",
                "license_required": True,
                "missing_env": API_KEY_ENV,
                "message": (
                    "UMLS adapter requires a UTS API key. "
                    "Set the UMLS_API_KEY environment variable to enable."
                ),
            }
        if not self._session or self._session.closed:
            return {
                "status": "down",
                "latency_ms": None,
                "source": self.source_name,
                "error": "session_closed",
            }
        loop = asyncio.get_event_loop()
        start = loop.time()
        try:
            await self._request(
                f"{self._base_url}/search/{self._version}",
                {"string": "depression", "pageSize": 1, "apiKey": self._api_key},
            )
            latency = (loop.time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "base_url": self._base_url,
            }
        except Exception as exc:  # noqa: BLE001
            latency = (loop.time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "error": str(exc),
            }
