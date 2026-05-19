#!/usr/bin/env python3
"""
gnomAD Adapter — Genome Aggregation Database
https://gnomad.broadinstitute.org/api/

Provides access to population genetic variation data including allele frequencies,
constraint metrics, and variant annotations across diverse populations.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union

import httpx

BASE_URL = "https://gnomad.broadinstitute.org/api"
GRAPHQL_URL = "https://gnomad.broadinstitute.org/api/"
DEFAULT_TIMEOUT = 45.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class GnomADVariant:
    """Represents a variant from gnomAD."""
    variant_id: str
    chrom: str
    pos: int
    ref: str
    alt: str
    rsid: str = ""
    allele_freq: float = 0.0
    allele_count: int = 0
    allele_num: int = 0
    homozygote_count: int = 0
    popmax_af: float = 0.0
    popmax_population: str = ""
    cadd_phred: float = 0.0
    revel_score: float = 0.0
    spliceai_ds_max: float = 0.0
    consequence: str = ""
    gene_id: str = ""
    gene_symbol: str = ""
    transcript_id: str = ""
    hgvsc: str = ""
    hgvsp: str = ""
    loftee: str = ""
    flags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "variant_id": self.variant_id,
            "chrom": self.chrom,
            "pos": self.pos,
            "ref": self.ref,
            "alt": self.alt,
            "rsid": self.rsid,
            "allele_freq": self.allele_freq,
            "allele_count": self.allele_count,
            "allele_num": self.allele_num,
            "homozygote_count": self.homozygote_count,
            "popmax_af": self.popmax_af,
            "popmax_population": self.popmax_population,
            "cadd_phred": self.cadd_phred,
            "revel_score": self.revel_score,
            "spliceai_ds_max": self.spliceai_ds_max,
            "consequence": self.consequence,
            "gene_id": self.gene_id,
            "gene_symbol": self.gene_symbol,
            "transcript_id": self.transcript_id,
            "hgvsc": self.hgvsc,
            "hgvsp": self.hgvsp,
            "loftee": self.loftee,
            "flags": self.flags,
        }


@dataclass
class GnomADGeneConstraint:
    """Gene constraint metrics from gnomAD."""
    gene_id: str
    gene_symbol: str
    pLI: float = 0.0
    LOEUF: float = 0.0
    mis_z: float = 0.0
    syn_z: float = 0.0
    obs_lof: int = 0
    exp_lof: float = 0.0
    obs_mis: int = 0
    exp_mis: float = 0.0
    obs_syn: int = 0
    exp_syn: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "gene_id": self.gene_id,
            "gene_symbol": self.gene_symbol,
            "pLI": self.pLI,
            "LOEUF": self.LOEUF,
            "mis_z": self.mis_z,
            "syn_z": self.syn_z,
            "obs_lof": self.obs_lof,
            "exp_lof": self.exp_lof,
            "obs_mis": self.obs_mis,
            "exp_mis": self.exp_mis,
            "obs_syn": self.obs_syn,
            "exp_syn": self.exp_syn,
        }


@dataclass
class GnomADPopulationFreq:
    """Population-specific allele frequency."""
    population: str
    allele_freq: float
    allele_count: int
    allele_num: int
    homozygote_count: int


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


class GnomADAdapter:
    """Async adapter for the gnomAD GraphQL API.

    Provides access to population genetic variation data, gene constraint metrics,
    and variant annotations.

    Example:
        adapter = GnomADAdapter()
        variant = await adapter.get_variant("1-55516888-G-A")
        gene = await adapter.get_gene_constraint("BRCA1")
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

    async def _graphql_query(self, query: str, variables: Optional[Dict] = None) -> Dict[str, Any]:
        elapsed = time.time() - self._last_call_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)
        cache_key = (query, json.dumps(variables or {}, sort_keys=True))
        cached = _CACHE.get(*cache_key)
        if cached is not None:
            return cached
        client = await self._get_client()
        try:
            resp = await client.post(
                GRAPHQL_URL,
                json={"query": query, "variables": variables or {}},
                headers={"Content-Type": "application/json"},
            )
            self._last_call_time = time.time()
            resp.raise_for_status()
            data = resp.json()
            _CACHE.set(data, *cache_key)
            return data
        except httpx.HTTPStatusError as e:
            raise GnomADAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise GnomADAPIError(f"Request failed: {e}") from e

    async def get_variant(self, variant_id: str, reference_genome: str = "GRCh37") -> Optional[GnomADVariant]:
        """Get variant by ID.

        Args:
            variant_id: Variant ID (e.g., "1-55516888-G-A").
            reference_genome: Reference genome version.

        Returns:
            Variant or None.
        """
        query = """
        query Variant($variantId: String!, $refGenome: ReferenceGenomeId!) {
            variant(variantId: $variantId, referenceGenome: $refGenome) {
                variantId
                chrom
                pos
                ref
                alt
                rsid
                exome { ac an ac_hom }
                genome { ac an ac_hom }
                in_silico_predictors { cadd_phred revel_max_spliceai_ds_max }
                consequences { gene_symbol gene_id consequence hgvsc hgvsp loftee transcript_id }
                flags
            }
        }
        """
        data = await self._graphql_query(query, {"variantId": variant_id, "refGenome": reference_genome})
        vdata = data.get("data", {}).get("variant")
        if not vdata:
            return None
        exome = vdata.get("exome", {}) or {}
        genome = vdata.get("genome", {}) or {}
        ac = (exome.get("ac", 0) or 0) + (genome.get("ac", 0) or 0)
        an = (exome.get("an", 0) or 0) + (genome.get("an", 0) or 0)
        af = ac / an if an > 0 else 0.0
        consequences = vdata.get("consequences", [])
        cons = consequences[0] if consequences else {}
        predictors = vdata.get("in_silico_predictors", {}) or {}
        return GnomADVariant(
            variant_id=vdata.get("variantId", ""),
            chrom=vdata.get("chrom", ""),
            pos=vdata.get("pos", 0),
            ref=vdata.get("ref", ""),
            alt=vdata.get("alt", ""),
            rsid=vdata.get("rsid", ""),
            allele_freq=af,
            allele_count=ac,
            allele_num=an,
            homozygote_count=(exome.get("ac_hom", 0) or 0) + (genome.get("ac_hom", 0) or 0),
            cadd_phred=predictors.get("cadd_phred", 0) or 0,
            revel_score=predictors.get("revel_max", 0) or 0,
            spliceai_ds_max=predictors.get("spliceai_ds_max", 0) or 0,
            consequence=cons.get("consequence", ""),
            gene_id=cons.get("gene_id", ""),
            gene_symbol=cons.get("gene_symbol", ""),
            transcript_id=cons.get("transcript_id", ""),
            hgvsc=cons.get("hgvsc", ""),
            hgvsp=cons.get("hgvsp", ""),
            loftee=cons.get("loftee", ""),
            flags=vdata.get("flags", []),
        )

    async def get_gene_constraint(self, gene_symbol: str) -> Optional[GnomADGeneConstraint]:
        """Get constraint metrics for a gene.

        Args:
            gene_symbol: HGNC gene symbol.

        Returns:
            Constraint metrics or None.
        """
        query = """
        query GeneConstraint($geneSymbol: String!) {
            gene(gene_symbol: $geneSymbol, referenceGenome: GRCh37) {
                gene_id
                gene_symbol
                gnomad_constraint {
                    pLI
                    loeuf
                    mis_z
                    syn_z
                    obs_lof
                    exp_lof
                    obs_mis
                    exp_mis
                    obs_syn
                    exp_syn
                }
            }
        }
        """
        data = await self._graphql_query(query, {"geneSymbol": gene_symbol})
        gdata = data.get("data", {}).get("gene")
        if not gdata:
            return None
        gc = gdata.get("gnomad_constraint", {}) or {}
        return GnomADGeneConstraint(
            gene_id=gdata.get("gene_id", ""),
            gene_symbol=gdata.get("gene_symbol", ""),
            pLI=gc.get("pLI", 0) or 0,
            LOEUF=gc.get("loeuf", 0) or 0,
            mis_z=gc.get("mis_z", 0) or 0,
            syn_z=gc.get("syn_z", 0) or 0,
            obs_lof=gc.get("obs_lof", 0) or 0,
            exp_lof=gc.get("exp_lof", 0) or 0,
            obs_mis=gc.get("obs_mis", 0) or 0,
            exp_mis=gc.get("exp_mis", 0) or 0,
            obs_syn=gc.get("obs_syn", 0) or 0,
            exp_syn=gc.get("exp_syn", 0) or 0,
        )

    async def search_variants_by_region(
        self, chrom: str, start: int, stop: int, reference_genome: str = "GRCh37"
    ) -> List[GnomADVariant]:
        """Search variants in a genomic region.

        Args:
            chrom: Chromosome.
            start: Start position.
            stop: Stop position.
            reference_genome: Reference genome.

        Returns:
            List of variants.
        """
        query = """
        query Region($chrom: String!, $start: Int!, $stop: Int!, $refGenome: ReferenceGenomeId!) {
            region(chrom: $chrom, start: $start, stop: $stop, referenceGenome: $refGenome) {
                variants {
                    variantId
                    chrom
                    pos
                    ref
                    alt
                    rsid
                    exome { ac an }
                    genome { ac an }
                }
            }
        }
        """
        data = await self._graphql_query(query, {"chrom": chrom, "start": start, "stop": stop, "refGenome": reference_genome})
        variants = data.get("data", {}).get("region", {}).get("variants", [])
        results: List[GnomADVariant] = []
        for v in variants:
            exome = v.get("exome", {}) or {}
            genome = v.get("genome", {}) or {}
            ac = (exome.get("ac", 0) or 0) + (genome.get("ac", 0) or 0)
            an = (exome.get("an", 0) or 0) + (genome.get("an", 0) or 0)
            results.append(GnomADVariant(
                variant_id=v.get("variantId", ""),
                chrom=v.get("chrom", ""),
                pos=v.get("pos", 0),
                ref=v.get("ref", ""),
                alt=v.get("alt", ""),
                rsid=v.get("rsid", ""),
                allele_freq=ac / an if an > 0 else 0.0,
                allele_count=ac,
                allele_num=an,
            ))
        return results

    async def search_variants_by_rsid(self, rsid: str) -> List[GnomADVariant]:
        """Search variants by rsID.

        Args:
            rsid: dbSNP rsID.

        Returns:
            List of matching variants.
        """
        query = """
        query SearchVariants($rsid: String!) {
            variants(dataset: gnomad_r2_1, query: $rsid) {
                variant_id
                chrom
                pos
                ref
                alt
                rsid
            }
        }
        """
        data = await self._graphql_query(query, {"rsid": rsid})
        variants = data.get("data", {}).get("variants", [])
        return [
            GnomADVariant(
                variant_id=v.get("variant_id", ""),
                chrom=v.get("chrom", ""),
                pos=v.get("pos", 0),
                ref=v.get("ref", ""),
                alt=v.get("alt", ""),
                rsid=v.get("rsid", ""),
            )
            for v in variants
        ]

    async def get_gene_variants(
        self, gene_symbol: str, reference_genome: str = "GRCh37"
    ) -> List[GnomADVariant]:
        """Get all variants in a gene.

        Args:
            gene_symbol: HGNC gene symbol.
            reference_genome: Reference genome.

        Returns:
            List of variants.
        """
        query = """
        query GeneVariants($geneSymbol: String!, $refGenome: ReferenceGenomeId!) {
            gene(gene_symbol: $geneSymbol, referenceGenome: $refGenome) {
                variants(dataset: gnomad_r2_1) {
                    variantId
                    chrom
                    pos
                    ref
                    alt
                    rsid
                    exome { ac an }
                    genome { ac an }
                    consequences { gene_symbol consequence hgvsc hgvsp }
                }
            }
        }
        """
        data = await self._graphql_query(query, {"geneSymbol": gene_symbol, "refGenome": reference_genome})
        variants = data.get("data", {}).get("gene", {}).get("variants", [])
        results: List[GnomADVariant] = []
        for v in variants:
            exome = v.get("exome", {}) or {}
            genome = v.get("genome", {}) or {}
            ac = (exome.get("ac", 0) or 0) + (genome.get("ac", 0) or 0)
            an = (exome.get("an", 0) or 0) + (genome.get("an", 0) or 0)
            cons_list = v.get("consequences", [])
            cons = cons_list[0] if cons_list else {}
            results.append(GnomADVariant(
                variant_id=v.get("variantId", ""),
                chrom=v.get("chrom", ""),
                pos=v.get("pos", 0),
                ref=v.get("ref", ""),
                alt=v.get("alt", ""),
                rsid=v.get("rsid", ""),
                allele_freq=ac / an if an > 0 else 0.0,
                allele_count=ac,
                allele_num=an,
                consequence=cons.get("consequence", ""),
                gene_symbol=cons.get("gene_symbol", ""),
                hgvsc=cons.get("hgvsc", ""),
                hgvsp=cons.get("hgvsp", ""),
            ))
        return results

    async def get_population_frequencies(
        self, variant_id: str, reference_genome: str = "GRCh37"
    ) -> List[GnomADPopulationFreq]:
        """Get population-specific allele frequencies.

        Args:
            variant_id: Variant ID.
            reference_genome: Reference genome.

        Returns:
            List of population frequencies.
        """
        query = """
        query PopFreqs($variantId: String!, $refGenome: ReferenceGenomeId!) {
            variant(variantId: $variantId, referenceGenome: $refGenome) {
                exome { populations { id ac an homozygote_count } }
                genome { populations { id ac an homozygote_count } }
            }
        }
        """
        data = await self._graphql_query(query, {"variantId": variant_id, "refGenome": reference_genome})
        v = data.get("data", {}).get("variant", {})
        results: List[GnomADPopulationFreq] = []
        for source in [v.get("exome", {}) or {}, v.get("genome", {}) or {}]:
            pops = source.get("populations", [])
            for p in pops:
                ac = p.get("ac", 0) or 0
                an = p.get("an", 0) or 0
                results.append(GnomADPopulationFreq(
                    population=p.get("id", ""),
                    allele_freq=ac / an if an > 0 else 0.0,
                    allele_count=ac,
                    allele_num=an,
                    homozygote_count=p.get("homozygote_count", 0) or 0,
                ))
        return results

    async def health_check(self) -> bool:
        try:
            query = "{ __schema { queryType { name } } }"
            data = await self._graphql_query(query)
            return "data" in data
        except GnomADAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "GnomADAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class GnomADAPIError(Exception):
    pass


async def _test_gnomad() -> None:
    adapter = GnomADAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    variant = await adapter.get_variant("1-55516888-G-A")
    print(f"[TEST] get_variant: {'PASS' if variant else 'FAIL'}")
    constraint = await adapter.get_gene_constraint("BRCA1")
    print(f"[TEST] get_gene_constraint: {'PASS' if constraint else 'FAIL'}")
    await adapter.close()
    print("[TEST] All gnomAD tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_gnomad())
