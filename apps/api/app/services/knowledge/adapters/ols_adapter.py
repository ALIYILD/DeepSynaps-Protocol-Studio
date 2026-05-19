"""OLS Adapter — EBI Ontology Lookup Service for semantic interoperability.

Source: EBI OLS4. Endpoint: https://www.ebi.ac.uk/ols4/api/search

OLS aggregates biomedical ontologies (HPO, DOID, MONDO, EFO, etc.). This
adapter is for cross-ontology lookup — not for diagnosis assertion.

OLS data is licensed under the terms of each underlying ontology (most are
CC-BY 4.0). Callers should not redistribute results without surfacing the
ontology-specific license on each record.
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

DEFAULT_BASE_URL = "https://www.ebi.ac.uk/ols4/api"
DEFAULT_TIMEOUT = 15
MAX_RETRIES = 2
DEFAULT_LIMIT = 25


class OLSAdapter(DatabaseAdapter):
    _cache_ttl_seconds = 24 * 3600

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
        return "OLS"

    @property
    def source_version(self) -> str:
        return self.config.get("version", "ols4")

    async def connect(self) -> bool:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-OLSAdapter/1.0",
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
            term = query
            limit = DEFAULT_LIMIT
            ontology = None
        else:
            term = query.get("q") or query.get("term") or query.get("terms") or ""
            limit = int(query.get("limit", DEFAULT_LIMIT))
            ontology = query.get("ontology")
        if not term:
            return []

        params: Dict[str, Any] = {"q": term, "rows": limit}
        if ontology:
            params["ontology"] = ontology

        cache_key = self._get_cache_path(params)
        if self._is_cache_valid(cache_key):
            cached = self._read_cache(cache_key)
            if cached is not None:
                return cached

        url = f"{self._base_url}/search"
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
            f"OLS request failed after {self._max_retries} attempts: {last_exc}"
        )

    @staticmethod
    def _parse_search(data: Any) -> List[Dict[str, Any]]:
        if not isinstance(data, dict):
            return []
        docs = (data.get("response") or {}).get("docs") or []
        out: List[Dict[str, Any]] = []
        for doc in docs:
            if not isinstance(doc, dict):
                continue
            iri = doc.get("iri") or doc.get("obo_id") or ""
            obo_id = doc.get("obo_id") or doc.get("short_form") or iri.rsplit("/", 1)[-1]
            label = doc.get("label") or ""
            ontology = doc.get("ontology_name") or doc.get("ontology_prefix") or ""
            synonyms = doc.get("synonym") or doc.get("synonyms") or []
            if not obo_id and not label:
                continue
            out.append(
                {
                    "_raw_code": obo_id,
                    "_raw_display": label,
                    "_raw_uri": iri,
                    "_raw_ontology": ontology,
                    "_raw_synonyms": synonyms if isinstance(synonyms, list) else [],
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
                    "source": "OLS",
                    "coding_system": f"https://www.ebi.ac.uk/ols4/ontologies/{item.get('_raw_ontology', '')}".rstrip("/"),
                    "code": code,
                    "display": item.get("_raw_display", ""),
                    "synonyms": item.get("_raw_synonyms", []),
                    "version": self.source_version,
                    "parents": [],
                    "children": [],
                    "crosswalks": [],
                    "uri": item.get("_raw_uri", ""),
                    "ontology": item.get("_raw_ontology", ""),
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
            license_type="Per-ontology (typically CC-BY 4.0)",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.EXPERT_OPINION,
            attribution_text="Ontology Lookup Service, EMBL-EBI.",
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Per-ontology (varies)",
            license_url="https://www.ebi.ac.uk/ols4",
            attribution_text="EBI Ontology Lookup Service (OLS4).",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=True,
            redistribution_allowed=True,
            modification_allowed=False,
            restrictions=[
                "Each underlying ontology has its own license — check before redistribution.",
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
                f"{self._base_url}/search", {"q": "depression", "rows": 1}
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
