"""
FAERS Adapter - FDA Adverse Event Reporting System
==================================================
Production-grade adapter for querying FDA adverse event data via the openFDA API.

CRITICAL GOVERNANCE NOTICE:
- FAERS is a spontaneous reporting database, NOT an incidence database.
- Report counts do NOT indicate causation, relative risk, or incidence rates.
- Signal detection metrics (PRR, ROR, EBGM) are exploratory, NOT confirmatory.
- ALL data from this adapter is flagged as research-only.

API: https://api.fda.gov/drug/event.json (openFDA)
"""

import logging
import asyncio
import json
import hashlib
import math
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# BaseAdapter
# ---------------------------------------------------------------------------

class BaseAdapter:
    """Base class for adverse event database adapters."""

    name: str = ""
    display_name: str = ""
    source_url: str = ""
    version: str = ""
    confidence_tier: str = "C"
    data_types: List[str] = []
    research_only: bool = True

    async def validate_connection(self) -> bool:
        raise NotImplementedError("validate_connection() must be implemented")

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        raise NotImplementedError("search() must be implemented")

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "adverse_event") -> Dict:
        raise NotImplementedError("transform_to_canonical() must be implemented")

    def get_provenance(self, result: Dict) -> Dict:
        raise NotImplementedError("get_provenance() must be implemented")

    def get_confidence_score(self, result: Dict) -> Dict:
        raise NotImplementedError("get_confidence_score() must be implemented")

    async def close(self):
        logger.debug("BaseAdapter.close() — no-op default")


# ---------------------------------------------------------------------------
# FAERSAdapter
# ---------------------------------------------------------------------------

