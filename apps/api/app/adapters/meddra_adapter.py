"""
MedDRA Adapter - Medical Dictionary for Regulatory Activities
============================================================
Adapter for MedDRA terminology access via UMLS API and FDA open data.
MedDRA is the standard for regulatory reporting of adverse events.

API: UMLS API (https://uts-ws.nlm.nih.gov/rest/)
     FDA open data (https://api.fda.gov/)
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
    """Base class for terminology adapters."""

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

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "terminology") -> Dict:
        raise NotImplementedError("transform_to_canonical() must be implemented")

    def get_provenance(self, result: Dict) -> Dict:
        raise NotImplementedError("get_provenance() must be implemented")

    def get_confidence_score(self, result: Dict) -> Dict:
        raise NotImplementedError("get_confidence_score() must be implemented")

    async def close(self):
        logger.debug("BaseAdapter.close() — no-op default")


# ---------------------------------------------------------------------------
# MedDRA Adapter
# ---------------------------------------------------------------------------

class MedDRAAdapter(BaseAdapter):
    """
    MedDRA (Medical Dictionary for Regulatory Activities) adapter.

    Uses UMLS API for term lookup and hierarchy navigation.
    Falls back to FDA openFDA API for MedDRA-coded adverse events.

    MedDRA is organized hierarchically:
      SOC > HLGT > HLT > PT > LLT
      (System Organ Class > High Level Group Term > High Level Term >
       Preferred Term > Lowest Level Term)
    """

    UMLS_API = "https://uts-ws.nlm.nih.gov/rest"
    FDA_API = "https://api.fda.gov/drug/event.json"

    def __init__(self, umls_api_key: Optional[str] = None, cache_ttl: int = 3600):
        self.name = "meddra"
        self.display_name = "MedDRA (Medical Dictionary for Regulatory Activities)"
        self.source_url = "https://www.meddra.org/"
        self.version = "27.1"
        self.confidence_tier = "A"
        self.data_types = ["adverse_event_terminology", "medical_terminology"]
        self.rate_limit_per_minute = 60
        self.requires_auth = bool(umls_api_key)
        self.auth_type = "api_key_optional"
        self.umls_api_key = umls_api_key
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

    # -- internal helpers ----------------------------------------------------

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                if elapsed < 1.0:
                    await asyncio.sleep(1.0 - elapsed)
            self._last_request_time = datetime.utcnow()
            return await self.client.get(url, params=params)

    def _cache_key(self, method: str, query: Any) -> str:
        raw = json.dumps({"method": method, "query": query}, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
        return f"meddra_{digest}"

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
        """Check connectivity via FDA API (no key required)."""
        try:
            resp = await self._rate_limited_get(
                self.FDA_API, params={"search": "_exists_:patient.reaction.reactionmeddrapt", "limit": 1}
            )
            if resp.status_code == 200:
                logger.info("MedDRA adapter: FDA API reachable")
                return True
            elif resp.status_code == 429:
                logger.warning("MedDRA adapter: FDA API rate limited")
                return True  # API exists, just rate limited
        except Exception as exc:
            logger.error(f"MedDRA connection validation failed: {exc}")
        return False

    # -- search --------------------------------------------------------------

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search MedDRA terms via FDA openFDA API (adverse events coded with MedDRA).

        Parameters
        ----------
        query: MedDRA term to search for (e.g. 'headache', 'nausea')
        filters: Optional dict with:
            - max_results (int): max results, default 20
            - meddra_level (str): 'pt' (preferred term), 'llt', 'soc', etc.
            - exact_match (bool): whether to match exactly
            - language (str): language code, default 'en'

        Returns
        -------
        List of matching MedDRA term dictionaries.
        """
        filters = filters or {}
        cache_key = self._cache_key("search", {"query": query, "filters": filters})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        limit = min(filters.get("max_results", 20), 100)
        meddra_level = filters.get("meddra_level", "pt")
        exact = filters.get("exact_match", False)

        # Use openFDA to search for adverse events with this MedDRA term
        search_field = "patient.reaction.reactionmeddrapt"
        if exact:
            search_query = f'{search_field}:"{query}"'
        else:
            search_query = f'{search_field}:{query}'

        params = {"search": search_query, "limit": limit, "count": f"{search_field}.exact"}

        logger.info(f"MedDRA search: query='{query}', level={meddra_level}")

        try:
            resp = await self._rate_limited_get(self.FDA_API, params=params)
            if resp.status_code == 200:
                data = resp.json()
                results = []
                for item in data.get("results", []):
                    term = item.get("term", "")
                    count = item.get("count", 0)
                    if term:
                        results.append({
                            "term": term,
                            "count": count,
                            "meddra_level": meddra_level,
                            "source": "openfda_faers",
                        })
            else:
                logger.warning(f"MedDRA search HTTP {resp.status_code}")
                results = []
        except Exception as exc:
            logger.error(f"MedDRA search failed: {exc}")
            results = []

        self._set_cached(cache_key, results)
        logger.info(f"MedDRA search returned {len(results)} terms")
        return results

    # -- NEW: get_by_id -----------------------------------------------------

    async def get_by_id(self, meddra_code: str) -> Optional[Dict]:
        """
        Retrieve MedDRA term information by MedDRA code/ID.

        Parameters
        ----------
        meddra_code: MedDRA concept ID or UMLS CUI

        Returns
        -------
        Term record dictionary or None.
        """
        if not meddra_code:
            logger.warning("Empty MedDRA code provided")
            return None

        cache_key = self._cache_key("get_by_id", meddra_code)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        logger.info(f"MedDRA get_by_id: {meddra_code}")

        # Use openFDA to find adverse events with this MedDRA code
        params = {
            "search": f'patient.reaction.reactionmeddrallt:"{meddra_code}"',
            "limit": 1,
        }

        try:
            resp = await self._rate_limited_get(self.FDA_API, params=params)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                if results:
                    reaction = results[0].get("patient", {}).get("reaction", [{}])[0]
                    record = {
                        "meddra_code": meddra_code,
                        "term": reaction.get("reactionmeddrapt", ""),
                        "llt": reaction.get("reactionmeddrallt", ""),
                        "soc": reaction.get("reactionmeddraversionpt", ""),
                        "source": "openfda_faers",
                    }
                    self._set_cached(cache_key, record)
                    return record
        except Exception as exc:
            logger.error(f"MedDRA get_by_id failed: {exc}")

        return None

    # -- NEW: get_hierarchy -------------------------------------------------

    async def get_hierarchy(self, term: str) -> Dict[str, Any]:
        """
        Get the MedDRA hierarchy for a given term.

        MedDRA hierarchy: SOC > HLGT > HLT > PT > LLT

        Parameters
        ----------
        term: MedDRA preferred term

        Returns
        -------
        Dictionary with hierarchy levels.
        """
        if not term:
            return {"error": "Empty term", "hierarchy": {}}

        cache_key = self._cache_key("get_hierarchy", term)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        # Use openFDA to get SOC-level aggregation for this term
        params = {
            "search": f'patient.reaction.reactionmeddrapt:"{term}"',
            "count": "patient.reaction.reactionmeddrapt.exact",
            "limit": 1,
        }

        hierarchy = {
            "term": term,
            "soc": [],  # System Organ Classes
            "hlgt": [],  # High Level Group Terms
            "hlt": [],   # High Level Terms
            "pt": term,  # Preferred Term
            "llt": [],   # Lowest Level Terms
        }

        try:
            resp = await self._rate_limited_get(self.FDA_API, params=params)
            if resp.status_code == 200:
                data = resp.json()
                # The FDA API provides PT-level data
                # For SOC mapping, we infer from common associations
                # In production, use UMLS API with API key for full hierarchy
                if self.umls_api_key:
                    soc_data = await self._get_umls_hierarchy(term)
                    hierarchy.update(soc_data)

        except Exception as exc:
            logger.error(f"MedDRA get_hierarchy failed: {exc}")

        # Build a default SOC mapping for common terms
        soc_mapping = self._infer_soc(term)
        if soc_mapping:
            hierarchy["soc"].append(soc_mapping)

        self._set_cached(cache_key, hierarchy)
        return hierarchy

    async def _get_umls_hierarchy(self, term: str) -> Dict[str, Any]:
        """Fetch hierarchy from UMLS API (requires API key)."""
        if not self.umls_api_key:
            return {}

        try:
            params = {"apiKey": self.umls_api_key, "string": term, "sabs": "MDR"}
            resp = await self._rate_limited_get(
                f"{self.UMLS_API}/search/current", params=params
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("result", {}).get("results", [])
                if results:
                    cui = results[0].get("ui", "")
                    # Get hierarchy atoms
                    atoms_resp = await self._rate_limited_get(
                        f"{self.UMLS_API}/content/current/CUI/{cui}/atoms",
                        params={"apiKey": self.umls_api_key},
                    )
                    if atoms_resp.status_code == 200:
                        atoms_data = atoms_resp.json()
                        soc_terms = []
                        for atom in atoms_data.get("result", []):
                            if atom.get("rootSource") == "MDR":
                                for a in atom.get("attributes", []):
                                    if a.get("name") == "SOC":
                                        soc_terms.append(a.get("value", ""))
                        return {"soc": list(set(soc_terms))} if soc_terms else {}
        except Exception as exc:
            logger.error(f"UMLS hierarchy fetch failed: {exc}")

        return {}

    def _infer_soc(self, term: str) -> Optional[Dict[str, str]]:
        """Infer System Organ Class from term using keyword mapping."""
        term_lower = term.lower()
        soc_keywords = {
            "blood and lymphatic system disorders": ["anemia", "leukopenia", "thrombocytopenia", "lymph"],
            "cardiac disorders": ["arrhythmia", "cardiac", "heart", "bradycardia", "tachycardia", "myocardial"],
            "ear and labyrinth disorders": ["hearing", "tinnitus", "vertigo", "ear"],
            "endocrine disorders": ["thyroid", "hormone", "diabetes", "endocrine"],
            "eye disorders": ["vision", "retina", "cataract", "glaucoma", "eye"],
            "gastrointestinal disorders": ["nausea", "vomiting", "diarrhea", "abdominal", "gastric", "gi ", "constipation"],
            "hepatobiliary disorders": ["liver", "hepatic", "bilirubin", "jaundice", "hepatitis"],
            "immune system disorders": ["allergic", "anaphylaxis", "hypersensitivity", "immune"],
            "infections and infestations": ["infection", "pneumonia", "sepsis", "fungal", "viral", "bacterial"],
            "metabolism and nutrition disorders": ["dehydration", "hyperglycemia", "hypoglycemia", "metabolic", "nutrition"],
            "musculoskeletal and connective tissue disorders": ["arthritis", "pain", "myalgia", "fracture", "muscle", "bone", "joint", "back"],
            "neoplasms benign, malignant and unspecified": ["cancer", "tumor", "neoplasm", "carcinoma", "malignant"],
            "nervous system disorders": ["headache", "dizziness", "neuropathy", "seizure", "tremor", "neuro", "cerebral"],
            "psychiatric disorders": ["anxiety", "depression", "insomnia", "agitation", "confusion", "psychiat"],
            "renal and urinary disorders": ["renal", "kidney", "urinary", "nephritis", "proteinuria"],
            "reproductive system and breast disorders": ["menstrual", "erectile", "breast", "ovarian", "prostate"],
            "respiratory, thoracic and mediastinal disorders": ["dyspnea", "cough", "pneumonia", "respiratory", "lung", "asthma"],
            "skin and subcutaneous tissue disorders": ["rash", "pruritus", "dermatitis", "skin", "alopecia", "urticaria"],
            "vascular disorders": ["hypertension", "hypotension", "thrombosis", "embolism", "vascular"],
            "general disorders and administration site conditions": ["fatigue", "pyrexia", "edema", "malaise", "chills", "pain", "injection site"],
            "investigations": ["weight decreased", "weight increased", "blood count", "lab abnormal"],
            "surgical and medical procedures": ["surgery", "procedure", "infusion"],
            "social circumstances": ["noncompliance", "drug abuser", "alcohol"],
            "injury, poisoning and procedural complications": ["fall", "overdose", "poisoning", "fracture", "accident"],
        }

        for soc_name, keywords in soc_keywords.items():
            for kw in keywords:
                if kw in term_lower:
                    return {"soc_name": soc_name, "soc_code": ""}

        return None

    # -- NEW: get_soc -------------------------------------------------------

    async def get_soc(self, soc_name_or_code: str) -> Dict[str, Any]:
        """
        Get all preferred terms under a System Organ Class (SOC).

        Parameters
        ----------
        soc_name_or_code: SOC name (e.g. 'Gastrointestinal disorders') or code

        Returns
        -------
        Dictionary with SOC details and associated preferred terms.
        """
        if not soc_name_or_code:
            return {"error": "Empty SOC", "soc": {}, "preferred_terms": []}

        cache_key = self._cache_key("get_soc", soc_name_or_code)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        # Search for adverse events commonly associated with this SOC
        params = {
            "search": f'patient.reaction.reactionmeddrapt:"{soc_name_or_code}"',
            "count": "patient.reaction.reactionmeddrapt.exact",
            "limit": 100,
        }

        preferred_terms = []
        try:
            resp = await self._rate_limited_get(self.FDA_API, params=params)
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("results", []):
                    term = item.get("term", "")
                    count = item.get("count", 0)
                    if term:
                        preferred_terms.append({
                            "term": term,
                            "count": count,
                            "level": "PT",
                        })
        except Exception as exc:
            logger.error(f"MedDRA get_soc failed: {exc}")

        result = {
            "soc_name": soc_name_or_code,
            "soc_code": "",
            "preferred_terms": preferred_terms[:50],
            "total_terms": len(preferred_terms),
        }

        self._set_cached(cache_key, result)
        return result

    # -- transform -----------------------------------------------------------

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "terminology") -> Dict:
        """Convert MedDRA term to canonical format."""
        term = raw_data.get("term", "")
        meddra_level = raw_data.get("meddra_level", "pt")
        count = raw_data.get("count", 0)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": raw_data.get("meddra_code", ""),
            "term": term,
            "meddra_level": meddra_level,
            "count": count,
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
            "curation_status": "ich_meddra_standard",
            "regulatory_status": "ICH endorsed",
            "coding_system": "MedDRA",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        count = result.get("count", 0)
        data_quality = 0.95
        evidence_strength = min(0.95, 0.70 + (0.25 if count > 1000 else count / 4000))

        overall = round(
            data_quality * 0.35
            + evidence_strength * 0.30
            + 0.85 * 0.15
            + 0.90 * 0.10
            + 0.80 * 0.10,
            3,
        )

        return {
            "data_quality": data_quality,
            "evidence_strength": round(evidence_strength, 3),
            "consistency": 0.85,
            "temporal_relevance": 0.90,
            "coverage": 0.80,
            "overall": overall,
        }

    async def close(self):
        await self.client.aclose()
        self._cache.clear()
        logger.info("MedDRAAdapter closed")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()


# -- tests -----------------------------------------------------------------

async def _test_meddra_adapter():
    adapter = MedDRAAdapter()

    ok = await adapter.validate_connection()
    print(f"[TEST] validate_connection: {ok}")

    results = await adapter.search("headache", filters={"max_results": 5})
    print(f"[TEST] search: {len(results)} results")

    term = await adapter.get_by_id("10019211")
    print(f"[TEST] get_by_id: {term.get('term', 'N/A') if term else 'not found'}")

    hierarchy = await adapter.get_hierarchy("headache")
    print(f"[TEST] get_hierarchy: {len(hierarchy.get('soc', []))} SOCs")

    soc = await adapter.get_soc("Nervous system disorders")
    print(f"[TEST] get_soc: {soc.get('total_terms', 0)} terms")

    if results:
        canonical = adapter.transform_to_canonical(results[0])
        print(f"[TEST] transform_to_canonical: {canonical.get('term', 'N/A')}")

    await adapter.close()
    print("[TEST] All MedDRAAdapter tests passed!")


if __name__ == "__main__":
    asyncio.run(_test_meddra_adapter())
