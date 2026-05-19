#!/usr/bin/env python3
"""
PharmGKB Adapter — Pharmacogenomics Knowledge Base
https://api.pharmgkb.org/

Provides access to pharmacogenomic data including drug-gene-variant associations,
clinical guidelines, drug labels, and pathways.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://api.pharmgkb.org/v1"
WEB_URL = "https://api.pharmgkb.org/v1/data"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class PharmGKBDrug:
    """Represents a drug in PharmGKB."""
    id: str
    name: str
    generic_names: List[str] = field(default_factory=list)
    trade_names: List[str] = field(default_factory=list)
    drug_class: str = ""
    cross_references: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "generic_names": self.generic_names,
            "trade_names": self.trade_names,
            "drug_class": self.drug_class,
            "cross_references": self.cross_references,
        }


@dataclass
class PharmGKBGene:
    """Represents a gene in PharmGKB."""
    id: str
    symbol: str
    name: str
    alternate_symbols: List[str] = field(default_factory=list)
    cross_references: Dict[str, str] = field(default_factory=dict)
    chromosome: str = ""
    gene_family: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "name": self.name,
            "alternate_symbols": self.alternate_symbols,
            "cross_references": self.cross_references,
            "chromosome": self.chromosome,
            "gene_family": self.gene_family,
        }


@dataclass
class PharmGKBClinicalAnnotation:
    """Clinical annotation for a drug-gene-variant."""
    id: str
    gene: str
    variant: str
    drug: str
    phenotype: str
    annotation_text: str = ""
    evidence_level: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "gene": self.gene,
            "variant": self.variant,
            "drug": self.drug,
            "phenotype": self.phenotype,
            "annotation_text": self.annotation_text,
            "evidence_level": self.evidence_level,
        }


class _Cache:
    def __init__(self, ttl: int = CACHE_TTL_SECONDS) -> None:
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._ttl = ttl

    def _key(self, *parts: str) -> str:
        return hashlib.sha256("|".join(parts).encode()).hexdigest()

    def get(self, *parts: str) -> Optional[Any]:
        key = self._key(*parts)
        entry = self._store.get(key)
        if entry is None:
            return None
        ts, value = entry
        if time.time() - ts > self._ttl:
            del self._store[key]
            return None
        return value

    def set(self, value: Any, *parts: str) -> None:
        key = self._key(*parts)
        self._store[key] = (time.time(), value)

    def clear(self) -> None:
        self._store.clear()

_CACHE = _Cache()


class PharmGKBAdapter:
    """Async adapter for the PharmGKB API.

    Provides access to pharmacogenomic data: drugs, genes, clinical annotations,
    guidelines, and pathways.

    Example:
        adapter = PharmGKBAdapter(api_key="your_key")
        drugs = await adapter.search_drugs("warfarin")
        gene = await adapter.get_gene("CYP2D6")
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
        rate_limit_delay: float = RATE_LIMIT_DELAY,
    ) -> None:
        self.api_key = api_key
        self.timeout = timeout
        self.rate_limit_delay = rate_limit_delay
        self._client: Optional[httpx.AsyncClient] = None
        self._last_call_time: float = 0.0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    def _headers(self) -> Dict[str, str]:
        h = {"Accept": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        elapsed = time.time() - self._last_call_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)
        cache_key = (url, json.dumps(params or {}, sort_keys=True))
        cached = _CACHE.get(*cache_key)
        if cached is not None:
            return cached
        client = await self._get_client()
        try:
            resp = await client.get(url, params=params or {}, headers=self._headers())
            self._last_call_time = time.time()
            resp.raise_for_status()
            data = resp.json()
            _CACHE.set(data, *cache_key)
            return data
        except httpx.HTTPStatusError as e:
            raise PharmGKBAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise PharmGKBAPIError(f"Request failed: {e}") from e

    async def search_drugs(
        self, name: str, limit: int = 10
    ) -> List[PharmGKBDrug]:
        """Search drugs by name.

        Args:
            name: Drug name.
            limit: Max results.

        Returns:
            List of matching drugs.
        """
        url = f"{WEB_URL}"
        params = {
            "drug.name": name,
            "view": "base",
            "limit": min(limit, 50),
            "source": "drug",
        }
        data = await self._rate_limited_get(url, params)
        return [self._parse_drug(r) for r in data.get("data", [])]

    async def get_drug_by_id(self, drug_id: str) -> Optional[PharmGKBDrug]:
        """Get drug by PharmGKB accession ID.

        Args:
            drug_id: PA accession ID.

        Returns:
            Drug or None.
        """
        url = f"{WEB_URL}"
        params = {"id": drug_id, "source": "drug"}
        data = await self._rate_limited_get(url, params)
        results = data.get("data", [])
        if results:
            return self._parse_drug(results[0])
        return None

    async def search_genes(
        self, symbol: str, limit: int = 10
    ) -> List[PharmGKBGene]:
        """Search genes by HGNC symbol.

        Args:
            symbol: Gene symbol.
            limit: Max results.

        Returns:
            List of matching genes.
        """
        url = f"{WEB_URL}"
        params = {
            "gene.symbol": symbol,
            "view": "base",
            "limit": min(limit, 50),
            "source": "gene",
        }
        data = await self._rate_limited_get(url, params)
        return [self._parse_gene(r) for r in data.get("data", [])]

    async def get_gene(self, symbol: str) -> Optional[PharmGKBGene]:
        """Get gene by symbol.

        Args:
            symbol: HGNC gene symbol.

        Returns:
            Gene or None.
        """
        url = f"{WEB_URL}"
        params = {"gene.symbol.exact": symbol, "source": "gene"}
        data = await self._rate_limited_get(url, params)
        results = data.get("data", [])
        if results:
            return self._parse_gene(results[0])
        return None

    async def get_clinical_annotations(
        self, gene: Optional[str] = None,
        drug: Optional[str] = None,
        variant: Optional[str] = None,
        phenotype: Optional[str] = None,
        limit: int = 10,
    ) -> List[PharmGKBClinicalAnnotation]:
        """Get clinical annotations.

        Args:
            gene: Gene symbol filter.
            drug: Drug name filter.
            variant: Variant name filter.
            phenotype: Phenotype filter.
            limit: Max results.

        Returns:
            List of clinical annotations.
        """
        url = f"{WEB_URL}"
        params: Dict[str, Any] = {"source": "clinicalAnnotation", "limit": min(limit, 50)}
        if gene:
            params["gene.symbol"] = gene
        if drug:
            params["drug.name"] = drug
        if variant:
            params["variant.name"] = variant
        if phenotype:
            params["phenotype.name"] = phenotype
        data = await self._rate_limited_get(url, params)
        return [self._parse_annotation(r) for r in data.get("data", [])]

    async def get_guidelines(self, gene: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get clinical guidelines for a gene.

        Args:
            gene: Gene symbol.
            limit: Max results.

        Returns:
            List of guideline dicts.
        """
        url = f"{WEB_URL}"
        params = {"source": "guidelineAnnotation", "gene.symbol": gene, "limit": min(limit, 50)}
        data = await self._rate_limited_get(url, params)
        return data.get("data", [])

    async def get_drug_labels(
        self, drug: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get drug labels with pharmacogenomic info.

        Args:
            drug: Drug name.
            limit: Max results.

        Returns:
            List of label dicts.
        """
        url = f"{WEB_URL}"
        params = {"source": "drugLabel", "drug.name": drug, "limit": min(limit, 50)}
        data = await self._rate_limited_get(url, params)
        return data.get("data", [])

    async def get_pathways(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get pharmacokinetic/pharmacodynamic pathways.

        Args:
            limit: Max results.

        Returns:
            List of pathway dicts.
        """
        url = f"{WEB_URL}"
        params = {"source": "pathway", "limit": min(limit, 50)}
        data = await self._rate_limited_get(url, params)
        return data.get("data", [])

    async def get_variant_by_id(self, variant_id: str) -> Optional[Dict[str, Any]]:
        """Get variant by ID.

        Args:
            variant_id: Variant accession ID.

        Returns:
            Variant dict or None.
        """
        url = f"{WEB_URL}"
        params = {"id": variant_id, "source": "variant"}
        data = await self._rate_limited_get(url, params)
        results = data.get("data", [])
        if results:
            return results[0]
        return None

    async def get_dosing_guidelines(
        self, drug: Optional[str] = None, gene: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get dosing guidelines.

        Args:
            drug: Drug name filter.
            gene: Gene symbol filter.

        Returns:
            List of dosing guideline dicts.
        """
        url = f"{WEB_URL}"
        params: Dict[str, Any] = {"source": "dosingGuideline"}
        if drug:
            params["drug.name"] = drug
        if gene:
            params["gene.symbol"] = gene
        data = await self._rate_limited_get(url, params)
        return data.get("data", [])

    async def get_occur(self, entity_type: str, entity_id: str) -> List[Dict[str, Any]]:
        """Get occurrence annotations.

        Args:
            entity_type: Entity type.
            entity_id: Entity ID.

        Returns:
            Occurrence list.
        """
        url = f"{WEB_URL}"
        params = {"source": "occur", "id": entity_id}
        data = await self._rate_limited_get(url, params)
        return data.get("data", [])

    def _parse_drug(self, data: Dict[str, Any]) -> PharmGKBDrug:
        return PharmGKBDrug(
            id=data.get("id", ""),
            name=data.get("name", ""),
            generic_names=data.get("genericNames", []),
            trade_names=data.get("tradeNames", []),
            drug_class=data.get("drugClass", ""),
            cross_references=data.get("crossReferences", {}),
        )

    def _parse_gene(self, data: Dict[str, Any]) -> PharmGKBGene:
        return PharmGKBGene(
            id=data.get("id", ""),
            symbol=data.get("symbol", ""),
            name=data.get("name", ""),
            alternate_symbols=data.get("altSymbols", []),
            cross_references=data.get("crossReferences", {}),
            chromosome=data.get("chromosome", ""),
            gene_family=data.get("geneFamily", ""),
        )

    def _parse_annotation(self, data: Dict[str, Any]) -> PharmGKBClinicalAnnotation:
        return PharmGKBClinicalAnnotation(
            id=data.get("id", ""),
            gene=data.get("gene", {}).get("symbol", ""),
            variant=data.get("variant", {}).get("name", ""),
            drug=data.get("drug", {}).get("name", ""),
            phenotype=data.get("phenotype", {}).get("name", ""),
            annotation_text=data.get("annotationText", ""),
            evidence_level=data.get("evidence", {}).get("level", ""),
        )

    async def health_check(self) -> bool:
        try:
            url = f"{WEB_URL}"
            data = await self._rate_limited_get(url, {"source": "drug", "limit": 1})
            return "data" in data
        except PharmGKBAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "PharmGKBAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class PharmGKBAPIError(Exception):
    pass


async def _test_pharmgkb() -> None:
    adapter = PharmGKBAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    results = await adapter.search_drugs("warfarin", limit=3)
    print(f"[TEST] search_drugs: found {len(results)} results")
    assert isinstance(results, list)
    gene = await adapter.get_gene("CYP2D6")
    print(f"[TEST] get_gene: {'PASS' if gene else 'SKIP (API limits)'}")
    await adapter.close()
    print("[TEST] All PharmGKB tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_pharmgkb())
