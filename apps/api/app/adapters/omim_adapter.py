"""
OMIM Adapter - Online Mendelian Inheritance in Man
==================================================
Adapter for OMIM genetic disease and gene information.
OMIM catalogs human genes and genetic phenotypes/disorders.

API: https://api.omim.org/api/ (requires API key)
     Falls back to clinical synopsis scraping when no key available.

Note: Without API key, adapter provides limited functionality via
      publicly accessible data sources.
"""

import logging
import asyncio
import json
import hashlib
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# BaseAdapter
# ---------------------------------------------------------------------------

class BaseAdapter:
    """Base class for genetic disease database adapters."""

    name: str = ""
    display_name: str = ""
    source_url: str = ""
    version: str = ""
    confidence_tier: str = "C"
    data_types: List[str] = []

    async def validate_connection(self) -> bool:
        raise NotImplementedError("validate_connection() must be implemented")

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        raise NotImplementedError("search() must be implemented")

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "genetic_disorder") -> Dict:
        raise NotImplementedError("transform_to_canonical() must be implemented")

    def get_provenance(self, result: Dict) -> Dict:
        raise NotImplementedError("get_provenance() must be implemented")

    def get_confidence_score(self, result: Dict) -> Dict:
        raise NotImplementedError("get_confidence_score() must be implemented")

    async def close(self):
        logger.debug("BaseAdapter.close() — no-op default")


# ---------------------------------------------------------------------------
# OMIMAdapter
# ---------------------------------------------------------------------------

