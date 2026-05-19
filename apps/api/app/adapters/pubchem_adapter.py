"""
PubChem Adapter for DeepSynaps Protocol Studio

Provides access to NCBI PubChem for chemical compound data,
bioactivity information, substance records, and molecular properties.

API Documentation: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
"""

import asyncio
import json
import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class BaseAdapter(ABC):
    """Base class for all knowledge adapters."""

    def __init__(self) -> None:
        self._cache: Dict[str, Any] = {}
        self._cache_ttl: int = 3600
        self._client: Optional[httpx.AsyncClient] = None
        self._last_request_time: float = 0.0
        self._min_interval: float = 0.34  # 3 req/sec per NCBI guidelines

    @abstractmethod
    async def search(self, query: str, filters: dict = None) -> dict:
        pass

    @abstractmethod
    async def get_by_id(self, identifier: str) -> dict:
        pass

    @abstractmethod
    async def get_metadata(self) -> dict:
        pass

    @property
    @abstractmethod
    def data_types(self) -> List[str]:
        pass

    @property
    @abstractmethod
    def supports_fulltext(self) -> bool:
        pass

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=30.0,
                headers={
                    "User-Agent": "DeepSynaps-ProtocolStudio/1.0 (Bioinformatics Knowledge Layer)",
                    "Accept": "application/json",
                },
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _rate_limited_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        client = await self._get_client()
        response = await client.request(method, url, **kwargs)
        self._last_request_time = time.monotonic()
        return response

    def _get_from_cache(self, key: str) -> Optional[Any]:
        if key in self._cache:
            timestamp, data = self._cache[key]
            if time.monotonic() - timestamp < self._cache_ttl:
                logger.debug("Cache hit for key: %s", key)
                return data
            del self._cache[key]
        return None

    def _set_cache(self, key: str, data: Any) -> None:
        self._cache[key] = (time.monotonic(), data)
        logger.debug("Cached response for key: %s", key)


