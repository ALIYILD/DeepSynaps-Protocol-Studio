"""SNOMED CT Adapter — clinical terminology (license-gated, degraded by default).

There is no free unauthenticated public SNOMED CT browse API. The
SNOMED International Snowstorm public browser refuses anonymous traffic,
and the original Category 8 spec's NIH Clinical Tables path
(``/api/snomed/v3/search``) does not exist (404). The closest NIH endpoint
returns *Clinical-Tables internal IDs*, not real SNOMED CT concept IDs;
emitting those as SNOMED-coded would be dishonest under the safety
contract.

So this adapter is **degraded by default**. To enable SNOMED CT lookups:

  1. Stand up a licensed Snowstorm instance (or get an authorised endpoint
     from your national release centre — e.g., UK Term Browser, US NLM via
     UMLS, etc.).
  2. Point this adapter at it via the ``SNOMEDCT_SNOWSTORM_URL`` env var or
     ``config["base_url"]``; optionally set ``SNOMEDCT_BRANCH`` (default
     ``MAIN``) and ``SNOMEDCT_AUTH_TOKEN``.

When unconfigured, ``health_check`` and ``fetch`` degrade silently with a
"license_required" message — distinct from "down" so operators can tell
"we don't have a server" from "the server is offline".
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

DEFAULT_TIMEOUT = 15
MAX_RETRIES = 2
DEFAULT_LIMIT = 25
DEFAULT_BRANCH = "MAIN"
ENDPOINT_ENV = "SNOMEDCT_SNOWSTORM_URL"
BRANCH_ENV = "SNOMEDCT_BRANCH"
AUTH_ENV = "SNOMEDCT_AUTH_TOKEN"


class SNOMEDCTAdapter(DatabaseAdapter):
    """SNOMED CT adapter — degraded unless a licensed Snowstorm URL is set."""

    _cache_ttl_seconds = 24 * 3600

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._base_url: Optional[str] = (
            self.config.get("base_url") or os.environ.get(ENDPOINT_ENV) or None
        )
        if self._base_url:
            self._base_url = self._base_url.rstrip("/")
        self._branch: str = (
            self.config.get("branch") or os.environ.get(BRANCH_ENV) or DEFAULT_BRANCH
        )
        self._auth_token: Optional[str] = (
            self.config.get("auth_token") or os.environ.get(AUTH_ENV)
        )
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
        return self.config.get("version", f"Snowstorm / {self._branch}")

    @property
    def has_credentials(self) -> bool:
        return bool(self._base_url)

    async def connect(self) -> bool:
        if not self.has_credentials:
            logger.info(
                "SNOMEDCTAdapter: no Snowstorm URL configured — adapter will report degraded."
            )
            self._connected = False
            return False
        if self._session is None or self._session.closed:
            headers: Dict[str, str] = {
                "Accept": "application/json",
                "User-Agent": "DeepSynaps-SNOMEDCTAdapter/2.0",
            }
            if self._auth_token:
                headers["Authorization"] = f"Bearer {self._auth_token}"
            self._session = aiohttp.ClientSession(timeout=self._timeout, headers=headers)
        self._connected = True
        return True

    async def disconnect(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._connected = False

    async def fetch(self, query: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not self.has_credentials:
            # Silent degraded behaviour — empty result, never raise. The
            # service-layer surfaces a "license_required" warning.
            return []
        if not self._connected:
            await self.connect()
            if not self._connected:
                return []

        if isinstance(query, str):
            term = query
            limit = DEFAULT_LIMIT
        else:
            term = query.get("term") or query.get("terms") or query.get("code") or ""
            limit = int(query.get("limit", DEFAULT_LIMIT))
        if not term:
            return []

        params = {
            "term": term,
            "activeFilter": "true",
            "limit": limit,
        }
        cache_key = self._get_cache_path({"term": term, "limit": limit, "branch": self._branch})
        if self._is_cache_valid(cache_key):
            cached = self._read_cache(cache_key)
            if cached is not None:
                return cached

        url = f"{self._base_url}/snomed-ct/{self._branch}/concepts"
        data = await self._request(url, params)
        records = self._parse_snowstorm(data)
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
            f"SNOMED CT request failed after {self._max_retries} attempts: {last_exc}"
        )

    @staticmethod
    def _parse_snowstorm(data: Any) -> List[Dict[str, Any]]:
        # Snowstorm shape: {"items":[{"conceptId":"...","fsn":{"term":"..."},"pt":{"term":"..."}}, ...], ...}
        if not isinstance(data, dict):
            return []
        items = data.get("items") or []
        out: List[Dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            concept_id = str(item.get("conceptId") or "")
            if not concept_id:
                continue
            pt = item.get("pt") or {}
            fsn = item.get("fsn") or {}
            display = pt.get("term") or fsn.get("term") or ""
            out.append(
                {
                    "_raw_code": concept_id,
                    "_raw_display": display,
                    "_raw_fsn": fsn.get("term", ""),
                    "_raw_active": item.get("active", True),
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
                    "source": "SNOMED CT",
                    "coding_system": "http://snomed.info/sct",
                    "code": code,
                    "display": item.get("_raw_display", ""),
                    "synonyms": [],
                    "version": self.source_version,
                    "parents": [],
                    "children": [],
                    "crosswalks": [],
                    "fsn": item.get("_raw_fsn", ""),
                    "active": item.get("_raw_active", True),
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
                "There is no free unauthenticated SNOMED CT browse API — a licensed Snowstorm endpoint is required.",
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
                "missing_env": ENDPOINT_ENV,
                "message": (
                    "SNOMED CT adapter requires a licensed Snowstorm endpoint. "
                    f"Set {ENDPOINT_ENV} (and optionally {BRANCH_ENV}, {AUTH_ENV}) "
                    "to enable. There is no free unauthenticated public SNOMED CT API."
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
            url = f"{self._base_url}/snomed-ct/{self._branch}/concepts"
            await self._request(url, {"term": "depression", "activeFilter": "true", "limit": 1})
            latency = (loop.time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "base_url": self._base_url,
                "branch": self._branch,
            }
        except Exception as exc:  # noqa: BLE001
            latency = (loop.time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "error": str(exc),
            }
