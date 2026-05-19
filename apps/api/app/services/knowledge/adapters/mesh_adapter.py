"""MeSH Adapter — Medical Subject Headings for literature search.

Source: NLM MeSH RDF lookup API.
Endpoint: https://id.nlm.nih.gov/mesh/lookup/term

This adapter does NOT diagnose patients; it returns MeSH descriptors and
their canonical IDs so the rest of the system can build literature search
expansions for PubMed / Europe PMC / Cochrane.

The lookup API is public, no API key required.
"""
from __future__ import annotations

import asyncio
import logging
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

DEFAULT_BASE_URL = "https://id.nlm.nih.gov/mesh"
DEFAULT_TIMEOUT = 15
MAX_RETRIES = 2
DEFAULT_LIMIT = 25


class MeSHAdapter(DatabaseAdapter):
    _cache_ttl_seconds = 7 * 24 * 3600  # vocabulary updates yearly

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._base_url: str = self.config.get("base_url", DEFAULT_BASE_URL).rstrip("/")
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", DEFAULT_TIMEOUT), connect=5
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._session: Optional[aiohttp.ClientSession] = None

    @property
    def source_name(self) -> str:
        return "MeSH"

    @property
    def source_version(self) -> str:
        return self.config.get("version", "2026")

    async def connect(self) -> bool:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-MeSHAdapter/1.0",
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
        if not self._connected:
            await self.connect()

        if isinstance(query, str):
            label = query
            limit = DEFAULT_LIMIT
            match = "contains"
        else:
            label = query.get("label") or query.get("term") or query.get("terms") or ""
            limit = int(query.get("limit", DEFAULT_LIMIT))
            match = query.get("match", "contains")
        if not label:
            return []

        params = {"label": label, "match": match, "limit": limit}
        cache_key = self._get_cache_path(params)
        if self._is_cache_valid(cache_key):
            cached = self._read_cache(cache_key)
            if cached is not None:
                return cached

        url = f"{self._base_url}/lookup/term"
        data = await self._request(url, params)
        records = self._parse_lookup(data)
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
            f"MeSH request failed after {self._max_retries} attempts: {last_exc}"
        )

    @staticmethod
    def _parse_lookup(data: Any) -> List[Dict[str, Any]]:
        # MeSH lookup returns: [{"resource": "http://id.nlm.nih.gov/mesh/D003863", "label": "Depression"}, ...]
        if not isinstance(data, list):
            return []
        out: List[Dict[str, Any]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            resource = item.get("resource") or ""
            descriptor_id = resource.rsplit("/", 1)[-1] if resource else ""
            label = item.get("label", "")
            if not descriptor_id and not label:
                continue
            out.append(
                {
                    "_raw_code": descriptor_id,
                    "_raw_display": label,
                    "_raw_uri": resource,
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
                    "source": "MeSH",
                    "coding_system": "https://www.nlm.nih.gov/mesh",
                    "code": code,
                    "display": item.get("_raw_display", ""),
                    "synonyms": [],
                    "version": self.source_version,
                    "parents": [],
                    "children": [],
                    "crosswalks": [],
                    "uri": item.get("_raw_uri", ""),
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
            license_type="Public Domain (US Government)",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.EXPERT_OPINION,
            attribution_text="MeSH is produced by the US National Library of Medicine.",
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Public Domain (US Government)",
            license_url="https://www.nlm.nih.gov/mesh/meshhome.html",
            attribution_text="MeSH, U.S. National Library of Medicine.",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            redistribution_allowed=True,
            modification_allowed=False,
            restrictions=[
                "MeSH descriptors are for literature indexing and semantic mapping; "
                "they are not diagnostic instruments.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        return ConfidenceTier.HIGH if record.get("code") else ConfidenceTier.UNKNOWN

    async def health_check(self) -> Dict[str, Any]:
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
                f"{self._base_url}/lookup/term",
                {"label": "depression", "match": "exact", "limit": 1},
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