class PubchemAdapter(BaseAdapter):
    """
    Adapter for NCBI PubChem database.

    Provides access to chemical compound data, bioactivity information,
    substance records, and molecular properties.
    """

    BASE_URL: str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 1800

    @property
    def data_types(self) -> List[str]:
        return ["chemical", "compound", "bioactivity", "substance"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search PubChem for compounds by name, formula, or identifier.

        Args:
            query: Compound name, SMILES, InChIKey, or formula.
            filters: Optional filters (compound_type, max_results).

        Returns:
            Dictionary with compound records and properties.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        max_results = filters.get("limit", 10)

        try:
            if query.startswith("InChIKey=") or (len(query) == 27 and query.isalnum()):
                result = await self._search_by_inchikey(query, max_results)
            elif query.isdigit():
                result = await self._get_by_cid(int(query), max_results)
            else:
                result = await self._search_by_name(query, max_results)

            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching PubChem: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "PubChem"}
        except Exception as e:
            logger.error("Unexpected error searching PubChem: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "PubChem"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve compound details by PubChem CID.

        Args:
            identifier: PubChem CID (e.g., '2244' for aspirin).

        Returns:
            Dictionary with compound properties, synonyms, and bioactivity.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            cid = int(identifier)
            result = await self._get_by_cid(cid, 1)
            self._set_cache(cache_key, result)
            return result

        except ValueError:
            return {"identifier": identifier, "error": "Invalid CID", "source": "PubChem"}
        except httpx.HTTPError as e:
            logger.error("HTTP error fetching PubChem %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "PubChem"}
        except Exception as e:
            logger.error("Unexpected error fetching PubChem %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "PubChem"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "PubChem Adapter",
            "version": "1.0.0",
            "source": "NCBI PubChem",
            "source_url": "https://pubchem.ncbi.nlm.nih.gov",
            "description": (
                "Chemical database of molecules with structures, "
                "properties, and bioactivities"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.BASE_URL,
            "rate_limit": "5 requests/second (NCBI guidelines)",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _search_by_name(self, name: str, max_results: int) -> dict:
        """Search compounds by name."""
        url = f"{self.BASE_URL}/compound/name/{name}/cids/JSON"
        params: Dict[str, Any] = {"MaxRecords": max_results}
        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        cids = data.get("IdentifierList", {}).get("CID", [])
        compounds = []
        for cid in cids[:max_results]:
            compound = await self._fetch_compound_properties(cid)
            if compound:
                compounds.append(compound)

        return {
            "results": compounds,
            "total": len(cids),
            "query": name,
            "source": "PubChem",
        }

    async def _search_by_inchikey(self, inchikey: str, max_results: int) -> dict:
        """Search compounds by InChIKey."""
        url = f"{self.BASE_URL}/compound/inchikey/{inchikey}/cids/JSON"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()
        data = response.json()

        cids = data.get("IdentifierList", {}).get("CID", [])
        compounds = []
        for cid in cids[:max_results]:
            compound = await self._fetch_compound_properties(cid)
            if compound:
                compounds.append(compound)

        return {
            "results": compounds,
            "total": len(cids),
            "query": inchikey,
            "source": "PubChem",
        }

    async def _get_by_cid(self, cid: int, max_results: int) -> dict:
        """Get compound by CID."""
        compound = await self._fetch_compound_properties(cid)
        synonyms = await self._fetch_synonyms(cid)
        bioassays = await self._fetch_bioassay_summary(cid)

        return {
            "results": [compound] if compound else [],
            "total": 1,
            "query": str(cid),
            "source": "PubChem",
            "synonyms": synonyms[:20],
            "bioassay_summary": bioassays,
        }

    async def _fetch_compound_properties(self, cid: int) -> Optional[dict]:
        """Fetch compound properties."""
        url = f"{self.BASE_URL}/compound/cid/{cid}/property/JSON"
        response = await self._rate_limited_request("GET", url)
        if response.status_code != 200:
            return None

        data = response.json()
        props = data.get("PropertyTable", {}).get("Properties", [])
        if not props:
            return None

        prop = props[0]
        return {
            "cid": prop.get("CID", cid),
            "iupac_name": prop.get("IUPACName", ""),
            "molecular_formula": prop.get("MolecularFormula", ""),
            "molecular_weight": prop.get("MolecularWeight", ""),
            "canonical_smiles": prop.get("CanonicalSMILES", ""),
            "isomeric_smiles": prop.get("IsomericSMILES", ""),
            "inchi": prop.get("InChI", ""),
            "inchikey": prop.get("InChIKey", ""),
            "xlogp": prop.get("XLogP", ""),
            "exact_mass": prop.get("ExactMass", ""),
            "monoisotopic_mass": prop.get("MonoisotopicMass", ""),
            "tpsa": prop.get("TPSA", ""),
            "complexity": prop.get("Complexity", ""),
            "charge": prop.get("Charge", ""),
            "h_bond_donor": prop.get("HBondDonorCount", ""),
            "h_bond_acceptor": prop.get("HBondAcceptorCount", ""),
            "rotatable_bond": prop.get("RotatableBondCount", ""),
            "heavy_atom": prop.get("HeavyAtomCount", ""),
            "isotope_atom": prop.get("IsotopeAtomCount", ""),
            "atom_stereo": prop.get("AtomStereoCount", ""),
            "defined_atom_stereo": prop.get("DefinedAtomStereoCount", ""),
            "undefined_atom_stereo": prop.get("UndefinedAtomStereoCount", ""),
            "bond_stereo": prop.get("BondStereoCount", ""),
            "defined_bond_stereo": prop.get("DefinedBondStereoCount", ""),
            "undefined_bond_stereo": prop.get("UndefinedBondStereoCount", ""),
            "covalent_unit": prop.get("CovalentUnitCount", ""),
        }

    async def _fetch_synonyms(self, cid: int) -> List[str]:
        """Fetch synonyms for a compound."""
        url = f"{self.BASE_URL}/compound/cid/{cid}/synonyms/JSON"
        response = await self._rate_limited_request("GET", url)
        if response.status_code == 200:
            data = response.json()
            return data.get("InformationList", {}).get("Information", [{}])[0].get("Synonym", [])
        return []

    async def _fetch_bioassay_summary(self, cid: int) -> dict:
        """Fetch bioassay summary for a compound."""
        url = f"{self.BASE_URL}/compound/cid/{cid}/assaysummary/JSON"
        response = await self._rate_limited_request("GET", url)
        if response.status_code == 200:
            data = response.json()
            assays = data.get("Table", {}).get("Row", [])
            return {
                "assay_count": len(assays),
                "assays": [
                    {
                        "aid": assay.get("Cell", [{}])[0].get("value", "") if assay.get("Cell") else "",
                    }
                    for assay in assays[:10]
                ],
            }
        return {"assay_count": 0, "assays": []}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = PubchemAdapter()
        print("=== PubchemAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("aspirin")
        print(f"Search 'aspirin': {result.get('total', 0)} results\n")

        result2 = await adapter.get_by_id("2244")
        print(f"Get CID 2244: {json.dumps(result2, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
