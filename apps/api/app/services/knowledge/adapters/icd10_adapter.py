"""ICD-10-CM Adapter — diagnosis coding.

Source: NIH Clinical Tables free public API.
Endpoint: https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search

The API returns a JSON array:
    [total, [codes], null, [[code, name], ...]]
We normalise each pair into the canonical diagnosis coding shape used by
the Category 8 router.

This adapter is decision-support only. Returned codes do NOT assert that a
patient has been diagnosed with the condition; they only describe the
code/term and provide context to clinicians and coders.
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

DEFAULT_BASE_URL = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search"
DEFAULT_TIMEOUT = 15
MAX_RETRIES = 2
DEFAULT_LIMIT = 25


class ICD10Adapter(DatabaseAdapter):
    """ICD-10-CM adapter against the NIH Clinical Tables free API."""

    _cache_ttl_seconds = 24 * 3600  # codes change rarely

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._base_url: str = self.config.get("base_url", DEFAULT_BASE_URL)
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", DEFAULT_TIMEOUT), connect=5
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._session: Optional[aiohttp.ClientSession] = None

    # ── identity ─────────────────────────────────────────────────────────────

    @property
    def source_name(self) -> str:
        return "ICD-10-CM"

    @property
    def source_version(self) -> str:
        return self.config.get("version", "2026")

    # ── lifecycle ────────────────────────────────────────────────────────────

    async def connect(self) -> bool:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-ICD10Adapter/1.0",
                },
            )
        # Public API has no auth and no /ping — connection success is just
        # session creation. Health is verified by health_check().
        self._connected = True
        return True

    async def disconnect(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._connected = False

    # ── fetch ────────────────────────────────────────────────────────────────

    async def fetch(self, query: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not self._connected:
            await self.connect()

        if isinstance(query, str):
            params = {"terms": query, "maxList": DEFAULT_LIMIT}
        else:
            term = query.get("terms") or query.get("term") or query.get("code") or ""
            params = {
                "terms": term,
                "sf": query.get("sf", "code,name"),
                "df": query.get("df", "code,name"),
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
        raise RuntimeError(f"ICD-10 request failed after {self._max_retries} attempts: {last_exc}")

    @staticmethod
    def _parse_clinical_tables(data: Any) -> List[Dict[str, Any]]:
        # Expected shape: [total, [codes], null, [[code, name], ...]]
        if not isinstance(data, list) or len(data) < 4:
            return []
        rows = data[3] or []
        out: List[Dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, list) or len(row) < 2:
                continue
            code, name = row[0], row[1]
            out.append({"_raw_code": str(code), "_raw_display": str(name)})
        return out

    # ── normalize ────────────────────────────────────────────────────────────

    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        normalised: List[Dict[str, Any]] = []
        for item in raw:
            code = item.get("_raw_code", "")
            display = item.get("_raw_display", "")
            if not code:
                continue
            normalised.append(
                {
                    "source": "ICD-10-CM",
                    "coding_system": "http://hl7.org/fhir/sid/icd-10-cm",
                    "code": code,
                    "display": display,
                    "synonyms": [],
                    "version": self.source_version,
                    "parents": [],
                    "children": [],
                    "crosswalks": [],
                }
            )
        return normalised

    # ── validate ─────────────────────────────────────────────────────────────

    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        validated: List[Dict[str, Any]] = []
        for r in records:
            r["_valid"] = bool(r.get("code")) and bool(r.get("display"))
            r["_confidence"] = self.get_confidence(r).value
            r["_provenance"] = self.get_provenance(r).to_dict()
            validated.append(r)
        return validated

    # ── governance ───────────────────────────────────────────────────────────

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=record.get("code", "unknown"),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="Public Domain (US Government)",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.EXPERT_OPINION,
            attribution_text="ICD-10-CM is published by the US Centers for Disease Control and Prevention (CDC).",
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Public Domain (US Government)",
            license_url="https://www.cdc.gov/nchs/icd/icd-10-cm.htm",
            attribution_text="ICD-10-CM, US CDC / NCHS.",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            redistribution_allowed=True,
            modification_allowed=False,
            restrictions=[
                "ICD-10-CM coverage decisions are jurisdiction- and payer-specific; "
                "consult local guidance before claiming eligibility or reimbursement.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        return ConfidenceTier.HIGH if record.get("code") else ConfidenceTier.UNKNOWN

    # ── health ───────────────────────────────────────────────────────────────

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
            await self._request({"terms": "F33", "maxList": 1})
            latency = (loop.time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "base_url": self._base_url,
            }
        except Exception as exc:  # noqa: BLE001 — health probe must never raise
            latency = (loop.time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "error": str(exc),
            }
