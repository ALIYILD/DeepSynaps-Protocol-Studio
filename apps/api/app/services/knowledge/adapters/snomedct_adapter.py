"""SNOMED CT Adapter — clinical terminology (decision-support only).

Source: NIH Clinical Tables free public API.
Endpoint: https://clinicaltables.nlm.nih.gov/api/snomed/v3/search

Returns: [total, [codes], null, [[concept_id, term], ...]]

This adapter does NOT assert that a patient has a SNOMED-coded condition. It
exposes the standard concept identifiers and preferred terms so the rest of
the system can do clinician-driven mapping.

SNOMED CT is licensed by SNOMED International. Affiliate licenses are
generally free for member-country research/clinical use but commercial
redistribution requires written permission.
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

DEFAULT_BASE_URL = "https://clinicaltables.nlm.nih.gov/api/snomed/v3/search"
DEFAULT_TIMEOUT = 15
MAX_RETRIES = 2
DEFAULT_LIMIT = 25


class SNOMEDCTAdapter(DatabaseAdapter):
    _cache_ttl_seconds = 24 * 3600

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._base_url: str = self.config.get("base_url", DEFAULT_BASE_URL)
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", DEFAULT_TIMEOUT), connect=5
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._session: Optional[aiohttp.ClientSession] = None

    @property
    def source_name(self) -> str:
        return "SNOMED CT"

    @property
    def source_version(self) -> str:
        return self.config.get("version", "US Edition / 2025")

    async def connect(self) -> bool:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-SNOMEDCTAdapter/1.0",
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
            params = {"terms": query, "maxList": DEFAULT_LIMIT}
        else:
            term = query.get("terms") or query.get("term") or query.get("code") or ""
            params = {
                "terms": term,
                "maxList": int(query.get("limit", DEFAULT_LIMIT)),
            }
        if not params.get("terms"):
            return []

        cache_key = self._get_cache_path(params)
        if self._is_cache_valid(cache_key):
            cached = self._read_cache(cache_key)
            if cached is not None:
                return cached

        data = await self._request(params)
        records = self._parse_clinical_tables(data)
        self._write_cache(cache_key, records)
        return records

    async def _request(self, params: Dict[str, Any]) -> Any:
        assert self._session is not None
        last_exc: Optional[Exception] = None
        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._session.get(
                    self._base_url, params=params, raise_for_status=True
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
            f"SNOMED CT request failed after {self._max_retries} attempts: {last_exc}"
        )

    @staticmethod
    def _parse_clinical_tables(data: Any) -> List[Dict[str, Any]]:
        if not isinstance(data, list) or len(data) < 4:
            return []
        rows = data[3] or []
        out: List[Dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, list) or len(row) < 2:
                continue
            concept_id, term = row[0], row[1]
            out.append({"_raw_code": str(concept_id), "_raw_display": str(term)})
        return out

    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for item in raw:
            code = item.get("_raw_code", "")
            if not code:
                continue
            out.append(
                {
                    "source": "SNOMED CT",
                    "coding_system": "http://snomed.info/sct",
                    "code": code,
                    "display": item.get("_raw_display", ""),
                    "synonyms": [],
                    "version": self.source_version,
                    "parents": [],
                    "children": [],
                    "crosswalks": [],
                }
            )
        return out

    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        validated: List[Dict[str, Any]] = []
        for r in records:
            r["_valid"] = bool(r.get("code")) and bool(r.get("display"))
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
            license_type="SNOMED International Affiliate License",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.EXPERT_OPINION,
            attribution_text="SNOMED CT is published by SNOMED International (IHTSDO).",
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="SNOMED International Affiliate License",
            license_url="https://www.snomed.org/get-snomed",
            attribution_text="SNOMED CT, SNOMED International (IHTSDO).",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            redistribution_allowed=False,
            modification_allowed=False,
            restrictions=[
                "Use is governed by SNOMED CT Affiliate License terms.",
                "Commercial deployment outside member-country territory may require a separate license.",
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
            await self._request({"terms": "depression", "maxList": 1})
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