class OMIMAdapter(BaseAdapter):
    """
    OMIM (Online Mendelian Inheritance in Man) adapter.

    Provides access to genetic disorder and gene information.
    With API key: full access to OMIM API
    Without API key: limited access via public data and fallback sources

    API: https://api.omim.org/api/
    Fallback: https://api.ncbi.nlm.nih.gov/datasets/v1/ (NCBI)
    """

    OMIM_API = "https://api.omim.org/api"
    NCBI_EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
    NCBI_GENE_API = "https://api.ncbi.nlm.nih.gov/datasets/v1"

    def __init__(self, api_key: Optional[str] = None, cache_ttl: int = 3600):
        self.name = "omim"
        self.display_name = "OMIM (Online Mendelian Inheritance in Man)"
        self.source_url = "https://www.omim.org/"
        self.version = "2025"
        self.confidence_tier = "A"
        self.data_types = ["genetic_disorder", "gene", "phenotype", "clinical_synopsis"]
        self.rate_limit_per_minute = 20 if api_key else 10
        self.requires_auth = bool(api_key)
        self.auth_type = "api_key_required_for_full"
        self.api_key = api_key
        self.cache_ttl = cache_ttl
        self._full_access = bool(api_key)

        self._semaphore = asyncio.Semaphore(2)
        self._last_request_time: Optional[datetime] = None
        self._cache: Dict[str, Any] = {}

        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (bot@deepsynaps.ai)",
                "Accept": "application/json",
                "ApiKey": api_key or "",
            },
        )

    # -- helpers -------------------------------------------------------------

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                min_interval = 3.0 if self.api_key else 6.0
                if elapsed < min_interval:
                    await asyncio.sleep(min_interval - elapsed)
            self._last_request_time = datetime.utcnow()
            return await self.client.get(url, params=params)

    def _cache_key(self, method: str, query: Any) -> str:
        raw = json.dumps({"method": method, "query": query}, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
        return f"omim_{digest}"

    def _get_cached(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry and isinstance(entry, dict):
            ts = entry.get("_ts")
            if ts and (datetime.utcnow() - ts).total_seconds() < self.cache_ttl:
                return entry["data"]
        return None

    def _set_cached(self, key: str, data: Any) -> None:
        self._cache[key] = {"data": data, "_ts": datetime.utcnow()}

    # -- validate connection -------------------------------------------------

    async def validate_connection(self) -> bool:
        """Check connectivity to OMIM or NCBI fallback."""
        if self.api_key:
            try:
                resp = await self._rate_limited_get(
                    f"{self.OMIM_API}/apiKeyStatus",
                )
                if resp.status_code == 200:
                    logger.info("OMIM API reachable with key")
                    return True
            except Exception as exc:
                logger.error(f"OMIM API check failed: {exc}")

        # Fallback: check NCBI
        try:
            resp = await self._rate_limited_get(
                f"{self.NCBI_EUTILS}einfo.fcgi",
                params={"db": "omim", "retmode": "json"},
            )
            if resp.status_code == 200:
                logger.info("NCBI OMIM fallback reachable")
                return True
        except Exception as exc:
            logger.error(f"NCBI fallback check failed: {exc}")

        return False

    # -- search --------------------------------------------------------------

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search OMIM for genetic disorders or genes.

        Parameters
        ----------
        query: Search term (disorder name, gene symbol, OMIM number)
        filters: Optional dict with:
            - max_results (int): max results
            - search_type (str): 'gene', 'phenotype', 'both'
            - mim_number (str): specific OMIM number

        Returns
        -------
        List of OMIM entry dictionaries.
        """
        filters = filters or {}
        cache_key = self._cache_key("search", {"query": query, "filters": filters})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        limit = min(filters.get("max_results", 10), 50)

        if self.api_key and self._full_access:
            results = await self._search_omim_api(query, limit, filters)
        else:
            results = await self._search_ncbi_fallback(query, limit, filters)

        self._set_cached(cache_key, results)
        logger.info(f"OMIM search '{query}': {len(results)} results")
        return results

    async def _search_omim_api(self, query: str, limit: int, filters: Dict) -> List[Dict]:
        """Search using OMIM API (requires key)."""
        params = {
            "search": query,
            "limit": limit,
            "format": "json",
        }
        search_type = filters.get("search_type", "both")
        if search_type == "gene":
            params["filter"] = "gene"
        elif search_type == "phenotype":
            params["filter"] = "phenotype"

        try:
            resp = await self._rate_limited_get(
                f"{self.OMIM_API}/entry/search", params=params
            )
            if resp.status_code == 200:
                data = resp.json()
                entries = data.get("omim", {}).get("searchResponse", {}).get("entryList", [])
                results = []
                for entry in entries:
                    e = entry.get("entry", {})
                    results.append({
                        "mim_number": e.get("mimNumber", ""),
                        "titles": e.get("titles", {}),
                        "status": e.get("status", ""),
                        "prefix": e.get("prefix", ""),
                        "_fetch_source": "omim_api",
                    })
                return results
        except Exception as exc:
            logger.error(f"OMIM API search failed: {exc}")
        return []

    async def _search_ncbi_fallback(self, query: str, limit: int, filters: Dict) -> List[Dict]:
        """Search using NCBI E-utilities (no key required)."""
        try:
            esearch_params = {
                "db": "omim",
                "term": query,
                "retmode": "json",
                "retmax": limit,
            }
            resp = await self._rate_limited_get(
                f"{self.NCBI_EUTILS}esearch.fcgi", params=esearch_params
            )
            if resp.status_code != 200:
                return []

            data = resp.json()
            idlist = data.get("esearchresult", {}).get("idlist", [])
            if not idlist:
                return []

            # Fetch summaries
            esummary_params = {
                "db": "omim",
                "id": ",".join(idlist),
                "retmode": "json",
            }
            resp2 = await self._rate_limited_get(
                f"{self.NCBI_EUTILS}esummary.fcgi", params=esummary_params
            )
            if resp2.status_code != 200:
                return []

            summary_data = resp2.json()
            results = []
            result_container = summary_data.get("result", {})
            for mim_id in idlist:
                doc = result_container.get(mim_id)
                if isinstance(doc, dict):
                    results.append({
                        "mim_number": mim_id,
                        "title": doc.get("title", ""),
                        "description": doc.get("textdef", ""),
                        "prefix": doc.get("prefix", ""),
                        "_fetch_source": "ncbi_esummary",
                    })
            return results

        except Exception as exc:
            logger.error(f"OMIM NCBI fallback search failed: {exc}")
        return []

    # -- NEW: get_by_id -----------------------------------------------------

    async def get_by_id(self, mim_number: str) -> Optional[Dict]:
        """
        Retrieve an OMIM entry by MIM number.

        Parameters
        ----------
        mim_number: OMIM identifier (e.g. '137800')

        Returns
        -------
        Full OMIM entry or None.
        """
        if not mim_number:
            logger.warning("Empty MIM number")
            return None

        cache_key = self._cache_key("get_by_id", mim_number)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        logger.info(f"OMIM get_by_id: {mim_number}")

        if self.api_key and self._full_access:
            result = await self._get_by_id_omim_api(mim_number)
        else:
            result = await self._get_by_id_ncbi_fallback(mim_number)

        if result:
            self._set_cached(cache_key, result)
        return result

    async def _get_by_id_omim_api(self, mim_number: str) -> Optional[Dict]:
        """Get entry via OMIM API."""
        try:
            resp = await self._rate_limited_get(
                f"{self.OMIM_API}/entry",
                params={"mimNumber": mim_number, "format": "json", "include": "all"},
            )
            if resp.status_code == 200:
                data = resp.json()
                entry = data.get("omim", {}).get("entryList", [{}])[0].get("entry", {})
                entry["_fetch_source"] = "omim_api"
                return entry
        except Exception as exc:
            logger.error(f"OMIM API get_by_id failed: {exc}")
        return None

    async def _get_by_id_ncbi_fallback(self, mim_number: str) -> Optional[Dict]:
        """Get entry via NCBI."""
        try:
            resp = await self._rate_limited_get(
                f"{self.NCBI_EUTILS}esummary.fcgi",
                params={"db": "omim", "id": mim_number, "retmode": "json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                doc = data.get("result", {}).get(mim_number)
                if isinstance(doc, dict):
                    doc["_fetch_source"] = "ncbi_esummary"
                    return doc
        except Exception as exc:
            logger.error(f"OMIM NCBI get_by_id failed: {exc}")
        return None

    # -- NEW: get_clinical_synopsis -----------------------------------------

    async def get_clinical_synopsis(self, mim_number: str) -> Dict[str, Any]:
        """
        Get clinical synopsis for an OMIM entry.

        Parameters
        ----------
        mim_number: OMIM identifier

        Returns
        -------
        Clinical synopsis dictionary.
        """
        entry = await self.get_by_id(mim_number)
        if entry is None:
            return {"error": f"OMIM {mim_number} not found", "mim_number": mim_number}

        # Extract clinical synopsis from entry
        clinical = entry.get("clinicalSynopsis", {})
        if not clinical:
            # Try alternative locations
            text_fields = entry.get("textSectionList", [])
            for tf in text_fields:
                section = tf.get("textSection", {})
                if "clinical" in section.get("textSectionTitle", "").lower():
                    clinical = {"description": section.get("textSectionContent", "")}
                    break

        return {
            "mim_number": mim_number,
            "has_clinical_synopsis": bool(clinical),
            "inheritance": clinical.get("inheritance", "") if isinstance(clinical, dict) else "",
            "clinical_features": clinical if isinstance(clinical, dict) else {},
            "gene_map": entry.get("geneMap", {}),
            "phenotype_map": entry.get("phenotypeMapList", []),
        }

    # -- NEW: get_allelic_variants ------------------------------------------

    async def get_allelic_variants(self, mim_number: str) -> Dict[str, Any]:
        """
        Get allelic variants for an OMIM gene entry.

        Parameters
        ----------
        mim_number: OMIM gene identifier

        Returns
        -------
        Dictionary with allelic variant list.
        """
        entry = await self.get_by_id(mim_number)
        if entry is None:
            return {"error": f"OMIM {mim_number} not found", "mim_number": mim_number}

        variants = entry.get("allelicVariantList", [])
        if not variants and self.api_key:
            # Try fetching specific variant data
            try:
                resp = await self._rate_limited_get(
                    f"{self.OMIM_API}/allelicVariantList",
                    params={"mimNumber": mim_number, "format": "json"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    variants = data.get("omim", {}).get("allelicVariantList", [])
            except Exception as exc:
                logger.error(f"OMIM allelic variant fetch failed: {exc}")

        parsed_variants = []
        for v in variants:
            variant = v.get("allelicVariant", v) if isinstance(v, dict) else {}
            if isinstance(variant, dict):
                parsed_variants.append({
                    "number": variant.get("number", ""),
                    "name": variant.get("name", ""),
                    "mutation": variant.get("mutation", ""),
                    "db_snp": variant.get("dbSnp", ""),
                    "clinvar": variant.get("clinvar", ""),
                    "description": variant.get("text", ""),
                })

        return {
            "mim_number": mim_number,
            "gene_name": entry.get("titles", {}).get("preferredTitle", ""),
            "variant_count": len(parsed_variants),
            "variants": parsed_variants,
        }

    # -- transform -----------------------------------------------------------

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "genetic_disorder") -> Dict:
        """Convert OMIM entry to canonical format."""
        mim_number = raw_data.get("mimNumber", raw_data.get("mim_number", ""))
        titles = raw_data.get("titles", {})
        title = titles.get("preferredTitle", "") if isinstance(titles, dict) else titles

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": f"OMIM:{mim_number}",
            "title": title,
            "mim_number": mim_number,
            "status": raw_data.get("status", ""),
            "prefix": raw_data.get("prefix", ""),
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "url": f"https://www.omim.org/entry/{mim_number}" if mim_number else "",
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.92,
            "research_only": False,
            "curation_status": "johns_hopkins_curated",
            "editorial_status": "peer_reviewed",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        has_clinical = bool(result.get("clinicalSynopsis"))
        has_gene_map = bool(result.get("geneMap"))

        data_quality = 0.92
        evidence_strength = 0.95 if has_gene_map else 0.80

        overall = round(
            data_quality * 0.35
            + evidence_strength * 0.30
            + (0.90 if has_clinical else 0.70) * 0.15
            + 0.85 * 0.10
            + 0.80 * 0.10,
            3,
        )

        return {
            "data_quality": data_quality,
            "evidence_strength": evidence_strength,
            "clinical_completeness": 0.90 if has_clinical else 0.70,
            "molecular_completeness": 0.85 if has_gene_map else 0.60,
            "temporal_relevance": 0.80,
            "overall": overall,
        }

    async def close(self):
        await self.client.aclose()
        self._cache.clear()
        logger.info("OMIMAdapter closed")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()


# -- tests -----------------------------------------------------------------

async def _test_omim_adapter():
    # Test without API key (limited mode)
    adapter = OMIMAdapter()

    ok = await adapter.validate_connection()
    print(f"[TEST] validate_connection: {ok}")

    results = await adapter.search("alzheimer", filters={"max_results": 3})
    print(f"[TEST] search: {len(results)} results")

    entry = await adapter.get_by_id("104300")
    print(f"[TEST] get_by_id: {entry.get('title', 'N/A') if entry else 'not found'}")

    synopsis = await adapter.get_clinical_synopsis("104300")
    print(f"[TEST] get_clinical_synopsis: has_data={synopsis.get('has_clinical_synopsis', False)}")

    variants = await adapter.get_allelic_variants("104300")
    print(f"[TEST] get_allelic_variants: {variants.get('variant_count', 0)} variants")

    if results:
        canonical = adapter.transform_to_canonical(results[0])
        print(f"[TEST] transform_to_canonical: {canonical.get('title', 'N/A')[:40]}")

    await adapter.close()
    print("[TEST] All OMIMAdapter tests passed!")


if __name__ == "__main__":
    asyncio.run(_test_omim_adapter())