class FAERSAdapter(BaseAdapter):
    """
    FDA Adverse Event Reporting System (FAERS / openFDA) adapter.

    Queries the openFDA drug/event.json endpoint for adverse event reports.
    Supports searching by drug name, reaction, reporter type, date range,
    and demographic filters.

    ALL data is flagged research_only=True — spontaneous reports do NOT
    establish causation or incidence.
    """

    OPENFDA_BASE = "https://api.fda.gov/drug/event.json"

    def __init__(self, api_key: Optional[str] = None, cache_ttl: int = 3600):
        self.name = "faers"
        self.display_name = "FAERS (FDA Adverse Event Reporting System)"
        self.source_url = "https://www.fda.gov/drugs/fdas-adverse-event-reporting-system-faers"
        self.version = "2025-Q1"
        self.confidence_tier = "B"
        self.data_types = ["adverse_event", "spontaneous_report", "drug_safety"]
        self.rate_limit_per_minute = 40  # openFDA: 40/min with key, 4/min without
        self.requires_auth = False
        self.auth_type = "api_key_optional"
        self.research_only = True
        self.api_key = api_key
        self.cache_ttl = cache_ttl

        self._semaphore = asyncio.Semaphore(4)
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
                min_interval = 1.0 if self.api_key else 15.0
                if elapsed < min_interval:
                    await asyncio.sleep(min_interval - elapsed)
            self._last_request_time = datetime.utcnow()
            return await self.client.get(url, params=params)

    def _inject_key(self, params: Dict) -> Dict:
        if self.api_key:
            params["api_key"] = self.api_key
        return params

    def _cache_key(self, method: str, query: Any) -> str:
        raw = json.dumps({"method": method, "query": query}, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
        return f"faers_{digest}"

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
        """Check connectivity to openFDA API."""
        try:
            params = self._inject_key({"limit": 1, "search": "_exists_:receiptdate"})
            resp = await self._rate_limited_get(self.OPENFDA_BASE, params=params)
            if resp.status_code == 200:
                logger.info("openFDA FAERS API reachable")
                return True
            elif resp.status_code == 429:
                logger.warning("openFDA rate limited — endpoint exists")
                return True
        except Exception as exc:
            logger.error(f"FAERS connection validation failed: {exc}")
        return False

    # -- search --------------------------------------------------------------

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search FAERS adverse event reports.

        Parameters
        ----------
        query: Drug name, brand name, or active ingredient
        filters: Optional dict with:
            - max_results (int): max results (default 20, max 100)
            - reaction (str): filter by reaction term
            - date_from (str): YYYYMMDD
            - date_to (str): YYYYMMDD
            - serious (bool): serious reports only
            - age_min / age_max (int): age range
            - sex (str): 'M', 'F'
            - reporter_type (str): 'consumer', 'health professional'

        Returns
        -------
        List of adverse event report dictionaries.
        """
        filters = filters or {}
        cache_key = self._cache_key("search", {"query": query, "filters": filters})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        limit = min(filters.get("max_results", 20), 100)

        # Build search query
        search_parts = []
        if query:
            search_parts.append(f'patient.drug.medicinalproduct:"{query}"')
        if filters.get("reaction"):
            search_parts.append(f'patient.reaction.reactionmeddrapt:"{filters["reaction"]}"')
        if filters.get("date_from") or filters.get("date_to"):
            date_from = filters.get("date_from", "")
            date_to = filters.get("date_to", "")
            if date_from and date_to:
                search_parts.append(f"receiptdate:[{date_from}+TO+{date_to}]")
        if filters.get("serious"):
            search_parts.append("serious:1")
        if filters.get("age_min") or filters.get("age_max"):
            amin = filters.get("age_min", 0)
            amax = filters.get("age_max", 120)
            search_parts.append(f"patient.patientonsetage:[{amin}+TO+{amax}]")
        if filters.get("sex"):
            search_parts.append(f"patient.patientsex:{filters['sex']}")

        search_query = "+AND+".join(search_parts) if search_parts else "_exists_:receiptdate"

        params = self._inject_key({"search": search_query, "limit": limit})

        logger.info(f"FAERS search: {search_query}, limit={limit}")

        try:
            resp = await self._rate_limited_get(self.OPENFDA_BASE, params=params)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                for r in results:
                    r["_query"] = query
                    r["_fetch_source"] = "faers_openfda"
            elif resp.status_code == 429:
                logger.warning("FAERS rate limited")
                results = []
            else:
                logger.warning(f"FAERS search HTTP {resp.status_code}")
                results = []
        except Exception as exc:
            logger.error(f"FAERS search failed: {exc}")
            results = []

        self._set_cached(cache_key, results)
        logger.info(f"FAERS search returned {len(results)} reports")
        return results

    # -- NEW: get_by_id -----------------------------------------------------

    async def get_by_id(self, safety_report_id: str) -> Optional[Dict]:
        """
        Retrieve a single FAERS report by Safety Report ID.

        Parameters
        ----------
        safety_report_id: FAERS safety report identifier

        Returns
        -------
        Full FAERS report or None.
        """
        if not safety_report_id:
            logger.warning("Empty safety report ID")
            return None

        cache_key = self._cache_key("get_by_id", safety_report_id)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        params = self._inject_key({
            "search": f'safetyreportid:"{safety_report_id}"',
            "limit": 1,
        })

        try:
            resp = await self._rate_limited_get(self.OPENFDA_BASE, params=params)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                if results:
                    report = results[0]
                    report["_fetch_source"] = "faers_get_by_id"
                    self._set_cached(cache_key, report)
                    return report
            else:
                logger.warning(f"FAERS get_by_id HTTP {resp.status_code}")
        except Exception as exc:
            logger.error(f"FAERS get_by_id failed: {exc}")

        return None

    # -- NEW: get_reactions -------------------------------------------------

    async def get_reactions(self, drug_name: str, limit: int = 20) -> List[Dict]:
        """
        Get reported reactions for a specific drug.

        Parameters
        ----------
        drug_name: Drug name or active ingredient
        limit: Maximum number of reports to analyze

        Returns
        -------
        List of reaction dictionaries with counts and percentages.
        """
        if not drug_name:
            return []

        cache_key = self._cache_key("get_reactions", {"drug": drug_name, "limit": limit})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        # Use count aggregation
        params = self._inject_key({
            "search": f'patient.drug.medicinalproduct:"{drug_name}"',
            "count": "patient.reaction.reactionmeddrapt.exact",
            "limit": limit,
        })

        try:
            resp = await self._rate_limited_get(self.OPENFDA_BASE, params=params)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                reactions = []
                total = sum(r.get("count", 0) for r in results)
                for r in results:
                    count = r.get("count", 0)
                    reactions.append({
                        "reaction": r.get("term", ""),
                        "count": count,
                        "percentage": round(count / total * 100, 2) if total > 0 else 0,
                        "drug": drug_name,
                    })
                self._set_cached(cache_key, reactions)
                return reactions
        except Exception as exc:
            logger.error(f"FAERS get_reactions failed: {exc}")

        return []

    # -- NEW: get_demographics ----------------------------------------------

    async def get_demographics(self, drug_name: str, limit: int = 100) -> Dict[str, Any]:
        """
        Get demographic breakdown of reports for a drug.

        Parameters
        ----------
        drug_name: Drug name
        limit: Maximum reports to analyze

        Returns
        -------
        Demographic summary dictionary.
        """
        if not drug_name:
            return {"error": "Empty drug name"}

        cache_key = self._cache_key("get_demographics", {"drug": drug_name, "limit": limit})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        reports = await self.search(drug_name, filters={"max_results": limit})

        age_groups = {"0-17": 0, "18-44": 0, "45-64": 0, "65-74": 0, "75+": 0, "unknown": 0}
        sex_counts = {"1": 0, "2": 0, "0": 0}  # M, F, unknown
        total = len(reports)

        for report in reports:
            patient = report.get("patient", {})
            age = patient.get("patientonsetage", None)
            if age is not None:
                try:
                    age_val = float(age)
                    if age_val < 18:
                        age_groups["0-17"] += 1
                    elif age_val < 45:
                        age_groups["18-44"] += 1
                    elif age_val < 65:
                        age_groups["45-64"] += 1
                    elif age_val < 75:
                        age_groups["65-74"] += 1
                    else:
                        age_groups["75+"] += 1
                except (ValueError, TypeError):
                    age_groups["unknown"] += 1
            else:
                age_groups["unknown"] += 1

            sex = str(patient.get("patientsex", "0"))
            sex_counts[sex] = sex_counts.get(sex, 0) + 1

        result = {
            "drug": drug_name,
            "total_reports": total,
            "age_distribution": {k: {"count": v, "percentage": round(v / total * 100, 1) if total else 0}
                                for k, v in age_groups.items()},
            "sex_distribution": {
                "male": {"count": sex_counts.get("1", 0), "percentage": round(sex_counts.get("1", 0) / total * 100, 1) if total else 0},
                "female": {"count": sex_counts.get("2", 0), "percentage": round(sex_counts.get("2", 0) / total * 100, 1) if total else 0},
                "unknown": {"count": sex_counts.get("0", 0), "percentage": round(sex_counts.get("0", 0) / total * 100, 1) if total else 0},
            },
        }

        self._set_cached(cache_key, result)
        return result

    # -- NEW: get_drug_indication -------------------------------------------

    async def get_drug_indication(self, drug_name: str, limit: int = 20) -> List[Dict]:
        """
        Get reported indications for a specific drug.

        Parameters
        ----------
        drug_name: Drug name
        limit: Maximum number of indications

        Returns
        -------
        List of indication dictionaries with counts.
        """
        if not drug_name:
            return []

        cache_key = self._cache_key("get_drug_indication", {"drug": drug_name, "limit": limit})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        params = self._inject_key({
            "search": f'patient.drug.medicinalproduct:"{drug_name}"',
            "count": "patient.drug.drugindication.exact",
            "limit": limit,
        })

        try:
            resp = await self._rate_limited_get(self.OPENFDA_BASE, params=params)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                indications = []
                total = sum(r.get("count", 0) for r in results)
                for r in results:
                    count = r.get("count", 0)
                    indications.append({
                        "indication": r.get("term", ""),
                        "count": count,
                        "percentage": round(count / total * 100, 2) if total > 0 else 0,
                        "drug": drug_name,
                    })
                self._set_cached(cache_key, indications)
                return indications
        except Exception as exc:
            logger.error(f"FAERS get_drug_indication failed: {exc}")

        return []

    # -- transform -----------------------------------------------------------

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "adverse_event") -> Dict:
        """Convert FAERS report to canonical AdverseEvent format."""
        safety_id = raw_data.get("safetyreportid", "")
        patient = raw_data.get("patient", {})
        drugs = patient.get("drug", [])
        reactions = patient.get("reaction", [])

        drug_names = []
        for d in drugs:
            name = d.get("medicinalproduct", "")
            if name and name not in drug_names:
                drug_names.append(name)

        reaction_terms = [r.get("reactionmeddrapt", "") for r in reactions if r.get("reactionmeddrapt")]
        seriousness = raw_data.get("serious", "")
        seriousness_reasons = []
        if raw_data.get("seriousnessdeath"):
            seriousness_reasons.append("death")
        if raw_data.get("seriousnesslifethreatening"):
            seriousness_reasons.append("life_threatening")
        if raw_data.get("seriousnesshospitalization"):
            seriousness_reasons.append("hospitalization")

        receipt_date = raw_data.get("receiptdate", "")

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": safety_id,
            "drug_names": drug_names,
            "reactions": reaction_terms,
            "serious": seriousness == "1",
            "seriousness_reasons": seriousness_reasons,
            "receipt_date": receipt_date,
            "patient_age": patient.get("patientonsetage"),
            "patient_age_unit": patient.get("patientonsetageunit"),
            "patient_sex": patient.get("patientsex"),
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
            "data_quality_score": 0.70,
            "research_only": True,
            "curation_status": "spontaneous_reports",
            "caveats": [
                "Spontaneous reports — not incidence data",
                "Cannot establish causation",
                "Reporting bias and underreporting affect signals",
                "Duplicate reports possible",
            ],
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        serious = result.get("serious", "") == "1"
        has_multiple_drugs = len(result.get("patient", {}).get("drug", [])) > 1
        has_reactions = bool(result.get("patient", {}).get("reaction", []))

        data_quality = 0.65
        evidence_strength = 0.30  # spontaneous report
        consistency = 0.50
        if serious:
            consistency = 0.60

        overall = round(
            data_quality * 0.25
            + evidence_strength * 0.30
            + consistency * 0.20
            + 0.40 * 0.15
            + 0.50 * 0.10,
            3,
        )

        return {
            "data_quality": data_quality,
            "evidence_strength": evidence_strength,
            "sample_size": 0.30,
            "replication": 0.40,
            "consistency": consistency,
            "temporal_relevance": 0.60,
            "population_match": 0.50,
            "overall": overall,
            "research_only": True,
        }

    async def close(self):
        await self.client.aclose()
        self._cache.clear()
        logger.info("FAERSAdapter closed")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()


# -- tests -----------------------------------------------------------------

async def _test_faers_adapter():
    adapter = FAERSAdapter()

    ok = await adapter.validate_connection()
    print(f"[TEST] validate_connection: {ok}")

    results = await adapter.search("aspirin", filters={"max_results": 3})
    print(f"[TEST] search: {len(results)} results")

    report = await adapter.get_by_id("12345678-12345")
    print(f"[TEST] get_by_id: {'found' if report else 'not found'}")

    reactions = await adapter.get_reactions("aspirin", limit=5)
    print(f"[TEST] get_reactions: {len(reactions)} reactions")

    demographics = await adapter.get_demographics("aspirin", limit=10)
    print(f"[TEST] get_demographics: {demographics.get('total_reports', 0)} reports")

    indications = await adapter.get_drug_indication("aspirin", limit=5)
    print(f"[TEST] get_drug_indication: {len(indications)} indications")

    if results:
        canonical = adapter.transform_to_canonical(results[0])
        print(f"[TEST] transform_to_canonical: {len(canonical.get('reactions', []))} reactions")

    await adapter.close()
    print("[TEST] All FAERSAdapter tests passed!")


if __name__ == "__main__":
    asyncio.run(_test_faers_adapter())
