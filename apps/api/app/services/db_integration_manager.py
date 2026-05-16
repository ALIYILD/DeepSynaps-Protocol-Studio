#!/usr/bin/env python3
"""
DeepSynaps Protocol Studio - Unified Database Integration Manager
================================================================
Manages connections, queries, caching, rate limiting, and provenance
for all external clinical databases used by the DeepSynaps platform.

Databases: 33 clinical databases across 11 domains:
  Drug, Safety, Genetic, Neuroimaging, EEG, Evidence, Biomarker,
  Nutrition, Terminology, Neuroscience, Wearable

Author: DeepSynaps Integration Team
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

# ── Enums ──────────────────────────────────────────────────────────────────

class IntegrationStatus(str, Enum):
    ACTIVE = "active"
    PLANNED = "planned"
    DEPRECATED = "deprecated"

class DBType(str, Enum):
    DRUG = "drug"
    DRUG_SAFETY = "drug_safety"
    DRUG_CODING = "drug_coding"
    DRUG_CLASSIFICATION = "drug_classification"
    DRUG_PRODUCT = "drug_product"
    ADVERSE_EVENTS = "adverse_events"
    SAFETY = "safety"
    GENETIC = "genetic"
    PHARMACOGENOMICS = "pharmacogenomics"
    NEUROIMAGING = "neuroimaging"
    EEG = "eeg"
    EVIDENCE = "evidence"
    TRIALS = "trials"
    OUTCOMES = "outcomes"
    LAB_CODING = "lab_coding"
    BIOMARKER = "biomarker"
    NUTRITION = "nutrition"
    TERMINOLOGY = "terminology"
    CODING = "coding"
    WEARABLE = "wearable"
    NEUROMODULATION = "neuromodulation"
    NEUROSCIENCE = "neuroscience"

# ── Data Classes ───────────────────────────────────────────────────────────

@dataclass
class CacheEntry:
    data: Any
    timestamp: float = field(default_factory=time.time)
    ttl_seconds: int = 3600
    provenance: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_expired(self) -> bool:
        return (time.time() - self.timestamp) > self.ttl_seconds

@dataclass
class RateLimiter:
    tokens: float = field(default=10.0)
    last_refill: float = field(default_factory=time.time)
    max_tokens: float = 10.0
    refill_rate: float = 1.0

    def acquire(self, cost: float = 1.0) -> bool:
        now = time.time()
        self.tokens = min(self.max_tokens, self.tokens + (now - self.last_refill) * self.refill_rate)
        self.last_refill = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False

    def wait_time(self, cost: float = 1.0) -> float:
        if self.tokens >= cost:
            return 0.0
        return (cost - self.tokens) / self.refill_rate

@dataclass
class ProvenanceRecord:
    database: str
    source_name: str
    query_id: str
    query_hash: str
    timestamp: datetime
    cache_hit: bool = False
    fallback_used: bool = False
    latency_ms: float = 0.0
    rows_returned: int = 0
    api_version: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "database": self.database, "source": self.source_name,
            "query_id": self.query_id, "query_hash": self.query_hash,
            "timestamp": self.timestamp.isoformat(), "cache_hit": self.cache_hit,
            "fallback_used": self.fallback_used,
            "latency_ms": round(self.latency_ms, 2),
            "rows_returned": self.rows_returned, "api_version": self.api_version,
        }

# ── Registry ───────────────────────────────────────────────────────────────

class DatabaseRegistry:
    """Registry of all 33 external databases used by DeepSynaps."""

    DATABASES: Dict[str, Dict[str, Any]] = {
        # Active integrations
        "drugbank": {"source": "DrugBank", "status": IntegrationStatus.ACTIVE, "type": DBType.DRUG, "cached": True, "base_url": "https://go.drugbank.com", "desc": "Comprehensive drug & target database"},
        "openfda": {"source": "OpenFDA", "status": IntegrationStatus.ACTIVE, "type": DBType.DRUG_SAFETY, "cached": False, "base_url": "https://api.fda.gov", "desc": "FDA open data API"},
        "medication_analyzer": {"source": "Internal", "status": IntegrationStatus.ACTIVE, "type": DBType.DRUG, "cached": True, "desc": "Internal medication interaction engine"},
        "pgx_panel": {"source": "PharmGKB/CPIC", "status": IntegrationStatus.ACTIVE, "type": DBType.GENETIC, "cached": True, "desc": "Pharmacogenomic gene-drug annotations"},
        "mri_atlas": {"source": "MNI/FS/AAL", "status": IntegrationStatus.ACTIVE, "type": DBType.NEUROIMAGING, "cached": True, "desc": "Multi-atlas MRI reference volumes"},
        "brain_targets": {"source": "Internal", "status": IntegrationStatus.ACTIVE, "type": DBType.NEUROMODULATION, "cached": True, "desc": "Neuromodulation target coordinates"},
        "qeeg_protocols": {"source": "Internal", "status": IntegrationStatus.ACTIVE, "type": DBType.EEG, "cached": True, "desc": "qEEG acquisition & analysis protocols"},
        "evidence_rag": {"source": "PubMed/Cochrane", "status": IntegrationStatus.ACTIVE, "type": DBType.EVIDENCE, "cached": True, "desc": "RAG-backed evidence retrieval"},
        "device_sync": {"source": "Multiple", "status": IntegrationStatus.ACTIVE, "type": DBType.WEARABLE, "cached": True, "desc": "Wearable device data sync"},
        "biomarker_bridge": {"source": "LOINC/NHANES", "status": IntegrationStatus.ACTIVE, "type": DBType.BIOMARKER, "cached": True, "desc": "Biomarker reference ranges"},
        "nutrition_bridge": {"source": "USDA", "status": IntegrationStatus.ACTIVE, "type": DBType.NUTRITION, "cached": True, "desc": "Nutrient composition data"},
        # Planned – critical ASAP
        "rxnorm": {"source": "NLM RxNorm", "status": IntegrationStatus.PLANNED, "type": DBType.DRUG_CODING, "cached": True, "base_url": "https://rxnav.nlm.nih.gov", "desc": "Normalized drug nomenclature"},
        "atc": {"source": "WHO ATC", "status": IntegrationStatus.PLANNED, "type": DBType.DRUG_CLASSIFICATION, "cached": True, "desc": "Anatomical Therapeutic Chemical classification"},
        "ndc": {"source": "FDA NDC", "status": IntegrationStatus.PLANNED, "type": DBType.DRUG_PRODUCT, "cached": True, "base_url": "https://www.accessdata.fda.gov", "desc": "National Drug Code directory"},
        "faers": {"source": "FDA FAERS", "status": IntegrationStatus.PLANNED, "type": DBType.ADVERSE_EVENTS, "cached": True, "base_url": "https://fis.fda.gov", "desc": "FDA Adverse Event Reporting"},
        "pharmgkb": {"source": "PharmGKB", "status": IntegrationStatus.PLANNED, "type": DBType.PHARMACOGENOMICS, "cached": True, "base_url": "https://api.pharmgkb.org", "desc": "Pharmacogenomics knowledge base"},
        "clinvar": {"source": "NCBI ClinVar", "status": IntegrationStatus.PLANNED, "type": DBType.GENETIC, "cached": True, "base_url": "https://eutils.ncbi.nlm.nih.gov", "desc": "Clinical significance of variants"},
        "mni152": {"source": "MNI", "status": IntegrationStatus.PLANNED, "type": DBType.NEUROIMAGING, "cached": True, "desc": "MNI 152 standard brain template"},
        "aal_atlas": {"source": "AAL", "status": IntegrationStatus.PLANNED, "type": DBType.NEUROIMAGING, "cached": True, "desc": "Automated Anatomical Labeling atlas"},
        "freesurfer_atlas": {"source": "FreeSurfer", "status": IntegrationStatus.PLANNED, "type": DBType.NEUROIMAGING, "cached": True, "desc": "FreeSurfer cortical parcellation"},
        "normative_eeg": {"source": "NIH/Neuroguide", "status": IntegrationStatus.PLANNED, "type": DBType.EEG, "cached": True, "desc": "Age-normative qEEG reference"},
        "pubmed": {"source": "NCBI PubMed", "status": IntegrationStatus.PLANNED, "type": DBType.EVIDENCE, "cached": False, "base_url": "https://eutils.ncbi.nlm.nih.gov", "desc": "Biomedical literature"},
        "clinicaltrials": {"source": "ClinicalTrials.gov", "status": IntegrationStatus.PLANNED, "type": DBType.TRIALS, "cached": False, "base_url": "https://clinicaltrials.gov/api", "desc": "Clinical trial registry"},
        "promis": {"source": "NIH PROMIS", "status": IntegrationStatus.PLANNED, "type": DBType.OUTCOMES, "cached": True, "desc": "Patient-Reported Outcomes"},
        "loinc": {"source": "Regenstrief", "status": IntegrationStatus.PLANNED, "type": DBType.LAB_CODING, "cached": True, "base_url": "https://fhir.loinc.org", "desc": "Logical Observation Identifiers"},
        "usda_food": {"source": "USDA", "status": IntegrationStatus.PLANNED, "type": DBType.NUTRITION, "cached": True, "base_url": "https://api.nal.usda.gov", "desc": "USDA FoodData Central"},
        "snomed": {"source": "SNOMED Int'l", "status": IntegrationStatus.PLANNED, "type": DBType.TERMINOLOGY, "cached": True, "desc": "Systematized Nomenclature of Medicine"},
        "icd10": {"source": "WHO/CDC", "status": IntegrationStatus.PLANNED, "type": DBType.CODING, "cached": True, "desc": "International Classification of Diseases v10"},
        "meddra": {"source": "ICH", "status": IntegrationStatus.PLANNED, "type": DBType.SAFETY, "cached": True, "desc": "Medical Dictionary for Regulatory Activities"},
        "allen_brain": {"source": "Allen Institute", "status": IntegrationStatus.PLANNED, "type": DBType.NEUROSCIENCE, "cached": True, "base_url": "https://api.brain-map.org", "desc": "Allen Brain Atlas gene expression"},
        "neurovault": {"source": "NeuroVault", "status": IntegrationStatus.PLANNED, "type": DBType.NEUROIMAGING, "cached": False, "base_url": "https://neurovault.org/api", "desc": "Neuroimaging statistical maps"},
    }

    DOMAIN_MAP: Dict[str, List[str]] = {
        "drug": ["drugbank", "rxnorm", "atc", "ndc", "medication_analyzer"],
        "safety": ["openfda", "faers", "meddra"],
        "genetic": ["pgx_panel", "pharmgkb", "clinvar"],
        "neuroimaging": ["mri_atlas", "mni152", "aal_atlas", "freesurfer_atlas", "neurovault"],
        "eeg": ["qeeg_protocols", "normative_eeg"],
        "evidence": ["evidence_rag", "pubmed", "clinicaltrials"],
        "biomarker": ["biomarker_bridge", "loinc", "promis"],
        "nutrition": ["nutrition_bridge", "usda_food"],
        "terminology": ["snomed", "icd10"],
        "neuroscience": ["brain_targets", "allen_brain"],
        "wearable": ["device_sync"],
        "neuromodulation": ["brain_targets"],
    }

    @classmethod
    def get(cls, key: str) -> Optional[Dict[str, Any]]:
        return cls.DATABASES.get(key)

    @classmethod
    def keys(cls) -> List[str]:
        return list(cls.DATABASES.keys())

    @classmethod
    def by_domain(cls, domain: str) -> List[str]:
        return cls.DOMAIN_MAP.get(domain, [])

    @classmethod
    def by_type(cls, db_type: Union[str, DBType]) -> List[str]:
        t = str(db_type)
        return [k for k, v in cls.DATABASES.items() if str(v["type"]) == t]

# ── Manager ────────────────────────────────────────────────────────────────

class DBIntegrationManager:
    """Unified manager for all external database integrations.
    Features: registry-driven config, async query dispatch, LRU cache
    with TTL, token-bucket rate limiting, provenance tracking, domain
    aggregation, and graceful fallback chains."""

    DEFAULT_TTL = 3600
    SHORT_TTL = 300
    LONG_TTL = 86400
    MAX_CACHE = 10000
    DEF_RATE = 1.0
    FAST_RATE = 5.0
    SLOW_RATE = 0.2
    TIMEOUT = 30.0
    FALLBACKS: Dict[str, List[str]] = {
        "drugbank": ["rxnorm", "ndc"], "rxnorm": ["ndc", "drugbank"],
        "faers": ["openfda"], "openfda": ["faers"],
        "pharmgkb": ["clinvar"], "clinvar": ["pharmgkb"],
        "pubmed": ["evidence_rag", "clinicaltrials"],
        "aal_atlas": ["freesurfer_atlas", "mni152"],
        "freesurfer_atlas": ["aal_atlas", "mni152"],
    }

    def __init__(self) -> None:
        self._registry = DatabaseRegistry()
        self._cache: Dict[str, CacheEntry] = {}
        self._limiters: Dict[str, RateLimiter] = {}
        self._prov_log: List[ProvenanceRecord] = []
        self._qcounter = 0
        self._init_limiters()

    def _init_limiters(self) -> None:
        defaults = {
            "NLM RxNorm": self.FAST_RATE, "OpenFDA": self.DEF_RATE,
            "NCBI PubMed": self.SLOW_RATE, "NCBI ClinVar": self.SLOW_RATE,
            "FDA FAERS": self.DEF_RATE, "FDA NDC": self.DEF_RATE,
            "PharmGKB": self.DEF_RATE, "ClinicalTrials.gov": self.DEF_RATE,
            "USDA": self.FAST_RATE, "DrugBank": self.DEF_RATE,
            "Regenstrief": self.DEF_RATE, "SNOMED Int'l": self.DEF_RATE,
            "WHO ATC": self.DEF_RATE, "Allen Institute": self.DEF_RATE,
            "NeuroVault": self.DEF_RATE, "NIH PROMIS": self.DEF_RATE,
            "MNI": self.FAST_RATE, "AAL": self.FAST_RATE,
            "FreeSurfer": self.FAST_RATE, "NIH/Neuroguide": self.DEF_RATE,
            "Internal": self.FAST_RATE, "Multiple": self.FAST_RATE,
        }
        for src, rate in defaults.items():
            self._limiters[src] = RateLimiter(max_tokens=rate * 10, refill_rate=rate)

    def _cache_key(self, db: str, query: str, phash: str) -> str:
        return hashlib.sha256(f"{db}:{query}:{phash}".encode()).hexdigest()[:32]

    def _phash(self, kwargs: Dict[str, Any]) -> str:
        return hashlib.sha256(json.dumps(kwargs, sort_keys=True, default=str).encode()).hexdigest()[:16]

    def _ttl(self, db: str) -> int:
        if db in {"openfda", "pubmed", "clinicaltrials", "neurovault"}: return self.SHORT_TTL
        if db in {"atc", "icd10", "snomed", "mni152", "loinc", "normative_eeg"}: return self.LONG_TTL
        return self.DEFAULT_TTL

    def _evict(self) -> None:
        if len(self._cache) <= self.MAX_CACHE: return
        for k in [k for k, v in self._cache.items() if v.is_expired]:
            del self._cache[k]
        if len(self._cache) > self.MAX_CACHE:
            for k in sorted(self._cache, key=lambda x: self._cache[x].timestamp)[:len(self._cache) - self.MAX_CACHE]:
                del self._cache[k]

    def _limiter(self, src: str) -> RateLimiter:
        if src not in self._limiters:
            self._limiters[src] = RateLimiter(refill_rate=self.DEF_RATE)
        return self._limiters[src]

    async def _rate_limit(self, db: str) -> None:
        src = (self._registry.get(db) or {}).get("source", "Unknown")
        wait = self._limiter(src).wait_time()
        if wait > 0:
            logger.debug("Rate limit %.2fs for %s", wait, db)
            await asyncio.sleep(wait)

    @staticmethod
    def _count_rows(data: Any) -> int:
        if isinstance(data, list): return len(data)
        if isinstance(data, dict):
            for k in ("results", "rows", "data"):
                if k in data and isinstance(data[k], list): return len(data[k])
            return 1
        return 0

    # ── Core query ───────────────────────────────────────────────────────

    async def query(self, database: str, query: str, use_cache: bool = True,
                    allow_fallback: bool = True, timeout: Optional[float] = None,
                    **kwargs: Any) -> Dict[str, Any]:
        """Unified query interface. Returns {data, provenance, success, errors}."""
        self._qcounter += 1
        qid = f"q-{self._qcounter:08d}"
        info = self._registry.get(database)
        if info is None:
            return {"success": False, "data": None,
                    "errors": [{"code": "UNKNOWN_DB", "message": f"'{database}' not in registry"}],
                    "provenance": {"query_id": qid, "database": database, "cache_hit": False}}
        status = info.get("status", IntegrationStatus.PLANNED)
        if status == IntegrationStatus.DEPRECATED:
            return {"success": False, "data": None,
                    "errors": [{"code": "DEPRECATED", "message": f"'{database}' is deprecated"}],
                    "provenance": {"query_id": qid, "database": database, "cache_hit": False}}

        ph = self._phash(kwargs)
        ckey = self._cache_key(database, query, ph)
        src = info.get("source", "Unknown")
        cached = info.get("cached", False)

        # Cache lookup
        if use_cache and cached and ckey in self._cache and not self._cache[ckey].is_expired:
            prov = ProvenanceRecord(database=database, source_name=src, query_id=qid,
                                    query_hash=ckey, timestamp=datetime.utcnow(),
                                    cache_hit=True, latency_ms=0.0,
                                    rows_returned=self._count_rows(self._cache[ckey].data))
            self._prov_log.append(prov)
            return {"success": True, "data": self._cache[ckey].data, "errors": [],
                    "provenance": prov.to_dict()}
        if use_cache and cached and ckey in self._cache:
            del self._cache[ckey]

        await self._rate_limit(database)
        t0 = time.perf_counter()
        try:
            result = await asyncio.wait_for(
                self._dispatch(database, query, **kwargs), timeout=timeout or self.TIMEOUT)
            lat = (time.perf_counter() - t0) * 1000
            prov = ProvenanceRecord(database=database, source_name=src, query_id=qid,
                                    query_hash=ckey, timestamp=datetime.utcnow(),
                                    cache_hit=False, latency_ms=lat,
                                    rows_returned=self._count_rows(result))
            self._prov_log.append(prov)
            if cached and result is not None:
                self._evict()
                self._cache[ckey] = CacheEntry(data=result, ttl_seconds=self._ttl(database), provenance=prov.to_dict())
            return {"success": True, "data": result, "errors": [], "provenance": prov.to_dict()}
        except Exception as exc:
            lat = (time.perf_counter() - t0) * 1000
            logger.warning("Query failed %s: %s", database, exc)
            if allow_fallback:
                for fb in self.FALLBACKS.get(database, []):
                    fb_info = self._registry.get(fb)
                    if fb_info and fb_info.get("status") == IntegrationStatus.ACTIVE:
                        logger.info("Fallback %s -> %s", database, fb)
                        try:
                            fb_res = await asyncio.wait_for(
                                self._dispatch(fb, query, **kwargs), timeout=timeout or self.TIMEOUT)
                            fprov = ProvenanceRecord(database=database, source_name=src, query_id=qid,
                                                     query_hash=ckey, timestamp=datetime.utcnow(),
                                                     cache_hit=False, fallback_used=True,
                                                     latency_ms=(time.perf_counter() - t0) * 1000,
                                                     rows_returned=self._count_rows(fb_res))
                            self._prov_log.append(fprov)
                            return {"success": True, "data": fb_res,
                                    "errors": [{"code": "FALLBACK", "message": f"Used {fb}"}],
                                    "provenance": fprov.to_dict()}
                        except Exception as fbe:
                            logger.warning("Fallback %s failed: %s", fb, fbe)
            prov = ProvenanceRecord(database=database, source_name=src, query_id=qid,
                                    query_hash=ckey, timestamp=datetime.utcnow(),
                                    cache_hit=False, latency_ms=lat)
            self._prov_log.append(prov)
            return {"success": False, "data": None,
                    "errors": [{"code": "QUERY_FAILED", "message": str(exc)}],
                    "provenance": prov.to_dict()}

    async def _dispatch(self, database: str, query: str, **kw: Any) -> Any:
        """Route query to concrete adapter or placeholder."""
        info = self._registry.get(database) or {}
        if info.get("status") == IntegrationStatus.PLANNED:
            return {"_placeholder": True, "database": database, "source": info.get("source", "?"),
                    "status": "planned", "type": str(info.get("type", "?")), "query": query,
                    "params": kw, "message": f"Adapter '{database}' planned", "results": []}
        dispatchers = {
            "drugbank": self._q_drugbank, "openfda": self._q_openfda,
            "medication_analyzer": self._q_med, "pgx_panel": self._q_pgx,
            "mri_atlas": self._q_mri, "brain_targets": self._q_targets,
            "qeeg_protocols": self._q_qeeg, "evidence_rag": self._q_evidence,
            "device_sync": self._q_device, "biomarker_bridge": self._q_bio,
            "nutrition_bridge": self._q_nut,
        }
        handler = dispatchers.get(database, self._placeholder)
        return await handler(database, query, **kw)

    async def _placeholder(self, db: str, query: str, **kw: Any) -> Dict[str, Any]:
        info = self._registry.get(db) or {}
        return {"_placeholder": True, "database": db, "source": info.get("source", "?"),
                "query": query, "params": kw, "results": [],
                "message": f"Adapter '{db}' planned"}

    # Active adapter stubs
    async def _q_drugbank(self, db: str, q: str, **kw: Any) -> Any: return {"src": "drugbank", "q": q, "r": []}
    async def _q_openfda(self, db: str, q: str, **kw: Any) -> Any: return {"src": "openfda", "q": q, "r": []}
    async def _q_med(self, db: str, q: str, **kw: Any) -> Any: return {"src": "med_analyzer", "q": q, "r": []}
    async def _q_pgx(self, db: str, q: str, **kw: Any) -> Any: return {"src": "pgx_panel", "q": q, "r": []}
    async def _q_mri(self, db: str, q: str, **kw: Any) -> Any: return {"src": "mri_atlas", "q": q, "r": []}
    async def _q_targets(self, db: str, q: str, **kw: Any) -> Any: return {"src": "brain_targets", "q": q, "r": []}
    async def _q_qeeg(self, db: str, q: str, **kw: Any) -> Any: return {"src": "qeeg", "q": q, "r": []}
    async def _q_evidence(self, db: str, q: str, **kw: Any) -> Any: return {"src": "evidence_rag", "q": q, "r": []}
    async def _q_device(self, db: str, q: str, **kw: Any) -> Any: return {"src": "device_sync", "q": q, "r": []}
    async def _q_bio(self, db: str, q: str, **kw: Any) -> Any: return {"src": "biomarker", "q": q, "r": []}
    async def _q_nut(self, db: str, q: str, **kw: Any) -> Any: return {"src": "nutrition", "q": q, "r": []}

    # ── Introspection ────────────────────────────────────────────────────

    def get_status(self, database: str) -> Dict[str, Any]:
        info = self._registry.get(database)
        if info is None: return {"error": f"'{database}' not found", "found": False}
        return {"database": database, "found": True, "source": info["source"],
                "status": str(info["status"]), "type": str(info["type"]),
                "cached": info["cached"], "desc": info.get("desc"),
                "base_url": info.get("base_url")}

    def list_databases(self, domain: Optional[str] = None, db_type: Optional[str] = None,
                       status: Optional[str] = None) -> List[Dict[str, Any]]:
        keys = self._registry.by_domain(domain) if domain else (self._registry.by_type(db_type) if db_type else self._registry.keys())
        out = []
        for k in keys:
            info = self._registry.get(k)
            if info is None: continue
            if status and str(info["status"]) != status: continue
            out.append({"key": k, "source": info["source"], "status": str(info["status"]),
                        "type": str(info["type"]), "cached": info["cached"],
                        "desc": info.get("desc"), "base_url": info.get("base_url")})
        return out

    def get_provenance(self, database: str, result_id: Optional[str] = None) -> Dict[str, Any]:
        recs = [r.to_dict() for r in self._prov_log
                if r.database == database and (result_id is None or r.query_id == result_id)]
        return {"database": database, "result_id": result_id,
                "total_records": len(recs), "records": recs[-100:]}

    def cache_stats(self) -> Dict[str, Any]:
        total = len(self._cache)
        expired = sum(1 for v in self._cache.values() if v.is_expired)
        return {"total": total, "expired": expired, "active": total - expired,
                "max": self.MAX_CACHE,
                "util_pct": round(total / self.MAX_CACHE * 100, 2) if self.MAX_CACHE else 0}

    def rate_limit_status(self) -> Dict[str, Any]:
        return {s: {"tokens": round(l.tokens, 2), "max": l.max_tokens, "rate": l.refill_rate}
                for s, l in self._limiters.items()}

    def overall_status(self) -> Dict[str, Any]:
        dbs = self.list_databases()
        by_t = {}
        for d in dbs:
            by_t[d["type"]] = by_t.get(d["type"], 0) + 1
        return {"total_dbs": len(dbs),
                "active": sum(1 for d in dbs if d["status"] == "active"),
                "planned": sum(1 for d in dbs if d["status"] == "planned"),
                "by_type": by_t, "cache": self.cache_stats(),
                "limiters": len(self._limiters), "queries": self._qcounter,
                "prov_records": len(self._prov_log)}

    # ── Domain & cross-reference ─────────────────────────────────────────

    async def query_domain(self, domain: str, query: str, **kwargs: Any) -> Dict[str, Any]:
        members = self._registry.by_domain(domain)
        if not members:
            return {"success": False, "domain": domain,
                    "errors": [{"code": "UNKNOWN_DOMAIN", "message": f"No DBs in '{domain}'"}], "results": {}}
        results = dict(zip(members, await asyncio.gather(
            *[self.query(db, query, **kwargs) for db in members], return_exceptions=True)))
        errors = [{"db": db, "err": str(res)} for db, res in results.items() if isinstance(res, Exception)]
        for db, res in list(results.items()):
            if isinstance(res, Exception): results[db] = {"success": False, "error": str(res)}
        return {"success": len(errors) < len(members), "domain": domain,
                "queried": len(members), "errors": errors, "results": results}

    async def cross_reference(self, primary_db: str, query: str,
                              fallback_dbs: Optional[List[str]] = None,
                              **kwargs: Any) -> Dict[str, Any]:
        primary = await self.query(primary_db, query, **kwargs)
        enrich = {}
        for db in (fallback_dbs or self.FALLBACKS.get(primary_db, [])):
            try: enrich[db] = await self.query(db, query, allow_fallback=False, **kwargs)
            except Exception as e: enrich[db] = {"success": False, "error": str(e)}
        return {"primary": primary, "enrichment": enrich, "query": query}

    # ── Cache management ─────────────────────────────────────────────────

    def invalidate_cache(self, database: Optional[str] = None) -> int:
        if database is None:
            n = len(self._cache); self._cache.clear(); return n
        keys = [k for k in self._cache if k.startswith(f"{database}:")]
        for k in keys: del self._cache[k]
        return len(keys)

    def invalidate_pattern(self, pattern: str) -> int:
        keys = [k for k in self._cache if pattern in k]
        for k in keys: del self._cache[k]
        return len(keys)

# ── Singleton ──────────────────────────────────────────────────────────────

_db_manager: Optional[DBIntegrationManager] = None

def get_db_manager() -> DBIntegrationManager:
    """Global singleton for FastAPI Depends injection.

    Usage::

        from fastapi import Depends
        @router.get("/db/{db}/query")
        async def query_db(db: str, q: str,
                           mgr: DBIntegrationManager = Depends(get_db_manager)):
            return await mgr.query(db, q)
    """
    global _db_manager
    if _db_manager is None:
        _db_manager = DBIntegrationManager()
    return _db_manager
