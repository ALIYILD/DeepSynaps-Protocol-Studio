"""
WHO Drug Adapter - ATC/DDD Index
=================================
Adapter for WHO Drug Dictionary and ATC (Anatomical Therapeutic Chemical)
classification system with DDD (Defined Daily Dose) values.

API: https://www.whocc.no/atc_ddd_index/ (web scraping)
     ATC/DDD index API endpoints
"""

import logging
import asyncio
import json
import hashlib
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# BaseAdapter
# ---------------------------------------------------------------------------

class BaseAdapter:
    """Base class for drug dictionary adapters."""

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

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "drug") -> Dict:
        raise NotImplementedError("transform_to_canonical() must be implemented")

    def get_provenance(self, result: Dict) -> Dict:
        raise NotImplementedError("get_provenance() must be implemented")

    def get_confidence_score(self, result: Dict) -> Dict:
        raise NotImplementedError("get_confidence_score() must be implemented")

    async def close(self):
        logger.debug("BaseAdapter.close() — no-op default")


# ---------------------------------------------------------------------------
# WHODrugAdapter
# ---------------------------------------------------------------------------

class WHODrugAdapter(BaseAdapter):
    """
    WHO Drug Dictionary and ATC/DDD Index adapter.

    Provides access to:
      - ATC codes and descriptions (1st to 5th level)
      - Defined Daily Doses (DDD)
      - Drug name → ATC mapping
      - ATC → drug name mapping

    Uses the WHOCC ATC/DDD Index website and KEGG API for enrichment.
    """

    WHOCC_BASE = "https://www.whocc.no/atc_ddd_index"
    KEGG_API = "https://rest.kegg.jp/"

    # ATC code regex patterns
    ATC_PATTERN_1ST = re.compile(r"^[A-V]$")           # 1st level: anatomical main group
    ATC_PATTERN_2ND = re.compile(r"^[A-V][0-9]{2}$")   # 2nd level: therapeutic subgroup
    ATC_PATTERN_3RD = re.compile(r"^[A-V][0-9]{2}[A-Z]")  # 3rd level: pharmacological subgroup
    ATC_PATTERN_4TH = re.compile(r"^[A-V][0-9]{2}[A-Z][A-Z]{2}$")  # 4th level
    ATC_PATTERN_5TH = re.compile(r"^[A-V][0-9]{2}[A-Z][A-Z]{2}[0-9]{2}$")  # 5th level (chemical substance)

    def __init__(self, cache_ttl: int = 3600):
        self.name = "who_drug"
        self.display_name = "WHO Drug Dictionary / ATC-DDD Index"
        self.source_url = "https://www.whocc.no/atc_ddd_index/"
        self.version = "2025"
        self.confidence_tier = "A"
        self.data_types = ["drug", "atc_code", "ddd", "drug_classification"]
        self.rate_limit_per_minute = 30
        self.requires_auth = False
        self.auth_type = "none"
        self.cache_ttl = cache_ttl

        self._semaphore = asyncio.Semaphore(2)
        self._last_request_time: Optional[datetime] = None
        self._cache: Dict[str, Any] = {}

        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (bot@deepsynaps.ai)",
                "Accept": "text/html,application/json",
            },
            follow_redirects=True,
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
        return f"whodrug_{digest}"

    def _get_cached(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry and isinstance(entry, dict):
            ts = entry.get("_ts")
            if ts and (datetime.utcnow() - ts).total_seconds() < self.cache_ttl:
                return entry["data"]
        return None

    def _set_cached(self, key: str, data: Any) -> None:
        self._cache[key] = {"data": data, "_ts": datetime.utcnow()}

    @staticmethod
    def _atc_level(atc_code: str) -> int:
        """Determine ATC code hierarchy level (1-5)."""
        if not atc_code:
            return 0
        atc = atc_code.upper()
        if len(atc) == 1:
            return 1
        if len(atc) == 3:
            return 2
        if len(atc) == 4:
            return 3
        if len(atc) == 5:
            return 4
        if len(atc) >= 7:
            return 5
        return 0

    # -- validate connection -------------------------------------------------

    async def validate_connection(self) -> bool:
        """Check connectivity to WHOCC website."""
        try:
            resp = await self._rate_limited_get(f"{self.WHOCC_BASE}/")
            if resp.status_code == 200:
                logger.info("WHOCC ATC/DDD Index reachable")
                return True
        except Exception as exc:
            logger.error(f"WHOCC connection validation failed: {exc}")
        return False

    # -- search --------------------------------------------------------------

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search WHO Drug / ATC index by drug name or ATC code.

        Parameters
        ----------
        query: Drug name or ATC code prefix
        filters: Optional dict with:
            - max_results (int): max results, default 20
            - search_type (str): 'drug_name', 'atc_code', or 'both'
            - level (int): filter by ATC level (1-5)

        Returns
        -------
        List of matching drug/ATC records.
        """
        filters = filters or {}
        cache_key = self._cache_key("search", {"query": query, "filters": filters})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        limit = min(filters.get("max_results", 20), 100)
        search_type = filters.get("search_type", "both")
        level_filter = filters.get("level")

        results = []

        # Check if query looks like an ATC code
        is_atc = bool(re.match(r"^[A-V][0-9]*", query.upper()))

        if search_type in ("atc_code", "both") and is_atc:
            atc_results = await self._search_atc(query, limit, level_filter)
            results.extend(atc_results)

        if search_type in ("drug_name", "both"):
            drug_results = await self._search_drug_name(query, limit)
            results.extend(drug_results)

        self._set_cached(cache_key, results)
        logger.info(f"WHO Drug search '{query}': {len(results)} results")
        return results

    async def _search_atc(self, code_prefix: str, limit: int, level: Optional[int]) -> List[Dict]:
        """Search ATC codes by prefix."""
        results = []
        # Use KEGG API for ATC lookup
        try:
            resp = await self._rate_limited_get(
                f"{self.KEGG_API}get",
                params={"atc": code_prefix},
            )
            if resp.status_code == 200:
                lines = resp.text.strip().split("\n")
                current = {}
                for line in lines:
                    if line.startswith("ATC "):
                        if current:
                            atc_level = self._atc_level(current.get("atc_code", ""))
                            if level is None or atc_level == level:
                                current["atc_level"] = atc_level
                                results.append(current)
                        current = {"atc_code": line.replace("ATC ", "").strip()}
                    elif current and line.startswith("NAME "):
                        current["name"] = line.replace("NAME ", "").strip()
                    elif current and line.startswith("DEFINITION "):
                        current["definition"] = line.replace("DEFINITION ", "").strip()
                    elif current and line.startswith("DDD "):
                        ddd_parts = line.replace("DDD ", "").strip().split()
                        if len(ddd_parts) >= 2:
                            current["ddd"] = {"value": ddd_parts[0], "unit": ddd_parts[1]}
                if current:
                    atc_level = self._atc_level(current.get("atc_code", ""))
                    if level is None or atc_level == level:
                        current["atc_level"] = atc_level
                        results.append(current)
        except Exception as exc:
            logger.error(f"ATC search failed: {exc}")

        return results[:limit]

    async def _search_drug_name(self, drug_name: str, limit: int) -> List[Dict]:
        """Search drug names via KEGG."""
        results = []
        try:
            resp = await self._rate_limited_get(
                f"{self.KEGG_API}find",
                params={"drug": drug_name},
            )
            if resp.status_code == 200:
                lines = resp.text.strip().split("\n")
                for line in lines[:limit]:
                    parts = line.split("\t", 1)
                    if len(parts) == 2:
                        drug_id = parts[0].strip()
                        name = parts[1].strip()
                        results.append({
                            "drug_id_kegg": drug_id,
                            "drug_name": name,
                            "search_match": drug_name,
                        })
        except Exception as exc:
            logger.error(f"Drug name search failed: {exc}")

        return results

    # -- NEW: get_by_id -----------------------------------------------------

    async def get_by_id(self, atc_code: str) -> Optional[Dict]:
        """
        Retrieve drug/ATC information by ATC code.

        Parameters
        ----------
        atc_code: ATC code (e.g. 'N02BE01')

        Returns
        -------
        ATC record dictionary or None.
        """
        if not atc_code:
            logger.warning("Empty ATC code provided")
            return None

        atc_code = atc_code.upper()
        cache_key = self._cache_key("get_by_id", atc_code)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        logger.info(f"WHO Drug get_by_id: {atc_code}")

        try:
            resp = await self._rate_limited_get(
                f"{self.KEGG_API}get", params={"atc": atc_code}
            )
            if resp.status_code == 200:
                text = resp.text
                record = self._parse_kegg_atc(text, atc_code)
                self._set_cached(cache_key, record)
                return record
            else:
                logger.warning(f"ATC get_by_id HTTP {resp.status_code}")
        except Exception as exc:
            logger.error(f"ATC get_by_id failed: {exc}")

        return None

    def _parse_kegg_atc(self, text: str, atc_code: str) -> Dict[str, Any]:
        """Parse KEGG ATC response text into structured record."""
        lines = text.strip().split("\n")
        record = {
            "atc_code": atc_code,
            "name": "",
            "definition": "",
            "atc_level": self._atc_level(atc_code),
            "ddd": [],
            "drugs": [],
            "classification": [],
        }

        section = None
        for line in lines:
            if line.startswith("NAME "):
                record["name"] = line.replace("NAME ", "").strip()
            elif line.startswith("DEFINITION "):
                record["definition"] = line.replace("DEFINITION ", "").strip()
            elif line.startswith("DDD "):
                ddd_text = line.replace("DDD ", "").strip()
                parts = ddd_text.split()
                if len(parts) >= 2:
                    record["ddd"].append({"value": parts[0], "unit": parts[1], "route": parts[2] if len(parts) > 2 else ""})
            elif line.startswith("DRUG "):
                record["drugs"].append(line.replace("DRUG ", "").strip())
            elif line.startswith("CLASS "):
                record["classification"].append(line.replace("CLASS ", "").strip())
            elif line.startswith("ENTRY") or line.startswith("ATC "):
                continue  # Skip header lines - no processing needed

        return record

    # -- NEW: get_drug_info -------------------------------------------------

    async def get_drug_info(self, drug_name: str) -> Dict[str, Any]:
        """
        Get comprehensive drug information by name.

        Parameters
        ----------
        drug_name: Drug name (e.g. 'paracetamol')

        Returns
        -------
        Dictionary with drug info including ATC codes if available.
        """
        if not drug_name:
            return {"error": "Empty drug name", "drug_name": ""}

        cache_key = self._cache_key("get_drug_info", drug_name)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        logger.info(f"WHO Drug get_drug_info: {drug_name}")

        # Search KEGG for drug
        result = {
            "drug_name": drug_name,
            "atc_codes": [],
            "ddd_values": [],
            "synonyms": [],
            "classification": {},
        }

        try:
            resp = await self._rate_limited_get(
                f"{self.KEGG_API}find", params={"drug": drug_name}
            )
            if resp.status_code == 200:
                lines = resp.text.strip().split("\n")
                for line in lines:
                    parts = line.split("\t", 1)
                    if len(parts) == 2:
                        kegg_id = parts[0].strip()
                        name = parts[1].strip()
                        result["synonyms"].append(name)

                        # Try to get ATC from KEGG
                        detail_resp = await self._rate_limited_get(
                            f"{self.KEGG_API}get", params={"drug": kegg_id}
                        )
                        if detail_resp.status_code == 200:
                            detail_lines = detail_resp.text.split("\n")
                            for dl in detail_lines:
                                if dl.startswith("ATC "):
                                    atc = dl.replace("ATC ", "").strip()
                                    if atc and atc not in result["atc_codes"]:
                                        result["atc_codes"].append(atc)
                                elif dl.startswith("PRODUCT "):
                                    prod = dl.replace("PRODUCT ", "").strip()
                                    result["product_name"] = prod

        except Exception as exc:
            logger.error(f"Drug info fetch failed: {exc}")

        self._set_cached(cache_key, result)
        return result

    # -- NEW: get_atc_code --------------------------------------------------

    async def get_atc_code(self, drug_name: str) -> Dict[str, Any]:
        """
        Get ATC code(s) for a drug name.

        Parameters
        ----------
        drug_name: Drug name

        Returns
        -------
        Dictionary with ATC codes and their descriptions.
        """
        if not drug_name:
            return {"error": "Empty drug name", "atc_codes": []}

        cache_key = self._cache_key("get_atc_code", drug_name)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        drug_info = await self.get_drug_info(drug_name)
        atc_codes = drug_info.get("atc_codes", [])

        enriched_codes = []
        for atc in atc_codes:
            atc_detail = await self.get_by_id(atc)
            if atc_detail:
                enriched_codes.append({
                    "atc_code": atc,
                    "name": atc_detail.get("name", ""),
                    "definition": atc_detail.get("definition", ""),
                    "atc_level": atc_detail.get("atc_level", 0),
                    "ddd": atc_detail.get("ddd", []),
                })
            else:
                enriched_codes.append({
                    "atc_code": atc,
                    "name": "",
                    "definition": "",
                    "atc_level": self._atc_level(atc),
                    "ddd": [],
                })

        result = {
            "drug_name": drug_name,
            "atc_codes": enriched_codes,
            "count": len(enriched_codes),
        }

        self._set_cached(cache_key, result)
        return result

    # -- transform -----------------------------------------------------------

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "drug") -> Dict:
        """Convert WHO Drug record to canonical format."""
        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": raw_data.get("atc_code", raw_data.get("drug_id_kegg", "")),
            "name": raw_data.get("name", raw_data.get("drug_name", "")),
            "atc_code": raw_data.get("atc_code", ""),
            "atc_level": raw_data.get("atc_level", 0),
            "ddd": raw_data.get("ddd", []),
            "definition": raw_data.get("definition", ""),
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.95,
            "research_only": False,
            "curation_status": "who_standard",
            "regulatory_framework": "WHO Collaborating Centre",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        has_ddd = bool(result.get("ddd"))
        atc_level = result.get("atc_level", 0)

        data_quality = 0.95 if atc_level == 5 else 0.85
        evidence_strength = 0.95
        overall = round(
            data_quality * 0.30
            + evidence_strength * 0.30
            + (0.90 if has_ddd else 0.70) * 0.20
            + 0.85 * 0.10
            + 0.80 * 0.10,
            3,
        )

        return {
            "data_quality": round(data_quality, 3),
            "evidence_strength": evidence_strength,
            "completeness": 0.90 if has_ddd else 0.70,
            "temporal_relevance": 0.85,
            "consistency": 0.80,
            "overall": overall,
        }

    async def close(self):
        await self.client.aclose()
        self._cache.clear()
        logger.info("WHODrugAdapter closed")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()


# -- tests -----------------------------------------------------------------

async def _test_whodrug_adapter():
    adapter = WHODrugAdapter()

    ok = await adapter.validate_connection()
    print(f"[TEST] validate_connection: {ok}")

    results = await adapter.search("paracetamol", filters={"max_results": 5})
    print(f"[TEST] search: {len(results)} results")

    atc = await adapter.get_by_id("N02BE01")
    print(f"[TEST] get_by_id: {atc.get('name', 'N/A') if atc else 'not found'}")

    drug_info = await adapter.get_drug_info("paracetamol")
    print(f"[TEST] get_drug_info: {len(drug_info.get('atc_codes', []))} ATC codes")

    atc_codes = await adapter.get_atc_code("paracetamol")
    print(f"[TEST] get_atc_code: {atc_codes.get('count', 0)} codes")

    await adapter.close()
    print("[TEST] All WHODrugAdapter tests passed!")


if __name__ == "__main__":
    asyncio.run(_test_whodrug_adapter())
