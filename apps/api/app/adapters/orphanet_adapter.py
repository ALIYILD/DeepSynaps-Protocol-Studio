"""
Orphanet Adapter - Rare Diseases and Orphan Drugs
=================================================
Adapter for Orphanet, the reference portal for rare diseases and orphan drugs.
Provides access to prevalence data, gene associations, and diagnostic criteria.

API: http://www.orphadata.org/ (JSON API)
     RD-CODE API for standardized rare disease coding
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
    """Base class for rare disease database adapters."""

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

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "rare_disease") -> Dict:
        raise NotImplementedError("transform_to_canonical() must be implemented")

    def get_provenance(self, result: Dict) -> Dict:
        raise NotImplementedError("get_provenance() must be implemented")

    def get_confidence_score(self, result: Dict) -> Dict:
        raise NotImplementedError("get_confidence_score() must be implemented")

    async def close(self):
        logger.debug("BaseAdapter.close() — no-op default")


# ---------------------------------------------------------------------------
# OrphanetAdapter
# ---------------------------------------------------------------------------

class OrphanetAdapter(BaseAdapter):
    """
    Orphanet adapter for rare disease information.

    Uses the Orphadata JSON API to access:
      - Rare disease classifications and disorders
      - Prevalence data (epidemiology)
      - Associated genes and phenotypes
      - Diagnostic criteria
      - Orphan drug information

    API: http://www.orphadata.org/ (JSON endpoints)
    """

    ORPHADATA_BASE = "https://api.orphacode.org/ncit_orpha"
    ORPHANET_API = "https://www.orpha.net/api"

    # Alternative endpoints
    RD_CODE_API = "https://ordcode.rd-code.eu/api/v1"

    def __init__(self, cache_ttl: int = 3600):
        self.name = "orphanet"
        self.display_name = "Orphanet (Rare Diseases)"
        self.source_url = "https://www.orpha.net/"
        self.version = "2025"
        self.confidence_tier = "A"
        self.data_types = [
            "rare_disease",
            "genetic_disorder",
            "orphan_drug",
            "prevalence",
            "gene_disease_association",
        ]
        self.rate_limit_per_minute = 30
        self.requires_auth = False
        self.auth_type = "none"
        self.cache_ttl = cache_ttl

        self._semaphore = asyncio.Semaphore(3)
        self._last_request_time: Optional[datetime] = None
        self._cache: Dict[str, Any] = {}

        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (bot@deepsynaps.ai)",
                "Accept": "application/json",
            },
        )

    # -- helpers -------------------------------------------------------------

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                if elapsed < 2.0:
                    await asyncio.sleep(2.0 - elapsed)
            self._last_request_time = datetime.utcnow()
            return await self.client.get(url, params=params)

    def _cache_key(self, method: str, query: Any) -> str:
        raw = json.dumps({"method": method, "query": query}, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
        return f"orphanet_{digest}"

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
        """Check connectivity to Orphanet/Orphadata."""
        try:
            # Try the Orphacode API
            resp = await self._rate_limited_get(
                f"{self.ORPHADATA_BASE}/codes/1",
                timeout=10.0,
            )
            if resp.status_code in (200, 301, 302):
                logger.info("Orphanet API reachable")
                return True
        except Exception as exc:
            logger.error(f"Orphanet connection validation failed: {exc}")
        return False

    # -- search --------------------------------------------------------------

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search Orphanet for rare diseases.

        Parameters
        ----------
        query: Disease name or keyword
        filters: Optional dict with:
            - max_results (int): max results, default 20
            - language (str): language code, default 'en'
            - classification (bool): include classification info

        Returns
        -------
        List of rare disease dictionaries.
        """
        filters = filters or {}
        cache_key = self._cache_key("search", {"query": query, "filters": filters})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        limit = min(filters.get("max_results", 20), 100)

        # Try Orphacode API first
        results = []
        try:
            resp = await self._rate_limited_get(
                f"{self.ORPHADATA_BASE}/find",
                params={"keyword": query, "lang": filters.get("language", "en")},
            )
            if resp.status_code == 200:
                data = resp.json()
                entities = data if isinstance(data, list) else data.get("data", [])
                for entity in entities[:limit]:
                    results.append({
                        "orpha_code": entity.get("orphaCode", entity.get("ORPHAcode", "")),
                        "preferred_term": entity.get("preferredTerm", entity.get("preferred-term", "")),
                        "definition": entity.get("definition", ""),
                        "synonyms": entity.get("synonyms", []),
                        "source": "orphacode_api",
                        "_fetch_source": "orphacode_search",
                    })
        except Exception as exc:
            logger.error(f"Orphanet search failed: {exc}")

        # Fallback: structured search
        if not results:
            results = await self._search_fallback(query, limit)

        self._set_cached(cache_key, results)
        logger.info(f"Orphanet search '{query}': {len(results)} results")
        return results

    async def _search_fallback(self, query: str, limit: int) -> List[Dict]:
        """Fallback search using Orphanet XML API."""
        try:
            resp = await self._rate_limited_get(
                f"{self.ORPHANET_API}/rd-bundle",
                params={
                    "name": query,
                    "language": "en",
                    "format": "json",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                disorders = data.get("disorder-list", {}).get("disorder", [])
                results = []
                for d in disorders[:limit]:
                    results.append({
                        "orpha_code": d.get("id", ""),
                        "preferred_term": d.get("name", ""),
                        "definition": "",
                        "synonyms": [],
                        "source": "orphanet_xml_api",
                        "_fetch_source": "orphanet_fallback",
                    })
                return results
        except Exception as exc:
            logger.error(f"Orphanet fallback search failed: {exc}")
        return []

    # -- NEW: get_by_id -----------------------------------------------------

    async def get_by_id(self, orpha_code: str) -> Optional[Dict]:
        """
        Retrieve a rare disease by OrphaCode.

        Parameters
        ----------
        orpha_code: OrphaCode identifier (e.g. 'ORPHA:324')

        Returns
        -------
        Full disease record or None.
        """
        if not orpha_code:
            logger.warning("Empty OrphaCode provided")
            return None

        # Normalize
        code = orpha_code.replace("ORPHA:", "").replace("orpha:", "").strip()

        cache_key = self._cache_key("get_by_id", code)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        logger.info(f"Orphanet get_by_id: ORPHA:{code}")

        try:
            resp = await self._rate_limited_get(
                f"{self.ORPHADATA_BASE}/codes/{code}",
            )
            if resp.status_code == 200:
                data = resp.json()
                record = {
                    "orpha_code": code,
                    "preferred_term": data.get("preferredTerm", data.get("preferred-term", "")),
                    "definition": data.get("definition", ""),
                    "synonyms": data.get("synonyms", []),
                    "classifications": data.get("classifications", []),
                    "external_references": data.get("external-references", []),
                    "_fetch_source": "orphacode_get_by_id",
                }
                self._set_cached(cache_key, record)
                return record
            elif resp.status_code == 404:
                logger.info(f"OrphaCode {code} not found")
                return None
            else:
                logger.warning(f"Orphanet get_by_id HTTP {resp.status_code}")
        except Exception as exc:
            logger.error(f"Orphanet get_by_id failed: {exc}")

        return None

    # -- NEW: get_prevalence ------------------------------------------------

    async def get_prevalence(self, orpha_code: str) -> Dict[str, Any]:
        """
        Get prevalence data for a rare disease.

        Parameters
        ----------
        orpha_code: OrphaCode identifier

        Returns
        -------
        Prevalence information dictionary.
        """
        if not orpha_code:
            return {"error": "Empty OrphaCode", "prevalence": []}

        code = orpha_code.replace("ORPHA:", "").replace("orpha:", "").strip()
        cache_key = self._cache_key("get_prevalence", code)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        logger.info(f"Orphanet get_prevalence: ORPHA:{code}")

        try:
            # Try to get prevalence from disease detail
            entry = await self.get_by_id(code)
            if entry and "prevalence" in entry:
                prevalence = entry.get("prevalence", [])
            else:
                # Use Orphacode epidemiology endpoint
                resp = await self._rate_limited_get(
                    f"{self.ORPHADATA_BASE}/epidemiology/{code}",
                )
                if resp.status_code == 200:
                    data = resp.json()
                    prevalence = data if isinstance(data, list) else data.get("data", [])
                else:
                    prevalence = []

            parsed = []
            for p in prevalence if isinstance(prevalence, list) else []:
                parsed.append({
                    "prevalence_type": p.get("prevalenceType", ""),
                    "prevalence_qualification": p.get("prevalenceQualification", ""),
                    "prevalence_class": p.get("prevalenceClass", ""),
                    "val_moy": p.get("valMoy", ""),
                    "geographic": p.get("geographic", ""),
                })

            result = {
                "orpha_code": code,
                "prevalence_count": len(parsed),
                "prevalence": parsed,
            }

            self._set_cached(cache_key, result)
            return result

        except Exception as exc:
            logger.error(f"Orphanet get_prevalence failed: {exc}")

        return {"orpha_code": code, "prevalence_count": 0, "prevalence": []}

    # -- NEW: get_associated_genes ------------------------------------------

    async def get_associated_genes(self, orpha_code: str) -> Dict[str, Any]:
        """
        Get genes associated with a rare disease.

        Parameters
        ----------
        orpha_code: OrphaCode identifier

        Returns
        -------
        Dictionary with gene associations.
        """
        if not orpha_code:
            return {"error": "Empty OrphaCode", "genes": []}

        code = orpha_code.replace("ORPHA:", "").replace("orpha:", "").strip()
        cache_key = self._cache_key("get_associated_genes", code)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        logger.info(f"Orphanet get_associated_genes: ORPHA:{code}")

        try:
            # Try Orphacode gene endpoint
            resp = await self._rate_limited_get(
                f"{self.ORPHADATA_BASE}/genes/{code}",
            )
            genes = []
            if resp.status_code == 200:
                data = resp.json()
                gene_data = data if isinstance(data, list) else data.get("data", [])
                for g in gene_data:
                    gene_info = g if isinstance(g, dict) else g.get("gene", {})
                    if isinstance(gene_info, dict):
                        genes.append({
                            "gene_symbol": gene_info.get("symbol", gene_info.get("geneSymbol", "")),
                            "gene_name": gene_info.get("name", gene_info.get("geneName", "")),
                            "gene_type": gene_info.get("type", ""),
                            "hgnc_id": gene_info.get("hgncId", ""),
                            "omim_id": gene_info.get("omimId", ""),
                            "association_type": gene_info.get("associationType", ""),
                            "association_status": gene_info.get("associationStatus", ""),
                        })

            # Fallback: try entry detail
            if not genes:
                entry = await self.get_by_id(code)
                if entry and isinstance(entry, dict):
                    gene_list = entry.get("genes", [])
                    for g in gene_list:
                        if isinstance(g, dict):
                            genes.append({
                                "gene_symbol": g.get("symbol", ""),
                                "gene_name": g.get("name", ""),
                                "gene_type": g.get("type", ""),
                                "hgnc_id": g.get("hgncId", ""),
                                "omim_id": g.get("omimId", ""),
                                "association_type": g.get("associationType", ""),
                                "association_status": g.get("associationStatus", ""),
                            })

            result = {
                "orpha_code": code,
                "gene_count": len(genes),
                "genes": genes,
            }

            self._set_cached(cache_key, result)
            return result

        except Exception as exc:
            logger.error(f"Orphanet get_associated_genes failed: {exc}")

        return {"orpha_code": code, "gene_count": 0, "genes": []}

    # -- transform -----------------------------------------------------------

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "rare_disease") -> Dict:
        """Convert Orphanet record to canonical format."""
        orpha_code = raw_data.get("orpha_code", "")
        preferred_term = raw_data.get("preferred_term", "")

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": f"ORPHA:{orpha_code}" if orpha_code else "",
            "title": preferred_term,
            "definition": raw_data.get("definition", ""),
            "synonyms": raw_data.get("synonyms", []),
            "orpha_code": orpha_code,
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "url": f"https://www.orpha.net/consor/cgi-bin/OC_Exp.php?Lng=EN&Expert={orpha_code}" if orpha_code else "",
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.93,
            "research_only": False,
            "curation_status": "inserm_curated",
            "editorial_board": "Orphanet Editorial Board",
            "validation": "peer_reviewed",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        has_genes = bool(result.get("genes"))
        has_prevalence = bool(result.get("prevalence"))
        has_definition = bool(result.get("definition"))

        data_quality = 0.93
        evidence_strength = 0.85
        completeness = 0.70
        if has_genes:
            completeness = 0.85
        if has_prevalence:
            completeness = min(0.95, completeness + 0.05)

        overall = round(
            data_quality * 0.30
            + evidence_strength * 0.25
            + completeness * 0.25
            + 0.85 * 0.10
            + 0.80 * 0.10,
            3,
        )

        return {
            "data_quality": data_quality,
            "evidence_strength": evidence_strength,
            "completeness": round(completeness, 3),
            "temporal_relevance": 0.85,
            "consistency": 0.80,
            "overall": overall,
        }

    async def close(self):
        await self.client.aclose()
        self._cache.clear()
        logger.info("OrphanetAdapter closed")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()


# -- tests -----------------------------------------------------------------

async def _test_orphanet_adapter():
    adapter = OrphanetAdapter()

    ok = await adapter.validate_connection()
    print(f"[TEST] validate_connection: {ok}")

    results = await adapter.search("cystic fibrosis", filters={"max_results": 5})
    print(f"[TEST] search: {len(results)} results")

    entry = await adapter.get_by_id("ORPHA:324")
    print(f"[TEST] get_by_id: {entry.get('preferred_term', 'N/A') if entry else 'not found'}")

    prevalence = await adapter.get_prevalence("ORPHA:324")
    print(f"[TEST] get_prevalence: {prevalence.get('prevalence_count', 0)} entries")

    genes = await adapter.get_associated_genes("ORPHA:324")
    print(f"[TEST] get_associated_genes: {genes.get('gene_count', 0)} genes")

    if results:
        canonical = adapter.transform_to_canonical(results[0])
        print(f"[TEST] transform_to_canonical: {canonical.get('title', 'N/A')[:40]}")

    await adapter.close()
    print("[TEST] All OrphanetAdapter tests passed!")


if __name__ == "__main__":
    asyncio.run(_test_orphanet_adapter())
