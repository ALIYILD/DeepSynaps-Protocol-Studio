"""
KEGG Adapter for DeepSynaps Protocol Studio

Provides access to Kyoto Encyclopedia of Genes and Genomes (KEGG)
for pathways, genes, compounds, diseases, and reaction data.

API Documentation: https://www.kegg.jp/kegg/rest/keggapi.html
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
        self._min_interval: float = 0.34  # 3 req/sec

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


class KeggAdapter(BaseAdapter):
    """
    Adapter for KEGG (Kyoto Encyclopedia of Genes and Genomes).

    Provides access to pathways, genes, compounds, diseases,
    and reactions via the KEGG REST API.
    """

    BASE_URL: str = "https://rest.kegg.jp"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 3600

    @property
    def data_types(self) -> List[str]:
        return ["pathway", "gene", "compound", "disease", "reaction"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search KEGG for pathways, genes, compounds, or diseases.

        Args:
            query: Search string (e.g., 'glycolysis', 'BRCA1', 'C00031').
            filters: Optional filters (database: pathway/gene/compound/disease).

        Returns:
            Dictionary with matching entries across KEGG databases.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        databases = filters.get("databases", ["pathway", "gene", "compound", "disease"])
        if isinstance(databases, str):
            databases = [databases]

        try:
            all_results = []
            for db in databases:
                db_results = await self._search_database(query, db)
                all_results.append({"database": db, "entries": db_results})

            total = sum(len(r["entries"]) for r in all_results)
            result = {
                "results": all_results,
                "total": total,
                "query": query,
                "source": "KEGG",
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching KEGG: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "KEGG"}
        except Exception as e:
            logger.error("Unexpected error searching KEGG: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "KEGG"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve KEGG entry by ID.

        Args:
            identifier: KEGG ID (e.g., 'hsa00010', 'hsa:672', 'C00031', 'H00001').

        Returns:
            Dictionary with entry details including names, definitions,
            pathways, and cross-references.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            result = await self._fetch_entry(identifier)
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching KEGG %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "KEGG"}
        except Exception as e:
            logger.error("Unexpected error fetching KEGG %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "KEGG"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "KEGG Adapter",
            "version": "1.0.0",
            "source": "Kyoto Encyclopedia of Genes and Genomes",
            "source_url": "https://www.kegg.jp",
            "description": (
                "Database resource for understanding biological systems "
                "including pathways, genes, compounds, and diseases"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.BASE_URL,
            "rate_limit": "3 requests/second",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _search_database(self, query: str, database: str) -> List[dict]:
        """Search a specific KEGG database."""
        url = f"{self.BASE_URL}/find/{database}/{query}"
        response = await self._rate_limited_request("GET", url)

        if response.status_code == 404:
            return []
        response.raise_for_status()

        text = response.text
        results = []
        for line in text.strip().split("\n")[:20]:
            parts = line.split("\t", 1)
            if len(parts) >= 2:
                results.append({
                    "id": parts[0].strip(),
                    "name": parts[1].strip(),
                    "database": database,
                })
        return results

    async def _fetch_entry(self, identifier: str) -> dict:
        """Fetch a KEGG entry and parse the flat file format."""
        url = f"{self.BASE_URL}/get/{identifier}"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()

        text = response.text
        fields = self._parse_flatfile(text)

        result = {
            "identifier": identifier,
            "source": "KEGG",
            "entry": fields.get("ENTRY", ""),
            "name": fields.get("NAME", ""),
            "definition": fields.get("DEFINITION", ""),
            "description": fields.get("DESCRIPTION", ""),
            "pathway": self._parse_list_field(fields.get("PATHWAY", "")),
            "module": self._parse_list_field(fields.get("MODULE", "")),
            "disease": self._parse_list_field(fields.get("DISEASE", "")),
            "drug": self._parse_list_field(fields.get("DRUG", "")),
            "genes": self._parse_list_field(fields.get("GENE", "")),
            "compound": self._parse_list_field(fields.get("COMPOUND", "")),
            "reaction": self._parse_list_field(fields.get("REACTION", "")),
            "orthology": self._parse_list_field(fields.get("ORTHOLOGY", "")),
            "class": self._parse_list_field(fields.get("CLASS", "")),
            "bracket": self._parse_list_field(fields.get("BRACKET", "")),
            "db_links": self._parse_dblinks(fields.get("DBLINKS", "")),
            "reference": self._parse_references(fields.get("REFERENCE", "")),
            "raw_fields": fields,
        }
        return result

    @staticmethod
    def _parse_flatfile(text: str) -> dict:
        """Parse KEGG flat file format into a dictionary."""
        fields: Dict[str, str] = {}
        current_field = ""
        current_value = ""

        for line in text.split("\n"):
            if not line.strip():
                continue
            if not line.startswith(" "):
                if current_field:
                    fields[current_field] = fields.get(current_field, "") + current_value + "\n"
                tag = line[:12].strip()
                rest = line[12:]
                current_field = tag
                current_value = rest
            else:
                current_value += "\n" + line.strip()

        if current_field:
            fields[current_field] = fields.get(current_field, "") + current_value

        return {k: v.strip() for k, v in fields.items()}

    @staticmethod
    def _parse_list_field(value: str) -> List[dict]:
        """Parse a multi-line list field into structured entries."""
        if not value:
            return []
        results = []
        for line in value.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            parts = line.split(None, 1)
            if len(parts) >= 2:
                results.append({"id": parts[0], "name": parts[1]})
            else:
                results.append({"id": parts[0], "name": ""})
        return results[:20]

    @staticmethod
    def _parse_dblinks(value: str) -> dict:
        """Parse DBLINKS field into structured cross-references."""
        if not value:
            return {}
        links: Dict[str, Any] = {}
        current_key = ""
        for line in value.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            if ":" in line:
                key, val = line.split(":", 1)
                key = key.strip()
                val = val.strip()
                if key in links:
                    if isinstance(links[key], list):
                        links[key].append(val)
                    else:
                        links[key] = [links[key], val]
                else:
                    links[key] = val
            elif current_key:
                if isinstance(links.get(current_key), list):
                    links[current_key].append(line)
                elif current_key in links:
                    links[current_key] = str(links[current_key]) + " " + line
        return links

    @staticmethod
    def _parse_references(value: str) -> List[dict]:
        """Parse REFERENCE fields."""
        if not value:
            return []
        refs = []
        current_ref: Dict[str, str] = {}
        for line in value.strip().split("\n"):
            line = line.strip()
            if line.startswith("REFERENCE"):
                if current_ref:
                    refs.append(current_ref)
                current_ref = {"number": line.replace("REFERENCE", "").strip()}
            elif line.startswith("AUTHORS"):
                current_ref["authors"] = line.replace("AUTHORS", "").strip()
            elif line.startswith("TITLE"):
                current_ref["title"] = line.replace("TITLE", "").strip()
            elif line.startswith("JOURNAL"):
                current_ref["journal"] = line.replace("JOURNAL", "").strip()
            elif line.startswith("DOI"):
                current_ref["doi"] = line.replace("DOI", "").strip()
        if current_ref:
            refs.append(current_ref)
        return refs[:10]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = KeggAdapter()
        print("=== KeggAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("glycolysis")
        print(f"Search 'glycolysis': {result.get('total', 0)} results\n")

        entry = await adapter.get_by_id("hsa00010")
        print(f"Get hsa00010: {json.dumps(entry, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
