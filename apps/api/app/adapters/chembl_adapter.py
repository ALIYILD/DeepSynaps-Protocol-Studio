"""
ChEMBL Adapter for DeepSynaps Protocol Studio

Provides access to EMBL-EBI ChEMBL for bioactivity data,
chemical compounds, drug targets, assays, and drug mechanisms.

API Documentation: https://www.ebi.ac.uk/chembl/api/data/docs
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
        self._min_interval: float = 0.34  # ~3 req/sec

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


class ChemblAdapter(BaseAdapter):
    """
    Adapter for ChEMBL (EMBL-EBI).

    Provides access to bioactivity data, chemical compounds,
    drug targets, assays, and drug mechanisms of action.
    """

    BASE_URL: str = "https://www.ebi.ac.uk/chembl/api/data"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 1800

    @property
    def data_types(self) -> List[str]:
        return ["bioactivity", "compound", "target", "assay", "drug_mechanism"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search ChEMBL for molecules, targets, or bioactivities.

        Args:
            query: SMILES, InChIKey, or compound name.
            filters: Optional filters (entity_type, limit).

        Returns:
            Dictionary with molecules, targets, or bioactivities.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        entity_type = filters.get("entity_type", "molecule")
        limit = filters.get("limit", 20)

        try:
            if entity_type == "molecule":
                result = await self._search_molecules(query, limit)
            elif entity_type == "target":
                result = await self._search_targets(query, limit)
            elif entity_type == "bioactivity":
                result = await self._search_bioactivities(query, limit)
            elif entity_type == "assay":
                result = await self._search_assays(query, limit)
            else:
                result = await self._search_molecules(query, limit)

            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching ChEMBL: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "ChEMBL"}
        except Exception as e:
            logger.error("Unexpected error searching ChEMBL: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "ChEMBL"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve molecule, target, or assay by ChEMBL ID.

        Args:
            identifier: ChEMBL ID (e.g., 'CHEMBL25').

        Returns:
            Dictionary with full record details.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            if identifier.upper().startswith("CHEMBL"):
                result = await self._get_molecule(identifier)
            else:
                result = await self._get_target(identifier)

            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching ChEMBL %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "ChEMBL"}
        except Exception as e:
            logger.error("Unexpected error fetching ChEMBL %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "ChEMBL"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "ChEMBL Adapter",
            "version": "1.0.0",
            "source": "ChEMBL (EMBL-EBI)",
            "source_url": "https://www.ebi.ac.uk/chembl",
            "description": (
                "Database of bioactive drug-like small molecules "
                "with bioactivity, target, and assay data"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.BASE_URL,
            "rate_limit": "3 requests/second",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _search_molecules(self, query: str, limit: int) -> dict:
        """Search molecules by name, SMILES, or InChIKey."""
        url = f"{self.BASE_URL}/molecule.json"
        params: Dict[str, Any] = {
            "limit": limit,
            "offset": 0,
        }
        if query.startswith("InChIKey=") or (len(query) == 27 and query.replace("-", "").isalnum()):
            params["molecule_structures__standard_inchi_key__iexact"] = query
        elif query.upper().startswith("SMILES:"):
            params["molecule_structures__canonical_smiles__flexmatch"] = query.replace("SMILES:", "")
        elif query.isdigit():
            params["molecule_chembl_id"] = f"CHEMBL{query}"
        else:
            params["pref_name__icontains"] = query

        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        molecules = data.get("molecules", [])
        parsed = []
        for mol in molecules[:limit]:
            parsed.append({
                "molecule_chembl_id": mol.get("molecule_chembl_id", ""),
                "pref_name": mol.get("pref_name", ""),
                "molecule_type": mol.get("molecule_type", ""),
                "max_phase": mol.get("max_phase", 0),
                "therapeutic_flag": mol.get("therapeutic_flag", False),
                "dosed_ingredient": mol.get("dosed_ingredient", False),
                "structure_type": mol.get("structure_type", ""),
                "inchi_key": mol.get("molecule_structures", {}).get("standard_inchi_key", ""),
                "canonical_smiles": mol.get("molecule_structures", {}).get("canonical_smiles", ""),
                "molecular_formula": mol.get("molecule_properties", {}).get("full_molformula", ""),
                "molecular_weight": mol.get("molecule_properties", {}).get("full_mwt", ""),
                "alogp": mol.get("molecule_properties", {}).get("alogp", ""),
                "psa": mol.get("molecule_properties", {}).get("psa", ""),
                "hba": mol.get("molecule_properties", {}).get("hba", ""),
                "hbd": mol.get("molecule_properties", {}).get("hbd", ""),
                "rtb": mol.get("molecule_properties", {}).get("rtb", ""),
                "ro5_violations": mol.get("molecule_properties", {}).get("num_ro5_violations", ""),
                "synonyms": mol.get("molecule_synonyms", [])[:10],
            })

        return {
            "results": parsed,
            "total": data.get("page_meta", {}).get("total_count", len(parsed)),
            "query": query,
            "entity_type": "molecule",
            "source": "ChEMBL",
        }

    async def _search_targets(self, query: str, limit: int) -> dict:
        """Search targets by name or type."""
        url = f"{self.BASE_URL}/target.json"
        params: Dict[str, Any] = {
            "target_pref_name__icontains": query,
            "limit": limit,
            "offset": 0,
        }

        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        targets = data.get("targets", [])
        parsed = []
        for tgt in targets[:limit]:
            parsed.append({
                "target_chembl_id": tgt.get("target_chembl_id", ""),
                "pref_name": tgt.get("pref_name", ""),
                "target_type": tgt.get("target_type", ""),
                "organism": tgt.get("organism", ""),
                "tax_id": tgt.get("tax_id", 0),
                "species_group_flag": tgt.get("species_group_flag", False),
                "target_components": [
                    {
                        "accession": comp.get("accession", ""),
                        "component_type": comp.get("component_type", ""),
                        "component_description": comp.get("component_description", ""),
                        "component_id": comp.get("component_id", ""),
                    }
                    for comp in tgt.get("target_components", [])[:5]
                ],
            })

        return {
            "results": parsed,
            "total": data.get("page_meta", {}).get("total_count", len(parsed)),
            "query": query,
            "entity_type": "target",
            "source": "ChEMBL",
        }

    async def _search_bioactivities(self, query: str, limit: int) -> dict:
        """Search bioactivities by molecule or target."""
        url = f"{self.BASE_URL}/activity.json"
        params: Dict[str, Any] = {
            "limit": limit,
            "offset": 0,
        }
        if query.upper().startswith("CHEMBL"):
            params["molecule_chembl_id"] = query.upper()
        else:
            params["target_chembl_id"] = query.upper()

        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        activities = data.get("activities", [])
        parsed = []
        for act in activities[:limit]:
            parsed.append({
                "activity_id": act.get("activity_id", 0),
                "molecule_chembl_id": act.get("molecule_chembl_id", ""),
                "target_chembl_id": act.get("target_chembl_id", ""),
                "assay_chembl_id": act.get("assay_chembl_id", ""),
                "standard_type": act.get("standard_type", ""),
                "standard_value": act.get("standard_value", ""),
                "standard_units": act.get("standard_units", ""),
                "pchembl_value": act.get("pchembl_value", ""),
                "activity_comment": act.get("activity_comment", ""),
                "uo_units": act.get("uo_units", ""),
                "bao_endpoint": act.get("bao_endpoint", ""),
                "published_type": act.get("published_type", ""),
                "published_value": act.get("published_value", ""),
                "published_units": act.get("published_units", ""),
            })

        return {
            "results": parsed,
            "total": data.get("page_meta", {}).get("total_count", len(parsed)),
            "query": query,
            "entity_type": "bioactivity",
            "source": "ChEMBL",
        }

    async def _search_assays(self, query: str, limit: int) -> dict:
        """Search assays by description or ID."""
        url = f"{self.BASE_URL}/assay.json"
        params: Dict[str, Any] = {
            "limit": limit,
            "offset": 0,
        }
        if query.upper().startswith("CHEMBL"):
            params["assay_chembl_id"] = query.upper()
        else:
            params["description__icontains"] = query

        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        assays = data.get("assays", [])
        parsed = []
        for assay in assays[:limit]:
            parsed.append({
                "assay_chembl_id": assay.get("assay_chembl_id", ""),
                "description": assay.get("description", ""),
                "assay_type": assay.get("assay_type", ""),
                "assay_organism": assay.get("assay_organism", ""),
                "assay_tax_id": assay.get("assay_tax_id", ""),
                "assay_cell_type": assay.get("assay_cell_type", ""),
                "assay_subcellular_fraction": assay.get("assay_subcellular_fraction", ""),
                "tissue": assay.get("tissue", ""),
                "bao_format": assay.get("bao_format", ""),
                "confidence_score": assay.get("confidence_score", 0),
            })

        return {
            "results": parsed,
            "total": data.get("page_meta", {}).get("total_count", len(parsed)),
            "query": query,
            "entity_type": "assay",
            "source": "ChEMBL",
        }

    async def _get_molecule(self, chembl_id: str) -> dict:
        """Get full molecule record."""
        url = f"{self.BASE_URL}/molecule/{chembl_id}.json"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()
        mol = response.json()

        return {
            "identifier": chembl_id,
            "source": "ChEMBL",
            "record_type": "molecule",
            "pref_name": mol.get("pref_name", ""),
            "molecule_type": mol.get("molecule_type", ""),
            "max_phase": mol.get("max_phase", 0),
            "therapeutic_flag": mol.get("therapeutic_flag", False),
            "dosed_ingredient": mol.get("dosed_ingredient", False),
            "first_approval": mol.get("first_approval", ""),
            "oral": mol.get("oral", False),
            "parenteral": mol.get("parenteral", False),
            "topical": mol.get("topical", False),
            "black_box_warning": mol.get("black_box_warning", False),
            "indication_class": mol.get("indication_class", ""),
            "withdrawn_flag": mol.get("withdrawn_flag", False),
            "withdrawn_reason": mol.get("withdrawn_reason", ""),
            "withdrawn_country": mol.get("withdrawn_country", ""),
            "withdrawn_year": mol.get("withdrawn_year", ""),
            "inchi_key": mol.get("molecule_structures", {}).get("standard_inchi_key", ""),
            "canonical_smiles": mol.get("molecule_structures", {}).get("canonical_smiles", ""),
            "molecular_formula": mol.get("molecule_properties", {}).get("full_molformula", ""),
            "molecular_weight": mol.get("molecule_properties", {}).get("full_mwt", ""),
            "molecule_properties": mol.get("molecule_properties", {}),
            "drug_mechanisms": mol.get("drug_mechanisms", []),
            "drug_warnings": mol.get("drug_warnings", []),
        }

    async def _get_target(self, chembl_id: str) -> dict:
        """Get full target record."""
        url = f"{self.BASE_URL}/target/{chembl_id}.json"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()
        tgt = response.json()

        return {
            "identifier": chembl_id,
            "source": "ChEMBL",
            "record_type": "target",
            "pref_name": tgt.get("pref_name", ""),
            "target_type": tgt.get("target_type", ""),
            "organism": tgt.get("organism", ""),
            "tax_id": tgt.get("tax_id", 0),
            "components": tgt.get("target_components", []),
            "cross_references": tgt.get("cross_references", []),
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = ChemblAdapter()
        print("=== ChemblAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("aspirin")
        print(f"Search 'aspirin': {result.get('total', 0)} results\n")

        result2 = await adapter.get_by_id("CHEMBL25")
        print(f"Get CHEMBL25: {json.dumps(result2, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
