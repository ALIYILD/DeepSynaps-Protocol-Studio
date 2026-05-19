#!/usr/bin/env python3
"""
MyVariant Adapter — Human Variant Annotation API
https://myvariant.info/v1/

Provides comprehensive variant annotation data aggregated from multiple sources
including ClinVar, dbSNP, CADD, ExAC, gnomAD, and more.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://myvariant.info/v1"
DEFAULT_TIMEOUT = 45.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class MyVariantAnnotation:
    """Represents variant annotation from MyVariant."""
    variant_id: str
    query: str
    chrom: str = ""
    pos: int = 0
    ref: str = ""
    alt: str = ""
    rsid: str = ""
    gene_symbol: str = ""
    gene_id: str = ""
    consequence: str = ""
    clinvar_significance: str = ""
    clinvar_disease: str = ""
    cadd_phred: float = 0.0
    cadd_raw: float = 0.0
    gnomad_exome_af: float = 0.0
    gnomad_genome_af: float = 0.0
    exac_af: float = 0.0
    dbsnp_build: str = ""
    sift_score: float = 0.0
    polyphen_score: float = 0.0
    revel_score: float = 0.0
    mutation_taster: str = ""
    fathmm_score: float = 0.0
    eigen_pc_raw: float = 0.0
    primate_ai_score: float = 0.0
    phylop_score: float = 0.0
    gerp_score: float = 0.0
    cosmic_id: str = ""
    ema_approved: bool = False
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "variant_id": self.variant_id,
            "query": self.query,
            "chrom": self.chrom,
            "pos": self.pos,
            "ref": self.ref,
            "alt": self.alt,
            "rsid": self.rsid,
            "gene_symbol": self.gene_symbol,
            "gene_id": self.gene_id,
            "consequence": self.consequence,
            "clinvar_significance": self.clinvar_significance,
            "clinvar_disease": self.clinvar_disease,
            "cadd_phred": self.cadd_phred,
            "cadd_raw": self.cadd_raw,
            "gnomad_exome_af": self.gnomad_exome_af,
            "gnomad_genome_af": self.gnomad_genome_af,
            "exac_af": self.exac_af,
            "dbsnp_build": self.dbsnp_build,
            "sift_score": self.sift_score,
            "polyphen_score": self.polyphen_score,
            "revel_score": self.revel_score,
            "mutation_taster": self.mutation_taster,
            "fathmm_score": self.fathmm_score,
            "eigen_pc_raw": self.eigen_pc_raw,
            "primate_ai_score": self.primate_ai_score,
            "phylop_score": self.phylop_score,
            "gerp_score": self.gerp_score,
            "cosmic_id": self.cosmic_id,
            "ema_approved": self.ema_approved,
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
        self._store[self._key(*parts)] = (time.time(), value)

    def clear(self) -> None:
        self._store.clear()

_CACHE = _Cache()


class MyVariantAdapter:
    """Async adapter for MyVariant.info API.

    Provides comprehensive variant annotation including pathogenicity scores,
    allele frequencies, and clinical significance.

    Example:
        adapter = MyVariantAdapter()
        ann = await adapter.get_variant("chr1:g.218631822G>A")
        results = await adapter.query_variant("rs4343")
    """

    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT,
        rate_limit_delay: float = RATE_LIMIT_DELAY,
    ) -> None:
        self.timeout = timeout
        self.rate_limit_delay = rate_limit_delay
        self._client: Optional[httpx.AsyncClient] = None
        self._last_call_time: float = 0.0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> Any:
        elapsed = time.time() - self._last_call_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)
        cache_key = (url, json.dumps(params or {}, sort_keys=True))
        cached = _CACHE.get(*cache_key)
        if cached is not None:
            return cached
        client = await self._get_client()
        try:
            resp = await client.get(url, params=params or {})
            self._last_call_time = time.time()
            resp.raise_for_status()
            data = resp.json()
            _CACHE.set(data, *cache_key)
            return data
        except httpx.HTTPStatusError as e:
            raise MyVariantAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise MyVariantAPIError(f"Request failed: {e}") from e

    async def get_variant(
        self, variant_id: str, fields: Optional[str] = None
    ) -> Optional[MyVariantAnnotation]:
        """Get annotation for a single variant.

        Args:
            variant_id: Variant ID in HGVS format (e.g., "chr1:g.218631822G>A").
            fields: Comma-separated fields to return.

        Returns:
            Annotation or None.
        """
        url = f"{BASE_URL}/variant/{variant_id}"
        params = {"fields": fields} if fields else {}
        data = await self._rate_limited_get(url, params)
        if not data or "_id" not in data:
            return None
        return self._parse_annotation(data)

    async def query_variant(
        self, query: str, fields: Optional[str] = None, size: int = 10
    ) -> List[MyVariantAnnotation]:
        """Query variants by rsID, HGVS, or other identifier.

        Args:
            query: Query string.
            fields: Comma-separated fields.
            size: Max results.

        Returns:
            List of annotations.
        """
        url = f"{BASE_URL}/query"
        params = {"q": query, "size": min(size, 1000)}
        if fields:
            params["fields"] = fields
        data = await self._rate_limited_get(url, params)
        hits = data.get("hits", [])
        return [self._parse_annotation(h) for h in hits if "_id" in h]

    async def batch_query(
        self, variant_ids: List[str], fields: Optional[str] = None
    ) -> List[MyVariantAnnotation]:
        """Query multiple variants in a single batch request.

        Args:
            variant_ids: List of variant IDs.
            fields: Comma-separated fields.

        Returns:
            List of annotations.
        """
        url = f"{BASE_URL}/variant"
        params = {"ids": ",".join(variant_ids)}
        if fields:
            params["fields"] = fields
        data = await self._rate_limited_get(url, params)
        if isinstance(data, list):
            return [self._parse_annotation(d) for d in data if "_id" in d]
        elif isinstance(data, dict) and "_id" in data:
            return [self._parse_annotation(data)]
        return []

    async def query_by_gene(
        self, gene: str, size: int = 10
    ) -> List[MyVariantAnnotation]:
        """Query variants by gene symbol.

        Args:
            gene: Gene symbol.
            size: Max results.

        Returns:
            List of annotations.
        """
        url = f"{BASE_URL}/query"
        params = {"q": f"dbnsfp.genename:{gene}", "size": min(size, 1000)}
        data = await self._rate_limited_get(url, params)
        hits = data.get("hits", [])
        return [self._parse_annotation(h) for h in hits if "_id" in h]

    async def query_by_region(
        self, chrom: str, start: int, end: int, size: int = 10
    ) -> List[MyVariantAnnotation]:
        """Query variants in a genomic region.

        Args:
            chrom: Chromosome.
            start: Start position.
            end: End position.
            size: Max results.

        Returns:
            List of annotations.
        """
        url = f"{BASE_URL}/query"
        params = {"q": f"chr{chrom}:[{start} TO {end}]", "size": min(size, 1000)}
        data = await self._rate_limited_get(url, params)
        hits = data.get("hits", [])
        return [self._parse_annotation(h) for h in hits if "_id" in h]

    async def get_clinvar_variants(
        self, gene: str, size: int = 10
    ) -> List[MyVariantAnnotation]:
        """Get ClinVar variants for a gene.

        Args:
            gene: Gene symbol.
            size: Max results.

        Returns:
            List of annotations.
        """
        url = f"{BASE_URL}/query"
        params = {"q": f"clinvar.gene.symbol:{gene}", "size": min(size, 1000)}
        data = await self._rate_limited_get(url, params)
        hits = data.get("hits", [])
        return [self._parse_annotation(h) for h in hits if "_id" in h]

    async def get_pathogenic_variants(
        self, gene: str, size: int = 10
    ) -> List[MyVariantAnnotation]:
        """Get pathogenic/likely pathogenic variants for a gene.

        Args:
            gene: Gene symbol.
            size: Max results.

        Returns:
            List of pathogenic annotations.
        """
        url = f"{BASE_URL}/query"
        params = {
            "q": f"clinvar.gene.symbol:{gene} AND clinvar.rcv.clinical_significance:pathogenic",
            "size": min(size, 1000),
        }
        data = await self._rate_limited_get(url, params)
        hits = data.get("hits", [])
        return [self._parse_annotation(h) for h in hits if "_id" in h]

    async def query_by_dbsnp(
        self, rsid: str, fields: Optional[str] = None
    ) -> List[MyVariantAnnotation]:
        """Query by dbSNP rsID.

        Args:
            rsid: rsID (e.g., "rs4343").
            fields: Comma-separated fields.

        Returns:
            List of annotations.
        """
        url = f"{BASE_URL}/query"
        params = {"q": rsid, "size": 10}
        if fields:
            params["fields"] = fields
        data = await self._rate_limited_get(url, params)
        hits = data.get("hits", [])
        return [self._parse_annotation(h) for h in hits if "_id" in h]

    async def get_metadata(self) -> Dict[str, Any]:
        """Get API metadata including available fields.

        Returns:
            Metadata dict.
        """
        url = f"{BASE_URL}/metadata"
        return await self._rate_limited_get(url)

    async def get_fields(self) -> Dict[str, Any]:
        """Get available annotation fields.

        Returns:
            Fields dict.
        """
        url = f"{BASE_URL}/metadata/fields"
        return await self._rate_limited_get(url)

    def _parse_annotation(self, data: Dict[str, Any]) -> MyVariantAnnotation:
        dbsnp = data.get("dbsnp", {}) or {}
        clinvar = data.get("clinvar", {}) or {}
        cadd = data.get("cadd", {}) or {}
        dbnsfp = data.get("dbnsfp", {}) or {}
        gnomad = data.get("gnomad_exome", {}) or {}
        return MyVariantAnnotation(
            variant_id=data.get("_id", ""),
            query=data.get("query", ""),
            chrom=dbsnp.get("chrom", ""),
            pos=dbsnp.get("hg19", {}).get("start", 0) if dbsnp.get("hg19") else 0,
            ref=dbsnp.get("ref", ""),
            alt=dbsnp.get("alt", ""),
            rsid=dbsnp.get("rsid", ""),
            gene_symbol=dbnsfp.get("genename", ""),
            gene_id=dbnsfp.get("ensembl_geneid", ""),
            consequence=dbnsfp.get("ensembl_consequence", ""),
            clinvar_significance=clinvar.get("rcv", [{}])[0].get("clinical_significance", "") if clinvar.get("rcv") else "",
            clinvar_disease=clinvar.get("rcv", [{}])[0].get("conditions", {}).get("name", "") if clinvar.get("rcv") else "",
            cadd_phred=cadd.get("phred", 0) or 0,
            cadd_raw=cadd.get("raw", 0) or 0,
            gnomad_exome_af=gnomad.get("af", {}).get("af", 0) or 0,
            gnomad_genome_af=(data.get("gnomad_genome", {}) or {}).get("af", {}).get("af", 0) or 0,
            exac_af=(data.get("exac", {}) or {}).get("af", 0) or 0,
            dbsnp_build=str(dbsnp.get("dbsnp_build", "")),
            sift_score=dbnsfp.get("sift_converted_rankscore", 0) or 0,
            polyphen_score=dbnsfp.get("polyphen2_hdiv_rankscore", 0) or 0,
            revel_score=dbnsfp.get("revel_rankscore", 0) or 0,
            mutation_taster=dbnsfp.get("mutationtaster_pred", ""),
            fathmm_score=dbnsfp.get("fathmm_converted_rankscore", 0) or 0,
            eigen_pc_raw=dbnsfp.get("eigen_pc_raw", 0) or 0,
            primate_ai_score=dbnsfp.get("primateai_score", 0) or 0,
            phylop_score=dbnsfp.get("phyloP30way_mammalian", 0) or 0,
            gerp_score=dbnsfp.get("gerp_rs", 0) or 0,
            cosmic_id=clinvar.get("variant_id", ""),
            raw=data,
        )

    async def health_check(self) -> bool:
        try:
            url = f"{BASE_URL}/metadata"
            data = await self._rate_limited_get(url)
            return "build_version" in data or "src" in data
        except MyVariantAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "MyVariantAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class MyVariantAPIError(Exception):
    pass


async def _test_myvariant() -> None:
    adapter = MyVariantAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    ann = await adapter.get_variant("chr1:g.218631822G>A")
    print(f"[TEST] get_variant: {'PASS' if ann else 'FAIL'}")
    results = await adapter.query_variant("rs4343", size=3)
    print(f"[TEST] query_variant: found {len(results)} results")
    assert isinstance(results, list)
    await adapter.close()
    print("[TEST] All MyVariant tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_myvariant())
